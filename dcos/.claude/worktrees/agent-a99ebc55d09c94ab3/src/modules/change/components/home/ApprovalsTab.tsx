/* Approvals tab: the steps waiting for the signed-in user, the emergency board (on demand) and the
   agenda of the next weekly change board (normal changes due, grouped). */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { VwCard, VwSegmented } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { boardAgenda, daysAgo, fmtWhen, nextBoardMeeting, peopleFor, roleLabel, siteLabel, waitingSince, type ChangeRow } from '../../lib/model';
import { ClassChip, Muted, RiskChip, StatusChip } from '../kit';
import { DecideModal, type DecideRequest } from '../DecideModal';

type Group = 'Site' | 'Risk' | 'Project';

export function ApprovalsTab({ rows }: { rows: ChangeRow[] }) {
  const [req, setReq] = useState<DecideRequest | null>(null);
  const [group, setGroup] = useState<Group>('Site');
  const mine = useMemo(() => rows.filter(r => r.current).sort((a, b) => (a.mine ? 0 : 1) - (b.mine ? 0 : 1) || (a.cls === 'Emergency' ? 0 : 1) - (b.cls === 'Emergency' ? 0 : 1) || waitingSince(a.c, a.steps, a.current!).localeCompare(waitingSince(b.c, b.steps, b.current!))), [rows]);
  const emergency = useMemo(() => rows.filter(r => r.cls === 'Emergency' && (r.c.status === 'Submitted' || r.c.status === 'UnderReview' || r.c.status === 'Draft')), [rows]);
  const reviewDue = useMemo(() => rows.filter(r => r.cls === 'Emergency' && r.reviewDue), [rows]);
  const meeting = useMemo(() => nextBoardMeeting(), []);
  const agenda = useMemo(() => boardAgenda(rows, meeting), [rows, meeting]);
  const groups = useMemo(() => {
    const key = (r: ChangeRow) => group === 'Site' ? siteLabel(r.site) : group === 'Risk' ? r.c.risk : r.project?.name ?? 'No project';
    const rank = (k: string) => group === 'Risk' ? ['Critical', 'High', 'Medium', 'Low'].indexOf(k) : 0;
    const m = new Map<string, ChangeRow[]>();
    for (const r of agenda) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  }, [agenda, group]);
  const meetingLabel = meeting.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + `, ${meeting.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard title="Waiting for a decision" extra={<Muted>{mine.filter(r => r.mine).length} for your role · {mine.length} in all</Muted>}>
        <div className="vw-card-description" style={{ marginBottom: 8 }}>The next step of every submitted change, yours first. Steps are decided in order; each one shows here when the step before it is approved. With the full-access profile you may decide for another role; the decision records that you acted for it.</div>
        {mine.length === 0 ? <div className="vw-card-description">Nothing is waiting for a decision. Steps appear here when a change is submitted.</div> : (
          <div className="nst-table-wrap">
            <table className="nst-table" style={{ width: '100%' }}>
              <thead><tr><th>Change</th><th>Class</th><th>Risk</th><th>Step</th><th style={{ textAlign: 'right' }}>Waiting</th><th>Site</th><th>Window</th><th style={{ textAlign: 'right' }}>Decision</th></tr></thead>
              <tbody>{mine.map(r => {
                const w = daysAgo(waitingSince(r.c, r.steps, r.current!)) ?? 0;
                return (
                  <tr key={r.c.id}>
                    <td style={{ whiteSpace: 'normal', minWidth: 220 }}><Link to={`/changes/${r.c.id}?tab=approvals`}>{r.c.id}</Link> <span style={{ color: 'var(--vw-color-slate-800)' }}>{r.c.title}</span></td>
                    <td><ClassChip cls={r.cls} /></td>
                    <td><RiskChip risk={r.c.risk} /></td>
                    <td>{r.current!.order} of {r.steps.length} · {roleLabel(r.current!.approverRole)}{r.mine ? <Muted size="xs"> · your role</Muted> : null}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: w > 3 ? 'var(--vw-color-amber-700)' : undefined }}>{w === 0 ? 'today' : `${w} d`}</td>
                    <td>{siteLabel(r.site)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWhen(r.start)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="vw-inline-flex vw-gap-xs">
                        <Button size="small" type="primary" onClick={() => setReq({ change: r.c, step: r.current!, decision: 'Approved' })}>Approve</Button>
                        <Button size="small" danger onClick={() => setReq({ change: r.c, step: r.current!, decision: 'Rejected' })}>Reject</Button>
                      </span>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </VwCard>

      <VwCard title={`Change board agenda · ${meetingLabel}`} extra={<span className="vw-flex vw-items-center vw-gap-sm"><Muted>Group by</Muted><VwSegmented value={group} onChange={v => setGroup(v as Group)} options={['Site', 'Risk', 'Project']} /></span>}>
        <div className="vw-card-description" style={{ marginBottom: 8 }}>Normal changes go to the weekly change board (assumed Thursdays at 10:00). The agenda lists normal changes submitted and not yet decided. Standard changes never go to the board; emergency changes go to the emergency board below.</div>
        {agenda.length === 0 ? <div className="vw-card-description">No normal change is due at this board. Submitted normal changes appear here.</div> : (
          <div className="nst-table-wrap">
            <table className="nst-table" style={{ width: '100%' }}>
              <thead><tr><th>Change</th><th>Risk</th><th>Status</th><th>Next step</th><th>Window</th><th>Work order</th><th>Requester</th></tr></thead>
              <tbody>{groups.map(([g, list]) => [
                <tr key={`g-${g}`}><td colSpan={7} style={{ background: 'var(--vw-color-slate-50)', fontWeight: 500, color: 'var(--vw-color-slate-800)' }}>{g} <Muted size="xs">· {list.length}</Muted></td></tr>,
                ...list.map(r => (
                  <tr key={r.c.id}>
                    <td style={{ whiteSpace: 'normal', minWidth: 240 }}><Link to={`/changes/${r.c.id}`}>{r.c.id}</Link> <span style={{ color: 'var(--vw-color-slate-800)' }}>{r.c.title}</span></td>
                    <td><RiskChip risk={r.c.risk} /></td>
                    <td><StatusChip status={r.c.status} /></td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>{r.current ? <>{roleLabel(r.current.approverRole)}<div><Muted size="xs">{peopleFor(r.current.approverRole).map(p => p.name).join(', ') || 'nobody holds this role'}</Muted></div></> : '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWhen(r.start)}</td>
                    <td>{r.wo ? <Link to={`/delivery/work-orders/${r.wo.id}`}>{r.wo.id}</Link> : <Muted>none</Muted>}</td>
                    <td>{r.c.requestedBy}</td>
                  </tr>
                )),
              ])}</tbody>
            </table>
          </div>
        )}
      </VwCard>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <VwCard title="Emergency board" extra={<Muted>on demand · {emergency.length}</Muted>}>
          <div className="vw-card-description" style={{ marginBottom: 8 }}>Emergency changes skip the weekly board. The emergency board decides them as soon as they are raised; the work can start once approved.</div>
          {emergency.length === 0 ? <div className="vw-card-description">No emergency change is waiting for a decision.</div> : (
            <RowList rows={emergency} right={r => <StatusChip status={r.c.status} />} />
          )}
        </VwCard>
        <VwCard title="Emergency changes awaiting review" extra={<Muted>{reviewDue.length}</Muted>}>
          <div className="vw-card-description" style={{ marginBottom: 8 }}>A review is mandatory after every emergency change. Open the change and record it on the Review tab to close it.</div>
          {reviewDue.length === 0 ? <div className="vw-card-description">Every emergency change has been reviewed.</div> : (
            <RowList rows={reviewDue} right={r => <Link to={`/changes/${r.c.id}?tab=review`} className="nst-btn nst-btn--sm">Record review</Link>} />
          )}
        </VwCard>
      </div>

      <DecideModal req={req} onClose={() => setReq(null)} />
    </div>
  );
}

function RowList({ rows, right }: { rows: ChangeRow[]; right: (r: ChangeRow) => React.ReactNode }) {
  return (
    <div className="vw-flex vw-flex-col">
      {rows.map((r, i) => (
        <div key={r.c.id} className="vw-flex vw-items-center vw-justify-between vw-gap-sm" style={{ padding: '8px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--vw-font-label-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Link to={`/changes/${r.c.id}`}>{r.c.id}</Link> {r.c.title}</div>
            <Muted size="xs">{siteLabel(r.site)} · {r.start ? fmtWhen(r.start) : 'no window'} · {r.c.requestedBy}</Muted>
          </div>
          {right(r)}
        </div>
      ))}
    </div>
  );
}
