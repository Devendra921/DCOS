/**
 * NMS — fault analytics & correlation.
 *
 * Turns the raw alarm stream into something a NOC can act on: active counts by
 * severity, mean-time-to-acknowledge, flapping detection, and correlation —
 * grouping the multiple alarms a single failing device throws into one "storm"
 * so the operator chases one root cause, not twelve symptoms. Pure functions.
 */
import type { Alarm } from '../../../mock/data/types';

// Literal hex, not tokens — feeds AlarmConsolePage's stacked Column chart
// `scale.color.range` (@ant-design/charts, canvas-rendered), which can't
// resolve `var(--...)` references. Also used safely elsewhere via VwChip.
export const SEV_HEX: Record<string, string> = { Critical: '#dc2626', Major: '#c2410c', Minor: '#000000', Warning: '#a16207', Info: '#7c7c7c' };
export const SEV_ORDER = ['Critical', 'Major', 'Minor', 'Warning', 'Info'] as const;
const sevRank = (s: string) => SEV_ORDER.indexOf(s as typeof SEV_ORDER[number]);

const MIN = 60_000;
export const isActive = (a: Alarm) => a.state === 'Active';
export const isFlapping = (a: Alarm) => (a.flapCount ?? 0) >= 3;

export function alarmAgeMins(a: Alarm, now = Date.now()): number {
  return Math.round((now - new Date(a.firstRaisedAt ?? a.raisedAt).getTime()) / MIN);
}
export function fmtAge(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
}

export interface FaultGroup { id: string; deviceId: string; members: Alarm[]; maxSeverity: string; types: string[]; }

/** Active alarms sharing a correlationId = one fault story. Worst-first. */
export function correlationGroups(alarms: Alarm[]): FaultGroup[] {
  const by = new Map<string, Alarm[]>();
  for (const a of alarms) {
    if (!isActive(a) || !a.correlationId) continue;
    const arr = by.get(a.correlationId) ?? []; arr.push(a); by.set(a.correlationId, arr);
  }
  return Array.from(by.entries())
    .map(([id, members]) => ({
      id, deviceId: members[0].deviceId, members,
      maxSeverity: [...members].sort((a, b) => sevRank(a.severity) - sevRank(b.severity))[0].severity,
      types: Array.from(new Set(members.map((m) => m.type))),
    }))
    .sort((a, b) => sevRank(a.maxSeverity) - sevRank(b.maxSeverity) || b.members.length - a.members.length);
}

export interface AlarmStats {
  totalActive: number; critMajor: number; bySeverity: Array<{ severity: string; n: number }>;
  acknowledged: number; cleared: number; flapping: number; storms: number; mttaMins?: number;
  topDevices: Array<{ deviceId: string; n: number; maxSeverity: string }>;
}

/** Daily alarm volume by severity over the trailing window — derived from raisedAt. */
export function alarmTrend(alarms: Alarm[], days = 14): Array<{ day: string; severity: string; value: number }> {
  const dayMs = 864e5;
  const start = Date.now() - (days - 1) * dayMs;
  const label = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const buckets: Record<string, Record<string, number>> = {};
  for (let i = 0; i < days; i++) buckets[label(start + i * dayMs)] = {};
  for (const a of alarms) {
    const t = new Date(a.raisedAt).getTime();
    const lb = label(t);
    if (buckets[lb]) buckets[lb][a.severity] = (buckets[lb][a.severity] ?? 0) + 1;
  }
  const res: Array<{ day: string; severity: string; value: number }> = [];
  for (let i = 0; i < days; i++) {
    const lb = label(start + i * dayMs);
    for (const sev of SEV_ORDER) res.push({ day: lb, severity: sev, value: buckets[lb]?.[sev] ?? 0 });
  }
  return res;
}

export function alarmStats(alarms: Alarm[]): AlarmStats {
  const active = alarms.filter(isActive);
  const acked = alarms.filter((a) => a.state === 'Acknowledged');
  const ackLatencies = acked
    .filter((a) => a.acknowledgedAt)
    .map((a) => (new Date(a.acknowledgedAt!).getTime() - new Date(a.raisedAt).getTime()) / MIN)
    .filter((v) => v >= 0);
  const byDev = new Map<string, Alarm[]>();
  for (const a of active) { const arr = byDev.get(a.deviceId) ?? []; arr.push(a); byDev.set(a.deviceId, arr); }
  const topDevices = Array.from(byDev.entries())
    .map(([deviceId, arr]) => ({ deviceId, n: arr.length, maxSeverity: [...arr].sort((x, y) => sevRank(x.severity) - sevRank(y.severity))[0].severity }))
    .sort((a, b) => b.n - a.n).slice(0, 6);
  return {
    totalActive: active.length,
    critMajor: active.filter((a) => a.severity === 'Critical' || a.severity === 'Major').length,
    bySeverity: SEV_ORDER.map((s) => ({ severity: s, n: active.filter((a) => a.severity === s).length })).filter((x) => x.n > 0),
    acknowledged: acked.length,
    cleared: alarms.filter((a) => a.state === 'Cleared').length,
    flapping: active.filter(isFlapping).length,
    storms: correlationGroups(alarms).length,
    mttaMins: ackLatencies.length ? Math.round(ackLatencies.reduce((s, v) => s + v, 0) / ackLatencies.length) : undefined,
    topDevices,
  };
}
