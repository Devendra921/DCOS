/* A collection read with a stable empty array while loading, so it can be a memo dependency. */
import { useEntityList } from '../../../../shared/hooks/useEntityCRUD';

const EMPTY: never[] = [];
export function useRecords<R>(entity: string, pageSize = 2000): R[] {
  const data = useEntityList(entity, { pageSize }).data?.data;
  return (data ?? EMPTY) as unknown as R[];
}
