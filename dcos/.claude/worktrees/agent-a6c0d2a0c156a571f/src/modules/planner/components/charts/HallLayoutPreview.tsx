/**
 * Hall layout — a schematic top-down of one representative hall: rack rows in hot/cold aisle
 * pairs with cold-aisle containment, racks coloured by class share, CRAH (or CDU) units along
 * the walls, PDUs at the row ends and, for liquid cooling, coolant manifolds along each row.
 */
import { useMemo, useState } from 'react';
import { useVwPalette } from '../../../site360/lib/siteModel';
import { fmtKw } from '../../lib/engine';
import type { HallLayoutPreviewProps } from './types';
import { useMeasuredWidth, useTip, fmtInt } from './chartKit';
import { ChartTip, TipRows, ChartEmpty, Legend, ChartNote } from './ChartBits';

const RACK_W = 10, RACK_D = 18, AISLE_COLD = 16, AISLE_HOT = 12, WALL = 26, GAP = 8;
const CLASS_ORDER = ['GPU', 'Compute', 'Storage'];

export function HallLayoutPreview({ sizing, densityKwPerRack, liquid, height = 320, onPickHall }: HallLayoutPreviewProps) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth();
  const { tip, show, hide } = useTip(wrapRef);
  const [hall, setHall] = useState(0);

  const halls = Math.max(0, sizing.halls);
  const racksPerHall = halls ? Math.ceil(sizing.racks / halls) : 0;
  const racksThisHall = halls ? Math.max(0, Math.min(racksPerHall, sizing.racks - racksPerHall * hall)) : 0;
  const classColor: Record<string, string> = { GPU: p.violet, Compute: p.blue, Storage: p.cyan };

  const layout = useMemo(() => {
    if (!racksPerHall) return null;
    const rowLen = Math.min(24, Math.max(6, Math.ceil(Math.sqrt(racksPerHall * 1.8))));
    const nRows = Math.ceil(racksPerHall / rowLen);
    const pairs = Math.ceil(nRows / 2);
    // Rack class by cumulative share so the first racks are GPU, then compute, then storage.
    const classes = CLASS_ORDER.map((name) => sizing.rackClasses.find((c) => c.name === name)).filter((c): c is NonNullable<typeof c> => !!c);
    const totalClassRacks = classes.reduce((a, c) => a + c.racks, 0) || 1;
    const classAt = (i: number) => { let acc = 0; for (const c of classes) { acc += (c.racks / totalClassRacks) * racksPerHall; if (i < acc) return c; } return classes[classes.length - 1] ?? { name: 'Compute', kw: densityKwPerRack, racks: 0, sharePct: 100 }; };
    const racks: { i: number; row: number; col: number; x: number; y: number; cls: string; kw: number }[] = [];
    const rowY: number[] = [];
    let yCur = WALL + GAP;
    for (let r = 0; r < nRows; r++) {
      rowY.push(yCur);
      yCur += RACK_D + (r % 2 === 0 ? AISLE_COLD : AISLE_HOT);
    }
    const contentH = (rowY[nRows - 1] ?? WALL + GAP) + RACK_D + GAP + WALL;
    const contentW = WALL + GAP + rowLen * RACK_W + GAP + WALL;
    for (let i = 0; i < racksPerHall; i++) {
      const row = Math.floor(i / rowLen), col = i % rowLen;
      const c = classAt(i);
      racks.push({ i, row, col, x: WALL + GAP + col * RACK_W, y: rowY[row], cls: c.name, kw: c.kw });
    }
    const unitsPerHall = halls ? Math.max(1, Math.ceil(sizing.cooling.units / halls)) : 0;
    const unitLabel = liquid || sizing.cooling.type === 'liquid-to-chip' ? 'CDU' : sizing.cooling.type === 'in-row' ? 'IRC' : sizing.cooling.type === 'rear-door' ? 'RDHx' : 'CRAH';
    return { rowLen, nRows, pairs, racks, rowY, contentH, contentW, unitsPerHall, unitLabel, classes };
  }, [racksPerHall, sizing.rackClasses, sizing.cooling.units, sizing.cooling.type, halls, liquid, densityKwPerRack]);

  if (!layout || !halls) return <ChartEmpty title="No halls to lay out" hint="Set a design load and density; the hall schematic derives rows, containment and cooling units from the sizing." height={height} />;

  const w = Math.max(320, width);
  const tabsH = onPickHall && halls > 1 ? 30 : 0;
  const svgH = Math.max(160, height - tabsH);
  const scale = Math.min((w - 8) / layout.contentW, svgH / layout.contentH);
  const offX = (w - layout.contentW * scale) / 2, offY = (svgH - layout.contentH * scale) / 2;
  const hallKw = Math.round(racksThisHall * densityKwPerRack);
  const hallM2 = Math.round(sizing.whiteSpaceM2 / halls);
  const buildings = Math.max(1, sizing.buildings);
  const visibleTabs = Math.min(halls, 10);
  // Cooling units along the left/right walls, alternating.
  const units = Array.from({ length: layout.unitsPerHall }, (_, i) => ({ i, side: i % 2 === 0 ? 'left' : 'right' as 'left' | 'right', slot: Math.floor(i / 2) }));
  const slotsPerSide = Math.max(1, Math.ceil(layout.unitsPerHall / 2));
  const unitH = Math.min(22, Math.max(8, (layout.contentH - 2 * WALL - 2 * GAP) / slotsPerSide - 3));
  const unitStep = (layout.contentH - 2 * WALL - 2 * GAP) / slotsPerSide;
  const pduW = Math.min(12, WALL - 10);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      {tabsH > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
          {Array.from({ length: visibleTabs }, (_, i) => (
            <button key={i} type="button" onClick={() => { setHall(i); onPickHall?.(i); }}
              className={`vw-chip ${hall === i ? 'vw-chip--info' : 'vw-chip--neutral'}`} style={{ cursor: 'pointer', border: 'none', fontSize: 11, lineHeight: '18px', padding: '0 8px' }}>
              Hall {i + 1}
            </button>
          ))}
          {halls > visibleTabs && <span style={{ fontSize: 11, color: 'var(--vw-color-slate-500)', alignSelf: 'center' }}>+{halls - visibleTabs} more</span>}
        </div>
      )}
      <svg width={w} height={svgH} style={{ display: 'block' }} onMouseLeave={hide}>
        <g transform={`translate(${offX},${offY}) scale(${scale})`}>
          {/* hall shell */}
          <rect x={0} y={0} width={layout.contentW} height={layout.contentH} rx={3} fill={p.surface} stroke={p.slateDark} strokeWidth={1.5 / scale} />
          <rect x={WALL} y={WALL} width={layout.contentW - 2 * WALL} height={layout.contentH - 2 * WALL} fill="none" stroke={p.grid} strokeWidth={1 / scale} strokeDasharray={`${3 / scale} ${3 / scale}`} />
          {/* cold-aisle containment outlines around each row pair */}
          {Array.from({ length: layout.pairs }, (_, k) => {
            const r0 = 2 * k, r1 = Math.min(layout.nRows - 1, 2 * k + 1);
            const y0 = layout.rowY[r0] - 2, y1 = (r1 > r0 ? layout.rowY[r1] + RACK_D : layout.rowY[r0] + RACK_D + AISLE_COLD) + 2;
            const x0 = WALL + GAP - 2, x1 = WALL + GAP + layout.rowLen * RACK_W + 2;
            return (
              <g key={k}>
                <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={2} fill={p.cyan} opacity={0.06} />
                <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={2} fill="none" stroke={p.cyan} strokeWidth={1 / scale} strokeDasharray={`${4 / scale} ${2 / scale}`} />
                <text x={x1 + 3} y={(y0 + y1) / 2} dy="0.35em" fontSize={5.5} fill={p.cyan}>cold aisle {k + 1}</text>
                {(liquid || sizing.cooling.type === 'liquid-to-chip') && [r0, r1].filter((r, i, a) => a.indexOf(r) === i).map((r) => (
                  <line key={r} x1={x0 - 2} x2={x1 + 2} y1={layout.rowY[r] + RACK_D - 2} y2={layout.rowY[r] + RACK_D - 2} stroke={p.cyan} strokeWidth={1.5 / scale} strokeDasharray={`${2 / scale} ${1.5 / scale}`} />
                ))}
              </g>
            );
          })}
          {/* hot aisle labels */}
          {Array.from({ length: Math.max(0, layout.pairs - 1) }, (_, k) => {
            const r = 2 * k + 1;
            if (r + 1 >= layout.nRows) return null;
            const yMid = layout.rowY[r] + RACK_D + AISLE_HOT / 2;
            return <text key={k} x={WALL + GAP + (layout.rowLen * RACK_W) / 2} y={yMid} dy="0.35em" textAnchor="middle" fontSize={5} fill={p.rose} opacity={0.8}>hot aisle</text>;
          })}
          {/* racks */}
          {layout.racks.map((r) => {
            const planned = r.i < racksThisHall;
            return (
              <rect key={r.i} x={r.x + 0.6} y={r.y} width={RACK_W - 1.2} height={RACK_D} rx={1} fill={planned ? classColor[r.cls] ?? p.slate : p.slateLight} opacity={planned ? 0.9 : 0.35} stroke={p.surface} strokeWidth={0.5 / scale}
                onMouseMove={(e) => show(e, <TipRows title={`Rack ${String(r.i + 1).padStart(2, '0')} · row ${r.row + 1}`} rows={[['Class', r.cls], ['Design load', `${r.kw} kW`], ['Status', planned ? 'planned' : 'spare slot']]} />)} />
            );
          })}
          {/* PDUs at both ends of each row */}
          {layout.rowY.map((ry, r) => (
            <g key={r}>
              <rect x={WALL - pduW - 1} y={ry + 2} width={pduW} height={RACK_D - 4} rx={1} fill={p.amber} opacity={0.9} />
              <rect x={layout.contentW - WALL + 1} y={ry + 2} width={pduW} height={RACK_D - 4} rx={1} fill={p.amber} opacity={0.9} />
              <text x={WALL - pduW / 2 - 1} y={ry + RACK_D / 2} dy="0.35em" textAnchor="middle" fontSize={4.5} fill={p.surface} fontWeight={700}>A</text>
              <text x={layout.contentW - WALL + 1 + pduW / 2} y={ry + RACK_D / 2} dy="0.35em" textAnchor="middle" fontSize={4.5} fill={p.surface} fontWeight={700}>B</text>
            </g>
          ))}
          {/* cooling units along the walls */}
          {units.map((u) => {
            const ux = u.side === 'left' ? 3 : layout.contentW - WALL + 3 + pduW + 2;
            const uw = WALL - pduW - 6;
            const uy = WALL + GAP + u.slot * unitStep + (unitStep - unitH) / 2;
            return (
              <g key={u.i} onMouseMove={(e) => show(e, <TipRows title={`${layout.unitLabel} ${u.i + 1}`} rows={[['Capacity', fmtKw(sizing.cooling.unitKw)], ['Redundancy', sizing.cooling.redundancy], ['Type', sizing.cooling.type]]} />)}>
                <rect x={ux} y={uy} width={Math.max(6, uw)} height={unitH} rx={1.5} fill={liquid ? p.cyan : p.emerald} opacity={0.85} />
                {unitH >= 10 && <text x={ux + Math.max(6, uw) / 2} y={uy + unitH / 2} dy="0.35em" textAnchor="middle" fontSize={4.5} fill={p.surface} fontWeight={700}>{layout.unitLabel}</text>}
              </g>
            );
          })}
          <text x={layout.contentW / 2} y={layout.contentH - 6} textAnchor="middle" fontSize={6} fill={p.slate}>
            Hall {hall + 1} · {fmtInt(racksThisHall)} racks in {layout.nRows} rows · {fmtInt(hallM2)} m² white space · {densityKwPerRack} kW/rack · {fmtKw(hallKw)}
          </text>
        </g>
      </svg>
      <ChartTip tip={tip} width={w} />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
        <Legend items={[
          ...layout.classes.map((c) => ({ label: `${c.name} ${c.sharePct}%`, color: classColor[c.name] ?? p.slate })),
          { label: `${layout.unitLabel} × ${layout.unitsPerHall} per hall (${sizing.cooling.redundancy})`, color: liquid ? p.cyan : p.emerald },
          { label: 'PDU A / B', color: p.amber },
          { label: 'Cold-aisle containment', color: p.cyan, kind: 'dash' },
          ...(liquid ? [{ label: 'Coolant manifold', color: p.cyan, kind: 'dash' as const }] : []),
        ]} />
        <ChartNote>× {halls} hall{halls === 1 ? '' : 's'} across {buildings} building{buildings === 1 ? '' : 's'} · {fmtInt(sizing.racks)} racks · {fmtInt(sizing.whiteSpaceM2)} m²</ChartNote>
      </div>
    </div>
  );
}
