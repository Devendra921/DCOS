/* Builds every output (BOM, IP plan, basis of design, initiation) for each seeded plan with the platform data,
   and checks the figures agree with each other. Run: npx tsx scripts/planner-outputs-smoke.mts (exits non-zero on a failure) */
import { buildSnapshot } from '../src/mock/db/seed';
import { evaluate } from '../src/modules/planner/lib/engine';
import { buildBom, buildIpPlan, buildBasisOfDesign, buildInitiation } from '../src/modules/planner/lib/outputs';
import { plannerDataFromSnapshot } from '../src/modules/planner/lib/plannerData';
import type * as T from '../src/mock/data/types';

const snap = buildSnapshot('small') as unknown as Record<string, unknown[]>;
const data = plannerDataFromSnapshot(snap);
const templates = snap.plannerTemplates as unknown as T.PlannerTemplate[];
const benchmarks = snap.plannerBenchmarks as unknown as T.PlannerBenchmark[];
let failures = 0, checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) { failures++; console.log(`  FAIL ${msg}`); } };
const M = (n: number) => `$${(n / 1e6).toFixed(2)}M`;
/** Scopes whose estimate is built bottom-up from the bill (the bill plus contingency is the estimate). */
const BOTTOM_UP: T.PlannerScope[] = ['rack', 'pod', 'hall', 'retrofit', 'plant', 'network', 'server-refresh', 'network-refresh', 'rack-replace', 'migration'];

for (const p of data.plannerPlans) {
  const ev = evaluate(p, null, templates, benchmarks, undefined, data);
  const t = templates.find(x => x.id === p.templateId);
  const bom = buildBom(p, ev, benchmarks); const ip = buildIpPlan(p, ev); const bod = buildBasisOfDesign(p, ev, t, p.title); const ini = buildInitiation(p, ev, t, bom);
  const used = ip.totalAddresses ? `${Math.round((ip.usedAddresses / ip.totalAddresses) * 1000) / 10}%` : '—';
  console.log(`${p.plnId} ${p.scope.padEnd(15)} bom ${String(bom.lines.length).padStart(3)} lines ${M(bom.total)} (+${M(bom.monthlyTotal ?? 0)} monthly) vs capex ${M(bom.capexCompared)} (${bom.coveragePct}%) | ip ${ip.aggregate} ${ip.items.length} prefixes ${ip.vlans.length} vlans ${used} | bod ${bod.length} | ${ini.vehicle} ${ini.projects.length} projects ${ini.orders.length} orders ${ini.designDocs.length} docs`);
  ok(Math.abs(bom.total - bom.lines.filter(l => !l.monthly).reduce((a, l) => a + l.total, 0)) < 1, `${p.plnId}: the bill total counts bought lines only (monthly service charges apart)`);
  ok(!ip.pending, `${p.plnId}: the IP plan is allocated from the platform data`);
  ok(!ip.items.length || ip.totalAddresses > 0, `${p.plnId}: address use is against a real container (${ip.usedAddresses} of ${ip.totalAddresses})`);
  ok(bod.length >= 5, `${p.plnId}: basis of design has its sections (${bod.length})`);
  // Bottom-up plans: the estimate is the bill plus contingency (and one-off charges outside the bill), so the comparison is close.
  if (BOTTOM_UP.includes(p.scope) && bom.lines.length) ok(bom.coveragePct >= 85 && bom.coveragePct <= 115, `${p.plnId}: bill ${M(bom.total)} reconciles with the estimate ${M(bom.capexCompared)} (${bom.coveragePct}%)`);
  if (p.scope === 'portfolio') ok(!bom.lines.length && ini.vehicle === 'portfolio', `${p.plnId}: a portfolio has no bill and starts child plans`);
}
// The interconnect: carrier services are monthly commitments, not CapEx; the one-off bill plus contingency is the estimate.
{
  const p = data.plannerPlans.find(x => x.plnId === 'PLN-0009')!;
  const ev = evaluate(p, null, templates, benchmarks, undefined, data); const bom = buildBom(p, ev, benchmarks);
  ok(bom.lines.some(l => l.monthly) && (bom.monthlyTotal ?? 0) > 0, 'PLN-0009 carrier services are monthly lines');
  const oneOff = ev.estimate.capex.filter(l => !/contingency|early termination/i.test(l.item)).reduce((a, l) => a + l.amount, 0);
  ok(Math.abs(oneOff - bom.total) <= Math.max(10, bom.total * 0.02), `PLN-0009 one-off bill ${M(bom.total)} equals the estimate's one-off lines ${M(oneOff)}`);
}
console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
