import { useMemo, useState } from 'react';
import { App, Col, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import { Plus, Store } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty } from '../../../ops/ui/kit';
import { DataTable, type Col as Column } from '../../../ops/ui/DataTable';
import { SoftMeter, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { providerSpend, fmtMoney } from '../lib/circuits';
import type { Provider, Circuit } from '../../../mock/data/types';

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

  const cols: Column<Provider>[] = [
    { key: 'name', header: 'Provider', sort: (r) => r.name, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.account ?? '—'}</small></span>
    ) },
    { key: 'asn', header: 'ASN', align: 'right', sort: (r) => r.asn ?? 0, render: (r) => <span className="num">{r.asn ?? '—'}</span> },
    { key: 'sla', header: 'Uptime SLA', align: 'right', sort: (r) => r.uptimeSlaPct ?? 0, render: (r) => r.uptimeSlaPct != null ? <span className="num strong" style={{ color: slaColor(r.uptimeSlaPct) }}>{r.uptimeSlaPct}%</span> : '—' },
    { key: 'rest', header: 'Restoration', align: 'right', sort: (r) => r.restorationHrs ?? 0, render: (r) => r.restorationHrs != null ? <span className="num">{r.restorationHrs}h</span> : '—' },
    { key: 'tier', header: 'Support', sort: (r) => r.supportTier ?? '', render: (r) => r.supportTier ? <Chip tone="neutral">{r.supportTier}</Chip> : '—' },
    { key: 'ck', header: 'Circuits', align: 'right', sort: (r) => spendById[r.id]?.count ?? 0, render: (r) => { const s = spendById[r.id]; return <span className="num">{s ? `${s.activeCount}/${s.count}` : '0'}</span>; } },
    { key: 'sp', header: 'Monthly spend', align: 'right', sort: (r) => spendById[r.id]?.spend ?? 0, render: (r) => <span className="num strong">{fmtMoney(spendById[r.id]?.spend ?? 0)}</span> },
    { key: 'end', header: 'Contract end', sort: (r) => r.contractEnd ?? '', render: (r) => <span className="num">{r.contractEnd ? r.contractEnd.slice(0, 10) : '—'}</span> },
    { key: 'portal', header: 'Portal', render: (r) => r.portalUrl ? <a className="ent-link" href={r.portalUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>↗</a> : '—' },
  ];

  return (
    <OpsPage title="Providers" description="Carriers, their SLAs, circuits and monthly spend"
      actions={<Btn variant="filled" icon={Plus} onClick={() => { form.resetFields(); setOpen(true); }}>New provider</Btn>}>

      <StatGrid cols={4}>
        <StatTile label="Providers" value={providers.length} sub={`${spend.filter((x) => x.activeCount > 0).length} with active circuits`} />
        <StatTile label="Total monthly spend" value={fmtMoney(totalSpend)} sub="active circuits" />
        <StatTile label="Annualised" value={fmtMoney(totalSpend * 12)} sub="monthly × 12" />
        <StatTile label="Avg uptime SLA" value={avgSla ? <>{avgSla.toFixed(2)}<small>%</small></> : '—'} sub="across providers">
          {avgSla > 0 && <SoftMeter pct={avgSla} tone="success" />}
        </StatTile>
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={providers} cols={cols} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={25}
          empty={<Empty icon={Store} title="No providers" />} />
      </section>

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
    </OpsPage>
  );
}
