/* Engine core smoke test (agent B): physics, rack classes, one IT price, finance, per-phase schedule,
   stock-aware lead times, purchase-order based lateness and no vacuous rule passes.
   Run: npx tsx scripts/planner-engine-smoke.mts   (exits non-zero on any failed assertion) */
import { buildSnapshot } from '../src/mock/db/seed';
import { evaluate, schedule as runSchedule, fmtUsd, type Evaluation } from '../src/modules/planner/lib/engine';
import { buildBom } from '../src/modules/planner/lib/outputs';
import { sourceBom } from '../src/modules/planner/lib/sourcing';
import { CATALOGUE, CATALOGUE_VENDORS } from '../src/modules/planner/lib/catalogue';
import { cashflowFor, irr, paybackFromBenefit } from '../src/modules/planner/lib/finance';
import { plannerDataFromSnapshot, type PlannerData } from '../src/modules/planner/lib/plannerData';
import type * as T from '../src/mock/data/types';

const snap = buildSnapshot('small') as unknown as Record<string, unknown[]>;
const data = plannerDataFromSnapshot(snap);
const templates = snap.plannerTemplates as unknown as T.PlannerTemplate[];
const benchmarks = snap.plannerBenchmarks as unknown as T.PlannerBenchmark[];
let failures = 0, passes = 0;
const ok = (cond: unknown, msg: string) => { if (cond) { passes++; } else { failures++; console.log(`  FAIL ${msg}`); } };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const plan = (id: string) => { const p = data.plannerPlans.find(x => x.plnId === id); if (!p) throw new Error(`missing ${id}`); return p; };
const ev = (p: T.PlannerPlan, scenario?: T.PlannerScenario | null, d: PlannerData = data) => evaluate(p, scenario ?? null, templates, benchmarks, undefined, d);
const finding = (e: Evaluation, check: string) => e.findings.find(f => f.rule.check === check);
const sctx = (d: PlannerData) => ({ devices: d.devices, vendors: d.vendors, contracts: d.contracts, assetModels: d.assetModels, racks: d.racks, upsUnits: d.upsUnits, coolingZones: d.coolingZones, dataCenters: d.dataCenters, data: d });
const days = (n: number) => new Date(Date.now() + n * 864e5).toISOString();

/* ── 1. FRA 50 MW new-dc: facility load, 2N feeds per side, plant at redundancy ── */
console.log('FRA 50 MW new data centre (PLN-0001)');
const fra = plan('PLN-0001'); const fe = ev(fra);
const fac = fe.sizing.facility!;
ok(fac && near(fac.facilityKw, 50000 * (fe.sizing.pue.value + 0.05), 2), `facility kW = IT × (PUE + 0.05): ${fac?.facilityKw}`);
ok(fac && near(fac.mva, (fac.facilityKw / 0.95) / 1000, 0.15), `MVA at 0.95 pf: ${fac?.mva}`);
const feeds = fe.sizing.plant.filter(x => x.kind === 'feed');
const perSideMva = (feeds[0]?.unitKva ?? 0) / 1000;
const r1 = finding(fe, 'feeds-cover-load');
ok(feeds.length === 2, `2N has two supply paths (${feeds.length})`);
ok(perSideMva >= fac.mva ? r1?.status === 'pass' : r1?.status === 'fail', `2N: each side ${perSideMva} MVA vs facility ${fac.mva} MVA → R-PWR-01 ${r1?.status}`);
// With a sufficient grid offer the same plan passes.
const fraOffer = ev({ ...fra, params: { ...fra.params, gridOfferMva: 80 }, paramSources: { ...fra.paramSources, gridOfferMva: 'user' } });
ok(finding(fraOffer, 'feeds-cover-load')?.status === 'pass', `grid offer 80 MVA per path passes R-PWR-01 (${finding(fraOffer, 'feeds-cover-load')?.detail})`);
const ups = fe.sizing.power!.find(s => s.key === 'ups')!; const tx = fe.sizing.power!.find(s => s.key === 'transformer')!; const gen = fe.sizing.power!.find(s => s.key === 'generator')!;
ok(ups.usableKw >= 50000 && ups.ok, `2N UPS: one side ${ups.usableKw} kW carries the whole 50 MW critical load`);
const upsItem = fe.sizing.plant.find(x => x.kind === 'ups')!;
ok(upsItem.count === fe.sizing.halls * 2 * (upsItem.perPath ?? 0), `UPS modules per hall per side: ${upsItem.count} = ${fe.sizing.halls} halls × 2 sides × ${upsItem.perPath}`);
const txItem = fe.sizing.plant.find(x => x.kind === 'transformer')!;
ok(txItem.count === 2 * Math.ceil(fac.kva / (txItem.unitKva ?? 2500)), `2N transformers = 2 × ceil(kVA ÷ unit): ${txItem.count}`);
ok(tx.ok, `transformers carry the facility load with one side lost (${tx.usableKw} ≥ ${tx.needKw})`);
ok(gen.ok && gen.needKw === fac.facilityKw, `generators sized on facility load (${gen.needKw} kW), N+1 usable ${gen.usableKw} kW`);
ok(fe.sizing.plant.some(x => x.kind === 'substation'), '132 kV intake adds an HV substation');
ok(fe.schedule.some(s => /HV substation/.test(s.item) && s.leadWeeks >= 78), 'HV substation is a long-lead item (18 to 36 months)');
// N+1 transformer count is ceil(load/unit) + 1, not doubled.
const n1 = ev({ ...fra, params: { ...fra.params, redundancy: 'N+1', tier: 'Tier III' } });
const n1tx = n1.sizing.plant.find(x => x.kind === 'transformer')!;
ok(n1tx.count === Math.ceil(n1.sizing.facility!.kva / (n1tx.unitKva ?? 2500)) + 1, `N+1 transformers = ceil + 1 (${n1tx.count})`);

/* ── 2. Rack classes add up; liquid capture; density scenario ── */
console.log('Rack classes and cooling');
for (const p of data.plannerPlans) {
  const e = ev(p); const s = e.sizing;
  if (!s.rackClasses.length || ['server-refresh', 'network-refresh', 'rack-replace'].includes(p.scope)) continue;
  const racks = s.rackClasses.reduce((a, c) => a + c.racks, 0); const kw = s.rackClasses.reduce((a, c) => a + c.racks * c.kw, 0);
  ok(racks === s.racks, `${p.plnId}: Σ class racks ${racks} = racks ${s.racks}`);
  ok(near(kw, s.itKw, Math.max(1, s.itKw * 0.005)), `${p.plnId}: Σ racks × kW ${Math.round(kw)} = IT ${s.itKw}`);
}
const gpu = fe.sizing.rackClasses.find(c => c.name === 'GPU')!;
ok(gpu.liquid && gpu.capturePct === 75, `FRA GPU class is liquid with 75% capture (${gpu.kw} kW)`);
ok(fe.sizing.cooling.airKw > 0 && fe.sizing.cooling.air.units > 0, `residual air units for the heat liquid does not take (${fe.sizing.cooling.airKw} kW, ${fe.sizing.cooling.air.units} units)`);
ok(fe.sizing.cooling.heatRejection.streams.length >= 1, `heat rejection chosen by loop and climate: ${fe.sizing.cooling.heatRejection.streams.map(x => `${x.label} → ${x.method}`).join('; ')}`);
const airEco = ev({ ...fra, params: { ...fra.params, coolingType: 'air-economiser', densityKwPerRack: 20 } });
ok((airEco.sizing.cooling.heatRejection.chillers?.units ?? 0) > 0, 'air-economiser site still gets trim chillers');
ok(finding(airEco, 'liquid-above-density')?.status === 'fail' || airEco.sizing.rackClasses.every(c => c.kw <= 30), `liquid rule per class: ${finding(airEco, 'liquid-above-density')?.detail}`);
// A scenario that lowers the density raises racks; IT CapEx follows servers (power), not racks.
const scenC = (snap.plannerScenarios as unknown as T.PlannerScenario[]).find(s => s.planId === fra.id && /Air-cooled/.test(s.name));
if (scenC) {
  const ce = ev(fra, scenC);
  ok(ce.sizing.racks > fe.sizing.racks, `lower density → more racks (${fe.sizing.racks} → ${ce.sizing.racks})`);
  const itA = fe.estimate.it?.total ?? 0, itC = ce.estimate.it?.total ?? 0;
  ok(itC < itA * 1.25, `IT CapEx does not double with more racks (${fmtUsd(itA)} → ${fmtUsd(itC)})`);
}
const rd = ev({ ...plan('PLN-0002'), params: { ...plan('PLN-0002').params, coolingType: 'rear-door' } });
ok(rd.sizing.cooling.air.kind === 'reardoor' && rd.sizing.cooling.air.units === rd.sizing.racks, `rear-door count = one per rack (${rd.sizing.cooling.air.units} for ${rd.sizing.racks})`);

/* ── 3. One IT price in the estimate, the bill and sourcing ── */
console.log('IT quantity and price model');
for (const id of ['PLN-0001', 'PLN-0002', 'PLN-0005']) {
  const p = plan(id); const e = ev(p);
  if (!e.estimate.it) { ok(false, `${id}: estimate has IT quantities`); continue; }
  const sb = sourceBom(p, e, buildBom(p, e, benchmarks), sctx(data));
  for (const l of e.estimate.it.lines) {
    const sl = sb.lines.filter(x => x.kind === l.kind && (x.model === l.model));
    const units = sl.reduce((a, x) => a + x.qty, 0); const value = sl.reduce((a, x) => a + x.total, 0);
    ok(sl.length > 0 && sl.every(x => x.unitCost === l.unitPrice), `${id} ${l.className}: sourcing prices ${l.model} at the estimate's ${l.unitPrice} USD`);
    ok(units === l.units && value === l.total, `${id} ${l.className}: ${units} units ${fmtUsd(value)} in sourcing = ${l.units} units ${fmtUsd(l.total)} in the estimate`);
  }
}

/* ── 4. Finance: cash flow, NPV, IRR, payback with owned IT ── */
console.log('Finance');
ok(Array.isArray(fe.estimate.cashflow) && fe.estimate.cashflow.length >= 15, `FRA cash flow by year (${fe.estimate.cashflow?.length} years)`);
ok(typeof fe.estimate.npvUsd === 'number' && fe.estimate.discountPct !== undefined, `NPV ${fmtUsd(fe.estimate.npvUsd ?? 0)} at ${fe.estimate.discountPct}%`);
ok(fe.estimate.irrPct === null || typeof fe.estimate.irrPct === 'number', `IRR present (${fe.estimate.irrPct})`);
ok((fe.estimate.depreciationAnnual ?? 0) > 0, `depreciation by asset class (${fmtUsd(fe.estimate.depreciationAnnual ?? 0)} a year)`);
const capexInFlow = (fe.estimate.cashflow ?? []).reduce((a, y) => a + y.capex, 0);
ok(capexInFlow >= fe.estimate.capexTotal * 0.98, `cash flow carries all CapEx incl. owned IT (${fmtUsd(capexInFlow)} ≥ ${fmtUsd(fe.estimate.capexTotal)})`);
// Payback with owned IT is later than (or absent compared with) the same plan when tenants own the IT.
const tenantIt = ev({ ...fra, params: { ...fra.params, operatorOwnedIt: false } });
ok(!tenantIt.estimate.it && fe.estimate.it, 'IT is in the estimate only when the operator owns it');
const pbOwn = fe.estimate.paybackMonths ?? Infinity, pbTenant = tenantIt.estimate.paybackMonths ?? Infinity;
ok(pbOwn > pbTenant, `payback includes owned IT: ${fe.estimate.paybackMonths ?? 'none'} months owned vs ${tenantIt.estimate.paybackMonths ?? 'none'} months tenant-owned`);
ok(fe.estimate.capex.some(l => /shell/i.test(l.item)) && !fe.estimate.capex.some(l => /Land and shell/.test(l.item)), 'shell is its own line; no 17% "land and shell" share');
ok(fe.estimate.capex.some(l => l.item === 'Contingency') && (fe.estimate.contingencyUsd ?? 0) > 0, 'contingency is its own line');
ok(tenantIt.estimate.energyRecoveredAnnual === 0, 'no energy recovered on a single-tenant plan');
const multi = ev({ ...fra, demand: { ...fra.demand, tenancy: 'multi' }, params: { ...fra.params, operatorOwnedIt: false } });
ok(multi.estimate.energyRecoveredAnnual > 0, 'energy recovered from tenants on a multi-tenant plan');
ok(fe.sizing.network.dciGbps < 2000, `WAN from the workload, not 200 Tbps (${fe.sizing.network.dciGbps} Gbps)`);
const flow = cashflowFor({ startMs: Date.now(), horizonYears: 10, discountPct: 8, taxRatePct: 25, capex: [{ label: 'x', amount: 1_000_000, assetClass: 'mep', inServiceMs: Date.now(), lifeYears: 10 }], benefits: [{ label: 'saving', annual: 300_000, fromMs: Date.now() }] });
ok(flow.irrPct !== null && flow.irrPct > 8 && flow.npvUsd > 0, `finance helper: profitable case has IRR ${flow.irrPct}% and NPV ${fmtUsd(flow.npvUsd)}`);
ok(paybackFromBenefit(1_200_000, 400_000) === 36 && paybackFromBenefit(1, 0) === null, 'paybackFromBenefit');
ok(irr([-100, 60, 60]) !== null, 'irr()');

/* ── 5. Schedule: per phase, buffers, stock, purchase orders ── */
console.log('Schedule');
const fraPhases = new Set(fe.schedule.filter(s => s.kind === 'equipment').map(s => s.phaseId));
ok(fra.phases.every(ph => fraPhases.has(ph.id)), `FRA long-lead items for every phase (${fraPhases.size} of ${fra.phases.length})`);
ok(fe.schedule.filter(s => s.kind === 'equipment' && s.source !== 'stock').every(s => s.bufferWeeks !== undefined), 'contingency is a separate buffer');
const txLead = fe.schedule.find(s => s.item === 'Transformers')!; const txBm = benchmarks.find(b => b.metric === 'leadWeeks:Transformer (33 kV)')!;
ok(txLead.leadWeeks === txBm.high, `schedule lead time = benchmark high, the BOM figure (${txLead.leadWeeks} = ${txBm.high})`);
// Stock-sourced items are not late: a refresh of 6 R760s, all in stock, needed 6 weeks from now.
const r760Stock = data.devices.filter(d => d.model === 'PowerEdge R760' && !d.rackId && (d.lifecycleState === 'Staged' || d.lifecycleState === 'Received')).length;
const refresh: T.PlannerPlan = { ...plan('PLN-0013'), id: 'SMK-REFRESH', plnId: 'SMK-REFRESH', status: 'Draft', targetGoLive: days(42), phases: [{ id: 'W1', name: 'Wave 1', goLive: days(42), itKw: 5, racks: 1, halls: 0, status: 'Planned' }], params: { ...plan('PLN-0013').params, replacementModel: 'PowerEdge R760', affectedCount: 12, consolidationRatio: 2 } };
const refreshSched = runSchedule(refresh, ev(refresh).sizing, benchmarks, ev(refresh).params, { data });
const srv = refreshSched.find(s => /Servers/.test(s.item));
ok(r760Stock >= 6 && srv?.source === 'stock' && !srv.late, `refresh units from stock need a transfer only and are not late (${srv?.source}, ${srv?.leadWeeks} wk, late=${srv?.late})`);
// After approval, lateness comes from purchase orders, not plan status.
const approved: T.PlannerPlan = { ...plan('PLN-0005'), id: 'SMK-APPROVED', plnId: 'SMK-APPROVED', status: 'Approved' };
const apSched = runSchedule(approved, ev(approved).sizing, benchmarks, ev(approved).params, { data });
ok(apSched.filter(s => s.kind === 'equipment' && s.source !== 'stock' && new Date(s.orderBy).getTime() < Date.now()).every(s => s.late), 'approved plan without purchase orders: past order-by dates are late');
const vendorId = (name: string) => data.vendors.find(v => v.name === name)?.id;
const withPo: PlannerData = { ...data, purchaseOrders: [...data.purchaseOrders, { id: 'PO-SMK1', poId: 'PO-SMK1', plannerPlanId: 'SMK-APPROVED', vendorId: vendorId('Vertiv'), status: 'Ordered', plannedCost: 1, approvedBudget: 1, actualSpend: 0, forecastVariance: 0 } as T.PurchaseOrder, { id: 'PO-SMK2', poId: 'PO-SMK2', plannerPlanId: 'SMK-APPROVED', vendorId: vendorId('Arista Networks'), status: 'Draft', orderBy: days(-10), plannedCost: 1, approvedBudget: 1, actualSpend: 0, forecastVariance: 0 } as T.PurchaseOrder] };
const poSched = runSchedule(approved, ev(approved, null, withPo).sizing, benchmarks, ev(approved, null, withPo).params, { data: withPo });
ok(poSched.filter(s => s.poId === 'PO-SMK1').every(s => !s.late && s.status === 'ordered') && poSched.some(s => s.poId === 'PO-SMK1'), 'items under an ordered PO are not late');
ok(poSched.filter(s => s.poId === 'PO-SMK2').every(s => s.late) && poSched.some(s => s.poId === 'PO-SMK2'), 'items under a draft PO past its order-by date are late');

/* ── 6. No vacuous passes ── */
console.log('Rules');
const noPhases = ev({ ...fra, id: 'SMK-NOPH', phases: [] });
ok(finding(noPhases, 'lead-times')?.status === 'fail', `new-dc with no dated phase fails R-SCH-01 (${finding(noPhases, 'lead-times')?.detail})`);
ok(finding(fe, 'reporting-enabled')?.status !== 'pass', `reporting-enabled is not a blind pass (${finding(fe, 'reporting-enabled')?.status})`);
ok(finding(fe, 'civil-before-fitout')?.status === 'n/a', 'civil-before-fitout is not checked before the programme exists');
const cl = finding(fe, 'commissioning-level'); ok(!cl || /Declared|test plan/.test(cl.detail), `commissioning-level says declared (${cl?.detail})`);
const net = ev(plan('PLN-0009')); const netLead = finding(net, 'lead-times');
ok(!netLead || netLead.status !== 'pass' || net.schedule.some(s => s.kind !== 'gate'), 'lead-times does not pass with nothing to check');
const fresh = ev({ ...fra, id: 'SMK-FRESH', params: {}, paramSources: {} });
const freshSpace = fresh.aspects.find(a => a.aspect === 'space');
ok(freshSpace !== undefined && freshSpace.answered === 0 && (freshSpace.defaults ?? 0) > 0, `untouched template defaults are not counted as answered (space ${freshSpace?.answered}/${freshSpace?.total}, ${freshSpace?.defaults} defaults)`);

/* ── 7. Ladder, building, scenarios on phases, reconciliation ── */
console.log('Ladder, building, scenarios, reconciliation');
ok(fe.ladder.every(r => r.headrooms && r.committedBasis), 'ladder rows carry headroom per dimension and the committed basis');
ok(fe.ladder.some(r => r.bindingConstraint === 'grid'), `grid binds where the intake is short (${fe.ladder.map(r => r.bindingConstraint).join(', ')})`);
const hallLadder = ev(plan('PLN-0002')).ladder[0];
ok(/live draw/.test(hallLadder?.committedBasis ?? ''), `existing site committed load from data (${hallLadder?.committedBasis})`);
ok(fe.sizing.grossAreaM2 > fe.sizing.whiteSpaceM2 * 2.4 && (fe.sizing.building.plantM2 ?? 0) > 0, `gross area includes plant rooms per MW (${fe.sizing.grossAreaM2} m²)`);
ok((fe.sizing.phaseDesign ?? []).length === fra.phases.length && fe.sizing.halls === (fe.sizing.phaseDesign ?? []).reduce((a, x) => a + x.halls, 0), `phase halls from the same model (${fe.sizing.halls})`);
const phaseScenario = { id: 'SMK-SCN', scnId: 'SMK-SCN', planId: fra.id, name: 'Air first hall', description: '', overrides: {}, preferred: false, phaseOverrides: fra.phases.map((ph, i) => (i === 0 ? { ...ph, params: { densityKwPerRack: 25, coolingType: 'rear-door' } } : ph)) } as unknown as T.PlannerScenario;
const ps = ev(fra, phaseScenario);
ok(ps.sizing.phaseDesign![0].density === 25 && ps.sizing.phaseDesign![1].density === 48, 'scenario phase overrides change one phase only');
ok(ps.sizing.racks > fe.sizing.racks, `phase density override raises racks (${fe.sizing.racks} → ${ps.sizing.racks})`);
ok(fe.reconciliation !== undefined && typeof fe.reconciliation.gapPct === 'number', `reconciliation of bill + uncosted + contingency vs estimate (${fe.reconciliation?.gapPct}%)`);
const recRule = finding(fe, 'bom-reconciliation');
ok(recRule && (Math.abs(fe.reconciliation!.gapPct) > 15 ? recRule.status === 'warn' : recRule.status === 'pass'), `soft rule above 15% gap (${recRule?.status})`);

/* ── 8. Sourcing: contracts, POs per vendor × phase, agreements, stock holds ── */
console.log('Sourcing');
const fsb = sourceBom(fra, fe, buildBom(fra, fe, benchmarks), sctx(data));
const supportUsed = fsb.vendors.filter(v => v.contractId && ['Support', 'SLA', 'Warranty'].includes(data.contracts.find(c => c.id === v.contractId)?.type ?? ''));
ok(supportUsed.length === 0, 'never buys under a support, SLA or warranty contract');
ok(fsb.vendors.every(v => !!v.phaseId && !!v.needBy && !!v.orderBy), 'purchase orders per vendor × phase with need-by and order-by');
ok(new Set(fsb.vendors.map(v => v.phaseId)).size === fra.phases.length, `orders cover each phase (${new Set(fsb.vendors.map(v => v.phaseId)).size})`);
ok(!fsb.vendors.some(v => /utility|network operator/i.test(v.vendorName)), 'grid connection is not a purchase order');
ok(fsb.lines.every(l => l.allocations.filter(a => a.source === 'stock').every(a => !!a.holdFrom && a.deferred !== undefined)), 'stock allocations carry a hold date');
ok(fsb.lines.some(l => l.allocations.some(a => a.source === 'stock' && a.deferred)), 'FRA stock needed years ahead is a planned hold, not held now');
ok(fsb.stockDeviceIds.every(id => !(fsb.plannedHoldDeviceIds ?? []).includes(id)), 'stock is held now only within the hold window; later needs are planned holds');
const optics = CATALOGUE.optics.options.map(o => o.vendor), dci = CATALOGUE.dci.options.map(o => o.vendor);
ok(!optics.includes('Corning') && !dci.includes('Corning') && CATALOGUE.oob.options[0].vendor === 'Opengear' && CATALOGUE.storage.options.every(o => o.vendor === o.manufacturer), 'catalogue vendors are credible');
console.log(`  vendors used by the catalogue: ${CATALOGUE_VENDORS.join(', ')}`);

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
