/* Planner data layer — reads the planner collections (and the estate records the AI is
   grounded on) from MockDB through react-query, and exposes mutations that write through
   so every DCOS screen sees the same records. */
import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEntityList, useEntityDetail } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { useAuth } from '../../../core/auth/AuthContext';
import { db } from '../../../mock/db';
import type * as T from '../../../mock/data/types';
import { useCreateProgram, useCreateProgramFromBlueprint, useCreateProjectFromTemplate } from '../../delivery/lib/createFlows';
import { useEngineActions } from '../../workorders/lib/useWorkflows';
import { evaluate, type EstateActuals, type Evaluation } from './engine';
import { estateActuals } from './ai';
import type { SourcingContext } from './sourcing';
import { runExecution } from './execute';
import { emptyPlannerData, usePlannerData, type PlannerData } from './plannerData';

const BIG = { pageSize: 5000 } as const;
export const PLANNER_ENTITIES = ['plannerTemplates', 'plannerBenchmarks', 'plannerPlans', 'plannerScenarios', 'plannerFeedback'] as const;
/** Collections execution writes to (invalidated afterwards). */
export const EXECUTION_COLLECTIONS = ['programs', 'projects', 'milestones', 'tasks', 'projectActivities', 'boms', 'bomLines', 'purchaseOrders', 'subnets', 'vlans', 'ipAddresses', 'permits', 'designDocuments', 'changeRequests', 'maintenanceWindows', 'capacityReservations', 'rackReservations', 'devices', 'racks', 'halls', 'rows', 'buildings', 'floors', 'dataCenters', 'circuits', 'circuitTerminations', 'atps', 'atpSteps', 'configChanges', 'disposalCertificates', 'processInstances', 'contracts', 'services'] as const;
const now = () => new Date().toISOString();
const sid = (p: string) => `${p}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e3).toString(36).toUpperCase()}`;

export const useTemplates = () => (useEntityList('plannerTemplates', BIG).data?.data ?? []) as unknown as T.PlannerTemplate[];
export const useBenchmarks = () => (useEntityList('plannerBenchmarks', BIG).data?.data ?? []) as unknown as T.PlannerBenchmark[];
export const usePlans = () => (useEntityList('plannerPlans', BIG).data?.data ?? []) as unknown as T.PlannerPlan[];
export const usePlan = (id?: string) => (useEntityDetail('plannerPlans', id).data ?? undefined) as unknown as T.PlannerPlan | undefined;
const EMPTY: never[] = [];
export const useScenarios = (planId?: string) => { const data = useEntityList('plannerScenarios', BIG).data?.data; return useMemo(() => { const all = (data ?? EMPTY) as unknown as T.PlannerScenario[]; return planId ? all.filter(s => s.planId === planId) : all; }, [data, planId]); };
export const useFeedback = () => (useEntityList('plannerFeedback', BIG).data?.data ?? []) as unknown as T.PlannerFeedback[];

/** Estate records the engine and the AI are grounded on. */
export function useEstate() {
  const dataCenters = useEntityList('dataCenters', BIG).data?.data;
  const campuses = useEntityList('campuses', BIG).data?.data;
  const regions = useEntityList('regions', BIG).data?.data;
  const halls = useEntityList('halls', BIG).data?.data;
  const racks = useEntityList('racks', BIG).data?.data;
  const coolingZones = useEntityList('coolingZones', BIG).data?.data;
  const programs = useEntityList('programs', BIG).data?.data;
  const projects = useEntityList('projects', BIG).data?.data;
  const risks = useEntityList('risks', BIG).data?.data;
  return useMemo(() => ({
    dataCenters: (dataCenters ?? EMPTY) as unknown as T.DataCenter[], campuses: (campuses ?? EMPTY) as unknown as T.Campus[], regions: (regions ?? EMPTY) as unknown as T.Region[], halls: (halls ?? EMPTY) as unknown as T.Hall[], racks: (racks ?? EMPTY) as unknown as T.Rack[],
    coolingZones: (coolingZones ?? EMPTY) as unknown as T.CoolingZone[], programs: (programs ?? EMPTY) as unknown as T.Program[], projects: (projects ?? EMPTY) as unknown as T.Project[], risks: (risks ?? EMPTY) as unknown as T.RiskItem[],
  }), [dataCenters, campuses, regions, halls, racks, coolingZones, programs, projects, risks]);
}
export type Estate = ReturnType<typeof useEstate>;

/** Everything sourcing needs: stock devices, vendors and contracts, catalogue models, racks and site plant. */
export function useSourcingContext(): SourcingContext {
  const devices = useEntityList('devices', { pageSize: 20000 }).data?.data;
  const vendors = useEntityList('vendors', BIG).data?.data;
  const contracts = useEntityList('contracts', BIG).data?.data;
  const assetModels = useEntityList('assetModels', BIG).data?.data;
  const racks = useEntityList('racks', BIG).data?.data;
  const upsUnits = useEntityList('upsUnits', BIG).data?.data;
  const coolingZones = useEntityList('coolingZones', BIG).data?.data;
  const dataCenters = useEntityList('dataCenters', BIG).data?.data;
  return useMemo(() => ({ devices: (devices ?? EMPTY) as unknown as T.Device[], vendors: (vendors ?? EMPTY) as unknown as T.Vendor[], contracts: (contracts ?? EMPTY) as unknown as T.Contract[], assetModels: (assetModels ?? EMPTY) as unknown as T.AssetModel[], racks: (racks ?? EMPTY) as unknown as T.Rack[], upsUnits: (upsUnits ?? EMPTY) as unknown as T.UPS[], coolingZones: (coolingZones ?? EMPTY) as unknown as T.CoolingZone[], dataCenters: (dataCenters ?? EMPTY) as unknown as T.DataCenter[] }), [devices, vendors, contracts, assetModels, racks, upsUnits, coolingZones, dataCenters]);
}

export function useActuals(dcTypeKey?: string): EstateActuals {
  const e = useEstate();
  return useMemo(() => (dcTypeKey ? estateActuals(dcTypeKey, e) : { sampleSites: 0 }), [dcTypeKey, e]);
}

/** Full evaluation of a plan (base case) plus one evaluation per scenario. */
export function usePlanEvaluation(plan?: T.PlannerPlan) {
  const templates = useTemplates(); const benchmarks = useBenchmarks(); const scenarios = useScenarios(plan?.id); const actuals = useActuals(plan?.dcTypeKey);
  const data = usePlannerData();
  return useMemo(() => {
    if (!plan || !templates.length) return { base: undefined as Evaluation | undefined, scenarios: [] as { scenario: T.PlannerScenario; ev: Evaluation }[], preferred: undefined as Evaluation | undefined, actuals, templates, benchmarks, data };
    const base = evaluate(plan, null, templates, benchmarks, actuals, data);
    const scs = scenarios.map(s => ({ scenario: s, ev: evaluate(plan, s, templates, benchmarks, actuals, data) }));
    const preferred = scs.find(s => s.scenario.id === plan.preferredScenarioId)?.ev ?? base;
    return { base, scenarios: scs, preferred, actuals, templates, benchmarks, data };
  }, [plan, templates, benchmarks, scenarios, actuals, data]);
}

/** Evaluate an unsaved draft (wizard) without touching the store. */
export function useDraftEvaluation(draft?: T.PlannerPlan, overrides?: Record<string, number | string | boolean>) {
  const templates = useTemplates(); const benchmarks = useBenchmarks(); const actuals = useActuals(draft?.dcTypeKey);
  const data = usePlannerData();
  return useMemo(() => (draft && templates.length ? evaluate(draft, overrides ? { id: 'draft', scnId: 'draft', planId: draft.id, name: 'Draft', description: '', overrides, preferred: false } as T.PlannerScenario : null, templates, benchmarks, actuals, data) : undefined), [draft, overrides, templates, benchmarks, actuals, data]);
}

export function newPlanDraft(partial: Partial<T.PlannerPlan>, ownerName: string): T.PlannerPlan {
  const id = sid('PLN');
  return {
    id, plnId: id, customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: ownerName, createdById: 'me',
    title: '', scope: 'new-dc', status: 'Draft', templateId: '', dcTypeKey: 'hyperscale-dc', climate: 'temperate', intent: '', ownerName, requestedBy: ownerName,
    designPowerKw: 0, targetGoLive: new Date(Date.now() + 365 * 864e5).toISOString(), demand: { gpuPct: 20, computePct: 60, storagePct: 20, densityKwPerRack: 12, tenancy: 'single', growthPctPerYear: 15 },
    phases: [], params: {}, paramSources: {}, risks: [], permits: [], approvals: [], wizardStep: 1, aiAssisted: false, ...partial,
  } as T.PlannerPlan;
}

export function usePlannerActions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const actor = user?.name ?? 'Planner';
  const audit = useRecordAudit();
  const createProgram = useCreateProgramFromBlueprint();
  const createPlainProgram = useCreateProgram();
  const createProject = useCreateProjectFromTemplate();
  const engine = useEngineActions();
  const templatesAll = useTemplates();
  const benchmarksAll = useBenchmarks();
  const invalidate = useCallback(() => { for (const k of PLANNER_ENTITIES) void qc.invalidateQueries({ queryKey: [k] }); void qc.invalidateQueries({ queryKey: ['programs'] }); void qc.invalidateQueries({ queryKey: ['projects'] }); }, [qc]);
  const meta = useCallback(() => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: actor, createdById: 'me' }), [actor]);
  return useMemo(() => ({
    actor,
    savePlan(plan: T.PlannerPlan) {
      const exists = db.getById('plannerPlans', plan.id);
      const rec = { ...plan, updatedAt: now(), updatedBy: actor };
      if (exists) db.update('plannerPlans', plan.id, rec as unknown as Record<string, unknown>); else { db.create('plannerPlans', rec as unknown as Record<string, unknown>); audit('Plan', plan.id, 'created', `Created plan ${plan.title}`); }
      invalidate(); return rec;
    },
    patchPlan(id: string, patch: Partial<T.PlannerPlan>) { db.update('plannerPlans', id, { ...patch, updatedAt: now(), updatedBy: actor } as Record<string, unknown>); invalidate(); },
    setParam(plan: T.PlannerPlan, key: string, value: number | string | boolean, source: T.PlannerParamSource = 'user') { db.update('plannerPlans', plan.id, { params: { ...plan.params, [key]: value }, paramSources: { ...plan.paramSources, [key]: source }, updatedAt: now() } as Record<string, unknown>); invalidate(); },
    createScenario(planId: string, name: string, description: string, overrides: Record<string, number | string | boolean>) { const id = sid('SCN'); const rec: T.PlannerScenario = { id, scnId: id, ...meta(), planId, name, description, overrides, preferred: false }; db.create('plannerScenarios', rec as unknown as Record<string, unknown>); invalidate(); return rec; },
    updateScenario(id: string, patch: Partial<T.PlannerScenario>) { db.update('plannerScenarios', id, { ...patch, updatedAt: now() } as Record<string, unknown>); invalidate(); },
    deleteScenario(id: string) { db.delete('plannerScenarios', id); invalidate(); },
    preferScenario(plan: T.PlannerPlan, scenarioId: string | undefined) { for (const s of db.getAll('plannerScenarios', { pageSize: 5000 }).data as unknown as T.PlannerScenario[]) if (s.planId === plan.id) db.update('plannerScenarios', s.id, { preferred: s.id === scenarioId }); db.update('plannerPlans', plan.id, { preferredScenarioId: scenarioId, updatedAt: now() }); invalidate(); },
    recordFeedback(capability: string, planId: string, accepted: boolean, note?: string) { const id = sid('FB'); db.create('plannerFeedback', { id, fbId: id, ...meta(), capability, planId, accepted, note, at: now() } as Record<string, unknown>); invalidate(); },
    submitForReview(plan: T.PlannerPlan) { const approvals: T.PlannerApproval[] = plan.approvals.length ? plan.approvals : [{ step: 'Design review', role: 'Design authority', decision: 'Pending' }, { step: 'Budget approval', role: 'Finance', decision: 'Pending' }, ...(plan.scope === 'new-dc' || plan.scope === 'expansion' ? [{ step: 'Board approval', role: 'Executive', decision: 'Pending' as const }] : [])]; db.update('plannerPlans', plan.id, { status: 'In review', approvals, wizardStep: 10, updatedAt: now() }); audit('Plan', plan.id, 'submitted', `Submitted ${plan.title} for review`); invalidate(); },
    decide(plan: T.PlannerPlan, step: string, decision: T.PlannerApproval['decision'], conditions?: string) { const approvals = plan.approvals.map(a => (a.step === step ? { ...a, decision, person: actor, at: now(), conditions } : a)); const allOk = approvals.every(a => a.decision === 'Approved' || a.decision === 'Approved with conditions'); const anyNo = approvals.some(a => a.decision === 'Rejected'); db.update('plannerPlans', plan.id, { approvals, status: anyNo ? 'Rejected' : allOk ? 'Approved' : plan.status, updatedAt: now() }); invalidate(); },
    /** Approved plan → build artefacts (see execute.ts). Resumes an earlier run that stopped part-way. */
    async execute(plan: T.PlannerPlan, evaluation?: Evaluation, sourcing?: SourcingContext, data?: PlannerData) {
      const res = await runExecution({ actor, templates: templatesAll, benchmarks: benchmarksAll, data: data ?? emptyPlannerData(), audit, startProcess: (k, b, r) => engine.startInstance(k, b, r).catch(() => undefined), createProgramFromBlueprint: async i => (await createProgram({ ...i, startISO: i.startDate })) ?? undefined, createProgram: createPlainProgram, createProject }, plan, evaluation, sourcing);
      for (const k of EXECUTION_COLLECTIONS) void qc.invalidateQueries({ queryKey: [k] });
      invalidate(); return res;
    },
    saveTemplate(t: T.PlannerTemplate) { if (db.getById('plannerTemplates', t.id)) db.update('plannerTemplates', t.id, { ...t, updatedAt: now() } as unknown as Record<string, unknown>); else db.create('plannerTemplates', { ...t, ...meta(), ...{ createdAt: t.createdAt ?? now() } } as unknown as Record<string, unknown>); invalidate(); },
    cloneTemplate(t: T.PlannerTemplate, name: string) { const id = sid('TPL'); const rec: T.PlannerTemplate = { ...t, id, tplId: id, ...meta(), name, version: 1, status: 'draft', ownerName: actor, inheritsFrom: t.id, params: [], rules: [] }; db.create('plannerTemplates', rec as unknown as Record<string, unknown>); invalidate(); return rec; },
    saveBenchmark(b: T.PlannerBenchmark) { if (db.getById('plannerBenchmarks', b.id)) db.update('plannerBenchmarks', b.id, { ...b, updatedAt: now() } as unknown as Record<string, unknown>); else db.create('plannerBenchmarks', { ...b, ...meta() } as unknown as Record<string, unknown>); invalidate(); },
    newId: sid,
  }), [actor, audit, createProgram, createPlainProgram, createProject, engine, invalidate, meta, templatesAll, benchmarksAll, qc]);
}
