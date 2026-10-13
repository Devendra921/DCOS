/* What every section of the work order page receives. */
import type * as T from '../../../../mock/data/types';
import type { DeliveryData } from '../../lib/chain';
import type { useChainActions } from '../../lib/workflowChain';
import type { AccessState, WorkOrderRow } from './model';

export interface WorkOrderView {
  d: DeliveryData;
  row: WorkOrderRow;
  /** P10 work order process instance, if one runs. */
  p10?: T.ProcessInstance;
  /** P12 site access request for a contractor crew. */
  access?: T.ProcessInstance; accessState?: AccessState;
  template?: T.StandardChangeTemplate;
  approvals: T.ApprovalStep[];
  site: (id?: string) => string;
  rackNames: string[]; deviceNames: string[];
  actions: ReturnType<typeof useChainActions>;
}

/** Checklist for the work: the standard template's steps, else the change's implementation plan, else a default by work type. */
export function checklistFor(v: Pick<WorkOrderView, 'row' | 'template'>): { steps: string[]; source: string } {
  if (v.template?.steps.length) return { steps: v.template.steps, source: `standard template "${v.template.name}"` };
  const plan = v.row.change?.implementationPlan?.split('\n').map(s => s.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean) ?? [];
  if (plan.length > 1) return { steps: plan, source: `the implementation plan of change ${v.row.change!.chgId ?? v.row.change!.id}` };
  return {
    steps: [
      'Confirm the change is approved and the window is open',
      'Brief the crew; check permits, tools and the method statement',
      plan[0] ?? `Carry out the work: ${v.row.title}`,
      'Test the result and record readings or photos',
      'Clean the area and update the asset and rack records',
    ],
    source: 'the default steps for this kind of work (no template or implementation plan)',
  };
}
