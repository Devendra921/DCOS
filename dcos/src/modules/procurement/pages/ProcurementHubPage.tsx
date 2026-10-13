import { useMemo, useState } from 'react';
import { App, Modal, Form, Select, InputNumber } from 'antd';
import { Plus } from 'lucide-react';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { PO_STATUS } from '../../../mock/data/enums';
import { BomDetailDrawer } from '../components/BomDetailDrawer';
import { PoDetailDrawer } from '../components/PoDetailDrawer';
import type { BOM, Vendor, Contract, PurchaseOrder, Project } from '../../../mock/data/types';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Tabs } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
const PO_TONE: Record<string, Tone> = { Draft: 'neutral', Approved: 'info', Ordered: 'purple', Received: 'success' };
type Tab = 'po' | 'bom' | 'vendor';
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
  const [poDetail, setPoDetail] = useState<PurchaseOrder | null>(null);
  const [form] = Form.useForm();
  const submitPo = async () => { const v = await form.validateFields(); const id = `PO-NEW-${Date.now().toString().slice(-4)}`; const now = new Date().toISOString(); const planned = v.plannedCost; create.mutate({ id, poId: id, vendorId: v.vendorId, plannedCost: planned, approvedBudget: Math.round(planned * 1.05), actualSpend: 0, forecastVariance: 0, status: v.status, customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' }, { onSuccess: () => { message.success('PO created'); audit('PurchaseOrder', id, 'created', `Created PO $${(planned/1000).toFixed(0)}k`); setOpen(false); } }); };
  const m = useMemo(() => ({
    openPo: pos.filter((p) => p.status !== 'Received').length,
    totalVal: pos.reduce((s, p) => s + p.actualSpend, 0),
    variance: pos.reduce((s, p) => s + p.forecastVariance, 0),
  }), [pos]);
  const [tab, setTab] = useState<Tab>('po');
  const [q, setQ] = useState('');
  const [poStatusF, setPoStatusF] = useState('');
  const [poVendorF, setPoVendorF] = useState('');
  const [bomTypeF, setBomTypeF] = useState('');
  const [bomStatusF, setBomStatusF] = useState('');
  const [vendCatF, setVendCatF] = useState('');
  const [vendSlaF, setVendSlaF] = useState('');
  const vendName = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const s = q.trim().toLowerCase();
  const poRows = pos.filter((p) => (!poStatusF || p.status === poStatusF) && (!poVendorF || p.vendorId === poVendorF)
    && (!s || `${p.poId} ${p.vendorId ? vendName[p.vendorId] ?? '' : ''} ${p.status}`.toLowerCase().includes(s)));
  const bomRows = boms.filter((b) => (!bomTypeF || b.type === bomTypeF) && (!bomStatusF || b.status === bomStatusF)
    && (!s || `${b.name} ${b.type} ${b.projectId ? projName[b.projectId] ?? '' : ''}`.toLowerCase().includes(s)));
  const vendRows = vendors.filter((v) => (!vendCatF || v.category === vendCatF) && (!vendSlaF || v.slaTier === vendSlaF)
    && (!s || `${v.name} ${v.category} ${v.slaTier}`.toLowerCase().includes(s)));
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  const open_ = <span className="ent-link">Open</span>;

  const poCols: Col<PurchaseOrder>[] = [
    { key: 'po', header: 'PO', sort: (r) => r.poId, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label mono">{r.poId}</span><small>{r.vendorId ? vendName[r.vendorId] ?? '—' : '—'}</small></span>
    ) },
    { key: 'planned', header: 'Planned', align: 'right', sort: (r) => r.plannedCost, render: (r) => <span className="num">{money(r.plannedCost)}</span> },
    { key: 'actual', header: 'Actual', align: 'right', sort: (r) => r.actualSpend, render: (r) => <span className="num">{money(r.actualSpend)}</span> },
    { key: 'variance', header: 'Variance', align: 'right', sort: (r) => r.forecastVariance, render: (r) => <span className="num" style={{ color: r.forecastVariance > 0 ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)' }}>{money(r.forecastVariance)}</span> },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip tone={PO_TONE[r.status] ?? 'neutral'} dot>{r.status}</Chip> },
    { key: 'x', header: '', render: () => open_ },
  ];
  const bomCols: Col<BOM>[] = [
    { key: 'name', header: 'BOM', sort: (r) => r.name, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.projectId ? (projName[r.projectId] ?? 'Project') : '—'}</small></span>
    ) },
    { key: 'type', header: 'Type', sort: (r) => r.type, render: (r) => <Chip>{r.type}</Chip> },
    { key: 'lines', header: 'Lines', align: 'right', sort: (r) => r.lineCount, render: (r) => <span className="num">{r.lineCount}</span> },
    { key: 'cost', header: 'Cost', align: 'right', sort: (r) => r.totalCost, render: (r) => <span className="num">{money(r.totalCost)}</span> },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip dot>{r.status}</Chip> },
    { key: 'x', header: '', render: () => open_ },
  ];
  const vendCols: Col<Vendor>[] = [
    { key: 'name', header: 'Vendor', sort: (r) => r.name, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.category}</small></span>
    ) },
    { key: 'sla', header: 'SLA', sort: (r) => r.slaTier, render: (r) => r.slaTier },
    { key: 'rating', header: 'Rating', sort: (r) => r.rating, render: (r) => '★'.repeat(r.rating) },
    { key: 'contracts', header: 'Contracts', align: 'right', sort: (r) => contracts.filter((c) => c.vendorId === r.id).length, render: (r) => <span className="num">{contracts.filter((c) => c.vendorId === r.id).length}</span> },
  ];
  const search = { value: q, onChange: setQ, placeholder: tab === 'po' ? 'PO, vendor, status' : tab === 'bom' ? 'BOM, type, project' : 'Vendor, category, SLA' };

  return (
    <OpsPage title="Procurement" description="Purchase orders, bills of materials, vendors and contracts."
      actions={<Btn variant="filled" icon={Plus} onClick={() => setOpen(true)}>New PO</Btn>}>
      <StatGrid cols={4}>
        <StatTile label="Vendors" value={vendors.length} sub={`${contracts.length} contracts`} onClick={() => setTab('vendor')} active={tab === 'vendor'} />
        <StatTile label="Open POs" value={m.openPo} sub={`of ${pos.length} purchase orders`} onClick={() => setTab('po')} active={tab === 'po'} />
        <StatTile label="Actual spend" value={money(m.totalVal)} sub="across all POs" />
        <StatTile label="Forecast variance" value={money(m.variance)} sub={m.variance > 0 ? 'over plan' : 'within plan'} subTone={m.variance > 0 ? 'bad' : undefined} />
      </StatGrid>

      <Tabs<Tab> value={tab} onChange={(t) => { setTab(t); setQ(''); }} tabs={[
        { id: 'po', label: 'Purchase Orders', count: pos.length },
        { id: 'bom', label: 'BOMs', count: boms.length },
        { id: 'vendor', label: 'Vendors & Contracts', count: vendors.length },
      ]} />

      <section className="vw-card-section dcl-table">
        {tab === 'po' && (
          <DataTable rows={poRows} cols={poCols} onRow={(p) => setPoDetail(p)} pageSize={25}
            toolbar={<ListToolbar shown={poRows.length} total={pos.length} noun="purchase orders" search={search}
              filters={[
                { id: 'status', label: 'Status', quick: true, value: poStatusF, anyLabel: 'Any status', onChange: setPoStatusF, options: PO_STATUS.map((x) => ({ id: x, label: x, count: pos.filter((p) => p.status === x).length })) },
                { id: 'vendor', label: 'Vendor', quick: true, value: poVendorF, anyLabel: 'Any vendor', onChange: setPoVendorF, options: vendors.map((v) => ({ id: v.id, label: v.name, count: pos.filter((p) => p.vendorId === v.id).length })) },
              ]} />} />
        )}
        {tab === 'bom' && (
          <DataTable rows={bomRows} cols={bomCols} onRow={(b) => setBomDetail(b)} pageSize={25}
            toolbar={<ListToolbar shown={bomRows.length} total={boms.length} noun="BOMs" search={search}
              filters={[
                { id: 'type', label: 'Type', quick: true, value: bomTypeF, anyLabel: 'Any type', onChange: setBomTypeF, options: uniq(boms.map((b) => b.type)).map((x) => ({ id: x, label: x, count: boms.filter((b) => b.type === x).length })) },
                { id: 'status', label: 'Status', quick: true, value: bomStatusF, anyLabel: 'Any status', onChange: setBomStatusF, options: uniq(boms.map((b) => b.status)).map((x) => ({ id: x, label: x, count: boms.filter((b) => b.status === x).length })) },
              ]} />} />
        )}
        {tab === 'vendor' && (
          <DataTable rows={vendRows} cols={vendCols} pageSize={25}
            toolbar={<ListToolbar shown={vendRows.length} total={vendors.length} noun="vendors" search={search}
              filters={[
                { id: 'category', label: 'Category', quick: true, value: vendCatF, anyLabel: 'Any category', onChange: setVendCatF, options: uniq(vendors.map((v) => v.category)).map((x) => ({ id: x, label: x, count: vendors.filter((v) => v.category === x).length })) },
                { id: 'sla', label: 'SLA tier', quick: true, value: vendSlaF, anyLabel: 'Any SLA tier', onChange: setVendSlaF, options: uniq(vendors.map((v) => v.slaTier)).map((x) => ({ id: x, label: x, count: vendors.filter((v) => v.slaTier === x).length })) },
              ]} />} />
        )}
      </section>

      <Modal title="New purchase order" open={open} onOk={submitPo} onCancel={() => setOpen(false)} okText="Create" destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ status: 'Draft', plannedCost: 250000 }}>
          <Form.Item name="vendorId" label="Vendor" rules={[{ required: true }]}><Select placeholder="Select vendor" showSearch optionFilterProp="label" options={vendors.map((v) => ({ value: v.id, label: v.name }))} /></Form.Item>
          <Form.Item name="plannedCost" label="Planned cost ($)"><InputNumber placeholder="Enter planned cost ($)" min={1000} step={1000} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="status" label="Status"><Select placeholder="Select status" options={PO_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
        </Form>
      </Modal>
      <BomDetailDrawer bom={bomDetail} open={!!bomDetail} onClose={() => setBomDetail(null)} />
      <PoDetailDrawer po={poDetail} open={!!poDetail} onClose={() => setPoDetail(null)} />
    </OpsPage>
  );
}
