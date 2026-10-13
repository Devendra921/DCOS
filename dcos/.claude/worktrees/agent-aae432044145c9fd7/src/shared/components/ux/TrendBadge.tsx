/**
 * TrendBadge — compact ▲/▼/▬ delta indicator with direction-aware color.
 *
 * Replaces ad-hoc "+5%" / "-2 days" labels with a calibrated badge that
 * encodes direction, magnitude, and whether the change is desirable.
 * Use under KPI tiles, in table cells, in dashboard summaries.
 */

import React from 'react';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '../../icons';
import { UX } from './uxTokens';

export type TrendDirection = 'higher_is_better' | 'lower_is_better' | 'none';

export interface TrendBadgeProps {
  /** Delta value (signed). e.g. +4.2 or -1.5 */
  delta: number;
  /** 'pct' = render "4.2%"; 'abs' = render "4". */
  unit?: 'pct' | 'abs';
  /** Direction of "good". Controls badge color. */
  direction?: TrendDirection;
  /** Suffix label, e.g. "vs last month". */
  suffix?: string;
  /** Size — sm (table cells) / md (KPI tiles). */
  size?: 'sm' | 'md';
}

function colorFor(delta: number, direction: TrendDirection): string {
  if (delta === 0 || direction === 'none') return UX.muted;
  const positive = delta > 0;
  const good = direction === 'higher_is_better' ? positive : !positive;
  return good ? UX.green : UX.red;
}

export function TrendBadge({ delta, unit = 'pct', direction = 'higher_is_better', suffix, size = 'sm' }: TrendBadgeProps) {
  const color = colorFor(delta, direction);
  const Icon = delta > 0 ? ArrowUpOutlined : delta < 0 ? ArrowDownOutlined : MinusOutlined;
  const fs = size === 'md' ? 12 : 11;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: fs,
        fontWeight: 600,
        color,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.3,
      }}
    >
      <Icon style={{ fontSize: fs - 1 }} />
      <span>
        {Math.abs(delta).toFixed(unit === 'pct' ? 1 : 0)}
        {unit === 'pct' ? '%' : ''}
      </span>
      {suffix && <span style={{ color: UX.muted, fontWeight: 400, marginLeft: 2 }}>{suffix}</span>}
    </span>
  );
}
