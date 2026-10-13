import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Col, Form, Input, InputNumber, Modal, Row, Select, Spin, Typography, Progress, Empty } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined, SearchOutlined, DollarOutlined, ApiOutlined, SafetyCertificateOutlined, WarningOutlined, SwapOutlined, DashboardOutlined, DisconnectOutlined, ClusterOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { Column, Pie } from '@ant-design/charts';
import { VwCard, VwChip, ChartAutoFitBox, EntityIconCell } from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { CIRCUIT_STATUS, CIRCUIT_PURPOSE } from '../../../mock/data/enums';
import { circuitStats, circuitView, providerSpend, siteRedundancy, CKT_STATUS_COLOR, utilColor, fmtGbps, fmtMoney } from '../lib/circuits';
import type { Circuit, Provider, CircuitType, CircuitTermination, DataCenter, Interface, ManagedDevice } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const now = () => new Date().toISOString();

export default function CircuitsListPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const circuits = (useEntityList('circuits', { pageSize: 5000 }).data?.data ?? []) as unknown as Circuit[];
  const providers = (useEntityList('providers', { pageSize: 200 }).data?.data ?? []) as unknown as Provider[];
  const types = (useEntityList('circuitTypes', { pageSize: 200 }).data?.data ?? []) as unknown as CircuitType[];
  const terms = (useEntityList('circuitTerminations', { pageSize: 5000 }).data?.data ?? []) as unknown as CircuitTermination[];
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];
  const ifaces = (useEntityList('interfaces', { pageSize: 10000 }).data?.data ?? []) as unknown as Interface[];
  const mds = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const create = useEntityCreate('circuits');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const provName = (id: string) => providers.find((p) => p.id === id)?.name ?? '?';
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? '?';
  const dcName = (id?: string) => dcs.find((d) => d.id === id)?.code;
  const devName = useMemo(() => Object.fromEntries(mds.map((d) => [d.id, d.hostname])), [mds]);
  const ifById = useMemo(() => new Map(ifaces.map((i) => [i.id, i])), [ifaces]);

  const m = useMemo(() => {
    const stats = circuitStats(circuits, terms, ifById);
    const spend = providerSpend(providers, circuits);
    const sites = siteRedundancy(circuits, terms, dcs);
    const statusMix = CIRCUIT_STATUS.map((s) => ({ type: s, value: circuits.filter((c) => c.status === s).length })).filter((x) => x.value > 0);
    const exposed = sites.filter((s) => s.exposed);
    return { stats, spend, sites, statusMix, exposed };
  }, [circuits, terms, ifById, providers, dcs]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return circuits.filter((c) => !s || `${c.cid} ${provName(c.providerId)} ${typeName(c.circuitTypeId)} ${c.status} ${c.purpose ?? ''}`.toLowerCase().includes(s));
  }, [circuits, q, providers, types]);

  const submit = async () => {
    const v = await form.validateFields();
    const id = `CKT-NEW-${Date.now().toString(36)}`;
    create.mutate({ id, cktId: id, cid: v.cid, providerId: v.providerId, circuitTypeId: v.circuitTypeId, status: v.status, purpose: v.purpose, commitRateMbps: v.commitRateMbps, monthlyCostUsd: v.monthlyCostUsd, customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' },
      { onSuccess: () => { message.success('Circuit created'); setOpen(false); form.resetFields(); } });
  };

  const spendData = m.spend.map((s) => ({ provider: s.provider.name, value: Math.round(s.spend / 100) / 10 }));

  const cols: TableColumnType<Circuit>[] = [
    { title: 'Circuit', dataIndex: 'cid', width: 150, render: (v: string, r) => <a onClick={() => navigate(`/circuits/${r.id}`)} style={{ fontWeight: 600 }}>{v}</a> },
    { title: 'Provider', width: 150, render: (_, r) => <EntityIconCell icon={<ApiOutlined />} iconTone="cyan" label={provName(r.providerId)} /> },
    { title: 'Purpose', dataIndex: 'purpose', width: 130, render: (p?: string) => p ? <VwChip>{p}</VwChip> : '—' },
    { title: 'A-side', width: 190, ellipsis: true, render: (_, r) => { const a = terms.find((t) => t.circuitId === r.id && t.side === 'A'); return a ? <EntityIconCell icon={<ClusterOutlined />} iconTone="info" label={dcName(a.dataCenterId) ?? '—'} sublabel={a.deviceId ? devName[a.deviceId] : undefined} /> : '—'; } },
    { title: 'Commit', dataIndex: 'commitRateMbps', width: 80, align: 'right', render: fmtGbps },
    {
      title: 'Utilisation', key: 'util', width: 150, render: (_, r) => { const v = circuitView(r, terms, ifById); if (r.status !== 'Active') return <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>—</Text>;
        return <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)" }}><Progress percent={v.util} size="small" showInfo={false} strokeColor={utilColor(v.util)} style={{ flex: 1, margin: 0 }} /><Text style={{ fontSize: "var(--vw-font-label-sm)", fontWeight: 600, color: utilColor(v.util), width: 32, textAlign: 'right' }}>{v.util}%</Text></div>; },
    },
    { title: 'Monthly', dataIndex: 'monthlyCostUsd', width: 90, align: 'right', render: (v?: number) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(v)}</Text> },
    { title: 'Status', dataIndex: 'status', width: 120, render: (s: string) => <VwChip color={CKT_STATUS_COLOR[s]}>{s}</VwChip> },
  ];

  const { visible, hasMore, sentinelRef, total } = useScrollReveal(rows, 25, q);

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div><div className="vw-page-title" role="heading" aria-level={3}>Circuits</div></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>New circuit</Button>
      </div>

      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Connectivity posture</div>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md">
        <KPICard title="Active circuits" value={m.stats.active} icon={<ApiOutlined />} iconTone="info" />
        <KPICard title="Committed" value={m.stats.committedGbps} suffix=" Gbps" icon={<SwapOutlined />} iconTone="cyan" />
        <KPICard title="Monthly spend" value={fmtMoney(m.stats.monthlySpendUsd)} icon={<DollarOutlined />} iconTone="orange" />
        <KPICard title="Avg utilisation" value={m.stats.avgUtil} suffix="%" color={utilColor(m.stats.avgUtil)} icon={<DashboardOutlined />} iconTone="cyan" />
        <KPICard title="Offline" value={m.stats.offline} color={m.stats.offline ? 'var(--vw-color-red-600)' : undefined} icon={<DisconnectOutlined />} iconTone="error" />
        <KPICard title="Exposed sites" value={m.exposed.length} color={m.exposed.length ? 'var(--vw-color-orange-700)' : undefined} icon={<WarningOutlined />} iconTone="error" />
      </div>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Spend, mix &amp; redundancy</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} md={9}>
          <VwCard size="small" style={{ height: '100%' }} title={<><DollarOutlined /> Monthly spend by provider ($k)</>}>
            <ChartAutoFitBox height={220}>
              {spendData.length ? <Column data={spendData} xField="provider" yField="value" autoFit
                axis={{ x: { labelAutoRotate: true, labelFontSize: 10 } }} style={{ fill: "var(--vw-color-black)", maxWidth: 36 }} label={false} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No spend" />}
            </ChartAutoFitBox>
          </VwCard>
        </Col>
        <Col xs={24} md={7}>
          <VwCard size="small" style={{ height: '100%' }} title={<><ApiOutlined /> Circuits by status</>}>
            <ChartAutoFitBox height={220}>
              <Pie data={m.statusMix} angleField="value" colorField="type" innerRadius={0.6} autoFit
                scale={{ color: { domain: CIRCUIT_STATUS as unknown as string[], range: CIRCUIT_STATUS.map((s) => CKT_STATUS_COLOR[s]) } }}
                legend={{ color: { position: 'bottom' } }} label={false} />
            </ChartAutoFitBox>
          </VwCard>
        </Col>
        <Col xs={24} md={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<><WarningOutlined /> Site redundancy</>}
            extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{m.exposed.length} exposed</Text>}>
            {m.exposed.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="All sites dual-homed" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--vw-space-sm)", maxHeight: 220, overflowY: 'auto' }}>
                {m.exposed.map((s) => (
                  <div key={s.dcId} style={{ border: '1px solid #eef2f6', borderLeft: '3px solid var(--vw-color-orange-700)', borderRadius: "var(--vw-radius-sm)", padding: '8px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>{s.dcName}</Text><Text style={{ fontSize: "var(--vw-font-label-sm)", color: 'var(--vw-color-orange-700)' }}>{s.activeCircuits} circuit{s.activeCircuits > 1 ? 's' : ''}</Text></div>
                    <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)", marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: "var(--vw-space-xxs)" }}>
                      {s.singleHomed && <VwChip color="error">single-homed</VwChip>}
                      {s.noCarrierDiversity && <VwChip color="warning">one carrier</VwChip>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </VwCard>
        </Col>
      </Row>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Circuit register</div>
      <Input allowClear prefix={<SearchOutlined />} placeholder="Search by CID, provider, purpose, status…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 340, marginBottom: "var(--vw-space-md)" }} />
      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
        Showing {visible.length} of {total} circuits
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Table<Circuit> rowKey="id" size="small" dataSource={visible} columns={cols} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }} locale={{ emptyText: 'No circuits match.' }}
          onRow={(r) => ({ onClick: () => navigate(`/circuits/${r.id}`), style: { cursor: 'pointer' } })} />
        {visible.length > 0 && hasMore && (
          <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>

      <Modal title="New circuit" open={open} onOk={submit} okText="Create" onCancel={() => setOpen(false)} confirmLoading={create.isPending}>
        <Form form={form} layout="vertical" initialValues={{ status: 'Planned', purpose: 'Internet' }}>
          <Form.Item name="cid" label="Circuit ID" rules={[{ required: true }]}><Input placeholder="CID-XXXXXXXX" /></Form.Item>
          <Form.Item name="providerId" label="Provider" rules={[{ required: true }]}><Select placeholder="Select provider" showSearch optionFilterProp="label" options={providers.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item>
          <Form.Item name="circuitTypeId" label="Type" rules={[{ required: true }]}><Select placeholder="Select type" options={types.map((t) => ({ value: t.id, label: t.name }))} /></Form.Item>
          <Form.Item name="purpose" label="Purpose"><Select placeholder="Select purpose" options={CIRCUIT_PURPOSE.map((p) => ({ value: p, label: p }))} /></Form.Item>
          <Form.Item name="status" label="Status"><Select placeholder="Select status" options={CIRCUIT_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="commitRateMbps" label="Commit (Mbps)"><InputNumber placeholder="Enter commit (Mbps)" min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="monthlyCostUsd" label="Monthly cost ($)"><InputNumber placeholder="Enter monthly cost ($)" min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
