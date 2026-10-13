/* The materials of a change: its work order's lines (one change per work order), how ready the kit
   is, whether the platform can supply what is still needed, the equipment it retires, and planned
   against used for the review. Availability and readiness are advisory: they never block approval
   or the start of work. */
import { useMemo } from 'react';
import type * as T from '../../../mock/data/types';
import { useMaterialData } from '../../delivery/lib/materialHooks';
import { linesOfChange } from '../../delivery/lib/materialRules';
import { changeMaterialsOf, type ChangeMaterials } from './materialIndex';

export type { ChangeMaterials } from './materialIndex';

/** The change's material lines with their readiness, availability, retired equipment and usage. */
export function useChangeMaterials(change: Pick<T.ChangeRequest, 'id' | 'workOrderId' | 'status'>, wo?: T.WorkOrder): ChangeMaterials {
  const md = useMaterialData();
  return useMemo(() => {
    const lines = linesOfChange(md, { id: change.id, workOrderId: change.workOrderId ?? wo?.id });
    return changeMaterialsOf(lines, md.materials, change, wo, md.ready);
  }, [md, change, wo]);
}
