/**
 * numberFormat — canonical numeric display helpers.
 *
 * Rule: any value with |n| >= 10,000 collapses to compact notation
 * (10K / 10M / 1.5B). Smaller values keep their locale-formatted form
 * (1,234) so unit counts, site IDs and prices stay readable.
 *
 * Use everywhere instead of ad-hoc `.toLocaleString()` / template-string
 * formatting so figures render consistently across modules.
 *
 *   formatNumber(9_500)          // "9,500"
 *   formatNumber(10_000)         // "10K"
 *   formatNumber(12_540)         // "12.5K"
 *   formatNumber(1_234_567)      // "1.2M"
 *   formatNumber(2_500_000_000)  // "2.5B"
 *   formatNumber(0)              // "0"
 *   formatNumber(null)           // "—"
 *
 *   formatMoney(15_400)          // "$15K"
 *   formatMoney(-2_500_000)      // "-$2.5M"
 *   formatMoney(987)             // "$987"
 *
 *   formatPct(0.426)             // "42.6%"   (fraction input)
 *   formatPct(42.6, false)       // "42.6%"   (already %)
 */

const COMPACT_THRESHOLD = 10_000;

function compactPositive(n: number, divisor: number, suffix: string): string {
  const v = n / divisor;
  // For values >= 100, drop decimals. For smaller, keep one decimal and
  // trim a trailing ".0" so 12.0K renders as 12K but 12.5K stays.
  const rendered = v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
  return `${rendered}${suffix}`;
}

/**
 * Canonical numeric display. Returns `—` for null/NaN inputs.
 */
export function formatNumber(input: number | null | undefined): string {
  if (input == null || (typeof input === 'number' && isNaN(input))) return '—';
  const n = Number(input);
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  if (abs < COMPACT_THRESHOLD) {
    // Preserve any meaningful fractional digits up to 2 places
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (abs < 1_000_000)     return sign + compactPositive(abs, 1_000, 'K');
  if (abs < 1_000_000_000) return sign + compactPositive(abs, 1_000_000, 'M');
  return sign + compactPositive(abs, 1_000_000_000, 'B');
}

/**
 * Currency display. Always prefixes `$` (USA-only deployment).
 * Negative values render as `-$X` rather than `$-X`.
 */
export function formatMoney(input: number | null | undefined): string {
  if (input == null || (typeof input === 'number' && isNaN(input))) return '—';
  const n = Number(input);
  if (!isFinite(n)) return '—';
  return n < 0 ? `-$${formatNumber(Math.abs(n))}` : `$${formatNumber(n)}`;
}

/**
 * Percentage display. Pass a fraction (0.42) by default, or `false` for
 * the second arg if the value is already a percentage (42.6).
 */
export function formatPct(input: number | null | undefined, isFraction = true): string {
  if (input == null || (typeof input === 'number' && isNaN(input))) return '—';
  const n = Number(input);
  if (!isFinite(n)) return '—';
  const pct = isFraction ? n * 100 : n;
  const decimals = Math.abs(pct) >= 10 ? 1 : 2;
  return `${pct.toFixed(decimals).replace(/\.0+$/, '')}%`;
}
