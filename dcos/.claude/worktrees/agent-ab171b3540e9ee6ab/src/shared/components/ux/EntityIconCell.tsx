/**
 * EntityIconCell — icon-badge + label cell for list-table columns.
 *
 * Table columns that name a specific system, connector, or source/target
 * (a database, a provider, an integration) read better with a small colour
 * badge next to the label than as bare text — it lets the eye scan a column
 * by type before reading names. Today every table that wants this rolls its
 * own inline markup with ad hoc sizes/colors; this is the canonical shape.
 *
 * Reuses the same icon-badge language as KPICard's `icon`/`iconTone` (a
 * `.vw-card-icon-sm` badge tinted via `.vw-chip--{tone}`) so a badge means
 * the same thing whether it's on a KPI tile or a table row.
 *
 * Usage in a Table columns array:
 *
 *   import { EntityIconCell } from '@/shared/components/ux';
 *   ...
 *   { title: 'Source database', dataIndex: 'sourceDb', render: (_, r) => (
 *       <EntityIconCell icon={<DatabaseOutlined />} iconTone="info" label={r.sourceDb} />
 *     ) },
 *
 * Pass `sublabel` for a second, muted line under the label (e.g. a host or
 * a type), or `href`/`onClick` to make the whole cell a link/click target.
 */

import type { CSSProperties, ReactNode } from 'react';

export type EntityIconTone =
  | 'info' | 'success' | 'warning' | 'error' | 'neutral' | 'purple' | 'cyan' | 'orange' | 'pink';

export interface EntityIconCellProps {
  icon: ReactNode;
  iconTone?: EntityIconTone;
  label: ReactNode;
  sublabel?: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}

export function EntityIconCell({ icon, iconTone = 'neutral', label, sublabel, onClick, style }: EntityIconCellProps) {
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: "var(--vw-space-sm)",
        minWidth: 0,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      <span className={`vw-card-icon-sm vw-chip--${iconTone}`} style={{ width: 22, height: 22, fontSize: "var(--vw-font-label-sm)", flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ minWidth: 0, overflow: 'hidden' }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {sublabel && (
          <span style={{ display: 'block', fontSize: "var(--vw-font-label-sm)", color: 'var(--vw-color-gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sublabel}
          </span>
        )}
      </span>
    </span>
  );
}

export default EntityIconCell;
