/* Build family views: site picker, Requirements blocks, Power step panel and plan pack sections, chosen by plan type. */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { VwCard, VwChip } from '../../../../../shared/components/ux';
import { fmtUsd } from '../../../lib/engine';
import { buildBom, buildInitiation } from '../../../lib/outputs';
import { scoreWeights } from '../../../lib/buildSite';
import { DIMENSION_PANEL } from '../../wizard/DimensionPanels';
import { SubTitle } from '../../wizard/ParamField';
import { SitePicker } from '../../wizard/SitePicker';
import type { StepProps } from '../../wizard/wizardModel';
import type { PlanViewProps } from '../types';
import { analysisOf, dayText, kwText } from './model';
import { CandidateScorecard, CandidatesBlock, FeasibilityTable } from './NewDcBlocks';
import { CampusBlock, CampusPicker, CampusTable } from './ExpansionBlocks';
import { AllocationBlock, AllocationTable, DciTable, DemandTable, RegionPicker } from './PortfolioBlocks';
import { EdgeLadderTable, EdgeSitesBlock, EdgeSiteTable } from './EdgeBlocks';

const muted = { fontSize: 12, color: 'var(--vw-color-slate-500)' } as const;

export function BuildSitePicker(p: StepProps) {
  if (p.draft.scope === 'expansion') return <CampusPicker {...p} />;
  if (p.draft.scope === 'portfolio') return <RegionPicker {...p} />;
  return <SitePicker {...p} />;
}

export function BuildRequirements(p: StepProps) {
  switch (p.draft.scope) {
    case 'new-dc': return <CandidatesBlock {...p} />;
    case 'expansion': return <CampusBlock {...p} />;
    case 'portfolio': return <AllocationBlock {...p} />;
    case 'edge': return <EdgeSitesBlock {...p} />;
    default: return null;
  }
}

/** Power step: the generic power chain plus what the site build adds (site facts, campus intake, per-site plant, allocation headroom). */
export function BuildPowerPanel(p: StepProps) {
  const Generic = DIMENSION_PANEL.power;
  const a = analysisOf(p.ev);
  return (<>
    {p.draft.scope !== 'portfolio' && <Generic {...p} />}
    {p.draft.scope === 'new-dc' && a?.feasibility && (<><SubTitle>Site facts against the design · {a.feasibility.candidate.name}</SubTitle><FeasibilityTable f={a.feasibility} /></>)}
    {p.draft.scope === 'new-dc' && !a?.feasibility && <div style={muted}>Record the site facts on Requirements to check the grid offer and energisation.</div>}
    {p.draft.scope === 'expansion' && a?.campus && (<><SubTitle>Campus intake per phase</SubTitle><CampusTable k={a.campus} /></>)}
    {p.draft.scope === 'edge' && a?.edge?.sites.length ? (<><SubTitle>Plant per site</SubTitle><EdgeSiteTable a={a.edge} /></>) : null}
    {p.draft.scope === 'portfolio' && a?.portfolio && (<><SubTitle>Allocation against real headroom</SubTitle>{a.portfolio.checks.length ? <AllocationTable m={a.portfolio} /> : <div style={muted}>No allocation yet.</div>}</>)}
  </>);
}

/** Plan pack: the site side of the plan for each build type. */
export function SitePlanSection({ plan, ev }: PlanViewProps) {
  const a = analysisOf(ev);
  if (!a) return <VwCard><div className="vw-card-description">Not available for this plan.</div></VwCard>;
  if (plan.scope === 'new-dc') return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard title={a.feasibility ? `Site feasibility · ${a.feasibility.candidate.name}` : 'Site feasibility'}>{a.feasibility ? <FeasibilityTable f={a.feasibility} /> : <div className="vw-card-description">No site facts recorded.</div>}</VwCard>
      {(a.candidates?.length ?? 0) > 0 && <VwCard title="Candidate scorecard" extra={<span style={muted}>{a.candidates!.length} plot{a.candidates!.length === 1 ? '' : 's'}</span>}><CandidateScorecard scores={a.candidates!} weights={scoreWeights(ev.params)} /></VwCard>}
    </div>
  );
  if (plan.scope === 'expansion') return a.campus ? (
    <VwCard title={`Campus intake · ${a.campus.campus.campus.name}`}><CampusTable k={a.campus} />{(a.shared?.length ?? 0) > 0 && <div style={{ ...muted, marginTop: 6 }}>Shared with the campus (not bought): {a.shared!.map(s => `${s.item}: ${s.note}`).join('; ')}.</div>}</VwCard>
  ) : <VwCard><div className="vw-card-description">The campus check runs when the platform data has loaded.</div></VwCard>;
  if (plan.scope === 'portfolio') return a.portfolio ? (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard title="Demand in the region"><DemandTable m={a.portfolio} /></VwCard>
      <VwCard title="Allocation" extra={<span style={muted}>{kwText(a.portfolio.totals.allocatedKw)} · {fmtUsd(a.portfolio.totals.capexUsd)}</span>}>{a.portfolio.checks.length ? <AllocationTable m={a.portfolio} /> : <div className="vw-card-description">No allocation accepted yet.</div>}{a.portfolio.gaps.length > 0 && <div style={{ fontSize: 12, color: 'var(--vw-color-red-600)', marginTop: 6 }}>Gaps: {a.portfolio.gaps.map(g => `${g.year}: ${kwText(g.kw)} (${g.reason})`).join('; ')}</div>}</VwCard>
      <VwCard title="Interconnect"><DciTable m={a.portfolio} /></VwCard>
    </div>
  ) : <VwCard><div className="vw-card-description">The allocation is worked out when the platform data has loaded.</div></VwCard>;
  if (plan.scope === 'edge') return a.edge?.sites.length ? (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard title="Sites and power variants" extra={<span style={muted}>{a.edge.sites.length} sites · {a.edge.groups.map(g => `${g.sites.length} × ${g.variant.label}`).join(', ')}</span>}><EdgeSiteTable a={a.edge} /></VwCard>
      <VwCard title="Load per site"><EdgeLadderTable rows={a.edgeLadder ?? []} /></VwCard>
    </div>
  ) : <VwCard><div className="vw-card-description">No sites chosen yet.</div></VwCard>;
  return null;
}

/** Plan pack: acceptance tests per phase or per site, site work orders, or the child plans of a portfolio. */
export function CommissioningSection({ plan, ev, data, template, benchmarks }: PlanViewProps) {
  const init = useMemo(() => buildInitiation(plan, ev, template, buildBom(plan, ev, benchmarks)), [plan, ev, template, benchmarks]);
  if (plan.scope === 'portfolio') {
    const kids = (data.plannerPlans ?? []).filter(k => k.parentPlanId === plan.id);
    return (
      <VwCard title="Child plans" extra={<span style={muted}>{kids.length ? `${kids.filter(k => k.status === 'Completed').length} of ${kids.length} completed` : 'Created on approval'}</span>}>
        <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
          <thead><tr><th>Plan</th><th>Type</th><th style={{ textAlign: 'right' }}>IT capacity</th><th>Live</th><th style={{ textAlign: 'right' }}>Budget envelope</th><th>Status</th></tr></thead>
          <tbody>{kids.length ? kids.map(k => <tr key={k.id}><td><Link to={`/planning/plans/${k.id}`}>{k.plnId}</Link> {k.title}</td><td>{k.scope}</td><td style={{ textAlign: 'right' }}>{kwText(k.designPowerKw)}</td><td>{dayText(k.targetGoLive)}</td><td style={{ textAlign: 'right' }}>{fmtUsd(Number(k.params.budgetEnvelopeUsd ?? 0))}</td><td><VwChip variant={k.status === 'Completed' ? 'success' : 'info'}>{k.status}</VwChip></td></tr>)
            : (init.childPlans ?? []).map(c => <tr key={c.rowId}><td>{c.title}</td><td>{c.scope}</td><td style={{ textAlign: 'right' }}>{kwText(c.itKw)}</td><td>{dayText(c.goLive)}</td><td style={{ textAlign: 'right' }}>{fmtUsd(c.budget)}</td><td><VwChip variant="neutral">On approval</VwChip></td></tr>)}</tbody>
        </table></div>
        <div style={{ ...muted, marginTop: 6 }}>Each child plan sizes, tests and commissions its own capacity.</div>
      </VwCard>
    );
  }
  const atps = init.atps ?? [];
  const created = (data.atps ?? []).filter(t => t.plannerPlanId === plan.id);
  const byPhase = [...new Set(atps.map(x => x.phaseName ?? 'Go-live'))];
  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard title="Acceptance tests" extra={<span style={muted}>{created.length ? `${created.filter(t => t.status === 'Accepted').length} of ${created.length} accepted` : `${atps.length} created on execution`}</span>}>
        {!atps.length ? <div className="vw-card-description">No checklist templates found for this plan type.</div> : byPhase.map(ph => (
          <div key={ph} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0' }}>{ph}</div>
            <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
              <thead><tr><th>Test</th><th>System</th><th>Level</th><th>Steps</th><th>Project</th></tr></thead>
              <tbody>{atps.filter(x => (x.phaseName ?? 'Go-live') === ph).map(x => <tr key={x.uid}><td>{x.name}</td><td>{x.system}</td><td><VwChip variant={x.level === 'L5 IST' ? 'warning' : 'neutral'}>{x.level}</VwChip></td><td style={{ whiteSpace: 'normal' }}>{x.steps.map(s => s.description).join('; ')}</td><td>{init.projects.find(p => p.uid === x.projectUid)?.name.split(' — ').slice(-1)[0] ?? '—'}</td></tr>)}</tbody>
            </table></div>
          </div>
        ))}
        <div style={muted}>{plan.scope === 'edge' ? 'Each site takes service only when its site acceptance test is accepted.' : 'Each phase goes live only when its L5 integrated systems test is accepted.'}</div>
      </VwCard>
      {(init.workOrders?.length ?? 0) > 0 && (
        <VwCard title="Site work orders" extra={<span style={muted}>{init.workOrders!.length} · started on execution</span>}>
          <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
            <thead><tr><th>Work order</th><th>Process</th><th>From</th><th>To</th></tr></thead>
            <tbody>{init.workOrders!.map(w => <tr key={w.name}><td>{w.name}</td><td>{w.process}</td><td>{dayText(w.start)}</td><td>{dayText(w.end)}</td></tr>)}</tbody>
          </table></div>
        </VwCard>
      )}
    </div>
  );
}
