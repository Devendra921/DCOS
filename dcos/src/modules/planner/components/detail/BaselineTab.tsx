/* Baseline tab: the figures frozen at final approval, the plan as it evaluates now and what was
   actually spent and delivered; for a revision, what it changes against the baseline it revises. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarRange, GitCompare, Lock, Scale, SlidersHorizontal } from 'lucide-react';
import { fmtDate } from '../../../../shared/components/ux';
import { Chip, Panel } from '../../../../ops/ui/kit';
import { fmtKw, fmtUsd } from '../../lib/engine';
import * as G from '../../lib/governance';
import { deliveryView } from '../../lib/closeout';
import type { PlannerData } from '../../lib/plannerData';
import { usePlans } from '../../lib/usePlanner';
import { KvList, Muted, paramLabel, type PlanView } from './shared';

function DeltaTable({ rows }: { rows: G.DeltaRow[] }) {
  const changed = rows.filter(r => r.changed);
  if (!changed.length) return <Muted>No difference.</Muted>;
  return (
    <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
      <thead><tr><th>What</th><th className="is-right num">Baseline</th><th className="is-right num">Now</th></tr></thead>
      <tbody>{changed.map(r => <tr key={r.label}><td>{r.label}</td><td className="is-right num">{r.before}</td><td className="is-right num" style={{ fontWeight: 600 }}>{r.after}</td></tr>)}</tbody>
    </table></div></div>
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
    <div className="col" style={{ gap: 16 }}>
      {parent?.baseline && (
        <Panel icon={GitCompare} title={`Revision ${plan.revision ?? ''}: changes against ${parent.plnId}`} actions={<Link to={`/planning/plans/${parent.id}`}>Open {parent.plnId}</Link>}>
          <Muted>The baseline of {parent.plnId} (approved {fmtDate(parent.baseline.at)}) compared with this revision as it stands. The revision gets its own approval round; when it is approved it supersedes {parent.plnId} and its holds.</Muted>
          <div style={{ marginTop: 12 }}><DeltaTable rows={G.baselineDelta(parent.baseline, plan, v.ev, label)} /></div>
        </Panel>
      )}
      {!b && <div className="note note--info"><Lock size={16} /><div>The baseline is frozen at final approval: the approved scenario, its parameters, CapEx, OpEx, bill of materials, schedule, template version and benchmarks. {plan.status === 'Approved' ? 'This plan was approved before baselines were kept; it is frozen when the build starts.' : ''}</div></div>}
      {b && (
        <>
          {drift && <div className="note note--warn"><AlertTriangle size={16} /><div>The template changed since approval (v{drift.from} → v{drift.to}). The plan keeps the v{drift.from} figures below; execution uses them, not the new template.</div></div>}
          <div className="grid g-2">
            <Panel icon={Lock} title="Frozen at approval" sub={`${fmtDate(b.at)} by ${b.by}`}>
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
            </Panel>
            <Panel icon={Scale} title="Baseline, now and actual">
              <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
                <thead><tr><th>Figure</th><th className="is-right num">Baseline</th><th className="is-right num">Approved figures today</th><th className="is-right num">Actual</th></tr></thead>
                <tbody>
                  <tr><td>CapEx</td><td className="is-right num">{fmtUsd(b.capexTotal)}</td><td className="is-right num">{v.approved ? fmtUsd(v.approved.estimate.capexTotal) : '—'}</td><td className="is-right num">{d.actualSpend ? fmtUsd(d.actualSpend) : '—'}</td></tr>
                  <tr><td>OpEx per month</td><td className="is-right num">{fmtUsd(b.opexMonthly)}</td><td className="is-right num">{v.approved ? fmtUsd(v.approved.estimate.opexMonthly) : '—'}</td><td className="is-right num">{plan.closeout?.actualOpexMonthly ? fmtUsd(plan.closeout.actualOpexMonthly) : '—'}</td></tr>
                  <tr><td>IT capacity</td><td className="is-right num">{fmtKw(b.designPowerKw)}</td><td className="is-right num">{fmtKw(plan.designPowerKw)}</td><td className="is-right num">{plan.closeout ? `${fmtKw(plan.closeout.deliveredKw)}${plan.closeout.measuredKw !== undefined ? ` (${fmtKw(plan.closeout.measuredKw)} measured)` : ''}` : '—'}</td></tr>
                  <tr><td>Go-live</td><td className="is-right num">{b.targetGoLive.slice(0, 10)}</td><td className="is-right num">{plan.targetGoLive.slice(0, 10)}</td><td className="is-right num">{plan.closeout?.completedAt.slice(0, 10) ?? '—'}</td></tr>
                </tbody>
              </table></div></div>
              <div style={{ marginTop: 10 }}><Muted size="xs">"Approved figures today" re-evaluates the frozen parameters against today's site data. Actual is project spend plus purchase-order spend recorded against the plan.</Muted></div>
            </Panel>
          </div>
          <Panel flush icon={CalendarRange} title="Baseline schedule" count={b.schedule.length}>
            <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
              <thead><tr><th>Item</th><th>Phase</th><th>Order by</th><th>Need by</th></tr></thead>
              <tbody>{b.schedule.map((s, i) => <tr key={i}><td>{s.item}</td><td>{s.phase}</td><td>{s.orderBy.slice(0, 10)}</td><td>{s.needBy.slice(0, 10)}</td></tr>)}</tbody>
            </table></div></div>
          </Panel>
          {v.approved && <Panel icon={SlidersHorizontal} title="Parameters: baseline against the plan now"><DeltaTable rows={G.baselineDelta(b, plan, v.ev, label)} /><div style={{ marginTop: 10 }}><Muted size="xs">Compares the frozen parameters with the evaluation on screen ({v.viewScenario ? `scenario ${v.viewScenario.name}` : 'base case'}). Changes after approval need a revision.</Muted></div></Panel>}
          {plan.supersededBy && <Chip tone="neutral">Superseded by {plan.supersededBy}</Chip>}
        </>
      )}
    </div>
  );
}
