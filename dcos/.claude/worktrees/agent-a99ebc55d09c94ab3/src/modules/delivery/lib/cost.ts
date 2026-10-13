import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { Project, BOM, PurchaseOrder, ChangeOrder, Milestone } from '../../../mock/data/types';

const paidDrawTotal = (pos: PurchaseOrder[]) => pos.reduce((s, p) => s + (p.draws?.filter((d) => d.paid).reduce((a, d) => a + d.amount, 0) ?? 0), 0);

/**
 * Project cost, derived — never a parallel ledger.
 *
 *  - Approved budget = baseline budget + the deltas of APPROVED change orders.
 *    Change orders are the only instrument that moves the approved budget.
 *  - Committed = the planned value of POs that are actually on order
 *    (Approved / Ordered / Received) — money the project has committed.
 *  - Actual = the POs' actual spend (falls back to the project's stored spend
 *    only where no POs exist yet, so early-stage projects still read sensibly).
 *  - EAC (estimate at completion) = the worst of approved budget, committed and
 *    actual — you can't forecast under what you've already committed or spent.
 *  - Variance = approved budget − EAC  (negative ⇒ heading over budget).
 */
const COMMITTED_STATUSES = ['Approved', 'Ordered', 'Received'];

export interface ProjectCost {
  baseBudget: number;
  approvedDelta: number;     // sum of approved change-order budget deltas
  pendingDelta: number;      // sum of submitted (not yet approved) deltas — exposure
  approvedBudget: number;    // baseBudget + approvedDelta
  committed: number;
  actual: number;
  uncommitted: number;       // approvedBudget − committed (≥0)
  eac: number;
  variance: number;          // approvedBudget − eac
  scheduleImpactDays: number; // sum of approved CO schedule impacts
  changeOrders: ChangeOrder[];
  boms: BOM[];
  pos: PurchaseOrder[];
  hasProcurement: boolean;
}

export function computeProjectCost(project: Project, boms: BOM[], pos: PurchaseOrder[], changeOrders: ChangeOrder[]): ProjectCost {
  const projBoms = boms.filter((b) => b.projectId === project.id);
  const bomIds = new Set(projBoms.map((b) => b.id));
  const projPos = pos.filter((p) => p.bomId && bomIds.has(p.bomId));
  const cos = changeOrders.filter((c) => c.projectId === project.id);

  const committed = projPos.filter((p) => COMMITTED_STATUSES.includes(p.status)).reduce((s, p) => s + (p.plannedCost ?? 0), 0);
  const hasProcurement = projPos.length > 0;
  // Actual is the sum of *paid draws* (the dated payments against POs). Falls back
  // to the PO/stored actualSpend only where no draws exist.
  const hasDraws = projPos.some((p) => (p.draws?.length ?? 0) > 0);
  const actual = hasDraws ? paidDrawTotal(projPos)
    : hasProcurement ? projPos.reduce((s, p) => s + (p.actualSpend ?? 0), 0)
    : (project.actualSpend ?? 0);

  const approvedDelta = cos.filter((c) => c.status === 'Approved').reduce((s, c) => s + c.budgetDelta, 0);
  const pendingDelta = cos.filter((c) => c.status === 'Submitted').reduce((s, c) => s + c.budgetDelta, 0);
  const scheduleImpactDays = cos.filter((c) => c.status === 'Approved').reduce((s, c) => s + c.scheduleImpactDays, 0);

  const baseBudget = project.budget ?? 0;
  const approvedBudget = baseBudget + approvedDelta;
  const eac = Math.max(approvedBudget, committed, actual);
  const variance = approvedBudget - eac;
  const uncommitted = Math.max(0, approvedBudget - committed);

  return { baseBudget, approvedDelta, pendingDelta, approvedBudget, committed, actual, uncommitted, eac, variance, scheduleImpactDays, changeOrders: cos, boms: projBoms, pos: projPos, hasProcurement };
}

/** Hook variant — loads the linked entities and derives the cost for a project. */
export function useProjectCost(project: Project | null): ProjectCost | null {
  const boms = (useEntityList('boms', { pageSize: 2000 }).data?.data ?? []) as unknown as BOM[];
  const pos = (useEntityList('purchaseOrders', { pageSize: 4000 }).data?.data ?? []) as unknown as PurchaseOrder[];
  const cos = (useEntityList('changeOrders', { pageSize: 2000 }).data?.data ?? []) as unknown as ChangeOrder[];
  if (!project) return null;
  return computeProjectCost(project, boms, pos, cos);
}

// ── Cost S-curve (real time-phasing) ───────────────────────────────
// Planned comes from cost-loading the schedule: the approved budget is recognised
// cumulatively at each milestone's due date (mild S-curve weighting). Committed and
// Actual are replayed from the POs' dated draws — committed at each PO's first draw
// date, actual from paid draws by their date. Forecast continues from today's actual
// up to EAC by the planned end. With no milestones/draws it falls back to a shape.
const smoothstep = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

export interface CostCurvePoint { month: string; value: number; series: 'Planned' | 'Committed' | 'Actual' | 'Forecast' }

export function buildCostCurve(project: Project, cost: ProjectCost, milestones: Milestone[] = [], nowMs = Date.now()): CostCurvePoint[] {
  const start = new Date(project.plannedStart).getTime();
  const schedEnd = new Date(project.plannedEnd).getTime();
  if (!(schedEnd > start)) return [];

  // Planned: cost-load the schedule. Recognise approvedBudget cumulatively at each
  // milestone's due date, weighted on a smoothstep so it ramps slow–fast–slow.
  const msDue = milestones.map((m) => new Date(m.dueDate).getTime()).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);
  const nMs = msDue.length;

  // Committed: a PO commits at its first (on-order) draw date; full plannedCost.
  const commitEvents = cost.pos.map((p) => ({ at: p.draws?.length ? Math.min(...p.draws.map((d) => new Date(d.dueDate).getTime())) : start, amount: p.plannedCost ?? 0 }));
  // Actual: paid draws by their paid date.
  const paidEvents = cost.pos.flatMap((p) => (p.draws ?? []).filter((d) => d.paid).map((d) => ({ at: new Date(d.paidDate ?? d.dueDate).getTime(), amount: d.amount })));

  // Span to the latest of schedule end, last milestone and last event so the
  // planned curve reaches the full budget and the forecast reaches EAC.
  const end = Math.max(schedEnd, msDue.length ? msDue[msDue.length - 1] : start, ...commitEvents.map((e) => e.at), ...paidEvents.map((e) => e.at));
  const span = Math.max(1, end - start);

  const plannedBy = (atMs: number): number => {
    if (nMs === 0) return cost.approvedBudget * smoothstep((atMs - start) / span);
    const k = msDue.filter((t) => t <= atMs).length;
    return cost.approvedBudget * smoothstep(k / nMs);
  };
  const committedBy = (atMs: number) => commitEvents.filter((e) => e.at <= atMs).reduce((s, e) => s + e.amount, 0);
  const actualBy = (atMs: number) => paidEvents.filter((e) => e.at <= atMs).reduce((s, e) => s + e.amount, 0);

  const months: Date[] = [];
  for (let d = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), 1); d.getTime() <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(new Date(d));
  if (months.length === 0) return [];

  const tNow = Math.min(1, Math.max(0, (nowMs - start) / span));
  const sNow = smoothstep(tNow);
  const hasCommit = commitEvents.length > 0;

  const out: CostCurvePoint[] = [];
  months.forEach((d) => {
    const monthStart = d.getTime();
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime();
    const label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    const t = Math.min(1, Math.max(0, (monthEnd - start) / span));
    out.push({ month: label, value: Math.round(plannedBy(monthEnd)), series: 'Planned' });
    if (hasCommit) out.push({ month: label, value: Math.round(committedBy(monthEnd)), series: 'Committed' });
    // Actual: only up to today — the current (partial) month reads cumulative-to-now.
    if (monthStart <= nowMs) out.push({ month: label, value: Math.round(actualBy(Math.min(monthEnd, nowMs))), series: 'Actual' });
    // Forecast: from today to the end, rising from actual to EAC.
    if (monthEnd >= nowMs - 1e-9) {
      const fwd = sNow < 1 ? (smoothstep(t) - sNow) / (1 - sNow) : 1;
      out.push({ month: label, value: Math.round(cost.actual + (cost.eac - cost.actual) * Math.min(1, Math.max(0, fwd))), series: 'Forecast' });
    }
  });
  return out;
}

// ── Portfolio earned value ─────────────────────────────────────────
// Standard EVM: BAC (budget), PV (planned value to date from the schedule),
// EV (earned = % complete × budget), AC (actual = derived spend). Indices and
// forecasts fall out of those. Aggregated across the given projects.
export interface PortfolioEV { bac: number; pv: number; ev: number; ac: number; spi: number; cpi: number; eac: number; etc: number; vac: number; cv: number; sv: number }

export function computePortfolioEarnedValue(projects: Project[], boms: BOM[], pos: PurchaseOrder[], changeOrders: ChangeOrder[], nowMs = Date.now()): PortfolioEV {
  let bac = 0, pv = 0, ev = 0, ac = 0;
  for (const p of projects) {
    const c = computeProjectCost(p, boms, pos, changeOrders);
    const start = new Date(p.plannedStart).getTime(), end = new Date(p.plannedEnd).getTime();
    const t = end > start ? Math.min(1, Math.max(0, (nowMs - start) / (end - start))) : 1;
    bac += c.approvedBudget;
    pv += c.approvedBudget * smoothstep(t);
    ev += c.approvedBudget * (p.percentComplete / 100);
    // AC = total project actual cost (all work), not just procurement draws — keeps
    // CPI meaningful against the whole-budget EV and consistent with spend rollups.
    ac += p.actualSpend ?? 0;
  }
  const spi = pv ? ev / pv : 1;
  const cpi = ac ? ev / ac : 1;
  const eac = cpi ? bac / cpi : bac;
  return { bac, pv, ev, ac, spi, cpi, eac, etc: eac - ac, vac: bac - eac, cv: ev - ac, sv: ev - pv };
}

/** Portfolio PV/EV/AC cumulative over time. PV from schedules, AC from paid draws,
 *  EV is each project's earned-to-date distributed along its planned shape. */
export function buildPortfolioEvCurve(projects: Project[], boms: BOM[], pos: PurchaseOrder[], changeOrders: ChangeOrder[], nowMs = Date.now()): Array<{ month: string; value: number; series: 'PV' | 'EV' | 'AC' }> {
  const ps = projects.map((p) => {
    const c = computeProjectCost(p, boms, pos, changeOrders);
    return { ab: c.approvedBudget, pct: p.percentComplete / 100, ac: p.actualSpend ?? 0, start: new Date(p.plannedStart).getTime(), end: new Date(p.plannedEnd).getTime() };
  }).filter((x) => x.end > x.start);
  if (!ps.length) return [];
  const min = Math.min(...ps.map((x) => x.start)), max = Math.max(...ps.map((x) => x.end));
  const months: Date[] = [];
  for (let d = new Date(new Date(min).getFullYear(), new Date(min).getMonth(), 1); d.getTime() <= max; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(new Date(d));
  const out: Array<{ month: string; value: number; series: 'PV' | 'EV' | 'AC' }> = [];
  months.forEach((d) => {
    const ms0 = d.getTime();
    const me = new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime();
    const eff = Math.min(me, nowMs); // current month reads cumulative-to-today
    const label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    let pv = 0, ev = 0, ac = 0;
    for (const x of ps) {
      pv += x.ab * smoothstep((me - x.start) / (x.end - x.start));
      if (ms0 <= nowMs) {
        const sEff = smoothstep((eff - x.start) / (x.end - x.start));
        const sNow = smoothstep((nowMs - x.start) / (x.end - x.start));
        // EV and total AC distributed along the planned shape, scaled to today's value.
        ev += sNow > 0 ? x.ab * x.pct * (sEff / sNow) : 0;
        ac += sNow > 0 ? x.ac * (sEff / sNow) : 0;
      }
    }
    out.push({ month: label, value: Math.round(pv), series: 'PV' });
    if (ms0 <= nowMs) { out.push({ month: label, value: Math.round(ev), series: 'EV' }); out.push({ month: label, value: Math.round(ac), series: 'AC' }); }
  });
  return out;
}
