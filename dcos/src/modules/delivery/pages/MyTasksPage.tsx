/* My tasks — /delivery/my-tasks. Project tasks for one person (the signed-in user by default),
   with a one-click move to the next status. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App } from 'antd';
import { ListChecks } from 'lucide-react';
import { useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { useAuth } from '../../../core/auth/AuthContext';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, Toggle } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { TASK_STATUS } from '../../../mock/data/enums';
import type { Task, Project } from '../../../mock/data/types';
import { fmtDay, relDays } from '../components/workorders/model';

const TASK_TONE = { Done: 'success', 'In Progress': 'info', Blocked: 'error', 'To Do': 'neutral' } as const;
const NONE: never[] = [];
const NEXT: Record<string, string> = { 'To Do': 'In Progress', 'In Progress': 'Done' };

export default function MyTasksPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const update = useEntityUpdate('tasks');
  const audit = useRecordAudit();
  const [assignee, setAssignee] = useState<string>(user.name);
  const [showDone, setShowDone] = useState(false);
  const [statusF, setStatusF] = useState<string>('All');

  const tasks = (useEntityList('tasks', { pageSize: 5000 }).data?.data ?? NONE) as unknown as Task[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? NONE) as unknown as Project[];
  const projName = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.name])), [projects]);
  const assignees = useMemo(() => Array.from(new Set(tasks.map(t => t.assignee))).sort(), [tasks]);
  const [now] = useState(() => new Date().toISOString());

  const mine = useMemo(() => {
    let rows = tasks.filter(t => t.assignee === assignee);
    if (!showDone) rows = rows.filter(t => t.status !== 'Done');
    if (statusF !== 'All') rows = rows.filter(t => t.status === statusF);
    return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [tasks, assignee, showDone, statusF]);
  const total = useMemo(() => tasks.filter(t => t.assignee === assignee).length, [tasks, assignee]);

  const counts = useMemo(() => {
    const m = tasks.filter(t => t.assignee === assignee);
    const open = m.filter(t => t.status !== 'Done');
    return {
      open: open.length, inprog: m.filter(t => t.status === 'In Progress').length, blocked: m.filter(t => t.status === 'Blocked').length,
      overdue: open.filter(t => t.dueDate < now).length, week: open.filter(t => t.dueDate >= now && t.dueDate < new Date(Date.parse(now) + 7 * 864e5).toISOString()).length,
      effort: open.reduce((s, t) => s + (t.effortDays ?? 0), 0),
    };
  }, [tasks, assignee, now]);

  const advance = (t: Task) => {
    const to = NEXT[t.status]; if (!to) return;
    update.mutate({ id: t.id, data: { status: to } }, { onSuccess: () => { audit('Task', t.taskId, to, `${t.name} moved to ${to}`); message.success(`${t.name} moved to ${to}`); } });
  };

  const cols: Col<Task>[] = [
    { key: 'n', header: 'Task', sort: t => t.name, render: t => <span className="cell-2"><span className="vw-card-activity-label">{t.name}</span><small>{t.taskId}</small></span> },
    { key: 'p', header: 'Project', sort: t => projName[t.projectId] ?? t.projectId, render: t => <Link to={`/delivery/projects/${t.projectId}`}>{projName[t.projectId] ?? t.projectId}</Link> },
    { key: 'd', header: 'Due', sort: t => t.dueDate, render: t => <span className="cell-2"><span className="num" style={{ color: t.status !== 'Done' && t.dueDate < now ? 'var(--vw-color-red-600)' : undefined }}>{fmtDay(t.dueDate)}</span><small>{relDays(t.dueDate)}</small></span> },
    { key: 'e', header: 'Effort', align: 'right', sort: t => t.effortDays ?? 0, render: t => <span className="num">{t.effortDays} d</span> },
    { key: 's', header: 'Status', sort: t => t.status, render: t => <Chip tone={TASK_TONE[t.status as keyof typeof TASK_TONE] ?? 'neutral'} dot>{t.status}</Chip> },
    { key: 'a', header: '', align: 'right', render: t => (NEXT[t.status] ? <Btn variant="ghost" size="xs" onClick={() => advance(t)}>Move to {NEXT[t.status]}</Btn> : null) },
  ];

  return (
    <OpsPage title="My tasks" description="Project tasks for one person, with a one-click move to the next status.">
      <StatGrid>
        <StatTile label="Open tasks" value={counts.open} sub={assignee === user.name ? 'assigned to me' : `assigned to ${assignee}`} />
        <StatTile label="In progress" value={counts.inprog} />
        <StatTile label="Blocked" value={counts.blocked} subTone={counts.blocked ? 'bad' : undefined} sub={counts.blocked ? 'need unblocking' : 'none blocked'} />
        <StatTile label="Overdue" value={counts.overdue} subTone={counts.overdue ? 'bad' : undefined} sub={counts.overdue ? 'past the due date' : 'none overdue'} />
        <StatTile label="Due in 7 days" value={counts.week} />
        <StatTile label="Open effort" value={<>{counts.effort}<small> days</small></>} sub="estimated" />
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={mine} cols={cols} pageSize={25}
          empty={<Empty icon={ListChecks} title={assignee ? 'No tasks match' : 'Choose a person'}>{assignee ? 'Change the status filter or show done tasks.' : 'Choose a person to see their tasks.'}</Empty>}
          toolbar={
            <ListToolbar shown={mine.length} total={total} noun="tasks"
              filters={[
                { id: 'assignee', label: 'Tasks of', quick: true, value: assignee, onChange: v => setAssignee(v), defaultValue: user.name, options: assignees.map(a => ({ id: a, label: a === user.name ? `${a} (me)` : a, count: tasks.filter(t => t.assignee === a).length })) },
                { id: 'status', label: 'Status', quick: true, value: statusF, defaultValue: 'All', onChange: v => setStatusF(v || 'All'), options: ['All', ...TASK_STATUS].map(s => ({ id: s, label: s === 'All' ? 'All statuses' : s })) },
              ]}>
              <label className="row" style={{ gap: 8 }}><Toggle on={showDone} onChange={setShowDone} label="Show done tasks" /><span className="vw-label">Show done</span></label>
            </ListToolbar>
          } />
      </section>
    </OpsPage>
  );
}
