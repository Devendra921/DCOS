/**
 * Open tasks and task history for the processes behind one record (e.g. a work order's own P10,
 * its contractor site-access P12 and its change's P05). Open tasks are completed here with their
 * form, or — for record-backed steps — by the action on the record page; history shows who did
 * each step, when, how long it waited and what they recorded.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Drawer } from 'antd';
import type * as T from '../../../mock/data/types';
import { History, ListTodo } from 'lucide-react';
import { Btn, Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, Muted } from '../../delivery/components/home/kit';
import { fmtDateTime } from '../../delivery/components/workorders/model';
import { TaskForm } from './TaskForm';
import { TaskDataView } from './TaskDataView';
import { RecordTaskNotice } from './RecordTaskNotice';
import { getFormSchema } from '../lib/forms';
import { recordTaskLink, type RecordTaskLink } from '../lib/recordTasks';
import { fmtDue, fmtHours, hoursBetween, useActor, useEngineActions, useFlowNodeInstances, useUserTasks } from '../lib/useWorkflows';

export interface PanelProcess { inst: T.ProcessInstance; label: string }
interface Row { task: T.ProcessUserTask; proc: PanelProcess; link?: RecordTaskLink; tookH?: number }

/**
 * `onThisPage(link)` lets the host page handle a record-backed step that is done on the page itself
 * (e.g. switch to its Execution tab); return true when handled, otherwise the record is opened.
 */
export function ProcessTasksPanel({ processes, onThisPage }: { processes: PanelProcess[]; onThisPage?: (link: RecordTaskLink) => boolean }) {
  const allTasks = useUserTasks();
  const allFni = useFlowNodeInstances();
  const actions = useEngineActions();
  const { name: actor } = useActor();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [formRow, setFormRow] = useState<Row>();
  const [open, setOpen] = useState<Set<string>>(new Set());

  const { openRows, doneRows } = useMemo(() => {
    const byInst = new Map(processes.map(p => [p.inst.id, p]));
    // How long a step waited comes from the engine's step record (started → ended), the reliable clock for a task.
    const steps = allFni.filter(f => byInst.has(f.instanceId) && f.endedAt);
    const tookOf = (t: T.ProcessUserTask) => { const fs = steps.filter(f => f.instanceId === t.instanceId && f.elementId === t.elementId); const f = fs.find(x => x.endedAt === t.completedAt) ?? fs[fs.length - 1]; return f ? hoursBetween(f.startedAt, f.endedAt!) : undefined; };
    const rows: Row[] = allTasks.filter(t => byInst.has(t.instanceId)).map(t => { const proc = byInst.get(t.instanceId)!; return { task: t, proc, link: recordTaskLink(proc.inst, t), tookH: t.state === 'completed' ? tookOf(t) : undefined }; });
    return {
      openRows: rows.filter(r => r.task.state === 'created').sort((a, b) => (a.task.dueAt ?? '').localeCompare(b.task.dueAt ?? '')),
      doneRows: rows.filter(r => r.task.state === 'completed').sort((a, b) => (b.task.completedAt ?? '').localeCompare(a.task.completedAt ?? '')),
    };
  }, [allTasks, allFni, processes]);

  const goRecord = (link: RecordTaskLink) => { if (!onThisPage?.(link)) navigate(link.path); };
  const submit = async (data: Record<string, unknown>) => {
    if (!formRow) return;
    try {
      await actions.completeTask(formRow.task.id, data);
      message.success(`"${formRow.task.name}" completed`);
      setFormRow(undefined);
    } catch (e) { message.error((e as Error).message); }
  };
  const toggle = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="col" style={{ gap: 16 }}>
      <Panel title="Open tasks" icon={ListTodo} count={openRows.length} sub={processes.map(p => p.label).join(' · ')}>
        <DataTable<Row> rows={openRows} rowKey={r => r.task.id}
          empty={processes.some(p => p.inst.state === 'active') ? 'Nobody is waiting on a task: the process is running an automatic step or waiting for an event.' : 'No open tasks: the processes have finished.'}
          cols={[
            { key: 't', title: 'Task', wrap: true, minWidth: 180, render: r => <><div>{r.task.name}</div><Muted size="xs">{r.proc.label}</Muted></> },
            { key: 'w', title: 'Who', wrap: true, render: r => (r.task.assignee ? r.task.assignee : <Muted>{r.task.candidateRole} (unassigned)</Muted>) },
            { key: 'd', title: 'Due', render: r => { const d = fmtDue(r.task.dueAt); return <Chip tone={d.overdue ? 'error' : 'neutral'} dot={d.overdue}>{d.text}</Chip>; } },
            { key: 'h', title: 'How', wrap: true, minWidth: 200, render: r => (r.link ? <Muted>{r.link.how}</Muted> : <Muted>Complete with its form</Muted>) },
            {
              key: 'a', title: '', align: 'right', render: r => (
                <div className="vw-flex vw-gap-xs vw-justify-end" style={{ whiteSpace: 'nowrap' }}>
                  {r.link
                    ? <Btn size="xs" onClick={() => goRecord(r.link!)}>Go to the step</Btn>
                    : <Btn size="xs" variant="filled" onClick={() => setFormRow(r)}>Complete</Btn>}
                  {!r.task.assignee && <Btn size="xs" onClick={() => actions.claimTask(r.task.id)}>Claim</Btn>}
                </div>
              ),
            },
          ]} />
      </Panel>

      <Panel title="Task history" icon={History} count={doneRows.length}>
        <DataTable<Row> rows={doneRows} rowKey={r => r.task.id} limit={15}
          empty="No task has been completed yet."
          cols={[
            { key: 'at', title: 'Completed', render: r => (r.task.completedAt ? fmtDateTime(r.task.completedAt) : '—') },
            { key: 't', title: 'Task', wrap: true, minWidth: 180, render: r => <><div>{r.task.name}</div><Muted size="xs">{r.proc.label}</Muted></> },
            { key: 'b', title: 'By', render: r => r.task.assignee ?? '—' },
            { key: 'took', title: 'Waited', align: 'right', render: r => (r.tookH !== undefined ? fmtHours(r.tookH) : '—') },
            {
              key: 'v', title: 'Recorded', wrap: true, minWidth: 220, render: r => (
                r.task.variables && Object.keys(r.task.variables).length
                  ? open.has(r.task.id)
                    ? <div className="vw-flex vw-flex-col vw-gap-xs"><TaskDataView formKey={r.task.formKey} data={r.task.variables} empty={null} /><a onClick={() => toggle(r.task.id)}>Hide</a></div>
                    : <a onClick={() => toggle(r.task.id)}>Show what was recorded</a>
                  : <Muted>{r.link ? `Done on the ${r.link.recordLabel}` : 'Nothing recorded'}</Muted>
              ),
            },
          ]} />
      </Panel>

      <Drawer open={!!formRow} onClose={() => setFormRow(undefined)} width={520} destroyOnHidden title={formRow?.task.name}>
        {formRow && (formRow.link ? <RecordTaskNotice link={formRow.link} /> : (
          <div className="vw-flex vw-flex-col vw-gap-md">
            <div className="vw-card-description">{formRow.proc.label} · completing as {actor}. Candidates: {formRow.task.candidateRole}.</div>
            <TaskForm formInstanceKey={formRow.task.id} schema={getFormSchema(formRow.task.formKey)} data={{ signedBy: actor, assignee: actor }} onSubmit={submit} />
          </div>
        ))}
      </Drawer>
    </div>
  );
}
