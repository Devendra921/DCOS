/* Change page — /changes/:changeId. Header with the actions the status allows, where the change sits in
   the chain (plan → programme → project → work order → change), the lifecycle, and the tabs:
   Overview, Materials, Approvals, Window, Work order, Process, Review, History. The Materials tab is the
   shared materials workspace (the same lines and actions as the work order's Execution tab). */
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { App, Input, Modal, Radio, Spin } from 'antd';
import { CalendarClock, CheckCircle2, ClipboardCheck, FileSearch, Gavel, History, Play, Send, Workflow, X, type LucideIcon } from 'lucide-react';
import { WorkflowStepper } from '../../../shared/components/ux';
import { EntityAuditTab } from '../../../shared/components/detail';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Empty, Panel, Tabs } from '../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { useAuth } from '../../../core/auth/AuthContext';
import { chainOfChange, isOpenChange, useDeliveryData } from '../../delivery/lib/chain';
import { useChainActions } from '../../delivery/lib/workflowChain';
import { usePlannerData } from '../../planner/lib/plannerData';
import { buildRows, fmtDay, fmtHours, fmtWhen, lifecycle, nextBoardMeeting, siteLabel } from '../lib/model';
import { useChainActions as useChangeLocalActions } from '../../delivery/lib/workflowChain';
import { ChainTrail, ClassChip, Muted, Note, RiskChip, StatusChip } from '../components/kit';
import { scopeOf, type ChangeView } from '../components/detail/shared';
import { OverviewTab } from '../components/detail/OverviewTab';
import { ApprovalsTab } from '../components/detail/ApprovalsTab';
import { WindowTab } from '../components/detail/WindowTab';
import { WorkOrderTab } from '../components/detail/WorkOrderTab';
import { ProcessTab } from '../components/detail/ProcessTab';
import { ReviewTab } from '../components/detail/ReviewTab';
import { MaterialsTab } from '../components/detail/MaterialsTab';
import { useChangeMaterials } from '../lib/materials';
import { kitStartWarning } from '../../delivery/components/workorders/materialsView';

const TABS = ['overview', 'materials', 'approvals', 'window', 'workorder', 'process', 'review', 'history'] as const;
type TabId = (typeof TABS)[number];
interface HeaderAction { key: string; label: string; icon?: LucideIcon; primary?: boolean; danger?: boolean; hidden?: boolean; tooltip?: string; onClick: () => void }
type Ask = { kind: 'complete' } | { kind: 'cancel' } | null;
const NO_CHANGE = { id: '', workOrderId: undefined, status: 'Draft' } as const;

export default function ChangeDetailPage() {
  const { changeId } = useParams();
  const [sp, setSp] = useSearchParams();
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const d = useDeliveryData();
  const pd = usePlannerData();
  const chain = useChainActions();
  const local = useChangeLocalActions();
  const [ask, setAsk] = useState<Ask>(null);

  const ch = useMemo(() => (changeId ? chainOfChange(d, changeId) : undefined), [d, changeId]);
  const row = useMemo(() => (ch ? buildRows({ ...d, changeRequests: [ch.change] }, user)[0] : undefined), [d, ch, user]);
  const materials = useChangeMaterials(ch?.change ?? NO_CHANGE, ch?.workOrder);
  const scope = useMemo(() => (ch ? scopeOf(ch.change, ch.workOrder, pd) : { rackIds: [], deviceIds: [] }), [ch, pd]);

  const tab: TabId = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? sp.get('tab') as TabId : 'overview';
  const goTab = (k: string) => { const n = new URLSearchParams(sp); if (k === 'overview') n.delete('tab'); else n.set('tab', k); setSp(n, { replace: true }); };

  if (!d.ready || !pd.ready) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;
  if (!ch || !row) {
    return (
      <OpsPage title="Change not found">
        <Panel><Empty icon={FileSearch} title="Change not found">No change with id {changeId}. <Link to="/changes">Back to the change list</Link>.</Empty></Panel>
      </OpsPage>
    );
  }
  const c = ch.change, wo = ch.workOrder, s = c.status;
  const v: ChangeView = { d, pd, ch, row, c, rackIds: scope.rackIds, deviceIds: scope.deviceIds, goTab, materials };

  const go = () => {
    if (wo) { const r = chain.startWork(wo.id); if (r.ok) message.success(`Work started on ${wo.id}`); else message.error(r.reason); }
    else { local.setStatusWithoutWorkOrder(c.id, 'InProgress'); message.success('Change in progress'); }
  };
  // A kit not at the site is a warning only: the work can always start.
  const kitWarn = wo ? kitStartWarning(materials.kit) : undefined;
  const startWork = () => (kitWarn ? modal.confirm({ title: 'The kit is not all at the site', content: kitWarn, okText: 'Start work anyway', onOk: go }) : go());
  const canStart = (s === 'Approved' || s === 'Scheduled') && (!wo || ['Ready', 'Assigned'].includes(wo.status));
  const headerActions: HeaderAction[] = [
    { key: 'submit', label: 'Submit for approval', icon: Send, primary: s === 'Draft', hidden: s !== 'Draft' || row.cls === 'Standard', tooltip: row.cls === 'Emergency' ? 'Goes to the emergency board now' : `Goes to the change board on ${fmtDay(nextBoardMeeting().toISOString())}`, onClick: () => { chain.submitChange(c.id); message.success(`${c.id} submitted for approval`); } },
    { key: 'decide', label: `Decide step ${row.current?.order ?? ''}`, icon: Gavel, primary: !!row.current, hidden: !row.current, onClick: () => goTab('approvals') },
    { key: 'window', label: row.start ? 'Move window' : 'Book window', icon: CalendarClock, primary: s === 'Approved' && !row.start, hidden: !['Draft', 'Submitted', 'UnderReview', 'Approved', 'Scheduled'].includes(s), onClick: () => goTab('window') },
    { key: 'start', label: 'Start work', icon: Play, primary: canStart && (s === 'Scheduled' || !!row.start), hidden: !canStart, tooltip: wo && !wo.assigneeName ? 'The work order has no assignee yet' : undefined, onClick: startWork },
    { key: 'complete', label: 'Complete work', icon: CheckCircle2, primary: s === 'InProgress', hidden: s !== 'InProgress', onClick: () => setAsk({ kind: 'complete' }) },
    { key: 'review', label: 'Record review', icon: ClipboardCheck, primary: s === 'Implemented' || s === 'RolledBack', hidden: !(s === 'Implemented' || s === 'RolledBack') || !!c.review, onClick: () => goTab('review') },
    { key: 'cancel', label: 'Cancel change', icon: X, danger: true, hidden: !isOpenChange(c) || s === 'InProgress', onClick: () => setAsk({ kind: 'cancel' }) },
  ];

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'materials', label: 'Materials', count: materials.warnings.length || undefined },
    { id: 'approvals', label: 'Approvals', count: row.current ? 1 : undefined },
    { id: 'window', label: 'Window' },
    { id: 'workorder', label: 'Work order' },
    { id: 'process', label: 'Process' },
    { id: 'review', label: 'Review', count: row.reviewDue ? 1 : undefined },
    { id: 'history', label: 'History' },
  ];
  const freezeWarn = !!row.freeze && row.cls !== 'Emergency';
  const boardLabel = row.cls === 'Normal' ? 'Change board' : row.cls === 'Emergency' ? 'Board' : 'Approval';
  const boardValue = row.cls === 'Standard' ? 'Template' : row.cls === 'Emergency' ? 'Emergency board' : fmtDay((c.cabDate ? new Date(c.cabDate) : nextBoardMeeting()).toISOString());

  return (
    <OpsPage title={c.title}
      description={<span className="row" style={{ gap: 6, flexWrap: 'wrap' }}><span className="mono">{c.id}</span><ClassChip cls={row.cls} /><StatusChip status={s} /><RiskChip risk={c.risk} /></span>}
      actions={<>{headerActions.filter(a => !a.hidden).map(a => (
        <Btn key={a.key} variant={a.primary ? 'filled' : a.danger ? 'danger-subtle' : 'outline'} icon={a.icon} title={a.tooltip} onClick={a.onClick}>{a.label}</Btn>
      ))}</>}>
      <ChainTrail plan={ch.plan} program={ch.program} project={ch.project} workOrder={wo} change={{ id: c.id }} />

      <StatGrid cols={5}>
        <StatTile label="Site" value={row.site ? siteLabel(row.site) : '—'} sub={row.site?.name} />
        <StatTile label="Window" value={row.start ? fmtWhen(row.start) : 'Not booked'} sub={row.start ? fmtHours(row.start, row.end) : undefined} subTone={freezeWarn ? 'bad' : undefined} />
        <StatTile label="Requested by" value={c.requestedBy} />
        <StatTile label="Work order" value={wo ? wo.id : 'None'} sub={wo ? (wo.status === 'InProgress' ? 'In progress' : wo.status) : undefined} />
        <StatTile label={boardLabel} value={boardValue} sub={row.cls === 'Standard' ? ch.template?.name : undefined} />
      </StatGrid>

      {row.freeze && isOpenChange(c) && row.cls !== 'Emergency' && <Note tone="warn">The window falls in the freeze "{row.freeze.name}". Only emergency changes may be implemented then. Move the window on the Window tab.</Note>}
      {row.reviewDue && <Note tone="warn">{row.cls === 'Emergency' ? 'Emergency change: ' : 'This change failed: '}a review is mandatory before it can close. <a onClick={() => goTab('review')}>Record the review</a>.</Note>}

      <Panel title="Lifecycle" icon={Workflow} sub={row.cls === 'Standard' ? 'Standard: approved by its template' : row.cls === 'Emergency' ? 'Emergency: decided by the emergency board, reviewed afterwards' : 'Normal: approval matrix and change board'}>
        <WorkflowStepper steps={lifecycle(c, row.cls)} />
      </Panel>

      {/* Every tab is shown; nothing hides behind a "More" menu. */}
      <Tabs<TabId> value={tab} onChange={goTab} tabs={tabs} />
      {tab === 'overview' && <OverviewTab v={v} />}
      {tab === 'materials' && <MaterialsTab v={v} />}
      {tab === 'approvals' && <ApprovalsTab v={v} />}
      {tab === 'window' && <WindowTab v={v} />}
      {tab === 'workorder' && <WorkOrderTab v={v} />}
      {tab === 'process' && <ProcessTab v={v} />}
      {tab === 'review' && <ReviewTab v={v} />}
      {tab === 'history' && <Panel title="History" icon={History}><EntityAuditTab entityType="ChangeRequest" entityId={c.id} /></Panel>}

      {ask?.kind === 'complete' && <CompleteModal hasWo={!!wo} materialsToRecord={!!wo && materials.lines.length > 0 && !wo.materialsRecordedAt} onClose={() => setAsk(null)} onOk={(outcome, notes, witness) => {
        if (wo) chain.completeWorkOrder(wo.id, { notes, customerWitness: witness || undefined }, outcome);
        else local.setStatusWithoutWorkOrder(c.id, outcome === 'Completed' ? 'Implemented' : 'RolledBack');
        message.success(outcome === 'Completed' ? 'Work completed; the change is implemented and waits for its review' : 'Recorded as failed; the change is rolled back and needs a review');
        setAsk(null); goTab('review');
      }} />}
      {ask?.kind === 'cancel' && <CancelModal id={c.id} hasWo={!!wo} onClose={() => setAsk(null)} onOk={reason => { local.cancelChange(c.id, reason); message.info(`${c.id} cancelled`); setAsk(null); }} />}
    </OpsPage>
  );
}

function CompleteModal({ hasWo, materialsToRecord, onClose, onOk }: { hasWo: boolean; materialsToRecord?: boolean; onClose: () => void; onOk: (outcome: 'Completed' | 'Failed', notes: string, witness: string) => void }) {
  const [outcome, setOutcome] = useState<'Completed' | 'Failed'>('Completed');
  const [notes, setNotes] = useState('');
  const [witness, setWitness] = useState('');
  const ok = notes.trim().length >= 3;
  return (
    <Modal open title="Complete the work" onCancel={onClose} onOk={() => ok && onOk(outcome, notes.trim(), witness.trim())} okText={outcome === 'Completed' ? 'Sign off' : 'Record failure'} okButtonProps={{ disabled: !ok, danger: outcome === 'Failed' }}>
      <div className="col" style={{ gap: 10 }}>
        <p style={{ margin: 0 }}>{hasWo ? 'Signs off the work order. The change becomes Implemented (or Rolled back if the work failed) and then needs its review to close.' : 'The change has no work order; this records the outcome on the change.'}</p>
        <Radio.Group value={outcome} onChange={e => setOutcome(e.target.value)} options={[{ value: 'Completed', label: 'Completed and tested' }, { value: 'Failed', label: 'Failed, backed out' }]} />
        <label className="col" style={{ gap: 4 }}><Muted>Sign-off notes (required)</Muted><Input.TextArea rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        {hasWo && <label className="col" style={{ gap: 4 }}><Muted>Customer witness (optional)</Muted><Input value={witness} onChange={e => setWitness(e.target.value)} /></label>}
        {materialsToRecord && <Muted>The materials are not recorded yet. Record the serials and quantities used on the work order (Execution tab) or from the Materials tab; the review shows a warning until they are.</Muted>}
      </div>
    </Modal>
  );
}

function CancelModal({ id, hasWo, onClose, onOk }: { id: string; hasWo: boolean; onClose: () => void; onOk: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open title={`Cancel ${id}?`} onCancel={onClose} onOk={() => reason.trim().length >= 3 && onOk(reason.trim())} okText="Cancel change" cancelText="Keep change" okButtonProps={{ danger: true, disabled: reason.trim().length < 3 }}>
      <div className="col" style={{ gap: 10 }}>
        <p style={{ margin: 0 }}>The change is cancelled{hasWo ? ', with its work order' : ''} and its booked window is released. It stays in the record.</p>
        <label className="col" style={{ gap: 4 }}><Muted>Reason (required)</Muted><Input.TextArea rows={3} value={reason} onChange={e => setReason(e.target.value)} /></label>
      </div>
    </Modal>
  );
}
