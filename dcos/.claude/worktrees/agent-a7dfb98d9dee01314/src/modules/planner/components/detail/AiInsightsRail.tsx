/* AI insights rail — grounded proposals for this plan. Nothing applies without the planner accepting; every decision is recorded. */
import { useMemo, useState } from 'react';
import { App } from 'antd';
import { AIInsightCard, SectionHeader, VwChip } from '../../../../shared/components/ux';
import { fmtUsd, fmtKw } from '../../lib/engine';
import { sizingProposals, phasingProposal, costCalibration } from '../../lib/ai';
import { EvidenceLinks, ProposalCard } from '../kit';
import { monthYear, proposalParamKey, type PlanView } from './shared';

export function AiInsightsRail({ v }: { v: PlanView }) {
  const { plan, ev, actuals, benchmarks, templates, estate, actions } = v;
  const { message } = App.useApp();
  const [decided, setDecided] = useState<Record<string, 'accepted' | 'rejected'>>({});

  const proposals = useMemo(() => sizingProposals(plan, ev, actuals, benchmarks), [plan, ev, actuals, benchmarks]);
  const demandTpl = useMemo(() => {
    const d = templates.filter(t => t.kind === 'demand' && t.demand);
    return d.sort((a, b) => Math.abs(a.demand!.gpuPct - plan.demand.gpuPct) - Math.abs(b.demand!.gpuPct - plan.demand.gpuPct))[0] ?? null;
  }, [templates, plan.demand.gpuPct]);
  // Headroom from the platform records: the site's binding power stage, or the campus intake for an expansion.
  const headroomKw = useMemo(() => {
    if (ev.ctx.campus && plan.scope === 'expansion') return ev.ctx.campus.itHeadroomKw(ev.sizing.pue.value || 1.3);
    return ev.ctx.site ? ev.ctx.site.headroomItKw : undefined;
  }, [ev, plan.scope]);
  const phasing = useMemo(() => phasingProposal(plan, ev, demandTpl, headroomKw), [plan, ev, demandTpl, headroomKw]);
  const cost = useMemo(() => costCalibration(plan, ev, actuals, estate.projects, estate.dataCenters), [plan, ev, actuals, estate.projects, estate.dataCenters]);

  const isApplied = (key: string, value: unknown) => plan.paramSources[key] === 'ai' && plan.params[key] === value;
  const acceptSizing = (title: string, value: number | string) => {
    const key = proposalParamKey(title, value);
    actions.setParam(plan, key, value, 'ai');
    actions.recordFeedback('sizing-assistant', plan.id, true, title);
    setDecided(d => ({ ...d, [title]: 'accepted' }));
    message.success(`${key} set to ${String(value)} (AI proposal)`);
  };
  const rejectSizing = (title: string) => { actions.recordFeedback('sizing-assistant', plan.id, false, title); setDecided(d => ({ ...d, [title]: 'rejected' })); };
  const acceptPhasing = () => {
    if (!phasing) return;
    const density = Math.max(1, Number(ev.params['densityKwPerRack']?.value ?? 12));
    const hallKw = Math.max(1, Number(ev.params['hallDesignKw']?.value ?? 1500));
    const phases = phasing.phases.map((p, i) => ({ id: `P${i + 1}`, name: p.name, goLive: p.goLive, itKw: p.itKw, racks: Math.ceil(p.itKw / density), halls: Math.max(1, Math.ceil(p.itKw / hallKw)), status: 'Planned' as const }));
    actions.patchPlan(plan.id, { phases });
    actions.recordFeedback('phasing-optimiser', plan.id, true);
    setDecided(d => ({ ...d, phasing: 'accepted' }));
    message.success(`${phases.length} phases applied`);
  };
  const rejectPhasing = () => { actions.recordFeedback('phasing-optimiser', plan.id, false); setDecided(d => ({ ...d, phasing: 'rejected' })); };
  const acceptCost = () => {
    if (cost.adjustment === undefined) return;
    actions.setParam(plan, 'capexPerKw', cost.adjustment, 'ai');
    actions.recordFeedback('cost-estimator', plan.id, true);
    setDecided(d => ({ ...d, cost: 'accepted' }));
    message.success(`CapEx per kW set to ${fmtUsd(cost.adjustment)}`);
  };
  const rejectCost = () => { actions.recordFeedback('cost-estimator', plan.id, false); setDecided(d => ({ ...d, cost: 'rejected' })); };

  const visibleProposals = proposals.filter(p => decided[p.title] !== 'rejected');
  const showCost = cost.applies && decided.cost !== 'rejected';
  const nothing = !visibleProposals.length && (!phasing || decided.phasing === 'rejected') && !showCost;

  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <SectionHeader title="AI insights" chip={<VwChip variant="purple">{visibleProposals.length + (phasing ? 1 : 0) + (showCost ? 1 : 0)} grounded</VwChip>} subtitle="Each proposal names the records and benchmarks it used. Only proposals that apply to this plan type are shown. Accept to apply; every decision is recorded." marginBottom={0} />
      {visibleProposals.map(p => (
        <ProposalCard key={p.title} p={p} applied={decided[p.title] === 'accepted' || isApplied(proposalParamKey(p.title, p.value), p.value)} onAccept={() => acceptSizing(p.title, p.value)} onReject={() => rejectSizing(p.title)} />
      ))}
      {phasing && decided.phasing !== 'rejected' && (
        <AIInsightCard
          title="Phasing optimiser"
          confidence={phasing.confidence}
          body={<span>{phasing.reason} <EvidenceLinks items={phasing.evidence} />
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>{phasing.phases.map(p => <li key={p.name}>{p.name}: {fmtKw(p.itKw)} live {monthYear(p.goLive)}</li>)}</ul></span>}
          actionLabel={decided.phasing === 'accepted' ? 'Applied' : `Apply ${phasing.phases.length} phases`}
          onAction={decided.phasing === 'accepted' ? undefined : acceptPhasing}
          sourceLabel={decided.phasing === 'accepted' ? undefined : 'Keep my phases'}
          onSource={decided.phasing === 'accepted' ? undefined : rejectPhasing}
        />
      )}
      {showCost && (
        <AIInsightCard
          title="Cost calibration"
          confidence={cost.confidence}
          body={<span>{cost.verdict} <EvidenceLinks items={cost.evidence} />
            {cost.comparables.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>{cost.comparables.map(c => <li key={c.name}>{c.name}: {fmtUsd(c.capexPerKw)}/kW</li>)}</ul>}</span>}
          actionLabel={cost.adjustment !== undefined ? (decided.cost === 'accepted' ? 'Applied' : `Calibrate to ${fmtUsd(cost.adjustment)}/kW`) : undefined}
          onAction={cost.adjustment !== undefined && decided.cost !== 'accepted' ? acceptCost : undefined}
          sourceLabel={decided.cost === 'accepted' ? undefined : 'Not for this plan'}
          onSource={decided.cost === 'accepted' ? undefined : rejectCost}
        />
      )}
      {nothing && <div className="vw-card-description">No open proposals — every grounded check agrees with the plan.</div>}
    </div>
  );
}
