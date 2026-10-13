/**
 * Engine core — the token logic of the mock process engine, with no Vite or React
 * dependencies so it runs in the app, in seeds and in Node scripts alike.
 *
 * It works on a `ParsedProcess` (from the BPMN XML in the app, or straight from the process
 * model with `parsedFromModel`, which yields the same ids because the BPMN is generated from
 * that model) and writes through a MockDB instance. User tasks wait for a form submission,
 * message catch events wait until the message is correlated, service / business-rule tasks
 * and timers complete immediately (registered job workers run for service tasks), exclusive
 * gateways evaluate the FEEL subset the model uses, parallel gateways fork and join, end
 * events complete the instance when no token remains.
 */
import type { MockDB } from '../../../mock/db/store';
import type * as T from '../../../mock/data/types';
import { evalCondition, PROCESS_BY_KEY, type WfProcess } from '../../../workorders/model';

export type BoundaryKind = 'timer' | 'error' | 'message' | 'other';
export interface ParsedNode {
  id: string; name: string; type: string; lane?: string;
  formKey?: string; candidateGroups?: string; dueHours?: number; taskType?: string; decisionId?: string; resultVariable?: string;
  attachedTo?: string; boundaryKind?: BoundaryKind; interrupting?: boolean; defaultFlowId?: string; timer?: string;
  /** Intermediate catch events: what the token waits for. */
  catchKind?: 'timer' | 'message'; messageName?: string;
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

const BPMN_TYPE: Record<string, string> = {
  start: 'bpmn:StartEvent', end: 'bpmn:EndEvent', userTask: 'bpmn:UserTask', serviceTask: 'bpmn:ServiceTask', businessRuleTask: 'bpmn:BusinessRuleTask',
  exclusiveGateway: 'bpmn:ExclusiveGateway', parallelGateway: 'bpmn:ParallelGateway', timerCatch: 'bpmn:IntermediateCatchEvent', messageCatch: 'bpmn:IntermediateCatchEvent',
};
const parsedCache = new Map<string, ParsedProcess>();
/** The parsed form of a model process — identical ids, flows and extensions to the generated BPMN. */
export function parsedFromModel(p: WfProcess): ParsedProcess {
  const hit = parsedCache.get(p.key); if (hit) return hit;
  const nodes: Record<string, ParsedNode> = {};
  const flows: Record<string, ParsedFlow> = {};
  for (const n of p.nodes) {
    nodes[n.id] = {
      id: n.id, name: n.name, type: BPMN_TYPE[n.type], lane: n.lane, incoming: [], outgoing: [],
      ...(n.type === 'userTask' ? { formKey: n.formKey, candidateGroups: p.laneRoles[n.lane], dueHours: n.hours } : {}),
      ...(n.type === 'serviceTask' ? { taskType: n.taskType } : {}),
      ...(n.type === 'businessRuleTask' ? { decisionId: n.decisionId, resultVariable: n.resultVariable } : {}),
      ...(n.type === 'exclusiveGateway' && n.defaultTo ? { defaultFlowId: `Flow_${n.id}_${n.defaultTo}` } : {}),
      ...(n.type === 'timerCatch' ? { catchKind: 'timer' as const, timer: n.timer } : {}),
      ...(n.type === 'messageCatch' ? { catchKind: 'message' as const, messageName: n.message ?? n.id } : {}),
    };
    for (const b of n.boundaries ?? []) nodes[b.id] = { id: b.id, name: b.name, type: 'bpmn:BoundaryEvent', lane: n.lane, attachedTo: n.id, boundaryKind: b.kind, interrupting: !b.nonInterrupting, incoming: [], outgoing: [] };
  }
  for (const [from, to, name, cond] of p.flows) flows[`Flow_${from}_${to}`] = { id: `Flow_${from}_${to}`, sourceId: from, targetId: to, name, condition: cond };
  for (const n of p.nodes) for (const b of n.boundaries ?? []) flows[`Flow_${b.id}_${b.to}`] = { id: `Flow_${b.id}_${b.to}`, sourceId: b.id, targetId: b.to };
  for (const f of Object.values(flows)) { nodes[f.sourceId]?.outgoing.push(f.id); nodes[f.targetId]?.incoming.push(f.id); }
  const lanes: ParsedLane[] = p.lanes.map((l) => ({ id: `Lane_${l.replace(/[^A-Za-z0-9]+/g, '_')}`, name: l, nodeIds: Object.values(nodes).filter((n) => n.lane === l).map((n) => n.id) }));
  const parsed = { key: p.key, name: p.name, documentation: p.description, lanes, nodes, flows };
  parsedCache.set(p.key, parsed);
  return parsed;
}
/** Parsed process for a definition key, from the model (synchronous). */
export function modelParsed(key: string): ParsedProcess {
  const p = PROCESS_BY_KEY[key];
  if (!p) throw new Error(`Unknown process "${key}"`);
  return parsedFromModel(p);
}

// ── Pluggable behaviour ──────────────────────────────────────────────────────
export interface JobContext { db: MockDB; instance: T.ProcessInstance; elementId: string; variables: Record<string, unknown>; actor: string }
type JobWorker = (ctx: JobContext) => void;
const JOB_WORKERS: Record<string, JobWorker> = {};
/** Run `fn` whenever a token passes a service task of this job type (e.g. 'dcos.raise-work-orders'). */
export function registerJobWorker(taskType: string, fn: JobWorker): void { JOB_WORKERS[taskType] = fn; }

type DecisionEvaluator = (decisionId: string, vars: Record<string, unknown>) => { output: Record<string, unknown> } | undefined;
let evaluateDecision: DecisionEvaluator = () => undefined;
/** The app plugs the DMN tables in here (scripts run without them; business-rule tasks then just pass). */
export function setDecisionEvaluator(fn: DecisionEvaluator): void { evaluateDecision = fn; }

type MovedListener = (db: MockDB, instance: T.ProcessInstance, actor: string) => void;
const MOVED: MovedListener[] = [];
/** Called after every token move (start, task completion, message correlation, cancel). */
export function onInstanceMoved(fn: MovedListener): void { if (!MOVED.includes(fn)) MOVED.push(fn); }

// ── Runtime ──────────────────────────────────────────────────────────────────
const HOUR = 3_600_000;
let seq = 0;
export const newEngineId = (prefix: string) => `${prefix}-R${Date.now().toString(36).toUpperCase()}${(seq++).toString(36).toUpperCase()}`;
const nowIso = () => new Date().toISOString();
const envelope = (actor: string): Omit<T.BaseEntity, 'id'> => {
  const t = nowIso();
  return { customerId: 'CUST-001', createdAt: t, updatedAt: t, createdBy: actor, createdById: actor, isDeleted: false };
};
const typeLabel = (bpmnType: string) => bpmnType.replace(/^bpmn:/, '').replace(/^./, (c) => c.toLowerCase());
const rowsOf = <X>(db: MockDB, entity: string) => db.getAllRaw(entity) as unknown as X[];
export const getInstanceIn = (db: MockDB, id: string) => db.getById('processInstances', id) as unknown as T.ProcessInstance | undefined;

/** Gateway variables that follow the generic open-items count. */
export const OPEN_ITEM_ALIASES = ['defects', 'exceptions', 'remainingWaves', 'failedTests', 'snags', 'pendingConsents'] as const;

/**
 * Map generic form fields onto the variables the gateways read. The forms compute these with
 * expression fields; this is the engine-side safety net (and what older callers rely on):
 *   • `openItems` from the open-items list when the count is missing;
 *   • `approved` from an explicit approve / approve-with-conditions / reject decision;
 *   • the gateway aliases (defects, failedTests, snags …, blocked) follow `openItems`,
 *     except those set explicitly in `explicit` (the variables just submitted).
 */
export function normaliseVariables(vars: Record<string, unknown>, explicit: Record<string, unknown> = {}): Record<string, unknown> {
  const out = { ...vars };
  if (typeof explicit.openItems !== 'number' && Array.isArray(explicit.openItemsList)) out.openItems = explicit.openItemsList.length;
  if (typeof explicit.approved !== 'boolean' && typeof explicit.approvalDecision === 'string') out.approved = explicit.approvalDecision !== 'reject';
  if (typeof out.openItems === 'number') {
    for (const k of OPEN_ITEM_ALIASES) if (typeof explicit[k] !== 'number') out[k] = out.openItems;
    if (typeof explicit.blocked !== 'boolean') out.blocked = out.openItems > 0;
  }
  return out;
}

function createFni(db: MockDB, inst: T.ProcessInstance, el: ParsedNode, state: T.FlowNodeState, actor: string, assignee?: string): void {
  const t = nowIso();
  db.create('flowNodeInstances', { id: newEngineId('FNI'), ...envelope(actor), instanceId: inst.id, elementId: el.id, elementName: el.name, type: el.type === 'bpmn:BoundaryEvent' ? `boundary:${el.boundaryKind}` : typeLabel(el.type), state, startedAt: t, endedAt: state === 'completed' ? t : undefined, assignee } satisfies T.FlowNodeInstance);
}

function createUserTask(db: MockDB, inst: T.ProcessInstance, el: ParsedNode, actor: string): void {
  const due = new Date(Date.now() + (el.dueHours ?? 8) * HOUR).toISOString();
  db.create('userTasks', { id: newEngineId('UT'), ...envelope(actor), instanceId: inst.id, elementId: el.id, name: el.name, formKey: el.formKey ?? 'approve', candidateRole: el.candidateGroups ?? 'Operator', dueAt: due, state: 'created' } satisfies T.ProcessUserTask);
}

function notifyMoved(db: MockDB, inst: T.ProcessInstance, actor: string) { for (const fn of MOVED) fn(db, inst, actor); }

/** Drive tokens from `entryIds` until every one rests on a user task, a message wait, a waiting join or an end event. */
export function runTokens(db: MockDB, parsed: ParsedProcess, inst: T.ProcessInstance, entryIds: string[], actor: string): T.ProcessInstance {
  const st = { current: new Set(inst.currentElementIds), completed: [...inst.completedElementIds], vars: { ...inst.variables } };
  const queue = [...entryIds];
  const jobs: { worker: JobWorker; elementId: string }[] = [];
  let guard = 0;
  while (queue.length && guard++ < 200) {
    const id = queue.shift()!;
    const el = parsed.nodes[id];
    if (!el) continue;
    const next = () => el.outgoing.map((fid) => parsed.flows[fid]?.targetId).filter(Boolean);
    const finish = () => { createFni(db, inst, el, 'completed', actor); st.completed.push(id); };
    switch (el.type) {
      case 'bpmn:UserTask':
        if (st.current.has(id)) break; // already waiting there (loop re-entry)
        st.current.add(id);
        createFni(db, inst, el, 'active', actor);
        createUserTask(db, inst, el, actor);
        break;
      case 'bpmn:IntermediateCatchEvent':
        if (el.catchKind === 'message') {
          if (st.current.has(id)) break;
          st.current.add(id);
          createFni(db, inst, el, 'active', actor);
          break;
        }
        finish(); queue.push(...next()); break;
      case 'bpmn:BusinessRuleTask': {
        if (el.decisionId) {
          const r = evaluateDecision(el.decisionId, st.vars);
          if (r) { if (el.resultVariable) st.vars[el.resultVariable] = r.output; Object.assign(st.vars, r.output); }
        }
        finish(); queue.push(...next()); break;
      }
      case 'bpmn:ServiceTask': {
        const worker = el.taskType ? JOB_WORKERS[el.taskType] : undefined;
        if (worker) jobs.push({ worker, elementId: id });
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
      default: // timers and anything automatic
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
  // Job workers run once the instance is written, so they see where the token rests.
  for (const j of jobs) j.worker({ db, instance: updated, elementId: j.elementId, variables: st.vars, actor });
  const latest = getInstanceIn(db, inst.id) ?? updated;
  notifyMoved(db, latest, actor);
  return latest;
}

export interface CompleteOptions {
  /** Take this boundary event (attached to the task's element) instead of the normal outgoing flow — e.g. an error boundary → rollback. */
  boundaryId?: string;
}

/** Complete a user task with its form data and advance the token. */
export function completeTaskIn(db: MockDB, parsed: ParsedProcess, taskId: string, variables: Record<string, unknown>, actor: string, opts: CompleteOptions = {}): T.ProcessInstance {
  const task = db.getById('userTasks', taskId) as unknown as T.ProcessUserTask | undefined;
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (task.state === 'completed') throw new Error(`Task ${taskId} is already completed`);
  const inst = getInstanceIn(db, task.instanceId);
  if (!inst) throw new Error(`Instance ${task.instanceId} not found`);
  const t = nowIso();
  const assignee = task.assignee ?? actor;
  // The submitted form data stays on the task, so completed steps show what was recorded.
  db.update('userTasks', taskId, { state: 'completed', completedAt: t, assignee, updatedAt: t, variables: { ...variables } });
  for (const f of rowsOf<T.FlowNodeInstance>(db, 'flowNodeInstances')) {
    if (f.instanceId === inst.id && f.elementId === task.elementId && f.state === 'active') db.update('flowNodeInstances', f.id, { state: opts.boundaryId ? 'terminated' : 'completed', endedAt: t, assignee, updatedAt: t });
  }
  const vars = normaliseVariables({ ...inst.variables, ...variables, lastCompletedBy: assignee }, variables);
  const current = inst.currentElementIds.filter((id) => id !== task.elementId);
  const completed = [...inst.completedElementIds, task.elementId];
  let entry: string[];
  const el = parsed.nodes[task.elementId];
  if (opts.boundaryId && parsed.nodes[opts.boundaryId]?.attachedTo === task.elementId) {
    const b = parsed.nodes[opts.boundaryId];
    createFni(db, inst, b, 'completed', actor);
    completed.push(b.id);
    entry = b.outgoing.map((fid) => parsed.flows[fid].targetId);
  } else {
    entry = (el?.outgoing ?? []).map((fid) => parsed.flows[fid].targetId);
  }
  return runTokens(db, parsed, { ...inst, currentElementIds: current, completedElementIds: completed, variables: vars }, entry, actor);
}

/** Correlate a message to a waiting message catch event of an instance; the token moves on. Returns undefined when nothing waits there. */
export function correlateMessageIn(db: MockDB, parsed: ParsedProcess, instanceId: string, elementId: string, variables: Record<string, unknown>, actor: string): T.ProcessInstance | undefined {
  const inst = getInstanceIn(db, instanceId);
  if (!inst || inst.state === 'completed' || inst.state === 'cancelled' || !inst.currentElementIds.includes(elementId)) return undefined;
  const el = parsed.nodes[elementId];
  if (!el) return undefined;
  const t = nowIso();
  for (const f of rowsOf<T.FlowNodeInstance>(db, 'flowNodeInstances')) {
    if (f.instanceId === inst.id && f.elementId === elementId && f.state === 'active') db.update('flowNodeInstances', f.id, { state: 'completed', endedAt: t, updatedAt: t });
  }
  const entry = el.outgoing.map((fid) => parsed.flows[fid].targetId);
  return runTokens(db, parsed, { ...inst, currentElementIds: inst.currentElementIds.filter((id) => id !== elementId), completedElementIds: [...inst.completedElementIds, elementId], variables: normaliseVariables({ ...inst.variables, ...variables }) }, entry, actor);
}

export interface StartRecord { recordType: T.ProcessRecordType; recordId: string; dataCenterId?: string; title?: string; variables?: Record<string, unknown> }

/** Start a new instance bound to a record. */
export function startInstanceIn(db: MockDB, parsed: ParsedProcess, businessKey: string, record: StartRecord, actor: string): T.ProcessInstance {
  const start = Object.values(parsed.nodes).find((n) => n.type === 'bpmn:StartEvent');
  if (!start) throw new Error(`Process ${parsed.key} has no start event`);
  const t = nowIso();
  const inst: T.ProcessInstance = {
    id: newEngineId('PI'), ...envelope(actor), definitionKey: parsed.key, businessKey, recordType: record.recordType, recordId: record.recordId, dataCenterId: record.dataCenterId,
    state: 'active', startedAt: t, currentElementIds: [], completedElementIds: [start.id], variables: { businessKey, title: record.title ?? businessKey, ...(record.variables ?? {}) },
  };
  db.create('processInstances', inst as unknown as Record<string, unknown>);
  createFni(db, inst, start, 'completed', actor);
  return runTokens(db, parsed, inst, start.outgoing.map((fid) => parsed.flows[fid].targetId), actor);
}

/** Cancel a running instance: open tasks and tokens are terminated. */
export function cancelInstanceIn(db: MockDB, instanceId: string, actor: string, reason?: string): T.ProcessInstance | undefined {
  const inst = getInstanceIn(db, instanceId);
  if (!inst || inst.state === 'completed' || inst.state === 'cancelled') return inst;
  const t = nowIso();
  for (const task of rowsOf<T.ProcessUserTask>(db, 'userTasks')) if (task.instanceId === instanceId && task.state === 'created') db.update('userTasks', task.id, { state: 'completed', completedAt: t, updatedAt: t });
  for (const f of rowsOf<T.FlowNodeInstance>(db, 'flowNodeInstances')) if (f.instanceId === instanceId && (f.state === 'active' || f.state === 'incident')) db.update('flowNodeInstances', f.id, { state: 'terminated', endedAt: t, updatedAt: t });
  for (const e of rowsOf<T.EngineIncident>(db, 'engineIncidents')) if (e.instanceId === instanceId) db.delete('engineIncidents', e.id);
  const updated: T.ProcessInstance = { ...inst, state: 'cancelled', endedAt: t, updatedAt: t, variables: { ...inst.variables, cancelledBy: actor, cancelReason: reason } };
  db.update('processInstances', instanceId, updated as unknown as Record<string, unknown>);
  notifyMoved(db, updated, actor);
  return updated;
}

/** Open user tasks of an instance. */
export const openTasksOf = (db: MockDB, instanceId: string) => rowsOf<T.ProcessUserTask>(db, 'userTasks').filter((t) => t.instanceId === instanceId && t.state === 'created');

/**
 * Complete the open task at `elementId` with `vars`. With `catchUp`, open tasks met before it
 * (other than those in `never`) are completed with `{ approved: true }` first, so a record
 * whose status moved on without its process catches up — callers only ask for this once the
 * record has passed every decision those tasks stand for. Bounded; returns the latest instance.
 */
export function driveTask(db: MockDB, parsed: ParsedProcess, instanceId: string, elementId: string, vars: Record<string, unknown>, actor: string, opts: CompleteOptions & { catchUp?: boolean; never?: string[] } = {}): T.ProcessInstance | undefined {
  for (let i = 0; i < 12; i++) {
    const inst = getInstanceIn(db, instanceId);
    if (!inst || inst.state !== 'active') return inst;
    const open = openTasksOf(db, instanceId);
    const target = open.find((t) => t.elementId === elementId);
    if (target) return completeTaskIn(db, parsed, target.id, vars, actor, { boundaryId: opts.boundaryId });
    const next = open.find((t) => !(opts.never ?? []).includes(t.elementId));
    if (!opts.catchUp || !next || inst.completedElementIds.includes(elementId)) return inst;
    completeTaskIn(db, parsed, next.id, { approved: true, openItems: 0, complete: true, acknowledged: true }, actor);
  }
  return getInstanceIn(db, instanceId);
}

/**
 * Fire a boundary event attached to a task the token is waiting on (e.g. the message
 * "Delivery delayed" on a project's "Receive…" task). A non-interrupting boundary leaves the
 * task open and starts its path alongside (the expedite task); an interrupting one ends the
 * task first. Returns undefined when the host task is not active.
 */
export function fireBoundaryIn(db: MockDB, parsed: ParsedProcess, instanceId: string, boundaryId: string, variables: Record<string, unknown>, actor: string): T.ProcessInstance | undefined {
  const inst = getInstanceIn(db, instanceId);
  const b = parsed.nodes[boundaryId];
  if (!inst || inst.state !== 'active' || !b?.attachedTo || !inst.currentElementIds.includes(b.attachedTo)) return undefined;
  const t = nowIso();
  let current = inst.currentElementIds;
  if (b.interrupting) {
    current = current.filter((id) => id !== b.attachedTo);
    for (const task of openTasksOf(db, instanceId)) if (task.elementId === b.attachedTo) db.update('userTasks', task.id, { state: 'completed', completedAt: t, updatedAt: t });
    for (const f of rowsOf<T.FlowNodeInstance>(db, 'flowNodeInstances')) if (f.instanceId === instanceId && f.elementId === b.attachedTo && f.state === 'active') db.update('flowNodeInstances', f.id, { state: 'terminated', endedAt: t, updatedAt: t });
  }
  createFni(db, inst, b, 'completed', actor);
  const entry = b.outgoing.map((fid) => parsed.flows[fid].targetId);
  return runTokens(db, parsed, { ...inst, currentElementIds: current, completedElementIds: [...inst.completedElementIds, boundaryId], variables: normaliseVariables({ ...inst.variables, ...variables }) }, entry, actor);
}

/**
 * Close an open user task without moving its token on (e.g. "Expedite with the vendor" once
 * everything was delivered): the task is completed with a note and its token ends there.
 * The instance completes when no token remains.
 */
export function withdrawTaskIn(db: MockDB, instanceId: string, elementId: string, actor: string, note: string): T.ProcessInstance | undefined {
  const inst = getInstanceIn(db, instanceId);
  if (!inst || inst.state !== 'active' || !inst.currentElementIds.includes(elementId)) return undefined;
  const t = nowIso();
  for (const task of openTasksOf(db, instanceId)) if (task.elementId === elementId) db.update('userTasks', task.id, { state: 'completed', completedAt: t, assignee: task.assignee ?? actor, updatedAt: t });
  for (const f of rowsOf<T.FlowNodeInstance>(db, 'flowNodeInstances')) if (f.instanceId === instanceId && f.elementId === elementId && f.state === 'active') db.update('flowNodeInstances', f.id, { state: 'completed', endedAt: t, assignee: f.assignee ?? actor, updatedAt: t });
  const current = inst.currentElementIds.filter((id) => id !== elementId);
  const done = current.length === 0;
  const updated: T.ProcessInstance = { ...inst, currentElementIds: current, completedElementIds: [...inst.completedElementIds, elementId], variables: { ...inst.variables, [`${elementId}Note`]: note }, state: done ? 'completed' : inst.state, endedAt: done ? t : inst.endedAt, updatedAt: t };
  db.update('processInstances', instanceId, updated as unknown as Record<string, unknown>);
  notifyMoved(db, updated, actor);
  return updated;
}
