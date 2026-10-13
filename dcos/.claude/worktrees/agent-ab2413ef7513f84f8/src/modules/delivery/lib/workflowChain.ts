/**
 * Delivery chain actions — the only way screens change work orders and change requests.
 *
 * Raising a work order raises its change request (one per work order), classified as
 * standard, normal or emergency (see chain.ts `classifyChange`). A standard change is
 * approved by its template; a normal change goes through the approval matrix; an emergency
 * change is approved by the emergency board and must be reviewed afterwards. The work order
 * becomes Ready when its change is approved and scheduled; completing the work order marks
 * the change Implemented, and the change closes after its review.
 *
 * `planX` functions are pure (they return the records to write, so scripts and tests can use
 * them); `useChainActions()` applies them to MockDB and refreshes the screens.
 */
import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type * as T from '../../../mock/data/types';
import type { WorkOrderType } from '../../../mock/data/enums';
import { db } from '../../../mock/db';
import { useAuth } from '../../../core/auth/AuthContext';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { classifyChange, freezeFor, type DeliveryData } from './chain';

const now = () => new Date().toISOString();
const base = (actor: string) => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: actor, createdById: 'me' });
export function nextSeq(entity: string, prefix: string): string {
  const all = db.getAll(entity, { pageSize: 100000 }).data as { id: string }[];
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = all.reduce((m, r) => { const x = re.exec(r.id); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}
const CHANGE_TYPE_FOR: Record<WorkOrderType, T.ChangeRequest['type']> = {
  RackInstall: 'RackDeploy', Cabling: 'RackDeploy', PowerConnect: 'PowerUpgrade', DeviceDeploy: 'RackDeploy', DeviceRemoval: 'Decommission', Migration: 'ServerRelocation',
  PlantInstall: 'PowerUpgrade', PlantCutIn: 'PowerUpgrade', Commissioning: 'PowerUpgrade', Civil: 'PowerUpgrade', Inspection: 'ConfigPush', Disposal: 'Decommission', CircuitTurnUp: 'NetworkMigration', Configuration: 'ConfigPush',
};

export interface RaiseWorkOrderInput {
  type: WorkOrderType; title: string; description?: string;
  dataCenterId?: string; projectId?: string; programId?: string; plannerPlanId?: string; projectStepId?: string;
  plannedStart: string; plannedEnd: string; deviceIds?: string[]; rackIds?: string[];
  assigneeKind?: 'internal' | 'contractor'; assigneeName?: string; contractorVendorId?: string; crew?: string[];
  priority?: T.WorkOrder['priority']; emergency?: boolean;
  /** Facts that decide whether a standard template applies. */
  kw?: number; criticalServices?: boolean; liveSite?: boolean;
  implementationPlan?: string; backoutPlan?: string; testPlan?: string;
}
export interface RaisePlan { workOrder: T.WorkOrder; change: T.ChangeRequest; approvals: T.ApprovalStep[]; reasons: string[] }

/** The work order, its change and the change's approval steps (pure). */
export function planRaiseWorkOrder(d: DeliveryData, input: RaiseWorkOrderInput, actor: string, ids: { wo: string; chg: string; step: (i: number) => string }): RaisePlan {
  const draftWo = { type: input.type, dataCenterId: input.dataCenterId, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd } as T.WorkOrder;
  const cls = classifyChange(d, draftWo, { kw: input.kw, devices: input.deviceIds?.length, criticalServices: input.criticalServices, liveSite: input.liveSite, emergency: input.emergency });
  const freeze = freezeFor(d, input.dataCenterId, input.plannedStart, input.plannedEnd);
  const standard = cls.changeClass === 'Standard';
  const changeType = cls.template?.changeType ?? CHANGE_TYPE_FOR[input.type];
  const risk: T.ChangeRequest['risk'] = standard ? 'Low' : input.criticalServices ? 'High' : input.liveSite ? 'Medium' : 'Low';
  const rule = d.approvalMatrixRules.find(r => r.changeType === changeType && r.riskLevel === risk) ?? d.approvalMatrixRules.find(r => r.changeType === changeType) ?? d.approvalMatrixRules.find(r => r.riskLevel === risk);
  const approvals: T.ApprovalStep[] = standard ? [] : cls.changeClass === 'Emergency'
    ? [{ id: ids.step(0), apstepId: ids.step(0), ...base(actor), changeRequestId: ids.chg, order: 1, approverRole: 'ChangeApprover' as T.ApprovalStep['approverRole'], decision: 'Pending' } as T.ApprovalStep]
    : (rule?.stages ?? [{ order: 1, approverRole: 'ChangeApprover' as T.ApprovalStep['approverRole'], requiredCount: 1 }]).map((st, i) => ({ id: ids.step(i), apstepId: ids.step(i), ...base(actor), changeRequestId: ids.chg, order: st.order, approverRole: st.approverRole, decision: 'Pending' } as T.ApprovalStep));
  const change: T.ChangeRequest = {
    id: ids.chg, chgId: ids.chg, ...base(actor), title: input.title, type: changeType, description: input.description ?? input.title, risk,
    status: standard ? 'Approved' : 'Draft', priority: input.priority === 'Critical' ? 'Critical' : input.priority === 'High' ? 'High' : 'Medium',
    affectedResourceType: input.rackIds?.length ? 'Rack' : 'Asset', affectedResourceIds: [...(input.rackIds ?? []), ...(input.deviceIds ?? [])],
    dataCenterId: input.dataCenterId, requestedBy: actor, requestedById: 'me', policyViolations: freeze && cls.changeClass !== 'Emergency' ? [`Window falls in the freeze "${freeze.name}"`] : [],
    scheduledStart: input.plannedStart, scheduledEnd: input.plannedEnd, approvalRuleId: standard ? undefined : rule?.id,
    rollbackPlan: input.backoutPlan ?? cls.template?.backout, implementationPlan: input.implementationPlan ?? cls.template?.steps.join('\n'), testPlan: input.testPlan, backoutPlan: input.backoutPlan ?? cls.template?.backout,
    projectId: input.projectId, programId: input.programId, plannerPlanId: input.plannerPlanId, projectStepId: input.projectStepId, workOrderId: ids.wo,
    changeClass: cls.changeClass, standardTemplateId: cls.template && standard ? cls.template.id : undefined, freezeId: freeze?.id, approvedAt: standard ? now() : undefined,
  } as T.ChangeRequest;
  const workOrder: T.WorkOrder = {
    id: ids.wo, woId: ids.wo, ...base(actor), type: input.type, title: input.title, description: input.description, changeRequestId: ids.chg,
    projectId: input.projectId, programId: input.programId, plannerPlanId: input.plannerPlanId, projectStepId: input.projectStepId, dataCenterId: input.dataCenterId,
    rackId: input.rackIds?.[0], rackIds: input.rackIds, deviceIds: input.deviceIds, assigneeName: input.assigneeName ?? '', assigneeKind: input.assigneeKind ?? 'internal',
    contractorVendorId: input.contractorVendorId, crew: input.crew, status: standard ? 'Ready' : 'Awaiting change approval', scheduledDate: input.plannedStart,
    plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, priority: input.priority ?? 'Medium', standardTemplateId: standard ? cls.template?.id : undefined,
  } as T.WorkOrder;
  return { workOrder, change, approvals, reasons: cls.reasons };
}

/** Writes through MockDB and refreshes every delivery and change screen. */
export function useChainActions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const actor = user?.name ?? 'Delivery';
  const audit = useRecordAudit();
  const refresh = useCallback(() => { for (const k of ['workOrders', 'changeRequests', 'approvalSteps', 'maintenanceWindows', 'standardChangeTemplates', 'changeFreezes', 'projects', 'processInstances', 'userTasks']) void qc.invalidateQueries({ queryKey: [k] }); }, [qc]);
  const upd = useCallback((entity: string, id: string, patch: Record<string, unknown>) => { db.update(entity, id, { ...patch, updatedAt: now(), updatedBy: actor }); }, [actor]);
  return useMemo(() => ({
    actor,
    /** Raise a work order and its change. Standard changes are approved at once and the work order is Ready. */
    raiseWorkOrder(d: DeliveryData, input: RaiseWorkOrderInput) {
      const wo = nextSeq('workOrders', 'WO'); const chg = nextSeq('changeRequests', 'CHG');
      const p = planRaiseWorkOrder(d, input, actor, { wo, chg, step: i => `${nextSeq('approvalSteps', 'APS').replace(/-(\d+)$/, (_, n) => `-${String(Number(n) + i).padStart(4, '0')}`)}` });
      db.create('changeRequests', p.change as unknown as Record<string, unknown>); db.create('workOrders', p.workOrder as unknown as Record<string, unknown>);
      for (const a of p.approvals) db.create('approvalSteps', a as unknown as Record<string, unknown>);
      audit('WorkOrder', wo, 'created', `${p.workOrder.title}; change ${chg} (${p.change.changeClass})`);
      refresh(); return p;
    },
    submitChange(changeId: string) { upd('changeRequests', changeId, { status: 'Submitted', submittedAt: now() }); audit('ChangeRequest', changeId, 'submitted', 'Submitted for approval'); refresh(); },
    /** Record one approval decision; the change is Approved when every step is approved, Rejected on any rejection. */
    decideStep(changeId: string, stepId: string, decision: 'Approved' | 'Rejected', comment?: string) {
      upd('approvalSteps', stepId, { decision, decidedAt: now(), approverId: 'me', comment });
      const steps = (db.getAll('approvalSteps', { pageSize: 100000 }).data as unknown as T.ApprovalStep[]).filter(s => s.changeRequestId === changeId);
      const status: T.ChangeRequest['status'] = steps.some(s => s.decision === 'Rejected') ? 'Rejected' : steps.every(s => s.decision === 'Approved') ? 'Approved' : 'UnderReview';
      upd('changeRequests', changeId, { status, ...(status === 'Approved' ? { approvedAt: now() } : {}) });
      const cr = db.getById('changeRequests', changeId) as unknown as T.ChangeRequest | undefined;
      if (cr?.workOrderId) upd('workOrders', cr.workOrderId, { status: status === 'Approved' ? 'Ready' : status === 'Rejected' ? 'Cancelled' : 'Awaiting change approval' });
      audit('ChangeRequest', changeId, decision === 'Approved' ? 'approved' : 'rejected', comment ?? decision); refresh();
    },
    /** Book (or move) the maintenance window of a change. */
    scheduleChange(changeId: string, start: string, end: string, impact: string) {
      const cr = db.getById('changeRequests', changeId) as unknown as T.ChangeRequest;
      const existing = (db.getAll('maintenanceWindows', { pageSize: 100000 }).data as unknown as T.MaintenanceWindow[]).find(w => w.changeRequestId === changeId);
      if (existing) upd('maintenanceWindows', existing.id, { scheduledStart: start, scheduledEnd: end, impact });
      else { const id = nextSeq('maintenanceWindows', 'MW'); db.create('maintenanceWindows', { id, mwId: id, ...base(actor), title: cr.title, status: 'Scheduled', dataCenterId: cr.dataCenterId, changeRequestId: changeId, scheduledStart: start, scheduledEnd: end, affectedDeviceIds: cr.affectedResourceIds, impact, owner: actor, plannerPlanId: cr.plannerPlanId }); }
      upd('changeRequests', changeId, { scheduledStart: start, scheduledEnd: end, status: cr.status === 'Approved' ? 'Scheduled' : cr.status });
      if (cr.workOrderId) upd('workOrders', cr.workOrderId, { plannedStart: start, plannedEnd: end, scheduledDate: start });
      audit('ChangeRequest', changeId, 'scheduled', `${start.slice(0, 16)} to ${end.slice(0, 16)}`); refresh();
    },
    assignWorkOrder(workOrderId: string, a: { kind: 'internal' | 'contractor'; name?: string; vendorId?: string; crew?: string[] }) {
      upd('workOrders', workOrderId, { assigneeKind: a.kind, assigneeName: a.name ?? '', contractorVendorId: a.kind === 'contractor' ? a.vendorId : undefined, crew: a.crew });
      const wo = db.getById('workOrders', workOrderId) as unknown as T.WorkOrder;
      if (wo.status === 'Ready') upd('workOrders', workOrderId, { status: 'Assigned' });
      audit('WorkOrder', workOrderId, 'assigned', a.kind === 'contractor' ? `Contractor ${a.vendorId} (${(a.crew ?? []).join(', ')})` : a.name ?? ''); refresh();
    },
    /** Start the work; refused while the change is not approved (except emergency changes that are approved by the board). */
    startWork(workOrderId: string): { ok: boolean; reason?: string } {
      const wo = db.getById('workOrders', workOrderId) as unknown as T.WorkOrder;
      const cr = wo.changeRequestId ? db.getById('changeRequests', wo.changeRequestId) as unknown as T.ChangeRequest : undefined;
      if (!cr || !['Approved', 'Scheduled', 'InProgress'].includes(cr.status)) return { ok: false, reason: 'The change for this work order is not approved yet.' };
      upd('workOrders', workOrderId, { status: 'InProgress', actualStart: now() }); upd('changeRequests', cr.id, { status: 'InProgress' });
      audit('WorkOrder', workOrderId, 'started', 'Work started'); refresh(); return { ok: true };
    },
    /** Finish the work with a sign-off; the change becomes Implemented and waits for its review. */
    completeWorkOrder(workOrderId: string, signOff: { notes?: string; customerWitness?: string }, outcome: 'Completed' | 'Failed' = 'Completed') {
      const wo = db.getById('workOrders', workOrderId) as unknown as T.WorkOrder;
      upd('workOrders', workOrderId, { status: outcome, actualEnd: now(), signOff: { by: actor, at: now(), ...signOff } });
      if (wo.changeRequestId) upd('changeRequests', wo.changeRequestId, { status: outcome === 'Completed' ? 'Implemented' : 'RolledBack', implementedAt: now() });
      audit('WorkOrder', workOrderId, outcome === 'Completed' ? 'completed' : 'failed', signOff.notes ?? outcome); refresh();
    },
    /** Close a change with its review. A failed standard change suspends its template until reviewed. */
    closeChange(changeId: string, review: NonNullable<T.ChangeRequest['review']>) {
      upd('changeRequests', changeId, { status: 'Closed', closedAt: now(), review });
      const cr = db.getById('changeRequests', changeId) as unknown as T.ChangeRequest;
      if (cr.standardTemplateId) {
        const t = db.getById('standardChangeTemplates', cr.standardTemplateId) as unknown as T.StandardChangeTemplate | undefined;
        if (t) upd('standardChangeTemplates', t.id, { usedCount: t.usedCount + 1, ...(review.outcome === 'Failed' || review.outcome === 'Rolled back' ? { failedCount: t.failedCount + 1, lastFailureAt: now(), status: 'Suspended' } : {}) });
      }
      audit('ChangeRequest', changeId, 'closed', `${review.outcome}: ${review.notes}`); refresh();
    },
  }), [actor, audit, refresh, upd]);
}
