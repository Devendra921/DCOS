/* Old to new for server and network refreshes: one row per old model and role with its new model,
   ratio (old per new) and what happens to the old ones; then where each new unit comes from
   (stock or purchase), the load before and after, and the per-device list. */
import { useState } from 'react';
import { InputNumber, Select } from 'antd';
import { VwChip } from '../../../../shared/components/ux';
import type * as T from '../../../../mock/data/types';
import { fmtKw } from '../../lib/engine';
import { replaceOf } from '../../lib/replaceAnalysis';
import { ROLE_MODELS, toPlanMapping, type MapRow } from '../../lib/replaceCore';
import { byId } from '../../lib/plannerData';
import { phasesFromWaves } from '../../lib/waves';
import { Stat } from '../kit';
import type { StepProps } from './wizardModel';
import { SubTitle } from './ParamField';

const DISP: { value: T.PlannerMappingRow['disposition']; label: string }[] = [{ value: 'dispose', label: 'Certified disposal' }, { value: 'keep', label: 'Keep as spares' }, { value: 'resell', label: 'Resell' }];
const muted = { color: 'var(--vw-color-slate-500)' } as const;

export function ReplacementPanel({ draft, ev, patch, data, goTo }: StepProps) {
  const [all, setAll] = useState(false);
  const a = ev ? replaceOf(ev) : undefined;
  if (!a?.ready) return <div className="vw-card-description">{a?.reason ?? 'Loading…'}</div>;
  if (!a.old.length) return <div className="vw-card-description">Nothing selected yet. <a onClick={() => goTo('requirements')}>Select what is being replaced</a>.</div>;
  const save = (row: MapRow, p: Partial<T.PlannerMappingRow>) => {
    const rows = a.mapping.map(m => (m.id === row.id ? { ...m, ...p } : m));
    const am = (model: string) => data.assetModels.find(x => x.model === model);
    const out = toPlanMapping(rows).map(m => { const units = Math.ceil(m.count / Math.max(1, m.ratio)); return { ...m, newUnits: units, newKw: Math.round((units * (am(m.newModel)?.typicalPowerW ?? 0)) / 100) / 10 }; });
    const kw = Math.max(0, Math.round(out.reduce((s, m) => s + m.newKw, 0)));
    patch({ mapping: out, designPowerKw: kw, phases: phasesFromWaves(draft.waves ?? [], kw), params: { ...draft.params, ...(draft.scope === 'server-refresh' && out[0] ? { replacementModel: out[0].newModel } : {}) } });
  };
  const stock = a.supply.reduce((s, x) => s + x.stock, 0), buy = a.supply.reduce((s, x) => s + x.procure, 0);
  const rows = a.units.flatMap(u => u.oldIds.map((id, i) => ({ u, d: byId(data, 'devices', id)!, first: i === 0 }))).filter(x => x.d);
  const waveOf = (id: string) => (draft.waves ?? []).find(w => w.deviceIds.includes(id))?.name;
  return (<>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
      <Stat label="Devices out" value={a.old.length} sub={`in ${a.rackIds.length} racks · ${fmtKw(a.oldKw)} measured`} />
      <Stat label="Units in" value={a.units.length} sub={`${fmtKw(a.newKw)} typical, ${fmtKw(a.peakKw)} peak`} />
      <Stat label="Load change" value={`${a.deltaKw > 0 ? '+' : ''}${a.deltaKw} kW`} tone={a.deltaKw > 0 ? 'warn' : 'ok'} sub="new typical against measured today" />
      <Stat label="From stock / to buy" value={`${stock} / ${buy}`} sub={a.supply.map(s => `${s.model}: ${s.stock} spare, ${s.procure} bought (${s.leadWeeks} wk)`).join(' · ')} tone={buy ? undefined : 'ok'} />
    </div>
    <SubTitle extra={!(draft.mapping ?? []).length && <VwChip variant="warning">Catalogue defaults; change and they are saved</VwChip>}>Old to new</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Going out</th><th>Role</th><th style={{ textAlign: 'right' }}>Count</th><th>New model</th><th style={{ textAlign: 'right' }}>Old per new</th><th style={{ textAlign: 'right' }}>New units</th><th style={{ textAlign: 'right' }}>kW old → new</th><th>Old ones</th></tr></thead>
      <tbody>{a.mapping.map(m => (
        <tr key={m.id}>
          <td><b>{m.oldModel}</b></td><td>{m.role}</td><td style={{ textAlign: 'right' }}>{m.count}</td>
          <td><Select size="small" style={{ width: 200 }} value={m.newModel || undefined} placeholder="No catalogue model" options={ROLE_MODELS[m.roleKey].map(x => ({ value: x, label: x }))} onChange={v => save(m, { newModel: v })} /></td>
          <td style={{ textAlign: 'right' }}><InputNumber size="small" min={1} max={8} value={m.ratio} onChange={v => typeof v === 'number' && save(m, { ratio: v })} style={{ width: 64 }} /></td>
          <td style={{ textAlign: 'right' }}>{m.newUnits}</td>
          <td style={{ textAlign: 'right' }}>{m.oldKw} → {m.newKw} <span style={muted}>(peak {m.peakKw})</span></td>
          <td><Select size="small" style={{ width: 160 }} value={m.disposition} options={DISP} onChange={v => save(m, { disposition: v })} /></td>
        </tr>
      ))}</tbody>
    </table></div>
    <div style={{ fontSize: 12, ...muted, marginTop: 4 }}>New load is units × the model's typical draw (peak: its maximum, used for the feed check). Old load is what the devices draw today.</div>
    <SubTitle extra={<a onClick={() => setAll(!all)} style={{ fontSize: 12 }}>{all ? 'Show fewer' : `Show all ${rows.length}`}</a>}>Per device</SubTitle>
    <div className="nst-table-wrap" style={{ maxHeight: all ? 480 : undefined, overflowY: 'auto' }}><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Old device</th><th>Rack · U</th><th>New unit</th><th>Goes to</th><th>Keeps</th><th>Wave</th><th>Note</th></tr></thead>
      <tbody>{(all ? rows : rows.slice(0, 12)).map(({ u, d, first }) => (
        <tr key={d.id}>
          <td>{d.name}</td><td>{byId(data, 'racks', d.rackId)?.name ?? '—'} · U{d.position ?? '—'}</td>
          <td>{first ? `${u.id} · ${u.model}` : <span style={muted}>with {u.id}</span>}</td>
          <td>{first ? (u.placed ? `${byId(data, 'racks', u.rackId)?.name ?? '—'} · U${u.startU ?? '—'}` : <span style={{ color: 'var(--vw-color-red-600)' }}>No position</span>) : ''}</td>
          <td>{first ? [u.keepIp4, u.keepOob && `OOB ${u.keepOob}`].filter(Boolean).join(', ') || '—' : <span style={muted}>addresses released</span>}</td>
          <td>{waveOf(d.id) ?? <span style={muted}>not in a wave</span>}</td>
          <td style={{ whiteSpace: 'normal', fontSize: 12 }}>{first ? u.note : ''}</td>
        </tr>
      ))}</tbody>
    </table></div>
  </>);
}
