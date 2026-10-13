/* Phasing and delivery panel: the phase table, the capacity ladder, the phasing optimiser and the lead-time view. Inputs (contingency, commissioning) live on the dimension step. */
import { useMemo, useState } from 'react';
import { Input, InputNumber, Select } from 'antd';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { AIInsightCard, VwCard, VwChip } from '../../../../shared/components/ux';
import { DeleteOutlined, PlusOutlined, RobotOutlined } from '../../../../shared/icons';
import type * as T from '../../../../mock/data/types';
import { fmtKw } from '../../lib/engine';
import { phasingProposal } from '../../lib/ai';
import { LeadTimeGantt, PhaseLadderChart } from '../charts';
import { EvidenceLinks } from '../kit';
import { fmtDate, fromDateInput, phaseDerived, toDateInput, type StepProps } from './wizardModel';
import { SubTitle } from './ParamField';

export function PhasingPanel({ draft, patch, ev, templates, estate, actions, singlePhase }: StepProps & { singlePhase?: boolean }) {
  const demandTemplates = useMemo(() => templates.filter(t => t.kind === 'demand' && t.status === 'published'), [templates]);
  const [demandId, setDemandId] = useState<string | undefined>(() => demandTemplates.find(t => t.demand && t.demand.gpuPct === draft.demand.gpuPct)?.id ?? demandTemplates[0]?.id);
  const [decided, setDecided] = useState<'accepted' | 'rejected' | undefined>();
  const headroom = useMemo(() => { const dc = estate.dataCenters.find(d => d.id === draft.dataCenterId); if (!dc) return undefined; return Math.max(0, dc.designPowerKw - estate.racks.filter(r => r.dataCenterId === dc.id).reduce((a, r) => a + r.currentPowerKw, 0)); }, [estate, draft.dataCenterId]);
  const proposal = useMemo(() => (ev ? phasingProposal(draft, ev, demandTemplates.find(t => t.id === demandId) ?? null, headroom) : null), [draft, ev, demandTemplates, demandId, headroom]);
  const total = draft.phases.reduce((a, p) => a + p.itKw, 0);
  const remainder = draft.designPowerKw - total;
  const sorted = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));

  const update = (id: string, p: Partial<T.PlannerPhase>) => patch({ phases: draft.phases.map(x => (x.id === id ? { ...x, ...p, ...(p.itKw !== undefined ? phaseDerived(p.itKw, ev) : {}) } : x)) });
  const add = () => {
    const n = draft.phases.length + 1;
    const last = sorted[sorted.length - 1];
    const goLive = last ? new Date(new Date(last.goLive).getTime() + 365 * 864e5).toISOString() : draft.targetGoLive;
    const itKw = Math.max(0, remainder);
    patch({ phases: [...draft.phases, { id: `PH-${Date.now().toString(36)}`, name: `Phase ${n}`, goLive, itKw, ...phaseDerived(itKw, ev), status: 'Planned' }] });
  };
  const remove = (id: string) => patch({ phases: draft.phases.filter(p => p.id !== id) });
  const accept = () => { if (!proposal) return; patch({ phases: proposal.phases.map((p, i) => ({ id: `PH-${i + 1}`, name: p.name, goLive: p.goLive, itKw: p.itKw, ...phaseDerived(p.itKw, ev), status: 'Planned' as const })) }); actions.recordFeedback('phasing-optimiser', draft.id, true, proposal.phases.map(p => p.name).join(', ')); setDecided('accepted'); };
  const reject = () => { actions.recordFeedback('phasing-optimiser', draft.id, false); setDecided('rejected'); };

  return (
    <div>
      {singlePhase ? <div className="vw-card-description">This plan goes live in one step on <b>{fmtDate(draft.targetGoLive)}</b> (set in Requirements).</div> : (<>
      <SubTitle extra={<Button size="small" icon={<PlusOutlined />} onClick={add}>Add phase</Button>}>Phases</SubTitle>
      <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
        <thead><tr><th>Phase</th><th>Go-live</th><th style={{ textAlign: 'right' }}>IT kW</th><th style={{ textAlign: 'right' }}>Racks</th><th style={{ textAlign: 'right' }}>Halls</th><th>Status</th><th /></tr></thead>
        <tbody>
          {sorted.map(p => (
            <tr key={p.id}>
              <td><Input size="small" value={p.name} onChange={e => update(p.id, { name: e.target.value })} style={{ width: 200 }} /></td>
              <td><Input size="small" type="date" value={toDateInput(p.goLive)} onChange={e => update(p.id, { goLive: fromDateInput(e.target.value, p.goLive) })} style={{ width: 150 }} /></td>
              <td style={{ textAlign: 'right' }}><InputNumber size="small" min={0} step={100} value={p.itKw} onChange={v => typeof v === 'number' && update(p.id, { itKw: v })} style={{ width: 120 }} /></td>
              <td style={{ textAlign: 'right' }}>{p.racks.toLocaleString('en-US')}</td><td style={{ textAlign: 'right' }}>{p.halls}</td>
              <td><Select size="small" value={p.status} style={{ width: 120 }} options={(['Planned', 'Approved', 'In delivery', 'Live'] as const).map(s => ({ value: s, label: s }))} onChange={v => update(p.id, { status: v })} /></td>
              <td><Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove phase" onClick={() => remove(p.id)} /></td>
            </tr>
          ))}
          {draft.phases.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--vw-color-slate-500)' }}>No phases yet. Add one, or accept the optimiser's proposal.</td></tr>}
        </tbody>
        <tfoot><tr><td colSpan={2} style={{ fontWeight: 600 }}>Total</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{total.toLocaleString('en-US')} kW</td><td colSpan={4}><VwChip variant={remainder === 0 ? 'success' : 'warning'}>{remainder === 0 ? `Sums to the ${fmtKw(draft.designPowerKw)} design power` : remainder > 0 ? `${fmtKw(remainder)} not yet phased` : `${fmtKw(-remainder)} over the design power`}</VwChip></td></tr></tfoot>
      </table></div>

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
      {ev && ev.schedule.some(x => x.late) && <div style={{ marginTop: 6, fontSize: 12 }}><VwChip variant="error">{ev.schedule.filter(x => x.late).length} late</VwChip> {ev.schedule.filter(x => x.late).map(x => x.item).join(', ')} cannot be ordered in time for the first phase.</div>}
    </div>
  );
}
