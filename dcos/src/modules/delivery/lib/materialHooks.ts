/**
 * Screen hooks for materials: the material collections (read) and the material actions
 * (write through MockDB, then refresh every delivery, change and material screen).
 */
import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '../../../mock/db';
import { useAuth } from '../../../core/auth/AuthContext';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { MATERIAL_DATA_KEYS, type MaterialData } from './materialRules';
import { createMaterialOps, type MaterialOps } from './materialOps';

const BIG = { pageSize: 100000 } as const;
const EMPTY: never[] = [];
let lastDatas: unknown[] = []; let lastReady = false; let lastBundle: MaterialData | undefined;
/** Every material collection. Keeps its identity until a collection changes. */
export function useMaterialData(): MaterialData {
  const results = MATERIAL_DATA_KEYS.map(k => useEntityList(k, BIG)); // eslint-disable-line react-hooks/rules-of-hooks
  const datas = results.map(r => r.data?.data);
  const ready = results.every(r => r.data !== undefined);
  if (lastBundle && ready === lastReady && datas.every((d, i) => d === lastDatas[i])) return lastBundle;
  const out = { ready } as Record<string, unknown>;
  MATERIAL_DATA_KEYS.forEach((k, i) => { out[k] = (datas[i] ?? EMPTY).filter(r => !(r as { isDeleted?: boolean }).isDeleted); });
  lastDatas = datas; lastReady = ready; lastBundle = out as unknown as MaterialData;
  return lastBundle;
}

const REFRESH = [...MATERIAL_DATA_KEYS, 'devices', 'disposalCertificates', 'workOrders', 'changeRequests', 'purchaseOrders', 'boms', 'bomLines', 'projects', 'milestones', 'processInstances', 'flowNodeInstances', 'userTasks', 'auditEvents'];

/** The material actions for screens; each refreshes the affected lists. */
export function useMaterialActions(): MaterialOps {
  const qc = useQueryClient();
  const { user } = useAuth();
  const actor = user?.name ?? 'Delivery';
  const audit = useRecordAudit();
  const refresh = useCallback(() => { for (const k of REFRESH) void qc.invalidateQueries({ queryKey: [k] }); }, [qc]);
  return useMemo(() => {
    const ops = createMaterialOps(db, actor, audit);
    const wrapped = { actor } as Record<string, unknown>;
    for (const [k, fn] of Object.entries(ops)) if (typeof fn === 'function') wrapped[k] = (...a: unknown[]) => { const r = (fn as (...x: unknown[]) => unknown)(...a); refresh(); return r; };
    return wrapped as unknown as MaterialOps;
  }, [actor, audit, refresh]);
}
