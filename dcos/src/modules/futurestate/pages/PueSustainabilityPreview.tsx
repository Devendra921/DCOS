import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ClipboardList, Gauge, Leaf } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { TimeChart } from '../../../ops/charts/TimeChart';
import { BarList } from '../../../ops/charts/BarList';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { synthSeries } from '../components/previewViz';
import { dcTypeProfile, pueFor, pueTargetFor } from '../../../mock/data/dcTypes';
import type { Rack, CoolingZone, DataCenter } from '../../../mock/data/types';

/**
 * PUE & sustainability. PUE is derived per site from its facility type — a
 * liquid-cooled GPU hall runs near 1.2, a DX-cooled server room near 1.6 — and
 * judged against that type's target, then IT-load-weighted into the estate figure.
 * Everything else on the page (renewables, WUE, carbon intensity) stays a
 * future-state preview until metered data lands (see the data contract below).
 */
export default function PueSustainabilityPreview() {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const racks = (useEntityList('racks', { pageSize: 10000, filters: dcF }).data?.data ?? []) as unknown as Rack[];
  const zones = (useEntityList('coolingZones', { pageSize: 2000, filters: dcF }).data?.data ?? []) as unknown as CoolingZone[];

  const sites = useMemo(() => {
    const inScope = new Set(racks.map((r) => r.dataCenterId));
    return dcs.filter((d) => inScope.has(d.id)).map((d) => {
      const it = racks.filter((r) => r.dataCenterId === d.id).reduce((s, r) => s + r.currentPowerKw, 0);
      const cool = zones.filter((z) => z.dataCenterId === d.id).reduce((s, z) => s + z.currentLoadKw, 0);
      const pue = pueFor(d.dcTypeKey, it, cool);
      const target = pueTargetFor(d.dcTypeKey);
      const t = dcTypeProfile(d.dcTypeKey);
      return { key: d.id, id: d.id, name: d.name, typeName: t?.name ?? 'untyped', segment: t?.segment, cooling: t?.cooling ?? '—', itKw: Math.round(it), facilityKw: Math.round(it * pue), pue, target, onTrack: pue <= target };
    }).sort((a, b) => b.itKw - a.itKw);
  }, [dcs, racks, zones]);

  const k = useMemo(() => {
    const itLoadKw = sites.reduce((s, x) => s + x.itKw, 0);
    const facilityKw = sites.reduce((s, x) => s + x.facilityKw, 0);
    const pue = itLoadKw > 0 ? Math.round((facilityKw / itLoadKw) * 100) / 100 : 0;
    const coolingKw = Math.round(zones.reduce((s, z) => s + z.currentLoadKw, 0) * 0.3) || Math.round(itLoadKw * 0.25);
    const lossKw = Math.max(0, facilityKw - itLoadKw - coolingKw);
    const carbonTpy = Math.round(facilityKw * 8.76 * 0.35); // kW→MWh/yr × tCO2e/MWh (simulated grid factor)
    const weightedTarget = itLoadKw > 0 ? Math.round((sites.reduce((s, x) => s + x.target * x.itKw, 0) / itLoadKw) * 100) / 100 : 1.5;
    return { itLoadKw, coolingKw, facilityKw, lossKw, pue, carbonTpy, weightedTarget, offTrack: sites.filter((x) => !x.onTrack).length };
  }, [sites, zones]);

  const pueTrend = synthSeries(12, k.pue + 0.06, 0.04).map((v) => Math.round(v * 100) / 100);

  const esg = [
    { metric: 'PUE (IT-load weighted)', value: k.pue.toFixed(2), target: `≤ ${k.weightedTarget.toFixed(2)} (per-type targets)`, status: k.pue <= k.weightedTarget ? 'On track' : 'Above target' },
    { metric: 'Sites above their type’s PUE target', value: String(k.offTrack), target: '0', status: k.offTrack === 0 ? 'On track' : 'Above target' },
    { metric: 'Renewable energy mix', value: '38%', target: '≥ 60%', status: 'Behind' },
    { metric: 'WUE (Water Usage Effectiveness)', value: '1.6 L/kWh', target: '≤ 1.8', status: 'On track' },
    { metric: 'Carbon intensity', value: '0.35 tCO₂e/MWh', target: '≤ 0.20', status: 'Behind' },
    { metric: 'Annual carbon footprint', value: `${k.carbonTpy.toLocaleString()} tCO₂e`, target: '↓ YoY', status: 'Monitoring' },
  ];

  type SiteRow = (typeof sites)[number];
  type EsgRow = (typeof esg)[number] & { id: string };
  const esgTone = (st: string): Tone => (st === 'On track' ? 'success' : st === 'Behind' || st === 'Above target' ? 'error' : 'info');

  const siteCols: Col<SiteRow>[] = [
    { key: 'site', header: 'Site', sort: (r) => r.name, render: (r) => <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.typeName} · {r.cooling}</small></span> },
    { key: 'it', header: 'IT load', align: 'right', sort: (r) => r.itKw, render: (r) => <span className="num">{r.itKw.toLocaleString()} kW</span> },
    { key: 'pue', header: 'PUE', align: 'right', sort: (r) => r.pue, render: (r) => <span className="num strong" style={{ color: r.onTrack ? 'var(--vw-color-emerald-700)' : 'var(--vw-color-orange-700)' }}>{r.pue ? r.pue.toFixed(2) : '—'}</span> },
    { key: 'target', header: 'Target', align: 'right', sort: (r) => r.target, render: (r) => <span className="num">≤ {r.target.toFixed(2)}</span> },
    { key: 'status', header: 'Status', sort: (r) => (r.onTrack ? 1 : 0), render: (r) => (
      <span title={r.onTrack ? 'At or below the target for this facility type' : `Above the ${r.target.toFixed(2)} target for a ${r.typeName}`}>
        <Chip tone={r.onTrack ? 'success' : 'orange'} dot>{r.onTrack ? 'On track' : 'Above target'}</Chip>
      </span>
    ) },
  ];
  const esgCols: Col<EsgRow>[] = [
    { key: 'metric', header: 'Metric', render: (r) => <span className="strong">{r.metric}</span> },
    { key: 'value', header: 'Current', render: (r) => <span className="num">{r.value}</span> },
    { key: 'target', header: 'Target', render: (r) => <span className="num">{r.target}</span> },
    { key: 'status', header: 'Status', render: (r) => <Chip tone={esgTone(r.status)} dot>{r.status}</Chip> },
  ];
  const esgRows: EsgRow[] = esg.map((e) => ({ ...e, id: e.metric }));
  const breakdown = [
    { key: 'it', label: 'IT', value: k.itLoadKw },
    { key: 'cooling', label: 'Cooling', value: k.coolingKw },
    { key: 'loss', label: 'Loss', value: k.lossKw },
    { key: 'other', label: 'Other', value: Math.round(k.facilityKw * 0.04) },
  ];

  return (
    <OpsPage title="PUE & Sustainability">
      <StatGrid cols={4}>
        <StatTile label="PUE (estate)" value={k.pue} sub={`IT-load weighted · target ≤ ${k.weightedTarget.toFixed(2)}`} subTone={k.pue <= k.weightedTarget ? undefined : 'warn'} />
        <StatTile label="IT load" value={<>{k.itLoadKw.toLocaleString()}<small> kW</small></>} sub={`${sites.length} sites in scope`} />
        <StatTile label="Total facility" value={<>{k.facilityKw.toLocaleString()}<small> kW</small></>} sub="IT load × PUE" />
        <StatTile label="Annual carbon" value={<>{k.carbonTpy.toLocaleString()}<small> tCO₂e</small></>} sub="simulated grid factor" subTone="bad" />
      </StatGrid>

      <Panel title="PUE by site — against each facility type's target" icon={Building2} count={sites.length} flush>
        <DataTable rows={sites} cols={siteCols} maxHeight={320} pageSize={500} onRow={(r) => navigate(`/facility/dc/${r.id}`)} />
      </Panel>

      <div className="grid g-2">
        <Panel title="PUE trend (12 periods)" sub="Simulated trend ending at today's weighted PUE — bends downward as cooling optimisation lands." icon={Leaf}>
          <TimeChart height={200} legend={false} labels={pueTrend.map((_, i) => `P${i + 1}`)} yMin={1} format={(v) => v.toFixed(2)}
            series={[{ key: 'pue', label: 'PUE', color: '#059669', kind: 'area', values: pueTrend }]} />
        </Panel>
        <Panel title="Energy breakdown (kW)" icon={Gauge}>
          <BarList color="#0ea5e9" items={breakdown.map((b) => ({ ...b, display: `${b.value.toLocaleString()} kW` }))} />
        </Panel>
      </div>

      <Panel title="ESG scorecard" icon={ClipboardList} count={esgRows.length} flush>
        <DataTable rows={esgRows} cols={esgCols} pageSize={50} compact />
      </Panel>
    </OpsPage>
  );
}
