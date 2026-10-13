/* Approve or reject one approval step with a reason (required to reject). Writes through useChainActions().decideStep.
   Shows the materials of the change's work order (kit, availability, retired equipment) as advice; they never block the decision. */
import { useState } from 'react';
import { App, Input, Modal } from 'antd';
import type * as T from '../../../mock/data/types';
import { useChainActions } from '../../delivery/lib/workflowChain';
import { useAuth } from '../../../core/auth/AuthContext';
import { holdsRole, roleLabel } from '../lib/model';
import { MaterialsAdvisory } from './ChangeMaterials';
import { Note } from './kit';
import { useChangeMaterials } from '../lib/materials';

export interface DecideRequest { change: T.ChangeRequest; step: T.ApprovalStep; decision: 'Approved' | 'Rejected' }

export function DecideModal({ req, onClose }: { req: DecideRequest | null; onClose: () => void }) {
  if (!req) return null;
  return <DecideDialog key={`${req.step.id}-${req.decision}`} req={req} onClose={onClose} />;
}

function DecideDialog({ req, onClose }: { req: DecideRequest; onClose: () => void }) {
  const actions = useChainActions();
  const { message } = App.useApp();
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const materials = useChangeMaterials(req.change);
  const actingFor = !holdsRole(user, req.step.approverRole);
  const reject = req.decision === 'Rejected';
  const ok = () => {
    if (reject && reason.trim().length < 3) return;
    const note = [reason.trim(), actingFor ? `(decided by ${user.name} for the ${roleLabel(req.step.approverRole).toLowerCase()} role)` : ''].filter(Boolean).join(' ');
    const res = actions.decideStep(req.change.id, req.step.id, req.decision, note || undefined) as { ok?: boolean; reason?: string } | undefined;
    if (res && res.ok === false) { message.warning(res.reason ?? 'This step cannot be decided yet.'); return; }
    message.success(`${req.change.id}: step ${req.step.order} ${reject ? 'rejected' : 'approved'}`);
    onClose();
  };
  return (
    <Modal open title={`${reject ? 'Reject' : 'Approve'} ${req.change.id}`} onCancel={onClose} onOk={ok}
      okText={reject ? 'Reject change' : 'Approve step'} okButtonProps={{ danger: reject, disabled: reject && reason.trim().length < 3 }}>
      <div className="col" style={{ gap: 10 }}>
        <p style={{ margin: 0 }}>
          Step {req.step.order}, {roleLabel(req.step.approverRole)}: {req.change.title}.
          {reject ? ' Rejecting stops the change and cancels its work order.' : ' The change is approved when every step is approved.'}
        </p>
        <MaterialsAdvisory m={materials} />
        {actingFor && <Note tone="warn">You do not hold the {roleLabel(req.step.approverRole).toLowerCase()} role. With the full-access profile you may decide for it; the decision records that you acted for the role.</Note>}
        <label htmlFor="decide-reason" className="vw-label" style={{ fontSize: 13 }}>{reject ? 'Reason (required)' : 'Comment (optional)'}</label>
        <Input.TextArea id="decide-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder={reject ? 'Why the change cannot go ahead' : 'Conditions or notes for the implementer'} />
      </div>
    </Modal>
  );
}
