/* Small building blocks shared by the change screens: chips for status only, the calm summary row,
   key–value lists, the chain trail and a pager for plain tables. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type * as T from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';
import { CLASS_TONE, RISK_TONE, STATUS_LABEL, STATUS_TONE, WO_STATUS_TONE, type ChangeStatus } from '../lib/model';

export const StatusChip = ({ status }: { status: ChangeStatus }) => <VwChip variant={STATUS_TONE[status] ?? 'neutral'}>{STATUS_LABEL[status] ?? status}</VwChip>;
export const ClassChip = ({ cls }: { cls: T.ChangeClass }) => <VwChip variant={CLASS_TONE[cls]}>{cls}</VwChip>;
export const RiskChip = ({ risk, short }: { risk: string; short?: boolean }) => <VwChip variant={RISK_TONE[risk] ?? 'neutral'}>{short ? risk : `${risk} risk`}</VwChip>;
export const WoStatusChip = ({ status }: { status: string }) => <VwChip variant={WO_STATUS_TONE[status] ?? 'neutral'}>{status === 'InProgress' ? 'In progress' : status}</VwChip>;

/** Muted helper text. */
export function Muted({ children, size = 'sm' }: { children: ReactNode; size?: 'xs' | 'sm' }) {
  return <span style={{ fontSize: size === 'xs' ? 'var(--vw-font-label-xs)' : 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)' }}>{children}</span>;
}

/** One figure in the summary row: label, value, small sub-line; separated by a thin rule. */
export function Figure({ label, value, sub, tone, first, onClick, active }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn' | 'ok'; first?: boolean; onClick?: () => void; active?: boolean }) {
  const color = tone === 'bad' ? 'var(--vw-color-red-600)' : tone === 'warn' ? 'var(--vw-color-amber-700)' : tone === 'ok' ? 'var(--vw-color-green-700)' : 'var(--vw-color-slate-900)';
  return (
    <div
      onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{ minWidth: 0, padding: '2px 20px', paddingLeft: first ? 0 : 20, borderLeft: first ? undefined : '1px solid var(--vw-color-slate-200)', cursor: onClick ? 'pointer' : undefined }}
    >
      <div className="vw-card-metric-label-sub" style={{ color: active ? 'var(--vw-color-blue-700)' : undefined, fontWeight: active ? 600 : undefined }}>{label}</div>
      <div style={{ fontSize: 'var(--vw-font-value-lg)', fontWeight: 500, color, lineHeight: 1.25, marginTop: 6, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  );
}
export function SummaryRow({ title, extra, children, columns }: { title?: ReactNode; extra?: ReactNode; children: ReactNode; columns: number }) {
  return (
    <div className="vw-card-section vw-flex vw-flex-col vw-gap-md">
      {(title || extra) && <div className="vw-flex vw-items-center vw-justify-between vw-gap-sm"><span className="vw-card-title">{title}</span>{extra}</div>}
      <div className="vw-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{children}</div>
    </div>
  );
}

/** Compact key–value grid. */
export function KvList({ items, columns = 1 }: { items: { label: ReactNode; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return (
    <div className="vw-grid vw-gap-xs" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: 'var(--vw-space-lg)' }}>
      {items.map((it, i) => (
        <div key={i} className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'minmax(110px, 38%) minmax(0, 1fr)', alignItems: 'baseline', borderBottom: '1px solid var(--vw-color-slate-100)', padding: '6px 0', minWidth: 0 }}>
          <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)' }}>{it.label}</span>
          <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-900)', minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Where a record sits: plan → programme → project → work order → change. Missing links are shown as such. */
export function ChainTrail({ plan, program, project, workOrder, change }: { plan?: T.PlannerPlan; program?: T.Program; project?: T.Project; workOrder?: T.WorkOrder; change?: { id: string } }) {
  const parts: { label: string; value?: string; to?: string }[] = [
    { label: 'Plan', value: plan ? `${plan.plnId} ${plan.title}` : undefined, to: plan ? `/planning/plans/${plan.id}` : undefined },
    { label: 'Programme', value: program ? `${program.progId ?? program.id} ${program.name}` : undefined, to: program ? `/delivery/programs/${program.id}` : undefined },
    { label: 'Project', value: project ? `${project.projId ?? project.id} ${project.name}` : undefined, to: project ? `/delivery/projects/${project.id}` : undefined },
    { label: 'Work order', value: workOrder ? `${workOrder.woId ?? workOrder.id}${workOrder.title ? ` ${workOrder.title}` : ''}` : undefined, to: workOrder ? `/delivery/work-orders/${workOrder.id}` : undefined },
    ...(change ? [{ label: 'Change', value: change.id }] : []),
  ];
  return (
    <nav aria-label="Delivery chain" className="vw-flex vw-items-center vw-wrap" style={{ gap: 6, fontSize: 'var(--vw-font-label-sm)', minWidth: 0 }}>
      {parts.map((p, i) => (
        <span key={p.label} className="vw-inline-flex vw-items-center" style={{ gap: 6, minWidth: 0 }}>
          {i > 0 && <span aria-hidden style={{ color: 'var(--vw-color-slate-400)' }}>›</span>}
          <span style={{ color: 'var(--vw-color-slate-500)' }}>{p.label}</span>
          {p.value
            ? (p.to ? <Link to={p.to} style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.value}>{p.value}</Link> : <strong style={{ fontWeight: 500 }}>{p.value}</strong>)
            : <span style={{ color: 'var(--vw-color-slate-400)' }}>none</span>}
        </span>
      ))}
    </nav>
  );
}

/** Previous / next for plain tables. */
export function Pager({ page, pages, total, onPage, noun = 'changes' }: { page: number; pages: number; total: number; onPage: (p: number) => void; noun?: string }) {
  if (pages <= 1) return <div style={{ paddingTop: 8 }}><Muted>{total} {noun}</Muted></div>;
  return (
    <div className="vw-flex vw-items-center vw-justify-between" style={{ paddingTop: 8 }}>
      <Muted>{total} {noun} · page {page + 1} of {pages}</Muted>
      <span className="vw-flex vw-gap-xs">
        <button type="button" className="nst-btn nst-btn--sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
        <button type="button" className="nst-btn nst-btn--sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next</button>
      </span>
    </div>
  );
}

/** Empty line inside a card. */
export const Empty = ({ children }: { children: ReactNode }) => <div className="vw-card-description" style={{ padding: '8px 0' }}>{children}</div>;
