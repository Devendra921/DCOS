/* The Operate model, built from the DCOS MockDB.
 *
 * dcos-ops generated its own estate; here the same `Db` shape is assembled from the
 * DCOS records (sites, plant, racks, devices, interfaces, cables, alarms, incidents,
 * changes, services, customers) so every Operate screen runs on the real DCOS data and
 * every mutation can be written back. Rebuilding is cheap enough to do on demand.
 */
import { db as mdb } from '../../mock/db';
import type * as T from '../../mock/data/types';
import { dcTypeProfile, pueFor } from '../../mock/data/dcTypes';
import type {
  Alert, AuditEntry, CapacityPlan, Change, ChangeStatus, Circle, Customer, Datacenter, Incident, Interface, Link, LinkState, Location, NetworkElement, Persona, ReconTask, Region, RolloutStatus, Service, Severity
} from '../api/types';
import { mulberry32, seedOf } from '../lib/rng';
import { PEOPLE } from '../../mock/db/seed/ctx';

export interface Db {
  now: number;
  regions: Region[]; circles: Circle[]; locations: Location[]; datacenters: Datacenter[];
  nes: NetworkElement[]; neById: Map<string, NetworkElement>; ifaces: Map<string, Interface[]>;
  links: Link[]; services: Service[]; customers: Customer[]; alerts: Alert[]; incidents: Incident[]; changes: Change[];
  recon: ReconTask[]; audit: AuditEntry[]; plans: CapacityPlan[];
  seq: { alm: number; inc: number; chg: number; rec: number; aud: number; plan: number };
}

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const ts = (iso?: string) => (iso ? new Date(iso).getTime() : undefined);
const all = <X,>(entity: string) => mdb.getAllRaw(entity) as unknown as X[];

/* in-memory state that must survive a rebuild but has no DCOS record (derived facility alarms) */
const facilityAck = new Map<string, Alert['state']>();

export const isTenantGear = (n: NetworkElement) => n.role === 'Tenant gear';

const STATUS: Record<string, RolloutStatus> = { Operational: 'on-air', Construction: 'in-progress', Planned: 'planned', Decommissioning: 'decommissioning', Retired: 'retired' };
const CENTRAL = new Set(['hyperscale-dc', 'hyperscale-campus', 'ai-gpu-factory', 'enterprise-dc', 'wholesale-colo', 'carrier-hotel', 'ixp', 'national-core-nfvi', 'mtso']);
const EDGE = new Set(['edge-micro-dc', 'regional-edge-dc', 'network-pop', 'aggregation-pop', 'central-office', 'server-room']);
const categoryOfDc = (key?: string | null): Datacenter['category'] => (key && CENTRAL.has(key) ? 'Central' : key && EDGE.has(key) ? 'Edge' : 'Regional');
const COLO_TYPES = new Set(['retail-colo', 'wholesale-colo']);

const SEV: Record<string, Severity> = { Critical: 'critical', Major: 'major', Minor: 'minor', Warning: 'warning', Info: 'warning' };
const SOURCE_OF = (type: string): Alert['source'] => /link|lldp|bgp|ospf|adjacen/i.test(type) ? (/bgp|ospf|adjacen/i.test(type) ? 'Protocol' : 'Link')
  : /interface|optic|error|flap|crc/i.test(type) ? 'Interface' : /cpu|memory|util/i.test(type) ? 'CPU' : /psu|power/i.test(type) ? 'Power'
  : /fan|temp|thermal|environment/i.test(type) ? 'Environment' : /auth|radius|security|login/i.test(type) ? 'Security' : /config|drift|discover|collector/i.test(type) ? 'Discovery' : 'Interface';

export function categoryOf(a: Pick<Alert, 'neId' | 'source' | 'title' | 'type'>): Alert['category'] {
  if (!a.neId && (a.source === 'Power' || a.source === 'Cooling' || a.source === 'Environment')) return 'Facility';
  if (a.source === 'Power' || a.source === 'Environment' || a.source === 'Discovery') return a.title === 'Collector Stale' ? 'Network' : 'Device';
  if (a.source === 'CPU' || a.type === 'Capacity' || a.title === 'Link Degradation' || /utilization/i.test(a.title)) return 'Performance';
  return 'Network';
}
export function scopeOf(db: Pick<Db, 'links' | 'neById'>, a: Pick<Alert, 'neId' | 'ifName' | 'linkId' | 'title'>): Alert['scope'] {
  if (a.title === 'Collector Stale') return 'dependency';
  const l = a.linkId ? db.links.find(x => x.id === a.linkId) : a.neId && a.ifName ? db.links.find(x => x.protocol === 'LLDP' && ((x.aNe === a.neId && x.aIf === a.ifName) || (x.zNe === a.neId && x.zIf === a.ifName))) : undefined;
  if (l) { const A = db.neById.get(l.aNe), Z = db.neById.get(l.zNe); if (A && Z && A.dcId !== Z.dcId) return 'edge'; }
  return 'site';
}

type NewAlert = Omit<Alert, 'id' | 'code' | 'scope' | 'category'> & { code?: string; scope?: Alert['scope']; category?: Alert['category'] };
export function addAlert(db: Db, a: NewAlert): Alert {
  const code = a.code ?? `ALM-${++db.seq.alm}`;
  const al: Alert = { ...a, id: code, code, scope: a.scope ?? scopeOf(db, a), category: a.category ?? categoryOf(a) };
  db.alerts.push(al);
  return al;
}

export function finaliseHealth(db: Db) {
  const act = db.alerts.filter(a => a.state !== 'cleared' && a.neId);
  const byNe = new Map<string, Alert[]>();
  act.forEach(a => { const l = byNe.get(a.neId!) ?? []; l.push(a); byNe.set(a.neId!, l); });
  for (const n of db.nes) {
    if (n.discovery === 'not-discovered') continue;
    if (isTenantGear(n)) { n.health = 'unknown'; n.healthScore = 0; continue; }
    const al = byNe.get(n.id) ?? [];
    const pen = al.reduce((t, a) => t + (a.severity === 'critical' ? 4 : a.severity === 'major' ? 1.5 : a.severity === 'minor' ? 0.3 : 0.1), 0);
    let s = 100 - pen - (n.cpu + n.mem) / 40 - Math.max(0, n.cpu - 75) * 0.12 - Math.max(0, n.tempC - 50) * 0.1;
    if (n.icmp.state === 'critical') s = Math.min(s, 38 + (seedOf(n.id) % 18));
    n.healthScore = r2(Math.max(0, s));
    n.health = n.healthScore >= 80 ? (al.some(a => a.severity === 'critical' || a.severity === 'major') ? 'degraded' : 'healthy') : n.healthScore >= 60 ? 'degraded' : 'critical';
  }
}

/* ------------------------------------------------------------------ build */

export function buildModel(persona: Persona): Db {
  void persona; // vocabulary only — the estate is the DCOS estate whatever the persona
  const now = Date.now();
  const db: Db = { now, regions: [], circles: [], locations: [], datacenters: [], nes: [], neById: new Map(), ifaces: new Map(), links: [], services: [], customers: [], alerts: [], incidents: [], changes: [], recon: [], audit: [], plans: [], seq: { alm: 9000, inc: 9000, chg: 9000, rec: 0, aud: 9000, plan: 100 } };

  /* ---- source tables */
  const campuses = all<T.Campus>('campuses');
  const dcs = all<T.DataCenter>('dataCenters');
  const buildings = all<T.Building>('buildings'), floors = all<T.Floor>('floors'), halls = all<T.Hall>('halls'), racks = all<T.Rack>('racks');
  const feeds = all<T.UtilityFeed>('utilityFeeds'), xfmrs = all<T.Transformer>('transformers'), upss = all<T.UPS>('upsUnits');
  const zones = all<T.CoolingZone>('coolingZones'), cracs = all<T.CRAC>('cracUnits'), compute = all<T.ComputeResource>('computeResources');
  const devices = all<T.Device>('devices'), roles = all<T.DeviceRoleEntity & { name: string }>('deviceRoles'), managed = all<T.ManagedDevice>('managedDevices');
  const nmsIfaces = all<T.Interface>('interfaces'), comps = all<T.DeviceComponent>('deviceComponents'), cables = all<T.Cable>('cables');
  const circuits = all<T.Circuit>('circuits'), cterms = all<T.CircuitTermination>('circuitTerminations');
  const alarms = all<T.Alarm>('alarms'), incidents = all<T.Incident>('incidents'), changes = all<T.ChangeRequest>('changeRequests'), mws = all<T.MaintenanceWindow>('maintenanceWindows'), steps = all<T.ApprovalStep>('approvalSteps');
  const projects = all<T.Project>('projects'), risks = all<T.RiskItem>('risks'), atps = all<T.Atp>('atps'), hotos = all<T.Hoto>('hotos'), audits = all<T.AuditEvent>('auditEvents');
  const inv = all<T.InventoryItem>('inventoryItems'), customers = all<T.Customer>('customers'), services = all<T.Service>('services'), plans = all<T.CapacityPlanRec>('capacityPlans');
  /* estate-model records: the adapter reads these and only derives a value when a record has none */
  const generators = all<T.Generator>('generators'), dcPlants = all<T.DcPlant>('dcPlants'), cdus = all<T.Cdu>('cdus'), envSensors = all<T.EnvSensor>('envSensors');
  const collectorRecs = all<T.Collector>('collectors'), sessions = all<T.RoutingSession>('routingSessions'), moduleRecs = all<T.Module>('modules'), moduleTypes = all<T.ModuleType>('moduleTypes');
  const collectorById = new Map(collectorRecs.map(c => [c.id, c]));
  const mtById = new Map(moduleTypes.map(m => [m.id, m]));
  const modulesByDev = new Map<string, T.Module[]>();
  for (const m of moduleRecs) { const a = modulesByDev.get(m.deviceId) ?? []; a.push(m); modulesByDev.set(m.deviceId, a); }

  const campusById = new Map(campuses.map(c => [c.id, c]));
  /* sites imported from a customer workbook (DCO template): their cabling, routing sessions and backhaul are on record,
     so the fabric, adjacencies and inter-site links below are not derived for them */
  const importedDc = new Set(dcs.filter(d => d.extRef).map(d => d.id));
  const roleName = new Map(roles.map(r => [r.id, r.name]));
  const mdById = new Map(managed.map(m => [m.id, m]));
  const hallById = new Map(halls.map(h => [h.id, h])), floorById = new Map(floors.map(f => [f.id, f])), bldById = new Map(buildings.map(b => [b.id, b]));
  const rackById = new Map(racks.map(r => [r.id, r]));
  const zoneById = new Map(zones.map(z => [z.id, z]));
  const compById = new Map(comps.map(c => [c.id, c]));
  const devById = new Map(devices.map(d => [d.id, d]));
  const projectsByDc = new Map<string, T.Project[]>();
  for (const p of projects) { if (!p.dataCenterId) continue; const a = projectsByDc.get(p.dataCenterId) ?? []; a.push(p); projectsByDc.set(p.dataCenterId, a); }

  /* ---- regions (DCOS regions) and "circles" (campuses) */
  const dcosRegions = all<T.Region>('regions');
  const edgeLocs = all<T.EdgeLocation>('edgeLocations');
  for (const r of dcosRegions) db.regions.push({ id: r.id, name: r.name });
  for (const c of campuses) db.circles.push({ id: c.id, name: c.city, state: c.country, regionId: c.regionId, lat: c.latitude, lng: c.longitude });
  const regionOfCampus = (cid: string) => campusById.get(cid)?.regionId ?? (db.regions[0]?.id ?? 'global');

  /* ---- network elements */
  const ROLE: Record<string, NetworkElement['role'] | undefined> = { Router: 'Router', Switch: 'Switch', Firewall: 'Firewall', Server: 'Server', Storage: 'Storage', 'GPU-Node': 'GPU' };
  const devicesByDc = new Map<string, T.Device[]>();
  for (const d of devices) { if (!d.dataCenterId) continue; const a = devicesByDc.get(d.dataCenterId) ?? []; a.push(d); devicesByDc.set(d.dataCenterId, a); }
  const invByDev = new Map<string, T.InventoryItem[]>();
  for (const it of inv) { const a = invByDev.get(it.deviceId) ?? []; if (a.length < 6) a.push(it); invByDev.set(it.deviceId, a); }
  const serviceCountByRack = new Map<string, Service[]>();

  let drifted = 0;
  for (const dc of dcs) {
    const colo = COLO_TYPES.has(dc.dcTypeKey ?? '');
    for (const d of devicesByDc.get(dc.id) ?? []) {
      const rn = roleName.get(d.deviceRoleId ?? '') ?? '';
      let role = ROLE[d.category ?? ''];
      if (rn === 'Core Router') role = 'Router'; else if (rn === 'Spine' || rn === 'Leaf/ToR') role = 'Switch'; else if (rn === 'Firewall') role = 'Firewall';
      if (!role) continue; // PDUs, patch panels, UPS and passive gear are not network elements
      /* tenant-owned kit (any device in a leased cabinet) is opaque tenant gear; records without an owner fall back to the site type */
      if (d.ownerKind === 'tenant' || (d.ownerKind === undefined && colo && (role === 'Server' || role === 'Storage' || role === 'GPU'))) role = 'Tenant gear';
      const r = mulberry32(seedOf(d.id));
      const md = mdById.get(d.id);
      const layer: NetworkElement['layer'] = d.extRef && d.networkLayer ? d.networkLayer : rn === 'Core Router' ? 'core' : rn === 'Spine' ? 'spine' : rn === 'Leaf/ToR' ? 'leaf' : 'access';
      const planned = ['Ordered', 'Received', 'Staged'].includes(d.lifecycleState ?? '') || d.status === 'Inactive';
      const unreachable = md?.reachability === 'Unreachable';
      /* Devices without an NMS record are covered by the platform's agent collectors (Redfish for hosts,
         SNMP for the rest); a deterministic few are genuinely unseen so reconciliation has work to do. */
      const covered = !!md || role === 'Tenant gear' || (d.monitored ?? seedOf(d.id) % 40 !== 0);
      const colRec = d.collectorId ? collectorById.get(d.collectorId) : undefined;
      let discovery: NetworkElement['discovery'] = planned ? 'not-discovered' : covered ? 'verified' : 'not-discovered';
      let drift: NetworkElement['drift'];
      let duplicateSerialOf: string | undefined;
      if (discovery === 'verified' && role !== 'Tenant gear' && seedOf(d.id) % 19 === 0) {
        discovery = 'drifted'; drifted++;
        const kind = md ? seedOf(d.id) % 4 : 1 + (seedOf(d.id) % 3);
        drift = kind === 0 ? [{ attr: 'OS version', record: md!.osVersion, observed: md!.osVersion.replace(/\d+$/, m => String(Number(m) + 1)) }]
          : kind === 1 ? [{ attr: 'Rack unit', record: `U${d.position ?? 1}`, observed: `U${(d.position ?? 1) + 2}` }]
          : kind === 2 ? [{ attr: 'Hostname', record: d.hostname ?? d.name, observed: `${(d.hostname ?? d.name).toLowerCase()}-new` }]
          : [{ attr: 'Serial number', record: d.serial ?? '', observed: `${(d.serial ?? 'SN').slice(0, 6)}X9` }];
        if (drifted % 3 === 0) duplicateSerialOf = (devicesByDc.get(dc.id) ?? [])[(seedOf(d.id) + 1) % (devicesByDc.get(dc.id)?.length ?? 1)]?.id;
      }
      const cpu = role === 'Tenant gear' ? 0 : Math.round(12 + r() * 60 + (unreachable ? 0 : 0));
      const mem = role === 'Tenant gear' ? 0 : Math.round(25 + r() * 55);
      const tempC = Math.round(30 + r() * 18);
      const uptimeMin = md ? Math.round(md.uptimeSeconds / 60) : planned ? 0 : (seedOf(d.id) % 400 + 1) * 1440 + (seedOf(d.id) % 1440);
      const okHours = (p: number) => Array.from({ length: 24 }, () => r() > p);
      const ne: NetworkElement = {
        id: d.id, dcId: dc.id, name: d.hostname ?? d.name, role, layer, vendor: d.manufacturer ?? md?.vendor ?? 'Unknown', model: d.model ?? md?.model ?? 'Unknown', os: md?.osVersion ?? d.osVersion ?? (role === 'Tenant gear' ? '—' : role === 'Server' || role === 'GPU' || role === 'Storage' ? ['Ubuntu 24.04 LTS', 'RHEL 9.4', 'ESXi 8.0u3', 'Ubuntu 22.04 LTS'][seedOf(d.id) % 4] : 'Junos 23.4R2-S3'), serial: d.serial ?? '—',
        ip: d.primaryIp4 ?? md?.mgmtIp ?? '', mac: ((m: string) => d.macAddress ?? m)(`02:${[1, 2, 3, 4, 5].map(() => Math.floor(r() * 256).toString(16).padStart(2, '0')).join(':')}`.toUpperCase()), rackId: d.rackId ?? '', u: d.position ?? 0,
        lifecycle: d.status === 'Maintenance' ? 'Maintenance' : d.lifecycleState === 'Retired' || d.lifecycleState === 'Disposed' ? 'Decommissioning' : planned ? 'Planned' : 'Ready',
        discovery, ndReason: discovery === 'not-discovered' ? (planned ? 'planned' : role === 'Tenant gear' ? 'not-applicable' : d.monitored === false ? (colRec ? 'collector-unavailable' : 'no-collector') : seedOf(d.id) % 5 === 0 ? 'collector-unavailable' : 'no-collector') : undefined, drift, duplicateSerialOf,
        lastSeen: discovery === 'not-discovered' ? undefined : ts(md?.lastPolledAt) ?? now - (seedOf(d.id) % 9 + 1) * MIN, collector: discovery === 'not-discovered' ? undefined : colRec ? colRec.name : md ? `${md.sourceSystem}` : (role === 'Server' || role === 'Storage' || role === 'GPU' ? 'Databyte Redfish agent' : 'Databyte SNMP agent'), health: 'unknown', healthScore: 0, cpu, mem, tempC, uptimeMin, lastReboot: now - uptimeMin * MIN,
        icmp: { lossPct: unreachable ? 100 : r() < 0.06 ? r1(r() * 4) : 0, latencyMs: r1(0.4 + r() * 2), jitterMs: r1(r() * 0.6), availability: unreachable ? r1(60 + r() * 30) : r1(99.5 + r() * 0.5), state: unreachable ? 'critical' : 'healthy', hourly: unreachable ? okHours(0.6) : okHours(0.02) },
        ntp: { offsetMs: r1(r() * 2), delayMs: r1(0.5 + r()), jitterMs: r1(r() * 0.8), stratum: 2 + Math.floor(r() * 2), state: unreachable || seedOf(d.id) % 37 === 0 ? 'Unsynchronised' : 'Synchronised', primary: '10.0.0.10', secondary: '10.0.0.11', lastSync: now - Math.floor(r() * 30) * MIN, hourly: okHours(0.01) },
        radius: { successPct: unreachable ? 0 : r1(97 + r() * 3), failures24h: unreachable ? 12 + Math.floor(r() * 20) : Math.floor(r() * 5), primary: unreachable ? 'Unreachable' : 'Reachable', secondary: unreachable || seedOf(d.id) % 53 === 0 ? 'Unreachable' : 'Reachable', lastAuth: now - (unreachable ? 6 * 60 : Math.floor(r() * 90)) * MIN, state: unreachable ? 'critical' : seedOf(d.id) % 53 === 0 ? 'degraded' : 'healthy', pri: '10.0.0.20', sec: '10.0.0.21' },
        /* installed modules (line cards) by bay, then the discovered inventory items (PSUs, fans, optics) by their own name */
        modules: [
          ...(modulesByDev.get(d.id) ?? []).map(m => ({ slot: m.moduleBayName, name: mtById.get(m.moduleTypeId)?.model ?? m.moduleTypeId, serial: m.serial ?? '—' })),
          ...(invByDev.get(d.id) ?? []).map(it => ({ slot: it.name, name: [it.manufacturer, it.partNumber].filter(Boolean).join(' ') || (it.label ?? it.name), serial: it.serial ?? '—' })),
        ].map((m, k) => ({ ...m, state: d.status === 'Faulty' && k === 0 ? 'Fault' as const : 'OK' as const, tempC: Math.round(28 + r() * 20) })),
        isPe: d.wanEdge ?? (layer === 'core' && role === 'Router'), uSize: d.heightU ?? 1, tenantId: role === 'Tenant gear' ? d.tenantCustomerId : undefined,
        collectorId: d.collectorId, wanEdge: d.wanEdge, gpu: d.gpu ? { model: String(d.gpu.model), vendor: String(d.gpu.vendor), count: d.gpu.count, cooling: d.gpu.cooling, clusterId: d.gpu.clusterId } : undefined,
      };
      db.nes.push(ne); db.neById.set(ne.id, ne);
    }
  }

  /* ---- interfaces (NMS) with optics and peers from cabling */
  const compByDevName = new Map<string, T.DeviceComponent>();
  for (const c of comps) if (c.kind === 'interface') compByDevName.set(`${c.deviceId}|${c.name}`, c);
  const peerByComp = new Map<string, { neId: string; ifName: string; cable: T.Cable }>();
  for (const c of cables) {
    const a = compById.get(c.aComponentId), b = compById.get(c.bComponentId);
    if (a && b) { peerByComp.set(c.aComponentId, { neId: c.bDeviceId, ifName: b.name, cable: c }); peerByComp.set(c.bComponentId, { neId: c.aDeviceId, ifName: a.name, cable: c }); }
  }
  const alarmsByDev = new Map<string, T.Alarm[]>();
  for (const a of alarms) { const l = alarmsByDev.get(a.deviceId) ?? []; l.push(a); alarmsByDev.set(a.deviceId, l); }
  const ifaceById = new Map<string, T.Interface>();
  for (const f of nmsIfaces) {
    ifaceById.set(f.id, f);
    if (!db.neById.has(f.deviceId)) continue;
    const comp = compByDevName.get(`${f.deviceId}|${f.name}`);
    const peer = comp ? peerByComp.get(comp.id) : undefined;
    const r = mulberry32(seedOf(f.id));
    const flapAlarm = (alarmsByDev.get(f.deviceId) ?? []).find(a => a.interfaceId === f.id && (a.flapCount ?? 0) > 0);
    const optical = /SFP|QSFP|OM4|OS2/i.test(comp?.ifaceType ?? '');
    const i: Interface = {
      id: f.id, neId: f.deviceId, name: f.name, type: comp?.ifaceType ?? `${f.speedGbps}G`, speedMbps: f.speedGbps * 1000, state: f.adminStatus === 'Down' ? 'admin-down' : f.operStatus === 'Up' ? 'up' : f.operStatus === 'Dormant' ? 'reserved' : 'down',
      utilPct: f.utilizationPct, inErrors: f.inErrors, crcErrors: Math.round(f.inErrors * 0.6), flaps24h: flapAlarm?.flapCount ?? (r() < 0.04 ? Math.floor(r() * 6) : 0),
      optics: optical ? { model: typeof comp?.customFields?.optic === 'string' ? comp.customFields.optic : /100G|QSFP28/i.test(comp?.ifaceType ?? '') ? 'QSFP28-100G-LR4' : 'SFP-10G-LR', rxDbm: r1(-9 + r() * 4 - (f.inErrors > 70 ? 3 : 0)), txDbm: r1(-2 + r() * 1.5), tempC: Math.round(30 + r() * 15) } : undefined,
      peer: peer ? { neId: peer.neId, ifName: peer.ifName } : undefined, description: peer ? `to ${db.neById.get(peer.neId)?.name ?? peer.neId} ${peer.ifName}` : f.notes ?? '',
    };
    const l = db.ifaces.get(f.deviceId) ?? []; l.push(i); db.ifaces.set(f.deviceId, l);
  }
  const ifUtil = (neId: string, name: string) => db.ifaces.get(neId)?.find(x => x.name === name);

  /* ---- links: LLDP from cables, protocol adjacencies over the fabric, backhaul between sites */
  const linkRole = (A: NetworkElement, Z: NetworkElement): Link['role'] => A.dcId !== Z.dcId ? 'Backhaul' : (A.role === 'Server' || Z.role === 'Server' || A.role === 'Storage' || Z.role === 'Storage' || A.role === 'GPU' || Z.role === 'GPU' || A.role === 'Tenant gear' || Z.role === 'Tenant gear') ? 'Access' : (A.layer === 'core' && Z.layer === 'core') ? 'Peering' : (A.layer === 'core' || Z.layer === 'core') ? 'Uplink' : 'Fabric';
  const pushLink = (l: Omit<Link, 'history' | 'growthPct' | 'sessions'> & Partial<Pick<Link, 'history' | 'growthPct' | 'sessions'>>) => {
    const r = mulberry32(seedOf(l.id));
    const growth = r1(0.4 + r() * 3.2);
    const history = l.history ?? Array.from({ length: 6 }, (_, k) => r1(Math.max(1, l.utilPct / Math.pow(1 + growth / 100, 5 - k))));
    db.links.push({ sessions: 1, growthPct: growth, ...l, history });
  };
  /* routing adjacencies: RoutingSession records where a pair has them; otherwise derived from the fabric role (below) */
  const pairKey = (a: string, z: string) => (a < z ? `${a}|${z}` : `${z}|${a}`);
  const sessionsByPair = new Map<string, T.RoutingSession[]>();
  for (const x of sessions) { const k = pairKey(x.aDeviceId, x.zDeviceId); const a = sessionsByPair.get(k) ?? []; a.push(x); sessionsByPair.set(k, a); }
  const sessionUsed = new Set<string>();
  const SESSION_STATE: Record<string, LinkState> = { Established: 'up', Down: 'down', Planned: 'standby' };
  const pushSessions = (A: NetworkElement, Z: NetworkElement, base: string, util: number, role: Link['role']): boolean => {
    const list = sessionsByPair.get(pairKey(A.id, Z.id)) ?? [];
    for (const x of list) {
      if (sessionUsed.has(x.id)) continue; sessionUsed.add(x.id);
      const fwd = x.aDeviceId === A.id;
      const proto = (['BGP', 'OSPF', 'ISIS', 'LSP'].includes(x.protocol) ? x.protocol : 'BGP') as Link['protocol'];
      pushLink({ id: `${base}-${proto}`, protocol: proto, aNe: fwd ? A.id : Z.id, aIf: x.aIfName ?? '', zNe: fwd ? Z.id : A.id, zIf: x.zIfName ?? '', dcId: A.dcId, capacityMbps: x.capacityMbps ?? 10000, utilPct: util, state: SESSION_STATE[x.state ?? 'Established'] ?? 'up', role: x.role ?? role, physical: null, sessions: proto === 'BGP' ? 2 : 1 });
    }
    return list.length > 0;
  };
  for (const c of cables) {
    const A = db.neById.get(c.aDeviceId), Z = db.neById.get(c.bDeviceId);
    if (!A || !Z) continue;
    const a = compById.get(c.aComponentId), z = compById.get(c.bComponentId);
    if (!a || !z || a.kind !== 'interface') continue;
    const ia = ifUtil(A.id, a.name), iz = ifUtil(Z.id, z.name);
    const down = c.status === 'Decommissioning' || ia?.state === 'down' || iz?.state === 'down';
    const id = `LNK-${c.id}`;
    const role = A.dcId !== Z.dcId ? 'Backhaul' : (c.role ?? linkRole(A, Z));
    pushLink({ id, protocol: 'LLDP', aNe: A.id, aIf: a.name, zNe: Z.id, zIf: z.name, dcId: A.dcId, capacityMbps: c.capacityMbps ?? a.speedMbps ?? ia?.speedMbps ?? 10000, utilPct: ia?.utilPct ?? iz?.utilPct ?? 0, state: c.status === 'Planned' ? 'standby' : down ? 'down' : 'up', role, physical: { cable: c.carrierCircuitId ?? c.label ?? c.cblId, strand: c.strand ?? c.cableType, aPort: c.aPatchPort ?? a.name, zPort: c.bPatchPort ?? z.name } });
    /* logical adjacencies ride the physical fabric links: recorded sessions first, derived ones otherwise */
    if (pushSessions(A, Z, id, ia?.utilPct ?? 0, role)) continue;
    if (importedDc.has(A.dcId) || importedDc.has(Z.dcId)) continue;
    const both = A.role !== 'Server' && A.role !== 'Storage' && A.role !== 'GPU' && A.role !== 'Tenant gear' && Z.role !== 'Server' && Z.role !== 'Storage' && Z.role !== 'GPU' && Z.role !== 'Tenant gear';
    if (both && c.status === 'Active') {
      const proto: Link['protocol'] = A.layer === 'core' && Z.layer === 'core' ? 'BGP' : A.role === 'Firewall' || Z.role === 'Firewall' ? 'BGP' : 'OSPF';
      const flaky = seedOf(id) % 29 === 0;
      pushLink({ id: `${id}-${proto}`, protocol: proto, aNe: A.id, aIf: a.name, zNe: Z.id, zIf: z.name, dcId: A.dcId, capacityMbps: a.speedMbps ?? 10000, utilPct: ia?.utilPct ?? 0, state: down ? 'down' : flaky ? (proto === 'BGP' ? 'idle' : 'init') : 'up', role: linkRole(A, Z), physical: null, sessions: proto === 'BGP' ? 2 : 1 });
    }
  }
  /* fabric: every leaf dual-homed to two spines, every spine to the cores, firewalls to the cores and every host to its
     rack's leaf — unless a cable already wires the pair. The DCOS cable seed only records a sample of patches. */
  const lldpPairs = new Set(db.links.filter(l => l.protocol === 'LLDP').map(l => `${l.aNe}|${l.zNe}`));
  const isLinked = (a: string, z: string) => lldpPairs.has(`${a}|${z}`) || lldpPairs.has(`${z}|${a}`);
  const portIdx = new Map<string, number>();
  const nextIf = (n: NetworkElement) => {
    const k = portIdx.get(n.id) ?? 0; portIdx.set(n.id, k + 1);
    const ifs = (db.ifaces.get(n.id) ?? []).filter(i => !/mgmt|fxp|Mgmt/i.test(i.name) && i.state !== 'admin-down');
    return ifs.length ? ifs[k % ifs.length].name : `${n.role === 'Server' || n.role === 'Storage' || n.role === 'GPU' || n.role === 'Tenant gear' ? 'eth' : 'et-0/0/'}${k}`;
  };
  const fab = (a: NetworkElement | undefined, z: NetworkElement | undefined, role: Link['role'], cap: number, proto?: Link['protocol']) => {
    if (!a || !z || a.id === z.id || isLinked(a.id, z.id)) return;
    const id = `LNK-F-${a.id}-${z.id}`;
    const r = mulberry32(seedOf(id));
    const aIf = nextIf(a), zIf = nextIf(z);
    const down = a.icmp.state === 'critical' || z.icmp.state === 'critical' || seedOf(id) % 41 === 0;
    const util = r1(8 + r() * 72);
    pushLink({ id, protocol: 'LLDP', aNe: a.id, aIf, zNe: z.id, zIf, dcId: a.dcId, capacityMbps: cap, utilPct: util, state: down ? 'down' : 'up', role, physical: { cable: 'Fabric trunk', strand: cap >= 100000 ? 'SMF-OS2' : 'MMF-OM4', aPort: aIf, zPort: zIf } });
    lldpPairs.add(`${a.id}|${z.id}`);
    if (pushSessions(a, z, id, util, role)) return;
    if (proto) pushLink({ id: `${id}-${proto}`, protocol: proto, aNe: a.id, aIf, zNe: z.id, zIf, dcId: a.dcId, capacityMbps: cap, utilPct: util, state: down ? 'down' : seedOf(id) % 53 === 0 ? (proto === 'BGP' ? 'idle' : 'init') : 'up', role, physical: null, sessions: proto === 'BGP' ? 2 : 1 });
  };
  const nesByDc = new Map<string, NetworkElement[]>();
  for (const n of db.nes) { const a = nesByDc.get(n.dcId) ?? []; a.push(n); nesByDc.set(n.dcId, a); }
  for (const [dcId, nes] of nesByDc) {
    if (importedDc.has(dcId)) continue;
    const cores = nes.filter(n => n.layer === 'core'), spines = nes.filter(n => n.layer === 'spine'), leaves = nes.filter(n => n.layer === 'leaf');
    const fws = nes.filter(n => n.role === 'Firewall'), hosts = nes.filter(n => n.role === 'Server' || n.role === 'Storage' || n.role === 'GPU' || n.role === 'Tenant gear');
    const up = spines.length ? spines : cores;
    spines.forEach(sp => cores.slice(0, 2).forEach(c => fab(sp, c, 'Uplink', 100000, 'BGP')));
    fws.forEach((fw, i) => fab(fw, cores[i % Math.max(1, cores.length)] ?? up[0], 'Uplink', 10000, 'BGP'));
    leaves.forEach((lf, i) => { if (!up.length) return; fab(lf, up[i % up.length], 'Fabric', 100000, 'OSPF'); if (up.length > 1) fab(lf, up[(i + 1) % up.length], 'Fabric', 100000, 'OSPF'); });
    const leafByRack = new Map<string, NetworkElement>();
    leaves.forEach(lf => { if (lf.rackId && !leafByRack.has(lf.rackId)) leafByRack.set(lf.rackId, lf); });
    hosts.forEach((h, i) => { const lf = leafByRack.get(h.rackId) ?? leaves[i % Math.max(1, leaves.length)] ?? up[i % Math.max(1, up.length)]; fab(h, lf, 'Access', h.role === 'GPU' ? 100000 : 25000); });
  }
  /* recorded sessions with no physical link between the pair (iBGP between loopbacks, route reflector clients) */
  for (const x of sessions) {
    if (sessionUsed.has(x.id)) continue;
    const A = db.neById.get(x.aDeviceId), Z = db.neById.get(x.zDeviceId);
    if (!A || !Z) continue;
    pushSessions(A, Z, `LNK-RS-${x.id}`, 0, x.role ?? linkRole(A, Z));
  }
  /* inter-site backhaul: each live site pairs with the next site in its region (DCI circuits size the link) */
  const liveDcs = dcs.filter(d => !importedDc.has(d.id) && (d.status === 'Operational' || d.status === 'Decommissioning'));
  const coreOf = (dcId: string) => db.nes.filter(n => n.dcId === dcId && n.layer === 'core');
  const dciByDc = new Map<string, T.Circuit[]>();
  for (const ct of cterms) { if (ct.side !== 'A' || !ct.dataCenterId) continue; const ck = circuits.find(c => c.id === ct.circuitId); if (ck?.purpose === 'DC Interconnect') { const a = dciByDc.get(ct.dataCenterId) ?? []; a.push(ck); dciByDc.set(ct.dataCenterId, a); } }
  const byRegion = new Map<string, T.DataCenter[]>();
  for (const d of liveDcs) { const rid = regionOfCampus(d.campusId); const a = byRegion.get(rid) ?? []; a.push(d); byRegion.set(rid, a); }
  const regionList = [...byRegion.values()];
  liveDcs.forEach((d, i) => {
    const group = byRegion.get(regionOfCampus(d.campusId)) ?? [];
    const partners = group.length > 1 ? [group[(group.indexOf(d) + 1) % group.length]] : [regionList[(regionList.indexOf(group) + 1) % regionList.length]?.[0]].filter(Boolean);
    for (const p of partners) {
      if (!p || p.id === d.id) continue;
      const A = coreOf(d.id), Z = coreOf(p.id);
      if (!A.length || !Z.length) continue;
      const pairs = Math.min(2, A.length, Z.length);
      for (let k = 0; k < pairs; k++) {
        const a = A[k], z = Z[k % Z.length];
        const dci = (dciByDc.get(d.id) ?? [])[k];
        const id = `LNK-DCI-${d.code}-${p.code}-${k + 1}`;
        if (db.links.some(l => l.id === id || l.id === `LNK-DCI-${p.code}-${d.code}-${k + 1}`)) continue;
        const r = mulberry32(seedOf(id) + i);
        const util = r1(35 + r() * 55);
        const down = dci?.status === 'Offline' || seedOf(id) % 23 === 0;
        const aIf = `et-0/0/${40 + k}`, zIf = `et-0/0/${40 + k}`;
        const cap = dci?.commitRateMbps ?? 100000;
        pushLink({ id, protocol: 'LLDP', aNe: a.id, aIf, zNe: z.id, zIf, dcId: d.id, capacityMbps: cap, utilPct: util, state: down ? 'down' : 'up', role: 'Backhaul', physical: { cable: dci?.cid ?? 'DCI trunk', strand: 'SMF-OS2', aPort: aIf, zPort: zIf } });
        pushLink({ id: `${id}-BGP`, protocol: 'BGP', aNe: a.id, aIf, zNe: z.id, zIf, dcId: d.id, capacityMbps: cap, utilPct: util, state: down ? 'down' : 'up', role: 'Backhaul', physical: null, sessions: 2 });
        if (k === 0) pushLink({ id: `${id}-LSP`, protocol: 'LSP', aNe: a.id, aIf, zNe: z.id, zIf, dcId: d.id, capacityMbps: cap, utilPct: util, state: down ? 'down' : 'up', role: 'Backhaul', physical: null });
      }
    }
  });
  const linksByNe = new Map<string, Link[]>();
  for (const l of db.links) { for (const n of [l.aNe, l.zNe]) { const a = linksByNe.get(n) ?? []; a.push(l); linksByNe.set(n, a); } }

  /* ---- customers and services */
  for (const c of customers) db.customers.push({ id: c.id, name: c.name, segment: c.segment, city: c.city, state: c.state, plan: c.plan, premium: c.premium, revenueMonthly: c.revenueMonthly, accountManager: c.accountManager });
  for (const s of services) {
    const ne = s.deviceId && db.neById.has(s.deviceId) ? s.deviceId : (db.nes.find(n => n.dcId === s.dataCenterId && n.layer === 'core') ?? db.nes.find(n => n.dcId === s.dataCenterId))?.id;
    if (!ne) continue;
    const linkIds = s.cableIds.map(cid => `LNK-${cid}`).filter(id => db.links.some(l => l.id === id));
    const mine = (linksByNe.get(ne) ?? []).filter(l => l.protocol === 'LLDP');
    const backhaul = mine.find(l => l.role === 'Backhaul') ?? mine.find(l => l.role === 'Uplink') ?? mine.find(l => l.role === 'Fabric') ?? mine.find(l => l.role === 'Access');
    if (backhaul && !linkIds.includes(backhaul.id)) linkIds.push(backhaul.id);
    const far = backhaul ? mine.find(l => l.id !== backhaul.id && (l.role === 'Backhaul' || l.role === 'Uplink')) : undefined;
    if (far && !linkIds.includes(far.id)) linkIds.push(far.id);
    const neIfs = (db.ifaces.get(ne) ?? []).filter(i => !/mgmt|fxp|Mgmt/i.test(i.name));
    const handoff = s.ifName && !/mgmt|fxp|Mgmt/i.test(s.ifName) ? s.ifName : (neIfs.find(i => i.state === 'up') ?? neIfs[0])?.name ?? (backhaul ? (backhaul.aNe === ne ? backhaul.aIf : backhaul.zIf) : s.ifName ?? '');
    const svc: Service = { id: s.id, type: s.type as Service['type'], customerId: s.customerRef, dcId: s.dataCenterId, neId: ne, ifName: handoff, path: s.pathDeviceIds.filter(id => db.neById.has(id)), linkIds, bandwidthMbps: s.bandwidthMbps, utilPct: s.utilPct, status: s.status, slaTarget: s.slaTarget, uptime30d: s.uptime30d, growthPct: s.growthPct, revenueMonthly: s.revenueMonthly, critical: s.critical, qty: s.qty, unit: s.unit as Service['unit'],
      rackIds: s.rackIds ?? (s.rackId ? [s.rackId] : undefined), startDate: s.startDate, currency: s.currency, gpuNodeIds: ((ids: string[]) => ids.length ? ids : undefined)([...new Set([s.deviceId, ...s.pathDeviceIds].filter((id): id is string => !!id && !!devById.get(id)?.gpu))]) };
    db.services.push(svc);
    if (s.rackId) { const a = serviceCountByRack.get(s.rackId) ?? []; a.push(svc); serviceCountByRack.set(s.rackId, a); }
    const n = db.neById.get(ne); if (n && n.role === 'Tenant gear') n.tenantId ??= s.customerRef;
  }

  /* ---- datacenters */
  const racksByDc = new Map<string, T.Rack[]>();
  for (const r of racks) { const a = racksByDc.get(r.dataCenterId) ?? []; a.push(r); racksByDc.set(r.dataCenterId, a); }
  const portsByDc = new Map<string, Map<string, { total: number; used: number }>>();
  const compUsed = new Set<string>();
  for (const c of cables) { compUsed.add(c.aComponentId); compUsed.add(c.bComponentId); }
  const linkEnds = new Set<string>();
  for (const l of db.links) if (l.protocol === 'LLDP') { linkEnds.add(`${l.aNe}|${l.aIf}`); linkEnds.add(`${l.zNe}|${l.zIf}`); }
  const upIfs = new Set(nmsIfaces.filter(f => f.operStatus === 'Up').map(f => `${f.deviceId}|${f.name}`));
  const portUsed = (c: T.DeviceComponent) => {
    if (compUsed.has(c.id) || linkEnds.has(`${c.deviceId}|${c.name}`) || upIfs.has(`${c.deviceId}|${c.name}`)) return true;
    const d = devById.get(c.deviceId); if (!d || d.status !== 'Active' || /Virtual/i.test(c.ifaceType ?? '') || c.mgmtOnly) return false;
    return seedOf(c.id) % 100 < 38;
  };
  for (const c of comps) {
    if (c.kind !== 'interface') continue;
    const d = devById.get(c.deviceId); if (!d?.dataCenterId) continue;
    const cls = /400G/i.test(c.ifaceType ?? '') ? 'QSFP-DD 400G' : /100G/i.test(c.ifaceType ?? '') ? 'QSFP28 100G' : /40G/i.test(c.ifaceType ?? '') ? 'QSFP+ 40G' : /25G/i.test(c.ifaceType ?? '') ? 'SFP28 25G' : /10G/i.test(c.ifaceType ?? '') ? 'SFP+ 10G' : /Virtual/i.test(c.ifaceType ?? '') ? 'Virtual' : 'Copper 1G';
    const m = portsByDc.get(d.dataCenterId) ?? new Map(); const e = m.get(cls) ?? { total: 0, used: 0 }; e.total++; if (portUsed(c)) e.used++; m.set(cls, e); portsByDc.set(d.dataCenterId, m);
  }
  const rackPorts = new Map<string, { total: number; used: number }>();
  for (const c of comps) { if (c.kind !== 'interface') continue; const d = devById.get(c.deviceId); if (!d?.rackId) continue; const e = rackPorts.get(d.rackId) ?? { total: 0, used: 0 }; e.total++; if (portUsed(c)) e.used++; rackPorts.set(d.rackId, e); }

  /* per-site groupings, built once (the per-site loop below runs for every site) */
  const nesOfDc = new Map<string, NetworkElement[]>();
  for (const n of db.nes) { const a = nesOfDc.get(n.dcId) ?? []; a.push(n); nesOfDc.set(n.dcId, a); }
  const cablesByDc = new Map<string, T.Cable[]>();
  for (const c of cables) { const k = devById.get(c.aDeviceId)?.dataCenterId; if (!k) continue; const a = cablesByDc.get(k) ?? []; a.push(c); cablesByDc.set(k, a); }
  const hotByDc = new Map<string, number>();
  for (const l of db.links) if (l.protocol === 'LLDP' && l.utilPct >= 85 && l.role !== 'Access') hotByDc.set(l.dcId, (hotByDc.get(l.dcId) ?? 0) + 1);
  const cracsByZone = new Map<string, T.CRAC[]>();
  for (const c of cracs) { const a = cracsByZone.get(c.coolingZoneId) ?? []; a.push(c); cracsByZone.set(c.coolingZoneId, a); }
  dcs.forEach((dc, di) => {
    const campus = campusById.get(dc.campusId);
    const prof = dcTypeProfile(dc.dcTypeKey);
    const r = mulberry32(seedOf(dc.id));
    const dcRacks = racksByDc.get(dc.id) ?? [];
    const itKw = r1(dcRacks.reduce((s, x) => s + x.currentPowerKw, 0));
    const dcZones = zones.filter(z => z.dataCenterId === dc.id);
    const coolKw = r1(dcZones.reduce((s, z) => s + z.currentLoadKw, 0));
    const pueRaw = pueFor(dc.dcTypeKey, itKw, coolKw) || 1.45;
    const pue = dc.designPue ?? Math.min(2.2, Math.max(1.08, pueRaw));
    const totalKw = r1(itKw * pue);
    const coolDerived = r1(Math.max(0, totalKw - itKw) * 0.82);
    const otherKw = r1(Math.max(0, totalKw - itKw - coolDerived));
    const dcFeeds = feeds.filter(f => f.dataCenterId === dc.id);
    const dcUps = upss.filter(u => u.dataCenterId === dc.id);
    const nes = nesOfDc.get(dc.id) ?? [];
    const dcCollectors = collectorRecs.filter(c => c.dataCenterId === dc.id);
    const dcDevices = devicesByDc.get(dc.id) ?? [];
    const collectors = dcCollectors.length ? dcCollectors.map(c => {
      const polled = dcDevices.filter(x => x.collectorId === c.id).map(x => ts(mdById.get(x.id)?.lastPolledAt) ?? 0);
      const lastSeen = Math.max(0, ...polled) || now - (2 + (seedOf(c.id) % 4)) * MIN;
      const state = c.status === 'Down' ? 'down' as const : c.status === 'Degraded' ? 'stale' as const : 'up' as const;
      return { id: c.id, name: c.name, state, lastSeen: state === 'stale' ? now - 42 * MIN : state === 'down' ? now - 6 * HOUR : lastSeen };
    }) : [...new Set(managed.filter(m => m.dataCenterId === dc.id).map(m => m.sourceSystem))].map((name, k) => {
      const devs = managed.filter(m => m.dataCenterId === dc.id && m.sourceSystem === name);
      const lastSeen = Math.max(...devs.map(m => ts(m.lastPolledAt) ?? 0), 0) || now - 5 * MIN;
      const stale = di % 5 === 1 && k === 0 && dc.status === 'Operational';
      return { id: `COL-${dc.code}-${k + 1}`, name, state: stale ? 'stale' as const : 'up' as const, lastSeen: stale ? now - 42 * MIN : lastSeen };
    });
    const dcProjects = projectsByDc.get(dc.id) ?? [];
    const projApproved = dcProjects.reduce((s, p) => s + p.budget, 0), projSpent = dcProjects.reduce((s, p) => s + p.actualSpend, 0);
    const rCap = mulberry32(seedOf(`${dc.id}-capex`));
    const approved = projApproved || Math.round(dc.designPowerKw * (2800 + rCap() * 1400));
    const spent = projApproved ? projSpent : Math.round(approved * (dc.status === 'Operational' ? 0.86 + rCap() * 0.1 : 0.35 + rCap() * 0.3));
    const committed = Math.min(Math.max(spent, Math.round(spent * 1.08)), Math.max(approved, spent));
    const energyMonthly = Math.round(itKw * pue * 730 * 0.11);
    const opexDrivers = [{ item: 'Energy', monthly: energyMonthly }, { item: 'Maintenance & contracts', monthly: Math.round(dcRacks.length * 48 + dcUps.length * 1800) }, { item: 'Staff', monthly: Math.round(16000 + dcRacks.length * 35) }, { item: 'Connectivity', monthly: Math.round(cterms.filter(c => c.dataCenterId === dc.id).length * 1400) }, { item: 'Property & insurance', monthly: Math.round(dc.designPowerKw * 9) }];
    const load24h = Array.from({ length: 24 }, (_, h) => r1(totalKw * (0.9 + 0.1 * Math.sin((h - 9) / 24 * Math.PI * 2) + (r() - 0.5) * 0.03)));
    load24h[23] = totalKw;
    const history12m = Array.from({ length: 12 }, (_, k) => r1(totalKw * (0.8 + 0.2 * (k / 11)) * (1 + (r() - 0.5) * 0.03)));
    const bldByFloor = (f: T.Floor) => bldById.get(f.buildingId);
    const dcFloors = floors.filter(f => bldByFloor(f)?.dataCenterId === dc.id);
    const multiBld = new Set(dcFloors.map(f => f.buildingId)).size > 1;
    const floorName = (f: T.Floor) => (multiBld ? `${bldByFloor(f)?.name ?? 'Building'} · ${f.name}` : f.name);
    const floorList = dcFloors.map(f => ({ name: floorName(f), rooms: halls.filter(h => h.floorId === f.id).map(h => h.name) })).filter(f => f.rooms.length);
    const roomOf = (rackId: string) => { const rk = rackById.get(rackId); const h = rk ? hallById.get(rk.hallId) : undefined; const f = h ? floorById.get(h.floorId) : undefined; return { floor: f ? floorName(f) : 'Ground', room: h?.name ?? 'Hall' }; };
    const colo = COLO_TYPES.has(dc.dcTypeKey ?? '');
    const dcRacksVm = dcRacks.filter(x => x.status !== 'Retired').map(x => {
      const { floor, room } = roomOf(x.id);
      const z = x.coolingZoneId ? zoneById.get(x.coolingZoneId) : undefined;
      const p = rackPorts.get(x.id) ?? { total: x.heightU * 2, used: Math.round(x.usedU * 1.5) };
      const tenantSvc = colo ? serviceCountByRack.get(x.id)?.[0] : undefined;
      const budget = x.currentPowerKw > x.maxPowerKw * 1.1 ? r1(x.currentPowerKw / (0.9 + (seedOf(x.id) % 9) / 100)) : x.maxPowerKw;
      return { id: x.id, name: x.name, dcId: dc.id, floor, room, role: x.purpose, heightU: x.heightU, usedU: x.usedU, drawKw: r1(x.currentPowerKw), budgetKw: r1(budget), ports: p.total, portsUsed: p.used, tempC: x.currentPowerKw > 0 ? r1((z?.setpointC ?? 22) + x.powerUtilizationPct / 25 + (seedOf(x.id) % 7) / 10) : r1((z?.setpointC ?? 22) - 1), owner: x.ownerKind ?? (tenantSvc ? 'tenant' as const : colo ? 'operator' as const : undefined), tenantId: x.ownerKind ? x.tenantCustomerId : tenantSvc?.customerId, contractedKw: x.ownerKind ? x.contractedKw : tenantSvc ? r1(x.maxPowerKw * 0.8) : undefined };
    });
    const dcCracs = dcZones.flatMap(z => cracsByZone.get(z.id) ?? []);
    const zoneLabel = (zid: string | undefined) => { const h = zid ? halls.find(x => x.coolingZoneId === zid && x.dataCenterId === dc.id) : undefined; if (!h) return zoneById.get(zid ?? '')?.name ?? 'Zone'; const f = floorById.get(h.floorId); return `${f ? floorName(f) : 'Ground'} · ${h.name}`; };
    const coolCap = dcZones.reduce((s, z) => s + z.coolingCapacityKw, 0) || dc.designCoolingKw;
    const compRec = compute.find(c => c.scopeType === 'DataCenter' && c.scopeId === dc.id);
    const dcRisks = risks.filter(rk => dcProjects.some(p => p.id === rk.projectId) && rk.status !== 'Closed');
    const dcAtps = atps.filter(a => dcProjects.some(p => p.id === a.projectId));
    const dcHoto = hotos.find(h => dcProjects.some(p => p.id === h.projectId));
    const okAtp = (sys: RegExp) => dcAtps.some(a => sys.test(a.system) && a.status === 'Accepted');
    /* plant records: generators, −48 V DC plant (rectifiers and battery banks), CDUs and room sensors */
    const dcGens = generators.filter(g => g.dataCenterId === dc.id);
    const dcPlant = dcPlants.filter(p => p.dataCenterId === dc.id);
    const rects = dcPlant.filter(p => p.kind === 'Rectifier'), banks = dcPlant.filter(p => p.kind === 'Battery bank');
    const genTests = dcGens.filter(g => g.lastTestDate).sort((a, b) => (b.lastTestDate ?? '').localeCompare(a.lastTestDate ?? ''));
    const dg: Datacenter['power']['dg'] = dcGens.length ? {
      kva: dcGens.reduce((s, g) => s + g.capacityKva, 0),
      runtimeH: Math.min(...dcGens.map(g => g.fuelHours)),
      fuelPct: Math.round(45 + r() * 50),
      lastTest: ts(genTests[0]?.lastTestDate) ?? now - Math.round(5 + r() * 40) * DAY,
      result: genTests.some(g => g.lastTestResult === 'Fail') ? 'Fail' : 'Pass',
      tankLitres: dcGens.reduce((s, g) => s + (g.fuelTankLitres ?? 0), 0) || undefined, units: dcGens.length,
    } : { kva: Math.round(Math.max(totalKw * 1.6, dc.designPowerKw * 0.5)), runtimeH: Math.round(8 + r() * 16), fuelPct: Math.round(45 + r() * 50), lastTest: now - Math.round(5 + r() * 40) * DAY, result: seedOf(dc.id) % 9 === 0 ? 'Fail' : 'Pass' };
    const battery: Datacenter['power']['battery'] = banks.length ? {
      volts: banks[0].volts ?? 48, ah: banks.reduce((s, b) => s + (b.ah ?? 0), 0), runtimeH: Math.max(...banks.map(b => b.autonomyH ?? 0)),
      lastTest: Math.max(...banks.map(b => ts(b.lastTestDate) ?? 0)) || now - 30 * DAY,
    } : { volts: prof?.dcPowerPlant ? 48 : 480, ah: Math.round(600 + r() * 1200), runtimeH: r1(Math.max(10, ...dcUps.map(u => u.runtimeMinutes)) * 1.5 / 60), lastTest: now - Math.round(10 + r() * 60) * DAY };
    const dcUpsLoad = dcUps.filter(u => /^DC Plant/.test(u.name)).reduce((s, u) => s + u.loadKw, 0);
    /* the DC plant shows as a feed unless the site already records its −48 V feed as a utility feed */
    const dcFeedRows: Datacenter['power']['feeds'] = dcFeeds.some(f => f.supply === 'DC') ? [] : rects.map(x => ({ id: x.id, type: 'DC' as const, source: `DC plant · ${x.name}`, rating: x.ratedOutput ?? `48 V · ${x.capacityKw ?? 0} kW`, loadKw: r1(rects.length ? (dcUpsLoad || itKw * 0.7) / rects.length : 0), capacityKw: x.capacityKw ?? 0, status: x.status === 'Failed' ? 'Alarm' as const : x.status === 'Degraded' ? 'Warning' as const : 'Normal' as const }));
    const extraCdus = cdus.filter(c => c.dataCenterId === dc.id && !dcCracs.some(k => k.type === 'CDU' && k.coolingZoneId === c.coolingZoneId && k.name === c.name));
    const roomLabel = (hallId?: string) => { const h = hallId ? hallById.get(hallId) : undefined; if (!h) return 'Site'; const f = floorById.get(h.floorId); return `${f ? floorName(f) : 'Ground'} · ${h.name}`; };
    const rackDraw = (cduId: string) => dcRacks.filter(x => x.cduId === cduId).reduce((s, x) => s + x.currentPowerKw, 0);
    const dcSensors = envSensors.filter(x => x.dataCenterId === dc.id);
    const sensorRooms = [...new Set(dcSensors.map(x => x.hallId ?? ''))];
    const sensorRows: Datacenter['cooling']['sensors'] = sensorRooms.map(hid => {
      const list = dcSensors.filter(x => (x.hallId ?? '') === hid);
      const h = hallById.get(hid);
      const z = h?.coolingZoneId ? zoneById.get(h.coolingZoneId) : undefined;
      const failed = !!z && dcCracs.some(c => c.coolingZoneId === z.id && c.status === 'Failed');
      const base = z ? z.setpointC : 23;
      return { id: list[0].id, zone: roomLabel(hid), tempC: r1(base + (failed ? 4.5 : 1.2) + (seedOf(hid || dc.id) % 10) / 10), humidity: Math.round(38 + r() * 18), smoke: false, leak: false };
    });
    const d: Datacenter = {
      id: dc.id, locationId: dc.id, name: dc.name, status: STATUS[dc.status] ?? 'on-air', category: dc.category ?? categoryOfDc(dc.dcTypeKey), siteType: 'Datacenter', regionId: regionOfCampus(dc.campusId), circleId: dc.campusId,
      zone: db.regions.find(rg => rg.id === regionOfCampus(dc.campusId))?.name ?? '', city: dc.city ?? campus?.city ?? '', state: dc.state ?? campus?.country ?? '', address: dc.address ?? `${campus?.city ?? ''} campus · ${dc.code}`, lat: dc.latitude, lng: dc.longitude, tier: (dc.tier === 'Tier I' ? 'Tier II' : dc.tier) as Datacenter['tier'],
      commissionedOn: ts(dc.commissionedDate), collectors,
      capex: { approved, committed, spent, lines: dcProjects.length ? dcProjects.map(p => ({ item: p.name, approved: p.budget, committed: Math.min(p.budget, Math.round(p.actualSpend * 1.08)) })) : [{ item: 'Power plant', approved: Math.round(approved * 0.32), committed: Math.round(committed * 0.32) }, { item: 'Cooling plant', approved: Math.round(approved * 0.18), committed: Math.round(committed * 0.18) }, { item: 'Fit-out', approved: Math.round(approved * 0.14), committed: Math.round(committed * 0.14) }, { item: 'IT and network equipment', approved: Math.round(approved * 0.3), committed: Math.round(committed * 0.3) }, { item: 'Services and contingency', approved: Math.round(approved * 0.06), committed: Math.round(committed * 0.06) }] },
      opex: { monthly: opexDrivers.reduce((s, x) => s + x.monthly, 0), drivers: opexDrivers },
      power: {
        capacityKw: dc.designPowerKw, acKw: prof?.dcPowerPlant ? r1(itKw * 0.3) : itKw, dcKw: prof?.dcPowerPlant ? r1(itKw * 0.7) : 0, peakKw: r1(Math.max(...load24h) * 1.02), pue,
        feeds: [...dcFeeds.map((f, k) => { const x = xfmrs.find(t => t.feedId === f.id); const alarm = x?.status === 'Failed'; const standby = f.normalRole === 'Standby'; const share = dcFeeds.length === 1 ? 1 : standby ? 0 : k === 0 ? 0.55 : 0.45 / Math.max(1, dcFeeds.length - 1); return { id: f.id, type: f.supply ?? 'AC' as const, source: `${f.provider} · ${f.name}`, rating: f.ratingText ?? `${f.voltage} V · ${f.capacityKw} kW`, loadKw: alarm ? 0 : r1(totalKw * (dcFeeds.some(o => o.normalRole === 'Standby') && !standby ? 1 : share)), capacityKw: f.capacityKw, status: alarm ? 'Alarm' as const : x?.status === 'Degraded' ? 'Warning' as const : 'Normal' as const }; }), ...dcFeedRows],
        load24h, split: [{ label: 'IT load', kw: itKw }, { label: 'Cooling', kw: coolDerived }, { label: 'Lighting & other', kw: otherKw }],
        dg, battery, plant: dcPlant.length ? { rectifiers: rects.length, batteryBanks: banks.length } : undefined,
        ups: dcUps.map(u => ({ id: u.id, name: u.name, capacityKw: u.capacityKw, loadPct: u.loadPct, redundancy: (u.redundancy === '2N+1' ? '2N' : u.redundancy) as 'N' | 'N+1' | '2N', batteryMin: u.runtimeMinutes, state: u.status === 'Failed' ? 'Fault' as const : u.status === 'Degraded' ? 'On battery' as const : u.status === 'Maintenance' ? 'Bypass' as const : 'Online' as const })),
        history12m,
      },
      cooling: { capacityKw: coolCap, loadKw: coolKw, redundancy: dc.coolingRedundancy ?? (prof?.physical?.redundancy === '2N' || prof?.physical?.redundancy === '2N+1' ? '2N' : prof?.physical?.redundancy === 'N' ? 'N' : 'N+1'), units: [...dcCracs.map(c => { const z = zoneById.get(c.coolingZoneId); return { id: c.id, name: c.name, type: (c.type === 'CDU' ? 'CDU' : c.type === 'CRAC' ? 'CRAC' : 'CRAH') as 'CRAH' | 'CRAC' | 'CDU', zone: zoneLabel(z?.id), capacityKw: c.capacityKw, loadPct: z ? Math.round(z.currentLoadKw / Math.max(1, z.coolingCapacityKw) * 100) : 0, supplyC: c.supplyTempC, returnC: c.returnTempC, status: c.status === 'Failed' ? 'Failed' as const : c.status === 'Maintenance' ? 'Maintenance' as const : 'Operational' as const }; }),
        ...extraCdus.map(c => ({ id: c.id, name: c.name, type: 'CDU' as const, zone: roomLabel(c.hallId), capacityKw: c.capacityKw, loadPct: Math.round(rackDraw(c.id) / Math.max(1, c.capacityKw) * 100), supplyC: c.designSupplyC ?? 32, returnC: (c.designSupplyC ?? 32) + 8, status: c.status === 'Failed' ? 'Failed' as const : c.status === 'Maintenance' ? 'Maintenance' as const : 'Operational' as const }))],
        sensorCount: dcSensors.length, sensorKinds: dcSensors.reduce<Record<string, number>>((a, x) => { a[x.kind] = (a[x.kind] ?? 0) + 1; return a; }, {}),
        sensors: sensorRows.length ? sensorRows : dcZones.map(z => { const failed = dcCracs.some(c => c.coolingZoneId === z.id && c.status === 'Failed'); return { id: `ENV-${z.id}`, zone: zoneLabel(z.id), tempC: r1(z.setpointC + (failed ? 4.5 : 1.2) + (seedOf(z.id) % 10) / 10), humidity: Math.round(38 + r() * 18), smoke: false, leak: false }; }) },
      floors: floorList.length ? floorList : [{ name: 'Ground', rooms: ['Hall 1'] }],
      racks: dcRacksVm,
      ports: [...(portsByDc.get(dc.id) ?? new Map<string, { total: number; used: number }>()).entries()].map(([cls, v]) => ({ cls, total: v.total, used: v.used })).sort((a, b) => b.total - a.total),
      cabling: (() => { const cs = cablesByDc.get(dc.id) ?? []; const ledger: Datacenter['cabling']['ledger'] = cs.slice(0, 144).map((c, i) => { const a = compById.get(c.aComponentId), b = compById.get(c.bComponentId); const aNe = db.neById.has(c.aDeviceId); return { port: i + 1, state: (c.status === 'Planned' ? 'free' : aNe ? 'connected' : 'direct') as 'free' | 'connected' | 'direct', strand: String(c.cableType), neId: aNe ? c.aDeviceId : undefined, inIf: a?.name, outPort: i + 1, outIf: b ? `${db.neById.get(c.bDeviceId)?.name ?? c.bDeviceId} ${b.name}` : undefined }; }); const spare = Math.max(0, Math.min(24, Math.round(ledger.length * 0.15))); for (let i = 0; i < spare; i++) ledger.push({ port: ledger.length + 1, state: 'free' }); return { cable: 'Structured trunks', cores: ledger.length, ledger }; })(),
      compute: { cpuCores: compRec?.cpuCoresTotal ?? 0, cpuUsed: compRec?.cpuCoresUsed ?? 0, memGb: compRec?.memoryGbTotal ?? 0, memUsed: compRec?.memoryGbUsed ?? 0, storageTb: compRec?.storageTbTotal ?? 0, storageUsed: compRec?.storageTbUsed ?? 0 },
      risks: dcRisks.filter((rk, i, arr) => arr.findIndex(o => o.description === rk.description) === i).map(rk => ({ id: rk.id, domain: (rk.category === 'Vendor' ? 'Supplier' : rk.category === 'Schedule' ? 'Commissioning' : /power|cool|ups|thermal|density/i.test(rk.description) ? 'Facility' : /network|fiber|fibre|uplink|optic|cutover/i.test(rk.description) ? 'Network' : rk.category === 'Capacity' ? 'Facility' : /inventor|asset|drift/i.test(rk.description) ? 'Inventory' : 'Network') as Datacenter['risks'][number]['domain'], title: rk.description.split(/[.;—]/)[0].slice(0, 70), detail: `${rk.category} risk · ${rk.probability} probability, ${rk.impact} impact. Mitigation: ${rk.mitigation}`, severity: rk.level === 'Critical' ? 'critical' : rk.level === 'High' ? 'major' : rk.level === 'Medium' ? 'minor' : 'warning', owner: 'Programme office', opened: ts(rk.createdAt) ?? now - 10 * DAY })),
      readiness: dc.status === 'Operational' ? [] : [
        { step: 'Power IST accepted', done: okAtp(/power|ups|electrical/i) }, { step: 'Cooling IST accepted', done: okAtp(/cool|mech/i) }, { step: 'Network acceptance', done: okAtp(/network|fabric/i) },
        { step: 'Monitoring live', done: nes.some(n => n.discovery !== 'not-discovered'), note: nes.length ? `${nes.filter(n => n.discovery !== 'not-discovered').length} of ${nes.length} devices reporting` : undefined }, { step: 'HOTO signed', done: dcHoto?.status === 'Accepted' || dcHoto?.status === 'Accepted with conditions', note: dcHoto?.status },
      ],
    };
    /* derived facility risks (mirrors dcos-ops) */
    const nd = nes.filter(n => n.discovery === 'not-discovered').length, dr = nes.filter(n => n.discovery === 'drifted').length;
    const R = (domain: Datacenter['risks'][number]['domain'], title: string, detail: string, severity: Severity, owner: string, opened: number) => d.risks.push({ id: `${dc.id}-R${d.risks.length + 1}`, domain, title, detail, severity, owner, opened });
    if (nd) R('Inventory', `${nd} devices not discovered`, 'Planned or no collector — reconcile to close the record gap', nd > 20 ? 'major' : 'minor', 'Asset & inventory', now - 12 * DAY);
    if (dr) R('Inventory', `${dr} devices drifted from record`, 'Includes duplicate serials — verify and update the record', dr > 10 ? 'major' : 'minor', 'Asset & inventory', now - 6 * DAY);
    for (const c of d.collectors) if (c.state !== 'up') R('Inventory', `${c.name} stale`, 'Discovery paused for part of the site; freshness SLA 15 min', 'major', 'NOC tooling', c.lastSeen);
    for (const u of d.cooling.units) if (u.status === 'Failed') R('Facility', `${u.name} failed`, `${u.zone} cooling at N — redundancy lost`, 'critical', 'Facility ops', now - 4 * HOUR);
    for (const u of d.power.ups) if (u.state !== 'Online') R('Facility', `${u.name} ${u.state.toLowerCase()}`, u.state === 'On battery' ? 'Feed lost — DG start pending' : 'Unit out of service — redundancy reduced', u.state === 'Bypass' ? 'major' : 'critical', 'Facility ops', now - HOUR);
    const hot = hotByDc.get(dc.id) ?? 0;
    if (hot) R('Network', `${hot} uplink${hot > 1 ? 's' : ''} ≥85% utilised`, 'Forecast to cross 95% critical inside the planning window', 'major', 'Capacity planning', now - 9 * DAY);
    db.datacenters.push(d);
    db.locations.push({ id: dc.id, name: dc.name, kind: 'datacenter', status: d.status, circleId: dc.campusId, regionId: d.regionId, city: d.city, state: d.state, lat: dc.latitude, lng: dc.longitude, category: d.category, neCount: nes.length, discovered: nes.filter(n => n.discovery !== 'not-discovered').length, roles: nes.reduce<Record<string, number>>((acc, n) => { acc[n.role] = (acc[n.role] ?? 0) + 1; return acc; }, {}), blocker: dc.status === 'Construction' ? 'commissioning' : undefined, passive: { fiberSpans: Math.round(dcRacks.length / 6), odf: Math.max(1, Math.round(dcRacks.length / 40)), racks: dcRacks.length, powerPlant: dcUps.length, splices: Math.round(dcRacks.length / 10), patchCords: d.cabling.cores, ducts: Math.max(1, Math.round(dcRacks.length / 60)) } });
  });

  /* ---- alerts: device alarms from the NMS, facility alarms derived from plant state */
  const linkByEnd = new Map<string, Link>();
  for (const l of db.links) if (l.protocol === 'LLDP') { linkByEnd.set(`${l.aNe}|${l.aIf}`, l); linkByEnd.set(`${l.zNe}|${l.zIf}`, l); }
  for (const a of alarms) {
    const ne = db.neById.get(a.deviceId);
    const md = mdById.get(a.deviceId);
    const dcId = ne?.dcId ?? md?.dataCenterId ?? a.dataCenterId; if (!dcId) continue;
    const iface = a.interfaceId ? ifaceById.get(a.interfaceId) : undefined;
    const link = ne && iface ? linkByEnd.get(`${ne.id}|${iface.name}`) : undefined;
    const source = SOURCE_OF(a.type);
    const al: Alert = {
      id: a.id, code: a.almId, neId: ne?.id, dcId, ifName: iface?.name, linkId: link?.id, severity: SEV[a.severity] ?? 'warning', title: a.type, description: a.probableCause + (a.count && a.count > 1 ? ` · ${a.count} occurrences` : '') + (a.flapCount ? ` · flapped ${a.flapCount}×` : ''),
      source, type: /util|capacity/i.test(a.type) ? 'Capacity' : /link|interface|optic/i.test(a.type) ? 'Connectivity' : /psu|fan|temp|power/i.test(a.type) ? 'Hardware' : /cpu|mem/i.test(a.type) ? 'Performance' : /config|drift/i.test(a.type) ? 'Configuration' : 'Fault',
      start: ts(a.raisedAt) ?? now - HOUR, state: a.state === 'Cleared' ? 'cleared' : a.state === 'Acknowledged' ? 'acknowledged' : 'active', incidentId: a.incidentId, ackBy: a.acknowledgedBy,
      scope: 'site', category: 'Network', node: ne ? undefined : a.nodeName, rackId: !ne && a.linkRef && rackById.has(a.linkRef) ? a.linkRef : undefined,
    };
    al.scope = !ne && a.nodeName && (a.scope === 'downstream' || a.scope === 'edge' || a.scope === 'dependency') ? a.scope : scopeOf(db, al); al.category = categoryOf(al);
    db.alerts.push(al);
  }
  const fac = (id: string, a: Omit<Alert, 'id' | 'code' | 'scope' | 'category' | 'state'> & { state?: Alert['state'] }) => {
    const state = facilityAck.get(id) ?? a.state ?? 'active';
    const al: Alert = { ...a, id, code: id, state, scope: a.title === 'Collector Stale' ? 'dependency' : 'site', category: a.title === 'Collector Stale' ? 'Network' : 'Facility' };
    db.alerts.push(al);
  };
  for (const d of db.datacenters) {
    if (d.status !== 'on-air' && d.status !== 'decommissioning') continue; // plant under commissioning is not alarmed
    for (const u of d.power.ups) {
      if (u.state === 'On battery') fac(`FAC-${u.id}-BAT`, { neId: undefined, dcId: d.id, severity: 'critical', title: 'UPS On Battery', description: `${u.name}: utility feed lost; ${u.batteryMin} min autonomy at ${u.loadPct}% load`, source: 'Power', type: 'Power', start: now - 23 * MIN });
      if (u.state === 'Fault') fac(`FAC-${u.id}-FLT`, { neId: undefined, dcId: d.id, severity: 'critical', title: 'UPS Fault', description: `${u.name}: inverter fault — load transferred to static bypass`, source: 'Power', type: 'Power', start: now - 3 * HOUR });
      if (u.state === 'Bypass') fac(`FAC-${u.id}-BYP`, { neId: undefined, dcId: d.id, severity: 'minor', title: 'UPS On Bypass', description: `${u.name}: maintenance bypass engaged`, source: 'Power', type: 'Power', start: now - 6 * HOUR });
    }
    for (const f of d.power.feeds) if (f.status === 'Alarm') fac(`FAC-${f.id}-ALM`, { neId: undefined, dcId: d.id, severity: 'critical', title: 'Utility Feed Lost', description: `${f.source}: transformer offline`, source: 'Power', type: 'Power', start: now - 25 * MIN });
    for (const c of d.cooling.units) if (c.status === 'Failed') fac(`FAC-${c.id}-FLD`, { neId: undefined, dcId: d.id, severity: 'major', title: 'Cooling Unit Failed', description: `${c.name} (${c.zone}): compressor fault; zone running at N`, source: 'Cooling', type: 'Cooling', start: now - 4 * HOUR });
    for (const s of d.cooling.sensors) if (s.tempC > 27) fac(`FAC-${s.id}-HOT`, { neId: undefined, dcId: d.id, severity: s.tempC > 30 ? 'major' : 'minor', title: 'Zone Temperature High', description: `${s.zone} at ${s.tempC} °C — above the 27 °C ASHRAE recommended ceiling`, source: 'Environment', type: 'Environment', start: now - 2 * HOUR });
    for (const rk of d.racks) if (rk.budgetKw > 0 && rk.drawKw / rk.budgetKw >= 0.9) fac(`FAC-${rk.id}-PWR`, { neId: undefined, dcId: d.id, severity: 'major', title: 'Rack Power Budget', description: `${rk.name} at ${Math.round(rk.drawKw / rk.budgetKw * 100)}% of ${rk.budgetKw} kW budget`, source: 'Power', type: 'Capacity', start: now - 5 * HOUR, rackId: rk.id });
    for (const c of d.collectors) if (c.state !== 'up') fac(`FAC-${c.id}-STALE`, { neId: undefined, dcId: d.id, severity: 'major', title: 'Collector Stale', description: `${c.name} last seen ${Math.round((now - c.lastSeen) / MIN)} min ago — freshness SLA 15 min`, source: 'Discovery', type: 'Discovery', start: c.lastSeen });
  }

  /* ---- edge locations (PoPs and access sites): summary records, downstream of their campus's data centres */
  for (const l of edgeLocs) {
    db.locations.push({ id: l.id, name: l.name, kind: l.kind, status: l.status, circleId: l.campusId, regionId: l.regionId, city: l.city, state: l.country, lat: l.latitude, lng: l.longitude, category: l.category, neCount: l.neCount, discovered: l.discovered, roles: l.roles, blocker: l.blocker, blockerNote: l.blockerNote, passive: l.passive });
  }
  /* downstream alarms: faults at PoPs and sites that hang off a live data centre never count against the site;
     behind a data centre edge fault, remote alarms are symptoms of it */
  const DOWN: [string, string, Severity, Alert['source'], string, Alert['category']][] = [
    ['Fan Tray Failure', 'Fan tray 2 reports failure; temperature rising', 'major', 'Environment', 'Hardware', 'Device'],
    ['Mains Power Failure', 'Running on battery after grid loss', 'critical', 'Power', 'Power', 'Facility'],
    ['Device Unreachable', 'ICMP 100% loss; last-mile fibre cut reported', 'critical', 'Interface', 'Reachability', 'Network'],
    ['High CPU Utilization', 'CPU above 90% for 25 minutes', 'minor', 'CPU', 'CPU', 'Performance'],
    ['Optical Power Low', 'Rx power below the warning threshold on the uplink', 'minor', 'Interface', 'Connectivity', 'Network'],
    ['Battery Low', 'Battery autonomy below 30 minutes', 'major', 'Power', 'Power', 'Facility'],
  ];
  let dseq = 0;
  for (const d of db.datacenters) {
    if (d.status !== 'on-air') continue;
    const mine = edgeLocs.filter(l => l.campusId === d.circleId && l.status === 'on-air');
    if (!mine.length) continue;
    const r = mulberry32(seedOf(`${d.id}-down`));
    const count = 1 + Math.floor(r() * 3);
    for (let k = 0; k < count; k++) {
      const l = mine[Math.floor(r() * mine.length)];
      const f = DOWN[Math.floor(r() * DOWN.length)];
      const id = `ALM-DS-${String(++dseq).padStart(3, '0')}`;
      db.alerts.push({ id, code: id, dcId: d.id, severity: f[2], title: f[0], description: f[1], source: f[3], type: f[4], start: now - Math.floor(r() * 20 * 60) * MIN, state: facilityAck.get(id) ?? (r() < 0.2 ? 'acknowledged' : 'active'), scope: 'downstream', category: f[5], node: `${l.name} · ${l.kind === 'pop' ? 'edge router' : 'access switch'} ${l.locId.slice(-2)}`, nodeLocation: `${l.city}, ${l.country}`, hops: l.kind === 'pop' ? 1 : 2 });
    }
    /* symptoms behind a site edge fault: remote devices lose reachability through the failed link */
    const edgeDown = db.alerts.find(a => a.dcId === d.id && a.scope === 'edge' && a.title === 'Link Down' && a.state !== 'cleared');
    if (edgeDown) {
      mine.slice(0, 2).forEach((l, k) => { const id = `ALM-DS-${String(++dseq).padStart(3, '0')}`; db.alerts.push({ id, code: id, dcId: d.id, severity: 'major', title: 'Device Unreachable', description: `Reachability lost through ${edgeDown.code}`, source: 'Interface', type: 'Reachability', start: edgeDown.start + (k + 1) * MIN, state: facilityAck.get(id) ?? 'active', scope: 'downstream', category: 'Network', node: `${l.name} · edge router ${l.locId.slice(-2)}`, nodeLocation: `${l.city}, ${l.country}`, hops: 1, symptomOf: edgeDown.code }); });
    }
  }

  /* ---- incidents */
  const impact = (scope: { neIds?: string[]; linkIds?: string[]; dcIds?: string[]; rackIds?: string[] }) => {
    const ne = new Set(scope.neIds ?? []), ln = new Set(scope.linkIds ?? []), dcIds = new Set(scope.dcIds ?? []), rk = new Set(scope.rackIds ?? []);
    const svcs = db.services.filter(s => s.status !== 'Disabled' && (ne.has(s.neId) || s.path.some(p => ne.has(p)) || s.linkIds.some(l => ln.has(l)) || dcIds.has(s.dcId) || (rk.size && db.neById.get(s.neId)?.rackId && rk.has(db.neById.get(s.neId)!.rackId))));
    const custIds = [...new Set(svcs.map(s => s.customerId))];
    const premium = custIds.filter(id => db.customers.find(c => c.id === id)?.premium);
    return { services: svcs.length, customers: custIds.length, premium: premium.length, revenue: svcs.reduce((a, s) => a + s.revenueMonthly, 0) };
  };
  const TYPE_OF = (t: string): Incident['type'] => /power|ups|pdu|feed|electr/i.test(t) ? 'Power' : /cool|crah|crac|chiller|therm|temp/i.test(t) ? 'Cooling' : /rack/i.test(t) ? 'Rack' : /capacity|util|exhaust/i.test(t) ? 'Capacity' : /secur|auth|access|badge/i.test(t) ? 'Security' : 'Network';
  const SEVN: Record<string, 1 | 2 | 3 | 4> = { SEV1: 1, SEV2: 2, SEV3: 3, SEV4: 4 };
  const RESP = { 1: 15, 2: 30, 3: 60, 4: 240 } as const, RESV = { 1: 240, 2: 480, 3: 1440, 4: 4320 } as const;
  const rcaFor = (inc: T.Incident, type: Incident['type'], alertIds: string[]): Incident['rca'] => {
    const ev = alertIds.map(id => db.alerts.find(a => a.id === id)).filter(Boolean).map(a => ({ label: `${a!.code}: ${a!.title} — ${a!.description}`, ref: a!.id, at: a!.start }));
    const chg = inc.linkedChangeRequestId ? [{ label: `Change ${inc.linkedChangeRequestId} touched the affected scope in the previous 72 h`, ref: inc.linkedChangeRequestId }] : [];
    const first = inc.rootCause ?? ({ Network: 'Physical layer fault on the affected link or optic', Power: 'Upstream feed loss; UPS carried the load until transfer', Cooling: 'Cooling unit compressor fault left the zone at N, redundancy lost', Rack: 'Rack draw above its power budget after a dense install', Capacity: 'Sustained utilisation growth crossed the warning threshold', Security: 'Credential misuse against the management plane' } as Record<Incident['type'], string>)[type];
    const h = seedOf(inc.id) % 13;
    return [
      { cause: first, confidence: 72 + h, evidence: ev.length ? ev.slice(0, 4) : [{ label: 'Correlated telemetry on the affected scope', at: ts(inc.detectedAt) }] },
      { cause: chg.length ? 'Recent change introduced the fault' : type === 'Network' ? 'Upstream dependency fault (far-end or transport)' : 'Sensor or collector error, not a real fault', confidence: 20 - Math.floor(h / 2), evidence: chg.length ? chg : [{ label: 'Not yet ruled out — check upstream links and collector freshness' }] },
      { cause: 'Latent hardware defect (vendor advisory pending)', confidence: 8 - Math.floor(h / 3), evidence: [{ label: 'No matching advisory on file' }] },
    ];
  };
  const actionsFor = (type: Incident['type'], status: string): Incident['actions'] => {
    const base: Omit<Incident['actions'][number], 'id' | 'status'>[] = type === 'Power'
      ? [{ step: 'Confirm DG start and transfer; verify fuel and battery autonomy', owner: 'Facility', expected: 'Load on DG within 15 s', rollback: 'n/a', verify: 'UPS output stable, DG at load', disruptive: false }, { step: 'Isolate failed feed and notify utility', owner: 'Facility', expected: 'Feed B carries full load', rollback: 'Return to feed A on restoration', verify: 'ATS position B, no alarms', disruptive: false }, { step: 'Shed non-critical load if autonomy < 10 min', owner: 'Facility lead', expected: 'Autonomy extended', rollback: 'Restore load after transfer', verify: 'Critical racks powered', disruptive: true }]
      : type === 'Cooling'
      ? [{ step: 'Start standby unit and raise fan speed on neighbours', owner: 'Facility', expected: 'Zone temperature falling within 10 min', rollback: 'Return units to auto', verify: 'Inlet temperatures below 27 °C', disruptive: false }, { step: 'Dispatch vendor for compressor replacement', owner: 'Facility', expected: 'Unit back in 4 h', rollback: 'n/a', verify: 'Unit running, alarms cleared', disruptive: false }, { step: 'Move workloads off the hottest racks', owner: 'Platform', expected: 'Heat load reduced 15%', rollback: 'Move back after repair', verify: 'Rack inlets within range', disruptive: true }]
      : [{ step: 'Run diagnostics bundle (interfaces, optics, logs)', owner: 'NOC', expected: 'Evidence for RCA', rollback: 'n/a', verify: 'Bundle attached', disruptive: false }, { step: 'Fail traffic over to the redundant path', owner: 'NOC', expected: 'Services restored on path B', rollback: 'Revert routing policy', verify: 'Services within SLA', disruptive: true }, { step: 'Replace optic or re-patch and verify light levels', owner: 'Field', expected: 'Rx within spec', rollback: 'Reinstall original optic', verify: 'Link up, errors zero for 15 min', disruptive: false }];
    const done = status === 'Resolved' || status === 'Closed';
    return base.map((s, k) => ({ ...s, id: `A${k + 1}`, status: done ? 'done' : status === 'Mitigated' ? (k < 2 ? 'done' : 'running') : status === 'Investigating' ? (k === 0 ? 'done' : s.disruptive ? 'awaiting-approval' : 'pending') : 'pending' }));
  };
  for (const inc of incidents) {
    const sev = SEVN[inc.severity] ?? 3;
    const neIds = inc.affectedResourceIds.filter(id => db.neById.has(id));
    const rackIds = inc.affectedResourceIds.filter(id => rackById.has(id));
    const dcId = inc.dataCenterId ?? (neIds.length ? db.neById.get(neIds[0])!.dcId : rackIds.length ? rackById.get(rackIds[0])!.dataCenterId : db.datacenters[0]?.id ?? '');
    const type = /^network/i.test(inc.title) ? 'Network' as const : TYPE_OF(inc.type + ' ' + inc.title);
    const alertIds = (inc.linkedAlarmIds ?? []).filter(id => db.alerts.some(a => a.id === id));
    const facility = inc.affectedResourceType === 'PowerChain' || inc.affectedResourceType === 'Cooling';
    const plantIds = inc.affectedResourceIds.filter(id => !db.neById.has(id) && !rackById.has(id) && devById.has(id));
    const earliestAlarm = Math.min(...alertIds.map(id => db.alerts.find(a => a.id === id)?.start ?? Infinity));
    const detectedRaw = ts(inc.detectedAt) ?? now;
    const detected = Number.isFinite(earliestAlarm) && earliestAlarm < detectedRaw - 2 * HOUR ? earliestAlarm + 2 * MIN : detectedRaw;
    const alarmLinks = alertIds.map(id => db.alerts.find(a => a.id === id)?.linkId).filter((x): x is string => !!x);
    const im = impact(facility ? { dcIds: [dcId] } : { neIds, rackIds, linkIds: alarmLinks });
    const ops = inc.ops ?? {};
    const affected: Incident['affected'] = ops.affected ?? [
      ...neIds.map(id => ({ kind: 'NE' as const, id, label: db.neById.get(id)!.name })),
      ...rackIds.map(id => ({ kind: 'Rack' as const, id, label: rackById.get(id)!.name })),
      ...plantIds.map(id => ({ kind: 'Facility' as const, id, label: devById.get(id)!.hostname ?? devById.get(id)!.name })),
      ...(facility ? [{ kind: 'Facility' as const, id: `${inc.affectedResourceType}-${dcId}`, label: `${inc.affectedResourceType === 'PowerChain' ? 'Power chain' : 'Cooling'} · ${db.datacenters.find(d => d.id === dcId)?.name ?? dcId}` }] : []),
    ];
    const rca = ops.rca ?? rcaFor(inc, type, alertIds);
    const actions = ops.actions ?? actionsFor(type, inc.status);
    const verification = ops.verification ?? [{ check: 'All correlated alarms cleared', ok: inc.status === 'Resolved' || inc.status === 'Closed' ? true : null }, { check: 'Health checks green for 15 minutes', ok: inc.status === 'Resolved' || inc.status === 'Closed' ? true : null }, { check: 'Affected services back within SLA', ok: inc.status === 'Resolved' || inc.status === 'Closed' ? true : null }];
    const worklog: Incident['worklog'] = [
      ...(inc.worklog ?? []).map(w => ({ at: ts(w.at) ?? now, who: w.author, text: w.text, kind: (w.author === 'System' || w.kind === 'StatusChange' ? 'system' : 'human') as 'system' | 'human' })),
      ...(ops.opsLog ?? []),
    ].sort((a, b) => a.at - b.at);
    if (!worklog.length) worklog.push({ at: ts(inc.detectedAt) ?? now, who: 'Monitoring', text: alertIds.length ? 'Raised from correlated alarms.' : `Reported by ${inc.reportedBy ?? 'NOC'}.`, kind: 'system' });
    db.incidents.push({
      id: inc.id, title: inc.title, type, sev, pri: (SEVN[inc.priority?.replace('P', 'SEV') ?? ''] ?? sev), status: inc.status, owner: inc.assignee ?? 'Unassigned', reportedBy: inc.reportedBy ?? 'NOC', dcId,
      detected, acknowledged: ts(inc.acknowledgedAt) !== undefined ? Math.max(detected, ts(inc.acknowledgedAt)!) : undefined, resolved: ts(inc.resolvedAt) !== undefined ? Math.max(detected, ts(inc.resolvedAt)!) : undefined, responseSlaMin: inc.slaResponseMins ?? RESP[sev], resolveSlaMin: inc.slaResolveMins ?? RESV[sev],
      alertIds, affected, rca, actions, changeIds: ops.changeIds ?? (inc.linkedChangeRequestId ? [inc.linkedChangeRequestId] : []), worklog,
      impact: { services: im.services, customers: im.customers, premium: im.premium, revenueAtRisk: im.revenue, level: sev === 1 || im.premium >= 2 ? 'High' : im.services ? 'Medium' : 'Low', summary: im.services ? `${im.services} service${im.services > 1 ? 's' : ''} and ${im.customers} customer${im.customers > 1 ? 's' : ''} on the affected scope${im.premium ? `, ${im.premium} premium` : ''}.` : 'No customer service on the affected scope.' },
      similar: seedOf(inc.id) % 4 === 0 ? { text: `${2 + (seedOf(inc.id) % 3)} similar ${type.toLowerCase()} incidents in the last 90 days on the same asset class`, nodes: neIds.slice(0, 2) } : null,
      verification, feedback: ops.feedback,
    });
  }

  /* ---- changes and maintenance */
  const CSTATUS: Record<string, ChangeStatus> = { Draft: 'Draft', Submitted: 'Pending approval', UnderReview: 'Pending approval', Approved: 'Approved', Scheduled: 'Approved', InProgress: 'In progress', Implemented: 'Completed', Closed: 'Completed', Rejected: 'Rejected', Cancelled: 'Rejected', RolledBack: 'Rolled back' };
  const incByChange = new Map(db.incidents.flatMap(i => i.changeIds.map(c => [c, i.id] as const)));
  const mwByChange = new Map(mws.filter(m => m.changeRequestId).map(m => [m.changeRequestId!, m]));
  for (const c of changes) {
    const scope = [...c.affectedResourceIds.filter(id => db.neById.has(id)), ...c.affectedResourceIds.filter(id => rackById.has(id)).flatMap(rid => db.nes.filter(n => n.rackId === rid).map(n => n.id))].slice(0, 12);
    const suffix = /—\s*([A-Z]{3}-[A-Z0-9]+)\s*$/.exec(c.title)?.[1];
    const byCode = suffix ? dcs.find(x => x.code === suffix) : undefined;
    const dcId = byCode?.id ?? c.dataCenterId ?? (scope.length ? db.neById.get(scope[0])!.dcId : db.datacenters[0]?.id ?? '');
    const mw = mwByChange.get(c.id);
    const createdRaw = ts(c.createdAt) ?? now - 3 * DAY;
    const openish = ['Draft', 'Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress'].includes(c.status);
    const created = openish ? Math.max(createdRaw, now - (seedOf(c.id) % 28 + 1) * DAY) : createdRaw;
    const at22 = (t: number) => { const d = new Date(t); d.setHours(22, 0, 0, 0); return d.getTime(); };
    const ws = ts(c.scheduledStart) ?? ts(mw?.scheduledStart) ?? at22(created + (2 + seedOf(c.id) % 9) * DAY);
    const we = ts(c.scheduledEnd) ?? ts(mw?.scheduledEnd) ?? ws + 4 * HOUR;
    const approver = steps.find(s => s.changeRequestId === c.id && s.decision === 'Approved');
    db.changes.push({ id: c.id, kind: mw ? 'Maintenance' : 'Change', title: c.title, dcId, scope, risk: c.risk === 'Critical' ? 'High' : c.risk === 'Low' ? 'Low' : c.risk === 'Medium' ? 'Medium' : 'High', status: CSTATUS[c.status] ?? 'Draft', windowStart: ws, windowEnd: we, requester: c.requestedBy, approver: approver ? (c.extRef && c.assignedTo ? c.assignedTo : PEOPLE.filter(p => p.role !== 'Administrator')[seedOf(approver.approverRole + c.id) % (PEOPLE.length - 1)]?.name ?? approver.approverRole) : undefined, rollback: c.rollbackPlan ?? 'Per runbook', created, emergency: c.priority === 'Urgent', incidentId: incByChange.get(c.id) });
  }
  for (const m of mws) {
    if (m.changeRequestId) continue;
    const scope = (m.affectedDeviceIds ?? []).filter(id => db.neById.has(id));
    db.changes.push({ id: m.id, kind: 'Maintenance', title: m.title, dcId: m.dataCenterId ?? (scope.length ? db.neById.get(scope[0])!.dcId : db.datacenters[0]?.id ?? ''), scope, risk: /redundancy|restart/i.test(m.impact) ? 'Medium' : 'Low', status: m.status === 'Completed' ? 'Completed' : m.status === 'Cancelled' ? 'Rejected' : m.status === 'In Progress' ? 'In progress' : 'Approved', windowStart: ts(m.scheduledStart) ?? now, windowEnd: ts(m.scheduledEnd) ?? now + 4 * HOUR, requester: m.owner, approver: m.status === 'Scheduled' || m.status === 'In Progress' || m.status === 'Completed' ? 'Facility lead' : undefined, rollback: 'Return plant to auto; re-enable alarms', created: ts(m.createdAt) ?? now - 5 * DAY });
  }

  /* ---- reconciliation, audit, plans */
  for (const n of db.nes) {
    if (n.discovery === 'verified') continue;
    const kind: ReconTask['kind'] = n.duplicateSerialOf ? 'duplicate-serial' : n.discovery === 'drifted' ? 'drift' : 'not-discovered';
    db.recon.push({ id: `REC-${String(++db.seq.rec).padStart(4, '0')}`, dcId: n.dcId, neId: n.id, kind, status: seedOf(n.id) % 5 === 0 ? 'In progress' : 'Open', assignee: seedOf(n.id) % 5 === 0 ? PEOPLE[4].name : undefined, created: now - (seedOf(n.id) % 20 + 1) * DAY });
  }
  for (const a of audits.slice(-400)) db.audit.push({ id: a.id, at: Math.min(ts(a.timestamp) ?? now, now), actor: a.actorName, object: a.entityId, field: a.action, prev: '', next: a.summary, source: a.entityType });
  for (const p of plans) db.plans.push({ id: p.id, dcId: p.dataCenterId, dimension: p.dimension, title: p.title, amount: p.amount, unit: p.unit, target: ts(p.targetDate) ?? now + 60 * DAY, status: p.status, capex: p.capex });

  finaliseHealth(db);
  return db;
}

/** Remember an acknowledgement on a derived facility alarm (no DCOS record to write). */
export const rememberFacilityState = (id: string, state: Alert['state']) => { if (id.startsWith('FAC-') || id.startsWith('ALM-DS-')) facilityAck.set(id, state); };
export { MIN, HOUR, DAY };
