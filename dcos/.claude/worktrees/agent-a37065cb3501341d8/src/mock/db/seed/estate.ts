/**
 * DCOS seed — the physical estate.
 *
 * Seven real campuses, fifteen exemplar sites (one per facility type that matters for
 * the demo, each with a deliberate status and tier), and for each site the full chain:
 * utility → backup → distribution → cooling, building → floor → hall → row → rack, and
 * the asset scaffold the dcim module mirrors into devices. Every physical figure comes
 * from the type's profile in dcTypes.ts, so a seeded site matches what the DC Types
 * reference page says a site of that type looks like.
 */
import type * as T from '../../data/types';
import type * as E from '../../data/enums';
import { DC_TYPE_CATALOG, dcTypeProfile, clampDesignPower, plantPlan, type DcTypeProfile } from '../../data/dcTypes';
import type { Seed, AssetSeed } from './ctx';

export interface CampusDef { key: string; city: string; country: string; region: E.RegionName; lat: number; lng: number }
export const CAMPUSES: readonly CampusDef[] = [
  { key: 'ASH', city: 'Ashburn', country: 'United States', region: 'North America', lat: 39.0438, lng: -77.4874 },
  { key: 'DAL', city: 'Dallas', country: 'United States', region: 'North America', lat: 32.7767, lng: -96.797 },
  { key: 'FRA', city: 'Frankfurt', country: 'Germany', region: 'EMEA', lat: 50.1109, lng: 8.6821 },
  { key: 'DUB', city: 'Dublin', country: 'Ireland', region: 'EMEA', lat: 53.3498, lng: -6.2603 },
  { key: 'SIN', city: 'Singapore', country: 'Singapore', region: 'APAC', lat: 1.3521, lng: 103.8198 },
  { key: 'SYD', city: 'Sydney', country: 'Australia', region: 'APAC', lat: -33.8688, lng: 151.2093 },
  { key: 'GRU', city: 'São Paulo', country: 'Brazil', region: 'LATAM', lat: -23.5505, lng: -46.6333 },
];

export interface SiteDef { type: E.DcTypeKey; campus: string; status: E.FacilityStatus; tier?: E.DCTier; group: 'Production' | 'Disaster Recovery' | 'Edge' }
/**
 * The fifteen exemplar sites. Thirteen operate; the Dallas hyperscale site is the DC4
 * greenfield build still under construction; the Dublin server room is being retired.
 * The enterprise DC comes first because it hosts the DCIM showcase racks.
 */
export const SITE_PLAN: readonly SiteDef[] = [
  { type: 'enterprise-dc', campus: 'ASH', status: 'Operational', group: 'Production' },
  { type: 'ai-gpu-factory', campus: 'ASH', status: 'Operational', tier: 'Tier IV', group: 'Production' },
  { type: 'wholesale-colo', campus: 'ASH', status: 'Operational', group: 'Disaster Recovery' },
  { type: 'hyperscale-dc', campus: 'DAL', status: 'Construction', group: 'Production' },
  { type: 'modular-pod', campus: 'DAL', status: 'Operational', group: 'Edge' },
  { type: 'edge-micro-dc', campus: 'DAL', status: 'Operational', group: 'Edge' },
  { type: 'retail-colo', campus: 'FRA', status: 'Operational', group: 'Production' },
  { type: 'carrier-hotel', campus: 'FRA', status: 'Operational', group: 'Production' },
  { type: 'ixp', campus: 'FRA', status: 'Operational', group: 'Production' },
  { type: 'server-room', campus: 'DUB', status: 'Decommissioning', group: 'Edge' },
  { type: 'central-office', campus: 'DUB', status: 'Operational', group: 'Production' },
  { type: 'network-pop', campus: 'SIN', status: 'Operational', group: 'Production' },
  { type: 'national-core-nfvi', campus: 'SIN', status: 'Operational', group: 'Production' },
  { type: 'mtso', campus: 'SYD', status: 'Operational', group: 'Production' },
  { type: 'regional-edge-dc', campus: 'GRU', status: 'Operational', group: 'Disaster Recovery' },
];

const TEAM_OWNERS = ['Platform', 'AI/ML', 'Storage', 'NetEng'] as const;

/** Asset model catalogue: [manufacturer, model, category, U, typical W, max W, weight kg, EOL years ahead]. */
const MODEL_DEFS: Array<[string, string, E.AssetCategory, number, number, number, number, number]> = [
  ['Dell', 'PowerEdge R760', 'Server', 2, 800, 1100, 32, 4],
  ['Dell', 'PowerEdge XE9680', 'GPU-Node', 6, 9000, 10200, 95, 5],
  ['HPE', 'ProLiant DL380 Gen11', 'Server', 2, 750, 1000, 30, 4],
  ['Supermicro', 'SYS-821GE GPU SuperServer', 'GPU-Node', 8, 10800, 12000, 110, 5],
  ['NVIDIA', 'DGX H100', 'GPU-Node', 8, 10200, 10200, 130, 5],
  ['Pure Storage', 'FlashArray //X70', 'Storage', 3, 1100, 1200, 45, 5],
  ['NetApp', 'AFF A400', 'Storage', 4, 1200, 1400, 50, 5],
  ['Cisco', 'Nexus 9336C-FX2', 'Switch', 1, 600, 650, 10, 6],
  ['Arista', '7050X3-48YC8', 'Switch', 1, 450, 500, 11, 6],
  ['Juniper', 'QFX5120-48Y', 'Switch', 1, 440, 480, 9, 6],
  ['Cisco', 'Catalyst 9300-48P', 'Switch', 1, 350, 715, 8, 6],
  ['Cisco', 'ASR 9006', 'Router', 10, 2000, 2200, 70, 7],
  ['Juniper', 'MX480', 'Router', 8, 1800, 2000, 60, 7],
  ['Palo Alto', 'PA-5450', 'Firewall', 3, 1300, 1500, 25, 5],
  ['F5', 'BIG-IP i7800', 'Other', 1, 450, 500, 12, 5],
  ['Opengear', 'OM2248 Console Server', 'Other', 1, 60, 80, 4, 6],
  ['Cisco', 'Catalyst 9120 Access Point', 'Other', 0, 25, 30, 1, 5],
  ['APC', 'Smart-UPS SRT 10kVA', 'UPS', 6, 0, 0, 120, 6],
  ['Vertiv', 'Geist rPDU 3-phase', 'PDU', 0, 0, 0, 6, 8],
];

export function seedEstate(S: Seed): void {
  // ── Asset model catalogue (every field, real EOL dates) ──
  for (const [mfr, model, cat, u, typ, max, w, eolYears] of MODEL_DEFS) {
    const id = S.nid('AMODEL');
    S.assetModels.push({ id, amodelId: id, ...S.meta(), manufacturer: mfr, model, category: cat, heightU: u, typicalPowerW: typ, maxPowerW: max || typ, weightKg: w, formFactor: u === 0 ? 'Zero-U / mount' : u >= 6 ? `${u}U (full depth)` : `${u}U`, eolDate: S.daysAhead(eolYears * 365), notes: `${cat} — ${mfr} ${model}` });
  }

  // ── Facility-type reference table (one row per catalogue entry) ──
  {
    const orderBySeg: Record<string, number> = {};
    for (const t of DC_TYPE_CATALOG) {
      const id = `DCT-${t.key}`;
      const order = (orderBySeg[t.segment] = (orderBySeg[t.segment] ?? 0) + 1);
      S.dataCenterTypes.push({
        id, dctId: id, ...S.meta(), key: t.key, name: t.name, segment: t.segment, description: t.description,
        typicalRacksMin: t.typicalRacks[0], typicalRacksMax: t.typicalRacks[1] ?? undefined,
        powerKwMin: t.powerKw[0], powerKwMax: t.powerKw[1] ?? undefined,
        kwPerRackMin: t.kwPerRack?.[0], kwPerRackMax: t.kwPerRack?.[1],
        cooling: t.cooling, redundancy: t.redundancy, defaultTier: t.defaultTier, coverage: t.coverage, gaps: t.gaps,
        highDensity: !!t.highDensity, dcPowerPlant: !!t.dcPowerPlant, multiTenant: !!t.multiTenant, order,
      });
    }
  }

  // ── Reference groups the estate hangs off ──
  const sgIdBy: Record<string, string> = {};
  for (const n of ['Production', 'Disaster Recovery', 'Edge'] as const) { const id = S.nid('SG'); sgIdBy[n] = id; S.siteGroups.push({ id, sgId: id, ...S.meta(), name: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), notes: `${n} sites` }); }
  const rrIdBy: Record<string, string> = {};
  for (const [n, c] of [['Compute', '#16a34a'], ['Network', '#2563eb'], ['Storage', '#0891b2'], ['GPU', '#7c3aed'], ['Mixed', '#64748b']] as const) { const id = S.nid('RR'); rrIdBy[n] = id; S.rackRoles.push({ id, rrId: id, ...S.meta(), name: n, slug: n.toLowerCase(), color: c }); }
  const rackTypeFor: Record<string, string> = {};
  const rtDefs: Array<[string, string, 42 | 45 | 48, E.RackWidth, number, number, number, number]> = [
    ['Vertiv', 'VR3300 42U', 42, 19, 600, 1200, 1000, 150], ['APC', 'NetShelter SX 48U', 48, 19, 600, 1200, 1070, 170], ['Rittal', 'TS IT 45U', 45, 19, 600, 1200, 1000, 160], ['Telect', 'Seismic 23in 45U', 45, 23, 660, 600, 500, 90], ['Rittal', 'ETSI 600 21in 42U', 42, 21, 600, 600, 500, 95],
  ];
  for (const [mfr, model, u, w, ow, od, md, kg] of rtDefs) {
    const id = S.nid('RTYPE'); rackTypeFor[`${u}-${w}`] = id;
    S.rackTypes.push({ id, rtypeId: id, ...S.meta(), manufacturer: mfr, model, uHeight: u, widthIn: w, formFactor: w === 23 ? '2-post' : '4-post', startingUnit: 1, descendingUnits: false, outerWidthMm: ow, outerDepthMm: od, mountingDepthMm: md, weight: kg, weightUnit: 'kg' });
  }

  // ── Enterprise → regions → campuses ──
  const entId = S.nid('ENT');
  S.enterprises.push({ id: entId, entId, ...S.meta(), name: 'Global Enterprise', tenantCode: 'DCOS', headquartersCountry: 'United States', regionCount: 0, status: 'Active', notes: 'Single-tenant estate; colocation sites host named tenants.' });
  const regionIdBy: Record<string, string> = {};
  for (const rn of ['North America', 'EMEA', 'APAC', 'LATAM'] as const) {
    const regId = S.nid('REG'); regionIdBy[rn] = regId;
    S.regions.push({ id: regId, regId, ...S.meta(), enterpriseId: entId, name: rn, geo: rn, campusCount: 0 });
  }
  const campusIdBy: Record<string, string> = {};
  for (const c of CAMPUSES) {
    const cmpId = S.nid('CMP'); campusIdBy[c.key] = cmpId;
    S.campuses.push({ id: cmpId, cmpId, ...S.meta(), regionId: regionIdBy[c.region], name: `${c.city} Campus`, latitude: c.lat, longitude: c.lng, city: c.city, country: c.country, dataCenterCount: 0, notes: `Campus code ${c.key}` });
  }

  // ── Sites ──
  const seqByCampus: Record<string, number> = {};
  let assetSeq = 0;
  SITE_PLAN.forEach((site, siteIdx) => {
    const dcType = dcTypeProfile(site.type) as DcTypeProfile;
    const campus = CAMPUSES.find((c) => c.key === site.campus) as CampusDef;
    const ph = dcType.physical;
    const seqKey = `${campus.key}-${dcType.label}`;
    const n = (seqByCampus[seqKey] = (seqByCampus[seqKey] ?? 0) + 1);
    const dcId = S.nid('DC');
    const targetRacks = Math.max(1, Math.round(dcType.seedRacks * S.scale));
    const [dLo, dHi] = dcType.kwPerRack ?? [4, 10];
    const designPowerKw = clampDesignPower(dcType, targetRacks * ((dLo + dHi) / 2) * 1.3);
    const underConstruction = site.status === 'Construction';
    const retiring = site.status === 'Decommissioning';
    const code = `${campus.key}-${dcType.label}${n}`;
    const dc: T.DataCenter = {
      id: dcId, dcId, ...S.meta(S.byRole('Facilities Director')), campusId: campusIdBy[campus.key], siteGroupId: sgIdBy[site.group],
      name: `${campus.city} ${dcType.label}-${n}`, code, dcTypeKey: dcType.key, tier: site.tier ?? dcType.defaultTier, status: site.status,
      designPowerKw, designCoolingKw: Math.round(designPowerKw * 1.2), totalRacks: 0,
      commissionedDate: underConstruction ? undefined : S.daysAgo(365 * (dcType.segment === 'Telco' ? 12 : 6) + siteIdx * 37),
      latitude: S.r1(campus.lat + (siteIdx % 3) * 0.04), longitude: S.r1(campus.lng + (n - 1) * 0.05),
      notes: underConstruction ? 'DC4 greenfield build in flight — first hall targeted for ready-for-service.' : retiring ? 'Being consolidated into the Dublin central office; racks retire as workloads migrate.' : `${dcType.name} · ${dcType.cooling} · ${dcType.redundancy}`,
    };
    S.dataCenters.push(dc);
    S.dcProfile.set(dcId, dcType);
    S.dcCampus.set(dcId, campus.key);
    const rgId = S.nid('RG');
    S.rackGroups.push({ id: rgId, rgId, ...S.meta(), dataCenterId: dcId, name: `${code} Floor Group`, slug: `${code.toLowerCase()}-fg`, notes: 'All racks of the site' });

    // ── Plant: utility → backup → distribution; cooling zones with the type's unit mix ──
    const plan = plantPlan(dcType, designPowerKw, targetRacks, (a, b) => S.int(a, b));
    const plantStatus = (i: number): E.EquipmentStatus => (underConstruction ? 'Maintenance' : i === 0 && siteIdx === 2 ? 'Degraded' : 'Operational');
    const feedIds = plan.feeds.map((f, fi) => {
      const feedId = S.nid('FEED');
      S.utilityFeeds.push({ id: feedId, feedId, ...S.meta(), dataCenterId: dcId, name: f.name, capacityKw: f.capacityKw, voltage: f.voltage, provider: S.cycle(['Dominion Energy', 'Oncor', 'Mainova', 'ESB Networks', 'SP Group', 'Ausgrid', 'Enel São Paulo'], CAMPUSES.indexOf(campus)), redundancyRole: f.role, notes: `${f.voltage >= 1000 ? 'HV intake' : 'LV intake'} · ${f.role}` });
      if (f.voltage >= 1000) {
        const xfmrId = S.nid('XFMR');
        S.transformers.push({ id: xfmrId, xfmrId, ...S.meta(), feedId, name: `TX-${f.role}`, capacityKva: Math.round(f.capacityKw * 1.25), loadKw: underConstruction ? 0 : Math.round(f.capacityKw * S.int(30, 65) / 100), status: plantStatus(fi) });
      }
      return feedId;
    });
    const upsForDc = plan.backup.map((b, bi) => {
      const upsId = S.nid('UPS');
      const load = underConstruction ? 0 : Math.round(b.capacityKw * S.int(35, 75) / 100);
      S.upsUnits.push({ id: upsId, upsId, ...S.meta(), dataCenterId: dcId, name: b.name, capacityKw: b.capacityKw, loadKw: load, loadPct: S.pct(load, b.capacityKw), redundancy: (site.tier ?? dcType.defaultTier) === 'Tier IV' ? '2N+1' : ph.redundancy, runtimeMinutes: b.runtimeMins, feedId: feedIds[b.feedIdx], status: plantStatus(bi), notes: dcType.dcPowerPlant ? '−48 V DC plant: rectifier shelves + battery strings' : 'Double-conversion UPS with battery cabinet' });
      return upsId;
    });
    const zonesForDc = plan.zones.map((z, zi) => {
      const coolzId = S.nid('COOLZ');
      const cap = Math.round(designPowerKw * 0.7 / plan.zones.length);
      const load = underConstruction ? 0 : Math.round(cap * S.int(40, 80) / 100);
      S.coolingZones.push({ id: coolzId, coolzId, ...S.meta(), dataCenterId: dcId, name: z.name, coolingCapacityKw: cap, currentLoadKw: load, headroomKw: cap - load, setpointC: ph.liquidCooling === 'standard' ? S.int(26, 30) : S.int(22, 27), notes: `${z.units.map((u) => u.type).join(' + ')} zone` });
      z.units.forEach((u, ui) => {
        const cracId = S.nid('CRAC');
        const liquid = u.type === 'CDU' || u.type === 'RDHx';
        // One failed unit at the GPU factory (drives a cooling incident), one under maintenance at the colo.
        const status: E.EquipmentStatus = underConstruction ? 'Maintenance' : siteIdx === 1 && zi === 0 && ui === 1 ? 'Failed' : siteIdx === 6 && zi === 1 && ui === 0 ? 'Maintenance' : 'Operational';
        S.cracUnits.push({ id: cracId, cracId, ...S.meta(), coolingZoneId: coolzId, name: u.name, capacityKw: Math.round(cap / z.units.length), type: u.type, status, supplyTempC: S.r1(liquid ? S.int(25, 32) : S.int(16, 20)), returnTempC: S.r1(liquid ? S.int(35, 45) : S.int(26, 32)), notes: liquid ? 'Liquid loop — facility water to technology cooling system' : 'Air-side unit' });
      });
      return coolzId;
    });
    const pduIds: string[] = [];
    plan.distribution.forEach((d) => {
      const pduId = S.nid('PDU'); pduIds.push(pduId);
      const load = underConstruction ? 0 : Math.round(d.capacityKw * S.int(30, 85) / 100);
      const outlets = dcType.dcPowerPlant ? 24 : 48;
      S.pdus.push({ id: pduId, pduId, ...S.meta(), upsId: upsForDc[d.backupIdx], name: d.name, capacityKw: d.capacityKw, loadKw: load, loadPct: S.pct(load, d.capacityKw), outletCount: outlets, outletsUsed: underConstruction ? 0 : S.int(Math.round(outlets * 0.2), Math.round(outlets * 0.95)), notes: dcType.dcPowerPlant ? 'Battery distribution fuse board' : 'Floor-standing PDU' });
    });

    // ── Buildings → floors → halls → rows → racks ──
    const perBuilding = Math.ceil(targetRacks / ph.buildings);
    let hallSeq = 0; let rackSeqInSite = 0;
    const siteRacks: T.Rack[] = [];
    const hallIds: string[] = [];
    for (let b = 0; b < ph.buildings; b++) {
      const bldId = S.nid('BLD');
      S.buildings.push({ id: bldId, bldId, ...S.meta(), dataCenterId: dcId, name: ph.buildings > 1 ? `Building ${String.fromCharCode(65 + b)} (AZ-${b + 1})` : 'Building A', floorCount: 0, grossAreaSqm: Math.max(120, perBuilding * S.int(20, 30)), notes: `${dcType.name} shell` });
      const nFloors = S.int(ph.floorsPerBuilding[0], ph.floorsPerBuilding[1]);
      const hallsInBuilding = Math.max(1, Math.ceil(perBuilding / 48));
      const racksPerHall = Math.ceil(perBuilding / hallsInBuilding);
      let remainingB = perBuilding;
      for (let f = 0; f < nFloors; f++) {
        const flrId = S.nid('FLR');
        S.floors.push({ id: flrId, flrId, ...S.meta(), buildingId: bldId, name: nFloors > 1 ? `Floor ${f + 1}` : 'Ground floor', level: f + 1, usableAreaSqm: Math.max(60, racksPerHall * S.int(10, 18)), floorLoadingKgSqm: dcType.highDensity ? S.int(1800, 2500) : S.int(1000, 1800), hallCount: 0 });
        for (let h = f; h < hallsInBuilding; h += nFloors) {
          const rackCount = Math.min(remainingB, racksPerHall);
          if (rackCount <= 0) continue;
          remainingB -= rackCount;
          const hallId = S.nid('HALL'); hallIds.push(hallId);
          const cap = Math.max(rackCount, Math.ceil(rackCount / 0.8));
          const cols = rackCount <= 6 ? cap : Math.min(10, Math.max(4, Math.ceil(Math.sqrt(cap * 1.6))));
          const grows = Math.max(1, Math.ceil(cap / cols));
          const capacity = cols * grows;
          const coolingZoneId = zonesForDc[hallSeq % zonesForDc.length];
          hallSeq++;
          const hallName = dcType.key === 'modular-pod' ? `POD ${hallSeq}` : dcType.key === 'server-room' ? 'IT room' : dcType.key === 'edge-micro-dc' ? 'Edge enclosure' : dcType.multiTenant && hallSeq % 2 === 0 ? `Suite ${hallSeq}` : `Hall ${hallSeq}`;
          const hallRacks: T.Rack[] = [];
          S.halls.push({ id: hallId, hallId, ...S.meta(), floorId: flrId, dataCenterId: dcId, name: hallName, gridCols: cols, gridRows: grows, designPowerKw: 0, coolingZoneId, rackCount, rackCapacity: capacity, utilizationPct: S.pct(rackCount, capacity), notes: `${ph.containment === 'None' ? 'No containment' : `${ph.containment} containment`} · ${ph.rackHeightU}U racks` });

          let placed = 0;
          for (let rr = 0; rr < grows && placed < rackCount; rr++) {
            const rowId = S.nid('ROW');
            let rowRacks = 0;
            S.rows.push({ id: rowId, rowId, ...S.meta(), hallId, name: `Row ${String.fromCharCode(65 + rr)}`, gridPosition: `${rr}`, containment: ph.containment, rackCount: 0 });
            for (let rkx = 0; rkx < cols && placed < rackCount; rkx++) {
              placed++; rowRacks++; rackSeqInSite++;
              const rackId = S.nid('RACK');
              const purpose: E.RackPurpose = dcType.highDensity
                ? S.cycle(['GPU', 'GPU', 'GPU', 'GPU', 'Network', 'Storage', 'GPU', 'Compute', 'GPU', 'GPU'] as const, rackSeqInSite)
                : dcType.segment === 'Telco'
                  ? S.cycle(['Network', 'Network', 'Compute', 'Network', 'Mixed', 'Compute', 'Storage', 'Network', 'Compute', 'Network'] as const, rackSeqInSite)
                  : dcType.multiTenant
                    ? S.cycle(['Mixed', 'Compute', 'Network', 'Compute', 'Storage', 'Mixed', 'Compute', 'Storage', 'Network', 'Mixed'] as const, rackSeqInSite)
                    : S.cycle(['Compute', 'Compute', 'Storage', 'Compute', 'Network', 'Compute', 'GPU', 'Compute', 'Storage', 'Network'] as const, rackSeqInSite);
              const isGpu = purpose === 'GPU';
              const heightU = ph.rackHeightU;
              const widthIn: E.RackWidth = dcType.key === 'central-office' ? 23 : dcType.key === 'network-pop' || dcType.key === 'national-core-nfvi' ? 21 : 19;
              // A Tier IV site runs 2N+1 on its racks and plant.
              const redundancy: E.PowerRedundancy = (site.tier ?? dcType.defaultTier) === 'Tier IV' ? '2N+1' : ph.redundancy;
              const maxPowerKw = isGpu && !dcType.highDensity ? S.int(dHi, dHi * 2) : S.int(dLo, dHi);
              const maxWeightKg = dcType.highDensity ? S.int(1500, 2200) : S.int(900, 1500);
              const liquidCoolingReady = ph.liquidCooling === 'standard' ? true : ph.liquidCooling === 'optional' ? (isGpu ? rackSeqInSite % 4 !== 0 : rackSeqInSite % 9 === 0) : false;
              // Status is dealt deterministically and made true by the devices placed below:
              // Planned racks are empty, Retired racks hold only retired kit, Full racks fill up in the post-pass.
              const status: E.RackStatus = underConstruction ? 'Planned'
                : retiring ? (rackSeqInSite % 2 === 0 ? 'Retired' : 'Active')
                : rackSeqInSite % 31 === 7 ? 'Planned' : rackSeqInSite % 37 === 11 ? 'Retired' : rackSeqInSite % 23 === 5 ? 'Reserved' : 'Active';
              const owner = ph.tenants ? S.cycle(ph.tenants, rackSeqInSite) : S.cycle(TEAM_OWNERS, rackSeqInSite);
              const rack: T.Rack = {
                id: rackId, rackId, ...S.meta(), rowId, hallId, dataCenterId: dcId, name: `R-${String.fromCharCode(65 + rr)}${String(rkx + 1).padStart(2, '0')}`,
                gridX: rkx, gridY: rr, heightU, usedU: 0, availableU: heightU, widthMm: widthIn === 23 ? 660 : 600, depthMm: isGpu || liquidCoolingReady ? 1200 : 1070,
                maxWeightKg, currentWeightKg: 0, maxPowerKw, currentPowerKw: 0, powerUtilizationPct: 0,
                redundancy, coolingZoneId, thermalDensityKwPerRack: 0, purpose, status, liquidCoolingReady,
                owner, roleId: rrIdBy[purpose] ?? rrIdBy.Mixed, rackTypeId: rackTypeFor[`${heightU}-${widthIn}`] ?? rackTypeFor['42-19'], rackGroupId: rgId,
                widthIn, startingUnit: 1, descendingUnits: false, outerWidthMm: widthIn === 23 ? 660 : 600, outerDepthMm: isGpu ? 1250 : 1100, mountingDepthMm: isGpu ? 1150 : 1000,
                notes: status === 'Reserved' ? `Held for ${owner} expansion` : status === 'Planned' ? 'Position allocated; rack not yet delivered' : status === 'Retired' ? 'Decommissioned; awaiting removal' : undefined,
              };
              S.racks.push(rack); hallRacks.push(rack); siteRacks.push(rack);

              // ── Devices in this rack (asset scaffold) ──
              if (status === 'Planned') continue;
              const nAssets = status === 'Retired' ? S.int(1, 2) : S.int(2, Math.min(dcType.highDensity ? 5 : targetRacks <= 10 ? 5 : 9, Math.floor(heightU / 4)));
              // Target utilisation: a few racks per site run hot (over the type's block threshold) so capacity
              // policy and the optimisation finder have something real to point at; the rest sit in band.
              const hot = status === 'Active' && rackSeqInSite % 19 === 1;
              const targetUtil = hot ? S.int(93, 99) / 100 : status === 'Retired' ? 0 : S.int(35, 85) / 100;
              const drawBudgetW = rack.maxPowerKw * 1000 * targetUtil;
              let uCursor = 1; const rackAssets: AssetSeed[] = [];
              for (let a = 0; a < nAssets && uCursor < heightU; a++) {
                const useNet = purpose === 'Network' ? a % 10 < 7 : dcType.segment === 'Telco' ? a % 5 < 2 : a % 8 === 0;
                const pool = useNet ? S.assetModels.filter((m) => m.category === 'Switch' && (m.model.includes('QFX') || m.model.includes('7050')))
                  : isGpu ? S.assetModels.filter((m) => m.category === 'GPU-Node')
                  : purpose === 'Storage' ? S.assetModels.filter((m) => m.category === 'Storage' || (a % 3 === 0 && m.category === 'Server'))
                  : S.assetModels.filter((m) => m.category === 'Server' || (a % 4 === 3 && m.category === 'Storage'));
                const m = S.cycle(pool, assetSeq + a);
                if (uCursor + m.heightU > heightU) break;
                assetSeq++;
                const assetId = S.nid('ASSET');
                // Lifecycle dealt deterministically; status follows lifecycle.
                let lifecycle: E.AssetLifecycle = 'Active'; let st: E.AssetStatus = 'Active';
                if (status === 'Retired' || retiring && rackSeqInSite % 3 !== 0) { lifecycle = 'Retired'; st = 'Inactive'; }
                else if (assetSeq % 17 === 0) { lifecycle = 'Maintenance'; st = 'Maintenance'; }
                else if (assetSeq % 29 === 0) { lifecycle = 'Installed'; st = 'Active'; }
                else if (assetSeq % 41 === 0) { lifecycle = 'Retired'; st = 'Inactive'; }
                else if (assetSeq % 53 === 0) { lifecycle = 'Active'; st = 'Faulty'; }
                const draws = st === 'Active' || st === 'Faulty' ? Math.round(Math.min(m.maxPowerW, Math.max(m.typicalPowerW * 0.5, drawBudgetW / nAssets))) : 0;
                const prefix = m.category === 'GPU-Node' ? 'gpu' : m.category === 'Storage' ? 'sto' : m.category === 'Switch' ? 'tor' : 'srv';
                const asset: AssetSeed = {
                  id: assetId, assetId, ...S.meta(), rackId, dataCenterId: dcId, startU: uCursor, heightU: m.heightU, assetModelId: m.id,
                  hostname: `${code.toLowerCase()}-${prefix}-${String(assetSeq).padStart(4, '0')}`, serialNumber: S.serial(10), assetTag: `AT-${String(100000 + assetSeq)}`,
                  category: m.category, manufacturer: m.manufacturer, model: m.model, powerDrawW: draws, weightKg: m.weightKg, ratedThermalW: m.maxPowerW || 200,
                  lifecycleState: lifecycle, ownerTeam: ph.tenants ? owner : S.cycle(TEAM_OWNERS, assetSeq), status: st,
                  commissionedDate: lifecycle === 'Installed' ? S.daysAgo(S.int(3, 20)) : S.daysAgo(S.int(120, 1400)),
                  decommissionDate: lifecycle === 'Retired' ? S.daysAgo(S.int(5, 90)) : undefined,
                  notes: st === 'Faulty' ? 'Hardware fault reported; replacement part on order' : lifecycle === 'Maintenance' ? 'Under scheduled maintenance' : undefined,
                  fabricRole: m.category === 'Switch' ? 'access' : undefined,
                };
                S.assets.push(asset); rackAssets.push(asset);
                uCursor += m.heightU;
              }
              void rackAssets;
            }
            S.rows[S.rows.length - 1].rackCount = rowRacks;
          }
          const hall = S.halls[S.halls.length - 1];
          hall.designPowerKw = Math.round(hallRacks.reduce((s, r) => s + r.maxPowerKw, 0) * 1.1);
        }
      }
    }
    // Spread floor PDUs across halls.
    pduIds.forEach((pid, i) => { const p = S.pdus.find((x) => x.id === pid); if (p && hallIds.length) p.hallId = hallIds[i % hallIds.length]; });
    // Showcase racks: the first two Active racks of the site get full cabling and rack PDUs in the dcim module.
    S.showcaseRacks.set(dcId, siteRacks.filter((r) => r.status === 'Active').slice(0, 2));

    // ── Staging pool: kit on site but not yet racked (Ordered / Received / Staged), plus disposed kit ──
    if (!underConstruction) {
      (['Ordered', 'Received', 'Staged'] as const).forEach((lc, k) => {
        const m = S.cycle(S.assetModels.filter((x) => x.category === 'Server' || x.category === 'GPU-Node'), siteIdx + k);
        assetSeq++;
        const assetId = S.nid('ASSET');
        S.assets.push({ id: assetId, assetId, ...S.meta(), dataCenterId: dcId, heightU: m.heightU, assetModelId: m.id, hostname: `${code.toLowerCase()}-stg-${String(assetSeq).padStart(4, '0')}`, serialNumber: lc === 'Ordered' ? 'PENDING' : S.serial(10), assetTag: `AT-${String(100000 + assetSeq)}`, category: m.category, manufacturer: m.manufacturer, model: m.model, powerDrawW: 0, weightKg: m.weightKg, ratedThermalW: m.maxPowerW, lifecycleState: lc, ownerTeam: S.cycle(TEAM_OWNERS, k), status: 'Inactive', notes: lc === 'Ordered' ? 'On order — PO raised, awaiting delivery' : lc === 'Received' ? 'Received at goods-in; awaiting staging' : 'Staged and burn-in complete; awaiting rack-and-stack change window' });
      });
      if (siteIdx % 7 === 0) {
        const m = S.assetModels.find((x) => x.category === 'Server') as T.AssetModel;
        assetSeq++;
        const assetId = S.nid('ASSET');
        S.assets.push({ id: assetId, assetId, ...S.meta(), dataCenterId: dcId, heightU: m.heightU, assetModelId: m.id, hostname: `${code.toLowerCase()}-dsp-${String(assetSeq).padStart(4, '0')}`, serialNumber: S.serial(10), assetTag: `AT-${String(100000 + assetSeq)}`, category: m.category, manufacturer: m.manufacturer, model: m.model, powerDrawW: 0, weightKg: m.weightKg, ratedThermalW: m.maxPowerW, lifecycleState: 'Disposed', ownerTeam: 'Platform', status: 'Inactive', commissionedDate: S.daysAgo(2200), decommissionDate: S.daysAgo(40), notes: 'Sanitised and disposed via certified recycler; certificate on file' });
      }
    }

    // ── Compute roll-up for the DC (GPU totals reconciled from placed devices in the post-pass) ──
    const compId = S.nid('COMP');
    const dcRackCount = siteRacks.length;
    const cores = underConstruction ? 0 : dcRackCount * S.int(48, 128);
    const memGb = cores * 8;
    const storTb = underConstruction ? 0 : dcRackCount * S.int(4, 30);
    const netGbps = underConstruction ? 0 : dcRackCount * S.int(4, 20);
    S.computeResources.push({ id: compId, compId, ...S.meta(), scopeType: 'DataCenter', scopeId: dcId, cpuCoresTotal: cores, cpuCoresUsed: Math.round(cores * S.int(45, 85) / 100), memoryGbTotal: memGb, memoryGbUsed: Math.round(memGb * S.int(40, 85) / 100), storageTbTotal: storTb, storageTbUsed: Math.round(storTb * S.int(35, 80) / 100), gpuCountTotal: 0, gpuCountUsed: 0, networkGbpsTotal: netGbps, networkGbpsUsed: Math.round(netGbps * S.int(25, 75) / 100) });
  });

  // ── Hall-scoped compute roll-ups for the two showcase halls (Hall scope coverage) ──
  S.halls.slice(0, 2).forEach((h) => {
    const compId = S.nid('COMP');
    const rc = S.racks.filter((r) => r.hallId === h.id).length;
    const cores = rc * 96;
    S.computeResources.push({ id: compId, compId, ...S.meta(), scopeType: 'Hall', scopeId: h.id, cpuCoresTotal: cores, cpuCoresUsed: Math.round(cores * 0.7), memoryGbTotal: cores * 8, memoryGbUsed: Math.round(cores * 8 * 0.65), storageTbTotal: rc * 12, storageTbUsed: Math.round(rc * 12 * 0.6), gpuCountTotal: 0, gpuCountUsed: 0, networkGbpsTotal: rc * 10, networkGbpsUsed: Math.round(rc * 10 * 0.5) });
  });

  // ── Backfill roll-up counts ──
  S.enterprises[0].regionCount = S.regions.length;
  S.regions.forEach((r) => (r.campusCount = S.campuses.filter((c) => c.regionId === r.id).length));
  S.campuses.forEach((c) => (c.dataCenterCount = S.dataCenters.filter((d) => d.campusId === c.id).length));
  S.buildings.forEach((b) => (b.floorCount = S.floors.filter((f) => f.buildingId === b.id).length));
  S.floors.forEach((f) => (f.hallCount = S.halls.filter((h) => h.floorId === f.id).length));
  S.dataCenters.forEach((d) => (d.totalRacks = S.racks.filter((rk) => rk.dataCenterId === d.id).length));
}
