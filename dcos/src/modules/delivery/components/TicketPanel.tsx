import { useState } from 'react';
import { App, Form, Input, Modal, Select, Space } from 'antd';
import { Plus, Ticket as TicketIcon } from 'lucide-react';
import { Btn, Chip, Empty } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import type { Tone } from '../../../ops/lib/tone';
import { useEntityCreate, useEntityUpdate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { TICKET_STATUS, TICKET_TYPE, PRIORITY } from '../../../mock/data/enums';
import type { Ticket, Project, Task, ChangeRequest } from '../../../mock/data/types';
import { useAllTickets, filterTickets, TICKET_STATUS_COLOR, TICKET_TYPE_COLOR, isBlockingTicket, isOpenTicket, type TicketFilter } from '../lib/tickets';

const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'You', createdById: 'me' });
const prioColor: Record<string, string> = { Low: 'default', Medium: 'blue', High: 'orange', Urgent: 'red' };
/** The ticket colour tables use antd colour names; map them onto the Operate chip tones. */
const ANTD_TONE: Record<string, Tone> = { blue: 'info', geekblue: 'purple', purple: 'purple', gold: 'warning', orange: 'orange', red: 'error', volcano: 'error', green: 'success', cyan: 'cyan', default: 'neutral' };
const toneOf = (c?: string): Tone => ANTD_TONE[c ?? 'default'] ?? 'neutral';
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

  const cols: Col<Ticket>[] = [
    { key: 'title', header: 'Ticket', render: (t) => <span title={t.title} style={{ display: 'inline-block', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>{t.title}</span> },
    { key: 'type', header: 'Type', render: (t) => <Chip tone={toneOf(TICKET_TYPE_COLOR[t.type])}>{t.type}</Chip> },
    { key: 'priority', header: 'Priority', render: (t) => <Chip tone={toneOf(prioColor[t.priority])}>{t.priority}</Chip> },
    { key: 'age', header: 'Age', align: 'right', render: (t) => <span className="num">{ageDays(t.raisedAt)}d</span> },
    { key: 'assignee', header: 'Assignee', render: (t) => t.assignee ?? '—' },
    { key: 'status', header: 'Status', render: (t) => <Select placeholder="Select status" size="small" value={t.status} variant="borderless" style={{ width: 140 }} onChange={(v) => setStatus(t, v)} options={TICKET_STATUS.map((x) => ({ value: x, label: <Chip tone={toneOf(TICKET_STATUS_COLOR[x])} dot>{x}</Chip> }))} /> },
  ];

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row between" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <b>{title}</b>
          <span className="muted" style={{ fontSize: 'var(--vw-font-label-sm)' }}>{openN} open{blockers ? ` · ${blockers} blocking` : ''}</span>
        </div>
        <Btn icon={Plus} onClick={() => setOpen(true)}>Raise ticket</Btn>
      </div>
      {rows.length === 0 ? <Empty icon={TicketIcon} title="No tickets" />
        : <DataTable<Ticket> rows={rows} cols={cols} pageSize={8} compact />}
      <TicketRaiseModal open={open} onClose={() => setOpen(false)} fixed={{ ...anchor, dataCenterId }} />
    </div>
  );
}
