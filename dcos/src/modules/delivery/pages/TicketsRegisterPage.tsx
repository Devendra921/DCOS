import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Select } from 'antd';
import { Inbox, ListChecks, Plus } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { SOFT, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';
import { Donut } from '../../../ops/charts/Donut';
import { useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { TICKET_STATUS, TICKET_TYPE, PRIORITY } from '../../../mock/data/enums';
import type { Ticket, Project } from '../../../mock/data/types';
import { useAllTickets, ticketStats, isBlockingTicket, isSlaBreached, TICKET_STATUS_COLOR, TICKET_TYPE_COLOR, TICKET_OPEN_STATUSES } from '../lib/tickets';
import { TicketRaiseModal } from '../components/TicketPanel';

/* antd colour names used by the shared ticket palettes → design-system chip tones */
const ANTD_TONE: Record<string, Tone> = { blue: 'info', geekblue: 'info', gold: 'warning', purple: 'purple', red: 'error', volcano: 'orange', orange: 'orange', green: 'success', cyan: 'cyan', default: 'neutral' };
const toneOf = (c?: string): Tone => ANTD_TONE[c ?? 'default'] ?? 'neutral';
const PRIO_TONE: Record<string, Tone> = { Low: 'neutral', Medium: 'info', High: 'orange', Urgent: 'error' };
const ageDays = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 864e5));

export default function TicketsRegisterPage() {
  const { message } = App.useApp();
  const tickets = useAllTickets();
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const update = useEntityUpdate('tickets');
  const audit = useRecordAudit();
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [prioF, setPrioF] = useState('');
  const [conditionF, setConditionF] = useState('');
  const [open, setOpen] = useState(false);

  const projName = (id?: string) => projects.find((p) => p.id === id)?.name ?? '—';
  const stats = useMemo(() => ticketStats(tickets), [tickets]);
  const rows = useMemo(() => tickets.filter((t) => {
    if (conditionF === 'blockers' && !isBlockingTicket(t)) return false;
    if (conditionF === 'sla' && !isSlaBreached(t)) return false;
    if (statusF && t.status !== statusF) return false;
    if (typeF && t.type !== typeF) return false;
    if (prioF && t.priority !== prioF) return false;
    if (q && ![t.title, t.assignee, t.reporter, projName(t.projectId)].some((s) => (s ?? '').toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [tickets, statusF, typeF, prioF, conditionF, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = (t: Ticket, status: string) => update.mutate({ id: t.id, data: { status, updatedAt: new Date().toISOString(), resolvedAt: ['Resolved', 'Verified', 'Closed'].includes(status) ? new Date().toISOString() : undefined } }, { onSuccess: () => { audit('Ticket', t.tktId, status, `Ticket "${t.title}" → ${status}`); message.success(`Ticket → ${status}`); } });

  const linkedTo = (t: Ticket) => t.taskId ? 'Task' : t.activityId ? 'Step' : t.changeRequestId ? 'CR' : 'Project';

  const count = (f: (t: Ticket) => boolean) => tickets.filter(f).length;
  const openParts = TICKET_OPEN_STATUSES.map((s) => ({ key: s, label: s, n: count((t) => t.status === s), tone: toneOf(TICKET_STATUS_COLOR[s]) })).filter((p) => p.n > 0);
  const prioParts = PRIORITY.map((p) => ({ key: p, label: p, n: count((t) => t.priority === p), tone: PRIO_TONE[p] })).filter((p) => p.n > 0);
  const statusItems = TICKET_STATUS.map((s) => ({ key: s, label: s, active: statusF === s, value: count((t) => t.status === s), color: SOFT[toneOf(TICKET_STATUS_COLOR[s])], onClick: () => setStatusF(statusF === s ? '' : s) })).filter((x) => x.value > 0);
  const typeSlices = TICKET_TYPE.map((ty) => ({ key: ty, label: ty, value: count((t) => t.type === ty), color: SOFT[toneOf(TICKET_TYPE_COLOR[ty])] })).filter((s) => s.value > 0);

  const cols: Col<Ticket>[] = [
    { key: 'title', header: 'Ticket', sort: (r) => r.title, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.title}</span><small>{r.tktId} · {r.reporter}</small></span>
    ) },
    { key: 'type', header: 'Type', sort: (r) => r.type, render: (r) => <Chip tone={toneOf(TICKET_TYPE_COLOR[r.type])}>{r.type}</Chip> },
    { key: 'prio', header: 'Priority', sort: (r) => PRIORITY.indexOf(r.priority), render: (r) => <Chip tone={PRIO_TONE[r.priority] ?? 'neutral'}>{r.priority}</Chip> },
    { key: 'proj', header: 'Project', wrap: true, sort: (r) => projName(r.projectId), render: (r) => (
      <span className="cell-2">
        {r.projectId ? <Link className="ent-link" to={`/delivery/projects/${r.projectId}`} onClick={(e) => e.stopPropagation()}>{projName(r.projectId)}</Link> : <span className="vw-label">—</span>}
        <small>Linked to {linkedTo(r)}</small>
      </span>
    ) },
    { key: 'age', header: 'Age', align: 'right', sort: (r) => ageDays(r.raisedAt), render: (r) => <span className="num">{ageDays(r.raisedAt)}d</span> },
    { key: 'assignee', header: 'Assignee', sort: (r) => r.assignee ?? '', render: (r) => r.assignee ?? <span className="vw-label">—</span> },
    { key: 'status', header: 'Status', sort: (r) => TICKET_STATUS.indexOf(r.status), render: (r) => (
      <span onClick={(e) => e.stopPropagation()}>
        <Select placeholder="Select status" size="small" value={r.status} variant="borderless" style={{ width: 150 }} onChange={(v) => setStatus(r, v)}
          options={TICKET_STATUS.map((x) => ({ value: x, label: <Chip tone={toneOf(TICKET_STATUS_COLOR[x])} dot>{x}</Chip> }))} />
      </span>
    ) },
  ];

  return (
    <OpsPage title="Tickets" description="Blockers, requests and issues raised against projects, with SLA and resolution tracking."
      actions={<Btn variant="filled" icon={Plus} onClick={() => setOpen(true)}>Raise ticket</Btn>}>

      <StatGrid>
        <StatTile label="Open" value={stats.open} sub={`of ${stats.total} tickets`}>
          <Split legend={false} parts={openParts} onPick={(k) => setStatusF(statusF === k ? '' : k)} active={statusF} />
        </StatTile>
        <StatTile label="Active blockers" value={stats.blockers} sub={stats.blockers ? 'holding up delivery' : 'nothing blocked'} subTone={stats.blockers ? 'bad' : undefined}
          onClick={() => setConditionF(conditionF === 'blockers' ? '' : 'blockers')} active={conditionF === 'blockers'} />
        <StatTile label="SLA breached" value={stats.slaBreached} sub={stats.slaBreached ? 'open past their SLA' : 'all within SLA'} subTone={stats.slaBreached ? 'bad' : undefined} onClick={() => setConditionF(conditionF === 'sla' ? '' : 'sla')} active={conditionF === 'sla'} />
        <StatTile label="Resolution rate" value={<>{stats.resolutionRate}<small>%</small></>} sub={`${stats.resolved} resolved`}>
          <SoftMeter pct={stats.resolutionRate} tone="success" />
        </StatTile>
        <StatTile label="Avg resolve" value={<>{stats.avgResolveDays}<small> d</small></>} sub="raise → resolve" />
        <StatTile label="Priority" value={count((t) => t.priority === 'Urgent' || t.priority === 'High')} sub="high or urgent">
          <Split parts={prioParts} onPick={(k) => setPrioF(prioF === k ? '' : k)} active={prioF} />
        </StatTile>
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title="Tickets by status" sub="Click a status to filter the register" icon={ListChecks}>
          <BarList items={statusItems} />
        </Panel>
        <Panel title="Tickets by type" sub={`${stats.total} tickets`} icon={Inbox}>
          <Donut slices={typeSlices} centerValue={String(stats.total)} centerLabel="tickets" onPick={(key) => setTypeF(typeF === key ? '' : key)} activeKey={typeF} />
        </Panel>
      </div>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} defaultSort={{ key: 'age', dir: 'asc' }} pageSize={30}
          toolbar={
            <ListToolbar shown={rows.length} total={tickets.length} noun="tickets"
              search={{ value: q, onChange: setQ, placeholder: 'Title, assignee, project' }}
              filters={[
                { id: 'condition', label: 'Condition', value: conditionF, anyLabel: 'Any condition', onChange: setConditionF, options: [{ id: 'blockers', label: 'Active blockers', count: stats.blockers }, { id: 'sla', label: 'SLA breached', count: stats.slaBreached }] },
                { id: 'status', label: 'Status', quick: true, value: statusF, anyLabel: 'Any status', onChange: setStatusF, options: TICKET_STATUS.map((x) => ({ id: x, label: x, count: count((t) => t.status === x) })) },
                { id: 'type', label: 'Type', quick: true, value: typeF, anyLabel: 'Any type', onChange: setTypeF, options: TICKET_TYPE.map((x) => ({ id: x, label: x, count: count((t) => t.type === x) })) },
                { id: 'priority', label: 'Priority', value: prioF, anyLabel: 'Any priority', onChange: setPrioF, options: PRIORITY.map((x) => ({ id: x, label: x, count: count((t) => t.priority === x) })) },
              ]} />
          } />
      </section>

      <TicketRaiseModal open={open} onClose={() => setOpen(false)} />
    </OpsPage>
  );
}
