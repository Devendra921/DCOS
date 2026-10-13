/* Review: the post-implementation review that closes the change. Mandatory for emergency and failed
   changes; a failed standard change suspends its template until the owner reviews it. */
import { useState } from 'react';
import { App, Input, Select } from 'antd';
import type * as T from '../../../../mock/data/types';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { useChainActions } from '../../../delivery/lib/workflowChain';
import { fmtWhen } from '../../lib/model';
import { KvList, Muted } from '../kit';
import type { ChangeView } from './shared';

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

  if (c.review) {
    return (
      <VwCard title="Post-implementation review" extra={<VwChip variant={TONE[c.review.outcome]}>{c.review.outcome}</VwChip>}>
        <KvList items={[
          { label: 'Reviewed by', value: c.review.by },
          { label: 'When', value: fmtWhen(c.review.at) },
          { label: 'What happened', value: c.review.notes },
          { label: 'Lessons', value: c.review.lessons || '—' },
          ...(ch.template && (c.review.outcome === 'Failed' || c.review.outcome === 'Rolled back') ? [{ label: 'Template', value: `"${ch.template.name}" is ${ch.template.status.toLowerCase()}` }] : []),
        ]} />
      </VwCard>
    );
  }
  if (c.status !== 'Implemented' && c.status !== 'RolledBack') {
    return (
      <VwCard title="Post-implementation review">
        <div className="vw-card-description">The review opens when the work is implemented or rolled back. {row.cls === 'Emergency' ? 'This is an emergency change, so a review will be mandatory.' : 'It is mandatory for emergency changes and for any change that fails.'}</div>
      </VwCard>
    );
  }
  const valid = notes.trim().length >= (mandatory ? 10 : 3);
  const submit = () => {
    if (!valid) return;
    actions.closeChange(c.id, { outcome, notes: notes.trim(), lessons: lessons.trim() || undefined, by: actions.actor, at: new Date().toISOString() });
    message.success(`${c.id} reviewed and closed${ch.template && (outcome === 'Failed' || outcome === 'Rolled back') ? `; template "${ch.template.name}" suspended` : ''}`);
  };
  return (
    <VwCard title="Record the review and close the change">
      <div className="vw-flex vw-flex-col vw-gap-sm" style={{ maxWidth: 720 }}>
        <div className="vw-card-description">{mandatory ? 'A review is mandatory for this change: say what happened and what is changed so it does not happen again.' : 'Confirm the outcome to close the change. A short note is enough when it went to plan.'}{ch.template ? ` A failed or rolled-back outcome suspends the standard template "${ch.template.name}" until its owner reviews it.` : ''}</div>
        <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Outcome</Muted><Select value={outcome} onChange={setOutcome} options={OUTCOMES.map(o => ({ value: o, label: o }))} style={{ maxWidth: 280 }} /></label>
        <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>What happened{mandatory ? ' (at least a sentence)' : ''}</Muted><Input.TextArea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Work done, tests passed, anything that did not go to plan" /></label>
        <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Lessons and follow-ups (optional)</Muted><Input.TextArea rows={2} value={lessons} onChange={e => setLessons(e.target.value)} /></label>
        <div><Button type="primary" disabled={!valid} onClick={submit}>Record review and close</Button></div>
      </div>
    </VwCard>
  );
}
