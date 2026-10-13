/* Result panel for replacement plans: what goes out, what comes in, and where the new equipment
   comes from (stock or a vendor). Used on the Compute and IT step (server refresh), the Network
   step (network refresh) and the Space step (rack replacement). */
import { useMemo } from 'react';
import { VwChip } from '../../../../shared/components/ux';
import { fmtKw, fmtUsd } from '../../lib/engine';
import { buildBom } from '../../lib/outputs';
import { sourceBom } from '../../lib/sourcing';
import { useSourcingContext } from '../../lib/usePlanner';
import { Stat } from '../kit';
import type { StepProps } from './wizardModel';
import { SubTitle } from './ParamField';

export function ReplacementPanel({ draft, ev, benchmarks, goTo }: StepProps) {
  const ctx = useSourcingContext();
  const idList = String(draft.params.affectedIds ?? '');
  const ids = useMemo(() => new Set(idList.split(',').filter(Boolean)), [idList]);
  const rackMode = draft.scope === 'rack-replace';
  const old = useMemo(() => ctx.devices.filter(d => (rackMode ? ids.has(d.rackId ?? '') : ids.has(d.id))), [ctx.devices, ids, rackMode]);
  const byModel = useMemo(() => { const m = new Map<string, number>(); for (const d of old) m.set(d.model ?? '—', (m.get(d.model ?? '—') ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [old]);
  const sourced = useMemo(() => (ev && ctx.assetModels.length ? sourceBom(draft, ev, buildBom(draft, ev, benchmarks), ctx) : undefined), [draft, ev, benchmarks, ctx]);
  if (!ids.size) return <div className="vw-card-description">Nothing selected yet. <a onClick={() => goTo('requirements')}>Select what is being replaced</a>.</div>;
  const main = sourced?.lines.find(l => (rackMode ? l.kind === 'rack' : ['server', 'gpu-server', 'storage', 'leaf', 'spine', 'core', 'firewall'].includes(l.kind)));
  const racks = new Set(old.map(d => d.rackId)).size;
  const oldKw = old.reduce((a, d) => a + (d.powerDrawW ?? 400), 0) / 1000;
  return (<>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
      <Stat label={rackMode ? 'Racks out' : 'Devices out'} value={rackMode ? racks : old.length} sub={rackMode ? `${old.length} devices to re-rack` : `in ${racks} racks · ${fmtKw(oldKw)}`} />
      <Stat label={rackMode ? 'Racks in' : 'Devices in'} value={main?.qty ?? '—'} sub={main?.model ?? ''} />
      <Stat label="From stock" value={main?.fromStock ?? 0} sub={main && main.fromStock ? `saves ${fmtUsd(main.fromStock * main.unitCost)}` : 'none in stock'} tone={main && main.fromStock ? 'ok' : undefined} />
      <Stat label="To buy" value={main?.toBuy ?? 0} sub={main && main.toBuy ? `${main.vendorName} · ${fmtUsd(main.buyCost)}` : 'nothing to buy'} />
    </div>
    <SubTitle>Old to new</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Going out</th><th style={{ textAlign: 'right' }}>Count</th><th>Coming in</th><th>Source</th></tr></thead>
      <tbody>{byModel.map(([m, n], i) => (
        <tr key={m}><td>{m}</td><td style={{ textAlign: 'right' }}>{n}</td><td>{i === 0 ? `${main?.qty ?? '—'} × ${main?.model ?? '—'}${!rackMode && draft.scope === 'server-refresh' ? ` (${String(draft.params.consolidationRatio ?? 2)} old per new)` : ''}` : ''}</td>
          <td style={{ whiteSpace: 'normal', fontSize: 12 }}>{i === 0 && main ? main.allocations.map(a => <VwChip key={a.source} variant={a.source === 'stock' ? 'success' : a.source === 'site' ? 'info' : 'neutral'} style={{ fontSize: 10, marginRight: 4 }}>{a.qty} {a.source === 'stock' ? 'from stock' : a.source === 'site' ? 'from site' : 'to buy'}</VwChip>) : null}</td></tr>
      ))}</tbody>
    </table></div>
    {main && main.allocations.map(a => <div key={a.source} style={{ fontSize: 12, color: 'var(--vw-color-slate-600)', marginTop: 4 }}>{a.qty} {a.source === 'stock' ? 'from stock' : a.source === 'site' ? 'from the site' : 'to buy'}: {a.note}</div>)}
    {sourced?.warnings.length ? <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>{sourced.warnings.join(' · ')}</div> : null}
  </>);
}
