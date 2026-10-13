/**
 * Delivery overview — the series behind the charts. Pure: every figure comes from the delivery
 * chain (work orders, changes, milestones, projects, programmes), bucketed by week or month.
 */
import type * as T from '../../../../mock/data/types';
import type { DeliveryData } from '../../lib/chain';
import { changeClassOf, isOpenWorkOrder } from '../../lib/chain';
import type { ProgrammeRow, ProjectRow } from '../home/model';

const DAY = 864e5, WEEK = 7 * DAY;
const t = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

/** Monday 00:00 of the week containing `ms`. */
export function weekStart(ms: number): number { const d = new Date(ms); const day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); return d.getTime() - day * DAY; }
export interface Week { start: number; end: number; label: string }
/** The last `n` weeks, oldest first; the last one is the current (partial) week. */
export function lastWeeks(n: number, now = Date.now()): Week[] {
  const cur = weekStart(now);
  return Array.from({ length: n }, (_, i) => { const start = cur - (n - 1 - i) * WEEK; return { start, end: start + WEEK, label: new Date(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }; });
}
const inWeek = (ms: number, w: Week) => ms >= w.start && ms < w.end;

/* ------------------------------------------------------------------ work flow */
export interface FlowWeek extends Week { raised: number; completed: number; failed: number; backlog: number }
/** Work raised and finished each week, and the open backlog at the end of each week. */
export function workFlow(wos: T.WorkOrder[], weeks: Week[], now = Date.now()): FlowWeek[] {
  return weeks.map(w => {
    const endMs = Math.min(w.end, now);
    return {
      ...w,
      raised: wos.filter(x => inWeek(t(x.createdAt), w)).length,
      completed: wos.filter(x => x.status === 'Completed' && inWeek(t(x.actualEnd), w)).length,
      failed: wos.filter(x => x.status === 'Failed' && inWeek(t(x.actualEnd), w)).length,
      // Open at the end of the week: raised before it, not cancelled, not finished before it.
      backlog: wos.filter(x => t(x.createdAt) < endMs && x.status !== 'Cancelled' && !(t(x.actualEnd) < endMs) && (isOpenWorkOrder(x) || !!x.actualEnd)).length,
    };
  });
}

/* ------------------------------------------------------------------ change outcomes */
export interface ChangeWeek extends Week { standard: number; normal: number; emergency: number; failed: number; withIssues: number; total: number; successPct: number | null }
/** Changes implemented each week by class, with failures and the success rate. */
export function changeOutcomes(changes: T.ChangeRequest[], weeks: Week[]): ChangeWeek[] {
  return weeks.map(w => {
    const done = changes.filter(c => ['Implemented', 'Closed', 'RolledBack'].includes(c.status) && inWeek(t(c.implementedAt ?? c.closedAt), w));
    const failed = done.filter(c => c.status === 'RolledBack' || c.review?.outcome === 'Failed' || c.review?.outcome === 'Rolled back').length;
    const by = (k: T.ChangeClass) => done.filter(c => changeClassOf(c) === k).length;
    return { ...w, standard: by('Standard'), normal: by('Normal'), emergency: by('Emergency'), failed, withIssues: done.filter(c => c.review?.outcome === 'Successful with issues').length, total: done.length, successPct: done.length ? ((done.length - failed) / done.length) * 100 : null };
  });
}
/** Median days from submission to implementation over the given changes. */
export function medianLeadDays(changes: T.ChangeRequest[]): number | null {
  const xs = changes.map(c => (t(c.implementedAt) - t(c.submittedAt ?? c.createdAt)) / DAY).filter(x => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  return xs.length ? xs[Math.floor(xs.length / 2)] : null;
}

/* ------------------------------------------------------------------ milestones */
export interface MilestoneWeek extends Week { due: number; onTime: number; late: number; pct: number | null }
/** Milestones due each week and how many were met (completed and not delayed). */
export function milestoneDelivery(ms: T.Milestone[], weeks: Week[], now = Date.now()): MilestoneWeek[] {
  return weeks.map(w => {
    const due = ms.filter(m => inWeek(t(m.dueDate), w) && t(m.dueDate) <= now);
    const onTime = due.filter(m => m.status === 'Completed').length;
    return { ...w, due: due.length, onTime, late: due.length - onTime, pct: due.length ? (onTime / due.length) * 100 : null };
  });
}

/* ------------------------------------------------------------------ portfolio health */
export const STAGES = ['Plan', 'Procure', 'Build', 'Commission', 'Live'] as const;
export const RAGS = ['Green', 'Amber', 'Red', 'Grey'] as const;
export type Matrix = Record<string, Record<string, ProjectRow[]>>;
/** Projects by delivery stage and health. */
export function healthMatrix(rows: ProjectRow[]): Matrix {
  const out: Matrix = {};
  for (const s of STAGES) { out[s] = {}; for (const r of RAGS) out[s][r] = []; }
  for (const row of rows) { const s = (STAGES as readonly string[]).includes(row.stage) ? row.stage : 'Plan'; const r = (RAGS as readonly string[]).includes(row.project.rag) ? row.project.rag : 'Grey'; out[s][r].push(row); }
  return out;
}

/* ------------------------------------------------------------------ programmes */
export interface ProgrammeBar { row: ProgrammeRow; completion: number; elapsed: number; spentPct: number; budget: number; spend: number; status: 'ahead' | 'on track' | 'behind' | 'not started' | 'done'; rag: 'Green' | 'Amber' | 'Red' | 'Grey' }
/** Work done against time elapsed and money spent, per programme. */
export function programmeBars(rows: ProgrammeRow[], now = Date.now()): ProgrammeBar[] {
  return rows.filter(r => r.projects.length).map(row => {
    const start = Math.min(...row.projects.map(p => t(p.plannedStart)));
    const end = Math.max(...row.projects.map(p => t(p.plannedEnd)));
    const elapsed = end > start ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 100;
    const budget = row.ev.bac || row.projects.reduce((a, p) => a + p.budget, 0);
    const spend = row.ev.ac || row.projects.reduce((a, p) => a + (p.actualSpend ?? 0), 0);
    const completion = row.completion;
    const status: ProgrammeBar['status'] = completion >= 99 ? 'done' : elapsed <= 0 ? 'not started' : completion >= elapsed + 5 ? 'ahead' : completion >= elapsed - 10 ? 'on track' : 'behind';
    const rag: ProgrammeBar['rag'] = row.projects.some(p => p.rag === 'Red') ? 'Red' : row.projects.some(p => p.rag === 'Amber') ? 'Amber' : row.projects.every(p => p.rag === 'Grey') ? 'Grey' : 'Green';
    return { row, completion, elapsed, spentPct: budget ? (spend / budget) * 100 : 0, budget, spend, status, rag };
  }).sort((a, b) => (a.status === 'behind' ? 0 : 1) - (b.status === 'behind' ? 0 : 1) || (b.elapsed - b.completion) - (a.elapsed - a.completion));
}

/* ------------------------------------------------------------------ next weeks */
export interface DayLoad { day: number; label: string; weekday: string; standard: number; normal: number; emergency: number; milestones: T.Milestone[]; freeze?: T.ChangeFreeze; changes: T.ChangeRequest[]; kitShort: number }
/** Change windows and milestones per day for the next `days` days; `kitShort` tells which changes' kit is not at the site. */
export function nextDays(d: DeliveryData, changes: T.ChangeRequest[], milestones: T.Milestone[], days: number, now = Date.now(), kitShort?: (c: T.ChangeRequest) => boolean): DayLoad[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => {
    const day = today.getTime() + i * DAY, end = day + DAY;
    const cs = changes.filter(c => c.scheduledStart && t(c.scheduledStart) >= day && t(c.scheduledStart) < end && !['Cancelled', 'Rejected'].includes(c.status));
    const by = (k: T.ChangeClass) => cs.filter(c => changeClassOf(c) === k).length;
    return {
      day, label: new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), weekday: new Date(day).toLocaleDateString('en-GB', { weekday: 'short' }),
      standard: by('Standard'), normal: by('Normal'), emergency: by('Emergency'), changes: cs, kitShort: kitShort ? cs.filter(kitShort).length : 0,
      milestones: milestones.filter(m => m.status !== 'Completed' && t(m.dueDate) >= day && t(m.dueDate) < end),
      freeze: d.changeFreezes.find(f => !f.dataCenterId && t(f.start) < end && t(f.end) > day),
    };
  });
}

/* ------------------------------------------------------------------ KPI helpers */
/** Sum of the last `n` values and of the `n` before them. */
export function lastVsPrev(values: number[], n: number): { last: number; prev: number; deltaPct: number | null } {
  const last = values.slice(-n).reduce((a, b) => a + b, 0), prev = values.slice(-2 * n, -n).reduce((a, b) => a + b, 0);
  return { last, prev, deltaPct: prev ? ((last - prev) / prev) * 100 : null };
}
/** Weighted rate over the last `n` buckets. */
export function rateOver<B>(xs: B[], n: number, num: (b: B) => number, den: (b: B) => number): number | null {
  const s = xs.slice(-n); const d = s.reduce((a, b) => a + den(b), 0); return d ? (s.reduce((a, b) => a + num(b), 0) / d) * 100 : null;
}
