/* Smoke test with assertions for materials on the delivery chain: seed invariants, then a
   project from its bill of materials through the ERP (delay, receipt) to its work orders and
   one work order through kit, issue, install, return and RMA.
   Run: npx tsx scripts/materials-smoke.mts   (exits non-zero when a check fails) */
import { buildSnapshot } from '../src/mock/db/seed.ts';
import { MockDB } from '../src/mock/db/store.ts';
import type * as T from '../src/mock/data/types.ts';
import { MATERIAL_EVENT_KIND, MATERIAL_LINE_STATUS } from '../src/mock/data/enums.ts';
import { completeTaskIn, modelParsed, openTasksOf } from '../src/modules/workorders/lib/engineCore.ts';
import { createChainOps, projectInstanceOf, startProjectProcess } from '../src/modules/delivery/lib/chainOps.ts';
import { createMaterialOps, RECEIVE_TASKS } from '../src/modules/delivery/lib/materialOps.ts';
import { NO_MATERIAL_WORK, PER_RACK_QTY, inUnits } from '../src/modules/delivery/lib/materialCatalogue.ts';
import { projectFacts } from '../src/modules/delivery/lib/projectProcess.ts';
import { availabilityOf, changeMaterialFlags, defaultDisposition, isDataBearing, isLive, linesOfChange, linesOfStep, linesOfWorkOrder, materialDataFromSnapshot, readinessOf, retiredOf, usageOf, MATERIAL_DATA_KEYS } from '../src/modules/delivery/lib/materialRules.ts';
import { APPROVED_STATES } from '../src/modules/delivery/lib/materialOps.ts';

let failures = 0; let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) { failures++; console.log(`  FAIL ${msg}`); } };
const section = async (name: string, fn: () => void | Promise<void>) => { console.log(`\n# ${name}`); const before = failures; try { await fn(); } catch (e) { failures++; console.log(`  FAIL threw: ${e instanceof Error ? e.stack : String(e)}`); } console.log(failures === before ? '  ok' : `  ${failures - before} failure(s)`); };

const snap = buildSnapshot('small');
const db = new MockDB(); db.hydrate(snap);
const all = <X>(e: string) => db.getAllRaw(e) as unknown as X[];
const get = <X>(e: string, id?: string) => (id ? db.getById(e, id) as unknown as X | undefined : undefined);
const actor = 'Smoke Test';
const audits: string[] = [];
const audit = (entityType: string, entityId: string, action: string, summary: string) => { audits.push(`${entityType}:${entityId}:${action}:${summary}`); };
const chain = createChainOps(db, actor, audit);
const mat = createMaterialOps(db, actor, audit);
const data = () => materialDataFromSnapshot(Object.fromEntries(MATERIAL_DATA_KEYS.map((k) => [k, db.getAllRaw(k)])));
const OPEN: T.WorkOrder['status'][] = ['Draft', 'Awaiting change approval', 'Ready', 'Assigned', 'InProgress', 'Validated'];
const iso = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

await section('Seed: collections and counts', () => {
  const d = data();
  console.log(`  materials ${d.materials.length}, PO lines ${d.purchaseOrderLines.length}, receipts ${d.goodsReceipts.length}, material lines ${d.materialLines.length}, requests ${d.supplyRequests.length}, events ${d.materialEvents.length}`);
  ok(d.materials.length >= 55, 'about sixty catalogue items');
  ok(d.materials.filter((m) => m.kind === 'Serialised' && m.assetModelId).length >= 10, 'serialised items mapped to DCIM models');
  ok(d.materialLines.length > 200 && d.materialEvents.length > d.materialLines.length, 'material lines with their events');
  for (const k of MATERIAL_LINE_STATUS) ok(d.materialLines.some((l) => l.status === k), `a line is ${k}`);
  for (const k of MATERIAL_EVENT_KIND) ok(d.materialEvents.some((e) => e.kind === k), `an event is ${k}`);
  for (const k of ['Kit', 'Return', 'RMA', 'Reservation'] as const) ok(d.supplyRequests.some((r) => r.kind === k), `a ${k} request`);
  ok(all<T.PurchaseOrder>('purchaseOrders').filter((p) => p.bomId).every((p) => d.purchaseOrderLines.some((l) => l.poId === p.id)), 'every purchase order with a BOM has ERP lines');
  ok(all<T.StandardChangeTemplate>('standardChangeTemplates').filter((t) => t.kit?.length).length >= 5, 'standard templates carry kits');
});

await section('Seed: work orders, changes and lines agree', () => {
  const d = data(); const wos = all<T.WorkOrder>('workOrders');
  for (const w of wos.filter((x) => x.projectId && OPEN.includes(x.status) && !NO_MATERIAL_WORK.includes(x.type))) ok(linesOfWorkOrder(d, w.id).length > 0, `${w.id} (${w.type}, open project work) has material lines`);
  for (const l of d.materialLines.filter((x) => x.workOrderId)) {
    const w = wos.find((x) => x.id === l.workOrderId);
    ok(w && l.changeRequestId === w.changeRequestId, `${l.id}: changeRequestId is its work order's change`);
  }
  ok(d.materialLines.every((l) => !l.projectStepId || l.projectStepId.startsWith('wait_')), 'project steps are wait_<step> ids');
  for (const pol of d.purchaseOrderLines) {
    const got = d.goodsReceipts.flatMap((g) => g.lines).filter((x) => x.poLineId === pol.id).reduce((a, x) => a + x.quantity, 0);
    ok(got === pol.receivedQty, `${pol.id}: received ${pol.receivedQty} = receipts ${got}`);
    ok(pol.status === (pol.receivedQty >= pol.quantity ? 'Received' : pol.receivedQty > 0 ? 'Partially received' : 'Open'), `${pol.id}: status follows the receipts`);
    ok(all<T.PurchaseOrder>('purchaseOrders').some((p) => p.id === pol.poId), `${pol.id}: poId is a PO record id`);
  }
  // A step's lines add up to its BOM lines: work orders take step lines, never copies.
  for (const bl of all<T.BOMLine>('bomLines').filter((x) => x.projectId && x.projectStepId)) {
    const sum = d.materialLines.filter((l) => l.bomLineId === bl.id && isLive(l)).reduce((a, l) => a + l.quantity, 0);
    ok(sum === bl.quantity, `${bl.id}: lines add up to the BOM quantity (${sum} of ${bl.quantity})`);
  }
  for (const l of d.materialLines.filter((x) => x.direction === 'In' && x.installedDeviceIds?.length)) for (const id of l.installedDeviceIds!) {
    const dev = get<T.Device>('devices', id);
    ok(dev?.installedByWorkOrderId === l.workOrderId && dev?.materialLineId === l.id, `${l.id}: installed ${id} links back to ${l.workOrderId}`);
  }
  for (const l of d.materialLines.filter((x) => x.direction === 'In' && x.status === 'Installed')) {
    const m = d.materials.find((x) => x.id === l.materialId);
    if (m?.assetModelId) ok((l.serials ?? []).every((s) => all<T.Device>('devices').some((dv) => dv.serial === s && dv.installedByWorkOrderId === l.workOrderId)), `${l.id}: every installed serial is a Device installed by ${l.workOrderId}`);
  }
  ok(d.materialEvents.every((e) => d.materialLines.some((l) => l.id === e.materialLineId)), 'every event belongs to a line');
  ok(d.supplyRequests.every((r) => r.materialLineIds.every((id) => d.materialLines.some((l) => l.id === id)) && r.history.length > 0), 'requests point at real lines and carry history');
  ok(d.materialLines.some((l) => l.eta && l.needBy && l.eta > l.needBy), 'some supplier dates are late against need-by');
  ok(d.materialLines.some((l) => l.qty.faulty > 0) && d.materialEvents.some((e) => e.kind === 'Delivered to site' && /short/.test(e.note ?? '')), 'a few items faulty or short');
  const done = wos.filter((w) => w.status === 'Completed' && linesOfWorkOrder(d, w.id).some((l) => l.direction === 'In'));
  ok(done.some((w) => usageOf(linesOfWorkOrder(d, w.id), w).notRecorded) && done.some((w) => !usageOf(linesOfWorkOrder(d, w.id), w).notRecorded), 'completed work orders: most recorded, a few flagged as not recorded');
  const pis = all<T.ProcessInstance>('processInstances');
  for (const w of wos.filter((x) => linesOfWorkOrder(d, x.id).length)) {
    const p10 = pis.find((i) => i.id === w.processInstanceId);
    ok(p10?.variables.hasMaterials === true, `${w.id}: P10 knows it has materials`);
    if (p10?.state === 'completed') ok(['request_kit', 'confirm_kit', 'record_materials', 'return_parts'].every((x) => p10.completedElementIds.includes(x)), `${w.id}: completed P10 passed the material steps`);
  }
  ok(all<T.Device>('devices').some((dv) => dv.removedByWorkOrderId), 'removed equipment links to its work order');
  const byDevice = new Map<string, T.MaterialEvent[]>();
  for (const e of d.materialEvents) if (e.deviceId) byDevice.set(e.deviceId, [...(byDevice.get(e.deviceId) ?? []), e]);
  for (const [dev, es] of byDevice) { const s = es.sort((a, b) => a.at.localeCompare(b.at)); const r = s.findIndex((e) => e.kind === 'Removed'); ok(r < 0 || !s.slice(r + 1).some((e) => e.kind === 'Installed'), `${dev}: never installed after it was removed`); }
  const projLines = d.materialLines.filter((l) => l.projectId && isLive(l));
  // Work orders a project raised outside its process steps keep their kit off the steps; everything else sits on a step.
  ok(projLines.every((l) => l.projectStepId || (l.workOrderId && !wos.find((w) => w.id === l.workOrderId)?.projectStepId)), 'every project line sits on a project step (or on a work order outside the steps)');
  const lateNow = projLines.filter((l) => readinessOf([l]).state === 'Late');
  ok(lateNow.length > 0 && lateNow.length < projLines.length * 0.2, `a realistic few project lines are late (${lateNow.length} of ${projLines.length})`);
  ok(pis.some((i) => i.recordType === 'project' && i.currentElementIds.includes('expedite')), 'a project waiting at "Receive" has the delivery-delayed expedite open');
});

await section('Units and scope: packs, per-rack quantities, work orders take their own racks', () => {
  const d = data(); const wos = all<T.WorkOrder>('workOrders');
  const u = inUnits({ packSize: 500, unitCost: 90 }, 1200, 0.18);
  ok(u.quantity === 3 && u.unitCost === 90, 'pieces of a pack-sold item become whole packs (1200 cage nuts → 3 boxes of 500)');
  ok(inUnits({ packSize: 500, unitCost: 90 }, 4, 90).quantity === 4, 'a line already in packs is left alone');
  const packed = d.materials.filter((m) => m.packSize);
  ok(packed.length >= 3, 'pack-sold items carry their pack size');
  for (const bl of all<T.BOMLine>('bomLines').filter((l) => l.projectId && PER_RACK_QTY[l.partNumber] !== undefined)) {
    const p = all<T.Project>('projects').find((x) => x.id === bl.projectId)!;
    ok(bl.quantity === Math.max(1, Math.ceil(PER_RACK_QTY[bl.partNumber] * projectFacts(p).racks)), `${bl.id} ${bl.partNumber}: ${bl.quantity} for ${projectFacts(p).racks} racks`);
  }
  for (const bl of all<T.BOMLine>('bomLines').filter((l) => packed.some((m) => m.id === l.materialId))) ok(bl.unitCost === packed.find((m) => m.id === bl.materialId)!.unitCost, `${bl.id}: counted in packs at the pack price`);
  for (const pol of d.purchaseOrderLines.filter((l) => l.bomLineId)) { const bl = all<T.BOMLine>('bomLines').find((x) => x.id === pol.bomLineId)!; ok(pol.quantity <= bl.quantity && pol.unitCost === bl.unitCost, `${pol.id}: same unit as its BOM line`); }
  const p4 = all<T.Project>('projects').find((p) => p.id === 'PROJ-0004');
  if (p4) {
    const racks = projectFacts(p4).racks;
    for (const part of ['AR8136BLK', 'CABSCRWM6']) { const q = d.materialLines.filter((l) => l.projectId === p4.id && isLive(l) && d.materials.find((m) => m.id === l.materialId)?.partNumber === part).reduce((a, l) => a + l.quantity, 0); ok(q === 0 || q === Math.ceil(PER_RACK_QTY[part] * racks), `PROJ-0004 ${part}: ${q} for ${racks} racks`); }
  }
  // A work order covering N racks takes N × the per-rack quantity (titles, racks and quantities agree).
  for (const w of wos) {
    const m = /racks (\d+)–(\d+)/.exec(w.title ?? '');
    if (m && w.rackIds?.length && w.projectId) ok(w.rackIds.length === Number(m[2]) - Number(m[1]) + 1 || w.rackIds.length === new Set(w.rackIds).size, `${w.id} "${w.title}" covers ${w.rackIds.length} racks`);
    if (!w.rackIds?.length) continue;
    for (const l of d.materialLines.filter((x) => x.workOrderId === w.id && x.bomLineId)) {
      const per = PER_RACK_QTY[d.materials.find((x) => x.id === l.materialId)?.partNumber ?? ''];
      if (per !== undefined) ok(l.quantity <= Math.max(1, Math.ceil(per * w.rackIds.length)), `${w.id} ${l.id}: ${l.quantity} for ${w.rackIds.length} racks`);
    }
  }
});

await section('Project: BOM → ERP lines → late supplier date → receipt completes "Receive" → work orders take step lines', () => {
  const dc = all<T.DataCenter>('dataCenters').find((x) => x.status === 'Operational') ?? all<T.DataCenter>('dataCenters')[0];
  const prog = all<T.Program>('programs')[0];
  const id = 'PROJ-MATSMOKE';
  db.create('projects', { id, projId: id, customerId: 'CUST-001', isDeleted: false, createdAt: '', updatedAt: '', createdBy: actor, createdById: 'me', programId: prog.id, name: 'Materials smoke racks', status: 'Planning', rag: 'Green', managerName: 'Mike Johnson', dataCenterId: dc.id, plannedStart: iso(-24), plannedEnd: iso(24 * 60), percentComplete: 0, budget: 2e6, actualSpend: 0, template: 'Rack Deployment', notes: JSON.stringify({ rackCount: 8 }) });
  const inst = startProjectProcess(db, get<T.Project>('projects', id)!, actor)!;
  const bomId = mat.generateProjectProcurement(id);
  ok(bomId && get<T.BOM>('boms', bomId)?.projectId === id, 'procurement generated a BOM linked to the project');
  const blines = all<T.BOMLine>('bomLines').filter((l) => l.bomId === bomId);
  ok(blines.length >= 8 && blines.every((l) => l.materialId && l.projectStepId?.startsWith('wait_')), 'BOM lines resolved to catalogue items and allocated to steps');
  const pos = all<T.PurchaseOrder>('purchaseOrders').filter((p) => p.bomId === bomId);
  ok(pos.length >= 2 && pos.every((p) => p.vendorId && all<T.PurchaseOrderLine>('purchaseOrderLines').some((l) => l.poId === p.id)), `one PO per vendor with lines (${pos.length})`);
  ok(new Set(pos.map((p) => p.vendorId)).size === pos.length, 'no two orders for the same vendor');
  const install = linesOfStep(data(), id, 'wait_install');
  ok(install.length > 0 && install.every((l) => l.status === 'Planned' && l.source === 'Purchase' && !l.workOrderId), 'step lines planned from the purchase order lines');
  ok(mat.planProjectMaterials(id).length === 0, 'planning again creates nothing');
  const parsed = modelParsed('project-rack-deployment');
  for (const el of ['design', 'order']) { const t = openTasksOf(db, inst.id).find((x) => x.elementId === el); if (t) completeTaskIn(db, parsed, t.id, { approved: true }, actor); }
  for (const p of pos) db.update('purchaseOrders', p.id, { status: 'Ordered' });
  ok(projectInstanceOf(db, id)!.currentElementIds.includes(RECEIVE_TASKS['project-rack-deployment']), 'project waits at "Receive and stage kit"');
  // supplier slips past need-by → Delivery delayed → Expedite
  const pol = all<T.PurchaseOrderLine>('purchaseOrderLines').find((l) => l.poId === pos[0].id)!;
  mat.simulateEtaChange(pol.id, new Date(new Date(pol.needBy ?? iso(0)).getTime() + 14 * 864e5).toISOString());
  ok(openTasksOf(db, inst.id).some((t) => t.elementId === 'expedite'), 'a late supplier date fires "Delivery delayed": Expedite with the vendor is open');
  ok(projectInstanceOf(db, id)!.currentElementIds.includes('receive'), 'receiving stays open alongside the expedite');
  ok(all<T.MaterialEvent>('materialEvents').some((e) => e.kind === 'ETA changed' && e.projectId === id), 'ETA change recorded on the lines');
  // receipts: one order in → still waiting; all in → receive completes and the first step raises its work orders
  const gr = mat.simulateGoodsReceipt(pos[0].id)!;
  ok(gr && gr.lines.length > 0 && all<T.PurchaseOrderLine>('purchaseOrderLines').filter((l) => l.poId === pos[0].id).every((l) => l.status === 'Received'), 'goods receipt posted against the first order');
  ok(get<T.PurchaseOrder>('purchaseOrders', pos[0].id)?.status === 'Received', 'the order is Received');
  ok(projectInstanceOf(db, id)!.currentElementIds.includes('receive'), 'still receiving while another order is open');
  const modelled = gr.lines.find((x) => x.serials?.length && get<T.Material>('materials', get<T.PurchaseOrderLine>('purchaseOrderLines', x.poLineId)?.materialId)?.assetModelId);
  if (modelled) ok(modelled.serials!.every((s) => all<T.Device>('devices').some((d) => d.serial === s && d.lifecycleState === 'Received')), 'received serialised units with a DCIM model are Devices in Received');
  for (const p of pos.slice(1)) mat.simulateGoodsReceipt(p.id);
  const cur = projectInstanceOf(db, id)!;
  ok(!cur.currentElementIds.includes('receive') && cur.completedElementIds.includes('receive'), `every order received: "Receive and stage kit" completed (now ${cur.currentElementIds})`);
  ok(!cur.currentElementIds.includes('expedite') && !openTasksOf(db, inst.id).some((t) => t.elementId === 'expedite'), 'the expedite opened by the delay is closed once everything is in');
  ok(cur.variables.expediteNote === 'Delivered — expedite no longer needed', 'with a note saying why');
  const raised = all<T.WorkOrder>('workOrders').filter((w) => w.projectId === id && w.projectStepId === 'wait_install');
  ok(raised.length >= 2, `the install step raised its work orders (${raised.length})`);
  const d = data();
  for (const w of raised) {
    const ls = linesOfWorkOrder(d, w.id);
    ok(ls.length > 0 && ls.every((l) => l.changeRequestId === w.changeRequestId && l.projectStepId === 'wait_install'), `${w.id} took step lines, on its change`);
  }
  for (const w of raised.filter((x) => x.type === 'RackInstall')) {
    const racks = linesOfWorkOrder(d, w.id).find((l) => d.materials.find((m) => m.id === l.materialId)?.partNumber === 'AR3300');
    ok(w.rackIds?.length === 4 && racks?.quantity === 4, `${w.id} "${w.title}": 4 racks, takes 4 rack enclosures (${racks?.quantity})`);
  }
  const before = install.reduce((a, l) => a + l.quantity, 0);
  ok(linesOfStep(d, id, 'wait_install').reduce((a, l) => a + l.quantity, 0) === before, 'the step quantity is unchanged by the split (no copies)');
  ok(get<T.ProcessInstance>('processInstances', raised[0].processInstanceId)?.variables.hasMaterials === true, 'P10 started with hasMaterials');
  ok(mat.linesForWorkOrder(raised[0].id).length === linesOfWorkOrder(d, raised[0].id).length, 'linesForWorkOrder is idempotent');
});

/** Approve, book a window around now, assign: ready to start. */
function ready(woId: string) {
  const w = get<T.WorkOrder>('workOrders', woId)!;
  let cr = get<T.ChangeRequest>('changeRequests', w.changeRequestId)!;
  if (cr.status === 'Draft') chain.submitChange(cr.id);
  for (const s of all<T.ApprovalStep>('approvalSteps').filter((x) => x.changeRequestId === cr.id && x.decision === 'Pending').sort((a, b) => a.order - b.order)) chain.decideStep(cr.id, s.id, 'Approved', 'ok');
  cr = get<T.ChangeRequest>('changeRequests', cr.id)!;
  chain.scheduleChange(cr.id, iso(-1), iso(3), 'none');
  chain.assignWorkOrder(woId, { kind: 'internal', name: 'James Wilson' });
}

await section('Work order: kit → platform delivers → start issues → install serials → return parts with an RMA', () => {
  const wo = all<T.WorkOrder>('workOrders').find((w) => w.projectId === 'PROJ-MATSMOKE' && w.type === 'RackInstall' && linesOfWorkOrder(data(), w.id).some((l) => l.kind === 'Serialised' && (l.deviceIds?.length ?? 0) >= 2));
  ok(wo, 'a rack-and-stack work order with received serialised units'); if (!wo) return;
  ready(wo.id);
  const sr = mat.requestKit(wo.id, { deliverTo: 'Hall 1 staging' })!;
  ok(sr?.kind === 'Kit' && sr.status === 'Sent' && sr.scpRef.startsWith('SCP-KIT') && sr.changeRequestId === wo.changeRequestId, 'kit request sent to the platform');
  ok(linesOfWorkOrder(data(), wo.id).filter((l) => l.direction === 'In').every((l) => l.status === 'Kit requested' && l.supplyRequestId === sr.id), 'lines are Kit requested');
  ok(mat.requestKit(wo.id) === undefined, 'requesting again sends nothing');
  ok(readinessOf(linesOfWorkOrder(data(), wo.id)).state !== 'Ready', 'not ready before delivery');
  mat.simulateSupplyProgress(sr.id, 'Accepted'); mat.simulateSupplyProgress(sr.id, 'In progress');
  ok(linesOfWorkOrder(data(), wo.id).every((l) => l.direction === 'Out' || l.status === 'Kitted'), 'platform kitted the lines');
  mat.simulateSupplyProgress(sr.id, 'Delivered', 'On the dock');
  ok(readinessOf(linesOfWorkOrder(data(), wo.id)).state === 'Ready', 'delivered to site: ready');
  mat.confirmKitReceived(wo.id);
  ok(get<T.SupplyRequest>('supplyRequests', sr.id)?.status === 'Completed', 'technician confirmed: request completed');
  const p10 = () => get<T.ProcessInstance>('processInstances', get<T.WorkOrder>('workOrders', wo.id)!.processInstanceId)!;
  ok(p10().completedElementIds.includes('request_kit') && p10().completedElementIds.includes('confirm_kit'), 'P10 passed Request kit and Confirm kit received');
  const r = chain.startWork(wo.id);
  ok(r.ok, `work starts (${r.reason ?? ''})`);
  ok(linesOfWorkOrder(data(), wo.id).filter((l) => l.direction === 'In').every((l) => l.status === 'Issued'), 'starting work issued the kit');
  const ls = linesOfWorkOrder(data(), wo.id);
  const ser = ls.find((l) => l.kind === 'Serialised' && (l.deviceIds?.length ?? 0) >= 2)!;
  const serials = ser.deviceIds!.map((id) => get<T.Device>('devices', id)!.serial!);
  const cons = ls.filter((l) => l.kind === 'Consumable' && l.direction === 'In');
  mat.recordUsage(wo.id, [
    { materialLineId: ser.id, serials: serials.slice(0, -1), faultySerials: serials.slice(-1), faultReason: 'Failed power-on self test' },
    ...cons.map((l, k) => ({ materialLineId: l.id, used: k === 0 ? Math.max(0, l.quantity - 2) : l.quantity, returned: k === 0 ? Math.min(2, l.quantity) : 0 })),
  ]);
  const w2 = get<T.WorkOrder>('workOrders', wo.id)!;
  ok(w2.materialsRecordedAt && w2.materialsRecordedBy === actor, 'work order records when materials were recorded');
  for (const s of serials.slice(0, -1)) {
    const dev = all<T.Device>('devices').find((d) => d.serial === s)!;
    ok(dev.lifecycleState === 'Installed' && dev.rackId === (w2.rackId ?? w2.rackIds?.[0]) && dev.installedByWorkOrderId === wo.id && dev.materialLineId === ser.id, `${s} installed in the work order's rack`);
  }
  ok(all<T.Device>('devices').find((d) => d.serial === serials.at(-1))?.status === 'Faulty', 'the faulty unit is marked faulty');
  ok(get<T.MaterialLine>('materialLines', ser.id)?.status === 'Installed', 'serialised line Installed');
  const reqs = mat.returnParts(wo.id);
  const rma = reqs.find((x) => x.kind === 'RMA'); const ret = reqs.find((x) => x.kind === 'Return');
  ok(rma && rma.serials?.includes(serials.at(-1)!) && rma.vendorId, 'faulty serial goes back by RMA to its vendor');
  ok(ret && ret.materialLineIds.length > 0, 'unused consumables go back to stores');
  ok(all<T.MaterialEvent>('materialEvents').some((e) => e.kind === 'RMA raised' && e.serial === serials.at(-1)), 'RMA raised event on the serial');
  chain.completeWorkOrder(wo.id, { notes: 'done' });
  const pi = p10();
  ok(pi.state === 'completed' && ['request_kit', 'confirm_kit', 'record_materials', 'return_parts'].every((x) => pi.completedElementIds.includes(x)), 'P10 completed through the material steps');
  const u = usageOf(linesOfWorkOrder(data(), wo.id), get<T.WorkOrder>('workOrders', wo.id));
  ok(!u.notRecorded && u.faulty >= 1 && u.returned >= 1, 'usage shows faulty and returned, recorded');
  if (rma) { mat.simulateSupplyProgress(rma.id, 'Completed'); ok(get<T.SupplyRequest>('supplyRequests', rma.id)?.history.at(-1)?.status === 'Completed', 'platform closes the RMA'); }
});

await section('Readiness never blocks: work starts with the kit not at the site (warning only)', () => {
  const wo = all<T.WorkOrder>('workOrders').find((w) => w.projectId === 'PROJ-MATSMOKE' && OPEN.includes(w.status) && w.status !== 'InProgress' && linesOfWorkOrder(data(), w.id).length);
  ok(wo, 'another work order of the project'); if (!wo) return;
  ready(wo.id);
  ok(readinessOf(linesOfWorkOrder(data(), wo.id)).state !== 'Ready', 'its kit is not at the site');
  audits.length = 0;
  const r = chain.startWork(wo.id);
  ok(r.ok, `work still starts (${r.reason ?? ''})`);
  ok(audits.some((a) => a.includes('materials warning')), 'a materials warning is recorded on the work order');
  ok(linesOfWorkOrder(data(), wo.id).filter((l) => l.direction === 'In').every((l) => l.status === 'Issued'), 'lines issued anyway');
  ok(!all<T.SupplyRequest>('supplyRequests').some((s) => s.workOrderId === wo.id && s.kind === 'Kit'), 'no kit request raised at start (the job worker skips started work)');
  chain.completeWorkOrder(wo.id, { notes: 'done without recording' });
  const u = usageOf(linesOfWorkOrder(data(), wo.id), get<T.WorkOrder>('workOrders', wo.id));
  ok(u.notRecorded, 'completing without recording leaves the lines and flags "not recorded"');
});

await section('Cancelling a work order returns its step lines to the step', () => {
  const wo = all<T.WorkOrder>('workOrders').find((w) => w.projectId === 'PROJ-MATSMOKE' && OPEN.includes(w.status) && linesOfWorkOrder(data(), w.id).some((l) => l.bomLineId));
  if (!wo) { ok(true, 'no open work order left to cancel'); return; }
  const step = wo.projectStepId!; const before = linesOfStep(data(), 'PROJ-MATSMOKE', step).reduce((a, l) => a + l.quantity, 0);
  chain.cancelWorkOrder(wo.id, 'Smoke: not needed');
  const d = data();
  ok(linesOfWorkOrder(d, wo.id).length === 0, 'the cancelled work order holds no lines');
  ok(linesOfStep(d, 'PROJ-MATSMOKE', step).reduce((a, l) => a + l.quantity, 0) === before, 'the step keeps its full quantity');
});

await section('Manual work: standard template kit, and removal takes equipment out', () => {
  const dc = all<T.DataCenter>('dataCenters').find((x) => x.status === 'Operational')!;
  const held = new Set(data().materialLines.filter((l) => isLive(l)).flatMap((l) => l.deviceIds ?? []));
  const free = (r: T.Rack) => all<T.Device>('devices').filter((d) => d.rackId === r.id && d.lifecycleState === 'Active' && !held.has(d.id));
  const rack = all<T.Rack>('racks').find((r) => r.dataCenterId === dc.id && free(r).length >= 2)!;
  const s = chain.raiseWorkOrder(undefined, { type: 'RackInstall', title: 'Smoke: rack and stack', dataCenterId: dc.id, rackIds: [rack.id], plannedStart: iso(-1), plannedEnd: iso(3), kw: 4 });
  const tpl = get<T.StandardChangeTemplate>('standardChangeTemplates', s.change.standardTemplateId);
  const ls = linesOfWorkOrder(data(), s.workOrder.id);
  ok(tpl?.kit?.length && ls.length === tpl.kit.length && ls.every((l) => l.source === 'Stock' && l.changeRequestId === s.change.id), `standard change: the template's kit (${ls.length} lines)`);
  const devs = free(rack).slice(0, 2);
  const rm = chain.raiseWorkOrder(undefined, { type: 'DeviceRemoval', title: 'Smoke: remove two devices', dataCenterId: dc.id, rackIds: [rack.id], deviceIds: devs.map((d) => d.id), plannedStart: iso(-1), plannedEnd: iso(3) });
  const out = linesOfWorkOrder(data(), rm.workOrder.id);
  ok(out.length > 0 && out.every((l) => l.direction === 'Out') && out.flatMap((l) => l.deviceIds ?? []).length === 2, 'removal: Out lines for its two devices');
  ready(rm.workOrder.id); chain.startWork(rm.workOrder.id);
  mat.recordUsage(rm.workOrder.id, out.map((l) => ({ materialLineId: l.id })));
  for (const d of devs) { const x = get<T.Device>('devices', d.id)!; ok(x.lifecycleState === 'Retired' && x.removedByWorkOrderId === rm.workOrder.id && !x.rackId, `${d.id} retired and out of the rack`); }
  const reqs = mat.returnParts(rm.workOrder.id);
  ok(reqs.some((r) => r.kind === 'Return'), 'removed equipment goes back by a return request');
  ok(mat.linesForWorkOrder(all<T.WorkOrder>('workOrders').find((w) => w.type === 'Configuration')!.id).length === 0, 'configuration work takes no materials');
});

/* ------------------------------------------------------------------ change level */
/** The platform's answer adds up and its suggested source follows from the figures. */
function answerOk(l: T.MaterialLine): boolean {
  const a = l.availability; if (!a) return false; const q = l.quantity;
  const best = a.atSite >= q ? 'Site store' : a.atSite + a.atDepot >= q ? 'Depot transfer' : a.shortfall === 0 ? 'On order' : 'Purchase needed';
  return a.atSite + a.atDepot + a.onOrder + a.shortfall >= q && a.shortfall === Math.max(0, q - a.atSite - a.atDepot - a.onOrder) && a.bestSource === best && !!a.checkedAt;
}
/** One change per work order: the change's lines are exactly its work order's lines. */
function sameLines(woId: string, label: string) {
  const d = data(); const w = get<T.WorkOrder>('workOrders', woId)!; const cr = get<T.ChangeRequest>('changeRequests', w.changeRequestId);
  if (!cr) return;
  const a = linesOfChange(d, cr).map((l) => l.id).sort().join(); const b = linesOfWorkOrder(d, woId).map((l) => l.id).sort().join();
  ok(a === b, `${label}: ${cr.id}'s lines are ${woId}'s lines`);
}

await section('Seed: availability, reservations, retired equipment and after-approval changes', () => {
  const d = data(); const wos = all<T.WorkOrder>('workOrders');
  const checked = d.materialLines.filter((l) => isLive(l) && l.availability);
  for (const l of checked) ok(answerOk(l), `${l.id}: availability adds up (${JSON.stringify(l.availability)}) for ${l.quantity}`);
  const by = (s: string) => checked.filter((l) => l.availability!.bestSource === s).length;
  const short = checked.filter((l) => l.availability!.shortfall > 0);
  console.log(`  availability: ${checked.length} lines; site store ${by('Site store')}, depot ${by('Depot transfer')}, on order ${by('On order')}, purchase needed ${by('Purchase needed')} (${short.length} short)`);
  ok(by('Site store') > checked.length / 2 && by('Depot transfer') > 0 && by('On order') > 0 && short.length >= 2 && short.length <= 4, 'a realistic spread: mostly the site store, some depot transfers, a few on order, 2–4 short');
  const seeded = new Set((snap.workOrders as { id: string }[]).map((w) => w.id));
  const open = wos.filter((w) => seeded.has(w.id) && ['Draft', 'Awaiting change approval', 'Ready', 'Assigned', 'InProgress'].includes(w.status));
  for (const w of open) for (const l of linesOfWorkOrder(d, w.id).filter((x) => x.direction === 'In' && !['Delivered to site', 'Issued', 'Installed', 'Consumed', 'Returned'].includes(x.status))) ok(l.availability, `${w.id} ${l.id}: open incoming line has the platform's answer`);
  const reserved = d.materialLines.filter((l) => isLive(l) && (l.reservedQty ?? 0) > 0);
  ok(reserved.length >= 5, `some lines hold a reservation (${reserved.length})`);
  for (const l of reserved) ok(d.supplyRequests.some((r) => r.kind === 'Reservation' && r.materialLineIds.includes(l.id) && r.workOrderId === l.workOrderId) && l.reservedQty! <= l.quantity, `${l.id}: reserved ${l.reservedQty} of ${l.quantity} under a Reservation request`);
  const out = d.materialLines.filter((l) => isLive(l) && l.direction === 'Out');
  const r = retiredOf(out);
  console.log(`  retired: ${r.lines.length} lines, ${r.units} units; ${JSON.stringify(r.byDisposition)}; data-bearing ${r.dataBearing}, awaiting sanitisation ${r.awaitingSanitisation.length} lines`);
  for (const k of ['Return to stock', 'Redeploy', 'Return to vendor (RMA)', 'Dispose'] as const) ok(r.byDisposition[k] > 0, `a removed unit goes ${k}`);
  ok(r.awaitingSanitisation.length > 0 && out.some((l) => l.sanitisation?.certificateNo), 'some data-bearing units sanitised with a certificate, some still awaiting');
  for (const l of out) {
    const devs = (l.deviceIds ?? []).map((id) => get<T.Device>('devices', id)).filter((x): x is T.Device => !!x);
    if (devs.length) ok(l.dataBearing === devs.some((x) => isDataBearing(x)) || !!l.sanitisation, `${l.id}: data-bearing flag follows its units`);
  }
  const certs = all<T.DisposalCertificate>('disposalCertificates');
  const certified = out.filter((l) => l.disposalCertificateId);
  ok(certified.length > 0, `disposed lines carry their disposal certificate (${certified.length})`);
  for (const l of certified) {
    const c = certs.find((x) => x.id === l.disposalCertificateId);
    ok(c && c.status === 'Issued' && (l.deviceIds ?? []).every((id) => c.items.some((i) => i.deviceId === id)), `${l.id}: certificate ${l.disposalCertificateId} lists its units`);
    for (const id of l.deviceIds ?? []) ok(get<T.Device>('devices', id)?.lifecycleState === 'Disposed', `${l.id}: ${id} is Disposed`);
  }
  const late = d.materialLines.filter((l) => isLive(l) && l.changedAfterApproval);
  ok(late.length >= 2 && d.materialEvents.filter((e) => e.kind === 'Quantity changed' && /after the change was approved/.test(e.note ?? '')).length >= 2, `a couple of quantities changed after approval (${late.length} flagged lines)`);
  for (const l of late) ok(APPROVED_STATES.includes(get<T.ChangeRequest>('changeRequests', l.changeRequestId)?.status ?? '') || ['Implemented', 'Closed'].includes(get<T.ChangeRequest>('changeRequests', l.changeRequestId)?.status ?? ''), `${l.id}: flagged on an approved change`);
  for (const cr of all<T.ChangeRequest>('changeRequests').filter((c) => c.workOrderId)) {
    const a = linesOfChange(d, cr).map((l) => l.id).sort().join(); const b = linesOfWorkOrder(d, cr.workOrderId!).map((l) => l.id).sort().join();
    ok(a === b, `${cr.id}: the change's lines are its work order's lines`);
  }
  ok(open.some((w) => changeMaterialFlags(linesOfWorkOrder(d, w.id), Date.now()).short), 'the change flags show a short change');
});

await section('Change level: availability, reservation, after-approval edit never blocks', () => {
  const dc = all<T.DataCenter>('dataCenters').find((x) => x.status === 'Operational')!;
  const rack = all<T.Rack>('racks').find((r) => r.dataCenterId === dc.id)!;
  const s = chain.raiseWorkOrder(undefined, { type: 'PlantCutIn', title: 'Smoke: availability', dataCenterId: dc.id, rackIds: [rack.id], plannedStart: iso(48), plannedEnd: iso(52) });
  const woId = s.workOrder.id;
  ok(!APPROVED_STATES.includes(s.change.status), `a normal change, not approved yet (${s.change.status})`);
  ok(linesOfWorkOrder(data(), woId).length > 0, 'the work order has its kit');
  const lines = mat.checkAvailability(woId);
  ok(lines.length === linesOfWorkOrder(data(), woId).filter((l) => l.direction === 'In').length && lines.every(answerOk), 'every incoming line has a consistent answer');
  ok(all<T.MaterialEvent>('materialEvents').filter((e) => e.workOrderId === woId && e.kind === 'Availability checked').length === lines.length, 'an "Availability checked" event per line');
  ok(availabilityOf(linesOfWorkOrder(data(), woId)).checked === lines.length, 'availabilityOf sees the answers');
  // a modelled serialised item from stock, so the reservation names units when stock has them
  const sr = mat.reserveMaterials(woId)!;
  ok(sr?.kind === 'Reservation' && sr.scpRef.startsWith('SCP-RSV') && sr.changeRequestId === s.change.id && sr.workOrderId === woId, 'a Reservation request is sent to the platform, on the change');
  for (const l of linesOfWorkOrder(data(), woId).filter((x) => x.direction === 'In')) {
    const a = lines.find((x) => x.id === l.id)!.availability!;
    ok(l.reservedQty === Math.min(l.quantity, a.atSite + a.atDepot + a.onOrder) && sr.materialLineIds.includes(l.id), `${l.id}: reserved ${l.reservedQty} of ${l.quantity}`);
  }
  ok(all<T.MaterialEvent>('materialEvents').some((e) => e.workOrderId === woId && e.kind === 'Reserved'), '"Reserved" events recorded');
  ok(mat.reserveMaterials(woId) === undefined, 'reserving again sends nothing');
  sameLines(woId, 'after reservation');
  // before approval: a quantity change is not flagged
  const kit = linesOfWorkOrder(data(), woId).find((l) => l.direction === 'In' && l.kind === 'Consumable')!;
  mat.updateLine(kit.id, { quantity: kit.quantity + 1 });
  ok(get<T.MaterialLine>('materialLines', kit.id)!.quantity === kit.quantity + 1 && !get<T.MaterialLine>('materialLines', kit.id)!.changedAfterApproval, 'before approval: quantity changed, not flagged');
  ready(woId);
  const cr0 = get<T.ChangeRequest>('changeRequests', s.change.id)!;
  ok(APPROVED_STATES.includes(cr0.status), `the change is approved (${cr0.status})`);
  audits.length = 0;
  mat.updateLine(kit.id, { quantity: kit.quantity + 4, notes: 'Smoke: extra for rework' });
  const k2 = get<T.MaterialLine>('materialLines', kit.id)!;
  ok(k2.quantity === kit.quantity + 4 && k2.changedAfterApproval === true && /Changed after approval/.test(k2.notes ?? '') && /Smoke: extra for rework/.test(k2.notes ?? ''), 'after approval: quantity changed and flagged, with a note');
  ok(audits.some((a) => a.startsWith(`ChangeRequest:${s.change.id}:materials changed after approval`)), 'the change records it for the approvers');
  ok(get<T.ChangeRequest>('changeRequests', s.change.id)!.status === cr0.status, 'the change stays approved (no re-approval, no block)');
  ok(all<T.MaterialEvent>('materialEvents').some((e) => e.materialLineId === kit.id && e.kind === 'Quantity changed' && /after the change was approved/.test(e.note ?? '')), 'a "Quantity changed" event says so');
  ok(changeMaterialFlags(linesOfChange(data(), get<T.ChangeRequest>('changeRequests', s.change.id)!)).changedAfterApproval >= 1, 'change flags count it');
  let threw = false; try { mat.updateLine(kit.id, { quantity: 0 }); } catch { threw = true; }
  ok(threw, 'a zero quantity is refused (cancel the line instead)');
  const extra = mat.addLine(woId, { materialId: all<T.Material>('materials').find((m) => m.partNumber === 'LBL-ROLL')!.id, quantity: 1 });
  ok(extra.changedAfterApproval === true && extra.changeRequestId === s.change.id, 'a line added after approval is flagged too');
  const kitReq = mat.requestKit(woId)!;
  ok(kitReq?.kind === 'Kit' && get<T.SupplyRequest>('supplyRequests', sr.id)?.status === 'Completed', 'the kit request takes the held stock (reservation completed)');
  const r = chain.startWork(woId);
  ok(r.ok, `work still starts (${r.reason ?? ''})`);
  sameLines(woId, 'after the edits');
  // a project step line trades quantity with its step: the step still adds up to its BOM line
  const stepLine = data().materialLines.find((l) => isLive(l) && l.workOrderId && l.bomLineId && l.quantity > 1 && !['Issued', 'Installed', 'Consumed', 'Returned'].includes(l.status));
  if (stepLine) {
    const bl = get<T.BOMLine>('bomLines', stepLine.bomLineId)!;
    const sum = () => data().materialLines.filter((l) => l.bomLineId === bl.id && isLive(l) && l.direction === 'In').reduce((a, l) => a + (l.workOrderId && l.notes?.startsWith('Above the bill') ? 0 : l.quantity), 0);
    mat.updateLine(stepLine.id, { quantity: stepLine.quantity - 1 });
    ok(sum() === bl.quantity && get<T.MaterialLine>('materialLines', stepLine.id)!.quantity === stepLine.quantity - 1, `${stepLine.id}: one back to the step, the step still adds up (${sum()} of ${bl.quantity})`);
    mat.updateLine(stepLine.id, { quantity: stepLine.quantity + 1 });
    ok(data().materialLines.filter((l) => l.bomLineId === bl.id && isLive(l)).reduce((a, l) => a + l.quantity, 0) <= bl.quantity, `${stepLine.id}: raised again, never more than the BOM on BOM lines`);
    sameLines(stepLine.workOrderId!, 'after a step line change');
  }
});

await section('Retired equipment: dispositions drive returns, redeploy, RMA and certified disposal', () => {
  const dcs = all<T.DataCenter>('dataCenters').filter((x) => x.status === 'Operational');
  const held = new Set(data().materialLines.filter((l) => isLive(l) && l.status !== 'Returned').flatMap((l) => l.deviceIds ?? []));
  const free = (r: T.Rack) => all<T.Device>('devices').filter((x) => x.rackId === r.id && ['Active', 'Installed'].includes(x.lifecycleState ?? '') && x.status !== 'Faulty' && !held.has(x.id));
  const rack = all<T.Rack>('racks').filter((r) => dcs.some((d) => d.id === r.dataCenterId)).find((r) => free(r).length >= 7 && free(r).filter((x) => isDataBearing(x)).length >= 2);
  ok(rack, 'a rack with seven free units, two of them data-bearing'); if (!rack) return;
  const devs = free(rack); const dataDevs = devs.filter((x) => isDataBearing(x)); const others = devs.filter((x) => !dataDevs.slice(0, 2).includes(x));
  const [dStock, dRedeploy, dRma, dLate, dMove] = others; const [dDispose, dClean] = dataDevs;
  if (dMove) {
    const mg = chain.raiseWorkOrder(undefined, { type: 'Migration', title: 'Smoke: move one', dataCenterId: rack.dataCenterId, rackIds: [rack.id], plannedStart: iso(72), plannedEnd: iso(76) });
    ok(!APPROVED_STATES.includes(mg.change.status), `migration: a normal change, not approved yet (${mg.change.status})`);
    const ml = mat.addRetired(mg.workOrder.id, [dMove.id])[0];
    ok(ml?.disposition === 'Redeploy' && !ml.changedAfterApproval && ml.changeRequestId === mg.change.id, 'migration: taken out for redeployment by default, not flagged before approval');
    sameLines(mg.workOrder.id, 'migration');
    mat.cancelLine(ml.id, 'Smoke: not moving');
  }
  const s = chain.raiseWorkOrder(undefined, { type: 'DeviceRemoval', title: 'Smoke: retire six', dataCenterId: rack.dataCenterId, rackIds: [rack.id], deviceIds: [dStock.id], plannedStart: iso(-1), plannedEnd: iso(3), standardAllowed: false });
  const woId = s.workOrder.id;
  const first = linesOfWorkOrder(data(), woId);
  ok(first.length === 1 && first[0].direction === 'Out' && first[0].disposition === defaultDisposition('DeviceRemoval', dStock) && first[0].dataBearing === isDataBearing(dStock), `removal: an Out line with the default disposition (${first[0]?.disposition}) and data-bearing flag`);
  ok(defaultDisposition('Disposal', dStock) === 'Dispose' && defaultDisposition('Migration', dStock) === 'Redeploy' && defaultDisposition('DeviceRemoval', { ...dStock, status: 'Faulty' }) === 'Return to vendor (RMA)', 'defaults: disposal disposes, migration redeploys, faulty goes back to the vendor');
  mat.setDisposition(first[0].id, 'Return to stock');
  const added = [mat.addRetired(woId, [dRedeploy.id], 'Redeploy'), mat.addRetired(woId, [dRma.id], 'Return to vendor (RMA)'), mat.addRetired(woId, [dDispose.id], 'Dispose'), mat.addRetired(woId, [dClean.id], 'Dispose')].map((x) => x[0]);
  const approvedNow = APPROVED_STATES.includes(get<T.ChangeRequest>('changeRequests', s.change.id)!.status);
  ok(added.every((l) => l && l.direction === 'Out' && l.workOrderId === woId && l.changeRequestId === s.change.id && !!l.changedAfterApproval === approvedNow), `addRetired: Out lines on the work order and its change (flagged only when the change is approved: ${approvedNow})`);
  ok(added.every((l, k) => l.deviceIds?.length === 1 && l.deviceIds[0] === [dRedeploy, dRma, dDispose, dClean][k].id), 'each for its device');
  ok([dRedeploy, dRma, dDispose, dClean].every((x) => get<T.WorkOrder>('workOrders', woId)!.deviceIds?.includes(x.id)), 'the work order lists the devices it takes out');
  ok(mat.addRetired(woId, [dRedeploy.id]).length === 0, 'a device already on a line is not added twice');
  ok(added[2].dataBearing && added[3].dataBearing, 'the disposed units are data-bearing');
  mat.recordSanitisation(added[3].id, { method: 'Wipe (NIST 800-88 purge)', certificateNo: 'SAN-SMOKE-1', witness: 'Smoke witness' });
  ok(get<T.MaterialLine>('materialLines', added[3].id)!.sanitisation?.certificateNo === 'SAN-SMOKE-1' && all<T.MaterialEvent>('materialEvents').some((e) => e.materialLineId === added[3].id && e.kind === 'Sanitised'), 'sanitisation recorded with its certificate');
  ok(retiredOf(linesOfWorkOrder(data(), woId)).awaitingSanitisation.some((l) => l.id === added[2].id), 'the other disposed unit is awaiting sanitisation');
  sameLines(woId, 'after adding retired equipment');
  ready(woId);
  const lateLine = mat.addRetired(woId, [dLate.id])[0];
  ok(get<T.ChangeRequest>('changeRequests', s.change.id)!.changeClass !== 'Standard', 'a board-approved change (standard changes are approved when raised and never flagged)');
  ok(lateLine?.changedAfterApproval === true && lateLine.disposition === defaultDisposition('DeviceRemoval', dLate), 'added after approval: flagged, with the default disposition');
  mat.cancelLine(lateLine.id, 'Smoke: stays in the rack');
  const r0 = chain.startWork(woId); ok(r0.ok, 'work starts');
  const outs = linesOfWorkOrder(data(), woId).filter((l) => l.direction === 'Out');
  mat.recordUsage(woId, outs.map((l) => ({ materialLineId: l.id })));
  ok(get<T.Device>('devices', dRedeploy.id)!.lifecycleState === 'Staged' && !get<T.Device>('devices', dRedeploy.id)!.rackId, 'redeploy: the unit is out of the rack and Staged');
  ok([dStock, dRma, dDispose, dClean].every((x) => get<T.Device>('devices', x.id)!.lifecycleState === 'Retired'), 'the others are Retired');
  audits.length = 0;
  const reqs = mat.returnParts(woId);
  const ret = (l: T.MaterialLine) => reqs.find((r) => r.materialLineIds.includes(l.id));
  ok(ret(first[0])?.kind === 'Return' && /store/.test(ret(first[0])!.deliverTo ?? ''), 'return to stock: a Return request to the store');
  ok(ret(added[0])?.kind === 'Return' && /redeploy/i.test(`${ret(added[0])!.deliverTo} ${ret(added[0])!.reason}`) && ret(added[0]) !== ret(first[0]), 'redeploy: its own Return request, flagged for redeployment');
  const rma = reqs.find((r) => r.kind === 'RMA');
  ok(rma && rma.serials?.includes(dRma.serial!) && rma.materialLineIds.includes(added[1].id) && rma.vendorId, 'return to vendor: an RMA request with the serial');
  ok(get<T.Device>('devices', dRma.id)!.status === 'Faulty', 'the RMA unit is marked faulty');
  const disp = ret(added[2]);
  ok(disp?.kind === 'Return' && disp === ret(added[3]) && /disposal/i.test(disp.reason ?? ''), 'dispose: one collection request for certified disposal');
  ok(audits.some((a) => a.includes('sanitisation warning')), 'booking a data-bearing unit without sanitisation warns');
  sameLines(woId, 'after returns');
  if (!disp) return;
  audits.length = 0;
  mat.simulateSupplyProgress(disp.id, 'Accepted'); mat.simulateSupplyProgress(disp.id, 'In progress', 'Collected in sealed bags'); mat.simulateSupplyProgress(disp.id, 'Completed');
  ok(audits.some((a) => a.includes('sanitisation warning')) && audits.some((a) => a.includes('disposal certified')), 'collection completes anyway (warning, not a block) and the disposal is certified');
  const l2 = get<T.MaterialLine>('materialLines', added[2].id)!; const l3 = get<T.MaterialLine>('materialLines', added[3].id)!;
  const cert = get<T.DisposalCertificate>('disposalCertificates', l2.disposalCertificateId);
  ok(cert && cert.status === 'Issued' && l3.disposalCertificateId === cert.id && [dDispose, dClean].every((x) => cert.items.some((i) => i.deviceId === x.id)), 'one disposal certificate lists both units');
  ok(cert?.reference === 'SAN-SMOKE-1' && cert.method === 'Purge (NIST 800-88)', 'the certificate carries the sanitisation reference and method');
  ok([dDispose, dClean].every((x) => get<T.Device>('devices', x.id)!.lifecycleState === 'Disposed'), 'disposed units are Disposed');
  ok(all<T.MaterialEvent>('materialEvents').filter((e) => e.kind === 'Disposed' && [l2.id, l3.id].includes(e.materialLineId)).length === 2, 'a "Disposed" event per line');
  ok(get<T.Device>('devices', dStock.id)!.lifecycleState === 'Retired', 'the stock unit is not disposed');
  // a later disposal on the same work order extends its certificate
  const more = all<T.Device>('devices').find((x) => x.rackId === rack.id && x.lifecycleState === 'Active' && !data().materialLines.some((l) => isLive(l) && l.status !== 'Returned' && l.deviceIds?.includes(x.id)));
  if (more) {
    const ml = mat.addRetired(woId, [more.id], 'Dispose')[0];
    mat.recordUsage(woId, [{ materialLineId: ml.id }]);
    const r2 = mat.returnParts(woId).find((r) => r.materialLineIds.includes(ml.id))!;
    mat.simulateSupplyProgress(r2.id, 'Completed');
    const c2 = get<T.DisposalCertificate>('disposalCertificates', cert!.id)!;
    ok(get<T.MaterialLine>('materialLines', ml.id)!.disposalCertificateId === cert!.id && c2.items.some((i) => i.deviceId === more.id) && c2.items.length === cert!.items.length + 1, 'a later disposal extends the same certificate');
  }
  sameLines(woId, 'at the end');
  ok(retiredOf(linesOfWorkOrder(data(), woId)).byDisposition['Return to vendor (RMA)'] === 1, 'retiredOf counts by disposition');
});

console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
