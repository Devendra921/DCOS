/* Phasing and delivery panel: the phase table, the capacity ladder, the phasing optimiser and the lead-time view. Inputs (contingency, commissioning) live on the dimension step. */
import { useMemo, useState } from 'react';
import { Select } from 'antd';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { AIInsightCard, VwCard, VwChip } from '../../../../shared/components/ux';
import { PlusOutlined, RobotOutlined } from '../../../../shared/icons';
import { fmtKw } from '../../lib/engine';
import { phasingProposal } from '../../lib/ai';
import { LeadTimeGantt, PhaseLadderChart } from '../charts';
import { EvidenceLinks } from '../kit';
import { fmtDate, phaseDerived, type StepProps } from './wizardModel';
import { SubTitle } from './ParamField';
import { PhaseEditor } from './PhaseEditor';

export function PhasingPanel({ draft, patch, ev, templates, estate, actions, singlePhase }: StepProps & { singlePhase?: boolean }) {
  const demandTemplates = useMemo(() => templates.filter(t => t.kind === 'demand' && t.status === 'published'), [templates]);
  const [demandId, setDemandId] = useState<string | undefined>(() => demandTemplates.find(t => t.demand && t.demand.gpuPct === draft.demand.gpuPct)?.id ?? demandTemplates[0]?.id);
  const [decided, setDecided] = useState<'accepted' | 'rejected' | undefined>();
  // Real site headroom (at redundancy, after holds and approved plans) when the baseline is loaded.
  const siteHeadroom = ev?.ctx.site?.headroomItKw;
  const headroom = useMemo(() => { if (siteHeadroom !== undefined) return Math.max(0, siteHeadroom); const dc = estate.dataCenters.find(d => d.id === draft.dataCenterId); if (!dc) return undefined; return Math.max(0, dc.designPowerKw - estate.racks.filter(r => r.dataCenterId === dc.id).reduce((a, r) => a + r.currentPowerKw, 0)); }, [estate, draft.dataCenterId, siteHeadroom]);
  const proposal = useMemo(() => (ev ? phasingProposal(draft, ev, demandTemplates.find(t => t.id === demandId) ?? null, headroom) : null), [draft, ev, demandTemplates, demandId, headroom]);
  const total = draft.phases.reduce((a, p) => a + p.itKw, 0);
  const remainder = draft.designPowerKw - total;
  const sorted = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));

  const add = () => {
    const n = draft.phases.length + 1;
    const last = sorted[sorted.length - 1];
    const goLive = last ? new Date(new Date(last.goLive).getTime() + 365 * 864e5).toISOString() : draft.targetGoLive;
    const itKw = Math.max(0, remainder);
    patch({ phases: [...draft.phases, { id: `PH-${Date.now().toString(36)}`, name: `Phase ${n}`, goLive, itKw, ...phaseDerived(itKw, ev), status: 'Planned' }] });
  };
  const accept = () => { if (!proposal) return; patch({ phases: proposal.phases.map((p, i) => ({ id: `PH-${i + 1}`, name: p.name, goLive: p.goLive, itKw: p.itKw, ...phaseDerived(p.itKw, ev), status: 'Planned' as const })) }); actions.recordFeedback('phasing-optimiser', draft.id, true, proposal.phases.map(p => p.name).join(', ')); setDecided('accepted'); };
  const reject = () => { actions.recordFeedback('phasing-optimiser', draft.id, false); setDecided('rejected'); };

  return (
    <div>
      {singlePhase ? <div className="vw-card-description">This plan goes live in one step on <b>{fmtDate(draft.targetGoLive)}</b> (set in Requirements).</div> : (<>
      <SubTitle extra={<Button size="small" icon={<PlusOutlined />} onClick={add}>Add phase</Button>}>Phases</SubTitle>
      <PhaseEditor phases={draft.phases} onChange={phases => patch({ phases })} ev={ev} showStatus />
      <div style={{ marginTop: 6, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>Total <b>{total.toLocaleString('en-US')} kW</b></span>
        <VwChip variant={remainder === 0 ? 'success' : 'warning'}>{remainder === 0 ? `Sums to the ${fmtKw(draft.designPowerKw)} design power` : remainder > 0 ? `${fmtKw(remainder)} not yet phased` : `${fmtKw(-remainder)} over the design power`}</VwChip>
        <span style={{ color: 'var(--vw-color-slate-500)' }}>Density and cooling left empty follow the plan; set them to make a phase its own design (for example an air-cooled first hall).</span>
      </div>

      <SubTitle>Capacity ladder</SubTitle>
      {ev && <PhaseLadderChart rows={ev.ladder} growthPctPerYear={draft.demand.growthPctPerYear} height={240} />}
      {ev && ev.ladder.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 12 }}>
          {ev.ladder.map(r => <span key={r.phase.id} className="vw-card-child" style={{ padding: '4px 10px' }}><strong>{r.phase.name}</strong> · {fmtKw(r.installedKw)} installed, {fmtKw(r.headroomKw)} usable, {r.usablePct}% of installed{r.crossesWarningMonth !== undefined ? ` · warning crossed in ${r.crossesWarningMonth} months` : ''}{r.bindingConstraint !== 'none' ? <> · <VwChip variant="warning">{r.bindingConstraint} binds</VwChip></> : ''}</span>)}
        </div>
      )}

      <SubTitle extra={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12 }}>Demand profile <Select size="small" style={{ width: 220 }} value={demandId} options={demandTemplates.map(t => ({ value: t.id, label: t.name }))} onChange={v => { setDemandId(v); setDecided(undefined); }} /></span>}><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><RobotOutlined /> Phasing optimiser</span></SubTitle>
      {!proposal && <VwCard variant="child-shaded"><div className="vw-card-description">The optimiser phases plans of 1 MW or more in new-site, expansion, hall, edge and portfolio scopes. Smaller or single-step scopes go live in one phase.</div></VwCard>}
      {proposal && decided !== 'rejected' && (
        <AIInsightCard title={`${proposal.phases.length} phases, first live ${fmtDate(proposal.phases[0].goLive)}`} confidence={proposal.confidence}
          body={<span>{proposal.reason} <EvidenceLinks items={proposal.evidence} /><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{proposal.phases.map(p => <VwChip key={p.name} variant="neutral">{p.name} · {fmtKw(p.itKw)} · {fmtDate(p.goLive)}</VwChip>)}</div></span>}
          actionLabel={decided === 'accepted' ? 'Applied' : 'Replace phases with this'} onAction={decided === 'accepted' ? undefined : accept} sourceLabel={decided === 'accepted' ? undefined : 'Keep my phases'} onSource={decided === 'accepted' ? undefined : reject} />
      )}
      </>)}
      <SubTitle>What must be ordered when</SubTitle>
      {ev && ev.schedule.length > 0 ? <LeadTimeGantt items={ev.schedule} goLive={sorted[0]?.goLive ?? draft.targetGoLive} height={Math.max(160, 24 * ev.schedule.length + 40)} /> : <div className="vw-card-description">Add a phase to see order dates.</div>}
      {ev && ev.schedule.some(x => x.late) && <div style={{ marginTop: 6, fontSize: 12 }}><VwChip variant="error">{ev.schedule.filter(x => x.late).length} late</VwChip> {ev.schedule.filter(x => x.late).map(x => `${x.item} (${x.phase})`).join(', ')} cannot be ordered in time for their phase. Items from stock need only a transfer; the buffer is the schedule contingency.</div>}
      {ev && (ev.sizing.phaseDesign ?? []).some(x => x.mismatch) && <div style={{ marginTop: 6, fontSize: 12 }}><VwChip variant="warning">Phase records differ from the design</VwChip> {ev.sizing.phaseDesign!.filter(x => x.mismatch).map(x => `${x.name}: ${x.racks} racks in ${x.halls} halls (record says ${x.storedRacks} / ${x.storedHalls})`).join('; ')}. Change the phase kW to refresh them.</div>}
    </div>
  );
}
