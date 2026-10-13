/* Plant line editor (what is added, replaced or uprated) and the cut-in sequence editor. */
import { Input, InputNumber, Select, Tooltip } from 'antd';
import { VwButton as Button } from '../../../../../shared/components/vw/VwButton';
import { VwChip } from '../../../../../shared/components/ux';
import { DeleteOutlined, PlusOutlined } from '../../../../../shared/icons';
import type * as T from '../../../../../mock/data/types';
import { fmtKw } from '../../../lib/engine';
import { DEFAULT_PF, LINE_SYSTEM, LINE_SYSTEMS, SYSTEM_LABEL, type PlantAnalysis, type PlantSystem, type RedundancyLeft } from '../../../lib/plantModel';
import { fromDateInput, toDateInput, fmtDay, type StepProps } from '../../wizard/wizardModel';

const KVA_SYSTEMS: T.PlannerPlantLine['system'][] = ['Transformer', 'Generator'];
const ACTIONS: { value: T.PlannerPlantLine['action']; label: string }[] = [{ value: 'add', label: 'Add' }, { value: 'replace', label: 'Replace' }, { value: 'uprate', label: 'Uprate' }];
const TRANSFERS: T.PlannerCutInStep['transfer'][] = ['Transfer to B path', 'Static bypass', 'Maintenance bypass', 'Temporary generator', 'Rental chiller', 'None'];
const LEFT_TONE: Record<RedundancyLeft, 'success' | 'warning' | 'error'> = { 'N+1 or better': 'success', N: 'warning', 'Below N': 'error', 'Unprotected (raw mains)': 'error' };
const nextId = (prefix: string, ids: string[]) => { let n = ids.length + 1; while (ids.includes(`${prefix}-${n}`)) n++; return `${prefix}-${n}`; };

/** Existing assets a line can target, by system (zones for room cooling). */
function targetOptions(an: PlantAnalysis | undefined, system: T.PlannerPlantLine['system']) {
  const b = an?.baseline; if (!b) return [];
  const sys = LINE_SYSTEM[system];
  const units = b.systems.find(s => s.system === (system === 'Switchgear' ? 'transformer' : sys))?.units ?? [];
  const opts = units.map(u => ({ value: u.id, label: `${u.name} · ${fmtKw(u.capacityKw)}${u.side ? ` · ${u.side} side` : ''}${u.model ? ` · ${u.model}` : ''}` }));
  if (sys === 'cooling') return [...b.zones.map(z => ({ value: z.zone.id, label: `${z.zone.name} (zone) · ${fmtKw(z.usableKw)} usable` })), ...opts];
  return opts;
}

export function PlantLinesEditor({ draft, patch, ev, an, systems, stages }: StepProps & { an?: PlantAnalysis; systems: PlantSystem[]; stages: { stage: number; name: string }[] }) {
  const lines = draft.plantLines ?? [];
  const shown = lines.filter(l => systems.includes(LINE_SYSTEM[l.system]));
  const set = (id: string, p: Partial<T.PlannerPlantLine>) => patch({ plantLines: lines.map(l => (l.id === id ? { ...l, ...p } : l)) });
  const tier = String(ev?.params.tier?.value ?? 'Tier III');
  const kinds = LINE_SYSTEMS.filter(s => systems.includes(LINE_SYSTEM[s]));
  const add = () => patch({ plantLines: [...lines, { id: nextId('PL', lines.map(l => l.id)), system: kinds[0], action: 'add', ratingKw: 0, qty: 1, stage: 1 }] });
  return (
    <div className="vw-flex vw-flex-col vw-gap-xs">
      <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
        <thead><tr><th>System</th><th>Action</th><th>Existing asset</th><th>Model</th><th>Rating</th><th>Qty</th><th>Stage</th><th>Sizing</th><th /></tr></thead>
        <tbody>
          {shown.map(l => {
            const r = an?.lines.find(x => x.line.id === l.id);
            const kva = KVA_SYSTEMS.includes(l.system);
            return (
              <tr key={l.id}>
                <td><Select size="small" value={l.system} style={{ width: 120 }} options={kinds.map(k => ({ value: k, label: k }))} onChange={v => set(l.id, { system: v, targetAssetId: undefined, ratingKva: undefined })} /></td>
                <td><Select size="small" value={l.action} style={{ width: 96 }} options={ACTIONS} onChange={v => set(l.id, { action: v })} /></td>
                <td><Select size="small" allowClear value={l.targetAssetId} placeholder={l.action === 'add' ? 'Frame or zone (optional)' : 'Pick the asset'} style={{ width: 230 }} options={targetOptions(an, l.system)} onChange={v => set(l.id, { targetAssetId: v, targetAssetLabel: targetOptions(an, l.system).find(o => o.value === v)?.label.split(' · ')[0], zoneId: an?.baseline?.zones.some(z => z.zone.id === v) ? v : l.zoneId })} status={r?.problems.some(p => /asset/.test(p)) ? 'error' : undefined} /></td>
                <td><Input size="small" value={l.model ?? ''} placeholder={l.system === 'UPS' && r?.target?.model ? `${r.target.model.split(' ')[0]} module` : 'Model'} style={{ width: 150 }} onChange={e => set(l.id, { model: e.target.value || undefined })} /></td>
                <td>
                  {kva
                    ? <span className="vw-flex vw-gap-xs vw-items-center"><InputNumber size="small" min={0} step={100} value={l.ratingKva} addonAfter="kVA" style={{ width: 130 }} onChange={v => set(l.id, { ratingKva: v ?? undefined, ratingKw: 0 })} /><Tooltip title="Power factor: kW = kVA × pf"><InputNumber size="small" min={0.5} max={1} step={0.01} value={l.powerFactor ?? DEFAULT_PF[l.system]} style={{ width: 70 }} onChange={v => set(l.id, { powerFactor: v ?? undefined })} /></Tooltip>{l.system === 'Generator' && <Select size="small" value={l.ratingBasis ?? 'Standby (ESP)'} style={{ width: 130 }} options={['Standby (ESP)', 'Prime (PRP)', 'Continuous (COP)'].map(v => ({ value: v, label: v }))} onChange={v => set(l.id, { ratingBasis: v as T.PlannerPlantLine['ratingBasis'] })} />}</span>
                    : l.system === 'Battery' ? <InputNumber size="small" min={1} max={60} value={l.runtimeMin ?? 10} addonAfter="min" style={{ width: 110 }} onChange={v => set(l.id, { runtimeMin: v ?? undefined })} />
                      : <InputNumber size="small" min={0} step={50} value={l.ratingKw || undefined} addonAfter={l.action === 'uprate' ? 'kW new' : 'kW'} style={{ width: 130 }} onChange={v => set(l.id, { ratingKw: v ?? 0 })} />}
                  {r && kva && <div style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>{r.ratingNote}</div>}
                </td>
                <td><InputNumber size="small" min={l.action === 'uprate' ? 1 : 1} max={60} value={l.qty} disabled={l.action === 'uprate'} style={{ width: 64 }} onChange={v => set(l.id, { qty: v ?? 1 })} /></td>
                <td><Select size="small" value={l.stage ?? 1} style={{ width: 150 }} options={stages.map(s => ({ value: s.stage, label: `${s.stage} · ${s.name}` }))} onChange={v => set(l.id, { stage: v })} /></td>
                <td style={{ whiteSpace: 'normal', minWidth: 200, fontSize: 12 }}>
                  {r?.problems.length ? <VwChip variant="error">{r.problems.join('; ')}</VwChip>
                    : r?.suggestedQty !== undefined ? <span>{r.suggestedQty === l.qty ? <VwChip variant="success">Matches the need</VwChip> : <><VwChip variant={r.suggestedQty > l.qty ? 'warning' : 'neutral'}>Need {r.suggestedQty}</VwChip> <a onClick={() => set(l.id, { qty: Math.max(1, r.suggestedQty!) })}>use</a></>}<div style={{ color: 'var(--vw-color-slate-500)' }}>{r.suggestionNote}</div></span>
                      : <span style={{ color: 'var(--vw-color-slate-500)' }}>{l.system === 'Battery' ? 'Runtime only' : l.system === 'Switchgear' ? 'No capacity change' : l.action === 'uprate' ? `Uprate ${r?.target ? `from ${fmtKw(r.target.capacityKw)}` : ''}` : '—'}</span>}
                </td>
                <td><Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove line" onClick={() => patch({ plantLines: lines.filter(x => x.id !== l.id), cutIns: (draft.cutIns ?? []).map(c => ({ ...c, connectsLineIds: (c.connectsLineIds ?? []).filter(id => id !== l.id) })) })} /></td>
              </tr>
            );
          })}
          {!shown.length && <tr><td colSpan={9} style={{ color: 'var(--vw-color-slate-500)' }}>No {systems.map(s => SYSTEM_LABEL[s].split(' (')[0].toLowerCase()).join(', ')} lines yet.</td></tr>}
        </tbody>
      </table></div>
      <span><Button size="small" icon={<PlusOutlined />} onClick={add}>Add a line</Button> <span style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>Sizing: needed at the target redundancy ({tier}) minus what the site can already use.</span></span>
    </div>
  );
}

export function CutInEditor({ draft, patch, an, stages }: StepProps & { an?: PlantAnalysis; stages: { stage: number; name: string }[] }) {
  const steps = [...(draft.cutIns ?? [])].sort((a, b) => a.order - b.order);
  const lines = draft.plantLines ?? [];
  const set = (id: string, p: Partial<T.PlannerCutInStep>) => patch({ cutIns: steps.map(s => (s.id === id ? { ...s, ...p } : s)) });
  const allUnits = (an?.baseline?.systems ?? []).flatMap(s => s.units).map(u => ({ value: u.id, label: `${u.name} · ${fmtKw(u.capacityKw)}${u.side ? ` · ${u.side}` : ''}` }));
  const hours = Number(draft.params.cutInWindowHours ?? 6);
  const propose = () => {
    const out: T.PlannerCutInStep[] = lines.filter(l => l.system !== 'Switchgear').map((l, i) => {
      const r = an?.lines.find(x => x.line.id === l.id); const sys = LINE_SYSTEM[l.system];
      const sided = sys === 'ups' && an?.baseline?.systems.find(s => s.system === 'ups')?.units.some(u => u.side);
      return { id: `CI-${i + 1}`, order: i + 1, stage: l.stage ?? 1, title: `${l.action === 'add' ? 'Connect' : l.action === 'replace' ? 'Replace' : 'Uprate'} ${l.system}${r?.target ? ` at ${r.target.name}` : ''}`, isolatedAssetIds: r?.target && r.target.system === sys ? [r.target.id] : [], isolatedLabel: r?.target?.name ?? '', transfer: sys === 'ups' ? (sided ? 'Transfer to B path' : 'Static bypass') : 'None', windowStart: '', windowEnd: '', mitigation: '', rollback: '', connectsLineIds: [l.id], status: 'Planned' };
    });
    patch({ cutIns: out });
  };
  const add = () => patch({ cutIns: [...steps, { id: nextId('CI', steps.map(s => s.id)), order: steps.length + 1, stage: 1, title: 'New step', isolatedAssetIds: [], isolatedLabel: '', transfer: 'None', windowStart: '', windowEnd: '', mitigation: '', rollback: '', connectsLineIds: [], status: 'Planned' }] });
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      {steps.map(s => {
        const r = an?.cutIns.find(x => x.step.id === s.id);
        return (
          <div key={s.id} className="vw-card-child" style={{ padding: '10px 12px' }}>
            <div className="vw-flex vw-gap-sm vw-items-center vw-wrap">
              <InputNumber size="small" min={1} value={s.order} style={{ width: 56 }} onChange={v => set(s.id, { order: v ?? s.order })} aria-label="Order" />
              <Input size="small" value={s.title} style={{ width: 260 }} onChange={e => set(s.id, { title: e.target.value })} />
              <Select size="small" value={s.stage ?? 1} style={{ width: 160 }} options={stages.map(x => ({ value: x.stage, label: `Stage ${x.stage} · ${x.name}` }))} onChange={v => set(s.id, { stage: v })} />
              {r && <VwChip variant={r.ok ? LEFT_TONE[r.redundancyLeft] : 'error'}>{r.ok ? r.redundancyLeft : 'Capacity below the live load'}</VwChip>}
              {r && r.clashes.some(c => c.severity === 'block') && <VwChip variant="error">Window clash</VwChip>}
              <span style={{ flex: 1 }} />
              <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove step" onClick={() => patch({ cutIns: steps.filter(x => x.id !== s.id) })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
              <label className="vw-flex vw-flex-col"><span style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>Isolated</span><Select size="small" mode="multiple" allowClear value={s.isolatedAssetIds} options={allUnits} placeholder="Nothing taken out of service" onChange={v => set(s.id, { isolatedAssetIds: v, isolatedLabel: allUnits.filter(o => v.includes(o.value)).map(o => o.label.split(' · ')[0]).join(', ') })} /></label>
              <label className="vw-flex vw-flex-col"><span style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>Load transfer</span><Select size="small" value={s.transfer} options={TRANSFERS.map(t => ({ value: t, label: t }))} onChange={v => set(s.id, { transfer: v })} /></label>
              <label className="vw-flex vw-flex-col"><span style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>Connects</span><Select size="small" mode="multiple" allowClear value={s.connectsLineIds ?? []} options={lines.map(l => ({ value: l.id, label: `${l.id} · ${l.system} ${l.action}` }))} onChange={v => set(s.id, { connectsLineIds: v })} /></label>
              {(s.transfer === 'Temporary generator' || s.transfer === 'Rental chiller') && <label className="vw-flex vw-flex-col"><span style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>Temporary plant rating</span><InputNumber size="small" min={0} value={s.temporaryKw} addonAfter="kW" onChange={v => set(s.id, { temporaryKw: v ?? undefined, temporaryPlant: s.transfer })} /></label>}
              <label className="vw-flex vw-flex-col"><span style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>Window (22:00 UTC, {hours} h)</span><Input size="small" type="date" value={s.windowStart ? toDateInput(s.windowStart) : ''} onChange={e => { if (!e.target.value) { set(s.id, { windowStart: '', windowEnd: '' }); return; } const st = new Date(fromDateInput(e.target.value, s.windowStart)); st.setUTCHours(22); set(s.id, { windowStart: st.toISOString(), windowEnd: new Date(st.getTime() + hours * 3600e3).toISOString() }); }} /></label>
              <label className="vw-flex vw-flex-col"><span style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>Mitigation</span><Input size="small" value={s.mitigation} placeholder="Generator on standby, change freeze…" onChange={e => set(s.id, { mitigation: e.target.value })} /></label>
              <label className="vw-flex vw-flex-col"><span style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>Rollback</span><Input size="small" value={s.rollback} placeholder="How the step is undone" status={s.rollback.trim() ? undefined : 'warning'} onChange={e => set(s.id, { rollback: e.target.value })} /></label>
            </div>
            {r && (
              <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)', marginTop: 8 }}>
                {r.system ? `${SYSTEM_LABEL[r.system]}: ` : ''}{fmtKw(r.remainingKw)} left{r.temporaryKw ? ` + ${fmtKw(r.temporaryKw)} temporary` : ''} for {fmtKw(r.liveLoadKw)} live load.{' '}
                {r.exposedRackIds.length ? `${r.exposedRackIds.length} racks, ${r.services} services (${r.critical} critical)${r.customers.length ? `, ${r.customers.slice(0, 3).map(c => c.name).join(', ')}${r.customers.length > 3 ? ` and ${r.customers.length - 3} more` : ''}` : ''} on the isolated path. ` : 'No racks traced behind the isolated plant. '}
                Window {fmtDay(r.window.start)}{r.window.proposed ? ' (next free change night after delivery)' : ''}{r.clashes.length ? `; clashes: ${r.clashes.map(c => c.title).slice(0, 2).join(', ')}` : '; no clashes'}.
                {r.temporaryLine ? ` ${r.temporaryLine.item} added to the bill (${r.temporaryLine.days} days).` : ''}
                {r.notes.length ? ` ${r.notes.join(' ')}` : ''}
              </div>
            )}
          </div>
        );
      })}
      {!steps.length && <div className="vw-card-description">No cut-in steps. Each new or replaced item needs a step: what is isolated, how the load is carried, and how it is undone.</div>}
      <span className="vw-flex vw-gap-xs"><Button size="small" icon={<PlusOutlined />} onClick={add}>Add a step</Button>{lines.length > 0 && <Button size="small" onClick={propose}>Propose steps from the lines</Button>}</span>
    </div>
  );
}
