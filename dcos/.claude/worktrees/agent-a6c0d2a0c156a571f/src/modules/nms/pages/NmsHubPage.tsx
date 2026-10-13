import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Typography, Progress, Empty } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { HeartOutlined, ApartmentOutlined, DashboardOutlined, WarningOutlined, FireOutlined, SafetyCertificateOutlined, SyncOutlined } from '../../../shared/icons';
import { Pie } from '@ant-design/charts';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, ChartAutoFitBox } from '../../../shared/components/ux';
import { REACH_COLOR } from '../components/nmsUtil';
import { fleetHealth, healthColor, HEALTH_HEX, type DeviceHealth } from '../lib/health';
import { alarmStats } from '../lib/fault';
import { perfSummary, utilColor } from '../lib/metrics';
import { configFleet, complianceColor } from '../lib/config';
import { reconcile, reconStats } from '../lib/discovery';
import type { ManagedDevice, Interface, Alarm, Device } from '../../../mock/data/types';

const { Text } = Typography;

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

  const dist = m.health.byBand.map((b) => ({ type: b.band, value: b.n }));

  const worstCols = [
    { title: 'Device', key: 'd', ellipsis: true, render: (_: unknown, r: DeviceHealth) => <span><Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>{r.device.hostname}</Text> <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>· {r.device.role}</Text></span> },
    { title: 'Reach', dataIndex: ['device', 'reachability'], width: 100, render: (_: unknown, r: DeviceHealth) => <span style={{ fontSize: "var(--vw-font-label-sm)" }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: REACH_COLOR[r.device.reachability], marginRight: 6 }} />{r.device.reachability}</span> },
    { title: 'Alarms', dataIndex: 'activeAlarms', width: 80, align: 'center' as const, render: (n: number, r: DeviceHealth) => n ? <Text strong style={{ color: r.critMajor ? 'var(--vw-color-red-600)' : 'var(--vw-color-orange-700)' }}>{n}</Text> : <Text type="secondary">—</Text> },
    { title: 'Peak util', dataIndex: 'maxUtil', width: 90, render: (v: number) => <Text style={{ color: utilColor(v), fontWeight: 600 }}>{v}%</Text> },
    { title: 'Config', dataIndex: 'compliancePct', width: 84, render: (v: number) => <Text style={{ color: complianceColor(v), fontWeight: 600 }}>{v}%</Text> },
    {
      title: 'Health', key: 'h', width: 150, render: (_: unknown, r: DeviceHealth) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)" }}>
          <Progress percent={r.score} size="small" showInfo={false} strokeColor={healthColor(r.score)} style={{ flex: 1, margin: 0 }} />
          <Text style={{ fontSize: "var(--vw-font-label-sm)", fontWeight: 600, color: healthColor(r.score), width: 26, textAlign: 'right' }}>{r.score}</Text>
        </div>
      ),
    },
  ];

  const statRow = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid #f4f4f4' }}>
      <Text type="secondary" style={{ fontSize: "var(--vw-font-label-md)" }}>{label}</Text>{value}
    </div>
  );

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>Network Operations · Network Health</div>

      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Network health</div>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md">
        <KPICard title="Network health" value={m.health.avg} color={healthColor(m.health.avg)} icon={<HeartOutlined />} iconTone="info" />
        <KPICard title="Critical devices" value={m.critical} color={m.critical ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="error" />
        <KPICard title="Active crit/major" value={m.astats.critMajor} color={m.astats.critMajor ? 'var(--vw-color-red-600)' : undefined} icon={<FireOutlined />} iconTone="error" />
        <KPICard title="Mean utilisation" value={m.perf.meanUtil} suffix="%" color={utilColor(m.perf.meanUtil)} icon={<DashboardOutlined />} iconTone="cyan" />
        <KPICard title="Config compliance" value={m.fleet.meanCompliancePct} suffix="%" color={complianceColor(m.fleet.meanCompliancePct)} icon={<SafetyCertificateOutlined />} iconTone="success" />
        <KPICard title="Recon findings" value={m.recon.total} color={m.recon.total ? 'var(--vw-color-orange-700)' : undefined} icon={<SyncOutlined />} iconTone="warning" />
      </div>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Fabric health</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} md={9}>
          <VwCard size="small" style={{ height: '100%' }} title={<><ApartmentOutlined /> Health by tier</>}>
            <div style={{ marginTop: "var(--vw-space-xxs)" }}>
              {m.health.byRole.map((r) => (
                <div key={r.role} style={{ marginBottom: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: "var(--vw-font-label-sm)", marginBottom: 3 }}>
                    <Text type="secondary">{r.role} <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>· {r.n}</Text></Text>
                    <Text strong style={{ color: healthColor(r.avg) }}>{r.avg}</Text>
                  </div>
                  <Progress percent={r.avg} size="small" showInfo={false} strokeColor={healthColor(r.avg)} />
                </div>
              ))}
            </div>
          </VwCard>
        </Col>
        <Col xs={24} md={7}>
          <VwCard size="small" style={{ height: '100%' }} title={<><HeartOutlined /> Health distribution</>}>
            <ChartAutoFitBox height={180}>
              {dist.length ? <Pie data={dist} angleField="value" colorField="type" innerRadius={0.62} autoFit
                scale={{ color: { domain: ['Healthy', 'Degraded', 'Critical'], range: [HEALTH_HEX.Healthy, HEALTH_HEX.Degraded, HEALTH_HEX.Critical] } }}
                legend={{ color: { position: 'bottom' } }} label={false} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No devices" />}
            </ChartAutoFitBox>
          </VwCard>
        </Col>
        <Col xs={24} md={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<><DashboardOutlined /> Fabric status</>}>
            {statRow('Managed devices', <Text strong>{m.health.rows.length}</Text>)}
            {statRow('Management coverage', <Text strong style={{ color: m.recon.coveragePct >= 80 ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)' }}>{m.recon.coveragePct}%</Text>)}
            {statRow('Unmanaged (to adopt)', <Text strong style={{ color: m.recon.unmanaged ? '#9747ff' : undefined }}>{m.recon.unmanaged}</Text>)}
            {statRow('Devices with config drift', <Text strong style={{ color: m.fleet.withDrift ? 'var(--vw-color-orange-700)' : undefined }}>{m.fleet.withDrift}</Text>)}
            {statRow('Unreachable', <Text strong style={{ color: m.unreachable ? 'var(--vw-color-red-600)' : undefined }}>{m.unreachable}</Text>)}
            {statRow('Flapping alarms', <Text strong style={{ color: m.astats.flapping ? 'var(--vw-color-orange-700)' : undefined }}>{m.astats.flapping}</Text>)}
          </VwCard>
        </Col>
      </Row>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Lowest-health devices</div>
      <VwCard size="small">
        {m.health.worst.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No devices" /> : (
          <Table<DeviceHealth> rowKey={(r) => r.device.id} size="small" dataSource={m.health.worst} columns={worstCols} pagination={false}
            onRow={(r) => ({ onClick: () => navigate(`/nms/devices/${r.device.id}`), style: { cursor: 'pointer' } })} scroll={{ x: 'max-content' }} />
        )}
      </VwCard>
    </div>
  );
}
