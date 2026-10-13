import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SynopsisDoc } from './types';

/**
 * Per-screen Synopsis registration.
 *
 * A screen declares its own doc with `useScreenSynopsis(doc)` — the doc lives
 * next to the screen and is registered while the screen is mounted. The help
 * rail reads the currently-registered doc via `useActiveSynopsis()`. This
 * co-located model scales to hundreds of screens without a central file: each
 * screen owns its JSON object.
 *
 * Screens that don't register fall back to the path-keyed registry
 * (see getSynopsis in synopsis.ts) so nothing is ever blank.
 */
interface SynopsisCtx {
  current: SynopsisDoc | null;
  register: (doc: SynopsisDoc) => void;
  clear: () => void;
}

const Ctx = createContext<SynopsisCtx | null>(null);

export function SynopsisProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<SynopsisDoc | null>(null);
  const register = useCallback((doc: SynopsisDoc) => setCurrent(doc), []);
  const clear = useCallback(() => setCurrent(null), []);
  const value = useMemo(() => ({ current, register, clear }), [current, register, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Register this screen's Synopsis. Pass a stable object — either a module-level
 * const or a `useMemo`-wrapped value — so it isn't re-registered every render.
 *
 *   const DOC: SynopsisDoc = { title: 'Prefixes', summary: '…', blocks: [...] };
 *   export default function PrefixesPage() { useScreenSynopsis(DOC); … }
 */
export function useScreenSynopsis(doc: SynopsisDoc | null | undefined) {
  const ctx = useContext(Ctx);
  useEffect(() => {
    if (!ctx || !doc) return;
    ctx.register(doc);
    return () => ctx.clear();
  }, [ctx, doc]);
}

/** Read the screen-registered doc (null if the current screen didn't register one). */
export function useActiveSynopsis(): SynopsisDoc | null {
  return useContext(Ctx)?.current ?? null;
}
