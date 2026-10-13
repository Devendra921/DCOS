/**
 * Scenario comparison — one big bar chart for the focus metric, with a compact strip of
 * every metric per scenario beneath it. The preferred scenario is highlighted and the best
 * (lowest) value in each row is marked.
 */
import { useMemo, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { useVwPalette } from '../../../site360/lib/siteModel';
import { fmtUsd, fmtKw, type Evaluation } from '../../lib/engine';
import type { ScenarioCompareChartProps } from './types';
import { useMeasuredWidth, useTip, fmtInt, ellipsis } from './chartKit';
import { ChartTip, TipRows, ChartEmpty, Legend } from './ChartBits';

type MetricKey = 'capex' | 'opex' | 'pue' | 'payback' | 'racks' | 'fails';
interface MetricDef { key: MetricKey; label: string; get: (ev: Evaluation) => number | null; fmt: (v: number) => string; axis: (v: number) => string }
const METRICS: MetricDef[] = [
  { key: 'capex', label: 'CapEx total', get: (ev) => ev.estimate.capexTotal, fmt: fmtUsd, axis: fmtUsd },
  { key: 'opex', label: 'OpEx / month', get: (ev) => ev.estimate.opexMonthly, fmt: (v) => `${fmtUsd(v)} / mo`, axis: fmtUsd },
  { key: 'pue', label: 'PUE', get: (ev) => ev.sizing.pue.value, fmt: (v) => v.toFixed(2), axis: (v) => v.toFixed(2) },
  { key: 'payback', label: 'Payback', get: (ev) => ev.estimate.paybackMonths, fmt: (v) => `${fmtInt(v)} mo`, axis: (v) => `${fmtInt(v)} mo` },
  { key: 'racks', label: 'Racks', get: (ev) => ev.sizing.racks, fmt: fmtInt, axis: fmtInt },
  { key: 'fails', label: 'Hard fails', get: (ev) => ev.hardFails, fmt: fmtInt, axis: fmtInt },
];

export function ScenarioCompareChart({ items, metric = 'capex', height = 240, onMetricChange }: ScenarioCompareChartProps) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth();
  const { tip, show, hide } = useTip(wrapRef);
  const [focus, setFocus] = useState<MetricKey>(metric);
  const [prevMetric, setPrevMetric] = useState<MetricKey>(metric);
  if (metric !== prevMetric) { setPrevMetric(metric); setFocus(metric); }

  const def = METRICS.find((d) => d.key === focus) ?? METRICS[0];
  const data = useMemo(() => items.map((it) => ({ ...it, value: def.get(it.ev) })), [items, def]);
  const best = useMemo(() => {
    const out: Partial<Record<MetricKey, number>> = {};
    for (const d of METRICS) { const vals = items.map((it) => d.get(it.ev)).filter((v): v is number => v !== null && Number.isFinite(v)); if (vals.length) out[d.key] = Math.min(...vals); }
    return out;
  }, [items]);

  if (!items.length) return <ChartEmpty title="No scenarios to compare" hint="Create a what-if scenario to compare it against the base plan." height={height} />;

  const w = Math.max(320, width);
  const m = { top: 24, right: 12, bottom: 34, left: 50 };
  const innerW = w - m.left - m.right, innerH = height - m.top - m.bottom;
  const xs = scaleBand<string>().domain(data.map((d) => d.scenario.id)).range([0, innerW]).paddingInner(0.35).paddingOuter(0.2);
  const maxV = Math.max(...data.map((d) => d.value ?? 0), focus === 'pue' ? 1.2 : 0, 1e-9);
  const minV = focus === 'pue' ? 1 : 0;
  const y = scaleLinear().domain([minV, maxV * 1.12]).range([innerH, 0]).nice();
  const yTicks = y.ticks(4);
  const pick = (k: MetricKey) => { setFocus(k); onMetricChange?.(k); };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <svg width={w} height={height} style={{ display: 'block' }} onMouseLeave={hide}>
        <g transform={`translate(${m.left},${m.top})`}>
          <text x={0} y={-10} fontSize={11} fontWeight={600} fill={p.ink}>{def.label}</text>
          {yTicks.map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x1={0} x2={innerW} stroke={p.grid} strokeDasharray={t === yTicks[0] ? undefined : '2 3'} />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} fill={p.slate}>{def.axis(t)}</text>
            </g>
          ))}
          {data.map((d) => {
            const x0 = xs(d.scenario.id) ?? 0, bw = xs.bandwidth();
            const preferred = d.scenario.preferred;
            const isBest = d.value !== null && best[focus] !== undefined && d.value === best[focus] && data.length > 1;
            const content = <TipRows title={d.scenario.name} rows={[[def.label, d.value === null ? 'n/a' : def.fmt(d.value)], ['Design load', fmtKw(d.ev.sizing.itKw)], ['Readiness', `${d.ev.readinessPct}%`], ['Hard fails / warns', `${d.ev.hardFails} / ${d.ev.softWarns}`], ...(preferred ? [['Preferred', 'yes'] as [string, string]] : [])]} />;
            return (
              <g key={d.scenario.id} onMouseMove={(e) => show(e, content)}>
                {d.value === null ? (
                  <>
                    <rect x={x0} y={innerH - 24} width={bw} height={24} rx={4} fill="none" stroke={p.slateLight} strokeDasharray="3 3" />
                    <text x={x0 + bw / 2} y={innerH - 9} textAnchor="middle" fontSize={10} fill={p.slate}>n/a</text>
                  </>
                ) : (
                  <>
                    <rect x={x0} y={y(d.value)} width={bw} height={Math.max(0, innerH - y(d.value))} rx={4} fill={preferred ? p.blue : p.blueLight} opacity={preferred ? 1 : 0.9} style={{ transition: 'y 300ms ease, height 300ms ease' }} />
                    <text x={x0 + bw / 2} y={y(d.value) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={p.ink}>{def.fmt(d.value)}</text>
                    {isBest && <text x={x0 + bw / 2} y={y(d.value) - 18} textAnchor="middle" fontSize={9} fill={p.emerald} fontWeight={600}>lowest</text>}
                  </>
                )}
                <text x={x0 + bw / 2} y={innerH + 16} textAnchor="middle" fontSize={10} fontWeight={preferred ? 600 : 400} fill={preferred ? p.ink : p.slate}>{ellipsis(d.scenario.name, Math.max(6, Math.floor(bw / 6)))}</text>
                {preferred && <text x={x0 + bw / 2} y={innerH + 28} textAnchor="middle" fontSize={9} fill={p.blue}>★ preferred</text>}
              </g>
            );
          })}
        </g>
      </svg>
      <ChartTip tip={tip} width={w} />
      <div style={{ marginTop: 8, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `minmax(96px, 1.2fr) repeat(${items.length}, minmax(80px, 1fr))`, fontSize: 11, border: '1px solid var(--vw-color-slate-200)', borderRadius: 'var(--vw-radius-md, 8px)', overflow: 'hidden', minWidth: 96 + 80 * items.length }}>
          <div style={{ padding: '5px 8px', background: 'var(--vw-color-slate-50)', color: 'var(--vw-color-slate-500)' }}>Metric</div>
          {items.map((it) => (
            <div key={it.scenario.id} style={{ padding: '5px 8px', background: it.scenario.preferred ? 'var(--vw-color-blue-50)' : 'var(--vw-color-slate-50)', color: it.scenario.preferred ? 'var(--vw-color-blue-700)' : 'var(--vw-color-slate-700)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.scenario.name}</div>
          ))}
          {METRICS.map((d) => (
            <RowCells key={d.key} def={d} items={items} best={best[d.key]} active={focus === d.key} onPick={() => pick(d.key)} />
          ))}
        </div>
      </div>
      <Legend style={{ marginTop: 6 }} items={[{ label: 'Preferred scenario', color: p.blue }, { label: 'Other scenarios', color: p.blueLight }, { label: 'Lowest in row', color: p.emerald, kind: 'dot' }]} />
    </div>
  );
}

function RowCells({ def, items, best, active, onPick }: { def: MetricDef; items: ScenarioCompareChartProps['items']; best?: number; active: boolean; onPick: () => void }) {
  const rowBg = active ? 'var(--vw-color-blue-50)' : 'transparent';
  return (
    <>
      <div onClick={onPick} style={{ padding: '4px 8px', borderTop: '1px solid var(--vw-color-slate-100)', cursor: 'pointer', background: rowBg, color: active ? 'var(--vw-color-blue-700)' : 'var(--vw-color-slate-600)', fontWeight: active ? 600 : 400 }}>{def.label}</div>
      {items.map((it) => {
        const v = def.get(it.ev);
        const isBest = v !== null && best !== undefined && v === best && items.length > 1;
        return (
          <div key={it.scenario.id} onClick={onPick} style={{ padding: '4px 8px', borderTop: '1px solid var(--vw-color-slate-100)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', cursor: 'pointer', background: it.scenario.preferred && !active ? 'var(--vw-color-blue-50)' : rowBg, color: isBest ? 'var(--vw-color-green-700)' : 'var(--vw-color-slate-900)', fontWeight: isBest ? 600 : 400 }}>
            {v === null ? <span style={{ color: 'var(--vw-color-slate-400)' }}>n/a</span> : def.fmt(v)}
          </div>
        );
      })}
    </>
  );
}
