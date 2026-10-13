/* View model handed to every change page tab. */
import type * as T from '../../../../mock/data/types';
import type { ChangeChain, DeliveryData } from '../../../delivery/lib/chain';
import type { PlannerData } from '../../../planner/lib/plannerData';
import type { ChangeRow } from '../../lib/model';
import type { ChangeMaterials } from '../../lib/materials';

export interface ChangeView {
  d: DeliveryData; pd: PlannerData; ch: ChangeChain; row: ChangeRow; c: T.ChangeRequest;
  /** Racks and devices the change touches (change record and work order together). */
  rackIds: string[]; deviceIds: string[];
  goTab: (tab: string) => void;
  /** The work order's material lines, the kit readiness (advisory) and planned against used. */
  materials: ChangeMaterials;
}

export function scopeOf(c: T.ChangeRequest, wo: T.WorkOrder | undefined, pd: PlannerData): { rackIds: string[]; deviceIds: string[] } {
  const racks = new Set(pd.racks.map(r => r.id));
  const ids = [...new Set([...(c.affectedResourceIds ?? []), ...(wo?.rackIds ?? []), ...(wo?.rackId ? [wo.rackId] : []), ...(wo?.deviceIds ?? [])])];
  const rackIds = ids.filter(id => racks.has(id) || (c.affectedResourceType === 'Rack' && (c.affectedResourceIds ?? []).includes(id)) || (wo?.rackIds ?? []).includes(id) || wo?.rackId === id);
  const rs = new Set(rackIds);
  return { rackIds, deviceIds: ids.filter(id => !rs.has(id)) };
}
