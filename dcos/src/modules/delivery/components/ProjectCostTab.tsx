/* Project cost: budget, commitment, spend and forecast as one summary row; the cost curve (planned,
   committed, actual, forecast) as a plain line chart; change orders that move the budget; and the
   purchase orders behind the commitment. */
import { useMemo, useState } from 'react';
import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { FileDiff, LineChart, Plus, ShoppingCart } from 'lucide-react';
import { Btn, Panel } from '../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { TimeChart } from '../../../ops/charts/TimeChart';
import { SERIES as PALETTE, INK } from '../../../ops/charts/core';
import { useEntityCreate, useEntityUpdate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { CHANGE_ORDER_REASON } from '../../../mock/data/enums';
import type { Project, ChangeOrder, Milestone, Vendor } from '../../../mock/data/types';
import { useProjectCost, buildCostCurve, type CostCurvePoint } from '../lib/cost';
import { DataTable, Muted, Bar, ToneChip } from './project/kit';
import { useRecords } from './project/useRecords';
import { money, PO_TONE, fmtDate } from './project/format';

const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'You', createdById: 'me' });
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;
const CO_TONE = { Draft: 'neutral', Submitted: 'warning', Approved: 'success', Rejected: 'error' } as const;
const SERIES: { key: CostCurvePoint['series']; color: string; dashed?: boolean }[] = [
  { key: 'Planned', color: INK.plan, dashed: true },
  { key: 'Committed', color: PALETTE[2] },
  { key: 'Actual', color: PALETTE[0] },
  { key: 'Forecast', color: '#d97706', dashed: true },
];

/** Cumulative cost lines by month on the Operate time chart, with the approved budget as the target rule. */
function CostCurve({ points, budget }: { points: CostCurvePoint[]; budget: number }) {
  const months = [...new Set(points.map((p) => p.month))];
  return (
    <TimeChart labels={months} height={240} format={money} target={{ value: budget, label: 'Approved budget' }}
      series={SERIES.map((s) => ({ key: s.key, label: s.key, color: s.color, kind: 'line' as const, dashed: s.dashed, values: months.map((m) => points.find((q) => q.month === m && q.series === s.key)?.value ?? null) }))} />
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
    <div className="col" style={{ gap: 16 }}>
      <StatGrid>
        <StatTile label="Approved budget" value={money(cost.approvedBudget)} sub={cost.approvedDelta ? `${money(cost.baseBudget)} base ${signed(cost.approvedDelta)} changes` : 'No approved changes'} />
        <StatTile label="Committed" value={money(cost.committed)} sub={pctOf(cost.committed)} />
        <StatTile label="Spent" value={<span style={{ color: cost.actual > cost.approvedBudget ? 'var(--vw-color-red-600)' : undefined }}>{money(cost.actual)}</span>} sub={pctOf(cost.actual)} subTone={cost.actual > cost.approvedBudget ? 'bad' : undefined} />
        <StatTile label="Forecast at completion" value={<span style={{ color: cost.variance < 0 ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-700)' }}>{money(cost.eac)}</span>} sub={cost.variance < 0 ? `${money(-cost.variance)} over budget` : `${money(cost.variance)} under budget`} subTone={cost.variance < 0 ? 'bad' : undefined} />
        <StatTile label="Pending change orders" value={<span style={{ color: cost.pendingDelta > 0 ? 'var(--vw-color-amber-700)' : undefined }}>{cost.pendingDelta ? signed(cost.pendingDelta) : 'None'}</span>} sub={cost.pendingDelta ? 'submitted, not yet approved' : undefined} subTone={cost.pendingDelta > 0 ? 'warn' : undefined} />
        <StatTile label="Schedule impact" value={cost.scheduleImpactDays ? `${cost.scheduleImpactDays > 0 ? '+' : ''}${cost.scheduleImpactDays} days` : 'None'} sub="from approved change orders" />
      </StatGrid>

      <Panel title="Cost over time" icon={LineChart} sub="cumulative, by month"
        foot={<Muted>Planned spreads the approved budget over the milestone dates. Committed steps up when a purchase order is placed. Spent is the paid draws to date. Forecast runs from today's spend to the forecast at completion.</Muted>}>
        {curve.length ? <CostCurve points={curve} budget={cost.approvedBudget} /> : <div className="vw-card-description">The project has no planned dates, so there is no curve to draw.</div>}
      </Panel>

      <Panel title="Change orders" icon={FileDiff} actions={<Btn icon={Plus} onClick={() => { form.resetFields(); setOpen(true); }}>Raise change order</Btn>}>
        <DataTable rows={cost.changeOrders} rowKey={(c) => c.id} empty="No change orders. The approved budget equals the baseline."
          cols={[
            { key: 'title', title: 'Change order', wrap: true, render: (c) => c.title },
            { key: 'reason', title: 'Reason', render: (c) => c.reason },
            { key: 'b', title: 'Budget', align: 'right', render: (c) => <span style={{ color: c.budgetDelta > 0 ? 'var(--vw-color-red-600)' : c.budgetDelta < 0 ? 'var(--vw-color-green-700)' : undefined }}>{signed(c.budgetDelta)}</span> },
            { key: 's', title: 'Schedule', align: 'right', render: (c) => (c.scheduleImpactDays ? `${c.scheduleImpactDays > 0 ? '+' : ''}${c.scheduleImpactDays} d` : '—') },
            { key: 'st', title: 'Status', render: (c) => <ToneChip v={CO_TONE[c.status as keyof typeof CO_TONE] ?? 'neutral'}>{c.status}</ToneChip> },
            { key: 'act', title: '', align: 'right', render: (c) => c.status === 'Submitted' ? (
              <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}><Btn size="xs" variant="filled" onClick={() => setStatus(c, 'Approved', { approvedBy: 'You', approvedAt: new Date().toISOString() })}>Approve</Btn><Btn size="xs" variant="danger-subtle" onClick={() => setStatus(c, 'Rejected')}>Reject</Btn></span>
            ) : c.status === 'Draft' ? <Btn size="xs" onClick={() => setStatus(c, 'Submitted')}>Submit</Btn> : c.approvedAt ? <Muted>{fmtDate(c.approvedAt)}</Muted> : null },
          ]} />
      </Panel>

      <Panel title="Purchase orders behind the commitment" icon={ShoppingCart} sub={`${cost.pos.length} orders on ${cost.boms.length} bills of materials`}>
        <DataTable rows={cost.pos} rowKey={(p) => p.id} empty="No purchase orders yet. They are created when procurement is generated for the project."
          cols={[
            { key: 'id', title: 'Order', render: (p) => p.poId },
            { key: 'v', title: 'Vendor', render: (p) => vendors.find((x) => x.id === p.vendorId)?.name ?? '—' },
            { key: 'st', title: 'Status', render: (p) => <ToneChip v={PO_TONE[p.status] ?? 'neutral'}>{p.status}</ToneChip> },
            { key: 'c', title: 'Value', align: 'right', render: (p) => money(p.plannedCost) },
            { key: 'a', title: 'Paid', align: 'right', render: (p) => money(p.actualSpend) },
            { key: 'bar', title: '', render: (p) => <Bar value={p.actualSpend} max={p.plannedCost} over={p.actualSpend > p.plannedCost} width={90} /> },
          ]} />
      </Panel>

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
