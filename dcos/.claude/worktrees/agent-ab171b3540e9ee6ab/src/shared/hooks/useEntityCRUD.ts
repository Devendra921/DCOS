import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '../../mock/db';
import type { FilterCriteria } from '../../mock/db/store';
import { invalidateOps } from '../../ops/api';

interface ListParams {
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: FilterCriteria[];
  search?: string;
}

export function useEntityList(entity: string, params: ListParams = {}) {
  const { page = 1, pageSize = 20, sortField, sortOrder, filters, search } = params;

  return useQuery({
    queryKey: [entity, 'list', { page, pageSize, sortField, sortOrder, filters, search }],
    queryFn: () => {
      if (entity === '__noop__' || !db.entities().includes(entity)) {
        return { data: [], total: 0, page, pageSize };
      }
      if (search) {
        const results = db.search(entity, search);
        const start = (page - 1) * pageSize;
        return {
          data: results.slice(start, start + pageSize),
          total: results.length,
          page,
          pageSize,
        };
      }
      return db.getAll(entity, {
        filters,
        page,
        pageSize,
        sortField,
        sortOrder,
      });
    },
  });
}

export function useEntityDetail(entity: string, id: string | undefined) {
  return useQuery({
    queryKey: [entity, 'detail', id],
    queryFn: () => db.getById(entity, id!) ?? null,
    enabled: !!id,
  });
}

export function useEntityCreate(entity: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => {
      const result = db.create(entity, data);
      return Promise.resolve(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entity] });
      invalidateOps();
    },
  });
}

export function useEntityUpdate(entity: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => {
      const result = db.update(entity, id, data);
      return Promise.resolve(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entity] });
      invalidateOps();
    },
  });
}

export function useEntityDelete(entity: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      db.delete(entity, id);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entity] });
      invalidateOps();
    },
  });
}

export function useEntityCount(entity: string, filters?: FilterCriteria[]) {
  return useQuery({
    queryKey: [entity, 'count', filters],
    queryFn: () => db.count(entity, filters),
  });
}
