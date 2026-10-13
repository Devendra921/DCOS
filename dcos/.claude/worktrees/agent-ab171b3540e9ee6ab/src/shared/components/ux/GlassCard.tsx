/** Existing surface API rendered with canonical VW cards and accent strips. */

import React from 'react';
export type GlassCardElevation = 'flat' | 'raised' | 'hero' | 'glass';
export type GlassCardAccent = 'blue' | 'risk' | 'ok' | 'ai' | 'none';

export interface GlassCardProps {
  elevation?: GlassCardElevation;
  accent?: GlassCardAccent;
  /** Inner padding (default 16). */
  padding?: number | string;
  /** Make the card clickable — adds hover lift. */
  onClick?: () => void;
  /** Extra style overrides. */
  style?: React.CSSProperties;
  /** Class name override (rare; styling is via inline style). */
  className?: string;
  children?: React.ReactNode;
  /** Optional ARIA label. */
  ariaLabel?: string;
}

export function GlassCard({
  elevation = 'flat',
  accent = 'none',
  padding = 16,
  onClick,
  style,
  className,
  children,
  ariaLabel,
}: GlassCardProps) {
  const accentColor = { blue: 'var(--vw-color-blue-500)', risk: 'var(--vw-color-red-500)', ok: 'var(--vw-color-emerald-500)', ai: 'var(--vw-color-purple-500)', none: undefined }[accent];
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        onClick();
      } : undefined}
      tabIndex={onClick ? 0 : undefined} aria-label={ariaLabel}
      className={['vw-card-section', onClick && 'vw-card--clickable', accentColor && 'vw-card--accent', className].filter(Boolean).join(' ')}
      style={{ padding, ...(elevation === 'glass' ? { boxShadow: 'var(--shadow-sm)' } : {}), ...style }}>
      {accentColor && <span aria-hidden className="vw-card-accent" style={{ background: accentColor }} />}
      {children}
    </div>
  );
}
