/**
 * Planner AI — grounded capabilities. Each function states what it is grounded on
 * (estate actuals, history, templates and benchmarks) and returns proposals with a
 * source, a confidence and evidence the planner can check. Nothing here executes;
 * the planner accepts or rejects, and the feedback collection records the outcome.
 */
import type * as T from '../../../mock/data/types';
import { DC_TYPE_CATALOG, type DcTypeProfile } from '../../../mock/data/dcTypes';
import { evaluate, type EstateActuals, type Evaluation, fmtUsd, fmtKw, r0, r1 } from './engine';

export interface Evidence { label: string; to?: string }
export interface Proposal<V = unknown> { capability: string; title: string; value: V; confidence: number; reason: string; source: T.PlannerParamSource; evidence: Evidence[] }

/* ------------------------------------------------------------ intent → profile */
export interface IntentReading { dcTypeKey: string; profile: DcTypeProfile; confidence: number; mw?: number; kw?: number; racks?: number; scope: T.PlannerScope; campusHint?: string; hallHint?: string; months?: number; tier?: string; cooling?: T.PlannerCoolingType; density?: number; purpose: string; reasons: string[] }
const KEY: [RegExp, string, string][] = [
  [/\b(ai|gpu|training|inference|llm|accelerator)\b/i, 'ai-gpu-factory', 'mentions AI or GPU workloads'],
  [/\b(hyperscale|cloud region|availability zone|az)\b/i, 'hyperscale-dc', 'mentions hyperscale or cloud region'],
  [/\b(colo|colocation|tenant|cage|wholesale)\b/i, 'wholesale-colo', 'mentions colocation or tenants'],
  [/\b(retail colo|cabinet|cross-?connect)\b/i, 'retail-colo', 'mentions cabinets or cross-connects'],
  [/\b(edge|micro|far edge|latency)\b/i, 'edge-micro-dc', 'mentions edge or latency'],
  [/\b(server room|closet|comms room)\b/i, 'server-room', 'mentions a server room'],
  [/\b(pod|container|modular|prefab)\b/i, 'modular-pod', 'mentions a modular pod'],
  [/\b(carrier hotel|meet-?me|interconnect)\b/i, 'carrier-hotel', 'mentions interconnection'],
  [/\b(ixp|exchange point|peering)\b/i, 'ixp', 'mentions peering'],
  [/\b(central office|co\b|exchange building)\b/i, 'central-office', 'mentions a central office'],
  [/\b(pop\b|point of presence)\b/i, 'network-pop', 'mentions a point of presence'],
  [/\b(mtso|mobile switching)\b/i, 'mtso', 'mentions mobile switching'],
  [/\b(nfvi|core network|5g core)\b/i, 'national-core-nfvi', 'mentions a telco core'],
  [/\b(enterprise|private cloud|corporate)\b/i, 'enterprise-dc', 'mentions enterprise hosting'],
];
export function readIntent(text: string): IntentReading {
  const t = text.trim();
  const reasons: string[] = [];
  let key = 'enterprise-dc'; let conf = 45;
  for (const [re, k, why] of KEY) if (re.test(t)) { key = k; conf = 82; reasons.push(why); break; }
  const mw = /(\d+(?:\.\d+)?)\s*mw\b/i.exec(t)?.[1]; const kw = /(\d+(?:\.\d+)?)\s*kw\b/i.exec(t)?.[1]; const racks = /(\d+)\s*racks?\b/i.exec(t)?.[1];
  const perRack = /(\d+(?:\.\d+)?)\s*kw\s*(?:per|\/|a)?\s*rack/i.exec(t)?.[1] ?? (racks && kw ? kw : undefined);
  const sizeKw = mw ? Number(mw) * 1000 : racks && perRack ? Number(racks) * Number(perRack) : kw && !racks ? Number(kw) : racks ? Number(racks) * 10 : undefined;
  if (racks && !perRack && !mw) reasons.push(`${racks} racks at 10 kW assumed`); else if (racks && perRack) reasons.push(`${racks} racks × ${perRack} kW`);
  if (sizeKw && sizeKw >= 20000 && key === 'enterprise-dc') { key = 'hyperscale-dc'; reasons.push('20 MW or more reads as hyperscale'); conf = Math.max(conf, 70); }
  const nRacks = racks ? Number(racks) : 0;
  const scope: T.PlannerScope = /\bnew (data ?cent|site|dc|campus)\b/i.test(t) ? 'new-dc' : /\b(decommission|migrat|consolidat)/i.test(t) ? 'migration' : nRacks ? (nRacks <= 4 ? 'rack' : nRacks <= 60 ? 'pod' : 'hall') : /\b(retrofit|densif)/i.test(t) ? 'retrofit' : /\b(ups|chiller|generator|plant)\b/i.test(t) && !/new data cent/i.test(t) ? 'plant' : /\b(dci|uplink|fabric|carrier|400g|100g)\b/i.test(t) ? 'network' : /\b(edge)\b/i.test(t) && /\b(\d+)\s*(?:\w+\s+)?(sites|locations|pops?)\b/i.test(t) ? 'edge' : /\b(portfolio|region(al)? plan|which site)\b/i.test(t) ? 'portfolio' : /\b(expan|new building|building [a-z])\b/i.test(t) ? 'expansion' : /\bnew (data ?cent|site|dc)\b/i.test(t) || (sizeKw ?? 0) >= 5000 ? 'new-dc' : (sizeKw ?? 0) >= 500 ? 'hall' : (sizeKw ?? 0) > 20 || (racks && Number(racks) > 1) ? 'pod' : 'rack';
  const campusHint = /\b(ashburn|dallas|frankfurt|dublin|singapore|sydney|s[aã]o paulo|virginia|texas|germany|ireland|australia|brazil)\b/i.exec(t)?.[1];
  const months = /(\d+)\s*months?\b/i.exec(t)?.[1]; const years = /(\d+)\s*years?\b/i.exec(t)?.[1]; const year = /\b(20\d\d)\b/.exec(t)?.[1];
  const tier = /tier\s*(i{1,3}|iv|[1-4])/i.exec(t)?.[1];
  const tierNorm = tier ? ({ '1': 'Tier I', '2': 'Tier II', '3': 'Tier III', '4': 'Tier IV', i: 'Tier I', ii: 'Tier II', iii: 'Tier III', iv: 'Tier IV' } as Record<string, string>)[tier.toLowerCase()] : undefined;
  const cooling: T.PlannerCoolingType | undefined = /immersion/i.test(t) ? 'immersion' : /liquid|direct.to.chip|dlc/i.test(t) ? 'liquid-to-chip' : /rear.?door/i.test(t) ? 'rear-door' : /free.?cool|economi[sz]er/i.test(t) ? 'air-economiser' : undefined;
  const density = perRack;
  const hallHint = /\bhall\s*([A-Z0-9]+)/i.exec(t)?.[1];
  const profile = DC_TYPE_CATALOG.find(p => p.key === key) ?? DC_TYPE_CATALOG[0];
  if (tierNorm) reasons.push(`asks for ${tierNorm}`);
  if (cooling) reasons.push(`asks for ${cooling.replace(/-/g, ' ')}`);
  return { dcTypeKey: key, profile, confidence: conf, mw: mw ? Number(mw) : undefined, kw: sizeKw, racks: nRacks || undefined, scope, campusHint, hallHint, months: months ? Number(months) : years ? Number(years) * 12 : year ? Math.max(6, (Number(year) - new Date().getFullYear()) * 12) : undefined, tier: tierNorm, cooling, density: density ? Number(density) : undefined, purpose: t.slice(0, 160), reasons };
}

/* ------------------------------------------------------------ estate actuals */
export interface ActualsInput { dataCenters: T.DataCenter[]; racks: T.Rack[]; coolingZones: T.CoolingZone[]; programs: T.Program[]; projects: T.Project[] }
/** What this estate really does for sites of the same type: the strongest grounding the planner has. */
export function estateActuals(dcTypeKey: string, input: ActualsInput): EstateActuals {
  const sites = input.dataCenters.filter(d => d.dcTypeKey === dcTypeKey && d.status === 'Operational');
  const ids = new Set(sites.map(s => s.id));
  const racks = input.racks.filter(r => ids.has(r.dataCenterId) && r.currentPowerKw > 0);
  const kwPerRack = racks.length ? r1(racks.reduce((a, r) => a + r.currentPowerKw, 0) / racks.length) : undefined;
  const itKw = racks.reduce((a, r) => a + r.currentPowerKw, 0);
  const coolKw = input.coolingZones.filter(z => ids.has(z.dataCenterId)).reduce((a, z) => a + z.currentLoadKw, 0);
  // cooling power ≈ heat removed ÷ COP (≈3.5) plus UPS, distribution and lighting losses (≈7%)
  const pue = itKw > 0 ? Math.round(Math.min(2.2, Math.max(1.08, 1 + (coolKw / itKw) * 0.28 + 0.07)) * 100) / 100 : undefined;
  const designKw = sites.reduce((a, s) => a + s.designPowerKw, 0);
  const projs = input.projects.filter(p => p.dataCenterId && ids.has(p.dataCenterId) && p.budget > 0);
  const capexPerKw = projs.length && designKw ? r0(projs.reduce((a, p) => a + p.budget, 0) / designKw) : undefined;
  const util = designKw ? r0((itKw / designKw) * 100) : undefined;
  return { kwPerRack, pue, capexPerKw: capexPerKw && capexPerKw > 500 ? capexPerKw : undefined, powerUtilPct: util, fitoutWeeks: projs.length ? 18 : undefined, sampleSites: sites.length, sampleRacks: racks.length };
}

/* ------------------------------------------------------------ sizing assistant */
export function sizingProposals(plan: T.PlannerPlan, ev: Evaluation, actuals: EstateActuals, benchmarks: T.PlannerBenchmark[]): Proposal<number | string>[] {
  const out: Proposal<number | string>[] = [];
  const density = Number(ev.params['densityKwPerRack']?.value ?? 0);
  if (ev.sizing.itKw === 0) return out;
  if (actuals.kwPerRack && density && (actuals.sampleRacks ?? 0) >= 10) {
    const ratio = actuals.kwPerRack / density;
    if (ratio < 0.45 && !['ai-gpu-factory'].includes(plan.dcTypeKey)) out.push({ capability: 'sizing-assistant', title: 'Design density is far above what this estate really draws', value: r0(Math.max(actuals.kwPerRack * 1.4, density * 0.7)), confidence: 74, reason: `Live ${ev.resolved?.template.name ?? 'sites'} of this type average ${actuals.kwPerRack} kW per rack against ${density} kW planned. Plan at 1.4× the actual to keep headroom without stranding power.`, source: 'actual', evidence: [{ label: `${actuals.sampleSites} live site(s) of type ${plan.dcTypeKey}`, to: '/datacenters' }] });
    else if (ratio > 1.15) out.push({ capability: 'sizing-assistant', title: 'Racks already draw more than the planned density', value: r0(actuals.kwPerRack * 1.1), confidence: 70, reason: `Actual ${actuals.kwPerRack} kW per rack exceeds the ${density} kW planned; the plan would run out of rack power early.`, source: 'actual', evidence: [{ label: `${actuals.sampleSites} live site(s)`, to: '/capacity' }] });
  }
  if (actuals.pue && ev.sizing.pue.source !== 'actual' && Math.abs(actuals.pue - ev.sizing.pue.value) >= 0.08) out.push({ capability: 'sizing-assistant', title: `PUE ${ev.sizing.pue.value} planned, ${actuals.pue} achieved today`, value: actuals.pue, confidence: 68, reason: actuals.pue > ev.sizing.pue.value ? 'The target is better than what the estate achieves with similar cooling; keep it only with a named efficiency measure.' : 'The estate already beats the target; the plan can commit to the better figure.', source: 'actual', evidence: [{ label: 'Achieved PUE at live sites of this type', to: '/facilities' }] });
  const liquidThreshold = benchmarks.find(b => b.metric === 'liquidThresholdKw')?.value ?? 30;
  if (density > liquidThreshold && !['liquid-to-chip', 'immersion', 'rear-door'].includes(ev.sizing.cooling.type)) out.push({ capability: 'sizing-assistant', title: 'Switch to liquid cooling for this density', value: 'liquid-to-chip', confidence: 88, reason: `${density} kW per rack is above the ${liquidThreshold} kW threshold where air cooling stops being practical.`, source: 'template', evidence: [{ label: 'Design standard rule R-COOL-02' }] });
  if (ev.sizing.cooling.type === 'air-crah' && ['cold', 'temperate'].includes(plan.climate) && ev.sizing.itKw >= 500) out.push({ capability: 'sizing-assistant', title: 'Use economiser cooling in this climate', value: 'air-economiser', confidence: 72, reason: `A ${plan.climate} climate supports free cooling most of the year; the benchmark PUE drops from about 1.5 to 1.3.`, source: 'benchmark', evidence: [{ label: 'PUE benchmarks by cooling type and climate', to: '/planning/benchmarks' }] });
  if (ev.sizing.network.carriers < 2) out.push({ capability: 'sizing-assistant', title: 'Add a second carrier entry', value: 2, confidence: 90, reason: 'A single carrier is a single point of failure for every service at the site.', source: 'template', evidence: [{ label: 'Design standard rule R-NET-01' }] });
  return out;
}

/* ------------------------------------------------------------ phasing optimiser */
export interface PhasingProposal { phases: { name: string; goLive: string; itKw: number }[]; reason: string; confidence: number; evidence: Evidence[] }
export function phasingProposal(plan: T.PlannerPlan, ev: Evaluation, demandTemplate?: T.PlannerTemplate | null, estateHeadroomKw?: number): PhasingProposal | null {
  if (plan.designPowerKw < 1000 || !['new-dc', 'expansion', 'hall', 'edge', 'portfolio'].includes(plan.scope)) return null;
  const late = ev.schedule.filter(s => s.late && s.kind === 'equipment');
  const target = new Date(plan.targetGoLive).getTime();
  const minLead = Math.max(0, ...late.map(l => l.leadWeeks)) * 7 * 864e5;
  const firstLive = late.length ? new Date(Date.now() + minLead + 8 * 7 * 864e5) : new Date(target);
  const shares = demandTemplate?.demand?.phases ?? [{ name: 'Phase 1', sharePct: 34, monthsFromStart: 0 }, { name: 'Phase 2', sharePct: 33, monthsFromStart: 12 }, { name: 'Phase 3', sharePct: 33, monthsFromStart: 24 }];
  const phases = shares.map(s => ({ name: s.name, goLive: new Date(firstLive.getTime() + s.monthsFromStart * 30.4 * 864e5).toISOString(), itKw: r0((plan.designPowerKw * s.sharePct) / 100) }));
  const reason = late.length ? `${late.map(l => l.item).join(', ')} cannot arrive before ${new Date(target).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}; the first phase moves to ${firstLive.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} and the rest follows the ${demandTemplate?.name ?? 'default'} demand profile.` : `Lead times fit the target date; phases follow the ${demandTemplate?.name ?? 'default'} demand profile so capacity lands just ahead of demand${estateHeadroomKw !== undefined ? ` (estate headroom today ${fmtKw(estateHeadroomKw)})` : ''}.`;
  return { phases, reason, confidence: late.length ? 76 : 64, evidence: [{ label: 'Lead-time benchmarks', to: '/planning/benchmarks' }, ...(demandTemplate ? [{ label: `Demand profile ${demandTemplate.name}`, to: '/planning/templates' }] : [])] };
}

/* ------------------------------------------------------------ cost calibration */
export interface CostCalibration { capexPerKwBenchmark?: number; capexPerKwActual?: number; capexPerKwPlan: number; verdict: string; adjustment?: number; confidence: number; evidence: Evidence[]; comparables: { name: string; capexPerKw: number }[] }
export function costCalibration(plan: T.PlannerPlan, ev: Evaluation, actuals: EstateActuals, projects: T.Project[], dataCenters: T.DataCenter[]): CostCalibration {
  const comps = projects.filter(p => p.budget > 0 && p.dataCenterId).map(p => { const d = dataCenters.find(x => x.id === p.dataCenterId); return d && d.dcTypeKey === plan.dcTypeKey && d.designPowerKw ? { name: `${p.name} · ${d.name}`, capexPerKw: r0(p.budget / d.designPowerKw) } : null; }).filter((x): x is { name: string; capexPerKw: number } => !!x && x.capexPerKw > 300).slice(0, 4);
  const plan$ = ev.estimate.capexPerKw; const band = ev.estimate.benchmarkBand;
  let verdict = ev.sizing.itKw === 0 ? 'No facility load in scope; the estimate is a bottom-up bill of materials.' : band ? '' : `Whole-site benchmark bands do not apply to a ${plan.scope.replace('-', ' ')} scope; the estimate is built bottom-up from the template's unit costs.`; let adjustment: number | undefined; let conf = 55;
  if (band && plan$) {
    if (plan$ < band.low * 0.85) { verdict = `The estimate (${fmtUsd(plan$)}/kW) is below the benchmark band ${fmtUsd(band.low)} to ${fmtUsd(band.high)}; it is likely to be under-funded.`; adjustment = band.low; conf = 72; }
    else if (plan$ > band.high * 1.1) { verdict = `The estimate (${fmtUsd(plan$)}/kW) is above the benchmark band ${fmtUsd(band.low)} to ${fmtUsd(band.high)}; check the tier and redundancy choices.`; adjustment = band.high; conf = 70; }
    else { verdict = `The estimate (${fmtUsd(plan$)}/kW) sits inside the benchmark band ${fmtUsd(band.low)} to ${fmtUsd(band.high)}.`; conf = 78; }
  }
  if (actuals.capexPerKw) { verdict += ` Delivered programmes of this type cost ${fmtUsd(actuals.capexPerKw)}/kW.`; conf = Math.min(90, conf + 8); }
  return { capexPerKwBenchmark: band?.low !== undefined ? r0((band.low + band.high) / 2) : undefined, capexPerKwActual: actuals.capexPerKw, capexPerKwPlan: plan$, verdict, adjustment, confidence: conf, evidence: [...(band ? [{ label: band.source, to: '/planning/benchmarks' }] : []), ...(comps.length ? [{ label: `${comps.length} comparable project(s)`, to: '/delivery' }] : [])], comparables: comps };
}

/* ------------------------------------------------------------ risk predictor */
export function predictRisks(plan: T.PlannerPlan, ev: Evaluation, history: { risks: T.RiskItem[]; projects: T.Project[] }): T.PlannerRisk[] {
  const out: T.PlannerRisk[] = [];
  const have = new Set(plan.risks.map(r => r.title.toLowerCase()));
  const add = (title: string, domain: T.PlannerRisk['domain'], probability: T.PlannerRisk['probability'], impact: T.PlannerRisk['impact'], mitigation: string, evidence: string) => { if (![...have].some(h => h.includes(title.toLowerCase().slice(0, 18)))) out.push({ id: `AI-${out.length + 1}`, title, domain, probability, impact, owner: plan.ownerName, mitigation, source: 'ai', evidence }); };
  const late = ev.schedule.filter(s => s.late && s.kind === 'equipment');
  for (const l of late.slice(0, 3)) add(`${l.item} lead time (${l.leadWeeks} weeks) misses the phase date`, 'Supplier', 'High', 'High', 'Order at approval; dual-source; shift phase 1 if needed.', `Lead-time benchmark and phase date ${new Date(l.needBy).toLocaleDateString('en-US')}`);
  const slipped = history.projects.filter(p => p.rag === 'Red' || p.status === 'At Risk' || p.status === 'Blocked');
  if (slipped.length && ['new-dc', 'expansion', 'hall'].includes(plan.scope)) add('Delivery slip on construction-dependent phases', 'Commissioning', slipped.length > 3 ? 'High' : 'Medium', 'High', 'Civil milestone tracked as a hard dependency; contingency 15% or more.', `${slipped.length} of ${history.projects.length} projects in the estate are red, at risk or blocked`);
  const supplier = history.risks.filter(r => r.category === 'Vendor' && r.status !== 'Closed').length;
  if (supplier >= 3) add('Vendor concentration on long-lead plant', 'Supplier', 'Medium', 'High', 'Frame agreements with two vendors per class.', `${supplier} open vendor risks across current projects`);
  if (ev.sizing.cooling.liquidRequired || ['liquid-to-chip', 'immersion'].includes(ev.sizing.cooling.type)) add('Water and leak events on liquid loops', 'Facility', 'Medium', 'High', 'Leak detection on every loop; closed-loop design; commissioning level 5 on CDUs.', 'Liquid cooling selected');
  if (plan.scope === 'new-dc' || plan.scope === 'expansion') add('Utility connection later than the master plan assumes', 'Regulatory', 'Medium', 'High', 'Grid agreement signed before the master-plan gate; interim feed sized for phase 1.', 'Common cause of slips on greenfield builds in the delivery history');
  if (plan.scope === 'migration') add('Cut-over window overrun on critical workloads', 'Facility', 'Medium', 'High', 'Rehearsed cut-over; rollback tested; change freeze.', 'Migration scope');
  if (ev.estimate.paybackMonths !== null && ev.estimate.paybackMonths > 96) add('Payback beyond 8 years at the entered revenue', 'Finance', 'High', 'Medium', 'Raise price per kW or phase CapEx; revisit tier.', `Payback ${ev.estimate.paybackMonths} months`);
  return out;
}

/* ------------------------------------------------------------ placement optimiser (rack and pod scopes) */
export interface PlacementCandidate { rack: T.Rack; hallName: string; score: number; reasons: string[] }
export function placementCandidates(plan: T.PlannerPlan, racks: T.Rack[], halls: T.Hall[], needKw: number, needU: number): PlacementCandidate[] {
  const hallName = new Map(halls.map(h => [h.id, h.name]));
  return racks.filter(r => r.dataCenterId === plan.dataCenterId && r.status === 'Active').map(r => {
    const freeKw = r.maxPowerKw - r.currentPowerKw; const freeU = r.availableU;
    const reasons: string[] = [];
    let score = 0;
    if (freeKw >= needKw) { score += 40; reasons.push(`${r1(freeKw)} kW free`); } else reasons.push(`only ${r1(Math.max(0, freeKw))} kW free`);
    if (freeU >= needU) { score += 30; reasons.push(`${freeU} U free`); } else reasons.push(`only ${freeU} U free`);
    if (r.redundancy === '2N' || r.redundancy === '2N+1') { score += 15; reasons.push('dual feed'); }
    const afterPct = r.maxPowerKw ? ((r.currentPowerKw + needKw) / r.maxPowerKw) * 100 : 100;
    if (afterPct <= 80) { score += 15; reasons.push(`${r0(afterPct)}% after placement`); } else if (afterPct <= 90) { score += 5; reasons.push(`${r0(afterPct)}% after placement (warning band)`); } else reasons.push(`${r0(afterPct)}% after placement (blocked)`);
    return { rack: r, hallName: hallName.get(r.hallId) ?? r.hallId, score, reasons };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
}

/* ------------------------------------------------------------ document extraction (simulated on text) */
export interface Extracted { field: string; value: string | number; unit?: string; confidence: number; snippet: string }
export function extractFromText(text: string): Extracted[] {
  const out: Extracted[] = [];
  const grab = (re: RegExp, field: string, unit?: string, conf = 80) => { const m = re.exec(text); if (m) out.push({ field, value: Number.isNaN(Number(m[1])) ? m[1] : Number(m[1]), unit, confidence: conf, snippet: m[0] }); };
  grab(/(\d+(?:\.\d+)?)\s*(?:mva|mw)\b[^.]*?(?:available|offer|connection)/i, 'utilityAvailableMw', 'MW', 78);
  grab(/(?:tariff|price)[^.\d]*(\d+(?:\.\d+)?)\s*(?:usd|\$|eur|€)?\s*(?:per|\/)\s*kwh/i, 'tariffUsdPerKwh', 'USD/kWh', 82);
  grab(/(\d+)\s*weeks?\s*lead/i, 'leadWeeks', 'weeks', 76);
  grab(/(\d+(?:,\d{3})*)\s*(?:m²|m2|sqm|square met)/i, 'areaM2', 'm²', 70);
  grab(/lease[^.\d]*(\d+(?:\.\d+)?)\s*(?:usd|\$|eur|€)?\s*(?:per|\/)\s*(?:m²|m2|sqm)/i, 'leaseUsdPerM2Year', 'USD/m²/year', 72);
  grab(/(\d+(?:\.\d+)?)\s*kw\s*(?:per|\/)\s*rack/i, 'densityKwPerRack', 'kW/rack', 84);
  grab(/pue[^.\d]*(\d\.\d+)/i, 'pueTarget', 'ratio', 80);
  grab(/(\d+)\s*(?:v|kv)\b[^.]*?(?:feed|intake|supply)/i, 'feedVoltage', 'V', 60);
  return out;
}

/* ------------------------------------------------------------ copilot */
export interface Answer { title: string; lines: string[]; confidence: number; evidence: Evidence[]; followups: string[] }
export function answerQuestion(q: string, plan: T.PlannerPlan, ev: Evaluation, scenarios: { scenario: T.PlannerScenario; ev: Evaluation }[], actuals: EstateActuals): Answer {
  const s = q.toLowerCase();
  const E = (title: string, lines: string[], confidence: number, evidence: Evidence[] = [], followups: string[] = []): Answer => ({ title, lines, confidence, evidence, followups });
  const planLink = { label: plan.title, to: `/planning/plans/${plan.id}` };
  if (/tier iv|tier 4|fault.tolerant/.test(s)) {
    const alt = scenarios.find(x => String(x.ev.params['tier']?.value) === 'Tier IV');
    const lines = alt ? [`Scenario "${alt.scenario.name}" models Tier IV: CapEx ${fmtUsd(alt.ev.estimate.capexTotal)} against ${fmtUsd(ev.estimate.capexTotal)} (${r0(((alt.ev.estimate.capexTotal - ev.estimate.capexTotal) / Math.max(1, ev.estimate.capexTotal)) * 100)}% more).`, `Payback ${alt.ev.estimate.paybackMonths ?? '—'} months against ${ev.estimate.paybackMonths ?? '—'}.`, `Plant: ${alt.ev.sizing.plant.filter(x => x.kind === 'ups').length} UPS systems and ${alt.ev.sizing.plant.find(x => x.kind === 'generator')?.count ?? 0} generators.`] : [`No Tier IV scenario yet. Tier IV needs 2N+1 power and fault-tolerant cooling; expect roughly 15 to 20% more plant CapEx than Tier III at this size.`, 'Add a scenario with tier = Tier IV and redundancy = 2N+1 to see the exact figures.'];
    return E('Going to Tier IV', lines, alt ? 84 : 62, [planLink, { label: 'Uptime Institute tier definitions (design standard)' }], ['What is the binding constraint?', 'Compare all scenarios']);
  }
  if (/binding|constraint|runs? out|exhaust/.test(s)) {
    const row = ev.ladder.find(l => l.bindingConstraint !== 'none') ?? ev.ladder[0];
    return E('Binding constraint', row ? [`${row.bindingConstraint === 'none' ? 'No dimension binds' : `${row.bindingConstraint[0].toUpperCase()}${row.bindingConstraint.slice(1)} binds first`} at ${row.phase.name}: ${fmtKw(row.installedKw)} installed, ${fmtKw(row.committedKw)} committed, ${fmtKw(row.reserveKw)} reserve, ${fmtKw(row.headroomKw)} usable headroom.`, row.crossesWarningMonth !== undefined ? `At ${plan.demand.growthPctPerYear}% growth a year the warning threshold is crossed about ${row.crossesWarningMonth} months from now.` : 'Growth is zero, so no crossing is forecast.', `Cooling capacity ${fmtKw(ev.sizing.cooling.capacityKw)} for ${fmtKw(ev.sizing.itKw)} IT; ${ev.sizing.cooling.units} units at ${ev.sizing.cooling.redundancy}.`] : ['No phases defined yet.'], 80, [planLink, { label: 'Capacity ladder', to: `/planning/plans/${plan.id}?tab=capacity` }], ['What does it cost per kW?', 'Which risks matter most?']);
  }
  if (/cost per kw|per kw|benchmark|expensive|cheap/.test(s)) {
    const b = ev.estimate.benchmarkBand;
    return E('Cost per kW', [`Plant and fit-out ${fmtUsd(ev.estimate.capexPerKw)} per kW, total CapEx ${fmtUsd(ev.estimate.capexTotal)}${ev.estimate.capex.some(l => l.item.startsWith('IT')) ? ' including IT' : ''}.`, b ? `Benchmark band ${fmtUsd(b.low)} to ${fmtUsd(b.high)} (${b.source}).` : 'No benchmark for this type.', actuals.capexPerKw ? `Delivered programmes of this type cost ${fmtUsd(actuals.capexPerKw)} per kW.` : 'No delivered programme of this type to compare with yet.', `OpEx ${fmtUsd(ev.estimate.opexMonthly)} a month, ${fmtUsd(ev.estimate.costPerKwMonth)} per kW-month; energy is ${r0((ev.estimate.opex.find(l => l.item === 'Energy')?.amount ?? 0) / Math.max(1, ev.estimate.opexMonthly) * 100)}% of it.`], 82, [planLink, { label: 'Benchmarks', to: '/planning/benchmarks' }], ['What changes if we go Tier IV?', 'Which rules fail?']);
  }
  if (/risk|slip|fail|danger/.test(s)) {
    const top = [...plan.risks].sort((a, b) => (b.impact === 'High' ? 2 : b.impact === 'Medium' ? 1 : 0) - (a.impact === 'High' ? 2 : a.impact === 'Medium' ? 1 : 0)).slice(0, 4);
    const fails = ev.findings.filter(f => f.status === 'fail');
    return E('What could go wrong', [...top.map(r => `${r.title} (${r.probability} probability, ${r.impact} impact) — ${r.mitigation}`), ...(fails.length ? [`${fails.length} hard rule(s) fail: ${fails.map(f => f.rule.title).join('; ')}.`] : ['Every hard rule passes.'])], 76, [planLink, { label: 'Risk register', to: `/planning/plans/${plan.id}?tab=risks` }], ['What is the schedule?', 'Compare all scenarios']);
  }
  if (/schedule|when|lead time|order/.test(s)) {
    const late = ev.schedule.filter(x => x.late);
    const firstEq = ev.schedule.filter(x => x.kind === 'equipment').slice(0, 3);
    return E('Schedule and lead times', [late.length ? `${late.length} item(s) are already late to order: ${late.map(l => l.item).join(', ')}.` : 'Every long-lead item can still be ordered in time.', ...firstEq.map(i => `${i.item}: order by ${new Date(i.orderBy).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} for ${new Date(i.needBy).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} (${i.leadWeeks} weeks).`)], 78, [planLink, { label: 'Lead-time benchmarks', to: '/planning/benchmarks' }], ['Which risks matter most?', 'What does it cost per kW?']);
  }
  if (/compare|scenario|option/.test(s)) {
    return E('Scenarios compared', scenarios.map(x => `${x.scenario.name}: ${fmtKw(x.ev.sizing.itKw)} in ${x.ev.sizing.halls} hall(s), CapEx ${fmtUsd(x.ev.estimate.capexTotal)} (${fmtUsd(x.ev.estimate.capexPerKw)}/kW), OpEx ${fmtUsd(x.ev.estimate.opexMonthly)}/month, PUE ${x.ev.sizing.pue.value}, payback ${x.ev.estimate.paybackMonths ?? '—'} months, ${x.ev.hardFails} hard fail(s).`), 85, [planLink, { label: 'What-if studio', to: `/planning/plans/${plan.id}?tab=scenarios` }], ['What changes if we go Tier IV?', 'What is the binding constraint?']);
  }
  if (/differ|standard|template|default|changed/.test(s)) {
    const diffs = Object.entries(ev.params).filter(([, v]) => v.source === 'user' || v.source === 'ai').slice(0, 8);
    return E('Departures from the template', diffs.length ? diffs.map(([k, v]) => `${k} = ${String(v.value)} (${v.source === 'ai' ? 'AI proposal accepted' : 'entered'})`) : ['Every parameter is the template default.'], 90, [planLink, { label: ev.resolved?.template.name ?? 'Template', to: '/planning/templates' }], ['Which rules fail?', 'What does it cost per kW?']);
  }
  if (/rule|comply|complian|pass/.test(s)) {
    const bad = ev.findings.filter(f => f.status !== 'pass' && f.status !== 'n/a');
    return E('Rules and standards', bad.length ? bad.map(f => `${f.status === 'fail' ? 'Fails' : 'Warns'}: ${f.rule.title} — ${f.detail}${f.rule.standard ? ` (${f.rule.standard})` : ''}`) : ['Every rule passes.'], 92, [planLink, { label: 'Rule sets', to: '/planning/templates' }], ['Which risks matter most?', 'Compare all scenarios']);
  }
  return E('Plan summary', [`${plan.title}: ${fmtKw(ev.sizing.itKw)} IT in ${ev.sizing.halls} hall(s) across ${ev.sizing.buildings} building(s), ${ev.sizing.racks.toLocaleString('en-US')} racks at ${ev.params['densityKwPerRack']?.value ?? '—'} kW.`, `CapEx ${fmtUsd(ev.estimate.capexTotal)}, OpEx ${fmtUsd(ev.estimate.opexMonthly)} a month, PUE ${ev.sizing.pue.value}, payback ${ev.estimate.paybackMonths ?? '—'} months.`, `${ev.hardFails} hard fail(s), ${ev.softWarns} warning(s), readiness ${ev.readinessPct}%.`], 70, [planLink], ['What is the binding constraint?', 'What does it cost per kW?', 'Which risks matter most?', 'Compare all scenarios']);
}
export const COPILOT_SUGGESTIONS = ['What is the binding constraint?', 'What changes if we go Tier IV?', 'What does it cost per kW against the benchmark?', 'Which risks matter most?', 'When must the transformers be ordered?', 'Compare all scenarios', 'What differs from the standard template?'];

/* ------------------------------------------------------------ learning loop */
export interface CapabilityAccuracy { capability: string; label: string; total: number; accepted: number; pct: number }
const CAP_LABEL: Record<string, string> = { 'intent-to-profile': 'Intent to profile', 'sizing-assistant': 'Sizing assistant', 'phasing-optimiser': 'Phasing optimiser', 'cost-estimator': 'Cost calibration', 'risk-predictor': 'Risk predictor', 'compliance-check': 'Standards check', 'placement-optimiser': 'Placement optimiser', 'document-extraction': 'Document extraction', copilot: 'Plan copilot' };
export function accuracy(feedback: T.PlannerFeedback[]): CapabilityAccuracy[] {
  const by = new Map<string, { t: number; a: number }>();
  for (const f of feedback) { const e = by.get(f.capability) ?? { t: 0, a: 0 }; e.t++; if (f.accepted) e.a++; by.set(f.capability, e); }
  return [...by.entries()].map(([c, e]) => ({ capability: c, label: CAP_LABEL[c] ?? c, total: e.t, accepted: e.a, pct: r0((e.a / e.t) * 100) })).sort((a, b) => b.total - a.total);
}
export { evaluate };
