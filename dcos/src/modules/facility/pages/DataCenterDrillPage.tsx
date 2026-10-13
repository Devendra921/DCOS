import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Orbit, Pencil } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, KV, Panel, Tabs } from '../../../ops/ui/kit';
import { SoftMeter, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { EntityCustomizeCard } from '../../../shared/customization';
import { DataCenterFormModal } from '../components/DataCenterFormModal';
import { useEntityDetail } from '../../../shared/hooks/useEntityCRUD';
import { useSiteEstate } from '../lib/useSiteEstate';
import { SiteDetailsCard, RoomsSection, PowerPlantSection, CoolingSection, MonitoringSection } from '../components/estate/SiteSections';
import { generatorReadiness } from '../lib/estateView';
import type { DataCenter } from '../../../mock/data/types';
import { dcTypeProfile, fmtRange, fmtPowerRange, CAPABILITY_GAP_LABEL, dcTypeFit, capacityThresholds, pueFor, pueTargetFor, type FitBand } from '../../../mock/data/dcTypes';

const TABS = ['overview', 'rooms', 'power', 'cooling', 'monitoring'] as const;
type TabKey = typeof TABS[number];
const COVERAGE_TONE: Record<string, Tone> = { Full: 'success', Strong: 'info', Partial: 'warning' };

export default function DataCenterDrillPage() {
  const { dcId } = useParams();
  const navigate = useNavigate();
  const { data } = useEntityDetail('dataCenters', dcId);
  const est = useSiteEstate({ dcId });
  const { halls, racks, zones } = est;
  const d = data as unknown as DataCenter | null;
  const [sp, setSp] = useSearchParams();
  const tab: TabKey = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as TabKey) : 'overview';
  const goTab = (key: TabKey) => { const n = new URLSearchParams(sp); if (key === 'overview') n.delete('tab'); else n.set('tab', key); setSp(n, { replace: true }); };
  const [editOpen, setEditOpen] = useState(false);
  const k = useMemo(() => ({
    avgPower: racks.length ? Math.round(racks.reduce((s, r) => s + r.powerUtilizationPct, 0) / racks.length) : 0,
    headroom: Math.round(racks.reduce((s, r) => s + (r.maxPowerKw - r.currentPowerKw), 0)),
    gpu: racks.filter((r) => r.purpose === 'GPU').length,
    itKw: racks.reduce((s, r) => s + r.currentPowerKw, 0),
  }), [racks]);
  const coolKw = zones.reduce((s, z) => s + z.currentLoadKw, 0);
  const pue = pueFor(d?.dcTypeKey, k.itKw, coolKw);
  const pueTarget = pueTargetFor(d?.dcTypeKey);
  const thresholds = capacityThresholds(d?.dcTypeKey);
  const dcType = dcTypeProfile(d?.dcTypeKey);
  // Profile fit: does this site sit inside its type's typical envelope? Power and density are the
  // meaningful checks; rack count is shown for context (a prototype estate samples big types small).
  const fit = useMemo(() => {
    if (!dcType || !d) return null;
    const avgMaxKwPerRack = racks.length ? racks.reduce((s, r) => s + r.maxPowerKw, 0) / racks.length : 0;
    return { ...dcTypeFit(dcType, { racks: racks.length, designPowerKw: d.designPowerKw, avgMaxKwPerRack }), avgMaxKwPerRack };
  }, [dcType, d, racks]);
  const fitChip = (band: FitBand, label: string) => band === 'n/a' ? null : (
    <Chip tone={band === 'within' ? 'success' : 'warning'}>{label}: {band === 'within' ? 'within band' : `${band} band`}</Chip>
  );
  // Generators that need attention (failed or overdue test, out of service) badge the Power tab.
  const genAttention = est.generators.filter((g) => generatorReadiness(g) !== 'Ready').length;
  if (!d) return <PageEmptyState title="Data center not found" />;

  return (
    <OpsPage title={d.name} description={dcType?.description}
      actions={<>
        {dcType && <Chip tone="info">{dcType.name}</Chip>}
        <Chip tone="neutral">{d.tier}</Chip>
        <Chip tone={d.status === 'Operational' ? 'success' : 'neutral'} dot>{d.status}</Chip>
        <Btn icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Btn>
        <Btn variant="filled" icon={Orbit} onClick={() => navigate(`/facility/dc/${d.id}/site360`)}>Site 360</Btn>
      </>}>
      <DataCenterFormModal open={editOpen} onClose={() => setEditOpen(false)} dc={d} />

      <StatGrid cols={4}>
        <StatTile label="Racks" value={racks.length} sub={`${k.headroom.toLocaleString()} kW headroom`} />
        <StatTile label="Rooms" value={halls.length} sub={`${halls.reduce((s, h) => s + h.rackCapacity, 0)} rack positions`} />
        <StatTile label="Avg power utilization" value={<>{k.avgPower}<small>%</small></>} sub={`warn ≥ ${thresholds.rackPowerWarnPct}%`} subTone={k.avgPower >= 85 ? 'bad' : undefined}>
          <SoftMeter pct={k.avgPower} tone={k.avgPower >= 85 ? 'error' : k.avgPower >= thresholds.rackPowerWarnPct ? 'warning' : 'info'} />
        </StatTile>
        <StatTile label="GPU racks" value={k.gpu} sub={`of ${racks.length} racks`} />
      </StatGrid>

      <Tabs<TabKey> value={tab} onChange={goTab} tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'rooms', label: 'Rooms', count: halls.length || undefined },
        { id: 'power', label: 'Power', count: genAttention || undefined },
        { id: 'cooling', label: 'Cooling' },
        { id: 'monitoring', label: 'Monitoring' },
      ]} />

      {tab === 'overview' && <SiteDetailsCard dc={d} est={est} />}

      {tab === 'overview' && dcType && (
        <Panel title={`Facility profile — ${dcType.name}`} icon={Building2} sub={dcType.description}
          actions={<>
            <Chip tone={dcType.segment === 'Telco' ? 'purple' : 'info'}>{dcType.segment}</Chip>
            <Chip tone={COVERAGE_TONE[dcType.coverage] ?? 'error'} title={dcType.gaps.length ? `To close: ${dcType.gaps.map((g) => CAPABILITY_GAP_LABEL[g]).join(' · ')}` : 'Core supported use case'}>DCOS coverage: {dcType.coverage}</Chip>
          </>}>
          <div className="col" style={{ gap: 16 }}>
            <KV cols={3} items={[
              ['Typical size', `${fmtRange(dcType.typicalRacks)} racks`],
              ['Power envelope', fmtPowerRange(dcType.powerKw)],
              ['Density', dcType.kwPerRack ? `${dcType.kwPerRack[0]}–${dcType.kwPerRack[1]} kW/rack` : 'n/a'],
              ['Cooling', dcType.cooling],
              ['Redundancy / Tier', dcType.redundancy],
              ['Design power', `${d.designPowerKw.toLocaleString()} kW`],
              ['Design cooling', `${d.designCoolingKw.toLocaleString()} kW`],
              ['Traits', [dcType.multiTenant && 'Multi-tenant', dcType.dcPowerPlant && '−48V DC plant', dcType.highDensity && 'High density'].filter(Boolean).join(' · ') || '—'],
              ['Capacity policy', `warn ≥ ${thresholds.rackPowerWarnPct}% · block ≥ ${thresholds.rackPowerBlockPct}% · cooling floor ${thresholds.coolingHeadroomMinPct}%`],
              ['PUE', <span key="pue"><b className="num" style={{ color: pue <= pueTarget ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)' }}>{pue || '—'}</b> <span className="vw-label">target ≤ {pueTarget}</span></span>],
              ['Build blueprint', dcType.build.blueprintKey],
              ['Programme budget', `$${(dcType.build.defaultBudget / 1e6).toFixed(0)}M default`],
            ]} />
            {fit && (
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <span className="vw-label">Profile fit:</span>
                {fitChip(fit.power, `Design power ${d.designPowerKw.toLocaleString()} kW`)}
                {fitChip(fit.density, `Density ${fit.avgMaxKwPerRack.toFixed(1)} kW/rack`)}
                <Chip tone="neutral">{racks.length} racks · typical {fmtRange(dcType.typicalRacks)}</Chip>
                <Chip tone="neutral">{dcType.physical.redundancy} · {dcType.physical.containment === 'None' ? 'no containment' : dcType.physical.containment.toLowerCase()} · {dcType.physical.rackHeightU}U racks</Chip>
              </div>
            )}
          </div>
        </Panel>
      )}

      {tab === 'overview' && <EntityCustomizeCard entityType="dataCenters" record={d} />}

      {tab === 'rooms' && <RoomsSection est={est} />}
      {tab === 'power' && <PowerPlantSection est={est} dcId={d.id} />}
      {tab === 'cooling' && <CoolingSection est={est} redundancy={d.coolingRedundancy} />}
      {tab === 'monitoring' && <MonitoringSection est={est} dcId={d.id} />}
    </OpsPage>
  );
}
