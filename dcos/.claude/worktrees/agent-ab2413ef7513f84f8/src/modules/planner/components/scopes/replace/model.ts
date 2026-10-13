/* View helpers for the replace and migration families (no React components here). */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type * as T from '../../../../../mock/data/types';
import { db } from '../../../../../mock/db';
import { nextId } from '../../../lib/execute';
import { EXECUTION_COLLECTIONS, PLANNER_ENTITIES } from '../../../lib/usePlanner';
import type { PlannerData } from '../../../lib/plannerData';
import type { RecordChanges } from '../../../lib/replaceClose';
import { effectiveMapping, toPlanMapping, oldDevicesOf, type SelectionCriteria } from '../../../lib/replaceCore';

/** Draft changes for a new selection: ids, counts, kW, the mapping (keeping choices already made) and only executed waves. */
export function selectionPatch(draft: T.PlannerPlan, data: PlannerData, ids: string[], criteria: SelectionCriteria): Partial<T.PlannerPlan> {
  const params: T.PlannerPlan['params'] = { ...draft.params, affectedIds: ids.join(','), affectedSiteId: draft.dataCenterId ?? '', selectionCriteria: JSON.stringify(criteria) };
  const next = { ...draft, params };
  const old = oldDevicesOf(data, next);
  const racks = draft.scope === 'rack-replace' ? ids : [...new Set(old.map(d => d.rackId!).filter(Boolean))];
  const oldKw = old.reduce((a, d) => a + (d.powerDrawW ?? 0), 0) / 1000;
  const mapping = draft.scope === 'rack-replace' ? [] : toPlanMapping(effectiveMapping(data, next, old, { replacementModel: String(draft.params.replacementModel ?? ''), consolidationRatio: Number(draft.params.consolidationRatio ?? 2), oldEquipment: String(draft.params.oldEquipment ?? '') }));
  const newKw = mapping.reduce((a, m) => a + m.newKw, 0);
  const kept = (draft.waves ?? []).filter(w => w.status !== 'Planned');
  return {
    params: { ...params, affectedCount: draft.scope === 'rack-replace' ? racks.length : old.length, affectedRacks: racks.length, affectedDevices: old.length, affectedKw: Math.round(oldKw * 10) / 10 },
    paramSources: { ...draft.paramSources, affectedIds: 'user', affectedCount: 'user', selectionCriteria: 'user' },
    mapping, waves: kept, phases: kept.length ? draft.phases : [], designPowerKw: Math.max(0, Math.round(draft.scope === 'rack-replace' ? oldKw : newKw)),
  };
}
/** Everything a selection leaves behind when the site changes. */
export function clearedSelection(draft: T.PlannerPlan): Partial<T.PlannerPlan> {
  const params = { ...draft.params };
  for (const k of Object.keys(params)) if (k.startsWith('affected') || k.startsWith('swap:') || k === 'selectionCriteria') delete params[k];
  return { params, mapping: [], waves: [], phases: [], consents: [], designPowerKw: 0 };
}

/** Write a set of record changes (wave close, certificate, site retirement) and refresh the views. */
export function useApplyChanges() {
  const qc = useQueryClient();
  return useCallback((plan: T.PlannerPlan, changes: RecordChanges) => {
    for (const c of changes.creates) db.create(c.entity, c.rec);
    for (const u of changes.updates) db.update(u.entity, u.id, u.patch);
    if (Object.keys(changes.plan).length) db.update('plannerPlans', plan.id, { ...changes.plan, updatedAt: new Date().toISOString() } as Record<string, unknown>);
    for (const k of [...EXECUTION_COLLECTIONS, ...PLANNER_ENTITIES, 'managedDevices', 'configChanges', 'circuitTerminations', 'powerFeeds']) void qc.invalidateQueries({ queryKey: [k] });
  }, [qc]);
}
/** Sequential ids for records a wave close creates. */
export const idFor = (entity: string, prefix: string) => nextId(entity, prefix);
/** Records outside the planner bundle that a close also updates. */
export function extraRecords() {
  const all = <X,>(e: string) => db.getAll(e, { pageSize: 100000 }).data as unknown as X[];
  return { configChanges: all<T.ConfigChange>('configChanges'), managedDevices: all<T.ManagedDevice>('managedDevices'), atps: all<T.Atp>('atps') };
}
export const fmtWhen = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '—');
export const toLocalInput = (iso?: string) => (iso ? iso.slice(0, 16) : '');
export const fromLocalInput = (v: string, hours: number) => { const s = new Date(`${v}:00Z`); return { start: s.toISOString(), end: new Date(s.getTime() + hours * 3600e3).toISOString() }; };
