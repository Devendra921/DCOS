/* Smoke test with assertions for the change management overview (/changes): builds the overview
   from the seed snapshot and checks that the numbers add up and agree with the Changes tab filters.
   Run: npx tsx scripts/change-overview-smoke.mts   (exits non-zero when a check fails) */
import { buildSnapshot } from '../src/mock/db/seed.ts';
import type * as T from '../src/mock/data/types.ts';
import { deliveryDataFromSnapshot, isOpenChange } from '../src/modules/delivery/lib/chainRules.ts';
import { linesOfChange, materialDataFromSnapshot, readinessOf } from '../src/modules/delivery/lib/materialRules.ts';
import { buildRows, calendarEntries, waitingSince } from '../src/modules/change/lib/model.ts';
import { availabilityIndex, materialsShort as isShort } from '../src/modules/change/lib/materialIndex.ts';
import { buildOverview, dateParam, isFailedChange, matchesFlag, overviewIdFlags, parseDateParam, stuckOf, OPEN_STAGES, type ChangeOverview } from '../src/modules/change/lib/overview.ts';

let failures = 0; let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) { failures++; console.log(`  FAIL ${msg}`); } };
const section = (name: string, fn: () => void) => { console.log(`\n# ${name}`); const before = failures; try { fn(); } catch (e) { failures++; console.log(`  FAIL threw: ${e instanceof Error ? e.stack : String(e)}`); } console.log(failures === before ? '  ok' : `  ${failures - before} failure(s)`); };
const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const pct = (x: number | null) => x === null || (finite(x) && x >= 0 && x <= 100);
/** Every number anywhere in the structure is finite (no NaN or Infinity); nulls are allowed. */
function noNaN(x: unknown, path: string, seen = new Set<unknown>()): string[] {
  if (typeof x === 'number') return Number.isFinite(x) ? [] : [path];
  if (!x || typeof x !== 'object' || seen.has(x)) return [];
  seen.add(x);
  if (x instanceof Set || x instanceof Map) return [];
  return Object.entries(x as Record<string, unknown>).flatMap(([k, v]) => noNaN(v, `${path}.${k}`, seen));
}

const snap = buildSnapshot('small') as unknown as Record<string, unknown>;
const d = deliveryDataFromSnapshot(snap);
const md = materialDataFromSnapshot(snap);
const now = Date.now();
const rows = buildRows(d, { name: 'Smoke Test' });
const entries = calendarEntries(d);
const devices = (snap.devices as T.Device[] | undefined) ?? [];
const rackOfDevice = new Map(devices.filter(x => x.rackId).map(x => [x.id, x.rackId!]));
// Same rule as kitIndex() in the delivery home model (not imported: it pulls in Vite-only modules).
const kitShort = (c: T.ChangeRequest) => { const s = readinessOf(linesOfChange(md, c), now).state; return s !== 'Ready' && s !== 'Not needed'; };
const availOf = availabilityIndex(md.materialLines);
const materialsShort = (c: T.ChangeRequest) => isShort(availOf(c));
const o: ChangeOverview = buildOverview({ d, rows, entries, now, rackOfDevice, kitShort, materialsShort });
const open = rows.filter(r => isOpenChange(r.c));

section('Data: enough history for the trends', () => {
  ok(rows.length >= 200, `the seed has a change history (${rows.length})`);
  ok(o.weeks.length === 12 && o.outcomes.length === 12 && o.lead.length === 12 && o.waiting.length === 12 && o.emergencyPct.length === 12, 'twelve weekly buckets in every series');
  ok(o.outcomes.filter(w => w.total > 0).length >= 10, `changes implemented in most weeks (${o.outcomes.filter(w => w.total > 0).length} of 12)`);
  ok(o.lead.some(w => w.totalDays !== null), 'lead times for normal changes exist');
});

section('No NaN anywhere; rates within 0–100', () => {
  const bad = noNaN(o, 'overview');
  ok(bad.length === 0, `no NaN or Infinity (${bad.slice(0, 5).join(', ')})`);
  ok(pct(o.kpi.success) && pct(o.kpi.successPrev) && pct(o.kpi.emergency) && pct(o.kpi.emergencyPrev), 'KPI rates within 0–100');
  ok(o.outcomes.every(w => pct(w.successPct)) && o.emergencyPct.every(pct), 'weekly rates within 0–100');
  ok([...o.failTypes, ...o.sites].every(g => pct(g.successPct)), 'group success rates within 0–100');
  ok(o.lead.every(w => [w.approveDays, w.implementDays, w.totalDays].every(x => x === null || (finite(x) && x >= 0))), 'lead times are non-negative days');
  ok(o.kpi.leadDays === null || o.kpi.leadDays >= 0, `median lead time (${o.kpi.leadDays?.toFixed(1)} d)`);
});

section('KPIs add up', () => {
  const last4 = o.outcomes.slice(-4);
  ok(o.kpi.implemented.last === last4.reduce((a, w) => a + w.total, 0), 'implemented = sum of the last four weeks');
  ok(o.kpi.byClass4.Standard + o.kpi.byClass4.Normal + o.kpi.byClass4.Emergency === o.kpi.implemented.last, 'classes add up to the implemented count');
  ok(o.outcomes.every(w => w.standard + w.normal + w.emergency === w.total && w.failed <= w.total), 'each week: classes add up, failures within the total');
  ok(o.kpi.failed.last <= o.kpi.implemented.last, 'failures within the implemented count');
  ok(o.kpi.waiting === rows.filter(r => r.current).length && o.kpi.waitingMine <= o.kpi.waiting && o.kpi.waitingOverdue <= o.kpi.waiting, 'approvals waiting = steps up for decision');
  ok(o.kpi.open === open.length, `open changes (${o.kpi.open})`);
  ok(o.kpi.suspended === d.standardChangeTemplates.filter(t => t.status === 'Suspended').length, 'suspended templates');
});

section('Pipeline: stages add up to the open changes', () => {
  ok(OPEN_STAGES.length === 6, 'six open stages');
  ok(o.stages.reduce((a, s) => a + s.count, 0) === open.length, `funnel total = open changes (${open.length})`);
  ok(o.stages.every(s => s.byClass.Standard + s.byClass.Normal + s.byClass.Emergency === s.count && s.stuck <= s.count), 'each stage: classes add up, stuck within the count');
  ok(o.stages.reduce((a, s) => a + s.stuck, 0) === open.filter(r => stuckOf(r, now)).length, 'stuck total matches the stuck filter');
  ok(o.stages.every(s => s.count === 0 || (s.medianDays !== null && s.oldestDays !== null && s.medianDays >= 0)), 'every non-empty stage has an age');
});

section('Approvals and change board', () => {
  ok(o.roles.reduce((a, r) => a + r.count, 0) === o.kpi.waiting, 'waiting by role adds up to approvals waiting');
  ok(o.roles.every(r => r.overdue <= r.count), 'overdue within each role');
  ok(o.boards.length === 8 && o.boards.filter(b => b.next).length === 1 && o.boards[o.boards.length - 1].next, 'seven past boards and the next one');
  ok(o.boards.every(b => b.approved + b.rejected <= b.heard && b.high <= b.heard && b.violations <= b.heard), 'board counts within the changes heard');
  ok(o.boards.every(b => new Date(b.date).getDay() === 4), 'boards fall on Thursdays');
  ok(o.boards.slice(0, -1).some(b => b.heard > 0), 'past boards heard changes');
  ok(o.waiting[o.waiting.length - 1] >= 0, 'waiting series ends with a count');
});

section('Next 14 days', () => {
  const w = o.watch;
  ok(w.days.length === 14, 'fourteen days');
  ok(w.days.reduce((a, x) => a + x.standard + x.normal + x.emergency, 0) === w.windows.length, `day bars add up to the open windows (${w.days.reduce((a, x) => a + x.standard + x.normal + x.emergency, 0)} of ${w.windows.length})`);
  ok(w.days.reduce((a, x) => a + x.kitShort, 0) === w.kitShort.length, 'kit-short per day adds up');
  ok(w.materialsShort.every(r => w.windows.includes(r) && materialsShort(r.c)), `materials-short windows are among the windows and short (${w.materialsShort.length})`);
  const flagged = rows.filter(r => matchesFlag('short', r, { now, ids: overviewIdFlags(o) })).length;
  ok(flagged === w.materialsShort.length, `?flag=short lists the materials-short windows (${flagged} = ${w.materialsShort.length})`);
  ok(o.attention.filter(a => a.reasons.includes('Materials short')).length === w.materialsShort.filter(r => isOpenChange(r.c)).length, 'every materials-short window is in the attention list');
  ok(w.inFreeze.length <= w.windows.length && w.kitShort.length <= w.windows.length && w.notApproved.length <= w.windows.length && w.highRisk.length <= w.windows.length, 'issues are among the windows');
  ok(w.clashes.every(c => c.a.siteId === c.b.siteId && c.shared.length > 0), 'clashes are at the same site and share equipment');
  ok(w.windows.length > 0, `windows booked in the next 14 days (${w.windows.length})`);
});

section('Breakdowns and lists', () => {
  ok(o.failTypes.every(g => g.failed <= g.done) && o.sites.every(g => g.failed + g.withIssues <= g.done), 'failures within the changes carried out');
  ok(o.sites.reduce((a, g) => a + g.open, 0) === open.filter(r => r.site).length, 'open changes per site add up');
  const failedInPeriod = rows.filter(r => matchesFlag('failed', r, { now, from: o.fromFail })).length;
  ok(o.failTypes.reduce((a, g) => a + g.failed, 0) === failedInPeriod, `failures by type = the failed filter for the period (${failedInPeriod})`);
  ok(o.templates.length === d.standardChangeTemplates.length && o.templates.every(t => t.recentFailed <= t.recent), 'every template listed; recent failures within recent use');
  ok(o.attention.every(a => a.reasons.length > 0 && isOpenChange(a.row.c)), 'attention rows are open and say why');
  ok(o.closeouts.every(c => !isOpenChange(c.row.c)), 'close-outs are implemented or rolled back');
  ok(o.recent.every(r => !isOpenChange(r.c)), 'recent outcomes are done');
});

section('Click-throughs: the filters behind the tiles give the same counts', () => {
  const from = o.from4;
  ok(parseDateParam(dateParam(from)) === from, 'from parameter round-trips');
  ok(rows.filter(r => matchesFlag('done', r, { now, from })).length === o.kpi.implemented.last, `?flag=done&from=${dateParam(from)} = implemented (${o.kpi.implemented.last})`);
  ok(rows.filter(r => matchesFlag('failed', r, { now, from })).length === o.kpi.failed.last, `?flag=failed&from=${dateParam(from)} = failed (${o.kpi.failed.last})`);
  ok(rows.filter(r => matchesFlag('closeout', r, { now })).length === o.closeouts.length, 'closeout filter = reviews outstanding');
  ok(rows.filter(r => matchesFlag('clash', r, { now, ids: { clash: o.watch.clashIds } })).length === o.watch.clashIds.size, 'clash filter = clashing changes');
  ok(o.roles.every(x => rows.filter(r => r.current?.approverRole === x.role).length === x.count), '?role= gives the count waiting on each role');
  ok(o.stages.every(s => rows.filter(r => r.c.status === s.status).length === s.count), '?status= gives each stage count');
  const idFlags = overviewIdFlags(o);
  ok(rows.filter(r => matchesFlag('attention', r, { now, ids: idFlags })).length === o.attention.length, 'attention filter = needs attention');
  ok(rows.filter(r => matchesFlag('next14', r, { now, ids: idFlags })).length === o.watch.windows.length, 'next14 filter = windows in the next 14 days');
  ok(o.failTypes.every(g => rows.filter(r => r.c.type === g.key && matchesFlag('failed', r, { now, from: o.fromFail })).length === g.failed), '?type=&flag=failed gives each type\'s failures');
  ok(rows.filter(r => isFailedChange(r.c)).length >= 1, 'the seed has failed changes');
});

section('Timing: the seed reads as of today', () => {
  const DAY = 864e5, HOUR = 36e5;
  const ms = (s?: string) => (s ? new Date(s).getTime() : NaN);
  const ids = (xs: { id: string }[]) => xs.slice(0, 5).map(x => x.id).join(', ');
  const done = d.changeRequests.filter(c => ['Implemented', 'Closed', 'RolledBack'].includes(c.status));
  const future = done.filter(c => [c.implementedAt, c.closedAt, c.review?.at].some(x => x && ms(x) > now));
  ok(future.length === 0, `no implemented, closed or reviewed change dated in the future (${ids(future)})`);
  const wos = d.workOrders.filter(w => ['Completed', 'Failed', 'Validated'].includes(w.status) && [w.actualEnd, w.signOff?.at].some(x => x && ms(x) > now));
  ok(wos.length === 0, `no finished work order dated in the future (${ids(wos)})`);
  const mws = d.maintenanceWindows.filter(w => w.status === 'Completed' && ms(w.scheduledEnd) > now);
  ok(mws.length === 0, `no completed window ends in the future (${ids(mws)})`);
  const decided = d.approvalSteps.filter(a => a.decidedAt && ms(a.decidedAt) > now);
  ok(decided.length === 0, `no approval decided in the future (${ids(decided)})`);
  const order = (c: T.ChangeRequest) => { const seq = [c.createdAt, c.submittedAt, c.approvedAt, c.implementedAt, c.closedAt].filter(Boolean).map(ms); return seq.every((x, i) => i === 0 || x >= seq[i - 1]); };
  const bad = d.changeRequests.filter(c => !order(c));
  ok(bad.length === 0, `createdAt ≤ submittedAt ≤ approvedAt ≤ implementedAt ≤ closedAt (${bad.length}: ${ids(bad)})`);
  const openApproved = d.changeRequests.filter(c => ['Approved', 'Scheduled', 'InProgress'].includes(c.status));
  ok(openApproved.every(c => c.approvedAt && ms(c.approvedAt) <= now), 'approved changes were approved in the past');
  const boarded = openApproved.filter(c => c.changeClass === 'Normal' && c.cabDate && c.scheduledStart);
  ok(boarded.every(c => ms(c.cabDate) <= now && ms(c.scheduledStart) >= ms(c.cabDate)), `approved normal changes: heard at a past board, window after it (${ids(boarded.filter(c => !(ms(c.cabDate) <= now && ms(c.scheduledStart) >= ms(c.cabDate))))})`);
  const live = rows.filter(r => r.c.status === 'InProgress');
  ok(live.every(r => r.cls === 'Emergency' || (ms(r.start) - HOUR <= now && ms(r.end) >= now)), `work in progress started within its window, which is still open (${ids(live.filter(r => !(ms(r.start) - HOUR <= now && ms(r.end) >= now)).map(r => r.c))})`);
  const woOff = d.changeRequests.filter(c => c.scheduledStart && c.workOrderId).filter(c => { const w = d.workOrders.find(x => x.id === c.workOrderId); return w && w.plannedStart !== c.scheduledStart; });
  ok(woOff.length === 0, `work orders planned in their change's window (${ids(woOff)})`);
  // Approvals wait for different lengths of time, some past the SLA.
  const waits = rows.filter(r => r.current).map(r => (now - ms(waitingSince(r.c, r.steps, r.current!))) / DAY);
  ok(waits.length > 0 && (o.kpi.oldestWaitDays ?? 0) >= 3, `oldest approval wait ≥ 3 days (${o.kpi.oldestWaitDays})`);
  ok(new Set(waits.map(Math.floor)).size >= 3, `approval waits spread over several days (${waits.map(x => x.toFixed(1)).join(' ')})`);
  ok(waits.every(x => x >= 0 && x <= 10), 'approval waits within ten days');
  const drafts = rows.filter(r => r.c.status === 'Draft').map(r => (now - ms(r.c.createdAt)) / DAY).sort((a, b) => a - b);
  const medDraft = drafts.length ? drafts[Math.floor(drafts.length / 2)] : 0;
  ok(drafts.length > 0 && medDraft < 30, `drafts median age < 30 days (${medDraft.toFixed(1)})`);
  ok(drafts.every(x => x >= 0 && x <= 30), `drafts raised within the last month (${drafts.map(x => x.toFixed(0)).join(' ')})`);
  for (const s of o.stages.filter(x => ['Submitted', 'UnderReview', 'Approved', 'Scheduled'].includes(x.status) && x.count)) ok((s.medianDays ?? 0) >= 1, `${s.label}: median ≥ 1 day in stage (${s.medianDays?.toFixed(1)})`);
  // Windows over the next 14 days are spread out, not bunched on one day.
  const per = o.watch.days.map(x => x.standard + x.normal + x.emergency);
  const total = per.reduce((a, b) => a + b, 0);
  ok(per.filter(n => n > 0).length >= 8, `windows on ≥ 8 of the next 14 days (${per.join(' ')})`);
  ok(total > 0 && Math.max(...per) <= 0.3 * total, `no day has more than 30% of the windows (max ${Math.max(...per)} of ${total})`);
  ok(o.watch.clashes.length > 0 && o.watch.inFreeze.length > 0 && o.watch.inFreeze.length < o.watch.windows.length / 2, `some clashes and some windows in a freeze, not most (${o.watch.clashes.length} clashes, ${o.watch.inFreeze.length} in a freeze)`);
});

console.log(`\nfunnel ${o.stages.map(s => `${s.label} ${s.count}${s.stuck ? ` (${s.stuck} stuck)` : ''}`).join(' · ')}`);
console.log(`kpi success ${o.kpi.success?.toFixed(0)}% · implemented ${o.kpi.implemented.last} · lead ${o.kpi.leadDays?.toFixed(1)} d · emergency ${o.kpi.emergency?.toFixed(0)}% · waiting ${o.kpi.waiting} (oldest ${o.kpi.oldestWaitDays} d) · failed ${o.kpi.failed.last}`);
console.log(`next 14 days ${o.watch.windows.length} windows · ${o.watch.clashes.length} clashes · ${o.watch.inFreeze.length} in a freeze · ${o.watch.kitShort.length} kit short · ${o.watch.materialsShort.length} materials short · ${o.watch.notApproved.length} not approved`);
console.log(`attention ${o.attention.length} · close-outs ${o.closeouts.length} · boards ${o.boards.map(b => `${b.label}:${b.heard}`).join(' ')}`);
console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
