/**
 * DashboardHeader — canonical chrome for every dashboard.
 * Addresses ui-uxenhancment.md E3, MP-1, P1 (Phase 0).
 *
 * Composition:
 *   [ Title (+ optional subtitle) ]   [ Updated X ago · Refresh ] [ Period selector ] [ Export ▾ ] [ Custom actions ]
 *
 * Universal rules:
 *   - Always shows "Updated X ago" relative timestamp.
 *   - Single "Refresh" action.
 *   - Optional period selector (controlled by parent).
 *   - Optional Export menu (parent provides items).
 */

import React from 'react';
import { DatePicker, Dropdown, Select, Tooltip } from 'antd';
import { VwButton as Button } from '../vw/VwButton';

import type { Dayjs } from 'dayjs';
import { ReloadOutlined, ExportOutlined, DownOutlined } from '../../icons';
import type { ItemType } from 'antd/es/menu/interface';
import { UX, fmtRelativeAgo } from './uxTokens';

export interface DashboardPeriodOption {
  value: string;
  label: string;
}

// Default presets — MTD / QTD / YTD removed per UX feedback in favor of
// a dedicated Date Range picker (see `dateRange` / `onDateRangeChange`
// props below). Today / Last 7 days / Last 12 months stay as one-tap
// shortcuts since they're genuinely common operational filters.
export const DEFAULT_PERIODS: DashboardPeriodOption[] = [
  { value: 'today',   label: 'Today' },
  { value: 'last7d',  label: 'Last 7 days' },
  { value: 'last30d', label: 'Last 30 days' },
  { value: 'last12m', label: 'Last 12 months' },
];

/** Tuple type for the date-range picker `[from, to]`. */
export type DashboardDateRange = [Dayjs | null, Dayjs | null] | null;

export interface DashboardHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  /** ISO timestamp of last data refresh. Defaults to now if omitted. */
  updatedAt?: string | Date;
  onRefresh?: () => void;
  /** Period selector — controlled. */
  period?: string;
  onPeriodChange?: (period: string) => void;
  periods?: DashboardPeriodOption[];
  /**
   * Date-range filter — controlled. When set, replaces the period select
   * as the active time window for the page. Pages can wire either / both:
   * the period Select renders if `period` is set, the RangePicker renders
   * if `dateRange` is set. Most dashboards will pass only `dateRange`.
   */
  dateRange?: DashboardDateRange;
  onDateRangeChange?: (range: DashboardDateRange) => void;
  /** Export menu items. If provided, an "Export" button renders. */
  exportItems?: ItemType[];
  onExport?: (key: string) => void;
  /** Custom right-side actions (after Export). */
  actions?: React.ReactNode;
}

export function DashboardHeader({
  title,
  subtitle,
  updatedAt,
  onRefresh,
  period,
  onPeriodChange,
  periods = DEFAULT_PERIODS,
  dateRange,
  onDateRangeChange,
  exportItems,
  onExport,
  actions,
}: DashboardHeaderProps) {
  // Was: `const ts = updatedAt ?? new Date();` which made the
  // "Updated X ago" pill always render — defaulting to NOW when no
  // `updatedAt` prop was passed. That produced a meaningless
  // "Updated 0s ago" indicator on every dashboard that didn't opt
  // in. Per UX feedback, hide the pill entirely unless the caller
  // explicitly passes an `updatedAt` value.
  const ts = updatedAt ?? null;
  return (
    <div className="vw-flex vw-items-start vw-justify-between vw-wrap vw-gap-xl" style={{ marginBottom: 'var(--vw-page-gap)' }}>
      <div style={{ minWidth: 0, flex: '1 1 240px' }}>
        <h2 className="vw-page-title" style={{ margin: 0, overflowWrap: 'anywhere' }}>{title}</h2>
        {subtitle && (
          <div className="vw-page-description" style={{ marginTop: 'var(--vw-space-xs)' }}>{subtitle}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
        {ts && (
          <Tooltip title={`Last refreshed ${new Date(ts).toLocaleString()}`}>
            <span style={{ fontSize: "var(--vw-font-label-xs)", color: UX.muted, fontWeight: 500 }}>
              Updated {fmtRelativeAgo(ts)}
            </span>
          </Tooltip>
        )}
        {onRefresh && (
          <Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>
            Refresh
          </Button>
        )}
        {period !== undefined && onPeriodChange && (
          <Select placeholder="Select reporting period"
            size="small"
            aria-label="Reporting period"
            value={period}
            onChange={onPeriodChange}
            options={periods}
            style={{ minWidth: 150 }}
          />
        )}
        {dateRange !== undefined && onDateRangeChange && (
          // Date range filter — replaces the old MTD / QTD / YTD presets
          // with a free-form picker. Pages that want a wider catalogue
          // (custom shortcuts, fiscal quarters, etc.) can still pass
          // them via the `periods` prop alongside the range picker.
          <DatePicker.RangePicker
            size="small"
            value={dateRange ?? null}
            onChange={(v) => onDateRangeChange(v as DashboardDateRange)}
            style={{ width: 240, maxWidth: '100%' }}
            allowClear
            allowEmpty={[true, true]}
            placeholder={['From', 'To']}
          />
        )}
        {exportItems && exportItems.length > 0 && (
          <Dropdown
            menu={{
              items: exportItems,
              onClick: (e) => onExport?.(e.key as string),
            }}
          >
            <Button size="small" icon={<ExportOutlined />}>
              Export <DownOutlined style={{ fontSize: "var(--vw-font-label-xs)" }} />
            </Button>
          </Dropdown>
        )}
        {actions}
      </div>
    </div>
  );
}

export default DashboardHeader;
