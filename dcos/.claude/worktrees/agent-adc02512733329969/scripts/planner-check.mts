/* Evaluates every seeded plan against the real platform data and prints what a reviewer checks:
   sizing, cost, rules (with failures), blockers, bill of materials, sourcing and initiation.
   Run: npx tsx scripts/planner-check.mts [PLN-0001 …]   (no ids = every plan) */
import { buildSnapshot } from '../src/mock/db/seed';
import { evaluate, fmtUsd } from '../src/modules/planner/lib/engine';
import { buildBom, buildInitiation, buildIpPlan } from '../src/modules/planner/lib/outputs';
import { sourceBom } from '../src/modules/planner/lib/sourcing';
import { plannerDataFromSnapshot } from '../src/modules/planner/lib/plannerData';
import { blockers } from '../src/modules/planner/components/wizard/wizardModel';
import type * as T from '../src/mock/data/types';

const snap = buildSnapshot('small') as unknown as Record<string, unknown[]>;
const data = plannerDataFromSnapshot(snap);
const templates = snap.plannerTemplates as unknown as T.PlannerTemplate[];
const benchmarks = snap.plannerBenchmarks as unknown as T.PlannerBenchmark[];
const only = process.argv.slice(2);
for (const p of data.plannerPlans.filter(x => !only.length || only.includes(x.plnId))) {
  const ev = evaluate(p, null, templates, benchmarks, undefined, data);
  const t = templates.find(x => x.id === p.templateId);
  const bom = buildBom(p, ev, benchmarks); const ip = buildIpPlan(p, ev); const init = buildInitiation(p, ev, t, bom);
  const sb = sourceBom(p, ev, bom, { devices: data.devices, vendors: data.vendors, contracts: data.contracts, assetModels: data.assetModels, racks: data.racks, upsUnits: data.upsUnits, coolingZones: data.coolingZones, dataCenters: data.dataCenters });
  const s = ev.sizing, e = ev.estimate;
  console.log(`\n${p.plnId} ${p.title} [${p.scope}/${p.status}] site=${p.dataCenterId ?? p.newSiteName ?? p.campusId ?? '-'}${ev.ctx.site ? ` headroom=${ev.ctx.site.headroomItKw}kW binding=${ev.ctx.site.binding?.label}` : ''}`);
  console.log(`  it=${s.itKw}kW racks=${s.racks} halls=${s.halls} plant=${s.plant.map(x => `${x.count}×${x.name}`).join('; ') || '-'}`);
  console.log(`  capex=${fmtUsd(e.capexTotal)} bom=${fmtUsd(bom.total)} sourced=${fmtUsd(sb.total)} buy=${fmtUsd(sb.buyTotal)} opex/m=${fmtUsd(e.opexMonthly)} payback=${e.paybackMonths ?? '-'}`);
  console.log(`  rules pass=${ev.findings.filter(f => f.status === 'pass').length} warn=${ev.softWarns} fail=${ev.hardFails} na=${ev.findings.filter(f => f.status === 'n/a').length} readiness=${ev.readinessPct}%`);
  for (const f of ev.findings.filter(f => f.status === 'fail' || f.status === 'warn')) console.log(`    ${f.status.toUpperCase()} ${f.rule.id} ${f.rule.title}: ${f.detail}`);
  for (const b of blockers(p, ev, t, data).filter(b => b.level === 'bad')) console.log(`    BLOCK ${b.text}`);
  console.log(`  bom ${bom.lines.length} lines: ${bom.lines.slice(0, 8).map(l => `${l.qty}×${l.item}`).join(', ')}${bom.lines.length > 8 ? ' …' : ''}`);
  console.log(`  ip ${ip.aggregate} ${ip.items.length} prefixes; initiation ${init.vehicle} ${init.blueprintName ?? ''} projects=${init.projects.length} docs=${init.designDocs.map(d => d.name).join(', ')} wo=${init.workOrder.process}`);
  if (Object.keys(ev.scope).length) console.log(`  scope: ${Object.keys(ev.scope).join(', ')}`);
}
