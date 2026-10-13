/* Approvals: the steps from the approval matrix with decide actions (in order, by the role holder).
   Standard changes are pre-approved by their template; emergency changes by the emergency board. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App } from 'antd';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { useAuth } from '../../../../core/auth/AuthContext';
import { useChainActions } from '../../../delivery/lib/workflowChain';
import { fmtDay, fmtWhen, holdsRole, isPendingStep, nextBoardMeeting, peopleFor, roleLabel } from '../../lib/model';
import { KvList, Muted } from '../kit';
import { DecideModal, type DecideRequest } from '../DecideModal';
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
      <VwCard title="Approval">
        <div className="vw-flex vw-flex-col vw-gap-sm">
          <div className="vw-card-description" style={{ color: 'var(--vw-color-slate-800)' }}>
            Pre-approved by template {ch.template ? <Link to={`/changes?tab=standard&template=${ch.template.id}`}>{ch.template.name}</Link> : 'not recorded'}. A standard change needs no change board; it was approved {c.approvedAt ? `on ${fmtDay(c.approvedAt)}` : 'when it was raised'}.
          </div>
          {ch.template && <KvList items={[{ label: 'Template owner', value: ch.template.owner }, { label: 'Template review due', value: fmtDay(ch.template.reviewDue) }, { label: 'Template status', value: ch.template.status }]} />}
        </div>
      </VwCard>
    );
  }

  const current = row.current;
  const board = row.cls === 'Emergency' ? 'the emergency board (on demand)' : `the change board on ${(c.cabDate ? new Date(c.cabDate) : nextBoardMeeting()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      {c.status === 'Draft' && (
        <VwCard variant="child" tone="info">
          <div className="vw-flex vw-items-center vw-justify-between vw-gap-md vw-wrap">
            <div className="vw-card-description">This change is a draft. Submit it to start the approval steps; it then goes to {board}.</div>
            <Button type="primary" onClick={() => { actions.submitChange(c.id); message.success(`${c.id} submitted for approval`); }}>Submit for approval</Button>
          </div>
        </VwCard>
      )}
      <VwCard title={row.cls === 'Emergency' ? 'Emergency approval' : 'Approval steps'} extra={<Muted>{rule ? `Rule: ${rule.name}` : row.cls === 'Emergency' ? 'Emergency board' : 'Approval matrix'}</Muted>}>
        <div className="vw-card-description" style={{ marginBottom: 8 }}>
          {row.cls === 'Emergency' ? 'An emergency change is decided by the emergency board as soon as it is raised. The work may start once it is approved; a review afterwards is mandatory.' : `Steps are decided in order by a holder of the step's role (the full-access profile may act for a role; the decision records it). The change is approved when every step is approved, and rejected if any step is rejected. It goes to ${board}.`}
        </div>
        {ch.approvals.length === 0 ? <div className="vw-card-description">No approval steps are recorded for this change.</div> : (
          <div className="nst-table-wrap">
            <table className="nst-table" style={{ width: '100%' }}>
              <thead><tr><th>Step</th><th>Role</th><th>Who can decide</th><th>Decision</th><th>When</th><th>Comment</th><th /></tr></thead>
              <tbody>{ch.approvals.map(s => {
                const isCurrent = current?.id === s.id;
                const canDecide = isCurrent;
                const mineRole = holdsRole(user, s.approverRole);
                return (
                  <tr key={s.id} style={{ background: isCurrent ? 'var(--vw-color-amber-25)' : undefined }}>
                    <td>{s.order}</td>
                    <td>{roleLabel(s.approverRole)}</td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>{peopleFor(s.approverRole).map(p => p.name).join(', ') || <Muted>nobody holds this role</Muted>}</td>
                    <td><VwChip variant={DECISION_TONE[s.decision] ?? 'neutral'}>{s.decision}</VwChip></td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{s.decidedAt ? fmtWhen(s.decidedAt) : isCurrent ? 'waiting now' : isPendingStep(s) ? 'later' : '—'}</td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 280 }}>{s.comment ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {canDecide ? (
                        <span className="vw-inline-flex vw-gap-xs">
                          <Button size="small" type="primary" onClick={() => setReq({ change: c, step: s, decision: 'Approved' })}>Approve</Button>
                          <Button size="small" danger onClick={() => setReq({ change: c, step: s, decision: 'Rejected' })}>Reject</Button>
                        </span>
                      ) : null}
                      {canDecide && !mineRole && <div><Muted size="xs">acting for the role</Muted></div>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        {c.status === 'Rejected' && <div className="vw-card-description" style={{ marginTop: 8 }}>The change was rejected; its work order is cancelled. Raise a new change once the reason is addressed.</div>}
      </VwCard>
      <DecideModal req={req} onClose={() => setReq(null)} />
    </div>
  );
}
