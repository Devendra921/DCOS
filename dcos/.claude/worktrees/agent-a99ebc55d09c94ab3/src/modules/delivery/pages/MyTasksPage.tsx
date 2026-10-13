/* My tasks — /delivery/my-tasks. Project tasks for one person (the signed-in user by default),
   with a one-click move to the next status. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Select, Switch } from 'antd';
import { useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { useAuth } from '../../../core/auth/AuthContext';
import { VwCard, VwChip, VwSegmented } from '../../../shared/components/ux';
import { TASK_STATUS } from '../../../mock/data/enums';
import type { Task, Project } from '../../../mock/data/types';
import { DataTable, Muted, SummaryRow } from '../components/home/kit';
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

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
        <Muted>Tasks of</Muted>
        <Select placeholder="Choose a person" value={assignee} onChange={setAssignee} style={{ width: 220 }} showSearch optionFilterProp="label" aria-label="Assignee"
          options={assignees.map(a => ({ value: a, label: a === user.name ? `${a} (me)` : a }))} />
        <VwSegmented value={statusF} onChange={v => setStatusF(v)} options={['All', ...TASK_STATUS]} size="small" />
        <span className="vw-inline-flex vw-items-center vw-gap-xs"><Switch checked={showDone} onChange={setShowDone} size="small" aria-label="Show done tasks" /><Muted>Show done</Muted></span>
      </div>

      <SummaryRow items={[
        { label: 'Open tasks', value: counts.open },
        { label: 'In progress', value: counts.inprog },
        { label: 'Blocked', value: counts.blocked, tone: counts.blocked ? 'bad' : undefined },
        { label: 'Overdue', value: counts.overdue, tone: counts.overdue ? 'bad' : undefined },
        { label: 'Due in 7 days', value: counts.week },
        { label: 'Open effort', value: `${counts.effort} days`, sub: 'estimated' },
      ]} />

      <VwCard title="Tasks" extra={<Muted>{mine.length} shown</Muted>}>
        <DataTable<Task> rows={mine} rowKey={t => t.id} limit={25}
          empty={assignee ? 'No tasks match. Change the status filter or show done tasks.' : 'Choose a person to see their tasks.'}
          cols={[
            { key: 'n', title: 'Task', wrap: true, minWidth: 220, render: t => t.name },
            { key: 'p', title: 'Project', wrap: true, minWidth: 180, render: t => <Link to={`/delivery/projects/${t.projectId}`}>{projName[t.projectId] ?? t.projectId}</Link> },
            { key: 'd', title: 'Due', render: t => <span style={{ color: t.status !== 'Done' && t.dueDate < now ? 'var(--vw-color-red-600)' : undefined }}>{fmtDay(t.dueDate)} <Muted size="xs">({relDays(t.dueDate)})</Muted></span> },
            { key: 'e', title: 'Effort', align: 'right', render: t => `${t.effortDays} d` },
            { key: 's', title: 'Status', render: t => <VwChip variant={TASK_TONE[t.status as keyof typeof TASK_TONE] ?? 'neutral'}>{t.status}</VwChip> },
            { key: 'a', title: '', align: 'right', render: t => (NEXT[t.status] ? <button type="button" className="nst-btn nst-btn--ghost nst-btn--xs" onClick={() => advance(t)}>Move to {NEXT[t.status]}</button> : null) },
          ]} />
      </VwCard>
    </div>
  );
}
