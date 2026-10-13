/* Site power plant across the sites in scope: N+1 cover per site, generator readiness,
   utility feeds, UPS and the −48 V DC plant. Shown on the DCIM Power tab next to the
   panel-and-feed distribution register. */
import { Link } from 'react-router-dom';
import type { FilterCriteria } from '../../../../mock/db/store';
import type { DataCenter } from '../../../../mock/data/types';
import { useEntityList } from '../../../../shared/hooks/useEntityCRUD';
import { VwChip } from '../../../../shared/components/ux';
import { Panel } from '../../../../ops/ui/kit';
import { useSiteEstate } from '../../lib/useSiteEstate';
import { countBy, countSummary, daysSince, fmtDate, fmtKw, generatorReadiness, GENERATOR_TEST_INTERVAL_DAYS, READINESS_TONE, type Readiness } from '../../lib/estateView';
import { plantOfSite } from '../../lib/estateRules';
import { KvList, LoadText, Muted, PlainTable, StatusChip } from './kit';

const READINESS_ORDER: Readiness[] = ['Failed last test', 'Out of service', 'Test overdue', 'Never tested', 'Ready'];

export function PlantRegister({ filters }: { filters: FilterCriteria[] }) {
  const est = useSiteEstate({ filters, withDevices: false });
  const scopeId = filters.find((f) => f.field === 'dataCenterId')?.value;
  const dcs = ((useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[]).filter((d) => !scopeId || d.id === scopeId);
  const dcName = new Map(dcs.map((d) => [d.id, d.name]));
  const site = (dcId: string, tab = 'power') => <Link to={`/facility/dc/${dcId}?tab=${tab}`} onClick={(e) => e.stopPropagation()}>{dcName.get(dcId) ?? dcId}</Link>;
  const room = (hallId?: string) => { const h = hallId ? est.hallById.get(hallId) : undefined; return h ? <Link to={`/facility/hall/${h.id}`}>{h.name}</Link> : <Muted>—</Muted>; };

  const cover = dcs.map((d) => {
    const itKw = Math.round(est.racks.filter((r) => r.dataCenterId === d.id).reduce((s, r) => s + r.currentPowerKw, 0));
    const ps = plantOfSite(d.id, { utilityFeeds: est.feeds, upsUnits: est.ups, generators: est.generators, dcPlants: est.dcPlants });
    const ups = { usable: ps.upsUsableKw, units: ps.ups.length };
    const gen = { usable: ps.generatorUsableKw, units: ps.generators.length };
    return { id: d.id, itKw, ups, gen, upsShort: ups.units > 0 && ups.usable < itKw, genShort: gen.units > 0 && gen.usable < itKw };
  });
  const gens = [...est.generators].sort((a, b) => READINESS_ORDER.indexOf(generatorReadiness(a)) - READINESS_ORDER.indexOf(generatorReadiness(b)) || (daysSince(b.lastTestDate) ?? 9999) - (daysSince(a.lastTestDate) ?? 9999));
  const readiness = countBy(est.generators, (g) => generatorReadiness(g));
  const overdue = est.generators.filter((g) => generatorReadiness(g) === 'Test overdue' || generatorReadiness(g) === 'Never tested').length;
  const failed = est.generators.filter((g) => generatorReadiness(g) === 'Failed last test').length;
  const shortN1 = cover.filter((c) => c.upsShort || c.genShort).length;
  const noN1 = cover.filter((c) => c.ups.units === 1 || c.gen.units === 1).length;

  const n1Cell = (n: { usable: number; units: number }, itKw: number) => n.units === 0 ? <Muted>None</Muted> : (
    <span>{fmtKw(n.usable)} {n.usable < itKw ? <VwChip variant="error">short {fmtKw(itKw - n.usable)}</VwChip> : <Muted>· covers load</Muted>}{n.units === 1 && <> <VwChip variant="warning">single unit, no reserve</VwChip></>}</span>
  );

  return (
    <div className="vw-flex vw-flex-col vw-gap-lg">
      <Panel title="Plant summary" sub={<>Usable capacity keeps the largest unit, or the redundant generators, in reserve (N+1)</>}>
        <KvList columns={2} items={[
          { label: 'Sites in scope', value: dcs.length },
          { label: 'Utility feeds', value: est.feeds.length ? `${est.feeds.length} · ${countSummary(countBy(est.feeds, (f) => f.normalRole ?? 'Active'), false)} · ${countSummary(countBy(est.feeds, (f) => f.supply ?? 'AC'), false)}` : <Muted>None recorded</Muted> },
          { label: 'Sites short of N+1 cover', value: shortN1 ? <VwChip variant="error">{shortN1}</VwChip> : <Muted>0</Muted> },
          { label: 'Sites with a single UPS or generator', value: noN1 ? <VwChip variant="warning">{noN1}</VwChip> : <Muted>0</Muted> },
          { label: 'Generator readiness', value: est.generators.length ? countSummary(readiness, false) : <Muted>None recorded</Muted> },
          { label: `Tests overdue (> ${GENERATOR_TEST_INTERVAL_DAYS} days)`, value: overdue ? <VwChip variant="warning">{overdue}</VwChip> : <Muted>0</Muted> },
          { label: 'Failed last test', value: failed ? <VwChip variant="error">{failed}</VwChip> : <Muted>0</Muted> },
          { label: 'DC plant', value: est.dcPlants.length ? countSummary(countBy(est.dcPlants, (p) => p.kind)) : <Muted>None</Muted> },
        ]} />
      </Panel>

      <Panel title="Power cover by site" sub={<>IT load is the live draw of the site's racks</>}>
        <PlainTable rows={cover} rowKey={(c) => c.id} empty="No sites in scope" columns={[
          { title: 'Site', render: (_, c) => site(c.id) },
          { title: 'IT load', align: 'right', render: (_, c) => fmtKw(c.itKw) },
          { title: 'UPS usable (N+1)', render: (_, c) => n1Cell(c.ups, c.itKw) },
          { title: 'Generators usable (N+1)', render: (_, c) => n1Cell(c.gen, c.itKw) },
        ]} />
      </Panel>

      <Panel title={`Generator readiness (${est.generators.length})`} sub={<>Generators are tested monthly; failed and overdue first</>}>
        <PlainTable rows={gens} rowKey={(g) => g.id} empty="No generators recorded" columns={[
          { title: 'Site', render: (_, g) => site(g.dataCenterId) },
          { title: 'Generator', render: (_, g) => <span className="vw-flex vw-flex-col"><span>{g.name}</span><Muted size="xs">{g.model ?? '—'}</Muted></span> },
          { title: 'Rating', align: 'right', render: (_, g) => `${g.capacityKva} kVA` },
          { title: 'Fuel', align: 'right', render: (_, g) => `${g.fuelTankLitres != null ? `${g.fuelTankLitres.toLocaleString()} L · ` : ''}${g.fuelHours} h` },
          { title: 'Last test', render: (_, g) => g.lastTestDate ? <span className="vw-flex vw-flex-col"><span>{fmtDate(g.lastTestDate)}</span><Muted size="xs">{daysSince(g.lastTestDate)} days ago</Muted></span> : <Muted>Never</Muted> },
          { title: 'Result', render: (_, g) => <StatusChip s={g.lastTestResult} /> },
          { title: 'Readiness', render: (_, g) => { const r = generatorReadiness(g); return <VwChip variant={READINESS_TONE[r]}>{r}</VwChip>; } },
        ]} />
      </Panel>

      <Panel title={`Utility feeds (${est.feeds.length})`}>
        <PlainTable rows={est.feeds} rowKey={(f) => f.id} empty="No utility feeds recorded" columns={[
          { title: 'Site', render: (_, f) => site(f.dataCenterId) },
          { title: 'Feed', render: (_, f) => <span className="vw-flex vw-flex-col"><span>{f.name}</span><Muted size="xs">{f.provider}</Muted></span> },
          { title: 'Supply', render: (_, f) => <VwChip variant={f.supply === 'DC' ? 'purple' : 'neutral'}>{f.supply ?? 'AC'}</VwChip> },
          { title: 'Rating', render: (_, f) => f.ratingText ?? `${f.voltage} V` },
          { title: 'Capacity', align: 'right', render: (_, f) => fmtKw(f.capacityKw) },
          { title: 'Role', render: (_, f) => <span className="vw-flex vw-gap-xs"><StatusChip s={f.normalRole ?? 'Active'} /><VwChip>{f.redundancyRole}</VwChip></span> },
          { title: 'Account', render: (_, f) => f.utilityAccount ?? <Muted>—</Muted> },
        ]} />
      </Panel>

      <Panel title={`UPS (${est.ups.length})`}>
        <PlainTable rows={est.ups} rowKey={(u) => u.id} empty="No UPS recorded" columns={[
          { title: 'Site', render: (_, u) => site(u.dataCenterId) },
          { title: 'UPS', dataIndex: 'name' },
          { title: 'Room', render: (_, u) => room(u.hallId) },
          { title: 'Serial', render: (_, u) => u.serial ?? <Muted>—</Muted> },
          { title: 'Load', render: (_, u) => <LoadText used={u.loadKw} max={u.capacityKw} /> },
          { title: 'Redundancy', dataIndex: 'redundancy' },
          { title: 'Status', render: (_, u) => <StatusChip s={u.status} /> },
        ]} />
      </Panel>

      <Panel title={`DC plant (${est.dcPlants.length})`} sub={<>−48 V rectifiers and battery banks</>}>
        <PlainTable rows={est.dcPlants} rowKey={(p) => p.id} empty="No DC plant in scope" columns={[
          { title: 'Site', render: (_, p) => site(p.dataCenterId) },
          { title: 'Equipment', render: (_, p) => <span className="vw-flex vw-flex-col"><span>{p.name}</span><Muted size="xs">{p.kind}</Muted></span> },
          { title: 'Room', render: (_, p) => room(p.hallId) },
          { title: 'Voltage', align: 'right', render: (_, p) => (p.volts != null ? `${p.volts} V` : '—') },
          { title: 'Rating', render: (_, p) => p.ratedOutput ?? (p.capacityKw != null ? fmtKw(p.capacityKw) : p.ah != null ? `${p.ah} Ah` : '—') },
          { title: 'Autonomy', align: 'right', render: (_, p) => (p.autonomyH != null ? `${p.autonomyH} h` : '—') },
          { title: 'Last test', render: (_, p) => fmtDate(p.lastTestDate) },
          { title: 'Status', render: (_, p) => <StatusChip s={p.status} /> },
        ]} />
      </Panel>
    </div>
  );
}
