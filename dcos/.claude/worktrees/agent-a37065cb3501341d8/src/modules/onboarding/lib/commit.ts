/**
 * Onboarding — commit a wizard draft into the in-memory mock DB.
 * Writes the full Campus?/DataCenter/Building/Floor/Hall/Row/Rack chain so the
 * new site immediately appears on the GIS map, the hierarchy tree, the global
 * DC filter and capacity rollups. Mirrors the field shapes used by seed.ts.
 */
import { db } from '../../../mock/db';
import type { DCTier, FacilityStatus, RackPurpose, PowerRedundancy, DcTypeKey } from '../../../mock/data/enums';
import { dcTypeProfile, plantPlan } from '../../../mock/data/dcTypes';

export type Scenario = 'existing' | 'greenfield';

/** A hall stamped onto the uploaded floor plan. x/y are 0..1 of the canvas. */
export interface HallDraft {
  id: string;
  name: string;
  x: number;
  y: number;
  gridCols: number;
  gridRows: number;
}

/** A floor within the building. Each floor has its own uploaded plan + halls. */
export interface FloorDraft {
  id: string;
  name: string;
  level: number;
  planImage?: string; // dataURL backdrop (wizard aid; not persisted to the DB)
  halls: HallDraft[];
}

/** A building within the data center. Each building has one or more floors. */
export interface BuildingDraft {
  id: string;
  name: string;
  floors: FloorDraft[];
}

/** One parsed rack from the inventory import (existing-DC flow). */
export interface RackImportRow {
  hall: string;
  row?: string;
  name: string;
  purpose: RackPurpose;
  heightU: number;
  usedU: number;
  maxPowerKw: number;
  currentPowerKw: number;
}

export interface DcDraft {
  name: string;
  code: string;
  regionId: string;
  campusId?: string;
  newCampusName?: string;
  newCampusCity?: string;
  /** Facility classification from the type catalogue; optional so legacy / imported sites can stay untyped. */
  dcTypeKey?: DcTypeKey;
  tier: DCTier;
  designPowerKw: number;
  latitude: number;
  longitude: number;
  status: FacilityStatus;
}

export interface OnboardingDraft {
  scenario: Scenario;
  dc: DcDraft;
  buildings: BuildingDraft[];
  inventory: RackImportRow[];
}

const CUSTOMER = 'CUST-001';
const counters: Record<string, number> = {};
function nid(p: string): string {
  counters[p] = (counters[p] ?? Math.floor(Math.random() * 1000) + 9000) + 1;
  return `${p}-${String(counters[p]).padStart(4, '0')}`;
}
function meta() {
  const now = new Date().toISOString();
  return {
    customerId: CUSTOMER,
    createdAt: now,
    updatedAt: now,
    createdBy: 'You',
    createdById: 'me',
    isDeleted: false,
  };
}
const pct = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 100) : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface CommitResult {
  dcId: string;
  campusId: string;
  buildings: number;
  floors: number;
  halls: number;
  racks: number;
  rackCapacity: number;
  /** Plant records written from the type profile (0 when the site is untyped). */
  plant: { feeds: number; backup: number; distribution: number; coolingZones: number };
}

/** Write the draft into the mock DB. Returns ids + counts for the review step. */
export function commitOnboarding(draft: OnboardingDraft): CommitResult {
  const { dc } = draft;
  // Type profile drives every physical default below (rack height / density / redundancy /
  // containment / liquid readiness) and the plant scaffold. Untyped sites keep the legacy defaults.
  const dcType = dcTypeProfile(dc.dcTypeKey);
  const ph = dcType?.physical;
  const [dLo, dHi] = dcType?.kwPerRack ?? [8, 16];
  const defaultRackKw = Math.round((dLo + dHi) / 2);

  // ── Campus (reuse existing or create new) ──
  let campusId = dc.campusId ?? '';
  if (!campusId) {
    const cmpId = nid('CMP');
    db.create('campuses', {
      id: cmpId, cmpId, ...meta(),
      regionId: dc.regionId,
      name: dc.newCampusName || `${dc.newCampusCity || dc.name} Campus`,
      latitude: dc.latitude, longitude: dc.longitude,
      city: dc.newCampusCity || '—', country: '—', dataCenterCount: 1,
    });
    campusId = cmpId;
  }

  // ── Data center ──
  const dcId = nid('DC');
  db.create('dataCenters', {
    id: dcId, dcId, ...meta(),
    campusId,
    name: dc.name, code: dc.code, dcTypeKey: dc.dcTypeKey, tier: dc.tier, status: dc.status,
    designPowerKw: dc.designPowerKw, designCoolingKw: Math.round(dc.designPowerKw * 1.2),
    totalRacks: 0, commissionedDate: new Date().toISOString(),
    latitude: dc.latitude, longitude: dc.longitude,
  });

  const allFloors = draft.buildings.flatMap((b) => b.floors);
  const allHalls = allFloors.flatMap((f) => f.halls);

  let totalRacks = 0;
  let totalHalls = 0;
  let totalFloors = 0;

  // Group imported inventory by hall name (case-insensitive)
  const invByHall = new Map<string, RackImportRow[]>();
  for (const r of draft.inventory) {
    const key = (r.hall || '').trim().toLowerCase();
    if (!invByHall.has(key)) invByHall.set(key, []);
    invByHall.get(key)!.push(r);
  }

  // ── Buildings → Floors → Halls → Rows → Racks ──
  for (const bd of draft.buildings) {
    const bldId = nid('BLD');
    db.create('buildings', {
      id: bldId, bldId, ...meta(), dataCenterId: dcId, name: bd.name,
      floorCount: bd.floors.length, grossAreaSqm: Math.max(2000, bd.floors.flatMap((f) => f.halls).length * 1500),
    });

    for (const fl of bd.floors) {
      const flrId = nid('FLR');
      db.create('floors', {
        id: flrId, flrId, ...meta(), buildingId: bldId, name: fl.name, level: fl.level,
        usableAreaSqm: Math.max(1000, fl.halls.length * 1000), floorLoadingKgSqm: 1500,
        hallCount: fl.halls.length,
      });
      totalFloors++;

      for (const hd of fl.halls) {
        const cols = Math.max(1, hd.gridCols);
        const grows = Math.max(1, hd.gridRows);
        const capacity = cols * grows;
        const hallId = nid('HALL');

        // Rows first (one per grid row)
        const rowIds: string[] = [];
        for (let ry = 0; ry < grows; ry++) {
          const rowId = nid('ROW');
          rowIds.push(rowId);
          db.create('rows', {
            id: rowId, rowId, ...meta(), hallId,
            name: `Row ${String.fromCharCode(65 + ry)}`, gridPosition: `${ry}`,
            containment: ph?.containment ?? ('Cold-Aisle' as const), rackCount: 0,
          });
        }

        // Decide which racks to place in this hall
        const imported = invByHall.get(hd.name.trim().toLowerCase()) ?? [];
        const useImport = draft.scenario === 'existing' && imported.length > 0;
        const count = useImport ? Math.min(imported.length, capacity) : (draft.scenario === 'greenfield' ? capacity : 0);

        const rowRackCounts = new Array(grows).fill(0);
        for (let i = 0; i < count; i++) {
          const gridX = i % cols;
          const gridY = Math.floor(i / cols);
          if (gridY >= grows) break;
          rowRackCounts[gridY]++;
          const rackId = nid('RACK');

          let purpose: RackPurpose = dcType?.highDensity ? 'GPU' : dcType?.segment === 'Telco' ? 'Network' : 'Compute';
          let heightU: number = ph?.rackHeightU ?? 42, usedU = 0, maxPowerKw = defaultRackKw, currentPowerKw = 0;
          let status: 'Planned' | 'Active' = 'Planned';
          if (useImport) {
            const src = imported[i];
            purpose = src.purpose;
            heightU = src.heightU || 42;
            usedU = Math.min(src.usedU || 0, heightU);
            maxPowerKw = src.maxPowerKw || defaultRackKw;
            currentPowerKw = Math.min(src.currentPowerKw || 0, maxPowerKw);
            status = 'Active';
          }
          const isGpu = purpose === 'GPU';
          const liquidCoolingReady = ph?.liquidCooling === 'standard' ? true : ph?.liquidCooling === 'none' ? false : isGpu;
          db.create('racks', {
            id: rackId, rackId, ...meta(), rowId: rowIds[gridY], hallId, dataCenterId: dcId,
            name: useImport ? imported[i].name : `R-${String.fromCharCode(65 + gridY)}${String(gridX + 1).padStart(2, '0')}`,
            gridX, gridY, heightU, usedU, availableU: heightU - usedU,
            widthMm: 600, depthMm: isGpu ? 1200 : 1070,
            maxWeightKg: 1200, currentWeightKg: usedU > 0 ? 300 + usedU * 15 : 0,
            maxPowerKw, currentPowerKw: r1(currentPowerKw), powerUtilizationPct: pct(currentPowerKw, maxPowerKw),
            redundancy: (ph?.redundancy ?? 'N+1') as PowerRedundancy, thermalDensityKwPerRack: r1(currentPowerKw),
            purpose, status, liquidCoolingReady, owner: ph?.tenants ? 'House' : 'Platform',
          });
          totalRacks++;
        }
        rowIds.forEach((rid, ry) => db.update('rows', rid, { rackCount: rowRackCounts[ry] }));

        db.create('halls', {
          id: hallId, hallId, ...meta(), floorId: flrId, dataCenterId: dcId,
          name: hd.name, gridCols: cols, gridRows: grows,
          designPowerKw: Math.round(dc.designPowerKw / Math.max(1, allHalls.length)),
          rackCount: count, rackCapacity: capacity, utilizationPct: pct(count, capacity),
        });
        totalHalls++;
      }
    }
  }

  db.update('dataCenters', dcId, { totalRacks });

  // ── Plant scaffold from the type profile: utility feeds, UPS / DC plant, PDUs / BDFBs, cooling zones + units ──
  // Without this a freshly onboarded site has no power chain or cooling, so every capacity
  // page reads zero for it. Sizes come from the design power and the rack budget.
  const plant = { feeds: 0, backup: 0, distribution: 0, coolingZones: 0 };
  if (dcType) {
    const rnd = (min: number, max: number) => Math.round((min + max) / 2);
    const plan = plantPlan(dcType, dc.designPowerKw, Math.max(totalRacks, allHalls.reduce((s, h) => s + h.gridCols * h.gridRows, 0)), rnd);
    const greenfield = draft.scenario === 'greenfield';
    const feedIds = plan.feeds.map((f) => {
      const feedId = nid('FEED');
      db.create('utilityFeeds', { id: feedId, feedId, ...meta(), dataCenterId: dcId, name: f.name, capacityKw: f.capacityKw, voltage: f.voltage, provider: '—', redundancyRole: f.role });
      if (f.voltage >= 1000) { const xfmrId = nid('XFMR'); db.create('transformers', { id: xfmrId, xfmrId, ...meta(), feedId, name: `TX-${f.role}`, capacityKva: Math.round(f.capacityKw * 1.25), loadKw: greenfield ? 0 : Math.round(f.capacityKw * 0.45), status: 'Operational' }); }
      plant.feeds++;
      return feedId;
    });
    const upsIds = plan.backup.map((b) => {
      const upsId = nid('UPS');
      const load = greenfield ? 0 : Math.round(b.capacityKw * 0.5);
      db.create('upsUnits', { id: upsId, upsId, ...meta(), dataCenterId: dcId, name: b.name, capacityKw: b.capacityKw, loadKw: load, loadPct: pct(load, b.capacityKw), redundancy: dcType.physical.redundancy, runtimeMinutes: b.runtimeMins, feedId: feedIds[b.feedIdx], status: 'Operational' });
      plant.backup++;
      return upsId;
    });
    plan.distribution.forEach((d) => {
      const pduId = nid('PDU');
      const load = greenfield ? 0 : Math.round(d.capacityKw * 0.5);
      const outlets = dcType.dcPowerPlant ? 24 : 48;
      db.create('pdus', { id: pduId, pduId, ...meta(), upsId: upsIds[d.backupIdx], name: d.name, capacityKw: d.capacityKw, loadKw: load, loadPct: pct(load, d.capacityKw), outletCount: outlets, outletsUsed: greenfield ? 0 : Math.round(outlets * 0.5) });
      plant.distribution++;
    });
    const zoneIds = plan.zones.map((z) => {
      const coolzId = nid('COOLZ');
      const cap = Math.round(dc.designPowerKw * 0.7 / plan.zones.length);
      const load = greenfield ? 0 : Math.round(cap * 0.55);
      db.create('coolingZones', { id: coolzId, coolzId, ...meta(), dataCenterId: dcId, name: z.name, coolingCapacityKw: cap, currentLoadKw: load, headroomKw: cap - load, setpointC: dcType.physical.liquidCooling === 'standard' ? 28 : 24 });
      z.units.forEach((u) => { const cracId = nid('CRAC'); const liquid = u.type === 'CDU' || u.type === 'RDHx'; db.create('cracUnits', { id: cracId, cracId, ...meta(), coolingZoneId: coolzId, name: u.name, capacityKw: Math.round(cap / z.units.length), type: u.type, status: 'Operational', supplyTempC: liquid ? 28 : 18, returnTempC: liquid ? 40 : 29 }); });
      plant.coolingZones++;
      return coolzId;
    });
    // Attach every hall (and its racks) to a cooling zone so cooling headroom rolls up per hall.
    const hallRecs = (db.getAllRaw('halls') as { id: string; dataCenterId: string }[]).filter((h) => h.dataCenterId === dcId);
    hallRecs.forEach((h, i) => db.update('halls', h.id, { coolingZoneId: zoneIds[i % zoneIds.length] }));
    const rackRecs = (db.getAllRaw('racks') as { id: string; hallId: string; dataCenterId: string }[]).filter((r) => r.dataCenterId === dcId);
    const zoneByHall = Object.fromEntries(hallRecs.map((h, i) => [h.id, zoneIds[i % zoneIds.length]]));
    rackRecs.forEach((r) => db.update('racks', r.id, { coolingZoneId: zoneByHall[r.hallId] }));
    // Compute rollup so the site shows on the Compute & GPU page (zeros for a greenfield design).
    const compId = nid('COMP');
    const cores = greenfield ? 0 : totalRacks * 80;
    db.create('computeResources', { id: compId, compId, ...meta(), scopeType: 'DataCenter', scopeId: dcId, cpuCoresTotal: cores, cpuCoresUsed: Math.round(cores * 0.6), memoryGbTotal: cores * 8, memoryGbUsed: Math.round(cores * 8 * 0.6), storageTbTotal: greenfield ? 0 : totalRacks * 12, storageTbUsed: greenfield ? 0 : totalRacks * 7, gpuCountTotal: 0, gpuCountUsed: 0, networkGbpsTotal: greenfield ? 0 : totalRacks * 10, networkGbpsUsed: greenfield ? 0 : totalRacks * 5 });
  }

  return {
    dcId, campusId, buildings: draft.buildings.length, floors: totalFloors, halls: totalHalls, racks: totalRacks,
    rackCapacity: allHalls.reduce((s, h) => s + h.gridCols * h.gridRows, 0), plant,
  };
}

/** CSV → RackImportRow[]. Accepts header row; tolerant of column order. */
export function parseInventoryCsv(text: string): { rows: RackImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], errors: ['No data'] };

  const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    hall: col('hall'), row: col('row'), name: col('rack') >= 0 ? col('rack') : col('name'),
    purpose: col('purpose'), heightU: col('heightu') >= 0 ? col('heightu') : col('height'),
    usedU: col('usedu') >= 0 ? col('usedu') : col('used'),
    maxPowerKw: col('maxpowerkw') >= 0 ? col('maxpowerkw') : col('maxpower'),
    currentPowerKw: col('currentpowerkw') >= 0 ? col('currentpowerkw') : col('power'),
  };
  if (idx.hall < 0 || idx.name < 0) {
    return { rows: [], errors: ['CSV must include at least "hall" and "rack" columns.'] };
  }
  const PURP: RackPurpose[] = ['Compute', 'Storage', 'Network', 'GPU', 'Mixed'];
  const rows: RackImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',').map((x) => x.trim());
    const num = (j: number, d = 0) => (j >= 0 && c[j] !== undefined && c[j] !== '' ? Number(c[j]) || d : d);
    const rawP = (idx.purpose >= 0 ? c[idx.purpose] : '') || 'Compute';
    const purpose = (PURP.find((p) => p.toLowerCase() === rawP.toLowerCase()) ?? 'Compute') as RackPurpose;
    rows.push({
      hall: c[idx.hall] ?? '',
      row: idx.row >= 0 ? c[idx.row] : undefined,
      name: c[idx.name] ?? `Rack ${i}`,
      purpose,
      heightU: num(idx.heightU, 42),
      usedU: num(idx.usedU, 0),
      maxPowerKw: num(idx.maxPowerKw, 12),
      currentPowerKw: num(idx.currentPowerKw, 0),
    });
  }
  if (rows.length === 0) errors.push('No rack rows parsed.');
  return { rows, errors };
}

export const SAMPLE_INVENTORY_CSV = `hall,row,rack,purpose,heightU,usedU,maxPowerKw,currentPowerKw
Hall 1,A,R-A01,GPU,48,40,80,62
Hall 1,A,R-A02,GPU,48,36,80,55
Hall 1,B,R-B01,Compute,42,30,15,9
Hall 1,B,R-B02,Storage,42,28,12,7
Hall 2,A,R-A01,Compute,42,22,15,8
Hall 2,A,R-A02,Network,42,18,10,5`;
