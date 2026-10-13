/* What every section of the work order page receives. */
import type * as T from '../../../../mock/data/types';
import type { DeliveryData } from '../../lib/chain';
import type { ReadinessView } from '../../lib/materialRules';
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
  /** The work order's material lines (in and out) and how ready its kit is (advisory). */
  materialLines: T.MaterialLine[]; kit: ReadinessView;
  /** A return or RMA request has gone to the supply chain platform for this work order. */
  returnsSent: boolean;
}

/** The material steps added to the checklist when the work order has material lines. */
export const MATERIAL_STEPS = {
  check: 'Check the kit against the material list',
  record: 'Record serials and quantities used',
  ret: 'Return unused or faulty parts',
} as const;

/**
 * Checklist for the work: the standard template's steps, else the change's implementation plan, else a
 * default by work type. With material lines, the kit check comes before the work and recording and
 * returning parts come after it.
 */
export function checklistFor(v: Pick<WorkOrderView, 'row' | 'template'> & { materialLines?: T.MaterialLine[] }): { steps: string[]; source: string } {
  const base = baseChecklist(v);
  const lines = v.materialLines ?? [];
  if (!lines.length) return base;
  const at = base.source.startsWith('the default') ? 2 : 0;
  const check = lines.some(l => l.direction === 'In') ? [MATERIAL_STEPS.check] : [];
  return { steps: [...base.steps.slice(0, at), ...check, ...base.steps.slice(at), MATERIAL_STEPS.record, MATERIAL_STEPS.ret], source: `${base.source}, with the material steps` };
}

function baseChecklist(v: Pick<WorkOrderView, 'row' | 'template'>): { steps: string[]; source: string } {
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

/** Whether a checklist step is done: ticked on the work order, or (material steps) shown done by the record. */
export function stepDone(wo: T.WorkOrder, step: string, returnsSent = false): { done: boolean; by?: string; at?: string } {
  const item = wo.checklist?.find(x => x.step === step);
  if (item?.done) return { done: true, by: item.by, at: item.at };
  if (step === MATERIAL_STEPS.record && wo.materialsRecordedAt) return { done: true, by: wo.materialsRecordedBy, at: wo.materialsRecordedAt };
  if (step === MATERIAL_STEPS.ret && returnsSent) return { done: true };
  return { done: false };
}
