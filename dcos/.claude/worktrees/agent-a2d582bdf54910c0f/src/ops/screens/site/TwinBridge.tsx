/* One twin for the product: the site Overview tab embeds DCOS Site 360 at site level
   (layers, drill by click) and links to the full Site 360 page for the deep views. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { useSiteModel, useVwPalette, SITE_LAYERS, layerLegend, type SiteLayer, type TwinLevel } from '../../../modules/site360/lib/siteModel';
import { SiteTwin } from '../../../modules/site360/components/SiteTwin';
import { Panel, Seg, Btn } from '../../ui/kit';
import { Loading } from '../../shell/page';

export default function TwinBridge({ dcId }: { dcId: string }) {
  const nav = useNavigate();
  const p = useVwPalette();
  const m = useSiteModel(dcId);
  const [level, setLevel] = useState<TwinLevel>({ kind: 'site' });
  const [layer, setLayer] = useState<SiteLayer>('operations');
  const [selected, setSelected] = useState<string | undefined>();
  const legend = useMemo(() => layerLegend(layer), [layer]);
  if (!m.dc) return <Loading label={m.loading ? 'Loading site twin' : 'Site twin unavailable'} />;
  const crumbs: { label: string; to: TwinLevel }[] = [{ label: m.dc.name, to: { kind: 'site' } }];
  if (level.kind === 'building') { const b = m.buildings.find(x => x.building.id === level.id); if (b) crumbs.push({ label: b.building.name, to: level }); }
  if (level.kind === 'hall' || level.kind === 'rack') {
    const h = level.kind === 'hall' ? m.halls.find(x => x.hall.id === level.id) : m.halls.find(x => x.racks.some(r => r.rack.id === level.id));
    if (h?.building) crumbs.push({ label: h.building.name, to: { kind: 'building', id: h.building.id } });
    if (h) crumbs.push({ label: h.hall.name, to: { kind: 'hall', id: h.hall.id } });
    if (level.kind === 'rack') { const r = m.rackById.get(level.id); if (r) crumbs.push({ label: r.rack.name, to: level }); }
  }
  const k = m.kpis;
  return (
    <Panel title="Site 360" sub="Click a building, hall or rack to drill; layers recolour the level you are on" icon={I.Box}
      actions={<div className="row" style={{ gap: 8 }}>
        <Seg size="sm" options={SITE_LAYERS.map(l => ({ id: l.value, label: l.label }))} value={layer} onChange={setLayer} />
        <Btn variant="filled" icon={I.Maximize2} onClick={() => nav(`/facility/dc/${dcId}/site360`)}>Open Site 360</Btn>
      </div>}>
      <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
        {crumbs.map((c, i) => <span key={i} className={`vw-chip ${i === crumbs.length - 1 ? 'vw-chip--info-solid' : 'vw-chip--neutral'}`} style={{ cursor: 'pointer' }} onClick={() => setLevel(c.to)}>{c.label}</span>)}
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{k.racks} racks · {k.devices} devices · {k.itKw} kW IT · PUE {k.pue} · health {k.healthScore}</span>
      </div>
      <SiteTwin model={m} level={level} layer={layer} view="overview" palette={p} selectedRackId={selected} onDrill={setLevel} onSelectRack={setSelected} onOpenDevice={id => nav(`/ne/${id}`)} height={520} />
      <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>{legend.map(l => <span key={l.label} className={`vw-chip vw-chip--${l.tone}`}>{l.label}</span>)}</div>
    </Panel>
  );
}
