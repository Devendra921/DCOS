/* The smaller project tabs: schedule (Gantt and table), procurement, risks, documents (permits,
   design documents, attachments) and activity. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Drawer } from 'antd';
import type * as T from '../../../../mock/data/types';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { EntityDocumentsTab } from '../../../../shared/components/detail';
import { Gantt, type GanttRow, type GanttTone } from '../Gantt';
import { TaskDetail } from '../project360';
import { useProjectChangeLog } from '../../lib/useProject360';
import { DataTable, Muted, Bar } from './kit';
import { MILESTONE_TONE, PERMIT_TONE, PO_TONE, TASK_TONE, fmtDate, money, daysFrom, dateTime } from './format';

const DESIGN_TONE: Record<string, 'neutral' | 'warning' | 'cyan' | 'success' | 'info'> = { Draft: 'neutral', 'In Review': 'warning', Reviewed: 'cyan', 'Issued for Construction': 'success', Superseded: 'neutral', 'As-Built': 'info' };
const LEVEL_TONE: Record<string, 'neutral' | 'warning' | 'error'> = { Low: 'neutral', Medium: 'warning', High: 'error', Critical: 'error' };

/* ------------------------------------------------------------------ schedule */
type SchedRow = { id: string; name: string; kind: 'Task' | 'Milestone'; start?: string; end: string; who?: string; status: string; effort?: number; task?: T.Task };
const taskTone = (t: T.Task): GanttTone => t.status === 'Done' ? 'done' : t.status === 'Blocked' ? 'blocked' : daysFrom(t.dueDate) < 0 ? 'late' : t.status === 'In Progress' ? 'active' : 'todo';
const msTone = (m: T.Milestone): GanttTone => m.status === 'Completed' ? 'done' : m.status === 'Delayed' || daysFrom(m.dueDate) < 0 ? 'late' : m.status === 'In Progress' ? 'active' : 'todo';

export function ProjectScheduleTab({ project, tasks, milestones }: { project: T.Project; tasks: T.Task[]; milestones: T.Milestone[] }) {
  const [sel, setSel] = useState<T.Task | null>(null);
  const rows = useMemo<SchedRow[]>(() => ([
    ...tasks.map((t) => ({ id: t.id, name: t.name, kind: 'Task' as const, start: t.startDate, end: t.dueDate, who: t.assignee, status: t.status, effort: t.effortDays, task: t })),
    ...milestones.map((m) => ({ id: m.id, name: m.name, kind: 'Milestone' as const, end: m.dueDate, status: m.status })),
  ] as SchedRow[]).sort((a, b) => (a.start ?? a.end).localeCompare(b.start ?? b.end) || a.kind.localeCompare(b.kind)), [tasks, milestones]);
  const gantt: GanttRow[] = rows.map((r) => r.task
    ? { id: r.id, label: r.name, sub: r.who, start: r.start, end: r.end, tone: taskTone(r.task), progress: r.status === 'Done' ? 100 : 0, tooltip: `${r.name}: ${fmtDate(r.start)} to ${fmtDate(r.end)}, ${r.status}`, onClick: () => setSel(r.task!) }
    : { id: r.id, label: r.name, sub: 'Milestone', end: r.end, kind: 'milestone' as const, tone: msTone(milestones.find((m) => m.id === r.id)!), tooltip: `${r.name}: ${fmtDate(r.end)}, ${r.status}` });
  const late = tasks.filter((t) => t.status !== 'Done' && daysFrom(t.dueDate) < 0).length;

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard title="Schedule" extra={<Muted>{fmtDate(project.plannedStart)} to {fmtDate(project.plannedEnd)}{late ? ` · ${late} task${late === 1 ? '' : 's'} late` : ''}</Muted>}>
        <Gantt rows={gantt} empty="No tasks or milestones are scheduled for this project." />
        <div className="vw-flex vw-gap-lg vw-wrap" style={{ marginTop: 'var(--vw-space-sm)', fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-600)' }}>
          <span>Bars are tasks, diamonds are milestones.</span>
          <span style={{ color: 'var(--vw-color-green-700)' }}>Done</span><span style={{ color: 'var(--vw-color-blue-700)' }}>In progress</span><span style={{ color: 'var(--vw-color-red-600)' }}>Late</span><span style={{ color: 'var(--vw-color-amber-700)' }}>Blocked</span><span>Not started</span>
        </div>
      </VwCard>
      <VwCard title="Tasks and milestones" extra={<Muted>{tasks.length} tasks · {milestones.length} milestones</Muted>}>
        <DataTable rows={rows} rowKey={(r) => r.id} onRow={(r) => r.task && setSel(r.task)} empty="Nothing scheduled."
          cols={[
            { key: 'name', title: 'Item', wrap: true, render: (r) => r.name },
            { key: 'kind', title: 'Kind', render: (r) => r.kind },
            { key: 's', title: 'Start', render: (r) => (r.start ? fmtDate(r.start) : <Muted>—</Muted>) },
            { key: 'e', title: 'Finish', render: (r) => fmtDate(r.end) },
            { key: 'who', title: 'Assignee', render: (r) => r.who ?? <Muted>—</Muted> },
            { key: 'eff', title: 'Effort', align: 'right', render: (r) => (r.effort ? `${r.effort} d` : '—') },
            { key: 'st', title: 'Status', render: (r) => <VwChip variant={(r.kind === 'Task' ? TASK_TONE : MILESTONE_TONE)[r.status] ?? 'neutral'}>{r.status}</VwChip> },
          ]} />
      </VwCard>
      <Drawer mask={false} title="Task" width={460} open={!!sel} onClose={() => setSel(null)} destroyOnHidden>{sel && <TaskDetail task={sel} />}</Drawer>
    </div>
  );
}

/* ------------------------------------------------------------------ procurement */
export interface PoRow { po: T.PurchaseOrder; bom?: T.BOM; vendor?: T.Vendor; project?: T.Project }
export function ProcurementTable({ rows, showProject, empty }: { rows: PoRow[]; showProject?: boolean; empty?: React.ReactNode }) {
  return (
    <DataTable rows={rows} rowKey={(r) => r.po.id} empty={empty ?? 'No purchase orders.'}
      cols={[
        { key: 'id', title: 'Order', render: (r) => r.po.poId },
        ...(showProject ? [{ key: 'p', title: 'Project', wrap: true, render: (r: PoRow) => (r.project ? <Link to={`/delivery/projects/${r.project.id}`}>{r.project.name}</Link> : <Muted>Plan level</Muted>) }] : []),
        { key: 'bom', title: 'Bill of materials', wrap: true, render: (r) => r.bom?.name ?? <Muted>—</Muted> },
        { key: 'v', title: 'Vendor', render: (r) => r.vendor?.name ?? <Muted>—</Muted> },
        { key: 'ob', title: 'Order by', render: (r) => fmtDate(r.po.orderBy) },
        { key: 'nb', title: 'Need by', render: (r) => fmtDate(r.po.needBy) },
        { key: 'st', title: 'Status', render: (r) => <VwChip variant={PO_TONE[r.po.status] ?? 'neutral'}>{r.po.status}</VwChip> },
        { key: 'val', title: 'Value', align: 'right', render: (r) => money(r.po.plannedCost) },
        { key: 'paid', title: 'Paid', align: 'right', render: (r) => money(r.po.actualSpend) },
        { key: 'bar', title: '', render: (r) => <Bar value={r.po.actualSpend} max={r.po.plannedCost} over={r.po.actualSpend > r.po.plannedCost} width={80} /> },
      ]} />
  );
}

export function ProjectProcurementTab({ rows, boms, canGenerate, onGenerate }: { rows: PoRow[]; boms: T.BOM[]; canGenerate: boolean; onGenerate: () => void }) {
  const total = rows.reduce((s, r) => s + r.po.plannedCost, 0);
  const paid = rows.reduce((s, r) => s + r.po.actualSpend, 0);
  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard title="Purchase orders" extra={<span className="vw-inline-flex vw-items-center vw-gap-sm"><Muted>{rows.length} orders · {money(total)} · {money(paid)} paid</Muted>{canGenerate && <Button size="small" type="primary" onClick={onGenerate}>Generate procurement</Button>}</span>}>
        <ProcurementTable rows={rows} empty={canGenerate ? 'No purchase orders yet. Generate procurement to create the bill of materials and its orders.' : 'No purchase orders for this project or its plan.'} />
      </VwCard>
      {boms.length > 0 && (
        <VwCard title="Bills of materials" extra={<Muted>{boms.length}</Muted>}>
          <DataTable rows={boms} rowKey={(b) => b.id}
            cols={[
              { key: 'n', title: 'Bill of materials', wrap: true, render: (b) => b.name },
              { key: 't', title: 'Type', render: (b) => b.type },
              { key: 'l', title: 'Lines', align: 'right', render: (b) => b.lineCount },
              { key: 'c', title: 'Total', align: 'right', render: (b) => money(b.totalCost) },
              { key: 's', title: 'Status', render: (b) => b.status },
            ]} />
        </VwCard>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ risks */
export function RisksTable({ risks, projects }: { risks: T.RiskItem[]; projects?: T.Project[] }) {
  const sorted = [...risks].sort((a, b) => Number(b.status === 'Open') - Number(a.status === 'Open') || ['Critical', 'High', 'Medium', 'Low'].indexOf(a.level) - ['Critical', 'High', 'Medium', 'Low'].indexOf(b.level));
  return (
    <DataTable rows={sorted} rowKey={(r) => r.id} empty="No risks recorded."
      cols={[
        { key: 'd', title: 'Risk', wrap: true, render: (r) => r.description },
        ...(projects ? [{ key: 'p', title: 'Project', wrap: true, render: (r: T.RiskItem) => { const p = projects.find((x) => x.id === r.projectId); return p ? <Link to={`/delivery/projects/${p.id}`}>{p.name}</Link> : '—'; } }] : []),
        { key: 'c', title: 'Category', render: (r) => r.category },
        { key: 'pi', title: 'Likelihood / impact', render: (r) => `${r.probability} / ${r.impact}` },
        { key: 'l', title: 'Level', render: (r) => <VwChip variant={LEVEL_TONE[r.level] ?? 'neutral'}>{r.level}</VwChip> },
        { key: 'm', title: 'Mitigation', wrap: true, render: (r) => <Muted>{r.mitigation || '—'}</Muted> },
        { key: 's', title: 'Status', render: (r) => r.status },
      ]} />
  );
}

/* ------------------------------------------------------------------ documents */
export function PermitsTable({ permits, projects }: { permits: T.Permit[]; projects?: T.Project[] }) {
  return (
    <DataTable rows={permits} rowKey={(p) => p.id} empty="No permits recorded."
      cols={[
        { key: 'n', title: 'Permit', wrap: true, render: (p) => p.name },
        ...(projects ? [{ key: 'pr', title: 'Project', wrap: true, render: (p: T.Permit) => { const x = projects.find((q) => q.id === p.projectId); return x ? <Link to={`/delivery/projects/${x.id}`}>{x.name}</Link> : <Muted>Programme</Muted>; } }] : []),
        { key: 't', title: 'Type', render: (p) => p.type },
        { key: 'a', title: 'Authority', render: (p) => p.authority },
        { key: 'ap', title: 'Applied', render: (p) => fmtDate(p.appliedDate) },
        { key: 'ok', title: 'Approved', render: (p) => fmtDate(p.approvedDate) },
        { key: 'ex', title: 'Expires', render: (p) => { if (!p.expiryDate) return <Muted>—</Muted>; const n = daysFrom(p.expiryDate); return <span style={{ color: n < 0 ? 'var(--vw-color-red-600)' : n < 60 ? 'var(--vw-color-amber-700)' : undefined }}>{fmtDate(p.expiryDate)}</span>; } },
        { key: 's', title: 'Status', render: (p) => <VwChip variant={PERMIT_TONE[p.status] ?? 'neutral'}>{p.status}</VwChip> },
      ]} />
  );
}

export function ProjectDocumentsTab({ project, permits, designDocs }: { project: T.Project; permits: T.Permit[]; designDocs: T.DesignDocument[] }) {
  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard title="Permits" extra={<Muted>{permits.filter((p) => p.status === 'Approved').length} of {permits.length} approved · <Link to="/delivery/permits">Permit register</Link></Muted>}>
        <PermitsTable permits={permits} />
      </VwCard>
      <VwCard title="Design documents" extra={<Muted>{designDocs.length} · <Link to="/delivery/design">Design register</Link></Muted>}>
        <DataTable rows={designDocs} rowKey={(x) => x.id} empty="No design documents for this project."
          cols={[
            { key: 'n', title: 'Document', wrap: true, render: (x) => x.name },
            { key: 't', title: 'Type', render: (x) => x.type },
            { key: 'r', title: 'Revision', render: (x) => x.revision },
            { key: 'a', title: 'Author', render: (x) => x.author },
            { key: 'i', title: 'Issued', render: (x) => fmtDate(x.issuedDate) },
            { key: 's', title: 'Status', render: (x) => <VwChip variant={DESIGN_TONE[x.status] ?? 'neutral'}>{x.status}</VwChip> },
          ]} />
      </VwCard>
      <VwCard title="Attached documents"><EntityDocumentsTab entityId={project.id} /></VwCard>
    </div>
  );
}

/* ------------------------------------------------------------------ activity */
export function ProjectActivityTab({ project }: { project: T.Project }) {
  const log = useProjectChangeLog(project);
  return (
    <VwCard title="Activity" extra={<Muted>{log.length} entries, newest first. The log cannot be edited.</Muted>}>
      <DataTable rows={log} rowKey={(a) => a.id} empty="No activity recorded yet. Actions on this project and its records appear here."
        cols={[
          { key: 'w', title: 'When', render: (a) => dateTime(a.timestamp) },
          { key: 'who', title: 'Who', render: (a) => a.actorName },
          { key: 'rec', title: 'Record', render: (a) => `${a.entityType} ${a.entityId}` },
          { key: 'act', title: 'Action', render: (a) => a.action },
          { key: 's', title: 'Summary', wrap: true, render: (a) => <Muted>{a.summary}</Muted> },
        ]} />
    </VwCard>
  );
}
