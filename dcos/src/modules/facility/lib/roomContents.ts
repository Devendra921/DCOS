/* What stands in a room: UPS, DC plant, cooling units, CDUs, sensors, racks and GPU clusters. */
import type { Hall } from '../../../mock/data/types';
import type { SiteEstate } from './useSiteEstate';
import { cduForCrac } from './estateRules';

export function roomContents(est: SiteEstate, hall: Hall) {
  const ups = est.ups.filter((u) => u.hallId === hall.id);
  const plant = est.dcPlants.filter((p) => p.hallId === hall.id);
  const cdus = est.cdus.filter((c) => c.cdu.hallId === hall.id);
  // CDU-type cooling units are the same plant as the Cdu records; list them once, as CDUs.
  const cduRecords = est.cdus.map((c) => c.cdu);
  const cracs = hall.coolingZoneId ? est.cracs.filter((c) => c.coolingZoneId === hall.coolingZoneId && !cduForCrac(cduRecords, c)) : [];
  const sensors = est.sensors.filter((s) => s.hallId === hall.id);
  const racks = est.racks.filter((r) => r.hallId === hall.id);
  const clusters = est.clusters.filter((c) => c.hallId === hall.id);
  return { ups, plant, cdus, cracs, sensors, racks, clusters };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 UPS, 1 battery bank, 4 cooling units, 6 sensors" — what the room holds. */
export function roomContentsSummary(est: SiteEstate, hall: Hall): string {
  const c = roomContents(est, hall);
  const rect = c.plant.filter((p) => p.kind === 'Rectifier').length;
  const batt = c.plant.filter((p) => p.kind === 'Battery bank').length;
  const parts = [
    c.racks.length && plural(c.racks.length, 'rack'),
    c.ups.length && `${c.ups.length} UPS`,
    rect && plural(rect, 'rectifier'),
    batt && plural(batt, 'battery bank'),
    c.cracs.length && plural(c.cracs.length, 'cooling unit'),
    c.cdus.length && plural(c.cdus.length, 'CDU'),
    c.sensors.length && plural(c.sensors.length, 'sensor'),
    c.clusters.length && plural(c.clusters.length, 'GPU cluster'),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Nothing recorded';
}
