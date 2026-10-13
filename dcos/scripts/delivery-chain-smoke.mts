/* Smoke test with assertions for the delivery chain: plan → programme → project (its template's
   BPMN process) → work orders → change requests (one per work order).
   Run: npx tsx scripts/delivery-chain-smoke.mts   (exits non-zero when a check fails) */
import { readFileSync, existsSync } from 'node:fs';
import { BpmnModdle, type ModdleElement } from 'bpmn-moddle';
import { buildSnapshot } from '../src/mock/db/seed.ts';
import { MockDB } from '../src/mock/db/store.ts';
import type * as T from '../src/mock/data/types.ts';
import { PROCESS_BY_KEY, PROCESSES } from '../src/workorders/model.ts';
import { completeTaskIn, modelParsed, openTasksOf } from '../src/modules/workorders/lib/engineCore.ts';
import { PROCESS_FOR_TEMPLATE, TEMPLATE_REGISTRY } from '../src/modules/delivery/lib/projectTemplates.ts';
import { isWorkWait, milestoneNodes, workStepsOf, WORK_SPECS } from '../src/modules/delivery/lib/projectProcess.ts';
import { freezeFor, stepWorkDone } from '../src/modules/delivery/lib/chainRules.ts';
import { advanceProjectIfDone, createChainOps, projectInstanceOf, raiseWorkForStep, startProjectProcess, type ChainOps } from '../src/modules/delivery/lib/chainOps.ts';

let failures = 0; let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) { failures++; console.log(`  FAIL ${msg}`); } };
const section = async (name: string, fn: () => void | Promise<void>) => { console.log(`\n# ${name}`); const before = failures; try { await fn(); } catch (e) { failures++; console.log(`  FAIL threw: ${e instanceof Error ? e.stack : String(e)}`); } console.log(failures === before ? '  ok' : `  ${failures - before} failure(s)`); };

const snap = buildSnapshot('small');
const db = new MockDB(); db.hydrate(snap);
const all = <X>(e: string) => db.getAllRaw(e) as unknown as X[];
const get = <X>(e: string, id?: string) => (id ? db.getById(e, id) as unknown as X | undefined : undefined);
const RUNNABLE: T.Project['status'][] = ['Active', 'At Risk', 'Planning', 'On Hold'];
const actor = 'Smoke Test';
const ops = createChainOps(db, actor, () => {});

await section('Process model: one process per template, BPMN on disk, milestones mapped', async () => {
  const moddle = new BpmnModdle();
  for (const [tpl, key] of Object.entries(PROCESS_FOR_TEMPLATE)) {
    const p = PROCESS_BY_KEY[key];
    ok(p, `${tpl}: process ${key} exists`); if (!p) continue;
    const file = `src/workorders/bpmn/${key}.bpmn`;
    ok(existsSync(file), `${key}: BPMN file generated`);
    const { rootElement } = await moddle.fromXML(readFileSync(file, 'utf8'));
    const proc = (rootElement.rootElements as ModdleElement[]).find((e) => e.$type === 'bpmn:Process');
    const ids = new Set(((proc?.flowElements ?? []) as ModdleElement[]).map((e) => e.id));
    const parsed = modelParsed(key);
    ok(Object.keys(parsed.nodes).every((id) => ids.has(id)) && Object.keys(parsed.flows).every((id) => ids.has(id)), `${key}: BPMN and model agree on every element`);
    ok(workStepsOf(key).length > 0, `${key}: has at least one work step`);
    for (const s of workStepsOf(key)) ok(WORK_SPECS[key]?.[s.key]?.items.length, `${key}: work step ${s.key} has a work-order spec`);
    const ms = milestoneNodes(key);
    ok(ms.length === TEMPLATE_REGISTRY[tpl as keyof typeof TEMPLATE_REGISTRY].milestones.length && ms.every((m) => !!m.nodeId), `${key}: every milestone of ${tpl} is mapped to a node`);
  }
  ok(PROCESSES.filter((p) => p.pid.startsWith('PRJ')).length === 17, '17 project processes');
  ok(all<T.ProcessDefinition>('processDefinitions').length === PROCESSES.length, 'a definition row per process');
});

await section('Seed: one change per work order and one work order per change', () => {
  const crs = all<T.ChangeRequest>('changeRequests'); const wos = all<T.WorkOrder>('workOrders');
  ok(crs.length >= 46, `at least the 46 original changes (${crs.length})`);
  for (const c of crs) {
    const linked = wos.filter((w) => w.changeRequestId === c.id);
    ok(linked.length === 1 && c.workOrderId === linked[0].id, `${c.id} has exactly one work order (${linked.length})`);
  }
  for (const w of wos) ok(w.changeRequestId && get<T.ChangeRequest>('changeRequests', w.changeRequestId)?.workOrderId === w.id, `${w.id} has exactly one change`);
  ok(crs.every((c) => c.changeClass), 'every change has a class');
  const operational = crs.filter((c) => !c.projectId && !c.programId);
  ok(operational.length > 0 && operational.length < crs.length, `operational changes outside projects are marked (${operational.length})`);
  // Project changes either sit on the process step their work belongs to, or are project changes outside the steps (lead, 2026-10-09).
  ok(crs.filter((c) => c.projectId).every((c) => { const w = wos.find((x) => x.id === c.workOrderId); return w?.projectId === c.projectId && w?.projectStepId === c.projectStepId; }), 'project changes and their work orders agree on project and step');
  ok(crs.filter((c) => c.projectId && c.projectStepId).length > crs.filter((c) => c.projectId && !c.projectStepId).length, 'most project changes sit on a process step');
});

await section('Seed: every project that can run has its template process at a believable step', () => {
  const pis = all<T.ProcessInstance>('processInstances');
  const wos = all<T.WorkOrder>('workOrders');
  for (const p of all<T.Project>('projects')) {
    const key = PROCESS_FOR_TEMPLATE[p.template as keyof typeof PROCESS_FOR_TEMPLATE];
    const inst = pis.filter((i) => i.recordType === 'project' && i.recordId === p.id && i.state !== 'cancelled');
    if (RUNNABLE.includes(p.status)) {
      ok(inst.length === 1 && inst[0].state === 'active' && inst[0].definitionKey === key, `${p.id} (${p.status}, ${p.template}) runs ${key}`);
      const waiting = inst[0]?.currentElementIds.find((id) => isWorkWait(key, id));
      if (waiting) ok(wos.some((w) => w.projectId === p.id && w.projectStepId === waiting) && !stepWorkDone(wos.filter((w) => w.projectId === p.id && w.projectStepId === waiting)), `${p.id} waits on ${waiting} with open work orders`);
    }
    if (p.status === 'Completed') ok(inst[0]?.state === 'completed', `${p.id} completed project has a completed process`);
  }
  const plan = all<T.Program>('programs').find((x) => x.plannerPlanId);
  ok(plan && all<T.Project>('projects').some((p) => p.programId === plan.id), 'the planner programme has a project');
  ok(all<T.Project>('projects').some((p) => p.plannerPlanId), 'a project delivers a planner plan');
});

await section('Seed: change classes, approvals, reviews, freezes', () => {
  const crs = all<T.ChangeRequest>('changeRequests'); const steps = all<T.ApprovalStep>('approvalSteps'); const rules = all<T.ApprovalMatrixRule>('approvalMatrixRules');
  const tpls = all<T.StandardChangeTemplate>('standardChangeTemplates');
  ok(tpls.filter((t) => t.status === 'Active').length >= 10 && tpls.some((t) => t.status === 'Suspended'), 'ten or more active templates and one suspended');
  ok(tpls.every((t) => t.owner && t.steps.length && t.backout && t.reviewDue > t.approvedAt), 'templates have owner, steps, backout and a review date');
  for (const c of crs.filter((x) => x.changeClass === 'Standard')) {
    ok(!steps.some((s) => s.changeRequestId === c.id), `${c.id} standard: no approval steps`);
    ok(['Approved', 'Scheduled', 'InProgress', 'Implemented', 'Closed', 'RolledBack'].includes(c.status) && c.approvedAt && c.standardTemplateId, `${c.id} standard: approved by its template`);
  }
  for (const c of crs.filter((x) => x.changeClass === 'Normal' && !['Draft', 'Cancelled'].includes(x.status))) {
    const rule = rules.find((r) => r.id === c.approvalRuleId);
    const mine = steps.filter((s) => s.changeRequestId === c.id);
    ok(rule && mine.length === rule.stages.reduce((n, s) => n + s.requiredCount, 0), `${c.id} normal: approval steps from the matrix (${mine.length})`);
  }
  const em = crs.filter((x) => x.changeClass === 'Emergency');
  ok(em.length >= 2, `a couple of emergency changes (${em.length})`);
  for (const c of em.filter((x) => ['Implemented', 'Closed', 'RolledBack'].includes(x.status))) ok(c.review, `${c.id} emergency: reviewed once implemented`);
  for (const c of crs.filter((x) => x.status === 'Closed' || x.status === 'RolledBack')) ok(c.review && (x => x)(c.closedAt || c.status === 'RolledBack'), `${c.id} closed with a review`);
  const freezes = all<T.ChangeFreeze>('changeFreezes');
  ok(freezes.some((f) => !f.dataCenterId) && freezes.some((f) => f.dataCenterId), 'estate and site freezes');
  for (const c of crs) {
    if (!c.scheduledStart || !c.scheduledEnd) continue;
    const f = freezeFor({ changeFreezes: freezes }, c.dataCenterId, c.scheduledStart, c.scheduledEnd);
    if (f) ok(c.changeClass === 'Emergency' || (c.freezeId === f.id && c.policyViolations.some((v) => v.includes('freeze'))), `${c.id} in freeze "${f.name}" is an emergency or flagged`);
  }
  const statuses = new Set(crs.map((c) => `${c.changeClass}:${c.status}`));
  for (const s of ['Standard:Closed', 'Normal:Submitted', 'Normal:Approved', 'Normal:Scheduled', 'Normal:InProgress', 'Normal:Implemented', 'Normal:Closed', 'Normal:Rejected', 'Normal:RolledBack', 'Standard:RolledBack']) ok(statuses.has(s), `the mix includes ${s}`);
  const wos = all<T.WorkOrder>('workOrders');
  ok(wos.some((w) => w.assigneeKind === 'contractor' && w.crew?.length && w.accessRequestId) && wos.some((w) => w.assigneeKind === 'internal' && w.assigneeName), 'technicians and contractor crews with access requests');
});

await section('Seed: processes of changes and work orders', () => {
  const pis = all<T.ProcessInstance>('processInstances');
  for (const c of all<T.ChangeRequest>('changeRequests')) {
    const p05 = pis.filter((i) => i.recordType === 'changeRequest' && i.recordId === c.id);
    ok(c.changeClass === 'Standard' ? p05.length === 0 : p05.length === 1, `${c.id} ${c.changeClass}: ${c.changeClass === 'Standard' ? 'no P05' : 'one P05'}`);
  }
  for (const w of all<T.WorkOrder>('workOrders')) {
    const p10 = get<T.ProcessInstance>('processInstances', w.processInstanceId);
    ok(p10?.definitionKey === 'work-order' && p10.recordId === w.id, `${w.id} has its P10`);
    if (w.accessRequestId) ok(get<T.ProcessInstance>('processInstances', w.accessRequestId)?.variables.workOrderId === w.id, `${w.id} access request points back`);
  }
});

/** Take a work order and its change through to completion with the chain actions. */
function finish(o: ChainOps, woId: string): void {
  let wo = get<T.WorkOrder>('workOrders', woId)!;
  if (['Completed', 'Cancelled', 'Failed'].includes(wo.status)) return;
  let cr = get<T.ChangeRequest>('changeRequests', wo.changeRequestId)!;
  if (cr.status === 'Draft') o.submitChange(cr.id);
  for (const s of all<T.ApprovalStep>('approvalSteps').filter((x) => x.changeRequestId === cr.id && x.decision === 'Pending').sort((a, b) => a.order - b.order)) o.decideStep(cr.id, s.id, 'Approved', 'ok');
  cr = get<T.ChangeRequest>('changeRequests', cr.id)!;
  // Work can only start inside its change window (from an hour before), so book the window around now.
  if (['Approved', 'Scheduled'].includes(cr.status)) o.scheduleChange(cr.id, new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 3600e3).toISOString(), 'none');
  wo = get<T.WorkOrder>('workOrders', woId)!;
  if (!wo.assigneeName || wo.status === 'Ready') o.assignWorkOrder(woId, { kind: wo.assigneeKind ?? 'internal', name: wo.assigneeName || 'James Wilson', vendorId: wo.contractorVendorId, crew: wo.crew });
  wo = get<T.WorkOrder>('workOrders', woId)!;
  if (wo.assigneeKind === 'contractor') {
    const acc = get<T.ProcessInstance>('processInstances', wo.accessRequestId);
    for (const el of ['request', 'approve_zones']) { const t = acc ? openTasksOf(db, acc.id).find((x) => x.elementId === el) : undefined; if (t) completeTaskIn(db, modelParsed('access-request'), t.id, { approved: true }, actor); }
  }
  if (wo.status !== 'Validated') { const r = o.startWork(woId); ok(r.ok, `${woId} starts (${r.reason ?? ''})`); }
  o.completeWorkOrder(woId, { notes: 'done' });
}

await section('Lifecycle through the pure functions: raise → approve → schedule → start → complete → close', () => {
  const site = all<T.DataCenter>('dataCenters')[0];
  const at = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();
  // normal
  const n = ops.raiseWorkOrder(undefined, { type: 'PowerConnect', title: 'Smoke: new B-side feed', dataCenterId: site.id, plannedStart: at(1), plannedEnd: at(5), kw: 30, liveSite: true, criticalServices: true });
  ok(n.change.changeClass === 'Normal' && n.change.status === 'Draft' && n.workOrder.status === 'Draft', 'a 30 kW live power change is normal and starts as a draft');
  ok(n.approvals.length > 1, 'normal change has matrix approval steps');
  ops.submitChange(n.change.id);
  let c = get<T.ChangeRequest>('changeRequests', n.change.id)!;
  ok(c.status === 'Submitted' && c.cabDate && new Date(c.cabDate).getUTCDay() === 4, 'submitted for the Thursday change board');
  const steps = all<T.ApprovalStep>('approvalSteps').filter((s) => s.changeRequestId === c.id).sort((a, b) => a.order - b.order);
  const late = steps.find((s) => s.order > steps[0].order);
  if (late) ok(!ops.decideStep(c.id, late.id, 'Approved').ok, 'a later approval step cannot be decided first');
  for (const s of steps) ops.decideStep(c.id, s.id, 'Approved', 'ok');
  c = get<T.ChangeRequest>('changeRequests', c.id)!;
  ok(c.status === 'Approved' && get<T.WorkOrder>('workOrders', n.workOrder.id)?.status === 'Ready', 'approved; work order ready');
  const p05 = () => all<T.ProcessInstance>('processInstances').find((i) => i.recordType === 'changeRequest' && i.recordId === c.id)!;
  ok(p05().currentElementIds.includes('schedule'), 'P05 waits at Schedule window');
  ops.scheduleChange(c.id, at(1), at(5), 'B-side only');
  ok(get<T.ChangeRequest>('changeRequests', c.id)?.status === 'Scheduled', 'scheduled with a window');
  ops.assignWorkOrder(n.workOrder.id, { kind: 'internal', name: 'James Wilson' });
  ok(ops.startWork(n.workOrder.id).ok && get<T.ChangeRequest>('changeRequests', c.id)?.status === 'InProgress', 'work started, change in progress');
  ops.completeWorkOrder(n.workOrder.id, { notes: 'done' });
  ok(get<T.ChangeRequest>('changeRequests', c.id)?.status === 'Implemented' && get<T.WorkOrder>('workOrders', n.workOrder.id)?.status === 'Completed', 'implemented; work order completed');
  ok(p05().currentElementIds.includes('verify'), 'P05 waits at Verify service');
  ops.closeChange(c.id, { outcome: 'Successful', notes: 'ok', by: actor, at: at(0) });
  ok(get<T.ChangeRequest>('changeRequests', c.id)?.status === 'Closed' && p05().state === 'completed', 'closed with review; P05 completed');
  ok(get<T.ProcessInstance>('processInstances', get<T.WorkOrder>('workOrders', n.workOrder.id)?.processInstanceId)?.state === 'completed', 'P10 completed');
  // standard
  const s = ops.raiseWorkOrder(undefined, { type: 'RackInstall', title: 'Smoke: rack and stack 4 kW', dataCenterId: site.id, plannedStart: at(30), plannedEnd: at(34), kw: 4 });
  ok(s.change.changeClass === 'Standard' && s.change.status === 'Approved' && s.approvals.length === 0 && s.workOrder.status === 'Ready', 'a 4 kW rack and stack is a standard change, approved by its template');
  ok(!all<T.ProcessInstance>('processInstances').some((i) => i.recordType === 'changeRequest' && i.recordId === s.change.id), 'standard change runs no P05');
  finish(ops, s.workOrder.id);
  ok(get<T.ChangeRequest>('changeRequests', s.change.id)?.status === 'Closed', 'standard change closes on completion');
  // emergency
  const e = ops.raiseWorkOrder(undefined, { type: 'PowerConnect', title: 'Smoke: replace failed breaker', dataCenterId: site.id, plannedStart: at(0), plannedEnd: at(2), emergency: true });
  ok(e.change.changeClass === 'Emergency' && e.change.status === 'Submitted' && e.approvals.length === 1, 'emergency change goes straight to the emergency board');
  // contractor without access
  const k = ops.raiseWorkOrder(undefined, { type: 'Civil', title: 'Smoke: core drill', dataCenterId: site.id, plannedStart: at(1), plannedEnd: at(3), assigneeKind: 'contractor', contractorVendorId: all<T.Vendor>('vendors')[0].id, crew: ['A', 'B'] });
  ok(k.workOrder.accessRequestId, 'a contractor work order gets a site access request');
  for (const st of all<T.ApprovalStep>('approvalSteps').filter((x) => x.changeRequestId === k.change.id)) { ops.submitChange(k.change.id); ops.decideStep(k.change.id, st.id, 'Approved'); }
  ok(!ops.startWork(k.workOrder.id).ok, 'a contractor cannot start without approved site access');
  // failure on a standard change suspends its template
  const f = ops.raiseWorkOrder(undefined, { type: 'Cabling', title: 'Smoke: patching', dataCenterId: site.id, plannedStart: at(40), plannedEnd: at(41) });
  ok(f.change.changeClass === 'Standard', 'patching is standard');
  ops.assignWorkOrder(f.workOrder.id, { kind: 'internal', name: 'James Wilson' }); ops.startWork(f.workOrder.id);
  ops.completeWorkOrder(f.workOrder.id, { notes: 'link down' }, 'Failed');
  ok(get<T.ChangeRequest>('changeRequests', f.change.id)?.status === 'RolledBack' && get<T.StandardChangeTemplate>('standardChangeTemplates', f.change.standardTemplateId)?.status === 'Suspended', 'failed standard change rolled back and its template suspended');
  const again = ops.raiseWorkOrder(undefined, { type: 'Cabling', title: 'Smoke: patching again', dataCenterId: site.id, plannedStart: at(50), plannedEnd: at(51) });
  ok(again.change.changeClass === 'Normal', 'with the template suspended the same work goes as normal');
  // cancel
  ops.cancelChange(again.change.id, 'not needed');
  ok(get<T.WorkOrder>('workOrders', again.workOrder.id)?.status === 'Cancelled', 'cancelling a change cancels its work order');
});

await section('Projects: a new project starts its process, work steps raise work orders, closing them moves it on', () => {
  const dc = all<T.DataCenter>('dataCenters')[1];
  const prog = all<T.Program>('programs')[0];
  const id = 'PROJ-SMOKE';
  db.create('projects', { id, projId: id, customerId: 'CUST-001', isDeleted: false, createdAt: '', updatedAt: '', createdBy: actor, createdById: 'me', programId: prog.id, name: 'Smoke hall', status: 'Planning', rag: 'Green', managerName: 'Mike Johnson', dataCenterId: dc.id, plannedStart: new Date().toISOString(), plannedEnd: new Date(Date.now() + 90 * 864e5).toISOString(), percentComplete: 0, budget: 1e6, actualSpend: 0, template: 'Hall Fit-out', notes: JSON.stringify({ rackPositions: 20, designPowerKw: 160 }) });
  TEMPLATE_REGISTRY['Hall Fit-out'].milestones.forEach((name, i) => db.create('milestones', { id: `MS-SMOKE-${i}`, msId: `MS-SMOKE-${i}`, projectId: id, name, dueDate: new Date(Date.now() + (i + 1) * 864e5 * 10).toISOString(), status: 'Not Started', rag: 'Grey' }));
  const inst = startProjectProcess(db, get<T.Project>('projects', id)!, actor)!;
  ok(inst.definitionKey === 'project-hall-fitout' && inst.currentElementIds.includes('design'), 'process started at Review hall design');
  ok(startProjectProcess(db, get<T.Project>('projects', id)!, actor)?.id === inst.id, 'starting again returns the running instance');
  const parsed = modelParsed('project-hall-fitout');
  for (let i = 0; i < 6; i++) { const t = openTasksOf(db, inst.id)[0]; if (!t) break; completeTaskIn(db, parsed, t.id, { approved: true, openItems: 0 }, actor); }
  let cur = projectInstanceOf(db, id)!;
  ok(cur.currentElementIds.includes('wait_power'), `waits at the power and cooling work step (${cur.currentElementIds})`);
  const raised = all<T.WorkOrder>('workOrders').filter((w) => w.projectId === id && w.projectStepId === 'wait_power');
  ok(raised.length >= 3, `the work step raised its work orders (${raised.length})`);
  ok(raised.every((w) => get<T.ChangeRequest>('changeRequests', w.changeRequestId)?.workOrderId === w.id), 'each with its change');
  ok(get<T.Project>('projects', id)?.status === 'Active', 'project became Active');
  ok(get<T.Milestone>('milestones', 'MS-SMOKE-0')?.status === 'Completed', 'Design sign-off milestone completed');
  ok(raiseWorkForStep(db, id, 'wait_power', actor).length === 0, 'raising again while work is open does nothing');
  ok(advanceProjectIfDone(db, id, actor).length === 0, 'does not move while work orders are open');
  for (const w of raised.slice(0, -1)) finish(ops, w.id);
  ok(projectInstanceOf(db, id)!.currentElementIds.includes('wait_power'), 'still waiting with one work order open');
  finish(ops, raised[raised.length - 1].id);
  cur = projectInstanceOf(db, id)!;
  ok(cur.currentElementIds.includes('wait_racks'), `last work order closed: moved on to the rack step (${cur.currentElementIds})`);
  ok(get<T.Milestone>('milestones', 'MS-SMOKE-1')?.status === 'Completed', 'Power & cooling fit milestone completed');
  ok(all<T.WorkOrder>('workOrders').some((w) => w.projectId === id && w.projectStepId === 'wait_racks'), 'the rack step raised its work orders');
});

await section('Seeded project: closing the step it waits on moves it forward', () => {
  const pis = all<T.ProcessInstance>('processInstances');
  const target = all<T.Project>('projects').find((p) => p.status === 'Active' && pis.some((i) => i.recordType === 'project' && i.recordId === p.id && i.state === 'active' && i.currentElementIds.some((el) => isWorkWait(i.definitionKey, el))));
  ok(target, 'a seeded project waits on a work step'); if (!target) return;
  const inst = projectInstanceOf(db, target.id)!;
  const step = inst.currentElementIds.find((el) => isWorkWait(inst.definitionKey, el))!;
  for (const w of all<T.WorkOrder>('workOrders').filter((x) => x.projectId === target.id && x.projectStepId === step)) finish(ops, w.id);
  const after = projectInstanceOf(db, target.id)!;
  ok(after.completedElementIds.includes(step) && !after.currentElementIds.includes(step), `${target.id} moved past ${step} (now ${after.currentElementIds})`);
});

console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
