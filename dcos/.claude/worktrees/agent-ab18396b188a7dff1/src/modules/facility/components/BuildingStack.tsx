import { Typography } from 'antd';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { Hall } from '../../../mock/data/types';

const { Text } = Typography;
const heatC = (v: number) => (v >= 85 ? 'var(--vw-color-red-600)' : v >= 60 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-green-600)');

/**
 * 2.5D building stack — the data-center as an isometric tower of halls, each a
 * floor slab heat-coloured by utilisation. Click a floor to open its plan.
 */
export function BuildingStack({ dcId, onFloor }: { dcId: string; onFloor: (hallId: string) => void }) {
  const halls = (useEntityList('halls', { pageSize: 2000, filters: [{ field: 'dataCenterId', operator: 'eq', value: dcId }] }).data?.data ?? []) as unknown as Hall[];
  const floors = [...halls].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6);
  if (!floors.length) return <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>No halls recorded for this site.</Text>;

  const W = 150, D = 34, T = 24, gap = 8, padX = 8, padTop = 8;
  const n = floors.length;
  const svgW = padX + W + D + 56;
  const svgH = padTop + D + n * (T + gap) + 6;

  return (
    <div>
      <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>Building · {n} hall{n > 1 ? 's' : ''}</Text>
      <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: 300, display: 'block', marginTop: "var(--vw-space-xxs)" }}>
        {floors.map((h, i) => {
          const idxFromBottom = n - 1 - i;
          const y = padTop + D + idxFromBottom * (T + gap) + T;
          const x0 = padX;
          const c = heatC(h.utilizationPct);
          const front = `${x0},${y} ${x0 + W},${y} ${x0 + W},${y - T} ${x0},${y - T}`;
          const top = `${x0},${y - T} ${x0 + W},${y - T} ${x0 + W + D},${y - T - D / 2} ${x0 + D},${y - T - D / 2}`;
          const right = `${x0 + W},${y} ${x0 + W + D},${y - D / 2} ${x0 + W + D},${y - T - D / 2} ${x0 + W},${y - T}`;
          return (
            <g key={h.id} style={{ cursor: 'pointer' }} onClick={() => onFloor(h.id)}>
              <polygon points={top} fill={c} opacity={0.6} />
              <polygon points={right} fill={c} opacity={0.82} />
              <polygon points={front} fill={c} opacity={0.95} stroke="#fff" strokeWidth={1} />
              <text x={x0 + 8} y={y - T / 2 + 4} fontSize="10" fill="#fff" fontWeight={600}>{h.name}</text>
              <text x={x0 + W + D + 4} y={y - T / 2 + 4} fontSize="10" fill="#515151" fontWeight={600}>{h.utilizationPct}%</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default BuildingStack;
