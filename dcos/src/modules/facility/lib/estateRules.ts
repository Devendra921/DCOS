/**
 * Estate model rules — pure lookups and roll-ups over the estate-model additions
 * (room types, liquid cooling and CDUs, plant, sensors, collectors, GPU clusters, tenancy).
 *
 * No React and no store access: every function takes the records it needs, so pages,
 * the operations adapter and the smoke scripts share one reading of the data.
 * Agents B and C may APPEND exports here; do not change existing signatures.
 */
import type * as T from '../../../mock/data/types';

/* ───────────────────────────── rooms ───────────────────────────── */

export const ROOM_TYPES: readonly T.RoomType[] = ['Data hall', 'AI hall', 'Network room', 'Meet-me room', 'NOC', 'UPS room', 'Battery room', 'Plant room'];
export type RoomGroup = 'White space' | 'Network' | 'Power and plant' | 'Operations';
export const ROOM_GROUP: Record<T.RoomType, RoomGroup> = {
  'Data hall': 'White space', 'AI hall': 'White space', 'Network room': 'Network', 'Meet-me room': 'Network',
  'NOC': 'Operations', 'UPS room': 'Power and plant', 'Battery room': 'Power and plant', 'Plant room': 'Power and plant',
};
export const ROOM_GROUPS: readonly RoomGroup[] = ['White space', 'Network', 'Power and plant', 'Operations'];

/** A hall's room type; halls seeded before room types existed are data halls. */
export const roomTypeOf = (h: Pick<T.Hall, 'roomType'>): T.RoomType => h.roomType ?? 'Data hall';
/** Rooms that hold racks: data and AI halls, and any room that has racks in it (a CO equipment room, an MMR with cabinets). */
export const holdsRacks = (h: Pick<T.Hall, 'roomType' | 'rackCount'>): boolean => ROOM_GROUP[roomTypeOf(h)] === 'White space' || (h.rackCount ?? 0) > 0;
export const isWhiteSpace = (h: Pick<T.Hall, 'roomType'>): boolean => ROOM_GROUP[roomTypeOf(h)] === 'White space';

/** Rooms of a site, optionally limited to some room types; in room-type order, then by name. */
export function roomsOfSite<H extends T.Hall>(halls: readonly H[], dcId: string, types?: readonly T.RoomType[]): H[] {
  const order = (h: H) => ROOM_TYPES.indexOf(roomTypeOf(h));
  return halls.filter((h) => h.dataCenterId === dcId && !h.isDeleted && (!types || types.includes(roomTypeOf(h))))
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Rooms grouped by room type (types with no rooms are left out). */
export function groupRoomsByType<H extends T.Hall>(halls: readonly H[]): { type: T.RoomType; group: RoomGroup; rooms: H[] }[] {
  return ROOM_TYPES.map((type) => ({ type, group: ROOM_GROUP[type], rooms: halls.filter((h) => roomTypeOf(h) === type) })).filter((g) => g.rooms.length);
}

/** Rooms grouped into white space / network / power and plant / operations. */
export function groupRoomsByGroup<H extends T.Hall>(halls: readonly H[]): { group: RoomGroup; rooms: H[] }[] {
  return ROOM_GROUPS.map((group) => ({ group, rooms: halls.filter((h) => ROOM_GROUP[roomTypeOf(h)] === group) })).filter((g) => g.rooms.length);
}

export function racksOfHall<R extends T.Rack>(racks: readonly R[], hallId: string): R[] {
  return racks.filter((r) => r.hallId === hallId && !r.isDeleted).sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX);
}

/* ───────────────────────────── liquid cooling ───────────────────────────── */

export interface CduLoad {
  cdu: T.Cdu;
  racks: T.Rack[];
  /** Live draw of the racks it feeds (kW) — what the loop carries now. */
  drawKw: number;
  /** Sum of the racks' power budgets (kW) — what it would carry at full build-out. */
  designKw: number;
  capacityKw: number;
  loadPct: number;
  designPct: number;
  headroomKw: number;
  /** Live draw above the rating. */
  overloaded: boolean;
  /** Full-power design above the rating (a planning warning, not a fault). */
  overDesign: boolean;
}

/** Racks a CDU serves and how loaded it is. */
export function cduLoad(cdu: T.Cdu, racks: readonly T.Rack[]): CduLoad {
  const served = racks.filter((r) => r.cduId === cdu.id && !r.isDeleted);
  const drawKw = Math.round(served.reduce((a, r) => a + (r.currentPowerKw || 0), 0) * 10) / 10;
  const designKw = Math.round(served.reduce((a, r) => a + (r.maxPowerKw || 0), 0));
  const cap = cdu.capacityKw || 0;
  return {
    cdu, racks: served, drawKw, designKw, capacityKw: cap,
    loadPct: cap ? Math.round((drawKw / cap) * 100) : 0, designPct: cap ? Math.round((designKw / cap) * 100) : 0,
    headroomKw: Math.round((cap - drawKw) * 10) / 10, overloaded: drawKw > cap, overDesign: designKw * 0.8 > cap,
  };
}

export const cdusOfHall = (cdus: readonly T.Cdu[], hallId: string): T.Cdu[] => cdus.filter((c) => c.hallId === hallId && !c.isDeleted);
export const cduOfRack = (cdus: readonly T.Cdu[], rack: Pick<T.Rack, 'cduId'>): T.Cdu | undefined => (rack.cduId ? cdus.find((c) => c.id === rack.cduId) : undefined);
/** The cooling plant lists facility CDUs as CRAC units of type CDU; the Cdu record with the same zone and name details that unit (hall, flow, racks). */
export const cduForCrac = (cdus: readonly T.Cdu[], crac: Pick<T.CRAC, 'type' | 'name' | 'coolingZoneId'>): T.Cdu | undefined =>
  crac.type === 'CDU' ? cdus.find((c) => c.coolingZoneId === crac.coolingZoneId && c.name === crac.name) : undefined;

/** Liquid-cooled racks with no CDU, or with a CDU on another site. */
export function liquidRackIssues(racks: readonly T.Rack[], cdus: readonly T.Cdu[]): { rack: T.Rack; issue: string }[] {
  const byId = new Map(cdus.map((c) => [c.id, c]));
  const out: { rack: T.Rack; issue: string }[] = [];
  for (const r of racks) {
    if (!r.liquidCooled) continue;
    const c = r.cduId ? byId.get(r.cduId) : undefined;
    if (!c) out.push({ rack: r, issue: 'Liquid-cooled rack has no CDU' });
    else if (c.dataCenterId !== r.dataCenterId) out.push({ rack: r, issue: `CDU ${c.name} is on another site` });
  }
  return out;
}

/* ───────────────────────────── power plant ───────────────────────────── */

export interface PlantSummary {
  feeds: T.UtilityFeed[]; ups: T.UPS[]; generators: T.Generator[]; rectifiers: T.DcPlant[]; batteries: T.DcPlant[];
  /** Utility intake (kW): both sides when both are active, otherwise one side. */
  feedKw: number;
  upsKw: number; upsUsableKw: number;
  generatorKw: number; generatorUsableKw: number;
  rectifierKw: number; rectifierUsableKw: number;
  /** Longest battery autonomy (hours) across banks, or UPS runtime (h) when there is no DC plant. */
  batteryAutonomyH: number;
  dcPlant: boolean;
  lastGeneratorTest?: { date: string; result?: 'Pass' | 'Fail'; name: string };
}

/** N+1 usable capacity of a set of equal-role units: total less the largest (a single unit counts in full). */
export const usableNPlus1 = (caps: readonly number[]): number => (caps.length <= 1 ? caps.reduce((a, b) => a + b, 0) : caps.reduce((a, b) => a + b, 0) - Math.max(...caps));

export function plantOfSite(dcId: string, e: { utilityFeeds: readonly T.UtilityFeed[]; upsUnits: readonly T.UPS[]; generators: readonly T.Generator[]; dcPlants: readonly T.DcPlant[] }): PlantSummary {
  const feeds = e.utilityFeeds.filter((f) => f.dataCenterId === dcId && !f.isDeleted);
  const ups = e.upsUnits.filter((u) => u.dataCenterId === dcId && !u.isDeleted);
  const generators = e.generators.filter((g) => g.dataCenterId === dcId && !g.isDeleted);
  const plant = e.dcPlants.filter((p) => p.dataCenterId === dcId && !p.isDeleted);
  const rectifiers = plant.filter((p) => p.kind === 'Rectifier'); const batteries = plant.filter((p) => p.kind === 'Battery bank');
  const live = <X extends { status?: string }>(x: X) => x.status !== 'Failed';
  const active = feeds.filter((f) => (f.normalRole ?? 'Active') === 'Active');
  const tested = generators.filter((g) => g.lastTestDate).sort((a, b) => (b.lastTestDate ?? '').localeCompare(a.lastTestDate ?? ''));
  const nonRedundant = generators.filter((g) => g.redundancyRole !== 'Redundant' && live(g));
  return {
    feeds, ups, generators, rectifiers, batteries,
    feedKw: (active.length ? active : feeds).reduce((a, f) => a + f.capacityKw, 0),
    upsKw: ups.reduce((a, u) => a + u.capacityKw, 0), upsUsableKw: usableNPlus1(ups.filter(live).map((u) => u.capacityKw)),
    generatorKw: generators.reduce((a, g) => a + g.capacityKw, 0),
    generatorUsableKw: generators.some((g) => g.redundancyRole === 'Redundant') ? nonRedundant.reduce((a, g) => a + g.capacityKw, 0) : usableNPlus1(generators.filter(live).map((g) => g.capacityKw)),
    rectifierKw: rectifiers.reduce((a, r) => a + (r.capacityKw ?? 0), 0), rectifierUsableKw: usableNPlus1(rectifiers.filter(live).map((r) => r.capacityKw ?? 0)),
    batteryAutonomyH: batteries.length ? Math.max(...batteries.map((b) => b.autonomyH ?? 0)) : Math.round((Math.max(0, ...ups.map((u) => u.runtimeMinutes)) / 60) * 10) / 10,
    dcPlant: plant.length > 0,
    lastGeneratorTest: tested[0] ? { date: tested[0].lastTestDate as string, result: tested[0].lastTestResult, name: tested[0].name } : undefined,
  };
}

/** The A and B feeds of a rack, resolved to a utility feed or a rack power feed. */
export function rackFeeds(rack: Pick<T.Rack, 'feedAId' | 'feedBId'>, utilityFeeds: readonly T.UtilityFeed[], powerFeeds: readonly T.PowerFeed[]): { side: 'A' | 'B'; id: string; name: string; kind: 'Utility feed' | 'Rack feed'; record: T.UtilityFeed | T.PowerFeed }[] {
  const out: ReturnType<typeof rackFeeds> = [];
  for (const [side, id] of [['A', rack.feedAId], ['B', rack.feedBId]] as const) {
    if (!id) continue;
    const pf = powerFeeds.find((p) => p.id === id);
    if (pf) { out.push({ side, id, name: pf.name, kind: 'Rack feed', record: pf }); continue; }
    const uf = utilityFeeds.find((f) => f.id === id);
    if (uf) out.push({ side, id, name: uf.name, kind: 'Utility feed', record: uf });
  }
  return out;
}

/* ───────────────────────────── sensors ───────────────────────────── */

export const sensorsOfRoom = (sensors: readonly T.EnvSensor[], hallId: string): T.EnvSensor[] => sensors.filter((s) => s.hallId === hallId && !s.isDeleted);
export const sensorsOfSite = (sensors: readonly T.EnvSensor[], dcId: string): T.EnvSensor[] => sensors.filter((s) => s.dataCenterId === dcId && !s.isDeleted);
/** Sensor counts by kind. */
export function sensorKinds(sensors: readonly T.EnvSensor[]): { kind: string; count: number }[] {
  const m = new Map<string, number>();
  for (const s of sensors) m.set(s.kind, (m.get(s.kind) ?? 0) + 1);
  return [...m.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
}

/* ───────────────────────────── monitoring coverage ───────────────────────────── */

export type CollectorDomain = T.Collector['domain'];
/** The monitoring domain a device belongs to (undefined for passive kit). */
export function domainOfDevice(d: Pick<T.Device, 'category' | 'model' | 'networkLayer' | 'gpu'>): CollectorDomain | undefined {
  if (d.gpu || d.category === 'GPU-Node') return 'GPU';
  if (d.category === 'PDU' || d.category === 'UPS') return 'Facility';
  if (d.category === 'Server' || d.category === 'Storage') return 'Compute';
  if (d.networkLayer || d.category === 'Switch' || d.category === 'Router' || d.category === 'Firewall') return 'Network';
  if (/BIG-IP|Console|Access Point/.test(d.model ?? '')) return 'Network';
  return undefined;
}

export interface CollectorCoverage {
  devices: number; monitored: number; unmonitored: number; tenant: number; notInstalled: number;
  /** Monitored devices / devices the operator should monitor (installed, operator-owned). */
  pct: number;
  byCollector: { collector: T.Collector; devices: number; monitored: number }[];
  byDomain: { domain: CollectorDomain; collectors: T.Collector[]; devices: number; monitored: number }[];
  /** Installed operator devices nobody polls (no collector assigned or not reporting). */
  gaps: T.Device[];
}

const NOT_INSTALLED = new Set(['Ordered', 'Received', 'Staged', 'Retired', 'Disposed']);
export function collectorCoverage(dcId: string, devices: readonly T.Device[], collectors: readonly T.Collector[]): CollectorCoverage {
  const devs = devices.filter((d) => d.dataCenterId === dcId && !d.isDeleted);
  const cols = collectors.filter((c) => c.dataCenterId === dcId && !c.isDeleted);
  const tenant = devs.filter((d) => d.ownerKind === 'tenant');
  const notInstalled = devs.filter((d) => d.ownerKind !== 'tenant' && (NOT_INSTALLED.has(d.lifecycleState ?? '') || d.status === 'Inactive'));
  const scope = devs.filter((d) => d.ownerKind !== 'tenant' && !notInstalled.includes(d) && domainOfDevice(d) && !d.parentDeviceId);
  const monitored = scope.filter((d) => d.monitored);
  const domains: CollectorDomain[] = ['Network', 'Facility', 'Compute', 'GPU'];
  return {
    devices: scope.length, monitored: monitored.length, unmonitored: scope.length - monitored.length, tenant: tenant.length, notInstalled: notInstalled.length,
    pct: scope.length ? Math.round((monitored.length / scope.length) * 100) : 100,
    byCollector: cols.map((c) => { const mine = scope.filter((d) => d.collectorId === c.id); return { collector: c, devices: mine.length, monitored: mine.filter((d) => d.monitored).length }; }),
    byDomain: domains.map((domain) => { const mine = scope.filter((d) => domainOfDevice(d) === domain); return { domain, collectors: cols.filter((c) => c.domain === domain), devices: mine.length, monitored: mine.filter((d) => d.monitored).length }; }).filter((x) => x.devices || x.collectors.length),
    gaps: scope.filter((d) => !d.monitored),
  };
}

/* ───────────────────────────── GPU clusters ───────────────────────────── */

export interface GpuClusterSummary {
  cluster: T.GpuCluster; nodes: T.Device[]; nodeCount: number; gpus: number; model: string; vendor: string;
  cooling: 'air' | 'liquid' | 'mixed'; rackIds: string[]; liveNodes: number; drawKw: number; serverModels: string[];
}
export const gpuNodesOf = (clusterId: string, devices: readonly T.Device[]): T.Device[] => devices.filter((d) => d.gpu?.clusterId === clusterId && !d.isDeleted);
export function gpuClusterSummary(cluster: T.GpuCluster, devices: readonly T.Device[]): GpuClusterSummary {
  const nodes = gpuNodesOf(cluster.id, devices);
  const cool = new Set(nodes.map((n) => n.gpu?.cooling));
  return {
    cluster, nodes, nodeCount: nodes.length, gpus: nodes.reduce((a, n) => a + (n.gpu?.count ?? 0), 0),
    model: String(cluster.gpuModel), vendor: nodes[0]?.gpu?.vendor ?? 'NVIDIA',
    cooling: cool.size > 1 ? 'mixed' : (([...cool][0] ?? cluster.cooling) as 'air' | 'liquid'),
    rackIds: [...new Set(nodes.map((n) => n.rackId).filter((x): x is string => !!x))],
    liveNodes: nodes.filter((n) => n.status === 'Active').length,
    drawKw: Math.round(nodes.reduce((a, n) => a + (n.powerDrawW ?? 0), 0) / 100) / 10,
    serverModels: [...new Set(nodes.map((n) => `${n.manufacturer ?? ''} ${n.model ?? ''}`.trim()))],
  };
}

/* ───────────────────────────── site attributes ───────────────────────────── */

export const BUSINESS_MODEL_LABEL: Record<T.BusinessModel, string> = { colocation: 'Colocation', neocloud: 'GPU cloud (neocloud)', cloud: 'Cloud', enterprise: 'Enterprise', network: 'Network operator' };
export const formatAddress = (dc: Pick<T.DataCenter, 'address' | 'city' | 'state' | 'country'>): string | undefined =>
  dc.address ? [dc.address, dc.state, dc.country].filter(Boolean).join(', ') : [dc.city, dc.state, dc.country].filter(Boolean).join(', ') || undefined;

/** Key-value labels for a site's estate attributes (only the ones set). */
export function siteAttributes(dc: T.DataCenter): { label: string; value: string }[] {
  const rows: [string, string | undefined][] = [
    ['Category', dc.category], ['Business model', dc.businessModel ? BUSINESS_MODEL_LABEL[dc.businessModel] : undefined], ['Operator', dc.operatorName],
    ['Address', formatAddress(dc)], ['Timezone', dc.timezone], ['Design PUE', dc.designPue != null ? dc.designPue.toFixed(2) : undefined], ['Cooling redundancy', dc.coolingRedundancy],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]).map(([label, value]) => ({ label, value }));
}

/* ───────────────────────────── tenancy ───────────────────────────── */

export interface TenantRacks { customerId: string; customerName: string; racks: T.Rack[]; contractedKw: number; maxKw: number; drawKw: number; overContract: T.Rack[] }
/** Leased racks per tenant customer (optionally for one site), with contracted power and live draw. */
export function tenantRacksByCustomer(racks: readonly T.Rack[], customers: readonly Pick<T.Customer, 'id' | 'name'>[], dcId?: string): TenantRacks[] {
  const name = new Map(customers.map((c) => [c.id, c.name]));
  const m = new Map<string, T.Rack[]>();
  for (const r of racks) if (r.ownerKind === 'tenant' && r.tenantCustomerId && !r.isDeleted && (!dcId || r.dataCenterId === dcId)) m.set(r.tenantCustomerId, [...(m.get(r.tenantCustomerId) ?? []), r]);
  return [...m.entries()].map(([customerId, rs]) => ({
    customerId, customerName: name.get(customerId) ?? customerId, racks: rs,
    contractedKw: rs.reduce((a, r) => a + (r.contractedKw ?? 0), 0), maxKw: rs.reduce((a, r) => a + r.maxPowerKw, 0),
    drawKw: Math.round(rs.reduce((a, r) => a + (r.currentPowerKw || 0), 0) * 10) / 10,
    overContract: rs.filter((r) => r.contractedKw != null && r.currentPowerKw > r.contractedKw),
  })).sort((a, b) => b.contractedKw - a.contractedKw);
}

/* ───────────────────────────── routing ───────────────────────────── */

export const routingSessionsOf = (sessions: readonly T.RoutingSession[], deviceId: string): T.RoutingSession[] => sessions.filter((s) => (s.aDeviceId === deviceId || s.zDeviceId === deviceId) && !s.isDeleted);
/** The far end of a session as seen from one device. */
export const sessionPeer = (s: T.RoutingSession, deviceId: string): { deviceId: string; ifName?: string; localIf?: string } =>
  s.aDeviceId === deviceId ? { deviceId: s.zDeviceId, ifName: s.zIfName, localIf: s.aIfName } : { deviceId: s.aDeviceId, ifName: s.aIfName, localIf: s.zIfName };
