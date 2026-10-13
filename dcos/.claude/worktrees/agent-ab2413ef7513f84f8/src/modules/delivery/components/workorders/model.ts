/**
 * Work order view model — pure helpers shared by the delivery home, the work order list and
 * the work order page. Reads the delivery chain bundle only (no writes, no React).
 *
 * Seed work orders created before the delivery chain may have no title, site, window or
 * project of their own; everything here falls back along the chain (change → project).
 */
import type * as T from '../../../../mock/data/types';
import type { WorkOrderStatus, WorkOrderType } from '../../../../mock/data/enums';
import type { VwChipVariant } from '../../../../shared/components/ux';
import { changeClassOf, isOpenWorkOrder, type DeliveryData } from '../../lib/chain';

/* ------------------------------------------------------------------ labels and tones */
export const TYPE_LABEL: Record<WorkOrderType, string> = {
  RackInstall: 'Rack install', Cabling: 'Cabling', PowerConnect: 'Power connection', DeviceDeploy: 'Device install', DeviceRemoval: 'Device removal',
  Migration: 'Migration', PlantInstall: 'Plant install', PlantCutIn: 'Plant cut-in', Commissioning: 'Commissioning', Civil: 'Civil works',
  Inspection: 'Inspection', Disposal: 'Disposal', CircuitTurnUp: 'Circuit turn-up', Configuration: 'Configuration',
};
export const typeLabel = (t: string) => TYPE_LABEL[t as WorkOrderType] ?? t;

export const WO_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  Draft: 'Draft', 'Awaiting change approval': 'Awaiting change approval', Ready: 'Ready to start', Assigned: 'Assigned',
  InProgress: 'In progress', Validated: 'Validated', Completed: 'Completed', Cancelled: 'Cancelled', Failed: 'Failed',
};
export const WO_STATUS_TONE: Record<WorkOrderStatus, VwChipVariant> = {
  Draft: 'neutral', 'Awaiting change approval': 'warning', Ready: 'info', Assigned: 'info', InProgress: 'purple', Validated: 'cyan', Completed: 'success', Cancelled: 'neutral', Failed: 'error',
};
export const woStatusLabel = (s: string) => WO_STATUS_LABEL[s as WorkOrderStatus] ?? s;
export const woStatusTone = (s: string): VwChipVariant => WO_STATUS_TONE[s as WorkOrderStatus] ?? 'neutral';

export const CHG_STATUS_LABEL: Record<T.ChangeRequest['status'], string> = {
  Draft: 'Draft', Submitted: 'Submitted', UnderReview: 'Under review', Approved: 'Approved', Scheduled: 'Scheduled', InProgress: 'In progress',
  Implemented: 'Implemented', Closed: 'Closed', Rejected: 'Rejected', Cancelled: 'Cancelled', RolledBack: 'Rolled back',
};
export const CHG_STATUS_TONE: Record<T.ChangeRequest['status'], VwChipVariant> = {
  Draft: 'neutral', Submitted: 'warning', UnderReview: 'warning', Approved: 'success', Scheduled: 'success', InProgress: 'purple',
  Implemented: 'cyan', Closed: 'neutral', Rejected: 'error', Cancelled: 'neutral', RolledBack: 'error',
};
export const CLASS_TONE: Record<T.ChangeClass, VwChipVariant> = { Standard: 'neutral', Normal: 'info', Emergency: 'error' };
/** One line on what each change class needs before work may start (UI help text). */
export const CLASS_RULE: Record<T.ChangeClass, string> = {
  Standard: 'Standard change: raised from a pre-approved template, so it is approved at once and needs no change board.',
  Normal: 'Normal change: approved through the approval matrix, then by the weekly change board.',
  Emergency: 'Emergency change: approved on demand by the emergency board; a review after the work is mandatory.',
};
/** Work order statuses in which the work itself is not done yet (Validated means done, being verified). */
export const NOT_DONE: WorkOrderStatus[] = ['Draft', 'Awaiting change approval', 'Ready', 'Assigned', 'InProgress'];
/** Change statuses that let the work start. */
export const CHANGE_APPROVED: T.ChangeRequest['status'][] = ['Approved', 'Scheduled', 'InProgress'];

/* ------------------------------------------------------------------ formatting */
const DAY = 864e5;
export function fmtMoney(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}k`;
  return `${s}$${Math.round(a)}`;
}
export const fmtDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtDayShort = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (iso?: string) => (iso ? `${fmtDayShort(new Date(iso))}, ${fmtTime(new Date(iso))}` : '—');
/** "Fri 9 Oct, 17:10–22:10", or both ends in full when the window spans days. */
export function fmtWindow(start?: string, end?: string): string {
  if (!start) return 'Not scheduled';
  const a = new Date(start);
  if (!end) return `${fmtDayShort(a)}, ${fmtTime(a)}`;
  const b = new Date(end);
  return a.toDateString() === b.toDateString() ? `${fmtDayShort(a)}, ${fmtTime(a)}–${fmtTime(b)}` : `${fmtDayShort(a)} ${fmtTime(a)} – ${fmtDayShort(b)} ${fmtTime(b)}`;
}
/** A window on two short lines for tables: the day (and start time when it spans days), then the times and how far away. */
export function windowLines(start?: string, end?: string, now = Date.now()): { main: string; sub?: string } {
  if (!start) return { main: 'Not scheduled' };
  const a = new Date(start), b = end ? new Date(end) : undefined;
  const rel = relDays(start, now);
  if (!b) return { main: fmtDayShort(a), sub: `${fmtTime(a)} · ${rel}` };
  if (a.toDateString() === b.toDateString()) return { main: fmtDayShort(a), sub: `${fmtTime(a)}–${fmtTime(b)} · ${rel}` };
  return { main: `${fmtDayShort(a)}, ${fmtTime(a)}`, sub: `to ${fmtDayShort(b)}, ${fmtTime(b)} · ${rel}` };
}
/** "in 3 days", "today", "2 days ago". */
export function relDays(iso: string, now = Date.now()): string {
  const d0 = new Date(new Date(now).toDateString()).getTime();
  const d1 = new Date(new Date(iso).toDateString()).getTime();
  const n = Math.round((d1 - d0) / DAY);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${n} days` : `${-n} days ago`;
}
export const isSameDay = (iso: string, now = Date.now()) => new Date(iso).toDateString() === new Date(now).toDateString();

/* ------------------------------------------------------------------ chain-derived fields */
/** A title for work orders raised before titles existed: the type and what the change or the notes say. */
export function woTitle(wo: T.WorkOrder, change?: T.ChangeRequest): string {
  if (wo.title?.trim()) return wo.title;
  const label = typeLabel(wo.type);
  if (change?.title) return `${label}: ${change.title}`;
  const notes = (wo as { notes?: string }).notes;
  if (notes?.trim()) return notes.replace(wo.type, label);
  return label;
}

export function p10Of(d: DeliveryData, wo: T.WorkOrder): T.ProcessInstance | undefined {
  return d.processInstances.find(i => i.id === wo.processInstanceId)
    ?? d.processInstances.filter(i => i.definitionKey === 'work-order' && i.recordType === 'workOrder' && i.recordId === wo.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}
/**
 * The P12 access request of a work order: the stored id, or the latest instance started for it.
 * Access requests are bound to the site being visited (recordType 'dataCenter') and carry the
 * work order in their variables, so the work order's own process lookup only finds its P10.
 */
export function accessRequestOf(d: DeliveryData, wo: T.WorkOrder): T.ProcessInstance | undefined {
  return d.processInstances.find(i => i.id === wo.accessRequestId)
    ?? d.processInstances.filter(i => i.definitionKey === 'access-request' && i.variables?.workOrderId === wo.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}
export interface AccessState { label: string; tone: VwChipVariant; approved: boolean; detail: string }
export function accessState(inst?: T.ProcessInstance): AccessState {
  if (!inst) return { label: 'Not requested', tone: 'warning', approved: false, detail: 'Contractor crews need a site access request before they arrive.' };
  const cur = inst.currentElementIds, done = inst.completedElementIds;
  if (inst.state === 'cancelled') return { label: 'Cancelled', tone: 'neutral', approved: false, detail: 'The access request was cancelled. Start a new one.' };
  if (inst.state === 'incident') return { label: 'Stopped', tone: 'error', approved: false, detail: 'The access request process has an incident; an operator must retry it.' };
  if (inst.state === 'completed') return done.includes('end_denied')
    ? { label: 'Denied', tone: 'error', approved: false, detail: 'Security denied the zones. Change the request and start a new one.' }
    : { label: 'Visit complete', tone: 'success', approved: true, detail: 'The crew checked out and the visit is closed.' };
  if (cur.some(id => ['check_in', 'escorted', 'check_out', 'extend'].includes(id))) return { label: 'Approved', tone: 'success', approved: true, detail: 'Security approved the zones; the crew checks in on arrival.' };
  if (cur.includes('approve_zones')) return { label: 'Waiting for security', tone: 'warning', approved: false, detail: 'Security has to approve the zones the crew will visit.' };
  return { label: 'Being prepared', tone: 'info', approved: false, detail: 'The visit request has to be submitted (task in the inbox).' };
}

export interface WorkOrderRow {
  wo: T.WorkOrder; title: string;
  change?: T.ChangeRequest; changeClass?: T.ChangeClass; window?: T.MaintenanceWindow;
  project?: T.Project; program?: T.Program; plan?: T.PlannerPlan; contractor?: T.Vendor;
  siteId?: string; start?: string; end?: string;
  open: boolean; dueToday: boolean; overdue: boolean;
  /** Why the work cannot start now (undefined when it can, or when it is already past starting). */
  startBlock?: string;
  assignee: string;
}

export function buildWorkOrderRow(d: DeliveryData, wo: T.WorkOrder, now = Date.now()): WorkOrderRow {
  const change = d.changeRequests.find(c => c.id === wo.changeRequestId) ?? d.changeRequests.find(c => c.workOrderId === wo.id);
  const project = d.projects.find(p => p.id === (wo.projectId ?? change?.projectId));
  const program = d.programs.find(p => p.id === (wo.programId ?? change?.programId ?? project?.programId));
  const planId = wo.plannerPlanId ?? change?.plannerPlanId ?? project?.plannerPlanId ?? program?.plannerPlanId;
  const window = change ? d.maintenanceWindows.find(w => w.changeRequestId === change.id) : undefined;
  const contractor = wo.assigneeKind === 'contractor' ? d.vendors.find(v => v.id === wo.contractorVendorId) : undefined;
  const start = wo.plannedStart ?? window?.scheduledStart ?? change?.scheduledStart ?? wo.scheduledDate;
  const end = wo.plannedEnd ?? window?.scheduledEnd ?? change?.scheduledEnd;
  const open = isOpenWorkOrder(wo);
  const access = wo.assigneeKind === 'contractor' ? accessState(accessRequestOf(d, wo)) : undefined;
  const row: WorkOrderRow = {
    wo, title: woTitle(wo, change), change, changeClass: change ? changeClassOf(change) : undefined, window, project, program,
    plan: planId ? d.plannerPlans.find(p => p.id === planId) : undefined, contractor,
    siteId: wo.dataCenterId ?? change?.dataCenterId ?? project?.dataCenterId, start, end, open,
    dueToday: open && !!start && isSameDay(start, now) && wo.status !== 'InProgress',
    overdue: NOT_DONE.includes(wo.status) && !!(end ?? start) && new Date(end ?? start!).getTime() < now,
    assignee: contractor ? `${contractor.name}${wo.crew?.length ? ` · crew of ${wo.crew.length}` : ''}` : wo.assigneeKind === 'contractor' ? 'Contractor not chosen' : wo.assigneeName || 'Not assigned',
  };
  row.startBlock = startBlockOf(row, access);
  return row;
}

/** Why a Ready/Assigned work order cannot start. Every change goes through a change request; contractors also need site access. */
export function startBlockOf(r: WorkOrderRow, access?: AccessState): string | undefined {
  if (!['Ready', 'Assigned', 'Awaiting change approval', 'Draft'].includes(r.wo.status)) return undefined;
  const c = r.change;
  if (!c) return 'No change request is linked. Every change to the estate is made through a change request, one per work order.';
  if (!CHANGE_APPROVED.includes(c.status)) {
    const cls = r.changeClass ?? 'Normal';
    const wait = cls === 'Emergency' ? 'the emergency board approves it' : cls === 'Standard' ? 'its standard template approves it' : 'every approver and the change board have approved it';
    return `Change ${c.chgId ?? c.id} is ${CHG_STATUS_LABEL[c.status].toLowerCase()}. The work can start when ${wait}.`;
  }
  if (c.freezeId && r.changeClass !== 'Emergency') return 'The window falls in a change freeze; only emergency changes may proceed.';
  if (r.wo.assigneeKind === 'contractor' && access && !access.approved) return `The contractor crew has no approved site access yet (${access.label.toLowerCase()}).`;
  if (!r.wo.assigneeName && r.wo.assigneeKind !== 'contractor') return 'Nobody is assigned yet. Assign a technician or a contractor first.';
  return undefined;
}

export function buildWorkOrderRows(d: DeliveryData, now = Date.now()): WorkOrderRow[] {
  return d.workOrders.map(wo => buildWorkOrderRow(d, wo, now));
}

/** Data-centre name lookup (falls back to the id). */
export function siteNamer(d: DeliveryData): (id?: string) => string {
  const m = new Map(d.dataCenters.map(dc => [dc.id, dc.name]));
  return id => (id ? m.get(id) ?? id : '—');
}
