/* eslint-disable react-refresh/only-export-components */
/* Small shared pieces used by every planner page. Keep this file free of page logic. */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tooltip } from 'antd';
import { VwChip, type VwChipVariant, AIInsightCard } from '../../../shared/components/ux';
import type * as T from '../../../mock/data/types';
import { SOURCE_LABEL, SCOPE_LABEL, ASPECT_LABEL } from '../lib/engine';
import type { Proposal, Evidence } from '../lib/ai';

export const STATUS_TONE: Record<T.PlannerPlanStatus, VwChipVariant> = { Draft: 'neutral', 'In review': 'warning', Approved: 'success', Executing: 'info', Completed: 'success', Rejected: 'error', 'On hold': 'warning', Cancelled: 'neutral' };
export const SOURCE_TONE: Record<T.PlannerParamSource, VwChipVariant> = { user: 'info', requirement: 'pink', template: 'neutral', benchmark: 'cyan', actual: 'success', document: 'orange', ai: 'purple' };
export const FINDING_TONE = { pass: 'success', fail: 'error', warn: 'warning', 'n/a': 'neutral' } as const satisfies Record<string, VwChipVariant>;

export function StatusChip({ status }: { status: T.PlannerPlanStatus }) { return <VwChip variant={STATUS_TONE[status]}>{status}</VwChip>; }
export function ScopeChip({ scope }: { scope: T.PlannerScope }) { return <VwChip variant="neutral">{SCOPE_LABEL[scope]}</VwChip>; }
export function AspectChip({ aspect }: { aspect: T.PlannerAspect }) { return <VwChip variant="neutral">{ASPECT_LABEL[aspect]}</VwChip>; }
/** Where a number came from — every derived figure in the planner shows one of these. */
export function SourceChip({ source, note }: { source: T.PlannerParamSource; note?: string }) {
  const chip = <VwChip variant={SOURCE_TONE[source]} style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px' }}>{SOURCE_LABEL[source]}</VwChip>;
  return note ? <Tooltip title={note}>{chip}</Tooltip> : chip;
}

export function EvidenceLinks({ items }: { items: Evidence[] }) {
  const nav = useNavigate();
  if (!items.length) return null;
  return <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>{items.map((e, i) => (e.to ? <a key={i} onClick={() => nav(e.to!)} style={{ fontSize: 12 }}>{e.label}</a> : <span key={i} style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>{e.label}</span>))}</span>;
}

/** One AI proposal with accept / reject. Accepting applies the value; both record feedback. */
export function ProposalCard({ p, onAccept, onReject, applied }: { p: Proposal<unknown>; onAccept: () => void; onReject: () => void; applied?: boolean }) {
  return (
    <AIInsightCard title={p.title} body={<span>{p.reason} <EvidenceLinks items={p.evidence} /></span>} confidence={p.confidence} actionLabel={applied ? 'Applied' : `Apply ${typeof p.value === 'number' ? p.value.toLocaleString('en-US') : String(p.value)}`} onAction={applied ? undefined : onAccept} sourceLabel={applied ? undefined : 'Not for this plan'} onSource={applied ? undefined : onReject} />
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'var(--vw-color-red-600)' : tone === 'warn' ? '#b45309' : tone === 'ok' ? 'var(--vw-color-green-600)' : 'var(--vw-color-slate-900)';
  return <div className="vw-card-child" style={{ padding: '10px 14px', minWidth: 0 }}><div style={{ fontSize: 11, color: 'var(--vw-color-slate-500)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div><div style={{ fontSize: 20, fontWeight: 600, color, lineHeight: 1.2 }}>{value}</div>{sub && <div style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>{sub}</div>}</div>;
}
