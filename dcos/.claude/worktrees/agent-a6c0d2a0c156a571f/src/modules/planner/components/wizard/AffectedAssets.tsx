/* What is being replaced — for server refresh, network refresh and rack replacement.
   The planner picks why equipment qualifies (past end of life, warranty expired, faulty, older
   than N years) and which models; the matching devices or racks at the chosen site become the
   plan's scope. The selection is stored on the plan and drives quantities, cost and waves. */
import { useMemo, useState } from 'react';
import { Checkbox, InputNumber } from 'antd';
import { VwChip } from '../../../../shared/components/ux';
import type * as T from '../../../../mock/data/types';
import { fmtKw } from '../../lib/engine';
import { useSourcingContext } from '../../lib/usePlanner';
import type { StepProps } from './wizardModel';
import { SubTitle } from './ParamField';

type Reason = 'eol' | 'warranty' | 'faulty' | 'age';
const REASON_LABEL: Record<Reason, string> = { eol: 'Past end of life', warranty: 'Warranty expired', faulty: 'Faulty', age: 'Older than' };
const CATEGORIES: Partial<Record<T.PlannerScope, string[]>> = { 'server-refresh': ['Server', 'GPU-Node', 'Storage'], 'network-refresh': ['Switch', 'Router', 'Firewall'], 'rack-replace': ['Server', 'GPU-Node', 'Storage', 'Switch', 'Router', 'Firewall', 'PDU', 'Other'] };

export function AffectedAssets({ draft, patch }: StepProps) {
  const ctx = useSourcingContext();
  const [reasons, setReasons] = useState<Reason[]>(['eol', 'warranty', 'faulty']);
  const [years, setYears] = useState(5);
  const [now] = useState(() => Date.now());
  const modelEol = useMemo(() => new Map(ctx.assetModels.map(m => [m.model, m.eolDate])), [ctx.assetModels]);
  const contractEnd = useMemo(() => new Map(ctx.contracts.map(c => [c.id, c.endDate])), [ctx.contracts]);
  const racks = useMemo(() => new Map(ctx.racks.filter(r => r.dataCenterId === draft.dataCenterId).map(r => [r.id, r])), [ctx.racks, draft.dataCenterId]);

  /** Every device at the site with the reasons it qualifies. */
  const candidates = useMemo(() => {
    const cats = CATEGORIES[draft.scope] ?? [];
    return ctx.devices.filter(d => d.dataCenterId === draft.dataCenterId && d.rackId && cats.includes(String(d.category)) && d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed').map(d => {
      const why: Reason[] = [];
      const eol = d.model ? modelEol.get(d.model) : undefined; if (eol && new Date(eol).getTime() < now) why.push('eol');
      const w = d.warrantyContractId ? contractEnd.get(d.warrantyContractId) : undefined; if (w && new Date(w).getTime() < now) why.push('warranty');
      if (d.status === 'Faulty') why.push('faulty');
      if (d.commissionedDate && now - new Date(d.commissionedDate).getTime() > years * 365 * 864e5) why.push('age');
      return { d, why };
    });
  }, [ctx.devices, draft.dataCenterId, draft.scope, modelEol, contractEnd, years, now]);
  const matching = candidates.filter(c => c.why.some(r => reasons.includes(r)));
  const byModel = useMemo(() => { const m = new Map<string, typeof matching>(); for (const c of matching) { const k = c.d.model ?? 'Unknown model'; m.set(k, [...(m.get(k) ?? []), c]); } return [...m.entries()].sort((a, b) => b[1].length - a[1].length); }, [matching]);

  const selected = new Set(String(draft.params.affectedIds ?? '').split(',').filter(Boolean));
  const rackMode = draft.scope === 'rack-replace';
  /** Store the selection and the counts the engine and the bill of materials use. */
  const apply = (devices: T.Device[]) => {
    const rackIds = [...new Set(devices.map(d => d.rackId!).filter(Boolean))];
    const kw = Math.round(devices.reduce((a, d) => a + (d.powerDrawW ?? 400), 0) / 1000);
    const ids = rackMode ? rackIds : devices.map(d => d.id);
    const count = rackMode ? rackIds.length : devices.length;
    // New equipment draws roughly 70% of the old for the same work; rack swaps keep the same load.
    patch({ designPowerKw: Math.max(1, rackMode ? kw : Math.round(kw * 0.7)), params: { ...draft.params, affectedIds: ids.join(','), affectedCount: count, affectedRacks: rackIds.length, affectedDevices: devices.length, affectedKw: kw }, paramSources: { ...draft.paramSources, affectedIds: 'user', affectedCount: 'user' } });
  };
  const selectedDevices = rackMode ? matching.filter(c => selected.has(c.d.rackId!)).map(c => c.d) : matching.filter(c => selected.has(c.d.id)).map(c => c.d);
  const toggleModel = (model: string, on: boolean) => {
    const group = byModel.find(([m]) => m === model)?.[1].map(c => c.d) ?? [];
    const rest = selectedDevices.filter(d => d.model !== model);
    apply(on ? [...rest, ...group] : rest);
  };
  const selRacks = new Set(selectedDevices.map(d => d.rackId));
  const selKw = Math.round(selectedDevices.reduce((a, d) => a + (d.powerDrawW ?? 400), 0) / 1000);

  if (!draft.dataCenterId) return <div style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>Pick the site above to see what can be replaced there.</div>;
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <SubTitle>{rackMode ? 'Which racks are replaced' : 'What is being replaced'}</SubTitle>
      <div className="vw-flex vw-items-center vw-gap-sm vw-wrap" style={{ fontSize: 12 }}>
        <span style={{ color: 'var(--vw-color-slate-600)' }}>Include equipment that is</span>
        {(Object.keys(REASON_LABEL) as Reason[]).map(r => (
          <Checkbox key={r} checked={reasons.includes(r)} onChange={e => setReasons(e.target.checked ? [...reasons, r] : reasons.filter(x => x !== r))}>
            {REASON_LABEL[r]}{r === 'age' && <> <InputNumber size="small" min={1} max={15} value={years} onChange={v => typeof v === 'number' && setYears(v)} style={{ width: 56 }} /> years</>}
            <span style={{ color: 'var(--vw-color-slate-500)' }}> · {candidates.filter(c => c.why.includes(r)).length}</span>
          </Checkbox>
        ))}
      </div>
      <div className="nst-table-wrap">
        <table className="nst-table" style={{ width: '100%' }}>
          <thead><tr><th style={{ width: 36 }} /><th>Model</th><th>Why</th><th style={{ textAlign: 'right' }}>Devices</th><th style={{ textAlign: 'right' }}>Racks</th><th style={{ textAlign: 'right' }}>Power</th></tr></thead>
          <tbody>
            {byModel.map(([model, list]) => {
              const on = list.every(c => (rackMode ? selected.has(c.d.rackId!) : selected.has(c.d.id)));
              const whyCount = (r: Reason) => list.filter(c => c.why.includes(r)).length;
              return (
                <tr key={model} className="is-clickable" onClick={() => toggleModel(model, !on)} style={{ cursor: 'pointer' }}>
                  <td><Checkbox checked={on} /></td>
                  <td><b>{model}</b> <span style={{ color: 'var(--vw-color-slate-500)', fontSize: 12 }}>{list[0].d.manufacturer}</span></td>
                  <td style={{ whiteSpace: 'normal' }}>{(Object.keys(REASON_LABEL) as Reason[]).filter(r => whyCount(r)).map(r => <VwChip key={r} variant={r === 'faulty' ? 'error' : r === 'eol' ? 'warning' : 'neutral'} style={{ fontSize: 10, marginRight: 4 }}>{REASON_LABEL[r]}{r === 'age' ? ` ${years}y` : ''} {whyCount(r)}</VwChip>)}</td>
                  <td style={{ textAlign: 'right' }}>{list.length}</td>
                  <td style={{ textAlign: 'right' }}>{new Set(list.map(c => c.d.rackId)).size}</td>
                  <td style={{ textAlign: 'right' }}>{fmtKw(list.reduce((a, c) => a + (c.d.powerDrawW ?? 400), 0) / 1000)}</td>
                </tr>
              );
            })}
            {byModel.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--vw-color-slate-500)' }}>Nothing at this site matches. Widen the criteria, for example a lower age.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: 'var(--vw-color-slate-700)' }}>
        Selected: <b>{rackMode ? `${selRacks.size} racks` : `${selectedDevices.length} devices`}</b>{rackMode ? <> holding {selectedDevices.length} devices</> : <> in {selRacks.size} racks</>}, drawing {fmtKw(selKw)}.
        {[...selRacks].slice(0, 6).map(id => racks.get(id!)?.name).filter(Boolean).length > 0 && <span style={{ color: 'var(--vw-color-slate-500)' }}> Racks {[...selRacks].slice(0, 6).map(id => racks.get(id!)?.name).filter(Boolean).join(', ')}{selRacks.size > 6 ? '…' : ''}.</span>}
      </div>
    </div>
  );
}
