import { validateWizardFields } from '../../../shared/utils/validateWizardFields';
import { useState } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select, Steps, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import dayjs from 'dayjs';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { PROJECT_TEMPLATE_CATEGORY } from '../../../mock/data/enums';
import type { ProjectTemplate, ProjectTemplateCategory } from '../../../mock/data/enums';
import { TEMPLATE_REGISTRY, TEMPLATES_BY_CATEGORY } from '../lib/projectTemplates';
import { useCreateProjectFromTemplate } from '../lib/createFlows';
import type { Program, DataCenter } from '../../../mock/data/types';

const { Text, Title } = Typography;
const catColor: Record<ProjectTemplateCategory, string> = { IT: 'blue', Network: 'geekblue', Facility: 'purple', Construction: 'orange' };

export default function NewProjectWizard({ open, onClose, onCreated, lockedProgramId }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void; lockedProgramId?: string }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<ProjectTemplate | null>(null);
  const create = useCreateProjectFromTemplate();
  const programs = (useEntityList('programs', { pageSize: 200 }).data?.data ?? []) as unknown as Program[];
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];
  const def = template ? TEMPLATE_REGISTRY[template] : null;

  const reset = () => { setStep(0); setTemplate(null); form.resetFields(); };
  const close = () => { reset(); onClose(); };

  const pickTemplate = (t: ProjectTemplate) => {
    setTemplate(t);
    form.setFieldsValue({ budget: TEMPLATE_REGISTRY[t].defaultBudget });
    setStep(1);
  };

  const submit = async () => {
    const v = await validateWizardFields(form); if (!v) return;
    if (!template || !def) return;
    const [start, end] = v.dates ?? [];
    const detail: Record<string, unknown> = {};
    def.fields.forEach((f) => { if (v[f.name] !== undefined) detail[f.name] = v[f.name]; });
    const id = await create({
      name: v.name, programId: v.programId, template, managerName: v.managerName, dataCenterId: v.dataCenterId,
      plannedStart: (start ?? dayjs()).toISOString(), plannedEnd: (end ?? dayjs().add(120, 'day')).toISOString(),
      budget: v.budget, detail,
    });
    message.success(`Project created from ${template} — milestones & tasks generated`);
    close();
    onCreated?.(id);
  };

  const stepItems = [{ title: 'Template' }, { title: 'Details' }];

  return (
    <Modal className="vw-wizard-modal" title="New project" open={open} onCancel={close} width={720} destroyOnClose
      footer={step === 0 ? <Button onClick={close}>Cancel</Button> : [
        <Button key="cancel" onClick={close}>Cancel</Button>,
        <Button key="back" onClick={() => setStep(0)}>Back</Button>,
        <Button key="create" type="primary" onClick={submit}>Create project</Button>,
      ]}>
      <div className="vw-wizard-modal-steps"><Steps responsive={false} current={step} items={stepItems} size="small"  /></div>
      <div className="vw-wizard-modal-content" key={step}>

      {step === 0 && (
        <div>
          {PROJECT_TEMPLATE_CATEGORY.map((cat) => (
            <div key={cat} style={{ marginBottom: 18 }}>
              <Text strong style={{ color: "var(--vw-color-slate-500)" }}>{cat}</Text>
              <div className="vw-wizard-fields" style={{ marginTop: "var(--vw-space-sm)" }}>
                {TEMPLATES_BY_CATEGORY[cat].map((tpl) => (
                  <VwCard key={tpl} size="small" hoverable onClick={() => pickTemplate(tpl)} bodyStyle={{ padding: "var(--vw-space-md)" }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-xxs)" }}>
                      <Text strong>{tpl}</Text><VwChip color={catColor[cat]}>{cat}</VwChip>
                    </div>
                    <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{TEMPLATE_REGISTRY[tpl].description}</Text>
                    <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)", marginTop: 6 }}>{TEMPLATE_REGISTRY[tpl].milestones.length} milestones · {TEMPLATE_REGISTRY[tpl].tasks.length} tasks</div>
                  </VwCard>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 1 && def && (
        <Form form={form} layout="vertical" initialValues={{ programId: lockedProgramId }}>
          <div style={{ marginBottom: "var(--vw-space-md)" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)" }}><VwChip color={catColor[def.category]}>{def.category}</VwChip><Text strong>{template}</Text></div>
            <Text type="secondary" style={{ display: 'block', fontSize: "var(--vw-font-label-sm)", marginTop: "var(--vw-space-xxs)" }}>{def.description}</Text>
          </div>
          <Form.Item name="name" label="Project name" rules={[{ required: true }]}><Input placeholder={`${template} — DC1`} /></Form.Item>
          <div className="vw-wizard-fields">
            <Form.Item name="programId" label="Program" rules={[{ required: true }]}>
              <Select placeholder="Select program" disabled={!!lockedProgramId} showSearch optionFilterProp="label" options={programs.map((p) => ({ value: p.id, label: p.name }))} />
            </Form.Item>
            <Form.Item name="managerName" label="Project manager" rules={[{ required: true }]}><Input placeholder="PM name" /></Form.Item>
            <Form.Item name="dataCenterId" label="Data center"><Select placeholder="Select data center" allowClear showSearch optionFilterProp="label" options={dcs.map((d) => ({ value: d.id, label: d.name }))} /></Form.Item>
            <Form.Item name="budget" label="Budget ($)" rules={[{ required: true }]}><InputNumber placeholder="Enter budget ($)" min={0} step={100_000} style={{ width: '100%' }} formatter={(v) => `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item>
          </div>
          <Form.Item name="dates" label="Planned start → end" rules={[{ required: true }]}><DatePicker.RangePicker placeholder={["Start date", "End date"]} style={{ width: '100%' }} /></Form.Item>

          {def.fields.length > 0 && (
            <>
              <Title level={5} style={{ marginTop: "var(--vw-space-sm)" }}>{template} details</Title>
              <div className="vw-wizard-fields">
                {def.fields.map((f) => (
                  <Form.Item key={f.name} name={f.name} label={f.label} rules={f.required ? [{ required: true }] : undefined}>
                    {f.type === 'number' ? <InputNumber placeholder={`Enter ${f.label}`} style={{ width: '100%' }} addonAfter={f.suffix} />
                      : f.type === 'select' ? <Select placeholder={`Select ${f.label}`} allowClear options={(f.options ?? []).map((o) => ({ value: o, label: o }))} />
                      : f.type === 'textarea' ? <Input.TextArea placeholder={`Enter ${f.label}`} rows={2} />
                      : <Input placeholder={`Enter ${f.label}`} />}
                  </Form.Item>
                ))}
              </div>
            </>
          )}
        </Form>
      )}
      </div>
    </Modal>
  );
}
