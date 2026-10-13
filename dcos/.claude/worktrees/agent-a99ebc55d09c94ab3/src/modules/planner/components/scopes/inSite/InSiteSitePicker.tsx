/* Where an in-site plan happens: live sites with their real IT headroom (power chain at redundancy,
   holds and approved plans), then the halls with free positions and hall and zone headroom.
   A hall fit-out also says what the hall is today (shell, partly used, or a new hall on a floor). */
import { useMemo, useState } from 'react';
import { Input, InputNumber, Select } from 'antd';
import { VwChip } from '../../../../../shared/components/ux';
import { SearchOutlined } from '../../../../../shared/icons';
import { dcTypeName } from '../../../../../mock/data/dcTypes';
import { planAddedKw, siteBaseline, type SiteBaseline } from '../../../lib/site';
import { Field } from '../../wizard/ParamField';
import { climateFromHint, siteMissing, type StepProps } from '../../wizard/wizardModel';
import { ChecksBlock, ShortfallBanner } from './common';
import { analysisOf, kwFmt, muted, num, rescalePhases } from './helpers';

const MODES = ['Shell hall (full fit-out)', 'Partly used hall (fill free positions)', 'New hall on a floor'];

export function InSiteSitePicker({ draft, patch, ev, data }: StepProps) {
  const [q, setQ] = useState('');
  const need = planAddedKw(draft);
  const rows = useMemo(() => data.ready ? data.dataCenters.filter(d => d.status === 'Operational' || d.id === draft.dataCenterId).map(dc => ({ dc, site: siteBaseline(data, dc.id, { excludePlanId: draft.id }), campus: data.campuses.find(c => c.id === dc.campusId) })).filter((x): x is { dc: typeof x.dc; site: SiteBaseline; campus: typeof x.campus } => !!x.site).sort((a, b) => a.dc.code.localeCompare(b.dc.code)) : [], [data, draft.dataCenterId, draft.id]);
  const a = analysisOf(ev);
  const chosen = rows.find(r => r.dc.id === draft.dataCenterId);
  const list = rows.filter(r => !q || `${r.dc.code} ${r.dc.name} ${r.campus?.city ?? ''} ${dcTypeName(r.dc.dcTypeKey ?? '')}`.toLowerCase().includes(q.toLowerCase()));
  const pick = (id: string) => {
    const r = rows.find(x => x.dc.id === id); if (!r) return;
    const params = { ...draft.params }; if (r.dc.id !== draft.dataCenterId) { delete params.targetHallId; delete params.preferredHallId; }
    patch({ dataCenterId: r.dc.id, campusId: r.dc.campusId, regionId: r.campus?.regionId ?? draft.regionId, dcTypeKey: r.dc.dcTypeKey ?? draft.dcTypeKey, climate: climateFromHint(r.campus?.city) ?? draft.climate, newSiteName: undefined, params, ...(r.dc.id !== draft.dataCenterId ? { placement: undefined, waves: [], inSite: { ...draft.inSite, retrofit: [], newHall: undefined } } : {}) });
  };
  const hallKey = draft.scope === 'hall' || draft.scope === 'retrofit' ? 'targetHallId' : 'preferredHallId';
  const pickHall = (id: string | undefined) => {
    const params = { ...draft.params }; const sources = { ...draft.paramSources };
    if (id) { params[hallKey] = id; sources[hallKey] = 'user'; } else { delete params[hallKey]; delete sources[hallKey]; }
    patch({ params, paramSources: sources, ...(draft.scope === 'retrofit' && id !== draft.params.targetHallId ? { inSite: { ...draft.inSite, retrofit: [] }, waves: [] } : {}) });
  };
  const missing = siteMissing(draft);
  const mode = String(draft.params.hallMode ?? '');
  const newHall = /new hall/i.test(mode);
  const floors = chosen ? data.floors.filter(f => data.buildings.find(b => b.id === f.buildingId)?.dataCenterId === chosen.dc.id) : [];
  const floorFree = (fid: string) => { const f = data.floors.find(x => x.id === fid); if (!f) return 0; return Math.round(f.usableAreaSqm - data.halls.filter(h => h.floorId === fid).reduce((s, h) => s + (h.areaSqm ?? h.rackCapacity * 2.6), 0)); };
  const nh = draft.inSite?.newHall;
  const setNewHall = (p: Partial<NonNullable<typeof nh>>) => patch({ inSite: { ...draft.inSite, newHall: { floorId: nh?.floorId ?? floors[0]?.id ?? '', name: nh?.name ?? 'New hall', areaSqm: nh?.areaSqm ?? 300, positions: nh?.positions ?? 100, designKw: nh?.designKw ?? draft.designPowerKw, ...p } } });
  const sizeToHall = () => {
    const h = a?.hall; if (!h || !h.hall) return;
    const density = Number(draft.params.densityKwPerRack ?? 12) || 12;
    const racks = Math.max(1, Math.min(h.positionsAvail, Math.floor(Math.max(0, h.designLeftKw) / density)));
    const kw = Math.round(racks * density * 10) / 10;
    patch({ designPowerKw: kw, phases: rescalePhases(draft, kw, racks), inSite: { ...draft.inSite, classes: undefined } });
  };
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <div style={muted}>This plan works inside a live site. Headroom is the IT kW the site can still take: the power chain at its redundancy (largest unit lost, one side of 2N), less today&apos;s load, capacity holds and approved plans.</div>
      <Input size="small" allowClear prefix={<SearchOutlined />} placeholder="Search by code, name, city or kind of site" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 360 }} />
      <div className="nst-table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}><table className="nst-table" style={{ width: '100%' }}>
        <thead><tr><th>Site</th><th>Kind</th><th style={num}>IT headroom</th><th>Binding</th><th style={num}>Cooling headroom</th><th style={num}>Free positions</th><th>Fit</th></tr></thead>
        <tbody>{list.map(r => { const sel = r.dc.id === draft.dataCenterId; const fits = need <= 0 || r.site.headroomItKw >= need; const free = r.site.halls.reduce((s, h) => s + h.freePositions, 0); return (
          <tr key={r.dc.id} className={`is-clickable${sel ? ' is-selected' : ''}`} onClick={() => pick(r.dc.id)} style={{ cursor: 'pointer' }}>
            <td><b>{r.dc.code}</b> <span style={muted}>{r.campus?.city}</span></td><td style={{ fontSize: 12 }}>{dcTypeName(r.dc.dcTypeKey ?? '') || '—'}{r.site.dcPlant ? ' · −48 V DC' : ''}</td>
            <td style={num}>{kwFmt(r.site.headroomItKw)}</td><td style={{ fontSize: 12 }}>{r.site.binding?.label ?? '—'}</td>
            <td style={num}>{kwFmt(r.site.cooling.headroomKw)}</td><td style={num}>{free}</td>
            <td>{need > 0 ? <VwChip variant={fits ? 'success' : 'error'}>{fits ? 'Has room' : `${kwFmt(need - r.site.headroomItKw)} short`}</VwChip> : null}</td>
          </tr>); })}
          {!data.ready && <tr><td colSpan={7} style={muted}>Loading the estate…</td></tr>}</tbody>
      </table></div>
      {chosen && (<>
        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{draft.scope === 'hall' ? 'Hall to fit out' : draft.scope === 'retrofit' ? 'Hall to retrofit' : 'Preferred hall (optional)'} at {chosen.dc.code}</div>
        {draft.scope === 'hall' && <Field label="What the hall is today"><Select value={mode || undefined} placeholder="Pick: shell, partly used or a new hall" options={MODES.map(m => ({ value: m, label: m }))} onChange={v => patch({ params: { ...draft.params, hallMode: v }, paramSources: { ...draft.paramSources, hallMode: 'user' } })} style={{ maxWidth: 380 }} /></Field>}
        {!newHall && <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
          <thead><tr><th>Hall</th><th>Status</th><th style={num}>Free positions</th><th style={num}>Design</th><th style={num}>Drawn</th><th style={num}>Hall headroom</th><th>Zone</th><th style={num}>Zone headroom</th></tr></thead>
          <tbody>
            {hallKey === 'preferredHallId' && <tr className={`is-clickable${!draft.params.preferredHallId ? ' is-selected' : ''}`} onClick={() => pickHall(undefined)} style={{ cursor: 'pointer' }}><td colSpan={8}>Any hall at the site</td></tr>}
            {chosen.site.halls.map(h => { const z = chosen.site.cooling.zones.find(zz => zz.zone.id === h.hall.coolingZoneId); const sel = draft.params[hallKey] === h.hall.id; return (
              <tr key={h.hall.id} className={`is-clickable${sel ? ' is-selected' : ''}`} onClick={() => pickHall(h.hall.id)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 500 }}>{h.hall.name}</td><td>{h.status}</td><td style={num}>{h.freePositions} of {h.positions}</td><td style={num}>{kwFmt(h.designKw)}</td><td style={num}>{kwFmt(h.loadKw)}</td><td style={num}>{kwFmt(h.headroomKw)}</td>
                <td>{z?.zone.name ?? '—'}{z && z.hallIds.length > 1 ? <VwChip variant="neutral" style={{ marginLeft: 4, fontSize: 10 }}>shared by {z.hallIds.length} halls</VwChip> : null}</td><td style={num}>{z ? kwFmt(z.headroomKw) : '—'}</td>
              </tr>); })}
          </tbody>
        </table></div>}
        {draft.scope === 'hall' && newHall && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
            <Field label="Floor" hint={nh?.floorId ? `${floorFree(nh.floorId)} m² of usable area left` : undefined}><Select value={nh?.floorId} placeholder="Pick a floor" options={floors.map(f => ({ value: f.id, label: `${f.name} · ${floorFree(f.id)} m² free` }))} onChange={v => setNewHall({ floorId: v })} /></Field>
            <Field label="Hall name"><Input value={nh?.name ?? ''} onChange={e => setNewHall({ name: e.target.value })} /></Field>
            <Field label="Area" hint="m² of white space"><InputNumber min={50} max={20000} value={nh?.areaSqm} onChange={v => typeof v === 'number' && setNewHall({ areaSqm: v })} style={{ width: '100%' }} /></Field>
            <Field label="Positions"><InputNumber min={4} max={2000} value={nh?.positions} onChange={v => typeof v === 'number' && setNewHall({ positions: v })} style={{ width: '100%' }} /></Field>
            <Field label="Design load" hint="kW"><InputNumber min={10} max={20000} value={nh?.designKw} onChange={v => typeof v === 'number' && setNewHall({ designKw: v })} style={{ width: '100%' }} /></Field>
          </div>
        )}
        {draft.scope === 'hall' && a?.hall?.hall && !newHall && <div className="vw-flex vw-gap-sm vw-items-center"><button type="button" className="nst-btn nst-btn--sm" onClick={sizeToHall}>Size the plan to the hall</button><span style={muted}>{a.hall.positionsAvail} free positions, {kwFmt(Math.max(0, a.hall.designLeftKw))} left of the hall design; now {a.hall.racks} racks and {kwFmt(a.hall.kw)}.</span></div>}
      </>)}
      <ShortfallBanner a={a} plan={draft} />
      <ChecksBlock a={a} keys={['ins-site-power']} />
      {missing && <span style={{ fontSize: 12, color: 'var(--vw-color-red-600)' }}>{missing}.</span>}
    </div>
  );
}
