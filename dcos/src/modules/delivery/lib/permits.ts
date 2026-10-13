import type { Permit, DesignDocument } from '../../../mock/data/types';

/**
 * Permit & design gating — pure helpers shared by the build spine (deliverExec),
 * the registers and the project views.
 *
 * Gate semantics:
 *  - Permit gate: the phase has at least one permit and every one is Approved.
 *  - Design gate: at least one design document is Issued for Construction (or
 *    superseded by an As-Built), i.e. there is a construction-ready set to build to.
 */
export function permitGateMet(permits: Permit[]): boolean {
  return permits.length > 0 && permits.every((p) => p.status === 'Approved');
}

export function designGateMet(docs: DesignDocument[]): boolean {
  return docs.some((d) => d.status === 'Issued for Construction' || d.status === 'As-Built');
}

/** Whole days from now until an ISO date (negative if past). */
export function daysUntil(iso?: string): number | undefined {
  if (!iso) return undefined;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);
}

/** An approved permit whose validity lapses within `withinDays`. */
export function permitExpiringSoon(p: Permit, withinDays = 60): boolean {
  if (p.status !== 'Approved' || !p.expiryDate) return false;
  const d = daysUntil(p.expiryDate);
  return d != null && d >= 0 && d <= withinDays;
}

export function permitExpired(p: Permit): boolean {
  if (p.status === 'Expired') return true;
  const d = daysUntil(p.expiryDate);
  return p.status === 'Approved' && d != null && d < 0;
}

export const PERMIT_STATUS_COLOR: Record<string, string> = { 'Not Started': 'default', Applied: 'blue', 'In Review': 'gold', Approved: 'green', Rejected: 'red', Expired: 'volcano' };
export const DESIGN_STATUS_COLOR: Record<string, string> = { Draft: 'default', 'In Review': 'gold', Reviewed: 'cyan', 'Issued for Construction': 'green', Superseded: 'default', 'As-Built': 'blue' };
