/* Project overview: the current stage and what it waits on (open tasks and blockers), milestones,
   key dates and the top risks. Plain tables and key–value lists only. */
import { Link } from 'react-router-dom';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { fmtDue } from '../../../workorders/lib/useWorkflows';
import type { ProjectChain } from '../../lib/chain';
import { DataTable, KvList, Muted } from './kit';
import { MILESTONE_TONE, RAG_TONE, daysFrom, fmtDate, shortDate, type Blocker } from './format';

const LEVEL_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function ProjectOverviewTab({ chain, stage, waitingOn, blockers, onTab }: {
  chain: ProjectChain; stage: string; waitingOn: string; blockers: Blocker[]; onTab: (key: string) => void;
}) {
  const { project, program, plan, process } = chain;
  const ms = [...chain.milestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const risks = [...chain.risks].sort((a, b) => Number(b.status === 'Open') - Number(a.status === 'Open') || (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9)).slice(0, 5);
  const nextMs = ms.find((m) => m.status !== 'Completed');
  const woDates = chain.workOrders.map((w) => w.plannedStart ?? w.scheduledDate).filter(Boolean).sort();
  const nextWo = woDates.find((x) => x >= new Date().toISOString());

  return (
    <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 380px)', alignItems: 'start' }}>
      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <VwCard title="Where the project is" extra={<a onClick={() => onTab('process')}>Open process</a>}>
          <div className="vw-flex vw-flex-col vw-gap-md">
            <KvList columns={2} items={[
              { label: 'Current stage', value: stage },
              { label: 'Waiting on', value: waitingOn },
            ]} />
            <div>
              <div className="vw-card-title-sm" style={{ marginBottom: 6 }}>Open tasks</div>
              <DataTable rows={chain.openTasks} rowKey={(t) => t.id}
                empty={process ? 'No task is waiting on a person right now.' : 'No process is running, so there are no process tasks. Start the process on the Process tab.'}
                cols={[
                  { key: 'task', title: 'Task', wrap: true, render: (t) => t.name },
                  { key: 'who', title: 'Assignee', render: (t) => t.assignee ?? <Muted>{t.candidateRole}, unassigned</Muted> },
                  { key: 'due', title: 'Due', render: (t) => { const d = fmtDue(t.dueAt); return <span style={{ color: d.overdue ? 'var(--vw-color-red-600)' : undefined }}>{shortDate(t.dueAt)} <Muted size="xs">{d.text}</Muted></span>; } },
                ]} />
            </div>
            <div>
              <div className="vw-card-title-sm" style={{ marginBottom: 6 }}>Blockers</div>
              <DataTable rows={blockers} rowKey={(b) => b.key} empty="Nothing is blocking the project."
                cols={[
                  { key: 'what', title: 'Blocker', render: (b) => <span style={{ color: 'var(--vw-color-amber-700)' }}>{b.what}</span> },
                  { key: 'detail', title: 'Detail', wrap: true, render: (b) => <Muted>{b.detail}</Muted> },
                  { key: 'go', title: '', align: 'right', render: (b) => <a onClick={() => onTab(b.tab)}>View</a> },
                ]} />
            </div>
          </div>
        </VwCard>

        <VwCard title="Milestones" extra={<Muted>{ms.filter((m) => m.status === 'Completed').length} of {ms.length} done</Muted>}>
          <DataTable rows={ms} rowKey={(m) => m.id} empty="No milestones recorded for this project."
            cols={[
              { key: 'name', title: 'Milestone', wrap: true, render: (m) => m.name },
              { key: 'due', title: 'Due', render: (m) => fmtDate(m.dueDate) },
              { key: 'when', title: '', render: (m) => { if (m.status === 'Completed') return <Muted>done</Muted>; const n = daysFrom(m.dueDate); return n < 0 ? <span style={{ color: 'var(--vw-color-red-600)' }}>{-n} days late</span> : <Muted>in {n} days</Muted>; } },
              { key: 'status', title: 'Status', render: (m) => <VwChip variant={MILESTONE_TONE[m.status] ?? 'neutral'}>{m.status}</VwChip> },
              { key: 'rag', title: 'RAG', render: (m) => <VwChip variant={RAG_TONE[m.rag] ?? 'neutral'}>{m.rag}</VwChip> },
            ]} />
        </VwCard>
      </div>

      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <VwCard title="Key dates">
          <KvList items={[
            { label: 'Planned start', value: fmtDate(project.plannedStart) },
            { label: 'Planned finish', value: fmtDate(project.plannedEnd) },
            { label: 'Next milestone', value: nextMs ? `${nextMs.name}, ${fmtDate(nextMs.dueDate)}` : 'None open' },
            { label: 'Next work window', value: nextWo ? fmtDate(nextWo) : 'None booked' },
            { label: 'Process started', value: process ? fmtDate(process.startedAt) : 'Not started' },
            ...(plan ? [{ label: 'Plan go-live', value: fmtDate(plan.baseline?.targetGoLive ?? plan.targetGoLive) }] : []),
          ]} />
        </VwCard>

        <VwCard title="The project">
          <KvList items={[
            { label: 'Programme', value: program ? <Link to={`/delivery/programs/${program.id}`}>{program.name}</Link> : 'None' },
            { label: 'Plan', value: plan ? <Link to={`/planning/plans/${plan.id}`}>{plan.plnId}</Link> : 'Not from a plan' },
            { label: 'Template', value: project.template ?? '—' },
            ...(project.startGate ? [{ label: 'Start gate', value: project.startGate }] : []),
            ...(project.dependsOnProjectIds?.length ? [{ label: 'Depends on', value: `${project.dependsOnProjectIds.length} earlier phase${project.dependsOnProjectIds.length === 1 ? '' : 's'}` }] : []),
            ...(project.longLead ? [{ label: 'Long lead', value: 'Procurement runs ahead of earlier phases' }] : []),
          ]} />
        </VwCard>

        <VwCard title="Top risks" extra={<a onClick={() => onTab('risks')}>All {chain.risks.length}</a>}>
          {risks.length === 0 ? <div className="vw-card-description">No risks recorded. Add them on the Risks tab.</div> : (
            <div className="vw-flex vw-flex-col">
              {risks.map((r, i) => (
                <div key={r.id} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
                  <div className="vw-flex vw-justify-between vw-gap-sm" style={{ alignItems: 'baseline' }}>
                    <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-900)' }}>{r.description}</span>
                    <VwChip variant={r.level === 'Critical' || r.level === 'High' ? 'error' : r.level === 'Medium' ? 'warning' : 'neutral'}>{r.level}</VwChip>
                  </div>
                  <Muted size="xs">{r.category} · {r.status}{r.mitigation ? ` · ${r.mitigation}` : ''}</Muted>
                </div>
              ))}
            </div>
          )}
        </VwCard>
      </div>
    </div>
  );
}
