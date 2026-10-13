/* Delivery home — /delivery. Filter bar (site, programme, project status), one summary row,
   then plain tables: what needs attention, approved plans waiting to start, change windows in
   the next 14 days, milestones, budget and spend, earned value, and recent changes and work
   orders. Reads the delivery chain only. */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Select } from 'antd';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { DcScopeSelect, useDcScope } from '../../../core/scope/DcScope';
import { PROJECT_STATUS } from '../../../mock/data/enums';
import { SCOPE_LABEL, fmtKw } from '../../planner/lib/engine';
import { DataTable, Muted, ShareBar, SummaryRow, TableCard, TwoLine } from '../components/home/kit';
import { buildHome, type AttentionRow, type MilestoneRow, type ProgrammeRow, type RecentRow, type WindowRow } from '../components/home/model';
import { useProjectRows } from '../components/home/hooks';
import { RAG_TONE, STAGE_TONE, tone } from '../components/home/tones';
import { CHG_STATUS_LABEL, CHG_STATUS_TONE, CLASS_TONE, fmtDay, fmtMoney, fmtWindow, relDays, siteNamer, woStatusLabel, woStatusTone } from '../components/workorders/model';
import type * as T from '../../../mock/data/types';

const idx = (v: number, has: boolean) => (has ? v.toFixed(2) : '—');
const idxTone = (v: number) => (v >= 1 ? 'var(--vw-color-green-700)' : v >= 0.9 ? 'var(--vw-color-amber-700)' : 'var(--vw-color-red-600)');

export default function DeliveryCommandCentre() {
  const { d, x, rows } = useProjectRows();
  const { dcId } = useDcScope();
  const [params, setParams] = useSearchParams();
  const programId = params.get('programme') ?? undefined;
  const status = params.get('status') ?? undefined;
  const setParam = (k: string, v?: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  const home = useMemo(() => buildHome(d, x, rows, { siteId: dcId, programId, status }), [d, x, rows, dcId, programId, status]);
  const site = useMemo(() => siteNamer(d), [d]);
  const s = home.summary;
  const spendPct = s.budget ? (s.spend / s.budget) * 100 : 0;

  if (!d.ready) return <VwCard loading>Loading delivery…</VwCard>;

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
        <DcScopeSelect />
        <Select allowClear placeholder="All programmes" value={programId} onChange={v => setParam('programme', v)} style={{ minWidth: 240 }} showSearch optionFilterProp="label" aria-label="Programme"
          options={d.programs.map(p => ({ value: p.id, label: p.name }))} />
        <Select allowClear placeholder="Any project status" value={status} onChange={v => setParam('status', v)} style={{ minWidth: 180 }} aria-label="Project status"
          options={PROJECT_STATUS.map(v => ({ value: v, label: v }))} />
        {(programId || status) && <button type="button" className="nst-btn nst-btn--ghost nst-btn--sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</button>}
      </div>

      <SummaryRow items={[
        { label: 'Active programmes', value: s.activeProgrammes, sub: `of ${s.programmes} programmes`, to: '/delivery/programs' },
        { label: 'Projects at risk', value: s.atRisk, sub: `of ${s.activeProjects} open projects`, tone: s.atRisk ? 'bad' : undefined, to: '/delivery/projects' },
        { label: 'Blocked gates', value: s.blocked, sub: 'blocked or stopped', tone: s.blocked ? 'bad' : undefined },
        { label: 'Changes, next 14 days', value: s.changes14, sub: s.changes14NotApproved ? `${s.changes14NotApproved} not approved yet` : 'all approved', tone: s.changes14NotApproved ? 'warn' : undefined },
        { label: 'Open work orders', value: s.openWorkOrders, sub: s.overdueWorkOrders ? `${s.overdueWorkOrders} overdue` : 'none overdue', tone: s.overdueWorkOrders ? 'warn' : undefined, to: '/delivery/work-orders' },
        { label: 'Spend against budget', value: `${Math.round(spendPct)}%`, sub: `${fmtMoney(s.spend)} of ${fmtMoney(s.budget)}`, tone: spendPct > 100 ? 'bad' : undefined },
      ]} />

      <TableCard title="Needs attention" extra={<VwChip variant={home.attention.length ? 'warning' : 'success'}>{home.attention.length} project{home.attention.length === 1 ? '' : 's'}</VwChip>}>
        <DataTable<AttentionRow> rows={home.attention} rowKey={a => a.row.project.id} to={a => `/delivery/projects/${a.row.project.id}`} limit={8}
          empty="Nothing needs attention: no red, blocked or stopped projects and nothing overdue."
          cols={[
            { key: 'p', title: 'Project', wrap: true, minWidth: 220, render: a => <TwoLine main={a.row.project.name} sub={a.row.program?.name} /> },
            { key: 'st', title: 'Stage', width: 120, render: a => <VwChip variant={tone(STAGE_TONE, a.row.stage)}>{a.row.stage}</VwChip> },
            { key: 'rag', title: 'RAG', width: 90, render: a => <VwChip variant={tone(RAG_TONE, a.row.project.rag)}>{a.row.project.rag}</VwChip> },
            { key: 'w', title: 'Why', wrap: true, minWidth: 260, render: a => a.reasons.join(' · ') },
          ]} />
      </TableCard>

      <TableCard title="Approved plans waiting to start" extra={<Muted>{home.waitingPlans.length} plan{home.waitingPlans.length === 1 ? '' : 's'}</Muted>}
        note="Plans approved in the planner whose build has not been started. Start the build from the plan page; it creates the programme or project, the orders and the first work.">
        <DataTable<T.PlannerPlan> rows={home.waitingPlans} rowKey={p => p.id} to={p => `/planning/plans/${p.id}`}
          empty="No approved plan is waiting. Plans appear here once they are approved in the planner."
          cols={[
            { key: 'p', title: 'Plan', wrap: true, minWidth: 220, render: p => <TwoLine main={<Link to={`/planning/plans/${p.id}`}>{p.title}</Link>} sub={p.plnId} /> },
            { key: 'sc', title: 'Scope', render: p => SCOPE_LABEL[p.scope] ?? p.scope },
            { key: 'site', title: 'Site', wrap: true, render: p => (p.dataCenterId ? site(p.dataCenterId) : p.newSiteName ?? '—') },
            { key: 'kw', title: 'Design power', align: 'right', render: p => (p.designPowerKw ? fmtKw(p.designPowerKw) : '—') },
            { key: 'ap', title: 'Approved', render: p => { const at = p.approvals.map(a => a.at ?? '').sort().pop(); return at ? fmtDay(at) : '—'; } },
            { key: 'gl', title: 'Target go-live', render: p => fmtDay(p.targetGoLive) },
            { key: 'o', title: 'Owner', render: p => p.ownerName },
            { key: 'x', title: 'Note', wrap: true, render: p => (p.artefacts?.executionId ? 'Build stopped part-way; resume it' : p.conditions?.some(c => c.status === 'Open' && c.blocksExecution) ? 'Open approval condition blocks the build' : 'Ready to start') },
          ]} />
      </TableCard>

      <TableCard title="Upcoming change windows" extra={<Muted>next 14 days</Muted>}
        note="Every change to the estate goes through a change request, one per work order. Normal changes go to the weekly change board; standard changes are pre-approved.">
        <DataTable<WindowRow> rows={home.windows} rowKey={w => w.change.id} to={w => `/changes/${w.change.id}`} limit={10}
          empty="No change windows in the next 14 days."
          cols={[
            { key: 'w', title: 'Window', render: w => <TwoLine main={fmtWindow(w.start, w.end)} sub={relDays(w.start)} /> },
            { key: 'c', title: 'Change', wrap: true, minWidth: 240, render: w => <TwoLine main={<Link to={`/changes/${w.change.id}`}>{w.change.chgId ?? w.change.id}</Link>} sub={w.change.title} /> },
            { key: 'cl', title: 'Class', render: w => { const c = w.change.changeClass ?? (w.change.standardTemplateId ? 'Standard' : 'Normal'); return <VwChip variant={CLASS_TONE[c]}>{c}</VwChip>; } },
            { key: 's', title: 'Status', render: w => <VwChip variant={CHG_STATUS_TONE[w.change.status]}>{CHG_STATUS_LABEL[w.change.status]}</VwChip> },
            { key: 'wo', title: 'Work order', render: w => (w.wo ? <Link to={`/delivery/work-orders/${w.wo.wo.id}`}>{w.wo.wo.woId ?? w.wo.wo.id}</Link> : <Muted>none</Muted>) },
            { key: 'site', title: 'Site', render: w => site(w.siteId) },
            { key: 'pr', title: 'Project', wrap: true, render: w => (w.project ? <Link to={`/delivery/projects/${w.project.id}`}>{w.project.name}</Link> : <Muted>not in a project</Muted>) },
          ]} />
      </TableCard>

      <TableCard title="Milestones due and overdue" extra={<Muted>{home.milestones.filter(m => m.overdue).length} overdue · {home.milestones.filter(m => !m.overdue).length} due in 14 days</Muted>}>
        <DataTable<MilestoneRow> rows={home.milestones} rowKey={m => m.milestone.id} to={m => `/delivery/projects/${m.milestone.projectId}`} limit={10}
          empty="No milestone is overdue or due in the next 14 days."
          cols={[
            { key: 'm', title: 'Milestone', wrap: true, minWidth: 200, render: m => m.milestone.name },
            { key: 'p', title: 'Project', wrap: true, minWidth: 200, render: m => <TwoLine main={m.project?.name ?? m.milestone.projectId} sub={m.program?.name} /> },
            { key: 'd', title: 'Due', render: m => fmtDay(m.milestone.dueDate) },
            { key: 'r', title: 'When', render: m => <VwChip variant={m.overdue ? 'error' : 'neutral'}>{m.overdue ? `Overdue, ${relDays(m.milestone.dueDate).replace(' ago', '')}` : `Due ${relDays(m.milestone.dueDate)}`}</VwChip> },
            { key: 's', title: 'Status', render: m => m.milestone.status },
          ]} />
      </TableCard>

      <TableCard title="Budget and spend by programme"
        note="Budget is the sum of the project budgets, including approved change orders. The bar shows spend against budget; the line marks how much of the work is done. Cost variance is the budgeted value of the work done minus the spend: negative means over cost.">
        <DataTable<ProgrammeRow> rows={home.programmes} rowKey={p => p.program.id} to={p => `/delivery/programs/${p.program.id}`}
          empty="No programme matches the filters."
          cols={[
            { key: 'n', title: 'Programme', wrap: true, minWidth: 220, render: p => <TwoLine main={p.program.name} sub={`${p.projects.length} project${p.projects.length === 1 ? '' : 's'}`} /> },
            { key: 'b', title: 'Budget', align: 'right', render: p => fmtMoney(p.ev.bac) },
            { key: 's', title: 'Spent', align: 'right', render: p => fmtMoney(p.ev.ac) },
            { key: 'bar', title: 'Spent of budget', width: 240, render: p => { const pct = p.ev.bac ? (p.ev.ac / p.ev.bac) * 100 : 0; return <ShareBar pct={pct} marker={p.completion} tone={pct > 100 ? 'bad' : pct > p.completion + 10 ? 'warn' : undefined} />; } },
            { key: 'cv', title: 'Cost variance', align: 'right', render: p => <span style={{ color: p.ev.cv < 0 ? 'var(--vw-color-red-600)' : 'var(--vw-color-slate-900)', fontVariantNumeric: 'tabular-nums' }}>{p.ev.bac ? fmtMoney(p.ev.cv) : '—'}</span> },
          ]} />
      </TableCard>

      <TableCard title="Earned value by programme"
        note="SPI is the work done against the work planned to date; CPI is the value of the work done against its cost. Below 1 means behind schedule or over cost. The forecast assumes the current cost performance continues.">
        <DataTable<ProgrammeRow> rows={home.programmes.filter(p => p.ev.bac > 0)} rowKey={p => p.program.id} to={p => `/delivery/programs/${p.program.id}`}
          empty="No programme with a budget matches the filters."
          cols={[
            { key: 'n', title: 'Programme', wrap: true, minWidth: 220, render: p => p.program.name },
            { key: 'bac', title: 'Budget', align: 'right', render: p => fmtMoney(p.ev.bac) },
            { key: 'ev', title: 'Earned value', align: 'right', render: p => fmtMoney(p.ev.ev) },
            { key: 'spi', title: 'SPI', align: 'right', render: p => <span style={{ color: idxTone(p.ev.spi), fontVariantNumeric: 'tabular-nums' }}>{idx(p.ev.spi, p.ev.pv > 0)}</span> },
            { key: 'cpi', title: 'CPI', align: 'right', render: p => <span style={{ color: idxTone(p.ev.cpi), fontVariantNumeric: 'tabular-nums' }}>{idx(p.ev.cpi, p.ev.ac > 0)}</span> },
            { key: 'eac', title: 'Forecast at completion (EAC)', align: 'right', render: p => fmtMoney(p.ev.eac) },
            { key: 'vac', title: 'Variance at completion (VAC)', align: 'right', render: p => <span style={{ color: p.ev.vac < 0 ? 'var(--vw-color-red-600)' : 'var(--vw-color-slate-900)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(p.ev.vac)}</span> },
          ]} />
      </TableCard>

      <TableCard title="Recent changes and work orders" extra={<Link to="/delivery/work-orders">All work orders</Link>}>
        <DataTable<RecentRow> rows={home.recent} rowKey={r => `${r.kind}-${r.id}`} to={r => r.to}
          empty="No recent changes or work orders."
          cols={[
            { key: 'at', title: 'Updated', render: r => fmtDay(r.at) },
            { key: 'k', title: 'Record', render: r => <TwoLine main={r.id} sub={r.kind} /> },
            { key: 't', title: 'Title', wrap: true, minWidth: 260, render: r => r.title },
            { key: 's', title: 'Status', render: r => (r.kind === 'Change'
              ? <VwChip variant={CHG_STATUS_TONE[r.status as T.ChangeRequest['status']] ?? 'neutral'}>{CHG_STATUS_LABEL[r.status as T.ChangeRequest['status']] ?? r.status}</VwChip>
              : <VwChip variant={woStatusTone(r.status)}>{woStatusLabel(r.status)}</VwChip>) },
            { key: 'b', title: 'By', render: r => r.by ?? '—' },
          ]} />
      </TableCard>

      {home.projects.length === 0 && <div className="vw-card-description">No project matches the filters. Clear the filters or choose another site.</div>}
    </div>
  );
}
