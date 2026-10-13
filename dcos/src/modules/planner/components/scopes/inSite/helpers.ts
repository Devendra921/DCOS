/* Non-component helpers for the in-site panels (kept out of .tsx files for fast refresh). */
import type * as T from '../../../../../mock/data/types';
import type { Evaluation } from '../../../lib/engine';
import type { InSiteAnalysis, Shortfall } from '../../../lib/inSiteAnalysis';

export const kwFmt = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10} MW` : `${Math.round(n * 10) / 10} kW`);
export const usdFmt = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${Math.round(n)}`);
export const dayFmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '—');
export const analysisOf = (ev?: Evaluation): InSiteAnalysis | undefined => ev?.scope?.inSite as InSiteAnalysis | undefined;

/** Plain-English names of the in-site checks (the rule titles are longer). */
export const CHECK_LABEL: Record<string, string> = {
  'ins-u-block': 'Rack units', 'ins-rack-power': 'Rack power', 'ins-pdu': 'PDUs and outlets', 'ins-zone-cooling': 'Cooling zone', 'ins-weight': 'Weight',
  'ins-ports': 'Leaf ports', 'ins-ip': 'Addresses', 'ins-site-power': 'Site power chain', 'ins-positions': 'Positions', 'ins-hall-design': 'Hall design load',
  'ins-facility-water': 'Facility water', 'ins-dc-plant': 'AC or DC supply', 'ins-cdu': 'CDUs', 'ins-uprate': 'Power uprate', 'ins-waves': 'Waves',
  'ins-setpoint': 'Setpoint', 'ins-window': 'Change window', 'ins-containment': 'Containment', 'ins-spine-ports': 'Spine ports', 'liquid-above-density': 'Liquid above 30 kW',
};

/** Wizard link for a linked plant (or expansion) plan with the shortfall pre-filled. */
export function linkedPlanUrl(s: Shortfall, plan: T.PlannerPlan): string {
  const scope = s.expansion ? 'expansion' : 'plant';
  const q = new URLSearchParams({ scope, template: `TPL-PLAN-${scope}`, title: s.plantTitle, intent: `${s.plantIntent}. Linked to ${plan.plnId} (${plan.title}).` });
  return `/planning/new?${q.toString()}`;
}

export const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 } as const;
export const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 } as const;
export const muted = { fontSize: 12, color: 'var(--vw-color-slate-600)' } as const;
export const num = { textAlign: 'right' as const };

/** Phases rescaled to a new total (one phase, or the same split as before). */
export function rescalePhases(draft: T.PlannerPlan, total: number, racks: number): T.PlannerPhase[] {
  if (draft.phases.length <= 1) return [{ id: draft.phases[0]?.id ?? 'PH-1', name: draft.phases[0]?.name ?? 'Go-live', goLive: draft.phases[0]?.goLive ?? draft.targetGoLive, itKw: total, racks, halls: 1, status: draft.phases[0]?.status ?? 'Planned' }];
  const old = draft.phases.reduce((s, p) => s + p.itKw, 0) || 1;
  let left = total; let leftRacks = racks;
  return draft.phases.map((p, i, all) => {
    const last = i === all.length - 1;
    const kw = last ? Math.round(left * 10) / 10 : Math.round(total * (p.itKw / old) * 10) / 10;
    const rk = last ? leftRacks : Math.round(racks * (p.itKw / old));
    left -= kw; leftRacks -= rk;
    return { ...p, itKw: kw, racks: rk };
  });
}
