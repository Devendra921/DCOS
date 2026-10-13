/* Pod panels: contiguous positions on the real hall grid, feed schedule from existing PDUs, cooling, leaves and addresses. */
import { useState } from 'react';
import { VwChip } from '../../../../../shared/components/ux';
import { hallGrid, type PodOption } from '../../../lib/placement';
import { Stat } from '../../kit';
import { SubTitle } from '../../wizard/ParamField';
import type { StepProps } from '../../wizard/wizardModel';
import { HallGridView } from './charts';
import { ChecksBlock, Note, ShortfallBanner, SiteChain } from './common';
import { analysisOf, grid4, kwFmt, muted, num } from './helpers';

export function PodSpacePanel({ draft, patch, ev, data, actions }: StepProps) {
  const a = analysisOf(ev); const p = a?.pod;
  const [pick, setPick] = useState<string | undefined>();
  const shown: PodOption | undefined = p ? (p.options.find(o => o.id === pick) ?? p.chosen ?? p.options[0]) : undefined;
  const site = a?.site; const shownHall = shown?.hall.id;
  const grid = shownHall && site ? hallGrid(data, site, shownHall, draft.id) : undefined;
  if (!a || !p) return <Note>Pick the site in Requirements to find room for the pod.</Note>;
  if (!a.ready) return <Note>Loading the site&apos;s halls and racks…</Note>;
  const accept = (o: PodOption) => { patch({ placement: { mode: 'empty-positions', hallId: o.hall.id, racks: [], positions: o.positions.map(x => ({ hallId: x.hallId, gridX: x.gridX, gridY: x.gridY, rackId: x.rackId, rowId: x.rowId })), acceptedAt: new Date().toISOString(), newRows: o.newRows.map(y => ({ hallId: o.hall.id, gridY: y, name: `Row ${String.fromCharCode(65 + y)}` })) } }); actions.recordFeedback('placement-optimiser', draft.id, true, o.id); };
  const release = () => patch({ placement: undefined });
  const isChosen = (o: PodOption) => !!p.chosen && o.positions.every(x => p.chosen!.positions.some(y => y.gridX === x.gridX && y.gridY === x.gridY && y.hallId === x.hallId));
  return (<>
    <div style={grid4}>
      <Stat label="Pod" value={`${p.count} racks`} sub={`${p.kwPerRack} kW each · ${kwFmt(a.addedKw)}`} />
      <Stat label="Positions needed" value={p.positionsNeeded} sub={p.inRow ? `${p.count} racks + ${p.inRow.positions} for ${p.inRow.units} in-row units` : 'one per rack'} />
      <Stat label="Free at the site" value={p.freePositions} sub={`longest contiguous run ${p.bestRun}`} tone={p.freePositions >= p.positionsNeeded ? undefined : 'bad'} />
      <Stat label="Accepted" value={p.chosen ? `${p.chosen.hall.name}` : 'Not yet'} tone={p.chosen && !p.chosenProblems.length ? 'ok' : 'warn'} sub={p.chosen ? (p.chosen.kind === 'pair' ? 'facing pair, one aisle' : 'one row') : 'pick an option below'} />
    </div>
    <ShortfallBanner a={a} plan={draft} />
    <SubTitle>Options on the hall grid</SubTitle>
    {p.options.length ? <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Hall</th><th>Layout</th><th>Rows</th><th style={num}>Hall headroom</th><th style={num}>Zone headroom</th><th style={num}>PDU A / B free</th><th>Containment</th><th style={num}>Score</th><th>Result</th><th /></tr></thead>
      <tbody>{p.options.map(o => { const on = isChosen(o); return (
        <tr key={o.id} className={on || shown?.id === o.id ? 'is-selected' : 'is-clickable'} onClick={() => setPick(o.id)} style={{ cursor: 'pointer' }}>
          <td style={{ fontWeight: 500 }}>{o.hall.name}</td><td>{o.kind === 'pair' ? 'Facing pair' : 'One row'}</td><td>{o.gridYs.map(y => y + 1).join(' and ')}{o.newRows.length ? ' (new row)' : ''}</td>
          <td style={num}>{kwFmt(o.hallHeadroomKw)}</td><td style={num}>{o.zoneHeadroomKw !== undefined ? kwFmt(o.zoneHeadroomKw) : '—'}</td><td style={num}>{kwFmt(o.pduHeadroomKw.A)} / {kwFmt(o.pduHeadroomKw.B)}</td>
          <td>{o.containment}</td><td style={num}>{o.score}</td>
          <td style={{ whiteSpace: 'normal', fontSize: 12, minWidth: 180 }}>{o.fits ? <VwChip variant="success">Fits</VwChip> : <span style={{ color: 'var(--vw-color-red-600)' }}>{o.problems.join('; ')}</span>}</td>
          <td>{on ? <button type="button" className="nst-btn nst-btn--xs nst-btn--gray" onClick={e => { e.stopPropagation(); release(); }}>Release</button> : <button type="button" className="nst-btn nst-btn--xs nst-btn--filled" disabled={!o.fits} title={o.fits ? undefined : 'Options that do not fit cannot be accepted'} onClick={e => { e.stopPropagation(); accept(o); }}>Accept</button>}</td>
        </tr>); })}</tbody>
    </table></div> : <Note>No run of {p.positionsNeeded} contiguous free positions at {a.site?.dc.code}. Reduce the pod, split it, or plan more space.</Note>}
    {shown && grid && <div style={{ marginTop: 10 }}><HallGridView grid={grid} marks={shown.positions} markLabel={isChosen(shown) ? 'Accepted pod' : 'Option shown'} title={`${shown.hall.name} · ${grid.cols} × ${grid.rows} grid`} /></div>}
    {p.cage && <Note>Cage: {p.cage.perimeterM} m of fence around the positions (with 1 m clearance), {p.cage.doors} door(s), {p.cage.readers} badge readers, {p.cage.cameras} cameras.</Note>}
    <ChecksBlock a={a} keys={['ins-positions', 'ins-containment']} />
  </>);
}

export function PodPowerPanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const p = a?.pod; if (!a || !p) return <Note>Pick the site first.</Note>;
  return (<>
    <div style={grid4}>
      <Stat label="Distribution" value={p.power} sub="from the existing UPS; no UPS, generator or transformer in this plan" />
      <Stat label="Feeds per rack" value={`${p.feedSchedule[0]?.feedsPerSide ?? 1} per side`} sub={p.feed.label} />
      <Stat label="New floor PDUs" value={p.newPdus} tone={p.newPdus ? 'warn' : 'ok'} sub={p.newPdus ? `short ${kwFmt(p.pduShortKw.A)} A / ${kwFmt(p.pduShortKw.B)} B` : 'existing PDUs carry the pod'} />
      <Stat label="Live cut-ins" value={p.cutIns.length} sub="one change request each" />
    </div>
    <ShortfallBanner a={a} plan={draft} />
    <SubTitle>Feed schedule</SubTitle>
    <div className="nst-table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Rack</th><th>Position</th><th>Side A</th><th>Side B</th><th style={num}>Breaker</th><th style={num}>Feeds per side</th><th style={num}>kW</th></tr></thead>
      <tbody>{p.feedSchedule.map(f => <tr key={f.label}><td>{f.label}</td><td>row {f.position.gridY + 1}, position {f.position.gridX + 1}</td><td>{f.pduA ?? <span style={{ color: 'var(--vw-color-red-600)' }}>new PDU</span>}</td><td>{f.pduB ?? (p.feed.dual ? <span style={{ color: 'var(--vw-color-red-600)' }}>new PDU</span> : '—')}</td><td style={num}>{f.amps} A</td><td style={num}>{f.feedsPerSide}</td><td style={num}>{f.kw}</td></tr>)}
        {!p.feedSchedule.length && <tr><td colSpan={7} style={muted}>Accept a position to schedule the feeds.</td></tr>}</tbody></table></div>
    {p.buswayM > 0 && <Note>Busway: {p.buswayM} m over the pod with {p.tapOffs} tap-off boxes.</Note>}
    <SubTitle>Site power chain</SubTitle>
    <SiteChain site={a.site} addKw={a.addedKw} />
    <ChecksBlock a={a} keys={['ins-pdu', 'ins-site-power', 'ins-dc-plant']} />
  </>);
}

export function PodCoolingPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const p = a?.pod; if (!a || !p) return <Note>Pick the site first.</Note>;
  const z = p.chosen?.zone ?? p.options[0]?.zone;
  return (<>
    <div style={grid4}>
      <Stat label="Cooling" value={p.cooling === 'in-row' ? 'In-row units' : p.cooling === 'rear-door' ? 'Rear doors' : 'Room (zone)'} sub={p.inRow ? `${p.inRow.units} × ${p.inRow.unitKw} kW, N+1` : undefined} />
      <Stat label="Zone" value={z?.zone.name ?? '—'} sub={z ? `${kwFmt(z.headroomKw)} free with one unit lost` : undefined} tone={z && z.headroomKw < a.addedKw && !p.inRow ? 'bad' : undefined} />
      <Stat label="Halls on the zone" value={z?.hallIds.length ?? 0} sub="their load is counted" />
      <Stat label="Heat added" value={kwFmt(a.addedKw)} />
    </div>
    <ChecksBlock a={a} keys={['ins-zone-cooling', 'ins-facility-water']} />
  </>);
}

export function PodNetworkPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const p = a?.pod; if (!a || !p) return <Note>Pick the site first.</Note>;
  return (<>
    <div style={grid4}>
      <Stat label="Leaves" value={p.leaves} sub="to the existing spines" />
      <Stat label="Uplinks" value={`${p.uplinks} × ${a.network.uplinkGbps}G`} sub="optics follow the uplink speed" />
      <Stat label="Spine ports free" value={p.spine.free} sub={`${p.spine.spines} spines at the site`} tone={p.spine.spines && p.spine.free < p.uplinks ? 'bad' : undefined} />
      <Stat label="Prefixes" value={a.ip.items.length} sub={`from ${a.ip.aggregate}`} />
    </div>
    <IpTable a={a} />
    <ChecksBlock a={a} keys={['ins-spine-ports', 'ins-ip']} />
  </>);
}

export function IpTable({ a }: { a: NonNullable<ReturnType<typeof analysisOf>> }) {
  return (<>
    <SubTitle>Addresses and VLANs</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Name</th><th>Purpose</th><th>Prefix</th><th>VLAN</th><th>Gateway</th><th>Notes</th></tr></thead>
      <tbody>{a.ip.items.map(i => <tr key={i.id}><td>{i.name}</td><td>{i.purpose}</td><td>{i.cidr}</td><td>{i.vlan ?? '—'}</td><td>{i.gateway ?? '—'}</td><td style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>{i.notes}</td></tr>)}
        {!a.ip.items.length && <tr><td colSpan={6} style={muted}>No prefixes yet.</td></tr>}</tbody></table></div>
    <Note>Carved from the site&apos;s container in IPAM, clear of every subnet in use and every prefix other plans hold; loopbacks only for the new switches; no carrier links or ASNs.</Note>
  </>);
}

export function PodSecurityPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const p = a?.pod; if (!a || !p) return <Note>Pick the site first.</Note>;
  return (<>
    <div style={grid4}>
      <Stat label="Cage" value={p.cage ? `${p.cage.perimeterM} m` : 'None'} sub={p.cage ? 'fence around the accepted positions, 1 m clearance' : 'no cage requested'} />
      <Stat label="Doors" value={p.cage?.doors ?? 0} />
      <Stat label="Badge readers" value={p.cage?.readers ?? 0} sub="on the site access system" />
      <Stat label="Cameras" value={p.cage?.cameras ?? 0} sub="on the site CCTV" />
    </div>
    <Note>Fire suppression and detection are the hall&apos;s; a pod adds none. The cage is sized from the positions accepted on the Space step.</Note>
  </>);
}
