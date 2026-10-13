/**
 * Change overview — the series and lists behind the change management overview (/changes).
 *
 * Pure: every figure is computed from the change rows (`buildRows`), the calendar entries
 * (`calendarEntries`) and the delivery bundle, with `now` passed in. The page supplies kit
 * readiness and material availability (advisory; lib/materialIndex.ts) and the device → rack map for clashes; scripts build the same
 * from the seed snapshot (scripts/change-overview-smoke.mts).
 *
 * The Changes tab reads the same predicates (`matchesFlag`, `stuckOf`, `isDone`, …) so a number
 * on the overview and the list it links to always agree.
 */
import type * as T from '../../../mock/data/types';
import { changeClassOf, isOpenChange, OPEN_CHANGE, type DeliveryData } from '../../delivery/lib/chainRules';
import { changeOutcomes, lastVsPrev, lastWeeks, nextDays, rateOver, weekStart, type ChangeWeek, type DayLoad, type Week } from '../../delivery/components/overview/trends';
import { boardAgenda, calendarClashes, CHANGE_TYPE_LABEL, nextBoardMeeting, roleLabel, siteLabel, STATUS_LABEL, waitingSince, type CalClash, type CalEntry, type ChangeRow, type ChangeStatus } from './model';

const DAY = 864e5;
const t = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);
const days = (ms: number) => Math.max(0, Math.floor(ms / DAY));

/** A decision step waiting longer than this is overdue. */
export const APPROVAL_SLA_DAYS = 3;
/** A draft not submitted after this many days is stale. */
export const DRAFT_STALE_DAYS = 14;
/** An approved change with no window booked after this many days is stalled. */
export const NO_WINDOW_DAYS = 7;
/** Weeks behind the "where changes fail" and site breakdowns. */
export const FAILURE_WEEKS = 26;

/* ------------------------------------------------------------------ shared predicates */
export const isDone = (c: T.ChangeRequest) => c.status === 'Implemented' || c.status === 'Closed' || c.status === 'RolledBack';
/** When the change was carried out (as the delivery overview counts it). */
export const doneAt = (c: T.ChangeRequest) => t(c.implementedAt ?? c.closedAt);
/** Failed: rolled back, or the review says it failed or was rolled back. */
export const isFailedChange = (c: T.ChangeRequest) => c.status === 'RolledBack' || c.review?.outcome === 'Failed' || c.review?.outcome === 'Rolled back';
export const isHighRisk = (c: T.ChangeRequest) => c.risk === 'High' || c.risk === 'Critical';
export const awaitingDecision = (c: T.ChangeRequest) => c.status === 'Submitted' || c.status === 'UnderReview';
/** Implemented or rolled back and not closed yet, or a review is due (emergency and failed changes). */
export const needsCloseout = (r: ChangeRow) => r.reviewDue || ((r.c.status === 'Implemented' || r.c.status === 'RolledBack') && !r.c.closedAt);

/** The open stages in pipeline order (the same statuses as `OPEN_CHANGE`). */
export const OPEN_STAGES = OPEN_CHANGE as readonly ChangeStatus[];

/** When the change entered its current open stage. */
export function stageSince(r: ChangeRow): number {
  const c = r.c;
  switch (c.status) {
    case 'Draft': return t(c.createdAt);
    case 'Submitted': case 'UnderReview': return t(c.submittedAt ?? c.updatedAt);
    case 'Approved': case 'Scheduled': return t(c.approvedAt ?? c.submittedAt ?? c.updatedAt);
    case 'InProgress': return t(r.start ?? c.approvedAt ?? c.updatedAt);
    default: return t(c.updatedAt);
  }
}
/** Why an open change is stuck in its stage, in plain words; undefined when it is moving. */
export function stuckOf(r: ChangeRow, now: number): string | undefined {
  const c = r.c;
  const end = t(r.end ?? r.start);
  switch (c.status) {
    case 'Draft': { const n = days(now - t(c.createdAt)); return n > DRAFT_STALE_DAYS ? `Draft for ${n} days, not submitted` : undefined; }
    case 'Submitted': case 'UnderReview': {
      const since = r.current ? waitingSince(c, r.steps, r.current) : c.submittedAt ?? c.updatedAt;
      const n = days(now - t(since));
      return n > APPROVAL_SLA_DAYS ? `Waiting ${n} days for ${r.current ? roleLabel(r.current.approverRole).toLowerCase() : 'a decision'}` : undefined;
    }
    case 'Approved': case 'Scheduled': {
      if (Number.isFinite(end) && end < now) return `Window ended ${days(now - end)} days ago, work not started`;
      if (!r.start) { const n = days(now - stageSince(r)); return n > NO_WINDOW_DAYS ? `Approved ${n} days ago, no window booked` : undefined; }
      return undefined;
    }
    case 'InProgress': return Number.isFinite(end) && end < now ? `Window ended ${days(now - end)} days ago, still in progress` : undefined;
    default: return undefined;
  }
}

/** End of the current week: dated counts run to here, as the weekly trends do. */
export const periodEnd = (now: number) => weekStart(now) + 7 * DAY;

/** Filters the Changes tab understands under `?flag=` (with `?from=` for the dated ones). */
export const FLAG_LABEL: Record<string, string> = {
  review: 'Emergency review due', freeze: 'In a freeze', failed: 'Failed or rolled back', week: 'Window this week', done: 'Implemented',
  stuck: 'Stuck in its stage', closeout: 'Awaiting review or closure', attention: 'Needs attention',
  next14: 'Window in the next 14 days', clash: 'Window clashes, next 14 days', kit: 'Kit not at site, next 14 days', short: 'Materials short, next 14 days', freeze14: 'In a freeze, next 14 days',
  pending14: 'Not approved, window in 14 days', risk14: 'High risk, window in 14 days',
};
export interface FlagContext { now: number; /** Start of the period for `done` and `failed` (ms). */ from?: number; /** Flags that are a set of change ids worked out by the page. */ ids?: Record<string, Set<string> | undefined> }
/** Whether a row passes a `?flag=` filter. Unknown flags pass everything. */
export function matchesFlag(flag: string, r: ChangeRow, ctx: FlagContext): boolean {
  switch (flag) {
    case 'review': return r.cls === 'Emergency' && r.reviewDue;
    case 'freeze': return !!r.freeze && isOpenChange(r.c);
    case 'done': return isDone(r.c) && doneAt(r.c) >= (ctx.from ?? ctx.now - 28 * DAY) && doneAt(r.c) < periodEnd(ctx.now);
    case 'failed': return isDone(r.c) && isFailedChange(r.c) && doneAt(r.c) >= (ctx.from ?? ctx.now - 30 * DAY) && doneAt(r.c) < periodEnd(ctx.now);
    case 'stuck': return isOpenChange(r.c) && !!stuckOf(r, ctx.now);
    case 'closeout': return needsCloseout(r);
    default: { const ids = ctx.ids?.[flag]; return ids ? ids.has(r.c.id) : true; }
  }
}
/** `YYYY-MM-DD` of a local date, for `?from=`. */
export const dateParam = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Local midnight of a `YYYY-MM-DD` parameter; undefined when it does not parse. */
export const parseDateParam = (s?: string | null) => { const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : undefined; };

const median = (xs: number[]): number | null => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* ------------------------------------------------------------------ lead time */
export interface LeadWeek extends Week { n: number; approveDays: number | null; implementDays: number | null; totalDays: number | null }
const leadParts = (c: T.ChangeRequest) => {
  const sub = t(c.submittedAt ?? c.createdAt), appr = t(c.approvedAt), impl = t(c.implementedAt);
  const ok = (x: number) => (Number.isFinite(x) && x >= 0 ? x / DAY : NaN);
  return { approve: ok(appr - sub), implement: ok(impl - appr), total: ok(impl - sub) };
};
/** Median days from submission to approval and from approval to implementation, per week of implementation. */
export function leadTimes(changes: T.ChangeRequest[], weeks: Week[], cls: T.ChangeClass = 'Normal'): LeadWeek[] {
  return weeks.map(w => {
    const xs = changes.filter(c => isDone(c) && changeClassOf(c) === cls && c.implementedAt && t(c.implementedAt) >= w.start && t(c.implementedAt) < w.end).map(leadParts);
    return { ...w, n: xs.length, approveDays: median(xs.map(x => x.approve)), implementDays: median(xs.map(x => x.implement)), totalDays: median(xs.map(x => x.total)) };
  });
}
/** Medians over the normal changes implemented in [from, to). */
const leadOver = (changes: T.ChangeRequest[], from: number, to: number) => {
  const xs = changes.filter(c => isDone(c) && changeClassOf(c) === 'Normal' && t(c.implementedAt) >= from && t(c.implementedAt) < to).map(leadParts);
  return { total: median(xs.map(x => x.total)), approve: median(xs.map(x => x.approve)), implement: median(xs.map(x => x.implement)) };
};

/* ------------------------------------------------------------------ approvals */
/** Changes waiting for a decision at the end of each week (submitted before it, not yet decided by then). */
export function waitingSeries(changes: T.ChangeRequest[], weeks: Week[], now: number): number[] {
  const decided = (c: T.ChangeRequest) => t(c.approvedAt ?? (c.status === 'Rejected' || c.status === 'Cancelled' ? c.updatedAt : c.implementedAt ?? c.closedAt));
  return weeks.map(w => { const end = Math.min(w.end, now); return changes.filter(c => c.submittedAt && t(c.submittedAt) < end && c.status !== 'Draft' && !(decided(c) < end)).length; });
}
export interface RoleWait { role: string; label: string; count: number; overdue: number; oldestDays: number }
/** Steps waiting for a decision, by the approver role they wait on. */
export function waitingByRole(rows: ChangeRow[], now: number): RoleWait[] {
  const m = new Map<string, RoleWait>();
  for (const r of rows) {
    if (!r.current) continue;
    const role = r.current.approverRole;
    const n = days(now - t(waitingSince(r.c, r.steps, r.current)));
    const x = m.get(role) ?? { role, label: roleLabel(role), count: 0, overdue: 0, oldestDays: 0 };
    x.count++; if (n > APPROVAL_SLA_DAYS) x.overdue++; x.oldestDays = Math.max(x.oldestDays, n);
    m.set(role, x);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.oldestDays - a.oldestDays);
}

/* ------------------------------------------------------------------ change board */
export interface Board { date: number; label: string; next: boolean; heard: number; approved: number; rejected: number; carried: number; high: number; violations: number; rows: ChangeRow[] }
const dayKey = (ms: number) => dateParam(ms);
/** The last `past` weekly change boards (normal changes booked for each, and how they were decided) and the next board's agenda. */
export function boardLoad(rows: ChangeRow[], now: number, past = 7): Board[] {
  const next = nextBoardMeeting(new Date(now));
  const normal = rows.filter(r => r.cls === 'Normal' && r.c.cabDate);
  const label = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const out: Board[] = [];
  for (let k = past; k >= 1; k--) {
    const d = new Date(next); d.setDate(d.getDate() - 7 * k);
    const on = normal.filter(r => dayKey(t(r.c.cabDate)) === dayKey(d.getTime()));
    const rejected = on.filter(r => r.c.status === 'Rejected').length;
    const carried = on.filter(r => awaitingDecision(r.c) || r.c.status === 'Draft').length;
    out.push({ date: d.getTime(), label: label(d), next: false, heard: on.length, approved: on.filter(r => !!r.c.approvedAt && r.c.status !== 'Rejected').length, rejected, carried, high: on.filter(r => isHighRisk(r.c)).length, violations: on.filter(r => r.c.policyViolations?.length).length, rows: on });
  }
  const agenda = boardAgenda(rows, next);
  out.push({ date: next.getTime(), label: label(next), next: true, heard: agenda.length, approved: 0, rejected: 0, carried: agenda.filter(r => r.c.cabDate && t(r.c.cabDate) < next.getTime() - DAY).length, high: agenda.filter(r => isHighRisk(r.c)).length, violations: agenda.filter(r => r.c.policyViolations?.length).length, rows: agenda });
  return out;
}

/* ------------------------------------------------------------------ pipeline */
export interface Stage { status: ChangeStatus; label: string; count: number; stuck: number; byClass: Record<T.ChangeClass, number>; medianDays: number | null; oldestDays: number | null }
/** Open changes by stage, with how long they have been there and how many are stuck. */
export function pipeline(rows: ChangeRow[], now: number): Stage[] {
  return OPEN_STAGES.map(status => {
    const rs = rows.filter(r => r.c.status === status);
    const ages = rs.map(r => (now - stageSince(r)) / DAY).filter(Number.isFinite);
    return {
      status, label: STATUS_LABEL[status], count: rs.length, stuck: rs.filter(r => stuckOf(r, now)).length,
      byClass: { Standard: rs.filter(r => r.cls === 'Standard').length, Normal: rs.filter(r => r.cls === 'Normal').length, Emergency: rs.filter(r => r.cls === 'Emergency').length },
      medianDays: median(ages), oldestDays: ages.length ? Math.max(0, Math.floor(Math.max(...ages))) : null,
    };
  });
}

/* ------------------------------------------------------------------ next 14 days */
export interface WindowWatch { days: DayLoad[]; windows: ChangeRow[]; clashes: CalClash[]; clashIds: Set<string>; inFreeze: ChangeRow[]; kitShort: ChangeRow[]; materialsShort: ChangeRow[]; notApproved: ChangeRow[]; highRisk: ChangeRow[] }
/** Change windows in the next `n` days and what stands in their way: clashes, freezes, kit not at site, materials short at the supply chain platform, approval still pending. */
export function windowWatch(d: DeliveryData, rows: ChangeRow[], entries: CalEntry[], now: number, n = 14, opts: { rackOfDevice?: Map<string, string>; kitShort?: (c: T.ChangeRequest) => boolean; materialsShort?: (c: T.ChangeRequest) => boolean } = {}): WindowWatch {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const from = today.getTime(), to = from + n * DAY;
  const windows = rows.filter(r => isOpenChange(r.c) && r.start && t(r.start) >= from && t(r.start) < to).sort((a, b) => a.start!.localeCompare(b.start!));
  const clashes = calendarClashes(entries.filter(e => t(e.end) > from && t(e.start) < to), opts.rackOfDevice);
  const clashIds = new Set(clashes.flatMap(x => [x.a.changeId, x.b.changeId]).filter((x): x is string => !!x));
  return {
    // Placed on the day its window starts (the maintenance window when booked, else the change's own dates).
    days: nextDays(d, windows.map(r => ({ ...r.c, scheduledStart: r.start })), [], n, now, opts.kitShort),
    windows, clashes, clashIds,
    inFreeze: windows.filter(r => r.freeze),
    kitShort: opts.kitShort ? windows.filter(r => opts.kitShort!(r.c)) : [],
    materialsShort: opts.materialsShort ? windows.filter(r => opts.materialsShort!(r.c)) : [],
    notApproved: windows.filter(r => r.c.status === 'Draft' || awaitingDecision(r.c)),
    highRisk: windows.filter(r => isHighRisk(r.c)),
  };
}

/* ------------------------------------------------------------------ failures and breakdowns */
export interface Group { key: string; label: string; done: number; failed: number; withIssues: number; successPct: number | null; open: number }
function groupDone(rows: ChangeRow[], from: number, now: number, keyOf: (r: ChangeRow) => string | undefined, labelOf: (r: ChangeRow) => string): Group[] {
  const m = new Map<string, Group>();
  const get = (r: ChangeRow) => { const k = keyOf(r); if (!k) return undefined; let g = m.get(k); if (!g) { g = { key: k, label: labelOf(r), done: 0, failed: 0, withIssues: 0, successPct: null, open: 0 }; m.set(k, g); } return g; };
  for (const r of rows) {
    if (isOpenChange(r.c)) { const g = get(r); if (g) g.open++; continue; }
    if (!isDone(r.c) || !(doneAt(r.c) >= from && doneAt(r.c) < periodEnd(now))) continue;
    const g = get(r); if (!g) continue;
    g.done++; if (isFailedChange(r.c)) g.failed++; else if (r.c.review?.outcome === 'Successful with issues') g.withIssues++;
  }
  for (const g of m.values()) g.successPct = g.done ? ((g.done - g.failed) / g.done) * 100 : null;
  return [...m.values()];
}
/** Changes carried out since `from` by change type: how many, how many failed. */
export const failuresByType = (rows: ChangeRow[], from: number, now: number) =>
  groupDone(rows, from, now, r => r.c.type, r => CHANGE_TYPE_LABEL[r.c.type] ?? r.c.type).filter(g => g.done).sort((a, b) => b.failed - a.failed || (a.successPct ?? 100) - (b.successPct ?? 100) || b.done - a.done);
/** Per site: changes carried out since `from` (and how they went) and changes open now. */
export const bySite = (rows: ChangeRow[], from: number, now: number) =>
  groupDone(rows, from, now, r => r.site?.id, r => siteLabel(r.site)).sort((a, b) => b.done + b.open - (a.done + a.open) || a.label.localeCompare(b.label));

export interface TemplateHealth { t: T.StandardChangeTemplate; used: number; failed: number; recent: number; recentFailed: number; reviewOverdue: boolean }
/** Standard templates: lifetime use and failures (from the template), use since `from`, and review status. */
export function templateHealth(templates: T.StandardChangeTemplate[], rows: ChangeRow[], from: number, now: number): TemplateHealth[] {
  return templates.map(tp => {
    const rs = rows.filter(r => r.c.standardTemplateId === tp.id && isDone(r.c) && doneAt(r.c) >= from && doneAt(r.c) < periodEnd(now));
    return { t: tp, used: tp.usedCount, failed: tp.failedCount, recent: rs.length, recentFailed: rs.filter(r => isFailedChange(r.c)).length, reviewOverdue: tp.status === 'Active' && t(tp.reviewDue) < now };
  }).sort((a, b) => (a.t.status === 'Suspended' ? 0 : 1) - (b.t.status === 'Suspended' ? 0 : 1) || b.failed - a.failed || (b.reviewOverdue ? 1 : 0) - (a.reviewOverdue ? 1 : 0) || b.used - a.used);
}

/* ------------------------------------------------------------------ lists for the details */
export interface Attention { row: ChangeRow; reasons: string[]; rank: number }
/** Open changes that need someone: stuck in their stage, in a freeze, clashing, kit not at site, materials short, high risk soon, policy warnings. */
export function attention(rows: ChangeRow[], watch: WindowWatch, now: number): Attention[] {
  const soon = now + 7 * DAY;
  const kit = new Set(watch.kitShort.map(r => r.c.id));
  const short = new Set(watch.materialsShort.map(r => r.c.id));
  const out: Attention[] = [];
  for (const r of rows) {
    if (!isOpenChange(r.c)) continue;
    const reasons: string[] = []; let rank = 9;
    const stuck = stuckOf(r, now);
    if (stuck) { reasons.push(stuck); rank = Math.min(rank, 1); }
    if (r.freeze) { reasons.push(r.cls === 'Emergency' ? `In ${r.freeze.name} (emergency, allowed)` : `Window in ${r.freeze.name}`); if (r.cls !== 'Emergency') rank = Math.min(rank, 0); }
    if (watch.clashIds.has(r.c.id)) { reasons.push('Window clashes with another change'); rank = Math.min(rank, 0); }
    if (kit.has(r.c.id)) { reasons.push('Kit not at site'); rank = Math.min(rank, 2); }
    if (short.has(r.c.id)) { reasons.push('Materials short'); rank = Math.min(rank, 2); }
    if (isHighRisk(r.c) && r.start && t(r.start) >= now - DAY && t(r.start) < soon) { reasons.push(`${r.c.risk} risk, window within 7 days`); rank = Math.min(rank, 3); }
    if (r.c.policyViolations?.length) { reasons.push(`${r.c.policyViolations.length} policy warning${r.c.policyViolations.length === 1 ? '' : 's'}`); rank = Math.min(rank, 4); }
    if (reasons.length) out.push({ row: r, reasons, rank });
  }
  return out.sort((a, b) => a.rank - b.rank || b.reasons.length - a.reasons.length || (a.row.start ?? '9').localeCompare(b.row.start ?? '9'));
}
export interface Closeout { row: ChangeRow; reason: string; sinceDays: number | null }
/** Implemented or rolled-back changes still waiting for their review or closure, oldest first. */
export function closeouts(rows: ChangeRow[], now: number): Closeout[] {
  return rows.filter(needsCloseout).map(r => {
    const at = doneAt(r.c);
    const reason = r.reviewDue ? (r.cls === 'Emergency' ? 'Emergency review due' : 'Failure review due') : r.c.status === 'RolledBack' ? 'Rolled back, not closed' : 'Implemented, not closed';
    return { row: r, reason, sinceDays: Number.isFinite(at) ? days(now - at) : null };
  }).sort((a, b) => (b.row.reviewDue ? 1 : 0) - (a.row.reviewDue ? 1 : 0) || (b.sinceDays ?? 0) - (a.sinceDays ?? 0));
}

/** The `?flag=` filters that are sets of change ids worked out here (passed to the Changes tab). */
export function overviewIdFlags(o: Pick<ChangeOverview, 'watch' | 'attention'>): Record<string, Set<string>> {
  const ids = (rs: ChangeRow[]) => new Set(rs.map(r => r.c.id));
  const w = o.watch;
  return { next14: ids(w.windows), clash: w.clashIds, kit: ids(w.kitShort), short: ids(w.materialsShort), freeze14: ids(w.inFreeze), pending14: ids(w.notApproved), risk14: ids(w.highRisk), attention: ids(o.attention.map(a => a.row)) };
}

/* ------------------------------------------------------------------ the overview */
export interface OverviewInput {
  d: DeliveryData; rows: ChangeRow[]; entries: CalEntry[]; now: number;
  rackOfDevice?: Map<string, string>;
  /** Is the change's kit short at the site (materials readiness; advisory)? */
  kitShort?: (c: T.ChangeRequest) => boolean;
  /** Does the supply chain platform's availability answer leave the change's materials short (advisory)? */
  materialsShort?: (c: T.ChangeRequest) => boolean;
}
export interface ChangeOverview {
  weeks: Week[]; outcomes: ChangeWeek[]; lead: LeadWeek[]; waiting: number[]; emergencyPct: (number | null)[];
  kpi: {
    success: number | null; successPrev: number | null;
    implemented: { last: number; prev: number; deltaPct: number | null }; byClass4: Record<T.ChangeClass, number>;
    failed: { last: number; prev: number; deltaPct: number | null };
    leadDays: number | null; leadPrev: number | null; leadApprove: number | null; leadImplement: number | null;
    emergency: number | null; emergencyPrev: number | null;
    waiting: number; waitingMine: number; waitingOverdue: number; oldestWaitDays: number | null;
    suspended: number; open: number;
  };
  /** Start of the last four weeks (the KPI period) and of the failure period. */
  from4: number; fromFail: number;
  stages: Stage[]; roles: RoleWait[]; boards: Board[]; watch: WindowWatch;
  failTypes: Group[]; sites: Group[]; templates: TemplateHealth[];
  attention: Attention[]; closeouts: Closeout[]; recent: ChangeRow[];
}
export function buildOverview({ d, rows, entries, now, rackOfDevice, kitShort, materialsShort }: OverviewInput): ChangeOverview {
  const changes = rows.map(r => r.c);
  const weeks = lastWeeks(12, now);
  const outcomes = changeOutcomes(changes, weeks);
  const from4 = weeks[weeks.length - 4].start, from8 = weeks[weeks.length - 8].start;
  const fromFail = weekStart(now) - (FAILURE_WEEKS - 1) * 7 * DAY;
  const weekEnd = weeks[weeks.length - 1].end;
  const sum = (ws: ChangeWeek[], k: 'standard' | 'normal' | 'emergency') => ws.reduce((a, w) => a + w[k], 0);
  const last4 = outcomes.slice(-4);
  const waitingRows = rows.filter(r => r.current);
  const waits = waitingRows.map(r => days(now - t(waitingSince(r.c, r.steps, r.current!))));
  const watch = windowWatch(d, rows, entries, now, 14, { rackOfDevice, kitShort, materialsShort });
  const lead4 = leadOver(changes, from4, weekEnd);
  return {
    weeks, outcomes, lead: leadTimes(changes, weeks), waiting: waitingSeries(changes, weeks, now),
    emergencyPct: outcomes.map(w => (w.total ? (w.emergency / w.total) * 100 : null)),
    kpi: {
      success: rateOver(outcomes, 4, w => w.total - w.failed, w => w.total), successPrev: rateOver(outcomes.slice(0, -4), 4, w => w.total - w.failed, w => w.total),
      implemented: lastVsPrev(outcomes.map(w => w.total), 4),
      byClass4: { Standard: sum(last4, 'standard'), Normal: sum(last4, 'normal'), Emergency: sum(last4, 'emergency') },
      failed: lastVsPrev(outcomes.map(w => w.failed), 4),
      leadDays: lead4.total, leadPrev: leadOver(changes, from8, from4).total, leadApprove: lead4.approve, leadImplement: lead4.implement,
      emergency: rateOver(outcomes, 4, w => w.emergency, w => w.total), emergencyPrev: rateOver(outcomes.slice(0, -4), 4, w => w.emergency, w => w.total),
      waiting: waitingRows.length, waitingMine: waitingRows.filter(r => r.mine).length, waitingOverdue: waits.filter(n => n > APPROVAL_SLA_DAYS).length, oldestWaitDays: waits.length ? Math.max(...waits) : null,
      suspended: d.standardChangeTemplates.filter(x => x.status === 'Suspended').length, open: rows.filter(r => isOpenChange(r.c)).length,
    },
    from4, fromFail,
    stages: pipeline(rows, now), roles: waitingByRole(rows, now), boards: boardLoad(rows, now), watch,
    failTypes: failuresByType(rows, fromFail, now), sites: bySite(rows, fromFail, now), templates: templateHealth(d.standardChangeTemplates, rows, fromFail, now),
    attention: attention(rows, watch, now), closeouts: closeouts(rows, now),
    recent: rows.filter(r => isDone(r.c) && doneAt(r.c) >= now - 28 * DAY && doneAt(r.c) <= now).sort((a, b) => doneAt(b.c) - doneAt(a.c)),
  };
}
