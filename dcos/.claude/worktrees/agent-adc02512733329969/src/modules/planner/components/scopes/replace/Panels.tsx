/* Wizard result panels for server refresh, network refresh and rack replacement. They replace the
   generic plant, fabric, cooling and IT panels: the work happens inside racks that exist. */
import { useState } from 'react';
import { Select } from 'antd';
import { VwChip } from '../../../../../shared/components/ux';
import { fmtKw, fmtUsd } from '../../../lib/engine';
import { replaceOf, type ReplaceAnalysis } from '../../../lib/replaceAnalysis';
import { byId } from '../../../lib/plannerData';
import { outageHours, SWAP_METHODS, SWAP_TEXT, type SwapMethod } from '../../../lib/replaceRack';
import { Stat } from '../../kit';
import type { StepProps } from '../../wizard/wizardModel';
import { SubTitle } from '../../wizard/ParamField';
import { ReplacementPanel } from '../../wizard/ReplacementPanel';
import { WavesEditor } from './WavesEditor';
import { ConsentRegister } from './Consents';
import { fmtWhen } from './model';

const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 } as const;
const muted = { color: 'var(--vw-color-slate-500)' } as const;
const tone = (ok: boolean, warn?: boolean) => (ok ? (warn ? 'warning' : 'success') : 'error') as 'success' | 'warning' | 'error';

function useA(p: StepProps): ReplaceAnalysis | undefined { return p.ev ? replaceOf(p.ev) : undefined; }
function Wait({ a, goTo }: { a?: ReplaceAnalysis; goTo: StepProps['goTo'] }) {
  if (!a?.ready) return <div className="vw-card-description">{a?.reason ?? 'Loading…'}</div>;
  return <div className="vw-card-description">Nothing selected yet. <a onClick={() => goTo('requirements')}>Select what is being replaced</a>.</div>;
}

/* ------------------------------------------------------------------ racks before and after */
function RackRows({ a }: { a: ReplaceAnalysis }) {
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Rack</th><th style={{ textAlign: 'right' }}>Out / in</th><th style={{ textAlign: 'right' }}>kW before → after</th><th style={{ textAlign: 'right' }}>Peak</th><th style={{ textAlign: 'right' }}>Side by side</th><th style={{ textAlign: 'right' }}>Rating</th><th style={{ textAlign: 'right' }}>One feed (80%)</th><th style={{ textAlign: 'right' }}>U</th><th style={{ textAlign: 'right' }}>kg</th><th>Check</th></tr></thead>
      <tbody>{a.rackRows.map(r => (
        <tr key={r.rack.id}>
          <td><b>{r.rack.name}</b></td><td style={{ textAlign: 'right' }}>{r.out.length} / {r.inn.length}</td>
          <td style={{ textAlign: 'right' }}>{r.kwBefore} → <b>{r.kwAfter}</b></td><td style={{ textAlign: 'right' }}>{r.kwPeakAfter}</td><td style={{ textAlign: 'right' }}>{r.inn.some(u => u.parallel) ? r.kwOverlap : '—'}</td>
          <td style={{ textAlign: 'right' }}>{r.rack.maxPowerKw} kW</td><td style={{ textAlign: 'right' }}>{r.feedRatingKw ? `${r.feedRatingKw} kW${r.feedPctAfter !== undefined ? ` · ${r.feedPctAfter}%` : ''}` : 'no feeds'}</td>
          <td style={{ textAlign: 'right' }}>{r.uBefore} → {r.uAfter} / {r.heightU}</td><td style={{ textAlign: 'right' }}>{r.kgBefore} → {r.kgAfter}{r.maxKg ? ` / ${r.maxKg}` : ''}</td>
          <td style={{ whiteSpace: 'normal' }}>{r.issues.length ? r.issues.map((i, k) => <div key={k} style={{ fontSize: 12, color: r.level === 'bad' ? 'var(--vw-color-red-600)' : 'var(--vw-color-amber-700)' }}>{i}</div>) : <VwChip variant="success">fits</VwChip>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

export function ReplacePowerPanel(p: StepProps) {
  const a = useA(p);
  if (!a?.ready || (!a.old.length && !a.rackIds.length)) return <Wait a={a} goTo={p.goTo} />;
  if (a.scope === 'rack-replace') {
    const o = a.rack?.outlets ?? [];
    return (<>
      <div style={grid4}>
        <Stat label="Racks" value={a.rackIds.length} sub={`${fmtKw(a.oldKw)} drawn by ${a.old.length} devices`} />
        <Stat label="Rating before → after" value={`${fmtKw(o.reduce((s, x) => s + x.ratingBeforeKw, 0))} → ${fmtKw(o.reduce((s, x) => s + x.ratingAfterKw, 0))}`} sub="lower of the strips and 80% of one feed" />
        <Stat label="Over today" value={o.filter(x => x.drawKw > x.ratingBeforeKw).length} tone={o.some(x => x.drawKw > x.ratingAfterKw) ? 'bad' : 'ok'} sub={`${o.filter(x => x.drawKw > x.ratingAfterKw).length} still over after`} />
        <Stat label="Outlets short" value={o.filter(x => !x.ok).length} tone={o.some(x => !x.ok) ? 'bad' : 'ok'} sub="per side, C13 and C19" />
      </div>
      <SubTitle>Power and outlets per rack</SubTitle>
      <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
        <thead><tr><th>Rack</th><th style={{ textAlign: 'right' }}>Draw</th><th style={{ textAlign: 'right' }}>Rating before → after</th><th style={{ textAlign: 'right' }}>C13 per side</th><th style={{ textAlign: 'right' }}>C19 per side</th><th>Feeds</th><th>Check</th></tr></thead>
        <tbody>{o.map(x => (
          <tr key={x.rackId}>
            <td><b>{byId(p.data, 'racks', x.rackId)?.name}</b></td><td style={{ textAlign: 'right' }}>{x.drawKw} kW</td><td style={{ textAlign: 'right' }}>{x.ratingBeforeKw} → <b>{x.ratingAfterKw}</b> kW</td>
            <td style={{ textAlign: 'right' }}>{x.perSideC13} / {x.haveC13}</td><td style={{ textAlign: 'right' }}>{x.perSideC19} / {x.haveC19}</td>
            <td style={{ fontSize: 12 }}>{x.feeds.map(f => `${f.name} ${f.voltage} V ${f.amperage} A`).join(', ') || 'none recorded'}</td>
            <td><VwChip variant={tone(x.ok && x.drawKw <= x.ratingAfterKw)}>{!x.ok ? 'outlets short' : x.drawKw > x.ratingAfterKw ? 'over rating' : 'fits'}</VwChip></td>
          </tr>
        ))}</tbody>
      </table></div>
      <div style={{ fontSize: 12, ...muted, marginTop: 4 }}>Power ports are counted from each device's power-port records; big PSUs and power entry modules need C19. Strip outlets from the strip datasheet (benchmark).</div>
    </>);
  }
  const over = a.rackRows.filter(r => r.level === 'bad');
  return (<>
    <div style={grid4}>
      <Stat label="Load today" value={fmtKw(a.oldKw)} sub="measured on the selected devices" />
      <Stat label="Load after" value={fmtKw(a.newKw)} sub={`${fmtKw(a.peakKw)} at peak`} />
      <Stat label="Change" value={`${a.deltaKw > 0 ? '+' : ''}${a.deltaKw} kW`} tone={a.deltaKw > 0 ? 'warn' : 'ok'} />
      <Stat label="Racks over a limit" value={over.length} tone={over.length ? 'bad' : 'ok'} sub={`of ${a.rackRows.length} racks touched`} />
    </div>
    <SubTitle>Each rack before and after the swap</SubTitle>
    <RackRows a={a} />
    {a.scope === 'network-refresh' && <div style={{ fontSize: 12, ...muted, marginTop: 4 }}>The old switch stays powered beside the new one until the soak ends, so the side-by-side figure is checked against one feed too.</div>}
  </>);
}

export function ReplaceSpacePanel(p: StepProps) {
  const a = useA(p);
  if (!a?.ready || (!a.old.length && !a.rackIds.length)) return <Wait a={a} goTo={p.goTo} />;
  if (a.scope !== 'rack-replace') return (<>
    <div style={grid4}>
      <Stat label="Racks touched" value={a.rackRows.length} />
      <Stat label="New units placed" value={`${a.units.filter(u => u.placed).length} of ${a.units.length}`} tone={a.units.every(u => u.placed) ? 'ok' : 'bad'} />
      <Stat label="Moved to another rack" value={a.units.filter(u => u.placed && !u.oldIds.some(id => byId(p.data, 'devices', id)?.rackId === u.rackId)).length} sub="no room or power in the home rack" />
      <Stat label="U freed" value={a.rackRows.reduce((s, r) => s + Math.max(0, r.uBefore - r.uAfter), 0)} sub="released when each wave closes" />
    </div>
    <SubTitle>Space and weight per rack</SubTitle>
    <RackRows a={a} />
  </>);
  const r = a.rack!;
  const setMethod = (rackId: string, m: SwapMethod) => p.patch({ params: { ...p.draft.params, [`swap:${rackId}`]: m } });
  return (<>
    <div style={grid4}>
      <Stat label="New rack" value={r.newType?.model ?? 'Not in catalogue'} sub={r.newType ? `${r.newType.uHeight} U, ${r.newType.outerWidthMm} × ${r.newType.outerDepthMm} mm` : 'pick a catalogue rack'} tone={r.newType ? undefined : 'bad'} />
      <Stat label="Recommended" value={r.recommend.type?.model ?? '—'} sub={r.recommend.why} tone={r.recommend.type && r.recommend.type.id !== r.newType?.id ? 'warn' : undefined} />
      <Stat label="Fit problems" value={r.fit.filter(f => !f.ok).length} tone={r.fit.some(f => !f.ok) ? 'bad' : 'ok'} sub={`${r.fit.filter(f => f.warnings.length).length} with warnings`} />
      <Stat label="Devices re-racked" value={a.old.filter(d => d.category !== 'PDU').length} sub={`${a.old.filter(d => d.category === 'PDU').length} old power strips replaced`} />
    </div>
    <SubTitle>Each rack: fit and swap method</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Rack</th><th>Owner</th><th style={{ textAlign: 'right' }}>Devices</th><th>Swap method</th><th style={{ textAlign: 'right' }}>Outage per device</th><th style={{ textAlign: 'right' }}>Floor</th><th>Fit</th></tr></thead>
      <tbody>{a.rackIds.map(id => {
        const rk = byId(p.data, 'racks', id); const f = r.fit.find(x => x.rackId === id); const m = r.methods[id]; const n = a.old.filter(d => d.rackId === id && d.category !== 'PDU').length; const free = r.freePositions[id] ?? [];
        return (
          <tr key={id}>
            <td><b>{rk?.name}</b><div style={{ fontSize: 11, ...muted }}>{byId(p.data, 'rows', rk?.rowId)?.name}</div></td><td>{rk?.owner}</td><td style={{ textAlign: 'right' }}>{n}</td>
            <td><Select size="small" value={m} style={{ width: 230 }} onChange={v => setMethod(id, v)} options={SWAP_METHODS.map(x => ({ value: x, label: x === 'Next free position in the row' ? `${x} (${free.length} free)` : x, disabled: x === 'Next free position in the row' && !free.length }))} /><div style={{ fontSize: 11, ...muted, whiteSpace: 'normal', maxWidth: 260 }}>{SWAP_TEXT[m]}</div></td>
            <td style={{ textAlign: 'right' }}>{outageHours(m, n, a.rate)} h</td>
            <td style={{ textAlign: 'right' }}>{f ? `${f.floorKgSqm}${f.floorLimit ? ` / ${f.floorLimit}` : ''} kg/m²` : '—'}</td>
            <td style={{ whiteSpace: 'normal' }}>{f?.issues.map((i, k) => <div key={k} style={{ fontSize: 12, color: 'var(--vw-color-red-600)' }}>{i}</div>)}{f?.warnings.map((i, k) => <div key={`w${k}`} style={{ fontSize: 12, color: 'var(--vw-color-amber-700)' }}>{i}</div>)}{f && f.ok && !f.warnings.length && <VwChip variant="success">fits</VwChip>}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  </>);
}

/* ------------------------------------------------------------------ network and server ports */
export function ReplaceNetworkPanel(p: StepProps) {
  const a = useA(p); const [dev, setDev] = useState<string | undefined>();
  if (!a?.ready || !a.old.length) return <Wait a={a} goTo={p.goTo} />;
  if (a.scope === 'server-refresh') {
    const n = a.nic!;
    return (<>
      <div style={grid4}>
        <Stat label="Port fit" value={n.status === 'n/a' ? 'Not checked' : n.status === 'pass' ? 'Fits' : n.status === 'warn' ? 'Check' : 'Short'} tone={n.status === 'fail' ? 'bad' : n.status === 'warn' ? 'warn' : n.status === 'pass' ? 'ok' : undefined} sub={`${n.leafIds.length} leaf switches serve these servers`} />
        <Stat label="Data ports freed" value={n.perClass.reduce((s, x) => s + x.freed, 0)} />
        <Stat label="Data ports needed" value={n.perClass.reduce((s, x) => s + x.needed, 0)} />
        <Stat label="Addresses kept" value={a.units.filter(u => u.keepIp4).length} sub="primary and OOB of the first old server per unit" />
      </div>
      <div style={{ fontSize: 12, marginTop: 8 }}>{n.detail}</div>
      <SubTitle>Ports by type</SubTitle>
      <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
        <thead><tr><th>Port type</th><th style={{ textAlign: 'right' }}>Freed by old servers</th><th style={{ textAlign: 'right' }}>Needed by new servers</th><th style={{ textAlign: 'right' }}>Free on the leaves</th></tr></thead>
        <tbody>{n.perClass.map(x => <tr key={x.cls}><td>{x.cls}</td><td style={{ textAlign: 'right' }}>{x.freed}</td><td style={{ textAlign: 'right' }}>{x.needed}</td><td style={{ textAlign: 'right' }}>{x.leafFree ?? '—'}</td></tr>)}</tbody>
      </table></div>
    </>);
  }
  const pm = a.ports!; const d = pm.devices.find(x => x.deviceId === dev) ?? pm.devices[0];
  return (<>
    <ReplacementPanel {...p} />
    <SubTitle>Port map</SubTitle>
    <div style={grid4}>
      <Stat label="Used ports" value={pm.used} sub={pm.assumed ? `${pm.assumed} switches without cable or NMS records: every enabled port counted` : 'from cables and NMS interfaces'} tone={pm.assumed ? 'warn' : undefined} />
      <Stat label="Without a match" value={pm.incompatible} tone={pm.incompatible ? 'bad' : 'ok'} />
      <Stat label="Far-end changes" value={pm.farEnd.length} sub="uplinks changing speed at the spine" tone={pm.farEnd.length ? 'warn' : undefined} />
      <Stat label="Optics" value={`${pm.optics.reduce((s, o) => s + o.reuse, 0)} reused · ${pm.optics.reduce((s, o) => s + o.buy, 0) + pm.farOptics.reduce((s, o) => s + o.buy, 0)} new`} sub={`${pm.dac.reduce((s, o) => s + o.reuse + o.buy, 0)} DAC kept apart`} />
    </div>
    <div className="nst-table-wrap" style={{ marginTop: 8 }}><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Optic class</th><th style={{ textAlign: 'right' }}>Reused</th><th style={{ textAlign: 'right' }}>New</th></tr></thead>
      <tbody>{pm.optics.map(o => <tr key={o.cls}><td>{o.cls}</td><td style={{ textAlign: 'right' }}>{o.reuse}</td><td style={{ textAlign: 'right' }}>{o.buy}</td></tr>)}{pm.farOptics.map(o => <tr key={`f${o.cls}`}><td>{o.cls} at the far end</td><td style={{ textAlign: 'right' }}>0</td><td style={{ textAlign: 'right' }}>{o.buy}</td></tr>)}</tbody>
    </table></div>
    <SubTitle extra={<Select size="small" style={{ width: 240 }} value={d?.deviceId} onChange={setDev} options={pm.devices.map(x => ({ value: x.deviceId, label: `${byId(p.data, 'devices', x.deviceId)?.name}${x.incompatible.length ? ' · problems' : ''}` }))} />}>Patch list</SubTitle>
    {d && <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Old port</th><th>Type</th><th>New port</th><th>Type · speed</th><th>Far end</th><th>Optic</th><th>Note</th></tr></thead>
      <tbody>{d.rows.map(r => <tr key={r.oldPort}><td>{r.oldPort}</td><td>{r.oldCls} {r.oldSpeed / 1000}G</td><td>{r.newPort ?? <span style={{ color: 'var(--vw-color-red-600)' }}>none</span>}</td><td>{r.newCls ? `${r.newCls} ${(r.newSpeed ?? 0) / 1000}G` : '—'}</td><td>{r.farDeviceId ? `${byId(p.data, 'devices', r.farDeviceId)?.name} ${r.farPort ?? ''}` : '—'}</td><td>{r.optic}</td><td style={{ whiteSpace: 'normal', fontSize: 12 }}>{r.note}</td></tr>)}</tbody>
    </table></div>}
    <div style={{ fontSize: 12, ...muted, marginTop: 4 }}>New ports from {d?.source === 'templates' ? 'the DCIM component templates' : d?.source === 'datasheet' ? 'the vendor datasheet profile (no trusted DCIM templates for the model)' : 'nowhere: no profile'}; old ports from {d?.basis === 'cable' ? 'cable records' : d?.basis === 'nms' ? 'NMS interfaces that are up' : 'every enabled interface (no cable or interface records)'}.</div>
  </>);
}

/* ------------------------------------------------------------------ IT: mapping, impact and business case */
export function ReplaceItPanel(p: StepProps) {
  const a = useA(p);
  if (!a?.ready || !a.old.length) return <Wait a={a} goTo={p.goTo} />;
  const b = a.business; const est = p.ev!.estimate;
  return (<>
    <ReplacementPanel {...p} />
    <SubTitle>Who is affected</SubTitle>
    <div style={grid4}>
      <Stat label="Services" value={a.impact.services.length} sub={`${a.impact.critical} critical`} tone={a.impact.critical ? 'warn' : undefined} />
      <Stat label="Customers" value={a.impact.customers.length} sub={`${a.impact.customers.filter(c => c.customer.premium).length} premium`} />
      <Stat label="Revenue on the kit" value={fmtUsd(a.impact.revenueMonthly)} sub="a month" />
      <Stat label="Tightest SLA" value={a.impact.minSla ? `${a.impact.minSla}%` : '—'} sub={a.critical.services.length ? 'critical: parallel run needed' : undefined} />
    </div>
    <SubTitle>Business case</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <tbody>
        <tr><td>One-off cost</td><td style={{ textAlign: 'right' }}><b>{fmtUsd(est.capexTotal)}</b></td><td style={{ whiteSpace: 'normal', fontSize: 12 }}>bill of materials plus {fmtUsd(est.contingencyUsd ?? 0)} contingency{b.resaleCredit ? `, less ${fmtUsd(b.resaleCredit)} resale` : ''}</td></tr>
        {b.benefitLines.map(l => <tr key={l.item}><td>{l.item}</td><td style={{ textAlign: 'right', color: l.amount < 0 ? 'var(--vw-color-red-600)' : undefined }}>{fmtUsd(l.amount)} a year</td><td style={{ whiteSpace: 'normal', fontSize: 12 }}>{l.basis}</td></tr>)}
        <tr><td>Payback</td><td style={{ textAlign: 'right' }}><b>{est.paybackMonths === null ? '—' : `${est.paybackMonths} months`}</b></td><td style={{ whiteSpace: 'normal', fontSize: 12 }}>{est.paybackBasis}</td></tr>
      </tbody>
    </table></div>
    {b.notes.map(n => <div key={n} style={{ fontSize: 12, ...muted }}>{n}</div>)}
  </>);
}

/* ------------------------------------------------------------------ delivery: what each wave needs and when */
export function ReplaceDeliveryPanel(p: StepProps) {
  const a = useA(p);
  if (!a?.ready || (!a.old.length && !a.rackIds.length)) return <Wait a={a} goTo={p.goTo} />;
  if (!a.needs.length) return <div className="vw-card-description">Make the waves on the Migration waves step; each wave's equipment is then dated here.</div>;
  return (<>
    <div style={grid4}>{a.supply.map(s => <Stat key={s.model} label={s.model} value={`${s.stock} stock · ${s.procure} buy`} sub={s.procure ? `${s.leadWeeks} weeks to buy (${s.leadItem})` : 'all from stock: transfer time only'} />)}</div>
    <SubTitle>Per wave</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Wave</th><th>Equipment</th><th style={{ textAlign: 'right' }}>Qty</th><th>Source</th><th>Order by</th><th>On site by</th><th>Needed by</th><th /></tr></thead>
      <tbody>{a.needs.map((n, i) => <tr key={i}><td>{n.waveName}</td><td>{n.model}</td><td style={{ textAlign: 'right' }}>{n.qty}</td><td style={{ fontSize: 12 }}>{n.note}</td><td>{n.orderBy.slice(0, 10)}</td><td>{n.arrives.slice(0, 10)}</td><td>{n.needBy.slice(0, 10)}</td><td><VwChip variant={n.late ? 'error' : 'success'}>{n.late ? 'late' : 'in time'}</VwChip></td></tr>)}</tbody>
    </table></div>
    <div style={{ fontSize: 12, ...muted, marginTop: 4 }}>Needed by is the window less the staging and burn-in time. Stock needs only its transfer; purchases take the benchmark lead time.</div>
  </>);
}

/* ------------------------------------------------------------------ waves */
export function ReplaceWavesPanel(p: StepProps) {
  const a = useA(p);
  if (!a?.ready || (!a.old.length && !a.rackIds.length)) return <Wait a={a} goTo={p.goTo} />;
  const r = a.rack;
  const waves = p.draft.waves ?? [];
  return (<>
    <WavesEditor {...p} family="replace" />
    {r && (<>
      <SubTitle>Tenant consent</SubTitle>
      <ConsentRegister rows={r.consents} onChange={rows => p.patch({ consents: rows })} firstWave={c => { const ids = r.tenants.find(t => t.key === c.customerRef)?.rackIds ?? []; return waves.filter(w => w.rackIds.some(x => ids.includes(x))).map(w => w.windowStart).sort()[0]; }} />
      {r.xconnects.length > 0 && <><SubTitle>Cross-connects to re-patch</SubTitle><div style={{ fontSize: 12 }}>{r.xconnects.map(t => `${t.termination.xconnectId ?? '—'} (${t.circuit?.cid ?? t.termination.circuitId}, ${byId(p.data, 'devices', t.termination.deviceId)?.name})`).join(' · ')}</div></>}
      {r.reservations.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Rack reservations carried to the new racks: {r.reservations.map(x => `${byId(p.data, 'racks', x.rackId)?.name} U${x.units[0]}–${x.units[x.units.length - 1]} for ${x.tenant ?? x.reservedBy}`).join(' · ')}</div>}
    </>)}
    {!r && a.impact.customers.length > 0 && (<>
      <SubTitle>Customers to notify</SubTitle>
      <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
        <thead><tr><th>Customer</th><th>Account manager</th><th style={{ textAlign: 'right' }}>Services</th><th>First wave</th></tr></thead>
        <tbody>{a.impact.customers.map(c => { const fw = waves.filter(w => c.services.some(s => w.serviceIds.includes(s.id))).sort((x, y) => x.windowStart.localeCompare(y.windowStart))[0]; return <tr key={c.customer.id}><td><b>{c.customer.name}</b>{c.customer.premium && <VwChip variant="purple" style={{ fontSize: 10, marginLeft: 4 }}>premium</VwChip>}</td><td>{c.customer.accountManager}</td><td style={{ textAlign: 'right' }}>{c.services.length}{c.critical ? ` (${c.critical} critical)` : ''}</td><td>{fw ? `${fw.name} · ${fmtWhen(fw.windowStart)}` : '—'}</td></tr>; })}</tbody>
      </table></div>
    </>)}
  </>);
}
