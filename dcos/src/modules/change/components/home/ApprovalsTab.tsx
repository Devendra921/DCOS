/* Approvals tab: the steps waiting for the signed-in user, the emergency board (on demand) and the
   agenda of the next weekly change board (normal changes due, grouped). */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, ClipboardCheck, Gavel, ShieldAlert, Siren } from 'lucide-react';
import { Btn, Empty, Panel, Seg } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { boardAgenda, daysAgo, fmtWhen, nextBoardMeeting, peopleFor, roleLabel, siteLabel, waitingSince, type ChangeRow } from '../../lib/model';
import { ClassChip, Muted, RiskChip, StatusChip } from '../kit';
import { DecideModal, type DecideRequest } from '../DecideModal';
import { useMaterialData } from '../../../delivery/lib/materialHooks';
import { linesOfChange, readinessOf } from '../../../delivery/lib/materialRules';
import { ReadinessChip } from '../../../delivery/components/workorders/materials';

type Group = 'Site' | 'Risk' | 'Project';

export function ApprovalsTab({ rows }: { rows: ChangeRow[] }) {
  const navigate = useNavigate();
  const [req, setReq] = useState<DecideRequest | null>(null);
  const [group, setGroup] = useState<Group>('Site');
  const md = useMaterialData();
  // Kit readiness per change for approvers (advisory: approval is never blocked by it).
  const kitOf = (c: ChangeRow['c']) => readinessOf(linesOfChange(md, c));
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

  type Row = ChangeRow & { id: string };
  const waitCols: Col<Row>[] = [
    { key: 'c', header: 'Change', wrap: true, sort: r => r.c.id, render: r => <span className="cell-2"><Link className="ent-link mono" to={`/changes/${r.c.id}?tab=approvals`} onClick={e => e.stopPropagation()}>{r.c.id}</Link><small>{r.c.title}</small></span> },
    { key: 'cl', header: 'Class', sort: r => r.cls, render: r => <ClassChip cls={r.cls} /> },
    { key: 'r', header: 'Risk', sort: r => r.c.risk, render: r => <RiskChip risk={r.c.risk} /> },
    { key: 'step', header: 'Step', render: r => <span className="cell-2"><span>{r.current!.order} of {r.steps.length} · {roleLabel(r.current!.approverRole)}</span>{r.mine ? <small>your role</small> : null}</span> },
    { key: 'w', header: 'Waiting', align: 'right', sort: r => daysAgo(waitingSince(r.c, r.steps, r.current!)) ?? 0, render: r => { const w = daysAgo(waitingSince(r.c, r.steps, r.current!)) ?? 0; return <span className="num" style={{ color: w > 3 ? 'var(--vw-color-amber-700)' : undefined }}>{w === 0 ? 'today' : `${w} d`}</span>; } },
    { key: 'site', header: 'Site', sort: r => siteLabel(r.site), render: r => siteLabel(r.site) },
    { key: 'win', header: 'Window', sort: r => r.start ?? '', render: r => <span className="num">{fmtWhen(r.start)}</span> },
    { key: 'kit', header: 'Kit', render: r => { const k = kitOf(r.c); return k.state === 'Not needed' ? <Muted>—</Muted> : <span title={k.reasons.join('; ') || undefined}><ReadinessChip r={k} short /></span>; } },
    { key: 'd', header: 'Decision', align: 'right', render: r => (
      <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        <Btn size="xs" variant="filled" onClick={() => setReq({ change: r.c, step: r.current!, decision: 'Approved' })}>Approve</Btn>
        <Btn size="xs" variant="danger-subtle" onClick={() => setReq({ change: r.c, step: r.current!, decision: 'Rejected' })}>Reject</Btn>
      </span>
    ) },
  ];

  return (
    <>
      <Panel title="Waiting for a decision" icon={Gavel} count={mine.length} sub={`${mine.filter(r => r.mine).length} for your role · ${mine.length} in all. The next step of every submitted change, yours first. Steps are decided in order; each one shows here when the step before it is approved. With the full-access profile you may decide for another role; the decision records that you acted for it.`} flush>
        <DataTable<Row> rows={mine.map(r => ({ ...r, id: r.c.id }))} cols={waitCols} onRow={r => navigate(`/changes/${r.c.id}?tab=approvals`)} pageSize={25}
          empty={<Empty icon={ClipboardCheck} title="Nothing is waiting for a decision">Steps appear here when a change is submitted.</Empty>} />
      </Panel>

      <Panel title={`Change board agenda · ${meetingLabel}`} icon={CalendarClock} count={agenda.length} flush
        sub="Normal changes go to the weekly change board (assumed Thursdays at 10:00). The agenda lists normal changes submitted and not yet decided. Standard changes never go to the board; emergency changes go to the emergency board below."
        actions={<><span className="vw-label">Group by</span><Seg<Group> size="sm" value={group} onChange={setGroup} options={[{ id: 'Site', label: 'Site' }, { id: 'Risk', label: 'Risk' }, { id: 'Project', label: 'Project' }]} /></>}>
        {agenda.length === 0 ? <Empty icon={CalendarClock} title="No normal change is due at this board">Submitted normal changes appear here.</Empty> : (
          <div className="dt-scroll">
            <table className="nst-table dt-table">
              <thead><tr><th>Change</th><th>Risk</th><th>Status</th><th>Next step</th><th>Window</th><th>Work order</th><th>Requester</th></tr></thead>
              <tbody>{groups.map(([g, list]) => [
                <tr key={`g-${g}`}><td colSpan={7} style={{ background: 'var(--vw-color-slate-50)' }}><span className="strong">{g}</span> <Muted size="xs">· {list.length}</Muted></td></tr>,
                ...list.map(r => (
                  <tr key={r.c.id} className="is-click" onClick={() => navigate(`/changes/${r.c.id}`)}>
                    <td className="is-wrap"><span className="cell-2"><Link className="ent-link mono" to={`/changes/${r.c.id}`} onClick={e => e.stopPropagation()}>{r.c.id}</Link><small>{r.c.title}</small></span></td>
                    <td><RiskChip risk={r.c.risk} /></td>
                    <td><StatusChip status={r.c.status} /></td>
                    <td className="is-wrap">{r.current ? <span className="cell-2"><span>{roleLabel(r.current.approverRole)}</span><small>{peopleFor(r.current.approverRole).map(p => p.name).join(', ') || 'nobody holds this role'}</small></span> : '—'}</td>
                    <td><span className="num">{fmtWhen(r.start)}</span></td>
                    <td>{r.wo ? <Link className="ent-link mono" to={`/delivery/work-orders/${r.wo.id}`} onClick={e => e.stopPropagation()}>{r.wo.id}</Link> : <Muted>none</Muted>}</td>
                    <td>{r.c.requestedBy}</td>
                  </tr>
                )),
              ])}</tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid g-2">
        <Panel title="Emergency board" icon={Siren} count={emergency.length} sub="On demand. Emergency changes skip the weekly board. The emergency board decides them as soon as they are raised; the work can start once approved.">
          {emergency.length === 0 ? <Empty icon={Siren} title="No emergency change is waiting for a decision" /> : (
            <RowList rows={emergency} right={r => <StatusChip status={r.c.status} />} />
          )}
        </Panel>
        <Panel title="Emergency changes awaiting review" icon={ShieldAlert} count={reviewDue.length} sub="A review is mandatory after every emergency change. Open the change and record it on the Review tab to close it.">
          {reviewDue.length === 0 ? <Empty icon={ShieldAlert} title="Every emergency change has been reviewed" /> : (
            <RowList rows={reviewDue} right={r => <Btn size="xs" onClick={() => navigate(`/changes/${r.c.id}?tab=review`)}>Record review</Btn>} />
          )}
        </Panel>
      </div>

      <DecideModal req={req} onClose={() => setReq(null)} />
    </>
  );
}

function RowList({ rows, right }: { rows: ChangeRow[]; right: (r: ChangeRow) => ReactNode }) {
  return (
    <div className="col" style={{ gap: 0 }}>
      {rows.map((r, i) => (
        <div key={r.c.id} className="row between" style={{ gap: 12, padding: '8px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
          <span className="cell-2" style={{ minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}><Link className="ent-link mono" to={`/changes/${r.c.id}`}>{r.c.id}</Link> {r.c.title}</span>
            <small className="vw-label">{siteLabel(r.site)} · {r.start ? fmtWhen(r.start) : 'no window'} · {r.c.requestedBy}</small>
          </span>
          {right(r)}
        </div>
      ))}
    </div>
  );
}
