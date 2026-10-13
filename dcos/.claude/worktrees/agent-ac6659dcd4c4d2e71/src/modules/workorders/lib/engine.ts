/**
 * Mock process engine — a tiny Zeebe stand-in over MockDB.
 *
 * Definitions are read from the real BPMN files (parsed with bpmn-moddle: flow nodes,
 * sequence flows, lanes, zeebe form keys / candidate groups / due dates / job types /
 * called decisions, boundary events). Runtime actions move tokens along sequence flows:
 * user tasks wait for a form submission, service / business-rule tasks and timers complete
 * immediately, exclusive gateways evaluate the FEEL subset the model uses, parallel
 * gateways fork and join, end events complete the instance when no token remains.
 * Everything is written through `db` so react-query consumers see it after invalidation.
 */
import { BpmnModdle, type ModdleElement } from 'bpmn-moddle';
import { db } from '../../../mock/db';
import type * as T from '../../../mock/data/types';
import { evalCondition } from '../../../workorders/model';
import { evaluateDecision } from './dmn';

// ── BPMN loading & parsing ────────────────────────────────────────────────────
const BPMN_FILES = import.meta.glob('/src/workorders/bpmn/*.bpmn', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const keyOf = (path: string) => path.split('/').pop()!.replace(/\.bpmn$/, '');
export const BPMN_KEYS = Object.keys(BPMN_FILES).map(keyOf).sort();

const xmlCache = new Map<string, Promise<string>>();
export function loadBpmnXml(key: string): Promise<string> {
  if (!xmlCache.has(key)) {
    const entry = Object.entries(BPMN_FILES).find(([p]) => keyOf(p) === key);
    xmlCache.set(key, entry ? entry[1]() : Promise.reject(new Error(`No BPMN file for process "${key}"`)));
  }
  return xmlCache.get(key)!;
}

export type BoundaryKind = 'timer' | 'error' | 'message' | 'other';
export interface ParsedNode {
  id: string; name: string; type: string; lane?: string;
  formKey?: string; candidateGroups?: string; dueHours?: number; taskType?: string; decisionId?: string; resultVariable?: string;
  attachedTo?: string; boundaryKind?: BoundaryKind; interrupting?: boolean; defaultFlowId?: string; timer?: string;
  incoming: string[]; outgoing: string[];
}
export interface ParsedFlow { id: string; sourceId: string; targetId: string; name?: string; condition?: string }
export interface ParsedLane { id: string; name: string; nodeIds: string[] }
export interface ParsedProcess { key: string; name: string; documentation: string; lanes: ParsedLane[]; nodes: Record<string, ParsedNode>; flows: Record<string, ParsedFlow> }

export function isoDurationHours(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!m) return undefined;
  return (Number(m[1] ?? 0) * 24) + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60;
}

const moddle = new BpmnModdle();
const parsedCache = new Map<string, Promise<ParsedProcess>>();

export function parseBpmn(key: string, xml: string): Promise<ParsedProcess> {
  return moddle.fromXML(xml).then(({ rootElement }) => {
    const proc = (rootElement.rootElements as ModdleElement[]).find((e) => e.$type === 'bpmn:Process');
    if (!proc) throw new Error(`No bpmn:Process in ${key}`);
    const nodes: Record<string, ParsedNode> = {};
    const flows: Record<string, ParsedFlow> = {};
    for (const el of (proc.flowElements ?? []) as ModdleElement[]) {
      if (el.$type === 'bpmn:SequenceFlow') {
        flows[el.id!] = { id: el.id!, sourceId: el.sourceRef?.id, targetId: el.targetRef?.id, name: el.name, condition: el.conditionExpression?.body };
        continue;
      }
      const n: ParsedNode = { id: el.id!, name: el.name ?? el.id!, type: el.$type, incoming: [], outgoing: [] };
      for (const v of (el.extensionElements?.values ?? []) as ModdleElement[]) {
        const t = v.$type.toLowerCase();
        if (t.endsWith('formdefinition')) n.formKey = v.formKey ?? v.formId;
        else if (t.endsWith('assignmentdefinition')) n.candidateGroups = v.candidateGroups;
        else if (t.endsWith('taskschedule')) n.dueHours = isoDurationHours(String(v.dueDate ?? '').match(/duration\("([^"]+)"\)/)?.[1]);
        else if (t.endsWith('taskdefinition')) n.taskType = v.type;
        else if (t.endsWith('calleddecision')) { n.decisionId = v.decisionId; n.resultVariable = v.resultVariable; }
      }
      if (el.$type === 'bpmn:BoundaryEvent') {
        n.attachedTo = el.attachedToRef?.id;
        n.interrupting = el.cancelActivity !== false;
        const def = (el.eventDefinitions?.[0] as ModdleElement | undefined)?.$type ?? '';
        n.boundaryKind = def.includes('Timer') ? 'timer' : def.includes('Error') ? 'error' : def.includes('Message') ? 'message' : 'other';
      }
      if (el.$type === 'bpmn:IntermediateCatchEvent') n.timer = (el.eventDefinitions?.[0] as ModdleElement | undefined)?.timeDuration?.body;
      if (el.$type === 'bpmn:ExclusiveGateway') n.defaultFlowId = el.default?.id;
      nodes[n.id] = n;
    }
    for (const f of Object.values(flows)) { nodes[f.sourceId]?.outgoing.push(f.id); nodes[f.targetId]?.incoming.push(f.id); }
    const lanes: ParsedLane[] = ((proc.laneSets?.[0]?.lanes ?? []) as ModdleElement[]).map((l) => ({ id: l.id!, name: l.name ?? l.id!, nodeIds: ((l.flowNodeRef ?? []) as ModdleElement[]).map((r) => r.id!) }));
    for (const lane of lanes) for (const id of lane.nodeIds) if (nodes[id]) nodes[id].lane = lane.name;
    const documentation = ((proc.documentation ?? []) as ModdleElement[]).map((d) => d.text).join(' ');
    return { key, name: proc.name ?? key, documentation, lanes, nodes, flows };
  });
}

export function getParsed(key: string): Promise<ParsedProcess> {
  if (!parsedCache.has(key)) parsedCache.set(key, loadBpmnXml(key).then((xml) => parseBpmn(key, xml)));
  return parsedCache.get(key)!;
}

// ── Runtime ──────────────────────────────────────────────────────────────────
const HOUR = 3_600_000;
let seq = 0;
const newId = (prefix: string) => `${prefix}-R${Date.now().toString(36).toUpperCase()}${(seq++).toString(36).toUpperCase()}`;
const nowIso = () => new Date().toISOString();
const envelope = (actor: string): Omit<T.BaseEntity, 'id'> => {
  const t = nowIso();
  return { customerId: 'CUST-001', createdAt: t, updatedAt: t, createdBy: actor, createdById: actor, isDeleted: false };
};
const typeLabel = (bpmnType: string) => bpmnType.replace(/^bpmn:/, '').replace(/^./, (c) => c.toLowerCase());

const getInstance = (id: string) => db.getById('processInstances', id) as unknown as T.ProcessInstance | undefined;
const rowsOf = <X>(entity: string) => db.getAllRaw(entity) as unknown as X[];

/** Map generic form fields onto the variables the gateways read. */
export function normaliseVariables(vars: Record<string, unknown>): Record<string, unknown> {
  const out = { ...vars };
  if (typeof out.openItems === 'number') {
    for (const k of ['defects', 'exceptions', 'remainingWaves']) out[k] = out.openItems;
    out.blocked = out.openItems > 0;
  }
  return out;
}

interface RunState { current: Set<string>; completed: string[]; vars: Record<string, unknown> }

function createFni(inst: T.ProcessInstance, el: ParsedNode, state: T.FlowNodeState, actor: string, assignee?: string): void {
  const t = nowIso();
  db.create('flowNodeInstances', { id: newId('FNI'), ...envelope(actor), instanceId: inst.id, elementId: el.id, elementName: el.name, type: el.type === 'bpmn:BoundaryEvent' ? `boundary:${el.boundaryKind}` : typeLabel(el.type), state, startedAt: t, endedAt: state === 'completed' ? t : undefined, assignee } satisfies T.FlowNodeInstance);
}

function createUserTask(inst: T.ProcessInstance, el: ParsedNode, actor: string): void {
  const due = new Date(Date.now() + (el.dueHours ?? 8) * HOUR).toISOString();
  db.create('userTasks', { id: newId('UT'), ...envelope(actor), instanceId: inst.id, elementId: el.id, name: el.name, formKey: el.formKey ?? 'approve', candidateRole: el.candidateGroups ?? 'Operator', dueAt: due, state: 'created' } satisfies T.ProcessUserTask);
}

/** Drive tokens from `entryIds` until every one rests on a user task, a waiting join or an end event. */
function run(parsed: ParsedProcess, inst: T.ProcessInstance, entryIds: string[], actor: string): T.ProcessInstance {
  const st: RunState = { current: new Set(inst.currentElementIds), completed: [...inst.completedElementIds], vars: { ...inst.variables } };
  const queue = [...entryIds];
  let guard = 0;
  while (queue.length && guard++ < 200) {
    const id = queue.shift()!;
    const el = parsed.nodes[id];
    if (!el) continue;
    const next = () => el.outgoing.map((fid) => parsed.flows[fid]?.targetId).filter(Boolean);
    const finish = () => { createFni(inst, el, 'completed', actor); st.completed.push(id); };
    switch (el.type) {
      case 'bpmn:UserTask':
        if (st.current.has(id)) break; // already waiting there (loop re-entry)
        st.current.add(id);
        createFni(inst, el, 'active', actor);
        createUserTask(inst, el, actor);
        break;
      case 'bpmn:BusinessRuleTask': {
        if (el.decisionId) {
          const r = evaluateDecision(el.decisionId, st.vars);
          if (r) { if (el.resultVariable) st.vars[el.resultVariable] = r.output; Object.assign(st.vars, r.output); }
        }
        finish(); queue.push(...next()); break;
      }
      case 'bpmn:ExclusiveGateway': {
        finish();
        const flows = el.outgoing.map((fid) => parsed.flows[fid]).filter(Boolean);
        const hit = flows.find((f) => f.condition && evalCondition(f.condition, st.vars)) ?? flows.find((f) => f.id === el.defaultFlowId) ?? flows[0];
        if (hit) queue.push(hit.targetId);
        break;
      }
      case 'bpmn:ParallelGateway': {
        if (el.incoming.length > 1) {
          const arrived = el.incoming.every((fid) => st.completed.includes(parsed.flows[fid]?.sourceId));
          if (!arrived) { st.current.add(id); break; }
          st.current.delete(id);
        }
        finish(); queue.push(...next()); break;
      }
      case 'bpmn:EndEvent':
        finish(); break;
      default: // service tasks, timers, message catches, anything automatic
        finish(); queue.push(...next());
    }
  }
  const done = st.current.size === 0;
  const t = nowIso();
  const updated: T.ProcessInstance = {
    ...inst, currentElementIds: [...st.current], completedElementIds: st.completed, variables: st.vars,
    state: done ? 'completed' : (inst.state === 'incident' ? 'active' : inst.state), endedAt: done ? t : inst.endedAt, updatedAt: t,
  };
  db.update('processInstances', inst.id, updated as unknown as Record<string, unknown>);
  return updated;
}

export interface CompleteOptions {
  /** Take this boundary event (attached to the task's element) instead of the normal outgoing flow — e.g. an error boundary → rollback. */
  boundaryId?: string;
}

/** Complete a user task with its form data and advance the token. */
export async function completeTask(taskId: string, variables: Record<string, unknown>, actor: string, opts: CompleteOptions = {}): Promise<T.ProcessInstance> {
  const task = db.getById('userTasks', taskId) as unknown as T.ProcessUserTask | undefined;
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (task.state === 'completed') throw new Error(`Task ${taskId} is already completed`);
  const inst = getInstance(task.instanceId);
  if (!inst) throw new Error(`Instance ${task.instanceId} not found`);
  const parsed = await getParsed(inst.definitionKey);
  const t = nowIso();
  const assignee = task.assignee ?? actor;
  db.update('userTasks', taskId, { state: 'completed', completedAt: t, assignee, updatedAt: t });
  for (const f of rowsOf<T.FlowNodeInstance>('flowNodeInstances')) {
    if (f.instanceId === inst.id && f.elementId === task.elementId && f.state === 'active') db.update('flowNodeInstances', f.id, { state: opts.boundaryId ? 'terminated' : 'completed', endedAt: t, assignee, updatedAt: t });
  }
  const vars = normaliseVariables({ ...inst.variables, ...variables, lastCompletedBy: assignee });
  const current = inst.currentElementIds.filter((id) => id !== task.elementId);
  const completed = [...inst.completedElementIds, task.elementId];
  let entry: string[];
  const el = parsed.nodes[task.elementId];
  if (opts.boundaryId && parsed.nodes[opts.boundaryId]?.attachedTo === task.elementId) {
    const b = parsed.nodes[opts.boundaryId];
    createFni(inst, b, 'completed', actor);
    completed.push(b.id);
    entry = b.outgoing.map((fid) => parsed.flows[fid].targetId);
  } else {
    entry = (el?.outgoing ?? []).map((fid) => parsed.flows[fid].targetId);
  }
  return run(parsed, { ...inst, currentElementIds: current, completedElementIds: completed, variables: vars }, entry, actor);
}

export interface StartRecord { recordType: T.ProcessRecordType; recordId: string; dataCenterId?: string; title?: string; variables?: Record<string, unknown> }

/** Start a new instance of `definitionKey` bound to a record. */
export async function startInstance(definitionKey: string, businessKey: string, record: StartRecord, actor: string): Promise<T.ProcessInstance> {
  const parsed = await getParsed(definitionKey);
  const start = Object.values(parsed.nodes).find((n) => n.type === 'bpmn:StartEvent');
  if (!start) throw new Error(`Process ${definitionKey} has no start event`);
  const t = nowIso();
  const inst: T.ProcessInstance = {
    id: newId('PI'), ...envelope(actor), definitionKey, businessKey, recordType: record.recordType, recordId: record.recordId, dataCenterId: record.dataCenterId,
    state: 'active', startedAt: t, currentElementIds: [], completedElementIds: [start.id], variables: { businessKey, title: record.title ?? businessKey, ...(record.variables ?? {}) },
  };
  db.create('processInstances', inst as unknown as Record<string, unknown>);
  createFni(inst, start, 'completed', actor);
  return run(parsed, inst, start.outgoing.map((fid) => parsed.flows[fid].targetId), actor);
}

/** Resolve an engine incident: the failed job is retried and succeeds, the token moves on. */
export async function retryIncident(engineIncidentId: string, actor: string): Promise<T.ProcessInstance | undefined> {
  const einc = db.getById('engineIncidents', engineIncidentId) as unknown as T.EngineIncident | undefined;
  if (!einc) return undefined;
  const inst = getInstance(einc.instanceId);
  if (!inst) return undefined;
  const parsed = await getParsed(inst.definitionKey);
  const t = nowIso();
  db.delete('engineIncidents', engineIncidentId);
  for (const f of rowsOf<T.FlowNodeInstance>('flowNodeInstances')) {
    if (f.instanceId === inst.id && f.elementId === einc.elementId && f.state === 'incident') db.update('flowNodeInstances', f.id, { state: 'completed', endedAt: t, updatedAt: t });
  }
  const el = parsed.nodes[einc.elementId];
  const entry = (el?.outgoing ?? []).map((fid) => parsed.flows[fid].targetId);
  return run(parsed, { ...inst, state: 'active', currentElementIds: inst.currentElementIds.filter((id) => id !== einc.elementId), completedElementIds: [...inst.completedElementIds, einc.elementId] }, entry, actor);
}

/** Cancel a running instance: open tasks and tokens are terminated. */
export function cancelInstance(instanceId: string, actor: string, reason?: string): T.ProcessInstance | undefined {
  const inst = getInstance(instanceId);
  if (!inst || inst.state === 'completed' || inst.state === 'cancelled') return inst;
  const t = nowIso();
  for (const task of rowsOf<T.ProcessUserTask>('userTasks')) if (task.instanceId === instanceId && task.state === 'created') db.update('userTasks', task.id, { state: 'completed', completedAt: t, updatedAt: t });
  for (const f of rowsOf<T.FlowNodeInstance>('flowNodeInstances')) if (f.instanceId === instanceId && (f.state === 'active' || f.state === 'incident')) db.update('flowNodeInstances', f.id, { state: 'terminated', endedAt: t, updatedAt: t });
  for (const e of rowsOf<T.EngineIncident>('engineIncidents')) if (e.instanceId === instanceId) db.delete('engineIncidents', e.id);
  const updated: T.ProcessInstance = { ...inst, state: 'cancelled', endedAt: t, updatedAt: t, variables: { ...inst.variables, cancelledBy: actor, cancelReason: reason } };
  db.update('processInstances', instanceId, updated as unknown as Record<string, unknown>);
  return updated;
}

/** Claim an open task for the current user. */
export function claimTask(taskId: string, actor: string): void {
  db.update('userTasks', taskId, { assignee: actor, updatedAt: nowIso() });
  const task = db.getById('userTasks', taskId) as unknown as T.ProcessUserTask | undefined;
  if (!task) return;
  for (const f of rowsOf<T.FlowNodeInstance>('flowNodeInstances')) if (f.instanceId === task.instanceId && f.elementId === task.elementId && f.state === 'active') db.update('flowNodeInstances', f.id, { assignee: actor });
}
