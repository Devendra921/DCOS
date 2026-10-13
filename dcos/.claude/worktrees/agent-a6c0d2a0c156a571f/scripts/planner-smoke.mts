/* Evaluates every seeded plan through the planner engine and prints the headline numbers.
   Run: npx tsx scripts/planner-smoke.mts */
import { buildSnapshot } from '../src/mock/db/seed';
import { evaluate } from '../src/modules/planner/lib/engine';
import { estateActuals, sizingProposals, phasingProposal, costCalibration, predictRisks, readIntent } from '../src/modules/planner/lib/ai';
import type * as T from '../src/mock/data/types';

const snap = buildSnapshot('small');
const templates = snap.plannerTemplates as unknown as T.PlannerTemplate[];
const benchmarks = snap.plannerBenchmarks as unknown as T.PlannerBenchmark[];
const plans = snap.plannerPlans as unknown as T.PlannerPlan[];
const scenarios = snap.plannerScenarios as unknown as T.PlannerScenario[];
const estate = { dataCenters: snap.dataCenters as unknown as T.DataCenter[], racks: snap.racks as unknown as T.Rack[], coolingZones: snap.coolingZones as unknown as T.CoolingZone[], programs: snap.programs as unknown as T.Program[], projects: snap.projects as unknown as T.Project[] };
const risks = snap.risks as unknown as T.RiskItem[];
console.log(`templates ${templates.length} benchmarks ${benchmarks.length} plans ${plans.length} scenarios ${scenarios.length}`);
for (const p of plans) {
  const actuals = estateActuals(p.dcTypeKey, estate);
  const ev = evaluate(p, null, templates, benchmarks, actuals);
  const e = ev.estimate, s = ev.sizing;
  console.log(`\n${p.plnId} ${p.title} [${p.scope}/${p.status}] tpl=${ev.resolved?.template.tplId ?? 'MISSING'} rules=${ev.resolved?.rules.length ?? 0}`);
  console.log(`  it=${s.itKw}kW racks=${s.racks} halls=${s.halls} bld=${s.buildings} pue=${s.pue.value}(${s.pue.source}) cool=${s.cooling.type}/${s.cooling.units}u fte=${s.staffing.fte}`);
  console.log(`  capex=$${(e.capexTotal / 1e6).toFixed(1)}M (${e.capexPerKw}/kW band ${e.benchmarkBand?.low}-${e.benchmarkBand?.high}) opex/m=$${(e.opexMonthly / 1e3).toFixed(0)}k payback=${e.paybackMonths} energy=${e.energyMwhYear}MWh`);
  console.log(`  rules pass=${ev.findings.filter(f => f.status === 'pass').length} warn=${ev.softWarns} fail=${ev.hardFails} na=${ev.findings.filter(f => f.status === 'n/a').length} readiness=${ev.readinessPct}% binding=${ev.bindingConstraint} late=${ev.schedule.filter(x => x.late).length}/${ev.schedule.length}`);
  for (const f of ev.findings.filter(f => f.status === 'fail')) console.log(`    FAIL ${f.rule.id}: ${f.detail}`);
  console.log(`  actuals sites=${actuals.sampleSites} kw/rack=${actuals.kwPerRack} pue=${actuals.pue} capex/kW=${actuals.capexPerKw}`);
  console.log(`  ai sizing=${sizingProposals(p, ev, actuals, benchmarks).map(x => x.title).join(' | ') || '-'}`);
  const ph = phasingProposal(p, ev, templates.find(t => t.kind === 'demand'));
  console.log(`  ai phasing=${ph ? ph.phases.map(x => `${x.name}:${x.itKw}`).join(',') : '-'} cost=${costCalibration(p, ev, actuals, estate.projects, estate.dataCenters).verdict.slice(0, 90)}`);
  console.log(`  ai risks=${predictRisks(p, ev, { risks, projects: estate.projects }).map(r => r.title).join(' | ') || '-'}`);
  for (const sc of scenarios.filter(x => x.planId === p.id)) { const se = evaluate(p, sc, templates, benchmarks, actuals); console.log(`  scn ${sc.name}: capex=$${(se.estimate.capexTotal / 1e6).toFixed(1)}M pue=${se.sizing.pue.value} payback=${se.estimate.paybackMonths} fails=${se.hardFails}`); }
}
for (const t of ['Plan a new 50 MW AI data centre in Frankfurt for 2028, Tier III, liquid cooled', 'Add 40 racks at 30 kW in Ashburn Hall 3', 'Upgrade the UPS at Dallas', '400G DCI between Ashburn and Frankfurt', 'Decommission the Dublin central office', 'Roll out 25 edge sites in Germany']) { const r = readIntent(t); console.log(`intent "${t}" -> ${r.dcTypeKey} ${r.scope} ${r.kw ?? '-'}kW ${r.confidence}% ${r.reasons.join('; ')}`); }
