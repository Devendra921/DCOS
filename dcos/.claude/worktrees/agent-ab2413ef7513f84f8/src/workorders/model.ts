/**
 * Work-order process model — the single source of truth for the twelve Camunda 8
 * processes DCOS runs as "work orders".
 *
 *   • `src/workorders/tools/generateBpmn.ts` turns this into laid-out BPMN 2.0 XML
 *     (collaboration + lanes + zeebe extensions + bpmndi) under `src/workorders/bpmn/`.
 *   • `src/mock/db/seed/workflows.ts` walks the same graph to seed instances, tokens and
 *     user tasks deterministically (it runs under Node too, so this file has no Vite deps).
 *   • The runtime engine (`src/modules/workorders/lib/engine.ts`) parses the generated
 *     BPMN with bpmn-moddle; it reads this file only for descriptions / roles / SLAs.
 */

export type WfNodeType =
  | 'start' | 'end' | 'userTask' | 'serviceTask' | 'businessRuleTask'
  | 'exclusiveGateway' | 'parallelGateway' | 'timerCatch' | 'messageCatch';

export type WfBoundaryKind = 'timer' | 'error' | 'message';

export interface WfBoundary {
  id: string;
  kind: WfBoundaryKind;
  name: string;
  /** ISO-8601 duration for timers (PT15M), error code for errors, message name for messages. */
  ref: string;
  /** Non-interrupting (timer/message only). */
  nonInterrupting?: boolean;
  /** Target flow node id. */
  to: string;
}

export interface WfNode {
  id: string;
  name: string;
  type: WfNodeType;
  lane: string;
  /** Camunda Forms key for user tasks (file under src/workorders/forms/<formKey>.form). */
  formKey?: string;
  /** Zeebe job type for service tasks. */
  taskType?: string;
  /** DMN decision id for business-rule tasks. */
  decisionId?: string;
  resultVariable?: string;
  /** Expected duration in hours — drives seeded timestamps, due dates and SLA checks. */
  hours: number;
  /** Second row inside the lane (used for exception / rollback paths so the layout stays clean). */
  row?: 0 | 1;
  boundaries?: WfBoundary[];
  /** Default outgoing flow target (exclusive gateways only). */
  defaultTo?: string;
  /** Timer definition for intermediate timer catch events (ISO duration). */
  timer?: string;
}

/** [from, to, label?, FEEL condition?] */
export type WfFlow = readonly [from: string, to: string, name?: string, condition?: string];

export interface WfProcess {
  /** Catalogue id (P01 … P12). */
  pid: string;
  /** BPMN process id / definition key (kebab-case). */
  key: string;
  name: string;
  owner: string;
  description: string;
  specIds: string[];
  lanes: string[];
  /** Candidate role (PEOPLE.role) per lane — assigned to user tasks in that lane. */
  laneRoles: Record<string, string>;
  nodes: WfNode[];
  flows: WfFlow[];
}

const U = (id: string, name: string, lane: string, formKey: string, hours: number, extra: Partial<WfNode> = {}): WfNode =>
  ({ id, name, type: 'userTask', lane, formKey, hours, ...extra });
const S = (id: string, name: string, lane: string, taskType: string, hours: number, extra: Partial<WfNode> = {}): WfNode =>
  ({ id, name, type: 'serviceTask', lane, taskType, hours, ...extra });
const R = (id: string, name: string, lane: string, decisionId: string, resultVariable: string, extra: Partial<WfNode> = {}): WfNode =>
  ({ id, name, type: 'businessRuleTask', lane, decisionId, resultVariable, hours: 0.1, ...extra });
const X = (id: string, name: string, lane: string, defaultTo?: string, extra: Partial<WfNode> = {}): WfNode =>
  ({ id, name, type: 'exclusiveGateway', lane, hours: 0, defaultTo, ...extra });
const P = (id: string, name: string, lane: string): WfNode => ({ id, name, type: 'parallelGateway', lane, hours: 0 });
const START = (id: string, name: string, lane: string): WfNode => ({ id, name, type: 'start', lane, hours: 0 });
const END = (id: string, name: string, lane: string, extra: Partial<WfNode> = {}): WfNode => ({ id, name, type: 'end', lane, hours: 0, ...extra });
const TIMER = (id: string, name: string, lane: string, timer: string, hours: number): WfNode => ({ id, name, type: 'timerCatch', lane, timer, hours });

export const PROCESSES: WfProcess[] = [
  // ── P01 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P01', key: 'site-onboarding', name: 'Site onboarding', owner: 'Platform',
    description: 'Brings an existing or newly built site under DCOS management: the site is registered, legacy records are imported and validated, collectors are enrolled and discovery runs, discovered inventory is reconciled three ways (records vs discovery vs an audit walk), exceptions are resolved and the baseline is signed as the cut-over point.',
    specIds: ['ONB-01', 'ONB-04', 'REC-02'],
    lanes: ['DCOS', 'Platform collectors', 'Field'],
    laneRoles: { 'DCOS': 'Platform Owner', 'Platform collectors': 'Administrator', 'Field': 'Field Technician' },
    nodes: [
      START('start', 'Site added', 'DCOS'),
      U('register_site', 'Register site', 'DCOS', 'complete-with-evidence', 4),
      S('import_records', 'Import records', 'Platform collectors', 'dcos.import-records', 2),
      U('validate_import', 'Validate import', 'DCOS', 'approve', 8),
      X('g_import_ok', 'Import clean?', 'DCOS', 'enrol_collectors'),
      S('enrol_collectors', 'Enrol collectors', 'Platform collectors', 'dcos.enrol-collectors', 1),
      S('run_discovery', 'Run discovery', 'Platform collectors', 'dcos.discovery', 6, {
        boundaries: [{ id: 'b_discovery_overdue', kind: 'timer', name: 'Discovery overdue', ref: 'PT12H', nonInterrupting: true, to: 'check_collectors' }],
      }),
      U('check_collectors', 'Check collector health', 'Platform collectors', 'acknowledge', 2, { row: 1 }),
      S('reconcile', 'Three-way reconcile', 'DCOS', 'dcos.reconcile', 1),
      U('audit_walk', 'Audit walk', 'Field', 'complete-with-evidence', 16),
      X('g_exceptions', 'Exceptions?', 'DCOS', 'baseline'),
      U('resolve_exceptions', 'Resolve exceptions', 'DCOS', 'decide-reconciliation', 8, { row: 1 }),
      S('baseline', 'Baseline site', 'DCOS', 'dcos.baseline', 0.5),
      U('sign_cutover', 'Sign cut-over', 'DCOS', 'sign-off', 8),
      END('end', 'Site live in DCOS', 'DCOS'),
    ],
    flows: [
      ['start', 'register_site'], ['register_site', 'import_records'], ['import_records', 'validate_import'], ['validate_import', 'g_import_ok'],
      ['g_import_ok', 'enrol_collectors', 'clean', '=approved = true'], ['g_import_ok', 'import_records', 're-import', '=approved = false'],
      ['enrol_collectors', 'run_discovery'], ['check_collectors', 'run_discovery'],
      ['run_discovery', 'reconcile'], ['reconcile', 'audit_walk'], ['audit_walk', 'g_exceptions'],
      ['g_exceptions', 'baseline', 'none', '=exceptions = 0'], ['g_exceptions', 'resolve_exceptions', 'found', '=exceptions > 0'],
      ['resolve_exceptions', 'reconcile'], ['baseline', 'sign_cutover'], ['sign_cutover', 'end'],
    ],
  },
  // ── P02 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P02', key: 'hall-fitout', name: 'Hall fit-out', owner: 'Delivery',
    description: 'Takes a hall from approved design to released capacity: design review and PO approval, receipt and staging of kit, installation of racks, power and cabling, provisioning, the five commissioning levels (looping while defects remain), operations handover sign-off and finally the release of the new capacity to the planning pool.',
    specIds: ['BLD-02', 'BLD-05', 'CX-01'],
    lanes: ['Design', 'Procurement', 'Field', 'Commissioning', 'Operations'],
    laneRoles: { 'Design': 'Project Manager', 'Procurement': 'Finance Manager', 'Field': 'Field Technician', 'Commissioning': 'Commissioning Engineer', 'Operations': 'Facilities Director' },
    nodes: [
      START('start', 'Fit-out approved', 'Design'),
      U('design_review', 'Design review', 'Design', 'approve', 40),
      U('approve_pos', 'Approve POs', 'Procurement', 'approve', 24),
      U('receive_stage', 'Receive & stage', 'Field', 'complete-with-evidence', 120, {
        boundaries: [{ id: 'b_delivery_delayed', kind: 'message', name: 'Delivery delayed', ref: 'delivery-delayed', nonInterrupting: true, to: 'expedite' }],
      }),
      U('expedite', 'Expedite with vendor', 'Procurement', 'acknowledge', 8, { row: 1 }),
      U('install', 'Install racks, power & cabling', 'Field', 'complete-with-evidence', 160),
      S('provision', 'Provision devices', 'Operations', 'dcos.provision', 8),
      U('commission', 'Commissioning L1–L5', 'Commissioning', 'complete-with-evidence', 80),
      X('g_defects', 'Defects?', 'Commissioning', 'handover'),
      U('fix_defects', 'Fix defects', 'Field', 'complete-with-evidence', 24, { row: 1 }),
      U('handover', 'Handover sign-off', 'Operations', 'sign-off', 16),
      S('release_capacity', 'Release capacity', 'Operations', 'dcos.release-capacity', 0.5),
      END('end', 'Hall in service', 'Operations'),
    ],
    flows: [
      ['start', 'design_review'], ['design_review', 'approve_pos'], ['approve_pos', 'receive_stage'], ['expedite', 'receive_stage'],
      ['receive_stage', 'install'], ['install', 'provision'], ['provision', 'commission'], ['commission', 'g_defects'],
      ['g_defects', 'handover', 'none', '=defects = 0'], ['g_defects', 'fix_defects', 'open defects', '=defects > 0'], ['fix_defects', 'commission'],
      ['handover', 'release_capacity'], ['release_capacity', 'end'],
    ],
  },
  // ── P03 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P03', key: 'customer-onboarding', name: 'Customer onboarding', owner: 'Sales',
    description: 'Onboards a colocation customer from signed contract to billed service: placement is approved against capacity and policy, capacity is reserved, equipment is installed, physical access is granted, the customer signs go-live and metering starts the revenue clock.',
    specIds: ['CUS-01', 'CAP-03', 'SEC-02'],
    lanes: ['Sales', 'Capacity', 'Field', 'Security', 'Billing'],
    laneRoles: { 'Sales': 'Program Manager', 'Capacity': 'Capacity Planner', 'Field': 'Site Technician', 'Security': 'Security Manager', 'Billing': 'Finance Manager' },
    nodes: [
      START('start', 'Contract signed', 'Sales'),
      U('contract', 'Confirm contract scope', 'Sales', 'sign-off', 8),
      U('placement_approval', 'Placement approval', 'Capacity', 'approve', 24),
      X('g_placement', 'Approved?', 'Capacity', 'reserve_capacity'),
      U('revise_placement', 'Revise placement', 'Sales', 'complete-with-evidence', 16, { row: 1 }),
      S('reserve_capacity', 'Reserve capacity', 'Capacity', 'dcos.reserve-capacity', 0.5),
      U('install', 'Install customer equipment', 'Field', 'complete-with-evidence', 48),
      U('access_grant', 'Grant access', 'Security', 'approve', 8),
      U('go_live', 'Go-live sign-off', 'Sales', 'sign-off', 8),
      S('metering', 'Start metering', 'Billing', 'dcos.start-metering', 0.5),
      END('end', 'Customer live', 'Billing'),
    ],
    flows: [
      ['start', 'contract'], ['contract', 'placement_approval'], ['placement_approval', 'g_placement'],
      ['g_placement', 'reserve_capacity', 'approved', '=approved = true'], ['g_placement', 'revise_placement', 'rejected', '=approved = false'],
      ['revise_placement', 'placement_approval'], ['reserve_capacity', 'install'], ['install', 'access_grant'], ['access_grant', 'go_live'],
      ['go_live', 'metering'], ['metering', 'end'],
    ],
  },
  // ── P04 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P04', key: 'major-incident', name: 'Major incident', owner: 'Operations',
    description: 'Runs a facility or network incident from detection to closure: alarms are correlated, impact is assessed by the severity decision table, the NOC acknowledges within 15 minutes or the duty manager is escalated to, an ITSM ticket and customer notifications run in parallel, root cause is analysed, disruptive remediation needs approval, closure checks loop until green, and SEV1/2 incidents end with a post-incident review.',
    specIds: ['OPS-01', 'OPS-03', 'ITSM-02'],
    lanes: ['NOC', 'Facility', 'ITSM', 'Customer management'],
    laneRoles: { 'NOC': 'NOC Lead', 'Facility': 'Facilities Engineer', 'ITSM': 'Administrator', 'Customer management': 'Program Manager' },
    nodes: [
      START('start', 'Incident detected', 'NOC'),
      S('correlate', 'Correlate alarms', 'NOC', 'dcos.correlate', 0.1),
      R('assess_impact', 'Assess impact', 'NOC', 'incident-severity', 'severityResult'),
      U('acknowledge', 'Acknowledge incident', 'NOC', 'acknowledge', 0.25, {
        boundaries: [{ id: 'b_ack_timeout', kind: 'timer', name: '15 min', ref: 'PT15M', to: 'escalate' }],
      }),
      U('escalate', 'Escalate to duty manager', 'NOC', 'acknowledge', 0.25, { row: 1 }),
      P('pg_fork', 'Fork', 'NOC'),
      S('open_ticket', 'Open ITSM ticket', 'ITSM', 'itsm.open-ticket', 0.1),
      S('notify_customers', 'Notify affected customers', 'Customer management', 'dcos.notify-customers', 0.25),
      P('pg_join', 'Join', 'NOC'),
      U('rca', 'Root cause analysis', 'Facility', 'complete-with-evidence', 4),
      X('g_disruptive', 'Disruptive step?', 'Facility', 'execute'),
      U('approve_disruptive', 'Approve disruptive step', 'Customer management', 'approve', 1),
      U('execute', 'Execute remediation', 'Facility', 'complete-with-evidence', 3),
      U('closure_checks', 'Closure checks', 'NOC', 'approve', 1),
      X('g_checks', 'All checks pass?', 'NOC', 'resolve'),
      S('resolve', 'Resolve & update ticket', 'ITSM', 'itsm.resolve', 0.1),
      X('g_sev', 'SEV1 / SEV2?', 'NOC', 'end'),
      U('pir', 'Post-incident review', 'Customer management', 'sign-off', 48),
      END('end', 'Incident closed', 'NOC'),
      END('end_pir', 'Closed with review', 'Customer management'),
    ],
    flows: [
      ['start', 'correlate'], ['correlate', 'assess_impact'], ['assess_impact', 'acknowledge'], ['escalate', 'acknowledge'],
      ['acknowledge', 'pg_fork'], ['pg_fork', 'open_ticket'], ['pg_fork', 'notify_customers'], ['open_ticket', 'pg_join'], ['notify_customers', 'pg_join'],
      ['pg_join', 'rca'], ['rca', 'g_disruptive'],
      ['g_disruptive', 'approve_disruptive', 'yes', '=disruptive = true'], ['g_disruptive', 'execute', 'no', '=disruptive = false'],
      ['approve_disruptive', 'execute'], ['execute', 'closure_checks'], ['closure_checks', 'g_checks'],
      ['g_checks', 'resolve', 'pass', '=approved = true'], ['g_checks', 'execute', 'fail', '=approved = false'],
      ['resolve', 'g_sev'], ['g_sev', 'pir', 'SEV1/2', '=severity = "SEV1" or severity = "SEV2"'], ['g_sev', 'end', 'SEV3/4', '=severity = "SEV3" or severity = "SEV4"'],
      ['pir', 'end_pir'],
    ],
  },
  // ── P05 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P05', key: 'change', name: 'Change', owner: 'Governance',
    description: 'Governs a change request end to end: the requester completes the request, DCOS previews impact against the live topology, the change-risk decision table sets risk and the approval path, approvers decide, the window is scheduled and waited for, the field team starts and implements, the NOC verifies service, and an implementation error or failed verification rolls the change back.',
    specIds: ['CHG-01', 'CHG-02', 'CHG-06'],
    lanes: ['Requester', 'Approvers', 'Field', 'NOC'],
    laneRoles: { 'Requester': 'Network Engineer', 'Approvers': 'Facilities Director', 'Field': 'Field Technician', 'NOC': 'NOC Lead' },
    nodes: [
      START('start', 'Change raised', 'Requester'),
      U('raise', 'Complete change request', 'Requester', 'complete-with-evidence', 4),
      S('impact_preview', 'Impact preview', 'NOC', 'dcos.impact-preview', 0.1),
      R('risk_path', 'Risk & approval path', 'Approvers', 'change-risk', 'riskResult'),
      U('approve', 'Approve change', 'Approvers', 'approve', 24),
      X('g_approved', 'Approved?', 'Approvers', 'schedule'),
      END('end_rejected', 'Rejected', 'Approvers', { row: 1 }),
      U('schedule', 'Schedule window', 'NOC', 'sign-off', 8),
      TIMER('wait_window', 'Wait for window', 'NOC', 'P1D', 72),
      U('start_change', 'Start implementation', 'Field', 'acknowledge', 0.5),
      U('implement', 'Implement change', 'Field', 'complete-with-evidence', 4, {
        boundaries: [{ id: 'b_impl_error', kind: 'error', name: 'Implementation error', ref: 'IMPLEMENTATION_ERROR', to: 'rollback' }],
      }),
      U('rollback', 'Roll back', 'Field', 'complete-with-evidence', 2, { row: 1 }),
      END('end_rolled_back', 'Rolled back', 'Field', { row: 1 }),
      U('verify', 'Verify service', 'NOC', 'approve', 1),
      X('g_verified', 'Verified?', 'NOC', 'complete'),
      S('complete', 'Complete & close', 'Requester', 'dcos.close-change', 0.1),
      END('end', 'Change complete', 'Requester'),
    ],
    flows: [
      ['start', 'raise'], ['raise', 'impact_preview'], ['impact_preview', 'risk_path'], ['risk_path', 'approve'], ['approve', 'g_approved'],
      ['g_approved', 'schedule', 'approved', '=approved = true'], ['g_approved', 'end_rejected', 'rejected', '=approved = false'],
      ['schedule', 'wait_window'], ['wait_window', 'start_change'], ['start_change', 'implement'], ['implement', 'verify'],
      ['verify', 'g_verified'], ['g_verified', 'complete', 'ok', '=approved = true'], ['g_verified', 'rollback', 'failed', '=approved = false'],
      ['rollback', 'end_rolled_back'], ['complete', 'end'],
    ],
  },
  // ── P06 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P06', key: 'capacity-expansion', name: 'Capacity expansion', owner: 'Capacity',
    description: 'Starts when a forecast crosses a site threshold: what-if options are generated, the design authority chooses one, the approval-limit decision table routes the budget to the right approver, and an approved budget creates a delivery programme whose design is baselined.',
    specIds: ['CAP-01', 'CAP-05', 'FIN-02'],
    lanes: ['Capacity', 'Finance', 'Design authority'],
    laneRoles: { 'Capacity': 'Capacity Planner', 'Finance': 'Finance Manager', 'Design authority': 'Executive' },
    nodes: [
      START('start', 'Forecast crosses threshold', 'Capacity'),
      S('whatif', 'Options & what-if', 'Capacity', 'dcos.what-if', 0.5),
      U('choose_option', 'Choose option', 'Design authority', 'approve', 40),
      R('approval_limit', 'Approval limit', 'Finance', 'approval-limit', 'approverRole'),
      U('approve_budget', 'Approve budget', 'Finance', 'approve', 72),
      X('g_budget', 'Approved?', 'Finance', 'create_programme'),
      U('rework', 'Rework options', 'Capacity', 'complete-with-evidence', 24, { row: 1 }),
      S('create_programme', 'Create programme', 'Capacity', 'dcos.create-programme', 0.25),
      U('baseline_design', 'Baseline design', 'Design authority', 'sign-off', 16),
      END('end', 'Programme created', 'Design authority'),
    ],
    flows: [
      ['start', 'whatif'], ['whatif', 'choose_option'], ['choose_option', 'approval_limit'], ['approval_limit', 'approve_budget'], ['approve_budget', 'g_budget'],
      ['g_budget', 'create_programme', 'approved', '=approved = true'], ['g_budget', 'rework', 'rejected', '=approved = false'], ['rework', 'whatif'],
      ['create_programme', 'baseline_design'], ['baseline_design', 'end'],
    ],
  },
  // ── P07 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P07', key: 'firmware-campaign', name: 'Firmware campaign', owner: 'Network',
    description: 'Remediates a posture finding across the fleet in waves: network plans the waves, change approves each wave, firmware is pushed, the field verifies the wave (recovering by hand if a push fails) and the loop repeats until no waves remain, closing the finding.',
    specIds: ['NET-03', 'SEC-04', 'CHG-04'],
    lanes: ['Network', 'Change', 'Field'],
    laneRoles: { 'Network': 'Network Engineer', 'Change': 'Facilities Director', 'Field': 'Site Technician' },
    nodes: [
      START('start', 'Posture finding', 'Network'),
      U('plan_waves', 'Plan waves', 'Network', 'complete-with-evidence', 8),
      U('approve_wave', 'Approve wave', 'Change', 'approve', 24),
      X('g_wave_ok', 'Approved?', 'Change', 'push'),
      S('push', 'Push firmware', 'Network', 'nms.push-firmware', 2, {
        boundaries: [{ id: 'b_push_failed', kind: 'error', name: 'Push failed', ref: 'PUSH_FAILED', to: 'hands_on' }],
      }),
      U('hands_on', 'Hands-on recovery', 'Field', 'complete-with-evidence', 4, { row: 1 }),
      U('verify', 'Verify wave', 'Field', 'complete-with-evidence', 4),
      X('g_more', 'More waves?', 'Network', 'close'),
      S('close', 'Close finding', 'Network', 'dcos.close-finding', 0.1),
      END('end', 'Campaign closed', 'Network'),
    ],
    flows: [
      ['start', 'plan_waves'], ['plan_waves', 'approve_wave'], ['approve_wave', 'g_wave_ok'],
      ['g_wave_ok', 'push', 'approved', '=approved = true'], ['g_wave_ok', 'plan_waves', 'replan', '=approved = false'],
      ['push', 'verify'], ['hands_on', 'verify'], ['verify', 'g_more'],
      ['g_more', 'approve_wave', 'next wave', '=remainingWaves > 0'], ['g_more', 'close', 'done', '=remainingWaves = 0'],
      ['close', 'end'],
    ],
  },
  // ── P08 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P08', key: 'decommission', name: 'Decommission', owner: 'Operations',
    description: 'Retires equipment safely: the request is reviewed, blocking checks (live services, open changes, holds) must clear, the tenant ceases services, security wipes and certifies media, the field removes the kit under chain of custody, it is disposed of and finance closes the contracts.',
    specIds: ['DEC-01', 'SEC-05', 'FIN-03'],
    lanes: ['Operations', 'Tenant', 'Security', 'Field', 'Finance'],
    laneRoles: { 'Operations': 'Facilities Director', 'Tenant': 'Program Manager', 'Security': 'Security Manager', 'Field': 'Field Technician', 'Finance': 'Finance Manager' },
    nodes: [
      START('start', 'Decommission requested', 'Operations'),
      U('request', 'Review request', 'Operations', 'approve', 24),
      S('blocking_checks', 'Blocking checks', 'Operations', 'dcos.blocking-checks', 0.25),
      X('g_blocked', 'Blocked?', 'Operations', 'cease'),
      U('resolve_blockers', 'Resolve blockers', 'Tenant', 'complete-with-evidence', 48),
      U('cease', 'Cease services', 'Tenant', 'sign-off', 24),
      U('wipe', 'Wipe & certify', 'Security', 'complete-with-evidence', 16),
      U('remove', 'Remove under custody', 'Field', 'complete-with-evidence', 8),
      S('dispose', 'Dispose / recycle', 'Field', 'dcos.dispose', 48),
      U('close_contracts', 'Close contracts', 'Finance', 'sign-off', 24),
      END('end', 'Decommissioned', 'Finance'),
    ],
    flows: [
      ['start', 'request'], ['request', 'blocking_checks'], ['blocking_checks', 'g_blocked'],
      ['g_blocked', 'resolve_blockers', 'blocked', '=blocked = true'], ['g_blocked', 'cease', 'clear', '=blocked = false'],
      ['resolve_blockers', 'blocking_checks'], ['cease', 'wipe'], ['wipe', 'remove'], ['remove', 'dispose'], ['dispose', 'close_contracts'], ['close_contracts', 'end'],
    ],
  },
  // ── P09 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P09', key: 'reconciliation', name: 'Reconciliation', owner: 'Platform',
    description: 'Resolves one difference between the record of truth and discovery: the difference is classified, the hall owner decides to accept the discovered state, keep the record or send someone to look, a confirming walk updates the record, and every outcome is written to the audit trail.',
    specIds: ['REC-01', 'REC-03'],
    lanes: ['DCOS', 'Hall owner', 'Field'],
    laneRoles: { 'DCOS': 'Platform Owner', 'Hall owner': 'Facilities Engineer', 'Field': 'Site Technician' },
    nodes: [
      START('start', 'Discovery difference', 'DCOS'),
      S('classify', 'Classify difference', 'DCOS', 'dcos.classify-diff', 0.1),
      U('decide', 'Decide', 'Hall owner', 'decide-reconciliation', 24),
      X('g_decision', 'Decision', 'Hall owner', 'audit'),
      U('walk', 'Confirm by walk', 'Field', 'complete-with-evidence', 8),
      S('update_record', 'Update record', 'DCOS', 'dcos.update-record', 0.1),
      S('audit', 'Write audit entry', 'DCOS', 'dcos.audit', 0.1),
      END('end', 'Reconciled', 'DCOS'),
    ],
    flows: [
      ['start', 'classify'], ['classify', 'decide'], ['decide', 'g_decision'],
      ['g_decision', 'update_record', 'accept discovered', '=decision = "accept"'], ['g_decision', 'walk', 'confirm by walk', '=decision = "walk"'], ['g_decision', 'audit', 'keep record', '=decision = "keep"'],
      ['walk', 'update_record'], ['update_record', 'audit'], ['audit', 'end'],
    ],
  },
  // ── P10 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P10', key: 'work-order', name: 'Work order', owner: 'Field operations',
    description: 'The field work-order loop: the work-type decision table sets the skill and permit required, the dispatcher assigns a technician who must accept within four hours or the order is reassigned, work is started and completed with photo evidence, the requester verifies (sending it back if not accepted) and the order is closed.',
    specIds: ['FLD-01', 'FLD-02', 'FLD-07'],
    lanes: ['Dispatcher', 'Technician', 'Requester'],
    laneRoles: { 'Dispatcher': 'Facilities Engineer', 'Technician': 'Field Technician', 'Requester': 'Project Manager' },
    nodes: [
      START('start', 'Work order created', 'Requester'),
      R('skill', 'Required skill & permit', 'Dispatcher', 'work-type-skill', 'skillResult'),
      U('assign', 'Assign technician', 'Dispatcher', 'approve', 2),
      U('accept', 'Accept', 'Technician', 'acknowledge', 4, {
        boundaries: [{ id: 'b_not_accepted', kind: 'timer', name: 'Not accepted in 4 h', ref: 'PT4H', to: 'assign' }],
      }),
      U('start_work', 'Start work', 'Technician', 'acknowledge', 8),
      U('complete', 'Complete with evidence', 'Technician', 'complete-with-evidence', 6),
      U('verify', 'Verify work', 'Requester', 'approve', 8),
      X('g_ok', 'Accepted?', 'Requester', 'close'),
      S('close', 'Close work order', 'Dispatcher', 'dcos.close-work-order', 0.1),
      END('end', 'Work order closed', 'Dispatcher'),
    ],
    flows: [
      ['start', 'skill'], ['skill', 'assign'], ['assign', 'accept'], ['accept', 'start_work'], ['start_work', 'complete'], ['complete', 'verify'], ['verify', 'g_ok'],
      ['g_ok', 'close', 'accepted', '=approved = true'], ['g_ok', 'complete', 'rework', '=approved = false'], ['close', 'end'],
    ],
  },
  // ── P11 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P11', key: 'maintenance-mode', name: 'Maintenance mode', owner: 'Facilities',
    description: 'Planned plant maintenance: when a schedule falls due the redundancy impact is confirmed, approvers accept the window (or it is rescheduled), the equipment enters maintenance mode so alarms are suppressed and capacity is fenced, the vendor performs the work, maintenance mode is exited and the results are recorded against the asset.',
    specIds: ['FAC-02', 'FAC-04', 'OPS-06'],
    lanes: ['Facility', 'Approvers', 'Vendor'],
    laneRoles: { 'Facility': 'Facilities Engineer', 'Approvers': 'Facilities Director', 'Vendor': 'Vendor Project Manager' },
    nodes: [
      START('start', 'Maintenance due', 'Facility'),
      S('redundancy', 'Confirm redundancy impact', 'Facility', 'dcos.redundancy-impact', 0.25),
      U('approve_window', 'Approve window', 'Approvers', 'approve', 24),
      X('g_window', 'Approved?', 'Approvers', 'wait'),
      U('reschedule', 'Reschedule', 'Facility', 'complete-with-evidence', 8, { row: 1 }),
      TIMER('wait', 'Wait for window', 'Facility', 'P2D', 48),
      S('enter_mm', 'Enter maintenance mode', 'Facility', 'dcos.maintenance-mode-enter', 0.1),
      U('perform', 'Perform maintenance', 'Vendor', 'complete-with-evidence', 6),
      S('exit_mm', 'Exit maintenance mode', 'Facility', 'dcos.maintenance-mode-exit', 0.1),
      U('record', 'Record results', 'Facility', 'sign-off', 4),
      END('end', 'Maintenance recorded', 'Facility'),
    ],
    flows: [
      ['start', 'redundancy'], ['redundancy', 'approve_window'], ['approve_window', 'g_window'],
      ['g_window', 'wait', 'approved', '=approved = true'], ['g_window', 'reschedule', 'rejected', '=approved = false'], ['reschedule', 'redundancy'],
      ['wait', 'enter_mm'], ['enter_mm', 'perform'], ['perform', 'exit_mm'], ['exit_mm', 'record'], ['record', 'end'],
    ],
  },
  // ── P12 ───────────────────────────────────────────────────────────────────
  {
    pid: 'P12', key: 'access-request', name: 'Access request', owner: 'Security',
    description: 'Controls a physical visit: the tenant requests access, security approves the zones (or denies), the visitor checks in, the host escorts the visit — a long visit needs an extension approval — and the visitor checks out, closing the record.',
    specIds: ['SEC-01', 'SEC-03'],
    lanes: ['Host', 'Security', 'Tenant'],
    laneRoles: { 'Host': 'Site Technician', 'Security': 'Security Manager', 'Tenant': 'Program Manager' },
    nodes: [
      START('start', 'Access requested', 'Tenant'),
      U('request', 'Submit visit request', 'Tenant', 'complete-with-evidence', 2),
      U('approve_zones', 'Approve zones', 'Security', 'approve', 8),
      X('g_zones', 'Approved?', 'Security', 'check_in'),
      END('end_denied', 'Denied', 'Security', { row: 1 }),
      U('check_in', 'Check in', 'Security', 'acknowledge', 24),
      U('escorted', 'Escorted visit', 'Host', 'complete-with-evidence', 4, {
        boundaries: [{ id: 'b_long_visit', kind: 'timer', name: 'Over 8 h', ref: 'PT8H', nonInterrupting: true, to: 'extend' }],
      }),
      U('extend', 'Approve extension', 'Security', 'approve', 1, { row: 1 }),
      U('check_out', 'Check out', 'Security', 'acknowledge', 1),
      END('end', 'Visit complete', 'Security'),
    ],
    flows: [
      ['start', 'request'], ['request', 'approve_zones'], ['approve_zones', 'g_zones'],
      ['g_zones', 'check_in', 'approved', '=approved = true'], ['g_zones', 'end_denied', 'denied', '=approved = false'],
      ['check_in', 'escorted'], ['escorted', 'check_out'], ['extend', 'check_out'], ['check_out', 'end'],
    ],
  },
];

export const PROCESS_BY_KEY: Record<string, WfProcess> = Object.fromEntries(PROCESSES.map((p) => [p.key, p]));

export function nodeById(p: WfProcess, id: string): WfNode | undefined { return p.nodes.find((n) => n.id === id); }
export function outgoing(p: WfProcess, id: string): WfFlow[] { return p.flows.filter((f) => f[0] === id); }
export function incoming(p: WfProcess, id: string): WfFlow[] { return p.flows.filter((f) => f[1] === id); }

/**
 * Shortest path (by hops) from the start event to `target`, never re-entering a node —
 * the path the seed marks as completed when it places a token on `target`.
 */
export function pathTo(p: WfProcess, target: string): string[] {
  const start = p.nodes.find((n) => n.type === 'start')!;
  const prev = new Map<string, string | null>([[start.id, null]]);
  const queue = [start.id];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === target) break;
    const node = nodeById(p, cur);
    const nexts = outgoing(p, cur).map((f) => f[1]).concat((node?.boundaries ?? []).map((b) => b.to));
    for (const nx of nexts) if (!prev.has(nx)) { prev.set(nx, cur); queue.push(nx); }
  }
  if (!prev.has(target)) return [start.id];
  const path: string[] = [];
  for (let c: string | null = target; c; c = prev.get(c) ?? null) path.unshift(c);
  return path;
}

/** Evaluate the tiny FEEL subset the model uses: `=a = true`, `=x > 0`, `=s = "A" or s = "B"`. */
export function evalCondition(cond: string | undefined, vars: Record<string, unknown>): boolean {
  if (!cond) return false;
  const expr = cond.replace(/^=/, '').trim();
  return expr.split(/\s+or\s+/i).some((clause) => {
    const m = clause.trim().match(/^([A-Za-z_][\w.]*)\s*(=|!=|>=|<=|>|<)\s*(.+)$/);
    if (!m) return false;
    const [, name, op, rawRhs] = m;
    const lhs = vars[name];
    const rhsText = rawRhs.trim();
    const rhs: unknown = rhsText === 'true' ? true : rhsText === 'false' ? false
      : /^-?\d+(\.\d+)?$/.test(rhsText) ? Number(rhsText) : rhsText.replace(/^"(.*)"$/, '$1');
    switch (op) {
      case '=': return lhs === rhs || (lhs == null && rhs === false) || (typeof rhs === 'number' && Number(lhs ?? 0) === rhs);
      case '!=': return lhs !== rhs;
      case '>': return Number(lhs ?? 0) > Number(rhs);
      case '>=': return Number(lhs ?? 0) >= Number(rhs);
      case '<': return Number(lhs ?? 0) < Number(rhs);
      case '<=': return Number(lhs ?? 0) <= Number(rhs);
      default: return false;
    }
  });
}
