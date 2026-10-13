/* Smoke test with assertions for the build family (new data centre, expansion, portfolio, edge)
   and the generic outputs (IP plan from IPAM, per-phase initiation, permit gates, pack manifest).
   Run: npx tsx scripts/planner-build-smoke.mts   (exits non-zero on the first failed section) */
import { db, ensureMockDbReady } from '../src/mock/db';
import { evaluate, type Evaluation } from '../src/modules/planner/lib/engine';
import { buildBom, buildInitiation, buildIpPlan } from '../src/modules/planner/lib/outputs';
import { parseCidr, overlap } from '../src/modules/planner/lib/ipam';
import { PLANNER_DATA_KEYS, plannerDataFromSnapshot, type PlannerData } from '../src/modules/planner/lib/plannerData';
import { runExecution, nextId, type ExecEnv } from '../src/modules/planner/lib/execute';
import { buildScope } from '../src/modules/planner/lib/scopes/build';
import { modelFor } from '../src/modules/planner/lib/scopes';
import type * as T from '../src/mock/data/types';

await ensureMockDbReady();
const snapshot = () => plannerDataFromSnapshot(Object.fromEntries(PLANNER_DATA_KEYS.map(k => [k, db.getAllRaw(k)])) as Record<string, unknown>);
let data: PlannerData = snapshot();
const templates = db.getAllRaw('plannerTemplates') as unknown as T.PlannerTemplate[];
const benchmarks = db.getAllRaw('plannerBenchmarks') as unknown as T.PlannerBenchmark[];
const scenarios = db.getAllRaw('plannerScenarios') as unknown as T.PlannerScenario[];
const plan = (pln: string) => data.plannerPlans.find(p => p.plnId === pln)!;
const ev = (p: T.PlannerPlan, sc?: T.PlannerScenario | null, d: PlannerData | undefined = data) => evaluate(p, sc ?? null, templates, benchmarks, undefined, d);
const tpl = (p: T.PlannerPlan) => templates.find(t => t.id === p.templateId);
const finding = (e: Evaluation, id: string) => e.findings.find(f => f.rule.id === id);

let failures = 0; let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) { failures++; console.log(`  FAIL ${msg}`); } };
const section = (name: string, fn: () => void | Promise<void>) => async () => { console.log(`\n# ${name}`); const before = failures; try { await fn(); } catch (e) { failures++; console.log(`  FAIL threw: ${e instanceof Error ? e.stack : String(e)}`); } console.log(failures === before ? '  ok' : `  ${failures - before} failure(s)`); };
const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x)) as X;
const months = (m: number) => new Date(Date.now() + m * 30.4 * 864e5).toISOString();
const FAMILY_RULE = /^R-(SITE|CMP-02|EXP|POR|EDGE)/;
const BUILD = ['new-dc', 'expansion', 'portfolio', 'edge'];

const tests = [
  section('IP plans come from IPAM: no hash, no overlapping containers, unique ASNs', () => {
    const containers = data.subnets.filter(s => s.status === 'Container').map(s => parseCidr(s.cidr)!);
    const blocks = data.cidrBlocks.map(b => parseCidr(b.cidr)!);
    const newOnes: { pln: string; r: NonNullable<ReturnType<typeof parseCidr>> }[] = [];
    const asnRanges: { pln: string; lo: number; hi: number }[] = [];
    for (const p of data.plannerPlans) {
      const e = ev(p); const ip = buildIpPlan(p, e);
      if (!ip.items.length) continue;
      ok(!ip.pending, `${p.plnId}: IP plan allocated (data loaded)`);
      for (const c of ip.containers ?? []) {
        const r = parseCidr(c.cidr)!;
        ok(blocks.some(b => b.start <= r.start && r.end <= b.end), `${p.plnId}: container ${c.cidr} inside a CIDR block of IPAM`);
        if (c.isNew) { ok(!containers.some(x => overlap(x, r)), `${p.plnId}: new container ${c.cidr} clear of existing site containers`); newOnes.push({ pln: p.plnId, r }); }
        else ok(data.subnets.some(s => s.status === 'Container' && s.cidr === c.cidr && s.dataCenterId === p.dataCenterId), `${p.plnId}: existing-site prefixes come from the site's own container`);
      }
      for (const it of ip.items) {
        const r = parseCidr(it.cidr);
        ok(r && (ip.containers ?? []).some(c => { const k = parseCidr(c.cidr)!; return k.start <= r.start && r.end <= k.end; }), `${p.plnId}: ${it.name} ${it.cidr} inside its container`);
      }
      for (const a of ip.asns) { const [lo, hi] = a.asn.split(' to ').map(Number); asnRanges.push({ pln: p.plnId, lo, hi: hi ?? lo }); ok(lo >= 4200000000 && (hi ?? lo) <= 4294967294, `${p.plnId}: ASN ${a.asn} in the RFC 6996 private range`); }
      // The old generator put every plan at 10.(64 + hash % 120).0.0; a plan at an existing site must sit in its site container instead.
      if (p.dataCenterId) ok(ip.aggregate.split(', ').every(a => data.subnets.some(s => s.cidr === a && s.status === 'Container')), `${p.plnId}: aggregate ${ip.aggregate} is the site container, not a formula`);
    }
    for (let i = 0; i < newOnes.length; i++) for (let j = i + 1; j < newOnes.length; j++) ok(!overlap(newOnes[i].r, newOnes[j].r), `containers of ${newOnes[i].pln} and ${newOnes[j].pln} do not overlap`);
    for (let i = 0; i < asnRanges.length; i++) for (let j = i + 1; j < asnRanges.length; j++) if (asnRanges[i].pln !== asnRanges[j].pln) ok(asnRanges[i].hi < asnRanges[j].lo || asnRanges[j].hi < asnRanges[i].lo, `ASNs of ${asnRanges[i].pln} and ${asnRanges[j].pln} do not overlap`);
    ok(newOnes.length >= 3, 'at least three plans (new site, expansion, edge) get new containers');
    // Without platform data nothing is allocated.
    const p = plan('PLN-0001'); const pend = buildIpPlan(p, evaluate(p, null, templates, benchmarks, undefined, undefined));
    ok(pend.pending && /platform data loads/.test(pend.aggregate) && pend.items.every(i => /platform data loads/.test(i.cidr)), 'without data the IP plan says "allocated when platform data loads"');
  }),

  section('New data centre: feasibility rules, candidates, per-phase projects and permit gates (PLN-0001)', () => {
    const p = plan('PLN-0001'); const e = ev(p); const a = buildScope(e)!;
    ok(p.status === 'In review', 'PLN-0001 is in review');
    const own = e.findings.filter(f => FAMILY_RULE.test(f.rule.id));
    ok(own.length >= 6, `family rules evaluated (${own.length})`);
    ok(own.every(f => f.status !== 'fail'), `no family rule fails on an in-review plan: ${own.filter(f => f.status === 'fail').map(f => `${f.rule.id} ${f.detail}`).join('; ')}`);
    ok(own.every(f => f.status !== 'n/a' || f.rule.id === 'R-CMP-02'), 'feasibility rules are answered (not n/a) when site facts exist');
    ok((a.candidates ?? []).length === 3 && a.candidates!.some(c => c.rank === 1 && c.candidate.chosen), 'three candidates scored; the chosen one ranks first');
    ok(a.candidates!.filter(c => !c.feasible).length >= 1, 'a candidate that breaks a hard limit is marked infeasible');
    const t = tpl(p); const init = buildInitiation(p, e, t, buildBom(p, e, benchmarks));
    ok(init.blueprintKey === 'ai-gpu-factory', `blueprint from the template or the site type, not a guess (${init.blueprintKey})`);
    for (const ph of p.phases) {
      const ps = init.projects.filter(x => x.planPhaseId === ph.id && !x.shared);
      ok(ps.length >= 5, `phase ${ph.id} has its own project set (${ps.length})`);
      const last = ps.filter(x => x.key !== 'it-procurement').reduce((m, x) => (x.end > m ? x.end : m), '');
      ok(Math.abs(new Date(last).getTime() - new Date(ph.goLive).getTime()) < 2 * 864e5, `phase ${ph.id} projects end at its go-live (${last.slice(0, 10)} vs ${ph.goLive.slice(0, 10)})`);
      ok(init.projects.some(x => x.planPhaseId === ph.id && x.key === 'it-procurement'), `phase ${ph.id} has its own IT procurement project`);
    }
    ok(init.projects.filter(x => x.key === 'master-plan').length === 1, 'the master plan runs once');
    const itBudget = init.projects.filter(x => x.key === 'it-procurement').reduce((s, x) => s + x.budget, 0);
    const it = e.estimate.capex.filter(l => /IT and network/.test(l.item)).reduce((s, l) => s + l.amount, 0);
    ok(Math.abs(itBudget - it) < 10, 'IT budget sits only in the IT procurement projects');
    ok(Math.abs(init.projects.reduce((s, x) => s + x.budget, 0) - e.estimate.capexTotal) < init.projects.length + 5, 'project budgets add up to the CapEx');
    ok((init.permitGates ?? []).length === p.permits.length && init.permitGates!.every(g => g.projectUid), 'every permit gates a project');
    ok((init.atps ?? []).filter(x => x.level === 'L5 IST').length >= p.phases.length, 'an L5 integrated test per phase');
    ok((init.atps ?? []).every(x => x.projectUid && init.projects.find(pp => pp.uid === x.projectUid)?.commissioning), 'ATPs sit on a commissioning project');
    // Scenario: candidate B is energised too late for phase 1.
    const sc = scenarios.find(s => s.planId === p.id && s.overrides.candidateId === 'C2');
    ok(!!sc, 'a scenario evaluates candidate B');
    if (sc) { const eb = ev(p, sc); ok(finding(eb, 'R-SITE-03')?.status === 'fail' && /interim generation/.test(finding(eb, 'R-SITE-03')!.detail), 'candidate B fails energisation and proposes interim generation or a later phase 1'); }
  }),

  section('New data centre: synthetic plans that break the site limits and the permit gate', () => {
    const p = clone(plan('PLN-0001')); p.id = 'SYN-NDC'; p.plnId = 'SYN-NDC'; p.status = 'Draft';
    p.candidates = [{ ...p.candidates![0], gridOfferMva: 40, buildableHa: 0.2, waterM3PerDay: 50, gridEnergisation: months(30), chosen: true }];
    p.permits = [{ id: 'X1', name: 'Building permit', authority: 'City', leadWeeks: 120, neededBefore: months(10), status: 'Not started' }];
    const e = ev(p);
    for (const id of ['R-SITE-01', 'R-SITE-02', 'R-SITE-03', 'R-SITE-04', 'R-CMP-02']) ok(finding(e, id)?.status === 'fail', `${id} fails: ${finding(e, id)?.detail}`);
    p.candidates = []; const e2 = ev(p);
    ok(finding(e2, 'R-SITE-01')?.status === 'n/a', 'no site facts: feasibility rules are not checked (n/a), never a pass');
    ok(modelFor('new-dc').blockers!(p, e2, data).some(b => b.level === 'bad'), 'no site facts blocks submission');
  }),

  section('Expansion: campus headroom, uprates, shared plant (PLN-0010 and synthetic)', () => {
    const p = plan('PLN-0010'); const e = ev(p); const a = buildScope(e)!;
    ok(a.campus && a.campus.campus.perSideKw > 0, 'campus intake read from utility feeds');
    ok(!e.findings.some(f => f.rule.id === 'R-PWR-01'), 'the invented profile-feed rule is replaced for expansions');
    ok(finding(e, 'R-EXP-01') && finding(e, 'R-EXP-01')!.status !== 'n/a', 'R-EXP-01 is evaluated');
    const t = tpl(p); ok(t?.blueprintKey === 'campus-expansion', 'expansion template uses the campus-expansion blueprint');
    ok(!t?.requiredAspects.some(x => x.aspect === 'migration' && x.depth !== 'skipped'), 'no migration step for expansions');
    const bom = buildBom(p, e, benchmarks);
    ok(!bom.lines.some(l => l.item === 'Core router'), 'campus core routers are shared, not bought');
    ok(bom.lines.some(l => l.note), 'shared lines carry a note');
    // A big building on a campus with no headroom and no uprate fails; an uprate energised in time fixes the phase.
    const s = clone(p); s.id = 'SYN-EXP'; s.plnId = 'SYN-EXP'; s.permits = []; s.designPowerKw = 40000;
    s.phases = [{ id: 'P1', name: 'Block 1', goLive: months(30), itKw: 40000, halls: 16, racks: 2000, status: 'Planned' }];
    const es = ev(s);
    ok(finding(es, 'R-EXP-01')?.status === 'fail', `expansion fails when the campus headroom is short: ${finding(es, 'R-EXP-01')?.detail}`);
    s.permits = [{ id: 'U1', name: 'Utility uprate', authority: 'Utility', leadWeeks: 20, neededBefore: months(12), status: 'Approved', upliftKw: 120000 }];
    ok(ev(s).findings.find(f => f.rule.id === 'R-EXP-01')?.status === 'pass', 'an approved uprate energised before the phase covers it');
    s.permits[0].neededBefore = months(40);
    ok(ev(s).findings.find(f => f.rule.id === 'R-EXP-01')?.status === 'fail', 'an uprate energised after the phase does not count');
    const rsv = modelFor('expansion').reservations!(p, e, data);
    ok(rsv.length === 1 && rsv[0].resourceId === p.campusId && rsv[0].unit === 'kW', 'expansion holds campus intake capacity');
  }),

  section('Edge: per-site variants, per-variant sizing and bill (PLN-0007 and synthetic)', () => {
    const p = plan('PLN-0007'); const e = ev(p); const a = buildScope(e)!;
    ok((p.sites ?? []).length === 12 && p.sites!.every(r => r.ref.kind === 'edgeLocation' && data.edgeLocations.some(l => l.id === r.ref.id)), 'twelve sites from real edge locations');
    ok(p.sites!.every(r => { const l = data.edgeLocations.find(x => x.id === r.ref.id)!; return ['Germany', 'Ireland'].includes(l.country); }), 'sites are in Germany and Ireland');
    ok(new Set(p.sites!.map(r => r.variant)).size >= 2, 'at least two power variants');
    ok(!e.sizing.plant.some(x => x.capacityKw >= 1000), 'no aggregate MW-class plant for edge (sized per site)');
    ok(a.edge!.sites.filter(s => !s.variant.generator).every(s => s.gensetKva === 0), 'battery-only sites have no generator');
    const bom = buildBom(p, e, benchmarks);
    const gens = bom.lines.filter(l => l.item === 'Generator per site');
    ok(gens.length > 0 && gens.every(l => /genset/.test(l.spec) && !/battery/.test(l.spec)), 'generator lines only for the genset variant');
    ok(bom.lines.some(l => l.item === 'Lithium-ion battery' && l.unit === 'kWh'), 'UPS battery priced by kWh');
    ok(bom.lines.filter(l => l.item === 'Edge router and firewall').reduce((s, l) => s + l.qty, 0) === 24, 'two edge routers per site');
    ok(bom.lines.some(l => l.monthly) && bom.total === bom.lines.filter(l => !l.monthly).reduce((s, l) => s + l.total, 0), 'access circuits are monthly and not counted as CapEx');
    ok(!bom.lines.some(l => /Suppression system|Very early smoke/.test(l.item)), 'no hall-scale fire systems on micro sites');
    const own = e.findings.filter(f => FAMILY_RULE.test(f.rule.id) || /R-PWR|R-COOL-01/.test(f.rule.id));
    ok(own.every(f => f.status !== 'fail'), `in-review edge plan passes its power rules: ${own.filter(f => f.status === 'fail').map(f => f.detail).join('; ')}`);
    ok(finding(e, 'R-SCH-01')?.status === 'pass' && e.schedule.some(s => /Prefabricated enclosures · wave 3/.test(s.item)) && e.schedule.some(s => /DNO connections · wave 1/.test(s.item)), 'per-wave schedule with enclosure and DNO lead items');
    const t = tpl(p); const init = buildInitiation(p, e, t, bom);
    ok(init.blueprintKey === 'edge-wave' && p.phases.every(ph => init.projects.some(x => x.planPhaseId === ph.id && x.key === 'sat')), 'edge-wave blueprint per wave');
    ok((init.workOrders ?? []).length === 12 && (init.atps ?? []).filter(x => x.name.startsWith('Edge SAT')).length === 12, 'a work order and an Edge SAT per site');
    ok(p.permits.filter(x => x.siteRef).length >= 24, 'permits per site and variant');
    // Synthetic: a 40 kW site on a single-phase supply fails; a battery-only rollout has no generator line.
    const s = clone(p); s.id = 'SYN-EDGE'; s.plnId = 'SYN-EDGE'; s.status = 'Draft';
    s.sites = s.sites!.map(r => ({ ...r, variant: '1ph-battery', itKw: 40, supplyKva: 23 })); s.designPowerKw = 480;
    const es = ev(s);
    ok(finding(es, 'R-EDGE-01')?.status === 'fail', `a 40 kW site on single-phase supply fails: ${finding(es, 'R-EDGE-01')?.detail.slice(0, 80)}`);
    ok(!buildBom(s, es, benchmarks).lines.some(l => l.item === 'Generator per site') && finding(es, 'R-PWR-03')?.status === 'n/a', 'battery-only rollout: no generator lines, generator rule not applicable');
    const sc = scenarios.find(x => x.planId === p.id && x.overrides.noGenerators === true);
    if (sc) ok(!buildBom(p, ev(p, sc), benchmarks).lines.some(l => l.item === 'Generator per site'), 'the battery-only scenario takes the generators out');
  }),

  section('Portfolio: allocation, demand curve, DCI, rules (PLN-0011)', () => {
    const p = plan('PLN-0011'); const e = ev(p); const m = buildScope(e)!.portfolio!;
    ok(m.demand.length >= 5 && m.demand[0].existingKw > 0, 'yearly demand curve from regional load');
    ok(m.rows.length === 2 && m.rows.every(r => r.route), 'two allocation rows with routes');
    ok(m.options.some(o => o.route === 'new-dc') && m.options.some(o => o.route === 'expansion'), 'candidate sites become expansion and new-site options');
    ok(m.dci.length === 1 && (m.dci[0].latencyMs ?? 0) > 5, 'interconnect demand between the two sites with latency from distance');
    for (const id of ['R-POR-01', 'R-POR-02', 'R-POR-04']) ok(finding(e, id) && finding(e, id)!.status !== 'n/a', `${id} evaluated (${finding(e, id)?.status}: ${finding(e, id)?.detail.slice(0, 90)})`);
    ok(buildBom(p, e, benchmarks).lines.length === 0, 'a portfolio has no bill of materials');
    ok(buildIpPlan(p, e).items.length === 0, 'a portfolio has no IP plan of its own');
    const sc = scenarios.find(x => x.planId === p.id && typeof x.overrides.siteAllocation === 'string');
    if (sc) { const ms = buildScope(ev(p, sc))!.portfolio!; ok(ms.rowSource === 'scenario' && ms.rows[0].ref.kind === 'candidate', 'the "Santiago first" scenario is an alternative allocation'); }
    const s = clone(p); s.id = 'SYN-POR'; s.sites = [{ id: 'X1', name: 'Hall now', ref: { kind: 'dataCenter', id: data.dataCenters.find(d => d.code.startsWith('GRU'))!.id }, itKw: 5000, goLive: months(2), route: 'hall' }];
    const es = ev(s);
    ok(finding(es, 'R-POR-02')?.status === 'fail' && finding(es, 'R-POR-04')?.status === 'fail', 'a hall beyond the site headroom, too soon, fails headroom and lead time');
    const none = clone(p); none.id = 'SYN-POR2'; none.sites = [];
    ok(finding(ev(none), 'R-POR-01')?.status === 'fail', 'no allocation fails R-POR-01');
  }),

  section('Execution: portfolio creates child plans and no purchase orders', async () => {
    const p = clone(plan('PLN-0011')); p.status = 'Approved';
    db.update('plannerPlans', p.id, { status: 'Approved' });
    const res = await runExecution(env(), p);
    ok(res.ok, `execution ok: ${res.errors.map(x => x.message).join('; ')}`);
    ok(res.artefacts.purchaseOrderIds.length === 0, 'no purchase orders');
    ok((res.artefacts.childPlanIds ?? []).length === 2, 'one child plan per allocation row');
    const kids = (db.getAllRaw('plannerPlans') as unknown as T.PlannerPlan[]).filter(k => k.parentPlanId === p.id);
    ok(kids.length === 2 && kids.some(k => k.scope === 'expansion') && kids.some(k => k.scope === 'new-dc'), 'child plans are an expansion and a new site');
    ok(kids.every(k => k.designPowerKw > 0 && k.targetGoLive && Number(k.params.budgetEnvelopeUsd) > 0 && k.status === 'Draft'), 'child plans carry kW, go-live and a budget envelope');
    const saved = db.getById('plannerPlans', p.id) as unknown as T.PlannerPlan;
    ok(saved.sites?.every(r => r.childPlanId), 'allocation rows link to their child plans');
  }),

  section('Execution: new data centre creates the site and uses its ids everywhere', async () => {
    const p = clone(plan('PLN-0001')); p.status = 'Approved'; db.update('plannerPlans', p.id, { status: 'Approved' });
    const res = await runExecution(env(), p);
    ok(res.ok, `execution ok: ${res.errors.map(x => `${x.step}: ${x.message}`).join('; ')}`);
    const site = res.artefacts.createdSite!;
    const dc = db.getById('dataCenters', site.dataCenterId!) as unknown as T.DataCenter;
    ok(dc && dc.status === 'Planned' && dc.dcTypeKey === p.dcTypeKey && dc.designPowerKw === p.designPowerKw && dc.plannerPlanId === p.id, 'DataCenter created as Planned with type, tier and design kW');
    ok(site.buildingIds!.length === p.phases.length, 'one building per phase');
    ok(site.hallIds!.length === p.phases.reduce((s, x) => s + x.halls, 0), 'halls per phase');
    const subnets = res.artefacts.subnetIds.map(id => db.getById('subnets', id) as unknown as T.Subnet);
    const container = subnets.find(s => s.status === 'Container');
    ok(!!container && container.dataCenterId === dc.id, 'site container written to IPAM');
    ok(subnets.filter(s => s.status !== 'Container').every(s => s.dataCenterId === dc.id && s.parentId === container?.id), 'every subnet points at the new site and its container');
    const projects = (res.artefacts.projectIds ?? []).map(id => db.getById('projects', id) as unknown as T.Project);
    ok(projects.length > 15 && projects.every(x => x.plannerPlanId === p.id && x.dataCenterId === dc.id), 'projects carry the plan and the site');
    ok(p.phases.every(ph => projects.some(x => x.planPhaseId === ph.id)), 'projects for every phase');
    ok(projects.some(x => (x.dependsOnProjectIds ?? []).length), 'dependencies wired');
    const permits = res.artefacts.permitIds.map(id => db.getById('permits', id) as unknown as T.Permit);
    ok(permits.every(x => x.dataCenterId === dc.id && x.projectId), 'permits point at the site and the project they gate');
    const atps = (res.artefacts.atpIds ?? []).map(id => db.getById('atps', id) as unknown as T.Atp);
    ok(atps.length > 0 && p.phases.every(ph => atps.some(x => x.planPhaseId === ph.id && x.level === 'L5 IST')), 'ATPs per phase with L5');
    ok((db.getAllRaw('atpSteps') as unknown as T.AtpStep[]).filter(s => atps.some(x => x.id === s.atpId)).length >= atps.length, 'ATP steps copied from the checklist templates');
    const saved = db.getById('plannerPlans', p.id) as unknown as T.PlannerPlan;
    ok(saved.dataCenterId === dc.id, 'the plan now points at its site');
    data = snapshot();
    ok(buildIpPlan(saved, ev(saved)).aggregate === container?.cidr, 'after execution the IP plan reads the same container from IPAM');
  }),

  section('Execution: edge creates work orders, SATs and touches the edge locations', async () => {
    const p = clone(plan('PLN-0007')); p.status = 'Approved'; db.update('plannerPlans', p.id, { status: 'Approved' });
    const res = await runExecution(env(), p);
    ok(res.ok, `execution ok: ${res.errors.map(x => `${x.step}: ${x.message}`).join('; ')}`);
    ok((res.artefacts.workOrderIds ?? []).length === 12, 'twelve site work orders');
    ok((res.artefacts.atpIds ?? []).length === 12, 'twelve Edge SATs');
    ok((res.artefacts.edgeLocationIds ?? []).length === 12, 'edge locations linked');
    ok((res.artefacts.projectIds ?? []).length >= 18, 'projects per wave');
    const subs = res.artefacts.subnetIds.map(id => db.getById('subnets', id) as unknown as T.Subnet);
    ok(subs.some(x => x.status === 'Container') && subs.filter(x => x.status !== 'Container').every(x => x.parentId), 'the rollout container is written to IPAM and parents every subnet');
  }),

  section('Execution: expansion creates a building under the campus', async () => {
    const p = clone(plan('PLN-0010')); p.status = 'Approved'; db.update('plannerPlans', p.id, { status: 'Approved' });
    const res = await runExecution(env(), p);
    ok(res.ok, `execution ok: ${res.errors.map(x => `${x.step}: ${x.message}`).join('; ')}`);
    const site = res.artefacts.createdSite!;
    const dc = db.getById('dataCenters', site.dataCenterId ?? '') as unknown as T.DataCenter | undefined;
    ok(!!dc && dc.campusId === p.campusId && dc.status === 'Planned', 'a planned data centre record on the campus');
    ok(site.buildingIds?.length === 1 && site.hallIds!.length === p.phases.reduce((s, x) => s + x.halls, 0), 'one building with the halls of every phase');
    const projects = (res.artefacts.projectIds ?? []).map(id => db.getById('projects', id) as unknown as T.Project);
    ok(projects.filter(x => /Building Shell/.test(x.name)).length === 1 && p.phases.every(ph => projects.some(x => x.planPhaseId === ph.id && /Hall Block Fit-out/.test(x.name))), 'shell once, fit-out per hall block');
  }),

  section('Pack manifest and closeout', () => {
    for (const pln of ['PLN-0001', 'PLN-0007', 'PLN-0010', 'PLN-0011']) { const t = tpl(plan(pln)); ok((t?.outputs ?? []).length >= 5, `${pln}: template lists its pack (${t?.outputs.length})`); }
    data = snapshot();
    const p = data.plannerPlans.find(x => x.plnId === 'PLN-0011')!;
    const cl = modelFor('portfolio').closeout!(p, data);
    ok(cl.some(c => c.key === 'child-plans' && !c.ok), 'portfolio closeout waits for its child plans');
    const f = data.plannerPlans.find(x => x.plnId === 'PLN-0001')!;
    const cf = modelFor('new-dc').closeout!(f, data);
    ok(cf.some(c => c.key === 'dc-operational' && !c.ok) && cf.some(c => c.key === 'l5-accepted' && !c.ok), 'new site closeout needs the DC operational and L5 accepted');
  }),
];

function env(): ExecEnv {
  return {
    actor: 'Smoke', templates, benchmarks, data: snapshot(), audit: () => undefined,
    startProcess: async (k, b) => ({ id: `PI-${k}-${b}` }),
    createProgramFromBlueprint: async () => undefined,
    createProgram: async i => { const id = nextId('programs', 'PROG'); db.create('programs', { id, progId: id, ...i, projectCount: 0 }); return id; },
    createProject: async i => { const id = nextId('projects', 'PROJ'); db.create('projects', { id, projId: id, programId: i.programId, name: i.name, template: i.template, managerName: i.managerName, dataCenterId: i.dataCenterId, plannedStart: i.plannedStart, plannedEnd: i.plannedEnd, budget: i.budget, status: 'Planning', rag: 'Green', percentComplete: 0, actualSpend: 0 }); return id; },
  };
}

for (const t of tests) await t();
console.log(`\n${checks} checks, ${failures} failure(s)`);
console.log(BUILD.length ? '' : '');
process.exit(failures ? 1 : 0);
