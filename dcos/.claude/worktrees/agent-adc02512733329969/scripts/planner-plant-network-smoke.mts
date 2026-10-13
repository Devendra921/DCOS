/* Plant upgrade and network uplift smoke test, with assertions (exits non-zero on failure).
   Covers the seeded plans (PLN-0003 Dallas plant, PLN-0009 Ashburn–Frankfurt DCI) and synthetic plans:
   a cut-in that leaves less than the live load, N+1 sizing, a DCI with both paths on one carrier,
   survivability, the OpEx delta, a network plan with no kW, /31s from IPAM at both ends, a fabric
   uplift, and execution of both seeded plans against the in-memory database.
   Run: npx tsx scripts/planner-plant-network-smoke.mts */
import { buildSnapshot } from '../src/mock/db/seed';
import { db, ensureMockDbReady } from '../src/mock/db';
import { evaluate, type Evaluation } from '../src/modules/planner/lib/engine';
import { buildBom, buildIpPlan } from '../src/modules/planner/lib/outputs';
import { PLANNER_DATA_KEYS, plannerDataFromSnapshot, type PlannerData } from '../src/modules/planner/lib/plannerData';
import { parseCidr, contains, overlap } from '../src/modules/planner/lib/ipam';
import { blockers } from '../src/modules/planner/components/wizard/wizardModel';
import { plantOf } from '../src/modules/planner/lib/scopes/plant';
import { networkOf } from '../src/modules/planner/lib/scopes/network';
import { runExecution } from '../src/modules/planner/lib/execute';
import type * as T from '../src/mock/data/types';

let failures = 0, checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (cond) console.log(`  ok   ${msg}`); else { failures++; console.log(`  FAIL ${msg}`); } };
const snap = buildSnapshot('small') as unknown as Record<string, unknown[]>;
const data = plannerDataFromSnapshot(snap);
const templates = snap.plannerTemplates as unknown as T.PlannerTemplate[];
const benchmarks = snap.plannerBenchmarks as unknown as T.PlannerBenchmark[];
const ev = (p: T.PlannerPlan, d: PlannerData = data) => evaluate(p, null, templates, benchmarks, undefined, d);
const plan = (id: string) => data.plannerPlans.find(p => p.plnId === id)!;
const rule = (e: Evaluation, id: string) => e.findings.find(f => f.rule.id === id);
const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x));

/* ================================================================== plant */
console.log('\nPLN-0003 · Dallas plant upgrade');
{
  const p = plan('PLN-0003'); const e = ev(p); const an = plantOf(e)!; const bom = buildBom(p, e, benchmarks);
  ok(an.ready && an.baseline, 'plant baseline read from the site records');
  ok((p.plantLines ?? []).filter(l => l.system === 'UPS').reduce((a, l) => a + l.qty, 0) === 2 && (p.plantLines ?? []).some(l => l.system === 'Chiller'), 'seed: two UPS modules and a chiller');
  ok((p.cutIns ?? []).length >= 3, 'seed: cut-in steps');
  const kinds = new Set(bom.lines.map(l => l.kind));
  const lineKinds = new Set((p.plantLines ?? []).map(l => ({ UPS: 'ups', Battery: 'ups', Generator: 'generator', Transformer: 'transformer', Switchgear: 'switchgear', Chiller: 'chiller', 'Dry cooler': 'chiller', CRAH: 'crah', CDU: 'cdu' } as Record<string, string>)[l.system]));
  const allowed = new Set([...lineKinds, 'install', 'bms']);
  ok([...kinds].every(k => allowed.has(k)), `bill only has the plant lines and standard works (kinds: ${[...kinds].join(', ')})`);
  ok(!bom.lines.some(l => /Leaf|Spine|server|Rack|Optics|Fibre/i.test(l.item)), 'no IT, racks or network in a plant bill');
  ok(bom.lines.filter(l => l.item === 'UPS module').reduce((a, l) => a + l.qty, 0) === 2, 'UPS modules in the bill = UPS modules in the lines');
  ok(bom.lines.some(l => l.item === 'UPS battery strings'), 'batteries are separate lines');
  ok(Math.abs(e.estimate.capexTotal - (bom.total + (e.estimate.contingencyUsd ?? 0))) <= 2, `estimate = bill + contingency (${e.estimate.capexTotal} vs ${bom.total} + ${e.estimate.contingencyUsd})`);
  ok(e.estimate.paybackMonths === null && e.estimate.revenueAnnual === 0, 'no revenue or payback for plant');
  ok(typeof e.estimate.capacityEnabledKw === 'number' && e.estimate.capacityEnabledKw >= 0, `capacity enabled set (${e.estimate.capacityEnabledKw} kW)`);
  ok(!e.findings.some(f => ['R-FIN-02', 'R-OPS-01', 'R-COOL-02', 'R-SPC-01'].includes(f.rule.id)), 'payback, staffing, liquid and space rules dropped');
  ok(e.findings.some(f => f.rule.id === 'R-PLT-05'), 'cut-in capacity rule present');
  ok(e.hardFails === 0, `no hard fails on the executing plan (${e.findings.filter(f => f.status === 'fail').map(f => `${f.rule.id}: ${f.detail}`).join(' | ') || 'none'})`);
  const gates = e.schedule.filter(s => s.kind === 'gate').map(s => s.item);
  ok(['studies and MOP approved', 'factory acceptance test', 'plant delivered', 'cut-in 1', 'L4 functional', 'L5 integrated', 'handover'].every(g => gates.some(x => x.includes(g))), 'plant gate set: MOP → FAT → delivery → cut-ins → L4 → L5 → handover');
  ok(new Set(e.schedule.filter(s => s.kind === 'equipment').map(s => s.phaseId)).size === 2, 'two stages with their own items and need dates');
  const upsLead = e.schedule.find(s => s.kind === 'equipment' && /UPS module/.test(s.item));
  ok(upsLead && upsLead.leadWeeks === bom.lines.find(l => l.item === 'UPS module')?.leadWeeks, 'schedule and bill show the same lead time');
  ok(!e.schedule.some(s => /server|leaf|spine|rack/i.test(s.item)), 'schedule only from what is added');
  ok(buildIpPlan(p, e).items.length === 0, 'plant takes no address space');
}

console.log('\nSynthetic plant · cut-in below the live load, N+1 sizing, temporary plant');
{
  const base = plan('PLN-0003');
  const dc = base.dataCenterId!;
  const ups = data.upsUnits.filter(u => u.dataCenterId === dc && u.status !== 'Failed').sort((a, b) => b.capacityKw - a.capacityKw);
  const total = ups.reduce((a, u) => a + u.capacityKw, 0);
  // Independent of the seeded numbers: load the UPS to 95% of what is installed, so taking out the largest unit leaves less than the live load.
  const loaded: PlannerData = { ...data, upsUnits: data.upsUnits.map(u => (u.dataCenterId === dc && u.status !== 'Failed' ? { ...u, loadKw: Math.round(u.capacityKw * 0.95), status: 'Operational' as const } : u)) };
  const live = ups.reduce((a, u) => a + Math.round(u.capacityKw * 0.95), 0);
  const p = clone(base); p.id = 'PLN-SYN-PLANT'; p.plnId = 'PLN-SYN-PLANT'; p.status = 'Draft'; p.artefacts = undefined; p.baseline = undefined;
  const rating = ups[0].capacityKw;
  p.plantLines = [{ id: 'PL-1', system: 'UPS', action: 'add', targetAssetId: ups[0].id, ratingKw: rating, qty: 1, stage: 1 }];
  p.cutIns = [{ id: 'CI-1', order: 1, stage: 1, title: 'Isolate the largest UPS', isolatedAssetIds: [ups[0].id], isolatedLabel: ups[0].name, transfer: 'Transfer to B path', windowStart: '', windowEnd: '', mitigation: '', rollback: 'Return the path', connectsLineIds: ['PL-1'], status: 'Planned' }];
  p.phases = [{ ...p.phases[0], itKw: p.designPowerKw }];
  const e = ev(p, loaded); const an = plantOf(e)!;
  const ci = an.cutIns[0];
  ok(ci && ci.liveLoadKw === live && ci.remainingKw === total - ups[0].capacityKw && ci.remainingKw < ci.liveLoadKw, `cut-in leaves ${ci?.remainingKw} kW for ${ci?.liveLoadKw} kW live`);
  ok(rule(e, 'R-PLT-05')?.status === 'fail', 'R-PLT-05 fails when the remaining capacity is below the live load');
  ok(blockers(p, e, templates.find(t => t.id === p.templateId), loaded).some(b => b.level === 'bad' && /Cut-in step 1/.test(b.text)), 'the wizard blocks submission');
  ok(ci.exposedRackIds.length >= 0 && Array.isArray(ci.customers), `exposure traced behind the isolated UPS (${ci.exposedRackIds.length} racks, ${ci.services} services)`);
  // Just enough temporary capacity: the step holds at N, and temporary plant enters the bill.
  const p2 = clone(p); p2.id = 'PLN-SYN-PLANT2'; p2.cutIns![0].transfer = 'Temporary generator'; p2.cutIns![0].temporaryKw = ci.liveLoadKw - ci.remainingKw + 1;
  const e2 = ev(p2, loaded); const ci2 = plantOf(e2)!.cutIns[0];
  ok(ci2.ok && ci2.redundancyLeft === 'N', `temporary plant restores the step (${ci2.redundancyLeft})`);
  ok(buildBom(p2, e2, benchmarks).lines.some(l => l.item === 'Temporary generator hire'), 'temporary generator added to the bill when redundancy drops below N+1');
  // N+1 sizing with units the size of the largest installed one: suggested = ceil((needed − usable today) / unit).
  const s = plantOf(e2)!.baseline!.systems.find(x => x.system === 'ups')!;
  const sug = plantOf(e2)!.lines[0].suggestedQty!;
  const expect = Math.max(0, Math.ceil((s.requiredKw - s.usableKw) / rating));
  ok(sug === expect, `N+1 sizing: ${sug} × ${rating} kW suggested, ${expect} expected (need ${s.requiredKw} kW, usable ${s.usableKw} kW)`);
  ok(lineUnitKwCheck(), 'kVA × power factor and generator standby → prime conversion');
}
function lineUnitKwCheck(): boolean {
  const p = clone(plan('PLN-0003')); p.id = 'PLN-SYN-KVA';
  p.plantLines = [{ id: 'G1', system: 'Generator', action: 'add', ratingKw: 0, ratingKva: 2500, qty: 1, stage: 1 }, { id: 'T1', system: 'Transformer', action: 'add', ratingKw: 0, ratingKva: 2000, qty: 1, stage: 1 }];
  const an = plantOf(ev(p))!;
  const g = an.lines.find(l => l.line.id === 'G1')!; const t = an.lines.find(l => l.line.id === 'T1')!;
  return g.unitKw === 1800 && t.unitKw === 1900; // 2500 kVA × 0.8 × 0.9 (Tier III prime); 2000 kVA × 0.95
}

/* ================================================================== network */
console.log('\nPLN-0009 · Ashburn–Frankfurt DCI');
{
  const p = plan('PLN-0009'); const e = ev(p); const an = networkOf(e)!; const bom = buildBom(p, e, benchmarks);
  ok(!!p.peerDataCenterId && an.z.dc?.code === 'FRA-COLO1', 'Z end set to Frankfurt COLO-1');
  ok((p.paths ?? []).length === 2 && new Set(an.paths.map(x => x.provider?.id)).size === 2, 'two paths from different carriers');
  ok(an.circuits.some(c => c.action === 'upgrade' && an.paths.some(x => x.path.replacesCircuitId === c.circuit.id)), 'the existing circuit is the one upgraded');
  ok(e.hardFails === 0, `approved plan passes its own rules (${e.findings.filter(f => f.status === 'fail').map(f => f.rule.id).join(', ') || 'none'})`);
  ok(rule(e, 'R-DCI-03')?.status === 'pass' && rule(e, 'R-DCI-02')?.status === 'pass', 'diversity and survivability pass');
  ok(!bom.lines.some(l => /Corning/.test(l.manufacturer)), 'no Corning line system in the bill');
  ok(bom.lines.filter(l => /^Carrier service/.test(l.item)).every(l => l.monthly && l.unit === 'month'), 'carrier services are monthly lines (MRC × term)');
  ok(bom.lines.filter(l => /^Optics/.test(l.item)).length === 2 * an.paths.length, 'optics per end per path');
  ok(bom.lines.filter(l => /^Cross-connect ·/.test(l.item)).length === an.paths.length, 'a cross-connect at the colocation end of each path');
  const oneOff = bom.lines.filter(l => !l.monthly).reduce((a, l) => a + l.total, 0);
  ok(Math.abs(e.estimate.capexTotal - (oneOff + (e.estimate.contingencyUsd ?? 0) + an.etcUsd)) <= 2, `CapEx = one-off bill + contingency + early termination (${e.estimate.capexTotal})`);
  const monthlyNew = bom.lines.filter(l => l.monthly).reduce((a, l) => a + l.unitCost, 0);
  ok(e.estimate.opexMonthly === monthlyNew - an.ceasedMonthlyUsd, `OpEx is the monthly delta: ${monthlyNew} new − ${an.ceasedMonthlyUsd} ceased = ${e.estimate.opexMonthly}`);
  const ip = an.ip!; const items = ip.items.filter(i => i.cidr);
  const inPool = (cidr: string, poolCidr?: string) => { const r = parseCidr(cidr), pr = poolCidr ? parseCidr(poolCidr) : undefined; return !!r && !!pr && contains(pr, r); };
  ok(items.length === an.paths.length && items.every(i => i.cidr!.endsWith('/31') && inPool(i.cidr!, i.poolCidr)), '/31 per path from a transit pool');
  ok(items.some(i => i.dataCenterId === an.a.dc?.id) && items.some(i => i.dataCenterId === an.z.dc?.id), '/31s drawn from both ends’ IPAM pools');
  const clash = items.filter(i => data.subnets.some(s => s.status !== 'Container' && s.cidr !== i.poolCidr && (() => { const a = parseCidr(s.cidr), b = parseCidr(i.cidr!); return !!a && !!b && overlap(a, b); })()));
  ok(!clash.length, 'no /31 overlaps a subnet already in IPAM');
  // The organisation's ASN is the estate AS registered in IPAM (64512), not a number typed on the plan (integration fix).
  ok(buildIpPlan(p, e).asns.some(a => a.registered && data.asns.some(x => String(x.asn) === a.asn && /estate fabric/i.test(x.description ?? ''))), 'BGP: local ASN recorded (the estate AS registered in IPAM)');
  ok(e.schedule.some(s => s.item.startsWith('Carrier wave (subsea)')) && e.schedule.some(s => /LOA\/CFA/.test(s.item)) && e.schedule.some(s => /Old circuits ceased/.test(s.item)), 'carrier order → LOA/CFA → … → cease old');
}

console.log('\nSynthetic DCI · one carrier on both paths, survivability, no kW');
{
  const base = plan('PLN-0009');
  const p = clone(base); p.id = 'PLN-SYN-DCI'; p.plnId = 'PLN-SYN-DCI'; p.status = 'Draft';
  p.paths = p.paths!.map(x => ({ ...x, providerId: base.paths![0].providerId, providerName: base.paths![0].providerName }));
  const e = ev(p);
  ok(rule(e, 'R-DCI-03')?.status === 'fail', `both paths on one carrier fail diversity (${rule(e, 'R-DCI-03')?.detail})`);
  const w = clone(p); w.id = 'PLN-SYN-DCI-W'; w.params = { ...w.params, diversityWaiver: 'Accepted by the network architect for 6 months' };
  ok(rule(ev(w), 'R-DCI-03')?.status === 'warn', 'a named waiver turns it into a warning');
  const s = clone(base); s.id = 'PLN-SYN-SURV'; s.params = { ...s.params, protection: '1+1 (full demand on one path)', dciGbpsRequired: 800 };
  ok(rule(ev(s), 'R-DCI-02')?.status === 'fail', '2 × 400G cannot protect 800G 1+1');
  s.params = { ...s.params, dciGbpsRequired: 400 }; s.id = 'PLN-SYN-SURV2';
  ok(rule(ev(s), 'R-DCI-02')?.status === 'pass', '2 × 400G protects 400G 1+1');
  // A network plan created in the wizard: no kW and no phases still gets a dated schedule.
  const n = clone(base); n.id = 'PLN-SYN-NOKW'; n.designPowerKw = 0; n.phases = []; n.paths = []; n.targetGoLive = new Date(Date.now() + 200 * 864e5).toISOString();
  const en = ev(n);
  ok(en.schedule.length > 0 && en.schedule.every(x => Number.isFinite(new Date(x.needBy).getTime())), `network plan with no kW has a dated schedule (${en.schedule.length} items)`);
  ok(en.schedule.some(x => x.item === 'Traffic cut over' && x.needBy.slice(0, 10) === n.targetGoLive.slice(0, 10)), 'cut-over dated at the target go-live');
  ok(blockers(n, en, templates.find(t => t.id === n.templateId), data).some(b => b.level === 'bad' && /No paths/.test(b.text)), 'no paths blocks submission');
  // ZR optics cannot cross the Atlantic.
  const z = clone(base); z.id = 'PLN-SYN-ZR'; z.paths = z.paths!.map(x => ({ ...x, linkType: 'ZR optics on dark fibre' as const }));
  ok(rule(ev(z), 'R-DCI-06')?.status === 'fail', 'optics reach fails for ZR across an ocean');
  const nz = clone(base); nz.id = 'PLN-SYN-NOZ'; nz.peerDataCenterId = undefined;
  ok(blockers(nz, ev(nz), templates.find(t => t.id === nz.templateId), data).some(b => /both ends/i.test(b.text)), 'missing Z end blocks the plan');
}

console.log('\nSynthetic fabric uplift');
{
  const f = clone(plan('PLN-0009')); f.id = 'PLN-SYN-FAB'; f.peerDataCenterId = undefined; f.paths = []; f.params = { ...f.params, networkKind: 'Fabric uplift inside one site', fabricTargetGbps: '400', fabricUplinksPerLeaf: 4, fabricTargetOversub: 3 };
  const e = ev(f); const an = networkOf(e)!;
  ok(an.fabric && an.fabric.leaves.length > 0, `fabric read from devices (${an.fabric?.leaves.length} leaves, ${an.fabric?.spines.length} spines)`);
  ok(['pass', 'fail'].includes(rule(e, 'R-FAB-01')?.status ?? '') && rule(e, 'R-DCI-03')?.status === 'n/a', 'fabric rules checked, DCI rules not applicable');
  ok(buildBom(f, e, benchmarks).lines.some(l => l.item === 'Optics'), 'fabric bill has optics at the target speed');
}

/* ================================================================== execution */
console.log('\nExecution against the in-memory database');
await ensureMockDbReady();
const live = (): PlannerData => { const out = { ready: true } as Record<string, unknown>; for (const k of PLANNER_DATA_KEYS) out[k] = (db.getAll(k, { pageSize: 1000000 }).data as { isDeleted?: boolean }[]).filter(r => !r.isDeleted); return out as unknown as PlannerData; };
const env = (d: PlannerData) => ({
  actor: 'Smoke test', templates: db.getAll('plannerTemplates', { pageSize: 100000 }).data as unknown as T.PlannerTemplate[], benchmarks: db.getAll('plannerBenchmarks', { pageSize: 100000 }).data as unknown as T.PlannerBenchmark[], data: d,
  audit: () => undefined,
  startProcess: async () => ({ id: `PI-${Math.random().toString(36).slice(2, 8)}` }),
  createProgramFromBlueprint: async () => ({ programId: undefined }),
  createProgram: async (i: { name: string }) => { const id = `PROG-SMK-${Math.random().toString(36).slice(2, 6)}`; db.create('programs', { id, progId: id, name: i.name, isDeleted: false }); return id; },
  createProject: async (i: { name: string; template: string; programId: string; detail?: Record<string, unknown> }) => { const id = `PROJ-SMK-${Math.random().toString(36).slice(2, 6)}`; db.create('projects', { id, projId: id, name: i.name, template: i.template, programId: i.programId, notes: JSON.stringify(i.detail ?? {}), isDeleted: false }); return id; },
});
{
  const d = live(); const p = d.plannerPlans.find(x => x.plnId === 'PLN-0009')!;
  const res = await runExecution(env(d), p);
  ok(res.ok, `DCI execution ran (${res.errors.map(e => `${e.step}: ${e.message}`).join('; ') || 'no errors'})`);
  const after = live();
  const ckts = after.circuits.filter(c => c.plannerPlanId === p.id);
  ok(ckts.length === 2 && ckts.every(c => c.status === 'Planned' && !!c.orderedAt && !!c.diversityGroup), 'planned circuits with ordered date and diversity group');
  const terms = after.circuitTerminations.filter(t => ckts.some(c => c.id === t.circuitId));
  ok(terms.length === 4 && terms.some(t => t.side === 'A' && t.dataCenterId === p.dataCenterId) && terms.some(t => t.side === 'Z' && t.dataCenterId === p.peerDataCenterId), 'A and Z terminations on every circuit');
  ok((res.artefacts.circuitIds ?? []).length === 2 && (res.artefacts.terminationIds ?? []).length === 4, 'circuit and termination ids in the artefacts');
  ok(after.changeRequests.some(c => c.plannerPlanId === p.id && c.type === 'NetworkMigration') && after.maintenanceWindows.some(w => w.plannerPlanId === p.id), 'cut-over change and window');
  ok(after.atps.filter(a => a.plannerPlanId === p.id).length === 2, 'acceptance ATP per path');
  const old = after.circuits.find(c => c.id === p.paths![0].replacesCircuitId);
  ok(!!old?.ceaseDate, 'cease of the upgraded circuit scheduled');
  const subnets = after.subnets.filter(s => s.plannerPlanId === p.id);
  ok(subnets.some(s => s.dataCenterId === p.dataCenterId) && subnets.some(s => s.dataCenterId === p.peerDataCenterId), '/31s recorded at both ends in IPAM');
  ok(after.projects.some(x => (res.artefacts.projectIds ?? []).includes(x.id) && x.template === 'DCI / WAN Uplift'), 'DCI / WAN Uplift project');
}
{
  // PLN-0003 is already executing; execute an approved copy of it (governance freezes its baseline at execution).
  const seeded = live().plannerPlans.find(x => x.plnId === 'PLN-0003')!;
  const copy: T.PlannerPlan = { ...clone(seeded), id: 'PLN-SMK-PLANT', plnId: 'PLN-SMK-PLANT', status: 'Approved', artefacts: undefined, baseline: undefined, programId: undefined, cutIns: (seeded.cutIns ?? []).map(c => ({ ...c, changeRequestId: undefined, maintenanceWindowId: undefined, status: 'Planned' as const })) };
  db.create('plannerPlans', copy as unknown as Record<string, unknown>);
  const d = live(); const p = d.plannerPlans.find(x => x.id === 'PLN-SMK-PLANT')!;
  const res = await runExecution(env(d), p);
  ok(res.ok, `plant execution ran (${res.errors.map(e => `${e.step}: ${e.message}`).join('; ') || 'no errors'})`);
  const after = live();
  const chg = after.changeRequests.filter(c => c.plannerPlanId === p.id && c.type === 'PowerUpgrade');
  ok(chg.length === (p.cutIns ?? []).length && chg.every(c => !!c.rollbackPlan && !!c.scheduledStart), 'a PowerUpgrade change with MOP and rollback per cut-in');
  ok(after.maintenanceWindows.filter(w => w.plannerPlanId === p.id).length === chg.length, 'a maintenance window per cut-in');
  ok(after.upsUnits.filter(u => u.plannerPlanId === p.id && u.status === 'Planned').length === 2, 'planned UPS records');
  ok(after.chillers.some(c => c.plannerPlanId === p.id && c.status === 'Planned'), 'planned chiller record');
  const atps = after.atps.filter(a => a.plannerPlanId === p.id);
  ok(atps.some(a => a.level === 'L3 Pre-functional') && atps.some(a => a.level === 'L4 Functional') && atps.some(a => a.level === 'L5 IST'), 'L3, L4 and L5 ATPs');
  ok((res.artefacts.hotoIds ?? []).length === 1, 'hand-over record');
  ok(after.projects.some(x => (res.artefacts.projectIds ?? []).includes(x.id) && x.template === 'Plant Upgrade Works'), 'Plant Upgrade Works project');
}

console.log(`\n${checks - failures} of ${checks} checks passed`);
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
