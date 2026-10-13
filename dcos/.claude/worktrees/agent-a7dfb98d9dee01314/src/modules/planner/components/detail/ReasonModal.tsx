/* A confirm dialog that asks for a reason (hold, cancel, withdraw) or just confirms (delete). */
import { useState } from 'react';
import { Input, Modal } from 'antd';
import { Muted } from './shared';

export interface ReasonRequest { title: string; description: string; okText: string; danger?: boolean; needsReason: boolean; placeholder?: string; onOk: (reason: string) => boolean | void }

export function ReasonModal({ req, onClose }: { req: ReasonRequest | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const short = !!req?.needsReason && reason.trim().length < 5;
  return (
    <Modal open={!!req} title={req?.title} okText={req?.okText} okButtonProps={{ danger: req?.danger, disabled: short }} destroyOnHidden
      onCancel={() => { setReason(''); onClose(); }}
      onOk={() => { if (!req) return; const keep = req.onOk(reason.trim()) === false; if (!keep) { setReason(''); onClose(); } }}>
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <div className="vw-card-description">{req?.description}</div>
        {req?.needsReason && <Input.TextArea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder={req.placeholder ?? 'Reason (required)'} aria-label="Reason" />}
        {req?.needsReason && short && <Muted size="xs">A reason of a few words is required; it is kept in the plan history.</Muted>}
      </div>
    </Modal>
  );
}
