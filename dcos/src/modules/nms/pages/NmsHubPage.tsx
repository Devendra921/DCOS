import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, HeartPulse, Layers, PieChart, ServerCrash } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Meter } from '../../../ops/ui/status';
import { SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';
import { Donut } from '../../../ops/charts/Donut';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { fleetHealth, healthColor, bandOf, HEALTH_HEX, type DeviceHealth, type HealthBand } from '../lib/health';
import { alarmStats } from '../lib/fault';
import { perfSummary, utilColor } from '../lib/metrics';
import { configFleet, complianceColor } from '../lib/config';
import { reconcile, reconStats } from '../lib/discovery';
import type { ManagedDevice, Interface, Alarm, Device } from '../../../mock/data/types';

const BAND_TONE: Record<HealthBand, Tone> = { Healthy: 'success', Degraded: 'orange', Critical: 'error' };
const REACH_TONE: Record<string, Tone> = { Reachable: 'success', Degraded: 'warning', Unreachable: 'error' };

type WorstRow = DeviceHealth & { id: string };

export default function NmsHubPage() {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const alarms = (useEntityList('alarms', { pageSize: 2000 }).data?.data ?? []) as unknown as Alarm[];
  const managed = (useEntityList('managedDevices', { pageSize: 5000, filters: dcF }).data?.data ?? []) as unknown as ManagedDevice[];
  const ifaces = (useEntityList('interfaces', { pageSize: 10000 }).data?.data ?? []) as unknown as Interface[];
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];

  const m = useMemo(() => {
    const ifByDevice = new Map<string, Interface[]>();
    for (const i of ifaces) { const a = ifByDevice.get(i.deviceId) ?? []; a.push(i); ifByDevice.set(i.deviceId, a); }
    const fleet = configFleet(managed, ifByDevice);
    const health = fleetHealth(managed, alarms, ifByDevice, fleet.rows);
    const astats = alarmStats(alarms);
    const perf = perfSummary(ifaces);
    const findings = reconcile(devices, managed, fleet.rows);
    const recon = reconStats(managed, findings);
    const unreachable = managed.filter((d) => d.reachability === 'Unreachable').length;
    const critical = health.byBand.find((b) => b.band === 'Critical')?.n ?? 0;
    return { fleet, health, astats, perf, recon, unreachable, critical };
  }, [alarms, managed, ifaces, devices]);

  const band = bandOf(m.health.avg);
  const total = m.health.byBand.reduce((a, b) => a + b.n, 0);
  const bandParts = m.health.byBand.map((b) => ({ key: b.band, label: b.band, n: b.n, tone: BAND_TONE[b.band] }));
  const worst: WorstRow[] = m.health.worst.map((r) => ({ ...r, id: r.device.id }));

  const fabric: { label: string; value: React.ReactNode; tone?: Tone }[] = [
    { label: 'Managed devices', value: m.health.rows.length },
    { label: 'Management coverage', value: `${m.recon.coveragePct}%`, tone: m.recon.coveragePct >= 80 ? 'success' : 'orange' },
    { label: 'Unmanaged (to adopt)', value: m.recon.unmanaged, tone: m.recon.unmanaged ? 'purple' : undefined },
    { label: 'Reconciliation findings', value: m.recon.total, tone: m.recon.total ? 'orange' : undefined },
    { label: 'Devices with config drift', value: m.fleet.withDrift, tone: m.fleet.withDrift ? 'orange' : undefined },
    { label: 'Unreachable', value: m.unreachable, tone: m.unreachable ? 'error' : undefined },
    { label: 'Flapping alarms', value: m.astats.flapping, tone: m.astats.flapping ? 'orange' : undefined },
  ];

  const cols: Col<WorstRow>[] = [
    { key: 'd', header: 'Device', sort: (r) => r.device.hostname, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.device.hostname}</span><small>{r.device.role}</small></span>
    ) },
    { key: 'reach', header: 'Reach', sort: (r) => r.device.reachability, render: (r) => <Chip tone={REACH_TONE[r.device.reachability] ?? 'neutral'} dot>{r.device.reachability}</Chip> },
    { key: 'alarms', header: 'Alarms', align: 'right', sort: (r) => r.activeAlarms, render: (r) => r.activeAlarms
      ? <span className="num strong" style={{ color: r.critMajor ? 'var(--vw-color-red-600)' : 'var(--vw-color-orange-700)' }}>{r.activeAlarms}</span>
      : <span className="vw-label">—</span> },
    { key: 'util', header: 'Peak util', sort: (r) => r.maxUtil, render: (r) => <Meter pct={r.maxUtil} width={64} color={utilColor(r.maxUtil)} /> },
    { key: 'cfg', header: 'Config', sort: (r) => r.compliancePct, render: (r) => <Meter pct={r.compliancePct} width={64} color={complianceColor(r.compliancePct)} /> },
    { key: 'h', header: 'Health', sort: (r) => r.score, render: (r) => <Meter pct={r.score} width={80} color={healthColor(r.score)} label={String(r.score)} /> },
  ];

  return (
    <OpsPage title="Network Health" description="Fleet score, fabric tiers, alarms, utilisation and compliance in one view"
      actions={<Chip tone="success" dot>{m.health.rows.length} managed devices</Chip>}>

      <StatGrid>
        <StatTile label="Network health score" value={<>{m.health.avg}<small> / 100</small></>} sub={`${band} · ${m.health.rows.length} devices`} subTone={band === 'Critical' ? 'bad' : band === 'Degraded' ? 'warn' : undefined}>
          <Split parts={bandParts} legend={false} />
        </StatTile>
        <StatTile label="Critical devices" value={m.critical} sub={m.critical ? 'health score below 60' : 'none critical'} subTone={m.critical ? 'bad' : undefined} />
        <StatTile label="Active crit/major" value={m.astats.critMajor} sub={`${m.astats.totalActive} active alarms`} subTone={m.astats.critMajor ? 'bad' : undefined} />
        <StatTile label="Unreachable" value={m.unreachable} sub={m.unreachable ? 'devices not responding' : 'all responding'} subTone={m.unreachable ? 'bad' : undefined} />
        <StatTile label="Mean utilisation" value={<>{m.perf.meanUtil}<small>%</small></>} sub="across interfaces that are up">
          <SoftMeter pct={m.perf.meanUtil} tone={m.perf.meanUtil >= 85 ? 'orange' : 'info'} />
        </StatTile>
        <StatTile label="Config compliance" value={<>{m.fleet.meanCompliancePct}<small>%</small></>} sub={`${m.recon.total} reconciliation findings`} subTone={m.recon.total ? 'warn' : undefined}>
          <SoftMeter pct={m.fleet.meanCompliancePct} tone={m.fleet.meanCompliancePct >= 100 ? 'success' : m.fleet.meanCompliancePct >= 80 ? 'warning' : 'error'} />
        </StatTile>
      </StatGrid>

      <div className="grid g-3">
        <Panel title="Health by tier" sub="Average score per device role" icon={Layers}>
          {m.health.byRole.length === 0
            ? <Empty icon={ServerCrash} title="No devices" />
            : <BarList max={100} items={m.health.byRole.map((r) => ({ key: r.role, label: r.role, sublabel: `${r.n} devices`, value: r.avg, color: healthColor(r.avg) }))} />}
        </Panel>
        <Panel title="Health distribution" sub={`${total} devices`} icon={PieChart}>
          {total === 0
            ? <Empty icon={ServerCrash} title="No devices" />
            : <Donut slices={m.health.byBand.map((b) => ({ key: b.band, label: b.band, value: b.n, color: HEALTH_HEX[b.band] }))} centerValue={String(total)} centerLabel="devices" />}
        </Panel>
        <Panel title="Fabric status" sub="Coverage, drift and reachability" icon={Activity}>
          <div className="col">
            {fabric.map((f) => (
              <div key={f.label} className="row between">
                <span className="vw-label">{f.label}</span>
                {f.tone ? <Chip tone={f.tone}>{f.value}</Chip> : <b className="num strong">{f.value}</b>}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Lowest-health devices" sub="Click a row to open the device" icon={HeartPulse} count={worst.length} flush>
        <DataTable rows={worst} cols={cols} onRow={(r) => navigate(`/nms/devices/${r.device.id}`)} defaultSort={{ key: 'h', dir: 'asc' }} pageSize={10}
          empty={<Empty icon={ServerCrash} title="No devices" />} />
      </Panel>
    </OpsPage>
  );
}
