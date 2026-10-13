/* Change page — /changes/:changeId. Header with the actions the status allows, where the change sits in
   the chain (plan → programme → project → work order → change), the lifecycle, and the tabs:
   Overview, Approvals, Window, Work order, Process, Review, History. */
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { App, Input, Modal, Radio, Spin } from 'antd';
import { DetailPageHeader, TabBarV2, VwCard, WorkflowStepper, type DetailHeaderAction } from '../../../shared/components/ux';
import { EntityAuditTab } from '../../../shared/components/detail';
import { CalendarOutlined, CheckCircleOutlined, CloseOutlined, SendOutlined, AuditOutlined } from '../../../shared/icons';
import { useAuth } from '../../../core/auth/AuthContext';
import { chainOfChange, isOpenChange, useDeliveryData } from '../../delivery/lib/chain';
import { useChainActions } from '../../delivery/lib/workflowChain';
import { usePlannerData } from '../../planner/lib/plannerData';
import { buildRows, fmtDay, fmtHours, fmtWhen, lifecycle, nextBoardMeeting, siteLabel } from '../lib/model';
import { useChangeLocalActions } from '../lib/actions';
import { ChainTrail, ClassChip, Muted, RiskChip, StatusChip } from '../components/kit';
import { scopeOf, type ChangeView } from '../components/detail/shared';
import { OverviewTab } from '../components/detail/OverviewTab';
import { ApprovalsTab } from '../components/detail/ApprovalsTab';
import { WindowTab } from '../components/detail/WindowTab';
import { WorkOrderTab } from '../components/detail/WorkOrderTab';
import { ProcessTab } from '../components/detail/ProcessTab';
import { ReviewTab } from '../components/detail/ReviewTab';

const TABS = ['overview', 'approvals', 'window', 'workorder', 'process', 'review', 'history'] as const;
type Ask = { kind: 'complete' } | { kind: 'cancel' } | null;

export default function ChangeDetailPage() {
  const { changeId } = useParams();
  const [sp, setSp] = useSearchParams();
  const { message } = App.useApp();
  const { user } = useAuth();
  const d = useDeliveryData();
  const pd = usePlannerData();
  const chain = useChainActions();
  const local = useChangeLocalActions();
  const [ask, setAsk] = useState<Ask>(null);

  const ch = useMemo(() => (changeId ? chainOfChange(d, changeId) : undefined), [d, changeId]);
  const row = useMemo(() => (ch ? buildRows({ ...d, changeRequests: [ch.change] }, user)[0] : undefined), [d, ch, user]);
  const scope = useMemo(() => (ch ? scopeOf(ch.change, ch.workOrder, pd) : { rackIds: [], deviceIds: [] }), [ch, pd]);

  const tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? sp.get('tab')! : 'overview';
  const goTab = (k: string) => { const n = new URLSearchParams(sp); if (k === 'overview') n.delete('tab'); else n.set('tab', k); setSp(n, { replace: true }); };

  if (!d.ready || !pd.ready) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;
  if (!ch || !row) {
    return (
      <div className="vw-flex vw-flex-col vw-page-gap">
        <DetailPageHeader backTo="/changes" backLabel="Changes" name="Change not found" sticky={false} />
        <VwCard><div className="vw-card-description">No change with id {changeId}. <Link to="/changes">Back to the change list</Link>.</div></VwCard>
      </div>
    );
  }
  const c = ch.change, wo = ch.workOrder, s = c.status;
  const v: ChangeView = { d, pd, ch, row, c, rackIds: scope.rackIds, deviceIds: scope.deviceIds, goTab };

  const startWork = () => {
    if (wo) { const r = chain.startWork(wo.id); if (r.ok) message.success(`Work started on ${wo.id}`); else message.error(r.reason); }
    else { local.setStatusWithoutWorkOrder(c.id, 'InProgress'); message.success('Change in progress'); }
  };
  const canStart = (s === 'Approved' || s === 'Scheduled') && (!wo || ['Ready', 'Assigned'].includes(wo.status));
  const headerActions: DetailHeaderAction[] = [
    { key: 'submit', label: 'Submit for approval', icon: <SendOutlined />, primary: s === 'Draft', hidden: s !== 'Draft' || row.cls === 'Standard', tooltip: row.cls === 'Emergency' ? 'Goes to the emergency board now' : `Goes to the change board on ${fmtDay(nextBoardMeeting().toISOString())}`, onClick: () => { chain.submitChange(c.id); message.success(`${c.id} submitted for approval`); } },
    { key: 'decide', label: `Decide step ${row.current?.order ?? ''}`, icon: <AuditOutlined />, primary: !!row.current, hidden: !row.current, onClick: () => goTab('approvals') },
    { key: 'window', label: row.start ? 'Move window' : 'Book window', icon: <CalendarOutlined />, primary: s === 'Approved' && !row.start, hidden: !['Draft', 'Submitted', 'UnderReview', 'Approved', 'Scheduled'].includes(s), onClick: () => goTab('window') },
    { key: 'start', label: 'Start work', primary: canStart && (s === 'Scheduled' || !!row.start), hidden: !canStart, tooltip: wo && !wo.assigneeName ? 'The work order has no assignee yet' : undefined, onClick: startWork },
    { key: 'complete', label: 'Complete work', icon: <CheckCircleOutlined />, primary: s === 'InProgress', hidden: s !== 'InProgress', onClick: () => setAsk({ kind: 'complete' }) },
    { key: 'review', label: 'Record review', icon: <AuditOutlined />, primary: s === 'Implemented' || s === 'RolledBack', hidden: !(s === 'Implemented' || s === 'RolledBack') || !!c.review, onClick: () => goTab('review') },
    { key: 'cancel', label: 'Cancel change', icon: <CloseOutlined />, danger: true, hidden: !isOpenChange(c) || s === 'InProgress', onClick: () => setAsk({ kind: 'cancel' }) },
  ];

  const tabItems = [
    { key: 'overview', label: 'Overview', children: tab === 'overview' ? <OverviewTab v={v} /> : null },
    { key: 'approvals', label: 'Approvals', badge: row.current ? 1 : undefined, children: tab === 'approvals' ? <ApprovalsTab v={v} /> : null },
    { key: 'window', label: 'Window', children: tab === 'window' ? <WindowTab v={v} /> : null },
    { key: 'workorder', label: 'Work order', children: tab === 'workorder' ? <WorkOrderTab v={v} /> : null },
    { key: 'process', label: 'Process', children: tab === 'process' ? <ProcessTab v={v} /> : null },
    { key: 'review', label: 'Review', badge: row.reviewDue ? '!' : undefined, children: tab === 'review' ? <ReviewTab v={v} /> : null },
    { key: 'history', label: 'History', children: tab === 'history' ? <VwCard title="History"><EntityAuditTab entityType="ChangeRequest" entityId={c.id} /></VwCard> : null },
  ];

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <DetailPageHeader
        backTo="/changes" backLabel="Changes"
        code={c.id} name={c.title}
        statusPill={<span className="vw-inline-flex vw-items-center vw-gap-xs"><ClassChip cls={row.cls} /><StatusChip status={s} /><RiskChip risk={c.risk} /></span>}
        subtitle={<ChainTrail plan={ch.plan} program={ch.program} project={ch.project} workOrder={wo} change={{ id: c.id }} />}
        properties={[
          { label: 'Site', value: row.site ? `${siteLabel(row.site)} · ${row.site.name}` : '—' },
          { label: 'Window', value: row.start ? `${fmtWhen(row.start)} · ${fmtHours(row.start, row.end)}` : 'Not booked', tone: row.freeze && row.cls !== 'Emergency' ? 'critical' : undefined },
          { label: 'Requested by', value: c.requestedBy },
          { label: 'Work order', value: wo ? `${wo.id} · ${wo.status === 'InProgress' ? 'In progress' : wo.status}` : 'None' },
          { label: row.cls === 'Normal' ? 'Change board' : row.cls === 'Emergency' ? 'Board' : 'Approval', value: row.cls === 'Standard' ? `Template${ch.template ? ` ${ch.template.name}` : ''}` : row.cls === 'Emergency' ? 'Emergency board' : fmtDay((c.cabDate ? new Date(c.cabDate) : nextBoardMeeting()).toISOString()) },
        ]}
        actions={headerActions}
      />

      {row.freeze && isOpenChange(c) && row.cls !== 'Emergency' && <VwCard variant="child" tone="warning"><div className="vw-card-description">The window falls in the freeze "{row.freeze.name}". Only emergency changes may be implemented then. Move the window on the Window tab.</div></VwCard>}
      {row.reviewDue && <VwCard variant="child" tone="warning"><div className="vw-card-description">{row.cls === 'Emergency' ? 'Emergency change: ' : 'This change failed: '}a review is mandatory before it can close. <a onClick={() => goTab('review')}>Record the review</a>.</div></VwCard>}

      <VwCard title="Lifecycle" extra={<Muted>{row.cls === 'Standard' ? 'Standard: approved by its template' : row.cls === 'Emergency' ? 'Emergency: decided by the emergency board, reviewed afterwards' : 'Normal: approval matrix and change board'}</Muted>}>
        <WorkflowStepper steps={lifecycle(c, row.cls)} />
      </VwCard>

      {/* Every tab is shown; nothing hides behind a "More" menu. */}
      <TabBarV2 items={tabItems} activeKey={tab} onChange={goTab} primaryCap={tabItems.length + 1} />

      {ask?.kind === 'complete' && <CompleteModal hasWo={!!wo} onClose={() => setAsk(null)} onOk={(outcome, notes, witness) => {
        if (wo) chain.completeWorkOrder(wo.id, { notes, customerWitness: witness || undefined }, outcome);
        else local.setStatusWithoutWorkOrder(c.id, outcome === 'Completed' ? 'Implemented' : 'RolledBack');
        message.success(outcome === 'Completed' ? 'Work completed; the change is implemented and waits for its review' : 'Recorded as failed; the change is rolled back and needs a review');
        setAsk(null); goTab('review');
      }} />}
      {ask?.kind === 'cancel' && <CancelModal id={c.id} hasWo={!!wo} onClose={() => setAsk(null)} onOk={reason => { local.cancelChange(c.id, reason); message.info(`${c.id} cancelled`); setAsk(null); }} />}
    </div>
  );
}

function CompleteModal({ hasWo, onClose, onOk }: { hasWo: boolean; onClose: () => void; onOk: (outcome: 'Completed' | 'Failed', notes: string, witness: string) => void }) {
  const [outcome, setOutcome] = useState<'Completed' | 'Failed'>('Completed');
  const [notes, setNotes] = useState('');
  const [witness, setWitness] = useState('');
  const ok = notes.trim().length >= 3;
  return (
    <Modal open title="Complete the work" onCancel={onClose} onOk={() => ok && onOk(outcome, notes.trim(), witness.trim())} okText={outcome === 'Completed' ? 'Sign off' : 'Record failure'} okButtonProps={{ disabled: !ok, danger: outcome === 'Failed' }}>
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <div className="vw-card-description">{hasWo ? 'Signs off the work order. The change becomes Implemented (or Rolled back if the work failed) and then needs its review to close.' : 'The change has no work order; this records the outcome on the change.'}</div>
        <Radio.Group value={outcome} onChange={e => setOutcome(e.target.value)} options={[{ value: 'Completed', label: 'Completed and tested' }, { value: 'Failed', label: 'Failed, backed out' }]} />
        <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Sign-off notes (required)</Muted><Input.TextArea rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        {hasWo && <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Customer witness (optional)</Muted><Input value={witness} onChange={e => setWitness(e.target.value)} /></label>}
      </div>
    </Modal>
  );
}

function CancelModal({ id, hasWo, onClose, onOk }: { id: string; hasWo: boolean; onClose: () => void; onOk: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open title={`Cancel ${id}?`} onCancel={onClose} onOk={() => reason.trim().length >= 3 && onOk(reason.trim())} okText="Cancel change" cancelText="Keep change" okButtonProps={{ danger: true, disabled: reason.trim().length < 3 }}>
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <div className="vw-card-description">The change is cancelled{hasWo ? ', with its work order' : ''} and its booked window is released. It stays in the record.</div>
        <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Reason (required)</Muted><Input.TextArea rows={3} value={reason} onChange={e => setReason(e.target.value)} /></label>
      </div>
    </Modal>
  );
}
