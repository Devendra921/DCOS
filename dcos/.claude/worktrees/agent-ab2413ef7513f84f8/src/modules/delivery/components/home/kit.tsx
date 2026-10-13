/* Small building blocks for the delivery home, the work order list and the work order page,
   in the planner's house style: one calm summary row, plain tables, key–value lists. */
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { VwCard } from '../../../../shared/components/ux';

/* ------------------------------------------------------------------ summary row */
export interface SummaryItem { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn' | 'ok'; to?: string }

/** One row of 5–6 figures with separators, like the planner's plan summary. */
export function SummaryRow({ items }: { items: SummaryItem[] }) {
  const navigate = useNavigate();
  return (
    <div className="vw-card-section" style={{ padding: '14px 20px' }}>
      <div className="vw-grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it, i) => {
          const color = it.tone === 'bad' ? 'var(--vw-color-red-600)' : it.tone === 'warn' ? 'var(--vw-color-amber-700)' : it.tone === 'ok' ? 'var(--vw-color-green-700)' : 'var(--vw-color-slate-900)';
          const go = it.to ? () => navigate(it.to!) : undefined;
          return (
            <div key={it.label} onClick={go} role={go ? 'link' : undefined} tabIndex={go ? 0 : undefined} onKeyDown={go ? e => { if (e.key === 'Enter') go(); } : undefined}
              style={{ minWidth: 0, padding: '2px 20px', paddingLeft: i ? 20 : 0, borderLeft: i ? '1px solid var(--vw-color-slate-200)' : undefined, cursor: go ? 'pointer' : undefined }}>
              <div className="vw-card-metric-label-sub">{it.label}</div>
              <div style={{ fontSize: 'var(--vw-font-value-lg)', fontWeight: 500, color, lineHeight: 1.25, marginTop: 6, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.value}</div>
              {it.sub && <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tables */
export interface Col<R> {
  key: string; title: ReactNode; render: (r: R) => ReactNode;
  align?: 'left' | 'right' | 'center'; width?: number | string;
  /** Let long text wrap (cells do not wrap by default). */
  wrap?: boolean; minWidth?: number;
}

/** A plain `nst-table` with optional row links and a "show all" toggle past `limit` rows. */
export function DataTable<R>({ rows, cols, rowKey, to, limit, empty }: { rows: R[]; cols: Col<R>[]; rowKey: (r: R) => string; to?: (r: R) => string | undefined; limit?: number; empty?: ReactNode }) {
  const navigate = useNavigate();
  const [all, setAll] = useState(false);
  if (!rows.length) return <div className="vw-card-description">{empty ?? 'Nothing to show.'}</div>;
  const shown = limit && !all ? rows.slice(0, limit) : rows;
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <div className="nst-table-wrap">
        <table className="nst-table" style={{ width: '100%' }}>
          <thead><tr>{cols.map(c => <th key={c.key} style={{ textAlign: c.align, width: c.width }}>{c.title}</th>)}</tr></thead>
          <tbody>{shown.map(r => {
            const href = to?.(r);
            return (
              <tr key={rowKey(r)} className={href ? 'is-clickable' : undefined} onClick={href ? e => { if (!(e.target as HTMLElement).closest('a,button,input,.ant-select')) navigate(href); } : undefined}>
                {cols.map(c => <td key={c.key} style={{ textAlign: c.align, whiteSpace: c.wrap ? 'normal' : undefined, minWidth: c.minWidth }}>{c.render(r)}</td>)}
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {limit && rows.length > limit && (
        <button type="button" className="nst-btn nst-btn--ghost nst-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(v => !v)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

/** A card holding one table, with a short note under the title when the numbers need explaining. */
export function TableCard({ title, extra, note, children }: { title: ReactNode; extra?: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <VwCard title={title} extra={extra}>
      <div className="vw-flex vw-flex-col vw-gap-sm">
        {note && <div className="vw-card-description" style={{ color: 'var(--vw-color-slate-500)' }}>{note}</div>}
        {children}
      </div>
    </VwCard>
  );
}

/* ------------------------------------------------------------------ small pieces */
export function Muted({ children, size = 'sm' }: { children: ReactNode; size?: 'xs' | 'sm' }) {
  return <span style={{ fontSize: size === 'xs' ? 'var(--vw-font-label-xs)' : 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)' }}>{children}</span>;
}

/** Primary text with a muted second line. */
export function TwoLine({ main, sub, to }: { main: ReactNode; sub?: ReactNode; to?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: 'var(--vw-color-slate-900)' }}>{to ? <Link to={to}>{main}</Link> : main}</div>
      {sub && <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)' }}>{sub}</div>}
    </div>
  );
}

/** Spend (or progress) bar for a table row: a filled share, an optional marker, the figure beside it. */
export function ShareBar({ pct, marker, tone, label }: { pct: number; marker?: number; tone?: 'bad' | 'warn'; label?: ReactNode }) {
  const fill = tone === 'bad' ? 'var(--vw-color-red-500)' : tone === 'warn' ? 'var(--vw-color-amber-500)' : 'var(--vw-color-blue-500)';
  return (
    <div className="vw-flex vw-items-center vw-gap-sm" style={{ minWidth: 160 }}>
      <div style={{ position: 'relative', flex: 1, height: 8, borderRadius: 4, background: 'var(--vw-color-slate-100)' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: 8, borderRadius: 4, background: fill }} />
        {marker !== undefined && <div title={`${Math.round(marker)}% of the work done`} style={{ position: 'absolute', top: -3, left: `calc(${Math.max(0, Math.min(100, marker))}% - 1px)`, width: 2, height: 14, background: 'var(--vw-color-slate-700)' }} />}
      </div>
      <span style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--vw-color-slate-700)' }}>{label ?? `${Math.round(pct)}%`}</span>
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

/** Where a record sits in the delivery chain: plan → programme → project → work order → change. */
export interface ChainLink { kind: string; id?: string; label?: string; to?: string; current?: boolean }
export function ChainTrail({ links }: { links: ChainLink[] }) {
  return (
    <nav aria-label="Delivery chain" className="vw-flex vw-items-center vw-wrap" style={{ gap: 6, fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)' }}>
      {links.map((l, i) => (
        <span key={l.kind} className="vw-inline-flex vw-items-center" style={{ gap: 6, minWidth: 0 }}>
          {i > 0 && <span aria-hidden>→</span>}
          <span>{l.kind}</span>
          {l.id
            ? (l.to && !l.current ? <Link to={l.to} title={l.label}>{l.id}</Link> : <span style={{ color: 'var(--vw-color-slate-900)', fontWeight: 500 }} title={l.label}>{l.id}</span>)
            : <span style={{ color: 'var(--vw-color-slate-400)' }}>none</span>}
        </span>
      ))}
    </nav>
  );
}
