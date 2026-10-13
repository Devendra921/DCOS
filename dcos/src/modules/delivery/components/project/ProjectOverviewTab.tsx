/* Project overview: the current stage and what it waits on (open tasks and blockers), milestones,
   key dates, a line on materials and the top risks. Plain tables and key–value lists only. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Compass, Flag, FolderKanban, ShieldAlert } from 'lucide-react';
import { Chip, KV, Panel, PanelLink } from '../../../../ops/ui/kit';
import { fmtDue } from '../../../workorders/lib/useWorkflows';
import type { ProjectChain } from '../../lib/chain';
import { linesOfProject, readinessOf } from '../../lib/materialRules';
import { useMaterialData } from '../../lib/materialHooks';
import { ReadinessChip } from './materials';
import { DataTable, Muted, ToneChip } from './kit';
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
  const mat = useMaterialData();
  const [now] = useState(() => Date.now());
  const kit = useMemo(() => readinessOf(linesOfProject(mat, project.id), now), [mat, project.id, now]);

  return (
    <div className="grid g-main-side" style={{ alignItems: 'start' }}>
      <div className="col" style={{ gap: 16 }}>
        <Panel title="Where the project is" icon={Compass} actions={<PanelLink onClick={() => onTab('process')}>Open process</PanelLink>}>
          <div className="col" style={{ gap: 16 }}>
            <KV cols={2} items={[
              ['Current stage', stage],
              ['Waiting on', waitingOn],
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
        </Panel>

        <Panel title="Milestones" icon={Flag} sub={`${ms.filter((m) => m.status === 'Completed').length} of ${ms.length} done`}>
          <DataTable rows={ms} rowKey={(m) => m.id} empty="No milestones recorded for this project."
            cols={[
              { key: 'name', title: 'Milestone', wrap: true, render: (m) => m.name },
              { key: 'due', title: 'Due', render: (m) => fmtDate(m.dueDate) },
              { key: 'when', title: '', render: (m) => { if (m.status === 'Completed') return <Muted>done</Muted>; const n = daysFrom(m.dueDate); return n < 0 ? <span style={{ color: 'var(--vw-color-red-600)' }}>{-n} days late</span> : <Muted>in {n} days</Muted>; } },
              { key: 'status', title: 'Status', render: (m) => <ToneChip v={MILESTONE_TONE[m.status] ?? 'neutral'}>{m.status}</ToneChip> },
              { key: 'rag', title: 'RAG', render: (m) => <ToneChip v={RAG_TONE[m.rag] ?? 'neutral'}>{m.rag}</ToneChip> },
            ]} />
        </Panel>
      </div>

      <div className="col" style={{ gap: 16 }}>
        <Panel title="Key dates" icon={CalendarDays}>
          <KV cols={2} items={[
            ['Planned start', fmtDate(project.plannedStart)],
            ['Planned finish', fmtDate(project.plannedEnd)],
            ['Next milestone', nextMs ? `${nextMs.name}, ${fmtDate(nextMs.dueDate)}` : 'None open'],
            ['Next work window', nextWo ? fmtDate(nextWo) : 'None booked'],
            ['Process started', process ? fmtDate(process.startedAt) : 'Not started'],
            ...(plan ? [['Plan go-live', fmtDate(plan.baseline?.targetGoLive ?? plan.targetGoLive)] as [string, string]] : []),
          ]} />
        </Panel>

        <Panel title="The project" icon={FolderKanban}>
          <KV cols={2} items={[
            ['Programme', program ? <Link to={`/delivery/programs/${program.id}`}>{program.name}</Link> : 'None'],
            ['Plan', plan ? <Link to={`/planning/plans/${plan.id}`}>{plan.plnId}</Link> : 'Not from a plan'],
            ['Template', project.template ?? '—'],
            ...(project.startGate ? [['Start gate', project.startGate] as [string, string]] : []),
            ...(project.dependsOnProjectIds?.length ? [['Depends on', `${project.dependsOnProjectIds.length} earlier phase${project.dependsOnProjectIds.length === 1 ? '' : 's'}`] as [string, string]] : []),
            ...(project.longLead ? [['Long lead', 'Procurement runs ahead of earlier phases'] as [string, string]] : []),
          ]} />
          <div style={{ marginTop: 16 }}>
            <KV cols={1} items={[['Materials', kit.lines ? (
              <span className="row wrap" style={{ gap: 8 }}>
                <ReadinessChip view={kit} />
                <span>{kit.atSite} of {kit.lines} items at site{kit.late.length ? <span style={{ color: 'var(--vw-color-red-600)' }}>, {kit.late.length} late</span> : null}</span>
                <a onClick={() => onTab('procurement')}>Procurement and materials</a>
              </span>
            ) : <span>None planned yet · <a onClick={() => onTab('procurement')}>Procurement and materials</a></span>]]} />
          </div>
        </Panel>

        <Panel title="Top risks" icon={ShieldAlert} count={chain.risks.length} actions={<PanelLink onClick={() => onTab('risks')}>All {chain.risks.length}</PanelLink>}>
          {risks.length === 0 ? <div className="vw-card-description">No risks recorded. Add them on the Risks tab.</div> : (
            <div className="col" style={{ gap: 0 }}>
              {risks.map((r, i) => (
                <div key={r.id} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
                  <div className="row between" style={{ gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-900)' }}>{r.description}</span>
                    <Chip tone={r.level === 'Critical' || r.level === 'High' ? 'error' : r.level === 'Medium' ? 'warning' : 'neutral'}>{r.level}</Chip>
                  </div>
                  <Muted size="xs">{r.category} · {r.status}{r.mitigation ? ` · ${r.mitigation}` : ''}</Muted>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
