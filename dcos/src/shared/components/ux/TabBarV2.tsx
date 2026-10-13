/**
 * TabBarV2 — canonical detail-page tab bar with hard cap.
 *
 * Addresses ui-uxenhancment.md HP-4 / D1 "Tab count creep > 7":
 *   - Caps primary tabs at TAB_PRIMARY_CAP (6 by default).
 *   - Anything past the cap collapses into a "More ▾" dropdown.
 *   - Active state is preserved across overflow — if the selected tab is in
 *     overflow, the "More" trigger renders with the active style.
 *
 * Built on `Tabs` for visual consistency with the rest of the platform; this
 * wrapper only enforces the cap and the overflow contract.
 */

import React, { useMemo } from 'react';
import { Tabs, Dropdown } from 'antd';
import { DownOutlined } from '../../icons';
import type { ItemType } from 'antd/es/menu/interface';
import { UX } from './uxTokens';
import { TAB_PRIMARY_CAP } from './uxTokens';

export interface TabV2Item {
  key: string;
  label: React.ReactNode;
  /** Tab body content (rendered when active). */
  children?: React.ReactNode;
  /** Optional badge (e.g. count of items in that tab). */
  badge?: React.ReactNode;
  /** Disable the tab. */
  disabled?: boolean;
  /** Optional icon rendered before the label. */
  icon?: React.ReactNode;
}

export interface TabBarV2Props {
  items: TabV2Item[];
  activeKey: string;
  onChange: (key: string) => void;
  /** Override the cap (default 6 per uxTokens). */
  primaryCap?: number;
  /** Tab bar visual style — 'line' (default) or 'card'. */
  type?: 'line' | 'card';
  /** Extra content rendered on the right of the tab strip. */
  tabBarExtraContent?: React.ReactNode;
  /**
   * Optional key to visually pre-highlight as the *suggested* item inside the
   * "More ▾" dropdown when the active page tab is NOT in overflow. Purely a
   * menu-level hint — does not change `activeKey` or the rendered tab body.
   * If the active tab IS in overflow, the actually-active key wins.
   */
  defaultOverflowKey?: string;
  /** Optional className. */
  className?: string;
}

export function TabBarV2({
  items,
  activeKey,
  onChange,
  primaryCap = TAB_PRIMARY_CAP,
  type = 'line',
  tabBarExtraContent,
  defaultOverflowKey,
  className,
}: TabBarV2Props) {
  const { primary, overflow } = useMemo(() => {
    if (items.length <= primaryCap) {
      return { primary: items, overflow: [] as TabV2Item[] };
    }
    return {
      primary: items.slice(0, primaryCap - 1),  // leave 1 slot for "More"
      overflow: items.slice(primaryCap - 1),
    };
  }, [items, primaryCap]);

  const activeInOverflow = overflow.some((it) => it.key === activeKey);
  const activeItem = items.find((it) => it.key === activeKey);

  // Build Ant tabs items
  const antItems = useMemo(() => {
    const arr = primary.map<{ key: string; label: React.ReactNode; disabled?: boolean; children?: React.ReactNode }>((it) => ({
      key: it.key,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {it.icon}
          <span>{it.label}</span>
          {it.badge !== undefined && (
            <span
              style={{
                background: "var(--vw-color-slate-100)",
                color: UX.muted,
                padding: '0 6px',
                borderRadius: "var(--vw-radius-sm)",
                fontSize: "var(--vw-font-label-xs)",
                fontWeight: 600,
                lineHeight: '16px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {it.badge}
            </span>
          )}
        </span>
      ),
      disabled: it.disabled,
      children: it.children,
    }));

    // Append synthetic "More" tab if overflow exists
    if (overflow.length > 0) {
      // ── Dropdown menu — uses a menu-level `onClick` (more reliable than
      //    per-item onClick in Antd v5 menus) and stops propagation on the
      //    trigger span so the click doesn't race with Ant Tabs' own
      //    tab-click handler (which would fire onChange with the synthetic
      //    key '__more__' on the way up and could swallow the menu click in
      //    some renders).
      // Pre-highlighted overflow item in the dropdown menu:
      //   - If active tab is in overflow → highlight the actually-active key
      //     (so the user sees which overflow tab is currently rendering).
      //   - Otherwise → highlight `defaultOverflowKey` if provided and present
      //     in the overflow set (purely a "suggested next step" hint).
      const menuSelectedKey = activeInOverflow
        ? activeKey
        : (defaultOverflowKey && overflow.some((it) => it.key === defaultOverflowKey) ? defaultOverflowKey : undefined);
      const moreLabel = (
        <Dropdown
          trigger={['click']}
          menu={{
            items: overflow.map<ItemType>((it) => ({
              key: it.key,
              label: it.label,
              icon: it.icon,
              disabled: it.disabled,
            })),
            selectedKeys: menuSelectedKey ? [menuSelectedKey] : [],
            onClick: (info) => {
              // info.domEvent may be undefined when the menu is closed by Esc
              info.domEvent?.stopPropagation?.();
              onChange(info.key as string);
            },
          }}
          placement="bottomRight"
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: "var(--vw-space-xxs)",
              cursor: 'pointer',
              color: activeInOverflow ? UX.blue : UX.slate,
              fontWeight: activeInOverflow ? 600 : undefined,
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {activeInOverflow && activeItem ? <>{activeItem.label}</> : <>More</>}
            <DownOutlined style={{ fontSize: 11 }} />
            {overflow.length > 0 && !activeInOverflow && (
              <span
                style={{
                  background: "var(--vw-color-slate-100)",
                  color: UX.muted,
                  padding: '0 5px',
                  borderRadius: "var(--vw-radius-sm)",
                  fontSize: 11,
                  fontWeight: 600,
                  lineHeight: '15px',
                }}
              >
                {overflow.length}
              </span>
            )}
          </span>
        </Dropdown>
      );

      arr.push({
        key: activeInOverflow ? activeKey : '__more__',
        label: moreLabel,
        children: activeInOverflow ? activeItem?.children : null,
      });
    }

    return arr;
  }, [primary, overflow, activeInOverflow, activeItem, activeKey, onChange]);

  return (
    <Tabs
      type={type}
      activeKey={activeKey}
      // Clicking the synthetic "More" tab strip itself must NOT switch content —
      // only its dropdown items (which carry real keys) drive onChange. Swallow
      // the placeholder '__more__' key so the dropdown can open cleanly.
      onChange={(k) => { if (k !== '__more__') onChange(k); }}
      items={antItems}
      tabBarExtraContent={tabBarExtraContent}
      className={className}
    />
  );
}
