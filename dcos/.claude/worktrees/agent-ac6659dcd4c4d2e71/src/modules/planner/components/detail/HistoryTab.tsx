/* History tab: revisions of the plan, every approval round with its outcome, and the audit trail
   (who did what, when, with the old → new values). */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { VwCard, VwChip, fmtDate } from '../../../../shared/components/ux';
import type * as T from '../../../../mock/data/types';
import { fmtUsd } from '../../lib/engine';
import * as G from '../../lib/governance';
import { usePlanAudit, usePlans } from '../../lib/usePlanner';
import { StatusChip } from '../kit';
import { DECISION_TONE, Muted, type PlanView } from './shared';

const OUTCOME_TONE = { Approved: 'success', Rejected: 'error', Withdrawn: 'neutral', Superseded: 'neutral' } as const;
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function Steps({ approvals }: { approvals: T.PlannerApproval[] }) {
  return (
    <div className="nst-table-wrap">
      <table className="nst-table">
        <thead><tr><th>#</th><th>Step</th><th>Role</th><th>Decision</th><th>By</th><th>When</th><th style={{ whiteSpace: 'normal' }}>Reason or conditions</th></tr></thead>
        <tbody>
          {G.orderedSteps(approvals).map((a, i) => (
            <tr key={a.step}>
              <td>{a.order ?? i + 1}</td><td>{a.step}</td><td>{G.roleOf(a.role)}</td>
              <td><VwChip variant={DECISION_TONE[a.decision]}>{a.decision}</VwChip></td>
              <td>{a.person ?? '—'}{a.onBehalfOf ? ` (for ${a.onBehalfOf})` : ''}</td><td>{when(a.at)}</td>
              <td style={{ whiteSpace: 'normal', minWidth: 200 }}>{a.reason ?? a.conditions ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HistoryTab({ v }: { v: PlanView }) {
  const { plan } = v;
  const events = usePlanAudit(plan.id);
  const plans = usePlans();
  const chain = useMemo(() => {
    const byId = new Map(plans.map(p => [p.id, p]));
    let root = plan; const seen = new Set<string>();
    while (root.revisionOf && byId.get(root.revisionOf) && !seen.has(root.id)) { seen.add(root.id); root = byId.get(root.revisionOf)!; }
    const out: T.PlannerPlan[] = [root];
    for (let cur = root; ;) { const nx = plans.find(p => p.revisionOf === cur.id); if (!nx || out.includes(nx)) break; out.push(nx); cur = nx; }
    return out;
  }, [plans, plan]);
  const rounds: (T.PlannerApprovalRound & { current?: boolean })[] = [
    ...(plan.approvals.length ? [{ round: G.currentRound(plan), submittedAt: plan.submittedAt ?? plan.updatedAt, submittedBy: plan.submittedBy ?? plan.requestedBy, approvals: plan.approvals, outcome: (plan.status === 'Rejected' ? 'Rejected' : plan.status === 'In review' ? 'Withdrawn' : 'Approved') as T.PlannerApprovalRound['outcome'], scenarioId: plan.reviewScenarioId, amountUsd: plan.approvalAmountUsd, band: plan.approvalBand, current: true }] : []),
    ...[...(plan.approvalHistory ?? [])].reverse(),
  ];
  const scnName = (id?: string) => (id ? v.scenarios.find(s => s.scenario.id === id)?.scenario.name ?? id : 'Base case');

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard title="Revisions" extra={<Muted>{chain.length} revision(s)</Muted>}>
        <div className="vw-flex vw-flex-col vw-gap-xs">
          {chain.map(p => (
            <div key={p.id} className="vw-flex vw-justify-between vw-items-center vw-gap-sm" style={{ borderBottom: '1px solid var(--vw-color-slate-100)', padding: '4px 0' }}>
              <span className="vw-inline-flex vw-items-center vw-gap-sm"><VwChip variant="neutral">Rev {p.revision ?? 'A'}</VwChip>{p.id === plan.id ? <strong>{p.plnId}</strong> : <Link to={`/planning/plans/${p.id}`}>{p.plnId}</Link>}<Muted size="xs">{p.title}</Muted></span>
              <span className="vw-inline-flex vw-items-center vw-gap-sm">{p.baseline && <Muted size="xs">baseline {fmtUsd(p.baseline.capexTotal)} · {fmtDate(p.baseline.at)}</Muted>}{p.supersededBy ? <VwChip variant="neutral">Superseded by {p.supersededBy}</VwChip> : <StatusChip status={p.status} />}</span>
            </div>
          ))}
        </div>
      </VwCard>

      <VwCard title="Approval rounds" extra={<Muted>{rounds.length} round(s)</Muted>}>
        {!rounds.length && <div className="vw-card-description">The plan has not been submitted yet.</div>}
        <div className="vw-flex vw-flex-col vw-gap-md">
          {rounds.map(r => (
            <div key={`${r.round}-${r.submittedAt}`} className="vw-flex vw-flex-col vw-gap-xs">
              <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm vw-wrap">
                <span style={{ fontWeight: 600 }}>Round {r.round}{r.current ? ' (current)' : ''}</span>
                <span className="vw-inline-flex vw-gap-xs vw-items-center vw-wrap">
                  <Muted size="xs">submitted {when(r.submittedAt)} by {r.submittedBy} · {scnName(r.scenarioId)}{r.amountUsd !== undefined ? ` · ${fmtUsd(r.amountUsd)}` : ''}{r.band ? ` · ${r.band}` : ''}</Muted>
                  {r.current && plan.status === 'In review' ? <VwChip variant="warning">Open</VwChip> : <VwChip variant={OUTCOME_TONE[r.outcome]}>{r.outcome}</VwChip>}
                </span>
              </div>
              <Steps approvals={r.approvals} />
            </div>
          ))}
        </div>
      </VwCard>

      <VwCard title="Audit trail" extra={<Muted>{events.length} event(s)</Muted>}>
        {!events.length && <div className="vw-card-description">No recorded actions yet.</div>}
        {events.length > 0 && (
          <div className="nst-table-wrap">
            <table className="nst-table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th style={{ whiteSpace: 'normal' }}>What changed</th></tr></thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id}>
                    <td>{when(e.timestamp)}</td><td>{e.actorName}</td><td>{e.action}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 280 }}>
                      <div>{e.summary}</div>
                      {(e.changes ?? []).length > 0 && <div className="vw-flex vw-flex-col" style={{ marginTop: 2 }}>{e.changes!.slice(0, 12).map((c, i) => <Muted key={i} size="xs">{c.field}: {String(c.from ?? '—')} → {String(c.to ?? '—')}{c.source ? ` · ${c.source}` : ''}</Muted>)}{e.changes!.length > 12 && <Muted size="xs">and {e.changes!.length - 12} more</Muted>}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </VwCard>
    </div>
  );
}
