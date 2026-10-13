import { useState, useEffect, useMemo } from 'react';
import { App, ColorPicker, Form, Input, Modal } from 'antd';
import { Pencil, Plus } from 'lucide-react';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../shared/hooks/useAudit';
import type { Tag } from '../../mock/data/types';
import { VwChip } from '../../shared/components/ux';
import { OpsPage } from '../../shared/components/ops/OpsPage';
import { Btn } from '../../ops/ui/kit';
import { DataTable, type Col } from '../../ops/ui/DataTable';
import { ListToolbar } from '../../ops/ui/ListToolbar';

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

  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tags.filter((t) => !s || `${t.name} ${t.slug} ${t.description ?? ''}`.toLowerCase().includes(s));
  }, [tags, q]);

  const columns: Col<Tag>[] = [
    { key: 'name', header: 'Tag', sort: (r) => r.name, render: (r) => <VwChip color={r.color}>{r.name}</VwChip> },
    { key: 'slug', header: 'Slug', sort: (r) => r.slug, render: (r) => <span className="mono muted">{r.slug}</span> },
    { key: 'description', header: 'Description', wrap: true, render: (r) => r.description ?? <span className="vw-label">—</span> },
    { key: 'a', header: '', render: (r) => <Btn size="xs" variant="ghost" icon={Pencil} onClick={(e) => { e.stopPropagation(); setEditing(r); setOpen(true); }}>Edit</Btn> },
  ];

  return (
    <OpsPage title="Tags" description="Reusable labels you can apply to any object — for filtering, reporting and quick visual grouping across the platform."
      actions={<Btn variant="filled" icon={Plus} onClick={() => { setEditing(null); setOpen(true); }}>New tag</Btn>}>
      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={columns} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={25}
          toolbar={
            <ListToolbar shown={rows.length} total={tags.length} noun="tags"
              search={{ value: q, onChange: setQ, placeholder: 'Tag, slug, description' }} />
          } />
      </section>

      <Modal title={editing ? 'Edit tag' : 'New tag'} open={open} onOk={submit} onCancel={() => setOpen(false)} okText={editing ? 'Save' : 'Create'} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ color: '#2563eb' }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="Critical" /></Form.Item>
          <Form.Item name="color" label="Colour"><ColorPicker /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" rows={2} /></Form.Item>
        </Form>
      </Modal>
    </OpsPage>
  );
}
