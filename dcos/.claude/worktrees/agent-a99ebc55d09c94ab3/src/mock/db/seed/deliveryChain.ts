/**
 * DCOS seed — the delivery chain: plan → programme → project → work order → change request.
 *
 * Runs last (after the planner), mutating earlier records in place and appending new ones so
 * no id is renumbered:
 *   1. Standard change templates (ten active, one suspended after a failure) and change
 *      freezes (year-end estate freeze, a past quarter-end freeze, a site freeze around the
 *      Dallas UPS cut-in, a customer go-live freeze at the GPU site).
 *   2. The planner's migration programme gets its Migration Wave project.
 *   3. Every project that can run has its template's process (PROCESS_FOR_TEMPLATE) at a
 *      believable step; blocked phases wait for their predecessors. Milestones carry the
 *      template's names and follow the process.
 *   4. Every existing change request gets a class, its work order (one each) and its place in
 *      the chain — the work step of a project, a programme, or an operational change outside
 *      any project (no projectId / programId; it still has its work order).
 *   5. Each project's completed work steps have their (closed) work orders, and the step it is
 *      waiting on has a mix: standard (auto-approved), normal in approval, approved, scheduled
 *      with windows, in progress, implemented awaiting review, closed with review.
 *   6. Changes whose window falls in a freeze are flagged (or are emergencies).
 *   7. Processes: P05 per normal or emergency change, P10 per work order, P12 per contractor
 *      visit, replacing the instances the workflows seed placed for these records.
 */
import type * as T from '../../data/types';
import type * as E from '../../data/enums';
import { PEOPLE, type Person, type Seed } from './ctx';
import { placeInstance } from './workflows';
import { PROCESSES, PROCESS_BY_KEY, nodeById } from '../../../workorders/model';
import { PROCESS_FOR_TEMPLATE, isWorkWait, mainPath, milestoneStates, planWorkForStep } from '../../../modules/delivery/lib/projectProcess';
import { TEMPLATE_REGISTRY } from '../../../modules/delivery/lib/projectTemplates';
import { contractorFor, draftToInput, nextChangeBoard, planRaiseWorkOrder, technicianFor } from '../../../modules/delivery/lib/chainOps';
import { freezeFor } from '../../../modules/delivery/lib/chainRules';

type CS = E.ChangeStatus;
type WS = E.WorkOrderStatus;
const DAY = 864e5, HOUR = 36e5;
const OPEN: CS[] = ['Draft', 'Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress'];
const ROLE_PERSON: Record<string, string> = { FacilityManager: 'Facilities Director', ChangeApprover: 'NOC Lead', CapacityPlanner: 'Capacity Planner', NetworkEngineer: 'Network Engineer', NOCOperator: 'NOC Lead', Executive: 'Executive', DeliveryManager: 'Program Manager', ComplianceAuditor: 'Compliance Manager', Administrator: 'Administrator', FieldTechnician: 'Field Technician' };
const CR_WO_TYPE: Record<E.ChangeType, E.WorkOrderType> = { RackDeploy: 'RackInstall', VLANProvision: 'Configuration', PowerUpgrade: 'PowerConnect', ServerRelocation: 'Migration', NetworkMigration: 'Cabling', Decommission: 'DeviceRemoval', ConfigPush: 'Configuration' };
const PLANS: Record<E.ChangeType, { impl: string; test: string }> = {
  RackDeploy: { impl: 'Install and secure the equipment to the rack elevation; dress cables; label both ends; update the record.', test: 'Power-on checks, link lights and the record matches the rack.' },
  VLANProvision: { impl: 'Create the VLAN and prefix from IPAM; trunk it to the listed ports.', test: 'Gateway reachable from a test host; no change on other VLANs.' },
  PowerUpgrade: { impl: 'Isolate the circuit under permit; install or connect; re-energise and record the readings.', test: 'Phase readings within limits; both feeds live; alarms clear at the BMS.' },
  ServerRelocation: { impl: 'Shut down gracefully; move under custody; re-rack in the target position; restore power and network.', test: 'Service owner confirms the service; monitoring green.' },
  NetworkMigration: { impl: 'Move the links one by one in the window following the cut-over sheet.', test: 'Routing converged; no loss on the monitored paths for 30 minutes.' },
  Decommission: { impl: 'Confirm nothing depends on the equipment; power down; disconnect; remove under custody.', test: 'Ports and feeds free in the record; equipment tagged for disposal.' },
  ConfigPush: { impl: 'Back up the running configuration; push the change; save.', test: 'Compliance check passes; neighbours and services up.' },
};

export function seedDeliveryChain(S: Seed): void {
  const iso = (ms: number) => new Date(ms).toISOString();
  const ms = (s: string) => new Date(s).getTime();
  const dcOf = (id?: string) => S.dataCenters.find((d) => d.id === id);
  const noc = S.byRole('NOC Lead'), fac = S.byRole('Facilities Director'), pmgr = S.byRole('Project Manager'), net = S.byRole('Network Engineer'), sec = S.byRole('Security Manager'), field = S.byRole('Field Technician'), cx = S.byRole('Commissioning Engineer');

  // ── 1. Standard change templates ───────────────────────────────────────────
  const std = (name: string, description: string, workTypes: E.WorkOrderType[], changeType: E.ChangeType, limits: T.StandardChangeTemplate['limits'], steps: string[], backout: string, owner: Person, approvedDaysAgo: number, used: number, extra: Partial<T.StandardChangeTemplate> = {}): T.StandardChangeTemplate => {
    const id = S.nid('STD');
    const approvedAt = S.daysAgo(approvedDaysAgo);
    const t: T.StandardChangeTemplate = { id, stdId: id, ...S.meta(owner), name, description, workTypes, changeType, limits, steps, backout, owner: owner.name, approvedAt, reviewDue: iso(ms(approvedAt) + 365 * DAY), status: 'Active', usedCount: used, failedCount: 0, ...extra };
    S.standardChangeTemplates.push(t);
    return t;
  };
  const live = { criticalServicesAllowed: false, liveSiteAllowed: true };
  std('Rack and stack up to 10 kW', 'Install a rack or equipment into a rack position the capacity plan has reserved, adding no more than 10 kW and touching no critical service.', ['RackInstall'], 'RackDeploy', { maxKw: 10, ...live }, ['Check the reservation and the rack elevation', 'Install rails and equipment; fit blanking panels', 'Label both ends of every cable', 'Update the rack record and photos'], 'Remove the equipment and return the position to its reserved state.', fac, 210, 64);
  std('Patching in existing panels', 'Patch copper or fibre between existing patch panels and equipment ports; no new cabling routes.', ['Cabling'], 'RackDeploy', { maxDevices: 24, ...live }, ['Check both ports are free in the record', 'Patch and label', 'Test the link', 'Update the cable record'], 'Remove the patch leads and free the ports in the record.', net, 180, 141);
  std('PDU outlet connection up to 5 kW', 'Connect equipment to free outlets of an existing rack PDU, within the PDU and breaker budget and no more than 5 kW.', ['PowerConnect'], 'PowerUpgrade', { maxKw: 5, ...live }, ['Check outlet and breaker headroom in DCIM', 'Connect A and B feeds to opposite PDUs', 'Read the load on both feeds', 'Update the power record'], 'Disconnect the equipment and restore the outlet assignment.', fac, 160, 97);
  std('New server burn-in', 'Run the standard burn-in on new servers that carry no production service yet.', ['Commissioning'], 'RackDeploy', { ...live }, ['Boot the burn-in image', 'Run 24 h stress and memory tests', 'Record results against the work order', 'Hand passing nodes to provisioning'], 'Power the nodes down and return them to the vendor if they fail.', cx, 120, 38);
  std('Firmware within the maintenance policy', 'Apply a vendor firmware release that the maintenance policy already approves, to no more than 20 devices with redundancy in place.', ['Configuration'], 'ConfigPush', { maxDevices: 20, ...live }, ['Confirm the release is on the approved list', 'Drain or fail over each device', 'Apply and reboot one side at a time', 'Verify and restore traffic'], 'Boot the previous image from the alternate partition.', net, 95, 56);
  std('Cable test and certification', 'Test and certify installed copper and fibre links; nothing is moved or re-patched.', ['Inspection'], 'ConfigPush', { ...live }, ['Test each link to the standard', 'Attach the certification report', 'Raise snags for failed links'], 'Nothing to back out (read-only test).', net, 300, 72);
  std('Removal of decommissioned equipment', 'Remove equipment that is already powered down and released in the record, up to 40 items.', ['DeviceRemoval'], 'Decommission', { maxDevices: 40, ...live }, ['Check the record shows the equipment as released', 'Remove and tag under chain of custody', 'Free the rack units and ports in the record'], 'Re-rack the equipment in its recorded position.', fac, 140, 49);
  std('Secure media collection', 'Hand sanitised or sealed media to the disposal vendor under chain of custody.', ['Disposal'], 'Decommission', { ...live }, ['Count and seal the media bags', 'Sign the custody form with the vendor', 'Attach the collection note'], 'Keep the media in the secure store until the vendor returns.', sec, 200, 22);
  std('Like-for-like device install', 'Replace or add a device of an approved model in an existing position: up to 4 devices and 3 kW.', ['DeviceDeploy'], 'RackDeploy', { maxKw: 3, maxDevices: 4, ...live }, ['Check the model is on the approved list', 'Install and connect to the recorded ports', 'Apply the golden configuration', 'Verify and update the record'], 'Remove the new device and reconnect the old one.', fac, 75, 83);
  std('Cross-connect and circuit turn-up', 'Order and patch a cross-connect in the meet-me room and turn up the circuit on a free port.', ['CircuitTurnUp'], 'NetworkMigration', { maxDevices: 2, ...live }, ['Check the LOA/CFA', 'Patch the cross-connect', 'Turn up and test the circuit', 'Update the circuit record'], 'Shut the port and cease the cross-connect.', net, 60, 31);
  const suspended = std('Rack PDU swap on a dual-fed rack', 'Swap one rack PDU while the other feed carries the load (dual-corded equipment only).', ['PowerConnect'], 'PowerUpgrade', { maxKw: 10, ...live }, ['Confirm every device is dual-corded', 'Move the load to the B feed', 'Swap the A-side PDU', 'Restore and balance the load'], 'Reconnect the original PDU.', fac, 250, 23, { status: 'Suspended', failedCount: 1, lastFailureAt: S.daysAgo(9) });

  // ── 2. Change freezes ──────────────────────────────────────────────────────
  const freeze = (name: string, dc: T.DataCenter | undefined, start: string, end: string, reason: string, owner: Person, allows: T.ChangeFreeze['allows'] = 'Emergency only'): T.ChangeFreeze => {
    const id = S.nid('FRZ');
    const f: T.ChangeFreeze = { id, frzId: id, ...S.meta(owner), name, dataCenterId: dc?.id, start, end, reason, allows, owner: owner.name };
    S.changeFreezes.push(f);
    return f;
  };
  const year = new Date(S.now).getUTCFullYear();
  const ye0 = Date.UTC(year, 11, 15) > S.now ? Date.UTC(year, 11, 15) : Date.UTC(year + 1, 11, 15);
  freeze('Year-end change freeze', undefined, iso(ye0), iso(ye0 + 20 * DAY), 'Peak trading for our customers and reduced staffing over the holidays. Only emergency changes, approved by the emergency board.', noc);
  const qEnd = freeze('Quarter-end close freeze', undefined, S.daysAgo(10), S.daysAgo(6), 'Finance quarter-end close: no planned change to systems that carry billing or ERP traffic.', noc);
  const cutIn = S.changeRequests.find((c) => c.plannerPlanId && /cut-in/i.test(c.title));
  const cutInFreeze = cutIn?.scheduledStart && cutIn.scheduledEnd ? freeze(`UPS cut-in freeze — ${dcOf(cutIn.dataCenterId)?.code ?? 'site'}`, dcOf(cutIn.dataCenterId), iso(ms(cutIn.scheduledStart) - 12 * HOUR), iso(ms(cutIn.scheduledEnd) + 12 * HOUR), 'The site runs at N on maintenance bypass during the UPS cut-in; no other change may touch power or cooling at the site.', fac) : undefined;
  const gpuDc = S.dataCenters.find((d) => S.dcProfile.get(d.id)?.key === 'ai-gpu-factory');
  freeze(`Customer go-live freeze — ${gpuDc?.code ?? 'GPU site'}`, gpuDc, S.daysAhead(3), S.daysAhead(6), 'The anchor tenant launches its training cluster; the site stays stable for the launch window.', fac);

  // ── 3. The planner's migration programme gets its project ─────────────────
  const migProg = S.programs.find((p) => p.plannerPlanId && p.projectCount === 0);
  if (migProg) {
    const waveCrs = S.changeRequests.filter((c) => c.plannerPlanId === migProg.plannerPlanId && c.plannerWaveId);
    const projId = S.nid('PROJ');
    const owner = S.byRole('Project Manager');
    const proj: T.Project = { id: projId, projId, ...S.meta(owner), programId: migProg.id, name: `${migProg.name} — workload moves`, status: 'Active', rag: 'Amber', managerName: migProg.ownerName, dataCenterId: waveCrs[0]?.dataCenterId, plannedStart: migProg.startDate, plannedEnd: migProg.endDate, percentComplete: 45, budget: migProg.budget, actualSpend: Math.round(migProg.budget * 0.4), template: 'Migration Wave', plannerPlanId: migProg.plannerPlanId, notes: JSON.stringify({ waves: waveCrs.length, movingWhat: 'Services and their servers' }) } as T.Project;
    S.projects.push(proj);
    S.projectMeta.set(projId, { maturity: 2, template: 'Migration Wave', budget: proj.budget });
    migProg.projectCount = 1;
    TEMPLATE_REGISTRY['Migration Wave'].milestones.forEach((name, k) => { const id = S.nid('MS'); S.milestones.push({ id, msId: id, ...S.meta(owner), projectId: projId, name, dueDate: S.daysAhead(k * 10 - 20), status: 'Not Started', rag: 'Grey' }); });
    for (const c of waveCrs) { c.projectId = projId; c.programId = migProg.id; }
  }

  // ── Drop the instances the workflows seed placed for these records; register the project processes ──
  const drop = new Set(S.processInstances.filter((i) => i.recordType === 'project' || i.recordType === 'changeRequest' || i.recordType === 'workOrder').map((i) => i.id));
  S.processInstances = S.processInstances.filter((i) => !drop.has(i.id));
  S.flowNodeInstances = S.flowNodeInstances.filter((f) => !drop.has(f.instanceId));
  S.userTasks = S.userTasks.filter((t) => !drop.has(t.instanceId));
  S.engineIncidents = S.engineIncidents.filter((e) => !drop.has(e.instanceId));
  const platform = S.byRole('Platform Owner');
  for (const p of PROCESSES.filter((x) => x.pid.startsWith('PRJ'))) {
    const id = S.nid('PDEF');
    S.processDefinitions.push({ id, ...S.meta(platform), key: p.key, name: p.name, version: 1, owner: p.owner, description: p.description, specIds: p.specIds, lanes: p.lanes, bpmnKey: p.key });
  }

  // ── 4. Project processes and milestones ────────────────────────────────────
  interface Placed { project: T.Project; key: string; inst: T.ProcessInstance }
  const placed = new Map<string, Placed>();
  let seq = 0;
  S.projects.forEach((proj, k) => {
    const key = PROCESS_FOR_TEMPLATE[proj.template as E.ProjectTemplate];
    const p = PROCESS_BY_KEY[key];
    if (!p || proj.status === 'Blocked') { syncMilestones(proj, key, undefined); return; }
    const path = mainPath(p);
    const waits = path.filter((id) => ['userTask', 'messageCatch'].includes(nodeById(p, id)?.type ?? ''));
    const isWork = (id: string) => isWorkWait(key, id);
    let at: string; let state: T.ProcessInstanceState = 'active';
    if (proj.status === 'Completed') { at = path[path.length - 1]; state = 'completed'; }
    else {
      let idx = proj.status === 'Planning' || proj.percentComplete <= 8 ? 0 : Math.min(waits.length - 2, Math.max(1, Math.round((proj.percentComplete / 100) * (waits.length - 1))));
      const linked = S.changeRequests.some((c) => c.projectId === proj.id && OPEN.includes(c.status));
      if (linked || (proj.percentComplete >= 30 && proj.status !== 'On Hold')) {
        const fwd = waits.findIndex((id, j) => j >= idx && isWork(id));
        const back = waits.map((id, j) => [id, j] as const).filter(([id, j]) => j < idx && isWork(id)).pop();
        if (fwd >= 0 && (fwd - idx <= 2 || linked || !back)) idx = fwd; else if (back) idx = back[1];
      }
      // A project on hold is paused before its next work step (nothing raised while paused).
      if (proj.status === 'On Hold') while (idx > 0 && isWork(waits[idx])) idx--;
      at = waits[idx];
    }
    const tpl = TEMPLATE_REGISTRY[proj.template as E.ProjectTemplate];
    const instId = placeInstance(S, { p, businessKey: proj.projId, recordType: 'project', recordId: proj.id, dataCenterId: proj.dataCenterId, at, state, i: k, variables: { title: proj.name, projectId: proj.id, programId: proj.programId, template: proj.template, templateCategory: tpl.category, budget: proj.budget, plannerPlanId: proj.plannerPlanId, ...(proj.status === 'On Hold' ? { onHold: true } : {}) } });
    const inst = S.processInstances.find((i) => i.id === instId)!;
    placed.set(proj.id, { project: proj, key, inst });
    syncMilestones(proj, key, inst);
  });

  /** Milestones carry the template's names (renamed in place, extras appended) and follow the process. */
  function syncMilestones(proj: T.Project, key: string | undefined, inst: T.ProcessInstance | undefined) {
    const names = TEMPLATE_REGISTRY[proj.template as E.ProjectTemplate]?.milestones; if (!names) return;
    const mine = S.milestones.filter((m) => m.projectId === proj.id);
    if (!names.every((n) => mine.some((m) => m.name === n))) names.forEach((n, j) => {
      if (mine[j]) mine[j].name = n;
      else { const id = S.nid('MS'); const m: T.Milestone = { id, msId: id, ...S.meta(pmgr), projectId: proj.id, name: n, dueDate: S.daysAhead(30), status: 'Not Started', rag: 'Grey' }; S.milestones.push(m); mine.push(m); }
    });
    const states = key ? milestoneStates(key, inst) : names.map((name) => ({ name, nodeId: '', state: 'Not Started' as const }));
    const span = Math.max(DAY, ms(proj.plannedEnd) - ms(proj.plannedStart));
    states.forEach((s, j) => {
      const m = mine.find((x) => x.name === s.name); if (!m) return;
      let due = ms(proj.plannedStart) + (span * (j + 1)) / (states.length + 1);
      if (s.state === 'Completed') { m.status = 'Completed'; m.rag = 'Green'; if (due > S.now) due = S.now - (states.length - j) * 9 * DAY; }
      else if (s.state === 'In Progress') {
        const late = proj.status === 'At Risk' || proj.rag === 'Red';
        m.status = late ? 'Delayed' : 'In Progress'; m.rag = late ? 'Red' : proj.rag === 'Amber' ? 'Amber' : 'Green';
        due = late ? S.now - (6 + j) * DAY : Math.max(due, S.now + (8 + j * 3) * DAY);
      } else { m.status = 'Not Started'; m.rag = 'Grey'; if (due < S.now) due = S.now + (20 + j * 18) * DAY; }
      m.dueDate = iso(due);
    });
  }

  // ── Helpers for change and work-order records ──────────────────────────────
  const meta = (p: Person, createdMs: number) => ({ ...S.meta(p), createdAt: iso(createdMs), updatedAt: iso(Math.min(S.now, createdMs + 2 * DAY)) });
  const rackOf = (cr: T.ChangeRequest) => cr.affectedResourceType === 'Rack' ? cr.affectedResourceIds : cr.affectedResourceType === 'Asset' ? [...new Set(cr.affectedResourceIds.map((id) => S.devices.find((d) => d.id === id)?.rackId).filter((x): x is string => !!x))] : cr.affectedResourceType === 'PowerChain' ? [...new Set(cr.affectedResourceIds.map((id) => S.powerFeeds.find((f) => f.id === id)?.rackId).filter((x): x is string => !!x))] : [];
  const reviewer = (i: number) => S.cycle([noc, fac, net], i);
  const decideApprovals = (crId: string, status: CS, submittedMs: number, approvedMs: number | undefined, i: number) => {
    const steps = S.approvalSteps.filter((a) => a.changeRequestId === crId).sort((a, b) => a.order - b.order);
    steps.forEach((a, k) => {
      let d: E.ApprovalDecision = 'Pending';
      if (['Approved', 'Scheduled', 'InProgress', 'Implemented', 'Closed', 'RolledBack', 'Cancelled'].includes(status)) d = 'Approved';
      else if (status === 'Rejected') d = k === steps.length - 1 ? 'Rejected' : 'Approved';
      else if (status === 'UnderReview') d = k === 0 ? (i % 3 === 0 ? 'Delegated' : 'Approved') : 'Pending';
      const who = S.byRole(ROLE_PERSON[a.approverRole] ?? 'NOC Lead');
      const at = approvedMs ?? submittedMs + (k + 1) * DAY;
      Object.assign(a, d === 'Pending' ? { decision: d, approverId: undefined, decidedAt: undefined, comment: undefined } : { decision: d, approverId: who.id, decidedAt: iso(Math.min(S.now - HOUR, at - (steps.length - k - 1) * 6 * HOUR)), comment: d === 'Delegated' ? `Delegated to ${noc.name} (on leave).` : d === 'Rejected' ? 'Rejected at the change board: the window clashes with a customer event; re-plan.' : S.cycle(['Checked the window, back-out and headroom; approved.', 'Approved at the change board.', 'Approved; keep the NOC informed at start and end.'], i + k) });
    });
  };
  /** Status-driven fields of a change and its work order (dates, decisions, review, sign-off, assignment). */
  const applyStatus = (cr: T.ChangeRequest, wo: T.WorkOrder, status: CS, i: number, opts: { assigned?: boolean; contractor?: boolean } = {}) => {
    const startMs = ms(cr.scheduledStart ?? S.daysAhead(14)); const endMs = ms(cr.scheduledEnd ?? iso(startMs + 4 * HOUR));
    const standard = cr.changeClass === 'Standard'; const emergency = cr.changeClass === 'Emergency';
    const submittedMs = Math.min(S.now - 2 * HOUR, startMs - (emergency ? 4 * HOUR : (5 + (i % 6)) * DAY));
    const approved = ['Approved', 'Scheduled', 'InProgress', 'Implemented', 'Closed', 'RolledBack'].includes(status);
    const approvedMs = approved ? Math.min(S.now - HOUR, submittedMs + (emergency ? 1 * HOUR : standard ? 0 : (2 + (i % 3)) * DAY)) : undefined;
    cr.status = status;
    cr.submittedAt = status === 'Draft' ? undefined : iso(submittedMs);
    cr.approvedAt = approvedMs ? iso(approvedMs) : undefined;
    cr.cabDate = standard ? undefined : emergency ? iso(submittedMs + HOUR) : status === 'Draft' ? undefined : nextChangeBoard(iso(submittedMs));
    const done = ['Implemented', 'Closed', 'RolledBack'].includes(status);
    cr.implementedAt = done ? iso(endMs) : undefined;
    cr.closedAt = status === 'Closed' ? iso(Math.min(S.now - HOUR, endMs + (standard ? HOUR : (2 + (i % 4)) * DAY))) : undefined;
    if (status === 'Closed' || status === 'RolledBack' || (emergency && status === 'Implemented')) {
      const outcome: NonNullable<T.ChangeRequest['review']>['outcome'] = status === 'RolledBack' ? 'Rolled back' : emergency ? 'Successful with issues' : i % 5 === 0 ? 'Successful with issues' : 'Successful';
      const by = reviewer(i);
      cr.review = {
        outcome, by: by.name, at: iso(Math.min(S.now - HOUR, endMs + DAY)),
        notes: standard && outcome === 'Successful' ? 'Standard change closed on completion of its work order.' : outcome === 'Rolled back' ? 'Verification failed after the change; the back-out plan was run in the same window and service restored.' : outcome === 'Successful with issues' ? (emergency ? 'Fault cleared under the emergency board; one alarm stayed active for 20 minutes after the fix.' : 'Done in the window; one label and one record field were corrected afterwards.') : 'Implemented as planned within the window; no customer impact.',
        lessons: outcome === 'Rolled back' ? 'Add a load check on the receiving feed to the method before the swap.' : emergency ? 'Keep a spare in the site store; raise the follow-up normal change for the permanent fix.' : undefined,
      };
    } else cr.review = undefined;
    decideApprovals(cr.id, status, submittedMs, approvedMs, i);
    const woStatus: WS = ({ Draft: 'Draft', Submitted: 'Awaiting change approval', UnderReview: 'Awaiting change approval', Approved: opts.assigned ? 'Assigned' : 'Ready', Scheduled: 'Assigned', InProgress: i % 3 === 2 ? 'Validated' : 'InProgress', Implemented: 'Completed', Closed: 'Completed', Rejected: 'Cancelled', Cancelled: 'Cancelled', RolledBack: 'Failed' } as Record<CS, WS>)[status];
    const hasPeople = !['Draft', 'Awaiting change approval', 'Ready', 'Cancelled'].includes(woStatus) || opts.contractor;
    const dc = dcOf(wo.dataCenterId ?? cr.dataCenterId);
    if (wo.assigneeKind === 'contractor') { const v = S.vendors.find((x) => x.id === wo.contractorVendorId); wo.assigneeName = v?.contactName ?? wo.assigneeName; }
    else wo.assigneeName = hasPeople ? technicianFor(dc, i) : '';
    Object.assign(wo, {
      status: woStatus, plannedStart: iso(startMs), plannedEnd: iso(endMs), scheduledDate: iso(startMs),
      actualStart: ['InProgress', 'Validated', 'Completed', 'Failed'].includes(woStatus) ? iso(Math.min(S.now - HOUR, startMs)) : undefined,
      actualEnd: ['Completed', 'Failed', 'Validated'].includes(woStatus) ? iso(Math.min(S.now - 30 * 60_000, endMs)) : undefined,
      signOff: woStatus === 'Completed' || woStatus === 'Failed' ? { by: wo.assigneeKind === 'contractor' ? (wo.crew?.[0] ?? wo.assigneeName) : wo.assigneeName, at: iso(Math.min(S.now - 30 * 60_000, endMs)), notes: woStatus === 'Failed' ? 'Stopped and backed out: see the change review.' : 'Work done to the method statement; photos and readings attached.', customerWitness: dc && /colo/i.test(S.dcProfile.get(dc.id)?.key ?? '') ? 'Tenant representative on site' : undefined } : undefined,
    });
    cr.assignedTo = wo.assigneeName || undefined; cr.assignedToId = PEOPLE.find((x) => x.name === wo.assigneeName)?.id;
  };

  // ── 5. Existing change requests: class, place in the chain, work order ────
  const existing = [...S.changeRequests];
  const operational = (c: T.ChangeRequest) => !c.projectId && !c.programId;
  const emergencyIds = new Set<string>();
  const firstOp = (status: CS) => existing.find((c) => operational(c) && c.status === status && !emergencyIds.has(c.id) && c.type !== 'Decommission');
  for (const c of [firstOp('Implemented'), firstOp('Closed')]) if (c) emergencyIds.add(c.id);
  existing.forEach((cr, i) => {
    // place in the chain
    const pl = cr.projectId ? placed.get(cr.projectId) : undefined;
    const stepId = pl && pl.inst.state === 'active' && pl.inst.currentElementIds.find((id) => isWorkWait(pl.key, id));
    if (cr.projectId && !stepId) { cr.projectId = undefined; cr.programId = undefined; }
    const proj = stepId ? pl!.project : undefined;
    if (proj) { cr.projectStepId = stepId as string; cr.programId = proj.programId; cr.plannerPlanId = cr.plannerPlanId ?? proj.plannerPlanId; }
    // class
    cr.changeClass = emergencyIds.has(cr.id) ? 'Emergency' : 'Normal';
    if (cr.changeClass === 'Emergency') {
      const steps = S.approvalSteps.filter((a) => a.changeRequestId === cr.id);
      steps.slice(1).forEach((a) => S.approvalSteps.splice(S.approvalSteps.indexOf(a), 1));
      if (steps[0]) steps[0].approverRole = 'ChangeApprover';
      cr.approvalRuleId = undefined; cr.risk = 'High'; cr.priority = 'Urgent';
      cr.impactSummary = 'Raised as an emergency: service at risk until fixed.';
      if (cr.status === 'Closed') { cr.scheduledStart = iso(ms(qEnd.start) + DAY + 2 * HOUR); cr.scheduledEnd = iso(ms(cr.scheduledStart) + 3 * HOUR); }
    }
    // approvals for changes that had none (planner waves)
    if (cr.status !== 'Draft' && cr.changeClass === 'Normal' && !S.approvalSteps.some((a) => a.changeRequestId === cr.id)) {
      const rule = S.approvalMatrixRules.find((r) => r.changeType === cr.type && (!r.riskLevel || r.riskLevel === cr.risk)) ?? S.approvalMatrixRules.find((r) => r.changeType === cr.type) ?? S.approvalMatrixRules[0];
      cr.approvalRuleId = rule.id;
      rule.stages.forEach((st) => { for (let n = 0; n < st.requiredCount; n++) { const id = S.nid('APSTEP'); S.approvalSteps.push({ id, apstepId: id, ...S.meta(S.byRole(ROLE_PERSON[st.approverRole] ?? 'NOC Lead')), changeRequestId: cr.id, order: st.order, approverRole: st.approverRole, decision: 'Pending' }); } });
    }
    cr.implementationPlan = cr.implementationPlan ?? PLANS[cr.type].impl;
    cr.testPlan = cr.testPlan ?? PLANS[cr.type].test;
    cr.backoutPlan = cr.backoutPlan ?? cr.rollbackPlan;
    const services = S.services.filter((s) => (s as { dataCenterId?: string }).dataCenterId === cr.dataCenterId).slice(0, i % 3);
    cr.affectedServiceIds = services.map((s) => s.id);
    cr.impactSummary = cr.impactSummary ?? (services.length ? `${services.length} service${services.length > 1 ? 's' : ''} at the site run on the affected equipment; redundancy covers the window.` : 'No customer service runs on the affected equipment.');
    cr.source = cr.source ?? 'Internal';
    // work order (one per change)
    let wo = cr.linkedWorkOrderId ? S.workOrders.find((w) => w.id === cr.linkedWorkOrderId) : undefined;
    if (!wo) { const id = S.nid('WO'); wo = { id, woId: id, ...meta(field, ms(cr.createdAt)), type: 'RackInstall', changeRequestId: cr.id, assigneeName: '', status: 'Draft', scheduledDate: cr.scheduledStart ?? S.daysAhead(10) } as T.WorkOrder; S.workOrders.push(wo); }
    const woType: E.WorkOrderType = /cut-in/i.test(cr.title) ? 'PlantCutIn' : cr.plannerWaveId ? (cr.type === 'ServerRelocation' ? 'Migration' : 'DeviceRemoval') : cr.type === 'NetworkMigration' && i % 2 ? 'CircuitTurnUp' : CR_WO_TYPE[cr.type];
    const contractor = woType === 'PlantCutIn' || (cr.type === 'PowerUpgrade' && i % 2 === 0) || (cr.type === 'RackDeploy' && i % 3 === 0);
    const c = contractor ? contractorFor(S.vendors, woType === 'PlantCutIn' || cr.type === 'PowerUpgrade' ? 'Power' : 'Services', i) : undefined;
    Object.assign(wo, {
      type: woType, title: cr.title, description: cr.description, changeRequestId: cr.id, projectId: proj?.id, programId: proj?.programId ?? cr.programId, plannerPlanId: cr.plannerPlanId, projectStepId: cr.projectStepId, dataCenterId: cr.dataCenterId,
      rackIds: rackOf(cr), rackId: rackOf(cr)[0] ?? wo.rackId, deviceIds: cr.affectedResourceType === 'Asset' ? cr.affectedResourceIds : undefined,
      assigneeKind: contractor ? 'contractor' : 'internal', contractorVendorId: c?.vendorId, crew: c?.crew, priority: cr.priority === 'Urgent' ? 'Critical' : cr.priority,
      notes: proj ? `Work step "${cr.projectStepId}" of ${proj.name}` : cr.programId ? 'Programme-level work order' : 'Operational change outside any project',
    });
    cr.workOrderId = wo.id; cr.linkedWorkOrderId = wo.id;
    if (!cr.scheduledStart) { cr.scheduledStart = S.daysAhead(12 + (i % 9)); cr.scheduledEnd = iso(ms(cr.scheduledStart) + 4 * HOUR); }
    applyStatus(cr, wo, cr.status, i, { assigned: i % 2 === 0, contractor });
    if (cr.status === 'Draft') { cr.scheduledStart = undefined; cr.scheduledEnd = undefined; }
  });

  // ── 6. New work orders for project work steps ──────────────────────────────
  const freezeData = { changeFreezes: S.changeFreezes, standardChangeTemplates: S.standardChangeTemplates, approvalMatrixRules: S.approvalMatrixRules };
  const chainData = { vendors: S.vendors, dataCenters: S.dataCenters };
  const NORMAL_MIX: CS[] = ['Submitted', 'Approved', 'Scheduled', 'InProgress', 'UnderReview', 'Implemented', 'Closed', 'Scheduled', 'Approved', 'InProgress'];
  const STANDARD_MIX: CS[] = ['Approved', 'InProgress', 'Closed', 'Approved'];
  const datesFor = (status: CS, days: number, i: number): [number, number] => {
    const d = Math.max(0.25, days) * DAY;
    switch (status) {
      case 'Closed': { const e = S.now - (2 + (i % 18)) * DAY; return [e - d, e]; }
      case 'Implemented': { const e = S.now - (6 + (i % 30)) * HOUR; return [e - d, e]; }
      case 'InProgress': { const s = S.now - Math.min(d - HOUR, (2 + (i % 20)) * HOUR); return [s, s + d]; }
      case 'Approved': case 'Scheduled': { const s = S.now + (2 + (i % 12)) * DAY + 22 * HOUR - (S.now % DAY); return [s, s + d]; }
      default: { const s = S.now + (9 + (i % 20)) * DAY + 22 * HOUR - (S.now % DAY); return [s, s + d]; }
    }
  };
  const raise = (proj: T.Project, key: string, stepId: string, status: CS, draftIdx: number, startMs: number) => {
    const racks = S.racks.filter((r) => r.dataCenterId === proj.dataCenterId && r.status !== 'Retired').slice(0, 24);
    const drafts = planWorkForStep(proj, key, stepId, { start: iso(startMs), racks });
    const draft = drafts[draftIdx % Math.max(1, drafts.length)]; if (!draft) return undefined;
    const days = (ms(draft.plannedEnd) - ms(draft.plannedStart)) / DAY;
    const i = seq++;
    const [s, e] = status === 'Closed' && startMs < S.now - 2 * DAY ? [startMs, Math.min(S.now - DAY, startMs + days * DAY)] : datesFor(status, days, i);
    const input = { ...draftToInput(chainData, proj, stepId, { ...draft, plannedStart: iso(s), plannedEnd: iso(e) }, i), submit: status !== 'Draft' };
    const plan = planRaiseWorkOrder(freezeData, input, proj.managerName, { wo: S.nid('WO'), chg: S.nid('CHG'), step: () => S.nid('APSTEP') }, iso(s - 6 * DAY));
    const who = S.byRole(proj.managerName === S.byRole('Program Manager').name ? 'Program Manager' : 'Project Manager');
    Object.assign(plan.change, meta(who, Math.min(S.now - DAY, s - 8 * DAY)), { requestedBy: proj.managerName, requestedById: who.id });
    Object.assign(plan.workOrder, meta(who, Math.min(S.now - DAY, s - 8 * DAY)), { notes: `Work step "${stepId}" of ${proj.name}` });
    plan.approvals.forEach((a) => Object.assign(a, meta(who, Math.min(S.now - DAY, s - 7 * DAY))));
    S.changeRequests.push(plan.change); S.workOrders.push(plan.workOrder); S.approvalSteps.push(...plan.approvals);
    let st = status;
    if (plan.change.changeClass === 'Standard') st = ({ Draft: 'Approved', Submitted: 'Approved', UnderReview: 'Approved', Scheduled: 'Approved', Implemented: 'Closed' } as Partial<Record<CS, CS>>)[status] ?? status;
    plan.change.implementationPlan = plan.change.implementationPlan ?? draft.implementationPlan ?? PLANS[plan.change.type].impl;
    plan.change.impactSummary = draft.criticalServices ? 'Live services depend on the equipment; redundancy covers the window.' : draft.liveSite ? 'Work in a live area; no service interruption expected.' : 'No live service affected (new build area).';
    plan.change.affectedServiceIds = []; plan.change.affectedCustomerIds = [];
    applyStatus(plan.change, plan.workOrder, st, i, { assigned: i % 2 === 0, contractor: plan.workOrder.assigneeKind === 'contractor' });
    return plan;
  };
  let mixN = 0, stdN = 0;
  for (const { project: proj, key, inst } of placed.values()) {
    const p = PROCESS_BY_KEY[key];
    const fnis = S.flowNodeInstances.filter((f) => f.instanceId === inst.id);
    // completed work steps: their work orders are closed
    const doneSteps = mainPath(p).filter((id) => isWorkWait(key, id) && inst.completedElementIds.includes(id));
    for (const stepId of doneSteps) {
      const f = fnis.find((x) => x.elementId === stepId);
      const n = proj.status === 'Completed' ? 1 : 2;
      for (let k = 0; k < n; k++) raise(proj, key, stepId, 'Closed', k, ms(f?.startedAt ?? S.daysAgo(60)) + k * DAY);
    }
    // the step the project waits on: a mix, at least one still open
    const cur = inst.state === 'active' ? inst.currentElementIds.find((id) => isWorkWait(key, id)) : undefined;
    if (!cur || inst.variables.onHold) continue;
    const already = S.changeRequests.filter((c) => c.projectId === proj.id && c.projectStepId === cur).length;
    const want = Math.max(1, 4 - already);
    const made: T.ChangeRequest[] = [];
    for (let k = 0; k < want; k++) {
      const plan = raise(proj, key, cur, NORMAL_MIX[mixN % NORMAL_MIX.length], k, S.now);
      if (!plan) break;
      if (plan.change.changeClass === 'Standard') { const st = STANDARD_MIX[stdN++ % STANDARD_MIX.length]; applyStatus(plan.change, plan.workOrder, st, seq++, { assigned: true }); } else mixN++;
      made.push(plan.change);
    }
    const stepCrs = S.changeRequests.filter((c) => c.projectId === proj.id && c.projectStepId === cur);
    if (!stepCrs.some((c) => OPEN.includes(c.status)) && made[0]) { const wo = S.workOrders.find((w) => w.id === made[0].workOrderId)!; const [s, e] = datesFor('InProgress', 1, 3); made[0].scheduledStart = iso(s); made[0].scheduledEnd = iso(e); applyStatus(made[0], wo, 'InProgress', 0, { assigned: true }); }
  }

  // One rejected project change, re-planned with a new work order.
  const rejectable = S.changeRequests.find((c) => c.projectId && c.changeClass === 'Normal' && c.status === 'Submitted');
  if (rejectable) {
    const wo = S.workOrders.find((w) => w.id === rejectable.workOrderId)!;
    applyStatus(rejectable, wo, 'Rejected', 7);
    const pl = placed.get(rejectable.projectId!);
    if (pl) raise(pl.project, pl.key, rejectable.projectStepId!, 'Submitted', 0, S.now + 20 * DAY);
  }

  // The failed standard change that suspended its template (operational, colo site).
  const colo = S.dataCenters.find((d) => /colo/.test(S.dcProfile.get(d.id)?.key ?? '')) ?? S.dataCenters[0];
  const coloRack = S.racks.find((r) => r.dataCenterId === colo.id && r.status === 'Active');
  {
    const failAt = ms(suspended.lastFailureAt!);
    const plan = planRaiseWorkOrder({ ...freezeData, standardChangeTemplates: S.standardChangeTemplates.map((t) => (t.id === suspended.id ? { ...t, status: 'Active' as const } : t)) }, { type: 'PowerConnect', title: `Rack PDU swap, A side — ${coloRack?.name ?? colo.code}`, description: `Swap the A-side PDU of ${coloRack?.name ?? 'a tenant rack'} at ${colo.name} under the standard template.`, dataCenterId: colo.id, rackIds: coloRack ? [coloRack.id] : undefined, plannedStart: iso(failAt - 2 * HOUR), plannedEnd: iso(failAt), assigneeKind: 'internal', assigneeName: technicianFor(colo, 1), kw: 6, priority: 'Medium' }, fac.name, { wo: S.nid('WO'), chg: S.nid('CHG'), step: () => S.nid('APSTEP') }, iso(failAt - 3 * DAY));
    plan.change.standardTemplateId = suspended.id; plan.workOrder.standardTemplateId = suspended.id; plan.change.changeClass = 'Standard';
    Object.assign(plan.change, meta(fac, failAt - 3 * DAY), { impactSummary: 'Tenant rack on dual feeds; no outage expected.', affectedServiceIds: [], affectedCustomerIds: [] });
    Object.assign(plan.workOrder, meta(fac, failAt - 3 * DAY), { notes: 'Operational change outside any project' });
    S.changeRequests.push(plan.change); S.workOrders.push(plan.workOrder);
    applyStatus(plan.change, plan.workOrder, 'RolledBack', 1, { assigned: true });
    plan.change.review = { outcome: 'Rolled back', by: fac.name, at: iso(failAt + 6 * HOUR), notes: 'Three single-corded devices dropped when the A side was isolated; the original PDU was reconnected within 12 minutes and service restored. The template is suspended until it is reviewed.', lessons: 'Check every device is dual-corded from the outlet map, not the asset record; add a load check on the B feed before isolation.' };
    plan.change.closedAt = undefined;
    S.audit('StandardChangeTemplate', suspended.id, 'suspended', `Suspended after ${plan.change.id} was rolled back; changes of this kind go as normal changes until reviewed`, fac, iso(failAt + 6 * HOUR));
  }

  // As the migration seed does: open decommission changes at the source site of an executing
  // migration plan are linked to that plan (they retire kit the plan also moves out).
  for (const plan of S.plannerPlans.filter((p) => p.scope === 'migration' && p.status === 'Executing' && p.dataCenterId)) {
    for (const c of S.changeRequests.filter((x) => x.dataCenterId === plan.dataCenterId && x.type === 'Decommission' && !x.plannerPlanId && OPEN.includes(x.status))) {
      c.plannerPlanId = plan.id; const wo = S.workOrders.find((w) => w.id === c.workOrderId); if (wo) wo.plannerPlanId = plan.id;
    }
  }

  // A title that names a site names the change's own site.
  for (const cr of S.changeRequests) {
    const code = dcOf(cr.dataCenterId)?.code; const m = / — ([A-Z]{3}-[A-Z0-9]+)$/.exec(cr.title);
    if (code && m && m[1] !== code) { cr.title = cr.title.replace(/ — [A-Z]{3}-[A-Z0-9]+$/, ` — ${code}`); const wo = S.workOrders.find((w) => w.id === cr.workOrderId); if (wo) wo.title = cr.title; }
  }

  // ── 7. Freezes: changes whose window falls in one are emergencies or flagged ──
  for (const cr of S.changeRequests) {
    if (!cr.scheduledStart || !cr.scheduledEnd) continue;
    const f = freezeFor({ changeFreezes: S.changeFreezes }, cr.dataCenterId, cr.scheduledStart, cr.scheduledEnd);
    if (!f) continue;
    cr.freezeId = f.id;
    if (cr.changeClass === 'Emergency') continue;
    const text = cr === cutIn || (cutInFreeze && f.id === cutInFreeze.id && /cut-in/i.test(cr.title)) ? `Window falls in the freeze "${f.name}" (this change is the work the freeze protects)` : `Window falls in the freeze "${f.name}"`;
    if (!cr.policyViolations.some((v) => v.startsWith('Window falls in the freeze'))) cr.policyViolations.push(text);
  }

  // ── Maintenance windows for scheduled and later changes that have none ────
  for (const cr of S.changeRequests) {
    if (cr.changeClass === 'Standard' || !['Scheduled', 'InProgress', 'Implemented', 'Closed', 'RolledBack'].includes(cr.status) || !cr.scheduledStart || S.maintenanceWindows.some((w) => w.changeRequestId === cr.id)) continue;
    const id = S.nid('MW');
    S.maintenanceWindows.push({ id, mwId: id, ...S.meta(noc), title: cr.title, status: cr.status === 'Scheduled' ? 'Scheduled' : cr.status === 'InProgress' ? 'In Progress' : 'Completed', dataCenterId: cr.dataCenterId, changeRequestId: cr.id, scheduledStart: cr.scheduledStart, scheduledEnd: cr.scheduledEnd!, affectedDeviceIds: cr.affectedResourceType === 'Asset' ? cr.affectedResourceIds : [], impact: cr.impactSummary ?? 'No customer impact expected.', owner: cr.assignedTo ?? noc.name, plannerPlanId: cr.plannerPlanId });
  }

  // ── 8. Processes: P05 per normal or emergency change, P10 per work order, P12 per contractor visit ──
  const P05 = PROCESS_BY_KEY['change'], P10 = PROCESS_BY_KEY['work-order'], P12 = PROCESS_BY_KEY['access-request'];
  const CR_AT: Record<CS, [string, T.ProcessInstanceState]> = {
    Draft: ['raise', 'active'], Submitted: ['approve', 'active'], UnderReview: ['approve', 'active'], Approved: ['schedule', 'active'], Scheduled: ['start_change', 'active'], InProgress: ['implement', 'active'],
    Implemented: ['verify', 'active'], Closed: ['end', 'completed'], Rejected: ['end_rejected', 'completed'], Cancelled: ['approve', 'cancelled'], RolledBack: ['end_rolled_back', 'completed'],
  };
  let n = 0;
  for (const cr of S.changeRequests) {
    if (cr.changeClass === 'Standard') continue;
    const [at, state] = CR_AT[cr.status];
    placeInstance(S, { p: P05, businessKey: cr.chgId, recordType: 'changeRequest', recordId: cr.id, dataCenterId: cr.dataCenterId, at, state, i: n++, variables: { title: cr.title, risk: cr.risk, changeClass: cr.changeClass, workOrderId: cr.workOrderId, scopeSize: cr.affectedResourceIds.length, conflicts: !!cr.freezeId, riskResult: { risk: cr.risk === 'Critical' ? 'High' : cr.risk, approvalPath: cr.changeClass === 'Emergency' ? 'Emergency board' : cr.risk === 'Low' ? 'Peer review' : cr.risk === 'Medium' ? 'Change manager' : 'CAB + Facilities Director' } } });
  }
  const WO_AT: Record<WS, [string, T.ProcessInstanceState, string?]> = {
    Draft: ['assign', 'active'], 'Awaiting change approval': ['assign', 'active'], Ready: ['assign', 'active'], Assigned: ['accept', 'active'], InProgress: ['complete', 'active'], Validated: ['verify', 'active'],
    Completed: ['end', 'completed'], Cancelled: ['assign', 'cancelled', 'Change rejected or withdrawn'], Failed: ['complete', 'cancelled', 'Work failed; the change was rolled back'],
  };
  const ACCESS_AT: Partial<Record<WS, [string, T.ProcessInstanceState]>> = { Draft: ['request', 'active'], 'Awaiting change approval': ['approve_zones', 'active'], Ready: ['approve_zones', 'active'], Assigned: ['check_in', 'active'], InProgress: ['escorted', 'active'], Validated: ['check_out', 'active'], Completed: ['end', 'completed'], Failed: ['end', 'completed'] };
  for (const wo of S.workOrders) {
    const [at, state, message] = WO_AT[wo.status];
    const cr = S.changeRequests.find((c) => c.id === wo.changeRequestId);
    wo.processInstanceId = placeInstance(S, { p: P10, businessKey: wo.woId, recordType: 'workOrder', recordId: wo.id, dataCenterId: wo.dataCenterId, at, state, message, i: n++, variables: { title: wo.title ?? wo.woId, workType: wo.type, changeRequestId: cr?.id, assignee: wo.assigneeName, skillResult: { skill: SKILL[wo.type] ?? 'General', permit: wo.type === 'PowerConnect' || wo.type === 'PlantCutIn' ? 'Electrical work permit (LOTO)' : wo.type === 'RackInstall' ? 'Lifting / manual handling' : 'Change window ticket' }, ...(state === 'cancelled' ? { cancelReason: message } : {}) } });
    const acc = wo.assigneeKind === 'contractor' ? ACCESS_AT[wo.status] : undefined;
    if (acc) {
      const vendor = S.vendors.find((v) => v.id === wo.contractorVendorId);
      wo.accessRequestId = placeInstance(S, { p: P12, businessKey: wo.woId, recordType: 'dataCenter', recordId: wo.dataCenterId ?? S.dataCenters[0].id, dataCenterId: wo.dataCenterId, at: acc[0], state: acc[1], i: n++, variables: { title: `${vendor?.name ?? 'Contractor'} crew · ${wo.title ?? wo.woId}`, workOrderId: wo.id, vendorId: wo.contractorVendorId, crew: wo.crew ?? [], visitStart: wo.plannedStart, visitEnd: wo.plannedEnd, zones: ['Hall', 'Loading bay'] } });
    }
  }
}

const SKILL: Partial<Record<E.WorkOrderType, string>> = { RackInstall: 'Rigging & rack assembly', Cabling: 'Structured cabling (fibre & copper)', PowerConnect: 'Licensed electrician', DeviceDeploy: 'Device install & bring-up', PlantCutIn: 'HV/LV authorised person', PlantInstall: 'Plant installation', Civil: 'Construction', Migration: 'Device install & bring-up', CircuitTurnUp: 'Optical turn-up', DeviceRemoval: 'Device install & bring-up', Commissioning: 'Commissioning', Inspection: 'Test and inspection', Disposal: 'Chain of custody', Configuration: 'Network configuration' };
