import { useState } from 'react';
import { Typography, Tooltip, Space } from 'antd';
import { Seg } from '../../../ops/ui/kit';
import { useNavigate } from 'react-router-dom';
import type { Hall, Rack } from '../../../mock/data/types';
import { rackDensity } from '../lib/estateView';

const { Text } = Typography;
type Metric = 'space' | 'power' | 'thermal' | 'density' | 'tenant';

/** Tenant colours (token pairs) — assigned in order of first appearance; operator racks stay neutral. */
const TENANT_TONES = ['blue', 'violet', 'teal', 'amber', 'pink', 'indigo', 'emerald', 'cyan'].map((c) => ({ fill: `var(--vw-color-${c}-100)`, edge: `var(--vw-color-${c}-600)` }));
const OPERATOR_TONE = { fill: 'var(--vw-color-slate-100)', edge: 'var(--vw-color-slate-400)' };

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
  /** Tenant customer name by id (tenant view and tooltips). */
  tenantName?: (customerId: string) => string | undefined;
  /** CDU name by id (tooltips). */
  cduName?: (cduId: string) => string | undefined;
}

/** Top-down hall layout with a utilization heat overlay. */
export function FloorPlan({ hall, racks, cell = 46, tenantName, cduName }: FloorPlanProps) {
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

  const tenants = [...new Set(racks.filter((r) => r.ownerKind === 'tenant' && r.tenantCustomerId).map((r) => r.tenantCustomerId!))];
  const tenantTone = (r: Rack) => (r.ownerKind === 'tenant' && r.tenantCustomerId ? TENANT_TONES[tenants.indexOf(r.tenantCustomerId) % TENANT_TONES.length] : OPERATOR_TONE);
  const hasLiquid = racks.some((r) => r.liquidCooled);
  const describe = (r: Rack) => [
    rackDensity(r) === 'ai' ? 'AI density' : 'standard density',
    r.liquidCooled ? `liquid-cooled${r.cduId ? ` by ${cduName?.(r.cduId) ?? r.cduId}` : ''}` : undefined,
    r.ownerKind === 'tenant' && r.tenantCustomerId ? `tenant ${tenantName?.(r.tenantCustomerId) ?? r.tenantCustomerId}${r.contractedKw != null ? ` (${r.contractedKw} kW contracted)` : ''}` : undefined,
  ].filter(Boolean).join(' · ');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <Text strong>{hall.name} · floor plan</Text>
        <Seg<Metric> size="sm" value={metric} onChange={setMetric}
          options={[{ id: 'space', label: 'Space' }, { id: 'power', label: 'Power' }, { id: 'thermal', label: 'Thermal' }, { id: 'density', label: 'Density' }, { id: 'tenant', label: 'Tenant' }]} />
      </div>
      <div style={{ maxWidth: '100%', overflowX: 'auto' }} tabIndex={0} role="region" aria-label={`${hall.name} rack floor plan`}>
      <svg width={w} height={h} style={{ background: '#fff', border: "1px solid var(--vw-color-gray-200)", borderRadius: "var(--vw-radius-sm)" }}>
        {Array.from({ length: rows }).map((_, ry) =>
          Array.from({ length: cols }).map((__, cx) => {
            const r = byPos.get(`${cx},${ry}`);
            const x = pad + cx * (cell + gap);
            const y = pad + ry * (cell + gap);
            if (!r) return <rect key={`${cx}-${ry}`} x={x} y={y} width={cell} height={cell} rx={4} fill="#f8fafc" stroke="#eef2f7" />;
            const v = valueOf(r);
            const ai = rackDensity(r) === 'ai';
            const { fill, edge } = metric === 'density'
              ? (ai ? { fill: 'var(--vw-color-violet-100)', edge: 'var(--vw-color-violet-600)' } : OPERATOR_TONE)
              : metric === 'tenant' ? tenantTone(r) : band(v);
            const caption = metric === 'density' ? (ai ? 'AI' : 'Std') : metric === 'tenant' ? (r.ownerKind === 'tenant' ? (r.contractedKw != null ? `${r.contractedKw}kW` : 'Tenant') : 'Own') : `${v}%`;
            return (
              <Tooltip key={r.id} title={`${r.name} · ${r.purpose} · ${metric === 'density' || metric === 'tenant' ? '' : `${metric} ${v}% · `}${r.currentPowerKw}/${r.maxPowerKw}kW · ${describe(r)}`}>
                <g style={{ cursor: 'pointer' }} onClick={() => navigate(`/facility/racks/${r.id}`)}>
                  <rect x={x} y={y} width={cell} height={cell} rx={4} fill={fill} stroke={edge} strokeWidth={1.5} />
                  {r.liquidCooled && <circle cx={x + cell - 7} cy={y + 7} r={3.5} fill="var(--vw-color-cyan-500)" aria-label="Liquid-cooled" />}
                  <text x={x + cell / 2} y={y + cell / 2 - 2} textAnchor="middle" fontSize="8" fill="#334155">{r.name.replace('R-', '')}</text>
                  <text x={x + cell / 2} y={y + cell / 2 + 10} textAnchor="middle" fontSize="9" fontWeight="600" fill={edge}>{caption}</text>
                </g>
              </Tooltip>
            );
          }),
        )}
      </svg>
      </div>
      <Space wrap size={16} style={{ marginTop: 10 }}>
        {metric === 'density' ? <>
          <Legend color="var(--vw-color-violet-600)" label="AI / high density" />
          <Legend color="var(--vw-color-slate-400)" label="Standard" />
        </> : metric === 'tenant' ? <>
          <Legend color={OPERATOR_TONE.edge} label="Operator" />
          {tenants.map((t, i) => <Legend key={t} color={TENANT_TONES[i % TENANT_TONES.length].edge} label={tenantName?.(t) ?? t} />)}
        </> : <>
          <Legend color="var(--vw-color-green-600)" label="<60%" />
          <Legend color="#f59e0b" label="60–85%" />
          <Legend color="var(--vw-color-red-600)" label="≥85%" />
          <Legend color="#cbd5e1" label="empty" />
        </>}
        {hasLiquid && <Legend color="var(--vw-color-cyan-500)" label="liquid-cooled (dot)" round />}
      </Space>
    </div>
  );
}

function pct(used: number, total: number) { return total > 0 ? Math.round((used / total) * 100) : 0; }
function Legend({ color, label, round }: { color: string; label: string; round?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)" }}>
      <span style={{ width: round ? 8 : 12, height: round ? 8 : 12, borderRadius: round ? '50%' : 3, background: color, display: 'inline-block' }} />{label}
    </span>
  );
}

export default FloorPlan;
