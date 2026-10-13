/* Small building blocks for the estate sections: a key–value list, muted text, a plain table
   with the house defaults, and a block heading inside a card. */
import type { ReactNode } from 'react';
import type { TableColumnType } from 'antd';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { KV } from '../../../../ops/ui/kit';
import { VwChip } from '../../../../shared/components/ux';

export function Muted({ children, size = 'sm' }: { children: ReactNode; size?: 'xs' | 'sm' }) {
  return <span style={{ fontSize: size === 'xs' ? 'var(--vw-font-label-xs)' : 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)' }}>{children}</span>;
}

/** Compact key–value grid (the ops key–value list used on every record). */
export function KvList({ items, columns = 1 }: { items: Array<{ label: ReactNode; value: ReactNode } | false | null | undefined>; columns?: 1 | 2 | 3 }) {
  const rows = items.filter(Boolean) as Array<{ label: ReactNode; value: ReactNode }>;
  return <KV cols={columns} items={rows.map((it) => [it.label, it.value ?? '—'] as [ReactNode, ReactNode])} />;
}

/** A titled block inside a card: small heading, optional note on the right, then the content. */
export function Block({ title, note, children }: { title: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm" style={{ minWidth: 0 }}>
      <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm" style={{ flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--vw-color-slate-900)' }}>{title}</span>
        {note && <Muted>{note}</Muted>}
      </div>
      {children}
    </div>
  );
}

/** Table on the ops DataTable (same header, row height, pager and hover as every other grid). Column
 *  definitions keep the antd shape so the estate sections read as before. */
export function PlainTable<T extends object>({ rows, columns, rowKey, empty, onRow, pageSize = 10 }: {
  rows: T[]; columns: TableColumnType<T>[]; rowKey: (r: T) => string; empty: string; onRow?: (r: T) => void; pageSize?: number;
}) {
  type Wrapped = { id: string; r: T; i: number };
  const wrapped: Wrapped[] = rows.map((r, i) => ({ id: rowKey(r), r, i }));
  const cols: Col<Wrapped>[] = columns.map((c, n) => {
    const di = Array.isArray(c.dataIndex) ? c.dataIndex.join('.') : c.dataIndex;
    return {
      key: String(c.key ?? di ?? n),
      header: c.title as ReactNode,
      align: c.align === 'right' ? 'right' : undefined,
      width: typeof c.width === 'number' || typeof c.width === 'string' ? c.width : undefined,
      render: (w) => (c.render ? c.render(di ? (w.r as Record<string, unknown>)[String(di)] : undefined, w.r, w.i) as ReactNode : di ? (w.r as Record<string, unknown>)[String(di)] as ReactNode : null),
    };
  });
  return <DataTable<Wrapped> rows={wrapped} cols={cols} pageSize={pageSize} onRow={onRow ? (w) => onRow(w.r) : undefined} empty={<Muted>{empty}</Muted>} />;
}

/** Load against capacity: "120 / 200 kW · 60%", coloured at 80% and 90%. */
export function LoadText({ used, max, unit = 'kW' }: { used: number; max: number; unit?: string }) {
  const pct = max > 0 ? Math.round((used / max) * 100) : 0;
  const color = pct >= 90 ? 'var(--vw-color-red-600)' : pct >= 80 ? 'var(--vw-color-amber-700)' : 'var(--vw-color-slate-900)';
  return <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Math.round(used * 10) / 10} / {Math.round(max * 10) / 10}{unit ? ` ${unit}` : ''} <span style={{ color }}>· {pct}%</span></span>;
}

export const StatusChip = ({ s }: { s?: string }) => !s ? <Muted>—</Muted> : (
  <VwChip variant={/^(Operational|Healthy|Live|Established|Active|Pass)$/.test(s) ? 'success' : /^(Degraded|Maintenance|Planned)$/.test(s) ? 'warning' : /^(Failed|Down|Fail)$/.test(s) ? 'error' : 'neutral'}>{s}</VwChip>
);
