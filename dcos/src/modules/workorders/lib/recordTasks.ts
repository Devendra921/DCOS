/**
 * Record-backed user tasks: steps the model marks `completeOn: 'record'` (P05 change and P10
 * work-order steps the change and work-order pages drive). Completing them from a generic form
 * would move the process without updating the record, so task lists link to the record instead.
 */
import type * as T from '../../../mock/data/types';
import { PROCESS_BY_KEY, nodeById } from '../../../workorders/model';
import { RECORD_LABEL, recordPath } from './useWorkflows';

export interface RecordTaskLink {
  /** Route of the record page, with the tab where the step is done. */
  path: string;
  /** Button text, e.g. "Open work order WO-0042". */
  label: string;
  /** "work order", "change" … */
  recordLabel: string;
  /** What to do there, in plain words. */
  how: string;
}

/** Where to complete `task`, or undefined when it is completed with its form (or its record cannot be found). */
export function recordTaskLink(inst: T.ProcessInstance | undefined, task: Pick<T.ProcessUserTask, 'elementId'> | undefined): RecordTaskLink | undefined {
  if (!inst || !task) return undefined;
  const p = PROCESS_BY_KEY[inst.definitionKey];
  const node = p ? nodeById(p, task.elementId) : undefined;
  if (node?.completeOn !== 'record') return undefined;
  const woId = inst.variables?.workOrderId;
  const target: { type: T.ProcessRecordType; id: string; key: string } | undefined = inst.recordId
    ? { type: inst.recordType, id: inst.recordId, key: inst.businessKey }
    : typeof woId === 'string' && woId ? { type: 'workOrder', id: woId, key: woId } : undefined;
  if (!target) return undefined;
  const recordLabel = RECORD_LABEL[target.type].toLowerCase();
  const base = recordPath(target.type, target.id);
  return {
    path: node.recordTab ? `${base}?tab=${node.recordTab}` : base,
    label: `Open ${recordLabel} ${target.key}`,
    recordLabel,
    how: node.recordAction ?? `Complete it on the ${recordLabel}.`,
  };
}
