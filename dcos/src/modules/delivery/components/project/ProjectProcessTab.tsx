/* Process tab: the project's own BPMN process in the bpmn-js viewer with done and active steps,
   open user tasks (complete with their form), work orders and kit readiness per work step, and
   the step history. Kit readiness is a warning only; it never holds a step back. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Drawer } from 'antd';
import type * as T from '../../../../mock/data/types';
import { AlertTriangle, GitBranch, History, ListTodo, MousePointerClick, Workflow } from 'lucide-react';
import { Btn, Chip, KV, Panel } from '../../../../ops/ui/kit';
import { BpmnDiagram, DiagramLegend } from '../../../workorders/components/BpmnDiagram';
import { TaskForm } from '../../../workorders/components/TaskForm';
import { taskOverlays } from '../../../workorders/components/overlays';
import { getFormSchema } from '../../../workorders/lib/forms';
import { recordTaskLink } from '../../../workorders/lib/recordTasks';
import { RecordTaskNotice } from '../../../workorders/components/RecordTaskNotice';
import {
  STATE_LABEL, STATE_TONE, describeInstance, fmtDue, fmtHours, hoursBetween, instanceMarkers, processName, processPid,
  useActor, useBpmnXml, useEngineActions, useEngineIncidents, useFlowNodeInstances, useParsedProcess,
} from '../../../workorders/lib/useWorkflows';
import type { ProjectChain } from '../../lib/chain';
import { isOpenWorkOrder } from '../../lib/chain';
import { stepKeyOf, workStepsOf } from '../../lib/projectProcess';
import { linesOfProject, readinessOf, type ReadinessView } from '../../lib/materialRules';
import { useMaterialData } from '../../lib/materialHooks';
import { ReadinessChip } from './materials';
import { kitShort } from './materialView';
import { DataTable, Muted, ToneChip } from './kit';
import { dateTime, processKeyForTemplate } from './format';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NODE_KIND: Record<string, string> = { usertask: 'User task', servicetask: 'Automatic step', businessruletask: 'Decision', exclusivegateway: 'Decision point', parallelgateway: 'Parallel split', startevent: 'Start', endevent: 'End', intermediatecatchevent: 'Wait', boundaryevent: 'Boundary event', callactivity: 'Sub-process', subprocess: 'Sub-process' };
const kindOf = (type: string) => NODE_KIND[type.replace('bpmn:', '').toLowerCase()] ?? type.replace('bpmn:', '');
const FNI_TONE = { completed: 'success', active: 'info', incident: 'error', terminated: 'neutral' } as const;

export function ProjectProcessTab({ chain, onShowWorkOrders, onShowMaterials }: { chain: ProjectChain; onShowWorkOrders: (stepId?: string) => void; onShowMaterials?: () => void }) {
  const { project, process: inst } = chain;
  const { message } = App.useApp();
  const actions = useEngineActions();
  const { name: actor } = useActor();
  const xml = useBpmnXml(inst?.definitionKey);
  const parsed = useParsedProcess(inst?.definitionKey);
  const allFni = useFlowNodeInstances();
  const allInc = useEngineIncidents();
  const [selected, setSelected] = useState<string | undefined>();
  const [formTask, setFormTask] = useState<{ task: T.ProcessUserTask; boundaryId?: string } | undefined>();
  const [starting, setStarting] = useState(false);
  const mat = useMaterialData();
  const [now] = useState(() => Date.now());

  const openTasks = chain.openTasks;
  const fnis = useMemo(() => allFni.filter((f) => f.instanceId === inst?.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [allFni, inst?.id]);
  const incidents = useMemo(() => allInc.filter((e) => e.instanceId === inst?.id), [allInc, inst?.id]);
  const markers = useMemo(() => instanceMarkers(inst, parsed.data), [inst, parsed.data]);
  const woByStep = useMemo(() => {
    const m = new Map<string, T.WorkOrder[]>();
    for (const w of chain.workOrders) if (w.projectStepId) m.set(w.projectStepId, [...(m.get(w.projectStepId) ?? []), w]);
    return m;
  }, [chain.workOrders]);
  // Kit readiness per work step (step key → readiness of the step's incoming material lines).
  const kitByStep = useMemo(() => {
    const m = new Map<string, ReadinessView>();
    const lines = linesOfProject(mat, project.id);
    const keys = new Set(lines.map((l) => (l.projectStepId ? stepKeyOf(l.projectStepId) : '')).filter(Boolean));
    for (const k of keys) m.set(k, readinessOf(lines.filter((l) => l.projectStepId && stepKeyOf(l.projectStepId) === k), now));
    return m;
  }, [mat, project.id, now]);
  const kitOf = (elementId: string) => kitByStep.get(stepKeyOf(elementId));
  const overlays = useMemo(() => [
    ...taskOverlays(openTasks, incidents),
    ...[...woByStep.entries()].map(([id, ws]) => {
      const open = ws.filter(isOpenWorkOrder).length;
      const kit = kitByStep.get(stepKeyOf(id));
      const kitText = kit && kitShort(kit) && open ? ` · kit ${kit.state === 'Late' ? 'late' : 'not at site'}` : '';
      return { elementId: id, position: { top: -12, right: 8 }, html: `<div class="wf-heat-badge" title="Work orders on this step">${esc(`${ws.length} WO${open ? ` · ${open} open` : ''}${kitText}`)}</div>` };
    }),
  ], [openTasks, incidents, woByStep, kitByStep]);

  if (!inst) {
    const key = processKeyForTemplate(project.template);
    return (
      <Panel title="Process" icon={GitBranch}>
        <div className="col" style={{ gap: 8 }}>
          <div className="vw-card-description">No process is running for this project yet. The process is the agreed sequence of steps for a {project.template ?? 'project'}: who does what, which steps raise work orders, and which gates must clear.</div>
          {key ? (
            <div className="row" style={{ gap: 8 }}>
              <Btn variant="filled" disabled={starting} onClick={async () => {
                setStarting(true);
                try { await actions.startInstance(key, project.projId, { recordType: 'project', recordId: project.id, dataCenterId: project.dataCenterId, title: project.name, variables: { budget: project.budget, rag: project.rag } }); message.success(`${processName(key)} started`); }
                catch (e) { message.error((e as Error).message); } finally { setStarting(false); }
              }}>Start process</Btn>
              <Muted>Starts {processPid(key)} {processName(key)} for {project.projId}.</Muted>
            </div>
          ) : <Muted>No BPMN process is defined for the {project.template ?? 'this'} template yet, so it cannot be started here. Work orders can still be raised from the Work orders tab.</Muted>}
        </div>
      </Panel>
    );
  }

  const summary = describeInstance(inst, openTasks);
  const node = selected ? parsed.data?.nodes[selected] : undefined;
  const selTask = selected ? openTasks.find((t) => t.elementId === selected) : undefined;
  const selWos = selected ? woByStep.get(selected) ?? [] : [];
  const selKit = selected ? kitOf(selected) : undefined;
  const workSteps = workStepsOf(inst.definitionKey).map((s) => {
    const ws = [...(woByStep.get(s.waitId) ?? []), ...(woByStep.get(s.raiseId) ?? [])];
    return { ...s, wos: ws.length, open: ws.filter(isOpenWorkOrder).length, kit: kitByStep.get(s.key) };
  });
  const errorBoundaries = (elementId: string) => Object.values(parsed.data?.nodes ?? {}).filter((n) => n.attachedTo === elementId && n.boundaryKind === 'error' && n.interrupting);
  const onSubmit = async (data: Record<string, unknown>) => {
    if (!formTask) return;
    try {
      const updated = await actions.completeTask(formTask.task.id, data, { boundaryId: formTask.boundaryId });
      setFormTask(undefined);
      message.success(updated.state === 'completed' ? 'Process completed' : `"${formTask.task.name}" completed`);
    } catch (e) { message.error((e as Error).message); }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      {incidents.map((e) => (
        <Panel key={e.id} icon={AlertTriangle} title={`Step "${parsed.data?.nodes[e.elementId]?.name ?? e.elementId}" failed`}
          actions={<><Chip tone="error" dot>Failed</Chip><Btn size="xs" onClick={async () => { await actions.retryIncident(e.id); message.success('Step retried'); }}>Retry step</Btn></>}>
          <div className="vw-card-description">{e.message}</div>
        </Panel>
      ))}
      <Panel icon={Workflow} title={`${processPid(inst.definitionKey)} ${processName(inst.definitionKey)}`} sub={inst.businessKey} flush
        actions={<><DiagramLegend /><ToneChip v={STATE_TONE[inst.state]}>{STATE_LABEL[inst.state]}</ToneChip><Link className="panel-link" to={`/workorders/instances/${inst.id}`}>Open in process console</Link></>}
        foot={
          <div className="row wrap" style={{ gap: 16, fontSize: 'var(--vw-font-label-sm)' }}>
            <span><Muted>Current step</Muted> {summary.step}</span>
            <span><Muted>Waiting on</Muted> {summary.waitingOn}</span>
            <span><Muted>Started</Muted> {dateTime(inst.startedAt)}{inst.endedAt ? <> · <Muted>ended</Muted> {dateTime(inst.endedAt)}</> : null}</span>
            <span className="grow" /><Muted>Click a step to see its tasks and work orders. Numbers on steps count work orders.</Muted>
          </div>
        }>
        <BpmnDiagram xml={xml.data} height={520} markers={markers} overlays={overlays} selectedId={selected} onSelect={setSelected} />
      </Panel>

      <div className="grid g-2">
        <Panel title="Open tasks" icon={ListTodo} count={openTasks.length}>
          <DataTable rows={openTasks} rowKey={(t) => t.id}
            empty={inst.state === 'completed' ? 'The process is complete.' : inst.state === 'cancelled' ? 'The process was cancelled.' : 'Nobody is waiting. The process is running automatic steps or waiting on work orders.'}
            cols={[
              { key: 'task', title: 'Task', wrap: true, render: (t) => <a onClick={() => setSelected(t.elementId)}>{t.name}</a> },
              { key: 'who', title: 'Assignee', wrap: true, render: (t) => t.assignee ?? <Muted>{t.candidateRole}, unassigned</Muted> },
              { key: 'due', title: 'Due', wrap: true, render: (t) => { const d = fmtDue(t.dueAt); return <span style={{ color: d.overdue ? 'var(--vw-color-red-600)' : undefined }}>{d.text}</span>; } },
              { key: 'act', title: '', align: 'right', render: (t) => (
                <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                  {!t.assignee && <Btn size="xs" onClick={() => actions.claimTask(t.id)}>Claim</Btn>}
                  <Btn size="xs" variant="filled" onClick={() => setFormTask({ task: t })}>Complete</Btn>
                </span>
              ) },
            ]} />
        </Panel>

        <Panel title={node ? node.name : 'Selected step'} icon={MousePointerClick} sub={node ? kindOf(node.type) : undefined}>
          {!node ? <div className="vw-card-description">Click a step in the diagram to see who does it, its open task and the work orders it raised.</div> : (
            <div className="col" style={{ gap: 12 }}>
              <KV cols={2} items={[
                ['Status', markers[node.id] === 'completed' ? 'Done' : markers[node.id] === 'active' ? 'Active now' : markers[node.id] === 'incident' ? 'Failed, needs a retry' : 'Not reached'],
                ['Lane', node.lane ?? '—'],
                ...(node.candidateGroups ? [['Done by', node.candidateGroups] as [string, string]] : []),
                ...(node.dueHours ? [['Time allowed', fmtHours(node.dueHours)] as [string, string]] : []),
                ['Open task', selTask ? `${selTask.name} · ${selTask.assignee ?? `${selTask.candidateRole}, unassigned`} · ${fmtDue(selTask.dueAt).text}` : 'None'],
                ['Work orders', selWos.length ? <a onClick={() => onShowWorkOrders(node.id)}>{selWos.length} ({selWos.filter(isOpenWorkOrder).length} open)</a> : 'None'],
                ...(selKit ? [['Kit', <span className="row wrap" style={{ gap: 8 }}><ReadinessChip view={selKit} /><Muted>{selKit.atSite} of {selKit.lines} at site{selKit.reasons.length ? `; ${selKit.reasons.join('; ')}` : ''}</Muted></span>] as [string, React.ReactNode]] : []),
              ]} />
              {selTask && (
                <div className="row wrap" style={{ gap: 6 }}>
                  <Btn size="xs" variant="filled" onClick={() => setFormTask({ task: selTask })}>Complete this task</Btn>
                  {errorBoundaries(selTask.elementId).map((b) => <Btn key={b.id} size="xs" variant="danger-subtle" onClick={() => setFormTask({ task: selTask, boundaryId: b.id })}>{b.name}</Btn>)}
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      {workSteps.length > 0 && (
        <Panel title="Work steps" icon={ListTodo} count={workSteps.length} sub="Steps that raise work orders. Kit readiness is a warning only.">
          <DataTable rows={workSteps} rowKey={(s) => s.key}
            cols={[
              { key: 'step', title: 'Step', wrap: true, render: (s) => <a onClick={() => setSelected(s.waitId)}>{s.name}</a> },
              { key: 'state', title: 'Status', render: (s) => (markers[s.waitId] === 'completed' ? <Muted>done</Muted> : markers[s.waitId] === 'active' || markers[s.raiseId] === 'active' ? 'Active now' : <Muted>not reached</Muted>) },
              { key: 'wo', title: 'Work orders', render: (s) => (s.wos ? <a onClick={() => onShowWorkOrders(s.waitId)}>{s.wos} ({s.open} open)</a> : <Muted>none yet</Muted>) },
              { key: 'kit', title: 'Kit', render: (s) => (s.kit ? <ReadinessChip view={s.kit} /> : <Muted>no materials</Muted>) },
              { key: 'detail', title: 'Materials', wrap: true, render: (s) => (s.kit && s.kit.lines ? <Muted>{s.kit.atSite} of {s.kit.lines} items at site{s.kit.reasons.length ? `; ${s.kit.reasons.join('; ')}` : ''}</Muted> : <Muted>—</Muted>) },
              ...(onShowMaterials ? [{ key: 'go', title: '', align: 'right' as const, render: (s: (typeof workSteps)[number]) => (s.kit ? <a onClick={onShowMaterials}>Materials</a> : null) }] : []),
            ]} />
        </Panel>
      )}

      <Panel title="Step history" icon={History} count={fnis.length} sub="Newest first">
        <DataTable rows={fnis} rowKey={(f) => f.id} empty="No steps recorded yet."
          cols={[
            { key: 'step', title: 'Step', wrap: true, render: (f) => <a onClick={() => setSelected(f.elementId)}>{f.elementName}</a> },
            { key: 'kind', title: 'Kind', render: (f) => kindOf(f.type) },
            { key: 'who', title: 'Who', render: (f) => f.assignee ?? <Muted>System</Muted> },
            { key: 'start', title: 'Started', render: (f) => dateTime(f.startedAt) },
            { key: 'end', title: 'Finished', render: (f) => dateTime(f.endedAt) },
            { key: 'dur', title: 'Took', align: 'right', render: (f) => (f.endedAt ? fmtHours(hoursBetween(f.startedAt, f.endedAt)) : f.state === 'active' ? `${fmtHours(hoursBetween(f.startedAt))} so far` : '—') },
            { key: 'state', title: 'State', render: (f) => <ToneChip v={FNI_TONE[f.state]}>{f.state === 'completed' ? 'Done' : f.state === 'active' ? 'Active' : f.state === 'incident' ? 'Failed' : 'Stopped'}</ToneChip> },
          ]} />
      </Panel>

      <Drawer open={!!formTask} onClose={() => setFormTask(undefined)} width={520} destroyOnHidden
        title={formTask ? (formTask.boundaryId ? `${parsed.data?.nodes[formTask.boundaryId]?.name ?? 'Report error'}: ${formTask.task.name}` : formTask.task.name) : ''}>
        {formTask && (
          <div className="vw-flex vw-flex-col vw-gap-md">
            <div className="vw-card-description">
              {formTask.boundaryId ? `Reports a problem on "${formTask.task.name}". The task stops and the process takes the error path.` : `You are completing this task as ${actor}. Candidates: ${formTask.task.candidateRole}.`}
            </div>
            {!formTask.boundaryId && recordTaskLink(inst, formTask.task) ? <RecordTaskNotice link={recordTaskLink(inst, formTask.task)!} /> : (
              <TaskForm formInstanceKey={`${formTask.task.id}:${formTask.boundaryId ?? ''}`} schema={getFormSchema(formTask.task.formKey)} data={{ signedBy: actor, assignee: actor }} onSubmit={onSubmit}
                submitLabel={formTask.boundaryId ? 'Report and roll back' : 'Complete task'} />
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
