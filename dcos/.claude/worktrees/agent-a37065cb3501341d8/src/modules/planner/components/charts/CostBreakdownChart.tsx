/**
 * Cost envelope — a 100% stacked bar plus a donut of the CapEx lines (or the monthly OpEx
 * lines), a legend table with amounts and shares, and the benchmark band for CapEx per kW
 * with the plan's figure (and the estate actual, when known) marked on it.
 */
import { useState } from 'react';
import { arc, pie } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { useVwPalette } from '../../../site360/lib/siteModel';
import { fmtUsd, type EstimateLine } from '../../lib/engine';
import type { CostBreakdownChartProps } from './types';
import { useMeasuredWidth, useTip, seriesColors, fmtInt, ellipsis } from './chartKit';
import { ChartTip, TipRows, ChartEmpty, ChartNote } from './ChartBits';

export function CostBreakdownChart({ estimate, mode = 'capex', height = 220 }: CostBreakdownChartProps) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth();
  const { tip, show, hide } = useTip(wrapRef);
  const [active, setActive] = useState<string | null>(null);
  const colors = seriesColors(p);

  const lines: EstimateLine[] = (mode === 'capex' ? estimate.capex : estimate.opex).filter((l) => l.amount > 0);
  const total = lines.reduce((a, l) => a + l.amount, 0);
  const sorted = [...lines].sort((a, b) => b.amount - a.amount);
  // Stacked-bar segments with their running offset, as a share of the total.
  const segments = sorted.reduce<{ line: EstimateLine; start: number; share: number }[]>((acc, line) => { const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].share : 0; acc.push({ line, start, share: line.amount / total }); return acc; }, []);

  if (!lines.length || total <= 0) return <ChartEmpty title={mode === 'capex' ? 'No CapEx lines yet' : 'No OpEx lines yet'} hint="Enter the design load and scope; the estimate fills in from benchmarks and estate actuals." height={height} />;

  const w = Math.max(320, width);
  const narrow = w < 520;
  const donutSize = Math.min(height, 170);
  const barH = 26;
  const barW = narrow ? w : w - donutSize - 24;
  const pieGen = pie<EstimateLine>().value((d) => d.amount).sort(null);
  const arcGen = arc<ReturnType<typeof pieGen>[number]>().innerRadius(donutSize / 2 - 22).outerRadius(donutSize / 2 - 4).padAngle(0.015).cornerRadius(2);
  const arcGenHot = arc<ReturnType<typeof pieGen>[number]>().innerRadius(donutSize / 2 - 24).outerRadius(donutSize / 2).padAngle(0.015).cornerRadius(2);
  const slices = pieGen(sorted);
  const colorOf = (item: string) => colors[sorted.findIndex((l) => l.item === item) % colors.length];
  const suffix = mode === 'opex' ? ' / mo' : '';
  const tipFor = (l: EstimateLine) => <TipRows title={l.item} rows={[['Amount', `${fmtUsd(l.amount)}${suffix}`], ['Share', `${((l.amount / total) * 100).toFixed(1)}%`], ['Basis', ellipsis(l.basis, 48)], ['Source', l.source]]} />;

  // Benchmark band for CapEx per kW.
  const band = mode === 'capex' ? estimate.benchmarkBand : undefined;
  const bandScale = band ? (() => {
    const vals = [band.low, band.high, estimate.capexPerKw, estimate.actualsCapexPerKw ?? estimate.capexPerKw].filter((v) => Number.isFinite(v) && v > 0);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.25, hi * 0.05, 1);
    return scaleLinear().domain([Math.max(0, lo - pad), hi + pad]).range([0, w - 2 * 10]);
  })() : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', gap: 16, alignItems: narrow ? 'stretch' : 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span className="vw-card-metric-label" style={{ fontSize: 11 }}>{mode === 'capex' ? 'CapEx by line' : 'OpEx by line, monthly'}</span>
            <span style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>{mode === 'capex' ? `${fmtUsd(estimate.capexPerKw)} / kW · ${fmtUsd(estimate.capexPerRack)} / rack` : `${fmtUsd(estimate.opexAnnual)} / yr · ${fmtUsd(estimate.costPerKwMonth)} / kW-mo`}</span>
          </div>
          <svg width={barW} height={barH + 4} style={{ display: 'block' }} onMouseLeave={hide}>
            {segments.map(({ line: l, start, share }) => { const x0 = start * barW; const sw = share * barW; const hot = active === l.item; return (
              <g key={l.item} onMouseMove={(e) => { setActive(l.item); show(e, tipFor(l)); }} onMouseLeave={() => setActive(null)} style={{ cursor: 'default' }}>
                <rect x={x0} y={hot ? 0 : 2} width={Math.max(0, sw - 1)} height={hot ? barH + 4 : barH} rx={3} fill={colorOf(l.item)} opacity={active && !hot ? 0.45 : 1} style={{ transition: 'opacity 150ms, y 150ms, height 150ms' }} />
                {sw > 44 && <text x={x0 + sw / 2} y={barH / 2 + 2} dy="0.35em" textAnchor="middle" fontSize={10} fontWeight={600} fill={p.surface}>{Math.round(share * 100)}%</text>}
              </g>
            ); })}
          </svg>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', columnGap: 16, rowGap: 2, marginTop: 8 }}>
            {sorted.map((l) => (
              <div key={l.item} onMouseEnter={() => setActive(l.item)} onMouseLeave={() => setActive(null)} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto auto', alignItems: 'center', gap: 8, fontSize: 11, padding: '2px 4px', borderRadius: 6, background: active === l.item ? 'var(--vw-color-slate-100)' : 'transparent', transition: 'background 150ms' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(l.item) }} />
                <span style={{ color: 'var(--vw-color-slate-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.item}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--vw-color-slate-900)', fontWeight: 600 }}>{fmtUsd(l.amount)}{suffix}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--vw-color-slate-500)', minWidth: 34, textAlign: 'right' }}>{((l.amount / total) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
        <svg width={donutSize} height={donutSize} style={{ flex: 'none', display: 'block', alignSelf: 'center' }} onMouseLeave={hide}>
          <g transform={`translate(${donutSize / 2},${donutSize / 2})`}>
            {slices.map((s) => (
              <path key={s.data.item} d={(active === s.data.item ? arcGenHot(s) : arcGen(s)) ?? undefined} fill={colorOf(s.data.item)} opacity={active && active !== s.data.item ? 0.45 : 1} style={{ transition: 'opacity 150ms' }}
                onMouseMove={(e) => { setActive(s.data.item); show(e, tipFor(s.data)); }} onMouseLeave={() => setActive(null)} />
            ))}
            <text textAnchor="middle" dy="-0.2em" fontSize={16} fontWeight={700} fill={p.ink}>{fmtUsd(total)}</text>
            <text textAnchor="middle" dy="1.1em" fontSize={10} fill={p.slate}>{mode === 'capex' ? 'total CapEx' : 'OpEx per month'}</text>
          </g>
        </svg>
      </div>
      {band && bandScale && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--vw-color-slate-200)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--vw-color-slate-600)', marginBottom: 2 }}>
            <span>Benchmark {fmtInt(band.low)}–{fmtInt(band.high)} USD per kW <span style={{ color: 'var(--vw-color-slate-400)' }}>· {band.source}</span></span>
            <span>Plan <b style={{ color: 'var(--vw-color-slate-900)' }}>{fmtInt(estimate.capexPerKw)}</b>{estimate.actualsCapexPerKw ? <> · Estate actual <b style={{ color: 'var(--vw-color-slate-900)' }}>{fmtInt(estimate.actualsCapexPerKw)}</b></> : null}</span>
          </div>
          <svg width={w} height={34} style={{ display: 'block' }} onMouseLeave={hide}>
            <g transform="translate(10,0)">
              <line x1={0} x2={w - 20} y1={17} y2={17} stroke={p.grid} strokeWidth={2} />
              <rect x={bandScale(band.low)} y={9} width={Math.max(2, bandScale(band.high) - bandScale(band.low))} height={16} rx={4} fill={p.slateLight} opacity={0.6} />
              <text x={bandScale(band.low)} y={32} fontSize={9} fill={p.slate} textAnchor="middle">{fmtInt(band.low)}</text>
              <text x={bandScale(band.high)} y={32} fontSize={9} fill={p.slate} textAnchor="middle">{fmtInt(band.high)}</text>
              {estimate.actualsCapexPerKw !== undefined && (
                <g transform={`translate(${bandScale(estimate.actualsCapexPerKw)},17) rotate(45)`} onMouseMove={(e) => show(e, <TipRows title="Estate actual" rows={[['CapEx / kW', `${fmtInt(estimate.actualsCapexPerKw ?? 0)} USD`]]} />)}>
                  <rect x={-5} y={-5} width={10} height={10} fill={p.violet} stroke={p.surface} strokeWidth={1.5} />
                </g>
              )}
              <g transform={`translate(${bandScale(estimate.capexPerKw)},17)`} onMouseMove={(e) => show(e, <TipRows title="This plan" rows={[['CapEx / kW', `${fmtInt(estimate.capexPerKw)} USD`], ['Against band', estimate.capexPerKw < band.low ? 'below' : estimate.capexPerKw > band.high ? 'above' : 'within']]} />)}>
                <circle r={6} fill={estimate.capexPerKw > band.high * 1.05 || estimate.capexPerKw < band.low * 0.8 ? p.amber : p.blue} stroke={p.surface} strokeWidth={2} />
              </g>
            </g>
          </svg>
          <ChartNote style={{ display: 'flex', gap: 14 }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: p.blue, marginRight: 4 }} />plan</span>
            {estimate.actualsCapexPerKw !== undefined && <span><span style={{ display: 'inline-block', width: 7, height: 7, background: p.violet, transform: 'rotate(45deg)', marginRight: 5 }} />estate actual</span>}
            <span><span style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 2, background: p.slateLight, marginRight: 4 }} />benchmark band</span>
          </ChartNote>
        </div>
      )}
      <ChartTip tip={tip} width={w} />
    </div>
  );
}
