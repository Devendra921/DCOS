/**
 * Scope the loaded estate by persona and geography, once, before the store is filled, so every page,
 * count and chart sees the same data.
 *
 *  1. Sites that do not match (persona = businessModel, geo = country) are removed.
 *  2. Everything a removed site owns goes with it: racks, devices, cables, alarms, work orders, projects… (STRONG
 *     links, followed until nothing more is affected). Loose references to removed records are cleared (WEAK).
 *  3. Shared reference data follows what is left: locations by country (and the network persona), campuses and
 *     regions that still hold something, customers and circuits that still have a service or a termination.
 */
import { STRONG_LINKS, WEAK_LINKS, type Link } from './scopeLinks';
import { PERSONAS, geoCodeOf, type EstateScope } from '../datasets/estateScope';

type Rec = Record<string, unknown>;
export type ScopeSnapshot = Record<string, Rec[]>;

export interface ScopeOption { id: string; label: string; count: number; /** campuses the sites sit on (countries only) */ campuses?: number }
export interface ScopeOptions { personas: ScopeOption[]; geos: ScopeOption[] }
export interface ScopeResult { snapshot: ScopeSnapshot; removed: number; sites: number }

/** The personas and countries present in the data, with the number of sites in each (taken before scoping). */
export function scopeOptions(snap: ScopeSnapshot): ScopeOptions {
  const dcs = snap.dataCenters ?? [];
  const campus = new Map((snap.campuses ?? []).map((c) => [c.id as string, c]));
  const persona = new Map<string, number>();
  const geo = new Map<string, { label: string; n: number; campuses: Set<string> }>();
  for (const d of dcs) {
    const bm = d.businessModel as string | undefined;
    if (bm) persona.set(bm, (persona.get(bm) ?? 0) + 1);
    const country = siteCountry(d, campus);
    const code = geoCodeOf(country);
    if (code) { const g = geo.get(code) ?? { label: country!, n: 0, campuses: new Set<string>() }; g.n++; if (d.campusId) g.campuses.add(d.campusId as string); geo.set(code, g); }
  }
  return {
    personas: PERSONAS.filter((p) => persona.has(p.id)).map((p) => ({ id: p.id, label: p.label, count: persona.get(p.id)! })),
    geos: [...geo.entries()].map(([id, g]) => ({ id, label: g.label, count: g.n, campuses: g.campuses.size })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

const siteCountry = (d: Rec, campusById: Map<string, Rec>): string | undefined =>
  (d.country as string | undefined) ?? (campusById.get(d.campusId as string)?.country as string | undefined);

const asArray = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []);

export function applyEstateScope(snap: ScopeSnapshot, scope: EstateScope): ScopeResult {
  const personaOn = scope.persona !== 'all';
  const geoOn = scope.geo !== 'all';
  const total = (s: ScopeSnapshot) => Object.values(s).reduce((a, r) => a + r.length, 0);
  if (!personaOn && !geoOn) return { snapshot: snap, removed: 0, sites: snap.dataCenters?.length ?? 0 };

  const campusById = new Map((snap.campuses ?? []).map((c) => [c.id as string, c]));
  const dropped = new Map<string, Set<string>>();
  const dropSet = (e: string) => { let s = dropped.get(e); if (!s) dropped.set(e, (s = new Set())); return s; };

  // 1. sites
  const keepSite = (d: Rec) => (!personaOn || d.businessModel === scope.persona) && (!geoOn || geoCodeOf(siteCountry(d, campusById)) === scope.geo);
  for (const d of snap.dataCenters ?? []) if (!keepSite(d)) dropSet('dataCenters').add(d.id as string);

  // 2a. everything a removed record owns, followed until nothing more changes
  const byTarget = new Map<string, Link[]>();
  for (const l of STRONG_LINKS) byTarget.set(l[2], [...(byTarget.get(l[2]) ?? []), l]);
  const queue = ['dataCenters'];
  const queued = new Set(queue);
  while (queue.length) {
    const target = queue.shift()!;
    queued.delete(target);
    const gone = dropped.get(target);
    if (!gone?.size) continue;
    for (const [from, field] of byTarget.get(target) ?? []) {
      const rows = snap[from];
      if (!rows?.length) continue;
      const mine = dropSet(from);
      let grew = false;
      for (const r of rows) {
        const id = r.id as string;
        if (mine.has(id)) continue;
        if (asArray(r[field]).some((v) => gone.has(v))) { mine.add(id); grew = true; }
      }
      if (grew && !queued.has(from)) { queue.push(from); queued.add(from); }
    }
  }

  // 3. reference data that follows what is left
  const alive = <T extends Rec>(e: string, rows: T[]) => rows.filter((r) => !dropped.get(e)?.has(r.id as string));
  const keptDcs = alive('dataCenters', snap.dataCenters ?? []);
  const keepEdge = (r: Rec) => (!personaOn || scope.persona === 'network') && (!geoOn || geoCodeOf(r.country as string) === scope.geo);
  for (const r of snap.edgeLocations ?? []) if (!keepEdge(r)) dropSet('edgeLocations').add(r.id as string);
  const keptEdges = alive('edgeLocations', snap.edgeLocations ?? []);

  const usedCampus = new Set<string>([...keptDcs.map((d) => d.campusId as string), ...keptEdges.map((e) => e.campusId as string)]);
  for (const c of snap.campuses ?? []) {
    const matchesGeo = !geoOn || geoCodeOf(c.country as string) === scope.geo;
    if (!(usedCampus.has(c.id as string) || (!personaOn && matchesGeo))) dropSet('campuses').add(c.id as string);
  }
  const keptCampuses = alive('campuses', snap.campuses ?? []);
  const usedRegion = new Set<string>([...keptCampuses.map((c) => c.regionId as string), ...keptEdges.map((e) => e.regionId as string)]);
  for (const r of snap.regions ?? []) if (!usedRegion.has(r.id as string)) dropSet('regions').add(r.id as string);

  // a customer that had services (or tenant racks / devices) and has none left; a circuit whose terminations are all gone
  const orphaned = (entity: string, rows: Rec[], refs: Array<[string, string]>) => {
    const had = new Set<string>(); const has = new Set<string>();
    for (const [from, field] of refs) for (const r of snap[from] ?? []) {
      const id = r[field] as string | undefined;
      if (!id) continue;
      had.add(id);
      if (!dropped.get(from)?.has(r.id as string)) has.add(id);
    }
    for (const r of rows) { const id = r.id as string; if (had.has(id) && !has.has(id)) dropSet(entity).add(id); }
  };
  orphaned('customers', snap.customers ?? [], [['services', 'customerRef'], ['racks', 'tenantCustomerId'], ['devices', 'tenantCustomerId']]);
  orphaned('circuits', snap.circuits ?? [], [['circuitTerminations', 'circuitId']]);

  // 2b. loose references to removed records are cleared on the records that stay
  const alsoGone = (e: string) => dropped.get(e);
  for (const [from, field, to, many] of WEAK_LINKS) {
    const gone = alsoGone(to);
    if (!gone?.size) continue;
    for (const r of snap[from] ?? []) {
      if (dropped.get(from)?.has(r.id as string)) continue;
      const v = r[field];
      if (many) { if (Array.isArray(v) && v.some((x) => gone.has(x as string))) r[field] = v.filter((x) => !gone.has(x as string)); }
      else if (typeof v === 'string' && gone.has(v)) delete r[field];
    }
  }

  // build the scoped snapshot; refresh the counts the removed records fed
  const out: ScopeSnapshot = {};
  for (const [e, rows] of Object.entries(snap)) out[e] = dropped.get(e)?.size ? alive(e, rows) : rows;
  const dcPerCampus = new Map<string, number>();
  for (const d of out.dataCenters ?? []) dcPerCampus.set(d.campusId as string, (dcPerCampus.get(d.campusId as string) ?? 0) + 1);
  for (const c of out.campuses ?? []) c.dataCenterCount = dcPerCampus.get(c.id as string) ?? 0;
  const campusPerRegion = new Map<string, number>();
  for (const c of out.campuses ?? []) campusPerRegion.set(c.regionId as string, (campusPerRegion.get(c.regionId as string) ?? 0) + 1);
  for (const r of out.regions ?? []) r.campusCount = campusPerRegion.get(r.id as string) ?? 0;

  return { snapshot: out, removed: total(snap) - total(out), sites: out.dataCenters?.length ?? 0 };
}
