import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { Table as AntTable } from 'antd';
import type { GetRef, TableProps } from 'antd';

const NativeTable = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(function NativeTable(
  { className, ...props }, ref,
) {
  return <table {...props} ref={ref} className={['nst-table', className].filter(Boolean).join(' ')} />;
});

/** Keep rc-table sorting, fixed columns, selection, summaries and native colgroups.
 * A caller-supplied table renderer takes precedence over this visual default. */
export const VwTable = forwardRef<GetRef<typeof AntTable>, TableProps>(function VwTable(
  { components, className, ...props }, ref,
) {
  return <AntTable {...props} ref={ref}
    className={['vw-table-host', className].filter(Boolean).join(' ')}
    components={{ ...components, table: components?.table ?? NativeTable }} />;
}) as unknown as typeof AntTable;

VwTable.Summary = AntTable.Summary;
VwTable.Column = AntTable.Column;
VwTable.ColumnGroup = AntTable.ColumnGroup;
VwTable.EXPAND_COLUMN = AntTable.EXPAND_COLUMN;
VwTable.SELECTION_COLUMN = AntTable.SELECTION_COLUMN;
VwTable.SELECTION_ALL = AntTable.SELECTION_ALL;
VwTable.SELECTION_INVERT = AntTable.SELECTION_INVERT;
VwTable.SELECTION_NONE = AntTable.SELECTION_NONE;
