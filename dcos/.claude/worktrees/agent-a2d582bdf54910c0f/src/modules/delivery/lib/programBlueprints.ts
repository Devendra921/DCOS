import type { ProjectTemplate, ProgramStatus, ProgramType, ProjectStatus, RAGValue, MilestoneStatus, ActivityStatus } from '../../../mock/data/enums';
import type { Program, Project, Milestone, ProjectActivity } from '../../../mock/data/types';
import { TEMPLATE_REGISTRY, buildProcess, type TemplateField } from './projectTemplates';
import { DC_TYPE_CATALOG, dcTypeProfile } from '../../../mock/data/dcTypes';

/**
 * Programme blueprints model multi-project builds — most importantly the
 * greenfield data-center build, which is not one project but a *sequence* of
 * phases with real dependencies. A blueprint is the recipe; instantiating it
 * (see useCreateProgramFromBlueprint) materialises a Programme plus one Project
 * per phase, wired so a phase is blocked until its predecessors complete.
 *
 * The two things that make this a real build rather than a template list:
 *  - `dependsOn` — predecessor phases that gate this one (you cannot install
 *    MEP before the structure is up, nor fit out white-space before MEP is in).
 *  - `longLead` — procurement that must start at programme kick-off and run in
 *    parallel with civil works (generators, chillers and switchgear have
 *    12–18-month lead times), so the phase is never treated as blocked.
 */
export interface BlueprintPhase {
  /** Stable key used to wire dependencies within the blueprint. */
  key: string;
  /** Phase name (becomes the child project's name suffix). */
  name: string;
  /** The delivery template this phase runs as. */
  template: ProjectTemplate;
  /** Keys of predecessor phases that must complete before this phase can start. */
  dependsOn: string[];
  /** Human-readable gate that releases this phase, shown in the build sequence. */
  gate: string;
  /** Long-lead procurement: starts at T0, overlapping predecessors — never blocked. */
  longLead?: boolean;
  /** Planned start offset from programme start, in weeks. */
  startWeek: number;
  /** Planned duration, in weeks. */
  durationWeeks: number;
  /** Fraction of the programme budget allocated to this phase (phases sum to ~1). */
  budgetShare: number;
}

export interface ProgramBlueprint {
  key: string;
  name: string;
  /** The programme type this blueprint instantiates. */
  programType: ProgramType;
  description: string;
  /** Default total programme budget, in dollars. */
  defaultBudget: number;
  /** Intake fields captured when raising the build (reuses the template field shape). */
  fields: TemplateField[];
  phases: BlueprintPhase[];
}

/**
 * Greenfield Tier III data-center build. Phases follow the real critical path:
 * master plan → permits & civil construction → MEP plant (long-lead procured
 * up front) → network backbone → white-space fit-out → first-hall RFS.
 * Network can run alongside fit-out; the first hall needs both before RFS.
 */
const GREENFIELD_DC: ProgramBlueprint = {
  key: 'greenfield-dc',
  name: 'Greenfield Data Center Build',
  programType: 'Greenfield Build',
  description: 'End-to-end new facility from master plan to first-hall ready-for-service, as a sequenced multi-project programme.',
  defaultBudget: 120_000_000,
  fields: [
    { name: 'dcType', label: 'Data center type', type: 'select', options: DC_TYPE_CATALOG.map((t) => t.name) },
    { name: 'targetMw', label: 'Target IT load', type: 'number', suffix: 'MW', required: true },
    { name: 'tier', label: 'Resilience tier', type: 'select', options: ['Tier II', 'Tier III', 'Tier IV'], required: true },
    { name: 'region', label: 'Region', type: 'select', options: ['North America', 'EMEA', 'APAC', 'LATAM'] },
    { name: 'rfsDate', label: 'Target ready-for-service', type: 'text' },
  ],
  phases: [
    { key: 'master-plan', name: 'Master Planning & Feasibility', template: 'Facility Master Planning', dependsOn: [], gate: 'Programme kick-off', startWeek: 0, durationWeeks: 12, budgetShare: 0.03 },
    { key: 'site-construction', name: 'Permits & Site Construction', template: 'Site Construction', dependsOn: ['master-plan'], gate: 'Master plan signed off', startWeek: 12, durationWeeks: 60, budgetShare: 0.50 },
    { key: 'mep-plant', name: 'MEP & Plant Installation', template: 'MEP & Plant Installation', dependsOn: ['site-construction'], gate: 'Structure & envelope complete', longLead: true, startWeek: 44, durationWeeks: 36, budgetShare: 0.30 },
    { key: 'network-backbone', name: 'Network Backbone', template: 'Network Refresh', dependsOn: ['site-construction'], gate: 'Building secured', startWeek: 64, durationWeeks: 14, budgetShare: 0.04 },
    { key: 'building-fit-out', name: 'White-space Fit-out', template: 'Building Fit-out', dependsOn: ['mep-plant'], gate: 'MEP commissioned', startWeek: 72, durationWeeks: 18, budgetShare: 0.10 },
    { key: 'first-hall-rfs', name: 'First Hall Fit-out & RFS', template: 'Hall Fit-out', dependsOn: ['building-fit-out', 'network-backbone'], gate: 'White-space ready + network live', startWeek: 88, durationWeeks: 14, budgetShare: 0.03 },
  ],
};

/**
 * Hyperscale campus: several buildings as availability zones behind one substation.
 * The grid connection and the shells run in parallel off the master plan; MEP per
 * building is long-lead; the first AZ reaches RFS when its shell, plant and the
 * campus backbone are all in.
 */
const HYPERSCALE_CAMPUS: ProgramBlueprint = {
  key: 'hyperscale-campus',
  name: 'Hyperscale Campus Build (multi-AZ)',
  programType: 'Greenfield Build',
  description: 'Substation, multiple building shells as availability zones, per-building MEP and a campus backbone, to first-AZ ready-for-service.',
  defaultBudget: 900_000_000,
  fields: [
    { name: 'dcType', label: 'Data center type', type: 'select', options: DC_TYPE_CATALOG.map((t) => t.name) },
    { name: 'targetMw', label: 'Target IT load', type: 'number', suffix: 'MW', required: true },
    { name: 'azCount', label: 'Availability zones', type: 'number', suffix: 'AZs' },
    { name: 'region', label: 'Region', type: 'select', options: ['North America', 'EMEA', 'APAC', 'LATAM'] },
    { name: 'rfsDate', label: 'Target ready-for-service', type: 'text' },
  ],
  phases: [
    { key: 'master-plan', name: 'Campus Master Plan & Grid Agreement', template: 'Facility Master Planning', dependsOn: [], gate: 'Programme kick-off', startWeek: 0, durationWeeks: 20, budgetShare: 0.03 },
    { key: 'substation', name: 'Substation & Utility Interconnect', template: 'Site Construction', dependsOn: ['master-plan'], gate: 'Grid connection agreement signed', longLead: true, startWeek: 8, durationWeeks: 70, budgetShare: 0.12 },
    { key: 'az-shells', name: 'Building Shells (AZ-1 … AZ-n)', template: 'Site Construction', dependsOn: ['master-plan'], gate: 'Master plan signed off', startWeek: 20, durationWeeks: 80, budgetShare: 0.40 },
    { key: 'mep-plant', name: 'Per-building MEP & Plant', template: 'MEP & Plant Installation', dependsOn: ['az-shells', 'substation'], gate: 'First shell weather-tight + substation energised', longLead: true, startWeek: 60, durationWeeks: 50, budgetShare: 0.30 },
    { key: 'backbone', name: 'Campus Backbone & Inter-AZ Fabric', template: 'Network Refresh', dependsOn: ['az-shells'], gate: 'Shells secured', startWeek: 90, durationWeeks: 20, budgetShare: 0.05 },
    { key: 'fit-out', name: 'AZ-1 White-space Fit-out', template: 'Building Fit-out', dependsOn: ['mep-plant'], gate: 'AZ-1 MEP commissioned', startWeek: 110, durationWeeks: 20, budgetShare: 0.07 },
    { key: 'first-az-rfs', name: 'AZ-1 First Hall RFS', template: 'Hall Fit-out', dependsOn: ['fit-out', 'backbone'], gate: 'White-space ready + backbone live', startWeek: 128, durationWeeks: 14, budgetShare: 0.03 },
  ],
};

/**
 * AI / HPC GPU factory: power procurement leads everything, the liquid-cooling
 * plant (CDUs, immersion, dry coolers) is the long-lead item, and the cluster
 * fabric is built and burned in as its own phase before RFS.
 */
const AI_GPU_FACTORY: ProgramBlueprint = {
  key: 'ai-gpu-factory',
  name: 'AI / HPC GPU Factory Build',
  programType: 'Greenfield Build',
  description: 'Power-first build: grid capacity, liquid-cooling plant, high-density white space and a GPU cluster fabric with burn-in, to cluster ready-for-service.',
  defaultBudget: 350_000_000,
  fields: [
    { name: 'dcType', label: 'Data center type', type: 'select', options: DC_TYPE_CATALOG.map((t) => t.name) },
    { name: 'targetMw', label: 'Target IT load', type: 'number', suffix: 'MW', required: true },
    { name: 'gpuCount', label: 'GPUs', type: 'number', suffix: 'GPUs' },
    { name: 'coolingType', label: 'Cooling', type: 'select', options: ['Direct-liquid', 'Immersion', 'Hybrid'] },
    { name: 'rfsDate', label: 'Target ready-for-service', type: 'text' },
  ],
  phases: [
    { key: 'master-plan', name: 'Master Plan & Power Procurement', template: 'Facility Master Planning', dependsOn: [], gate: 'Programme kick-off', startWeek: 0, durationWeeks: 14, budgetShare: 0.04 },
    { key: 'site-construction', name: 'Permits & Site Construction', template: 'Site Construction', dependsOn: ['master-plan'], gate: 'Power capacity secured', startWeek: 14, durationWeeks: 48, budgetShare: 0.32 },
    { key: 'liquid-plant', name: 'Power Train & Liquid-Cooling Plant', template: 'MEP & Plant Installation', dependsOn: ['site-construction'], gate: 'Structure complete', longLead: true, startWeek: 30, durationWeeks: 40, budgetShare: 0.36 },
    { key: 'fabric', name: 'GPU Cluster Fabric', template: 'Network Refresh', dependsOn: ['site-construction'], gate: 'Building secured', startWeek: 56, durationWeeks: 16, budgetShare: 0.10 },
    { key: 'fit-out', name: 'High-density White-space & Liquid Loop', template: 'Building Fit-out', dependsOn: ['liquid-plant'], gate: 'CDU loop commissioned', startWeek: 66, durationWeeks: 14, budgetShare: 0.10 },
    { key: 'burn-in', name: 'Cluster Bring-up & Burn-in', template: 'Capacity Expansion', dependsOn: ['fit-out', 'fabric'], gate: 'White-space + fabric live', startWeek: 80, durationWeeks: 10, budgetShare: 0.06 },
    { key: 'rfs', name: 'Cluster RFS & Handover', template: 'Hall Fit-out', dependsOn: ['burn-in'], gate: 'Burn-in passed', startWeek: 90, durationWeeks: 6, budgetShare: 0.02 },
  ],
};

/**
 * Modular POD / edge / server room: a short build where the prefabricated unit is
 * the long-lead item and the site work is a pad, a utility drop and an uplink.
 */
const MODULAR_POD: ProgramBlueprint = {
  key: 'modular-pod',
  name: 'Modular POD / Edge Deployment',
  programType: 'Greenfield Build',
  description: 'Survey and permits, pad and utility works, a prefabricated POD or enclosure procured up front, placement, uplink and commissioning to ready-for-service.',
  defaultBudget: 8_000_000,
  fields: [
    { name: 'dcType', label: 'Data center type', type: 'select', options: DC_TYPE_CATALOG.map((t) => t.name) },
    { name: 'targetKw', label: 'Target IT load', type: 'number', suffix: 'kW', required: true },
    { name: 'rackCount', label: 'Racks', type: 'number', suffix: 'racks' },
    { name: 'rfsDate', label: 'Target ready-for-service', type: 'text' },
  ],
  phases: [
    { key: 'survey', name: 'Site Survey & Permits', template: 'Facility Master Planning', dependsOn: [], gate: 'Programme kick-off', startWeek: 0, durationWeeks: 4, budgetShare: 0.05 },
    { key: 'pad', name: 'Pad, Utility Drop & Fibre Entry', template: 'Site Construction', dependsOn: ['survey'], gate: 'Permits approved', startWeek: 4, durationWeeks: 10, budgetShare: 0.20 },
    { key: 'pod-procure', name: 'POD / Enclosure Procurement', template: 'MEP & Plant Installation', dependsOn: ['survey'], gate: 'Order placed at kick-off', longLead: true, startWeek: 0, durationWeeks: 20, budgetShare: 0.45 },
    { key: 'placement', name: 'Delivery, Placement & Connection', template: 'Building Fit-out', dependsOn: ['pad', 'pod-procure'], gate: 'Pad ready + unit delivered', startWeek: 20, durationWeeks: 4, budgetShare: 0.12 },
    { key: 'uplink', name: 'Uplink & Network Turn-up', template: 'Network Refresh', dependsOn: ['pad'], gate: 'Fibre entry complete', startWeek: 18, durationWeeks: 6, budgetShare: 0.08 },
    { key: 'rfs', name: 'Rack, Stack, Commission & RFS', template: 'Rack Deployment', dependsOn: ['placement', 'uplink'], gate: 'Unit connected + uplink live', startWeek: 24, durationWeeks: 6, budgetShare: 0.10 },
  ],
};

/**
 * Telco site (Central Office, aggregation / network POP): building readiness, a
 * −48V DC plant with battery strings as the long-lead item, equipment install,
 * transport and circuit turn-up, then cutover.
 */
const TELCO_SITE: ProgramBlueprint = {
  key: 'telco-site',
  name: 'Telco Site Build (CO / POP)',
  programType: 'Greenfield Build',
  description: 'Site readiness, civil works, a −48V DC power plant with batteries, equipment install, transport and circuit turn-up, to cutover and ready-for-service.',
  defaultBudget: 15_000_000,
  fields: [
    { name: 'dcType', label: 'Data center type', type: 'select', options: DC_TYPE_CATALOG.map((t) => t.name) },
    { name: 'targetKw', label: 'Target IT load', type: 'number', suffix: 'kW', required: true },
    { name: 'dcPlantKw', label: '−48V DC plant', type: 'number', suffix: 'kW' },
    { name: 'batteryHours', label: 'Battery reserve', type: 'number', suffix: 'h' },
    { name: 'rfsDate', label: 'Target ready-for-service', type: 'text' },
  ],
  phases: [
    { key: 'readiness', name: 'Site Readiness & Permits', template: 'Facility Master Planning', dependsOn: [], gate: 'Programme kick-off', startWeek: 0, durationWeeks: 6, budgetShare: 0.05 },
    { key: 'civil', name: 'Civil & Building Works', template: 'Site Construction', dependsOn: ['readiness'], gate: 'Permits approved', startWeek: 6, durationWeeks: 20, budgetShare: 0.30 },
    { key: 'dc-plant', name: '−48V DC Plant & Battery Strings', template: 'MEP & Plant Installation', dependsOn: ['civil'], gate: 'Plant room ready', longLead: true, startWeek: 0, durationWeeks: 30, budgetShare: 0.30 },
    { key: 'equipment', name: 'Equipment Install & BDFB Distribution', template: 'Rack Deployment', dependsOn: ['dc-plant'], gate: 'DC plant energised', startWeek: 30, durationWeeks: 8, budgetShare: 0.15 },
    { key: 'transport', name: 'Transport & Circuit Turn-up', template: 'Network Refresh', dependsOn: ['civil'], gate: 'Building secured', startWeek: 34, durationWeeks: 8, budgetShare: 0.12 },
    { key: 'cutover', name: 'Cutover & RFS', template: 'Hall Fit-out', dependsOn: ['equipment', 'transport'], gate: 'Equipment powered + transport live', startWeek: 42, durationWeeks: 6, budgetShare: 0.08 },
  ],
};

export const BLUEPRINT_REGISTRY: Record<string, ProgramBlueprint> = {
  [GREENFIELD_DC.key]: GREENFIELD_DC,
  [HYPERSCALE_CAMPUS.key]: HYPERSCALE_CAMPUS,
  [AI_GPU_FACTORY.key]: AI_GPU_FACTORY,
  [MODULAR_POD.key]: MODULAR_POD,
  [TELCO_SITE.key]: TELCO_SITE,
};

/** The blueprint a data-centre type builds with (its profile names it); the Tier III enterprise baseline when untyped or unknown. */
export function blueprintForDcType(dcTypeKey?: string | null): ProgramBlueprint {
  const key = dcTypeProfile(dcTypeKey)?.build.blueprintKey;
  return (key && BLUEPRINT_REGISTRY[key]) || GREENFIELD_DC;
}

export const PROGRAM_BLUEPRINTS: ProgramBlueprint[] = Object.values(BLUEPRINT_REGISTRY);

export function getBlueprint(key: string): ProgramBlueprint | undefined {
  return BLUEPRINT_REGISTRY[key];
}

/** The blueprint that backs a given programme type, if any. Type-driven creation
 *  uses this: a type with a blueprint generates phases; otherwise it's a container. */
export function blueprintForProgramType(type: ProgramType): ProgramBlueprint | undefined {
  return PROGRAM_BLUEPRINTS.find((b) => b.programType === type);
}

/** Total programme span in weeks (latest phase end). */
export function blueprintSpanWeeks(bp: ProgramBlueprint): number {
  return bp.phases.reduce((m, p) => Math.max(m, p.startWeek + p.durationWeeks), 0);
}

export interface PhaseSchedule { phase: BlueprintPhase; startISO: string; endISO: string; budget: number }

/** Resolve each phase's planned dates and budget from a programme start date and total budget. */
/** `durationFactor` scales every phase against the Tier III enterprise baseline — a modular POD is a fraction of the schedule, a hyperscale campus longer (see DcTypeProfile.build). */
export function schedulePhases(bp: ProgramBlueprint, startISO: string, totalBudget: number, durationFactor = 1): PhaseSchedule[] {
  const start = new Date(startISO).getTime();
  const wk = 7 * 864e5;
  const f = Math.max(0.05, durationFactor);
  return bp.phases.map((phase) => ({
    phase,
    startISO: new Date(start + phase.startWeek * f * wk).toISOString(),
    endISO: new Date(start + (phase.startWeek + phase.durationWeeks) * f * wk).toISOString(),
    budget: Math.round(totalBudget * phase.budgetShare),
  }));
}

// ── Pure programme builder ─────────────────────────────────────────
// Shared by the seed (pushes records into arrays) and the runtime hook
// (persists via the mock DB) so a seeded greenfield build is identical in
// shape to one a user raises. No React imports here on purpose.

/** Derive a phase's project status from its progress and whether predecessors have completed. */
export function phaseStatus(pct: number, blocked: boolean, longLead?: boolean): ProjectStatus {
  if (pct >= 100) return 'Completed';
  if (pct > 0) return 'Active';
  if (blocked && !longLead) return 'Blocked';
  return 'Planning';
}

export interface BlueprintBuildInput {
  blueprint: ProgramBlueprint;
  name: string;
  ownerName: string;
  dataCenterId?: string;
  startISO: string;
  budget: number;
  programStatus?: ProgramStatus;
  /** Intake values (targetMw, tier, region, rfsDate) — stored on the programme objective context. */
  objective?: string;
  /** Per-phase percentComplete keyed by phase.key. Omit for a fresh build (all phases at 0%). */
  phaseProgress?: Record<string, number>;
  /** Schedule multiplier from the target data-centre type (1 = Tier III enterprise baseline). */
  durationFactor?: number;
}

export interface BlueprintBuildDeps {
  /** Id generator, e.g. (p) => `${p}-0001`. Must return a unique id per call. */
  id: (prefix: string) => string;
  /** Base entity fields: customerId, timestamps, createdBy, isDeleted. */
  meta: () => Record<string, unknown>;
}

export interface BlueprintAudit { entityType: string; entityId: string; action: string; summary: string }
export interface BlueprintBuildResult {
  program: Program;
  projects: Project[];
  milestones: Milestone[];
  activities: ProjectActivity[];
  audits: BlueprintAudit[];
}

/**
 * Materialise a full programme from a blueprint: one Program plus one Project
 * per phase, with dependencies wired by resolving phase keys to the project ids
 * created earlier in the sequence, plus each project's milestones and BPMN
 * execution activities at the right progress.
 */
export function buildProgrammeRecords(input: BlueprintBuildInput, deps: BlueprintBuildDeps): BlueprintBuildResult {
  const { blueprint: bp, phaseProgress } = input;
  const progId = deps.id('PROG');
  const schedule = schedulePhases(bp, input.startISO, input.budget, input.durationFactor ?? 1);
  const endISO = schedule.reduce((m, s) => (s.endISO > m ? s.endISO : m), input.startISO);

  const program: Program = {
    id: progId, progId, ...(deps.meta() as object), name: input.name, type: bp.programType,
    objective: input.objective ?? bp.description, status: input.programStatus ?? 'Planning',
    ownerName: input.ownerName, budget: input.budget, startDate: input.startISO, endDate: endISO,
    projectCount: bp.phases.length,
  } as Program;

  const projects: Project[] = [];
  const milestones: Milestone[] = [];
  const activities: ProjectActivity[] = [];
  const audits: BlueprintAudit[] = [{ entityType: 'Program', entityId: progId, action: 'created', summary: `Created greenfield programme ${input.name} from blueprint (${bp.phases.length} sequenced phases)` }];

  // phase key → created project id (deps always reference earlier phases)
  const keyToProj: Record<string, string> = {};
  const pctByKey: Record<string, number> = {};

  schedule.forEach(({ phase, startISO, endISO: pEnd, budget }, phaseIdx) => {
    const projId = deps.id('PROJ');
    keyToProj[phase.key] = projId;
    const pct = phaseProgress?.[phase.key] ?? 0;
    pctByKey[phase.key] = pct;
    const blocked = phase.dependsOn.some((k) => (pctByKey[k] ?? 0) < 100);
    const status = phaseStatus(pct, blocked, phase.longLead);
    const rag: RAGValue = status === 'Completed' ? 'Green' : status === 'Blocked' ? 'Grey' : status === 'Active' ? 'Green' : 'Grey';
    const dependsOnProjectIds = phase.dependsOn.map((k) => keyToProj[k]).filter(Boolean);

    projects.push({
      id: projId, projId, ...(deps.meta() as object), programId: progId,
      name: `${input.name} — ${phase.name}`, status, rag, managerName: input.ownerName,
      dataCenterId: input.dataCenterId, plannedStart: startISO, plannedEnd: pEnd,
      percentComplete: pct, budget, actualSpend: Math.round(budget * (pct / 100) * 0.95),
      template: phase.template, phase: phaseIdx, dependsOnProjectIds, longLead: phase.longLead, startGate: phase.gate,
    } as Project);

    // Milestones from the phase template, progressed to match pct.
    const ms = TEMPLATE_REGISTRY[phase.template].milestones;
    const done = Math.round((pct / 100) * ms.length);
    ms.forEach((name, k) => {
      const msId = deps.id('MS');
      const mStatus: MilestoneStatus = k < done ? 'Completed' : k === done && pct < 100 && pct > 0 ? 'In Progress' : 'Not Started';
      const mRag: RAGValue = mStatus === 'Completed' ? 'Green' : mStatus === 'In Progress' ? rag : 'Grey';
      const span = new Date(pEnd).getTime() - new Date(startISO).getTime();
      const due = new Date(new Date(startISO).getTime() + (span * (k + 1)) / (ms.length + 1)).toISOString();
      milestones.push({ id: msId, msId, ...(deps.meta() as object), projectId: projId, name, dueDate: due, status: mStatus, rag: mRag } as Milestone);
    });

    // BPMN execution activities, progressed to the same frontier as pct.
    const proc = buildProcess(phase.template);
    const taskCount = proc.nodes.filter((n) => n.type === 'task').length;
    const frontier = Math.round((pct / 100) * taskCount);
    let taskIdx = 0;
    let lastTaskDone = true;
    proc.nodes.forEach((node, order) => {
      let aStatus: ActivityStatus;
      if (node.type === 'start') aStatus = 'Done';
      else if (node.type === 'end') aStatus = pct >= 100 ? 'Done' : 'Pending';
      else if (node.type === 'gateway') aStatus = lastTaskDone && taskIdx <= frontier && pct > 0 ? 'Done' : 'Pending';
      else {
        aStatus = taskIdx < frontier ? 'Done' : taskIdx === frontier && pct > 0 && pct < 100 ? 'Active' : 'Pending';
        lastTaskDone = aStatus === 'Done';
        taskIdx += 1;
      }
      const paId = deps.id('PA');
      activities.push({ id: paId, paId, ...(deps.meta() as object), projectId: projId, nodeId: node.id, name: node.name, nodeType: node.type, status: aStatus, order, attaches: node.attaches, condition: node.condition } as ProjectActivity);
    });

    audits.push({ entityType: 'Project', entityId: projId, action: 'created', summary: `Phase ${phaseIdx + 1}: ${phase.name} (${phase.template})${phase.longLead ? ' — long-lead procurement' : ''}${dependsOnProjectIds.length ? `, gated on ${phase.gate}` : ''}` });
  });

  return { program, projects, milestones, activities, audits };
}
