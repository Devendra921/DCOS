import { useMemo, useState } from 'react';
import { App, Tabs, Typography, Modal, Form, Select, InputNumber, Space } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ShopOutlined, FileTextOutlined, DollarOutlined, RiseOutlined } from '../../../shared/icons';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { PO_STATUS } from '../../../mock/data/enums';
import { KPICard } from '../../../shared/components/KPICard';
import { BomDetailDrawer } from '../components/BomDetailDrawer';
import type { BOM, Vendor, Contract, PurchaseOrder, Project } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';
const { Title } = Typography;
const money = (v: number) => `$${(v / 1000).toFixed(0)}k`;
export default function ProcurementHubPage() {
  const boms = (useEntityList('boms', { pageSize: 100 }).data?.data ?? []) as unknown as BOM[];
  const vendors = (useEntityList('vendors', { pageSize: 100 }).data?.data ?? []) as unknown as Vendor[];
  const contracts = (useEntityList('contracts', { pageSize: 100 }).data?.data ?? []) as unknown as Contract[];
  const pos = (useEntityList('purchaseOrders', { pageSize: 100 }).data?.data ?? []) as unknown as PurchaseOrder[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const projName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const { message } = App.useApp();
  const create = useEntityCreate('purchaseOrders');
  const audit = useRecordAudit();
  const [open, setOpen] = useState(false);
  const [bomDetail, setBomDetail] = useState<BOM | null>(null);
  const [form] = Form.useForm();
  const submitPo = async () => { const v = await form.validateFields(); const id = `PO-NEW-${Date.now().toString().slice(-4)}`; const now = new Date().toISOString(); const planned = v.plannedCost; create.mutate({ id, poId: id, vendorId: v.vendorId, plannedCost: planned, approvedBudget: Math.round(planned * 1.05), actualSpend: 0, forecastVariance: 0, status: v.status, customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' }, { onSuccess: () => { message.success('PO created'); audit('PurchaseOrder', id, 'created', `Created PO $${(planned/1000).toFixed(0)}k`); setOpen(false); } }); };
  const m = useMemo(() => ({
    openPo: pos.filter((p) => p.status !== 'Received').length,
    totalVal: pos.reduce((s, p) => s + p.actualSpend, 0),
    variance: pos.reduce((s, p) => s + p.forecastVariance, 0),
  }), [pos]);
  return (
    <div>
      <Space className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}><div className="vw-page-title" role="heading" aria-level={3}>Procurement</div><Button type="primary" onClick={() => setOpen(true)}>New PO</Button></Space>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Vendors" value={vendors.length} icon={<ShopOutlined />} iconTone="info" />
        <KPICard title="Open POs" value={m.openPo} icon={<FileTextOutlined />} iconTone="cyan" />
        <KPICard title="Actual Spend" value={money(m.totalVal)} icon={<DollarOutlined />} iconTone="orange" />
        <KPICard title="Forecast Variance" value={money(m.variance)} color={m.variance > 0 ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)'} icon={<RiseOutlined />} iconTone="purple" />
      </div>
      <VwCard size="small">
        <Tabs items={[
          { key: 'po', label: `Purchase Orders (${pos.length})`, children: <Table<PurchaseOrder> size="small" rowKey="id" dataSource={pos} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 420, x: 'max-content' }} columns={[{ title: 'PO', dataIndex: 'poId' }, { title: 'Planned', dataIndex: 'plannedCost', render: money }, { title: 'Actual', dataIndex: 'actualSpend', render: money }, { title: 'Variance', dataIndex: 'forecastVariance', render: (v: number) => <span style={{ color: v > 0 ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)' }}>{money(v)}</span> }, { title: 'Status', dataIndex: 'status', render: (s) => <VwChip>{s}</VwChip> }]} /> },
          { key: 'bom', label: `BOMs (${boms.length})`, children: <Table<BOM> size="small" rowKey="id" dataSource={boms} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 420, x: 'max-content' }} onRow={(b) => ({ onClick: () => setBomDetail(b), style: { cursor: 'pointer' } })} columns={[{ title: 'BOM', dataIndex: 'name' }, { title: 'Type', dataIndex: 'type', render: (t) => <VwChip>{t}</VwChip> }, { title: 'Project', dataIndex: 'projectId', render: (id?: string) => id ? (projName[id] ?? 'Project') : '—' }, { title: 'Lines', dataIndex: 'lineCount', align: 'right' }, { title: 'Cost', dataIndex: 'totalCost', render: money }, { title: 'Status', dataIndex: 'status', render: (s) => <VwChip>{s}</VwChip> }, { title: '', key: 'x', render: () => <a>Open</a> }]} /> },
          { key: 'vendor', label: `Vendors & Contracts (${vendors.length})`, children: <Table<Vendor> size="small" rowKey="id" dataSource={vendors} pagination={false} scroll={{ x: 'max-content' }} columns={[{ title: 'Vendor', dataIndex: 'name' }, { title: 'Category', dataIndex: 'category', render: (c) => <VwChip>{c}</VwChip> }, { title: 'SLA', dataIndex: 'slaTier' }, { title: 'Rating', dataIndex: 'rating', render: (r: number) => '★'.repeat(r) }, { title: 'Contracts', render: (_, v) => contracts.filter((c) => c.vendorId === v.id).length }]} /> },
        ]} />
      </VwCard>
      <Modal title="New purchase order" open={open} onOk={submitPo} onCancel={() => setOpen(false)} okText="Create" destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ status: 'Draft', plannedCost: 250000 }}>
          <Form.Item name="vendorId" label="Vendor" rules={[{ required: true }]}><Select placeholder="Select vendor" showSearch optionFilterProp="label" options={vendors.map((v) => ({ value: v.id, label: v.name }))} /></Form.Item>
          <Form.Item name="plannedCost" label="Planned cost ($)"><InputNumber placeholder="Enter planned cost ($)" min={1000} step={1000} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="status" label="Status"><Select placeholder="Select status" options={PO_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
        </Form>
      </Modal>
      <BomDetailDrawer bom={bomDetail} open={!!bomDetail} onClose={() => setBomDetail(null)} />
    </div>
  );
}
