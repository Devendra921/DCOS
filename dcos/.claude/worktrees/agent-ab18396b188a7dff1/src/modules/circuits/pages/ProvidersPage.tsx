import { useMemo, useState } from 'react';
import { App, Col, Form, Input, InputNumber, Modal, Row, Select, Typography, Spin } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined, ShopOutlined, DollarOutlined, CalendarOutlined, SafetyCertificateOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { KPICard } from '../../../shared/components/KPICard';
import { providerSpend, fmtMoney } from '../lib/circuits';
import type { Provider, Circuit } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const now = () => new Date().toISOString();
const slaColor = (v?: number) => v == null ? 'var(--vw-color-gray-500)' : v >= 99.99 ? 'var(--vw-color-green-600)' : v >= 99.95 ? 'var(--primaryColor500)' : 'var(--vw-color-orange-700)';

export default function ProvidersPage() {
  const { message } = App.useApp();
  const providers = (useEntityList('providers', { pageSize: 500 }).data?.data ?? []) as unknown as Provider[];
  const circuits = (useEntityList('circuits', { pageSize: 5000 }).data?.data ?? []) as unknown as Circuit[];
  const create = useEntityCreate('providers');
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const spend = useMemo(() => providerSpend(providers, circuits), [providers, circuits]);
  const spendById = useMemo(() => Object.fromEntries(spend.map((s) => [s.provider.id, s])), [spend]);
  const totalSpend = spend.reduce((s, x) => s + x.spend, 0);
  const avgSla = providers.length ? (providers.reduce((s, p) => s + (p.uptimeSlaPct ?? 0), 0) / providers.filter((p) => p.uptimeSlaPct != null).length) : 0;

  const submit = async () => {
    const v = await form.validateFields();
    const id = `PROV-NEW-${Date.now().toString(36)}`;
    create.mutate({ id, provId: id, name: v.name, slug: (v.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'), account: v.account, asn: v.asn, portalUrl: v.portalUrl, uptimeSlaPct: v.uptimeSlaPct, restorationHrs: v.restorationHrs, supportTier: v.supportTier, description: v.description, customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' },
      { onSuccess: () => { message.success('Provider created'); setOpen(false); form.resetFields(); } });
  };

  const cols: TableColumnType<Provider>[] = [
    { title: 'Provider', dataIndex: 'name', render: (n: string) => <Text strong>{n}</Text> },
    { title: 'ASN', dataIndex: 'asn', width: 90, render: (a?: number) => a ?? '—' },
    { title: 'Uptime SLA', dataIndex: 'uptimeSlaPct', width: 110, render: (v?: number) => v != null ? <Text strong style={{ color: slaColor(v) }}>{v}%</Text> : '—' },
    { title: 'Restoration', dataIndex: 'restorationHrs', width: 100, render: (h?: number) => h != null ? `${h}h` : '—' },
    { title: 'Support', dataIndex: 'supportTier', width: 100, render: (t?: string) => t ? <VwChip>{t}</VwChip> : '—' },
    { title: 'Circuits', key: 'ck', width: 100, align: 'right', render: (_, r) => { const s = spendById[r.id]; return s ? `${s.activeCount}/${s.count}` : '0'; } },
    { title: 'Monthly spend', key: 'sp', width: 120, align: 'right', render: (_, r) => <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(spendById[r.id]?.spend ?? 0)}</Text> },
    { title: 'Contract end', dataIndex: 'contractEnd', width: 120, render: (d?: string) => d ? d.slice(0, 10) : '—' },
    { title: 'Portal', dataIndex: 'portalUrl', width: 80, render: (u?: string) => u ? <a href={u} target="_blank" rel="noreferrer">↗</a> : '—' },
  ];

  const providersReveal = useScrollReveal(providers, 25);

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-lg)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <h1 className="vw-page-title" style={{ margin: 0 }}>Providers</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>New provider</Button>
      </div>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <KPICard title="Providers" value={providers.length} icon={<ShopOutlined />} iconTone="info" />
        <KPICard title="Total monthly spend" value={fmtMoney(totalSpend)} icon={<DollarOutlined />} iconTone="orange" />
        <KPICard title="Annualised" value={fmtMoney(totalSpend * 12)} icon={<CalendarOutlined />} iconTone="cyan" />
        <KPICard title="Avg uptime SLA" value={avgSla ? avgSla.toFixed(2) : '—'} suffix={avgSla ? '%' : ''} icon={<SafetyCertificateOutlined />} iconTone="success" />
      </div>
      <VwCard size="small" bodyStyle={{ padding: 0 }}>
        <Table<Provider> rowKey="id" size="small" dataSource={providersReveal.visible} columns={cols} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }} />
        {providersReveal.visible.length > 0 && providersReveal.hasMore && (
          <div ref={providersReveal.sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>
      <Modal title="New provider" open={open} onOk={submit} okText="Create" onCancel={() => setOpen(false)} confirmLoading={create.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="Lumen" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="account" label="Account"><Input placeholder="ACCT-123456" /></Form.Item></Col>
            <Col span={12}><Form.Item name="asn" label="ASN"><InputNumber placeholder="Enter ASN" min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="uptimeSlaPct" label="Uptime SLA %"><InputNumber placeholder="Enter uptime SLA %" min={0} max={100} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="restorationHrs" label="Restoration h"><InputNumber placeholder="Enter restoration h" min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="supportTier" label="Support"><Select placeholder="Select support" options={['Platinum', 'Gold', 'Silver'].map((t) => ({ value: t, label: t }))} /></Form.Item></Col>
          </Row>
          <Form.Item name="portalUrl" label="Portal URL"><Input placeholder="https://…" /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" autoSize={{ minRows: 2, maxRows: 3 }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
