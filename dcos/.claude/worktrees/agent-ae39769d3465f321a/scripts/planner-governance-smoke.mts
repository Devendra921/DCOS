/* Governance and lifecycle smoke test with assertions: approval path per template and amount band,
   segregation of duties, ordered decisions, delegation, resubmission rounds, withdrawal, baseline,
   reservations (written → committed → consumed / released), close-out gate, revisions, wizard save
   rules, status transitions and the delivery process choice. Exits non-zero on any failure.
   Run: npx tsx scripts/planner-governance-smoke.mts */
import { buildSnapshot } from '../src/mock/db/seed';
import { evaluate, fmtUsd } from '../src/modules/planner/lib/engine';
import { buildBom } from '../src/modules/planner/lib/outputs';
import { plannerDataFromSnapshot } from '../src/modules/planner/lib/plannerData';
import { siteBaseline, planAddedKw } from '../src/modules/planner/lib/site';
import * as G from '../src/modules/planner/lib/governance';
import { moveReservations, reservationExpiry, reservationRequests, writeReservations, type Store } from '../src/modules/planner/lib/reservations';
import { closeoutChecks, closeoutReady, deliveryView } from '../src/modules/planner/lib/closeout';
import { deliveryProcessFor } from '../src/modules/planner/lib/execute';
import type * as T from '../src/mock/data/types';

let failures = 0; let passes = 0;
const check = (cond: unknown, msg: string) => { if (cond) passes++; else { failures++; console.log(`  FAIL ${msg}`); } };
const section = (s: string) => console.log(`\n== ${s}`);

const tables = buildSnapshot('small') as unknown as Record<string, Record<string, unknown>[]>;
const store: Store = {
  list: e => (tables[e] ??= []),
  get: (e, id) => (tables[e] ?? []).find(r => r.id === id),
  create: (e, rec) => { (tables[e] ??= []).push(rec); },
  update: (e, id, patch) => { const r = (tables[e] ?? []).find(x => x.id === id); if (r) Object.assign(r, patch); },
};
const dataNow = () => plannerDataFromSnapshot(tables);
const templates = tables.plannerTemplates as unknown as T.PlannerTemplate[];
const benchmarks = tables.plannerBenchmarks as unknown as T.PlannerBenchmark[];
const tpl = (id: string) => templates.find(t => t.id === id)!;
const plan = (pln: string) => (tables.plannerPlans as unknown as T.PlannerPlan[]).find(p => p.plnId === pln)!;
const at = new Date().toISOString();
const meta = { customerId: 'CUST-001', isDeleted: false, createdAt: at, updatedAt: at, createdBy: 'Smoke', createdById: 'U00' };
const roles = (a: T.PlannerApproval[]) => a.map(x => x.role);

/* ------------------------------------------------------------------ 1. approval path */
section('Approval path per template and amount band');
const AMOUNTS = [30_000, 200_000, 600_000, 5_000_000];
const BAND_ROLES: Record<number, string[]> = { 30_000: ['Capacity Planner'], 200_000: ['Finance Manager'], 600_000: ['Finance Manager', 'Facilities Director'], 5_000_000: ['Finance Manager', 'Executive'] };
for (const t of templates.filter(x => x.kind === 'plan')) {
  for (const amt of AMOUNTS) {
    const { approvals, band } = G.buildApprovalPath(t, amt);
    check(BAND_ROLES[amt].every(r => roles(approvals).includes(r)), `${t.id} @${amt}: band roles ${BAND_ROLES[amt]} present (got ${roles(approvals)})`);
    check(new Set(roles(approvals)).size === approvals.length, `${t.id} @${amt}: no role twice`);
    check(approvals.every((a, i) => a.order === i + 1 && a.decision === 'Pending' && !!a.basis), `${t.id} @${amt}: ordered, pending, with basis`);
    check(band.ruleId === (amt <= 50_000 ? 'Rule_al_1' : amt <= 250_000 ? 'Rule_al_2' : amt <= 1_000_000 ? 'Rule_al_3' : 'Rule_al_4'), `${t.id} @${amt}: DMN band`);
    // Template steps keep their order.
    const tplRoles = t.approvalPath.filter(e => !/by amount|^finance$/i.test(e)).map(G.roleOf);
    const idx = tplRoles.map(r => roles(approvals).indexOf(r));
    check(idx.every(i => i >= 0), `${t.id} @${amt}: every template step present`);
  }
}
{
  const hall5 = G.buildApprovalPath(tpl('TPL-PLAN-hall'), 5_000_000).approvals;
  check(hall5.map(a => a.step).join('|') === 'Design authority|Finance (by amount)|Executive sign-off (amount band)', `hall $5M path: ${hall5.map(a => a.step).join(' → ')}`);
  const hall600 = G.buildApprovalPath(tpl('TPL-PLAN-hall'), 600_000).approvals;
  check(hall600.length === 2 && hall600[0].role === 'Facilities Director' && /Rule_al_3/.test(hall600[0].basis ?? ''), 'hall $600k: design authority also signs the Facilities Director band');
  const pod2m = G.buildApprovalPath(tpl('TPL-PLAN-pod'), 2_000_000).approvals;
  check(pod2m.map(a => a.role).join('|') === 'Capacity Planner|Facilities Engineer|Finance Manager|Executive', `pod $2M (no finance step on the template) adds the band: ${pod2m.map(a => a.role).join(' → ')}`);
  const nd = G.buildApprovalPath(tpl('TPL-PLAN-new-dc'), 400_000_000).approvals;
  check(nd.length === 3 && nd[2].step === 'Executive', `new-dc: Executive band merges into the template Executive step (${nd.map(a => a.step).join(' → ')})`);
  const rack = G.buildApprovalPath(tpl('TPL-PLAN-rack'), 20_000).approvals;
  check(rack.length === 1 && rack[0].role === 'Capacity Planner', 'rack ≤$50k: one Capacity Planner step');
}
const data0 = dataNow();
for (const p of data0.plannerPlans) {
  const ev = evaluate(p, null, templates, benchmarks, undefined, data0);
  const amt = G.approvalAmount(ev);
  const { approvals, band } = G.buildApprovalPath(tpl(p.templateId), amt.amountUsd, amt.itUsd);
  console.log(`  ${p.plnId} ${p.scope.padEnd(15)} ${fmtUsd(amt.amountUsd).padStart(8)} ${band.ruleId} → ${approvals.map(a => `${a.order}.${a.step} [${a.role}]`).join(' → ')}`);
  check(approvals.length >= 1, `${p.plnId}: path built`);
}

/* ------------------------------------------------------------------ 2. decisions, SoD, delegation */
section('Decisions: order, role, segregation of duties, reasons, conditions, delegation');
const people = G.ALL_PEOPLE;
const synth = (over: Partial<T.PlannerPlan>): T.PlannerPlan => ({ ...plan('PLN-0004'), id: 'PLN-9001', plnId: 'PLN-9001', status: 'Draft', approvals: [], approvalHistory: [], conditions: [], requestedBy: 'Acme Financial', ...over });
let p = synth({});
const r0 = G.startRound(p, tpl('TPL-PLAN-hall'), { amountUsd: 5_000_000 }, 'Mike Johnson', at);
check(r0.ok, 'submit Draft');
if (r0.ok) p = { ...p, ...r0.patch };
check(p.status === 'In review' && p.approvals.length === 3 && p.submittedBy === 'Mike Johnson', 'round 1 in review with 3 steps');
const dec = (who: string, step: string, input: G.DecisionInput, delegs: T.ApprovalDelegation[] = []) => G.applyDecision(p, step, input, { name: who, id: people.find(x => x.name === who)?.id }, delegs, at);
check(!dec('Mike Johnson', 'Design authority', { decision: 'Approved' }).ok, 'submitter cannot approve (SoD)');
const outOfOrder = dec('Robert Brown', 'Finance (by amount)', { decision: 'Approved' });
check(!outOfOrder.ok && /in order/.test(outOfOrder.ok ? '' : outOfOrder.reason), 'steps are decided in order');
const wrongRole = dec('Lisa Park', 'Design authority', { decision: 'Approved' });
check(!wrongRole.ok && /Facilities Director/.test(wrongRole.ok ? '' : wrongRole.reason), 'only the role holder may decide');
const reqSod = G.applyDecision({ ...p, requestedBy: 'Emily Roberts' }, 'Design authority', { decision: 'Approved' }, { name: 'Emily Roberts', id: 'U04' }, [], at);
check(!reqSod.ok, 'requester cannot approve (SoD)');
const da = dec('Emily Roberts', 'Design authority', { decision: 'Approved' });
check(da.ok && da.patch.patch.status === 'In review' && !da.patch.finalApproved, 'design authority approves; still in review');
if (da.ok) p = { ...p, ...da.patch.patch };
// Emily as a delegate of the Finance Manager would decide a second step in the same round.
const delegToEmily: T.ApprovalDelegation = { ...meta, id: 'DLG-T1', dlgId: 'DLG-T1', fromName: 'Robert Brown', toName: 'Emily Roberts', role: 'Finance Manager', startDate: at, endDate: new Date(Date.now() + 7 * 864e5).toISOString(), status: 'Active' };
const twice = dec('Emily Roberts', 'Finance (by amount)', { decision: 'Approved' }, [delegToEmily]);
check(!twice.ok && /already decided/.test(twice.ok ? '' : twice.reason), 'one person cannot decide two steps of a round (even as a delegate)');
const noReason = dec('Robert Brown', 'Finance (by amount)', { decision: 'Rejected' });
check(!noReason.ok, 'rejection needs a reason');
const condNoOwner = dec('Robert Brown', 'Finance (by amount)', { decision: 'Approved with conditions', reason: 'Grid date unconfirmed', conditions: [{ text: 'Confirm grid date', owner: '', blocksExecution: true }] });
check(!condNoOwner.ok, 'conditions need an owner and a due date');
// Delegation: Nina Patel decides the finance step for Robert Brown.
const delegToNina: T.ApprovalDelegation = { ...delegToEmily, id: 'DLG-T2', dlgId: 'DLG-T2', toName: 'Nina Patel' };
const expired: T.ApprovalDelegation = { ...delegToNina, id: 'DLG-T3', startDate: '2025-01-01T00:00:00Z', endDate: '2025-01-31T00:00:00Z' };
check(!dec('Nina Patel', 'Finance (by amount)', { decision: 'Approved' }, [expired]).ok, 'an expired delegation does not count');
const viaDelegate = dec('Nina Patel', 'Finance (by amount)', { decision: 'Approved with conditions', reason: 'Grid connection date not yet confirmed', conditions: [{ text: 'Utility confirms the connection date in writing', owner: 'Emily Roberts', dueDate: new Date(Date.now() + 30 * 864e5).toISOString(), blocksExecution: true }] }, [delegToNina]);
check(viaDelegate.ok && viaDelegate.patch.approval.onBehalfOf === 'Robert Brown' && viaDelegate.patch.newConditions.length === 1, 'a named delegate decides on behalf of the role holder; condition recorded');
if (viaDelegate.ok) p = { ...p, ...viaDelegate.patch.patch };
check(G.openBlockingConditions(p).length === 1, 'blocking condition is open');
const execRej = dec('Karen Lee', 'Executive sign-off (amount band)', { decision: 'Rejected', reason: 'Payback above policy at current tariff' });
check(execRej.ok && execRej.patch.rejected && execRej.patch.patch.status === 'Rejected', 'executive rejects with a reason → Rejected');
if (execRej.ok) p = { ...p, ...execRej.patch.patch };

/* ------------------------------------------------------------------ 3. resubmission and withdrawal */
section('Resubmission and withdrawal');
const r1 = G.startRound(p, tpl('TPL-PLAN-hall'), { amountUsd: 600_000 }, 'Mike Johnson', at);
check(r1.ok, 'resubmit a rejected plan');
if (r1.ok) p = { ...p, ...r1.patch };
check(p.approvalHistory!.length === 1 && p.approvalHistory![0].outcome === 'Rejected' && p.approvalHistory![0].amountUsd === 5_000_000, 'previous round archived as Rejected with its amount');
check(p.status === 'In review' && p.approvals.every(a => a.decision === 'Pending') && G.currentRound(p) === 2, 'new round 2, every step Pending');
check(p.approvals.length === 2, 'the new round is routed on the new amount ($600k band: 2 steps)');
check(!G.startRound(p, tpl('TPL-PLAN-hall'), { amountUsd: 1 }, 'x', at).ok, 'cannot submit a plan already in review');
const w = G.withdrawRound(p, at);
check(w.ok && w.patch.status === 'Draft' && w.patch.approvalHistory!.length === 2 && w.patch.approvalHistory![1].outcome === 'Withdrawn', 'withdraw: back to Draft, round kept as Withdrawn');
{
  const pln12 = plan('PLN-0012');
  const r12 = G.startRound(pln12, tpl(pln12.templateId), { amountUsd: 10_000_000 }, 'Mike Johnson', at);
  check(r12.ok && r12.patch.approvalHistory!.length === 1 && r12.patch.approvals!.every(a => a.decision === 'Pending'), 'seeded rejected PLN-0012 resubmits with a fresh round (no longer stuck)');
}

/* ------------------------------------------------------------------ 4. baseline and reservations */
section('Final approval: baseline and reservations');
const inSite = ['PLN-0002', 'PLN-0005', 'PLN-0004', 'PLN-0008'].map(plan).find(x => x && x.dataCenterId && planAddedKw(x) > 0)!;
check(!!inSite, 'an in-site plan with added load exists');
{
  const d = dataNow();
  const target: T.PlannerPlan = { ...inSite, status: 'Approved', approvals: [], artefacts: undefined };
  const scn = (tables.plannerScenarios as unknown as T.PlannerScenario[]).find(s => s.planId === target.id) ?? null;
  const ev = evaluate(target, scn, templates, benchmarks, undefined, d);
  const bom = buildBom(target, ev, benchmarks);
  const before = siteBaseline(d, target.dataCenterId!, { excludePlanId: 'OTHER' })!;
  const fx = G.onFinalApproval(store, { plan: target, ev, scenario: scn, template: tpl(target.templateId), benchmarks, data: d, bomTotal: bom.total, actor: 'Smoke', meta, at });
  const b = fx.patch.baseline!;
  console.log(`  ${target.plnId}: ${fx.notes.join(' ')}`);
  check(b.capexTotal === ev.estimate.capexTotal && b.opexMonthly === ev.estimate.opexMonthly && b.bomTotal === bom.total, 'baseline freezes CapEx, OpEx and BOM of the approved scenario');
  check(b.scenarioId === scn?.id && fx.patch.approvedScenarioId === scn?.id, 'baseline records the approved scenario');
  check(b.templateVersion === tpl(target.templateId).version && fx.patch.templateVersion === b.templateVersion, 'template version pinned');
  check(Object.keys(b.params).length > 10 && b.schedule.length === ev.schedule.length && b.benchmarks.length > 0, 'parameters, schedule and benchmarks frozen');
  const bs = G.baselineScenario({ ...target, ...fx.patch } as T.PlannerPlan)!;
  const evB = evaluate({ ...target, ...fx.patch } as T.PlannerPlan, bs, templates, benchmarks, undefined, d);
  check(evB.estimate.capexTotal === b.capexTotal, 'execution evaluation from the baseline reproduces the approved CapEx');
  const ids = fx.patch.artefacts!.reservationIds ?? [];
  const req = reservationRequests(target, ev, d);
  check(ids.length === req.capacity.length && ids.length > 0, `holds written (${ids.length}, fallback=${req.fallback})`);
  const rows = tables.capacityReservations.filter(r => ids.includes(String(r.id)));
  check(rows.every(r => r.state === 'Reserved' && r.plannerPlanId === target.id && r.dataCenterId === target.dataCenterId && r.expiresAt === reservationExpiry(target)), 'holds are Reserved, owned by the plan, expire 60 days after go-live');
  check(!fx.patch.artefacts!.executionId, 'approval artefacts carry holds only (no execution id), so execution starts a fresh run');
  const after = siteBaseline(dataNow(), target.dataCenterId!, { excludePlanId: 'OTHER' })!;
  check(after.reservedKw >= before.reservedKw + planAddedKw(target) - 0.5, `another plan sees the held kW (${before.reservedKw} → ${after.reservedKw} kW)`);
  const again = writeReservations(store, target, req, meta, 'Smoke');
  check(again.reservationIds.length === ids.length && tables.capacityReservations.filter(r => r.plannerPlanId === target.id).length === ids.length, 'writing holds again does not duplicate them');
  const n = moveReservations(store, target.id, 'Committed', { changeRequestId: 'CHG-TEST', at });
  check(n >= ids.length && tables.capacityReservations.filter(r => r.plannerPlanId === target.id).every(r => r.state === 'Committed' && r.changeRequestId === 'CHG-TEST' && r.expiresAt === undefined), 'execution commits the holds and links the change');
  moveReservations(store, target.id, 'Consumed', { at });
  check(tables.capacityReservations.filter(r => r.plannerPlanId === target.id).every(r => r.state === 'Consumed'), 'completion consumes the holds');
  const afterConsume = siteBaseline(dataNow(), target.dataCenterId!, { excludePlanId: 'OTHER' })!;
  check(afterConsume.reservedKw <= after.reservedKw - planAddedKw(target) + 0.5, 'consumed holds no longer count as reserved');
}
{
  // Cancel releases.
  const d = dataNow();
  const other = { ...plan('PLN-0005'), id: 'PLN-9002', plnId: 'PLN-9002', status: 'Approved' as const };
  const ev = evaluate(other, null, templates, benchmarks, undefined, d);
  const ids = writeReservations(store, other, reservationRequests(other, ev, d), meta, 'Smoke');
  const c = G.cancelPlan(other, 'Customer withdrew the demand', 'Smoke', at);
  check(c.ok && c.patch.status === 'Cancelled', 'cancel with a reason');
  check(!G.cancelPlan(other, '', 'Smoke', at).ok, 'cancel needs a reason');
  moveReservations(store, other.id, 'Released', { reason: 'cancelled', at });
  check(ids.reservationIds.length === 0 || tables.capacityReservations.filter(r => r.plannerPlanId === other.id).every(r => r.status === 'Released'), 'cancel releases the holds');
}
{
  // Fallback: a family with no reservation hook still holds the added kW on the site.
  const d = dataNow();
  const pod = { ...plan('PLN-0005'), id: 'PLN-9003' };
  const req = reservationRequests(pod, evaluate(pod, null, templates, benchmarks, undefined, d), d);
  check(req.capacity.length > 0, `PLN-0005 pod holds capacity (${req.fallback ? 'site-level fallback' : 'family holds'}: ${req.capacity.map(r => `${r.resourceType} ${r.resourceId} ${r.quantity} ${r.unit}`).join(', ')})`);
  const newDc = plan('PLN-0001');
  const reqN = reservationRequests(newDc, evaluate(newDc, null, templates, benchmarks, undefined, d), d);
  check(!reqN.fallback, 'no site-level fallback for a new site');
}

/* ------------------------------------------------------------------ 5. close-out gate */
section('Close-out gate');
{
  const exec: T.PlannerPlan = { ...plan('PLN-0005'), id: 'PLN-9004', plnId: 'PLN-9004', status: 'Executing', conditions: [{ id: 'CND-1-1', text: 'Fire sign-off', owner: 'Emily Roberts', raisedBy: 'x', raisedAt: at, status: 'Open', blocksExecution: false }], waves: [], artefacts: { createdAt: at, vehicle: 'project', executionId: 'EXE-T', completedAt: at, purchaseOrderIds: ['PO-T1'], subnetIds: [], vlanIds: [], permitIds: [], designDocIds: [], projectIds: ['PROJ-T1'], changeRequestIds: ['CHG-T1'] } };
  store.create('plannerPlans', exec as unknown as Record<string, unknown>);
  store.create('projects', { ...meta, id: 'PROJ-T1', projId: 'PROJ-T1', programId: 'PROG-T', name: 'Pod build', status: 'Active', rag: 'Amber', managerName: 'x', plannedStart: at, plannedEnd: at, percentComplete: 60, budget: 1_000_000, actualSpend: 400_000, plannerPlanId: exec.id });
  store.create('purchaseOrders', { ...meta, id: 'PO-T1', poId: 'PO-T1', plannedCost: 500_000, approvedBudget: 500_000, actualSpend: 0, forecastVariance: 0, status: 'Draft', plannerPlanId: exec.id, orderBy: '2025-01-01T00:00:00Z' });
  store.create('changeRequests', { ...meta, id: 'CHG-T1', chgId: 'CHG-T1', title: 'Pod', status: 'Scheduled', plannerPlanId: exec.id });
  let d = dataNow();
  let checks = closeoutChecks(exec, d, tpl(exec.templateId));
  console.log(`  open: ${checks.filter(c => !c.ok).map(c => `${c.label} (${c.detail})`).join('; ')}`);
  check(!closeoutReady(checks), 'not ready while delivery is open');
  for (const k of ['projects', 'hoto', 'pos', 'changes', 'conditions', 'atps']) check(checks.some(c => c.key === k && !c.ok), `check ${k} is open`);
  const dv = deliveryView(exec, d, Date.now());
  check(dv.overduePos.length === 1 && dv.pctComplete === 60 && dv.actualSpend === 400_000, 'delivery view: overdue Draft PO past its order-by date, % complete, spend');
  check(!G.completePlan(store, exec, d, tpl(exec.templateId), 'Smoke', at).ok, 'Complete plan refused while checks are open');
  store.update('projects', 'PROJ-T1', { percentComplete: 100, status: 'Completed', actualSpend: 520_000 });
  store.update('purchaseOrders', 'PO-T1', { status: 'Received', actualSpend: 480_000 });
  store.update('changeRequests', 'CHG-T1', { status: 'Implemented' });
  store.create('hotos', { ...meta, id: 'HOTO-T1', hotoId: 'HOTO-T1', projectId: 'PROJ-T1', status: 'Accepted' });
  store.create('atps', { ...meta, id: 'ATP-T1', atpId: 'ATP-T1', projectId: 'PROJ-T1', name: 'Pod ATP', system: 'Power', level: 'L4 Functional', status: 'Accepted' });
  const cc = G.closeCondition(exec, 'CND-1-1', 'Fire certificate FC-2291 issued', 'Emily Roberts', at);
  check(cc.ok, 'condition closed with evidence');
  const exec2 = { ...exec, ...(cc.ok ? cc.patch : {}) } as T.PlannerPlan;
  check(!G.closeCondition(exec, 'CND-1-1', '', 'x', at).ok, 'closing a condition needs evidence');
  d = dataNow();
  checks = closeoutChecks(exec2, d, tpl(exec2.templateId));
  check(closeoutReady(checks), `ready when every check is green (${checks.filter(c => !c.ok).map(c => c.label).join(', ') || 'all green'})`);
  const done = G.completePlan(store, exec2, d, tpl(exec2.templateId), 'Smoke', at);
  check(done.ok && done.patch.status === 'Completed' && done.patch.closeout!.actualCapex === 1_000_000 && done.patch.phases!.every(ph => ph.status === 'Live'), 'completion writes the close-out (actual = project + PO spend) and sets phases Live');
  const empty: T.PlannerPlan = { ...plan('PLN-0004'), status: 'Executing', artefacts: undefined, id: 'PLN-9005' };
  check(!closeoutReady(closeoutChecks(empty, d)), 'a plan with no delivery records cannot be completed (no vacuous pass)');
}

/* ------------------------------------------------------------------ 6. lock, revisions, status */
section('Lock, revisions and status transitions');
{
  for (const s of ['In review', 'Approved', 'Executing', 'Completed', 'On hold', 'Cancelled'] as T.PlannerPlanStatus[]) check(!G.isEditable({ status: s }) && !!G.lockReason({ ...plan('PLN-0004'), status: s }), `${s} is locked with a reason`);
  check(G.isEditable({ status: 'Draft' }) && G.isEditable({ status: 'Rejected' }), 'Draft and Rejected are editable');
  const a = { ...plan('PLN-0002'), status: 'Approved' as const, baseline: undefined };
  const all = tables.plannerPlans as unknown as T.PlannerPlan[];
  const rv = G.revisionDraft(a, all, { densityKwPerRack: 40 }, { name: 'Mike Johnson', id: 'U03' }, at);
  check(rv.ok && rv.patch.id === 'PLN-0002-B' && rv.patch.revision === 'B' && rv.patch.revisionOf === a.id && rv.patch.status === 'Draft' && rv.patch.approvals.length === 0 && rv.patch.params.densityKwPerRack === 40, 'raise revision B as a draft with the approved overrides');
  if (rv.ok) {
    store.create('plannerPlans', rv.patch as unknown as Record<string, unknown>);
    const again = G.revisionDraft(a, tables.plannerPlans as unknown as T.PlannerPlan[], {}, { name: 'x' }, at);
    check(!again.ok, 'only one open revision at a time');
    check(!G.revisionDraft(plan('PLN-0004'), all, {}, { name: 'x' }, at).ok, 'a draft cannot be revised');
    // Approving the revision supersedes the original and releases its holds.
    const d = dataNow();
    const evA = evaluate(a, null, templates, benchmarks, undefined, d);
    writeReservations(store, a, reservationRequests(a, evA, d), meta, 'Smoke');
    const evB = evaluate(rv.patch, null, templates, benchmarks, undefined, d);
    const fx = G.onFinalApproval(store, { plan: { ...rv.patch, status: 'Approved' }, ev: evB, scenario: null, template: tpl(rv.patch.templateId), benchmarks, data: d, bomTotal: 0, actor: 'Smoke', meta, at });
    check(fx.previous?.id === a.id && fx.previous.patch.supersededBy === rv.patch.id, 'revision approval supersedes the original');
    check(tables.capacityReservations.filter(r => r.plannerPlanId === a.id && r.state !== 'Consumed').every(r => r.status === 'Released'), "the original's open holds are released");
    const delta = G.baselineDelta({ ...fx.patch.baseline!, params: { ...fx.patch.baseline!.params, densityKwPerRack: 30 } }, rv.patch, evB);
    check(delta.some(r => r.changed && /densityKwPerRack/.test(r.label)), 'delta view lists the changed parameter');
  }
  check(G.templateDrift({ ...plan('PLN-0002'), templateVersion: 1 }, { ...tpl('TPL-PLAN-hall'), version: 3 })?.to === 3, 'template drift detected');
  const h = G.holdPlan({ ...plan('PLN-0002'), status: 'Approved' }, 'Utility moratorium', 'x', at);
  check(h.ok && h.patch.statusBeforeHold === 'Approved', 'hold keeps the previous status');
  check(h.ok && G.resumePlan({ ...plan('PLN-0002'), ...h.patch } as T.PlannerPlan).ok, 'resume from hold');
  check(!G.holdPlan(plan('PLN-0004'), 'x reason', 'x', at).ok, 'a draft cannot be put on hold');
  check(G.canDelete(plan('PLN-0004')) && !G.canDelete(plan('PLN-0002')), 'only drafts can be deleted');
  check(G.nextPlanId(['PLN-0001', 'PLN-0015', 'PLN-0002-B', 'PLN-MG3K2X1A']) === 'PLN-0016', 'sequential plan ids (PLN-0016)');
}

/* ------------------------------------------------------------------ 7. wizard save rules */
section('Wizard save: owned fields and concurrency');
{
  const b0 = plan('PLN-0004');
  const local = { ...b0, title: 'Renamed', status: 'Approved' as const, approvals: [{ step: 'x', role: 'y', decision: 'Approved' as const }] };
  const patch = G.wizardPatch(b0, local);
  check('title' in patch && !('status' in patch) && !('approvals' in patch), 'wizard patch carries wizard fields only, never status or approvals');
  check(!G.wizardConflict(b0, { ...b0, updatedAt: 'later', preferredScenarioId: 'SCN-X' }), 'a scenario preference elsewhere is not a conflict');
  check(!!G.wizardConflict(b0, { ...b0, updatedAt: 'later', status: 'In review' }), 'a status change since opening is a conflict');
  check(!!G.wizardConflict(b0, { ...b0, updatedAt: 'later', designPowerKw: b0.designPowerKw + 1 }), 'another edit of a wizard field is a conflict');
  const diffs = G.diffPlan(b0, { params: { ...b0.params, densityKwPerRack: 99 }, paramSources: { ...b0.paramSources, densityKwPerRack: 'ai' } });
  check(diffs.some(c => c.field === 'param densityKwPerRack' && c.to === '99' && c.source === 'ai'), 'audit diff records the parameter, old → new and source');
}

/* ------------------------------------------------------------------ 8. delivery process */
section('Delivery process after approval (no second budget approval)');
{
  check(deliveryProcessFor({ ...plan('PLN-0002'), scope: 'hall' }, 'capacity-expansion').key === 'hall-fitout', 'in-site capacity: P02 hall fit-out instead of P06');
  check(deliveryProcessFor(plan('PLN-0001'), 'capacity-expansion').key === undefined, 'site build: programme and projects, no P06');
  check(deliveryProcessFor(plan('PLN-0004'), 'change').key === 'change', 'change vehicle keeps P05');
  check(deliveryProcessFor(plan('PLN-0013'), 'work-order').key === 'work-order', 'replacement keeps P10');
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
