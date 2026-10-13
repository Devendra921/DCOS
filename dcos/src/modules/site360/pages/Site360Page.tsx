import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
/**
 * Site 360 — one data center, drilled from the site to a rack.
 *
 * The breadcrumb is the journey: Campus › Site › Building › Hall › Rack. Layer pills
 * slice every level by Space, Power, Cooling, Network, Delivery or Operations; view
 * pills move the camera. The panel beside the twin shows the current level's context
 * and the list to drill into next; the panels below show the deep view for the layer.
 */
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Slider } from 'antd';
import { ArrowLeft, Box, Building2, ChevronDown, ChevronRight, FolderKanban, Gauge, LayoutGrid, Network, Server, Siren, Thermometer, TriangleAlert, Zap } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, KV, Panel, PanelLink, Seg } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Meter } from '../../../ops/ui/status';
import { StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { useScreenSynopsis } from '../../../core/docs/SynopsisContext';
import type { SynopsisDoc } from '../../../core/docs/types';
import { useSiteModel, useVwPalette, SITE_LAYERS, TWIN_VIEWS, layerLegend, type SiteLayer, type TwinLevel, type TwinView, type RackVm, type HallVm } from '../lib/siteModel';
import { useAttention, type AttentionItem } from '../lib/attention';
import { SiteTwin } from '../components/SiteTwin';
import { PowerOneLine } from '../components/PowerOneLine';
import { ThermalContour } from '../components/ThermalContour';
import { NetworkFabric } from '../components/NetworkFabric';
import { HealthRing } from '../components/CxoScorecard';
import './site360-page.css';

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

/** A side panel with a chevron in its title that folds the body away. */
function FoldPanel({ id, title, icon, extra, folded, onToggle, flush, children }: { id: string; title: ReactNode; icon?: ComponentType<{ size?: number; className?: string }>; extra?: ReactNode; folded: boolean; onToggle: (id: string) => void; flush?: boolean; children: ReactNode }) {
  const Icon = icon;
  return (
    <Panel className={`s360-fold${folded ? ' is-folded' : ''}`} flush={flush}
      title={<span className="s360-fold-toggle" role="button" tabIndex={0} aria-expanded={!folded} onClick={() => onToggle(id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(id); } }}>
        {folded ? <ChevronRight size={14} className="muted" /> : <ChevronDown size={14} className="muted" />}{Icon && <Icon size={16} className="muted" />}{title}
      </span>}
      actions={folded ? undefined : extra}>
      {folded ? null : children}
    </Panel>
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

  if (!m.dc) return <PageEmptyState title={m.loading ? 'Loading site…' : 'Data center not found'} />;

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

  const meterColor = (pct: number) => (pct >= 85 ? p.amber : p.emerald);
  const buildingRows = m.buildings.map((b) => ({ ...b, id: b.building.id }));
  const hallRows = (halls: HallVm[]) => halls.map((h) => ({ ...h, id: h.hall.id }));
  type BRow = (typeof buildingRows)[number];
  type HRow = HallVm & { id: string };
  type RRow = RackVm & { id: string };
  const buildingCols: Col<BRow>[] = [
    { key: 'b', header: 'Building', render: (b) => b.building.name },
    { key: 'h', header: 'Halls', align: 'right', render: (b) => <span className="num">{b.halls.length}</span> },
    { key: 'r', header: 'Racks', align: 'right', render: (b) => <span className="num">{b.racks.length}</span> },
    { key: 'p', header: 'Power', render: (b) => <Meter pct={b.powerPct} width={56} color={meterColor(b.powerPct)} label={`${b.itKw} kW`} /> },
    { key: 'o', header: 'Open', render: (b) => <Chip tone={b.incidents ? 'error' : 'success'} size="xs">{b.incidents}</Chip> },
  ];
  const buildingHallCols: Col<HRow>[] = [
    { key: 'h', header: 'Hall', render: (h) => h.hall.name },
    { key: 'rt', header: 'Room type', render: (h) => h.hall.roomType ?? 'Data hall' },
    { key: 'f', header: 'Floor', render: (h) => h.floor?.name ?? '—' },
    { key: 'r', header: 'Racks', align: 'right', render: (h) => <span className="num">{h.racks.length}/{h.hall.rackCapacity}</span> },
    { key: 'p', header: 'Power', render: (h) => <Meter pct={h.powerPct} width={56} color={meterColor(h.powerPct)} label={`${h.itKw} kW`} /> },
    { key: 'o', header: 'Open', render: (h) => <Chip tone={h.incidents ? 'error' : 'success'} size="xs">{h.incidents}</Chip> },
  ];
  const rackCols: Col<RRow>[] = [
    { key: 'n', header: 'Rack', render: (r) => r.rack.name },
    { key: 'p', header: 'Purpose', render: (r) => r.rack.purpose },
    { key: 'u', header: 'U', align: 'right', render: (r) => <span className="num">{r.rack.usedU}/{r.rack.heightU}</span> },
    { key: 'w', header: 'Power', align: 'right', render: (r) => <span className="num" style={{ color: r.powerPct > r.blockPct ? p.red : r.powerPct >= r.warnPct ? p.amber : undefined }}>{r.powerPct}%</span> },
    { key: 's', header: 'Status', render: (r) => <Chip tone={r.rack.status === 'Active' ? 'success' : r.rack.status === 'Full' ? 'purple' : 'neutral'} size="xs">{r.rack.status}</Chip> },
  ];
  const deviceCols: Col<(typeof rackDevices)[number]>[] = [
    { key: 'u', header: 'U', render: (d) => <span className="num">{d.heightU ? `${d.position}${(d.heightU ?? 1) > 1 ? `–${(d.position ?? 1) + (d.heightU ?? 1) - 1}` : ''}` : '0U'}</span> },
    { key: 'n', header: 'Device', render: (d) => d.name },
    { key: 'm', header: 'Model', render: (d) => d.model },
    { key: 'w', header: 'W', align: 'right', render: (d) => <span className="num">{d.powerDrawW}</span> },
    { key: 's', header: 'Status', render: (d) => <Chip tone={d.status === 'Active' ? 'success' : d.status === 'Faulty' ? 'error' : d.status === 'Maintenance' ? 'warning' : 'neutral'} size="xs">{d.status}</Chip> },
  ];
  const siteHallCols: Col<HRow>[] = [
    { key: 'h', header: 'Hall', render: (h) => h.hall.name },
    { key: 'rt', header: 'Room type', render: (h) => h.hall.roomType ?? 'Data hall' },
    { key: 'b', header: 'Building', render: (h) => h.building?.name ?? '—' },
    { key: 'r', header: 'Racks', align: 'right', render: (h) => <span className="num">{h.racks.length} / {h.hall.rackCapacity}</span> },
    { key: 'o', header: 'Occupancy', render: (h) => <Meter pct={h.occupancyPct} /> },
    { key: 'it', header: 'IT load', align: 'right', render: (h) => <span className="num">{h.itKw} kW</span> },
    { key: 'd', header: 'Design', align: 'right', render: (h) => <span className="num">{h.hall.designPowerKw} kW</span> },
    { key: 'c', header: 'Containment', render: (h) => h.rows[0]?.containment ?? '—' },
    { key: 'pl', header: 'Planned', align: 'right', render: (h) => <span className="num">{h.racks.filter((r) => r.planned).length}</span> },
    { key: 'rs', header: 'Reserved', align: 'right', render: (h) => <span className="num">{h.racks.filter((r) => r.reserved).length}</span> },
  ];
  const projectCols: Col<(typeof projectsOpen)[number]>[] = [
    { key: 'n', header: 'Project', render: (pr) => <span className="vw-card-activity-label">{pr.name}</span> },
    { key: 's', header: 'Status', render: (pr) => <Chip tone={pr.status === 'At Risk' || pr.status === 'Blocked' ? 'error' : pr.status === 'On Hold' ? 'warning' : 'info'} dot>{pr.status}</Chip> },
    { key: 'r', header: 'RAG', render: (pr) => <Chip tone={pr.rag === 'Red' ? 'error' : pr.rag === 'Amber' ? 'warning' : pr.rag === 'Green' ? 'success' : 'neutral'}>{pr.rag}</Chip> },
    { key: 'p', header: 'Progress', render: (pr) => <Meter pct={pr.percentComplete} color="var(--primaryColor500)" /> },
    { key: 'm', header: 'Manager', render: (pr) => pr.managerName },
    { key: 'e', header: 'Planned end', render: (pr) => <span className="num">{pr.plannedEnd?.slice(0, 10)}</span> },
  ];
  const incidentCols: Col<(typeof openIncidents)[number]>[] = [
    { key: 'sev', header: 'Severity', render: (i) => <Chip tone={i.severity === 'SEV1' ? 'error' : i.severity === 'SEV2' ? 'warning' : 'neutral'}>{i.severity}</Chip> },
    { key: 't', header: 'Title', render: (i) => <span className="vw-card-activity-label">{i.title}</span> },
    { key: 's', header: 'Status', render: (i) => i.status },
    { key: 'a', header: 'Affects', render: (i) => i.affectedResourceType },
    { key: 'as', header: 'Assignee', render: (i) => i.assignee },
    { key: 'd', header: 'Detected', render: (i) => <span className="num" title={i.detectedAt}>{i.detectedAt?.slice(0, 16).replace('T', ' ')}</span> },
  ];
  // Double-click a rack row to open it (the first click of the double-click pins it).
  const openRackOnDoubleClick = (e: React.MouseEvent) => {
    if (selected && (e.target as HTMLElement).closest('tbody tr')) setLevel({ kind: 'rack', id: selected });
  };

  return (
    <OpsPage title={`${m.dc.name} · Site 360`} description={`${m.typeName} · ${m.dc.tier}`}
      actions={<Chip tone={m.dc.status === 'Operational' ? 'success' : 'warning'} dot>{m.dc.status}</Chip>}>

      <section className="vw-card-section s360-bar">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Seg<SiteLayer> value={layer} onChange={setLayer} options={SITE_LAYERS.map((l) => ({ id: l.value, label: l.label }))} />
          <Seg<TwinView> value={view} onChange={setView} size="sm" options={TWIN_VIEWS.map((v) => ({ id: v.value, label: v.label }))} />
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {crumbs.flatMap((c, i) => (c ? [i > 0 ? <span key={`sep-${i}`} className="muted">›</span> : null, c] : [])).filter(Boolean)}
          <span className="muted" style={{ marginLeft: 8, fontSize: 12.5 }}>{level.kind === 'site' ? 'Click a building to drill in' : level.kind === 'building' ? 'Click a hall to open it' : level.kind === 'hall' ? 'Click a rack to pin it, double-click to open it' : 'Click a device to open its record'}</span>
        </div>
      </section>

      <StatGrid cols={4}>
        <StatTile label="IT load" value={<>{k.itKw}<small> kW</small></>} sub={`${m.racks.length} racks`} />
        <StatTile label="Power headroom" value={<>{k.headroomKw}<small> kW</small></>} sub={`of ${k.designKw} kW design`} />
        <StatTile label="PUE" value={k.pue} sub={`target ${k.pueTarget}`} subTone={k.pue > k.pueTarget ? 'warn' : undefined} />
        <StatTile label="Open incidents" value={k.openIncidents} sub={k.openIncidents ? 'at this site' : 'none open'} subTone={k.openIncidents ? 'bad' : undefined} />
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title={level.kind === 'site' ? `${m.dc.name} — site twin` : level.kind === 'building' ? `${building?.building.name ?? 'Building'} — floors and halls` : level.kind === 'hall' ? `${hall?.hall.name ?? 'Hall'} — rack twin` : `${rackVm?.rack.name ?? 'Rack'} — elevation`}
          icon={Box} actions={<Chip tone="neutral">{SITE_LAYERS.find((l) => l.value === layer)?.label} layer</Chip>}>
          <SiteTwin model={m} level={level} layer={layer} view={view} palette={p} selectedRackId={selected} onDrill={setLevel} onSelectRack={setSelected} onOpenDevice={(id) => navigate(`/facility/devices/${id}`)} attention={attention} focusHallId={level.kind === 'building' ? lastHallId : undefined} />
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 10, gap: 8 }}>
            {level.kind === 'rack' ? ['Server', 'GPU node', 'Storage', 'Switch', 'Router', 'Firewall', 'Faulty', 'Retired'].map((l, i) => <span key={l} className={`vw-chip vw-chip--${['info', 'purple', 'cyan', 'success', 'warning', 'error', 'error-solid', 'neutral'][i]}`}>{l}</span>) : legend.map((l) => <span key={l.label} className={`vw-chip vw-chip--${l.tone}`}>{l.label}</span>)}
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{level.kind === 'site' ? `${m.buildings.length} buildings · ${m.halls.length} halls · ${m.racks.length} racks` : level.kind === 'building' && building ? `${building.floors.length} floors · ${building.halls.length} halls · ${building.racks.length} racks · ${building.itKw} kW` : level.kind === 'hall' && hall ? `${hall.racks.length} racks · ${hall.itKw} kW IT · ${hall.occupancyPct}% positions used · ${hall.rows[0]?.containment ?? 'No'} containment` : rackVm ? `${rackDevices.length} devices · ${rackVm.rack.usedU}/${rackVm.rack.heightU} U · ${rackVm.rack.currentPowerKw}/${rackVm.rack.maxPowerKw} kW` : ''}</span>
          </div>
        </Panel>

        <div className="col">
          {parent && (
            <div>
              <Btn variant="ghost" icon={ArrowLeft} onClick={() => setLevel(parent.to)}>Back to {parent.label}</Btn>
            </div>
          )}
          <FoldPanel id="attention" folded={!!folded.attention} onToggle={toggle} title="Needs attention" icon={TriangleAlert} extra={attentionInScope.length ? <>{attention.counts.critical > 0 && <Chip tone="error">{attentionInScope.filter((i) => i.severity === 'critical').length} critical</Chip>}<Chip tone="warning">{attentionInScope.filter((i) => i.severity === 'major').length} major</Chip></> : <Chip tone="success">All clear</Chip>}>
            {attentionInScope.length ? (
              <div className="col" style={{ gap: 8 }}>
                {attentionInScope.slice(0, 8).map((it) => (
                  <div key={`${it.kind}-${it.id}`} className="vw-card-child vw-card--clickable" role="button" tabIndex={0} style={{ cursor: 'pointer', padding: '6px 10px' }} onClick={() => goTo(it)} onKeyDown={(e) => { if (e.key === 'Enter') goTo(it); }}>
                    <div className="row" style={{ minWidth: 0, gap: 8 }}>
                      <Chip tone={it.severity === 'critical' ? 'error' : 'warning'} solid>{it.severity === 'critical' ? 'Critical' : 'Major'}</Chip>
                      <span className="strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                      <span className="muted" style={{ marginLeft: 'auto', whiteSpace: 'nowrap', fontSize: 12 }}>{it.kind === 'rack' ? `rack · ${it.where}` : it.kind === 'hall' ? `hall · ${it.where}` : 'building'}</span>
                    </div>
                    <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>{it.reasons.join(' · ')}</div>
                  </div>
                ))}
                {attentionInScope.length > 8 && <div className="muted" style={{ fontSize: 12 }}>+ {attentionInScope.length - 8} more — drill into a building or hall to narrow the list</div>}
              </div>
            ) : <div className="muted" style={{ fontSize: 12.5 }}>No open incidents, active alarms, hot inlets, racks near their power budget or failed plant {level.kind === 'site' ? 'on this site' : 'at this level'}.</div>}
          </FoldPanel>
          {level.kind === 'site' && (
            <>
              <FoldPanel id="buildings" folded={!!folded.buildings} onToggle={toggle} title="Buildings" icon={Building2} flush extra={<span className="muted" style={{ fontSize: 12 }}>click to open</span>}>
                <DataTable rows={buildingRows} cols={buildingCols} compact pageSize={Math.max(buildingRows.length, 1)} onRow={(b) => setLevel({ kind: 'building', id: b.building.id })} />
              </FoldPanel>
              <FoldPanel id="scorecard" folded={!!folded.scorecard} onToggle={toggle} title="Executive scorecard" icon={Gauge}>
                <HealthRing kpis={k} palette={p} />
                <div style={{ marginTop: 12 }}>
                  <KV cols={2} items={[
                    ['Availability', `${k.availabilityPct}%`],
                    ['PUE vs target', `${k.pue} / ${k.pueTarget}`],
                    ['Monthly opex', `$${(k.opexUsd / 1000).toFixed(0)}k`],
                    ['Carbon / month', `${k.carbonT} t`],
                    ['Circuits live', `${k.circuits - k.circuitsOffline} / ${k.circuits}`],
                    ['Active alarms', k.activeAlarms],
                  ]} />
                </div>
              </FoldPanel>
            </>
          )}
          {level.kind === 'building' && building && (
            <FoldPanel id="halls" folded={!!folded.halls} onToggle={toggle} title={`${building.building.name} — halls`} icon={LayoutGrid} extra={<span className="muted" style={{ fontSize: 12 }}>click to open</span>}>
              <div style={{ marginBottom: 10 }}>
                <KV cols={3} items={[
                  ['IT load', `${building.itKw} kW`],
                  ['Occupancy', `${building.occupancyPct}%`],
                  ['Hottest inlet', `${building.maxInletC} °C`],
                ]} />
              </div>
              <DataTable rows={hallRows(building.halls)} cols={buildingHallCols} compact pageSize={Math.max(building.halls.length, 1)} onRow={(h) => setLevel({ kind: 'hall', id: h.hall.id })} />
            </FoldPanel>
          )}
          {level.kind === 'hall' && hall && (
            <>
              <FoldPanel id="selectedRack" folded={!!folded.selectedRack} onToggle={toggle} title={rackVm ? `${rackVm.rack.name} · ${rackVm.rack.purpose}` : 'Selected rack'} icon={Server} extra={rackVm && <Btn variant="filled" size="xs" iconRight={ChevronRight} onClick={() => setLevel({ kind: 'rack', id: rackVm.rack.id })}>Open rack</Btn>}>
                {rackVm ? (
                  <div className="col" style={{ gap: 8 }}>
                    <div className="row between"><span className="muted">Power</span><Meter pct={rackVm.powerPct} width={120} color={rackVm.powerPct > rackVm.blockPct ? p.red : rackVm.powerPct >= rackVm.warnPct ? p.amber : p.emerald} label={`${rackVm.rack.currentPowerKw}/${rackVm.rack.maxPowerKw} kW`} /></div>
                    <div className="row between"><span className="muted">Space</span><Meter pct={rackVm.usedPct} width={120} color={p.blue} label={`${rackVm.rack.usedU}/${rackVm.rack.heightU} U`} /></div>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                      <Chip tone="neutral">{rackVm.rack.status}</Chip><Chip tone="neutral">{rackVm.rack.redundancy}</Chip><Chip tone={rackVm.inletC >= 32 ? 'error' : rackVm.inletC >= 28 ? 'warning' : 'success'}>{rackVm.inletC} °C inlet</Chip>
                      {rackVm.rack.liquidCooled ? <Chip tone="cyan">Liquid-cooled</Chip> : rackVm.rack.liquidCoolingReady && <Chip tone="cyan">Liquid-ready</Chip>}{rackVm.incidents > 0 && <Chip tone="error">{rackVm.incidents} incident{rackVm.incidents > 1 ? 's' : ''}</Chip>}{rackVm.alarms > 0 && <Chip tone="warning">{rackVm.alarms} alarms</Chip>}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>{rackVm.coolingNote}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{rackVm.deviceCount} devices · owner {rackVm.rack.owner} · {rackVm.networkDevices} managed · {rackVm.containment} containment · ≈ ${rackVm.costUsd.toLocaleString()}/month energy</div>
                  </div>
                ) : <div className="muted" style={{ fontSize: 12.5 }}>Click a rack in the twin, or a row below, to pin its readout.</div>}
              </FoldPanel>
              <FoldPanel id="racks" folded={!!folded.racks} onToggle={toggle} title={`Racks in ${hall.hall.name}`} icon={Server} flush extra={<span className="muted" style={{ fontSize: 12 }}>{hall.racks.length} racks</span>}>
                <div onDoubleClick={openRackOnDoubleClick}>
                  <DataTable rows={hall.racks.map((r) => ({ ...r, id: r.rack.id }))} cols={rackCols} compact pageSize={8} rowClass={(r) => (r.rack.id === selected ? 'is-selected' : '')} onRow={(r) => setSelected(r.rack.id)} />
                </div>
              </FoldPanel>
            </>
          )}
          {level.kind === 'rack' && rackVm && (
            <FoldPanel id="devices" folded={!!folded.devices} onToggle={toggle} title={`Devices in ${rackVm.rack.name}`} icon={Server} extra={<PanelLink onClick={() => navigate(`/facility/racks/${rackVm.rack.id}`)}>Rack record</PanelLink>}>
              <div style={{ marginBottom: 10 }}>
                <KV cols={3} items={[
                  ['Draw', `${rackVm.rack.currentPowerKw} / ${rackVm.rack.maxPowerKw} kW`],
                  ['Space', `${rackVm.rack.usedU} / ${rackVm.rack.heightU} U`],
                  ['Inlet', `${rackVm.inletC} °C`],
                ]} />
              </div>
              <DataTable rows={rackDevices} cols={deviceCols} compact pageSize={10} onRow={(d) => navigate(`/facility/devices/${d.id}`)} />
            </FoldPanel>
          )}
        </div>
      </div>

      {layer === 'power' && (
        <Panel title="Power one-line — utility to hall" icon={Zap} sub="Ribbons are kilowatts · A-side blue, B-side cyan · failed paths red">
          <PowerOneLine nodes={m.power.nodes} links={m.power.links} palette={p} />
        </Panel>
      )}
      {layer === 'cooling' && contourHall && (
        <Panel title={`Thermal map — ${contourHall.hall.name}`} icon={Thermometer}
          actions={<div className="row" style={{ gap: 8, minWidth: 300 }}><span className="muted" style={{ fontSize: 12 }}>Time of day</span><Slider min={0} max={23} value={hour} onChange={setHour} style={{ width: 180 }} tooltip={{ formatter: (v) => `${String(v).padStart(2, '0')}:00` }} /><Chip tone="neutral">{String(hour).padStart(2, '0')}:00</Chip></div>}>
          <ThermalContour hall={contourHall} palette={p} hour={hour} onHoverRack={() => undefined} />
          <div className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>Zone {contourHall.zone?.name ?? '—'} · setpoint {contourHall.zone?.setpointC ?? '—'} °C · {contourHall.cracs.length} cooling units{contourHall.cracs.some((c) => c.status === 'Failed') ? ' · one unit FAILED — hot band spreading from the back wall' : ''} · load follows a diurnal curve</div>
        </Panel>
      )}
      {layer === 'network' && (
        <Panel title="Network fabric and carrier circuits" icon={Network} sub="Click a device to open it in Network Operations">
          <NetworkFabric model={m} palette={p} onSelectDevice={(id) => navigate(`/nms/devices/${id}`)} />
        </Panel>
      )}
      {layer === 'space' && (
        <Panel title="Halls — occupancy and load" icon={LayoutGrid} sub="Click to open a hall" count={m.halls.length} flush>
          <DataTable rows={hallRows(m.halls)} cols={siteHallCols} pageSize={Math.max(m.halls.length, 1)} onRow={(h) => setLevel({ kind: 'hall', id: h.hall.id })} />
        </Panel>
      )}
      {layer === 'delivery' && (
        <Panel title="Delivery at this site" icon={FolderKanban} flush count={projectsOpen.length} actions={<PanelLink onClick={() => navigate('/delivery/portfolio')}>Portfolio</PanelLink>}
          foot={<span className="muted" style={{ fontSize: 12.5 }}>{m.racks.filter((r) => r.planned).length} planned positions and {m.racks.filter((r) => r.reserved).length} reserved racks are shown as ghosts and amber in the twin.</span>}>
          <DataTable rows={projectsOpen} cols={projectCols} pageSize={Math.max(projectsOpen.length, 1)} onRow={(pr) => navigate(`/delivery/projects/${pr.id}`)}
            empty={<Empty icon={FolderKanban} title="No open projects at this site" />} />
        </Panel>
      )}
      {layer === 'operations' && (
        <Panel title="Open incidents at this site" icon={Siren} flush count={openIncidents.length} actions={<PanelLink onClick={() => navigate('/incidents')}>Incidents</PanelLink>}>
          <DataTable rows={openIncidents} cols={incidentCols} pageSize={Math.max(openIncidents.length, 1)} onRow={(i) => navigate(`/incidents/${i.id}`)}
            empty={<Empty icon={Siren} title="No open incidents" />} />
        </Panel>
      )}
    </OpsPage>
  );
}
