/* Sizing tab: hall layout, plant one-line, and every sizing table with the source of each parameter. */
import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { HallLayoutPreview, PlantOneLine } from '../charts';
import { fmtKw, fmtUsd, type PlantItem } from '../../lib/engine';
import { SourceChip } from '../kit';
import { KvList, Muted, SourcedValue, n0, n1, paramDef, type PlanView } from './shared';

const KIND_LABEL: Record<PlantItem['kind'], string> = { feed: 'Utility feed', transformer: 'Transformer', ups: 'UPS / DC plant', generator: 'Generator', pdu: 'Distribution', cooling: 'Cooling unit', cdu: 'CDU' };

function ParamTable({ v, keys, title }: { v: PlanView; keys: string[]; title: string }) {
  const rows = keys.map(k => ({ key: k, def: paramDef(v.ev, k), s: v.ev.params[k] })).filter(r => r.s || r.def);
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
  const liquid = s.cooling.liquidRequired || ['liquid-to-chip', 'immersion'].includes(s.cooling.type);
  const redundancy = String(ev.params['redundancy']?.value ?? '2N');
  const plantCols: ColumnsType<PlantItem> = useMemo(() => [
    { title: 'Item', dataIndex: 'name', key: 'name' },
    { title: 'Kind', dataIndex: 'kind', key: 'kind', render: (k: PlantItem['kind']) => KIND_LABEL[k] },
    { title: 'Unit capacity', dataIndex: 'capacityKw', key: 'cap', align: 'right', render: (kw: number) => fmtKw(kw) },
    { title: 'Count', dataIndex: 'count', key: 'count', align: 'right' },
    { title: 'Installed', key: 'total', align: 'right', render: (_: unknown, r) => fmtKw(r.capacityKw * r.count) },
    { title: 'Redundancy', dataIndex: 'redundancy', key: 'red', render: (r: string) => <VwChip variant="neutral">{r}</VwChip> },
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
          {actuals.powerUtilPct !== undefined && <span style={{ fontSize: 'var(--vw-font-label-sm)' }}>Power utilisation <strong>{actuals.powerUtilPct}%</strong></span>}
          {actuals.fitoutWeeks !== undefined && <span style={{ fontSize: 'var(--vw-font-label-sm)' }}>Fit-out <strong>{actuals.fitoutWeeks} weeks</strong></span>}
        </div>
      )}

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <VwCard title="Hall layout" extra={<Muted>{s.halls} hall(s) · {s.buildings} building(s) · {n0(s.whiteSpaceM2)} m² white space</Muted>}>
          <HallLayoutPreview sizing={s} densityKwPerRack={density} liquid={liquid} height={300} />
          <div style={{ marginTop: 8 }}>
            <KvList columns={2} items={[
              { label: 'IT load', value: fmtKw(s.itKw) },
              { label: 'Racks', value: n0(s.racks) },
              { label: 'Hall design load', value: <SourcedValue s={ev.params['hallDesignKw']} unit="kW" /> },
              { label: 'Halls per floor', value: <SourcedValue s={ev.params['hallsPerFloor']} /> },
              { label: 'Floors per building', value: <SourcedValue s={ev.params['floorsPerBuilding']} /> },
              { label: 'White space per rack', value: <SourcedValue s={ev.params['whiteSpaceM2PerRack']} unit="m²" /> },
              { label: 'Gross area', value: `${n0(s.grossAreaM2)} m²` },
            ]} />
          </div>
        </VwCard>
        <VwCard title="Plant one-line" extra={<VwChip variant="neutral">{redundancy} power · {s.cooling.redundancy} cooling</VwChip>}>
          <PlantOneLine sizing={s} redundancy={redundancy} height={300} />
        </VwCard>
      </div>

      <VwCard title="Plant" extra={<Muted>{s.plant.length} line(s)</Muted>}>
        <Table<PlantItem> size="small" rowKey={r => `${r.kind}-${r.name}`} dataSource={s.plant} columns={plantCols} pagination={false} />
      </VwCard>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <VwCard title="Cooling" extra={<VwChip variant={liquid ? 'cyan' : 'neutral'}>{s.cooling.type}</VwChip>}>
          <KvList items={[
            { label: 'Cooling type', value: <SourcedValue s={ev.params['coolingType']} /> },
            { label: 'Units', value: `${s.cooling.units} × ${fmtKw(s.cooling.unitKw)}` },
            { label: 'Capacity', value: `${fmtKw(s.cooling.capacityKw)} for ${fmtKw(s.itKw)} IT` },
            { label: 'Redundancy', value: <SourcedValue s={ev.params['coolingRedundancy']} /> },
            { label: 'Inlet setpoint', value: <SourcedValue s={ev.params['inletSetpointC']} unit="°C" /> },
            { label: 'Liquid required', value: s.cooling.liquidRequired ? 'Yes — density above threshold' : 'No' },
            { label: 'PUE', value: <SourcedValue s={s.pue} /> },
          ]} />
        </VwCard>
        <VwCard title="Network">
          <KvList items={[
            { label: 'Leaves / spines / cores', value: `${s.network.leaves} / ${s.network.spines} / ${s.network.cores}` },
            { label: 'Uplinks', value: `${n0(s.network.uplinks)} × ${s.network.uplinkGbps} G` },
            { label: 'Access ports', value: n0(s.network.accessPorts) },
            { label: 'Racks per leaf pair', value: <SourcedValue s={ev.params['racksPerLeafPair']} /> },
            { label: 'Oversubscription', value: <SourcedValue s={ev.params['oversubscription']} unit=":1" /> },
            { label: 'Carriers', value: <span className="vw-inline-flex vw-items-center vw-gap-xs">{s.network.carriers} {ev.params['carrierCount'] && <SourceChip source={ev.params['carrierCount'].source} />}</span> },
            { label: 'DCI', value: `${n0(s.network.dciGbps)} Gbps` },
          ]} />
        </VwCard>
        <VwCard title="Staffing and spares">
          <KvList items={[
            { label: 'Operations staff', value: <span className="vw-inline-flex vw-items-center vw-gap-xs">{n1(s.staffing.fte)} FTE <SourceChip source={s.staffing.source} /></span> },
            { label: 'Per MW', value: `${s.staffing.perMw} FTE/MW` },
            { label: 'Shifts', value: s.staffing.shifts },
            { label: 'Spares lines', value: n0(s.spares.lines) },
            { label: 'Spares value', value: fmtUsd(s.spares.valueUsd) },
            { label: 'Spares held', value: <SourcedValue s={ev.params['sparesPct']} unit="%" /> },
            { label: 'Operator owns the IT', value: <SourcedValue s={ev.params['operatorOwnedIt']} /> },
          ]} />
        </VwCard>
      </div>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <ParamTable v={v} title="Power parameters" keys={['tier', 'redundancy', 'feedVoltage', 'upsRuntimeMin', 'generatorFuelHours']} />
        <ParamTable v={v} title="Space and safety" keys={['densityKwPerRack', 'floorLoadingKgPerRack', 'suppressionType', 'securityZones', 'commissioningLevel']} />
        <ParamTable v={v} title="Sustainability" keys={['pueTarget', 'renewableSharePct']} />
      </div>
    </div>
  );
}
