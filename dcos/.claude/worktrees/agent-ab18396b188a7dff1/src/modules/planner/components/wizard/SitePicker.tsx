/* Where the plan happens — a different picker for each kind of plan:
   - existing site (rack, pod, hall, retrofit, plant): choose a live data centre from a list with its
     free power and space; hall and retrofit also choose the hall. The kind of site comes from the site.
   - two sites (network uplift): both ends of the link.
   - migration: the site being emptied, and where the load goes.
   - campus (site expansion): the campus to grow and the name of the new building.
   - new site (new data centre, edge rollout): region, nearby campus, name, climate and kind of site.
   - region (portfolio): the region and the candidate sites. */
import { useMemo, useState } from 'react';
import { Input, Select } from 'antd';
import { VwChip } from '../../../../shared/components/ux';
import { SearchOutlined } from '../../../../shared/icons';
import { DC_TYPE_CATALOG, dcTypeName } from '../../../../mock/data/dcTypes';
import type * as T from '../../../../mock/data/types';
import { fmtKw } from '../../lib/engine';
import { CLIMATES, CLIMATE_LABEL, SITE_MODE, climateFromHint, mixForSiteType, siteMissing, type StepProps } from './wizardModel';
import { Field } from './ParamField';

interface SiteRow { dc: T.DataCenter; campus?: T.Campus; drawnKw: number; freeKw: number; freePositions: number; halls: number }

function useSiteRows(estate: StepProps['estate']): SiteRow[] {
  return useMemo(() => estate.dataCenters.map(dc => {
    const racks = estate.racks.filter(r => r.dataCenterId === dc.id);
    const halls = estate.halls.filter(h => h.dataCenterId === dc.id);
    const drawnKw = racks.reduce((a, r) => a + r.currentPowerKw, 0);
    return { dc, campus: estate.campuses.find(c => c.id === dc.campusId), drawnKw, freeKw: Math.max(0, dc.designPowerKw - drawnKw), freePositions: halls.reduce((a, h) => a + Math.max(0, h.rackCapacity - h.rackCount), 0), halls: halls.length };
  }).sort((a, b) => a.dc.code.localeCompare(b.dc.code)), [estate]);
}

/** Selectable list of live sites with the figures that matter for placing new load. */
function SiteList({ rows, value, onPick, needKw, exclude }: { rows: SiteRow[]; value?: string; onPick: (id: string) => void; needKw: number; exclude?: string }) {
  const [q, setQ] = useState('');
  const list = rows.filter(r => r.dc.id !== exclude && (!q || `${r.dc.code} ${r.dc.name} ${r.campus?.city ?? ''} ${dcTypeName(r.dc.dcTypeKey ?? '')}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="vw-flex vw-flex-col vw-gap-xs">
      <Input size="small" allowClear prefix={<SearchOutlined />} placeholder="Search by code, name, city or kind of site" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 360 }} />
      <div className="nst-table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
        <table className="nst-table" style={{ width: '100%' }}>
          <thead><tr><th>Site</th><th>Kind and tier</th><th style={{ textAlign: 'right' }}>Free power</th><th style={{ textAlign: 'right' }}>Free positions</th></tr></thead>
          <tbody>
            {list.map(r => { const sel = r.dc.id === value; const fits = needKw <= 0 || r.freeKw >= needKw; return (
              <tr key={r.dc.id} className={`is-clickable${sel ? ' is-selected' : ''}`} onClick={() => onPick(r.dc.id)} style={{ cursor: 'pointer' }}>
                <td><b>{r.dc.code}</b> <span style={{ color: 'var(--vw-color-slate-500)', fontSize: 12 }}>{r.campus?.city}</span>{r.dc.status !== 'Operational' && <VwChip variant="warning" style={{ fontSize: 10, marginLeft: 6 }}>{r.dc.status}</VwChip>}</td>
                <td style={{ fontSize: 12 }}>{dcTypeName(r.dc.dcTypeKey ?? '') || '—'} · {r.dc.tier}</td>
                <td style={{ textAlign: 'right', color: fits ? undefined : 'var(--vw-color-red-600)' }}>{fmtKw(r.freeKw)} <span style={{ color: 'var(--vw-color-slate-500)', fontSize: 11 }}>of {fmtKw(r.dc.designPowerKw)}</span></td>
                <td style={{ textAlign: 'right' }}>{r.freePositions.toLocaleString('en-US')}</td>
              </tr>
            ); })}
            {list.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--vw-color-slate-500)' }}>No site matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The chosen site as a compact card: what is there today and whether this plan fits. */
function SiteCard({ row, needKw, label }: { row: SiteRow; needKw: number; label: string }) {
  const pct = row.dc.designPowerKw ? Math.round((row.drawnKw / row.dc.designPowerKw) * 100) : 0;
  const fits = needKw <= 0 || row.freeKw >= needKw;
  return (
    <div className="vw-card-child" style={{ padding: '10px 14px' }}>
      <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm vw-wrap">
        <span><span style={{ fontSize: 11, color: 'var(--vw-color-slate-500)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span><div style={{ fontWeight: 600 }}>{row.dc.code} · {row.dc.name}</div></span>
        <span className="vw-flex vw-gap-xs vw-wrap"><VwChip variant="neutral">{dcTypeName(row.dc.dcTypeKey ?? '') || 'Kind not set'}</VwChip><VwChip variant="neutral">{row.dc.tier}</VwChip>{needKw > 0 && <VwChip variant={fits ? 'success' : 'error'}>{fits ? 'Has room for this plan' : `${fmtKw(needKw - row.freeKw)} short`}</VwChip>}</span>
      </div>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--vw-color-slate-100)', margin: '8px 0 4px' }}>
        <span style={{ width: `${Math.min(100, pct)}%`, background: pct >= 85 ? 'var(--vw-color-red-600)' : 'var(--vw-color-blue-500, #3b82f6)' }} />
        {needKw > 0 && <span style={{ width: `${Math.min(100 - Math.min(100, pct), row.dc.designPowerKw ? (needKw / row.dc.designPowerKw) * 100 : 0)}%`, background: fits ? 'var(--vw-color-green-600)' : 'var(--vw-color-red-600)', opacity: 0.6 }} />}
      </div>
      <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>{fmtKw(row.drawnKw)} drawn of {fmtKw(row.dc.designPowerKw)} ({pct}%) · {fmtKw(row.freeKw)} free · {row.halls} halls · {row.freePositions.toLocaleString('en-US')} free rack positions{needKw > 0 ? ` · this plan adds ${fmtKw(needKw)}` : ''}</div>
    </div>
  );
}

export function SitePicker({ draft, patch, estate }: StepProps) {
  const mode = SITE_MODE[draft.scope];
  const rows = useSiteRows(estate);
  const byId = (id?: string) => rows.find(r => r.dc.id === id);
  const needKw = draft.scope === 'migration' || draft.scope === 'network' ? 0 : draft.designPowerKw;
  const missing = siteMissing(draft);
  const pickSite = (id: string) => {
    const r = byId(id); if (!r) return;
    const params = { ...draft.params }; if (r.dc.id !== draft.dataCenterId) delete params.targetHallId;
    patch({ dataCenterId: r.dc.id, campusId: r.dc.campusId, regionId: r.campus?.regionId ?? draft.regionId, dcTypeKey: r.dc.dcTypeKey ?? draft.dcTypeKey, climate: climateFromHint(r.campus?.city) ?? draft.climate, newSiteName: undefined, params });
  };
  const site = byId(draft.dataCenterId);

  if (mode === 'existing') {
    const halls = estate.halls.filter(h => h.dataCenterId === draft.dataCenterId);
    const racksByHall = (hid: string) => estate.racks.filter(r => r.hallId === hid).reduce((a, r) => a + r.currentPowerKw, 0);
    const needsHall = draft.scope === 'hall' || draft.scope === 'retrofit';
    return (
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>This plan works inside a live site. Pick it from the list; its kind, tier and climate set the defaults.</div>
        {site && <SiteCard row={site} needKw={needKw} label="Selected site" />}
        <SiteList rows={rows.filter(r => r.dc.status === 'Operational' || r.dc.id === draft.dataCenterId)} value={draft.dataCenterId} onPick={pickSite} needKw={needKw} />
        {needsHall && site && (
          <Field label={draft.scope === 'retrofit' ? 'Hall to retrofit' : 'Hall to fit out'}>
            <Select value={draft.params.targetHallId as string | undefined} placeholder="Pick the hall" onChange={v => patch({ params: { ...draft.params, targetHallId: v }, paramSources: { ...draft.paramSources, targetHallId: 'user' } })}
              options={halls.map(h => ({ value: h.id, label: `${h.name} · ${fmtKw(h.designPowerKw)} design · ${fmtKw(racksByHall(h.id))} drawn · ${Math.max(0, h.rackCapacity - h.rackCount)} free positions` }))} />
          </Field>
        )}
        {missing && <span style={{ fontSize: 12, color: 'var(--vw-color-red-600)' }}>{missing}.</span>}
      </div>
    );
  }

  if (mode === 'two-sites' || mode === 'migration') {
    const peer = byId(draft.peerDataCenterId);
    const aLabel = mode === 'two-sites' ? 'First end' : 'Site being emptied';
    const bLabel = mode === 'two-sites' ? 'Other end' : 'Where the load goes';
    const options = rows.map(r => ({ value: r.dc.id, label: `${r.dc.code} · ${r.dc.name} · ${r.campus?.city ?? ''}` }));
    return (
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>{mode === 'two-sites' ? 'An interconnect joins two live sites. Pick both ends.' : 'Pick the site being emptied and, unless it is a pure decommission, where the load goes.'}</div>
        <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Field label={aLabel}><Select showSearch optionFilterProp="label" value={draft.dataCenterId} placeholder="Pick a site" options={options.filter(o => o.value !== draft.peerDataCenterId)} onChange={pickSite} /></Field>
          <Field label={bLabel}><Select showSearch allowClear optionFilterProp="label" value={draft.peerDataCenterId} placeholder={mode === 'migration' ? 'Decommission only' : 'Pick a site'} options={options.filter(o => o.value !== draft.dataCenterId)} onChange={v => patch({ peerDataCenterId: v })} /></Field>
        </div>
        <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {site ? <SiteCard row={site} needKw={0} label={aLabel} /> : <div />}
          {peer ? <SiteCard row={peer} needKw={mode === 'migration' ? draft.designPowerKw : 0} label={bLabel} /> : <div />}
        </div>
        {missing && <span style={{ fontSize: 12, color: 'var(--vw-color-red-600)' }}>{missing}.</span>}
      </div>
    );
  }

  if (mode === 'campus') {
    const campuses = estate.campuses.map(c => { const sites = rows.filter(r => r.dc.campusId === c.id); return { c, sites, design: sites.reduce((a, r) => a + r.dc.designPowerKw, 0), free: sites.reduce((a, r) => a + r.freeKw, 0) }; });
    const chosen = campuses.find(x => x.c.id === draft.campusId);
    const pickCampus = (id: string) => { const x = campuses.find(y => y.c.id === id); if (!x) return; const main = x.sites[0]?.dc; patch({ campusId: id, regionId: x.c.regionId, dataCenterId: undefined, dcTypeKey: main?.dcTypeKey ?? draft.dcTypeKey, climate: climateFromHint(x.c.city) ?? draft.climate, newSiteName: draft.newSiteName || `${x.c.city.toUpperCase().slice(0, 3)}-B${x.sites.length + 1}` }); };
    return (
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>An expansion adds a building or hall block to a campus you already run, sharing its utility and plant where possible.</div>
        <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {campuses.map(x => { const sel = x.c.id === draft.campusId; return (
            <div key={x.c.id} role="button" tabIndex={0} onClick={() => pickCampus(x.c.id)} onKeyDown={e => { if (e.key === 'Enter') pickCampus(x.c.id); }} className={`vw-card-child vw-card--clickable${sel ? ' vw-card--info' : ''}`} style={{ padding: '8px 12px', border: sel ? '1px solid var(--primaryColor500)' : '1px solid transparent' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{x.c.name}</div>
              <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>{x.c.city}, {x.c.country} · {x.sites.length} site{x.sites.length === 1 ? '' : 's'}</div>
              <div style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>{fmtKw(x.design)} design · {fmtKw(x.free)} free</div>
            </div>
          ); })}
        </div>
        {chosen && (
          <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <Field label="New building name"><Input value={draft.newSiteName ?? ''} onChange={e => patch({ newSiteName: e.target.value })} /></Field>
            <Field label="Kind of site" hint="Defaults to the campus's existing sites"><Select showSearch optionFilterProp="label" value={draft.dcTypeKey} options={DC_TYPE_CATALOG.map(p => ({ value: p.key, label: p.name }))} onChange={v => patch({ dcTypeKey: v, demand: { ...draft.demand, ...mixForSiteType(v) } })} /></Field>
            <Field label="Climate"><Select value={draft.climate} options={CLIMATES.map(c => ({ value: c, label: CLIMATE_LABEL[c] }))} onChange={v => patch({ climate: v })} /></Field>
          </div>
        )}
        {missing && <span style={{ fontSize: 12, color: 'var(--vw-color-red-600)' }}>{missing}.</span>}
      </div>
    );
  }

  // new site and region
  const campuses = estate.campuses.filter(c => !draft.regionId || c.regionId === draft.regionId);
  const profile = DC_TYPE_CATALOG.find(p => p.key === draft.dcTypeKey);
  const candidates = String(draft.params.candidateSiteIds ?? '').split(',').filter(Boolean);
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>{mode === 'region' ? 'A portfolio plan decides where capacity goes across a region. Pick the region and the sites to consider.' : draft.scope === 'edge' ? 'An edge rollout stamps the same small site many times. Pick the region and name the rollout.' : 'A new site on new land. Pick the region, the nearest campus for shared services, the name, the climate and the kind of site.'}</div>
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Field label="Region"><Select value={draft.regionId} placeholder="Pick a region" options={estate.regions.map(r => ({ value: r.id, label: r.name }))} onChange={v => patch({ regionId: v, campusId: undefined, dataCenterId: undefined })} /></Field>
        {mode === 'new' && <Field label="Nearest campus (optional)" hint="For shared spares, staff and network"><Select allowClear showSearch optionFilterProp="label" value={draft.campusId} placeholder="None" options={campuses.map(c => ({ value: c.id, label: `${c.name} · ${c.city}` }))} onChange={v => { const c = estate.campuses.find(x => x.id === v); patch({ campusId: v, regionId: c?.regionId ?? draft.regionId, climate: climateFromHint(c?.city) ?? draft.climate }); }} /></Field>}
        {mode === 'new' && <Field label={draft.scope === 'edge' ? 'Rollout name' : 'New site name'}><Input value={draft.newSiteName ?? ''} placeholder={draft.scope === 'edge' ? 'e.g. EU edge wave 1' : 'e.g. FRA-AI1'} onChange={e => patch({ newSiteName: e.target.value })} /></Field>}
        {mode === 'region' && <Field label="Sites to consider" style={{ gridColumn: 'span 2' }}><Select mode="multiple" allowClear value={candidates} placeholder="All sites in the region" options={rows.filter(r => !draft.regionId || r.campus?.regionId === draft.regionId).map(r => ({ value: r.dc.id, label: `${r.dc.code} · ${fmtKw(r.freeKw)} free` }))} onChange={v => patch({ params: { ...draft.params, candidateSiteIds: v.join(',') }, paramSources: { ...draft.paramSources, candidateSiteIds: 'user' } })} /></Field>}
        <Field label="Climate"><Select value={draft.climate} options={CLIMATES.map(c => ({ value: c, label: CLIMATE_LABEL[c] }))} onChange={v => patch({ climate: v })} /></Field>
        <Field label="Kind of site" hint={profile ? `${profile.cooling} · ${profile.redundancy} · ${profile.defaultTier}` : undefined} style={{ gridColumn: 'span 2' }}><Select showSearch optionFilterProp="label" value={draft.dcTypeKey} options={DC_TYPE_CATALOG.map(p => ({ value: p.key, label: `${p.name} · ${p.segment}` }))} onChange={v => patch({ dcTypeKey: v, demand: { ...draft.demand, ...mixForSiteType(v) } })} /></Field>
      </div>
      {missing && <span style={{ fontSize: 12, color: 'var(--vw-color-red-600)' }}>{missing}.</span>}
    </div>
  );
}
