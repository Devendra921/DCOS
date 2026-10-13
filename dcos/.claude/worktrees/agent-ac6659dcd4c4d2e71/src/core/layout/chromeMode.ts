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
export const SHOW_CHROME = import.meta.env.DEV
  ? import.meta.env.VITE_SHOW_CHROME !== 'false'
  : import.meta.env.VITE_SHOW_CHROME === 'true';
