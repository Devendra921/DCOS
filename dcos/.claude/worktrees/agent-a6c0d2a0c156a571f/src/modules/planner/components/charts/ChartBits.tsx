/**
 * Small presentational pieces shared by the planner charts: the floating tooltip,
 * the legend strip, the empty state and the chart frame. Design-system tokens only.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { TipState } from './chartKit';

export function ChartTip({ tip, width }: { tip: TipState | null; width: number }) {
  if (!tip) return null;
  const flip = tip.x > width * 0.6;
  return (
    <div
      style={{
        position: 'absolute', left: tip.x, top: tip.y, transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`, pointerEvents: 'none', zIndex: 5,
        background: 'var(--vw-color-slate-900)', color: 'var(--vw-color-slate-50)', borderRadius: 'var(--vw-radius-md, 8px)', padding: '6px 10px',
        fontSize: 11, lineHeight: 1.45, boxShadow: 'var(--shadow-sm)', maxWidth: 260, whiteSpace: 'nowrap',
      }}
    >
      {tip.content}
    </div>
  );
}

/** Two-column key/value rows inside a tooltip. */
export function TipRows({ title, rows }: { title?: ReactNode; rows: [ReactNode, ReactNode][] }) {
  return (
    <div>
      {title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>}
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
          <span style={{ opacity: 0.75 }}>{k}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export type LegendKind = 'swatch' | 'line' | 'dash' | 'hatch' | 'diamond' | 'dot';
export interface LegendItem { label: string; color: string; kind?: LegendKind; muted?: boolean }

export function Legend({ items, style }: { items: LegendItem[]; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 11, color: 'var(--vw-color-slate-600)', ...style }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: it.muted ? 0.6 : 1 }}>
          <LegendMark color={it.color} kind={it.kind ?? 'swatch'} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function LegendMark({ color, kind }: { color: string; kind: LegendKind }) {
  const base: CSSProperties = { display: 'inline-block', flex: 'none' };
  switch (kind) {
    case 'line': return <span style={{ ...base, width: 16, height: 0, borderTop: `2px solid ${color}` }} />;
    case 'dash': return <span style={{ ...base, width: 16, height: 0, borderTop: `2px dashed ${color}` }} />;
    case 'hatch': return <span style={{ ...base, width: 12, height: 12, borderRadius: 3, background: `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 5px)`, border: `1px solid ${color}` }} />;
    case 'diamond': return <span style={{ ...base, width: 9, height: 9, background: color, transform: 'rotate(45deg)', borderRadius: 1 }} />;
    case 'dot': return <span style={{ ...base, width: 10, height: 10, borderRadius: 5, background: color }} />;
    default: return <span style={{ ...base, width: 12, height: 12, borderRadius: 3, background: color }} />;
  }
}

export function ChartEmpty({ title, hint, height = 160 }: { title: string; hint?: string; height?: number }) {
  return (
    <div className="vw-card-child-shaded" style={{ minHeight: height, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 'var(--vw-space-lg)' }}>
      <div>
        <div style={{ width: 36, height: 36, margin: '0 auto 8px', borderRadius: 10, border: '1px dashed var(--vw-color-slate-300)', display: 'grid', placeItems: 'center', color: 'var(--vw-color-slate-400)', fontSize: 16 }}>∅</div>
        <div className="vw-card-title-sm" style={{ color: 'var(--vw-color-slate-700)' }}>{title}</div>
        {hint && <div className="vw-card-description" style={{ fontSize: 12, maxWidth: 320 }}>{hint}</div>}
      </div>
    </div>
  );
}

/** Caption line under a chart. */
export function ChartNote({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 11, color: 'var(--vw-color-slate-500)', ...style }}>{children}</div>;
}
