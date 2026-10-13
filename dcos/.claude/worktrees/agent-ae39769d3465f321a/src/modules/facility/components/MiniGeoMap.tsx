import 'leaflet/dist/leaflet.css';
import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import type { DataCenter } from '../../../mock/data/types';

const heat = (v: number) => (v >= 85 ? 'var(--vw-color-red-600)' : v >= 60 ? '#f59e0b' : 'var(--vw-color-green-600)');

/** Compact embeddable map of data centers, colored by a metric. */
export function MiniGeoMap({ dcs, utilOf, height = 260 }: { dcs: DataCenter[]; utilOf: (d: DataCenter) => number; height?: number }) {
  const navigate = useNavigate();
  const center = useMemo<[number, number]>(() => dcs.length
    ? [dcs.reduce((s, d) => s + d.latitude, 0) / dcs.length, dcs.reduce((s, d) => s + d.longitude, 0) / dcs.length]
    : [20, 0], [dcs]);
  return (
    <div style={{ height, width: '100%' }}>
      <MapContainer center={center} zoom={3} style={{ height: '100%', width: '100%', borderRadius: "var(--vw-radius-sm)" }} worldCopyJump scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {dcs.map((d) => {
          const v = utilOf(d); const c = heat(v);
          return (
            <CircleMarker key={d.id} center={[d.latitude, d.longitude]} radius={8}
              pathOptions={{ color: c, fillColor: c, fillOpacity: 0.6, weight: 2 }}
              eventHandlers={{ click: () => navigate(`/facility/dc/${d.id}`) }}>
              <Tooltip>{d.name} · {v}% power</Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
export default MiniGeoMap;
