/* Change overview — the first tab of /changes. Six KPI tiles with 12-week trends; then, in pairs:
   volume and lead time, the open pipeline and approvals, the next 14 days and what stands in their
   way, sites and where changes fail. Below, the detail tables in one tabbed panel. Every number
   comes from `buildOverview()` (lib/overview.ts) and links to the Changes tab with the same filter. */
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart3, CalendarRange, ClipboardList, GitPullRequestArrow, Hourglass, MapPin, ShieldX, Gavel } from 'lucide-react';
import { Btn, Chip, Empty, Panel, PanelLink, Seg, Tabs } from '../../../../ops/ui/kit';
import { MiniBars, StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { BarList, type BarItem } from '../../../../ops/charts/BarList';
import { Sparkline } from '../../../../ops/charts/Sparkline';
import { TimeChart } from '../../../../ops/charts/TimeChart';
import { CHANGE_TYPE_LABEL, fmtDayShort, fmtWhen, plural, siteLabel, type ChangeRow } from '../../lib/model';
import { APPROVAL_SLA_DAYS, dateParam, FAILURE_WEEKS, type Attention, type ChangeOverview, type Closeout } from '../../lib/overview';
import { ClassChip, Muted, RiskChip, StatusChip } from '../kit';

/** Link to the Changes tab with filters. */
const chg = (q: Record<string, string | number | undefined>) => {
  const n = new URLSearchParams({ tab: 'changes' });
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') n.set(k, String(v));
  return `/changes?${n.toString()}`;
};
const pctTxt = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`);
const dTxt = (n: number | null) => (n === null ? '—' : `${n < 10 ? n.toFixed(1) : Math.round(n)} days`);
const dShort = (n: number | null) => (n === null ? '—' : `${n < 10 ? n.toFixed(1) : Math.round(n)} d`);
type DeltaTone = 'good' | 'bad' | 'neutral';
const delta = (v: number | null, goodWhenUp: boolean, unit = '%') =>
  (v === null || !Number.isFinite(v) ? undefined : { text: `${v >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(v))}${unit}`, tone: (Math.abs(v) < 1 ? 'neutral' : (v > 0) === goodWhenUp ? 'good' : 'bad') as DeltaTone });
const nanOf = (xs: (number | null)[]) => xs.map(x => (x === null ? NaN : x));

/* Class and outcome colours, one set for every chart on the page. */
const C = { standard: '#0d9488', normal: '#1C81EF', emergency: '#f59e0b', failed: '#dc2626', light: '#93c5fd', slate: '#cbd5e1' };

type Detail = 'attention' | 'closeout' | 'windows' | 'recent';

export function OverviewTab({ o, kitShort }: { o: ChangeOverview; kitShort: (c: ChangeRow['c']) => boolean }) {
  const navigate = useNavigate();
  const [failBy, setFailBy] = useState<'type' | 'template'>('type');
  const [detail, setDetail] = useState<Detail>('attention');
  const [all, setAll] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setAll(a => ({ ...a, [k]: !a[k] }));
  /** "Show all N" under a ranked list longer than its limit. */
  const more = (k: string, n: number, limit: number) => (n > limit ? <Btn size="xs" variant="ghost" onClick={() => toggle(k)}>{all[k] ? 'Show fewer' : `Show all ${n}`}</Btn> : undefined);
  const cut = <X,>(k: string, xs: X[], limit: number) => (all[k] ? xs : xs.slice(0, limit));

  const k = o.kpi;
  const from4 = dateParam(o.from4), fromFail = dateParam(o.fromFail);
  const total12 = o.outcomes.reduce((a, w) => a + w.total, 0), failed12 = o.outcomes.reduce((a, w) => a + w.failed, 0), issues12 = o.outcomes.reduce((a, w) => a + w.withIssues, 0);
  const stuck = o.stages.reduce((a, s) => a + s.stuck, 0);
  const next = o.boards[o.boards.length - 1];
  const w = o.watch;
  const sites14 = new Set(w.windows.map(r => r.site?.id ?? '')).size;
  const leadChange = k.leadDays !== null && k.leadPrev ? ((k.leadDays - k.leadPrev) / k.leadPrev) * 100 : null;
  const weekLabels = o.outcomes.map(x => x.label);

  const kpi = (d: ReturnType<typeof delta>, spark: ReactNode, extra?: ReactNode) => (
    <div className="col" style={{ gap: 6 }}>
      {spark}
      {(d || extra) && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {d && <Chip size="xs" tone={d.tone === 'good' ? 'success' : d.tone === 'bad' ? 'error' : 'neutral'}>{d.text}</Chip>}
        {extra}
      </div>}
    </div>
  );

  /* ranked lists */
  const stageItems: BarItem[] = o.stages.map(s => ({
    key: s.status, label: s.label, value: s.count, display: String(s.count), color: s.stuck ? C.emergency : C.normal,
    sublabel: s.count ? `${s.byClass.Standard} standard · ${s.byClass.Normal} normal · ${s.byClass.Emergency} emergency · median ${dShort(s.medianDays)} in stage` : 'none',
    secondary: s.stuck ? ` · ${s.stuck} stuck` : undefined, onClick: () => navigate(chg({ status: s.status })),
  }));
  const roleItems: BarItem[] = o.roles.map(r => ({
    key: r.role, label: r.label, value: r.count, display: String(r.count), secondary: ` · oldest ${r.oldestDays} d`, color: r.overdue ? C.emergency : C.normal,
    sublabel: `${r.count - r.overdue} within ${APPROVAL_SLA_DAYS} days · ${r.overdue} over ${APPROVAL_SLA_DAYS} days`, onClick: () => navigate(chg({ role: r.role })),
  }));
  const siteItems: BarItem[] = o.sites.map(g => ({
    key: g.key, label: g.label, value: g.done + g.open, display: pctTxt(g.successPct), secondary: ` · ${g.done} done · ${g.open} open`,
    color: g.successPct !== null && g.successPct < 90 ? C.failed : C.normal,
    sublabel: `${g.done - g.failed - g.withIssues} successful · ${g.withIssues} with issues · ${g.failed} failed`, onClick: () => navigate(chg({ site: g.key })),
  }));
  const typeItems: BarItem[] = o.failTypes.map(g => ({
    key: g.key, label: g.label, value: g.done, display: g.failed ? `${g.failed} of ${g.done} failed` : `none of ${g.done}`, color: g.failed ? C.failed : C.normal,
    sublabel: `${g.done - g.failed} succeeded · ${g.failed} failed or rolled back`, onClick: () => navigate(g.failed ? chg({ type: g.key, flag: 'failed', from: fromFail }) : chg({ type: g.key })),
  }));
  const templateItems: BarItem[] = o.templates.map(x => ({
    key: x.t.id, label: x.t.name, value: x.used, display: x.failed ? `${x.failed} of ${x.used} failed` : `${x.used} used`, color: x.failed ? C.failed : C.normal,
    sublabel: x.t.status === 'Suspended' ? `Suspended${x.t.lastFailureAt ? ` after a failure on ${fmtDayShort(x.t.lastFailureAt)}` : ''}` : x.reviewOverdue ? 'Yearly review overdue' : `${x.t.status} · ${x.recent} used in ${FAILURE_WEEKS} weeks`,
    onClick: () => navigate(chg({ std: x.t.id })),
  }));

  const freezeDays = w.days.filter(x => x.freeze);
  const isWeekend = (day: number) => { const g = new Date(day).getDay(); return g === 0 || g === 6; };

  /* detail tables */
  type ARow = Attention & { id: string }; type CRow = Closeout & { id: string }; type RRow = ChangeRow & { id: string };
  const changeCell = (r: ChangeRow, sub?: string) => <span className="cell-2"><Link className="ent-link mono" to={`/changes/${r.c.id}`} onClick={e => e.stopPropagation()}>{r.c.id}</Link><small>{sub ?? r.c.title}</small></span>;
  const attentionCols: Col<ARow>[] = [
    { key: 'c', header: 'Change', wrap: true, render: a => changeCell(a.row) },
    { key: 'why', header: 'Why', wrap: true, render: a => a.reasons.join(' · ') },
    { key: 'cl', header: 'Class', render: a => <ClassChip cls={a.row.cls} /> },
    { key: 's', header: 'Status', render: a => <StatusChip status={a.row.c.status} /> },
    { key: 'r', header: 'Risk', render: a => <RiskChip risk={a.row.c.risk} short /> },
    { key: 'w', header: 'Window', render: a => (a.row.start ? <span className="num">{fmtWhen(a.row.start)}</span> : <Muted>not booked</Muted>) },
    { key: 'site', header: 'Site', render: a => siteLabel(a.row.site) },
  ];
  const closeoutCols: Col<CRow>[] = [
    { key: 'c', header: 'Change', wrap: true, render: x => changeCell(x.row) },
    { key: 'why', header: 'Waiting for', render: x => <Chip tone={x.row.reviewDue ? 'warning' : 'neutral'}>{x.reason}</Chip> },
    { key: 'cl', header: 'Class', render: x => <ClassChip cls={x.row.cls} /> },
    { key: 's', header: 'Status', render: x => <StatusChip status={x.row.c.status} /> },
    { key: 'd', header: 'Implemented', align: 'right', render: x => <span className="num">{x.sinceDays === null ? '—' : x.sinceDays === 0 ? 'today' : `${x.sinceDays} d ago`}</span> },
    { key: 'site', header: 'Site', render: x => siteLabel(x.row.site) },
  ];
  const windowCols: Col<RRow>[] = [
    { key: 'w', header: 'Window', render: r => <span className="cell-2"><span className="num">{fmtWhen(r.start)}</span>{r.end && <small>to {fmtWhen(r.end)}</small>}</span> },
    { key: 'c', header: 'Change', wrap: true, render: r => changeCell(r) },
    { key: 'cl', header: 'Class', render: r => <ClassChip cls={r.cls} /> },
    { key: 's', header: 'Status', render: r => <StatusChip status={r.c.status} /> },
    { key: 'r', header: 'Risk', render: r => <RiskChip risk={r.c.risk} short /> },
    { key: 'k', header: 'Kit', render: r => (kitShort(r.c) ? <Chip tone="warning">Not at site</Chip> : <Muted>—</Muted>) },
    { key: 'f', header: 'Freeze', render: r => (r.freeze ? <Chip tone="error">{r.freeze.name}</Chip> : <Muted>—</Muted>) },
    { key: 'site', header: 'Site', render: r => siteLabel(r.site) },
  ];
  const recentCols: Col<RRow>[] = [
    { key: 'd', header: 'Implemented', render: r => <span className="num">{fmtWhen(r.c.implementedAt ?? r.c.closedAt)}</span> },
    { key: 'c', header: 'Change', wrap: true, render: r => changeCell(r, `${r.c.title} · ${CHANGE_TYPE_LABEL[r.c.type] ?? r.c.type}`) },
    { key: 'cl', header: 'Class', render: r => <ClassChip cls={r.cls} /> },
    { key: 'o', header: 'Outcome', render: r => <Outcome row={r} /> },
    { key: 'site', header: 'Site', render: r => siteLabel(r.site) },
  ];
  const withId = <R extends { row: ChangeRow }>(xs: R[]) => xs.map(x => ({ ...x, id: x.row.c.id }));
  const rowsWithId = (xs: ChangeRow[]) => xs.map(r => ({ ...r, id: r.c.id }));
  const detailPanel = {
    attention: { title: 'Open changes that need someone', icon: AlertTriangle, link: chg({ flag: 'attention' }), linkLabel: 'Open in Changes', n: o.attention.length,
      sub: 'Stuck in their stage, in a freeze, clashing with another window, kit not at site, materials short, high risk within 7 days, or carrying policy warnings. Worst first.',
      body: <DataTable<ARow> rows={withId(o.attention)} cols={attentionCols} onRow={a => navigate(`/changes/${a.row.c.id}`)} pageSize={10} empty={<Empty icon={AlertTriangle} title="No open change needs attention" />} /> },
    closeout: { title: 'Waiting for review or closure', icon: ClipboardList, link: chg({ flag: 'closeout' }), linkLabel: 'Open in Changes', n: o.closeouts.length,
      sub: 'A review is mandatory after every emergency and every failed change; implemented changes are closed once the work order is signed off.',
      body: <DataTable<CRow> rows={withId(o.closeouts)} cols={closeoutCols} onRow={x => navigate(`/changes/${x.row.c.id}?tab=review`)} pageSize={10} empty={<Empty icon={ClipboardList} title="Every implemented change is reviewed and closed" />} /> },
    windows: { title: 'Change windows in the next 14 days', icon: CalendarRange, link: '/changes?tab=calendar', linkLabel: 'Calendar', n: w.windows.length, sub: undefined,
      body: <DataTable<RRow> rows={rowsWithId(w.windows)} cols={windowCols} onRow={r => navigate(`/changes/${r.c.id}`)} pageSize={10} empty={<Empty icon={CalendarRange} title="No change window in the next 14 days" />} /> },
    recent: { title: 'Changes carried out in the last 28 days', icon: BarChart3, link: chg({ flag: 'done' }), linkLabel: 'Open in Changes', n: o.recent.length, sub: undefined,
      body: <DataTable<RRow> rows={rowsWithId(o.recent)} cols={recentCols} onRow={r => navigate(`/changes/${r.c.id}`)} pageSize={10} empty={<Empty icon={BarChart3} title="No change was carried out in the last 28 days" />} /> },
  }[detail];

  return (
    <>
      <StatGrid cols={6}>
        <StatTile label="Change success rate" value={pctTxt(k.success)} sub={`last 4 weeks, vs the 4 before · ${k.implemented.last} changes`} onClick={() => navigate(chg({ flag: 'done', from: from4 }))}>
          {kpi(k.success !== null && k.successPrev !== null ? delta(k.success - k.successPrev, true, ' pts') : undefined, <Sparkline values={nanOf(o.outcomes.map(x => x.successPct))} height={28} />)}
        </StatTile>
        <StatTile label="Changes implemented" value={k.implemented.last} sub={`4 weeks · ${k.byClass4.Standard} standard · ${k.byClass4.Normal} normal · ${k.byClass4.Emergency} emergency`} onClick={() => navigate(chg({ flag: 'done', from: from4 }))}>
          {kpi(delta(k.implemented.deltaPct, true), <MiniBars values={o.outcomes.map(x => x.total)} labels={weekLabels} />)}
        </StatTile>
        <StatTile label="Lead time, normal changes" value={dTxt(k.leadDays)} sub="median, submitted to implemented, 4 weeks" onClick={() => navigate(chg({ class: 'Normal', flag: 'done', from: from4 }))}>
          {kpi(delta(leadChange, false), <Sparkline values={nanOf(o.lead.map(x => x.totalDays))} height={28} />)}
        </StatTile>
        <StatTile label="Emergency changes" value={pctTxt(k.emergency)} sub={`${k.byClass4.Emergency} of ${k.implemented.last} in 4 weeks · lower is better`} onClick={() => navigate(chg({ class: 'Emergency' }))}>
          {kpi(k.emergency !== null && k.emergencyPrev !== null ? delta(k.emergency - k.emergencyPrev, false, ' pts') : undefined, <Sparkline values={nanOf(o.emergencyPct)} height={28} color={C.emergency} />)}
        </StatTile>
        <StatTile label="Awaiting approval" value={k.waiting} subTone={k.waitingOverdue ? 'warn' : undefined} onClick={() => navigate('/changes?status=review')}
          sub={k.waiting ? `${k.waitingMine} for your role · ${k.waitingOverdue ? `${k.waitingOverdue} over ${APPROVAL_SLA_DAYS} days` : `oldest ${k.oldestWaitDays ?? 0} d`}` : 'nothing waiting'}>
          {kpi(k.waitingOverdue ? { text: `${k.waitingOverdue} overdue`, tone: 'bad' } : undefined, <Sparkline values={o.waiting} height={28} />)}
        </StatTile>
        <StatTile label="Failed or rolled back" value={k.failed.last} sub={`4 weeks, vs ${k.failed.prev} the 4 before`} subTone={k.failed.last ? 'bad' : undefined} onClick={() => navigate(chg({ flag: 'failed', from: from4 }))}>
          {kpi(delta(k.failed.deltaPct, false), <MiniBars values={o.outcomes.map(x => x.failed)} labels={weekLabels} tone="error" />,
            <Chip size="xs" tone={k.suspended ? 'warning' : 'neutral'} title={k.suspended ? `${plural(k.suspended, 'standard template')} suspended` : undefined}>{k.suspended ? `${plural(k.suspended, 'standard template')} suspended` : 'No standard template suspended'}</Chip>)}
        </StatTile>
      </StatGrid>

      <div className="grid g-2">
        <Panel title="Volume and outcome" icon={BarChart3} sub="Changes implemented each week by class, and how many failed; the success rate is in each week's tooltip"
          foot={<span>{total12} implemented in 12 weeks · <b>{failed12}</b> failed or rolled back · {issues12} with issues · <Link to={chg({ flag: 'done', from: dateParam(o.weeks[0].start) })}>See them</Link></span>}>
          <TimeChart labels={weekLabels} fullLabels={o.outcomes.map(x => `Week of ${x.label} · success rate ${pctTxt(x.successPct)}`)} height={240} series={[
            { key: 'std', label: 'Standard', color: C.standard, kind: 'bar', stack: 'c', values: o.outcomes.map(x => x.standard) },
            { key: 'nor', label: 'Normal', color: C.normal, kind: 'bar', stack: 'c', values: o.outcomes.map(x => x.normal) },
            { key: 'em', label: 'Emergency', color: C.emergency, kind: 'bar', stack: 'c', values: o.outcomes.map(x => x.emergency) },
            { key: 'fail', label: 'Failed', color: C.failed, kind: 'line', values: o.outcomes.map(x => x.failed) },
          ]} />
        </Panel>
        <Panel title="Lead time" icon={Hourglass} sub="Normal changes implemented each week: median days to approve, then to implement (includes waiting for the window)"
          foot={<span>Last 4 weeks: <b>{dTxt(k.leadApprove)}</b> to approve, <b>{dTxt(k.leadImplement)}</b> to implement · standard changes are approved at once</span>}>
          <TimeChart labels={o.lead.map(x => x.label)} fullLabels={o.lead.map(x => `Week of ${x.label} · ${plural(x.n, 'normal change')} implemented · ${dShort(x.totalDays)} in all`)} height={240} format={v => dShort(v)} series={[
            { key: 'appr', label: 'Submitted to approved', color: C.normal, kind: 'bar', stack: 'l', values: o.lead.map(x => (x.n ? x.approveDays : null)) },
            { key: 'impl', label: 'Approved to implemented', color: C.light, kind: 'bar', stack: 'l', values: o.lead.map(x => (x.n ? x.implementDays : null)) },
          ]} />
        </Panel>
      </div>

      <div className="grid g-2">
        <Panel title="Open changes by stage" icon={GitPullRequestArrow} count={k.open} sub="Where every open change is now, split by class; select a stage to see its changes"
          foot={stuck
            ? <span><span style={{ color: 'var(--vw-color-amber-700)' }}>{plural(stuck, 'change')} stuck</span>: a decision waiting over {APPROVAL_SLA_DAYS} days, a draft over 14 days, or a window that has passed · <Link to={chg({ flag: 'stuck' })}>Show them</Link></span>
            : <span>Nothing is stuck: no decision waits over {APPROVAL_SLA_DAYS} days and no window has passed unworked.</span>}>
          <BarList items={stageItems} />
        </Panel>
        <Panel title="Approvals and the change board" icon={Gavel} sub="Normal changes heard at each weekly board (Thursdays 10:00) and on the next agenda"
          actions={<PanelLink onClick={() => navigate('/changes?status=review')}>Awaiting approval</PanelLink>}
          foot={<span>Next board, Thu {next.label}: <b>{plural(next.heard, 'change')}</b>{next.high ? <> · <span style={{ color: 'var(--vw-color-amber-700)' }}>{next.high} high or critical risk</span></> : null}{next.violations ? <> · {next.violations} with policy warnings</> : null}{next.carried ? <> · {next.carried} carried over</> : null}</span>}>
          <TimeChart labels={o.boards.map(b => (b.next ? 'Next' : b.label))} height={180}
            fullLabels={o.boards.map(b => `${b.next ? 'Next board' : 'Board'} · Thu ${b.label}${b.next ? ` · ${b.carried} carried over` : ` · ${b.carried} still waiting`} · ${b.high} high or critical risk · ${b.violations} with policy warnings`)}
            series={[
              { key: 'ok', label: 'Approved', color: C.normal, kind: 'bar', stack: 'b', values: o.boards.map(b => (b.next ? null : b.approved)) },
              { key: 'no', label: 'Rejected', color: C.failed, kind: 'bar', stack: 'b', values: o.boards.map(b => (b.next ? null : b.rejected)) },
              { key: 'open', label: 'Not decided', color: C.slate, kind: 'bar', stack: 'b', values: o.boards.map(b => (b.next ? null : Math.max(0, b.heard - b.approved - b.rejected))) },
              { key: 'next', label: 'Next agenda', color: C.emergency, kind: 'bar', stack: 'b', values: o.boards.map(b => (b.next ? b.heard : null)) },
            ]} />
          <div className="vw-label" style={{ margin: '12px 0 4px' }}>Waiting for a decision, by approver role</div>
          {roleItems.length ? <BarList items={cut('roles', roleItems, 5)} /> : <Muted>Nothing is waiting for a decision.</Muted>}
          {more('roles', roleItems.length, 5)}
        </Panel>
      </div>

      <div className="grid g-2">
        <Panel title="Next 14 days" icon={CalendarRange} sub="Change windows per day by class; weekends and freezes are named in each day's tooltip"
          actions={<PanelLink onClick={() => navigate('/changes?tab=calendar')}>Calendar</PanelLink>}
          foot={<span>{plural(w.windows.length, 'open change')} with a window in the next two weeks, at {plural(sites14, 'site')} · <Link to={chg({ flag: 'next14' })}>List them</Link></span>}>
          <TimeChart labels={w.days.map(x => `${x.weekday} ${x.label}`)} height={220}
            fullLabels={w.days.map(x => [`${x.weekday} ${x.label}`, isWeekend(x.day) && 'weekend', x.freeze && `freeze: ${x.freeze.name}`, x.kitShort && `${x.kitShort} kit not at site`].filter(Boolean).join(' · '))}
            series={[
              { key: 'std', label: 'Standard', color: C.standard, kind: 'bar', stack: 'd', values: w.days.map(x => x.standard) },
              { key: 'nor', label: 'Normal', color: C.normal, kind: 'bar', stack: 'd', values: w.days.map(x => x.normal) },
              { key: 'em', label: 'Emergency', color: C.emergency, kind: 'bar', stack: 'd', values: w.days.map(x => x.emergency) },
            ]} />
          {freezeDays.length > 0 && <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <span className="vw-label">Frozen days:</span>{freezeDays.map(x => <Chip key={x.day} size="xs" tone="warning" title={x.freeze!.name}>{x.weekday} {x.label}</Chip>)}
          </div>}
        </Panel>
        <Panel title="Before the windows" icon={AlertTriangle} sub="What could stop the changes booked in the next 14 days">
          <div className="col" style={{ gap: 0 }}>
            <Issue first label="Clashing windows" hint="same site, same time, same equipment" n={w.clashes.length} to={chg({ flag: 'clash' })} tone="bad"
              items={w.clashes.slice(0, 3).map(x => <span key={`${x.a.key}-${x.b.key}`}><IdLink id={x.a.changeId ?? x.a.label} /> and <IdLink id={x.b.changeId ?? x.b.label} /> · {fmtDayShort(x.b.start)}</span>)} />
            <Issue label="In a freeze" hint="move the window or go emergency" n={w.inFreeze.length} to={chg({ flag: 'freeze14' })} tone="bad" items={w.inFreeze.slice(0, 4).map(r => <IdLink key={r.c.id} id={r.c.id} title={`${r.c.title} · ${r.freeze?.name}`} />)} />
            <Issue label="Not approved yet" hint="window booked, decision pending" n={w.notApproved.length} to={chg({ flag: 'pending14' })} tone="warn" items={w.notApproved.slice(0, 4).map(r => <IdLink key={r.c.id} id={r.c.id} title={`${r.c.title} · ${fmtWhen(r.start)}`} />)} />
            <Issue label="Kit not at site" hint="advisory: materials not delivered yet" n={w.kitShort.length} to={chg({ flag: 'kit' })} tone="warn" items={w.kitShort.slice(0, 4).map(r => <IdLink key={r.c.id} id={r.c.id} title={`${r.c.title} · ${fmtWhen(r.start)}`} />)} />
            <Issue label="Materials short" hint="advisory: the supply chain platform cannot supply everything" n={w.materialsShort.length} to={chg({ flag: 'short' })} tone="warn" items={w.materialsShort.slice(0, 4).map(r => <IdLink key={r.c.id} id={r.c.id} title={`${r.c.title} · ${fmtWhen(r.start)}`} />)} />
            <Issue label="High or critical risk" hint="check the back-out plan and the crew" n={w.highRisk.length} to={chg({ flag: 'risk14' })} tone="neutral" items={w.highRisk.slice(0, 4).map(r => <IdLink key={r.c.id} id={r.c.id} title={`${r.c.title} · ${r.c.risk} risk · ${fmtWhen(r.start)}`} />)} />
          </div>
        </Panel>
      </div>

      <div className="grid g-2">
        <Panel title="Changes by site" icon={MapPin} count={o.sites.length} sub={`Success rate of changes carried out in the last ${FAILURE_WEEKS} weeks, and changes open now`} foot={more('sites', siteItems.length, 8)}>
          {siteItems.length ? <BarList items={cut('sites', siteItems, 8)} /> : <Muted>No change has a site.</Muted>}
        </Panel>
        <Panel title="Where changes fail" icon={ShieldX}
          sub={failBy === 'type' ? `Changes carried out in the last ${FAILURE_WEEKS} weeks by type, and how many failed or were rolled back` : 'Standard templates: uses and failures since each was approved; a failure suspends the template'}
          actions={<Seg<'type' | 'template'> size="sm" value={failBy} onChange={setFailBy} options={[{ id: 'type', label: 'Change type' }, { id: 'template', label: 'Standard templates' }]} />}
          foot={failBy === 'type' ? more('types', typeItems.length, 8) : more('templates', templateItems.length, 8)}>
          {failBy === 'type'
            ? (typeItems.length ? <BarList items={cut('types', typeItems, 8)} /> : <Muted>No change carried out in the last {FAILURE_WEEKS} weeks.</Muted>)
            : (templateItems.length ? <BarList items={cut('templates', templateItems, 8)} /> : <Muted>No standard templates yet.</Muted>)}
        </Panel>
      </div>

      <Tabs<Detail> value={detail} onChange={setDetail} tabs={[
        { id: 'attention', label: 'Needs attention', count: o.attention.length },
        { id: 'closeout', label: 'Review and closure', count: o.closeouts.length },
        { id: 'windows', label: 'Next 14 days', count: w.windows.length },
        { id: 'recent', label: 'Recent outcomes', count: o.recent.length },
      ]} />
      <Panel title={detailPanel.title} icon={detailPanel.icon} count={detailPanel.n} sub={detailPanel.sub} flush
        actions={<PanelLink onClick={() => navigate(detailPanel.link)}>{detailPanel.linkLabel}</PanelLink>}>
        {detailPanel.body}
      </Panel>
    </>
  );
}

function IdLink({ id, title }: { id: string; title?: string }) {
  return <Link className="ent-link mono" to={`/changes/${id}`} title={title}>{id}</Link>;
}

/** One line of "Before the windows": what, how many, the first few changes, and a link to all of them. */
function Issue({ label, hint, n, items, to, tone, first }: { label: string; hint: string; n: number; items: ReactNode[]; to: string; tone: 'bad' | 'warn' | 'neutral'; first?: boolean }) {
  const chipTone = !n ? 'neutral' : tone === 'bad' ? 'error' : tone === 'warn' ? 'warning' : 'info';
  return (
    <div className="col" style={{ gap: 4, padding: '9px 0', borderTop: first ? undefined : '1px solid var(--vw-color-slate-100)' }}>
      <div className="row between" style={{ gap: 8 }}>
        <span style={{ minWidth: 0 }}><span className="strong">{label}</span> <Muted size="xs">· {hint}</Muted></span>
        <span className="row" style={{ gap: 8, flex: 'none' }}>
          <Chip size="xs" tone={chipTone}>{n}</Chip>
          {n > 0 && <Link to={to} style={{ fontSize: 12 }}>List</Link>}
        </span>
      </div>
      {n > 0 && (
        <div className="row" style={{ gap: '2px 10px', flexWrap: 'wrap', fontSize: 12 }}>
          {items}{n > items.length && <Muted size="xs">and {n - items.length} more</Muted>}
        </div>
      )}
    </div>
  );
}

function Outcome({ row }: { row: ChangeRow }) {
  const o = row.c.review?.outcome;
  if (row.c.status === 'RolledBack' || o === 'Rolled back' || o === 'Failed') return <Chip tone="error" dot>{o ?? 'Rolled back'}</Chip>;
  if (o === 'Successful with issues') return <Chip tone="warning" dot>With issues</Chip>;
  if (o === 'Successful') return <Chip tone="success" dot>Successful</Chip>;
  return <Muted>not reviewed yet</Muted>;
}
