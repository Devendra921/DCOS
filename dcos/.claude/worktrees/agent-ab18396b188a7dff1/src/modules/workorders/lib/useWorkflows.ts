/**
 * React hooks and small helpers for the Work orders module — thin wrappers over the
 * app's entity hooks plus engine actions that invalidate react-query after writing.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEntityDetail, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useAuth } from '../../../core/auth/AuthContext';
import type * as T from '../../../mock/data/types';
import type { VwChipVariant } from '../../../shared/components/ux';
import { PEOPLE } from '../../../mock/db/seed/ctx';
import { PROCESS_BY_KEY, nodeById } from '../../../workorders/model';
import {
  cancelInstance, claimTask, completeTask, getParsed, loadBpmnXml, retryIncident, startInstance,
  type CompleteOptions, type ParsedProcess, type StartRecord,
} from './engine';

export const WF_ENTITIES = ['processDefinitions', 'processInstances', 'flowNodeInstances', 'userTasks', 'engineIncidents'] as const;
const BIG = { pageSize: 10_000 };

export const useDefinitions = () => (useEntityList('processDefinitions', { pageSize: 100, sortField: 'key' }).data?.data ?? []) as unknown as T.ProcessDefinition[];
export const useInstances = () => (useEntityList('processInstances', BIG).data?.data ?? []) as unknown as T.ProcessInstance[];
export const useInstance = (id?: string) => (useEntityDetail('processInstances', id).data ?? undefined) as unknown as T.ProcessInstance | undefined;
export const useUserTasks = () => (useEntityList('userTasks', BIG).data?.data ?? []) as unknown as T.ProcessUserTask[];
export const useFlowNodeInstances = () => (useEntityList('flowNodeInstances', BIG).data?.data ?? []) as unknown as T.FlowNodeInstance[];
export const useEngineIncidents = () => (useEntityList('engineIncidents', BIG).data?.data ?? []) as unknown as T.EngineIncident[];
export const useDataCenters = () => (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as T.DataCenter[];

export function useBpmnXml(key?: string) {
  return useQuery({ queryKey: ['bpmnXml', key], queryFn: () => loadBpmnXml(key!), enabled: !!key, staleTime: Infinity });
}
export function useParsedProcess(key?: string) {
  return useQuery<ParsedProcess>({ queryKey: ['bpmnParsed', key], queryFn: () => getParsed(key!), enabled: !!key, staleTime: Infinity });
}

/** The signed-in user's name and their role in the PEOPLE cast (for the inbox default filter). */
export function useActor() {
  const { user } = useAuth();
  const name = user?.name ?? 'Operator';
  const role = PEOPLE.find((p) => p.name === name)?.role;
  return { name, role };
}

/** Engine actions that write through MockDB and invalidate the workflow queries. */
export function useEngineActions() {
  const qc = useQueryClient();
  const { name: actor } = useActor();
  const invalidate = useCallback(() => { for (const k of WF_ENTITIES) void qc.invalidateQueries({ queryKey: [k] }); }, [qc]);
  return useMemo(() => ({
    completeTask: async (taskId: string, variables: Record<string, unknown>, opts?: CompleteOptions) => { const r = await completeTask(taskId, variables, actor, opts); invalidate(); return r; },
    startInstance: async (definitionKey: string, businessKey: string, record: StartRecord) => { const r = await startInstance(definitionKey, businessKey, record, actor); invalidate(); return r; },
    retryIncident: async (engineIncidentId: string) => { const r = await retryIncident(engineIncidentId, actor); invalidate(); return r; },
    cancelInstance: (instanceId: string, reason?: string) => { const r = cancelInstance(instanceId, actor, reason); invalidate(); return r; },
    claimTask: (taskId: string) => { claimTask(taskId, actor); invalidate(); },
  }), [actor, invalidate]);
}

// ── Presentation helpers ──────────────────────────────────────────────────────
export const STATE_TONE: Record<T.ProcessInstanceState, VwChipVariant> = { active: 'info', completed: 'success', incident: 'error', cancelled: 'neutral' };
export const STATE_LABEL: Record<T.ProcessInstanceState, string> = { active: 'Running', completed: 'Completed', incident: 'Incident', cancelled: 'Cancelled' };
export const RECORD_LABEL: Record<T.ProcessRecordType, string> = { incident: 'Incident', changeRequest: 'Change', workOrder: 'Work order', project: 'Project', dataCenter: 'Site', device: 'Device', customer: 'Customer', plannerPlan: 'Plan' };
/** Default process for a record type (used when a record page offers "Start process"). */
export const DEFAULT_PROCESS: Record<T.ProcessRecordType, string> = { incident: 'major-incident', changeRequest: 'change', workOrder: 'work-order', project: 'hall-fitout', dataCenter: 'site-onboarding', device: 'reconciliation', customer: 'customer-onboarding', plannerPlan: 'capacity-expansion' };

export function recordPath(recordType: T.ProcessRecordType, recordId: string): string {
  switch (recordType) {
    case 'incident': return `/incidents/${recordId}`;
    case 'changeRequest': return `/changes?id=${recordId}`;
    case 'workOrder': return '/build';
    case 'project': return `/delivery/projects/${recordId}`;
    case 'dataCenter': return `/datacenters/${recordId}`;
    case 'device': return `/facility/devices/${recordId}`;
    case 'plannerPlan': return `/planning/plans/${recordId}`;
    case 'customer': return `/customers/${recordId}`;
  }
}

export const HOUR = 3_600_000;
export const hoursBetween = (a: string, b: string | number = Date.now()) => (new Date(b).getTime() - new Date(a).getTime()) / HOUR;

export function fmtHours(h: number | undefined): string {
  if (h == null || !Number.isFinite(h)) return '—';
  const abs = Math.abs(h);
  if (abs < 1) return `${Math.round(abs * 60)} min`;
  if (abs < 48) return `${abs.toFixed(abs < 10 ? 1 : 0)} h`;
  return `${(abs / 24).toFixed(1)} d`;
}
export const fmtAgo = (iso: string) => `${fmtHours(hoursBetween(iso))} ago`;
export function fmtDue(iso: string): { text: string; overdue: boolean } {
  const h = hoursBetween(iso) * -1; // positive = time left
  return h < 0 ? { text: `overdue ${fmtHours(-h)}`, overdue: true } : { text: `due in ${fmtHours(h)}`, overdue: false };
}
export const fmtDate = (iso?: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : '—');

export const processName = (key: string) => PROCESS_BY_KEY[key]?.name ?? key;
export const processPid = (key: string) => PROCESS_BY_KEY[key]?.pid ?? '';
export function elementName(definitionKey: string, elementId: string): string {
  const p = PROCESS_BY_KEY[definitionKey];
  const n = p ? nodeById(p, elementId) : undefined;
  if (n) return n.name;
  const b = p?.nodes.flatMap((x) => x.boundaries ?? []).find((x) => x.id === elementId);
  return b?.name ?? elementId;
}

/** Current step(s) and who the instance is waiting on. */
export function describeInstance(inst: T.ProcessInstance, tasks: T.ProcessUserTask[]): { step: string; waitingOn: string } {
  const open = tasks.filter((t) => t.instanceId === inst.id && t.state === 'created');
  if (inst.state === 'completed') return { step: 'Completed', waitingOn: '—' };
  if (inst.state === 'cancelled') return { step: 'Cancelled', waitingOn: '—' };
  const step = inst.currentElementIds.map((id) => elementName(inst.definitionKey, id)).join(' · ') || '—';
  if (inst.state === 'incident') return { step, waitingOn: 'Operator (engine incident)' };
  const who = open.map((t) => t.assignee ?? `${t.candidateRole} (unassigned)`);
  return { step, waitingOn: who.length ? Array.from(new Set(who)).join(', ') : 'System' };
}

export type MarkerKind = 'completed' | 'active' | 'incident' | 'taken';

/** Diagram markers for an instance: completed nodes, active/incident tokens and the sequence flows that were taken. */
export function instanceMarkers(inst: T.ProcessInstance | undefined, parsed: ParsedProcess | undefined): Record<string, MarkerKind> {
  if (!inst) return {};
  const m: Record<string, MarkerKind> = {};
  const completed = new Set(inst.completedElementIds);
  for (const id of completed) m[id] = 'completed';
  for (const id of inst.currentElementIds) m[id] = inst.state === 'incident' ? 'incident' : 'active';
  if (parsed) {
    const reached = new Set([...completed, ...inst.currentElementIds]);
    for (const f of Object.values(parsed.flows)) if (completed.has(f.sourceId) && reached.has(f.targetId)) m[f.id] = 'taken';
  }
  return m;
}

/** Mean cycle time (hours) of completed instances, optionally per process. */
export function cycleStats(instances: T.ProcessInstance[]): { count: number; avgHours?: number; p90Hours?: number } {
  const done = instances.filter((i) => i.state === 'completed' && i.endedAt).map((i) => hoursBetween(i.startedAt, i.endedAt!)).sort((a, b) => a - b);
  if (!done.length) return { count: 0 };
  const avg = done.reduce((a, b) => a + b, 0) / done.length;
  return { count: done.length, avgHours: avg, p90Hours: done[Math.min(done.length - 1, Math.floor(done.length * 0.9))] };
}

/** The process instance (latest first) bound to a record, with its definition and parsed BPMN. */
export function useProcessFor(recordType: T.ProcessRecordType, recordId: string | undefined) {
  const instances = useInstances();
  const tasks = useUserTasks();
  const instance = useMemo(() => instances.filter((i) => i.recordType === recordType && i.recordId === recordId).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0], [instances, recordType, recordId]);
  const parsed = useParsedProcess(instance?.definitionKey);
  const xml = useBpmnXml(instance?.definitionKey);
  const openTasks = useMemo(() => tasks.filter((t) => t.instanceId === instance?.id && t.state === 'created'), [tasks, instance?.id]);
  const summary = instance ? describeInstance(instance, tasks) : undefined;
  return { instance, definition: instance ? PROCESS_BY_KEY[instance.definitionKey] : undefined, parsed: parsed.data, xml: xml.data, openTasks, summary, markers: instanceMarkers(instance, parsed.data) };
}
