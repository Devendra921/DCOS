/**
 * Execution — an approved plan becomes build artefacts in the platform.
 *
 * Execution runs as named steps. Each step records 'done' (or 'failed' with the error) in the
 * plan's artefacts as soon as it finishes, so a failed run can be resumed: steps already done
 * are skipped and nothing is created twice. The plan is set to Executing only when every
 * step has succeeded; a partial run leaves it Approved with the errors shown.
 *
 * Generic steps: delivery vehicle (programme, project or change, unless the plan type's family
 * creates its own), bill of materials, purchase orders, stock and rack holds, IP space, permits
 * and design documents. The family's `execute` hook then adds its own records (changes and
 * windows per wave, circuits, planned devices, child plans…).
 */
import type * as T from '../../../mock/data/types';
import { db } from '../../../mock/db';
import { dcTypeProfile } from '../../../mock/data/dcTypes';
import { evaluate, type Evaluation } from './engine';
import { blueprintFor, buildBom, buildInitiation, buildIpPlan, REPLACE_SCOPES } from './outputs';
import { sourceBom, type SourcedLine, type SourcingContext } from './sourcing';
import type { PlannerData } from './plannerData';
import { modelFor, type ExecCtx } from './scopes';

const now = () => new Date().toISOString();
const REPLACE_TYPES: Partial<Record<T.PlannerScope, T.BOM['type']>> = { 'server-refresh': 'Compute', 'network-refresh': 'Network', 'rack-replace': 'Rack' };

/** What execution needs from the app (hooks are created by the caller). */
export interface ExecEnv {
  actor: string; templates: T.PlannerTemplate[]; benchmarks: T.PlannerBenchmark[]; data: PlannerData;
  audit(entity: string, id: string, action: string, summary: string): void;
  startProcess: ExecCtx['startProcess'];
  createProgramFromBlueprint: ExecCtx['createProgramFromBlueprint'];
  createProgram: ExecCtx['createProgram'];
  createProject: ExecCtx['createProject'];
}
export interface ExecResult { ok: boolean; artefacts: T.PlannerArtefacts; errors: { step: string; message: string }[]; warnings: string[] }

/** Next sequential id for a collection: PREFIX-0001, PREFIX-0002… (falls back to a time-based id when the collection uses another scheme). */
export function nextId(entity: string, prefix: string): string {
  const all = db.getAll(entity, { pageSize: 100000 }).data as { id: string }[];
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = all.reduce((m, r) => { const x = re.exec(r.id); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

export async function runExecution(env: ExecEnv, plan: T.PlannerPlan, evaluation?: Evaluation, sourcing?: SourcingContext): Promise<ExecResult> {
  const template = env.templates.find(t => t.id === plan.templateId);
  const ev = evaluation ?? evaluate(plan, null, env.templates, env.benchmarks, undefined, env.data);
  const bom = buildBom(plan, ev, env.benchmarks); const ip = buildIpPlan(plan, ev); const init = buildInitiation(plan, ev, template, bom);
  const sourced = sourcing ? sourceBom(plan, ev, bom, sourcing) : undefined;
  const profile = dcTypeProfile(plan.dcTypeKey);
  const model = modelFor(plan.scope);
  const meta = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: env.actor, createdById: 'me' });
  // Resume an earlier run when there is one that did not finish.
  const prev = plan.artefacts && !plan.artefacts.completedAt ? plan.artefacts : undefined;
  const artefacts: T.PlannerArtefacts = prev ? { ...prev, errors: [] } : { createdAt: now(), executionId: `EXE-${Date.now().toString(36).toUpperCase()}`, vehicle: init.vehicle, purchaseOrderIds: [], subnetIds: [], vlanIds: [], permitIds: [], designDocIds: [], steps: {}, errors: [] };
  artefacts.steps = artefacts.steps ?? {};
  const errors: { step: string; message: string }[] = []; const warnings: string[] = [];
  const persist = () => db.update('plannerPlans', plan.id, { artefacts, updatedAt: now() } as Record<string, unknown>);
  const x: ExecCtx = {
    plan, ev, template, bom, sourced, data: env.data, actor: env.actor, meta,
    id: (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4).toString(36).toUpperCase()}`,
    seq: nextId,
    create(entity, rec) { const id = String(rec.id ?? x.id(entity.slice(0, 4).toUpperCase())); db.create(entity, { ...meta(), ...rec, id }); return id; },
    update(entity, id, patch) { db.update(entity, id, { ...patch, updatedAt: now() }); },
    async step(key, fn) {
      if (artefacts.steps![key] === 'done') return;
      try { await fn(); artefacts.steps![key] = 'done'; }
      catch (e) { artefacts.steps![key] = 'failed'; const message = e instanceof Error ? e.message : String(e); errors.push({ step: key, message }); artefacts.errors = [...(artefacts.errors ?? []), { step: key, message, at: now() }]; }
      persist();
    },
    artefacts, planPatch: {}, warn: m => warnings.push(m),
    startProcess: env.startProcess, createProgramFromBlueprint: env.createProgramFromBlueprint, createProgram: env.createProgram, createProject: env.createProject,
  };
  persist();

  // 1. Delivery vehicle.
  await x.step('vehicle', async () => {
    if (model.executeVehicle) { await model.executeVehicle(x); return; }
    if (init.vehicle === 'change') {
      const id = nextId('changeRequests', 'CHG');
      x.create('changeRequests', { id, chgId: id, title: plan.title, type: init.change?.type ?? 'RackDeploy', description: `Raised from plan ${plan.plnId}: ${plan.intent || plan.title}`, risk: ev.hardFails ? 'High' : 'Low', status: 'Submitted', priority: 'Medium', affectedResourceType: 'Rack', affectedResourceIds: String(plan.params.placementRackIds ?? '').split(',').filter(Boolean), dataCenterId: plan.dataCenterId, requestedBy: env.actor, requestedById: 'me', policyViolations: [], scheduledStart: plan.targetGoLive, plannerPlanId: plan.id });
      artefacts.changeRequestId = id; artefacts.changeRequestIds = [...(artefacts.changeRequestIds ?? []), id];
      const inst = await env.startProcess('change', id, { recordType: 'changeRequest', recordId: id, dataCenterId: plan.dataCenterId, title: plan.title, variables: { planId: plan.id } });
      if (!inst) throw new Error('The change process could not be started');
      artefacts.processInstanceId = inst.id;
      return;
    }
    if (init.vehicle === 'project') {
      const programId = await env.createProgram({ name: plan.title, type: plan.scope === 'network' ? 'Network Modernization' : 'Capacity Expansion', objective: plan.intent || plan.title, ownerName: plan.ownerName, budget: plan.baseline?.capexTotal ?? init.budget, status: 'Active', startDate: now(), endDate: plan.targetGoLive });
      x.update('programs', programId, { plannerPlanId: plan.id });
      artefacts.programId = programId;
      for (const pj of init.projects) if (pj.template) { const pid = await env.createProject({ name: pj.name, programId, template: pj.template, managerName: plan.ownerName, dataCenterId: plan.dataCenterId, plannedStart: pj.start, plannedEnd: pj.end, budget: pj.budget, detail: { planId: plan.id } }); if (pid) { x.update('projects', pid, { plannerPlanId: plan.id }); artefacts.projectIds = [...(artefacts.projectIds ?? []), pid]; } }
    } else {
      const res = await env.createProgramFromBlueprint({ blueprintKey: init.blueprintKey ?? blueprintFor(plan), name: plan.title, ownerName: plan.ownerName, dataCenterId: plan.dataCenterId, budget: plan.baseline?.capexTotal ?? (init.budget || undefined), objective: plan.intent, durationFactor: profile?.build.durationFactor });
      if (!res?.programId) throw new Error(`Blueprint ${init.blueprintKey ?? blueprintFor(plan)} not found`);
      artefacts.programId = res.programId; x.update('programs', res.programId, { plannerPlanId: plan.id });
    }
    const inst = await env.startProcess(init.workOrder.key, plan.plnId, { recordType: 'plannerPlan', recordId: plan.id, dataCenterId: plan.dataCenterId, title: plan.title, variables: { planId: plan.id, scope: plan.scope, designPowerKw: plan.designPowerKw, capex: init.budget } });
    if (!inst) x.warn(`Work order ${init.workOrder.process} could not be started; start it from Work orders`);
    artefacts.processInstanceId = inst?.id;
  });

  // 2. Bill of materials.
  await x.step('bom', () => {
    const bomId = nextId('boms', 'BOM');
    const lines = sourced?.lines ?? bom.lines;
    const top = bom.byCategory[0]?.category;
    x.create('boms', { id: bomId, bomId, name: `${plan.title} · bill of materials`, type: REPLACE_TYPES[plan.scope] ?? (plan.scope === 'network' ? 'Network' : plan.scope === 'plant' ? 'Power' : top === 'Compute and storage' ? 'Compute' : 'Rack'), totalCost: sourced?.total ?? bom.total, status: 'Draft', lineCount: lines.length, plannerPlanId: plan.id });
    lines.forEach((l, i) => { const sl = l as Partial<SourcedLine>; const id = x.id('BOML'); x.create('bomLines', { id, bomlId: id, bomId, lineNo: i + 1, partNumber: l.partNumber, description: `${l.item} — ${l.spec}${sl.allocations ? ` · ${sl.fromSite ? `${sl.fromSite} from site, ` : ''}${sl.fromStock ? `${sl.fromStock} from stock, ` : ''}${sl.toBuy} to buy` : ''}`, manufacturer: l.manufacturer, quantity: l.qty, unitCost: l.unitCost, category: l.category }); });
    artefacts.bomId = bomId;
  });

  // 3. Purchase orders: one per vendor under its contract when sourced; otherwise one per long-lead item.
  await x.step('purchase-orders', () => {
    const ids = sourced
      ? sourced.vendors.filter(v => v.value > 0).map(v => { const id = nextId('purchaseOrders', 'PO'); x.create('purchaseOrders', { id, poId: id, bomId: artefacts.bomId, vendorId: v.vendorId, contractId: v.contractId, plannedCost: v.value, approvedBudget: v.value, actualSpend: 0, forecastVariance: 0, status: 'Draft', plannerPlanId: plan.id, notes: `${v.vendorName}: ${v.lines.length} line${v.lines.length === 1 ? '' : 's'}${v.contractId ? ` under contract ${v.contractLabel}` : ', no contract'}; longest lead ${v.leadWeeks || '—'} weeks. From plan ${plan.plnId}.` }); return id; })
      : init.orders.map(o => { const id = nextId('purchaseOrders', 'PO'); x.create('purchaseOrders', { id, poId: id, bomId: artefacts.bomId, plannedCost: o.value, approvedBudget: o.value, actualSpend: 0, forecastVariance: 0, status: 'Draft', plannerPlanId: plan.id, orderBy: o.orderBy, needBy: o.needBy, notes: `${o.item}: order by ${o.orderBy.slice(0, 10)}` }); return id; });
    artefacts.purchaseOrderIds = ids;
  });

  // 4. Stock and rack positions the plan uses.
  await x.step('holds', () => {
    const devs = sourced?.stockDeviceIds ?? [];
    for (const id of devs) x.update('devices', id, { lifecycleState: 'Staged', plannerPlanId: plan.id, notes: `Reserved for ${plan.plnId} · ${plan.title}` });
    const racks = sourced?.siteRackIds ?? [];
    for (const id of racks) x.update('racks', id, { status: 'Reserved' });
    artefacts.reservedDeviceIds = devs; artefacts.reservedRackIds = racks;
  });

  // 5. IP space and VLANs (only plans that add network; replacements keep their addresses).
  await x.step('ip', () => {
    const coversNetwork = !REPLACE_SCOPES.includes(plan.scope) && plan.scope !== 'migration' && (template?.requiredAspects ?? []).some(a => a.aspect === 'network' && a.depth !== 'skipped');
    if (!coversNetwork) return;
    const purposeOf = (p: string) => (p === 'Loopback' ? 'Transit' : p);
    artefacts.subnetIds = ip.items.map(i => { const id = nextId('subnets', 'SUBNET'); x.create('subnets', { id, subnetId: id, cidr: i.cidr, name: `${plan.title.split('·')[0].trim()} · ${i.name}`, status: 'Reserved', gatewayIp: i.gateway ?? '', dataCenterId: plan.dataCenterId, totalHosts: i.hosts, usedHosts: 0, utilizationPct: 0, state: 'Reserved', purpose: purposeOf(i.purpose), plannerPlanId: plan.id }); return id; });
    artefacts.vlanIds = ip.vlans.map(v => { const id = nextId('vlans', 'VLAN'); x.create('vlans', { id, vlanId: id, vlanNumber: v.number, name: v.name, dataCenterId: plan.dataCenterId, status: 'Reserved', plannerPlanId: plan.id }); return id; });
  });

  // 6. Permits and design documents.
  await x.step('permits', () => {
    const permitType = (n: string) => (/planning|zoning/i.test(n) ? 'Planning / Zoning' : /building/i.test(n) ? 'Building Permit' : /grid|utility|connection/i.test(n) ? 'Utility Interconnect' : /environment|emission|noise|water/i.test(n) ? 'Environmental' : /fire/i.test(n) ? 'Fire / Life Safety' : /electric/i.test(n) ? 'Electrical' : 'Planning / Zoning');
    const permitStatus: Record<T.PlannerPermit['status'], string> = { 'Not started': 'Not Started', Applied: 'Applied', 'In review': 'In Review', Approved: 'Approved', Expired: 'Expired' };
    artefacts.permitIds = plan.permits.map(pm => { const id = nextId('permits', 'PMT'); x.create('permits', { id, permitId: id, name: pm.name, type: permitType(pm.name), status: permitStatus[pm.status], authority: pm.authority, owner: plan.ownerName, programId: artefacts.programId, dataCenterId: plan.dataCenterId, plannerPlanId: plan.id, notes: `Needed before ${pm.neededBefore.slice(0, 10)}; ${pm.leadWeeks} weeks lead. From plan ${plan.plnId}.` }); return id; });
  });
  await x.step('design-docs', () => {
    artefacts.designDocIds = init.designDocs.map(d => { const id = nextId('designDocuments', 'DD'); x.create('designDocuments', { id, ddId: id, name: `${plan.title} · ${d.name}`, type: d.type, status: 'Draft', discipline: d.discipline, revision: 'A', author: env.actor, programId: artefacts.programId, plannerPlanId: plan.id, notes: `Generated from plan ${plan.plnId}` }); return id; });
  });

  // 7. The family's own records.
  if (model.execute) await x.step('scope', () => model.execute!(x));

  const ok = errors.length === 0;
  if (ok) artefacts.completedAt = now();
  db.update('plannerPlans', plan.id, { ...x.planPatch, status: ok ? 'Executing' : plan.status, programId: artefacts.programId, processInstanceId: artefacts.processInstanceId, artefacts, updatedAt: now(), updatedBy: env.actor } as Record<string, unknown>);
  env.audit('Plan', plan.id, ok ? 'executed' : 'execution failed', ok
    ? `Plan ${plan.plnId} executed: ${artefacts.programId ? `programme ${artefacts.programId}` : `change ${artefacts.changeRequestId}`}, ${bom.lines.length} BOM lines, ${artefacts.purchaseOrderIds.length} purchase orders, ${artefacts.subnetIds.length} subnets, ${artefacts.permitIds.length} permits`
    : `Execution of ${plan.plnId} stopped at ${errors.map(e => e.step).join(', ')}: ${errors.map(e => e.message).join('; ')}`);
  return { ok, artefacts, errors, warnings };
}
