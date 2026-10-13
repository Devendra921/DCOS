/**
 * EmptyState — structured empty states for list pages.
 * Addresses ui-uxenhancment.md L7, MP-4.
 *
 * Three variants:
 *   - `no-data`     → no records yet, suggests creation.
 *   - `no-results`  → filters returned nothing, suggests clearing.
 *   - `loading`     → skeleton-style placeholder.
 *
 * Why this beats Ant's `<Empty />`: gives users a *next step*, not just
 * a "no data" icon.
 */

import React from 'react';
import { Skeleton } from 'antd';
import { VwButton as Button } from '../vw/VwButton';

import { InboxOutlined, FilterOutlined, PlusOutlined, ReloadOutlined } from '../../icons';

export interface EmptyStateProps {
  variant?: 'no-data' | 'no-results' | 'loading';
  /** What the user is looking at — "leases", "hubs", "audits". */
  entity?: string;
  /** Lead heading. Auto-generated if omitted. */
  title?: string;
  /** Suggestion / next-step microcopy. */
  description?: string;
  /** Primary CTA — e.g. "+ New Lease". */
  primaryAction?: { label: string; onClick: () => void; icon?: React.ReactNode };
  /** Secondary CTA — e.g. "Clear filters". */
  secondaryAction?: { label: string; onClick: () => void; icon?: React.ReactNode };
  /** Custom illustration / icon. */
  icon?: React.ReactNode;
}

export function EmptyState({
  variant = 'no-data',
  entity,
  title,
  description,
  primaryAction,
  secondaryAction,
  icon,
}: EmptyStateProps) {
  if (variant === 'loading') {
    return (
      <div style={{ padding: "var(--vw-space-2xl)" }}>
        <Skeleton active paragraph={{ rows: 4 }} />
        <div style={{ marginTop: "var(--vw-space-lg)" }}>
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
      </div>
    );
  }

  const noResults = variant === 'no-results';
  const resolvedTitle = title
    ?? (noResults
      ? `No ${entity || 'records'} match your filters`
      : `No ${entity || 'records'} yet`);
  const resolvedDescription = description
    ?? (noResults
      ? 'Try clearing one or more filters to broaden the search.'
      : `When you create your first ${entity ? entity.replace(/s$/, '') : 'record'}, it will appear here.`);
  const resolvedIcon = icon ?? (noResults
    ? <FilterOutlined style={{ fontSize: 40 }} />
    : <InboxOutlined style={{ fontSize: 40 }} />);

  return (
    <div className="vw-empty vw-empty--page">
      <span className="vw-empty-icon">{resolvedIcon}</span>
      <div className="vw-card-title">{resolvedTitle}</div>
      <div className="vw-card-description" style={{ maxWidth: 420 }}>{resolvedDescription}</div>
      {(primaryAction || secondaryAction) && <div className="dcos-empty-actions">
        {primaryAction && (
          <Button
            type="primary"
            icon={primaryAction.icon ?? (noResults ? <ReloadOutlined /> : <PlusOutlined />)}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Button>
        )}
        {secondaryAction && (
          <Button
            icon={secondaryAction.icon}
            onClick={secondaryAction.onClick}
          >
            {secondaryAction.label}
          </Button>
        )}
      </div>}
    </div>
  );
}

export default EmptyState;
