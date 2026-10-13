import { useQueryClient } from '@tanstack/react-query';
import { useEntityCreate, useEntityUpdate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { useAuth } from '../../../core/auth/AuthContext';
import { db } from '../../../mock/db';
import type { Project, BOM, PurchaseOrder, ProjectActivity, Atp, Hoto, Snag, Rack, DcimDeviceType, Permit, DesignDocument } from '../../../mock/data/types';
import type { AtpSystem, CxLevel } from '../../../mock/data/enums';
import { permitGateMet, designGateMet } from './permits';
import { createMaterialOps } from './materialOps';
import { MATERIAL_DATA_KEYS } from './materialRules';

const now = () => new Date().toISOString();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });
const sid = (p: string) => `${p}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e4)}`;

// ── Delivery stage derivation (now off the process) ─────────────────
export const DELIVERY_STAGES = ['Plan', 'Procure', 'Build', 'Commission', 'Live'] as const;
export type DeliveryStage = (typeof DELIVERY_STAGES)[number];

export interface DeliverySnapshot {
  stage: DeliveryStage;
  boms: BOM[];
  pos: PurchaseOrder[];
  activities: ProjectActivity[];
  current?: ProjectActivity;
  atps: Atp[];
  hoto?: Hoto;
  snags: Snag[];
  permits: Permit[];
  designDocs: DesignDocument[];
  procured: boolean;
  built: boolean;
  commissioned: boolean;
  hotoAccepted: boolean;
  permitsApproved: boolean;
  designIssued: boolean;
}

const phaseOf = (a: ProjectActivity): DeliveryStage => {
  if (a.attaches === 'procurement' || /design|procure|permit|planning|survey|requirement|assessment|concept|feasibility|boq/i.test(a.name)) return 'Procure';
  if (a.attaches === 'commissioning' || /commission|test|inspection|snag|quality|validation|ist|readiness|handover/i.test(a.name)) return 'Commission';
  return 'Build';
};

/** Pure stage derivation from a project + its process activities. */
export function deriveStage(project: Project, boms: BOM[], activities: ProjectActivity[]) {
  const ordered = [...activities].sort((a, b) => a.order - b.order);
  const tasks = ordered.filter((a) => a.nodeType === 'task');
  const procured = boms.length > 0;
  const built = tasks.length > 0 && tasks.every((t) => t.status === 'Done');
  const current = ordered.find((a) => a.status === 'Active');

  let stage: DeliveryStage = 'Plan';
  if (project.status === 'Completed' || ordered.find((a) => a.nodeType === 'end')?.status === 'Done') stage = 'Live';
  else if (current) stage = phaseOf(current);
  else if (built) stage = 'Commission';
  else if (procured) stage = 'Procure';
  return { stage, procured, built, current };
}

/** Reads everything linked to a project and derives stage + current activity. */
export function useDeliverySnapshot(project: Project | null): DeliverySnapshot {
  const allBoms = (useEntityList('boms', { pageSize: 1000 }).data?.data ?? []) as unknown as BOM[];
  const allPos = (useEntityList('purchaseOrders', { pageSize: 2000 }).data?.data ?? []) as unknown as PurchaseOrder[];
  const allActs = (useEntityList('projectActivities', { pageSize: 5000 }).data?.data ?? []) as unknown as ProjectActivity[];
  const allAtps = (useEntityList('atps', { pageSize: 2000 }).data?.data ?? []) as unknown as Atp[];
  const allHotos = (useEntityList('hotos', { pageSize: 2000 }).data?.data ?? []) as unknown as Hoto[];
  const allSnags = (useEntityList('snags', { pageSize: 2000 }).data?.data ?? []) as unknown as Snag[];
  const allPermits = (useEntityList('permits', { pageSize: 2000 }).data?.data ?? []) as unknown as Permit[];
  const allDesign = (useEntityList('designDocuments', { pageSize: 2000 }).data?.data ?? []) as unknown as DesignDocument[];

  if (!project) return { stage: 'Plan', boms: [], pos: [], activities: [], atps: [], snags: [], permits: [], designDocs: [], procured: false, built: false, commissioned: false, hotoAccepted: false, permitsApproved: false, designIssued: false };
  const boms = allBoms.filter((b) => b.projectId === project.id);
  const bomIds = new Set(boms.map((b) => b.id));
  const pos = allPos.filter((p) => p.bomId && bomIds.has(p.bomId));
  const activities = allActs.filter((a) => a.projectId === project.id).sort((a, b) => a.order - b.order);
  const atps = allAtps.filter((a) => a.projectId === project.id);
  const hoto = allHotos.find((h) => h.projectId === project.id);
  const snags = allSnags.filter((s) => s.projectId === project.id);
  const permits = allPermits.filter((p) => p.projectId === project.id);
  const designDocs = allDesign.filter((dd) => dd.projectId === project.id);
  const d = deriveStage(project, boms, activities);
  // Commissioning gate is now ATP-based; HOTO gate on the handover record.
  const commissioned = atps.length > 0 && atps.every((a) => a.status === 'Accepted');
  const hotoAccepted = !!hoto && hoto.status.startsWith('Accepted');
  return { stage: d.stage, boms, pos, activities, current: d.current, atps, hoto, snags, permits, designDocs, procured: d.procured, built: d.built, commissioned, hotoAccepted, permitsApproved: permitGateMet(permits), designIssued: designGateMet(designDocs) };
}

/**
 * Process-centric execution engine. The project IS the work order — advancing
 * the active activity moves the token; gateways gate on procurement / commissioning.
 */
export function useDeliverSpine() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const createAtp = useEntityCreate('atps');
  const createAtpStep = useEntityCreate('atpSteps');
  const createHoto = useEntityCreate('hotos');
  const createDeliverable = useEntityCreate('hotoDeliverables');
  const createSignoff = useEntityCreate('hotoSignoffs');
  const createDevice = useEntityCreate('devices');
  const updateProject = useEntityUpdate('projects');
  const updateActivity = useEntityUpdate('projectActivities');
  const audit = useRecordAudit();
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const types = (useEntityList('deviceTypes', { pageSize: 500 }).data?.data ?? []) as unknown as DcimDeviceType[];

  const recomputeProgress = (snap: DeliverySnapshot) => {
    const tasks = snap.activities.filter((a) => a.nodeType === 'task');
    const done = tasks.filter((a) => a.status === 'Done').length;
    return tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  };

  /**
   * Procurement (completes the procurement activity's gate): a bill of materials from the
   * template's recipe resolved to catalogue items and allocated to the project's steps, one
   * purchase order per vendor with its ERP lines, and the step material lines.
   */
  const generateProcurement = async (project: Project) => {
    const bomId = createMaterialOps(db, user?.name ?? 'Delivery', audit).generateProjectProcurement(project.id);
    for (const k of ['boms', 'bomLines', 'purchaseOrders', 'projects', ...MATERIAL_DATA_KEYS]) void qc.invalidateQueries({ queryKey: [k] });
    if (!bomId) audit('Project', project.id, 'procured', 'The project already has a bill of materials; nothing generated');
  };

  /** ATP pack — formal acceptance test protocols with step grids (feeds the ATP gate). */
  const generateAtpPack = async (project: Project) => {
    const defs: Array<[string, AtpSystem, CxLevel, Array<[string, string, string]>]> = [
      ['Power train ATP', 'Power', 'L4 Functional', [['UPS transfer to battery', 'Open mains breaker', 'Load holds, no drop'], ['Generator auto-start', 'Simulate mains failure', 'Genset online < 15s'], ['STS failover', 'Drop source A', 'Load transfers to B'], ['PDU metering', 'Apply load bank', 'Within ±2%']]],
      ['Cooling ATP', 'Cooling', 'L4 Functional', [['CRAH failover', 'Disable lead unit', 'Lag ramps, temp stable'], ['Chilled water loop', 'Run at design load', 'Supply temp in setpoint'], ['Leak detection', 'Trigger sensor', 'Alarm to BMS']]],
      ['Integrated systems test (IST)', 'Integrated', 'L5 IST', [['Black-building pull', 'Full utility failure', 'Ride-through OK'], ['Full design load', '100% load banks', 'Stable 8h'], ['Failure cascade', 'Sequential trips', 'No IT impact']]],
    ];
    for (const [name, system, level, steps] of defs) {
      const atpId = sid('ATP');
      await createAtp.mutateAsync({ id: atpId, atpId, ...env(), projectId: project.id, name, system, level, status: 'Draft' });
      steps.forEach(([description, method, expectedResult], si) => {
        const id = sid('ATPS');
        createAtpStep.mutate({ id, atpsId: id, ...env(), atpId, stepNo: si + 1, description, method, expectedResult, result: 'Pending' });
      });
    }
    audit('Project', project.id, 'commission', `Generated ATP pack (${defs.length} protocols)`);
  };

  /** Open the HOTO handover package — deliverables checklist + role sign-offs. */
  const openHoto = async (project: Project) => {
    const hotoId = sid('HOTO');
    await createHoto.mutateAsync({ id: hotoId, hotoId, ...env(), projectId: project.id, status: 'In Progress' });
    ['As-built drawings', 'O&M manuals', 'Asset register', 'Spares list', 'Operator training', 'Warranty certificates'].forEach((name, di) => {
      const id = sid('HD');
      createDeliverable.mutate({ id, hdId: id, ...env(), hotoId, category: di >= 4 ? 'Closeout' : 'Documentation', name, status: 'Pending' });
    });
    (['Delivery / PM', 'Commissioning Agent', 'Operations / NOC', 'Facilities'] as const).forEach((role) => {
      const id = sid('HS');
      createSignoff.mutate({ id, hsId: id, ...env(), hotoId, role, name: project.managerName, decision: 'Pending' });
    });
    audit('Project', project.id, 'hoto', 'Opened hand-over package');
  };

  /**
   * Advance the process: complete `activity`, then activate the next node. If the
   * next node is a gateway, evaluate its condition (procurement approved / tests
   * passed); if unmet, the gateway stays pending and advancement blocks.
   */
  const advance = async (project: Project, snap: DeliverySnapshot): Promise<{ ok: boolean; message: string }> => {
    const ordered = snap.activities;
    const cur = snap.current;
    if (!cur) return { ok: false, message: 'No active activity to advance.' };
    const idx = ordered.findIndex((a) => a.id === cur.id);
    await updateActivity.mutateAsync({ id: cur.id, data: { status: 'Done' } });
    audit('Project', project.id, 'activity', `Completed “${cur.name}”`);

    // walk forward, resolving gateways
    let i = idx + 1;
    while (i < ordered.length) {
      const node = ordered[i];
      if (node.nodeType === 'gateway') {
        const passed = node.condition === 'procurement' ? snap.procured
          : node.condition === 'commissioning' ? snap.commissioned
          : node.condition === 'hoto' ? snap.hotoAccepted
          : node.condition === 'permit' ? snap.permitsApproved
          : node.condition === 'design' ? snap.designIssued : true;
        if (!passed) {
          const msg = node.condition === 'procurement' ? 'Procurement gate blocked — generate the BOM/POs first.'
            : node.condition === 'commissioning' ? 'ATP gate blocked — every acceptance test protocol must be Accepted.'
            : node.condition === 'permit' ? 'Permit gate blocked — every required permit for this phase must be Approved.'
            : node.condition === 'design' ? 'Design gate blocked — a design package must be Issued for Construction.'
            : 'HOTO gate blocked — hand-over must be Accepted (snags closed, all sign-offs signed).';
          return { ok: false, message: msg };
        }
        await updateActivity.mutateAsync({ id: node.id, data: { status: 'Done' } });
        i += 1; continue;
      }
      if (node.nodeType === 'end') {
        return { ok: true, message: 'Reached handover — use Go live to provision capacity.' };
      }
      // a task: make it active
      await updateActivity.mutateAsync({ id: node.id, data: { status: 'Active' } });
      break;
    }
    const pct = recomputeProgress({ ...snap, activities: ordered.map((a) => a.id === cur.id ? { ...a, status: 'Done' } : a) });
    await updateProject.mutateAsync({ id: project.id, data: { percentComplete: pct } });
    return { ok: true, message: `Completed “${cur.name}”` };
  };

  /** Go live — provision capacity into the DC and complete the project + end node. */
  const goLive = async (project: Project, snap: DeliverySnapshot, targetKw = 64) => {
    const dcRacks = racks.filter((r) => r.dataCenterId === project.dataCenterId);
    const dtype = types.find((t) => t.role === 'Server') ?? types[0];
    const perKw = 8; const count = Math.max(1, Math.round(targetKw / perKw));
    if (dcRacks.length) {
      for (let i = 0; i < count; i++) {
        const rack = dcRacks[i % dcRacks.length];
        const id = `DEVC-PRJ-${Date.now().toString(36)}-${i}`;
        await createDevice.mutateAsync({ id, devcId: id, ...env(), name: `${project.name.slice(0, 12)}-n${i + 1}`, deviceTypeId: dtype?.id, rackId: rack.id, dataCenterId: project.dataCenterId, position: 1 + (i % 38), status: 'Active', lifecycleState: 'Active', category: 'Server', heightU: 2, powerDrawW: perKw * 1000, ratedThermalW: perKw * 1000, face: 'front' });
      }
    }
    const endNode = snap.activities.find((a) => a.nodeType === 'end');
    if (endNode) await updateActivity.mutateAsync({ id: endNode.id, data: { status: 'Done' } });
    await updateProject.mutateAsync({ id: project.id, data: { status: 'Completed', percentComplete: 100, rag: 'Green', updatedAt: now() } });
    audit('Project', project.id, 'live', `Project delivered — ${dcRacks.length ? `${count} nodes (~${count * perKw} kW) provisioned` : 'completed'}`);
    return { ok: true, count: dcRacks.length ? count : 0 };
  };

  return { generateProcurement, generateAtpPack, openHoto, advance, goLive };
}
