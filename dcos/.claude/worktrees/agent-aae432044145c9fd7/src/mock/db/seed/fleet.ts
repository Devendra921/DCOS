/**
 * Fleet seed — the hardware realities planning must work with:
 *  - an older generation still in service (Dell R740, HPE DL380 Gen10, Cisco Nexus 3172PQ,
 *    Juniper QFX5100) on expired warranties, at Ashburn DC-1, Dublin CO-1 and Frankfurt, so refresh plans
 *    have real candidates;
 *  - a central depot and per-site spares (servers, switches, rack power strips, console
 *    servers) staged or received but not racked, so plans can take equipment from stock.
 * Runs after estate, DCIM and delivery (vendors, contracts) and before the planner.
 */
import type * as T from '../../data/types';
import type { Seed } from './ctx';

interface Legacy { mfr: string; model: string; cat: T.AssetModel['category']; u: number; typ: number; max: number; kg: number; eolDaysAgo: number; role: string }
const LEGACY: Legacy[] = [
  { mfr: 'Dell', model: 'PowerEdge R740', cat: 'Server', u: 2, typ: 420, max: 750, kg: 28, eolDaysAgo: 120, role: 'Server' },
  { mfr: 'HPE', model: 'ProLiant DL380 Gen10', cat: 'Server', u: 2, typ: 400, max: 800, kg: 27, eolDaysAgo: 60, role: 'Server' },
  { mfr: 'Cisco', model: 'Nexus 3172PQ', cat: 'Switch', u: 1, typ: 180, max: 290, kg: 9, eolDaysAgo: 300, role: 'Leaf/ToR' },
  { mfr: 'Juniper', model: 'QFX5100-48S', cat: 'Switch', u: 1, typ: 200, max: 310, kg: 10, eolDaysAgo: 420, role: 'Leaf/ToR' },
];

export function seedFleet(S: Seed): void {
  const vendorOf = (mfr: string) => S.vendors.find(v => v.name.toLowerCase().startsWith(mfr.toLowerCase().split(' ')[0]));

  // ── legacy models, device types and expired warranties ──
  const modelId: Record<string, string> = {}; const typeId: Record<string, string> = {}; const warrantyId: Record<string, string> = {};
  for (const l of LEGACY) {
    const id = S.nid('AMOD');
    S.assetModels.push({ id, amodelId: id, ...S.meta(), manufacturer: l.mfr, model: l.model, category: l.cat, heightU: l.u, typicalPowerW: l.typ, maxPowerW: l.max, weightKg: l.kg, formFactor: `${l.u}U`, eolDate: S.daysAgo(l.eolDaysAgo), notes: `${l.cat} — ${l.mfr} ${l.model} (previous generation)` } as T.AssetModel);
    modelId[l.model] = id;
    const tmpl = S.deviceTypes.find(d => d.role === l.role) ?? S.deviceTypes[0];
    const dtId = S.nid('DT');
    S.deviceTypes.push({ ...tmpl, id: dtId, dtId, ...S.meta(), manufacturer: l.mfr, model: l.model, slug: `${l.mfr}-${l.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), partNumber: l.model.replace(/\s+/g, '-').toUpperCase(), uHeight: l.u, description: `${l.mfr} ${l.model} — previous generation, end of life` });
    typeId[l.model] = dtId;
    const v = vendorOf(l.mfr) ?? vendorOf(l.mfr === 'Cisco' ? 'Cisco Systems' : l.mfr === 'Juniper' ? 'Juniper Networks' : l.mfr);
    if (v && !warrantyId[l.mfr]) {
      const ctrId = S.nid('CTR');
      S.contracts.push({ id: ctrId, ctrId, ...S.meta(), vendorId: v.id, type: 'Warranty', startDate: S.daysAgo(6 * 365), endDate: S.daysAgo(150 + LEGACY.indexOf(l) * 40), value: 180000, status: 'Expired', notes: `Hardware warranty for the ${l.mfr} fleet bought in ${new Date(S.daysAgo(6 * 365)).getFullYear()}` } as T.Contract);
      warrantyId[l.mfr] = ctrId;
    }
  }

  // ── convert part of the fleet at two sites to the previous generation ──
  const dcByCode = (prefix: string) => S.dataCenters.find(d => d.code.startsWith(prefix));
  const age = (years: number) => S.daysAgo(Math.round(years * 365) + S.int(0, 120));
  const convert = (dc: T.DataCenter | undefined, cats: string[], model: string, mfr: string, count: number, everyNth: number) => {
    if (!dc) return;
    const pool = S.devices.filter(d => d.dataCenterId === dc.id && d.rackId && cats.includes(String(d.category)) && d.lifecycleState === 'Active');
    pool.filter((_, i) => i % everyNth === 0).slice(0, count).forEach((d, i) => {
      Object.assign(d, { model, manufacturer: mfr, assetModelId: modelId[model], deviceTypeId: typeId[model], commissionedDate: age(6), warrantyContractId: warrantyId[mfr], notes: 'Previous generation, warranty expired' });
      if (i % 9 === 4) Object.assign(d, { status: 'Faulty' });
    });
  };
  convert(dcByCode('ASH-DC1'), ['Server'], 'PowerEdge R740', 'Dell', 48, 2);
  convert(dcByCode('ASH-DC1'), ['Storage'], 'ProLiant DL380 Gen10', 'HPE', 12, 3);
  convert(dcByCode('DUB-CO1'), ['Switch'], 'Nexus 3172PQ', 'Cisco', 24, 3);
  convert(dcByCode('FRA'), ['Switch'], 'QFX5100-48S', 'Juniper', 16, 3);

  // ── spares: a central depot plus a few per site, cloned from live devices of the same model ──
  const like = (model: string) => S.devices.find(d => d.model === model);
  const stock = (model: string, qty: number, dc: T.DataCenter | undefined, state: 'Staged' | 'Received') => {
    const tmpl = like(model); if (!tmpl) return;
    for (let i = 0; i < qty; i++) {
      const id = S.nid('STK');
      S.devices.push({ ...tmpl, id, devcId: id, ...S.meta(), name: `${model.replace(/\s+/g, '-').toLowerCase()}-spare-${id.slice(-4)}`, hostname: undefined, rackId: undefined, position: undefined, face: undefined, dataCenterId: dc?.id, status: 'Inactive', lifecycleState: state, serial: `SPR${S.int(100000, 999999)}`, assetTag: id, primaryIp4: undefined, oobIp: undefined, commissionedDate: undefined, notes: dc ? `Spare at ${dc.name}` : 'Central depot', tags: [] } as T.Device);
    }
  };
  const depot = undefined;
  stock('PowerEdge R760', 30, depot, 'Staged');
  stock('ProLiant DL380 Gen11', 16, depot, 'Staged');
  stock('PowerEdge XE9680', 6, depot, 'Received');
  stock('FlashArray //X70', 2, depot, 'Received');
  stock('7050X3-48YC8', 14, depot, 'Staged');
  stock('QFX5120-48Y', 6, depot, 'Staged');
  stock('Nexus 9336C-FX2', 4, depot, 'Received');
  stock('Geist rPDU 3-phase', 40, depot, 'Staged');
  stock('OM2248 Console Server', 6, depot, 'Staged');
  stock('PowerEdge R760', 6, dcByCode('ASH-DC1'), 'Staged');
  stock('7050X3-48YC8', 4, dcByCode('DUB-CO1'), 'Staged');
}
