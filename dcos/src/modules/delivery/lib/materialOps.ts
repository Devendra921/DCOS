/**
 * Material actions over a MockDB — the DCOS side of the material flow.
 *
 *   plan (BOM per project step) → ordered (ERP PO line) → received (ERP goods receipt)
 *   → kit requested (DCOS → supply chain platform) → kitted → delivered to site
 *   → issued to the work order → installed (serialised: Device updated) / consumed
 *   → returned (unused or faulty; faulty serialised items go back by RMA)
 *
 * Removed equipment is a line with direction 'Out': removed → returned to stores, RMA or disposal.
 * Every action appends a MaterialEvent and updates the line's status and quantities. Nothing
 * here blocks the chain: readiness is advisory (materialRules.readinessOf).
 *
 * The supply chain platform and the ERP are reached through `SupplyChainConnector`
 * (supplyChain.ts). The prototype uses the mock connector, which answers requests and can
 * simulate the platform's and the ERP's events (`simulate*`).
 *
 * Project step lines and work order lines: a work order takes its step's lines by setting
 * workOrderId/changeRequestId on the step line itself (split in two when it takes only part of
 * the quantity), so a step's lines always add up to what the step needs. Kit lines (standard
 * template or default kit) are new lines carrying the work order's project step.
 */
import type * as T from '../../../mock/data/types';
import type { MockDB } from '../../../mock/db/store';
import type { WorkOrderType } from '../../../mock/data/enums';
import type { AuditFn } from './chainOps';
import { PROCESS_BY_KEY } from '../../../workorders/model';
import { driveTask, fireBoundaryIn, modelParsed, withdrawTaskIn } from '../../workorders/lib/engineCore';
import { defaultDisposition, isDataBearing, isLive, reached, statusRank } from './materialRules';
import { mainPath, planWorkForStep, processKeyFor, projectFacts } from './projectProcess';
import { CATALOGUE_ITEMS, DEFAULT_KITS, NO_MATERIAL_WORK, PER_RACK_QTY, REMOVAL_WORK, inUnits, REMOVED_LOT_PART, TEMPLATE_RECIPES, kitQty, mirrorFor, ownerWorkType, resolveMaterial, stepForCategory, stepWorkTypes } from './materialCatalogue';
import { supplyChainConnector, type AvailabilityAnswer, type StockMirror, type SupplyChainConnector } from './supplyChain';

/** One recorded use on a work order line (the "Record materials" step). */
export interface UsageEntry {
  materialLineId: string;
  /** Serialised: serials actually installed (or removed, for 'Out' lines). */
  serials?: string[];
  /** Consumables: quantity used. Serialised: defaults to serials.length. */
  used?: number;
  /** Not needed, to go back to stores. */
  returned?: number;
  /** Found faulty (on arrival or at install); serialised faulty items get an RMA. */
  faulty?: number; faultySerials?: string[]; faultReason?: string;
}
export interface ExtraLineInput { materialId: string; quantity: number; direction?: 'In' | 'Out'; source?: T.MaterialLine['source']; notes?: string; deviceIds?: string[] }

export interface MaterialOps {
  actor: string;
  // ── planning ─────────────────────────────────────────────────────────────
  /** Split a project's BOM into material lines per project step (idempotent; keeps lines already taken by work orders). */
  planProjectMaterials(projectId: string): T.MaterialLine[];
  /** Give a newly raised work order its lines: the step's untaken lines for this work type, the standard template's kit, or the work type's default kit. Removal work gets 'Out' lines for its devices. Idempotent. */
  linesForWorkOrder(workOrderId: string): T.MaterialLine[];
  /** Add or remove a line on a work order by hand (planner or technician). */
  addLine(workOrderId: string, input: ExtraLineInput): T.MaterialLine;
  cancelLine(materialLineId: string, reason: string): void;
  // ── supply chain requests (no change request: these don't touch the live estate) ──
  /** Ask the supply chain platform to kit the work order's lines and deliver them to the site. */
  requestKit(workOrderId: string, opts?: { deliverTo?: string; needBy?: string }): T.SupplyRequest | undefined;
  /** Technician confirms the kit arrived (the "Confirm kit received" step); quantities short or faulty can be noted. */
  confirmKitReceived(workOrderId: string, notes?: { materialLineId: string; short?: number; faulty?: number }[]): void;
  // ── execution (inside the work order, covered by its change) ─────────────
  /** Issue the delivered kit to the crew at the start of work. */
  issueKit(workOrderId: string): void;
  /** Record what was installed, consumed, removed, returned and found faulty. Serialised installs update their Device (Installed, rack, installedByWorkOrderId); removals mark the Device Retired with removedByWorkOrderId. */
  recordUsage(workOrderId: string, entries: UsageEntry[]): void;
  /** Send unused items back to stores and faulty serialised items to the vendor (RMA). Returns the requests sent. */
  returnParts(workOrderId: string): T.SupplyRequest[];
  // ── mirrored events (prototype: simulate what the ERP and the platform would send) ──
  /** ERP goods receipt against a PO (all open lines, or the given quantities); moves the planned lines to Received and the project's "Receive…" step on when its lines are in. */
  simulateGoodsReceipt(poId: string, lines?: { poLineId: string; quantity: number }[]): T.GoodsReceipt | undefined;
  /** Supplier date change on a PO line; a date past need-by fires the project's "Delivery delayed" boundary. */
  simulateEtaChange(poLineId: string, eta: string): void;
  /** Platform progress on a request: Accepted → In progress (kitted) → Delivered (at site) → Completed. */
  simulateSupplyProgress(supplyRequestId: string, status: T.SupplyRequest['status'], note?: string): void;
  // ── additions used by the chain and by delivery ──────────────────────────
  /** A work order was cancelled or its change rejected: lines taken from the project step go back to it, kit lines are cancelled, open kit requests are cancelled and anything already at the site goes back to stores. */
  releaseWorkOrder(workOrderId: string, reason: string): void;
  /** Complete the project's "Receive…" task when every purchased line of the steps after it is received. Returns true when it moved. */
  completeReceiveIfDone(projectId: string): boolean;
  /** Bill of materials, purchase orders (one per vendor, with lines) and step lines for a project from its template's recipe. Returns the BOM id (undefined when the project already has one). */
  generateProjectProcurement(projectId: string): string | undefined;
  /** Mirror the ERP lines of a project's purchase orders that have none (BOM lines spread over the BOM's orders). */
  ensurePoLines(bomId: string): T.PurchaseOrderLine[];
  /** The catalogue item for a part (mirrored from the platform's catalogue when DCOS does not have it yet). */
  mirrorMaterial(item: { partNumber: string; description: string; manufacturer: string; unitCost: number; category?: string }): T.Material;
  // ── change level: required, available, retired (a change's lines are its work order's lines) ──
  /** Ask the platform where each incoming line of the work order can come from (site store, depot, on order) and store the answer on the line. */
  checkAvailability(workOrderId: string): T.MaterialLine[];
  /** Ask the platform to hold stock for the work order's incoming lines (SupplyRequest kind 'Reservation'); sets reservedQty. */
  reserveMaterials(workOrderId: string): T.SupplyRequest | undefined;
  /** Change a line's quantity or note (planner or technician). After approval the line is flagged changedAfterApproval and the change is audited; never blocked. */
  updateLine(materialLineId: string, patch: { quantity?: number; notes?: string }): void;
  /** Removed equipment: set the planned disposition and whether it stores data. */
  setDisposition(materialLineId: string, disposition: T.RetiredDisposition, opts?: { dataBearing?: boolean }): void;
  /** Record the sanitisation of a data-bearing removed item (method, certificate number, witness). */
  recordSanitisation(materialLineId: string, s: NonNullable<T.MaterialLine['sanitisation']>): void;
  /** Add removed equipment to a work order: the given devices become 'Out' lines (default disposition from the work type). */
  addRetired(workOrderId: string, deviceIds: string[], disposition?: T.RetiredDisposition): T.MaterialLine[];
}

export interface MaterialOpsOptions {
  /** Clock for timestamps (the seed replays history with it); defaults to the real time. */
  now?: () => string;
  /** Move the BPMN processes with the records (default true; the seed places its processes itself). */
  drive?: boolean;
  /** Connector to the supply chain platform (defaults to the registered one, the mock in the prototype). */
  connector?: SupplyChainConnector;
  /** At most this many Device rows per goods-receipt line (the seed keeps big orders light); serials are always recorded. */
  maxReceiptDevices?: number;
}

/** The "Receive…" user task of each process that has one (project processes and the planner's P02 hall fit-out). */
export const RECEIVE_TASKS: Record<string, string> = {
  'project-greenfield-build': 'receive_plant', 'project-hall-fitout': 'receive', 'project-rack-deployment': 'receive', 'project-capacity-expansion': 'receive',
  'project-mep-plant': 'receive', 'project-server-refresh': 'receive', 'project-rack-replacement': 'receive', 'hall-fitout': 'receive_stage',
};
/** The "Delivery delayed" boundary on a process's receive task. */
export const delayBoundaryOf = (processKey: string): string | undefined => {
  const recv = RECEIVE_TASKS[processKey]; const p = PROCESS_BY_KEY[processKey];
  return p?.nodes.find(n => n.id === recv)?.boundaries?.find(b => b.ref === 'delivery-delayed')?.id;
};
/** Change states after approval: material edits are flagged (changedAfterApproval), never blocked. */
export const APPROVED_STATES: string[] = ['Approved', 'Scheduled', 'InProgress'];
const P10_TASKS = ['assign', 'accept', 'confirm_kit', 'start_work', 'complete', 'record_materials', 'return_parts', 'verify'];
const DAY = 864e5;

/** Small deterministic hash (serials, references). */
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36).toUpperCase().padStart(7, '0'); };
const seqCache = new WeakMap<MockDB, Map<string, number>>();

/** The material actions over a MockDB. `useMaterialActions()` (materialHooks.ts) wraps these for screens. */
export function createMaterialOps(db: MockDB, actor: string, audit?: AuditFn, options: MaterialOpsOptions = {}): MaterialOps {
  const now = options.now ?? (() => new Date().toISOString());
  const drive = options.drive !== false;
  const connector = options.connector ?? supplyChainConnector();
  const say: AuditFn = audit ?? (() => {});
  const rows = <X>(entity: string) => (db.getAllRaw(entity) as unknown as (X & { isDeleted?: boolean })[]).filter(r => !r.isDeleted) as X[];
  const get = <X>(entity: string, id: string | undefined) => (id ? db.getById(entity, id) as unknown as X | undefined : undefined);
  const base = () => { const t = now(); return { customerId: 'CUST-001', isDeleted: false, createdAt: t, updatedAt: t, createdBy: actor, createdById: 'me' }; };
  const upd = (entity: string, id: string, patch: Record<string, unknown>) => { db.update(entity, id, { ...patch, updatedAt: now(), updatedBy: actor }); };
  const seq = (entity: string, prefix: string) => {
    let m = seqCache.get(db); if (!m) { m = new Map(); seqCache.set(db, m); }
    const key = `${entity}:${prefix}`; let n = m.get(key);
    const make = (k: number) => `${prefix}-${String(k).padStart(4, '0')}`;
    if (n === undefined || db.getById(entity, make(n + 1))) {
      const re = new RegExp(`^${prefix}-(\\d+)$`);
      n = (db.getAllRaw(entity) as { id: string }[]).reduce((mx, r) => { const x = re.exec(r.id); return x ? Math.max(mx, Number(x[1])) : mx; }, 0);
    }
    m.set(key, n + 1); return make(n + 1);
  };
  const material = (id: string | undefined) => get<T.Material>('materials', id);
  const byPart = (part: string) => rows<T.Material>('materials').find(m => m.partNumber === part);
  const line = (id: string) => get<T.MaterialLine>('materialLines', id);
  const wo = (id: string) => get<T.WorkOrder>('workOrders', id);
  const woLines = (id: string) => rows<T.MaterialLine>('materialLines').filter(l => l.workOrderId === id && isLive(l));
  const setLine = (l: T.MaterialLine, patch: Partial<T.MaterialLine>) => { upd('materialLines', l.id, patch as Record<string, unknown>); return { ...l, ...patch } as T.MaterialLine; };
  const event = (l: T.MaterialLine, kind: T.MaterialEvent['kind'], quantity: number, extra: Partial<T.MaterialEvent> = {}) => {
    const id = seq('materialEvents', 'ME');
    db.create('materialEvents', { id, meId: id, ...base(), at: now(), kind, source: 'DCOS', by: actor, materialLineId: l.id, materialId: l.materialId, quantity, projectId: l.projectId, workOrderId: l.workOrderId, changeRequestId: l.changeRequestId, ...extra } as unknown as Record<string, unknown>);
  };
  const newLine = (m: T.Material, data: Partial<T.MaterialLine> & Pick<T.MaterialLine, 'quantity' | 'direction' | 'source'>): T.MaterialLine => {
    const id = seq('materialLines', 'ML');
    const l = { id, mlId: id, ...base(), materialId: m.id, description: m.description, kind: m.kind, uom: m.uom, status: 'Planned', qty: { received: 0, kitted: 0, delivered: 0, used: 0, returned: 0, faulty: 0 }, ...data } as T.MaterialLine;
    db.create('materialLines', l as unknown as Record<string, unknown>);
    return l;
  };
  const ensureMaterial = (item: { partNumber: string; description: string; manufacturer: string; unitCost: number; category?: string }): T.Material => {
    const hit = byPart(item.partNumber); if (hit) return hit;
    const spec = CATALOGUE_ITEMS.find(c => c.partNumber === item.partNumber) ?? mirrorFor(item);
    const id = seq('materials', 'MAT');
    const am = spec.model ? rows<T.AssetModel>('assetModels').find(a => a.model === spec.model) : undefined;
    const m = { id, matId: id, ...base(), partNumber: spec.partNumber, description: spec.description, manufacturer: spec.manufacturer, kind: spec.kind, category: spec.category, uom: spec.uom, unitCost: spec.unitCost, leadWeeks: spec.leadWeeks, packSize: spec.packSize, assetModelId: am?.id, scpRef: `SCP-ITM-${hash(spec.partNumber)}` } as T.Material;
    db.create('materials', m as unknown as Record<string, unknown>);
    return m;
  };
  const projectOf = (id: string | undefined) => get<T.Project>('projects', id);
  const dcName = (id: string | undefined) => get<T.DataCenter>('dataCenters', id)?.name;
  const p10Of = (w: T.WorkOrder) => get<T.ProcessInstance>('processInstances', w.processInstanceId) ?? rows<T.ProcessInstance>('processInstances').find(i => i.recordType === 'workOrder' && i.recordId === w.id && i.definitionKey === 'work-order');
  /** Complete a P10 material task; `from` lists the tasks that may be caught up before it. */
  const driveP10 = (w: T.WorkOrder, el: string, vars: Record<string, unknown>, from: string[] = []) => {
    if (!drive) return; const pi = p10Of(w); if (pi?.state !== 'active') return;
    driveTask(db, modelParsed('work-order'), pi.id, el, vars, actor, { catchUp: from.length > 0, never: P10_TASKS.filter(t => t !== el && !from.includes(t)) });
  };
  const markHasMaterials = (w: T.WorkOrder) => {
    if (!drive) return; const pi = p10Of(w);
    if (pi && pi.state === 'active' && !pi.variables?.hasMaterials) db.update('processInstances', pi.id, { variables: { ...pi.variables, hasMaterials: true } });
  };
  /** The vendor that supplies a catalogue item: its manufacturer when we buy from it, else the integrator who supplies general parts. */
  const vendorFor = (m: T.Material | undefined) => { const vs = rows<T.Vendor>('vendors').filter(v => v.status === 'Active'); const mf = (m?.manufacturer ?? '').toLowerCase().split(' ')[0]; return (mf ? vs.find(v => v.name.toLowerCase().startsWith(mf)) ?? vs.find(v => v.name.toLowerCase().includes(mf)) : undefined) ?? vs.find(v => /netbuild/i.test(v.name)) ?? vs.find(v => v.category === 'Services'); };
  const stockStatus = (l: T.MaterialLine): T.MaterialLine['status'] => (l.qty.received >= l.quantity && l.poLineId ? 'Received' : l.poLineId && poOrdered(l.poLineId) ? 'Ordered' : l.source === 'Stock' || l.source === 'Reuse' ? 'Planned' : 'Planned');
  const poOrdered = (poLineId: string) => { const pol = get<T.PurchaseOrderLine>('purchaseOrderLines', poLineId); const po = get<T.PurchaseOrder>('purchaseOrders', pol?.poId); return !!po && (po.status === 'Ordered' || po.status === 'Received'); };
  const reservedDevices = () => new Set(rows<T.MaterialLine>('materialLines').filter(l => isLive(l) && l.status !== 'Returned').flatMap(l => l.deviceIds ?? []));

  // ── change level ─────────────────────────────────────────────────────────
  /** Incoming lines of a work order still to be supplied (not at the site yet, not used or returned). */
  const openIncoming = (woId: string) => woLines(woId).filter(l => l.direction === 'In' && l.status !== 'Returned' && !reached(l, 'Delivered to site'));
  /** Units already held at the site for a line (received on its order, or named units at the site). */
  const heldFor = (l: T.MaterialLine) => {
    const w = wo(l.workOrderId ?? ''); const dc = l.dataCenterId ?? w?.dataCenterId;
    const units = (l.deviceIds ?? []).filter(id => get<T.Device>('devices', id)?.dataCenterId === dc).length;
    return Math.min(l.quantity, Math.max(l.qty.received, units));
  };
  const stockMirror = (asOf: string): StockMirror => ({
    asOf, materials: rows<T.Material>('materials'), devices: rows<T.Device>('devices'), purchaseOrders: rows<T.PurchaseOrder>('purchaseOrders'),
    purchaseOrderLines: rows<T.PurchaseOrderLine>('purchaseOrderLines'), materialLines: rows<T.MaterialLine>('materialLines').filter(isLive), capacityReservations: rows<T.CapacityReservation>('capacityReservations'),
  });
  const availabilityNote = (a: AvailabilityAnswer, q: number) => {
    const parts = [`site store ${a.atSite}`, `depot ${a.atDepot}${a.depotDays ? ` (${a.depotDays} day${a.depotDays === 1 ? '' : 's'})` : ''}`];
    if (a.onOrder) parts.push(`on order ${a.onOrder}${a.onOrderEta ? ` due ${a.onOrderEta.slice(0, 10)}` : ''}`);
    return `${a.bestSource} for ${q}: ${parts.join(', ')}${a.shortfall ? `; ${a.shortfall} short` : ''}`;
  };
  /** The change covering a line (its own changeRequestId, else its work order's). */
  const changeOf = (l: Pick<T.MaterialLine, 'changeRequestId' | 'workOrderId'>) => get<T.ChangeRequest>('changeRequests', l.changeRequestId ?? wo(l.workOrderId ?? '')?.changeRequestId);
  /** The change is approved (approved, scheduled or being implemented): edits are flagged to the approvers, never blocked. */
  // Only board-approved (normal and emergency) changes: a standard change is approved when raised, so its material edits are part of normal planning.
  const afterApproval = (l: Pick<T.MaterialLine, 'changeRequestId' | 'workOrderId'>) => { const c = changeOf(l); return !!c && c.changeClass !== 'Standard' && APPROVED_STATES.includes(c.status); };
  const flagChange = (l: Pick<T.MaterialLine, 'changeRequestId' | 'workOrderId'>, what: string) => {
    const cr = changeOf(l); if (!cr) return;
    say('ChangeRequest', cr.id, 'materials changed after approval', `${what} (by ${actor}, after the change was approved; for the approvers' attention, not re-approval)`);
  };
  /** Devices of a line (its units, falling back to what it removed). */
  const devicesOf = (l: T.MaterialLine) => [...new Set([...(l.installedDeviceIds ?? []), ...(l.deviceIds ?? [])])].map(id => get<T.Device>('devices', id)).filter((d): d is T.Device => !!d);
  const lineDataBearing = (l: T.MaterialLine) => { const ds = devicesOf(l); if (ds.length) return ds.some(isDataBearing); const m = material(l.materialId); return m?.category === 'Compute' || m?.category === 'Network'; };
  const dispositionFor = (w: T.WorkOrder, d: T.Device) => defaultDisposition(w.type, d, { nowMs: new Date(now()).getTime(), eolDate: get<T.AssetModel>('assetModels', d.assetModelId)?.eolDate });
  /** 'Out' lines for devices a work order takes out: one per catalogue item and disposition. */
  const outLines = (w: T.WorkOrder, ds: T.Device[], disposition?: T.RetiredDisposition): T.MaterialLine[] => {
    const common = { workOrderId: w.id, changeRequestId: w.changeRequestId, projectId: w.projectId, projectStepId: w.projectStepId, programId: w.programId, dataCenterId: w.dataCenterId, needBy: w.plannedStart };
    const groups = new Map<string, { m: T.Material; disp: T.RetiredDisposition; ds: T.Device[] }>();
    for (const d of ds) {
      const m = rows<T.Material>('materials').find(x => x.assetModelId && x.assetModelId === d.assetModelId) ?? byPart(REMOVED_LOT_PART); if (!m) continue;
      const disp = disposition ?? dispositionFor(w, d);
      const k = `${m.id}|${disp}`; const g = groups.get(k) ?? { m, disp, ds: [] }; g.ds.push(d); groups.set(k, g);
    }
    const out: T.MaterialLine[] = [];
    for (const g of groups.values()) {
      const dataBearing = g.ds.some(isDataBearing);
      const notes = g.disp === 'Dispose' ? 'For certified disposal' : g.disp === 'Redeploy' ? 'To staging for redeployment' : g.disp === 'Return to vendor (RMA)' ? 'Faulty: back to the vendor' : 'Removed to stores';
      const l = newLine(g.m, { ...common, direction: 'Out', quantity: g.ds.length, source: 'Reuse', deviceIds: g.ds.map(d => d.id), notes, disposition: g.disp, dataBearing });
      event(l, 'Planned', l.quantity, { note: `${g.ds.length} item${g.ds.length === 1 ? '' : 's'} to take out: ${g.disp}${dataBearing ? ' (data-bearing)' : ''}` });
      out.push(l);
    }
    return out;
  };

  /** A removed line's disposition (lines from before dispositions: disposal work disposes, the rest go back to stock). */
  const dispositionOfLine = (l: T.MaterialLine, w?: T.WorkOrder): T.RetiredDisposition => l.disposition ?? (w?.type === 'Disposal' ? 'Dispose' : 'Return to stock');
  /** The certified disposal company: a recycling / ITAD vendor when the vendor list has one. */
  const disposalVendor = () => rows<T.Vendor>('vendors').find(v => /recycl|itad|iron mountain|sims|disposal/i.test(v.name))?.name ?? 'Iron Mountain ITAD';
  /**
   * The platform collected removed equipment for disposal: the units are Disposed and a disposal
   * certificate is issued (one per work order, extended when more of its lines are disposed).
   * Data-bearing units without a sanitisation certificate are warned about, never held back.
   */
  const completeDisposal = (sr: T.SupplyRequest, ls: T.MaterialLine[], w?: T.WorkOrder) => {
    const fresh = ls.map(l => line(l.id) ?? l);
    const unsafe = fresh.filter(l => l.dataBearing && !l.sanitisation?.certificateNo);
    if (unsafe.length) say(w ? 'WorkOrder' : 'SupplyRequest', w?.id ?? sr.id, 'sanitisation warning', `${unsafe.reduce((a, l) => a + l.quantity, 0)} data-bearing unit(s) disposed without a sanitisation certificate on record (${unsafe.map(l => l.id).join(', ')}): the disposal certificate notes it`);
    const siblings = w ? rows<T.MaterialLine>('materialLines').filter(x => x.workOrderId === w.id && x.disposalCertificateId) : [];
    let cert = siblings.map(x => get<T.DisposalCertificate>('disposalCertificates', x.disposalCertificateId)).find((c): c is T.DisposalCertificate => !!c);
    const items: T.DisposalCertificate['items'] = [];
    for (const l of fresh) {
      const ds = devicesOf(l);
      if (ds.length) for (const d of ds) items.push({ deviceId: d.id, serial: d.serial, assetTag: d.assetTag, model: d.model, drives: isDataBearing(d) ? (d.category === 'Storage' ? 24 : d.category === 'GPU-Node' ? 8 : d.category === 'Server' ? 4 : 1) : 0 });
      else items.push({ model: l.description, drives: l.dataBearing ? 1 : 0 });
    }
    const methods = new Set(fresh.map(l => l.sanitisation?.method));
    const method: T.DisposalCertificate['method'] = methods.has('Shred') ? 'Destroy (shred)' : methods.has('Degauss') ? 'Degauss' : fresh.some(l => l.dataBearing) ? 'Purge (NIST 800-88)' : 'Recycle (no data)';
    const collectedAt = sr.history.find(h => h.status === 'In progress' || h.status === 'Accepted')?.at ?? now();
    const refs = [...new Set(fresh.map(l => l.sanitisation?.certificateNo).filter((x): x is string => !!x))];
    const note = `${w ? `Work order ${w.woId}` : sr.srId}: ${items.length} unit${items.length === 1 ? '' : 's'} collected on ${sr.scpRef}${unsafe.length ? `; ${unsafe.length} line(s) without a sanitisation certificate on record` : ''}`;
    if (cert) {
      const have = new Set(cert.items.map(i => i.deviceId ?? i.serial));
      const add = items.filter(i => !have.has(i.deviceId ?? i.serial));
      upd('disposalCertificates', cert.id, { items: [...cert.items, ...add], status: 'Issued', issuedAt: now(), reference: cert.reference ?? refs[0], notes: note });
    } else {
      const id = seq('disposalCertificates', 'CERT');
      cert = { id, certId: id, ...base(), dataCenterId: sr.dataCenterId ?? w?.dataCenterId, vendorName: disposalVendor(), method, items, collectedAt, issuedAt: now(), status: 'Issued', reference: refs[0] ?? `DSP-${hash(id + sr.id)}`, plannerPlanId: w?.plannerPlanId, notes: note } as T.DisposalCertificate;
      db.create('disposalCertificates', cert as unknown as Record<string, unknown>);
    }
    for (const l of fresh) {
      for (const d of devicesOf(l)) upd('devices', d.id, { lifecycleState: 'Disposed', status: 'Inactive', rackId: undefined, position: undefined });
      const next = setLine(l, { disposalCertificateId: cert.id });
      event(next, 'Disposed', l.quantity, { source: 'Supply chain', supplyRequestId: sr.id, note: `Disposal certificate ${cert.certId} (${cert.vendorName})${l.dataBearing && !l.sanitisation?.certificateNo ? '; no sanitisation certificate on record' : ''}` });
    }
    say(w ? 'WorkOrder' : 'SupplyRequest', w?.id ?? sr.id, 'disposal certified', `${cert.certId}: ${items.length} unit${items.length === 1 ? '' : 's'} disposed by ${cert.vendorName}`);
  };

  // ── devices ──────────────────────────────────────────────────────────────
  const newDevice = (m: T.Material, serial: string, dataCenterId: string | undefined, lifecycle: T.Device['lifecycleState'], extra: Partial<T.Device> = {}): T.Device | undefined => {
    const am = get<T.AssetModel>('assetModels', m.assetModelId); if (!am) return undefined;
    const tmpl = rows<T.Device>('devices').find(d => d.assetModelId === am.id);
    const id = seq('devices', 'DEVM');
    const d = { id, devcId: id, ...base(), name: `${am.model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${serial.slice(-5).toLowerCase()}`, deviceTypeId: tmpl?.deviceTypeId ?? '', dataCenterId, status: 'Inactive', serial, assetTag: id, assetModelId: am.id, manufacturer: am.manufacturer, model: am.model, category: am.category, heightU: am.heightU, powerDrawW: am.typicalPowerW, ratedThermalW: am.typicalPowerW, weightKg: am.weightKg, lifecycleState: lifecycle, deviceRoleId: tmpl?.deviceRoleId, platformId: tmpl?.platformId, ownerTeam: tmpl?.ownerTeam, ...extra } as T.Device;
    db.create('devices', d as unknown as Record<string, unknown>);
    return d;
  };
  const serialFor = (m: T.Material, seed: string) => `${m.partNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()}${hash(seed)}`;
  /** First free position for a device of `heightU` in a rack (undefined when full). */
  const freePosition = (rackId: string, heightU: number, ignore?: string): number | undefined => {
    const rack = get<T.Rack>('racks', rackId); if (!rack) return undefined;
    const used = new Set<number>();
    for (const d of rows<T.Device>('devices')) if (d.rackId === rackId && d.position && d.id !== ignore) for (let u = 0; u < (d.heightU ?? 1); u++) used.add(d.position + u);
    for (let p = 1; p + heightU - 1 <= rack.heightU; p++) { let ok = true; for (let u = 0; u < heightU; u++) if (used.has(p + u)) { ok = false; break; } if (ok) return p; }
    return undefined;
  };

  // ── project steps ────────────────────────────────────────────────────────
  const stepNeedBy = (project: T.Project, stepId: string | undefined): string | undefined => {
    const key = processKeyFor(project.template); const p = key ? PROCESS_BY_KEY[key] : undefined; if (!p || !stepId) return project.plannedStart;
    const path = mainPath(p); const i = Math.max(0, path.indexOf(stepId));
    const s = new Date(project.plannedStart).getTime(), e = new Date(project.plannedEnd).getTime();
    return new Date(s + ((e - s) * i) / Math.max(1, path.length) - 7 * DAY).toISOString();
  };
  const bomsOf = (project: T.Project) => {
    const shared = new Set(rows<T.BOMLine>('bomLines').filter(l => l.projectId === project.id).map(l => l.bomId));
    return rows<T.BOM>('boms').filter(b => b.projectId === project.id || shared.has(b.id) || (!b.projectId && !!project.plannerPlanId && b.plannerPlanId === project.plannerPlanId));
  };
  /** A BOM line belongs to this project (lines of a programme BOM may be split over its projects). */
  const mine = (l: T.BOMLine, projectId: string) => !l.projectId || l.projectId === projectId;
  const poLinesOfPo = (poId: string) => rows<T.PurchaseOrderLine>('purchaseOrderLines').filter(l => l.poId === poId).sort((a, b) => a.lineNo - b.lineNo);
  const running = (recordType: T.ProcessRecordType, recordId: string) => rows<T.ProcessInstance>('processInstances').filter(i => i.recordType === recordType && i.recordId === recordId && i.state === 'active').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

  const ops: MaterialOps = {
    actor,
    mirrorMaterial: item => ensureMaterial(item),

    checkAvailability(workOrderId) {
      const w = wo(workOrderId); if (!w) return [];
      const lines = openIncoming(w.id);
      if (!lines.length) return [];
      const asOf = now();
      const answers = connector.checkAvailability(lines.map(l => ({ materialId: l.materialId, partNumber: material(l.materialId)?.partNumber ?? '', quantity: l.quantity, dataCenterId: l.dataCenterId ?? w.dataCenterId, needBy: l.needBy ?? w.plannedStart, materialLineId: l.id, held: heldFor(l), poLineId: l.poLineId })), stockMirror(asOf));
      const out = lines.map((l, k) => {
        const a = answers[k]; if (!a) return l;
        const next = setLine(l, { availability: { checkedAt: asOf, ...a } });
        event(next, 'Availability checked', l.quantity, { source: 'Supply chain', note: availabilityNote(a, l.quantity) });
        return next;
      });
      const short = out.filter(l => l.availability && (l.availability.shortfall > 0 || l.availability.bestSource === 'Purchase needed'));
      say('WorkOrder', w.id, 'availability checked', `${out.length} line${out.length === 1 ? '' : 's'} checked with the supply chain platform${short.length ? `; ${short.length} short` : ''}`);
      return out;
    },

    reserveMaterials(workOrderId) {
      const w = wo(workOrderId); if (!w) return undefined;
      let lines = openIncoming(w.id).filter(l => (l.reservedQty ?? 0) < l.quantity);
      if (!lines.length) return undefined;
      if (lines.some(l => !l.availability)) { const fresh = new Map(ops.checkAvailability(w.id).map(l => [l.id, l])); lines = lines.map(l => fresh.get(l.id) ?? l); }
      // Serialised stock lines hold named units (site first, then the depot); the rest hold a quantity.
      const held = reservedDevices();
      const devs = rows<T.Device>('devices');
      const plan = lines.map(l => {
        const a = l.availability;
        const can = a ? Math.min(l.quantity, a.atSite + a.atDepot + a.onOrder) : l.quantity;
        const m = material(l.materialId);
        let deviceIds = l.deviceIds;
        if (m?.assetModelId && l.source === 'Stock' && (deviceIds?.length ?? 0) < can) {
          const pick = devs.filter(d => d.assetModelId === m.assetModelId && !d.rackId && (d.lifecycleState === 'Staged' || d.lifecycleState === 'Received') && d.status !== 'Faulty' && !d.plannerPlanId && !held.has(d.id) && (!d.dataCenterId || d.dataCenterId === w.dataCenterId))
            .sort((x, y) => Number(y.dataCenterId === w.dataCenterId) - Number(x.dataCenterId === w.dataCenterId) || x.id.localeCompare(y.id)).slice(0, can - (deviceIds?.length ?? 0));
          pick.forEach(d => held.add(d.id));
          if (pick.length) deviceIds = [...(deviceIds ?? []), ...pick.map(d => d.id)];
        }
        return { l, qty: Math.max(l.reservedQty ?? 0, can), deviceIds };
      }).filter(x => x.qty > 0);
      if (!plan.length) return undefined;
      const id = seq('supplyRequests', 'SR');
      const deliverTo = `Held at the ${dcName(w.dataCenterId) ?? 'site'} store for ${w.woId}`;
      const needBy = w.plannedStart;
      const ack = connector.sendRequest({ srId: id, kind: 'Reservation', dataCenterId: w.dataCenterId, deliverTo, needBy, workOrderId: w.id, projectId: w.projectId, sentAt: now(), sentBy: actor, lines: plan.map(x => ({ materialLineId: x.l.id, partNumber: material(x.l.materialId)?.partNumber ?? '', scpRef: material(x.l.materialId)?.scpRef, quantity: x.qty, serials: x.deviceIds?.map(d => get<T.Device>('devices', d)?.serial ?? d) })) });
      const sr = { id, srId: id, ...base(), kind: 'Reservation', status: ack.status, dataCenterId: w.dataCenterId, projectId: w.projectId, workOrderId: w.id, changeRequestId: w.changeRequestId, materialLineIds: plan.map(x => x.l.id), deliverTo, needBy, eta: ack.eta, scpRef: ack.scpRef, sentAt: now(), sentBy: actor, history: [{ at: now(), status: ack.status, note: ack.note }] } as T.SupplyRequest;
      db.create('supplyRequests', sr as unknown as Record<string, unknown>);
      for (const x of plan) {
        const next = setLine(x.l, { reservedQty: x.qty, deviceIds: x.deviceIds, supplyRequestId: statusRank(x.l.status) < statusRank('Kit requested') ? id : x.l.supplyRequestId });
        event(next, 'Reserved', x.qty, { supplyRequestId: id, note: `${ack.scpRef}: ${x.qty} of ${x.l.quantity} held${x.qty < x.l.quantity ? ' (the rest is short)' : ''}` });
      }
      const part = plan.filter(x => x.qty < x.l.quantity).length;
      say('WorkOrder', w.id, 'materials reserved', `${plan.length} line${plan.length === 1 ? '' : 's'} held by the supply chain platform (${ack.scpRef})${part ? `; ${part} only in part` : ''}`);
      return sr;
    },

    updateLine(materialLineId, patch) {
      const l = line(materialLineId); if (!l || !isLive(l)) throw new Error(`Material line ${materialLineId} not found`);
      const q = patch.quantity;
      if (q !== undefined && (!Number.isFinite(q) || q <= 0)) throw new Error('Quantity must be more than zero (cancel the line to remove it)');
      if (q !== undefined && q !== l.quantity && (l.status === 'Returned' || isUsedStatus(l.status))) throw new Error('The line is already used or returned: record usage instead');
      const late = afterApproval(l);
      const changes: string[] = [];
      let next = l;
      if (q !== undefined && q !== l.quantity) {
        const from = l.quantity;
        const delta = q - from;
        // A line taken from a project step trades quantity with the step's untaken line, so the step's lines still add up to its bill of materials.
        const twin = l.bomLineId ? rows<T.MaterialLine>('materialLines').find(x => x.id !== l.id && !x.workOrderId && isLive(x) && x.bomLineId === l.bomLineId && x.poLineId === l.poLineId && x.projectStepId === l.projectStepId) : undefined;
        let extra = 0;
        if (l.bomLineId && delta < 0) {
          const back = -delta; const recv = Math.max(0, l.qty.received - q);
          if (twin) setLine(twin, { quantity: twin.quantity + back, qty: { ...twin.qty, received: twin.qty.received + recv } });
          else { const m = material(l.materialId); if (m) { const t = newLine(m, { direction: 'In', quantity: back, source: l.source, projectId: l.projectId, projectStepId: l.projectStepId, programId: l.programId, dataCenterId: l.dataCenterId, bomLineId: l.bomLineId, poLineId: l.poLineId, needBy: l.needBy, eta: l.eta, status: recv >= back ? 'Received' : statusRank(l.status) >= statusRank('Ordered') && l.poLineId ? 'Ordered' : 'Planned', qty: { received: recv, kitted: 0, delivered: 0, used: 0, returned: 0, faulty: 0 } }); event(t, 'Planned', back, { note: `Given back to the project step by ${l.workOrderId ?? 'a work order'}` }); } }
        } else if (l.bomLineId && delta > 0) {
          const take = Math.min(delta, twin?.quantity ?? 0);
          if (twin && take > 0) {
            const recv = Math.min(take, twin.qty.received);
            if (take >= twin.quantity) { setLine(twin, { status: 'Cancelled', notes: `Taken in full by ${l.workOrderId}` }); event(twin, 'Cancelled', twin.quantity, { note: `Taken in full by ${l.workOrderId}` }); }
            else setLine(twin, { quantity: twin.quantity - take, qty: { ...twin.qty, received: twin.qty.received - recv } });
            next = { ...next, qty: { ...next.qty, received: next.qty.received + recv } };
          }
          extra = delta - take;
        }
        const own = extra > 0 ? q - extra : q;
        const cap = (n: number) => Math.min(n, own);
        next = setLine(next, { quantity: own, qty: { ...next.qty, received: cap(next.qty.received), kitted: cap(next.qty.kitted), delivered: cap(next.qty.delivered) }, reservedQty: next.reservedQty !== undefined ? Math.min(next.reservedQty, own) : undefined, status: next.status === 'Received' && next.qty.received < own ? (next.poLineId ? 'Ordered' : 'Planned') : next.status === 'Planned' && next.poLineId && next.qty.received >= own && next.qty.received > 0 ? 'Received' : next.status });
        event(next, 'Quantity changed', own, { note: `${from} → ${own}${late ? ' after the change was approved' : ''}${reached(l, 'Kit requested') ? '; the kit request covers the old quantity' : ''}` });
        changes.push(`quantity ${from} → ${q}`);
        if (extra > 0) {
          // Beyond the bill of materials: the extra comes from stock on a line of its own.
          const m = material(l.materialId)!;
          const x = newLine(m, { direction: 'In', quantity: extra, source: 'Stock', workOrderId: l.workOrderId, changeRequestId: l.changeRequestId, projectId: l.projectId, projectStepId: l.projectStepId, programId: l.programId, dataCenterId: l.dataCenterId, needBy: l.needBy, notes: `Above the bill of materials (${l.id} raised to ${q})`, changedAfterApproval: late || undefined });
          event(x, 'Planned', extra, { note: `Above the bill of materials: ${l.id} raised to ${q}` });
        }
      }
      if (patch.notes !== undefined && patch.notes !== (l.notes ?? '')) changes.push('note');
      if (!changes.length) return;
      const stamp = late ? `Changed after approval by ${actor} on ${now().slice(0, 10)}: ${changes.join(', ')}` : undefined;
      const notes = [patch.notes ?? next.notes, stamp].filter(Boolean).join(' · ') || undefined;
      next = setLine(next, { notes, changedAfterApproval: late || next.changedAfterApproval });
      if (!(q !== undefined && q !== l.quantity)) event(next, 'Quantity changed', next.quantity, { note: `Note changed${late ? ' after the change was approved' : ''}` });
      if (l.workOrderId) say('WorkOrder', l.workOrderId, 'material changed', `${l.description}: ${changes.join(', ')}`);
      if (late) flagChange(l, `${l.description}: ${changes.join(', ')}`);
    },

    setDisposition(materialLineId, disposition, opts = {}) {
      const l = line(materialLineId); if (!l || !isLive(l)) throw new Error(`Material line ${materialLineId} not found`);
      if (l.direction !== 'Out') throw new Error('Only removed equipment (out lines) has a disposition');
      const dataBearing = opts.dataBearing ?? l.dataBearing ?? lineDataBearing(l);
      if (l.disposition === disposition && l.dataBearing === dataBearing) return;
      const late = afterApproval(l);
      const next = setLine(l, { disposition, dataBearing, changedAfterApproval: late || l.changedAfterApproval });
      const sent = l.status === 'Returned' && !!l.supplyRequestId;
      event(next, 'Disposition set', l.quantity, { note: `${l.disposition ? `${l.disposition} → ` : ''}${disposition}${dataBearing ? ' (data-bearing)' : ''}${sent ? '; a return is already booked, the platform is told separately' : ''}` });
      if (l.workOrderId) say('WorkOrder', l.workOrderId, 'disposition set', `${l.description} × ${l.quantity}: ${disposition}${dataBearing ? ' (data-bearing: sanitise before it leaves)' : ''}`);
      if (late) flagChange(l, `${l.description}: disposition ${l.disposition ?? 'not decided'} → ${disposition}`);
    },

    recordSanitisation(materialLineId, s) {
      const l = line(materialLineId); if (!l || !isLive(l)) throw new Error(`Material line ${materialLineId} not found`);
      if (l.direction !== 'Out') throw new Error('Only removed equipment (out lines) is sanitised');
      const rec = { ...s, at: s.at ?? now(), by: s.by ?? actor };
      const next = setLine(l, { sanitisation: rec, dataBearing: true });
      event(next, 'Sanitised', l.quantity, { note: `${rec.method}${rec.certificateNo ? `, certificate ${rec.certificateNo}` : ' (no certificate number yet)'}${rec.witness ? `, witnessed by ${rec.witness}` : ''}` });
      // A disposal certificate already issued for the line carries the sanitisation reference.
      const cert = get<T.DisposalCertificate>('disposalCertificates', l.disposalCertificateId);
      if (cert && rec.certificateNo && !cert.reference) upd('disposalCertificates', cert.id, { reference: rec.certificateNo });
      if (l.workOrderId) say('WorkOrder', l.workOrderId, 'sanitised', `${l.description} × ${l.quantity}: ${rec.method}${rec.certificateNo ? ` (${rec.certificateNo})` : ''}`);
    },

    addRetired(workOrderId, deviceIds, disposition) {
      const w = wo(workOrderId); if (!w) throw new Error(`Work order ${workOrderId} not found`);
      const taken = reservedDevices();
      const ds = [...new Set(deviceIds)].map(id => get<T.Device>('devices', id)).filter((d): d is T.Device => !!d && !taken.has(d.id));
      if (!ds.length) return [];
      const out = outLines(w, ds, disposition);
      const late = afterApproval({ changeRequestId: w.changeRequestId, workOrderId: w.id });
      if (late) for (const l of out) setLine(l, { changedAfterApproval: true });
      upd('workOrders', w.id, { deviceIds: [...new Set([...(w.deviceIds ?? []), ...ds.map(d => d.id)])] });
      markHasMaterials(w);
      say('WorkOrder', w.id, 'retired equipment added', `${ds.length} device${ds.length === 1 ? '' : 's'} to take out (${[...new Set(out.map(l => l.disposition))].join(', ')})`);
      if (late && out[0]) flagChange(out[0], `${ds.length} device${ds.length === 1 ? '' : 's'} added to take out`);
      return late ? out.map(l => ({ ...l, changedAfterApproval: true })) : out;
    },

    ensurePoLines(bomId) {
      const bom = get<T.BOM>('boms', bomId); if (!bom) return [];
      const pos = rows<T.PurchaseOrder>('purchaseOrders').filter(p => p.bomId === bomId).sort((a, b) => a.id.localeCompare(b.id));
      const blines = rows<T.BOMLine>('bomLines').filter(l => l.bomId === bomId).sort((a, b) => a.lineNo - b.lineNo);
      if (!pos.length || !blines.length || pos.some(p => poLinesOfPo(p.id).length)) return [];
      const project = projectOf(bom.projectId);
      const out: T.PurchaseOrderLine[] = [];
      blines.forEach((bl, i) => {
        const po = pos[i % pos.length];
        const lineNo = poLinesOfPo(po.id).length + 1;
        const m = material(bl.materialId);
        const needBy = bl.needBy ?? po.needBy ?? (project ? stepNeedBy(project, bl.projectStepId) : undefined);
        const ordered = po.status === 'Ordered' || po.status === 'Received';
        const id = seq('purchaseOrderLines', 'POL');
        const pol = { id, polId: id, ...base(), poId: po.id, lineNo, materialId: m?.id ?? bl.materialId ?? '', bomLineId: bl.id, quantity: bl.quantity, unitCost: bl.unitCost, needBy, eta: ordered && needBy ? new Date(new Date(needBy).getTime() - 3 * DAY).toISOString() : undefined, receivedQty: 0, status: 'Open', erpRef: `ERP-${po.poId}-${lineNo * 10}` } as T.PurchaseOrderLine;
        db.create('purchaseOrderLines', pol as unknown as Record<string, unknown>);
        out.push(pol);
      });
      return out;
    },

    planProjectMaterials(projectId) {
      const project = projectOf(projectId); if (!project) return [];
      const key = processKeyFor(project.template);
      const created: T.MaterialLine[] = [];
      const fresh: string[] = [];
      for (const bom of bomsOf(project)) {
        if (!bom.projectId) upd('boms', bom.id, { projectId });
        for (const bl of rows<T.BOMLine>('bomLines').filter(l => l.bomId === bom.id && mine(l, projectId))) {
          if (bl.materialId && bl.projectStepId && bl.projectId) continue;
          const m = material(bl.materialId) ?? resolveMaterial(rows<T.Material>('materials'), bl) ?? ensureMaterial({ ...bl, partNumber: bl.partNumber || `ITEM-${hash(bl.description)}` });
          const step = bl.projectStepId ?? stepForCategory(key, m.category);
          // Pieces of a pack-sold item become whole packs, so every record counts the same unit.
          const u = inUnits(m, bl.quantity, bl.unitCost);
          upd('bomLines', bl.id, { materialId: m.id, projectId, projectStepId: step, needBy: bl.needBy ?? stepNeedBy(project, step), quantity: u.quantity, unitCost: u.unitCost });
        }
        fresh.push(...ops.ensurePoLines(bom.id).map(l => l.poId));
        const taken = new Set(rows<T.MaterialLine>('materialLines').filter(l => l.bomLineId && l.status !== 'Cancelled').map(l => l.bomLineId));
        for (const bl of rows<T.BOMLine>('bomLines').filter(l => l.bomId === bom.id && !taken.has(l.id) && l.projectId === projectId)) {
          const m = material(bl.materialId); if (!m) continue;
          const pols = rows<T.PurchaseOrderLine>('purchaseOrderLines').filter(l => l.bomLineId === bl.id && l.status !== 'Cancelled');
          const parts: { quantity: number; pol?: T.PurchaseOrderLine }[] = pols.map(pol => ({ quantity: pol.quantity, pol }));
          const rest = bl.quantity - pols.reduce((a, p) => a + p.quantity, 0);
          if (rest > 0) parts.push({ quantity: rest });
          for (const part of parts) {
            const po = get<T.PurchaseOrder>('purchaseOrders', part.pol?.poId);
            const ordered = !!po && (po.status === 'Ordered' || po.status === 'Received');
            const received = Math.min(part.quantity, part.pol?.receivedQty ?? 0);
            const l = newLine(m, {
              direction: 'In', quantity: part.quantity, source: part.pol ? 'Purchase' : 'Stock', projectId, projectStepId: bl.projectStepId, programId: project.programId, dataCenterId: project.dataCenterId,
              bomLineId: bl.id, poLineId: part.pol?.id, status: received >= part.quantity && received > 0 ? 'Received' : ordered ? 'Ordered' : 'Planned',
              needBy: part.pol?.needBy ?? bl.needBy, eta: part.pol?.eta, qty: { received, kitted: 0, delivered: 0, used: 0, returned: 0, faulty: 0 },
            });
            event(l, 'Planned', l.quantity, { note: `From ${bom.name}, line ${bl.lineNo}` });
            if (ordered && part.pol) event(l, 'Ordered', l.quantity, { source: 'ERP', note: `${po!.poId} line ${part.pol.lineNo}` });
            created.push(l);
          }
        }
      }
      // ERP orders already received whose lines were only now mirrored: post their receipt.
      for (const poId of [...new Set(fresh)]) if (get<T.PurchaseOrder>('purchaseOrders', poId)?.status === 'Received') ops.simulateGoodsReceipt(poId);
      if (created.length) say('Project', projectId, 'materials planned', `${created.length} material line${created.length === 1 ? '' : 's'} planned across the project's steps`);
      return created;
    },

    linesForWorkOrder(workOrderId) {
      const w = wo(workOrderId); if (!w) return [];
      const existing = woLines(w.id); if (existing.length) return existing;
      if (NO_MATERIAL_WORK.includes(w.type)) return [];
      const project = projectOf(w.projectId);
      const common = { workOrderId: w.id, changeRequestId: w.changeRequestId, projectId: w.projectId, projectStepId: w.projectStepId, programId: w.programId, dataCenterId: w.dataCenterId, needBy: w.plannedStart };
      const out: T.MaterialLine[] = [];
      if (REMOVAL_WORK.includes(w.type)) {
        const taken = reservedDevices();
        const devs = rows<T.Device>('devices');
        let pick = (w.deviceIds ?? []).map(id => devs.find(d => d.id === id)).filter((d): d is T.Device => !!d && !taken.has(d.id));
        if (!pick.length && w.type === 'Disposal') pick = devs.filter(d => d.dataCenterId === w.dataCenterId && d.lifecycleState === 'Retired' && !taken.has(d.id)).slice(0, 10);
        if (!pick.length && w.type === 'DeviceRemoval') pick = devs.filter(d => !!d.rackId && (w.rackIds ?? (w.rackId ? [w.rackId] : [])).includes(d.rackId) && !['Retired', 'Disposed'].includes(d.lifecycleState ?? '') && !taken.has(d.id)).slice(0, 8);
        // One line per catalogue item and planned disposition (faulty units to the vendor, old ones disposed…).
        out.push(...outLines(w, pick));
        if (!out.length) { const m = byPart(REMOVED_LOT_PART); if (m) { const l = newLine(m, { ...common, direction: 'Out', quantity: 1, source: 'Reuse', notes: 'Equipment to be listed at removal', disposition: w.type === 'Disposal' ? 'Dispose' : undefined }); event(l, 'Planned', 1); out.push(l); } }
      } else {
        // 1. the step's untaken lines whose material this work type takes
        if (project && w.projectStepId) {
          const key = processKeyFor(project.template);
          const types = key ? stepWorkTypes(key, w.projectStepId) : [];
          const all = rows<T.MaterialLine>('materialLines');
          const pool = all.filter(l => l.projectId === project.id && l.projectStepId === w.projectStepId && !l.workOrderId && l.direction === 'In' && isLive(l) && l.quantity > 0 && ownerWorkType(material(l.materialId)?.category ?? 'Other', types) === w.type);
          const drafts = key ? planWorkForStep(project, key, w.projectStepId, { start: w.plannedStart ?? now() }).filter(d => d.type === w.type).length : 1;
          for (const sl of pool) {
            const holders = new Set(all.filter(l => l.workOrderId && l.bomLineId === sl.bomLineId && l.poLineId === sl.poLineId && isLive(l) && wo(l.workOrderId)?.type === w.type).map(l => l.workOrderId));
            // The work order takes what its own scope needs: per rack it covers (or its even part when
            // nothing scales by rack); a step with one work order of this type takes it all. The rest
            // stays on the step line, not taken yet.
            const racks = w.rackIds?.length ?? (w.rackId ? 1 : 0);
            const part0 = material(sl.materialId)?.partNumber ?? '';
            const bl = get<T.BOMLine>('bomLines', sl.bomLineId);
            const perRack = PER_RACK_QTY[part0] ?? (bl ? bl.quantity / Math.max(1, projectFacts(project).racks) : undefined);
            const share = Math.min(sl.quantity, drafts <= 1 ? sl.quantity
              : racks > 0 && perRack !== undefined ? Math.max(1, Math.ceil(perRack * racks))
              : Math.ceil(sl.quantity / Math.max(1, drafts - holders.size)));
            if (share >= sl.quantity) { out.push(setLine(sl, { workOrderId: w.id, changeRequestId: w.changeRequestId, needBy: w.plannedStart ?? sl.needBy })); event({ ...sl, workOrderId: w.id, changeRequestId: w.changeRequestId }, 'Planned', sl.quantity, { note: `Taken by ${w.id} from the project step` }); continue; }
            const part = (n: number) => Math.min(share, n);
            const q = sl.qty;
            const moved = { received: part(q.received), kitted: part(q.kitted), delivered: part(q.delivered), used: 0, returned: 0, faulty: 0 };
            const devs = (sl.deviceIds ?? []).slice(0, share);
            setLine(sl, { quantity: sl.quantity - share, qty: { ...q, received: q.received - moved.received, kitted: q.kitted - moved.kitted, delivered: q.delivered - moved.delivered }, deviceIds: (sl.deviceIds ?? []).slice(share) });
            const l = newLine(material(sl.materialId)!, { ...common, direction: 'In', quantity: share, source: sl.source, bomLineId: sl.bomLineId, poLineId: sl.poLineId, status: sl.status === 'Received' && moved.received < share ? 'Ordered' : sl.status, eta: sl.eta, qty: moved, deviceIds: devs.length ? devs : undefined });
            event(l, 'Planned', share, { note: `Split from the project step line ${sl.id} (${share} of ${sl.quantity})` });
            out.push(l);
          }
        }
        // 2. the standard template's kit, else 3. the work type's default kit
        if (!out.length) {
          const tpl = get<T.StandardChangeTemplate>('standardChangeTemplates', w.standardTemplateId);
          const kit = tpl?.kit?.length ? tpl.kit.map(k => ({ m: material(k.materialId), q: k.quantity, why: `Standard template kit (${tpl.name})` }))
            : (DEFAULT_KITS[w.type as WorkOrderType] ?? []).map(r => ({ m: byPart(r.part), q: kitQty(r, w), why: `Default kit for ${w.type}` }));
          for (const k of kit) {
            if (!k.m || k.q <= 0) continue;
            const l = newLine(k.m, { ...common, direction: 'In', quantity: k.q, source: 'Stock' });
            event(l, 'Planned', k.q, { note: k.why }); out.push(l);
          }
        }
      }
      if (out.length) markHasMaterials(w);
      return out;
    },

    addLine(workOrderId, input) {
      const w = wo(workOrderId); const m = material(input.materialId);
      if (!w || !m) throw new Error('Work order or material not found');
      const direction = input.direction ?? 'In';
      const outDevs = direction === 'Out' ? (input.deviceIds ?? []).map(id => get<T.Device>('devices', id)).filter((d): d is T.Device => !!d) : [];
      const outDefaults = direction === 'Out' ? { disposition: outDevs[0] ? dispositionFor(w, outDevs[0]) : w.type === 'Disposal' ? 'Dispose' as const : undefined, dataBearing: outDevs.length ? outDevs.some(isDataBearing) : m.category === 'Compute' || m.category === 'Network' } : {};
      const l = newLine(m, { ...outDefaults, direction, quantity: input.quantity, source: input.source ?? (direction === 'Out' ? 'Reuse' : 'Stock'), workOrderId: w.id, changeRequestId: w.changeRequestId, projectId: w.projectId, projectStepId: w.projectStepId, programId: w.programId, dataCenterId: w.dataCenterId, needBy: w.plannedStart, deviceIds: input.deviceIds, notes: input.notes });
      const late = afterApproval(l);
      event(l, 'Planned', l.quantity, { note: `Added by ${actor}${input.notes ? `: ${input.notes}` : ''}${late ? ' (after the change was approved)' : ''}` });
      markHasMaterials(w);
      say('WorkOrder', w.id, 'material added', `${m.description} × ${input.quantity}${direction === 'Out' ? ' (out)' : ''}`);
      if (!late) return l;
      flagChange(l, `${m.description} × ${input.quantity} added`);
      return setLine(l, { changedAfterApproval: true });
    },

    cancelLine(materialLineId, reason) {
      const l = line(materialLineId); if (!l || !isLive(l)) return;
      // A line the project needs goes back to its step; anything else is cancelled.
      if (l.workOrderId && l.bomLineId && statusRank(l.status) < statusRank('Kit requested')) {
        const twin = rows<T.MaterialLine>('materialLines').find(x => x.id !== l.id && !x.workOrderId && isLive(x) && x.bomLineId === l.bomLineId && x.poLineId === l.poLineId && x.projectStepId === l.projectStepId);
        if (twin) {
          setLine(twin, { quantity: twin.quantity + l.quantity, qty: { ...twin.qty, received: twin.qty.received + l.qty.received }, deviceIds: [...(twin.deviceIds ?? []), ...(l.deviceIds ?? [])] });
          setLine(l, { status: 'Cancelled', notes: `Merged back into ${twin.id}: ${reason}` });
          event(l, 'Cancelled', l.quantity, { note: `Back to the project step (${reason})` });
        } else {
          setLine(l, { workOrderId: undefined, changeRequestId: undefined, supplyRequestId: undefined, reservedQty: undefined, availability: undefined, changedAfterApproval: undefined });
          event({ ...l, workOrderId: undefined, changeRequestId: undefined }, 'Cancelled', l.quantity, { workOrderId: l.workOrderId, note: `Released from ${l.workOrderId} back to the project step (${reason})` });
        }
      } else {
        setLine(l, { status: 'Cancelled', notes: reason });
        event(l, 'Cancelled', l.quantity, { note: reason });
      }
      // Cancel the open request once none of its lines is live.
      const sr = get<T.SupplyRequest>('supplyRequests', l.supplyRequestId);
      if (sr && ['Sent', 'Accepted', 'In progress'].includes(sr.status) && sr.materialLineIds.every(id => { const x = line(id); return !x || !isLive(x) || x.workOrderId !== sr.workOrderId; })) {
        const r = connector.cancelRequest(sr.scpRef, reason);
        upd('supplyRequests', sr.id, { status: 'Cancelled', history: [...sr.history, { at: now(), status: 'Cancelled', note: r.note ?? reason }] });
      }
      if (l.workOrderId) say('WorkOrder', l.workOrderId, 'material removed', `${l.description}: ${reason}`);
    },

    requestKit(workOrderId, opts = {}) {
      const w = wo(workOrderId); if (!w) return undefined;
      const lines = woLines(w.id).filter(l => l.direction === 'In' && statusRank(l.status) < statusRank('Kit requested'));
      if (!lines.length) return undefined;
      const id = seq('supplyRequests', 'SR');
      const deliverTo = opts.deliverTo ?? `${dcName(w.dataCenterId) ?? 'Site'} store, for ${w.woId}`;
      const needBy = opts.needBy ?? w.plannedStart;
      // Serialised stock lines: the platform picks units from stock (Staged or Received, not racked, not held).
      const held = reservedDevices();
      const devs = rows<T.Device>('devices');
      const withDevices = lines.map(l => {
        const m = material(l.materialId);
        if (!m?.assetModelId || l.source !== 'Stock' || (l.deviceIds?.length ?? 0) >= l.quantity) return l;
        const pick = devs.filter(d => d.assetModelId === m.assetModelId && !d.rackId && (d.lifecycleState === 'Staged' || d.lifecycleState === 'Received') && d.status !== 'Faulty' && !held.has(d.id)).sort((a, b) => Number(b.dataCenterId === w.dataCenterId) - Number(a.dataCenterId === w.dataCenterId)).slice(0, l.quantity - (l.deviceIds?.length ?? 0));
        pick.forEach(d => held.add(d.id));
        return pick.length ? { ...l, deviceIds: [...(l.deviceIds ?? []), ...pick.map(d => d.id)] } : l;
      });
      const ack = connector.sendRequest({ srId: id, kind: 'Kit', dataCenterId: w.dataCenterId, deliverTo, needBy, workOrderId: w.id, projectId: w.projectId, sentAt: now(), sentBy: actor, lines: withDevices.map(l => ({ materialLineId: l.id, partNumber: material(l.materialId)?.partNumber ?? '', scpRef: material(l.materialId)?.scpRef, quantity: l.quantity, serials: l.deviceIds?.map(d => get<T.Device>('devices', d)?.serial ?? d) })) });
      const sr = { id, srId: id, ...base(), kind: 'Kit', status: ack.status, dataCenterId: w.dataCenterId, projectId: w.projectId, workOrderId: w.id, changeRequestId: w.changeRequestId, materialLineIds: lines.map(l => l.id), deliverTo, needBy, eta: ack.eta, scpRef: ack.scpRef, sentAt: now(), sentBy: actor, history: [{ at: now(), status: ack.status, note: ack.note }] } as T.SupplyRequest;
      db.create('supplyRequests', sr as unknown as Record<string, unknown>);
      for (const l of withDevices) {
        const next = setLine(l, { status: 'Kit requested', supplyRequestId: id, deviceIds: l.deviceIds });
        event(next, 'Kit requested', l.quantity, { supplyRequestId: id, note: `${ack.scpRef} to ${deliverTo}` });
      }
      // Units the platform held for the work order go into the kit.
      for (const r of rows<T.SupplyRequest>('supplyRequests').filter(x => x.workOrderId === w.id && x.kind === 'Reservation' && ['Sent', 'Accepted', 'In progress'].includes(x.status))) {
        upd('supplyRequests', r.id, { status: 'Completed', history: [...r.history, { at: now(), status: 'Completed', note: `Held stock taken into the kit (${ack.scpRef})` }] });
      }
      say('WorkOrder', w.id, 'kit requested', `${lines.length} line${lines.length === 1 ? '' : 's'} requested from the supply chain platform (${ack.scpRef}), to ${deliverTo}`);
      return sr;
    },

    confirmKitReceived(workOrderId, notes = []) {
      const w = wo(workOrderId); if (!w) return;
      const lines = woLines(w.id).filter(l => l.direction === 'In' && reached(l, 'Kit requested') && statusRank(l.status) < statusRank('Issued'));
      let short = 0, faulty = 0;
      for (const l of lines) {
        const n = notes.find(x => x.materialLineId === l.id);
        const s = Math.min(l.quantity, n?.short ?? 0); const f = Math.min(l.quantity - s, n?.faulty ?? 0);
        short += s; faulty += f;
        const delivered = l.quantity - s;
        const next = setLine(l, { status: 'Delivered to site', qty: { ...l.qty, kitted: Math.max(l.qty.kitted, delivered), delivered, faulty: l.qty.faulty + f } });
        if (l.status !== 'Delivered to site' || s) event(next, 'Delivered to site', delivered, { supplyRequestId: l.supplyRequestId, note: `Receipt confirmed by ${actor}${s ? `; ${s} short` : ''}` });
        if (f) event(next, 'Faulty', f, { note: 'Found faulty on arrival' });
      }
      for (const sr of rows<T.SupplyRequest>('supplyRequests').filter(r => r.workOrderId === w.id && r.kind === 'Kit' && !['Completed', 'Cancelled', 'Rejected'].includes(r.status))) {
        upd('supplyRequests', sr.id, { status: 'Completed', history: [...sr.history, { at: now(), status: 'Completed', note: `Receipt confirmed at the site by ${actor}${short ? `; ${short} short` : ''}${faulty ? `; ${faulty} faulty` : ''}` }] });
      }
      driveP10(w, 'confirm_kit', { acknowledged: true, short, faulty }, ['accept']);
      say('WorkOrder', w.id, 'kit received', `Kit confirmed at the site${short || faulty ? `: ${short} short, ${faulty} faulty` : ''}`);
    },

    issueKit(workOrderId) {
      const w = wo(workOrderId); if (!w) return;
      const lines = woLines(w.id).filter(l => l.direction === 'In' && statusRank(l.status) < statusRank('Issued'));
      const missing = lines.filter(l => !reached(l, 'Delivered to site'));
      for (const l of lines) {
        const next = setLine(l, { status: 'Issued' });
        event(next, 'Issued', l.quantity, { note: reached(l, 'Delivered to site') ? `Issued to ${w.assigneeName || 'the crew'}` : 'Issued before the kit was confirmed at the site' });
      }
      if (missing.length) say('WorkOrder', w.id, 'materials warning', `Work started with ${missing.length} of ${lines.length} material line${lines.length === 1 ? '' : 's'} not confirmed at the site (warning only; work was not blocked)`);
    },

    recordUsage(workOrderId, entries) {
      const w = wo(workOrderId); if (!w) return;
      const rackId = w.rackId ?? w.rackIds?.[0];
      const devices = () => rows<T.Device>('devices');
      let used = 0;
      for (const e of entries) {
        const l = line(e.materialLineId); if (!l || l.workOrderId !== w.id || !isLive(l)) continue;
        const m = material(l.materialId);
        const serials = e.serials ?? [];
        if (l.direction === 'Out') {
          const ds = serials.length ? serials.map(s => devices().find(d => d.serial === s)).filter((d): d is T.Device => !!d) : (l.deviceIds ?? []).map(id => get<T.Device>('devices', id)).filter((d): d is T.Device => !!d);
          // Units to be redeployed go to staging (free for the next job); everything else is retired from the estate.
          const redeploy = l.disposition === 'Redeploy';
          for (const d of ds) {
            upd('devices', d.id, { lifecycleState: redeploy ? 'Staged' : 'Retired', status: 'Inactive', rackId: undefined, position: undefined, face: undefined, removedByWorkOrderId: w.id, materialLineId: l.id, decommissionDate: redeploy ? d.decommissionDate : now() });
            event(l, 'Removed', 1, { deviceId: d.id, serial: d.serial, note: d.rackId ? `From ${get<T.Rack>('racks', d.rackId)?.name ?? d.rackId}${d.position ? ` U${d.position}` : ''}` : undefined });
          }
          const n = e.used ?? (ds.length || l.quantity);
          const f = e.faulty ?? e.faultySerials?.length ?? 0;
          for (const s of e.faultySerials ?? []) { const d = devices().find(x => x.serial === s); event(l, 'Faulty', 1, { serial: s, deviceId: d?.id, note: e.faultReason }); }
          setLine(l, { status: 'Returned', qty: { ...l.qty, used: n, returned: n - f, faulty: l.qty.faulty + f }, installedDeviceIds: ds.map(d => d.id), serials: ds.map(d => d.serial ?? '').filter(Boolean) });
          used += n; continue;
        }
        const installed: string[] = [];
        // Items without a DCIM model (optics, spares) are recorded by serial on the line; one event covers a long list.
        const bulk = serials.length > 8 && !m?.assetModelId;
        if (bulk) event(l, 'Installed', serials.length, { note: `${serials.length} serials recorded (${serials[0]} … ${serials[serials.length - 1]})${rackId ? ` in ${get<T.Rack>('racks', rackId)?.name ?? rackId}` : ''}` });
        for (const s of bulk ? [] : serials) {
          let d = devices().find(x => x.serial === s);
          if (!d && m?.assetModelId) d = newDevice(m, s, w.dataCenterId, 'Received');
          if (d) {
            const position = rackId ? (d.rackId === rackId && d.position ? d.position : freePosition(rackId, d.heightU ?? 1, d.id)) : undefined;
            const placing = !!rackId && d.rackId !== rackId;
            upd('devices', d.id, { lifecycleState: 'Installed', status: 'Active', rackId: rackId ?? d.rackId, position: (d.heightU ?? 0) > 0 ? position : undefined, face: d.face ?? 'front', dataCenterId: w.dataCenterId ?? d.dataCenterId, materialLineId: l.id, installedByWorkOrderId: w.id, commissionedDate: now(), plannerPlanId: d.plannerPlanId ?? w.plannerPlanId });
            if (placing && position) { const r = get<T.Rack>('racks', rackId); if (r) upd('racks', r.id, { usedU: r.usedU + (d.heightU ?? 1), availableU: Math.max(0, r.availableU - (d.heightU ?? 1)) }); }
            installed.push(d.id);
          }
          event(l, 'Installed', 1, { serial: s, deviceId: d?.id, note: rackId ? `In ${get<T.Rack>('racks', rackId)?.name ?? rackId}` : undefined });
        }
        const f = e.faulty ?? e.faultySerials?.length ?? 0;
        for (const s of e.faultySerials ?? []) {
          const d = devices().find(x => x.serial === s);
          if (d) upd('devices', d.id, { status: 'Faulty', notes: `Faulty at install under ${w.woId}${e.faultReason ? `: ${e.faultReason}` : ''}` });
          event(l, 'Faulty', 1, { serial: s, deviceId: d?.id, note: e.faultReason ?? 'Found faulty at install' });
        }
        if (!e.faultySerials?.length && f) event(l, 'Faulty', f, { note: e.faultReason ?? 'Found faulty' });
        const n = e.used ?? (l.kind === 'Serialised' ? serials.length : Math.max(0, l.quantity - (e.returned ?? 0) - f));
        if (l.kind === 'Consumable' && n > 0) event(l, 'Consumed', n);
        setLine(l, {
          status: n > 0 ? (l.kind === 'Serialised' ? 'Installed' : 'Consumed') : l.status,
          qty: { ...l.qty, used: l.qty.used + n, returned: l.qty.returned + (e.returned ?? 0), faulty: l.qty.faulty + f },
          installedDeviceIds: [...(l.installedDeviceIds ?? []), ...installed], serials: [...(l.serials ?? []), ...serials],
        });
        used += n;
      }
      upd('workOrders', w.id, { materialsRecordedAt: now(), materialsRecordedBy: actor });
      driveP10(w, 'record_materials', { complete: true, materialsUsed: used });
      say('WorkOrder', w.id, 'materials recorded', `${entries.length} line${entries.length === 1 ? '' : 's'} recorded (${used} used)`);
    },

    returnParts(workOrderId) {
      const w = wo(workOrderId); if (!w) return [];
      const lines = woLines(w.id).concat(rows<T.MaterialLine>('materialLines').filter(l => l.workOrderId === w.id && l.status === 'Returned'));
      const uniq = [...new Map(lines.map(l => [l.id, l])).values()];
      const back: T.MaterialLine[] = []; const disposal: T.MaterialLine[] = []; const redeploy: T.MaterialLine[] = [];
      const rma: { line: T.MaterialLine; serial: string; reason?: string; deviceId?: string }[] = [];
      const onRequest = (l: T.MaterialLine, kind: T.SupplyRequest['kind']) => get<T.SupplyRequest>('supplyRequests', l.supplyRequestId)?.kind === kind;
      const events = rows<T.MaterialEvent>('materialEvents');
      for (let l of uniq) {
        if (l.direction === 'In' && ['Delivered to site', 'Issued', 'Installed', 'Consumed', 'Returned'].includes(l.status)) {
          const baseQty = reached(l, 'Issued') || l.status === 'Returned' ? l.quantity : l.qty.delivered;
          const unused = Math.max(0, baseQty - l.qty.used - l.qty.faulty - l.qty.returned);
          if (unused > 0) { l = setLine(l, { qty: { ...l.qty, returned: l.qty.returned + unused } }); event(l, 'Returned', unused, { note: 'Not used; back to stores' }); }
          if (l.qty.used === 0 && l.qty.returned + l.qty.faulty > 0 && l.status !== 'Returned') l = setLine(l, { status: 'Returned' });
        }
        const faultySerials = events.filter(e => e.materialLineId === l.id && e.kind === 'Faulty' && e.serial);
        const inRma = new Set(events.filter(e => e.materialLineId === l.id && e.kind === 'RMA raised').map(e => e.serial));
        if (l.kind === 'Serialised') for (const e of faultySerials) if (!inRma.has(e.serial)) rma.push({ line: l, serial: e.serial!, reason: e.note, deviceId: e.deviceId });
        if (l.direction === 'Out') {
          if (l.status !== 'Returned' || l.qty.returned <= 0) continue;
          const disp = dispositionOfLine(l, w);
          if (disp === 'Return to vendor (RMA)') {
            // Faulty removed units go back to their vendor by serial.
            const serials = (l.serials?.length ? l.serials : devicesOf(l).map(d => d.serial ?? '')).filter(Boolean);
            const fresh = serials.filter(x => !inRma.has(x) && !rma.some(r => r.line.id === l.id && r.serial === x));
            for (const x of fresh) rma.push({ line: l, serial: x, reason: 'Removed as faulty', deviceId: devicesOf(l).find(d => d.serial === x)?.id });
            if (fresh.length || serials.length) continue;
          }
          if (onRequest(l, 'Return')) continue;
          (disp === 'Dispose' ? disposal : disp === 'Redeploy' ? redeploy : back).push(l);
          continue;
        }
        const toReturn = l.qty.returned > 0 || (l.kind === 'Consumable' && l.qty.faulty > 0);
        if (toReturn && !onRequest(l, 'Return')) back.push(l);
      }
      const out: T.SupplyRequest[] = [];
      const send = (kind: 'Return' | 'RMA', ls: T.MaterialLine[], extra: Partial<T.SupplyRequest>) => {
        const id = seq('supplyRequests', 'SR');
        const ack = connector.sendRequest({ srId: id, kind, dataCenterId: w.dataCenterId, deliverTo: extra.deliverTo, workOrderId: w.id, projectId: w.projectId, sentAt: now(), sentBy: actor, vendorId: extra.vendorId, serials: extra.serials, reason: extra.reason, lines: ls.map(l => ({ materialLineId: l.id, partNumber: material(l.materialId)?.partNumber ?? '', quantity: kind === 'RMA' ? (extra.serials ?? []).filter(s => rma.some(r => r.line.id === l.id && r.serial === s)).length : l.direction === 'Out' ? l.qty.returned : l.qty.returned + (l.kind === 'Consumable' ? l.qty.faulty : 0) })) });
        const sr = { id, srId: id, ...base(), kind, status: ack.status, dataCenterId: w.dataCenterId, projectId: w.projectId, workOrderId: w.id, changeRequestId: w.changeRequestId, materialLineIds: ls.map(l => l.id), eta: ack.eta, scpRef: ack.scpRef, sentAt: now(), sentBy: actor, history: [{ at: now(), status: ack.status, note: ack.note }], ...extra } as T.SupplyRequest;
        db.create('supplyRequests', sr as unknown as Record<string, unknown>);
        out.push(sr);
        return sr;
      };
      if (back.length) {
        const sr = send('Return', back, { deliverTo: `${dcName(w.dataCenterId) ?? 'Site'} store (collection)`, reason: back.some(l => l.direction === 'Out') ? 'Removed equipment and unused parts back to stores' : 'Unused parts back to stores' });
        for (const l of back) setLine(l, { supplyRequestId: sr.id });
      }
      if (redeploy.length) {
        const sr = send('Return', redeploy, { deliverTo: `${dcName(w.dataCenterId) ?? 'Site'} staging (for redeployment)`, reason: 'Redeploy: removed equipment to staging for reuse' });
        for (const l of redeploy) setLine(l, { supplyRequestId: sr.id });
      }
      if (disposal.length) {
        const sr = send('Return', disposal, { deliverTo: `${dcName(w.dataCenterId) ?? 'Site'} secure cage (collection for certified disposal)`, reason: 'Removed equipment for certified disposal' });
        for (const l of disposal) setLine(l, { supplyRequestId: sr.id });
        const unsafe = disposal.filter(l => l.dataBearing && !l.sanitisation?.certificateNo);
        if (unsafe.length) say('WorkOrder', w.id, 'sanitisation warning', `${unsafe.reduce((a, l) => a + l.quantity, 0)} data-bearing unit${unsafe.reduce((a, l) => a + l.quantity, 0) === 1 ? '' : 's'} booked for disposal collection (${sr.scpRef}) without a sanitisation certificate: sanitise before the platform collects (warning only)`);
      }
      const byVendor = new Map<string, typeof rma>();
      for (const r of rma) { const v = vendorFor(material(r.line.materialId))?.id ?? ''; byVendor.set(v, [...(byVendor.get(v) ?? []), r]); }
      for (const [vendorId, rs] of byVendor) {
        const ls = [...new Map(rs.map(r => [r.line.id, r.line])).values()];
        const sr = send('RMA', ls, { vendorId: vendorId || undefined, serials: rs.map(r => r.serial), reason: [...new Set(rs.map(r => r.reason).filter(Boolean))].join('; ') || 'Faulty at install' });
        for (const r of rs) {
          event(r.line, 'RMA raised', 1, { serial: r.serial, deviceId: r.deviceId, supplyRequestId: sr.id, note: `${sr.scpRef} with ${get<T.Vendor>('vendors', vendorId)?.name ?? 'the vendor'}` });
          if (r.deviceId) upd('devices', r.deviceId, { status: 'Faulty', lifecycleState: 'Retired', rackId: undefined, position: undefined, notes: `Returned to the vendor under ${sr.srId}` });
        }
      }
      driveP10(w, 'return_parts', { complete: true, returns: out.length }, ['record_materials']);
      if (out.length) say('WorkOrder', w.id, 'parts returned', out.map(r => `${r.kind} ${r.scpRef} (${r.materialLineIds.length} line${r.materialLineIds.length === 1 ? '' : 's'})`).join('; '));
      return out;
    },

    simulateGoodsReceipt(poId, quantities) {
      const po = get<T.PurchaseOrder>('purchaseOrders', poId); if (!po) return undefined;
      const pols = poLinesOfPo(po.id).filter(l => l.status !== 'Cancelled');
      const want = pols.map(pol => ({ pol, q: Math.min(pol.quantity - pol.receivedQty, quantities ? (quantities.find(x => x.poLineId === pol.id)?.quantity ?? 0) : pol.quantity - pol.receivedQty) })).filter(x => x.q > 0);
      if (!want.length) return undefined;
      const bom = get<T.BOM>('boms', po.bomId);
      const project = projectOf(bom?.projectId);
      const dc = project?.dataCenterId ?? rows<T.PlannerPlan>('plannerPlans').find(p => p.id === po.plannerPlanId)?.dataCenterId;
      const grId = seq('goodsReceipts', 'GR');
      const affected = new Set<string>();
      const grLines: T.GoodsReceipt['lines'] = [];
      for (const { pol, q } of want) {
        const m = material(pol.materialId);
        const serials = m?.kind === 'Serialised' ? Array.from({ length: q }, (_, i) => serialFor(m, `${pol.id}:${pol.receivedQty + i}`)) : undefined;
        const created = serials && m?.assetModelId ? serials.slice(0, options.maxReceiptDevices ?? serials.length).map(s => newDevice(m, s, dc, 'Received', { plannerPlanId: po.plannerPlanId, notes: `Received on ${po.poId} (${grId})` })).filter((d): d is T.Device => !!d) : [];
        const received = pol.receivedQty + q;
        upd('purchaseOrderLines', pol.id, { receivedQty: received, status: received >= pol.quantity ? 'Received' : 'Partially received' });
        grLines.push({ poLineId: pol.id, quantity: q, serials });
        let left = q; let devs = created.map(d => d.id);
        const targets = rows<T.MaterialLine>('materialLines').filter(l => l.poLineId === pol.id && isLive(l) && l.direction === 'In').sort((a, b) => (a.needBy ?? '').localeCompare(b.needBy ?? '') || a.id.localeCompare(b.id));
        for (const l of targets) {
          const take = Math.min(left, l.quantity - l.qty.received); if (take <= 0) continue;
          left -= take;
          const got = devs.slice(0, take); devs = devs.slice(take);
          const r = l.qty.received + take;
          const next = setLine(l, { qty: { ...l.qty, received: r }, status: r >= l.quantity && statusRank(l.status) < statusRank('Received') ? 'Received' : l.status, deviceIds: got.length ? [...(l.deviceIds ?? []), ...got] : l.deviceIds });
          event(next, 'Received', take, { source: 'ERP', note: `Goods receipt ${grId} on ${po.poId}` });
          if (l.projectId) affected.add(l.projectId);
        }
      }
      const gr = { id: grId, grId, ...base(), poId: po.id, dataCenterId: dc, receivedAt: now(), lines: grLines, erpRef: `ERP-GR-${hash(grId + po.id)}` } as T.GoodsReceipt;
      db.create('goodsReceipts', gr as unknown as Record<string, unknown>);
      if (poLinesOfPo(po.id).every(l => l.status === 'Received' || l.status === 'Cancelled')) upd('purchaseOrders', po.id, { status: 'Received' });
      else if (po.status === 'Approved' || po.status === 'Draft') upd('purchaseOrders', po.id, { status: 'Ordered' });
      say('PurchaseOrder', po.id, 'goods received', `${grId}: ${want.reduce((a, x) => a + x.q, 0)} item${want.length === 1 ? '' : 's'} on ${want.length} line${want.length === 1 ? '' : 's'} (ERP)`);
      if (project) affected.add(project.id);
      for (const pid of affected) ops.completeReceiveIfDone(pid);
      return gr;
    },

    simulateEtaChange(poLineId, eta) {
      const pol = get<T.PurchaseOrderLine>('purchaseOrderLines', poLineId); if (!pol) return;
      const po = get<T.PurchaseOrder>('purchaseOrders', pol.poId);
      upd('purchaseOrderLines', pol.id, { eta });
      const lines = rows<T.MaterialLine>('materialLines').filter(l => l.poLineId === pol.id && isLive(l));
      const needBy = pol.needBy ?? lines.map(l => l.needBy).filter(Boolean).sort()[0];
      const late = !!needBy && eta > needBy;
      for (const l of lines) { const next = setLine(l, { eta }); event(next, 'ETA changed', l.quantity, { source: 'ERP', note: `Supplier date now ${eta.slice(0, 10)}${late ? `, after need-by ${needBy!.slice(0, 10)}` : ''}` }); }
      say('PurchaseOrder', pol.poId, 'eta changed', `${po?.poId ?? pol.poId} line ${pol.lineNo}: supplier date ${eta.slice(0, 10)}${late ? ` (late against need-by ${needBy!.slice(0, 10)})` : ''}`);
      if (!late || !drive) return;
      const projects = new Set(lines.map(l => l.projectId).filter((x): x is string => !!x));
      const bomProject = get<T.BOM>('boms', po?.bomId)?.projectId; if (bomProject) projects.add(bomProject);
      const fire = (inst: T.ProcessInstance | undefined) => {
        const b = inst ? delayBoundaryOf(inst.definitionKey) : undefined;
        if (inst && b && fireBoundaryIn(db, modelParsed(inst.definitionKey), inst.id, b, { delayedPoLineId: pol.id, eta }, actor)) say('Project', String(inst.variables?.projectId ?? inst.recordId), 'delivery delayed', `${po?.poId ?? ''} line ${pol.lineNo} now due ${eta.slice(0, 10)}: expedite with the vendor`);
      };
      for (const pid of projects) {
        fire(running('project', pid));
        const plan = projectOf(pid)?.plannerPlanId; if (plan) fire(running('plannerPlan', plan));
      }
    },

    simulateSupplyProgress(supplyRequestId, status, note) {
      const sr = get<T.SupplyRequest>('supplyRequests', supplyRequestId); if (!sr) return;
      upd('supplyRequests', sr.id, { status, history: [...sr.history, { at: now(), status, note }] });
      const lines = sr.materialLineIds.map(line).filter((l): l is T.MaterialLine => !!l && isLive(l));
      const w = wo(sr.workOrderId ?? '');
      if (sr.kind === 'Kit') {
        if (status === 'In progress' || status === 'Delivered' || status === 'Completed') {
          const to: T.MaterialLine['status'] = status === 'In progress' ? 'Kitted' : 'Delivered to site';
          for (const l of lines) {
            if (statusRank(l.status) >= statusRank(to) || statusRank(l.status) >= statusRank('Issued')) continue;
            let deviceIds = l.deviceIds;
            const m = material(l.materialId);
            if (to === 'Delivered to site' && m?.assetModelId && (deviceIds?.length ?? 0) < l.quantity) {
              // The platform ships units with their serials; they arrive staged at the site.
              const add = Array.from({ length: l.quantity - (deviceIds?.length ?? 0) }, (_, i) => newDevice(m, serialFor(m, `${l.id}:${sr.id}:${i}`), sr.dataCenterId, 'Staged', { notes: `Delivered to site on ${sr.scpRef}` })).filter((d): d is T.Device => !!d);
              deviceIds = [...(deviceIds ?? []), ...add.map(d => d.id)];
            }
            if (to === 'Delivered to site') for (const id of deviceIds ?? []) { const d = get<T.Device>('devices', id); if (d && !d.rackId && d.lifecycleState !== 'Installed') upd('devices', id, { lifecycleState: 'Staged', dataCenterId: sr.dataCenterId ?? d.dataCenterId }); }
            if (to === 'Delivered to site' && statusRank(l.status) < statusRank('Kitted')) event(l, 'Kitted', l.quantity, { source: 'Supply chain', supplyRequestId: sr.id, note: `Kitted (${sr.scpRef})` });
            const next = setLine(l, { status: to, deviceIds, qty: { ...l.qty, kitted: l.quantity, delivered: to === 'Delivered to site' ? l.quantity : l.qty.delivered } });
            event(next, to === 'Kitted' ? 'Kitted' : 'Delivered to site', l.quantity, { source: 'Supply chain', supplyRequestId: sr.id, note: note ?? (to === 'Kitted' ? `Kitted (${sr.scpRef})` : `Delivered to ${sr.deliverTo ?? 'the site'}`) });
          }
        }
        if (status === 'Rejected' || status === 'Cancelled') for (const l of lines) if (l.supplyRequestId === sr.id && statusRank(l.status) < statusRank('Issued')) setLine(l, { status: stockStatus(l), supplyRequestId: undefined });
      } else if (status === 'Completed') {
        for (const l of lines) {
          if (sr.kind === 'RMA') { for (const s of (sr.serials ?? []).filter(s => (l.serials ?? []).includes(s) || rows<T.MaterialEvent>('materialEvents').some(e => e.materialLineId === l.id && e.serial === s))) event(l, 'Returned', 1, { source: 'Supply chain', serial: s, supplyRequestId: sr.id, note: 'Vendor accepted the RMA' }); continue; }
          const disp = l.direction === 'Out' ? dispositionOfLine(l, w) : undefined;
          event(l, 'Returned', l.direction === 'Out' ? l.qty.returned : l.qty.returned + (l.kind === 'Consumable' ? l.qty.faulty : 0), { source: 'Supply chain', supplyRequestId: sr.id, note: disp === 'Dispose' ? 'Collected for certified disposal' : disp === 'Redeploy' ? 'At staging, ready to redeploy' : 'Received back at stores' });
        }
        const disposed = lines.filter(l => l.direction === 'Out' && dispositionOfLine(l, w) === 'Dispose');
        if (disposed.length) completeDisposal(sr, disposed, w);
      }
      say(sr.workOrderId ? 'WorkOrder' : 'SupplyRequest', sr.workOrderId ?? sr.id, 'supply chain update', `${sr.kind} ${sr.scpRef}: ${status}${note ? ` (${note})` : ''}`);
    },

    releaseWorkOrder(workOrderId, reason) {
      const w = wo(workOrderId); if (!w) return;
      const lines = woLines(w.id);
      const atSite = lines.filter(l => l.direction === 'In' && reached(l, 'Delivered to site') && l.qty.used === 0);
      for (const l of lines) {
        if (atSite.includes(l)) { setLine(l, { status: 'Returned', qty: { ...l.qty, returned: l.qty.delivered || l.quantity } }); event(l, 'Returned', l.qty.delivered || l.quantity, { note: `Work order cancelled: ${reason}` }); continue; }
        if (l.status === 'Returned' || isUsedStatus(l.status)) continue;
        ops.cancelLine(l.id, reason);
      }
      for (const sr of rows<T.SupplyRequest>('supplyRequests').filter(r => r.workOrderId === w.id && (r.kind === 'Kit' || r.kind === 'Reservation') && ['Sent', 'Accepted', 'In progress'].includes(r.status))) {
        const r = connector.cancelRequest(sr.scpRef, reason);
        upd('supplyRequests', sr.id, { status: 'Cancelled', history: [...get<T.SupplyRequest>('supplyRequests', sr.id)!.history, { at: now(), status: 'Cancelled', note: r.note ?? reason }] });
      }
      if (atSite.length) ops.returnParts(w.id);
    },

    completeReceiveIfDone(projectId) {
      if (!drive) return false;
      const project = projectOf(projectId); if (!project) return false;
      const lines = rows<T.MaterialLine>('materialLines').filter(l => l.projectId === projectId && l.direction === 'In' && isLive(l) && l.source === 'Purchase' && l.poLineId);
      let moved = false;
      const check = (inst: T.ProcessInstance | undefined) => {
        if (!inst) return;
        const recv = RECEIVE_TASKS[inst.definitionKey]; if (!recv || !inst.currentElementIds.includes(recv)) return;
        const p = PROCESS_BY_KEY[inst.definitionKey]; const path = p ? mainPath(p) : [];
        const after = (step?: string) => !!step && (path.indexOf(step) > path.indexOf(recv) || inst.definitionKey === 'hall-fitout');
        const covered = lines.filter(l => after(l.projectStepId));
        if (!covered.length || !covered.every(l => reached(l, 'Received') || l.qty.received >= l.quantity || isUsedStatus(l.status))) return;
        driveTask(db, modelParsed(inst.definitionKey), inst.id, recv, { complete: true, acknowledged: true, receivedVia: 'ERP goods receipts' }, actor);
        // An expedite opened by "Delivery delayed" is no longer needed.
        const expedite = p?.nodes.find(n => n.id === recv)?.boundaries?.find(b => b.ref === 'delivery-delayed')?.to;
        if (expedite) withdrawTaskIn(db, inst.id, expedite, actor, 'Delivered — expedite no longer needed');
        say('Project', projectId, 'kit received', `Every purchased item for the steps after "${p?.nodes.find(n => n.id === recv)?.name ?? recv}" is received (ERP); the step is complete`);
        moved = true;
      };
      check(running('project', projectId));
      if (project.plannerPlanId) check(running('plannerPlan', project.plannerPlanId));
      return moved;
    },

    generateProjectProcurement(projectId) {
      const project = projectOf(projectId); if (!project) return undefined;
      if (bomsOf(project).length) return undefined;
      const recipe = TEMPLATE_RECIPES[project.template ?? ''] ?? TEMPLATE_RECIPES['Rack Deployment'];
      const racks = Math.max(1, Math.min(48, projectFacts(project).racks));
      const key = processKeyFor(project.template);
      const items = recipe.map(r => ({ m: byPart(r.part) ?? ensureMaterial({ ...CATALOGUE_ITEMS.find(c => c.partNumber === r.part)!, category: undefined }), q: r.qty * (r.per === 'rack' ? racks : 1) })).filter(x => x.m && x.q > 0);
      const bomId = seq('boms', 'BOM');
      const cats = new Set(items.map(i => i.m.category));
      const type: T.BOM['type'] = cats.has('Plant') || cats.has('Cooling') ? 'Power' : cats.has('Compute') ? 'Compute' : cats.has('Rack') ? 'Rack' : 'Network';
      const total = items.reduce((a, i) => a + i.q * i.m.unitCost, 0);
      db.create('boms', { id: bomId, bomId, ...base(), name: `${project.name} · bill of materials`, type, projectId, plannerPlanId: project.plannerPlanId, totalCost: total, status: 'Approved', lineCount: items.length });
      const blines = items.map((it, i) => {
        const id = seq('bomLines', 'BOML');
        const step = stepForCategory(key, it.m.category);
        const bl = { id, bomlId: id, ...base(), bomId, lineNo: i + 1, partNumber: it.m.partNumber, description: it.m.description, manufacturer: it.m.manufacturer, quantity: it.q, unitCost: it.m.unitCost, category: it.m.category, materialId: it.m.id, projectId, projectStepId: step, needBy: stepNeedBy(project, step) } as T.BOMLine;
        db.create('bomLines', bl as unknown as Record<string, unknown>);
        return bl;
      });
      // One purchase order per vendor, each with its lines.
      const byVendor = new Map<string, T.BOMLine[]>();
      for (const bl of blines) { const v = vendorFor(material(bl.materialId))?.id ?? ''; byVendor.set(v, [...(byVendor.get(v) ?? []), bl]); }
      for (const [vendorId, ls] of byVendor) {
        const poId = seq('purchaseOrders', 'PO');
        const value = ls.reduce((a, l) => a + l.quantity * l.unitCost, 0);
        const needBy = ls.map(l => l.needBy).filter(Boolean).sort()[0];
        const lead = Math.max(...ls.map(l => material(l.materialId)?.leadWeeks ?? 4));
        db.create('purchaseOrders', { id: poId, poId, ...base(), bomId, vendorId: vendorId || undefined, plannedCost: value, approvedBudget: Math.round(value * 1.05), actualSpend: 0, forecastVariance: 0, status: 'Approved', plannerPlanId: project.plannerPlanId, needBy, orderBy: needBy ? new Date(new Date(needBy).getTime() - lead * 7 * DAY).toISOString() : undefined, notes: `${get<T.Vendor>('vendors', vendorId)?.name ?? 'Vendor to be chosen'}: ${ls.length} line${ls.length === 1 ? '' : 's'}; longest lead ${lead} weeks` });
        ls.forEach((bl, i) => {
          const id = seq('purchaseOrderLines', 'POL');
          db.create('purchaseOrderLines', { id, polId: id, ...base(), poId, lineNo: i + 1, materialId: bl.materialId, bomLineId: bl.id, quantity: bl.quantity, unitCost: bl.unitCost, needBy: bl.needBy, receivedQty: 0, status: 'Open', erpRef: `ERP-${poId}-${(i + 1) * 10}` });
        });
      }
      say('Project', projectId, 'procured', `Bill of materials ${bomId} with ${blines.length} lines and ${byVendor.size} purchase order${byVendor.size === 1 ? '' : 's'} (one per vendor)`);
      ops.planProjectMaterials(projectId);
      return bomId;
    },
  };
  return ops;
}
const isUsedStatus = (s: T.MaterialLine['status']) => s === 'Installed' || s === 'Consumed';
