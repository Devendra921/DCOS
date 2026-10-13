import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Row, Col, Typography, Space, Empty } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import type { TableColumnType } from 'antd';
import { ClusterOutlined, RadarChartOutlined, SafetyCertificateOutlined, DesktopOutlined, CheckCircleOutlined, DashboardOutlined, WarningOutlined, DisconnectOutlined } from '../../../shared/icons';
import { Pie } from '@ant-design/charts';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip, ChartAutoFitBox } from '../../../shared/components/ux';
import { REACH_COLOR } from '../components/nmsUtil';
import { configFleet } from '../lib/config';
import { reconcile, reconStats, FINDING_COLOR, FINDING_LABEL, type ReconFinding } from '../lib/discovery';
import type { DiscoveryJob, ManagedDevice, Device, Interface } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const SEV_HEX: Record<string, string> = { Critical: 'var(--vw-color-red-600)', Major: 'var(--vw-color-orange-700)', Minor: 'var(--primaryColor500)' };
const TIERS = ['Core', 'Spine', 'Leaf/TOR', 'Access'];
const tierOf = (role: string) => role === 'Core' || role === 'Edge' ? 'Core' : role === 'Spine' ? 'Spine' : role === 'Leaf/TOR' ? 'Leaf/TOR' : 'Access';

export default function DiscoveryTopologyPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const jobs = (useEntityList('discoveryJobs', { pageSize: 50 }).data?.data ?? []) as unknown as DiscoveryJob[];
  const managed = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const ifaces = (useEntityList('interfaces', { pageSize: 10000 }).data?.data ?? []) as unknown as Interface[];
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

  const columns: TableColumnType<ReconFinding>[] = [
    { title: 'Finding', dataIndex: 'type', width: 150, render: (t: ReconFinding['type']) => <VwChip color={FINDING_COLOR[t]} style={{ marginInlineEnd: 0 }}>{FINDING_LABEL[t]}</VwChip> },
    { title: 'Device', dataIndex: 'deviceName', width: 180, ellipsis: true, render: (n: string) => <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>{n}</Text> },
    { title: 'Detail', dataIndex: 'detail', ellipsis: true },
    { title: 'Severity', dataIndex: 'severity', width: 90, render: (s: string) => <VwChip color={SEV_HEX[s]}>{s}</VwChip> },
    { title: '', key: 'x', width: 200, render: (_: unknown, f: ReconFinding) => (
        <Space size={4}>
          <Button size="small" type="primary" ghost onClick={() => act(f)}>{actLabel[f.action]}</Button>
          <Button size="small" onClick={() => resolve(f.id, 'Finding ignored')}>Ignore</Button>
        </Space>
      ) },
  ];

  const coverage = [{ type: 'Managed', value: stats.managed }, { type: 'Unmanaged', value: stats.unmanaged }];

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>Discovery &amp; Reconciliation</div>

      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Reconciliation posture</div>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md">
        <KPICard title="Discovered devices" value={stats.discovered} icon={<DesktopOutlined />} iconTone="info" />
        <KPICard title="Under management" value={stats.managed} color="var(--vw-color-green-600)" icon={<CheckCircleOutlined />} iconTone="success" />
        <KPICard title="Coverage" value={stats.coveragePct} suffix="%" color={stats.coveragePct >= 80 ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)'} icon={<DashboardOutlined />} iconTone="cyan" />
        <KPICard title="Open findings" value={stats.total} color={stats.total ? 'var(--vw-color-orange-700)' : undefined} icon={<WarningOutlined />} iconTone="warning" />
        <KPICard title="Unmanaged" value={stats.unmanaged} color={stats.unmanaged ? '#9747ff' : undefined} icon={<DisconnectOutlined />} iconTone="purple" />
        <KPICard title="Discovery jobs" value={jobs.length} icon={<RadarChartOutlined />} iconTone="cyan" />
      </div>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Reconciliation findings</div>
      <VwCard size="small">
        {/* Bounded internal scroll, not a numbered pager — this section sits
            mid-page above "Topology health & discovery" below it; an
            unbounded or paginated table here either pushes that section far
            down as findings grow, or forces manual page-clicking that's
            inconsistent with the rest of the app. */}
        {findings.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Reconciled — no open findings" /> : (
          <Table<ReconFinding> rowKey="id" size="small" dataSource={findings} columns={columns} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }} />
        )}
      </VwCard>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Topology health &amp; discovery</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={14}>
          <VwCard size="small" style={{ height: '100%' }} title={<><ClusterOutlined /> Discovered fabric — health</>}>
            <svg width={lay.W} height={300} style={{ maxWidth: '100%' }}>
              {TIERS.map((t, i) => <text key={t} x={4} y={40 + i * 75 + 4} fontSize="10" fill="#a8a8a8">{t}</text>)}
              {lay.edges.map((e) => { const a = lay.pos[e.aDeviceId], z = lay.pos[e.zDeviceId]; return <line key={e.id} x1={a.x} y1={a.y} x2={z.x} y2={z.y} stroke="#eef2f6" />; })}
              {nodes.map((n) => <g key={n.d.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/nms/devices/${n.d.id}`)}><circle cx={n.x} cy={n.y} r={7} fill={REACH_COLOR[n.d.reachability] ?? '#64748b'} stroke="#fff" strokeWidth={2} /><text x={n.x} y={n.y + 18} textAnchor="middle" fontSize="8" fill="var(--vw-color-gray-500)">{n.d.hostname.slice(0, 12)}</text></g>)}
            </svg>
            <Space size={14} style={{ marginTop: "var(--vw-space-xxs)" }}>{Object.entries(REACH_COLOR).map(([k, v]) => <span key={k} className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)" }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: v, marginRight: "var(--vw-space-xxs)" }} />{k}</span>)}</Space>
          </VwCard>
        </Col>
        <Col xs={24} lg={10}>
          <VwCard size="small" style={{ marginBottom: "var(--vw-space-lg)" }} title={<><SafetyCertificateOutlined /> Management coverage</>}>
            <ChartAutoFitBox height={150}>
              <Pie data={coverage} angleField="value" colorField="type" innerRadius={0.62} autoFit
                scale={{ color: { domain: ['Managed', 'Unmanaged'], range: ['#16a34a', '#9747ff'] } }}
                legend={{ color: { position: 'bottom' } }} label={false} />
            </ChartAutoFitBox>
          </VwCard>
          <VwCard size="small" title={<><RadarChartOutlined /> Discovery jobs</>}>
            <Table<DiscoveryJob> size="small" rowKey="id" dataSource={jobs.slice(0, 5)} pagination={false}
              columns={[
                { title: 'Job', dataIndex: 'name', ellipsis: true },
                { title: 'Method', dataIndex: 'method', width: 76, render: (m: string) => <VwChip>{m}</VwChip> },
                { title: 'Status', dataIndex: 'status', width: 92, render: (s: string) => <VwChip color={s === 'Completed' ? 'green' : s === 'Failed' ? 'red' : 'blue'}>{s}</VwChip> },
              ]} scroll={{ x: 'max-content' }} />
          </VwCard>
        </Col>
      </Row>
    </div>
  );
}
