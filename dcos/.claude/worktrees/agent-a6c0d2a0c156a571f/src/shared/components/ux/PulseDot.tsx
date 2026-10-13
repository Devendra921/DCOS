/**
 * PulseDot — animated status indicator.
 *
 * Replaces static "● Active" badges with a live-feeling pulse. Use sparingly:
 * reserve for genuinely live signals (link state, ZTP progress, alarm streams).
 * Telecom NOC convention: green = operational, amber = degraded, red = critical.
 */

import React from 'react';
import { UX } from './uxTokens';
import { PULSE_KEYFRAMES } from './uxMotion';

export type PulseStatus = 'ok' | 'warning' | 'critical' | 'info' | 'neutral';

const COLORS: Record<PulseStatus, string> = {
  ok: UX.green,
  warning: UX.amber,
  critical: UX.red,
  info: UX.blue,
  neutral: UX.muted,
};

export interface PulseDotProps {
  status: PulseStatus;
  /** Diameter in px (default 8). */
  size?: number;
  /** Disable the animation (e.g. inside a list with many dots, for perf). */
  static?: boolean;
  /** Inline label rendered next to the dot. */
  label?: React.ReactNode;
}

export function PulseDot({ status, size = 8, static: staticDot, label }: PulseDotProps) {
  const color = COLORS[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {!staticDot && <style>{PULSE_KEYFRAMES}</style>}
      <span
        style={{
          position: 'relative',
          display: 'inline-block',
          width: size,
          height: size,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      >
        {!staticDot && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: color,
              animation: 'ux-pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
        )}
      </span>
      {label !== undefined && (
        <span style={{ fontSize: "var(--vw-font-label-sm)", color: UX.slate, fontWeight: 500 }}>{label}</span>
      )}
    </span>
  );
}
