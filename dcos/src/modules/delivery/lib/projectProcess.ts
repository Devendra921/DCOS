/**
 * Project processes — which BPMN process each delivery template runs, the work steps in it,
 * the work orders each work step raises, and how the process position maps onto the
 * template's milestones.
 *
 * Pure (no React, no MockDB): used by the chain actions in the app, by the seed and by the
 * smoke script. The processes themselves are in `src/workorders/model.ts` (PRJ-01 … PRJ-17).
 *
 * A *work step* is a pair of nodes in a project process: a service task `raise_<step>` that
 * raises the step's work orders (each with its own change request) and a message catch
 * `wait_<step>` where the token waits until every work order of the step is closed. Work
 * orders and changes carry `projectStepId = 'wait_<step>'`, so the step a project is waiting
 * on is simply the process's current element.
 */
import type * as T from '../../../mock/data/types';
import type { ProjectTemplate, WorkOrderType } from '../../../mock/data/enums';
import { PROCESS_BY_KEY, nodeById, outgoing, type WfProcess } from '../../../workorders/model';
import { PROCESS_FOR_TEMPLATE, TEMPLATE_REGISTRY } from './projectTemplates';

/** Template → process key (one process per template; defined beside the template registry). */
export { PROCESS_FOR_TEMPLATE };
export const TEMPLATE_FOR_PROCESS: Record<string, ProjectTemplate> = Object.fromEntries(Object.entries(PROCESS_FOR_TEMPLATE).map(([t, k]) => [k, t as ProjectTemplate]));
export const processKeyFor = (template?: string): string | undefined => (template ? PROCESS_FOR_TEMPLATE[template as ProjectTemplate] : undefined);
export const isProjectProcess = (key?: string) => !!key && key in TEMPLATE_FOR_PROCESS;

// ── Work steps ───────────────────────────────────────────────────────────────
export const RAISE_TASK_TYPE = 'dcos.raise-work-orders';
export const WORK_CLOSED_MESSAGE = 'work-orders-closed';

export interface WorkStep { key: string; raiseId: string; waitId: string; name: string; lane: string; milestone?: string }
/** The work steps of a process, in path order. */
export function workStepsOf(processKey: string): WorkStep[] {
  const p = PROCESS_BY_KEY[processKey]; if (!p) return [];
  return p.nodes.filter(n => n.type === 'serviceTask' && n.taskType === RAISE_TASK_TYPE).map(n => {
    const key = n.id.replace(/^raise_/, '');
    const wait = nodeById(p, `wait_${key}`);
    return { key, raiseId: n.id, waitId: `wait_${key}`, name: WORK_SPECS[processKey]?.[key]?.label ?? wait?.name ?? n.name, lane: n.lane, milestone: wait?.milestone };
  });
}
/** Normalise 'raise_x' | 'wait_x' | 'x' to the step key 'x'. */
export const stepKeyOf = (stepId: string) => stepId.replace(/^(raise|wait)_/, '');
export const isWorkWait = (processKey: string, elementId: string) => workStepsOf(processKey).some(s => s.waitId === elementId);
export function workStepLabel(processKey: string, stepId: string): string {
  const k = stepKeyOf(stepId);
  return WORK_SPECS[processKey]?.[k]?.label ?? workStepsOf(processKey).find(s => s.key === k)?.name ?? stepId;
}

/** The readable name of a project process step for a project (e.g. "Power and cooling work"), whatever the stored id. */
export function stepNameFor(template: string | undefined, stepId: string | undefined): string | undefined {
  if (!stepId) return undefined;
  const key = processKeyFor(template);
  return key ? workStepLabel(key, stepId) : stepKeyOf(stepId).replace(/[-_]/g, ' ');
}

// ── Milestones ───────────────────────────────────────────────────────────────
/** Milestone name → the node whose completion completes it, in template order. */
export function milestoneNodes(processKey: string): { name: string; nodeId: string }[] {
  const p = PROCESS_BY_KEY[processKey]; const t = TEMPLATE_FOR_PROCESS[processKey];
  if (!p || !t) return [];
  return TEMPLATE_REGISTRY[t].milestones.map(name => ({ name, nodeId: p.nodes.find(n => n.milestone === name)?.id ?? '' }));
}
export type MilestoneState = 'Completed' | 'In Progress' | 'Not Started';
/** State of each template milestone for a process instance. */
export function milestoneStates(processKey: string, inst: Pick<T.ProcessInstance, 'state' | 'completedElementIds'> | undefined): { name: string; nodeId: string; state: MilestoneState }[] {
  const done = new Set(inst?.completedElementIds ?? []);
  let current = false;
  return milestoneNodes(processKey).map(m => {
    const completed = !!inst && (done.has(m.nodeId) || inst.state === 'completed');
    let state: MilestoneState = completed ? 'Completed' : 'Not Started';
    if (!completed && !current && inst && inst.state !== 'cancelled') { state = 'In Progress'; current = true; }
    return { ...m, state };
  });
}
/** Main path of a process (start → first end event), for placing seeded tokens and progress. */
export function mainPath(p: WfProcess): string[] {
  const path: string[] = []; const seen = new Set<string>();
  let cur = p.nodes.find(n => n.type === 'start')?.id;
  while (cur && !seen.has(cur)) {
    path.push(cur); seen.add(cur);
    const n = nodeById(p, cur);
    if (!n || n.type === 'end') break;
    const outs = outgoing(p, cur);
    const next = n.type === 'exclusiveGateway' ? (outs.find(f => f[1] === n.defaultTo) ?? outs[0]) : outs[0];
    cur = next?.[1];
  }
  return path;
}

// ── Work-order specs per work step ───────────────────────────────────────────
type Per = 'once' | 'row' | 'rackBatch' | 'site' | 'path' | 'wave' | 'cutin' | 'pair';
interface ItemSpec {
  type: WorkOrderType; title: string; per: Per; who: 'internal' | 'contractor'; vendor?: 'Services' | 'Power' | 'Cooling' | 'Network' | 'Hardware';
  days: number; kw?: number; devices?: number; live?: boolean; critical?: boolean;
  /** A standard template covers this work (it still has to fit the template's limits). */
  std?: boolean; priority?: T.WorkOrder['priority'];
  impl?: string; test?: string; backout?: string;
}
interface StepSpec { label: string; items: ItemSpec[] }

const C = (type: WorkOrderType, title: string, per: Per, vendor: ItemSpec['vendor'], days: number, extra: Partial<ItemSpec> = {}): ItemSpec => ({ type, title, per, who: 'contractor', vendor, days, ...extra });
const I = (type: WorkOrderType, title: string, per: Per, days: number, extra: Partial<ItemSpec> = {}): ItemSpec => ({ type, title, per, who: 'internal', days, ...extra });

/** What each work step raises. `{n}` in a title is replaced by the unit (row 2, site 3, path B…). */
export const WORK_SPECS: Record<string, Record<string, StepSpec>> = {
  'project-greenfield-build': {
    construction: { label: 'Construction', items: [C('Civil', 'Site preparation and earthworks', 'once', 'Services', 40), C('Civil', 'Structure and envelope, block {n}', 'pair', 'Services', 60)] },
    plant: { label: 'Plant installation', items: [C('PlantInstall', 'Install UPS and switchgear, power train {n}', 'pair', 'Power', 25), C('PlantInstall', 'Install chillers and CRAH units', 'once', 'Cooling', 25), C('Commissioning', 'Level 2 site acceptance of plant', 'once', 'Power', 4)] },
    backbone: { label: 'Network backbone', items: [C('Cabling', 'Backbone fibre, meet-me room to hall {n}', 'pair', 'Services', 6), I('CircuitTurnUp', 'Carrier circuit turn-up, diverse path {n}', 'path', 1, { std: true, devices: 2 }), I('Configuration', 'Core router and firewall configuration', 'once', 2, { devices: 4 })] },
  },
  'project-hall-fitout': {
    power: { label: 'Power and cooling', items: [C('PlantInstall', 'Install busway and floor PDUs, row {n}', 'row', 'Power', 5), C('PlantInstall', 'Install CRAH units and hot-aisle containment', 'once', 'Cooling', 8), C('PlantCutIn', 'Connect the hall switchboard to the live power train', 'once', 'Power', 1, { live: true, critical: true, priority: 'High' })] },
    racks: { label: 'Racks and containment', items: [C('RackInstall', 'Install racks and containment, row {n}', 'row', 'Services', 3, { std: true, kw: 8 }), C('Cabling', 'Structured cabling, row {n}', 'row', 'Services', 2, { std: true }), I('PowerConnect', 'Connect rack power strips, row {n}', 'row', 1, { std: true, kw: 4 })] },
    network: { label: 'Network fabric', items: [I('DeviceDeploy', 'Install spine and leaf switches', 'once', 2, { devices: 8, kw: 6 }), C('Cabling', 'Fabric cabling, row {n}', 'row', 'Services', 2, { std: true }), I('Configuration', 'Fabric configuration and BGP bring-up', 'once', 1, { devices: 8 })] },
  },
  'project-rack-deployment': {
    install: { label: 'Rack and stack', items: [I('RackInstall', 'Rack and stack, racks {n}', 'rackBatch', 2, { std: true, kw: 8 })] },
    cabling: { label: 'Cabling and power', items: [I('Cabling', 'Structured cabling, racks {n}', 'rackBatch', 1, { std: true }), I('PowerConnect', 'PDU outlet connection, racks {n}', 'rackBatch', 1, { std: true, kw: 4 })] },
    burnin: { label: 'Burn-in', items: [I('Commissioning', 'Server burn-in and validation, racks {n}', 'rackBatch', 2, { std: true })] },
  },
  'project-capacity-expansion': {
    install: { label: 'Installation', items: [I('DeviceDeploy', 'Install new capacity, rack group {n}', 'rackBatch', 3, { kw: 24, live: true }), I('PowerConnect', 'Connect rack feeds, rack group {n}', 'rackBatch', 1, { std: true, kw: 4, live: true })] },
    burnin: { label: 'Burn-in', items: [I('Commissioning', 'Burn-in and validation, rack group {n}', 'rackBatch', 2, { std: true })] },
    cutover: { label: 'Cut-over', items: [I('Configuration', 'Add the new capacity to production pools', 'once', 1, { live: true, critical: true, devices: 12, priority: 'High' })] },
  },
  'project-network-refresh': {
    stage: { label: 'Staging and pre-config', items: [I('DeviceDeploy', 'Stage and pre-configure new devices, group {n}', 'pair', 2, { devices: 4, kw: 2, std: true })] },
    cutover: { label: 'Cut-over', items: [I('Configuration', 'Cut over device group {n}', 'pair', 1, { live: true, critical: true, devices: 6, priority: 'High' }), I('Cabling', 'Re-patch uplinks, device group {n}', 'pair', 1, { live: true, std: true })] },
    removal: { label: 'Old device removal', items: [I('DeviceRemoval', 'Remove old devices, group {n}', 'pair', 1, { std: true, devices: 6 })] },
  },
  'project-migration-wave': {
    move: { label: 'Migration', items: [I('Migration', 'Move wave group {n}', 'wave', 1, { live: true, critical: true, devices: 12, priority: 'High' })] },
    source: { label: 'Source decommission', items: [I('DeviceRemoval', 'Remove equipment from the source racks', 'once', 2, { std: true, devices: 12 }), I('Disposal', 'Secure collection of retired media', 'once', 1, { std: true })] },
  },
  'project-decommission': {
    disconnect: { label: 'Power-down and disconnect', items: [I('DeviceRemoval', 'Power down and disconnect, rack group {n}', 'rackBatch', 1, { live: true, devices: 10 })] },
    removal: { label: 'Removal and disposal', items: [I('DeviceRemoval', 'Remove equipment, rack group {n}', 'rackBatch', 1, { std: true, devices: 10 }), C('Disposal', 'Secure collection and certified destruction', 'once', 'Services', 2, { std: true })] },
  },
  'project-master-planning': {
    survey: { label: 'Site and utility survey', items: [C('Inspection', 'Utility and ground survey', 'once', 'Services', 5, { std: true }), C('Inspection', 'Intrusive survey with trial pits', 'once', 'Services', 3, { live: true })] },
  },
  'project-site-construction': {
    siteprep: { label: 'Site preparation', items: [C('Civil', 'Earthworks and drainage', 'once', 'Services', 25), C('Civil', 'Temporary works and site compound', 'once', 'Services', 5)] },
    foundations: { label: 'Foundations', items: [C('Civil', 'Piling and foundations, block {n}', 'pair', 'Services', 30)] },
    structure: { label: 'Structure and envelope', items: [C('Civil', 'Steel frame and roof, block {n}', 'pair', 'Services', 35), C('Civil', 'Cladding and envelope', 'once', 'Services', 20)] },
  },
  'project-building-fitout': {
    finishes: { label: 'Partitions and finishes', items: [C('Civil', 'Partitions, doors and finishes, zone {n}', 'pair', 'Services', 20)] },
    containment: { label: 'Containment and raised floor', items: [C('Civil', 'Raised floor and containment, hall {n}', 'pair', 'Services', 15), C('Inspection', 'Cable tray and earthing test', 'once', 'Services', 2, { std: true })] },
  },
  'project-mep-plant': {
    electrical: { label: 'Electrical installation', items: [C('PlantInstall', 'HV and LV switchgear installation', 'once', 'Power', 25), C('PlantInstall', 'UPS and battery installation, train {n}', 'pair', 'Power', 20), C('Cabling', 'Power cabling and busway', 'once', 'Power', 15)] },
    mechanical: { label: 'Mechanical installation', items: [C('PlantInstall', 'Chillers and pumps', 'once', 'Cooling', 25), C('PlantInstall', 'CRAH units and pipework, hall {n}', 'pair', 'Cooling', 15)] },
  },
  'project-plant-upgrade': {
    cutins: { label: 'Cut-ins', items: [C('PlantCutIn', 'Cut-in {n} in a maintenance window', 'cutin', 'Power', 1, { live: true, critical: true, priority: 'High', impl: 'Follow the approved MOP: transfer the load to maintenance bypass, isolate, connect the new plant, re-energise and transfer back.', test: 'Load transfer checks; alarms clear at the BMS; redundancy restored.', backout: 'Open the new plant breakers and return the system to its previous configuration.' })] },
    disposal: { label: 'Replaced plant disposal', items: [C('Disposal', 'Remove and dispose of replaced plant', 'once', 'Power', 3, { std: true })] },
  },
  'project-dci-uplift': {
    xconnect: { label: 'Cross-connects', items: [C('Cabling', 'Cross-connect with LOA/CFA, path {n}', 'path', 'Services', 2, { std: true })] },
    turnup: { label: 'Optics and turn-up', items: [I('DeviceDeploy', 'Install optics and line cards, path {n}', 'path', 1, { std: true, devices: 2, kw: 1 }), I('CircuitTurnUp', 'Turn up the circuit, path {n}', 'path', 1, { std: true, devices: 2 })] },
    cutover: { label: 'Traffic cut-over', items: [I('Configuration', 'Move traffic to the new paths', 'once', 1, { live: true, critical: true, devices: 4, priority: 'High' })] },
    cease: { label: 'Circuit cease', items: [I('DeviceRemoval', 'Recover optics from the old circuits', 'once', 1, { std: true, devices: 4 })] },
  },
  'project-server-refresh': {
    burnin: { label: 'Rack and burn-in', items: [I('DeviceDeploy', 'Rack new servers, rack group {n}', 'rackBatch', 2, { std: true, kw: 3, devices: 4 }), I('Commissioning', 'Burn-in, rack group {n}', 'rackBatch', 2, { std: true })] },
    pilot: { label: 'Pilot wave', items: [I('Migration', 'Pilot wave: move the first services', 'once', 1, { live: true, devices: 4 })] },
    waves: { label: 'Remaining waves', items: [I('Migration', 'Wave {n}: move services to the new servers', 'wave', 1, { live: true, critical: true, devices: 12 })] },
    disposal: { label: 'Sanitise and dispose', items: [I('DeviceRemoval', 'Remove old servers, rack group {n}', 'rackBatch', 1, { std: true, devices: 8 }), C('Disposal', 'Certified media destruction', 'once', 'Services', 2, { std: true })] },
  },
  'project-rack-replacement': {
    pilot: { label: 'Pilot swap', items: [I('RackInstall', 'Pilot rack swap', 'once', 1, { live: true, kw: 8 })] },
    swaps: { label: 'Rack swaps', items: [I('RackInstall', 'Rack swap, racks {n}', 'rackBatch', 1, { live: true, kw: 8, critical: true }), I('PowerConnect', 'Re-connect power strips, racks {n}', 'rackBatch', 1, { std: true, kw: 4, live: true })] },
    removal: { label: 'Old rack removal', items: [I('DeviceRemoval', 'Remove old racks', 'once', 1, { std: true })] },
  },
  'project-liquid-retrofit': {
    tiein: { label: 'Facility water tie-in', items: [C('PlantCutIn', 'Facility water tie-in with hot taps', 'once', 'Cooling', 3, { live: true, critical: true, priority: 'High' })] },
    drain: { label: 'Row drain', items: [I('Migration', 'Drain row {n} to swing positions', 'row', 1, { live: true, devices: 20 })] },
    pipework: { label: 'Pipework and power uprate', items: [C('PlantInstall', 'Manifolds, CDUs and pipework, row {n}', 'row', 'Cooling', 6), C('PowerConnect', 'Power uprate to high-density feeds, row {n}', 'row', 'Power', 2, { kw: 60, live: true })] },
    repopulate: { label: 'Row repopulation', items: [I('DeviceDeploy', 'Repopulate row {n}', 'row', 2, { kw: 80, devices: 20, live: true })] },
  },
  'project-edge-rollout': {
    survey: { label: 'Site surveys', items: [C('Inspection', 'Site survey, site {n}', 'site', 'Services', 2, { std: true })] },
    enclosure: { label: 'Enclosure install', items: [C('Civil', 'Plinth and enclosure, site {n}', 'site', 'Services', 4), C('RackInstall', 'Install and power the edge rack, site {n}', 'site', 'Services', 1, { std: true, kw: 6 })] },
  },
};

// ── Planning the work orders of a step ───────────────────────────────────────
export interface WorkOrderDraft {
  type: WorkOrderType; title: string; description: string; plannedStart: string; plannedEnd: string;
  assigneeKind: 'internal' | 'contractor'; vendorCategory?: ItemSpec['vendor']; priority: NonNullable<T.WorkOrder['priority']>;
  kw?: number; devices?: number; liveSite: boolean; criticalServices: boolean; standardAllowed: boolean; rackIds?: string[];
  implementationPlan?: string; testPlan?: string; backoutPlan?: string;
}
const DAY = 864e5;
const addDays = (iso: string, d: number) => new Date(new Date(iso).getTime() + d * DAY).toISOString();
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : undefined);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Sizing facts from the project's intake detail (stored as JSON in notes) with template defaults. */
export function projectFacts(project: Pick<T.Project, 'notes' | 'template'>) {
  let detail: Record<string, unknown> = {};
  try { if (project.notes?.trim().startsWith('{')) detail = JSON.parse(project.notes) as Record<string, unknown>; } catch { detail = {}; }
  const racks = num(detail.rackPositions) ?? num(detail.rackCount) ?? num(detail.racks) ?? (project.template === 'Hall Fit-out' ? 40 : 12);
  return {
    detail, racks,
    rows: clamp(Math.ceil(racks / 10), 1, 4),
    rackBatches: clamp(Math.ceil(racks / 4), 1, 3),
    sites: clamp(num(detail.sites) ?? 3, 1, 4),
    paths: clamp(num(detail.paths) ?? 2, 1, 3),
    waves: clamp(num(detail.waves) ?? 2, 1, 3),
    cutIns: clamp(num(detail.cutIns) ?? 2, 1, 3),
    kwPerRack: (num(detail.designPowerKw) ?? num(detail.powerKw)) && racks ? (num(detail.designPowerKw) ?? num(detail.powerKw))! / racks : undefined,
  };
}

/**
 * The work orders a work step raises, before ids and classes (pure). Units come from the
 * project's intake detail; racks, when given, are spread over the rack-related orders.
 */
export function planWorkForStep(project: Pick<T.Project, 'notes' | 'template' | 'name'>, processKey: string, stepId: string, opts: { start: string; racks?: { id: string; name?: string }[]; limit?: number }): WorkOrderDraft[] {
  const spec = WORK_SPECS[processKey]?.[stepKeyOf(stepId)];
  if (!spec) return [];
  const f = projectFacts(project);
  const units = (per: Per): string[] => {
    switch (per) {
      case 'once': return [''];
      case 'row': return Array.from({ length: f.rows }, (_, i) => String.fromCharCode(65 + i));
      case 'rackBatch': return Array.from({ length: f.rackBatches }, (_, i) => `${i * 4 + 1}–${Math.min(f.racks, i * 4 + 4)}`);
      case 'site': return Array.from({ length: f.sites }, (_, i) => String(i + 1));
      case 'path': return Array.from({ length: f.paths }, (_, i) => String.fromCharCode(65 + i));
      case 'wave': return Array.from({ length: f.waves }, (_, i) => String(i + 1));
      case 'cutin': return Array.from({ length: f.cutIns }, (_, i) => String(i + 1));
      case 'pair': return ['1', '2'];
    }
  };
  const out: WorkOrderDraft[] = [];
  let cursor = opts.start;
  let rackCursor = 0;
  for (const item of spec.items) {
    units(item.per).forEach((u, k) => {
      const kw = item.type === 'RackInstall' || item.type === 'DeviceDeploy' ? (f.kwPerRack && item.per !== 'once' ? Math.round(f.kwPerRack) : item.kw) : item.kw;
      // Racks the order covers agree with its title: a batch "racks 1–4" covers four racks, a row its share of the racks.
      const covered = item.per === 'rackBatch' ? Math.max(1, Math.min(4, f.racks - k * 4)) : item.per === 'row' ? Math.max(1, Math.min(10, Math.ceil(f.racks / f.rows))) : item.per === 'once' ? 1 : 2;
      const rackIds = opts.racks?.length && ['RackInstall', 'Cabling', 'PowerConnect', 'DeviceDeploy', 'DeviceRemoval', 'Commissioning'].includes(item.type)
        ? [...new Set(Array.from({ length: Math.min(covered, opts.racks.length) }, (_, j) => opts.racks![((item.per === 'rackBatch' ? k * 4 : item.per === 'row' ? k * covered : rackCursor) + j) % opts.racks!.length].id))] : undefined;
      if (rackIds && item.per !== 'rackBatch' && item.per !== 'row') rackCursor += rackIds.length;
      const start = addDays(cursor, k === 0 ? 0 : Math.max(1, Math.round(item.days / 2)));
      out.push({
        type: item.type, title: item.title.replace('{n}', u).replace(/,\s*$/, ''),
        description: `${spec.label} for ${project.name}. ${item.who === 'contractor' ? 'Carried out by a contractor crew under a site access request.' : 'Carried out by the site team.'}`,
        plannedStart: start, plannedEnd: addDays(start, item.days), assigneeKind: item.who, vendorCategory: item.vendor, priority: item.priority ?? 'Medium',
        kw, devices: item.devices, liveSite: !!item.live, criticalServices: !!item.critical, standardAllowed: !!item.std, rackIds,
        implementationPlan: item.impl, testPlan: item.test ?? (item.type === 'Commissioning' || item.type === 'Inspection' ? 'Results recorded against the work order and attached as evidence.' : 'Visual check, labels and the record updated; the requester verifies.'), backoutPlan: item.backout,
      });
      cursor = start;
    });
    cursor = addDays(cursor, 1);
  }
  return opts.limit ? out.slice(0, opts.limit) : out;
}
