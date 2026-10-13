/* Edge rollout: edge locations from the estate as plan sites, each with its power variant and wave; per-site sizing and ladder. */
import { useMemo, useState } from 'react';
import { Input, InputNumber, Select, Tooltip } from 'antd';
import type * as T from '../../../../../mock/data/types';
import { VwChip } from '../../../../../shared/components/ux';
import { VwButton as Button } from '../../../../../shared/components/vw/VwButton';
import { SearchOutlined } from '../../../../../shared/icons';
import { EDGE_VARIANTS, type EdgeAnalysis, type EdgeLadderRow } from '../../../lib/buildEdge';
import { Field, SubTitle } from '../../wizard/ParamField';
import type { StepProps } from '../../wizard/wizardModel';
import { analysisOf, dayText, edgeDraftPatch, fromDate, kwText, toDate } from './model';

const muted = { fontSize: 12, color: 'var(--vw-color-slate-500)' } as const;
const STATUS_TONE = { planned: 'info', 'in-progress': 'warning', 'on-air': 'success', failed: 'error' } as const;

/** Requirements block: pick edge locations, set each site's variant, load and wave, and the wave dates. */
export function EdgeSitesBlock({ draft, patch, data, ev }: StepProps) {
  const rows = (draft.sites ?? []).filter(r => r.ref.kind === 'edgeLocation' || r.ref.kind === 'candidate');
  const waveDates = useMemo(() => { const d = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).map(p => p.goLive); return d.length ? d : [draft.targetGoLive]; }, [draft.phases, draft.targetGoLive]);
  const [country, setCountry] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const [statuses, setStatuses] = useState<T.EdgeLocation['status'][]>(['planned', 'in-progress']);
  const [nl, setNl] = useState({ name: '', city: '', country: '', latitude: undefined as number | undefined, longitude: undefined as number | undefined });
  const a = analysisOf(ev)?.edge;
  const defVariant = EDGE_VARIANTS.find(v => v.label === String(ev?.params['defaultVariant']?.value ?? ''))?.key ?? EDGE_VARIANTS[0].key;
  const perSite = Number(draft.params.kwPerSite ?? 40) || 40;
  const inRegion = data.edgeLocations.filter(l => !draft.regionId || l.regionId === draft.regionId);
  const countries = [...new Set(inRegion.map(l => l.country))].sort();
  const taken = new Set(rows.map(r => r.ref.id));
  const avail = inRegion.filter(l => !taken.has(l.id) && statuses.includes(l.status) && (!country || l.country === country) && (!q || `${l.name} ${l.city}`.toLowerCase().includes(q.toLowerCase())));
  const commit = (next: T.PlannerSiteRow[], dates = waveDates) => patch(edgeDraftPatch(draft, next, dates));
  const nextId = () => `ES${Math.max(0, ...rows.map(r => Number(r.id.replace(/\D/g, '')) || 0)) + 1}`;
  const add = (l: T.EdgeLocation) => commit([...rows, { id: nextId(), name: l.name, ref: { kind: 'edgeLocation', id: l.id }, variant: defVariant, itKw: perSite, goLive: waveDates[0], wave: 1, route: 'edge', status: 'Accepted', city: l.city, country: l.country, latitude: l.latitude, longitude: l.longitude, notes: l.blocker ? `Estate blocker: ${l.blockerNote ?? l.blocker}` : undefined }]);
  const addNew = () => { if (!nl.name.trim()) return; commit([...rows, { id: nextId(), name: nl.name.trim(), ref: { kind: 'candidate' }, variant: defVariant, itKw: perSite, goLive: waveDates[0], wave: 1, route: 'edge', status: 'Accepted', city: nl.city || undefined, country: nl.country || undefined, latitude: nl.latitude, longitude: nl.longitude, notes: 'New location (not in the estate yet)' }]); setNl({ name: '', city: '', country: '', latitude: undefined, longitude: undefined }); };
  const upd = (id: string, p: Partial<T.PlannerSiteRow>) => commit(rows.map(r => (r.id === id ? { ...r, ...p } : r)));
  const setWaveDate = (i: number, iso: string) => { const d = [...waveDates]; d[i] = iso; commit(rows, d); };
  const size = (id: string) => a?.sites.find(s => s.row.id === id);
  return (
    <div>
      <SubTitle>Edge locations</SubTitle>
      <div style={{ ...muted, marginBottom: 6 }}>Each site is sized on its own with its power variant: the supply it has (from the survey), its backup (genset or battery) and its cooling. Pick planned or in-progress locations from the estate, or add a new location.</div>
      <div className="vw-flex vw-gap-sm vw-wrap" style={{ marginBottom: 6 }}>
        <Input size="small" allowClear prefix={<SearchOutlined />} placeholder="Search locations" value={q} onChange={e => setQ(e.target.value)} style={{ width: 220 }} />
        <Select size="small" allowClear placeholder="Any country" value={country} options={countries.map(c => ({ value: c, label: c }))} onChange={setCountry} style={{ minWidth: 160 }} />
        <Select size="small" mode="multiple" value={statuses} options={(['planned', 'in-progress', 'on-air', 'failed'] as const).map(s => ({ value: s, label: s }))} onChange={setStatuses} style={{ minWidth: 220 }} />
      </div>
      <div className="nst-table-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}><table className="nst-table" style={{ width: '100%' }}>
        <thead><tr><th>Location</th><th>Kind</th><th>Status</th><th>Blocker</th><th /></tr></thead>
        <tbody>{avail.slice(0, 60).map(l => <tr key={l.id}><td><b>{l.name}</b> <span style={muted}>{l.city}, {l.country}</span></td><td>{l.kind === 'pop' ? 'PoP' : 'Access site'}</td><td><VwChip variant={STATUS_TONE[l.status]}>{l.status}</VwChip></td><td style={{ whiteSpace: 'normal' }}>{l.blockerNote ?? '—'}</td><td><Button size="small" onClick={() => add(l)}>Add</Button></td></tr>)}
          {!avail.length && <tr><td colSpan={5} style={muted}>No location matches.</td></tr>}</tbody>
      </table></div>
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 1fr auto', alignItems: 'end', marginTop: 6 }}>
        <Field label="New location"><Input size="small" value={nl.name} placeholder="Name" onChange={e => setNl({ ...nl, name: e.target.value })} /></Field>
        <Field label="City"><Input size="small" value={nl.city} onChange={e => setNl({ ...nl, city: e.target.value })} /></Field>
        <Field label="Country"><Input size="small" value={nl.country} onChange={e => setNl({ ...nl, country: e.target.value })} /></Field>
        <Field label="Latitude"><InputNumber size="small" style={{ width: '100%' }} step={0.01} value={nl.latitude} onChange={v => setNl({ ...nl, latitude: v === null ? undefined : Number(v) })} /></Field>
        <Field label="Longitude"><InputNumber size="small" style={{ width: '100%' }} step={0.01} value={nl.longitude} onChange={v => setNl({ ...nl, longitude: v === null ? undefined : Number(v) })} /></Field>
        <Button size="small" onClick={addNew} disabled={!nl.name.trim()}>Add</Button>
      </div>

      <SubTitle extra={<Button size="small" onClick={() => commit(rows, [...waveDates, waveDates[waveDates.length - 1]])}>Add a wave</Button>}>Waves</SubTitle>
      <div className="vw-flex vw-gap-sm vw-wrap">{waveDates.map((d, i) => <Field key={i} label={`Wave ${i + 1} live`}><Input size="small" type="date" value={toDate(d)} onChange={e => setWaveDate(i, fromDate(e.target.value, d))} /></Field>)}</div>

      <SubTitle extra={<span style={muted}>{rows.length} site{rows.length === 1 ? '' : 's'} · {kwText(rows.reduce((s, r) => s + r.itKw, 0))}</span>}>Sites in the plan</SubTitle>
      {!rows.length ? <div style={muted}>No sites yet.</div> : (
        <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
          <thead><tr><th>Site</th><th>Power variant</th><th style={{ textAlign: 'right' }}>IT load</th><th style={{ textAlign: 'right' }}>Supply (survey)</th><th>Wave</th><th>Supply check</th><th /></tr></thead>
          <tbody>{rows.map(r => { const s = size(r.id); return (
            <tr key={r.id}>
              <td><b>{r.name}</b> <span style={muted}>{[r.city, r.country].filter(Boolean).join(', ')}{r.ref.kind === 'candidate' ? ' · new' : ''}</span></td>
              <td><Select size="small" value={r.variant ?? defVariant} options={EDGE_VARIANTS.map(v => ({ value: v.key, label: v.label }))} onChange={v => upd(r.id, { variant: v })} style={{ minWidth: 190 }} /></td>
              <td style={{ textAlign: 'right' }}><InputNumber size="small" min={1} value={r.itKw} addonAfter="kW" onChange={v => upd(r.id, { itKw: Number(v ?? 0) })} style={{ width: 120 }} /></td>
              <td style={{ textAlign: 'right' }}><InputNumber size="small" min={0} value={r.supplyKva} placeholder={s ? `${s.supplyKva} assumed` : 'assumed'} addonAfter="kVA" onChange={v => upd(r.id, { supplyKva: v === null ? undefined : Number(v) })} style={{ width: 150 }} /></td>
              <td><Select size="small" value={r.wave ?? 1} options={waveDates.map((d, i) => ({ value: i + 1, label: `${i + 1} · ${dayText(d)}` }))} onChange={v => upd(r.id, { wave: v })} style={{ minWidth: 140 }} /></td>
              <td>{s ? <Tooltip title={`Needs ${s.needKva} kVA (IT ${s.itKw} kW × PUE ${a?.pue}${s.variant.batteryHours ? ' plus battery recharge' : ''}) on ${s.supplyKva} kVA ${s.variant.supply}${s.supplySource === 'benchmark' ? ' (assumed: record the survey value)' : ''}`}><VwChip variant={s.needKva <= s.supplyKva ? 'success' : 'error'}>{s.needKva} of {s.supplyKva} kVA</VwChip></Tooltip> : '—'}</td>
              <td><Button size="small" type="text" danger onClick={() => commit(rows.filter(x => x.id !== r.id))}>Remove</Button></td>
            </tr>
          ); })}</tbody>
        </table></div>
      )}
    </div>
  );
}

/** Per-site plant (pack and Power step). */
export function EdgeSiteTable({ a }: { a: EdgeAnalysis }) {
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Site</th><th>Variant</th><th>Wave</th><th style={{ textAlign: 'right' }}>IT</th><th style={{ textAlign: 'right' }}>Racks</th><th style={{ textAlign: 'right' }}>Supply need</th><th>UPS (N+1)</th><th style={{ textAlign: 'right' }}>Battery</th><th>Genset</th><th>Cooling (1+1)</th></tr></thead>
      <tbody>{a.sites.map(s => (
        <tr key={s.row.id}>
          <td><b>{s.row.name}</b></td><td>{s.variant.label}</td><td>{s.wave} · {dayText(s.goLive)}</td><td style={{ textAlign: 'right' }}>{kwText(s.itKw)}</td><td style={{ textAlign: 'right' }}>{s.racks}</td>
          <td style={{ textAlign: 'right', color: s.needKva > s.supplyKva ? 'var(--vw-color-red-600)' : undefined }}>{s.needKva} of {s.supplyKva} kVA{s.supplySource === 'benchmark' ? ' (assumed)' : ''}</td>
          <td>{s.upsModules} × 10 kW</td><td style={{ textAlign: 'right' }}>{s.batteryKwh} kWh ({s.runtimeMin >= 60 ? `${s.runtimeMin / 60} h` : `${s.runtimeMin} min`})</td>
          <td>{s.gensetKva ? `${s.gensetKva} kVA, ${s.fuelHours} h fuel` : 'None (battery only)'}</td><td>2 × {s.coolingUnitKw} kW</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

/** Per-site load forecast: the regional view is only the roll-up of these. */
export function EdgeLadderTable({ rows }: { rows: EdgeLadderRow[] }) {
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Site</th><th style={{ textAlign: 'right' }}>Installed</th><th style={{ textAlign: 'right' }}>At go-live</th><th style={{ textAlign: 'right' }}>After 12 months</th><th style={{ textAlign: 'right' }}>After 24 months</th><th>Passes 85%</th><th>Status</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.site.row.id}><td>{r.site.row.name}</td><td style={{ textAlign: 'right' }}>{kwText(r.installedKw)}</td><td style={{ textAlign: 'right' }}>{kwText(r.day1Kw)}</td><td style={{ textAlign: 'right' }}>{kwText(r.month12Kw)}</td><td style={{ textAlign: 'right' }}>{kwText(r.month24Kw)}</td><td>{r.crossesMonth === undefined ? '—' : `month ${r.crossesMonth}`}</td><td><VwChip variant={r.status === 'ok' ? 'success' : r.status === 'tight' ? 'warning' : 'error'}>{r.status === 'ok' ? 'Room to grow' : r.status === 'tight' ? 'Tight in two years' : 'Full in two years'}</VwChip></td></tr>
      ))}</tbody>
    </table></div>
  );
}
