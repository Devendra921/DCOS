/**
 * Capacity ladder — installed kW stepping up at each phase go-live, split into committed,
 * reserve and headroom bands, with the compounding demand curve laid over it and the
 * month where demand crosses the warning threshold marked.
 */
import { useId, useMemo } from 'react';
import { scaleLinear, scaleTime } from 'd3-scale';
import { timeMonth, timeYear } from 'd3-time';
import { useVwPalette } from '../../../site360/lib/siteModel';
import { VwChip, type VwChipVariant } from '../../../../shared/components/ux';
import { fmtKw } from '../../lib/engine';
import type { LadderRow } from '../../lib/engine';
import type { PhaseLadderChartProps } from './types';
import { useMeasuredWidth, useTip, fmtMonthYear, fmtDay, fmtInt, addMonths, axisKw } from './chartKit';
import { ChartTip, TipRows, Legend, ChartEmpty } from './ChartBits';

const CONSTRAINT_TONE: Record<LadderRow['bindingConstraint'], VwChipVariant> = { power: 'warning', cooling: 'cyan', space: 'purple', grid: 'error', ports: 'info', none: 'neutral' };
const CONSTRAINT_LABEL: Record<LadderRow['bindingConstraint'], string> = { power: 'Power-bound', cooling: 'Cooling-bound', space: 'Space-bound', grid: 'Grid-bound', ports: 'Port-bound', none: 'Balanced' };

export function PhaseLadderChart({ rows, growthPctPerYear, height = 260 }: PhaseLadderChartProps) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth();
  const { tip, show, hide } = useTip(wrapRef);
  const patternId = useId();

  const model = useMemo(() => {
    const sorted = [...rows].sort((a, b) => a.phase.goLive.localeCompare(b.phase.goLive)).filter((r) => !Number.isNaN(new Date(r.phase.goLive).getTime()));
    if (!sorted.length) return null;
    const now = new Date();
    const first = new Date(sorted[0].phase.goLive);
    const last = new Date(sorted[sorted.length - 1].phase.goLive);
    // Demand compounds monthly from the first phase's committed load.
    const g = Math.max(0, growthPctPerYear) / 100;
    const base = sorted[0].committedKw || sorted[0].installedKw * 0.5;
    const demandAt = (d: Date) => base * Math.pow(1 + g / 12, Math.max(0, (d.getTime() - first.getTime()) / (30.4 * 864e5)));
    // Warning markers: the ladder-end crossing (labelled) and any earlier crossing that lands before the next phase.
    const markers = sorted.flatMap((r, i) => {
      if (r.crossesWarningMonth === undefined) return [];
      const at = addMonths(now, r.crossesWarningMonth);
      const next = sorted[i + 1] ? new Date(sorted[i + 1].phase.goLive) : null;
      const isLast = i === sorted.length - 1;
      if (!isLast && next && at.getTime() >= next.getTime()) return [];
      return [{ at, row: r, primary: isLast }];
    });
    const maxInstalled = Math.max(...sorted.map((r) => r.installedKw), 1);
    const horizon = Math.max(addMonths(last, 12).getTime(), ...markers.map((m) => m.at.getTime() + 2 * 30.4 * 864e5));
    const x0 = Math.min(now.getTime(), first.getTime()) - 30.4 * 864e5;
    const x1 = Math.min(horizon, addMonths(last, 36).getTime());
    // Cap the demand curve at ~1.3× installed so a steep growth never squashes the ladder.
    const demandCap = maxInstalled * 1.3;
    const yMax = Math.max(maxInstalled * 1.15, Math.min(demandCap, demandAt(new Date(x1))) * 1.05);
    return { sorted, now, first, demandAt, markers, x0, x1, yMax, demandCap };
  }, [rows, growthPctPerYear]);

  if (!model) return <ChartEmpty title="No phases to plot" hint="Add at least one phase with a go-live date and IT load to see the capacity ladder." height={height} />;

  const m = { top: 14, right: 18, bottom: 28, left: 54 };
  const w = Math.max(320, width);
  const innerW = w - m.left - m.right, innerH = height - m.top - m.bottom;
  const x = scaleTime().domain([new Date(model.x0), new Date(model.x1)]).range([0, innerW]);
  const y = scaleLinear().domain([0, model.yMax]).range([innerH, 0]).nice();
  const spanMonths = (model.x1 - model.x0) / (30.4 * 864e5);
  const xTicks = spanMonths > 30 ? timeYear.range(timeYear.ceil(new Date(model.x0)), new Date(model.x1)) : timeMonth.range(timeMonth.ceil(new Date(model.x0)), new Date(model.x1), spanMonths > 14 ? 3 : spanMonths > 8 ? 2 : 1);
  const yTicks = y.ticks(5);

  // Step segments: each phase holds from its go-live to the next go-live (or the chart edge).
  const segs = model.sorted.map((r, i) => {
    const from = new Date(r.phase.goLive);
    const to = model.sorted[i + 1] ? new Date(model.sorted[i + 1].phase.goLive) : new Date(model.x1);
    const committedTop = Math.min(r.committedKw, r.installedKw);
    const reserveTop = Math.min(r.committedKw + r.reserveKw, r.installedKw);
    return { r, from, to, committedTop, reserveTop, x0: x(from), x1: x(to) };
  });
  const stepPath = segs.map((s, i) => `${i ? 'L' : 'M'}${s.x0},${y(s.r.installedKw)} L${s.x1},${y(s.r.installedKw)}`).join(' ');
  const demandPts: string[] = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = model.first.getTime() + ((model.x1 - model.first.getTime()) * i) / steps;
    const d = new Date(t);
    const v = Math.min(model.demandAt(d), model.demandCap);
    demandPts.push(`${i ? 'L' : 'M'}${x(d)},${y(v)}`);
    if (v >= model.demandCap) break;
  }
  const todayX = x(model.now);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <svg width={w} height={height} style={{ display: 'block', fontFamily: 'inherit' }} onMouseLeave={hide}>
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={p.blueLight} opacity={0.35} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={p.blue} strokeWidth="1.5" opacity={0.6} />
          </pattern>
        </defs>
        <g transform={`translate(${m.left},${m.top})`}>
          {yTicks.map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x1={0} x2={innerW} stroke={p.grid} strokeDasharray={t === 0 ? undefined : '2 3'} />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} fill={p.slate}>{axisKw(t)}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={+t} transform={`translate(${x(t)},0)`}>
              <line y1={innerH} y2={innerH + 4} stroke={p.slateLight} />
              <text y={innerH + 15} textAnchor="middle" fontSize={10} fill={p.slate}>{spanMonths > 30 ? t.getFullYear() : fmtMonthYear(t)}</text>
            </g>
          ))}
          {segs.map((s) => {
            const sw = Math.max(0, s.x1 - s.x0);
            const content = (
              <TipRows
                title={`${s.r.phase.name} · ${fmtDay(s.from)}`}
                rows={[
                  ['Installed', fmtKw(s.r.installedKw)], ['Committed', fmtKw(s.r.committedKw)], ['Reserve', fmtKw(s.r.reserveKw)], ['Headroom', fmtKw(s.r.headroomKw)],
                  ['Usable', `${s.r.usablePct}%`], ['Racks / halls', `${fmtInt(s.r.racks)} / ${s.r.halls}`], ['Binding', CONSTRAINT_LABEL[s.r.bindingConstraint]],
                ]}
              />
            );
            return (
              <g key={s.r.phase.id} onMouseMove={(e) => show(e, content)}>
                <rect x={s.x0} y={y(s.r.installedKw)} width={sw} height={Math.max(0, y(s.reserveTop) - y(s.r.installedKw))} fill={p.emerald} opacity={0.18} />
                <rect x={s.x0} y={y(s.reserveTop)} width={sw} height={Math.max(0, y(s.committedTop) - y(s.reserveTop))} fill={`url(#${patternId})`} />
                <rect x={s.x0} y={y(s.committedTop)} width={sw} height={Math.max(0, innerH - y(s.committedTop))} fill={p.blue} opacity={0.85} />
                <line x1={s.x0} x2={s.x0} y1={y(s.r.installedKw)} y2={innerH} stroke={p.surface} strokeWidth={1.5} />
                {sw > 48 && <text x={s.x0 + 6} y={y(s.r.installedKw) - 5} fontSize={10} fontWeight={600} fill={p.ink}>{s.r.phase.name}</text>}
              </g>
            );
          })}
          <path d={stepPath} fill="none" stroke={p.ink} strokeWidth={1.75} style={{ transition: 'd 300ms ease' }} />
          <path d={demandPts.join(' ')} fill="none" stroke={p.rose} strokeWidth={2} strokeLinecap="round" />
          {todayX >= 0 && todayX <= innerW && (
            <g transform={`translate(${todayX},0)`}>
              <line y1={0} y2={innerH} stroke={p.slate} strokeDasharray="3 3" />
              <text y={-3} textAnchor="middle" fontSize={9} fill={p.slate}>today</text>
            </g>
          )}
          {model.markers.map((mk, i) => {
            const mx = x(mk.at);
            if (mx < 0 || mx > innerW) return null;
            const label = `warning threshold ~${fmtMonthYear(mk.at)}`;
            const anchor = mx > innerW - 150 ? 'end' : 'start';
            return (
              <g key={i} transform={`translate(${mx},0)`} onMouseMove={(e) => show(e, <TipRows title="Demand crosses 85% of installed" rows={[['Phase', mk.row.phase.name], ['When', fmtMonthYear(mk.at)], ['Installed', fmtKw(mk.row.installedKw)], ['Growth', `${growthPctPerYear}% / yr`]]} />)}>
                <line y1={0} y2={innerH} stroke={p.amber} strokeWidth={mk.primary ? 1.5 : 1} strokeDasharray="5 4" opacity={mk.primary ? 1 : 0.6} />
                <circle cy={y(Math.min(mk.row.installedKw * 0.85, model.yMax))} r={3.5} fill={p.amber} stroke={p.surface} strokeWidth={1.5} />
                {mk.primary && <text x={anchor === 'start' ? 5 : -5} y={12} textAnchor={anchor} fontSize={10} fontWeight={600} fill={p.amber}>{label}</text>}
              </g>
            );
          })}
        </g>
      </svg>
      <ChartTip tip={tip} width={w} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
        <Legend items={[{ label: 'Committed', color: p.blue }, { label: 'Reserve', color: p.blue, kind: 'hatch' }, { label: 'Headroom', color: p.emerald, muted: true }, { label: 'Installed', color: p.ink, kind: 'line' }, { label: `Demand (${growthPctPerYear}% / yr)`, color: p.rose, kind: 'line' }, { label: 'Warning threshold', color: p.amber, kind: 'dash' }]} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {model.sorted.map((r) => (
            <VwChip key={r.phase.id} variant={CONSTRAINT_TONE[r.bindingConstraint]} style={{ fontSize: 11, lineHeight: '16px', padding: '0 6px' }}>
              {r.phase.name} · {CONSTRAINT_LABEL[r.bindingConstraint]}
            </VwChip>
          ))}
        </div>
      </div>
    </div>
  );
}
