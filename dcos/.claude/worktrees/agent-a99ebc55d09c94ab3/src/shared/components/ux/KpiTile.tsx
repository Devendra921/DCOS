/**
 * KpiTile — canonical 4-tile-row KPI primitive.
 * Addresses ui-uxenhancment.md HP-1, HP-2, MP-1, MP-2, LP-1.
 *
 * - Compact mode for the 4-tile band (~64px tall).
 * - Hero mode for the 1-2 headline KPIs (2× weight).
 * - Optional Δ vs previous period with direction-aware color.
 * - Optional 14-day sparkline.
 * - Optional status accent (ok/warning/critical).
 */

import React from 'react';
import { Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined, InfoCircleOutlined } from '../../icons';
import { UX, CARD_STYLE, CARD_PADDING, TABULAR_NUMS_STYLE } from './uxTokens';

export type KpiStatus = 'ok' | 'warning' | 'critical' | 'neutral' | 'info';
export type KpiDirection = 'higher_is_better' | 'lower_is_better' | 'none';

export interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  /** Compact (default) ≈ 4-tile band; hero = ~2× size for headline KPIs. */
  size?: 'compact' | 'hero';
  /** Previous-period value or delta percent. If provided, Δ chip renders. */
  delta?: number;
  /** Display Δ as % (default) or absolute number. */
  deltaUnit?: 'pct' | 'abs';
  /** Direction for color-coding the Δ; defaults to higher_is_better. */
  direction?: KpiDirection;
  /** Status accent (small left border + value color). */
  status?: KpiStatus;
  /** Optional 14-day sparkline. */
  sparkline?: number[];
  /** Short secondary line under value. */
  hint?: string;
  /** Click navigates / drill. */
  onClick?: () => void;
  /**
   * Direct override of the value's text color. Provided for backward compat
   * with module-local KpiTile implementations that accept an arbitrary color
   * (e.g. `color={UX.green}`). Prefer `status` for new code; this prop
   * overrides the status-derived color when both are provided.
   */
  color?: string;
  /** Backward-compat alias for `color` (some module-local tiles used `accent`). */
  accent?: string;
  /** Backward-compat alias for `hint` (some module-local tiles used `sub`). */
  sub?: string;
  /**
   * Optional leading icon — rendered next to the label.
   * Provided for backward compat with module-local KpiTile implementations.
   */
  icon?: React.ReactNode;
  /**
   * Calculation explanation shown in an ℹ tooltip next to the label.
   * Use plain text or a JSX node. Renders an InfoCircleOutlined icon.
   */
  calc?: React.ReactNode;
  /**
   * When true, omits the small coloured status dot beside the label.
   * Useful on dashboards that want a strictly typographic look — no
   * red/amber/green/grey signal beads at all.
   */
  hideDot?: boolean;
  /** Tint for the icon badge — same palette as VwChip's `color`. Defaults to 'neutral'. */
  iconTone?: 'info' | 'success' | 'warning' | 'error' | 'neutral' | 'purple' | 'cyan' | 'orange' | 'pink';
}

const STATUS_COLOR: Record<KpiStatus, string> = {
  ok: UX.green,
  warning: UX.amber,
  critical: UX.red,
  neutral: UX.slate,
  info: UX.blue,
};

function deltaColor(delta: number, direction: KpiDirection): string {
  if (delta === 0 || direction === 'none') return UX.muted;
  const positive = delta > 0;
  const good = direction === 'higher_is_better' ? positive : !positive;
  return good ? UX.green : UX.red;
}

// Sparklines globally disabled — the user wants KPI cards to show numbers
// only, not embedded trend lines. The `sparkline` prop on KpiTile is now
// inert by design; callers don't need to change their call sites.
//
// Kept as a typed no-op so prop deletions across 20+ files aren't required.
// Underscored params silence the unused-arg lint check.
function Sparkline(_props: { data: number[]; color: string; w?: number; h?: number }) {
  return null;
}

export function KpiTile({
  label,
  value,
  size = 'compact',
  delta,
  deltaUnit = 'pct',
  direction = 'higher_is_better',
  status = 'neutral',
  sparkline,
  hint,
  onClick,
  color,
  accent,
  sub,
  calc,
  icon,
  iconTone = 'neutral',
  // [intentionally unused] `hideDot` is accepted in the public API
  // (KpiTileProps) so callers don't need editing, but the render no
  // longer uses it — see comment above the label row.
}: KpiTileProps) {
  const isHero = size === 'hero';
  const effectiveColor = color ?? accent;
  const effectiveHint = hint ?? sub;
  const valueColor = effectiveColor ?? STATUS_COLOR[status];
  const showDelta = typeof delta === 'number';
  const dColor = showDelta ? deltaColor(delta!, direction) : UX.muted;
  const dIcon = showDelta && delta! > 0 ? <ArrowUpOutlined />
    : showDelta && delta! < 0 ? <ArrowDownOutlined />
    : <MinusOutlined />;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
      className={`ran-kpi-tile vw-card-child${onClick ? ' vw-card--clickable' : ''}`}
      style={{
        // Container chrome (bg/border/radius/shadow/hover) now comes from
        // vw-card-child + vw-card--clickable. Padding/flex/minWidth stay
        // as explicit overrides — they're calibrated to the Macro Cell
        // Sites screenshot (compact `10×12` / hero `18×20`), tighter than
        // vw-card-child's own flat padding token.
        padding: isHero ? 'var(--vw-space-lg)' : 'var(--vw-space-sm)',
        flex: '1 1 0',
        minWidth: isHero ? 200 : 120,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{
        marginBottom: isHero ? 6 : 4,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        {/* Icon badge intentionally not rendered — KpiTile is always a
            nested/child widget (a 4-tile band inside a bigger card, or a
            standalone one), and the explicit call was that icons belong on
            parent widgets only. `icon`/`iconTone` stay in the prop type
            (inert, like `sparkline` above) so callers across 8 files don't
            need editing — this mirrors that same no-op pattern. */}
        <span className="vw-card-title" style={{ flex: 1, minWidth: 0 }}>{label}</span>
        {calc && (
          <Tooltip
            title={<div style={{ fontSize: "var(--vw-font-label-xs)", lineHeight: 1.6, maxWidth: 280 }}>{calc}</div>}
            placement="topRight"
            mouseEnterDelay={0.2}
          >
            <InfoCircleOutlined style={{ fontSize: "var(--vw-font-label-xs)", color: 'var(--vw-color-slate-400)', cursor: 'help', flexShrink: 0 }} />
          </Tooltip>
        )}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: "var(--vw-space-sm)",
        marginTop: 0,
        minWidth: 0,
      }}>
        <span
          // Same canonical scale KPICard's valueStyle pulls from (.vw-card-
          // metric-*), one rung down (xxl/lg vs KPICard's xxxl/xl) — this
          // tile packs 4-up in half a card, a denser layout than KPICard's
          // one-metric-per-card, so it needs the next size down to avoid
          // overflowing into its neighbour.
          className={isHero ? 'vw-card-metric-xxl' : 'vw-card-metric-lg'}
          style={{
            // Value text colour: defaults to the class's own ink token, but
            // when a caller explicitly passes `color`/`accent` we honor it
            // so the number takes on the requested tint (e.g. green for
            // "On-Air", red for "Delayed").
            color: effectiveColor,
            // An unusually long value (e.g. "$147.34M" vs. a sibling tile's
            // "1.04") has nowhere to go in a fixed 4-up row — ellipsize it
            // instead of letting it visually spill into the next tile,
            // mirroring how the label above already handles overflow.
            display: 'block',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            ...TABULAR_NUMS_STYLE,
          }}
        >{value}</span>
        {sparkline && sparkline.length >= 2 && (
          <Sparkline data={sparkline} color={dColor === UX.muted ? valueColor : dColor} w={isHero ? 100 : 64} h={isHero ? 28 : 20} />
        )}
      </div>
      {/* Bottom row — delta only. A lone hint with no delta used to render
          as a standalone "third row" sub-line under the value; removed per
          explicit request to keep the tile to two rows (icon+label, value)
          plus an actual trend comparison when there is one — not a static
          caption. `effectiveHint` still surfaces next to the delta when
          both are present, via the tooltip/right-aligned text below. */}
      {showDelta && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: "var(--vw-space-sm)",
          marginTop: isHero ? 6 : 3,
          minWidth: 0,
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontSize: "var(--vw-font-label-xs)",
            color: dColor,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            ...TABULAR_NUMS_STYLE,
          }}>
            {dIcon}
            {Math.abs(delta!).toFixed(deltaUnit === 'pct' ? 1 : 0)}
            {deltaUnit === 'pct' ? '%' : ''}
            <span style={{ color: UX.muted, fontWeight: 400 }}>&nbsp;vs prev.</span>
          </span>
          {effectiveHint && (
            <Tooltip title={effectiveHint} placement="top" mouseEnterDelay={0.3}>
              <span style={{
                fontSize: "var(--vw-font-label-xs)",
                color: UX.muted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                flex: '0 1 auto',
                textAlign: 'right',
                cursor: 'help',
              }}>
                {effectiveHint}
              </span>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

/** Strip of 4 (or N) compact KPI tiles with consistent rhythm. */
export function KpiBand({ children, gap = 12 }: { children: React.ReactNode; gap?: number }) {
  // Tiles here run as narrow as 120px (see KpiTile's compact minWidth) — the
  // registry's `.vw-grid-cols-auto-320` grid utility forces a 320px column
  // floor, which would collapse this into 1-2 oversized tiles per row. No
  // registered grid utility fits a sub-320px auto-fit band, so this stays a
  // wrapping flex row (`.vw-flex`/`.vw-wrap` from the registry, gap as an
  // inline style since it's a caller-supplied parameter, not a fixed token).
  return (
    <div className="vw-flex vw-wrap" style={{ gap, marginBottom: "var(--vw-space-lg)" }}>
      {children}
    </div>
  );
}

export default KpiTile;
