/* Plan pack sections and the Site fit tab of the in-site plan types. */
import { VwCard } from '../../../../../shared/components/ux';
import { hallGrid } from '../../../lib/placement';
import type { PlanViewProps } from '../types';
import { HallGridView, RackElevation } from './charts';
import { ChecksBlock, Note, ShortfallBanner, SiteChain } from './common';
import { analysisOf, dayFmt, kwFmt, muted, num } from './helpers';

const ALL_CHECKS = ['ins-site-power', 'ins-dc-plant', 'ins-positions', 'ins-hall-design', 'ins-u-block', 'ins-rack-power', 'ins-pdu', 'ins-uprate', 'ins-zone-cooling', 'ins-facility-water', 'ins-cdu', 'ins-setpoint', 'ins-weight', 'ins-ports', 'ins-spine-ports', 'ins-ip', 'ins-containment', 'ins-window', 'ins-waves'];

/** Rack elevation (rack), the hall grid with the planned positions (pod, hall), or the converted racks (retrofit). */
export function PlacementSection({ plan, ev, data }: PlanViewProps) {
  const a = analysisOf(ev);
  const pos = a?.pod?.chosen?.positions ?? a?.hall?.positions ?? [];
  const hallId = a?.pod?.chosen?.hall.id ?? a?.hall?.hall?.id;
  const site = a?.site;
  const grid = hallId && site ? hallGrid(data, site, hallId, plan.id) : undefined;
  if (!a) return <Note>No placement yet.</Note>;
  if (a.rack) return a.rack.accepted.length ? <div className="vw-flex vw-gap-lg vw-wrap">{a.rack.accepted.map(x => <RackElevation key={x.cand.rack.id} rb={x.cand.rb} block={x.startU && x.endU ? { start: x.startU, end: x.endU } : undefined} label={plan.plnId} />)}</div> : <Note>No rack accepted yet.</Note>;
  if (a.retrofit) return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Rack</th><th style={num}>Today</th><th style={num}>Target</th><th>Readiness</th><th style={num}>Filled weight</th><th style={num}>Feeds per side</th><th style={num}>Services</th></tr></thead>
      <tbody>{a.retrofit.rows.map(x => <tr key={x.rack.id}><td>{x.rack.name}</td><td style={num}>{x.todayKw} kW</td><td style={num}>{x.targetKw} kW</td><td>{x.readiness} <span style={muted}>({x.readinessWhy})</span></td><td style={num}>{x.filledKg} kg</td><td style={num}>{x.feedsPerSide} × {x.feedAmps} A</td><td style={num}>{x.services}</td></tr>)}</tbody></table></div>
  );
  return pos.length ? <HallGridView grid={grid} marks={pos} positions={pos} markLabel={plan.plnId} title={grid ? `${grid.hall.name} · ${pos.length} positions` : 'New hall layout'} /> : <Note>No positions accepted yet.</Note>;
}

/** Outlet, port/patch and IP schedules (rack), feed schedule (pod), phases and classes (hall), uprate (retrofit). */
export function SchedulesSection({ ev }: PlanViewProps) {
  const a = analysisOf(ev); if (!a) return <Note>Nothing scheduled yet.</Note>;
  if (a.rack) return (<div className="vw-flex vw-flex-col vw-gap-sm">
    <VwCard variant="child" title="Outlet schedule"><div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Rack</th><th>Side</th><th>Outlet</th></tr></thead><tbody>{a.rack.accepted.flatMap(x => x.outlets.map(o => <tr key={o.id}><td>{x.cand.rack.name}</td><td>{o.side}</td><td>{o.name}</td></tr>))}</tbody></table></div>{a.rack.mode === 'new-cabinet' && <Note>New power strips on new circuits: {a.rack.feed.label}.</Note>}</VwCard>
    <VwCard variant="child" title="Port and patch schedule"><div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Rack</th><th>Side</th><th>Leaf</th><th>Interface</th><th style={num}>Speed</th></tr></thead><tbody>{a.rack.accepted.flatMap(x => x.ports.map(p => <tr key={p.ifaceId}><td>{x.cand.rack.name}</td><td>{p.side}</td><td>{p.deviceName}</td><td>{p.ifaceName}</td><td style={num}>{(p.speedMbps ?? 0) / 1000}G</td></tr>))}</tbody></table></div></VwCard>
    <VwCard variant="child" title="IP list"><div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Rack</th><th>Purpose</th><th>Address</th><th>VLAN</th></tr></thead><tbody>{a.ip.addresses.map(x => <tr key={x.purpose + x.address}><td>{x.rackName}</td><td>{x.purpose}</td><td>{x.address}</td><td>{x.vlan ?? '—'}</td></tr>)}</tbody></table></div><Note>{a.ip.aggregate}</Note></VwCard>
    <VwCard variant="child" title="Change window">{a.rack.window ? <span>{dayFmt(a.rack.window.start)} to {dayFmt(a.rack.window.end)} · backout: {a.rack.backout}</span> : <Note>Scheduled once a rack is accepted.</Note>}</VwCard>
  </div>);
  if (a.pod) return (<VwCard variant="child" title="Feed schedule"><div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Rack</th><th>Position</th><th>Side A</th><th>Side B</th><th style={num}>Breaker</th><th style={num}>Feeds per side</th></tr></thead><tbody>{a.pod.feedSchedule.map(f => <tr key={f.label}><td>{f.label}</td><td>row {f.position.gridY + 1}, position {f.position.gridX + 1}</td><td>{f.pduA ?? 'new PDU'}</td><td>{f.pduB ?? 'new PDU'}</td><td style={num}>{f.amps} A</td><td style={num}>{f.feedsPerSide}</td></tr>)}</tbody></table></div>
    <Note>Live cut-ins: {a.pod.cutIns.map(c => `${c.pdu.name} (${c.side}) ${c.circuits} circuits`).join(', ') || 'none'}; one change request each.</Note></VwCard>);
  if (a.hall) return (<VwCard variant="child" title="Phases and rack classes"><div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Phase</th><th style={num}>Racks</th><th style={num}>kW</th><th>Go-live</th></tr></thead><tbody>{a.hall.phases.map(p => <tr key={p.phase.id}><td>{p.phase.name}</td><td style={num}>{p.racks}</td><td style={num}>{kwFmt(p.kw)}</td><td>{p.phase.goLive.slice(0, 10)}</td></tr>)}</tbody></table></div>
    <Note>{a.hall.classes.map(c => `${c.racks} ${c.name} at ${c.kw} kW (${c.cooling})`).join(' · ')}</Note></VwCard>);
  if (a.retrofit) return (<VwCard variant="child" title="Power uprate schedule"><div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Rack</th><th style={num}>Target</th><th style={num}>Feeds per side</th><th style={num}>Breaker</th></tr></thead><tbody>{a.retrofit.rows.map(x => <tr key={x.rack.id}><td>{x.rack.name}</td><td style={num}>{x.targetKw} kW</td><td style={num}>{x.feedsPerSide}</td><td style={num}>{x.feedAmps} A</td></tr>)}</tbody></table></div></VwCard>);
  return null;
}

export function WavesSection({ plan, ev }: PlanViewProps) {
  const a = analysisOf(ev); const r = a?.retrofit;
  if (!r) return <Note>This plan type has no waves; its work runs under {plan.scope === 'rack' ? 'one change request' : 'the project and its change requests'}.</Note>;
  return (<div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>#</th><th>Wave</th><th>Window (UTC)</th><th style={num}>Racks</th><th style={num}>Swing</th><th style={num}>Services</th><th>Change</th><th>Rollback</th></tr></thead>
    <tbody>{r.waves.map(w => <tr key={w.id}><td>{w.order}</td><td>{w.name}{r.wavesProposed ? ' (proposed)' : ''}</td><td>{dayFmt(w.windowStart)} to {dayFmt(w.windowEnd)}</td><td style={num}>{w.rackIds.length}</td><td style={num}>{w.swingRackIds?.length ?? 0}</td><td style={num}>{w.serviceIds.length}</td><td>{w.changeRequestId ?? '—'}</td><td style={{ whiteSpace: 'normal', fontSize: 12 }}>{w.rollback}</td></tr>)}</tbody></table></div>);
}

/** Site fit: the chain the plan was checked against, every in-site check, and the linked plan when it does not fit. */
export function SiteFitTab({ plan, ev }: PlanViewProps) {
  const a = analysisOf(ev);
  return (<div className="vw-flex vw-flex-col vw-gap-sm">
    <ShortfallBanner a={a} plan={plan} />
    <VwCard title={`Site power chain · ${a?.site?.dc.name ?? 'site not loaded'}`}><SiteChain site={a?.site} addKw={a?.addedKw ?? 0} /></VwCard>
    <VwCard title="Checks on the real site"><ChecksBlock a={a} keys={ALL_CHECKS} /></VwCard>
  </div>);
}
