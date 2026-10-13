import { useState } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { VwChip } from '../../../shared/components/ux';
import type { DataCenter } from '../../../mock/data/types';
import { PROGRAM_STATUS, PROGRAM_TYPE } from '../../../mock/data/enums';
import type { ProgramType } from '../../../mock/data/enums';
import { useCreateProgram, useCreateProgramFromBlueprint } from '../lib/createFlows';
import { blueprintForProgramType, blueprintForDcType } from '../lib/programBlueprints';
import { DC_TYPES_BY_SEGMENT, DC_TYPE_CATALOG, dcTypeDefaults, type DcTypeProfile } from '../../../mock/data/dcTypes';

const { Text } = Typography;

/**
 * One "New program" flow, driven by programme type. A type backed by a blueprint
 * (e.g. Greenfield Build) instantiates a sequenced set of phase projects with
 * dependencies; every other type creates a container the user fills with
 * projects. The type field — not a separate action — decides this.
 */
export default function NewProgramModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [type, setType] = useState<ProgramType>('Greenfield Build');
  const [dcTypeKey, setDcTypeKey] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const createProgram = useCreateProgram();
  const createFromBlueprint = useCreateProgramFromBlueprint();
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];
  // A greenfield programme runs the blueprint its data-centre type names (POD, telco site, GPU factory, campus…); other programme types are containers.
  const bp = type === 'Greenfield Build' && dcTypeKey ? blueprintForDcType(dcTypeKey) : blueprintForProgramType(type);

  const onType = (t: ProgramType) => {
    setType(t);
    const next = blueprintForProgramType(t);
    form.setFieldValue('budget', next ? next.defaultBudget : 10_000_000);
  };

  const reset = () => { onClose(); form.resetFields(); setType('Greenfield Build'); setDcTypeKey(undefined); };

  const submit = async () => {
    const v = await form.validateFields();
    setBusy(true);
    try {
      if (bp) {
        const objective = `${v.dcTypeName ? `${v.dcTypeName} · ` : ''}${v.tier ?? ''} facility, ${v.targetMw ?? '?'} MW${v.region ? ` · ${v.region}` : ''}${v.rfsDate ? ` · RFS ${v.rfsDate}` : ''}`.replace(/^[,\s·]+/, '').trim();
        const res = await createFromBlueprint({
          blueprintKey: bp.key, name: v.name, ownerName: v.ownerName, dataCenterId: v.dataCenterId,
          startISO: (v.start ?? dayjs()).toISOString(), budget: v.budget, objective: objective || bp.description,
          durationFactor: DC_TYPE_CATALOG.find((x) => x.key === v.dcTypeKey)?.build.durationFactor,
        });
        if (!res) { message.error('Could not create programme'); return; }
        message.success(`Greenfield programme created — ${res.projectCount} sequenced phases${v.dcTypeName ? ` (${v.dcTypeName} schedule)` : ''}`);
        reset();
        onCreated?.(res.programId);
      } else {
        const [start, end] = v.dates ?? [];
        const id = await createProgram({
          name: v.name, type, objective: v.objective, ownerName: v.ownerName, budget: v.budget, status: v.status,
          startDate: (start ?? dayjs()).toISOString(), endDate: (end ?? dayjs().add(1, 'year')).toISOString(),
        });
        message.success('Program created');
        reset();
        onCreated?.(id);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New program" open={open} onOk={submit} confirmLoading={busy} onCancel={onClose} okText={bp ? 'Create programme' : 'Create program'} destroyOnClose width={600}>
      <Form form={form} layout="vertical" initialValues={{ status: 'Planning', budget: 120_000_000, tier: 'Tier III' }}>
        <Form.Item label="Program type" required>
          <Select placeholder="Select program type" value={type} onChange={onType} options={PROGRAM_TYPE.map((t) => ({ value: t, label: t }))} />
          <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", display: 'block', marginTop: 6 }}>
            {bp ? bp.description : 'A container programme — add projects to it after it is created.'}
          </Text>
        </Form.Item>
        <Form.Item name="name" label="Program name" rules={[{ required: true }]}><Input placeholder={bp ? 'DC5 Greenfield Build — Frankfurt' : 'AI Capacity Expansion FY27'} /></Form.Item>
        <Form.Item name="ownerName" label={bp ? 'Programme director' : 'Program owner'} rules={[{ required: true }]}><Input placeholder="Owner / director" /></Form.Item>

        {bp ? (
          <>
            <div style={{ marginBottom: "var(--vw-space-md)" }}>
              <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{bp.name} — sequenced phases (each becomes a linked project):</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: "var(--vw-space-sm)", marginTop: "var(--vw-space-sm)" }}>
                {bp.phases.map((p, i) => <VwChip key={p.key} color={p.longLead ? 'gold' : 'geekblue'}>{i + 1}. {p.name}{p.longLead ? ' · long-lead' : ''}</VwChip>)}
              </div>
            </div>
            <Form.Item name="dcTypeKey" label="Data center type" tooltip="Picks the resilience tier and a starting IT load from the type's typical envelope — adjust below.">
              <Select allowClear showSearch optionFilterProp="label" placeholder="e.g. Hyperscale data centre"
                options={(['Enterprise', 'Telco'] as const).map((seg) => ({ label: seg, options: DC_TYPES_BY_SEGMENT[seg].map((t: DcTypeProfile) => ({ value: t.key, label: t.name })) }))}
                onChange={(k?: DcTypeProfile['key']) => {
                  setDcTypeKey(k);
                  const t = k ? DC_TYPE_CATALOG.find((x) => x.key === k) : undefined;
                  form.setFieldValue('dcTypeName', t?.name);
                  if (k && t) { const d = dcTypeDefaults(k); form.setFieldsValue({ tier: ['Tier II', 'Tier III', 'Tier IV'].includes(d.tier) ? d.tier : 'Tier II', targetMw: Math.max(1, Math.round(d.designPowerKw / 1000)), budget: t.build.defaultBudget }); }
                }} />
            </Form.Item>
            <Form.Item name="dcTypeName" hidden><Input /></Form.Item>
            <Form.Item name="targetMw" label="Target IT load" rules={[{ required: true }]}><InputNumber placeholder="Enter target IT load" min={1} max={500} addonAfter="MW" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="tier" label="Resilience tier"><Select placeholder="Select resilience tier" options={['Tier II', 'Tier III', 'Tier IV'].map((o) => ({ value: o, label: o }))} /></Form.Item>
            <Form.Item name="region" label="Region"><Select placeholder="Select region" allowClear options={['North America', 'EMEA', 'APAC', 'LATAM'].map((o) => ({ value: o, label: o }))} /></Form.Item>
            <Form.Item name="dataCenterId" label="Target data center (optional)"><Select placeholder="Select target data center" allowClear showSearch optionFilterProp="label" options={dcs.map((d) => ({ value: d.id, label: d.name }))} /></Form.Item>
            <Form.Item name="rfsDate" label="Target ready-for-service"><Input placeholder="e.g. Q4 next year" /></Form.Item>
            <Form.Item name="start" label="Programme start"><DatePicker placeholder="Select programme start" style={{ width: '100%' }} /></Form.Item>
          </>
        ) : (
          <>
            <Form.Item name="objective" label="Objective" rules={[{ required: true }]}><Input.TextArea rows={2} placeholder="What this program is set up to achieve" /></Form.Item>
            <Form.Item name="status" label="Lifecycle status" rules={[{ required: true }]}>
              <Select placeholder="Select lifecycle status" options={PROGRAM_STATUS.map((s) => ({ value: s, label: s }))} />
            </Form.Item>
            <Form.Item name="dates" label="Start → End"><DatePicker.RangePicker placeholder={["Start date", "End date"]} style={{ width: '100%' }} /></Form.Item>
          </>
        )}

        <Form.Item name="budget" label="Budget ($)" rules={[{ required: true }]}>
          <InputNumber placeholder="Enter budget ($)" min={0} step={1_000_000} style={{ width: '100%' }} formatter={(v) => `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
