/**
 * AIInsightCard — surfaces an AI-generated observation, prediction, or
 * recommendation with optional suggested action.
 *
 * Per ui-uxenhancment.md: "AI/ML predictions surfaced contextually, not in a
 * silo." This card is the canonical container for inline insights on any
 * dashboard / detail / list page (e.g. "3 sites likely to slip" on a
 * Program dashboard, "Vendor X anomaly detected" on a Vendor detail).
 *
 * Visual hierarchy: violet accent stripe + sparkle icon + concise headline +
 * supporting text + optional confidence badge + suggested action chip.
 *
 * NEVER use to render generative-AI placeholder text. The `insight` prop
 * should be a computed string derived from real platform data (see existing
 * KPIs / aggregations).
 */

import React from 'react';
import { ThunderboltOutlined, ArrowRightOutlined } from '../../icons';
import { UX } from './uxTokens';
import { ACCENT_GRADIENT_AI } from './uxSurfaces';
import { GlassCard } from './GlassCard';
import { TRANSITION } from './uxMotion';

export interface AIInsightCardProps {
  /** Short, action-driving title. */
  title: React.ReactNode;
  /** 1–2 sentence body. */
  body: React.ReactNode;
  /** AI confidence as %, e.g. 87. */
  confidence?: number;
  /** Optional suggested action label + callback. */
  actionLabel?: React.ReactNode;
  onAction?: () => void;
  /** Optional drilldown / source label, rendered as a muted footer link. */
  sourceLabel?: React.ReactNode;
  onSource?: () => void;
  /** Optional dismiss handler. */
  onDismiss?: () => void;
  /** Hero variant — larger, more prominent (use sparingly). */
  hero?: boolean;
}

export function AIInsightCard({
  title,
  body,
  confidence,
  actionLabel,
  onAction,
  sourceLabel,
  onSource,
  onDismiss,
  hero,
}: AIInsightCardProps) {
  return (
    <GlassCard
      elevation={hero ? 'hero' : 'raised'}
      accent="ai"
      padding={hero ? 18 : 14}
      style={{ position: 'relative' }}
    >
      {/* Header row: icon + title + dismiss */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: hero ? 32 : 26,
            height: hero ? 32 : 26,
            borderRadius: "var(--vw-radius-sm)",
            background: ACCENT_GRADIENT_AI,
            color: '#fff',
            fontSize: hero ? 14 : 12,
            flexShrink: 0,
          }}
        >
          <ThunderboltOutlined />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: "var(--vw-space-sm)",
              marginBottom: 3,
            }}
          >
            <span
              style={{
                fontSize: "var(--vw-font-label-xs)",
                fontWeight: 700,
                color: UX.violet,
              }}
            >
              AI Insight
            </span>
            {confidence !== undefined && (
              <span
                style={{
                  fontSize: "var(--vw-font-label-xs)",
                  fontWeight: 600,
                  color: UX.muted,
                  background: 'rgba(124, 58, 237, 0.08)',
                  padding: '2px 6px',
                  borderRadius: 3,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {confidence}% confidence
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: hero ? 16 : 14,
              fontWeight: 600,
              color: UX.slate,
              lineHeight: 1.3,
              letterSpacing: -0.1,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: hero ? 13 : 12,
              color: UX.slateMuted,
              marginTop: "var(--vw-space-xxs)",
              lineHeight: 1.5,
            }}
          >
            {body}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{
              background: 'transparent',
              border: 'none',
              color: UX.muted,
              cursor: 'pointer',
              fontSize: "var(--vw-font-label-md)",
              lineHeight: 1,
              padding: 2,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Footer row: action + source */}
      {(actionLabel || sourceLabel) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: "var(--vw-space-sm)",
            marginTop: "var(--vw-space-md)",
            paddingTop: 10,
            borderTop: `1px solid ${UX.border}`,
          }}
        >
          {actionLabel && (
            <button
              onClick={onAction}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: "var(--vw-space-xxs)",
                background: 'transparent',
                border: `1px solid ${UX.violet}`,
                color: UX.violet,
                fontSize: "var(--vw-font-label-sm)",
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                transition: TRANSITION.hover,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124, 58, 237, 0.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              {actionLabel}
              <ArrowRightOutlined style={{ fontSize: "var(--vw-font-label-xs)" }} />
            </button>
          )}
          <span style={{ flex: 1 }} />
          {sourceLabel && (
            <button
              onClick={onSource}
              style={{
                background: 'transparent',
                border: 'none',
                color: UX.muted,
                fontSize: "var(--vw-font-label-xs)",
                cursor: onSource ? 'pointer' : 'default',
                padding: 0,
              }}
            >
              {sourceLabel}
            </button>
          )}
        </div>
      )}
    </GlassCard>
  );
}
