/**
 * DCOS seed — materials on the delivery chain.
 *
 * Runs last (after the delivery chain). The history is replayed through the same material
 * actions the app uses (`createMaterialOps` over a scratch MockDB with a seed clock), so every
 * line, request, receipt and event follows the real rules:
 *   1. The catalogue mirrored from the supply chain platform (serialised items mapped to DCIM
 *      models) and the standard change templates' kits.
 *   2. Bills of materials resolved to catalogue items and allocated to project steps; ERP lines
 *      for every purchase order with need-by and supplier dates (some late).
 *   3. Material lines per project step; goods receipts where the project has passed its
 *      "Receive…" step (part receipts where it waits there).
 *   4. Every work order gets its lines (step lines, template kit or default kit; removals take
 *      equipment out) and moves as far as its status says: kit requested, kitted, delivered,
 *      confirmed (a few short or faulty), issued, installed or consumed, returned, RMA.
 *   5. The work-order processes (P10) pass through the material steps; projects waiting at
 *      "Receive…" with a late supplier date have the "Delivery delayed" expedite open.
 *   6. Change level: removed equipment carries its disposition (stock, redeploy, RMA, disposal)
 *      and data-bearing flag; most disposed units were sanitised (certificate numbers) and their
 *      collection issued a disposal certificate, a few are still awaiting sanitisation. Open work
 *      orders have the platform's availability answer on their incoming lines (site store, depot
 *      transfer, on order, a few short), some hold a reservation, and a couple of approved changes
 *      had a quantity changed after approval.
 */
import type * as T from '../../data/types';
import { MockDB } from '../store';
import type { Seed, Person } from './ctx';
import { PROCESS_BY_KEY, nodeById } from '../../../workorders/model';
import { CATALOGUE_ITEMS, CATEGORY_WORK, PER_RACK_QTY, TEMPLATE_KITS, REMOVAL_WORK } from '../../../modules/delivery/lib/materialCatalogue';
import { createMaterialOps, RECEIVE_TASKS, delayBoundaryOf, type UsageEntry } from '../../../modules/delivery/lib/materialOps';
import { availabilityOf, isLive, reached } from '../../../modules/delivery/lib/materialRules';
import { mockSupplyChain } from '../../../modules/delivery/lib/supplyChain';
import { processKeyFor, projectFacts } from '../../../modules/delivery/lib/projectProcess';

const DAY = 864e5, HOUR = 36e5;
const SCRATCH = ['materials', 'assetModels', 'devices', 'racks', 'dataCenters', 'vendors', 'projects', 'programs', 'boms', 'bomLines', 'purchaseOrders', 'purchaseOrderLines', 'goodsReceipts', 'workOrders', 'standardChangeTemplates', 'plannerPlans', 'materialLines', 'supplyRequests', 'materialEvents', 'changeRequests', 'disposalCertificates', 'capacityReservations'] as const;
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36).toUpperCase().padStart(7, '0'); };

export function seedMaterials(S: Seed): void {
  const iso = (ms: number) => new Date(ms).toISOString();
  const ms = (s: string | undefined) => (s ? new Date(s).getTime() : NaN);
  const logistics = S.byRole('Facilities Engineer');

  // ── 1. Catalogue (with the two network models DCIM did not have yet) and template kits ──
  for (const [mfr, model, cat, u, typ, max, kg] of [['Arista', '7800R3', 'Switch', 10, 2400, 4200, 150], ['Cisco', 'Nexus 93180YC-FX', 'Switch', 1, 260, 470, 9]] as const) {
    if (S.assetModels.some((m) => m.model === model)) continue;
    const id = S.nid('AMOD');
    S.assetModels.push({ id, amodelId: id, ...S.meta(), manufacturer: mfr, model, category: cat, heightU: u, typicalPowerW: typ, maxPowerW: max, weightKg: kg, formFactor: `${u}U` } as T.AssetModel);
  }
  for (const c of CATALOGUE_ITEMS) {
    const id = S.nid('MAT');
    S.materials.push({ id, matId: id, ...S.meta(logistics), partNumber: c.partNumber, description: c.description, manufacturer: c.manufacturer, kind: c.kind, category: c.category, uom: c.uom, unitCost: c.unitCost, leadWeeks: c.leadWeeks, packSize: c.packSize, assetModelId: c.model ? S.assetModels.find((m) => m.model === c.model)?.id : undefined, scpRef: `SCP-ITM-${hash(c.partNumber)}` });
  }
  const matByPart = (p: string) => S.materials.find((m) => m.partNumber === p);
  for (const t of S.standardChangeTemplates) {
    const k = TEMPLATE_KITS.find((x) => x.match.test(t.name));
    if (k) t.kit = k.kit.map(([part, quantity]) => ({ materialId: matByPart(part)!.id, quantity }));
  }

  // ── Scratch database and the seed clock ──
  const db = new MockDB();
  db.hydrate(Object.fromEntries(SCRATCH.map((k) => [k, ((S as unknown as Record<string, unknown[]>)[k] ?? []) as Record<string, unknown>[]])));
  const original = new Map(S.devices.map((d) => [d.id, d]));
  let clock = S.now;
  const at = (t: number) => { clock = Math.min(S.now - 60_000, t); };
  const auditAs = (p: Person) => (entityType: string, entityId: string, action: string, summary: string) => S.audit(entityType, entityId, action, summary, p, iso(clock));
  const opsFor = (name: string) => { const p = S.byRole('Field Technician'); return createMaterialOps(db, name || p.name, auditAs({ ...p, name: name || p.name }), { now: () => iso(clock), drive: false }); };
  const erp = createMaterialOps(db, 'ERP', auditAs(S.byRole('Finance Manager')), { now: () => iso(clock), drive: false });
  const platform = createMaterialOps(db, 'Supply chain platform', auditAs(logistics), { now: () => iso(clock), drive: false });
  const all = <X>(e: string) => db.getAllRaw(e) as unknown as X[];
  const get = <X>(e: string, id?: string) => (id ? db.getById(e, id) as unknown as X | undefined : undefined);
  const instOf = (recordType: string, id: string) => S.processInstances.filter((i) => i.recordType === recordType && i.recordId === id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

  // ── 2. Bills of materials: realistic serialised quantities, then PO lines per order ──
  // Quantities a site would order: per rack position for rack kit (racks, rack PDUs, blanking, cage nuts…), a handful of big serialised units otherwise.
  for (const bl of all<T.BOMLine>('bomLines')) {
    const m = matByPart(bl.partNumber);
    const proj = all<T.Project>('projects').find((p) => p.id === all<T.BOM>('boms').find((b) => b.id === bl.bomId)?.projectId);
    const perRack = PER_RACK_QTY[bl.partNumber];
    if (perRack !== undefined && proj) db.update('bomLines', bl.id, { quantity: Math.max(1, Math.ceil(perRack * projectFacts(proj).racks)) });
    else if (m?.kind === 'Serialised' && m.assetModelId && bl.quantity > 16) db.update('bomLines', bl.id, { quantity: 8 + (bl.lineNo * 3) % 9 });
  }
  for (const b of all<T.BOM>('boms')) db.update('boms', b.id, { totalCost: all<T.BOMLine>('bomLines').filter((l) => l.bomId === b.id).reduce((a, l) => a + l.quantity * l.unitCost, 0) });

  // Project position against its "Receive…" step: before, at or past it.
  const position = (p: T.Project): 'before' | 'at' | 'past' => {
    const key = processKeyFor(p.template); const inst = instOf('project', p.id); const recv = key ? RECEIVE_TASKS[key] : undefined;
    if (!inst) return p.status === 'Completed' ? 'past' : 'before';
    if (inst.state === 'completed') return 'past';
    if (!recv) return inst.completedElementIds.some((id) => id.startsWith('wait_')) || inst.currentElementIds.some((id) => id.startsWith('wait_')) ? 'past' : 'before';
    return inst.currentElementIds.includes(recv) ? 'at' : inst.completedElementIds.includes(recv) ? 'past' : 'before';
  };
  const stepStart = (projectId: string, step?: string) => {
    const starts = all<T.WorkOrder>('workOrders').filter((w) => w.projectId === projectId && w.projectStepId === step && w.plannedStart).map((w) => ms(w.plannedStart));
    return starts.length ? Math.min(...starts) : NaN;
  };

  let n = 0;
  const projects = all<T.Project>('projects');
  for (const p of projects) {
    const boms = all<T.BOM>('boms').filter((b) => b.projectId === p.id || (!b.projectId && p.plannerPlanId && b.plannerPlanId === p.plannerPlanId));
    if (!boms.length) continue;
    const pos = position(p);
    const key = processKeyFor(p.template);
    at(ms(boms[0].createdAt) || S.now - 120 * DAY);
    // Resolve and allocate the BOM lines (and mirror the ERP lines) through the material actions.
    for (const b of boms) {
      for (const bl of all<T.BOMLine>('bomLines').filter((l) => l.bomId === b.id)) if (!bl.materialId) db.update('bomLines', bl.id, { materialId: matByPart(bl.partNumber)?.id });
    }
    // A project receiving or building has ordered its kit (the ERP order is placed before receipt and the first work step).
    const pinst = instOf('project', p.id);
    const building = pos !== 'before' || (!!pinst && (pinst.state === 'completed' || [...pinst.completedElementIds, ...pinst.currentElementIds].some((id) => id.startsWith('wait_'))));
    if (building) for (const b of boms) for (const po of all<T.PurchaseOrder>('purchaseOrders').filter((x) => x.bomId === b.id && (x.status === 'Approved' || x.status === 'Draft'))) db.update('purchaseOrders', po.id, { status: 'Ordered' });
    opsFor(p.managerName).planProjectMaterials(p.id);
    // Supplier dates and receipts per PO line.
    for (const b of boms) for (const po of all<T.PurchaseOrder>('purchaseOrders').filter((x) => x.bomId === b.id)) {
      const ordered = po.status === 'Ordered' || po.status === 'Received';
      const pols = all<T.PurchaseOrderLine>('purchaseOrderLines').filter((l) => l.poId === po.id);
      const full: { poLineId: string; quantity: number }[] = []; const part: { poLineId: string; quantity: number }[] = [];
      let receiveAt = S.now - 20 * DAY;
      pols.forEach((pol, k) => {
        n++;
        const bl = get<T.BOMLine>('bomLines', pol.bomLineId);
        const start = stepStart(p.id, bl?.projectStepId);
        const needBy = Number.isFinite(start) ? start - 5 * DAY : ms(pol.needBy) || ms(p.plannedStart);
        db.update('purchaseOrderLines', pol.id, { needBy: iso(needBy) });
        for (const l of all<T.MaterialLine>('materialLines').filter((x) => x.poLineId === pol.id)) db.update('materialLines', l.id, { needBy: iso(needBy) });
        if (!ordered) return;
        const stepDone = !!bl?.projectStepId && (instOf('project', p.id)?.completedElementIds.includes(bl.projectStepId) || instOf('project', p.id)?.currentElementIds.includes(bl.projectStepId));
        const late = n % 4 === 1 || (pos === 'at' && k === pols.length - 1);
        const eta = late ? needBy + (10 + (n % 3) * 5) * DAY : needBy - (3 + (n % 4)) * DAY;
        db.update('purchaseOrderLines', pol.id, { eta: iso(eta) });
        if (po.status === 'Received' || (pos === 'past' && !!key && !!RECEIVE_TASKS[key]) || stepDone) { full.push({ poLineId: pol.id, quantity: pol.quantity }); receiveAt = Math.min(receiveAt, Math.min(S.now - DAY, needBy - 2 * DAY)); }
        else if (pos === 'at' && k % 2 === 0 && pols.length > 1) part.push({ poLineId: pol.id, quantity: Math.max(1, Math.floor(pol.quantity / 2)) });
        if (late && !full.some((f) => f.poLineId === pol.id)) { at(S.now - (2 + (n % 5)) * DAY); erp.simulateEtaChange(pol.id, iso(eta)); }
      });
      if (full.length) { at(receiveAt); erp.simulateGoodsReceipt(po.id, full); }
      if (part.length) { at(S.now - 6 * DAY); erp.simulateGoodsReceipt(po.id, part); }
      if (pos === 'past' && ordered && po.status !== 'Received' && all<T.PurchaseOrderLine>('purchaseOrderLines').filter((l) => l.poId === po.id).every((l) => l.status === 'Received')) db.update('purchaseOrders', po.id, { status: 'Received' });
    }
  }

  // ── 4. Work orders: their lines, moved as far as their status says ──
  const retiredPool = new Map<string, T.Device[]>();
  // Units a plan already deals with (its disposal certificates, its migration register) stay with that plan.
  const certified = new Set<string | undefined>([...S.disposalCertificates.flatMap((c) => c.items.map((x) => x.deviceId)), ...S.plannerPlans.flatMap((p) => (p.dispositions ?? []).filter((r) => r.recordType === 'device').map((r) => r.recordId))]);
  for (const d of S.devices) if (d.lifecycleState === 'Retired' && d.dataCenterId && !certified.has(d.id)) retiredPool.set(d.dataCenterId, [...(retiredPool.get(d.dataCenterId) ?? []), d]);
  const wos = [...all<T.WorkOrder>('workOrders')].sort((a, b) => (a.plannedStart ?? a.scheduledDate ?? '').localeCompare(b.plannedStart ?? b.scheduledDate ?? '') || a.id.localeCompare(b.id));
  const touched = new Set<string>();
  let i = 0;
  for (const w0 of wos) {
    i++;
    const done = ['Completed', 'Validated', 'Failed'].includes(w0.status);
    const startMs = ms(w0.actualStart ?? w0.plannedStart ?? w0.scheduledDate);
    const endMs = ms(w0.actualEnd ?? w0.plannedEnd) || startMs + 4 * HOUR;
    // Finished removals took out equipment that is retired today (never live kit).
    const liveIds = (w0.deviceIds ?? []).filter((id) => { const d = original.get(id); return d && !['Retired', 'Disposed'].includes(d.lifecycleState ?? ''); });
    if (done && REMOVAL_WORK.includes(w0.type) && (!w0.deviceIds?.length || liveIds.length)) {
      const pool = retiredPool.get(w0.dataCenterId ?? '') ?? [];
      const take = pool.splice(0, w0.type === 'Disposal' ? 4 : 2 + (i % 3));
      if (take.length) db.update('workOrders', w0.id, { deviceIds: take.map((d) => d.id) });
    }
    at(Math.min(ms(w0.createdAt) || startMs - 7 * DAY, startMs - 6 * DAY));
    const ops = opsFor(w0.assigneeName);
    // Routine rack-and-stack and device installs at the live sites installed the equipment now in their rack.
    if (done && !w0.projectId && (w0.type === 'RackInstall' || w0.type === 'DeviceDeploy') && w0.rackId) {
      const inRack = S.devices.filter((d) => d.rackId === w0.rackId && d.assetModelId && d.serial && !touched.has(d.id) && S.materials.some((m) => m.assetModelId === d.assetModelId));
      const pick = inRack.slice(0, w0.type === 'DeviceDeploy' ? 1 : 2 + (i % 3));
      const byModel = new Map<string, T.Device[]>(); for (const d of pick) byModel.set(d.assetModelId!, [...(byModel.get(d.assetModelId!) ?? []), d]);
      ops.linesForWorkOrder(w0.id);
      for (const [am, ds] of byModel) { ds.forEach((d) => touched.add(d.id)); ops.addLine(w0.id, { materialId: S.materials.find((m) => m.assetModelId === am)!.id, quantity: ds.length, source: 'Stock', deviceIds: ds.map((d) => d.id), notes: 'Equipment for the job' }); }
    }
    const lines = ops.linesForWorkOrder(w0.id);
    if (!lines.length) continue;
    // Equipment a work order takes out is never linked to a later install.
    for (const l of lines) if (l.direction === 'Out') for (const id of l.deviceIds ?? []) touched.add(id);
    const w = get<T.WorkOrder>('workOrders', w0.id)!;
    const notReceived = () => all<T.MaterialLine>('materialLines').some((l) => l.workOrderId === w.id && isLive(l) && l.direction === 'In' && l.poLineId && l.qty.received < l.quantity);
    const progress = (srId: string | undefined, steps: [T.SupplyRequest['status'], number][]) => { if (!srId) return; for (const [s, t] of steps) { if (t >= S.now) break; at(t); platform.simulateSupplyProgress(srId, s); } };

    if (w.status === 'Cancelled') {
      if (i % 2) { at(startMs - 8 * DAY); ops.requestKit(w.id); }
      at(Math.min(S.now - DAY, startMs - 3 * DAY)); ops.releaseWorkOrder(w.id, 'Change rejected or withdrawn');
      continue;
    }
    if (['Draft', 'Awaiting change approval'].includes(w.status)) { if (i % 3 === 0 && startMs - S.now < 20 * DAY) { at(S.now - DAY); ops.requestKit(w.id); } continue; }
    if (['Ready', 'Assigned'].includes(w.status)) {
      const toStart = (startMs - S.now) / DAY;
      at(Math.min(S.now - 2 * HOUR, startMs - 7 * DAY));
      const sr = ops.requestKit(w.id);
      if (!sr) continue;
      if (notReceived()) { progress(sr.id, [['Accepted', ms(sr.sentAt) + 6 * HOUR]]); continue; }
      if (toStart < 3) {
        progress(sr.id, [['Accepted', ms(sr.sentAt) + 4 * HOUR], ['In progress', S.now - 2 * DAY], ['Delivered', S.now - 8 * HOUR]]);
        if (i % 4 === 0) { const first = lines.find((l) => l.direction === 'In'); at(S.now - 3 * HOUR); ops.confirmKitReceived(w.id, first ? [{ materialLineId: first.id, short: i % 8 === 0 ? 1 : 0, faulty: i % 8 === 4 ? 1 : 0 }] : []); }
      } else if (toStart < 6) progress(sr.id, [['Accepted', ms(sr.sentAt) + 4 * HOUR], ['In progress', S.now - DAY]]);
      else if (i % 2) progress(sr.id, [['Accepted', ms(sr.sentAt) + 6 * HOUR]]);
      continue;
    }
    // In progress, validated, completed or failed: the kit went out before the work.
    at(startMs - 5 * DAY);
    const sr = ops.requestKit(w.id);
    const skipDelivery = w.status === 'InProgress' && (i % 3 === 0 || notReceived());
    if (sr && !skipDelivery) {
      progress(sr.id, [['Accepted', startMs - 5 * DAY + 3 * HOUR], ['In progress', startMs - 3 * DAY], ['Delivered', startMs - DAY]]);
      if (i % 5 !== 0) { const first = lines.find((l) => l.direction === 'In'); at(startMs - 2 * HOUR); ops.confirmKitReceived(w.id, i % 11 === 3 && first ? [{ materialLineId: first.id, short: 1 }] : []); }
    }
    at(startMs); ops.issueKit(w.id);
    if (w.status === 'InProgress') continue;
    if (w.status === 'Failed') { at(endMs + HOUR); ops.returnParts(w.id); progressReturns(w.id, endMs); continue; }
    if (w.status === 'Completed' && i % 13 === 0) continue; // finished without recording what was used (flagged in the review)
    if (REMOVAL_WORK.includes(w.type)) retiredPlan(w, i, endMs);
    at(endMs - 30 * 60_000);
    ops.recordUsage(w.id, usageFor(w, i));
    at(endMs);
    ops.returnParts(w.id);
    if (w.status === 'Completed') progressReturns(w.id, endMs);
  }

  /** Removed equipment of a finished removal: a few dispositions changed on site, data-bearing units for disposal sanitised (most with a certificate). */
  function retiredPlan(w: T.WorkOrder, k: number, endMs: number) {
    const outs = all<T.MaterialLine>('materialLines').filter((l) => l.workOrderId === w.id && isLive(l) && l.direction === 'Out' && l.deviceIds?.length);
    const ops = opsFor(w.assigneeName);
    outs.forEach((l, j) => {
      // Units still in service today, or that a plan disposes itself, went back to stores (the seed keeps their current state).
      if ((l.deviceIds ?? []).some((id) => certified.has(id) || !['Retired', 'Disposed'].includes(original.get(id)?.lifecycleState ?? 'Retired'))) { db.update('materialLines', l.id, { disposition: 'Return to stock', notes: 'Removed to stores' }); return; }
      at(endMs - 3 * HOUR);
      if (w.type === 'DeviceRemoval' && j === 0 && k % 6 === 1) ops.setDisposition(l.id, 'Return to vendor (RMA)');
      else if (w.type === 'DeviceRemoval' && j === 0 && k % 6 === 4) ops.setDisposition(l.id, 'Redeploy');
      const cur = get<T.MaterialLine>('materialLines', l.id)!;
      if (cur.dataBearing && cur.disposition !== 'Return to vendor (RMA)' && (k + j) % 7 !== 3) {
        at(endMs - 2 * HOUR);
        ops.recordSanitisation(l.id, sanitisation(`${w.id}:${l.id}`, k + j, w.assigneeName));
      }
    });
  }
  function sanitisation(key: string, k: number, by?: string): NonNullable<T.MaterialLine['sanitisation']> {
    const method = (['Wipe (NIST 800-88 purge)', 'Wipe (NIST 800-88 purge)', 'Crypto erase', 'Wipe (NIST 800-88 purge)', 'Shred', 'Degauss'] as const)[k % 6];
    return { method, certificateNo: `SAN-${new Date(clock).getUTCFullYear()}-${hash(key).slice(-5)}`, by: by || logistics.name, witness: k % 2 ? S.byRole('Facilities Engineer').name : undefined };
  }

  function usageFor(w: T.WorkOrder, k: number): UsageEntry[] {
    const lines = all<T.MaterialLine>('materialLines').filter((l) => l.workOrderId === w.id && isLive(l));
    let faultyGiven = false;
    return lines.map((l) => {
      if (l.direction === 'Out') return { materialLineId: l.id, serials: (l.deviceIds ?? []).map((id) => get<T.Device>('devices', id)?.serial).filter((s): s is string => !!s) };
      const avail = reached(l, 'Delivered to site') ? l.qty.delivered || l.quantity : l.quantity;
      if (l.kind === 'Serialised') {
        const devSerials = (l.deviceIds ?? []).map((id) => get<T.Device>('devices', id)?.serial).filter((s): s is string => !!s);
        const m = get<T.Material>('materials', l.materialId);
        const serials = m?.assetModelId ? devSerials.slice(0, avail) : [...devSerials, ...(l.serials ?? []).filter((s) => !devSerials.includes(s)), ...Array.from({ length: avail }, (_, j) => `${(m?.partNumber ?? 'SN').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()}${hash(`${l.id}:${j}`)}`)].slice(0, avail);
        if (!faultyGiven && k % 7 === 2 && serials.length > 1) { faultyGiven = true; return { materialLineId: l.id, serials: serials.slice(0, -1), faultySerials: serials.slice(-1), faultReason: k % 2 ? 'Dead on arrival: no link light' : 'Failed power-on self test' }; }
        return { materialLineId: l.id, serials };
      }
      const returned = k % 3 === 0 && avail > 3 ? Math.max(1, Math.floor(avail * 0.15)) : 0;
      const extra = k % 10 === 7 ? Math.max(1, Math.ceil(avail * 0.2)) : 0;
      return { materialLineId: l.id, used: avail - returned + extra, returned };
    });
  }
  function progressReturns(woId: string, endMs: number) {
    for (const r of all<T.SupplyRequest>('supplyRequests').filter((x) => x.workOrderId === woId && (x.kind === 'Return' || x.kind === 'RMA'))) {
      const steps: [T.SupplyRequest['status'], number][] = r.kind === 'RMA' ? [['Accepted', endMs + DAY], ['In progress', endMs + 3 * DAY], ['Completed', endMs + 12 * DAY]] : [['Accepted', endMs + 6 * HOUR], ['Completed', endMs + 2 * DAY]];
      for (const [s, t] of steps) { if (t >= S.now) break; at(t); platform.simulateSupplyProgress(r.id, s); }
    }
  }

  // A rejected kit and a platform-side cancellation, so every answer is represented.
  const openKits = all<T.SupplyRequest>('supplyRequests').filter((r) => r.kind === 'Kit' && r.status === 'Sent');
  if (openKits[0]) { at(S.now - 2 * HOUR); platform.simulateSupplyProgress(openKits[0].id, 'Rejected', 'Two items not in stock at the regional warehouse; re-request after the next receipt'); }
  // A stock reservation the platform holds for a project step ahead of its work orders.
  const ahead = all<T.MaterialLine>('materialLines').find((l) => !l.workOrderId && l.projectId && isLive(l) && l.source === 'Purchase' && reached(l, 'Received'));
  if (ahead) {
    const id = `SR-${String(all<T.SupplyRequest>('supplyRequests').length + 1).padStart(4, '0')}`;
    at(S.now - 3 * DAY);
    db.create('supplyRequests', { id, srId: id, ...S.meta(logistics), kind: 'Reservation', status: 'Accepted', dataCenterId: ahead.dataCenterId, projectId: ahead.projectId, materialLineIds: [ahead.id], deliverTo: 'Held at the site store for the project step', needBy: ahead.needBy, scpRef: `SCP-RSV-${hash(id)}`, sentAt: iso(clock), sentBy: S.byRole('Project Manager').name, history: [{ at: iso(clock), status: 'Sent' }, { at: iso(clock + 2 * HOUR), status: 'Accepted', note: 'Received units held for the project' }] });
  }

  // ── Step lines no work order takes: used by the step once it is done, at the site while it runs, needed later otherwise ──
  const evt = (l: T.MaterialLine, kind: T.MaterialEvent['kind'], t: number, note: string) => { const id = `ME-${String(all<T.MaterialEvent>('materialEvents').length + 1).padStart(4, '0')}`; db.create('materialEvents', { id, meId: id, ...S.meta(logistics), at: iso(t), kind, source: kind === 'Delivered to site' ? 'Supply chain' : 'DCOS', by: kind === 'Delivered to site' ? 'Supply chain platform' : logistics.name, materialLineId: l.id, materialId: l.materialId, quantity: l.quantity, projectId: l.projectId, note }); };
  for (const l of all<T.MaterialLine>('materialLines').filter((x) => x.projectId && !x.workOrderId && x.direction === 'In' && isLive(x))) {
    const inst = instOf('project', l.projectId!); const step = l.projectStepId;
    const stepDone = !!inst && (inst.state === 'completed' || (!!step && inst.completedElementIds.includes(step)));
    const stepNow = !!inst && !!step && inst.currentElementIds.includes(step);
    const startedAt = ms(S.flowNodeInstances.find((f) => f.instanceId === inst?.id && f.elementId === step)?.startedAt) || S.now - 30 * DAY;
    if ((stepDone || stepNow) && l.status !== 'Planned') {
      const t = Math.min(S.now - DAY, startedAt + DAY);
      evt(l, 'Delivered to site', t, 'Delivered straight to the site for the step');
      if (stepDone) { evt(l, l.kind === 'Serialised' ? 'Installed' : 'Consumed', t + 2 * DAY, 'Used by the step (no work order of its own)'); db.update('materialLines', l.id, { status: l.kind === 'Serialised' ? 'Installed' : 'Consumed', qty: { ...l.qty, kitted: l.quantity, delivered: l.quantity, used: l.quantity } }); }
      else db.update('materialLines', l.id, { status: 'Delivered to site', qty: { ...l.qty, kitted: l.quantity, delivered: l.quantity } });
    } else if (!stepDone && !stepNow && l.needBy && ms(l.needBy) < S.now) {
      // A future step: its need-by is ahead of today (supplier dates keep their slip, if any).
      const need = S.now + (14 + (ms(l.needBy) % 5) * 7) * DAY;
      const wasLate = !!l.eta && l.eta > l.needBy;
      db.update('materialLines', l.id, { needBy: iso(need), eta: l.eta ? iso(wasLate ? need + 10 * DAY : need - 4 * DAY) : undefined });
      if (l.poLineId) db.update('purchaseOrderLines', l.poLineId, { needBy: iso(need), ...(l.eta ? { eta: iso(wasLate ? need + 10 * DAY : need - 4 * DAY) } : {}) });
    }
  }

  // ── 6. Change level: retired equipment on open work, after-approval changes, availability, reservations ──
  const OPEN_WO = ['Draft', 'Awaiting change approval', 'Ready', 'Assigned', 'InProgress'];
  const openWos = all<T.WorkOrder>('workOrders').filter((w) => OPEN_WO.includes(w.status)).sort((a, b) => a.id.localeCompare(b.id));
  const crOf = (w: T.WorkOrder) => get<T.ChangeRequest>('changeRequests', w.changeRequestId);
  const linesOf = (w: T.WorkOrder) => all<T.MaterialLine>('materialLines').filter((l) => l.workOrderId === w.id && isLive(l));
  // Migration work taking units out of their old rack for redeployment.
  const held = new Set(all<T.MaterialLine>('materialLines').filter((l) => isLive(l) && l.status !== 'Returned').flatMap((l) => l.deviceIds ?? []));
  for (const w of openWos.filter((x) => x.type === 'Migration' && ['Ready', 'Assigned'].includes(x.status)).slice(0, 2)) {
    const ds = (w.deviceIds ?? []).filter((id) => !held.has(id) && get<T.Device>('devices', id)?.rackId);
    if (!ds.length) continue;
    at(S.now - 3 * DAY); opsFor(w.assigneeName).addRetired(w.id, ds); ds.forEach((id) => held.add(id));
  }
  // Open removals: units already wiped on site have their certificate; one faulty unit goes back to its vendor instead (decided after approval).
  let o = 0;
  for (const w of openWos.filter((x) => REMOVAL_WORK.includes(x.type))) {
    for (const l of linesOf(w).filter((x) => x.direction === 'Out' && x.deviceIds?.length)) {
      o++;
      const ops = opsFor(w.assigneeName);
      if (o === 2 && crOf(w) && ['Approved', 'Scheduled'].includes(crOf(w)!.status)) { at(S.now - 2 * DAY); ops.setDisposition(l.id, 'Return to vendor (RMA)'); }
      else if (l.dataBearing && (w.status === 'InProgress' || o % 3 === 0)) { at(S.now - (o % 3 === 0 ? DAY : 4 * HOUR)); ops.recordSanitisation(l.id, sanitisation(`${w.id}:${l.id}`, o, w.assigneeName)); }
    }
  }
  // Two approved changes whose kit quantity was raised after approval (flagged to the approvers, not re-approved).
  let bumped = 0;
  for (const w of openWos) {
    if (bumped >= 2) break;
    const cr = crOf(w); if (!cr || !['Approved', 'Scheduled'].includes(cr.status)) continue;
    const l = linesOf(w).find((x) => x.direction === 'In' && !x.bomLineId && x.kind === 'Consumable' && !reached(x, 'Delivered to site'));
    if (!l) continue;
    at(S.now - (2 + bumped) * DAY);
    opsFor(w.assigneeName).updateLine(l.id, { quantity: l.quantity + Math.max(2, Math.ceil(l.quantity * 0.25)), notes: bumped ? 'Extra for the second row found on the site survey' : 'Spares for the patching rework agreed at the walk-down' });
    bumped++;
  }
  // Extra parts asked for on changes still being approved: a few the platform can only supply from
  // open orders, a few no store holds in the quantity needed (asked of the platform first).
  const sc = mockSupplyChain();
  const ask = (m: T.Material, quantity: number, dataCenterId?: string) => sc.checkAvailability([{ materialId: m.id, partNumber: m.partNumber, quantity, dataCenterId }], {
    asOf: iso(clock), materials: all<T.Material>('materials'), devices: all<T.Device>('devices'), purchaseOrders: all<T.PurchaseOrder>('purchaseOrders'),
    purchaseOrderLines: all<T.PurchaseOrderLine>('purchaseOrderLines'), materialLines: all<T.MaterialLine>('materialLines').filter(isLive), capacityReservations: all<T.CapacityReservation>('capacityReservations'),
  })[0];
  const pending = openWos.filter((w) => w.dataCenterId && !['Approved', 'Scheduled', 'InProgress'].includes(crOf(w)?.status ?? '') && linesOf(w).some((l) => l.direction === 'In'));
  const orderedPo = new Set(all<T.PurchaseOrder>('purchaseOrders').filter((p) => p.status === 'Ordered').map((p) => p.id));
  const incoming = [...new Set(all<T.PurchaseOrderLine>('purchaseOrderLines').filter((l) => orderedPo.has(l.poId) && (l.status === 'Open' || l.status === 'Partially received') && l.quantity > l.receivedQty).map((l) => l.materialId))]
    .map((id) => get<T.Material>('materials', id)).filter((m): m is T.Material => !!m && m.unitCost < 50000).sort((a, b) => a.partNumber.localeCompare(b.partNumber));
  // Parts that fit the work: by category for orders in flight, by work type for dear spares and optics.
  const fits = (m: T.Material, w: T.WorkOrder) => CATEGORY_WORK[m.category].includes(w.type);
  const SPARES: Partial<Record<string, string[]>> = { CircuitTurnUp: ['QDD-400G-ZR', 'QDD-400G-DR4'], Cabling: ['QDD-400G-DR4', 'QSFP-100G-SR4', 'MPO24-TRUNK'], Migration: ['NVME-768', 'PSU-1100', 'QSFP-100G-SR4'], DeviceDeploy: ['NVME-768', 'PSU-1100'], PlantInstall: ['FAN-MOD', 'STS16'], PlantCutIn: ['FAN-MOD', 'STS16'], PowerConnect: ['STS16', 'PSU-1100'], RackInstall: ['QSFP-100G-SR4', 'PSU-1100'] };
  let extra = 0;
  const onOrderWos = new Set<string>(); const onOrderParts = new Set<string>();
  for (const w of pending) {
    if (extra >= 3) break;
    const ok = (x: T.Material) => fits(x, w) && ask(x, 2, w.dataCenterId).bestSource === 'On order' && !linesOf(w).some((l) => l.materialId === x.id);
    const m = incoming.find((x) => !onOrderParts.has(x.id) && ok(x)) ?? incoming.find(ok); if (!m) continue;
    onOrderParts.add(m.id);
    at(S.now - 4 * DAY); opsFor(w.assigneeName).addLine(w.id, { materialId: m.id, quantity: 2, source: 'Stock', notes: 'Two more units, from the next delivery' });
    onOrderWos.add(w.id); extra++;
  }
  let short = 0;
  for (const w of [...pending].reverse()) {
    if (short >= 3) break;
    if (onOrderWos.has(w.id)) continue;
    // The dear part for this work that the stores hold least of.
    const pick = (SPARES[w.type] ?? []).map(matByPart).filter((m): m is T.Material => !!m && !incoming.some((x) => x.id === m.id) && !linesOf(w).some((l) => l.materialId === m.id))
      .map((m) => ({ m, a: ask(m, 1, w.dataCenterId) })).map((x) => ({ ...x, have: x.a.atSite + x.a.atDepot })).sort((a, b) => a.have - b.have || a.m.partNumber.localeCompare(b.m.partNumber))[0];
    if (!pick || pick.have > 14) continue;
    at(S.now - 3 * DAY); opsFor(w.assigneeName).addLine(w.id, { materialId: pick.m.id, quantity: pick.have + 1 + (short % 2), source: 'Stock', notes: 'Needed for the cut-over; more than the stores hold' });
    short++;
  }
  // The platform's availability answer on every open work order's incoming lines.
  openWos.forEach((w, k) => { if (linesOf(w).some((l) => l.direction === 'In')) { at(S.now - (1 + (k % 20)) * HOUR); opsFor(w.assigneeName).checkAvailability(w.id); } });
  // Stock held for some work not yet kitted (about every second one that can be supplied).
  let r = 0;
  for (const w of openWos) {
    const ls = linesOf(w).filter((l) => l.direction === 'In' && !reached(l, 'Kit requested') && l.status !== 'Returned');
    if (!ls.length || availabilityOf(ls).state === 'Short' || r++ % 2) continue;
    at(S.now - 20 * HOUR); const sr = opsFor(w.assigneeName).reserveMaterials(w.id);
    if (sr && r % 3 !== 0) { at(S.now - 18 * HOUR); platform.simulateSupplyProgress(sr.id, 'Accepted', 'Stock held at the site store'); }
  }

  // ── Copy the scratch database back ──
  const back = <K extends keyof Seed>(k: K) => { (S as unknown as Record<string, unknown>)[k as string] = db.getAllRaw(k as string); };
  for (const k of ['materials', 'purchaseOrderLines', 'goodsReceipts', 'materialLines', 'supplyRequests', 'materialEvents', 'devices', 'racks', 'boms', 'bomLines', 'purchaseOrders', 'workOrders', 'disposalCertificates'] as const) back(k);
  // Equipment that was already in the estate keeps its current state; only the links to the work order are new.
  S.devices = S.devices.map((d) => {
    const o = original.get(d.id); if (!o || (!d.installedByWorkOrderId && !d.removedByWorkOrderId)) return d;
    const stillLive = !['Retired', 'Disposed'].includes(o.lifecycleState ?? '');
    // Retired units the seed's removals disposed (certificate issued) or sent to staging for redeployment keep that state.
    const settled = !stillLive && (d.lifecycleState === 'Disposed' || d.lifecycleState === 'Staged');
    return { ...d, lifecycleState: settled ? d.lifecycleState : o.lifecycleState, status: o.status, rackId: o.rackId, position: o.position, face: o.face, dataCenterId: o.dataCenterId, commissionedDate: o.commissionedDate, decommissionDate: o.decommissionDate, removedByWorkOrderId: stillLive ? undefined : d.removedByWorkOrderId };
  });

  // Kit that arrived at a site a migration plan is exiting joins the plan's register.
  for (const plan of S.plannerPlans.filter((x) => x.scope === 'migration' && x.dataCenterId && x.dispositions?.length)) {
    const known = new Set(plan.dispositions!.map((r) => `${r.recordType}:${r.recordId}`));
    for (const d of S.devices.filter((x) => x.dataCenterId === plan.dataCenterId && original.get(x.id)?.dataCenterId !== plan.dataCenterId && !known.has(`device:${x.id}`))) {
      plan.dispositions!.push({ recordType: 'device', recordId: d.id, label: d.name, disposition: d.rackId ? 'move' : 'keep', notes: d.rackId ? 'Installed after the register was drawn up; moves with its rack' : 'Unracked kit delivered after the register was drawn up; goes back to stores before the exit' });
    }
  }

  // ── 5. P10 through the material steps; expedite where a supplier date is late ──
  const P10 = PROCESS_BY_KEY['work-order'];
  const fni = (inst: T.ProcessInstance, id: string, start: number, end: number, assignee?: string) => {
    const node = nodeById(P10, id)!;
    S.flowNodeInstances.push({ id: S.nid('FNI'), ...S.meta(), instanceId: inst.id, elementId: id, elementName: node.name, type: node.type, state: 'completed', startedAt: iso(start), endedAt: iso(end), assignee });
    if (node.type === 'userTask') S.userTasks.push({ id: S.nid('UT'), ...S.meta(), instanceId: inst.id, elementId: id, name: node.name, formKey: node.formKey ?? 'acknowledge', candidateRole: P10.laneRoles[node.lane], assignee, dueAt: iso(start + node.hours * HOUR), state: 'completed', completedAt: iso(end) });
  };
  const linesByWo = new Map<string, T.MaterialLine[]>();
  for (const l of S.materialLines) if (l.workOrderId) linesByWo.set(l.workOrderId, [...(linesByWo.get(l.workOrderId) ?? []), l]);
  for (const w of S.workOrders) {
    const ls = linesByWo.get(w.id); if (!ls?.length) continue;
    const inst = S.processInstances.find((x) => x.id === w.processInstanceId); if (!inst) continue;
    inst.variables = { ...inst.variables, hasMaterials: true };
    const f = (id: string) => S.flowNodeInstances.find((x) => x.instanceId === inst.id && x.elementId === id);
    const done = new Set(inst.completedElementIds);
    if (done.has('start_work') && !done.has('confirm_kit')) {
      const acc = f('accept'); const t = ms(acc?.endedAt ?? inst.startedAt);
      fni(inst, 'request_kit', t, t + 60_000); fni(inst, 'confirm_kit', t + 60_000, t + 2 * HOUR, w.assigneeName || undefined);
      inst.completedElementIds = [...inst.completedElementIds.filter((x) => x !== 'start_work'), 'request_kit', 'confirm_kit', 'start_work'].filter((x, k, a) => a.indexOf(x) === k);
    }
    if ((done.has('verify') || inst.state === 'completed' || inst.currentElementIds.includes('verify')) && !done.has('record_materials')) {
      const c = f('complete'); const t = ms(c?.endedAt ?? w.actualEnd ?? inst.startedAt);
      fni(inst, 'record_materials', t, t + 20 * 60_000, w.assigneeName || undefined); fni(inst, 'return_parts', t + 20 * 60_000, t + HOUR, w.assigneeName || undefined);
      const idx = inst.completedElementIds.indexOf('g_used');
      const ids = [...inst.completedElementIds]; ids.splice(idx >= 0 ? idx + 1 : ids.length, 0, 'record_materials', 'return_parts');
      inst.completedElementIds = ids.filter((x, k, a) => a.indexOf(x) === k);
    }
  }
  for (const p of S.projects) {
    const key = processKeyFor(p.template); const inst = instOf('project', p.id); const recv = key ? RECEIVE_TASKS[key] : undefined; const b = key ? delayBoundaryOf(key) : undefined;
    if (!key || !inst || !recv || !b || inst.state !== 'active' || !inst.currentElementIds.includes(recv)) continue;
    const late = S.materialLines.some((l) => l.projectId === p.id && isLive(l) && l.eta && l.needBy && l.eta > l.needBy && !reached(l, 'Received'));
    const target = PROCESS_BY_KEY[key].nodes.find((x) => x.id === recv)!.boundaries!.find((x) => x.id === b)!.to;
    if (!late || inst.currentElementIds.includes(target)) continue;
    const node = nodeById(PROCESS_BY_KEY[key], target)!; const t = S.now - 2 * DAY;
    S.flowNodeInstances.push({ id: S.nid('FNI'), ...S.meta(), instanceId: inst.id, elementId: b, elementName: 'Delivery delayed', type: 'boundary:message', state: 'completed', startedAt: iso(t), endedAt: iso(t) });
    S.flowNodeInstances.push({ id: S.nid('FNI'), ...S.meta(), instanceId: inst.id, elementId: target, elementName: node.name, type: node.type, state: 'active', startedAt: iso(t) });
    S.userTasks.push({ id: S.nid('UT'), ...S.meta(), instanceId: inst.id, elementId: target, name: node.name, formKey: node.formKey ?? 'acknowledge', candidateRole: PROCESS_BY_KEY[key].laneRoles[node.lane], dueAt: iso(t + node.hours * HOUR), state: 'created' });
    inst.currentElementIds = [...inst.currentElementIds, target]; inst.completedElementIds = [...inst.completedElementIds, b];
  }
}
