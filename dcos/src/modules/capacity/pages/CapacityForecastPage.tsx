import { WidgetBody, WidgetLabel } from '../../../shared/components/ux/WidgetBody';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, TrendingUp, Workflow } from 'lucide-react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { bucketSum } from '../../../shared/kpi/timeSeries';
import { decodeDetail } from '../../planning/lib/planExec';
import { useCapacity } from '../lib/useCapacity';
import type { Device, Plan } from '../../../mock/data/types';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty, KV, Panel, Seg } from '../../../ops/ui/kit';
import { SoftMeter, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { TimeChart } from '../../../ops/charts/TimeChart';
import './capacityForecast.css';

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
  const statusTone: Record<string, Tone> = { Submitted: 'info', 'In Review': 'warning', Approved: 'success', Executing: 'purple' };
  const label = RES.find((r) => r.key === res)!.label;

  // chart series: history up to now, then the projection (incl. pipeline) joined at "now"
  const nHist = active.hist.length;
  const n = nHist + active.proj.length;
  const labels = Array.from({ length: n }, (_, i) => (i < nHist - 1 ? `-${nHist - 1 - i}m` : i === nHist - 1 ? 'Now' : `+${i - nHist + 1}m`));
  const fullLabels = labels.map((l) => (l === 'Now' ? 'Now' : l.startsWith('-') ? `${l.slice(1, -1)} months ago` : `In ${l.slice(1, -1)} months`));
  const histVals: (number | null)[] = [...active.hist, ...active.proj.map(() => null)];
  const projVals: (number | null)[] = [...active.hist.map((v, i) => (i === nHist - 1 ? v : null)), ...active.proj];
  const tone = (p: number): Tone => (p >= 85 ? 'error' : p >= 60 ? 'warning' : 'success');
  const after = Math.round(active.headroom - active.pipeline);

  const body = (
    <>
      {/* per-resource forecast tiles (click to drill the chart) */}
      <StatGrid cols={4}>
        {RES.map((r) => {
          const fc = forecasts[r.key];
          return (
            <StatTile key={r.key} label={`${r.label} forecast`} value={<>{fc.curUtil}<small>% used</small></>} onClick={() => setRes(r.key)} active={r.key === res}
              sub={fc.exhaustMonth > 0 ? `exhausts in ~${fc.exhaustMonth} mo` : 'no exhaustion within 9 mo'} subTone={fc.exhaustMonth > 0 ? (fc.exhaustMonth <= 6 ? 'bad' : 'warn') : undefined}>
              <SoftMeter pct={fc.curUtil} tone={tone(fc.curUtil)} />
              <span className="vw-label">{fc.headroom.toLocaleString()} {r.unit} headroom{fc.pipeline > 0 ? ` · +${Math.round(fc.pipeline).toLocaleString()} ${r.unit} pipeline` : ''}</span>
            </StatTile>
          );
        })}
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title={`${label} utilisation forecast`} sub="12 months of history, 9 months projected · committed pipeline lands ~3 months out" icon={TrendingUp}
          actions={<Seg<ResKey> size="sm" value={res} onChange={setRes} options={RES.map((r) => ({ id: r.key, label: r.label }))} />}>
          <TimeChart labels={labels} fullLabels={fullLabels} height={240} yMin={0} yMax={125} format={(v) => `${Math.round(v)}%`}
            target={{ value: 100, label: 'Capacity' }}
            series={[
              { key: 'hist', label: 'History', color: '#1C81EF', kind: 'line', values: histVals },
              { key: 'proj', label: 'Forecast (incl. pipeline)', color: '#7c3aed', kind: 'line', values: projVals, dashed: true },
            ]} />
          <div style={{ marginTop: 12 }}>
            <KV cols={5} items={[
              [`${label} utilisation`, <span className="num" style={{ color: active.curUtil >= 85 ? 'var(--vw-color-red-600)' : undefined }}>{active.curUtil}%</span>],
              ['Headroom', <span className="num">{active.headroom.toLocaleString()} {unit}</span>],
              ['Committed pipeline', <span className="num">{Math.round(active.pipeline).toLocaleString()} {unit}</span>],
              ['Headroom after pipeline', <span className="num" style={{ color: after < 0 ? 'var(--vw-color-red-600)' : undefined }}>{after.toLocaleString()} {unit}</span>],
              ['Time to exhaustion', <span className="num" style={{ color: active.exhaustMonth > 0 && active.exhaustMonth <= 6 ? 'var(--vw-color-red-600)' : undefined }}>{active.exhaustMonth > 0 ? active.exhaustMonth : '9+'} mo</span>],
            ]} />
          </div>
          <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
            {active.exhaustMonth > 0
              ? <Chip tone={active.exhaustMonth <= 6 ? 'error' : 'orange'} dot>{label} exhaustion in ~{active.exhaustMonth} months</Chip>
              : <Chip tone="success" dot>No exhaustion within forecast window</Chip>}
          </div>
        </Panel>

        <Panel title={`Demand feeding ${label}`} sub="Submitted, in-review, approved and executing plans" icon={Workflow} count={contrib.length} flush
          foot={contrib.length > 0 ? <span>Committed (approved/executing): <b className="num">{Math.round(active.pipeline).toLocaleString()} {unit}</b> — netted into headroom</span> : undefined}>
          {contrib.length === 0 ? <Empty icon={Inbox} title="No in-flight demand">Nothing in planning feeds this resource.</Empty> : (
            <WidgetBody label="Capacity forecasts" height={420} className="board">
              {contrib.map(({ p, amt }) => (
                <Link key={p.id} to={`/planning/legacy/${p.id}`} className="board-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                  <div style={{ minWidth: 0 }}>
                    <WidgetLabel className="t">{p.title}</WidgetLabel>
                    <div className="m"><span>{p.type}</span><span>·</span><span>target {p.targetDate ? p.targetDate.slice(0, 10) : '—'}</span></div>
                  </div>
                  <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
                    <b className="num">+{Math.round(amt).toLocaleString()} {unit}</b>
                    <Chip tone={statusTone[p.status] ?? 'neutral'} size="xs" dot>{p.status}</Chip>
                  </div>
                </Link>
              ))}
            </WidgetBody>
          )}
        </Panel>
      </div>
    </>
  );

  return embedded ? body : <OpsPage title="Capacity Forecast" description="Utilisation history and projected exhaustion for power, cooling, space and GPU">{body}</OpsPage>;
}
