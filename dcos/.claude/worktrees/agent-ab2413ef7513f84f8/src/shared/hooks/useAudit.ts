import { useQueryClient } from '@tanstack/react-query';
import { db } from '../../mock/db';

/** Append a consolidated audit event for a real in-app action. */
export function useRecordAudit() {
  const qc = useQueryClient();
  return (entityType: string, entityId: string, action: string, summary: string) => {
    const now = new Date().toISOString();
    db.create('auditEvents', {
      audId: `AUD-LIVE-${Date.now().toString().slice(-5)}`, entityType, entityId, action,
      actorName: 'You', timestamp: now, summary,
      customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me',
    });
    qc.invalidateQueries({ queryKey: ['auditEvents'] });
  };
}
