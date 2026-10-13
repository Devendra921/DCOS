import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Row, Col, Typography, Empty, Drawer, Progress, Space } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import type { TableColumnType } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, DiffOutlined, RollbackOutlined, SafetyCertificateOutlined, FileSyncOutlined, LineChartOutlined, DesktopOutlined, DashboardOutlined, WarningOutlined } from '../../../shared/icons';
import { Line } from '@ant-design/charts';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { KPICard } from '../../../shared/components/KPICard';
import { configFleet, buildDeviceConfig, complianceTrend, complianceColor, type FleetRow } from '../lib/config';
import type { ManagedDevice, Interface, ConfigChange } from '../../../mock/data/types';
import { VwCard, VwChip, ChartAutoFitBox } from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const cfgStatusColor: Record<string, string> = { Planned: 'blue', Approved: 'green', Pushed: 'cyan', Verified: 'green', Failed: 'red', RolledBack: 'red' };

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

  const columns: TableColumnType<FleetRow>[] = [
    { title: 'Device', key: 'd', ellipsis: true, render: (_, r) => <span><Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>{r.device.hostname}</Text> <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>· {r.device.role}</Text></span> },
    { title: 'Drift', key: 'drift', width: 130, render: (_, r) => r.drift ? <VwChip color="error" style={{ marginInlineEnd: 0 }}>{r.driftCount} line{r.driftCount > 1 ? 's' : ''}</VwChip> : <VwChip color="success" style={{ marginInlineEnd: 0 }}>in sync</VwChip> },
    {
      title: 'Compliance', key: 'comp', width: 200, render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)" }}>
          <Progress percent={r.compliancePct} size="small" showInfo={false} strokeColor={complianceColor(r.compliancePct)} style={{ flex: 1, margin: 0 }} />
          <Text style={{ fontSize: "var(--vw-font-label-sm)", fontWeight: 600, color: complianceColor(r.compliancePct), width: 36, textAlign: 'right' }}>{r.compliancePct}%</Text>
        </div>
      ),
    },
    { title: 'Failed checks', dataIndex: 'failedChecks', width: 110, align: 'center', render: (n: number) => n ? <Text strong style={{ color: 'var(--vw-color-red-600)' }}>{n}</Text> : <Text type="secondary">—</Text> },
    { title: '', key: 'x', width: 90, render: (_, r) => <Button size="small" icon={<DiffOutlined />} onClick={() => setSel(r.device)}>Diff</Button> },
  ];

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>Config Management</div>

      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Config posture</div>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md">
        <KPICard title="In compliance" value={fleet.inCompliance} color="var(--vw-color-green-600)" icon={<SafetyCertificateOutlined />} iconTone="success" />
        <KPICard title="With drift" value={fleet.withDrift} color={fleet.withDrift ? 'var(--vw-color-orange-700)' : undefined} icon={<DiffOutlined />} iconTone="warning" />
        <KPICard title="Mean compliance" value={fleet.meanCompliancePct} suffix="%" color={complianceColor(fleet.meanCompliancePct)} icon={<DashboardOutlined />} iconTone="cyan" />
        <KPICard title="Managed devices" value={fleet.rows.length} icon={<DesktopOutlined />} iconTone="info" />
        <KPICard title="Governed changes" value={changes.length} icon={<FileSyncOutlined />} iconTone="info" />
        <KPICard title="Failed pushes" value={changes.filter((c) => c.status === 'Failed').length} color={changes.some((c) => c.status === 'Failed') ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="error" />
      </div>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Compliance &amp; drift — last 14 days</div>
      <VwCard size="small" title={<><LineChartOutlined /> Mean compliance &amp; devices with drift</>}>
        <ChartAutoFitBox height={200}>
          <Line data={trend} xField="day" yField="value" colorField="series" shapeField="smooth" autoFit
            scale={{ color: { domain: ['Compliance %', 'Drift devices'], range: ['#16a34a', '#c2410c'] } }}
            axis={{ x: { labelFontSize: 10 } }} legend={{ color: { position: 'top' } }} style={{ lineWidth: 2 }} />
        </ChartAutoFitBox>
      </VwCard>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Drift &amp; compliance</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={16}>
          <VwCard size="small" style={{ height: '100%' }} title={<><FileSyncOutlined /> Devices — running vs golden</>}>
            <Table<FleetRow> rowKey={(r) => r.device.id} size="small" dataSource={fleet.rows} columns={columns} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }}
              onRow={(r) => ({ onClick: () => setSel(r.device), style: { cursor: 'pointer' } })} />
          </VwCard>
        </Col>
        <Col xs={24} lg={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<><SafetyCertificateOutlined /> Compliance by check</>}>
            <div style={{ marginTop: "var(--vw-space-xxs)" }}>
              {fleet.checkRollup.map((c) => (
                <div key={c.name} style={{ marginBottom: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: "var(--vw-font-label-sm)", marginBottom: 3 }}>
                    <Text type="secondary">{c.name}</Text>
                    <Text strong style={{ color: complianceColor(c.passPct) }}>{c.passPct}%</Text>
                  </div>
                  <Progress percent={c.passPct} size="small" showInfo={false} strokeColor={complianceColor(c.passPct)} />
                </div>
              ))}
            </div>
          </VwCard>
        </Col>
      </Row>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Governed config changes</div>
      <VwCard size="small">
        {changes.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No config changes" /> : (
          <Table<ConfigChange> size="small" rowKey="id" dataSource={changes} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }}
            onRow={(c) => ({ onClick: () => navigate(`/change/${c.changeRequestId}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'ID', dataIndex: 'cfgchgId', width: 150 },
              { title: 'Device', dataIndex: 'deviceId', ellipsis: true },
              { title: 'Status', dataIndex: 'status', width: 110, render: (s: string) => <VwChip color={cfgStatusColor[s]}>{s}</VwChip> },
              { title: 'Drift', dataIndex: 'driftDetected', width: 100, render: (v: boolean) => v ? <VwChip color="red">drift</VwChip> : <VwChip color="green">in sync</VwChip> },
            ]} />
        )}
      </VwCard>

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
    </div>
  );
}
