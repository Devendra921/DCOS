/**
 * Geo command map — per-site layer aggregation.
 *
 * Rolls every operational signal up to the data-center site so the map can paint
 * it as a layer: thematic choropleth (health / power / cooling / PUE / performance)
 * plus event counts (alarms / incidents / changes / maintenance) and connectivity.
 * One pass over the snapshot; pure functions.
 */
import type {
  DataCenter, Rack, CoolingZone, ManagedDevice, Interface, Alarm, Incident,
  ChangeRequest, MaintenanceWindow, Circuit, CircuitTermination, Campus, Region,
} from '../../../mock/data/types';
import { dcTypeProfile, pueFor } from '../../../mock/data/dcTypes';

const SEV_RANK: Record<string, number> = { Info: 0, Warning: 1, Minor: 2, Major: 3, Critical: 4 };
const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);

export interface SiteLayers {
  id: string; name: string; code: string; tier: string; status: string; lat: number; lng: number;
  dcTypeKey?: string; dcTypeName?: string; segment?: string;
  regionId: string; regionName: string; campusName: string;
  racks: number; powerPct: number; coolingPct: number; pue: number; perfPct: number; health: number;
  activeAlarms: number; alarmMaxSev: string | null; openIncidents: number; inflightChanges: number; maintenance: number;
  circuits: number; circuitsOffline: number;
}

export interface GeoCtx {
  dcs: DataCenter[]; racks: Rack[]; zones: CoolingZone[]; managed: ManagedDevice[]; interfaces: Interface[];
  alarms: Alarm[]; incidents: Incident[]; changes: ChangeRequest[]; maint: MaintenanceWindow[];
  circuits: Circuit[]; terms: CircuitTermination[]; campuses: Campus[]; regions: Region[];
}

export function buildSiteLayers(c: GeoCtx): SiteLayers[] {
  const activeByDev = new Map<string, Alarm[]>();
  for (const a of c.alarms) if (a.state === 'Active') { const arr = activeByDev.get(a.deviceId) ?? []; arr.push(a); activeByDev.set(a.deviceId, arr); }
  const regionName = Object.fromEntries(c.regions.map((r) => [r.id, r.name]));
  const campusById = Object.fromEntries(c.campuses.map((cp) => [cp.id, cp]));
  const aTermDc = new Map<string, string>();
  for (const t of c.terms) if (t.side === 'A' && t.dataCenterId) aTermDc.set(t.circuitId, t.dataCenterId);

  return c.dcs.map((d) => {
    const rk = c.racks.filter((r) => r.dataCenterId === d.id);
    const zn = c.zones.filter((z) => z.dataCenterId === d.id);
    const devs = c.managed.filter((x) => x.dataCenterId === d.id);
    const devIds = new Set(devs.map((x) => x.id));
    const ifs = c.interfaces.filter((i) => devIds.has(i.deviceId) && i.operStatus === 'Up');
    const campus = campusById[d.campusId];
    const regionId = campus?.regionId ?? '';

    const itKw = rk.reduce((s, r) => s + r.currentPowerKw, 0);
    const coolKw = zn.reduce((s, z) => s + z.currentLoadKw, 0);
    // Type-aware PUE (see pueFor): liquid-cooled GPU halls ~1.2, DX-cooled closets ~1.6.
    const pue = pueFor(d.dcTypeKey, itKw, coolKw);

    const devHealth = devs.map((dv) => {
      let s = 100;
      if (dv.reachability === 'Unreachable') s -= 45; else if (dv.reachability === 'Degraded') s -= 20;
      const al = activeByDev.get(dv.id) ?? [];
      s -= Math.min(30, al.reduce((x, a) => x + (a.severity === 'Critical' ? 8 : a.severity === 'Major' ? 4 : 1), 0));
      return Math.max(0, s);
    });

    const dcAlarms = devs.flatMap((dv) => activeByDev.get(dv.id) ?? []);
    const alarmMaxSev = dcAlarms.length ? [...dcAlarms].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])[0].severity : null;
    const dcCircuits = c.circuits.filter((ck) => aTermDc.get(ck.id) === d.id);

    return {
      id: d.id, name: d.name, code: d.code, tier: d.tier, status: d.status, lat: d.latitude, lng: d.longitude,
      dcTypeKey: d.dcTypeKey, dcTypeName: dcTypeProfile(d.dcTypeKey)?.name, segment: dcTypeProfile(d.dcTypeKey)?.segment,
      regionId, regionName: regionName[regionId] ?? '—', campusName: campus?.name ?? '—',
      racks: rk.length,
      powerPct: avg(rk.map((r) => r.powerUtilizationPct)),
      coolingPct: avg(zn.map((z) => (z.coolingCapacityKw ? (z.currentLoadKw / z.coolingCapacityKw) * 100 : 0))),
      pue, perfPct: avg(ifs.map((i) => i.utilizationPct)), health: devHealth.length ? avg(devHealth) : 100,
      activeAlarms: dcAlarms.length, alarmMaxSev,
      openIncidents: c.incidents.filter((i) => i.dataCenterId === d.id && !['Resolved', 'Closed'].includes(i.status)).length,
      inflightChanges: c.changes.filter((ch) => ch.dataCenterId === d.id && ['Scheduled', 'InProgress'].includes(ch.status)).length,
      maintenance: c.maint.filter((w) => w.dataCenterId === d.id && ['Scheduled', 'In Progress'].includes(w.status)).length,
      circuits: dcCircuits.length, circuitsOffline: dcCircuits.filter((ck) => ck.status === 'Offline').length,
    };
  });
}

export interface GeoEdge { id: string; a: SiteLayers; z: SiteLayers; interconnects: number; degraded: boolean; }

/** Backbone connectivity: chain the sites within each region; flag degraded if either
 *  endpoint has an offline circuit. Represents the inter-site DC-interconnect fabric. */
export function buildBackbone(sites: SiteLayers[], circuits: Circuit[]): GeoEdge[] {
  const interconnectByDc = new Map<string, number>();
  // crude: count DC-Interconnect circuits and attribute to their A-side site (sites already carry circuit counts)
  for (const ck of circuits) if (ck.purpose === 'DC Interconnect') { /* counted via site.circuits already */ void interconnectByDc; }
  const edges: GeoEdge[] = [];
  const byRegion = new Map<string, SiteLayers[]>();
  for (const s of sites) { const arr = byRegion.get(s.regionId) ?? []; arr.push(s); byRegion.set(s.regionId, arr); }
  for (const [, group] of byRegion) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.lng - b.lng);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], z = sorted[i + 1];
      edges.push({ id: `${a.id}-${z.id}`, a, z, interconnects: Math.min(a.circuits, z.circuits), degraded: a.circuitsOffline > 0 || z.circuitsOffline > 0 });
    }
  }
  return edges;
}
