/* Building and floor plan: buildings side by side, data hall floors stacked on a plant and
   support level, each floor split into its halls. Filled halls carry the plan's load; the
   rest are spare slots in the last building. */
import { useVwPalette } from '../../../site360/lib/siteModel';
import { useMeasuredWidth, useTip } from './chartKit';
import { ChartEmpty, ChartTip, Legend, TipRows } from './ChartBits';
import type { BuildingStackProps } from './types';

export function BuildingStack({ building: b, halls, buildings, height = 240 }: BuildingStackProps) {
  const p = useVwPalette();
  const [ref, width] = useMeasuredWidth(720);
  const { tip, show, hide } = useTip(ref);
  if (!halls || !buildings) return <ChartEmpty title="No halls to place" hint="Set the IT capacity and the hall size to see the buildings." height={height} />;

  const shown = Math.min(buildings, 6);
  const gap = 18, pad = 8, labelH = 18, plantH = 22;
  const bw = Math.max(90, (width - pad * 2 - gap * (shown - 1)) / shown);
  const floorH = Math.min(46, (height - labelH - plantH - 28) / Math.max(1, b.floorsPerBuilding));
  const svgH = labelH + plantH + floorH * b.floorsPerBuilding + 24;
  let remaining = halls;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={width} height={svgH} role="img" aria-label={`${buildings} buildings, ${b.floorsPerBuilding} floors each, ${b.hallsPerFloor} halls per floor`} style={{ display: 'block' }}>
        {Array.from({ length: shown }).map((_, bi) => {
          const x = pad + bi * (bw + gap);
          const base = labelH + floorH * b.floorsPerBuilding;
          const inThis = Math.min(remaining, b.hallsPerBuilding); remaining -= inThis;
          return (
            <g key={bi}>
              <text x={x + bw / 2} y={12} textAnchor="middle" fontSize={11} fontWeight={600} fill={p.ink}>Building {bi + 1}</text>
              {Array.from({ length: b.floorsPerBuilding }).map((__, fi) => {
                const y = base - (fi + 1) * floorH;
                const cellW = (bw - 4) / b.hallsPerFloor;
                return (
                  <g key={fi}>
                    <rect x={x} y={y} width={bw} height={floorH} fill={p.surface} stroke={p.grid} />
                    <text x={x - 3} y={y + floorH / 2 + 3} textAnchor="end" fontSize={9} fill={p.slate}>{bi === 0 ? `F${fi + 1}` : ''}</text>
                    {Array.from({ length: b.hallsPerFloor }).map((___, hi) => {
                      const idx = fi * b.hallsPerFloor + hi; const used = idx < inThis;
                      return (
                        <rect key={hi} x={x + 2 + hi * cellW + 1} y={y + 3} width={cellW - 2} height={floorH - 6} rx={3}
                          fill={used ? p.blue : 'transparent'} fillOpacity={used ? 0.85 : 1} stroke={used ? p.blue : p.slateLight} strokeDasharray={used ? undefined : '3 3'}
                          onMouseMove={e => show(e, <TipRows title={`Building ${bi + 1} · floor ${fi + 1} · hall ${hi + 1}`} rows={used ? [['Racks', b.racksPerHall.toLocaleString('en-US')], ['White space', `${b.hallWhiteSpaceM2.toLocaleString('en-US')} m²`]] : [['Status', 'Spare slot for later growth']]} />)} onMouseLeave={hide} />
                      );
                    })}
                  </g>
                );
              })}
              <rect x={x} y={base} width={bw} height={plantH} fill={p.grid} opacity={0.6} />
              <text x={x + bw / 2} y={base + plantH / 2 + 3} textAnchor="middle" fontSize={9} fill={p.slateDark}>Plant and support</text>
              <text x={x + bw / 2} y={base + plantH + 14} textAnchor="middle" fontSize={10} fill={p.slate}>{inThis} of {b.hallsPerBuilding} halls</text>
            </g>
          );
        })}
      </svg>
      {buildings > shown && <div style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>Showing {shown} of {buildings} buildings.</div>}
      <Legend items={[{ label: 'Data hall in this plan', color: p.blue }, { label: 'Spare hall slot', color: p.slateLight, kind: 'dash' }, { label: 'Plant and support level', color: p.grid }]} style={{ marginTop: 6 }} />
      <ChartTip tip={tip} width={width} />
    </div>
  );
}
