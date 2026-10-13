/**
 * Delivery chain actions — the only way screens change work orders and change requests.
 *
 * Raising a work order raises its change request (one per work order), classified as
 * standard, normal or emergency (see chain.ts `classifyChange`). A standard change is
 * approved by its template; a normal change goes through the approval matrix and the weekly
 * change board; an emergency change is approved by the emergency board and must be reviewed
 * afterwards. The work order becomes Ready when its change is approved; completing the work
 * order marks the change Implemented (a standard change closes at once), and the change
 * closes after its review. Every action moves the matching processes (P05 change, P10 work
 * order, P12 site access, the project's own process).
 *
 * The logic is pure and lives in chainOps.ts (`createChainOps(db, actor)`, `planRaiseWorkOrder`,
 * `raiseWorkForStep`, `advanceProjectIfDone`…) so scripts and the seed use the same code;
 * `useChainActions()` applies it to the app's MockDB, writes the audit trail and refreshes
 * the screens.
 */
import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type * as T from '../../../mock/data/types';
import { db } from '../../../mock/db';
import { useAuth } from '../../../core/auth/AuthContext';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import type { DeliveryData } from './chain';
import { createChainOps, nextSeqIn, type RaisePlan, type RaiseWorkOrderInput } from './chainOps';

export { planRaiseWorkOrder, raiseWorkForStep, advanceProjectIfDone, startProjectProcess, createChainOps, accessApproved } from './chainOps';
export type { RaiseWorkOrderInput, RaisePlan, ChainOps, FreezeInput } from './chainOps';

/** Next sequential id in the app's MockDB: PREFIX-0001, PREFIX-0002… */
export function nextSeq(entity: string, prefix: string): string { return nextSeqIn(db, entity, prefix); }

const REFRESH = ['programs', 'workOrders', 'changeRequests', 'approvalSteps', 'maintenanceWindows', 'standardChangeTemplates', 'changeFreezes', 'projects', 'milestones', 'processInstances', 'flowNodeInstances', 'userTasks', 'engineIncidents', 'auditEvents'];

/** Writes through MockDB and refreshes every delivery, change and process screen. */
export function useChainActions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const actor = user?.name ?? 'Delivery';
  const audit = useRecordAudit();
  const refresh = useCallback(() => { for (const k of REFRESH) void qc.invalidateQueries({ queryKey: [k] }); }, [qc]);
  return useMemo(() => {
    const ops = createChainOps(db, actor, audit);
    const wrap = <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A): R => { const r = fn(...a); refresh(); return r; };
    return {
      actor,
      /** Raise a work order and its change. Standard changes are approved at once and the work order is Ready. */
      raiseWorkOrder: wrap((d: DeliveryData, input: RaiseWorkOrderInput): RaisePlan => ops.raiseWorkOrder(d, input)),
      /** Submit a draft change for approval. */
      submitChange: wrap(ops.submitChange),
      /** Record one approval decision; the change is Approved when every step is approved, Rejected on any rejection. */
      decideStep: wrap(ops.decideStep),
      /** Book (or move) the maintenance window of a change. */
      scheduleChange: wrap(ops.scheduleChange),
      /** Assign a work order to a technician or a contractor crew. */
      assignWorkOrder: wrap(ops.assignWorkOrder),
      /** Start the work; refused while the change is not approved or the site is in a freeze (non-emergency). */
      startWork: wrap(ops.startWork),
      /** Finish the work with a sign-off; the change is Implemented (or rolled back) and the project moves on when its step is done. */
      completeWorkOrder: wrap(ops.completeWorkOrder),
      /** Close a change with its review. */
      closeChange: wrap((changeId: string, review: NonNullable<T.ChangeRequest['review']>) => ops.closeChange(changeId, review)),
      /** Hand a work order to another technician or crew. */
      reassignWorkOrder: wrap(ops.reassignWorkOrder),
      /** Cancel a work order with its change. */
      cancelWorkOrder: wrap(ops.cancelWorkOrder),
      /** Cancel a change with its open work order, window and processes. */
      cancelChange: wrap(ops.cancelChange),
      /** Legacy changes without a work order (none after the reseed). */
      setStatusWithoutWorkOrder: wrap(ops.setStatusWithoutWorkOrder),
      /** Suspend, reactivate or retire a standard change template. */
      setTemplateStatus: wrap(ops.setTemplateStatus),
      /** Add or edit a change freeze. */
      saveFreeze: wrap(ops.saveFreeze),
      /** Remove a change freeze (soft delete). */
      removeFreeze: wrap(ops.removeFreeze),
      /** Programme lifecycle. */
      setProgramStatus: wrap(ops.setProgramStatus),
      /** Store processes started for a work order elsewhere (P12 site access, P10). */
      linkProcess: wrap(ops.linkProcess),
      /** Raise the change for an existing work order that has none. */
      raiseChangeForWorkOrder: wrap(ops.raiseChangeForWorkOrder),
      /** Tick or untick one checklist step of a work order. */
      setChecklistItem: wrap(ops.setChecklistItem),
      /** Start a project's template process (if it has none running). */
      startProjectProcess: wrap(ops.startProjectProcess),
      /** Raise the work orders (with their changes) of a project's work step. */
      raiseWorkForStep: wrap(ops.raiseWorkForStep),
      /** Move a project on from work steps whose work orders are all closed. */
      advanceProjectIfDone: wrap(ops.advanceProjectIfDone),
    };
  }, [actor, audit, refresh]);
}
