/**
 * Site 360 — one data center, drilled from the site to a rack.
 *
 * The breadcrumb is the journey: Campus › Site › Building › Hall › Rack. Layer pills
 * slice every level by Space, Power, Cooling, Network, Delivery or Operations; view
 * pills move the camera. The panel beside the twin shows the current level's context
 * and the list to drill into next; the panels below show the deep view for the layer.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Slider, Progress, Table, Empty, Space, Tooltip } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { ArrowLeftOutlined, ThunderboltOutlined, FireOutlined, AlertOutlined, DashboardOutlined, DownOutlined, RightOutlined } from '../../../shared/icons';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip, VwSegmented } from '../../../shared/components/ux';
import { useScreenSynopsis } from '../../../core/docs/SynopsisContext';
import type { SynopsisDoc } from '../../../core/docs/types';
import { useSiteModel, useVwPalette, SITE_LAYERS, TWIN_VIEWS, layerLegend, type SiteLayer, type TwinLevel, type TwinView, type RackVm } from '../lib/siteModel';
import { useAttention, type AttentionItem } from '../lib/attention';
import { SiteTwin } from '../components/SiteTwin';
import { PowerOneLine } from '../components/PowerOneLine';
import { ThermalContour } from '../components/ThermalContour';
import { NetworkFabric } from '../components/NetworkFabric';
import { HealthRing } from '../components/CxoScorecard';

const SYNOPSIS_DOC: SynopsisDoc = {
  title: 'Site 360',
  summary: 'One data center drilled from the campus to a single rack, sliced by six lenses, with the power chain, the thermal field and the network fabric as deep views.',
  blocks: [
    { tone: 'tint', title: 'The journey', body: 'Start at the site: buildings on the pad with the utility intake, UPS rooms and cooling plant behind them. Click a building to see its floors and halls, a hall to see its racks, a rack to see its devices in their U positions. The breadcrumb takes you back up; the lists beside the twin take you down.' },
    { tone: 'plain', title: 'Slice and dice', bullets: ['Layer pills recolour whatever level you are on — a building by its average draw, a hall by its hottest inlet, a rack by its own figures', 'View pills move the camera: Overview, Front, Top (plan) and Aisle (eye level in the hall, close-up on a rack)', 'The panels below the twin open the deep view for the layer: the one-line for Power, the thermal map for Cooling, the fabric for Network'] },
    { tone: 'tint', title: 'Where the numbers come from', body: 'Placement, draw and plant are the DCIM record; incidents and alarms are the operations record; PUE and cooling follow the facility type; opex is energy at a flat tariff plus circuit charges. Inlet temperature is estimated from draw, setpoint and containment until a collector feeds it. The Cost layer prices each rack at draw × PUE × 730 h × $0.11/kWh and bands it against its hall.' },
    { tone: 'plain', title: 'Reading the twin', bullets: ['Pulsing beacons mark what needs attention — red for critical (open incident, inlet ≥ 32 °C, draw over the block limit, failed cooling), amber for major — and show through floors', 'Dashed, see-through racks are planned or reserved positions; dashed devices are ordered, received or staged kit', 'Inside a building, the floors above the hall in focus lift out of the way and everything else dims', 'The side panel folds; its fold state is remembered on this browser'] },
  ],
};

/** Fold state of the side cards, remembered per browser. */
const FOLD_KEY = 'dcos.site360.folded';
function readFolded(): Record<string, boolean> {
  try { const raw = localStorage.getItem(FOLD_KEY); const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function useFolded() {
  const [folded, setFolded] = useState<Record<string, boolean>>(readFolded);
  const toggle = useCallback((id: string) => setFolded((prev) => {
    const next = { ...prev, [id]: !prev[id] };
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(next)); } catch { /* storage unavailable — fold state lives for the session only */ }
    return next;
  }), []);
  return { folded, toggle };
}

/** A side card with a chevron in its title that folds the body away. */
function FoldCard({ id, title, extra, folded, onToggle, children }: { id: string; title: ReactNode; extra?: ReactNode; folded: boolean; onToggle: (id: string) => void; children: ReactNode }) {
  return (
    <VwCard size="small" bodyStyle={folded ? { display: 'none' } : undefined}
      title={<span className="vw-flex vw-items-center vw-gap-sm" role="button" tabIndex={0} aria-expanded={!folded} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => onToggle(id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(id); } }}>
        <span className="vw-card-description" style={{ display: 'inline-flex', width: 14 }}>{folded ? <RightOutlined /> : <DownOutlined />}</span>{title}
      </span>}
      extra={folded ? undefined : extra}>
      {folded ? null : children}
    </VwCard>
  );
}

export default function Site360Page() {
  useScreenSynopsis(SYNOPSIS_DOC);
  const { dcId } = useParams();
  const navigate = useNavigate();
  const p = useVwPalette();
  const m = useSiteModel(dcId);
  const [level, setLevel] = useState<TwinLevel>({ kind: 'site' });
  const [layer, setLayer] = useState<SiteLayer>('power');
  const [view, setView] = useState<TwinView>('overview');
  const [selected, setSelected] = useState<string | undefined>();
  const [hour, setHour] = useState(14);
  const [lastHallId, setLastHallId] = useState<string | undefined>();
  const { folded, toggle } = useFolded();
  const attention = useAttention(m);
  // Changing level drops the pinned rack unless it lives in the hall now in view (the attention list pins and drills in one click).
  useEffect(() => { setSelected((s) => (s && level.kind === 'hall' && m.rackById.get(s)?.rack.hallId === level.id ? s : undefined)); }, [level, m.rackById]);
  const building = level.kind === 'building' ? m.buildings.find((b) => b.building.id === level.id) : level.kind === 'hall' || level.kind === 'rack' ? m.buildings.find((b) => b.halls.some((h) => level.kind === 'hall' ? h.hall.id === level.id : h.racks.some((r) => r.rack.id === level.id))) : undefined;
  const hall = level.kind === 'hall' ? m.halls.find((h) => h.hall.id === level.id) : level.kind === 'rack' ? m.halls.find((h) => h.racks.some((r) => r.rack.id === level.id)) : undefined;
  const hallId = hall?.hall.id;
  useEffect(() => { if (hallId) setLastHallId(hallId); }, [hallId]);
  const rackVm: RackVm | undefined = level.kind === 'rack' ? m.rackById.get(level.id) : selected ? m.rackById.get(selected) : undefined;
  const k = m.kpis;
  const legend = layerLegend(layer);
  // Attention items in scope of the current level, worst first.
  const attentionInScope = useMemo<AttentionItem[]>(() => {
    if (level.kind === 'site') return attention.items;
    if (level.kind === 'building' && building) { const ids = new Set(building.halls.map((h) => h.hall.id)); return attention.items.filter((i) => i.hallId && ids.has(i.hallId)); }
    if (level.kind === 'hall') return attention.items.filter((i) => i.kind === 'rack' ? i.hallId === level.id : i.id === level.id);
    if (level.kind === 'rack') return attention.items.filter((i) => i.id === level.id);
    return [];
  }, [attention, level, building]);
  const goTo = (it: AttentionItem) => {
    if (it.kind === 'rack' && it.hallId) { setLevel({ kind: 'hall', id: it.hallId }); setSelected(it.rackId); }
    else if (it.kind === 'hall') setLevel({ kind: 'hall', id: it.id });
    else if (it.buildingId) setLevel({ kind: 'building', id: it.buildingId });
  };
  const parent: { label: string; to: TwinLevel } | undefined = level.kind === 'building' ? { label: m.dc?.name ?? 'Site', to: { kind: 'site' } }
    : level.kind === 'hall' ? (building ? { label: building.building.name, to: { kind: 'building', id: building.building.id } } : { label: m.dc?.name ?? 'Site', to: { kind: 'site' } })
    : level.kind === 'rack' ? (hall ? { label: hall.hall.name, to: { kind: 'hall', id: hall.hall.id } } : { label: m.dc?.name ?? 'Site', to: { kind: 'site' } }) : undefined;
  const contourHall = hall ?? [...m.halls].sort((a, b) => b.racks.length - a.racks.length)[0];
  const projectsOpen = useMemo(() => m.projects.filter((pr) => pr.status !== 'Completed'), [m.projects]);
  const openIncidents = useMemo(() => m.incidents.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed'), [m.incidents]);
  const rackDevices = useMemo(() => (rackVm ? (m.devicesByRack.get(rackVm.rack.id) ?? []).filter((d) => !d.parentDeviceId).sort((a, b) => (b.position ?? 0) - (a.position ?? 0)) : []), [m.devicesByRack, rackVm]);

  if (!m.dc) return <div><Empty description={m.loading ? 'Loading site…' : 'Data center not found'} /></div>;

  const crumb = (label: string, active: boolean, onClick?: () => void) => (
    <span key={label} className={`vw-chip ${active ? 'vw-chip--info-solid' : 'vw-chip--neutral'}`} style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>{label}</span>
  );
  const crumbs = [
    crumb(m.campusName || 'Campus', false, () => navigate('/map')),
    crumb(m.dc.name, level.kind === 'site', () => setLevel({ kind: 'site' })),
    building ? crumb(building.building.name, level.kind === 'building', () => setLevel({ kind: 'building', id: building.building.id })) : null,
    hall ? crumb(hall.hall.name, level.kind === 'hall', () => setLevel({ kind: 'hall', id: hall.hall.id })) : null,
    level.kind === 'rack' && rackVm ? crumb(rackVm.rack.name, true) : null,
  ];

  return (
    <div>
      <div className="vw-card-section" style={{ marginBottom: 'var(--vw-space-md)' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/facility/dc/${m.dc?.id}`)}>Site</Button>
            <div className="vw-page-title" role="heading" aria-level={4}>{m.dc.name} · Site 360</div>
            <VwChip color="blue">{m.typeName}</VwChip><VwChip>{m.dc.tier}</VwChip><VwChip color={m.dc.status === 'Operational' ? 'success' : 'warning'}>{m.dc.status}</VwChip>
          </Space>
          <Space wrap>
            <VwSegmented<SiteLayer> value={layer} onChange={setLayer} options={SITE_LAYERS} />
            <VwSegmented<TwinView> value={view} onChange={setView} size="small" options={TWIN_VIEWS} />
          </Space>
        </Space>
        <div className="vw-flex vw-gap-sm" style={{ alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          {crumbs.flatMap((c, i) => (c ? [i > 0 ? <span key={`sep-${i}`} className="vw-card-description">›</span> : null, c] : [])).filter(Boolean)}
          <span className="vw-card-description" style={{ marginLeft: 8 }}>{level.kind === 'site' ? 'Click a building to drill in' : level.kind === 'building' ? 'Click a hall to open it' : level.kind === 'hall' ? 'Click a rack to pin it, double-click to open it' : 'Click a device to open its record'}</span>
        </div>
      </div>

      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '0 0 16px' }}>
        <KPICard title="IT load" value={k.itKw} suffix=" kW" icon={<ThunderboltOutlined />} iconTone="info" />
        <KPICard title="Power headroom" value={k.headroomKw} suffix=" kW" icon={<DashboardOutlined />} iconTone="cyan" />
        <KPICard title="PUE" value={k.pue} color={k.pue > k.pueTarget ? 'var(--vw-color-amber-600)' : undefined} icon={<FireOutlined />} iconTone="warning" />
        <KPICard title="Open incidents" value={k.openIncidents} color={k.openIncidents ? 'var(--vw-color-red-600)' : undefined} icon={<AlertOutlined />} iconTone="error" />
      </div>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)' }}>
        <VwCard size="small" title={level.kind === 'site' ? `${m.dc.name} — site twin` : level.kind === 'building' ? `${building?.building.name ?? 'Building'} — floors and halls` : level.kind === 'hall' ? `${hall?.hall.name ?? 'Hall'} — rack twin` : `${rackVm?.rack.name ?? 'Rack'} — elevation`} extra={<VwChip>{SITE_LAYERS.find((l) => l.value === layer)?.label} layer</VwChip>}>
          <SiteTwin model={m} level={level} layer={layer} view={view} palette={p} selectedRackId={selected} onDrill={setLevel} onSelectRack={setSelected} onOpenDevice={(id) => navigate(`/facility/devices/${id}`)} attention={attention} focusHallId={level.kind === 'building' ? lastHallId : undefined} />
          <div className="vw-flex vw-gap-sm" style={{ flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            {level.kind === 'rack' ? ['Server', 'GPU node', 'Storage', 'Switch', 'Router', 'Firewall', 'Faulty', 'Retired'].map((l, i) => <span key={l} className={`vw-chip vw-chip--${['info', 'purple', 'cyan', 'success', 'warning', 'error', 'error-solid', 'neutral'][i]}`}>{l}</span>) : legend.map((l) => <span key={l.label} className={`vw-chip vw-chip--${l.tone}`}>{l.label}</span>)}
            <span className="vw-card-description" style={{ marginLeft: 'auto' }}>{level.kind === 'site' ? `${m.buildings.length} buildings · ${m.halls.length} halls · ${m.racks.length} racks` : level.kind === 'building' && building ? `${building.floors.length} floors · ${building.halls.length} halls · ${building.racks.length} racks · ${building.itKw} kW` : level.kind === 'hall' && hall ? `${hall.racks.length} racks · ${hall.itKw} kW IT · ${hall.occupancyPct}% positions used · ${hall.rows[0]?.containment ?? 'No'} containment` : rackVm ? `${rackDevices.length} devices · ${rackVm.rack.usedU}/${rackVm.rack.heightU} U · ${rackVm.rack.currentPowerKw}/${rackVm.rack.maxPowerKw} kW` : ''}</span>
          </div>
        </VwCard>

        <div className="vw-flex vw-flex-col vw-gap-md">
          {parent && (
            <div>
              <Button size="small" type="link" icon={<ArrowLeftOutlined />} onClick={() => setLevel(parent.to)}>Back to {parent.label}</Button>
            </div>
          )}
          <FoldCard id="attention" folded={!!folded.attention} onToggle={toggle} title="Needs attention" extra={attentionInScope.length ? <span className="vw-flex vw-gap-sm">{attention.counts.critical > 0 && <VwChip color="error">{attentionInScope.filter((i) => i.severity === 'critical').length} critical</VwChip>}<VwChip color="warning">{attentionInScope.filter((i) => i.severity === 'major').length} major</VwChip></span> : <VwChip color="success">All clear</VwChip>}>
            {attentionInScope.length ? (
              <div className="vw-flex vw-flex-col vw-gap-sm">
                {attentionInScope.slice(0, 8).map((it) => (
                  <div key={`${it.kind}-${it.id}`} className="vw-card-child vw-card--clickable" role="button" tabIndex={0} style={{ cursor: 'pointer', padding: '6px 10px' }} onClick={() => goTo(it)} onKeyDown={(e) => { if (e.key === 'Enter') goTo(it); }}>
                    <div className="vw-flex vw-items-center vw-gap-sm" style={{ minWidth: 0 }}>
                      <VwChip color={it.severity === 'critical' ? 'error' : 'warning'} solid>{it.severity === 'critical' ? 'Critical' : 'Major'}</VwChip>
                      <span className="vw-card-title-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                      <span className="vw-card-description" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{it.kind === 'rack' ? `rack · ${it.where}` : it.kind === 'hall' ? `hall · ${it.where}` : 'building'}</span>
                    </div>
                    <div className="vw-card-description" style={{ marginTop: 2 }}>{it.reasons.join(' · ')}</div>
                  </div>
                ))}
                {attentionInScope.length > 8 && <div className="vw-card-description">+ {attentionInScope.length - 8} more — drill into a building or hall to narrow the list</div>}
              </div>
            ) : <div className="vw-card-description">No open incidents, active alarms, hot inlets, racks near their power budget or failed plant {level.kind === 'site' ? 'on this site' : 'at this level'}.</div>}
          </FoldCard>
          {level.kind === 'site' && (
            <>
              <FoldCard id="buildings" folded={!!folded.buildings} onToggle={toggle} title="Buildings" extra={<span className="vw-card-description">click to open</span>}>
                <Table size="small" rowKey={(b) => b.building.id} pagination={false} dataSource={m.buildings} onRow={(b) => ({ onClick: () => setLevel({ kind: 'building', id: b.building.id }), style: { cursor: 'pointer' } })} columns={[
                  { title: 'Building', dataIndex: ['building', 'name'] }, { title: 'Halls', render: (_, b) => b.halls.length }, { title: 'Racks', render: (_, b) => b.racks.length },
                  { title: 'Power', render: (_, b) => <Progress percent={b.powerPct} size="small" strokeColor={b.powerPct >= 85 ? p.amber : p.emerald} format={() => `${b.itKw} kW`} /> }, { title: 'Open', render: (_, b) => b.incidents ? <VwChip color="error">{b.incidents}</VwChip> : <VwChip color="success">0</VwChip> },
                ]} />
              </FoldCard>
              <FoldCard id="scorecard" folded={!!folded.scorecard} onToggle={toggle} title="Executive scorecard">
                <HealthRing kpis={k} palette={p} />
                <div className="vw-grid vw-grid-cols-2 vw-gap-sm" style={{ marginTop: 12 }}>
                  <div className="vw-card-child"><div className="vw-card-metric-label">Availability</div><div className="vw-card-metric-lg">{k.availabilityPct}%</div></div>
                  <div className="vw-card-child"><div className="vw-card-metric-label">PUE vs target</div><div className="vw-card-metric-lg">{k.pue} <span className="vw-card-metric-label-sub">/ {k.pueTarget}</span></div></div>
                  <div className="vw-card-child"><div className="vw-card-metric-label">Monthly opex</div><div className="vw-card-metric-lg">${(k.opexUsd / 1000).toFixed(0)}k</div></div>
                  <div className="vw-card-child"><div className="vw-card-metric-label">Carbon / month</div><div className="vw-card-metric-lg">{k.carbonT} t</div></div>
                  <div className="vw-card-child"><div className="vw-card-metric-label">Circuits live</div><div className="vw-card-metric-lg">{k.circuits - k.circuitsOffline}<span className="vw-card-metric-label-sub"> / {k.circuits}</span></div></div>
                  <div className="vw-card-child"><div className="vw-card-metric-label">Active alarms</div><div className="vw-card-metric-lg">{k.activeAlarms}</div></div>
                </div>
              </FoldCard>
            </>
          )}
          {level.kind === 'building' && building && (
            <FoldCard id="halls" folded={!!folded.halls} onToggle={toggle} title={`${building.building.name} — halls`} extra={<span className="vw-card-description">click to open</span>}>
              <div className="vw-grid vw-grid-cols-3 vw-gap-sm" style={{ marginBottom: 10 }}>
                <div className="vw-card-child"><div className="vw-card-metric-label">IT load</div><div className="vw-card-metric-lg">{building.itKw}<span className="vw-card-metric-label-sub"> kW</span></div></div>
                <div className="vw-card-child"><div className="vw-card-metric-label">Occupancy</div><div className="vw-card-metric-lg">{building.occupancyPct}%</div></div>
                <div className="vw-card-child"><div className="vw-card-metric-label">Hottest inlet</div><div className="vw-card-metric-lg">{building.maxInletC}<span className="vw-card-metric-label-sub"> °C</span></div></div>
              </div>
              <Table size="small" rowKey={(h) => h.hall.id} pagination={false} dataSource={building.halls} onRow={(h) => ({ onClick: () => setLevel({ kind: 'hall', id: h.hall.id }), style: { cursor: 'pointer' } })} columns={[
                { title: 'Hall', dataIndex: ['hall', 'name'] }, { title: 'Floor', render: (_, h) => h.floor?.name ?? '—' }, { title: 'Racks', render: (_, h) => `${h.racks.length}/${h.hall.rackCapacity}` },
                { title: 'Power', render: (_, h) => <Progress percent={h.powerPct} size="small" strokeColor={h.powerPct >= 85 ? p.amber : p.emerald} format={() => `${h.itKw} kW`} /> }, { title: 'Open', render: (_, h) => h.incidents ? <VwChip color="error">{h.incidents}</VwChip> : <VwChip color="success">0</VwChip> },
              ]} />
            </FoldCard>
          )}
          {level.kind === 'hall' && hall && (
            <>
              <FoldCard id="selectedRack" folded={!!folded.selectedRack} onToggle={toggle} title={rackVm ? `${rackVm.rack.name} · ${rackVm.rack.purpose}` : 'Selected rack'} extra={rackVm && <Button size="small" type="primary" onClick={() => setLevel({ kind: 'rack', id: rackVm.rack.id })}>Open rack →</Button>}>
                {rackVm ? (
                  <div className="vw-flex vw-flex-col vw-gap-sm">
                    <div><span className="vw-card-metric-label">Power</span><Progress percent={rackVm.powerPct} size="small" strokeColor={rackVm.powerPct > rackVm.blockPct ? p.red : rackVm.powerPct >= rackVm.warnPct ? p.amber : p.emerald} format={() => `${rackVm.rack.currentPowerKw}/${rackVm.rack.maxPowerKw} kW`} /></div>
                    <div><span className="vw-card-metric-label">Space</span><Progress percent={rackVm.usedPct} size="small" strokeColor={p.blue} format={() => `${rackVm.rack.usedU}/${rackVm.rack.heightU} U`} /></div>
                    <div className="vw-flex vw-gap-sm" style={{ flexWrap: 'wrap' }}>
                      <VwChip>{rackVm.rack.status}</VwChip><VwChip>{rackVm.rack.redundancy}</VwChip><VwChip color={rackVm.inletC >= 32 ? 'error' : rackVm.inletC >= 28 ? 'warning' : 'success'}>{rackVm.inletC} °C inlet</VwChip>
                      {rackVm.rack.liquidCoolingReady && <VwChip color="cyan">Liquid-ready</VwChip>}{rackVm.incidents > 0 && <VwChip color="error">{rackVm.incidents} incident{rackVm.incidents > 1 ? 's' : ''}</VwChip>}{rackVm.alarms > 0 && <VwChip color="warning">{rackVm.alarms} alarms</VwChip>}
                    </div>
                    <div className="vw-card-description">{rackVm.deviceCount} devices · owner {rackVm.rack.owner} · {rackVm.networkDevices} managed · {rackVm.containment} containment · ≈ ${rackVm.costUsd.toLocaleString()}/month energy</div>
                  </div>
                ) : <div className="vw-card-description">Click a rack in the twin, or a row below, to pin its readout.</div>}
              </FoldCard>
              <FoldCard id="racks" folded={!!folded.racks} onToggle={toggle} title={`Racks in ${hall.hall.name}`} extra={<span className="vw-card-description">{hall.racks.length} racks</span>}>
                <Table size="small" rowKey={(r) => r.rack.id} pagination={{ pageSize: 8, size: 'small' }} dataSource={hall.racks} rowClassName={(r) => (r.rack.id === selected ? 'ant-table-row-selected' : '')} onRow={(r) => ({ onClick: () => setSelected(r.rack.id), onDoubleClick: () => setLevel({ kind: 'rack', id: r.rack.id }), style: { cursor: 'pointer' } })} columns={[
                  { title: 'Rack', dataIndex: ['rack', 'name'] }, { title: 'Purpose', dataIndex: ['rack', 'purpose'] }, { title: 'U', render: (_, r) => `${r.rack.usedU}/${r.rack.heightU}` },
                  { title: 'Power', render: (_, r) => <span style={{ color: r.powerPct > r.blockPct ? p.red : r.powerPct >= r.warnPct ? p.amber : undefined }}>{r.powerPct}%</span> }, { title: 'Status', render: (_, r) => <VwChip color={r.rack.status === 'Active' ? 'success' : r.rack.status === 'Full' ? 'purple' : 'neutral'}>{r.rack.status}</VwChip> },
                ]} />
              </FoldCard>
            </>
          )}
          {level.kind === 'rack' && rackVm && (
            <FoldCard id="devices" folded={!!folded.devices} onToggle={toggle} title={`Devices in ${rackVm.rack.name}`} extra={<Button size="small" type="link" onClick={() => navigate(`/facility/racks/${rackVm.rack.id}`)}>Rack record →</Button>}>
              <div className="vw-grid vw-grid-cols-3 vw-gap-sm" style={{ marginBottom: 10 }}>
                <div className="vw-card-child"><div className="vw-card-metric-label">Draw</div><div className="vw-card-metric-lg">{rackVm.rack.currentPowerKw}<span className="vw-card-metric-label-sub"> / {rackVm.rack.maxPowerKw} kW</span></div></div>
                <div className="vw-card-child"><div className="vw-card-metric-label">Space</div><div className="vw-card-metric-lg">{rackVm.rack.usedU}<span className="vw-card-metric-label-sub"> / {rackVm.rack.heightU} U</span></div></div>
                <div className="vw-card-child"><div className="vw-card-metric-label">Inlet</div><div className="vw-card-metric-lg">{rackVm.inletC}<span className="vw-card-metric-label-sub"> °C</span></div></div>
              </div>
              <Table size="small" rowKey="id" pagination={{ pageSize: 10, size: 'small' }} dataSource={rackDevices} onRow={(d) => ({ onClick: () => navigate(`/facility/devices/${d.id}`), style: { cursor: 'pointer' } })} columns={[
                { title: 'U', render: (_, d) => (d.heightU ? `${d.position}${(d.heightU ?? 1) > 1 ? `–${(d.position ?? 1) + (d.heightU ?? 1) - 1}` : ''}` : '0U') }, { title: 'Device', dataIndex: 'name' }, { title: 'Model', dataIndex: 'model' },
                { title: 'W', dataIndex: 'powerDrawW' }, { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={s === 'Active' ? 'success' : s === 'Faulty' ? 'error' : s === 'Maintenance' ? 'warning' : 'neutral'}>{s}</VwChip> },
              ]} />
            </FoldCard>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {layer === 'power' && (
          <VwCard size="small" title="Power one-line — utility to hall" extra={<span className="vw-card-description">Ribbons are kilowatts · A-side blue, B-side cyan · failed paths red</span>}>
            <PowerOneLine nodes={m.power.nodes} links={m.power.links} palette={p} />
          </VwCard>
        )}
        {layer === 'cooling' && contourHall && (
          <VwCard size="small" title={`Thermal map — ${contourHall.hall.name}`} extra={<div className="vw-flex vw-gap-sm" style={{ alignItems: 'center', minWidth: 300 }}><span className="vw-card-description">Time of day</span><Slider min={0} max={23} value={hour} onChange={setHour} style={{ width: 180 }} tooltip={{ formatter: (v) => `${String(v).padStart(2, '0')}:00` }} /><VwChip>{String(hour).padStart(2, '0')}:00</VwChip></div>}>
            <ThermalContour hall={contourHall} palette={p} hour={hour} onHoverRack={() => undefined} />
            <div className="vw-card-description" style={{ marginTop: 8 }}>Zone {contourHall.zone?.name ?? '—'} · setpoint {contourHall.zone?.setpointC ?? '—'} °C · {contourHall.cracs.length} cooling units{contourHall.cracs.some((c) => c.status === 'Failed') ? ' · one unit FAILED — hot band spreading from the back wall' : ''} · load follows a diurnal curve</div>
          </VwCard>
        )}
        {layer === 'network' && (
          <VwCard size="small" title="Network fabric and carrier circuits" extra={<span className="vw-card-description">Click a device to open it in Network Operations</span>}>
            <NetworkFabric model={m} palette={p} onSelectDevice={(id) => navigate(`/nms/devices/${id}`)} />
          </VwCard>
        )}
        {layer === 'space' && (
          <VwCard size="small" title="Halls — occupancy and load" extra={<span className="vw-card-description">click to open a hall</span>}>
            <Table size="small" rowKey={(h) => h.hall.id} pagination={false} dataSource={m.halls} onRow={(h) => ({ onClick: () => setLevel({ kind: 'hall', id: h.hall.id }), style: { cursor: 'pointer' } })} columns={[
              { title: 'Hall', dataIndex: ['hall', 'name'] }, { title: 'Building', render: (_, h) => h.building?.name ?? '—' }, { title: 'Racks', render: (_, h) => `${h.racks.length} / ${h.hall.rackCapacity}` },
              { title: 'Occupancy', render: (_, h) => <Progress percent={h.occupancyPct} size="small" /> }, { title: 'IT load', render: (_, h) => `${h.itKw} kW` },
              { title: 'Design', render: (_, h) => `${h.hall.designPowerKw} kW` }, { title: 'Containment', render: (_, h) => h.rows[0]?.containment ?? '—' },
              { title: 'Planned', render: (_, h) => h.racks.filter((r) => r.planned).length }, { title: 'Reserved', render: (_, h) => h.racks.filter((r) => r.reserved).length },
            ]} />
          </VwCard>
        )}
        {layer === 'delivery' && (
          <VwCard size="small" title="Delivery at this site" extra={<Button size="small" type="link" onClick={() => navigate('/delivery/portfolio')}>Portfolio →</Button>}>
            {projectsOpen.length ? <Table size="small" rowKey="id" pagination={false} dataSource={projectsOpen} onRow={(pr) => ({ onClick: () => navigate(`/delivery/projects/${pr.id}`), style: { cursor: 'pointer' } })} columns={[
              { title: 'Project', dataIndex: 'name' }, { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={s === 'At Risk' || s === 'Blocked' ? 'error' : s === 'On Hold' ? 'warning' : 'blue'}>{s}</VwChip> },
              { title: 'RAG', dataIndex: 'rag', render: (r: string) => <VwChip color={r === 'Red' ? 'error' : r === 'Amber' ? 'warning' : r === 'Green' ? 'success' : 'neutral'}>{r}</VwChip> },
              { title: 'Progress', dataIndex: 'percentComplete', render: (v: number) => <Progress percent={v} size="small" /> }, { title: 'Manager', dataIndex: 'managerName' }, { title: 'Planned end', dataIndex: 'plannedEnd', render: (v: string) => v?.slice(0, 10) },
            ]} /> : <Empty description="No open projects at this site" />}
            <div className="vw-card-description" style={{ marginTop: 8 }}>{m.racks.filter((r) => r.planned).length} planned positions and {m.racks.filter((r) => r.reserved).length} reserved racks are shown as ghosts and amber in the twin.</div>
          </VwCard>
        )}
        {layer === 'operations' && (
          <VwCard size="small" title="Open incidents at this site" extra={<Button size="small" type="link" onClick={() => navigate('/incidents')}>Incidents →</Button>}>
            {openIncidents.length ? <Table size="small" rowKey="id" pagination={false} dataSource={openIncidents} onRow={(i) => ({ onClick: () => navigate(`/incidents/${i.id}`), style: { cursor: 'pointer' } })} columns={[
              { title: 'Severity', dataIndex: 'severity', render: (s: string) => <VwChip color={s === 'SEV1' ? 'error' : s === 'SEV2' ? 'warning' : 'neutral'}>{s}</VwChip> }, { title: 'Title', dataIndex: 'title' },
              { title: 'Status', dataIndex: 'status' }, { title: 'Affects', dataIndex: 'affectedResourceType' }, { title: 'Assignee', dataIndex: 'assignee' },
              { title: 'Detected', dataIndex: 'detectedAt', render: (v: string) => <Tooltip title={v}>{v?.slice(0, 16).replace('T', ' ')}</Tooltip> },
            ]} /> : <Empty description="No open incidents" />}
          </VwCard>
        )}
      </div>
    </div>
  );
}
