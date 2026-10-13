/* Hall fit-out panels: hall mode and grid, site power chain, cooling, network and the rack classes. */
import { Input, InputNumber, Select } from 'antd';
import type * as T from '../../../../../mock/data/types';
import { classesFromMix } from '../../../lib/inSiteAnalysis';
import { Stat } from '../../kit';
import { SubTitle } from '../../wizard/ParamField';
import type { StepProps } from '../../wizard/wizardModel';
import { HallGridView } from './charts';
import { ChecksBlock, Note, ShortfallBanner, SiteChain } from './common';
import { IpTable } from './PodPanels';
import { analysisOf, grid4, kwFmt, muted, num } from './helpers';

const MODE_LABEL = { shell: 'Shell hall, full fit-out', 'partly-used': 'Partly used: free positions only', 'new-hall': 'New hall on a floor' } as const;

export function HallSpacePanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const h = a?.hall;
  if (!a || !h) return <Note>Pick the site and the hall in Requirements.</Note>;
  return (<>
    <div style={grid4}>
      <Stat label="Hall" value={h.hall?.name ?? draft.inSite?.newHall?.name ?? '—'} sub={MODE_LABEL[h.mode]} />
      <Stat label="Racks" value={h.racks} sub={`${h.positionsAvail} free positions`} tone={h.racks > h.positionsAvail ? 'bad' : 'ok'} />
      <Stat label="IT load" value={kwFmt(h.kw)} sub={`${kwFmt(Math.max(0, h.designLeftKw))} left of the hall design`} tone={h.kw > h.designLeftKw ? 'bad' : 'ok'} />
      <Stat label="White space" value={`${h.whiteSpaceM2.toLocaleString('en-US')} m²`} sub={h.floorFreeM2 !== undefined ? `${h.floorFreeM2} m² free on the floor` : h.mode === 'partly-used' ? 'for the new racks' : 'the whole hall'} />
    </div>
    <ShortfallBanner a={a} plan={draft} />
    {h.mode === 'partly-used' && h.hb && <Note>{h.hb.racksInstalled} live racks ({kwFmt(h.hb.loadKw)}) stay as they are; only the {h.positionsAvail} free positions are planned, and only incremental items are in the bill.</Note>}
    {(h.grid || h.positions.length > 0) && <div style={{ marginTop: 8 }}><HallGridView grid={h.grid} marks={h.positions} positions={h.positions} markLabel="Planned racks" title={h.hall ? `${h.hall.name} · ${h.grid?.cols ?? '?'} × ${h.grid?.rows ?? '?'} grid` : 'New hall layout'} /></div>}
    {h.phases.length > 1 && <Note>{h.phases.map(p => `${p.phase.name}: ${p.racks} racks, ${kwFmt(p.kw)}`).join(' · ')}</Note>}
    <ChecksBlock a={a} keys={['ins-positions', 'ins-hall-design', 'ins-containment']} />
  </>);
}

export function HallPowerPanel({ draft, ev }: StepProps) {
  const a = analysisOf(ev); const h = a?.hall; if (!a || !h) return <Note>Pick the site and the hall first.</Note>;
  return (<>
    <div style={grid4}>
      <Stat label="Site IT headroom" value={kwFmt(a.site?.headroomItKw ?? 0)} sub={a.site?.binding ? `binding: ${a.site.binding.label}` : undefined} tone={a.checks['ins-site-power']?.status === 'fail' ? 'bad' : 'ok'} />
      <Stat label="Existing hall PDUs" value={`${kwFmt(h.existingPduHeadroom.A)} / ${kwFmt(h.existingPduHeadroom.B)}`} sub="free on side A / side B" />
      <Stat label="New floor PDUs" value={h.mode === 'partly-used' ? h.pduPerSide * 2 : h.pduPerSide * 2} sub={h.mode === 'partly-used' ? 'only where existing PDUs are short' : 'per side × 2, fed from the site UPS'} />
      <Stat label="UPS" value="Site plant" sub="a shortfall is a linked plant plan" />
    </div>
    <ShortfallBanner a={a} plan={draft} />
    <SubTitle>Site power chain</SubTitle>
    <SiteChain site={a.site} addKw={a.addedKw} />
    <ChecksBlock a={a} keys={['ins-site-power', 'ins-pdu', 'ins-dc-plant']} />
  </>);
}

export function HallCoolingPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const h = a?.hall; if (!a || !h) return <Note>Pick the site and the hall first.</Note>;
  return (<>
    <div style={grid4}>
      <Stat label="Zone" value={h.zone?.zone.name ?? 'New'} sub={h.zone ? `${kwFmt(h.zone.headroomKw)} free with one unit lost` : 'the hall has no zone yet'} />
      <Stat label="Shared with" value={h.zoneSharedWith.length ? h.zoneSharedWith.join(', ') : 'No other hall'} sub="their load is counted" />
      <Stat label="Air / liquid heat" value={`${kwFmt(h.airKw)} / ${kwFmt(h.liquidKw)}`} sub={h.residualAirKw ? `${kwFmt(h.residualAirKw)} of liquid-class heat stays in the air` : undefined} />
      <Stat label="New units" value={`${h.crah.units} CRAH · ${h.cdus} CDU`} sub={h.crah.units ? `${h.crah.unitKw} kW CRAH, N+1` : 'the zone takes the air heat'} />
    </div>
    <ChecksBlock a={a} keys={['ins-zone-cooling', 'ins-facility-water', 'ins-setpoint']} />
  </>);
}

export function HallNetworkPanel({ ev }: StepProps) {
  const a = analysisOf(ev); const h = a?.hall; if (!a || !h) return <Note>Pick the site and the hall first.</Note>;
  return (<>
    <div style={grid4}>
      <Stat label="Leaves" value={h.leaves} sub={`${h.uplinks} uplinks at ${a.network.uplinkGbps}G`} />
      <Stat label="Spines" value={h.newSpines ? `${h.newSpines} new` : 'Existing'} sub={`${h.spine.free} free ports on ${h.spine.spines} spines`} />
      <Stat label="Access ports" value={a.network.accessPorts.toLocaleString('en-US')} />
      <Stat label="Prefixes" value={a.ip.items.length} sub={`from ${a.ip.aggregate}`} />
    </div>
    <IpTable a={a} />
    <ChecksBlock a={a} keys={['ins-spine-ports', 'ins-ip']} />
  </>);
}

/** Rack classes: count, kW and cooling per class; they must add up to the requirement. */
export function HallItPanel({ draft, patch, ev }: StepProps) {
  const a = analysisOf(ev); const h = a?.hall;
  if (!a || !h) return <Note>Pick the site and the hall first.</Note>;
  const classes = h.classes;
  const set = (next: T.PlannerRackClass[] | undefined) => patch({ inSite: { ...draft.inSite, classes: next } });
  const edit = (i: number, patchRow: Partial<T.PlannerRackClass>) => set(classes.map((c, j) => (j === i ? { ...c, ...patchRow } : c)));
  const fromMix = () => set(classesFromMix(draft.designPowerKw, Math.ceil(draft.designPowerKw / Math.max(1, Number(draft.params.densityKwPerRack ?? 12))), draft.demand));
  return (<>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Class</th><th style={num}>Racks</th><th style={num}>kW each</th><th style={num}>kW total</th><th>Cooling</th><th /></tr></thead>
      <tbody>{classes.map((c, i) => (
        <tr key={i}>
          <td><Input size="small" value={c.name} onChange={e => edit(i, { name: e.target.value })} style={{ width: 140 }} /></td>
          <td style={num}><InputNumber size="small" min={0} max={2000} value={c.racks} onChange={v => typeof v === 'number' && edit(i, { racks: v })} style={{ width: 80 }} /></td>
          <td style={num}><InputNumber size="small" min={1} max={150} step={0.5} value={c.kw} onChange={v => typeof v === 'number' && edit(i, { kw: v })} style={{ width: 80 }} /></td>
          <td style={num}>{kwFmt(c.racks * c.kw)}</td>
          <td><Select size="small" value={c.cooling} onChange={v => edit(i, { cooling: v })} options={[{ value: 'air', label: 'Air' }, { value: 'liquid', label: 'Liquid to chip' }]} style={{ width: 130 }} /></td>
          <td><button type="button" className="nst-btn nst-btn--xs nst-btn--ghost" onClick={() => set(classes.filter((_, j) => j !== i))}>Remove</button></td>
        </tr>))}</tbody>
      <tfoot><tr><td><b>Total</b></td><td style={num}><b>{h.racks}</b></td><td /><td style={{ ...num, color: Math.abs(h.classKw - draft.designPowerKw) > 1 ? 'var(--vw-color-red-600)' : undefined }}><b>{kwFmt(h.classKw)}</b> of {kwFmt(draft.designPowerKw)}</td><td colSpan={2} /></tr></tfoot>
    </table></div>
    <div className="vw-flex vw-gap-sm" style={{ marginTop: 6 }}>
      <button type="button" className="nst-btn nst-btn--sm" onClick={() => set([...classes, { name: 'New class', racks: 1, kw: Number(draft.params.densityKwPerRack ?? 12), cooling: 'air' }])}>Add a class</button>
      <button type="button" className="nst-btn nst-btn--sm nst-btn--ghost" onClick={fromMix}>Reset to the workload mix</button>
    </div>
    <div style={{ ...muted, marginTop: 6 }}>{h.classesFrom === 'mix' ? 'Classes come from the workload mix in Requirements; edit them here to fix them.' : 'Classes set by the planner.'} Above 30 kW a class needs liquid cooling. IT is priced from the catalogue: servers per rack = rack kW ÷ the model&apos;s typical draw, capped by rack units.</div>
  </>);
}
