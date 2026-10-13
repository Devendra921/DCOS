/**
 * Cash flow by year — CapEx below the axis, operating cash (revenue and benefits less OpEx and tax)
 * above it, and the cumulative position as a line. The year the line crosses zero is the payback.
 */
import { scaleBand, scaleLinear } from 'd3-scale';
import { useVwPalette } from '../../../site360/lib/siteModel';
import { fmtUsd, type CashflowYear } from '../../lib/engine';
import { useMeasuredWidth, useTip } from './chartKit';
import { ChartEmpty, ChartTip, Legend, TipRows } from './ChartBits';

export interface CashflowChartProps { years: CashflowYear[]; height?: number }

export function CashflowChart({ years, height = 240 }: CashflowChartProps) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth();
  const { tip, show, hide } = useTip(wrapRef);
  if (!years.length) return <ChartEmpty title="No cash flow" hint="Add a dated phase; CapEx, revenue and OpEx are laid out by year from it." height={height} />;

  const rows = years.map(y => ({ y, op: y.revenue + y.benefit - y.opex - (y.tax ?? 0), capex: -y.capex }));
  const lo = Math.min(0, ...rows.map(r => Math.min(r.capex, r.op)), ...years.map(y => y.cumulative));
  const hi = Math.max(0, ...rows.map(r => Math.max(r.op, 0)), ...years.map(y => y.cumulative));
  const w = Math.max(320, width);
  const m = { top: 12, right: 12, bottom: 22, left: 58 };
  const innerW = w - m.left - m.right, innerH = height - m.top - m.bottom;
  const x = scaleBand<string>().domain(years.map(y => y.label)).range([0, innerW]).padding(0.25);
  const yS = scaleLinear().domain([lo, hi || 1]).nice().range([innerH, 0]);
  const ticks = yS.ticks(5);
  const every = years.length > 16 ? 3 : years.length > 9 ? 2 : 1;
  const linePts = years.map(y => `${(x(y.label) ?? 0) + x.bandwidth() / 2},${yS(y.cumulative)}`).join(' ');
  const payIdx = years.findIndex((y, i) => y.cumulative >= 0 && i > 0 && years[i - 1].cumulative < 0);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <svg width={w} height={height} style={{ display: 'block' }} onMouseLeave={hide}>
        <g transform={`translate(${m.left},${m.top})`}>
          {ticks.map(t => (
            <g key={t} transform={`translate(0,${yS(t)})`}>
              <line x1={0} x2={innerW} stroke={t === 0 ? p.slateLight : p.grid} strokeDasharray={t === 0 ? undefined : '2 3'} />
              <text x={-6} dy="0.32em" textAnchor="end" fontSize={9.5} fill={p.slate}>{fmtUsd(t)}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const bx = x(r.y.label) ?? 0; const bw = x.bandwidth();
            const content = <TipRows title={r.y.label} rows={[['CapEx', fmtUsd(r.y.capex)], ...(r.y.itCapex ? [['of which IT', fmtUsd(r.y.itCapex)] as [string, string]] : []), ['Revenue', fmtUsd(r.y.revenue)], ...(r.y.benefit ? [['Benefits', fmtUsd(r.y.benefit)] as [string, string]] : []), ['OpEx incl. energy', fmtUsd(r.y.opex)], ['Tax', fmtUsd(r.y.tax ?? 0)], ['Depreciation', fmtUsd(r.y.depreciation ?? 0)], ['Net cash', fmtUsd(r.y.net)], ['Cumulative', fmtUsd(r.y.cumulative)], ['Discounted', fmtUsd(r.y.discounted)]]} />;
            return (
              <g key={r.y.label} onMouseMove={e => show(e, content)}>
                <rect x={bx} width={bw} y={Math.min(yS(0), yS(r.capex))} height={Math.abs(yS(r.capex) - yS(0))} rx={2} fill={p.violet} opacity={0.85} />
                <rect x={bx + bw * 0.2} width={bw * 0.6} y={Math.min(yS(0), yS(r.op))} height={Math.abs(yS(r.op) - yS(0))} rx={2} fill={r.op >= 0 ? p.emerald : p.amber} opacity={0.9} />
                {i % every === 0 && <text x={bx + bw / 2} y={innerH + 14} textAnchor="middle" fontSize={9.5} fill={p.slate}>{r.y.label}</text>}
              </g>
            );
          })}
          <polyline points={linePts} fill="none" stroke={p.ink} strokeWidth={1.75} />
          {years.map(y => <circle key={y.label} cx={(x(y.label) ?? 0) + x.bandwidth() / 2} cy={yS(y.cumulative)} r={2.2} fill={p.ink} />)}
          {payIdx > 0 && <text x={(x(years[payIdx].label) ?? 0) + x.bandwidth() / 2} y={yS(years[payIdx].cumulative) - 8} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={p.ink}>pays back</text>}
        </g>
      </svg>
      <ChartTip tip={tip} width={w} />
      <Legend style={{ marginTop: 6 }} items={[{ label: 'CapEx', color: p.violet }, { label: 'Operating cash after tax', color: p.emerald }, { label: 'Operating loss', color: p.amber }, { label: 'Cumulative', color: p.ink, kind: 'line' }]} />
    </div>
  );
}
