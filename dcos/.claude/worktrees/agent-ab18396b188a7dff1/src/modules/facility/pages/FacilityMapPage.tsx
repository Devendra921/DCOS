import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Typography, Input, Tag, Space, Progress, Switch, Select } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { VwCard, VwChip } from '../../../shared/components/ux';
import {
  ThunderboltOutlined, FireOutlined, AlertOutlined, ApartmentOutlined, HeartOutlined,
  DashboardOutlined, ApiOutlined, SwapOutlined, BranchesOutlined,
} from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { ViewSwitcher } from '../../../shared/components/ux/ViewSwitcher';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import { healthColor } from '../../nms/lib/health';
import { buildSiteLayers, buildBackbone, type SiteLayers } from '../lib/geo';
import { BuildingStack } from '../components/BuildingStack';
import { DC_SEGMENT, type DcSegment } from '../../../mock/data/enums';
import { DC_TYPES_BY_SEGMENT, dcTypeName } from '../../../mock/data/dcTypes';
import type {
  DataCenter, Rack, CoolingZone, ManagedDevice, Interface, Alarm, Incident, ChangeRequest,
  MaintenanceWindow, Circuit, CircuitTermination, Campus, Region,
} from '../../../mock/data/types';

const { Text } = Typography;
const { CheckableTag } = Tag;

type Thematic = 'Health' | 'Power' | 'Cooling' | 'PUE' | 'Performance' | 'Status';
type EventLayer = 'Alarms' | 'Incidents' | 'Changes';
const TIERS = ['Tier I', 'Tier II', 'Tier III', 'Tier IV'];
const STATUS_COLOR: Record<string, string> = { Operational: 'var(--vw-color-green-600)', Construction: 'var(--vw-color-orange-700)', Planned: 'var(--primaryColor500)', Decommissioning: 'var(--vw-color-red-600)', Retired: 'var(--vw-color-slate-400)' };
const SEV_HEX: Record<string, string> = { Critical: 'var(--vw-color-red-600)', Major: 'var(--vw-color-orange-700)', Minor: 'var(--primaryColor500)', Warning: '#a16207', Info: 'var(--vw-color-gray-500)' };
const heat = (v: number) => (v >= 85 ? 'var(--vw-color-red-600)' : v >= 60 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-green-600)');
const pueColor = (v: number) => (v <= 1.4 ? 'var(--vw-color-green-600)' : v <= 1.6 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)');
const EVENT_HEX: Record<EventLayer, string> = { Alarms: 'var(--vw-color-red-600)', Incidents: 'var(--vw-color-orange-700)', Changes: 'var(--primaryColor500)' };

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

  const toggleEvent = (e: EventLayer) => setEvents((cur) => { const n = new Set(cur); n.has(e) ? n.delete(e) : n.add(e); return n; });
  const THEMATICS: { key: Thematic; label: string; icon: React.ReactNode }[] = [
    { key: 'Health', label: 'Network health', icon: <HeartOutlined /> },
    { key: 'Power', label: 'Power utilisation', icon: <ThunderboltOutlined /> },
    { key: 'Cooling', label: 'Cooling load', icon: <FireOutlined /> },
    { key: 'PUE', label: 'PUE (efficiency)', icon: <DashboardOutlined /> },
    { key: 'Performance', label: 'Network performance', icon: <ApiOutlined /> },
    { key: 'Status', label: 'Facility status', icon: <ApartmentOutlined /> },
  ];

  const totals = useMemo(() => ({
    alarms: sites.reduce((s, x) => s + x.activeAlarms, 0),
    incidents: sites.reduce((s, x) => s + x.openIncidents, 0),
    changes: sites.reduce((s, x) => s + x.inflightChanges + x.maintenance, 0),
    avgHealth: sites.length ? Math.round(sites.reduce((s, x) => s + x.health, 0) / sites.length) : 0,
  }), [sites]);

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div>
          <div className="vw-page-title" role="heading" aria-level={3}>Geo Command Map</div>
        </div>
        <Space size={12} align="center" wrap>
          <PageDcScopeSelect />
          <ViewSwitcher />
        </Space>
      </div>

      <VwCard size="small" style={{ margin: '12px 0' }} bodyStyle={{ padding: '8px 14px' }}>
        <Space size={18} wrap>
          <Text style={{ fontSize: "var(--vw-font-label-md)" }}><strong>{visible.length}</strong>/{sites.length} sites</Text>
          <Text style={{ fontSize: "var(--vw-font-label-md)" }}><strong>{racks.length}</strong> racks</Text>
          <Text style={{ fontSize: "var(--vw-font-label-md)", color: healthColor(totals.avgHealth) }}>avg health <strong>{totals.avgHealth}</strong></Text>
          <Text style={{ fontSize: "var(--vw-font-label-md)", color: totals.alarms ? 'var(--vw-color-red-600)' : undefined }}><AlertOutlined /> {totals.alarms} alarms</Text>
          <Text style={{ fontSize: "var(--vw-font-label-md)", color: totals.incidents ? 'var(--vw-color-orange-700)' : undefined }}>{totals.incidents} incidents</Text>
          <Text style={{ fontSize: "var(--vw-font-label-md)" }}><SwapOutlined /> {totals.changes} changes/maint</Text>
        </Space>
      </VwCard>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: "var(--vw-space-lg)" }}>
        {/* Layers panel */}
        <VwCard size="small" title="Layers" style={{ width: 248, flexShrink: 0 }} bodyStyle={{ padding: "var(--vw-space-md)" }}>
          <div className="vw-card-title" style={{ marginBottom: 6 }}>Base layer</div>
          {THEMATICS.map((o) => (
            <div key={o.key} onClick={() => setThematic(o.key)}
              style={{ padding: '7px 10px', borderRadius: "var(--vw-radius-sm)", cursor: 'pointer', marginBottom: 3, display: 'flex', gap: "var(--vw-space-sm)", alignItems: 'center', fontSize: "var(--vw-font-label-md)", background: thematic === o.key ? '#eff6ff' : 'transparent', border: `1px solid ${thematic === o.key ? '#bfdbfe' : 'transparent'}` }}>
              <span className="vw-text-tertiary">{o.icon}</span>{o.label}
            </div>
          ))}
          <div className="vw-card-title" style={{ margin: '14px 0 8px' }}>Event overlays</div>
          {(['Alarms', 'Incidents', 'Changes'] as EventLayer[]).map((e) => (
            <div key={e} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-sm)" }}>
              <span style={{ fontSize: "var(--vw-font-label-md)" }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: EVENT_HEX[e], marginRight: 7 }} />{e}</span>
              <Switch size="small" checked={events.has(e)} onChange={() => toggleEvent(e)} />
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: "var(--vw-space-xxs)" }}>
            <span style={{ fontSize: "var(--vw-font-label-md)" }}><BranchesOutlined className="vw-text-tertiary" style={{ marginRight: 7 }} />Connectivity</span>
            <Switch size="small" checked={backbone} onChange={setBackbone} />
          </div>
          <div className="vw-card-title" style={{ margin: '14px 0 6px' }}>Tier filter</div>
          <div>{TIERS.map((t) => <CheckableTag key={t} checked={tiers.includes(t)} onChange={(c) => setTiers((cur) => c ? [...cur, t] : cur.filter((x) => x !== t))} style={{ marginBottom: "var(--vw-space-xxs)" }}>{t.replace('Tier ', 'T')}</CheckableTag>)}</div>
          <div className="vw-card-title" style={{ margin: '14px 0 6px' }}>Type filter</div>
          <div>{DC_SEGMENT.map((sg) => <CheckableTag key={sg} checked={segments.includes(sg)} onChange={(c) => setSegments((cur) => c ? [...cur, sg] : cur.filter((x) => x !== sg))} style={{ marginBottom: "var(--vw-space-xxs)" }}>{sg}</CheckableTag>)}</div>
          <Select mode="multiple" size="small" allowClear maxTagCount="responsive" showSearch optionFilterProp="label" placeholder="All types" value={typeKeys} onChange={setTypeKeys} style={{ width: '100%', marginTop: "var(--vw-space-xxs)" }}
            options={DC_SEGMENT.filter((sg) => segments.includes(sg)).map((sg) => ({ label: sg, options: DC_TYPES_BY_SEGMENT[sg].map((t) => ({ value: t.key, label: t.name })) }))} />
          <Input.Search size="small" placeholder="Find site" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: "var(--vw-space-sm)" }} />
        </VwCard>

        {/* Map */}
        <VwCard size="small" className="vw-geo-map" style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} bodyStyle={{ padding: 0, flex: 1, position: 'relative', minHeight: 540 }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <MapContainer center={center} zoom={3} style={{ height: '100%', width: '100%', borderRadius: "var(--vw-radius-sm)" }} worldCopyJump>
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
          </div>
        </VwCard>

        {/* Selected site */}
        {selSite && (
          <VwCard size="small" title={selSite.code} extra={<Button size="small" type="text" onClick={() => setSel(null)}>✕</Button>} style={{ width: 320, flexShrink: 0 }}>
            <div style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 600 }}>{selSite.name}</div>
            <Space size={4} wrap style={{ margin: '4px 0 10px' }}>{selSite.dcTypeKey && <VwChip color="blue">{dcTypeName(selSite.dcTypeKey)}</VwChip>}<VwChip>{selSite.tier}</VwChip><VwChip color={selSite.status === 'Operational' ? 'green' : 'default'}>{selSite.status}</VwChip><VwChip>{selSite.regionName}</VwChip></Space>
            <BuildingStack dcId={selSite.id} onFloor={(hallId) => navigate(`/facility/hall/${hallId}`)} />
            <div style={{ marginTop: "var(--vw-space-md)" }}>
              {[
                ['Network health', String(selSite.health), healthColor(selSite.health)],
                ['Power', `${selSite.powerPct}%`, heat(selSite.powerPct)],
                ['Cooling', `${selSite.coolingPct}%`, heat(selSite.coolingPct)],
                ['PUE', selSite.pue.toFixed(2), pueColor(selSite.pue)],
                ['Performance', `${selSite.perfPct}%`, heat(selSite.perfPct)],
              ].map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid #f4f4f4', fontSize: "var(--vw-font-label-md)" }}>
                  <Text type="secondary">{l}</Text><Text strong style={{ color: c }}>{v}</Text>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
                {selSite.activeAlarms > 0 && <VwChip color="error">{selSite.activeAlarms} alarms</VwChip>}
                {selSite.openIncidents > 0 && <VwChip color="warning">{selSite.openIncidents} incidents</VwChip>}
                {(selSite.inflightChanges + selSite.maintenance) > 0 && <VwChip color="blue">{selSite.inflightChanges + selSite.maintenance} changes/maint</VwChip>}
                {selSite.circuits > 0 && <VwChip color={selSite.circuitsOffline ? 'red' : 'default'}>{selSite.circuits} circuits{selSite.circuitsOffline ? ` · ${selSite.circuitsOffline} down` : ''}</VwChip>}
              </div>
              <Button size="small" type="primary" ghost block onClick={() => navigate(`/facility/dc/${selSite.id}`)}>Drill into data center →</Button>
            </div>
          </VwCard>
        )}
      </div>

      {/* Legend */}
      <Space size={16} style={{ margin: '10px 0 4px' }} wrap>
        {thematic === 'Status' && Object.entries(STATUS_COLOR).map(([k, v]) => <Legend key={k} c={v} l={k} />)}
        {thematic === 'PUE' && <><Legend c="var(--vw-color-green-600)" l="≤1.4 efficient" /><Legend c="var(--vw-color-orange-700)" l="1.4–1.6" /><Legend c="var(--vw-color-red-600)" l=">1.6" /></>}
        {thematic === 'Health' && <><Legend c="var(--vw-color-green-600)" l="≥80 healthy" /><Legend c="var(--vw-color-orange-700)" l="60–79" /><Legend c="var(--vw-color-red-600)" l="<60" /></>}
        {(thematic === 'Power' || thematic === 'Cooling' || thematic === 'Performance') && <><Legend c="var(--vw-color-green-600)" l="<60%" /><Legend c="var(--vw-color-orange-700)" l="60–85%" /><Legend c="var(--vw-color-red-600)" l="≥85%" /></>}
        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>· marker size = racks · badges = active events · lines = connectivity</Text>
      </Space>

      {/* Region health */}
      <VwCard size="small" title="Regional health" style={{ marginTop: "var(--vw-space-md)" }}>
        <Row3>
          {regions.map((r) => {
            const inR = sites.filter((s) => s.regionId === r.id);
            if (!inR.length) return null;
            const h = Math.round(inR.reduce((s, x) => s + x.health, 0) / inR.length);
            const al = inR.reduce((s, x) => s + x.activeAlarms, 0);
            return (
              <div key={r.id} style={{ flex: '1 1 200px', minWidth: 200 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: "var(--vw-font-label-md)" }}><span>{r.name} <Text type="secondary">({inR.length})</Text></span><span>{al > 0 ? <VwChip color="red">{al}</VwChip> : null}<Text strong style={{ color: healthColor(h) }}>{h}</Text></span></div>
                <Progress percent={h} size="small" showInfo={false} strokeColor={healthColor(h)} />
              </div>
            );
          })}
        </Row3>
      </VwCard>
    </div>
  );
}

function Row3({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: "var(--vw-space-xl)", flexWrap: 'wrap' }}>{children}</div>;
}
function Legend({ c, l }: { c: string; l: string }) {
  return <span className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)" }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c, marginRight: "var(--vw-space-xxs)" }} />{l}</span>;
}
