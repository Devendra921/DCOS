import { useState, useEffect } from 'react';
import { App, ColorPicker, Form, Input, Modal, Space, Typography } from 'antd';
import { VwButton as Button } from '../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../shared/components/vw/VwTable';

import { PlusOutlined, EditOutlined } from '../../shared/icons';
import type { TableColumnType } from 'antd';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../shared/hooks/useAudit';
import type { Tag } from '../../mock/data/types';
import { VwCard, VwChip } from '../../shared/components/ux';

const { Text } = Typography;
const slugify = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function TagsPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const create = useEntityCreate('tags');
  const update = useEntityUpdate('tags');
  const audit = useRecordAudit();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const tags = (useEntityList('tags', { pageSize: 500 }).data?.data ?? []) as unknown as Tag[];

  useEffect(() => {
    if (!open) return;
    if (editing) form.setFieldsValue(editing);
    else form.resetFields();
  }, [open, editing, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const color = typeof v.color === 'string' ? v.color : v.color?.toHexString?.() ?? '#2563eb';
    const now = new Date().toISOString();
    if (editing) {
      update.mutate({ id: editing.id, data: { ...v, color, slug: slugify(v.name), updatedAt: now } }, {
        onSuccess: () => { audit('Tag', editing.id, 'updated', `Updated tag ${v.name}`); message.success('Tag updated'); setOpen(false); },
      });
    } else {
      const id = `TAG-NEW-${Date.now().toString().slice(-5)}`;
      create.mutate({ id, tagId: id, ...v, color, slug: slugify(v.name), isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' }, {
        onSuccess: () => { audit('Tag', id, 'created', `Created tag ${v.name}`); message.success('Tag created'); setOpen(false); },
      });
    }
  };

  const columns: TableColumnType<Tag>[] = [
    { title: 'Tag', dataIndex: 'name', render: (n: string, r) => <VwChip color={r.color}>{n}</VwChip> },
    { title: 'Slug', dataIndex: 'slug', render: (s: string) => <Text type="secondary">{s}</Text> },
    { title: 'Description', dataIndex: 'description', render: (d?: string) => d ?? '—' },
    { title: '', key: 'a', width: 80, render: (_: unknown, r) => <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setEditing(r); setOpen(true); }}>Edit</Button> },
  ];

  return (
    <div>
      <VwCard
        size="small"
        title="Tags"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setOpen(true); }}>New tag</Button>}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: "var(--vw-space-md)" }}>
          Reusable labels you can apply to any object — for filtering, reporting and quick visual grouping across the platform.
        </Text>
        <Table<Tag> rowKey="id" size="middle" dataSource={tags} columns={columns} pagination={false} scroll={{ x: 'max-content' }} />
      </VwCard>

      <Modal title={editing ? 'Edit tag' : 'New tag'} open={open} onOk={submit} onCancel={() => setOpen(false)} okText={editing ? 'Save' : 'Create'} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ color: '#2563eb' }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="Critical" /></Form.Item>
          <Form.Item name="color" label="Colour"><ColorPicker /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
