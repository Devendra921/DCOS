/* eslint-disable react-refresh/only-export-components */
/* Small shared pieces used by every planner page. Keep this file free of page logic. */
import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { VwChip, type VwChipVariant } from '../../../shared/components/ux';
import type * as T from '../../../mock/data/types';
import { SOURCE_LABEL, SCOPE_LABEL, ASPECT_LABEL } from '../lib/engine';

export const STATUS_TONE: Record<T.PlannerPlanStatus, VwChipVariant> = { Draft: 'neutral', 'In review': 'warning', Approved: 'success', Executing: 'info', Completed: 'success', Rejected: 'error', 'On hold': 'warning', Cancelled: 'neutral' };
export const SOURCE_TONE: Record<T.PlannerParamSource, VwChipVariant> = { user: 'info', requirement: 'pink', template: 'neutral', benchmark: 'cyan', actual: 'success', document: 'orange', ai: 'purple' };
export const FINDING_TONE = { pass: 'success', fail: 'error', warn: 'warning', 'n/a': 'neutral' } as const satisfies Record<string, VwChipVariant>;

export function StatusChip({ status }: { status: T.PlannerPlanStatus }) { return <VwChip variant={STATUS_TONE[status]}>{status}</VwChip>; }
export function ScopeChip({ scope }: { scope: T.PlannerScope }) { return <VwChip variant="neutral">{SCOPE_LABEL[scope]}</VwChip>; }
export function AspectChip({ aspect }: { aspect: T.PlannerAspect }) { return <VwChip variant="neutral">{ASPECT_LABEL[aspect]}</VwChip>; }
/** Where a number came from. Shown as quiet text next to the value (hover for the detail), not as a coloured badge. */
export function SourceChip({ source, note }: { source: T.PlannerParamSource; note?: string }) {
  const label = <span style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)', fontWeight: 400, whiteSpace: 'nowrap', borderBottom: note ? '1px dotted var(--vw-color-slate-300)' : undefined, cursor: note ? 'help' : undefined }}>{SOURCE_LABEL[source]}</span>;
  return note ? <Tooltip title={note}>{label}</Tooltip> : label;
}

/** One labelled figure. Tone colours the value only when it carries a verdict (fails, shortfalls). */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'var(--vw-color-red-600)' : tone === 'warn' ? 'var(--vw-color-amber-700)' : 'var(--vw-color-slate-900)';
  return (
    <div className="vw-card-child" style={{ padding: '10px 12px', minWidth: 0 }}>
      <div className="vw-card-metric-label-sub">{label}</div>
      <div style={{ fontSize: 'var(--vw-font-value-md)', fontWeight: 500, color, lineHeight: 1.3, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** A field label with the required marker. */
export function ReqLabel({ children }: { children: ReactNode }) {
  return <span>{children} <span aria-hidden style={{ color: 'var(--vw-color-red-600)' }}>*</span></span>;
}
/** Inline validation message under an input. */
export function FieldError({ text }: { text?: string }) {
  if (!text) return null;
  return <span role="alert" style={{ fontSize: 11, color: 'var(--vw-color-red-600)' }}>{text}</span>;
}
