/* Approval modal: the scenario under review, the approval path in order with the reason each step
   is there, and the decision on the next step by the signed-in person (as themselves or as a
   recorded delegate). Rejecting and approving with conditions need a reason; conditions get an
   owner and a due date. Delegations are recorded here too. */
import { useMemo, useState } from 'react';
import { Checkbox, Input, Modal, Select } from 'antd';
import { VwCard, VwChip, VwSegmented, fmtDate } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { DeleteOutlined, PlusOutlined } from '../../../../shared/icons';
import { fmtUsd } from '../../lib/engine';
import * as G from '../../lib/governance';
import { useDelegations, usePlannerActions } from '../../lib/usePlanner';
import type { PlannerData } from '../../lib/plannerData';
import type { SourcingContext } from '../../lib/sourcing';
import { DECISION_TONE, Eyebrow, Muted, type PlanView } from './shared';

type Decision = G.DecisionInput['decision'];
const CHOICES: { label: string; value: Decision }[] = [{ label: 'Approve', value: 'Approved' }, { label: 'Approve with conditions', value: 'Approved with conditions' }, { label: 'Reject', value: 'Rejected' }];

const todayIso = () => new Date().toISOString().slice(0, 10);

export function ApprovalModal({ v, data, sourcing, open, onClose }: { v: PlanView; data: PlannerData; sourcing?: SourcingContext; open: boolean; onClose: (changed: boolean) => void }) {
  const { plan, actions } = v;
  const delegations = useDelegations();
  const [decision, setDecision] = useState<Decision>('Approved');
  const [reason, setReason] = useState('');
  const [conds, setConds] = useState<G.ConditionInput[]>([]);
  const [error, setError] = useState<string>();
  const [at] = useState(() => new Date().toISOString());
  const steps = G.orderedSteps(plan.approvals);
  const next = G.nextPendingStep(plan);
  const me = G.personOf({ id: actions.actorId, name: actions.actor });
  const auth = next ? G.canDecide(plan, next.step, { id: actions.actorId, name: actions.actor }, delegations, at) : undefined;
  const review = v.review;
  const reset = () => { setDecision('Approved'); setReason(''); setConds([]); setError(undefined); };

  const record = () => {
    if (!next || !review) return;
    const res = actions.decide(plan, next.step, { decision, reason, conditions: decision === 'Approved with conditions' ? conds : undefined }, { ev: review.ev, scenario: review.scenario, data, sourcing }, delegations);
    if (!res.ok) { setError(res.reason); return; }
    reset(); onClose(true);
  };

  return (
    <Modal open={open} title={`Approval · ${plan.plnId} ${plan.title}`} onCancel={() => { reset(); onClose(false); }} width={760} destroyOnHidden
      footer={<div className="vw-flex vw-justify-between vw-items-center vw-gap-sm"><Muted size="xs">Round {G.currentRound(plan)} · signed in as {actions.actor}{me ? ` (${me.role})` : ''}</Muted><span className="vw-inline-flex vw-gap-sm"><Button onClick={() => { reset(); onClose(false); }}>Close</Button>{next && auth?.ok && <Button type="primary" onClick={record}>Record decision</Button>}</span></div>}>
      <div className="vw-flex vw-flex-col vw-gap-md">
        <VwCard variant="child-shaded">
          <Eyebrow>What is being approved</Eyebrow>
          <div className="vw-flex vw-wrap vw-gap-sm vw-items-center">
            <VwChip variant="info">{review?.scenario ? `Scenario ${review.scenario.name}` : 'Base case'}</VwChip>
            <span style={{ fontWeight: 600 }}>{review ? fmtUsd(review.ev.estimate.capexTotal) : '—'} CapEx</span>
            <Muted>· {review ? fmtUsd(review.ev.estimate.opexMonthly) : '—'} OpEx a month · {review?.ev.hardFails ?? 0} hard fail(s)</Muted>
          </div>
          <div style={{ marginTop: 4 }}><Muted size="xs">Routed on {fmtUsd(plan.approvalAmountUsd ?? review?.ev.estimate.capexTotal ?? 0)} ({plan.approvalBand ?? G.bandLabel(G.bandFor(review?.ev.estimate.capexTotal ?? 0))}). On final approval these figures are frozen as the baseline and execution runs from them.</Muted></div>
        </VwCard>

        <div className="vw-flex vw-flex-col vw-gap-xs">
          {steps.map((a, i) => (
            <div key={a.step} className="vw-card-child" style={{ padding: '8px 12px', outline: a === next ? '1px solid var(--vw-color-amber-500)' : undefined }}>
              <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
                <span style={{ fontWeight: 500 }}>{a.order ?? i + 1}. {a.step} <Muted size="xs">· {G.roleOf(a.role)}</Muted></span>
                <VwChip variant={DECISION_TONE[a.decision]}>{a.decision}</VwChip>
              </div>
              {a.person && <Muted size="xs">{a.person}{a.onBehalfOf ? ` for ${a.onBehalfOf} (delegate)` : ''}{a.at ? ` · ${fmtDate(a.at)}` : ''}</Muted>}
              {a.reason && <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-700)' }}>Reason: {a.reason}</div>}
              {a.basis && <div><Muted size="xs">Why this step: {a.basis}</Muted></div>}
              {a.decision === 'Pending' && <div><Muted size="xs">Can decide: {G.peopleWithRole(a.role).map(p => p.name).join(', ') || 'nobody holds this role'}{delegations.filter(d => G.roleOf(d.role) === G.roleOf(a.role) && G.delegationActive(d, at)).map(d => `, ${d.toName} (delegate of ${d.fromName} to ${d.endDate.slice(0, 10)})`).join('')}</Muted></div>}
            </div>
          ))}
          {!steps.length && <div className="vw-card-description">This round has no steps.</div>}
        </div>

        {next && auth && !auth.ok && <VwCard tone="warning" variant="child"><div className="vw-card-description">{auth.reason}</div></VwCard>}
        {next && auth?.ok && (
          <VwCard variant="child" title={`Decide: ${next.step}`} extra={auth.onBehalfOf ? <VwChip variant="purple">Deciding for {auth.onBehalfOf}</VwChip> : undefined}>
            <div className="vw-flex vw-flex-col vw-gap-sm">
              <VwSegmented<Decision> value={decision} onChange={setDecision} options={CHOICES} />
              {decision !== 'Approved' && <Input.TextArea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={decision === 'Rejected' ? 'Why the plan is rejected (required)' : 'Why conditions are needed (required)'} aria-label="Reason" />}
              {decision === 'Approved' && <Input.TextArea rows={1} value={reason} onChange={e => setReason(e.target.value)} placeholder="Comment (optional)" aria-label="Comment" />}
              {decision === 'Approved with conditions' && (
                <div className="vw-flex vw-flex-col vw-gap-xs">
                  <Eyebrow>Conditions (owner and due date required)</Eyebrow>
                  {conds.map((c, i) => (
                    <div key={i} className="vw-grid vw-gap-xs vw-items-center" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) 140px auto auto' }}>
                      <Input value={c.text} placeholder="Condition" onChange={e => setConds(cs => cs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} aria-label="Condition" />
                      <Select value={c.owner || undefined} placeholder="Owner" showSearch onChange={o => setConds(cs => cs.map((x, j) => (j === i ? { ...x, owner: o } : x)))} options={G.ALL_PEOPLE.map(p => ({ value: p.name, label: `${p.name} · ${p.role}` }))} aria-label="Owner" />
                      <Input type="date" min={todayIso()} value={c.dueDate?.slice(0, 10) ?? ''} onChange={e => setConds(cs => cs.map((x, j) => (j === i ? { ...x, dueDate: e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : undefined } : x)))} aria-label="Due date" />
                      <Checkbox checked={c.blocksExecution} onChange={e => setConds(cs => cs.map((x, j) => (j === i ? { ...x, blocksExecution: e.target.checked } : x)))}>Blocks build</Checkbox>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove condition" onClick={() => setConds(cs => cs.filter((_, j) => j !== i))} />
                    </div>
                  ))}
                  <div><Button size="small" icon={<PlusOutlined />} onClick={() => setConds(cs => [...cs, { text: '', owner: v.plan.ownerName, dueDate: undefined, blocksExecution: true }])}>Add condition</Button></div>
                </div>
              )}
              {error && <VwCard tone="error" variant="child"><div className="vw-card-description">{error}</div></VwCard>}
            </div>
          </VwCard>
        )}
        {!next && <div className="vw-card-description">Every step of this round has been decided.</div>}
        <DelegationPanel at={at} me={me} />
      </div>
    </Modal>
  );
}

/** The signed-in approver delegates their role for a date range; active delegations are listed. */
function DelegationPanel({ at, me }: { at: string; me?: { name: string; role: string } }) {
  const delegations = useDelegations();
  const actions = usePlannerActions();
  const [to, setTo] = useState<string>();
  const [from, setFrom] = useState(todayIso());
  const [until, setUntil] = useState(todayIso());
  const [why, setWhy] = useState('');
  const active = useMemo(() => delegations.filter(d => d.status === 'Active' && new Date(d.endDate).getTime() >= new Date(at).getTime() - 864e5), [delegations, at]);
  const holdsApproverRole = !!me && Object.values(G.STEP_ROLE).includes(me.role);
  return (
    <VwCard variant="child" title="Delegations" extra={<Muted size="xs">{active.length} active or upcoming</Muted>}>
      <div className="vw-flex vw-flex-col vw-gap-xs">
        {active.map(d => (
          <div key={d.id} className="vw-flex vw-justify-between vw-items-center vw-gap-sm" style={{ fontSize: 'var(--vw-font-label-sm)' }}>
            <span>{d.fromName} → <strong>{d.toName}</strong> · {G.roleOf(d.role)} · {d.startDate.slice(0, 10)} to {d.endDate.slice(0, 10)}{d.reason ? ` · ${d.reason}` : ''}</span>
            {d.fromName === me?.name && <Button size="small" type="text" onClick={() => actions.revokeDelegation(d.id)}>Revoke</Button>}
          </div>
        ))}
        {!active.length && <Muted size="xs">No delegation is in force.</Muted>}
        {holdsApproverRole ? (
          <div className="vw-grid vw-gap-xs vw-items-center" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) 130px 130px minmax(0, 1fr) auto', marginTop: 6 }}>
            <Select value={to} placeholder={`Delegate my ${me!.role} approvals to…`} showSearch onChange={setTo} options={G.ALL_PEOPLE.filter(p => p.name !== me!.name).map(p => ({ value: p.name, label: `${p.name} · ${p.role}` }))} aria-label="Delegate" />
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="From" />
            <Input type="date" value={until} onChange={e => setUntil(e.target.value)} aria-label="Until" />
            <Input value={why} onChange={e => setWhy(e.target.value)} placeholder="Reason (e.g. leave)" aria-label="Reason" />
            <Button size="small" disabled={!to} onClick={() => { const r = actions.createDelegation({ toName: to!, role: me!.role, startDate: new Date(`${from}T00:00:00Z`).toISOString(), endDate: new Date(`${until}T00:00:00Z`).toISOString(), reason: why || undefined }); if (r.ok) { setTo(undefined); setWhy(''); } }}>Delegate</Button>
          </div>
        ) : <Muted size="xs">You do not hold an approver role, so you have nothing to delegate.</Muted>}
      </div>
    </VwCard>
  );
}
