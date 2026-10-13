/**
 * lazyWithRetry — drop-in replacement for `React.lazy` that recovers
 * gracefully from "Failed to fetch dynamically imported module" errors.
 *
 * Why this exists: when Vite's dev server invalidates a module (or a
 * production deploy rotates its chunk hashes), the browser can still
 * be holding a stale `?t=…` / `chunk-XYZ.js` URL pointing at the
 * previous build. The next time the user navigates to a route that
 * lazy-loads that chunk, the fetch 404s and React Suspense unmounts
 * into the PageErrorBoundary with the cryptic "Failed to fetch
 * dynamically imported module: <url>" message.
 *
 * The recovery: on a chunk-miss specifically (we match the message
 * pattern), set a sessionStorage flag and `location.reload()`. The
 * fresh page boot reads the new chunk map, fetches the current URL,
 * and the route renders normally. The session flag is the loop guard
 * — if the import still fails on the second try, the error is bubbled
 * up so a real bug isn't masked by an infinite reload.
 *
 * Each lazy site provides a stable `retryKey` so the loop guard is
 * scoped per-route (avoids one bad chunk blocking reloads on others).
 */
import React from 'react';

const RETRIES_PER_KEY: Record<string, number> = {};

export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retryKey: string,
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      const mod = await factory();
      // Successful load — clear any past retry flag so a future stale
      // chunk on this same route can still recover once.
      delete RETRIES_PER_KEY[retryKey];
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(`lazy-retry:${retryKey}`);
      }
      return mod;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The exact phrases Vite (dev + prod) and the browser emit when
      // a chunk URL no longer resolves. Matching broadly keeps us
      // covered across Vite versions and bundler swaps.
      const isChunkMiss =
        /failed to fetch dynamically imported module/i.test(msg) ||
        /failed to load (module|chunk)/i.test(msg) ||
        /loading chunk \d+ failed/i.test(msg) ||
        /import\(\) module is not defined/i.test(msg);
      const sessionKey = `lazy-retry:${retryKey}`;
      const alreadyRetried =
        typeof window !== 'undefined' &&
        window.sessionStorage.getItem(sessionKey) === '1';
      if (isChunkMiss && !alreadyRetried && typeof window !== 'undefined') {
        // Mark this route as "retried once this session" so we don't
        // loop if the underlying cause is a real bug rather than a
        // stale chunk.
        window.sessionStorage.setItem(sessionKey, '1');
        RETRIES_PER_KEY[retryKey] = (RETRIES_PER_KEY[retryKey] ?? 0) + 1;
        window.location.reload();
        // Return a never-resolving promise so React Suspense doesn't
        // try to render an error fallback before the reload kicks in.
        // (Reload happens within ~50 ms; nothing on screen flashes.)
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
