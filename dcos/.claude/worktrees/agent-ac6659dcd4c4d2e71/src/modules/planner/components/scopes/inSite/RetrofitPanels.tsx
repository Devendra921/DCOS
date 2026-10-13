/* Retrofit panels: the racks converted, power uprate, liquid and residual air cooling, waves and the GPU back-end fabric. */
import { useMemo } from 'react';
import { Checkbox, Input, InputNumber, Select } from 'antd';
import { VwChip } from '../../../../../shared/components/ux';
import type * as T from '../../../../../mock/data/types';
import { clashes, impactOf } from '../../../lib/impact';
import { hallRacks } from '../../../lib/placement';
import { Stat } from '../../kit';
import { SubTitle } from '../../wizard/ParamField';
import type { StepProps } from '../../wizard/wizardModel';
import { ChecksBlock, Note, ShortfallBanner, SiteChain } from './common';
import { analysisOf, dayFmt, grid4, kwFmt, muted, num, rescalePhases } from './helpers';

export function RetrofitSpacePanel({ draft, patch, ev, data }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit;
  const hallId = String(draft.params.targetHallId ?? '');
  const racks = useMemo(() => hallRacks(data, hallId), [data, hallId]);
  const sel = useMemo(() => draft.inSite?.retrofit ?? [], [draft.inSite?.retrofit]);
  const services = useMemo(() => new Map(racks.map(rk => [rk.id, impactOf(data, { rackIds: [rk.id] }).services.length])), [data, racks]);
  if (!hallId) return <Note>Pick the hall in Requirements, then select the racks to convert.</Note>;
  const target = Number(draft.params.densityKwPerRack ?? 40) || 40;
  const apply = (next: T.PlannerRetrofitRack[]) => {
    const today = next.reduce((s, x) => s + (racks.find(rk => rk.id === x.rackId)?.currentPowerKw ?? 0), 0);
    const total = Math.round(next.reduce((s, x) => s + x.targetKw, 0) * 10) / 10;
    const phases = rescalePhases(draft, total, next.length);
    patch({ inSite: { ...draft.inSite, retrofit: next }, designPowerKw: total, phases, waves: [], params: { ...draft.params, liquidRacks: next.length, currentKw: Math.round(today * 10) / 10, addedKw: Math.round(Math.max(0, total - today) * 10) / 10 }, paramSources: { ...draft.paramSources, liquidRacks: 'user', currentKw: 'actual', addedKw: 'user' } });
  };
  const toggle = (rk: T.Rack) => apply(sel.some(x => x.rackId === rk.id) ? sel.filter(x => x.rackId !== rk.id) : [...sel, { rackId: rk.id, targetKw: target }]);
  const rows = [...new Set(racks.map(rk => rk.rowId))];
  const rowName = (id: string) => data.rows.find(rw => rw.id === id)?.name ?? id;
  const selectRow = (rowId: string) => apply([...sel.filter(x => racks.find(rk => rk.id === x.rackId)?.rowId !== rowId), ...racks.filter(rk => rk.rowId === rowId && rk.status !== 'Planned').map(rk => ({ rackId: rk.id, targetKw: target }))]);
  const rowOf = (id: string) => r?.rows.find(x => x.rack.id === id);
  return (<>
    {r && <div style={grid4}>
      <Stat label="Racks converted" value={r.rows.length} sub={`${r.ready} ready, ${r.kits} kit, ${r.newCabinets} new cabinet`} />
      <Stat label="Today → target" value={`${kwFmt(r.todayKw)} → ${kwFmt(r.targetKw)}`} sub={`adds ${kwFmt(r.deltaKw)}`} />
      <Stat label="Services on them" value={r.services} sub={`${r.customers} customers, ${r.critical} critical`} tone={r.critical ? 'warn' : undefined} />
      <Stat label="Floor reinforcement" value={r.reinforce} sub="positions above the floor rating" tone={r.reinforce ? 'warn' : 'ok'} />
    </div>}
    <ShortfallBanner a={a} plan={draft} />
    <SubTitle extra={<span className="vw-flex vw-gap-xs vw-wrap">{rows.map(id => <button key={id} type="button" className="nst-btn nst-btn--xs" onClick={() => selectRow(id)}>Select {rowName(id)}</button>)}</span>}>Racks in the hall</SubTitle>
    <div className="nst-table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th /><th>Rack</th><th>Row</th><th style={num}>Today kW</th><th style={num}>Target kW</th><th>Liquid-ready</th><th style={num}>Weight now / max</th><th style={num}>Filled</th><th>Readiness</th><th style={num}>Services</th></tr></thead>
      <tbody>{racks.map(rk => { const s = sel.find(x => x.rackId === rk.id); const row = rowOf(rk.id); return (
        <tr key={rk.id} className={s ? 'is-selected' : undefined}>
          <td><Checkbox checked={!!s} onChange={() => toggle(rk)} /></td><td style={{ fontWeight: 500 }}>{rk.name}</td><td>{rowName(rk.rowId)}</td>
          <td style={num}>{rk.currentPowerKw}</td>
          <td style={num}>{s ? <InputNumber size="small" min={1} max={150} value={s.targetKw} onChange={v => typeof v === 'number' && apply(sel.map(x => (x.rackId === rk.id ? { ...x, targetKw: v } : x)))} style={{ width: 70 }} /> : '—'}</td>
          <td>{rk.liquidCoolingReady ? <VwChip variant="success">Yes</VwChip> : 'No'}</td>
          <td style={num}>{rk.currentWeightKg} / {rk.maxWeightKg} kg</td>
          <td style={num} title={row ? `${row.floorKgM2} kg/m² of ${row.floorRating ?? '?'} on the floor` : undefined}>{row ? `${row.filledKg} kg` : '—'}</td>
          <td>{s ? <Select size="small" value={s.readiness ?? 'auto'} style={{ width: 130 }} onChange={v => apply(sel.map(x => (x.rackId === rk.id ? { ...x, readiness: v === 'auto' ? undefined : v as T.PlannerRetrofitRack['readiness'] } : x)))} options={[{ value: 'auto', label: row ? `Auto: ${row.readiness}` : 'Auto' }, { value: 'ready', label: 'Ready' }, { value: 'kit', label: 'Kit' }, { value: 'new-cabinet', label: 'New cabinet' }]} /> : '—'}</td>
          <td style={num}>{services.get(rk.id) ?? 0}</td>
        </tr>); })}</tbody>
    </table></div>
    <Note>The requirement is the added kW: target minus today on the selected racks. Filled weight = cabinet, GPU servers at the target kW (catalogue model weight) and the liquid kit; readiness is set from liquid-readiness and the rack&apos;s rating.</Note>
    <ChecksBlock a={a} keys={['ins-weight']} />
  </>);
}

export function RetrofitPowerPanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit; if (!a || !r) return <Note>Select the racks first.</Note>;
  return (<>
    <div style={grid4}>
      <Stat label="Added per side" value={kwFmt(r.deltaKw)} sub="each side carries the whole rack" />
      <Stat label="New circuits per side" value={r.uprate.circuitsPerSide} sub={`${r.uprate.freeCircuits.A} free on A, ${r.uprate.freeCircuits.B} on B`} tone={r.uprate.circuitsPerSide > Math.min(r.uprate.freeCircuits.A, r.uprate.freeCircuits.B) ? 'bad' : 'ok'} />
      <Stat label="Hall PDUs free" value={`${kwFmt(r.uprate.pdu.A)} / ${kwFmt(r.uprate.pdu.B)}`} sub="side A / side B" tone={r.deltaKw > Math.min(r.uprate.pdu.A, r.uprate.pdu.B) ? 'bad' : 'ok'} />
      <Stat label="Supply" value={a.site?.dcPlant ? '−48 V DC' : 'AC'} tone={a.site?.dcPlant ? 'bad' : 'ok'} sub={a.site?.dcPlant ? 'GPU racks need 415 V AC or HVDC' : undefined} />
    </div>
    <ShortfallBanner a={a} plan={draft} />
    <SubTitle>Uprate per rack</SubTitle>
    <div className="nst-table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Rack</th><th style={num}>Target kW</th><th style={num}>Feeds per side</th><th style={num}>Breaker</th><th style={num}>kW per feed</th><th style={num}>Today&apos;s feed rating</th><th>Supply today</th></tr></thead>
      <tbody>{r.rows.map(x => <tr key={x.rack.id}><td>{x.rack.name}</td><td style={num}>{x.targetKw}</td><td style={num}>{x.feedsPerSide}</td><td style={num}>{x.feedAmps} A</td><td style={num}>{x.feedKwEach}</td><td style={num}>{x.existingFeedKw ?? '—'}</td><td>{x.dcFeeds ? '−48 V DC' : 'AC'}</td></tr>)}</tbody></table></div>
    <SubTitle>Site power chain</SubTitle>
    <SiteChain site={a.site} addKw={a.addedKw} />
    <ChecksBlock a={a} keys={['ins-uprate', 'ins-dc-plant', 'ins-site-power']} />
  </>);
}

export function RetrofitCoolingPanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit; if (!a || !r) return <Note>Select the racks first.</Note>;
  return (<>
    <div style={grid4}>
      <Stat label="To liquid" value={kwFmt(r.liquidKw)} sub={`${r.capturePct}% of ${kwFmt(r.targetKw)}`} />
      <Stat label="Facility water" value={kwFmt(Math.max(0, r.facilityWater.headroomKw))} sub={r.facilityWater.chillers ? `${r.facilityWater.chillers} chillers, one lost` : 'no chiller recorded'} tone={r.liquidKw > r.facilityWater.headroomKw ? 'bad' : 'ok'} />
      <Stat label="CDUs" value={`${r.cdu.units} × ${kwFmt(r.cdu.unitKw)}`} sub={`${r.cdu.type}, ${r.cdu.loops.length} loop(s)${r.cdu.positions ? `, ${r.cdu.positions} positions` : ''}`} />
      <Stat label="Leak and BMS" value="Per row" sub="leak cable, drip trays, CDU alarms; no new hall suppression" />
    </div>
    <ShortfallBanner a={a} plan={draft} />
    <SubTitle>Residual air heat per zone</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Zone</th><th style={num}>Headroom</th><th style={num}>Residual added</th><th style={num}>Air-cooled racks left on the zone</th></tr></thead>
      <tbody>{r.zones.map(z => <tr key={z.zone.zone.id}><td>{z.zone.zone.name}</td><td style={num}>{kwFmt(z.zone.headroomKw)}</td><td style={{ ...num, color: z.residualKw > z.zone.headroomKw ? 'var(--vw-color-red-600)' : undefined }}>{kwFmt(z.residualKw)}</td><td style={num}>{z.airRacksLeft}</td></tr>)}</tbody></table></div>
    <SubTitle>CDU loops</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Loop</th><th style={num}>Liquid kW</th><th style={num}>Units</th><th style={num}>Positions needed</th><th style={num}>Free in the row</th></tr></thead>
      <tbody>{r.cdu.loops.map(l => <tr key={l.name}><td>{l.name}</td><td style={num}>{l.kw}</td><td style={num}>{l.units}</td><td style={num}>{l.positionsNeeded}</td><td style={num}>{l.positionsFree ?? '—'}</td></tr>)}</tbody></table></div>
    <ChecksBlock a={a} keys={['ins-zone-cooling', 'ins-facility-water', 'ins-cdu', 'ins-setpoint', 'liquid-above-density']} />
  </>);
}

export function RetrofitMigrationPanel({ draft, patch, ev, data }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit;
  const waves = useMemo(() => r?.waves ?? [], [r?.waves]);
  const info = useMemo(() => waves.map(w => { const imp = impactOf(data, { rackIds: w.kind === 'works' ? [] : w.rackIds }); const cl = w.windowStart ? clashes(data, { dataCenterId: draft.dataCenterId, rackIds: w.rackIds, deviceIds: w.deviceIds, start: w.windowStart, end: w.windowEnd, excludePlanId: draft.id }) : []; return { customers: imp.customers.length, critical: imp.critical, block: cl.filter(c => c.severity === 'block') }; }), [waves, data, draft.dataCenterId, draft.id]);
  if (!a || !r) return <Note>Select the racks first.</Note>;
  if (!r.rows.length) return <Note>Select the racks to retrofit on the Space step; the waves are proposed from their rows.</Note>;
  const editWave = (id: string, p: Partial<T.PlannerWave>) => patch({ waves: (draft.waves ?? []).map(w => (w.id === id ? { ...w, ...p } : w)) });
  const moveStart = (w: T.PlannerWave, v: string) => { if (!v) return; const start = new Date(`${v}:00Z`).getTime(); const dur = new Date(w.windowEnd).getTime() - new Date(w.windowStart).getTime(); editWave(w.id, { windowStart: new Date(start).toISOString(), windowEnd: new Date(start + dur).toISOString() }); };
  return (<>
    <div style={grid4}>
      <Stat label="Waves" value={waves.length} sub={r.wavesProposed ? 'proposed: accept to plan' : 'accepted'} tone={r.wavesProposed ? 'warn' : 'ok'} />
      <Stat label="Racks drained" value={r.drainRacks} sub={`${r.swing.length} swing positions free`} tone={r.swing.length < r.drainRacks ? 'bad' : 'ok'} />
      <Stat label="Services touched" value={r.services} sub={`${r.customers} customers, ${r.critical} critical`} />
      <Stat label="Changes" value={waves.filter(w => w.kind !== 'works').length + waves.filter(w => w.kind === 'works').length} sub="one change and window per wave" />
    </div>
    <div className="vw-flex vw-gap-sm" style={{ margin: '8px 0' }}>
      {r.wavesProposed ? <button type="button" className="nst-btn nst-btn--sm nst-btn--filled" onClick={() => patch({ waves })}>Use these waves</button> : <button type="button" className="nst-btn nst-btn--sm" onClick={() => patch({ waves: [] })}>Propose the waves again</button>}
      <span style={muted}>Each row is drained to swing positions, worked on (pipework, flush, fill, pressure test), then repopulated at the target density, each in a change night with no clash.</span>
    </div>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>#</th><th>Wave</th><th>Start (UTC)</th><th>End</th><th style={num}>Racks</th><th style={num}>Swing</th><th style={num}>Services</th><th style={num}>Customers</th><th>Clash</th><th>Rollback</th></tr></thead>
      <tbody>{waves.map((w, i) => (
        <tr key={w.id}>
          <td>{w.order}</td><td style={{ fontWeight: 500 }}>{w.name}</td>
          <td>{r.wavesProposed ? dayFmt(w.windowStart) : <Input size="small" type="datetime-local" value={w.windowStart.slice(0, 16)} onChange={e => moveStart(w, e.target.value)} style={{ width: 190 }} />}</td>
          <td>{dayFmt(w.windowEnd)}</td><td style={num}>{w.rackIds.length}</td><td style={num}>{w.swingRackIds?.length ?? 0}</td><td style={num}>{w.serviceIds.length}</td><td style={num}>{info[i]?.customers ?? 0}{info[i]?.critical ? ` (${info[i].critical} critical)` : ''}</td>
          <td>{info[i]?.block.length ? <VwChip variant="error">{info[i].block.map(c => c.id).join(', ')}</VwChip> : <VwChip variant="success">None</VwChip>}</td>
          <td style={{ minWidth: 220 }}>{r.wavesProposed ? <span style={{ fontSize: 12 }}>{w.rollback}</span> : <Input size="small" value={w.rollback} onChange={e => editWave(w.id, { rollback: e.target.value })} />}</td>
        </tr>))}</tbody>
    </table></div>
    <ChecksBlock a={a} keys={['ins-waves']} />
  </>);
}

export function RetrofitNetworkPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit; if (!a || !r) return <Note>Select the racks first.</Note>;
  return (<>
    <div style={grid4}>
      <Stat label="GPU servers" value={r.gpuServers} sub="at the target kW per rack" />
      <Stat label="Back-end fabric" value={r.backend ? `${r.backend.leaves} leaf · ${r.backend.spines} spine` : 'Not needed'} sub={r.backend ? `${r.backend.ports} × 400G server ports` : 'GPU share below 40%'} />
      <Stat label="Optics" value={r.backend?.optics ?? 0} sub="400G, both ends" />
      <Stat label="Front end" value="Existing leaves" sub="ports checked when the racks are repopulated" />
    </div>
    <Note>The front-end network reuses the hall&apos;s leaves; the GPU back-end (RoCE or InfiniBand, rail-optimised, 8 × 400G per server) is sized from the GPU server count when GPUs are 40% or more of the mix.</Note>
  </>);
}

export function RetrofitFirePanel({ ev }: StepProps) {
  const a = analysisOf(ev); const r = a?.retrofit; if (!a || !r) return <Note>Select the racks first.</Note>;
  const rows = new Set(r.rows.map(x => x.rack.rowId)).size;
  return (<>
    <div style={grid4}>
      <Stat label="Leak detection" value={`${rows} row${rows === 1 ? '' : 's'}`} sub="sensing cable along each converted row" />
      <Stat label="Drip trays" value={r.rows.length} sub="under each rack manifold" />
      <Stat label="BMS points" value={r.cdu.units} sub="CDU alarms, flow, pressure, leak" />
      <Stat label="Suppression" value="Unchanged" sub="no new hall system" />
    </div>
    <Note>A liquid retrofit keeps the hall&apos;s suppression and smoke detection. Ask the fire engineer to review the suppression zone for the new heat density; any change is a separate works item.</Note>
  </>);
}
