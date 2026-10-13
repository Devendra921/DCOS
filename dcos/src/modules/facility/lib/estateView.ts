/**
 * Estate view helpers — small pure functions the facility, power and capacity screens share
 * when they show the estate model additions (room types, plant, cooling, monitoring).
 * Business rules that the importer and the seed also need live in estateRules.ts; these are
 * presentation-side only (labels, grouping, readiness wording).
 */
import type { BusinessModel, Generator, Hall, Rack } from '../../../mock/data/types';
import { BUSINESS_MODEL_LABEL, ROOM_GROUP, roomTypeOf } from './estateRules';

// Room types, white space and N+1 usable capacity come from the shared estate rules.
export { ROOM_TYPES, roomTypeOf, isWhiteSpace, holdsRacks, formatAddress, usableNPlus1 } from './estateRules';

/** Plant rooms hold equipment, not racks (meet-me, network and NOC rooms may hold either). */
export const isPlantRoom = (h: Pick<Hall, 'roomType'>) => ROOM_GROUP[roomTypeOf(h)] === 'Power and plant';

export const businessModelLabel = (m?: BusinessModel | string) => (m ? BUSINESS_MODEL_LABEL[m as BusinessModel] ?? m : undefined);

/** Current local time at a site, e.g. "14:05 (UTC−5)"; undefined when the zone is unknown. */
export function localTimeAt(timezone?: string, at: Date = new Date()): string | undefined {
  if (!timezone) return undefined;
  try {
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
    const offset = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, timeZoneName: 'shortOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value;
    return offset ? `${time} (${offset === 'GMT' ? 'UTC' : offset.replace('GMT', 'UTC').replace('-', '−')})` : time;
  } catch {
    return undefined;
  }
}

export const DAY_MS = 864e5;
/** Whole days since an ISO date; undefined when no date. */
export const daysSince = (iso?: string, now = Date.now()) => (iso ? Math.floor((now - new Date(iso).getTime()) / DAY_MS) : undefined);

/** Generators are tested monthly: a test older than this many days is overdue. */
export const GENERATOR_TEST_INTERVAL_DAYS = 30;

export type Readiness = 'Ready' | 'Test overdue' | 'Failed last test' | 'Never tested' | 'Out of service';
/** Generator readiness from its status and last test. */
export function generatorReadiness(g: Pick<Generator, 'status' | 'lastTestDate' | 'lastTestResult'>, now = Date.now()): Readiness {
  if (g.status === 'Failed' || g.status === 'Maintenance' || g.status === 'Retired') return 'Out of service';
  if (g.lastTestResult === 'Fail') return 'Failed last test';
  const d = daysSince(g.lastTestDate, now);
  if (d === undefined) return 'Never tested';
  return d > GENERATOR_TEST_INTERVAL_DAYS ? 'Test overdue' : 'Ready';
}
export const READINESS_TONE: Record<Readiness, 'success' | 'warning' | 'error' | 'neutral'> = {
  Ready: 'success', 'Test overdue': 'warning', 'Failed last test': 'error', 'Never tested': 'warning', 'Out of service': 'error',
};

/** Rack density: the stored value, else AI when the rack is a GPU rack. */
export const rackDensity = (r: Pick<Rack, 'density' | 'purpose'>): 'standard' | 'ai' => r.density ?? (r.purpose === 'GPU' ? 'ai' : 'standard');
export const DENSITY_LABEL = { standard: 'Standard', ai: 'AI / high density' } as const;

/** Count items by a key, sorted by count (largest first). */
export function countBy<T>(items: T[], key: (t: T) => string | undefined): Array<{ key: string; n: number }> {
  const m = new Map<string, number>();
  for (const it of items) { const k = key(it); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([k, n]) => ({ key: k, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/** "3 temperature + humidity, 1 leak" style summary. */
export const countSummary = (counts: Array<{ key: string; n: number }>, lower = true) =>
  counts.map((c) => `${c.n} ${lower ? c.key.toLowerCase() : c.key}`).join(', ');

export const fmtKw = (v?: number) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} MW` : `${Math.round(v * 10) / 10} kW`);
export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const pctOf = (used: number, max: number) => (max > 0 ? Math.round((used / max) * 100) : 0);
