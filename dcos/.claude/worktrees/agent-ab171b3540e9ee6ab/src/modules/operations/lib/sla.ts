/**
 * Operations — SLA & MTTR derivation.
 *
 * Severity sets the SLA clock. Each incident captures its response/resolve
 * targets (minutes) at raise-time; these helpers turn detected/acknowledged/
 * resolved timestamps into due-times, breach flags, remaining time, and MTTR.
 * Pure functions — no React, no store — so they're trivially unit-testable
 * and reusable by both the Operations cockpit and the Incident detail page.
 */
import type { Incident } from '../../../mock/data/types';
import type { Severity } from '../../../mock/data/enums';

export interface SlaTarget { responseMins: number; resolveMins: number; }

// Defaults if an incident has no captured target (older records).
export const SLA_TARGETS: Record<Severity, SlaTarget> = {
  SEV1: { responseMins: 15, resolveMins: 240 },    // 15m / 4h
  SEV2: { responseMins: 30, resolveMins: 480 },    // 30m / 8h
  SEV3: { responseMins: 120, resolveMins: 1440 },  // 2h / 24h
  SEV4: { responseMins: 480, resolveMins: 4320 },  // 8h / 72h
};

const MIN = 60_000;
const isClosed = (s: string) => s === 'Resolved' || s === 'Closed';

export function slaTargetFor(inc: Pick<Incident, 'severity' | 'slaResponseMins' | 'slaResolveMins'>): SlaTarget {
  const base = SLA_TARGETS[inc.severity] ?? SLA_TARGETS.SEV3;
  return {
    responseMins: inc.slaResponseMins ?? base.responseMins,
    resolveMins: inc.slaResolveMins ?? base.resolveMins,
  };
}

export interface SlaState {
  responseDueAt: number;
  resolveDueAt: number;
  /** First-response clock: breached if not acknowledged before responseDueAt. */
  responseBreached: boolean;
  /** Resolution clock: breached if not resolved before resolveDueAt. */
  resolveBreached: boolean;
  /** Minutes until (or past, if negative) the resolve deadline. Frozen once resolved. */
  resolveRemainingMins: number;
  responseRemainingMins: number;
  /** Any active breach the operator should see now. */
  breached: boolean;
}

/** Compute the live SLA state for an incident relative to `now`. */
export function slaState(inc: Incident, now: number = Date.now()): SlaState {
  const t = slaTargetFor(inc);
  const detected = new Date(inc.detectedAt).getTime();
  const responseDueAt = detected + t.responseMins * MIN;
  const resolveDueAt = detected + t.resolveMins * MIN;

  const ackTime = inc.acknowledgedAt ? new Date(inc.acknowledgedAt).getTime() : undefined;
  const resolvedTime = inc.resolvedAt ? new Date(inc.resolvedAt).getTime() : undefined;

  // Response: met if acknowledged before due; else breached once now passes due.
  const responseBreached = ackTime != null ? ackTime > responseDueAt : now > responseDueAt;
  // Resolution: if resolved, judge against actual resolve time; else against now.
  const resolveRef = resolvedTime ?? now;
  const resolveBreached = resolveRef > resolveDueAt;

  return {
    responseDueAt,
    resolveDueAt,
    responseBreached,
    resolveBreached,
    responseRemainingMins: Math.round((responseDueAt - (ackTime ?? now)) / MIN),
    resolveRemainingMins: Math.round((resolveDueAt - resolveRef) / MIN),
    // Only flag an *open* incident's breach as actionable.
    breached: !isClosed(inc.status) && (responseBreached || resolveBreached),
  };
}

/** Mean-time-to-resolve in minutes for one incident (undefined if unresolved). */
export function mttrMins(inc: Incident): number | undefined {
  if (!inc.resolvedAt) return undefined;
  return Math.round((new Date(inc.resolvedAt).getTime() - new Date(inc.detectedAt).getTime()) / MIN);
}

/** Time-to-acknowledge in minutes (undefined if not yet acknowledged). */
export function ackLatencyMins(inc: Incident): number | undefined {
  if (!inc.acknowledgedAt) return undefined;
  return Math.round((new Date(inc.acknowledgedAt).getTime() - new Date(inc.detectedAt).getTime()) / MIN);
}

/** Human-friendly minutes → "4h 12m" / "38m" / "2d 3h". */
export function fmtDuration(mins: number): string {
  const a = Math.abs(Math.round(mins));
  if (a < 60) return `${a}m`;
  if (a < 1440) return `${Math.floor(a / 60)}h ${a % 60}m`;
  return `${Math.floor(a / 1440)}d ${Math.floor((a % 1440) / 60)}h`;
}

export interface IncidentStats {
  total: number;
  open: number;
  sev1Open: number;
  breaching: number;       // open incidents currently in SLA breach
  unacknowledged: number;  // open + never acknowledged
  resolved: number;
  mttrMins?: number;       // mean MTTR across resolved incidents
  slaCompliancePct: number; // resolved within target / resolved
}

/** Portfolio-level incident analytics for the cockpit + list KPIs. */
export function incidentStats(incidents: Incident[], now: number = Date.now()): IncidentStats {
  const open = incidents.filter((i) => !isClosed(i.status));
  const resolved = incidents.filter((i) => isClosed(i.status));
  const mttrs = resolved.map(mttrMins).filter((v): v is number => v != null);
  const resolvedWithinSla = resolved.filter((i) => !slaState(i, now).resolveBreached).length;
  return {
    total: incidents.length,
    open: open.length,
    sev1Open: open.filter((i) => i.severity === 'SEV1').length,
    breaching: open.filter((i) => slaState(i, now).breached).length,
    unacknowledged: open.filter((i) => !i.acknowledgedAt).length,
    resolved: resolved.length,
    mttrMins: mttrs.length ? Math.round(mttrs.reduce((s, v) => s + v, 0) / mttrs.length) : undefined,
    slaCompliancePct: resolved.length ? Math.round((resolvedWithinSla / resolved.length) * 100) : 100,
  };
}

// Literal hex, not tokens — these feed Pie chart `scale.color.range`s
// (@ant-design/charts, canvas-rendered) on OperationsHubPage, and canvas
// can't resolve `var(--...)` references. Also used safely elsewhere via
// VwChip, but the canvas consumer means the maps must stay literal.
export const SEV_COLOR: Record<string, string> = { SEV1: '#dc2626', SEV2: '#c2410c', SEV3: '#000000', SEV4: '#7c7c7c' };
export const PRIORITY_COLOR: Record<string, string> = { P1: '#dc2626', P2: '#c2410c', P3: '#000000', P4: '#7c7c7c' };
