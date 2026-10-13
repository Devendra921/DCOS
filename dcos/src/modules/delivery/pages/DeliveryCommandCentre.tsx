/* Delivery overview — /delivery. Approved plans waiting to start sit in a panel on top; then six
   tiles with 12-week trends and, in pairs, work and change (throughput, change outcomes), the
   next 14 days, the portfolio (health matrix, needs attention) and money and schedule (cost curve,
   programme progress). Below, the detail tables in one switchable panel. Everything reads the
   delivery chain only. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, CalendarDays, CircleDollarSign, ClipboardCheck, GitPullRequest, Grid3x3, ListTree, Rocket, TriangleAlert, Truck } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, Panel, PanelLink, Seg } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { QuickSelect } from '../../../ops/ui/ListToolbar';
import { Legend } from '../../../ops/ui/status';
import { MiniBars, Split, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { Sparkline } from '../../../ops/charts/Sparkline';
import { TimeChart } from '../../../ops/charts/TimeChart';
import { buildPortfolioEvCurve, computePortfolioEarnedValue } from '../lib/cost';
import { changeClassOf } from '../lib/chain';
import { AttentionList, DayStrip, HealthMatrix, ProgrammeProgress, type CurvePoint } from '../components/overview/charts';
import { changeOutcomes, healthMatrix, lastVsPrev, lastWeeks, medianLeadDays, milestoneDelivery, nextDays, programmeBars, rateOver, workFlow } from '../components/overview/trends';
import { useVwPalette } from '../../site360/lib/siteModel';
import { DcScopeSelect, useDcScope } from '../../../core/scope/DcScope';
import { PROJECT_STATUS } from '../../../mock/data/enums';
import { buildHome, kitIndex, type MilestoneRow, type RecentRow, type WindowRow } from '../components/home/model';
import { useProjectRows } from '../components/home/hooks';
import { opsTone } from '../components/home/tones';
import { CHG_STATUS_LABEL, CHG_STATUS_TONE, CLASS_TONE, fmtDay, fmtMoney, fmtWindow, relDays, siteNamer, woStatusLabel, woStatusTone } from '../components/workorders/model';
import type * as T from '../../../mock/data/types';

const stop = (e: React.MouseEvent) => e.stopPropagation();
const spark = (vs: (number | null)[]) => vs.map(v => v ?? Number.NaN);
type Detail = 'windows' | 'milestones' | 'recent';

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
  const pal = useVwPalette();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Detail>('windows');

  // Trends: the same filters as the rest of the page.
  const [now] = useState(() => Date.now());
  const t = useMemo(() => {
    const pids = new Set(home.projects.map(r => r.project.id));
    const scoped = !!(dcId !== 'all' || programId || status);
    const changes = d.changeRequests.filter(c => (dcId === 'all' || c.dataCenterId === dcId) && (!programId || c.programId === programId) && (!status || !c.projectId || pids.has(c.projectId)));
    const wos = home.workOrders.map(r => r.wo);
    const milestones = d.milestones.filter(m => !scoped || pids.has(m.projectId));
    const weeks = lastWeeks(12, now);
    const flow = workFlow(wos, weeks, now);
    const outcomes = changeOutcomes(changes, weeks);
    const msWeeks = milestoneDelivery(milestones, weeks, now);
    const projects = home.projects.map(r => r.project);
    const ev = computePortfolioEarnedValue(projects, x.boms, d.purchaseOrders, x.changeOrders, now);
    const raw = buildPortfolioEvCurve(projects, x.boms, d.purchaseOrders, x.changeOrders, now);
    const byMonth = new Map<string, CurvePoint>();
    for (const r of raw) { const pt = byMonth.get(r.month) ?? { month: r.month, pv: 0 }; if (r.series === 'PV') pt.pv = r.value; if (r.series === 'EV') pt.ev = r.value; if (r.series === 'AC') pt.ac = r.value; byMonth.set(r.month, pt); }
    // Trim the flat tails (before any plan or spend, after the plan is spent) so one long-dated
    // project does not squeeze the curve into a corner.
    const all = [...byMonth.values()], top = Math.max(1, ...all.map(c => c.pv));
    const first = Math.max(0, all.findIndex(c => c.pv >= top * 0.005 || (c.ac ?? 0) > 0) - 1);
    const lastActual = all.map(c => c.ac !== undefined).lastIndexOf(true);
    const planDone = all.findIndex(c => c.pv >= top * 0.98);
    const last = Math.min(all.length - 1, lastActual + 24, Math.max(lastActual + 3, planDone < 0 ? all.length - 1 : planDone + 1));
    const curve = all.slice(first, last + 1);
    const cpiSeries = curve.filter(c => c.ac).slice(-12).map(c => (c.ac ? (c.ev ?? 0) / c.ac : null));
    const open = home.projects.filter(r => r.project.status !== 'Completed');
    const recentImplemented = changes.filter(c => c.implementedAt && new Date(c.implementedAt).getTime() > now - 28 * 864e5);
    return {
      flow, outcomes, msWeeks, ev, curve, cpiSeries, open,
      completed: lastVsPrev(flow.map(f => f.completed), 4),
      success: rateOver(outcomes, 4, w => w.total - w.failed, w => w.total), successPrev: rateOver(outcomes.slice(0, -4), 4, w => w.total - w.failed, w => w.total),
      implemented4: outcomes.slice(-4).reduce((a, w) => a + w.total, 0),
      leadDays: medianLeadDays(recentImplemented.filter(c => changeClassOf(c) === 'Normal')),
      msPct: rateOver(msWeeks, 12, w => w.onTime, w => w.due), msDue: msWeeks.reduce((a, w) => a + w.due, 0), msMet: msWeeks.reduce((a, w) => a + w.onTime, 0),
      backlog4ago: flow[flow.length - 5]?.backlog ?? 0,
      matrix: healthMatrix(open), bars: programmeBars(home.programmes, now),
      days: nextDays(d, changes, milestones.filter(m => m.status !== 'Completed'), 14, now, kitIndex(x.materialLines, now).change),
      attRed: home.attention.filter(a => a.row.project.rag === 'Red').length, attAmber: home.attention.filter(a => a.row.project.rag === 'Amber').length,
    };
  }, [d, x, home, dcId, programId, status, now]);
  const delta = (pct: number | null, goodWhenUp: boolean, unit = '%') => (pct === null || !Number.isFinite(pct) ? undefined : { text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(pct))}${unit}`, tone: (Math.abs(pct) < 1 ? 'neutral' : (pct > 0) === goodWhenUp ? 'good' : 'bad') as 'good' | 'bad' | 'neutral' });
  const withDelta = (dl: ReturnType<typeof delta>, sub: string) => (dl ? `${dl.text} · ${sub}` : sub);
  const day14 = t.days.reduce((a, x) => a + x.standard + x.normal + x.emergency, 0);
  const ms14 = t.days.reduce((a, x) => a + x.milestones.length, 0);

  const filters = (
    <>
      <DcScopeSelect />
      <QuickSelect f={{ id: 'programme', label: 'Programme', value: programId ?? '', anyLabel: 'All programmes', onChange: v => setParam('programme', v || undefined), options: d.programs.map(p => ({ id: p.id, label: p.name })) }} />
      <QuickSelect f={{ id: 'status', label: 'Project status', value: status ?? '', anyLabel: 'Any project status', onChange: v => setParam('status', v || undefined), options: PROJECT_STATUS.map(v => ({ id: v, label: v })) }} />
      {(programId || status) && <Btn variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</Btn>}
    </>
  );
  const page = (body: React.ReactNode) => (
    <OpsPage title="Delivery overview" description="Work, change, portfolio health and money across the delivery chain." actions={filters}>{body}</OpsPage>
  );

  if (!d.ready) return page(<section className="vw-card-section"><Empty icon={Truck} title="Loading delivery">Reading the delivery chain…</Empty></section>);

  const dCompleted = delta(t.completed.deltaPct, true);
  const dOpen = t.backlog4ago ? delta(((s.openWorkOrders - t.backlog4ago) / t.backlog4ago) * 100, false) : undefined;
  const dSuccess = t.success !== null && t.successPrev !== null ? delta(t.success - t.successPrev, true, ' pts') : undefined;
  const other = home.attention.length - t.attRed - t.attAmber;

  const windowCols: Col<WindowRow & { id: string }>[] = [
    { key: 'w', header: 'Window', render: w => <span className="cell-2"><span className="vw-card-activity-label">{fmtWindow(w.start, w.end)}</span><small>{relDays(w.start)}</small></span> },
    { key: 'c', header: 'Change', wrap: true, render: w => <span className="cell-2"><Link to={`/changes/${w.change.id}`} onClick={stop}>{w.change.chgId ?? w.change.id}</Link><small>{w.change.title}</small></span> },
    { key: 'cl', header: 'Class', render: w => { const c = w.change.changeClass ?? (w.change.standardTemplateId ? 'Standard' : 'Normal'); return <Chip tone={opsTone(CLASS_TONE[c])}>{c}</Chip>; } },
    { key: 's', header: 'Status', render: w => <Chip tone={opsTone(CHG_STATUS_TONE[w.change.status])} dot>{CHG_STATUS_LABEL[w.change.status]}</Chip> },
    { key: 'wo', header: 'Work order', render: w => (w.wo ? <Link to={`/delivery/work-orders/${w.wo.wo.id}`} onClick={stop}>{w.wo.wo.woId ?? w.wo.wo.id}</Link> : <span className="vw-label">none</span>) },
    { key: 'site', header: 'Site and project', wrap: true, render: w => <span className="cell-2"><span>{site(w.siteId)}</span><small>{w.project ? <Link to={`/delivery/projects/${w.project.id}`} onClick={stop}>{w.project.name}</Link> : 'not in a project'}</small></span> },
  ];
  const milestoneCols: Col<MilestoneRow & { id: string }>[] = [
    { key: 'm', header: 'Milestone', wrap: true, render: m => <span className="vw-card-activity-label">{m.milestone.name}</span> },
    { key: 'p', header: 'Project', wrap: true, render: m => <span className="cell-2"><span>{m.project?.name ?? m.milestone.projectId}</span>{m.program && <small>{m.program.name}</small>}</span> },
    { key: 'd', header: 'Due', render: m => <span className="num">{fmtDay(m.milestone.dueDate)}</span> },
    { key: 'r', header: 'When', render: m => <Chip tone={m.overdue ? 'error' : 'neutral'} dot={m.overdue}>{m.overdue ? `Overdue, ${relDays(m.milestone.dueDate).replace(' ago', '')}` : `Due ${relDays(m.milestone.dueDate)}`}</Chip> },
    { key: 's', header: 'Status', render: m => m.milestone.status },
  ];
  const recentCols: Col<RecentRow & { rid: string; id: string }>[] = [
    { key: 'at', header: 'Updated', render: r => <span className="num">{fmtDay(r.at)}</span> },
    { key: 'k', header: 'Record', render: r => <span className="cell-2"><span className="vw-card-activity-label">{r.rid}</span><small>{r.kind}</small></span> },
    { key: 't', header: 'Title', wrap: true, render: r => r.title },
    { key: 's', header: 'Status', render: r => (r.kind === 'Change'
      ? <Chip tone={opsTone(CHG_STATUS_TONE[r.status as T.ChangeRequest['status']] ?? 'neutral')} dot>{CHG_STATUS_LABEL[r.status as T.ChangeRequest['status']] ?? r.status}</Chip>
      : <Chip tone={opsTone(woStatusTone(r.status))} dot>{woStatusLabel(r.status)}</Chip>) },
    { key: 'b', header: 'By', render: r => r.by ?? '—' },
  ];

  return page(<>
    {home.waitingPlans.length > 0 && (
      <Panel title="Approved, build not started" sub="Plans approved in the planner whose build has not started yet" icon={Rocket} count={home.waitingPlans.length}>
        <div className="col">
          {home.waitingPlans.map(p => (
            <div key={p.id} className="row between">
              <span className="cell-2"><span className="vw-card-activity-label">{p.title}</span><small>go-live {fmtDay(p.targetGoLive)} · {p.ownerName}</small></span>
              <PanelLink onClick={() => navigate(`/planning/plans/${p.id}`)}>Open plan</PanelLink>
            </div>
          ))}
        </div>
      </Panel>
    )}

    <StatGrid>
      <StatTile label="Work orders completed" value={t.completed.last} sub={withDelta(dCompleted, 'in 4 weeks, vs the 4 before')} subTone={dCompleted?.tone === 'bad' ? 'bad' : undefined} onClick={() => navigate('/delivery/work-orders?status=Completed')}>
        <MiniBars values={t.flow.map(f => f.completed)} labels={t.flow.map(f => f.label)} hot={t.flow.length - 1} />
      </StatTile>
      <StatTile label="Open work orders" value={s.openWorkOrders} sub={withDelta(dOpen, `vs 4 weeks ago · ${s.overdueWorkOrders ? `${s.overdueWorkOrders} overdue` : 'none overdue'}`)} subTone={dOpen?.tone === 'bad' ? 'bad' : undefined} onClick={() => navigate('/delivery/work-orders')}>
        <Sparkline values={spark(t.flow.map(f => f.backlog))} height={34} />
      </StatTile>
      <StatTile label="Change success rate" value={t.success === null ? '—' : `${Math.round(t.success)}%`} sub={withDelta(dSuccess, `vs the 4 weeks before · ${t.implemented4} changes`)} subTone={dSuccess?.tone === 'bad' ? 'bad' : undefined} onClick={() => navigate('/changes')}>
        <Sparkline values={spark(t.outcomes.map(w => w.successPct))} height={34} />
      </StatTile>
      <StatTile label="Milestones met on time" value={t.msPct === null ? '—' : `${Math.round(t.msPct)}%`} sub={`${t.msMet} of ${t.msDue} due in the last 12 weeks`}>
        <Sparkline values={spark(t.msWeeks.map(w => w.pct))} height={34} />
      </StatTile>
      <StatTile label="Cost performance (CPI)" value={t.ev.ac ? t.ev.cpi.toFixed(2) : '—'} sub={`${t.ev.ac ? (t.ev.cpi >= 1 ? 'under budget · ' : 'over budget · ') : ''}forecast ${fmtMoney(t.ev.eac)} of ${fmtMoney(t.ev.bac)}`} subTone={t.ev.ac && t.ev.cpi < 1 ? 'bad' : undefined}>
        <Sparkline values={spark(t.cpiSeries)} height={34} target={1} />
      </StatTile>
      <StatTile label="Projects needing attention" value={home.attention.length} sub={`${t.attRed} red · ${t.attAmber} amber · ${other} other, of ${t.open.length} open`} subTone={t.attRed ? 'bad' : t.attAmber ? 'warn' : undefined} onClick={() => navigate('/delivery/projects')}>
        <Split legend={false} parts={[
          { key: 'red', label: 'Red', n: t.attRed, tone: 'error' }, { key: 'amber', label: 'Amber', n: t.attAmber, tone: 'warning' },
          { key: 'other', label: 'Other', n: other, tone: 'neutral' }, { key: 'fine', label: 'Not flagged', n: Math.max(0, t.open.length - home.attention.length), tone: 'success' },
        ]} />
      </StatTile>
    </StatGrid>

    <div className="grid g-2">
      <Panel title="Work throughput" sub="Work orders finished each week against work raised, last 12 weeks" icon={Activity}
        foot={<>Open at the end of this week: <b>{t.flow[t.flow.length - 1]?.backlog ?? 0}</b> · four weeks ago: <b>{t.backlog4ago}</b></>}
        actions={<PanelLink onClick={() => navigate('/delivery/work-orders')}>All work orders</PanelLink>}>
        <TimeChart height={230} labels={t.flow.map(w => w.label)} fullLabels={t.flow.map((w, i) => `Week of ${w.label}${i === t.flow.length - 1 ? ' (so far)' : ''}`)} series={[
          { key: 'completed', label: 'Completed', color: pal.blue, kind: 'bar', stack: 'wo', values: t.flow.map(w => w.completed) },
          { key: 'failed', label: 'Failed', color: pal.red, kind: 'bar', stack: 'wo', values: t.flow.map(w => w.failed) },
          { key: 'raised', label: 'Raised', color: pal.slateDark, kind: 'line', dashed: true, values: t.flow.map(w => w.raised) },
        ]} />
      </Panel>
      <Panel title="Change outcomes" sub="Changes implemented each week by class, and those that failed or were rolled back" icon={GitPullRequest}
        foot={<>Median lead time for normal changes: <b>{t.leadDays === null ? '—' : `${t.leadDays.toFixed(1)} days`}</b> · success rate over the last 4 weeks: <b>{t.success === null ? '—' : `${Math.round(t.success)}%`}</b></>}
        actions={<PanelLink onClick={() => navigate('/changes')}>All changes</PanelLink>}>
        <TimeChart height={230} labels={t.outcomes.map(w => w.label)} fullLabels={t.outcomes.map(w => `Week of ${w.label}${w.successPct === null ? '' : ` · ${Math.round(w.successPct)}% succeeded`}`)} series={[
          { key: 'standard', label: 'Standard', color: pal.emerald, kind: 'bar', stack: 'chg', values: t.outcomes.map(w => w.standard) },
          { key: 'normal', label: 'Normal', color: pal.blue, kind: 'bar', stack: 'chg', values: t.outcomes.map(w => w.normal) },
          { key: 'emergency', label: 'Emergency', color: pal.amber, kind: 'bar', stack: 'chg', values: t.outcomes.map(w => w.emergency) },
          { key: 'failed', label: 'Failed or rolled back', color: pal.red, kind: 'line', values: t.outcomes.map(w => w.failed) },
        ]} />
      </Panel>
    </div>

    <Panel title="Next 14 days" sub="Change windows per day by class; diamonds mark milestones due; shaded days are weekends or freezes" icon={CalendarDays}
      actions={<PanelLink onClick={() => navigate('/changes?tab=calendar')}>Change calendar</PanelLink>}
      foot={<>{day14} change window{day14 === 1 ? '' : 's'} and {ms14} milestone{ms14 === 1 ? '' : 's'} in the next two weeks · {s.changes14NotApproved ? <span style={{ color: 'var(--vw-color-amber-700)' }}>{s.changes14NotApproved} change{s.changes14NotApproved === 1 ? '' : 's'} not approved yet</span> : 'all approved'}{s.changes14KitShort ? <> · <span style={{ color: 'var(--vw-color-amber-700)' }}>{s.changes14KitShort} change{s.changes14KitShort === 1 ? '' : 's'} with kit not at site</span></> : null}</>}>
      <div className="col" style={{ gap: 8 }}>
        <Legend items={[{ label: 'Standard', color: pal.emerald }, { label: 'Normal', color: pal.blue }, { label: 'Emergency', color: pal.amber }, { label: 'Milestone', color: pal.violet }]} />
        <DayStrip days={t.days} />
      </div>
    </Panel>

    <div className="grid g-2">
      <Panel title="Portfolio health" sub="Open projects by delivery stage and health; select a cell to see them" icon={Grid3x3}>
        <HealthMatrix matrix={t.matrix} linkFor={(stage, rag) => `/delivery/projects?stage=${encodeURIComponent(stage)}&rag=${rag}`} />
      </Panel>
      <Panel title="Needs attention" sub="Projects that need someone now, worst first" icon={TriangleAlert} count={home.attention.length}>
        <AttentionList rows={home.attention} />
      </Panel>
    </div>

    <div className="grid g-2">
      <Panel title="Cost performance" sub="Planned value, earned value and actual cost across the projects in view" icon={CircleDollarSign}
        foot={<>Earned {fmtMoney(t.ev.ev)} for {fmtMoney(t.ev.ac)} spent · schedule index <b>{t.ev.pv ? t.ev.spi.toFixed(2) : '—'}</b> · cost index <b>{t.ev.ac ? t.ev.cpi.toFixed(2) : '—'}</b></>}>
        {t.curve.length ? (
          <TimeChart height={240} format={fmtMoney} labels={t.curve.map(c => c.month)} target={{ value: t.ev.bac, label: 'Budget' }} series={[
            { key: 'pv', label: 'Planned value', color: pal.slate, kind: 'line', dashed: true, values: t.curve.map(c => c.pv) },
            { key: 'ev', label: 'Earned value', color: pal.blue, kind: 'line', values: t.curve.map(c => c.ev ?? null) },
            { key: 'ac', label: 'Actual cost', color: pal.amber, kind: 'line', values: t.curve.map(c => c.ac ?? null) },
          ]} />
        ) : <Empty icon={CircleDollarSign} title="No cost curve">No project in view has a budget and dates.</Empty>}
      </Panel>
      <Panel title="Programme progress" sub="Work done against time elapsed and money spent; amber bars are behind schedule" icon={ListTree}
        actions={<PanelLink onClick={() => navigate('/delivery/programs')}>All programmes</PanelLink>}>
        {t.bars.length ? <ProgrammeProgress bars={t.bars} /> : <Empty icon={ListTree} title="No programmes">No programme with projects matches the filters.</Empty>}
      </Panel>
    </div>

    <Panel flush icon={ClipboardCheck}
      title={detail === 'windows' ? 'Upcoming change windows' : detail === 'milestones' ? 'Milestones due and overdue' : 'Recent changes and work orders'}
      sub={detail === 'windows' ? 'Next 14 days. Every change to the estate goes through a change request, one per work order. Normal changes go to the weekly change board; standard changes are pre-approved.'
        : detail === 'milestones' ? `${home.milestones.filter(m => m.overdue).length} overdue · ${home.milestones.filter(m => !m.overdue).length} due in 14 days` : 'Latest updates across changes and work orders'}
      actions={<>
        <Seg<Detail> size="sm" value={detail} onChange={setDetail} options={[
          { id: 'windows', label: `Change windows (${home.windows.length})` }, { id: 'milestones', label: `Milestones (${home.milestones.length})` }, { id: 'recent', label: 'Recent activity' },
        ]} />
        {detail === 'recent' && <PanelLink onClick={() => navigate('/delivery/work-orders')}>All work orders</PanelLink>}
      </>}>
      {detail === 'windows' && (
        <DataTable compact pageSize={10} rows={home.windows.map(w => ({ ...w, id: w.change.id }))} cols={windowCols} onRow={w => navigate(`/changes/${w.change.id}`)}
          empty={<Empty icon={CalendarDays} title="No change windows">No change windows in the next 14 days.</Empty>} />
      )}
      {detail === 'milestones' && (
        <DataTable compact pageSize={10} rows={home.milestones.map(m => ({ ...m, id: m.milestone.id }))} cols={milestoneCols} onRow={m => navigate(`/delivery/projects/${m.milestone.projectId}`)}
          empty={<Empty icon={CalendarDays} title="Nothing due">No milestone is overdue or due in the next 14 days.</Empty>} />
      )}
      {detail === 'recent' && (
        <DataTable compact pageSize={10} rows={home.recent.map(r => ({ ...r, rid: r.id, id: `${r.kind}-${r.id}` }))} cols={recentCols} onRow={r => navigate(r.to)}
          empty={<Empty icon={Activity} title="No recent activity">No recent changes or work orders.</Empty>} />
      )}
    </Panel>

    {home.projects.length === 0 && <Empty icon={Truck} title="No project matches the filters">Clear the filters or choose another site.</Empty>}
  </>);
}
