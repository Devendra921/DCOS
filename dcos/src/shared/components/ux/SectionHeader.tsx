/**
 * SectionHeader — premium section title with optional AI summary line.
 *
 * Replaces the inconsistent "uppercase 11px muted" headers used across
 * dashboards with a calibrated title + subtitle + right-aligned actions.
 * Optionally accepts an `aiSummary` prop that renders a single-sentence
 * AI-generated framing under the title (per ui-uxenhancment.md guidance
 * on "one narrative line per dashboard").
 */

import React from 'react';
import { Tooltip } from 'antd';
import { ThunderboltOutlined, InfoCircleOutlined } from '../../icons';
import { UX } from './uxTokens';
import { ACCENT_GRADIENT_AI } from './uxSurfaces';

export interface SectionHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Inline AI-generated narrative under the title. Auto-prefixed with a sparkle icon. */
  aiSummary?: React.ReactNode;
  /** Right-side actions (filter chips, view toggles, export button, etc.). */
  actions?: React.ReactNode;
  /** Small chip / pill rendered next to the title (e.g. "Live", "Beta"). */
  chip?: React.ReactNode;
  /**
   * Explainer tooltip rendered as an `ⓘ` icon next to the title. Hovering
   * shows the tooltip content. Use this instead of wrapping the title in
   * a bare `<Tooltip>` so every section header surfaces tooltips the same
   * way — visible icon + hover, never silent hover-only.
   */
  tooltip?: React.ReactNode;
  /** Bottom margin (default 12). */
  marginBottom?: number;
  /** Add a hairline divider below. */
  divider?: boolean;
}

export function SectionHeader({
  title,
  subtitle,
  aiSummary,
  actions,
  chip,
  tooltip,
  marginBottom = 12,
  divider,
}: SectionHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: "var(--vw-space-md)",
        marginBottom,
        paddingBottom: divider ? 10 : 0,
        borderBottom: divider ? `1px solid ${UX.border}` : 'none',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)" }}>
          <h3 className="vw-card-title" style={{ margin: 0 }}>
            {title}
          </h3>
          {/* Tooltip icon — rendered when `tooltip` prop is set so the
              header always shows a visible `ⓘ` indicator alongside the
              hover behavior. No more silent hover-only tooltips. */}
          {tooltip && (
            <Tooltip title={tooltip} placement="top">
              <InfoCircleOutlined
                style={{
                  fontSize: "var(--vw-font-label-sm)",
                  color: UX.muted,
                  cursor: 'help',
                  flexShrink: 0,
                }}
                aria-label="More info"
              />
            </Tooltip>
          )}
          {chip}
        </div>
        {subtitle && (
          <div className="vw-card-description" style={{ marginTop: 'var(--vw-space-xs)' }}>
            {subtitle}
          </div>
        )}
        {aiSummary && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 6,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'rgba(124, 58, 237, 0.06)',
              border: '1px solid rgba(124, 58, 237, 0.15)',
              fontSize: "var(--vw-font-label-sm)",
              color: UX.slate,
              lineHeight: 1.4,
              maxWidth: '100%',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 16,
                height: 16,
                borderRadius: "var(--vw-radius-xs)",
                background: ACCENT_GRADIENT_AI,
                color: '#fff',
                fontSize: 11,
              }}
            >
              <ThunderboltOutlined />
            </span>
            <span>{aiSummary}</span>
          </div>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
