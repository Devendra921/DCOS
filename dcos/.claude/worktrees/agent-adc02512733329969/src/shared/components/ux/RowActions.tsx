/**
 * RowActions — canonical action cell + column helper for every list table.
 *
 * Today's drift (audited 119 list tables across modules):
 *   - title varies: '' vs 'Actions' vs 'Action'
 *   - width varies: 50 / 60 / 80 / 100
 *   - fixed:'right' set on some, not others
 *   - align:'center' set on some, not others
 *   - some columns use a 3-dot Dropdown, others use inline <Button type="link">
 *   - click handler sometimes stopPropagation, sometimes not (breaks row-click → drill)
 *
 * Canonical shape:
 *   - Empty title (visual quiet)
 *   - Width 56 px
 *   - fixed:'right' (always sticks to viewport edge)
 *   - align:'center'
 *   - 3-dot icon (MoreOutlined)
 *   - Click stops propagation so the row-click handler doesn't fire underneath
 *
 * Usage in a Table columns array:
 *
 *   import { rowActionsColumn } from '@/shared/components/ux';
 *   ...
 *   const columns: ColumnsType<MyRow> = [
 *     { title: 'Code', ... },
 *     ...,
 *     rowActionsColumn<MyRow>((row) => [
 *       { key: 'view',   icon: <EyeOutlined />,    label: 'View',   onClick: () => navigate(`/x/${row.id}`) },
 *       { key: 'edit',   icon: <EditOutlined />,   label: 'Edit',   onClick: () => navigate(`/x/${row.id}/edit`) },
 *       { type: 'divider' },
 *       { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', onClick: () => del(row.id), danger: true },
 *     ]),
 *   ];
 *
 * For pages that prefer a single visible "View" action without a dropdown,
 * pass `mode: 'inline-view'` to render a Link-style button instead.
 */

import React from 'react';
import { Dropdown } from 'antd';
import { VwButton as Button } from '../vw/VwButton';

import type { ItemType, MenuItemType } from 'antd/es/menu/interface';
import { MoreOutlined } from '../../icons';
import type { ColumnType } from 'antd/es/table';

/** Single action item the consumer provides. Matches AntD MenuItem shape with a few canonical extras. */
export interface RowActionItem {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Click handler — receives a synthetic event so consumer can stopPropagation if needed. */
  onClick?: () => void;
  /** Show as red / destructive. */
  danger?: boolean;
  /** Hide this item conditionally (lets the caller compute state-aware menus). */
  hidden?: boolean;
  /** Disabled state. */
  disabled?: boolean;
}

/** A divider between actions. */
export interface RowActionDivider {
  type: 'divider';
  key?: string;
}

export type RowActionsInput = (RowActionItem | RowActionDivider)[];

export interface RowActionsProps<T = unknown> {
  /** Row data (passed to onClick handlers). */
  record: T;
  /** Items factory — keeps closure-light per row. */
  items: RowActionsInput;
}

/** Renders the canonical 3-dot dropdown for a row. */
export function RowActions<T = unknown>({ items }: RowActionsProps<T>) {
  const menuItems: ItemType[] = items
    .filter((it) => !('hidden' in it && it.hidden))
    .map<ItemType>((it) => {
      if ('type' in it && it.type === 'divider') return { type: 'divider', key: it.key };
      const ai = it as RowActionItem;
      return {
        key: ai.key,
        label: ai.label,
        icon: ai.icon,
        danger: ai.danger,
        disabled: ai.disabled,
        onClick: (info) => {
          info.domEvent.stopPropagation();
          ai.onClick?.();
        },
      } as MenuItemType;
    });

  return (
    <Dropdown
      menu={{ items: menuItems }}
      trigger={['click']}
      placement="bottomRight"
    >
      <Button
        type="text"
        size="small"
        icon={<MoreOutlined />}
        onClick={(e) => e.stopPropagation()}
        aria-label="Row actions"
      />
    </Dropdown>
  );
}

/**
 * Column factory — returns a canonical AntD column for a list table's actions cell.
 *
 *   const columns = [
 *     ...,
 *     rowActionsColumn<MyRow>((row) => [
 *       { key: 'view', icon: <EyeOutlined/>, label: 'View', onClick: () => navigate(`/x/${row.id}`) },
 *     ]),
 *   ];
 */
export function rowActionsColumn<T = unknown>(
  items: (record: T) => RowActionsInput,
  override?: Partial<ColumnType<T>>,
): ColumnType<T> {
  return {
    title: '',
    key: '__row_actions__',
    width: 56,
    fixed: 'right' as const,
    align: 'center' as const,
    render: (_: unknown, record: T) => <RowActions<T> record={record} items={items(record)} />,
    ...override,
  };
}
