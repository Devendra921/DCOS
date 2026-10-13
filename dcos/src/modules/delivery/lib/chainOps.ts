/**
 * Delivery chain operations — pure functions over a MockDB instance (the app passes its `db`,
 * scripts pass their own), so the same code runs on screens, in the smoke script and in the
 * engine's job worker.
 *
 *   • Projects: `startProjectProcess` starts the template's process (PROCESS_FOR_TEMPLATE);
 *     when the token reaches a work step the job worker raises the step's work orders
 *     (`raiseWorkForStep`), and `advanceProjectIfDone` correlates "work orders closed" once
 *     every work order of the step is closed. Milestones, progress and status follow the
 *     process (`syncProject`), and a finished phase releases the phases that waited on it.
 *   • Work orders and changes: one change per work order. Standard changes are approved by
 *     their template and run without a P05 process (no board to route through; the work
 *     order's P10 process is the record of the work). Normal and emergency changes run P05;
 *     every work order runs P10, and contractor work orders get a P12 site access request.
 *     Each action below moves those processes with the record.
 */
import type { MockDB } from '../../../mock/db/store';
import type * as T from '../../../mock/data/types';
import type { WorkOrderType } from '../../../mock/data/enums';
import { PEOPLE } from '../../../mock/db/seed/ctx';
import { PROCESS_BY_KEY, outgoing } from '../../../workorders/model';
import { cancelInstanceIn, correlateMessageIn, driveTask, getInstanceIn, modelParsed, onInstanceMoved, registerJobWorker, startInstanceIn } from '../../workorders/lib/engineCore';
import { classifyChange, DELIVERY_DATA_KEYS, deliveryDataFromSnapshot, freezeFor, stepWorkDone, type DeliveryData } from './chainRules';
import { isProjectProcess, isWorkWait, milestoneStates, planWorkForStep, processKeyFor, RAISE_TASK_TYPE, stepKeyOf, TEMPLATE_FOR_PROCESS, type WorkOrderDraft } from './projectProcess';
import { TEMPLATE_REGISTRY } from './projectTemplates';
import { createMaterialOps, RECEIVE_TASKS } from './materialOps';

const now = () => new Date().toISOString();
const base = (actor: string) => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: actor, createdById: 'me' });
const rows = <X>(db: MockDB, entity: string) => db.getAllRaw(entity) as unknown as X[];
const get = <X>(db: MockDB, entity: string, id: string | undefined) => (id ? db.getById(entity, id) as unknown as X | undefined : undefined);

/** Next sequential id: PREFIX-0001, PREFIX-0002… */
export function nextSeqIn(db: MockDB, entity: string, prefix: string, offset = 0): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = rows<{ id: string }>(db, entity).reduce((m, r) => { const x = re.exec(r.id); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${prefix}-${String(max + 1 + offset).padStart(4, '0')}`;
}
/** The delivery bundle read straight from a MockDB. */
export const deliveryDataOf = (db: MockDB): DeliveryData => deliveryDataFromSnapshot(Object.fromEntries(DELIVERY_DATA_KEYS.map(k => [k, db.getAllRaw(k)])));
export type AuditFn = (entityType: string, entityId: string, action: string, summary: string) => void;
export const auditIn = (db: MockDB, actor: string): AuditFn => (entityType, entityId, action, summary) => {
  const t = now();
  db.create('auditEvents', { audId: `AUD-LIVE-${Date.now().toString().slice(-6)}`, entityType, entityId, action, actorName: actor, timestamp: t, summary, customerId: 'CUST-001', isDeleted: false, createdAt: t, updatedAt: t, createdBy: actor, createdById: 'me' });
};

// ── Raising a work order and its change ──────────────────────────────────────
export const CHANGE_TYPE_FOR: Record<WorkOrderType, T.ChangeRequest['type']> = {
  RackInstall: 'RackDeploy', Cabling: 'RackDeploy', PowerConnect: 'PowerUpgrade', DeviceDeploy: 'RackDeploy', DeviceRemoval: 'Decommission', Migration: 'ServerRelocation',
  PlantInstall: 'PowerUpgrade', PlantCutIn: 'PowerUpgrade', Commissioning: 'RackDeploy', Civil: 'PowerUpgrade', Inspection: 'ConfigPush', Disposal: 'Decommission', CircuitTurnUp: 'NetworkMigration', Configuration: 'ConfigPush',
};
/** Next weekly change board (Thursdays 10:00, board time = UTC in this prototype) on or after a date. */
export function nextChangeBoard(fromIso: string): string {
  const d = new Date(fromIso); d.setUTCHours(10, 0, 0, 0);
  while (d.getUTCDay() !== 4 || d.toISOString() < fromIso) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export interface RaiseWorkOrderInput {
  type: WorkOrderType; title: string; description?: string;
  dataCenterId?: string; projectId?: string; programId?: string; plannerPlanId?: string; projectStepId?: string;
  plannedStart: string; plannedEnd: string; deviceIds?: string[]; rackIds?: string[];
  assigneeKind?: 'internal' | 'contractor'; assigneeName?: string; contractorVendorId?: string; crew?: string[];
  priority?: T.WorkOrder['priority']; emergency?: boolean;
  /** Facts that decide whether a standard template applies. */
  kw?: number; devices?: number; criticalServices?: boolean; liveSite?: boolean;
  /** False when the work is not routine for its type (no standard template may apply). */
  standardAllowed?: boolean;
  /** Submit a normal change for approval straight away (work raised by a project step is). */
  submit?: boolean;
  implementationPlan?: string; backoutPlan?: string; testPlan?: string;
  /** Impact analysis at raise time, stored on the change. */
  impactSummary?: string; affectedServiceIds?: string[]; affectedCustomerIds?: string[];
}
export interface RaisePlan { workOrder: T.WorkOrder; change: T.ChangeRequest; approvals: T.ApprovalStep[]; reasons: string[] }

/** The work order, its change and the change's approval steps (pure). */
export function planRaiseWorkOrder(d: Pick<DeliveryData, 'changeFreezes' | 'standardChangeTemplates' | 'approvalMatrixRules'>, input: RaiseWorkOrderInput, actor: string, ids: { wo: string; chg: string; step: (i: number) => string }, at = now()): RaisePlan {
  const draftWo = { type: input.type, dataCenterId: input.dataCenterId, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd } as T.WorkOrder;
  const cls = classifyChange(d, draftWo, { kw: input.kw, devices: input.devices ?? input.deviceIds?.length, criticalServices: input.criticalServices, liveSite: input.liveSite, emergency: input.emergency, noStandard: input.standardAllowed === false, at });
  const freeze = cls.freeze ?? freezeFor(d, input.dataCenterId, input.plannedStart, input.plannedEnd);
  const standard = cls.changeClass === 'Standard'; const emergency = cls.changeClass === 'Emergency';
  const changeType = (standard ? cls.template?.changeType : undefined) ?? CHANGE_TYPE_FOR[input.type];
  const risk: T.ChangeRequest['risk'] = standard ? 'Low' : emergency || input.criticalServices ? 'High' : input.liveSite ? 'Medium' : 'Low';
  const rule = d.approvalMatrixRules.find(r => r.changeType === changeType && r.riskLevel === risk) ?? d.approvalMatrixRules.find(r => r.changeType === changeType) ?? d.approvalMatrixRules.find(r => r.riskLevel === risk);
  const stages = rule?.stages ?? [{ order: 1, approverRole: 'ChangeApprover' as const, requiredCount: 1 }];
  const stepRows = standard ? [] : emergency ? [{ order: 1, approverRole: 'ChangeApprover' as T.ApprovalStep['approverRole'] }] : stages.flatMap(st => Array.from({ length: st.requiredCount }, () => ({ order: st.order, approverRole: st.approverRole })));
  const approvals: T.ApprovalStep[] = stepRows.map((st, i) => { const id = ids.step(i); return { id, apstepId: id, ...base(actor), changeRequestId: ids.chg, order: st.order, approverRole: st.approverRole, decision: 'Pending' } as T.ApprovalStep; });
  const submitted = !standard && (emergency || input.submit);
  const status: T.ChangeRequest['status'] = standard ? 'Approved' : submitted ? 'Submitted' : 'Draft';
  const change: T.ChangeRequest = {
    id: ids.chg, chgId: ids.chg, ...base(actor), title: input.title, type: changeType, description: input.description ?? input.title, risk,
    status, priority: input.priority === 'Critical' ? 'Urgent' : input.priority === 'High' ? 'High' : input.priority === 'Low' ? 'Low' : 'Medium',
    affectedResourceType: input.rackIds?.length ? 'Rack' : 'Asset', affectedResourceIds: [...(input.rackIds ?? []), ...(input.deviceIds ?? [])],
    dataCenterId: input.dataCenterId, requestedBy: actor, requestedById: 'me', policyViolations: freeze && !emergency ? [`Window falls in the freeze "${freeze.name}"`] : [],
    scheduledStart: input.plannedStart, scheduledEnd: input.plannedEnd, approvalRuleId: standard || emergency ? undefined : rule?.id, source: 'Internal',
    rollbackPlan: input.backoutPlan ?? cls.template?.backout, implementationPlan: input.implementationPlan ?? cls.template?.steps.join('\n'), testPlan: input.testPlan, backoutPlan: input.backoutPlan ?? cls.template?.backout,
    projectId: input.projectId, programId: input.programId, plannerPlanId: input.plannerPlanId, projectStepId: input.projectStepId, workOrderId: ids.wo, linkedWorkOrderId: ids.wo,
    changeClass: cls.changeClass, standardTemplateId: standard ? cls.template?.id : undefined, freezeId: freeze?.id,
    approvedAt: standard ? at : undefined, submittedAt: submitted ? at : undefined, cabDate: emergency ? at : submitted ? nextChangeBoard(at) : undefined,
    impactSummary: input.impactSummary, affectedServiceIds: input.affectedServiceIds, affectedCustomerIds: input.affectedCustomerIds,
  } as T.ChangeRequest;
  const workOrder: T.WorkOrder = {
    id: ids.wo, woId: ids.wo, ...base(actor), type: input.type, title: input.title, description: input.description, changeRequestId: ids.chg,
    projectId: input.projectId, programId: input.programId, plannerPlanId: input.plannerPlanId, projectStepId: input.projectStepId, dataCenterId: input.dataCenterId,
    rackId: input.rackIds?.[0], rackIds: input.rackIds, deviceIds: input.deviceIds, assigneeName: input.assigneeName ?? '', assigneeKind: input.assigneeKind ?? 'internal',
    contractorVendorId: input.contractorVendorId, crew: input.crew, status: standard ? 'Ready' : submitted ? 'Awaiting change approval' : 'Draft', scheduledDate: input.plannedStart,
    plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, priority: input.priority ?? 'Medium', standardTemplateId: standard ? cls.template?.id : undefined,
  } as T.WorkOrder;
  return { workOrder, change, approvals, reasons: cls.reasons };
}

const SKILL: Partial<Record<WorkOrderType, string>> = { RackInstall: 'Rigging & rack assembly', Cabling: 'Structured cabling (fibre & copper)', PowerConnect: 'Licensed electrician', DeviceDeploy: 'Device install & bring-up', PlantCutIn: 'HV/LV authorised person', PlantInstall: 'Plant installation', Civil: 'Construction', Migration: 'Device install & bring-up', CircuitTurnUp: 'Optical turn-up' };

/** Write a planned work order and change, and start their processes (P05 for normal and emergency changes, P10 for the work order, P12 for a contractor's site access). */
export function writeRaisePlan(db: MockDB, p: RaisePlan, actor: string): RaisePlan {
  db.create('changeRequests', p.change as unknown as Record<string, unknown>);
  db.create('workOrders', p.workOrder as unknown as Record<string, unknown>);
  for (const a of p.approvals) db.create('approvalSteps', a as unknown as Record<string, unknown>);
  const wo = p.workOrder; const cr = p.change;
  // Materials: the work order takes its step's lines, its template's kit or its work type's default kit.
  const lines = createMaterialOps(db, actor).linesForWorkOrder(wo.id);
  if (cr.changeClass !== 'Standard') {
    const pi = startInstanceIn(db, modelParsed('change'), cr.chgId, { recordType: 'changeRequest', recordId: cr.id, dataCenterId: cr.dataCenterId, title: cr.title, variables: { risk: cr.risk, changeClass: cr.changeClass, scopeSize: cr.affectedResourceIds.length, workOrderId: wo.id } }, actor);
    if (cr.status === 'Submitted') driveTask(db, modelParsed('change'), pi.id, 'raise', { complete: true }, actor);
  }
  const p10 = startInstanceIn(db, modelParsed('work-order'), wo.woId, { recordType: 'workOrder', recordId: wo.id, dataCenterId: wo.dataCenterId, title: wo.title, variables: { workType: wo.type, changeRequestId: cr.id, hasMaterials: lines.length > 0, skillResult: { skill: SKILL[wo.type] ?? 'General', permit: wo.type === 'PowerConnect' || wo.type === 'PlantCutIn' ? 'Electrical work permit (LOTO)' : 'Change window ticket' } } }, actor);
  const patch: Record<string, unknown> = { processInstanceId: p10.id };
  if (wo.assigneeKind === 'contractor') patch.accessRequestId = startAccessRequest(db, { ...wo, ...patch } as T.WorkOrder, actor).id;
  db.update('workOrders', wo.id, patch);
  return { ...p, workOrder: { ...wo, ...patch } as T.WorkOrder };
}
/** P12 site access for a contractor crew. Bound to the site (recordType 'dataCenter') with `variables.workOrderId`, so the work order's own process stays P10. */
export function startAccessRequest(db: MockDB, wo: T.WorkOrder, actor: string): T.ProcessInstance {
  const vendor = get<T.Vendor>(db, 'vendors', wo.contractorVendorId);
  return startInstanceIn(db, modelParsed('access-request'), wo.woId, { recordType: 'dataCenter', recordId: wo.dataCenterId ?? wo.id, dataCenterId: wo.dataCenterId, title: `${vendor?.name ?? 'Contractor'} crew · ${wo.title}`, variables: { workOrderId: wo.id, vendorId: wo.contractorVendorId, crew: wo.crew ?? [], visitStart: wo.plannedStart, visitEnd: wo.plannedEnd } }, actor);
}
/** Whether a contractor's site access request is approved and not closed or denied. */
export function accessApproved(pi: T.ProcessInstance | undefined): boolean {
  return !!pi && pi.definitionKey === 'access-request' && pi.state === 'active' && pi.completedElementIds.includes('approve_zones') && !pi.completedElementIds.includes('end_denied');
}

// ── Projects ─────────────────────────────────────────────────────────────────
const runningOf = (db: MockDB, projectId: string) => rows<T.ProcessInstance>(db, 'processInstances').filter(i => i.recordType === 'project' && i.recordId === projectId && i.state !== 'cancelled').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

/** Start the template's process for a project (idempotent: returns the existing one). */
export function startProjectProcess(db: MockDB, project: T.Project, actor: string): T.ProcessInstance | undefined {
  const key = processKeyFor(project.template); if (!key) return undefined;
  const existing = runningOf(db, project.id); if (existing) return existing;
  const tpl = TEMPLATE_REGISTRY[project.template as keyof typeof TEMPLATE_REGISTRY];
  // Material lines per step from the project's bill of materials (none yet when it has no BOM).
  createMaterialOps(db, actor, auditIn(db, actor)).planProjectMaterials(project.id);
  return startInstanceIn(db, modelParsed(key), project.projId, { recordType: 'project', recordId: project.id, dataCenterId: project.dataCenterId, title: project.name, variables: { projectId: project.id, programId: project.programId, template: project.template, templateCategory: tpl?.category, budget: project.budget, plannerPlanId: project.plannerPlanId } }, actor);
}

const CREW = ['J. Alvarez', 'M. Okafor', 'S. Lindqvist', 'R. Das', 'K. Brennan', 'T. Nakamura', 'P. Moreau', 'A. Kowalski', 'L. Haddad', 'D. Mensah'];
/** A site technician for a data centre (site staff first, then the field team). */
export function technicianFor(dc: T.DataCenter | undefined, i = 0): string {
  const local = PEOPLE.filter(p => dc?.code && p.site && dc.code.startsWith(p.site) && /Technician|Facilities Engineer/.test(p.role));
  const pool = local.length ? local : PEOPLE.filter(p => p.role === 'Field Technician' || p.role === 'Site Technician');
  return pool[i % pool.length].name;
}
/** A contractor company for a work category, with a named crew. */
export function contractorFor(vendors: T.Vendor[], category: WorkOrderDraft['vendorCategory'], i = 0): { vendorId?: string; crew: string[] } {
  const pool = vendors.filter(v => v.status === 'Active' && v.category === (category ?? 'Services'));
  const all = pool.length ? pool : vendors.filter(v => v.category === 'Services');
  const v = all.length ? all[i % all.length] : undefined;
  return { vendorId: v?.id, crew: [CREW[i % CREW.length], CREW[(i + 3) % CREW.length], ...(i % 2 ? [CREW[(i + 6) % CREW.length]] : [])] };
}
/** Turn a work-step draft into a raise input for a project. */
export function draftToInput(d: Pick<DeliveryData, 'vendors' | 'dataCenters'>, project: T.Project, waitId: string, draft: WorkOrderDraft, i: number, opts: { assignInternal?: boolean; submit?: boolean } = {}): RaiseWorkOrderInput {
  const dc = d.dataCenters.find(x => x.id === project.dataCenterId);
  const c = draft.assigneeKind === 'contractor' ? contractorFor(d.vendors, draft.vendorCategory, i) : undefined;
  return {
    type: draft.type, title: draft.title, description: draft.description, dataCenterId: project.dataCenterId, projectId: project.id, programId: project.programId, plannerPlanId: project.plannerPlanId, projectStepId: waitId,
    plannedStart: draft.plannedStart, plannedEnd: draft.plannedEnd, rackIds: draft.rackIds, assigneeKind: draft.assigneeKind,
    assigneeName: c ? (d.vendors.find(v => v.id === c.vendorId)?.contactName ?? '') : opts.assignInternal ? technicianFor(dc, i) : '',
    contractorVendorId: c?.vendorId, crew: c?.crew, priority: draft.priority, kw: draft.kw, devices: draft.devices, criticalServices: draft.criticalServices, liveSite: draft.liveSite,
    standardAllowed: draft.standardAllowed, submit: opts.submit, implementationPlan: draft.implementationPlan, testPlan: draft.testPlan, backoutPlan: draft.backoutPlan,
  };
}

/**
 * Raise the work orders (each with its change) of a project's work step. `stepId` may be the
 * step key, its raise task or its wait event. Nothing is raised while the step still has open
 * work orders. Normal changes are submitted for approval straight away.
 */
export function raiseWorkForStep(db: MockDB, projectId: string, stepId: string, actor: string, opts: { start?: string; submit?: boolean; audit?: AuditFn } = {}): RaisePlan[] {
  const project = get<T.Project>(db, 'projects', projectId); if (!project) return [];
  const key = processKeyFor(project.template); if (!key) return [];
  const waitId = `wait_${stepKeyOf(stepId)}`;
  if (!isWorkWait(key, waitId)) return [];
  const d = deliveryDataOf(db);
  if (d.workOrders.some(w => w.projectId === projectId && w.projectStepId === waitId && ['Draft', 'Awaiting change approval', 'Ready', 'Assigned', 'InProgress', 'Validated'].includes(w.status))) return [];
  const racks = rows<T.Rack>(db, 'racks').filter(r => r.dataCenterId === project.dataCenterId && r.status !== 'Retired').slice(0, 24);
  const start = opts.start ?? new Date(Date.now() + 2 * 864e5).toISOString();
  const drafts = planWorkForStep(project, key, waitId, { start, racks });
  const audit = opts.audit ?? auditIn(db, actor);
  const out: RaisePlan[] = [];
  drafts.forEach((draft, i) => {
    const input = draftToInput(d, project, waitId, draft, i, { submit: opts.submit ?? true });
    const ids = { wo: nextSeqIn(db, 'workOrders', 'WO'), chg: nextSeqIn(db, 'changeRequests', 'CHG'), step: (k: number) => nextSeqIn(db, 'approvalSteps', 'APSTEP', k) };
    const plan = writeRaisePlan(db, planRaiseWorkOrder({ ...d, changeFreezes: rows(db, 'changeFreezes'), standardChangeTemplates: rows(db, 'standardChangeTemplates') }, input, actor, ids), actor);
    audit('WorkOrder', plan.workOrder.id, 'created', `${plan.workOrder.title}; change ${plan.change.id} (${plan.change.changeClass}) raised by ${project.name}`);
    out.push(plan);
  });
  return out;
}

/** Correlate "work orders closed" for every work step of the project whose work orders are all closed. Returns the steps that moved on. */
export function advanceProjectIfDone(db: MockDB, projectId: string, actor: string): string[] {
  const inst = runningOf(db, projectId);
  if (!inst || inst.state !== 'active' || !isProjectProcess(inst.definitionKey)) return [];
  const moved: string[] = [];
  for (const el of [...inst.currentElementIds]) {
    if (!isWorkWait(inst.definitionKey, el)) continue;
    const wos = rows<T.WorkOrder>(db, 'workOrders').filter(w => w.projectId === projectId && w.projectStepId === el);
    if (!stepWorkDone(wos)) continue;
    correlateMessageIn(db, modelParsed(inst.definitionKey), inst.id, el, { workOrdersClosed: wos.filter(w => w.status === 'Completed').length }, actor);
    moved.push(el);
  }
  return moved;
}

/** Milestones, progress and status of a project follow its process; a finished phase releases the phases waiting on it. */
export function syncProject(db: MockDB, inst: T.ProcessInstance, actor: string): void {
  const project = get<T.Project>(db, 'projects', inst.recordId); if (!project) return;
  const states = milestoneStates(inst.definitionKey, inst);
  const ms = rows<T.Milestone>(db, 'milestones').filter(m => m.projectId === project.id);
  const t = now();
  for (const s of states) {
    const m = ms.find(x => x.name === s.name); if (!m) continue;
    const status: T.Milestone['status'] = s.state === 'Completed' ? 'Completed' : s.state === 'In Progress' ? (m.dueDate < t ? 'Delayed' : 'In Progress') : 'Not Started';
    if (status !== m.status) db.update('milestones', m.id, { status, rag: status === 'Completed' ? 'Green' : status === 'Delayed' ? 'Red' : status === 'In Progress' ? 'Green' : 'Grey', updatedAt: t });
  }
  const pct = states.length ? Math.round((states.filter(s => s.state === 'Completed').length / states.length) * 100) : project.percentComplete;
  const patch: Record<string, unknown> = {};
  if (inst.state === 'completed') Object.assign(patch, { status: 'Completed', percentComplete: 100, rag: 'Green' });
  else {
    if (pct !== project.percentComplete && pct > project.percentComplete) patch.percentComplete = pct;
    if (project.status === 'Planning' && inst.completedElementIds.length > 2) patch.status = 'Active';
  }
  if (Object.keys(patch).length) db.update('projects', project.id, { ...patch, updatedAt: t });
  if (inst.state === 'completed') {
    for (const dep of rows<T.Project>(db, 'projects').filter(p => p.dependsOnProjectIds?.includes(project.id) && p.status === 'Blocked')) {
      const ready = (dep.dependsOnProjectIds ?? []).every(id => id === project.id || get<T.Project>(db, 'projects', id)?.status === 'Completed');
      if (!ready) continue;
      db.update('projects', dep.id, { status: 'Active', updatedAt: t });
      startProjectProcess(db, { ...dep, status: 'Active' }, actor);
    }
  }
}

// ── Engine hooks ─────────────────────────────────────────────────────────────
registerJobWorker(RAISE_TASK_TYPE, ({ db, instance, elementId, actor }) => {
  if (instance.recordType !== 'project') return;
  const p = PROCESS_BY_KEY[instance.definitionKey];
  const wait = p ? outgoing(p, elementId)[0]?.[1] : undefined;
  if (wait && instance.currentElementIds.includes(wait)) raiseWorkForStep(db, instance.recordId, wait, actor, { submit: true });
});
onInstanceMoved((db, inst, actor) => {
  if (inst.recordType === 'project' && isProjectProcess(inst.definitionKey)) syncProject(db, inst, actor);
  // A "Receive…" task reached after every purchased line is already in completes at once.
  const recv = RECEIVE_TASKS[inst.definitionKey];
  if (recv && inst.state === 'active' && inst.currentElementIds.includes(recv)) {
    const projectId = inst.recordType === 'project' ? inst.recordId : (db.getAllRaw('projects') as unknown as T.Project[]).find(p => p.plannerPlanId && p.plannerPlanId === inst.recordId)?.id;
    if (projectId) createMaterialOps(db, actor, auditIn(db, actor)).completeReceiveIfDone(projectId);
  }
});
/** P10 "Request kit": ask the supply chain platform for the work order's kit (skipped once work has started: the kit is issued from what is at the site). */
registerJobWorker('dcos.request-kit', ({ db, instance, actor }) => {
  if (instance.recordType !== 'workOrder') return;
  const wo = get<T.WorkOrder>(db, 'workOrders', instance.recordId);
  if (!wo || ['InProgress', 'Validated', 'Completed', 'Failed', 'Cancelled'].includes(wo.status)) return;
  createMaterialOps(db, actor, auditIn(db, actor)).requestKit(wo.id);
});

// ── Work order and change actions ────────────────────────────────────────────
const processOf = (db: MockDB, recordType: T.ProcessRecordType, recordId: string) => rows<T.ProcessInstance>(db, 'processInstances').filter(i => i.recordType === recordType && i.recordId === recordId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
const p05Of = (db: MockDB, changeId: string) => processOf(db, 'changeRequest', changeId).find(i => i.definitionKey === 'change' && i.state === 'active');
const p10Of = (db: MockDB, wo: T.WorkOrder) => (get<T.ProcessInstance>(db, 'processInstances', wo.processInstanceId) ?? processOf(db, 'workOrder', wo.id).find(i => i.definitionKey === 'work-order'));
const accessOf = (db: MockDB, wo: T.WorkOrder) => get<T.ProcessInstance>(db, 'processInstances', wo.accessRequestId) ?? rows<T.ProcessInstance>(db, 'processInstances').find(i => i.definitionKey === 'access-request' && i.variables?.workOrderId === wo.id);
/** Move P05 to the task at `el`. `catchUp` only once the change has passed its approval (the approval task is never auto-completed). */
const driveP05 = (db: MockDB, changeId: string, el: string, vars: Record<string, unknown>, actor: string, opts: { boundaryId?: string; catchUp?: boolean } = {}) => { const pi = p05Of(db, changeId); if (pi) driveTask(db, modelParsed('change'), pi.id, el, vars, actor, { ...opts, never: el === 'approve' ? [] : ['raise', 'approve'] }); };
const driveP10 = (db: MockDB, wo: T.WorkOrder, el: string, vars: Record<string, unknown>, actor: string) => { const pi = p10Of(db, wo); if (pi?.state === 'active') driveTask(db, modelParsed('work-order'), pi.id, el, vars, actor, { catchUp: true }); };
const OPEN_WO: T.WorkOrder['status'][] = ['Draft', 'Awaiting change approval', 'Ready', 'Assigned', 'InProgress', 'Validated'];

export interface FreezeInput { name: string; dataCenterId?: string; start: string; end: string; reason: string; allows: T.ChangeFreeze['allows']; owner: string }

/** The chain actions over a MockDB. `useChainActions()` (workflowChain.ts) wraps these for screens. */
export function createChainOps(db: MockDB, actor: string, audit: AuditFn = auditIn(db, actor)) {
  const upd = (entity: string, id: string, patch: Record<string, unknown>) => { db.update(entity, id, { ...patch, updatedAt: now(), updatedBy: actor }); };
  const change = (id: string) => get<T.ChangeRequest>(db, 'changeRequests', id);
  const workOrder = (id: string) => get<T.WorkOrder>(db, 'workOrders', id);
  const windowOf = (changeId: string) => rows<T.MaintenanceWindow>(db, 'maintenanceWindows').find(w => w.changeRequestId === changeId && w.status !== 'Cancelled');
  const endProcesses = (wo: T.WorkOrder | undefined, reason: string) => {
    if (!wo) return;
    const p10 = p10Of(db, wo); if (p10?.state === 'active') cancelInstanceIn(db, p10.id, actor, reason);
    const acc = accessOf(db, wo); if (acc?.state === 'active') cancelInstanceIn(db, acc.id, actor, reason);
  };
  const ops = {
    actor,
    /** Raise a work order and its change. Standard changes are approved at once and the work order is Ready. */
    raiseWorkOrder(d: DeliveryData | undefined, input: RaiseWorkOrderInput): RaisePlan {
      const data = d ?? deliveryDataOf(db);
      const ids = { wo: nextSeqIn(db, 'workOrders', 'WO'), chg: nextSeqIn(db, 'changeRequests', 'CHG'), step: (k: number) => nextSeqIn(db, 'approvalSteps', 'APSTEP', k) };
      const p = writeRaisePlan(db, planRaiseWorkOrder(data, input, actor, ids), actor);
      audit('WorkOrder', p.workOrder.id, 'created', `${p.workOrder.title}; change ${p.change.id} (${p.change.changeClass})`);
      return p;
    },
    /** Submit a draft change for approval; a normal change goes to the next weekly change board (Thursday 10:00). */
    submitChange(changeId: string) {
      const cr = change(changeId); if (!cr || cr.changeClass === 'Standard') return;
      upd('changeRequests', changeId, { status: 'Submitted', submittedAt: now(), cabDate: cr.changeClass === 'Emergency' ? now() : nextChangeBoard(now()) });
      if (cr.workOrderId) upd('workOrders', cr.workOrderId, { status: 'Awaiting change approval' });
      driveP05(db, changeId, 'raise', { complete: true }, actor);
      audit('ChangeRequest', changeId, 'submitted', cr.changeClass === 'Emergency' ? 'Submitted to the emergency board' : `Submitted for the change board on ${nextChangeBoard(now()).slice(0, 10)}`);
    },
    /**
     * Record one approval decision, in order: a step can only be decided once every step
     * before it is decided. The change is Approved when every step is approved (Scheduled when
     * its window is already booked), Rejected on any rejection.
     */
    decideStep(changeId: string, stepId: string, decision: 'Approved' | 'Rejected', comment?: string): { ok: boolean; reason?: string } {
      const steps = rows<T.ApprovalStep>(db, 'approvalSteps').filter(s => s.changeRequestId === changeId).sort((a, b) => a.order - b.order);
      const step = steps.find(s => s.id === stepId);
      if (!step) return { ok: false, reason: 'Approval step not found.' };
      if (step.decision !== 'Pending') return { ok: false, reason: 'This step is already decided.' };
      const earlier = steps.find(s => s.order < step.order && (s.decision === 'Pending'));
      if (earlier) return { ok: false, reason: `Step ${earlier.order} (${earlier.approverRole}) has to be decided first.` };
      upd('approvalSteps', stepId, { decision, decidedAt: now(), approverId: 'me', comment });
      const all = rows<T.ApprovalStep>(db, 'approvalSteps').filter(s => s.changeRequestId === changeId);
      const passed = (s: T.ApprovalStep) => s.decision === 'Approved' || s.decision === 'Delegated';
      const win = windowOf(changeId);
      const status: T.ChangeRequest['status'] = all.some(s => s.decision === 'Rejected') ? 'Rejected' : all.every(passed) ? (win ? 'Scheduled' : 'Approved') : 'UnderReview';
      upd('changeRequests', changeId, { status, ...(status === 'Approved' || status === 'Scheduled' ? { approvedAt: now() } : {}) });
      const cr = change(changeId);
      const wo = cr?.workOrderId ? workOrder(cr.workOrderId) : undefined;
      if (wo && OPEN_WO.includes(wo.status)) upd('workOrders', wo.id, { status: status === 'Approved' || status === 'Scheduled' ? (wo.assigneeName ? 'Assigned' : 'Ready') : status === 'Rejected' ? 'Cancelled' : 'Awaiting change approval' });
      if (status === 'Approved' || status === 'Scheduled' || status === 'Rejected') driveP05(db, changeId, 'approve', { approved: status !== 'Rejected', comment }, actor);
      if (status === 'Scheduled') driveP05(db, changeId, 'schedule', { approved: true, signedBy: actor }, actor);
      if (status === 'Rejected') { endProcesses(wo, 'Change rejected'); if (win) upd('maintenanceWindows', win.id, { status: 'Cancelled' }); if (wo) createMaterialOps(db, actor, audit).releaseWorkOrder(wo.id, 'Change rejected'); }
      audit('ChangeRequest', changeId, decision === 'Approved' ? 'approved' : 'rejected', `${step.approverRole} (step ${step.order}): ${comment ?? decision}`);
      return { ok: true };
    },
    /** Book (or move) the maintenance window of a change. A window in a freeze is flagged on a non-emergency change. */
    scheduleChange(changeId: string, start: string, end: string, impact: string) {
      const cr = change(changeId); if (!cr) return;
      const existing = windowOf(changeId);
      if (existing) upd('maintenanceWindows', existing.id, { scheduledStart: start, scheduledEnd: end, impact, status: 'Scheduled' });
      else { const id = nextSeqIn(db, 'maintenanceWindows', 'MW'); db.create('maintenanceWindows', { id, mwId: id, ...base(actor), title: cr.title, status: 'Scheduled', dataCenterId: cr.dataCenterId, changeRequestId: changeId, scheduledStart: start, scheduledEnd: end, affectedDeviceIds: cr.affectedResourceIds, impact, owner: actor, plannerPlanId: cr.plannerPlanId }); }
      const freeze = freezeFor({ changeFreezes: rows<T.ChangeFreeze>(db, 'changeFreezes').filter(f => !f.isDeleted) }, cr.dataCenterId, start, end);
      const flag = freeze && cr.changeClass !== 'Emergency' ? [`Window falls in the freeze "${freeze.name}"`] : [];
      upd('changeRequests', changeId, { scheduledStart: start, scheduledEnd: end, status: cr.status === 'Approved' && cr.changeClass !== 'Standard' ? 'Scheduled' : cr.status, freezeId: freeze?.id, policyViolations: [...cr.policyViolations.filter(v => !v.startsWith('Window falls in the freeze')), ...flag], ...(impact && !cr.impactSummary ? { impactSummary: impact } : {}) });
      if (cr.workOrderId) upd('workOrders', cr.workOrderId, { plannedStart: start, plannedEnd: end, scheduledDate: start });
      if (cr.status === 'Approved') driveP05(db, changeId, 'schedule', { approved: true, signedBy: actor }, actor);
      audit('ChangeRequest', changeId, 'scheduled', `${start.slice(0, 16)} to ${end.slice(0, 16)}${freeze ? ` (in freeze "${freeze.name}")` : ''}`);
    },
    /** Assign a work order to a technician or a contractor crew (a contractor gets a site access request unless one is passed). */
    assignWorkOrder(workOrderId: string, a: { kind: 'internal' | 'contractor'; name?: string; vendorId?: string; crew?: string[]; accessRequestId?: string }) {
      upd('workOrders', workOrderId, { assigneeKind: a.kind, assigneeName: a.name ?? '', contractorVendorId: a.kind === 'contractor' ? a.vendorId : undefined, crew: a.crew, ...(a.accessRequestId ? { accessRequestId: a.accessRequestId } : {}) });
      const wo = workOrder(workOrderId); if (!wo) return;
      if (wo.status === 'Ready') upd('workOrders', workOrderId, { status: 'Assigned' });
      if (a.kind === 'contractor' && !wo.accessRequestId) upd('workOrders', workOrderId, { accessRequestId: startAccessRequest(db, wo, actor).id });
      driveP10(db, wo, 'assign', { approved: true, assignee: a.name }, actor);
      audit('WorkOrder', workOrderId, 'assigned', a.kind === 'contractor' ? `Contractor ${a.vendorId} (${(a.crew ?? []).join(', ')})` : a.name ?? '');
    },
    /** Hand a work order to someone else; the work order keeps its status, the dispatcher's P10 task is re-opened if needed. */
    reassignWorkOrder(workOrderId: string, a: { kind: 'internal' | 'contractor'; name?: string; vendorId?: string; crew?: string[]; accessRequestId?: string }, reason?: string) {
      const before = workOrder(workOrderId); if (!before) return;
      upd('workOrders', workOrderId, { assigneeKind: a.kind, assigneeName: a.name ?? '', contractorVendorId: a.kind === 'contractor' ? a.vendorId : undefined, crew: a.crew, ...(a.accessRequestId ? { accessRequestId: a.accessRequestId } : {}) });
      const wo = workOrder(workOrderId)!;
      if (a.kind === 'contractor' && (!wo.accessRequestId || wo.contractorVendorId !== before.contractorVendorId)) {
        const old = accessOf(db, before); if (old?.state === 'active') cancelInstanceIn(db, old.id, actor, 'Crew changed');
        upd('workOrders', workOrderId, { accessRequestId: a.accessRequestId ?? startAccessRequest(db, wo, actor).id });
      }
      audit('WorkOrder', workOrderId, 'reassigned', `${before.assigneeName || 'unassigned'} → ${a.name ?? a.vendorId ?? ''}${reason ? `: ${reason}` : ''}`);
    },
    /** Store the processes started for a work order elsewhere (P12 site access, P10 work order). */
    linkProcess(workOrderId: string, link: { accessRequestId?: string; processInstanceId?: string }) {
      const patch = Object.fromEntries(Object.entries(link).filter(([, v]) => !!v));
      if (Object.keys(patch).length) upd('workOrders', workOrderId, patch);
    },
    /** Start the work; refused while the change is not approved, inside a freeze unless the change is an emergency, and for a contractor without approved site access. */
    startWork(workOrderId: string): { ok: boolean; reason?: string } {
      const wo = workOrder(workOrderId); if (!wo) return { ok: false, reason: 'Work order not found.' };
      const cr = wo.changeRequestId ? change(wo.changeRequestId) : undefined;
      if (!cr || !['Approved', 'Scheduled', 'InProgress'].includes(cr.status)) return { ok: false, reason: 'The change for this work order is not approved yet.' };
      const freeze = freezeFor({ changeFreezes: rows<T.ChangeFreeze>(db, 'changeFreezes').filter(f => !f.isDeleted) }, cr.dataCenterId, now(), now());
      if (freeze && cr.changeClass !== 'Emergency') return { ok: false, reason: `The site is in the freeze "${freeze.name}"; only emergency changes may proceed.` };
      if (wo.assigneeKind === 'contractor' && !accessApproved(accessOf(db, wo))) return { ok: false, reason: 'The contractor crew has no approved site access request yet.' };
      const outside = outsideWindow(cr, Date.now());
      if (outside) return { ok: false, reason: outside };
      upd('workOrders', workOrderId, { status: 'InProgress', actualStart: now() }); upd('changeRequests', cr.id, { status: 'InProgress' });
      const win = windowOf(cr.id); if (win) upd('maintenanceWindows', win.id, { status: 'In Progress' });
      driveP05(db, cr.id, 'start_change', { acknowledged: true }, actor, { catchUp: true });
      driveP10(db, wo, 'accept', { acknowledged: true }, actor); driveP10(db, wo, 'start_work', { acknowledged: true }, actor);
      // The kit is issued to the crew; anything not at the site is a warning on the work order, never a block.
      createMaterialOps(db, actor, audit).issueKit(workOrderId);
      audit('WorkOrder', workOrderId, 'started', 'Work started'); return { ok: true };
    },
    /**
     * Finish the work with a sign-off. Completed: the change is Implemented (a standard change
     * closes at once) and the project's step moves on when all its work orders are closed.
     * Failed: the change is rolled back and a standard template is suspended until reviewed.
     */
    completeWorkOrder(workOrderId: string, signOff: { notes?: string; customerWitness?: string }, outcome: 'Completed' | 'Failed' = 'Completed') {
      const wo = workOrder(workOrderId); if (!wo) return;
      const cr = wo.changeRequestId ? change(wo.changeRequestId) : undefined;
      upd('workOrders', workOrderId, { status: outcome, actualEnd: now(), signOff: { by: actor, at: now(), performedBy: wo.assigneeKind === 'contractor' ? [wo.assigneeName, ...(wo.crew ?? [])].filter(Boolean).join(', ') || 'Contractor crew' : wo.assigneeName || actor, ...signOff } });
      if (cr) {
        const standard = cr.changeClass === 'Standard';
        const win = windowOf(cr.id); if (win) upd('maintenanceWindows', win.id, { status: 'Completed' });
        if (outcome === 'Completed') {
          upd('changeRequests', cr.id, standard ? { status: 'Closed', implementedAt: now(), closedAt: now(), review: { outcome: 'Successful', notes: 'Standard change closed on completion of its work order.', by: actor, at: now() } } : { status: 'Implemented', implementedAt: now() });
          driveP05(db, cr.id, 'implement', { complete: true, openItems: 0 }, actor, { catchUp: true });
          if (standard && cr.standardTemplateId) { const t = get<T.StandardChangeTemplate>(db, 'standardChangeTemplates', cr.standardTemplateId); if (t) upd('standardChangeTemplates', t.id, { usedCount: t.usedCount + 1 }); }
        } else {
          upd('changeRequests', cr.id, { status: 'RolledBack', implementedAt: now() });
          driveP05(db, cr.id, 'implement', { complete: false }, actor, { boundaryId: 'b_impl_error', catchUp: true });
          driveP05(db, cr.id, 'rollback', { complete: true }, actor);
          if (standard && cr.standardTemplateId) {
            const t = get<T.StandardChangeTemplate>(db, 'standardChangeTemplates', cr.standardTemplateId);
            if (t) { upd('standardChangeTemplates', t.id, { status: 'Suspended', failedCount: t.failedCount + 1, usedCount: t.usedCount + 1, lastFailureAt: now() }); audit('StandardChangeTemplate', t.id, 'suspended', `Suspended after ${cr.id} failed; changes of this kind go as normal changes until it is reviewed`); }
          }
        }
      }
      const fresh = workOrder(workOrderId)!;
      if (outcome === 'Completed') { driveP10(db, fresh, 'complete', { complete: true, openItems: 0 }, actor); driveP10(db, fresh, 'verify', { approved: true }, actor); }
      else { const pi = p10Of(db, fresh); if (pi?.state === 'active') cancelInstanceIn(db, pi.id, actor, 'Work failed; the change was rolled back'); }
      const acc = accessOf(db, fresh);
      if (acc?.state === 'active') { const parsed = modelParsed('access-request'); for (const el of ['escorted', 'check_out']) driveTask(db, parsed, acc.id, el, { complete: true, acknowledged: true }, actor, { catchUp: true, never: ['approve_zones'] }); }
      audit('WorkOrder', workOrderId, outcome === 'Completed' ? 'completed' : 'failed', signOff.notes ?? outcome);
      if (outcome === 'Completed' && wo.projectId) advanceProjectIfDone(db, wo.projectId, actor);
    },
    /** Close a change with its review (always for emergency and failed changes). */
    closeChange(changeId: string, review: NonNullable<T.ChangeRequest['review']>) {
      const cr = change(changeId); if (!cr) return;
      upd('changeRequests', changeId, { status: cr.status === 'RolledBack' ? 'RolledBack' : 'Closed', closedAt: now(), review });
      driveP05(db, changeId, 'verify', { approved: review.outcome === 'Successful' || review.outcome === 'Successful with issues' }, actor, { catchUp: true });
      if (cr.standardTemplateId && cr.status !== 'RolledBack') {
        const t = get<T.StandardChangeTemplate>(db, 'standardChangeTemplates', cr.standardTemplateId);
        if (t && (review.outcome === 'Failed' || review.outcome === 'Rolled back') && t.status === 'Active') upd('standardChangeTemplates', t.id, { status: 'Suspended', failedCount: t.failedCount + 1, lastFailureAt: now() });
      }
      audit('ChangeRequest', changeId, 'closed', `${review.outcome}: ${review.notes}`);
    },
    /** Cancel a change with its open work order, booked window and processes. */
    cancelChange(changeId: string, reason: string) {
      const cr = change(changeId); if (!cr) return;
      upd('changeRequests', changeId, { status: 'Cancelled', closedAt: now() });
      const wo = cr.workOrderId ? workOrder(cr.workOrderId) : undefined;
      if (wo && OPEN_WO.includes(wo.status)) upd('workOrders', wo.id, { status: 'Cancelled' });
      const win = windowOf(changeId); if (win?.status === 'Scheduled') upd('maintenanceWindows', win.id, { status: 'Cancelled' });
      const p05 = p05Of(db, changeId); if (p05) cancelInstanceIn(db, p05.id, actor, reason);
      endProcesses(wo, reason);
      if (wo && OPEN_WO.includes(wo.status)) createMaterialOps(db, actor, audit).releaseWorkOrder(wo.id, reason);
      audit('ChangeRequest', changeId, 'cancelled', reason);
      if (wo?.projectId) advanceProjectIfDone(db, wo.projectId, actor);
    },
    /** Cancel a work order together with its change (one change per work order). */
    cancelWorkOrder(workOrderId: string, reason: string) {
      const wo = workOrder(workOrderId); if (!wo || !OPEN_WO.includes(wo.status)) return;
      const cr = wo.changeRequestId ? change(wo.changeRequestId) : undefined;
      if (cr && ['Draft', 'Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress'].includes(cr.status)) ops.cancelChange(cr.id, reason);
      else { upd('workOrders', workOrderId, { status: 'Cancelled' }); endProcesses(wo, reason); createMaterialOps(db, actor, audit).releaseWorkOrder(workOrderId, reason); audit('WorkOrder', workOrderId, 'cancelled', reason); if (wo.projectId) advanceProjectIfDone(db, wo.projectId, actor); }
    },
    /** Legacy changes without a work order: move them through In progress → Implemented / Rolled back. */
    setStatusWithoutWorkOrder(changeId: string, status: 'InProgress' | 'Implemented' | 'RolledBack') {
      upd('changeRequests', changeId, { status, ...(status !== 'InProgress' ? { implementedAt: now() } : {}) });
      const win = windowOf(changeId); if (win) upd('maintenanceWindows', win.id, { status: status === 'InProgress' ? 'In Progress' : 'Completed' });
      // P05 follows the change, as it does through the work order for changes that have one.
      if (status === 'InProgress') driveP05(db, changeId, 'start_change', { acknowledged: true }, actor, { catchUp: true });
      else if (status === 'Implemented') driveP05(db, changeId, 'implement', { complete: true, openItems: 0 }, actor, { catchUp: true });
      else { driveP05(db, changeId, 'implement', { complete: false }, actor, { boundaryId: 'b_impl_error', catchUp: true }); driveP05(db, changeId, 'rollback', { complete: true }, actor); }
      audit('ChangeRequest', changeId, status === 'InProgress' ? 'started' : status === 'Implemented' ? 'implemented' : 'rolled back', status);
    },
    /** Suspend, reactivate (re-approved today, review due in a year) or retire a standard change template. */
    setTemplateStatus(id: string, status: T.StandardChangeTemplate['status'], reason: string) {
      const t = get<T.StandardChangeTemplate>(db, 'standardChangeTemplates', id); if (!t) return;
      upd('standardChangeTemplates', id, { status, ...(status === 'Active' ? { approvedAt: now(), reviewDue: new Date(Date.now() + 365 * 864e5).toISOString() } : {}) });
      audit('StandardChangeTemplate', id, status === 'Active' ? 'reactivated' : status === 'Suspended' ? 'suspended' : 'retired', reason || status);
    },
    /** Add or edit a change freeze (FRZ ids). */
    saveFreeze(input: FreezeInput, id?: string): string {
      if (id) { upd('changeFreezes', id, { ...input }); audit('ChangeFreeze', id, 'updated', `${input.name}: ${input.start.slice(0, 10)} to ${input.end.slice(0, 10)}`); return id; }
      const nid = nextSeqIn(db, 'changeFreezes', 'FRZ');
      db.create('changeFreezes', { id: nid, frzId: nid, ...input, ...base(actor) });
      audit('ChangeFreeze', nid, 'created', `${input.name}: ${input.start.slice(0, 10)} to ${input.end.slice(0, 10)}`);
      return nid;
    },
    /** Remove a freeze (soft delete, kept for the audit trail). */
    removeFreeze(id: string) { upd('changeFreezes', id, { isDeleted: true }); audit('ChangeFreeze', id, 'removed', 'Freeze removed'); },
    /** Programme lifecycle (Proposed → Planning → Active → On Hold → Closed). */
    setProgramStatus(programId: string, status: T.Program['status'], reason?: string) {
      const p = get<T.Program>(db, 'programs', programId); if (!p) return;
      upd('programs', programId, { status });
      audit('Program', programId, 'status changed', `${p.status} → ${status}${reason ? `: ${reason}` : ''}`);
    },
    /** Raise the change for an existing work order that has none (one change per work order). */
    raiseChangeForWorkOrder(workOrderId: string, opts: { emergency?: boolean; submit?: boolean; kw?: number; criticalServices?: boolean; liveSite?: boolean } = {}): RaisePlan | undefined {
      const wo = workOrder(workOrderId); if (!wo) return undefined;
      const existing = wo.changeRequestId ? change(wo.changeRequestId) : rows<T.ChangeRequest>(db, 'changeRequests').find(c => c.workOrderId === wo.id);
      if (existing) return undefined;
      const data = deliveryDataOf(db);
      const chg = nextSeqIn(db, 'changeRequests', 'CHG');
      const start = wo.plannedStart ?? wo.scheduledDate; const end = wo.plannedEnd ?? new Date(new Date(start).getTime() + 4 * 36e5).toISOString();
      const plan = planRaiseWorkOrder(data, {
        type: wo.type, title: wo.title ?? `${wo.type} · ${wo.woId}`, description: wo.description, dataCenterId: wo.dataCenterId, projectId: wo.projectId, programId: wo.programId, plannerPlanId: wo.plannerPlanId, projectStepId: wo.projectStepId,
        plannedStart: start, plannedEnd: end, deviceIds: wo.deviceIds, rackIds: wo.rackIds ?? (wo.rackId ? [wo.rackId] : undefined), assigneeKind: wo.assigneeKind, assigneeName: wo.assigneeName, contractorVendorId: wo.contractorVendorId, crew: wo.crew,
        priority: wo.priority, emergency: opts.emergency, submit: opts.submit, kw: opts.kw, criticalServices: opts.criticalServices, liveSite: opts.liveSite,
      }, actor, { wo: wo.id, chg, step: (k: number) => nextSeqIn(db, 'approvalSteps', 'APSTEP', k) });
      db.create('changeRequests', plan.change as unknown as Record<string, unknown>);
      for (const a of plan.approvals) db.create('approvalSteps', a as unknown as Record<string, unknown>);
      const standard = plan.change.changeClass === 'Standard';
      upd('workOrders', wo.id, { changeRequestId: chg, standardTemplateId: plan.workOrder.standardTemplateId, ...(['Draft', 'Ready', 'Awaiting change approval'].includes(wo.status) ? { status: standard ? (wo.assigneeName ? 'Assigned' : 'Ready') : plan.workOrder.status } : {}) });
      if (!standard) {
        const pi = startInstanceIn(db, modelParsed('change'), chg, { recordType: 'changeRequest', recordId: chg, dataCenterId: wo.dataCenterId, title: plan.change.title, variables: { risk: plan.change.risk, changeClass: plan.change.changeClass, workOrderId: wo.id } }, actor);
        if (plan.change.status === 'Submitted') driveTask(db, modelParsed('change'), pi.id, 'raise', { complete: true }, actor);
      }
      audit('ChangeRequest', chg, 'created', `${plan.change.changeClass} change raised for work order ${wo.id}`);
      return plan;
    },
    /** Tick (or untick) one checklist step of a work order. */
    setChecklistItem(workOrderId: string, step: string, done: boolean) {
      const wo = workOrder(workOrderId); if (!wo) return;
      const list = [...(wo.checklist ?? [])];
      const i = list.findIndex(x => x.step === step);
      const item = { step, done, by: done ? actor : undefined, at: done ? now() : undefined };
      if (i >= 0) list[i] = item; else list.push(item);
      upd('workOrders', workOrderId, { checklist: list });
    },
    /** Start a project's template process (if it has none running). */
    startProjectProcess(projectId: string) { const p = get<T.Project>(db, 'projects', projectId); return p ? startProjectProcess(db, p, actor) : undefined; },
    /** Raise the work orders of a project's work step. */
    raiseWorkForStep(projectId: string, stepId: string) { return raiseWorkForStep(db, projectId, stepId, actor, { audit }); },
    /** Move a project on from its work steps whose work orders are all closed. */
    advanceProjectIfDone(projectId: string) { return advanceProjectIfDone(db, projectId, actor); },
  };
  return ops;
}
export type ChainOps = ReturnType<typeof createChainOps>;
/** For screens that want the template label of a process key. */
export const templateOfProcess = (key: string) => TEMPLATE_FOR_PROCESS[key];
/** Current instance of a project (for scripts). */
export const projectInstanceOf = (db: MockDB, projectId: string) => { const i = runningOf(db, projectId); return i ? getInstanceIn(db, i.id) : undefined; };

/** Work may start from an hour before its change window until the window ends; emergency changes are exempt. */
export function outsideWindow(cr: Pick<T.ChangeRequest, 'scheduledStart' | 'scheduledEnd' | 'changeClass'>, nowMs: number): string | undefined {
  if (cr.changeClass === 'Emergency' || !cr.scheduledStart) return undefined;
  const start = new Date(cr.scheduledStart).getTime(), end = new Date(cr.scheduledEnd ?? cr.scheduledStart).getTime();
  const fmt = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (nowMs < start - 3600e3) return `The change window opens ${fmt(start)}. Work can start from an hour before.`;
  if (nowMs > end) return `The change window closed ${fmt(end)}. Book a new window on the change before starting.`;
  return undefined;
}

