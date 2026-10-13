/* Review: the post-implementation review that closes the change. Mandatory for emergency and failed
   changes; a failed standard change suspends its template until the owner reviews it. Materials
   planned against used and the outcome of the retired equipment (disposition, sanitisation) sit under it,
   with a warning when nothing was recorded. */
import { useState } from 'react';
import { App, Input, Select } from 'antd';
import type * as T from '../../../../mock/data/types';
import { ClipboardCheck } from 'lucide-react';
import { Btn, Chip, Field, Panel } from '../../../../ops/ui/kit';
import { useChainActions } from '../../../delivery/lib/workflowChain';
import { fmtWhen } from '../../lib/model';
import { KvList, Muted } from '../kit';
import type { ChangeView } from './shared';
import { RetiredOutcomeCard, UsageCard } from '../ChangeMaterials';

type Outcome = NonNullable<T.ChangeRequest['review']>['outcome'];
const OUTCOMES: Outcome[] = ['Successful', 'Successful with issues', 'Failed', 'Rolled back'];
const TONE: Record<Outcome, 'success' | 'warning' | 'error'> = { Successful: 'success', 'Successful with issues': 'warning', Failed: 'error', 'Rolled back': 'error' };

export function ReviewTab({ v }: { v: ChangeView }) {
  const { c, row, ch } = v;
  const actions = useChainActions();
  const { message } = App.useApp();
  const [outcome, setOutcome] = useState<Outcome>(c.status === 'RolledBack' || ch.workOrder?.status === 'Failed' ? 'Rolled back' : 'Successful');
  const [notes, setNotes] = useState('');
  const [lessons, setLessons] = useState('');
  const mandatory = row.cls === 'Emergency' || row.failed || outcome === 'Failed' || outcome === 'Rolled back';

  const usage = <><UsageCard m={v.materials} workOrder={ch.workOrder} /><RetiredOutcomeCard m={v.materials} /></>;
  if (c.review) {
    return (
      <>
      <Panel title="Post-implementation review" icon={ClipboardCheck} actions={<Chip tone={TONE[c.review.outcome]} dot>{c.review.outcome}</Chip>}>
        <KvList columns={2} items={[
          { label: 'Reviewed by', value: c.review.by },
          { label: 'When', value: fmtWhen(c.review.at) },
          { label: 'What happened', value: c.review.notes },
          { label: 'Lessons', value: c.review.lessons || '—' },
          ...(ch.template && (c.review.outcome === 'Failed' || c.review.outcome === 'Rolled back') ? [{ label: 'Template', value: `"${ch.template.name}" is ${ch.template.status.toLowerCase()}` }] : []),
        ]} />
      </Panel>
      {usage}
      </>
    );
  }
  if (c.status !== 'Implemented' && c.status !== 'RolledBack') {
    return (
      <Panel title="Post-implementation review" icon={ClipboardCheck}>
        <p className="vw-label" style={{ margin: 0 }}>The review opens when the work is implemented or rolled back. {row.cls === 'Emergency' ? 'This is an emergency change, so a review will be mandatory.' : 'It is mandatory for emergency changes and for any change that fails.'}</p>
      </Panel>
    );
  }
  const valid = notes.trim().length >= (mandatory ? 10 : 3);
  const submit = () => {
    if (!valid) return;
    actions.closeChange(c.id, { outcome, notes: notes.trim(), lessons: lessons.trim() || undefined, by: actions.actor, at: new Date().toISOString() });
    message.success(`${c.id} reviewed and closed${ch.template && (outcome === 'Failed' || outcome === 'Rolled back') ? `; template "${ch.template.name}" suspended` : ''}`);
  };
  return (
    <>
    <Panel title="Record the review and close the change" icon={ClipboardCheck}>
      <div className="col" style={{ gap: 12, maxWidth: 720 }}>
        <p style={{ margin: 0 }}>{mandatory ? 'A review is mandatory for this change: say what happened and what is changed so it does not happen again.' : 'Confirm the outcome to close the change. A short note is enough when it went to plan.'}{ch.template ? ` A failed or rolled-back outcome suspends the standard template "${ch.template.name}" until its owner reviews it.` : ''}</p>
        <Field label="Outcome"><Select value={outcome} onChange={setOutcome} options={OUTCOMES.map(o => ({ value: o, label: o }))} style={{ maxWidth: 280 }} /></Field>
        <Field label={`What happened${mandatory ? ' (at least a sentence)' : ''}`}><Input.TextArea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Work done, tests passed, anything that did not go to plan" /></Field>
        <Field label="Lessons and follow-ups (optional)"><Input.TextArea rows={2} value={lessons} onChange={e => setLessons(e.target.value)} /></Field>
        {v.materials.usage.notRecorded && <Muted>The materials were not recorded on the work order (see below). You can still close the change; say so in the review.</Muted>}
        {v.materials.retired.awaitingSanitisation.length > 0 && <Muted>{v.materials.retired.awaitingSanitisation.length} data-bearing item{v.materials.retired.awaitingSanitisation.length === 1 ? ' has' : 's have'} no sanitisation certificate (see below). You can still close the change; say why in the review.</Muted>}
        <div><Btn variant="filled" disabled={!valid} onClick={submit}>Record review and close</Btn></div>
      </div>
    </Panel>
    {usage}
    </>
  );
}
