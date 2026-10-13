/* Programme overview: the phase roadmap (projects in blueprint order with their dependencies and
   start gates), budget by project, the plan's baseline against today, and the top risks. */
import { useNavigate, Link } from 'react-router-dom';
import type * as T from '../../../../mock/data/types';
import { CalendarRange, DoorOpen, FolderKanban, Scale, ShieldAlert, Wallet } from 'lucide-react';
import { Chip, KV, Panel } from '../../../../ops/ui/kit';
import { Gantt, type GanttRow, type GanttTone } from '../Gantt';
import { DataTable, Muted, Bar, ToneChip } from '../project/kit';
import { daysFrom, fmtDate, money, pct, shortName } from '../project/format';
import type { ProgramChain } from '../../lib/chain';
import { permitGateMet, designGateMet } from '../../lib/permits';

export interface PhaseRow {
  p: T.Project; order: number; preds: T.Project[]; waiting: T.Project[]; budget: number; spend: number;
  gate: 'Done' | 'Ready' | 'Waiting' | 'Long lead' | 'In progress';
  permits: T.Permit[]; designDocs: T.DesignDocument[];
}
const GATE_TONE = { Done: 'success', Ready: 'info', Waiting: 'warning', 'Long lead': 'purple', 'In progress': 'info' } as const;
const LEVEL_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const toneOf = (r: PhaseRow): GanttTone => r.gate === 'Done' ? 'done' : r.gate === 'Waiting' ? 'blocked' : daysFrom(r.p.plannedEnd) < 0 ? 'late' : r.p.percentComplete > 0 ? 'active' : 'todo';

export function ProgramOverviewTab({ chain, phases, budget, spend }: { chain: ProgramChain; phases: PhaseRow[]; budget: number; spend: number }) {
  const navigate = useNavigate();
  const { plan } = chain;
  // The roadmap shows the blueprint's phases; projects added outside the sequence are listed under it.
  const sequenced = phases.some((r) => r.p.phase != null) ? phases.filter((r) => r.p.phase != null) : phases;
  const outside = phases.filter((r) => !sequenced.includes(r));
  const rows: GanttRow[] = sequenced.map((r) => ({
    id: r.p.id, label: `${r.order}. ${shortName(r.p.name, chain.program.name)}`,
    sub: r.p.startGate ? `Gate: ${r.p.startGate}` : r.p.template,
    start: r.p.plannedStart, end: r.p.plannedEnd, tone: toneOf(r), progress: r.p.percentComplete,
    dependsOn: r.p.dependsOnProjectIds, onClick: () => navigate(`/delivery/projects/${r.p.id}`),
    tooltip: `${r.p.name}: ${fmtDate(r.p.plannedStart)} to ${fmtDate(r.p.plannedEnd)}, ${r.p.percentComplete}% complete`,
  }));
  const risks = [...chain.risks].sort((a, b) => Number(b.status === 'Open') - Number(a.status === 'Open') || (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9)).slice(0, 5);
  const lastEnd = chain.projects.map((p) => p.plannedEnd).sort().pop();
  const done = chain.projects.filter((p) => p.status === 'Completed' || p.percentComplete >= 100).length;

  return (
    <div className="col" style={{ gap: 16 }}>
      <Panel title="Phase roadmap" icon={CalendarRange} sub={`${sequenced.length} projects in build order. Arrows show what each phase waits for. Click a bar to open the project.`}>
        <Gantt rows={rows} labelWidth={280} empty="This programme has no projects yet. Projects are created from the blueprint when the plan's build starts, or added with New project on the Projects page." />
        {rows.length > 0 && <div className="vw-flex vw-gap-lg vw-wrap" style={{ marginTop: 'var(--vw-space-sm)', fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-600)' }}>
          {outside.length > 0 && <span>Also in this programme, outside the build sequence: {outside.map((r, i) => <span key={r.p.id}>{i ? ', ' : ''}<Link to={`/delivery/projects/${r.p.id}`}>{shortName(r.p.name, chain.program.name)}</Link></span>)}.</span>}
          <span>The darker part of a bar is the share complete.</span>
          <span style={{ color: 'var(--vw-color-green-700)' }}>Done</span><span style={{ color: 'var(--vw-color-blue-700)' }}>In progress</span><span style={{ color: 'var(--vw-color-amber-700)' }}>Waiting on an earlier phase</span><span style={{ color: 'var(--vw-color-red-600)' }}>Past its planned finish</span><span>Not started</span>
        </div>}
      </Panel>

      <div className="grid g-main-side" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 16, minWidth: 0 }}>
          <Panel title="Start gates" icon={DoorOpen} sub="A phase starts when the phases it depends on are complete and its gate has cleared">
            <DataTable rows={phases} rowKey={(r) => r.p.id} empty="No phases."
              cols={[
                { key: 'n', title: 'Phase', wrap: true, render: (r) => <Link to={`/delivery/projects/${r.p.id}`}>{r.order}. {shortName(r.p.name, chain.program.name)}</Link> },
                { key: 'g', title: 'Start gate', wrap: true, render: (r) => r.p.startGate ?? <Muted>—</Muted> },
                { key: 'w', title: 'Waits on', wrap: true, render: (r) => r.waiting.length ? r.waiting.map((w) => shortName(w.name, chain.program.name)).join(', ') : r.preds.length ? <Muted>earlier phases complete</Muted> : <Muted>nothing</Muted> },
                { key: 'pm', title: 'Permits', render: (r) => r.permits.length ? (permitGateMet(r.permits) ? `${r.permits.length} approved` : `${r.permits.filter((x) => x.status === 'Approved').length} of ${r.permits.length}`) : <Muted>—</Muted> },
                { key: 'd', title: 'Design', render: (r) => r.designDocs.length ? (designGateMet(r.designDocs) ? 'Issued' : 'In progress') : <Muted>—</Muted> },
                { key: 's', title: 'State', render: (r) => <ToneChip v={GATE_TONE[r.gate]}>{r.gate === 'Long lead' ? 'Long lead, procuring' : r.gate}</ToneChip> },
              ]} />
          </Panel>

          <Panel title="Budget by project" icon={Wallet} sub={`${money(spend)} spent of ${money(budget)}`}>
            <DataTable rows={phases} rowKey={(r) => r.p.id} empty="No projects."
              cols={[
                { key: 'n', title: 'Project', wrap: true, render: (r) => <Link to={`/delivery/projects/${r.p.id}`}>{shortName(r.p.name, chain.program.name)}</Link> },
                { key: 'b', title: 'Budget', align: 'right', render: (r) => money(r.budget) },
                { key: 's', title: 'Spent', align: 'right', render: (r) => <span style={{ color: r.spend > r.budget ? 'var(--vw-color-red-600)' : undefined }}>{money(r.spend)}</span> },
                { key: 'bar', title: '', render: (r) => <Bar value={r.spend} max={r.budget} over={r.spend > r.budget} /> },
                { key: 'p', title: 'Used', align: 'right', render: (r) => (r.budget ? pct((r.spend / r.budget) * 100) : '—') },
                { key: 'c', title: 'Complete', align: 'right', render: (r) => pct(r.p.percentComplete) },
              ]} />
          </Panel>

          <Panel title="Plan against today" icon={Scale} actions={plan ? <Link className="panel-link" to={`/planning/plans/${plan.id}`}>{plan.plnId}</Link> : undefined}>
            {!plan ? <div className="vw-card-description">This programme was not created from a plan, so there is no approved baseline to compare with.</div> : (
              <DataTable rows={[
                { k: 'Capital cost', base: money(plan.baseline?.capexTotal), cur: money(budget), act: money(spend) },
                { k: 'Go-live', base: fmtDate(plan.baseline?.targetGoLive), cur: fmtDate(lastEnd), act: plan.closeout ? fmtDate(plan.closeout.completedAt) : '—' },
                { k: 'IT capacity', base: plan.baseline ? `${Math.round(plan.baseline.designPowerKw)} kW` : '—', cur: `${Math.round(plan.designPowerKw)} kW`, act: plan.closeout ? `${Math.round(plan.closeout.deliveredKw)} kW` : '—' },
                { k: 'Phases', base: plan.baseline ? String(plan.baseline.phases.length) : '—', cur: `${chain.projects.length} projects`, act: `${done} done` },
              ]} rowKey={(r) => r.k}
                cols={[
                  { key: 'k', title: '', render: (r) => <Muted>{r.k}</Muted> },
                  { key: 'b', title: 'Baseline', align: 'right', render: (r) => r.base },
                  { key: 'c', title: 'Current', align: 'right', render: (r) => r.cur },
                  { key: 'a', title: 'Actual', align: 'right', render: (r) => r.act },
                ]} />
            )}
            {plan && !plan.baseline && <div style={{ marginTop: 6 }}><Muted size="xs">The plan has no frozen baseline yet; it is set when the build starts.</Muted></div>}
          </Panel>

        </div>

        <div className="col" style={{ gap: 16, minWidth: 0 }}>
          <Panel title="Programme" icon={FolderKanban}>
            <KV cols={1} items={[
              ['Objective', chain.program.objective || '—'],
              ['Projects done', `${done} of ${chain.projects.length}`],
              ['Last planned finish', fmtDate(lastEnd)],
            ]} />
          </Panel>

          <Panel title="Top risks" icon={ShieldAlert} sub={`${chain.risks.filter((r) => r.status === 'Open').length} open`}>
            {risks.length === 0 ? <div className="vw-card-description">No risks recorded on the projects of this programme.</div> : (
              <div className="col" style={{ gap: 0 }}>
                {risks.map((r, i) => (
                  <div key={r.id} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
                    <div className="row between" style={{ gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-900)' }}>{r.description}</span>
                      <Chip tone={r.level === 'Critical' || r.level === 'High' ? 'error' : r.level === 'Medium' ? 'warning' : 'neutral'}>{r.level}</Chip>
                    </div>
                    <Muted size="xs">{shortName(chain.projects.find((p) => p.id === r.projectId)?.name ?? '—', chain.program.name)} · {r.status}</Muted>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
