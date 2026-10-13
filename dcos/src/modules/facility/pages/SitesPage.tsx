import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select } from 'antd';
import { Map as MapIcon, Pencil, Orbit } from 'lucide-react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Seg } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Meter } from '../../../ops/ui/status';
import { SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { DC_SEGMENT, FACILITY_STATUS, type DcSegment } from '../../../mock/data/enums';
import { DC_TYPES_BY_SEGMENT, dcTypeProfile, capacityThresholds, pueFor, pueTargetFor } from '../../../mock/data/dcTypes';
import type { DataCenter, Campus, Region, Rack, CoolingZone } from '../../../mock/data/types';
import { DataCenterFormModal } from '../components/DataCenterFormModal';
import { businessModelLabel } from '../lib/estateView';

const STATUS_TONE: Record<string, Tone> = { Operational: 'success', Construction: 'info', Planned: 'info', Decommissioning: 'orange', Retired: 'neutral' };
const COVERAGE_TONE: Record<string, Tone> = { Full: 'success', Strong: 'info', Partial: 'warning' };
const fmtPower = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${v} kW`);

/**
 * Sites — every data centre as a row: classification, resilience, footprint, live
 * load against its type's policy band, PUE against its type's target. The one
 * place to browse and edit sites as records; the map, hierarchy and drill page
 * are the spatial and detail views of the same list.
 */
export default function SitesPage() {
  const navigate = useNavigate();
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const campuses = (useEntityList('campuses', { pageSize: 500 }).data?.data ?? []) as unknown as Campus[];
  const regions = (useEntityList('regions', { pageSize: 50 }).data?.data ?? []) as unknown as Region[];
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const zones = (useEntityList('coolingZones', { pageSize: 2000 }).data?.data ?? []) as unknown as CoolingZone[];

  const [q, setQ] = useState('');
  const [segment, setSegment] = useState<DcSegment | 'All'>('All');
  const [types, setTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [editing, setEditing] = useState<DataCenter | null>(null);

  const allRows = useMemo(() => {
    const campusById = new Map(campuses.map((c) => [c.id, c]));
    const regionById = new Map(regions.map((r) => [r.id, r.name]));
    return dcs.map((d) => {
      const t = dcTypeProfile(d.dcTypeKey);
      const rk = racks.filter((r) => r.dataCenterId === d.id);
      const itKw = rk.reduce((a, r) => a + r.currentPowerKw, 0);
      const maxKw = rk.reduce((a, r) => a + r.maxPowerKw, 0);
      const coolKw = zones.filter((z) => z.dataCenterId === d.id).reduce((a, z) => a + z.currentLoadKw, 0);
      const th = capacityThresholds(d.dcTypeKey);
      const campus = campusById.get(d.campusId);
      return {
        ...d, key: d.id, typeName: t?.name, segment: t?.segment, coverage: t?.coverage,
        campusName: campus?.name ?? '—', regionName: campus ? regionById.get(campus.regionId) ?? '—' : '—',
        racks: rk.length, itKw: Math.round(itKw), maxKw, utilPct: maxKw > 0 ? Math.round((itKw / maxKw) * 100) : 0,
        hotRacks: rk.filter((r) => r.powerUtilizationPct >= th.rackPowerWarnPct).length, warnPct: th.rackPowerWarnPct,
        pue: pueFor(d.dcTypeKey, itKw, coolKw), pueTarget: pueTargetFor(d.dcTypeKey),
      };
    });
  }, [dcs, campuses, regions, racks, zones]);
  type SiteRow = (typeof allRows)[number];

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return allRows.filter((r) =>
      (segment === 'All' || r.segment === segment) &&
      (!types.length || (r.dcTypeKey && types.includes(r.dcTypeKey))) &&
      (!statuses.length || statuses.includes(r.status)) &&
      (!s || `${r.name} ${r.code} ${r.typeName ?? ''} ${r.campusName} ${r.regionName} ${r.city ?? ''} ${r.state ?? ''} ${r.operatorName ?? ''} ${businessModelLabel(r.businessModel) ?? ''}`.toLowerCase().includes(s)));
  }, [allRows, q, segment, types, statuses]);

  const kpis = useMemo(() => {
    const itKw = allRows.reduce((a, r) => a + r.itKw, 0);
    const maxKw = allRows.reduce((a, r) => a + r.maxKw, 0);
    return {
      total: dcs.length,
      enterprise: dcs.filter((d) => dcTypeProfile(d.dcTypeKey)?.segment === 'Enterprise').length,
      telco: dcs.filter((d) => dcTypeProfile(d.dcTypeKey)?.segment === 'Telco').length,
      operational: dcs.filter((d) => d.status === 'Operational').length,
      untyped: dcs.filter((d) => !d.dcTypeKey).length,
      designMw: Math.round(dcs.reduce((s, d) => s + d.designPowerKw, 0) / 100) / 10,
      itMw: Math.round(itKw / 100) / 10,
      itPct: maxKw > 0 ? Math.round((itKw / maxKw) * 100) : 0,
      hot: allRows.reduce((a, r) => a + r.hotRacks, 0),
    };
  }, [dcs, allRows]);

  const segmentParts = [
    { key: 'Enterprise', label: 'Enterprise', n: kpis.enterprise, tone: 'info' as Tone },
    { key: 'Telco', label: 'Telco', n: kpis.telco, tone: 'purple' as Tone },
    { key: 'Untyped', label: 'Untyped', n: kpis.untyped, tone: 'neutral' as Tone },
  ];
  const statusParts = FACILITY_STATUS.map((s) => ({ key: s, label: s, n: dcs.filter((d) => d.status === s).length, tone: STATUS_TONE[s] ?? 'neutral' })).filter((p) => p.n > 0);
  const statusPick = statuses.length === 1 ? statuses[0] : undefined;

  const cols: Col<SiteRow>[] = [
    { key: 'name', header: 'Site', sort: (r) => r.name, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.code} · {[r.city, r.state].filter(Boolean).join(', ') || r.campusName} · {r.regionName}</small></span>
    ) },
    { key: 'model', header: 'Business model', sort: (r) => businessModelLabel(r.businessModel) ?? '', hideBelow: 1200, render: (r) => r.businessModel || r.category
      ? <span className="cell-2"><span>{businessModelLabel(r.businessModel) ?? '—'}</span><small>{[r.category, r.operatorName].filter(Boolean).join(' · ') || '—'}</small></span>
      : <span className="vw-label">—</span> },
    { key: 'type', header: 'Type', sort: (r) => r.typeName ?? '', render: (r) => r.typeName
      ? <span className="row" style={{ gap: 4 }}><Chip tone={r.segment === 'Telco' ? 'purple' : 'info'}>{r.typeName}</Chip>{r.coverage && <Chip tone={COVERAGE_TONE[r.coverage] ?? 'error'} size="xs" title={`DCOS coverage: ${r.coverage}`}>{r.coverage[0]}</Chip>}</span>
      : <span className="vw-label">untyped</span> },
    { key: 'tier', header: 'Tier', sort: (r) => r.tier, render: (r) => <Chip>{r.tier}</Chip> },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip tone={STATUS_TONE[r.status] ?? 'warning'} dot>{r.status}</Chip> },
    { key: 'racks', header: 'Racks', align: 'right', sort: (r) => r.racks, render: (r) => <span className="num">{r.racks}</span> },
    { key: 'design', header: 'Design power', align: 'right', sort: (r) => r.designPowerKw, render: (r) => <span className="num">{fmtPower(r.designPowerKw)}</span> },
    { key: 'it', header: 'IT load', sort: (r) => r.utilPct, render: (r) => (
      <span className="cell-2"><span className="num">{r.itKw.toLocaleString()} kW</span><Meter pct={r.utilPct} width={64} color={r.utilPct >= r.warnPct ? 'var(--vw-color-red-500)' : 'var(--primaryColor500)'} /></span>
    ) },
    { key: 'hot', header: 'Over band', align: 'right', sort: (r) => r.hotRacks, render: (r) => r.hotRacks
      ? <Chip tone="orange" title={`Racks at or above the ${r.warnPct}% warning band for this type`}>{r.hotRacks}</Chip>
      : <span className="vw-label">—</span> },
    { key: 'pue', header: 'PUE', align: 'right', sort: (r) => r.pue, render: (r) => r.pue
      ? <span className="cell-2" style={{ alignItems: 'flex-end' }}><b className="num" style={{ color: r.pue <= r.pueTarget ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)' }}>{r.pue.toFixed(2)}</b><small>target {r.pueTarget.toFixed(2)}</small></span>
      : <span className="vw-label">—</span> },
    { key: 'actions', header: '', render: (r) => (
      <span className="row" style={{ gap: 4 }} onClick={(e) => e.stopPropagation()}>
        <Btn variant="ghost" size="xs" icon={MapIcon} onClick={() => navigate(`/map?type=${r.dcTypeKey ?? ''}`)}>Map</Btn>
        <Btn variant="ghost" size="xs" icon={Orbit} onClick={(e) => { e.stopPropagation(); navigate(`/facility/dc/${r.id}/site360`); }}>360</Btn>
        <Btn variant="ghost" size="xs" icon={Pencil} onClick={() => setEditing(dcs.find((d) => d.id === r.id) ?? null)}>Edit</Btn>
      </span>
    ) },
  ];

  return (
    <OpsPage title="Sites" description="Every data center as a record — type, resilience, footprint, live load and PUE against its type's policy">
      <StatGrid cols={5}>
        <StatTile label="Sites" value={kpis.total} sub={`${kpis.enterprise} enterprise · ${kpis.telco} telco`}>
          <Split parts={segmentParts} active={segment} onPick={(k) => { if (k === 'Untyped') return; setSegment(segment === k ? 'All' : (k as DcSegment)); }} />
        </StatTile>
        <StatTile label="Operational" value={kpis.operational} sub={`of ${kpis.total} sites`}>
          <Split parts={statusParts} active={statusPick} onPick={(k) => setStatuses(statusPick === k ? [] : [k])} />
        </StatTile>
        <StatTile label="Design power" value={<>{kpis.designMw}<small> MW</small></>} sub="across every site" />
        <StatTile label="IT load" value={<>{kpis.itMw}<small> MW</small></>} sub={`${kpis.itPct}% of rack capacity`}>
          <SoftMeter pct={kpis.itPct} tone={kpis.itPct >= 85 ? 'error' : kpis.itPct >= 70 ? 'warning' : 'info'} />
        </StatTile>
        <StatTile label="Untyped sites" value={kpis.untyped} subTone={kpis.untyped ? 'warn' : undefined}
          sub={kpis.untyped ? 'fall back to tier-only defaults' : 'every site has a type'}>
          {kpis.hot > 0 && <span className="dco-facts"><span className="is-warn"><b>{kpis.hot}</b> racks over their type's band</span></span>}
        </StatTile>
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} onRow={(r) => navigate(`/facility/dc/${r.id}`)} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={50}
          toolbar={
            <ListToolbar shown={rows.length} total={dcs.length} noun="sites"
              search={{ value: q, onChange: setQ, placeholder: 'Site, code, city, operator' }}>
              <Seg size="sm" value={segment} onChange={(v) => setSegment(v as DcSegment | 'All')} options={(['All', ...DC_SEGMENT] as const).map((s) => ({ id: s, label: s }))} />
              <Select allowClear mode="multiple" maxTagCount="responsive" showSearch optionFilterProp="label" placeholder="Facility type" style={{ minWidth: 180 }} value={types} onChange={setTypes}
                options={DC_SEGMENT.filter((sg) => segment === 'All' || sg === segment).map((sg) => ({ label: sg, options: DC_TYPES_BY_SEGMENT[sg].map((t) => ({ value: t.key, label: t.name })) }))} />
              <Select allowClear mode="multiple" maxTagCount="responsive" placeholder="Status" style={{ minWidth: 140 }} value={statuses} onChange={setStatuses} options={FACILITY_STATUS.map((s) => ({ value: s, label: s }))} />
            </ListToolbar>
          } />
      </section>
      {editing && <DataCenterFormModal open={!!editing} onClose={() => setEditing(null)} dc={editing} />}
    </OpsPage>
  );
}
