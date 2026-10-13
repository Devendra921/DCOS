/* Work order page sections that only read: Overview, Change and History. */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { useEntityList } from '../../../../shared/hooks/useEntityCRUD';
import type * as T from '../../../../mock/data/types';
import { DataTable, KvList, Muted } from '../home/kit';
import { CHG_STATUS_LABEL, CHG_STATUS_TONE, CLASS_RULE, CLASS_TONE, fmtDateTime, fmtDay, fmtWindow, relDays, typeLabel, woStatusLabel } from './model';
import type { WorkOrderView } from './view';

const DECISION_TONE = { Pending: 'warning', Approved: 'success', Rejected: 'error', Delegated: 'info' } as const;

/** Notice saying whether the work can start, and why not. */
export function StartNotice({ v }: { v: WorkOrderView }) {
  const { row } = v;
  if (row.startBlock) return <VwCard variant="child" tone="warning" title="The work cannot start yet"><div className="vw-card-description">{row.startBlock}</div></VwCard>;
  if (row.wo.status === 'Ready' || row.wo.status === 'Assigned') return <VwCard variant="child" tone="success"><div className="vw-card-description">The change is approved. The work can start in its window ({fmtWindow(row.start, row.end)}).</div></VwCard>;
  return null;
}

export function OverviewSection({ v }: { v: WorkOrderView }) {
  const { row } = v; const wo = row.wo;
  return (
    <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 380px)', alignItems: 'start' }}>
      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <StartNotice v={v} />
        <VwCard title="What">
          <div className="vw-flex vw-flex-col vw-gap-sm">
            {wo.description && <div className="vw-card-description" style={{ color: 'var(--vw-color-slate-800)' }}>{wo.description}</div>}
            <KvList columns={2} items={[
              { label: 'Title', value: row.title },
              { label: 'Type of work', value: typeLabel(wo.type) },
              { label: 'Priority', value: wo.priority ?? 'Medium' },
              { label: 'Status', value: woStatusLabel(wo.status) },
              { label: 'Project step', value: wo.projectStepId ?? '—' },
              { label: 'Notes', value: (wo as { notes?: string }).notes ?? '—' },
            ]} />
          </div>
        </VwCard>
        <VwCard title="Where">
          <KvList columns={2} items={[
            { label: 'Site', value: v.site(row.siteId) },
            { label: 'Racks', value: v.rackNames.length ? v.rackNames.join(', ') : '—' },
            { label: 'Devices', value: v.deviceNames.length ? v.deviceNames.join(', ') : '—' },
            { label: 'Affected by the change', value: row.change?.affectedResourceIds.length ? `${row.change.affectedResourceIds.length} ${row.change.affectedResourceType.toLowerCase()}${row.change.affectedResourceIds.length === 1 ? '' : 's'}` : '—' },
          ]} />
        </VwCard>
        <VwCard title="When">
          <KvList columns={2} items={[
            { label: 'Planned window', value: fmtWindow(row.start, row.end) },
            { label: 'Starts', value: row.start ? relDays(row.start) : '—' },
            { label: 'Started', value: fmtDateTime(wo.actualStart) },
            { label: 'Finished', value: fmtDateTime(wo.actualEnd) },
          ]} />
        </VwCard>
      </div>
      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <VwCard title="In the delivery chain">
          <KvList items={[
            { label: 'Plan', value: row.plan ? <Link to={`/planning/plans/${row.plan.id}`}>{row.plan.plnId} · {row.plan.title}</Link> : <Muted>not from a plan</Muted> },
            { label: 'Programme', value: row.program ? <Link to={`/delivery/programs/${row.program.id}`}>{row.program.name}</Link> : <Muted>none</Muted> },
            { label: 'Project', value: row.project ? <Link to={`/delivery/projects/${row.project.id}`}>{row.project.name}</Link> : <Muted>none</Muted> },
            { label: 'Change', value: row.change ? <Link to={`/changes/${row.change.id}`}>{row.change.chgId ?? row.change.id}</Link> : <VwChip variant="error">No change request</VwChip> },
          ]} />
        </VwCard>
        <VwCard title="Who">
          <KvList items={[
            { label: 'Assigned to', value: row.assignee },
            { label: 'Kind', value: row.wo.assigneeKind === 'contractor' ? 'Contractor company' : 'Own technician' },
            ...(row.wo.crew?.length ? [{ label: 'Crew', value: row.wo.crew.join(', ') }] : []),
            ...(row.wo.assigneeKind === 'contractor' ? [{ label: 'Site access', value: v.accessState ? <VwChip variant={v.accessState.tone}>{v.accessState.label}</VwChip> : '—' }] : []),
          ]} />
        </VwCard>
        {wo.signOff && (
          <VwCard title="Sign-off">
            <KvList items={[
              { label: 'Signed off by', value: wo.signOff.by }, { label: 'When', value: fmtDateTime(wo.signOff.at) },
              { label: 'Customer witness', value: wo.signOff.customerWitness || '—' }, { label: 'Notes', value: wo.signOff.notes || '—' },
            ]} />
          </VwCard>
        )}
      </div>
    </div>
  );
}

export function ChangeSection({ v }: { v: WorkOrderView }) {
  const { row } = v; const c = row.change;
  if (!c) {
    return (
      <VwCard title="No change request">
        <div className="vw-card-description">Every change to the estate is made through a change request, one per work order, and the work cannot start without it. This work order was created before that rule; raise its change from the change module and link it to {row.wo.woId ?? row.wo.id}.</div>
      </VwCard>
    );
  }
  const cls = row.changeClass ?? 'Normal';
  const freeze = c.freezeId ? v.d.changeFreezes.find(f => f.id === c.freezeId) : undefined;
  return (
    <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 380px)', alignItems: 'start' }}>
      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <StartNotice v={v} />
        <VwCard title={<span>Change {c.chgId ?? c.id}</span>} extra={<Link to={`/changes/${c.id}`} className="nst-btn nst-btn--action nst-btn--sm">Open change</Link>}>
          <div className="vw-flex vw-flex-col vw-gap-sm">
            <div className="vw-card-description" style={{ color: 'var(--vw-color-slate-800)' }}>{c.title}</div>
            <KvList columns={2} items={[
              { label: 'Class', value: <VwChip variant={CLASS_TONE[cls]}>{cls}</VwChip> },
              { label: 'Status', value: <VwChip variant={CHG_STATUS_TONE[c.status]}>{CHG_STATUS_LABEL[c.status]}</VwChip> },
              { label: 'Risk', value: c.risk },
              { label: 'Window', value: fmtWindow(row.window?.scheduledStart ?? c.scheduledStart, row.window?.scheduledEnd ?? c.scheduledEnd) },
              { label: 'Change board', value: cls === 'Standard' ? 'Not needed' : cls === 'Emergency' ? 'Emergency board, on demand' : c.cabDate ? fmtDay(c.cabDate) : 'Next weekly board' },
              { label: 'Freeze', value: freeze ? `${freeze.name} (${fmtDay(freeze.start)} to ${fmtDay(freeze.end)})` : 'None' },
              { label: 'Standard template', value: v.template ? `${v.template.name}${v.template.status !== 'Active' ? ` (${v.template.status.toLowerCase()})` : ''}` : '—' },
              { label: 'Submitted', value: fmtDay(c.submittedAt) },
              { label: 'Approved', value: fmtDay(c.approvedAt) },
              { label: 'Impact', value: c.impactSummary ?? row.window?.impact ?? '—' },
            ]} />
            <div className="vw-card-description" style={{ color: 'var(--vw-color-slate-500)' }}>{CLASS_RULE[cls]}</div>
          </div>
        </VwCard>
        <VwCard title="Approvals" extra={<Muted>{v.approvals.filter(a => a.decision === 'Approved').length} of {v.approvals.length} approved</Muted>}>
          <DataTable<T.ApprovalStep> rows={v.approvals} rowKey={a => a.id}
            empty={cls === 'Standard' ? 'A standard change is approved by its template; there are no approvers.' : 'No approval steps yet. They are created when the change is submitted.'}
            cols={[
              { key: 'o', title: 'Step', render: a => a.order },
              { key: 'r', title: 'Approver role', render: a => String(a.approverRole).replace(/([a-z])([A-Z])/g, '$1 $2') },
              { key: 'd', title: 'Decision', render: a => <VwChip variant={DECISION_TONE[a.decision as keyof typeof DECISION_TONE] ?? 'neutral'}>{a.decision}</VwChip> },
              { key: 't', title: 'Decided', render: a => fmtDay(a.decidedAt) },
              { key: 'c', title: 'Comment', wrap: true, render: a => a.comment ?? '—' },
            ]} />
        </VwCard>
      </div>
      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <VwCard title="Plans in the change">
          <KvList items={[
            { label: 'Implementation', value: c.implementationPlan ? <span style={{ whiteSpace: 'pre-line' }}>{c.implementationPlan}</span> : '—' },
            { label: 'Test', value: c.testPlan ?? '—' },
            { label: 'Back-out', value: c.backoutPlan ?? c.rollbackPlan ?? '—' },
          ]} />
        </VwCard>
      </div>
    </div>
  );
}

interface HistoryRow { at: string; what: string; record: string; detail: string; by: string }

export function HistorySection({ v }: { v: WorkOrderView }) {
  const { row } = v; const wo = row.wo; const c = row.change;
  const ids = [wo.id, c?.id, v.access?.id, v.p10?.id].filter(Boolean) as string[];
  const audits = useEntityList('auditEvents', { pageSize: 1000, filters: [{ field: 'entityId', operator: 'in', value: ids }] }).data?.data as unknown as T.AuditEvent[] | undefined;
  const rows = useMemo(() => {
    const woId = wo.woId ?? wo.id; const chgId = c ? c.chgId ?? c.id : '';
    const out: HistoryRow[] = [{ at: wo.createdAt, what: 'Created', record: woId, detail: row.title, by: wo.createdBy }];
    if (c?.submittedAt) out.push({ at: c.submittedAt, what: 'Change submitted', record: chgId, detail: c.title, by: c.requestedBy });
    if (c?.approvedAt) out.push({ at: c.approvedAt, what: 'Change approved', record: chgId, detail: row.changeClass === 'Standard' ? 'Approved by its standard template' : 'All approvals given', by: '—' });
    const audited = (action: string[]) => (audits ?? []).some(a => a.entityId === wo.id && action.includes(a.action));
    if (wo.actualStart && !audited(['started'])) out.push({ at: wo.actualStart, what: 'Work started', record: woId, detail: '', by: wo.assigneeName || '—' });
    if (wo.signOff && !audited(['completed', 'failed'])) out.push({ at: wo.signOff.at, what: wo.status === 'Failed' ? 'Work failed' : 'Signed off', record: woId, detail: wo.signOff.notes ?? '', by: wo.signOff.by });
    if (c?.closedAt) out.push({ at: c.closedAt, what: 'Change closed', record: chgId, detail: c.review ? `${c.review.outcome}: ${c.review.notes}` : '', by: c.review?.by ?? '—' });
    for (const a of audits ?? []) out.push({ at: a.timestamp, what: a.action.charAt(0).toUpperCase() + a.action.slice(1), record: a.entityId === wo.id ? woId : a.entityId === c?.id ? chgId : a.entityId, detail: a.summary, by: a.actorName });
    const seen = new Set<string>();
    return out.filter(r => { const k = `${r.at.slice(0, 16)}|${r.what.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.at.localeCompare(a.at));
  }, [audits, wo, c, row.title, row.changeClass]);
  return (
    <VwCard title="History" extra={<Muted>{rows.length} event{rows.length === 1 ? '' : 's'}</Muted>}>
      <DataTable<HistoryRow> rows={rows} rowKey={r => `${r.at}-${r.what}-${r.record}`}
        cols={[
          { key: 'at', title: 'When', render: r => fmtDateTime(r.at) },
          { key: 'w', title: 'What', render: r => r.what },
          { key: 'r', title: 'Record', render: r => r.record },
          { key: 'd', title: 'Detail', wrap: true, minWidth: 260, render: r => r.detail || '—' },
          { key: 'b', title: 'By', render: r => r.by },
        ]} />
    </VwCard>
  );
}
