/**
 * Lead-time Gantt — one row per schedule item: equipment bars run from order-by to need-by
 * (red when the order date has already passed), permits in amber, gates as diamonds; a
 * "today" line and the go-live line sit over a monthly axis.
 */
import { scaleTime } from 'd3-scale';
import { timeMonth } from 'd3-time';
import { useVwPalette } from '../../../site360/lib/siteModel';
import type { ScheduleItem } from '../../lib/engine';
import type { LeadTimeGanttProps } from './types';
import { useMeasuredWidth, useTip, fmtMonthShort, fmtDay, ellipsis } from './chartKit';
import { ChartTip, TipRows, ChartEmpty, Legend } from './ChartBits';

const KIND_LABEL: Record<ScheduleItem['kind'], string> = { equipment: 'Long-lead equipment', gate: 'Gate', permit: 'Permit' };

export function LeadTimeGantt({ items, goLive, height = 320 }: LeadTimeGanttProps) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth();
  const { tip, show, hide } = useTip(wrapRef);

  const valid = items.filter((it) => !Number.isNaN(new Date(it.orderBy).getTime()) && !Number.isNaN(new Date(it.needBy).getTime()));
  if (!valid.length) return <ChartEmpty title="No schedule items" hint="Add a phase with a go-live date; long-lead items, gates and permits are derived from it." height={height} />;

  const now = new Date();
  const goLiveD = new Date(goLive);
  const hasGoLive = !Number.isNaN(goLiveD.getTime());
  const tMin = Math.min(now.getTime(), ...valid.map((v) => new Date(v.orderBy).getTime()));
  const tMax = Math.max(hasGoLive ? goLiveD.getTime() : 0, ...valid.map((v) => new Date(v.needBy).getTime()));
  const x0 = timeMonth.floor(new Date(tMin - 15 * 864e5)), x1 = timeMonth.ceil(new Date(tMax + 20 * 864e5));

  const w = Math.max(360, width);
  const labelW = Math.min(190, Math.max(120, w * 0.26));
  const m = { top: 22, right: 16, bottom: 8, left: labelW };
  const rowH = Math.max(16, Math.min(26, Math.floor((height - m.top - m.bottom) / valid.length)));
  const innerH = rowH * valid.length;
  const svgH = m.top + innerH + m.bottom;
  const innerW = w - m.left - m.right;
  const x = scaleTime().domain([x0, x1]).range([0, innerW]);
  const months = timeMonth.range(x0, x1);
  const every = months.length > 30 ? 6 : months.length > 16 ? 3 : months.length > 9 ? 2 : 1;
  const barH = Math.max(8, rowH - 8);
  const colorOf = (it: ScheduleItem) => (it.late ? p.red : it.kind === 'permit' ? p.amber : it.kind === 'gate' ? p.violet : it.source === 'stock' ? p.emerald : it.status === 'ordered' ? p.slate : p.blue);
  const weeksBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (7 * 864e5)));

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ maxHeight: height, overflowY: svgH > height ? 'auto' : 'visible', overflowX: 'hidden' }}>
        <svg width={w} height={svgH} style={{ display: 'block' }} onMouseLeave={hide}>
          <g transform={`translate(${m.left},${m.top})`}>
            {months.map((d, i) => {
              const yearStart = d.getMonth() === 0;
              return (
                <g key={+d} transform={`translate(${x(d)},0)`}>
                  <line y1={-4} y2={innerH} stroke={yearStart ? p.slateLight : p.grid} strokeDasharray={yearStart ? undefined : '2 3'} />
                  {i % every === 0 && <text y={-8} textAnchor="middle" fontSize={9.5} fill={p.slate}>{d.getMonth() === 0 || i === 0 ? `${fmtMonthShort(d)} '${String(d.getFullYear()).slice(2)}` : fmtMonthShort(d)}</text>}
                </g>
              );
            })}
            {valid.map((it, i) => {
              const y = i * rowH;
              const ob = new Date(it.orderBy), nb = new Date(it.needBy);
              const bx0 = x(ob), bx1 = x(nb);
              const c = colorOf(it);
              const content = (
                <TipRows title={it.item} rows={[['Kind', KIND_LABEL[it.kind]], ...(it.kind === 'gate' ? [] : [['Lead time', `${it.leadWeeks} wk${it.bufferWeeks ? ` + ${it.bufferWeeks} wk buffer` : ''}`] as [string, string], ['Source', it.source === 'stock' ? 'stock (transfer)' : it.source === 'mixed' ? 'part stock, part buy' : 'buy'] as [string, string], ...(it.note ? [['Note', it.note] as [string, string]] : []), ['Order by', fmtDay(ob)] as [string, string]]), ['Need by', fmtDay(nb)], ['Phase', it.phase], ['Status', it.late ? `late · order date passed ${weeksBetween(it.orderBy, now.toISOString())} wk ago` : it.kind === 'gate' ? `${weeksBetween(now.toISOString(), it.needBy)} wk away` : `${weeksBetween(now.toISOString(), it.orderBy)} wk until order`]]} />
              );
              return (
                <g key={`${it.item}-${i}`} onMouseMove={(e) => show(e, content)}>
                  <rect x={-m.left} y={y} width={w} height={rowH} fill={i % 2 ? p.surface : 'transparent'} opacity={0.6} />
                  <text x={-10} y={y + rowH / 2} dy="0.35em" textAnchor="end" fontSize={10.5} fill={it.late ? p.red : p.ink} fontWeight={it.kind === 'gate' ? 600 : 400}>{ellipsis(it.item, Math.floor(labelW / 6.2))}</text>
                  {it.kind === 'gate' ? (
                    <g transform={`translate(${bx1},${y + rowH / 2}) rotate(45)`}>
                      <rect x={-barH / 2.6} y={-barH / 2.6} width={barH / 1.3} height={barH / 1.3} rx={1.5} fill={c} stroke={p.surface} strokeWidth={1} />
                    </g>
                  ) : (
                    <>
                      <rect x={bx0} y={y + (rowH - barH) / 2} width={Math.max(3, bx1 - bx0)} height={barH} rx={3} fill={c} opacity={it.kind === 'permit' ? 0.85 : 0.9} style={{ transition: 'width 300ms ease' }} />
                      {!!it.bufferWeeks && <rect x={bx0} y={y + (rowH - barH) / 2} width={Math.max(2, x(new Date(ob.getTime() + it.bufferWeeks * 7 * 864e5)) - bx0)} height={barH} rx={3} fill={p.surface} opacity={0.45} />}
                      {bx1 - bx0 > 44 && <text x={bx0 + 6} y={y + rowH / 2} dy="0.35em" fontSize={9} fill={p.surface} fontWeight={600}>{it.leadWeeks} wk</text>}
                    </>
                  )}
                  {it.late && <circle cx={bx0 - 7} cy={y + rowH / 2} r={2.5} fill={p.red} />}
                </g>
              );
            })}
            {x(now) >= 0 && x(now) <= innerW && (
              <g transform={`translate(${x(now)},0)`}>
                <line y1={-14} y2={innerH} stroke={p.slateDark} strokeDasharray="3 3" />
                <text y={-16} textAnchor="middle" fontSize={9} fontWeight={600} fill={p.slateDark}>today</text>
              </g>
            )}
            {hasGoLive && x(goLiveD) >= 0 && x(goLiveD) <= innerW && (
              <g transform={`translate(${x(goLiveD)},0)`}>
                <line y1={-14} y2={innerH} stroke={p.emerald} strokeWidth={2} />
                <text y={-16} textAnchor={x(goLiveD) > innerW - 50 ? 'end' : 'middle'} fontSize={9} fontWeight={600} fill={p.emerald}>go-live {fmtDay(goLiveD)}</text>
              </g>
            )}
          </g>
        </svg>
      </div>
      <ChartTip tip={tip} width={w} />
      <Legend style={{ marginTop: 6 }} items={[{ label: 'Equipment to buy (order → need)', color: p.blue }, { label: 'Buffer (contingency)', color: p.blue, kind: 'hatch' }, { label: 'From stock (transfer)', color: p.emerald }, { label: 'Ordered', color: p.slate }, { label: 'Late — order date passed', color: p.red }, { label: 'Permit', color: p.amber }, { label: 'Gate', color: p.violet, kind: 'diamond' }, { label: 'Today', color: p.slateDark, kind: 'dash' }, { label: 'Go-live', color: p.emerald, kind: 'line' }]} />
    </div>
  );
}
