import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { Chip, Panel, Seg } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { DC_SEGMENT, type DcSegment, type DcTypeCoverage } from '../../../mock/data/enums';
import { CAPABILITY_GAP_LABEL, fmtPowerRange, fmtRange } from '../../../mock/data/dcTypes';
import type { DataCenter, DataCenterType } from '../../../mock/data/types';

/**
 * Data centre types — the reference taxonomy (enterprise + telco, smallest → largest)
 * with each type's typical envelope, how well DCOS covers it, and how many of the
 * estate's facilities are classified as it. Read-only: the catalogue is code-owned
 * (see mock/data/dcTypes.ts) so every wizard, filter and blueprint shares one table.
 */
export default function DcTypesPage() {
  const navigate = useNavigate();
  const [segment, setSegment] = useState<DcSegment | 'All'>('All');
  const types = (useEntityList('dataCenterTypes', { pageSize: 100 }).data?.data ?? []) as unknown as DataCenterType[];
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];

  const countByType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of dcs) if (d.dcTypeKey) m[d.dcTypeKey] = (m[d.dcTypeKey] ?? 0) + 1;
    return m;
  }, [dcs]);

  const rows = useMemo(() => {
    const segOrder: Record<string, number> = { Enterprise: 0, Telco: 1 };
    return [...types]
      .filter((t) => segment === 'All' || t.segment === segment)
      .sort((a, b) => segOrder[a.segment] - segOrder[b.segment] || a.order - b.order)
      .map((t) => ({ ...t, dcCount: countByType[t.key] ?? 0 }));
  }, [types, segment, countByType]);

  const kpis = useMemo(() => {
    const typed = dcs.filter((d) => d.dcTypeKey).length;
    const inUse = new Set(dcs.map((d) => d.dcTypeKey).filter(Boolean)).size;
    const full = types.filter((t) => t.coverage === 'Full' || t.coverage === 'Strong').length;
    return { types: types.length, inUse, typed, untyped: dcs.length - typed, full };
  }, [types, dcs]);

  type Row = (typeof rows)[number];
  const covTone = (c: DcTypeCoverage): Tone => (c === 'Full' ? 'success' : c === 'Strong' ? 'info' : c === 'Partial' ? 'warning' : 'error');
  const cols: Col<Row>[] = [
    { key: 'name', header: 'Type', sort: (r) => r.order, wrap: true, render: (r) => <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.description}</small></span> },
    { key: 'segment', header: 'Segment', sort: (r) => r.segment, render: (r) => <Chip tone={r.segment === 'Telco' ? 'purple' : 'info'}>{r.segment}</Chip> },
    { key: 'size', header: 'Typical size', render: (r) => <span className="cell-2"><span>{fmtRange([r.typicalRacksMin, r.typicalRacksMax ?? null])} racks</span><small>{fmtPowerRange([r.powerKwMin, r.powerKwMax ?? null])}</small></span> },
    { key: 'kw', header: 'kW / rack', align: 'right', render: (r) => <span className="num">{r.kwPerRackMin != null && r.kwPerRackMax != null ? `${r.kwPerRackMin}–${r.kwPerRackMax}` : 'n/a'}</span> },
    { key: 'cooling', header: 'Cooling', wrap: true, render: (r) => <span className="cell-2"><span>{r.cooling}</span><small>{r.redundancy}</small></span> },
    { key: 'tier', header: 'Default tier', sort: (r) => r.defaultTier, render: (r) => <Chip tone="neutral">{r.defaultTier}</Chip> },
    { key: 'coverage', header: 'DCOS coverage', sort: (r) => r.coverage, render: (r) => <span title={r.gaps.length ? `To close: ${r.gaps.map((g) => CAPABILITY_GAP_LABEL[g]).join(' · ')}` : 'Core supported use case'}><Chip tone={covTone(r.coverage)} dot>{r.coverage}</Chip></span> },
    { key: 'sites', header: 'Sites', align: 'right', sort: (r) => r.dcCount, render: (r) => (r.dcCount ? <b className="num strong">{r.dcCount}</b> : <span className="vw-label">—</span>) },
  ];

  return (
    <OpsPage title={'Data center types'} description="Facility profiles, design envelopes and estate coverage.">
      <StatGrid cols={4}>
        <StatTile label="Types in catalogue" value={kpis.types} sub={`${DC_SEGMENT.length} segments`} />
        <StatTile label="Types in use" value={kpis.inUse} sub="classified at least one site" />
        <StatTile label="Classified sites" value={kpis.typed} sub={kpis.untyped ? `${kpis.untyped} untyped` : 'all sites typed'} subTone={kpis.untyped ? 'warn' : undefined} />
        <StatTile label="Full / Strong coverage" value={<>{kpis.full}<small> of {kpis.types}</small></>} sub="types DCOS covers well" />
      </StatGrid>
      <Panel title="Taxonomy — smallest to largest footprint" sub="Click a type in use to see its sites on the map" icon={Layers} flush
        actions={<Seg<DcSegment | 'All'> value={segment} onChange={setSegment} options={(['All', ...DC_SEGMENT] as (DcSegment | 'All')[]).map((x) => ({ id: x, label: x }))} />}
        foot={<span className="vw-label">Figures are typical industry ballparks, not hard limits. Cell sites, street cabinets and far-edge MEC are out of DCOS scope and omitted. Coverage: Full = core use case · Strong = minor gaps · Partial = a key domain model is missing · Gap = not supported yet.</span>}>
        <DataTable rows={rows} cols={cols} pageSize={50} onRow={(r) => { if (r.dcCount) navigate(`/map?type=${r.key}`); }} />
      </Panel>
    </OpsPage>
  );
}
