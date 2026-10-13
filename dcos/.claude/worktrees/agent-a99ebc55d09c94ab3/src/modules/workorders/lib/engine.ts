/**
 * Mock process engine — a tiny Zeebe stand-in over MockDB.
 *
 * Definitions are read from the real BPMN files (parsed with bpmn-moddle: flow nodes,
 * sequence flows, lanes, zeebe form keys / candidate groups / due dates / job types /
 * called decisions, boundary events, message catch events). The token logic lives in
 * `engineCore.ts` (pure, also used by seeds, scripts and the delivery chain): user tasks
 * wait for a form submission, message catch events wait for a correlated message, service /
 * business-rule tasks and timers complete immediately, exclusive gateways evaluate the FEEL
 * subset the model uses, parallel gateways fork and join, end events complete the instance
 * when no token remains. Everything is written through `db` so react-query consumers see it
 * after invalidation.
 */
import { BpmnModdle, type ModdleElement } from 'bpmn-moddle';
import { db } from '../../../mock/db';
import type * as T from '../../../mock/data/types';
import { evaluateDecision } from './dmn';
import {
  cancelInstanceIn, completeTaskIn, correlateMessageIn, getInstanceIn, isoDurationHours, runTokens, setDecisionEvaluator, startInstanceIn,
  type CompleteOptions, type ParsedNode, type ParsedProcess, type StartRecord, type ParsedFlow, type ParsedLane,
} from './engineCore';
// Delivery chain: the job worker that raises work orders at project work steps, and project sync.
import '../../delivery/lib/chainOps';

export { isoDurationHours, normaliseVariables } from './engineCore';
export type { BoundaryKind, CompleteOptions, ParsedFlow, ParsedLane, ParsedNode, ParsedProcess, StartRecord } from './engineCore';

setDecisionEvaluator(evaluateDecision);

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
      if (el.$type === 'bpmn:IntermediateCatchEvent') {
        const def = el.eventDefinitions?.[0] as ModdleElement | undefined;
        if (def?.$type.includes('Message')) { n.catchKind = 'message'; n.messageName = def.messageRef?.name; }
        else { n.catchKind = 'timer'; n.timer = def?.timeDuration?.body; }
      }
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

// ── Runtime (async wrappers over the core, writing to the app's MockDB) ──────
const nowIso = () => new Date().toISOString();
const rowsOf = <X>(entity: string) => db.getAllRaw(entity) as unknown as X[];

/** Complete a user task with its form data and advance the token. */
export async function completeTask(taskId: string, variables: Record<string, unknown>, actor: string, opts: CompleteOptions = {}): Promise<T.ProcessInstance> {
  const task = db.getById('userTasks', taskId) as unknown as T.ProcessUserTask | undefined;
  if (!task) throw new Error(`Task ${taskId} not found`);
  const inst = getInstanceIn(db, task.instanceId);
  if (!inst) throw new Error(`Instance ${task.instanceId} not found`);
  return completeTaskIn(db, await getParsed(inst.definitionKey), taskId, variables, actor, opts);
}

/** Correlate a message to a waiting message catch event (e.g. "work orders closed"). */
export async function correlateMessage(instanceId: string, elementId: string, variables: Record<string, unknown>, actor: string): Promise<T.ProcessInstance | undefined> {
  const inst = getInstanceIn(db, instanceId);
  if (!inst) return undefined;
  return correlateMessageIn(db, await getParsed(inst.definitionKey), instanceId, elementId, variables, actor);
}

/** Start a new instance of `definitionKey` bound to a record. */
export async function startInstance(definitionKey: string, businessKey: string, record: StartRecord, actor: string): Promise<T.ProcessInstance> {
  return startInstanceIn(db, await getParsed(definitionKey), businessKey, record, actor);
}

/** Resolve an engine incident: the failed job is retried and succeeds, the token moves on. */
export async function retryIncident(engineIncidentId: string, actor: string): Promise<T.ProcessInstance | undefined> {
  const einc = db.getById('engineIncidents', engineIncidentId) as unknown as T.EngineIncident | undefined;
  if (!einc) return undefined;
  const inst = getInstanceIn(db, einc.instanceId);
  if (!inst) return undefined;
  const parsed = await getParsed(inst.definitionKey);
  const t = nowIso();
  db.delete('engineIncidents', engineIncidentId);
  for (const f of rowsOf<T.FlowNodeInstance>('flowNodeInstances')) {
    if (f.instanceId === inst.id && f.elementId === einc.elementId && f.state === 'incident') db.update('flowNodeInstances', f.id, { state: 'completed', endedAt: t, updatedAt: t });
  }
  const el = parsed.nodes[einc.elementId];
  const entry = (el?.outgoing ?? []).map((fid) => parsed.flows[fid].targetId);
  return runTokens(db, parsed, { ...inst, state: 'active', currentElementIds: inst.currentElementIds.filter((id) => id !== einc.elementId), completedElementIds: [...inst.completedElementIds, einc.elementId] }, entry, actor);
}

/** Cancel a running instance: open tasks and tokens are terminated. */
export function cancelInstance(instanceId: string, actor: string, reason?: string): T.ProcessInstance | undefined {
  return cancelInstanceIn(db, instanceId, actor, reason);
}

/** Claim an open task for the current user. */
export function claimTask(taskId: string, actor: string): void {
  db.update('userTasks', taskId, { assignee: actor, updatedAt: nowIso() });
  const task = db.getById('userTasks', taskId) as unknown as T.ProcessUserTask | undefined;
  if (!task) return;
  for (const f of rowsOf<T.FlowNodeInstance>('flowNodeInstances')) if (f.instanceId === task.instanceId && f.elementId === task.elementId && f.state === 'active') db.update('flowNodeInstances', f.id, { assignee: actor });
}
