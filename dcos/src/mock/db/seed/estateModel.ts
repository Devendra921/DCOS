/**
 * Seed · estate model (import-ready).
 *
 * Fills the estate-model additions (see the "Estate model additions" block at the end of
 * types.ts) for the fifteen exemplar sites, so DCOS holds what the DCO inventory template
 * carries:
 *
 *   - sites: category, business model, timezone, design PUE, cooling redundancy, operator, address;
 *   - rooms: every hall has a room type; plant, UPS, battery, meet-me, network and NOC rooms are
 *     added as halls without racks where the site type has them;
 *   - racks: density, liquid cooling and the CDU that feeds it, A/B feeds, and on multi-tenant
 *     sites the tenant customer and the power they contracted;
 *   - devices: network layer, WAN edge, OS, MAC, owner, the collector that polls them, GPU spec;
 *   - GPU clusters, routing sessions over the cabled topology, cable roles, strands and patch ports;
 *   - services across several racks, start date and currency;
 *   - −48 V DC plant (rectifiers, battery banks), UPS rooms and serials, generator fuel and tests,
 *     utility feed ratings and accounts;
 *   - CDUs per liquid hall, environment sensors per room, monitoring collectors per site.
 *
 * Runs last. It draws nothing from the random stream (values come from a hash of the record id),
 * existing ids stay stable and new rooms are appended, so nothing the earlier modules produced moves.
 */
import type * as T from '../../data/types';
import type * as E from '../../data/enums';
import { dcTypeProfile, type DcTypeProfile } from '../../data/dcTypes';
import type { AssetSeed, Seed } from './ctx';
import { CAMPUS_CLIMATE, metaAt } from './realism';

/* ───────────────────────────── deterministic helpers ───────────────────────────── */

/** FNV-1a hash of a string (stable across runs). */
export function hashOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const serialFrom = (key: string, prefix: string, len = 8) => `${prefix}${hashOf(key).toString(36).toUpperCase().padStart(7, '0')}${(hashOf(`${key}#`) % 1296).toString(36).toUpperCase().padStart(2, '0')}`.slice(0, prefix.length + len);
const isoDate = (iso: string) => iso.slice(0, 10);

/* ───────────────────────────── reference tables ───────────────────────────── */

interface CampusAttrs { tz: string; state: string; postal: string; streets: string[] }
const CAMPUS_ATTRS: Record<string, CampusAttrs> = {
  ASH: { tz: 'America/New_York', state: 'Virginia', postal: 'VA 20147', streets: ['45000 Ridgeview Technology Drive', '45100 Ridgeview Technology Drive', '45200 Ridgeview Technology Drive'] },
  DAL: { tz: 'America/Chicago', state: 'Texas', postal: 'TX 75241', streets: ['3100 Prairie Logistics Parkway', '3150 Prairie Logistics Parkway', '3200 Prairie Logistics Parkway'] },
  FRA: { tz: 'Europe/Berlin', state: 'Hesse', postal: '60326', streets: ['Mainzer Landstraße 640', 'Mainzer Landstraße 644', 'Mainzer Landstraße 648'] },
  DUB: { tz: 'Europe/Dublin', state: 'County Dublin', postal: 'D22', streets: ['Unit 12, Grange Castle Business Park', 'Unit 14, Grange Castle Business Park'] },
  SIN: { tz: 'Asia/Singapore', state: 'Singapore', postal: '508770', streets: ['18 Loyang Way', '20 Loyang Way'] },
  SYD: { tz: 'Australia/Sydney', state: 'New South Wales', postal: 'NSW 2015', streets: ['120 Bourke Road, Alexandria'] },
  GRU: { tz: 'America/Sao_Paulo', state: 'São Paulo', postal: '06460-040', streets: ['Avenida Tamboré 1200, Barueri'] },
};
const CENTRAL = new Set(['hyperscale-dc', 'hyperscale-campus', 'ai-gpu-factory', 'enterprise-dc', 'wholesale-colo', 'carrier-hotel', 'ixp', 'national-core-nfvi', 'mtso']);
const EDGE = new Set(['edge-micro-dc', 'regional-edge-dc', 'network-pop', 'aggregation-pop', 'central-office', 'server-room']);
const BUSINESS_MODEL: Record<string, T.BusinessModel> = {
  'ai-gpu-factory': 'neocloud', 'hyperscale-dc': 'cloud', 'hyperscale-campus': 'cloud', 'modular-pod': 'cloud',
  'enterprise-dc': 'enterprise', 'server-room': 'enterprise', 'edge-micro-dc': 'enterprise',
  'retail-colo': 'colocation', 'wholesale-colo': 'colocation', 'carrier-hotel': 'colocation',
  'ixp': 'network', 'central-office': 'network', 'aggregation-pop': 'network', 'network-pop': 'network', 'national-core-nfvi': 'network', 'mtso': 'network', 'regional-edge-dc': 'network',
};
/** Rack-owner names on multi-tenant sites → the customer record that leases the rack. */
const TENANT_CUSTOMER: Record<string, string> = {
  'Northwind Bank': 'Northwind Payments', 'Contoso Cloud': 'Helios Cloud', 'Fabrikam Media': 'Vega Media', 'Tailspin Games': 'Summit Gaming',
  'Lumen': 'Lumen Carrier', 'Zayo': 'Regional ISP Co', 'Cogent': 'Nimbus Exchange', 'Telia Carrier': 'Regional ISP Co', 'AT&T': 'Lumen Carrier',
};
const COLO_SERVICE = new Set(['Cabinet lease', 'Power circuit', 'Cross-connect', 'Remote hands']);
/** Standard colocation power commitments (kW). */
const KW_TIERS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 17, 20, 25, 30, 40, 50, 60, 80, 100];

type RoomSpec = { type: T.RoomType; name: string; area: number; side?: 'A' | 'B'; code: string };
/** Non-white-space rooms per site type (white-space halls already exist). */
function roomsFor(key: string, bigSite: boolean): RoomSpec[] {
  const ups2 = (area: number): RoomSpec[] => [{ type: 'UPS room', name: 'UPS room A', area, side: 'A', code: 'UPSA' }, { type: 'UPS room', name: 'UPS room B', area, side: 'B', code: 'UPSB' }];
  const batt = (area: number): RoomSpec => ({ type: 'Battery room', name: 'Battery room', area, code: 'BATT' });
  const plant = (name: string, area: number): RoomSpec => ({ type: 'Plant room', name, area, code: 'PLANT' });
  const mmr = (n: number, area: number): RoomSpec[] => Array.from({ length: n }, (_, i) => ({ type: 'Meet-me room' as const, name: n > 1 ? `Meet-me room ${i + 1}` : 'Meet-me room', area, code: n > 1 ? `MMR${i + 1}` : 'MMR' }));
  const net = (name: string, area: number): RoomSpec => ({ type: 'Network room', name, area, code: 'NET' });
  const noc = (name: string, area: number): RoomSpec => ({ type: 'NOC', name, area, code: 'NOC' });
  switch (key) {
    case 'enterprise-dc': return [net('Main distribution room (MDF)', 60), { type: 'UPS room', name: 'UPS room', area: 180, code: 'UPS' }, batt(120), plant('Electrical switch room', 220), noc('Site operations centre', 80)];
    case 'ai-gpu-factory': return [...mmr(1, 70), ...ups2(260), batt(200), plant('Mechanical plant (pumps and heat exchangers)', 420)];
    case 'wholesale-colo': return [...mmr(1, 90), ...ups2(220), batt(160), plant('Mechanical and electrical plant', 380)];
    case 'hyperscale-dc': return [net('Network room', 120), ...ups2(300), batt(240), plant('Mechanical and electrical plant', 600)];
    case 'modular-pod': return [{ type: 'UPS room', name: 'Power module', area: 30, code: 'PWR' }];
    case 'retail-colo': return [...mmr(2, 70), ...ups2(160), batt(110), plant('Mechanical and electrical plant', 260), noc('Customer operations desk', 40)];
    case 'carrier-hotel': return [...mmr(2, 140), ...ups2(150), batt(110), plant('Mechanical and electrical plant', 240)];
    case 'ixp': return [...mmr(2, 160), ...ups2(180), batt(130), plant('Mechanical and electrical plant', 300), noc('Exchange NOC', 60)];
    case 'central-office': return [plant('DC power room', 140), batt(160), ...mmr(1, 60)];
    case 'network-pop': return [plant('DC power room', 40), { type: 'UPS room', name: 'UPS room', area: 30, code: 'UPS' }, ...mmr(1, 50)];
    case 'national-core-nfvi': return [net('Core network room', 110), ...ups2(160), batt(120), plant('Mechanical and electrical plant', 260), noc('National NOC', 140)];
    case 'mtso': return [plant('DC power room', 220), batt(240), ...mmr(1, 70), noc('Switching centre NOC', 90)];
    case 'regional-edge-dc': return [...mmr(1, 50), { type: 'UPS room', name: 'UPS room', area: bigSite ? 120 : 80, code: 'UPS' }, batt(70), plant('Mechanical and electrical plant', 160)];
    default: return []; // edge micro-DC, server room: the IT room is the whole site
  }
}

type DevClass = 'core' | 'pe' | 'rr' | 'spine' | 'leaf' | 'access' | 'firewall' | 'lb' | 'console' | 'ap' | 'pdu' | 'ups' | 'server' | 'storage' | 'gpu' | 'passive' | 'other';
const NETWORK_CLASSES = new Set<DevClass>(['core', 'pe', 'rr', 'spine', 'leaf', 'access', 'firewall', 'lb', 'console', 'ap']);
const L3_CLASSES = new Set<DevClass>(['core', 'pe', 'rr', 'spine', 'leaf', 'firewall']);
/** Network kit the operator runs on every site (a rack holding it is never leased out). Access ToRs in a leased cabinet are the tenant's. */
const OPERATOR_FABRIC = new Set<DevClass>(['core', 'pe', 'rr', 'spine', 'leaf', 'firewall', 'lb', 'console']);

const OS_FOR = (vendor: string, model: string): string | undefined => {
  if (vendor === 'Juniper') return model.includes('QFX5100') ? 'Junos 21.4R3-S5' : 'Junos 23.4R2-S3';
  if (vendor === 'Arista') return 'EOS 4.32.1F';
  if (vendor === 'Cisco') return model.includes('3172') ? 'NX-OS 9.3(10)' : model.includes('Nexus') ? 'NX-OS 10.4(3)' : model.includes('ASR') ? 'IOS-XR 7.11.2' : 'IOS-XE 17.12.3';
  if (vendor === 'Palo Alto') return 'PAN-OS 11.1.3';
  if (vendor === 'F5') return 'TMOS 17.1.1';
  if (vendor === 'Opengear') return 'Opengear OS 24.07';
  if (vendor === 'Vertiv') return 'Geist firmware 6.2.1';
  if (vendor === 'APC') return 'NMC3 2.5.1';
  if (vendor === 'Pure Storage') return 'Purity//FA 6.6.10';
  if (vendor === 'NetApp') return 'ONTAP 9.14.1';
  return undefined;
};
const HOST_OS = ['Ubuntu 22.04 LTS', 'RHEL 9.4', 'VMware ESXi 8.0 U3', 'Ubuntu 24.04 LTS'];
const GPU_DRIVER: Record<string, string> = { 'H100 SXM 80 GB': '535.183.06', 'H200 SXM 141 GB': '550.90.07', 'B200 SXM 192 GB': '570.124.06' };

/* ───────────────────────────── the pass ───────────────────────────── */

export function seedEstateModel(S: Seed): void {
  new EstateModel(S).run();
}

class EstateModel {
  readonly S: Seed;
  private fabricRole = new Map<string, AssetSeed['fabricRole']>();
  private roleName = new Map<string, string>();
  private devsByRack = new Map<string, T.Device[]>();
  private devsByDc = new Map<string, T.Device[]>();
  private compsByDev = new Map<string, T.DeviceComponent[]>();
  private compById = new Map<string, T.DeviceComponent>();
  private racksByHall = new Map<string, T.Rack[]>();
  private rackById = new Map<string, T.Rack>();
  private custByName = new Map<string, T.Customer>();
  private rooms = new Map<string, Map<string, T.Hall>>(); // dcId → room code → hall
  private collectorsByDc = new Map<string, T.Collector[]>();

  constructor(S: Seed) {
    this.S = S;
    for (const a of S.assets) if (a.fabricRole) this.fabricRole.set(a.id, a.fabricRole);
    for (const r of S.deviceRoles) this.roleName.set(r.id, r.name);
    for (const d of S.devices) {
      if (d.rackId) { const a = this.devsByRack.get(d.rackId) ?? []; a.push(d); this.devsByRack.set(d.rackId, a); }
      if (d.dataCenterId) { const a = this.devsByDc.get(d.dataCenterId) ?? []; a.push(d); this.devsByDc.set(d.dataCenterId, a); }
    }
    for (const c of S.deviceComponents) { this.compById.set(c.id, c); const a = this.compsByDev.get(c.deviceId) ?? []; a.push(c); this.compsByDev.set(c.deviceId, a); }
    for (const r of S.racks) { this.rackById.set(r.id, r); const a = this.racksByHall.get(r.hallId) ?? []; a.push(r); this.racksByHall.set(r.hallId, a); }
    for (const c of S.customers) this.custByName.set(c.name, c);
  }

  run(): void {
    this.sites();
    this.roomsAndHalls();
    this.plant();
    this.racks();
    this.cdus();
    this.collectors();
    this.devices();
    this.gpu();
    this.cables();
    this.routing();
    this.services();
    this.sensors();
  }

  prof(dc: T.DataCenter): DcTypeProfile { return dcTypeProfile(dc.dcTypeKey) as DcTypeProfile; }
  campusKey(dc: T.DataCenter): string { return this.S.dcCampus.get(dc.id) ?? dc.code.slice(0, 3); }
  room(dcId: string, code: string): T.Hall | undefined { return this.rooms.get(dcId)?.get(code); }

  devClass(d: T.Device): DevClass {
    const fr = this.fabricRole.get(d.id);
    switch (fr) {
      case 'core': return 'core'; case 'pe': return 'pe'; case 'rr': return 'rr'; case 'spine': return 'spine'; case 'leaf': return 'leaf';
      case 'access': return 'access'; case 'edge': return 'firewall'; case 'lb': return 'lb'; case 'console': return 'console'; case 'ap': return 'ap';
      case 'pdu': return 'pdu'; case 'ups': return 'ups'; default: break;
    }
    const rn = this.roleName.get(d.deviceRoleId ?? '');
    if (rn === 'Core Router') return 'core';
    if (rn === 'Spine') return 'spine';
    if (rn === 'Leaf/ToR') return /-tor-/.test(d.name) ? 'access' : 'leaf';
    if (rn === 'Firewall') return 'firewall';
    if (rn === 'Patch Panel') return 'passive';
    if (rn === 'PDU') return 'pdu';
    switch (d.category) {
      case 'GPU-Node': return 'gpu'; case 'Storage': return 'storage'; case 'Server': return 'server'; case 'UPS': return 'ups'; case 'PDU': return 'pdu';
      case 'Switch': return 'access'; case 'Router': return 'core'; case 'Firewall': return 'firewall';
      default: break;
    }
    if (d.model?.includes('BIG-IP')) return 'lb';
    if (d.model?.includes('Console')) return 'console';
    if (d.model?.includes('Access Point')) return 'ap';
    return 'other';
  }

  // ───────────────────────────────────────────── sites
  sites(): void {
    const S = this.S;
    const operator = S.enterprises[0]?.name ?? 'Global Enterprise';
    const streetIdx: Record<string, number> = {};
    for (const dc of S.dataCenters) {
      const prof = this.prof(dc);
      const ck = this.campusKey(dc);
      const campus = S.campuses.find((c) => c.id === dc.campusId);
      const at = CAMPUS_ATTRS[ck];
      const i = (streetIdx[ck] = (streetIdx[ck] ?? -1) + 1);
      const climate = CAMPUS_CLIMATE[ck] ?? 'temperate';
      const adj = climate === 'hot-humid' ? 0.06 : climate === 'hot-dry' ? 0.03 : climate === 'cold' ? -0.02 : 0;
      const red = prof.physical.redundancy;
      dc.category = CENTRAL.has(prof.key) ? 'Central' : EDGE.has(prof.key) ? 'Edge' : 'Regional';
      dc.businessModel = BUSINESS_MODEL[prof.key] ?? 'enterprise';
      dc.timezone = at?.tz;
      dc.designPue = r2(prof.pueTarget + adj);
      dc.coolingRedundancy = dc.tier === 'Tier IV' || red === '2N' || red === '2N+1' ? '2N' : red === 'N' ? 'N' : 'N+1';
      dc.operatorName = operator;
      dc.city = campus?.city;
      dc.state = at?.state;
      dc.country = campus?.country;
      if (at) dc.address = `${at.streets[i % at.streets.length]}, ${campus?.city ?? ''} ${at.postal}`.replace(/\s+/g, ' ').trim();
    }
  }

  // ───────────────────────────────────────────── rooms
  roomsAndHalls(): void {
    const S = this.S;
    for (const dc of S.dataCenters) {
      const prof = this.prof(dc);
      const halls = S.halls.filter((h) => h.dataCenterId === dc.id);
      const containment: T.Hall['containment'] = prof.physical.containment === 'Cold-Aisle' ? 'Cold aisle' : prof.physical.containment === 'Hot-Aisle' ? 'Hot aisle' : 'None';
      const map = new Map<string, T.Hall>();
      halls.forEach((h, hi) => {
        const racks = this.racksByHall.get(h.id) ?? [];
        const gpu = racks.filter((r) => r.purpose === 'GPU').length;
        h.roomType = prof.key === 'ai-gpu-factory' || (racks.length > 0 && gpu / racks.length >= 0.5) ? 'AI hall'
          : prof.key === 'network-pop' || prof.key === 'central-office' ? 'Network room' : 'Data hall';
        h.containment = containment;
        h.coolingMethod = 'Air'; // set from the racks once liquid cooling is assigned
        map.set(`H${hi + 1}`, h);
      });
      // The plant and support rooms sit on the ground floor of the first building.
      const bld = S.buildings.find((b) => b.dataCenterId === dc.id);
      const floor = bld ? S.floors.filter((f) => f.buildingId === bld.id).sort((a, b) => a.level - b.level)[0] : undefined;
      if (floor) {
        const big = (S.racks.filter((r) => r.dataCenterId === dc.id).length) >= 50;
        const ageDays = Math.max(30, Math.round((S.now - new Date(dc.commissionedDate ?? S.daysAgo(400)).getTime()) / 864e5));
        for (const spec of roomsFor(prof.key, big)) {
          const id = S.nid('HALL');
          const hall: T.Hall = {
            id, hallId: id, ...metaAt(S, ageDays), floorId: floor.id, dataCenterId: dc.id, name: spec.name, gridCols: 0, gridRows: 0, designPowerKw: 0,
            rackCount: 0, rackCapacity: 0, utilizationPct: 0, status: dc.status === 'Construction' ? 'Fitting' : 'Live', areaSqm: spec.area,
            roomType: spec.type, coolingMethod: 'Air', containment: 'None',
            notes: spec.type === 'UPS room' ? `UPS modules${spec.side ? ` on the ${spec.side}-side bus` : ''}; no IT racks` : spec.type === 'Battery room' ? 'Battery strings for the UPS / DC plant; hydrogen detection and extract ventilation'
              : spec.type === 'Plant room' ? (/DC power/.test(spec.name) ? '−48 V rectifier shelves and battery distribution fuse boards' : 'Switchgear, pumps and heat-rejection plant') : spec.type === 'Meet-me room' ? 'Carrier and customer cross-connects (ODF and copper patching)'
              : spec.type === 'NOC' ? 'Operations room; monitoring wall for the site' : 'Network distribution and core routing',
          };
          S.halls.push(hall); map.set(spec.code, hall);
          floor.hallCount += 1;
        }
      }
      this.rooms.set(dc.id, map);
    }
  }

  // ───────────────────────────────────────────── power plant
  plant(): void {
    const S = this.S;
    for (const dc of S.dataCenters) {
      const prof = this.prof(dc);
      const ck = this.campusKey(dc);
      const feeds = S.utilityFeeds.filter((f) => f.dataCenterId === dc.id);
      const bothActive = dc.tier === 'Tier IV' || prof.physical.redundancy === '2N' || prof.physical.redundancy === '2N+1';
      for (const f of feeds) {
        const amps = f.voltage >= 1000 ? (f.capacityKw * 1000) / (Math.sqrt(3) * f.voltage * 0.95) : (f.capacityKw * 1000) / (Math.sqrt(3) * (f.voltage || 400) * 0.95);
        const a = f.voltage >= 1000 ? roundTo(amps, 5) : roundTo(amps, 50);
        f.supply = 'AC';
        f.currentA = Math.max(5, a);
        f.ratingText = f.voltage >= 1000 ? `${f.currentA.toLocaleString('en-US')} A · ${f.voltage / 1000} kV` : `${f.currentA.toLocaleString('en-US')} A · ${f.voltage} V`;
        f.normalRole = f.redundancyRole === 'A-side' || bothActive ? 'Active' : 'Standby';
        f.utilityAccount = `${f.provider.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}-${f.voltage >= 1000 ? `${f.voltage / 1000}KV` : 'LV'}-${String(hashOf(f.id) % 1_000_000).padStart(6, '0')}`;
      }
      const sideOf = (feedId?: string) => feeds.find((f) => f.id === feedId)?.redundancyRole === 'B-side' ? 'B' : 'A';
      const ups = S.upsUnits.filter((u) => u.dataCenterId === dc.id);
      const itHall = S.halls.find((h) => h.dataCenterId === dc.id && (h.roomType === 'Data hall' || h.roomType === 'AI hall' || h.roomType === 'Network room') && h.rackCount > 0);
      for (const u of ups) {
        const dcPlantUnit = /^DC Plant/.test(u.name);
        const room = dcPlantUnit ? this.room(dc.id, 'PLANT') : this.room(dc.id, `UPS${sideOf(u.feedId)}`) ?? this.room(dc.id, 'UPS') ?? this.room(dc.id, 'PWR');
        u.hallId = room?.id ?? itHall?.id;
        u.serial = dcPlantUnit ? serialFrom(u.id, 'ELT') : serialFrom(u.id, u.capacityKw >= 500 ? 'VRT' : 'APC');
      }
      // −48 V DC plant: rectifier shelves and battery banks behind every DC-plant "UPS" record, plus the POP's router plant.
      const plantRoom = this.room(dc.id, 'PLANT'); const battRoom = this.room(dc.id, 'BATT') ?? plantRoom;
      const testDay = (key: string) => isoDate(S.daysAgo(14 + (hashOf(key) % 120)));
      let n = 0;
      const addPlant = (name: string, kw: number, autonomyH: number, status: E.EquipmentStatus, loadKw: number) => {
        n++;
        const amps = roundTo((kw * 1000) / 48, 50);
        const rid = S.nid('DCP');
        S.dcPlants.push({ id: rid, dcpId: rid, ...metaAt(S, 900), kind: 'Rectifier', name: `RECT-${String(n).padStart(2, '0')}`, dataCenterId: dc.id, hallId: plantRoom?.id, volts: 48, ratedOutput: `48 V · ${amps.toLocaleString('en-US')} A`, capacityKw: kw, lastTestDate: testDay(rid), status, notes: `${name}: rectifier shelves, N+1 modules` });
        const ah = Math.max(100, roundTo(((Math.max(loadKw, kw * 0.3) * 1000) / 48) * autonomyH / 0.85, 100));
        const strings = Math.max(1, Math.ceil(ah / 3500));
        const bid = S.nid('DCP');
        S.dcPlants.push({ id: bid, dcpId: bid, ...metaAt(S, 900), kind: 'Battery bank', name: `BATT-${String(n).padStart(2, '0')}`, dataCenterId: dc.id, hallId: battRoom?.id, volts: 48, ah, autonomyH: r1(autonomyH), lastTestDate: testDay(bid), status: status === 'Failed' ? 'Degraded' : status, notes: `${strings} × ${Math.round(ah / strings).toLocaleString('en-US')} Ah VRLA strings (24 × 2 V cells each)` });
      };
      for (const u of ups.filter((x) => /^DC Plant/.test(x.name))) addPlant(u.name, u.capacityKw, u.runtimeMinutes / 60, u.status, u.loadKw);
      if (prof.key === 'network-pop') {
        const routerKw = (this.devsByDc.get(dc.id) ?? []).filter((d) => d.category === 'Router').reduce((a, d) => a + (d.powerDrawW ?? 0), 0) / 1000;
        addPlant('Router −48 V plant', Math.max(24, roundTo(routerKw * 1.6, 6)), 4, 'Operational', routerKw);
      }
      // Generators: tank sized for the rated runtime at full load; monthly load test.
      const gens = S.generators.filter((g) => g.dataCenterId === dc.id);
      gens.forEach((g, i) => {
        g.fuelTankLitres = Math.max(200, roundTo(g.capacityKw * 0.26 * g.fuelHours, g.capacityKw >= 500 ? 500 : 50));
        // Monthly load test; three sets are overdue (last test 35–60 days ago, still a pass).
        const overdue = (dc.code === 'SIN-NC1' && i === 0) || (dc.code === 'SYD-MTSO1' && i === 2) || (dc.code === 'DAL-POD1' && i === 1);
        g.lastTestDate = isoDate(S.daysAgo(overdue ? 35 + (hashOf(g.id) % 26) : 3 + (hashOf(g.id) % 26)));
        if (overdue) g.notes = `${g.notes ? `${g.notes} ` : ''}Monthly load test overdue; rescheduled after a contractor no-show.`;
        g.lastTestResult = dc.code === 'FRA-COLO1' && i === 1 ? 'Fail' : 'Pass';
        if (g.lastTestResult === 'Fail') g.notes = 'Failed the monthly load test: did not reach rated voltage within 10 s. Injector replaced; retest booked.';
      });
      void ck;
    }
  }

  // ───────────────────────────────────────────── racks: density, feeds, tenancy
  racks(): void {
    const S = this.S;
    const pfByRack = new Map<string, T.PowerFeed[]>();
    for (const pf of S.powerFeeds) if (pf.rackId) { const a = pfByRack.get(pf.rackId) ?? []; a.push(pf); pfByRack.set(pf.rackId, a); }
    for (const dc of S.dataCenters) {
      const prof = this.prof(dc);
      const feeds = S.utilityFeeds.filter((f) => f.dataCenterId === dc.id);
      const aFeed = feeds.find((f) => f.redundancyRole === 'A-side'); const bFeed = feeds.find((f) => f.redundancyRole === 'B-side');
      const racks = S.racks.filter((r) => r.dataCenterId === dc.id);
      for (const r of racks) {
        r.density = r.purpose === 'GPU' || r.maxPowerKw >= 30 ? 'ai' : 'standard';
        const pfs = pfByRack.get(r.id) ?? [];
        r.feedAId = pfs.find((p) => p.type === 'Primary')?.id ?? aFeed?.id;
        r.feedBId = pfs.find((p) => p.type === 'Redundant')?.id ?? (prof.physical.redundancy === 'N' ? undefined : bFeed?.id);
        r.ownerKind = 'operator';
      }
      if (!prof.multiTenant) continue;

      // Multi-tenant site: racks that hold the operator's fabric, network racks and House racks stay with the operator.
      const operatorRack = (r: T.Rack) => r.purpose === 'Network' || r.owner === 'House' || r.status === 'Planned' || r.status === 'Retired'
        || (this.devsByRack.get(r.id) ?? []).some((d) => OPERATOR_FABRIC.has(this.devClass(d)));
      const tenant = new Map<string, T.Customer>();
      const services = S.services.filter((s) => s.dataCenterId === dc.id && COLO_SERVICE.has(s.type) && s.rackId);
      for (const s of services) {
        const rk = this.rackById.get(s.rackId as string);
        const cust = S.customers.find((c) => c.id === s.customerRef);
        if (!rk || !cust || operatorRack(rk) || tenant.has(rk.id)) continue;
        tenant.set(rk.id, cust);
        if (s.type === 'Cabinet lease' && s.qty > 1) {
          // A multi-cabinet lease takes the nearest free cabinets in the same row.
          const row = racks.filter((x) => x.rowId === rk.rowId && x.id !== rk.id && !operatorRack(x) && !tenant.has(x.id) && !services.some((o) => o.rackId === x.id))
            .sort((a, b) => Math.abs(a.gridX - rk.gridX) - Math.abs(b.gridX - rk.gridX) || a.gridX - b.gridX);
          const extra = row.slice(0, s.qty - 1);
          for (const x of extra) tenant.set(x.id, cust);
          s.rackIds = [rk.id, ...extra.map((x) => x.id)];
        }
      }
      for (const r of racks) {
        if (tenant.has(r.id) || operatorRack(r)) continue;
        const cust = this.custByName.get(TENANT_CUSTOMER[r.owner] ?? '');
        if (cust) tenant.set(r.id, cust);
      }
      for (const r of racks) {
        const cust = tenant.get(r.id);
        if (!cust) continue;
        const old = r.owner;
        r.ownerKind = 'tenant'; r.tenantCustomerId = cust.id; r.owner = cust.name;
        const power = services.find((s) => s.rackId === r.id && s.type === 'Power circuit');
        const tierKw = KW_TIERS.filter((k) => k <= r.maxPowerKw * 0.9).pop() ?? Math.max(1, Math.floor(r.maxPowerKw * 0.8));
        r.contractedKw = Math.min(r.maxPowerKw, power ? power.qty : tierKw);
        for (const rv of S.rackReservations) if (rv.rackId === r.id && rv.tenant === old) rv.tenant = cust.name;
      }
    }
  }

  // ───────────────────────────────────────────── CDUs and liquid racks
  cdus(): void {
    const S = this.S;
    for (const dc of S.dataCenters) {
      const prof = this.prof(dc);
      const liquidPosture = prof.physical.liquidCooling;
      if (liquidPosture === 'none') continue;
      const halls = S.halls.filter((h) => h.dataCenterId === dc.id && (h.roomType === 'AI hall' || h.roomType === 'Data hall'));
      const candidate = (r: T.Rack) => r.liquidCoolingReady && r.status !== 'Retired' && (
        liquidPosture === 'standard' ? r.purpose !== 'Network' && r.purpose !== 'Storage'
          : r.purpose === 'GPU' || prof.key === 'wholesale-colo');
      let siteCdu = 0;
      for (const h of halls) {
        const racks = (this.racksByHall.get(h.id) ?? []).filter(candidate).sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX);
        // Facility CDUs already in the hall's cooling zone (the cooling plant records them as CRAC units of type CDU).
        const zoneCdus = S.cracUnits.filter((c) => c.coolingZoneId === h.coolingZoneId && c.type === 'CDU');
        const zoneTaken = zoneCdus.length && S.cdus.some((c) => c.coolingZoneId === h.coolingZoneId);
        if (!racks.length) continue;
        if (!zoneCdus.length && racks.length < 2) continue; // a single liquid-ready rack in an air hall stays on air
        const specs: { name: string; capacityKw: number; supplyC: number; vendor: string; model: string; status: E.EquipmentStatus }[] = zoneCdus.length && !zoneTaken
          ? zoneCdus.map((c) => ({ name: c.name, capacityKw: c.capacityKw, supplyC: c.supplyTempC, vendor: 'Vertiv', model: c.capacityKw > 1350 ? 'CoolChip CDU 2300' : 'Liebert XDU1350', status: c.status }))
          : Array.from({ length: Math.max(1, Math.ceil(racks.reduce((a, r) => a + r.maxPowerKw * 0.8, 0) / 750)) }, () => {
            const design = racks.reduce((a, r) => a + r.maxPowerKw * 0.8, 0);
            const small = design <= 400;
            siteCdu++;
            return { name: `CDU-${String(siteCdu).padStart(2, '0')}`, capacityKw: small ? 200 : 750, supplyC: 32, vendor: 'CoolIT Systems', model: small ? 'CHx200' : 'CHx750', status: 'Operational' as E.EquipmentStatus };
          });
        const groups = specs.map(() => [] as T.Rack[]);
        racks.forEach((r, i) => groups[Math.min(specs.length - 1, Math.floor((i * specs.length) / racks.length))].push(r));
        specs.forEach((sp, i) => {
          const id = S.nid('CDU');
          const served = groups[i];
          const draw = r1(served.reduce((a, r) => a + (r.currentPowerKw || 0), 0));
          const design = r0(served.reduce((a, r) => a + r.maxPowerKw, 0));
          const warn = draw > sp.capacityKw ? `Liquid load ${draw} kW is above the ${sp.capacityKw} kW rating — racks run on reduced inlet temperature margin.`
            : design * 0.8 > sp.capacityKw ? `Design load of the racks it feeds (${design.toLocaleString('en-US')} kW) is above its ${sp.capacityKw.toLocaleString('en-US')} kW rating; full build-out needs another unit.` : undefined;
          S.cdus.push({
            id, cduId: id, ...metaAt(S, 500), name: sp.name, dataCenterId: dc.id, hallId: h.id, coolingZoneId: h.coolingZoneId, capacityKw: sp.capacityKw,
            nominalFlowLpm: roundTo(sp.capacityKw * 1.43, 10), designSupplyC: sp.supplyC, vendor: sp.vendor, model: sp.model, status: sp.status,
            notes: warn ?? `Feeds ${served.length} rack${served.length === 1 ? '' : 's'} in ${h.name} (${served.map((r) => r.name).slice(0, 4).join(', ')}${served.length > 4 ? ' …' : ''})`,
          });
          for (const r of served) { r.liquidCooled = true; r.cduId = id; if (r.density !== 'ai') r.density = 'ai'; }
        });
      }
      for (const h of halls) {
        const racks = this.racksByHall.get(h.id) ?? [];
        const liquid = racks.filter((r) => r.liquidCooled).length;
        h.coolingMethod = !liquid ? 'Air' : liquid / Math.max(1, racks.length) >= 0.6 ? 'Liquid' : 'Hybrid';
      }
    }
    for (const r of S.racks) if (r.liquidCooled === undefined) r.liquidCooled = false;
  }

  // ───────────────────────────────────────────── collectors
  collectors(): void {
    const S = this.S;
    S.dataCenters.forEach((dc, di) => {
      const prof = this.prof(dc);
      const devs = this.devsByDc.get(dc.id) ?? [];
      const has = (cls: DevClass[]) => devs.some((d) => cls.includes(this.devClass(d)));
      const gnmi = ['ai-gpu-factory', 'hyperscale-dc', 'national-core-nfvi', 'wholesale-colo'].includes(prof.key);
      const bacnet = S.chillers.some((c) => c.dataCenterId === dc.id) || S.coolingZones.filter((z) => z.dataCenterId === dc.id).length >= 2;
      const list: [string, T.Collector['protocol'], T.Collector['domain'], string][] = [];
      list.push(['network poller', 'SNMP', 'Network', 'Routers, firewalls, load balancers, OOB and access switches']);
      if (gnmi) list.push(['fabric telemetry', 'gNMI', 'Network', 'Spine and leaf switches (streaming telemetry)']);
      list.push(['BMS gateway', 'Modbus TCP', 'Facility', prof.dcPowerPlant ? 'Rectifiers, battery monitors, rack PDUs, generators' : 'UPS, rack PDUs, generators, switchgear meters']);
      if (bacnet) list.push(['BMS (BACnet)', 'BACnet', 'Facility', 'CRAH / CRAC / CDU, chillers and environment sensors']);
      if (has(['server', 'storage'])) list.push(['BMC poller', 'Redfish', 'Compute', 'Server and storage BMCs (PSU, fans, temperatures)']);
      if (devs.some((d) => d.category === 'GPU-Node' && d.rackId && d.lifecycleState !== 'Retired')) list.push(['GPU telemetry', 'DCGM exporter', 'GPU', 'GPU nodes: DCGM metrics, BMC over IPMI 2.0']);
      const out: T.Collector[] = list.map(([what, protocol, domain, covers], k) => {
        const id = S.nid('COL');
        const degraded = dc.status === 'Operational' && di % 5 === 1 && k === 0;
        return { id, colId: id, ...metaAt(S, 300), name: `${dc.code} ${what}`, dataCenterId: dc.id, protocol, domain, hostIp: `10.${100 + di}.0.${10 * (k + 1)}`, covers, status: dc.status === 'Construction' ? 'Down' as const : degraded ? 'Degraded' as const : 'Healthy' as const,
          notes: degraded ? 'Poll cycle overrunning since the last credential rotation; part of the site reports late' : undefined };
      });
      S.collectors.push(...out);
      this.collectorsByDc.set(dc.id, out);
    });
  }

  collectorFor(d: T.Device, cls: DevClass): T.Collector | undefined {
    const cols = this.collectorsByDc.get(d.dataCenterId ?? '') ?? [];
    const by = (p: string) => cols.find((c) => c.protocol === p);
    if (cls === 'pdu' || cls === 'ups') return by('Modbus TCP');
    if (cls === 'spine' || cls === 'leaf') return by('gNMI') ?? by('SNMP');
    if (NETWORK_CLASSES.has(cls)) return by('SNMP');
    if (cls === 'gpu') return by('DCGM exporter') ?? by('Redfish');
    if (cls === 'server' || cls === 'storage') return by('Redfish');
    return undefined;
  }

  // ───────────────────────────────────────────── devices
  devices(): void {
    const S = this.S;
    const md = new Map(S.managedDevices.map((m) => [m.id, m]));
    const wanDevices = new Set(S.circuitTerminations.filter((t) => t.side === 'A' && t.deviceId).map((t) => t.deviceId as string));
    for (const d of S.devices) {
      const cls = this.devClass(d);
      const m = md.get(d.id);
      const rack = d.rackId ? this.rackById.get(d.rackId) : undefined;
      const network = NETWORK_CLASSES.has(cls);
      if (network) {
        d.networkLayer = cls === 'core' || cls === 'pe' || cls === 'rr' || cls === 'firewall' ? 'core' : cls === 'spine' ? 'spine' : cls === 'leaf' ? 'leaf' : 'access';
        d.wanEdge = cls === 'pe' || (cls === 'core' && wanDevices.has(d.id));
      }
      // Ownership: equipment in a tenant cabinet is the tenant's, except the operator's PDUs and fabric.
      const tenantKit = rack?.ownerKind === 'tenant' && !OPERATOR_FABRIC.has(cls) && cls !== 'pdu' && cls !== 'ups' && cls !== 'passive' && !m;
      d.ownerKind = tenantKit ? 'tenant' : 'operator';
      if (tenantKit) d.tenantCustomerId = rack?.tenantCustomerId;
      // OS and base MAC (the management port's MAC).
      const planned = ['Ordered', 'Received', 'Staged'].includes(d.lifecycleState ?? '');
      if (!tenantKit && !planned) {
        d.osVersion = m?.osVersion ?? OS_FOR(d.manufacturer ?? '', d.model ?? '') ?? (cls === 'gpu' ? 'Ubuntu 22.04 LTS' : cls === 'server' ? HOST_OS[hashOf(d.id) % HOST_OS.length] : undefined);
      }
      const comps = this.compsByDev.get(d.id) ?? [];
      const mgmt = comps.find((c) => c.kind === 'interface' && c.mgmtOnly && c.macAddress) ?? comps.find((c) => c.kind === 'interface' && c.macAddress);
      if (mgmt?.macAddress) d.macAddress = mgmt.macAddress;
      // Monitoring: managed (NMS) devices always; the rest of the live operator estate through the site's collectors,
      // apart from a few the monitoring design missed. Tenant gear, passive kit and kit not yet installed are not polled.
      const live = !planned && d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed' && d.status !== 'Inactive';
      const col = this.collectorFor(d, cls);
      if (m) {
        d.monitored = true; d.collectorId = col?.id;
        // A few rack PDUs on the −48 V sites were recorded in the NMS against the BMC poller; they are polled over Modbus.
        if ((cls === 'pdu' || cls === 'ups') && !/Modbus/.test(m.sourceSystem)) m.sourceSystem = 'Databyte Modbus agent';
      }
      else if (!live || tenantKit || !col || d.parentDeviceId) { d.monitored = false; }
      else if (hashOf(d.id) % 40 === 0) { d.monitored = false; if (hashOf(`${d.id}#c`) % 2 === 0) d.collectorId = col.id; }
      else { d.monitored = true; d.collectorId = col.id; }
    }
    // Module serials (line cards in the core / PE routers).
    for (const mo of S.modules) if (!mo.serial) mo.serial = serialFrom(mo.id, (S.devices.find((d) => d.id === mo.deviceId)?.manufacturer ?? '') === 'Cisco' ? 'FOC' : 'CAD');
  }

  // ───────────────────────────────────────────── GPU nodes and clusters
  gpu(): void {
    const S = this.S;
    const hallIndex = new Map<string, number>();
    for (const dc of S.dataCenters) S.halls.filter((h) => h.dataCenterId === dc.id && h.rackCount > 0).forEach((h, i) => hallIndex.set(h.id, i));
    const modelFor = (d: T.Device, dc: T.DataCenter, hallId?: string): string => {
      if (d.model === 'DGX H100') return 'H100 SXM 80 GB';
      if (dc.code === 'ASH-GPU1') return (hallIndex.get(hallId ?? '') ?? 0) >= 2 ? 'B200 SXM 192 GB' : 'H200 SXM 141 GB';
      if (dc.dcTypeKey === 'hyperscale-dc') return 'H200 SXM 141 GB';
      return 'H100 SXM 80 GB';
    };
    const groups = new Map<string, T.Device[]>();
    for (const d of S.devices) {
      if (d.category !== 'GPU-Node') continue;
      const dc = S.dataCenters.find((x) => x.id === d.dataCenterId);
      const rack = d.rackId ? this.rackById.get(d.rackId) : undefined;
      const model = dc ? modelFor(d, dc, rack?.hallId) : d.model === 'DGX H100' ? 'H100 SXM 80 GB' : 'H200 SXM 141 GB';
      d.gpu = {
        model, vendor: 'NVIDIA', count: 8, cooling: rack?.liquidCooled && d.model !== 'DGX H100' ? 'liquid' : 'air',
        driver: d.lifecycleState === 'Ordered' ? undefined : GPU_DRIVER[model],
        firmware: d.model === 'DGX H100' ? 'DGX OS 6.2 · BMC 24.03' : d.manufacturer === 'Dell' ? 'iDRAC 7.10.30' : 'BMC 01.03.12',
      };
      const live = d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed' && d.status !== 'Inactive';
      if (!dc || !rack || !live || d.ownerKind === 'tenant') continue;
      // A pod shares one cooling design, so air- and liquid-cooled nodes form separate clusters.
      const key = `${dc.id}|${rack.hallId}|${model}|${d.gpu?.cooling ?? 'air'}`;
      const a = groups.get(key) ?? []; a.push(d); groups.set(key, a);
    }
    const podSeq = new Map<string, number>();
    for (const [key, nodes] of groups) {
      if (nodes.length < 2) continue;
      const [dcId, hallId, model] = key.split('|');
      const dc = S.dataCenters.find((x) => x.id === dcId) as T.DataCenter;
      const hall = S.halls.find((h) => h.id === hallId);
      const k = (podSeq.get(dcId) ?? 0) + 1; podSeq.set(dcId, k);
      const liquid = nodes.filter((n) => n.gpu?.cooling === 'liquid').length;
      const short = model.split(' ')[0];
      const ai = dc.code === 'ASH-GPU1';
      const id = S.nid('GCL');
      const failedUnit = ai && S.cracUnits.some((c) => c.coolingZoneId === hall?.coolingZoneId && c.status === 'Failed');
      S.gpuClusters.push({
        id, gclId: id, ...metaAt(S, 400), name: `${dc.name} ${short} pod ${k}`, dataCenterId: dc.id, hallId,
        scheduler: short === 'H200' ? 'Kubernetes' : ai ? 'Slurm' : 'Kubernetes',
        fabric: !ai ? 'RoCE v2 over 400G Ethernet' : short === 'B200' ? 'InfiniBand XDR 800G, rail-optimised' : 'InfiniBand NDR 400G, rail-optimised',
        gpuModel: model, cooling: liquid === nodes.length ? 'liquid' : 'air',
        status: hall?.status === 'Fitting' ? 'Planned' : failedUnit ? 'Degraded' : 'Live',
        notes: failedUnit ? `A cooling unit in ${hall?.name} has failed; jobs throttled to stay inside the zone's remaining capacity` : `${nodes.length} nodes · ${nodes.length * 8} GPUs in ${hall?.name ?? 'the hall'}`,
      });
      for (const n of nodes) if (n.gpu) n.gpu.clusterId = id;
    }
  }

  // ───────────────────────────────────────────── cables: role, capacity, strands, patch ports, carrier circuit
  cables(): void {
    const S = this.S;
    const dev = new Map(S.devices.map((d) => [d.id, d]));
    const trunkSeq = new Map<string, number>();
    const cidByIface = new Map<string, string>();
    const ifaceById = new Map(S.interfaces.map((f) => [f.id, f]));
    for (const t of S.circuitTerminations) {
      if (t.side !== 'A' || !t.deviceId || !t.interfaceId) continue;
      const ck = S.circuits.find((c) => c.id === t.circuitId); const f = ifaceById.get(t.interfaceId);
      if (ck && f && ck.status !== 'Decommissioned') cidByIface.set(`${t.deviceId}|${f.name}`, ck.cid);
    }
    for (const c of S.cables) {
      if (c.cableType.startsWith('Power')) continue;
      const A = dev.get(c.aDeviceId), B = dev.get(c.bDeviceId);
      if (!A || !B) continue;
      const ca = this.devClass(A), cb = this.devClass(B);
      const host = (x: DevClass) => x === 'server' || x === 'storage' || x === 'gpu' || x === 'passive';
      const pair = new Set([ca, cb]);
      c.role = host(ca) || host(cb) || pair.has('console') || pair.has('ap') ? 'Access'
        : (ca === 'core' || ca === 'rr') && (cb === 'core' || cb === 'rr') ? 'Peering'
        : pair.has('core') || pair.has('pe') || pair.has('rr') || pair.has('firewall') ? 'Uplink' : 'Fabric';
      const a = this.compById.get(c.aComponentId), b = this.compById.get(c.bComponentId);
      const sp = [a?.speedMbps, b?.speedMbps].filter((x): x is number => !!x);
      if (sp.length) c.capacityMbps = Math.min(...sp);
      // Structured fibre between racks runs through the rack ODFs; the strand pair is counted per trunk.
      const fibre = c.cableType === 'MMF-OM4' || c.cableType === 'SMF-OS2';
      if (fibre && A.rackId && B.rackId && A.rackId !== B.rackId) {
        const ra = this.rackById.get(A.rackId), rb = this.rackById.get(B.rackId);
        const key = c.bundleId ?? `${A.rackId}|${B.rackId}`;
        const k = (trunkSeq.get(key) ?? 0) + 1; trunkSeq.set(key, k);
        c.strand = `${2 * k - 1}-${2 * k}`;
        c.aPatchPort = `${ra?.name ?? 'A'}-ODF:${2 * k - 1}`;
        c.bPatchPort = `${rb?.name ?? 'B'}-ODF:${2 * k - 1}`;
      }
      if (cb === 'passive' && b) c.bPatchPort = `${B.name}:${b.name}`;
      if (ca === 'passive' && a) c.aPatchPort = `${A.name}:${a.name}`;
      const cid = (a && cidByIface.get(`${A.id}|${a.name}`)) ?? (b && cidByIface.get(`${B.id}|${b.name}`));
      if (cid) c.carrierCircuitId = cid;
    }
  }

  // ───────────────────────────────────────────── routing sessions over the cabled topology
  routing(): void {
    const S = this.S;
    const dev = new Map(S.devices.map((d) => [d.id, d]));
    const cableOf = new Map<string, T.Cable>();
    for (const c of S.cables) { const k = [c.aDeviceId, c.bDeviceId].sort().join('|'); if (!cableOf.has(k) && !c.cableType.startsWith('Power')) cableOf.set(k, c); }
    const bgpDown = new Set(S.alarms.filter((a) => a.state === 'Active' && /BGP/i.test(a.type)).map((a) => a.deviceId));
    const seen = new Set<string>();
    const add = (A: T.Device, Z: T.Device, protocol: string, role: T.LinkRole, opts: { aIf?: string; zIf?: string; cap?: number; state?: T.RoutingSession['state'] } = {}) => {
      const key = `${[A.id, Z.id].sort().join('|')}|${protocol}`;
      if (seen.has(key)) return; seen.add(key);
      let state = opts.state ?? 'Established';
      if (protocol === 'BGP' && state === 'Established' && (bgpDown.has(A.id) || bgpDown.has(Z.id))) { state = 'Down'; bgpDown.delete(A.id); bgpDown.delete(Z.id); }
      const id = S.nid('RS');
      S.routingSessions.push({ id, rsId: id, ...metaAt(S, 200), protocol, role, aDeviceId: A.id, aIfName: opts.aIf, zDeviceId: Z.id, zIfName: opts.zIf, capacityMbps: opts.cap, dataCenterId: A.dataCenterId, state,
        notes: state === 'Down' ? 'Neighbour down — see the active BGP alarm' : state === 'Planned' ? 'Cable planned; session configured, not yet up' : undefined });
    };
    const loop = (d: T.Device) => (d.manufacturer === 'Juniper' ? 'lo0.0' : 'Loopback0');
    for (const dc of S.dataCenters) {
      const prof = this.prof(dc);
      const igp = prof.segment === 'Telco' ? 'ISIS' : 'OSPF';
      const bgpFabric = ['ai-gpu-factory', 'hyperscale-dc', 'modular-pod'].includes(prof.key);
      for (const t of S.topologyLinks) {
        const A = dev.get(t.aDeviceId), Z = dev.get(t.zDeviceId);
        if (!A || !Z || A.dataCenterId !== dc.id) continue;
        const ca = this.devClass(A), cz = this.devClass(Z);
        if (!L3_CLASSES.has(ca) || !L3_CLASSES.has(cz)) continue;
        const c = cableOf.get([A.id, Z.id].sort().join('|'));
        const aIf = c ? this.compById.get(c.aDeviceId === A.id ? c.aComponentId : c.bComponentId)?.name : undefined;
        const zIf = c ? this.compById.get(c.aDeviceId === A.id ? c.bComponentId : c.aComponentId)?.name : undefined;
        const state: T.RoutingSession['state'] = t.status === 'Reserved' ? 'Planned' : t.status === 'Unused' ? 'Down' : 'Established';
        const pair = new Set([ca, cz]);
        const opts = { aIf, zIf, cap: c?.capacityMbps, state };
        if (pair.has('firewall')) add(A, Z, 'BGP', 'Uplink', opts);
        else if (pair.has('spine') && pair.has('leaf')) add(A, Z, bgpFabric ? 'BGP' : igp, 'Fabric', opts);
        else if (pair.has('spine') && pair.has('core')) { add(A, Z, igp, 'Uplink', opts); if (bgpFabric) add(A, Z, 'BGP', 'Uplink', opts); }
        else add(A, Z, igp, pair.has('core') && (pair.has('pe') || pair.has('rr')) ? 'Uplink' : 'Fabric', opts);
      }
      // iBGP between the core pair, and from the route reflector to every PE (over loopbacks).
      const devs = (this.devsByDc.get(dc.id) ?? []).filter((d) => d.lifecycleState !== 'Retired');
      const cores = devs.filter((d) => this.devClass(d) === 'core');
      if (cores.length >= 2) add(cores[0], cores[1], 'BGP', 'Peering', { aIf: loop(cores[0]), zIf: loop(cores[1]) });
      const rr = devs.find((d) => this.devClass(d) === 'rr');
      if (rr) for (const pe of devs.filter((d) => this.devClass(d) === 'pe' || this.devClass(d) === 'core')) add(rr, pe, 'BGP', 'Peering', { aIf: loop(rr), zIf: loop(pe) });
    }
  }

  // ───────────────────────────────────────────── services
  services(): void {
    const S = this.S;
    const nodesByCluster = new Map<string, T.Device[]>();
    for (const d of S.devices) if (d.gpu?.clusterId) { const a = nodesByCluster.get(d.gpu.clusterId) ?? []; a.push(d); nodesByCluster.set(d.gpu.clusterId, a); }
    const dev = new Map(S.devices.map((d) => [d.id, d]));
    for (const s of S.services) {
      s.currency = 'USD';
      s.startDate = isoDate(s.createdAt);
      if (s.rackIds?.length) continue;
      const host = s.deviceId ? dev.get(s.deviceId) : undefined;
      if (s.type === 'GPU cluster' && host?.gpu?.clusterId) {
        const nodes = nodesByCluster.get(host.gpu.clusterId) ?? [];
        const need = Math.max(1, Math.ceil(s.qty / 8));
        const ordered = [host, ...nodes.filter((n) => n.id !== host.id)].slice(0, need);
        const racks = [...new Set(ordered.map((n) => n.rackId).filter((x): x is string => !!x))];
        if (racks.length) { s.rackIds = racks; continue; }
      }
      if (s.rackId) s.rackIds = [s.rackId];
    }
  }

  // ───────────────────────────────────────────── environment sensors
  sensors(): void {
    const S = this.S;
    for (const dc of S.dataCenters) {
      const cols = this.collectorsByDc.get(dc.id) ?? [];
      const col = cols.find((c) => c.protocol === 'BACnet') ?? cols.find((c) => c.protocol === 'Modbus TCP');
      const halls = S.halls.filter((h) => h.dataCenterId === dc.id);
      const codeOf = new Map<string, string>();
      for (const [code, h] of this.rooms.get(dc.id) ?? []) codeOf.set(h.id, code);
      for (const h of halls) {
        const code = codeOf.get(h.id) ?? h.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
        let n = 0;
        const add = (kind: T.EnvSensor['kind'], short: string, position: string, rackId?: string) => {
          n++;
          const id = S.nid('SNS');
          const tag = `${short}${String(n).padStart(2, '0')}`;
          S.envSensors.push({ id, snsId: id, ...metaAt(S, 300), name: `${code}-${tag}`, dataCenterId: dc.id, hallId: h.id, rackId, kind, position, bmsPoint: `BMS.${dc.code}.${code}.${tag}`, collectorId: col?.id });
        };
        const racks = this.racksByHall.get(h.id) ?? [];
        if (racks.length) {
          const rows = S.rows.filter((r) => r.hallId === h.id);
          for (const row of rows) {
            const rr = racks.filter((r) => r.rowId === row.id).sort((a, b) => a.gridX - b.gridX);
            if (!rr.length) continue;
            const mid = rr[Math.floor(rr.length / 2)];
            add('Temperature + humidity', 'TH', `Cold aisle, ${row.name}, rack ${mid.name} (top of rack)`, mid.id);
          }
          if (h.containment && h.containment !== 'None') add('Differential pressure', 'DP', `${h.containment} containment, ${rows[0]?.name ?? 'row A'}`);
          add('Smoke', 'SMK', 'Aspirating smoke detection (VESDA), room');
          for (const cdu of S.cdus.filter((c) => c.hallId === h.id)) add('Leak', 'LK', `Under ${cdu.name} (drip tray)`);
        } else if (h.roomType) {
          add('Temperature + humidity', 'TH', `${h.name} centre`);
          if (h.roomType === 'UPS room' || h.roomType === 'Battery room' || h.roomType === 'Plant room') add('Smoke', 'SMK', `${h.name} ceiling`);
          if (h.roomType === 'Battery room') add('Hydrogen', 'H2', 'Above the battery strings');
          if (h.roomType === 'Plant room' && /pump|Mechanical/i.test(h.name)) add('Leak', 'LK', 'Pump skid drip tray');
        }
      }
    }
  }
}
