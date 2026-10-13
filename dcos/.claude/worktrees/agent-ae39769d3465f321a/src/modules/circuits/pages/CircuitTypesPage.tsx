import { useState } from 'react';
import { App, Form, Input, Modal } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import type { CircuitType, Circuit } from '../../../mock/data/types';

const now = () => new Date().toISOString();

export default function CircuitTypesPage() {
  const { message } = App.useApp();
  const types = (useEntityList('circuitTypes', { pageSize: 200 }).data?.data ?? []) as unknown as CircuitType[];
  const circuits = (useEntityList('circuits', { pageSize: 5000 }).data?.data ?? []) as unknown as Circuit[];
  const create = useEntityCreate('circuitTypes');
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const submit = async () => {
    const v = await form.validateFields();
    const id = `CKTT-NEW-${Date.now().toString(36)}`;
    create.mutate({ id, ctId: id, name: v.name, slug: (v.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'), color: v.color || '#64748b', customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' },
      { onSuccess: () => { message.success('Circuit type created'); setOpen(false); form.resetFields(); } });
  };
  const cols: TableColumnType<CircuitType>[] = [
    { title: 'Type', dataIndex: 'name', render: (n: string, r) => <VwChip color={r.color}>{n}</VwChip> },
    { title: 'Slug', dataIndex: 'slug', render: (s?: string) => s ? <span>{s}</span> : '—' },
    { title: 'Circuits', align: 'right', render: (_, r) => circuits.filter((c) => c.circuitTypeId === r.id).length },
  ];
  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-md)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <h1 className="vw-page-title" style={{ margin: 0 }}>Circuit types</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>New type</Button>
      </div>
      <VwCard size="small"><Table<CircuitType> rowKey="id" size="small" dataSource={types} columns={cols} pagination={false} scroll={{ x: 'max-content' }} /></VwCard>
      <Modal title="New circuit type" open={open} onOk={submit} okText="Create" onCancel={() => setOpen(false)} confirmLoading={create.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="IP Transit" /></Form.Item>
          <Form.Item name="color" label="Colour"><Input type="color" style={{ width: 80, padding: 2 }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
