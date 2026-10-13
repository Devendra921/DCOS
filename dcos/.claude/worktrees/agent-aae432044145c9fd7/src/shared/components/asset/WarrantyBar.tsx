/**
 * WarrantyBar — single canonical implementation.
 *
 * Deep-review §I: this component was previously duplicated in 3 places
 * (AssetListPage, AssetDetailPage's implicit math, SiteEquipmentTab) with
 * slightly different colour thresholds. Consolidating here so any warranty
 * UX change ships once.
 *
 * Renders a thin progress bar with:
 *   - Green when > 12 months remaining
 *   - Amber when ≤ 12 and > 0 months remaining
 *   - Red when expired (0)
 * with the remaining-months badge + expiry date underneath.
 */

import React from 'react';
import { Tooltip, Typography } from 'antd';

const { Text } = Typography;

export interface WarrantyBarProps {
  /** Months remaining (negative or zero → expired). */
  monthsRemaining: number;
  /** Total warranty months purchased (denominator). */
  totalMonths: number;
  /** ISO date string of expiry — shown as the tooltip & sublabel. */
  expiry: string;
  /** When true, fills the parent width; otherwise fixed 160px. */
  fullWidth?: boolean;
  /** Compact mode hides the sublabel; use when space is tight. */
  compact?: boolean;
}

export const WarrantyBar: React.FC<WarrantyBarProps> = ({
  monthsRemaining,
  totalMonths,
  expiry,
  fullWidth = false,
  compact = false,
}) => {
  const safeTotal = Math.max(1, totalMonths);
  const remaining = Math.max(0, monthsRemaining);
  const pct = Math.max(0, Math.min(100, Math.round((remaining / safeTotal) * 100)));
  const color = remaining > 12 ? 'var(--vw-color-green-600)' : remaining > 0 ? 'var(--vw-color-amber-600)' : 'var(--vw-color-red-600)';
  const label = remaining > 0 ? `${remaining} mo left` : 'Expired';
  const sublabel = `Expires ${expiry || '—'}`;

  return (
    <Tooltip
      title={
        <div style={{ fontSize: "var(--vw-font-label-sm)" }}>
          <div>{label}</div>
          <div style={{ color: "var(--vw-color-slate-300)" }}>{sublabel}</div>
        </div>
      }
    >
      <div style={{ width: fullWidth ? '100%' : 160, minWidth: 120 }}>
        <div
          aria-label={`Warranty ${label}`}
          style={{
            height: 6,
            background: "var(--vw-color-gray-100)",
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: color,
              transition: 'width 200ms ease',
            }}
          />
        </div>
        {!compact && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <Text style={{ fontSize: "var(--vw-font-label-xs)", color, fontWeight: 600 }}>{label}</Text>
            <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>{expiry}</Text>
          </div>
        )}
      </div>
    </Tooltip>
  );
};

export default WarrantyBar;
