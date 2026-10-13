/**
 * Chrome toggle — sidebar + header shell.
 *
 *   Local dev (`npm run dev`)       → show chrome by default
 *   Production build (`vite build`) → hide chrome by default (host shell provides nav)
 *
 * Override with `VITE_SHOW_CHROME=true|false` in `.env` / `.env.production` / `.env.local`.
 * See `src/vite-env.d.ts`.
 *
 * Shared (not defined in AppLayout.tsx) so other modules can read this flag
 * without importing AppLayout itself and risking a circular import.
 */
const DEFAULT_SHOW_CHROME = import.meta.env.DEV
  ? import.meta.env.VITE_SHOW_CHROME !== 'false'
  : import.meta.env.VITE_SHOW_CHROME === 'true';

const STORAGE_KEY = 'ran.shell';

/**
 * Per-URL override: `?shell=false` hides the shell (sidebar + header) and
 * shows only the page; `?shell=true` forces it on. The choice is remembered
 * for the browser tab (sessionStorage) so it survives in-app navigation,
 * which drops the query string. It wins over the env default.
 */
export function getShowChrome(): boolean {
  let param: string | null = null;
  try { param = new URLSearchParams(window.location.search).get('shell'); } catch { /* no window */ }
  if (param === 'true' || param === 'false') {
    try { sessionStorage.setItem(STORAGE_KEY, param); } catch { /* storage blocked */ }
    return param === 'true';
  }
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved === 'true' || saved === 'false') return saved === 'true';
  } catch { /* storage blocked */ }
  return DEFAULT_SHOW_CHROME;
}

export const SHOW_CHROME = getShowChrome();
