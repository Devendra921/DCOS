/* eslint-disable react-refresh/only-export-components */
/* Shared view model and small helpers for the plan detail tabs. No page logic here. */
import type { ReactNode } from 'react';
import type * as T from '../../../../mock/data/types';
import type { Evaluation, EstateActuals, Sourced, ParamValue } from '../../lib/engine';
import type { Estate, usePlannerActions } from '../../lib/usePlanner';
import { SourceChip } from '../kit';

export type PlannerActions = ReturnType<typeof usePlannerActions>;

/** Everything a tab needs: the plan, the evaluation currently shown (base or scenario), and the data layer. */
export interface PlanView {
  plan: T.PlannerPlan;
  /** Evaluation shown on the whole page — the selected scenario, or the base case. */
  ev: Evaluation;
  base: Evaluation;
  scenarios: { scenario: T.PlannerScenario; ev: Evaluation }[];
  /** Scenario selected in the hero switcher; null = base case. */
  viewScenario: T.PlannerScenario | null;
  actuals: EstateActuals;
  templates: T.PlannerTemplate[];
  benchmarks: T.PlannerBenchmark[];
  estate: Estate;
  feedback: T.PlannerFeedback[];
  actions: PlannerActions;
  /** The scenario approvers are shown (set at submission; the preferred one before that) and its evaluation. */
  review?: { scenario: T.PlannerScenario | null; ev: Evaluation };
  /** Evaluation of the frozen baseline (approved plans). */
  approved?: Evaluation;
}

export const DECISION_TONE = { Pending: 'warning', Approved: 'success', 'Approved with conditions': 'success', Rejected: 'error' } as const;
export const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
export const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
export const pct = (v: number) => `${Math.round(v)}%`;
export const monthYear = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

/** Label for a parameter key from the resolved template chain (falls back to the key). */
export function paramLabel(ev: Evaluation, key: string): string {
  return ev.resolved?.params.find(p => p.key === key)?.label ?? key;
}
export function paramDef(ev: Evaluation, key: string): T.PlannerParamDef | undefined {
  return ev.resolved?.params.find(p => p.key === key);
}
export function fmtParam(v: ParamValue | undefined, unit?: string): string {
  if (v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return `${v.toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`;
  return `${v}${unit ? ` ${unit}` : ''}`;
}

/** Value with its source chip — the planner's standard way of showing a derived number. */
export function SourcedValue({ s, unit }: { s?: Sourced<ParamValue>; unit?: string }) {
  if (!s) return <span>—</span>;
  return <span className="vw-inline-flex vw-items-center vw-gap-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtParam(s.value, unit)} <SourceChip source={s.source} note={s.note} /></span>;
}

/** Compact key/value grid used inside cards. */
export function KvList({ items, columns = 1 }: { items: { label: ReactNode; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return (
    <div className="vw-grid vw-gap-xs" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: 'var(--vw-space-lg)' }}>
      {items.map((it, i) => (
        <div key={i} className="vw-flex vw-justify-between vw-items-baseline vw-gap-sm" style={{ borderBottom: '1px solid var(--vw-color-slate-100)', padding: '4px 0', minWidth: 0 }}>
          <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)', flexShrink: 0 }}>{it.label}</span>
          <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-900)', fontWeight: 500, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Small uppercase label above a block. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{children}</div>;
}

export function Muted({ children, size = 'sm' }: { children: ReactNode; size?: 'xs' | 'sm' }) {
  return <span style={{ fontSize: size === 'xs' ? 'var(--vw-font-label-xs)' : 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)' }}>{children}</span>;
}

/** Map an AI sizing proposal to the parameter it would set (the proposal carries a value, not a key). */
export function proposalParamKey(title: string, value: unknown): string {
  const t = title.toLowerCase();
  if (typeof value === 'string') return 'coolingType';
  if (t.includes('pue')) return 'pueTarget';
  if (t.includes('carrier')) return 'carrierCount';
  return 'densityKwPerRack';
}

export const COOLING_TYPES: T.PlannerCoolingType[] = ['air-crah', 'air-economiser', 'chilled-water', 'in-row', 'rear-door', 'liquid-to-chip', 'immersion'];
export const TIERS = ['Tier II', 'Tier III', 'Tier IV'];
export const REDUNDANCY = ['N', 'N+1', '2N', '2N+1'];
export const RISK_DOMAINS: T.PlannerRisk['domain'][] = ['Facility', 'Network', 'Supplier', 'Commissioning', 'Regulatory', 'Finance', 'Security'];
export const LEVELS: ('Low' | 'Medium' | 'High')[] = ['Low', 'Medium', 'High'];
export const PERMIT_STATUS: T.PlannerPermit['status'][] = ['Not started', 'Applied', 'In review', 'Approved', 'Expired'];
