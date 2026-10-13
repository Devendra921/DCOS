import { WidgetBody, WidgetLabel } from '../../../shared/components/ux/WidgetBody';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import { BarChart3, BellOff, Flame, Network, SlidersHorizontal, Zap } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';
import { TimeChart } from '../../../ops/charts/TimeChart';
import { useEntityList, useEntityUpdate, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { sevToIncident } from '../components/nmsUtil';
import { alarmStats, alarmTrend, correlationGroups, alarmAgeMins, fmtAge, isFlapping, SEV_ORDER, type FaultGroup } from '../lib/fault';
import { SLA_TARGETS } from '../../operations/lib/sla';
import type { Alarm, ManagedDevice, AlarmRule } from '../../../mock/data/types';
import type { Severity } from '../../../mock/data/enums';

const SEV_TO_PRI = { SEV1: 'P1', SEV2: 'P2', SEV3: 'P3', SEV4: 'P4' } as const;
const SEV_TONE: Record<string, Tone> = { Critical: 'error', Major: 'orange', Minor: 'warning', Warning: 'info', Info: 'neutral' };
const SEV_COLOR: Record<string, string> = {
  Critical: 'var(--vw-color-red-500)', Major: 'var(--vw-color-orange-500)', Minor: 'var(--vw-color-amber-400)',
  Warning: 'var(--primaryColor300)', Info: 'var(--vw-color-slate-300)',
};
const STATES = ['Active', 'Acknowledged', 'Cleared', 'All'];

export default function AlarmConsolePage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const alarms = (useEntityList('alarms', { pageSize: 2000 }).data?.data ?? []) as unknown as Alarm[];
  const devices = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const rules = (useEntityList('alarmRules', { pageSize: 100 }).data?.data ?? []) as unknown as AlarmRule[];
  const update = useEntityUpdate('alarms');
  const createIncident = useEntityCreate('incidents');
  const audit = useRecordAudit();
  const [filter, setFilter] = useState<string>('Active');
  const [sevF, setSevF] = useState('');
  const [q, setQ] = useState('');

  const devName = useMemo(() => Object.fromEntries(devices.map((d) => [d.id, d.hostname])), [devices]);
  const ruleName = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.name])), [rules]);
  const stats = useMemo(() => alarmStats(alarms), [alarms]);
  const trend = useMemo(() => alarmTrend(alarms), [alarms]);
  const groups = useMemo(() => correlationGroups(alarms), [alarms]);
  const inState = useMemo(() => alarms.filter((a) => filter === 'All' ? true : a.state === filter)
    .sort((a, b) => alarmAgeMins(b) - alarmAgeMins(a)), [alarms, filter]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return inState.filter((a) => (!sevF || a.severity === sevF)
      && (!s || `${a.almId} ${devName[a.deviceId] ?? a.deviceId} ${a.type} ${a.ruleId ? ruleName[a.ruleId] ?? '' : 'event'}`.toLowerCase().includes(s)));
  }, [inState, sevF, q, devName, ruleName]);

  const ack = (a: Alarm) => update.mutate({ id: a.id, data: { state: 'Acknowledged', acknowledgedAt: new Date().toISOString() } },
    { onSuccess: () => { message.success(`${a.almId} acknowledged`); audit('Alarm', a.almId, 'acknowledged', a.type); } });
  const clear = (a: Alarm) => update.mutate({ id: a.id, data: { state: 'Cleared', clearedAt: new Date().toISOString() } },
    { onSuccess: () => { message.success(`${a.almId} cleared`); audit('Alarm', a.almId, 'cleared', a.type); } });

  const makeIncident = (deviceId: string, sevName: string, title: string, alarmIds: string[]) => {
    const now = new Date().toISOString();
    const sev = sevToIncident(sevName) as Severity;
    const t = SLA_TARGETS[sev];
    createIncident.mutate({
      incId: `INC-NMS-${Date.now().toString().slice(-4)}`, title, type: 'Network', severity: sev,
      status: 'Open', priority: SEV_TO_PRI[sev], affectedResourceType: 'Asset', affectedResourceIds: [deviceId], detectedAt: now,
      slaResponseMins: t.responseMins, slaResolveMins: t.resolveMins, reportedBy: 'Monitoring System', linkedAlarmIds: alarmIds,
      worklog: [{ at: now, author: 'Monitoring', kind: 'StatusChange', text: `Raised from ${alarmIds.length} correlated alarm(s) on ${devName[deviceId] ?? 'device'}.` }],
      customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'NOC', createdById: 'noc',
    }, {
      onSuccess: (rec: Record<string, unknown>) => {
        alarmIds.forEach((id) => update.mutate({ id, data: { incidentId: rec.id as string } }));
        message.success('Incident raised'); audit('Alarm', alarmIds[0], 'promoted to incident', title);
        navigate(`/incidents/${rec.id as string}`);
      },
    });
  };
  const promoteGroup = (g: FaultGroup) => makeIncident(g.deviceId, g.maxSeverity, `${devName[g.deviceId] ?? 'Device'} — ${g.members.length} correlated alarms`, g.members.map((m) => m.id));

  const cols: Col<Alarm>[] = [
    { key: 'sev', header: 'Severity', sort: (a) => SEV_ORDER.indexOf(a.severity as typeof SEV_ORDER[number]), render: (a) => <Chip tone={SEV_TONE[a.severity] ?? 'neutral'} dot>{a.severity}</Chip> },
    { key: 'dev', header: 'Device', sort: (a) => devName[a.deviceId] ?? a.deviceId, render: (a) => (
      <span className="cell-2"><span className="vw-card-activity-label">{devName[a.deviceId] ?? a.deviceId}</span><small className="mono">{a.almId}</small></span>
    ) },
    { key: 'type', header: 'Alarm', sort: (a) => a.type, render: (a) => (
      <span className="cell-2"><span>{a.type}</span><small>{a.ruleId ? ruleName[a.ruleId] ?? 'rule' : 'event'}</small></span>
    ) },
    { key: 'age', header: 'Age', align: 'right', sort: (a) => alarmAgeMins(a), render: (a) => <span className="num">{fmtAge(alarmAgeMins(a))}</span> },
    { key: 'occ', header: 'Occurrences', sort: (a) => a.count ?? 1, render: (a) => (
      <span className="row" style={{ gap: 6 }}>
        <span className="num">×{a.count ?? 1}</span>
        {isFlapping(a) && <Chip tone="warning" size="xs" title={`Flapped ${a.flapCount} times`}>flapping</Chip>}
      </span>
    ) },
    { key: 'corr', header: 'Correlation', render: (a) => a.correlationId
      ? <Chip tone="purple" size="xs">storm{a.incidentId ? ' · INC' : ''}</Chip>
      : a.incidentId ? <Chip tone="purple" size="xs">INC</Chip> : <span className="vw-label">—</span> },
    { key: 'x', header: '', render: (a) => (
      <span className="row" style={{ gap: 4 }} onClick={(e) => e.stopPropagation()}>
        {a.state === 'Active' && <Btn size="xs" onClick={() => ack(a)}>Ack</Btn>}
        {a.state !== 'Cleared' && <Btn size="xs" onClick={() => clear(a)}>Clear</Btn>}
        {!a.incidentId && a.state !== 'Cleared' && <Btn size="xs" variant="action" onClick={() => makeIncident(a.deviceId, a.severity, `${devName[a.deviceId] ?? 'Device'} — ${a.type}`, [a.id])}>→ Incident</Btn>}
      </span>
    ) },
  ];

  const ruleCols: Col<AlarmRule>[] = [
    { key: 'name', header: 'Rule', sort: (r) => r.name, render: (r) => <span className="vw-card-activity-label">{r.name}</span> },
    { key: 'cond', header: 'Condition', render: (r) => <span className="mono">{r.metric} {r.operator} {r.threshold}{r.metric === 'Temperature' ? '°C' : '%'} · {r.durationMins}m</span> },
    { key: 'sev', header: 'Severity', sort: (r) => r.severity, render: (r) => <Chip tone={SEV_TONE[r.severity] ?? 'neutral'}>{r.severity}</Chip> },
    { key: 'scope', header: 'Scope', sort: (r) => r.scope, render: (r) => <span className="vw-label">{r.scope}</span> },
    { key: 'state', header: 'State', sort: (r) => (r.enabled ? 1 : 0), render: (r) => r.enabled ? <Chip tone="success" dot>enabled</Chip> : <Chip tone="neutral" dot>off</Chip> },
  ];

  const days = Array.from(new Set(trend.map((t) => t.day)));
  const series = SEV_ORDER.map((sev) => ({
    key: sev, label: sev, color: SEV_COLOR[sev], kind: 'bar' as const, stack: 'sev',
    values: days.map((d) => trend.find((t) => t.day === d && t.severity === sev)?.value ?? 0),
  }));
  const sevParts = stats.bySeverity.map((s) => ({ key: s.severity, label: s.severity, n: s.n, tone: SEV_TONE[s.severity] ?? 'neutral' }));

  return (
    <OpsPage title="Alarms" description="Live faults, correlated storms and the threshold rules that raise them">

      <StatGrid>
        <StatTile label="Active crit/major" value={stats.critMajor} sub={stats.critMajor ? 'need attention now' : 'none open'} subTone={stats.critMajor ? 'bad' : undefined}>
          <Split parts={sevParts} onPick={(k) => { setFilter('Active'); setSevF(sevF === k ? '' : k); }} active={sevF} />
        </StatTile>
        <StatTile label="Total active" value={stats.totalActive} sub="raised and not acknowledged" onClick={() => setFilter('Active')} active={filter === 'Active'} />
        <StatTile label="Correlated storms" value={stats.storms} sub={stats.storms ? 'groups of related alarms' : 'no storms'} subTone={stats.storms ? 'warn' : undefined} />
        <StatTile label="Flapping" value={stats.flapping} sub="flapped 3+ times" subTone={stats.flapping ? 'warn' : undefined} />
        <StatTile label="Mean ack time" value={stats.mttaMins != null ? fmtAge(stats.mttaMins) : '—'} sub="raised to acknowledged" />
        <StatTile label="Acknowledged" value={stats.acknowledged} sub="being worked" onClick={() => setFilter('Acknowledged')} active={filter === 'Acknowledged'} />
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title="Alarms raised by severity" sub="Alarm volume · last 14 days" icon={BarChart3}>
          <TimeChart labels={days} series={series} height={220} yMin={0} />
        </Panel>
        <Panel title="Correlated fault storms" sub="Active alarms sharing a correlation" icon={Network} count={groups.length}>
          {groups.length === 0 ? <Empty icon={BellOff} title="No correlated storms" /> : (
            <WidgetBody label="Correlated fault storms" height={320} className="col">
              {groups.slice(0, 8).map((g) => (
                <div key={g.id} className="col" style={{ gap: 6, paddingBottom: 12, borderBottom: '1px solid var(--vw-color-slate-100)' }}>
                  <div className="row between">
                    <WidgetLabel className="strong">{devName[g.deviceId] ?? g.deviceId}</WidgetLabel>
                    <Chip tone={SEV_TONE[g.maxSeverity] ?? 'neutral'} dot>{g.members.length} alarms</Chip>
                  </div>
                  <span className="vw-label">{g.types.slice(0, 3).join(' · ')}</span>
                  <Btn size="xs" variant="action" icon={Zap} block onClick={() => promoteGroup(g)}>Promote storm → incident</Btn>
                </div>
              ))}
            </WidgetBody>
          )}
        </Panel>
      </div>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} onRow={(a) => navigate(`/nms/devices/${a.deviceId}`)} defaultSort={{ key: 'age', dir: 'desc' }} pageSize={30}
          empty={<Empty icon={BellOff} title="No alarms">Nothing matches this state and filter.</Empty>}
          toolbar={
            <ListToolbar shown={rows.length} total={alarms.length} noun="alarms"
              search={{ value: q, onChange: setQ, placeholder: 'Device, alarm, rule' }}
              filters={[
                { id: 'state', label: 'State', quick: true, value: filter, defaultValue: 'Active', onChange: (v) => setFilter(v || 'Active'),
                  options: STATES.map((s) => ({ id: s, label: s, count: s === 'All' ? alarms.length : alarms.filter((a) => a.state === s).length })) },
                { id: 'severity', label: 'Severity', quick: true, value: sevF, anyLabel: 'Any severity', onChange: setSevF,
                  options: SEV_ORDER.map((s) => ({ id: s, label: s, count: inState.filter((a) => a.severity === s).length })) },
              ]} />
          } />
      </section>

      <div className="grid g-2-1">
        <Panel title="Alarm rules" sub="Thresholds that raise faults" icon={SlidersHorizontal} count={rules.length} flush>
          <DataTable rows={rules} cols={ruleCols} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={20} />
        </Panel>
        <Panel title="Top alarming devices" sub="Active alarms · click to open the device" icon={Flame}>
          {stats.topDevices.length === 0 ? <Empty icon={BellOff} title="Quiet — no active alarms" /> : (
            <BarList items={stats.topDevices.map((d) => ({
              key: d.deviceId, label: devName[d.deviceId] ?? d.deviceId, sublabel: d.maxSeverity, value: d.n,
              color: SEV_COLOR[d.maxSeverity], onClick: () => navigate(`/nms/devices/${d.deviceId}`),
            }))} />
          )}
        </Panel>
      </div>
    </OpsPage>
  );
}
