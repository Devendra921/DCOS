/* Build family views: site picker, Requirements blocks, Power step panel and plan pack sections, chosen by plan type. */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, GitBranch, MapPin, Network, Plug, TrendingUp, Trophy, Wrench, Zap } from 'lucide-react';
import { Chip, Empty, Panel } from '../../../../../ops/ui/kit';
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
  if (!a) return <Panel><Empty icon={MapPin} title="Not available">Not available for this plan.</Empty></Panel>;
  if (plan.scope === 'new-dc') return (
    <div className="col" style={{ gap: 16 }}>
      <Panel icon={MapPin} title={a.feasibility ? `Site feasibility · ${a.feasibility.candidate.name}` : 'Site feasibility'}>{a.feasibility ? <FeasibilityTable f={a.feasibility} /> : <span className="vw-label">No site facts recorded.</span>}</Panel>
      {(a.candidates?.length ?? 0) > 0 && <Panel icon={Trophy} title="Candidate scorecard" actions={<span style={muted}>{a.candidates!.length} plot{a.candidates!.length === 1 ? '' : 's'}</span>}><CandidateScorecard scores={a.candidates!} weights={scoreWeights(ev.params)} /></Panel>}
    </div>
  );
  if (plan.scope === 'expansion') return a.campus ? (
    <Panel icon={Zap} title={`Campus intake · ${a.campus.campus.campus.name}`}><CampusTable k={a.campus} />{(a.shared?.length ?? 0) > 0 && <div style={{ ...muted, marginTop: 6 }}>Shared with the campus (not bought): {a.shared!.map(s => `${s.item}: ${s.note}`).join('; ')}.</div>}</Panel>
  ) : <Panel><Empty icon={Zap} title="Campus check pending">The campus check runs when the platform data has loaded.</Empty></Panel>;
  if (plan.scope === 'portfolio') return a.portfolio ? (
    <div className="col" style={{ gap: 16 }}>
      <Panel icon={TrendingUp} title="Demand in the region"><DemandTable m={a.portfolio} /></Panel>
      <Panel icon={GitBranch} title="Allocation" actions={<span style={muted}>{kwText(a.portfolio.totals.allocatedKw)} · {fmtUsd(a.portfolio.totals.capexUsd)}</span>}>{a.portfolio.checks.length ? <AllocationTable m={a.portfolio} /> : <span className="vw-label">No allocation accepted yet.</span>}{a.portfolio.gaps.length > 0 && <div className="note note--bad" style={{ marginTop: 8 }}><div>Gaps: {a.portfolio.gaps.map(g => `${g.year}: ${kwText(g.kw)} (${g.reason})`).join('; ')}</div></div>}</Panel>
      <Panel icon={Network} title="Interconnect"><DciTable m={a.portfolio} /></Panel>
    </div>
  ) : <Panel><Empty icon={GitBranch} title="Allocation pending">The allocation is worked out when the platform data has loaded.</Empty></Panel>;
  if (plan.scope === 'edge') return a.edge?.sites.length ? (
    <div className="col" style={{ gap: 16 }}>
      <Panel icon={Plug} title="Sites and power variants" count={a.edge.sites.length} actions={<span style={muted}>{a.edge.groups.map(g => `${g.sites.length} × ${g.variant.label}`).join(', ')}</span>}><EdgeSiteTable a={a.edge} /></Panel>
      <Panel icon={TrendingUp} title="Load per site"><EdgeLadderTable rows={a.edgeLadder ?? []} /></Panel>
    </div>
  ) : <Panel><Empty icon={MapPin} title="No sites chosen yet" /></Panel>;
  return null;
}

/** Plan pack: acceptance tests per phase or per site, site work orders, or the child plans of a portfolio. */
export function CommissioningSection({ plan, ev, data, template, benchmarks }: PlanViewProps) {
  const init = useMemo(() => buildInitiation(plan, ev, template, buildBom(plan, ev, benchmarks)), [plan, ev, template, benchmarks]);
  if (plan.scope === 'portfolio') {
    const kids = (data.plannerPlans ?? []).filter(k => k.parentPlanId === plan.id);
    return (
      <Panel flush icon={GitBranch} title="Child plans" actions={<span style={muted}>{kids.length ? `${kids.filter(k => k.status === 'Completed').length} of ${kids.length} completed` : 'Created on approval'}</span>}
        foot={<span style={muted}>Each child plan sizes, tests and commissions its own capacity.</span>}>
        <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
          <thead><tr><th>Plan</th><th>Type</th><th className="is-right">IT capacity</th><th>Live</th><th className="is-right">Budget envelope</th><th>Status</th></tr></thead>
          <tbody>{kids.length ? kids.map(k => <tr key={k.id}><td><span className="cell-2"><span className="strong">{k.title}</span><small><Link to={`/planning/plans/${k.id}`}>{k.plnId}</Link></small></span></td><td>{k.scope}</td><td className="is-right num">{kwText(k.designPowerKw)}</td><td className="num">{dayText(k.targetGoLive)}</td><td className="is-right num">{fmtUsd(Number(k.params.budgetEnvelopeUsd ?? 0))}</td><td><Chip tone={k.status === 'Completed' ? 'success' : 'info'} dot>{k.status}</Chip></td></tr>)
            : (init.childPlans ?? []).map(c => <tr key={c.rowId}><td><span className="strong">{c.title}</span></td><td>{c.scope}</td><td className="is-right num">{kwText(c.itKw)}</td><td className="num">{dayText(c.goLive)}</td><td className="is-right num">{fmtUsd(c.budget)}</td><td><Chip tone="neutral" dot>On approval</Chip></td></tr>)}</tbody>
        </table></div></div>
      </Panel>
    );
  }
  const atps = init.atps ?? [];
  const created = (data.atps ?? []).filter(t => t.plannerPlanId === plan.id);
  const byPhase = [...new Set(atps.map(x => x.phaseName ?? 'Go-live'))];
  return (
    <div className="col" style={{ gap: 16 }}>
      <Panel flush icon={ClipboardCheck} title="Acceptance tests" count={atps.length} actions={<span style={muted}>{created.length ? `${created.filter(t => t.status === 'Accepted').length} of ${created.length} accepted` : `${atps.length} created on execution`}</span>}
        foot={<span style={muted}>{plan.scope === 'edge' ? 'Each site takes service only when its site acceptance test is accepted.' : 'Each phase goes live only when its L5 integrated systems test is accepted.'}</span>}>
        {!atps.length ? <Empty icon={ClipboardCheck} title="No acceptance tests">No checklist templates found for this plan type.</Empty> : byPhase.map(ph => (
          <div key={ph}>
            <div className="strong" style={{ padding: '10px 16px 4px' }}>{ph}</div>
            <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
              <thead><tr><th>Test</th><th>System</th><th>Level</th><th>Steps</th><th>Project</th></tr></thead>
              <tbody>{atps.filter(x => (x.phaseName ?? 'Go-live') === ph).map(x => <tr key={x.uid}><td><span className="strong">{x.name}</span></td><td>{x.system}</td><td><Chip tone={x.level === 'L5 IST' ? 'warning' : 'neutral'} size="xs">{x.level}</Chip></td><td className="is-wrap"><span className="vw-label">{x.steps.map(s => s.description).join('; ')}</span></td><td>{init.projects.find(p => p.uid === x.projectUid)?.name.split(' — ').slice(-1)[0] ?? '—'}</td></tr>)}</tbody>
            </table></div></div>
          </div>
        ))}
      </Panel>
      {(init.workOrders?.length ?? 0) > 0 && (
        <Panel flush icon={Wrench} title="Site work orders" count={init.workOrders!.length} actions={<span style={muted}>started on execution</span>}>
          <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
            <thead><tr><th>Work order</th><th>Process</th><th>From</th><th>To</th></tr></thead>
            <tbody>{init.workOrders!.map(w => <tr key={w.name}><td><span className="strong">{w.name}</span></td><td>{w.process}</td><td className="num">{dayText(w.start)}</td><td className="num">{dayText(w.end)}</td></tr>)}</tbody>
          </table></div></div>
        </Panel>
      )}
    </div>
  );
}
