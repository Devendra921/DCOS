/* Project cost: budget, commitment, spend and forecast as one summary row; the cost curve (planned,
   committed, actual, forecast) as a plain line chart; change orders that move the budget; and the
   purchase orders behind the commitment. */
import { useMemo, useState } from 'react';
import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { useEntityCreate, useEntityUpdate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { CHANGE_ORDER_REASON } from '../../../mock/data/enums';
import type { Project, ChangeOrder, Milestone, Vendor } from '../../../mock/data/types';
import { useProjectCost, buildCostCurve, type CostCurvePoint } from '../lib/cost';
import { DataTable, Muted, SummaryRow, Bar } from './project/kit';
import { useRecords } from './project/useRecords';
import { money, PO_TONE, fmtDate } from './project/format';

const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'You', createdById: 'me' });
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;
const CO_TONE = { Draft: 'neutral', Submitted: 'warning', Approved: 'success', Rejected: 'error' } as const;
const SERIES: { key: CostCurvePoint['series']; color: string; dash?: string }[] = [
  { key: 'Planned', color: 'var(--vw-color-slate-400)', dash: '4 3' },
  { key: 'Committed', color: 'var(--vw-color-purple-500)' },
  { key: 'Actual', color: 'var(--vw-color-blue-600)' },
  { key: 'Forecast', color: 'var(--vw-color-amber-600)', dash: '2 3' },
];

/** Cumulative cost lines by month. Plain SVG, sized by its viewBox. */
function CostCurve({ points, budget }: { points: CostCurvePoint[]; budget: number }) {
  const months = [...new Set(points.map((p) => p.month))];
  const W = 900, H = 240, L = 64, R = 12, Tp = 12, B = 28;
  const max = Math.max(budget, ...points.map((p) => p.value)) * 1.05 || 1;
  const x = (i: number) => L + (months.length <= 1 ? 0 : (i / (months.length - 1)) * (W - L - R));
  const y = (v: number) => Tp + (1 - v / max) * (H - Tp - B);
  const every = Math.max(1, Math.ceil(months.length / 12));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 260 }} role="img" aria-label="Cumulative cost by month">
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--vw-color-slate-100)" /><text x={L - 8} y={y(v) + 4} fontSize={11} textAnchor="end" fill="var(--vw-color-slate-500)">{money(v)}</text></g>)}
        <line x1={L} x2={W - R} y1={y(budget)} y2={y(budget)} stroke="var(--vw-color-green-600)" strokeDasharray="6 4" />
        <text x={W - R} y={y(budget) - 4} fontSize={11} textAnchor="end" fill="var(--vw-color-green-700)">Approved budget {money(budget)}</text>
        {months.map((m, i) => i % every === 0 && <text key={m} x={x(i)} y={H - 8} fontSize={11} textAnchor="middle" fill="var(--vw-color-slate-500)">{m}</text>)}
        {SERIES.map((s) => {
          const pts = months.map((m, i) => { const p = points.find((q) => q.month === m && q.series === s.key); return p ? `${x(i)},${y(p.value)}` : null; }).filter(Boolean);
          return pts.length > 1 ? <polyline key={s.key} points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} /> : null;
        })}
      </svg>
      <div className="vw-flex vw-gap-lg vw-wrap" style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-600)' }}>
        {SERIES.map((s) => <span key={s.key} className="vw-inline-flex vw-items-center" style={{ gap: 6 }}><svg width={18} height={6}><line x1={0} x2={18} y1={3} y2={3} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} /></svg>{s.key}</span>)}
      </div>
    </div>
  );
}

export default function ProjectCostTab({ project }: { project: Project }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const cost = useProjectCost(project);
  const allMilestones = useRecords<Milestone>('milestones', 5000);
  const milestones = useMemo(() => allMilestones.filter((m) => m.projectId === project.id), [allMilestones, project.id]);
  const vendors = (useEntityList('vendors', { pageSize: 1000 }).data?.data ?? []) as unknown as Vendor[];
  const createCO = useEntityCreate('changeOrders');
  const updateCO = useEntityUpdate('changeOrders');
  const audit = useRecordAudit();
  const curve = useMemo(() => (cost ? buildCostCurve(project, cost, milestones) : []), [project, cost, milestones]);
  if (!cost) return null;

  const setStatus = (co: ChangeOrder, status: string, extra: Record<string, unknown> = {}) =>
    updateCO.mutate({ id: co.id, data: { status, updatedAt: new Date().toISOString(), ...extra } }, { onSuccess: () => { audit('ChangeOrder', co.coId, status, `Change order "${co.title}" → ${status}`); message.success(`Change order ${status.toLowerCase()}`); } });
  const submit = async () => {
    const v = await form.validateFields();
    const id = `CO-${Date.now().toString(36).toUpperCase()}`;
    await createCO.mutateAsync({ id, coId: id, ...env(), projectId: project.id, title: v.title, reason: v.reason, status: 'Submitted', budgetDelta: v.budgetDelta ?? 0, scheduleImpactDays: v.scheduleImpactDays ?? 0, description: v.description ?? v.title, requestedBy: v.requestedBy || 'You', raisedAt: new Date().toISOString() });
    audit('ChangeOrder', id, 'created', `Raised change order ${v.title} (${signed(v.budgetDelta ?? 0)})`);
    message.success('Change order raised'); setOpen(false); form.resetFields();
  };
  const pctOf = (v: number) => (cost.approvedBudget ? `${Math.round((v / cost.approvedBudget) * 100)}% of budget` : undefined);

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <SummaryRow title="Cost" items={[
        { label: 'Approved budget', value: money(cost.approvedBudget), sub: cost.approvedDelta ? `${money(cost.baseBudget)} base ${signed(cost.approvedDelta)} changes` : 'No approved changes' },
        { label: 'Committed', value: money(cost.committed), sub: pctOf(cost.committed) },
        { label: 'Spent', value: money(cost.actual), sub: pctOf(cost.actual), tone: cost.actual > cost.approvedBudget ? 'bad' : undefined },
        { label: 'Forecast at completion', value: money(cost.eac), sub: cost.variance < 0 ? `${money(-cost.variance)} over budget` : `${money(cost.variance)} under budget`, tone: cost.variance < 0 ? 'bad' : 'ok' },
        { label: 'Pending change orders', value: cost.pendingDelta ? signed(cost.pendingDelta) : 'None', sub: cost.pendingDelta ? 'submitted, not yet approved' : undefined, tone: cost.pendingDelta > 0 ? 'warn' : undefined },
        { label: 'Schedule impact', value: cost.scheduleImpactDays ? `${cost.scheduleImpactDays > 0 ? '+' : ''}${cost.scheduleImpactDays} days` : 'None', sub: 'from approved change orders' },
      ]} />

      <VwCard title="Cost over time" extra={<Muted>cumulative, by month</Muted>}>
        {curve.length ? <CostCurve points={curve} budget={cost.approvedBudget} /> : <div className="vw-card-description">The project has no planned dates, so there is no curve to draw.</div>}
        <div className="vw-card-description" style={{ marginTop: 'var(--vw-space-sm)' }}>Planned spreads the approved budget over the milestone dates. Committed steps up when a purchase order is placed. Spent is the paid draws to date. Forecast runs from today's spend to the forecast at completion.</div>
      </VwCard>

      <VwCard title="Change orders" extra={<Button size="small" onClick={() => { form.resetFields(); setOpen(true); }}>Raise change order</Button>}>
        <DataTable rows={cost.changeOrders} rowKey={(c) => c.id} empty="No change orders. The approved budget equals the baseline."
          cols={[
            { key: 'title', title: 'Change order', wrap: true, render: (c) => c.title },
            { key: 'reason', title: 'Reason', render: (c) => c.reason },
            { key: 'b', title: 'Budget', align: 'right', render: (c) => <span style={{ color: c.budgetDelta > 0 ? 'var(--vw-color-red-600)' : c.budgetDelta < 0 ? 'var(--vw-color-green-700)' : undefined }}>{signed(c.budgetDelta)}</span> },
            { key: 's', title: 'Schedule', align: 'right', render: (c) => (c.scheduleImpactDays ? `${c.scheduleImpactDays > 0 ? '+' : ''}${c.scheduleImpactDays} d` : '—') },
            { key: 'st', title: 'Status', render: (c) => <VwChip variant={CO_TONE[c.status as keyof typeof CO_TONE] ?? 'neutral'}>{c.status}</VwChip> },
            { key: 'act', title: '', align: 'right', render: (c) => c.status === 'Submitted' ? (
              <span className="vw-inline-flex vw-gap-xs"><Button size="small" type="primary" onClick={() => setStatus(c, 'Approved', { approvedBy: 'You', approvedAt: new Date().toISOString() })}>Approve</Button><Button size="small" danger onClick={() => setStatus(c, 'Rejected')}>Reject</Button></span>
            ) : c.status === 'Draft' ? <Button size="small" onClick={() => setStatus(c, 'Submitted')}>Submit</Button> : c.approvedAt ? <Muted>{fmtDate(c.approvedAt)}</Muted> : null },
          ]} />
      </VwCard>

      <VwCard title="Purchase orders behind the commitment" extra={<Muted>{cost.pos.length} orders on {cost.boms.length} bills of materials</Muted>}>
        <DataTable rows={cost.pos} rowKey={(p) => p.id} empty="No purchase orders yet. They are created when procurement is generated for the project."
          cols={[
            { key: 'id', title: 'Order', render: (p) => p.poId },
            { key: 'v', title: 'Vendor', render: (p) => vendors.find((x) => x.id === p.vendorId)?.name ?? '—' },
            { key: 'st', title: 'Status', render: (p) => <VwChip variant={PO_TONE[p.status] ?? 'neutral'}>{p.status}</VwChip> },
            { key: 'c', title: 'Value', align: 'right', render: (p) => money(p.plannedCost) },
            { key: 'a', title: 'Paid', align: 'right', render: (p) => money(p.actualSpend) },
            { key: 'bar', title: '', render: (p) => <Bar value={p.actualSpend} max={p.plannedCost} over={p.actualSpend > p.plannedCost} width={90} /> },
          ]} />
      </VwCard>

      <Modal title="Raise change order" open={open} onOk={submit} confirmLoading={createCO.isPending} onCancel={() => setOpen(false)} okText="Raise and submit for approval" forceRender width={560}>
        <Form form={form} layout="vertical" initialValues={{ reason: 'Scope change', budgetDelta: 0, scheduleImpactDays: 0 }}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input placeholder="e.g. Rock excavation, unforeseen ground conditions" /></Form.Item>
          <Form.Item name="reason" label="Reason" rules={[{ required: true }]}><Select placeholder="Select reason" options={CHANGE_ORDER_REASON.map((r) => ({ value: r, label: r }))} /></Form.Item>
          <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
            <Form.Item name="budgetDelta" label="Budget impact ($)" tooltip="Positive increases the approved budget; negative reduces it"><InputNumber style={{ width: '100%' }} step={50000} /></Form.Item>
            <Form.Item name="scheduleImpactDays" label="Schedule impact (days)"><InputNumber style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="requestedBy" label="Requested by"><Input placeholder="You" /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea placeholder="Why the budget or schedule changes" rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
