/* Smoke test for the estate model additions: seed invariants (rooms, liquid cooling and CDUs,
   collectors, GPU clusters, routing sessions, services across racks, tenancy, feeds, plant and
   sensors), the pure roll-ups in facility/lib/estateRules.ts, and the operations cockpit adapter
   reading the new records instead of inventing values.
   Run: npx tsx scripts/estate-model-smoke.mts   (exits non-zero when a check fails) */
import { buildSnapshot } from '../src/mock/db/seed.ts';
import { db as mdb, dbReady } from '../src/mock/db/index.ts';
import type * as T from '../src/mock/data/types.ts';
import { cduLoad, collectorCoverage, domainOfDevice, gpuClusterSummary, groupRoomsByType, holdsRacks, liquidRackIssues, plantOfSite, rackFeeds, roomsOfSite, siteAttributes, tenantRacksByCustomer } from '../src/modules/facility/lib/estateRules.ts';
import { buildModel } from '../src/ops/mock/model.ts';

let failures = 0; let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) { failures++; if (failures < 80) console.log(`  FAIL ${msg}`); } };
const section = async (name: string, fn: () => void | Promise<void>) => { console.log(`\n# ${name}`); const before = failures; try { await fn(); } catch (e) { failures++; console.log(`  FAIL threw: ${e instanceof Error ? e.stack : String(e)}`); } console.log(failures === before ? '  ok' : `  ${failures - before} failure(s)`); };

const t0 = performance.now();
const snap = buildSnapshot('small');
const buildMs = Math.round(performance.now() - t0);
const all = <X>(e: string) => (snap[e] ?? []) as unknown as X[];
const dcs = all<T.DataCenter>('dataCenters'), halls = all<T.Hall>('halls'), racks = all<T.Rack>('racks'), devices = all<T.Device>('devices');
const cdus = all<T.Cdu>('cdus'), sensors = all<T.EnvSensor>('envSensors'), collectors = all<T.Collector>('collectors'), clusters = all<T.GpuCluster>('gpuClusters');
const sessions = all<T.RoutingSession>('routingSessions'), plant = all<T.DcPlant>('dcPlants'), services = all<T.Service>('services'), customers = all<T.Customer>('customers');
const feeds = all<T.UtilityFeed>('utilityFeeds'), powerFeeds = all<T.PowerFeed>('powerFeeds'), ups = all<T.UPS>('upsUnits'), gens = all<T.Generator>('generators');
const managed = all<T.ManagedDevice>('managedDevices'), cables = all<T.Cable>('cables'), topo = all<T.TopologyLink>('topologyLinks'), modules = all<T.Module>('modules');
const byId = <X extends { id: string }>(arr: X[]) => new Map(arr.map((x) => [x.id, x]));
const hallById = byId(halls), rackById = byId(racks), devById = byId(devices), colById = byId(collectors), cduById = byId(cdus), custById = byId(customers), clusterById = byId(clusters);
const dcCode = new Map(dcs.map((d) => [d.id, d.code]));

await section('Seed: build and collections', () => {
  console.log(`  build ${buildMs} ms · snapshot ${Math.round(JSON.stringify(snap).length / 1024)} KB`);
  console.log(`  rooms ${halls.length} · CDUs ${cdus.length} · sensors ${sensors.length} · collectors ${collectors.length} · GPU clusters ${clusters.length} · routing sessions ${sessions.length} · DC plant ${plant.length}`);
  for (const k of ['gpuClusters', 'routingSessions', 'dcPlants', 'cdus', 'envSensors', 'collectors']) ok(Array.isArray(snap[k]) && snap[k].length > 0, `collection ${k} is exported and filled`);
  ok(buildMs < 2500, `seed builds in under 2.5 s (${buildMs} ms)`);
  const again = buildSnapshot('small');
  for (const k of ['gpuClusters', 'routingSessions', 'dcPlants', 'cdus', 'envSensors', 'collectors']) ok(JSON.stringify(again[k].map((r) => ({ ...r, createdAt: 0, updatedAt: 0 }))) === JSON.stringify(snap[k].map((r) => ({ ...r, createdAt: 0, updatedAt: 0 }))), `${k} is deterministic`);
});

await section('Sites', () => {
  for (const d of dcs) {
    ok(d.category && d.businessModel && d.timezone && d.designPue && d.coolingRedundancy && d.operatorName && d.address && d.city && d.state && d.country, `${d.code} has every site attribute`);
    ok(d.designPue && d.designPue >= 1.05 && d.designPue <= 2.2, `${d.code} design PUE in range (${d.designPue})`);
    ok(siteAttributes(d).length >= 6, `${d.code} siteAttributes lists the attributes`);
  }
  for (const m of ['colocation', 'neocloud', 'cloud', 'enterprise', 'network']) ok(dcs.some((d) => d.businessModel === m), `a site is ${m}`);
});

await section('Rooms', () => {
  for (const h of halls) ok(!!h.roomType, `${dcCode.get(h.dataCenterId)} ${h.name} has a room type`);
  for (const t of ['Data hall', 'AI hall', 'Meet-me room', 'Network room', 'Plant room', 'UPS room', 'Battery room', 'NOC'] as T.RoomType[]) ok(halls.some((h) => h.roomType === t), `some room is a ${t}`);
  for (const h of halls.filter((x) => !holdsRacks(x))) ok(!racks.some((r) => r.hallId === h.id), `${h.name} (${h.roomType}) holds no racks`);
  for (const r of racks) ok(holdsRacks(hallById.get(r.hallId) as T.Hall), `rack ${r.id} sits in a rack room`);
  const gpu = dcs.find((d) => d.dcTypeKey === 'ai-gpu-factory') as T.DataCenter;
  ok(roomsOfSite(halls, gpu.id, ['AI hall']).length >= 1, 'the GPU factory has AI halls');
  ok(groupRoomsByType(roomsOfSite(halls, gpu.id)).length >= 4, 'GPU factory rooms group into several types');
  for (const h of halls) ok(h.coolingMethod && h.containment, `${h.name} has cooling method and containment`);
});

await section('Racks: density, feeds, liquid cooling, tenancy', () => {
  const feedIds = new Set([...feeds.map((f) => f.id), ...powerFeeds.map((p) => p.id)]);
  for (const r of racks) {
    ok(r.density === 'standard' || r.density === 'ai', `${r.id} density`);
    ok(r.feedAId && feedIds.has(r.feedAId), `${r.id} A feed exists`);
    if (r.feedBId) ok(feedIds.has(r.feedBId), `${r.id} B feed exists`);
    const fs = rackFeeds(r, feeds, powerFeeds);
    ok(fs.every((f) => ('dataCenterId' in f.record ? f.record.dataCenterId === r.dataCenterId : rackById.get((f.record as T.PowerFeed).rackId ?? '')?.dataCenterId === r.dataCenterId)), `${r.id} feeds are on its site`);
    ok(typeof r.liquidCooled === 'boolean', `${r.id} liquidCooled set`);
    if (r.liquidCooled) {
      const c = cduById.get(r.cduId ?? '');
      ok(c && c.dataCenterId === r.dataCenterId, `${r.id} liquid rack has a CDU on its site`);
      ok(r.liquidCoolingReady, `${r.id} liquid rack is liquid-ready`);
    } else ok(!r.cduId, `${r.id} air rack has no CDU`);
    if (r.ownerKind === 'tenant') {
      ok(r.tenantCustomerId && custById.has(r.tenantCustomerId), `${r.id} tenant is a customer`);
      ok(r.contractedKw != null && r.contractedKw > 0 && r.contractedKw <= r.maxPowerKw, `${r.id} contracted ${r.contractedKw} kW ≤ budget ${r.maxPowerKw}`);
      ok(r.owner === custById.get(r.tenantCustomerId ?? '')?.name, `${r.id} owner names the tenant`);
    } else ok(!r.tenantCustomerId && r.contractedKw == null, `${r.id} operator rack has no tenant`);
  }
  ok(liquidRackIssues(racks, cdus).length === 0, 'no liquid rack issues');
  ok(racks.filter((r) => r.ownerKind === 'tenant').length > 50, 'multi-tenant sites lease racks');
  const colo = dcs.find((d) => d.dcTypeKey === 'retail-colo') as T.DataCenter;
  const tr = tenantRacksByCustomer(racks, customers, colo.id);
  ok(tr.length >= 5 && tr.every((t) => t.contractedKw > 0), `retail colo has ${tr.length} tenants with contracted power`);
  for (const d of dcs.filter((x) => !['retail-colo', 'wholesale-colo', 'carrier-hotel', 'ixp'].includes(x.dcTypeKey ?? ''))) ok(!racks.some((r) => r.dataCenterId === d.id && r.ownerKind === 'tenant'), `${d.code} single-operator site leases no racks`);
});

await section('CDUs', () => {
  for (const c of cdus) {
    const h = hallById.get(c.hallId ?? '');
    ok(h && h.dataCenterId === c.dataCenterId, `${c.name} sits in a hall of its site`);
    const L = cduLoad(c, racks);
    ok(L.racks.length > 0, `${c.name} feeds racks`);
    ok(L.drawKw <= c.capacityKw || /above/.test(c.notes ?? ''), `${c.name} capacity ${c.capacityKw} ≥ liquid load ${L.drawKw} or a recorded warning`);
    ok(c.nominalFlowLpm > 0, `${c.name} flow`);
    ok(L.racks.every((r) => r.hallId === c.hallId), `${c.name} racks are in its hall`);
  }
  const gpuDc = dcs.find((d) => d.dcTypeKey === 'ai-gpu-factory') as T.DataCenter;
  ok(cdus.filter((c) => c.dataCenterId === gpuDc.id).length >= 3, 'GPU factory has CDUs');
  ok(racks.filter((r) => r.dataCenterId === gpuDc.id && r.liquidCooled).length >= 50, 'GPU factory racks are liquid cooled');
});

await section('Devices, collectors and monitoring', () => {
  const md = byId(managed);
  for (const d of devices) {
    if (d.collectorId) { const c = colById.get(d.collectorId); ok(c && c.dataCenterId === d.dataCenterId, `${d.name} collector is on its site`); }
    if (d.monitored) ok(!!d.collectorId, `${d.name} monitored device has a collector`);
    if (d.ownerKind === 'tenant') { ok(!d.monitored && d.tenantCustomerId && custById.has(d.tenantCustomerId), `${d.name} tenant gear names a customer and is not polled`); ok(rackById.get(d.rackId ?? '')?.tenantCustomerId === d.tenantCustomerId, `${d.name} tenant matches its rack`); }
    const m = md.get(d.id);
    if (m) {
      ok(d.monitored, `${d.name} managed device is monitored`);
      const c = colById.get(d.collectorId ?? '');
      const want = /SNMP/.test(m.sourceSystem) ? ['Network'] : /Modbus/.test(m.sourceSystem) ? ['Facility'] : /Redfish/.test(m.sourceSystem) ? ['Compute'] : ['GPU', 'Compute'];
      ok(c && want.includes(c.domain), `${d.name} collector domain ${c?.domain} agrees with ${m.sourceSystem}`);
      ok(d.osVersion === m.osVersion, `${d.name} OS agrees with the NMS`);
    }
    if (d.category === 'GPU-Node') {
      ok(!!d.gpu && d.gpu.count > 0, `${d.name} GPU node has a gpu spec`);
      if (d.gpu?.clusterId) { const cl = clusterById.get(d.gpu.clusterId); ok(cl && cl.dataCenterId === d.dataCenterId, `${d.name} cluster exists on its site`); ok(cl?.gpuModel === d.gpu.model, `${d.name} GPU model matches its cluster`); }
    } else ok(!d.gpu, `${d.name} non-GPU device has no gpu spec`);
    if (d.networkLayer) ok(typeof d.wanEdge === 'boolean', `${d.name} wanEdge set on network kit`);
  }
  ok(devices.filter((d) => d.wanEdge).length >= 15, 'border / PE routers are WAN edge');
  ok(devices.filter((d) => d.macAddress).length > devices.length * 0.8, 'most devices carry their base MAC');
  for (const d of dcs) {
    const cols = collectors.filter((c) => c.dataCenterId === d.id);
    ok(cols.some((c) => c.domain === 'Network') && cols.some((c) => c.domain === 'Facility'), `${d.code} has network and facility collectors`);
    const cov = collectorCoverage(d.id, devices, collectors);
    ok(cov.devices > 0 && cov.monitored + cov.unmonitored === cov.devices, `${d.code} coverage adds up (${cov.monitored}/${cov.devices}, ${cov.pct}%)`);
    ok(cov.byCollector.reduce((a, x) => a + x.devices, 0) <= cov.devices, `${d.code} per-collector counts within scope`);
  }
  for (const p of ['SNMP', 'gNMI', 'Modbus TCP', 'BACnet', 'Redfish', 'DCGM exporter']) ok(collectors.some((c) => c.protocol === p), `a ${p} collector exists`);
  ok(devices.filter((d) => domainOfDevice(d) === 'GPU').length > 100, 'GPU domain devices');
  ok(modules.every((m) => !!m.serial), 'every module has a serial');
});

await section('GPU clusters', () => {
  for (const c of clusters) {
    const s = gpuClusterSummary(c, devices);
    ok(s.nodeCount >= 2 && s.gpus === s.nodeCount * 8, `${c.name} has nodes (${s.nodeCount}) and GPUs (${s.gpus})`);
    ok(!c.hallId || hallById.get(c.hallId)?.dataCenterId === c.dataCenterId, `${c.name} hall on its site`);
    ok(s.rackIds.every((id) => rackById.get(id)?.hallId === c.hallId), `${c.name} nodes are in its hall`);
  }
  ok(clusters.some((c) => c.cooling === 'liquid') && clusters.some((c) => c.scheduler === 'Slurm') && clusters.some((c) => c.scheduler === 'Kubernetes'), 'cluster variety (liquid, Slurm, Kubernetes)');
});

await section('Cables and routing sessions', () => {
  const topoPairs = new Set(topo.map((t) => [t.aDeviceId, t.zDeviceId].sort().join('|')));
  for (const s of sessions) {
    const A = devById.get(s.aDeviceId), Z = devById.get(s.zDeviceId);
    ok(A && Z, `${s.id} ends exist`);
    ok(A?.dataCenterId === s.dataCenterId && Z?.dataCenterId === s.dataCenterId, `${s.id} ends on its site`);
    if (s.protocol !== 'BGP' || s.role !== 'Peering') ok(topoPairs.has([s.aDeviceId, s.zDeviceId].sort().join('|')), `${s.id} ${s.protocol} rides a discovered link`);
  }
  for (const p of ['BGP', 'OSPF', 'ISIS']) ok(sessions.some((s) => s.protocol === p), `a ${p} session exists`);
  ok(sessions.some((s) => s.state === 'Down'), 'a session is down');
  const data = cables.filter((c) => !c.cableType.startsWith('Power'));
  ok(data.filter((c) => c.role).length === data.length, 'every data cable has a role');
  ok(data.filter((c) => c.capacityMbps).length > data.length * 0.9, 'data cables carry capacity');
  ok(cables.some((c) => c.strand && c.aPatchPort && c.bPatchPort), 'trunk fibres carry strand and ODF ports');
  ok(cables.some((c) => c.carrierCircuitId), 'a cable names its carrier circuit');
});

await section('Services', () => {
  for (const s of services) {
    ok(s.currency && s.startDate && /^\d{4}-\d{2}-\d{2}$/.test(s.startDate), `${s.id} start date and currency`);
    if (s.rackIds) { ok(s.rackIds.every((id) => rackById.get(id)?.dataCenterId === s.dataCenterId), `${s.id} racks exist on its site`); if (s.rackId) ok(s.rackIds.includes(s.rackId), `${s.id} rackIds include rackId`); }
  }
  ok(services.filter((s) => (s.rackIds?.length ?? 0) > 1).length >= 3, 'some services span several racks');
});

await section('Plant and sensors', () => {
  for (const f of feeds) ok(f.supply && f.ratingText && f.currentA && f.normalRole && f.utilityAccount, `${f.id} feed detail`);
  for (const u of ups) { ok(u.serial, `${u.id} serial`); const h = hallById.get(u.hallId ?? ''); ok(h && h.dataCenterId === u.dataCenterId, `${u.name} sits in a room of its site`); }
  for (const g of gens) ok(g.fuelTankLitres && g.lastTestDate && g.lastTestResult, `${g.id} fuel and test`);
  ok(gens.some((g) => g.lastTestResult === 'Fail'), 'a generator failed its last test');
  const overdue = gens.filter((g) => g.lastTestDate && Date.now() - new Date(g.lastTestDate).getTime() > 30 * 864e5);
  ok(overdue.length >= 2 && overdue.length <= 4 && overdue.every((g) => g.lastTestResult === 'Pass'), `a few generators are overdue their monthly test (${overdue.length})`);
  for (const p of plant) { const h = hallById.get(p.hallId ?? ''); ok(h && h.dataCenterId === p.dataCenterId && ['Plant room', 'Battery room'].includes(h.roomType ?? ''), `${p.name} in a plant/battery room of its site`); }
  for (const d of dcs.filter((x) => ['central-office', 'mtso'].includes(x.dcTypeKey ?? ''))) {
    const ps = plantOfSite(d.id, { utilityFeeds: feeds, upsUnits: ups, generators: gens, dcPlants: plant });
    ok(ps.dcPlant && ps.rectifiers.length && ps.batteries.length && ps.rectifierUsableKw > 0 && ps.batteryAutonomyH >= 2, `${d.code} has a −48 V plant (${ps.rectifiers.length} rectifiers, ${ps.batteryAutonomyH} h)`);
  }
  for (const s of sensors) {
    const h = hallById.get(s.hallId ?? '');
    ok(h && h.dataCenterId === s.dataCenterId, `${s.name} in a room of its site`);
    if (s.rackId) ok(rackById.get(s.rackId)?.hallId === s.hallId, `${s.name} rack in its room`);
    if (s.collectorId) ok(colById.get(s.collectorId)?.dataCenterId === s.dataCenterId, `${s.name} collector on its site`);
  }
  for (const c of cdus) ok(sensors.some((s) => s.kind === 'Leak' && s.hallId === c.hallId && s.position?.includes(c.name)), `leak sensor under ${c.name}`);
  for (const h of halls.filter((x) => x.dataCenterId && x.status !== 'Shell')) ok(sensors.some((s) => s.hallId === h.id), `${dcCode.get(h.dataCenterId)} ${h.name} has sensors`);
});

await section('Operations adapter reads the records', async () => {
  await dbReady;
  ok(mdb.getAllRaw('collectors').length === collectors.length, 'mock DB holds the new collections');
  const ops = buildModel('network');
  const opsDc = new Map(ops.datacenters.map((d) => [d.id, d]));
  const devRec = new Map((mdb.getAllRaw('devices') as unknown as T.Device[]).map((d) => [d.id, d]));
  for (const d of mdb.getAllRaw('dataCenters') as unknown as T.DataCenter[]) {
    const o = opsDc.get(d.id); if (!o) { ok(false, `${d.code} in ops`); continue; }
    const g = (mdb.getAllRaw('generators') as unknown as T.Generator[]).filter((x) => x.dataCenterId === d.id);
    if (g.length) { ok(o.power.dg.units === g.length, `${d.code} generator count = generators table (${g.length})`); ok(o.power.dg.kva === g.reduce((a, x) => a + x.capacityKva, 0), `${d.code} DG kVA = generators`); ok(o.power.dg.tankLitres === g.reduce((a, x) => a + (x.fuelTankLitres ?? 0), 0), `${d.code} tank litres`); }
    ok(o.state === d.state && o.address === d.address && o.category === d.category && o.city === d.city, `${d.code} state, address, category and city from the record`);
    ok(o.power.pue === d.designPue, `${d.code} PUE is the design PUE`);
    ok(o.cooling.redundancy === d.coolingRedundancy, `${d.code} cooling redundancy from the record`);
    const cols = (mdb.getAllRaw('collectors') as unknown as T.Collector[]).filter((c) => c.dataCenterId === d.id);
    ok(o.collectors.length === cols.length && o.collectors.every((c) => cols.some((x) => x.id === c.id && x.name === c.name)), `${d.code} collectors are the Collector records`);
    ok(o.collectors.filter((c) => c.state === 'stale').length === cols.filter((c) => c.status === 'Degraded').length, `${d.code} stale collectors = degraded records`);
    const sns = (mdb.getAllRaw('envSensors') as unknown as T.EnvSensor[]).filter((s) => s.dataCenterId === d.id);
    ok(o.cooling.sensorCount === sns.length && o.cooling.sensors.length === new Set(sns.map((s) => s.hallId)).size, `${d.code} sensors from EnvSensor records (${sns.length} in ${o.cooling.sensors.length} rooms)`);
    const banks = (mdb.getAllRaw('dcPlants') as unknown as T.DcPlant[]).filter((p) => p.dataCenterId === d.id && p.kind === 'Battery bank');
    if (banks.length) { ok(o.power.battery.ah === banks.reduce((a, b) => a + (b.ah ?? 0), 0), `${d.code} battery Ah from banks`); ok(o.power.feeds.some((f) => f.type === 'DC'), `${d.code} DC feeds from rectifiers`); ok(o.power.plant?.rectifiers, `${d.code} plant counts`); }
    for (const r of o.racks) { const rec = rackById.get(r.id); if (rec?.ownerKind) { ok(r.owner === rec.ownerKind && r.tenantId === rec.tenantCustomerId && r.contractedKw === rec.contractedKw, `${r.name} owner/tenant/contract from the record`); } }
  }
  let macs = 0, pes = 0, tenants = 0;
  for (const n of ops.nes) {
    const d = devRec.get(n.id); if (!d) continue;
    if (d.macAddress) { macs++; ok(n.mac === d.macAddress, `${n.name} MAC from the record`); }
    if (d.wanEdge !== undefined) { pes++; ok(n.isPe === d.wanEdge, `${n.name} isPe = wanEdge`); }
    if (d.ownerKind === 'tenant') { tenants++; ok(n.role === 'Tenant gear' && n.tenantId === d.tenantCustomerId, `${n.name} tenant gear with its tenant`); }
    if (d.collectorId && n.discovery !== 'not-discovered') ok(n.collector === colById.get(d.collectorId)?.name && n.collectorId === d.collectorId, `${n.name} collector from the record`);
    if (d.monitored === false && n.role !== 'Tenant gear') ok(n.discovery === 'not-discovered', `${n.name} unmonitored device not discovered`);
    if (d.gpu) ok(n.gpu?.model === d.gpu.model, `${n.name} GPU spec passed through`);
  }
  ok(macs > 1000 && pes > 50 && tenants > 300, `ops NEs read MAC (${macs}), WAN edge (${pes}) and tenancy (${tenants})`);
  const mods = ops.nes.filter((n) => n.modules.some((m) => /^Slot-/.test(m.slot)));
  ok(mods.length > 10 && mods.every((n) => n.modules.filter((m) => /^Slot-/.test(m.slot)).every((m) => m.serial !== '—')), `line-card modules come from Module records with serials (${mods.length} routers)`);
  ok(!ops.nes.some((n) => n.modules.some((m) => /^Slot \d+$/.test(m.slot))), 'no synthesised "Slot n" modules');
  const lldp = ops.links.filter((l) => l.protocol === 'LLDP' && l.id.startsWith('LNK-CBL'));
  const cab = byId(cables);
  for (const l of lldp) { const c = cab.get(l.id.slice(4)); if (c?.strand) ok(l.physical?.strand === c.strand && l.physical?.aPort === (c.aPatchPort ?? l.physical?.aPort), `${l.id} strand and patch port from the cable`); }
  const rsLinks = ops.links.filter((l) => l.protocol !== 'LLDP' && (l.id.includes('LNK-RS-') || sessions.some((s) => l.aNe === s.aDeviceId && l.zNe === s.zDeviceId)));
  ok(rsLinks.length >= sessions.length * 0.8, `routing adjacencies come from RoutingSession records (${rsLinks.length} for ${sessions.length} sessions)`);
  ok(ops.links.some((l) => l.id.startsWith('LNK-RS-') && l.protocol === 'BGP' && l.role === 'Peering'), 'iBGP core sessions appear as links');
  const svc = ops.services.filter((s) => (s.rackIds?.length ?? 0) > 1);
  ok(svc.length >= 3 && ops.services.every((s) => s.currency && s.startDate), 'ops services carry rackIds, start date and currency');
  ok(ops.services.some((s) => s.gpuNodeIds?.length), 'GPU services list their GPU nodes');
});

console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
