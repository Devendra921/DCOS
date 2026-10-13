/**
 * VwCard — vw-card-class-based replacement for antd's <Card>.
 *
 * `variant` controls nesting depth (a standalone card vs one nested inside
 * another card), not size. Nested cards inherit the compact child treatment unless explicitly overridden.
 */

import React, { createContext, useContext } from 'react';

const CardDepthContext = createContext(0);

export type VwCardVariant = 'section' | 'child' | 'child-shaded' | 'parent';
export type VwCardTone = 'error' | 'success' | 'warning' | 'info' | 'purple' | 'cyan' | 'pink' | 'fuchsia' | 'yellow';

export interface VwCardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  extra?: React.ReactNode;
  hoverable?: boolean;
  onClick?: () => void;
  /** Nesting depth — 'section' (default, standalone card) or 'child'/'parent' for cards nested inside another card. */
  variant?: VwCardVariant;
  /** Retained for compatibility; nesting variant owns canonical padding. */
  size?: 'small' | 'default';
  tone?: VwCardTone;
  loading?: boolean;
  /** Body padding override — mirrors antd's `styles={{ body: { ... } }}` / legacy `bodyStyle`. */
  bodyStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  className?: string;
}

const VwCardSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--vw-space-sm)" }}>
    <div className="vw-skeleton vw-skeleton--on-surface vw-skeleton-line" style={{ width: '60%' }} />
    <div className="vw-skeleton vw-skeleton--on-surface vw-skeleton-block" style={{ height: 24, width: '40%' }} />
  </div>
);

export const VwCard: React.FC<VwCardProps> = ({
  children, title, extra, hoverable, onClick, variant: requestedVariant, tone, loading, bodyStyle, style, className,
}) => {
  const depth = useContext(CardDepthContext);
  const variant = requestedVariant ?? (depth > 0 ? 'child' : 'section');
  const classNames = [
    `vw-card-${variant}`,
    (hoverable || onClick) ? 'vw-card--clickable' : '',
    tone ? `vw-card--${tone}` : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  // Keep one padding owner: the NST shell supplies chrome, the body supplies spacing.
  const padding = variant.startsWith('child') ? 'var(--vw-space-sm)' : 'var(--vw-space-lg)';
  const resolvedBodyStyle: React.CSSProperties = { minWidth: 0, padding, ...(title || extra ? { paddingTop: 0 } : {}), ...bodyStyle };

  return (
    <div
      className={classNames}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{ padding: 0, minWidth: 0, ...style }}
      onKeyDown={onClick ? (event) => {
        if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        onClick();
      } : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {(title || extra) && (
        <div className="vw-flex vw-wrap vw-items-center vw-justify-between vw-gap-sm" style={{ padding, paddingBottom: 'var(--vw-space-sm)', minWidth: 0 }}>
          {title && <div className="vw-card-title" style={{ flex: 1, minWidth: 0 }}>{title}</div>}
          {extra}
        </div>
      )}
      <div className="vw-card-body" style={resolvedBodyStyle}>
        <CardDepthContext.Provider value={depth + 1}>
        {loading ? <VwCardSkeleton /> : children}
        </CardDepthContext.Provider>
      </div>
    </div>
  );
};

export default VwCard;
