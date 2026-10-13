/* New data centre: the site facts (feasibility) and candidate plots compared on a scorecard. */
import { Checkbox, Input, InputNumber, Select, Tooltip } from 'antd';
import type * as T from '../../../../../mock/data/types';
import { VwChip } from '../../../../../shared/components/ux';
import { VwButton as Button } from '../../../../../shared/components/vw/VwButton';
import { fmtUsd } from '../../../lib/engine';
import { CRITERIA, CRITERION_LABEL, scoreWeights, type CandidateScore, type Feasibility } from '../../../lib/buildSite';
import { Field, SubTitle } from '../../wizard/ParamField';
import type { StepProps } from '../../wizard/wizardModel';
import { analysisOf, dayText, fromDate, newCandidate, toDate } from './model';

const ZONING: T.PlannerCandidateSite['zoning'][] = ['Zoned for data centre', 'Rezoning needed', 'Unknown'];
const muted = { fontSize: 12, color: 'var(--vw-color-slate-500)' } as const;

/** The checks of one site, as chips (used on Requirements, the Power step and the plan pack). */
export function FeasibilityChips({ f }: { f: Feasibility }) {
  return (
    <span className="vw-flex vw-gap-xs vw-wrap">
      {f.checks.map(c => <Tooltip key={c.key} title={c.detail}><VwChip variant={c.ok ? (c.warn ? 'warning' : 'success') : c.key === 'zoning' ? 'warning' : 'error'}>{c.label}</VwChip></Tooltip>)}
    </span>
  );
}

/** Site facts against the design, line by line. */
export function FeasibilityTable({ f }: { f: Feasibility }) {
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
      <tbody>{f.checks.map(c => <tr key={c.key}><td>{c.label}</td><td><VwChip variant={c.ok ? (c.warn ? 'warning' : 'success') : c.key === 'zoning' ? 'warning' : 'error'}>{c.ok ? (c.warn ? 'Warning' : 'Pass') : c.key === 'zoning' ? 'Warning' : 'Fail'}</VwChip></td><td style={{ whiteSpace: 'normal' }}>{c.detail}</td></tr>)}</tbody>
    </table></div>
  );
}

/** Weighted scorecard across the candidate plots. */
export function CandidateScorecard({ scores, weights }: { scores: CandidateScore[]; weights: Record<string, number> }) {
  if (!scores.length) return null;
  const sorted = [...scores].sort((a, b) => a.rank - b.rank);
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Rank</th><th>Site</th><th style={{ textAlign: 'right' }}>Time to power</th><th style={{ textAlign: 'right' }}>CapEx and land</th><th style={{ textAlign: 'right' }}>Energy a year</th><th style={{ textAlign: 'right' }}>Latency</th><th>Risk</th>{CRITERIA.map(c => <th key={c} style={{ textAlign: 'right' }}><Tooltip title={`${CRITERION_LABEL[c]}: weight ${weights[c]}`}>{CRITERION_LABEL[c].split(' ')[0]}</Tooltip></th>)}<th style={{ textAlign: 'right' }}>Score</th><th>Hard limits</th></tr></thead>
      <tbody>{sorted.map(s => (
        <tr key={s.candidate.id} className={s.candidate.chosen ? 'is-selected' : undefined}>
          <td>{s.rank}</td>
          <td><b>{s.candidate.name}</b>{s.candidate.chosen && <VwChip variant="info" style={{ marginLeft: 6 }}>Chosen</VwChip>}</td>
          <td style={{ textAlign: 'right' }}>{s.metrics.monthsToPower === 99 ? '—' : `${s.metrics.monthsToPower} months`}</td>
          <td style={{ textAlign: 'right' }}>{fmtUsd(s.metrics.costUsd)}</td>
          <td style={{ textAlign: 'right' }}><Tooltip title={`${s.metrics.tariff} USD/kWh (${s.metrics.tariffSource})`}>{fmtUsd(s.metrics.energyUsdYear)}</Tooltip></td>
          <td style={{ textAlign: 'right' }}><Tooltip title={s.metrics.latencyBasis}>{s.metrics.latencyMs === undefined ? 'not known' : `${s.metrics.latencyMs} ms`}</Tooltip></td>
          <td><Tooltip title={s.metrics.riskWhy.join(', ') || 'none recorded'}>{s.metrics.riskPoints ? `${s.metrics.riskPoints} points` : 'Low'}</Tooltip></td>
          {CRITERIA.map(c => <td key={c} style={{ textAlign: 'right' }}>{s.scores[c]}</td>)}
          <td style={{ textAlign: 'right' }}><b>{s.total}</b></td>
          <td>{s.feasible ? <VwChip variant="success">All met</VwChip> : <Tooltip title={s.feasibility.checks.filter(c => !c.ok && c.key !== 'zoning').map(c => c.detail).join(' · ')}><VwChip variant="error">{s.feasibility.checks.filter(c => !c.ok && c.key !== 'zoning').length} broken</VwChip></Tooltip>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

/** Requirements block for a new data centre: the plot or plots, with the facts the design is checked against. */
export function CandidatesBlock({ draft, patch, setParam, ev }: StepProps) {
  const list = draft.candidates ?? [];
  const a = analysisOf(ev);
  const score = (id: string) => a?.candidates?.find(s => s.candidate.id === id);
  const set = (next: T.PlannerCandidateSite[]) => patch({ candidates: next });
  const upd = (i: number, p: Partial<T.PlannerCandidateSite>) => set(list.map((c, k) => (k === i ? { ...c, ...p } : c)));
  const choose = (i: number) => {
    const c = list[i];
    patch({ candidates: list.map((x, k) => ({ ...x, chosen: k === i })), climate: c.climate ?? draft.climate, regionId: c.regionId ?? draft.regionId });
    if (c.tariffUsdPerKwh) setParam('tariffUsdPerKwh', c.tariffUsdPerKwh, 'document');
  };
  const add = () => set([...list, newCandidate(list.length + 1, draft.regionId, draft.climate)]);
  const weights = ev ? scoreWeights(ev.params) : undefined;
  // A portfolio lists new plots as allocation options; only a new data centre chooses one site.
  const picks = draft.scope === 'new-dc';
  return (
    <div>
      <SubTitle extra={<Button size="small" onClick={add}>Add a candidate plot</Button>}>{picks ? 'Site facts and candidate plots' : 'New plots to consider'}</SubTitle>
      <div style={{ ...muted, marginBottom: 8 }}>{picks ? 'Record the plot, the grid offer and the water supply for each candidate. The chosen plot is the site the design is checked against: the buildings must fit the buildable area, the facility load must fit the grid offer, the grid must be energised before phase 1 needs power, and the water demand must fit the supply.' : 'Each plot becomes a new-site option for the allocation: its grid offer caps what it can take, its energisation date and land cost set its lead time and cost.'}</div>
      {!list.length && <div className="vw-card-child" style={{ padding: '10px 14px', fontSize: 13 }}>No site facts yet. <a onClick={add}>Add the first plot</a> to check the design against it.</div>}
      <div className="vw-flex vw-flex-col vw-gap-sm">
        {list.map((c, i) => { const s = score(c.id); return (
          <div key={c.id} className="vw-card-child" style={{ padding: '10px 14px', border: c.chosen ? '1px solid var(--primaryColor500)' : undefined }}>
            <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm vw-wrap" style={{ marginBottom: 6 }}>
              <span className="vw-flex vw-items-center vw-gap-sm">
                <Input size="small" value={c.name} onChange={e => upd(i, { name: e.target.value })} style={{ width: 240, fontWeight: 600 }} />
                {picks && (c.chosen ? <VwChip variant="info">Chosen site</VwChip> : <Button size="small" onClick={() => choose(i)}>Use this site</Button>)}
                {s && <VwChip variant="neutral">Score {s.total} · rank {s.rank}</VwChip>}
              </span>
              <span className="vw-flex vw-gap-xs vw-items-center">{s && <FeasibilityChips f={s.feasibility} />}<Button size="small" type="text" danger onClick={() => set(list.filter((_, k) => k !== i))}>Remove</Button></span>
            </div>
            <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
              <Field label="Plot"><InputNumber size="small" style={{ width: '100%' }} min={0} value={c.plotHa} addonAfter="ha" onChange={v => upd(i, { plotHa: Number(v ?? 0) })} /></Field>
              <Field label="Buildable"><InputNumber size="small" style={{ width: '100%' }} min={0} value={c.buildableHa} addonAfter="ha" onChange={v => upd(i, { buildableHa: Number(v ?? 0) })} /></Field>
              <Field label="Zoning"><Select size="small" value={c.zoning} options={ZONING.map(z => ({ value: z, label: z }))} onChange={v => upd(i, { zoning: v })} /></Field>
              <Field label="Grid offer"><InputNumber size="small" style={{ width: '100%' }} min={0} value={c.gridOfferMva} addonAfter="MVA" onChange={v => upd(i, { gridOfferMva: Number(v ?? 0) })} /></Field>
              <Field label="Energised by"><Input size="small" type="date" value={toDate(c.gridEnergisation)} onChange={e => upd(i, { gridEnergisation: fromDate(e.target.value, '') })} /></Field>
              <Field label="Offer"><Select size="small" value={c.gridFirm ? 'firm' : 'non-firm'} options={[{ value: 'firm', label: 'Firm' }, { value: 'non-firm', label: 'Non-firm (curtailable)' }]} onChange={v => upd(i, { gridFirm: v === 'firm' })} /></Field>
              <Field label="Water supply"><InputNumber size="small" style={{ width: '100%' }} min={0} value={c.waterM3PerDay} addonAfter="m³/day" onChange={v => upd(i, { waterM3PerDay: Number(v ?? 0) })} /></Field>
              <Field label="Fibre routes"><InputNumber size="small" style={{ width: '100%' }} min={0} value={c.fibreRoutes} onChange={v => upd(i, { fibreRoutes: Number(v ?? 0) })} /></Field>
              <Field label="To nearest PoP"><InputNumber size="small" style={{ width: '100%' }} min={0} value={c.kmToPop} addonAfter="km" onChange={v => upd(i, { kmToPop: Number(v ?? 0) })} /></Field>
              <Field label="Land cost"><InputNumber size="small" style={{ width: '100%' }} min={0} step={1e6} value={c.landCostUsd} addonAfter="USD" onChange={v => upd(i, { landCostUsd: Number(v ?? 0) })} /></Field>
              <Field label="Energy price" hint="From the site offer; else the regional benchmark"><InputNumber size="small" style={{ width: '100%' }} min={0} step={0.01} value={c.tariffUsdPerKwh} addonAfter="USD/kWh" onChange={v => upd(i, { tariffUsdPerKwh: v === null ? undefined : Number(v) })} /></Field>
              <Field label="Hazards"><span className="vw-flex vw-gap-sm" style={{ paddingTop: 4 }}><Checkbox checked={c.floodZone} onChange={e => upd(i, { floodZone: e.target.checked })}>Flood</Checkbox><Checkbox checked={c.seismicZone} onChange={e => upd(i, { seismicZone: e.target.checked })}>Seismic</Checkbox></span></Field>
              <Field label="Latitude"><InputNumber size="small" style={{ width: '100%' }} step={0.01} value={c.latitude} onChange={v => upd(i, { latitude: v === null ? undefined : Number(v) })} /></Field>
              <Field label="Longitude"><InputNumber size="small" style={{ width: '100%' }} step={0.01} value={c.longitude} onChange={v => upd(i, { longitude: v === null ? undefined : Number(v) })} /></Field>
              <Field label="Incentives" style={{ gridColumn: 'span 4' }}><Input size="small" value={c.incentives ?? ''} placeholder="Tax, power price or heat-reuse incentives" onChange={e => upd(i, { incentives: e.target.value })} /></Field>
            </div>
            {c.chosen && s?.feasibility.proposal && <div style={{ fontSize: 12, color: 'var(--vw-color-red-600)', marginTop: 6 }}>The grid is energised {dayText(c.gridEnergisation)}, after phase 1 needs power ({dayText(s.feasibility.powerOn)}). Bring {s.feasibility.proposal.interimGenerationMw} MW of interim generation, or move phase 1 to {dayText(s.feasibility.proposal.shiftPhase1To)}.</div>}
          </div>
        ); })}
      </div>
      {picks && (a?.candidates?.length ?? 0) > 1 && weights && (<>
        <SubTitle extra={<span style={muted}>Weights: {CRITERIA.map(k => `${CRITERION_LABEL[k]} ${weights[k]}`).join(', ')} (input "Candidate scorecard weights")</span>}>Candidate scorecard</SubTitle>
        <CandidateScorecard scores={a!.candidates!} weights={weights} />
        <div style={{ ...muted, marginTop: 4 }}>Each criterion scores the best plot 100 and the worst 0. Plots that break a hard limit rank below every plot that does not. A scenario can evaluate another plot (scenario input "candidateId").</div>
      </>)}
    </div>
  );
}
