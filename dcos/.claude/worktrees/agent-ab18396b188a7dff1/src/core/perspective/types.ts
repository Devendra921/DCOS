/**
 * Role-Based Perspective Architecture — core types.
 * See role-perspective-architecture.md for the full design.
 */

/** Altitude band — drives screen type + information density. */
export type Tier =
  | 'strategic'
  | 'management'
  | 'engineering'
  | 'operations'
  | 'field'
  | 'commercial'
  | 'external'
  | 'system';

/** Monotonic authority ladder. */
export type Authority = 'view' | 'contribute' | 'approve' | 'govern' | 'admin';

/** Information density applied to the whole shell. */
export type Density = 'comfortable' | 'standard' | 'expert';

/** Navigation breadth. */
export type NavScope = 'restricted' | 'focused' | 'full';

/** AI-assistant tone. */
export type AiMode =
  | 'strategic'
  | 'operational'
  | 'technical'
  | 'field'
  | 'commercial'
  | 'compliance';

export interface QuickAction {
  label: string;
  to: string;
}

/** The lens. One object drives every UI transform. */
export interface Perspective {
  id: string;
  label: string;
  shortLabel: string;
  tier: Tier;
  authority: Authority;
  locus: 'office' | 'field' | 'external';
  density: Density;
  navScope: NavScope;
  /** Landing route. '/' resolves to Mission Control. */
  homeRoute: string;
  /** Module codes promoted in navigation + on the home screen. */
  primaryModuleCodes: string[];
  /** Capability keys granted (see capabilities.ts). */
  capabilities: string[];
  /** Perspective accent colour — instant "which mode am I in" cue. */
  accent: string;
  aiMode: AiMode;
  /** One-line role description — shown in the switcher + onboarding. */
  summary: string;
  /** Home-screen + command-palette quick actions. */
  quickActions: QuickAction[];
}

export const AUTHORITY_RANK: Record<Authority, number> = {
  view: 0,
  contribute: 1,
  approve: 2,
  govern: 3,
  admin: 4,
};
