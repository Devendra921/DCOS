import { useState } from 'react';
import { App, Form, Input, Modal } from 'antd';
import { Plus, Tags } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Empty } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
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
  const countOf = (r: CircuitType) => circuits.filter((c) => c.circuitTypeId === r.id).length;
  const cols: Col<CircuitType>[] = [
    { key: 'name', header: 'Type', sort: (r) => r.name, render: (r) => (
      <span className="row" style={{ gap: 8 }}><i className="chip-dot" style={{ width: 10, height: 10, borderRadius: 3, background: r.color }} /><span className="vw-card-activity-label">{r.name}</span></span>
    ) },
    { key: 'slug', header: 'Slug', sort: (r) => r.slug ?? '', render: (r) => r.slug ? <span className="mono">{r.slug}</span> : '—' },
    { key: 'n', header: 'Circuits', align: 'right', sort: countOf, render: (r) => <span className="num">{countOf(r)}</span> },
  ];
  return (
    <OpsPage title="Circuit types"
      actions={<Btn variant="filled" icon={Plus} onClick={() => { form.resetFields(); setOpen(true); }}>New type</Btn>}>
      <section className="vw-card-section dcl-table">
        <DataTable rows={types} cols={cols} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={200}
          empty={<Empty icon={Tags} title="No circuit types" />} />
      </section>
      <Modal title="New circuit type" open={open} onOk={submit} okText="Create" onCancel={() => setOpen(false)} confirmLoading={create.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="IP Transit" /></Form.Item>
          <Form.Item name="color" label="Colour"><Input type="color" style={{ width: 80, padding: 2 }} /></Form.Item>
        </Form>
      </Modal>
    </OpsPage>
  );
}
