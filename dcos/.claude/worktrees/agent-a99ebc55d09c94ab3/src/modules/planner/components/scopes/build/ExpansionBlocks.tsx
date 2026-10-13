/* Site expansion: the campus picker with real intake headroom, and the campus check per phase. */
import { useMemo } from 'react';
import { Input, Select } from 'antd';
import { DC_TYPE_CATALOG, dcTypeProfile } from '../../../../../mock/data/dcTypes';
import { VwChip } from '../../../../../shared/components/ux';
import { VwButton as Button } from '../../../../../shared/components/vw/VwButton';
import { campusBaseline } from '../../../lib/site';
import { proposeExpansionPhases, type CampusCheck } from '../../../lib/buildSite';
import { Field, SubTitle } from '../../wizard/ParamField';
import { CLIMATES, CLIMATE_LABEL, climateFromHint, mixForSiteType, siteMissing, type StepProps } from '../../wizard/wizardModel';
import { analysisOf, dayText, kwText } from './model';

const muted = { fontSize: 12, color: 'var(--vw-color-slate-500)' } as const;

/** Campus to expand: intake per side against what the existing buildings are entitled to. */
export function CampusPicker({ draft, patch, data }: StepProps) {
  const rows = useMemo(() => (data.ready ? data.campuses.map(c => {
    const cb = campusBaseline(data, c.id, { excludePlanId: draft.id });
    const byType = new Map<string, number>();
    for (const d of cb?.dataCenters ?? []) if (d.dcTypeKey) byType.set(d.dcTypeKey, (byType.get(d.dcTypeKey) ?? 0) + d.designPowerKw);
    const dominant = [...byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { c, cb, dominant };
  }) : []), [data, draft.id]);
  const chosen = rows.find(r => r.c.id === draft.campusId);
  const pick = (id: string) => {
    const r = rows.find(x => x.c.id === id); if (!r) return;
    const type = r.dominant ?? draft.dcTypeKey;
    patch({ campusId: id, regionId: r.c.regionId, dataCenterId: undefined, dcTypeKey: type, demand: { ...draft.demand, ...mixForSiteType(type) }, climate: climateFromHint(r.c.city) ?? draft.climate, newSiteName: draft.newSiteName || `${r.c.city.toUpperCase().slice(0, 3)}-B${(r.cb?.dataCenters.length ?? 0) + 1}` });
  };
  const prof = dcTypeProfile(draft.dcTypeKey);
  const telco = prof?.segment === 'Telco' && draft.designPowerKw > 1000;
  const missing = siteMissing(draft);
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <div style={muted}>An expansion adds a building or hall block to a campus you already run, sharing its grid intake, MV ring, security and NOC. The free capacity below is the campus intake per side (the smaller of A and B) less the facility load the existing buildings are entitled to (design IT × their PUE, or more where load and holds are higher).</div>
      {!data.ready && <div style={muted}>Campus intake loads with the platform data.</div>}
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {rows.map(({ c, cb, dominant }) => { const sel = c.id === draft.campusId; const free = cb?.facilityHeadroomKw ?? 0; return (
          <div key={c.id} role="button" tabIndex={0} onClick={() => pick(c.id)} onKeyDown={e => { if (e.key === 'Enter') pick(c.id); }} className={`vw-card-child vw-card--clickable${sel ? ' vw-card--info' : ''}`} style={{ padding: '8px 12px', border: sel ? '1px solid var(--primaryColor500)' : '1px solid transparent' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>{c.city}, {c.country} · {cb?.dataCenters.length ?? 0} site{cb?.dataCenters.length === 1 ? '' : 's'}{dominant ? ` · mostly ${dcTypeProfile(dominant)?.name ?? dominant}` : ''}</div>
            <div style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>Intake {kwText(cb?.perSideKw ?? 0)} per side · {kwText(cb?.committedFacilityKw ?? 0)} committed</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: free > 0 ? 'var(--vw-color-green-600)' : 'var(--vw-color-red-600)' }}>{free > 0 ? `${kwText(free)} facility free` : `${kwText(-free)} over-committed`}</div>
          </div>
        ); })}
      </div>
      {chosen && (
        <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <Field label="New building name"><Input value={draft.newSiteName ?? ''} onChange={e => patch({ newSiteName: e.target.value })} /></Field>
          <Field label="Data centre record" hint="A new record for the building, or an existing data centre on the campus"><Select allowClear value={draft.dataCenterId} placeholder="New data centre record" options={(chosen.cb?.dataCenters ?? []).map(d => ({ value: d.id, label: `${d.code} · ${d.name}` }))} onChange={v => patch({ dataCenterId: v })} /></Field>
          <Field label="Kind of site" hint={chosen.dominant ? `The campus is mostly ${dcTypeProfile(chosen.dominant)?.name ?? chosen.dominant}` : undefined}><Select showSearch optionFilterProp="label" value={draft.dcTypeKey} options={DC_TYPE_CATALOG.map(p => ({ value: p.key, label: p.name }))} onChange={v => patch({ dcTypeKey: v, demand: { ...draft.demand, ...mixForSiteType(v) } })} /></Field>
          <Field label="Climate"><Select value={draft.climate} options={CLIMATES.map(c => ({ value: c, label: CLIMATE_LABEL[c] }))} onChange={v => patch({ climate: v })} /></Field>
        </div>
      )}
      {telco && <span><VwChip variant="warning">{prof!.name} is a telco profile with a −48 V DC plant; above 1 MW an AC data-centre profile is the usual choice</VwChip></span>}
      {missing && <span style={{ fontSize: 12, color: 'var(--vw-color-red-600)' }}>{missing}.</span>}
    </div>
  );
}

/** Campus intake against each phase, with the uprates on the permits. */
export function CampusTable({ k }: { k: CampusCheck }) {
  return (<>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Phase</th><th>Live</th><th style={{ textAlign: 'right' }}>IT so far</th><th style={{ textAlign: 'right' }}>Facility needed</th><th style={{ textAlign: 'right' }}>Free today</th><th style={{ textAlign: 'right' }}>Uprates by then</th><th style={{ textAlign: 'right' }}>Available</th><th>Result</th></tr></thead>
      <tbody>{k.rows.map(r => (
        <tr key={r.phase.id}><td>{r.phase.name}</td><td>{dayText(r.phase.goLive)}</td><td style={{ textAlign: 'right' }}>{kwText(r.cumulativeItKw)}</td><td style={{ textAlign: 'right' }}>{kwText(r.facilityKw)}</td><td style={{ textAlign: 'right' }}>{kwText(k.headroomKw)}</td><td style={{ textAlign: 'right' }}>{r.upratesKw ? kwText(r.upratesKw) : '—'}</td><td style={{ textAlign: 'right' }}>{kwText(r.availableKw)}</td><td>{r.ok ? <VwChip variant="success">Fits</VwChip> : <VwChip variant="error">{kwText(r.shortKw)} short</VwChip>}</td></tr>
      ))}</tbody>
    </table></div>
    <div style={{ ...muted, marginTop: 4 }}>Facility load = IT × PUE {k.pue}. Intake {kwText(k.campus.perSideKw)} per side (A {kwText(k.campus.feedsA)}, B {kwText(k.campus.feedsB)}), {kwText(k.campus.committedFacilityKw)} committed to {k.campus.dataCenters.length} existing building{k.campus.dataCenters.length === 1 ? '' : 's'}{k.otherPlans.length ? `, ${k.otherPlans.map(o => `${o.plnId} ${kwText(o.kw)}`).join(', ')} approved` : ''}{k.holdsKw ? `, ${kwText(k.holdsKw)} held` : ''}. Campus transformers: {kwText(k.campus.transformerKw)} installed.</div>
    {k.uprates.length > 0 && <div style={{ ...muted, marginTop: 4 }}>Uprates: {k.uprates.map(u => `${u.permit.name} adds ${kwText(u.kw)} from ${dayText(u.energisedBy)} (${u.basis})`).join('; ')}.</div>}
  </>);
}

/** Requirements block: the campus check per phase and phases capped at what the campus can power. */
export function CampusBlock({ draft, patch, ev }: StepProps) {
  const a = analysisOf(ev); const k = a?.campus;
  if (!draft.campusId) return null;
  if (!k) return <div style={muted}>The campus check runs when the platform data has loaded.</div>;
  const hallKw = Math.max(1, Number(ev?.params['hallDesignKw']?.value ?? 1500));
  const density = Math.max(1, Number(ev?.params['densityKwPerRack']?.value ?? draft.demand.densityKwPerRack ?? 10));
  const proposal = draft.designPowerKw > 0 ? proposeExpansionPhases(draft, k, hallKw, density) : undefined;
  return (
    <div>
      <SubTitle>Campus intake per phase</SubTitle>
      {k.rows.length ? <CampusTable k={k} /> : <div style={muted}>Add phases (or use the proposal below) to check them against the campus intake.</div>}
      {proposal && (
        <div className="vw-card-child" style={{ padding: '8px 12px', marginTop: 8 }}>
          <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm vw-wrap">
            <span style={{ fontSize: 13 }}><b>Phases the campus can power</b> · {proposal.note}</span>
            {proposal.phases.length > 0 && <Button size="small" onClick={() => patch({ phases: proposal.phases })}>Use these phases</Button>}
          </div>
          {proposal.phases.length > 0 && <div style={{ ...muted, marginTop: 4 }}>{proposal.phases.map(p => `${p.name}: ${kwText(p.itKw)} live ${dayText(p.goLive)}`).join(' · ')}</div>}
        </div>
      )}
      {(a?.shared?.length ?? 0) > 0 && <div style={{ ...muted, marginTop: 6 }}>Shared with the campus: {a!.shared!.map(s => `${s.item} (${s.note})`).join('; ')}.</div>}
    </div>
  );
}
