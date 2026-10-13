/**
 * Delivery chain — plan → programme → project → work order → change request.
 *
 * Every change to the estate is made through a change request, one change request per work
 * order. A project runs its own BPMN process; the steps that touch the estate raise work
 * orders, each work order raises its change (standard, normal or emergency), and the two
 * close together. Programmes are driven by their blueprint template and have no process.
 *
 * This module is the one place screens read the chain from. It is pure (no React): the
 * hook `useDeliveryData()` supplies the bundle in the app, `deliveryDataFromSnapshot()` in
 * scripts.
 */
import type * as T from '../../../mock/data/types';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';

export interface DeliveryData {
  programs: T.Program[]; projects: T.Project[]; milestones: T.Milestone[]; tasks: T.Task[];
  workOrders: T.WorkOrder[]; changeRequests: T.ChangeRequest[]; maintenanceWindows: T.MaintenanceWindow[];
  approvalSteps: T.ApprovalStep[]; approvalMatrixRules: T.ApprovalMatrixRule[];
  standardChangeTemplates: T.StandardChangeTemplate[]; changeFreezes: T.ChangeFreeze[];
  processInstances: T.ProcessInstance[]; userTasks: T.ProcessUserTask[];
  plannerPlans: T.PlannerPlan[]; purchaseOrders: T.PurchaseOrder[]; permits: T.Permit[]; atps: T.Atp[]; hotos: T.Hoto[];
  vendors: T.Vendor[]; dataCenters: T.DataCenter[]; risks: T.RiskItem[];
  ready: boolean;
}
export const DELIVERY_DATA_KEYS = ['programs', 'projects', 'milestones', 'tasks', 'workOrders', 'changeRequests', 'maintenanceWindows', 'approvalSteps', 'approvalMatrixRules', 'standardChangeTemplates', 'changeFreezes', 'processInstances', 'userTasks', 'plannerPlans', 'purchaseOrders', 'permits', 'atps', 'hotos', 'vendors', 'dataCenters', 'risks'] as const satisfies readonly (keyof Omit<DeliveryData, 'ready'>)[];

export function deliveryDataFromSnapshot(snap: Record<string, unknown>): DeliveryData {
  const out = { ready: true } as Record<string, unknown>;
  for (const k of DELIVERY_DATA_KEYS) out[k] = ((snap[k] as { isDeleted?: boolean }[] | undefined) ?? []).filter(r => !r.isDeleted);
  return out as unknown as DeliveryData;
}

const BIG = { pageSize: 100000 } as const;
const EMPTY: never[] = [];
let lastDatas: unknown[] = []; let lastReady = false; let lastBundle: DeliveryData | undefined;
/** Every collection the delivery screens read. Keeps its identity until a collection changes. */
export function useDeliveryData(): DeliveryData {
  const results = DELIVERY_DATA_KEYS.map(k => useEntityList(k, BIG)); // eslint-disable-line react-hooks/rules-of-hooks
  const datas = results.map(r => r.data?.data);
  const ready = results.every(r => r.data !== undefined);
  if (lastBundle && ready === lastReady && datas.every((d, i) => d === lastDatas[i])) return lastBundle;
  const out = { ready } as Record<string, unknown>;
  DELIVERY_DATA_KEYS.forEach((k, i) => { out[k] = (datas[i] ?? EMPTY).filter(r => !(r as { isDeleted?: boolean }).isDeleted); });
  lastDatas = datas; lastReady = ready; lastBundle = out as unknown as DeliveryData;
  return lastBundle;
}

/* ------------------------------------------------------------------ status helpers */
export const OPEN_CHANGE: T.ChangeRequest['status'][] = ['Draft', 'Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress'];
export const OPEN_WORK_ORDER: T.WorkOrder['status'][] = ['Draft', 'Awaiting change approval', 'Ready', 'Assigned', 'InProgress', 'Validated'];
export const isOpenChange = (c: T.ChangeRequest) => OPEN_CHANGE.includes(c.status);
export const isOpenWorkOrder = (w: T.WorkOrder) => OPEN_WORK_ORDER.includes(w.status);
/** Change class with a default for records created before classes existed. */
export const changeClassOf = (c: T.ChangeRequest): T.ChangeClass => c.changeClass ?? (c.standardTemplateId ? 'Standard' : 'Normal');

/* ------------------------------------------------------------------ chain lookups */
export interface ProjectChain {
  project: T.Project; program?: T.Program; plan?: T.PlannerPlan;
  /** The project's own BPMN process instance (recordType 'project'). */
  process?: T.ProcessInstance; openTasks: T.ProcessUserTask[];
  workOrders: T.WorkOrder[]; changes: T.ChangeRequest[]; windows: T.MaintenanceWindow[];
  milestones: T.Milestone[]; tasks: T.Task[]; purchaseOrders: T.PurchaseOrder[]; permits: T.Permit[]; atps: T.Atp[]; hotos: T.Hoto[]; risks: T.RiskItem[];
}
export function chainOfProject(d: DeliveryData, projectId: string): ProjectChain | undefined {
  const project = d.projects.find(p => p.id === projectId); if (!project) return undefined;
  const program = d.programs.find(p => p.id === project.programId);
  const planId = project.plannerPlanId ?? program?.plannerPlanId;
  const workOrders = d.workOrders.filter(w => w.projectId === project.id);
  const woIds = new Set(workOrders.map(w => w.id));
  const changes = d.changeRequests.filter(c => c.projectId === project.id || (c.workOrderId && woIds.has(c.workOrderId)));
  const crIds = new Set(changes.map(c => c.id));
  const process = d.processInstances.filter(i => i.recordType === 'project' && i.recordId === project.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  return {
    project, program, plan: planId ? d.plannerPlans.find(p => p.id === planId) : undefined,
    process, openTasks: process ? d.userTasks.filter(t => t.instanceId === process.id && t.state === 'created') : [],
    workOrders, changes, windows: d.maintenanceWindows.filter(w => w.changeRequestId && crIds.has(w.changeRequestId)),
    milestones: d.milestones.filter(m => m.projectId === project.id), tasks: d.tasks.filter(t => t.projectId === project.id),
    purchaseOrders: d.purchaseOrders.filter(p => p.plannerPlanId && p.plannerPlanId === planId), permits: d.permits.filter(p => p.projectId === project.id),
    atps: d.atps.filter(a => a.projectId === project.id), hotos: d.hotos.filter(h => h.projectId === project.id), risks: d.risks.filter(r => (r as { projectId?: string }).projectId === project.id),
  };
}

export interface ProgramChain { program: T.Program; plan?: T.PlannerPlan; projects: T.Project[]; workOrders: T.WorkOrder[]; changes: T.ChangeRequest[]; milestones: T.Milestone[]; purchaseOrders: T.PurchaseOrder[]; permits: T.Permit[]; atps: T.Atp[]; risks: T.RiskItem[] }
export function chainOfProgram(d: DeliveryData, programId: string): ProgramChain | undefined {
  const program = d.programs.find(p => p.id === programId); if (!program) return undefined;
  const projects = d.projects.filter(p => p.programId === program.id);
  const pids = new Set(projects.map(p => p.id));
  const workOrders = d.workOrders.filter(w => (w.projectId && pids.has(w.projectId)) || w.programId === program.id);
  const woIds = new Set(workOrders.map(w => w.id));
  return {
    program, plan: program.plannerPlanId ? d.plannerPlans.find(p => p.id === program.plannerPlanId) : undefined, projects, workOrders,
    changes: d.changeRequests.filter(c => (c.projectId && pids.has(c.projectId)) || c.programId === program.id || (c.workOrderId && woIds.has(c.workOrderId))),
    milestones: d.milestones.filter(m => pids.has(m.projectId)), purchaseOrders: d.purchaseOrders.filter(p => program.plannerPlanId && p.plannerPlanId === program.plannerPlanId),
    permits: d.permits.filter(p => p.programId === program.id || (p.projectId && pids.has(p.projectId))), atps: d.atps.filter(a => pids.has(a.projectId)),
    risks: d.risks.filter(r => { const pid = (r as { projectId?: string }).projectId; return !!pid && pids.has(pid); }),
  };
}

export interface ChangeChain { change: T.ChangeRequest; workOrder?: T.WorkOrder; project?: T.Project; program?: T.Program; plan?: T.PlannerPlan; window?: T.MaintenanceWindow; approvals: T.ApprovalStep[]; template?: T.StandardChangeTemplate; freeze?: T.ChangeFreeze; process?: T.ProcessInstance }
export function chainOfChange(d: DeliveryData, changeId: string): ChangeChain | undefined {
  const change = d.changeRequests.find(c => c.id === changeId); if (!change) return undefined;
  const workOrder = d.workOrders.find(w => w.id === change.workOrderId) ?? d.workOrders.find(w => w.changeRequestId === change.id);
  const project = d.projects.find(p => p.id === (change.projectId ?? workOrder?.projectId));
  const program = d.programs.find(p => p.id === (change.programId ?? project?.programId));
  const planId = change.plannerPlanId ?? project?.plannerPlanId ?? program?.plannerPlanId;
  return {
    change, workOrder, project, program, plan: planId ? d.plannerPlans.find(p => p.id === planId) : undefined,
    window: d.maintenanceWindows.find(w => w.changeRequestId === change.id), approvals: d.approvalSteps.filter(a => a.changeRequestId === change.id).sort((a, b) => a.order - b.order),
    template: d.standardChangeTemplates.find(t => t.id === change.standardTemplateId), freeze: d.changeFreezes.find(f => f.id === change.freezeId),
    process: d.processInstances.find(i => i.recordType === 'changeRequest' && i.recordId === change.id),
  };
}

export interface WorkOrderChain { workOrder: T.WorkOrder; change?: T.ChangeRequest; project?: T.Project; program?: T.Program; plan?: T.PlannerPlan; contractor?: T.Vendor; process?: T.ProcessInstance }
export function chainOfWorkOrder(d: DeliveryData, workOrderId: string): WorkOrderChain | undefined {
  const workOrder = d.workOrders.find(w => w.id === workOrderId); if (!workOrder) return undefined;
  const change = d.changeRequests.find(c => c.id === workOrder.changeRequestId) ?? d.changeRequests.find(c => c.workOrderId === workOrder.id);
  const project = d.projects.find(p => p.id === (workOrder.projectId ?? change?.projectId));
  const program = d.programs.find(p => p.id === (workOrder.programId ?? project?.programId));
  const planId = workOrder.plannerPlanId ?? project?.plannerPlanId ?? program?.plannerPlanId;
  return {
    workOrder, change, project, program, plan: planId ? d.plannerPlans.find(p => p.id === planId) : undefined,
    contractor: d.vendors.find(v => v.id === workOrder.contractorVendorId),
    process: d.processInstances.find(i => i.id === workOrder.processInstanceId) ?? d.processInstances.find(i => i.recordType === 'workOrder' && i.recordId === workOrder.id),
  };
}

/* ------------------------------------------------------------------ freezes and classes */
const overlaps = (a0: string, a1: string, b0: string, b1: string) => a0 < b1 && b0 < a1;
/** The freeze a window falls in at a site (site freezes and estate-wide ones). */
export function freezeFor(d: DeliveryData, dataCenterId: string | undefined, start: string, end: string): T.ChangeFreeze | undefined {
  return d.changeFreezes.find(f => (!f.dataCenterId || f.dataCenterId === dataCenterId) && overlaps(start, end, f.start, f.end));
}
/**
 * Which class a change for this work order should be. A work order whose work type an active
 * standard template covers, inside the template's limits, raises a standard change; work in a
 * freeze can only be an emergency; everything else is normal.
 */
export function classifyChange(d: DeliveryData, wo: T.WorkOrder, opts: { kw?: number; devices?: number; criticalServices?: boolean; liveSite?: boolean; emergency?: boolean } = {}): { changeClass: T.ChangeClass; template?: T.StandardChangeTemplate; reasons: string[] } {
  const reasons: string[] = [];
  if (opts.emergency) return { changeClass: 'Emergency', reasons: ['Raised as an emergency'] };
  const freeze = wo.plannedStart ? freezeFor(d, wo.dataCenterId, wo.plannedStart, wo.plannedEnd ?? wo.plannedStart) : undefined;
  if (freeze) reasons.push(`The window falls in the freeze "${freeze.name}"; only emergency changes may proceed`);
  const t = d.standardChangeTemplates.find(x => x.status === 'Active' && x.workTypes.includes(wo.type) && (!wo.standardTemplateId || x.id === wo.standardTemplateId));
  if (!t) { reasons.push('No active standard template covers this work type'); return { changeClass: 'Normal', reasons }; }
  const out: string[] = [];
  if (t.limits.maxKw !== undefined && (opts.kw ?? 0) > t.limits.maxKw) out.push(`adds ${opts.kw} kW, above the template's ${t.limits.maxKw} kW`);
  if (t.limits.maxDevices !== undefined && (opts.devices ?? 0) > t.limits.maxDevices) out.push(`touches ${opts.devices} devices, above ${t.limits.maxDevices}`);
  if (!t.limits.criticalServicesAllowed && opts.criticalServices) out.push('a critical service is affected');
  if (!t.limits.liveSiteAllowed && opts.liveSite) out.push('the work is in a live area');
  if (out.length || freeze) return { changeClass: 'Normal', template: t, reasons: [...reasons, ...out.map(o => `Outside "${t.name}": ${o}`)] };
  return { changeClass: 'Standard', template: t, reasons: [`Covered by the standard template "${t.name}"`] };
}
