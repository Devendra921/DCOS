/**
 * Materials on the delivery chain — pure rules and lookups shared by the screens, the seed and
 * the scripts. The supply chain platform owns stock, kitting and returns; the ERP owns purchase
 * orders and receipts. DCOS keeps the material lines of each project step, work order and
 * change, and reads their progress from here.
 *
 * Readiness is advisory only: nothing in the chain is blocked by it (approval and start of
 * work show it as a warning).
 */
import type * as T from '../../../mock/data/types';
import { MATERIAL_LINE_STATUS, type MaterialLineStatus } from '../../../mock/data/enums';

/** The material collections the screens read, alongside the delivery bundle. */
export interface MaterialData {
  materials: T.Material[]; materialLines: T.MaterialLine[]; materialEvents: T.MaterialEvent[];
  supplyRequests: T.SupplyRequest[]; purchaseOrderLines: T.PurchaseOrderLine[]; goodsReceipts: T.GoodsReceipt[];
  ready: boolean;
}
export const MATERIAL_DATA_KEYS = ['materials', 'materialLines', 'materialEvents', 'supplyRequests', 'purchaseOrderLines', 'goodsReceipts'] as const satisfies readonly (keyof Omit<MaterialData, 'ready'>)[];

export function materialDataFromSnapshot(snap: Record<string, unknown>): MaterialData {
  const out = { ready: true } as Record<string, unknown>;
  for (const k of MATERIAL_DATA_KEYS) out[k] = ((snap[k] as { isDeleted?: boolean }[] | undefined) ?? []).filter(r => !r.isDeleted);
  return out as unknown as MaterialData;
}

/* ------------------------------------------------------------------ status order */
const RANK: Record<MaterialLineStatus, number> = Object.fromEntries(MATERIAL_LINE_STATUS.map((s, i) => [s, i])) as Record<MaterialLineStatus, number>;
export const statusRank = (s: MaterialLineStatus) => RANK[s];
/** True when the line has reached `s` (or gone past it). Returned and Cancelled lines count as not reached. */
export const reached = (l: Pick<T.MaterialLine, 'status'>, s: MaterialLineStatus) => l.status !== 'Cancelled' && l.status !== 'Returned' && RANK[l.status] >= RANK[s];
export const isLive = (l: Pick<T.MaterialLine, 'status'>) => l.status !== 'Cancelled';
/** Installed or consumed: the line's work is done. */
export const isUsed = (l: Pick<T.MaterialLine, 'status'>) => l.status === 'Installed' || l.status === 'Consumed';

/* ------------------------------------------------------------------ lookups */
export const linesOfWorkOrder = (d: Pick<MaterialData, 'materialLines'>, workOrderId: string) => d.materialLines.filter(l => l.workOrderId === workOrderId && isLive(l));
/** One change per work order: the change's lines are its work order's lines. */
export const linesOfChange = (d: Pick<MaterialData, 'materialLines'>, change: Pick<T.ChangeRequest, 'id' | 'workOrderId'>) =>
  d.materialLines.filter(l => isLive(l) && (l.changeRequestId === change.id || (!!change.workOrderId && l.workOrderId === change.workOrderId)));
export const linesOfProject = (d: Pick<MaterialData, 'materialLines'>, projectId: string) => d.materialLines.filter(l => l.projectId === projectId && isLive(l));
/** Lines planned for a project step (BPMN wait_<step>), whether or not a work order has taken them yet. */
export const linesOfStep = (d: Pick<MaterialData, 'materialLines'>, projectId: string, stepId: string) => linesOfProject(d, projectId).filter(l => l.projectStepId === stepId);
export const eventsOfLine = (d: Pick<MaterialData, 'materialEvents'>, lineId: string) => d.materialEvents.filter(e => e.materialLineId === lineId).sort((a, b) => a.at.localeCompare(b.at));
export const eventsOfWorkOrder = (d: Pick<MaterialData, 'materialEvents'>, workOrderId: string) => d.materialEvents.filter(e => e.workOrderId === workOrderId).sort((a, b) => a.at.localeCompare(b.at));
export const eventsOfDevice = (d: Pick<MaterialData, 'materialEvents'>, deviceId: string) => d.materialEvents.filter(e => e.deviceId === deviceId).sort((a, b) => a.at.localeCompare(b.at));
export const requestsOfWorkOrder = (d: Pick<MaterialData, 'supplyRequests'>, workOrderId: string) => d.supplyRequests.filter(r => r.workOrderId === workOrderId).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
export const linesOfPoLine = (d: Pick<MaterialData, 'materialLines'>, poLineId: string) => d.materialLines.filter(l => l.poLineId === poLineId && isLive(l));
export const poLinesOfPo = (d: Pick<MaterialData, 'purchaseOrderLines'>, poId: string) => d.purchaseOrderLines.filter(l => l.poId === poId).sort((a, b) => a.lineNo - b.lineNo);
export const receiptsOfPo = (d: Pick<MaterialData, 'goodsReceipts'>, poId: string) => d.goodsReceipts.filter(g => g.poId === poId).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

/* ------------------------------------------------------------------ readiness */
export type Readiness = 'Not needed' | 'Ready' | 'Partly ready' | 'Not ready' | 'Late';
export interface ReadinessView {
  state: Readiness;
  /** Incoming lines and how many of them are at the site (delivered, issued or used). */
  lines: number; atSite: number;
  /** Lines whose supplier date is after the need-by date, or past need-by and not at the site. */
  late: T.MaterialLine[];
  /** Plain-English reasons for anything not ready, e.g. "2 of 5 items not delivered to site". */
  reasons: string[];
}
const atSite = (l: T.MaterialLine) => reached(l, 'Delivered to site');
/** The supplier's date only matters until the items are received. */
export const supplierLate = (l: Pick<T.MaterialLine, 'status' | 'eta' | 'needBy'>) => !reached(l, 'Received') && l.status !== 'Cancelled' && l.status !== 'Returned' && !!(l.eta && l.needBy && l.eta > l.needBy);
/** An incoming line not at the site that will miss (supplier late) or has missed (need-by passed) its need-by date. */
export const lineLate = (l: T.MaterialLine, nowMs = Date.now()) => l.direction === 'In' && isLive(l) && l.status !== 'Returned' && !atSite(l) && (supplierLate(l) || (!!l.needBy && new Date(l.needBy).getTime() < nowMs));
/** Is the kit for this work (incoming lines only) at the site? Advisory; `nowMs` decides lateness. */
export function readinessOf(lines: T.MaterialLine[], nowMs = Date.now()): ReadinessView {
  const inc = lines.filter(l => l.direction === 'In' && isLive(l));
  if (!inc.length) return { state: 'Not needed', lines: 0, atSite: 0, late: [], reasons: [] };
  const here = inc.filter(atSite).length;
  const late = inc.filter(l => lineLate(l, nowMs));
  const reasons: string[] = [];
  if (here < inc.length) reasons.push(`${inc.length - here} of ${inc.length} item${inc.length === 1 ? '' : 's'} not at the site yet`);
  if (late.length) reasons.push(`${late.length} late against need-by`);
  const faulty = inc.reduce((a, l) => a + l.qty.faulty, 0);
  if (faulty) reasons.push(`${faulty} found faulty`);
  const state: Readiness = here === inc.length ? 'Ready' : late.length ? 'Late' : here ? 'Partly ready' : 'Not ready';
  return { state, lines: inc.length, atSite: here, late, reasons };
}
export const READINESS_TONE: Record<Readiness, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = { 'Not needed': 'neutral', Ready: 'success', 'Partly ready': 'warning', 'Not ready': 'warning', Late: 'error' };

/* ------------------------------------------------------------------ usage */
export interface UsageView {
  planned: number; used: number; returned: number; faulty: number;
  /** Lines used more or less than planned, with the difference (used - planned). */
  variances: { line: T.MaterialLine; diff: number }[];
  /** Work is complete but nothing was recorded. */
  notRecorded: boolean;
}
/** Planned against used for the post-change review and the work order sign-off. */
export function usageOf(lines: T.MaterialLine[], wo?: Pick<T.WorkOrder, 'status' | 'materialsRecordedAt'>): UsageView {
  const inc = lines.filter(l => l.direction === 'In' && isLive(l));
  const sum = (f: (l: T.MaterialLine) => number) => inc.reduce((a, l) => a + f(l), 0);
  const variances = inc.filter(l => isUsed(l) || l.status === 'Returned').map(line => ({ line, diff: line.qty.used - line.quantity })).filter(v => v.diff !== 0);
  return { planned: sum(l => l.quantity), used: sum(l => l.qty.used), returned: sum(l => l.qty.returned), faulty: sum(l => l.qty.faulty), variances, notRecorded: !!wo && ['Completed', 'Validated'].includes(wo.status) && inc.length > 0 && !wo.materialsRecordedAt };
}

/* ------------------------------------------------------------------ project roll-up */
export interface StepMaterials { stepId: string; lines: T.MaterialLine[]; readiness: ReadinessView; ordered: number; received: number; atSite: number; used: number; total: number }
/** Per project step: counts by progress and the step's readiness (incoming lines only). */
export function materialsByStep(lines: T.MaterialLine[], nowMs = Date.now()): StepMaterials[] {
  const by = new Map<string, T.MaterialLine[]>();
  for (const l of lines) { if (!isLive(l)) continue; const k = l.projectStepId ?? ''; by.set(k, [...(by.get(k) ?? []), l]); }
  return [...by.entries()].map(([stepId, ls]) => {
    const inc = ls.filter(l => l.direction === 'In');
    return {
      stepId, lines: ls, readiness: readinessOf(ls, nowMs), total: inc.length,
      ordered: inc.filter(l => reached(l, 'Ordered')).length, received: inc.filter(l => reached(l, 'Received')).length,
      atSite: inc.filter(atSite).length, used: inc.filter(isUsed).length,
    };
  });
}
/** Value of lines at catalogue cost. */
export const lineValue = (l: T.MaterialLine, materials: Map<string, T.Material>) => (materials.get(l.materialId)?.unitCost ?? 0) * l.quantity;

/* ------------------------------------------------------------------ labels */
export const LINE_STATUS_TONE: Record<MaterialLineStatus, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  Planned: 'neutral', Ordered: 'info', Received: 'info', 'Kit requested': 'info', Kitted: 'info', 'Delivered to site': 'success',
  Issued: 'success', Installed: 'success', Consumed: 'success', Returned: 'neutral', Cancelled: 'neutral',
};
export const fmtQty = (n: number, uom: T.Material['uom']) => (uom === 'each' ? `${n}` : `${n} ${uom}`);

/* ------------------------------------------------------------------ change level: availability and retired equipment */
export type AvailabilityState = 'Not checked' | 'Available' | 'Available after transfer' | 'On order' | 'Short';
export interface AvailabilityView {
  state: AvailabilityState;
  /** Incoming lines still to be supplied (not yet at the site, not used), and how many of them have an answer from the platform. */
  open: number; checked: number;
  bySource: Record<T.MaterialAvailability['bestSource'], number>;
  /** Lines with a shortfall after site, depot and orders, and the latest date everything can be at the site. */
  short: T.MaterialLine[]; readyBy?: string;
  reserved: number;
  /** Plain-English summary lines, e.g. "3 from the site store · 1 depot transfer (2 days)". */
  reasons: string[];
}
/** Can the change's still-needed incoming items be supplied, and from where? Advisory, like readiness. */
export function availabilityOf(lines: T.MaterialLine[]): AvailabilityView {
  const open = lines.filter(l => l.direction === 'In' && isLive(l) && l.status !== 'Returned' && !reached(l, 'Delivered to site'));
  const checked = open.filter(l => l.availability);
  const bySource: AvailabilityView['bySource'] = { 'Site store': 0, 'Depot transfer': 0, 'On order': 0, 'Purchase needed': 0 };
  for (const l of checked) bySource[l.availability!.bestSource] += 1;
  const short = checked.filter(l => l.availability!.shortfall > 0 || l.availability!.bestSource === 'Purchase needed');
  const readyBy = checked.map(l => l.availability!.readyBy).filter((d): d is string => !!d).sort().pop();
  const reserved = open.filter(l => (l.reservedQty ?? 0) >= l.quantity).length;
  const reasons: string[] = [];
  if (bySource['Site store']) reasons.push(`${bySource['Site store']} from the site store`);
  if (bySource['Depot transfer']) reasons.push(`${bySource['Depot transfer']} by depot transfer`);
  if (bySource['On order']) reasons.push(`${bySource['On order']} on order`);
  if (short.length) reasons.push(`${short.length} short`);
  if (open.length > checked.length) reasons.push(`${open.length - checked.length} not checked`);
  const state: AvailabilityState = !open.length ? 'Available' : checked.length < open.length && !checked.length ? 'Not checked'
    : short.length ? 'Short' : bySource['On order'] ? 'On order' : bySource['Depot transfer'] ? 'Available after transfer' : checked.length < open.length ? 'Not checked' : 'Available';
  return { state, open: open.length, checked: checked.length, bySource, short, readyBy, reserved, reasons };
}
export const AVAILABILITY_TONE: Record<AvailabilityState, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = { 'Not checked': 'neutral', Available: 'success', 'Available after transfer': 'info', 'On order': 'warning', Short: 'error' };

export interface RetiredView {
  lines: T.MaterialLine[]; units: number;
  byDisposition: Record<T.RetiredDisposition | 'Not decided', number>;
  /** Data-bearing units, and those without a sanitisation certificate yet. */
  dataBearing: number; awaitingSanitisation: T.MaterialLine[];
  removed: number; returned: number;
}
/** Removed equipment on a change or work order: what goes where, and what still needs sanitising. */
export function retiredOf(lines: T.MaterialLine[]): RetiredView {
  const out = lines.filter(l => l.direction === 'Out' && isLive(l));
  const byDisposition: RetiredView['byDisposition'] = { 'Return to stock': 0, Redeploy: 0, 'Return to vendor (RMA)': 0, Dispose: 0, 'Not decided': 0 };
  for (const l of out) byDisposition[l.disposition ?? 'Not decided'] += l.quantity;
  const dataBearing = out.filter(l => l.dataBearing);
  return {
    lines: out, units: out.reduce((a, l) => a + l.quantity, 0), byDisposition,
    dataBearing: dataBearing.reduce((a, l) => a + l.quantity, 0), awaitingSanitisation: dataBearing.filter(l => !l.sanitisation?.certificateNo),
    removed: out.reduce((a, l) => a + l.qty.used, 0), returned: out.reduce((a, l) => a + l.qty.returned, 0),
  };
}

/* ------------------------------------------------------------------ retired equipment: defaults */
/** Equipment categories that store data or configuration (disks, flash, startup config): sanitise before they leave. */
export const DATA_BEARING_CATEGORIES: readonly string[] = ['Server', 'Storage', 'GPU-Node', 'Switch', 'Router', 'Firewall'];
export const isDataBearing = (d: Pick<T.Device, 'category'> | undefined) => !!d?.category && DATA_BEARING_CATEGORIES.includes(d.category);
/** Years after commissioning when removed equipment is no longer worth keeping as stock. */
export const KEEP_YEARS = 5;
/**
 * The planned disposition of a removed device: faulty units go back to the vendor (RMA),
 * disposal work disposes, migration redeploys, other removals keep the unit as stock unless it is
 * past end of life or older than KEEP_YEARS (then it is disposed).
 */
export function defaultDisposition(workType: string | undefined, d: Pick<T.Device, 'status' | 'commissionedDate' | 'lifecycleState'> | undefined, opts: { nowMs?: number; eolDate?: string } = {}): T.RetiredDisposition {
  if (d?.status === 'Faulty') return 'Return to vendor (RMA)';
  if (workType === 'Disposal') return 'Dispose';
  if (workType === 'Migration') return 'Redeploy';
  const nowMs = opts.nowMs ?? Date.now();
  const old = !!d?.commissionedDate && nowMs - new Date(d.commissionedDate).getTime() > KEEP_YEARS * 365 * 864e5;
  const eol = !!opts.eolDate && new Date(opts.eolDate).getTime() < nowMs;
  return old || eol || d?.lifecycleState === 'Retired' || d?.lifecycleState === 'Disposed' ? 'Dispose' : 'Return to stock';
}
export const DISPOSITION_TONE: Record<T.RetiredDisposition, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = { 'Return to stock': 'info', Redeploy: 'success', 'Return to vendor (RMA)': 'warning', Dispose: 'neutral' };

/* ------------------------------------------------------------------ change level: one-glance flags */
export interface ChangeMaterialFlags {
  /** Incoming kit not at the site yet (readiness Not ready / Partly ready / Late). */
  kitNotAtSite: boolean;
  /** The platform says some items are short (availability Short). */
  short: boolean;
  /** Data-bearing removed units without a sanitisation certificate. */
  awaitingSanitisation: number;
  /** Lines added or changed after the change was approved. */
  changedAfterApproval: number;
}
/** Material flags for a change or work order (lines from `linesOfChange` / `linesOfWorkOrder`); all advisory. Use `kitNotAtSite` as the overview's `kitShort` predicate. */
export function changeMaterialFlags(lines: T.MaterialLine[], nowMs = Date.now()): ChangeMaterialFlags {
  const r = readinessOf(lines, nowMs).state;
  return {
    kitNotAtSite: r === 'Not ready' || r === 'Partly ready' || r === 'Late',
    short: availabilityOf(lines).state === 'Short',
    awaitingSanitisation: retiredOf(lines).awaitingSanitisation.length,
    changedAfterApproval: lines.filter(l => isLive(l) && l.changedAfterApproval).length,
  };
}
