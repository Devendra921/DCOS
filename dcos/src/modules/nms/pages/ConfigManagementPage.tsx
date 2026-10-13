import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Typography, Drawer, Space } from 'antd';
import { FileClock, FileDiff, LineChart, ShieldCheck } from 'lucide-react';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { CheckCircleFilled, CloseCircleFilled, RollbackOutlined } from '../../../shared/icons';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Meter } from '../../../ops/ui/status';
import { SoftMeter, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';
import { TimeChart } from '../../../ops/charts/TimeChart';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { configFleet, buildDeviceConfig, complianceTrend, complianceColor, type FleetRow } from '../lib/config';
import type { ManagedDevice, Interface, ConfigChange } from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';

const { Text } = Typography;
const CFG_TONE: Record<string, Tone> = { Planned: 'info', Approved: 'success', Pushed: 'cyan', Verified: 'success', Failed: 'error', RolledBack: 'error' };
type DeviceRow = FleetRow & { id: string };

export default function ConfigManagementPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const devices = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const ifaces = (useEntityList('interfaces', { pageSize: 10000 }).data?.data ?? []) as unknown as Interface[];
  const changes = (useEntityList('configChanges', { pageSize: 200 }).data?.data ?? []) as unknown as ConfigChange[];
  const createCR = useEntityCreate('changeRequests');
  const createCfg = useEntityCreate('configChanges');
  const audit = useRecordAudit();
  const [sel, setSel] = useState<ManagedDevice | null>(null);

  const ifByDevice = useMemo(() => {
    const m = new Map<string, Interface[]>();
    for (const i of ifaces) { const a = m.get(i.deviceId) ?? []; a.push(i); m.set(i.deviceId, a); }
    return m;
  }, [ifaces]);
  const fleet = useMemo(() => configFleet(devices, ifByDevice), [devices, ifByDevice]);
  const trend = useMemo(() => complianceTrend(fleet), [fleet]);
  const selCfg = useMemo(() => sel ? buildDeviceConfig(sel, ifByDevice.get(sel.id) ?? []) : null, [sel, ifByDevice]);

  const raiseChange = (dev: ManagedDevice, title: string, diff: string) => {
    const now = new Date().toISOString();
    createCR.mutate({
      chgId: `CHG-CFG-${Date.now().toString().slice(-4)}`, title, type: 'ConfigPush', description: `Governed device config change on ${dev.hostname}.`,
      risk: 'Medium', status: 'Submitted', priority: 'Medium', affectedResourceType: 'Asset', affectedResourceIds: [dev.id],
      requestedBy: 'NetEng', requestedById: 'neteng', policyViolations: [], customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'NetEng', createdById: 'neteng',
    }, {
      onSuccess: (cr: Record<string, unknown>) => {
        createCfg.mutate({ cfgchgId: `CFGCHG-${Date.now().toString().slice(-4)}`, deviceId: dev.id, changeRequestId: cr.id as string, diff, status: 'Planned', driftDetected: false, customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'NetEng', createdById: 'neteng' });
        audit('ChangeRequest', cr.chgId as string, 'config change raised', title);
        message.success('Governed change raised — routed through approval'); navigate(`/change/${cr.id as string}`);
      },
    });
  };
  const restoreGolden = (dev: ManagedDevice) => {
    const cfg = buildDeviceConfig(dev, ifByDevice.get(dev.id) ?? []);
    const diff = cfg.unified.filter((l) => l.tag !== 'ctx').map((l) => (l.tag === 'add' ? '- ' : '+ ') + l.text).join('\n');
    raiseChange(dev, `Restore golden config — ${dev.hostname}`, diff || '! already in sync with golden');
  };

  const [q, setQ] = useState('');
  const [driftF, setDriftF] = useState('');
  const [cq, setCq] = useState('');
  const [statusF, setStatusF] = useState('');
  const devName = useMemo(() => Object.fromEntries(devices.map((d) => [d.id, d.hostname])), [devices]);
  const fleetRows = useMemo<DeviceRow[]>(() => {
    const s = q.trim().toLowerCase();
    return fleet.rows.map((r) => ({ ...r, id: r.device.id }))
      .filter((r) => (!driftF || (driftF === 'drift' ? r.drift : !r.drift)) && (!s || `${r.device.hostname} ${r.device.role}`.toLowerCase().includes(s)));
  }, [fleet, q, driftF]);
  const changeRows = useMemo(() => {
    const s = cq.trim().toLowerCase();
    return changes.filter((c) => (!statusF || c.status === statusF) && (!s || `${c.cfgchgId} ${c.deviceId} ${devName[c.deviceId] ?? ''} ${c.status}`.toLowerCase().includes(s)));
  }, [changes, cq, statusF, devName]);
  const statuses = Array.from(new Set(changes.map((c) => c.status)));
  const failed = changes.filter((c) => c.status === 'Failed').length;

  const cols: Col<DeviceRow>[] = [
    { key: 'd', header: 'Device', sort: (r) => r.device.hostname, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.device.hostname}</span><small>{r.device.role}</small></span>
    ) },
    { key: 'drift', header: 'Drift', sort: (r) => r.driftCount, render: (r) => r.drift ? <Chip tone="error" dot>{r.driftCount} line{r.driftCount > 1 ? 's' : ''}</Chip> : <Chip tone="success" dot>in sync</Chip> },
    { key: 'comp', header: 'Compliance', sort: (r) => r.compliancePct, render: (r) => <Meter pct={r.compliancePct} width={96} color={complianceColor(r.compliancePct)} /> },
    { key: 'failed', header: 'Failed checks', align: 'right', sort: (r) => r.failedChecks, render: (r) => r.failedChecks ? <span className="num strong" style={{ color: 'var(--vw-color-red-600)' }}>{r.failedChecks}</span> : <span className="vw-label">—</span> },
    { key: 'x', header: '', render: (r) => <span onClick={(e) => e.stopPropagation()}><Btn size="xs" icon={FileDiff} onClick={() => setSel(r.device)}>Diff</Btn></span> },
  ];
  const changeCols: Col<ConfigChange>[] = [
    { key: 'id', header: 'ID', sort: (c) => c.cfgchgId, render: (c) => <span className="vw-card-activity-label mono">{c.cfgchgId}</span> },
    { key: 'dev', header: 'Device', sort: (c) => devName[c.deviceId] ?? c.deviceId, render: (c) => (
      <span className="cell-2"><span>{devName[c.deviceId] ?? c.deviceId}</span><small className="mono">{c.deviceId}</small></span>
    ) },
    { key: 'status', header: 'Status', sort: (c) => c.status, render: (c) => <Chip tone={CFG_TONE[c.status] ?? 'neutral'} dot>{c.status}</Chip> },
    { key: 'drift', header: 'Drift', sort: (c) => (c.driftDetected ? 1 : 0), render: (c) => c.driftDetected ? <Chip tone="error">drift</Chip> : <Chip tone="success">in sync</Chip> },
  ];

  const days = Array.from(new Set(trend.map((t) => t.day)));
  const series = [
    { key: 'c', label: 'Compliance %', color: 'var(--vw-color-emerald-500)', kind: 'line' as const, values: days.map((d) => trend.find((t) => t.day === d && t.series === 'Compliance %')?.value ?? 0) },
    { key: 'd', label: 'Drift devices', color: 'var(--vw-color-orange-500)', kind: 'line' as const, values: days.map((d) => trend.find((t) => t.day === d && t.series === 'Drift devices')?.value ?? 0) },
  ];

  return (
    <OpsPage title="Config Management" description="Running versus golden config, hardening compliance and governed config changes">

      <StatGrid>
        <StatTile label="In compliance" value={fleet.inCompliance} sub={`of ${fleet.rows.length} devices`}>
          <SoftMeter pct={fleet.rows.length ? (fleet.inCompliance / fleet.rows.length) * 100 : 0} tone="success" />
        </StatTile>
        <StatTile label="With drift" value={fleet.withDrift} sub={fleet.withDrift ? 'running differs from golden' : 'all in sync'} subTone={fleet.withDrift ? 'warn' : undefined}
          onClick={() => setDriftF(driftF === 'drift' ? '' : 'drift')} active={driftF === 'drift'} />
        <StatTile label="Mean compliance" value={<>{fleet.meanCompliancePct}<small>%</small></>} sub="hardening checks passed">
          <SoftMeter pct={fleet.meanCompliancePct} tone={fleet.meanCompliancePct >= 100 ? 'success' : fleet.meanCompliancePct >= 80 ? 'warning' : 'error'} />
        </StatTile>
        <StatTile label="Managed devices" value={fleet.rows.length} sub="under config management" />
        <StatTile label="Governed changes" value={changes.length} sub="routed through approval" />
        <StatTile label="Failed pushes" value={failed} sub={failed ? 'need a retry or rollback' : 'none failed'} subTone={failed ? 'bad' : undefined}
          onClick={() => setStatusF(statusF === 'Failed' ? '' : 'Failed')} active={statusF === 'Failed'} />
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title="Mean compliance & devices with drift" sub="Last 14 days" icon={LineChart}>
          <TimeChart labels={days} series={series} height={220} yMin={0} />
        </Panel>
        <Panel title="Compliance by check" sub="Share of devices passing" icon={ShieldCheck}>
          <BarList max={100} items={fleet.checkRollup.map((c) => ({ key: c.name, label: c.name, value: c.passPct, display: `${c.passPct}%`, color: complianceColor(c.passPct) }))} />
        </Panel>
      </div>

      <section className="vw-card-section dcl-table">
        <DataTable rows={fleetRows} cols={cols} onRow={(r) => setSel(r.device)} defaultSort={{ key: 'comp', dir: 'asc' }} pageSize={20}
          toolbar={
            <ListToolbar shown={fleetRows.length} total={fleet.rows.length} noun="devices · running vs golden"
              search={{ value: q, onChange: setQ, placeholder: 'Device or role' }}
              filters={[
                { id: 'drift', label: 'Drift', quick: true, value: driftF, anyLabel: 'Any drift state', onChange: setDriftF, options: [
                  { id: 'drift', label: 'With drift', count: fleet.rows.filter((r) => r.drift).length },
                  { id: 'sync', label: 'In sync', count: fleet.rows.filter((r) => !r.drift).length },
                ] },
              ]} />
          } />
      </section>

      <section className="vw-card-section dcl-table">
        <DataTable rows={changeRows} cols={changeCols} onRow={(c) => navigate(`/change/${c.changeRequestId}`)} defaultSort={{ key: 'id', dir: 'desc' }} pageSize={20}
          empty={<Empty icon={FileClock} title="No config changes" />}
          toolbar={
            <ListToolbar shown={changeRows.length} total={changes.length} noun="governed config changes"
              search={{ value: cq, onChange: setCq, placeholder: 'Change ID or device' }}
              filters={[
                { id: 'status', label: 'Status', quick: true, value: statusF, anyLabel: 'Any status', onChange: setStatusF, options: statuses.map((s) => ({ id: s, label: s, count: changes.filter((c) => c.status === s).length })) },
              ]} />
          } />
      </section>

      <Drawer mask={false} width={620} open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.hostname} · config` : ''}
        extra={sel && <Space>
          <Button icon={<RollbackOutlined />} onClick={() => restoreGolden(sel)}>Restore golden</Button>
          <Button type="primary" onClick={() => raiseChange(sel, `Config push — ${sel.hostname}`, '+ interface Ethernet1/5\n+  description uplink')}>Raise change</Button>
        </Space>}>
        {selCfg && (
          <>
            <div style={{ marginBottom: "var(--vw-space-lg)" }}>
              <Text strong>Hardening compliance</Text>
              <div style={{ marginTop: "var(--vw-space-sm)", display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                {selCfg.checks.map((c) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", fontSize: "var(--vw-font-label-md)" }}>
                    {c.pass ? <CheckCircleFilled style={{ color: 'var(--vw-color-green-600)' }} /> : <CloseCircleFilled style={{ color: 'var(--vw-color-red-600)' }} />}
                    <span style={{ color: c.pass ? '#515151' : 'var(--vw-color-red-600)' }}>{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <Text strong>Running vs golden {selCfg.drift ? <VwChip color="error" style={{ marginLeft: 6 }}>{selCfg.driftCount} drift lines</VwChip> : <VwChip color="success" style={{ marginLeft: 6 }}>in sync</VwChip>}</Text>
            <div style={{ marginTop: "var(--vw-space-sm)", border: '1px solid #eef2f6', borderRadius: "var(--vw-radius-sm)", overflow: 'hidden', fontSize: "var(--vw-font-label-sm)", lineHeight: '20px' }}>
              {selCfg.unified.map((l, i) => (
                <div key={i} style={{
                  display: 'flex', gap: "var(--vw-space-sm)", padding: '0 10px', whiteSpace: 'pre',
                  background: l.tag === 'add' ? '#ecfdf5' : l.tag === 'del' ? '#fef2f2' : 'transparent',
                  color: l.tag === 'add' ? '#047857' : l.tag === 'del' ? '#b91c1c' : '#515151',
                }}>
                  <span style={{ width: 12, color: '#a8a8a8', userSelect: 'none' }}>{l.tag === 'add' ? '+' : l.tag === 'del' ? '−' : ''}</span>
                  <span>{l.text}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Drawer>
    </OpsPage>
  );
}
