/**
 * Site 360 — the site model every view reads.
 *
 * One hook assembles a data center's halls, racks, devices, plant, network and
 * operations into per-rack metrics, a power-chain graph and site KPIs, so the 3D twin,
 * the one-line, the thermal map and the scorecard never disagree. Colours come from
 * the design-system tokens resolved at runtime (canvas and WebGL need literal values).
 */
import { useMemo } from 'react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { dcTypeProfile, pueFor, pueTargetFor, capacityThresholds } from '../../../mock/data/dcTypes';
import type {
  DataCenter, Hall, Row, Rack, Device, CoolingZone, CRAC, PDU, UPS, UtilityFeed, Transformer, PowerFeed,
  Incident, Alarm, ManagedDevice, TopologyLink, Interface, Circuit, CircuitTermination, Provider, Project, RackReservation,
  Building, Floor, Campus,
} from '../../../mock/data/types';

/** Where the twin is looking: the drill path from the site down to one rack. */
export type TwinLevel = { kind: 'site' } | { kind: 'building'; id: string } | { kind: 'hall'; id: string } | { kind: 'rack'; id: string };
export type TwinView = 'overview' | 'front' | 'top' | 'aisle';
export const TWIN_VIEWS: Array<{ value: TwinView; label: string }> = [{ value: 'overview', label: 'Overview' }, { value: 'front', label: 'Front' }, { value: 'top', label: 'Top' }, { value: 'aisle', label: 'Aisle' }];

export type SiteLayer = 'space' | 'power' | 'cooling' | 'network' | 'delivery' | 'operations' | 'cost';
export const SITE_LAYERS: Array<{ value: SiteLayer; label: string }> = [
  { value: 'space', label: 'Space' }, { value: 'power', label: 'Power' }, { value: 'cooling', label: 'Cooling' },
  { value: 'network', label: 'Network' }, { value: 'delivery', label: 'Delivery' }, { value: 'operations', label: 'Operations' }, { value: 'cost', label: 'Cost' },
];

/** Flat energy tariff and hours used for the cost layer (estimate until a billing feed exists). */
export const ENERGY_TARIFF_USD_PER_KWH = 0.11;
export const HOURS_PER_MONTH = 730;
/** Estimated monthly energy cost of an IT load at the site's PUE. */
export function monthlyEnergyCostUsd(itKw: number, pue: number): number { return Math.round(itKw * pue * HOURS_PER_MONTH * ENERGY_TARIFF_USD_PER_KWH); }

/** Design-system colour tokens resolved to literal values for canvas and WebGL. */
export interface VwPalette { blue: string; blueLight: string; cyan: string; emerald: string; amber: string; red: string; rose: string; violet: string; slate: string; slateLight: string; slateDark: string; ink: string; surface: string; grid: string }
export function useVwPalette(): VwPalette {
  return useMemo(() => {
    const css = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
    const t = (name: string, fallback: string) => (css?.getPropertyValue(name).trim() || fallback);
    return {
      blue: t('--vw-color-blue-500', '#3b82f6'), blueLight: t('--vw-color-blue-300', '#93c5fd'), cyan: t('--vw-color-cyan-500', '#06b6d4'),
      emerald: t('--vw-color-emerald-500', '#10b981'), amber: t('--vw-color-amber-500', '#f59e0b'), red: t('--vw-color-red-500', '#ef4444'),
      rose: t('--vw-color-rose-500', '#f43f5e'), violet: t('--vw-color-violet-500', '#8b5cf6'), slate: t('--vw-color-slate-500', '#64748b'),
      slateLight: t('--vw-color-slate-300', '#cbd5e1'), slateDark: t('--vw-color-slate-700', '#334155'), ink: t('--vw-color-slate-900', '#0f172a'),
      surface: t('--vw-color-slate-50', '#f8fafc'), grid: t('--vw-color-slate-200', '#e2e8f0'),
    };
  }, []);
}

export interface RackVm {
  rack: Rack; deviceCount: number; usedPct: number; powerPct: number; inletC: number;
  incidents: number; alarms: number; networkDevices: number; reserved: boolean; planned: boolean;
  blockPct: number; warnPct: number; containment: Row['containment'];
  /** Estimated monthly energy cost (draw × PUE × 730 h × tariff). */
  costUsd: number;
}
export interface HallVm { hall: Hall; floor?: Floor; building?: Building; rows: Row[]; racks: RackVm[]; itKw: number; maxKw: number; powerPct: number; occupancyPct: number; maxInletC: number; incidents: number; alarms: number; managed: number; costUsd: number; zone?: CoolingZone; cracs: CRAC[]; pdus: PDU[] }
export interface FloorVm { floor: Floor; halls: HallVm[] }
export interface BuildingVm { building: Building; floors: FloorVm[]; halls: HallVm[]; racks: RackVm[]; itKw: number; maxKw: number; powerPct: number; occupancyPct: number; maxInletC: number; incidents: number; alarms: number; managed: number; costUsd: number }
export interface PowerNode { id: string; name: string; kind: 'utility' | 'transformer' | 'ups' | 'pdu' | 'hall'; capacityKw: number; loadKw: number; status: string; side?: 'A' | 'B' }
export interface PowerLink { source: string; target: string; kw: number; status: string }
export interface SiteKpis { itKw: number; designKw: number; headroomKw: number; pue: number; pueTarget: number; racks: number; rackUtilPct: number; openIncidents: number; activeAlarms: number; availabilityPct: number; opexUsd: number; carbonT: number; circuits: number; circuitsOffline: number; devices: number; healthScore: number; health: { run: number; build: number; capacity: number; connectivity: number; governance: number } }
export interface SiteModel {
  dc?: DataCenter; typeName: string; campusName: string; buildings: BuildingVm[]; halls: HallVm[]; racks: RackVm[]; rackById: Map<string, RackVm>; devicesByRack: Map<string, Device[]>;
  zones: CoolingZone[]; cracs: CRAC[]; pdus: PDU[]; ups: UPS[]; feeds: UtilityFeed[]; transformers: Transformer[]; rackFeeds: PowerFeed[];
  incidents: Incident[]; alarms: Alarm[]; managed: ManagedDevice[]; links: TopologyLink[]; interfaces: Interface[]; circuits: Circuit[]; providers: Provider[];
  projects: Project[]; power: { nodes: PowerNode[]; links: PowerLink[] }; kpis: SiteKpis; loading: boolean;
}

const eq = (field: string, value: string) => [{ field, operator: 'eq' as const, value }];

export function useSiteModel(dcId: string | undefined): SiteModel {
  const f = dcId ? eq('dataCenterId', dcId) : [];
  const dcQ = useEntityList('dataCenters', { pageSize: 100 });
  const campuses = (useEntityList('campuses', { pageSize: 100 }).data?.data ?? []) as unknown as Campus[];
  const buildings = (useEntityList(dcId ? 'buildings' : '__noop__', { pageSize: 100, filters: f }).data?.data ?? []) as unknown as Building[];
  const floorsAll = (useEntityList('floors', { pageSize: 1000 }).data?.data ?? []) as unknown as Floor[];
  const halls = (useEntityList(dcId ? 'halls' : '__noop__', { pageSize: 500, filters: f }).data?.data ?? []) as unknown as Hall[];
  const racks = (useEntityList(dcId ? 'racks' : '__noop__', { pageSize: 5000, filters: f }).data?.data ?? []) as unknown as Rack[];
  const devices = (useEntityList(dcId ? 'devices' : '__noop__', { pageSize: 20000, filters: f }).data?.data ?? []) as unknown as Device[];
  const zones = (useEntityList(dcId ? 'coolingZones' : '__noop__', { pageSize: 200, filters: f }).data?.data ?? []) as unknown as CoolingZone[];
  const cracsAll = (useEntityList('cracUnits', { pageSize: 2000 }).data?.data ?? []) as unknown as CRAC[];
  const pdusAll = (useEntityList('pdus', { pageSize: 2000 }).data?.data ?? []) as unknown as PDU[];
  const ups = (useEntityList(dcId ? 'upsUnits' : '__noop__', { pageSize: 200, filters: f }).data?.data ?? []) as unknown as UPS[];
  const feeds = (useEntityList(dcId ? 'utilityFeeds' : '__noop__', { pageSize: 200, filters: f }).data?.data ?? []) as unknown as UtilityFeed[];
  const txAll = (useEntityList('transformers', { pageSize: 500 }).data?.data ?? []) as unknown as Transformer[];
  const rowsAll = (useEntityList('rows', { pageSize: 5000 }).data?.data ?? []) as unknown as Row[];
  const rackFeedsAll = (useEntityList('powerFeeds', { pageSize: 5000 }).data?.data ?? []) as unknown as PowerFeed[];
  const incidents = (useEntityList(dcId ? 'incidents' : '__noop__', { pageSize: 500, filters: f }).data?.data ?? []) as unknown as Incident[];
  const managed = (useEntityList(dcId ? 'managedDevices' : '__noop__', { pageSize: 2000, filters: f }).data?.data ?? []) as unknown as ManagedDevice[];
  const alarmsAll = (useEntityList('alarms', { pageSize: 5000 }).data?.data ?? []) as unknown as Alarm[];
  const linksAll = (useEntityList('topologyLinks', { pageSize: 5000 }).data?.data ?? []) as unknown as TopologyLink[];
  const ifacesAll = (useEntityList('interfaces', { pageSize: 5000 }).data?.data ?? []) as unknown as Interface[];
  const termsAll = (useEntityList('circuitTerminations', { pageSize: 2000 }).data?.data ?? []) as unknown as CircuitTermination[];
  const circuitsAll = (useEntityList('circuits', { pageSize: 2000 }).data?.data ?? []) as unknown as Circuit[];
  const providers = (useEntityList('providers', { pageSize: 100 }).data?.data ?? []) as unknown as Provider[];
  const projects = (useEntityList(dcId ? 'projects' : '__noop__', { pageSize: 500, filters: f }).data?.data ?? []) as unknown as Project[];
  const rsvAll = (useEntityList('rackReservations', { pageSize: 2000 }).data?.data ?? []) as unknown as RackReservation[];

  return useMemo<SiteModel>(() => {
    const dc = ((dcQ.data?.data ?? []) as unknown as DataCenter[]).find((d) => d.id === dcId);
    const prof = dcTypeProfile(dc?.dcTypeKey);
    const thr = capacityThresholds(dc?.dcTypeKey);
    const zoneById = new Map(zones.map((z) => [z.id, z]));
    const zoneIds = new Set(zones.map((z) => z.id));
    const cracs = cracsAll.filter((c) => zoneIds.has(c.coolingZoneId));
    const upsIds = new Set(ups.map((u) => u.id));
    const pdus = pdusAll.filter((p) => p.upsId && upsIds.has(p.upsId));
    const feedIds = new Set(feeds.map((x) => x.id));
    const transformers = txAll.filter((t) => feedIds.has(t.feedId));
    const rackIds = new Set(racks.map((r) => r.id));
    const rackFeeds = rackFeedsAll.filter((pf) => pf.rackId && rackIds.has(pf.rackId));
    const managedIds = new Set(managed.map((m) => m.id));
    const alarms = alarmsAll.filter((a) => managedIds.has(a.deviceId));
    const links = linksAll.filter((l) => managedIds.has(l.aDeviceId) && managedIds.has(l.zDeviceId));
    const interfaces = ifacesAll.filter((i) => managedIds.has(i.deviceId));
    const myTerms = termsAll.filter((t) => t.side === 'A' && t.dataCenterId === dcId);
    const circuitIds = new Set(myTerms.map((t) => t.circuitId));
    const circuits = circuitsAll.filter((c) => circuitIds.has(c.id));
    const rowById = new Map(rowsAll.map((r) => [r.id, r]));

    const devByRack = new Map<string, Device[]>();
    for (const d of devices) if (d.rackId) { const a = devByRack.get(d.rackId) ?? []; a.push(d); devByRack.set(d.rackId, a); }
    const incByRack = new Map<string, number>();
    for (const i of incidents) if (i.affectedResourceType === 'Rack' && i.status !== 'Resolved' && i.status !== 'Closed') for (const id of i.affectedResourceIds) incByRack.set(id, (incByRack.get(id) ?? 0) + 1);
    const mdByRack = new Map<string, ManagedDevice[]>();
    for (const m of managed) if (m.rackId) { const a = mdByRack.get(m.rackId) ?? []; a.push(m); mdByRack.set(m.rackId, a); }
    const activeAlarmsByDevice = new Map<string, number>();
    for (const a of alarms) if (a.state !== 'Cleared') activeAlarmsByDevice.set(a.deviceId, (activeAlarmsByDevice.get(a.deviceId) ?? 0) + 1);
    const reservedRacks = new Set(rsvAll.filter((r) => r.status === 'Active').map((r) => r.rackId));
    const failedZones = new Set(cracs.filter((c) => c.status === 'Failed').map((c) => c.coolingZoneId));
    // PUE first: the cost layer prices every rack at the site's PUE.
    const itKw = Math.round(racks.reduce((s, r) => s + r.currentPowerKw, 0));
    const coolKw = zones.reduce((s, z) => s + z.currentLoadKw, 0);
    const pue = pueFor(dc?.dcTypeKey, itKw, coolKw) || pueTargetFor(dc?.dcTypeKey);

    const rackVms: RackVm[] = racks.map((rack) => {
      const zone = rack.coolingZoneId ? zoneById.get(rack.coolingZoneId) : undefined;
      const row = rowById.get(rack.rowId);
      const containment = row?.containment ?? 'None';
      const powerPct = rack.powerUtilizationPct;
      const inletC = (zone?.setpointC ?? 24) + (powerPct / 100) * 8 + (failedZones.has(rack.coolingZoneId ?? '') ? 5 : 0) + (containment === 'None' ? 1.5 : 0) - (rack.liquidCoolingReady ? 2 : 0);
      const mds = mdByRack.get(rack.id) ?? [];
      return {
        rack, deviceCount: (devByRack.get(rack.id) ?? []).length, usedPct: rack.heightU ? Math.round((rack.usedU / rack.heightU) * 100) : 0, powerPct,
        inletC: Math.round(inletC * 10) / 10, incidents: incByRack.get(rack.id) ?? 0, alarms: mds.reduce((s, m) => s + (activeAlarmsByDevice.get(m.id) ?? 0), 0),
        networkDevices: mds.length, reserved: reservedRacks.has(rack.id) || rack.status === 'Reserved', planned: rack.status === 'Planned',
        blockPct: thr.rackPowerBlockPct, warnPct: thr.rackPowerWarnPct, containment, costUsd: monthlyEnergyCostUsd(rack.currentPowerKw, pue),
      };
    });
    const rackById = new Map(rackVms.map((r) => [r.rack.id, r]));
    const floorById = new Map(floorsAll.map((fl) => [fl.id, fl]));
    const buildingById = new Map(buildings.map((b) => [b.id, b]));
    const agg = (hr: RackVm[]) => ({
      itKw: Math.round(hr.reduce((s, r) => s + r.rack.currentPowerKw, 0) * 10) / 10, maxKw: Math.round(hr.reduce((s, r) => s + r.rack.maxPowerKw, 0)),
      powerPct: hr.length ? Math.round(hr.reduce((s, r) => s + r.powerPct, 0) / hr.length) : 0, maxInletC: hr.length ? Math.max(...hr.map((r) => r.inletC)) : 0,
      incidents: hr.reduce((s, r) => s + r.incidents, 0), alarms: hr.reduce((s, r) => s + r.alarms, 0), managed: hr.reduce((s, r) => s + r.networkDevices, 0),
      costUsd: hr.reduce((s, r) => s + r.costUsd, 0),
    });
    const hallVms: HallVm[] = halls.map((hall) => {
      const hr = rackVms.filter((r) => r.rack.hallId === hall.id);
      const floor = floorById.get(hall.floorId);
      return { hall, floor, building: floor ? buildingById.get(floor.buildingId) : undefined, rows: rowsAll.filter((r) => r.hallId === hall.id).sort((a, b) => +a.gridPosition - +b.gridPosition), racks: hr, ...agg(hr), occupancyPct: hall.rackCapacity ? Math.round((hr.length / hall.rackCapacity) * 100) : 0, zone: hall.coolingZoneId ? zoneById.get(hall.coolingZoneId) : undefined, cracs: cracs.filter((c) => c.coolingZoneId === hall.coolingZoneId), pdus: pdus.filter((p) => p.hallId === hall.id) };
    });
    const buildingVms: BuildingVm[] = buildings.map((b) => {
      const fls = floorsAll.filter((fl) => fl.buildingId === b.id).sort((x, y) => x.level - y.level);
      const floorVms: FloorVm[] = fls.map((fl) => ({ floor: fl, halls: hallVms.filter((h) => h.hall.floorId === fl.id) }));
      const bh = floorVms.flatMap((fv) => fv.halls); const br = bh.flatMap((h) => h.racks);
      const cap = bh.reduce((s, h) => s + h.hall.rackCapacity, 0);
      return { building: b, floors: floorVms, halls: bh, racks: br, ...agg(br), occupancyPct: cap ? Math.round((br.length / cap) * 100) : 0 };
    });

    // Power chain graph: utility → transformer → UPS → PDU → hall
    const nodes: PowerNode[] = []; const plinks: PowerLink[] = [];
    const sideOf = (role: string): 'A' | 'B' => (role === 'B-side' ? 'B' : 'A');
    for (const fd of feeds) nodes.push({ id: fd.id, name: fd.name, kind: 'utility', capacityKw: fd.capacityKw, loadKw: 0, status: 'Operational', side: sideOf(fd.redundancyRole) });
    for (const tx of transformers) { nodes.push({ id: tx.id, name: tx.name, kind: 'transformer', capacityKw: Math.round(tx.capacityKva * 0.9), loadKw: tx.loadKw, status: tx.status, side: sideOf(feeds.find((x) => x.id === tx.feedId)?.redundancyRole ?? 'A-side') }); plinks.push({ source: tx.feedId, target: tx.id, kw: tx.loadKw, status: tx.status }); }
    for (const u of ups) {
      const tx = transformers.find((t) => t.feedId === u.feedId);
      nodes.push({ id: u.id, name: u.name, kind: 'ups', capacityKw: u.capacityKw, loadKw: u.loadKw, status: u.status, side: sideOf(feeds.find((x) => x.id === u.feedId)?.redundancyRole ?? 'A-side') });
      plinks.push({ source: tx?.id ?? u.feedId ?? feeds[0]?.id ?? u.id, target: u.id, kw: u.loadKw, status: u.status });
    }
    for (const p of pdus) {
      nodes.push({ id: p.id, name: p.name, kind: 'pdu', capacityKw: p.capacityKw, loadKw: p.loadKw, status: p.loadPct >= 90 ? 'Degraded' : 'Operational', side: sideOf(feeds.find((x) => x.id === ups.find((u) => u.id === p.upsId)?.feedId)?.redundancyRole ?? 'A-side') });
      if (p.upsId) plinks.push({ source: p.upsId, target: p.id, kw: p.loadKw, status: 'Operational' });
      if (p.hallId) plinks.push({ source: p.id, target: `hall:${p.hallId}`, kw: p.loadKw, status: rackFeeds.some((pf) => pf.status === 'Failed' && racks.find((r) => r.id === pf.rackId)?.hallId === p.hallId) ? 'Failed' : 'Operational' });
    }
    for (const h of hallVms) nodes.push({ id: `hall:${h.hall.id}`, name: h.hall.name, kind: 'hall', capacityKw: h.hall.designPowerKw, loadKw: h.itKw, status: 'Operational' });
    for (const fd of feeds) fd && (nodes.find((n) => n.id === fd.id)!.loadKw = plinks.filter((l) => l.source === fd.id).reduce((s, l) => s + l.kw, 0));

    // KPIs
    const openInc = incidents.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed');
    const sev1 = openInc.filter((i) => i.severity === 'SEV1').length; const sev2 = openInc.filter((i) => i.severity === 'SEV2').length;
    const activeAlarms = alarms.filter((a) => a.state === 'Active').length;
    const monthlyKwh = itKw * pue * 24 * 30;
    const opexUsd = Math.round(monthlyKwh * 0.12 + circuits.filter((c) => c.status === 'Active').reduce((s, c) => s + (c.monthlyCostUsd ?? 0), 0));
    const designKw = dc?.designPowerKw ?? 0;
    const unreachable = managed.filter((m) => m.reachability === 'Unreachable').length;
    // Domain scores: each penalty is capped so one noisy signal cannot zero the domain on its own.
    const run = Math.max(0, 100 - Math.min(40, sev1 * 20) - Math.min(24, sev2 * 8) - Math.min(25, activeAlarms * 0.5));
    const capacityScore = designKw ? Math.max(0, Math.min(100, Math.round(100 - Math.max(0, (itKw / designKw) * 100 - 70) * 3))) : 100;
    const connectivity = Math.max(0, 100 - Math.min(45, circuits.filter((c) => c.status === 'Offline').length * 15) - Math.min(30, unreachable * 5));
    const build = Math.max(0, 100 - projects.filter((p) => p.status === 'At Risk' || p.status === 'Blocked').length * 15);
    const governance = Math.max(0, 100 - rackVms.filter((r) => r.powerPct > r.blockPct).length * 6);
    const healthScore = Math.round(run * 0.3 + build * 0.2 + capacityScore * 0.2 + connectivity * 0.15 + governance * 0.15);
    const kpis: SiteKpis = {
      itKw, designKw, headroomKw: Math.max(0, designKw - itKw), pue, pueTarget: pueTargetFor(dc?.dcTypeKey), racks: racks.length,
      rackUtilPct: racks.length ? Math.round(rackVms.reduce((s, r) => s + r.powerPct, 0) / racks.length) : 0,
      openIncidents: openInc.length, activeAlarms, availabilityPct: Math.round((100 - sev1 * 0.05 - sev2 * 0.01) * 100) / 100,
      opexUsd, carbonT: Math.round((monthlyKwh * 0.4) / 1000 * 10) / 10, circuits: circuits.length, circuitsOffline: circuits.filter((c) => c.status === 'Offline').length,
      devices: devices.length, healthScore, health: { run: Math.round(run), build: Math.round(build), capacity: capacityScore, connectivity: Math.round(connectivity), governance: Math.round(governance) },
    };
    return { dc, typeName: prof?.name ?? '—', campusName: campuses.find((c) => c.id === dc?.campusId)?.name ?? '', buildings: buildingVms, halls: hallVms, racks: rackVms, rackById, devicesByRack: devByRack, zones, cracs, pdus, ups, feeds, transformers, rackFeeds, incidents, alarms, managed, links, interfaces, circuits, providers, projects, power: { nodes, links: plinks }, kpis, loading: dcQ.isLoading };
  }, [dcId, dcQ.data, dcQ.isLoading, campuses, buildings, floorsAll, halls, racks, devices, zones, cracsAll, pdusAll, ups, feeds, txAll, rowsAll, rackFeedsAll, incidents, managed, alarmsAll, linksAll, ifacesAll, termsAll, circuitsAll, providers, projects, rsvAll]);
}

/** Cost band of a figure against the largest figure among its peers: low < 45 %, medium < 80 %, high above. */
export function costBand(costUsd: number, peerMaxUsd: number): 'low' | 'medium' | 'high' {
  const ratio = peerMaxUsd > 0 ? costUsd / peerMaxUsd : 0;
  return ratio >= 0.8 ? 'high' : ratio >= 0.45 ? 'medium' : 'low';
}
const costColor = (costUsd: number, peerMaxUsd: number, p: VwPalette) => { const b = costBand(costUsd, peerMaxUsd); return b === 'high' ? p.violet : b === 'medium' ? p.blue : p.cyan; };

/**
 * Colour for an aggregate (building or hall) under a layer, on the same thresholds as racks.
 * `costPeerMax` is the largest monthly cost among the aggregate's siblings (cost layer only).
 */
export function aggregateColor(a: { powerPct: number; occupancyPct: number; maxInletC: number; incidents: number; alarms: number; managed: number; racks: RackVm[]; costUsd?: number }, layer: SiteLayer, p: VwPalette, thr: { warnPct: number; blockPct: number }, costPeerMax = 0): string {
  switch (layer) {
    case 'cost': return costColor(a.costUsd ?? 0, costPeerMax, p);
    case 'space': return a.occupancyPct >= 85 ? p.violet : a.occupancyPct >= 50 ? p.blue : p.blueLight;
    case 'power': return a.powerPct > thr.blockPct ? p.red : a.powerPct >= thr.warnPct ? p.amber : a.powerPct >= 50 ? p.emerald : p.cyan;
    case 'cooling': return a.maxInletC >= 32 ? p.red : a.maxInletC >= 28 ? p.amber : a.maxInletC >= 25 ? p.emerald : p.cyan;
    case 'network': return a.managed > 0 ? p.blue : p.slateLight;
    case 'delivery': return a.racks.some((r) => r.planned) ? p.slateLight : a.racks.some((r) => r.reserved) ? p.amber : p.blueLight;
    case 'operations': return a.incidents > 0 ? p.red : a.alarms > 0 ? p.amber : p.emerald;
  }
}

/** Colour for a device in the rack view: by category, overridden by a fault or retirement. */
export function deviceColor(d: Device, p: VwPalette): string {
  if (d.status === 'Faulty') return p.red;
  if (d.lifecycleState === 'Retired' || d.lifecycleState === 'Disposed' || d.status === 'Inactive') return p.slateLight;
  switch (d.category) {
    case 'GPU-Node': return p.violet; case 'Storage': return p.cyan; case 'Switch': return p.emerald; case 'Router': return p.amber; case 'Firewall': return p.rose; case 'PDU': case 'UPS': return p.slate; case 'Server': return p.blue; default: return p.slateDark;
  }
}

/**
 * Colour for a rack under a layer: a design-system token value, never an invented hue.
 * `costPeerMax` is the largest monthly cost among the racks of the same hall (cost layer only).
 */
export function rackColor(vm: RackVm, layer: SiteLayer, p: VwPalette, costPeerMax = 0): string {
  if (vm.planned) return p.slateLight;
  switch (layer) {
    case 'cost': return costColor(vm.costUsd, costPeerMax, p);
    case 'space': return vm.usedPct >= 85 ? p.violet : vm.usedPct >= 50 ? p.blue : p.blueLight;
    case 'power': return vm.powerPct > vm.blockPct ? p.red : vm.powerPct >= vm.warnPct ? p.amber : vm.powerPct >= 50 ? p.emerald : p.cyan;
    case 'cooling': return vm.inletC >= 32 ? p.red : vm.inletC >= 28 ? p.amber : vm.inletC >= 25 ? p.emerald : p.cyan;
    case 'network': return vm.rack.purpose === 'Network' ? p.violet : vm.networkDevices > 0 ? p.blue : p.slateLight;
    case 'delivery': return vm.reserved ? p.amber : vm.rack.status === 'Retired' ? p.slate : p.blueLight;
    case 'operations': return vm.incidents > 0 ? p.red : vm.alarms > 0 ? p.amber : vm.rack.status === 'Full' ? p.slate : p.emerald;
  }
}

export function layerLegend(layer: SiteLayer): Array<{ label: string; tone: 'info' | 'cyan' | 'success' | 'warning' | 'error' | 'purple' | 'neutral' }> {
  switch (layer) {
    case 'space': return [{ label: '< 50% U', tone: 'info' }, { label: '50–85% U', tone: 'info' }, { label: '≥ 85% U', tone: 'purple' }, { label: 'Planned', tone: 'neutral' }];
    case 'power': return [{ label: '< 50% of budget', tone: 'cyan' }, { label: 'In band', tone: 'success' }, { label: 'Warn band', tone: 'warning' }, { label: 'Over block limit', tone: 'error' }];
    case 'cooling': return [{ label: '< 25 °C inlet', tone: 'cyan' }, { label: '25–28 °C', tone: 'success' }, { label: '28–32 °C', tone: 'warning' }, { label: '≥ 32 °C', tone: 'error' }];
    case 'network': return [{ label: 'Network rack', tone: 'purple' }, { label: 'Managed device', tone: 'info' }, { label: 'No managed kit', tone: 'neutral' }];
    case 'delivery': return [{ label: 'Reserved / held', tone: 'warning' }, { label: 'Planned position', tone: 'neutral' }, { label: 'Retired', tone: 'neutral' }, { label: 'In service', tone: 'info' }];
    case 'operations': return [{ label: 'Open incident', tone: 'error' }, { label: 'Active alarm', tone: 'warning' }, { label: 'Full', tone: 'neutral' }, { label: 'Healthy', tone: 'success' }];
    case 'cost': return [{ label: 'Low cost', tone: 'cyan' }, { label: 'Medium (≥ 45% of peer max)', tone: 'info' }, { label: 'High (≥ 80% of peer max)', tone: 'purple' }, { label: `$${ENERGY_TARIFF_USD_PER_KWH}/kWh × PUE × ${HOURS_PER_MONTH} h`, tone: 'neutral' }];
  }
}
