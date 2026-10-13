/* Regional portfolio: region and candidate sites, the demand curve, the proposed and accepted allocation, gaps and interconnect. */
import { useMemo } from 'react';
import { Input, InputNumber, Select, Tooltip } from 'antd';
import type * as T from '../../../../../mock/data/types';
import { VwChip } from '../../../../../shared/components/ux';
import { VwButton as Button } from '../../../../../shared/components/vw/VwButton';
import { fmtUsd } from '../../../lib/engine';
import { siteBaseline } from '../../../lib/site';
import { PIPELINE_WEIGHT, ROUTE_LABEL, type PortfolioModel } from '../../../lib/buildPortfolio';
import { Field, SubTitle } from '../../wizard/ParamField';
import { siteMissing, type StepProps } from '../../wizard/wizardModel';
import { analysisOf, dayText, fromDate, kwText, toDate } from './model';
import { CandidatesBlock } from './NewDcBlocks';

const muted = { fontSize: 12, color: 'var(--vw-color-slate-500)' } as const;
type Route = NonNullable<T.PlannerSiteRow['route']>;
const ROUTES: Route[] = ['expansion', 'new-dc', 'hall', 'pod'];

/** Region and the existing sites to consider, with what each can take today. */
export function RegionPicker({ draft, patch, estate, data }: StepProps) {
  const cands = String(draft.params.candidateSiteIds ?? '').split(',').filter(Boolean);
  const sites = useMemo(() => estate.dataCenters.filter(d => !draft.regionId || estate.campuses.find(c => c.id === d.campusId)?.regionId === draft.regionId).map(d => ({ d, head: data.ready ? siteBaseline(data, d.id, { excludePlanId: draft.id })?.headroomItKw ?? 0 : undefined })), [estate, data, draft.regionId, draft.id]);
  const missing = siteMissing(draft);
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <div style={muted}>A portfolio plan decides where and when capacity goes across a region. Pick the region and the existing sites to consider; add new plots as candidates below. Approval creates one child plan per allocation row.</div>
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: '1fr 2fr' }}>
        <Field label="Region"><Select value={draft.regionId} placeholder="Pick a region" options={estate.regions.map(r => ({ value: r.id, label: r.name }))} onChange={v => patch({ regionId: v, campusId: undefined, dataCenterId: undefined, params: { ...draft.params, candidateSiteIds: '' } })} /></Field>
        <Field label="Existing sites to consider" hint="Free IT capacity is the binding stage of each site's real plant"><Select mode="multiple" allowClear value={cands} placeholder="All sites in the region" options={sites.map(s => ({ value: s.d.id, label: `${s.d.code} · ${s.head === undefined ? 'loading' : `${kwText(s.head)} free`}` }))} onChange={v => patch({ params: { ...draft.params, candidateSiteIds: v.join(',') }, paramSources: { ...draft.paramSources, candidateSiteIds: 'user' } })} /></Field>
      </div>
      {missing && <span style={{ fontSize: 12, color: 'var(--vw-color-red-600)' }}>{missing}.</span>}
    </div>
  );
}

export function DemandTable({ m }: { m: PortfolioModel }) {
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Year</th><th style={{ textAlign: 'right' }}>Demand</th><th style={{ textAlign: 'right' }}>of which pipeline</th><th style={{ textAlign: 'right' }}>Needed with reserve</th><th style={{ textAlign: 'right' }}>Sellable today</th><th style={{ textAlign: 'right' }}>Proposed</th><th style={{ textAlign: 'right' }}>Gap</th></tr></thead>
      <tbody>{m.demand.map(d => <tr key={d.year}><td>{d.label}</td><td style={{ textAlign: 'right' }}>{kwText(d.demandKw)}</td><td style={{ textAlign: 'right' }}>{d.pipelineKw ? kwText(d.pipelineKw) : '—'}</td><td style={{ textAlign: 'right' }}>{kwText(d.needKw)}</td><td style={{ textAlign: 'right' }}>{kwText(d.existingKw)}</td><td style={{ textAlign: 'right' }}>{d.allocatedKw ? kwText(d.allocatedKw) : '—'}</td><td style={{ textAlign: 'right', color: d.gapKw ? 'var(--vw-color-red-600)' : undefined }}>{d.gapKw ? kwText(d.gapKw) : '—'}</td></tr>)}</tbody>
    </table></div>
  );
}

export function AllocationTable({ m, onRemove, onChange }: { m: PortfolioModel; onRemove?: (id: string) => void; onChange?: (id: string, p: Partial<T.PlannerSiteRow>) => void }) {
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Site</th><th>Route</th><th style={{ textAlign: 'right' }}>IT capacity</th><th>Live</th><th style={{ textAlign: 'right' }}>CapEx</th><th>Headroom</th><th>Lead time</th><th>Child plan</th>{onRemove && <th />}</tr></thead>
      <tbody>{m.checks.map(c => (
        <tr key={c.row.id}>
          <td>{onChange ? <Input size="small" value={c.row.name} onChange={e => onChange(c.row.id, { name: e.target.value })} style={{ minWidth: 200 }} /> : c.row.name}</td>
          <td>{onChange ? <Select size="small" value={c.row.route ?? 'expansion'} options={ROUTES.map(r => ({ value: r, label: ROUTE_LABEL[r] }))} onChange={v => onChange(c.row.id, { route: v })} style={{ minWidth: 140 }} /> : ROUTE_LABEL[c.row.route ?? 'expansion']}</td>
          <td style={{ textAlign: 'right' }}>{onChange ? <InputNumber size="small" min={0} step={500} value={c.row.itKw} addonAfter="kW" onChange={v => onChange(c.row.id, { itKw: Number(v ?? 0) })} style={{ width: 140 }} /> : kwText(c.row.itKw)}</td>
          <td>{onChange ? <Input size="small" type="date" value={toDate(c.row.goLive)} onChange={e => onChange(c.row.id, { goLive: fromDate(e.target.value, c.row.goLive) })} /> : dayText(c.row.goLive)}</td>
          <td style={{ textAlign: 'right' }}><Tooltip title={c.option?.costBasis}>{fmtUsd(c.capexUsd)}</Tooltip></td>
          <td><Tooltip title={c.detail}><VwChip variant={c.headroomOk ? 'success' : 'error'}>{c.headroomOk ? 'Fits' : 'Short'}</VwChip></Tooltip></td>
          <td><Tooltip title={`Earliest ${dayText(c.earliest)}${c.option ? ` (${c.option.leadWeeks} weeks${c.option.prerequisite ? `, ${c.option.prerequisite}` : ''})` : ''}`}><VwChip variant={c.leadOk ? 'success' : 'error'}>{c.leadOk ? 'In time' : 'Too soon'}</VwChip></Tooltip></td>
          <td>{c.row.childPlanId ?? '—'}</td>
          {onRemove && <td><Button size="small" type="text" danger onClick={() => onRemove(c.row.id)}>Remove</Button></td>}
        </tr>
      ))}</tbody>
    </table></div>
  );
}

export function DciTable({ m }: { m: PortfolioModel }) {
  if (!m.dci.length) return <div style={muted}>One location only: no interconnect needed.</div>;
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Between</th><th style={{ textAlign: 'right' }}>Distance</th><th style={{ textAlign: 'right' }}>Latency (one way)</th><th style={{ textAlign: 'right' }}>Capacity</th><th>Carriers at the ends</th><th>Child plan</th></tr></thead>
      <tbody>{m.dci.map(d => <tr key={`${d.a}-${d.b}`}><td>{d.a} to {d.b}</td><td style={{ textAlign: 'right' }}>{d.km === undefined ? 'no position' : `${d.km.toLocaleString('en-US')} km`}</td><td style={{ textAlign: 'right' }}>{d.latencyMs === undefined ? '—' : `${d.latencyMs} ms`}</td><td style={{ textAlign: 'right' }}>{d.gbps} Gbps</td><td>{d.providers.join(', ') || '—'}</td><td>{d.existingEnds ? 'Network plan on approval' : 'After the new site exists'}</td></tr>)}</tbody>
    </table></div>
  );
}

/** Requirements block: demand, proposal, the allocation itself, gaps, interconnect. */
export function AllocationBlock(props: StepProps) {
  const { draft, patch, ev } = props;
  const m = analysisOf(ev)?.portfolio;
  const rows = draft.sites ?? [];
  // The capacity on Requirements is what the region needs; the allocation is checked against the demand curve, not forced to match it.
  const setRows = (next: T.PlannerSiteRow[]) => patch({ sites: next });
  const change = (id: string, p: Partial<T.PlannerSiteRow>) => setRows(rows.map(r => (r.id === id ? { ...r, ...p, capexUsd: undefined } : r)));
  const addFrom = (key: string) => {
    const o = m?.options.find(x => `${x.ref.kind}:${x.ref.id}:${x.route}:${x.name}` === key); if (!o) return;
    const id = `A${rows.length + 1}`;
    setRows([...rows, { id, name: o.name, ref: o.ref, itKw: Math.max(500, Number(ev?.params['hallDesignKw']?.value ?? 1500)), goLive: new Date(Date.now() + o.leadWeeks * 7 * 864e5).toISOString(), route: o.route, status: 'Accepted', notes: o.prerequisite, latitude: o.latLon?.latitude, longitude: o.latLon?.longitude }]);
  };
  return (
    <div>
      <CandidatesBlock {...props} />
      <SubTitle>Demand in the region</SubTitle>
      {!m ? <div style={muted}>The demand curve is worked out when the platform data has loaded.</div> : (<>
        <DemandTable m={m} />
        <div style={{ ...muted, marginTop: 4 }}>Demand = today's IT load at the region's sites × {draft.demand.growthPctPerYear}% growth a year, plus open demand requests at those sites weighted by status ({Object.entries(PIPELINE_WEIGHT).map(([k, v]) => `${k} ${v}`).join(', ')}). Sellable today = each site's design capped by its real plant headroom. {m.notes.join(' ')}</div>
        <SubTitle extra={m.proposal.length > 0 && <Button size="small" onClick={() => setRows(m.proposal.map(r => ({ ...r, status: 'Accepted' as const })))}>Use this allocation</Button>}>Proposed allocation</SubTitle>
        {m.proposal.length ? <div style={{ fontSize: 13 }}>{m.proposal.map(r => `${r.name}: ${kwText(r.itKw)} live ${dayText(r.goLive)} (${fmtUsd(r.capexUsd ?? 0)})${r.notes ? `, ${r.notes}` : ''}`).join(' · ')}</div> : <div style={muted}>The forecast is covered by what the region can sell today; no new capacity is proposed within the horizon.</div>}
        <div style={muted}>Year by year, the gap is filled in hall-sized blocks with the cheapest option that can be live by the end of that year (cost per kW from the benchmarks, lead time from delivery durations).</div>
        {m.gaps.length > 0 && <div style={{ fontSize: 12, color: 'var(--vw-color-red-600)', marginTop: 4 }}>Gaps: {m.gaps.map(g => `${g.year}: ${kwText(g.kw)} (${g.reason})`).join('; ')}</div>}
        <SubTitle extra={<Select size="small" placeholder="Add a row" value={null} style={{ minWidth: 260 }} options={m.options.map(o => ({ value: `${o.ref.kind}:${o.ref.id}:${o.route}:${o.name}`, label: `${o.name} · ${o.costPerKw.toLocaleString('en-US')} USD/kW · ${o.leadWeeks} weeks` }))} onChange={v => v && addFrom(v)} />}>Allocation{m.rowSource === 'scenario' ? ' (from the scenario)' : ''}</SubTitle>
        {m.checks.length ? <AllocationTable m={m} onRemove={id => setRows(rows.filter(r => r.id !== id))} onChange={change} /> : <div style={muted}>No allocation yet: use the proposal or add rows. Without one the plan cannot be submitted.</div>}
        <SubTitle>Interconnect between the sites</SubTitle>
        <DciTable m={m} />
      </>)}
    </div>
  );
}
