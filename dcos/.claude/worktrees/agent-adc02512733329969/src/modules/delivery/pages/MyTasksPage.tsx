import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Select, Space, Spin, Typography, Switch } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { InboxOutlined, SyncOutlined, WarningOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { useAuth } from '../../../core/auth/AuthContext';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip, VwSegmented} from '../../../shared/components/ux';
import { TASK_STATUS } from '../../../mock/data/enums';
import type { Task, Project } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const taskColor: Record<string, string> = { Done: 'green', 'In Progress': 'blue', Blocked: 'red', 'To Do': 'default' };
const NEXT: Record<string, string> = { 'To Do': 'In Progress', 'In Progress': 'Done' };

export default function MyTasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const update = useEntityUpdate('tasks');
  const audit = useRecordAudit();
  const [assignee, setAssignee] = useState<string>(user.name);
  const [showDone, setShowDone] = useState(false);
  const [statusF, setStatusF] = useState<string>('All');

  const tasks = (useEntityList('tasks', { pageSize: 5000 }).data?.data ?? []) as unknown as Task[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const projName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const assignees = useMemo(() => Array.from(new Set(tasks.map((t) => t.assignee))).sort(), [tasks]);

  const mine = useMemo(() => {
    let rows = tasks.filter((t) => t.assignee === assignee);
    if (!showDone) rows = rows.filter((t) => t.status !== 'Done');
    if (statusF !== 'All') rows = rows.filter((t) => t.status === statusF);
    return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [tasks, assignee, showDone, statusF]);
  const { visible, hasMore, sentinelRef, total } = useScrollReveal(mine, 25, `${assignee}|${showDone}|${statusF}`);

  const counts = useMemo(() => {
    const m = tasks.filter((t) => t.assignee === assignee);
    return {
      open: m.filter((t) => t.status !== 'Done').length,
      inprog: m.filter((t) => t.status === 'In Progress').length,
      overdue: m.filter((t) => t.status !== 'Done' && t.dueDate < new Date().toISOString()).length,
    };
  }, [tasks, assignee]);

  const advance = (t: Task) => {
    const to = NEXT[t.status]; if (!to) return;
    update.mutate({ id: t.id, data: { status: to } }, { onSuccess: () => { audit('Task', t.taskId, to, `${t.name} → ${to}`); message.success(`${t.name} → ${to}`); } });
  };

  const columns: TableColumnType<Task>[] = [
    { title: 'Task', dataIndex: 'name' },
    { title: 'Project', dataIndex: 'projectId', render: (id: string) => <a onClick={() => navigate(`/delivery/projects/${id}`)}>{projName[id] ?? '—'}</a> },
    { title: 'Due', dataIndex: 'dueDate', sorter: (a, b) => a.dueDate.localeCompare(b.dueDate), render: (d: string) => { const overdue = d < new Date().toISOString(); return <Text type={overdue ? 'danger' : undefined}>{d.slice(0, 10)}</Text>; } },
    { title: 'Effort', dataIndex: 'effortDays', render: (e: number) => `${e}d` },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={taskColor[s]}>{s}</VwChip> },
    { title: '', key: 'a', render: (_: unknown, t) => NEXT[t.status] ? <a onClick={() => advance(t)}>→ {NEXT[t.status]}</a> : null },
  ];

  return (
    <div>
      <Space className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div className="vw-page-title" role="heading" aria-level={3}>My Tasks</div>
        <Space>
          <Text type="secondary">Assignee</Text>
          <Select placeholder="Select assignee" value={assignee} onChange={setAssignee} style={{ width: 200 }} showSearch optionFilterProp="label"
            options={assignees.map((a) => ({ value: a, label: a === user.name ? `${a} (me)` : a }))} />
        </Space>
      </Space>

      <div className="vw-grid vw-grid-cols-3 vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Open tasks" value={counts.open} icon={<InboxOutlined />} iconTone="info" />
        <KPICard title="In progress" value={counts.inprog} icon={<SyncOutlined />} iconTone="cyan" />
        <KPICard title="Overdue" value={counts.overdue} color={counts.overdue ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="error" />
      </div>

      <Space style={{ marginBottom: "var(--vw-space-md)" }} wrap>
        <VwSegmented value={statusF} onChange={(v) => setStatusF(v as string)} options={['All', ...TASK_STATUS]} />
        <Space size={6}><Switch checked={showDone} onChange={setShowDone} size="small" /><Text type="secondary">Show done</Text></Space>
      </Space>
      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
        Showing {visible.length} of {total} tasks
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Table<Task> rowKey="id" size="middle" dataSource={visible} columns={columns} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }} />
        {visible.length > 0 && hasMore && (
          <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>
    </div>
  );
}
