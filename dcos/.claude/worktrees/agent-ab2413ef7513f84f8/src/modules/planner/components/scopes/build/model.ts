/* Build family UI helpers (no components here). */
import type * as T from '../../../../../mock/data/types';
import type { Evaluation } from '../../../lib/engine';
import { buildScope, type BuildAnalysis } from '../../../lib/scopes/build';

export const kwText = (n: number) => (Math.abs(n) >= 1000 ? `${(Math.round(n / 100) / 10).toLocaleString('en-US')} MW` : `${Math.round(n).toLocaleString('en-US')} kW`);
export const dayText = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const monthText = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—');
export const analysisOf = (ev?: Evaluation): BuildAnalysis | undefined => buildScope(ev);
export const toDate = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
export const fromDate = (v: string, fallback: string) => (v ? new Date(`${v}T00:00:00Z`).toISOString() : fallback);

/** A blank candidate plot (the planner fills in the survey and grid offer). */
export function newCandidate(n: number, regionId?: string, climate?: T.PlannerPlan['climate']): T.PlannerCandidateSite {
  return { id: `C${n}`, name: `Candidate ${n}`, regionId, climate, plotHa: 0, buildableHa: 0, zoning: 'Unknown', gridOfferMva: 0, gridEnergisation: '', gridFirm: true, waterM3PerDay: 0, fibreRoutes: 0, kmToPop: 0, floodZone: false, seismicZone: false, landCostUsd: 0, chosen: n === 1 };
}

/** Phases (waves) and capacity that follow from the edge site rows. */
export function edgeDraftPatch(draft: T.PlannerPlan, sites: T.PlannerSiteRow[], waveDates?: string[]): Partial<T.PlannerPlan> {
  const dates = waveDates ?? [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).map(p => p.goLive);
  const waves = Math.max(1, ...sites.map(s => s.wave ?? 1), dates.length ? 1 : 0);
  const density = Math.max(1, Number(draft.params.densityKwPerRack ?? draft.demand.densityKwPerRack ?? 8) || 8);
  const phases: T.PlannerPhase[] = [];
  for (let w = 1; w <= waves; w++) {
    const rows = sites.filter(s => (s.wave ?? 1) === w);
    const goLive = dates[w - 1] ?? dates[dates.length - 1] ?? draft.targetGoLive;
    if (!rows.length && w > dates.length) continue;
    phases.push({ id: `W${w}`, name: `Wave ${w} · ${rows.length} site${rows.length === 1 ? '' : 's'}`, goLive, itKw: rows.reduce((a, r) => a + r.itKw, 0), halls: rows.length, racks: rows.reduce((a, r) => a + Math.ceil(r.itKw / density), 0), status: 'Planned' });
  }
  const withDates = sites.map(s => ({ ...s, goLive: phases[(s.wave ?? 1) - 1]?.goLive ?? s.goLive }));
  const total = withDates.reduce((a, r) => a + r.itKw, 0);
  const last = phases.reduce((m, p) => (p.goLive > m ? p.goLive : m), draft.targetGoLive);
  return { sites: withDates, phases, designPowerKw: total, targetGoLive: phases.length ? last : draft.targetGoLive, params: { ...draft.params, siteCount: withDates.length } };
}
