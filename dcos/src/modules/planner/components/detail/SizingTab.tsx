/* Sizing tab: facility load and the power chain at redundancy, rack classes, cooling and heat rejection, building, staffing — every figure with its basis. */
import { useMemo } from 'react';
import { AlertTriangle, Cable, Factory, Fan, LayoutGrid, Network, Server, SlidersHorizontal, Users, Zap, CalendarRange } from 'lucide-react';
import { Chip, Panel } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import { HallLayoutPreview, PlantOneLine } from '../charts';
import { fmtKw, fmtUsd, type PlantItem, type PowerStage } from '../../lib/engine';
import { SourceChip } from '../kit';
import { KvList, Muted, SourcedValue, monthYear, n0, n1, paramDef, type PlanView } from './shared';

const KIND_LABEL: Record<PlantItem['kind'], string> = { feed: 'Grid supply path', substation: 'HV substation', transformer: 'Transformer', ups: 'UPS / DC plant', generator: 'Generator', pdu: 'Distribution', cooling: 'Air cooling', cdu: 'CDU', chiller: 'Chiller', 'heat-rejection': 'Heat rejection' };

function ParamTable({ v, keys, title }: { v: PlanView; keys: string[]; title: string }) {
  const rows = keys.map(k => ({ key: k, def: paramDef(v.ev, k), s: v.ev.params[k] })).filter(r => r.s || r.def);
  if (!rows.length) return null;
  return (
    <Panel title={title} icon={SlidersHorizontal} count={rows.length}>
      <KvList items={rows.map(r => ({ label: r.def?.label ?? r.key, value: <SourcedValue s={r.s} unit={r.def?.unit} /> }))} />
    </Panel>
  );
}

export function SizingTab({ v }: { v: PlanView }) {
  const { ev, actuals } = v;
  const s = ev.sizing;
  const density = Number(ev.params['densityKwPerRack']?.value ?? 0);
  const liquid = s.cooling.liquidKw > 0 || s.cooling.liquidRequired;
  const redundancy = String(ev.params['redundancy']?.value ?? '2N');
  const hr = s.cooling.heatRejection;
  const plantCols: Col<PlantItem & { id: string }>[] = useMemo(() => [
    { key: 'name', header: 'Item', wrap: true, render: r => <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span>{r.note && <small>{r.note}</small>}</span> },
    { key: 'kind', header: 'Kind', render: r => KIND_LABEL[r.kind] },
    { key: 'cap', header: 'Unit', align: 'right', render: r => <span className="num">{r.unitKva ? `${n0(r.unitKva)} kVA` : fmtKw(r.capacityKw)}</span> },
    { key: 'count', header: 'Count', align: 'right', render: r => <span className="num">{r.count}</span> },
    { key: 'pp', header: 'Per path', align: 'right', render: r => <span className="num">{r.perPath ?? '—'}</span> },
    { key: 'total', header: 'Installed', align: 'right', render: r => <span className="num">{fmtKw(r.capacityKw * r.count)}</span> },
    { key: 'red', header: 'Redundancy', render: r => <Chip tone="neutral">{r.redundancy}</Chip> },
  ], []);
  const stageCols: Col<PowerStage & { id: string }>[] = useMemo(() => [
    { key: 'label', header: 'Stage', render: r => <span className="vw-card-activity-label">{r.label}</span> },
    { key: 'red', header: 'Redundancy', render: r => r.redundancy },
    { key: 'units', header: 'Units', align: 'right', render: r => <span className="num">{r.count} × {r.unit}</span> },
    { key: 'use', header: 'Usable at redundancy', align: 'right', render: r => <span className="num">{fmtKw(r.usableKw)}</span> },
    { key: 'need', header: 'Must carry', align: 'right', render: r => <span className="num">{fmtKw(r.needKw)}</span> },
    { key: 'ok', header: 'Check', render: r => <Chip tone={r.ok ? 'success' : 'error'} dot>{r.ok ? 'Carries it' : 'Short'}</Chip> },
    { key: 'basis', header: 'Basis', wrap: true, render: r => <span><Muted size="xs">{r.basis}</Muted> <SourceChip source={r.source} /></span> },
  ], []);
  const plantRows = useMemo(() => s.plant.map(r => ({ ...r, id: `${r.kind}-${r.name}` })), [s.plant]);
  const stageRows = useMemo(() => (s.power ?? []).map(r => ({ ...r, id: r.key })), [s.power]);

  return (
    <div className="col" style={{ gap: 16 }}>
      {actuals.sampleSites > 0 && (
        <div className="vw-card-section row" style={{ gap: 16, flexWrap: 'wrap', padding: '12px 16px' }}>
          <Chip tone="success" dot>Estate actuals</Chip>
          <Muted>{actuals.sampleSites} live site(s) of this type</Muted>
          {actuals.kwPerRack !== undefined && <span style={{ fontSize: 'var(--vw-font-label-sm)' }}>Actual density <strong>{actuals.kwPerRack} kW/rack</strong> <Muted size="xs">vs {density} planned</Muted></span>}
          {actuals.pue !== undefined && <span style={{ fontSize: 'var(--vw-font-label-sm)' }}>Achieved PUE <strong>{actuals.pue}</strong> <Muted size="xs">vs {s.pue.value} planned</Muted></span>}
          {actuals.capexPerKw !== undefined && <span style={{ fontSize: 'var(--vw-font-label-sm)' }}>Delivered CapEx <strong>{fmtUsd(actuals.capexPerKw)}/kW</strong></span>}
        </div>
      )}
      {(s.warnings ?? []).length > 0 && (
        <div className="note note--warn"><AlertTriangle size={16} /><div><b>Design notes</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{s.warnings!.map(w => <li key={w}>{w}</li>)}</ul></div></div>
      )}

      {s.facility && (
        <StatGrid cols={5}>
          <StatTile label="IT load" value={fmtKw(s.itKw)} sub={`${n0(s.racks)} racks in ${s.halls} hall(s)`} />
          <StatTile label="Design PUE" value={s.pue.value} sub={<span>peak {s.facility.peakPue} (+{s.facility.peakFactor}) <SourceChip source={s.pue.source} note={s.pue.note} /></span>} />
          <StatTile label="Facility load" value={fmtKw(s.facility.facilityKw)} sub="IT × peak PUE: what feeds and generators carry" />
          <StatTile label="Apparent power" value={`${s.facility.mva} MVA`} sub={`${n0(s.facility.kva)} kVA at ${s.facility.powerFactor} power factor`} />
          <StatTile label="Liquid / air heat" value={`${fmtKw(s.cooling.liquidKw)} / ${fmtKw(s.cooling.airKw)}`} sub="taken by CDUs / by air units" />
        </StatGrid>
      )}

      {(s.power ?? []).length > 0 && (
        <Panel flush icon={Zap} title={`Power chain at ${redundancy}`} sub="2N: each side carries everything · N+1: all but the largest unit" count={stageRows.length}>
          <DataTable rows={stageRows} cols={stageCols} pageSize={200} />
        </Panel>
      )}

      <div className="grid g-2">
        <Panel icon={LayoutGrid} title="Hall layout" sub={`${s.halls} hall(s) · ${s.buildings} building(s) · ${n0(s.whiteSpaceM2)} m² white space`}>
          <HallLayoutPreview sizing={s} densityKwPerRack={density} liquid={liquid} height={300} />
          <div style={{ marginTop: 16 }}>
            <KvList columns={2} items={[
              { label: 'Hall design load', value: <SourcedValue s={ev.params['hallDesignKw']} unit="kW" /> },
              { label: 'White space per hall', value: `${n0(s.building.hallWhiteSpaceM2)} m² (${s.building.racksPerHall} racks)` },
              { label: 'Halls per floor', value: <SourcedValue s={ev.params['hallsPerFloor']} /> },
              { label: 'Floors per building', value: <SourcedValue s={ev.params['floorsPerBuilding']} /> },
              { label: 'White space per rack', value: <SourcedValue s={ev.params['whiteSpaceM2PerRack']} unit="m²" /> },
              { label: 'Plant rooms', value: s.building.plantM2 ? `${n0(s.building.plantM2)} m²` : '—' },
              { label: 'Gross floor area', value: `${n0(s.grossAreaM2)} m²` },
              { label: 'Plant yard (outside)', value: s.building.yardM2 ? `${n0(s.building.yardM2)} m²` : '—' },
            ]} />
          </div>
        </Panel>
        <Panel icon={Cable} title="Plant one-line" actions={<Chip tone="neutral">{redundancy} power · {s.cooling.redundancy} cooling</Chip>}>
          <PlantOneLine sizing={s} redundancy={redundancy} height={300} />
        </Panel>
      </div>

      <Panel flush icon={Server} title="Rack classes" sub="racks and kW add up to the design load" count={s.rackClasses.length}>
        <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
          <thead><tr><th>Class</th><th className="is-right num">Racks</th><th className="is-right num">kW per rack</th><th className="is-right num">Load</th><th>Cooling</th><th>IT per rack</th></tr></thead>
          <tbody>
            {s.rackClasses.map(c => { const it = ev.estimate.it?.lines.find(l => l.className === c.name); return (
              <tr key={c.name}><td style={{ fontWeight: 500 }}>{c.name}</td><td className="is-right num">{n0(c.racks)}</td><td className="is-right num">{c.kw}</td><td className="is-right num">{fmtKw(c.kw * c.racks)}</td><td>{c.liquid ? `liquid, ${c.capturePct}% to water` : c.rearDoor ? 'rear door' : 'air'}</td><td>{it ? `${it.perRack} × ${it.model}` : '—'}</td></tr>); })}
            {s.rackClasses.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--vw-color-slate-500)' }}>No rack classes in this plan type.</td></tr>}
          </tbody>
          <tfoot><tr><td style={{ fontWeight: 600 }}>Total</td><td className="is-right num" style={{ fontWeight: 600 }}>{n0(s.rackClasses.reduce((a, c) => a + c.racks, 0))}</td><td /><td className="is-right num" style={{ fontWeight: 600 }}>{fmtKw(s.rackClasses.reduce((a, c) => a + c.racks * c.kw, 0))}</td><td colSpan={2} /></tr></tfoot>
        </table></div></div>
      </Panel>

      <Panel flush icon={Factory} title="Plant" count={s.plant.length}>
        <DataTable rows={plantRows} cols={plantCols} pageSize={200} />
      </Panel>

      <div className="grid g-3">
        <Panel icon={Fan} title="Cooling and heat rejection" actions={<Chip tone={liquid ? 'cyan' : 'neutral'}>{s.cooling.type}</Chip>}>
          <KvList items={[
            { label: 'Cooling type', value: <SourcedValue s={ev.params['coolingType']} /> },
            ...(s.cooling.cdu ? [{ label: 'CDUs', value: `${s.cooling.cdu.units} × ${fmtKw(s.cooling.cdu.unitKw)} (${s.cooling.cdu.perHall} per hall)` }] : []),
            { label: s.cooling.air.label, value: s.cooling.air.units ? `${s.cooling.air.units} × ${fmtKw(s.cooling.air.unitKw)}` : '—' },
            { label: 'Redundancy', value: <SourcedValue s={ev.params['coolingRedundancy']} /> },
            { label: 'Inlet setpoint', value: <SourcedValue s={ev.params['inletSetpointC']} unit="°C" /> },
            { label: 'Design day', value: `${hr.designDryBulbC} °C dry bulb, ${hr.designWetBulbC} °C wet bulb` },
            ...hr.streams.map(st => ({ label: st.label, value: `${fmtKw(st.heatKw)} at ${st.loopC} °C → ${st.method}${st.trimPct ? `, ${st.trimPct}% mechanical on the design day` : ''}` })),
            ...(hr.coolers ? [{ label: hr.coolers.kind === 'adiabatic cooler' ? 'Adiabatic coolers' : 'Dry coolers', value: `${hr.coolers.units} × ${fmtKw(hr.coolers.unitKw)}` }] : []),
            ...(hr.chillers ? [{ label: 'Chillers', value: `${hr.chillers.units} × ${fmtKw(hr.chillers.unitKw)} for ${fmtKw(hr.chillers.trimKw)}` }] : []),
            { label: 'PUE', value: <SourcedValue s={s.pue} /> },
          ]} />
          <div style={{ marginTop: 10 }}><Muted size="xs">{hr.source}</Muted></div>
        </Panel>
        <Panel icon={Network} title="Network">
          <KvList items={[
            { label: 'Leaves / spines / cores', value: `${s.network.leaves} / ${s.network.spines} / ${s.network.cores}` },
            { label: 'Uplinks', value: `${n0(s.network.uplinks)} × ${s.network.uplinkGbps} G` },
            { label: 'Access ports', value: n0(s.network.accessPorts) },
            { label: 'Racks per leaf pair', value: <SourcedValue s={ev.params['racksPerLeafPair']} /> },
            { label: 'Oversubscription', value: <SourcedValue s={ev.params['oversubscription']} unit=":1" /> },
            { label: 'Carriers', value: <span className="vw-inline-flex vw-items-center vw-gap-xs">{s.network.carriers} {ev.params['carrierCount'] && <SourceChip source={ev.params['carrierCount'].source} />}</span> },
            { label: 'WAN and interconnect', value: <span>{n0(s.network.dciGbps)} Gbps {s.network.dciSource && <Muted size="xs">({s.network.dciSource})</Muted>}</span> },
          ]} />
        </Panel>
        <Panel icon={Users} title="Staffing and spares">
          <KvList items={[
            { label: 'Operations staff', value: <span className="vw-inline-flex vw-items-center vw-gap-xs">{n1(s.staffing.fte)} FTE <SourceChip source={s.staffing.source} /></span> },
            { label: 'Per MW', value: `${s.staffing.perMw} FTE/MW` },
            { label: 'How', value: <span style={{ whiteSpace: 'normal' }}>{s.staffing.basis ?? '—'}</span> },
            { label: 'Spares value', value: fmtUsd(s.spares.valueUsd) },
            { label: 'Spares held', value: <SourcedValue s={ev.params['sparesPct']} unit="%" /> },
            { label: 'Operator owns the IT', value: <SourcedValue s={ev.params['operatorOwnedIt']} /> },
          ]} />
          {(s.staffing.plan ?? []).length > 0 && (
            <div className="dt" style={{ marginTop: 12 }}><div className="dt-scroll"><table className="nst-table dt-table">
              <thead><tr><th>Phase</th><th className="is-right num">Seats</th><th className="is-right num">FTE</th><th>Key hires by</th><th>Technicians by</th></tr></thead>
              <tbody>{s.staffing.plan!.map(x => <tr key={x.phaseId}><td>{x.name}</td><td className="is-right num">{x.seats}</td><td className="is-right num">{x.fte}</td><td>{monthYear(x.keyHireBy)}</td><td>{monthYear(x.techHireBy)}</td></tr>)}</tbody>
            </table></div></div>
          )}
        </Panel>
      </div>

      {(s.phaseDesign ?? []).length > 0 && (
        <Panel flush icon={CalendarRange} title="Phases as design units" sub="racks and halls from the same model as the totals" count={s.phaseDesign!.length}>
          <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
            <thead><tr><th>Phase</th><th>Go-live</th><th className="is-right num">IT</th><th className="is-right num">Density</th><th>Cooling</th><th className="is-right num">Racks</th><th className="is-right num">Halls</th><th>Phase record</th></tr></thead>
            <tbody>{s.phaseDesign!.map(ph => <tr key={ph.phaseId}><td>{ph.name}</td><td>{monthYear(ph.goLive)}</td><td className="is-right num">{fmtKw(ph.itKw)}</td><td className="is-right num">{ph.density} kW</td><td>{ph.coolingType}</td><td className="is-right num">{n0(ph.racks)}</td><td className="is-right num">{ph.halls}</td><td>{ph.mismatch ? <Chip tone="warning">says {ph.storedRacks} racks, {ph.storedHalls} halls</Chip> : <Chip tone="success">matches</Chip>}</td></tr>)}</tbody>
          </table></div></div>
        </Panel>
      )}

      <div className="grid g-3">
        <ParamTable v={v} title="Power inputs" keys={['tier', 'redundancy', 'feedVoltage', 'gridOfferMva', 'peakPueFactor', 'powerFactor', 'transformerKva', 'upsModuleKw', 'generatorKva', 'upsRuntimeMin', 'generatorFuelHours']} />
        <ParamTable v={v} title="Space and safety" keys={['densityKwPerRack', 'gpuRackKw', 'computeRackKw', 'storageRackKw', 'plantM2PerMw', 'yardM2PerMw', 'floorLoadingKgPerRack', 'suppressionType', 'securityZones', 'commissioningLevel']} />
        <ParamTable v={v} title="Cooling and sustainability" keys={['liquidCapturePct', 'pueTarget', 'renewableSharePct']} />
      </div>
    </div>
  );
}
