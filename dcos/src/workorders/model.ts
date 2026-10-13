/**
 * Process model — the single source of truth for the Camunda 8 processes DCOS runs: the
 * twelve operational processes (P01 … P12) and one delivery process per project template
 * (PRJ-01 … PRJ-17, see PROJECT_PROCESSES).
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
  /** Message name for intermediate message catch events (the token waits until the message is correlated). */
  message?: string;
  /** Project processes: the project milestone that is done once this node has completed. */
  milestone?: string;
  /**
   * User tasks: 'record' when the step is done on the record's own page (the work order or the
   * change), whose actions complete the task and update the record together. Task lists link to
   * the record instead of showing the form. Exported as the zeebe:property `completeOn`.
   */
  completeOn?: 'record';
  /** Record-backed user tasks: what to do on the record, in plain words. */
  recordAction?: string;
  /** Record-backed user tasks: the tab of the record page where it is done (?tab=). */
  recordTab?: string;
}

/** [from, to, label?, FEEL condition?] */
export type WfFlow = readonly [from: string, to: string, name?: string, condition?: string];

export interface WfProcess {
  /** Catalogue id (P01 … P12, PRJ-01 … PRJ-17). */
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
const MSG = (id: string, name: string, lane: string, message: string, hours: number, extra: Partial<WfNode> = {}): WfNode => ({ id, name, type: 'messageCatch', lane, message, hours, ...extra });
/** A user task done on its record's page (see WfNode.completeOn). */
const ON_RECORD = (recordAction: string, recordTab?: string): Partial<WfNode> => ({ completeOn: 'record', recordAction, ...(recordTab ? { recordTab } : {}) });

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
      U('check_collectors', 'Check collector health', 'Platform collectors', 'run-checks', 2, { row: 1 }),
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
      U('design_review', 'Design review', 'Design', 'design-review', 40),
      U('approve_pos', 'Approve POs', 'Procurement', 'commercial-approval', 24),
      U('receive_stage', 'Receive & stage', 'Field', 'receive-delivery', 120, {
        boundaries: [{ id: 'b_delivery_delayed', kind: 'message', name: 'Delivery delayed', ref: 'delivery-delayed', nonInterrupting: true, to: 'expedite' }],
      }),
      U('expedite', 'Expedite with vendor', 'Procurement', 'chase-up', 8, { row: 1 }),
      U('install', 'Install racks, power & cabling', 'Field', 'install-record', 160),
      S('provision', 'Provision devices', 'Operations', 'dcos.provision', 8),
      U('commission', 'Commissioning L1–L5', 'Commissioning', 'acceptance-tests', 80),
      X('g_defects', 'Defects?', 'Commissioning', 'handover'),
      U('fix_defects', 'Fix defects', 'Field', 'fix-findings', 24, { row: 1 }),
      U('handover', 'Handover sign-off', 'Operations', 'handover', 16),
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
      U('install', 'Install customer equipment', 'Field', 'install-record', 48),
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
      U('rca', 'Root cause analysis', 'Facility', 'root-cause', 4),
      X('g_disruptive', 'Disruptive step?', 'Facility', 'execute'),
      U('approve_disruptive', 'Approve disruptive step', 'Customer management', 'approve', 1),
      U('execute', 'Execute remediation', 'Facility', 'remediation', 3),
      U('closure_checks', 'Closure checks', 'NOC', 'run-checks', 1),
      X('g_checks', 'All checks pass?', 'NOC', 'resolve'),
      S('resolve', 'Resolve & update ticket', 'ITSM', 'itsm.resolve', 0.1),
      X('g_sev', 'SEV1 / SEV2?', 'NOC', 'end'),
      U('pir', 'Post-incident review', 'Customer management', 'post-incident-review', 48),
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
      U('raise', 'Complete change request', 'Requester', 'complete-with-evidence', 4, ON_RECORD('Complete the change and submit it for approval on the change page.')),
      S('impact_preview', 'Impact preview', 'NOC', 'dcos.impact-preview', 0.1),
      R('risk_path', 'Risk & approval path', 'Approvers', 'change-risk', 'riskResult'),
      U('approve', 'Approve change', 'Approvers', 'approve', 24, ON_RECORD('Each approver decides their step on the change\'s Approvals tab. This task completes when every step is decided.', 'approvals')),
      X('g_approved', 'Approved?', 'Approvers', 'schedule'),
      END('end_rejected', 'Rejected', 'Approvers', { row: 1 }),
      U('schedule', 'Schedule window', 'NOC', 'sign-off', 8, ON_RECORD('Book the maintenance window on the change\'s Window tab.', 'window')),
      TIMER('wait_window', 'Wait for window', 'NOC', 'P1D', 72),
      U('start_change', 'Start implementation', 'Field', 'acknowledge', 0.5, ON_RECORD('Start the work from the change or its work order (Start work).')),
      U('implement', 'Implement change', 'Field', 'complete-with-evidence', 4, {
        ...ON_RECORD('Complete the work on the change or its work order. Recording it as failed rolls the change back.'),
        boundaries: [{ id: 'b_impl_error', kind: 'error', name: 'Implementation error', ref: 'IMPLEMENTATION_ERROR', to: 'rollback' }],
      }),
      U('rollback', 'Roll back', 'Field', 'complete-with-evidence', 2, { row: 1 }),
      END('end_rolled_back', 'Rolled back', 'Field', { row: 1 }),
      U('verify', 'Verify service', 'NOC', 'approve', 1, ON_RECORD('Record the post-implementation review on the change\'s Review tab.', 'review')),
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
      U('approve_budget', 'Approve budget', 'Finance', 'commercial-approval', 72),
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
      U('hands_on', 'Hands-on recovery', 'Field', 'remediation', 4, { row: 1 }),
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
      U('wipe', 'Wipe & certify', 'Security', 'media-sanitisation', 16),
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
    description: 'The field work-order loop: the work-type decision table sets the skill and permit required, the dispatcher assigns a technician who must accept within four hours or the order is reassigned. When the work order has materials, the kit is requested from the supply chain platform and the technician confirms it arrived (starting work confirms it too: materials never block the work). Work is started and completed with photo evidence; the technician records the serials and quantities used and returns unused or faulty parts (faulty serialised items go back by RMA); the requester verifies (sending it back if not accepted) and the order is closed.',
    specIds: ['FLD-01', 'FLD-02', 'FLD-07'],
    lanes: ['Dispatcher', 'Technician', 'Requester', 'Supply chain'],
    laneRoles: { 'Dispatcher': 'Facilities Engineer', 'Technician': 'Field Technician', 'Requester': 'Project Manager', 'Supply chain': 'Facilities Engineer' },
    nodes: [
      START('start', 'Work order created', 'Requester'),
      R('skill', 'Required skill & permit', 'Dispatcher', 'work-type-skill', 'skillResult'),
      U('assign', 'Assign technician', 'Dispatcher', 'approve', 2, ON_RECORD('Assign a technician or a contractor crew on the work order\'s Assignment tab.', 'assignment')),
      U('accept', 'Accept', 'Technician', 'acknowledge', 4, {
        ...ON_RECORD('Accepted when the technician starts the work on the work order (Start work).'),
        boundaries: [{ id: 'b_not_accepted', kind: 'timer', name: 'Not accepted in 4 h', ref: 'PT4H', to: 'assign' }],
      }),
      X('g_kit', 'Materials needed?', 'Technician', 'start_work'),
      S('request_kit', 'Request kit', 'Supply chain', 'dcos.request-kit', 0.1),
      U('confirm_kit', 'Confirm kit received', 'Technician', 'acknowledge', 4, ON_RECORD('Confirm the kit under Materials on the work order\'s Execution tab, noting anything short or faulty. Starting the work confirms it too.', 'execution')),
      U('start_work', 'Start work', 'Technician', 'acknowledge', 8, ON_RECORD('Start the work on the work order (Start work). It checks the change, the window and site access first.')),
      U('complete', 'Complete with evidence', 'Technician', 'complete-with-evidence', 6, ON_RECORD('Sign the work off on the work order\'s Execution tab.', 'execution')),
      X('g_used', 'Materials used?', 'Technician', 'verify'),
      U('record_materials', 'Record serials and quantities', 'Technician', 'complete-with-evidence', 1, ON_RECORD('Record the serials and quantities used under Materials on the work order\'s Execution tab.', 'execution')),
      U('return_parts', 'Return unused or faulty parts', 'Technician', 'acknowledge', 2, ON_RECORD('Return unused or faulty parts under Materials on the work order\'s Execution tab.', 'execution')),
      U('verify', 'Verify work', 'Requester', 'approve', 8),
      X('g_ok', 'Accepted?', 'Requester', 'close'),
      S('close', 'Close work order', 'Dispatcher', 'dcos.close-work-order', 0.1),
      END('end', 'Work order closed', 'Dispatcher'),
    ],
    flows: [
      ['start', 'skill'], ['skill', 'assign'], ['assign', 'accept'], ['accept', 'g_kit'],
      ['g_kit', 'request_kit', 'materials', '=hasMaterials = true'], ['g_kit', 'start_work', 'none', '=hasMaterials = false'], ['request_kit', 'confirm_kit'], ['confirm_kit', 'start_work'],
      ['start_work', 'complete'], ['complete', 'g_used'],
      ['g_used', 'record_materials', 'materials', '=hasMaterials = true'], ['g_used', 'verify', 'none', '=hasMaterials = false'], ['record_materials', 'return_parts'], ['return_parts', 'verify'], ['verify', 'g_ok'],
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
      U('request', 'Submit visit request', 'Tenant', 'visit-request', 2),
      U('approve_zones', 'Approve zones', 'Security', 'approve', 8),
      X('g_zones', 'Approved?', 'Security', 'check_in'),
      END('end_denied', 'Denied', 'Security', { row: 1 }),
      U('check_in', 'Check in', 'Security', 'visit-check-in', 24),
      U('escorted', 'Escorted visit', 'Host', 'complete-with-evidence', 4, {
        boundaries: [{ id: 'b_long_visit', kind: 'timer', name: 'Over 8 h', ref: 'PT8H', nonInterrupting: true, to: 'extend' }],
      }),
      U('extend', 'Approve extension', 'Security', 'approve', 1, { row: 1 }),
      U('check_out', 'Check out', 'Security', 'visit-check-out', 1),
      END('end', 'Visit complete', 'Security'),
    ],
    flows: [
      ['start', 'request'], ['request', 'approve_zones'], ['approve_zones', 'g_zones'],
      ['g_zones', 'check_in', 'approved', '=approved = true'], ['g_zones', 'end_denied', 'denied', '=approved = false'],
      ['check_in', 'escorted'], ['escorted', 'check_out'], ['extend', 'check_out'], ['check_out', 'end'],
    ],
  },
];

// ── Project processes (PRJ-01 … PRJ-17) ─────────────────────────────────────
// One process per delivery project template. A project starts its template's process when it
// is created. Steps that touch the estate are *work steps*: a service task raises the step's
// work orders (each with its own change request) and a message catch waits until every one of
// them is closed ("work-orders-closed", correlated by the delivery chain). Gates are exclusive
// gateways on the form data of the task before them; `milestone` marks the node whose
// completion completes a project milestone (names match the template's milestones).

const PM = 'Project manager', DES = 'Design', PROC = 'Procurement', CON = 'Contractor', INST = 'Installation';
const CX = 'Commissioning', OPS = 'Operations', NETD = 'Network design', SEC = 'Security', LEAD = 'Leadership', QA = 'Quality and inspection';

/** Work step: raise the step's work orders and changes, then wait until they are all closed. */
const WORK = (id: string, what: string, lane: string, hours: number, opts: { milestone?: string; raiseMilestone?: string } = {}): WfNode[] => [
  S(`raise_${id}`, `Raise ${what} work orders`, lane, 'dcos.raise-work-orders', 0.1, opts.raiseMilestone ? { milestone: opts.raiseMilestone } : {}),
  MSG(`wait_${id}`, `${what.charAt(0).toUpperCase()}${what.slice(1)} work closed`, lane, 'work-orders-closed', hours, opts.milestone ? { milestone: opts.milestone } : {}),
];
const seq = (...ids: string[]): WfFlow[] => ids.slice(1).map((id, i) => [ids[i], id] as const);
const w = (id: string) => [`raise_${id}`, `wait_${id}`];
const DELAYED = (to: string): WfBoundary => ({ id: `b_delayed_${to}`, kind: 'message', name: 'Delivery delayed', ref: 'delivery-delayed', nonInterrupting: true, to });
const PASS = '=failedTests = 0', FAIL = '=failedTests > 0', OK = '=approved = true', NOK = '=approved = false', CLEAN = '=snags = 0', SNAGS = '=snags > 0';

function project(pid: string, key: string, name: string, description: string, lanes: [string, string][], nodes: WfNode[], flows: WfFlow[], specIds: string[]): WfProcess {
  return { pid, key, name, owner: 'Delivery', description, specIds, lanes: lanes.map(l => l[0]), laneRoles: Object.fromEntries(lanes), nodes, flows };
}

export const PROJECT_PROCESSES: WfProcess[] = [
  // ── PRJ-01 Greenfield DC build ───────────────────────────────────────────
  project('PRJ-01', 'project-greenfield-build', 'Greenfield DC build',
    'Runs a new data centre from approved build to ready for service: the site design is signed, permits and consents are checked (a permit nearing expiry triggers a renewal), construction contracts are awarded, construction work orders run under change, long-lead plant is received and installed, acceptance tests L1–L5 must pass, the network backbone is built, operations takes the site over once snags are closed and capacity is released.',
    [[PM, 'Project Manager'], [DES, 'Facilities Engineer'], [PROC, 'Finance Manager'], [CON, 'Vendor Project Manager'], [CX, 'Commissioning Engineer'], [OPS, 'Facilities Director']],
    [
      START('start', 'Build approved', PM),
      U('design', 'Sign off site design', DES, 'sign-off', 240, { milestone: 'Site design' }),
      U('check_permits', 'Check permits and consents', PM, 'permit-check', 80, { boundaries: [{ id: 'b_permit_expiry', kind: 'timer', name: 'Permit nearing expiry', ref: 'P30D', nonInterrupting: true, to: 'renew_permit' }] }),
      U('renew_permit', 'Renew permit', PM, 'complete-with-evidence', 40, { row: 1 }),
      X('g_permit', 'Permits approved?', PM, 'award'),
      U('chase_permits', 'Chase the authority', PM, 'chase-up', 80, { row: 1 }),
      U('award', 'Award construction contracts', PROC, 'commercial-approval', 120, { milestone: 'Permitting' }),
      ...WORK('construction', 'construction', CON, 2000, { milestone: 'Construction' }),
      U('receive_plant', 'Receive long-lead plant', PROC, 'receive-delivery', 400, { boundaries: [DELAYED('expedite')] }),
      U('expedite', 'Expedite with the vendor', PROC, 'chase-up', 16, { row: 1 }),
      ...WORK('plant', 'plant installation', CON, 1200),
      U('acceptance', 'Witness acceptance tests L1–L5', CX, 'acceptance-tests', 240),
      X('g_atp', 'ATP passed?', CX, 'raise_backbone'),
      U('fix_tests', 'Fix failed tests', CON, 'fix-findings', 80, { row: 1 }),
      ...WORK('backbone', 'network backbone', CON, 360, { raiseMilestone: 'Power & cooling commissioning', milestone: 'Network backbone' }),
      U('handover', 'Hand over to operations', OPS, 'handover', 40),
      X('g_snags', 'Snags closed?', OPS, 'release'),
      U('close_snags', 'Close snags', CON, 'fix-findings', 40, { row: 1 }),
      S('release', 'Release capacity', OPS, 'dcos.release-capacity', 0.5, { milestone: 'Handover' }),
      END('end', 'Site ready for service', OPS),
    ],
    [
      ...seq('start', 'design', 'check_permits', 'g_permit'), ['renew_permit', 'check_permits'],
      ['g_permit', 'award', 'approved', OK], ['g_permit', 'chase_permits', 'not yet', NOK], ['chase_permits', 'check_permits'],
      ...seq('award', ...w('construction'), 'receive_plant'), ['expedite', 'receive_plant'],
      ...seq('receive_plant', ...w('plant'), 'acceptance', 'g_atp'),
      ['g_atp', 'raise_backbone', 'passed', PASS], ['g_atp', 'fix_tests', 'failed tests', FAIL], ['fix_tests', 'acceptance'],
      ...seq(...w('backbone'), 'handover', 'g_snags'),
      ['g_snags', 'release', 'closed', CLEAN], ['g_snags', 'close_snags', 'open snags', SNAGS], ['close_snags', 'handover'], ['release', 'end'],
    ], ['BLD-01', 'BLD-02', 'CX-01', 'CHG-01']),

  // ── PRJ-02 Hall fit-out ──────────────────────────────────────────────────
  project('PRJ-02', 'project-hall-fitout', 'Hall fit-out',
    'Fits out an empty hall to ready for service: the design is reviewed (and revised if rejected), purchase orders are released, kit is received and staged (a delivery delay starts an expedite), then power and cooling, racks and containment, and the network fabric are installed as work orders under change. Integrated commissioning must pass before devices are provisioned, operations signs the handover once snags are closed and the capacity is released.',
    [[PM, 'Project Manager'], [DES, 'Facilities Engineer'], [PROC, 'Finance Manager'], [CON, 'Vendor Project Manager'], [CX, 'Commissioning Engineer'], [OPS, 'Facilities Director']],
    [
      START('start', 'Fit-out approved', PM),
      U('design', 'Review hall design', DES, 'design-review', 96),
      X('g_design', 'Design approved?', DES, 'release_pos'),
      U('revise_design', 'Revise design', DES, 'complete-with-evidence', 40, { row: 1 }),
      U('release_pos', 'Release purchase orders', PROC, 'commercial-approval', 40, { milestone: 'Design sign-off' }),
      U('receive', 'Receive and stage kit', PROC, 'receive-delivery', 240, { boundaries: [DELAYED('expedite')] }),
      U('expedite', 'Expedite with the vendor', PROC, 'chase-up', 16, { row: 1 }),
      ...WORK('power', 'power and cooling', CON, 600, { milestone: 'Power & cooling fit' }),
      ...WORK('racks', 'rack and containment', CON, 300, { milestone: 'Rack install' }),
      ...WORK('network', 'network fabric', CON, 240, { milestone: 'Spine/leaf network' }),
      U('commission', 'Integrated commissioning L3–L5', CX, 'acceptance-tests', 160),
      X('g_atp', 'ATP passed?', CX, 'provision'),
      U('fix_tests', 'Fix failed tests', CON, 'fix-findings', 40, { row: 1 }),
      S('provision', 'Provision devices', OPS, 'dcos.provision', 8, { milestone: 'Commissioning' }),
      U('handover', 'Handover sign-off', OPS, 'handover', 24),
      X('g_snags', 'Snags closed?', OPS, 'release'),
      U('close_snags', 'Close snags', CON, 'fix-findings', 24, { row: 1 }),
      S('release', 'Release capacity', OPS, 'dcos.release-capacity', 0.5, { milestone: 'Handover' }),
      END('end', 'Hall in service', OPS),
    ],
    [
      ...seq('start', 'design', 'g_design'), ['g_design', 'release_pos', 'approved', OK], ['g_design', 'revise_design', 'rejected', NOK], ['revise_design', 'design'],
      ...seq('release_pos', 'receive', ...w('power'), ...w('racks'), ...w('network'), 'commission', 'g_atp'), ['expedite', 'receive'],
      ['g_atp', 'provision', 'passed', PASS], ['g_atp', 'fix_tests', 'failed tests', FAIL], ['fix_tests', 'commission'],
      ...seq('provision', 'handover', 'g_snags'), ['g_snags', 'release', 'closed', CLEAN], ['g_snags', 'close_snags', 'open snags', SNAGS], ['close_snags', 'handover'], ['release', 'end'],
    ], ['BLD-02', 'BLD-05', 'CX-01', 'CHG-01']),

  // ── PRJ-03 Rack deployment ───────────────────────────────────────────────
  project('PRJ-03', 'project-rack-deployment', 'Rack deployment',
    'Deploys a set of racks into a live hall: rack elevations and the power budget are approved (re-planned if power or space is short), racks and kit are ordered and received, then rack-and-stack, cabling and power, and burn-in run as work orders under change (most are standard changes). Failed burn-in results go back to installation; operations accepts the racks and the capacity is released.',
    [[PM, 'Project Manager'], [DES, 'Capacity Planner'], [PROC, 'Finance Manager'], [INST, 'Field Technician'], [OPS, 'Facilities Director']],
    [
      START('start', 'Deployment approved', PM),
      U('design', 'Approve rack elevations and power budget', DES, 'design-review', 32),
      X('g_capacity', 'Power and space confirmed?', DES, 'order'),
      U('replan', 'Re-plan placement', DES, 'complete-with-evidence', 16, { row: 1 }),
      U('order', 'Order racks and kit', PROC, 'commercial-approval', 24, { milestone: 'Design' }),
      U('receive', 'Receive and stage kit', PROC, 'receive-delivery', 120, { boundaries: [DELAYED('expedite')] }),
      U('expedite', 'Expedite with the vendor', PROC, 'chase-up', 8, { row: 1 }),
      ...WORK('install', 'rack and stack', INST, 48, { raiseMilestone: 'Procure', milestone: 'Install' }),
      ...WORK('cabling', 'cabling and power', INST, 40, { milestone: 'Cable' }),
      ...WORK('burnin', 'burn-in', INST, 32),
      U('validate', 'Validate burn-in results', OPS, 'acceptance-tests', 8),
      X('g_tests', 'Tests passed?', OPS, 'handover'),
      U('fix', 'Fix failed nodes', INST, 'fix-findings', 16, { row: 1 }),
      U('handover', 'Accept racks into operations', OPS, 'handover', 16, { milestone: 'Commission' }),
      S('release', 'Release capacity', OPS, 'dcos.release-capacity', 0.5, { milestone: 'Handover' }),
      END('end', 'Racks in service', OPS),
    ],
    [
      ...seq('start', 'design', 'g_capacity'), ['g_capacity', 'order', 'confirmed', OK], ['g_capacity', 'replan', 'short', NOK], ['replan', 'design'],
      ...seq('order', 'receive', ...w('install'), ...w('cabling'), ...w('burnin'), 'validate', 'g_tests'), ['expedite', 'receive'],
      ['g_tests', 'handover', 'passed', PASS], ['g_tests', 'fix', 'failed nodes', FAIL], ['fix', 'validate'],
      ...seq('handover', 'release', 'end'),
    ], ['BLD-03', 'CHG-01', 'FLD-01']),

  // ── PRJ-04 Capacity expansion ────────────────────────────────────────────
  project('PRJ-04', 'project-capacity-expansion', 'Capacity expansion',
    'Adds compute, GPU, storage or power capacity to a live site: the power and cooling study must confirm headroom, purchase orders are released and kit received, installation and burn-in run as work orders under change, operations approves the cut-over (fixes go back to installation), the cut-over runs in a change window and operations accepts the capacity.',
    [[PM, 'Project Manager'], [DES, 'Capacity Planner'], [PROC, 'Finance Manager'], [INST, 'Field Technician'], [OPS, 'Facilities Director']],
    [
      START('start', 'Expansion approved', PM),
      U('study', 'Confirm power and cooling study', DES, 'design-review', 48),
      X('g_headroom', 'Headroom confirmed?', DES, 'release_pos'),
      U('rework_study', 'Rework the study', DES, 'complete-with-evidence', 24, { row: 1 }),
      U('release_pos', 'Release purchase orders', PROC, 'commercial-approval', 24, { milestone: 'Capacity plan' }),
      U('receive', 'Receive kit', PROC, 'receive-delivery', 240, { boundaries: [DELAYED('expedite')] }),
      U('expedite', 'Expedite with the vendor', PROC, 'chase-up', 8, { row: 1 }),
      ...WORK('install', 'installation', INST, 80, { raiseMilestone: 'Procure', milestone: 'Install' }),
      ...WORK('burnin', 'burn-in', INST, 40, { milestone: 'Burn-in' }),
      U('go_nogo', 'Approve cut-over', OPS, 'go-no-go', 8),
      X('g_go', 'Go for cut-over?', OPS, 'raise_cutover'),
      U('fix', 'Fix open issues', INST, 'fix-findings', 16, { row: 1 }),
      ...WORK('cutover', 'cut-over', OPS, 24, { milestone: 'Cutover' }),
      U('accept', 'Accept capacity into operations', OPS, 'handover', 8),
      END('end', 'Capacity in service', OPS),
    ],
    [
      ...seq('start', 'study', 'g_headroom'), ['g_headroom', 'release_pos', 'confirmed', OK], ['g_headroom', 'rework_study', 'short', NOK], ['rework_study', 'study'],
      ...seq('release_pos', 'receive', ...w('install'), ...w('burnin'), 'go_nogo', 'g_go'), ['expedite', 'receive'],
      ['g_go', 'raise_cutover', 'go', OK], ['g_go', 'fix', 'no go', NOK], ['fix', 'go_nogo'],
      ...seq(...w('cutover'), 'accept', 'end'),
    ], ['CAP-05', 'BLD-03', 'CHG-01']),

  // ── PRJ-05 Network refresh ───────────────────────────────────────────────
  project('PRJ-05', 'project-network-refresh', 'Network refresh',
    'Refreshes a network fabric layer: the target design is approved, new devices are staged and pre-configured, the maintenance window is booked, the cut-over runs as a change per device group, the NOC validates service (issues go to remediation) and the old devices are removed.',
    [[PM, 'Project Manager'], [NETD, 'Network Engineer'], [INST, 'Field Technician'], [OPS, 'NOC Lead']],
    [
      START('start', 'Refresh approved', PM),
      U('design', 'Approve target design', NETD, 'design-review', 64),
      X('g_design', 'Design approved?', NETD, 'raise_stage'),
      U('revise_design', 'Revise design', NETD, 'complete-with-evidence', 24, { row: 1 }),
      ...WORK('stage', 'staging and pre-config', INST, 48, { raiseMilestone: 'Design', milestone: 'Stage config' }),
      U('book_window', 'Book the maintenance window', OPS, 'sign-off', 16, { milestone: 'Maintenance window' }),
      ...WORK('cutover', 'cut-over', INST, 32, { milestone: 'Cutover' }),
      U('validate', 'Validate and monitor', OPS, 'run-checks', 32),
      X('g_healthy', 'Service healthy?', OPS, 'raise_removal'),
      U('remediate', 'Remediate issues', NETD, 'fix-findings', 16, { row: 1 }),
      ...WORK('removal', 'old device removal', INST, 24, { raiseMilestone: 'Validate' }),
      END('end', 'Fabric refreshed', OPS),
    ],
    [
      ...seq('start', 'design', 'g_design'), ['g_design', 'raise_stage', 'approved', OK], ['g_design', 'revise_design', 'rejected', NOK], ['revise_design', 'design'],
      ...seq(...w('stage'), 'book_window', ...w('cutover'), 'validate', 'g_healthy'),
      ['g_healthy', 'raise_removal', 'healthy', PASS], ['g_healthy', 'remediate', 'issues', FAIL], ['remediate', 'validate'],
      ...seq(...w('removal'), 'end'),
    ], ['NET-02', 'CHG-01', 'CHG-04']),

  // ── PRJ-06 Migration wave ────────────────────────────────────────────────
  project('PRJ-06', 'project-migration-wave', 'Migration wave',
    'Moves workloads or equipment in one wave: discovery and dependencies are confirmed, the wave plan is approved, pre-migration checks must pass, the moves run as work orders under change, service owners confirm their services (a failed wave is rolled back and re-planned) and the source is decommissioned.',
    [[PM, 'Project Manager'], [DES, 'Capacity Planner'], [INST, 'Field Technician'], [OPS, 'NOC Lead']],
    [
      START('start', 'Wave approved', PM),
      U('discovery', 'Confirm discovery and dependencies', DES, 'complete-with-evidence', 64, { milestone: 'Discovery' }),
      U('plan', 'Approve the wave plan', PM, 'approve', 40),
      X('g_plan', 'Plan approved?', PM, 'prechecks'),
      U('replan', 'Re-plan the wave', DES, 'complete-with-evidence', 24, { row: 1 }),
      U('prechecks', 'Run pre-migration checks', OPS, 'run-checks', 32, { milestone: 'Wave plan' }),
      X('g_ready', 'Ready to move?', OPS, 'raise_move'),
      U('fix_prechecks', 'Clear failed checks', OPS, 'fix-findings', 16, { row: 1 }),
      ...WORK('move', 'migration', INST, 48, { raiseMilestone: 'Pre-checks', milestone: 'Migrate' }),
      U('confirm', 'Service owners confirm', OPS, 'owner-confirmation', 24),
      X('g_confirmed', 'Services confirmed?', OPS, 'raise_source'),
      U('rollback', 'Roll back the wave', INST, 'complete-with-evidence', 16, { row: 1 }),
      ...WORK('source', 'source decommission', INST, 24, { raiseMilestone: 'Validate', milestone: 'Decommission source' }),
      END('end', 'Wave closed', PM),
    ],
    [
      ...seq('start', 'discovery', 'plan', 'g_plan'), ['g_plan', 'prechecks', 'approved', OK], ['g_plan', 'replan', 'rejected', NOK], ['replan', 'plan'],
      ['prechecks', 'g_ready'], ['g_ready', 'raise_move', 'ready', PASS], ['g_ready', 'fix_prechecks', 'checks failed', FAIL], ['fix_prechecks', 'prechecks'],
      ...seq(...w('move'), 'confirm', 'g_confirmed'), ['g_confirmed', 'raise_source', 'confirmed', OK], ['g_confirmed', 'rollback', 'not confirmed', NOK], ['rollback', 'plan'],
      ...seq(...w('source'), 'end'),
    ], ['MIG-01', 'CHG-01', 'FLD-01']),

  // ── PRJ-07 Decommission programme ────────────────────────────────────────
  project('PRJ-07', 'project-decommission', 'Decommission',
    'Retires end-of-life equipment: the inventory is confirmed, service owners confirm their workloads are drained (blockers are resolved first), power-down and disconnect run as work orders under change, security sanitises and certifies the media (re-wiping anything uncertified), removal and disposal run as work orders and the records are updated.',
    [[PM, 'Project Manager'], [OPS, 'Facilities Director'], [INST, 'Field Technician'], [SEC, 'Security Manager']],
    [
      START('start', 'Decommission approved', PM),
      U('identify', 'Confirm end-of-life inventory', PM, 'complete-with-evidence', 32, { milestone: 'Identify' }),
      U('drain', 'Confirm workloads drained', OPS, 'owner-confirmation', 48),
      X('g_clear', 'Nothing depends on it?', OPS, 'raise_disconnect'),
      U('resolve', 'Resolve dependencies', OPS, 'complete-with-evidence', 48, { row: 1 }),
      ...WORK('disconnect', 'power-down and disconnect', INST, 32, { raiseMilestone: 'Drain workloads', milestone: 'Disconnect' }),
      U('wipe', 'Sanitise and certify media', SEC, 'media-sanitisation', 24),
      X('g_certified', 'All media certified?', SEC, 'raise_removal'),
      U('rewipe', 'Re-wipe uncertified media', SEC, 'media-sanitisation', 8, { row: 1 }),
      ...WORK('removal', 'removal and disposal', INST, 40, { raiseMilestone: 'Sanitise data', milestone: 'Remove & dispose' }),
      S('records', 'Update records', OPS, 'dcos.update-record', 0.5, { milestone: 'Update records' }),
      END('end', 'Decommissioned', OPS),
    ],
    [
      ...seq('start', 'identify', 'drain', 'g_clear'), ['g_clear', 'raise_disconnect', 'clear', OK], ['g_clear', 'resolve', 'blocked', NOK], ['resolve', 'drain'],
      ...seq(...w('disconnect'), 'wipe', 'g_certified'), ['g_certified', 'raise_removal', 'certified', PASS], ['g_certified', 'rewipe', 'not certified', FAIL], ['rewipe', 'wipe'],
      ...seq(...w('removal'), 'records', 'end'),
    ], ['DEC-01', 'SEC-05', 'CHG-01']),

  // ── PRJ-08 Facility master planning ──────────────────────────────────────
  project('PRJ-08', 'project-master-planning', 'Facility master planning',
    'Produces a site or campus master plan: demand and growth are agreed, site and utility surveys run as work orders (intrusive surveys under change), concept options and the feasibility and cost model are prepared, and the board approves the plan (revisions go back to design) before it is published.',
    [[PM, 'Project Manager'], [DES, 'Facilities Engineer'], [CON, 'Vendor Project Manager'], [LEAD, 'Executive']],
    [
      START('start', 'Planning commissioned', PM),
      U('demand', 'Agree demand and growth model', PM, 'complete-with-evidence', 80, { milestone: 'Requirements & demand' }),
      ...WORK('survey', 'site and utility survey', CON, 64, { milestone: 'Site assessment' }),
      U('concept', 'Develop concept options', DES, 'complete-with-evidence', 96, { milestone: 'Concept design' }),
      U('cost', 'Feasibility and cost model', DES, 'complete-with-evidence', 64, { milestone: 'Feasibility & cost' }),
      U('board', 'Board review', LEAD, 'approve', 40),
      X('g_board', 'Plan approved?', LEAD, 'publish'),
      U('revise', 'Revise the plan', DES, 'complete-with-evidence', 40, { row: 1 }),
      S('publish', 'Publish the master plan', DES, 'dcos.publish', 0.5, { milestone: 'Master plan sign-off' }),
      END('end', 'Master plan signed', LEAD),
    ],
    [
      ...seq('start', 'demand', ...w('survey'), 'concept', 'cost', 'board', 'g_board'),
      ['g_board', 'publish', 'approved', OK], ['g_board', 'revise', 'revise', NOK], ['revise', 'board'], ['publish', 'end'],
    ], ['PLN-01', 'CAP-01']),

  // ── PRJ-09 Site construction ─────────────────────────────────────────────
  project('PRJ-09', 'project-site-construction', 'Site construction',
    'Builds the shell and core: permits are checked (a permit nearing expiry triggers a renewal, a missing one is chased), drawings are issued for construction, site preparation, foundations, and structure and envelope run as contractor work orders under change, the authority inspections must pass (findings are rectified) and practical completion is signed once snags are closed.',
    [[PM, 'Project Manager'], [DES, 'Facilities Engineer'], [CON, 'Vendor Project Manager'], [QA, 'Commissioning Engineer']],
    [
      START('start', 'Construction approved', PM),
      U('check_permits', 'Check permits and consents', PM, 'permit-check', 80, { boundaries: [{ id: 'b_permit_expiry', kind: 'timer', name: 'Permit nearing expiry', ref: 'P30D', nonInterrupting: true, to: 'renew_permit' }] }),
      U('renew_permit', 'Renew permit', PM, 'complete-with-evidence', 40, { row: 1 }),
      X('g_permit', 'Permits approved?', PM, 'ifc'),
      U('chase_permits', 'Chase the authority', PM, 'chase-up', 80, { row: 1 }),
      U('ifc', 'Issue drawings for construction', DES, 'sign-off', 40, { milestone: 'Permits & approvals' }),
      ...WORK('siteprep', 'site preparation', CON, 600, { milestone: 'Site preparation' }),
      ...WORK('foundations', 'foundations', CON, 720, { milestone: 'Foundations' }),
      ...WORK('structure', 'structure and envelope', CON, 1080, { milestone: 'Structure & envelope' }),
      U('inspect', 'Authority inspections', QA, 'run-checks', 80),
      X('g_inspect', 'Inspections passed?', QA, 'certificates'),
      U('rectify', 'Rectify findings', CON, 'fix-findings', 80, { row: 1 }),
      S('certificates', 'Record inspection certificates', QA, 'dcos.record-certificates', 0.5, { milestone: 'Inspections' }),
      U('completion', 'Practical completion walk', PM, 'snag-walk', 40),
      X('g_snags', 'Snags closed?', PM, 'end'),
      U('close_snags', 'Close snags', CON, 'fix-findings', 80, { row: 1 }),
      END('end', 'Practical completion', PM, { milestone: 'Practical completion' }),
    ],
    [
      ...seq('start', 'check_permits', 'g_permit'), ['renew_permit', 'check_permits'],
      ['g_permit', 'ifc', 'approved', OK], ['g_permit', 'chase_permits', 'not yet', NOK], ['chase_permits', 'check_permits'],
      ...seq('ifc', ...w('siteprep'), ...w('foundations'), ...w('structure'), 'inspect', 'g_inspect'),
      ['g_inspect', 'certificates', 'passed', PASS], ['g_inspect', 'rectify', 'findings', FAIL], ['rectify', 'inspect'],
      ...seq('certificates', 'completion', 'g_snags'), ['g_snags', 'end', 'closed', CLEAN], ['g_snags', 'close_snags', 'open snags', SNAGS], ['close_snags', 'completion'],
    ], ['BLD-01', 'BLD-04', 'CHG-01']),

  // ── PRJ-10 Building fit-out ──────────────────────────────────────────────
  project('PRJ-10', 'project-building-fitout', 'Building fit-out',
    'Fits out white space and support areas: the design and bill of quantities must be issued for construction, the fit-out package is awarded, fire and life-safety approval is in place, partitions and finishes, then containment and raised floor run as contractor work orders under change, the white-space readiness check and snag walk must come back clean, and the client signs the handover.',
    [[PM, 'Project Manager'], [DES, 'Facilities Engineer'], [PROC, 'Finance Manager'], [CON, 'Vendor Project Manager'], [CX, 'Commissioning Engineer'], [OPS, 'Facilities Director']],
    [
      START('start', 'Fit-out approved', PM),
      U('design', 'Approve design and bill of quantities', DES, 'design-review', 96),
      X('g_design', 'Issued for construction?', DES, 'award'),
      U('revise_design', 'Revise design', DES, 'complete-with-evidence', 40, { row: 1 }),
      U('award', 'Award the fit-out package', PROC, 'commercial-approval', 80, { milestone: 'Design & BOQ' }),
      U('fire', 'Fire and life-safety approval', PM, 'permit-check', 40),
      X('g_fire', 'Fire approval in place?', PM, 'raise_finishes'),
      U('chase_fire', 'Revise the fire strategy', PM, 'complete-with-evidence', 80, { row: 1 }),
      ...WORK('finishes', 'partitions and finishes', CON, 480, { milestone: 'Partitions & finishes' }),
      ...WORK('containment', 'containment and raised floor', CON, 360, { milestone: 'Containment & flooring' }),
      U('readiness', 'White-space readiness check', CX, 'run-checks', 48),
      X('g_ready', 'Ready?', CX, 'snag_walk'),
      U('fix', 'Fix readiness findings', CON, 'fix-findings', 40, { row: 1 }),
      U('snag_walk', 'Snag walk', CX, 'snag-walk', 24, { milestone: 'White-space readiness' }),
      X('g_snags', 'Snags closed?', CX, 'handover'),
      U('close_snags', 'Close snags', CON, 'fix-findings', 40, { row: 1 }),
      U('handover', 'Client handover', OPS, 'handover', 24, { milestone: 'Snagging' }),
      END('end', 'White space handed over', OPS, { milestone: 'Handover' }),
    ],
    [
      ...seq('start', 'design', 'g_design'), ['g_design', 'award', 'issued', OK], ['g_design', 'revise_design', 'rejected', NOK], ['revise_design', 'design'],
      ...seq('award', 'fire', 'g_fire'), ['g_fire', 'raise_finishes', 'approved', OK], ['g_fire', 'chase_fire', 'rejected', NOK], ['chase_fire', 'fire'],
      ...seq(...w('finishes'), ...w('containment'), 'readiness', 'g_ready'), ['g_ready', 'snag_walk', 'ready', PASS], ['g_ready', 'fix', 'findings', FAIL], ['fix', 'readiness'],
      ['snag_walk', 'g_snags'], ['g_snags', 'handover', 'closed', CLEAN], ['g_snags', 'close_snags', 'open snags', SNAGS], ['close_snags', 'snag_walk'], ['handover', 'end'],
    ], ['BLD-05', 'CX-02', 'CHG-01']),

  // ── PRJ-11 MEP and plant installation ────────────────────────────────────
  project('PRJ-11', 'project-mep-plant', 'MEP and plant installation',
    'Installs the power train, cooling and BMS: the MEP design is approved for construction, electrical and HVAC permits are checked, long-lead plant is ordered, the factory acceptance test must pass, plant is received (delays start an expedite), electrical then mechanical installation run as contractor work orders under change, the integrated systems test (L5) must pass and operations takes the plant over.',
    [[PM, 'Project Manager'], [DES, 'Facilities Engineer'], [PROC, 'Finance Manager'], [CON, 'Vendor Project Manager'], [CX, 'Commissioning Engineer'], [OPS, 'Facilities Director']],
    [
      START('start', 'MEP works approved', PM),
      U('design', 'Approve MEP design (IFC)', DES, 'design-review', 144),
      X('g_design', 'Design approved?', DES, 'permits'),
      U('revise_design', 'Revise design', DES, 'complete-with-evidence', 40, { row: 1 }),
      U('permits', 'Check electrical and HVAC permits', PM, 'permit-check', 40),
      X('g_permit', 'Permits approved?', PM, 'order'),
      U('chase_permits', 'Chase the authority', PM, 'chase-up', 40, { row: 1 }),
      U('order', 'Order long-lead plant', PROC, 'commercial-approval', 40, { milestone: 'Detailed MEP design' }),
      U('fat', 'Witness factory acceptance test', CX, 'acceptance-tests', 24),
      X('g_fat', 'FAT passed?', CX, 'receive'),
      U('vendor_rework', 'Vendor rework and retest', PROC, 'fix-findings', 80, { row: 1 }),
      U('receive', 'Receive plant on site', PROC, 'receive-delivery', 320, { boundaries: [DELAYED('expedite')] }),
      U('expedite', 'Expedite with the vendor', PROC, 'chase-up', 16, { row: 1 }),
      ...WORK('electrical', 'electrical installation', CON, 720, { raiseMilestone: 'Procurement of plant', milestone: 'Electrical installation' }),
      ...WORK('mechanical', 'mechanical installation', CON, 720, { milestone: 'Mechanical installation' }),
      U('ist', 'Integrated systems test (L5)', CX, 'acceptance-tests', 96),
      X('g_ist', 'IST passed?', CX, 'handover'),
      U('fix_tests', 'Fix failed tests', CON, 'fix-findings', 40, { row: 1 }),
      U('handover', 'Hand plant over to operations', OPS, 'handover', 40, { milestone: 'Integrated commissioning' }),
      END('end', 'Plant in service', OPS, { milestone: 'Handover' }),
    ],
    [
      ...seq('start', 'design', 'g_design'), ['g_design', 'permits', 'approved', OK], ['g_design', 'revise_design', 'rejected', NOK], ['revise_design', 'design'],
      ['permits', 'g_permit'], ['g_permit', 'order', 'approved', OK], ['g_permit', 'chase_permits', 'not yet', NOK], ['chase_permits', 'permits'],
      ...seq('order', 'fat', 'g_fat'), ['g_fat', 'receive', 'passed', PASS], ['g_fat', 'vendor_rework', 'failed', FAIL], ['vendor_rework', 'fat'], ['expedite', 'receive'],
      ...seq('receive', ...w('electrical'), ...w('mechanical'), 'ist', 'g_ist'), ['g_ist', 'handover', 'passed', PASS], ['g_ist', 'fix_tests', 'failed tests', FAIL], ['fix_tests', 'ist'],
      ['handover', 'end'],
    ], ['BLD-04', 'CX-01', 'CHG-01']),

  // ── PRJ-12 Plant upgrade works ───────────────────────────────────────────
  project('PRJ-12', 'project-plant-upgrade', 'Plant upgrade works',
    'Adds or replaces UPS modules, generators, transformers or chillers in a live site without losing redundancy: studies and the method of procedure for each cut-in are approved by facilities, the factory acceptance test must pass, plant is delivered and positioned, every cut-in runs as its own work order and normal change in a maintenance window (with a site freeze), functional tests (L4) and the integrated systems test (L5) must pass, operations takes the handover and the replaced plant is disposed of.',
    [[PM, 'Project Manager'], [DES, 'Facilities Engineer'], [PROC, 'Finance Manager'], [CON, 'Vendor Project Manager'], [CX, 'Commissioning Engineer'], [OPS, 'Facilities Director']],
    [
      START('start', 'Works approved', PM),
      U('studies', 'Approve studies and MOPs', DES, 'design-review', 80),
      X('g_mop', 'MOPs approved by facilities?', DES, 'fat'),
      U('revise_mop', 'Revise studies and MOPs', DES, 'complete-with-evidence', 40, { row: 1 }),
      U('fat', 'Witness factory acceptance test', CX, 'acceptance-tests', 24, { milestone: 'Studies and MOP approved' }),
      X('g_fat', 'FAT passed?', CX, 'deliver'),
      U('vendor_rework', 'Vendor rework and retest', PROC, 'fix-findings', 80, { row: 1 }),
      U('deliver', 'Deliver, rig and position plant', PROC, 'receive-delivery', 120, { milestone: 'Factory acceptance test', boundaries: [DELAYED('expedite')] }),
      U('expedite', 'Expedite with the vendor', PROC, 'chase-up', 16, { row: 1 }),
      ...WORK('cutins', 'cut-in', CON, 80, { raiseMilestone: 'Plant delivered', milestone: 'Cut-ins complete' }),
      U('l4', 'Functional tests (L3 and L4)', CX, 'acceptance-tests', 48),
      X('g_l4', 'L4 passed?', CX, 'l5'),
      U('fix_l4', 'Fix L4 findings', CON, 'fix-findings', 24, { row: 1 }),
      U('l5', 'Integrated systems test with load banks (L5)', CX, 'acceptance-tests', 24, { milestone: 'Functional test (L4)' }),
      X('g_l5', 'L5 passed?', CX, 'handover'),
      U('fix_l5', 'Fix L5 findings', CON, 'fix-findings', 24, { row: 1 }),
      U('handover', 'Handover: as-built, O&M, spares, training', OPS, 'handover', 24, { milestone: 'Integrated systems test (L5)' }),
      ...WORK('disposal', 'replaced plant disposal', CON, 16, { milestone: 'Handover' }),
      END('end', 'Plant upgraded', OPS),
    ],
    [
      ...seq('start', 'studies', 'g_mop'), ['g_mop', 'fat', 'approved', OK], ['g_mop', 'revise_mop', 'rejected', NOK], ['revise_mop', 'studies'],
      ['fat', 'g_fat'], ['g_fat', 'deliver', 'passed', PASS], ['g_fat', 'vendor_rework', 'failed', FAIL], ['vendor_rework', 'fat'], ['expedite', 'deliver'],
      ...seq('deliver', ...w('cutins'), 'l4', 'g_l4'), ['g_l4', 'l5', 'passed', PASS], ['g_l4', 'fix_l4', 'failed', FAIL], ['fix_l4', 'l4'],
      ['l5', 'g_l5'], ['g_l5', 'handover', 'passed', PASS], ['g_l5', 'fix_l5', 'failed', FAIL], ['fix_l5', 'l5'],
      ...seq('handover', ...w('disposal'), 'end'),
    ], ['FAC-04', 'CX-01', 'CHG-01', 'CHG-06']),

  // ── PRJ-13 DCI / WAN uplift ──────────────────────────────────────────────
  project('PRJ-13', 'project-dci-uplift', 'DCI and WAN uplift',
    'Adds capacity between two sites: the path and diversity design is approved, carrier orders are placed, cross-connects (LOA/CFA) run as work orders, carriers hand the circuits over (a slipped date is chased), optics and line cards are installed and turned up, acceptance tests per path must pass, traffic is cut over in a change window and the old circuits are ceased and their optics recovered.',
    [[PM, 'Project Manager'], [NETD, 'Network Engineer'], [PROC, 'Finance Manager'], [INST, 'Field Technician'], [OPS, 'NOC Lead']],
    [
      START('start', 'Uplift approved', PM),
      U('design', 'Approve path and diversity design', NETD, 'design-review', 48, { milestone: 'Design and route survey' }),
      U('orders', 'Place carrier orders', PROC, 'complete-with-evidence', 24, { milestone: 'Carrier orders placed' }),
      ...WORK('xconnect', 'cross-connect', INST, 72, { milestone: 'Cross-connects (LOA/CFA)' }),
      U('handover', 'Receive circuit handover', PROC, 'complete-with-evidence', 480, { milestone: 'Circuits handed over', boundaries: [{ id: 'b_carrier_late', kind: 'message', name: 'Carrier date slipped', ref: 'carrier-delayed', nonInterrupting: true, to: 'chase_carrier' }] }),
      U('chase_carrier', 'Chase the carrier', PROC, 'chase-up', 8, { row: 1 }),
      ...WORK('turnup', 'optics and turn-up', INST, 32),
      U('acceptance', 'Acceptance tests per path', NETD, 'acceptance-tests', 72),
      X('g_tests', 'Tests passed?', NETD, 'raise_cutover'),
      U('fix_path', 'Fix the failing path', INST, 'fix-findings', 24, { row: 1 }),
      ...WORK('cutover', 'traffic cut-over', INST, 8, { raiseMilestone: 'Acceptance tests passed', milestone: 'Traffic cut over' }),
      ...WORK('cease', 'circuit cease and optics recovery', INST, 48, { milestone: 'Old circuits ceased' }),
      END('end', 'Uplift in service', OPS),
    ],
    [
      ...seq('start', 'design', 'orders', ...w('xconnect'), 'handover', ...w('turnup'), 'acceptance', 'g_tests'), ['chase_carrier', 'handover'],
      ['g_tests', 'raise_cutover', 'passed', PASS], ['g_tests', 'fix_path', 'failed', FAIL], ['fix_path', 'acceptance'],
      ...seq(...w('cutover'), ...w('cease'), 'end'),
    ], ['NET-05', 'CHG-01']),

  // ── PRJ-14 Server refresh ────────────────────────────────────────────────
  project('PRJ-14', 'project-server-refresh', 'Server refresh',
    'Replaces ageing servers in waves: the old-to-new mapping and wave plan are approved, new servers are received (delays start an expedite), racked and burnt in, a pilot wave runs and is reviewed (adjusted and repeated if not accepted), the remaining waves run, old equipment is sanitised and disposed of and the CMDB and monitoring are updated.',
    [[PM, 'Project Manager'], [PROC, 'Finance Manager'], [INST, 'Field Technician'], [OPS, 'NOC Lead']],
    [
      START('start', 'Refresh approved', PM),
      U('mapping', 'Approve mapping and waves', PM, 'approve', 40, { milestone: 'Mapping and waves approved' }),
      U('receive', 'Receive new servers', PROC, 'receive-delivery', 120, { milestone: 'Equipment received', boundaries: [DELAYED('expedite')] }),
      U('expedite', 'Expedite with the vendor', PROC, 'chase-up', 8, { row: 1 }),
      ...WORK('burnin', 'rack and burn-in', INST, 64),
      ...WORK('pilot', 'pilot wave', INST, 16),
      U('pilot_review', 'Review the pilot wave', OPS, 'approve', 8),
      X('g_pilot', 'Pilot accepted?', OPS, 'raise_waves'),
      U('adjust', 'Adjust the method', PM, 'complete-with-evidence', 16, { row: 1 }),
      ...WORK('waves', 'remaining waves', INST, 120, { raiseMilestone: 'Pilot wave closed', milestone: 'All waves closed' }),
      ...WORK('disposal', 'sanitise and dispose', INST, 40, { milestone: 'Old equipment disposed' }),
      S('records', 'Update CMDB and monitoring', OPS, 'dcos.update-record', 0.5, { milestone: 'Records updated' }),
      END('end', 'Refresh complete', OPS),
    ],
    [
      ...seq('start', 'mapping', 'receive', ...w('burnin'), ...w('pilot'), 'pilot_review', 'g_pilot'), ['expedite', 'receive'],
      ['g_pilot', 'raise_waves', 'accepted', OK], ['g_pilot', 'adjust', 'not accepted', NOK], ['adjust', 'raise_pilot'],
      ...seq(...w('waves'), ...w('disposal'), 'records', 'end'),
    ], ['LCM-01', 'CHG-01', 'DEC-01']),

  // ── PRJ-15 Rack replacement ──────────────────────────────────────────────
  project('PRJ-15', 'project-rack-replacement', 'Rack replacement',
    'Swaps racks and rack power strips in change windows: the swap method and outlet plan are approved, every affected tenant consents (overdue consents are escalated), new racks are received and pre-built, a pilot swap runs, the remaining swaps run, old racks are removed and DCIM is updated.',
    [[PM, 'Project Manager'], [DES, 'Facilities Engineer'], [PROC, 'Finance Manager'], [INST, 'Field Technician'], [OPS, 'Facilities Director']],
    [
      START('start', 'Replacement approved', PM),
      U('method', 'Approve swap method and outlet plan', DES, 'approve', 32),
      U('consent', 'Collect tenant consent', PM, 'complete-with-evidence', 80, { boundaries: [{ id: 'b_consent_overdue', kind: 'timer', name: 'Consent overdue', ref: 'P7D', nonInterrupting: true, to: 'escalate' }] }),
      U('escalate', 'Escalate to the account manager', PM, 'chase-up', 8, { row: 1 }),
      X('g_consent', 'All tenants consented?', PM, 'receive'),
      U('receive', 'Receive and pre-build racks', PROC, 'receive-delivery', 32, { milestone: 'Swap plan and tenant consent', boundaries: [DELAYED('expedite')] }),
      U('expedite', 'Expedite with the vendor', PROC, 'chase-up', 8, { row: 1 }),
      ...WORK('pilot', 'pilot swap', INST, 16, { raiseMilestone: 'Racks delivered', milestone: 'Pilot swap' }),
      ...WORK('swaps', 'rack swap', INST, 80, { milestone: 'All swaps done' }),
      ...WORK('removal', 'old rack removal', INST, 24, { milestone: 'Old racks removed' }),
      S('records', 'Update DCIM', OPS, 'dcos.update-record', 0.5, { milestone: 'Records updated' }),
      END('end', 'Racks replaced', OPS),
    ],
    [
      ...seq('start', 'method', 'consent', 'g_consent'), ['escalate', 'consent'],
      ['g_consent', 'receive', 'all consented', '=pendingConsents = 0'], ['g_consent', 'consent', 'pending', '=pendingConsents > 0'], ['expedite', 'receive'],
      ...seq('receive', ...w('pilot'), ...w('swaps'), ...w('removal'), 'records', 'end'),
    ], ['LCM-02', 'CHG-01']),

  // ── PRJ-16 Liquid retrofit ───────────────────────────────────────────────
  project('PRJ-16', 'project-liquid-retrofit', 'Liquid retrofit',
    'Converts live rows to liquid-cooled racks row by row: the design and structural check are approved, the facility water tie-in, row drain to swing positions, and pipework and power uprates run as work orders under change, the flush, fill and pressure test and the CDU failover test with load banks (L5) must pass, the rows are repopulated and operations accepts them.',
    [[PM, 'Project Manager'], [DES, 'Facilities Engineer'], [CON, 'Vendor Project Manager'], [INST, 'Field Technician'], [CX, 'Commissioning Engineer'], [OPS, 'Facilities Director']],
    [
      START('start', 'Retrofit approved', PM),
      U('design', 'Approve design and structural check', DES, 'design-review', 96),
      X('g_design', 'Design approved?', DES, 'raise_tiein'),
      U('revise_design', 'Revise design', DES, 'complete-with-evidence', 40, { row: 1 }),
      ...WORK('tiein', 'facility water tie-in', CON, 80, { raiseMilestone: 'Design and studies', milestone: 'Facility water tie-in' }),
      ...WORK('drain', 'row drain', INST, 64, { milestone: 'Rows drained' }),
      ...WORK('pipework', 'pipework and power uprate', CON, 160, { milestone: 'Pipework and power uprates' }),
      U('pressure', 'Flush, fill and pressure test', CX, 'acceptance-tests', 40),
      X('g_leak', 'No leaks?', CX, 'l5'),
      U('fix_leak', 'Fix leaks', CON, 'fix-findings', 16, { row: 1 }),
      U('l5', 'CDU failover test with load banks (L5)', CX, 'acceptance-tests', 32, { milestone: 'Flush, fill and pressure test' }),
      X('g_l5', 'L5 passed?', CX, 'raise_repopulate'),
      U('fix_l5', 'Fix L5 findings', CON, 'fix-findings', 24, { row: 1 }),
      ...WORK('repopulate', 'row repopulation', INST, 64, { raiseMilestone: 'CDU failover test (L5)', milestone: 'Rows repopulated' }),
      U('accept', 'Accept rows into operations', OPS, 'handover', 8),
      END('end', 'Rows in service', OPS),
    ],
    [
      ...seq('start', 'design', 'g_design'), ['g_design', 'raise_tiein', 'approved', OK], ['g_design', 'revise_design', 'rejected', NOK], ['revise_design', 'design'],
      ...seq(...w('tiein'), ...w('drain'), ...w('pipework'), 'pressure', 'g_leak'), ['g_leak', 'l5', 'dry', PASS], ['g_leak', 'fix_leak', 'leaks', FAIL], ['fix_leak', 'pressure'],
      ['l5', 'g_l5'], ['g_l5', 'raise_repopulate', 'passed', PASS], ['g_l5', 'fix_l5', 'failed', FAIL], ['fix_l5', 'l5'],
      ...seq(...w('repopulate'), 'accept', 'end'),
    ], ['FAC-05', 'CX-01', 'CHG-01']),

  // ── PRJ-17 Edge site rollout ─────────────────────────────────────────────
  project('PRJ-17', 'project-edge-rollout', 'Edge site rollout',
    'Rolls out one wave of edge sites: site surveys run as contractor work orders, leases and landlord consents are signed (overdue ones escalated), the network operator connects power (a slipped date is re-planned), enclosures are installed as work orders under change, site acceptance tests must pass and the sites are handed to operations.',
    [[PM, 'Project Manager'], [PROC, 'Finance Manager'], [CON, 'Vendor Project Manager'], [CX, 'Commissioning Engineer'], [OPS, 'NOC Lead']],
    [
      START('start', 'Wave approved', PM),
      ...WORK('survey', 'site survey', CON, 80, { milestone: 'Surveys done' }),
      U('lease', 'Sign leases and landlord consent', PROC, 'sign-off', 160, { milestone: 'Leases signed', boundaries: [{ id: 'b_lease_overdue', kind: 'timer', name: 'Lease overdue', ref: 'P14D', nonInterrupting: true, to: 'escalate_lease' }] }),
      U('escalate_lease', 'Escalate the lease', PM, 'chase-up', 8, { row: 1 }),
      U('power', 'Power connection by the network operator', PROC, 'complete-with-evidence', 240, { milestone: 'Power connections', boundaries: [{ id: 'b_power_late', kind: 'message', name: 'Connection date slipped', ref: 'connection-delayed', nonInterrupting: true, to: 'replan' }] }),
      U('replan', 'Re-plan the install dates', PM, 'complete-with-evidence', 8, { row: 1 }),
      ...WORK('enclosure', 'enclosure install', CON, 120, { milestone: 'Enclosures installed' }),
      U('sat', 'Site acceptance tests', CX, 'acceptance-tests', 40),
      X('g_sat', 'SAT passed?', CX, 'golive'),
      U('fix', 'Fix SAT findings', CON, 'fix-findings', 16, { row: 1 }),
      U('golive', 'Hand sites to operations', OPS, 'handover', 24, { milestone: 'Site acceptance tests' }),
      END('end', 'Sites live', OPS, { milestone: 'Sites live' }),
    ],
    [
      ...seq('start', ...w('survey'), 'lease', 'power', ...w('enclosure'), 'sat', 'g_sat'), ['escalate_lease', 'lease'], ['replan', 'power'],
      ['g_sat', 'golive', 'passed', PASS], ['g_sat', 'fix', 'findings', FAIL], ['fix', 'sat'], ['golive', 'end'],
    ], ['EDGE-01', 'CHG-01']),
];
PROCESSES.push(...PROJECT_PROCESSES);

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
