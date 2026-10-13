/**
 * PerspectiveProvider — resolves the active perspective and exposes the
 * permission engine. Layered above AuthProvider.
 * See role-perspective-architecture.md §8, §10.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { Authority, Perspective } from './types';
import { AUTHORITY_RANK } from './types';
import {
  PERSPECTIVES,
  ALL_PERSPECTIVES,
  perspectiveForRole,
} from './perspectives';

const SIM_KEY = 'ran.perspective.simulated';

interface PerspectiveContextValue {
  /** The perspective currently driving the UI (native OR simulated). */
  perspective: Perspective;
  /** The user's real, role-assigned perspective. */
  nativePerspective: Perspective;
  /** True when an "Act As Role" simulation is active. */
  isSimulating: boolean;
  /** Every perspective (for the switcher / Act-As menu). */
  allPerspectives: Perspective[];
  /** Capability check — the one primitive every surface uses. */
  can: (capability: string) => boolean;
  /** Coarse authority-band check. */
  hasAuthority: (min: Authority) => boolean;
  /** Switch to one of the user's own perspectives (real). */
  switchPerspective: (perspectiveId: string) => void;
  /** Admin / explorer: simulate any perspective. */
  actAsRole: (perspectiveId: string) => void;
  /** Drop the simulation, return to the native perspective. */
  exitSimulation: () => void;
}

const PerspectiveContext = createContext<PerspectiveContextValue | null>(null);

export const PerspectiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Native perspective derives from the auth user's role.
  const nativePerspective = useMemo(() => perspectiveForRole(user?.roleId), [user?.roleId]);

  // Simulated perspective ("Act As Role") — persisted so a refresh keeps it.
  const [simulatedId, setSimulatedId] = useState<string | null>(() => {
    try { return localStorage.getItem(SIM_KEY); } catch { return null; }
  });

  const perspective = useMemo<Perspective>(() => {
    if (simulatedId && PERSPECTIVES[simulatedId]) return PERSPECTIVES[simulatedId];
    return nativePerspective;
  }, [simulatedId, nativePerspective]);

  const isSimulating = !!simulatedId && simulatedId !== nativePerspective.id;

  const can = useCallback(
    (capability: string) => {
      if (perspective.authority === 'admin') return true; // admin ⊇ all
      return perspective.capabilities.includes(capability);
    },
    [perspective],
  );

  const hasAuthority = useCallback(
    (min: Authority) => AUTHORITY_RANK[perspective.authority] >= AUTHORITY_RANK[min],
    [perspective],
  );

  const actAsRole = useCallback((perspectiveId: string) => {
    if (!PERSPECTIVES[perspectiveId]) return;
    setSimulatedId(perspectiveId);
    try { localStorage.setItem(SIM_KEY, perspectiveId); } catch { /* noop */ }
  }, []);

  const exitSimulation = useCallback(() => {
    setSimulatedId(null);
    try { localStorage.removeItem(SIM_KEY); } catch { /* noop */ }
  }, []);

  // In this prototype every seeded user holds one role, so a real
  // multi-role "switch" and the admin "act as" both route through actAsRole.
  const switchPerspective = actAsRole;

  const value = useMemo<PerspectiveContextValue>(
    () => ({
      perspective,
      nativePerspective,
      isSimulating,
      allPerspectives: ALL_PERSPECTIVES,
      can,
      hasAuthority,
      switchPerspective,
      actAsRole,
      exitSimulation,
    }),
    [perspective, nativePerspective, isSimulating, can, hasAuthority, switchPerspective, actAsRole, exitSimulation],
  );

  return <PerspectiveContext.Provider value={value}>{children}</PerspectiveContext.Provider>;
};

/** Access the active perspective + permission engine. */
export function usePerspective(): PerspectiveContextValue {
  const ctx = useContext(PerspectiveContext);
  if (!ctx) throw new Error('usePerspective must be used within PerspectiveProvider');
  return ctx;
}

/** Convenience hook: capability check only. */
export function useCan(capability: string): boolean {
  return usePerspective().can(capability);
}
