/**
 * Plan outputs — what a plan turns into so it can be built.
 *
 *  - Bill of materials: every item the sizing implies, with quantity, unit cost, lead time and phase.
 *  - IP and network plan: aggregate, per-hall subnets and VLANs, loopbacks, point-to-point pools, ASNs, DCI.
 *  - Basis of design: the plan document, section by section, with the source of each figure.
 *  - Initiation pack: the delivery vehicle (programme, project or change), its projects and gates,
 *    long-lead orders, permits to file, design documents and the work order to start.
 *
 * All builders are pure: the Plan pack tab renders them, and approval (usePlannerActions.execute)
 * writes the same objects into procurement, IPAM, permits, design documents and delivery.
 */
import type * as T from '../../../mock/data/types';
import type { ProjectTemplate } from '../../../mock/data/enums';
import { DC_TYPE_CATALOG } from '../../../mock/data/dcTypes';
import { getBlueprint } from '../../delivery/lib/programBlueprints';
import { CATALOGUE, kindOfModel, priceOf, type ItemKind } from './catalogue';
import { ASPECT_LABEL, SCOPE_LABEL, SOURCE_LABEL, fmtKw, fmtUsd, type Evaluation } from './engine';
import { modelFor } from './scopes';

const r0 = (n: number) => Math.round(n);
const num = (ev: Evaluation, k: string, d = 0) => { const v = ev.params[k]?.value; return typeof v === 'number' ? v : Number(v ?? d) || d; };

/* ================================================================== bill of materials */
export type BomCategory = 'Power' | 'Cooling' | 'Network' | 'Cabling' | 'Racks and containment' | 'Compute and storage' | 'Fire and security' | 'Monitoring';
export interface BomItem { id: string; kind: ItemKind; category: BomCategory; item: string; spec: string; qty: number; unit: string; unitCost: number; total: number; leadWeeks?: number; leadItem?: string; partNumber: string; manufacturer: string; /** Phase, wave or stage the line is needed for (purchase orders are raised per phase). */ phaseId?: string; needBy?: string; /** Site the line goes to (edge, portfolio, network ends). */ siteRef?: string; /** Service charges billed monthly (carrier circuits) rather than bought. */ monthly?: boolean; model?: string }
export interface Bom { lines: BomItem[]; total: number; byCategory: { category: BomCategory; total: number; lines: number }[]; capexCompared: number; coveragePct: number }

export const REPLACE_SCOPES: T.PlannerScope[] = ['server-refresh', 'network-refresh', 'rack-replace'];
/** Item name → catalogue kind, so sourcing can match each line to a model, vendor and stock. */
const ITEM_KIND: Record<string, ItemKind> = {
  Transformer: 'transformer', 'Diesel generator': 'generator', 'UPS system': 'ups', 'Power distribution unit': 'pdu', 'Medium-voltage switchgear': 'switchgear', 'Utility connection': 'utility', 'Rack power strips': 'rack-pdu',
  'UPS per site': 'ups-small', 'Generator per site': 'generator-small', 'Cooling per site': 'cooling-small', 'Prefabricated enclosure': 'enclosure',
  'Computer room air handler': 'crah', 'Coolant distribution unit': 'cdu', 'In-row cooler': 'inrow', 'Rear-door heat exchanger': 'reardoor', Chiller: 'chiller', 'Secondary fluid network': 'sfn', 'Floor reinforcement': 'floor',
  Rack: 'rack', 'Aisle containment': 'containment', Cage: 'cage', 'Leaf switch': 'leaf', 'Spine switch': 'spine', 'Core router': 'core', Optics: 'optics', 'DCI line system': 'dci', 'Out-of-band switch': 'oob', 'Patch and cross-connects': 'patch',
  'Fibre trunk': 'fibre', 'Copper and DAC': 'dac', 'White space fit-out': 'fitout', 'Electrical installation': 'install', 'Mechanical installation': 'install', 'Installation and integration': 'install', 'Move services': 'move', 'Certified data disposal': 'disposal',
  'Suppression system': 'suppression', 'Very early smoke detection': 'vesda', 'Access control and CCTV': 'access', 'Building management and DCIM sensors': 'bms',
};

/** Unit costs are indicative list prices; the planner calibrates totals against the CapEx estimate. */
export function buildBom(plan: T.PlannerPlan, ev: Evaluation, benchmarks: T.PlannerBenchmark[]): Bom {
  const s = ev.sizing; const lines: BomItem[] = [];
  const lead = (name: string) => { const b = benchmarks.find(x => x.metric === `leadWeeks:${name}`); return b ? r0(b.high ?? b.value ?? 0) : undefined; };
  const add = (category: BomCategory, item: string, spec: string, qty: number, unit: string, unitCost: number, leadItem?: string, manufacturer = 'To tender', kind?: ItemKind) => {
    if (qty <= 0) return;
    lines.push({ id: `B${lines.length + 1}`, kind: kind ?? ITEM_KIND[item] ?? 'install', category, item, spec, qty: r0(qty), unit, unitCost: r0(unitCost), total: r0(qty * unitCost), leadItem, leadWeeks: leadItem ? lead(leadItem) : undefined, partNumber: `${category.slice(0, 3).toUpperCase()}-${String(lines.length + 1).padStart(3, '0')}`, manufacturer });
  };
  // The plan type's family emits its own lines; when they are the whole bill, the generic lines are skipped.
  const model = modelFor(plan.scope);
  const own = model.bom ? model.bom(ev, l => {
    if (l.qty <= 0) return;
    const n = lines.length + 1;
    lines.push({ ...l, id: `B${n}`, qty: r0(l.qty), unitCost: r0(l.unitCost), total: r0(r0(l.qty) * l.unitCost), leadWeeks: l.leadWeeks ?? (l.leadItem ? lead(l.leadItem) : undefined), partNumber: l.partNumber ?? `${l.category.slice(0, 3).toUpperCase()}-${String(n).padStart(3, '0')}` });
  }) : false;
  if (!own) genericLines();
  return finishBom(lines, ev);

  function genericLines() {
  const builds = plan.scope === 'new-dc' || plan.scope === 'expansion' || plan.scope === 'portfolio';
  const facility = s.itKw > 0 && plan.scope !== 'network' && plan.scope !== 'migration';

  const plantItems = String(ev.params['plantItems']?.value ?? 'Mixed');
  const wants = (kind: string) => plan.scope !== 'plant' || plantItems === 'Mixed' || plantItems.toLowerCase().startsWith(kind);

  // Edge: many small sites, each with its own small plant.
  if (plan.scope === 'edge') {
    const sites = Math.max(1, s.sites || s.halls); const perSiteKw = s.itKw / sites;
    add('Power', 'UPS per site', `${fmtKw(perSiteKw * 1.25)} modular`, sites, 'site', Math.max(15000, perSiteKw * 1.25 * 420), 'UPS (1 MW module)');
    add('Power', 'Generator per site', `${fmtKw(perSiteKw * 1.5)} with auto transfer`, sites, 'site', Math.max(30000, perSiteKw * 1.5 * 600), 'Generator (2.5 MVA)');
    add('Cooling', 'Cooling per site', `${s.cooling.type === 'air-crah' ? 'Direct expansion units' : 'Close-coupled units'}, N+1`, sites * 2, 'unit', Math.max(12000, perSiteKw * 350), 'CRAH / CDU');
    add('Racks and containment', 'Prefabricated enclosure', 'Weatherproof, fire rated', sites, 'site', 85000);
  }
  // Replacement plans: new equipment for the affected devices or racks, services and disposal.
  if (plan.scope === 'server-refresh' || plan.scope === 'network-refresh' || plan.scope === 'rack-replace') {
    const affected = num(ev, 'affectedCount', 0); const disposal = String(ev.params['oldEquipment']?.value ?? 'Certified disposal') === 'Certified disposal';
    if (plan.scope === 'rack-replace') {
      const racks = num(ev, 'affectedRacks', affected); const model = String(ev.params['rackModel']?.value ?? 'NetShelter SX 48U');
      add('Racks and containment', 'Rack', model, racks, 'each', priceOf(model) ?? 3800, 'Racks and containment', CATALOGUE.rack.options.find(o => o.model === model)?.manufacturer ?? 'APC', 'rack');
      if (ev.params['replacePdus']?.value !== false) add('Power', 'Rack power strips', 'Geist rPDU 3-phase, A and B feed', racks * 2, 'each', priceOf('Geist rPDU 3-phase') ?? 1400, 'PDU', 'Vertiv', 'rack-pdu');
      if (ev.params['reRack']?.value !== false) add('Racks and containment', 'Move services', 'De-rack and re-rack, per device', num(ev, 'affectedDevices', racks * 12), 'device', 150, undefined, 'NetBuild Corp', 'move');
      if (disposal) add('Fire and security', 'Certified data disposal', 'Old racks removed and recycled', racks, 'rack', 200, undefined, 'CBRE Data Center Solutions', 'disposal');
    } else {
      const model = String(ev.params['replacementModel']?.value ?? (plan.scope === 'server-refresh' ? 'PowerEdge R760' : '7050X3-48YC8'));
      const units = plan.scope === 'server-refresh' ? Math.ceil(affected / Math.max(1, num(ev, 'consolidationRatio', 2))) : affected;
      const kind = kindOfModel(model) ?? (plan.scope === 'server-refresh' ? 'server' : 'leaf');
      add(plan.scope === 'server-refresh' ? 'Compute and storage' : 'Network', CATALOGUE[kind].label, `${model}, replacing ${affected} old device${affected === 1 ? '' : 's'}`, units, 'each', priceOf(model) ?? 15000, plan.scope === 'server-refresh' ? (kind === 'gpu-server' ? 'GPU servers' : 'General servers') : 'Spine / leaf switches', CATALOGUE[kind].options.find(o => o.model === model)?.manufacturer ?? 'To tender', kind);
      if (plan.scope === 'network-refresh') add('Network', 'Optics', '400G transceivers not reused', Math.round(affected * 8 * (1 - num(ev, 'opticsReusePct', 60) / 100)), 'each', 1200, 'Optics (400G)', 'Corning', 'optics');
      add('Cabling', 'Copper and DAC', 'Rails, cables and labels', units, 'unit', 350, undefined, 'Corning', 'dac');
      add('Racks and containment', 'Move services', `${String(ev.params['migrationApproach']?.value ?? 'Rolling, rack by rack')}, per old device`, affected, 'device', plan.scope === 'server-refresh' ? 250 : 300, undefined, 'NetBuild Corp', 'move');
      if (disposal) add('Fire and security', 'Certified data disposal', 'Wipe or shred with certificate', affected, 'device', 120, undefined, 'CBRE Data Center Solutions', 'disposal');
    }
  }
  // Power
  if (facility && plan.scope !== 'rack' && plan.scope !== 'edge' && !REPLACE_SCOPES.includes(plan.scope)) {
    for (const p of s.plant) {
      if (p.kind === 'transformer' && (builds || plan.scope === 'plant') && wants('transformer')) add('Power', 'Transformer', p.name, p.count, 'each', 120000, 'Transformer (33 kV)');
      if (p.kind === 'generator' && (builds || plan.scope === 'plant') && wants('generator')) add('Power', 'Diesel generator', `${fmtKw(p.capacityKw)} prime, ${p.redundancy}`, p.count, 'each', 900000, 'Generator (2.5 MVA)');
      if (p.kind === 'ups' && wants('ups')) add('Power', 'UPS system', `${p.name}, ${fmtKw(p.capacityKw)}`, p.count, 'system', p.capacityKw * 350, 'UPS (1 MW module)');
      if (p.kind === 'pdu' && plan.scope !== 'plant') add('Power', 'Power distribution unit', `${p.name}, ${fmtKw(p.capacityKw)}`, p.count, 'each', 28000, 'PDU');
    }
    if (builds || (plan.scope === 'plant' && (plantItems === 'Mixed' || plantItems === 'Transformers'))) add('Power', 'Medium-voltage switchgear', 'A and B line-ups', Math.max(2, Math.ceil(s.itKw / 5000) * 2), 'line-up', 250000, 'Switchgear');
    if (builds) add('Power', 'Utility connection', `${fmtKw(s.itKw * 1.3)} capacity`, Math.ceil((s.itKw * 1.3) / 1000), 'MW', 150000);
    if (plan.scope !== 'plant') add('Power', 'Rack power strips', 'Two per rack, metered', s.racks * 2, 'each', 1200);
  }
  if (plan.scope === 'rack') add('Power', 'Rack power strips', 'Two per rack, metered, A and B feed', s.racks * 2, 'each', 1200, 'PDU');

  // Cooling
  if (facility && plan.scope !== 'rack' && plan.scope !== 'edge' && !REPLACE_SCOPES.includes(plan.scope) && (plan.scope !== 'plant' || wants('chiller') || plantItems === 'Mixed')) {
    const c = s.cooling;
    const unit = c.type === 'liquid-to-chip' || c.type === 'immersion' ? ['Coolant distribution unit', 350000] as const : c.type === 'in-row' ? ['In-row cooler', 25000] as const : c.type === 'rear-door' ? ['Rear-door heat exchanger', 18000] as const : ['Computer room air handler', 85000] as const;
    if (plan.scope !== 'plant') add('Cooling', unit[0], `${fmtKw(c.unitKw)} each, ${c.redundancy}`, c.units, 'each', unit[1], 'CRAH / CDU');
    if ((builds || plan.scope === 'plant') && c.type !== 'air-economiser') add('Cooling', 'Chiller', '1.5 MW, magnetic bearing', Math.ceil((s.itKw * 1.2) / 1500) + 1, 'each', 600000, 'Chiller');
    if (c.type === 'liquid-to-chip' || c.type === 'immersion') add('Cooling', 'Secondary fluid network', 'Manifolds, valves, leak detection', s.racks, 'rack', 6500);
    if (plan.scope === 'retrofit') add('Cooling', 'Floor reinforcement', 'For liquid-cooled racks', Number(ev.params['liquidRacks']?.value ?? s.racks), 'rack', 4000);
  }

  // Racks and containment
  if (s.racks > 0 && plan.scope !== 'network' && plan.scope !== 'plant' && plan.scope !== 'migration' && !REPLACE_SCOPES.includes(plan.scope)) {
    add('Racks and containment', 'Rack', `${num(ev, 'rackUnitsNeeded', 48) > 42 ? '48U' : '42U'}, 800 × 1200 mm`, s.racks, 'each', 3500, 'Racks and containment', 'APC / Vertiv / Rittal');
    if (plan.scope !== 'rack') add('Racks and containment', 'Aisle containment', 'Cold-aisle doors and roof', Math.ceil(s.racks / 20), 'row', 18000, 'Racks and containment');
    if (plan.scope === 'pod' && ev.params['cageRequired']?.value) add('Racks and containment', 'Cage', 'Mesh partition with badge door', 1, 'cage', 45000);
  }

  // Network
  // A rack plugs into the existing fabric (patching only); a pod brings its own leaves but uses the existing spines.
  const podOnly = plan.scope === 'pod';
  if ((s.network.leaves > 0 && !['migration', 'plant', 'rack', ...REPLACE_SCOPES].includes(plan.scope)) || plan.scope === 'network') {
    const fast = s.network.uplinkGbps >= 800;
    if (s.network.leaves) add('Network', 'Leaf switch', `${fast ? '800G' : '400G'} uplinks, 48 × 100G down`, s.network.leaves, 'each', fast ? 70000 : 40000, 'Spine / leaf switches');
    if (s.network.spines && !podOnly) add('Network', 'Spine switch', `64 × ${fast ? '800G' : '400G'}`, s.network.spines, 'each', fast ? 150000 : 90000, 'Spine / leaf switches');
    if (s.network.cores && builds) add('Network', 'Core router', 'Edge and DCI', s.network.cores, 'each', 250000, 'Spine / leaf switches');
    add('Network', 'Optics', `${fast ? '800G' : '400G'} transceivers`, podOnly ? s.network.uplinks * 2 : s.network.uplinks * 2 + s.network.cores * 8, 'each', fast ? 2500 : 1200, 'Optics (400G)');
    if (plan.scope === 'network') add('Network', 'DCI line system', `${s.network.dciGbps.toLocaleString('en-US')} Gbps over ${num(ev, 'diversePaths', 2)} diverse paths`, num(ev, 'diversePaths', 2), 'path', 420000, 'Optics (400G)');
    add('Network', 'Out-of-band switch', 'Management network', Math.max(1, Math.ceil(s.racks / 16)), 'each', 4500);
  }
  if (plan.scope === 'rack') add('Network', 'Patch and cross-connects', `${num(ev, 'portsPerRack', 4)} ports per rack`, s.racks * num(ev, 'portsPerRack', 4), 'port', 350);

  // Cabling
  if (s.network.leaves > 0 && !['migration', 'plant', 'network', 'rack', ...REPLACE_SCOPES].includes(plan.scope)) { add('Cabling', 'Fibre trunk', 'MPO-24, leaf to spine', s.network.leaves * 2, 'each', 1500, 'Fibre trunks'); add('Cabling', 'Copper and DAC', 'In-rack server cabling', s.racks, 'rack', 800); }

  // Compute and storage
  if (ev.params['operatorOwnedIt']?.value === true && s.racks > 0 && !['plant', 'network', 'migration', ...REPLACE_SCOPES].includes(plan.scope)) {
    const price: Record<string, number> = { GPU: 650000, Compute: 180000, Storage: 120000 };
    for (const c of s.rackClasses) add('Compute and storage', `${c.name} racks`, `${c.kw} kW per rack, fully populated`, c.racks, 'rack', price[c.name] ?? 180000, c.name === 'GPU' ? 'GPU servers' : 'General servers', c.name === 'GPU' ? 'NVIDIA partner' : 'To tender', c.name === 'GPU' ? 'gpu-server' : c.name === 'Storage' ? 'storage' : 'server');
  }

  // Fit-out and installation works where halls are built or fitted out.
  if (builds || plan.scope === 'hall') {
    add('Racks and containment', 'White space fit-out', 'Raised floor or slab, ceiling, lighting, containment supports', s.whiteSpaceM2, 'm²', 2500);
    add('Power', 'Electrical installation', 'Busbars, cabling, earthing, testing', Math.ceil(s.itKw), 'kW', 250);
    add('Cooling', 'Mechanical installation', 'Pipework, pumps, controls', Math.ceil(s.itKw), 'kW', 200);
  }
  if (plan.scope === 'plant') add('Power', 'Installation and integration', 'Cut-in under concurrent maintenance', 1, 'lot', Math.max(150000, s.itKw * 60));
  if (plan.scope === 'migration') {
    add('Racks and containment', 'Move services', 'De-rack, transport, re-rack, test', num(ev, 'racksToMove', s.racks), 'rack', 4500);
    if (ev.params['dataDisposal']?.value !== false) add('Fire and security', 'Certified data disposal', 'Wipe or shred with certificate', num(ev, 'racksToMove', s.racks), 'rack', 800);
  }

  // Fire and security, monitoring
  if (facility && s.halls > 0 && !['rack', 'pod', 'plant', ...REPLACE_SCOPES].includes(plan.scope)) {
    add('Fire and security', 'Suppression system', `${String(ev.params['suppressionType']?.value ?? 'Clean agent gas')}, one per hall`, s.halls, 'hall', 180000);
    add('Fire and security', 'Very early smoke detection', 'Aspirating, per hall', s.halls, 'hall', 40000);
    add('Fire and security', 'Access control and CCTV', `${num(ev, 'securityZones', 4)} zones`, Math.max(1, s.buildings) * num(ev, 'securityZones', 4), 'zone', 60000);
    add('Monitoring', 'Building management and DCIM sensors', 'Power, temperature, leak per hall', s.halls, 'hall', 50000);
  }
  }
}

/** Totals, category split and the comparison with the CapEx estimate. */
export function finishBom(lines: BomItem[], ev: Evaluation): Bom {
  const total = lines.reduce((a, l) => a + l.total, 0);
  const cats = [...new Set(lines.map(l => l.category))];
  const capexCompared = ev.estimate.capex.filter(l => !/Land and shell|Services and contingency/.test(l.item)).reduce((a, l) => a + l.amount, 0);
  return { lines, total, byCategory: cats.map(c => ({ category: c, total: lines.filter(l => l.category === c).reduce((a, l) => a + l.total, 0), lines: lines.filter(l => l.category === c).length })).sort((a, b) => b.total - a.total), capexCompared, coveragePct: capexCompared ? r0((total / capexCompared) * 100) : 0 };
}

/* ================================================================== IP and network plan */
export interface IpItem { id: string; scope: string; purpose: 'Production' | 'Storage' | 'Management' | 'OOB' | 'Transit' | 'Loopback'; name: string; cidr: string; prefix: number; hosts: number; vlan?: number; gateway?: string; notes: string }
export interface IpPlan { aggregate: string; items: IpItem[]; vlans: { number: number; name: string; purpose: string; scope: string }[]; asns: { role: string; asn: string }[]; usedAddresses: number; totalAddresses: number }

/** Simple aligned allocator inside a /16 (or /15 for very large plans). */
function allocator(base: number, size: number) {
  let next = 0;
  return (prefix: number) => { const blk = 2 ** (32 - prefix); next = Math.ceil(next / blk) * blk; const start = base + next; next += blk; if (next > size) return null; return start; };
}
const ipStr = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const prefixFor = (hosts: number) => Math.max(20, Math.min(30, 32 - Math.ceil(Math.log2(Math.max(4, hosts + 3)))));

export function buildIpPlan(plan: T.PlannerPlan, ev: Evaluation): IpPlan {
  const s = ev.sizing;
  const seed = [...plan.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const big = s.halls > 24;
  const second = 64 + (seed % 120); const baseNum = (10 << 24) + ((big ? second & ~1 : second) << 16);
  const size = big ? 2 ** 17 : 2 ** 16;
  const alloc = allocator(baseNum, size);
  const items: IpItem[] = []; const vlans: IpPlan['vlans'] = [];
  const site = plan.newSiteName || plan.title.split('·')[0].trim() || 'Site';
  const push = (scope: string, purpose: IpItem['purpose'], name: string, hosts: number, vlan: number | undefined, notes: string) => {
    const prefix = prefixFor(hosts); const start = alloc(prefix); if (start === null) return;
    items.push({ id: `IP${items.length + 1}`, scope, purpose, name, cidr: `${ipStr(start)}/${prefix}`, prefix, hosts: 2 ** (32 - prefix) - 3, vlan, gateway: purpose === 'Loopback' || purpose === 'Transit' ? undefined : ipStr(start + 1), notes });
    if (vlan) vlans.push({ number: vlan, name, purpose, scope });
  };
  const halls = Math.max(1, plan.scope === 'network' ? 0 : s.halls);
  const racksPerHall = Math.max(1, s.building.racksPerHall || Math.ceil(s.racks / Math.max(1, s.halls)));
  const gpuShare = plan.demand.gpuPct / 100, stoShare = plan.demand.storagePct / 100;
  if (plan.scope !== 'network') {
    for (let h = 1; h <= Math.min(halls, 40); h++) {
      const scope = s.halls > 1 ? `Hall ${h}` : plan.scope === 'rack' ? 'Rack' : plan.scope === 'pod' ? 'Pod' : 'Hall';
      const v = 100 + h * 10;
      push(scope, 'Production', `${scope} servers`, racksPerHall * 40, v, `${racksPerHall} racks × about 40 hosts`);
      if (stoShare > 0) push(scope, 'Storage', `${scope} storage`, Math.max(16, racksPerHall * 40 * stoShare * 2), v + 1, 'storage network');
      if (gpuShare > 0.3) push(scope, 'Production', `${scope} GPU fabric`, racksPerHall * 32, v + 2, 'RDMA, lossless');
      push(scope, 'Management', `${scope} management`, Math.max(30, racksPerHall * 4), v + 5, 'BMC, PDU and switch management');
      push(scope, 'OOB', `${scope} out of band`, Math.max(30, racksPerHall * 2), 900 + h, 'console servers');
    }
  }
  const devices = s.network.leaves + s.network.spines + s.network.cores;
  if (devices) push('Site', 'Loopback', `${site} loopbacks`, devices + 8, undefined, `${devices} switches and routers, one /32 each`);
  if (s.network.uplinks) push('Site', 'Transit', `${site} point-to-point links`, s.network.uplinks * 2 + s.network.cores * 8, undefined, `${s.network.uplinks} leaf uplinks as /31 pairs`);
  const dciPaths = plan.scope === 'network' ? num(ev, 'diversePaths', 2) : s.network.carriers;
  for (let i = 1; i <= dciPaths; i++) push('Site', 'Transit', `${plan.scope === 'network' ? 'Interconnect path' : 'Carrier'} ${i}`, 2, 3000 + i, plan.scope === 'network' ? `${Math.round(s.network.dciGbps / Math.max(1, dciPaths))} Gbps` : 'internet and transit hand-off');
  const asns: IpPlan['asns'] = [];
  if (s.network.spines) asns.push({ role: 'Spine layer', asn: `${65000 + (seed % 400)}` });
  if (s.network.leaves) asns.push({ role: `Leaf pairs (${s.network.leaves / 2})`, asn: `${65500 + (seed % 400)} to ${65500 + (seed % 400) + s.network.leaves / 2 - 1}` });
  if (s.network.cores) asns.push({ role: 'Core and DCI', asn: `${64600 + (seed % 100)}` });
  const used = items.reduce((a, i) => a + 2 ** (32 - i.prefix), 0);
  const generic: IpPlan = { aggregate: `${ipStr(baseNum)}/${big ? 15 : 16}`, items, vlans, asns, usedAddresses: used, totalAddresses: size };
  return modelFor(plan.scope).ipPlan?.(ev, generic) ?? generic;
}

/* ================================================================== basis of design */
export interface BodRow { label: string; value: string; source?: string }
export interface BodSection { id: string; title: string; text?: string; rows: BodRow[] }

export function buildBasisOfDesign(plan: T.PlannerPlan, ev: Evaluation, template: T.PlannerTemplate | undefined, siteName: string): BodSection[] {
  const s = ev.sizing; const e = ev.estimate; const P = ev.params;
  const src = (k: string) => (P[k] ? SOURCE_LABEL[P[k].source] : undefined);
  const v = (k: string, unit = '') => { const x = P[k]?.value; return x === undefined ? '—' : `${typeof x === 'number' ? x.toLocaleString('en-US') : String(x)}${unit}`; };
  const profile = DC_TYPE_CATALOG.find(p => p.key === plan.dcTypeKey);
  const covered = new Set((template?.requiredAspects ?? []).filter(a => a.depth !== 'skipped').map(a => a.aspect));
  const out: BodSection[] = [
    { id: 'purpose', title: '1. Purpose and demand', text: plan.intent || `${SCOPE_LABEL[plan.scope]} for ${siteName}.`, rows: [
      { label: 'Plan type', value: template?.name ?? SCOPE_LABEL[plan.scope] }, { label: 'Kind of site', value: profile?.name ?? plan.dcTypeKey },
      { label: 'IT capacity', value: fmtKw(s.itKw) }, { label: 'Workload mix', value: `${plan.demand.gpuPct}% GPU, ${plan.demand.computePct}% compute, ${plan.demand.storagePct}% storage` },
      { label: 'Growth', value: `${plan.demand.growthPctPerYear}% a year` }, { label: 'Needed by', value: new Date(plan.targetGoLive).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) } ] },
    { id: 'site', title: '2. Site and climate', rows: [{ label: 'Site', value: siteName }, { label: 'Climate', value: plan.climate }, { label: 'Utility intake', value: v('feedVoltage', ' V'), source: src('feedVoltage') }] },
    { id: 'resilience', title: '3. Tier and redundancy', rows: [{ label: 'Tier', value: v('tier'), source: src('tier') }, { label: 'Power', value: v('redundancy'), source: src('redundancy') }, { label: 'Cooling', value: v('coolingRedundancy'), source: src('coolingRedundancy') }, { label: 'UPS runtime', value: v('upsRuntimeMin', ' min'), source: src('upsRuntimeMin') }, { label: 'Fuel on site', value: v('generatorFuelHours', ' h'), source: src('generatorFuelHours') }] },
    { id: 'space', title: '4. Space and building', rows: [
      { label: 'Racks', value: `${s.racks.toLocaleString('en-US')} at ${v('densityKwPerRack', ' kW')}`, source: src('densityKwPerRack') }, { label: 'Data halls', value: `${s.halls} of ${fmtKw(num(ev, 'hallDesignKw', 0))}`, source: src('hallDesignKw') },
      { label: 'Buildings', value: `${s.buildings} × ${s.building.floorsPerBuilding} floors × ${s.building.hallsPerFloor} halls per floor` }, { label: 'White space', value: `${s.whiteSpaceM2.toLocaleString('en-US')} m²` },
      { label: 'Gross floor area', value: `${s.grossAreaM2.toLocaleString('en-US')} m²` }, { label: 'Floor loading', value: v('floorLoadingKgPerRack', ' kg per rack'), source: src('floorLoadingKgPerRack') } ] },
    { id: 'power', title: '5. Power chain', rows: s.plant.filter(p => p.kind !== 'cooling' && p.kind !== 'cdu').map(p => ({ label: p.name, value: `${p.count} × ${fmtKw(p.capacityKw)} (${p.redundancy})` })) },
    { id: 'cooling', title: '6. Cooling and environment', rows: [{ label: 'Cooling', value: v('coolingType'), source: src('coolingType') }, { label: 'Units', value: `${s.cooling.units} × ${fmtKw(s.cooling.unitKw)}` }, { label: 'Inlet setpoint', value: v('inletSetpointC', ' °C'), source: src('inletSetpointC') }, { label: 'PUE', value: String(s.pue.value), source: SOURCE_LABEL[s.pue.source] }] },
    { id: 'network', title: '7. Network', rows: [{ label: 'Fabric', value: `${s.network.leaves} leaf, ${s.network.spines} spine, ${s.network.cores} core` }, { label: 'Uplinks', value: `${s.network.uplinks} × ${s.network.uplinkGbps} Gbps, ${v('oversubscription', ':1')} oversubscription` }, { label: 'Carriers', value: String(s.network.carriers) }, { label: 'Interconnect', value: `${s.network.dciGbps.toLocaleString('en-US')} Gbps` }] },
    { id: 'firesec', title: '8. Fire, life safety and security', rows: [{ label: 'Suppression', value: v('suppressionType') }, { label: 'Security zones', value: v('securityZones') }] },
    { id: 'sustainability', title: '9. Sustainability', rows: [{ label: 'Energy', value: `${ev.sustainability.energyMwhYear.toLocaleString('en-US')} MWh a year` }, { label: 'Renewable share', value: v('renewableSharePct', '%') }, { label: 'Carbon', value: `${ev.sustainability.carbonTYear.toLocaleString('en-US')} t CO₂ a year` }, { label: 'Water', value: `${ev.sustainability.wue} L/kWh` }] },
    { id: 'operations', title: '10. Operations', rows: [{ label: 'Staff', value: `${s.staffing.fte} FTE, ${s.staffing.shifts} shifts` }, { label: 'Spares', value: fmtUsd(s.spares.valueUsd) }] },
    { id: 'schedule', title: '11. Phasing and schedule', rows: [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).map(p => ({ label: p.name, value: `${fmtKw(p.itKw)} live ${new Date(p.goLive).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` })) },
    { id: 'cost', title: '12. Cost', rows: [{ label: 'CapEx', value: `${fmtUsd(e.capexTotal)} (${fmtUsd(e.capexPerKw)} per kW plant)` }, { label: 'OpEx', value: `${fmtUsd(e.opexMonthly)} a month` }, { label: 'Payback', value: e.paybackMonths === null ? 'no positive margin' : `${e.paybackMonths} months` }] },
    { id: 'risks', title: '13. Risks and permits', rows: [...plan.risks.slice(0, 6).map(r => ({ label: r.title, value: `${r.probability} probability, ${r.impact} impact · ${r.owner}` })), ...plan.permits.map(p => ({ label: p.name, value: `${p.authority}, ${p.leadWeeks} weeks, ${p.status}` }))] },
    { id: 'standards', title: '14. Standards and checks', rows: ev.findings.filter(f => f.status !== 'n/a').map(f => ({ label: f.rule.title, value: `${f.status === 'pass' ? 'Pass' : f.status === 'fail' ? 'Fail' : 'Warning'} · ${f.detail}`, source: f.rule.standard })) },
  ];
  // Keep only sections the plan type covers, plus the always-on ones.
  const sectionAspects: Record<string, T.PlannerAspect[]> = { resilience: ['resilience', 'power'], space: ['space'], power: ['power'], cooling: ['cooling'], network: ['network'], firesec: ['fire', 'security'], sustainability: ['sustainability'], operations: ['operations'], schedule: ['schedule'], cost: ['finance'], risks: ['risk', 'compliance'] };
  const kept = out.filter(sec => !sectionAspects[sec.id] || sectionAspects[sec.id].some(a => covered.has(a))).filter(sec => sec.rows.length || sec.text);
  return modelFor(plan.scope).bod?.(ev, kept, template) ?? kept;
}
export const aspectsCovered = (t?: T.PlannerTemplate) => (t?.requiredAspects ?? []).filter(a => a.depth !== 'skipped').map(a => ASPECT_LABEL[a.aspect]);

/* ================================================================== initiation pack */
export interface InitProject { name: string; start: string; end: string; budget: number; gate: string; longLead: boolean; template?: ProjectTemplate }
/** Delivery template a single-project plan starts as. */
export const PROJECT_TEMPLATE_FOR: Partial<Record<T.PlannerScope, ProjectTemplate>> = { 'server-refresh': 'Rack Deployment', 'network-refresh': 'Network Refresh', 'rack-replace': 'Rack Deployment', hall: 'Hall Fit-out', retrofit: 'Hall Fit-out', pod: 'Rack Deployment', plant: 'MEP & Plant Installation', network: 'Network Refresh' };
export interface Initiation {
  vehicle: 'programme' | 'project' | 'change' | 'portfolio'; name: string; budget: number; blueprintKey?: string; blueprintName?: string;
  projects: InitProject[]; orders: { item: string; category: BomCategory | 'Mixed'; value: number; orderBy: string; needBy: string; late: boolean }[];
  permits: T.PlannerPermit[]; designDocs: { name: string; type: T.DesignDocument['type']; discipline: T.DesignDocument['discipline'] }[];
  workOrder: { process: string; key: string }; change?: { title: string; type: T.ChangeRequest['type'] };
}

export function blueprintFor(plan: T.PlannerPlan): string {
  return plan.scope === 'new-dc' || plan.scope === 'portfolio' ? (plan.dcTypeKey === 'ai-gpu-factory' ? 'ai-gpu-factory' : plan.designPowerKw >= 20000 ? 'hyperscale-campus' : 'greenfield-dc') : plan.scope === 'edge' ? 'telco-site' : 'modular-pod';
}

export function buildInitiation(plan: T.PlannerPlan, ev: Evaluation, template: T.PlannerTemplate | undefined, bom: Bom): Initiation {
  const generic = genericInitiation(plan, ev, template, bom);
  return modelFor(plan.scope).initiation?.(ev, template, bom, generic) ?? generic;
}
function genericInitiation(plan: T.PlannerPlan, ev: Evaluation, template: T.PlannerTemplate | undefined, bom: Bom): Initiation {
  const vehicle = (template?.executesAs ?? 'project') as Initiation['vehicle'];
  const budget = ev.estimate.capexTotal;
  const key = blueprintFor(plan); const bp = vehicle === 'change' ? undefined : getBlueprint(key);
  const profile = DC_TYPE_CATALOG.find(p => p.key === plan.dcTypeKey);
  const factor = profile?.build.durationFactor ?? 1;
  const start = Date.now();
  if (vehicle === 'project') {
    // One project from the matching delivery template, running from now to the go-live date.
    const tpl = PROJECT_TEMPLATE_FOR[plan.scope] ?? 'Capacity Expansion';
    return { ...baseInitiation(plan, ev, template, bom, vehicle, budget), projects: [{ name: plan.title, start: new Date(start).toISOString(), end: plan.targetGoLive, budget, gate: 'Plan approved', longLead: false, template: tpl }], blueprintKey: undefined, blueprintName: `${tpl} (delivery template)` };
  }
  const projects: InitProject[] = (bp?.phases ?? []).map(ph => ({ name: `${plan.title} — ${ph.name}`, start: new Date(start + ph.startWeek * factor * 7 * 864e5).toISOString(), end: new Date(start + (ph.startWeek + ph.durationWeeks) * factor * 7 * 864e5).toISOString(), budget: r0(budget * ph.budgetShare), gate: ph.gate, longLead: !!ph.longLead }));
  return { ...baseInitiation(plan, ev, template, bom, vehicle, budget), blueprintKey: bp?.key, blueprintName: bp?.name, projects };
}

function baseInitiation(plan: T.PlannerPlan, ev: Evaluation, template: T.PlannerTemplate | undefined, bom: Bom, vehicle: Initiation['vehicle'], budget: number): Initiation {
  const orders = ev.schedule.filter(x => x.kind === 'equipment').map(x => {
    const related = bom.lines.filter(l => l.leadItem && (x.item.toLowerCase().includes(l.leadItem.split(' ')[0].toLowerCase()) || l.leadItem.toLowerCase().includes(x.item.split(' ')[0].toLowerCase())));
    return { item: x.item, category: (related[0]?.category ?? 'Mixed') as BomCategory | 'Mixed', value: related.reduce((a, l) => a + l.total, 0), orderBy: x.orderBy, needBy: x.needBy, late: x.late };
  }).filter(o => o.value > 0);
  const docs: Initiation['designDocs'] = [{ name: 'Basis of design', type: 'Concept Design', discipline: 'Architectural' }];
  const covered = new Set((template?.requiredAspects ?? []).filter(a => a.depth !== 'skipped').map(a => a.aspect));
  if (REPLACE_SCOPES.includes(plan.scope)) {
    docs.push({ name: plan.scope === 'rack-replace' ? 'Rack swap list' : 'Old-to-new device list', type: 'Detailed Design', discipline: plan.scope === 'network-refresh' ? 'Network' : 'Architectural' }, { name: 'Cut-over runbook', type: 'Detailed Design', discipline: plan.scope === 'network-refresh' ? 'Network' : 'Electrical' });
    covered.clear();
  }
  if (covered.has('power')) docs.push({ name: 'Electrical single-line diagram', type: 'Schematic Design', discipline: 'Electrical' });
  if (covered.has('cooling')) docs.push({ name: 'Mechanical cooling schematic', type: 'Schematic Design', discipline: 'Mechanical' });
  if (covered.has('space')) docs.push({ name: plan.scope === 'new-dc' || plan.scope === 'expansion' ? 'Building and floor plan' : 'Hall layout', type: 'Schematic Design', discipline: 'Architectural' });
  if (covered.has('network')) docs.push({ name: 'Network and IP plan', type: 'Detailed Design', discipline: 'Network' });
  const process = vehicle === 'change' ? { process: 'P05 Change', key: 'change' } : REPLACE_SCOPES.includes(plan.scope) ? { process: 'P10 Work order', key: 'work-order' } : plan.scope === 'hall' ? { process: 'P02 Hall fit-out', key: 'hall-fitout' } : { process: 'P06 Capacity expansion', key: 'capacity-expansion' };
  return {
    vehicle, name: plan.title, budget, projects: [], orders, permits: plan.permits, designDocs: docs, workOrder: process,
    change: vehicle === 'change' ? { title: `${plan.title}`, type: plan.scope === 'rack' ? 'RackDeploy' : 'PowerUpgrade' } : undefined,
  };
}

/* ================================================================== export helpers */
export function toCsv(rows: (string | number | undefined)[][]): string {
  return rows.map(r => r.map(c => { const s = c === undefined ? '' : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
}
export const bomCsv = (bom: Bom) => toCsv([['Line', 'Category', 'Item', 'Specification', 'Quantity', 'Unit', 'Unit cost USD', 'Total USD', 'Lead weeks', 'Part number', 'Manufacturer'], ...bom.lines.map((l, i) => [i + 1, l.category, l.item, l.spec, l.qty, l.unit, l.unitCost, l.total, l.leadWeeks, l.partNumber, l.manufacturer])]);
export const ipCsv = (ip: IpPlan) => toCsv([['Scope', 'Purpose', 'Name', 'CIDR', 'Usable hosts', 'VLAN', 'Gateway', 'Notes'], ...ip.items.map(i => [i.scope, i.purpose, i.name, i.cidr, i.hosts, i.vlan, i.gateway, i.notes])]);
