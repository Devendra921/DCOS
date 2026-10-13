/**
 * Change module actions that `useChainActions()` (delivery/lib/workflowChain.ts) does not cover yet.
 * Kept small and local so the delivery agent can fold them into workflowChain:
 *   - setTemplateStatus: suspend, reactivate or retire a standard change template
 *   - saveFreeze / removeFreeze: add, edit or remove a change freeze
 *   - cancelChange: cancel a change and its work order and window
 *   - setStatusWithoutWorkOrder: move a change that has no work order (records from before the
 *     one-change-per-work-order rule) through In progress → Implemented / Rolled back
 */
import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type * as T from '../../../mock/data/types';
import { db } from '../../../mock/db';
import { useAuth } from '../../../core/auth/AuthContext';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { nextSeq } from '../../delivery/lib/workflowChain';

const now = () => new Date().toISOString();

export interface FreezeInput { name: string; dataCenterId?: string; start: string; end: string; reason: string; allows: T.ChangeFreeze['allows']; owner: string }

export function useChangeLocalActions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const actor = user?.name ?? 'Change manager';
  const audit = useRecordAudit();
  const refresh = useCallback(() => { for (const k of ['changeRequests', 'workOrders', 'maintenanceWindows', 'standardChangeTemplates', 'changeFreezes']) void qc.invalidateQueries({ queryKey: [k] }); }, [qc]);
  const upd = useCallback((entity: string, id: string, patch: Record<string, unknown>) => { db.update(entity, id, { ...patch, updatedAt: now(), updatedBy: actor }); }, [actor]);

  return useMemo(() => ({
    setTemplateStatus(id: string, status: T.StandardChangeTemplate['status'], reason: string) {
      const t = db.getById('standardChangeTemplates', id) as unknown as T.StandardChangeTemplate | undefined;
      if (!t) return;
      upd('standardChangeTemplates', id, { status, ...(status === 'Active' ? { approvedAt: now() } : {}) });
      audit('StandardChangeTemplate', id, status === 'Active' ? 'reactivated' : status === 'Suspended' ? 'suspended' : 'retired', reason || status);
      refresh();
    },
    saveFreeze(input: FreezeInput, id?: string): string {
      if (id) { upd('changeFreezes', id, { ...input }); audit('ChangeFreeze', id, 'updated', `${input.name}: ${input.start.slice(0, 10)} to ${input.end.slice(0, 10)}`); refresh(); return id; }
      const nid = nextSeq('changeFreezes', 'FRZ');
      db.create('changeFreezes', { id: nid, frzId: nid, ...input, customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: actor, createdById: 'me' });
      audit('ChangeFreeze', nid, 'created', `${input.name}: ${input.start.slice(0, 10)} to ${input.end.slice(0, 10)}`);
      refresh(); return nid;
    },
    removeFreeze(id: string) { upd('changeFreezes', id, { isDeleted: true }); audit('ChangeFreeze', id, 'removed', 'Freeze removed'); refresh(); },
    cancelChange(changeId: string, reason: string) {
      const cr = db.getById('changeRequests', changeId) as unknown as T.ChangeRequest | undefined;
      if (!cr) return;
      upd('changeRequests', changeId, { status: 'Cancelled', closedAt: now() });
      const wo = (cr.workOrderId ? db.getById('workOrders', cr.workOrderId) : undefined) as unknown as T.WorkOrder | undefined;
      if (wo && !['Completed', 'Cancelled', 'Failed'].includes(wo.status)) upd('workOrders', wo.id, { status: 'Cancelled' });
      const mw = (db.getAll('maintenanceWindows', { pageSize: 100000 }).data as unknown as T.MaintenanceWindow[]).find(w => w.changeRequestId === changeId && w.status === 'Scheduled');
      if (mw) upd('maintenanceWindows', mw.id, { status: 'Cancelled' });
      audit('ChangeRequest', changeId, 'cancelled', reason);
      refresh();
    },
    setStatusWithoutWorkOrder(changeId: string, status: 'InProgress' | 'Implemented' | 'RolledBack') {
      upd('changeRequests', changeId, { status, ...(status !== 'InProgress' ? { implementedAt: now() } : {}) });
      const mw = (db.getAll('maintenanceWindows', { pageSize: 100000 }).data as unknown as T.MaintenanceWindow[]).find(w => w.changeRequestId === changeId && w.status !== 'Cancelled');
      if (mw) upd('maintenanceWindows', mw.id, { status: status === 'InProgress' ? 'In Progress' : 'Completed' });
      audit('ChangeRequest', changeId, status === 'InProgress' ? 'started' : status === 'Implemented' ? 'implemented' : 'rolled back', status);
      refresh();
    },
  }), [actor, audit, refresh, upd]);
}
