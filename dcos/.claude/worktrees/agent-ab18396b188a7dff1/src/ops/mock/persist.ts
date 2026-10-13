/* Write-through from the Operate model to the DCOS MockDB, so operate mutations
   survive a model rebuild and show up on every DCOS screen. */
import { db as mdb } from '../../mock/db';
import type * as T from '../../mock/data/types';
import type { Alert, Change, ChangeStatus, Incident } from '../api/types';
import { rememberFacilityState } from './model';

const iso = (t?: number) => (t ? new Date(t).toISOString() : undefined);
const meta = (by: string) => ({ customerId: 'CUST-001', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: by, createdById: 'me', isDeleted: false });

export function alertState(a: Alert) {
  if (a.id.startsWith('FAC-') || a.id.startsWith('ALM-DS-')) { rememberFacilityState(a.id, a.state); return; }
  const rec = mdb.getById('alarms', a.id); if (!rec) return;
  mdb.update('alarms', a.id, { state: a.state === 'cleared' ? 'Cleared' : a.state === 'acknowledged' ? 'Acknowledged' : 'Active', acknowledgedBy: a.ackBy, acknowledgedAt: a.state === 'acknowledged' ? new Date().toISOString() : undefined, clearedAt: a.state === 'cleared' ? new Date().toISOString() : undefined, incidentId: a.incidentId, updatedAt: new Date().toISOString() });
}

export function incident(i: Incident, by: string) {
  const SEV = { 1: 'SEV1', 2: 'SEV2', 3: 'SEV3', 4: 'SEV4' } as const;
  const ops: T.IncidentOpsExt = { rca: i.rca, actions: i.actions, verification: i.verification, feedback: i.feedback, changeIds: i.changeIds, affected: i.affected, opsLog: i.worklog.filter(w => w.kind !== 'system' || w.who !== 'Monitoring') };
  const patch: Partial<T.Incident> = { status: i.status, acknowledgedAt: iso(i.acknowledged), resolvedAt: iso(i.resolved), assignee: i.owner, ops, updatedAt: new Date().toISOString(), updatedBy: by, linkedAlarmIds: i.alertIds, linkedChangeRequestId: i.changeIds[0] };
  if (mdb.getById('incidents', i.id)) { mdb.update('incidents', i.id, patch as Record<string, unknown>); return; }
  const rec: T.Incident = {
    id: i.id, incId: i.id, ...meta(by), title: i.title, type: i.type, severity: SEV[i.sev], status: i.status, priority: `P${i.pri}` as T.Incident['priority'], affectedResourceType: i.type === 'Power' ? 'PowerChain' : i.type === 'Cooling' ? 'Cooling' : 'Asset',
    affectedResourceIds: i.affected.filter(a => a.kind === 'NE' || a.kind === 'Rack').map(a => a.id), dataCenterId: i.dcId, detectedAt: new Date(i.detected).toISOString(), reportedBy: i.reportedBy, slaResponseMins: i.responseSlaMin, slaResolveMins: i.resolveSlaMin, ...patch,
  };
  mdb.create('incidents', rec as unknown as Record<string, unknown>);
}

const CSTATUS: Record<ChangeStatus, T.ChangeRequest['status']> = { Draft: 'Draft', 'Pending approval': 'Submitted', Approved: 'Approved', 'In progress': 'InProgress', Completed: 'Implemented', 'Rolled back': 'RolledBack', Rejected: 'Rejected' };
export function change(c: Change, by: string) {
  const patch: Partial<T.ChangeRequest> = { status: CSTATUS[c.status], scheduledStart: iso(c.windowStart), scheduledEnd: iso(c.windowEnd), updatedAt: new Date().toISOString(), updatedBy: by, assignedTo: c.approver };
  if (mdb.getById('changeRequests', c.id)) { mdb.update('changeRequests', c.id, patch as Record<string, unknown>); return; }
  if (mdb.getById('maintenanceWindows', c.id)) { mdb.update('maintenanceWindows', c.id, { status: c.status === 'Completed' ? 'Completed' : c.status === 'Rejected' ? 'Cancelled' : c.status === 'In progress' ? 'In Progress' : 'Scheduled' }); return; }
  const rec: T.ChangeRequest = {
    id: c.id, chgId: c.id, ...meta(by), title: c.title, type: c.emergency ? 'ConfigPush' : 'NetworkMigration', description: c.kind === 'Maintenance' ? 'Planned maintenance raised from the Operate module' : 'Change raised from the Operate module', risk: c.risk === 'High' ? 'High' : c.risk === 'Medium' ? 'Medium' : 'Low', status: CSTATUS[c.status], priority: c.emergency ? 'Urgent' : 'Medium',
    affectedResourceType: 'Asset', affectedResourceIds: c.scope, dataCenterId: c.dcId, requestedBy: c.requester, requestedById: 'me', policyViolations: [], rollbackPlan: c.rollback, ...patch,
  };
  mdb.create('changeRequests', rec as unknown as Record<string, unknown>);
}

export function plan(p: { id: string; dcId: string; dimension: T.CapacityPlanRec['dimension']; title: string; amount: number; unit: string; target: number; status: T.CapacityPlanRec['status']; capex: number }, by: string) {
  if (mdb.getById('capacityPlans', p.id)) { mdb.update('capacityPlans', p.id, { status: p.status }); return; }
  const rec: T.CapacityPlanRec = { id: p.id, cpId: p.id, ...meta(by), dataCenterId: p.dcId, dimension: p.dimension, title: p.title, amount: p.amount, unit: p.unit, targetDate: new Date(p.target).toISOString(), status: p.status, capex: p.capex };
  mdb.create('capacityPlans', rec as unknown as Record<string, unknown>);
}
