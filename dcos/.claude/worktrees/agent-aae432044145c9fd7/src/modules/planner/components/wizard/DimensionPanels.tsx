/* Result panels for each dimension step: what the planner works out from the inputs. Inputs
   themselves are rendered once by DimensionStep; panels never repeat them. */
import type * as T from '../../../../mock/data/types';
import { fmtKw, fmtUsd } from '../../lib/engine';
import type { DimensionKey } from '../../lib/dimensions';
import { BuildingStack, HallLayoutPreview, PlantOneLine } from '../charts';
import { SourceChip, Stat } from '../kit';
import { COOLING_LABEL, type StepProps } from './wizardModel';
import { SubTitle } from './ParamField';
import { PlacementPanel } from './PlacementStep';
import { ReplacementPanel } from './ReplacementPanel';
import { PhasingPanel } from './PhasingStep';
import { CutoverPanel } from './CutoverStep';
import { CostPanel } from './CostStep';
import { PermitsRisksPanel } from './RulesRisksStep';

const m2 = (n: number) => `${n.toLocaleString('en-US')} m²`;
const KIND_LABEL: Record<string, string> = { feed: 'Utility feed', transformer: 'Transformer', ups: 'UPS', generator: 'Generator', pdu: 'Distribution', cooling: 'Cooling unit', cdu: 'Coolant distribution' };
const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 } as const;

/* ------------------------------------------------------------------ space */
function SpacePanel(props: StepProps) {
  const { draft, ev, estate } = props;
  const s = ev?.sizing; if (!s) return null;
  const b = s.building;
  const density = Number(ev!.params['densityKwPerRack']?.value ?? 0);
  const liquid = ['liquid-to-chip', 'immersion', 'rear-door'].includes(s.cooling.type);
  const builds = draft.scope === 'new-dc' || draft.scope === 'expansion' || draft.scope === 'portfolio';

  if (draft.scope === 'rack' || draft.scope === 'pod') return <><SubTitle>Where the racks go</SubTitle><PlacementPanel {...props} /></>;
  if (draft.scope === 'rack-replace') return <ReplacementPanel {...props} />;
  if (draft.scope === 'server-refresh' || draft.scope === 'network-refresh') return <div style={grid4}><Stat label="Racks affected" value={String(draft.params.affectedRacks ?? 0)} sub="no new space needed" /><Stat label="Devices affected" value={String(draft.params.affectedCount ?? 0)} /><Stat label="Load today" value={fmtKw(Number(draft.params.affectedKw ?? 0))} /><Stat label="Load after" value={fmtKw(s.itKw)} sub="newer equipment draws less" /></div>;

  if (draft.scope === 'hall' || draft.scope === 'retrofit') {
    const halls = estate.halls.filter(h => h.dataCenterId === draft.dataCenterId);
    const hall = halls.find(h => h.id === draft.params.targetHallId);
    return (<>
      <div style={grid4}>
        <Stat label="Hall" value={hall?.name ?? 'Not chosen'} sub={hall ? `${fmtKw(hall.designPowerKw)} design · chosen in Requirements` : 'Pick it in Requirements'} tone={hall ? undefined : 'bad'} />
        <Stat label="Racks needed" value={s.racks.toLocaleString('en-US')} sub={`${density} kW each`} />
        <Stat label="Free positions" value={hall ? hall.rackCapacity - hall.rackCount : '—'} tone={hall ? (hall.rackCapacity - hall.rackCount >= s.racks ? 'ok' : 'bad') : undefined} sub={hall ? (hall.rackCapacity - hall.rackCount >= s.racks ? 'enough room' : `${s.racks - (hall.rackCapacity - hall.rackCount)} short`) : undefined} />
        <Stat label="White space" value={m2(s.whiteSpaceM2)} sub="for the new racks" />
      </div>
      <SubTitle>Hall layout</SubTitle>
      <HallLayoutPreview sizing={s} densityKwPerRack={density} liquid={liquid} height={230} />
    </>);
  }

  if (draft.scope === 'edge') return (<>
    <div style={grid4}>
      <Stat label="Sites" value={s.sites || s.halls} />
      <Stat label="Racks per site" value={Math.ceil(s.racks / Math.max(1, s.sites || s.halls))} sub={`${density} kW each`} />
      <Stat label="IT per site" value={fmtKw(s.itKw / Math.max(1, s.sites || s.halls))} />
      <Stat label="Floor space per site" value={m2(Math.round(s.whiteSpaceM2 / Math.max(1, s.sites || s.halls)))} />
    </div>
    <SubTitle>One site</SubTitle>
    <HallLayoutPreview sizing={{ ...s, halls: 1, racks: Math.ceil(s.racks / Math.max(1, s.sites || s.halls)) }} densityKwPerRack={density} liquid={liquid} height={200} />
  </>);

  return (<>
    <div style={grid4}>
      <Stat label="Racks" value={s.racks.toLocaleString('en-US')} sub={`${density} kW each`} />
      <Stat label="Data halls" value={s.halls} sub={`${b.racksPerHall} racks, ${m2(b.hallWhiteSpaceM2)} each`} />
      {builds && <Stat label="Floors used" value={b.floorsUsed} sub={`${b.hallsPerFloor} halls per floor`} />}
      {builds && <Stat label="Buildings" value={s.buildings} sub={`${b.floorsPerBuilding} floors each`} />}
      <Stat label="White space" value={m2(s.whiteSpaceM2)} sub="racks, aisles and containment" />
      {builds && <Stat label="Gross floor area" value={m2(s.grossAreaM2)} sub={`${b.supportRatio}× white space`} />}
      {builds && <Stat label="Floor plate" value={m2(b.floorPlateM2)} sub="one floor of one building" />}
      {builds && <Stat label="Last building" value={`${b.lastBuildingHalls} of ${b.hallsPerBuilding} halls`} sub={b.lastBuildingHalls < b.hallsPerBuilding ? 'spare slots for growth' : 'full'} />}
    </div>
    {builds && (<><SubTitle>Buildings and floors</SubTitle><BuildingStack building={b} halls={s.halls} buildings={s.buildings} height={240} /></>)}
    <SubTitle>One data hall</SubTitle>
    <HallLayoutPreview sizing={s} densityKwPerRack={density} liquid={liquid} height={220} />
  </>);
}

/* ------------------------------------------------------------------ power */
function PowerPanel({ ev }: StepProps) {
  const s = ev?.sizing; if (!s) return null;
  return (<>
    <PlantOneLine sizing={s} redundancy={String(ev!.params['redundancy']?.value ?? '2N')} height={230} />
    <SubTitle>Power plant</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Item</th><th>Kind</th><th style={{ textAlign: 'right' }}>Each</th><th style={{ textAlign: 'right' }}>Count</th><th style={{ textAlign: 'right' }}>Total</th><th>Redundancy</th></tr></thead>
      <tbody>{s.plant.filter(p => p.kind !== 'cooling' && p.kind !== 'cdu').map((p, i) => <tr key={i}><td>{p.name}</td><td>{KIND_LABEL[p.kind]}</td><td style={{ textAlign: 'right' }}>{fmtKw(p.capacityKw)}</td><td style={{ textAlign: 'right' }}>{p.count}</td><td style={{ textAlign: 'right' }}>{fmtKw(p.capacityKw * p.count)}</td><td>{p.redundancy}</td></tr>)}</tbody>
    </table></div>
  </>);
}

/* ------------------------------------------------------------------ cooling */
function CoolingPanel({ ev, draft }: StepProps) {
  const s = ev?.sizing; if (!s) return null;
  const density = Number(ev!.params['densityKwPerRack']?.value ?? 0);
  const liquid = ['liquid-to-chip', 'immersion', 'rear-door'].includes(s.cooling.type);
  return (
    <div style={grid4}>
      <Stat label="Cooling" value={COOLING_LABEL[s.cooling.type as T.PlannerCoolingType] ?? s.cooling.type} />
      <Stat label="Units" value={s.cooling.units} sub={`${fmtKw(s.cooling.unitKw)} each · ${s.cooling.redundancy}`} />
      <Stat label="Capacity" value={fmtKw(s.cooling.capacityKw)} sub={`${s.itKw ? Math.round((s.cooling.capacityKw / s.itKw) * 100) : 0}% of IT load`} tone={s.cooling.capacityKw - s.cooling.unitKw >= s.itKw * 1.1 ? 'ok' : 'warn'} />
      <Stat label="Liquid needed" value={s.cooling.liquidRequired ? 'Yes' : 'No'} tone={s.cooling.liquidRequired && !liquid ? 'bad' : undefined} sub={`${density} kW per rack${draft.scope === 'retrofit' ? ` · ${draft.params.liquidRacks ?? '—'} racks` : ''}`} />
    </div>
  );
}

/* ------------------------------------------------------------------ network */
function NetworkPanel(props: StepProps) {
  const { ev, draft } = props;
  if (draft.scope === 'network-refresh') return <ReplacementPanel {...props} />;
  const s = ev?.sizing; if (!s) return null;
  return (
    <div style={grid4}>
      <Stat label="Leaf switches" value={s.network.leaves} sub={`${ev!.params['racksPerLeafPair']?.value ?? 16} racks per pair`} />
      <Stat label="Spine switches" value={s.network.spines} sub={`${s.network.uplinks} uplinks at ${s.network.uplinkGbps} Gbps`} />
      <Stat label="Core routers" value={s.network.cores} sub={`${s.network.carriers} carrier${s.network.carriers === 1 ? '' : 's'}`} tone={s.network.carriers < 2 ? 'bad' : undefined} />
      <Stat label="Interconnect" value={`${s.network.dciGbps.toLocaleString('en-US')} Gbps`} sub={`${s.network.accessPorts.toLocaleString('en-US')} access ports`} />
    </div>
  );
}

/* ------------------------------------------------------------------ IT */
function ItPanel(props: StepProps) {
  const { ev, draft } = props;
  if (draft.scope === 'server-refresh') return <ReplacementPanel {...props} />;
  const s = ev?.sizing; if (!s) return null;
  return (<>
    <div style={grid4}>
      {s.rackClasses.map(c => <Stat key={c.name} label={`${c.name} racks`} value={c.racks.toLocaleString('en-US')} sub={`${c.kw} kW each · ${c.sharePct}% of the mix`} />)}
      <Stat label="Spares held" value={fmtUsd(s.spares.valueUsd)} sub={`${s.spares.lines} lines`} />
    </div>
    <div className="vw-card-description" style={{ marginTop: 8 }}>The mix comes from Requirements; change it there.</div>
  </>);
}

/* ------------------------------------------------------------------ fire and security */
function FireSecPanel({ ev }: StepProps) {
  const s = ev?.sizing; if (!s) return null;
  const zones = Number(ev!.params['securityZones']?.value ?? 4);
  return (
    <div style={grid4}>
      <Stat label="Suppression zones" value={s.halls} sub={`${String(ev!.params['suppressionType']?.value ?? 'Clean agent gas')}, one per hall`} />
      <Stat label="Security layers" value={zones} sub={['Perimeter', 'Lobby', 'Hall', 'Cage', 'Plant', 'Vault'].slice(0, zones).join(' → ')} />
      <Stat label="Detection" value="Very early smoke" sub="aspirating detection in every hall" />
      <Stat label="Access" value="Two factors" sub="badge and PIN into data halls" />
    </div>
  );
}

/* ------------------------------------------------------------------ sustainability */
function SustainabilityPanel({ ev }: StepProps) {
  if (!ev) return null; const x = ev.sustainability; const s = ev.sizing;
  return (
    <div style={grid4}>
      <Stat label="PUE" value={x.pue} sub={<SourceChip source={s.pue.source} note={s.pue.note} />} />
      <Stat label="Energy per year" value={`${x.energyMwhYear.toLocaleString('en-US')} MWh`} />
      <Stat label="Carbon per year" value={`${x.carbonTYear.toLocaleString('en-US')} t CO₂`} sub={`at ${x.renewableSharePct}% renewable`} />
      <Stat label="Water" value={`${x.wue} L/kWh`} sub={x.heatReuseMwhYear ? `${x.heatReuseMwhYear.toLocaleString('en-US')} MWh heat reusable` : 'little heat to reuse'} />
    </div>
  );
}

/* ------------------------------------------------------------------ operations */
function OperationsPanel({ ev }: StepProps) {
  const s = ev?.sizing; if (!s) return null;
  return (
    <div style={grid4}>
      <Stat label="Operations staff" value={`${s.staffing.fte} FTE`} sub={`${s.staffing.perMw} per MW`} />
      <Stat label="Shifts" value={s.staffing.shifts} sub={s.staffing.shifts >= 4 ? 'round the clock' : 'extended hours'} />
      <Stat label="Spare parts" value={s.spares.lines} sub="stock lines" />
      <Stat label="Spares value" value={fmtUsd(s.spares.valueUsd)} />
    </div>
  );
}

/* ------------------------------------------------------------------ delivery */
function DeliveryPanel(props: StepProps) {
  // Waves are the phases for a migration, so the delivery step only shows order dates there.
  const single = ['rack', 'pod', 'plant', 'network', 'migration'].includes(props.draft.scope);
  if (single) return <PhasingPanel {...props} singlePhase />;
  return <PhasingPanel {...props} />;
}

export const DIMENSION_PANEL: Record<DimensionKey, (p: StepProps) => React.ReactNode> = {
  space: SpacePanel, power: PowerPanel, cooling: CoolingPanel, network: NetworkPanel, it: ItPanel, firesec: FireSecPanel,
  sustainability: SustainabilityPanel, operations: OperationsPanel, delivery: DeliveryPanel, migration: CutoverPanel, cost: CostPanel, permits: PermitsRisksPanel,
};
