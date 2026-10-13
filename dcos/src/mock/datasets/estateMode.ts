/**
 * Which estate the app loads: the demo estate alone, or the demo plus the NeoCloud workbooks.
 * Kept apart from the importer so the main bundle does not carry it.
 *
 * Browser: URL ?estate=demo|all, then localStorage 'dcos.estate' (default 'all').
 * Node scripts: DCOS_ESTATE=all|demo (default 'demo', so the existing smokes run on the demo estate).
 */
export type EstateMode = 'all' | 'demo';
export const ESTATE_STORAGE_KEY = 'dcos.estate';
const isMode = (v: unknown): v is EstateMode => v === 'all' || v === 'demo';

/** Browser: ?estate= then localStorage (default 'all'). Node scripts: DCOS_ESTATE (default 'demo'). */
export function resolveEstate(): EstateMode {
  if (typeof window !== 'undefined') {
    try {
      const q = new URLSearchParams(window.location.search).get('estate');
      if (isMode(q)) return q;
      const v = window.localStorage.getItem(ESTATE_STORAGE_KEY);
      if (isMode(v)) return v;
    } catch { /* storage blocked */ }
    return 'all';
  }
  const env = typeof process !== 'undefined' ? process.env?.DCOS_ESTATE : undefined;
  return isMode(env) ? env : 'demo';
}

/** Remember the estate choice and reload so the store is rebuilt with it. */
export function setEstate(mode: EstateMode): void {
  try { window.localStorage.setItem(ESTATE_STORAGE_KEY, mode); } catch { /* storage blocked */ }
  const url = new URL(window.location.href);
  url.searchParams.delete('estate');
  window.location.replace(url.toString());
}
