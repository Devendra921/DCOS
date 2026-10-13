/**
 * Canonical UX tokens — single source of truth for layout primitives
 * referenced by ui-uxenhancment.md Phase 0 fixes.
 *
 * Spacing, shadow, card padding, date format, page chrome — apply uniformly
 * across modules to eliminate the visual drift observed in the audit.
 */

// ─── Colors (cross-module canonical palette) ───────────────────────

export const UX = {
  slate: '#111827',
  slateMuted: '#4b5563',
  blue: 'var(--primaryColor500)',
  blueSoft: '#E0F4FB',
  green: 'var(--vw-color-green-600)',
  greenSoft: '#dcfce7',
  amber: '#f59e0b',
  amberSoft: '#fef3c7',
  red: 'var(--vw-color-red-600)',
  redSoft: '#fecaca',
  violet: '#7c3aed',
  violetSoft: '#ddd6fe',
  muted: '#6b7280',
  mutedSoft: '#f1f5f9',
  cyan: '#06b6d4',
  pink: '#ec4899',
  emerald: '#10b981',
  surface: '#ffffff',
  bg: '#f9fafb',
  border: '#e5e7eb',
  borderStrong: '#d1d5db',
} as const;

// ─── Card chrome ───────────────────────────────────────────────────

export const CARD_SHADOW = 'var(--shadow-resting)';
export const CARD_SHADOW_MD = 'var(--shadow-sm)';
export const CARD_RADIUS = 16;
export const CARD_PADDING = 16;
export const CARD_BORDER = `1px solid ${UX.border}`;

export const CARD_STYLE: React.CSSProperties = {
  background: UX.surface,
  border: CARD_BORDER,
  borderRadius: CARD_RADIUS,
  boxShadow: CARD_SHADOW,
};

// ─── Spacing rhythm ────────────────────────────────────────────────

export const SPACE_PAGE_X = 24;
export const SPACE_SECTION = 16;
export const SPACE_INTRA = 12;
export const SPACE_TIGHT = 8;

// ─── Page chrome ───────────────────────────────────────────────────

export const KPI_BAND_HEIGHT = 64; // compact 4-tile KPI band height
export const TAB_PRIMARY_CAP = 6; // detail-page tab cap before "More" overflow

// ─── Date/number formatting ────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
const DATE_TIME_FMT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Canonical date display — "May 15, 2026". */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  try { return DATE_FMT.format(new Date(d)); } catch { return '—'; }
}

/** Canonical date+time display. */
export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  try { return DATE_TIME_FMT.format(new Date(d)); } catch { return '—'; }
}

/** "Updated 4m ago" / "Updated 2h ago" / "Updated 3d ago" — for dashboard headers. */
export function fmtRelativeAgo(d: string | Date | null | undefined, now: Date = new Date()): string {
  if (!d) return 'never';
  const past = new Date(d).getTime();
  const diffMs = now.getTime() - past;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.floor(day / 30);
  return `${mon}mo ago`;
}

// ─── Number / percent / currency formatters ───────────────────────
// Canonical formatters — every module should use these instead of redefining
// its own to prevent locale / precision drift across pages.

/** "1,234" / "1.2M" — pass compact=true for short magnitude format. */
export function fmtNumber(n: number | null | undefined, digits = 0, compact = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (compact) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: digits }).format(n);
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

/** "59%" or "59.0%" depending on digits. */
export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

/** "$109,680" — currency display. Default USD; pass `currency` for others. */
export function fmtCurrency(n: number | null | undefined, currency = 'USD'): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

/** Pre-baked CSS for tabular numerics (apply to numeric cells / KPI values). */
export const TABULAR_NUMS_STYLE: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
};

// React import for CSSProperties type at top
// (kept implicit — consumers import React separately when needed)
import type React from 'react';
