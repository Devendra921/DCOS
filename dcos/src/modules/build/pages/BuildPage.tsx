import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App, Modal, Form, Input, Select } from 'antd';
import { Inbox, Plus } from 'lucide-react';
import { useEntityList, useEntityUpdate, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { WORK_ORDER_TYPE } from '../../../mock/data/enums';
import type { WorkOrder, Project } from '../../../mock/data/types';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, Panel, Seg } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import './build.css';
const COLS = ['Assigned', 'InProgress', 'Validated', 'Completed'];
const STATUS_TONE: Record<string, Tone> = { Assigned: 'info', InProgress: 'warning', Validated: 'cyan', Completed: 'success' };
export default function BuildPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<'Board' | 'Table'>('Board');
  const wos = (useEntityList('workOrders', { pageSize: 200 }).data?.data ?? []) as unknown as WorkOrder[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const projName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const { message } = App.useApp();
  const update = useEntityUpdate('workOrders');
  const create = useEntityCreate('workOrders');
  const audit = useRecordAudit();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const WOFLOW = ['Assigned', 'InProgress', 'Validated', 'Completed'];
  const advance = (w: WorkOrder) => { const i = WOFLOW.indexOf(w.status); const to = i < WOFLOW.length - 1 ? WOFLOW[i + 1] : null; if (!to) return; update.mutate({ id: w.id, data: { status: to } }, { onSuccess: () => { message.success(`${w.woId} → ${to}`); audit('WorkOrder', w.woId, to, `${w.type} → ${to}`); } }); };
  const submitNew = async () => { const v = await form.validateFields(); const id = `WO-NEW-${Date.now().toString().slice(-4)}`; const now = new Date().toISOString(); create.mutate({ id, woId: id, type: v.type, rackId: v.rackId, assigneeName: v.assigneeName, status: 'Assigned', scheduledDate: now, customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' }, { onSuccess: () => { message.success('Work order created'); audit('WorkOrder', id, 'created', `Created ${v.type}`); setOpen(false); } }); };
  const m = useMemo(() => ({
    open: wos.filter((w) => w.status !== 'Completed').length,
    inprog: wos.filter((w) => w.status === 'InProgress').length,
    done: wos.filter((w) => w.status === 'Completed').length,
  }), [wos]);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('');
  const [typeF, setTypeF] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return wos.filter((w) => (!statusF || w.status === statusF) && (!typeF || w.type === typeF)
      && (!s || `${w.woId} ${w.type} ${w.rackId ?? ''} ${w.assigneeName} ${w.projectId ? projName[w.projectId] ?? '' : ''}`.toLowerCase().includes(s)));
  }, [wos, q, statusF, typeF, projName]);
  const statusParts = COLS.map((c) => ({ key: c, label: c, n: wos.filter((w) => w.status === c).length, tone: STATUS_TONE[c] }));
  const types = [...new Set(wos.map((w) => w.type))];
  const statuses = [...new Set([...COLS, ...wos.map((w) => w.status)])];

  const cols: Col<WorkOrder>[] = [
    { key: 'wo', header: 'WO', sort: (w) => w.woId, render: (w) => (
      <span className="cell-2"><span className="vw-card-activity-label mono">{w.woId}</span><small>{w.type}</small></span>
    ) },
    { key: 'project', header: 'Project', sort: (w) => (w.projectId ? projName[w.projectId] ?? '' : ''), render: (w) => w.projectId
      ? <Link className="ent-link" to={`/delivery/projects/${w.projectId}`} onClick={(e) => e.stopPropagation()}>{projName[w.projectId] ?? 'Project'}</Link>
      : <span className="vw-label">—</span> },
    { key: 'rack', header: 'Rack', sort: (w) => w.rackId ?? '', render: (w) => <span className="mono">{w.rackId ?? '—'}</span> },
    { key: 'assignee', header: 'Assignee', sort: (w) => w.assigneeName, render: (w) => w.assigneeName },
    { key: 'scheduled', header: 'Scheduled', sort: (w) => w.scheduledDate, render: (w) => <span className="num">{w.scheduledDate.slice(0, 10)}</span> },
    { key: 'status', header: 'Status', sort: (w) => w.status, render: (w) => <Chip tone={STATUS_TONE[w.status] ?? 'neutral'} dot>{w.status}</Chip> },
    { key: 'act', header: '', render: (w) => w.status !== 'Completed' ? <Btn size="xs" onClick={(e) => { e.stopPropagation(); advance(w); }}>Advance</Btn> : null },
  ];

  return (
    <OpsPage title="Build & Deploy" description="Work orders for installs, cabling and deployments, from assignment to completion."
      actions={<>
        <Btn variant="filled" icon={Plus} onClick={() => setOpen(true)}>New work order</Btn>
        <Seg<'Board' | 'Table'> value={view} onChange={setView} options={[{ id: 'Board', label: 'Board' }, { id: 'Table', label: 'Table' }]} />
      </>}>
      <StatGrid cols={3}>
        <StatTile label="Open work orders" value={m.open} sub={`of ${wos.length} work orders`}>
          <Split parts={statusParts} />
        </StatTile>
        <StatTile label="In progress" value={m.inprog} sub="being worked now" />
        <StatTile label="Completed" value={m.done} sub="closed out" />
      </StatGrid>

      {view === 'Board' ? (
        <div className="build-board">
          {COLS.map((col) => {
            const items = wos.filter((w) => w.status === col);
            return (
              <Panel key={col} className="build-col" title={col} count={items.length}>
                {items.length === 0 ? (
                  <Empty icon={Inbox} title="No work orders" />
                ) : items.map((w) => (
                  <button key={w.id} type="button" className="build-card" onClick={() => w.rackId && navigate(`/facility/racks/${w.rackId}`)}>
                    <span className="t">{w.type}</span>
                    <span className="m">{w.assigneeName} · {w.rackId}</span>
                    {w.projectId && <span className="p">{projName[w.projectId] ?? 'Project'}</span>}
                  </button>
                ))}
              </Panel>
            );
          })}
        </div>
      ) : (
        <section className="vw-card-section dcl-table">
          <DataTable rows={rows} cols={cols} pageSize={25}
            toolbar={
              <ListToolbar shown={rows.length} total={wos.length} noun="work orders"
                search={{ value: q, onChange: setQ, placeholder: 'WO, type, rack, assignee, project' }}
                filters={[
                  { id: 'status', label: 'Status', quick: true, value: statusF, anyLabel: 'Any status', onChange: setStatusF, options: statuses.map((c) => ({ id: c, label: c, count: wos.filter((w) => w.status === c).length })) },
                  { id: 'type', label: 'Type', quick: true, value: typeF, anyLabel: 'Any type', onChange: setTypeF, options: types.map((t) => ({ id: t, label: t, count: wos.filter((w) => w.type === t).length })) },
                ]} />
            } />
        </section>
      )}
      <Modal title="New work order" open={open} onOk={submitNew} onCancel={() => setOpen(false)} okText="Create" destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ type: 'RackInstall' }}>
          <Form.Item name="type" label="Type"><Select placeholder="Select type" options={WORK_ORDER_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="rackId" label="Rack ID"><Input placeholder="RACK-0001" /></Form.Item>
          <Form.Item name="assigneeName" label="Assignee" rules={[{ required: true }]}><Input placeholder="Enter assignee" /></Form.Item>
        </Form>
      </Modal>
    </OpsPage>
  );
}
