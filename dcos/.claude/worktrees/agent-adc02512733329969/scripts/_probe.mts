import { buildSnapshot } from '../src/mock/db/seed';
import { evaluate, fmtUsd } from '../src/modules/planner/lib/engine';
import { buildBom, buildIpPlan } from '../src/modules/planner/lib/outputs';
import { plannerDataFromSnapshot } from '../src/modules/planner/lib/plannerData';
import type * as T from '../src/mock/data/types';
const snap = buildSnapshot('small') as unknown as Record<string, unknown[]>;
const data = plannerDataFromSnapshot(snap);
const templates = snap.plannerTemplates as unknown as T.PlannerTemplate[];
const benchmarks = snap.plannerBenchmarks as unknown as T.PlannerBenchmark[];
const only = process.argv.slice(2);
for (const p of data.plannerPlans.filter(x => only.includes(x.plnId))) {
  const ev = evaluate(p, null, templates, benchmarks, undefined, data);
  console.log(`\n${p.plnId} ${p.title} ${p.status} capex ${fmtUsd(ev.estimate.capexTotal)} phases ${p.phases.map(ph => `${ph.id} ${ph.goLive.slice(0, 10)} ${ph.itKw}kW`).join(', ')}`);
  for (const l of ev.estimate.capex) console.log(`  ${fmtUsd(l.amount).padStart(8)} ${l.item} — ${l.basis}`);
  const bom = buildBom(p, ev, benchmarks);
  for (const l of bom.lines) console.log(`  B ${fmtUsd(l.total).padStart(8)} ${l.qty} ${l.unit} × ${l.item} [${l.kind}] ${l.model ?? ''} ${l.monthly ? 'monthly' : ''} ${l.phaseId ?? ''}`);
  console.log('  sched:', ev.schedule.filter(s => s.kind !== 'gate').map(s => `${s.item}@${s.phase} lead ${s.leadWeeks}+${s.bufferWeeks ?? 0} order ${s.orderBy.slice(0, 10)} need ${s.needBy.slice(0, 10)} ${s.late ? 'LATE' : ''} ${s.status ?? ''} ${s.note ?? ''}`).join('\n    '));
  const ip = buildIpPlan(p, ev); console.log('  ip', ip.aggregate, ip.items.length, JSON.stringify(ip.containers), ip.warnings);
}
