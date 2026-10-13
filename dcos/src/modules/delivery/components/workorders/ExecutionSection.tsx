/* Execution: start the work (only when the change is approved; a kit not at the site is a warning,
   never a block), tick the checklist (each tick is saved on the work order), then sign off (with an
   optional customer witness) or record a failure, which rolls the change back. The materials section
   sits under this on the same tab. */
import { useState } from 'react';
import { App, Checkbox, Input } from 'antd';
import { Activity, ListChecks, PenLine, Undo2, XOctagon } from 'lucide-react';
import { Btn, Panel } from '../../../../ops/ui/kit';
import { ToneChip } from '../project/kit';
import { Muted } from '../home/kit';
import { KvGrid, StartNotice } from './Sections';
import { fmtDateTime, fmtWindow, woStatusLabel, woStatusTone } from './model';
import { KitWarning } from './materials';
import { kitStartWarning } from './materialsView';
import { checklistFor, stepDone, type WorkOrderView } from './view';

export function ExecutionSection({ v }: { v: WorkOrderView }) {
  const { row, actions } = v; const wo = row.wo;
  const { message, modal } = App.useApp();
  const [notes, setNotes] = useState('');
  const [witness, setWitness] = useState('');
  const { steps, source } = checklistFor(v);
  const done = steps.map(s => stepDone(wo, s, v.returnsSent));
  const ticked = done.filter(x => x.done).length;
  const canStart = (wo.status === 'Ready' || wo.status === 'Assigned') && !row.startBlock;
  const running = wo.status === 'InProgress';
  const finished = ['Validated', 'Completed', 'Failed', 'Cancelled'].includes(wo.status);
  const backout = row.change?.backoutPlan ?? row.change?.rollbackPlan ?? v.template?.backout;

  const go = () => { const r = actions.startWork(wo.id); if (r.ok) message.success('Work started; the change is now in progress'); else message.error(r.reason ?? 'The work cannot start'); };
  const kitWarn = kitStartWarning(v.kit);
  const start = () => (kitWarn ? modal.confirm({ title: 'The kit is not all at the site', content: kitWarn, okText: 'Start work anyway', onOk: go }) : go());
  const complete = () => { actions.completeWorkOrder(wo.id, { notes: notes.trim(), customerWitness: witness.trim() || undefined }, 'Completed'); message.success('Work signed off; the change is implemented and waits for its review'); };
  const fail = () => modal.confirm({
    title: 'Record the work as failed?',
    content: `The work order becomes Failed and change ${row.change?.chgId ?? ''} is marked Rolled back. Follow the back-out plan before you leave site.${row.changeClass === 'Standard' ? ' A failed standard change suspends its template until it is reviewed.' : ''}`,
    okText: 'Record failure', okButtonProps: { danger: true },
    onOk: () => { actions.completeWorkOrder(wo.id, { notes: notes.trim() }, 'Failed'); message.warning('Failure recorded; the change is rolled back'); },
  });

  return (
    <div className="grid g-main-side" style={{ alignItems: 'start' }}>
      <div className="col" style={{ gap: 16 }}>
        <StartNotice v={v} />
        {!running && !finished && <KitWarning r={v.kit} who="start" />}
        <Panel title="Checklist" icon={ListChecks} count={`${ticked}/${steps.length}`} sub={`${ticked} of ${steps.length} done`}>
          <div className="col" style={{ gap: 8 }}>
            <Muted>Steps from {source}.{!running && !finished ? ' Tick them once the work has started.' : ''}</Muted>
            {steps.map((s, i) => (
              <Checkbox key={i} checked={done[i].done || wo.status === 'Completed' || wo.status === 'Validated'} disabled={!running} onChange={e => actions.setChecklistItem(wo.id, s, e.target.checked)}>
                <span style={{ color: 'var(--vw-color-slate-800)' }}>{i + 1}. {s}</span>
                {done[i].done && (done[i].by || done[i].at) && <Muted size="xs"> · {[done[i].by, done[i].at && fmtDateTime(done[i].at)].filter(Boolean).join(', ')}</Muted>}
              </Checkbox>
            ))}
            <Muted size="xs">Each tick is saved on the work order with who ticked it and when.{v.materialLines.length ? ' The material steps tick themselves when the materials are recorded and the returns are sent.' : ''}</Muted>
          </div>
        </Panel>
        {backout && (
          <Panel title="Back-out plan" icon={Undo2}>
            <div className="vw-card-description" style={{ whiteSpace: 'pre-line', color: 'var(--vw-color-slate-800)' }}>{backout}</div>
          </Panel>
        )}
      </div>

      <div className="col" style={{ gap: 16 }}>
        <Panel title="Progress" icon={Activity} actions={<ToneChip v={woStatusTone(wo.status)}>{woStatusLabel(wo.status)}</ToneChip>}>
          <div className="col" style={{ gap: 12 }}>
            <KvGrid items={[
              { label: 'Window', value: fmtWindow(row.start, row.end) },
              { label: 'Started', value: fmtDateTime(wo.actualStart) },
              { label: 'Finished', value: fmtDateTime(wo.actualEnd) },
            ]} />
            {(wo.status === 'Ready' || wo.status === 'Assigned' || wo.status === 'Awaiting change approval' || wo.status === 'Draft') && (
              <div className="col" style={{ gap: 4 }}>
                <div><Btn variant="filled" disabled={!canStart} onClick={start}>Start work</Btn></div>
                {!canStart && <Muted>{row.startBlock ?? 'The work can start once it is ready.'}</Muted>}
              </div>
            )}
          </div>
        </Panel>

        {running && (
          <Panel title="Finish the work" icon={PenLine}>
            <div className="col" style={{ gap: 8 }}>
              <label className="col" style={{ gap: 4 }}><Muted>Sign-off notes (what was done, readings, anything left open)</Muted>
                <Input.TextArea rows={4} value={notes} onChange={e => setNotes(e.target.value)} aria-label="Sign-off notes" />
              </label>
              <label className="col" style={{ gap: 4 }}><Muted>Customer witness (optional)</Muted>
                <Input value={witness} onChange={e => setWitness(e.target.value)} placeholder="Name of the customer's witness, if one attended" aria-label="Customer witness" />
              </label>
              <div className="row wrap" style={{ gap: 8 }}>
                <Btn variant="filled" disabled={notes.trim().length < 5 || ticked < steps.length} onClick={complete}>Sign off as complete</Btn>
                <Btn variant="danger-subtle" disabled={notes.trim().length < 5} onClick={fail}>Record failure</Btn>
              </div>
              <Muted>{ticked < steps.length ? `Tick all ${steps.length} steps to sign off. ` : ''}Notes need at least a few words. Signing off marks the change implemented; it closes after its review.</Muted>
            </div>
          </Panel>
        )}

        {wo.signOff && (
          <Panel title={wo.status === 'Failed' ? 'Failure record' : 'Sign-off'} icon={wo.status === 'Failed' ? XOctagon : PenLine} actions={wo.status === 'Failed' ? <ToneChip v="error">Failed</ToneChip> : undefined}>
            <KvGrid items={[
              { label: 'Work done by', value: wo.signOff.performedBy ?? wo.assigneeName ?? '—' }, { label: 'Confirmed by', value: wo.signOff.by }, { label: 'When', value: fmtDateTime(wo.signOff.at) },
              { label: 'Customer witness', value: wo.signOff.customerWitness || '—' }, { label: 'Notes', value: wo.signOff.notes || '—' },
            ]} />
          </Panel>
        )}
      </div>
    </div>
  );
}
