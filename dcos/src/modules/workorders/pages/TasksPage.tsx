/** My tasks — the user-task inbox with the Camunda form rendered inline next to the record context. */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App, Select } from 'antd';
import { ArrowRight, ClipboardCheck, GitBranch, Inbox } from 'lucide-react';
import { Btn, Chip, Empty, Panel, Seg } from '../../../ops/ui/kit';
import { StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { WorkOrdersPage } from '../components/WorkOrdersHeader';
import { BpmnDiagram } from '../components/BpmnDiagram';
import { TaskForm } from '../components/TaskForm';
import { TaskDataView } from '../components/TaskDataView';
import { RecordTaskNotice } from '../components/RecordTaskNotice';
import { recordTaskLink } from '../lib/recordTasks';
import { getFormSchema } from '../lib/forms';
import { taskOverlays } from '../components/overlays';
import {
  RECORD_LABEL, STATE_LABEL, STATE_TONE, describeInstance, fmtAgo, fmtDate, fmtDue, instanceMarkers, processName, processPid, recordPath,
  useActor, useBpmnXml, useDataCenters, useEngineActions, useInstances, useParsedProcess, useUserTasks,
} from '../lib/useWorkflows';

type View = 'open' | 'mine' | 'overdue' | 'done';

export default function TasksPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
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
  // Steps done on their record (work order, change) link there instead of showing a form.
  const recordLink = selected?.state === 'created' ? recordTaskLink(inst, selected) : undefined;
  const errorBoundaries = selected && !recordLink ? Object.values(parsed.data?.nodes ?? {}).filter((n) => n.attachedTo === selected.elementId && n.boundaryKind === 'error' && n.interrupting) : [];
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

  const overdueOpen = open.filter((t) => new Date(t.dueAt).getTime() < now).length;

  return (
    <WorkOrdersPage title="My tasks" description={`Signed in as ${actor.name}${actor.role ? ` · ${actor.role}` : ''}. User tasks waiting on you or your role, due first.`}>
      <StatGrid cols={4}>
        <StatTile label="Open tasks" value={open.length} sub="waiting on someone" onClick={() => setView('open')} active={view === 'open'} />
        <StatTile label="Assigned to me" value={open.filter((t) => t.assignee === actor.name).length} sub={actor.name} onClick={() => setView('mine')} active={view === 'mine'} />
        <StatTile label="Overdue" value={overdueOpen} sub={overdueOpen ? 'past their due date' : 'none overdue'} subTone={overdueOpen ? 'bad' : undefined} onClick={() => setView('overdue')} active={view === 'overdue'} />
        <StatTile label="Completed" value={tasks.filter((t) => t.state === 'completed').length} sub="all time" onClick={() => setView('done')} active={view === 'done'} />
      </StatGrid>

      <div className="grid g-1-2">
        <Panel className="is-master" title="Inbox" count={list.length} icon={Inbox}
          actions={<Select size="small" style={{ width: 170 }} value={role} onChange={setRole} options={[{ value: 'all', label: 'All roles' }, ...roles.map((r) => ({ value: r, label: r }))]} />}>
          <div className="col" style={{ gap: 10 }}>
            <Seg size="sm" value={view} onChange={setView} options={[{ id: 'open', label: 'Open' }, { id: 'mine', label: 'Mine' }, { id: 'overdue', label: 'Overdue' }, { id: 'done', label: 'Done' }]} />
            {list.length === 0 && <Empty icon={Inbox} title="Nothing here">Pick another role or view.</Empty>}
            <div className="col wf-scroll" style={{ gap: 6 }}>
              {list.slice(0, 200).map((t) => {
                const i = instById[t.instanceId];
                const due = fmtDue(t.dueAt);
                const isSel = t.id === selected?.id;
                const rec = t.state === 'created' ? recordTaskLink(i, t) : undefined;
                return (
                  <button key={t.id} type="button" aria-pressed={isSel} onClick={() => setSelectedId(t.id)}
                    className={`chg-row wf-pick${isSel ? ' is-selected' : ''}${due.overdue && t.state === 'created' ? ' is-overdue' : ''}`}>
                    <span className="wf-pick-body">
                      <span className="row between" style={{ alignItems: 'flex-start' }}>
                        <b>{t.name}</b>
                        {t.state === 'created' ? <Chip tone={due.overdue ? 'error' : 'neutral'} size="xs">{due.text}</Chip> : <Chip tone="success" size="xs">done {fmtAgo(t.completedAt ?? t.updatedAt)}</Chip>}
                      </span>
                      <small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{processPid(i.definitionKey)} {processName(i.definitionKey)} · {i.businessKey} · {String(i.variables.title ?? '')}</small>
                      <small>{t.assignee ? `Assigned to ${t.assignee}` : `${t.candidateRole} · unassigned`}{rec ? ` · done on the ${rec.recordLabel}` : ''}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>

        {selected && inst ? (
          <div className="col" style={{ gap: 16 }}>
            <Panel title={selected.name} sub={`${processPid(inst.definitionKey)} ${processName(inst.definitionKey)} · ${inst.businessKey}`} icon={ClipboardCheck}
              actions={<>
                <Chip tone={STATE_TONE[inst.state] as Tone} dot>{STATE_LABEL[inst.state]}</Chip>
                {!selected.assignee && selected.state === 'created' && <Btn onClick={() => actions.claimTask(selected.id)}>Claim</Btn>}
                <Btn iconRight={ArrowRight} onClick={() => navigate(`/workorders/instances/${inst.id}`)}>Open work order</Btn>
              </>}>
              {/* Form and record context side by side only when both get a usable width; otherwise the context drops below. */}
              <div className="vw-grid vw-gap-lg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'start' }}>
                <div>
                  {selected.state === 'created' && recordLink ? (
                    <RecordTaskNotice link={recordLink} />
                  ) : selected.state === 'created' ? (
                    <TaskForm formInstanceKey={`${selected.id}:${boundaryId ?? ''}`} schema={getFormSchema(selected.formKey)} data={{ signedBy: actor.name, assignee: actor.name }} onSubmit={complete}
                      submitLabel={boundaryId ? 'Report error & follow boundary' : 'Complete task'}
                      extra={errorBoundaries.map((b) => (
                        <Btn key={b.id} variant={boundaryId === b.id ? 'danger' : 'danger-subtle'} onClick={() => setBoundaryId(boundaryId === b.id ? undefined : b.id)}>{boundaryId === b.id ? `Cancel: ${b.name}` : b.name}</Btn>
                      ))} />
                  ) : (
                    <div className="col">
                      <span className="vw-label">Completed {fmtDate(selected.completedAt)} by {selected.assignee ?? 'unknown'}.</span>
                      <TaskDataView formKey={selected.formKey} data={selected.variables} empty={null} />
                    </div>
                  )}
                </div>
                <div className="col wf-context">
                  <span className="ops-label" style={{ margin: 0 }}>Record context</span>
                  <dl className="wf-kv">
                    <dt>Record</dt><dd><Link className="ent-link" to={recordPath(inst.recordType, inst.recordId)}>{inst.businessKey}</Link> <span className="vw-label">({RECORD_LABEL[inst.recordType]})</span></dd>
                    <dt>Title</dt><dd>{String(inst.variables.title ?? '—')}</dd>
                    <dt>Process</dt><dd>{processPid(inst.definitionKey)} {processName(inst.definitionKey)}</dd>
                    <dt>Site</dt><dd>{dc ? `${dc.code} · ${dc.name}` : '—'}</dd>
                    <dt>Started</dt><dd>{fmtAgo(inst.startedAt)}</dd>
                    <dt>Candidates</dt><dd>{selected.candidateRole}</dd>
                    <dt>Due</dt><dd>{fmtDate(selected.dueAt)}</dd>
                    {Object.entries(inst.variables).filter(([k]) => !['title', 'businessKey'].includes(k) && typeof inst.variables[k] !== 'object').slice(0, 8).map(([k, v]) => <VariableRow key={k} k={k} v={v} />)}
                  </dl>
                </div>
              </div>
            </Panel>
            <Panel title="Where this task sits in the process" icon={GitBranch}>
              <BpmnDiagram xml={xml.data} height={300} markers={markers} overlays={overlays} selectedId={selected.elementId} />
            </Panel>
          </div>
        ) : (
          <Panel><Empty icon={ClipboardCheck} title="No task selected">Select a task to see its form and record context.</Empty></Panel>
        )}
      </div>
    </WorkOrdersPage>
  );
}

function VariableRow({ k, v }: { k: string; v: unknown }) {
  return <><dt title={k}>{k}</dt><dd>{v == null ? '—' : String(v)}</dd></>;
}
