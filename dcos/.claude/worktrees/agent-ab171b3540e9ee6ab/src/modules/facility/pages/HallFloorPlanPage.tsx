import { useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Row, Col, Empty, Typography, Breadcrumb, Progress } from 'antd';
import { ApartmentOutlined, BankOutlined, BuildOutlined, BorderOuterOutlined, DatabaseOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import FloorPlan from '../components/FloorPlan';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { dcTypeName } from '../../../mock/data/dcTypes';
import type { DataCenter, Building, Floor, Hall, Rack } from '../../../mock/data/types';

const { Text } = Typography;

const heatTag = (p: number) => (p >= 85 ? 'red' : p >= 60 ? 'orange' : 'green');
const heatHex = (p: number) => (p >= 85 ? 'var(--vw-color-red-600)' : p >= 60 ? '#f59e0b' : 'var(--vw-color-green-600)');
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);

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
  const buildings = (useEntityList('buildings', { pageSize: 400 }).data?.data ?? []) as unknown as Building[];
  const floors = (useEntityList('floors', { pageSize: 600 }).data?.data ?? []) as unknown as Floor[];
  const halls = (useEntityList('halls', { pageSize: 800 }).data?.data ?? []) as unknown as Hall[];
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];

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
    if (!h) return <div><Empty description="Hall not found" /></div>;
    const f = floorById.get(h.floorId);
    const b = f ? buildingById.get(f.buildingId) : undefined;
    const dc = b ? dcById.get(b.dataCenterId) : dcById.get(h.dataCenterId);
    const hallRacks = racks.filter((r) => r.hallId === h.id);
    const backToFloor = () => navigate(`/facility/halls?dc=${dc?.id ?? ''}&floor=${f?.id ?? ''}`);
    return (
      <div>
        <Breadcrumb
          items={[
            { title: <a onClick={() => navigate('/facility/halls')}>Data centers</a> },
            { title: dc ? <a onClick={() => navigate(`/facility/halls?dc=${dc.id}`)}>{dc.name}</a> : '—' },
            { title: b?.name ?? '—' },
            { title: f ? <a onClick={backToFloor}>{f.name}</a> : '—' },
            { title: <Text strong>{h.name}</Text> },
          ]}
        />
        <VwCard style={{ marginTop: "var(--vw-space-md)" }}>
          <FloorPlan hall={h} racks={hallRacks} />
        </VwCard>
      </div>
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

  const crumbs = [
    { title: dcId ? <a onClick={() => goTo({})}>Data centers</a> : <Text strong>Data centers</Text> },
    activeDc && { title: floorId ? <a onClick={() => goTo({ dc: dcId })}>{activeDc.name}</a> : <Text strong>{activeDc.name}</Text> },
    activeFloor && { title: <Text strong>{activeBuilding ? `${activeBuilding.name} · ${activeFloor.name}` : activeFloor.name}</Text> },
  ].filter(Boolean) as { title: React.ReactNode }[];

  // ── card helper ──
  const StatCard = (opts: {
    key: string; icon: React.ReactNode; title: string; sub: string; line: string; util: number; onClick: () => void;
  }) => (
    <Col key={opts.key} xs={24} sm={12} md={8} lg={6}>
      <VwCard hoverable size="small" onClick={opts.onClick} bodyStyle={{ padding: "var(--vw-space-lg)" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)" }}>
          <span style={{ color: "var(--vw-color-slate-500)" }}>{opts.icon}</span>
          <Text strong style={{ fontSize: "var(--vw-font-heading-md)" }}>{opts.title}</Text>
        </div>
        <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)", margin: '2px 0 0 24px' }}>{opts.sub}</div>
        <div style={{ fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)", margin: '8px 0 6px' }}>{opts.line}</div>
        <Progress percent={opts.util} size="small" strokeColor={heatHex(opts.util)} showInfo={false} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: "var(--vw-space-xxs)" }}>
          <VwChip color={heatTag(opts.util)} style={{ margin: 0 }}>{opts.util}% full</VwChip>
        </div>
      </VwCard>
    </Col>
  );

  let heading: string; let body: React.ReactNode;

  if (!dcId) {
    // ── Level 0: Data Center (facility) cards ──
    heading = 'Facilities';
    body = (
      <Row gutter={[16, 16]} style={{ marginTop: "var(--vw-space-lg)" }}>
        {dataCenters.map((d) => {
          const dHalls = hallsOfDc(d.id);
          const dFloors = floorsOfDc(d.id);
          const racksUsed = dHalls.reduce((s, h) => s + h.rackCount, 0);
          const racksCap = dHalls.reduce((s, h) => s + h.rackCapacity, 0);
          return StatCard({
            key: d.id, icon: <BankOutlined />, title: d.name, sub: d.dcTypeKey ? `${d.code} · ${dcTypeName(d.dcTypeKey)} · ${d.tier}` : `${d.code} · ${d.tier}`,
            line: `${dFloors.length} floors · ${dHalls.length} halls · ${racksUsed}/${racksCap} racks`,
            util: avg(dHalls.map((h) => h.utilizationPct)), onClick: () => goTo({ dc: d.id }),
          });
        })}
        {dataCenters.length === 0 && <Col span={24}><Empty description="No data centers" /></Col>}
      </Row>
    );
  } else if (!floorId) {
    // ── Level 1: Floor cards, grouped by building ──
    heading = `${activeDc?.name ?? 'Data center'} — floors`;
    const dcBuildings = buildings.filter((b) => b.dataCenterId === dcId);
    body = (
      <div style={{ marginTop: "var(--vw-space-sm)" }}>
        {dcBuildings.map((b) => {
          const bFloors = floors.filter((f) => f.buildingId === b.id);
          if (bFloors.length === 0) return null;
          return (
            <div key={b.id} style={{ marginTop: "var(--vw-space-lg)" }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: "var(--vw-space-sm)" }}>
                <BuildOutlined /> {b.name} <span style={{ color: "var(--vw-color-slate-300)" }}>· {bFloors.length} floors</span>
              </Text>
              <Row gutter={[16, 16]}>
                {bFloors.map((f) => {
                  const fHalls = hallsOfFloor(f.id);
                  const used = fHalls.reduce((s, h) => s + h.rackCount, 0);
                  const cap = fHalls.reduce((s, h) => s + h.rackCapacity, 0);
                  return StatCard({
                    key: f.id, icon: <BorderOuterOutlined />, title: f.name, sub: `Level ${f.level} · ${Math.round(f.usableAreaSqm)} m²`,
                    line: `${fHalls.length} halls · ${used}/${cap} racks`,
                    util: avg(fHalls.map((h) => h.utilizationPct)), onClick: () => goTo({ dc: dcId, floor: f.id }),
                  });
                })}
              </Row>
            </div>
          );
        })}
        {dcBuildings.length === 0 && <Empty style={{ marginTop: "var(--vw-space-2xl)" }} description="No buildings on this data center" />}
      </div>
    );
  } else {
    // ── Level 2: Hall / Room cards (now fully contextual) ──
    heading = `${activeFloor?.name ?? 'Floor'} — halls`;
    const fHalls = hallsOfFloor(floorId);
    body = (
      <Row gutter={[16, 16]} style={{ marginTop: "var(--vw-space-lg)" }}>
        {fHalls.map((h) => StatCard({
          key: h.id, icon: <DatabaseOutlined />, title: h.name, sub: `${activeDc?.name ?? ''}${activeBuilding ? ` · ${activeBuilding.name}` : ''} · ${activeFloor?.name ?? ''}`,
          line: `${h.gridCols}×${h.gridRows} grid · ${h.rackCount}/${h.rackCapacity} racks`,
          util: h.utilizationPct, onClick: () => navigate(`/facility/hall/${h.id}`),
        }))}
        {fHalls.length === 0 && <Col span={24}><Empty description="No halls on this floor" /></Col>}
      </Row>
    );
  }

  return (
    <div>
      <Breadcrumb items={crumbs} style={{ marginBottom: "var(--vw-space-md)" }} />
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3} style={{ marginBottom: "var(--vw-space-lg)" }}><ApartmentOutlined className="vw-text-tertiary" style={{ marginRight: "var(--vw-space-sm)" }} />{heading}</div>
      {body}
    </div>
  );
}
