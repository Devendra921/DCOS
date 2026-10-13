/* Smoke test with assertions for the replace and migration families (server refresh, network
   refresh, rack replacement, migration/decommission). Exits non-zero on any failure.
   Run: npx tsx scripts/planner-replace-migration-smoke.mts */
import { db, dbReady } from '../src/mock/db';
import type * as T from '../src/mock/data/types';
import { evaluate, type Evaluation } from '../src/modules/planner/lib/engine';
import { buildBom } from '../src/modules/planner/lib/outputs';
import { PLANNER_DATA_KEYS, type PlannerData } from '../src/modules/planner/lib/plannerData';
import { runExecution, nextId } from '../src/modules/planner/lib/execute';
import { replaceOf } from '../src/modules/planner/lib/replaceAnalysis';
import { proposeReplaceWaves } from '../src/modules/planner/lib/replaceWaves';
import { closeWave, replaceCloseout } from '../src/modules/planner/lib/replaceClose';
import { PARALLEL } from '../src/modules/planner/lib/replaceText';
import { closeMigrationWave, migrationCloseout, migrationOf, proposeMigrationWaves, retireSite } from '../src/modules/planner/lib/migrationCore';
import { blockers } from '../src/modules/planner/components/wizard/wizardModel';

await dbReady;
const fails: string[] = []; let passes = 0;
const ok = (cond: unknown, msg: string) => { if (cond) passes++; else { fails.push(msg); console.log(`  FAIL ${msg}`); } };
const section = (s: string) => console.log(`\n· ${s}`);
const load = (): PlannerData => { const out = { ready: true } as Record<string, unknown>; for (const k of [...PLANNER_DATA_KEYS, 'componentTemplates', 'deviceTypes']) out[k] = (db.getAll(k, { pageSize: 200000 }).data as { isDeleted?: boolean }[]).filter(r => !r.isDeleted); return out as unknown as PlannerData; };
let data = load();
const templates = db.getAll('plannerTemplates', { pageSize: 5000 }).data as unknown as T.PlannerTemplate[];
const benchmarks = db.getAll('plannerBenchmarks', { pageSize: 5000 }).data as unknown as T.PlannerBenchmark[];
const ev = (p: T.PlannerPlan): Evaluation => evaluate(p, null, templates, benchmarks, undefined, data);
const plan = (pln: string) => data.plannerPlans.find(p => p.plnId === pln)!;
const finding = (e: Evaluation, id: string) => e.findings.find(f => f.rule.id === id);
const clone = (p: T.PlannerPlan, patch: Partial<T.PlannerPlan>): T.PlannerPlan => ({ ...structuredClone(p), id: `${p.id}-T`, plnId: `${p.plnId}-T`, ...patch });
const NOT_HERE = ['R-PWR-01', 'R-PWR-02', 'R-COOL-01', 'R-SPC-01', 'R-NET-01'];

/* ------------------------------------------------------------------ seeded plans */
section('Seeded plans');
for (const id of ['PLN-0013', 'PLN-0014', 'PLN-0015', 'PLN-0006']) {
  const p = plan(id); const e = ev(p); const bom = buildBom(p, e, benchmarks);
  ok(e.sizing.plant.length === 0 && e.sizing.network.leaves === 0, `${id}: no site plant or fabric sized`);
  ok(!e.findings.some(f => NOT_HERE.includes(f.rule.id)), `${id}: plant and fabric rules dropped`);
  ok(!bom.lines.some(l => ['transformer', 'generator', 'crah', 'ups'].includes(l.kind)), `${id}: no plant lines in the bill`);
  ok(e.estimate.basis === 'bottom-up', `${id}: estimate is bottom-up`);
  ok(Math.abs(e.estimate.capexTotal - (bom.total + (e.estimate.contingencyUsd ?? 0) - (e.estimate.capex.find(l => /Resale/.test(l.item)) ? -e.estimate.capex.find(l => /Resale/.test(l.item))!.amount : 0))) <= bom.lines.length + 1, `${id}: estimate equals the bill plus contingency (${e.estimate.capexTotal} vs ${bom.total})`);
  ok((p.waves ?? []).length > 0, `${id}: has waves`);
  ok(Math.abs(p.phases.reduce((a, x) => a + x.itKw, 0) - p.designPowerKw) < 1, `${id}: phases mirror the waves and sum to the plan's kW`);
  console.log(`  ${id} ${p.status}: hard fails ${e.hardFails}, warns ${e.softWarns}, capex ${e.estimate.capexTotal}, payback ${e.estimate.paybackMonths ?? '—'}`);
}
{ const p = plan('PLN-0013'); const e = ev(p); ok(p.status !== 'In review' || e.hardFails === 0, 'PLN-0013 in review has no hard fail'); }
{ const p = plan('PLN-0006'); ok(p.status === 'Executing', 'PLN-0006 is executing, not completed, while its site is live'); const site = data.dataCenters.find(d => d.id === p.dataCenterId); ok(site?.status !== 'Retired', 'DUB-SR1 still live'); ok(migrationCloseout(p, data).some(c => !c.ok), 'PLN-0006 closure has open items'); ok(ev(p).hardFails === 0, 'PLN-0006 executing without hard fails'); }

/* ------------------------------------------------------------------ HA pairs */
section('Redundant pairs never in one wave');
{
  const p = plan('PLN-0014'); const e = ev(p); const a = replaceOf(e)!;
  ok(a.pairs.length > 0, `network refresh finds pairs (${a.pairs.length})`);
  const waves = proposeReplaceWaves(e.ctx, a);
  for (const pr of a.pairs) { const wa = waves.find(w => w.deviceIds.includes(pr.a)); const wb = waves.find(w => w.deviceIds.includes(pr.b)); ok(wa && wb && wa.id !== wb.id, `pair ${pr.a}/${pr.b} split across waves`); if (wa && wb) ok(Math.abs(new Date(wb.windowStart).getTime() - new Date(wa.windowStart).getTime()) >= a.soakDays * 864e5 - 3600e3, `pair ${pr.a}/${pr.b} separated by the soak`); }
  ok(waves.every(w => w.deviceIds.length <= a.rate * a.windowHours), 'each proposed wave fits the crew in one window');
  ok(waves[0]?.kind === 'pilot', 'first wave is a pilot');
  const bad = clone(p, { waves: [{ ...waves[0], id: 'W-X', deviceIds: [a.pairs[0].a, a.pairs[0].b], status: 'Planned' }, ...waves.map(w => ({ ...w, deviceIds: w.deviceIds.filter(d => d !== a.pairs[0].a && d !== a.pairs[0].b) }))] });
  ok(finding(ev(bad), 'R-RPL-06')?.status === 'fail', 'a wave holding both halves of a pair fails R-RPL-06');
  ok(finding(ev(clone(p, { waves })), 'R-RPL-06')?.status === 'pass', 'proposed waves pass R-RPL-06');
}

/* ------------------------------------------------------------------ critical services */
section('Critical service needs a parallel run');
{
  const base = plan('PLN-0013');
  const svc = data.services.find(s => s.critical && s.dataCenterId === base.dataCenterId && s.deviceId && data.devices.find(d => d.id === s.deviceId)?.model === 'PowerEdge R740')!;
  ok(!!svc, 'a critical service runs on an R740 at Ashburn');
  const dev = data.devices.find(d => d.id === svc.deviceId)!;
  const mk = (method: string) => clone(base, { params: { ...base.params, affectedIds: dev.id }, mapping: [], waves: [{ id: 'W-1', name: 'Wave 1', order: 1, kind: 'wave', deviceIds: [dev.id], rackIds: [dev.rackId!], serviceIds: [svc.id], method, windowStart: new Date(Date.now() + 30 * 864e5).toISOString(), windowEnd: new Date(Date.now() + 30 * 864e5 + 6 * 3600e3).toISOString(), rollback: 'Re-rack the old server', acceptance: 'Owners sign off', status: 'Planned' }] });
  ok(finding(ev(mk('Rolling, rack by rack')), 'R-RPL-05')?.status === 'fail', 'critical service without a parallel run fails R-RPL-05');
  ok(finding(ev(mk(PARALLEL)), 'R-RPL-05')?.status === 'pass', 'critical service with a parallel run and rollback passes');
  const a = replaceOf(ev(mk(PARALLEL)))!;
  ok(a.units.every(u => u.parallel), 'units for a critical service are placed for a parallel run (old one keeps its U)');
}

/* ------------------------------------------------------------------ per-rack power */
section('Per-rack power after the swap');
{
  const base = plan('PLN-0013');
  const gpu = clone(base, { mapping: (base.mapping ?? []).map(m => ({ ...m, newModel: 'PowerEdge XE9680', ratio: 1 })) });
  const e = ev(gpu); const a = replaceOf(e)!;
  ok(a.newKw > 100, `XE9680 load is units × typical (${a.newKw} kW), not 70% of the old`);
  ok(a.units.some(u => !u.placed) && finding(e, 'R-RPL-04')?.status === 'fail', 'GPU servers that no rack can power have no position and fail R-RPL-04');
  const nr = ev(plan('PLN-0014'));
  ok(replaceOf(nr)!.rackRows.length > 0, 'network refresh checks every rack touched');
  ok(['fail', 'warn', 'pass'].includes(finding(nr, 'R-RPL-03')?.status ?? ''), 'R-RPL-03 evaluated for the network refresh');
  const rr = ev(plan('PLN-0015'));
  ok((replaceOf(rr)!.rack?.outlets.length ?? 0) === replaceOf(rr)!.rackIds.length, 'rack replacement has an outlet plan per rack');
  ok(replaceOf(rr)!.old.length > replaceOf(rr)!.rackIds.length * 2, 'rack replacement re-racks every device in the racks');
}

/* ------------------------------------------------------------------ lead times from stock */
section('Stock-sourced servers are not late');
{
  const e = ev(plan('PLN-0013')); const a = replaceOf(e)!;
  ok(a.needs.length > 0 && a.needs.every(n => n.fromStock === n.qty), 'every PLN-0013 unit comes from stock');
  ok(a.needs.every(n => !n.late), 'no stock-sourced need is late');
  ok(finding(e, 'R-SCH-01')?.status === 'pass', 'R-SCH-01 passes for stock-sourced servers');
  const soon = clone(plan('PLN-0013'), { mapping: (plan('PLN-0013').mapping ?? []).map(m => ({ ...m, newModel: 'ProLiant DL380 Gen11' })), waves: (plan('PLN-0013').waves ?? []).map(w => ({ ...w, windowStart: new Date(Date.now() + 5 * 864e5).toISOString(), windowEnd: new Date(Date.now() + 5 * 864e5 + 6 * 3600e3).toISOString() })) });
  const s = replaceOf(ev(soon))!;
  ok(s.needs.some(n => n.toBuy > 0 && n.late), 'bought units needed in five days are late');
}

/* ------------------------------------------------------------------ migration dispositions and consent */
section('Migration: dispositions and consent');
{
  const p = plan('PLN-0006');
  ok(finding(ev(clone(p, { dispositions: [] })), 'R-MIG-01')?.status === 'fail', 'inventory without dispositions fails R-MIG-01');
  ok(finding(ev(clone(p, { dispositions: (p.dispositions ?? []).slice(1) })), 'R-MIG-01')?.status === 'fail', 'one item without a disposition fails R-MIG-01');
  ok(finding(ev(p), 'R-MIG-01')?.status === 'pass', 'complete register passes R-MIG-01');
  const a = migrationOf(ev(p))!;
  ok(a.kwLeaving > 0 && a.kwLeaving < 20, `kW derived from the inventory (${a.kwLeaving} kW), not typed`);
  const w2 = (p.waves ?? []).find(w => w.serviceIds.length)!;
  const victim = (p.consents ?? []).find(c => c.serviceIds.some(s => w2.serviceIds.includes(s)))!;
  const noConsent = clone(p, { consents: (p.consents ?? []).map(c => (c.customerRef === victim.customerRef ? { ...c, status: 'Notified' as const } : c)) });
  ok(finding(ev(noConsent), 'R-MIG-04')?.status === 'fail', 'missing consent fails R-MIG-04');
  ok(closeMigrationWave(noConsent, w2.id, data, { at: new Date().toISOString(), by: 'smoke' }).errors.some(x => /consent/i.test(x)), 'missing consent blocks closing the wave');
  ok(retireSite(p, data, new Date().toISOString()).errors.length > 0, 'the site cannot be retired while checks are open');
  const decom = clone(p, { params: { ...p.params, migrationMode: 'decommission' }, peerDataCenterId: undefined, dispositions: [], designPowerKw: 0 });
  ok(finding(ev(decom), 'R-MIG-03')?.status === 'n/a', 'decommission: no target fit check');
  ok(migrationOf(ev(decom))!.permits.some(x => /F-gas|Battery/.test(x.name)), 'compliance steps come from the plant at the site');
  const fresh = clone(p, { status: 'Draft', waves: [] }); const fe = ev(fresh);
  const proposed = proposeMigrationWaves(fe.ctx, migrationOf(fe)!);
  ok(proposed.length > 0 && proposed[0].kind === 'pilot', 'migration waves proposed with a pilot first');
  const withWaves = clone(p, { status: 'Draft', waves: proposed }); const we = ev(withWaves);
  ok(finding(we, 'R-MIG-10')?.status === 'pass', `proposed migration waves cover every live device and service (${finding(we, 'R-MIG-10')?.detail})`);
  ok(finding(we, 'R-MIG-11')?.status === 'pass' && finding(we, 'R-MIG-12')?.status === 'pass', 'proposed migration waves split pairs and fit the window');
  ok(proposed[proposed.length - 1].circuitIds?.length === migrationOf(fe)!.circuits.length, 'circuits ceased in the last wave');
  const lift = clone(p, { params: { ...p.params, [`approach:${w2.serviceIds[0]}`]: 'Lift and shift', cutoverWindowHours: 2 } });
  ok(finding(ev(lift), 'R-MIG-02')?.status === 'fail', 'lift and shift longer than the window fails R-MIG-02');
}

/* ------------------------------------------------------------------ closing waves */
section('Closing a wave');
{
  const p = clone(plan('PLN-0013'), { status: 'Executing' }); const w = p.waves![0];
  const res = closeWave(p, w.id, data, { at: new Date().toISOString(), by: 'smoke' });
  ok(!res.errors.length, `refresh wave closes (${res.errors.join('; ')})`);
  const upd = (id: string) => res.updates.find(u => u.entity === 'devices' && u.id === id)?.patch;
  ok(w.deviceIds.every(id => upd(id)?.lifecycleState === 'Retired' && upd(id)?.rackId === undefined && !!upd(id)?.decommissionDate), 'old servers retired, out of the rack, decommission date set');
  const actives = [...res.creates.filter(c => c.entity === 'devices').map(c => c.rec), ...res.updates.filter(u => u.entity === 'devices' && u.patch.lifecycleState === 'Active').map(u => u.patch)];
  ok(actives.length > 0 && actives.every(r => r.lifecycleState === 'Active' && r.rackId && r.warrantyContractId), 'new servers active, racked, with a warranty contract');
  ok(res.creates.some(c => c.entity === 'contracts' && c.rec.type === 'Warranty'), 'warranty contract created');
  const cert = res.creates.find(c => c.entity === 'disposalCertificates');
  ok(cert && (cert.rec.items as unknown[]).length === w.deviceIds.length && cert.rec.status === 'Collected', 'disposal certificate with every serial, collected');
  ok(res.plan.waves?.find(x => x.id === w.id)?.status === 'Closed', 'wave marked closed');
  const issued = closeWave(p, w.id, data, { at: new Date().toISOString(), by: 'smoke', certificateRef: 'CBRE-1' });
  ok(w.deviceIds.every(id => issued.updates.find(u => u.entity === 'devices' && u.id === id)?.patch.lifecycleState === 'Disposed'), 'with the vendor certificate the old servers are disposed');
  const atp = data.atps[0]; const gated = clone(p, { waves: p.waves!.map((x, i) => (i === 0 ? { ...x, atpId: atp.id } : x)) });
  if (atp.status !== 'Accepted') ok(closeWave(gated, w.id, data, { at: new Date().toISOString(), by: 'smoke' }).errors.length > 0, 'an unsigned acceptance test blocks the close');
  const rr = clone(plan('PLN-0015'), { status: 'Executing' }); const rw = rr.waves![0];
  const rres = closeWave(rr, rw.id, data, { at: new Date().toISOString(), by: 'smoke' });
  ok(!rres.errors.length, 'rack wave closes');
  ok(rw.rackIds.every(id => rres.updates.find(u => u.entity === 'racks' && u.id === id)?.patch.status === 'Retired'), 'old racks retired');
  ok(rres.updates.some(u => u.entity === 'racks' && u.patch.status === 'Active') || rres.creates.some(c => c.entity === 'racks'), 'new rack record active');
  ok(rres.updates.some(u => u.entity === 'devices' && typeof u.patch.rackId === 'string'), 'devices moved to the new rack');
}

/* ------------------------------------------------------------------ execution against the database */
section('Execution: changes, windows, tests and planned devices per wave');
{
  const p0 = plan('PLN-0013');
  db.update('plannerPlans', p0.id, { status: 'Approved' });
  data = load(); const p = plan('PLN-0013'); const e = ev(p);
  const env = {
    actor: 'Smoke', templates, benchmarks, data, audit: () => undefined,
    startProcess: async () => ({ id: `PI-${Math.random().toString(36).slice(2, 7)}` }),
    createProgramFromBlueprint: async () => ({ programId: undefined }),
    createProgram: async (i: { name: string; type: string }) => { const id = nextId('programs', 'PROG'); db.create('programs', { id, progId: id, ...i }); return id; },
    createProject: async (i: { name: string; programId: string; template: string }) => { const id = nextId('projects', 'PROJ'); db.create('projects', { id, projId: id, ...i }); return id; },
  };
  const res = await runExecution(env as unknown as Parameters<typeof runExecution>[0], p, e, { devices: data.devices, vendors: data.vendors, contracts: data.contracts, assetModels: data.assetModels, racks: data.racks, upsUnits: data.upsUnits, coolingZones: data.coolingZones, dataCenters: data.dataCenters });
  ok(res.ok, `execution succeeds (${res.errors.map(x => x.message).join('; ')})`);
  data = load(); const after = plan('PLN-0013');
  const chg = data.changeRequests.filter(c => c.plannerPlanId === p.id);
  ok(after.status === 'Executing', 'plan executing');
  ok(chg.length === (p.waves ?? []).length && chg.every(c => c.type === 'ServerRelocation' && !!c.plannerWaveId && !!c.rollbackPlan && c.affectedResourceType === 'Asset'), 'one ServerRelocation change per wave with rollback and wave id');
  ok(data.maintenanceWindows.filter(m => m.plannerPlanId === p.id).length === chg.length, 'one maintenance window per wave');
  ok(data.atps.filter(x => x.plannerPlanId === p.id).length === chg.length, 'one burn-in test per wave');
  ok((after.waves ?? []).every(w => w.changeRequestId && w.maintenanceWindowId && w.atpId && w.status === 'Scheduled'), 'waves carry their change, window and test');
  ok(db.getAll('projects', { pageSize: 5000 }).data.some(x => (x as { template?: string }).template === 'Server Refresh'), 'a Server Refresh project is created');
  const w = after.waves![0];
  const closed = closeWave(after, w.id, data, { at: new Date().toISOString(), by: 'smoke', atpAccepted: true, idFor: nextId });
  ok(!closed.errors.length, 'first executed wave closes once the burn-in is accepted');
  for (const c of closed.creates) db.create(c.entity, c.rec); for (const u of closed.updates) db.update(u.entity, u.id, u.patch); db.update('plannerPlans', after.id, closed.plan as Record<string, unknown>);
  data = load();
  const cl = replaceCloseout(plan('PLN-0013'), data);
  ok(cl.find(c => c.key === 'waves')?.ok === false && /open/.test(cl.find(c => c.key === 'waves')!.detail), 'closeout still open with waves left');
  ok(data.changeRequests.find(c => c.id === w.changeRequestId)?.status === 'Closed', 'wave change closed');
  ok(blockers(plan('PLN-0013'), ev(plan('PLN-0013')), templates.find(t => t.id === p.templateId), data).every(b => b.text !== 'No waves yet'), 'blockers read the waves');
}

section('Execution: network refresh buys what stock cannot cover; migration raises a change per wave');
{
  const mkEnv = () => ({
    actor: 'Smoke', templates, benchmarks, data, audit: () => undefined,
    startProcess: async () => ({ id: `PI-${Math.random().toString(36).slice(2, 7)}` }),
    createProgramFromBlueprint: async () => ({ programId: undefined }),
    createProgram: async (i: { name: string; type: string }) => { const id = nextId('programs', 'PROG'); db.create('programs', { id, progId: id, ...i }); return id; },
    createProject: async (i: { name: string; programId: string; template: string }) => { const id = nextId('projects', 'PROJ'); db.create('projects', { id, projId: id, ...i }); return id; },
  });
  const sctx = () => ({ devices: data.devices, vendors: data.vendors, contracts: data.contracts, assetModels: data.assetModels, racks: data.racks, upsUnits: data.upsUnits, coolingZones: data.coolingZones, dataCenters: data.dataCenters });
  db.update('plannerPlans', plan('PLN-0014').id, { status: 'Approved' }); data = load();
  const n = plan('PLN-0014'); const ne = ev(n); const na = replaceOf(ne)!;
  const toBuy = na.supply.reduce((s, x) => s + x.procure, 0);
  const nres = await runExecution({ ...mkEnv(), data } as unknown as Parameters<typeof runExecution>[0], n, ne, sctx());
  ok(nres.ok, `network refresh executes (${nres.errors.map(x => x.message).join('; ')})`);
  data = load();
  const planned = data.devices.filter(d => d.plannerPlanId === n.id && d.lifecycleState === 'Ordered');
  ok(planned.length === toBuy && planned.every(d => d.model === '7050X3-48YC8' && /unit N\d+ /.test(String(d.notes))), `one Ordered device per purchased unit (${planned.length} of ${toBuy})`);
  ok(data.changeRequests.filter(c => c.plannerPlanId === n.id).every(c => c.type === 'NetworkMigration'), 'network waves raise NetworkMigration changes');
  ok((db.getAll('configChanges', { pageSize: 5000 }).data as unknown as T.ConfigChange[]).filter(c => c.plannerPlanId === n.id).length === na.old.length, 'a planned config change per switch, tied to its wave change');
  const m0 = plan('PLN-0006');
  const mig = { ...structuredClone(m0), id: 'PLN-SMOKE-M', plnId: 'PLN-SMOKE-M', status: 'Approved' as const, artefacts: undefined, waves: (m0.waves ?? []).map(w => (w.status === 'Closed' ? w : { ...w, status: 'Planned' as const, changeRequestId: undefined, maintenanceWindowId: undefined })) };
  db.create('plannerPlans', mig as unknown as Record<string, unknown>); data = load();
  const mres = await runExecution({ ...mkEnv(), data } as unknown as Parameters<typeof runExecution>[0], plan('PLN-SMOKE-M'), ev(plan('PLN-SMOKE-M')), sctx());
  ok(mres.ok, `migration executes (${mres.errors.map(x => x.message).join('; ')})`);
  data = load();
  const mc = data.changeRequests.filter(c => c.plannerPlanId === 'PLN-SMOKE-M');
  ok(mc.length === (mig.waves ?? []).filter(w => w.status !== 'Closed').length, 'one change per open migration wave');
  ok(mc.some(c => c.type === 'ServerRelocation') && mc.some(c => c.type === 'Decommission'), 'moves raise ServerRelocation, retirements Decommission');
  ok(data.dataCenters.find(d => d.id === mig.dataCenterId)?.status === 'Decommissioning', 'source site is Decommissioning');
}

console.log(`\n${passes} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map(f => `  - ${f}`).join('\n')); process.exit(1); }
process.exit(0);
