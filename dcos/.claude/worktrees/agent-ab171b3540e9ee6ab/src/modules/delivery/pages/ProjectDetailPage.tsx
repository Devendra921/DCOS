import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Drawer, Empty, Space, Typography, Tabs } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ArrowLeftOutlined, PercentageOutlined, DollarOutlined, WalletOutlined, WarningOutlined } from '../../../shared/icons';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';
import { useEntityDetail, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { EntityDocumentsTab } from '../../../shared/components/detail';
import { Gantt } from '../components/Gantt';
import ProjectDeliveryTab from '../components/ProjectDeliveryTab';
import ProjectCostTab from '../components/ProjectCostTab';
import { ProjectImpactTab, ProjectChangeLogTab, ProjectTemplateOverview, TaskDetail } from '../components/project360';
import { useProjectImpact, useProjectChangeLog } from '../lib/useProject360';
import { useProjectCost } from '../lib/cost';
import { TicketPanel } from '../components/TicketPanel';
import { useAllTickets } from '../lib/tickets';
import type { Project, Milestone, Task, RiskItem } from '../../../mock/data/types';

const { Title } = Typography;
const ragColor: Record<string, string> = { Red: 'red', Amber: 'orange', Green: 'green', Grey: 'default' };
const taskColor: Record<string, string> = { Done: 'green', 'In Progress': 'blue', Blocked: 'red', 'To Do': 'default' };
const riskColor: Record<string, string> = { Low: 'green', Medium: 'blue', High: 'orange', Critical: 'red' };

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { data } = useEntityDetail('projects', projectId);
  const filt = { filters: [{ field: 'projectId', operator: 'eq' as const, value: projectId }], pageSize: 200 };
  const ms = (useEntityList('milestones', filt).data?.data ?? []) as unknown as Milestone[];
  const tasks = (useEntityList('tasks', filt).data?.data ?? []) as unknown as Task[];
  const risks = (useEntityList('risks', filt).data?.data ?? []) as unknown as RiskItem[];
  const [selTask, setSelTask] = useState<Task | null>(null);
  const p = data as unknown as Project | null;
  // counts for tab badges (hooks must run unconditionally)
  const impact = useProjectImpact(p);
  const changeLog = useProjectChangeLog(p);
  const cost = useProjectCost(p);
  const allTickets = useAllTickets();
  if (!p) return <div><Empty description="Project not found" /></div>;
  const ticketCount = allTickets.filter((t) => t.projectId === p.id).length;
  const k = (v: number) => `$${(v / 1000).toFixed(0)}k`;

  const gantt = [
    ...tasks.map((t) => ({ label: t.name, start: t.startDate, end: t.dueDate, status: t.status, kind: 'task' as const })),
    ...ms.map((m) => ({ label: m.name, start: p.plannedStart, end: m.dueDate, status: m.status, kind: 'milestone' as const })),
  ];

  return (
    <div>
      <Space className="vw-card-section" style={{ marginBottom: "var(--vw-space-md)", width: '100%' }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/delivery/portfolio')}>Portfolio</Button>
        <div className="vw-page-title" role="heading" aria-level={4}>{p.name}</div>
        <VwChip>{p.status}</VwChip><VwChip color={ragColor[p.rag]}>{p.rag}</VwChip>
      </Space>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <KPICard title="Completion" value={p.percentComplete} suffix="%" icon={<PercentageOutlined />} iconTone="info" />
        <KPICard title="Approved budget" value={k(cost?.approvedBudget ?? p.budget)} icon={<DollarOutlined />} iconTone="success" />
        <KPICard title="Spend" value={k(cost?.actual ?? p.actualSpend)} color={(cost?.actual ?? p.actualSpend) > (cost?.approvedBudget ?? p.budget) ? 'var(--vw-color-red-600)' : undefined} icon={<WalletOutlined />} iconTone="cyan" />
        <KPICard title="Open risks" value={risks.filter((r) => r.status === 'Open').length} icon={<WarningOutlined />} iconTone={risks.some((r) => r.status === 'Open') ? 'warning' : 'success'} />
      </div>
      <VwCard size="small" style={{ marginBottom: "var(--vw-space-lg)" }} bodyStyle={{ padding: '10px 16px' }}>
        <ProjectTemplateOverview project={p} />
      </VwCard>
      <VwCard size="small">
        <Tabs items={[
          { key: 'delivery', label: 'Delivery', children: <ProjectDeliveryTab project={p} /> },
          { key: 'cost', label: cost && cost.variance < 0 ? 'Cost ⚠' : 'Cost', children: <ProjectCostTab project={p} /> },
          { key: 'timeline', label: 'Timeline', children: (
            <>
              <Gantt items={gantt} />
              <Title level={5} style={{ margin: '20px 0 8px' }}>Milestones ({ms.length})</Title>
              <Table<Milestone> size="small" rowKey="id" dataSource={ms} pagination={false}
                columns={[{ title: 'Milestone', dataIndex: 'name' }, { title: 'Due', dataIndex: 'dueDate', render: (d: string) => d.slice(0, 10) }, { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip>{s}</VwChip> }, { title: 'RAG', dataIndex: 'rag', render: (r: string) => <VwChip color={ragColor[r]}>{r}</VwChip> }]} scroll={{ x: 'max-content' }} />
            </>
          ) },
          { key: 'tasks', label: `Tasks (${tasks.length})`, children: (
            <Table<Task> size="small" rowKey="id" dataSource={tasks} pagination={false}
              onRow={(t) => ({ onClick: () => setSelTask(t), style: { cursor: 'pointer' } })}
              columns={[{ title: 'Task', dataIndex: 'name' }, { title: 'Assignee', dataIndex: 'assignee' }, { title: 'Due', dataIndex: 'dueDate', render: (d: string) => d.slice(0, 10) }, { title: 'Effort', dataIndex: 'effortDays', render: (e: number) => `${e}d` }, { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={taskColor[s]}>{s}</VwChip> }, { title: '', key: 'x', render: () => <a>Details</a> }]} scroll={{ x: 'max-content' }} />
          ) },
          { key: 'impact', label: `Impacted entities (${impact.total})`, children: <ProjectImpactTab project={p} /> },
          { key: 'tickets', label: `Tickets (${ticketCount})`, children: <TicketPanel anchor={{ projectId: p.id }} title="Project tickets" dataCenterId={p.dataCenterId} /> },
          { key: 'activity', label: `Activity Log (${changeLog.length})`, children: <ProjectChangeLogTab project={p} /> },
          { key: 'risks', label: `Risks (${risks.length})`, children: (
            <Table<RiskItem> size="small" rowKey="id" dataSource={risks} pagination={false}
              columns={[{ title: 'Category', dataIndex: 'category', render: (c: string) => <VwChip>{c}</VwChip> }, { title: 'Description', dataIndex: 'description', ellipsis: true }, { title: 'P', dataIndex: 'probability' }, { title: 'I', dataIndex: 'impact' }, { title: 'Level', dataIndex: 'level', render: (l: string) => <VwChip color={riskColor[l]}>{l}</VwChip> }, { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip>{s}</VwChip> }]} scroll={{ x: 'max-content' }} />
          ) },
          { key: 'docs', label: 'Documents', children: <EntityDocumentsTab entityId={p.id} /> },
        ]} />
      </VwCard>

      <Drawer mask={false} title="Task detail" width={460} open={!!selTask} onClose={() => setSelTask(null)} destroyOnClose>
        {selTask && <TaskDetail task={selTask} />}
      </Drawer>
    </div>
  );
}
