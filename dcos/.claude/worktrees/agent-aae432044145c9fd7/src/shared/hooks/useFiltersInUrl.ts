import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * A filter-state container that mirrors a JSON-serializable object to/from
 * the URL search-params. The first render reads from the URL; subsequent
 * updates push to the URL with `replaceState` (no history pollution).
 *
 * Usage:
 *   const [filters, setFilters, resetFilters] = useFiltersInUrl({
 *     search: '',
 *     status: [] as string[],
 *     type: undefined as string | undefined,
 *   });
 */
export function useFiltersInUrl<T extends object>(
  defaultValue: T,
): [T, (next: Partial<T>) => void, () => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const defaultsRef = useRef(defaultValue);
  const [filters, setFiltersState] = useState<T>(() => {
    const params = new URLSearchParams(location.search);
    const next = { ...defaultValue };
    for (const k of Object.keys(defaultValue)) {
      const raw = params.get(k);
      if (raw === null) continue;
      try {
        (next as Record<string, unknown>)[k] = JSON.parse(raw);
      } catch {
        (next as Record<string, unknown>)[k] = raw;
      }
    }
    return next;
  });

  // Push filter changes to URL.
  useEffect(() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      const defaultVal = (defaultsRef.current as Record<string, unknown>)[k];
      // Skip values equal to default to keep URL clean.
      const isDefault = JSON.stringify(v) === JSON.stringify(defaultVal);
      if (isDefault || v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
      params.set(k, JSON.stringify(v));
    }
    const qs = params.toString();
    const target = qs ? `${location.pathname}?${qs}` : location.pathname;
    if (`${location.pathname}${location.search}` !== target) {
      navigate(target, { replace: true });
    }
  }, [filters, location.pathname, location.search, navigate]);

  const setFilters = useCallback((next: Partial<T>) => {
    setFiltersState((prev) => ({ ...prev, ...next }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(defaultsRef.current);
  }, []);

  return [filters, setFilters, resetFilters];
}
