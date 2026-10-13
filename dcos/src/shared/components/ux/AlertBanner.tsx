/**
 * AlertBanner — top-of-page dismissible alerts strip.
 * Addresses ui-uxenhancment.md HP-8, MD3.
 *
 * Used in place of the anti-pattern "Critical Alerts cards at the bottom
 * of dashboards." Renders only when there are alerts; collapses entirely
 * when empty (not a "no alerts" placeholder).
 */

import React, { useMemo, useState } from 'react';
import { VwButton as Button } from '../vw/VwButton';

import { CloseOutlined, AlertOutlined, WarningOutlined, ExclamationCircleOutlined, InfoCircleOutlined, RightOutlined } from '../../icons';
import { UX } from './uxTokens';
import { VwChip } from './VwChip';
import './alert-banner.css';

export type AlertLevel = 'critical' | 'warning' | 'info';

export interface AlertItem {
  id: string;
  level: AlertLevel;
  /** Short label, e.g. "BR-CRN-002 breach". */
  category: string;
  /** Specific message — "3 hubs at capacity". */
  message: string;
  /** Optional click handler → drill-down. */
  onView?: () => void;
  viewLabel?: string;
}

// Desaturated alert palette — banner uses a hairline border in the muted
// neutral system and only the per-row category pill carries the status hue.
// This stops the dashboard from being dominated by a single red banner.
const LEVEL_CFG: Record<AlertLevel, { bg: string; border: string; fg: string; icon: React.ReactNode }> = {
  critical: { bg: '#fef2f2', border: '#fecaca', fg: '#991b1b', icon: <AlertOutlined /> },
  warning:  { bg: '#fffbeb', border: '#fde68a', fg: '#92400e', icon: <WarningOutlined /> },
  info:     { bg: '#eff6ff', border: '#bfdbfe', fg: '#1e40af', icon: <InfoCircleOutlined /> },
};

export interface AlertBannerProps {
  alerts: AlertItem[];
  /** Optional persistence key — dismissals stored in localStorage keyed by this. */
  storageKey?: string;
  /** Force show even if dismissed. */
  forceShow?: boolean;
}

export function AlertBanner({ alerts, storageKey, forceShow }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (!storageKey || forceShow) return new Set();
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`ux.alert.${storageKey}`) : null;
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(() => alerts.filter((a) => !dismissed.has(a.id)), [alerts, dismissed]);
  if (visible.length === 0) return null;

  // Highest-priority level present sets the banner accent.
  const topLevel: AlertLevel = visible.some((a) => a.level === 'critical')
    ? 'critical'
    : visible.some((a) => a.level === 'warning') ? 'warning' : 'info';
  const cfg = LEVEL_CFG[topLevel];

  const dismissOne = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    if (storageKey) {
      try { localStorage.setItem(`ux.alert.${storageKey}`, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
    }
  };

  const dismissAll = () => {
    const next = new Set(alerts.map((a) => a.id));
    setDismissed(next);
    if (storageKey) {
      try { localStorage.setItem(`ux.alert.${storageKey}`, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
    }
  };

  return (
    <div className={`vw-alert alert-banner vw-alert--${topLevel === 'critical' ? 'error' : topLevel}`} style={{ marginBottom: 'var(--vw-page-gap)' }}>
      <span className="vw-alert-icon">{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "var(--vw-font-label-sm)",
          color: cfg.fg,
          fontWeight: 600,
          marginBottom: 6,
        }}>
          {visible.length} alert{visible.length === 1 ? '' : 's'} requiring attention
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--vw-space-xxs)" }}>
          {(expanded ? visible : visible.slice(0, 5)).map((a) => {
            return (
              <div key={a.id} className="alert-banner-row">
                <span className="alert-banner-category"><VwChip variant={a.level === 'critical' ? 'error' : a.level}>
                  {a.category}
                </VwChip></span>
                <span className="alert-banner-message" style={{ fontSize: "var(--vw-font-label-md)", color: UX.slate, minWidth: 0 }}>
                  {a.message}
                </span>
                {a.onView && (
                  <Button
                    className="alert-banner-view"
                    type="link"
                    size="small"
                    onClick={a.onView}
                    style={{ fontSize: "var(--vw-font-label-sm)", padding: 0, height: 'auto' }}
                  >
                    {a.viewLabel || 'View'} <RightOutlined style={{ fontSize: "var(--vw-font-label-xs)" }} />
                  </Button>
                )}
                <Button
                  className="alert-banner-dismiss"
                  aria-label={`Dismiss ${a.category}`}
                  type="text"
                  size="small"
                  icon={<CloseOutlined style={{ fontSize: "var(--vw-font-label-xs)" }} />}
                  onClick={() => dismissOne(a.id)}
                />
              </div>
            );
          })}
          {visible.length > 5 && (
            <Button
              type="link"
              size="small"
              onClick={() => setExpanded((e) => !e)}
              style={{ alignSelf: 'flex-start', fontSize: "var(--vw-font-label-xs)", padding: 0, height: 'auto', marginTop: "var(--vw-space-xxs)" }}
            >
              {expanded
                ? `Show fewer`
                : `+ ${visible.length - 5} more alert${visible.length - 5 === 1 ? '' : 's'}`}
            </Button>
          )}
        </div>
      </div>
      {visible.length > 1 && (
        <Button
          className="alert-banner-dismiss-all"
          size="small"
          type="text"
          onClick={dismissAll}
          style={{ flexShrink: 0, fontSize: "var(--vw-font-label-xs)", color: cfg.fg }}
        >
          Dismiss all
        </Button>
      )}
    </div>
  );
}

export default AlertBanner;
