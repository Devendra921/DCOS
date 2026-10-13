import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface DcPin { id: string; lat: number; lng: number; label: string; sub: string; color: string; size: number; pulse: boolean; dim: boolean; badge?: number }

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const WORLD: L.LatLngBoundsExpression = [[-45, -130], [62, 155]];
const boundsOf = (pins: DcPin[]): L.LatLngBoundsExpression => (pins.length ? L.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number])).pad(0.25) : WORLD);

/* Datacenters on the map: a health-coloured ring sized by estate weight,
   with a pulsing halo wherever an open SEV1/SEV2 incident is running. */
export function DcMap({ pins, onPick, height = 520 }: { pins: DcPin[]; onPick: (id: string) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onPick); pick.current = onPick;
  const pinsRef = useRef(pins); pinsRef.current = pins;
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomSnap: 0.25, attributionControl: true, scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, zoomControl: false }).fitBounds(WORLD);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.tileLayer(`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { attribution: '© Esri, HERE', maxZoom: 12 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    let fitted = false;
    const ro = new ResizeObserver(() => { if (!el.current?.isConnected) return; m.invalidateSize({ animate: false }); if (!fitted && el.current.clientHeight > 100) { fitted = true; m.fitBounds(boundsOf(pinsRef.current), { animate: false, padding: [12, 12], maxZoom: 6 }); } });
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; layer.current = null; };
  }, []);
  useEffect(() => {
    const g = layer.current; if (!g) return;
    g.clearLayers();
    if (pins.length && map.current) map.current.fitBounds(boundsOf(pins), { animate: false, padding: [12, 12], maxZoom: 6 });
    /* several datacenters share one campus (same coordinates): fan them out in a small ring so every ring and badge stays readable */
    const groups = new Map<string, DcPin[]>();
    pins.forEach(p => { const k = `${p.lat.toFixed(1)}|${p.lng.toFixed(1)}`; groups.set(k, [...(groups.get(k) ?? []), p]); });
    const at = new Map<string, [number, number]>();
    groups.forEach(ps => ps.forEach((p, i) => {
      if (ps.length === 1) { at.set(p.id, [p.lat, p.lng]); return; }
      const a = (i / ps.length) * Math.PI * 2 - Math.PI / 2, r = 0.9;
      at.set(p.id, [p.lat + Math.sin(a) * r, p.lng + Math.cos(a) * r * 1.4]);
    }));
    [...pins].sort((a, b) => Number(a.pulse) - Number(b.pulse)).forEach(p => {
      const s = p.size;
      const [lat, lng] = at.get(p.id) ?? [p.lat, p.lng];
      const html = `<div class="dcpin${p.pulse ? ' is-pulse' : ''}${p.dim ? ' is-dim' : ''}" style="--c:${p.color};--s:${s}px">${p.pulse ? '<i class="dcpin-halo"></i>' : ''}<i class="dcpin-ring"></i>${p.badge ? `<b class="dcpin-badge">${p.badge}</b>` : ''}<span class="dcpin-label">${p.label}</span></div>`;
      const icon = L.divIcon({ html, className: 'dcpin-wrap', iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
      const mk = L.marker([lat, lng], { icon, riseOnHover: true });
      mk.bindTooltip(`<b>${p.label}</b><br>${p.sub}`, { direction: 'top', offset: [0, -s / 2 - 4], className: 'map-tip' });
      mk.on('click', () => pick.current(p.id));
      mk.addTo(g);
    });
  }, [pins]);
  return <div className="map dcmap" style={{ height }}><div ref={el} style={{ position: 'absolute', inset: 0 }} /></div>;
}
