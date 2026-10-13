/* Builds every output (BOM, IP plan, basis of design, initiation) for each seeded plan. Run: npx tsx scripts/planner-outputs-smoke.mts */
import { buildSnapshot } from '../src/mock/db/seed';
import { evaluate } from '../src/modules/planner/lib/engine';
import { buildBom, buildIpPlan, buildBasisOfDesign, buildInitiation } from '../src/modules/planner/lib/outputs';
const s = buildSnapshot('small') as any;
for (const p of s.plannerPlans) {
  const ev = evaluate(p, null, s.plannerTemplates, s.plannerBenchmarks);
  const t = s.plannerTemplates.find((x: any) => x.id === p.templateId);
  const bom = buildBom(p, ev, s.plannerBenchmarks); const ip = buildIpPlan(p, ev); const bod = buildBasisOfDesign(p, ev, t, 'Site'); const ini = buildInitiation(p, ev, t, bom);
  console.log(`${p.plnId} ${p.scope.padEnd(9)} bom ${bom.lines.length} lines $${(bom.total/1e6).toFixed(1)}M vs capex $${(bom.capexCompared/1e6).toFixed(1)}M (${bom.coveragePct}%) | ip ${ip.aggregate} ${ip.items.length} prefixes ${ip.vlans.length} vlans ${Math.round(ip.usedAddresses/ip.totalAddresses*100)}% | bod ${bod.length} sections | ${ini.vehicle} ${ini.projects.length} projects ${ini.orders.length} orders ${ini.designDocs.length} docs`);
}
