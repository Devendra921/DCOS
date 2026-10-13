/* Work order and change tables shared by the project and programme pages. Every row links down the
   chain: work order → /delivery/work-orders/:id, change → /changes/:id, project → its page. */
import { Link } from 'react-router-dom';
import { DataTable, Muted, ToneChip, type Col } from './kit';
import {
  CHANGE_STATUS_LABEL, CHANGE_STATUS_TONE, CHANGE_TYPE_LABEL, CLASS_TONE, RISK_TONE, WO_STATUS_LABEL, WO_STATUS_TONE, WO_TYPE_LABEL, windowText,
  type ChangeRow, type WorkOrderRow,
} from './format';

const Two = ({ top, sub }: { top: React.ReactNode; sub?: React.ReactNode }) => (
  <span className="cell-2" style={{ minWidth: 0 }}>
    <span>{top}</span>
    {sub && <small style={{ whiteSpace: 'normal' }}>{sub}</small>}
  </span>
);

export function WorkOrdersTable({ rows, showProject, groupByStep, empty }: {
  rows: WorkOrderRow[]; showProject?: boolean; empty?: React.ReactNode;
  /** Group the rows under the process step that raised them. */
  groupByStep?: (stepId: string) => string;
}) {
  const cols: Col<WorkOrderRow>[] = [
    { key: 'id', title: 'Work order', wrap: true, render: (r) => <Two top={<Link to={`/delivery/work-orders/${r.wo.id}`}>{r.wo.woId ?? r.wo.id}</Link>} sub={r.wo.title} /> },
    ...(showProject ? [{ key: 'project', title: 'Project', wrap: true, render: (r: WorkOrderRow) => (r.project ? <Link to={`/delivery/projects/${r.project.id}`}>{r.project.name}</Link> : <Muted>—</Muted>) }] : []),
    { key: 'type', title: 'Type', render: (r) => WO_TYPE_LABEL[r.wo.type] ?? r.wo.type },
    { key: 'site', title: 'Site and racks', render: (r) => <Two top={r.site?.code ?? r.site?.name ?? '—'} sub={r.wo.rackIds?.length ? `${r.wo.rackIds.length} rack${r.wo.rackIds.length === 1 ? '' : 's'}` : r.wo.rackId ?? undefined} /> },
    { key: 'who', title: 'Assignee', render: (r) => <Two top={r.wo.assigneeKind === 'contractor' ? <>{r.assignee} <Muted size="xs">contractor</Muted></> : r.assignee} sub={r.crew ? `Crew: ${r.crew}` : undefined} /> },
    { key: 'win', title: 'Window', render: (r) => windowText(r.start, r.end) },
    { key: 'status', title: 'Status', render: (r) => <ToneChip v={WO_STATUS_TONE[r.wo.status] ?? 'neutral'}>{WO_STATUS_LABEL[r.wo.status] ?? r.wo.status}</ToneChip> },
    { key: 'chg', title: 'Change', render: (r) => r.change ? (
      <span className="vw-inline-flex vw-items-center vw-gap-xs">
        <Link to={`/changes/${r.change.id}`}>{r.change.chgId ?? r.change.id}</Link>
        {r.change.changeClass ? <ToneChip dot={false} v={CLASS_TONE[r.change.changeClass]}>{r.change.changeClass}</ToneChip> : <Muted size="xs">no class</Muted>}
        <Muted size="xs">{CHANGE_STATUS_LABEL[r.change.status] ?? r.change.status}</Muted>
      </span>
    ) : <Muted>No change yet</Muted> },
  ];
  return (
    <DataTable rows={rows} cols={cols} rowKey={(r) => r.wo.id} empty={empty ?? 'No work orders.'}
      groupBy={groupByStep ? { key: (r) => r.wo.projectStepId ?? '', label: (k, rs) => <span>{k ? groupByStep(k) : 'Not tied to a process step'} <Muted size="xs">· {rs.length} work order{rs.length === 1 ? '' : 's'}</Muted></span> } : undefined} />
  );
}

export function ChangesTable({ rows, showProject, empty }: { rows: ChangeRow[]; showProject?: boolean; empty?: React.ReactNode }) {
  const cols: Col<ChangeRow>[] = [
    { key: 'id', title: 'Change', wrap: true, render: (r) => <Two top={<Link to={`/changes/${r.change.id}`}>{r.change.chgId ?? r.change.id}</Link>} sub={r.change.title} /> },
    ...(showProject ? [{ key: 'project', title: 'Project', wrap: true, render: (r: ChangeRow) => (r.project ? <Link to={`/delivery/projects/${r.project.id}`}>{r.project.name}</Link> : <Muted>—</Muted>) }] : []),
    { key: 'class', title: 'Class', render: (r) => r.classRecorded ? <ToneChip dot={false} v={CLASS_TONE[r.cls]}>{r.cls}</ToneChip> : <span title="Raised before change classes existed; treated as normal"><Muted>Not set</Muted></span> },
    { key: 'type', title: 'Type', render: (r) => CHANGE_TYPE_LABEL[r.change.type] ?? r.change.type },
    { key: 'risk', title: 'Risk', render: (r) => <ToneChip dot={false} v={RISK_TONE[r.change.risk] ?? 'neutral'}>{r.change.risk}</ToneChip> },
    { key: 'status', title: 'Status', render: (r) => <ToneChip v={CHANGE_STATUS_TONE[r.change.status] ?? 'neutral'}>{CHANGE_STATUS_LABEL[r.change.status] ?? r.change.status}</ToneChip> },
    { key: 'win', title: 'Window', render: (r) => windowText(r.window?.scheduledStart ?? r.change.scheduledStart, r.window?.scheduledEnd ?? r.change.scheduledEnd) },
    { key: 'appr', title: 'Approvals', render: (r) => r.cls === 'Standard' && r.approvals === 0 ? <Muted>Pre-approved</Muted> : r.approvals === 0 ? <Muted>None recorded</Muted> : <span style={{ color: r.rejected ? 'var(--vw-color-red-600)' : undefined }}>{r.rejected ? 'Rejected' : `${r.approved} of ${r.approvals}`}</span> },
    { key: 'wo', title: 'Work order', render: (r) => r.workOrder ? <Link to={`/delivery/work-orders/${r.workOrder.id}`}>{r.workOrder.woId ?? r.workOrder.id}</Link> : <Muted>—</Muted> },
    { key: 'review', title: 'Review', render: (r) => <span style={{ color: r.reviewState === 'Review due' ? 'var(--vw-color-amber-700)' : r.reviewState === '—' ? 'var(--vw-color-slate-400)' : undefined }}>{r.reviewState}</span> },
  ];
  return <DataTable rows={rows} cols={cols} rowKey={(r) => r.change.id} empty={empty ?? 'No changes.'} />;
}
