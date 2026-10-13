import { validateWizardFields } from '../../../shared/utils/validateWizardFields';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App, Steps, Form, Input, Select, InputNumber, Switch, Space } from 'antd';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, KV, Panel } from '../../../ops/ui/kit';

import { useEntityCreate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { PLAN_TYPE, PRIORITY, RISK_LEVEL, PLAN_EXEC_PATH, CHANGE_TYPE, PROJECT_TEMPLATE } from '../../../mock/data/enums';
import type { PlanType, PlanExecPath, ProjectTemplate } from '../../../mock/data/enums';
import type { DataCenter } from '../../../mock/data/types';
import { PLAN_DEFAULT_PATH, PLAN_DEFAULT_TEMPLATE, planToChangeType, PLAN_TYPE_FIELDS, TEMPLATE_MILESTONES } from '../lib/planExec';
import { PROGRAM_BLUEPRINTS, getBlueprint, blueprintForDcType } from '../../delivery/lib/programBlueprints';
import { dcTypeByName } from '../../../mock/data/dcTypes';

export default function PlanWizard() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [sp] = useSearchParams();
  const initType = (sp.get('type') as PlanType | null) ?? undefined;
  const num = (k: string) => { const v = sp.get(k); return v != null && v !== '' ? Number(v) : undefined; };
  const [step, setStep] = useState(0);
  const [vals, setVals] = useState<Record<string, unknown>>(() => (initType ? { type: initType } : {}));
  const [path, setPath] = useState<PlanExecPath>(initType ? PLAN_DEFAULT_PATH[initType] : 'Change');
  const [template, setTemplate] = useState<ProjectTemplate>(initType ? PLAN_DEFAULT_TEMPLATE[initType] : PROJECT_TEMPLATE[0]);
  const [blueprintKey, setBlueprintKey] = useState<string>(PROGRAM_BLUEPRINTS[0]?.key ?? 'greenfield-dc');
  const create = useEntityCreate('plans');
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];

  const planType = (vals.type ?? form.getFieldValue('type')) as PlanType | undefined;
  const typeFields = planType ? PLAN_TYPE_FIELDS[planType] : [];

  const next = async () => {
    const v = await validateWizardFields(form); if (!v) return;
    const merged = { ...vals, ...v };
    setVals(merged);
    if (step === 0 && merged.type) { setPath(PLAN_DEFAULT_PATH[merged.type as PlanType]); setTemplate(PLAN_DEFAULT_TEMPLATE[merged.type as PlanType]); }
    // A Facility Build plan's data-centre type decides which programme blueprint it executes into.
    if (step === 1 && typeof merged.dcType === 'string') { const bp = blueprintForDcType(dcTypeByName(merged.dcType)?.key); setBlueprintKey(bp.key); form.setFieldValue('blueprintKey', bp.key); }
    setStep((s) => s + 1);
  };
  const back = () => setStep((s) => s - 1);

  const submit = async () => {
    const v = await validateWizardFields(form); if (!v) return;
    const all = { ...vals, ...v } as Record<string, unknown>;
    const type = all.type as PlanType;
    const detail: Record<string, unknown> = {};
    for (const f of PLAN_TYPE_FIELDS[type]) if (all[f.name] != null && all[f.name] !== '') detail[f.name] = all[f.name];
    const ts = new Date().toISOString();
    const id = `PLAN-${Date.now().toString(36).toUpperCase()}`;
    create.mutate({
      id, planId: id, title: all.title, type, status: 'Submitted', description: all.description ?? '',
      businessJustification: all.businessJustification ?? '', dataCenterId: all.dataCenterId, priority: all.priority ?? 'Medium',
      risk: all.risk ?? 'Medium', ownerName: all.ownerName ?? 'You', targetDate: all.targetDate ?? ts, estimatedCost: all.estimatedCost,
      detail: JSON.stringify(detail),
      execPath: path, changeType: path === 'Change' ? (all.changeType ?? planToChangeType(type)) : undefined,
      projectTemplate: path === 'Project' ? (all.projectTemplate ?? template) : undefined,
      blueprintKey: path === 'Programme' ? (all.blueprintKey ?? blueprintKey) : undefined,
      submittedAt: ts, customerId: 'CUST-001', isDeleted: false, createdAt: ts, updatedAt: ts, createdBy: 'You', createdById: 'me',
    }, { onSuccess: (rec: Record<string, unknown>) => { message.success('Plan submitted'); navigate(`/planning/legacy/${rec.id as string}`); } });
  };

  const renderField = (f: typeof typeFields[number]) => {
    const control = f.kind === 'number' ? <InputNumber placeholder={`Enter ${f.label}`} min={0} style={{ width: '100%' }} />
      : f.kind === 'bool' ? <Switch />
        : f.kind === 'select' ? <Select placeholder={`Select ${f.label}`} options={(f.options ?? []).map((o) => ({ value: o, label: o }))} />
          : <Input placeholder={`Enter ${f.label}`} />;
    return <Form.Item key={f.name} name={f.name} label={f.label} valuePropName={f.kind === 'bool' ? 'checked' : 'value'}>{control}</Form.Item>;
  };

  const stepTitles = ['Basics', `${planType ?? 'Type'} detail`, 'Review & route'];

  return (
    <OpsPage title="New Plan" description="Capture a plan, add its type-specific detail, then choose how it executes once approved">
      <Panel>
        <Steps current={step} size="small" responsive={false} items={stepTitles.map((title) => ({ title }))} />
      </Panel>

      <Panel title={stepTitles[step]} sub={`Step ${step + 1} of ${stepTitles.length}`}
        foot={<>
          <span className="row"><Btn variant="ghost" onClick={() => navigate('/planning/legacy')}>Cancel</Btn>{step > 0 && <Btn icon={ArrowLeft} onClick={back}>Back</Btn>}</span>
          <span className="row">
            {step < 2 && <Btn variant="filled" iconRight={ArrowRight} onClick={next}>Next</Btn>}
            {step === 2 && <Btn variant="filled" icon={Send} disabled={create.isPending} onClick={submit}>{create.isPending ? 'Submitting…' : 'Submit plan'}</Btn>}
          </span>
        </>}>
        <Form form={form} layout="vertical" initialValues={{ priority: 'Medium', risk: 'Medium', type: initType, title: sp.get('title') ?? undefined, dataCenterId: sp.get('dc') ?? undefined, powerKw: num('powerKw'), coolingKw: num('coolingKw'), quantity: num('quantity') }}>
          {step === 0 && (<>
            <Form.Item name="type" label="Plan type" rules={[{ required: true }]}><Select placeholder="Select plan type" options={PLAN_TYPE.map((t) => ({ value: t, label: t }))} onChange={(t) => setVals({ ...vals, type: t })} /></Form.Item>
            <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input placeholder="e.g. GPU cluster expansion — LON1 Hall 2" /></Form.Item>
            <Form.Item name="dataCenterId" label="Data center"><Select placeholder="Select data center" allowClear showSearch optionFilterProp="label" options={dcs.map((d) => ({ value: d.id, label: d.name }))} /></Form.Item>
            <Space wrap>
              <Form.Item name="priority" label="Priority"><Select placeholder="Select priority" style={{ width: 140 }} options={PRIORITY.map((p) => ({ value: p, label: p }))} /></Form.Item>
              <Form.Item name="risk" label="Risk"><Select placeholder="Select risk" style={{ width: 140 }} options={RISK_LEVEL.map((r) => ({ value: r, label: r }))} /></Form.Item>
              <Form.Item name="ownerName" label="Owner"><Input style={{ width: 200 }} placeholder="Capacity Planning" /></Form.Item>
            </Space>
          </>)}
          {step === 1 && (<>
            <p className="vw-label" style={{ margin: '0 0 var(--vw-space-md)' }}>Specifics for a <strong>{planType}</strong> — these flow into the change or project when this plan is executed.</p>
            <Space wrap size={[16, 0]} style={{ display: 'block' }}>{typeFields.map(renderField)}</Space>
            <Form.Item name="targetDate" label="Target date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="estimatedCost" label="Estimated cost (USD)"><InputNumber placeholder="Enter estimated cost (USD)" min={0} style={{ width: 220 }} /></Form.Item>
            <Form.Item name="businessJustification" label="Business justification" rules={[{ required: true }]}><Input.TextArea placeholder="Enter business justification" rows={3} /></Form.Item>
          </>)}
          {step === 2 && (<>
            <div style={{ marginBottom: 'var(--vw-space-md)' }}>
              <KV cols={2} items={[
                ['Type', String(planType)],
                ['Title', String((vals.title ?? form.getFieldValue('title')) ?? '')],
              ]} />
            </div>
            <Form.Item label="Execution route (once approved)" tooltip="Operational work → Change Request; a single build-out → Project; a greenfield facility → a Programme of sequenced projects.">
              <Select placeholder="Select execution route" value={path} onChange={(v) => setPath(v as PlanExecPath)} options={PLAN_EXEC_PATH.map((p) => ({ value: p, label: p === 'Change' ? 'Change Request' : p === 'Programme' ? 'Programme (multi-project build)' : 'Project' }))} />
            </Form.Item>
            {path === 'Change' && (
              <Form.Item name="changeType" label="Change type" initialValue={planType ? planToChangeType(planType) : undefined} rules={[{ required: true }]}>
                <Select placeholder="Select change type" options={CHANGE_TYPE.map((t) => ({ value: t, label: t }))} />
              </Form.Item>
            )}
            {path === 'Project' && (
              <>
                <Form.Item name="projectTemplate" label="Project template" initialValue={template} rules={[{ required: true }]}>
                  <Select placeholder="Select project template" onChange={(v) => setTemplate(v)} options={PROJECT_TEMPLATE.map((t) => ({ value: t, label: t }))} />
                </Form.Item>
                <span className="vw-label">Milestones created on execution:</span>
                <div className="row wrap" style={{ gap: 6, marginTop: 'var(--vw-space-sm)' }}>{(TEMPLATE_MILESTONES[template] ?? []).map((m, i) => <Chip key={m} tone="info">{i + 1}. {m}</Chip>)}</div>
              </>
            )}
            {path === 'Programme' && (
              <>
                <Form.Item name="blueprintKey" label="Programme blueprint" initialValue={blueprintKey} rules={[{ required: true }]}>
                  <Select placeholder="Select programme blueprint" onChange={(v) => setBlueprintKey(v)} options={PROGRAM_BLUEPRINTS.map((b) => ({ value: b.key, label: b.name }))} />
                </Form.Item>
                <span className="vw-label">Sequenced phases created on execution (each becomes a linked project):</span>
                <div className="row wrap" style={{ gap: 6, marginTop: 'var(--vw-space-sm)' }}>{(getBlueprint(blueprintKey)?.phases ?? []).map((p, i) => <Chip key={p.key} tone={p.longLead ? 'warning' : 'info'}>{i + 1}. {p.name}{p.longLead ? ' (long-lead)' : ''}</Chip>)}</div>
              </>
            )}
          </>)}
        </Form>
      </Panel>
    </OpsPage>
  );
}
