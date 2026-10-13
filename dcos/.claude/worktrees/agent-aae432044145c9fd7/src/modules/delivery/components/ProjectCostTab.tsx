import { useState } from 'react';
import { App, Col, Empty, Form, Input, InputNumber, Modal, Progress, Row, Select, Space, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined, CheckOutlined, CloseOutlined, SendOutlined, DollarOutlined, FileProtectOutlined, WalletOutlined, RiseOutlined } from '../../../shared/icons';
import { Line } from '@ant-design/charts';
import { useEntityCreate, useEntityUpdate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { VwCard, VwChip, ChartAutoFitBox } from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { CHANGE_ORDER_REASON } from '../../../mock/data/enums';
import type { Project, ChangeOrder, Milestone } from '../../../mock/data/types';
import { useProjectCost, buildCostCurve } from '../lib/cost';

const { Text } = Typography;
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'You', createdById: 'me' });
const money = (v: number) => Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}k`;
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;
const coColor: Record<string, string> = { Draft: 'default', Submitted: 'gold', Approved: 'green', Rejected: 'red' };

export default function ProjectCostTab({ project }: { project: Project }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const cost = useProjectCost(project);
  const milestones = (useEntityList('milestones', { filters: [{ field: 'projectId', operator: 'eq', value: project.id }], pageSize: 200 }).data?.data ?? []) as unknown as Milestone[];
  const createCO = useEntityCreate('changeOrders');
  const updateCO = useEntityUpdate('changeOrders');
  const audit = useRecordAudit();
  if (!cost) return null;

  const curve = buildCostCurve(project, cost, milestones);
  const spentPct = cost.approvedBudget ? Math.round((cost.actual / cost.approvedBudget) * 100) : 0;
  const commitPct = cost.approvedBudget ? Math.round((cost.committed / cost.approvedBudget) * 100) : 0;

  const setStatus = (co: ChangeOrder, status: string, extra: Record<string, unknown> = {}) =>
    updateCO.mutate({ id: co.id, data: { status, updatedAt: new Date().toISOString(), ...extra } }, { onSuccess: () => { audit('ChangeOrder', co.coId, status, `Change order "${co.title}" → ${status}`); message.success(`Change order ${status}`); } });

  const submit = async () => {
    const v = await form.validateFields();
    const id = `CO-${Date.now().toString(36).toUpperCase()}`;
    await createCO.mutateAsync({ id, coId: id, ...env(), projectId: project.id, title: v.title, reason: v.reason, status: 'Submitted', budgetDelta: v.budgetDelta ?? 0, scheduleImpactDays: v.scheduleImpactDays ?? 0, description: v.description ?? v.title, requestedBy: v.requestedBy || 'You', raisedAt: new Date().toISOString() });
    audit('ChangeOrder', id, 'created', `Raised change order ${v.title} (${signed(v.budgetDelta ?? 0)})`);
    message.success('Change order raised');
    setOpen(false); form.resetFields();
  };

  const coColumns = [
    { title: 'Change order', dataIndex: 'title', ellipsis: true },
    { title: 'Reason', dataIndex: 'reason', width: 150, render: (r: string) => <VwChip>{r}</VwChip> },
    { title: 'Δ Budget', dataIndex: 'budgetDelta', width: 110, align: 'right' as const, render: (v: number) => <Text style={{ color: v >= 0 ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)' }}>{signed(v)}</Text> },
    { title: 'Δ Schedule', dataIndex: 'scheduleImpactDays', width: 100, align: 'right' as const, render: (v: number) => v ? `${v > 0 ? '+' : ''}${v}d` : '—' },
    { title: 'Status', dataIndex: 'status', width: 110, render: (s: string) => <VwChip color={coColor[s]}>{s}</VwChip> },
    {
      title: '', key: 'act', width: 170, render: (_: unknown, co: ChangeOrder) => co.status === 'Submitted' ? (
        <Space size={4}>
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setStatus(co, 'Approved', { approvedBy: 'You', approvedAt: new Date().toISOString() })}>Approve</Button>
          <Button size="small" danger icon={<CloseOutlined />} onClick={() => setStatus(co, 'Rejected')} />
        </Space>
      ) : co.status === 'Draft' ? (
        <Button size="small" icon={<SendOutlined />} onClick={() => setStatus(co, 'Submitted')}>Submit</Button>
      ) : co.approvedAt ? <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{co.approvedAt.slice(0, 10)}</Text> : null,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md">
        <KPICard title="Approved budget" value={money(cost.approvedBudget)} icon={<DollarOutlined />} iconTone="success" />
        <KPICard title="Committed" value={money(cost.committed)} suffix={`(${commitPct}%)`} icon={<FileProtectOutlined />} iconTone="cyan" />
        <KPICard title="Actual spend" value={money(cost.actual)} suffix={`(${spentPct}%)`} color={cost.actual > cost.approvedBudget ? 'var(--vw-color-red-600)' : undefined} icon={<WalletOutlined />} iconTone="purple" />
        <KPICard title="Forecast (EAC)" value={money(cost.eac)} color={cost.variance < 0 ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)'} icon={<RiseOutlined />} iconTone={cost.variance < 0 ? 'error' : 'success'} />
      </div>

      {cost.pendingDelta !== 0 && (
        <VwCard size="small" style={{ background: '#fffbe6', borderColor: '#ffe58f' }}>
          <Text>Pending exposure: <strong>{signed(cost.pendingDelta)}</strong> in submitted change orders not yet baselined. Approving them will move the approved budget {cost.scheduleImpactDays ? `(and add ${cost.scheduleImpactDays}d of approved schedule impact already)` : ''}.</Text>
        </VwCard>
      )}

      <VwCard size="small" title="Cost S-curve — planned vs actual vs forecast"
        extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>committed {money(cost.committed)} · actual {money(cost.actual)}</Text>}>
        {curve.length ? (
          <ChartAutoFitBox height={280}>
            <Line data={curve} xField="month" yField="value" colorField="series" shapeField="smooth" autoFit
              scale={{ color: { domain: ['Planned', 'Committed', 'Actual', 'Forecast'], range: ['#cbd5e1', '#a78bfa', '#2563eb', '#f59e0b'] } }}
              axis={{ x: { labelFontSize: 10 }, y: { labelFormatter: (v: number) => money(v) } }}
              legend={{ color: { position: 'top' } }} />
          </ChartAutoFitBox>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No schedule dates to plot a curve" />}
        <div style={{ marginTop: "var(--vw-space-sm)" }}>
          <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Planned is the approved budget cost-loaded across milestone dates; committed steps up as each PO is ordered; actual is the paid draws to date; forecast rises from today’s actual to EAC.</Text>
        </div>
      </VwCard>

      <VwCard size="small" title={`Change orders (${cost.changeOrders.length})`} extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>Raise change order</Button>}>
        {cost.changeOrders.length ? (
          <Table<ChangeOrder> rowKey="id" size="small" dataSource={cost.changeOrders} columns={coColumns} pagination={false} scroll={{ x: 'max-content' }} />
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No change orders — the approved budget equals the baseline" />}
      </VwCard>

      <VwCard size="small" title="Commitment vs budget">
        <div style={{ marginBottom: 6 }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Committed (POs on order)</Text><Progress percent={commitPct} strokeColor="#2563eb" /></div>
        <div><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Actual spend</Text><Progress percent={spentPct} strokeColor={cost.actual > cost.approvedBudget ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)'} /></div>
        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Derived from {cost.pos.length} purchase order(s) across {cost.boms.length} BOM(s) — manage them on the Procurement tab.</Text>
      </VwCard>

      <Modal title="Raise change order" open={open} onOk={submit} confirmLoading={createCO.isPending} onCancel={() => setOpen(false)} okText="Raise (submit for approval)" forceRender width={560}>
        <Form form={form} layout="vertical" initialValues={{ reason: 'Scope change', budgetDelta: 0, scheduleImpactDays: 0 }}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input placeholder="Rock excavation — unforeseen ground conditions" /></Form.Item>
          <Form.Item name="reason" label="Reason" rules={[{ required: true }]}><Select placeholder="Select reason" options={CHANGE_ORDER_REASON.map((r) => ({ value: r, label: r }))} /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="budgetDelta" label="Budget impact ($)" tooltip="Positive increases the approved budget; negative reduces it"><InputNumber placeholder="Enter budget impact ($)" style={{ width: '100%' }} step={50000} formatter={(v) => `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
            <Col span={12}><Form.Item name="scheduleImpactDays" label="Schedule impact (days)"><InputNumber placeholder="Enter schedule impact (days)" style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="requestedBy" label="Requested by"><Input placeholder="You" /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" rows={2} /></Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
