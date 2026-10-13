import { useMemo } from 'react';
import { useEntityList } from '../hooks/useEntityCRUD';
import type { CustomField, Tag } from '../../mock/data/types';

/** All tag definitions, plus an id→Tag map for rendering chips. */
export function useTags() {
  const tags = (useEntityList('tags', { pageSize: 500 }).data?.data ?? []) as unknown as Tag[];
  const byId = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t])), [tags]);
  return { tags, byId };
}

/** Custom-field definitions that apply to a given entity type, ordered by weight. */
export function useCustomFields(entityType: string) {
  const all = (useEntityList('customFields', { pageSize: 500 }).data?.data ?? []) as unknown as CustomField[];
  return useMemo(
    () => all
      .filter((f) => f.entityTypes?.includes(entityType))
      .sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0)),
    [all, entityType],
  );
}
