import type { WorkflowStep } from '../../../shared/components/ux';
import { VwChip } from '../../../shared/components/ux';

export const RISK_COLOR: Record<string, string> = { Low: 'green', Medium: 'blue', High: 'orange', Critical: 'red' };
export const riskTag = (r: string) => <VwChip color={RISK_COLOR[r]}>{r}</VwChip>;

const STATUS_COLOR: Record<string, string> = {
  Draft: 'default', Submitted: 'blue', UnderReview: 'gold', Approved: 'green', Scheduled: 'cyan',
  InProgress: 'processing', Implemented: 'green', Closed: 'default', Rejected: 'red', Cancelled: 'default', RolledBack: 'red',
};
export const statusTag = (s: string) => <VwChip color={STATUS_COLOR[s]}>{s}</VwChip>;

export const FLOW = ['Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress', 'Implemented'] as const;

export function changeSteps(status: string): WorkflowStep[] {
  const failed = status === 'Rejected' || status === 'RolledBack' || status === 'Cancelled';
  const idx = status === 'Closed' || status === 'Implemented' ? FLOW.length : FLOW.indexOf(status as typeof FLOW[number]);
  return FLOW.map((label, i) => ({
    key: label, label,
    state: failed && i >= 1 ? 'failed' : i < idx ? 'completed' : i === idx ? 'current' : 'upcoming',
  }));
}

/** Next action available from a given status. */
export function nextAction(status: string): { label: string; to: string } | null {
  switch (status) {
    case 'Draft': return { label: 'Submit', to: 'Submitted' };
    case 'Submitted': return { label: 'Send for review', to: 'UnderReview' };
    case 'Approved': return { label: 'Schedule', to: 'Scheduled' };
    case 'Scheduled': return { label: 'Start', to: 'InProgress' };
    case 'InProgress': return { label: 'Mark implemented', to: 'Implemented' };
    default: return null;
  }
}
