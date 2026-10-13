import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
/** One work order: diagram with the completed path and live token, open tasks (with forms), variables and timeline. */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { App, Drawer } from 'antd';
import { Braces, Check, CheckCircle2, GitBranch, History, Inbox, Link as LinkIcon, Play, RotateCw, Square, TriangleAlert, XCircle, type LucideIcon } from 'lucide-react';
import type * as T from '../../../mock/data/types';
import { Btn, Chip, Panel } from '../../../ops/ui/kit';
import type { Tone } from '../../../ops/ui/Analytics';
import { WorkOrdersPage } from '../components/WorkOrdersHeader';
import { BpmnDiagram, DiagramLegend } from '../components/BpmnDiagram';
import { TaskForm } from '../components/TaskForm';
import { getFormSchema } from '../lib/forms';
import { describeValue } from '../lib/formData';
import { recordTaskLink } from '../lib/recordTasks';
import { TaskDataView } from '../components/TaskDataView';
import { RecordTaskNotice } from '../components/RecordTaskNotice';
import { taskOverlays } from '../components/overlays';
import {
  RECORD_LABEL, STATE_LABEL, STATE_TONE, describeInstance, fmtAgo, fmtDate, fmtDue, fmtHours, hoursBetween, instanceMarkers, processName, processPid, recordPath,
  useActor, useBpmnXml, useDataCenters, useEngineActions, useEngineIncidents, useFlowNodeInstances, useInstance, useParsedProcess, useUserTasks,
} from '../lib/useWorkflows';

const FNI: Record<T.FlowNodeState, { tone: Tone; icon: LucideIcon }> = { completed: { tone: 'success', icon: Check }, active: { tone: 'info', icon: Play }, incident: { tone: 'error', icon: TriangleAlert }, terminated: { tone: 'neutral', icon: Square } };

export default function InstancePage() {
  const { id } = useParams();
  const { message } = App.useApp();
  const inst = useInstance(id);
  const xml = useBpmnXml(inst?.definitionKey);
  const parsed = useParsedProcess(inst?.definitionKey);
  const allTasks = useUserTasks();
  const allFni = useFlowNodeInstances();
  const allEinc = useEngineIncidents();
  const dcs = useDataCenters();
  const actions = useEngineActions();
  const { name: actor } = useActor();
  const [selected, setSelected] = useState<string | undefined>();
  const [formTask, setFormTask] = useState<{ task: T.ProcessUserTask; boundaryId?: string } | undefined>();

  const tasks = useMemo(() => allTasks.filter((t) => t.instanceId === id), [allTasks, id]);
  const openTasks = tasks.filter((t) => t.state === 'created');
  const doneTasks = tasks.filter((t) => t.state === 'completed').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const fnis = useMemo(() => allFni.filter((f) => f.instanceId === id).sort((a, b) => a.startedAt.localeCompare(b.startedAt)), [allFni, id]);
  const eincs = useMemo(() => allEinc.filter((e) => e.instanceId === id), [allEinc, id]);
  const markers = useMemo(() => instanceMarkers(inst, parsed.data), [inst, parsed.data]);
  const overlays = useMemo(() => taskOverlays(openTasks, eincs), [openTasks, eincs]);
  const dc = dcs.find((d) => d.id === inst?.dataCenterId);

  if (!inst) {
    return (
      <PageEmptyState title="Work order not found" description={<>Work order {id} was not found. <Link to="/workorders/instances">Back to the list</Link>.</>} />
    );
  }

  const summary = describeInstance(inst, allTasks);
  const formRecordLink = formTask ? recordTaskLink(inst, formTask.task) : undefined;
  const errorBoundariesFor = (elementId: string) => recordTaskLink(inst, { elementId }) ? [] : Object.values(parsed.data?.nodes ?? {}).filter((n) => n.attachedTo === elementId && n.boundaryKind === 'error' && n.interrupting);
  const taskFor = (elementId: string) => openTasks.find((t) => t.elementId === elementId);

  const onSubmit = async (data: Record<string, unknown>) => {
    if (!formTask) return;
    try {
      const updated = await actions.completeTask(formTask.task.id, data, { boundaryId: formTask.boundaryId });
      setFormTask(undefined);
      message.success(updated.state === 'completed' ? 'Work order completed' : `"${formTask.task.name}" completed — token moved to ${describeInstance(updated, allTasks).step}`);
    } catch (e) { message.error((e as Error).message); }
  };

  const nodeName = (elementId: string) => (elementId in (parsed.data?.nodes ?? {}) ? parsed.data!.nodes[elementId].name : elementId);
  const selNode = selected ? parsed.data?.nodes[selected] : undefined;

  return (
    <WorkOrdersPage
      title={`${processPid(inst.definitionKey)} ${processName(inst.definitionKey)} · ${inst.businessKey}`}
      description={String(inst.variables.title ?? '')}
      extra={(inst.state === 'active' || inst.state === 'incident') && (
        <Btn variant="danger-subtle" icon={XCircle} onClick={() => { actions.cancelInstance(inst.id, 'Cancelled from work order page'); message.info('Work order cancelled'); }}>Cancel work order</Btn>
      )}>
      <div className="row wrap" style={{ gap: 6 }}>
        <Chip tone={STATE_TONE[inst.state] as Tone} solid>{STATE_LABEL[inst.state]}</Chip>
        <Chip tone="neutral">{RECORD_LABEL[inst.recordType]} · <Link className="ent-link" to={recordPath(inst.recordType, inst.recordId)} style={{ marginLeft: 4 }}><LinkIcon size={12} /> {inst.businessKey}</Link></Chip>
        {dc && <Chip tone="neutral">Site · {dc.code}</Chip>}
        <Chip tone="neutral">Started {fmtAgo(inst.startedAt)}</Chip>
        {inst.endedAt && <Chip tone="success">Cycle time {fmtHours(hoursBetween(inst.startedAt, inst.endedAt))}</Chip>}
        {!inst.endedAt && <Chip tone="info">Elapsed {fmtHours(hoursBetween(inst.startedAt))}</Chip>}
        <Chip tone={openTasks.some((t) => fmtDue(t.dueAt).overdue) ? 'warning' : 'neutral'}>Waiting on · {summary.waitingOn}</Chip>
      </div>

      <div className="grid g-2-1" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          {eincs.map((e) => (
            <Panel key={e.id} className="wf-incident" title={<>Engine incident on “{nodeName(e.elementId)}”</>} icon={TriangleAlert} sub={`Raised ${fmtAgo(e.createdAt)}`}
              actions={<Btn icon={RotateCw} onClick={async () => { await actions.retryIncident(e.id); message.success('Job retried — token moved on'); }}>Retry job</Btn>}>
              <span style={{ fontSize: 13.5 }}>{e.message}</span>
            </Panel>
          ))}
          <Panel title="Process" sub="Click a step to see its details" icon={GitBranch} actions={<DiagramLegend />}>
            <BpmnDiagram xml={xml.data} height={520} markers={markers} overlays={overlays} selectedId={selected} onSelect={setSelected} />
            {selected && selNode && (
              <div className="row wrap" style={{ gap: 6, marginTop: 12, fontSize: 13 }}>
                <b className="strong">{selNode.name}</b>
                <span className="muted">{selNode.type.replace('bpmn:', '')} · lane {selNode.lane ?? '—'}</span>
                {selNode.candidateGroups && <Chip tone="neutral">{selNode.candidateGroups}</Chip>}
                {selNode.formKey && <Chip tone="purple">form · {selNode.formKey}</Chip>}
                {selNode.taskType && <Chip tone="cyan">job · {selNode.taskType}</Chip>}
                {selNode.decisionId && <Chip tone="orange">DMN · {selNode.decisionId}</Chip>}
                {taskFor(selected) && <Btn variant="filled" onClick={() => setFormTask({ task: taskFor(selected)! })}>Complete this task</Btn>}
              </div>
            )}
          </Panel>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <Panel title="Open tasks" count={openTasks.length} icon={Inbox}>
            {openTasks.length === 0 && <span className="vw-label">{inst.state === 'completed' ? 'All tasks completed.' : inst.state === 'cancelled' ? 'Work order cancelled.' : 'Nobody is waiting — the engine is running automatic steps.'}</span>}
            <div className="col">
              {openTasks.map((t) => {
                const due = fmtDue(t.dueAt);
                const link = recordTaskLink(inst, t);
                return (
                  <div key={t.id} className={`chg-row${due.overdue ? ' is-hot' : ''}`} style={{ alignItems: 'flex-start' }}>
                    <div className="col grow" style={{ gap: 6 }}>
                      <div className="row between" style={{ alignItems: 'flex-start' }}>
                        <b className="strong">{t.name}</b>
                        <Chip tone={due.overdue ? 'error' : 'neutral'} size="xs">{due.text}</Chip>
                      </div>
                      <small style={{ marginTop: 0 }}>{t.assignee ? `Assigned to ${t.assignee}` : `Candidates: ${t.candidateRole}`} · {link ? `done on the ${link.recordLabel}` : `form ${t.formKey}`}</small>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <Btn variant="filled" onClick={() => setFormTask({ task: t })}>Complete</Btn>
                        {!t.assignee && <Btn onClick={() => actions.claimTask(t.id)}>Claim</Btn>}
                        {errorBoundariesFor(t.elementId).map((b) => <Btn key={b.id} variant="danger-subtle" onClick={() => setFormTask({ task: t, boundaryId: b.id })}>{b.name}</Btn>)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {doneTasks.length > 0 && (
            <Panel title="Completed tasks" count={doneTasks.length} icon={CheckCircle2}>
              <div className="col">
                {doneTasks.map((t) => (
                  <div key={t.id} className="chg-row" style={{ alignItems: 'flex-start' }}>
                    <div className="col grow" style={{ gap: 6 }}>
                      <div className="row between" style={{ alignItems: 'flex-start' }}>
                        <b className="strong">{t.name}</b>
                        <span className="vw-label num">{fmtDate(t.completedAt)}</span>
                      </div>
                      <small style={{ marginTop: 0 }}>Completed by {t.assignee ?? 'unknown'}</small>
                      <TaskDataView formKey={t.formKey} data={t.variables} empty={null} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Variables" icon={Braces} count={Object.keys(inst.variables).length}>
            <dl className="wf-kv">
              {Object.entries(inst.variables).map(([k, v]) => <VariableRow key={k} k={k} v={v} />)}
            </dl>
          </Panel>

          <Panel title="Timeline" icon={History} count={fnis.length}>
            <ul className="tl">
              {fnis.map((f) => {
                const st = FNI[f.state];
                return (
                  <li key={f.id}>
                    <span className={`tl-ico tone-${st.tone}`}><st.icon size={14} /></span>
                    <span className="tl-body">
                      <span className="row between"><b>{f.elementName}</b><small className="num">{fmtDate(f.startedAt)}</small></span>
                      <small>
                        {f.type}{f.assignee ? ` · ${f.assignee}` : ''}{f.endedAt ? ` · ${fmtHours(hoursBetween(f.startedAt, f.endedAt))}` : f.state === 'active' ? ` · waiting ${fmtHours(hoursBetween(f.startedAt))}` : ''}{f.state === 'incident' ? ' · incident' : f.state === 'terminated' ? ' · terminated' : ''}
                      </small>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <Drawer open={!!formTask} onClose={() => setFormTask(undefined)} width={520} destroyOnHidden
        title={formTask ? (formTask.boundaryId ? `${parsed.data?.nodes[formTask.boundaryId]?.name ?? 'Error'} — ${formTask.task.name}` : formTask.task.name) : ''}>
        {formTask && (
          <div className="vw-flex vw-flex-col vw-gap-md">
            {!formTask.boundaryId && formRecordLink ? <RecordTaskNotice link={formRecordLink} /> : (
              <>
                <div className="vw-card-description">
                  {formTask.boundaryId ? `Reports the error on “${formTask.task.name}”. The task is terminated and the token follows the error boundary.` : `Completing as ${actor}. Candidates: ${formTask.task.candidateRole}.`}
                </div>
                <TaskForm formInstanceKey={`${formTask.task.id}:${formTask.boundaryId ?? ''}`} schema={getFormSchema(formTask.task.formKey)} data={{ signedBy: actor, assignee: actor }} onSubmit={onSubmit}
                  submitLabel={formTask.boundaryId ? 'Report error & roll back' : 'Complete task'} />
              </>
            )}
          </div>
        )}
      </Drawer>
    </WorkOrdersPage>
  );
}

function VariableRow({ k, v }: { k: string; v: unknown }) {
  const text = v == null ? '—' : typeof v === 'object' ? describeValue(v) : String(v);
  return <><dt title={k}>{k}</dt><dd>{text}</dd></>;
}
