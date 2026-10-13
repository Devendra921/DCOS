/**
 * Pill — canonical status / category pill.
 *
 * Replaces the ~12 local `Pill` definitions scattered across CRAN / Sharing /
 * QAM / RPT pages. All those local implementations were structurally identical
 * (display: inline-block + padded box + small font-weight 600); only the colors
 * differed. This component centralizes the shape so colors stay consistent.
 *
 * Use a status-prop variant (auto-color) or pass explicit bg/textColor for
 * custom semantics (e.g., operator pills, technology pills).
 */

import React from 'react';

export type PillStatus =
  | 'ok' | 'warning' | 'critical' | 'info' | 'neutral' | 'pending' | 'active' | 'inactive';

export interface PillProps {
  /** Display label. */
  label: React.ReactNode;
  /** Auto-color preset. If provided, `color` / `textColor` are ignored unless you override. */
  status?: PillStatus;
  /** Background color (overrides status preset). */
  color?: string;
  /** Text color (overrides status preset). */
  textColor?: string;
  /** Size — sm (default) or md for headlines. */
  size?: 'sm' | 'md';
  /** Tooltip text on hover. */
  title?: string;
  /** Click handler — pill becomes interactive (cursor: pointer). */
  onClick?: () => void;
  /** Pass-through style overrides. */
  style?: React.CSSProperties;
}

const STATUS_PRESETS: Record<PillStatus, { bg: string; fg: string }> = {
  ok:       { bg: '#bbf7d0', fg: '#166534' },
  warning:  { bg: '#fef3c7', fg: '#92400e' },
  critical: { bg: '#fecaca', fg: '#991b1b' },
  info:     { bg: '#dbeafe', fg: '#1e40af' },
  neutral:  { bg: '#f3f4f6', fg: '#111827' },
  pending:  { bg: '#fde68a', fg: '#92400e' },
  active:   { bg: '#bbf7d0', fg: '#166534' },
  inactive: { bg: '#e5e7eb', fg: '#374151' },
};

export function Pill({ label, status, color, textColor, size = 'sm', title, onClick, style }: PillProps) {
  const preset = status ? STATUS_PRESETS[status] : STATUS_PRESETS.neutral;
  const bg = color ?? preset.bg;
  const fg = textColor ?? preset.fg;
  // Shape aligned with StatusTag (round pill, padding 1-2 × 8-10, weight 500)
  // so Technology / Bands / Phase / Status chips read as one family across
  // every grid in the app.
  const padY = size === 'md' ? 3 : 1;
  const padX = size === 'md' ? 12 : 10;
  const fs = size === 'md' ? 12 : 11;
  return (
    <span
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-block',
        padding: `${padY}px ${padX}px`,
        fontSize: fs,
        fontWeight: 500,
        lineHeight: 1.5,
        background: bg,
        color: fg,
        borderRadius: 999,
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {label}
    </span>
  );
}
