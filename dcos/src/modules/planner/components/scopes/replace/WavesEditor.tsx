/* Wave editor for replacements and migrations: make waves from the selection, then adjust each
   wave's date, method, rollback and acceptance. Every wave shows what it touches (services,
   customers, critical SLAs, revenue) and red chips for clashes, pairs and overloaded windows. */
import { Fragment, useMemo, useState } from 'react';
import { Input, Select, Tooltip } from 'antd';
import { VwChip } from '../../../../../shared/components/ux';
import { VwButton as Button } from '../../../../../shared/components/vw/VwButton';
import { DeleteOutlined } from '../../../../../shared/icons';
import type * as T from '../../../../../mock/data/types';
import { fmtUsd } from '../../../lib/engine';
import { nextFreeWindow } from '../../../lib/impact';
import { byId } from '../../../lib/plannerData';
import { phasesFromWaves, waveImpact, WAVE_STATUS_TONE, type WaveCheck } from '../../../lib/waves';
import { replaceOf } from '../../../lib/replaceAnalysis';
import { proposeReplaceWaves, replacePatch } from '../../../lib/replaceWaves';
import { migrationOf, proposeMigrationWaves, migrationPatch, APPROACHES } from '../../../lib/migrationCore';
import { PARALLEL } from '../../../lib/replaceText';
import { Stat } from '../../kit';
import type { StepProps } from '../../wizard/wizardModel';
import { SubTitle } from '../../wizard/ParamField';
import { fmtWhen, fromLocalInput, toLocalInput } from './model';

const muted = { color: 'var(--vw-color-slate-500)' } as const;
const SERVER_METHODS = ['Rolling, rack by rack', PARALLEL, 'Single window'];

export function WavesEditor(props: StepProps & { family: 'replace' | 'migration' }) {
  const { draft, ev, patch, data, family } = props;
  const [open, setOpen] = useState<string | undefined>();
  const [now] = useState(() => Date.now());
  const ra = family === 'replace' && ev ? replaceOf(ev) : undefined;
  const ma = family === 'migration' && ev ? migrationOf(ev) : undefined;
  const ready = ra?.ready || ma?.ready;
  const check: WaveCheck | undefined = ra?.waveCheck ?? ma?.waveCheck;
  const waves = useMemo(() => [...(draft.waves ?? [])].sort((a, b) => a.order - b.order), [draft.waves]);
  const network = draft.scope === 'network-refresh';
  const impacts = useMemo(() => new Map(waves.map(w => [w.id, waveImpact(data, w, network)])), [waves, data, network]);
  if (!ready || !ev) return <div className="vw-card-description">{ra?.reason ?? ma?.reason ?? 'Loading…'}</div>;
  const hours = ra?.windowHours ?? ma?.window ?? 6; const rate = ra?.rate ?? ma?.rate ?? 4;
  const kw = Math.round(ra ? ra.newKw : ma!.kwLeaving);
  const set = (next: T.PlannerWave[]) => patch({ waves: next, phases: phasesFromWaves(next, kw), targetGoLive: next.length ? [...next].sort((a, b) => b.windowEnd.localeCompare(a.windowEnd))[0].windowEnd : draft.targetGoLive });
  const edit = (id: string, p: Partial<T.PlannerWave>) => set(waves.map(w => (w.id === id ? { ...w, ...p } : w)));
  const make = () => {
    if (ra) { const w = proposeReplaceWaves(ev.ctx, ra, now); patch(replacePatch(draft, ra, w)); }
    else if (ma) { const w = proposeMigrationWaves(ev.ctx, ma, now); patch(migrationPatch(draft, ma, w)); }
  };
  const nextFree = (w: T.PlannerWave) => { const win = nextFreeWindow(data, { dataCenterId: draft.dataCenterId, deviceIds: w.deviceIds, rackIds: w.rackIds, hours, after: new Date(Math.max(now, new Date(w.windowStart).getTime())).toISOString(), excludePlanId: draft.id, taken: waves.filter(x => x.id !== w.id).map(x => ({ start: x.windowStart, end: x.windowEnd })) }); edit(w.id, win.start ? { windowStart: win.start, windowEnd: win.end } : {}); };
  const global = (check?.issues ?? []).filter(i => !i.waveId);
  const blocking = (check?.issues ?? []).filter(i => i.level === 'bad').length;
  const pairs = ra?.pairs.length ?? ma?.pairs.length ?? 0;
  const items = family === 'replace' ? (draft.scope === 'rack-replace' ? `${ra!.rackIds.length} racks` : `${ra!.old.length} devices`) : `${ma!.rows.filter(r => r.recordType === 'device' && (r.disposition === 'move' || r.kw > 0)).length} devices, ${ma!.services.length} services`;
  const consentOf = (w: T.PlannerWave) => ma?.consents.filter(c => c.serviceIds.some(s => w.serviceIds.includes(s))) ?? [];
  return (<>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
      <Stat label="Waves" value={waves.length} sub={`for ${items}`} />
      <Stat label="One window" value={`${hours} h`} sub={`${rate} per hour · ${Math.round(rate * hours * 10) / 10} units of work`} />
      <Stat label="Redundant pairs" value={pairs} sub={pairs ? (network ? 'side A first, soak, then side B' : 'never in the same wave') : 'none found'} />
      <Stat label="Problems" value={blocking} tone={blocking ? 'bad' : waves.length ? 'ok' : undefined} sub={blocking ? 'see the red chips' : waves.length ? 'no clash, pair or capacity problem' : 'make the waves first'} />
    </div>
    <SubTitle extra={<span className="vw-inline-flex vw-gap-xs"><Tooltip title="Groups the selection by rack and service, splits redundant pairs, sizes each wave to the crew and the window, and dates it on the next clash-free change night. Waves already scheduled or closed are kept."><Button size="small" onClick={make}>{waves.length ? 'Remake waves' : 'Make waves'}</Button></Tooltip></span>}>Waves</SubTitle>
    {global.map((g, i) => <div key={i} style={{ fontSize: 12, color: g.level === 'bad' ? 'var(--vw-color-red-600)' : 'var(--vw-color-amber-700)' }}>{g.text}</div>)}
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Wave</th><th>Window (UTC)</th><th>What</th><th>Method</th><th>Impact</th><th>Checks</th><th>Status</th><th /></tr></thead>
      <tbody>
        {waves.map(w => {
          const imp = impacts.get(w.id); const iss = check?.byWave.get(w.id) ?? []; const editable = w.status === 'Planned';
          const cons = consentOf(w); const missing = cons.filter(c => !c.okForWave);
          return (<Fragment key={w.id}>
            <tr>
              <td><Input size="small" value={w.name} disabled={!editable} onChange={e => edit(w.id, { name: e.target.value })} style={{ width: 190 }} />{w.kind === 'pilot' && <VwChip variant="info" style={{ fontSize: 11, marginLeft: 4 }}>pilot</VwChip>}</td>
              <td><Input size="small" type="datetime-local" disabled={!editable} value={toLocalInput(w.windowStart)} onChange={e => { if (!e.target.value) return; const x = fromLocalInput(e.target.value, hours); edit(w.id, { windowStart: x.start, windowEnd: x.end }); }} style={{ width: 190 }} /></td>
              <td>{draft.scope === 'rack-replace' ? `${w.rackIds.length} racks, ${w.deviceIds.length} devices` : `${w.deviceIds.length} devices${w.serviceIds.length ? `, ${w.serviceIds.length} services` : ''}`}{w.side && <VwChip variant="neutral" style={{ fontSize: 11, marginLeft: 4 }}>side {w.side}</VwChip>}</td>
              <td style={{ whiteSpace: 'normal', minWidth: 180 }}>{draft.scope === 'server-refresh' && editable ? <Select size="small" value={w.method} style={{ width: 200 }} options={SERVER_METHODS.map(m => ({ value: m, label: m }))} onChange={v => edit(w.id, { method: v })} /> : <span style={{ fontSize: 12 }}>{w.method}</span>}</td>
              <td style={{ whiteSpace: 'normal', fontSize: 12 }}>{imp && imp.services.length ? <>{imp.services.length} services · {imp.customers.length} customers{imp.critical ? <VwChip variant="error" style={{ fontSize: 11, marginLeft: 4 }}>{imp.critical} critical</VwChip> : null}<div style={muted}>{fmtUsd(imp.revenueMonthly)} a month at risk{imp.minSla ? ` · SLA ${imp.minSla}%` : ''}</div></> : <span style={muted}>no customer service</span>}</td>
              <td style={{ whiteSpace: 'normal' }}>{iss.map((i, k) => <Tooltip key={k} title={i.text}><VwChip variant={i.level === 'bad' ? 'error' : 'warning'} style={{ fontSize: 11, marginRight: 4 }}>{i.kind === 'clash' ? (i.clash?.kind === 'window' ? `window ${i.clash.id}` : `change ${i.clash?.id}`) : i.kind === 'upstream' ? 'upstream work' : i.kind}</VwChip></Tooltip>)}
                {missing.length > 0 && <Tooltip title={missing.map(c => `${c.customerName}: ${c.status}`).join(', ')}><VwChip variant="error" style={{ fontSize: 11 }}>consent {missing.length}</VwChip></Tooltip>}
                {!iss.length && !missing.length && <VwChip variant="success" style={{ fontSize: 11 }}>clear</VwChip>}
                {iss.some(i => i.kind === 'clash' || i.kind === 'upstream') && editable && <a style={{ fontSize: 12, marginLeft: 4 }} onClick={() => nextFree(w)}>next free night</a>}</td>
              <td><VwChip variant={WAVE_STATUS_TONE[w.status]}>{w.status}</VwChip></td>
              <td><span className="vw-inline-flex vw-gap-xs"><a style={{ fontSize: 12 }} onClick={() => setOpen(open === w.id ? undefined : w.id)}>{open === w.id ? 'Less' : 'More'}</a>{editable && <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove wave" onClick={() => set(waves.filter(x => x.id !== w.id))} />}</span></td>
            </tr>
            {open === w.id && <tr><td colSpan={8} style={{ whiteSpace: 'normal', background: 'var(--vw-color-slate-25)' }}>
              <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div><div style={{ fontSize: 11, ...muted }}>Rollback</div><Input.TextArea autoSize={{ minRows: 2 }} disabled={!editable} value={w.rollback} onChange={e => edit(w.id, { rollback: e.target.value })} /></div>
                <div><div style={{ fontSize: 11, ...muted }}>Acceptance</div><Input.TextArea autoSize={{ minRows: 2 }} disabled={!editable} value={w.acceptance} onChange={e => edit(w.id, { acceptance: e.target.value })} /></div>
              </div>
              <div style={{ fontSize: 12, marginTop: 6 }}><b>{fmtWhen(w.windowStart)}</b> · {draft.scope === 'rack-replace' ? `Racks: ${w.rackIds.map(r => byId(data, 'racks', r)?.name ?? r).join(', ')}` : `Devices: ${w.deviceIds.slice(0, 30).map(d => byId(data, 'devices', d)?.name ?? d).join(', ')}${w.deviceIds.length > 30 ? '…' : ''}`}</div>
              {imp && imp.customers.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Customers: {imp.customers.map(c => `${c.customer.name} (${c.customer.accountManager})`).join(', ')}</div>}
              {family === 'migration' && w.serviceIds.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Services: {w.serviceIds.map(s => { const sp = ma!.services.find(x => x.service.id === s); return sp ? `${sp.service.name} (${sp.approach}, ${sp.downtimeH} h)` : s; }).join(', ')}</div>}
            </td></tr>}
          </Fragment>);
        })}
        {!waves.length && <tr><td colSpan={8} style={muted}>No waves yet. Make them from the selection; you can then change dates, methods, rollback and acceptance.</td></tr>}
      </tbody>
    </table></div>
    {family === 'migration' && <div style={{ fontSize: 12, ...muted, marginTop: 4 }}>How each service moves is set on the Requirements step (inventory). Options: {APPROACHES.join(', ')}.</div>}
  </>);
}
