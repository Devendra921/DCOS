/**
 * Delivery home view model: project and programme rows with stage, open work and money, and
 * the sections of the delivery home. Pure — the page supplies the delivery bundle (from
 * `useDeliveryData()`) plus BOMs, change orders and project activities for stage and cost.
 */
import type * as T from '../../../../mock/data/types';
import { chainOfProject, isOpenChange, type DeliveryData } from '../../lib/chain';
import { deriveStage, type DeliveryStage } from '../../lib/deliverExec';
import { computePortfolioEarnedValue, type PortfolioEV } from '../../lib/cost';
import { blueprintForProgramType, getBlueprint } from '../../lib/programBlueprints';
import { elementName } from '../../../workorders/lib/useWorkflows';
import { buildWorkOrderRows, CHANGE_APPROVED, fmtDay, type WorkOrderRow } from '../workorders/model';

export interface Extras { boms: T.BOM[]; changeOrders: T.ChangeOrder[]; activities: T.ProjectActivity[] }
const DAY = 864e5;

/* ------------------------------------------------------------------ projects */
export interface ProjectRow {
  project: T.Project; program?: T.Program; plan?: T.PlannerPlan; stage: DeliveryStage;
  process?: T.ProcessInstance; openWorkOrders: number; openChanges: number; nextGate: string;
  overdueMilestones: number; workOrdersOverdue: number;
}

export function buildProjectRows(d: DeliveryData, x: Extras, now = Date.now()): ProjectRow[] {
  const today0 = new Date(new Date(now).toDateString()).getTime();
  const bomsBy = groupBy(x.boms, b => b.projectId);
  const actsBy = groupBy(x.activities, a => a.projectId);
  // Work orders found through their change too (older work orders carry no project of their own).
  const woBy = groupBy(buildWorkOrderRows(d, now), r => r.project?.id);
  return d.projects.map(project => {
    const ch = chainOfProject(d, project.id)!;
    const stage = deriveStage(project, bomsBy.get(project.id) ?? [], actsBy.get(project.id) ?? []).stage;
    const openMs = ch.milestones.filter(m => m.status !== 'Completed').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    let nextGate = project.status === 'Completed' ? 'Delivered' : '—';
    if (project.status !== 'Completed') {
      if (ch.process && (ch.process.state === 'active' || ch.process.state === 'incident') && ch.process.currentElementIds.length) {
        nextGate = ch.process.currentElementIds.map(id => elementName(ch.process!.definitionKey, id)).join(', ') + (ch.process.state === 'incident' ? ' (stopped)' : '');
      } else if (openMs[0]) nextGate = `${openMs[0].name}, ${fmtDay(openMs[0].dueDate)}`;
      else if (project.startGate) nextGate = project.startGate;
    }
    return {
      project, program: ch.program, plan: ch.plan, stage, process: ch.process,
      openWorkOrders: (woBy.get(project.id) ?? []).filter(r => r.open).length, openChanges: ch.changes.filter(isOpenChange).length, nextGate,
      overdueMilestones: openMs.filter(m => new Date(m.dueDate).getTime() < today0).length,
      workOrdersOverdue: (woBy.get(project.id) ?? []).filter(r => r.overdue).length,
    };
  });
}

/* ------------------------------------------------------------------ programmes */
export interface ProgrammeRow {
  program: T.Program; plan?: T.PlannerPlan; blueprint: string; projects: T.Project[];
  /** Budget-weighted share of the work done. */
  completion: number; ev: PortfolioEV;
}

export function blueprintName(pg: T.Program): string {
  const key = (pg as { blueprintKey?: string }).blueprintKey;
  return (key && getBlueprint(key)?.name) || blueprintForProgramType(pg.type)?.name || 'No blueprint';
}

export function buildProgrammeRows(d: DeliveryData, programs: T.Program[], projects: T.Project[], x: Extras, now = Date.now()): ProgrammeRow[] {
  const byProg = groupBy(projects, p => p.programId);
  return programs.map(program => {
    const kids = byProg.get(program.id) ?? [];
    const budget = kids.reduce((s, p) => s + p.budget, 0);
    const completion = budget ? kids.reduce((s, p) => s + p.budget * p.percentComplete, 0) / budget : kids.length ? kids.reduce((s, p) => s + p.percentComplete, 0) / kids.length : 0;
    return {
      program, plan: program.plannerPlanId ? d.plannerPlans.find(p => p.id === program.plannerPlanId) : undefined, blueprint: blueprintName(program),
      projects: kids, completion, ev: computePortfolioEarnedValue(kids, x.boms, d.purchaseOrders, x.changeOrders, now),
    };
  });
}

/* ------------------------------------------------------------------ home */
export interface HomeFilters { siteId: string; programId?: string; status?: string }

export interface AttentionRow { row: ProjectRow; reasons: string[]; severity: number }
export interface WindowRow { change: T.ChangeRequest; window?: T.MaintenanceWindow; wo?: WorkOrderRow; project?: T.Project; start: string; end?: string; siteId?: string }
export interface MilestoneRow { milestone: T.Milestone; project?: T.Project; program?: T.Program; overdue: boolean }
export interface RecentRow { kind: 'Work order' | 'Change'; id: string; title: string; status: string; at: string; to: string; by?: string }

export interface HomeModel {
  projects: ProjectRow[]; programmes: ProgrammeRow[]; workOrders: WorkOrderRow[];
  attention: AttentionRow[]; waitingPlans: T.PlannerPlan[]; windows: WindowRow[]; milestones: MilestoneRow[]; recent: RecentRow[];
  summary: { activeProgrammes: number; programmes: number; atRisk: number; activeProjects: number; blocked: number; changes14: number; changes14NotApproved: number; openWorkOrders: number; overdueWorkOrders: number; budget: number; spend: number };
}

export function buildHome(d: DeliveryData, x: Extras, allProjects: ProjectRow[], f: HomeFilters, now = Date.now()): HomeModel {
  const siteOk = (id?: string) => f.siteId === 'all' || id === f.siteId;
  const projects = allProjects.filter(r => siteOk(r.project.dataCenterId) && (!f.programId || r.project.programId === f.programId) && (!f.status || r.project.status === f.status));
  const pids = new Set(projects.map(r => r.project.id));
  const filtering = f.siteId !== 'all' || !!f.status;
  const programs = d.programs.filter(pg => (!f.programId || pg.id === f.programId) && (!filtering || projects.some(r => r.project.programId === pg.id)));
  const programmes = buildProgrammeRows(d, programs, projects.map(r => r.project), x, now);

  const inScope = (siteId?: string, programId?: string, projectId?: string) =>
    siteOk(siteId) && (!f.programId || programId === f.programId) && (!f.status || !projectId || pids.has(projectId));
  const workOrders = buildWorkOrderRows(d, now).filter(r => inScope(r.siteId, r.program?.id, r.project?.id));

  // Needs attention — the projects that need someone now, and why.
  const attention: AttentionRow[] = projects.filter(r => r.project.status !== 'Completed').map(r => {
    const reasons: string[] = [];
    if (r.project.rag === 'Red') reasons.push('Health is red');
    if (r.project.status === 'Blocked') reasons.push('Blocked');
    else if (r.project.status === 'At Risk') reasons.push('At risk');
    if (r.process?.state === 'incident') reasons.push(`Process stopped at ${r.nextGate.replace(' (stopped)', '')}`);
    if (r.overdueMilestones) reasons.push(`${r.overdueMilestones} milestone${r.overdueMilestones > 1 ? 's' : ''} overdue`);
    if (r.workOrdersOverdue) reasons.push(`${r.workOrdersOverdue} work order${r.workOrdersOverdue > 1 ? 's' : ''} overdue`);
    const rejected = d.changeRequests.filter(c => c.projectId === r.project.id && c.status === 'Rejected').length;
    if (rejected) reasons.push(`${rejected} change${rejected > 1 ? 's' : ''} rejected`);
    if (r.stage === 'Commission') {
      const atps = d.atps.filter(a => a.projectId === r.project.id);
      const ok = atps.filter(a => a.status === 'Accepted').length;
      if (atps.length && ok < atps.length) reasons.push(`Acceptance tests ${ok} of ${atps.length} passed`);
    }
    return { row: r, reasons, severity: (r.project.rag === 'Red' ? 3 : 0) + (r.project.status === 'Blocked' ? 3 : 0) + (r.process?.state === 'incident' ? 2 : 0) + reasons.length };
  }).filter(a => a.reasons.length).sort((a, b) => b.severity - a.severity);

  // Approved plans not yet executed.
  const waitingPlans = d.plannerPlans.filter(p => p.status === 'Approved' && !p.supersededBy && !p.artefacts?.completedAt && siteOk(p.dataCenterId ?? undefined) && (!f.programId || p.programId === f.programId))
    .sort((a, b) => a.targetGoLive.localeCompare(b.targetGoLive));

  // Change windows in the next 14 days.
  const horizon = now + 14 * DAY;
  const woByChange = new Map(buildWorkOrderRows(d, now).filter(r => r.change).map(r => [r.change!.id, r]));
  const windows: WindowRow[] = d.changeRequests.filter(c => !['Rejected', 'Cancelled', 'Closed', 'Implemented', 'RolledBack'].includes(c.status)).flatMap(change => {
    const window = d.maintenanceWindows.find(w => w.changeRequestId === change.id);
    const start = window?.scheduledStart ?? change.scheduledStart;
    if (!start) return [];
    const t = new Date(start).getTime();
    if (t < now - DAY / 2 || t > horizon) return [];
    const wo = woByChange.get(change.id);
    const project = d.projects.find(p => p.id === (change.projectId ?? wo?.project?.id));
    const siteId = change.dataCenterId ?? wo?.siteId;
    if (!inScope(siteId, change.programId ?? project?.programId, project?.id)) return [];
    return [{ change, window, wo, project, start, end: window?.scheduledEnd ?? change.scheduledEnd, siteId }];
  }).sort((a, b) => a.start.localeCompare(b.start));

  // Milestones overdue (due before today), then due in the next 14 days.
  const today0 = new Date(new Date(now).toDateString()).getTime();
  const projById = new Map(d.projects.map(p => [p.id, p]));
  const progById = new Map(d.programs.map(p => [p.id, p]));
  const milestones: MilestoneRow[] = d.milestones.filter(m => pids.has(m.projectId) && m.status !== 'Completed' && new Date(m.dueDate).getTime() <= horizon)
    .map(m => { const project = projById.get(m.projectId); return { milestone: m, project, program: project ? progById.get(project.programId) : undefined, overdue: new Date(m.dueDate).getTime() < today0 }; })
    .sort((a, b) => a.milestone.dueDate.localeCompare(b.milestone.dueDate));

  // Recent changes and work orders.
  const recent: RecentRow[] = [
    ...workOrders.map(r => ({ kind: 'Work order' as const, id: r.wo.woId ?? r.wo.id, title: r.title, status: r.wo.status, at: r.wo.updatedAt, to: `/delivery/work-orders/${r.wo.id}`, by: r.wo.updatedBy ?? r.wo.createdBy })),
    ...d.changeRequests.filter(c => { const p = projById.get(c.projectId ?? ''); return inScope(c.dataCenterId, c.programId ?? p?.programId, p?.id); })
      .map(c => ({ kind: 'Change' as const, id: c.chgId ?? c.id, title: c.title, status: c.status, at: c.updatedAt, to: `/changes/${c.id}`, by: c.updatedBy ?? c.createdBy })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  const live = projects.filter(r => r.project.status !== 'Completed');
  return {
    projects, programmes, workOrders, attention, waitingPlans, windows, milestones, recent,
    summary: {
      activeProgrammes: programs.filter(p => p.status === 'Active').length, programmes: programs.length,
      atRisk: live.filter(r => r.project.rag === 'Red' || r.project.status === 'At Risk' || r.project.status === 'Blocked').length, activeProjects: live.length,
      blocked: live.filter(r => r.project.status === 'Blocked' || r.process?.state === 'incident').length,
      changes14: windows.length, changes14NotApproved: windows.filter(w => !CHANGE_APPROVED.includes(w.change.status)).length,
      openWorkOrders: workOrders.filter(r => r.open).length, overdueWorkOrders: workOrders.filter(r => r.overdue).length,
      budget: programmes.reduce((s, p) => s + p.ev.bac, 0), spend: programmes.reduce((s, p) => s + p.ev.ac, 0),
    },
  };
}

function groupBy<V>(xs: V[], key: (v: V) => string | undefined): Map<string, V[]> {
  const m = new Map<string, V[]>();
  for (const v of xs) { const k = key(v); if (!k) continue; const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }
  return m;
}
