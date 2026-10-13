/**
 * Site 360 — what needs attention.
 *
 * Reads the site model once and returns the racks, halls and buildings that deserve a
 * beacon in the twin and a row in the "Needs attention" list: open incidents, active
 * alarms, hot inlets, racks close to their power budget, failed cooling units and UPS
 * units that are not operational. Every map is sorted worst first so callers can take
 * the head of the list without re-sorting.
 */
import { useMemo } from 'react';
import type { BuildingVm, HallVm, RackVm, SiteModel } from './siteModel';

export type AttentionSeverity = 'critical' | 'major';
export type AttentionKind = 'rack' | 'hall' | 'building';

export interface AttentionItem {
  /** Entity id (rack, hall or building id). */
  id: string;
  kind: AttentionKind;
  name: string;
  /** Where the item sits: the hall for a rack, the building for a hall. */
  where: string;
  severity: AttentionSeverity;
  /** Human-readable reasons, worst first. */
  reasons: string[];
  /** Higher is worse; critical items always sort above major ones. */
  score: number;
  rackId?: string;
  hallId?: string;
  buildingId?: string;
}

export interface SiteAttention {
  racks: Map<string, AttentionItem>;
  halls: Map<string, AttentionItem>;
  buildings: Map<string, AttentionItem>;
  /** Every rack and hall item, worst first (buildings are aggregates and are left out). */
  items: AttentionItem[];
  counts: { critical: number; major: number };
}

/** Inlet temperature above which a rack is flagged. */
export const ATTENTION_INLET_C = 27;
/** Share of the rack power budget above which a rack is flagged. */
export const ATTENTION_POWER_PCT = 90;

const EMPTY: SiteAttention = { racks: new Map(), halls: new Map(), buildings: new Map(), items: [], counts: { critical: 0, major: 0 } };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const worse = (a: AttentionSeverity, b: AttentionSeverity): AttentionSeverity => (a === 'critical' || b === 'critical' ? 'critical' : 'major');
const byWorst = (a: AttentionItem, b: AttentionItem) => (a.severity === b.severity ? b.score - a.score : a.severity === 'critical' ? -1 : 1);

/** Attention for one rack, or undefined when it is healthy. */
export function rackAttention(vm: RackVm, hallName = ''): AttentionItem | undefined {
  const reasons: string[] = []; let critical = false; let score = 0;
  if (vm.incidents > 0) { critical = true; reasons.push(`${plural(vm.incidents, 'open incident')}`); score += 40 * vm.incidents; }
  if (vm.powerPct >= ATTENTION_POWER_PCT) { if (vm.powerPct > vm.blockPct) critical = true; reasons.push(`${vm.powerPct}% of power budget`); score += 10 + (vm.powerPct - ATTENTION_POWER_PCT) * 2; }
  if (vm.inletC > ATTENTION_INLET_C) { if (vm.inletC >= 32) critical = true; reasons.push(`${vm.inletC} °C inlet`); score += Math.round((vm.inletC - ATTENTION_INLET_C) * 4); }
  if (vm.alarms > 0) { reasons.push(`${plural(vm.alarms, 'active alarm')}`); score += 6 * vm.alarms; }
  if (!reasons.length) return undefined;
  return { id: vm.rack.id, rackId: vm.rack.id, hallId: vm.rack.hallId, kind: 'rack', name: vm.rack.name, where: hallName, severity: critical ? 'critical' : 'major', reasons, score };
}

/** Attention for one hall: its own plant plus the racks inside it. */
export function hallAttention(h: HallVm, racks: AttentionItem[], upsStatusById: Map<string, string>): AttentionItem | undefined {
  const reasons: string[] = []; let severity: AttentionSeverity | undefined; let score = 0;
  const failedCooling = h.cracs.filter((c) => c.status === 'Failed');
  if (failedCooling.length) { severity = 'critical'; reasons.push(`${plural(failedCooling.length, 'cooling unit')} failed (${failedCooling.map((c) => c.name).join(', ')})`); score += 60 * failedCooling.length; }
  const upsIds = new Set(h.pdus.map((p) => p.upsId).filter((x): x is string => !!x));
  const badUps = [...upsIds].map((id) => ({ id, status: upsStatusById.get(id) })).filter((u) => u.status && u.status !== 'Operational');
  if (badUps.length) {
    const failed = badUps.some((u) => u.status === 'Failed');
    severity = worse(severity ?? 'major', failed ? 'critical' : 'major');
    reasons.push(`UPS ${badUps.map((u) => u.status).join(' / ')}`); score += failed ? 50 : 20;
  }
  if (racks.length) {
    const critical = racks.filter((r) => r.severity === 'critical').length;
    severity = worse(severity ?? 'major', critical ? 'critical' : 'major');
    reasons.push(`${plural(racks.length, 'rack')} need attention${critical ? ` (${critical} critical)` : ''}`);
    score += racks.reduce((s, r) => s + r.score, 0) / 2;
  }
  if (!severity) return undefined;
  return { id: h.hall.id, hallId: h.hall.id, buildingId: h.building?.id, kind: 'hall', name: h.hall.name, where: h.building?.name ?? '', severity, reasons, score: Math.round(score) };
}

/** Attention for a building: the worst of its halls. */
export function buildingAttention(b: BuildingVm, halls: AttentionItem[]): AttentionItem | undefined {
  if (!halls.length) return undefined;
  const critical = halls.filter((h) => h.severity === 'critical').length;
  return {
    id: b.building.id, buildingId: b.building.id, kind: 'building', name: b.building.name, where: '',
    severity: critical ? 'critical' : 'major', reasons: [`${plural(halls.length, 'hall')} need attention${critical ? ` (${critical} critical)` : ''}`, ...halls.slice(0, 3).map((h) => `${h.name}: ${h.reasons[0]}`)],
    score: Math.round(halls.reduce((s, h) => s + h.score, 0) / 2),
  };
}

/** Every attention item on the site, in maps sorted worst first. */
export function computeAttention(model: SiteModel): SiteAttention {
  if (!model.dc) return EMPTY;
  const hallNameById = new Map(model.halls.map((h) => [h.hall.id, h.hall.name]));
  const upsStatusById = new Map(model.ups.map((u) => [u.id, u.status as string]));
  const rackItems = model.racks.map((vm) => rackAttention(vm, hallNameById.get(vm.rack.hallId) ?? '')).filter((x): x is AttentionItem => !!x).sort(byWorst);
  const racksByHall = new Map<string, AttentionItem[]>();
  for (const it of rackItems) { const a = racksByHall.get(it.hallId!) ?? []; a.push(it); racksByHall.set(it.hallId!, a); }
  const hallItems = model.halls.map((h) => hallAttention(h, racksByHall.get(h.hall.id) ?? [], upsStatusById)).filter((x): x is AttentionItem => !!x).sort(byWorst);
  const hallsByBuilding = new Map<string, AttentionItem[]>();
  for (const it of hallItems) if (it.buildingId) { const a = hallsByBuilding.get(it.buildingId) ?? []; a.push(it); hallsByBuilding.set(it.buildingId, a); }
  const buildingItems = model.buildings.map((b) => buildingAttention(b, hallsByBuilding.get(b.building.id) ?? [])).filter((x): x is AttentionItem => !!x).sort(byWorst);
  const items = [...hallItems, ...rackItems].sort(byWorst);
  return {
    racks: new Map(rackItems.map((r) => [r.id, r])), halls: new Map(hallItems.map((h) => [h.id, h])), buildings: new Map(buildingItems.map((b) => [b.id, b])),
    items, counts: { critical: items.filter((i) => i.severity === 'critical').length, major: items.filter((i) => i.severity === 'major').length },
  };
}

/** Memoised attention for a model. */
export function useAttention(model: SiteModel): SiteAttention {
  return useMemo(() => computeAttention(model), [model]);
}
