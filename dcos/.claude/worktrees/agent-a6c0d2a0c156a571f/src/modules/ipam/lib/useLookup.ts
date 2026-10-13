import { useMemo } from 'react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';

/**
 * Loads an entity table in full and returns an id → display-name map.
 * Used to resolve FK references (roleId, vrfId, rirId, groupId…) into labels.
 */
export function useLookup(entity: string, nameField = 'name'): Record<string, string> {
  const { data } = useEntityList(entity, { pageSize: 1000 });
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of (data?.data ?? []) as Array<Record<string, unknown>>) {
      const id = String(r.id);
      out[id] = String(r[nameField] ?? id);
    }
    return out;
  }, [data, nameField]);
}
