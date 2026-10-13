import { useState, useEffect } from 'react';
import { App, Form, Input, Modal, Select, Space, Switch, Typography } from 'antd';
import { VwButton as Button } from '../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../shared/components/vw/VwTable';

import { PlusOutlined, EditOutlined } from '../../shared/icons';
import type { TableColumnType } from 'antd';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../shared/hooks/useAudit';
import { CUSTOM_FIELD_TYPE, CUSTOMIZABLE_ENTITIES } from '../../mock/data/enums';
import type { CustomField } from '../../mock/data/types';
import { VwCard, VwChip } from '../../shared/components/ux';

const { Text } = Typography;
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

  const columns: TableColumnType<CustomField>[] = [
    { title: 'Label', dataIndex: 'label', render: (l: string, r) => <Space direction="vertical" size={0}><Text strong>{l}</Text><Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>{r.key}</Text></Space> },
    { title: 'Type', dataIndex: 'type', render: (t: string) => <VwChip>{t}</VwChip> },
    { title: 'Applies to', dataIndex: 'entityTypes', render: (e: string[]) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: "var(--vw-space-xxs)" }}>{(e ?? []).map((x) => <VwChip key={x} color="blue">{ENTITY_LABEL[x] ?? x}</VwChip>)}</div> },
    { title: 'Required', dataIndex: 'required', render: (r?: boolean) => (r ? 'Yes' : 'No') },
    { title: 'Choices', dataIndex: 'choices', render: (c?: string[]) => (c ?? []).join(', ') || '—' },
    { title: '', key: 'a', width: 80, render: (_: unknown, r) => <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setEditing(r); setOpen(true); }}>Edit</Button> },
  ];

  return (
    <div>
      <VwCard
        size="small"
        title="Custom fields"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setOpen(true); }}>New field</Button>}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: "var(--vw-space-md)" }}>
          Extend any object type with your own fields — no schema change. Fields appear on the matching records' detail screens.
        </Text>
        <Table<CustomField> rowKey="id" size="middle" dataSource={fields} columns={columns} pagination={false} scroll={{ x: 'max-content' }} />
      </VwCard>

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
    </div>
  );
}
