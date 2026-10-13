/* Approval modal: decide each pending step of the approval path, with optional conditions. */
import { useState } from 'react';
import { Input, Modal } from 'antd';
import { VwChip, VwSegmented } from '../../../../shared/components/ux';
import type * as T from '../../../../mock/data/types';
import { Muted, type PlannerActions } from './shared';

type Decision = T.PlannerApproval['decision'];
const CHOICES: Decision[] = ['Approved', 'Approved with conditions', 'Rejected'];

export function ApprovalModal({ plan, actions, open, onClose }: { plan: T.PlannerPlan; actions: PlannerActions; open: boolean; onClose: (changed: boolean) => void }) {
  const [decisions, setDecisions] = useState<Record<string, { decision: Decision | 'Pending'; conditions: string }>>({});
  const pending = plan.approvals.filter(a => a.decision === 'Pending');
  const done = plan.approvals.filter(a => a.decision !== 'Pending');
  const get = (step: string) => decisions[step] ?? { decision: 'Pending' as const, conditions: '' };
  const decided = pending.filter(a => get(a.step).decision !== 'Pending');

  const apply = () => {
    // decide() reads plan.approvals, so thread the updated approvals through each call.
    let cur = plan;
    for (const a of decided) {
      const d = get(a.step);
      const decision = d.decision as Decision;
      const conditions = decision === 'Approved with conditions' || decision === 'Rejected' ? d.conditions || undefined : undefined;
      actions.decide(cur, a.step, decision, conditions);
      cur = { ...cur, approvals: cur.approvals.map(x => (x.step === a.step ? { ...x, decision, conditions, person: actions.actor, at: new Date().toISOString() } : x)) };
    }
    setDecisions({});
    onClose(decided.length > 0);
  };

  return (
    <Modal open={open} title={`Decide: ${plan.title}`} onCancel={() => { setDecisions({}); onClose(false); }} onOk={apply} okText={decided.length ? `Record ${decided.length} decision(s)` : 'Record'} okButtonProps={{ disabled: !decided.length }} width={560} destroyOnHidden>
      <div className="vw-flex vw-flex-col vw-gap-md">
        {done.length > 0 && <div><Muted>Already decided: {done.map(a => `${a.step} (${a.decision}${a.person ? `, ${a.person}` : ''})`).join('; ')}</Muted></div>}
        {pending.length === 0 && <div className="vw-card-description">Every step on the approval path has been decided.</div>}
        {pending.map(a => {
          const d = get(a.step);
          return (
            <div key={a.step} className="vw-card-child vw-flex vw-flex-col vw-gap-sm" style={{ padding: 12 }}>
              <div className="vw-flex vw-items-center vw-justify-between vw-gap-sm vw-wrap">
                <div><div style={{ fontWeight: 500 }}>{a.step}</div><Muted size="xs">{a.role} · deciding as {actions.actor}</Muted></div>
                <VwChip variant={d.decision === 'Pending' ? 'warning' : d.decision === 'Rejected' ? 'error' : 'success'}>{d.decision}</VwChip>
              </div>
              <VwSegmented<Decision | 'Pending'> size="small" value={d.decision} onChange={val => setDecisions(x => ({ ...x, [a.step]: { ...d, decision: val } }))} options={[{ label: 'Leave pending', value: 'Pending' }, ...CHOICES.map(c => ({ label: c, value: c }))]} />
              {(d.decision === 'Approved with conditions' || d.decision === 'Rejected') && (
                <Input.TextArea rows={2} value={d.conditions} onChange={e => setDecisions(x => ({ ...x, [a.step]: { ...d, conditions: e.target.value } }))} placeholder={d.decision === 'Rejected' ? 'Reason for rejecting' : 'Conditions attached to the approval'} />
              )}
            </div>
          );
        })}
        <Muted size="xs">The plan becomes Approved once every step is approved, and Rejected as soon as any step is rejected.</Muted>
      </div>
    </Modal>
  );
}
