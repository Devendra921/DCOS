import { WidgetBody, WidgetLabel } from '../../../shared/components/ux/WidgetBody';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Bell, BellOff, CalendarCheck, Network, PieChart, ShieldCheck, Siren, Snowflake, Wrench } from 'lucide-react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { ViewSwitcher } from '../../../shared/components/ux/ViewSwitcher';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty, KV, Panel, PanelLink } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { Donut } from '../../../ops/charts/Donut';
import { BarList } from '../../../ops/charts/BarList';
import { incidentStats, slaState, fmtDuration } from '../lib/sla';
import type {
  Incident, ChangeRequest, ManagedDevice, Alarm, MaintenanceWindow, CoolingZone, DataCenter,
} from '../../../mock/data/types';

const NOW = Date.now();
const SEV_DONUT: Record<string, string> = { SEV1: '#fca5a5', SEV2: '#fdba74', SEV3: '#fcd34d', SEV4: '#cbd5e1' };
const ALM_DONUT: Record<string, string> = { Critical: '#fca5a5', Major: '#fdba74', Minor: '#93c5fd', Warning: '#fcd34d', Info: '#cbd5e1' };
const SEV_TONE: Record<string, Tone> = { SEV1: 'error', SEV2: 'orange', SEV3: 'warning', SEV4: 'neutral', P1: 'error', P2: 'orange', P3: 'warning', P4: 'neutral' };
const ALM_TONE: Record<string, Tone> = { Critical: 'error', Major: 'orange', Minor: 'info', Warning: 'warning', Info: 'neutral' };
const REACH_TONE: Record<string, Tone> = { Reachable: 'success', Degraded: 'warning', Unreachable: 'error' };
const REACH_BAR: Record<string, string> = { Reachable: '#6ee7b7', Degraded: '#fcd34d', Unreachable: '#fca5a5' };
const MW_TONE: Record<string, Tone> = { 'Scheduled': 'info', 'In Progress': 'warning', 'Completed': 'success', 'Cancelled': 'neutral' };
const coolColor = (pct: number) => (pct < 10 ? '#fca5a5' : pct < 20 ? '#fdba74' : '#6ee7b7');

function ago(iso?: string): string {
  if (!iso) return '—';
  const ms = NOW - new Date(iso).getTime();
  const d = Math.floor(ms / 864e5); if (d > 0) return `${d}d ago`;
  const h = Math.floor(ms / 36e5); if (h > 0) return `${h}h ago`;
  const m = Math.floor(ms / 6e4); return m > 0 ? `${m}m ago` : 'just now';
}

type TriageRow = { id: string; i: Incident; sla: ReturnType<typeof slaState> };

export default function OperationsHubPage() {
  const navigate = useNavigate();
  const incidents = (useEntityList('incidents', { pageSize: 500 }).data?.data ?? []) as unknown as Incident[];
  const changes = (useEntityList('changeRequests', { pageSize: 500 }).data?.data ?? []) as unknown as ChangeRequest[];
  const devices = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const alarms = (useEntityList('alarms', { pageSize: 2000 }).data?.data ?? []) as unknown as Alarm[];
  const maint = (useEntityList('maintenanceWindows', { pageSize: 500 }).data?.data ?? []) as unknown as MaintenanceWindow[];
  const cooling = (useEntityList('coolingZones', { pageSize: 2000 }).data?.data ?? []) as unknown as CoolingZone[];
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];

  const m = useMemo(() => {
    const stats = incidentStats(incidents, NOW);
    const devName = Object.fromEntries(devices.map((d) => [d.id, d.hostname]));
    const dcName = Object.fromEntries(dcs.map((d) => [d.id, d.code || d.name]));

    // Triage: open incidents breaching SLA OR SEV1, worst first.
    const triage = incidents
      .filter((i) => !['Resolved', 'Closed'].includes(i.status))
      .map((i) => ({ i, sla: slaState(i, NOW) }))
      .filter((x) => x.sla.breached || x.i.severity === 'SEV1')
      .sort((a, b) => (a.i.severity.localeCompare(b.i.severity)) || (a.sla.resolveRemainingMins - b.sla.resolveRemainingMins));

    // Active alarms (uncleared) — critical/major surfaced for triage.
    const active = alarms.filter((a) => a.state === 'Active');
    const critMajor = active.filter((a) => a.severity === 'Critical' || a.severity === 'Major')
      .sort((a, b) => a.severity.localeCompare(b.severity) || (b.raisedAt > a.raisedAt ? 1 : -1));

    // Devices
    const reach = ['Reachable', 'Degraded', 'Unreachable'].map((r) => ({ type: r, value: devices.filter((d) => d.reachability === r).length }));
    const unreachable = reach.find((r) => r.type === 'Unreachable')?.value ?? 0;

    // Changes in flight
    const inFlight = changes.filter((c) => ['Scheduled', 'InProgress'].includes(c.status))
      .sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''));

    // Maintenance — active now or upcoming within 14 days
    const horizon = NOW + 14 * 864e5;
    const upcomingMw = maint
      .filter((w) => ['Scheduled', 'In Progress'].includes(w.status) && new Date(w.scheduledStart).getTime() <= horizon)
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
    const mwNext7 = maint.filter((w) => ['Scheduled', 'In Progress'].includes(w.status) && new Date(w.scheduledStart).getTime() <= NOW + 7 * 864e5).length;

    // Cooling headroom by DC (min across that DC's zones)
    const byDc = new Map<string, { cap: number; head: number }>();
    for (const z of cooling) {
      const cur = byDc.get(z.dataCenterId) ?? { cap: 0, head: 0 };
      cur.cap += z.coolingCapacityKw; cur.head += z.headroomKw; byDc.set(z.dataCenterId, cur);
    }
    const coolingByDc = Array.from(byDc.entries())
      .map(([id, v]) => ({ dc: dcName[id] ?? id, pct: v.cap ? Math.round((v.head / v.cap) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct);
    const coolingWarn = coolingByDc.filter((c) => c.pct < 10).length;

    // Donuts
    const incBySev = ['SEV1', 'SEV2', 'SEV3', 'SEV4']
      .map((s) => ({ type: s, value: incidents.filter((i) => i.severity === s && !['Resolved', 'Closed'].includes(i.status)).length }))
      .filter((x) => x.value > 0);
    const almBySev = ['Critical', 'Major', 'Minor', 'Warning', 'Info']
      .map((s) => ({ type: s, value: active.filter((a) => a.severity === s).length }))
      .filter((x) => x.value > 0);

    return { stats, triage, critMajor, activeAlarms: active.length, reach, unreachable, inFlight, upcomingMw, mwNext7, coolingByDc, coolingWarn, incBySev, almBySev, devName };
  }, [incidents, changes, devices, alarms, maint, cooling, dcs]);

  const triageRows: TriageRow[] = m.triage.map((x) => ({ id: x.i.id, ...x }));
  const triageCols: Col<TriageRow>[] = [
    { key: 'inc', header: 'Incident', sort: (r) => r.i.incId, wrap: true, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.i.title}</span><small className="mono">{r.i.incId}</small></span>
    ) },
    { key: 'sev', header: 'Sev', sort: (r) => r.i.severity, render: (r) => <span className="row" style={{ gap: 4 }}><Chip tone={SEV_TONE[r.i.severity] ?? 'neutral'} size="xs">{r.i.severity}</Chip>{r.i.priority && <Chip tone={SEV_TONE[r.i.priority] ?? 'neutral'} size="xs">{r.i.priority}</Chip>}</span> },
    { key: 'status', header: 'Status', sort: (r) => r.i.status, render: (r) => <Chip tone="neutral" dot>{r.i.status}</Chip> },
    { key: 'sla', header: 'Resolve SLA', sort: (r) => r.sla.resolveRemainingMins, render: (r) => r.sla.resolveBreached
      ? <b className="num" style={{ color: 'var(--vw-color-red-600)', fontWeight: 600 }}>Overdue {fmtDuration(r.sla.resolveRemainingMins)}</b>
      : <span className="num" style={{ color: r.sla.resolveRemainingMins < 60 ? 'var(--vw-color-orange-700)' : undefined }}>{fmtDuration(r.sla.resolveRemainingMins)} left</span> },
    { key: 'owner', header: 'Owner', sort: (r) => r.i.assignee ?? '', render: (r) => r.i.assignee ?? <span className="vw-label">Unassigned</span> },
  ];

  const s = m.stats;
  const inProgress = m.inFlight.filter((c) => c.status === 'InProgress').length;
  return (
    <OpsPage title="Operations" description="Live operational status — incidents, SLAs, maintenance and the people on shift."
      actions={<><PageDcScopeSelect /><ViewSwitcher /></>}>

      <StatGrid>
        <StatTile label="Open incidents" value={s.open} sub={`${s.unacknowledged} unacknowledged`} subTone={s.unacknowledged ? 'warn' : undefined}>
          <Split parts={m.incBySev.map((d) => ({ key: d.type, label: d.type, n: d.value, tone: SEV_TONE[d.type] ?? 'neutral' }))} />
        </StatTile>
        <StatTile label="SLA breaching" value={s.breaching} sub={s.breaching ? 'open incidents past SLA' : 'all within SLA'} subTone={s.breaching ? 'bad' : undefined} />
        <StatTile label="Active crit/major alarms" value={m.critMajor.length} sub={`${m.activeAlarms} active alarms in total`} subTone={m.critMajor.length ? 'bad' : undefined}>
          <Split parts={m.almBySev.map((d) => ({ key: d.type, label: d.type, n: d.value, tone: ALM_TONE[d.type] ?? 'neutral' }))} />
        </StatTile>
        <StatTile label="Devices unreachable" value={m.unreachable} sub={`of ${devices.length} managed devices`} subTone={m.unreachable ? 'warn' : undefined}>
          <Split parts={m.reach.map((r) => ({ key: r.type, label: r.type, n: r.value, tone: REACH_TONE[r.type] }))} />
        </StatTile>
        <StatTile label="Changes in flight" value={m.inFlight.length} sub={`${inProgress} in progress · ${m.inFlight.length - inProgress} scheduled`} />
        <StatTile label="Maintenance (next 7d)" value={m.mwNext7} sub={`${m.upcomingMw.length} windows in the next 14 days`} />
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title="SLA-breaching & SEV1 incidents" sub="Open incidents past SLA or at SEV1, worst first" icon={Siren} count={m.triage.length} flush
          actions={<PanelLink onClick={() => navigate('/incidents')}>All incidents</PanelLink>}>
          <DataTable rows={triageRows} cols={triageCols} compact pageSize={50} maxHeight={340} onRow={(r) => navigate(`/incidents/${r.i.id}`)}
            empty={<Empty icon={ShieldCheck} title="Within SLA">No breaching or SEV1 incidents.</Empty>} />
        </Panel>
        <Panel title="Active critical / major alarms" sub="Newest first within severity" icon={Bell} count={m.critMajor.length} flush
          actions={<PanelLink onClick={() => navigate('/nms/alarms')}>Console</PanelLink>}>
          {m.critMajor.length === 0 ? <Empty icon={BellOff} title="No active critical alarms" /> : (
            <WidgetBody label="Critical alarms" height={340} className="board">
              {m.critMajor.slice(0, 8).map((al) => (
                <Link key={al.id} to="/nms/alarms" className="board-row" style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto' }}>
                  <Chip tone={ALM_TONE[al.severity] ?? 'neutral'} size="xs">{al.severity}</Chip>
                  <div style={{ minWidth: 0 }}>
                    <WidgetLabel className="t">{al.type}</WidgetLabel>
                    <div className="m"><span className="mono">{m.devName[al.deviceId] ?? 'device'}</span><span>·</span><span>{al.incidentId ? 'linked to incident' : 'no incident'}</span></div>
                  </div>
                  <span className="vw-label">{ago(al.raisedAt)}</span>
                </Link>
              ))}
            </WidgetBody>
          )}
        </Panel>
      </div>

      <div className="grid g-3">
        <Panel title="Open incidents by severity" sub={`${s.open} open`} icon={PieChart}>
          {m.incBySev.length
            ? <Donut slices={m.incBySev.map((d) => ({ key: d.type, label: d.type, value: d.value, color: SEV_DONUT[d.type] ?? '#cbd5e1' }))} centerLabel="open" />
            : <Empty icon={ShieldCheck} title="No open incidents" />}
          <div style={{ marginTop: 12 }}>
            <KV cols={2} items={[
              ['Mean MTTR', <span className="num">{s.mttrMins != null ? fmtDuration(s.mttrMins) : '—'}</span>],
              ['SLA compliance', <span className="num" style={{ color: s.slaCompliancePct >= 90 ? 'var(--vw-color-green-600)' : s.slaCompliancePct >= 75 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)' }}>{s.slaCompliancePct}%</span>],
              ['Unacknowledged', <span className="num" style={{ color: s.unacknowledged ? 'var(--vw-color-orange-700)' : undefined }}>{s.unacknowledged}</span>],
              ['Resolved (total)', <span className="num">{s.resolved}</span>],
            ]} />
          </div>
        </Panel>
        <Panel title="Active alarms by severity" sub={`${m.activeAlarms} active`} icon={Bell}>
          {m.almBySev.length
            ? <Donut slices={m.almBySev.map((d) => ({ key: d.type, label: d.type, value: d.value, color: ALM_DONUT[d.type] ?? '#cbd5e1' }))} centerLabel="active" />
            : <Empty icon={BellOff} title="No active alarms" />}
        </Panel>
        <Panel title="Device reachability" sub={`${devices.length} devices`} icon={Network}>
          <BarList items={m.reach.map((r) => ({ key: r.type, label: r.type, value: r.value, color: REACH_BAR[r.type] }))} />
        </Panel>
      </div>

      <div className="grid g-3">
        <Panel title="Cooling headroom by DC" sub={m.coolingWarn ? `${m.coolingWarn} below 10%` : 'all healthy'} icon={Snowflake} count={m.coolingByDc.length || undefined}>
          {m.coolingByDc.length === 0 ? <Empty icon={Snowflake} title="No cooling data" />
            : <BarList max={100} items={m.coolingByDc.slice(0, 7).map((c) => ({ key: c.dc, label: c.dc, value: c.pct, display: `${c.pct}%`, color: coolColor(c.pct) }))} />}
        </Panel>
        <Panel title="Changes in flight" sub="Scheduled and in progress" icon={ArrowLeftRight} count={m.inFlight.length} flush
          actions={<PanelLink onClick={() => navigate('/change')}>Queue</PanelLink>}>
          {m.inFlight.length === 0 ? <Empty icon={ArrowLeftRight} title="No changes in flight" /> : (
            <WidgetBody label="Changes in flight" height={320} className="board">
              {m.inFlight.slice(0, 7).map((c) => (
                <Link key={c.id} to={`/change/${c.id}`} className="board-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                  <div style={{ minWidth: 0 }}>
                    <WidgetLabel className="t">{c.title}</WidgetLabel>
                    <div className="m"><span>{c.type}</span><span>·</span><span>risk {c.risk}</span></div>
                  </div>
                  <Chip tone={c.status === 'InProgress' ? 'warning' : 'info'} size="xs" dot>{c.status}</Chip>
                </Link>
              ))}
            </WidgetBody>
          )}
        </Panel>
        <Panel title="Upcoming maintenance" sub="Active now or starting within 14 days" icon={Wrench} count={m.upcomingMw.length} flush>
          {m.upcomingMw.length === 0 ? <Empty icon={CalendarCheck} title="No maintenance scheduled" /> : (
            <WidgetBody label="Upcoming maintenance" height={320} className="board">
              {m.upcomingMw.slice(0, 7).map((w) => {
                const body = (
                  <>
                    <div style={{ minWidth: 0 }}>
                      <WidgetLabel className="t">{w.title}</WidgetLabel>
                      <div className="m"><span className="mono">{w.scheduledStart.slice(0, 16).replace('T', ' ')}</span><span>·</span><span>{w.impact}</span></div>
                    </div>
                    <Chip tone={MW_TONE[w.status] ?? 'neutral'} size="xs" dot>{w.status}</Chip>
                  </>
                );
                return w.changeRequestId
                  ? <Link key={w.id} to={`/change/${w.changeRequestId}`} className="board-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>{body}</Link>
                  : <div key={w.id} className="board-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>{body}</div>;
              })}
            </WidgetBody>
          )}
        </Panel>
      </div>
    </OpsPage>
  );
}
