import { useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { TEMPLATE_REGISTRY, buildProcess } from './projectTemplates';
import { buildProgrammeRecords, getBlueprint, type ProgramBlueprint } from './programBlueprints';
import type { ProjectTemplate, ProgramStatus, ProgramType, RAGValue, ActivityStatus } from '../../../mock/data/enums';

const now = () => new Date().toISOString();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });
const sid = (p: string) => `${p}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e4)}`;
const addDays = (iso: string, d: number) => new Date(new Date(iso).getTime() + d * 864e5).toISOString();

export interface NewProgramInput {
  name: string; type: ProgramType; objective: string; ownerName: string; budget: number;
  status: ProgramStatus; startDate: string; endDate: string;
}

export function useCreateProgram() {
  const createProgram = useEntityCreate('programs');
  const audit = useRecordAudit();
  return async (input: NewProgramInput) => {
    const id = sid('PROG');
    await createProgram.mutateAsync({ id, progId: id, ...env(), ...input, projectCount: 0 });
    audit('Program', id, 'created', `Created program ${input.name}`);
    return id;
  };
}

export interface NewGreenfieldInput {
  blueprintKey: string;
  name: string;
  ownerName: string;
  dataCenterId?: string;
  startISO?: string;
  budget?: number;
  objective?: string;
  /** Schedule multiplier from the target data-centre type (see DcTypeProfile.build.durationFactor). */
  durationFactor?: number;
}

/**
 * Instantiates a whole programme from a blueprint: a Program plus one sequenced
 * Project per phase, with dependencies wired and milestones/activities
 * materialised. Returns the new programme id. Uses the same pure builder as the
 * seed, so a user-raised greenfield build is identical in shape to a seeded one.
 */
export function useCreateProgramFromBlueprint() {
  const createProgram = useEntityCreate('programs');
  const createProject = useEntityCreate('projects');
  const createMilestone = useEntityCreate('milestones');
  const createActivity = useEntityCreate('projectActivities');
  const audit = useRecordAudit();

  return async (input: NewGreenfieldInput): Promise<{ programId: string; projectCount: number } | null> => {
    const bp: ProgramBlueprint | undefined = getBlueprint(input.blueprintKey);
    if (!bp) return null;
    const built = buildProgrammeRecords(
      {
        blueprint: bp, name: input.name, ownerName: input.ownerName, dataCenterId: input.dataCenterId,
        startISO: input.startISO ?? now(), budget: input.budget ?? bp.defaultBudget,
        programStatus: 'Active', objective: input.objective, durationFactor: input.durationFactor,
      },
      { id: sid, meta: env },
    );
    await createProgram.mutateAsync(built.program as unknown as Record<string, unknown>);
    for (const p of built.projects) await createProject.mutateAsync(p as unknown as Record<string, unknown>);
    for (const m of built.milestones) await createMilestone.mutateAsync(m as unknown as Record<string, unknown>);
    for (const a of built.activities) await createActivity.mutateAsync(a as unknown as Record<string, unknown>);
    built.audits.forEach((ev) => audit(ev.entityType, ev.entityId, ev.action, ev.summary));
    return { programId: built.program.id, projectCount: built.projects.length };
  };
}

export interface NewProjectInput {
  name: string; programId: string; template: ProjectTemplate; managerName: string;
  dataCenterId?: string; plannedStart: string; plannedEnd: string; budget: number;
  rag?: RAGValue; detail?: Record<string, unknown>;
}

/**
 * Creates a project from a template and materializes its default milestones and
 * tasks from the registry — so a new project arrives with a real, editable plan
 * rather than an empty shell.
 */
export function useCreateProjectFromTemplate() {
  const createProject = useEntityCreate('projects');
  const createMilestone = useEntityCreate('milestones');
  const createTask = useEntityCreate('tasks');
  const createActivity = useEntityCreate('projectActivities');
  const audit = useRecordAudit();

  return async (input: NewProjectInput) => {
    const def = TEMPLATE_REGISTRY[input.template];
    const projId = sid('PROJ');
    await createProject.mutateAsync({
      id: projId, projId, ...env(), programId: input.programId, name: input.name, status: 'Planning',
      rag: input.rag ?? 'Green', managerName: input.managerName, dataCenterId: input.dataCenterId,
      plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, percentComplete: 0, budget: input.budget,
      actualSpend: 0, template: input.template, notes: input.detail ? JSON.stringify(input.detail) : undefined,
    });

    const span = Math.max(1, new Date(input.plannedEnd).getTime() - new Date(input.plannedStart).getTime());
    const ms = def.milestones;
    ms.forEach((name, k) => {
      const id = sid('MS');
      const due = addDays(input.plannedStart, Math.round((span / 864e5) * ((k + 1) / (ms.length + 1))));
      createMilestone.mutate({ id, msId: id, ...env(), projectId: projId, name, dueDate: due, status: 'Not Started', rag: 'Grey' });
    });

    let cursor = input.plannedStart;
    def.tasks.forEach((tk) => {
      const id = sid('TASK');
      const start = cursor;
      const due = addDays(start, tk.effortDays);
      cursor = due;
      createTask.mutate({ id, taskId: id, ...env(), projectId: projId, name: tk.name, status: 'To Do', assignee: input.managerName, startDate: start, dueDate: due, effortDays: tk.effortDays });
    });

    // Materialize the BPMN execution process: Start done, first activity active, rest pending.
    const proc = buildProcess(input.template);
    let firstTaskSeen = false;
    proc.nodes.forEach((node, order) => {
      let status: ActivityStatus = 'Pending';
      if (node.type === 'start') status = 'Done';
      else if (node.type === 'task' && !firstTaskSeen) { status = 'Active'; firstTaskSeen = true; }
      const id = sid('PA');
      createActivity.mutate({ id, paId: id, ...env(), projectId: projId, nodeId: node.id, name: node.name, nodeType: node.type, status, order, attaches: node.attaches, condition: node.condition });
    });

    audit('Project', projId, 'created', `Created project ${input.name} from ${input.template} (${ms.length} milestones, ${def.tasks.length} tasks, process initialised)`);
    return projId;
  };
}
