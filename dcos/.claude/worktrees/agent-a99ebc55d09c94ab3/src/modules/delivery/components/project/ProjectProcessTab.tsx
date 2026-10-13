/* Process tab: the project's own BPMN process in the bpmn-js viewer with done and active steps,
   open user tasks (complete with their form), work orders per step, and the step history. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Drawer } from 'antd';
import type * as T from '../../../../mock/data/types';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { BpmnDiagram, DiagramLegend } from '../../../workorders/components/BpmnDiagram';
import { TaskForm } from '../../../workorders/components/TaskForm';
import { taskOverlays } from '../../../workorders/components/overlays';
import { getFormSchema } from '../../../workorders/lib/forms';
import {
  STATE_LABEL, STATE_TONE, describeInstance, fmtDue, fmtHours, hoursBetween, instanceMarkers, processName, processPid,
  useActor, useBpmnXml, useEngineActions, useEngineIncidents, useFlowNodeInstances, useParsedProcess,
} from '../../../workorders/lib/useWorkflows';
import type { ProjectChain } from '../../lib/chain';
import { isOpenWorkOrder } from '../../lib/chain';
import { DataTable, KvList, Muted } from './kit';
import { dateTime, processKeyForTemplate } from './format';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NODE_KIND: Record<string, string> = { usertask: 'User task', servicetask: 'Automatic step', businessruletask: 'Decision', exclusivegateway: 'Decision point', parallelgateway: 'Parallel split', startevent: 'Start', endevent: 'End', intermediatecatchevent: 'Wait', boundaryevent: 'Boundary event', callactivity: 'Sub-process', subprocess: 'Sub-process' };
const kindOf = (type: string) => NODE_KIND[type.replace('bpmn:', '').toLowerCase()] ?? type.replace('bpmn:', '');
const FNI_TONE = { completed: 'success', active: 'info', incident: 'error', terminated: 'neutral' } as const;

export function ProjectProcessTab({ chain, onShowWorkOrders }: { chain: ProjectChain; onShowWorkOrders: (stepId?: string) => void }) {
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

  const openTasks = chain.openTasks;
  const fnis = useMemo(() => allFni.filter((f) => f.instanceId === inst?.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [allFni, inst?.id]);
  const incidents = useMemo(() => allInc.filter((e) => e.instanceId === inst?.id), [allInc, inst?.id]);
  const markers = useMemo(() => instanceMarkers(inst, parsed.data), [inst, parsed.data]);
  const woByStep = useMemo(() => {
    const m = new Map<string, T.WorkOrder[]>();
    for (const w of chain.workOrders) if (w.projectStepId) m.set(w.projectStepId, [...(m.get(w.projectStepId) ?? []), w]);
    return m;
  }, [chain.workOrders]);
  const overlays = useMemo(() => [
    ...taskOverlays(openTasks, incidents),
    ...[...woByStep.entries()].map(([id, ws]) => {
      const open = ws.filter(isOpenWorkOrder).length;
      return { elementId: id, position: { top: -12, right: 8 }, html: `<div class="wf-heat-badge" title="Work orders on this step">${esc(`${ws.length} WO${open ? ` · ${open} open` : ''}`)}</div>` };
    }),
  ], [openTasks, incidents, woByStep]);

  if (!inst) {
    const key = processKeyForTemplate(project.template);
    return (
      <VwCard title="Process">
        <div className="vw-flex vw-flex-col vw-gap-sm">
          <div className="vw-card-description">No process is running for this project yet. The process is the agreed sequence of steps for a {project.template ?? 'project'}: who does what, which steps raise work orders, and which gates must clear.</div>
          {key ? (
            <div className="vw-flex vw-items-center vw-gap-sm">
              <Button type="primary" loading={starting} onClick={async () => {
                setStarting(true);
                try { await actions.startInstance(key, project.projId, { recordType: 'project', recordId: project.id, dataCenterId: project.dataCenterId, title: project.name, variables: { budget: project.budget, rag: project.rag } }); message.success(`${processName(key)} started`); }
                catch (e) { message.error((e as Error).message); } finally { setStarting(false); }
              }}>Start process</Button>
              <Muted>Starts {processPid(key)} {processName(key)} for {project.projId}.</Muted>
            </div>
          ) : <Muted>No BPMN process is defined for the {project.template ?? 'this'} template yet, so it cannot be started here. Work orders can still be raised from the Work orders tab.</Muted>}
        </div>
      </VwCard>
    );
  }

  const summary = describeInstance(inst, openTasks);
  const node = selected ? parsed.data?.nodes[selected] : undefined;
  const selTask = selected ? openTasks.find((t) => t.elementId === selected) : undefined;
  const selWos = selected ? woByStep.get(selected) ?? [] : [];
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
    <div className="vw-flex vw-flex-col vw-gap-md">
      {incidents.map((e) => (
        <VwCard key={e.id} tone="error" title={`Step "${parsed.data?.nodes[e.elementId]?.name ?? e.elementId}" failed`}
          extra={<Button size="small" onClick={async () => { await actions.retryIncident(e.id); message.success('Step retried'); }}>Retry step</Button>}>
          <div className="vw-card-description">{e.message}</div>
        </VwCard>
      ))}
      <VwCard title={<span>{processPid(inst.definitionKey)} {processName(inst.definitionKey)} <Muted>· {inst.businessKey}</Muted></span>}
        extra={<span className="vw-inline-flex vw-items-center vw-gap-sm"><DiagramLegend /><VwChip variant={STATE_TONE[inst.state]}>{STATE_LABEL[inst.state]}</VwChip><Link to={`/workorders/instances/${inst.id}`}>Open in process console</Link></span>}>
        <BpmnDiagram xml={xml.data} height={520} markers={markers} overlays={overlays} selectedId={selected} onSelect={setSelected} />
        <div className="vw-flex vw-gap-lg vw-wrap" style={{ marginTop: 'var(--vw-space-sm)', fontSize: 'var(--vw-font-label-sm)' }}>
          <span><Muted>Current step</Muted> {summary.step}</span>
          <span><Muted>Waiting on</Muted> {summary.waitingOn}</span>
          <span><Muted>Started</Muted> {dateTime(inst.startedAt)}{inst.endedAt ? <> · <Muted>ended</Muted> {dateTime(inst.endedAt)}</> : null}</span>
          <span style={{ flex: 1 }} /><Muted>Click a step to see its tasks and work orders. Numbers on steps count work orders.</Muted>
        </div>
      </VwCard>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <VwCard title="Open tasks" extra={<Muted>{openTasks.length}</Muted>}>
          <DataTable rows={openTasks} rowKey={(t) => t.id}
            empty={inst.state === 'completed' ? 'The process is complete.' : inst.state === 'cancelled' ? 'The process was cancelled.' : 'Nobody is waiting. The process is running automatic steps or waiting on work orders.'}
            cols={[
              { key: 'task', title: 'Task', wrap: true, render: (t) => <a onClick={() => setSelected(t.elementId)}>{t.name}</a> },
              { key: 'who', title: 'Assignee', wrap: true, render: (t) => t.assignee ?? <Muted>{t.candidateRole}, unassigned</Muted> },
              { key: 'due', title: 'Due', wrap: true, render: (t) => { const d = fmtDue(t.dueAt); return <span style={{ color: d.overdue ? 'var(--vw-color-red-600)' : undefined }}>{d.text}</span>; } },
              { key: 'act', title: '', align: 'right', render: (t) => (
                <span className="vw-inline-flex vw-gap-xs">
                  {!t.assignee && <Button size="small" onClick={() => actions.claimTask(t.id)}>Claim</Button>}
                  <Button size="small" type="primary" onClick={() => setFormTask({ task: t })}>Complete</Button>
                </span>
              ) },
            ]} />
        </VwCard>

        <VwCard title={node ? node.name : 'Selected step'} extra={node ? <Muted>{kindOf(node.type)}</Muted> : undefined}>
          {!node ? <div className="vw-card-description">Click a step in the diagram to see who does it, its open task and the work orders it raised.</div> : (
            <div className="vw-flex vw-flex-col vw-gap-sm">
              <KvList items={[
                { label: 'Status', value: markers[node.id] === 'completed' ? 'Done' : markers[node.id] === 'active' ? 'Active now' : markers[node.id] === 'incident' ? 'Failed, needs a retry' : 'Not reached' },
                { label: 'Lane', value: node.lane ?? '—' },
                ...(node.candidateGroups ? [{ label: 'Done by', value: node.candidateGroups }] : []),
                ...(node.dueHours ? [{ label: 'Time allowed', value: fmtHours(node.dueHours) }] : []),
                { label: 'Open task', value: selTask ? `${selTask.name} · ${selTask.assignee ?? `${selTask.candidateRole}, unassigned`} · ${fmtDue(selTask.dueAt).text}` : 'None' },
                { label: 'Work orders', value: selWos.length ? <a onClick={() => onShowWorkOrders(node.id)}>{selWos.length} ({selWos.filter(isOpenWorkOrder).length} open)</a> : 'None' },
              ]} />
              {selTask && (
                <div className="vw-flex vw-gap-xs vw-wrap">
                  <Button size="small" type="primary" onClick={() => setFormTask({ task: selTask })}>Complete this task</Button>
                  {errorBoundaries(selTask.elementId).map((b) => <Button key={b.id} size="small" danger onClick={() => setFormTask({ task: selTask, boundaryId: b.id })}>{b.name}</Button>)}
                </div>
              )}
            </div>
          )}
        </VwCard>
      </div>

      <VwCard title="Step history" extra={<Muted>{fnis.length} steps, newest first</Muted>}>
        <DataTable rows={fnis} rowKey={(f) => f.id} empty="No steps recorded yet."
          cols={[
            { key: 'step', title: 'Step', wrap: true, render: (f) => <a onClick={() => setSelected(f.elementId)}>{f.elementName}</a> },
            { key: 'kind', title: 'Kind', render: (f) => kindOf(f.type) },
            { key: 'who', title: 'Who', render: (f) => f.assignee ?? <Muted>System</Muted> },
            { key: 'start', title: 'Started', render: (f) => dateTime(f.startedAt) },
            { key: 'end', title: 'Finished', render: (f) => dateTime(f.endedAt) },
            { key: 'dur', title: 'Took', align: 'right', render: (f) => (f.endedAt ? fmtHours(hoursBetween(f.startedAt, f.endedAt)) : f.state === 'active' ? `${fmtHours(hoursBetween(f.startedAt))} so far` : '—') },
            { key: 'state', title: 'State', render: (f) => <VwChip variant={FNI_TONE[f.state]}>{f.state === 'completed' ? 'Done' : f.state === 'active' ? 'Active' : f.state === 'incident' ? 'Failed' : 'Stopped'}</VwChip> },
          ]} />
      </VwCard>

      <Drawer open={!!formTask} onClose={() => setFormTask(undefined)} width={520} destroyOnHidden
        title={formTask ? (formTask.boundaryId ? `${parsed.data?.nodes[formTask.boundaryId]?.name ?? 'Report error'}: ${formTask.task.name}` : formTask.task.name) : ''}>
        {formTask && (
          <div className="vw-flex vw-flex-col vw-gap-md">
            <div className="vw-card-description">
              {formTask.boundaryId ? `Reports a problem on "${formTask.task.name}". The task stops and the process takes the error path.` : `You are completing this task as ${actor}. Candidates: ${formTask.task.candidateRole}.`}
            </div>
            <TaskForm formInstanceKey={`${formTask.task.id}:${formTask.boundaryId ?? ''}`} schema={getFormSchema(formTask.task.formKey)} data={{ signedBy: actor, assignee: actor }} onSubmit={onSubmit}
              submitLabel={formTask.boundaryId ? 'Report and roll back' : 'Complete task'} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
