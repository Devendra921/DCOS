/**
 * Planner engine — pure functions that turn a plan (template + parameters + demand + phases)
 * into sizing, a capacity ladder, a cost estimate, rule findings, a schedule and sustainability
 * figures. Nothing here reads the DOM or React; the hooks in usePlanner.ts feed it records.
 *
 * Every derived number carries a `source` so the UI can show where it came from.
 */
import type * as T from '../../../mock/data/types';
import { dcTypeProfile, plantPlan } from '../../../mock/data/dcTypes';
import { priceOf } from './catalogue';
import type { PlannerData } from './plannerData';
import { campusBaseline, siteBaseline } from './site';
import { modelFor, type CheckResult, type ScopeCtx } from './scopes';

export type ParamValue = number | string | boolean;
export interface Sourced<V = number> { value: V; source: T.PlannerParamSource; note?: string }

export interface EstateActuals {
  /** Real average kW per rack for racks of this site type (from DCIM). */
  kwPerRack?: number;
  /** Real PUE achieved by sites of this type. */
  pue?: number;
  /** CapEx per kW from delivered programmes of this type (budget ÷ design kW). */
  capexPerKw?: number;
  /** Utilisation of installed power at live sites of this type. */
  powerUtilPct?: number;
  /** Average fit-out duration from delivery actuals, weeks. */
  fitoutWeeks?: number;
  sampleSites: number;
  sampleRacks?: number;
}

export interface ResolvedTemplate { template: T.PlannerTemplate; chain: T.PlannerTemplate[]; params: T.PlannerParamDef[]; rules: T.PlannerRuleDef[] }

/** Walk `inheritsFrom` up to the root; nearer templates override parameters and add rules. */
export function resolveTemplate(templateId: string, all: T.PlannerTemplate[]): ResolvedTemplate | null {
  const byId = new Map(all.map(t => [t.id, t]));
  const chain: T.PlannerTemplate[] = [];
  let cur = byId.get(templateId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) { chain.push(cur); seen.add(cur.id); cur = cur.inheritsFrom ? byId.get(cur.inheritsFrom) : undefined; }
  if (!chain.length) return null;
  const params = new Map<string, T.PlannerParamDef>();
  const rules = new Map<string, T.PlannerRuleDef>();
  for (const t of [...chain].reverse()) { t.params.forEach(p => params.set(p.key, p)); t.rules.forEach(r => rules.set(r.id, r)); }
  return { template: chain[0], chain, params: [...params.values()], rules: [...rules.values()] };
}

/** Effective parameters: template defaults, then the plan, then the scenario overrides. */
export function effectiveParams(resolved: ResolvedTemplate | null, plan: T.PlannerPlan, scenario?: T.PlannerScenario | null, profileTemplate?: T.PlannerTemplate | null): Record<string, Sourced<ParamValue>> {
  const out: Record<string, Sourced<ParamValue>> = {};
  for (const p of profileTemplate?.params ?? []) if (p.default !== undefined) out[p.key] = { value: p.default, source: 'template', note: `${profileTemplate!.name} profile` };
  for (const p of resolved?.params ?? []) if (p.default !== undefined && !out[p.key]) out[p.key] = { value: p.default, source: 'template', note: resolved!.template.name };
  for (const [k, v] of Object.entries(plan.params)) out[k] = { value: v, source: plan.paramSources[k] ?? 'user' };
  for (const [k, v] of Object.entries(scenario?.overrides ?? {})) out[k] = { value: v, source: 'user', note: `scenario ${scenario!.name}` };
  return out;
}

const num = (p: Record<string, Sourced<ParamValue>>, k: string, d = 0) => { const v = p[k]?.value; return typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d; };
const str = (p: Record<string, Sourced<ParamValue>>, k: string, d = '') => { const v = p[k]?.value; return v === undefined ? d : String(v); };
const bool = (p: Record<string, Sourced<ParamValue>>, k: string, d = false) => { const v = p[k]?.value; return typeof v === 'boolean' ? v : d; };
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PlantItem { name: string; kind: 'feed' | 'transformer' | 'ups' | 'generator' | 'pdu' | 'cooling' | 'cdu'; capacityKw: number; count: number; redundancy: string }
/** How the halls stack into floors and buildings. Only meaningful for scopes that build (new site, expansion, portfolio). */
export interface BuildingPlan { racksPerHall: number; hallWhiteSpaceM2: number; hallsPerFloor: number; floorsPerBuilding: number; hallsPerBuilding: number; floorsUsed: number; floorPlateM2: number; buildingGrossM2: number; supportRatio: number; lastBuildingHalls: number }
export interface Sizing {
  itKw: number; racks: number; halls: number; buildings: number; whiteSpaceM2: number; grossAreaM2: number; building: BuildingPlan; sites: number; rackClasses: { name: string; kw: number; racks: number; sharePct: number }[];
  plant: PlantItem[]; network: { leaves: number; spines: number; cores: number; uplinks: number; accessPorts: number; uplinkGbps: number; carriers: number; dciGbps: number };
  staffing: { fte: number; shifts: number; perMw: number; source: T.PlannerParamSource }; spares: { lines: number; valueUsd: number };
  cooling: { type: string; capacityKw: number; units: number; unitKw: number; redundancy: string; liquidRequired: boolean };
  pue: Sourced<number>;
}

export function size(plan: T.PlannerPlan, p: Record<string, Sourced<ParamValue>>, benchmarks: T.PlannerBenchmark[], actuals?: EstateActuals): Sizing {
  const itKw = plan.designPowerKw;
  const density = Math.max(1, num(p, 'densityKwPerRack', 12));
  const rackCount = num(p, 'rackCount', 0);
  const affectedRacks = num(p, 'affectedRacks', 0);
  const racks = (plan.scope === 'server-refresh' || plan.scope === 'network-refresh' || plan.scope === 'rack-replace') ? affectedRacks : (plan.scope === 'rack' || plan.scope === 'pod') && rackCount > 0 ? rackCount : itKw > 0 ? Math.ceil(itKw / density) : 0;
  const siteCount = plan.scope === 'edge' ? Math.max(0, num(p, 'siteCount', 0)) : 0;
  const hallKw = Math.max(1, num(p, 'hallDesignKw', 1500));
  const halls = siteCount > 0 ? siteCount : itKw > 0 ? Math.max(1, Math.ceil(itKw / hallKw)) : 0;
  // Building model: halls per floor × floors per building; older plans may still carry halls per building.
  const hallsPerFloor = Math.max(1, num(p, 'hallsPerFloor', 0) || 0);
  const floorsPerBuilding = Math.max(1, num(p, 'floorsPerBuilding', 0) || 0);
  const hpb = p['hallsPerFloor'] || p['floorsPerBuilding'] ? hallsPerFloor * floorsPerBuilding : Math.max(1, num(p, 'hallsPerBuilding', 6));
  const buildings = siteCount > 0 ? siteCount : halls ? Math.ceil(halls / hpb) : 0;
  const m2PerRack = num(p, 'whiteSpaceM2PerRack', 2.6);
  const whiteSpaceM2 = r0(racks * m2PerRack);
  const supportRatio = num(p, 'supportSpaceRatio', 2.4);
  const grossAreaM2 = r0(whiteSpaceM2 * supportRatio);
  const racksPerHall = halls ? Math.ceil(racks / halls) : 0;
  const hallWhiteSpaceM2 = r0(racksPerHall * m2PerRack);
  const effHpf = p['hallsPerFloor'] ? hallsPerFloor : Math.max(1, Math.ceil(hpb / Math.max(1, floorsPerBuilding)));
  const effFloors = p['floorsPerBuilding'] ? floorsPerBuilding : Math.max(1, Math.ceil(hpb / effHpf));
  const building: BuildingPlan = { racksPerHall, hallWhiteSpaceM2, hallsPerFloor: effHpf, floorsPerBuilding: effFloors, hallsPerBuilding: hpb, floorsUsed: halls ? Math.ceil(halls / effHpf) : 0, floorPlateM2: r0(effHpf * hallWhiteSpaceM2 * supportRatio), buildingGrossM2: r0(effHpf * hallWhiteSpaceM2 * supportRatio * effFloors), supportRatio, lastBuildingHalls: halls ? halls - (buildings - 1) * hpb : 0 };
  const gpu = plan.demand.gpuPct / 100, comp = plan.demand.computePct / 100, sto = plan.demand.storagePct / 100;
  const rackClasses = [
    { name: 'GPU', kw: r0(Math.max(density, density * 1.6)), racks: r0(racks * gpu * 0.7), sharePct: r0(gpu * 100) },
    { name: 'Compute', kw: r0(density * 0.9), racks: r0(racks * comp), sharePct: r0(comp * 100) },
    { name: 'Storage', kw: r0(density * 0.6), racks: r0(racks * sto * 1.2), sharePct: r0(sto * 100) },
  ].filter(c => c.racks > 0);
  const coolingType = str(p, 'coolingType', 'chilled-water') as T.PlannerCoolingType;
  const liquidThreshold = benchmarks.find(b => b.metric === 'liquidThresholdKw')?.value ?? 30;
  const prof = dcTypeProfile(plan.dcTypeKey);
  const rnd = (a: number, b: number) => Math.round((a + b) / 2);
  const pp = prof && itKw > 0 ? plantPlan(prof, itKw, Math.max(1, racks), rnd) : null;
  const redundancy = str(p, 'redundancy', '2N');
  const genMargin = benchmarks.find(b => b.metric === 'generatorMargin')?.value ?? 1.25;
  const nGen = itKw > 0 ? Math.max(1, Math.ceil((itKw * genMargin) / 2500) + (redundancy === 'N' ? 0 : 1)) : 0;
  const plant: PlantItem[] = itKw > 0 ? [
    ...(pp ? pp.feeds.map(f => ({ name: f.name, kind: 'feed' as const, capacityKw: f.capacityKw, count: 1, redundancy: f.role })) : []),
    { name: `Transformers ${(num(p, 'feedVoltage', 33000) / 1000).toLocaleString('en-US')} kV · 2.5 MVA`, kind: 'transformer', capacityKw: 2500, count: redundancy === 'N' ? Math.ceil((itKw * 1.1) / 2500) : Math.ceil((itKw * 1.1) / 2500) * 2, redundancy },
    ...(pp ? pp.backup.map(b => ({ name: b.name, kind: 'ups' as const, capacityKw: b.capacityKw, count: 1, redundancy })) : []),
    { name: 'Generators 2.5 MVA', kind: 'generator', capacityKw: 2000, count: nGen, redundancy: redundancy === 'N' ? 'N' : 'N+1' },
    { name: prof?.dcPowerPlant ? 'BDFB distribution' : 'PDUs', kind: 'pdu', capacityKw: pp?.distribution[0]?.capacityKw ?? 200, count: pp?.distribution.length ?? Math.ceil(racks / 10), redundancy: redundancy === 'N' ? 'N' : '2N' },
  ] : [];
  const coolingMargin = benchmarks.find(b => b.metric === 'coolingMargin')?.value ?? 1.1;
  const coolRed = str(p, 'coolingRedundancy', 'N+1');
  const unitKw = coolingType === 'liquid-to-chip' || coolingType === 'immersion' ? 1000 : coolingType === 'in-row' || coolingType === 'rear-door' ? 60 : 250;
  const baseUnits = itKw > 0 ? Math.ceil((itKw * coolingMargin) / unitKw) : 0;
  const units = baseUnits ? (coolRed === '2N' ? baseUnits * 2 : baseUnits + Math.max(1, Math.ceil(baseUnits / 8))) : 0;
  if (itKw > 0) plant.push({ name: coolingType === 'liquid-to-chip' ? 'CDUs' : coolingType === 'in-row' ? 'In-row units' : coolingType === 'rear-door' ? 'Rear-door units' : 'CRAH units', kind: coolingType === 'liquid-to-chip' ? 'cdu' : 'cooling', capacityKw: unitKw, count: units, redundancy: coolRed });
  const racksPerLeafPair = Math.max(1, num(p, 'racksPerLeafPair', 16));
  const leaves = racks ? Math.ceil(racks / racksPerLeafPair) * 2 : plan.scope === 'network' ? 0 : 0;
  const uplinksPerLeaf = num(p, 'uplinksPerLeaf', 4);
  const spines = leaves ? Math.max(2, Math.ceil((leaves * uplinksPerLeaf) / 32)) : 0;
  const cores = itKw > 0 ? (itKw >= 5000 ? 4 : 2) : 0;
  const uplinkGbps = num(p, 'uplinkGbps', 400);
  const carriers = num(p, 'carrierCount', 3);
  const climateBand = benchmarks.filter(b => b.metric === 'pue' && b.appliesTo.coolingType === coolingType && b.appliesTo.climate === plan.climate)[0] ?? benchmarks.find(b => b.metric === 'pue' && b.appliesTo.coolingType === coolingType);
  const pueParam = p['pueTarget'];
  const pue: Sourced<number> = pueParam && typeof pueParam.value === 'number' ? { value: pueParam.value, source: pueParam.source, note: pueParam.note } : actuals?.pue ? { value: actuals.pue, source: 'actual', note: `achieved at ${actuals.sampleSites} sites of this type` } : { value: climateBand?.value ?? prof?.pueTarget ?? 1.4, source: 'benchmark', note: climateBand?.source };
  const staffBench = benchmarks.find(b => b.metric === 'staffPerMw' && b.appliesTo.tier === str(p, 'tier')) ?? benchmarks.find(b => b.metric === 'staffPerMw');
  const perMw = p['staffPerMw'] ? num(p, 'staffPerMw') : staffBench?.value ?? 0.8;
  const fte = r1(Math.max(itKw > 0 ? 4 : 0, (itKw / 1000) * perMw));
  return {
    itKw, racks, halls, buildings, whiteSpaceM2, grossAreaM2, building, sites: siteCount, rackClasses, plant,
    network: { leaves, spines, cores, uplinks: leaves * uplinksPerLeaf, accessPorts: racks * 48, uplinkGbps, carriers, dciGbps: num(p, 'dciGbpsRequired', 0) || (itKw > 0 ? Math.max(200, r0(itKw / 25) * 100) : 800) },
    staffing: { fte, shifts: itKw >= 2000 ? 4 : itKw > 0 ? 2 : 0, perMw, source: p['staffPerMw']?.source ?? 'benchmark' },
    spares: { lines: r0(racks * 0.3), valueUsd: r0(racks * num(p, 'itCapexPerRack', 180000) * (num(p, 'sparesPct', 3) / 100) * (bool(p, 'operatorOwnedIt', true) ? 1 : 0.2)) },
    cooling: { type: coolingType, capacityKw: units * unitKw, units, unitKw, redundancy: coolRed, liquidRequired: density > liquidThreshold },
    pue,
  };
}

export interface LadderRow { phase: T.PlannerPhase; installedKw: number; committedKw: number; reserveKw: number; headroomKw: number; usablePct: number; racks: number; halls: number; monthsFromNow: number; crossesWarningMonth?: number; bindingConstraint: 'power' | 'cooling' | 'space' | 'ports' | 'none' }
export function capacityLadder(plan: T.PlannerPlan, p: Record<string, Sourced<ParamValue>>, sizing: Sizing): LadderRow[] {
  const now = Date.now();
  const reserve = num(p, 'reservePct', 15) / 100;
  const growth = plan.demand.growthPctPerYear / 100;
  let installed = 0;
  return [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).map((ph, i) => {
    installed += ph.itKw;
    const months = Math.max(0, (new Date(ph.goLive).getTime() - now) / (30.4 * 864e5));
    const committed = r0(Math.min(installed, ph.itKw * 0.8 + (i ? installed * 0.1 : 0)));
    const reserveKw = r0(installed * reserve);
    const headroom = Math.max(0, installed - committed - reserveKw);
    const usable = installed ? r0(((installed - reserveKw) / installed) * 100) : 0;
    const crossing = growth > 0 && installed > 0 && committed > 0 ? r1(Math.log((installed * 0.85) / Math.max(1, committed)) / Math.log(1 + growth / 12)) : undefined;
    const coolingShort = sizing.cooling.capacityKw > 0 && sizing.cooling.capacityKw < installed * 1.1;
    const spaceShort = sizing.racks > 0 && ph.racks > sizing.racks / Math.max(1, plan.phases.length) * 1.2;
    const binding: LadderRow['bindingConstraint'] = coolingShort ? 'cooling' : spaceShort ? 'space' : headroom < installed * 0.1 ? 'power' : 'none';
    return { phase: ph, installedKw: installed, committedKw: committed, reserveKw, headroomKw: headroom, usablePct: usable, racks: ph.racks, halls: ph.halls, monthsFromNow: r1(months), crossesWarningMonth: crossing !== undefined && Number.isFinite(crossing) ? r1(months + Math.max(0, crossing)) : undefined, bindingConstraint: binding };
  });
}

export interface EstimateLine { category: string; item: string; amount: number; basis: string; source: T.PlannerParamSource }
export interface Estimate {
  capex: EstimateLine[]; capexTotal: number; capexPerKw: number; capexPerRack: number;
  opex: EstimateLine[]; opexMonthly: number; opexAnnual: number; energyMwhYear: number;
  revenueAnnual: number; energyRecoveredAnnual: number; marginAnnual: number; paybackMonths: number | null; paybackBasis: string; plantCapexTotal: number; costPerKwMonth: number;
  benchmarkBand?: { low: number; high: number; source: string }; actualsCapexPerKw?: number;
  /** What the plan saves or enables each year (replacements, migrations, plant, network): energy, support, lease, circuits… */
  benefitLines?: EstimateLine[]; benefitAnnual?: number;
  /** Year-by-year cash flow and the investment measures built on it (see finance.ts). */
  cashflow?: CashflowYear[]; npvUsd?: number; irrPct?: number | null; discountPct?: number; depreciationAnnual?: number;
  /** How the estimate compares with the bill of materials (in-site scopes: the estimate is the bill plus contingency). */
  basis?: 'bottom-up' | 'benchmark' | 'mixed'; contingencyUsd?: number;
  /** Capacity the works make usable (plant upgrades), in IT kW. */
  capacityEnabledKw?: number;
}
export interface CashflowYear { year: number; label: string; capex: number; opex: number; revenue: number; benefit: number; net: number; cumulative: number; discounted: number }
export function estimate(plan: T.PlannerPlan, p: Record<string, Sourced<ParamValue>>, sizing: Sizing, benchmarks: T.PlannerBenchmark[], actuals?: EstateActuals): Estimate {
  const itKw = sizing.itKw;
  const bmCapex = benchmarks.find(b => b.metric === 'capexPerKw' && b.appliesTo.dcTypeKey === plan.dcTypeKey);
  const capexPerKwP = p['capexPerKw'];
  const saneActual = actuals?.capexPerKw && (!bmCapex || (actuals.capexPerKw >= (bmCapex.low ?? 0) * 0.5 && actuals.capexPerKw <= (bmCapex.high ?? 1e9) * 2)) ? actuals.capexPerKw : undefined;
  const capexPerKw = capexPerKwP ? num(p, 'capexPerKw') : saneActual ?? bmCapex?.value ?? 3400;
  const capexSource: T.PlannerParamSource = capexPerKwP?.source ?? (saneActual ? 'actual' : 'benchmark');
  const replace = plan.scope === 'server-refresh' || plan.scope === 'network-refresh' || plan.scope === 'rack-replace';
  const scopeFactor = replace ? 0 : plan.scope === 'plant' ? 0.3 : plan.scope === 'retrofit' ? 0.55 : plan.scope === 'pod' || plan.scope === 'rack' ? 0.35 : plan.scope === 'network' ? 0 : plan.scope === 'migration' ? 0.05 : 1;
  const plantCapex = itKw * capexPerKw * scopeFactor;
  const shares: [string, number][] = plan.scope === 'plant' ? [['Power plant', 0.6], ['Cooling plant', 0.35], ['Services and contingency', 0.05]] : plan.scope === 'retrofit' ? [['Cooling plant', 0.55], ['Power distribution', 0.25], ['Fit-out', 0.12], ['Services and contingency', 0.08]] : [['Power plant', 0.32], ['Cooling plant', 0.18], ['Fit-out', 0.14], ['Network and structured cabling', 0.06], ['Fire, security and BMS', 0.05], ['Services and contingency', 0.08], ['Land and shell (input only)', 0.17]];
  const capex: EstimateLine[] = (replace ? [] : shares).map(([item, s]) => ({ category: 'CapEx', item, amount: r0(plantCapex * s), basis: `${r0(s * 100)}% of ${capexPerKw.toLocaleString('en-US')} USD/kW × ${itKw.toLocaleString('en-US')} kW`, source: capexSource }));
  const ownIt = bool(p, 'operatorOwnedIt', true);
  const itCapex = ownIt && !replace ? sizing.racks * num(p, 'itCapexPerRack', 180000) : 0;
  if (itCapex) capex.push({ category: 'CapEx', item: 'IT and network equipment', amount: r0(itCapex), basis: `${sizing.racks} racks × ${num(p, 'itCapexPerRack').toLocaleString('en-US')} USD`, source: p['itCapexPerRack']?.source ?? 'benchmark' });
  if (replace) {
    // Replacement plans are priced from the chosen model and the affected count (set when the devices or racks are selected).
    const affected = num(p, 'affectedCount', 0);
    const units = plan.scope === 'server-refresh' ? Math.ceil(affected / Math.max(1, num(p, 'consolidationRatio', 2))) : plan.scope === 'network-refresh' ? affected : num(p, 'affectedRacks', affected);
    const unitCost = plan.scope === 'rack-replace' ? (priceOf(str(p, 'rackModel', 'NetShelter SX 48U')) ?? 3800) + (bool(p, 'replacePdus', true) ? 2 * (priceOf('Geist rPDU 3-phase') ?? 1400) : 0) : priceOf(str(p, 'replacementModel')) ?? num(p, 'replacementUnitCost', 0);
    if (units && unitCost) capex.push({ category: 'CapEx', item: plan.scope === 'rack-replace' ? 'New racks and power strips' : 'New equipment', amount: r0(units * unitCost), basis: `${units} × ${unitCost.toLocaleString('en-US')} USD (${String(p['replacementModel']?.value ?? p['rackModel']?.value ?? 'catalogue model')})`, source: 'benchmark' });
    if (affected) capex.push({ category: 'CapEx', item: 'Installation, migration and disposal', amount: r0(affected * (plan.scope === 'rack-replace' ? 1900 : plan.scope === 'network-refresh' ? 420 : 370)), basis: `${affected} ${plan.scope === 'rack-replace' ? 'racks' : 'devices'} moved, cut over and disposed of`, source: 'benchmark' });
  }
  if (plan.scope === 'network') { capex.push({ category: 'CapEx', item: 'Optics, line cards and DCI circuits', amount: 1_250_000, basis: '2 × 400G DCI, third diverse path, optics both ends', source: 'benchmark' }); }
  const capexTotal = capex.reduce((a, l) => a + l.amount, 0);
  const tariff = num(p, 'tariffUsdPerKwh', plan.tariffUsdPerKwh ?? 0.11);
  const pue = sizing.pue.value;
  const energyMwhYear = r0((itKw * pue * 8760) / 1000);
  const energy = itKw * pue * 8760 * tariff;
  const maintenance = plantCapex * (num(p, 'maintenancePctCapex', 2.5) / 100);
  const staffCost = benchmarks.find(b => b.metric === 'staffCostFte')?.value ?? 96000;
  const staff = sizing.staffing.fte * staffCost;
  const connectivity = sizing.network.carriers * 48000 + (sizing.network.dciGbps / 100) * 18000;
  const property = sizing.grossAreaM2 * num(p, 'leaseUsdPerM2Year', 0);
  const software = itKw * 14;
  const opex: EstimateLine[] = ([
    { category: 'OpEx', item: 'Energy', amount: r0(energy / 12), basis: `${itKw.toLocaleString('en-US')} kW × PUE ${pue} × 730 h × ${tariff} USD/kWh`, source: sizing.pue.source },
    { category: 'OpEx', item: 'Maintenance and service contracts', amount: r0(maintenance / 12), basis: `${num(p, 'maintenancePctCapex', 2.5)}% of plant CapEx per year`, source: p['maintenancePctCapex']?.source ?? 'benchmark' },
    { category: 'OpEx', item: 'Staff', amount: r0(staff / 12), basis: `${sizing.staffing.fte} FTE × ${staffCost.toLocaleString('en-US')} USD`, source: sizing.staffing.source },
    { category: 'OpEx', item: 'Connectivity', amount: r0(connectivity / 12), basis: `${sizing.network.carriers} carriers, ${sizing.network.dciGbps} Gbps DCI`, source: 'benchmark' },
    { category: 'OpEx', item: 'Property and insurance', amount: r0(property / 12 + plantCapex * 0.004 / 12), basis: property ? `${sizing.grossAreaM2.toLocaleString('en-US')} m² lease plus insurance` : 'insurance on plant', source: 'benchmark' },
    { category: 'OpEx', item: 'Software and licences', amount: r0(software / 12), basis: 'monitoring, DCIM, ITSM per kW', source: 'benchmark' },
  ] as EstimateLine[]).filter(l => l.amount > 0);
  const opexMonthly = opex.reduce((a, l) => a + l.amount, 0);
  const occupancy = 0.85;
  const revenueAnnual = itKw * num(p, 'revenuePerKwMonth', plan.revenuePerKwMonth ?? 0) * 12 * occupancy;
  const energyRecoveredAnnual = revenueAnnual > 0 ? energy * occupancy : 0;
  const marginAnnual = revenueAnnual + energyRecoveredAnnual - opexMonthly * 12;
  const plantCapexTotal = capexTotal - itCapex;
  const payback = marginAnnual > 0 && plantCapexTotal > 0 ? r0((plantCapexTotal / marginAnnual) * 12) : null;
  return {
    capex, capexTotal: r0(capexTotal), capexPerKw: itKw ? r0((capexTotal - itCapex) / itKw) : 0, capexPerRack: sizing.racks ? r0(capexTotal / sizing.racks) : 0,
    opex, opexMonthly: r0(opexMonthly), opexAnnual: r0(opexMonthly * 12), energyMwhYear, revenueAnnual: r0(revenueAnnual), energyRecoveredAnnual: r0(energyRecoveredAnnual), marginAnnual: r0(marginAnnual), paybackMonths: payback, paybackBasis: itCapex ? 'plant and fit-out CapEx (IT excluded), revenue at 85% occupancy plus energy recovered from tenants' : 'CapEx at 85% occupancy plus energy recovered from tenants', plantCapexTotal: r0(plantCapexTotal),
    costPerKwMonth: itKw ? r0(opexMonthly / itKw) : 0, benchmarkBand: bmCapex && WHOLE_SITE_SCOPES.includes(plan.scope) ? { low: bmCapex.low ?? bmCapex.value ?? 0, high: bmCapex.high ?? bmCapex.value ?? 0, source: bmCapex.source } : undefined, actualsCapexPerKw: actuals?.capexPerKw,
  };
}

export const WHOLE_SITE_SCOPES: T.PlannerScope[] = ['new-dc', 'expansion', 'portfolio'];
export const COMMISSIONING_REQUIRED: Record<T.PlannerScope, number> = { 'new-dc': 5, expansion: 5, plant: 5, hall: 5, retrofit: 4, pod: 4, edge: 3, network: 3, migration: 3, portfolio: 3, rack: 3 , 'server-refresh': 3, 'network-refresh': 3, 'rack-replace': 3 };
export interface Finding { rule: T.PlannerRuleDef; status: 'pass' | 'fail' | 'warn' | 'n/a'; detail: string; value?: string }
export function evaluateRules(rules: T.PlannerRuleDef[], plan: T.PlannerPlan, p: Record<string, Sourced<ParamValue>>, sizing: Sizing, est: Estimate, benchmarks: T.PlannerBenchmark[], schedule: ScheduleItem[], scopeCheck?: (rule: T.PlannerRuleDef) => CheckResult | undefined): Finding[] {
  const itKw = sizing.itKw;
  const tier = str(p, 'tier', 'Tier III'), red = str(p, 'redundancy', '2N');
  const feedsKw = sizing.plant.filter(x => x.kind === 'feed').reduce((a, x) => a + x.capacityKw * x.count, 0);
  const upsKw = sizing.plant.filter(x => x.kind === 'ups').reduce((a, x) => a + x.capacityKw * x.count, 0);
  const genKw = sizing.plant.filter(x => x.kind === 'generator').reduce((a, x) => a + x.capacityKw * x.count, 0);
  const prof = dcTypeProfile(plan.dcTypeKey);
  const bmPue = benchmarks.find(b => b.metric === 'pue' && b.appliesTo.coolingType === sizing.cooling.type && b.appliesTo.climate === plan.climate);
  const out: Finding[] = [];
  for (const r of rules) {
    const F = (status: Finding['status'], detail: string, value?: string) => out.push({ rule: r, status, detail, value });
    // The plan type's family answers the checks it owns (real site data, waves, paths…).
    const owned = scopeCheck?.(r);
    if (owned) { F(owned.status, owned.detail, owned.value); continue; }
    const skipPlant = itKw === 0;
    switch (r.check) {
      case 'feeds-cover-load': if (skipPlant) F('n/a', 'No facility load in scope'); else F(feedsKw >= itKw * (r.threshold ?? 1.1) ? 'pass' : 'fail', `Feeds ${feedsKw.toLocaleString('en-US')} kW against ${itKw.toLocaleString('en-US')} kW × ${r.threshold}`, `${r0((feedsKw / Math.max(1, itKw)) * 100)}%`); break;
      case 'ups-redundancy': if (skipPlant) F('n/a', 'No facility load in scope'); else F((red === 'N' ? upsKw >= itKw : upsKw >= itKw * 1.15) ? 'pass' : 'fail', `${red}: UPS ${upsKw.toLocaleString('en-US')} kW for ${itKw.toLocaleString('en-US')} kW`); break;
      case 'generator-margin': if (skipPlant) F('n/a', 'No facility load in scope'); else F(genKw >= itKw * (r.threshold ?? 1.25) ? 'pass' : 'warn', `Generators ${genKw.toLocaleString('en-US')} kW`, `${r0((genKw / Math.max(1, itKw)) * 100)}%`); break;
      case 'fuel-hours': { const need = tier === 'Tier IV' ? 48 : (r.threshold ?? 24); const h = num(p, 'generatorFuelHours', 0); if (skipPlant) F('n/a', 'No facility load in scope'); else F(h >= need ? 'pass' : h === 0 ? 'warn' : 'warn', `${h} h on site, ${need} h expected for ${tier}`, `${h} h`); break; }
      case 'cooling-n1': if (skipPlant) F('n/a', 'No facility load in scope'); else F(sizing.cooling.capacityKw - sizing.cooling.unitKw >= itKw * (r.threshold ?? 1.1) ? 'pass' : 'fail', `${sizing.cooling.units} × ${sizing.cooling.unitKw} kW; with one lost ${(sizing.cooling.capacityKw - sizing.cooling.unitKw).toLocaleString('en-US')} kW`); break;
      case 'liquid-above-density': { const d = num(p, 'densityKwPerRack'); const liquid = ['liquid-to-chip', 'immersion', 'rear-door'].includes(sizing.cooling.type); F(d > (r.threshold ?? 30) && !liquid ? 'fail' : 'pass', `${d} kW per rack with ${sizing.cooling.type}`); break; }
      case 'inlet-envelope': { const t = num(p, 'inletSetpointC', 24); F(t <= (r.threshold ?? 27) ? 'pass' : ['liquid-to-chip', 'immersion'].includes(sizing.cooling.type) ? 'pass' : 'warn', `${t} °C setpoint${t > 27 ? ' (allowed for liquid-cooled halls)' : ''}`); break; }
      case 'hall-load-band': { const h = num(p, 'hallDesignKw'); const pMin = prof?.powerKw?.[0] ?? 200; const band = pMin < 200 ? [10, prof?.highDensity ? 6000 : 2000] : prof?.highDensity ? [1000, 6000] : prof?.segment === 'Telco' ? [100, 2000] : [200, 4000]; if (skipPlant) F('n/a', 'No halls in scope'); else F(h >= band[0] && h <= band[1] ? 'pass' : 'fail', `${h} kW per hall; band ${band[0]} to ${band[1]} for ${prof?.name ?? plan.dcTypeKey}`); break; }
      case 'floor-loading': { const need = sizing.cooling.liquidRequired || ['liquid-to-chip', 'immersion'].includes(sizing.cooling.type) ? (r.threshold ?? 1400) : 900; const f = num(p, 'floorLoadingKgPerRack', 1000); if (skipPlant) F('n/a', 'No racks in scope'); else F(f >= need ? 'pass' : 'warn', `${f} kg per rack; ${need} needed`); break; }
      case 'carrier-diversity': if (plan.scope === 'migration') F('n/a', 'Site is being emptied'); else if (['rack', 'pod', 'hall', 'retrofit', 'plant', 'server-refresh', 'network-refresh', 'rack-replace'].includes(plan.scope)) F('n/a', 'Carrier entries are a property of the existing site'); else F(num(p, 'carrierCount', 1) >= (r.threshold ?? 2) ? 'pass' : 'fail', `${num(p, 'carrierCount', 1)} carriers`); break;
      case 'oversub-gpu': F(plan.demand.gpuPct >= 40 && num(p, 'oversubscription', 3) > (r.threshold ?? 3) ? 'warn' : 'pass', `${num(p, 'oversubscription', 3)}:1 with ${plan.demand.gpuPct}% GPU`); break;
      case 'tier-redundancy': { const ok = tier === 'Tier IV' ? ['2N', '2N+1'].includes(red) : tier === 'Tier III' ? red !== 'N' : true; F(ok ? 'pass' : 'fail', `${tier} with ${red} power`); break; }
      case 'pue-benchmark': F(!bmPue ? 'n/a' : sizing.pue.value <= (bmPue.high ?? 9) + 0.1 ? 'pass' : 'warn', bmPue ? `Target ${sizing.pue.value} against ${bmPue.low} to ${bmPue.high} (${bmPue.source})` : 'No benchmark for this cooling type and climate'); break;
      case 'capex-benchmark': F(!est.benchmarkBand || itKw === 0 || !WHOLE_SITE_SCOPES.includes(plan.scope) ? 'n/a' : est.capexPerKw <= est.benchmarkBand.high * 1.05 && est.capexPerKw >= est.benchmarkBand.low * 0.8 ? 'pass' : 'warn', !WHOLE_SITE_SCOPES.includes(plan.scope) ? 'Whole-site benchmark; this scope is estimated bottom-up' : est.benchmarkBand ? `${est.capexPerKw.toLocaleString('en-US')} USD/kW against ${est.benchmarkBand.low.toLocaleString('en-US')} to ${est.benchmarkBand.high.toLocaleString('en-US')}` : 'No benchmark'); break;
      case 'payback': F(est.paybackMonths === null ? (plan.revenuePerKwMonth ? 'warn' : 'n/a') : est.paybackMonths <= (r.threshold ?? 96) ? 'pass' : 'warn', est.paybackMonths === null ? 'No positive margin at the entered revenue' : `${est.paybackMonths} months`); break;
      case 'lead-times': { const late = schedule.filter(s => s.late); F(late.length ? 'fail' : 'pass', late.length ? `${late.length} item(s) cannot arrive before the need date: ${late.map(l => l.item).join(', ')}` : 'All long-lead items fit the phase dates'); break; }
      case 'civil-before-fitout': F(plan.scope === 'new-dc' || plan.scope === 'expansion' ? 'pass' : 'n/a', 'Fit-out projects depend on the shell milestone in the blueprint'); break;
      case 'staffing': { const b = benchmarks.find(x => x.metric === 'staffPerMw' && x.appliesTo.tier === tier); F(!b || itKw === 0 ? 'n/a' : sizing.staffing.perMw >= (b.low ?? 0) && sizing.staffing.perMw <= (b.high ?? 9) ? 'pass' : 'warn', b ? `${sizing.staffing.perMw} FTE per MW against ${b.low} to ${b.high}` : 'No benchmark'); break; }
      case 'permits-before-gates': { const bad = plan.permits.filter(pm => pm.status === 'Expired' || (pm.status === 'Not started' && new Date(pm.neededBefore).getTime() - pm.leadWeeks * 7 * 864e5 < Date.now())); F(bad.length ? 'fail' : 'pass', bad.length ? `${bad.map(b => b.name).join(', ')} cannot be obtained in time` : `${plan.permits.length} permit(s) on track`); break; }
      case 'commissioning-level': { const need = COMMISSIONING_REQUIRED[plan.scope]; const have = num(p, 'commissioningLevel', 5); F(have >= need ? 'pass' : 'fail', `Level ${have} planned, level ${need} required for ${SCOPE_LABEL[plan.scope].toLowerCase()}`); break; }
      case 'risk-owners': { const bad = plan.risks.filter(rk => rk.impact === 'High' && (!rk.owner || !rk.mitigation)); F(bad.length ? 'warn' : 'pass', bad.length ? `${bad.length} high-impact risk(s) without owner or mitigation` : `${plan.risks.length} risk(s), all owned`); break; }
      case 'reporting-enabled': F('pass', 'Energy and PUE reporting enabled by the sustainability module'); break;
      default: F('n/a', 'No check implemented for this rule');
    }
  }
  return out;
}

export interface ScheduleItem { item: string; leadWeeks: number; needBy: string; orderBy: string; late: boolean; phase: string; kind: 'equipment' | 'gate' | 'permit'; phaseId?: string; /** Where the items come from: stock needs only a transfer, procurement the full lead time. */ source?: 'stock' | 'site' | 'procure' | 'mixed'; note?: string }
export function schedule(plan: T.PlannerPlan, sizing: Sizing, benchmarks: T.PlannerBenchmark[], p: Record<string, Sourced<ParamValue>>): ScheduleItem[] {
  const now = Date.now();
  const first = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive))[0];
  if (!first) return [];
  const goLive = new Date(first.goLive).getTime();
  const contingency = 1 + num(p, 'contingencyPct', 15) / 100;
  const items: ScheduleItem[] = [];
  const lead = (name: string) => benchmarks.find(b => b.metric === `leadWeeks:${name}`);
  const need = (weeksBeforeGoLive: number) => goLive - weeksBeforeGoLive * 7 * 864e5;
  const ordered = ['Approved', 'Executing', 'Completed'].includes(plan.status);
  const add = (item: string, bmName: string, weeksBefore: number, kind: ScheduleItem['kind'] = 'equipment') => {
    const b = lead(bmName); const weeks = r0((b?.high ?? b?.value ?? 8) * contingency);
    const needBy = need(weeksBefore); const orderBy = needBy - weeks * 7 * 864e5;
    items.push({ item, leadWeeks: weeks, needBy: new Date(needBy).toISOString(), orderBy: new Date(orderBy).toISOString(), late: !ordered && orderBy < now, phase: first.name, kind });
  };
  if (sizing.itKw > 0 && ['new-dc', 'expansion', 'plant', 'hall', 'retrofit', 'pod', 'edge', 'portfolio'].includes(plan.scope)) {
    if (['new-dc', 'expansion', 'plant', 'portfolio'].includes(plan.scope)) { add('Transformers', 'Transformer (33 kV)', 30); add('Generators', 'Generator (2.5 MVA)', 26); add('Switchgear', 'Switchgear', 24); add('UPS modules', 'UPS (1 MW module)', 20); add('Chillers', 'Chiller', 20); }
    add(sizing.cooling.type === 'liquid-to-chip' ? 'CDUs' : 'CRAH or in-row units', 'CRAH / CDU', 14);
    add('PDUs', 'PDU', 12); add('Racks and containment', 'Racks and containment', 10); add('Spine and leaf switches', 'Spine / leaf switches', 10); add('Optics', 'Optics (400G)', 8); add('Fibre trunks', 'Fibre trunks', 8);
    if (bool(p, 'operatorOwnedIt', true)) add(plan.demand.gpuPct >= 40 ? 'GPU servers' : 'Servers', plan.demand.gpuPct >= 40 ? 'GPU servers' : 'General servers', 4);
  }
  if (plan.scope === 'network') { add('Optics', 'Optics (400G)', 4); add('Line cards', 'Spine / leaf switches', 6); }
  if (plan.scope === 'server-refresh') add(/XE9680|DGX|821GE/.test(str(p, 'replacementModel')) ? 'GPU servers' : 'Servers', /XE9680|DGX|821GE/.test(str(p, 'replacementModel')) ? 'GPU servers' : 'General servers', 2);
  if (plan.scope === 'network-refresh') { add('Switches and routers', 'Spine / leaf switches', 2); add('Optics', 'Optics (400G)', 1); }
  if (plan.scope === 'rack-replace') { add('Racks', 'Racks and containment', 2); add('Rack power strips', 'PDU', 2); }
  for (const pm of plan.permits) { const needBy = new Date(pm.neededBefore).getTime(); const orderBy = needBy - pm.leadWeeks * 7 * 864e5; items.push({ item: `Permit · ${pm.name}`, leadWeeks: pm.leadWeeks, needBy: pm.neededBefore, orderBy: new Date(orderBy).toISOString(), late: !ordered && pm.status === 'Not started' && orderBy < now, phase: first.name, kind: 'permit' }); }
  const gates: [string, number][] = plan.scope === 'new-dc' ? [['Shell complete (civil input)', 36], ['Power on', 20], ['Cooling commissioned', 12], ['Network live', 6], ['Go-live readiness', 1]] : plan.scope === 'expansion' ? [['Shell complete (civil input)', 28], ['Power on', 16], ['Commissioning level 5', 4], ['Go-live readiness', 1]] : plan.scope === 'rack' ? [['Change approved', 1]] : [['Design review', 12], ['Commissioning complete', 2], ['Go-live readiness', 1]];
  for (const [g, w] of gates) items.push({ item: g, leadWeeks: 0, needBy: new Date(need(w)).toISOString(), orderBy: new Date(need(w)).toISOString(), late: false, phase: first.name, kind: 'gate' });
  return items.sort((a, b) => a.orderBy.localeCompare(b.orderBy));
}

export interface Sustainability { pue: number; wue: number; energyMwhYear: number; carbonTYear: number; renewableSharePct: number; heatReuseMwhYear: number }
export function sustainability(plan: T.PlannerPlan, p: Record<string, Sourced<ParamValue>>, sizing: Sizing, est: Estimate, benchmarks: T.PlannerBenchmark[]): Sustainability {
  const carbon = benchmarks.find(b => b.metric === 'carbonKgPerKwh')?.value ?? 0.38;
  const renewable = num(p, 'renewableSharePct', 50);
  const wue = ['liquid-to-chip', 'immersion'].includes(sizing.cooling.type) ? 0.15 : sizing.cooling.type === 'chilled-water' ? 0.9 : sizing.cooling.type === 'air-economiser' ? 0.4 : 0.6;
  return { pue: sizing.pue.value, wue, energyMwhYear: est.energyMwhYear, carbonTYear: r0((est.energyMwhYear * 1000 * carbon * (1 - renewable / 100)) / 1000), renewableSharePct: renewable, heatReuseMwhYear: ['liquid-to-chip', 'immersion'].includes(sizing.cooling.type) ? r0(est.energyMwhYear * 0.35) : 0 };
}

export interface AspectScore { aspect: T.PlannerAspect; depth: T.PlannerAspectDepth; answered: number; total: number; pct: number; findings: Finding[] }
/** Readiness: a parameter the planner confirmed (entered, benchmark, actual, document or accepted AI) counts in full; a template default still in place counts half; a parameter with no value at all counts nothing. */
export function aspectScores(resolved: ResolvedTemplate | null, plan: T.PlannerPlan, findings: Finding[], effective?: Record<string, Sourced<ParamValue>>): AspectScore[] {
  const req = resolved?.template.requiredAspects ?? [];
  const params = resolved?.params ?? [];
  return req.filter(r => r.depth !== 'skipped').map(r => {
    const keys = params.filter(x => x.aspect === r.aspect).map(x => x.key);
    const answered = keys.reduce((a, k) => a + (plan.params[k] !== undefined ? 1 : effective?.[k] !== undefined ? 0.5 : 0), 0);
    const extra = r.aspect === 'risk' ? (plan.risks.length ? 1 : 0) : r.aspect === 'compliance' ? (plan.permits.length ? 1 : 0) : r.aspect === 'schedule' ? (plan.phases.length ? 1 : 0) : 0;
    const total = keys.length + (['risk', 'compliance', 'schedule'].includes(r.aspect) ? 1 : 0);
    return { aspect: r.aspect, depth: r.depth, answered: Math.round(answered + extra), total, pct: total ? r0(((answered + extra) / total) * 100) : 100, findings: findings.filter(f => f.rule.aspect === r.aspect) };
  });
}

export interface Evaluation {
  params: Record<string, Sourced<ParamValue>>; resolved: ResolvedTemplate | null; sizing: Sizing; ladder: LadderRow[]; estimate: Estimate; findings: Finding[]; schedule: ScheduleItem[]; sustainability: Sustainability; aspects: AspectScore[];
  hardFails: number; softWarns: number; readinessPct: number; bindingConstraint: LadderRow['bindingConstraint'];
  /** Everything the hooks saw: the plan, the platform data and the site baselines (when loaded). */
  ctx: ScopeCtx;
  /** Results computed by the plan type's family (see lib/scopes); read with the family's own getters. */
  scope: Record<string, unknown>;
}
/**
 * Evaluate a plan. `data` is the platform data (see plannerData.ts); without it the engine
 * still runs, but checks against the real site are reported as not checked.
 */
export function evaluate(plan: T.PlannerPlan, scenario: T.PlannerScenario | null | undefined, templates: T.PlannerTemplate[], benchmarks: T.PlannerBenchmark[], actuals?: EstateActuals, data?: PlannerData): Evaluation {
  const resolved = resolveTemplate(plan.templateId, templates);
  const profile = templates.find(t => t.kind === 'profile' && t.dcTypeKey === plan.dcTypeKey) ?? null;
  const params = effectiveParams(resolved, plan, scenario, profile);
  const ctx: ScopeCtx = {
    plan, scenario, params, templates, benchmarks, actuals, data,
    site: data && plan.dataCenterId ? siteBaseline(data, plan.dataCenterId, { excludePlanId: plan.id }) : undefined,
    peerSite: data && plan.peerDataCenterId ? siteBaseline(data, plan.peerDataCenterId, { excludePlanId: plan.id }) : undefined,
    campus: data && plan.campusId && plan.scope === 'expansion' ? campusBaseline(data, plan.campusId, { excludePlanId: plan.id }) : undefined,
  };
  const model = modelFor(plan.scope);
  let sizing = size(plan, params, benchmarks, actuals);
  if (model.size) sizing = model.size(ctx, sizing);
  let ladder = capacityLadder(plan, params, sizing);
  if (model.ladder) ladder = model.ladder(ctx, sizing, ladder);
  let est = estimate(plan, params, sizing, benchmarks, actuals);
  if (model.estimate) est = model.estimate(ctx, sizing, est);
  let sched = schedule(plan, sizing, benchmarks, params);
  if (model.schedule) sched = model.schedule(ctx, sizing, sched);
  const sus = sustainability(plan, params, sizing, est, benchmarks);
  const ev: Evaluation = { params, resolved, sizing, ladder, estimate: est, findings: [], schedule: sched, sustainability: sus, aspects: [], hardFails: 0, softWarns: 0, readinessPct: 0, bindingConstraint: 'none', ctx, scope: {} };
  if (model.analyse) ev.scope = model.analyse(ctx, ev);
  const findings = evaluateRules(resolved?.rules ?? [], plan, params, sizing, est, benchmarks, sched, model.check ? (rule => model.check!(ctx, rule, ev)) : undefined);
  const aspects = aspectScores(resolved, plan, findings, params);
  ev.findings = findings; ev.aspects = aspects;
  ev.hardFails = findings.filter(f => f.status === 'fail').length; ev.softWarns = findings.filter(f => f.status === 'warn').length;
  ev.readinessPct = aspects.length ? r0(aspects.reduce((a, x) => a + x.pct, 0) / aspects.length) : 0;
  ev.bindingConstraint = ladder.find(l => l.bindingConstraint !== 'none')?.bindingConstraint ?? 'none';
  return ev;
}

export const ASPECT_LABEL: Record<T.PlannerAspect, string> = { space: 'Space and layout', power: 'Power', cooling: 'Cooling and thermal', network: 'Network and connectivity', it: 'Compute, storage and GPU', fire: 'Fire, life safety and water', security: 'Physical security', sustainability: 'Environment and sustainability', resilience: 'Resilience and tier', operations: 'Operations and staffing', supply: 'Supply chain', schedule: 'Schedule and dependencies', finance: 'Finance', compliance: 'Compliance and permits', commissioning: 'Commissioning and handover', migration: 'Migration and cut-over', risk: 'Risk' };
export const SCOPE_LABEL: Record<T.PlannerScope, string> = { rack: 'Rack placement', pod: 'Pod, row or cage', hall: 'Hall fit-out', retrofit: 'Densification or liquid retrofit', plant: 'Plant upgrade', network: 'Network uplift', expansion: 'Site expansion', 'new-dc': 'New data centre', portfolio: 'Regional portfolio', migration: 'Migration or decommission', edge: 'Edge rollout' , 'server-refresh': 'Server refresh or replacement', 'network-refresh': 'Network device refresh', 'rack-replace': 'Rack replacement' };
export const SOURCE_LABEL: Record<T.PlannerParamSource, string> = { user: 'Entered', requirement: 'From your requirements', template: 'Template default', benchmark: 'Benchmark', actual: 'Estate actual', document: 'From document', ai: 'AI proposal' };
export const fmtUsd = (n: number) => (Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${Math.round(n)}`);
export const fmtKw = (kw: number) => (kw >= 1000 ? `${(kw / 1000).toFixed(kw >= 10000 ? 0 : 1)} MW` : `${Math.round(kw)} kW`);
export { r0, r1, r2 };
