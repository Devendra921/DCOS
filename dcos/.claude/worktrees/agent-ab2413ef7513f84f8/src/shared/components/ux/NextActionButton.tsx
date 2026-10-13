/**
 * NextActionButton — canonical state-derived primary CTA for workflow detail pages.
 *
 * Addresses ui-uxenhancment.md HP-7 / 13.2 "Status-machine transitions scattered across tab buttons":
 *   - Consumer passes the current state + an ordered list of valid transitions.
 *   - The component renders ONE primary CTA (the "next" action) + an overflow
 *     menu for additional valid transitions (e.g. Reject, Withdraw).
 *
 * Designed to be embedded inside `DetailPageHeader`'s `actions` array, or
 * placed inline above tab content on workflow pages (Punch Item, Co-location
 * Request, Migration, Closeout, Decommissioning).
 */

import React from 'react';
import { Dropdown, Tooltip } from 'antd';
import { VwButton as Button } from '../vw/VwButton';

import { ArrowRightOutlined, MoreOutlined } from '../../icons';
import type { ItemType, MenuItemType } from 'antd/es/menu/interface';
import { UX } from './uxTokens';

export interface NextActionTransition {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
  /** Marks the transition as the "next" forward action. Exactly one expected. */
  primary?: boolean;
  /** Destructive transition (Reject, Withdraw, Terminate). */
  danger?: boolean;
  /** Disabled with tooltip explaining why. */
  disabled?: boolean;
  /** Hide entirely. */
  hidden?: boolean;
  /** Tooltip on hover. */
  tooltip?: string;
}

export interface NextActionButtonProps {
  /** Current workflow state label, shown next to the primary CTA. */
  stateLabel?: React.ReactNode;
  /** Ordered list of valid transitions for the current state. */
  transitions: NextActionTransition[];
  /** Display mode — inline (default) or compact (icon-only secondary). */
  mode?: 'inline' | 'compact';
}

export function NextActionButton({ stateLabel, transitions, mode = 'inline' }: NextActionButtonProps) {
  const visible = transitions.filter((t) => !t.hidden);
  const primary = visible.find((t) => t.primary) ?? visible[0];
  const secondary = visible.filter((t) => t !== primary);

  if (!primary) {
    return null;
  }

  const overflowItems: ItemType[] = secondary.map<ItemType>((t) => ({
    key: t.key,
    label: t.label,
    icon: t.icon,
    danger: t.danger,
    disabled: t.disabled,
    onClick: () => t.onClick(),
  } as MenuItemType));

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: "var(--vw-space-sm)" }}>
      {stateLabel && mode === 'inline' && (
        <span
          style={{
            fontSize: "var(--vw-font-label-xs)",
            color: UX.muted,
            fontWeight: 400,
          }}
        >
          {stateLabel}
          <span style={{ margin: '0 8px', color: UX.border }}>→</span>
        </span>
      )}
      <Tooltip title={primary.tooltip}>
        <Button
          type="primary"
          icon={primary.icon ?? <ArrowRightOutlined />}
          disabled={primary.disabled}
          danger={primary.danger}
          onClick={primary.onClick}
          style={
            primary.danger
              ? undefined
              : {
                  background: UX.slate,
                  borderColor: UX.slate,
                }
          }
        >
          {primary.label}
        </Button>
      </Tooltip>
      {overflowItems.length > 0 && (
        <Dropdown
          menu={{ items: overflowItems }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            icon={<MoreOutlined />}
            aria-label="More transitions"
            title={`${overflowItems.length} more transition${overflowItems.length > 1 ? 's' : ''}`}
          >
            {mode === 'inline' && (
              <span style={{ fontSize: "var(--vw-font-label-xs)", color: UX.muted, marginLeft: "var(--vw-space-xxs)" }}>+{overflowItems.length}</span>
            )}
          </Button>
        </Dropdown>
      )}
    </div>
  );
}
