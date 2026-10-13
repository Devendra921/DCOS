/* Pure helpers shared by the project and programme pages: money and date formats, status tones,
   the process a project template runs, and the small read-models the tabs need. No React here. */
import type * as T from '../../../../mock/data/types';
import type { VwChipVariant } from '../../../../shared/components/ux';
import { fmtDate } from '../../../../shared/components/ux';
import { BPMN_KEYS } from '../../../workorders/lib/engine';
import { DEFAULT_PROCESS } from '../../../workorders/lib/useWorkflows';
import * as templates from '../../lib/projectTemplates';
import { changeClassOf, isOpenChange, isOpenWorkOrder, type DeliveryData, type ProjectChain } from '../../lib/chain';

export { fmtDate };
export const money = (v: number | undefined) => {
  if (v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  return a >= 1e6 ? `${s}$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${s}$${Math.round(a / 1e3)}k` : `${s}$${Math.round(a)}`;
};
export const pct = (v: number) => `${Math.round(v)}%`;
/** A project's name without its programme's name in front ("DC4 Phase 2 — Hall 3 fit-out" → "Hall 3 fit-out"). */
export const shortName = (name: string, programName?: string) => (programName && name.startsWith(programName) ? name.slice(programName.length).replace(/^[\s—–-]+/, '') || name : name);
export const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
export const dateTime = (iso?: string) => { if (!iso) return '—'; const x = new Date(iso); return `${x.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
export const windowText = (start?: string, end?: string) => {
  if (!start) return '—';
  const s = new Date(start), e = end ? new Date(end) : undefined;
  const d = (x: Date) => x.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const t = (x: Date) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
  if (!e) return `${d(s)} ${t(s)}`;
  return s.toDateString() === e.toDateString() ? `${d(s)} ${t(s)}–${t(e)}` : `${d(s)} – ${d(e)}`;
};
export const daysFrom = (iso: string, now = Date.now()) => Math.round((new Date(iso).getTime() - now) / 864e5);

/* ------------------------------------------------------------------ tones */
export const RAG_TONE: Record<string, VwChipVariant> = { Red: 'error', Amber: 'warning', Green: 'success', Grey: 'neutral' };
export const PROJECT_STATUS_TONE: Record<string, VwChipVariant> = { Planning: 'neutral', Active: 'info', 'At Risk': 'warning', Blocked: 'error', Completed: 'success', 'On Hold': 'neutral' };
export const PROGRAM_STATUS_TONE: Record<string, VwChipVariant> = { Proposed: 'neutral', Planning: 'neutral', Active: 'info', 'On Hold': 'warning', Closed: 'success' };
export const WO_STATUS_TONE: Record<T.WorkOrder['status'], VwChipVariant> = {
  Draft: 'neutral', 'Awaiting change approval': 'warning', Ready: 'info', Assigned: 'info', InProgress: 'info', Validated: 'cyan', Completed: 'success', Cancelled: 'neutral', Failed: 'error',
};
export const WO_STATUS_LABEL: Partial<Record<T.WorkOrder['status'], string>> = { InProgress: 'In progress' };
export const CHANGE_STATUS_TONE: Record<T.ChangeRequest['status'], VwChipVariant> = {
  Draft: 'neutral', Submitted: 'info', UnderReview: 'warning', Approved: 'success', Scheduled: 'info', InProgress: 'info', Implemented: 'success', Closed: 'neutral', Rejected: 'error', Cancelled: 'neutral', RolledBack: 'error',
};
export const CHANGE_STATUS_LABEL: Partial<Record<T.ChangeRequest['status'], string>> = { UnderReview: 'Under review', InProgress: 'In progress', RolledBack: 'Rolled back' };
export const CLASS_TONE: Record<T.ChangeClass, VwChipVariant> = { Standard: 'success', Normal: 'info', Emergency: 'error' };
export const RISK_TONE: Record<string, VwChipVariant> = { Low: 'neutral', Medium: 'warning', High: 'error', Critical: 'error' };
export const MILESTONE_TONE: Record<string, VwChipVariant> = { 'Not Started': 'neutral', 'In Progress': 'info', Completed: 'success', Delayed: 'error' };
export const TASK_TONE: Record<string, VwChipVariant> = { Done: 'success', 'In Progress': 'info', Blocked: 'error', 'To Do': 'neutral' };
export const PERMIT_TONE: Record<string, VwChipVariant> = { 'Not Started': 'neutral', Applied: 'info', 'In Review': 'warning', Approved: 'success', Rejected: 'error', Expired: 'error' };
export const ATP_TONE: Record<string, VwChipVariant> = { Draft: 'neutral', 'In Progress': 'warning', Witnessed: 'cyan', Accepted: 'success', Failed: 'error' };
export const PO_TONE: Record<string, VwChipVariant> = { Draft: 'neutral', Approved: 'info', Ordered: 'warning', Received: 'success', Cancelled: 'neutral' };
export const WO_TYPE_LABEL: Record<string, string> = {
  RackInstall: 'Rack install', Cabling: 'Cabling', PowerConnect: 'Power connect', DeviceDeploy: 'Device deploy', DeviceRemoval: 'Device removal', Migration: 'Migration',
  PlantInstall: 'Plant install', PlantCutIn: 'Plant cut-in', Commissioning: 'Commissioning', Civil: 'Civil works', Inspection: 'Inspection', Disposal: 'Disposal', CircuitTurnUp: 'Circuit turn-up', Configuration: 'Configuration',
};
export const CHANGE_TYPE_LABEL: Record<string, string> = { RackDeploy: 'Rack deploy', VLANProvision: 'VLAN provision', PowerUpgrade: 'Power upgrade', ServerRelocation: 'Server relocation', NetworkMigration: 'Network migration', Decommission: 'Decommission', ConfigPush: 'Config push' };

/* ------------------------------------------------------------------ process for a template */
const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/**
 * The BPMN process a project of this template runs. Agent D1 exports `PROCESS_FOR_TEMPLATE`
 * from the delivery lib; until it exists the convention `project-<template slug>` is tried,
 * then the fit-out process for fit-out style templates. Returns undefined when no BPMN file exists.
 */
export function processKeyForTemplate(template: string | undefined): string | undefined {
  if (!template) return undefined;
  const map = (templates as unknown as { PROCESS_FOR_TEMPLATE?: Record<string, string> }).PROCESS_FOR_TEMPLATE;
  const candidates = [map?.[template], `project-${slug(template)}`, ['Hall Fit-out', 'Rack Deployment', 'Building Fit-out'].includes(template) ? DEFAULT_PROCESS.project : undefined];
  return candidates.find((k): k is string => !!k && BPMN_KEYS.includes(k));
}

/* ------------------------------------------------------------------ read-models */
export interface ChangeRow {
  change: T.ChangeRequest; cls: T.ChangeClass; classRecorded: boolean;
  workOrder?: T.WorkOrder; project?: T.Project; window?: T.MaintenanceWindow;
  approved: number; approvals: number; rejected: boolean; reviewState: string; open: boolean;
}
export function changeRows(d: DeliveryData, changes: T.ChangeRequest[]): ChangeRow[] {
  return changes.map((c) => {
    const steps = d.approvalSteps.filter((a) => a.changeRequestId === c.id);
    const cls = changeClassOf(c);
    const workOrder = d.workOrders.find((w) => w.id === c.workOrderId) ?? d.workOrders.find((w) => w.changeRequestId === c.id);
    const needsReview = cls === 'Emergency' || c.status === 'RolledBack';
    const reviewState = c.review ? c.review.outcome : needsReview && ['Implemented', 'RolledBack'].includes(c.status) ? 'Review due' : needsReview ? 'Review after' : c.status === 'Implemented' ? 'Awaiting close' : '—';
    return {
      change: c, cls, classRecorded: !!c.changeClass, workOrder,
      project: d.projects.find((p) => p.id === (c.projectId ?? workOrder?.projectId)),
      window: d.maintenanceWindows.find((w) => w.changeRequestId === c.id),
      approved: steps.filter((s) => s.decision === 'Approved').length, approvals: steps.length, rejected: steps.some((s) => s.decision === 'Rejected'),
      reviewState, open: isOpenChange(c),
    };
  }).sort((a, b) => Number(b.open) - Number(a.open) || (b.change.scheduledStart ?? b.change.createdAt).localeCompare(a.change.scheduledStart ?? a.change.createdAt));
}

export interface WorkOrderRow {
  wo: T.WorkOrder; change?: T.ChangeRequest; cls?: T.ChangeClass; project?: T.Project; site?: T.DataCenter; contractor?: T.Vendor;
  assignee: string; crew?: string; start?: string; end?: string; open: boolean;
}
export function workOrderRows(d: DeliveryData, wos: T.WorkOrder[]): WorkOrderRow[] {
  return wos.map((wo) => {
    const change = d.changeRequests.find((c) => c.id === wo.changeRequestId) ?? d.changeRequests.find((c) => c.workOrderId === wo.id);
    const contractor = wo.contractorVendorId ? d.vendors.find((v) => v.id === wo.contractorVendorId) : undefined;
    const assignee = wo.assigneeKind === 'contractor' ? (contractor?.name ?? wo.contractorVendorId ?? 'Contractor') : wo.assigneeName || 'Unassigned';
    return {
      wo, change, cls: change ? changeClassOf(change) : undefined, project: d.projects.find((p) => p.id === wo.projectId),
      site: d.dataCenters.find((x) => x.id === wo.dataCenterId), contractor, assignee,
      crew: wo.crew?.length ? wo.crew.join(', ') : undefined,
      start: wo.plannedStart ?? wo.scheduledDate, end: wo.plannedEnd, open: isOpenWorkOrder(wo),
    };
  }).sort((a, b) => Number(b.open) - Number(a.open) || (a.start ?? '').localeCompare(b.start ?? ''));
}

/* ------------------------------------------------------------------ blockers */
export interface Blocker { key: string; what: string; detail: string; tab: string }

/** Everything currently holding the project up, in reading order. */
export function projectBlockers(chain: ProjectChain, snags: T.Snag[], incidents: T.EngineIncident[]): Blocker[] {
  const out: Blocker[] = [];
  for (const e of incidents) out.push({ key: `inc:${e.id}`, what: 'Process step failed', detail: e.message, tab: 'process' });
  const permits = chain.permits.filter((p) => p.status !== 'Approved');
  if (permits.length) out.push({ key: 'permits', what: `${permits.length} permit${permits.length === 1 ? '' : 's'} not approved`, detail: permits.slice(0, 3).map((p) => `${p.name} (${p.status})`).join(', '), tab: 'commissioning' });
  const awaiting = chain.changes.filter((c) => ['Draft', 'Submitted', 'UnderReview'].includes(c.status));
  if (awaiting.length) out.push({ key: 'changes', what: `${awaiting.length} change${awaiting.length === 1 ? '' : 's'} awaiting approval`, detail: awaiting.slice(0, 3).map((c) => `${c.chgId ?? c.id} ${changeClassOf(c).toLowerCase()}, ${c.status === 'UnderReview' ? 'under review' : c.status.toLowerCase()}`).join('; '), tab: 'changes' });
  const woWait = chain.workOrders.filter((w) => w.status === 'Awaiting change approval');
  if (woWait.length) out.push({ key: 'wo', what: `${woWait.length} work order${woWait.length === 1 ? '' : 's'} cannot start`, detail: 'Their change requests are not approved yet.', tab: 'workorders' });
  const atpOpen = chain.atps.filter((a) => a.status !== 'Accepted');
  if (chain.atps.length && atpOpen.length) out.push({ key: 'atp', what: `${atpOpen.length} of ${chain.atps.length} acceptance tests not accepted`, detail: atpOpen.slice(0, 3).map((a) => `${a.name} (${a.status})`).join(', '), tab: 'commissioning' });
  const blocking = snags.filter((s) => s.status === 'Open' && (s.severity === 'Critical' || s.severity === 'Major'));
  if (blocking.length) out.push({ key: 'snags', what: `${blocking.length} critical or major snag${blocking.length === 1 ? '' : 's'} open`, detail: blocking.slice(0, 2).map((s) => s.description).join('; '), tab: 'commissioning' });
  return out;
}

