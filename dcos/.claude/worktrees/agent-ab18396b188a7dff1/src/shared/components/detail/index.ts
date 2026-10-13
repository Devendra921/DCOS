/**
 * Shared detail-page tab primitives — apply uniformly across detail pages
 * per restructuring.md §6.6.
 *
 *   import { AuditTrailTab, ActivityLogTab, DocumentsTab } from '@/shared/components/detail';
 */

export { AuditTrailTab, ActivityLogTab, DocumentsTab } from './UniversalTabs';
export type {
  EntityHistoryTabProps,
  DocumentsTabProps,
  DetailDocument,
} from './UniversalTabs';
export { EntityAuditTab, EntityDocumentsTab } from './EntityTabs';
