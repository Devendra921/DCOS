import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Input, Select, Space, Spin } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined, SearchOutlined, InboxOutlined, StopOutlined, WarningOutlined, CheckCircleOutlined, ClockCircleOutlined } from '../../../shared/icons';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { KPICard } from '../../../shared/components/KPICard';
import { TICKET_STATUS, TICKET_TYPE, PRIORITY } from '../../../mock/data/enums';
import type { Ticket, Project } from '../../../mock/data/types';
import { useAllTickets, ticketStats, TICKET_STATUS_COLOR, TICKET_TYPE_COLOR } from '../lib/tickets';
import { TicketRaiseModal } from '../components/TicketPanel';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const prioColor: Record<string, string> = { Low: 'default', Medium: 'blue', High: 'orange', Urgent: 'red' };
const ageDays = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 864e5));

export default function TicketsRegisterPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const tickets = useAllTickets();
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const update = useEntityUpdate('tickets');
  const audit = useRecordAudit();
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState<string[]>([]);
  const [typeF, setTypeF] = useState<string[]>([]);
  const [prioF, setPrioF] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const projName = (id?: string) => projects.find((p) => p.id === id)?.name ?? '—';
  const stats = useMemo(() => ticketStats(tickets), [tickets]);
  const rows = useMemo(() => tickets.filter((t) => {
    if (statusF.length && !statusF.includes(t.status)) return false;
    if (typeF.length && !typeF.includes(t.type)) return false;
    if (prioF.length && !prioF.includes(t.priority)) return false;
    if (q && ![t.title, t.assignee, t.reporter, projName(t.projectId)].some((s) => (s ?? '').toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [tickets, statusF, typeF, prioF, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const { visible, hasMore, sentinelRef, total } = useScrollReveal(rows, 25, `${q}|${statusF.join(",")}|${typeF.join(",")}|${prioF.join(",")}`);

  const setStatus = (t: Ticket, status: string) => update.mutate({ id: t.id, data: { status, updatedAt: new Date().toISOString(), resolvedAt: ['Resolved', 'Verified', 'Closed'].includes(status) ? new Date().toISOString() : undefined } }, { onSuccess: () => { audit('Ticket', t.tktId, status, `Ticket "${t.title}" → ${status}`); message.success(`Ticket → ${status}`); } });

  const linkedTo = (t: Ticket) => t.taskId ? 'Task' : t.activityId ? 'Step' : t.changeRequestId ? 'CR' : 'Project';

  return (
    <div>
      <Space className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }} align="start">
        <div>
          <div className="vw-page-title" role="heading" aria-level={3}>Tickets</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Raise ticket</Button>
      </Space>

      <div className="vw-grid vw-kpi-grid vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Open" value={stats.open} icon={<InboxOutlined />} iconTone="info" />
        <KPICard title="Active blockers" value={stats.blockers} color={stats.blockers ? 'var(--vw-color-red-600)' : undefined} icon={<StopOutlined />} iconTone="error" />
        <KPICard title="SLA breached" value={stats.slaBreached} color={stats.slaBreached ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="error" />
        <KPICard title="Resolution rate" value={`${stats.resolutionRate}%`} color="var(--vw-color-green-600)" icon={<CheckCircleOutlined />} iconTone="success" />
        <KPICard title="Avg resolve" value={`${stats.avgResolveDays}d`} icon={<ClockCircleOutlined />} iconTone="cyan" />
      </div>

      <Space wrap style={{ marginBottom: "var(--vw-space-lg)" }}>
        <Input prefix={<SearchOutlined />} placeholder="Search title / assignee / project…" allowClear value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
        <Select mode="multiple" allowClear placeholder="Status" value={statusF} onChange={setStatusF} style={{ minWidth: 180 }} options={TICKET_STATUS.map((s) => ({ value: s, label: s }))} maxTagCount="responsive" />
        <Select mode="multiple" allowClear placeholder="Type" value={typeF} onChange={setTypeF} style={{ minWidth: 160 }} options={TICKET_TYPE.map((s) => ({ value: s, label: s }))} maxTagCount="responsive" />
        <Select mode="multiple" allowClear placeholder="Priority" value={prioF} onChange={setPrioF} style={{ minWidth: 140 }} options={PRIORITY.map((s) => ({ value: s, label: s }))} maxTagCount="responsive" />
      </Space>

      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
        Showing {visible.length} of {total} tickets
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Table<Ticket> rowKey="id" size="small" dataSource={visible} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Ticket', dataIndex: 'title', ellipsis: true },
            { title: 'Type', dataIndex: 'type', width: 110, render: (t: string) => <VwChip color={TICKET_TYPE_COLOR[t]}>{t}</VwChip> },
            { title: 'Priority', dataIndex: 'priority', width: 90, render: (p: string) => <VwChip color={prioColor[p]}>{p}</VwChip> },
            { title: 'Project', key: 'proj', width: 200, ellipsis: true, render: (_: unknown, t: Ticket) => t.projectId ? <a onClick={() => navigate(`/delivery/projects/${t.projectId}`)}>{projName(t.projectId)}</a> : '—' },
            { title: 'Linked to', key: 'link', width: 90, render: (_: unknown, t: Ticket) => <VwChip>{linkedTo(t)}</VwChip> },
            { title: 'Age', dataIndex: 'raisedAt', width: 64, render: (d: string) => `${ageDays(d)}d` },
            { title: 'Assignee', dataIndex: 'assignee', width: 150, ellipsis: true, render: (a?: string) => a ?? '—' },
            { title: 'Status', dataIndex: 'status', width: 150, render: (s: string, t: Ticket) => <Select placeholder="Select status" size="small" value={s} variant="borderless" style={{ width: 140 }} onChange={(v) => setStatus(t, v)} options={TICKET_STATUS.map((x) => ({ value: x, label: <VwChip color={TICKET_STATUS_COLOR[x]} style={{ marginInlineEnd: 0 }}>{x}</VwChip> }))} /> },
          ]} />
        {visible.length > 0 && hasMore && (
          <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>

      <TicketRaiseModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
