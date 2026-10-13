/** One work order: diagram with the completed path and live token, open tasks (with forms), variables and timeline. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { App, Drawer, Timeline, Typography } from 'antd';
import type * as T from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { VwButton } from '../../../shared/components/vw/VwButton';
import { ArrowLeftOutlined, WarningOutlined, ReloadOutlined, LinkOutlined } from '../../../shared/icons';
import { WorkOrdersHeader } from '../components/WorkOrdersHeader';
import { BpmnDiagram, DiagramLegend } from '../components/BpmnDiagram';
import { TaskForm } from '../components/TaskForm';
import { getFormSchema } from '../lib/forms';
import { taskOverlays } from '../components/overlays';
import {
  RECORD_LABEL, STATE_LABEL, STATE_TONE, describeInstance, fmtAgo, fmtDate, fmtDue, fmtHours, hoursBetween, instanceMarkers, processName, processPid, recordPath,
  useActor, useBpmnXml, useDataCenters, useEngineActions, useEngineIncidents, useFlowNodeInstances, useInstance, useParsedProcess, useUserTasks,
} from '../lib/useWorkflows';
const { Text } = Typography;

const FNI_COLOR: Record<T.FlowNodeState, string> = { completed: 'var(--vw-color-green-600)', active: 'var(--vw-color-blue-600)', incident: 'var(--vw-color-red-600)', terminated: 'var(--vw-color-gray-400)' };

export default function InstancePage() {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const fnis = useMemo(() => allFni.filter((f) => f.instanceId === id).sort((a, b) => a.startedAt.localeCompare(b.startedAt)), [allFni, id]);
  const eincs = useMemo(() => allEinc.filter((e) => e.instanceId === id), [allEinc, id]);
  const markers = useMemo(() => instanceMarkers(inst, parsed.data), [inst, parsed.data]);
  const overlays = useMemo(() => taskOverlays(openTasks, eincs), [openTasks, eincs]);
  const dc = dcs.find((d) => d.id === inst?.dataCenterId);

  if (!inst) {
    return (
      <div className="vw-flex vw-flex-col vw-page-gap">
        <WorkOrdersHeader title="Work order" />
        <VwCard><div className="vw-card-description">Work order {id} was not found. <Link to="/workorders/instances">Back to the list</Link>.</div></VwCard>
      </div>
    );
  }

  const summary = describeInstance(inst, allTasks);
  const errorBoundariesFor = (elementId: string) => Object.values(parsed.data?.nodes ?? {}).filter((n) => n.attachedTo === elementId && n.boundaryKind === 'error' && n.interrupting);
  const taskFor = (elementId: string) => openTasks.find((t) => t.elementId === elementId);

  const onSubmit = async (data: Record<string, unknown>) => {
    if (!formTask) return;
    try {
      const updated = await actions.completeTask(formTask.task.id, data, { boundaryId: formTask.boundaryId });
      setFormTask(undefined);
      message.success(updated.state === 'completed' ? 'Work order completed' : `"${formTask.task.name}" completed — token moved to ${describeInstance(updated, allTasks).step}`);
    } catch (e) { message.error((e as Error).message); }
  };

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <WorkOrdersHeader
        title={`${processPid(inst.definitionKey)} ${processName(inst.definitionKey)} · ${inst.businessKey}`}
        description={<span>{String(inst.variables.title ?? '')}</span>}
        extra={<VwButton size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>Back</VwButton>}
      />
      <div className="vw-flex vw-gap-sm vw-items-center vw-wrap">
        <VwChip variant={STATE_TONE[inst.state]} solid>{STATE_LABEL[inst.state]}</VwChip>
        <VwChip variant="neutral">{RECORD_LABEL[inst.recordType]} · <Link to={recordPath(inst.recordType, inst.recordId)} style={{ marginLeft: 4 }}><LinkOutlined /> {inst.businessKey}</Link></VwChip>
        {dc && <VwChip variant="neutral">Site · {dc.code}</VwChip>}
        <VwChip variant="neutral">Started {fmtAgo(inst.startedAt)}</VwChip>
        {inst.endedAt && <VwChip variant="success">Cycle time {fmtHours(hoursBetween(inst.startedAt, inst.endedAt))}</VwChip>}
        {!inst.endedAt && <VwChip variant="info">Elapsed {fmtHours(hoursBetween(inst.startedAt))}</VwChip>}
        <VwChip variant={openTasks.some((t) => fmtDue(t.dueAt).overdue) ? 'warning' : 'neutral'}>Waiting on · {summary.waitingOn}</VwChip>
        <span style={{ flex: 1 }} />
        {(inst.state === 'active' || inst.state === 'incident') && (
          <VwButton size="small" danger onClick={() => { actions.cancelInstance(inst.id, 'Cancelled from work order page'); message.info('Work order cancelled'); }}>Cancel work order</VwButton>
        )}
      </div>

      <div className="vw-grid vw-gap-lg" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 400px)' }}>
        <div className="vw-flex vw-flex-col vw-gap-md">
          {eincs.map((e) => (
            <VwCard key={e.id} tone="error" title={<span><WarningOutlined /> Engine incident on “{e.elementId in (parsed.data?.nodes ?? {}) ? parsed.data!.nodes[e.elementId].name : e.elementId}”</span>}
              extra={<VwButton size="small" icon={<ReloadOutlined />} onClick={async () => { await actions.retryIncident(e.id); message.success('Job retried — token moved on'); }}>Retry job</VwButton>}>
              <div className="vw-card-description">{e.message}</div>
              <div className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)', marginTop: 4 }}>Raised {fmtAgo(e.createdAt)}</div>
            </VwCard>
          ))}
          <VwCard title="Process" extra={<DiagramLegend />}>
            <BpmnDiagram xml={xml.data} height={520} markers={markers} overlays={overlays} selectedId={selected} onSelect={setSelected} />
            {selected && parsed.data?.nodes[selected] && (
              <div className="vw-flex vw-gap-sm vw-items-center vw-wrap" style={{ marginTop: 'var(--vw-space-sm)', fontSize: 'var(--vw-font-label-sm)' }}>
                <Text strong>{parsed.data.nodes[selected].name}</Text>
                <Text type="secondary">{parsed.data.nodes[selected].type.replace('bpmn:', '')} · lane {parsed.data.nodes[selected].lane ?? '—'}</Text>
                {parsed.data.nodes[selected].candidateGroups && <VwChip variant="neutral">{parsed.data.nodes[selected].candidateGroups}</VwChip>}
                {parsed.data.nodes[selected].formKey && <VwChip variant="purple">form · {parsed.data.nodes[selected].formKey}</VwChip>}
                {parsed.data.nodes[selected].taskType && <VwChip variant="cyan">job · {parsed.data.nodes[selected].taskType}</VwChip>}
                {parsed.data.nodes[selected].decisionId && <VwChip variant="orange">DMN · {parsed.data.nodes[selected].decisionId}</VwChip>}
                {taskFor(selected) && <VwButton size="small" type="primary" onClick={() => setFormTask({ task: taskFor(selected)! })}>Complete this task</VwButton>}
              </div>
            )}
          </VwCard>
        </div>

        <div className="vw-flex vw-flex-col vw-gap-md">
          <VwCard title={`Open tasks (${openTasks.length})`}>
            {openTasks.length === 0 && <div className="vw-card-description">{inst.state === 'completed' ? 'All tasks completed.' : inst.state === 'cancelled' ? 'Work order cancelled.' : 'Nobody is waiting — the engine is running automatic steps.'}</div>}
            <div className="vw-flex vw-flex-col vw-gap-sm">
              {openTasks.map((t) => {
                const due = fmtDue(t.dueAt);
                return (
                  <VwCard key={t.id} variant="child-shaded">
                    <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
                      <div className="vw-card-title" style={{ minWidth: 0 }}>{t.name}</div>
                      <VwChip variant={due.overdue ? 'error' : 'neutral'}>{due.text}</VwChip>
                    </div>
                    <div className="vw-card-description">{t.assignee ? `Assigned to ${t.assignee}` : `Candidates: ${t.candidateRole}`} · form {t.formKey}</div>
                    <div className="vw-flex vw-gap-xs vw-wrap" style={{ marginTop: 'var(--vw-space-xs)' }}>
                      <VwButton size="small" type="primary" onClick={() => setFormTask({ task: t })}>Complete</VwButton>
                      {!t.assignee && <VwButton size="small" onClick={() => actions.claimTask(t.id)}>Claim</VwButton>}
                      {errorBoundariesFor(t.elementId).map((b) => <VwButton key={b.id} size="small" danger onClick={() => setFormTask({ task: t, boundaryId: b.id })}>{b.name}</VwButton>)}
                    </div>
                  </VwCard>
                );
              })}
            </div>
          </VwCard>

          <VwCard title="Variables">
            <dl className="wf-kv">
              {Object.entries(inst.variables).map(([k, v]) => <VariableRow key={k} k={k} v={v} />)}
            </dl>
          </VwCard>

          <VwCard title="Timeline">
            <Timeline
              items={fnis.map((f) => ({
                color: FNI_COLOR[f.state],
                children: (
                  <div style={{ fontSize: 'var(--vw-font-label-sm)' }}>
                    <div className="vw-flex vw-justify-between vw-gap-sm"><Text strong>{f.elementName}</Text><Text type="secondary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>{fmtDate(f.startedAt)}</Text></div>
                    <Text type="secondary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>
                      {f.type}{f.assignee ? ` · ${f.assignee}` : ''}{f.endedAt ? ` · ${fmtHours(hoursBetween(f.startedAt, f.endedAt))}` : f.state === 'active' ? ` · waiting ${fmtHours(hoursBetween(f.startedAt))}` : ''}{f.state === 'incident' ? ' · incident' : f.state === 'terminated' ? ' · terminated' : ''}
                    </Text>
                  </div>
                ),
              }))}
            />
          </VwCard>
        </div>
      </div>

      <Drawer open={!!formTask} onClose={() => setFormTask(undefined)} width={520} destroyOnHidden
        title={formTask ? (formTask.boundaryId ? `${parsed.data?.nodes[formTask.boundaryId]?.name ?? 'Error'} — ${formTask.task.name}` : formTask.task.name) : ''}>
        {formTask && (
          <div className="vw-flex vw-flex-col vw-gap-md">
            <div className="vw-card-description">
              {formTask.boundaryId ? `Reports the error on “${formTask.task.name}”. The task is terminated and the token follows the error boundary.` : `Completing as ${actor}. Candidates: ${formTask.task.candidateRole}.`}
            </div>
            <TaskForm formInstanceKey={`${formTask.task.id}:${formTask.boundaryId ?? ''}`} schema={getFormSchema(formTask.task.formKey)} data={{ signedBy: actor, assignee: actor }} onSubmit={onSubmit}
              submitLabel={formTask.boundaryId ? 'Report error & roll back' : 'Complete task'} />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function VariableRow({ k, v }: { k: string; v: unknown }) {
  const text = v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return <><dt title={k}>{k}</dt><dd>{text}</dd></>;
}
