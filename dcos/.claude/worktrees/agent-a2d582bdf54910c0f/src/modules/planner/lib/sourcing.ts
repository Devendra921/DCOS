/**
 * Sourcing — resolves every bill-of-materials line against what the company already has.
 *
 * Order for each line:
 *  1. Spare capacity at an existing site: empty planned or reserved rack positions, UPS headroom,
 *     cooling headroom, site plant headroom (only for plans that work inside a live site).
 *  2. Stock: devices of the chosen model that are staged or received and not racked or reserved —
 *     at the same site first, then the central depot, then other sites (transfer).
 *  3. Procurement: the preferred catalogue model that is not near end of life, from its vendor,
 *     under that vendor's active contract, with the lead time from the benchmarks.
 *
 * IT lines expressed per rack (GPU, compute, storage racks) are converted into server units of the
 * chosen model, using the model's typical power and height.
 */
import type * as T from '../../../mock/data/types';
import type { Evaluation } from './engine';
import type { Bom, BomItem } from './outputs';
import { CATALOGUE, chooseOption, type CatalogueOption } from './catalogue';

export interface SourcingContext { devices: T.Device[]; vendors: T.Vendor[]; contracts: T.Contract[]; assetModels: T.AssetModel[]; racks: T.Rack[]; upsUnits: T.UPS[]; coolingZones: T.CoolingZone[]; dataCenters: T.DataCenter[] }
export type SourceKind = 'site' | 'stock' | 'procure';
export interface Allocation { source: SourceKind; qty: number; note: string; unitCost: number; vendorId?: string; vendorName?: string; contractId?: string; deviceIds?: string[]; rackIds?: string[]; leadWeeks?: number }
export interface SourcedLine extends BomItem { model?: string; vendorName?: string; allocations: Allocation[]; fromSite: number; fromStock: number; toBuy: number; buyCost: number; avoidedCost: number; substituted?: string }
export interface VendorOrder { vendorId?: string; vendorName: string; contractId?: string; contractLabel: string; lines: SourcedLine[]; value: number; leadWeeks: number }
export interface SourcedBom { lines: SourcedLine[]; total: number; buyTotal: number; stockValue: number; siteValue: number; vendors: VendorOrder[]; stockDeviceIds: string[]; siteRackIds: string[]; warnings: string[] }

const EXISTING_SITE: T.PlannerScope[] = ['rack', 'pod', 'hall', 'retrofit', 'plant', 'server-refresh', 'network-refresh', 'rack-replace'];
const isFree = (d: T.Device) => !d.rackId && (d.lifecycleState === 'Staged' || d.lifecycleState === 'Received') && !String(d.notes ?? '').startsWith('Reserved for');

export function sourceBom(plan: T.PlannerPlan, ev: Evaluation, bom: Bom, ctx: SourcingContext): SourcedBom {
  const warnings: string[] = []; const usedDevices = new Set<string>(); const usedRacks = new Set<string>();
  const onSite = EXISTING_SITE.includes(plan.scope) && !!plan.dataCenterId;
  const dc = ctx.dataCenters.find(d => d.id === plan.dataCenterId);
  const needBy = plan.targetGoLive;
  const vendorRec = (name: string) => ctx.vendors.find(v => v.name === name);
  const contractFor = (vendorId?: string) => {
    const list = ctx.contracts.filter(c => c.vendorId === vendorId && c.status === 'Active' && new Date(c.endDate).getTime() > Date.now());
    return list.find(c => c.type === 'Support') ?? list.find(c => c.type === 'SLA') ?? list[0];
  };
  // Site headroom, consumed as lines use it.
  let upsFree = onSite ? ctx.upsUnits.filter(u => u.dataCenterId === plan.dataCenterId).reduce((a, u) => a + Math.max(0, u.capacityKw - u.loadKw), 0) : 0;
  let coolFree = onSite ? ctx.coolingZones.filter(z => z.dataCenterId === plan.dataCenterId).reduce((a, z) => a + Math.max(0, z.headroomKw), 0) : 0;
  const drawn = onSite ? ctx.racks.filter(r => r.dataCenterId === plan.dataCenterId).reduce((a, r) => a + r.currentPowerKw, 0) : 0;
  const plantFree = onSite && dc ? Math.max(0, dc.designPowerKw - drawn) : 0;
  const hallId = plan.params.targetHallId as string | undefined;
  const freePositions = onSite && plan.scope !== 'rack-replace' ? ctx.racks.filter(r => r.dataCenterId === plan.dataCenterId && (!hallId || r.hallId === hallId) && (r.status === 'Planned' || r.status === 'Reserved') && r.currentPowerKw === 0) : [];
  const need = ev.sizing.itKw * 1.1;

  const lines: SourcedLine[] = bom.lines.map(raw => {
    const cat = CATALOGUE[raw.kind];
    let line: BomItem = raw; let option: CatalogueOption | undefined; let substituted: string | undefined;
    if (cat) {
      const preferred = REPLACEMENT_MODEL(plan, raw.kind);
      const pick = chooseOption(raw.kind, needBy, ctx.assetModels, ctx.vendors, preferred);
      option = pick.option;
      if (pick.skipped.length) { substituted = pick.skipped.map(x => `${x.model} (${x.reason})`).join(', '); warnings.push(`${cat.label}: skipped ${substituted}; using ${option.model}`); }
      // Per-rack IT lines become server units of the chosen model.
      if ((raw.kind === 'gpu-server' || raw.kind === 'server' || raw.kind === 'storage') && raw.unit === 'rack') {
        const m = ctx.assetModels.find(x => x.model === option!.model);
        const rackKw = Number(/(\d+(?:\.\d+)?) kW per rack/.exec(raw.spec)?.[1] ?? ev.params['densityKwPerRack']?.value ?? 12);
        const perRack = m ? Math.max(1, Math.min(Math.floor((rackKw * 1000) / Math.max(200, m.typicalPowerW)), Math.floor(42 / Math.max(1, m.heightU)))) : 8;
        const qty = raw.qty * perRack;
        line = { ...raw, item: `${cat.label}s`, spec: `${option.model}, ${perRack} per rack in ${raw.qty} rack${raw.qty === 1 ? '' : 's'}`, qty, unit: 'each', unitCost: option.unitPrice || raw.unitCost, total: qty * (option.unitPrice || raw.unitCost), manufacturer: option.manufacturer };
      } else if (option.unitPrice && (cat.stockable || raw.kind === 'rack')) {
        line = { ...raw, unitCost: option.unitPrice, total: raw.qty * option.unitPrice, manufacturer: option.manufacturer, spec: raw.spec.includes(option.model) ? raw.spec : `${option.model} · ${raw.spec}` };
      } else line = { ...raw, manufacturer: raw.manufacturer === 'To tender' ? option.manufacturer : raw.manufacturer };
    }
    const allocations: Allocation[] = []; let remaining = line.qty;
    // 1. Site capacity.
    // A plant upgrade adds the very plant it would otherwise reuse, so only rack positions count there.
    if (onSite && cat?.siteCapacity && remaining > 0 && (plan.scope !== 'plant' || cat.siteCapacity === 'positions')) {
      if (cat.siteCapacity === 'positions' && freePositions.length) {
        const take = freePositions.filter(r => !usedRacks.has(r.id)).slice(0, remaining);
        take.forEach(r => usedRacks.add(r.id));
        if (take.length) { allocations.push({ source: 'site', qty: take.length, unitCost: 0, rackIds: take.map(r => r.id), note: `${take.length} planned or reserved rack position${take.length === 1 ? '' : 's'} at ${dc?.name ?? 'the site'}` }); remaining -= take.length; }
      }
      if (cat.siteCapacity === 'ups' && upsFree >= need) { allocations.push({ source: 'site', qty: remaining, unitCost: 0, note: `Existing UPS has ${Math.round(upsFree)} kW free` }); upsFree -= need; remaining = 0; }
      if (cat.siteCapacity === 'cooling' && coolFree >= need) { allocations.push({ source: 'site', qty: remaining, unitCost: 0, note: `Existing cooling has ${Math.round(coolFree)} kW headroom` }); coolFree -= need; remaining = 0; }
      if (cat.siteCapacity === 'plant' && plan.scope !== 'plant' && plantFree >= need) { allocations.push({ source: 'site', qty: remaining, unitCost: 0, note: `Site plant has ${Math.round(plantFree)} kW free` }); remaining = 0; }
    }
    // 2. Stock.
    if (cat?.stockable && option?.device && remaining > 0) {
      const pool = ctx.devices.filter(d => d.model === option!.model && isFree(d) && !usedDevices.has(d.id));
      const ranked = [...pool.filter(d => d.dataCenterId === plan.dataCenterId), ...pool.filter(d => !d.dataCenterId), ...pool.filter(d => d.dataCenterId && d.dataCenterId !== plan.dataCenterId)];
      const take = ranked.slice(0, remaining);
      if (take.length) {
        take.forEach(d => usedDevices.add(d.id));
        const atSite = take.filter(d => d.dataCenterId && d.dataCenterId === plan.dataCenterId).length, depot = take.filter(d => !d.dataCenterId).length, transfer = take.length - atSite - depot;
        allocations.push({ source: 'stock', qty: take.length, unitCost: 0, deviceIds: take.map(d => d.id), note: [atSite && `${atSite} spare at the site`, depot && `${depot} from the central depot`, transfer && `${transfer} transferred from other sites`].filter(Boolean).join(', ') });
        remaining -= take.length;
      }
    }
    // 3. Procurement.
    if (remaining > 0) {
      const v = option ? vendorRec(option.vendor) : undefined;
      const c = contractFor(v?.id);
      if (option && option.vendor !== 'Utility' && !v) warnings.push(`${line.item}: no vendor record for ${option.vendor}`);
      if (v && !c) warnings.push(`${line.item}: ${v.name} has no active contract; buy on a one-off order`);
      allocations.push({ source: 'procure', qty: remaining, unitCost: line.unitCost, vendorId: v?.id, vendorName: v?.name ?? option?.vendor ?? 'To tender', contractId: c?.id, leadWeeks: line.leadWeeks, note: c ? `${v?.name} under ${c.type.toLowerCase()} contract ${c.ctrId}` : v ? `${v.name}, one-off order` : 'To tender' });
    }
    const fromSite = allocations.filter(a => a.source === 'site').reduce((a, x) => a + x.qty, 0);
    const fromStock = allocations.filter(a => a.source === 'stock').reduce((a, x) => a + x.qty, 0);
    const toBuy = allocations.filter(a => a.source === 'procure').reduce((a, x) => a + x.qty, 0);
    return { ...line, model: option?.model, vendorName: option?.vendor, allocations, fromSite, fromStock, toBuy, buyCost: Math.round(toBuy * line.unitCost), avoidedCost: Math.round((fromSite + fromStock) * line.unitCost), substituted };
  });

  // Purchase orders: one per vendor, under its contract.
  const byVendor = new Map<string, VendorOrder>();
  for (const l of lines) for (const a of l.allocations.filter(x => x.source === 'procure')) {
    const key = a.vendorName ?? 'To tender';
    const vo = byVendor.get(key) ?? { vendorId: a.vendorId, vendorName: key, contractId: a.contractId, contractLabel: a.contractId ? (ctx.contracts.find(c => c.id === a.contractId)?.ctrId ?? a.contractId) : 'no contract', lines: [], value: 0, leadWeeks: 0 };
    vo.lines.push(l); vo.value += Math.round(a.qty * a.unitCost); vo.leadWeeks = Math.max(vo.leadWeeks, a.leadWeeks ?? 0);
    byVendor.set(key, vo);
  }
  const vendors = [...byVendor.values()].sort((a, b) => b.value - a.value);
  return {
    lines, total: lines.reduce((a, l) => a + l.total, 0), buyTotal: lines.reduce((a, l) => a + l.buyCost, 0), stockValue: lines.reduce((a, l) => a + (l.fromStock * l.unitCost), 0), siteValue: lines.reduce((a, l) => a + (l.fromSite * l.unitCost), 0),
    vendors, stockDeviceIds: [...usedDevices], siteRackIds: [...usedRacks], warnings: [...new Set(warnings)],
  };
}

/** Replacement plans name the model to use; others take the catalogue preference. */
function REPLACEMENT_MODEL(plan: T.PlannerPlan, kind: string): string | undefined {
  if (kind === 'rack' && plan.params.rackModel) return String(plan.params.rackModel);
  if (plan.params.replacementModel && (plan.scope === 'server-refresh' || plan.scope === 'network-refresh')) return String(plan.params.replacementModel);
  return undefined;
}
