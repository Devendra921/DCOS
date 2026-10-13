/* Pure material helpers for the work order and change screens (labels, tones, warnings, request
   progress and the raise forms' extra items). Readiness is advisory: nothing here blocks. */
import type * as T from '../../../../mock/data/types';
import { reached, type AvailabilityView, type ReadinessView, type RetiredView } from '../../lib/materialRules';
import type { MaterialOps } from '../../lib/materialOps';

export const READINESS_LABEL: Record<ReadinessView['state'], string> = {
  'Not needed': 'No kit needed', Ready: 'Kit at the site', 'Partly ready': 'Kit partly at the site', 'Not ready': 'Kit not at the site', Late: 'Kit late',
};

/** True when the kit is needed and not all of it is at the site. */
export const kitNotReady = (r: ReadinessView) => r.state !== 'Ready' && r.state !== 'Not needed';

/** The text of the start-of-work confirmation when the kit is not at the site (undefined when it is). */
export function kitStartWarning(r: ReadinessView): string | undefined {
  if (!kitNotReady(r)) return undefined;
  return `${r.reasons.join('; ')}. You can start anyway; record what was actually used when the work is done.`;
}

/* ------------------------------------------------------------------ supply requests */
export const SR_TONE: Record<T.SupplyRequest['status'], 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  Sent: 'info', Accepted: 'info', 'In progress': 'info', Delivered: 'success', Completed: 'success', Rejected: 'error', Cancelled: 'neutral',
};
/** What each platform status means for a request of this kind. */
export function srStatusLabel(kind: T.SupplyRequest['kind'], s: T.SupplyRequest['status']): string {
  if (kind === 'Kit') return ({ 'In progress': 'Kitted', Delivered: 'Delivered to site' } as Partial<Record<typeof s, string>>)[s] ?? s;
  if (kind === 'Return') return ({ 'In progress': 'Collected', Delivered: 'Collected', Completed: 'Back in stores' } as Partial<Record<typeof s, string>>)[s] ?? s;
  if (kind === 'RMA') return ({ 'In progress': 'Collected', Delivered: 'Collected', Completed: 'Accepted by the vendor' } as Partial<Record<typeof s, string>>)[s] ?? s;
  return s;
}
export const SR_KIND_LABEL: Record<T.SupplyRequest['kind'], string> = { Reservation: 'Reservation', Kit: 'Kit to site', Return: 'Return to stores', RMA: 'Return to vendor (RMA)' };
type Step = Partial<Record<T.SupplyRequest['status'], T.SupplyRequest['status']>>;
/** A kit stops at Delivered: the technician's "Confirm kit received" completes it. Returns complete when stores or the vendor take them in. */
const NEXT: Record<T.SupplyRequest['kind'], Step> = {
  Kit: { Sent: 'Accepted', Accepted: 'In progress', 'In progress': 'Delivered' },
  Return: { Sent: 'Accepted', Accepted: 'In progress', 'In progress': 'Completed', Delivered: 'Completed' },
  RMA: { Sent: 'Accepted', Accepted: 'In progress', 'In progress': 'Completed', Delivered: 'Completed' },
  Reservation: { Sent: 'Accepted', Accepted: 'Completed' },
};
/** The platform's next status for a request (prototype simulation), if any. */
export const nextSrStatus = (r: T.SupplyRequest) => NEXT[r.kind]?.[r.status];
export const isOpenRequest = (r: T.SupplyRequest) => !['Completed', 'Rejected', 'Cancelled'].includes(r.status);

/* ------------------------------------------------------------------ raise forms */
export interface PickedItem { materialId?: string; quantity: number }
/** Add the picked items to a newly raised work order. Errors are returned, not thrown: the work order stands either way. */
export function addPicked(ops: Pick<MaterialOps, 'addLine'>, workOrderId: string, items: PickedItem[]): { added: number; error?: string } {
  let added = 0;
  try { for (const x of items) if (x.materialId && x.quantity > 0) { ops.addLine(workOrderId, { materialId: x.materialId, quantity: x.quantity }); added++; } return { added }; } catch (e) { return { added, error: (e as Error).message }; }
}
/** The note under the raise forms' materials list. */
export const DEFAULT_KIT_NOTE = 'The materials planned for the project step, the standard template\'s kit or the default kit for this kind of work are added automatically. Add anything else the work needs here.';

/* ------------------------------------------------------------------ change-level materials: required, available, retired */
export const DISPOSITIONS: T.RetiredDisposition[] = ['Return to stock', 'Redeploy', 'Return to vendor (RMA)', 'Dispose'];
export const DISPOSITION_TONE: Record<T.RetiredDisposition | 'Not decided', 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  'Return to stock': 'info', Redeploy: 'success', 'Return to vendor (RMA)': 'warning', Dispose: 'neutral', 'Not decided': 'warning',
};
export const SANITISATION_METHODS: NonNullable<T.MaterialLine['sanitisation']>['method'][] = ['Wipe (NIST 800-88 purge)', 'Crypto erase', 'Degauss', 'Shred'];
export const SOURCE_TONE: Record<T.MaterialAvailability['bestSource'], 'success' | 'warning' | 'error' | 'info'> = {
  'Site store': 'success', 'Depot transfer': 'info', 'On order': 'warning', 'Purchase needed': 'error',
};

/** Estimated material cost of the incoming lines: catalogue unit cost × quantity. */
export function estimatedCost(lines: T.MaterialLine[], materials: Map<string, T.Material>): { total: number; priced: number; unpriced: number } {
  let total = 0, priced = 0, unpriced = 0;
  for (const l of lines) {
    if (l.direction !== 'In' || l.status === 'Cancelled') continue;
    const c = materials.get(l.materialId)?.unitCost;
    if (c === undefined || !Number.isFinite(c)) { unpriced++; continue; }
    total += c * l.quantity; priced++;
  }
  return { total, priced, unpriced };
}

/** A line's quantity can still be changed: the work order is not finished and the line is not used, returned or cancelled. */
export const lineEditable = (l: T.MaterialLine, woOpen: boolean) => woOpen && !['Installed', 'Consumed', 'Returned', 'Cancelled'].includes(l.status);

/** The figures behind a line's availability answer, e.g. "site 4 · depot 10 (2 days) · on order 6". */
export function availabilityFigures(a: T.MaterialAvailability): string {
  return [`site ${a.atSite}`, `depot ${a.atDepot}${a.depotDays ? ` (${a.depotDays} day${a.depotDays === 1 ? '' : 's'})` : ''}`, a.onOrder ? `on order ${a.onOrder}` : ''].filter(Boolean).join(' · ');
}

/** Where a removed item stands: to be removed, removed, back in stores, with the vendor, disposed. */
export function retiredStatus(l: T.MaterialLine, requests: T.SupplyRequest[], cert?: Pick<T.DisposalCertificate, 'certId' | 'status'>): { label: string; tone: 'success' | 'warning' | 'error' | 'neutral' | 'info'; sub?: string } {
  if (l.status === 'Cancelled') return { label: 'Cancelled', tone: 'neutral' };
  if (cert) return { label: cert.status === 'Issued' ? 'Disposed' : 'For disposal', tone: cert.status === 'Issued' ? 'success' : 'info', sub: `certificate ${cert.certId} · ${cert.status.toLowerCase()}` };
  if (l.status !== 'Returned' || !l.qty.used) return { label: 'To be removed', tone: 'neutral' };
  const mine = requests.filter(r => r.materialLineIds.includes(l.id));
  const rma = mine.find(r => r.kind === 'RMA'), back = mine.find(r => r.kind === 'Return');
  const parts = [`${l.qty.used} removed`, l.qty.returned ? `${l.qty.returned} going back` : '', l.qty.faulty ? `${l.qty.faulty} faulty` : ''].filter(Boolean).join(' · ');
  if (back?.status === 'Completed') return { label: l.disposition === 'Dispose' ? 'Collected for disposal' : 'Back in stores', tone: 'success', sub: parts };
  if (rma) return { label: rma.status === 'Completed' ? 'Accepted by the vendor' : 'With the vendor (RMA)', tone: rma.status === 'Completed' ? 'success' : 'info', sub: parts };
  if (back) return { label: 'Return sent', tone: 'info', sub: parts };
  return { label: 'Removed', tone: 'info', sub: `${parts} · return not sent yet` };
}

/**
 * The material warnings for a change or work order, in plain words (advisory: nothing blocks).
 * `open` is false once the work is finished, when only the retired items still matter.
 */
export function materialWarnings(x: { kit: ReadinessView; availability: AvailabilityView; retired: RetiredView; lines: T.MaterialLine[]; open: boolean }): string[] {
  const out: string[] = [];
  if (x.open) {
    if (x.availability.short.length) out.push(`${x.availability.short.length} item${x.availability.short.length === 1 ? '' : 's'} short at the supply chain platform`);
    else if (x.availability.state === 'On order') out.push('some items are still on order');
    if (kitNotReady(x.kit)) out.push(READINESS_LABEL[x.kit.state].toLowerCase());
  }
  if (x.retired.awaitingSanitisation.length) out.push(`${x.retired.awaitingSanitisation.length} data-bearing item${x.retired.awaitingSanitisation.length === 1 ? '' : 's'} awaiting sanitisation`);
  if (x.open && x.retired.byDisposition['Not decided']) out.push(`disposition not decided for ${x.retired.byDisposition['Not decided']} removed unit${x.retired.byDisposition['Not decided'] === 1 ? '' : 's'}`);
  return out;
}

/** "3 return to stock · 1 RMA" for the removed units, by disposition. */
export function dispositionSummary(r: RetiredView): string {
  const short: Record<string, string> = { 'Return to stock': 'to stock', Redeploy: 'redeploy', 'Return to vendor (RMA)': 'RMA', Dispose: 'dispose', 'Not decided': 'not decided' };
  return Object.entries(r.byDisposition).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${short[k]}`).join(' · ');
}

/* ------------------------------------------------------------------ returns (as returnParts sends them) */
export interface BackRow { line: T.MaterialLine; qty: number; why: string }
/** What goes back after the work: unused and removed items to stores, faulty consumables for disposal, faulty serialised items to the vendor (RMA). */
export function toReturn(lines: T.MaterialLine[]): { stores: BackRow[]; rma: BackRow[] } {
  const stores: BackRow[] = [], rma: BackRow[] = [];
  for (const l of lines) {
    if (l.direction === 'Out') {
      if (l.status === 'Returned' && l.qty.returned > 0) stores.push({ line: l, qty: l.qty.returned, why: l.disposition ? `Removed from the estate: ${l.disposition.toLowerCase()}` : 'Removed from the estate' });
      if (l.qty.faulty > 0 && l.kind === 'Serialised') rma.push({ line: l, qty: l.qty.faulty, why: 'Removed, faulty: back to the vendor' });
      continue;
    }
    if (!['Delivered to site', 'Issued', 'Installed', 'Consumed', 'Returned'].includes(l.status)) continue;
    const base = reached(l, 'Issued') || l.status === 'Returned' ? l.quantity : l.qty.delivered;
    const unused = l.qty.returned + Math.max(0, base - l.qty.used - l.qty.faulty - l.qty.returned);
    if (unused > 0) stores.push({ line: l, qty: unused, why: 'Not used' });
    if (l.qty.faulty > 0) (l.kind === 'Serialised' ? rma : stores).push({ line: l, qty: l.qty.faulty, why: l.kind === 'Serialised' ? 'Faulty: back to the vendor' : 'Faulty: for disposal' });
  }
  return { stores, rma };
}

/* ------------------------------------------------------------------ raise forms: required and retired */
export interface RaiseMaterials { items: PickedItem[]; retire: string[]; disposition?: T.RetiredDisposition }
/**
 * After raising: add the picked items and the equipment to retire to the new work order, then ask the
 * supply chain platform where the items can come from. Errors are returned, not thrown: the work order
 * stands either way.
 */
export function applyRaiseMaterials(ops: Pick<MaterialOps, 'addLine' | 'addRetired' | 'checkAvailability' | 'linesForWorkOrder' | 'setDisposition'>, workOrderId: string, m: RaiseMaterials): { added: number; retired: number; checked: boolean; errors: string[] } {
  const errors: string[] = [];
  const a = addPicked(ops, workOrderId, m.items);
  if (a.error) errors.push(`extra materials: ${a.error}`);
  let retired = 0;
  // Removal work already takes its devices as lines coming out: add only the others.
  const outs = ops.linesForWorkOrder(workOrderId).filter(l => l.direction === 'Out');
  const have = new Set(outs.flatMap(l => l.deviceIds ?? []));
  const retire = m.retire.filter(id => !have.has(id));
  if (m.disposition) {
    try { for (const l of outs) if (!l.disposition && (l.deviceIds ?? []).some(id => m.retire.includes(id))) { ops.setDisposition(l.id, m.disposition); retired++; } } catch (e) { errors.push(`disposition: ${(e as Error).message}`); }
  }
  if (retire.length) { try { retired = ops.addRetired(workOrderId, retire, m.disposition).length; } catch (e) { errors.push(`equipment to retire: ${(e as Error).message}`); } }
  let checked = false;
  try { ops.checkAvailability(workOrderId); checked = true; } catch (e) { errors.push(`availability check: ${(e as Error).message}`); }
  return { added: a.added, retired, checked, errors };
}

/* ------------------------------------------------------------------ equipment to retire */
/** Devices in the estate that can be removed (not stock still on order or in stores, not retired or disposed already). */
export const removable = (d: Pick<T.Device, 'lifecycleState'>) => !d.lifecycleState || !['Ordered', 'Received', 'Retired', 'Disposed'].includes(d.lifecycleState);
/** Picker label: name, serial, model, rack and U. */
export function deviceLabel(d: Pick<T.Device, 'name' | 'serial' | 'model' | 'position' | 'rackId'>, rackName?: string): string {
  return [d.name, d.serial ? `SN ${d.serial}` : '', d.model ?? '', rackName ? `${rackName}${d.position ? ` U${d.position}` : ''}` : ''].filter(Boolean).join(' · ');
}
/** Device options for the retire pickers: removable devices at the site, in the given racks when `rackIds` is not empty. */
export function retireOptions(devices: T.Device[], racks: Map<string, Pick<T.Rack, 'name'>>, siteId: string | undefined, rackIds: string[], exclude: Set<string> = new Set()): { value: string; label: string }[] {
  const rs = new Set(rackIds);
  return devices
    .filter(d => (!siteId || d.dataCenterId === siteId) && (!rs.size || (!!d.rackId && rs.has(d.rackId))) && removable(d) && !exclude.has(d.id))
    .sort((a, b) => (racks.get(a.rackId ?? '')?.name ?? '').localeCompare(racks.get(b.rackId ?? '')?.name ?? '') || (b.position ?? 0) - (a.position ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 3000)
    .map(d => ({ value: d.id, label: deviceLabel(d, d.rackId ? racks.get(d.rackId)?.name ?? d.rackId : undefined) }));
}
