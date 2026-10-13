import { useState } from 'react';
import { Typography, Tooltip, Space } from 'antd';
import { VwSegmented } from '../../../shared/components/ux';
import { useNavigate } from 'react-router-dom';
import type { Hall, Rack } from '../../../mock/data/types';

const { Text } = Typography;
type Metric = 'space' | 'power' | 'thermal';

function band(pct: number): { fill: string; edge: string } {
  if (pct >= 85) return { fill: '#fee2e2', edge: 'var(--vw-color-red-600)' };
  if (pct >= 60) return { fill: '#fef3c7', edge: '#f59e0b' };
  if (pct > 0) return { fill: '#dcfce7', edge: 'var(--vw-color-green-600)' };
  return { fill: '#f1f5f9', edge: '#cbd5e1' };
}

export interface FloorPlanProps {
  hall: Hall;
  racks: Rack[];
  cell?: number;
}

/** Top-down hall layout with a utilization heat overlay. */
export function FloorPlan({ hall, racks, cell = 46 }: FloorPlanProps) {
  const [metric, setMetric] = useState<Metric>('power');
  const navigate = useNavigate();
  const cols = hall.gridCols;
  const rows = hall.gridRows;
  const gap = 4;
  const pad = 10;
  const w = cols * (cell + gap) - gap + pad * 2;
  const h = rows * (cell + gap) - gap + pad * 2;

  const byPos = new Map<string, Rack>();
  for (const r of racks) byPos.set(`${r.gridX},${r.gridY}`, r);

  const valueOf = (r: Rack): number =>
    metric === 'space' ? pct(r.usedU, r.heightU)
      : metric === 'power' ? r.powerUtilizationPct
        : Math.min(100, Math.round((r.thermalDensityKwPerRack / 100) * 100));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text strong>{hall.name} · floor plan</Text>
        <VwSegmented size="small" value={metric} onChange={(v) => setMetric(v as Metric)}
          options={[{ label: 'Space', value: 'space' }, { label: 'Power', value: 'power' }, { label: 'Thermal', value: 'thermal' }]} />
      </div>
      <svg width={w} height={h} style={{ background: '#fff', border: "1px solid var(--vw-color-gray-200)", borderRadius: "var(--vw-radius-sm)" }}>
        {Array.from({ length: rows }).map((_, ry) =>
          Array.from({ length: cols }).map((__, cx) => {
            const r = byPos.get(`${cx},${ry}`);
            const x = pad + cx * (cell + gap);
            const y = pad + ry * (cell + gap);
            if (!r) return <rect key={`${cx}-${ry}`} x={x} y={y} width={cell} height={cell} rx={4} fill="#f8fafc" stroke="#eef2f7" />;
            const v = valueOf(r);
            const { fill, edge } = band(v);
            return (
              <Tooltip key={r.id} title={`${r.name} · ${r.purpose} · ${metric} ${v}% · ${r.currentPowerKw}/${r.maxPowerKw}kW`}>
                <g style={{ cursor: 'pointer' }} onClick={() => navigate(`/facility/racks/${r.id}`)}>
                  <rect x={x} y={y} width={cell} height={cell} rx={4} fill={fill} stroke={edge} strokeWidth={1.5} />
                  <text x={x + cell / 2} y={y + cell / 2 - 2} textAnchor="middle" fontSize="8" fill="#334155">{r.name.replace('R-', '')}</text>
                  <text x={x + cell / 2} y={y + cell / 2 + 10} textAnchor="middle" fontSize="9" fontWeight="600" fill={edge}>{v}%</text>
                </g>
              </Tooltip>
            );
          }),
        )}
      </svg>
      <Space size={16} style={{ marginTop: 10 }}>
        <Legend color="var(--vw-color-green-600)" label="<60%" />
        <Legend color="#f59e0b" label="60–85%" />
        <Legend color="var(--vw-color-red-600)" label="≥85%" />
        <Legend color="#cbd5e1" label="empty" />
      </Space>
    </div>
  );
}

function pct(used: number, total: number) { return total > 0 ? Math.round((used / total) * 100) : 0; }
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)" }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />{label}
    </span>
  );
}

export default FloorPlan;
