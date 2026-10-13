/**
 * Delivery chain — plan → programme → project → work order → change request.
 *
 * Every change to the estate is made through a change request, one change request per work
 * order. A project runs its own BPMN process; the steps that touch the estate raise work
 * orders, each work order raises its change (standard, normal or emergency), and the two
 * close together. Programmes are driven by their blueprint template and have no process.
 *
 * This module is the one place screens read the chain from. The rules and lookups are pure
 * (chainRules.ts, re-exported here); the hook `useDeliveryData()` supplies the bundle in the
 * app, `deliveryDataFromSnapshot()` in scripts.
 */
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { DELIVERY_DATA_KEYS, type DeliveryData } from './chainRules';

export * from './chainRules';

const BIG = { pageSize: 100000 } as const;
const EMPTY: never[] = [];
let lastDatas: unknown[] = []; let lastReady = false; let lastBundle: DeliveryData | undefined;
/** Every collection the delivery screens read. Keeps its identity until a collection changes. */
export function useDeliveryData(): DeliveryData {
  const results = DELIVERY_DATA_KEYS.map(k => useEntityList(k, BIG)); // eslint-disable-line react-hooks/rules-of-hooks
  const datas = results.map(r => r.data?.data);
  const ready = results.every(r => r.data !== undefined);
  if (lastBundle && ready === lastReady && datas.every((d, i) => d === lastDatas[i])) return lastBundle;
  const out = { ready } as Record<string, unknown>;
  DELIVERY_DATA_KEYS.forEach((k, i) => { out[k] = (datas[i] ?? EMPTY).filter(r => !(r as { isDeleted?: boolean }).isDeleted); });
  lastDatas = datas; lastReady = ready; lastBundle = out as unknown as DeliveryData;
  return lastBundle;
}
