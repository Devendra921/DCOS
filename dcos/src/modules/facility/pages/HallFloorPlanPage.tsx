import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
import { Fragment, useMemo, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Building, Building2, ChevronRight, LayoutGrid, Warehouse } from 'lucide-react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import FloorPlan from '../components/FloorPlan';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty, KV, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Meter } from '../../../ops/ui/status';
import { Facts, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { dcTypeName } from '../../../mock/data/dcTypes';
import type { DataCenter, Building as BuildingT, Floor, Hall } from '../../../mock/data/types';
import { useSiteEstate } from '../lib/useSiteEstate';
import { isPlantRoom, isWhiteSpace, rackDensity, roomTypeOf, fmtKw } from '../lib/estateView';
import { RoomEquipment } from '../components/estate/RoomEquipment';
import { LoadText, Muted, PlainTable } from '../components/estate/kit';
import { Link } from 'react-router-dom';
import './hall-floor-plan.css';

const heatTone = (p: number): Tone => (p >= 85 ? 'error' : p >= 60 ? 'warning' : 'success');
const heatHex = (p: number) => (p >= 85 ? 'var(--vw-color-red-600)' : p >= 60 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-green-600)');
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);

interface Crumb { label: ReactNode; onClick?: () => void }
function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="hfp-crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight size={14} className="hfp-sep" />}
          {c.onClick ? <button type="button" onClick={c.onClick}>{c.label}</button> : <span className={i === items.length - 1 ? 'is-last' : ''}>{c.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

/* one row in the drill tables — a data center, a floor or a hall */
interface DrillRow { id: string; name: string; sub: string; floors?: number; halls?: number; grid?: string; used: number; cap: number; util: number; go: () => void }

/**
 * Spatial drill — the visual counterpart to the (text) Hierarchy tab.
 * Data Center → Floor (grouped by building) → Hall/Room → floor-plan heat map → rack.
 * Scope is held in the URL (?dc=&floor=) so it survives back-navigation from a hall.
 */
export default function HallFloorPlanPage() {
  const { hallId } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();

  const dataCenters = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];
  const buildings = (useEntityList('buildings', { pageSize: 400 }).data?.data ?? []) as unknown as BuildingT[];
  const floors = (useEntityList('floors', { pageSize: 600 }).data?.data ?? []) as unknown as Floor[];
  const halls = (useEntityList('halls', { pageSize: 800 }).data?.data ?? []) as unknown as Hall[];

  // ── lookups ──
  const buildingById = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings]);
  const floorById = useMemo(() => new Map(floors.map((f) => [f.id, f])), [floors]);
  const dcById = useMemo(() => new Map(dataCenters.map((d) => [d.id, d])), [dataCenters]);
  const hallById = useMemo(() => new Map(halls.map((h) => [h.id, h])), [halls]);
  const floorsOfDc = (dcId: string) => floors.filter((f) => buildingById.get(f.buildingId)?.dataCenterId === dcId);
  const hallsOfFloor = (floorId: string) => halls.filter((h) => h.floorId === floorId);
  const hallsOfDc = (dcId: string) => floorsOfDc(dcId).flatMap((f) => hallsOfFloor(f.id));

  // ════════════════════════════════════════════════════════════════════
  // HALL DETAIL — the actual spatial payoff: the floor-plan heat map.
  // ════════════════════════════════════════════════════════════════════
  if (hallId) {
    const h = hallById.get(hallId);
    if (!h) return <PageEmptyState title="Hall not found" description="It may have been removed or renamed." />;
    const f = floorById.get(h.floorId);
    const b = f ? buildingById.get(f.buildingId) : undefined;
    const dc = b ? dcById.get(b.dataCenterId) : dcById.get(h.dataCenterId);
    const backToFloor = () => navigate(`/facility/halls?dc=${dc?.id ?? ''}&floor=${f?.id ?? ''}`);
    return (
      <HallRoom hall={h} context={[dc?.name, b?.name, f?.name].filter(Boolean).join(' · ')} crumbs={[
        { label: 'Data centers', onClick: () => navigate('/facility/halls') },
        dc ? { label: dc.name, onClick: () => navigate(`/facility/halls?dc=${dc.id}`) } : { label: '—' },
        { label: b?.name ?? '—' },
        f ? { label: f.name, onClick: backToFloor } : { label: '—' },
        { label: h.name },
      ]} />
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // DRILL — scope from the URL
  // ════════════════════════════════════════════════════════════════════
  const dcId = sp.get('dc') || undefined;
  const floorId = sp.get('floor') || undefined;
  const goTo = (next: { dc?: string; floor?: string }) => {
    const p = new URLSearchParams();
    if (next.dc) p.set('dc', next.dc);
    if (next.floor) p.set('floor', next.floor);
    setSp(p);
  };

  const activeDc = dcId ? dcById.get(dcId) : undefined;
  const activeFloor = floorId ? floorById.get(floorId) : undefined;
  const activeBuilding = activeFloor ? buildingById.get(activeFloor.buildingId) : undefined;

  const crumbs: Crumb[] = [
    { label: 'Data centers', onClick: dcId ? () => goTo({}) : undefined },
    ...(activeDc ? [{ label: activeDc.name, onClick: floorId ? () => goTo({ dc: dcId }) : undefined }] : []),
    ...(activeFloor ? [{ label: activeBuilding ? `${activeBuilding.name} · ${activeFloor.name}` : activeFloor.name }] : []),
  ];

  const cols = (level: 0 | 1 | 2): Col<DrillRow>[] => [
    { key: 'name', header: level === 0 ? 'Data center' : level === 1 ? 'Floor' : 'Room', sort: (r) => r.name, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.sub}</small></span>
    ) },
    ...(level === 0 ? [{ key: 'floors', header: 'Floors', align: 'right' as const, sort: (r: DrillRow) => r.floors ?? 0, render: (r: DrillRow) => <span className="num">{r.floors}</span> }] : []),
    ...(level < 2
      ? [{ key: 'halls', header: 'Halls', align: 'right' as const, sort: (r: DrillRow) => r.halls ?? 0, render: (r: DrillRow) => <span className="num">{r.halls}</span> }]
      : [{ key: 'grid', header: 'Grid', render: (r: DrillRow) => <span className="num">{r.grid}</span> }]),
    { key: 'racks', header: 'Racks', align: 'right', sort: (r) => r.used, render: (r) => (
      <span className="cell-2" style={{ alignItems: 'flex-end' }}><span className="num">{r.used}</span><small>of {r.cap} positions</small></span>
    ) },
    { key: 'util', header: 'Utilisation', sort: (r) => r.util, render: (r) => <Meter pct={r.util} width={96} color={heatHex(r.util)} /> },
    { key: 'state', header: '', render: (r) => <Chip tone={heatTone(r.util)} dot>{r.util}% full</Chip> },
  ];
  const table = (level: 0 | 1 | 2, items: DrillRow[]) => (
    <DataTable rows={items} cols={cols(level)} onRow={(r) => r.go()} pageSize={50} compact={level === 1} />
  );

  // halls in the current scope feed the summary strip
  const scopeHalls = floorId ? hallsOfFloor(floorId) : dcId ? hallsOfDc(dcId) : halls;
  const scopeFloors = floorId ? (activeFloor ? [activeFloor] : []) : dcId ? floorsOfDc(dcId) : floors;
  const used = scopeHalls.reduce((s, h) => s + h.rackCount, 0);
  const cap = scopeHalls.reduce((s, h) => s + h.rackCapacity, 0);
  const avgUtil = avg(scopeHalls.map((h) => h.utilizationPct));
  const band = (lo: number, hi: number) => scopeHalls.filter((h) => h.utilizationPct >= lo && h.utilizationPct < hi).length;

  let description: string; let body: ReactNode;
  let first: { label: string; value: number; sub: string };

  if (!dcId) {
    // ── Level 0: Data Center (facility) rows ──
    description = 'Pick a data center, then a floor, then a hall to open its floor plan';
    first = { label: 'Data centers', value: dataCenters.length, sub: `${buildings.length} buildings` };
    const items: DrillRow[] = dataCenters.map((d) => {
      const dHalls = hallsOfDc(d.id);
      return {
        id: d.id, name: d.name, sub: d.dcTypeKey ? `${d.code} · ${dcTypeName(d.dcTypeKey)} · ${d.tier}` : `${d.code} · ${d.tier}`,
        floors: floorsOfDc(d.id).length, halls: dHalls.length,
        used: dHalls.reduce((s, h) => s + h.rackCount, 0), cap: dHalls.reduce((s, h) => s + h.rackCapacity, 0),
        util: avg(dHalls.map((h) => h.utilizationPct)), go: () => goTo({ dc: d.id }),
      };
    });
    body = (
      <Panel title="Facilities" icon={Building2} count={items.length} sub="Click a data center to see its floors" flush>
        {items.length ? table(0, items) : <Empty icon={Building2} title="No data centers" />}
      </Panel>
    );
  } else if (!floorId) {
    // ── Level 1: Floor rows, grouped by building ──
    description = `${activeDc?.name ?? 'Data center'} — floors, grouped by building`;
    const dcBuildings = buildings.filter((b) => b.dataCenterId === dcId);
    first = { label: 'Buildings', value: dcBuildings.length, sub: `${scopeFloors.length} floors` };
    const groups = dcBuildings.map((b) => ({
      b, items: floors.filter((f) => f.buildingId === b.id).map((f): DrillRow => {
        const fHalls = hallsOfFloor(f.id);
        return {
          id: f.id, name: f.name, sub: `Level ${f.level} · ${Math.round(f.usableAreaSqm)} m²`, halls: fHalls.length,
          used: fHalls.reduce((s, h) => s + h.rackCount, 0), cap: fHalls.reduce((s, h) => s + h.rackCapacity, 0),
          util: avg(fHalls.map((h) => h.utilizationPct)), go: () => goTo({ dc: dcId, floor: f.id }),
        };
      }),
    })).filter((g) => g.items.length > 0);
    body = groups.length ? (
      <div className="col" style={{ gap: 16 }}>
        {groups.map((g) => (
          <Panel key={g.b.id} title={g.b.name} icon={Building} count={g.items.length} sub="Click a floor to see its halls" flush>
            {table(1, g.items)}
          </Panel>
        ))}
      </div>
    ) : <Panel><Empty icon={Building} title="No buildings on this data center" /></Panel>;
  } else {
    // ── Level 2: Hall / Room rows (now fully contextual) ──
    description = `${activeFloor?.name ?? 'Floor'} — halls`;
    first = { label: 'Floor', value: 1, sub: activeFloor ? `Level ${activeFloor.level}` : '—' };
    const items: DrillRow[] = hallsOfFloor(floorId).map((h) => ({
      id: h.id, name: h.name, sub: `${roomTypeOf(h)}${h.coolingMethod ? ` · ${h.coolingMethod.toLowerCase()} cooled` : ''} · ${activeDc?.name ?? ''}${activeBuilding ? ` · ${activeBuilding.name}` : ''} · ${activeFloor?.name ?? ''}`,
      grid: `${h.gridCols}×${h.gridRows}`, used: h.rackCount, cap: h.rackCapacity, util: h.utilizationPct,
      go: () => navigate(`/facility/hall/${h.id}`),
    }));
    body = (
      <Panel title="Halls" icon={Warehouse} count={items.length} sub="Click a hall to open its floor plan" flush>
        {items.length ? table(2, items) : <Empty icon={Warehouse} title="No halls on this floor" />}
      </Panel>
    );
  }

  return (
    <OpsPage title="Halls & Floor Plans" description={description}>
      <Crumbs items={crumbs} />
      <StatGrid cols={5}>
        <StatTile label={first.label} value={first.value} sub={first.sub} />
        <StatTile label="Halls" value={scopeHalls.length} sub={`on ${scopeFloors.length} floor${scopeFloors.length === 1 ? '' : 's'}`}>
          <Facts items={[{ n: scopeHalls.filter((h) => h.status === 'Live').length, label: 'live' }, { n: scopeHalls.filter((h) => h.status && h.status !== 'Live').length, label: 'in build or planned' }]} />
        </StatTile>
        <StatTile label="Racks installed" value={used} sub={`of ${cap} positions`}>
          <SoftMeter pct={cap ? (used / cap) * 100 : 0} tone="info" />
        </StatTile>
        <StatTile label="Avg utilisation" value={<>{avgUtil}<small>%</small></>} sub="across halls in scope">
          <SoftMeter pct={avgUtil} tone={heatTone(avgUtil)} />
        </StatTile>
        <StatTile label="Hall load" value={band(85, Infinity)} sub="halls at ≥85% full" subTone={band(85, Infinity) ? 'bad' : undefined}>
          <Split parts={[{ key: 'hot', label: '≥85%', n: band(85, Infinity), tone: 'error' }, { key: 'warm', label: '60–84%', n: band(60, 85), tone: 'warning' }, { key: 'ok', label: '<60%', n: band(0, 60), tone: 'success' }]} />
        </StatTile>
      </StatGrid>
      {body}
    </OpsPage>
  );
}

/**
 * One room: what kind of room it is and how it is cooled, then the floor plan (rooms that hold
 * racks) and what stands in it. Plant, UPS and battery rooms show their equipment instead of a rack grid.
 */
function HallRoom({ hall: h, context, crumbs }: { hall: Hall; context: string; crumbs: Crumb[] }) {
  const est = useSiteEstate({ dcId: h.dataCenterId, withDevices: false });
  const hallRacks = est.racks.filter((r) => r.hallId === h.id);
  const type = roomTypeOf(h);
  const showPlan = !isPlantRoom(h) && (isWhiteSpace(h) || hallRacks.length > 0);
  const itKw = Math.round(hallRacks.reduce((s, r) => s + r.currentPowerKw, 0) * 10) / 10;
  const ai = hallRacks.filter((r) => rackDensity(r) === 'ai').length;
  const liquid = hallRacks.filter((r) => r.liquidCooled).length;
  const tenantName = (id: string) => est.customers.get(id)?.name;
  const cduName = (id: string) => est.cduById.get(id)?.cdu.name;
  const tenantRows = [...new Set(hallRacks.filter((r) => r.ownerKind === 'tenant' && r.tenantCustomerId).map((r) => r.tenantCustomerId!))].map((id) => {
    const rk = hallRacks.filter((r) => r.tenantCustomerId === id);
    return { id, racks: rk.length, contracted: rk.reduce((s, r) => s + (r.contractedKw ?? 0), 0), draw: Math.round(rk.reduce((s, r) => s + r.currentPowerKw, 0) * 10) / 10 };
  });
  const zone = h.coolingZoneId ? est.zones.find((z) => z.id === h.coolingZoneId) : undefined;
  return (
    <OpsPage title={h.name} description={`${type}${context ? ` · ${context}` : ''}`}>
      <Crumbs items={crumbs} />
      <Panel title="Room" icon={Warehouse} actions={<Chip tone={isPlantRoom(h) ? 'neutral' : type === 'AI hall' ? 'purple' : 'info'}>{type}</Chip>}>
        <KV cols={4} items={[
          ['Room type', type],
          ['Cooling method', h.coolingMethod ?? '—'],
          ['Containment', h.containment ?? '—'],
          ['Cooling zone', zone ? `${zone.name} · ${fmtKw(zone.coolingCapacityKw)}` : '—'],
          ['Status', h.status ?? 'Live'],
          ['Area', h.areaSqm ? `${Math.round(h.areaSqm)} m²` : '—'],
          // Rack figures only for rooms that hold (or are planned to hold) racks; plant rooms list their equipment below.
          ...(showPlan || hallRacks.length ? [
            ['Design power', fmtKw(h.designPowerKw)],
            ['IT load', hallRacks.length ? <LoadText used={itKw} max={h.designPowerKw} /> : '—'],
            ['Racks', `${hallRacks.length} of ${h.rackCapacity} positions`],
            ['AI-density racks', ai || '—'],
            ['Liquid-cooled racks', liquid || '—'],
            ['Tenants', tenantRows.length ? tenantRows.length : '—'],
          ] as [string, React.ReactNode][] : []),
        ]} />
      </Panel>
      {showPlan && (
        <Panel title="Floor plan" icon={LayoutGrid} sub={`${h.gridCols}×${h.gridRows} grid · ${h.rackCount}/${h.rackCapacity} racks · ${h.utilizationPct}% utilised`}
          actions={<Chip tone={heatTone(h.utilizationPct)} dot>{h.utilizationPct}% full</Chip>}>
          <FloorPlan hall={h} racks={hallRacks} tenantName={tenantName} cduName={cduName} />
        </Panel>
      )}
      {tenantRows.length > 0 && (
        <Panel title="Tenant racks" count={tenantRows.length} sub="Contracted power against what the tenant's racks draw now">
          <PlainTable rows={tenantRows} rowKey={(r) => r.id} empty="No tenant racks" columns={[
            { title: 'Tenant', render: (_, r) => <Link to={`/customers/${r.id}`}>{tenantName(r.id) ?? r.id}</Link> },
            { title: 'Racks', align: 'right', dataIndex: 'racks' },
            { title: 'Draw vs contracted', render: (_, r) => r.contracted ? <LoadText used={r.draw} max={r.contracted} /> : <>{fmtKw(r.draw)} <Muted>· no contracted kW</Muted></> },
          ]} />
        </Panel>
      )}
      <Panel title={showPlan ? 'Also in this room' : 'Equipment in this room'} sub={showPlan ? 'Cooling units, CDUs, plant and sensors recorded against the room' : undefined}>
        <RoomEquipment est={est} hall={h} showRacks={!showPlan} />
      </Panel>
    </OpsPage>
  );
}
