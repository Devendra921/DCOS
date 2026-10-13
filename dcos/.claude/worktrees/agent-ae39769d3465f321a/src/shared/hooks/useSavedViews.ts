import { useCallback, useEffect, useState } from 'react';

export interface SavedView<T = Record<string, unknown>> {
  id: string;
  name: string;
  filters: T;
  createdAt: string;
}

const VERSION = 'v1';

function storageKey(pageKey: string) {
  return `ux.savedViews.${VERSION}.${pageKey}`;
}

export function useSavedViews<T extends object>(pageKey: string) {
  const [views, setViews] = useState<SavedView<T>[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey(pageKey));
      return raw ? (JSON.parse(raw) as SavedView<T>[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(pageKey), JSON.stringify(views));
    } catch {
      // ignore quota errors
    }
  }, [pageKey, views]);

  const save = useCallback((name: string, filters: T) => {
    const view: SavedView<T> = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      filters,
      createdAt: new Date().toISOString(),
    };
    setViews((cur) => [view, ...cur]);
    return view;
  }, []);

  const remove = useCallback((id: string) => {
    setViews((cur) => cur.filter((v) => v.id !== id));
  }, []);

  const rename = useCallback((id: string, name: string) => {
    setViews((cur) => cur.map((v) => (v.id === id ? { ...v, name } : v)));
  }, []);

  return { views, save, remove, rename };
}
