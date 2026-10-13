/* Raise a work order for a project step. Shows, before anything is saved, the change class the work
   order's change request will get (standard, normal or emergency) and why; writes only through
   useChainActions().raiseWorkOrder, which creates the work order and its one change together. */
import { useMemo, useState } from 'react';
import { App, Checkbox, DatePicker, Drawer, Form, Input, InputNumber, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type * as T from '../../../../mock/data/types';
import { WORK_ORDER_TYPE, type WorkOrderType } from '../../../../mock/data/enums';
import { PEOPLE } from '../../../../mock/db/seed/ctx';
import { useRecords } from './useRecords';
import { VwChip, VwSegmented } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { classifyChange, type DeliveryData } from '../../lib/chain';
import { useChainActions } from '../../lib/workflowChain';
import { useParsedProcess } from '../../../workorders/lib/useWorkflows';
import { CLASS_TONE, WO_TYPE_LABEL } from './format';
import { Muted } from './kit';

interface Values {
  type: WorkOrderType; title: string; description?: string; stepId?: string; window: [Dayjs, Dayjs];
  rackIds?: string[]; assigneeName?: string; contractorVendorId?: string; crew?: string[]; priority: NonNullable<T.WorkOrder['priority']>;
  kw?: number; criticalServices?: boolean; liveSite?: boolean; emergency?: boolean; implementationPlan?: string; backoutPlan?: string;
}
const CLASS_NEXT: Record<T.ChangeClass, string> = {
  Standard: 'Approved at once by its pre-approved template. No change board. The work order is Ready to assign.',
  Normal: 'Goes through the approval matrix and the weekly change board. The work order waits for approval.',
  Emergency: 'Approved by the emergency board on demand. A review after the work is mandatory.',
};
const STEP_TYPES = new Set(['bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:SubProcess', 'bpmn:CallActivity', 'bpmn:BusinessRuleTask']);

export function RaiseWorkOrderDrawer({ open, onClose, d, project, program, plan, process, defaultStepId }: {
  open: boolean; onClose: () => void; d: DeliveryData; project: T.Project; program?: T.Program; plan?: T.PlannerPlan; process?: T.ProcessInstance; defaultStepId?: string;
}) {
  const { message } = App.useApp();
  const chain = useChainActions();
  const [form] = Form.useForm<Values>();
  const [kind, setKind] = useState<'internal' | 'contractor'>('internal');
  const [busy, setBusy] = useState(false);
  const parsed = useParsedProcess(process?.definitionKey);
  const racks = useRecords<T.Rack>('racks', 10000);
  const siteRacks = useMemo(() => racks.filter((r) => r.dataCenterId === project.dataCenterId), [racks, project.dataCenterId]);
  const steps = useMemo(() => Object.values(parsed.data?.nodes ?? {}).filter((n) => STEP_TYPES.has(n.type)), [parsed.data]);
  const v = Form.useWatch([], form) as Partial<Values> | undefined;

  const preview = (() => {
    if (!v?.type) return undefined;
    const draft = { type: v.type, dataCenterId: project.dataCenterId, plannedStart: v.window?.[0]?.toISOString(), plannedEnd: v.window?.[1]?.toISOString() } as T.WorkOrder;
    return classifyChange(d, draft, { kw: v.kw, devices: v.rackIds?.length, criticalServices: v.criticalServices, liveSite: v.liveSite, emergency: v.emergency });
  })();

  const submit = async () => {
    const x = await form.validateFields();
    setBusy(true);
    try {
      const r = chain.raiseWorkOrder(d, {
        type: x.type, title: x.title, description: x.description, dataCenterId: project.dataCenterId, projectId: project.id, programId: program?.id,
        plannerPlanId: project.plannerPlanId ?? plan?.id, projectStepId: x.stepId, plannedStart: x.window[0].toISOString(), plannedEnd: x.window[1].toISOString(),
        rackIds: x.rackIds, assigneeKind: kind, assigneeName: kind === 'internal' ? x.assigneeName : undefined, contractorVendorId: kind === 'contractor' ? x.contractorVendorId : undefined,
        crew: x.crew, priority: x.priority, emergency: x.emergency, kw: x.kw, criticalServices: x.criticalServices, liveSite: x.liveSite,
        implementationPlan: x.implementationPlan, backoutPlan: x.backoutPlan,
      });
      message.success(`${r.workOrder.woId} raised with ${r.change.changeClass?.toLowerCase()} change ${r.change.chgId}`);
      form.resetFields(); onClose();
    } catch (e) { message.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Drawer open={open} onClose={onClose} width={560} destroyOnHidden title={`Raise work order · ${project.projId}`}
      extra={<Button type="primary" loading={busy} onClick={() => void submit()}>Raise work order and change</Button>}>
      <div className="vw-flex vw-flex-col vw-gap-md">
        <div className="vw-card-description">Every work order raises one change request. The change class decides who approves it before the work can start.</div>
        <div className="vw-card-child-shaded" style={{ padding: 'var(--vw-space-md)' }}>
          {!preview ? <Muted>Pick a work type to see which change class the change request will get.</Muted> : (
            <div className="vw-flex vw-flex-col vw-gap-xs">
              <div className="vw-flex vw-items-center vw-gap-sm"><span className="vw-card-title-sm">Change class</span><VwChip variant={CLASS_TONE[preview.changeClass]}>{preview.changeClass}</VwChip>{preview.template && <Muted size="xs">template {preview.template.name}</Muted>}</div>
              <div className="vw-card-description">{CLASS_NEXT[preview.changeClass]}</div>
              {preview.reasons.map((r, i) => <Muted key={i} size="xs">{r}</Muted>)}
              {kind === 'contractor' && <Muted size="xs">Contractor crews need a site access request before work starts.</Muted>}
            </div>
          )}
        </div>
        <Form form={form} layout="vertical" requiredMark={false}
          initialValues={{ priority: 'Medium', stepId: defaultStepId, window: [dayjs().add(7, 'day').hour(9).minute(0), dayjs().add(7, 'day').hour(17).minute(0)] }}>
          <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
            <Form.Item name="type" label="Work type" rules={[{ required: true, message: 'Pick the kind of work' }]}>
              <Select placeholder="Select work type" options={WORK_ORDER_TYPE.map((t) => ({ value: t, label: WO_TYPE_LABEL[t] ?? t }))} />
            </Form.Item>
            <Form.Item name="stepId" label="Process step">
              <Select allowClear placeholder={process ? 'Select the step this work belongs to' : 'No process running'} disabled={!process} options={steps.map((n) => ({ value: n.id, label: n.name }))} />
            </Form.Item>
          </div>
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Give the work order a title' }]}><Input placeholder="e.g. Install and cable racks R01 to R04" /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} placeholder="What is done, and any access or safety notes" /></Form.Item>
          <Form.Item name="window" label="Planned window" rules={[{ required: true, message: 'Set the planned window' }]}>
            <DatePicker.RangePicker showTime={{ format: 'HH:mm' }} format="D MMM YYYY HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="rackIds" label="Racks" extra={siteRacks.length ? undefined : 'No racks recorded at this site.'}>
            <Select mode="multiple" allowClear placeholder="Select racks the work touches" disabled={!siteRacks.length} optionFilterProp="label" options={siteRacks.map((r) => ({ value: r.id, label: r.name }))} maxTagCount="responsive" />
          </Form.Item>
          <Form.Item label="Done by">
            <VwSegmented value={kind} onChange={(x) => setKind(x as 'internal' | 'contractor')} options={[{ value: 'internal', label: 'Own technicians' }, { value: 'contractor', label: 'Contractor' }]} />
          </Form.Item>
          <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
            {kind === 'internal' ? (
              <Form.Item name="assigneeName" label="Technician"><Select allowClear showSearch placeholder="Assign later or pick a person" options={PEOPLE.map((p) => ({ value: p.name, label: `${p.name} · ${p.role}` }))} /></Form.Item>
            ) : (
              <Form.Item name="contractorVendorId" label="Contractor" rules={[{ required: true, message: 'Pick the contractor company' }]}><Select showSearch optionFilterProp="label" placeholder="Select contractor" options={d.vendors.map((x) => ({ value: x.id, label: `${x.name} · ${x.category}` }))} /></Form.Item>
            )}
            <Form.Item name="crew" label="Crew"><Select mode="tags" placeholder="Type names, press Enter" /></Form.Item>
          </div>
          <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
            <Form.Item name="priority" label="Priority"><Select options={['Low', 'Medium', 'High', 'Critical'].map((p) => ({ value: p, label: p }))} /></Form.Item>
            <Form.Item name="kw" label="Power added (kW)"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
          </div>
          <div className="vw-flex vw-gap-lg vw-wrap" style={{ marginBottom: 'var(--vw-space-md)' }}>
            <Form.Item name="liveSite" valuePropName="checked" noStyle><Checkbox>Work in a live area</Checkbox></Form.Item>
            <Form.Item name="criticalServices" valuePropName="checked" noStyle><Checkbox>A critical service is affected</Checkbox></Form.Item>
            <Form.Item name="emergency" valuePropName="checked" noStyle><Checkbox>Emergency</Checkbox></Form.Item>
          </div>
          <Form.Item name="implementationPlan" label="Implementation plan"><Input.TextArea rows={2} placeholder="Leave empty to use the standard template's steps" /></Form.Item>
          <Form.Item name="backoutPlan" label="Back-out plan"><Input.TextArea rows={2} placeholder="How the work is undone if it fails" /></Form.Item>
        </Form>

      </div>
    </Drawer>
  );
}
