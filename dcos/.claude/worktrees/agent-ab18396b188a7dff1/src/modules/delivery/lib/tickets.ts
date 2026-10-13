import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { Ticket } from '../../../mock/data/types';

/** Delivery tickets — derivation helpers shared by the register, the inline
 *  panels and the command-center analytics. */
export const TICKET_OPEN_STATUSES = ['New', 'Open', 'Assigned', 'In Progress', 'Blocked', 'Parked'];
export const TICKET_DONE_STATUSES = ['Resolved', 'Verified', 'Closed'];

export const isOpenTicket = (t: Ticket) => TICKET_OPEN_STATUSES.includes(t.status);
export const isDoneTicket = (t: Ticket) => TICKET_DONE_STATUSES.includes(t.status);
export const isBlockingTicket = (t: Ticket) => isOpenTicket(t) && (t.isBlocker || t.status === 'Blocked');
export const isSlaBreached = (t: Ticket, nowMs = Date.now()) => isOpenTicket(t) && !!t.slaDueAt && new Date(t.slaDueAt).getTime() < nowMs;

export interface TicketStats {
  total: number;
  open: number;
  resolved: number;
  blockers: number;
  slaBreached: number;
  resolutionRate: number;   // % of all tickets that are done
  avgResolveDays: number;   // mean raise→resolve over resolved tickets
  byStatus: Array<{ status: string; n: number }>;
}

export function ticketStats(tickets: Ticket[]): TicketStats {
  const total = tickets.length;
  const open = tickets.filter(isOpenTicket).length;
  const resolved = tickets.filter(isDoneTicket).length;
  const resolvedWithTime = tickets.filter((t) => t.resolvedAt);
  const avgResolveDays = resolvedWithTime.length
    ? Math.round(resolvedWithTime.reduce((s, t) => s + (new Date(t.resolvedAt!).getTime() - new Date(t.raisedAt).getTime()) / 864e5, 0) / resolvedWithTime.length * 10) / 10
    : 0;
  const byStatusMap = new Map<string, number>();
  tickets.forEach((t) => byStatusMap.set(t.status, (byStatusMap.get(t.status) ?? 0) + 1));
  return {
    total, open, resolved,
    blockers: tickets.filter(isBlockingTicket).length,
    slaBreached: tickets.filter((t) => isSlaBreached(t)).length,
    resolutionRate: total ? Math.round((resolved / total) * 100) : 0,
    avgResolveDays,
    byStatus: [...byStatusMap.entries()].map(([status, n]) => ({ status, n })),
  };
}

export interface TicketFilter { projectId?: string; taskId?: string; changeRequestId?: string; activityId?: string }

/** All tickets (loaded once); callers filter with `filterTickets`. */
export function useAllTickets(): Ticket[] {
  return (useEntityList('tickets', { pageSize: 5000 }).data?.data ?? []) as unknown as Ticket[];
}

export function filterTickets(tickets: Ticket[], f: TicketFilter): Ticket[] {
  return tickets.filter((t) =>
    (f.projectId === undefined || t.projectId === f.projectId) &&
    (f.taskId === undefined || t.taskId === f.taskId) &&
    (f.changeRequestId === undefined || t.changeRequestId === f.changeRequestId) &&
    (f.activityId === undefined || t.activityId === f.activityId));
}

export const TICKET_STATUS_COLOR: Record<string, string> = {
  New: 'blue', Open: 'gold', Assigned: 'purple', 'In Progress': 'geekblue', Blocked: 'red', Parked: 'default',
  Resolved: 'green', Verified: 'cyan', Closed: 'default',
};
export const TICKET_TYPE_COLOR: Record<string, string> = { Issue: 'orange', Defect: 'red', 'Ad-hoc Task': 'blue', Request: 'geekblue', Blocker: 'volcano' };
