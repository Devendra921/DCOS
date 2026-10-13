/**
 * Shared, non-component helpers for the planner charts: a width hook (ResizeObserver),
 * a floating tooltip hook, date/number formatters and the series colour order.
 * Components live in ChartBits.tsx so fast refresh stays happy.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { VwPalette } from '../../../site360/lib/siteModel';

/** Measures the content width of a wrapper div; starts at `initial` until the first observation. */
export function useMeasuredWidth(initial = 640): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export interface TipState { x: number; y: number; content: ReactNode }
/** Tooltip state driven by mouse events; coordinates are relative to the wrapper element. */
export function useTip(wrapRef: RefObject<HTMLDivElement | null>) {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = useCallback((e: { clientX: number; clientY: number }, content: ReactNode) => {
    const r = wrapRef.current?.getBoundingClientRect();
    setTip({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0), content });
  }, [wrapRef]);
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

const MONTH_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
const MONTH_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short' });
const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtMonthYear = (d: Date | number | string) => MONTH_YEAR.format(new Date(d));
export const fmtMonthShort = (d: Date | number | string) => MONTH_SHORT.format(new Date(d));
export const fmtDay = (d: Date | number | string) => DAY.format(new Date(d));
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
export const fmtPct = (n: number, digits = 0) => `${n.toFixed(digits)}%`;

/** Add whole months to a date (keeps the day where possible). */
export function addMonths(d: Date | number, months: number): Date {
  const out = new Date(d);
  const whole = Math.floor(months);
  out.setMonth(out.getMonth() + whole);
  out.setDate(out.getDate() + Math.round((months - whole) * 30.4));
  return out;
}

/** Series colour order shared by the stacked and donut charts. */
export const seriesColors = (p: VwPalette) => [p.blue, p.cyan, p.violet, p.emerald, p.amber, p.rose, p.slate, p.blueLight];

/** Truncate a label to fit roughly `max` characters. */
export const ellipsis = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…` : s);

/** Short axis label for a kW figure ("2.5 MW", "800 kW"). */
export const axisKw = (kw: number) => (kw >= 1000 ? `${(kw / 1000).toFixed(kw % 1000 === 0 || kw >= 10000 ? 0 : 1)} MW` : `${Math.round(kw)} kW`);
