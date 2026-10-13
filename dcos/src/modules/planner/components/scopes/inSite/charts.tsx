/* In-site drawings: the real hall grid with the plan's positions, and a rack elevation from the U map. */
import { useVwPalette } from '../../../../site360/lib/siteModel';
import type * as T from '../../../../../mock/data/types';
import type { HallGrid } from '../../../lib/placement';
import type { RackBaseline } from '../../../lib/site';
import { muted } from './helpers';

export interface GridMark { gridX: number; gridY: number }
/** Top-down hall grid: every position from DCIM, coloured by state, with the plan's positions on top. */
export function HallGridView({ grid, marks = [], markLabel = 'This plan', positions, cols: colsIn, rows: rowsIn, title }: { grid?: HallGrid; marks?: GridMark[]; markLabel?: string; positions?: GridMark[]; cols?: number; rows?: number; title?: string }) {
  const p = useVwPalette();
  const cols = grid?.cols ?? colsIn ?? Math.max(1, ...(positions ?? marks).map(m => m.gridX + 1));
  const rows = grid?.rows ?? rowsIn ?? Math.max(1, ...(positions ?? marks).map(m => m.gridY + 1));
  const cw = 26, ch = 34, gap = 4, aisle = 14, left = 64, top = 18;
  const y0 = (y: number) => top + y * (ch + gap) + Math.ceil(y / 2) * aisle;
  const width = left + cols * (cw + gap) + 8, height = y0(rows) + 24;
  const marked = new Set(marks.map(m => `${m.gridX}:${m.gridY}`));
  const fill: Record<string, string> = { free: p.surface, 'empty-rack': p.blueLight, occupied: p.slateLight, retired: p.grid, held: p.amber };
  const label: Record<string, string> = { free: 'Free position', 'empty-rack': 'Empty cabinet (free)', occupied: 'Live rack', retired: 'Retired cabinet', held: 'Held by another plan' };
  const legend = [['occupied', 'Live rack'], ['empty-rack', 'Empty cabinet'], ['free', 'Free position'], ['held', 'Held by another plan']] as const;
  return (
    <div>
      {title && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{title}</div>}
      <div style={{ overflowX: 'auto' }}>
        <svg width={width} height={height} role="img" aria-label="Hall grid">
          {Array.from({ length: rows }, (_, y) => (
            <g key={y}>
              <text x={4} y={y0(y) + ch / 2 + 4} fontSize={11} fill={p.slate}>{grid?.rowByY.get(y)?.name ?? `Line ${y + 1}`}</text>
              {Array.from({ length: cols }, (_, x) => {
                const cell = grid?.cells[y]?.[x];
                const state = cell?.state ?? 'free';
                const on = marked.has(`${x}:${y}`);
                return (
                  <rect key={x} x={left + x * (cw + gap)} y={y0(y)} width={cw} height={ch} rx={3} fill={on ? p.emerald : fill[state]} stroke={on ? p.ink : p.slate} strokeWidth={on ? 1.5 : 0.6} opacity={state === 'retired' && !on ? 0.6 : 1}>
                    <title>{`${grid?.rowByY.get(y)?.name ?? `Line ${y + 1}`}, position ${x + 1}: ${on ? `${markLabel} · ` : ''}${label[state]}${cell?.rack ? ` · ${cell.rack.name} ${cell.rack.currentPowerKw} of ${cell.rack.maxPowerKw} kW` : ''}`}</title>
                  </rect>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
      <div className="vw-flex vw-gap-sm vw-wrap" style={muted}>
        <span className="vw-flex vw-items-center vw-gap-xs"><svg width={12} height={12}><rect width={12} height={12} rx={2} fill={p.emerald} /></svg>{markLabel}</span>
        {legend.map(([k, l]) => <span key={k} className="vw-flex vw-items-center vw-gap-xs"><svg width={12} height={12}><rect width={12} height={12} rx={2} fill={fill[k]} stroke={p.slate} strokeWidth={0.6} /></svg>{l}</span>)}
        <span>Rows are drawn in facing pairs around their aisles.</span>
      </div>
    </div>
  );
}

/** Rack elevation from DCIM: devices at their U, active rack reservations, and the plan's block. */
export function RackElevation({ rb, block, label = 'This plan', height = 360 }: { rb: RackBaseline; block?: { start: number; end: number }; label?: string; height?: number }) {
  const p = useVwPalette();
  const H = rb.rack.heightU || 42; const uh = Math.max(5, Math.min(9, (height - 30) / H)); const w = 170, left = 30, top = 10;
  const yOf = (u: number) => top + (H - u) * uh;
  const devs = rb.devices.filter(d => d.position && d.category !== 'PDU') as (T.Device & { position: number })[];
  const reservedOnly = [...rb.usedUnits].filter(u => !devs.some(d => u >= d.position && u < d.position + Math.max(1, d.heightU ?? 1)));
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{rb.rack.name} · {H}U · {rb.hall?.name ?? ''} {rb.row?.name ?? ''}</div>
      <svg width={left + w + 12} height={top + H * uh + 14} role="img" aria-label={`Elevation of ${rb.rack.name}`}>
        <rect x={left} y={top} width={w} height={H * uh} fill={p.surface} stroke={p.slate} strokeWidth={1} />
        {Array.from({ length: H }, (_, i) => i + 1).filter(u => u % 5 === 0 || u === 1).map(u => <text key={u} x={left - 4} y={yOf(u) + uh - 1} fontSize={9} textAnchor="end" fill={p.slate}>{u}</text>)}
        {reservedOnly.map(u => <rect key={`r${u}`} x={left + 1} y={yOf(u)} width={w - 2} height={uh} fill={p.amber} opacity={0.55}><title>{`U${u}: held by a rack reservation`}</title></rect>)}
        {devs.map(d => { const hU = Math.max(1, d.heightU ?? 1); return (
          <g key={d.id}><rect x={left + 1} y={yOf(d.position + hU - 1)} width={w - 2} height={hU * uh - 0.5} fill={p.slateLight} stroke={p.slate} strokeWidth={0.5}><title>{`U${d.position}${hU > 1 ? `–U${d.position + hU - 1}` : ''}: ${d.name} (${d.model ?? d.category})`}</title></rect>
            {hU * uh >= 9 && <text x={left + 5} y={yOf(d.position + hU - 1) + Math.min(hU * uh, 12) - 3} fontSize={8} fill={p.ink}>{d.name.slice(0, 26)}</text>}</g>
        ); })}
        {block && <rect x={left + 1} y={yOf(block.end)} width={w - 2} height={(block.end - block.start + 1) * uh} fill={p.emerald} opacity={0.85}><title>{`U${block.start}–U${block.end}: ${label}`}</title></rect>}
        {block && <text x={left + 6} y={yOf(block.end) + 11} fontSize={10} fontWeight={600} fill={p.ink}>{label} U{block.start}–U{block.end}</text>}
      </svg>
      <div style={muted}>Grey: devices in DCIM. Amber: units held by a rack reservation. Green: {label.toLowerCase()}.</div>
    </div>
  );
}
