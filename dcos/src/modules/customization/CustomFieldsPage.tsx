import { useState, useEffect, useMemo } from 'react';
import { App, Form, Input, Modal, Select, Switch } from 'antd';
import { Pencil, Plus } from 'lucide-react';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../shared/hooks/useAudit';
import { CUSTOM_FIELD_TYPE, CUSTOMIZABLE_ENTITIES } from '../../mock/data/enums';
import type { CustomField } from '../../mock/data/types';
import { OpsPage } from '../../shared/components/ops/OpsPage';
import { Btn, Chip } from '../../ops/ui/kit';
import { DataTable, type Col } from '../../ops/ui/DataTable';
import { ListToolbar } from '../../ops/ui/ListToolbar';

const ENTITY_LABEL: Record<string, string> = {
  dataCenters: 'Data Centers', devices: 'Devices', racks: 'Racks', subnets: 'Prefixes', ipAddresses: 'IP Addresses', vlans: 'VLANs',
  vrfs: 'VRFs', circuits: 'Circuits', changeRequests: 'Change Requests', projects: 'Projects',
};
const keyOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export default function CustomFieldsPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const create = useEntityCreate('customFields');
  const update = useEntityUpdate('customFields');
  const audit = useRecordAudit();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const fields = (useEntityList('customFields', { pageSize: 500 }).data?.data ?? []) as unknown as CustomField[];
  const watchType = Form.useWatch('type', form);

  useEffect(() => {
    if (!open) return;
    if (editing) form.setFieldsValue({ ...editing, choices: (editing.choices ?? []).join(', ') });
    else form.resetFields();
  }, [open, editing, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const choices = ['select', 'multiselect'].includes(v.type)
      ? String(v.choices ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
      : undefined;
    const now = new Date().toISOString();
    if (editing) {
      update.mutate({ id: editing.id, data: { ...v, choices, updatedAt: now } }, {
        onSuccess: () => { audit('CustomField', editing.id, 'updated', `Updated field ${v.label}`); message.success('Field updated'); setOpen(false); },
      });
    } else {
      const id = `CF-NEW-${Date.now().toString().slice(-5)}`;
      const key = v.key || keyOf(v.label);
      create.mutate({ id, cfId: id, ...v, key, choices, weight: (fields.length + 1) * 10, isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' }, {
        onSuccess: () => { audit('CustomField', id, 'created', `Created field ${v.label}`); message.success('Field created'); setOpen(false); },
      });
    }
  };

  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('');
  const [entF, setEntF] = useState('');
  const [reqF, setReqF] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return fields.filter((f) => (!typeF || f.type === typeF) && (!entF || (f.entityTypes ?? []).includes(entF)) && (!reqF || String(!!f.required) === reqF)
      && (!s || `${f.label} ${f.key} ${(f.choices ?? []).join(' ')}`.toLowerCase().includes(s)));
  }, [fields, q, typeF, entF, reqF]);

  const columns: Col<CustomField>[] = [
    { key: 'label', header: 'Label', sort: (r) => r.label, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.label}</span><small className="mono">{r.key}</small></span>
    ) },
    { key: 'type', header: 'Type', sort: (r) => r.type, render: (r) => <Chip>{r.type}</Chip> },
    { key: 'applies', header: 'Applies to', wrap: true, render: (r) => <span className="row wrap" style={{ gap: 4 }}>{(r.entityTypes ?? []).map((x) => <Chip key={x} tone="info" size="xs">{ENTITY_LABEL[x] ?? x}</Chip>)}</span> },
    { key: 'required', header: 'Required', sort: (r) => (r.required ? 1 : 0), render: (r) => (r.required ? <Chip tone="warning" dot>Yes</Chip> : <span className="vw-label">No</span>) },
    { key: 'choices', header: 'Choices', wrap: true, render: (r) => (r.choices ?? []).join(', ') || <span className="vw-label">—</span> },
    { key: 'a', header: '', render: (r) => <Btn size="xs" variant="ghost" icon={Pencil} onClick={(e) => { e.stopPropagation(); setEditing(r); setOpen(true); }}>Edit</Btn> },
  ];

  return (
    <OpsPage title="Custom fields" description="Extend any object type with your own fields — no schema change. Fields appear on the matching records' detail screens."
      actions={<Btn variant="filled" icon={Plus} onClick={() => { setEditing(null); setOpen(true); }}>New field</Btn>}>
      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={columns} pageSize={25}
          toolbar={
            <ListToolbar shown={rows.length} total={fields.length} noun="fields"
              search={{ value: q, onChange: setQ, placeholder: 'Label, key, choice' }}
              filters={[
                { id: 'type', label: 'Type', quick: true, value: typeF, anyLabel: 'Any type', onChange: setTypeF, options: CUSTOM_FIELD_TYPE.map((t) => ({ id: t, label: t, count: fields.filter((f) => f.type === t).length })) },
                { id: 'entity', label: 'Applies to', quick: true, value: entF, anyLabel: 'Any object', onChange: setEntF, options: CUSTOMIZABLE_ENTITIES.map((e) => ({ id: e, label: ENTITY_LABEL[e] ?? e, count: fields.filter((f) => (f.entityTypes ?? []).includes(e)).length })) },
                { id: 'required', label: 'Required', value: reqF, anyLabel: 'Required or optional', onChange: setReqF, options: [{ id: 'true', label: 'Required' }, { id: 'false', label: 'Optional' }] },
              ]} />
          } />
      </section>

      <Modal title={editing ? 'Edit custom field' : 'New custom field'} open={open} onOk={submit} onCancel={() => setOpen(false)} okText={editing ? 'Save' : 'Create'} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ type: 'text', entityTypes: ['devices'] }}>
          <Form.Item name="label" label="Label" rules={[{ required: true }]}><Input placeholder="Asset owner" /></Form.Item>
          {!editing && <Form.Item name="key" label="Key" tooltip="Machine key in storage. Leave blank to derive from the label."><Input placeholder="asset_owner (auto)" /></Form.Item>}
          <Form.Item name="type" label="Type" rules={[{ required: true }]}><Select placeholder="Select type" options={CUSTOM_FIELD_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="entityTypes" label="Applies to" rules={[{ required: true }]}>
            <Select placeholder="Select applies to" mode="multiple" options={CUSTOMIZABLE_ENTITIES.map((e) => ({ value: e, label: ENTITY_LABEL[e] ?? e }))} />
          </Form.Item>
          {['select', 'multiselect'].includes(watchType) && (
            <Form.Item name="choices" label="Choices (comma-separated)" rules={[{ required: true }]}><Input placeholder="Tier 0, Tier 1, Tier 2" /></Form.Item>
          )}
          <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" rows={2} /></Form.Item>
          <Form.Item name="required" label="Required" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </OpsPage>
  );
}
