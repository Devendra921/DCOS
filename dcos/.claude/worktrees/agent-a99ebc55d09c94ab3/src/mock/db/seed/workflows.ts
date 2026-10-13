/**
 * Workflows seed — the mock Camunda 8 engine's state.
 *
 * One `processDefinitions` row per BPMN file, and `processInstances` bound to real records
 * (incidents → P04, change requests → P05, work orders → P10, fit-out projects → P02,
 * sites under construction → P01, a handful each for the rest). For every instance the
 * token position is derived from the record's status, and the completed path is the
 * shortest route from the start event to that node (model.pathTo), so the diagram, the
 * timeline, the inbox and the record agree. Timestamps are spaced by each node's expected
 * duration (model `hours`) with a deterministic jitter — no Math.random anywhere.
 *
 * The delivery chain seed (deliveryChain.ts, run last) replaces the change, work-order and
 * project instances placed here with ones that follow the chain (P05 per normal or emergency
 * change, P10 per work order, P12 per contractor visit, the template's process per project),
 * and registers the project process definitions. They are still placed here first so the
 * seeded random sequence the later modules see does not change.
 */
import type * as T from '../../data/types';
import { PEOPLE, type Seed } from './ctx';
import { PROCESSES, PROCESS_BY_KEY, nodeById, pathTo, outgoing, type WfProcess } from '../../../workorders/model';

type State = T.ProcessInstanceState;
export interface Placement {
  p: WfProcess; businessKey: string; recordType: T.ProcessRecordType; recordId: string; dataCenterId?: string;
  /** Flow node the token sits on (active / incident / cancelled) or the end event reached (completed). */
  at: string; state: State; message?: string; variables?: Record<string, unknown>; i: number;
}

const HOUR = 3_600_000;

export function seedWorkflows(S: Seed): void {
  const owner = S.byRole('Platform Owner');
  for (const p of PROCESSES.filter((x) => !x.pid.startsWith('PRJ'))) {
    const id = S.nid('PDEF');
    S.processDefinitions.push({ id, ...S.meta(owner), key: p.key, name: p.name, version: 1, owner: p.owner, description: p.description, specIds: p.specIds, lanes: p.lanes, bpmnKey: p.key });
  }

  let i = 0;
  const place = (pl: Omit<Placement, 'i'>) => { placeInstance(S, { ...pl, i: i++ }); };
  const dcOf = (id?: string) => S.dataCenters.find((d) => d.id === id);

  // ── P04 major incident — every incident, state by status ─────────────────
  const P04 = PROCESS_BY_KEY['major-incident'];
  S.incidents.slice(0, 60).forEach((inc, k) => {
    const sev12 = inc.severity === 'SEV1' || inc.severity === 'SEV2';
    const vars = { severity: inc.severity, impactLevel: S.cycle(['hall', 'rack', 'device', 'site'], k), premiumExposed: sev12, facility: inc.type, disruptive: k % 3 === 0, title: inc.title };
    const at: [string, State] = inc.status === 'Open' ? ['acknowledge', 'active']
      : inc.status === 'Investigating' ? ['rca', 'active']
      : inc.status === 'Mitigated' ? [S.cycle(['closure_checks', 'execute'], k), 'active']
      : inc.status === 'Resolved' ? (sev12 ? ['pir', 'active'] : ['end', 'completed'])
      : [sev12 ? 'end_pir' : 'end', 'completed'];
    place({ p: P04, businessKey: inc.incId, recordType: 'incident', recordId: inc.id, dataCenterId: inc.dataCenterId, at: at[0], state: at[1], variables: vars });
  });

  // ── P05 change — every change request, state by status ──────────────────
  const P05 = PROCESS_BY_KEY['change'];
  const CR_AT: Record<string, [string, State]> = {
    Draft: ['raise', 'active'], Submitted: ['approve', 'active'], UnderReview: ['approve', 'active'], Approved: ['schedule', 'active'],
    Scheduled: ['wait_window', 'active'], InProgress: ['implement', 'active'], Implemented: ['verify', 'active'], Closed: ['end', 'completed'],
    Rejected: ['end_rejected', 'completed'], Cancelled: ['approve', 'cancelled'], RolledBack: ['end_rolled_back', 'completed'],
  };
  S.changeRequests.slice(0, 80).forEach((cr, k) => {
    const [at, state] = CR_AT[cr.status] ?? ['raise', 'active'];
    const scopeSize = cr.affectedResourceIds.length;
    const vars = { title: cr.title, risk: cr.risk, scopeSize, premiumCustomers: cr.risk === 'High' || cr.risk === 'Critical' ? 1 + (k % 3) : 0, conflicts: cr.policyViolations.length > 0, openIncidents: cr.risk === 'Critical' ? 1 : 0, riskResult: { risk: cr.risk === 'Critical' ? 'High' : cr.risk, approvalPath: cr.risk === 'Low' ? 'Peer review' : cr.risk === 'Medium' ? 'Change manager' : 'CAB + Facilities Director' } };
    place({ p: P05, businessKey: cr.chgId, recordType: 'changeRequest', recordId: cr.id, dataCenterId: cr.dataCenterId, at, state, variables: vars });
  });

  // ── P10 work order — every work order, state by status ──────────────────
  const P10 = PROCESS_BY_KEY['work-order'];
  S.workOrders.slice(0, 80).forEach((wo, k) => {
    const rack = S.racks.find((r) => r.id === wo.rackId);
    const cr = S.changeRequests.find((c) => c.id === wo.changeRequestId);
    const [at, state]: [string, State] = wo.status === 'Assigned' ? ['accept', 'active'] : wo.status === 'InProgress' ? [S.cycle(['start_work', 'complete'], k), 'active']
      : wo.status === 'Validated' ? ['verify', 'active'] : ['end', 'completed'];
    place({ p: P10, businessKey: wo.woId, recordType: 'workOrder', recordId: wo.id, dataCenterId: rack?.dataCenterId ?? cr?.dataCenterId, at, state,
      variables: { title: `${wo.type} · ${rack?.name ?? 'rack TBC'}`, workType: wo.type, assignee: wo.assigneeName, skillResult: { skill: SKILL[wo.type] ?? 'General', permit: PERMIT[wo.type] ?? 'None' } } });
  });

  // ── P02 hall fit-out — fit-out / rack-deployment projects, state by maturity ──
  const P02 = PROCESS_BY_KEY['hall-fitout'];
  S.projects.filter((pr) => ['Hall Fit-out', 'Rack Deployment'].includes(S.projectMeta.get(pr.id)?.template ?? '')).forEach((pr, k) => {
    const m = S.projectMeta.get(pr.id)?.maturity ?? 0;
    let at = m === 0 ? 'design_review' : m === 1 ? 'approve_pos' : m === 2 ? S.cycle(['receive_stage', 'install'], k) : m === 3 ? 'commission' : 'handover';
    let state: State = 'active'; let message: string | undefined;
    if (pr.status === 'Completed') { at = 'end'; state = 'completed'; }
    else if ((pr.status === 'At Risk' || pr.status === 'Blocked') && m >= 2) { at = 'provision'; state = 'incident'; message = 'Provisioning job failed: 3 of 14 devices unreachable on OOB after 3 retries — check console server uplink.'; }
    else if (pr.status === 'On Hold') { state = 'cancelled'; }
    place({ p: P02, businessKey: pr.projId, recordType: 'project', recordId: pr.id, dataCenterId: pr.dataCenterId, at, state, message, variables: { title: pr.name, defects: m === 3 ? 2 + (k % 4) : 0, budget: pr.budget, rag: pr.rag } });
  });

  // ── P01 site onboarding — sites under construction active, two live sites completed ──
  const P01 = PROCESS_BY_KEY['site-onboarding'];
  S.dataCenters.filter((d) => d.status === 'Construction').forEach((dc, k) => {
    place({ p: P01, businessKey: dc.dcId, recordType: 'dataCenter', recordId: dc.id, dataCenterId: dc.id, at: S.cycle(['audit_walk', 'run_discovery', 'resolve_exceptions'], k), state: 'active', variables: { title: dc.name, exceptions: 3 + k, approved: true } });
  });
  S.dataCenters.filter((d) => d.status !== 'Construction').slice(0, 2).forEach((dc) => {
    place({ p: P01, businessKey: dc.dcId, recordType: 'dataCenter', recordId: dc.id, dataCenterId: dc.id, at: 'end', state: 'completed', variables: { title: dc.name, exceptions: 0, approved: true } });
  });
  // one onboarding stuck on a collector incident
  const stuck = S.dataCenters.find((d) => d.status !== 'Construction' && !S.processInstances.some((pi) => pi.recordId === d.id));
  if (stuck) place({ p: P01, businessKey: stuck.dcId, recordType: 'dataCenter', recordId: stuck.id, dataCenterId: stuck.id, at: 'run_discovery', state: 'incident', message: 'Discovery job timed out: SNMP collector 10.40.2.17 unreachable (3 retries). Check the collector VM and the OOB firewall rule.', variables: { title: stuck.name, approved: true } });

  // ── The rest — a handful each, cycling through varied states ────────────
  const spread = (p: WfProcess, items: { businessKey: string; recordType: T.ProcessRecordType; recordId: string; dataCenterId?: string; title: string; vars?: Record<string, unknown> }[], plan: { at: string; state?: State; message?: string }[]) => {
    items.forEach((it, k) => {
      const step = S.cycle(plan, k);
      place({ p, businessKey: it.businessKey, recordType: it.recordType, recordId: it.recordId, dataCenterId: it.dataCenterId, at: step.at, state: step.state ?? 'active', message: step.message, variables: { title: it.title, ...it.vars } });
    });
  };
  const custItems = S.customers.slice(0, 6).map((c, k) => ({ businessKey: c.custId, recordType: 'customer' as const, recordId: c.id, dataCenterId: S.cycle(S.dataCenters, k * 2).id, title: c.name, vars: { premium: c.premium, approved: true } }));
  spread(PROCESS_BY_KEY['customer-onboarding'], custItems, [{ at: 'placement_approval' }, { at: 'install' }, { at: 'access_grant' }, { at: 'end', state: 'completed' }, { at: 'go_live' }, { at: 'end', state: 'completed' }]);

  const capItems = S.dataCenters.slice(0, 5).map((dc, k) => ({ businessKey: dc.dcId, recordType: 'dataCenter' as const, recordId: dc.id, dataCenterId: dc.id, title: `${dc.name} — power forecast at ${82 + k * 3}% in 9 months`, vars: { amount: [48_000, 180_000, 620_000, 1_400_000, 95_000][k % 5], approverRole: ['Capacity Planner', 'Finance Manager', 'Facilities Director', 'Executive', 'Finance Manager'][k % 5], approved: k !== 2 } }));
  spread(PROCESS_BY_KEY['capacity-expansion'], capItems, [{ at: 'choose_option' }, { at: 'approve_budget' }, { at: 'rework' }, { at: 'end', state: 'completed' }, { at: 'whatif', state: 'incident', message: 'What-if job failed: forecast series missing for hall H2 (no PUE samples in the last 30 days).' }]);

  const netDevices = S.devices.filter((d) => ['Switch', 'Router', 'Firewall'].includes(d.category ?? '')).slice(0, 5);
  const fwItems = netDevices.map((d, k) => ({ businessKey: d.devcId, recordType: 'device' as const, recordId: d.id, dataCenterId: d.dataCenterId, title: `CVE-2026-${1180 + k} — ${d.model ?? 'switch'} firmware ${k % 2 ? '9.3(12)' : '10.2(4)'}`, vars: { remainingWaves: 3 - (k % 3), approved: true, wave: 1 + (k % 3) } }));
  spread(PROCESS_BY_KEY['firmware-campaign'], fwItems, [{ at: 'approve_wave' }, { at: 'push', state: 'incident', message: 'Push failed on 2 of 12 devices: image checksum mismatch after transfer — re-stage image on the TFTP server.' }, { at: 'verify' }, { at: 'end', state: 'completed' }, { at: 'hands_on' }]);

  const oldDevices = S.devices.filter((d) => d.lifecycleState === 'Retired' || d.lifecycleState === 'Disposed' || d.status === 'Decommissioning').slice(0, 6);
  const decItems = (oldDevices.length ? oldDevices : S.devices.slice(20, 26)).map((d, k) => ({ businessKey: d.devcId, recordType: 'device' as const, recordId: d.id, dataCenterId: d.dataCenterId, title: `Retire ${d.name}`, vars: { blocked: k % 2 === 1, approved: true } }));
  spread(PROCESS_BY_KEY['decommission'], decItems, [{ at: 'request' }, { at: 'resolve_blockers' }, { at: 'wipe' }, { at: 'remove' }, { at: 'close_contracts' }, { at: 'end', state: 'completed' }]);

  const recItems = S.devices.slice(40, 48).map((d, k) => ({ businessKey: d.devcId, recordType: 'device' as const, recordId: d.id, dataCenterId: d.dataCenterId, title: `${S.cycle(['Serial mismatch', 'Not found in rack', 'Unexpected device in U', 'Port count differs'], k)} — ${d.name}`, vars: { decision: S.cycle(['accept', 'walk', 'keep'], k) } }));
  spread(PROCESS_BY_KEY['reconciliation'], recItems, [{ at: 'decide' }, { at: 'walk' }, { at: 'end', state: 'completed' }, { at: 'decide' }, { at: 'end', state: 'completed' }, { at: 'decide', state: 'cancelled' }, { at: 'walk' }, { at: 'end', state: 'completed' }]);

  const mwItems = S.maintenanceWindows.slice(0, 6).map((mw, k) => {
    const dev = S.devices.find((d) => d.id === mw.affectedDeviceIds?.[0]);
    const rec = dev ? { recordType: 'device' as const, recordId: dev.id, businessKey: dev.devcId } : { recordType: 'dataCenter' as const, recordId: mw.dataCenterId ?? S.dataCenters[0].id, businessKey: dcOf(mw.dataCenterId)?.dcId ?? mw.mwId };
    return { ...rec, dataCenterId: mw.dataCenterId, title: mw.title, vars: { maintenanceWindowId: mw.id, impact: mw.impact, approved: k !== 1 } };
  });
  spread(PROCESS_BY_KEY['maintenance-mode'], mwItems, [{ at: 'approve_window' }, { at: 'reschedule' }, { at: 'wait' }, { at: 'perform' }, { at: 'record' }, { at: 'end', state: 'completed' }]);

  const accItems = S.customers.slice(3, 9).map((c, k) => ({ businessKey: c.custId, recordType: 'customer' as const, recordId: c.id, dataCenterId: S.cycle(S.dataCenters, k * 3 + 1).id, title: `${c.name} — ${S.cycle(['rack audit', 'hardware swap', 'cabling works', 'cage inspection'], k)}`, vars: { zones: S.cycle([['Hall 1'], ['Hall 2', 'MMR'], ['Loading bay', 'Hall 1']], k), approved: k !== 5 } }));
  spread(PROCESS_BY_KEY['access-request'], accItems, [{ at: 'approve_zones' }, { at: 'check_in' }, { at: 'escorted' }, { at: 'check_out' }, { at: 'end', state: 'completed' }, { at: 'end_denied', state: 'completed' }]);
}

const SKILL: Record<string, string> = { RackInstall: 'Rigging & rack assembly', Cabling: 'Structured cabling (fibre & copper)', PowerConnect: 'Licensed electrician', DeviceDeploy: 'Device install & bring-up' };
const PERMIT: Record<string, string> = { RackInstall: 'Lifting / manual handling', Cabling: 'None', PowerConnect: 'Electrical work permit (LOTO)', DeviceDeploy: 'Change window ticket' };

/** Set the variables that make the path's gateway decisions true (`=approved = true` → approved: true, `=x > 0` → x: 1). */
function varsForPath(p: WfProcess, path: string[], vars: Record<string, unknown>): void {
  for (let k = 0; k + 1 < path.length; k++) {
    const node = nodeById(p, path[k]);
    if (node?.type !== 'exclusiveGateway') continue;
    const flow = outgoing(p, path[k]).find((f) => f[1] === path[k + 1]);
    const cond = flow?.[3];
    if (!cond) continue;
    const m = cond.replace(/^=/, '').split(/\s+or\s+/)[0].trim().match(/^([A-Za-z_]\w*)\s*(=|>|<)\s*(.+)$/);
    if (!m) continue;
    const [, name, op, raw] = m;
    const r = raw.trim();
    if (op === '=') vars[name] = r === 'true' ? true : r === 'false' ? false : /^-?\d+$/.test(r) ? Number(r) : r.replace(/^"(.*)"$/, '$1');
    else if (op === '>') vars[name] = Number(r) + 1;
    else vars[name] = Math.max(0, Number(r) - 1);
  }
}

/** Place one instance on the model graph (path, timestamps, tasks) and return its id. */
export function placeInstance(S: Seed, pl: Placement): string {
  const { p } = pl;
  const path = pathTo(p, pl.at);
  const terminal = pl.state === 'completed';
  const completed = terminal ? [...path] : path.slice(0, -1);
  // parallel branches not on the shortest path are completed too
  for (const id of [...completed]) {
    const n = nodeById(p, id);
    if (n?.type === 'parallelGateway' && outgoing(p, id).length > 1) for (const f of outgoing(p, id)) if (!completed.includes(f[1]) && path.includes(f[1]) === false) completed.push(f[1]);
  }
  // boundary events that were taken on the path
  const boundaryIds: string[] = [];
  for (let k = 0; k + 1 < path.length; k++) {
    const n = nodeById(p, path[k]);
    const b = n?.boundaries?.find((x) => x.to === path[k + 1]);
    if (b && !outgoing(p, path[k]).some((f) => f[1] === path[k + 1])) boundaryIds.push(b.id);
  }
  const variables: Record<string, unknown> = { businessKey: pl.businessKey, ...(pl.variables ?? {}) };
  varsForPath(p, path, variables);

  const instId = S.nid('PI');
  const jitter = () => S.int(50, 125) / 100; // ~75% of tasks land inside their due window
  // durations (ms) per completed node
  const durations = new Map<string, number>();
  let total = 0;
  for (const id of completed) { const n = nodeById(p, id); const d = Math.round((n?.hours ?? 0) * jitter() * HOUR); durations.set(id, d); total += d; }
  const active = terminal ? undefined : nodeById(p, pl.at);
  const elapsedActive = active ? Math.round(Math.max(0.1, active.hours) * (S.int(15, 170) / 100) * HOUR) : 0;
  const endedAgo = terminal || pl.state === 'cancelled' ? S.int(2, 45 * 24) * HOUR : 0;
  const startedMs = S.now - endedAgo - total - elapsedActive;
  const by = S.byRole(p.laneRoles[p.nodes[0].lane]);

  // flow node instances along the completed path, in path order (parallel extras appended)
  let t = startedMs;
  const ordered = [...path.filter((id) => completed.includes(id)), ...completed.filter((id) => !path.includes(id))];
  for (const id of ordered) {
    const n = nodeById(p, id)!;
    const d = durations.get(id) ?? 0;
    const role = p.laneRoles[n.lane];
    const assignee = n.type === 'userTask' ? pickPerson(S, role, t).name : undefined;
    const started = new Date(t).toISOString(), ended = new Date(t + d).toISOString();
    const fid = S.nid('FNI');
    S.flowNodeInstances.push({ id: fid, ...S.meta(by), instanceId: instId, elementId: id, elementName: n.name, type: n.type, state: 'completed', startedAt: started, endedAt: ended, assignee });
    if (n.type === 'userTask') {
      const utid = S.nid('UT');
      S.userTasks.push({ id: utid, ...S.meta(by), instanceId: instId, elementId: id, name: n.name, formKey: n.formKey ?? 'approve', candidateRole: role, assignee, dueAt: new Date(t + n.hours * HOUR).toISOString(), state: 'completed', completedAt: ended });
    }
    if (path.includes(id)) t += d;
  }
  for (const bid of boundaryIds) {
    const host = p.nodes.find((n) => n.boundaries?.some((b) => b.id === bid))!;
    const b = host.boundaries!.find((x) => x.id === bid)!;
    const fni = S.flowNodeInstances.filter((f) => f.instanceId === instId && f.elementId === host.id).at(-1);
    S.flowNodeInstances.push({ id: S.nid('FNI'), ...S.meta(by), instanceId: instId, elementId: bid, elementName: b.name, type: `boundary:${b.kind}`, state: 'completed', startedAt: fni?.endedAt ?? new Date(t).toISOString(), endedAt: fni?.endedAt ?? new Date(t).toISOString() });
  }

  const current: string[] = [];
  if (active) {
    const role = p.laneRoles[active.lane];
    const started = new Date(t).toISOString();
    const fstate: T.FlowNodeState = pl.state === 'incident' ? 'incident' : pl.state === 'cancelled' ? 'terminated' : 'active';
    const assigned = active.type === 'userTask' && S.chance(0.65) ? pickPerson(S, role, t).name : undefined;
    S.flowNodeInstances.push({ id: S.nid('FNI'), ...S.meta(by), instanceId: instId, elementId: active.id, elementName: active.name, type: active.type, state: fstate, startedAt: started, endedAt: pl.state === 'cancelled' ? new Date(S.now - endedAgo).toISOString() : undefined, assignee: assigned });
    if (active.type === 'userTask' && pl.state !== 'cancelled') {
      S.userTasks.push({ id: S.nid('UT'), ...S.meta(by), instanceId: instId, elementId: active.id, name: active.name, formKey: active.formKey ?? 'approve', candidateRole: role, assignee: assigned, dueAt: new Date(t + active.hours * HOUR).toISOString(), state: 'created' });
    }
    if (pl.state === 'incident') {
      S.engineIncidents.push({ id: S.nid('EINC'), ...S.meta(by), createdAt: new Date(t + Math.min(elapsedActive, 20 * 60_000)).toISOString(), instanceId: instId, elementId: active.id, message: pl.message ?? `Job ${active.taskType ?? active.id} failed after 3 retries.` });
    }
    if (pl.state !== 'cancelled') current.push(active.id);
    // the non-interrupting boundary timer may already have fired on an overdue task
    if (pl.state === 'active' && elapsedActive > active.hours * HOUR && active.boundaries?.some((b) => b.kind === 'timer' && b.nonInterrupting)) {
      const b = active.boundaries.find((x) => x.kind === 'timer' && x.nonInterrupting)!;
      const target = nodeById(p, b.to)!;
      S.flowNodeInstances.push({ id: S.nid('FNI'), ...S.meta(by), instanceId: instId, elementId: b.id, elementName: b.name, type: 'boundary:timer', state: 'completed', startedAt: started, endedAt: new Date(t + active.hours * HOUR).toISOString() });
      S.flowNodeInstances.push({ id: S.nid('FNI'), ...S.meta(by), instanceId: instId, elementId: target.id, elementName: target.name, type: target.type, state: 'active', startedAt: new Date(t + active.hours * HOUR).toISOString() });
      if (target.type === 'userTask') S.userTasks.push({ id: S.nid('UT'), ...S.meta(by), instanceId: instId, elementId: target.id, name: target.name, formKey: target.formKey ?? 'approve', candidateRole: p.laneRoles[target.lane], dueAt: new Date(t + (active.hours + target.hours) * HOUR).toISOString(), state: 'created' });
      current.push(target.id);
      completed.push(b.id);
    }
  }

  const endedAt = terminal || pl.state === 'cancelled' ? new Date(S.now - endedAgo).toISOString() : undefined;
  S.processInstances.push({
    id: instId, ...S.meta(by), createdAt: new Date(startedMs).toISOString(),
    definitionKey: p.key, businessKey: pl.businessKey, recordType: pl.recordType, recordId: pl.recordId, dataCenterId: pl.dataCenterId,
    state: pl.state, startedAt: new Date(startedMs).toISOString(), endedAt, currentElementIds: current, completedElementIds: [...completed, ...boundaryIds], variables,
  });
  return instId;
}

/** Someone holding `role`, rotated by time so repeated tasks spread across the team. */
function pickPerson(S: Seed, role: string, t: number) {
  const pool = PEOPLE.filter((x) => x.role === role);
  if (!pool.length) return S.byRole(role);
  return pool[Math.floor(t / HOUR) % pool.length];
}
