/**
 * DMN decision tables as plain JavaScript: a mirror of each table in src/workorders/dmn/*.dmn so the
 * mock engine can evaluate business-rule tasks and the Rules page can highlight the matched rule.
 * Rule ids match the `<rule id>` in the XML. No bundler features here (no import.meta), so scripts
 * and pure libraries (tsx) can import it; the XML itself is loaded in dmn.ts.
 */
export type DmnInputType = 'number' | 'boolean' | 'string';
export interface DmnInput { key: string; label: string; type: DmnInputType; options?: string[]; default: unknown }
export interface DmnOutput { key: string; label: string }
export interface DmnRule { id: string; description?: string; when: (v: Record<string, unknown>) => boolean; output: Record<string, unknown> }
export interface Decision { id: string; name: string; hitPolicy: 'FIRST' | 'UNIQUE'; summary: string; inputs: DmnInput[]; outputs: DmnOutput[]; rules: DmnRule[] }
export interface DecisionResult { ruleId: string; output: Record<string, unknown> }

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

/**
 * The `approval-limit` table as data: an amount falls in a rule when `above < amount <= upTo`
 * (null = no bound). The planner's amount bands (planner/lib/governance.ts) are built from this,
 * so the two cannot drift apart.
 */
export interface ApprovalLimitRule { id: string; description: string; above: number | null; upTo: number | null; approverRole: string; businessCaseRequired: boolean }
export const APPROVAL_LIMIT_RULES: ApprovalLimitRule[] = [
  { id: 'Rule_al_1', description: 'Operational spend', above: null, upTo: 50_000, approverRole: 'Capacity Planner', businessCaseRequired: false },
  { id: 'Rule_al_2', description: 'Departmental budget', above: 50_000, upTo: 250_000, approverRole: 'Finance Manager', businessCaseRequired: false },
  { id: 'Rule_al_3', description: 'Site programme', above: 250_000, upTo: 1_000_000, approverRole: 'Facilities Director', businessCaseRequired: true },
  { id: 'Rule_al_4', description: 'Capital programme', above: 1_000_000, upTo: null, approverRole: 'Executive', businessCaseRequired: true },
];
const approvalLimitRule = (r: ApprovalLimitRule): DmnRule => ({
  id: r.id,
  description: r.description,
  when: (v) => (r.above === null || num(v.amount) > r.above) && (r.upTo === null || num(v.amount) <= r.upTo),
  output: { approverRole: r.approverRole, businessCaseRequired: r.businessCaseRequired },
});

export const DECISIONS: Record<string, Decision> = {
  'change-risk': {
    id: 'change-risk', name: 'Change risk & approval path', hitPolicy: 'FIRST',
    summary: 'Classifies a change by blast radius and context and routes it to the approval path governance requires. Called by P05 Change after the impact preview.',
    inputs: [
      { key: 'scopeSize', label: 'Scope size (affected resources)', type: 'number', default: 4 },
      { key: 'premiumCustomers', label: 'Premium customers exposed', type: 'number', default: 0 },
      { key: 'conflicts', label: 'Window conflicts', type: 'boolean', default: false },
      { key: 'openIncidents', label: 'Open incidents at site', type: 'number', default: 0 },
    ],
    outputs: [{ key: 'risk', label: 'Risk' }, { key: 'approvalPath', label: 'Approval path' }],
    rules: [
      { id: 'Rule_cr_1', description: 'Conflicting window with another change', when: (v) => v.conflicts === true, output: { risk: 'High', approvalPath: 'CAB + Facilities Director' } },
      { id: 'Rule_cr_2', description: 'Site already has an open incident', when: (v) => num(v.openIncidents) > 0, output: { risk: 'High', approvalPath: 'CAB + NOC Lead' } },
      { id: 'Rule_cr_3', description: 'Large scope touching premium customers', when: (v) => num(v.scopeSize) > 10 && num(v.premiumCustomers) > 0, output: { risk: 'High', approvalPath: 'CAB' } },
      { id: 'Rule_cr_4', description: 'Premium customers exposed', when: (v) => num(v.premiumCustomers) > 0, output: { risk: 'Medium', approvalPath: 'Change manager + account manager' } },
      { id: 'Rule_cr_5', description: 'Large scope', when: (v) => num(v.scopeSize) > 10, output: { risk: 'Medium', approvalPath: 'Change manager' } },
      { id: 'Rule_cr_6', description: 'Several resources, no exposure', when: (v) => num(v.scopeSize) > 3, output: { risk: 'Low', approvalPath: 'Peer review' } },
      { id: 'Rule_cr_7', description: 'Standard change', when: () => true, output: { risk: 'Low', approvalPath: 'Auto-approve' } },
    ],
  },
  'incident-severity': {
    id: 'incident-severity', name: 'Incident severity & priority', hitPolicy: 'FIRST',
    summary: 'Maps blast radius, premium exposure and the facility system involved to SEV1–SEV4 and P1–P4. Called by P04 Major incident after alarm correlation.',
    inputs: [
      { key: 'impactLevel', label: 'Impact level', type: 'string', options: ['site', 'hall', 'rack', 'device'], default: 'rack' },
      { key: 'premiumExposed', label: 'Premium customer exposed', type: 'boolean', default: false },
      { key: 'facility', label: 'Facility system', type: 'string', options: ['Power', 'Cooling', 'Network', 'Other'], default: 'Power' },
    ],
    outputs: [{ key: 'severity', label: 'Severity' }, { key: 'priority', label: 'Priority' }],
    rules: [
      { id: 'Rule_is_1', description: 'Whole site affected', when: (v) => v.impactLevel === 'site', output: { severity: 'SEV1', priority: 'P1' } },
      { id: 'Rule_is_2', description: 'Hall-level power or cooling loss', when: (v) => v.impactLevel === 'hall' && (v.facility === 'Power' || v.facility === 'Cooling'), output: { severity: 'SEV1', priority: 'P1' } },
      { id: 'Rule_is_3', description: 'Hall-level, other system', when: (v) => v.impactLevel === 'hall', output: { severity: 'SEV2', priority: 'P2' } },
      { id: 'Rule_is_4', description: 'Rack with premium customer', when: (v) => v.impactLevel === 'rack' && v.premiumExposed === true, output: { severity: 'SEV2', priority: 'P2' } },
      { id: 'Rule_is_5', description: 'Rack, standard customers', when: (v) => v.impactLevel === 'rack', output: { severity: 'SEV3', priority: 'P3' } },
      { id: 'Rule_is_6', description: 'Single device with premium customer', when: (v) => v.impactLevel === 'device' && v.premiumExposed === true, output: { severity: 'SEV3', priority: 'P3' } },
      { id: 'Rule_is_7', description: 'Everything else', when: () => true, output: { severity: 'SEV4', priority: 'P4' } },
    ],
  },
  'approval-limit': {
    id: 'approval-limit', name: 'Approval limit', hitPolicy: 'UNIQUE',
    summary: 'Routes a budget amount to the role allowed to approve it under the delegation-of-authority policy. Called by P06 Capacity expansion before budget approval.',
    inputs: [{ key: 'amount', label: 'Amount (USD)', type: 'number', default: 180000 }],
    outputs: [{ key: 'approverRole', label: 'Approver role' }, { key: 'businessCaseRequired', label: 'Business case required' }],
    rules: APPROVAL_LIMIT_RULES.map(approvalLimitRule),
  },
  'work-type-skill': {
    id: 'work-type-skill', name: 'Work type → skill & permit', hitPolicy: 'UNIQUE',
    summary: 'Resolves the skill a technician must hold and the permit a work order needs before dispatch. Called by P10 Work order before assignment.',
    inputs: [{ key: 'workType', label: 'Work type', type: 'string', options: ['RackInstall', 'Cabling', 'PowerConnect', 'DeviceDeploy'], default: 'PowerConnect' }],
    outputs: [{ key: 'skill', label: 'Required skill' }, { key: 'permit', label: 'Permit' }],
    rules: [
      { id: 'Rule_ws_1', when: (v) => v.workType === 'RackInstall', output: { skill: 'Rigging & rack assembly', permit: 'Lifting / manual handling' } },
      { id: 'Rule_ws_2', when: (v) => v.workType === 'Cabling', output: { skill: 'Structured cabling (fibre & copper)', permit: 'None' } },
      { id: 'Rule_ws_3', when: (v) => v.workType === 'PowerConnect', output: { skill: 'Licensed electrician', permit: 'Electrical work permit (LOTO)' } },
      { id: 'Rule_ws_4', when: (v) => v.workType === 'DeviceDeploy', output: { skill: 'Device install & bring-up', permit: 'Change window ticket' } },
    ],
  },
};

export const DECISION_IDS = Object.keys(DECISIONS);

/** Evaluate a decision table against process variables; FIRST and UNIQUE both return the first matching rule. */
export function evaluateDecision(decisionId: string, vars: Record<string, unknown>): DecisionResult | undefined {
  const d = DECISIONS[decisionId];
  if (!d) return undefined;
  const rule = d.rules.find((r) => r.when(vars));
  return rule ? { ruleId: rule.id, output: rule.output } : undefined;
}
