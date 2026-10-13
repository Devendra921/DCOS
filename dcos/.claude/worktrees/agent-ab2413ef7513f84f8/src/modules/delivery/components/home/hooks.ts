/* Hooks for the delivery home and hub tabs: the chain bundle plus the few collections that
   stage and cost need, and the project rows built from them. */
import { useMemo } from 'react';
import type * as T from '../../../../mock/data/types';
import { useEntityList } from '../../../../shared/hooks/useEntityCRUD';
import { useDeliveryData, type DeliveryData } from '../../lib/chain';
import { buildProjectRows, type Extras, type ProjectRow } from './model';

const BIG = { pageSize: 100000 } as const;
const EMPTY: never[] = [];

export function useDeliveryExtras(): Extras {
  const boms = useEntityList('boms', BIG).data?.data as unknown as T.BOM[] | undefined;
  const changeOrders = useEntityList('changeOrders', BIG).data?.data as unknown as T.ChangeOrder[] | undefined;
  const activities = useEntityList('projectActivities', BIG).data?.data as unknown as T.ProjectActivity[] | undefined;
  return useMemo(() => ({ boms: boms ?? EMPTY, changeOrders: changeOrders ?? EMPTY, activities: activities ?? EMPTY }), [boms, changeOrders, activities]);
}

/** Delivery bundle, extras and one row per project (stage, open work, next gate). */
export function useProjectRows(): { d: DeliveryData; x: Extras; rows: ProjectRow[] } {
  const d = useDeliveryData();
  const x = useDeliveryExtras();
  const rows = useMemo(() => buildProjectRows(d, x), [d, x]);
  return { d, x, rows };
}
