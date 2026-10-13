import { useEntityCreate, useEntityUpdate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useCreateProgramFromBlueprint, useCreateProjectFromTemplate } from '../../delivery/lib/createFlows';
import { TEMPLATE_REGISTRY } from '../../delivery/lib/projectTemplates';
import type { Plan, Program, Rack, DcimDeviceType } from '../../../mock/data/types';
import type { PlanType, PlanExecPath, ChangeType, ProjectTemplate, ProgramType } from '../../../mock/data/enums';
import { DC_TYPE_CATALOG, dcTypeByName } from '../../../mock/data/dcTypes';

const now = () => new Date().toISOString();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });

export const PLAN_DEFAULT_PATH: Record<PlanType, PlanExecPath> = {
  'New Rollout': 'Project', 'Capacity Expansion': 'Project', 'Network Change': 'Change',
  'Reallocation/Migration': 'Change', 'Decommission Program': 'Project', 'Facility Build': 'Programme',
};
export const PLAN_DEFAULT_TEMPLATE: Record<PlanType, ProjectTemplate> = {
  'New Rollout': 'Hall Fit-out', 'Capacity Expansion': 'Capacity Expansion', 'Network Change': 'Network Refresh',
  'Reallocation/Migration': 'Migration Wave', 'Decommission Program': 'Decommission Program', 'Facility Build': 'Greenfield DC Build',
};
export function planToChangeType(t: PlanType): ChangeType {
  switch (t) {
    case 'Network Change': return 'NetworkMigration';
    case 'Reallocation/Migration': return 'ServerRelocation';
    case 'Decommission Program': return 'Decommission';
    case 'Capacity Expansion': return 'PowerUpgrade';
    default: return 'RackDeploy';
  }
}

/** Milestones a project created from a template receives — read from the delivery template registry so the preview matches what is built. */
export const TEMPLATE_MILESTONES: Partial<Record<ProjectTemplate, string[]>> = Object.fromEntries(
  Object.entries(TEMPLATE_REGISTRY).map(([k, d]) => [k, d.milestones]),
) as Partial<Record<ProjectTemplate, string[]>>;

/** Which programme a plan-born project joins when the plan names none: the active programme of the matching type. */
const PROGRAM_TYPE_FOR_PLAN: Record<PlanType, ProgramType> = {
  'New Rollout': 'Capacity Expansion', 'Capacity Expansion': 'Capacity Expansion', 'Network Change': 'Network Modernization',
  'Reallocation/Migration': 'Other', 'Decommission Program': 'Decommissioning', 'Facility Build': 'Greenfield Build',
};

/** Per-type detail fields — shared by the wizard (render) and the detail page (display). */
export interface PlanField { name: string; label: string; kind: 'text' | 'number' | 'select' | 'bool'; options?: string[] }
export const PLAN_TYPE_FIELDS: Record<PlanType, PlanField[]> = {
  'New Rollout': [
    { name: 'targetHall', label: 'Target hall / floor', kind: 'text' },
    { name: 'rackCount', label: 'Racks to deploy', kind: 'number' },
    { name: 'rackPurpose', label: 'Rack purpose', kind: 'select', options: ['Compute', 'Storage', 'Network', 'GPU', 'Mixed'] },
    { name: 'deviceCount', label: 'Devices (approx)', kind: 'number' },
    { name: 'powerBudgetKw', label: 'Power budget (kW)', kind: 'number' },
  ],
  'Capacity Expansion': [
    { name: 'resourceKind', label: 'Resource kind', kind: 'select', options: ['Compute', 'GPU', 'Storage', 'Network'] },
    { name: 'quantity', label: 'Quantity', kind: 'number' },
    { name: 'powerKw', label: 'Power needed (kW)', kind: 'number' },
    { name: 'coolingKw', label: 'Cooling needed (kW)', kind: 'number' },
    { name: 'liquidCooling', label: 'Liquid cooling required', kind: 'bool' },
  ],
  'Network Change': [
    { name: 'subtype', label: 'Change subtype', kind: 'select', options: ['VLAN provision', 'IP allocation', 'Routing change', 'Firewall change', 'Migration'] },
    { name: 'affectedScope', label: 'Affected subnets / VLANs / VRFs', kind: 'text' },
    { name: 'maintenanceWindow', label: 'Maintenance window', kind: 'text' },
    { name: 'downtimeExpected', label: 'Downtime expected', kind: 'bool' },
    { name: 'rollback', label: 'Rollback plan', kind: 'text' },
  ],
  'Reallocation/Migration': [
    { name: 'fromLocation', label: 'From (DC / hall / rack)', kind: 'text' },
    { name: 'toLocation', label: 'To (DC / hall / rack)', kind: 'text' },
    { name: 'movingWhat', label: 'What is moving', kind: 'text' },
    { name: 'itemCount', label: 'Item count', kind: 'number' },
    { name: 'migrationWindow', label: 'Migration window', kind: 'text' },
    { name: 'workloadImpact', label: 'Workload impact', kind: 'select', options: ['None (live)', 'Brief pause', 'Scheduled downtime'] },
  ],
  'Decommission Program': [
    { name: 'scope', label: 'Scope', kind: 'text' },
    { name: 'itemCount', label: 'Item count', kind: 'number' },
    { name: 'reason', label: 'Reason', kind: 'select', options: ['End-of-life', 'Consolidation', 'Fault', 'Cost'] },
    { name: 'sanitization', label: 'Data sanitization required', kind: 'bool' },
    { name: 'disposalMethod', label: 'Disposal method', kind: 'select', options: ['Wipe & reuse', 'Destroy', 'Return to vendor', 'Recycle'] },
  ],
  'Facility Build': [
    { name: 'dcType', label: 'Data center type', kind: 'select', options: DC_TYPE_CATALOG.map((t) => t.name) },
    { name: 'targetMw', label: 'Target IT load', kind: 'number' },
    { name: 'tier', label: 'Resilience tier', kind: 'select', options: ['Tier II', 'Tier III', 'Tier IV'] },
    { name: 'region', label: 'Region', kind: 'select', options: ['North America', 'EMEA', 'APAC', 'LATAM'] },
    { name: 'rfsDate', label: 'Target ready-for-service', kind: 'text' },
  ],
};

export const decodeDetail = (s?: string): Record<string, unknown> => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };

export interface DeliverResult { ok: boolean; count: number; kw: number; message: string }

/**
 * Closes the loop: an executed capacity-adding plan is *delivered* by provisioning the planned
 * load into the data center's racks (active devices). The live capacity model then reflects it —
 * usage rises, and the committed pipeline clears because the plan moves to Completed.
 */
export function useDeliverPlan() {
  const createDevice = useEntityCreate('devices');
  const updatePlan = useEntityUpdate('plans');
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const types = (useEntityList('deviceTypes', { pageSize: 500 }).data?.data ?? []) as unknown as DcimDeviceType[];

  return async (plan: Plan): Promise<DeliverResult> => {
    const d = decodeDetail(plan.detail);
    const kw = Number(d.powerKw) || (Number(d.quantity) || 0) * 0.4 || 40;   // target load to land
    const dcRacks = racks.filter((r) => r.dataCenterId === plan.dataCenterId);
    if (!dcRacks.length) return { ok: false, count: 0, kw: 0, message: 'No racks in the plan’s data center to land capacity into.' };
    const dtype = types.find((t) => t.role === 'Server') ?? types[0];
    const perKw = 8;                                                          // ~8 kW per provisioned node
    const count = Math.max(1, Math.round(kw / perKw));
    for (let i = 0; i < count; i++) {
      const rack = dcRacks[i % dcRacks.length];
      const id = `DEVC-DEL-${Date.now().toString(36)}-${i}`;
      await createDevice.mutateAsync({
        id, devcId: id, ...env(), name: `${plan.title.slice(0, 14)}-n${i + 1}`, deviceTypeId: dtype?.id,
        rackId: rack.id, dataCenterId: plan.dataCenterId, position: 1 + (i % 38), status: 'Active', lifecycleState: 'Active',
        category: 'GPU-Node', heightU: 2, powerDrawW: perKw * 1000, ratedThermalW: perKw * 1000, face: 'front',
      });
    }
    await updatePlan.mutateAsync({ id: plan.id, data: { status: 'Completed', executedAt: now() } });
    return { ok: true, count, kw: count * perKw, message: `Delivered ${count} nodes (~${count * perKw} kW) into the estate` };
  };
}

export interface ExecResult { ok: boolean; kind: PlanExecPath; recordId: string; message: string }

/** Turns an approved plan into its execution vehicle (Change with a type, or Project from a template) and links it back. */
export function useExecutePlan() {
  const updatePlan = useEntityUpdate('plans');
  const createCR = useEntityCreate('changeRequests');
  const createProjectFromTemplate = useCreateProjectFromTemplate();
  const updateProject = useEntityUpdate('projects');
  const createProgramme = useCreateProgramFromBlueprint();
  const programs = (useEntityList('programs', { pageSize: 100 }).data?.data ?? []) as unknown as Program[];

  return async (plan: Plan, path: PlanExecPath, opts?: { changeType?: ChangeType; projectTemplate?: ProjectTemplate; blueprintKey?: string }): Promise<ExecResult> => {
    if (path === 'Programme') {
      // The plan's data-centre type picks the blueprint, its schedule factor and, if no cost was estimated, its default budget.
      const d = decodeDetail(plan.detail);
      const dcType = dcTypeByName(typeof d.dcType === 'string' ? d.dcType : undefined);
      const blueprintKey = opts?.blueprintKey ?? plan.blueprintKey ?? dcType?.build.blueprintKey ?? 'greenfield-dc';
      const res = await createProgramme({
        blueprintKey, name: plan.title, ownerName: plan.ownerName || 'Programme director',
        dataCenterId: plan.dataCenterId, budget: plan.estimatedCost || dcType?.build.defaultBudget,
        objective: `${dcType ? `${dcType.name} · ` : ''}${plan.businessJustification || plan.description}`, startISO: now(),
        durationFactor: dcType?.build.durationFactor,
      });
      if (!res) return { ok: false, kind: 'Programme', recordId: '', message: `No blueprint found for "${blueprintKey}"` };
      await updatePlan.mutateAsync({ id: plan.id, data: { status: 'Executing', execPath: 'Programme', blueprintKey, linkedProgramId: res.programId, executedAt: now() } });
      return { ok: true, kind: 'Programme', recordId: res.programId, message: `Programme created from the ${blueprintKey} blueprint with ${res.projectCount} sequenced phases` };
    }
    if (path === 'Change') {
      const changeType = opts?.changeType ?? plan.changeType ?? planToChangeType(plan.type);
      const id = `CHG-PLAN-${Date.now().toString(36).toUpperCase()}`;
      const rec = await createCR.mutateAsync({
        id, chgId: id, ...env(), title: `[Plan] ${plan.title}`, type: changeType, description: plan.description || plan.businessJustification,
        risk: plan.risk, status: 'Submitted', priority: plan.priority, affectedResourceType: 'Rack', affectedResourceIds: [],
        dataCenterId: plan.dataCenterId, requestedBy: plan.ownerName || 'Planning', requestedById: 'planning', policyViolations: [],
        source: 'Internal', rollbackPlan: '', scheduledStart: plan.targetDate,
      });
      await updatePlan.mutateAsync({ id: plan.id, data: { status: 'Executing', execPath: 'Change', changeType, linkedChangeRequestId: rec.id as string, executedAt: now() } });
      return { ok: true, kind: 'Change', recordId: rec.id as string, message: `Change request created (${changeType})` };
    }
    // A plan-born project is built exactly like one raised in Delivery: milestones, tasks and the
    // BPMN execution process come from the template registry, so the Delivery tab starts at step one.
    const template = opts?.projectTemplate ?? plan.projectTemplate ?? PLAN_DEFAULT_TEMPLATE[plan.type];
    const def = TEMPLATE_REGISTRY[template];
    const wantedType = PROGRAM_TYPE_FOR_PLAN[plan.type];
    const program = programs.find((p) => p.status === 'Active' && p.type === wantedType) ?? programs.find((p) => p.status === 'Active') ?? programs[0];
    const projId = await createProjectFromTemplate({
      name: plan.title, programId: program?.id ?? '', template, managerName: plan.ownerName || 'Unassigned',
      dataCenterId: plan.dataCenterId, plannedStart: now(), plannedEnd: plan.targetDate,
      budget: plan.estimatedCost ?? def.defaultBudget, detail: decodeDetail(plan.detail),
    });
    await updateProject.mutateAsync({ id: projId, data: { planId: plan.id } });
    await updatePlan.mutateAsync({ id: plan.id, data: { status: 'Executing', execPath: 'Project', projectTemplate: template, linkedProjectId: projId, executedAt: now() } });
    return { ok: true, kind: 'Project', recordId: projId, message: `Project created from “${template}” template with ${def.milestones.length} milestones, ${def.tasks.length} tasks and its execution process${program ? ` in ${program.name}` : ''}` };
  };
}
