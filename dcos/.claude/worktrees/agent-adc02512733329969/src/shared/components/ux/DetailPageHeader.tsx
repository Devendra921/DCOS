/**
 * DetailPageHeader — canonical sticky context header for any detail page.
 *
 * Addresses findings.md Part B:
 *   - D4 "Status header overloaded" — two-row layout: identity row + property strip row.
 *   - HP-3 "No 'next action' affordance" — primary CTA always in the header, state-derived.
 *   - 13.2 "Scattered actions" — overflow menu for secondary actions; no inline button soup.
 *
 * Two-row anatomy:
 *   Row 1 (identity):   [ Back ] · Code · Name · Primary status pill · Primary CTA · "Actions" overflow
 *   Row 2 (properties): Chip · Chip · Chip · …  (property strip, ≤ 6 chips)
 *
 * Optional sticky behaviour: the entire header pins to top:0 on scroll so the
 * operator always knows what record they're working on.
 */

import React from 'react';
import { Dropdown, Tooltip } from 'antd';
import { VwButton as Button } from '../vw/VwButton';

import { ArrowLeftOutlined, MoreOutlined } from '../../icons';
import type { ItemType, MenuItemType } from 'antd/es/menu/interface';
import { useNavigate } from 'react-router-dom';
import { UX } from './uxTokens';

export interface DetailHeaderAction {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  /** Marks the action as the primary CTA (rendered as a filled button). At most one is allowed. */
  primary?: boolean;
  /** Disable the action. */
  disabled?: boolean;
  /** Hide the action conditionally. */
  hidden?: boolean;
  /** Treat as destructive (red text in dropdown). Primary destructive is shown as a Danger button. */
  danger?: boolean;
  /** Optional tooltip explaining why disabled or what the action does. */
  tooltip?: string;
}

export interface DetailHeaderProperty {
  label: string;
  value: React.ReactNode;
  /** Optional tone — neutral by default. */
  tone?: 'neutral' | 'ok' | 'warning' | 'critical' | 'info';
}

export interface DetailPageHeaderProps {
  /** Path to navigate back to. If omitted, no back affordance. */
  backTo?: string;
  /** Short label for back link (default "Back"). */
  backLabel?: string;
  /** Entity code / id (monospace). */
  code?: React.ReactNode;
  /** Display name / title. */
  name: React.ReactNode;
  /** Subtitle line under the name (optional). */
  subtitle?: React.ReactNode;
  /** Primary status pill rendered to the right of the name. */
  statusPill?: React.ReactNode;
  /** Property strip — ≤ 6 chips. */
  properties?: DetailHeaderProperty[];
  /** Header actions. Exactly one may be `primary: true`. The rest collapse into "Actions" overflow. */
  actions?: DetailHeaderAction[];
  /** Sticky to top:0 on scroll (default true). */
  sticky?: boolean;
  /** Override the bottom margin (default 16). */
  marginBottom?: number;
}

const TONE_COLOR: Record<NonNullable<DetailHeaderProperty['tone']>, string> = {
  neutral: UX.slate,
  ok: UX.green,
  warning: UX.amber,
  critical: UX.red,
  info: UX.blue,
};

export function DetailPageHeader({
  backTo,
  backLabel = 'Back',
  code,
  name,
  subtitle,
  statusPill,
  properties = [],
  actions = [],
  sticky = true,
  marginBottom = 16,
}: DetailPageHeaderProps) {
  const navigate = useNavigate();

  // Find the primary action (at most one)
  const visibleActions = actions.filter((a) => !a.hidden);
  const primary = visibleActions.find((a) => a.primary);
  const secondary = visibleActions.filter((a) => !a.primary);

  const overflowItems: ItemType[] = secondary.map<ItemType>((a) => ({
    key: a.key,
    label: a.label,
    icon: a.icon,
    danger: a.danger,
    disabled: a.disabled,
    onClick: () => a.onClick?.(),
  } as MenuItemType));

  return (
    <div
      className="vw-card-section"
      style={{
        // Card chrome (bg/border/radius/padding) now comes from
        // .vw-card-section — sticky positioning and the frosted-glass
        // backdrop are functional, per-instance behavior, not decoration,
        // so they stay as inline overrides on top of the registry class.
        position: sticky ? 'sticky' : 'static',
        top: sticky ? 0 : undefined,
        zIndex: 8,
        background: 'var(--vw-color-surface-elevated)',
        backdropFilter: sticky ? 'saturate(180%) blur(12px)' : undefined,
        WebkitBackdropFilter: sticky ? ('saturate(180%) blur(12px)' as unknown as undefined) : undefined,
        marginBottom,
      }}
    >
      {/* Row 1: identity + status + actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: "var(--vw-space-md)",
          flexWrap: 'wrap',
          marginBottom: properties.length > 0 || subtitle ? 8 : 0,
        }}
      >
        {/* Back */}
        {backTo && (
          <button
            onClick={() => navigate(backTo)}
            aria-label={backLabel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: "var(--vw-space-xxs)",
              background: 'transparent',
              border: 'none',
              color: UX.muted,
              fontSize: "var(--vw-font-label-sm)",
              cursor: 'pointer',
              padding: 0,
              fontWeight: 500,
            }}
          >
            <ArrowLeftOutlined style={{ fontSize: "var(--vw-font-label-xs)" }} />
            {backLabel}
          </button>
        )}

        {/* Identity */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: '1 1 240px', minWidth: 0, flexWrap: 'wrap' }}>
          {code !== undefined && (
            <span
              style={{
                fontSize: "var(--vw-font-label-md)",
                color: UX.muted,
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              {code}
            </span>
          )}
          <h1 className="vw-page-title" style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
            {name}
          </h1>
          {statusPill}
        </div>

        {/* Actions — primary + overflow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", flexWrap: 'wrap', maxWidth: '100%' }}>
          {primary && (
            <Tooltip title={primary.tooltip}>
              <Button
                type="primary"
                icon={primary.icon}
                disabled={primary.disabled}
                danger={primary.danger}
                onClick={primary.onClick}
                style={primary.danger ? undefined : undefined}
              >
                {primary.label}
              </Button>
            </Tooltip>
          )}
          {overflowItems.length > 0 && (
            <Dropdown
              menu={{ items: overflowItems }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Button icon={<MoreOutlined />}>
                Actions
              </Button>
            </Dropdown>
          )}
        </div>
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div style={{ fontSize: "var(--vw-font-label-sm)", color: UX.muted, marginBottom: properties.length > 0 ? 8 : 0, lineHeight: 1.4 }}>
          {subtitle}
        </div>
      )}

      {/* Row 2: property strip */}
      {properties.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            paddingTop: 6,
            borderTop: subtitle ? `1px solid ${UX.border}` : 'none',
          }}
        >
          {properties.slice(0, 6).map((p, i) => (
            <div key={`${p.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
              <span
                style={{
                  fontSize: "var(--vw-font-label-xs)",
                  color: UX.muted,
                  fontWeight: 400,
                  flexShrink: 0,
                }}
              >
                {p.label}
              </span>
              <span
                style={{
                  fontSize: "var(--vw-font-label-md)",
                  color: TONE_COLOR[p.tone ?? 'neutral'],
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
