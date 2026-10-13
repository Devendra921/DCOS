/**
 * Seed · edge locations (PoPs and access sites).
 *
 * Every campus has a ring of points of presence and smaller access sites hanging off its
 * data centres: aggregation PoPs with a few routers, and access sites with one or two
 * devices. They are summary records (counts, status, blocker), not full inventories, so
 * the estate view, the locations list and downstream alarms have a real estate to show.
 */
import type { Seed } from './ctx';
import * as T from '../../data/types';

const TOWNS: Record<string, string[]> = {
  Ashburn: ['Leesburg', 'Reston', 'Herndon', 'Sterling', 'Manassas', 'Chantilly', 'Fairfax', 'Winchester', 'Culpeper', 'Frederick'],
  Dallas: ['Plano', 'Irving', 'Frisco', 'Richardson', 'Garland', 'Arlington', 'Denton', 'McKinney', 'Waco', 'Tyler'],
  Frankfurt: ['Offenbach', 'Darmstadt', 'Wiesbaden', 'Mainz', 'Hanau', 'Mannheim', 'Giessen', 'Koblenz', 'Würzburg', 'Fulda'],
  Dublin: ['Swords', 'Tallaght', 'Blanchardstown', 'Dún Laoghaire', 'Bray', 'Maynooth', 'Drogheda', 'Naas', 'Navan', 'Wicklow'],
  Singapore: ['Jurong', 'Tampines', 'Woodlands', 'Changi', 'Punggol', 'Tuas', 'Bishan', 'Clementi', 'Yishun', 'Bedok'],
  Sydney: ['Parramatta', 'Chatswood', 'Penrith', 'Liverpool', 'Wollongong', 'Newcastle', 'Gosford', 'Campbelltown', 'Blacktown', 'Hornsby'],
  'São Paulo': ['Campinas', 'Guarulhos', 'Santos', 'Osasco', 'Sorocaba', 'Barueri', 'Jundiaí', 'Santo André', 'São José dos Campos', 'Ribeirão Preto'],
};
const BLOCKERS: [T.EdgeLocation['blocker'] & string, string][] = [
  ['power', 'Battery backup below threshold'], ['fiber', 'Fiber cut on feeder route'], ['commissioning', 'Site acceptance testing incomplete'],
  ['supply', 'Equipment delivery delayed'], ['lease', 'Landlord access restriction'], ['civil', 'Civil work pending for shelter base'], ['regulatory', 'Municipal approval pending'],
];
/* status split per 100 locations, as the reference estate had: on-air 78 · in progress 13 · planned 7 · failed 2 */
const STATUS_BAG: T.EdgeLocation['status'][] = [...Array(78).fill('on-air'), ...Array(13).fill('in-progress'), ...Array(7).fill('planned'), ...Array(2).fill('failed')];

export function seedEdgeLocations(S: Seed): void {
  const dcCountByCampus = new Map<string, number>();
  for (const dc of S.dataCenters) dcCountByCampus.set(dc.campusId, (dcCountByCampus.get(dc.campusId) ?? 0) + 1);
  let n = 0;
  S.campuses.forEach((campus, ci) => {
    const towns = TOWNS[campus.city] ?? [`${campus.city} North`, `${campus.city} South`, `${campus.city} East`, `${campus.city} West`];
    const dcs = dcCountByCampus.get(campus.id) ?? 1;
    const pops = 4 + dcs * 2 + (ci % 3);           // 6 to 12 PoPs per campus
    const sites = 18 + dcs * 10 + (ci * 7) % 23;    // 28 to 70 access sites per campus
    const mk = (kind: 'pop' | 'site', k: number) => {
      const i = n++;
      const status = S.cycle(STATUS_BAG, i * 7 + ci * 3);
      const town = S.cycle(towns, k + (kind === 'site' ? 3 : 0));
      const ne = kind === 'pop' ? S.int(3, 6) : S.int(1, 2);
      const discovered = status === 'planned' ? 0 : status === 'in-progress' ? S.int(0, ne) : status === 'failed' ? S.int(0, Math.max(0, ne - 1)) : ne;
      const roles: Record<string, number> = kind === 'pop' ? { Router: Math.max(2, ne - 2), Switch: Math.min(2, ne - 1), ...(S.chance(0.35) ? { DWDM: 1 } : {}) } : { Access: ne };
      const blocked = status === 'failed' || (status === 'in-progress' && S.chance(0.4));
      const blocker = blocked ? S.cycle(BLOCKERS, i) : undefined;
      const id = S.nid(kind === 'pop' ? 'POP' : 'SITE');
      const jitter = (kind === 'pop' ? 0.25 : 0.6) * (S.int(-100, 100) / 100);
      const jitter2 = (kind === 'pop' ? 0.25 : 0.6) * (S.int(-100, 100) / 100);
      S.edgeLocations.push({
        id, locId: id, ...S.meta(S.byRole('Network Engineer')), kind, name: kind === 'pop' ? `${town} PoP${k >= towns.length ? ` ${Math.floor(k / towns.length) + 1}` : ''}` : `${town} site ${String(k + 1).padStart(2, '0')}`,
        campusId: campus.id, regionId: campus.regionId, city: town, country: campus.country, latitude: Number((campus.latitude + jitter).toFixed(4)), longitude: Number((campus.longitude + jitter2).toFixed(4)),
        status, category: kind === 'pop' ? 'Regional' : 'Edge', neCount: ne, discovered, roles, blocker: blocker?.[0], blockerNote: blocker?.[1],
        passive: kind === 'pop'
          ? { fiberSpans: S.int(2, 5), odf: S.int(1, 2), racks: S.int(1, 3), powerPlant: 1, splices: S.int(1, 3), patchCords: S.int(6, 14), ducts: S.int(0, 2) }
          : { fiberSpans: S.chance(0.55) ? 1 : 0, odf: S.chance(0.2) ? 1 : 0, racks: S.chance(0.45) ? 1 : 0, powerPlant: S.chance(0.15) ? 1 : 0, splices: S.chance(0.2) ? 1 : 0, patchCords: S.int(0, 1), ducts: S.chance(0.1) ? 1 : 0 },
        notes: blocker ? `Blocked: ${blocker[1]}` : status === 'on-air' ? undefined : `Rollout ${status}`,
      });
    };
    for (let k = 0; k < pops; k++) mk('pop', k);
    for (let k = 0; k < sites; k++) mk('site', k);
  });
}
