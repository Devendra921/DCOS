/* Work order page sections that only read: Overview, Change and History. */
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, GitBranch, History, MapPin, Package, PenLine, ShieldCheck, Timer, Users } from 'lucide-react';
import { KV, Panel } from '../../../../ops/ui/kit';
import { ToneChip } from '../project/kit';
import { useEntityList } from '../../../../shared/hooks/useEntityCRUD';
import type * as T from '../../../../mock/data/types';
import { DataTable, Muted } from '../home/kit';
import { CHG_STATUS_LABEL, CHG_STATUS_TONE, CLASS_RULE, CLASS_TONE, fmtDateTime, fmtDay, fmtWindow, relDays, typeLabel, woStatusLabel } from './model';
import type { WorkOrderView } from './view';
import { ReadinessNote } from './materials';
import { AVAILABILITY_TONE, availabilityOf, fmtQty, retiredOf } from '../../lib/materialRules';
import { dispositionSummary } from './materialsView';
import { stepNameFor } from '../../lib/projectProcess';

const DECISION_TONE = { Pending: 'warning', Approved: 'success', Rejected: 'error', Delegated: 'info' } as const;

/** Property grid in the Operate style, fed by { label, value } items. */
export function KvGrid({ items, cols = 2 }: { items: { label: ReactNode; value: ReactNode }[]; cols?: number }) {
  return <KV cols={cols} items={items.map(i => [i.label, i.value])} />;
}

/** Notice saying whether the work can start, and why not. */
export function StartNotice({ v }: { v: WorkOrderView }) {
  const { row } = v;
  if (row.startBlock) return <div className="note note--warn"><AlertTriangle size={15} /><span><b>The work cannot start yet.</b> {row.startBlock}</span></div>;
  if (row.wo.status === 'Ready' || row.wo.status === 'Assigned') return <div className="note note--good"><CheckCircle2 size={15} /><span>The change is approved. The work can start in its window ({fmtWindow(row.start, row.end)}).</span></div>;
  return null;
}

export function OverviewSection({ v }: { v: WorkOrderView }) {
  const { row } = v; const wo = row.wo;
  return (
    <div className="grid g-main-side" style={{ alignItems: 'start' }}>
      <div className="col" style={{ gap: 16 }}>
        <StartNotice v={v} />
        <Panel title="What" icon={ClipboardCheck}>
          <div className="col" style={{ gap: 12 }}>
            {wo.description && <div className="vw-card-description" style={{ color: 'var(--vw-color-slate-800)' }}>{wo.description}</div>}
            <KvGrid items={[
              { label: 'Title', value: row.title },
              { label: 'Type of work', value: typeLabel(wo.type) },
              { label: 'Priority', value: wo.priority ?? 'Medium' },
              { label: 'Status', value: woStatusLabel(wo.status) },
              { label: 'Project step', value: stepNameFor(row.project?.template, wo.projectStepId) ?? '—' },
              { label: 'Notes', value: (wo as { notes?: string }).notes ?? '—' },
            ]} />
          </div>
        </Panel>
        <Panel title="Where" icon={MapPin}>
          <KvGrid items={[
            { label: 'Site', value: v.site(row.siteId) },
            { label: 'Racks', value: v.rackNames.length ? v.rackNames.join(', ') : '—' },
            { label: 'Devices', value: v.deviceNames.length ? v.deviceNames.join(', ') : '—' },
            { label: 'Affected by the change', value: row.change?.affectedResourceIds.length ? `${row.change.affectedResourceIds.length} ${row.change.affectedResourceType.toLowerCase()}${row.change.affectedResourceIds.length === 1 ? '' : 's'}` : '—' },
          ]} />
        </Panel>
        <Panel title="When" icon={Timer}>
          <KvGrid items={[
            { label: 'Planned window', value: fmtWindow(row.start, row.end) },
            { label: 'Starts', value: row.start ? relDays(row.start) : '—' },
            { label: 'Started', value: fmtDateTime(wo.actualStart) },
            { label: 'Finished', value: fmtDateTime(wo.actualEnd) },
          ]} />
        </Panel>
      </div>
      <div className="col" style={{ gap: 16 }}>
        <Panel title="In the delivery chain" icon={GitBranch}>
          <KvGrid items={[
            { label: 'Plan', value: row.plan ? <Link to={`/planning/plans/${row.plan.id}`}>{row.plan.plnId} · {row.plan.title}</Link> : <Muted>not from a plan</Muted> },
            { label: 'Programme', value: row.program ? <Link to={`/delivery/programs/${row.program.id}`}>{row.program.name}</Link> : <Muted>none</Muted> },
            { label: 'Project', value: row.project ? <Link to={`/delivery/projects/${row.project.id}`}>{row.project.name}</Link> : <Muted>none</Muted> },
            { label: 'Change', value: row.change ? <Link to={`/changes/${row.change.id}`}>{row.change.chgId ?? row.change.id}</Link> : <ToneChip v="error">No change request</ToneChip> },
          ]} />
        </Panel>
        <Panel title="Materials" icon={Package} actions={<Link to="?tab=execution" className="panel-link">Open materials</Link>}>
          {v.materialLines.length === 0 ? <div className="vw-card-description">No materials on this work order.</div> : (
            <div className="col" style={{ gap: 12 }}>
              <ReadinessNote r={v.kit} />
              <KvGrid items={[
                { label: 'Going in', value: summarise(v.materialLines.filter(l => l.direction === 'In')) },
                { label: 'Availability', value: (() => { const a = availabilityOf(v.materialLines); return a.open ? <span className="row wrap" style={{ gap: 6 }}><ToneChip v={AVAILABILITY_TONE[a.state]}>{a.state}</ToneChip>{a.reasons.length > 0 && <Muted>{a.reasons.join(' · ')}</Muted>}</span> : <Muted>nothing still to come</Muted>; })() },
                { label: 'Coming out', value: summarise(v.materialLines.filter(l => l.direction === 'Out')) },
                { label: 'Retired', value: (() => { const r = retiredOf(v.materialLines); return r.units ? `${r.units} unit${r.units === 1 ? '' : 's'}: ${dispositionSummary(r)}${r.awaitingSanitisation.length ? ` · ${r.awaitingSanitisation.length} awaiting sanitisation` : ''}` : <Muted>nothing removed</Muted>; })() },
                { label: 'Recorded', value: wo.materialsRecordedAt ? `${fmtDateTime(wo.materialsRecordedAt)}${wo.materialsRecordedBy ? ` by ${wo.materialsRecordedBy}` : ''}` : 'Not yet' },
              ]} />
            </div>
          )}
        </Panel>
        <Panel title="Who" icon={Users}>
          <KvGrid items={[
            { label: 'Assigned to', value: row.assignee },
            { label: 'Kind', value: row.wo.assigneeKind === 'contractor' ? 'Contractor company' : 'Own technician' },
            ...(row.wo.crew?.length ? [{ label: 'Crew', value: row.wo.crew.join(', ') }] : []),
            ...(row.wo.assigneeKind === 'contractor' ? [{ label: 'Site access', value: v.accessState ? <ToneChip v={v.accessState.tone}>{v.accessState.label}</ToneChip> : '—' }] : []),
          ]} />
        </Panel>
        {wo.signOff && (
          <Panel title="Sign-off" icon={PenLine}>
            <KvGrid items={[
              { label: 'Work done by', value: wo.signOff.performedBy ?? wo.assigneeName ?? '—' }, { label: 'Confirmed by', value: wo.signOff.by }, { label: 'When', value: fmtDateTime(wo.signOff.at) },
              { label: 'Customer witness', value: wo.signOff.customerWitness || '—' }, { label: 'Notes', value: wo.signOff.notes || '—' },
            ]} />
          </Panel>
        )}
      </div>
    </div>
  );
}

/** "2 × Rail kit, 4 × Patch cord" (first few lines), or "none". */
function summarise(lines: T.MaterialLine[]): string {
  if (!lines.length) return 'none';
  const head = lines.slice(0, 3).map(l => `${fmtQty(l.quantity, l.uom)} × ${l.description}`).join(', ');
  return lines.length > 3 ? `${head} and ${lines.length - 3} more` : head;
}

export function ChangeSection({ v }: { v: WorkOrderView }) {
  const { row } = v; const c = row.change;
  if (!c) {
    return (
      <Panel title="No change request" icon={AlertTriangle} actions={<ToneChip v="error">No change</ToneChip>}>
        <div className="vw-card-description">Every change to the estate is made through a change request, one per work order, and the work cannot start without it. This work order was created before that rule; raise its change from the change module and link it to {row.wo.woId ?? row.wo.id}.</div>
      </Panel>
    );
  }
  const cls = row.changeClass ?? 'Normal';
  const freeze = c.freezeId ? v.d.changeFreezes.find(f => f.id === c.freezeId) : undefined;
  return (
    <div className="grid g-main-side" style={{ alignItems: 'start' }}>
      <div className="col" style={{ gap: 16 }}>
        <StartNotice v={v} />
        <Panel title={`Change ${c.chgId ?? c.id}`} icon={GitBranch} actions={<Link to={`/changes/${c.id}`} className="panel-link">Open change</Link>}>
          <div className="col" style={{ gap: 12 }}>
            <div className="vw-card-description" style={{ color: 'var(--vw-color-slate-800)' }}>{c.title}</div>
            <KvGrid items={[
              { label: 'Class', value: <ToneChip v={CLASS_TONE[cls]}>{cls}</ToneChip> },
              { label: 'Status', value: <ToneChip v={CHG_STATUS_TONE[c.status]}>{CHG_STATUS_LABEL[c.status]}</ToneChip> },
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
        </Panel>
        <Panel title="Approvals" icon={ShieldCheck} count={v.approvals.length} sub={`${v.approvals.filter(a => a.decision === 'Approved').length} of ${v.approvals.length} approved`}>
          <DataTable<T.ApprovalStep> rows={v.approvals} rowKey={a => a.id}
            empty={cls === 'Standard' ? 'A standard change is approved by its template; there are no approvers.' : 'No approval steps yet. They are created when the change is submitted.'}
            cols={[
              { key: 'o', title: 'Step', render: a => a.order },
              { key: 'r', title: 'Approver role', render: a => String(a.approverRole).replace(/([a-z])([A-Z])/g, '$1 $2') },
              { key: 'd', title: 'Decision', render: a => <ToneChip v={DECISION_TONE[a.decision as keyof typeof DECISION_TONE] ?? 'neutral'}>{a.decision}</ToneChip> },
              { key: 't', title: 'Decided', render: a => fmtDay(a.decidedAt) },
              { key: 'c', title: 'Comment', wrap: true, render: a => a.comment ?? '—' },
            ]} />
        </Panel>
      </div>
      <div className="col" style={{ gap: 16 }}>
        <Panel title="Plans in the change" icon={FileText}>
          <KvGrid items={[
            { label: 'Implementation', value: c.implementationPlan ? <span style={{ whiteSpace: 'pre-line' }}>{c.implementationPlan}</span> : '—' },
            { label: 'Test', value: c.testPlan ?? '—' },
            { label: 'Back-out', value: c.backoutPlan ?? c.rollbackPlan ?? '—' },
          ]} />
        </Panel>
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
    // Process steps done by people: the work order's own process, the crew's site access and the change's process.
    const procs = v.d.processInstances.filter(i => i.id === v.p10?.id || i.id === v.access?.id || (!!c && i.recordType === 'changeRequest' && i.recordId === c.id && i.definitionKey === 'change'));
    const procLabel = new Map(procs.map(i => [i.id, i.id === v.p10?.id ? woId : i.id === v.access?.id ? `Site access ${i.businessKey}` : chgId]));
    for (const t of v.d.userTasks) if (t.state === 'completed' && t.completedAt && procLabel.has(t.instanceId)) out.push({ at: t.completedAt, what: `Task done: ${t.name}`, record: procLabel.get(t.instanceId)!, detail: '', by: t.assignee ?? '—' });
    const seen = new Set<string>();
    return out.filter(r => { const k = `${r.at.slice(0, 16)}|${r.what.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.at.localeCompare(a.at));
  }, [audits, wo, c, row.title, row.changeClass, v.d, v.p10, v.access]);
  return (
    <Panel title="History" icon={History} count={rows.length} sub={`${rows.length} event${rows.length === 1 ? '' : 's'}`}>
      <DataTable<HistoryRow> rows={rows} rowKey={r => `${r.at}-${r.what}-${r.record}`}
        cols={[
          { key: 'at', title: 'When', render: r => fmtDateTime(r.at) },
          { key: 'w', title: 'What', render: r => r.what },
          { key: 'r', title: 'Record', render: r => r.record },
          { key: 'd', title: 'Detail', wrap: true, minWidth: 260, render: r => r.detail || '—' },
          { key: 'b', title: 'By', render: r => r.by },
        ]} />
    </Panel>
  );
}
