import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App } from 'antd';
import { CheckCircle2, Network, Radar, ShieldCheck } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, Panel, Seg } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Legend } from '../../../ops/ui/status';
import { SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { Donut } from '../../../ops/charts/Donut';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { REACH_COLOR } from '../components/nmsUtil';
import { CollectorsView } from '../components/CollectorsView';
import { RoutingSessionsView } from '../components/RoutingSessionsView';
import { configFleet } from '../lib/config';
import { reconcile, reconStats, FINDING_LABEL, type ReconFinding } from '../lib/discovery';
import type { DiscoveryJob, ManagedDevice, Device, Interface } from '../../../mock/data/types';

const SEV_TONE: Record<string, Tone> = { Critical: 'error', Major: 'orange', Minor: 'info' };
const FINDING_TONE: Record<ReconFinding['type'], Tone> = { Unmanaged: 'purple', Unreachable: 'error', ConfigDrift: 'orange', AttributeMismatch: 'info' };
const JOB_TONE = (s: string): Tone => (s === 'Completed' ? 'success' : s === 'Failed' ? 'error' : 'info');
const TIERS = ['Core', 'Spine', 'Leaf/TOR', 'Access'];
const tierOf = (role: string) => role === 'Core' || role === 'Edge' ? 'Core' : role === 'Spine' ? 'Spine' : role === 'Leaf/TOR' ? 'Leaf/TOR' : 'Access';

type View = 'reconciliation' | 'collectors' | 'routing';
const VIEWS: { id: View; label: string }[] = [
  { id: 'reconciliation', label: 'Reconciliation & topology' },
  { id: 'collectors', label: 'Collectors' },
  { id: 'routing', label: 'Routing sessions' },
];

/** Discovery & Topology: reconciliation, the monitoring sources (collectors) and routing sessions. */
export default function DiscoveryTopologyPage() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('view');
  const view: View = raw === 'collectors' || raw === 'routing' ? raw : 'reconciliation';
  const pick = (v: View) => { const n = new URLSearchParams(); if (v !== 'reconciliation') n.set('view', v); setSp(n, { replace: true }); };
  return (
    <>
      <OpsPage actions={<Seg<View> options={VIEWS} value={view} onChange={pick} />}>{null}</OpsPage>
      {view === 'collectors' ? <CollectorsView /> : view === 'routing' ? <RoutingSessionsView /> : <ReconciliationView />}
    </>
  );
}

function ReconciliationView() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const jobs = (useEntityList('discoveryJobs', { pageSize: 50 }).data?.data ?? []) as unknown as DiscoveryJob[];
  const managed = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const ifaces = (useEntityList('interfaces', { pageSize: 200000 }).data?.data ?? []) as unknown as Interface[];
  const links = (useEntityList('topologyLinks', { pageSize: 500 }).data?.data ?? []) as unknown as { id: string; aDeviceId: string; zDeviceId: string }[];
  const createMd = useEntityCreate('managedDevices');
  const createCR = useEntityCreate('changeRequests');
  const audit = useRecordAudit();
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const ifByDevice = useMemo(() => { const m = new Map<string, Interface[]>(); for (const i of ifaces) { const a = m.get(i.deviceId) ?? []; a.push(i); m.set(i.deviceId, a); } return m; }, [ifaces]);
  const deviceById = useMemo(() => Object.fromEntries(devices.map((d) => [d.id, d])), [devices]);
  const findings = useMemo(() => reconcile(devices, managed, configFleet(managed, ifByDevice).rows).filter((f) => !resolved.has(f.id)), [devices, managed, ifByDevice, resolved]);
  const stats = useMemo(() => reconStats(managed, findings), [managed, findings]);

  const lay = useMemo(() => {
    const W = 620; const rowY: Record<string, number> = { Core: 40, Spine: 115, 'Leaf/TOR': 190, Access: 265 };
    const pos: Record<string, { x: number; y: number; d: ManagedDevice }> = {};
    TIERS.forEach((t) => {
      const inT = managed.filter((d) => tierOf(d.role) === t).slice(0, 8);
      inT.forEach((d, i) => { pos[d.id] = { x: ((i + 1) / (inT.length + 1)) * (W - 40) + 20, y: rowY[t], d }; });
    });
    return { pos, edges: links.filter((l) => pos[l.aDeviceId] && pos[l.zDeviceId]).slice(0, 60), W };
  }, [managed, links]);
  const nodes = Object.values(lay.pos);
  const resolve = (id: string, msg: string) => { setResolved((s) => new Set(s).add(id)); message.success(msg); };

  const adopt = (f: ReconFinding) => {
    const dv = deviceById[f.deviceId]; if (!dv) return;
    const now = new Date().toISOString();
    createMd.mutate({
      id: dv.id, devId: `DEV-ADOPT-${Date.now().toString().slice(-4)}`, hostname: dv.hostname ?? dv.name, mgmtIp: dv.primaryIp4 ?? '10.0.0.1',
      deviceType: (dv.category ?? 'Switch') as ManagedDevice['deviceType'], vendor: dv.manufacturer ?? 'Cisco', model: dv.model ?? 'Nexus', osVersion: '10.0.1',
      role: 'Access', dataCenterId: dv.dataCenterId, rackId: dv.rackId, reachability: 'Reachable', uptimeSeconds: 1000, sourceSystem: 'platform-nms',
      customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'NOC', createdById: 'noc',
    }, { onSuccess: () => { audit('ManagedDevice', dv.id, 'adopted', `Adopted ${f.deviceName} into management`); resolve(f.id, `${f.deviceName} adopted into management`); } });
  };
  const raiseChange = (f: ReconFinding) => {
    const now = new Date().toISOString();
    createCR.mutate({
      chgId: `CHG-CFG-${Date.now().toString().slice(-4)}`, title: `Remediate config drift — ${f.deviceName}`, type: 'ConfigPush', description: f.detail,
      risk: 'Medium', status: 'Submitted', priority: 'Medium', affectedResourceType: 'Asset', affectedResourceIds: [f.deviceId],
      requestedBy: 'NetEng', requestedById: 'neteng', policyViolations: [], customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'NetEng', createdById: 'neteng',
    }, { onSuccess: (cr: Record<string, unknown>) => { resolve(f.id, 'Governed change raised'); navigate(`/change/${cr.id as string}`); } });
  };
  const act = (f: ReconFinding) => {
    if (f.action === 'Adopt') adopt(f);
    else if (f.action === 'Change') raiseChange(f);
    else if (f.action === 'Investigate') navigate(`/nms/devices/${f.deviceId}`);
    else resolve(f.id, 'Discovered value accepted into the source of truth');
  };
  const actLabel: Record<string, string> = { Adopt: 'Adopt', Change: 'Raise change', Investigate: 'Investigate', Accept: 'Accept' };

  const columns: Col<ReconFinding>[] = [
    { key: 'type', header: 'Finding', sort: (f) => f.type, render: (f) => <Chip tone={FINDING_TONE[f.type] ?? 'neutral'}>{FINDING_LABEL[f.type]}</Chip> },
    { key: 'dev', header: 'Device', sort: (f) => f.deviceName, render: (f) => <span className="vw-card-activity-label">{f.deviceName}</span> },
    { key: 'detail', header: 'Detail', wrap: true, render: (f) => <span className="muted">{f.detail}</span> },
    { key: 'sev', header: 'Severity', sort: (f) => f.severity, render: (f) => <Chip tone={SEV_TONE[f.severity] ?? 'neutral'}>{f.severity}</Chip> },
    { key: 'x', header: '', render: (f) => (
        <span className="row" style={{ gap: 4 }}>
          <Btn size="xs" variant="action" onClick={(e) => { e.stopPropagation(); act(f); }}>{actLabel[f.action]}</Btn>
          <Btn size="xs" onClick={(e) => { e.stopPropagation(); resolve(f.id, 'Finding ignored'); }}>Ignore</Btn>
        </span>
      ) },
  ];
  const jobCols: Col<DiscoveryJob>[] = [
    { key: 'name', header: 'Job', render: (j) => j.name },
    { key: 'method', header: 'Method', render: (j) => <Chip tone="neutral" size="xs">{j.method}</Chip> },
    { key: 'status', header: 'Status', render: (j) => <Chip tone={JOB_TONE(j.status)} size="xs" dot>{j.status}</Chip> },
  ];
  const findingParts = (Object.keys(FINDING_LABEL) as ReconFinding['type'][]).map((t) => ({ key: t, label: FINDING_LABEL[t], n: findings.filter((f) => f.type === t).length, tone: FINDING_TONE[t] })).filter((p) => p.n > 0);

  return (
    <OpsPage title="Discovery & Reconciliation" description="Discovered devices against the source of truth — coverage, findings and fabric health">

      <StatGrid cols={6}>
        <StatTile label="Discovered devices" value={stats.discovered} sub="from discovery" />
        <StatTile label="Under management" value={stats.managed} sub="in NMS" />
        <StatTile label="Coverage" value={<>{stats.coveragePct}<small>%</small></>} sub="discovered under management" subTone={stats.coveragePct >= 80 ? undefined : 'warn'}>
          <SoftMeter pct={stats.coveragePct} tone={stats.coveragePct >= 80 ? 'success' : 'orange'} />
        </StatTile>
        <StatTile label="Open findings" value={stats.total} sub={stats.total ? 'to reconcile' : 'reconciled'} subTone={stats.total ? 'warn' : undefined}>
          {findingParts.length > 0 && <Split parts={findingParts} legend={false} />}
        </StatTile>
        <StatTile label="Unmanaged" value={stats.unmanaged} sub={stats.unmanaged ? 'to adopt' : 'none'} subTone={stats.unmanaged ? 'warn' : undefined} />
        <StatTile label="Discovery jobs" value={jobs.length} sub="configured" />
      </StatGrid>

      {/* Bounded internal scroll, not a numbered pager — this section sits
          mid-page above the topology panels below it; an unbounded or
          paginated table here either pushes them far down as findings grow,
          or forces manual page-clicking. */}
      <Panel title="Reconciliation findings" icon={CheckCircle2} count={findings.length} flush>
        <DataTable rows={findings} cols={columns} pageSize={Math.max(findings.length, 1)} maxHeight={320}
          empty={<Empty icon={CheckCircle2} title="Reconciled — no open findings" />} />
      </Panel>

      <div className="grid g-main-side">
        <Panel title="Discovered fabric — health" icon={Network} sub={<Legend items={Object.entries(REACH_COLOR).map(([k, v]) => ({ label: k, color: v }))} />}>
          <svg width={lay.W} height={300} style={{ maxWidth: '100%' }}>
            {TIERS.map((t, i) => <text key={t} x={4} y={40 + i * 75 + 4} fontSize="10" fill="#a8a8a8">{t}</text>)}
            {lay.edges.map((e) => { const a = lay.pos[e.aDeviceId], z = lay.pos[e.zDeviceId]; return <line key={e.id} x1={a.x} y1={a.y} x2={z.x} y2={z.y} stroke="#eef2f6" />; })}
            {nodes.map((n) => <g key={n.d.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/nms/devices/${n.d.id}`)}><circle cx={n.x} cy={n.y} r={7} fill={REACH_COLOR[n.d.reachability] ?? '#64748b'} stroke="#fff" strokeWidth={2} /><text x={n.x} y={n.y + 18} textAnchor="middle" fontSize="8" fill="var(--vw-color-gray-500)">{n.d.hostname.slice(0, 12)}</text></g>)}
          </svg>
        </Panel>
        <div className="col">
          <Panel title="Management coverage" icon={ShieldCheck}>
            <Donut slices={[{ key: 'Managed', label: 'Managed', value: stats.managed, color: '#6ee7b7' }, { key: 'Unmanaged', label: 'Unmanaged', value: stats.unmanaged, color: '#c4b5fd' }]}
              centerValue={`${stats.coveragePct}%`} centerLabel="coverage" size={140} />
          </Panel>
          <Panel title="Discovery jobs" icon={Radar} count={jobs.length} flush>
            <DataTable rows={jobs.slice(0, 5)} cols={jobCols} pageSize={5} compact empty={<Empty icon={Radar} title="No discovery jobs" />} />
          </Panel>
        </div>
      </div>
    </OpsPage>
  );
}
