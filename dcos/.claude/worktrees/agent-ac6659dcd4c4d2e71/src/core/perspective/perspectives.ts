/**
 * Perspective system — single-profile mode.
 *
 * The original platform shipped 23 perspectives mapped to a role taxonomy
 * (Executive / PMO / RF Engineer / Field Engineer / …). The product
 * direction is now: a single full-access **Admin** profile with every
 * capability granted. The rest of the codebase still calls `usePerspective()`
 * and `can(CAP.x)`, so we keep those APIs in place — they just resolve to
 * the admin profile for every caller.
 *
 * Any code that references a removed perspective id (e.g. 'field-engineer')
 * falls back to admin through `PERSPECTIVES[id] ?? PERSPECTIVES[DEFAULT]`
 * — so removing the entries does not break existing call-sites.
 */
import type { Perspective } from './types';
import { CAP } from './capabilities';

// Admin gets every CAP key — full-access by construction.
const ALL_CAPABILITIES = Object.values(CAP);

export const PERSPECTIVES: Record<string, Perspective> = {
  // ── Tier 0 — System (the only profile) ─────────────────────────────
  admin: {
    id: 'admin', label: 'Administrator', shortLabel: 'Admin',
    tier: 'system', authority: 'admin', locus: 'office',
    density: 'standard', navScope: 'full', homeRoute: '/',
    // Empty primaryModuleCodes = no module narrowing; the admin sees every menu item.
    primaryModuleCodes: [],
    capabilities: ALL_CAPABILITIES,
    accent: '#0f172a', aiMode: 'operational',
    summary: 'Full platform access — every module, every capability.',
    quickActions: [
      { label: 'Mission Control', to: '/' },
      { label: 'Data Centers', to: '/facility' },
    ],
  },
};

/**
 * Auth roleId → perspective. With the single-profile model, every legacy
 * role resolves to admin so existing user accounts get full access on first
 * login without a data migration.
 */
export const ROLE_TO_PERSPECTIVE: Record<string, string> = {
  R01: 'admin', R02: 'admin', R03: 'admin', R04: 'admin', R06: 'admin',
  R07: 'admin', R12: 'admin', R16: 'admin', R18: 'admin', R19: 'admin',
  R23: 'admin', R24: 'admin',
};

export const DEFAULT_PERSPECTIVE_ID = 'admin';

export function perspectiveForRole(_roleId: string | undefined): Perspective {
  // Single-profile mode: every caller resolves to admin. The `_roleId`
  // argument is kept so existing call-sites compile unchanged.
  return PERSPECTIVES.admin;
}

/** All perspectives — single entry now. */
export const ALL_PERSPECTIVES: Perspective[] = [PERSPECTIVES.admin];
