/**
 * Change overview charts, in the delivery overview's style: plain SVG measured to its container,
 * design tokens only, one idea per chart, a tooltip on every mark. Bar lists are plain rows that
 * link to the filtered Changes tab.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { scaleBand, scaleLinear } from 'd3-scale';
import { useVwPalette } from '../../../site360/lib/siteModel';
import { useMeasuredWidth, useTip } from '../../../planner/components/charts/chartKit';
import { ChartTip, TipRows } from '../../../planner/components/charts/ChartBits';
import type { Board, LeadWeek, Stage } from '../../lib/overview';

const AXIS = { fontSize: 11, fill: 'var(--vw-color-slate-500)' } as const;
const M = { top: 10, right: 16, bottom: 26, left: 40 };
const niceMax = (v: number) => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(k => n <= k) ?? 10) * p; };
const dayTxt = (n: number | null) => (n === null ? '—' : `${n < 10 ? n.toFixed(1) : Math.round(n)} d`);

/* ------------------------------------------------------------------ lead time (stacked medians) */
/** Median days from submission to approval and from approval to implementation, per week. */
export function LeadTimeChart({ weeks, height = 230 }: { weeks: LeadWeek[]; height?: number }) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth(600);
  const { tip, show, hide } = useTip(wrapRef);
  const iw = Math.max(120, width - M.left - M.right), ih = height - M.top - M.bottom;
  const x = useMemo(() => scaleBand<number>().domain(weeks.map((_, i) => i)).range([0, iw]).paddingInner(0.35).paddingOuter(0.15), [weeks, iw]);
  const max = niceMax(Math.max(1, ...weeks.map(w => (w.approveDays ?? 0) + (w.implementDays ?? 0))));
  const y = scaleLinear().domain([0, max]).range([ih, 0]);
  const every = Math.ceil(weeks.length / Math.max(1, Math.floor(iw / 64)));
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} onMouseLeave={hide}>
      <svg width={width} height={height} role="img" aria-label="Median days to approve and to implement normal changes, per week">
        <g transform={`translate(${M.left},${M.top})`}>
          {y.ticks(4).map(v => <g key={v}><line x1={0} x2={iw} y1={y(v)} y2={y(v)} stroke={p.grid} /><text x={-8} y={y(v)} dy="0.32em" textAnchor="end" {...AXIS}>{v} d</text></g>)}
          {weeks.map((w, i) => {
            const a = w.approveDays ?? 0, b = w.implementDays ?? 0;
            return (
              <g key={w.start} onMouseMove={e => show(e, <TipRows title={`Week of ${w.label}`} rows={w.n ? [['Normal changes implemented', w.n], ['Submitted to approved', dayTxt(w.approveDays)], ['Approved to implemented', dayTxt(w.implementDays)], ['Submitted to implemented', dayTxt(w.totalDays)]] : [['Normal changes implemented', 0]]} />)}>
                <rect x={x(i)! - x.step() * 0.15} y={0} width={x.step()} height={ih} fill="transparent" />
                {w.n > 0 && a > 0 && <rect x={x(i)} y={y(a)} width={x.bandwidth()} height={ih - y(a)} fill={p.blue} />}
                {w.n > 0 && b > 0 && <rect x={x(i)} y={y(a + b)} width={x.bandwidth()} height={y(a) - y(a + b)} fill={p.blueLight} />}
                {i % every === 0 && <text x={x(i)! + x.bandwidth() / 2} y={ih + 16} textAnchor="middle" {...AXIS}>{w.label}</text>}
              </g>
            );
          })}
        </g>
      </svg>
      <ChartTip tip={tip} width={width} />
    </div>
  );
}

/* ------------------------------------------------------------------ change board load */
/** Normal changes heard at each weekly change board and how they were decided; the last bar is the next board's agenda. */
export function BoardChart({ boards, height = 170, nextTo }: { boards: Board[]; height?: number; nextTo?: string }) {
  const p = useVwPalette();
  const navigate = useNavigate();
  const [wrapRef, width] = useMeasuredWidth(500);
  const { tip, show, hide } = useTip(wrapRef);
  const iw = Math.max(120, width - M.left - M.right), ih = height - M.top - M.bottom;
  const x = useMemo(() => scaleBand<number>().domain(boards.map((_, i) => i)).range([0, iw]).paddingInner(0.35).paddingOuter(0.15), [boards, iw]);
  const max = niceMax(Math.max(1, ...boards.map(b => b.heard)));
  const y = scaleLinear().domain([0, max]).range([ih, 0]);
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} onMouseLeave={hide}>
      <svg width={width} height={height} role="img" aria-label="Normal changes heard at each change board">
        <g transform={`translate(${M.left},${M.top})`}>
          {y.ticks(3).map(v => <g key={v}><line x1={0} x2={iw} y1={y(v)} y2={y(v)} stroke={p.grid} /><text x={-8} y={y(v)} dy="0.32em" textAnchor="end" {...AXIS}>{v}</text></g>)}
          {boards.map((b, i) => {
            let acc = 0;
            const seg = (n: number, col: string, k: string) => { if (!n) return null; const y0 = y(acc), y1 = y(acc + n); acc += n; return <rect key={k} x={x(i)} y={y1} width={x.bandwidth()} height={y0 - y1} fill={col} />; };
            const go = b.next && nextTo ? () => navigate(nextTo) : undefined;
            const rows: [string, number][] = b.next
              ? [['On the agenda', b.heard], ['Carried over from earlier boards', b.carried], ['High or critical risk', b.high], ['With policy warnings', b.violations]]
              : [['Heard', b.heard], ['Approved', b.approved], ['Rejected', b.rejected], ['Still waiting', b.carried], ['High or critical risk', b.high], ['With policy warnings', b.violations]];
            return (
              <g key={b.date} onMouseMove={e => show(e, <TipRows title={`${b.next ? 'Next board' : 'Board'} · Thu ${b.label}`} rows={rows} />)} onClick={go} style={go ? { cursor: 'pointer' } : undefined}>
                <rect x={x(i)! - x.step() * 0.15} y={0} width={x.step()} height={ih} fill="transparent" />
                {b.next
                  ? b.heard > 0 && <rect x={x(i)} y={y(b.heard)} width={x.bandwidth()} height={ih - y(b.heard)} fill={p.amber} />
                  : <>{seg(b.approved, p.blue, 'a')}{seg(b.rejected, p.red, 'r')}{seg(Math.max(0, b.heard - b.approved - b.rejected), p.slateLight, 'o')}</>}
                {b.next && b.high > 0 && <text x={x(i)! + x.bandwidth() / 2} y={y(b.heard) - 4} textAnchor="middle" {...AXIS} fontWeight={600} fill="var(--vw-color-slate-700)">{b.high} high</text>}
                <text x={x(i)! + x.bandwidth() / 2} y={ih + 16} textAnchor="middle" {...AXIS} fontWeight={b.next ? 600 : 400}>{b.next ? 'Next' : b.label}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <ChartTip tip={tip} width={width} />
    </div>
  );
}

/* ------------------------------------------------------------------ bar rows */
export interface BarSeg { value: number; color: string; label: string }
export interface BarRow { key: string; label: ReactNode; sub?: ReactNode; title?: string; segs: BarSeg[]; right: ReactNode; to?: string }
/** Rows of horizontal bars (label · bar · figure), each optionally linking somewhere. */
export function BarList({ rows, limit = 8, empty, labelWidth = 'minmax(0, 1.1fr)', rightWidth = 120 }: { rows: BarRow[]; limit?: number; empty?: ReactNode; labelWidth?: string; rightWidth?: number }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <div className="vw-card-description">{empty ?? 'Nothing to show.'}</div>;
  const max = Math.max(1, ...rows.map(r => r.segs.reduce((a, s) => a + s.value, 0)));
  const shown = all ? rows : rows.slice(0, limit);
  const cols = `${labelWidth} minmax(80px, 1.4fr) ${rightWidth}px`;
  return (
    <div className="vw-flex vw-flex-col">
      {shown.map((r, i) => {
        const inner = (
          <>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 'var(--vw-font-label-sm)', fontWeight: 500, color: 'var(--vw-color-slate-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.title}>{r.label}</span>
              {r.sub && <span style={{ display: 'block', fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</span>}
            </span>
            <span className="vw-flex" style={{ height: 12, borderRadius: 4, overflow: 'hidden', background: 'var(--vw-color-slate-100)' }} title={r.segs.filter(s => s.value).map(s => `${s.label}: ${s.value}`).join(' · ')}>
              {r.segs.map(s => (s.value ? <span key={s.label} style={{ width: `${(s.value / max) * 100}%`, background: s.color }} /> : null))}
            </span>
            <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-700)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.right}</span>
          </>
        );
        const style = { display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '7px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined, color: 'inherit', textDecoration: 'none' } as const;
        return r.to ? <Link key={r.key} to={r.to} style={style}>{inner}</Link> : <div key={r.key} style={style}>{inner}</div>;
      })}
      {rows.length > limit && <button type="button" className="nst-btn nst-btn--ghost nst-btn--sm" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
    </div>
  );
}

/* ------------------------------------------------------------------ pipeline */
/** Open changes by stage as bars split by class; the figure says how many are stuck. */
export function StageBars({ stages, linkFor }: { stages: Stage[]; linkFor: (s: Stage) => string }) {
  const p = useVwPalette();
  return (
    <BarList limit={stages.length} labelWidth="110px" rightWidth={150} rows={stages.map(s => ({
      key: s.status, label: s.label, to: linkFor(s),
      sub: s.count ? `median ${dayTxt(s.medianDays)} in stage` : 'none',
      segs: [{ value: s.byClass.Standard, color: p.emerald, label: 'Standard' }, { value: s.byClass.Normal, color: p.blue, label: 'Normal' }, { value: s.byClass.Emergency, color: p.amber, label: 'Emergency' }],
      right: <><b style={{ fontWeight: 600, color: 'var(--vw-color-slate-900)' }}>{s.count}</b>{s.stuck ? <span style={{ color: 'var(--vw-color-amber-700)' }}> · {s.stuck} stuck</span> : null}</>,
    }))} />
  );
}
