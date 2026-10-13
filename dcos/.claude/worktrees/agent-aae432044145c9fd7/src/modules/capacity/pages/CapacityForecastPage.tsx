import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Row, Col, Empty } from 'antd';
import { DashboardOutlined, ReconciliationOutlined, ProjectOutlined, FieldTimeOutlined, ClockCircleOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { KPICard } from '../../../shared/components/KPICard';
import { bucketSum } from '../../../shared/kpi/timeSeries';
import { decodeDetail } from '../../planning/lib/planExec';
import { useCapacity } from '../lib/useCapacity';
import type { Device, Plan } from '../../../mock/data/types';
import { VwCard, VwChip, VwSegmented} from '../../../shared/components/ux';

const { Text } = Typography;
const num = (v: unknown) => (Number(v) || 0);

type ResKey = 'power' | 'cooling' | 'space' | 'gpu';
const RES: { key: ResKey; label: string; unit: string }[] = [
  { key: 'power', label: 'Power', unit: 'kW' },
  { key: 'cooling', label: 'Cooling', unit: 'kW' },
  { key: 'space', label: 'Space', unit: 'U' },
  { key: 'gpu', label: 'GPU', unit: 'GPUs' },
];

interface Proj { hist: number[]; proj: number[]; curUtil: number; exhaustMonth: number; headroom: number; cur: number; max: number; pipeline: number; }

/** Generic projection: organic monthly adds + a committed-pipeline bump landing at month 3. */
function project(addPerMonth: number[], cur: number, max: number, pipeline: number): Proj {
  const totalMax = max || 1;
  const cum: number[] = []; let run = 0;
  for (const v of addPerMonth) { run += v; cum.push(run); }
  const added12 = cum[cum.length - 1] || 0;
  const baseline = Math.max(0, cur - added12);
  const hist = cum.map((c) => Math.min(115, ((baseline + c) / totalMax) * 100));
  const monthlyAdd = (addPerMonth.slice(-3).reduce((s, x) => s + x, 0) / 3) || 0;
  const proj: number[] = []; let exhaustMonth = -1;
  for (let k = 1; k <= 9; k++) {
    const pipeAdd = k >= 3 ? pipeline : 0; // committed plans assumed to land ~quarter out
    const u = Math.min(125, ((cur + monthlyAdd * k + pipeAdd) / totalMax) * 100);
    proj.push(u);
    if (exhaustMonth < 0 && u >= 100) exhaustMonth = k;
  }
  return { hist, proj, curUtil: Math.round((cur / totalMax) * 100), exhaustMonth, headroom: Math.round(totalMax - cur), cur, max: totalMax, pipeline };
}

export default function CapacityForecastPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const devices = (useEntityList('devices', { pageSize: 20000, filters: dcF }).data?.data ?? []) as unknown as Device[];
  const plans = (useEntityList('plans', { pageSize: 500, filters: dcF }).data?.data ?? []) as unknown as Plan[];
  const cap = useCapacity();

  const [res, setRes] = useState<ResKey>('power');

  const forecasts = useMemo<Record<ResKey, Proj>>(() => {
    // organic monthly adds from device commissioning; current/max/pipeline come from the shared live model
    const powerAdd = bucketSum(devices, (a) => a.commissionedDate, (a) => (a.powerDrawW ?? 0) / 1000, 12, 30);
    const spaceAdd = bucketSum(devices, (a) => a.commissionedDate, (a) => a.heightU ?? 1, 12, 30);
    const gpuAdd = bucketSum(devices.filter((a) => a.category === 'GPU-Node'), (a) => a.commissionedDate, () => 8, 12, 30);
    return {
      power: project(powerAdd, cap.power.used, cap.power.max, cap.power.pipeline),
      cooling: project(powerAdd, cap.cooling.used, cap.cooling.max, cap.cooling.pipeline),
      space: project(spaceAdd, cap.space.used, cap.space.max, cap.space.pipeline),
      gpu: project(gpuAdd, cap.gpu.used, cap.gpu.max, cap.gpu.pipeline),
    };
  }, [devices, cap]);

  const active = forecasts[res];
  const unit = RES.find((r) => r.key === res)!.unit;

  // In-flight demand feeding the selected resource (drives the right-hand panel).
  const contrib = useMemo(() => {
    const act = plans.filter((p) => ['Submitted', 'In Review', 'Approved', 'Executing'].includes(p.status));
    const d = (p: Plan) => decodeDetail(p.detail);
    if (res === 'space') return act.filter((p) => p.type === 'New Rollout').map((p) => ({ p, amt: num(d(p).rackCount) * 42 })).filter((x) => x.amt > 0);
    const key = res === 'power' ? 'powerKw' : res === 'cooling' ? 'coolingKw' : 'quantity';
    return act.filter((p) => p.type === 'Capacity Expansion').map((p) => ({ p, amt: num(d(p)[key]) })).filter((x) => x.amt > 0);
  }, [plans, res]);
  const statusColor: Record<string, string> = { Submitted: 'blue', 'In Review': 'gold', Approved: 'green', Executing: 'processing' };

  // chart geometry
  const W = 660, H = 240, padL = 36, padB = 24, padT = 12;
  const n = active.hist.length + active.proj.length;
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - 12);
  const y = (v: number) => padT + (1 - v / 125) * (H - padT - padB);
  const histPath = active.hist.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const projStart = active.hist.length - 1;
  const projPath = [`M${x(projStart)},${y(active.hist[projStart])}`, ...active.proj.map((v, i) => `L${x(projStart + 1 + i)},${y(v)}`)].join(' ');

  const band = (p: number) => (p >= 85 ? 'var(--vw-color-red-600)' : p >= 60 ? '#f59e0b' : 'var(--vw-color-green-600)');

  return (
    <div style={{ padding: embedded ? 0 : 24 }}>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={embedded ? 4 : 3}>Capacity Forecast</div>

      {/* per-resource forecast tiles (click to drill the chart) */}
      <Row gutter={[12, 12]} style={{ margin: '14px 0' }}>
        {RES.map((r) => {
          const fc = forecasts[r.key];
          const sel = r.key === res;
          return (
            <Col xs={12} md={6} key={r.key}>
              <VwCard hoverable size="small" onClick={() => setRes(r.key)}
                style={sel ? { borderColor: '#93c5fd', background: '#eff6ff' } : undefined} bodyStyle={{ padding: "var(--vw-space-md)" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>{r.label}</Text>
                  <span className="vw-card-metric-md" style={{ color: band(fc.curUtil) }}>{fc.curUtil}%</span>
                </div>
                <div style={{ fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-slate-500)", marginTop: 2 }}>{fc.headroom.toLocaleString()} {r.unit} headroom</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {fc.exhaustMonth > 0
                    ? <VwChip color={fc.exhaustMonth <= 6 ? 'red' : 'orange'}>exhausts ~{fc.exhaustMonth} mo</VwChip>
                    : <VwChip color="green">no exhaustion &lt;9 mo</VwChip>}
                  {fc.pipeline > 0 && <VwChip color="purple">+{Math.round(fc.pipeline).toLocaleString()} {r.unit} pipeline</VwChip>}
                </div>
              </VwCard>
            </Col>
          );
        })}
      </Row>

      {/* KPIs for the selected resource */}
      <div className="vw-grid vw-kpi-grid vw-gap-md" style={{ marginBottom: "var(--vw-space-md)" }}>
        <KPICard title={`${RES.find((r) => r.key === res)!.label} Utilization`} value={active.curUtil} suffix="%" color={active.curUtil >= 85 ? 'var(--vw-color-red-600)' : undefined} icon={<DashboardOutlined />} iconTone={active.curUtil >= 85 ? 'error' : 'cyan'} />
        <KPICard title="Headroom" value={active.headroom} suffix={` ${unit}`} icon={<ReconciliationOutlined />} iconTone="info" />
        <KPICard title="Committed Pipeline" value={Math.round(active.pipeline)} suffix={` ${unit}`} color="#7c3aed" icon={<ProjectOutlined />} iconTone="purple" />
        <KPICard title="Headroom after Pipeline" value={Math.round(active.headroom - active.pipeline)} suffix={` ${unit}`} color={active.headroom - active.pipeline < 0 ? 'var(--vw-color-red-600)' : undefined} icon={<FieldTimeOutlined />} iconTone={active.headroom - active.pipeline < 0 ? 'error' : 'success'} />
        <KPICard title="Time to Exhaustion" value={active.exhaustMonth > 0 ? active.exhaustMonth : '9+'} suffix=" mo" color={active.exhaustMonth > 0 && active.exhaustMonth <= 6 ? 'var(--vw-color-red-600)' : undefined} icon={<ClockCircleOutlined />} iconTone={active.exhaustMonth > 0 && active.exhaustMonth <= 6 ? 'error' : 'warning'} />
      </div>

      <VwCard size="small" title={<VwSegmented size="small" value={res} onChange={(v) => setRes(v as ResKey)} options={RES.map((r) => ({ label: r.label, value: r.key }))} />}>
        <div style={{ display: 'flex', gap: "var(--vw-space-xl)", flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 600px', minWidth: 0, width: '100%', maxWidth: 780 }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
              {[0, 25, 50, 75, 100].map((g) => (
                <g key={g}>
                  <line x1={padL} y1={y(g)} x2={W - 12} y2={y(g)} stroke={g === 100 ? '#fca5a5' : '#f1f5f9'} strokeDasharray={g === 100 ? '5 4' : undefined} />
                  <text x={padL - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="var(--vw-color-slate-400)">{g}%</text>
                </g>
              ))}
              <line x1={x(projStart)} y1={padT} x2={x(projStart)} y2={H - padB} stroke="#e5e7eb" strokeDasharray="3 3" />
              <text x={x(projStart) + 4} y={padT + 8} fontSize="9" fill="var(--vw-color-slate-400)">now</text>
              <path d={histPath} fill="none" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <path d={projPath} fill="none" stroke="#7c3aed" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
              {active.exhaustMonth > 0 && (
                <circle cx={x(projStart + active.exhaustMonth)} cy={y(Math.min(125, active.proj[active.exhaustMonth - 1]))} r={4} fill="var(--vw-color-red-600)" />
              )}
            </svg>
            <div style={{ marginTop: "var(--vw-space-sm)" }}>
              <VwChip color="blue">history</VwChip><VwChip color="purple">forecast (incl. pipeline)</VwChip>
              {active.exhaustMonth > 0 ? <VwChip color="red">{RES.find((r) => r.key === res)!.label} exhaustion in ~{active.exhaustMonth} months</VwChip> : <VwChip color="green">no exhaustion within forecast window</VwChip>}
            </div>
            <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", display: 'block', marginTop: 6 }}>Committed pipeline (approved/executing plans) is assumed to land ~3 months out and is included in the forecast line.</Text>
          </div>

          <div style={{ flex: '1 1 320px', minWidth: 300 }}>
            <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>Demand feeding {RES.find((r) => r.key === res)!.label} ({contrib.length})</Text>
            <div style={{ marginTop: "var(--vw-space-sm)" }}>
              {contrib.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No in-flight demand for this resource" />
                : contrib.map(({ p, amt }) => (
                  <div key={p.id} onClick={() => navigate(`/planning/legacy/${p.id}`)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: "var(--vw-space-sm)", padding: '7px 0', borderBottom: "1px solid var(--vw-color-slate-100)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "var(--vw-font-label-md)", color: "var(--vw-color-blue-600)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                      <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)" }}>{p.type} · target {p.targetDate ? p.targetDate.slice(0, 10) : '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>+{Math.round(amt).toLocaleString()} {unit}</div>
                      <VwChip color={statusColor[p.status]} style={{ margin: 0, fontSize: "var(--vw-font-label-xs)" }}>{p.status}</VwChip>
                    </div>
                  </div>
                ))}
            </div>
            {contrib.length > 0 && (
              <div style={{ marginTop: 10, fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)" }}>
                Committed (approved/executing): <strong>{Math.round(active.pipeline).toLocaleString()} {unit}</strong> — netted into headroom above.
              </div>
            )}
          </div>
        </div>
      </VwCard>
    </div>
  );
}
