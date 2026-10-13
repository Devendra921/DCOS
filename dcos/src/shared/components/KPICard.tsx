import React from 'react';
import { Statistic, Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, InfoCircleOutlined } from '../icons';
import { VwCard } from './ux/VwCard';

export interface KPICardProps {
  title: string;
  value: number | string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  trend?: 'up' | 'down';
  trendValue?: string;
  trendLabel?: string;
  color?: string;
  loading?: boolean;
  hero?: boolean;
  subtitle?: string;
  sparklineData?: number[];
  sparklineColor?: string;
  onClick?: () => void;
  /**
   * Plain-language explanation of this KPI — what it measures, how it's
   * calculated, what good/bad values look like. Renders a small (i)
   * info icon next to the title that surfaces this text on hover.
   * Mirrors the `calc` prop on the canonical KpiTile.
   */
  info?: React.ReactNode;
  /**
   * Corner icon badge — a colored circular badge opposite the label, per
   * COMPONENTS.md's "Card icon slot | .vw-card-icon-md + .vw-chip--neutral"
   * pairing. Pass an @ant-design/icons element (e.g. <ThunderboltOutlined />).
   */
  icon?: React.ReactNode;
  /** Tint for the icon badge — same palette as VwChip's `color`. Defaults to 'neutral'. */
  /** Optional status breakdown — renders a segmented bar plus a legend under the value. */
  breakdown?: Array<{ label: string; value: number; color: string }>;
  iconTone?: 'info' | 'success' | 'warning' | 'error' | 'neutral' | 'purple' | 'cyan' | 'orange' | 'pink';
}

// Tone class only — .vw-card-variance.is-positive/.is-negative (src/styles/
// capacity/vw-global.css) owns the actual color (#1a7f10 / #d91818), not a
// token override here. NOTE: this maps trend directly to tone (up=positive,
// down=negative), which conflates direction with business meaning — the
// registry's own guidance is that tone should be the caller's call (a
// rising alarm count is still "negative"). Left as-is: fixing that is an
// API change across every KPICard caller, out of scope for a CSS-source fix.
const TREND_CONFIG = {
  up: { icon: <ArrowUpOutlined />, tone: 'is-positive' },
  down: { icon: <ArrowDownOutlined />, tone: 'is-negative' },
} as const;

// Sparklines globally disabled in KPI cards. The component is kept as a
// typed no-op so existing callers' `sparklineData` props don't need to be
// touched — they just render nothing.
const MiniSparkline: React.FC<{ data: number[]; color: string; width?: number; height?: number }> = () => null;

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  prefix,
  suffix,
  trend,
  trendValue,
  trendLabel,
  color,
  loading,
  hero,
  subtitle,
  sparklineData,
  sparklineColor,
  onClick,
  info,
  icon,
  iconTone = 'neutral',
  breakdown,
}) => {
  const trendCfg = trend ? TREND_CONFIG[trend] : null;

  const labelNode = (
    <Tooltip title={title} trigger={['hover', 'focus']}>
      <span className="vw-card-title vw-kpi-label" tabIndex={0}>{title}</span>
    </Tooltip>
  );

  const titleNode: React.ReactNode = (icon || info) ? (
    <span style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", width: '100%', minWidth: 0 }}>
      {icon && <span className={`vw-card-icon-sm vw-chip--${iconTone}`} style={{ flexShrink: 0 }}>{icon}</span>}
      {labelNode}
      {info && (
        <Tooltip
          title={<div style={{ fontSize: "var(--vw-font-label-xs)", lineHeight: 1.6, maxWidth: 280 }}>{info}</div>}
          placement="topRight"
          mouseEnterDelay={0.2}
        >
          <InfoCircleOutlined className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)", cursor: 'help', flexShrink: 0 }} />
        </Tooltip>
      )}
    </span>
  ) : labelNode;

  return (
    <VwCard
      className="vw-kpi-card"
      hoverable={!!onClick}
      onClick={onClick}
      loading={loading}
      style={{ cursor: onClick ? 'pointer' : 'default', height: '100%' }}
      bodyStyle={hero ? { padding: 'var(--vw-space-2xl)' } : undefined}
    >
      <Statistic
        // Explicit width — the title's flex row (`flex:1; min-width:0`, for
        // the icon/info slots) makes antd's own auto-width .ant-statistic
        // wrapper collapse toward min-content during shrink-to-fit sizing,
        // truncating labels that have plenty of real room. A plain inline
        // style here (not a stylesheet rule — this fought and lost against
        // antd's dynamically-injected CSS-in-JS for reasons not worth
        // chasing further) reliably wins because inline style has higher
        // priority than external stylesheet rules of equal importance.
        style={{ width: '100%' }}
        title={titleNode}
        value={value}
        prefix={prefix}
        suffix={suffix}
        // Size/weight/line-height snapped to .vw-card-metric-xxl / -xl
        // (src/styles/capacity/vw-global.css) — the closest registry metric
        // sizes to this component's previous hero/non-hero custom numbers.
        // Kept as valueStyle (not a className) because antd Statistic
        // doesn't expose a value-element className, and swapping it for a
        // plain <div> would lose Statistic's built-in number formatting.
        valueStyle={{
          // Color honors the `color` prop when explicitly passed (status
          // accents); otherwise falls back to the brand ink token
          // (vw-color-gray-900) instead of the old NST `#252525`.
          color: color ?? 'var(--vw-color-gray-900)',
          fontVariantNumeric: 'tabular-nums',
          ...(hero
            ? { fontSize: 'var(--vw-font-value-xxl)', fontWeight: 300, lineHeight: 1 }
            : { fontSize: 'var(--vw-font-value-xl)', fontWeight: 300, lineHeight: 1 }),
        }}
      />
      {subtitle && <div className="vw-kpi-sub">{subtitle}</div>}
      {breakdown && breakdown.length > 0 && (
        <>
          <div className="vw-kpi-bar" role="img" aria-label={breakdown.map((b) => `${b.value} ${b.label}`).join(', ')}>
            {breakdown.filter((b) => b.value > 0).map((b) => <i key={b.label} style={{ flex: b.value, background: b.color }} />)}
          </div>
          <div className="vw-kpi-legend">
            {breakdown.map((b) => <span key={b.label}><i style={{ background: b.color }} /><b>{b.value}</b> {b.label.toLowerCase()}</span>)}
          </div>
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", marginTop: trendCfg || sparklineData ? 6 : 0 }}>
        {trendCfg && trendValue && (
          <div
            className={`vw-card-variance ${trendCfg.tone}`}
            style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-xxs)" }}
          >
            {trendCfg.icon}
            <span>{trendValue}</span>
            {trendLabel && <span className="vw-card-metric-label-sub">{trendLabel}</span>}
          </div>
        )}
        {sparklineData && sparklineData.length > 1 && (
          <MiniSparkline data={sparklineData} color={sparklineColor || color || '#1B3A5C'} />
        )}
      </div>
    </VwCard>
  );
};

export default KPICard;
