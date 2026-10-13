import { fmtNum } from '../../../ops/lib/format';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Cpu, Layers, Snowflake, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, KV, Panel, PanelLink } from '../../../ops/ui/kit';
import { SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import CapacityForecastPage from './CapacityForecastPage';
import { useCapacity } from '../lib/useCapacity';
import { useScreenSynopsis } from '../../../core/docs/SynopsisContext';
import type { SynopsisDoc } from '../../../core/docs/types';
import type { Rack, CapacityReservation } from '../../../mock/data/types';

// Co-located Synopsis — this screen owns its own help content (the scalable,
// per-screen pattern). A stable module-level const so it isn't re-registered.
const SYNOPSIS_DOC: SynopsisDoc = {
  title: 'Capacity Overview',
  summary: 'The single read on whether you can say yes to the next deployment — across power, cooling, space and compute.',
  blocks: [
    { tone: 'tint', title: 'The decision this supports', body: 'Power, cooling, space and compute are the hard limits of a data center. This screen turns live device placement into one answer: how much room is genuinely left before you have to build more — and which dimension runs out first.' },
    { tone: 'plain', title: 'What the headline numbers mean', bullets: ['Power Headroom / Cooling Headroom — kW left before the safe maximum', 'Net Available (− reservations & pipeline) — headroom after subtracting capacity already promised; turns red below zero', 'GPU Utilization — accelerator capacity in use, the gate for AI placement', 'Reserved (backlog) — holds waiting to be committed'] },
    { tone: 'plain', title: 'The four gauges', body: 'Space, Power, Cooling and Compute each show utilisation on a dial — green below 60%, amber 60–85%, red at or above 85%. Click any gauge to drill into that dimension’s detail.' },
    { tone: 'tint', title: 'The reservation ledger', body: 'Capacity flows Available → Reserved → Committed → Consumed. Reserved and Committed are netted out of “Net Available”, so the headroom you see is what you can actually still commit — not just what is physically unused.' },
    { tone: 'plain', title: 'What you can do', body: '“Raise capacity plan” starts a Capacity Expansion plan in Planning, pre-filled from current draw — it routes for approval and becomes a delivery project. The AI-density signals show how many racks are ≥30 kW, liquid-cooling ready, and have GPU slots free.' },
    { tone: 'tint', title: 'Watch for', body: 'A healthy dimension can mask a blocked one. If power, cooling or compute is comfortable but deployments still won’t fit, the binding constraint is one of the others — capacity is only real when all four agree.' },
  ],
};

const STATE_TONE: Record<string, Tone> = { Available: 'success', Reserved: 'info', Committed: 'warning', Consumed: 'purple' };

/* Utilisation dial (270° ring) — no kit chart covers a single-value gauge. */
function Ring({ pct, color, size = 120 }: { pct: number; color: string; size?: number }) {
  const stroke = 10, r = size / 2 - stroke / 2 - 2, c = 2 * Math.PI * r, arc = c * 0.75;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--vw-color-slate-100)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${arc} ${c}`} transform={`rotate(135 ${size / 2} ${size / 2})`} />
      {v > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(arc * v) / 100} ${c}`} transform={`rotate(135 ${size / 2} ${size / 2})`} />}
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fontSize={24} fill="var(--vw-color-gray-900)" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</text>
    </svg>
  );
}

export default function CapacityHubPage() {
  useScreenSynopsis(SYNOPSIS_DOC);
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const cap = useCapacity();
  const racks = (useEntityList('racks', { pageSize: 10000, filters: dcF }).data?.data ?? []) as unknown as Rack[];
  const rsv = (useEntityList('capacityReservations', { pageSize: 500 }).data?.data ?? []) as unknown as CapacityReservation[];

  const extra = useMemo(() => ({
    highDensity: racks.filter((r) => r.maxPowerKw >= 30).length,
    liquidReady: racks.filter((r) => r.liquidCoolingReady).length,
    rsvSeg: ['Available', 'Reserved', 'Committed', 'Consumed'].map((s) => ({ key: s, label: s, n: rsv.filter((x) => x.state === s).length, tone: STATE_TONE[s] })),
    reservedBacklog: rsv.filter((x) => x.state === 'Reserved').length,
  }), [racks, rsv]);

  const gauge = (title: string, percent: number, icon: LucideIcon, foot: string, to: string, danger?: boolean) => (
    <Panel title={title} icon={icon} style={{ height: '100%' }} actions={<PanelLink onClick={() => navigate(to)}>Detail</PanelLink>}>
      <div role="button" tabIndex={0} className="col" style={{ alignItems: 'center', gap: 4, cursor: 'pointer' }}
        onClick={() => navigate(to)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(to); } }}>
        <Ring pct={percent} color={danger && percent >= 85 ? 'var(--vw-color-red-500)' : percent >= 60 ? 'var(--vw-color-amber-400)' : 'var(--vw-color-emerald-500)'} />
        <span className="vw-label">{foot}</span>
      </div>
    </Panel>
  );

  return (
    <OpsPage title="Overview" description="Power, cooling, space and compute headroom — and what is already promised against it"
      actions={<Btn variant="filled" icon={Zap} onClick={() => navigate(`/planning/new?intent=${encodeURIComponent(`Plan a site expansion adding ${Math.round(cap.power.used * 0.2)} kW of IT capacity`)}`)}>Raise capacity plan</Btn>}>

      <StatGrid cols={5}>
        <StatTile label="Power headroom" value={<>{fmtNum(cap.power.headroom)}<small> kW</small></>} sub={`${fmtNum(cap.power.used)}/${fmtNum(cap.power.max)} kW drawn`}>
          <SoftMeter pct={cap.power.util} tone={cap.power.util >= 85 ? 'error' : cap.power.util >= 60 ? 'warning' : 'info'} />
        </StatTile>
        <StatTile label="Net available" value={<>{fmtNum(cap.power.availableNet)}<small> kW</small></>} sub="after reservations & pipeline" subTone={cap.power.availableNet < 0 ? 'bad' : undefined} />
        <StatTile label="GPU utilisation" value={<>{cap.gpu.util}<small>%</small></>} sub={`${fmtNum(cap.gpu.headroom)} of ${fmtNum(cap.gpu.max)} GPUs free`}>
          <SoftMeter pct={cap.gpu.util} tone="purple" />
        </StatTile>
        <StatTile label="Cooling headroom" value={<>{fmtNum(cap.cooling.headroom)}<small> kW</small></>} sub={`${cap.cooling.util}% of cooling in use`}>
          <SoftMeter pct={cap.cooling.util} tone={cap.cooling.util >= 85 ? 'error' : cap.cooling.util >= 60 ? 'warning' : 'cyan'} />
        </StatTile>
        <StatTile label="Reserved (backlog)" value={extra.reservedBacklog} sub="holds waiting to be committed" onClick={() => navigate('/capacity/space')} />
      </StatGrid>

      <div className="grid g-4">
        {gauge('Space', cap.space.util, Box, `${fmtNum(cap.space.used)}/${fmtNum(cap.space.max)} U`, '/capacity/space')}
        {gauge('Power', cap.power.util, Zap, `${fmtNum(cap.power.used)}/${fmtNum(cap.power.max)} kW`, '/capacity/power', true)}
        {gauge('Cooling', cap.cooling.util, Snowflake, `${fmtNum(cap.cooling.headroom)} kW headroom`, '/capacity/power', true)}
        {gauge('Compute (GPU)', cap.gpu.util, Cpu, `${fmtNum(cap.gpu.headroom)} of ${fmtNum(cap.gpu.max)} GPUs free`, '/capacity/compute')}
      </div>

      <div className="grid g-2">
        <Panel title="Capacity state" sub="Reservation ledger · Available → Reserved → Committed → Consumed" icon={Layers} count={rsv.length}
          actions={<PanelLink onClick={() => navigate('/capacity/space')}>Ledger</PanelLink>}>
          <Split parts={extra.rsvSeg} />
          <p className="vw-label" style={{ margin: '12px 0 0' }}>Reserved &amp; Committed are netted out of “Net available”.</p>
        </Panel>
        <Panel title="AI-density signals" sub="Readiness for high-density and accelerated workloads" icon={Sparkles}>
          <KV cols={3} items={[
            ['Racks ≥30 kW', <span className="num strong">{extra.highDensity}</span>],
            ['Liquid-cooling ready', <span className="num strong">{extra.liquidReady}</span>],
            ['GPU slots free', <span className="num strong">{fmtNum(cap.gpu.headroom)}</span>],
          ]} />
          <div className="row" style={{ gap: 6, marginTop: 12 }}><Chip tone="purple">AI-dense-native</Chip><Chip tone="cyan">DLC aware</Chip></div>
        </Panel>
      </div>

      <CapacityForecastPage embedded />
    </OpsPage>
  );
}
