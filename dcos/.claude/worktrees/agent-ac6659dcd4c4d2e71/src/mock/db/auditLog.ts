// ─── Audit Log ────────────────────────────────────────────────────────
//
// Centralized audit log for state-changing actions across the app.
// Entries are kept in-memory for the session. Supports the legacy
// shape used by SAQ (actor / entity / details / metadata) AND the
// richer shape required by the shared mutation toolkit
// (entityType / entityId / userId / userName / changes / comments).
//

export interface AuditEntry {
  id: string;
  timestamp: string;
  // ── Primary (toolkit) fields ────────────────────────────────────
  entityType: string;
  entityId: string;
  action: string;
  userId: string;
  userName: string;
  changes?: Record<string, unknown>;
  comments?: string;
  // ── Legacy aliases (kept for the SAQ timeline) ──────────────────
  actor: string;
  entity: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditFilter {
  entityType?: string;
  entityId?: string;
  action?: string;
  userId?: string;
  since?: string; // ISO date
  // Legacy aliases
  entity?: string;
  limit?: number;
}

let nextId = 1;
const entries: AuditEntry[] = [];
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      /* swallow subscriber errors */
    }
  }
}

/**
 * Append an audit entry. Timestamp + ID auto-generated.
 *
 * Accepts either the new (entityType/userId/userName/changes/comments)
 * shape used by `useSiteActions` etc. or the legacy SAQ shape
 * (entity/actor/details/metadata).
 */
export function addAuditEntry(
  entry: Partial<Omit<AuditEntry, 'id' | 'timestamp'>> & {
    id?: string;
    timestamp?: string;
    action: string;
  },
): AuditEntry {
  const entityType = entry.entityType ?? entry.entity ?? 'unknown';
  const entity = entry.entity ?? entry.entityType ?? 'unknown';
  const userId = entry.userId ?? entry.actor ?? CURRENT_USER.id;
  const userName = entry.userName ?? entry.actor ?? CURRENT_USER.name;
  const actor = entry.actor ?? userName;

  const full: AuditEntry = {
    id: entry.id ?? `AUD-${(nextId++).toString().padStart(6, '0')}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    entityType,
    entityId: entry.entityId ?? 'unknown',
    action: entry.action,
    userId,
    userName,
    changes: entry.changes,
    comments: entry.comments,
    actor,
    entity,
    details: entry.details ?? entry.comments,
    metadata: entry.metadata ?? entry.changes,
  };
  entries.unshift(full); // newest first
  // Trim to last 1000 to bound memory in long sessions
  if (entries.length > 1000) entries.length = 1000;
  notify();
  return full;
}

/**
 * Read entries optionally filtered. Accepts both the modern filter
 * shape (entityType/entityId/action/userId/since) and the legacy
 * SAQ shape (entity/entityId/limit).
 */
export function getAuditEntries(filter?: AuditFilter): AuditEntry[] {
  let out: AuditEntry[] = entries.slice();
  if (filter?.entityType) {
    out = out.filter((e) => e.entityType === filter.entityType);
  } else if (filter?.entity) {
    out = out.filter((e) => e.entity === filter.entity);
  }
  if (filter?.entityId) {
    out = out.filter((e) => e.entityId === filter.entityId);
  }
  if (filter?.action) {
    out = out.filter((e) => e.action === filter.action);
  }
  if (filter?.userId) {
    out = out.filter((e) => e.userId === filter.userId);
  }
  if (filter?.since) {
    out = out.filter((e) => e.timestamp >= filter.since!);
  }
  if (filter?.limit != null) {
    out = out.slice(0, filter.limit);
  }
  return out;
}

/**
 * Subscribe to audit log changes (useful for live timeline views).
 * Returns an unsubscribe function.
 */
export function subscribeAudit(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Alias kept for the spec — same as subscribeAudit. */
export const subscribeAuditLog = subscribeAudit;

/** Clear all audit entries (for tests). */
export function clearAuditLog(): void {
  entries.length = 0;
  notify();
}

/** Total count. */
export function auditLogSize(): number {
  return entries.length;
}

// ─── Current User (mock) ──────────────────────────────────────────────
//
// In a real app this would come from an auth context. The shared
// mutation toolkit reads it when stamping audit entries.
//
export const CURRENT_USER = {
  id: 'USR-001',
  name: 'Prateek Chouhan',
};
