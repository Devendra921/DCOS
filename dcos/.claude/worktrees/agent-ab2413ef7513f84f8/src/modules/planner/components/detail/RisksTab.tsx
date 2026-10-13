/* Risks tab: the risk register (add, edit, delete), the risk predictor's proposals, and the permits editor. */
import { useMemo, useState } from 'react';
import { App, Drawer, Form, Input, InputNumber, Popconfirm, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { VwCard, VwChip, fmtDate } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '../../../../shared/icons';
import type * as T from '../../../../mock/data/types';
import { SourceChip, Stat } from '../kit';
import { LEVELS, Muted, PERMIT_STATUS, RISK_DOMAINS, type PlanView } from './shared';

const LEVEL_TONE = { Low: 'success', Medium: 'warning', High: 'error' } as const;
const PERMIT_TONE: Record<T.PlannerPermit['status'], 'neutral' | 'info' | 'warning' | 'success' | 'error'> = { 'Not started': 'neutral', Applied: 'info', 'In review': 'warning', Approved: 'success', Expired: 'error' };
type RiskForm = Omit<T.PlannerRisk, 'id' | 'source' | 'evidence'>;
type PermitForm = Omit<T.PlannerPermit, 'id'>;

export function RisksTab({ v }: { v: PlanView }) {
  const { plan, actions } = v;
  const { message } = App.useApp();
  const [risk, setRisk] = useState<T.PlannerRisk | 'new' | null>(null);
  const [permit, setPermit] = useState<T.PlannerPermit | 'new' | null>(null);
  const [riskForm] = Form.useForm<RiskForm>();
  const [permitForm] = Form.useForm<PermitForm>();

  const high = plan.risks.filter(r => r.impact === 'High').length;
  const unowned = plan.risks.filter(r => r.impact === 'High' && (!r.owner || !r.mitigation)).length;

  const saveRisks = (risks: T.PlannerRisk[]) => actions.patchPlan(plan.id, { risks });
  const savePermits = (permits: T.PlannerPermit[]) => actions.patchPlan(plan.id, { permits });
  const nextId = (prefix: string, items: { id: string }[]) => { let i = items.length + 1; while (items.some(x => x.id === `${prefix}${i}`)) i++; return `${prefix}${i}`; };

  const openRisk = (r: T.PlannerRisk | 'new') => { setRisk(r); riskForm.setFieldsValue(r === 'new' ? { title: '', domain: 'Facility', probability: 'Medium', impact: 'Medium', owner: plan.ownerName, mitigation: '' } : r); };
  const saveRisk = async () => {
    const vals = await riskForm.validateFields();
    if (risk === 'new') saveRisks([...plan.risks, { id: nextId('R', plan.risks), ...vals, source: 'user' }]);
    else if (risk) saveRisks(plan.risks.map(r => (r.id === risk.id ? { ...r, ...vals } : r)));
    message.success(risk === 'new' ? 'Risk added' : 'Risk updated'); setRisk(null);
  };

  const openPermit = (p: T.PlannerPermit | 'new') => { setPermit(p); permitForm.setFieldsValue(p === 'new' ? { name: '', authority: '', leadWeeks: 8, neededBefore: new Date(plan.targetGoLive).toISOString().slice(0, 10), status: 'Not started' } : { ...p, neededBefore: p.neededBefore.slice(0, 10) }); };
  const savePermit = async () => {
    const vals = await permitForm.validateFields();
    const rec = { ...vals, neededBefore: new Date(vals.neededBefore).toISOString() };
    if (permit === 'new') savePermits([...plan.permits, { id: nextId('PM', plan.permits), ...rec }]);
    else if (permit) savePermits(plan.permits.map(p => (p.id === permit.id ? { ...p, ...rec } : p)));
    message.success(permit === 'new' ? 'Permit added' : 'Permit updated'); setPermit(null);
  };

  const riskCols: ColumnsType<T.PlannerRisk> = useMemo(() => [
    { title: 'Risk', dataIndex: 'title', key: 'title', render: (t: string, r) => <div><div style={{ fontWeight: 500 }}>{t}</div>{r.evidence && <Muted size="xs">{r.evidence}</Muted>}</div> },
    { title: 'Domain', dataIndex: 'domain', key: 'domain', render: (d: string) => <VwChip variant="neutral">{d}</VwChip> },
    { title: 'Probability', dataIndex: 'probability', key: 'p', render: (l: T.PlannerRisk['probability']) => <VwChip variant={LEVEL_TONE[l]}>{l}</VwChip> },
    { title: 'Impact', dataIndex: 'impact', key: 'i', render: (l: T.PlannerRisk['impact']) => <VwChip variant={LEVEL_TONE[l]}>{l}</VwChip> },
    { title: 'Owner', dataIndex: 'owner', key: 'owner', render: (o: string) => o || <VwChip variant="warning">Unowned</VwChip> },
    { title: 'Mitigation', dataIndex: 'mitigation', key: 'm', render: (m: string) => m ? <span style={{ fontSize: 'var(--vw-font-label-sm)' }}>{m}</span> : <VwChip variant="warning">None</VwChip> },
    { title: 'Source', dataIndex: 'source', key: 's', render: (s: T.PlannerParamSource) => <SourceChip source={s} /> },
    { title: '', key: 'a', render: (_: unknown, r) => <div className="vw-flex vw-gap-xs vw-justify-end"><Button size="small" icon={<EditOutlined />} aria-label="Edit risk" onClick={() => openRisk(r)} /><Popconfirm title="Delete this risk?" onConfirm={() => { saveRisks(plan.risks.filter(x => x.id !== r.id)); message.info('Risk removed'); }}><Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete risk" /></Popconfirm></div> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [plan]);
  const permitCols: ColumnsType<T.PlannerPermit> = useMemo(() => [
    { title: 'Permit', dataIndex: 'name', key: 'name', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Authority', dataIndex: 'authority', key: 'auth' },
    { title: 'Lead', dataIndex: 'leadWeeks', key: 'lead', align: 'right', render: (w: number) => `${w} wk` },
    { title: 'Needed before', dataIndex: 'neededBefore', key: 'need', render: (d: string) => fmtDate(d) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: T.PlannerPermit['status']) => <VwChip variant={PERMIT_TONE[s]}>{s}</VwChip> },
    { title: '', key: 'a', render: (_: unknown, p) => <div className="vw-flex vw-gap-xs vw-justify-end"><Button size="small" icon={<EditOutlined />} aria-label="Edit permit" onClick={() => openPermit(p)} /><Popconfirm title="Delete this permit?" onConfirm={() => { savePermits(plan.permits.filter(x => x.id !== p.id)); message.info('Permit removed'); }}><Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete permit" /></Popconfirm></div> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [plan]);

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-flex vw-flex-col vw-gap-md">
        <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Stat label="Risks" value={plan.risks.length} sub={`${high} high impact`} />
          <Stat label="Without owner or mitigation" value={unowned} sub="high-impact risks" tone={unowned ? 'warn' : 'ok'} />
          <Stat label="Permits" value={plan.permits.length} sub={`${plan.permits.filter(p => p.status === 'Approved').length} approved`} />
        </div>
        <VwCard title="Risk register" extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openRisk('new')}>Add risk</Button>}>
          {plan.risks.length ? <Table<T.PlannerRisk> size="small" rowKey="id" dataSource={plan.risks} columns={riskCols} pagination={false} /> : <div className="vw-card-description">No risks recorded yet.</div>}
        </VwCard>
        <VwCard title="Permits" extra={<Button size="small" icon={<PlusOutlined />} onClick={() => openPermit('new')}>Add permit</Button>}>
          {plan.permits.length ? <Table<T.PlannerPermit> size="small" rowKey="id" dataSource={plan.permits} columns={permitCols} pagination={false} /> : <div className="vw-card-description">No permits on this plan.</div>}
        </VwCard>
      </div>
      <Drawer title={risk === 'new' ? 'Add risk' : 'Edit risk'} open={risk !== null} onClose={() => setRisk(null)} width={420} destroyOnHidden
        footer={<div className="vw-flex vw-justify-end vw-gap-sm"><Button onClick={() => setRisk(null)}>Cancel</Button><Button type="primary" onClick={saveRisk}>{risk === 'new' ? 'Add' : 'Save'}</Button></div>}>
        <Form form={riskForm} layout="vertical" size="small">
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Describe the risk' }]}><Input /></Form.Item>
          <Form.Item name="domain" label="Domain"><Select options={RISK_DOMAINS.map(d => ({ value: d, label: d }))} /></Form.Item>
          <div className="vw-grid vw-grid-cols-2 vw-gap-sm">
            <Form.Item name="probability" label="Probability"><Select options={LEVELS.map(d => ({ value: d, label: d }))} /></Form.Item>
            <Form.Item name="impact" label="Impact"><Select options={LEVELS.map(d => ({ value: d, label: d }))} /></Form.Item>
          </div>
          <Form.Item name="owner" label="Owner" rules={[{ required: true, message: 'Every risk needs an owner' }]}><Input /></Form.Item>
          <Form.Item name="mitigation" label="Mitigation" rules={[{ required: true, message: 'State the mitigation' }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Drawer>
      <Drawer title={permit === 'new' ? 'Add permit' : 'Edit permit'} open={permit !== null} onClose={() => setPermit(null)} width={420} destroyOnHidden
        footer={<div className="vw-flex vw-justify-end vw-gap-sm"><Button onClick={() => setPermit(null)}>Cancel</Button><Button type="primary" onClick={savePermit}>{permit === 'new' ? 'Add' : 'Save'}</Button></div>}>
        <Form form={permitForm} layout="vertical" size="small">
          <Form.Item name="name" label="Permit" rules={[{ required: true, message: 'Name the permit' }]}><Input /></Form.Item>
          <Form.Item name="authority" label="Authority" rules={[{ required: true, message: 'Who grants it' }]}><Input /></Form.Item>
          <div className="vw-grid vw-grid-cols-2 vw-gap-sm">
            <Form.Item name="leadWeeks" label="Lead time (weeks)"><InputNumber min={1} max={120} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="neededBefore" label="Needed before" rules={[{ required: true, message: 'Set the gate date' }]}><Input type="date" /></Form.Item>
          </div>
          <Form.Item name="status" label="Status"><Select options={PERMIT_STATUS.map(d => ({ value: d, label: d }))} /></Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
