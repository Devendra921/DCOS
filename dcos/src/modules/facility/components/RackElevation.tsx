import { useRef, useState } from 'react';
import { Typography, Tooltip } from 'antd';
import { Seg } from '../../../ops/ui/kit';
import type { Rack } from '../../../mock/data/types';
import { TECHNOLOGY_COLORS } from '../../../core/theme/themeConfig';

const { Text } = Typography;
type ColorBy = 'category' | 'power' | 'thermal';

/** Minimal structural shape a rack-mounted unit must expose for elevation rendering. */
export interface RackUnit {
  id: string;
  startU?: number | null;
  heightU?: number;
  category?: string;
  hostname?: string;
  model?: string;
  powerDrawW?: number;
  ratedThermalW?: number;
}

function heat(pct: number): string { return pct >= 85 ? '#fee2e2' : pct >= 60 ? '#fef3c7' : '#dcfce7'; }
function heatEdge(pct: number): string { return pct >= 85 ? 'var(--vw-color-red-600)' : pct >= 60 ? '#f59e0b' : 'var(--vw-color-green-600)'; }
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface RackElevationProps {
  rack: Rack;
  assets: RackUnit[];
  unitPx?: number;
  width?: number;
  /** When provided, assets become drag-to-move; called with the snapped target U. */
  onMoveAsset?: (assetId: string, newStartU: number) => void;
  /** When provided, a click (without dragging) on a unit calls this with its id. */
  onOpenDevice?: (id: string) => void;
}

export function RackElevation({ rack, assets, unitPx = 15, width = 280, onMoveAsset, onOpenDevice }: RackElevationProps) {
  const [colorBy, setColorBy] = useState<ColorBy>('category');
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghostTopU, setGhostTopU] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const movedRef = useRef(false);
  const startYRef = useRef(0);

  const U = rack.heightU;
  const padTop = 8;
  const labelW = 26;
  const frameX = labelW + 6;
  const frameW = width - frameX - 10;
  const bodyH = U * unitPx;
  const svgH = bodyH + padTop * 2;
  const draggable = !!onMoveAsset;
  const interactive = !!onMoveAsset || !!onOpenDevice;

  const colorFor = (a: RackUnit): { fill: string; edge: string } => {
    // `color-mix()`, not string-concatenating an alpha suffix onto `c` — the
    // old `c + '22'` approach only produces a valid color when `c` happens
    // to be a literal hex string; TECHNOLOGY_COLORS values are token
    // references (`var(--vw-color-*)`), and concatenating onto those
    // produces invalid CSS like `var(--vw-color-green-600)22`.
    if (colorBy === 'category') { const c = (a.category ? TECHNOLOGY_COLORS[a.category] : undefined) ?? '#64748b'; return { fill: `color-mix(in srgb, ${c} 13%, transparent)`, edge: c }; }
    const draw = a.powerDrawW ?? 0;
    const denom = a.ratedThermalW || draw || 1;
    const p = clamp(Math.round((draw / denom) * 100), 0, 100);
    return { fill: heat(p), edge: heatEdge(p) };
  };

  const topUOf = (a: RackUnit): number =>
    a.id === dragId && ghostTopU != null ? ghostTopU : (a.startU ?? 1) + (a.heightU ?? 1) - 1;

  const yToTopU = (clientY: number, h: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return h;
    const yLocal = clientY - rect.top - padTop;
    return clamp(Math.round(U - yLocal / unitPx) + Math.floor(h / 2), h, U);
  };

  const onDown = (e: React.PointerEvent, a: RackUnit) => {
    if (!interactive) return;
    e.preventDefault();
    setDragId(a.id);
    movedRef.current = false;
    startYRef.current = e.clientY;
    setGhostTopU((a.startU ?? 1) + (a.heightU ?? 1) - 1);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    if (Math.abs(e.clientY - startYRef.current) > 4) movedRef.current = true;
    if (!draggable) return;
    const a = assets.find((x) => x.id === dragId);
    if (a) setGhostTopU(yToTopU(e.clientY, a.heightU ?? 1));
  };
  const onUp = () => {
    if (dragId) {
      if (!movedRef.current && onOpenDevice) {
        onOpenDevice(dragId);
      } else if (movedRef.current && draggable && ghostTopU != null) {
        const a = assets.find((x) => x.id === dragId);
        if (a) onMoveAsset?.(a.id, ghostTopU - (a.heightU ?? 1) + 1);
      }
    }
    setDragId(null); setGhostTopU(null);
  };

  return (
    <div style={{ width, maxWidth: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: "var(--vw-space-sm)" }}>
        <Text strong>{rack.name}</Text>
        <Seg<ColorBy> size="sm" value={colorBy} onChange={setColorBy}
          options={[{ id: 'category', label: 'Type' }, { id: 'power', label: 'Power' }, { id: 'thermal', label: 'Thermal' }]} />
      </div>
      <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
      <svg ref={svgRef} width={width} height={svgH} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        style={{ background: "var(--vw-color-slate-50)", borderRadius: "var(--vw-radius-sm)", border: "1px solid var(--vw-color-gray-200)", touchAction: 'none' }}>
        {Array.from({ length: U + 1 }).map((_, i) => {
          const u = U - i; const y = padTop + i * unitPx;
          return (
            <g key={i}>
              {u % 5 === 0 && u > 0 && <text x={labelW} y={y + 4} textAnchor="end" fontSize="8" fill="var(--vw-color-slate-400)">{u}</text>}
              <line x1={frameX} y1={y} x2={frameX + frameW} y2={y} stroke="#f1f5f9" />
            </g>
          );
        })}
        <rect x={frameX} y={padTop} width={frameW} height={bodyH} fill="none" stroke="#cbd5e1" strokeWidth={1.5} rx={3} />
        {/* Zero-U kit (rack PDUs, access points) mounts outside the rail space and is listed in the assets table instead. */}
        {assets.filter((a) => a.startU != null && (a.heightU ?? 1) > 0).map((a) => {
          const top = topUOf(a); const y = padTop + (U - top) * unitPx; const h = (a.heightU ?? 1) * unitPx - 2;
          const { fill, edge } = colorFor(a); const isDrag = a.id === dragId;
          const label = a.hostname ?? a.model ?? '';
          return (
            <Tooltip key={a.id} title={`${label || a.id} · ${a.category ?? '—'} · ${a.powerDrawW ?? 0}W${draggable ? ' · drag to move' : ''}`}>
              <g onPointerDown={(e) => onDown(e, a)} style={{ cursor: draggable ? 'grab' : 'default', opacity: isDrag ? 0.85 : 1 }}>
                <rect x={frameX + 3} y={y + 1} width={frameW - 6} height={h} rx={2} fill={fill} stroke={edge} strokeWidth={isDrag ? 2 : 1} strokeDasharray={isDrag ? '4 2' : undefined} />
                <rect x={frameX + 3} y={y + 1} width={3} height={h} fill={edge} />
                {h > 11 && <text x={frameX + 12} y={y + h / 2 + 3} fontSize="9" fill="#334155">{label.slice(0, 22)}</text>}
              </g>
            </Tooltip>
          );
        })}
      </svg>
      </div>
    </div>
  );
}

export default RackElevation;
