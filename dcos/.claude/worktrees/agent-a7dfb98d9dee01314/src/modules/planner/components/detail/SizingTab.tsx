/* Sizing tab: facility load and the power chain at redundancy, rack classes, cooling and heat rejection, building, staffing — every figure with its basis. */
import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { HallLayoutPreview, PlantOneLine } from '../charts';
import { fmtKw, fmtUsd, type PlantItem, type PowerStage } from '../../lib/engine';
import { SourceChip, Stat } from '../kit';
import { KvList, Muted, SourcedValue, monthYear, n0, n1, paramDef, type PlanView } from './shared';

const KIND_LABEL: Record<PlantItem['kind'], string> = { feed: 'Grid supply path', substation: 'HV substation', transformer: 'Transformer', ups: 'UPS / DC plant', generator: 'Generator', pdu: 'Distribution', cooling: 'Air cooling', cdu: 'CDU', chiller: 'Chiller', 'heat-rejection': 'Heat rejection' };

function ParamTable({ v, keys, title }: { v: PlanView; keys: string[]; title: string }) {
  const rows = keys.map(k => ({ key: k, def: paramDef(v.ev, k), s: v.ev.params[k] })).filter(r => r.s || r.def);
  if (!rows.length) return null;
  return (
    <VwCard title={title}>
      <KvList items={rows.map(r => ({ label: r.def?.label ?? r.key, value: <SourcedValue s={r.s} unit={r.def?.unit} /> }))} />
    </VwCard>
  );
}

export function SizingTab({ v }: { v: PlanView }) {
  const { ev, actuals } = v;
  const s = ev.sizing;
  const density = Number(ev.params['densityKwPerRack']?.value ?? 0);
  const liquid = s.cooling.liquidKw > 0 || s.cooling.liquidRequired;
  const redundancy = String(ev.params['redundancy']?.value ?? '2N');
  const hr = s.cooling.heatRejection;
  const plantCols: ColumnsType<PlantItem> = useMemo(() => [
    { title: 'Item', dataIndex: 'name', key: 'name', render: (t: string, r) => <div><div>{t}</div>{r.note && <Muted size="xs">{r.note}</Muted>}</div> },
    { title: 'Kind', dataIndex: 'kind', key: 'kind', render: (k: PlantItem['kind']) => KIND_LABEL[k] },
    { title: 'Unit', key: 'cap', align: 'right', render: (_: unknown, r) => (r.unitKva ? `${n0(r.unitKva)} kVA` : fmtKw(r.capacityKw)) },
    { title: 'Count', dataIndex: 'count', key: 'count', align: 'right' },
    { title: 'Per path', dataIndex: 'perPath', key: 'pp', align: 'right', render: (x?: number) => x ?? '—' },
    { title: 'Installed', key: 'total', align: 'right', render: (_: unknown, r) => fmtKw(r.capacityKw * r.count) },
    { title: 'Redundancy', dataIndex: 'redundancy', key: 'red', render: (r: string) => <VwChip variant="neutral">{r}</VwChip> },
  ], []);
  const stageCols: ColumnsType<PowerStage> = useMemo(() => [
    { title: 'Stage', dataIndex: 'label', key: 'label', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Redundancy', dataIndex: 'redundancy', key: 'red' },
    { title: 'Units', key: 'units', align: 'right', render: (_: unknown, r) => `${r.count} × ${r.unit}` },
    { title: 'Usable at redundancy', dataIndex: 'usableKw', key: 'use', align: 'right', render: (kw: number) => fmtKw(kw) },
    { title: 'Must carry', dataIndex: 'needKw', key: 'need', align: 'right', render: (kw: number) => fmtKw(kw) },
    { title: 'Check', dataIndex: 'ok', key: 'ok', render: (ok: boolean) => <VwChip variant={ok ? 'success' : 'error'}>{ok ? 'Carries it' : 'Short'}</VwChip> },
    { title: 'Basis', dataIndex: 'basis', key: 'basis', render: (b: string, r) => <span style={{ whiteSpace: 'normal' }}><Muted size="xs">{b}</Muted> <SourceChip source={r.source} /></span> },
  ], []);

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      {actuals.sampleSites > 0 && (
        <div className="vw-card-section vw-flex vw-items-center vw-gap-md vw-wrap">
          <VwChip variant="success">Estate actuals</VwChip>
          <Muted>{actuals.sampleSites} live site(s) of this type</Muted>
          {actuals.kwPerRack !== undefined && <span style={{ fontSize: 'var(--vw-font-label-sm)' }}>Actual density <strong>{actuals.kwPerRack} kW/rack</strong> <Muted size="xs">vs {density} planned</Muted></span>}
          {actuals.pue !== undefined && <span style={{ fontSize: 'var(--vw-font-label-sm)' }}>Achieved PUE <strong>{actuals.pue}</strong> <Muted size="xs">vs {s.pue.value} planned</Muted></span>}
          {actuals.capexPerKw !== undefined && <span style={{ fontSize: 'var(--vw-font-label-sm)' }}>Delivered CapEx <strong>{fmtUsd(actuals.capexPerKw)}/kW</strong></span>}
        </div>
      )}
      {(s.warnings ?? []).length > 0 && (
        <VwCard tone="warning" title="Design notes">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--vw-font-label-sm)' }}>{s.warnings!.map(w => <li key={w}>{w}</li>)}</ul>
        </VwCard>
      )}

      {s.facility && (
        <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Stat label="IT load" value={fmtKw(s.itKw)} sub={`${n0(s.racks)} racks in ${s.halls} hall(s)`} />
          <Stat label="Design PUE" value={s.pue.value} sub={<span>peak {s.facility.peakPue} (+{s.facility.peakFactor}) <SourceChip source={s.pue.source} note={s.pue.note} /></span>} />
          <Stat label="Facility load" value={fmtKw(s.facility.facilityKw)} sub="IT × peak PUE: what feeds and generators carry" />
          <Stat label="Apparent power" value={`${s.facility.mva} MVA`} sub={`${n0(s.facility.kva)} kVA at ${s.facility.powerFactor} power factor`} />
          <Stat label="Liquid / air heat" value={`${fmtKw(s.cooling.liquidKw)} / ${fmtKw(s.cooling.airKw)}`} sub="taken by CDUs / by air units" />
        </div>
      )}

      {(s.power ?? []).length > 0 && (
        <VwCard title={`Power chain at ${redundancy}`} extra={<Muted>2N: each side carries everything · N+1: all but the largest unit</Muted>}>
          <Table<PowerStage> size="small" rowKey="key" dataSource={s.power} columns={stageCols} pagination={false} scroll={{ x: 900 }} />
        </VwCard>
      )}

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <VwCard title="Hall layout" extra={<Muted>{s.halls} hall(s) · {s.buildings} building(s) · {n0(s.whiteSpaceM2)} m² white space</Muted>}>
          <HallLayoutPreview sizing={s} densityKwPerRack={density} liquid={liquid} height={300} />
          <div style={{ marginTop: 8 }}>
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
        </VwCard>
        <VwCard title="Plant one-line" extra={<VwChip variant="neutral">{redundancy} power · {s.cooling.redundancy} cooling</VwChip>}>
          <PlantOneLine sizing={s} redundancy={redundancy} height={300} />
        </VwCard>
      </div>

      <VwCard title="Rack classes" extra={<Muted>racks and kW add up to the design load</Muted>}>
        <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
          <thead><tr><th>Class</th><th style={{ textAlign: 'right' }}>Racks</th><th style={{ textAlign: 'right' }}>kW per rack</th><th style={{ textAlign: 'right' }}>Load</th><th>Cooling</th><th>IT per rack</th></tr></thead>
          <tbody>
            {s.rackClasses.map(c => { const it = ev.estimate.it?.lines.find(l => l.className === c.name); return (
              <tr key={c.name}><td style={{ fontWeight: 500 }}>{c.name}</td><td style={{ textAlign: 'right' }}>{n0(c.racks)}</td><td style={{ textAlign: 'right' }}>{c.kw}</td><td style={{ textAlign: 'right' }}>{fmtKw(c.kw * c.racks)}</td><td>{c.liquid ? `liquid, ${c.capturePct}% to water` : c.rearDoor ? 'rear door' : 'air'}</td><td>{it ? `${it.perRack} × ${it.model}` : '—'}</td></tr>); })}
            {s.rackClasses.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--vw-color-slate-500)' }}>No rack classes in this plan type.</td></tr>}
          </tbody>
          <tfoot><tr><td style={{ fontWeight: 600 }}>Total</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{n0(s.rackClasses.reduce((a, c) => a + c.racks, 0))}</td><td /><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKw(s.rackClasses.reduce((a, c) => a + c.racks * c.kw, 0))}</td><td colSpan={2} /></tr></tfoot>
        </table></div>
      </VwCard>

      <VwCard title="Plant" extra={<Muted>{s.plant.length} line(s)</Muted>}>
        <Table<PlantItem> size="small" rowKey={r => `${r.kind}-${r.name}`} dataSource={s.plant} columns={plantCols} pagination={false} scroll={{ x: 900 }} />
      </VwCard>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <VwCard title="Cooling and heat rejection" extra={<VwChip variant={liquid ? 'cyan' : 'neutral'}>{s.cooling.type}</VwChip>}>
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
          <div style={{ marginTop: 6 }}><Muted size="xs">{hr.source}</Muted></div>
        </VwCard>
        <VwCard title="Network">
          <KvList items={[
            { label: 'Leaves / spines / cores', value: `${s.network.leaves} / ${s.network.spines} / ${s.network.cores}` },
            { label: 'Uplinks', value: `${n0(s.network.uplinks)} × ${s.network.uplinkGbps} G` },
            { label: 'Access ports', value: n0(s.network.accessPorts) },
            { label: 'Racks per leaf pair', value: <SourcedValue s={ev.params['racksPerLeafPair']} /> },
            { label: 'Oversubscription', value: <SourcedValue s={ev.params['oversubscription']} unit=":1" /> },
            { label: 'Carriers', value: <span className="vw-inline-flex vw-items-center vw-gap-xs">{s.network.carriers} {ev.params['carrierCount'] && <SourceChip source={ev.params['carrierCount'].source} />}</span> },
            { label: 'WAN and interconnect', value: <span>{n0(s.network.dciGbps)} Gbps {s.network.dciSource && <Muted size="xs">({s.network.dciSource})</Muted>}</span> },
          ]} />
        </VwCard>
        <VwCard title="Staffing and spares">
          <KvList items={[
            { label: 'Operations staff', value: <span className="vw-inline-flex vw-items-center vw-gap-xs">{n1(s.staffing.fte)} FTE <SourceChip source={s.staffing.source} /></span> },
            { label: 'Per MW', value: `${s.staffing.perMw} FTE/MW` },
            { label: 'How', value: <span style={{ whiteSpace: 'normal' }}>{s.staffing.basis ?? '—'}</span> },
            { label: 'Spares value', value: fmtUsd(s.spares.valueUsd) },
            { label: 'Spares held', value: <SourcedValue s={ev.params['sparesPct']} unit="%" /> },
            { label: 'Operator owns the IT', value: <SourcedValue s={ev.params['operatorOwnedIt']} /> },
          ]} />
          {(s.staffing.plan ?? []).length > 0 && (
            <div className="nst-table-wrap" style={{ marginTop: 8 }}><table className="nst-table" style={{ width: '100%' }}>
              <thead><tr><th>Phase</th><th style={{ textAlign: 'right' }}>Seats</th><th style={{ textAlign: 'right' }}>FTE</th><th>Key hires by</th><th>Technicians by</th></tr></thead>
              <tbody>{s.staffing.plan!.map(x => <tr key={x.phaseId}><td>{x.name}</td><td style={{ textAlign: 'right' }}>{x.seats}</td><td style={{ textAlign: 'right' }}>{x.fte}</td><td>{monthYear(x.keyHireBy)}</td><td>{monthYear(x.techHireBy)}</td></tr>)}</tbody>
            </table></div>
          )}
        </VwCard>
      </div>

      {(s.phaseDesign ?? []).length > 0 && (
        <VwCard title="Phases as design units" extra={<Muted>racks and halls from the same model as the totals</Muted>}>
          <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
            <thead><tr><th>Phase</th><th>Go-live</th><th style={{ textAlign: 'right' }}>IT</th><th style={{ textAlign: 'right' }}>Density</th><th>Cooling</th><th style={{ textAlign: 'right' }}>Racks</th><th style={{ textAlign: 'right' }}>Halls</th><th>Phase record</th></tr></thead>
            <tbody>{s.phaseDesign!.map(ph => <tr key={ph.phaseId}><td>{ph.name}</td><td>{monthYear(ph.goLive)}</td><td style={{ textAlign: 'right' }}>{fmtKw(ph.itKw)}</td><td style={{ textAlign: 'right' }}>{ph.density} kW</td><td>{ph.coolingType}</td><td style={{ textAlign: 'right' }}>{n0(ph.racks)}</td><td style={{ textAlign: 'right' }}>{ph.halls}</td><td>{ph.mismatch ? <VwChip variant="warning">says {ph.storedRacks} racks, {ph.storedHalls} halls</VwChip> : <VwChip variant="success">matches</VwChip>}</td></tr>)}</tbody>
          </table></div>
        </VwCard>
      )}

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <ParamTable v={v} title="Power inputs" keys={['tier', 'redundancy', 'feedVoltage', 'gridOfferMva', 'peakPueFactor', 'powerFactor', 'transformerKva', 'upsModuleKw', 'generatorKva', 'upsRuntimeMin', 'generatorFuelHours']} />
        <ParamTable v={v} title="Space and safety" keys={['densityKwPerRack', 'gpuRackKw', 'computeRackKw', 'storageRackKw', 'plantM2PerMw', 'yardM2PerMw', 'floorLoadingKgPerRack', 'suppressionType', 'securityZones', 'commissioningLevel']} />
        <ParamTable v={v} title="Cooling and sustainability" keys={['liquidCapturePct', 'pueTarget', 'renewableSharePct']} />
      </div>
    </div>
  );
}
