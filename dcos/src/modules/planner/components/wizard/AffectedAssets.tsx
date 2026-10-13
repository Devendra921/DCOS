/* What is being replaced — server refresh, network refresh and rack replacement.
   A table of the equipment at the chosen site with filters (reason, model, rack, row, owner team,
   service) and a checkbox per row. The criteria are saved with the selection, equipment already
   held by another plan or an open change is flagged and cannot be picked, and the selection is
   cleared when the site changes. */
import { useEffect, useMemo, useState } from 'react';
import { Checkbox, Input, InputNumber, Select, Tooltip } from 'antd';
import { VwChip } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { fmtKw } from '../../lib/engine';
import { DEFAULT_CRITERIA, deviceCandidates, readCriteria, REASON_LABEL, RACK_REASON_LABEL, selectedIds, ROLE_LABEL, type Reason, type RackReason, type SelectionCriteria } from '../../lib/replaceCore';
import { rackCandidates } from '../../lib/replaceRack';
import { clearedSelection, selectionPatch } from '../scopes/replace/model';
import type { StepProps } from './wizardModel';
import { SubTitle } from './ParamField';

const muted = { color: 'var(--vw-color-slate-500)' } as const;
const PAGE = 120;

export function AffectedAssets(props: StepProps) {
  const { draft, patch, data } = props;
  const [now] = useState(() => Date.now());
  const [crit, setCrit] = useState<SelectionCriteria>(() => readCriteria(draft));
  const [shown, setShown] = useState(PAGE);
  const ids = useMemo(() => new Set(selectedIds(draft)), [draft]);
  const site = draft.dataCenterId;
  // A selection made at another site is cleared as soon as the site changes.
  const stale = !!ids.size && !!draft.params.affectedSiteId && draft.params.affectedSiteId !== site;
  useEffect(() => { if (stale) patch(clearedSelection(draft)); }, [stale, draft, patch]);
  const saveCrit = (c: SelectionCriteria) => { setCrit(c); patch({ params: { ...draft.params, selectionCriteria: JSON.stringify(c) } }); };
  const select = (next: Set<string>) => patch(selectionPatch(draft, data, [...next], crit));
  const toggle = (id: string, on: boolean) => { const n = new Set(ids); if (on) n.add(id); else n.delete(id); select(n); };

  if (!site) return <div style={{ fontSize: 12, ...muted }}>Pick the site above to see what can be replaced there.</div>;
  if (!data.ready) return <div style={{ fontSize: 12, ...muted }}>Loading the site's equipment…</div>;
  if (draft.scope === 'rack-replace') return <RackSelection {...props} crit={crit} saveCrit={saveCrit} ids={ids} toggle={toggle} select={select} />;
  return <DeviceSelection {...props} crit={crit} saveCrit={saveCrit} ids={ids} toggle={toggle} select={select} now={now} shown={shown} setShown={setShown} />;
}

interface SelProps extends StepProps { crit: SelectionCriteria; saveCrit: (c: SelectionCriteria) => void; ids: Set<string>; toggle: (id: string, on: boolean) => void; select: (n: Set<string>) => void }

function DeviceSelection({ draft, data, crit, saveCrit, ids, toggle, select, now, shown, setShown }: SelProps & { now: number; shown: number; setShown: (n: number) => void }) {
  const all = useMemo(() => deviceCandidates(data, draft, crit.years, now), [data, draft, crit.years, now]);
  const opt = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort().map(v => ({ value: v, label: v }));
  const models = useMemo(() => opt(all.map(c => c.d.model)), [all]);
  const racks = useMemo(() => [...new Map(all.filter(c => c.rack).map(c => [c.rack!.id, c.rack!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })), [all]);
  const rows = useMemo(() => [...new Map(all.filter(c => c.row).map(c => [c.row!.id, c.row!.name])).entries()].map(([value, label]) => ({ value, label })), [all]);
  const teams = useMemo(() => opt(all.map(c => c.d.ownerTeam)), [all]);
  const services = useMemo(() => [...new Map(all.flatMap(c => c.services.map(s => [s.id, s.name] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })), [all]);
  const text = (crit.text ?? '').toLowerCase();
  const match = all.filter(c => !crit.reasons.length || c.why.some(r => crit.reasons.includes(r)))
    .filter(c => !crit.models?.length || crit.models.includes(c.d.model ?? ''))
    .filter(c => !crit.rackIds?.length || crit.rackIds.includes(c.rack?.id ?? ''))
    .filter(c => !crit.rowIds?.length || crit.rowIds.includes(c.row?.id ?? ''))
    .filter(c => !crit.teams?.length || crit.teams.includes(c.d.ownerTeam ?? ''))
    .filter(c => !crit.serviceIds?.length || c.services.some(s => crit.serviceIds!.includes(s.id)))
    .filter(c => !text || `${c.d.name} ${c.d.model} ${c.rack?.name} ${c.d.serial}`.toLowerCase().includes(text));
  // Selected devices always stay visible, even when a filter would hide them.
  const list = [...match, ...all.filter(c => ids.has(c.d.id) && !match.includes(c))].sort((a, b) => Number(ids.has(b.d.id)) - Number(ids.has(a.d.id)) || (a.rack?.name ?? '').localeCompare(b.rack?.name ?? '') || (a.d.position ?? 0) - (b.d.position ?? 0));
  const free = match.filter(c => !c.held);
  const sel = all.filter(c => ids.has(c.d.id));
  const heldSel = sel.filter(c => c.held);
  const kw = sel.reduce((a, c) => a + (c.d.powerDrawW ?? 0), 0) / 1000;
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <SubTitle extra={<span className="vw-inline-flex vw-gap-xs"><Button size="small" onClick={() => select(new Set([...ids, ...free.map(c => c.d.id)]))}>Select the {free.length} shown</Button><Button size="small" onClick={() => select(new Set())} disabled={!ids.size}>Clear</Button></span>}>What is being replaced</SubTitle>
      <div className="vw-flex vw-items-center vw-gap-sm vw-wrap" style={{ fontSize: 12 }}>
        <span style={{ color: 'var(--vw-color-slate-600)' }}>Equipment that is</span>
        {(Object.keys(REASON_LABEL) as Reason[]).map(r => (
          <Checkbox key={r} checked={crit.reasons.includes(r)} onChange={e => saveCrit({ ...crit, reasons: e.target.checked ? [...crit.reasons, r] : crit.reasons.filter(x => x !== r) })}>
            {REASON_LABEL[r]}{r === 'age' && <> <InputNumber size="small" min={1} max={15} value={crit.years} onChange={v => typeof v === 'number' && saveCrit({ ...crit, years: v })} style={{ width: 56 }} /> years</>}
            <span style={muted}> · {all.filter(c => c.why.includes(r)).length}</span>
          </Checkbox>
        ))}
      </div>
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
        <Select size="small" mode="multiple" allowClear placeholder="Model" value={crit.models} options={models} onChange={v => saveCrit({ ...crit, models: v })} maxTagCount="responsive" />
        <Select size="small" mode="multiple" allowClear placeholder="Rack" value={crit.rackIds} options={racks} onChange={v => saveCrit({ ...crit, rackIds: v })} maxTagCount="responsive" optionFilterProp="label" />
        <Select size="small" mode="multiple" allowClear placeholder="Row" value={crit.rowIds} options={rows} onChange={v => saveCrit({ ...crit, rowIds: v })} maxTagCount="responsive" optionFilterProp="label" />
        <Select size="small" mode="multiple" allowClear placeholder="Owner team" value={crit.teams} options={teams} onChange={v => saveCrit({ ...crit, teams: v })} maxTagCount="responsive" />
        <Select size="small" mode="multiple" allowClear placeholder="Service" value={crit.serviceIds} options={services} onChange={v => saveCrit({ ...crit, serviceIds: v })} maxTagCount="responsive" optionFilterProp="label" />
        <Input size="small" allowClear placeholder="Name, serial or rack" value={crit.text} onChange={e => saveCrit({ ...crit, text: e.target.value })} />
      </div>
      <div className="nst-table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
        <table className="nst-table" style={{ width: '100%' }}>
          <thead><tr><th style={{ width: 32 }} /><th>Device</th><th>Model</th><th>Role</th><th>Rack · U</th><th>Team</th><th style={{ textAlign: 'right' }}>Age</th><th>Why</th><th>Services</th><th style={{ textAlign: 'right' }}>Draw</th></tr></thead>
          <tbody>
            {list.slice(0, shown).map(c => (
              <tr key={c.d.id} className={ids.has(c.d.id) ? 'is-selected' : undefined}>
                <td><Tooltip title={c.held ? `${c.held}: cannot be selected` : undefined}><Checkbox checked={ids.has(c.d.id)} disabled={!!c.held && !ids.has(c.d.id)} onChange={e => toggle(c.d.id, e.target.checked)} /></Tooltip></td>
                <td><b>{c.d.name}</b>{c.held && <VwChip variant="warning" style={{ fontSize: 11, marginLeft: 4 }}>{c.held}</VwChip>}</td>
                <td>{c.d.model}</td><td>{ROLE_LABEL[c.role]}</td><td>{c.rack?.name ?? '—'}{c.d.position ? ` · U${c.d.position}` : ''}{c.row ? <span style={muted}> · {c.row.name}</span> : null}</td>
                <td>{c.d.ownerTeam ?? '—'}</td><td style={{ textAlign: 'right' }}>{c.ageYears !== undefined ? `${c.ageYears} y` : '—'}</td>
                <td>{c.why.map(r => <VwChip key={r} variant={r === 'faulty' ? 'error' : r === 'eol' ? 'warning' : 'neutral'} style={{ fontSize: 11, marginRight: 4 }}>{r === 'age' ? `${c.ageYears} y` : REASON_LABEL[r]}</VwChip>)}</td>
                <td>{c.services.length ? <>{c.services.length}{c.services.some(s => s.critical) && <VwChip variant="error" style={{ fontSize: 11, marginLeft: 4 }}>critical</VwChip>}</> : <span style={muted}>none</span>}</td>
                <td style={{ textAlign: 'right' }}>{c.d.powerDrawW ? `${c.d.powerDrawW} W` : '—'}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={10} style={muted}>Nothing at this site matches. Widen the criteria, for example a lower age.</td></tr>}
          </tbody>
        </table>
      </div>
      {list.length > shown && <a style={{ fontSize: 12 }} onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more of {list.length - shown}</a>}
      <div style={{ fontSize: 12, color: 'var(--vw-color-slate-700)' }}>
        Selected <b>{sel.length} devices</b> in {new Set(sel.map(c => c.rack?.id)).size} racks, drawing {fmtKw(kw)} measured · {match.length} match the filters of {all.length} at the site.
        {heldSel.length > 0 && <span style={{ color: 'var(--vw-color-red-600)' }}> {heldSel.length} selected device{heldSel.length === 1 ? ' is' : 's are'} held elsewhere; remove {heldSel.length === 1 ? 'it' : 'them'}.</span>}
      </div>
    </div>
  );
}

function RackSelection({ draft, data, crit, saveCrit, ids, toggle, select }: SelProps) {
  const reasons = crit.rackReasons ?? DEFAULT_CRITERIA.rackReasons!;
  const all = useMemo(() => rackCandidates(data, draft, crit), [data, draft, crit]);
  const types = useMemo(() => [...new Set(all.map(r => r.type?.model).filter((x): x is string => !!x))].map(v => ({ value: v, label: v })), [all]);
  const match = all.filter(r => r.reasons.some(x => reasons.includes(x)));
  const list = [...match, ...all.filter(r => ids.has(r.rack.id) && !match.includes(r))].sort((a, b) => Number(ids.has(b.rack.id)) - Number(ids.has(a.rack.id)) || a.rack.name.localeCompare(b.rack.name));
  const sel = all.filter(r => ids.has(r.rack.id));
  const damaged = new Set(crit.damagedRackIds ?? []);
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <SubTitle extra={<span className="vw-inline-flex vw-gap-xs"><Button size="small" onClick={() => select(new Set([...ids, ...match.filter(r => !r.held).map(r => r.rack.id)]))}>Select the {match.filter(r => !r.held).length} shown</Button><Button size="small" onClick={() => select(new Set())} disabled={!ids.size}>Clear</Button></span>}>Which racks are replaced</SubTitle>
      <div className="vw-flex vw-items-center vw-gap-sm vw-wrap" style={{ fontSize: 12 }}>
        <span style={{ color: 'var(--vw-color-slate-600)' }}>Racks that are</span>
        {(Object.keys(RACK_REASON_LABEL) as RackReason[]).map(r => (
          <Checkbox key={r} checked={reasons.includes(r)} onChange={e => saveCrit({ ...crit, rackReasons: e.target.checked ? [...reasons, r] : reasons.filter(x => x !== r) })}>{RACK_REASON_LABEL[r]}<span style={muted}> · {all.filter(c => c.reasons.includes(r)).length}</span></Checkbox>
        ))}
        <Select size="small" mode="multiple" allowClear placeholder="Old rack types" value={crit.rackTypes} options={types} onChange={v => saveCrit({ ...crit, rackTypes: v })} style={{ minWidth: 200 }} />
      </div>
      <div className="nst-table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
        <table className="nst-table" style={{ width: '100%' }}>
          <thead><tr><th style={{ width: 32 }} /><th>Rack</th><th>Row</th><th>Type</th><th style={{ textAlign: 'right' }}>U used</th><th style={{ textAlign: 'right' }}>Draw / rating</th><th style={{ textAlign: 'right' }}>Deepest device / mounting depth</th><th>Strips</th><th>Owner</th><th>Why</th><th /></tr></thead>
          <tbody>
            {list.map(c => (
              <tr key={c.rack.id} className={ids.has(c.rack.id) ? 'is-selected' : undefined}>
                <td><Tooltip title={c.held}><Checkbox checked={ids.has(c.rack.id)} disabled={!!c.held && !ids.has(c.rack.id)} onChange={e => toggle(c.rack.id, e.target.checked)} /></Tooltip></td>
                <td><b>{c.rack.name}</b>{c.held && <VwChip variant="warning" style={{ fontSize: 11, marginLeft: 4 }}>{c.held}</VwChip>}</td>
                <td>{c.row?.name ?? '—'}</td><td>{c.type?.model ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{c.rb?.usedUnits.size ?? c.rack.usedU} / {c.rack.heightU}</td>
                <td style={{ textAlign: 'right', color: c.reasons.includes('over-power') ? 'var(--vw-color-red-600)' : undefined }}>{c.rb?.drawKw ?? c.rack.currentPowerKw} / {c.rack.maxPowerKw} kW</td>
                <td style={{ textAlign: 'right' }}>{c.deepestMm ? `${c.deepestMm} mm (${c.deepestModel})` : '—'} / {c.usableDepthMm} mm</td>
                <td>{c.metered ? 'Metered' : <span style={{ color: 'var(--vw-color-amber-700)' }}>Not metered</span>}</td>
                <td>{c.rack.owner}</td>
                <td>{c.reasons.map(r => <VwChip key={r} variant={r === 'over-power' || r === 'damaged' ? 'error' : 'warning'} style={{ fontSize: 11, marginRight: 4 }}>{RACK_REASON_LABEL[r]}</VwChip>)}</td>
                <td><a style={{ fontSize: 12 }} onClick={() => saveCrit({ ...crit, damagedRackIds: damaged.has(c.rack.id) ? [...damaged].filter(x => x !== c.rack.id) : [...damaged, c.rack.id] })}>{damaged.has(c.rack.id) ? 'Not damaged' : 'Mark damaged'}</a></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={11} style={muted}>No rack at this site meets the criteria.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: 'var(--vw-color-slate-700)' }}>Selected <b>{sel.length} racks</b> holding {sel.reduce((a, r) => a + r.devices.length, 0)} devices, drawing {fmtKw(sel.reduce((a, r) => a + (r.rb?.drawKw ?? 0), 0))}. Every device in them is re-racked and re-cabled.</div>
    </div>
  );
}
