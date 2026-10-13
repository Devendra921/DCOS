/* In-site plan types (rack, pod, hall, retrofit) against the real seeded estate, with assertions.
   Seeded plans PLN-0002/0004/0005/0008 plus synthetic plans built here: a rack into a full rack, a rack
   that fits, a pod bigger than its site, a hall in a partly used hall, a retrofit whose residual heat
   exceeds the zone, a new hall on a floor without room, and execution of rack, pod, hall and retrofit
   through a recording execution context. Exits non-zero on the first failed assertion group.
   Run: npx tsx scripts/planner-insite-smoke.mts */
import { buildSnapshot } from '../src/mock/db/seed';
import { evaluate, type Evaluation } from '../src/modules/planner/lib/engine';
import { buildBom, buildInitiation, buildIpPlan } from '../src/modules/planner/lib/outputs';
import { plannerDataFromSnapshot, type PlannerData } from '../src/modules/planner/lib/plannerData';
import { blockers } from '../src/modules/planner/components/wizard/wizardModel';
import { siteBaseline, rackBaseline } from '../src/modules/planner/lib/site';
import { rackCandidates, hallGrid } from '../src/modules/planner/lib/placement';
import { classesFromMix, type InSiteAnalysis } from '../src/modules/planner/lib/inSiteAnalysis';
import { inSiteCloseout, inSiteExecute, inSiteExecuteVehicle, inSiteRackUnits, inSiteReservations } from '../src/modules/planner/lib/inSiteExec';
import { overlapsInUse, parseCidr, contains } from '../src/modules/planner/lib/ipam';
import type { ExecCtx } from '../src/modules/planner/lib/scopes/types';
import type * as T from '../src/mock/data/types';

const snap = buildSnapshot('small') as unknown as Record<string, unknown[]>;
const data = plannerDataFromSnapshot(snap);
const templates = snap.plannerTemplates as unknown as T.PlannerTemplate[];
const benchmarks = snap.plannerBenchmarks as unknown as T.PlannerBenchmark[];
let failures = 0; let passes = 0;
const ok = (cond: unknown, msg: string) => { if (cond) { passes++; } else { failures++; console.log(`  ✗ ${msg}`); } };
const section = (t: string) => console.log(`\n▶ ${t}`);
const A = (ev: Evaluation) => ev.scope.inSite as InSiteAnalysis;
const ev = (p: T.PlannerPlan, d: PlannerData = data) => evaluate(p, null, templates, benchmarks, undefined, d);
const plan = (id: string) => data.plannerPlans.find(p => p.plnId === id)!;
const SITE_PLANT_KINDS = ['ups', 'ups-small', 'generator', 'generator-small', 'transformer', 'switchgear', 'utility'];

/* ------------------------------------------------------------------ every seeded in-site plan */
section('Seeded in-site plans');
for (const id of ['PLN-0002', 'PLN-0004', 'PLN-0005', 'PLN-0008']) {
  const p = plan(id); const e = ev(p); const a = A(e); const t = templates.find(x => x.id === p.templateId);
  const bom = buildBom(p, e, benchmarks); const ip = buildIpPlan(p, e); const init = buildInitiation(p, e, t, bom);
  console.log(`  ${id} ${p.scope}/${p.status} at ${p.dataCenterId}: adds ${a.addedKw} kW, ${a.racks} racks, capex $${Math.round(e.estimate.capexTotal / 1000)}k, fails ${e.hardFails} (${e.findings.filter(f => f.status === 'fail').map(f => f.rule.id).join(', ') || 'none'})`);
  ok(a && a.ready, `${id}: analysis present and read from loaded data`);
  if (p.status === 'Approved' || p.status === 'Executing') ok(e.hardFails === 0, `${id}: an Approved plan has no hard fails (${e.findings.filter(f => f.status === 'fail').map(f => `${f.rule.id} ${f.detail}`).join(' | ')})`);
  ok(!bom.lines.some(l => SITE_PLANT_KINDS.includes(l.kind)), `${id}: no UPS, generator, transformer, switchgear or utility lines in the bill`);
  ok(!e.estimate.capex.some(l => /Land and shell|Power plant|Cooling plant/.test(l.item)), `${id}: no land, shell or site plant CapEx shares`);
  ok(!e.estimate.opex.some(l => /Staff|Connectivity|Property|Software/.test(l.item)), `${id}: OpEx is energy and maintenance only`);
  ok(e.estimate.basis === 'bottom-up' && Math.abs(e.estimate.capexTotal - (e.estimate.contingencyUsd ?? 0) - bom.total) <= bom.lines.length, `${id}: estimate = bill (${bom.total}) + contingency (${e.estimate.contingencyUsd}) = ${e.estimate.capexTotal}`);
  ok(!e.findings.some(f => ['R-PWR-01', 'R-PWR-02', 'R-COOL-01', 'R-SPC-01'].includes(f.rule.id)), `${id}: site-plant rules replaced by in-site checks`);
  ok(e.findings.some(f => f.rule.id === 'R-INS-08'), `${id}: site power chain rule present`);
  ok(!ip.items.some(i => /Carrier/.test(i.name)) && ip.asns.length === 0, `${id}: no carrier links or ASNs in the IP plan`);
  if (p.scope === 'rack') { ok(init.designDocs.length === 1 && init.designDocs[0].name === 'Placement note', `${id}: exactly one design document "Placement note"`); ok(init.vehicle === 'change' && init.workOrder.key === 'change', `${id}: delivered by a change request`); ok(ip.items.length === 0 && ip.vlans.length === 0, `${id}: no new prefixes or VLANs for a rack`); }
  if (p.scope === 'pod') ok(init.projects[0]?.template === 'Rack Deployment' && init.workOrder.key === 'work-order', `${id}: Rack Deployment project and work order`);
  if (p.scope === 'hall') ok(init.projects[0]?.template === 'Hall Fit-out' && init.workOrder.key === 'hall-fitout', `${id}: Hall Fit-out project and P02 work order`);
  if (p.scope === 'retrofit') ok(init.projects[0]?.template === 'Liquid Retrofit' && init.designDocs.some(d => d.name === 'Retrofit wave plan'), `${id}: Liquid Retrofit project with a wave plan`);
  if (ip.items.length && p.dataCenterId) { const container = data.subnets.find(s => s.dataCenterId === p.dataCenterId && s.status === 'Container'); ok(!!container && ip.items.every(i => contains(parseCidr(container.cidr)!, parseCidr(i.cidr)!)), `${id}: every prefix inside the site container ${container?.cidr}`); ok(ip.items.every(i => overlapsInUse(data, i.cidr, p.id).length === 0), `${id}: no prefix overlaps a subnet in use`); }
}
{
  const p = plan('PLN-0002'); const a = A(ev(p));
  if (a.hall?.mode === 'partly-used') { const g = a.hall.grid!; ok(a.hall.positions.every(x => ['free', 'empty-rack'].includes(g.cells[x.gridY][x.gridX].state)), 'PLN-0002: planned positions are only free cells of the partly used hall'); ok(!buildBom(p, ev(p), benchmarks).lines.some(l => /White space fit-out|Suppression/.test(l.item)), 'PLN-0002: partly used hall has no shell fit-out lines'); }
  ok(p.designPowerKw <= (a.hall?.designKw ?? 0), `PLN-0002: request (${p.designPowerKw} kW) sized within the hall design (${a.hall?.designKw} kW)`);
  const r = A(ev(plan('PLN-0008'))).retrofit!;
  ok(Math.abs(r.deltaKw - r.rows.reduce((s, x) => s + Math.max(0, x.targetKw - x.todayKw), 0)) < 0.5 && r.rows.length > 0, `PLN-0008: requirement is the added kW (${r.deltaKw})`);
  ok(r.waves.length >= 3 && r.waves.some(w => w.kind === 'drain') && r.waves.some(w => w.kind === 'repopulate'), 'PLN-0008: drain, works and repopulate waves proposed');
  ok(buildBom(plan('PLN-0008'), ev(plan('PLN-0008')), benchmarks).lines.some(l => /Leak detection/.test(l.spec)) && !buildBom(plan('PLN-0008'), ev(plan('PLN-0008')), benchmarks).lines.some(l => l.item === 'Suppression system'), 'PLN-0008: leak detection instead of a hall suppression system');
}

/* ------------------------------------------------------------------ synthetic plans */
const base = (scope: T.PlannerScope, over: Partial<T.PlannerPlan>): T.PlannerPlan => {
  const seedOf = data.plannerPlans.find(p => p.scope === scope)!;
  return { ...seedOf, id: `SYN-${scope}`, plnId: `SYN-${scope}`, status: 'Draft', artefacts: undefined, placement: undefined, waves: [], inSite: {}, approvals: [], params: { ...seedOf.params }, paramSources: { ...seedOf.paramSources }, ...over } as T.PlannerPlan;
};
const fra = data.dataCenters.find(d => d.code.startsWith('FRA-COLO'))!;

section('Rack into a full rack is blocked');
{
  const full = data.racks.find(r => r.status === 'Active' && r.dataCenterId === fra.id && (rackBaseline(data, r.id)!.largestFreeBlock < 10 || r.currentPowerKw >= r.maxPowerKw * 0.9))!;
  const p = base('rack', { dataCenterId: fra.id, designPowerKw: 8, params: { rackCount: 1, placementMode: 'Into existing racks', densityKwPerRack: 8, rackUnitsNeeded: 10, portsPerRack: 2, portSpeedGbps: '25' }, placement: { mode: 'existing-rack', racks: [{ rackId: full.id, kw: 8 }] } });
  const e = ev(p); const a = A(e);
  ok(a.rack!.accepted[0]?.cand.blocked.length > 0, `${full.name} is blocked for 10U and 8 kW (${a.rack!.accepted[0]?.cand.blocked.join('; ')})`);
  ok(['ins-u-block', 'ins-rack-power', 'ins-zone-cooling'].some(k => a.checks[k]?.status === 'fail'), 'a blocked accepted rack fails its check');
  ok(blockers(p, e, templates.find(t => t.id === p.templateId), data).some(b => b.level === 'bad' && /no longer passes/.test(b.text)), 'a blocked accepted rack blocks submission');
  ok(a.rack!.candidates.every(c => !c.blocked.length || c.score === 0), 'blocked candidates score 0 and are never offered first');
  ok(!a.rack!.candidates.slice(0, a.rack!.candidates.filter(c => !c.blocked.length).length).some(c => c.blocked.length), 'every passing candidate is listed before every blocked one');
}

section('Rack that fits: accepted, executed, held');
{
  const small = { u: 4, kw: 1, kg: 60, psus: 4, mode: 'existing-rack' as const };
  let pick: { site: ReturnType<typeof siteBaseline>; rackId: string } | undefined;
  for (const dc of data.dataCenters) { const site = siteBaseline(data, dc.id); const c = rackCandidates(data, site, small).find(x => !x.blocked.length); if (c && site && site.headroomItKw >= 1) { pick = { site, rackId: c.rack.id }; break; } }
  ok(!!pick, 'some site has a rack that passes every check for a 1 kW, 4U placement');
  if (pick) {
    const r760 = data.assetModels.find(m => m.model === 'PowerEdge R760')!;
    const p = base('rack', { dataCenterId: pick.site!.dc.id, designPowerKw: 2.2, inSite: { equipment: [{ assetModelId: r760.id, qty: 2 }] }, params: { rackCount: 1, placementMode: 'Into existing racks', densityKwPerRack: 2.2, portsPerRack: 4, portSpeedGbps: '25', operatorOwnedIt: true }, placement: { mode: 'existing-rack', racks: [{ rackId: pick.rackId, kw: 2.2 }] }, targetGoLive: new Date(Date.now() + 120 * 864e5).toISOString() });
    const e = ev(p); const a = A(e); const acc = a.rack!.accepted[0];
    ok(a.rack!.perRack.u === 4 && a.rack!.perRack.kw === 2.2, `equipment list derives 4U and 2.2 kW (got ${a.rack!.perRack.u}U, ${a.rack!.perRack.kw} kW)`);
    ok(a.checks['ins-u-block'].status === 'pass' && acc?.startU !== undefined, `U block found on ${acc?.cand.rack.name} (${a.checks['ins-u-block'].detail})`);
    ok(['pass', 'warn'].includes(a.checks['ins-rack-power'].status) && a.checks['ins-zone-cooling'].status === 'pass', 'rack power and zone pass');
    ok(!e.estimate.capex.some(l => /Racks and containment/.test(l.item) && l.basis.includes('× Rack,')) && !buildBom(p, e, benchmarks).lines.some(l => l.item === 'Rack'), 'no cabinet bought when placing into an existing rack');
    const holds = inSiteReservations(p, e, data); const units = inSiteRackUnits(p, e);
    ok(holds.some(h => h.resourceType === 'PowerChain' && h.resourceId === acc.cand.rack.id) && holds.some(h => h.resourceType === 'Cooling'), 'reservations hold kW on the rack and cooling on the zone');
    ok(units[0]?.units.length === 4 && units[0].units.every((u, i, xs) => i === 0 || u === xs[i - 1] + 1), 'rack units held are one contiguous block');
    const x = fakeExec(p, e);
    await inSiteExecuteVehicle(x.ctx); await inSiteExecute(x.ctx);
    const cr = x.made('changeRequests')[0]; const mw = x.made('maintenanceWindows')[0];
    ok(cr && cr.scheduledStart && cr.scheduledEnd && String(cr.rollbackPlan ?? '').length > 20 && cr.plannerPlanId === p.id, 'one change request with a window, backout plan and plan id');
    ok(mw && mw.changeRequestId === cr?.id, 'a maintenance window for the change');
    const devs = x.made('devices');
    ok(devs.length === 2 && devs.every(d => d.plannerPlanId === p.id && d.rackId === acc.cand.rack.id && Number(d.position) >= acc.startU! && Number(d.position) <= acc.endU!), 'planned devices inside the reserved block, with the plan id');
    ok(x.made('cables').length > 0 && x.made('cables').every(c => c.status === 'Planned'), 'planned patch cables to the reserved leaf ports');
    ok(x.made('ipAddresses').length === a.ip.addresses.length && a.ip.addresses.length > 0, 'addresses reserved in the hall subnets');
    ok((x.ctx.artefacts.plannedDeviceIds ?? []).length === 2 && (x.ctx.artefacts.changeRequestIds ?? []).length === 1, 'artefacts list what was created');
    const closeout = inSiteCloseout({ ...p, artefacts: x.ctx.artefacts, placement: x.ctx.planPatch.placement }, data);
    ok(closeout.some(c => c.key === 'devices-active' && !c.ok), 'closeout: planned devices are not yet active');
  }
}

section('Pod bigger than the site fails, and says by how much');
{
  const site = siteBaseline(data, fra.id)!;
  const n = Math.ceil((site.headroomItKw + 60) / 10);
  const p = base('pod', { dataCenterId: fra.id, designPowerKw: n * 10, params: { rackCount: n, densityKwPerRack: 10, podLayout: 'Auto', podPower: 'Existing PDUs', coolingType: 'chilled-water', feedType: 'Dual 3-phase 32 A', uplinkGbps: '100', racksPerLeafPair: 16, uplinksPerLeaf: 4, operatorOwnedIt: true } });
  const e = ev(p); const a = A(e);
  ok(a.checks['ins-site-power'].status === 'fail' && /short by/.test(a.checks['ins-site-power'].detail), `site power fails: ${a.checks['ins-site-power'].detail.slice(0, 90)}`);
  ok(!!a.shortfall && a.shortfall.kw > 0, `a linked plan is offered for ${a.shortfall?.kw} kW (${a.shortfall?.what})`);
  ok(e.hardFails > 0, 'the plan has hard fails');
  ok(!buildBom(p, e, benchmarks).lines.some(l => SITE_PLANT_KINDS.includes(l.kind)), 'still no UPS or generator in a pod bill');
}

section('Pod that fits: positions on the grid, feeds, cut-in changes, ATPs');
{
  let done = false;
  for (const dc of data.dataCenters) {
    const p = base('pod', { dataCenterId: dc.id, designPowerKw: 12, params: { rackCount: 4, densityKwPerRack: 3, podLayout: 'Auto', podPower: 'Existing PDUs', coolingType: 'in-row', feedType: 'Dual 3-phase 16 A', uplinkGbps: '100', racksPerLeafPair: 16, uplinksPerLeaf: 2, operatorOwnedIt: false, cageRequired: true } });
    const a0 = A(ev(p)); const opt = a0.pod?.options.find(o => o.fits);
    if (!opt || (a0.site?.headroomItKw ?? 0) < 12) continue;
    const p2 = { ...p, placement: { mode: 'empty-positions' as const, racks: [], positions: opt.positions } };
    const e = ev(p2); const a = A(e);
    ok(a.checks['ins-positions'].status === 'pass', `positions accepted in ${opt.hall.name}: ${a.checks['ins-positions'].detail}`);
    const g = hallGrid(data, a.site, opt.hall.id, p2.id)!; const ys = new Set(opt.positions.map(x => x.gridY));
    ok(ys.size <= 2 && [...ys].every(y => opt.positions.filter(x => x.gridY === y).every((x, i, xs) => i === 0 || x.gridX === xs[i - 1].gridX + 1)), 'contiguous in one row or a facing pair');
    ok(opt.positions.every(x => ['free', 'empty-rack'].includes(g.cells[x.gridY][x.gridX].state)), 'only free positions');
    ok(a.pod!.feedSchedule.length === 4 && a.pod!.feedSchedule.every(f => f.pduA), 'a feed schedule from existing PDUs for every rack');
    ok(a.pod!.cage && a.pod!.cage.perimeterM > 0, `cage sized from the perimeter (${a.pod!.cage?.perimeterM} m)`);
    const x = fakeExec(p2, e); x.ctx.artefacts.projectIds = ['PRJ-SYN'];
    await inSiteExecute(x.ctx);
    ok(x.ctx.artefacts.plannedRackIds?.length === 4, '4 planned racks (empty cabinets reused or new)');
    ok(x.made('powerFeeds').length === 8 && x.made('powerFeeds').every(f => f.status === 'Planned'), 'planned A and B feeds per rack');
    ok(x.made('atps').length === 4 && x.made('atpSteps').length === 16, 'one acceptance test per rack, four steps each');
    ok(x.made('changeRequests').length === a.pod!.cutIns.length && x.made('changeRequests').every(c => c.affectedResourceType === 'PowerChain' && c.plannerPlanId === p2.id && c.scheduledStart), 'one change per live PDU cut-in, scheduled');
    ok([...x.created.values()].flat().every(r => !('plannerPlanId' in r) || r.plannerPlanId === p2.id), 'every record carries the plan id');
    done = true; break;
  }
  ok(done, 'some site can take a 4-rack, 12 kW in-row pod');
}

section('Hall in a partly used hall: only free positions');
{
  const hall = data.halls.filter(h => h.dataCenterId === fra.id).map(h => ({ h, g: hallGrid(data, siteBaseline(data, fra.id), h.id)! })).sort((x, y) => y.g.free - x.g.free)[0];
  const big = base('hall', { dataCenterId: fra.id, designPowerKw: 3000, params: { densityKwPerRack: 12, targetHallId: hall.h.id, hallMode: 'Partly used hall (fill free positions)', operatorOwnedIt: false, uplinkGbps: '100' }, phases: [{ id: 'P1', name: 'All', goLive: new Date(Date.now() + 300 * 864e5).toISOString(), itKw: 3000, racks: 250, halls: 1, status: 'Planned' }] });
  const ab = A(ev(big));
  ok(ab.checks['ins-positions'].status === 'fail' && ab.checks['ins-hall-design'].status === 'fail', `3 MW into ${hall.h.name} fails positions and design (${ab.checks['ins-positions'].detail.slice(0, 60)}…)`);
  const racks = hall.g.free; const kw = racks * 2;
  const fit = base('hall', { ...big, id: 'SYN-hall2', plnId: 'SYN-hall2', designPowerKw: kw, params: { ...big.params, densityKwPerRack: 2 }, phases: [{ ...big.phases[0], itKw: kw, racks }] });
  const e = ev(fit); const af = A(e);
  ok(af.hall!.positions.length === racks && af.hall!.positions.every(x => ['free', 'empty-rack'].includes(hall.g.cells[x.gridY][x.gridX].state)), `${racks} racks on the ${hall.g.free} free positions only`);
  ok(af.checks['ins-positions'].status === 'pass', 'positions pass when sized to the hall');
  ok(!buildBom(fit, e, benchmarks).lines.some(l => /White space fit-out|Suppression|Very early smoke/.test(l.item)), 'no shell fit-out in a partly used hall');
  ok(af.hall!.zone ? af.hall!.zoneSharedWith.length === (af.hall!.zone.hallIds.length - 1) : true, 'zone shared with other halls is reported');
  const sum = classesFromMix(500, 40, { gpuPct: 20, computePct: 60, storagePct: 20, densityKwPerRack: 12, tenancy: 'single', growthPctPerYear: 0 });
  ok(sum.reduce((s, c) => s + c.racks, 0) === 40 && Math.abs(sum.reduce((s, c) => s + c.racks * c.kw, 0) - 500) < 1, 'rack classes add up to the racks and the kW');
  const x = fakeExec(fit, e); x.ctx.artefacts.projectIds = ['PRJ-SYN'];
  await inSiteExecute(x.ctx);
  ok(x.ctx.artefacts.plannedRackIds?.length === racks, 'planned racks at the grid positions');
  ok(x.made('atps').length === 5, 'one acceptance test per commissioning level');
  ok(x.made('milestones').length === fit.phases.length, 'one milestone per phase');
  ok(x.updated.some(u => u.entity === 'halls' && u.patch.status === 'Fitting'), 'hall set to Fitting');
}

section('New hall on a floor without room points to an expansion');
{
  const floor = data.floors.find(f => data.buildings.find(b => b.id === f.buildingId)?.dataCenterId === fra.id)!;
  const p = base('hall', { dataCenterId: fra.id, designPowerKw: 2000, params: { densityKwPerRack: 12, hallMode: 'New hall on a floor' }, inSite: { newHall: { floorId: floor.id, name: 'Hall X', areaSqm: 99999, positions: 400, designKw: 2000 } } });
  const a = A(ev(p));
  ok(a.checks['ins-positions'].status === 'fail' && a.shortfall?.expansion === true, `does not fit the floor; expansion offered (${a.checks['ins-positions'].detail.slice(0, 70)}…)`);
}

section('Retrofit whose residual heat exceeds the zone fails');
{
  const hall = data.halls.find(h => h.dataCenterId === fra.id)!;
  // The zone was re-rated by the estate realism pass (agent G) and now has about 395 kW free, so the case needs
  // enough converted racks for the residual air heat (50% capture) to exceed it: up to 16 racks at 80 kW.
  const racks = data.racks.filter(r => r.hallId === hall.id && r.status === 'Active').slice(0, 16);
  const p = base('retrofit', { dataCenterId: fra.id, designPowerKw: racks.length * 80, inSite: { retrofit: racks.map(r => ({ rackId: r.id, targetKw: 80 })) }, params: { targetHallId: hall.id, liquidCapturePct: 50, cduType: 'Facility', coolingType: 'liquid-to-chip', densityKwPerRack: 60, commissioningLevel: '5', inletSetpointC: 24, operatorOwnedIt: false } });
  const e = ev(p); const a = A(e);
  ok(a.checks['ins-zone-cooling'].status === 'fail', `residual air fails: ${a.checks['ins-zone-cooling'].detail.slice(0, 100)}`);
  ok(a.retrofit!.liquidKw === racks.length * 80 * 0.5, `liquid kW = ${racks.length * 80} × 50% (got ${a.retrofit!.liquidKw})`);
  ok(e.findings.find(f => f.rule.check === 'commissioning-level')?.status === 'pass', 'level 5 commissioning required and planned for liquid');
  const waves = a.retrofit!.waves;
  const p2 = { ...p, waves };
  const e2 = ev(p2); const a2 = A(e2);
  ok(!a2.retrofit!.wavesProposed, 'accepted waves are the plan\'s own');
  const x = fakeExec(p2, e2); x.ctx.artefacts.projectIds = ['PRJ-SYN'];
  await inSiteExecute(x.ctx);
  ok(x.made('changeRequests').length === waves.length && x.made('changeRequests').every(c => c.plannerWaveId && c.rollbackPlan), 'one change per wave with its rollback');
  ok((x.ctx.planPatch.waves ?? []).every(w => w.changeRequestId && w.maintenanceWindowId && w.status === 'Scheduled'), 'waves carry their change and window');
  ok(x.made('atps').some(t => t.level === 'L5 IST'), 'level 5 acceptance test for the liquid loops');
}

section('Not checked while data loads');
{
  const p = plan('PLN-0004'); const e = evaluate(p, null, templates, benchmarks);
  ok(e.findings.filter(f => f.rule.id.startsWith('R-INS')).every(f => f.status === 'n/a' && /loading/.test(f.detail)), 'no vacuous pass without platform data');
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

/* ------------------------------------------------------------------ recording execution context */
function fakeExec(p: T.PlannerPlan, e: Evaluation) {
  const created = new Map<string, Record<string, unknown>[]>(); const updated: { entity: string; id: string; patch: Record<string, unknown> }[] = [];
  let n = 0;
  const all = (entity: string) => [...(((data as unknown as Record<string, { id: string }[]>)[entity]) ?? []), ...(created.get(entity) ?? []) as { id: string }[]];
  const ctx: ExecCtx = {
    plan: p, ev: e, bom: buildBom(p, e, benchmarks), data, actor: 'Smoke', template: templates.find(t => t.id === p.templateId),
    meta: () => ({}), id: prefix => `${prefix}-SYN${++n}`,
    seq: (entity, prefix) => { const re = new RegExp(`^${prefix}-(\\d+)$`); const max = all(entity).reduce((m, r) => { const x = re.exec(r.id); return x ? Math.max(m, Number(x[1])) : m; }, 0); return `${prefix}-${String(max + 1).padStart(4, '0')}`; },
    create(entity, rec) { const id = String(rec.id ?? `${entity}-${++n}`); created.set(entity, [...(created.get(entity) ?? []), { ...rec, id }]); return id; },
    update(entity, id, patch) { updated.push({ entity, id, patch }); },
    async step(_k, fn) { await fn(); },
    artefacts: { createdAt: new Date().toISOString(), vehicle: 'project', purchaseOrderIds: [], subnetIds: [], vlanIds: [], permitIds: [], designDocIds: [] },
    planPatch: {}, warn: () => undefined,
    startProcess: async () => ({ id: 'PI-SYN' }), createProgramFromBlueprint: async () => ({ programId: 'PRG-SYN' }), createProgram: async () => 'PRG-SYN', createProject: async () => 'PRJ-SYN',
  };
  return { ctx, created, updated, made: (entity: string) => created.get(entity) ?? [] };
}
