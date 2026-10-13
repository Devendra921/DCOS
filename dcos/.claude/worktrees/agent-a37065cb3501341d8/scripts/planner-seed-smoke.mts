/* Seed realism and AI grounding smoke test (agent G). Exits non-zero when an assertion fails.
   Checks that the demo estate agrees with itself where a customer engineer would click, that seeded
   plan governance follows the templates, and that the AI capabilities stay inside the plan's scope.
   Run: npx tsx scripts/planner-seed-smoke.mts */
import { buildSnapshot } from '../src/mock/db/seed';
import { plannerDataFromSnapshot } from '../src/modules/planner/lib/plannerData';
import { siteBaseline, campusBaseline, usableAt, KVA_TO_KW } from '../src/modules/planner/lib/site';
import { evaluate } from '../src/modules/planner/lib/engine';
import { readIntent, sizingProposals, costCalibration, predictRisks, answerQuestion, estateActuals, placementCandidates, copilotSuggestions } from '../src/modules/planner/lib/ai';
import { APPROVAL_BANDS, approvalAmount } from '../src/mock/db/seed/plannerGovernance';
import { dcTypeProfile } from '../src/mock/data/dcTypes';
import type * as T from '../src/mock/data/types';

const snap = buildSnapshot('small') as unknown as Record<string, unknown[]>;
const data = plannerDataFromSnapshot(snap);
const all = <K extends string>(k: K) => snap[k] as unknown as Record<string, unknown>[];
const templates = snap.plannerTemplates as unknown as T.PlannerTemplate[];
const benchmarks = snap.plannerBenchmarks as unknown as T.PlannerBenchmark[];
let failures = 0; let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) { failures++; console.log(`  FAIL ${msg}`); } };
const section = (t: string) => console.log(`\n# ${t}`);
const dc = (code: string) => data.dataCenters.find(d => d.code === code) as T.DataCenter;
const sb0 = (id: string) => siteBaseline(data, id)!;

section('Customers and services');
const cust = new Set(data.customers.map(c => c.id));
const orphan = data.services.filter(s => !cust.has(s.customerRef));
ok(!orphan.length, `every service resolves its customer (${orphan.length} do not: ${orphan.slice(0, 3).map(s => s.id).join(', ')})`);
for (const s of data.services.filter(x => x.critical)) ok(s.slaTarget >= 99.99, `critical service ${s.id} has an SLA of at least 99.99% (has ${s.slaTarget})`);
for (const c of data.customers) ok(Math.abs(c.revenueMonthly - data.services.filter(s => s.customerRef === c.id).reduce((a, s) => a + s.revenueMonthly, 0)) < 1, `customer ${c.id} revenue equals the sum of its services`);
const xc = data.services.filter(s => s.type === 'Cross-connect');
ok(xc.every(s => s.revenueMonthly <= 3000), 'cross-connects are priced per cross-connect, not per Mbps');

section('Campus intake against committed facility load');
for (const c of data.campuses) {
  const cb = campusBaseline(data, c.id)!;
  console.log(`  ${c.name}: ${cb.perSideKw} kW per side, ${cb.committedFacilityKw} kW committed, ${cb.facilityHeadroomKw} kW free`);
  ok(cb.perSideKw >= cb.committedFacilityKw || /uprate/i.test(c.notes ?? ''), `${c.name} intake covers the committed facility load or is flagged for an uprate`);
}
const ashCb = campusBaseline(data, dc('ASH-DC1').campusId)!;
ok(ashCb.facilityHeadroomKw > 10_000 && ashCb.facilityHeadroomKw < 25_000, `Ashburn leaves limited headroom for Building C: more than phase 1 (12.5 MW) and less than full build (25 MW); has ${ashCb.facilityHeadroomKw} kW`);

section('Site power chain and cooling');
for (const d of data.dataCenters) {
  const prof = dcTypeProfile(d.dcTypeKey)!;
  const feeds = data.utilityFeeds.filter(f => f.dataCenterId === d.id);
  const need = d.designPowerKw * prof.pueTarget;
  for (const f of feeds) ok(f.capacityKw >= need, `${d.code} ${f.name} (${f.capacityKw} kW) carries the design facility load ${Math.round(need)} kW`);
  for (const t of data.transformers.filter(x => feeds.some(f => f.id === x.feedId))) ok(t.capacityKva * KVA_TO_KW >= (feeds.find(f => f.id === t.feedId)?.capacityKw ?? 0) * 0.98, `${d.code} ${t.name} is rated for its feed`);
  const ups = data.upsUnits.filter(u => u.dataCenterId === d.id);
  const live = data.halls.filter(h => h.dataCenterId === d.id && h.status === 'Live').reduce((a, h) => a + h.designPowerKw, 0);
  const units = ups.map(u => ({ capacityKw: u.capacityKw, role: feeds.find(f => f.id === u.feedId)?.redundancyRole }));
  const usable = usableAt(ups[0]?.redundancy ?? 'N', units);
  // Dallas phase 1 runs its UPS below the halls' full design on purpose: that is what PLN-0003 adds.
  if (d.code === 'DAL-HDC1') ok(usable >= sb0(d.id).itLoadKw * 1.5 && usable < live, `${d.code} UPS (${usable} kW at N+1) carries today's load with margin but not the halls' full ${live} kW design`);
  else ok(usable >= Math.min(live, d.designPowerKw) * 0.98, `${d.code} UPS usable at ${ups[0]?.redundancy} covers the live halls' design (${live} kW)`);
  ok(ups.every(u => u.loadKw <= u.capacityKw), `${d.code} no UPS is loaded beyond its rating`);
  const sb = siteBaseline(data, d.id)!;
  for (const z of sb.cooling.zones) ok(z.usableKw >= z.loadKw, `${d.code} ${z.zone.name} carries its load with one unit lost (${z.usableKw} ≥ ${z.loadKw})`);
  const gens = data.generators.filter(g => g.dataCenterId === d.id);
  if (prof.key === 'server-room') ok(!gens.length, `${d.code} (server room) has no generator`);
  else ok(gens.length > 0, `${d.code} has generators`);
  if (d.tier === 'Tier III' && !prof.dcPowerPlant && gens.length) {
    const sum = gens.reduce((a, g) => a + g.capacityKw, 0) - Math.max(...gens.map(g => g.capacityKw));
    ok(sum >= Math.min(live, d.designPowerKw) * prof.pueTarget, `${d.code} generators at N+1 (${sum} kW) cover the live facility load`);
  }
  const wet = data.cracUnits.some(u => data.coolingZones.some(z => z.id === u.coolingZoneId && z.dataCenterId === d.id) && u.type !== 'CRAC');
  const ch = data.chillers.filter(c => c.dataCenterId === d.id);
  ok(!wet || ch.length > 1, `${d.code} has heat rejection (N+1) for its chilled-water or liquid zones`);
  if (prof.physical.liquidCooling === 'standard') ok(ch.every(c => c.supplyTempC >= 30), `${d.code} liquid site rejects heat on warm water`);
  ok(ch.every(c => (c.servesZoneIds ?? []).every(z => data.coolingZones.some(x => x.id === z && x.dataCenterId === d.id))), `${d.code} chillers serve its own zones`);
}
ok(data.upsUnits.filter(u => u.dataCenterId === dc('SYD-MTSO1').id).every(u => /−48V/.test(u.name)), 'Sydney MTSO keeps its −48 V DC plant');
const gru = siteBaseline(data, dc('GRU-MDC1').id)!;
ok(gru.stages.find(s => s.key === 'utility')!.usableKw < 3000 * 1.45, 'São Paulo needs a grid uprate for a 3 MW hall (intake below 3 MW of new facility load)');

section('Dallas HDC-1 phase 1');
const dal = dc('DAL-HDC1'); const dalB = siteBaseline(data, dal.id)!;
ok(dal.status === 'Operational', 'Dallas is operational (phase 1)');
ok(dalB.itLoadKw > 500, `Dallas has live IT load (${dalB.itLoadKw} kW)`);
ok(data.halls.filter(h => h.dataCenterId === dal.id && h.status === 'Live').length === 2 && data.halls.some(h => h.dataCenterId === dal.id && h.status === 'Fitting'), 'Halls 1 and 2 are live, the rest in fit-out');
ok(data.upsUnits.filter(u => u.dataCenterId === dal.id).every(u => u.status === 'Operational' && u.loadKw > 0), 'Dallas UPS modules are operational and loaded');
ok(data.transformers.filter(t => data.utilityFeeds.some(f => f.id === t.feedId && f.dataCenterId === dal.id)).every(t => t.status === 'Operational' && t.loadKw > 0), 'Dallas transformers are operational and loaded');
ok(dalB.cooling.zones.filter(z => z.loadKw > 0).length === 2, 'two Dallas cooling zones carry load');
ok(data.racks.filter(r => r.dataCenterId === dal.id && r.status === 'Active').every(r => r.currentPowerKw > 0), 'every active Dallas rack draws power');
ok(dalB.binding?.key === 'ups' && dalB.headroomItKw < 2000, `the UPS binds at Dallas, so the plant upgrade makes sense (${dalB.binding?.label}, ${dalB.headroomItKw} kW)`);
ok(data.services.some(s => s.dataCenterId === dal.id), 'Dallas carries customer services');

section('Ashburn DC-1 Hall 3');
const h3 = data.halls.find(h => h.dataCenterId === dc('ASH-DC1').id && h.name === 'Hall 3');
ok(h3?.status === 'Shell' && h3.rackCount === 0 && h3.designPowerKw === 2000, 'Ashburn DC-1 Hall 3 is a 2 MW shell for the fit-out');

section('Dublin CO-1 Nexus 3172PQ leaves');
const nx = data.devices.filter(d => d.model === 'Nexus 3172PQ' && d.dataCenterId === dc('DUB-CO1').id);
ok(nx.length > 0, 'Dublin has Nexus 3172PQ leaves');
for (const l of nx) {
  const toServers = data.cables.filter(c => (c.aDeviceId === l.id || c.bDeviceId === l.id) && data.devices.find(d => d.id === (c.aDeviceId === l.id ? c.bDeviceId : c.aDeviceId))?.category?.match(/Server|Storage/));
  ok(toServers.length > 0, `${l.name} is cabled to the servers it serves`);
  ok(data.services.some(s => s.pathDeviceIds.includes(l.id)), `${l.name} is in a service path`);
  const ports = data.deviceComponents.filter(c => c.deviceId === l.id && c.kind === 'interface' && !c.mgmtOnly);
  ok(ports.every(p => /^Ethernet1\/\d+$/.test(p.name) && (p.speedMbps === 10_000 || p.speedMbps === 40_000)), `${l.name} has NX-OS SFP+ 10G and QSFP+ 40G ports`);
}
const dt3172 = (snap.deviceTypes as T.DcimDeviceType[]).find(d => d.model === 'Nexus 3172PQ')!;
ok(dt3172.platform === 'NX-OS', 'the 3172PQ device type runs NX-OS');
ok((snap.componentTemplates as T.ComponentTemplate[]).filter(c => c.deviceTypeId === dt3172.id && c.kind === 'interface').map(c => c.speedMbps).sort().join() === '1000,10000,40000', 'the 3172PQ templates are 10G SFP+, 40G QSFP+ and 1G management');
for (const m of ['PowerEdge R740', 'ProLiant DL380 Gen10', 'QFX5100-48S']) {
  const d = data.devices.find(x => x.model === m)!;
  ok(data.deviceComponents.filter(c => c.deviceId === d.id && c.kind === 'interface').every(c => (c.speedMbps ?? 0) <= 10_000 || /^et-/.test(c.name)), `${m} ports are of its generation (10G and below${m.startsWith('QFX') ? ', 40G uplinks' : ''})`);
}

section('Circuits');
const lum = data.circuits.find(c => c.cid === 'LUM-70062')!;
const z = data.circuitTerminations.find(t => t.circuitId === lum.id && t.side === 'Z');
ok(z?.dataCenterId === dc('FRA-COLO1').id, 'LUM-70062 Z-end is set to Frankfurt COLO-1');
const dci = data.circuits.filter(c => c.diversityGroup === lum.diversityGroup && c.status === 'Active');
ok(dci.length === 2 && dci.every(c => c.commitRateMbps === 100_000), 'Ashburn–Frankfurt runs on 2 × 100G');
ok(new Set(dci.map(c => c.providerId)).size === 2, 'the two paths use different providers');
ok(dci.every(c => c.contractEnd && (c.monthlyCostUsd ?? 0) > 0), 'both paths carry a contract end and a monthly cost');
for (const c of data.circuits) {
  const a = data.circuitTerminations.find(t => t.circuitId === c.id && t.side === 'A');
  const f = a?.interfaceId ? data.interfaces.find(x => x.id === a.interfaceId) : undefined;
  if (f) ok((c.commitRateMbps ?? 0) <= f.speedGbps * 1000, `${c.cid} commits no more than its ${f.speedGbps}G port`);
}

section('Change requests');
const codes = data.dataCenters.map(d => d.code);
for (const c of data.changeRequests) {
  const own = data.dataCenters.find(d => d.id === c.dataCenterId)?.code;
  const named = codes.filter(cd => c.title.includes(cd));
  ok(!named.length || (own && named.includes(own)), `${c.id} title names its own site (${c.title} at ${own})`);
}

section('Vendors and contracts');
const VENDORS = ['Dell Technologies', 'HPE', 'Supermicro', 'NVIDIA', 'Arista Networks', 'Juniper Networks', 'Cisco Systems', 'Palo Alto Networks', 'Pure Storage', 'NetApp', 'Opengear', 'Ciena', 'Nokia', 'Coherent', 'Vertiv', 'Schneider Electric', 'Eaton', 'Caterpillar', 'Stulz', 'Corning', 'CBRE Data Center Solutions', 'NetBuild Corp'];
for (const n of VENDORS) {
  const v = data.vendors.find(x => x.name === n);
  ok(v, `vendor ${n} exists`);
  if (!v) continue;
  const sup = data.contracts.filter(c => c.vendorId === v.id && (c.type === 'Supply' || c.type === 'Framework'));
  if (n === 'Stulz') { ok(v.status === 'Inactive' && sup.length && sup.every(c => c.status !== 'Active'), 'Stulz is inactive and its framework has ended'); continue; }
  ok(v.status === 'Active', `${n} is active`);
  ok(sup.some(c => c.status === 'Active' && new Date(c.endDate).getTime() > Date.now()), `${n} has an active Supply or Framework contract`);
}
ok(data.contracts.filter(c => c.type === 'Lease').some(c => c.dataCenterId === dc('DUB-SR1').id) && data.contracts.some(c => c.type === 'Lease' && c.dataCenterId === dc('FRA-COLO1').id), 'leased sites have their leases');
ok(data.contracts.filter(c => c.type === 'Maintenance').every(c => c.dataCenterId && c.noticeDays && c.annualValue), 'maintenance contracts name their site, notice and annual value');
ok(data.contracts.every(c => (c.status === 'Active') === (new Date(c.endDate).getTime() > Date.now())), 'contract status agrees with the end date');

section('Plan governance');
const plans = data.plannerPlans;
ok(plans.map(p => p.plnId).join() === Array.from({ length: 15 }, (_, i) => `PLN-${String(i + 1).padStart(4, '0')}`).join(), 'plan ids stay PLN-0001…PLN-0015 in order');
for (const p of plans) {
  const tpl = templates.find(t => t.id === p.templateId)!;
  if (p.status === 'Draft') { ok(!p.approvals.length, `${p.plnId} draft has no approvals`); continue; }
  const steps = p.approvals.map(a => a.step);
  ok(steps.every((s, i) => s === tpl.approvalPath[i]), `${p.plnId} approvals follow the template path (${steps.join(' → ')} vs ${tpl.approvalPath.join(' → ')})`);
  ok(p.approvals.every((a, i) => a.order === i + 1 && a.person), `${p.plnId} approvals are ordered and named`);
  const fin = p.approvals.find(a => /finance/i.test(a.step));
  if (fin) {
    const band = APPROVAL_BANDS.find(b => approvalAmount(p) <= b.max)!;
    ok(fin.role === band.role || (band.role === 'Executive' && tpl.approvalPath.includes('Executive') && fin.role === 'Finance Manager'), `${p.plnId} finance step decided by the ${band.role} band (got ${fin.role})`);
  }
  ok(p.templateVersion === tpl.version, `${p.plnId} pins template version ${tpl.version}`);
  if (['Approved', 'Executing', 'Completed'].includes(p.status)) {
    ok(p.approvals.every(a => a.decision.startsWith('Approved')), `${p.plnId} every step approved`);
    ok(p.baseline && p.baseline.capexTotal > 0 && p.baseline.templateVersion === tpl.version, `${p.plnId} has a baseline`);
    ok(p.approvedScenarioId === p.preferredScenarioId, `${p.plnId} approved scenario recorded`);
  }
}
const rej = plans.find(p => p.plnId === 'PLN-0012')!;
ok(rej.approvalHistory?.length === 1 && rej.approvalHistory[0].outcome === 'Rejected' && rej.approvalHistory[0].approvals.some(a => a.decision === 'Rejected' && a.reason), 'PLN-0012 has one rejected round with a reason');
const p3 = plans.find(p => p.plnId === 'PLN-0003')!;
const prog = data.programs.find(x => x.id === p3.programId);
ok(prog && data.projects.some(x => x.programId === prog.id && x.dataCenterId === p3.dataCenterId && x.plannerPlanId === p3.id), 'PLN-0003 links the programme at its own site, through a project carrying its plan id');
const art = p3.artefacts!;
ok(art && art.purchaseOrderIds.length && art.purchaseOrderIds.every(id => data.purchaseOrders.find(po => po.id === id)?.plannerPlanId === p3.id), 'PLN-0003 purchase orders exist and carry the plan id');
ok((art.changeRequestIds ?? []).every(id => data.changeRequests.find(c => c.id === id)?.plannerPlanId === p3.id) && (art.maintenanceWindowIds ?? []).every(id => data.maintenanceWindows.find(m => m.id === id)?.plannerPlanId === p3.id), 'PLN-0003 change and window exist and carry the plan id');
ok(plans.find(p => p.plnId === 'PLN-0005')!.dataCenterId === dc('SIN-NC1').id, 'PLN-0005 sits at the national core site its title names');
const p10 = plans.find(p => p.plnId === 'PLN-0010')!;
ok(p10.risks.some(r => (r.evidence ?? '').includes(`${ashCb.perSideKw / 1000} MW per side`)), 'PLN-0010 campus risk cites the intake recorded in the utility feeds');

section('AI grounding (seeded and synthetic plans)');
const estate = { campuses: data.campuses, dataCenters: data.dataCenters };
const r1 = readIntent('Upgrade the UPS at Dallas HDC-1', estate);
ok(r1.dataCenterId === dal.id && r1.dcTypeKey === 'hyperscale-dc' && r1.tier === dal.tier && r1.climate === 'hot-dry' && r1.scope === 'plant', `intent at a named site takes type, tier and climate from the site (${r1.dcTypeKey}, ${r1.tier}, ${r1.climate})`);
const r2 = readIntent('Upgrade the UPS at Dallas', estate);
ok(r2.dataCenterId === dal.id && r2.dcTypeKey === 'hyperscale-dc', 'intent naming only the campus resolves to its largest operating site');
const r3 = readIntent('Add a 2 MW Tier IV GPU hall at Ashburn DC-1', estate);
ok(r3.dataCenterId === dc('ASH-DC1').id && r3.tier === 'Tier III' && r3.reasons.some(x => /cannot change the site's tier/.test(x)), 'a tier the site does not have is not applied to an in-site plan');
const actuals = (key: string) => estateActuals(key, { dataCenters: data.dataCenters, racks: data.racks, coolingZones: data.coolingZones, programs: data.programs, projects: data.projects });
const forbidden = /carrier|economiser|PUE/i;
for (const p of plans.filter(x => ['server-refresh', 'network-refresh', 'rack-replace', 'migration', 'plant', 'rack', 'pod', 'hall', 'retrofit'].includes(x.scope))) {
  const ev = evaluate(p, null, templates, benchmarks, actuals(p.dcTypeKey), data);
  const props = sizingProposals(p, ev, actuals(p.dcTypeKey), benchmarks);
  ok(!props.some(x => forbidden.test(x.title)), `${p.plnId} (${p.scope}) gets no carrier, economiser or PUE proposal: ${props.map(x => x.title).join('; ') || 'none'}`);
  ok(props.every(x => x.evidence.length > 0), `${p.plnId} proposals cite evidence`);
  const cc = costCalibration(p, ev, actuals(p.dcTypeKey), data.projects, data.dataCenters);
  ok(!cc.applies && cc.adjustment === undefined && !cc.comparables.length, `${p.plnId} gets no whole-site cost calibration`);
  const tier = answerQuestion('What changes if we go Tier IV?', p, ev, [], actuals(p.dcTypeKey));
  if (p.scope !== 'hall') ok(/does not change its tier/.test(tier.lines.join(' ')), `${p.plnId} copilot does not offer a Tier IV redesign for an in-site plan`);
  ok(!copilotSuggestions(p).some(q => /transformer|Tier IV|benchmark/i.test(q)), `${p.plnId} copilot suggestions fit the plan type`);
  const risks = predictRisks(p, ev, { risks: [], projects: data.projects });
  ok(!risks.some(r => /utility connection/i.test(r.title)), `${p.plnId} gets no greenfield utility risk`);
  ok(risks.every(r => r.evidence), `${p.plnId} AI risks cite evidence`);
}
// Synthetic: a server refresh at Ashburn with no carriers in its sizing never asks for a second carrier entry.
const sr = { ...plans.find(p => p.plnId === 'PLN-0013')!, id: 'SYN-1', plnId: 'SYN-1', params: { ...plans.find(p => p.plnId === 'PLN-0013')!.params, carrierCount: 1 } } as T.PlannerPlan;
const srEv = evaluate(sr, null, templates, benchmarks, actuals(sr.dcTypeKey), data);
ok(!sizingProposals(sr, srEv, actuals(sr.dcTypeKey), benchmarks).some(x => /carrier/i.test(x.title)), 'synthetic server refresh with one carrier: no carrier proposal');
// Synthetic: a new site with one carrier is asked for a second, and calibration applies.
const nd = { ...plans.find(p => p.plnId === 'PLN-0001')!, id: 'SYN-2', plnId: 'SYN-2', params: { ...plans.find(p => p.plnId === 'PLN-0001')!.params, carrierCount: 1 } } as T.PlannerPlan;
const ndEv = evaluate(nd, null, templates, benchmarks, actuals(nd.dcTypeKey), data);
ok(sizingProposals(nd, ndEv, actuals(nd.dcTypeKey), benchmarks).some(x => /carrier/i.test(x.title)), 'synthetic new site with one carrier: second carrier proposed');
ok(costCalibration(nd, ndEv, actuals(nd.dcTypeKey), data.projects, data.dataCenters).applies, 'synthetic new site: cost calibration applies');
// Synthetic: a pod at a site, with a need no rack can take: candidates are disabled, never scored.
const pod = { ...plans.find(p => p.plnId === 'PLN-0005')!, id: 'SYN-3' } as T.PlannerPlan;
const cands = placementCandidates(pod, data.racks, data.halls, 500, 40);
ok(cands.every(c => c.disabled && c.score === 0), 'placement candidates that cannot take the load are disabled with score 0');
ok(placementCandidates(pod, data.racks, data.halls, 0.5, 1).some(c => !c.disabled && c.score > 0), 'placement still offers racks that fit');

section('Determinism');
const again = buildSnapshot('small') as unknown as Record<string, { id: string }[]>;
for (const k of ['dataCenters', 'utilityFeeds', 'upsUnits', 'generators', 'chillers', 'devices', 'cables', 'services', 'circuits', 'contracts', 'vendors', 'plannerPlans', 'changeRequests']) ok(JSON.stringify(again[k].map(r => r.id)) === JSON.stringify(all(k).map(r => r.id)), `${k} ids are identical across builds`);
ok(JSON.stringify((again.utilityFeeds as unknown as T.UtilityFeed[]).map(f => f.capacityKw)) === JSON.stringify(data.utilityFeeds.map(f => f.capacityKw)), 'feed ratings are identical across builds');

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
