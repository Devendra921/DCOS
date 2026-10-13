/**
 * Approved catalogue and price book — what the planner is allowed to specify.
 *
 * IT and network items map to device models in the DCIM catalogue (asset models with their
 * power, height and end-of-life date). Facility items (UPS, cooling, switchgear…) and services
 * map to the vendors the company buys them from. Each item kind has a preferred model and
 * alternatives; sourcing skips a model whose end-of-life is too close and falls back.
 * Prices are indicative list prices (vendor price book 2026); purchase orders carry the contract.
 */
import type * as T from '../../../mock/data/types';

export type ItemKind =
  | 'gpu-server' | 'server' | 'storage' | 'leaf' | 'spine' | 'core' | 'firewall' | 'oob'
  | 'rack' | 'rack-pdu' | 'containment' | 'cage' | 'enclosure'
  | 'ups' | 'ups-small' | 'generator' | 'generator-small' | 'transformer' | 'switchgear' | 'pdu' | 'utility'
  | 'crah' | 'cdu' | 'inrow' | 'reardoor' | 'chiller' | 'cooling-small' | 'sfn' | 'floor'
  | 'optics' | 'fibre' | 'dac' | 'patch' | 'dci'
  | 'suppression' | 'vesda' | 'access' | 'bms'
  | 'fitout' | 'install' | 'move' | 'disposal';

export interface CatalogueOption { model: string; manufacturer: string; vendor: string; unitPrice: number; /** Device model in DCIM (stock can be matched). */ device?: boolean }
export interface CatalogueKind { kind: ItemKind; label: string; options: CatalogueOption[]; /** Equipment that can sit in stock as devices. */ stockable?: boolean; /** Can be covered by spare capacity at an existing site. */ siteCapacity?: 'positions' | 'ups' | 'cooling' | 'plant' }

const O = (model: string, manufacturer: string, vendor: string, unitPrice: number, device = false): CatalogueOption => ({ model, manufacturer, vendor, unitPrice, device });

export const CATALOGUE: Record<ItemKind, CatalogueKind> = {
  'gpu-server': { kind: 'gpu-server', label: 'GPU server', stockable: true, options: [O('PowerEdge XE9680', 'Dell', 'Dell Technologies', 310000, true), O('DGX H100', 'NVIDIA', 'NVIDIA', 380000, true), O('SYS-821GE GPU SuperServer', 'Supermicro', 'Supermicro', 290000, true)] },
  server: { kind: 'server', label: 'Server', stockable: true, options: [O('PowerEdge R760', 'Dell', 'Dell Technologies', 14000, true), O('ProLiant DL380 Gen11', 'HPE', 'HPE', 13500, true)] },
  storage: { kind: 'storage', label: 'Storage array', stockable: true, options: [O('FlashArray //X70', 'Pure Storage', 'Dell Technologies', 120000, true), O('AFF A400', 'NetApp', 'HPE', 110000, true)] },
  leaf: { kind: 'leaf', label: 'Leaf switch', stockable: true, options: [O('7050X3-48YC8', 'Arista', 'Arista Networks', 38000, true), O('QFX5120-48Y', 'Juniper', 'Juniper Networks', 34000, true), O('Catalyst 9300-48P', 'Cisco', 'Cisco Systems', 9000, true)] },
  spine: { kind: 'spine', label: 'Spine switch', stockable: true, options: [O('Nexus 9336C-FX2', 'Cisco', 'Cisco Systems', 52000, true)] },
  core: { kind: 'core', label: 'Core router', stockable: true, options: [O('MX480', 'Juniper', 'Juniper Networks', 210000, true), O('ASR 9006', 'Cisco', 'Cisco Systems', 240000, true)] },
  firewall: { kind: 'firewall', label: 'Firewall', stockable: true, options: [O('PA-5450', 'Palo Alto', 'Palo Alto Networks', 280000, true)] },
  oob: { kind: 'oob', label: 'Console server', stockable: true, options: [O('OM2248 Console Server', 'Opengear', 'Cisco Systems', 4200, true)] },
  rack: { kind: 'rack', label: 'Rack', siteCapacity: 'positions', options: [O('NetShelter SX 48U', 'APC', 'Schneider Electric', 3800), O('VR3300 42U', 'Vertiv', 'Vertiv', 3200), O('TS IT 45U', 'Rittal', 'Schneider Electric', 3600)] },
  'rack-pdu': { kind: 'rack-pdu', label: 'Rack power strip', stockable: true, options: [O('Geist rPDU 3-phase', 'Vertiv', 'Vertiv', 1400, true)] },
  containment: { kind: 'containment', label: 'Aisle containment', options: [O('SmartAisle containment', 'Vertiv', 'Vertiv', 18000)] },
  cage: { kind: 'cage', label: 'Cage', options: [O('Mesh partition with badge door', 'Schneider', 'Schneider Electric', 45000)] },
  enclosure: { kind: 'enclosure', label: 'Prefabricated enclosure', options: [O('EcoStruxure modular enclosure', 'Schneider', 'Schneider Electric', 85000)] },
  ups: { kind: 'ups', label: 'UPS', siteCapacity: 'ups', options: [O('Eaton 93PM', 'Eaton', 'Eaton', 0), O('Galaxy VX', 'Schneider', 'Schneider Electric', 0)] },
  'ups-small': { kind: 'ups-small', label: 'Site UPS', options: [O('Eaton 9PX', 'Eaton', 'Eaton', 0)] },
  generator: { kind: 'generator', label: 'Generator', siteCapacity: 'plant', options: [O('2.5 MVA diesel genset', 'Schneider', 'Schneider Electric', 900000)] },
  'generator-small': { kind: 'generator-small', label: 'Site generator', options: [O('Compact genset with ATS', 'Schneider', 'Schneider Electric', 0)] },
  transformer: { kind: 'transformer', label: 'Transformer', siteCapacity: 'plant', options: [O('Trihal 2.5 MVA', 'Schneider', 'Schneider Electric', 120000)] },
  switchgear: { kind: 'switchgear', label: 'Switchgear', siteCapacity: 'plant', options: [O('Premset MV line-up', 'Schneider', 'Schneider Electric', 250000)] },
  pdu: { kind: 'pdu', label: 'Floor power distribution', siteCapacity: 'ups', options: [O('Liebert FPC', 'Vertiv', 'Vertiv', 28000)] },
  utility: { kind: 'utility', label: 'Utility connection', options: [O('Grid connection', 'Utility', 'Utility', 150000)] },
  crah: { kind: 'crah', label: 'Air handler', siteCapacity: 'cooling', options: [O('Liebert PEX4', 'Vertiv', 'Vertiv', 85000), O('CyberAir 3PRO', 'Stulz', 'Stulz', 82000)] },
  cdu: { kind: 'cdu', label: 'Coolant distribution unit', siteCapacity: 'cooling', options: [O('Liebert XDU1350', 'Vertiv', 'Vertiv', 350000)] },
  inrow: { kind: 'inrow', label: 'In-row cooler', siteCapacity: 'cooling', options: [O('CyberRow', 'Stulz', 'Stulz', 25000), O('Liebert CRV', 'Vertiv', 'Vertiv', 26000)] },
  reardoor: { kind: 'reardoor', label: 'Rear-door cooler', siteCapacity: 'cooling', options: [O('Liebert DCD', 'Vertiv', 'Vertiv', 18000)] },
  chiller: { kind: 'chiller', label: 'Chiller', siteCapacity: 'plant', options: [O('CyberCool 2', 'Stulz', 'Stulz', 600000), O('Liebert AFC', 'Vertiv', 'Vertiv', 620000)] },
  'cooling-small': { kind: 'cooling-small', label: 'Site cooling', options: [O('Liebert DSE', 'Vertiv', 'Vertiv', 0)] },
  sfn: { kind: 'sfn', label: 'Secondary fluid network', options: [O('Manifolds and leak detection', 'Vertiv', 'Vertiv', 6500)] },
  floor: { kind: 'floor', label: 'Floor reinforcement', options: [O('Structural works', 'NetBuild', 'NetBuild Corp', 4000)] },
  optics: { kind: 'optics', label: 'Optics', options: [O('400G QSFP-DD', 'Corning', 'Corning', 1200)] },
  fibre: { kind: 'fibre', label: 'Fibre trunk', options: [O('MPO-24 trunk', 'Corning', 'Corning', 1500)] },
  dac: { kind: 'dac', label: 'Copper and DAC', options: [O('DAC and copper kit', 'Corning', 'Corning', 800)] },
  patch: { kind: 'patch', label: 'Patching', options: [O('Cross-connect', 'Corning', 'Corning', 350)] },
  dci: { kind: 'dci', label: 'Interconnect line system', options: [O('Coherent 400G line system', 'Corning', 'Corning', 420000)] },
  suppression: { kind: 'suppression', label: 'Fire suppression', options: [O('Clean agent system', 'CBRE', 'CBRE Data Center Solutions', 180000)] },
  vesda: { kind: 'vesda', label: 'Smoke detection', options: [O('Aspirating detection', 'CBRE', 'CBRE Data Center Solutions', 40000)] },
  access: { kind: 'access', label: 'Access control and CCTV', options: [O('Security system', 'CBRE', 'CBRE Data Center Solutions', 60000)] },
  bms: { kind: 'bms', label: 'Building management', options: [O('BMS and DCIM sensors', 'Schneider', 'Schneider Electric', 50000)] },
  fitout: { kind: 'fitout', label: 'Fit-out works', options: [O('White space fit-out', 'NetBuild', 'NetBuild Corp', 2500)] },
  install: { kind: 'install', label: 'Installation', options: [O('Installation services', 'NetBuild', 'NetBuild Corp', 0)] },
  move: { kind: 'move', label: 'Move services', options: [O('Move and re-rack services', 'NetBuild', 'NetBuild Corp', 0)] },
  disposal: { kind: 'disposal', label: 'Disposal', options: [O('Certified disposal', 'CBRE', 'CBRE Data Center Solutions', 0)] },
};

/** Price of a model in the price book, if listed. */
export function priceOf(model: string): number | undefined {
  for (const k of Object.values(CATALOGUE)) { const o = k.options.find(x => x.model === model); if (o && o.unitPrice) return o.unitPrice; }
  return undefined;
}
/** The catalogue kind a device model belongs to. */
export function kindOfModel(model: string): ItemKind | undefined {
  for (const k of Object.values(CATALOGUE)) if (k.options.some(o => o.model === model)) return k.kind;
  return undefined;
}

/** Pick the first option whose model is not near end of life by the date it is needed, and whose vendor is active. */
export function chooseOption(kind: ItemKind, neededBy: string, models: T.AssetModel[], vendors: T.Vendor[], preferred?: string): { option: CatalogueOption; skipped: { model: string; reason: string }[] } {
  const k = CATALOGUE[kind]; const skipped: { model: string; reason: string }[] = [];
  // A model must stay supported for at least two years after it is needed.
  const horizon = new Date(neededBy).getTime() + 2 * 365 * 864e5;
  const ordered = preferred ? [...k.options].sort((a, b) => (a.model === preferred ? -1 : b.model === preferred ? 1 : 0)) : k.options;
  for (const o of ordered) {
    const m = models.find(x => x.model === o.model);
    if (m?.eolDate && new Date(m.eolDate).getTime() < horizon) { skipped.push({ model: o.model, reason: `end of life ${new Date(m.eolDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` }); continue; }
    const v = vendors.find(x => x.name === o.vendor);
    if (v && v.status !== 'Active') { skipped.push({ model: o.model, reason: `${o.vendor} is not an active vendor` }); continue; }
    return { option: o, skipped };
  }
  // Nothing passes: take the active-vendor option with the latest end of life.
  const eol = (o: CatalogueOption) => new Date(models.find(x => x.model === o.model)?.eolDate ?? '2100-01-01').getTime();
  const active = ordered.filter(o => vendors.find(x => x.name === o.vendor)?.status !== 'Inactive');
  return { option: [...(active.length ? active : ordered)].sort((a, b) => eol(b) - eol(a))[0], skipped };
}
