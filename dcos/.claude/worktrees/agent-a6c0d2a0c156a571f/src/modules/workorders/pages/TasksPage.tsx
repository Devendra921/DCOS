/** My tasks — the user-task inbox with the Camunda form rendered inline next to the record context. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Select, Typography } from 'antd';
import { VwCard, VwChip, VwSegmented } from '../../../shared/components/ux';
import { VwButton } from '../../../shared/components/vw/VwButton';
import { KPICard } from '../../../shared/components/KPICard';
import { InboxOutlined, ClockCircleOutlined, UserOutlined, CheckCircleOutlined } from '../../../shared/icons';
import { WorkOrdersHeader } from '../components/WorkOrdersHeader';
import { BpmnDiagram } from '../components/BpmnDiagram';
import { TaskForm } from '../components/TaskForm';
import { getFormSchema } from '../lib/forms';
import { taskOverlays } from '../components/overlays';
import {
  RECORD_LABEL, STATE_LABEL, STATE_TONE, describeInstance, fmtAgo, fmtDate, fmtDue, instanceMarkers, processName, processPid, recordPath,
  useActor, useBpmnXml, useDataCenters, useEngineActions, useInstances, useParsedProcess, useUserTasks,
} from '../lib/useWorkflows';
const { Text } = Typography;

type View = 'open' | 'mine' | 'overdue' | 'done';

export default function TasksPage() {
  const { message } = App.useApp();
  const actor = useActor();
  const tasks = useUserTasks();
  const instances = useInstances();
  const dcs = useDataCenters();
  const actions = useEngineActions();
  const [role, setRole] = useState<string>(actor.role ?? 'all');
  const [view, setView] = useState<View>('open');
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const roles = useMemo(() => Array.from(new Set(tasks.map((t) => t.candidateRole))).sort(), [tasks]);
  const instById = useMemo(() => Object.fromEntries(instances.map((i) => [i.id, i])), [instances]);
  const [now] = useState(() => Date.now());

  const list = useMemo(() => tasks
    .filter((t) => role === 'all' || t.candidateRole === role || t.assignee === actor.name)
    .filter((t) => view === 'done' ? t.state === 'completed' : t.state === 'created' && (view === 'open' || (view === 'mine' ? t.assignee === actor.name : new Date(t.dueAt).getTime() < now)))
    .filter((t) => !!instById[t.instanceId])
    .sort((a, b) => (view === 'done' ? (b.completedAt ?? '').localeCompare(a.completedAt ?? '') : a.dueAt.localeCompare(b.dueAt))), [tasks, role, view, actor.name, now, instById]);

  const selected = list.find((t) => t.id === selectedId) ?? list[0];
  const inst = selected ? instById[selected.instanceId] : undefined;
  const xml = useBpmnXml(inst?.definitionKey);
  const parsed = useParsedProcess(inst?.definitionKey);
  const markers = useMemo(() => instanceMarkers(inst, parsed.data), [inst, parsed.data]);
  const overlays = useMemo(() => taskOverlays(tasks.filter((t) => t.instanceId === inst?.id)), [tasks, inst?.id]);
  const dc = dcs.find((d) => d.id === inst?.dataCenterId);
  const open = tasks.filter((t) => t.state === 'created');
  const errorBoundaries = selected ? Object.values(parsed.data?.nodes ?? {}).filter((n) => n.attachedTo === selected.elementId && n.boundaryKind === 'error' && n.interrupting) : [];
  const [boundarySel, setBoundarySel] = useState<{ taskId: string; boundaryId: string } | undefined>();
  const boundaryId = boundarySel && selected && boundarySel.taskId === selected.id ? boundarySel.boundaryId : undefined;
  const setBoundaryId = (id: string | undefined) => setBoundarySel(id && selected ? { taskId: selected.id, boundaryId: id } : undefined);

  const complete = async (data: Record<string, unknown>) => {
    if (!selected) return;
    try {
      const updated = await actions.completeTask(selected.id, data, { boundaryId });
      message.success(updated.state === 'completed' ? `${processName(updated.definitionKey)} ${updated.businessKey} completed` : `Done — ${updated.businessKey} moved to ${describeInstance(updated, tasks).step}`);
      setSelectedId(undefined);
    } catch (e) { message.error((e as Error).message); }
  };

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <WorkOrdersHeader title="My tasks" description={`Signed in as ${actor.name}${actor.role ? ` · ${actor.role}` : ''}. User tasks waiting on you or your role, due first.`} />
      <div className="vw-grid vw-grid-cols-4 vw-gap-md">
        <KPICard title="Open tasks" value={open.length} icon={<InboxOutlined />} iconTone="info" onClick={() => setView('open')} />
        <KPICard title="Assigned to me" value={open.filter((t) => t.assignee === actor.name).length} icon={<UserOutlined />} iconTone="cyan" onClick={() => setView('mine')} />
        <KPICard title="Overdue" value={open.filter((t) => new Date(t.dueAt).getTime() < now).length} color={open.some((t) => new Date(t.dueAt).getTime() < now) ? 'var(--vw-color-red-600)' : undefined} icon={<ClockCircleOutlined />} iconTone="error" onClick={() => setView('overdue')} />
        <KPICard title="Completed" value={tasks.filter((t) => t.state === 'completed').length} icon={<CheckCircleOutlined />} iconTone="success" onClick={() => setView('done')} />
      </div>

      <div className="vw-grid vw-gap-lg" style={{ gridTemplateColumns: 'minmax(300px, 400px) minmax(0, 1fr)' }}>
        <VwCard
          title={`Inbox · ${list.length}`}
          extra={<Select size="small" style={{ width: 170 }} value={role} onChange={setRole} options={[{ value: 'all', label: 'All roles' }, ...roles.map((r) => ({ value: r, label: r }))]} />}
        >
          <div className="vw-flex vw-flex-col vw-gap-sm">
            <VwSegmented size="small" value={view} onChange={setView} options={[{ value: 'open', label: 'Open' }, { value: 'mine', label: 'Mine' }, { value: 'overdue', label: 'Overdue' }, { value: 'done', label: 'Done' }]} />
            {list.length === 0 && <div className="vw-card-description">Nothing here — pick another role or view.</div>}
            <div className="vw-flex vw-flex-col vw-gap-xs" style={{ maxHeight: 720, overflowY: 'auto' }}>
              {list.slice(0, 200).map((t) => {
                const i = instById[t.instanceId];
                const due = fmtDue(t.dueAt);
                const isSel = t.id === selected?.id;
                return (
                  <VwCard key={t.id} variant="child" className={`wf-inbox-item${isSel ? ' is-selected' : ''}${due.overdue && t.state === 'created' ? ' is-overdue' : ''}`} tone={isSel ? 'info' : undefined} onClick={() => setSelectedId(t.id)}>
                    <div className="vw-flex vw-justify-between vw-gap-sm vw-items-center">
                      <div className="vw-card-title" style={{ minWidth: 0 }}>{t.name}</div>
                      {t.state === 'created' ? <VwChip variant={due.overdue ? 'error' : 'neutral'}>{due.text}</VwChip> : <VwChip variant="success">done {fmtAgo(t.completedAt ?? t.updatedAt)}</VwChip>}
                    </div>
                    <div className="vw-card-description" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {processPid(i.definitionKey)} {processName(i.definitionKey)} · {i.businessKey} · {String(i.variables.title ?? '')}
                    </div>
                    <div className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>{t.assignee ? `Assigned to ${t.assignee}` : `${t.candidateRole} · unassigned`}</div>
                  </VwCard>
                );
              })}
            </div>
          </div>
        </VwCard>

        {selected && inst ? (
          <div className="vw-flex vw-flex-col vw-gap-md">
            <VwCard
              title={selected.name}
              extra={<div className="vw-flex vw-gap-sm vw-items-center vw-wrap">
                <VwChip variant={STATE_TONE[inst.state]}>{STATE_LABEL[inst.state]}</VwChip>
                {!selected.assignee && selected.state === 'created' && <VwButton size="small" onClick={() => actions.claimTask(selected.id)}>Claim</VwButton>}
                <Link className="nst-btn nst-btn--sm" to={`/workorders/instances/${inst.id}`}>Open work order</Link>
              </div>}
            >
              <div className="vw-grid vw-gap-lg" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 300px)' }}>
                <div>
                  {selected.state === 'created' ? (
                    <TaskForm formInstanceKey={`${selected.id}:${boundaryId ?? ''}`} schema={getFormSchema(selected.formKey)} data={{ signedBy: actor.name, assignee: actor.name }} onSubmit={complete}
                      submitLabel={boundaryId ? 'Report error & follow boundary' : 'Complete task'}
                      extra={errorBoundaries.map((b) => (
                        <VwButton key={b.id} size="small" danger type={boundaryId === b.id ? 'primary' : undefined} onClick={() => setBoundaryId(boundaryId === b.id ? undefined : b.id)}>{boundaryId === b.id ? `Cancel: ${b.name}` : b.name}</VwButton>
                      ))} />
                  ) : (
                    <div className="vw-card-description">Completed {fmtDate(selected.completedAt)} by {selected.assignee ?? 'unknown'}.</div>
                  )}
                </div>
                <VwCard variant="child-shaded" title="Record context">
                  <dl className="wf-kv">
                    <dt>Record</dt><dd><Link to={recordPath(inst.recordType, inst.recordId)}>{inst.businessKey}</Link> <Text type="secondary">({RECORD_LABEL[inst.recordType]})</Text></dd>
                    <dt>Title</dt><dd>{String(inst.variables.title ?? '—')}</dd>
                    <dt>Process</dt><dd>{processPid(inst.definitionKey)} {processName(inst.definitionKey)}</dd>
                    <dt>Site</dt><dd>{dc ? `${dc.code} · ${dc.name}` : '—'}</dd>
                    <dt>Started</dt><dd>{fmtAgo(inst.startedAt)}</dd>
                    <dt>Candidates</dt><dd>{selected.candidateRole}</dd>
                    <dt>Due</dt><dd>{fmtDate(selected.dueAt)}</dd>
                    {Object.entries(inst.variables).filter(([k]) => !['title', 'businessKey'].includes(k) && typeof inst.variables[k] !== 'object').slice(0, 8).map(([k, v]) => <VariableRow key={k} k={k} v={v} />)}
                  </dl>
                </VwCard>
              </div>
            </VwCard>
            <VwCard title="Where this task sits in the process">
              <BpmnDiagram xml={xml.data} height={300} markers={markers} overlays={overlays} selectedId={selected.elementId} />
            </VwCard>
          </div>
        ) : (
          <VwCard><div className="vw-card-description">Select a task to see its form and record context.</div></VwCard>
        )}
      </div>
    </div>
  );
}

function VariableRow({ k, v }: { k: string; v: unknown }) {
  return <><dt title={k}>{k}</dt><dd>{v == null ? '—' : String(v)}</dd></>;
}
