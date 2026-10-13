/* Small visual pieces shared by the planner hub, templates and benchmarks pages: status chips,
   SVG bar lists, range bars and share bars. Data helpers live in model.ts. */
import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { VwChip } from '../../../../shared/components/ux';
import { useVwPalette } from '../../../site360/lib/siteModel';
import type * as T from '../../../../mock/data/types';
import { TEMPLATE_STATUS_TONE, SEVERITY_TONE, fmtNum } from './model';

export function TemplateStatusChip({ status }: { status: T.PlannerTemplate['status'] }) { return <VwChip variant={TEMPLATE_STATUS_TONE[status]}>{status[0].toUpperCase()}{status.slice(1)}</VwChip>; }
export function SeverityChip({ severity }: { severity: T.PlannerRuleSeverity }) { return <VwChip variant={SEVERITY_TONE[severity]}>{severity === 'hard' ? 'Hard' : 'Soft'}</VwChip>; }


/** Horizontal bar list: one row per item, a bar for each series normalised to the series maximum.
 *  Plain HTML so its text keeps the app's 12–13px sizes at any card width. */
export interface BarSeries { key: string; label: string; color: string; format: (v: number) => string }
export function BarRows({ items, series, rowHeight = 30, labelWidth = 150, valueWidth = 70 }: { items: { label: string; values: Record<string, number>; onClick?: () => void }[]; series: BarSeries[]; rowHeight?: number; labelWidth?: number; valueWidth?: number }) {
  const max: Record<string, number> = {}; for (const s of series) max[s.key] = Math.max(1, ...items.map(i => i.values[s.key] ?? 0));
  if (!items.length) return <div className="vw-card-description">Nothing to show yet.</div>;
  const cols = `${labelWidth}px minmax(0, 1fr) ${series.map(() => `${valueWidth}px`).join(' ')}`;
  return (
    <div className="bar-rows" role="img" aria-label="Bar chart">
      <div className="bar-rows-legend" style={{ paddingLeft: labelWidth + 12 }}>
        {series.map(s => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
      {items.map(it => {
        const Row = it.onClick ? 'button' : 'div';
        return (
          <Row key={it.label} {...(it.onClick ? { type: 'button' as const, onClick: it.onClick } : {})} className={`bar-rows-row${it.onClick ? ' is-click' : ''}`} style={{ gridTemplateColumns: cols, minHeight: rowHeight }}>
            <span className="bar-rows-name" title={it.label}>{it.label}</span>
            <span className="bar-rows-tracks">
              {series.map(s => {
                const v = it.values[s.key] ?? 0;
                return <span key={s.key} className="bar-rows-track"><i style={{ width: `${v > 0 ? Math.max(1, (v / max[s.key]) * 100) : 0}%`, background: s.color }} /></span>;
              })}
            </span>
            {series.map(s => <b key={s.key} className="bar-rows-val" style={{ color: s.color }}>{s.format(it.values[s.key] ?? 0)}</b>)}
          </Row>
        );
      })}
    </div>
  );
}

/** low–value–high range drawn on a shared axis (0 to `max`). */
export function RangeBar({ low, value, high, max, width = 140, unit }: { low?: number; value?: number; high?: number; max: number; width?: number; unit?: string }) {
  const pal = useVwPalette();
  const x = (n: number) => Math.max(0, Math.min(width, (n / Math.max(1e-9, max)) * width));
  const lo = low ?? value ?? 0, hi = high ?? value ?? 0;
  const tip = `${low !== undefined ? `low ${fmtNum(low)} · ` : ''}${value !== undefined ? `value ${fmtNum(value)}` : ''}${high !== undefined ? ` · high ${fmtNum(high)}` : ''}${unit ? ` ${unit}` : ''}`;
  return (
    <Tooltip title={tip}>
      <svg width={width} height={14} viewBox={`0 0 ${width} 14`} role="img" aria-label={tip} style={{ display: 'block' }}>
        <rect x={0} y={5} width={width} height={4} rx={2} fill={pal.grid} />
        {hi > lo && <rect x={x(lo)} y={5} width={Math.max(2, x(hi) - x(lo))} height={4} rx={2} fill={pal.blueLight} />}
        {value !== undefined && <rect x={x(value) - 1.5} y={1} width={3} height={12} rx={1} fill={pal.blue} />}
      </svg>
    </Tooltip>
  );
}

/** A labelled percentage bar (accuracy, readiness, shares). */
export function PctBar({ pct, color, label, height = 8 }: { pct: number; color?: string; label?: ReactNode; height?: number }) {
  const pal = useVwPalette();
  return (
    <div className="vw-flex vw-items-center vw-gap-sm" style={{ minWidth: 0 }}>
      <div style={{ flex: 1, height, borderRadius: height / 2, background: pal.grid, overflow: 'hidden', minWidth: 60 }}><div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color ?? pal.blue, borderRadius: height / 2 }} /></div>
      {label !== undefined && <span style={{ fontSize: 'var(--vw-font-label-xs)', whiteSpace: 'nowrap', minWidth: 36, textAlign: 'right' }}>{label}</span>}
    </div>
  );
}

/** Stacked share bar (e.g. GPU / compute / storage mix). */
export function StackBar({ parts, height = 14 }: { parts: { label: string; pct: number; color: string }[]; height?: number }) {
  return (
    <div className="vw-flex vw-flex-col vw-gap-xs">
      <div className="vw-flex" style={{ height, borderRadius: height / 2, overflow: 'hidden' }}>{parts.filter(p => p.pct > 0).map(p => <Tooltip key={p.label} title={`${p.label} ${p.pct}%`}><div style={{ width: `${p.pct}%`, background: p.color }} /></Tooltip>)}</div>
      <div className="vw-flex vw-gap-md vw-wrap">{parts.map(p => <span key={p.label} className="vw-flex vw-items-center vw-gap-xs" style={{ fontSize: 'var(--vw-font-label-xs)' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />{p.label} {p.pct}%</span>)}</div>
    </div>
  );
}

