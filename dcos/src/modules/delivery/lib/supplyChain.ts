/**
 * Supply chain connector — how DCOS talks to the supply chain platform.
 *
 * The platform owns the catalogue, stock, warehouses, receiving, kitting, transport to site
 * and returns/RMA handling. DCOS only sends requests (kit, return, RMA, reservation) and can
 * cancel them; the platform's answers and progress come back as events, which the material
 * actions apply to the request and its material lines (`materialOps.simulateSupplyProgress`
 * stands in for that event feed in the prototype).
 *
 * The prototype uses `mockSupplyChain`, which answers deterministically (no network, no
 * randomness) so the seed, the scripts and the app agree. A real connector implements the
 * same calls against the platform's API and registers itself with `setSupplyChainConnector`.
 *
 * Availability (`checkAvailability`) is a question, not a hold: the answer says where each item
 * can come from today. A hold is a 'Reservation' request (`sendRequest`).
 */
import type * as T from '../../../mock/data/types';

/** What DCOS sends to the platform for one request. */
export interface SupplyRequestDraft {
  /** DCOS id of the request (SR-…), echoed back on the platform's events. */
  srId: string;
  kind: T.SupplyRequest['kind'];
  dataCenterId?: string; deliverTo?: string; needBy?: string;
  workOrderId?: string; projectId?: string;
  lines: { materialLineId: string; partNumber: string; scpRef?: string; quantity: number; serials?: string[] }[];
  vendorId?: string; serials?: string[]; reason?: string;
  sentAt: string; sentBy: string;
}
/** The platform's immediate answer to a request. */
export interface SupplyRequestAck {
  /** Reference of the request in the platform. */
  scpRef: string;
  status: T.SupplyRequest['status'];
  /** When the platform expects to deliver (kits) or collect (returns). */
  eta?: string;
  note?: string;
}

/** One item DCOS asks the platform about: where can `quantity` come from for this site? */
export interface AvailabilityQuery {
  materialId: string; partNumber: string; quantity: number;
  /** The site the items are needed at (undefined: no site, only the depot answers). */
  dataCenterId?: string; needBy?: string;
  /** The material line asking (its own holds are not counted as someone else's). */
  materialLineId?: string;
  /** Units already received or held at the site for this line (counted in `atSite`). */
  held?: number;
  /** The line's own purchase order line, counted first in `onOrder`. */
  poLineId?: string;
}
/** The platform's answer for one item (stored on the line as `MaterialAvailability` with `checkedAt`). */
export type AvailabilityAnswer = Omit<T.MaterialAvailability, 'checkedAt'>;
/**
 * What DCOS mirrors from the platform and the ERP. The mock connector answers from it; a real
 * connector asks the platform and ignores it.
 */
export interface StockMirror {
  asOf: string;
  materials: T.Material[]; devices: T.Device[];
  purchaseOrders: T.PurchaseOrder[]; purchaseOrderLines: T.PurchaseOrderLine[];
  /** Live material lines: their units (deviceIds) and reserved quantities are not free for others. */
  materialLines: T.MaterialLine[];
  capacityReservations?: T.CapacityReservation[];
}

export interface SupplyChainConnector {
  /** Name shown on screens and in the audit trail. */
  readonly name: string;
  /** Send a request to the platform. Progress (accepted, kitted, delivered, completed) arrives later as events. */
  sendRequest(req: SupplyRequestDraft): SupplyRequestAck;
  /** Ask the platform to cancel an open request. */
  cancelRequest(scpRef: string, reason: string): { ok: boolean; note?: string };
  /**
   * Where each item can come from: free stock in the site's store, free stock at the central
   * depot (and the transfer time), open purchase orders, and what is still short. One answer per
   * item, in order; atSite + atDepot + onOrder + shortfall always covers the quantity.
   */
  checkAvailability(items: AvailabilityQuery[], mirror?: StockMirror): AvailabilityAnswer[];
}

const KIND_CODE: Record<T.SupplyRequest['kind'], string> = { Reservation: 'RSV', Kit: 'KIT', Return: 'RTN', RMA: 'RMA' };
const DAY = 864e5;

/** Deterministic mock of the platform: every request is accepted for processing ("Sent"), kits are due a day before need-by. */
export function mockSupplyChain(): SupplyChainConnector {
  return {
    name: 'Supply chain platform (prototype)',
    sendRequest(req) {
      const n = req.srId.replace(/\D/g, '').padStart(5, '0');
      const sent = new Date(req.sentAt).getTime();
      const due = req.needBy ? Math.max(sent + DAY, new Date(req.needBy).getTime() - DAY) : sent + (req.kind === 'Kit' ? 3 : 5) * DAY;
      return {
        scpRef: `SCP-${KIND_CODE[req.kind]}-${n}`, status: 'Sent', eta: new Date(due).toISOString(),
        note: req.kind === 'Kit' ? `Kit of ${req.lines.length} line${req.lines.length === 1 ? '' : 's'} queued at the site store` : req.kind === 'RMA' ? 'RMA case opened with the vendor' : req.kind === 'Return' ? 'Collection booked' : 'Stock reserved',
      };
    },
    cancelRequest(scpRef) { return { ok: true, note: `${scpRef} cancelled in the platform` }; },
    checkAvailability(items, mirror) { return items.map(it => mockAvailability(it, mirror)); },
  };
}

/* ------------------------------------------------------------------ mock stock (deterministic) */
const h32 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const iso = (ms: number) => new Date(ms).toISOString();
/** Transfer time from the central depot to a site, in days (edge sites further out). */
export const depotDaysFor = (dataCenterId: string | undefined) => (dataCenterId ? 1 + (h32(`DEPOT>${dataCenterId}`) % 4) : 0);
/**
 * Stock the platform holds of an item that DCOS does not track unit by unit (consumables, and
 * serialised parts without a DCIM model): a deterministic figure per store and part. Cheap parts
 * are stocked in quantity, dear ones in ones and twos; some stores do not stock a part at all.
 */
export function mockStoreStock(store: string, m: Pick<T.Material, 'partNumber' | 'unitCost'>): number {
  const h = h32(`${store}|${m.partNumber}`); const r = h % 100;
  const depot = store === 'DEPOT';
  const base = m.unitCost < 30 ? 120 : m.unitCost < 300 ? 24 : m.unitCost < 2500 ? 6 : m.unitCost < 20000 ? 2 : 0;
  if (r < (depot ? 8 : 16)) return 0;
  const n = r < (depot ? 18 : 40) ? Math.floor(base * 0.25) : base + ((h >>> 8) % (base + 1));
  // The depot holds several sites' worth of cheap parts; dear parts are pooled there in ones and twos too.
  return depot ? n * (m.unitCost < 300 ? 4 : m.unitCost < 2500 ? 2 : 1) : n;
}
const FREE_STATES = ['Staged', 'Received'];
const HOLD_STATES = ['Reserved', 'Committed'];
function mockAvailability(it: AvailabilityQuery, mirror?: StockMirror): AvailabilityAnswer {
  const asOf = new Date(mirror?.asOf ?? new Date().toISOString()).getTime();
  const m = mirror?.materials.find(x => x.id === it.materialId) ?? mirror?.materials.find(x => x.partNumber === it.partNumber);
  const q = Math.max(0, it.quantity);
  const held = Math.min(q, Math.max(0, it.held ?? 0));
  const others = (mirror?.materialLines ?? []).filter(l => l.id !== it.materialLineId && l.status !== 'Cancelled' && l.status !== 'Returned');
  // Bought for the job: the line's own open order line supplies it; free stock is for other work.
  const ownOrder = it.poLineId ? mirror?.purchaseOrderLines.find(l => l.id === it.poLineId) : undefined;
  const boughtForJob = !!ownOrder && ownOrder.status !== 'Received' && ownOrder.status !== 'Cancelled' && ownOrder.quantity > ownOrder.receivedQty;
  let siteFree: number, depotFree: number;
  if (boughtForJob) { siteFree = 0; depotFree = 0; }
  else if (m?.assetModelId && mirror) {
    // Serialised units with a DCIM model: count the free Device rows (not racked, staged or received, not held).
    // The line's own units are counted in `held`, other lines' units are theirs.
    const taken = new Set((mirror.materialLines ?? []).filter(l => l.id === it.materialLineId || (l.status !== 'Cancelled' && l.status !== 'Returned')).flatMap(l => l.deviceIds ?? []));
    const holds = new Set((mirror.capacityReservations ?? []).filter(h => h.resourceType === 'Asset' && HOLD_STATES.includes(h.state)).map(h => h.resourceId));
    const free = mirror.devices.filter(d => d.assetModelId === m.assetModelId && !d.isDeleted && !d.rackId && FREE_STATES.includes(d.lifecycleState ?? '') && d.status !== 'Faulty' && !d.plannerPlanId && !String(d.notes ?? '').startsWith('Reserved for') && !taken.has(d.id) && !holds.has(d.id));
    siteFree = it.dataCenterId ? free.filter(d => d.dataCenterId === it.dataCenterId).length : 0;
    depotFree = free.filter(d => !d.dataCenterId).length;
  } else {
    // Stock by quantity, less what other open lines at the same store have reserved.
    const reservedAt = (dc: string | undefined) => others.filter(l => l.materialId === (m?.id ?? it.materialId) && l.dataCenterId === dc && l.direction === 'In' && (l.reservedQty ?? 0) > 0 && !['Delivered to site', 'Issued', 'Installed', 'Consumed'].includes(l.status)).reduce((a, l) => a + (l.reservedQty ?? 0), 0);
    const item = m ?? { partNumber: it.partNumber, unitCost: 100 };
    siteFree = it.dataCenterId ? Math.max(0, mockStoreStock(it.dataCenterId, item) - reservedAt(it.dataCenterId)) : 0;
    depotFree = mockStoreStock('DEPOT', item);
  }
  const atSite = held + siteFree;
  const atDepot = depotFree;
  // Open purchase orders for the item: the line's own order line first, then others the platform can allocate.
  const ordered = new Set((mirror?.purchaseOrders ?? []).filter(p => p.status === 'Ordered').map(p => p.id));
  const open = (mirror?.purchaseOrderLines ?? []).filter(l => l.materialId === (m?.id ?? it.materialId) && (l.status === 'Open' || l.status === 'Partially received') && ordered.has(l.poId))
    .sort((a, b) => Number(b.id === it.poLineId) - Number(a.id === it.poLineId) || (a.eta ?? '').localeCompare(b.eta ?? '') || a.id.localeCompare(b.id));
  let onOrder = 0; let onOrderEta: string | undefined;
  for (const l of open) {
    // The line's own order counts in full; other orders only for what the stores cannot cover.
    const want = l.id === it.poLineId ? q - held - onOrder : q - atSite - atDepot - onOrder; if (want <= 0) continue;
    const take = Math.min(want, l.quantity - l.receivedQty); if (take <= 0) continue;
    onOrder += take; if (l.eta && (!onOrderEta || l.eta > onOrderEta)) onOrderEta = l.eta;
  }
  const shortfall = Math.max(0, q - atSite - atDepot - onOrder);
  const depotDays = depotDaysFor(it.dataCenterId);
  const bestSource: AvailabilityAnswer['bestSource'] = atSite >= q ? 'Site store' : atSite + atDepot >= q ? 'Depot transfer' : shortfall === 0 ? 'On order' : 'Purchase needed';
  const etaMs = onOrderEta ? Math.max(new Date(onOrderEta).getTime(), asOf + 2 * DAY) : undefined;
  const readyBy = bestSource === 'Site store' ? iso(asOf)
    : bestSource === 'Depot transfer' ? iso(asOf + depotDays * DAY)
    : bestSource === 'On order' ? (etaMs !== undefined ? iso(Math.max(etaMs, atDepot ? asOf + depotDays * DAY : asOf)) : undefined)
    : m?.leadWeeks ? iso(asOf + m.leadWeeks * 7 * DAY) : undefined;
  return { atSite, atDepot, depotDays: it.dataCenterId ? depotDays : undefined, onOrder, onOrderEta: onOrder > 0 ? onOrderEta : undefined, shortfall, bestSource, readyBy };
}

let current: SupplyChainConnector = mockSupplyChain();
/** The connector in use (the mock until a real one is registered). */
export const supplyChainConnector = (): SupplyChainConnector => current;
/** Register the connector to use (a real platform client later; tests may pass their own). */
export function setSupplyChainConnector(c: SupplyChainConnector): void { current = c; }
