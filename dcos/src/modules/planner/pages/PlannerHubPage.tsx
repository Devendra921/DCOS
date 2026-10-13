/** Planner hub — the one Planner menu entry. Tabs: /planning (overview), /planning/plans (grid),
 *  /planning/templates(/:id) (template library), /planning/benchmarks (benchmarks and rules).
 *  Only the active tab is mounted. */
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { App, Spin } from 'antd';
import { ChartBar, CheckCircle2, ClipboardList, Clock, Plus, TriangleAlert } from 'lucide-react';
import { RowActions } from '../../../shared/components/ux';
import { EyeOutlined, EditOutlined, DeleteOutlined } from '../../../shared/icons';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, Panel, PanelLink, Tabs } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Meter } from '../../../ops/ui/status';
import { Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { dcTypeName } from '../../../mock/data/dcTypes';
import type * as T from '../../../mock/data/types';
import { useVwPalette } from '../../site360/lib/siteModel';
import { fmtKw, fmtUsd, SCOPE_LABEL } from '../lib/engine';
import { useBenchmarks, usePlannerActions, usePlans, useTemplates } from '../lib/usePlanner';
import { StatusChip, ScopeChip } from '../components/kit';
import { usePlanRows, fmtDate, ACTIVE_STATUSES, type PlanRow } from '../components/hub/model';
import { BarRows, PctBar } from '../components/hub/visuals';

const TemplatesLibrary = lazy(() => import('./TemplatesPage'));
const BenchmarksLibrary = lazy(() => import('./BenchmarksPage'));

type Tab = 'overview' | 'plans' | 'templates' | 'benchmarks';
const tabFromPath = (p: string): Tab => (p.startsWith('/planning/templates') ? 'templates' : p.startsWith('/planning/benchmarks') ? 'benchmarks' : p.endsWith('/plans') ? 'plans' : 'overview');
const pathFromTab: Record<Tab, string> = { overview: '/planning', plans: '/planning/plans', templates: '/planning/templates', benchmarks: '/planning/benchmarks' };
const STATUS_TONE: Record<string, Tone> = { Draft: 'neutral', 'In review': 'warning', Approved: 'success', Executing: 'info', 'On hold': 'orange' };
const Loading = () => <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;

interface GridRow { id: string; code: string; title: string; scope: T.PlannerScope; status: T.PlannerPlanStatus; dcType: string; site: string; designKw: number; capex: number; readiness: number; hardFails: number; owner: string; targetGoLive: string; updatedAt: string; row: PlanRow }

export default function PlannerHubPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tab = tabFromPath(pathname);
  const { rows, ready } = usePlanRows();
  const templates = useTemplates();
  const benchmarks = useBenchmarks();

  const kpi = useMemo(() => {
    const by = (s: T.PlannerPlanStatus) => rows.filter(r => r.plan.status === s).length;
    const active = rows.filter(r => ACTIVE_STATUSES.includes(r.plan.status));
    return { draft: by('Draft'), review: by('In review'), approved: by('Approved'), executing: by('Executing'), hold: by('On hold'), kw: active.reduce((a, r) => a + r.plan.designPowerKw, 0), capex: active.reduce((a, r) => a + r.capex, 0)};
  }, [rows]);

  const showKpis = tab === 'overview' || tab === 'plans';
  const content: Record<Tab, () => React.ReactNode> = {
    overview: () => <OverviewTab rows={rows} ready={ready} />,
    plans: () => <PlansTab rows={rows} ready={ready} />,
    templates: () => <Suspense fallback={<Loading />}><TemplatesLibrary embedded /></Suspense>,
    benchmarks: () => <Suspense fallback={<Loading />}><BenchmarksLibrary embedded /></Suspense>,
  };

  const statusParts = (['Draft', 'In review', 'Approved', 'Executing', 'On hold'] as T.PlannerPlanStatus[])
    .map((st) => ({ key: st, label: st, n: rows.filter((r) => r.plan.status === st).length, tone: STATUS_TONE[st] }));
  return (
    <OpsPage title="Planner" description="Plan anything from one rack to a new data centre."
      actions={<Btn variant="filled" icon={Plus} onClick={() => navigate('/planning/new')}>New plan</Btn>}>
      {showKpis && (
        <StatGrid>
          <StatTile label="Plans" value={rows.length} sub={`${kpi.draft} draft · ${kpi.hold} on hold`}>
            <Split parts={statusParts} legend={false} onPick={(k) => navigate(`/planning/plans?status=${k}`)} />
          </StatTile>
          <StatTile label="In review" value={kpi.review} sub="awaiting decisions" subTone={kpi.review ? 'warn' : undefined} onClick={() => navigate('/planning/plans?status=In review')} />
          <StatTile label="Approved" value={kpi.approved} sub="ready to execute" onClick={() => navigate('/planning/plans?status=Approved')} />
          <StatTile label="Executing" value={kpi.executing} sub="in delivery" onClick={() => navigate('/planning/plans?status=Executing')} />
          <StatTile label="Planned IT load" value={fmtKw(kpi.kw)} sub="draft to executing, and on hold" />
          <StatTile label="CapEx in pipeline" value={fmtUsd(kpi.capex)} sub="base-case estimates" />
        </StatGrid>
      )}

      <Tabs<Tab> value={tab} onChange={(k) => navigate(pathFromTab[k])} tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'plans', label: 'Plans', count: rows.length },
        { id: 'templates', label: 'Templates', count: templates.length },
        { id: 'benchmarks', label: 'Benchmarks & rules', count: benchmarks.length },
      ]} />
      {content[tab]()}
    </OpsPage>
  );
}

/* ------------------------------------------------------------------ overview */
function OverviewTab({ rows, ready }: { rows: PlanRow[]; ready: boolean }) {
  const navigate = useNavigate(); const pal = useVwPalette();
  const byScope = useMemo(() => {
    const m = new Map<T.PlannerScope, { count: number; kw: number }>();
    for (const r of rows) { const e = m.get(r.plan.scope) ?? { count: 0, kw: 0 }; e.count++; e.kw += r.plan.designPowerKw; m.set(r.plan.scope, e); }
    return [...m.entries()].sort((a, b) => b[1].kw - a[1].kw).map(([scope, v]) => ({ label: SCOPE_LABEL[scope], values: { count: v.count, kw: v.kw }, onClick: () => navigate(`/planning/plans?scope=${scope}`) }));
  }, [rows, navigate]);
  const attention = useMemo(() => {
    const out: { row: PlanRow; kind: 'decision' | 'fail' | 'late' | 'stalled' | 'condition'; text: string }[] = [];
    for (const r of rows) {
      if (!ACTIVE_STATUSES.includes(r.plan.status)) continue;
      if (r.plan.status === 'In review') { const pending = r.plan.approvals.filter(a => a.decision === 'Pending'); if (pending.length) out.push({ row: r, kind: 'decision', text: `${pending.length} decision(s) pending: ${pending.map(p => p.step).join(', ')}` }); }
      if (r.plan.status === 'Approved' && r.plan.artefacts?.executionId && !r.plan.artefacts.completedAt) out.push({ row: r, kind: 'stalled', text: `Execution stopped at ${(r.plan.artefacts.errors ?? []).map(e => e.step).join(', ') || 'a step'}; resume it from the plan page` });
      const blocking = (r.plan.conditions ?? []).filter(c => c.status === 'Open' && c.blocksExecution); if (blocking.length && (r.plan.status === 'Approved' || r.plan.status === 'Executing')) out.push({ row: r, kind: 'condition', text: `${blocking.length} approval condition(s) open: ${blocking.slice(0, 2).map(c => c.text).join('; ')}` });
      if (r.ev.hardFails) out.push({ row: r, kind: 'fail', text: `${r.ev.hardFails} hard rule(s) fail: ${r.ev.findings.filter(f => f.status === 'fail').slice(0, 2).map(f => f.rule.title).join('; ')}${r.ev.hardFails > 2 ? '…' : ''}` });
      const late = r.ev.schedule.filter(s => s.late); if (late.length) out.push({ row: r, kind: 'late', text: `${late.length} long-lead item(s) past the order date: ${late.slice(0, 3).map(l => l.item).join(', ')}${late.length > 3 ? '…' : ''}` });
    }
    const rank = { decision: 0, stalled: 1, condition: 2, fail: 3, late: 4 };
    return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.row.plan.designPowerKw - a.row.plan.designPowerKw);
  }, [rows]);
  const recent = useMemo(() => [...rows].sort((a, b) => b.plan.updatedAt.localeCompare(a.plan.updatedAt)).slice(0, 6), [rows]);
  const tone = { decision: 'warning', fail: 'error', late: 'orange', stalled: 'error', condition: 'warning' } as const;
  const kindLabel = { decision: 'Awaiting decision', fail: 'Hard fail', late: 'Late to order', stalled: 'Execution stopped', condition: 'Open condition' } as const;
  if (!ready) return <Panel><Empty icon={ClipboardList} title="Loading plans">Evaluating every plan against its template and rules…</Empty></Panel>;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g-2">
        <Panel title="Pipeline by scope" sub="Plans and design IT kW, all statuses · click a scope to filter" icon={ChartBar}>
          <BarRows items={byScope} series={[{ key: 'count', label: 'Plans', color: pal.violet, format: v => `${v}` }, { key: 'kw', label: 'IT load', color: pal.blue, format: v => fmtKw(v) }]} />
        </Panel>
        <Panel title="Needs attention" sub="Pending decisions, failing hard rules and late long-lead items" icon={TriangleAlert} count={attention.length}><div className="col" style={{ gap: 8, maxHeight: 420, overflowY: 'auto' }}>
          {attention.length === 0 && <Empty icon={CheckCircle2} title="Nothing waiting">No pending decisions, failing hard rules or late long-lead items across active plans.</Empty>}
          {attention.map((a, i) => (
            <button key={`${a.row.plan.id}-${a.kind}-${i}`} type="button" onClick={() => navigate(`/planning/plans/${a.row.plan.id}`)}
              className={`note ${a.kind === 'fail' || a.kind === 'stalled' ? 'note--bad' : a.kind === 'decision' || a.kind === 'condition' ? 'note--warn' : ''}`}
              style={{ flexDirection: 'column', gap: 4, width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer', border: a.kind === 'late' ? '1px solid var(--vw-color-slate-200)' : 0 }}>
              <span className="row between" style={{ width: '100%' }}>
                <span className="strong" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.row.plan.title}</span>
                <Chip tone={tone[a.kind]} dot>{kindLabel[a.kind]}</Chip>
              </span>
              <span>{a.text}</span>
            </button>
          ))}
        </div></Panel>
      </div>
      <Panel title="Recent plans" sub="Most recently updated" icon={Clock} actions={<PanelLink onClick={() => navigate('/planning/plans')}>All plans</PanelLink>}>
        {recent.length === 0 ? <Empty icon={ClipboardList} title="No plans yet" action={<Btn variant="filled" icon={Plus} onClick={() => navigate('/planning/new')}>New plan</Btn>} /> : (
          <div className="grid g-3" style={{ gap: 12 }}>
            {recent.map(r => (
              <div key={r.plan.id} role="button" tabIndex={0} className="tile" style={{ cursor: 'pointer' }} onClick={() => navigate(`/planning/plans/${r.plan.id}`)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/planning/plans/${r.plan.id}`); } }}>
                <span className="row between">
                  <span className="strong" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.plan.title}</span>
                  <StatusChip status={r.plan.status} />
                </span>
                <span className="row wrap" style={{ gap: 4 }}><ScopeChip scope={r.plan.scope} /><Chip tone="neutral" size="xs">{dcTypeName(r.plan.dcTypeKey)}</Chip></span>
                <span className="vw-label" style={{ fontSize: 12.5 }}>{r.site} · <span className="num">{fmtKw(r.plan.designPowerKw)}</span> · CapEx <span className="num">{fmtUsd(r.capex)}</span></span>
                <PctBar pct={r.ev.readinessPct} color={r.ev.hardFails ? pal.red : r.ev.readinessPct >= 80 ? pal.emerald : pal.amber} label={`${r.ev.readinessPct}% ready`} />
                <span className="row between vw-label" style={{ fontSize: 11.5 }}><span>{r.plan.ownerName}</span><span>updated {fmtDate(r.plan.updatedAt)}</span></span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ plans grid */
const STATUSES: T.PlannerPlanStatus[] = ['Draft', 'In review', 'Approved', 'Executing', 'On hold', 'Completed', 'Rejected', 'Cancelled'];

function PlansTab({ rows, ready }: { rows: PlanRow[]; ready: boolean }) {
  const navigate = useNavigate(); const { message } = App.useApp();
  const actions = usePlannerActions(); const plans = usePlans();
  // The URL is the source of truth for the status and scope filters so KPI tiles and scope bars can deep-link.
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') ?? 'all'; const scope = sp.get('scope') ?? 'all';
  const setFilter = (k: 'status' | 'scope', v: string) => { const n = new URLSearchParams(sp); if (v === 'all') n.delete(k); else n.set(k, v); setSp(n, { replace: true }); };
  const [q, setQ] = useState('');

  const data = useMemo<GridRow[]>(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      if (status !== 'all' && r.plan.status !== status) return false;
      if (scope !== 'all' && r.plan.scope !== scope) return false;
      return !s || `${r.plan.plnId} ${r.plan.title} ${r.site} ${r.plan.ownerName} ${dcTypeName(r.plan.dcTypeKey)}`.toLowerCase().includes(s);
    }).map(r => ({ id: r.plan.id, code: r.plan.plnId, title: `${r.plan.title}${r.plan.supersededBy ? ` (superseded by ${r.plan.supersededBy})` : ''}`, scope: r.plan.scope, status: r.plan.status, dcType: dcTypeName(r.plan.dcTypeKey), site: r.site, designKw: r.plan.designPowerKw, capex: r.capex, readiness: r.ev.readinessPct, hardFails: r.ev.hardFails, owner: r.plan.ownerName, targetGoLive: r.plan.targetGoLive, updatedAt: r.plan.updatedAt, row: r }));
  }, [rows, status, scope, q]);

  const { modal } = App.useApp();
  const remove = useCallback((id: string) => { const p = plans.find(x => x.id === id); if (!p) return; modal.confirm({ title: `Delete ${p.plnId}?`, content: `The draft "${p.title}" is removed from the planner. It stays in the audit trail.`, okText: 'Delete', okButtonProps: { danger: true }, onOk: () => { if (actions.deletePlan(p).ok) message.info('Draft deleted'); } }); }, [plans, actions, message, modal]);
  const cols: Col<GridRow>[] = [
    { key: 'title', header: 'Plan', sort: (r) => r.title, render: (r) => <span className="cell-2"><span className="vw-card-activity-label">{r.title}</span><small className="mono">{r.code}</small></span> },
    { key: 'scope', header: 'Scope', sort: (r) => SCOPE_LABEL[r.scope] ?? r.scope, render: (r) => SCOPE_LABEL[r.scope] ?? r.scope },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <StatusChip status={r.status} /> },
    { key: 'site', header: 'Site', sort: (r) => r.site, render: (r) => <span className="cell-2"><span>{r.site}</span><small>{r.dcType}</small></span> },
    { key: 'kw', header: 'Design kW', align: 'right', sort: (r) => r.designKw, render: (r) => <span className="num">{fmtKw(r.designKw)}</span> },
    { key: 'capex', header: 'CapEx', align: 'right', sort: (r) => r.capex, render: (r) => <span className="num">{fmtUsd(r.capex)}</span> },
    { key: 'ready', header: 'Readiness', sort: (r) => r.readiness, render: (r) => <Meter pct={r.readiness} width={56} color={r.hardFails ? 'var(--vw-color-red-500)' : r.readiness >= 80 ? 'var(--vw-color-emerald-500)' : 'var(--vw-color-amber-500)'} /> },
    { key: 'fails', header: 'Hard fails', align: 'right', hideBelow: 1500, sort: (r) => r.hardFails, render: (r) => r.hardFails ? <Chip tone="error" size="xs">{r.hardFails}</Chip> : <span className="vw-label">—</span> },
    { key: 'owner', header: 'Owner', sort: (r) => r.owner, render: (r) => <span className="cell-2"><span>{r.owner}</span><small>go-live {fmtDate(r.targetGoLive)}</small></span> },
    { key: 'updated', header: 'Updated', sort: (r) => r.updatedAt, render: (r) => <span className="num">{fmtDate(r.updatedAt)}</span> },
    { key: 'actions', header: '', render: (r) => <span onClick={(e) => e.stopPropagation()}><RowActions record={r} items={[
      { key: 'open', label: 'Open', icon: <EyeOutlined />, onClick: () => navigate(`/planning/plans/${r.id}`) },
      { key: 'edit', label: ['Draft', 'Rejected'].includes(r.status) ? 'Edit in wizard' : 'View in wizard', icon: <EditOutlined />, onClick: () => navigate(`/planning/plans/${r.id}/edit`) },
      { key: 'delete', label: 'Delete draft', icon: <DeleteOutlined />, danger: true, onClick: () => remove(r.id), hidden: r.status !== 'Draft' || !!r.row.plan.artefacts?.executionId },
    ]} /></span> },
  ];

  if (!ready) return <section className="vw-card-section dcl-table"><Empty icon={ClipboardList} title="Loading plans">Evaluating every plan against its template and rules…</Empty></section>;
  return (
    <section className="vw-card-section dcl-table">
      <DataTable rows={data} cols={cols} onRow={(r) => navigate(`/planning/plans/${r.id}`)} defaultSort={{ key: 'updated', dir: 'desc' }} pageSize={30}
        empty={<Empty icon={ClipboardList} title="No plans match">Clear a filter or start a new plan.</Empty>}
        toolbar={
          <ListToolbar shown={data.length} total={rows.length} noun="plans"
            search={{ value: q, onChange: setQ, placeholder: 'Plans, sites, owners' }}
            filters={[
              { id: 'status', label: 'Status', quick: true, value: status, defaultValue: 'all', onChange: (v) => setFilter('status', v || 'all'), options: [{ id: 'all', label: 'All statuses', count: rows.length }, ...STATUSES.map((st) => ({ id: st, label: st, count: rows.filter((r) => r.plan.status === st).length }))] },
              { id: 'scope', label: 'Scope', quick: true, value: scope, defaultValue: 'all', onChange: (v) => setFilter('scope', v || 'all'), options: [{ id: 'all', label: 'All scopes', count: rows.length }, ...(Object.keys(SCOPE_LABEL) as T.PlannerScope[]).map((sc) => ({ id: sc, label: SCOPE_LABEL[sc], count: rows.filter((r) => r.plan.scope === sc).length }))] },
            ]} />
        } />
    </section>
  );
}
