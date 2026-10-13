/** Planner hub — the one Planner menu entry. Tabs: /planning (overview), /planning/plans (grid),
 *  /planning/templates(/:id) (template library), /planning/benchmarks (benchmarks and rules).
 *  Only the active tab is mounted. */
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { App, Input, Select, Spin } from 'antd';
import type { ColDef, ICellRendererParams, CellClickedEvent } from 'ag-grid-community';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwCard, VwChip, VwSegmented, TabBarV2, RowActions, EmptyState } from '../../../shared/components/ux';
import { PlusOutlined, SearchOutlined, ClockCircleOutlined, WarningOutlined, EyeOutlined, EditOutlined, DeleteOutlined } from '../../../shared/icons';
import { dcTypeName } from '../../../mock/data/dcTypes';
import type * as T from '../../../mock/data/types';
import { useVwPalette } from '../../site360/lib/siteModel';
import { fmtKw, fmtUsd, SCOPE_LABEL } from '../lib/engine';
import { useBenchmarks, usePlannerActions, usePlans, useTemplates } from '../lib/usePlanner';
import { StatusChip, ScopeChip } from '../components/kit';
import { usePlanRows, fmtDate, ACTIVE_STATUSES, MONO_CELL, type PlanRow } from '../components/hub/model';
import { BarRows, PctBar } from '../components/hub/visuals';

const TemplatesLibrary = lazy(() => import('./TemplatesPage'));
const BenchmarksLibrary = lazy(() => import('./BenchmarksPage'));
const PlanGrid = lazy(() => import('../../../shared/components/vw/VwDataGrid').then(({ VwDataGrid }) => ({ default: VwDataGrid<GridRow> })));

type Tab = 'overview' | 'plans' | 'templates' | 'benchmarks';
const tabFromPath = (p: string): Tab => (p.startsWith('/planning/templates') ? 'templates' : p.startsWith('/planning/benchmarks') ? 'benchmarks' : p.endsWith('/plans') ? 'plans' : 'overview');
const pathFromTab: Record<Tab, string> = { overview: '/planning', plans: '/planning/plans', templates: '/planning/templates', benchmarks: '/planning/benchmarks' };
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

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <div className="vw-card-section vw-flex vw-justify-between vw-items-center vw-wrap vw-gap-md" style={{ padding: '14px 20px' }}>
        <div style={{ minWidth: 220 }}>
          <div className="vw-page-title" role="heading" aria-level={3}>Planner</div>
          <div className="vw-card-description">Plan anything from one rack to a new data centre.</div>
        </div>
        <div className="vw-flex vw-items-center vw-gap-sm vw-wrap" style={{ flex: 1, justifyContent: 'flex-end', minWidth: 320 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/planning/new')}>New plan</Button>
        </div>
      </div>

      {showKpis && (
        <div className="vw-card-section" style={{ padding: 0 }}>
          <div className="vw-grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            <StatCell label="Draft" value={kpi.draft} onClick={() => navigate('/planning/plans?status=Draft')} />
            <StatCell label="In review" value={kpi.review} tone={kpi.review ? 'warn' : undefined} onClick={() => navigate('/planning/plans?status=In review')} />
            <StatCell label="Approved" value={kpi.approved} onClick={() => navigate('/planning/plans?status=Approved')} />
            <StatCell label="Executing" value={kpi.executing} onClick={() => navigate('/planning/plans?status=Executing')} />
            <StatCell label="On hold" value={kpi.hold} tone={kpi.hold ? 'warn' : undefined} onClick={() => navigate('/planning/plans?status=On hold')} />
            <StatCell label="Planned IT load" value={fmtKw(kpi.kw)} sub="draft to executing, and on hold" />
            <StatCell label="CapEx in pipeline" value={fmtUsd(kpi.capex)} sub="base-case estimates" />
          </div>
        </div>
      )}

      <TabBarV2 activeKey={tab} onChange={k => navigate(pathFromTab[k as Tab])} items={[
        { key: 'overview', label: 'Overview', children: tab === 'overview' ? content.overview() : null },
        { key: 'plans', label: 'Plans', badge: rows.length, children: tab === 'plans' ? content.plans() : null },
        { key: 'templates', label: 'Templates', badge: templates.length, children: tab === 'templates' ? content.templates() : null },
        { key: 'benchmarks', label: 'Benchmarks & rules', badge: benchmarks.length, children: tab === 'benchmarks' ? content.benchmarks() : null },
      ]} />

    </div>
  );
}

/** One compact KPI cell in the hub's stat strip. */
function StatCell({ label, value, sub, tone, onClick }: { label: string; value: React.ReactNode; sub?: string; tone?: 'warn'; onClick?: () => void }) {
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? e => { if (e.key === 'Enter') onClick(); } : undefined}
      style={{ padding: '12px 20px', borderLeft: '1px solid var(--vw-color-slate-100)', cursor: onClick ? 'pointer' : undefined, minWidth: 0 }}>
      <div className="vw-card-metric-label">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3, color: tone === 'warn' ? '#b45309' : 'var(--vw-color-slate-900)' }}>{value}</div>
      {sub && <div className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>{sub}</div>}
    </div>
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
  if (!ready) return <VwCard loading>Loading plans…</VwCard>;
  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <VwCard title="Pipeline by scope" extra={<span className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>plans and design IT kW, all statuses</span>}>
          <BarRows items={byScope} series={[{ key: 'count', label: 'Plans', color: pal.violet, format: v => `${v}` }, { key: 'kw', label: 'IT load', color: pal.blue, format: v => fmtKw(v) }]} />
        </VwCard>
        <VwCard title="Needs attention" extra={<VwChip variant={attention.length ? 'warning' : 'success'}>{attention.length} item(s)</VwChip>} bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 'var(--vw-space-sm)', maxHeight: 420, overflowY: 'auto' }}>
          {attention.length === 0 && <EmptyState variant="no-data" title="Nothing waiting" description="No pending decisions, failing hard rules or late long-lead items across active plans." />}
          {attention.map((a, i) => (
            <VwCard key={`${a.row.plan.id}-${a.kind}-${i}`} variant="child" tone={a.kind === 'fail' || a.kind === 'stalled' ? 'error' : a.kind === 'decision' || a.kind === 'condition' ? 'warning' : undefined} onClick={() => navigate(`/planning/plans/${a.row.plan.id}`)}>
              <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
                <div className="vw-card-title" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.row.plan.title}</div>
                <VwChip variant={tone[a.kind]} icon={a.kind === 'decision' ? <ClockCircleOutlined /> : <WarningOutlined />}>{kindLabel[a.kind]}</VwChip>
              </div>
              <div className="vw-card-description" style={{ marginTop: 2 }}>{a.text}</div>
            </VwCard>
          ))}
        </VwCard>
      </div>
      <VwCard title="Recent plans" extra={<a onClick={() => navigate('/planning/plans')}>All plans →</a>}>
        {recent.length === 0 ? <EmptyState variant="no-data" entity="plans" primaryAction={{ label: 'New plan', onClick: () => navigate('/planning/new'), icon: <PlusOutlined /> }} /> : (
          <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md">
            {recent.map(r => (
              <VwCard key={r.plan.id} variant="child" onClick={() => navigate(`/planning/plans/${r.plan.id}`)}>
                <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
                  <div className="vw-card-title" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.plan.title}</div>
                  <StatusChip status={r.plan.status} />
                </div>
                <div className="vw-flex vw-gap-xs vw-wrap" style={{ marginTop: 4 }}><ScopeChip scope={r.plan.scope} /><VwChip variant="neutral">{dcTypeName(r.plan.dcTypeKey)}</VwChip></div>
                <div className="vw-card-description" style={{ marginTop: 6 }}>{r.site} · {fmtKw(r.plan.designPowerKw)} · CapEx {fmtUsd(r.capex)}</div>
                <div style={{ marginTop: 6 }}><PctBar pct={r.ev.readinessPct} color={r.ev.hardFails ? pal.red : r.ev.readinessPct >= 80 ? pal.emerald : pal.amber} label={`${r.ev.readinessPct}% ready`} /></div>
                <div className="vw-flex vw-justify-between vw-gap-sm" style={{ marginTop: 6, fontSize: 'var(--vw-font-label-xs)' }}><span className="vw-text-tertiary">{r.plan.ownerName}</span><span className="vw-text-tertiary">updated {fmtDate(r.plan.updatedAt)}</span></div>
              </VwCard>
            ))}
          </div>
        )}
      </VwCard>
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
  const statusOpts = useMemo(() => [{ label: `All ${rows.length}`, value: 'all' }, ...STATUSES.map(st => ({ label: `${st} ${rows.filter(r => r.plan.status === st).length}`, value: st }))], [rows]);
  const remove = useCallback((id: string) => { const p = plans.find(x => x.id === id); if (!p) return; modal.confirm({ title: `Delete ${p.plnId}?`, content: `The draft "${p.title}" is removed from the planner. It stays in the audit trail.`, okText: 'Delete', okButtonProps: { danger: true }, onOk: () => { if (actions.deletePlan(p).ok) message.info('Draft deleted'); } }); }, [plans, actions, message, modal]);
  const cols = useMemo<ColDef<GridRow>[]>(() => [
    { headerName: 'Code', field: 'code', width: 130, cellStyle: MONO_CELL },
    { headerName: 'Plan', field: 'title', minWidth: 260, flex: 2, tooltipField: 'title', cellRenderer: ({ data }: ICellRendererParams<GridRow>) => data && <a onClick={() => navigate(`/planning/plans/${data.id}`)}>{data.title}</a> },
    { headerName: 'Scope', field: 'scope', width: 170, valueFormatter: ({ value }) => SCOPE_LABEL[value as T.PlannerScope] ?? value },
    { headerName: 'Status', field: 'status', width: 120, cellRenderer: ({ value }: ICellRendererParams<GridRow>) => <StatusChip status={value} /> },
    { headerName: 'DC type', field: 'dcType', width: 150 },
    { headerName: 'Site', field: 'site', minWidth: 150, flex: 1 },
    { headerName: 'Design kW', field: 'designKw', width: 110, type: 'rightAligned', valueFormatter: ({ value }) => fmtKw(value) },
    { headerName: 'CapEx', field: 'capex', width: 110, type: 'rightAligned', valueFormatter: ({ value }) => fmtUsd(value) },
    { headerName: 'Readiness', field: 'readiness', width: 110, type: 'rightAligned', cellRenderer: ({ value }: ICellRendererParams<GridRow>) => <VwChip variant={value >= 80 ? 'success' : value >= 50 ? 'warning' : 'neutral'}>{value}%</VwChip> },
    { headerName: 'Hard fails', field: 'hardFails', width: 100, type: 'rightAligned', cellRenderer: ({ value }: ICellRendererParams<GridRow>) => (value ? <VwChip variant="error" icon={<WarningOutlined />}>{value}</VwChip> : <VwChip variant="success">0</VwChip>) },
    { headerName: 'Owner', field: 'owner', width: 150 },
    { headerName: 'Target go-live', field: 'targetGoLive', width: 130, valueFormatter: ({ value }) => fmtDate(value) },
    { headerName: 'Updated', field: 'updatedAt', width: 120, valueFormatter: ({ value }) => fmtDate(value), sort: 'desc' },
    { headerName: '', colId: 'actions', width: 56, sortable: false, resizable: false, pinned: 'right', cellRenderer: ({ data }: ICellRendererParams<GridRow>) => data && <RowActions record={data} items={[
      { key: 'open', label: 'Open', icon: <EyeOutlined />, onClick: () => navigate(`/planning/plans/${data.id}`) },
      { key: 'edit', label: ['Draft', 'Rejected'].includes(data.status) ? 'Edit in wizard' : 'View in wizard', icon: <EditOutlined />, onClick: () => navigate(`/planning/plans/${data.id}/edit`) },
      { key: 'delete', label: 'Delete draft', icon: <DeleteOutlined />, danger: true, onClick: () => remove(data.id), hidden: data.status !== 'Draft' || !!data.row.plan.artefacts?.executionId },
    ]} /> },
  ], [navigate, remove]);

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-flex vw-justify-between vw-items-center vw-wrap vw-gap-sm">
        <div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
          <VwSegmented value={status} onChange={v => setFilter('status', v)} options={statusOpts} />
          <Select value={scope} onChange={v => setFilter('scope', v)} style={{ width: 220 }} options={[{ label: 'All scopes', value: 'all' }, ...(Object.keys(SCOPE_LABEL) as T.PlannerScope[]).map(s => ({ label: SCOPE_LABEL[s], value: s }))]} aria-label="Scope" />
        </div>
        <Input allowClear prefix={<SearchOutlined />} placeholder="Search plans, sites, owners…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 300 }} />
      </div>
      <div className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-sm)' }}>{data.length} of {rows.length} plans</div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Suspense fallback={<div className="vw-ag-grid vw-grid-loading" role="status">Loading plans…</div>}>
          {ready && <PlanGrid rowData={data} columnDefs={cols} getRowId={({ data }) => data.id} overlayNoRowsTemplate="No plans match." ariaLabel="Plans" onCellClicked={(e: CellClickedEvent<GridRow>) => { if (e.column.getColId() !== 'actions' && e.data) navigate(`/planning/plans/${e.data.id}`); }} />}
        </Suspense>
      </VwCard>
    </div>
  );
}
