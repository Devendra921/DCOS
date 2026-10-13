/* Baseline tab: the figures frozen at final approval, the plan as it evaluates now and what was
   actually spent and delivered; for a revision, what it changes against the baseline it revises. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { VwCard, VwChip, fmtDate } from '../../../../shared/components/ux';
import { fmtKw, fmtUsd } from '../../lib/engine';
import * as G from '../../lib/governance';
import { deliveryView } from '../../lib/closeout';
import type { PlannerData } from '../../lib/plannerData';
import { usePlans } from '../../lib/usePlanner';
import { KvList, Muted, paramLabel, type PlanView } from './shared';

function DeltaTable({ rows }: { rows: G.DeltaRow[] }) {
  const changed = rows.filter(r => r.changed);
  if (!changed.length) return <div className="vw-card-description">No difference.</div>;
  return (
    <div className="nst-table-wrap"><table className="nst-table">
      <thead><tr><th>What</th><th style={{ textAlign: 'right' }}>Baseline</th><th style={{ textAlign: 'right' }}>Now</th></tr></thead>
      <tbody>{changed.map(r => <tr key={r.label}><td>{r.label}</td><td style={{ textAlign: 'right' }}>{r.before}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{r.after}</td></tr>)}</tbody>
    </table></div>
  );
}

export function BaselineTab({ v, data }: { v: PlanView; data: PlannerData }) {
  const { plan } = v;
  const plans = usePlans();
  const parent = plan.revisionOf ? plans.find(p => p.id === plan.revisionOf) : undefined;
  const b = plan.baseline;
  const [nowMs] = useState(() => Date.now());
  const d = useMemo(() => deliveryView(plan, data, nowMs), [plan, data, nowMs]);
  const drift = G.templateDrift(plan, v.ev.resolved?.template);
  const label = (k: string) => paramLabel(v.ev, k);

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      {parent?.baseline && (
        <VwCard title={`Revision ${plan.revision ?? ''}: changes against ${parent.plnId}`} extra={<Link to={`/planning/plans/${parent.id}`}>Open {parent.plnId}</Link>}>
          <Muted>The baseline of {parent.plnId} (approved {fmtDate(parent.baseline.at)}) compared with this revision as it stands. The revision gets its own approval round; when it is approved it supersedes {parent.plnId} and its holds.</Muted>
          <div style={{ marginTop: 8 }}><DeltaTable rows={G.baselineDelta(parent.baseline, plan, v.ev, label)} /></div>
        </VwCard>
      )}
      {!b && <VwCard><div className="vw-card-description">The baseline is frozen at final approval: the approved scenario, its parameters, CapEx, OpEx, bill of materials, schedule, template version and benchmarks. {plan.status === 'Approved' ? 'This plan was approved before baselines were kept; it is frozen when the build starts.' : ''}</div></VwCard>}
      {b && (
        <>
          {drift && <VwCard tone="warning" variant="child"><div className="vw-card-description">The template changed since approval (v{drift.from} → v{drift.to}). The plan keeps the v{drift.from} figures below; execution uses them, not the new template.</div></VwCard>}
          <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <VwCard title="Frozen at approval" extra={<Muted>{fmtDate(b.at)} by {b.by}</Muted>}>
              <KvList items={[
                { label: 'Approved scenario', value: b.scenarioName ?? 'Base case' },
                { label: 'Template', value: `${b.templateId} v${b.templateVersion}` },
                { label: 'IT capacity', value: fmtKw(b.designPowerKw) },
                { label: 'Target go-live', value: fmtDate(b.targetGoLive) },
                { label: 'CapEx (programme budget)', value: fmtUsd(b.capexTotal) },
                { label: 'of which contingency', value: fmtUsd(b.contingencyUsd) },
                { label: 'OpEx per month', value: fmtUsd(b.opexMonthly) },
                { label: 'Bill of materials', value: `${fmtUsd(b.bomTotal)}${b.sourcedTotal !== undefined ? ` · sourced ${fmtUsd(b.sourcedTotal)} · to buy ${fmtUsd(b.buyTotal ?? 0)}` : ''}` },
                { label: 'Rules at approval', value: `${b.hardFails} fail · ${b.softWarns} warn · ${b.readinessPct}% ready` },
                { label: 'Benchmarks frozen', value: b.benchmarks.length },
              ]} />
            </VwCard>
            <VwCard title="Baseline, now and actual">
              <div className="nst-table-wrap"><table className="nst-table">
                <thead><tr><th>Figure</th><th style={{ textAlign: 'right' }}>Baseline</th><th style={{ textAlign: 'right' }}>Approved figures today</th><th style={{ textAlign: 'right' }}>Actual</th></tr></thead>
                <tbody>
                  <tr><td>CapEx</td><td style={{ textAlign: 'right' }}>{fmtUsd(b.capexTotal)}</td><td style={{ textAlign: 'right' }}>{v.approved ? fmtUsd(v.approved.estimate.capexTotal) : '—'}</td><td style={{ textAlign: 'right' }}>{d.actualSpend ? fmtUsd(d.actualSpend) : '—'}</td></tr>
                  <tr><td>OpEx per month</td><td style={{ textAlign: 'right' }}>{fmtUsd(b.opexMonthly)}</td><td style={{ textAlign: 'right' }}>{v.approved ? fmtUsd(v.approved.estimate.opexMonthly) : '—'}</td><td style={{ textAlign: 'right' }}>{plan.closeout?.actualOpexMonthly ? fmtUsd(plan.closeout.actualOpexMonthly) : '—'}</td></tr>
                  <tr><td>IT capacity</td><td style={{ textAlign: 'right' }}>{fmtKw(b.designPowerKw)}</td><td style={{ textAlign: 'right' }}>{fmtKw(plan.designPowerKw)}</td><td style={{ textAlign: 'right' }}>{plan.closeout ? `${fmtKw(plan.closeout.deliveredKw)}${plan.closeout.measuredKw !== undefined ? ` (${fmtKw(plan.closeout.measuredKw)} measured)` : ''}` : '—'}</td></tr>
                  <tr><td>Go-live</td><td style={{ textAlign: 'right' }}>{b.targetGoLive.slice(0, 10)}</td><td style={{ textAlign: 'right' }}>{plan.targetGoLive.slice(0, 10)}</td><td style={{ textAlign: 'right' }}>{plan.closeout?.completedAt.slice(0, 10) ?? '—'}</td></tr>
                </tbody>
              </table></div>
              <div style={{ marginTop: 6 }}><Muted size="xs">"Approved figures today" re-evaluates the frozen parameters against today's site data. Actual is project spend plus purchase-order spend recorded against the plan.</Muted></div>
            </VwCard>
          </div>
          <VwCard title="Baseline schedule" extra={<Muted>{b.schedule.length} item(s)</Muted>}>
            <div className="nst-table-wrap"><table className="nst-table">
              <thead><tr><th>Item</th><th>Phase</th><th>Order by</th><th>Need by</th></tr></thead>
              <tbody>{b.schedule.map((s, i) => <tr key={i}><td>{s.item}</td><td>{s.phase}</td><td>{s.orderBy.slice(0, 10)}</td><td>{s.needBy.slice(0, 10)}</td></tr>)}</tbody>
            </table></div>
          </VwCard>
          {v.approved && <VwCard title="Parameters: baseline against the plan now"><DeltaTable rows={G.baselineDelta(b, plan, v.ev, label)} /><div style={{ marginTop: 6 }}><Muted size="xs">Compares the frozen parameters with the evaluation on screen ({v.viewScenario ? `scenario ${v.viewScenario.name}` : 'base case'}). Changes after approval need a revision.</Muted></div></VwCard>}
          {plan.supersededBy && <VwChip variant="neutral">Superseded by {plan.supersededBy}</VwChip>}
        </>
      )}
    </div>
  );
}
