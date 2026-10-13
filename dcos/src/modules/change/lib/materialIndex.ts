/**
 * Materials at change level, pure: the view a change page reads (kit readiness, availability,
 * retired equipment, usage and the warnings) and the per-change index the change list and the
 * overview use. Advisory only: nothing here blocks approval or the start of work.
 * Shared by the screens and scripts/change-overview-smoke.mts (no Vite-only imports).
 */
import type * as T from '../../../mock/data/types';
import {
  availabilityOf, isLive, readinessOf, retiredOf, usageOf,
  type AvailabilityView, type ReadinessView, type RetiredView, type UsageView,
} from '../../delivery/lib/materialRules';
import { materialWarnings } from '../../delivery/components/workorders/materialsView';

const OPEN = ['Draft', 'Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress'];

export interface ChangeMaterials {
  lines: T.MaterialLine[];
  kit: ReadinessView; availability: AvailabilityView; retired: RetiredView; usage: UsageView;
  /** Plain-English warnings (short items, kit not at the site, awaiting sanitisation, …); empty when all is well. */
  warnings: string[];
  /** Lines added or changed after the change was approved. */
  changedAfterApproval: T.MaterialLine[];
  materials: Map<string, T.Material>;
  ready: boolean;
}

/** The material view of one change from its lines. `open` work shows supply warnings; finished work only the retired ones. */
export function changeMaterialsOf(lines: T.MaterialLine[], materials: T.Material[] | Map<string, T.Material>, change: Pick<T.ChangeRequest, 'status'>, wo?: T.WorkOrder, ready = true, nowMs = Date.now()): ChangeMaterials {
  const kit = readinessOf(lines, nowMs), availability = availabilityOf(lines), retired = retiredOf(lines);
  const open = OPEN.includes(change.status);
  return {
    lines, kit, availability, retired, usage: usageOf(lines, wo),
    warnings: materialWarnings({ kit, availability, retired, lines, open }),
    changedAfterApproval: lines.filter(l => l.changedAfterApproval),
    materials: materials instanceof Map ? materials : new Map(materials.map(m => [m.id, m])),
    ready,
  };
}

/** Per change: its availability view, for the change list and the overview. */
export function availabilityIndex(lines: T.MaterialLine[]): (c: Pick<T.ChangeRequest, 'id' | 'workOrderId'>) => AvailabilityView | undefined {
  const byCh = new Map<string, T.MaterialLine[]>(), byWo = new Map<string, T.MaterialLine[]>();
  for (const l of lines) {
    if (!isLive(l)) continue;
    if (l.changeRequestId) byCh.set(l.changeRequestId, [...(byCh.get(l.changeRequestId) ?? []), l]);
    if (l.workOrderId) byWo.set(l.workOrderId, [...(byWo.get(l.workOrderId) ?? []), l]);
  }
  const cache = new Map<string, AvailabilityView | undefined>();
  return c => {
    if (cache.has(c.id)) return cache.get(c.id);
    const own = byCh.get(c.id) ?? [], viaWo = c.workOrderId ? byWo.get(c.workOrderId) ?? [] : [];
    const ls = [...new Map([...own, ...viaWo].map(l => [l.id, l])).values()].filter(l => l.direction === 'In');
    const v = ls.length ? availabilityOf(ls) : undefined;
    cache.set(c.id, v);
    return v;
  };
}

/** Materials short: the platform's answer leaves a shortfall (or a purchase is needed) on an item still to come. */
export const materialsShort = (v: AvailabilityView | undefined) => !!v && v.short.length > 0;
