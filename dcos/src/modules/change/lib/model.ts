/**
 * Change module view model — pure helpers over the delivery bundle (`useDeliveryData()`).
 *
 * One change request per work order. Changes are standard (pre-approved template),
 * normal (approval matrix + weekly change board) or emergency (emergency board on demand,
 * review afterwards). Nothing here writes; screens write through `useChainActions()` and
 * the few local actions in `./actions.ts`.
 */
import type * as T from '../../../mock/data/types';
import type { Role } from '../../../mock/data/enums';
import { PEOPLE, type Person } from '../../../mock/db/seed/ctx';
import { changeClassOf, freezeFor, isOpenChange, type DeliveryData } from '../../delivery/lib/chain';

export type ChangeStatus = T.ChangeRequest['status'];
export type ChipTone = 'neutral' | 'info' | 'warning' | 'success' | 'error' | 'cyan' | 'purple' | 'orange';

export const STATUS_LABEL: Record<ChangeStatus, string> = {
  Draft: 'Draft', Submitted: 'Submitted', UnderReview: 'Under review', Approved: 'Approved', Scheduled: 'Scheduled', InProgress: 'In progress',
  Implemented: 'Implemented', Closed: 'Closed', Rejected: 'Rejected', Cancelled: 'Cancelled', RolledBack: 'Rolled back',
};
export const STATUS_TONE: Record<ChangeStatus, ChipTone> = {
  Draft: 'neutral', Submitted: 'info', UnderReview: 'warning', Approved: 'success', Scheduled: 'cyan', InProgress: 'purple',
  Implemented: 'success', Closed: 'neutral', Rejected: 'error', Cancelled: 'neutral', RolledBack: 'error',
};
export const STATUS_ORDER: ChangeStatus[] = ['Draft', 'Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress', 'Implemented', 'Closed', 'Rejected', 'Cancelled', 'RolledBack'];
export const CLASS_TONE: Record<T.ChangeClass, ChipTone> = { Standard: 'cyan', Normal: 'info', Emergency: 'error' };
export const RISK_TONE: Record<string, ChipTone> = { Low: 'neutral', Medium: 'warning', High: 'orange', Critical: 'error' };
export const RISKS = ['Low', 'Medium', 'High', 'Critical'] as const;

export const WO_STATUS_TONE: Record<string, ChipTone> = {
  Draft: 'neutral', 'Awaiting change approval': 'warning', Ready: 'info', Assigned: 'info', InProgress: 'purple', Validated: 'cyan', Completed: 'success', Cancelled: 'neutral', Failed: 'error',
};
export const WO_TYPE_LABEL: Record<string, string> = {
  RackInstall: 'Rack install', Cabling: 'Cabling', PowerConnect: 'Power connection', DeviceDeploy: 'Device deployment', DeviceRemoval: 'Device removal', Migration: 'Migration',
  PlantInstall: 'Plant install', PlantCutIn: 'Plant cut-in', Commissioning: 'Commissioning', Civil: 'Civil works', Inspection: 'Inspection', Disposal: 'Disposal',
  CircuitTurnUp: 'Circuit turn-up', Configuration: 'Configuration',
};
export const CHANGE_TYPE_LABEL: Record<string, string> = {
  RackDeploy: 'Rack deployment', VLANProvision: 'VLAN provisioning', PowerUpgrade: 'Power work', ServerRelocation: 'Relocation', NetworkMigration: 'Network migration', Decommission: 'Decommission', ConfigPush: 'Configuration',
};

/* ------------------------------------------------------------------ roles */
export const ROLE_LABEL: Record<Role, string> = {
  CapacityPlanner: 'Capacity planner', NetworkEngineer: 'Network engineer', FacilityManager: 'Facility manager', DeliveryManager: 'Delivery manager',
  ChangeApprover: 'Change manager', NOCOperator: 'NOC operator', FieldTechnician: 'Field technician', ComplianceAuditor: 'Compliance auditor', Executive: 'Executive', Administrator: 'Administrator',
};
/** Approval-matrix roles → the people roles that hold them (identity comes from the customer platform; the prototype uses the seeded cast). */
export const ROLE_HOLDERS: Record<Role, string[]> = {
  CapacityPlanner: ['Capacity Planner'], NetworkEngineer: ['Network Engineer'], FacilityManager: ['Facilities Director', 'Facilities Engineer'],
  DeliveryManager: ['Program Manager', 'Project Manager'], ChangeApprover: ['NOC Lead', 'Platform Owner'], NOCOperator: ['NOC Lead'],
  FieldTechnician: ['Field Technician', 'Site Technician'], ComplianceAuditor: ['Compliance Manager'], Executive: ['Executive'], Administrator: ['Administrator'],
};
export const roleLabel = (r: string) => ROLE_LABEL[r as Role] ?? r;
export const peopleFor = (role: string): Person[] => PEOPLE.filter(p => (ROLE_HOLDERS[role as Role] ?? []).includes(p.role));
export const personOf = (u: { id?: string; name: string }): Person | undefined => PEOPLE.find(p => p.id === u.id) ?? PEOPLE.find(p => p.name === u.name);
/** Whether the signed-in user may decide a step of this role. Administrators may act for any role in the prototype. */
export function holdsRole(u: { id?: string; name: string }, role: string): boolean {
  const me = personOf(u);
  return !!me && (me.role === 'Administrator' || (ROLE_HOLDERS[role as Role] ?? []).includes(me.role));
}
export const technicians = () => PEOPLE.filter(p => ['Field Technician', 'Site Technician', 'Facilities Engineer', 'Network Engineer'].includes(p.role));

/* ------------------------------------------------------------------ approvals */
export const isPendingStep = (s: T.ApprovalStep) => s.decision !== 'Approved' && s.decision !== 'Rejected';
/** The step that is up for decision: the lowest pending step of a submitted change. Steps are decided in order. */
export function currentStep(c: T.ChangeRequest, steps: T.ApprovalStep[]): T.ApprovalStep | undefined {
  if (c.status !== 'Submitted' && c.status !== 'UnderReview') return undefined;
  return steps.filter(isPendingStep).sort((a, b) => a.order - b.order)[0];
}
/** When the current step started waiting: the previous step's decision, else submission. */
export function waitingSince(c: T.ChangeRequest, steps: T.ApprovalStep[], step: T.ApprovalStep): string {
  const prev = steps.filter(s => s.order < step.order && s.decidedAt).map(s => s.decidedAt!).sort().pop();
  return prev ?? c.submittedAt ?? c.updatedAt;
}

/* ------------------------------------------------------------------ rows */
export interface ChangeRow {
  c: T.ChangeRequest; cls: T.ChangeClass;
  wo?: T.WorkOrder; project?: T.Project; program?: T.Program; site?: T.DataCenter; mw?: T.MaintenanceWindow; template?: T.StandardChangeTemplate;
  start?: string; end?: string;
  steps: T.ApprovalStep[]; current?: T.ApprovalStep; mine: boolean;
  freeze?: T.ChangeFreeze; reviewDue: boolean; failed: boolean;
}
const index = <R extends { id: string }>(rows: R[]) => new Map(rows.map(r => [r.id, r]));

export function buildRows(d: DeliveryData, user: { id?: string; name: string }): ChangeRow[] {
  const wos = index(d.workOrders), woByChange = new Map(d.workOrders.filter(w => w.changeRequestId).map(w => [w.changeRequestId!, w]));
  const projects = index(d.projects), programs = index(d.programs), sites = index(d.dataCenters), templates = index(d.standardChangeTemplates), freezes = index(d.changeFreezes);
  const mwByChange = new Map(d.maintenanceWindows.filter(w => w.changeRequestId && w.status !== 'Cancelled').map(w => [w.changeRequestId!, w]));
  const stepsBy = new Map<string, T.ApprovalStep[]>();
  for (const s of d.approvalSteps) stepsBy.set(s.changeRequestId, [...(stepsBy.get(s.changeRequestId) ?? []), s]);
  return d.changeRequests.map(c => {
    const wo = (c.workOrderId ? wos.get(c.workOrderId) : undefined) ?? woByChange.get(c.id);
    const project = projects.get(c.projectId ?? wo?.projectId ?? '');
    const program = programs.get(c.programId ?? project?.programId ?? '');
    const mw = mwByChange.get(c.id);
    const start = mw?.scheduledStart ?? c.scheduledStart, end = mw?.scheduledEnd ?? c.scheduledEnd ?? start;
    const steps = (stepsBy.get(c.id) ?? []).sort((a, b) => a.order - b.order);
    const current = currentStep(c, steps);
    const cls = changeClassOf(c);
    const siteId = c.dataCenterId ?? wo?.dataCenterId;
    const freeze = (c.freezeId ? freezes.get(c.freezeId) : undefined) ?? (start && isOpenChange(c) ? freezeFor(d, siteId, start, end ?? start) : undefined);
    const failed = c.status === 'RolledBack' || c.review?.outcome === 'Failed' || c.review?.outcome === 'Rolled back' || wo?.status === 'Failed';
    return {
      c, cls, wo, project, program, site: siteId ? sites.get(siteId) : undefined, mw, template: c.standardTemplateId ? templates.get(c.standardTemplateId) : undefined,
      start, end, steps, current, mine: !!current && holdsRole(user, current.approverRole), freeze,
      reviewDue: !c.review && (c.status === 'Implemented' || c.status === 'RolledBack') && (cls === 'Emergency' || failed),
      failed,
    };
  });
}

/* ------------------------------------------------------------------ figures */
const DAY = 86400e3;
export function startOfWeek(t: Date): Date { const d = new Date(t); d.setHours(0, 0, 0, 0); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d; }
export interface HomeFigures { open: number; openByClass: Record<T.ChangeClass, number>; mine: number; oldestMineDays?: number; weekWindows: number; weekSites: number; emergencyReview: number; inFreeze: number; failed30: number; done30: number }
export function homeFigures(rows: ChangeRow[], entries: CalEntry[], now = new Date()): HomeFigures {
  const open = rows.filter(r => isOpenChange(r.c));
  const mine = rows.filter(r => r.mine);
  const oldest = mine.length ? Math.min(...mine.map(r => new Date(waitingSince(r.c, r.steps, r.current!)).getTime())) : undefined;
  const w0 = startOfWeek(now).getTime(), w1 = w0 + 7 * DAY;
  const week = entries.filter(e => { const t = new Date(e.start).getTime(); return t >= w0 && t < w1 && e.status !== 'Cancelled'; });
  const t30 = now.getTime() - 30 * DAY;
  const doneAt = (r: ChangeRow) => new Date(r.c.closedAt ?? r.c.implementedAt ?? r.c.updatedAt).getTime();
  const done30 = rows.filter(r => ['Implemented', 'Closed', 'RolledBack'].includes(r.c.status) && doneAt(r) >= t30);
  return {
    open: open.length, openByClass: { Standard: open.filter(r => r.cls === 'Standard').length, Normal: open.filter(r => r.cls === 'Normal').length, Emergency: open.filter(r => r.cls === 'Emergency').length },
    mine: mine.length, oldestMineDays: oldest === undefined ? undefined : Math.max(0, Math.floor((now.getTime() - oldest) / DAY)),
    weekWindows: week.length, weekSites: new Set(week.map(e => e.siteId ?? '')).size,
    emergencyReview: rows.filter(r => r.cls === 'Emergency' && r.reviewDue).length,
    inFreeze: open.filter(r => r.freeze).length,
    failed30: done30.filter(r => r.failed).length, done30: done30.length,
  };
}

/* ------------------------------------------------------------------ calendar */
export interface CalEntry {
  key: string; kind: 'change' | 'window'; changeId?: string; mwId?: string; label: string; title: string;
  siteId?: string; start: string; end: string; cls?: T.ChangeClass; status: string; resources: string[];
}
/** Maintenance windows (with their change) and scheduled changes that have no window record yet. */
export function calendarEntries(d: DeliveryData): CalEntry[] {
  const changes = index(d.changeRequests);
  const out: CalEntry[] = [];
  const withWindow = new Set<string>();
  for (const w of d.maintenanceWindows) {
    if (w.status === 'Cancelled') continue;
    const c = w.changeRequestId ? changes.get(w.changeRequestId) : undefined;
    if (c && (c.status === 'Cancelled' || c.status === 'Rejected')) continue;
    if (c) withWindow.add(c.id);
    out.push({
      key: w.id, kind: 'window', changeId: c?.id, mwId: w.id, label: c?.id ?? w.id, title: c?.title ?? w.title, siteId: w.dataCenterId ?? c?.dataCenterId,
      start: w.scheduledStart, end: w.scheduledEnd, cls: c ? changeClassOf(c) : undefined, status: c ? STATUS_LABEL[c.status] : w.status,
      resources: [...new Set([...(w.affectedDeviceIds ?? []), ...(c?.affectedResourceIds ?? [])])],
    });
  }
  for (const c of d.changeRequests) {
    if (withWindow.has(c.id) || !c.scheduledStart || c.status === 'Cancelled' || c.status === 'Rejected') continue;
    out.push({ key: c.id, kind: 'change', changeId: c.id, label: c.id, title: c.title, siteId: c.dataCenterId, start: c.scheduledStart, end: c.scheduledEnd ?? c.scheduledStart, cls: changeClassOf(c), status: STATUS_LABEL[c.status], resources: c.affectedResourceIds ?? [] });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
export interface CalClash { a: CalEntry; b: CalEntry; shared: string[] }
/** Pairs of entries at the same site that overlap in time and touch the same devices or racks (racks expand to their devices). */
export function calendarClashes(entries: CalEntry[], rackOfDevice?: Map<string, string>): CalClash[] {
  const expand = (ids: string[]) => { const s = new Set(ids); if (rackOfDevice) for (const id of ids) { const r = rackOfDevice.get(id); if (r) s.add(r); } return s; };
  const live = entries.filter(e => !['Completed', 'Closed', 'Implemented', 'Rolled back'].includes(e.status));
  const sets = new Map(live.map(e => [e.key, expand(e.resources)]));
  const out: CalClash[] = [];
  const sorted = [...live].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      if (b.start >= a.end) break;
      if (a.siteId !== b.siteId || (a.changeId && a.changeId === b.changeId)) continue;
      const sa = sets.get(a.key)!, sb = sets.get(b.key)!;
      const shared = [...sa].filter(x => sb.has(x));
      if (shared.length) out.push({ a, b, shared });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ change board */
/** Weekly change board: Thursdays at 10:00 local time (assumption shown in the help text). */
export function nextBoardMeeting(now = new Date()): Date {
  const d = new Date(now); d.setHours(10, 0, 0, 0);
  const add = (4 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + add);
  if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 7);
  return d;
}
/** Normal changes due at the next board: submitted or under review, not yet decided, and booked for this board or not yet booked. */
export function boardAgenda(rows: ChangeRow[], meeting: Date): ChangeRow[] {
  return rows.filter(r => r.cls === 'Normal' && (r.c.status === 'Submitted' || r.c.status === 'UnderReview') && (!r.c.cabDate || new Date(r.c.cabDate).getTime() <= meeting.getTime() + DAY));
}

/* ------------------------------------------------------------------ lifecycle */
export interface LifeStep { key: string; label: string; state: 'completed' | 'current' | 'upcoming' | 'failed' | 'skipped' }
const FLOW = ['Draft', 'Submitted', 'Approved', 'Scheduled', 'InProgress', 'Implemented', 'Closed'] as const;
export function lifecycle(c: T.ChangeRequest, cls: T.ChangeClass): LifeStep[] {
  const pos: Record<string, number> = { Draft: 0, Submitted: 1, UnderReview: 1, Approved: 2, Scheduled: 3, InProgress: 4, Implemented: 6, RolledBack: 6, Closed: 6 };
  const label = (k: string) => k === 'InProgress' ? 'In progress' : k === 'Closed' ? (cls === 'Emergency' && !c.review && (c.status === 'Implemented' || c.status === 'RolledBack') ? 'Review due' : 'Reviewed and closed') : k === 'Submitted' && c.status === 'UnderReview' ? 'Under review' : k;
  const stopped = c.status === 'Rejected' || c.status === 'Cancelled';
  const failAt = c.status === 'Rejected' ? 1 : c.status === 'Cancelled' ? Math.max(0, stepBefore(c)) : -1;
  const at = stopped ? failAt : pos[c.status] ?? 0;
  return FLOW.map((k, i) => {
    let state: LifeStep['state'] = i < at ? 'completed' : i === at ? 'current' : 'upcoming';
    if (stopped && i === at) state = 'failed';
    if (stopped && i > at) state = 'skipped';
    if (c.status === 'RolledBack' && i === 5) state = 'failed';
    if (c.status === 'Closed' && i === 6) state = 'completed';
    if (cls === 'Standard' && (k === 'Submitted') && i < at) state = 'skipped';
    return { key: k, label: c.status === 'RolledBack' && i === 5 ? 'Rolled back' : label(k), state };
  });
}
function stepBefore(c: T.ChangeRequest): number {
  if (c.implementedAt) return 5; if (c.scheduledStart && c.approvedAt) return 3; if (c.approvedAt) return 2; if (c.submittedAt) return 1; return 0;
}

/* ------------------------------------------------------------------ formatting */
export const fmtDay = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtDayShort = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
export const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
export const fmtWhen = (iso?: string) => iso ? `${fmtDayShort(iso)} ${fmtTime(iso)}` : '—';
export const fmtHours = (start?: string, end?: string) => { if (!start || !end) return ''; const h = (new Date(end).getTime() - new Date(start).getTime()) / 3600e3; return h >= 24 ? `${Math.round(h / 24 * 10) / 10} d` : `${Math.round(h * 10) / 10} h`; };
export const daysAgo = (iso?: string, now = Date.now()) => iso ? Math.floor((now - new Date(iso).getTime()) / DAY) : undefined;
export const siteLabel = (s?: T.DataCenter) => s ? s.code || s.name : '—';
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
