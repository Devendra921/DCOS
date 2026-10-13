/* Risks tab: the risk register (add, edit, delete), the risk predictor's proposals, and the permits editor. */
import { useMemo, useState } from 'react';
import { App, Drawer, Form, Input, InputNumber, Popconfirm, Select } from 'antd';
import { FileCheck2, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { fmtDate } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { Btn, Chip, Empty, Panel } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import type * as T from '../../../../mock/data/types';
import { SourceChip } from '../kit';
import { LEVELS, ToneValue, PERMIT_STATUS, RISK_DOMAINS, type PlanView } from './shared';

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

  const riskCols: Col<T.PlannerRisk>[] = useMemo(() => [
    { key: 'title', header: 'Risk', wrap: true, render: r => <span className="cell-2"><span className="vw-card-activity-label">{r.title}</span>{r.evidence && <small>{r.evidence}</small>}</span> },
    { key: 'domain', header: 'Domain', render: r => <Chip tone="neutral">{r.domain}</Chip> },
    { key: 'p', header: 'Probability', render: r => <Chip tone={LEVEL_TONE[r.probability]} dot>{r.probability}</Chip> },
    { key: 'i', header: 'Impact', render: r => <Chip tone={LEVEL_TONE[r.impact]} dot>{r.impact}</Chip> },
    { key: 'owner', header: 'Owner', render: r => r.owner || <Chip tone="warning">Unowned</Chip> },
    { key: 'm', header: 'Mitigation', wrap: true, render: r => r.mitigation ? <span style={{ fontSize: 'var(--vw-font-label-sm)' }}>{r.mitigation}</span> : <Chip tone="warning">None</Chip> },
    { key: 's', header: 'Source', render: r => <SourceChip source={r.source} /> },
    { key: 'a', header: '', render: r => <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}><Btn variant="ghost" size="xs" icon={Pencil} title="Edit risk" onClick={() => openRisk(r)} /><Popconfirm title="Delete this risk?" onConfirm={() => { saveRisks(plan.risks.filter(x => x.id !== r.id)); message.info('Risk removed'); }}><span><Btn variant="ghost" size="xs" icon={Trash2} title="Delete risk" /></span></Popconfirm></span> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [plan]);
  const permitCols: Col<T.PlannerPermit>[] = useMemo(() => [
    { key: 'name', header: 'Permit', render: p => <span className="vw-card-activity-label">{p.name}</span> },
    { key: 'auth', header: 'Authority', render: p => p.authority },
    { key: 'lead', header: 'Lead', align: 'right', render: p => <span className="num">{p.leadWeeks} wk</span> },
    { key: 'need', header: 'Needed before', render: p => <span className="num">{fmtDate(p.neededBefore)}</span> },
    { key: 'status', header: 'Status', render: p => <Chip tone={PERMIT_TONE[p.status]} dot>{p.status}</Chip> },
    { key: 'a', header: '', render: p => <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}><Btn variant="ghost" size="xs" icon={Pencil} title="Edit permit" onClick={() => openPermit(p)} /><Popconfirm title="Delete this permit?" onConfirm={() => { savePermits(plan.permits.filter(x => x.id !== p.id)); message.info('Permit removed'); }}><span><Btn variant="ghost" size="xs" icon={Trash2} title="Delete permit" /></span></Popconfirm></span> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [plan]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="col" style={{ gap: 16 }}>
        <StatGrid cols={3}>
          <StatTile label="Risks" value={plan.risks.length} sub={`${high} high impact`} />
          <StatTile label="Without owner or mitigation" value={<ToneValue tone={unowned ? 'warn' : 'ok'}>{unowned}</ToneValue>} sub="high-impact risks" />
          <StatTile label="Permits" value={plan.permits.length} sub={`${plan.permits.filter(p => p.status === 'Approved').length} approved`} />
        </StatGrid>
        <Panel flush icon={ShieldAlert} title="Risk register" count={plan.risks.length} actions={<Btn variant="filled" size="xs" icon={Plus} onClick={() => openRisk('new')}>Add risk</Btn>}>
          <DataTable rows={plan.risks} cols={riskCols} pageSize={200} empty={<Empty icon={ShieldAlert} title="No risks">No risks recorded yet.</Empty>} />
        </Panel>
        <Panel flush icon={FileCheck2} title="Permits" count={plan.permits.length} actions={<Btn size="xs" icon={Plus} onClick={() => openPermit('new')}>Add permit</Btn>}>
          <DataTable rows={plan.permits} cols={permitCols} pageSize={200} empty={<Empty icon={FileCheck2} title="No permits">No permits on this plan.</Empty>} />
        </Panel>
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
