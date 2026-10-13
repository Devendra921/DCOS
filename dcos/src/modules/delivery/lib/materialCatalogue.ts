/**
 * Material catalogue and kit rules — pure data and lookups used by the material actions, the
 * seed and the planner's execution.
 *
 *   • CATALOGUE_ITEMS: the items DCOS mirrors from the supply chain platform's catalogue
 *     (the seed loads them into `materials`; serialised items name the DCIM model they install as).
 *   • DEFAULT_KITS: what a work order of each work type takes when neither its project step nor
 *     a standard template says otherwise (removal and disposal take equipment out instead).
 *   • Which project step a material belongs to (by category and the step's work types), and
 *     which work type in that step takes it.
 *   • Resolving a bill-of-materials line to a catalogue item.
 *   • Recipes for a project's bill of materials by template (procurement generated in delivery).
 */
import type * as T from '../../../mock/data/types';
import type { WorkOrderType } from '../../../mock/data/enums';
import { PROCESS_BY_KEY } from '../../../workorders/model';
import { WORK_SPECS, mainPath, stepKeyOf } from './projectProcess';

type Cat = T.Material['category'];
export interface CatalogueItem {
  partNumber: string; description: string; manufacturer: string; kind: T.Material['kind']; category: Cat; uom: T.Material['uom'];
  unitCost: number; leadWeeks?: number;
  /** DCIM model name (AssetModel.model) a serialised item installs as. */
  model?: string;
  /** Pieces in one unit for items sold in packs. */
  packSize?: number;
}
const S = (partNumber: string, description: string, manufacturer: string, category: Cat, unitCost: number, leadWeeks: number, model?: string): CatalogueItem => ({ partNumber, description, manufacturer, kind: 'Serialised', category, uom: 'each', unitCost, leadWeeks, model });
const C = (partNumber: string, description: string, manufacturer: string, category: Cat, uom: T.Material['uom'], unitCost: number, leadWeeks = 1, packSize?: number): CatalogueItem => ({ partNumber, description, manufacturer, kind: 'Consumable', category, uom, unitCost, leadWeeks, packSize });

/** The catalogue the prototype mirrors (60 items). Part numbers match the bills of materials in the seed and the planner's models. */
export const CATALOGUE_ITEMS: CatalogueItem[] = [
  // racks and containment
  S('AR3300', 'Rack enclosure 48U (NetShelter SX)', 'APC', 'Rack', 6500, 6),
  S('VR3300', 'Rack enclosure 42U (VR3300)', 'Vertiv', 'Rack', 3200, 6),
  S('TS-IT-45U', 'Rack enclosure 45U (TS IT)', 'Rittal', 'Rack', 3600, 6),
  C('ACDC2002', 'Containment panel', 'APC', 'Rack', 'each', 2200, 6),
  C('SMARTAISLE', 'Aisle containment kit (per row)', 'Vertiv', 'Rack', 'set', 18000, 8),
  // compute and storage
  S('R760', 'Server, PowerEdge R760', 'Dell', 'Compute', 14000, 4, 'PowerEdge R760'),
  S('DL380-G11', 'Server, ProLiant DL380 Gen11', 'HPE', 'Compute', 13500, 4, 'ProLiant DL380 Gen11'),
  S('XE9680', 'GPU server, PowerEdge XE9680', 'Dell', 'Compute', 310000, 12, 'PowerEdge XE9680'),
  S('SYS-821GE', '8-GPU server (SYS-821GE)', 'Supermicro', 'Compute', 240000, 12, 'SYS-821GE GPU SuperServer'),
  S('DGX-H100', 'GPU system, DGX H100', 'NVIDIA', 'Compute', 380000, 16, 'DGX H100'),
  S('FA-X70', 'Storage array, FlashArray //X70', 'Pure Storage', 'Compute', 120000, 6, 'FlashArray //X70'),
  S('NVME-768', 'NVMe drive 7.68TB', 'Dell', 'Spares', 1900, 2),
  S('PSU-1100', 'Server power supply 1100 W', 'Dell', 'Spares', 260, 1),
  // network
  S('7800R3', '400G spine switch (7800R3)', 'Arista', 'Network', 185000, 14, '7800R3'),
  S('7050X3', '100G leaf switch (7050X3-48YC8)', 'Arista', 'Network', 38000, 8, '7050X3-48YC8'),
  S('N9K-9336C', 'Spine switch, Nexus 9336C-FX2', 'Cisco', 'Network', 52000, 8, 'Nexus 9336C-FX2'),
  S('QFX5120', 'Leaf switch, QFX5120-48Y', 'Juniper', 'Network', 34000, 8, 'QFX5120-48Y'),
  S('N9K-C93180', 'Top-of-rack switch (N9K-C93180)', 'Cisco', 'Network', 22000, 6, 'Nexus 93180YC-FX'),
  S('MX480', 'Core router, MX480', 'Juniper', 'Network', 210000, 12, 'MX480'),
  S('PA-5450', 'Firewall, PA-5450', 'Palo Alto', 'Network', 280000, 10, 'PA-5450'),
  S('OM2248', 'Console server, OM2248', 'Opengear', 'Network', 4200, 3, 'OM2248 Console Server'),
  // optics
  S('QDD-400G-DR4', '400G QSFP-DD optic', 'Arista', 'Optics', 1600, 4),
  S('QSFP-100G-SR4', '100G QSFP28 SR4 optic', 'Cisco', 'Optics', 300, 2),
  S('SFP-25G-SR', '25G SFP28 SR optic', 'Cisco', 'Optics', 90, 2),
  S('QDD-400G-ZR', '400G ZR coherent optic', 'Coherent', 'Optics', 9500, 8),
  // cabling
  C('QSFP-100G-CU', 'DAC cable 100G', 'Cisco', 'Cabling', 'each', 140, 2),
  C('MPO12-OM4', 'MPO-12 trunk 30m', 'Corning', 'Cabling', 'each', 240, 3),
  C('MPO24-TRUNK', 'MPO-24 trunk', 'Corning', 'Cabling', 'each', 1500, 4),
  C('CCH-01U', 'Patch panel 1U', 'Corning', 'Cabling', 'each', 320, 3),
  C('CCH-CP12', 'Fibre cassette 12 LC', 'Corning', 'Cabling', 'each', 110, 3),
  C('LC-OM4-3M', 'Fibre patch cord LC–LC OM4 3 m', 'Corning', 'Cabling', 'each', 18),
  C('LC-OS2-5M', 'Fibre patch cord LC–LC OS2 5 m', 'Corning', 'Cabling', 'each', 22),
  C('CAT6A-3M', 'Cat6A patch cord 3 m', 'Panduit', 'Cabling', 'each', 7),
  C('CAT6A-305', 'Cat6A cable (305 m box)', 'Panduit', 'Cabling', 'box', 240, 2, 305),
  // power
  S('GU2-30', 'Rack PDU 3-phase', 'Vertiv', 'Power', 1400, 4, 'Geist rPDU 3-phase'),
  S('SRT10K', 'Rack UPS, Smart-UPS SRT 10kVA', 'APC', 'Power', 7800, 4, 'Smart-UPS SRT 10kVA'),
  S('STS16', 'Static transfer switch', 'Eaton', 'Power', 14000, 10),
  S('PD2-S', 'PDU floor-mount', 'Vertiv', 'Power', 5400, 10),
  C('BB800', 'Busway 800A', 'Schneider', 'Power', 'm', 6800, 10),
  C('PC-C13C14-2M', 'Power cord C13–C14 2 m', 'Schneider', 'Power', 'each', 8),
  C('PC-C19C20-2M', 'Power cord C19–C20 2 m', 'Schneider', 'Power', 'each', 14),
  C('CU-16MM', 'Power cable 16 mm²', 'Prysmian', 'Power', 'm', 12, 2),
  C('GND-KIT', 'Rack earthing kit', 'Panduit', 'Power', 'set', 45),
  // plant and cooling
  S('GVL500K', 'UPS module 500kVA', 'Schneider', 'Plant', 92000, 20),
  S('9395XR-1250', 'UPS module 1250 kW', 'Eaton', 'Plant', 360000, 24),
  S('93PM-BC', 'Battery cabinet', 'Eaton', 'Plant', 22000, 16),
  S('C3516C', 'Generator 3,000 kVA standby', 'Caterpillar', 'Plant', 1100000, 40),
  S('TRIHAL-2500', 'Transformer 2,500 kVA cast resin', 'Schneider', 'Plant', 120000, 30),
  S('AFC-1500', 'Chiller 1500 kW', 'Vertiv', 'Cooling', 620000, 26),
  S('PEX4', 'Air handler (Liebert PEX4)', 'Vertiv', 'Cooling', 85000, 14),
  S('XDU1350', 'Coolant distribution unit', 'Vertiv', 'Cooling', 350000, 18),
  S('CRV', 'In-row cooler', 'Vertiv', 'Cooling', 26000, 10),
  S('FAN-MOD', 'CRAH fan module', 'Vertiv', 'Spares', 2800, 3),
  C('SFN-KIT', 'Manifolds and leak detection (per rack)', 'Vertiv', 'Cooling', 'set', 6500, 8),
  C('PIPE-DN50', 'Pre-insulated pipe DN50', 'Victaulic', 'Cooling', 'm', 95, 4),
  // mounting and consumables
  C('AR8136BLK', 'Blanking panels, kit of 10', 'APC', 'Mounting', 'box', 180, 1, 10),
  C('BLANK-1U', 'Blanking panel 1U, tool-less', 'APC', 'Mounting', 'each', 6),
  C('CABSCRWM6', 'Cage nuts & screws, box of 500', 'StarTech', 'Mounting', 'box', 90, 1, 500),
  C('MCP-290', 'Rail kit', 'Supermicro', 'Mounting', 'set', 120),
  C('RK-UNIV', 'Rail kit, universal 1–2U', 'Dell', 'Mounting', 'set', 95),
  C('TRAY-300', 'Cable tray 300 mm (3 m length)', 'Legrand', 'Mounting', 'each', 85, 2),
  C('VELCRO-25', 'Velcro ties (25 m roll)', 'Panduit', 'Mounting', 'each', 12),
  C('LBL-ROLL', 'Cable labels, roll of 500', 'Brady', 'Other', 'box', 35, 1, 500),
  C('FIRESTOP', 'Fire-stop pillows', 'Hilti', 'Other', 'each', 25),
  C('FIRESTOP-SEAL', 'Fire-stop sealant (310 ml)', 'Hilti', 'Other', 'each', 18),
  C('MEDIA-BAG', 'Secure media bag, tamper evident', 'Iron Mountain', 'Other', 'each', 6),
  C('EQUIP-LOT', 'Removed equipment (lot)', 'Various', 'Other', 'each', 0, 0),
];

/**
 * How much of an item a site needs per rack position (racks, rack PDUs, blanking, cage nuts…).
 * A work order covering N racks takes N × this from its step; bills of materials are sized with it.
 */
export const PER_RACK_QTY: Record<string, number> = {
  AR3300: 1, VR3300: 1, 'TS-IT-45U': 1, 'GU2-30': 2, AR8136BLK: 1, 'BLANK-1U': 10, CABSCRWM6: 1, ACDC2002: 0.5, SMARTAISLE: 0.1, 'RK-UNIV': 8, 'MCP-290': 2,
  R760: 8, 'DL380-G11': 8, XE9680: 2, 'SYS-821GE': 2, 'DGX-H100': 1, '7050X3': 1, 'N9K-C93180': 1, 'CCH-01U': 1, 'CCH-CP12': 2, 'MPO12-OM4': 2, 'QDD-400G-DR4': 4, 'QSFP-100G-SR4': 4,
  'QSFP-100G-CU': 8, 'SFP-25G-SR': 16, 'LC-OM4-3M': 12, 'CAT6A-3M': 24, 'PC-C13C14-2M': 16, 'PC-C19C20-2M': 8, 'NVME-768': 8, 'SFN-KIT': 1, 'GND-KIT': 1,
};
/**
 * A bill-of-materials line counted in pieces for an item sold in packs (unit cost well below the
 * pack price) becomes whole packs at the pack price, so the BOM, the PO lines, the receipts and the
 * work-order lines all count the same unit.
 */
export function inUnits(m: Pick<T.Material, 'packSize' | 'unitCost'>, quantity: number, unitCost: number): { quantity: number; unitCost: number } {
  if (!m.packSize || m.packSize <= 1 || !(unitCost > 0) || unitCost * 2 >= m.unitCost) return { quantity, unitCost };
  return { quantity: Math.max(1, Math.ceil(quantity / m.packSize)), unitCost: m.unitCost };
}

/** Part number of the generic item used for removed equipment that has no catalogue model. */
export const REMOVED_LOT_PART = 'EQUIP-LOT';

/** Work types that take materials of a category, in order of preference. */
export const CATEGORY_WORK: Record<Cat, WorkOrderType[]> = {
  Rack: ['RackInstall'], Mounting: ['RackInstall', 'DeviceDeploy'], Compute: ['DeviceDeploy', 'RackInstall', 'Migration'],
  Network: ['DeviceDeploy', 'RackInstall', 'CircuitTurnUp'], Optics: ['DeviceDeploy', 'CircuitTurnUp', 'Cabling'], Cabling: ['Cabling', 'CircuitTurnUp'],
  Power: ['PowerConnect', 'PlantInstall', 'PlantCutIn'], Cooling: ['PlantInstall', 'PlantCutIn'], Plant: ['PlantInstall', 'PlantCutIn'], Spares: [], Other: [],
};
/** Work types that never take materials (no kit, no lines). */
export const NO_MATERIAL_WORK: WorkOrderType[] = ['Commissioning', 'Civil', 'Inspection', 'Configuration'];
/** Work types that take equipment out of the estate (direction 'Out'). */
export const REMOVAL_WORK: WorkOrderType[] = ['DeviceRemoval', 'Disposal'];

/** Work types of a project step (from its work-order specs). */
export const stepWorkTypes = (processKey: string, stepId: string): WorkOrderType[] => [...new Set((WORK_SPECS[processKey]?.[stepKeyOf(stepId)]?.items ?? []).map(i => i.type))];
/** The work type in a step that takes materials of this category (undefined when none does). */
export const ownerWorkType = (category: Cat, stepTypes: WorkOrderType[]): WorkOrderType | undefined => CATEGORY_WORK[category].find(t => stepTypes.includes(t));
/** The project step (wait_<step>) a material of this category is needed for: the first step on the main path whose work takes it. */
export function stepForCategory(processKey: string | undefined, category: Cat): string | undefined {
  const p = processKey ? PROCESS_BY_KEY[processKey] : undefined; if (!p) return undefined;
  const waits = mainPath(p).filter(id => id.startsWith('wait_') && WORK_SPECS[processKey!]?.[stepKeyOf(id)]);
  for (const t of CATEGORY_WORK[category]) { const hit = waits.find(w => stepWorkTypes(processKey!, w).includes(t)); if (hit) return hit; }
  // No step's work takes it (e.g. plant bought during construction): the last work step, where it is handed over.
  return waits.at(-1);
}

/* ------------------------------------------------------------------ default kits */
export interface KitRule { part: string; per: 'job' | 'rack' | 'device'; qty: number }
const K = (part: string, qty: number, per: KitRule['per'] = 'job'): KitRule => ({ part, qty, per });
/** What a work order of each type takes when its step and its standard template give nothing. Removal and disposal take equipment out (see REMOVAL_WORK). */
export const DEFAULT_KITS: Partial<Record<WorkOrderType, KitRule[]>> = {
  RackInstall: [K('RK-UNIV', 4, 'rack'), K('CABSCRWM6', 1, 'rack'), K('BLANK-1U', 10, 'rack'), K('PC-C13C14-2M', 8, 'rack'), K('LBL-ROLL', 1), K('VELCRO-25', 1)],
  Cabling: [K('CAT6A-3M', 24, 'rack'), K('LC-OM4-3M', 12, 'rack'), K('LBL-ROLL', 1), K('VELCRO-25', 2)],
  PowerConnect: [K('PC-C13C14-2M', 12, 'rack'), K('PC-C19C20-2M', 4, 'rack'), K('LBL-ROLL', 1)],
  DeviceDeploy: [K('RK-UNIV', 1, 'device'), K('PC-C13C14-2M', 2, 'device'), K('QSFP-100G-SR4', 2, 'device'), K('LC-OM4-3M', 2, 'device')],
  Migration: [K('LC-OM4-3M', 4, 'rack'), K('CAT6A-3M', 4, 'rack'), K('PC-C13C14-2M', 4, 'rack'), K('LBL-ROLL', 1)],
  PlantInstall: [K('CU-16MM', 60), K('GND-KIT', 2), K('TRAY-300', 10), K('FIRESTOP', 6)],
  PlantCutIn: [K('CU-16MM', 20), K('FIRESTOP-SEAL', 4), K('LBL-ROLL', 1)],
  CircuitTurnUp: [K('LC-OS2-5M', 4), K('QDD-400G-DR4', 2)],
};
/** Quantity of a kit rule for a work order (racks and devices it touches, at least one). */
export function kitQty(rule: KitRule, wo: Pick<T.WorkOrder, 'rackIds' | 'rackId' | 'deviceIds'>): number {
  const racks = Math.max(1, wo.rackIds?.length ?? (wo.rackId ? 1 : 0));
  const devices = Math.max(1, wo.deviceIds?.length ?? racks * 2);
  return rule.qty * (rule.per === 'rack' ? racks : rule.per === 'device' ? devices : 1);
}
/** Standard template kits by template name keyword (the seed writes them onto the templates). */
export const TEMPLATE_KITS: { match: RegExp; kit: [string, number][] }[] = [
  { match: /^Rack and stack/i, kit: [['RK-UNIV', 4], ['CABSCRWM6', 1], ['BLANK-1U', 10], ['PC-C13C14-2M', 8], ['LBL-ROLL', 1]] },
  { match: /^Patching/i, kit: [['CAT6A-3M', 24], ['LC-OM4-3M', 12], ['LBL-ROLL', 1], ['VELCRO-25', 1]] },
  { match: /^PDU outlet/i, kit: [['PC-C13C14-2M', 12], ['PC-C19C20-2M', 4]] },
  { match: /^Like-for-like device/i, kit: [['RK-UNIV', 1], ['PC-C13C14-2M', 2], ['QSFP-100G-SR4', 2], ['LC-OM4-3M', 4]] },
  { match: /^Cross-connect/i, kit: [['LC-OS2-5M', 4], ['QDD-400G-DR4', 2]] },
  { match: /^Rack PDU swap/i, kit: [['GU2-30', 1], ['PC-C13C14-2M', 8]] },
  { match: /^Secure media/i, kit: [['MEDIA-BAG', 10]] },
];

/* ------------------------------------------------------------------ resolving BOM lines */
/** Planner item kinds → catalogue part numbers (the planner's models are matched first). */
export const PLANNER_KIND_PART: Record<string, string> = {
  'gpu-server': 'XE9680', server: 'R760', storage: 'FA-X70', leaf: '7050X3', spine: 'N9K-9336C', core: 'MX480', firewall: 'PA-5450', oob: 'OM2248',
  rack: 'AR3300', 'rack-pdu': 'GU2-30', containment: 'SMARTAISLE', ups: '9395XR-1250', 'ups-small': 'SRT10K', generator: 'C3516C', 'generator-small': 'C3516C', transformer: 'TRIHAL-2500',
  pdu: 'PD2-S', crah: 'PEX4', fanwall: 'PEX4', cdu: 'XDU1350', inrow: 'CRV', reardoor: 'CRV', chiller: 'AFC-1500', 'dry-cooler': 'AFC-1500', 'cooling-small': 'CRV', sfn: 'SFN-KIT',
  optics: 'QDD-400G-DR4', fibre: 'MPO24-TRUNK', dac: 'QSFP-100G-CU', patch: 'LC-OM4-3M',
};
const KEYWORDS: [RegExp, string][] = [
  [/gpu/i, 'XE9680'], [/storage|flasharray/i, 'FA-X70'], [/server/i, 'R760'], [/spine/i, 'N9K-9336C'], [/leaf|top-of-rack|tor\b/i, '7050X3'], [/router/i, 'MX480'], [/firewall/i, 'PA-5450'],
  [/optic|qsfp|transceiver/i, 'QDD-400G-DR4'], [/trunk|mpo/i, 'MPO24-TRUNK'], [/patch panel/i, 'CCH-01U'], [/patch|fibre|fiber/i, 'LC-OM4-3M'], [/dac|copper/i, 'QSFP-100G-CU'],
  [/rack pdu|power strip|rpdu/i, 'GU2-30'], [/rack enclosure|\brack\b/i, 'AR3300'], [/containment/i, 'SMARTAISLE'], [/blanking/i, 'AR8136BLK'], [/rail/i, 'RK-UNIV'], [/cage nut/i, 'CABSCRWM6'],
  [/ups/i, '9395XR-1250'], [/battery/i, '93PM-BC'], [/generator|genset/i, 'C3516C'], [/transformer/i, 'TRIHAL-2500'], [/transfer switch|sts/i, 'STS16'], [/busway/i, 'BB800'], [/floor.*pdu|pdu/i, 'PD2-S'],
  [/chiller|dry cooler/i, 'AFC-1500'], [/crah|air handler|fan wall/i, 'PEX4'], [/cdu|coolant/i, 'XDU1350'], [/in-row|rear-door/i, 'CRV'], [/manifold|leak/i, 'SFN-KIT'], [/cable tray/i, 'TRAY-300'], [/fire-stop|firestop/i, 'FIRESTOP'],
];
/** The catalogue item a bill-of-materials line resolves to: part number, then model, then the planner's item kind, then keywords. */
export function resolveMaterial(materials: T.Material[], line: { partNumber?: string; description?: string; model?: string; kind?: string }): T.Material | undefined {
  const byPart = (p?: string) => (p ? materials.find(m => m.partNumber.toLowerCase() === p.toLowerCase()) : undefined);
  const hit = byPart(line.partNumber) ?? byPart(line.model)
    ?? (line.model ? materials.find(m => CATALOGUE_ITEMS.find(c => c.partNumber === m.partNumber)?.model === line.model || m.description.toLowerCase().includes(line.model!.toLowerCase())) : undefined)
    ?? byPart(line.kind ? PLANNER_KIND_PART[line.kind] : undefined);
  if (hit) return hit;
  const text = `${line.description ?? ''}`;
  for (const [re, part] of KEYWORDS) if (re.test(text)) return byPart(part);
  return undefined;
}
/** A catalogue mirror for an item the platform knows but DCOS has not mirrored yet (kind and category from the line). */
export function mirrorFor(line: { partNumber: string; description: string; manufacturer: string; unitCost: number; category?: string }): CatalogueItem {
  const c = (line.category ?? '').toLowerCase();
  const category: Cat = /compute|server/.test(c) ? 'Compute' : /network/.test(c) ? 'Network' : /cabling/.test(c) ? 'Cabling' : /cool/.test(c) ? 'Cooling' : /power/.test(c) ? 'Power' : /rack/.test(c) ? 'Rack' : 'Other';
  const serialised = ['Compute', 'Network'].includes(category) || line.unitCost >= 5000;
  return { partNumber: line.partNumber, description: line.description.split(' — ')[0], manufacturer: line.manufacturer, kind: serialised ? 'Serialised' : 'Consumable', category, uom: 'each', unitCost: line.unitCost };
}

/* ------------------------------------------------------------------ procurement recipes */
/** What a project of each template buys, per rack position (`rack`) or per project (`job`). */
export const TEMPLATE_RECIPES: Record<string, KitRule[]> = {
  'Rack Deployment': [K('AR3300', 1, 'rack'), K('GU2-30', 2, 'rack'), K('R760', 8, 'rack'), K('7050X3', 1, 'rack'), K('RK-UNIV', 8, 'rack'), K('CABSCRWM6', 1, 'rack'), K('BLANK-1U', 12, 'rack'), K('LC-OM4-3M', 16, 'rack'), K('CAT6A-3M', 24, 'rack'), K('PC-C13C14-2M', 20, 'rack')],
  'Hall Fit-out': [K('PD2-S', 4), K('BB800', 120), K('PEX4', 4), K('SMARTAISLE', 4), K('AR3300', 1, 'rack'), K('GU2-30', 2, 'rack'), K('N9K-9336C', 2), K('7050X3', 8), K('QDD-400G-DR4', 32), K('MPO24-TRUNK', 16), K('LC-OM4-3M', 12, 'rack'), K('BLANK-1U', 10, 'rack')],
  'Capacity Expansion': [K('XE9680', 2, 'rack'), K('7050X3', 1, 'rack'), K('GU2-30', 2, 'rack'), K('QDD-400G-DR4', 8, 'rack'), K('RK-UNIV', 2, 'rack'), K('PC-C19C20-2M', 12, 'rack')],
  'Network Refresh': [K('N9K-9336C', 2), K('7050X3', 8), K('QDD-400G-DR4', 32), K('QSFP-100G-SR4', 32), K('MPO12-OM4', 16), K('LC-OM4-3M', 48)],
  'Server Refresh': [K('R760', 8, 'rack'), K('RK-UNIV', 8, 'rack'), K('PC-C13C14-2M', 16, 'rack'), K('SFP-25G-SR', 16, 'rack')],
  'Rack Replacement': [K('AR3300', 1, 'rack'), K('GU2-30', 2, 'rack'), K('BLANK-1U', 12, 'rack'), K('CABSCRWM6', 1, 'rack')],
  'Greenfield DC Build': [K('9395XR-1250', 4), K('93PM-BC', 8), K('C3516C', 3), K('TRIHAL-2500', 2), K('AFC-1500', 3), K('PEX4', 8), K('MPO24-TRUNK', 24), K('MX480', 2), K('PA-5450', 2)],
  'MEP & Plant Installation': [K('9395XR-1250', 4), K('93PM-BC', 8), K('STS16', 4), K('BB800', 200), K('CU-16MM', 800), K('AFC-1500', 3), K('PEX4', 8), K('PIPE-DN50', 300)],
  'Plant Upgrade Works': [K('9395XR-1250', 2), K('93PM-BC', 4), K('CU-16MM', 120)],
  'Liquid Retrofit': [K('XDU1350', 2), K('SFN-KIT', 1, 'rack'), K('PIPE-DN50', 200), K('GU2-30', 2, 'rack'), K('PC-C19C20-2M', 12, 'rack')],
  'DCI / WAN Uplift': [K('QDD-400G-ZR', 8), K('LC-OS2-5M', 16), K('QDD-400G-DR4', 8)],
  'Edge Site Rollout': [K('VR3300', 3), K('SRT10K', 3), K('N9K-C93180', 3), K('R760', 6), K('OM2248', 3)],
  'Migration Wave': [K('LC-OM4-3M', 48), K('CAT6A-3M', 48), K('PC-C13C14-2M', 48), K('RK-UNIV', 12)],
};
