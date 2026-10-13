/* Smoke test for the NeoCloud import (src/mock/datasets/dcoImport.ts): record counts reconcile with the two
   workbooks, every reference resolves, no id is used twice across demo + import, the demo records are untouched,
   merging twice gives the same snapshot, the automatic fixes hold (timezones, names, ids, currency, customers),
   and the operations cockpit adapter lists all 63 sites with coordinates.
   Run: npx tsx scripts/neocloud-import-smoke.mts   (exits non-zero when a check fails) */
import { buildSnapshot } from '../src/mock/db/seed.ts';
import { loadNeoCloudDatasetsSync } from '../src/mock/datasets/neocloudNode.ts';
import { mergeNeoCloud, NEOCLOUD_FILES } from '../src/mock/datasets/neocloud.ts';
import { INR_PER_USD, type DcoDataset, type Snapshot } from '../src/mock/datasets/dcoImport.ts';
import type * as T from '../src/mock/data/types.ts';

let failures = 0; let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) { failures++; if (failures < 80) console.log(`  FAIL ${msg}`); } };
const section = async (name: string, fn: () => void | Promise<void>) => { console.log(`\n# ${name}`); const before = failures; try { await fn(); } catch (e) { failures++; console.log(`  FAIL threw: ${e instanceof Error ? e.stack : String(e)}`); } console.log(failures === before ? '  ok' : `  ${failures - before} failure(s)`); };

/* ── build ── */
const t0 = performance.now();
const demo = buildSnapshot('small') as Snapshot;
const t1 = performance.now();
const data = loadNeoCloudDatasetsSync();
const t2 = performance.now();
const { snapshot: snap, reports } = mergeNeoCloud(demo, data);
const t3 = performance.now();
const all = <X>(e: string) => (snap[e] ?? []) as unknown as X[];
const byId = <X extends { id: string }>(arr: X[]) => new Map(arr.map((x) => [x.id, x]));
const rows = (ds: DcoDataset, sheet: string) => { const s = ds.sheets[sheet]; return s.rows.map((r) => Object.fromEntries(s.cols.map((c, i) => [c, r[i]]))) as Record<string, unknown>[]; };
const both = (sheet: string) => rows(data.us, sheet).length + rows(data.in, sheet).length;
const imported = <X extends T.BaseEntity>(e: string) => all<X>(e).filter((x) => x.extRef?.source?.startsWith('NeoCloud'));

const dcs = all<T.DataCenter>('dataCenters'), ncDcs = imported<T.DataCenter>('dataCenters');
const halls = all<T.Hall>('halls'), rowsC = all<T.Row>('rows'), racks = all<T.Rack>('racks'), devices = all<T.Device>('devices'), comps = all<T.DeviceComponent>('deviceComponents');
const cables = all<T.Cable>('cables'), sessions = all<T.RoutingSession>('routingSessions'), topo = all<T.TopologyLink>('topologyLinks'), clusters = all<T.GpuCluster>('gpuClusters');
const services = all<T.Service>('services'), customers = all<T.Customer>('customers'), cdus = all<T.Cdu>('cdus'), cracs = all<T.CRAC>('cracUnits'), zones = all<T.CoolingZone>('coolingZones');
const feeds = all<T.UtilityFeed>('utilityFeeds'), ups = all<T.UPS>('upsUnits'), sensors = all<T.EnvSensor>('envSensors'), collectors = all<T.Collector>('collectors');
const floors = all<T.Floor>('floors'), buildings = all<T.Building>('buildings'), campuses = all<T.Campus>('campuses'), regions = all<T.Region>('regions');
const inv = all<T.InventoryItem>('inventoryItems'), managed = all<T.ManagedDevice>('managedDevices'), nmsIf = all<T.Interface>('interfaces');
const alarms = all<T.Alarm>('alarms'), incidents = all<T.Incident>('incidents'), changes = all<T.ChangeRequest>('changeRequests'), mws = all<T.MaintenanceWindow>('maintenanceWindows'), steps = all<T.ApprovalStep>('approvalSteps');
const dcById = byId(dcs), hallById = byId(halls), rowById = byId(rowsC), rackById = byId(racks), devById = byId(devices), compById = byId(comps), custById = byId(customers);
const cduById = byId(cdus), zoneById = byId(zones), feedById = byId(feeds), colById = byId(collectors), clusterById = byId(clusters), floorById = byId(floors), bldById = byId(buildings);
const campusById = byId(campuses), regionById = byId(regions), incById = byId(incidents), alarmById = byId(alarms), chgById = byId(changes), nmsIfById = byId(nmsIf);
const typeById = byId(all<T.DcimDeviceType>('deviceTypes')), roleById = byId(all<T.DeviceRoleEntity>('deviceRoles')), platById = byId(all<T.PlatformEntity>('platforms')), iirById = byId(all<T.InventoryItemRole>('inventoryItemRoles'));

await section('Build and size', () => {
  const recs = Object.values(snap).reduce((a, x) => a + x.length, 0), demoRecs = Object.values(demo).reduce((a, x) => a + x.length, 0);
  console.log(`  demo ${Math.round(t1 - t0)} ms · read workbooks ${Math.round(t2 - t1)} ms · merge ${Math.round(t3 - t2)} ms (${reports.map((r) => `${r.source.split(' ')[1]} ${r.ms} ms`).join(', ')})`);
  console.log(`  records: demo ${demoRecs.toLocaleString('en-US')} → with NeoCloud ${recs.toLocaleString('en-US')}`);
  ok(t3 - t2 < 3000, `merge of both workbooks under 3 s (${Math.round(t3 - t2)} ms)`);
  ok(reports.length === 2 && reports.every((r) => r.sheets.length === 23), 'both reports cover the 23 sheets');
});

await section('Counts reconcile with the workbooks', () => {
  ok(ncDcs.length === 48 && dcs.length === 63, `48 imported sites, 63 in total (${ncDcs.length}, ${dcs.length})`);
  const exp: [string, string, number][] = [
    ['dataCenters', 'Sites', both('Sites')], ['floors', 'Floors', both('Floors')], ['halls', 'Rooms', both('Rooms')], ['coolingZones', 'Rooms', both('Rooms')],
    ['racks', 'Racks', both('Racks')], ['utilityFeeds', 'Power_Feeds', both('Power_Feeds')], ['upsUnits', 'UPS', both('UPS')], ['generators', 'Generators', both('Generators')],
    ['dcPlants', 'DC_Plant', both('DC_Plant')], ['cracUnits', 'Cooling_Units', both('Cooling_Units')], ['cdus', 'CDUs', both('CDUs')], ['envSensors', 'Sensors', both('Sensors')],
    ['devices', 'Devices', both('Devices')], ['inventoryItems', 'Modules', both('Modules')], ['deviceComponents', 'Interfaces', both('Interfaces')],
    ['gpuClusters', 'GPU_Clusters', both('GPU_Clusters')], ['services', 'Services', both('Services')], ['collectors', 'Collectors', both('Collectors')],
    ['alarms', 'Snapshot_Alerts', both('Snapshot_Alerts')], ['incidents', 'Snapshot_Incidents', both('Snapshot_Incidents')], ['changeRequests', 'Snapshot_Changes', both('Snapshot_Changes')],
  ];
  for (const [coll, sheet, n] of exp) ok(imported(coll).length === n, `${coll}: ${imported(coll).length} imported = ${n} rows of ${sheet}`);
  ok(imported('racks').length === 1445, `1,445 racks (${imported('racks').length})`);
  ok(imported('devices').length === 7678, `7,678 devices (${imported('devices').length})`);
  const links = [...rows(data.us, 'Links'), ...rows(data.in, 'Links')];
  const lldp = links.filter((l) => l.protocol === 'LLDP').length;
  ok(imported('cables').length === lldp, `cables = LLDP links (${imported('cables').length} / ${lldp})`);
  ok(imported('routingSessions').length === links.length - lldp, `routing sessions = BGP/OSPF/ISIS/LSP links (${imported('routingSessions').length} / ${links.length - lldp})`);
  ok(imported('customers').length === 13, `13 customers: 11 shared by both estates + CUST-2073 + IN-CUST-2073 (${imported('customers').length})`);
  ok(imported('buildings').length === 48, 'one building per site');
  ok(imported('computeResources').length === 48, 'a GPU compute roll-up per site');
  ok(imported('maintenanceWindows').length === [...rows(data.us, 'Snapshot_Changes'), ...rows(data.in, 'Snapshot_Changes')].filter((c) => c.kind === 'Maintenance').length, 'a maintenance window per Maintenance change');
  const gpuRole = [...rows(data.us, 'Devices'), ...rows(data.in, 'Devices')].filter((d) => d.role === 'GPU').length;
  const gpuDevs = imported<T.Device>('devices').filter((d) => d.category === 'GPU-Node');
  ok(gpuDevs.length === gpuRole && gpuDevs.every((d) => d.gpu && d.gpu.count > 0 && d.gpu.model), `every GPU server carries a GPU spec (${gpuDevs.length})`);
  ok(gpuDevs.filter((d) => !d.gpu?.clusterId).length === 230, `230 GPU servers without a GPU_Nodes row have no cluster (${gpuDevs.filter((d) => !d.gpu?.clusterId).length})`);
  ok(imported('managedDevices').length > 0 && imported<T.ManagedDevice>('managedDevices').every((m) => devById.get(m.id)?.monitored), 'managed devices are the monitored network gear');
});

await section('Every reference resolves', () => {
  let bad = 0; const fail = (c: unknown, m: string) => { if (!c) { bad++; if (bad < 25) ok(false, m); } };
  for (const d of ncDcs) { const c = campusById.get(d.campusId); fail(c && regionById.get(c.regionId), `${d.id} → campus → region`); }
  for (const b of imported<T.Building>('buildings')) fail(dcById.has(b.dataCenterId), `${b.id} → site`);
  for (const f of imported<T.Floor>('floors')) fail(bldById.has(f.buildingId), `${f.id} → building`);
  for (const h of imported<T.Hall>('halls')) { fail(floorById.has(h.floorId) && dcById.has(h.dataCenterId), `${h.id} → floor/site`); fail(h.coolingZoneId && zoneById.has(h.coolingZoneId), `${h.id} → cooling zone`); fail(h.roomType, `${h.id} room type`); }
  for (const r of imported<T.Row>('rows')) fail(hallById.has(r.hallId), `${r.id} → hall`);
  for (const r of imported<T.Rack>('racks')) {
    const h = hallById.get(r.hallId), row = rowById.get(r.rowId);
    fail(h && h.dataCenterId === r.dataCenterId, `${r.id} → hall of its site`);
    fail(row && row.hallId === r.hallId, `${r.id} → row in its hall`);
    fail(h && r.gridX >= 0 && r.gridX < h.gridCols && r.gridY >= 0 && r.gridY < h.gridRows, `${r.id} on the hall grid`);
    fail(r.coolingZoneId && zoneById.has(r.coolingZoneId), `${r.id} → cooling zone`);
    fail(!r.cduId || (cduById.get(r.cduId)?.hallId === r.hallId), `${r.id} → CDU in its hall`);
    fail(!r.liquidCooled || r.cduId, `${r.id} liquid-cooled racks name their CDU`);
    fail((!r.feedAId || feedById.has(r.feedAId)) && (!r.feedBId || feedById.has(r.feedBId)), `${r.id} → A/B feeds`);
    fail(r.currentPowerKw <= r.maxPowerKw && r.usedU <= r.heightU, `${r.id} draw within budget and U within height`);
  }
  const gridKey = new Set<string>(); for (const r of imported<T.Rack>('racks')) { const k = `${r.hallId}|${r.gridX}|${r.gridY}`; fail(!gridKey.has(k), `${r.id} grid position unique`); gridKey.add(k); }
  for (const d of imported<T.Device>('devices')) {
    const rk = d.rackId ? rackById.get(d.rackId) : undefined;
    fail(rk && rk.dataCenterId === d.dataCenterId, `${d.id} → rack at its site`);
    fail(typeById.has(d.deviceTypeId) && typeById.get(d.deviceTypeId)?.uHeight === d.heightU, `${d.id} → device type with its U height`);
    fail(d.deviceRoleId && roleById.has(d.deviceRoleId) && d.platformId && platById.has(d.platformId), `${d.id} → role and platform`);
    fail(!d.collectorId || colById.get(d.collectorId)?.dataCenterId === d.dataCenterId, `${d.id} → collector at its site`);
    fail(!d.gpu?.clusterId || clusterById.get(d.gpu.clusterId)?.dataCenterId === d.dataCenterId, `${d.id} → GPU cluster at its site`);
    fail(d.position != null && rk && d.position + (d.heightU ?? 1) - 1 <= rk.heightU, `${d.id} fits its rack`);
  }
  const occupied = new Set<string>(); for (const d of imported<T.Device>('devices')) for (let u = d.position ?? 0; u < (d.position ?? 0) + (d.heightU ?? 1); u++) { const k = `${d.rackId}|${u}`; fail(!occupied.has(k), `${d.id} U${u} not double-booked`); occupied.add(k); }
  for (const c of imported<T.DeviceComponent>('deviceComponents')) fail(devById.has(c.deviceId), `${c.id} → device`);
  for (const c of imported<T.Cable>('cables')) { const a = compById.get(c.aComponentId), b = compById.get(c.bComponentId); fail(a && b && a.deviceId === c.aDeviceId && b.deviceId === c.bDeviceId, `${c.id} → both components on the right devices`); }
  for (const t of imported<T.TopologyLink>('topologyLinks')) fail(devById.has(t.aDeviceId) && devById.has(t.zDeviceId), `${t.id} → devices`);
  for (const s of imported<T.RoutingSession>('routingSessions')) fail(devById.has(s.aDeviceId) && devById.has(s.zDeviceId) && dcById.has(s.dataCenterId ?? ''), `${s.id} → devices and site`);
  for (const g of imported<T.GpuCluster>('gpuClusters')) fail(dcById.has(g.dataCenterId) && (!g.hallId || hallById.get(g.hallId)?.dataCenterId === g.dataCenterId), `${g.id} → site and hall`);
  for (const s of imported<T.Service>('services')) {
    fail(custById.has(s.customerRef), `${s.id} → customer`);
    fail(dcById.has(s.dataCenterId) && (!s.deviceId || devById.has(s.deviceId)), `${s.id} → site and device`);
    fail(s.pathDeviceIds.every((x) => devById.has(x)) && (s.rackIds ?? []).every((x) => rackById.has(x)) && (s.rackIds ?? []).length > 0, `${s.id} → racks and path devices`);
  }
  for (const c of imported<T.Cdu>('cdus')) fail(hallById.get(c.hallId ?? '')?.dataCenterId === c.dataCenterId && c.coolingZoneId && zoneById.has(c.coolingZoneId), `${c.id} → hall and zone`);
  for (const c of imported<T.CRAC>('cracUnits')) fail(zoneById.has(c.coolingZoneId), `${c.id} → cooling zone`);
  for (const u of imported<T.UPS>('upsUnits')) fail(dcById.has(u.dataCenterId) && (!u.feedId || feedById.has(u.feedId)), `${u.id} → site and feed`);
  for (const s of imported<T.EnvSensor>('envSensors')) fail(hallById.get(s.hallId ?? '')?.dataCenterId === s.dataCenterId, `${s.id} → room`);
  for (const i of imported<T.InventoryItem>('inventoryItems')) fail(devById.has(i.deviceId) && (!i.roleId || iirById.has(i.roleId)), `${i.id} → device and role`);
  for (const m of imported<T.ManagedDevice>('managedDevices')) fail(devById.has(m.id), `${m.id} managed → device`);
  for (const f of imported<T.Interface>('interfaces')) fail(devById.has(f.deviceId) && compById.has(`${f.deviceId}:${f.name}`), `${f.id} → device and component`);
  for (const a of imported<T.Alarm>('alarms')) {
    fail(a.deviceId ? devById.has(a.deviceId) : !!a.nodeName, `${a.id} → device, or the node name when the node is outside the inventory`);
    fail(dcById.has(a.dataCenterId ?? ''), `${a.id} → site`);
    fail(!a.interfaceId || nmsIfById.has(a.interfaceId), `${a.id} → interface`);
    fail(!a.incidentId || incById.has(a.incidentId), `${a.id} → incident`);
  }
  for (const i of imported<T.Incident>('incidents')) fail((i.linkedAlarmIds ?? []).every((x) => alarmById.get(x)?.incidentId === i.id) && i.affectedResourceIds.every((x) => devById.has(x) || rackById.has(x)) && dcById.has(i.dataCenterId ?? ''), `${i.id} → alarms, devices or racks, site`);
  for (const c of imported<T.ChangeRequest>('changeRequests')) fail(c.affectedResourceIds.every((x) => devById.has(x)) && dcById.has(c.dataCenterId ?? ''), `${c.id} → devices and site`);
  for (const m of mws.filter((x) => x.extRef)) fail(chgById.has(m.changeRequestId ?? ''), `${m.id} → change`);
  for (const s of steps.filter((x) => x.extRef)) fail(chgById.has(s.changeRequestId), `${s.id} → change`);
  ok(bad === 0, `all references resolve (${bad} broken)`);
});

await section('Ids: unique across demo + import, demo untouched, extRef on every imported record', () => {
  for (const [k, list] of Object.entries(snap)) { const ids = new Set(list.map((r) => r.id)); ok(ids.size === list.length, `${k}: ${list.length - ids.size} duplicate ids`); }
  for (const [k, list] of Object.entries(demo)) { const m = new Map((snap[k] ?? []).map((r) => [r.id, r])); ok(list.every((r) => m.get(r.id as string) === r), `${k}: every demo record kept as is`); }
  // Shared catalogue records (enterprise, manufacturers, device types, roles, customers) carry the extRef of the workbook that created them.
  const written = new Map<string, number>(); for (const r of reports) for (const [k, n] of Object.entries(r.collections)) written.set(k, Math.max(written.get(k) ?? 0, n));
  for (const [k, n] of written) ok(imported(k).length >= n, `${k}: ${imported(k).length} records carry a NeoCloud extRef (≥ ${n} written by one workbook)`);
  ok(imported('devices').every((d) => (d as T.BaseEntity).extRef?.id === d.id), 'extRef.id is the workbook id');
  ok(imported<T.Cable>('cables').every((c) => /^(US|IN)-LNK-/.test(c.id) && c.extRef?.id === c.id.slice(3)), 'cable ids are the link ids with US-/IN- (original in extRef.id)');
  ok(imported<T.Service>('services').every((s) => /^(US|IN)-SVC-/.test(s.id)), 'service ids prefixed US-/IN-');
  ok(imported<T.Incident>('incidents').every((s) => /^(US|IN)-INC-/.test(s.id)) && imported<T.Alarm>('alarms').every((s) => /^(US|IN)-ALM-/.test(s.id)) && imported<T.ChangeRequest>('changeRequests').every((s) => /^(US|IN)-CHG-/.test(s.id)), 'alert, incident and change ids prefixed US-/IN-');
  ok(devById.has('VA-DC-001-BDR-01') && devById.has('MH-DC-001-BDR-01') && rackById.has('VA-DC-001-RACK-A') && dcById.has('MH-DC-001'), 'workbook ids kept for sites, racks and devices');
});

await section('Idempotent', () => {
  const again = mergeNeoCloud(snap, loadNeoCloudDatasetsSync()).snapshot;
  for (const k of Object.keys(snap)) {
    const a = again[k] ?? [], b = snap[k];
    ok(a.length === b.length && a.every((r, i) => r === b[i] || JSON.stringify(r) === JSON.stringify(b[i])), `${k} unchanged by a second merge`);
  }
  const fresh = mergeNeoCloud(buildSnapshot('small') as Snapshot, loadNeoCloudDatasetsSync()).snapshot;
  for (const k of ['dataCenters', 'racks', 'devices', 'cables', 'services', 'customers', 'alarms']) ok(JSON.stringify((fresh[k] ?? []).filter((x) => (x as T.BaseEntity).extRef)) === JSON.stringify(snap[k].filter((x) => (x as T.BaseEntity).extRef)), `${k}: imported records deterministic across runs`);
});

await section('Automatic fixes', () => {
  const tz: Record<string, string> = { Virginia: 'America/New_York', Texas: 'America/Chicago', California: 'America/Los_Angeles', Washington: 'America/Los_Angeles', Arizona: 'America/Phoenix', Colorado: 'America/Denver', Utah: 'America/Denver', Illinois: 'America/Chicago', Oregon: 'America/Los_Angeles' };
  for (const d of ncDcs) {
    if (d.country === 'India') ok(d.timezone === 'Asia/Kolkata', `${d.id} India → Asia/Kolkata`);
    else if (tz[d.state ?? '']) ok(d.timezone === tz[d.state ?? ''], `${d.id} ${d.state} → ${tz[d.state ?? '']} (${d.timezone})`);
    ok(d.name === `${d.city} ${d.code}`, `${d.id} named "<city> <code>" (${d.name})`);
    ok(d.operatorName === 'NeoCloud' && d.businessModel === 'neocloud' && d.latitude && d.longitude, `${d.id} operator, business model, coordinates`);
  }
  ok(dcById.get('WA-DC-024')?.timezone === 'America/Los_Angeles', 'WA-DC-024 (Seattle) moved off America/New_York');
  ok(dcById.get('WA-DC-013')?.status === 'Planned' && dcById.get('GJ-DC-013')?.status === 'Planned', 'the 10 kW planned sites are imported as Planned');
  ok(reports.every((r) => r.warnings.some((w) => w.code === 'PLANNED_SITE_TINY')), 'the 10 kW planned sites are reported');
  const purposes = new Set(imported<T.Rack>('racks').map((r) => r.purpose));
  ok([...purposes].every((p) => ['Compute', 'Storage', 'Network', 'GPU', 'Mixed'].includes(p)), `rack purposes within the enum (${[...purposes].join(', ')})`);
  ok(imported<T.Rack>('racks').filter((r) => /Workbook role: (Access|ODF \/ patching|Core)/.test(r.notes ?? '')).every((r) => r.purpose === 'Network'), 'Access, Core and ODF / patching racks recorded as Network');
  ok(imported<T.Device>('devices').every((d) => d.manufacturer && d.manufacturer !== d.manufacturer.toUpperCase() || ['NVIDIA', 'DDN', 'WEKA'].includes(d.manufacturer ?? '')), 'vendor names in catalogue spelling');
});

await section('Customers and currency', () => {
  ok(custById.get('CUST-2073')?.name === 'State University System' && custById.get('IN-CUST-2073')?.name === 'University Consortium', 'CUST-2073 differs between estates: India gets IN-CUST-2073');
  const usSvc = imported<T.Service>('services').filter((s) => s.id.startsWith('US-')), inSvc = imported<T.Service>('services').filter((s) => s.id.startsWith('IN-'));
  ok(usSvc.length && usSvc.every((s) => s.currency === 'USD'), 'US services in USD');
  ok(inSvc.length && inSvc.every((s) => s.currency === 'INR'), 'India services in INR');
  const shared = imported<T.Customer>('customers').filter((c) => usSvc.some((s) => s.customerRef === c.id) && inSvc.some((s) => s.customerRef === c.id));
  ok(shared.length === 11, `11 customers hold services in both estates (${shared.length})`);
  for (const c of imported<T.Customer>('customers')) {
    const usd = services.filter((s) => s.customerRef === c.id && s.extRef && s.status !== 'Disabled').reduce((a, s) => a + s.revenueMonthly * (s.currency === 'INR' ? 1 / INR_PER_USD : 1), 0);
    ok(Math.abs(c.revenueMonthly - Math.round(usd)) <= 1, `${c.id} revenue = USD + INR/${INR_PER_USD} (${c.revenueMonthly} vs ${Math.round(usd)})`);
  }
  ok(imported<T.Service>('services').filter((s) => s.unit === 'GPU').every((s) => s.pathDeviceIds.every((x) => devById.get(x)?.category === 'GPU-Node')), 'GPU services run on GPU servers');
});

await section('Operations cockpit adapter lists every site', async () => {
  process.env.DCOS_ESTATE = 'all';
  const { db, dbReady, getStartupInfo, resolveEstate } = await import('../src/mock/db/index.ts');
  await dbReady;
  const info = getStartupInfo();
  console.log(`  start-up (node): demo ${info?.demoMs} ms · import ${info?.importMs} ms · hydrate ${info?.hydrateMs} ms · total ${info?.totalMs} ms · ${info?.records.toLocaleString('en-US')} records`);
  ok(resolveEstate() === 'all' && !info?.importError, 'DCOS_ESTATE=all loads the NeoCloud estate');
  ok(db.getAllRaw('dataCenters').length === 63, `MockDB holds 63 sites (${db.getAllRaw('dataCenters').length})`);
  const { buildModel } = await import('../src/ops/mock/model.ts');
  const tb = performance.now(); const m = buildModel('network'); const ms = Math.round(performance.now() - tb);
  console.log(`  ops model ${ms} ms · ${m.datacenters.length} sites · ${m.nes.length} NEs · ${m.links.length} links · ${m.alerts.length} alerts`);
  ok(m.datacenters.length === 63, `ops adapter returns 63 sites (${m.datacenters.length})`);
  ok(m.locations.filter((l) => l.kind === 'datacenter').length === 63, '63 datacenter locations on the map');
  const nc = m.datacenters.filter((d) => dcById.get(d.id)?.extRef);
  ok(nc.length === 48 && nc.every((d) => d.lat && d.lng && d.zone && d.city), 'imported sites have coordinates, region and city');
  ok(nc.every((d) => d.racks.length > 0 || d.status === 'planned'), 'imported sites list their racks');
  ok(!m.links.some((l) => (l.id.startsWith('LNK-F-') || l.id.startsWith('LNK-DCI-')) && dcById.get(l.dcId)?.extRef), 'no fabric or backhaul is invented for imported sites');
  ok(m.links.filter((l) => l.protocol === 'LLDP' && dcById.get(l.dcId)?.extRef).length === imported('cables').length, 'every imported cable is an LLDP link');
  ok(m.alerts.filter((a) => /^(US|IN)-ALM-/.test(a.id)).length === imported('alarms').length, 'every imported alarm reaches the cockpit');
  ok(m.alerts.filter((a) => /^(US|IN)-ALM-/.test(a.id) && !a.neId).every((a) => a.node), 'alarms on nodes outside the inventory keep the node name');
  ok(m.incidents.filter((i) => /^(US|IN)-INC-/.test(i.id)).length === imported('incidents').length && m.changes.filter((c) => /^(US|IN)-CHG-/.test(c.id)).length === imported('changeRequests').length, 'imported incidents and changes reach the cockpit');
  ok(nc.every((d) => !d.power.feeds.some((f) => f.source.startsWith('DC plant ·'))), 'DC plant is not shown twice next to the −48 V feed');
  ok(m.services.filter((s) => /^(US|IN)-SVC-/.test(s.id)).every((s) => s.currency === (s.id.startsWith('US-') ? 'USD' : 'INR')), 'cockpit services keep their currency');
  ok(m.regions.some((r) => r.name === 'US · Northeast') && m.regions.some((r) => r.name === 'India · West'), 'regions "US · …" and "India · …"');
});

console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
void NEOCLOUD_FILES;
