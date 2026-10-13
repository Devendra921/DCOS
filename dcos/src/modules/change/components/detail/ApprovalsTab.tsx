/* Approvals: the steps from the approval matrix with decide actions (in order, by the role holder).
   Standard changes are pre-approved by their template; emergency changes by the emergency board.
   The materials (kit, availability, retired equipment) are shown to approvers as advice; they do not block approval. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App } from 'antd';
import { BookCheck, Gavel } from 'lucide-react';
import { Btn, Chip, Empty, Panel } from '../../../../ops/ui/kit';
import { DataTable } from '../../../../ops/ui/DataTable';
import { useAuth } from '../../../../core/auth/AuthContext';
import { useChainActions } from '../../../delivery/lib/workflowChain';
import { fmtDay, fmtWhen, holdsRole, isPendingStep, nextBoardMeeting, peopleFor, roleLabel } from '../../lib/model';
import { KvList, Muted, Note } from '../kit';
import { DecideModal, type DecideRequest } from '../DecideModal';
import { MaterialsAdvisory } from '../ChangeMaterials';
import type { ChangeView } from './shared';

const DECISION_TONE = { Pending: 'warning', Approved: 'success', Rejected: 'error', Delegated: 'info' } as const;

export function ApprovalsTab({ v }: { v: ChangeView }) {
  const { c, ch, row } = v;
  const { user } = useAuth();
  const actions = useChainActions();
  const { message } = App.useApp();
  const [req, setReq] = useState<DecideRequest | null>(null);
  const rule = c.approvalRuleId ? v.d.approvalMatrixRules.find(r => r.id === c.approvalRuleId) : undefined;

  if (row.cls === 'Standard') {
    return (
      <Panel title="Approval" icon={BookCheck}>
        <div className="col" style={{ gap: 14 }}>
          <p style={{ margin: 0 }}>
            Pre-approved by template {ch.template ? <Link to={`/changes?std=${ch.template.id}`}>{ch.template.name}</Link> : 'not recorded'}. A standard change needs no change board; it was approved {c.approvedAt ? `on ${fmtDay(c.approvedAt)}` : 'when it was raised'}.
          </p>
          {ch.template && <KvList columns={3} items={[{ label: 'Template owner', value: ch.template.owner }, { label: 'Template review due', value: fmtDay(ch.template.reviewDue) }, { label: 'Template status', value: ch.template.status }]} />}
        </div>
      </Panel>
    );
  }

  const current = row.current;
  const board = row.cls === 'Emergency' ? 'the emergency board (on demand)' : `the change board on ${(c.cabDate ? new Date(c.cabDate) : nextBoardMeeting()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  return (
    <>
      {c.status === 'Draft' && (
        <Note tone="info">
          <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
            <span>This change is a draft. Submit it to start the approval steps; it then goes to {board}.</span>
            <Btn variant="filled" onClick={() => { actions.submitChange(c.id); message.success(`${c.id} submitted for approval`); }}>Submit for approval</Btn>
          </div>
        </Note>
      )}
      {['Draft', 'Submitted', 'UnderReview'].includes(c.status) && <MaterialsAdvisory m={v.materials} onOpen={() => v.goTab('materials')} />}
      <Panel title={row.cls === 'Emergency' ? 'Emergency approval' : 'Approval steps'} icon={Gavel} count={ch.approvals.length} flush
        sub={<>{rule ? `Rule: ${rule.name}` : row.cls === 'Emergency' ? 'Emergency board' : 'Approval matrix'} · {row.cls === 'Emergency' ? 'An emergency change is decided by the emergency board as soon as it is raised. The work may start once it is approved; a review afterwards is mandatory.' : `Steps are decided in order by a holder of the step's role (the full-access profile may act for a role; the decision records it). The change is approved when every step is approved, and rejected if any step is rejected. It goes to ${board}.`}</>}
        foot={c.status === 'Rejected' ? <span>The change was rejected; its work order is cancelled. Raise a new change once the reason is addressed.</span> : undefined}>
        <DataTable rows={ch.approvals} pageSize={50} rowClass={s => (current?.id === s.id ? 'is-selected' : '')}
          empty={<Empty icon={Gavel} title="No approval steps are recorded for this change" />}
          cols={[
            { key: 'order', header: 'Step', render: s => <span className="num">{s.order}</span> },
            { key: 'role', header: 'Role', render: s => roleLabel(s.approverRole) },
            { key: 'who', header: 'Who can decide', wrap: true, render: s => peopleFor(s.approverRole).map(p => p.name).join(', ') || <Muted>nobody holds this role</Muted> },
            { key: 'dec', header: 'Decision', render: s => <Chip tone={DECISION_TONE[s.decision] ?? 'neutral'} dot>{s.decision}</Chip> },
            { key: 'when', header: 'When', render: s => <span className="num">{s.decidedAt ? fmtWhen(s.decidedAt) : current?.id === s.id ? 'waiting now' : isPendingStep(s) ? 'later' : '—'}</span> },
            { key: 'comment', header: 'Comment', wrap: true, render: s => s.comment ?? '—' },
            { key: 'act', header: '', align: 'right', render: s => {
              const canDecide = current?.id === s.id;
              if (!canDecide) return null;
              return (
                <span className="col" style={{ gap: 2, alignItems: 'flex-end' }}>
                  <span className="row" style={{ gap: 6 }}>
                    <Btn size="xs" variant="filled" onClick={() => setReq({ change: c, step: s, decision: 'Approved' })}>Approve</Btn>
                    <Btn size="xs" variant="danger-subtle" onClick={() => setReq({ change: c, step: s, decision: 'Rejected' })}>Reject</Btn>
                  </span>
                  {!holdsRole(user, s.approverRole) && <Muted size="xs">acting for the role</Muted>}
                </span>
              );
            } },
          ]} />
      </Panel>
      <DecideModal req={req} onClose={() => setReq(null)} />
    </>
  );
}
