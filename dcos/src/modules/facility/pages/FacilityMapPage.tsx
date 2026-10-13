import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Select } from 'antd';
import { Activity, ArrowRight, Building2, Flame, Gauge, GitBranch, Globe, HeartPulse, Layers, Map as MapIcon, MapPin, X, Zap } from 'lucide-react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { ViewSwitcher } from '../../../shared/components/ux/ViewSwitcher';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, KV, Panel, SearchBox, Seg, Toggle } from '../../../ops/ui/kit';
import { SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { bandOf, healthColor } from '../../nms/lib/health';
import { buildSiteLayers, buildBackbone, type SiteLayers } from '../lib/geo';
import { BuildingStack } from '../components/BuildingStack';
import { DC_SEGMENT, type DcSegment } from '../../../mock/data/enums';
import { DC_TYPES_BY_SEGMENT, dcTypeName } from '../../../mock/data/dcTypes';
import type {
  DataCenter, Rack, CoolingZone, ManagedDevice, Interface, Alarm, Incident, ChangeRequest,
  MaintenanceWindow, Circuit, CircuitTermination, Campus, Region,
} from '../../../mock/data/types';
import './facility-map.css';

type Thematic = 'Health' | 'Power' | 'Cooling' | 'PUE' | 'Performance' | 'Status';
type EventLayer = 'Alarms' | 'Incidents' | 'Changes';
const TIERS = ['Tier I', 'Tier II', 'Tier III', 'Tier IV'];
const STATUS_COLOR: Record<string, string> = { Operational: 'var(--vw-color-green-600)', Construction: 'var(--vw-color-orange-700)', Planned: 'var(--primaryColor500)', Decommissioning: 'var(--vw-color-red-600)', Retired: 'var(--vw-color-slate-400)' };
const SEV_HEX: Record<string, string> = { Critical: 'var(--vw-color-red-600)', Major: 'var(--vw-color-orange-700)', Minor: 'var(--primaryColor500)', Warning: '#a16207', Info: 'var(--vw-color-gray-500)' };
const heat = (v: number) => (v >= 85 ? 'var(--vw-color-red-600)' : v >= 60 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-green-600)');
const pueColor = (v: number) => (v <= 1.4 ? 'var(--vw-color-green-600)' : v <= 1.6 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)');
const EVENT_HEX: Record<EventLayer, string> = { Alarms: 'var(--vw-color-red-600)', Incidents: 'var(--vw-color-orange-700)', Changes: 'var(--primaryColor500)' };
const healthTone = (h: number): Tone => (h >= 80 ? 'success' : h >= 60 ? 'warning' : 'error');

function MapResizeSync() {
  const map = useMap();
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    });
    observer.observe(map.getContainer());
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [map]);
  return null;
}

function FlyTo({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 5, { duration: 0.8 }); }, [center, map]);
  return null;
}

export default function FacilityMapPage() {
  const navigate = useNavigate();
  const [thematic, setThematic] = useState<Thematic>('Health');
  const [events, setEvents] = useState<Set<EventLayer>>(new Set(['Alarms']));
  const [backbone, setBackbone] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tiers, setTiers] = useState<string[]>(TIERS);
  // Type filter: both segments on by default; an explicit type list narrows further.
  // `?type=<key>` (from the DC Types reference page) pre-selects one type.
  const [sp] = useSearchParams();
  const [segments, setSegments] = useState<DcSegment[]>([...DC_SEGMENT]);
  const [typeKeys, setTypeKeys] = useState<string[]>(() => (sp.get('type') ? [sp.get('type')!] : []));

  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const zones = (useEntityList('coolingZones', { pageSize: 2000 }).data?.data ?? []) as unknown as CoolingZone[];
  const managed = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const interfaces = (useEntityList('interfaces', { pageSize: 10000 }).data?.data ?? []) as unknown as Interface[];
  const alarms = (useEntityList('alarms', { pageSize: 2000 }).data?.data ?? []) as unknown as Alarm[];
  const incidents = (useEntityList('incidents', { pageSize: 400 }).data?.data ?? []) as unknown as Incident[];
  const changes = (useEntityList('changeRequests', { pageSize: 500 }).data?.data ?? []) as unknown as ChangeRequest[];
  const maint = (useEntityList('maintenanceWindows', { pageSize: 400 }).data?.data ?? []) as unknown as MaintenanceWindow[];
  const circuits = (useEntityList('circuits', { pageSize: 5000 }).data?.data ?? []) as unknown as Circuit[];
  const terms = (useEntityList('circuitTerminations', { pageSize: 5000 }).data?.data ?? []) as unknown as CircuitTermination[];
  const campuses = (useEntityList('campuses', { pageSize: 200 }).data?.data ?? []) as unknown as Campus[];
  const regions = (useEntityList('regions', { pageSize: 50 }).data?.data ?? []) as unknown as Region[];

  const sites = useMemo(() => buildSiteLayers({ dcs, racks, zones, managed, interfaces, alarms, incidents, changes, maint, circuits, terms, campuses, regions }),
    [dcs, racks, zones, managed, interfaces, alarms, incidents, changes, maint, circuits, terms, campuses, regions]);
  const edges = useMemo(() => buildBackbone(sites, circuits), [sites, circuits]);
  const byId = useMemo(() => Object.fromEntries(sites.map((s) => [s.id, s])), [sites]);

  const visible = sites.filter((s) => tiers.includes(s.tier)
    && (!s.segment || segments.includes(s.segment as DcSegment))
    && (typeKeys.length === 0 || (s.dcTypeKey != null && typeKeys.includes(s.dcTypeKey)))
    && s.name.toLowerCase().includes(q.toLowerCase()));
  const center = useMemo<[number, number]>(() => sites.length ? [sites.reduce((s, d) => s + d.lat, 0) / sites.length, sites.reduce((s, d) => s + d.lng, 0) / sites.length] : [20, 0], [sites]);
  const selSite = sel ? byId[sel] : null;

  const thematicColor = (s: SiteLayers): string => {
    switch (thematic) {
      case 'Health': return healthColor(s.health);
      case 'Power': return heat(s.powerPct);
      case 'Cooling': return heat(s.coolingPct);
      case 'PUE': return pueColor(s.pue);
      case 'Performance': return heat(s.perfPct);
      case 'Status': return STATUS_COLOR[s.status] ?? 'var(--vw-color-gray-500)';
    }
  };
  const thematicVal = (s: SiteLayers): string => {
    switch (thematic) {
      case 'Health': return `health ${s.health}`;
      case 'Power': return `${s.powerPct}% power`;
      case 'Cooling': return `${s.coolingPct}% cooling`;
      case 'PUE': return `PUE ${s.pue.toFixed(2)}`;
      case 'Performance': return `${s.perfPct}% util`;
      case 'Status': return s.status;
    }
  };

  const icon = (s: SiteLayers) => {
    const col = thematicColor(s);
    const w = Math.round(Math.min(36, 18 + s.racks / 12));
    const isSel = s.id === sel;
    const badge = (on: boolean, n: number, color: string, pos: string) =>
      on && n > 0 ? `<span style="position:absolute;${pos};min-width:13px;height:13px;padding:0 2px;border-radius:7px;background:${color};border:1.5px solid #fff;color:#fff;font-size:9px;line-height:11px;text-align:center;font-weight:700">${n > 9 ? '9+' : n}</span>` : '';
    const html = `<div style="position:relative;width:${w}px;height:${w}px;transform:translate(-50%,-50%)">
      <div style="width:100%;height:100%;border-radius:50%;background:${col};opacity:.9;border:${isSel ? 3 : 2}px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35)"></div>
      ${events.has('Alarms') && s.activeAlarms > 0 ? `<span style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${SEV_HEX[s.alarmMaxSev ?? 'Minor']};animation:none"></span>` : ''}
      ${badge(events.has('Alarms'), s.activeAlarms, SEV_HEX[s.alarmMaxSev ?? 'Minor'], 'top:-6px;right:-6px')}
      ${badge(events.has('Incidents'), s.openIncidents, EVENT_HEX.Incidents, 'bottom:-6px;right:-6px')}
      ${badge(events.has('Changes'), s.inflightChanges + s.maintenance, EVENT_HEX.Changes, 'bottom:-6px;left:-6px')}
    </div>`;
    return L.divIcon({ html, className: 'dcos-site-marker', iconSize: [w, w], iconAnchor: [0, 0] });
  };

  const toggleEvent = (e: EventLayer) => setEvents((cur) => { const n = new Set(cur); if (n.has(e)) n.delete(e); else n.add(e); return n; });
  const THEMATICS: { id: Thematic; label: string; icon: typeof Activity }[] = [
    { id: 'Health', label: 'Network health', icon: HeartPulse },
    { id: 'Power', label: 'Power utilisation', icon: Zap },
    { id: 'Cooling', label: 'Cooling load', icon: Flame },
    { id: 'PUE', label: 'PUE (efficiency)', icon: Gauge },
    { id: 'Performance', label: 'Network performance', icon: Activity },
    { id: 'Status', label: 'Facility status', icon: Building2 },
  ];

  const totals = useMemo(() => ({
    alarms: sites.reduce((s, x) => s + x.activeAlarms, 0),
    alarmSites: sites.filter((x) => x.activeAlarms > 0).length,
    incidents: sites.reduce((s, x) => s + x.openIncidents, 0),
    incidentSites: sites.filter((x) => x.openIncidents > 0).length,
    changes: sites.reduce((s, x) => s + x.inflightChanges + x.maintenance, 0),
    avgHealth: sites.length ? Math.round(sites.reduce((s, x) => s + x.health, 0) / sites.length) : 0,
  }), [sites]);
  const healthParts = (['Healthy', 'Degraded', 'Critical'] as const).map((b) => ({ key: b, label: b, n: visible.filter((s) => bandOf(s.health) === b).length, tone: (b === 'Healthy' ? 'success' : b === 'Degraded' ? 'warning' : 'error') as Tone }));

  const regionRows = regions.map((r) => {
    const inR = sites.filter((s) => s.regionId === r.id);
    if (!inR.length) return null;
    return { r, n: inR.length, h: Math.round(inR.reduce((s, x) => s + x.health, 0) / inR.length), al: inR.reduce((s, x) => s + x.activeAlarms, 0) };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const legend = (
    <>
      {thematic === 'Status' && Object.entries(STATUS_COLOR).map(([k, v]) => <span key={k}><i style={{ background: v }} />{k}</span>)}
      {thematic === 'PUE' && <><span><i style={{ background: 'var(--vw-color-green-600)' }} />≤1.4 efficient</span><span><i style={{ background: 'var(--vw-color-orange-700)' }} />1.4–1.6</span><span><i style={{ background: 'var(--vw-color-red-600)' }} />&gt;1.6</span></>}
      {thematic === 'Health' && <><span><i style={{ background: 'var(--vw-color-green-600)' }} />≥80 healthy</span><span><i style={{ background: 'var(--vw-color-orange-700)' }} />60–79</span><span><i style={{ background: 'var(--vw-color-red-600)' }} />&lt;60</span></>}
      {(thematic === 'Power' || thematic === 'Cooling' || thematic === 'Performance') && <><span><i style={{ background: 'var(--vw-color-green-600)' }} />&lt;60%</span><span><i style={{ background: 'var(--vw-color-orange-700)' }} />60–85%</span><span><i style={{ background: 'var(--vw-color-red-600)' }} />≥85%</span></>}
      <span className="fmap-legend-note">marker size = racks · badges = active events · lines = connectivity</span>
    </>
  );

  const chipBtn = (key: string, on: boolean, label: string, toggle: () => void) => (
    <button key={key} type="button" className="fmap-chipbtn" aria-pressed={on} onClick={toggle}>
      <Chip tone={on ? 'info' : 'neutral'} outline={!on}>{label}</Chip>
    </button>
  );

  return (
    <OpsPage title="Geo Command Map" description="Every site on the map with health, alarms, incidents and connectivity overlays."
      actions={<><PageDcScopeSelect /><ViewSwitcher /></>}>

      <StatGrid>
        <StatTile label="Sites" value={<>{visible.length}<small> / {sites.length}</small></>} sub="shown with current filters">
          <Split parts={healthParts} />
        </StatTile>
        <StatTile label="Racks" value={racks.length.toLocaleString()} sub={`across ${sites.length} sites`} />
        <StatTile label="Avg health" value={totals.avgHealth} sub={bandOf(totals.avgHealth)} subTone={totals.avgHealth < 60 ? 'bad' : totals.avgHealth < 80 ? 'warn' : undefined}>
          <SoftMeter pct={totals.avgHealth} tone={healthTone(totals.avgHealth)} />
        </StatTile>
        <StatTile label="Active alarms" value={totals.alarms} sub={totals.alarms ? `at ${totals.alarmSites} site${totals.alarmSites === 1 ? '' : 's'}` : 'none active'} subTone={totals.alarms ? 'bad' : undefined}
          onClick={() => toggleEvent('Alarms')} active={events.has('Alarms')} />
        <StatTile label="Open incidents" value={totals.incidents} sub={totals.incidents ? `at ${totals.incidentSites} site${totals.incidentSites === 1 ? '' : 's'}` : 'none open'} subTone={totals.incidents ? 'warn' : undefined}
          onClick={() => toggleEvent('Incidents')} active={events.has('Incidents')} />
        <StatTile label="Changes & maintenance" value={totals.changes} sub="in flight or scheduled"
          onClick={() => toggleEvent('Changes')} active={events.has('Changes')} />
      </StatGrid>

      <div className={`fmap-grid${selSite ? ' has-sel' : ''}`}>
        {/* Layers panel */}
        <Panel title="Layers" icon={Layers} className="fmap-layers">
          <div className="fmap-sec">Base layer</div>
          <Seg value={thematic} onChange={setThematic} options={THEMATICS} />

          <div className="fmap-sec">Event overlays</div>
          <div className="col">
            {(['Alarms', 'Incidents', 'Changes'] as EventLayer[]).map((e) => (
              <div key={e} className="row between">
                <span className="row" style={{ gap: 7 }}><i className="fmap-dot" style={{ background: EVENT_HEX[e] }} />{e}</span>
                <Toggle on={events.has(e)} onChange={() => toggleEvent(e)} label={`${e} overlay`} />
              </div>
            ))}
            <div className="row between">
              <span className="row" style={{ gap: 7 }}><GitBranch size={14} className="muted" />Connectivity</span>
              <Toggle on={backbone} onChange={setBackbone} label="Connectivity overlay" />
            </div>
          </div>

          <div className="fmap-sec">Tier filter</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {TIERS.map((t) => chipBtn(t, tiers.includes(t), t.replace('Tier ', 'T'), () => setTiers((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t])))}
          </div>

          <div className="fmap-sec">Type filter</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {DC_SEGMENT.map((sg) => chipBtn(sg, segments.includes(sg), sg, () => setSegments((cur) => cur.includes(sg) ? cur.filter((x) => x !== sg) : [...cur, sg])))}
          </div>
          <Select mode="multiple" size="small" allowClear maxTagCount="responsive" showSearch optionFilterProp="label" placeholder="All types" value={typeKeys} onChange={setTypeKeys} style={{ width: '100%', marginTop: 8 }}
            options={DC_SEGMENT.filter((sg) => segments.includes(sg)).map((sg) => ({ label: sg, options: DC_TYPES_BY_SEGMENT[sg].map((t) => ({ value: t.key, label: t.name })) }))} />

          <div className="fmap-sec">Find site</div>
          <SearchBox value={q} onChange={setQ} placeholder="Site name" />
        </Panel>

        {/* Map */}
        <Panel title="Sites" icon={MapIcon} count={visible.length} className="fmap-canvas-panel"
          sub={`Coloured by ${THEMATICS.find((t) => t.id === thematic)?.label.toLowerCase()} · click a site for details`} flush>
          <div className="map fmap-map">
            <MapContainer center={center} zoom={3} style={{ height: '100%', width: '100%' }} worldCopyJump>
              <MapResizeSync />
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FlyTo center={selSite ? [selSite.lat, selSite.lng] : null} />
              {backbone && edges.map((e) => (
                <Polyline key={e.id} positions={[[e.a.lat, e.a.lng], [e.z.lat, e.z.lng]]}
                  pathOptions={{ color: e.degraded ? 'var(--vw-color-red-600)' : '#38bdf8', weight: 1 + e.interconnects, opacity: 0.5, dashArray: e.degraded ? '6 4' : undefined }} />
              ))}
              {visible.map((s) => (
                <Marker key={s.id} position={[s.lat, s.lng]} icon={icon(s)} eventHandlers={{ click: () => setSel(s.id) }}>
                  <Tooltip>{s.name} · {thematicVal(s)}</Tooltip>
                </Marker>
              ))}
            </MapContainer>
            <div className="map-legend">{legend}</div>
          </div>
        </Panel>

        {/* Selected site */}
        {selSite && (
          <Panel title={selSite.code} sub={selSite.name} icon={MapPin} actions={<Btn variant="ghost" icon={X} title="Close" onClick={() => setSel(null)} />}>
            <div className="col" style={{ gap: 12 }}>
              <div className="row wrap" style={{ gap: 4 }}>
                {selSite.dcTypeKey && <Chip tone="info">{dcTypeName(selSite.dcTypeKey)}</Chip>}
                <Chip>{selSite.tier}</Chip>
                <Chip tone={selSite.status === 'Operational' ? 'success' : 'neutral'} dot>{selSite.status}</Chip>
                <Chip>{selSite.regionName}</Chip>
              </div>
              <BuildingStack dcId={selSite.id} onFloor={(hallId) => navigate(`/facility/hall/${hallId}`)} />
              <KV cols={2} items={[
                ['Network health', <b key="h" style={{ color: healthColor(selSite.health) }}>{selSite.health}</b>],
                ['Power', <b key="p" style={{ color: heat(selSite.powerPct) }}>{selSite.powerPct}%</b>],
                ['Cooling', <b key="c" style={{ color: heat(selSite.coolingPct) }}>{selSite.coolingPct}%</b>],
                ['PUE', <b key="u" style={{ color: pueColor(selSite.pue) }}>{selSite.pue.toFixed(2)}</b>],
                ['Performance', <b key="f" style={{ color: heat(selSite.perfPct) }}>{selSite.perfPct}%</b>],
              ]} />
              <div className="row wrap" style={{ gap: 6 }}>
                {selSite.activeAlarms > 0 && <Chip tone="error">{selSite.activeAlarms} alarms</Chip>}
                {selSite.openIncidents > 0 && <Chip tone="warning">{selSite.openIncidents} incidents</Chip>}
                {(selSite.inflightChanges + selSite.maintenance) > 0 && <Chip tone="info">{selSite.inflightChanges + selSite.maintenance} changes/maint</Chip>}
                {selSite.circuits > 0 && <Chip tone={selSite.circuitsOffline ? 'error' : 'neutral'}>{selSite.circuits} circuits{selSite.circuitsOffline ? ` · ${selSite.circuitsOffline} down` : ''}</Chip>}
              </div>
              <Btn variant="filled" block iconRight={ArrowRight} onClick={() => navigate(`/facility/dc/${selSite.id}`)}>Drill into data center</Btn>
            </div>
          </Panel>
        )}
      </div>

      {/* Region health */}
      <Panel title="Regional health" icon={Globe} count={regionRows.length} sub="Average network health of the sites in each region">
        {regionRows.length === 0 ? <Empty icon={Globe} title="No regions with sites yet" /> : (
          <div className="grid g-3">
            {regionRows.map(({ r, n, h, al }) => (
              <div key={r.id} className="col" style={{ gap: 6 }}>
                <div className="row between">
                  <span className="row" style={{ gap: 6 }}><b className="strong">{r.name}</b><span className="muted">{n} site{n === 1 ? '' : 's'}</span></span>
                  <span className="row" style={{ gap: 6 }}>{al > 0 && <Chip tone="error" size="xs">{al} alarms</Chip>}<b className="num" style={{ color: healthColor(h) }}>{h}</b></span>
                </div>
                <SoftMeter pct={h} tone={healthTone(h)} />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </OpsPage>
  );
}
