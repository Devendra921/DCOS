/* Rack placement panels: candidates checked on the real rack, power, ports, addresses, equipment and the change window. */
import { useMemo, useState } from 'react';
import { InputNumber, Select } from 'antd';
import { Chip } from '../../../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../../../ops/ui/Analytics';
import type * as T from '../../../../../mock/data/types';
import { equipmentTotals, type RackCandidate } from '../../../lib/placement';
import { SourceChip } from '../../kit';
import { ToneValue } from '../../detail/shared';
import { SubTitle } from '../../wizard/ParamField';
import type { StepProps } from '../../wizard/wizardModel';
import { RackElevation } from './charts';
import { ChecksBlock, Note, ShortfallBanner, SiteChain } from './common';
import { analysisOf, dayFmt, kwFmt, muted } from './helpers';

export function RackSpacePanel({ draft, patch, ev, actions }: StepProps) {
  const a = analysisOf(ev); const r = a?.rack;
  const [all, setAll] = useState(false);
  if (!a || !r) return <Note>Pick the site in Requirements to rank its racks.</Note>;
  if (!a.ready) return <Note>Loading the site&apos;s racks, feeds and devices…</Note>;
  const accepted = new Set(r.accepted.map(x => x.cand.rack.id));
  const stale = draft.placement && draft.placement.mode !== r.mode && (draft.placement.racks?.length ?? 0) > 0;
  const accept = (c: RackCandidate) => {
    const keep = (draft.placement?.mode === r.mode ? draft.placement.racks : []).filter(x => x.rackId !== c.rack.id);
    const racks = [...keep, { rackId: c.rack.id, startU: c.block?.start, endU: c.block ? c.block.start + r.perRack.u - 1 : undefined, kw: r.perRack.kw }].slice(-r.count);
    const params = { ...draft.params }; delete params.placementRackIds;
    patch({ placement: { mode: r.mode, racks, acceptedAt: new Date().toISOString() }, params });
    actions.recordFeedback('placement-optimiser', draft.id, true, c.rack.id);
  };
  const release = (id: string) => { patch({ placement: { mode: r.mode, racks: (draft.placement?.racks ?? []).filter(x => x.rackId !== id) } }); actions.recordFeedback('placement-optimiser', draft.id, false, id); };
  const list = all ? r.candidates : r.candidates.slice(0, 10);
  const passing = r.candidates.filter(c => !c.blocked.length).length;
  return (<>
    <StatGrid cols={4}>
      <StatTile label="Mode" value={r.mode === 'new-cabinet' ? 'New cabinet' : 'Existing racks'} sub={r.mode === 'new-cabinet' ? 'empty cabinets in position' : 'devices into live racks'} />
      <StatTile label="Per rack" value={`${r.perRack.u}U · ${kwFmt(r.perRack.kw)}`} sub={r.equipment ? `${r.perRack.drawKw} kW typical · ${r.perRack.kg} kg` : `declared: ${r.perRack.declared.join(', ')}`} />
      <StatTile label="Candidates" value={<ToneValue tone={passing ? 'ok' : 'bad'}>{`${passing} of ${r.candidates.length}`}</ToneValue>} sub="pass every check" />
      <StatTile label="Accepted" value={<ToneValue tone={r.missing ? 'warn' : 'ok'}>{`${r.accepted.length} of ${r.count}`}</ToneValue>} sub={r.missing ? 'accept below' : 'placement complete'} />
    </StatGrid>
    <ShortfallBanner a={a} plan={draft} />
    {stale && <Note>The accepted racks were for the other mode; accept again for “{r.mode === 'new-cabinet' ? 'New cabinet in an empty position' : 'Into existing racks'}”.</Note>}
    <SubTitle extra={<SourceChip source="actual" note="Each rack checked on its U map, feeds, PDUs, weight and cooling zone from DCIM" />}>Candidate racks at {a.site?.dc.code}</SubTitle>
    <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
      <thead><tr><th>Rack</th><th>Hall · row</th><th>U block</th><th className="is-right">Free kW</th><th className="is-right">After</th><th>PDUs</th><th>Weight</th><th>Zone</th><th>Result</th><th /></tr></thead>
      <tbody>{list.map(c => { const on = accepted.has(c.rack.id); const blocked = c.blocked.length > 0; return (
        <tr key={c.rack.id} className={on ? 'is-selected' : undefined} style={blocked ? { opacity: 0.6 } : undefined}>
          <td><span className="strong">{c.rack.name}</span></td><td>{c.hall?.name} · {c.rb.row?.name ?? '—'}</td>
          <td>{c.block ? `U${c.block.start}–U${c.block.start + r.perRack.u - 1}` : `max ${c.rb.largestFreeBlock}U`}</td>
          <td className="is-right num">{c.freeKw}</td><td className="is-right num">{c.afterPct}%</td>
          <td title={c.checks.pdu.detail}>{c.checks.pdu.na ? '—' : c.checks.pdu.ok ? 'ok' : 'short'}</td>
          <td title={c.checks.weight.detail}>{c.weightAfterKg} / {c.rb.maxWeightKg} kg</td>
          <td title={c.checks.cooling.detail}>{c.zone ? `${c.zone.headroomKw} kW free` : '—'}</td>
          <td className="is-wrap" style={{ minWidth: 200, fontSize: 12 }}>{blocked ? <span style={{ color: 'var(--vw-color-red-600)' }}>Blocked: {c.blocked.join('; ')}</span> : c.warnings.length ? <span>Warning: {c.warnings.join('; ')}</span> : <Chip tone="success" dot>All checks pass</Chip>}</td>
          <td>{on ? <button type="button" className="nst-btn nst-btn--xs nst-btn--gray" onClick={() => release(c.rack.id)}>Release</button> : <button type="button" className="nst-btn nst-btn--xs nst-btn--filled" disabled={blocked} title={blocked ? 'Blocked candidates cannot be accepted' : undefined} onClick={() => accept(c)}>Accept</button>}</td>
        </tr>); })}</tbody>
    </table></div></div>
    {r.candidates.length > 10 && <a style={{ fontSize: 12 }} onClick={() => setAll(x => !x)}>{all ? 'Show the top 10' : `Show all ${r.candidates.length} candidates`}</a>}
    {r.accepted.length > 0 && (<>
      <SubTitle>Rack elevation</SubTitle>
      <div className="row wrap" style={{ gap: 24, alignItems: 'flex-start' }}>{r.accepted.map(x => <RackElevation key={x.cand.rack.id} rb={x.cand.rb} block={x.startU && x.endU ? { start: x.startU, end: x.endU } : undefined} label={draft.plnId || 'This plan'} />)}</div>
    </>)}
    <ChecksBlock a={a} keys={['ins-u-block', 'ins-rack-power', 'ins-weight', 'ins-zone-cooling']} />
  </>);
}

export function RackPowerPanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.rack; if (!a || !r) return <Note>Pick the site first.</Note>;
  return (<>
    <StatGrid cols={4}>
      <StatTile label="Feeds per rack" value={r.feed.label} sub={`${r.feed.kw} kW per feed at 80% derating`} />
      <StatTile label="Allocated per rack" value={kwFmt(r.perRack.kw)} sub={r.equipment ? 'maximum draw of the models' : 'declared density'} />
      <StatTile label="Power supplies" value={r.perRack.psus} sub="outlets needed per rack" />
      <StatTile label="Site IT headroom" value={<ToneValue tone={a.checks['ins-site-power']?.status === 'fail' ? 'bad' : 'ok'}>{kwFmt(a.site?.headroomItKw ?? 0)}</ToneValue>} sub={a.site?.binding?.label} />
    </StatGrid>
    <ShortfallBanner a={a} plan={draft} />
    {r.accepted.map(x => (
      <div key={x.cand.rack.id}>
        <SubTitle>Outlet schedule · {x.cand.rack.name}</SubTitle>
        {x.outlets.length ? <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table"><thead><tr><th>Side</th><th>Outlet</th><th>Fed from</th></tr></thead>
          <tbody>{x.outlets.map(o => <tr key={o.id}><td>{o.side}</td><td>{o.name}</td><td>{x.cand.pduSides.find(s => s.side === o.side)?.pdu.name ?? '—'}</td></tr>)}</tbody></table></div></div>
          : <Note>{r.mode === 'new-cabinet' ? `New power strips on new ${r.feed.amps} A circuits: ${x.cand.checks.pdu.detail}` : x.cand.checks.pdu.detail}</Note>}
      </div>
    ))}
    <SubTitle>Site power chain</SubTitle>
    <SiteChain site={a.site} addKw={a.addedKw} />
    <ChecksBlock a={a} keys={['ins-rack-power', 'ins-pdu', 'ins-site-power', 'ins-dc-plant']} />
  </>);
}

export function RackCoolingPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.rack; if (!a || !r) return <Note>Pick the site first.</Note>;
  return (<>
    <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table"><thead><tr><th>Rack</th><th>Zone</th><th className="is-right">Usable</th><th className="is-right">Load</th><th className="is-right">Headroom</th><th>Halls on the zone</th></tr></thead>
      <tbody>{r.accepted.map(x => <tr key={x.cand.rack.id}><td>{x.cand.rack.name}</td><td>{x.cand.zone?.zone.name ?? '—'}</td><td className="is-right num">{kwFmt(x.cand.zone?.usableKw ?? 0)}</td><td className="is-right num">{kwFmt(x.cand.zone?.loadKw ?? 0)}</td><td className="is-right num">{kwFmt(x.cand.zone?.headroomKw ?? 0)}</td><td>{x.cand.zone?.hallIds.length ?? 0}</td></tr>)}
        {!r.accepted.length && <tr><td colSpan={6} style={muted}>Accept a rack on the Space step to check its zone.</td></tr>}</tbody></table></div></div>
    <Note>Usable cooling is the zone&apos;s units with the largest one lost; the zone load counts every hall it serves.</Note>
    <ChecksBlock a={a} keys={['ins-zone-cooling']} />
  </>);
}

export function RackNetworkPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.rack; if (!a || !r) return <Note>Pick the site first.</Note>;
  return (<>
    <SubTitle>Port and patch schedule</SubTitle>
    <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table"><thead><tr><th>Rack</th><th>Side</th><th>Leaf</th><th>Interface</th><th className="is-right">Speed</th></tr></thead>
      <tbody>{r.accepted.flatMap(x => x.ports.map(p => <tr key={p.ifaceId}><td>{x.cand.rack.name}</td><td>{p.side}</td><td>{p.deviceName}</td><td>{p.ifaceName}</td><td className="is-right num">{(p.speedMbps ?? 0) / 1000}G</td></tr>))}
        {!r.accepted.length && <tr><td colSpan={5} style={muted}>Accept a rack on the Space step to reserve ports.</td></tr>}</tbody></table></div></div>
    <SubTitle>Addresses</SubTitle>
    <div className="dt"><div className="dt-scroll" style={{ maxHeight: 240 }}><table className="nst-table dt-table"><thead><tr><th>Rack</th><th>Purpose</th><th>Address</th><th>VLAN</th></tr></thead>
      <tbody>{a.ip.addresses.map(x => <tr key={`${x.purpose}${x.address}`}><td>{x.rackName}</td><td>{x.purpose}</td><td>{x.address}</td><td>{x.vlan ?? '—'}</td></tr>)}</tbody></table></div></div>
    <Note>Addresses come from the hall&apos;s existing subnets and VLANs in IPAM; no new aggregate, loopbacks, carrier links or ASNs for a rack.</Note>
    <ChecksBlock a={a} keys={['ins-ports', 'ins-ip']} />
  </>);
}

/** Equipment list editor: models from the DCIM catalogue, per rack. */
export function RackItPanel({ draft, patch, ev, data }: StepProps) {
  const a = analysisOf(ev);
  const lines = useMemo(() => draft.inSite?.equipment ?? [], [draft.inSite?.equipment]);
  const models = useMemo(() => data.assetModels.filter(m => m.heightU > 0 && !['PDU', 'UPS'].includes(m.category)).sort((x, y) => x.category.localeCompare(y.category) || x.model.localeCompare(y.model)), [data.assetModels]);
  const tot = useMemo(() => equipmentTotals(data, lines), [data, lines]);
  const set = (next: T.PlannerEquipmentLine[]) => {
    const t = equipmentTotals(data, next); const count = Number(draft.params.rackCount ?? 1) || 1;
    const params = { ...draft.params }; const sources = { ...draft.paramSources };
    if (t) { params.densityKwPerRack = t.maxKw; params.rackUnitsNeeded = t.u; sources.densityKwPerRack = 'user'; sources.rackUnitsNeeded = 'user'; }
    patch({ inSite: { ...draft.inSite, equipment: next }, params, paramSources: sources, ...(t ? { designPowerKw: Math.round(t.maxKw * count * 10) / 10 } : {}) });
  };
  return (<>
    <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
      <thead><tr><th>Model</th><th className="is-right">Qty per rack</th><th className="is-right">U</th><th className="is-right">Typical W</th><th className="is-right">Max W</th><th className="is-right">kg</th><th className="is-right">Ports</th><th className="is-right">Supplies</th><th /></tr></thead>
      <tbody>
        {lines.map((l, i) => { const row = tot?.rows.find(x => x.line === l) ?? tot?.rows[i]; return (
          <tr key={i}>
            <td><Select size="small" showSearch optionFilterProp="label" style={{ minWidth: 260 }} value={l.assetModelId} onChange={v => set(lines.map((x, j) => (j === i ? { ...x, assetModelId: v } : x)))} options={models.map(m => ({ value: m.id, label: `${m.category} · ${m.manufacturer} ${m.model} · ${m.heightU}U` }))} /></td>
            <td className="is-right num"><InputNumber size="small" min={1} max={42} value={l.qty} onChange={v => typeof v === 'number' && set(lines.map((x, j) => (j === i ? { ...x, qty: v } : x)))} style={{ width: 70 }} /></td>
            <td className="is-right num">{row?.u ?? '—'}</td><td className="is-right num">{row?.typicalW.toLocaleString('en-US') ?? '—'}</td><td className="is-right num">{row?.maxW.toLocaleString('en-US') ?? '—'}</td><td className="is-right num">{row?.kg ?? '—'}</td>
            <td className="is-right num" title={row?.portsFrom === 'dcim' ? 'Counted on a device of this model in DCIM' : 'Typical for the model class'}>{row?.ports ?? '—'}</td><td className="is-right num">{row?.psus ?? '—'}</td>
            <td><button type="button" className="nst-btn nst-btn--xs nst-btn--ghost" onClick={() => set(lines.filter((_, j) => j !== i))}>Remove</button></td>
          </tr>); })}
        {!lines.length && <tr><td colSpan={9} style={muted}>No equipment listed: the placement uses the declared rack units and density.</td></tr>}
      </tbody>
    </table></div></div>
    <button type="button" className="nst-btn nst-btn--sm" style={{ marginTop: 6 }} disabled={!models.length} onClick={() => set([...lines, { assetModelId: models.find(m => m.category === 'Server')?.id ?? models[0].id, qty: 1 }])}>Add a model</button>
    {tot && <div style={{ marginTop: 8 }}><StatGrid cols={4}>
      <StatTile label="Rack units" value={`${tot.u}U`} sub="contiguous block needed" />
      <StatTile label="Power" value={`${tot.typicalKw} / ${tot.maxKw} kW`} sub="typical / maximum (held at maximum)" />
      <StatTile label="Weight" value={`${tot.kg} kg`} sub="added to the rack" />
      <StatTile label="Ports and supplies" value={`${tot.ports} / ${tot.psus}`} sub={`${tot.hosts} hosts need addresses`} />
    </StatGrid></div>}
    {a?.rack && <Note>IT is {draft.params.operatorOwnedIt === false ? 'tenant-owned and not in the bill' : 'priced from the catalogue in the bill'}.</Note>}
  </>);
}

export function RackDeliveryPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.rack; if (!a || !r) return <Note>Pick the site first.</Note>;
  const w = r.window;
  return (<>
    <SubTitle>Change request</SubTitle>
    <div>
      {w ? <StatGrid cols={4}>
        <StatTile label="Window" value={<ToneValue tone={w.clashes.some(c => c.severity === 'block') ? 'bad' : w.beforeGoLive ? 'ok' : 'warn'}>{dayFmt(w.start)}</ToneValue>} sub={`to ${dayFmt(w.end)}`} />
        <StatTile label="Clashes" value={w.clashes.filter(c => c.severity === 'block').length} sub={`${w.clashes.length} open change(s) on the same equipment`} />
        <StatTile label="Racks" value={r.accepted.map(x => x.cand.rack.name).join(', ')} />
        <StatTile label="Approval" value="Capacity planner" sub="then the change process (P05)" />
      </StatGrid> : <Note>Accept a rack to schedule the change in the next free change night.</Note>}
      <div style={{ ...muted, marginTop: 8 }}><b>Backout:</b> {r.backout}</div>
      {w?.clashes.length ? <div style={{ ...muted, marginTop: 4 }}>{w.clashes.map(c => `${c.id} ${c.title} (${c.severity === 'block' ? 'blocks' : 'same equipment, other time'})`).join(' · ')}</div> : null}
    </div>
    <ChecksBlock a={a} keys={['ins-window']} />
  </>);
}
