/* Execution: start the work (only when the change is approved), tick the checklist, then sign
   off (with an optional customer witness) or record a failure, which rolls the change back. */
import { useState } from 'react';
import { App, Checkbox, Input } from 'antd';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { KvList, Muted } from '../home/kit';
import { StartNotice } from './Sections';
import { fmtDateTime, fmtWindow, woStatusLabel, woStatusTone } from './model';
import { checklistFor, type WorkOrderView } from './view';

export function ExecutionSection({ v, done, setDone }: { v: WorkOrderView; done: boolean[]; setDone: (d: boolean[]) => void }) {
  const { row, actions } = v; const wo = row.wo;
  const { message, modal } = App.useApp();
  const [notes, setNotes] = useState('');
  const [witness, setWitness] = useState('');
  const { steps, source } = checklistFor(v);
  const ticked = steps.filter((_, i) => done[i]).length;
  const canStart = (wo.status === 'Ready' || wo.status === 'Assigned') && !row.startBlock;
  const running = wo.status === 'InProgress';
  const finished = ['Validated', 'Completed', 'Failed', 'Cancelled'].includes(wo.status);
  const backout = row.change?.backoutPlan ?? row.change?.rollbackPlan ?? v.template?.backout;

  const start = () => { const r = actions.startWork(wo.id); if (r.ok) message.success('Work started; the change is now in progress'); else message.error(r.reason ?? 'The work cannot start'); };
  const complete = () => { actions.completeWorkOrder(wo.id, { notes: notes.trim(), customerWitness: witness.trim() || undefined }, 'Completed'); message.success('Work signed off; the change is implemented and waits for its review'); };
  const fail = () => modal.confirm({
    title: 'Record the work as failed?',
    content: `The work order becomes Failed and change ${row.change?.chgId ?? ''} is marked Rolled back. Follow the back-out plan before you leave site.${row.changeClass === 'Standard' ? ' A failed standard change suspends its template until it is reviewed.' : ''}`,
    okText: 'Record failure', okButtonProps: { danger: true },
    onOk: () => { actions.completeWorkOrder(wo.id, { notes: notes.trim() }, 'Failed'); message.warning('Failure recorded; the change is rolled back'); },
  });

  return (
    <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 400px)', alignItems: 'start' }}>
      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <StartNotice v={v} />
        <VwCard title="Checklist" extra={<Muted>{ticked} of {steps.length} done</Muted>}>
          <div className="vw-flex vw-flex-col vw-gap-sm">
            <Muted>Steps from {source}.{!running && !finished ? ' Tick them once the work has started.' : ''}</Muted>
            {steps.map((s, i) => (
              <Checkbox key={i} checked={!!done[i] || wo.status === 'Completed' || wo.status === 'Validated'} disabled={!running} onChange={e => { const n = [...done]; n[i] = e.target.checked; setDone(n); }}>
                <span style={{ color: 'var(--vw-color-slate-800)' }}>{i + 1}. {s}</span>
              </Checkbox>
            ))}
            <Muted size="xs">Ticks are kept while this page is open; the sign-off notes are the record.</Muted>
          </div>
        </VwCard>
        {backout && (
          <VwCard title="Back-out plan">
            <div className="vw-card-description" style={{ whiteSpace: 'pre-line', color: 'var(--vw-color-slate-800)' }}>{backout}</div>
          </VwCard>
        )}
      </div>

      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <VwCard title="Progress" extra={<VwChip variant={woStatusTone(wo.status)}>{woStatusLabel(wo.status)}</VwChip>}>
          <div className="vw-flex vw-flex-col vw-gap-sm">
            <KvList items={[
              { label: 'Window', value: fmtWindow(row.start, row.end) },
              { label: 'Started', value: fmtDateTime(wo.actualStart) },
              { label: 'Finished', value: fmtDateTime(wo.actualEnd) },
            ]} />
            {(wo.status === 'Ready' || wo.status === 'Assigned' || wo.status === 'Awaiting change approval' || wo.status === 'Draft') && (
              <div className="vw-flex vw-flex-col vw-gap-xs">
                <div><Button type="primary" disabled={!canStart} onClick={start}>Start work</Button></div>
                {!canStart && <Muted>{row.startBlock ?? 'The work can start once it is ready.'}</Muted>}
              </div>
            )}
          </div>
        </VwCard>

        {running && (
          <VwCard title="Finish the work">
            <div className="vw-flex vw-flex-col vw-gap-sm">
              <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Sign-off notes (what was done, readings, anything left open)</Muted>
                <Input.TextArea rows={4} value={notes} onChange={e => setNotes(e.target.value)} aria-label="Sign-off notes" />
              </label>
              <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Customer witness (optional)</Muted>
                <Input value={witness} onChange={e => setWitness(e.target.value)} placeholder="Name of the customer's witness, if one attended" aria-label="Customer witness" />
              </label>
              <div className="vw-flex vw-gap-sm vw-wrap">
                <Button type="primary" disabled={notes.trim().length < 5 || ticked < steps.length} onClick={complete}>Sign off as complete</Button>
                <Button danger disabled={notes.trim().length < 5} onClick={fail}>Record failure</Button>
              </div>
              <Muted>{ticked < steps.length ? `Tick all ${steps.length} steps to sign off. ` : ''}Notes need at least a few words. Signing off marks the change implemented; it closes after its review.</Muted>
            </div>
          </VwCard>
        )}

        {wo.signOff && (
          <VwCard title={wo.status === 'Failed' ? 'Failure record' : 'Sign-off'} tone={wo.status === 'Failed' ? 'error' : undefined}>
            <KvList items={[
              { label: 'By', value: wo.signOff.by }, { label: 'When', value: fmtDateTime(wo.signOff.at) },
              { label: 'Customer witness', value: wo.signOff.customerWitness || '—' }, { label: 'Notes', value: wo.signOff.notes || '—' },
            ]} />
          </VwCard>
        )}
      </div>
    </div>
  );
}
