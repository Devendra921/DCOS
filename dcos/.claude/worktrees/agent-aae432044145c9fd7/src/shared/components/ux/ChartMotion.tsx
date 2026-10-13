/**
 * ChartMotion — primitives + utilities for animating SVG charts.
 *
 * Telecom-OS-2030 directive: charts should feel *alive but not noisy*.
 * Subtle reveal on mount, no infinite loops, no scroll-jacking.
 *
 * Provides:
 *   - `<AnimatedPath>` — SVG <path> that "draws itself" using stroke-dasharray
 *   - `<RevealGroup>`  — SVG <g> that fades + lifts in on mount
 *   - `<BarRise>`      — SVG <rect> that grows from baseline to its height
 *   - `CHART_KEYFRAMES` — inject once at app root via <style>{CHART_KEYFRAMES}</style>
 *
 * All animations respect prefers-reduced-motion via the @media query inside
 * the keyframes block.
 */

import React from 'react';
import { DURATION, EASING } from './uxMotion';

/** Keyframes shared across all chart animations. Inject once. */
export const CHART_KEYFRAMES = `
@keyframes ux-chart-draw {
  from { stroke-dashoffset: var(--ux-dash-len, 1000); }
  to   { stroke-dashoffset: 0; }
}
@keyframes ux-chart-reveal {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ux-chart-rise {
  from { transform: scaleY(0); }
  to   { transform: scaleY(1); }
}
@media (prefers-reduced-motion: reduce) {
  .ux-chart-draw, .ux-chart-reveal, .ux-chart-rise {
    animation: none !important;
  }
}
`;

// ── AnimatedPath ─────────────────────────────────────────────────────

export interface AnimatedPathProps extends React.SVGAttributes<SVGPathElement> {
  /** Approximate path length in user units (used for the dash buffer). */
  pathLength?: number;
  /** Animation duration in ms (default DURATION.slow). */
  duration?: number;
  /** Animation delay in ms (default 0). */
  delay?: number;
}

/**
 * SVG path that "draws itself" on mount. Use for line series in charts.
 *
 *   <AnimatedPath d="M 0 100 L 100 50 L 200 75" stroke="#3b82f6" fill="none" />
 */
export const AnimatedPath: React.FC<AnimatedPathProps> = ({
  pathLength = 2000,
  duration = DURATION.slow,
  delay = 0,
  style,
  ...rest
}) => (
  <path
    {...rest}
    className={['ux-chart-draw', rest.className].filter(Boolean).join(' ')}
    style={{
      strokeDasharray: pathLength,
      strokeDashoffset: pathLength,
      animation: `ux-chart-draw ${duration}ms ${EASING.standard} ${delay}ms forwards`,
      ['--ux-dash-len' as string]: String(pathLength),
      ...style,
    }}
  />
);

// ── RevealGroup ──────────────────────────────────────────────────────

export interface RevealGroupProps extends React.SVGAttributes<SVGGElement> {
  duration?: number;
  delay?: number;
}

/**
 * SVG <g> that fades and lifts in on mount. Use for legends, labels, KPI overlays.
 */
export const RevealGroup: React.FC<RevealGroupProps> = ({
  duration = DURATION.standard,
  delay = 0,
  style,
  children,
  ...rest
}) => (
  <g
    {...rest}
    className={['ux-chart-reveal', rest.className].filter(Boolean).join(' ')}
    style={{
      transformOrigin: 'center',
      animation: `ux-chart-reveal ${duration}ms ${EASING.enter} ${delay}ms both`,
      ...style,
    }}
  >
    {children}
  </g>
);

// ── BarRise ──────────────────────────────────────────────────────────

export interface BarRiseProps extends React.SVGAttributes<SVGRectElement> {
  /** Y-coordinate of the baseline (bottom of the bar). */
  baselineY: number;
  duration?: number;
  delay?: number;
}

/**
 * SVG <rect> that grows from a baseline to its final height. Use for bars
 * in histograms. Sets `transform-origin` to the baseline so the bar grows up.
 */
export const BarRise: React.FC<BarRiseProps> = ({
  baselineY,
  duration = DURATION.standard,
  delay = 0,
  style,
  ...rest
}) => (
  <rect
    {...rest}
    className={['ux-chart-rise', rest.className].filter(Boolean).join(' ')}
    style={{
      transformOrigin: `center ${baselineY}px`,
      animation: `ux-chart-rise ${duration}ms ${EASING.enter} ${delay}ms both`,
      ...style,
    }}
  />
);
