/* Small presentational pieces shared by the project and programme pages, in the planner's house style:
   a calm summary row, key–value lists, plain nst tables, a thin in-cell bar and the chain trail. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Tabs } from 'antd';

export function Muted({ children, size = 'sm' }: { children: ReactNode; size?: 'xs' | 'sm' }) {
  return <span style={{ fontSize: size === 'xs' ? 'var(--vw-font-label-xs)' : 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)' }}>{children}</span>;
}

export interface Figure { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn' | 'ok' }
/** The five or six figures a reader looks at first, separated by thin rules. */
export function SummaryRow({ items, title = 'Summary', extra }: { items: Figure[]; title?: string; extra?: ReactNode }) {
  return (
    <div className="vw-card-section vw-flex vw-flex-col vw-gap-md">
      <div className="vw-flex vw-items-center vw-justify-between vw-gap-sm">
        <span className="vw-card-title">{title}</span>
        {extra}
      </div>
      <div className="vw-grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((f, i) => {
          const color = f.tone === 'bad' ? 'var(--vw-color-red-600)' : f.tone === 'warn' ? 'var(--vw-color-amber-700)' : f.tone === 'ok' ? 'var(--vw-color-green-700)' : 'var(--vw-color-slate-900)';
          return (
            <div key={f.label} style={{ minWidth: 0, padding: '2px 20px', borderLeft: i ? '1px solid var(--vw-color-slate-200)' : undefined, paddingLeft: i ? 20 : 0 }}>
              <div className="vw-card-metric-label-sub">{f.label}</div>
              <div style={{ fontSize: 'var(--vw-font-value-lg)', fontWeight: 500, color, lineHeight: 1.25, marginTop: 6, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={typeof f.value === 'string' ? f.value : undefined}>{f.value}</div>
              {f.sub && <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.sub}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact key/value grid used inside cards. */
export function KvList({ items, columns = 1 }: { items: { label: ReactNode; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return (
    <div className="vw-grid vw-gap-xs" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: 'var(--vw-space-lg)' }}>
      {items.map((it, i) => (
        <div key={i} className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'minmax(96px, 38%) minmax(0, 1fr)', alignItems: 'baseline', borderBottom: '1px solid var(--vw-color-slate-100)', padding: '6px 0', minWidth: 0 }}>
          <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)' }}>{it.label}</span>
          <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-900)', minWidth: 0, overflowWrap: 'anywhere' }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

export interface Col<R> { key: string; title: ReactNode; render: (r: R) => ReactNode; align?: 'left' | 'right'; width?: number | string; wrap?: boolean }
/** A plain data table (`nst-table`) — the default way to show records on these pages. */
export function DataTable<R>({ rows, cols, rowKey, onRow, empty, groupBy }: {
  rows: R[]; cols: Col<R>[]; rowKey: (r: R) => string; onRow?: (r: R) => void; empty?: ReactNode;
  /** Optional grouping: rows with the same key are shown under a full-width group row. */
  groupBy?: { key: (r: R) => string; label: (key: string, rows: R[]) => ReactNode };
}) {
  if (!rows.length) return <div className="vw-card-description">{empty ?? 'Nothing to show.'}</div>;
  const groups: [string, R[]][] = [];
  if (groupBy) { for (const r of rows) { const k = groupBy.key(r); const g = groups.find((x) => x[0] === k); if (g) g[1].push(r); else groups.push([k, [r]]); } }
  const line = (r: R) => (
    <tr key={rowKey(r)} className={onRow ? 'is-clickable' : undefined} onClick={onRow ? () => onRow(r) : undefined} style={onRow ? { cursor: 'pointer' } : undefined}>
      {cols.map((c) => <td key={c.key} style={{ textAlign: c.align, width: c.width, whiteSpace: c.wrap ? 'normal' : undefined, minWidth: c.wrap ? 120 : undefined, fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : undefined }}>{c.render(r)}</td>)}
    </tr>
  );
  return (
    <div className="nst-table-wrap">
      <table className="nst-table" style={{ width: '100%' }}>
        <thead><tr>{cols.map((c) => <th key={c.key} style={{ textAlign: c.align, width: c.width }}>{c.title}</th>)}</tr></thead>
        <tbody>
          {groupBy
            ? groups.flatMap(([k, rs]) => [
              <tr key={`g:${k}`}><td colSpan={cols.length} style={{ background: 'var(--vw-color-slate-50)', fontWeight: 500, color: 'var(--vw-color-slate-800)', whiteSpace: 'normal' }}>{groupBy.label(k, rs)}</td></tr>,
              ...rs.map(line),
            ])
            : rows.map(line)}
        </tbody>
      </table>
    </div>
  );
}

/** Thin horizontal bar for a value against a maximum, used inside table cells. */
export function Bar({ value, max, over, width = 120 }: { value: number; max: number; over?: boolean; width?: number }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span style={{ display: 'inline-block', width, height: 6, borderRadius: 3, background: 'var(--vw-color-slate-100)', verticalAlign: 'middle' }}>
      <span style={{ display: 'block', width: `${p}%`, height: 6, borderRadius: 3, background: over ? 'var(--vw-color-red-500)' : 'var(--vw-color-blue-500)' }} />
    </span>
  );
}

export interface TrailStep { label: string; code?: string; to?: string; current?: boolean }
/** Where the record sits in the delivery chain: plan → programme → project → work order → change. */
export function ChainTrail({ steps }: { steps: TrailStep[] }) {
  return (
    <nav aria-label="Delivery chain" className="vw-flex vw-items-center vw-wrap" style={{ gap: 6, fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)' }}>
      {steps.map((s, i) => (
        <span key={i} className="vw-inline-flex vw-items-center" style={{ gap: 6 }}>
          {i > 0 && <span aria-hidden>→</span>}
          <span>{s.label}</span>
          {s.to && !s.current ? <Link to={s.to}>{s.code ?? '—'}</Link> : <span style={{ color: s.current ? 'var(--vw-color-slate-900)' : undefined, fontWeight: s.current ? 500 : undefined }}>{s.code ?? 'none'}</span>}
        </span>
      ))}
    </nav>
  );
}

export interface TabItem { key: string; label: string; badge?: ReactNode; children: ReactNode }
/** Every tab visible in one row (no "More" menu); a tighter gutter so twelve tabs fit at 1440 px. */
export function AllTabs({ items, activeKey, onChange }: { items: TabItem[]; activeKey: string; onChange: (key: string) => void }) {
  return (
    <Tabs activeKey={activeKey} onChange={onChange} tabBarGutter={22} destroyOnHidden
      items={items.map((it) => ({
        key: it.key, children: it.children,
        label: (
          <span className="vw-inline-flex vw-items-center" style={{ gap: 6 }}>
            {it.label}
            {it.badge !== undefined && <span style={{ background: 'var(--vw-color-slate-100)', color: 'var(--vw-color-slate-600)', padding: '0 6px', borderRadius: 'var(--vw-radius-sm)', fontSize: 'var(--vw-font-label-xs)', fontWeight: 600, lineHeight: '16px', fontVariantNumeric: 'tabular-nums' }}>{it.badge}</span>}
          </span>
        ),
      }))} />
  );
}
