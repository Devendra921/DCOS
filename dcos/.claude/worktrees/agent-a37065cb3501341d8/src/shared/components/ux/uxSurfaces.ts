/**
 * Surface system v2 — premium elevation tokens.
 *
 * The existing platform uses ONE card style everywhere, so every panel reads
 * as equally important. This module introduces THREE elevation levels and
 * a glass-morphism variant for floating panels (drawers, command palette,
 * AI assistant). Apply deliberately: most surfaces stay at FLAT/RAISED; reserve
 * GLASS for overlay surfaces and HERO for the page's primary visualization.
 */

import type React from 'react';
import { UX } from './uxTokens';

// ─── Elevation scale ──────────────────────────────────────────────

/** Flat (default) — no shadow. Inline cards, KPI band tiles. */
export const ELEVATION_FLAT: React.CSSProperties = {
  background: UX.surface,
  border: `1px solid ${UX.border}`,
  borderRadius: 'var(--vw-radius-lg)',
  boxShadow: 'var(--shadow-resting)',
};

/** Raised — subtle lift. Detail cards, secondary panels. */
export const ELEVATION_RAISED: React.CSSProperties = {
  background: UX.surface,
  border: `1px solid ${UX.border}`,
  borderRadius: 'var(--vw-radius-lg)',
  boxShadow: 'var(--shadow-resting)',
};

/** Hero — primary visualization, demands attention. */
export const ELEVATION_HERO: React.CSSProperties = {
  background: UX.surface,
  border: `1px solid ${UX.borderStrong}`,
  borderRadius: 'var(--vw-radius-lg)',
  boxShadow: 'var(--shadow-resting)',
};

/** Glass — for overlay surfaces (palette, drawer, AI dock). */
export const ELEVATION_GLASS: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.78)',
  backdropFilter: 'saturate(180%) blur(20px)',
  WebkitBackdropFilter: 'saturate(180%) blur(20px)' as unknown as undefined,
  border: '1px solid rgba(255, 255, 255, 0.6)',
  borderRadius: 'var(--vw-radius-lg)',
  boxShadow: '0 10px 30px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06)',
};

// ─── Ambient page background (subtle gradient mesh) ────────────────

/**
 * Replaces the flat `#f5f7fa` background with a barely-perceptible
 * gradient mesh that adds depth without being decorative. Apply to the
 * AppLayout content wrapper.
 */
export const AMBIENT_BG: React.CSSProperties = {
  background: 'var(--vw-color-background)',
};

/** Dark-mode ambient (use when theme = dark — placeholder for future). */
export const AMBIENT_BG_DARK: React.CSSProperties = {
  background: `
    radial-gradient(1200px 600px at 0% 0%, color-mix(in srgb, var(--primaryColor500) 10%, transparent), transparent 60%),
    radial-gradient(900px 500px at 100% 0%, rgba(124,58,237,0.10), transparent 55%),
    radial-gradient(800px 800px at 50% 100%, rgba(16,185,129,0.06), transparent 60%),
    #0b0f1a
  `,
};

// ─── Accent gradient — used for HERO accents, primary CTAs ─────────

/** Telecom-grade primary gradient — brand sky-blue to its deep shade. */
export const ACCENT_GRADIENT_BLUE = 'linear-gradient(135deg, var(--primaryColor500) 0%, #00548A 100%)';

/** Risk / urgency gradient. */
export const ACCENT_GRADIENT_RISK = 'linear-gradient(135deg, #f59e0b 0%, var(--vw-color-red-600) 100%)';

/** Healthy / on-track gradient. */
export const ACCENT_GRADIENT_OK = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';

/** Intelligence / AI accent gradient. */
export const ACCENT_GRADIENT_AI = 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)';
