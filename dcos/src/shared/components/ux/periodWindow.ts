/**
 * periodWindow — shared helper for dashboard period selectors.
 *
 * Two semantically distinct things every page needs:
 *
 *   • `cutoff` — the timestamp boundary used to gate record visibility.
 *     This now uses CALENDAR boundaries, matching what business users
 *     mean by "Month-to-date" / "Quarter-to-date" / "Year-to-date":
 *       – MTD = since the 1st of the current month
 *       – QTD = since the 1st of the current quarter
 *       – YTD = since 1 January of the current year
 *     Prior to this fix the cutoff was a trailing window (30 / 90 / 365
 *     days). Combined with mock seed data whose `updatedAt` only spans
 *     ~90 days back, QTD and YTD produced identical rowsets — the user
 *     correctly flagged it as broken.
 *
 *   • `days` — the calendar-period LENGTH so far (today − cutoff in days).
 *     Used by pages that cap a metric like "days stuck in phase"
 *     (Bottleneck / Aging) against the window size. MTD ≈ 1-31 days,
 *     QTD ≈ 1-92 days, YTD ≈ 1-365 days.
 *
 * Accepts both upper- and lower-case period codes so existing pages
 * don't need to migrate their constants.
 */
import { useMemo } from 'react';

// Vocabulary migrated to rolling-window codes (last7d / last30d / last12m).
// MTD / QTD / YTD remain as backwards-compat aliases that resolve to the
// closest rolling-window equivalent (last30d / last30d / last12m) so any
// page not yet migrated keeps working.
export type PeriodCode =
  | 'today' | 'last7d' | 'last30d' | 'last12m'
  // Deprecated — kept as resolved aliases:
  | 'MTD' | 'QTD' | 'YTD' | 'YOY';

export interface PeriodWindow {
  /** Days elapsed in the current rolling window (today − cutoff). */
  days: number;
  /** Epoch-ms cutoff; records with timestamp >= cutoff are inside the window. */
  cutoff: number;
  /** Stable suffix for KPI labels (e.g. "L30D"). */
  suffix: string;
  /** Human label, useful in subtitles ("Last 30 days"). */
  label: string;
}

// Old codes are now aliased to the new vocabulary so the rest of this
// file only deals with one set of cases.
const NORMALISE: Record<string, PeriodCode> = {
  today:   'today',
  last7d:  'last7d',
  last30d: 'last30d',
  last12m: 'last12m',
  // Aliases:
  MTD: 'last30d', mtd: 'last30d',
  QTD: 'last30d', qtd: 'last30d', // mapped to nearest rolling preset
  YTD: 'last12m', ytd: 'last12m',
  YOY: 'last12m',
};

/**
 * Compute the calendar-period start (cutoff) for `now`. Returns local-time
 * boundary so the labels match the user's calendar perception.
 */
// Rolling-window cutoff. All cases now subtract a fixed duration from
// "now" — no more calendar-period start anchors.
function calendarCutoff(period: string | undefined, now: number): number {
  const d = new Date(now);
  const key = period ? (NORMALISE[period] ?? period) : 'last30d';
  switch (key) {
    case 'today': {
      // Start of today.
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }
    case 'last7d':  return now - 7   * 86_400_000;
    case 'last30d': return now - 30  * 86_400_000;
    case 'last12m': return now - 365 * 86_400_000;
    default:        return now - 30  * 86_400_000;
  }
}

/**
 * periodToDays — days elapsed in the current calendar period. Kept for
 * pages that cap a metric (e.g. "days stuck in phase") against the
 * window size. Values are dynamic: in January QTD ≈ 1-31, by March it
 * ≈ 60-90, by June YTD ≈ 150, etc.
 */
export function periodToDays(period?: string, now: number = Date.now()): number {
  const cutoff = calendarCutoff(period, now);
  return Math.max(1, Math.ceil((now - cutoff) / 86_400_000));
}

export function periodLabel(period?: string): string {
  const key = period ? (NORMALISE[period] ?? period) : 'last30d';
  switch (key) {
    case 'today':    return 'Today';
    case 'last7d':   return 'Last 7 days';
    case 'last30d':  return 'Last 30 days';
    case 'last12m':  return 'Last 12 months';
    default:         return 'Last 30 days';
  }
}

export function periodSuffix(period?: string): string {
  const key = period ? (NORMALISE[period] ?? period) : 'last30d';
  switch (key) {
    case 'today':    return 'TODAY';
    case 'last7d':   return 'L7D';
    case 'last30d':  return 'L30D';
    case 'last12m':  return 'L12M';
    default:         return 'L30D';
  }
}

/**
 * useDashboardPeriod — derive the active window once per render.
 * Memoised so the cutoff doesn't churn on unrelated state changes.
 */
export function useDashboardPeriod(period: string | undefined, now: number = Date.now()): PeriodWindow {
  return useMemo<PeriodWindow>(() => {
    const cutoff = calendarCutoff(period, now);
    const days = Math.max(1, Math.ceil((now - cutoff) / 86_400_000));
    return {
      days,
      cutoff,
      suffix: periodSuffix(period),
      label: periodLabel(period),
    };
  }, [period, now]);
}

/**
 * inPeriod — predicate that returns true when the given record falls inside
 * the active window. The picker extracts the timestamp the page cares about
 * (usually `updatedAt`, with `createdAt` as fallback).
 *
 * Records with no parseable timestamp are KEPT — most dashboards still want
 * to show them so the table doesn't go suddenly empty when the seed lacks
 * dates. Pages that must be strict can pass `strict: true`.
 */
export function inPeriod<T>(
  window: PeriodWindow,
  record: T,
  pick: (r: T) => string | number | Date | null | undefined,
  opts?: { strict?: boolean },
): boolean {
  const v = pick(record);
  if (v == null || v === '') return !opts?.strict;
  const ts = v instanceof Date ? v.getTime() : new Date(v).getTime();
  if (!Number.isFinite(ts)) return !opts?.strict;
  return ts >= window.cutoff;
}
