import { useState } from 'react';
import { App, Empty, Form, Input, Modal, Select, Space, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined } from '../../../shared/icons';
import { useEntityCreate, useEntityUpdate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { VwChip } from '../../../shared/components/ux';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { TICKET_STATUS, TICKET_TYPE, PRIORITY } from '../../../mock/data/enums';
import type { Ticket, Project, Task, ChangeRequest } from '../../../mock/data/types';
import { useAllTickets, filterTickets, TICKET_STATUS_COLOR, TICKET_TYPE_COLOR, isBlockingTicket, isOpenTicket, type TicketFilter } from '../lib/tickets';

const { Text } = Typography;
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'You', createdById: 'me' });
const prioColor: Record<string, string> = { Low: 'default', Medium: 'blue', High: 'orange', Urgent: 'red' };
const ageDays = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 864e5));

/** Raise a ticket. `fixed` injects the anchor (used by inline panels); without it
 *  the modal shows project/task/CR pickers (used by the register). */
export function TicketRaiseModal({ open, onClose, fixed, onCreated }: { open: boolean; onClose: () => void; fixed?: TicketFilter & { dataCenterId?: string }; onCreated?: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const create = useEntityCreate('tickets');
  const audit = useRecordAudit();
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const tasks = (useEntityList('tasks', { pageSize: 2000 }).data?.data ?? []) as unknown as Task[];
  const crs = (useEntityList('changeRequests', { pageSize: 2000 }).data?.data ?? []) as unknown as ChangeRequest[];
  const [proj, setProj] = useState<string | undefined>(fixed?.projectId);

  const submit = async () => {
    const v = await form.validateFields();
    const projectId = fixed?.projectId ?? v.projectId;
    const id = `TKT-${Date.now().toString(36).toUpperCase()}`;
    await create.mutateAsync({
      id, tktId: id, ...env(), title: v.title, type: v.type, status: 'New', priority: v.priority,
      description: v.description, projectId, taskId: fixed?.taskId ?? v.taskId, changeRequestId: fixed?.changeRequestId ?? v.changeRequestId,
      activityId: fixed?.activityId, dataCenterId: fixed?.dataCenterId, assignee: v.assignee, reporter: 'You',
      raisedAt: new Date().toISOString(), slaDueAt: new Date(Date.now() + 5 * 864e5).toISOString(), isBlocker: v.type === 'Blocker',
    });
    audit('Ticket', id, 'created', `Raised ticket "${v.title}"`);
    message.success('Ticket raised');
    onClose(); form.resetFields(); onCreated?.();
  };

  return (
    <Modal title="Raise ticket" open={open} onOk={submit} confirmLoading={create.isPending} onCancel={onClose} okText="Raise ticket" forceRender width={560}>
      <Form form={form} layout="vertical" initialValues={{ type: 'Issue', priority: 'Medium' }}>
        <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input placeholder="What needs fixing or doing?" /></Form.Item>
        <Space wrap>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}><Select placeholder="Select type" style={{ width: 160 }} options={TICKET_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="priority" label="Priority" rules={[{ required: true }]}><Select placeholder="Select priority" style={{ width: 140 }} options={PRIORITY.map((p) => ({ value: p, label: p }))} /></Form.Item>
          <Form.Item name="assignee" label="Assignee"><Input style={{ width: 200 }} placeholder="Who owns it" /></Form.Item>
        </Space>
        {!fixed && (
          <>
            <Form.Item name="projectId" label="Project" rules={[{ required: true }]}>
              <Select placeholder="Select project" showSearch optionFilterProp="label" onChange={(v) => setProj(v)} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
            </Form.Item>
            <Space wrap>
              <Form.Item name="taskId" label="Task (optional)"><Select placeholder="Select task" allowClear showSearch optionFilterProp="label" style={{ width: 240 }} options={tasks.filter((t) => t.projectId === proj).map((t) => ({ value: t.id, label: t.name }))} /></Form.Item>
              <Form.Item name="changeRequestId" label="Change request (optional)"><Select placeholder="Select change request" allowClear showSearch optionFilterProp="label" style={{ width: 240 }} options={crs.filter((c) => c.projectId === proj).map((c) => ({ value: c.id, label: `${c.chgId} · ${c.title}` }))} /></Form.Item>
            </Space>
          </>
        )}
        <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}

/** Inline ticket list + raise, scoped to an anchor (project / task / CR / step). */
export function TicketPanel({ anchor, title = 'Tickets', dataCenterId }: { anchor: TicketFilter; title?: string; dataCenterId?: string }) {
  const { message } = App.useApp();
  const all = useAllTickets();
  const rows = filterTickets(all, anchor);
  const update = useEntityUpdate('tickets');
  const audit = useRecordAudit();
  const [open, setOpen] = useState(false);

  const setStatus = (t: Ticket, status: string) => update.mutate({ id: t.id, data: { status, updatedAt: new Date().toISOString(), resolvedAt: ['Resolved', 'Verified', 'Closed'].includes(status) ? new Date().toISOString() : undefined } }, { onSuccess: () => { audit('Ticket', t.tktId, status, `Ticket "${t.title}" → ${status}`); message.success(`Ticket → ${status}`); } });

  const openN = rows.filter(isOpenTicket).length;
  const blockers = rows.filter(isBlockingTicket).length;

  return (
    <div>
      <Space style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: "var(--vw-space-sm)" }}>
        <Space size={8}>
          <Text strong>{title}</Text>
          <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{openN} open{blockers ? ` · ${blockers} blocking` : ''}</Text>
        </Space>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Raise ticket</Button>
      </Space>
      {rows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tickets" />
        : (
          <Table<Ticket> rowKey="id" size="small" dataSource={rows} pagination={rows.length > 8 ? { pageSize: 8 } : false} scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Ticket', dataIndex: 'title', ellipsis: true },
              { title: 'Type', dataIndex: 'type', width: 110, render: (t: string) => <VwChip color={TICKET_TYPE_COLOR[t]}>{t}</VwChip> },
              { title: 'Priority', dataIndex: 'priority', width: 90, render: (p: string) => <VwChip color={prioColor[p]}>{p}</VwChip> },
              { title: 'Age', dataIndex: 'raisedAt', width: 64, render: (d: string) => `${ageDays(d)}d` },
              { title: 'Assignee', dataIndex: 'assignee', width: 150, ellipsis: true, render: (a?: string) => a ?? '—' },
              { title: 'Status', dataIndex: 'status', width: 150, render: (s: string, t: Ticket) => <Select placeholder="Select status" size="small" value={s} variant="borderless" style={{ width: 140 }} onChange={(v) => setStatus(t, v)} options={TICKET_STATUS.map((x) => ({ value: x, label: <VwChip color={TICKET_STATUS_COLOR[x]} style={{ marginInlineEnd: 0 }}>{x}</VwChip> }))} /> },
            ]} />
        )}
      <TicketRaiseModal open={open} onClose={() => setOpen(false)} fixed={{ ...anchor, dataCenterId }} />
    </div>
  );
}
