/* Plan pack sections for the replace family: old-to-new list, wave schedule, cut-over runbook
   generated from the waves, ports and patching, consent and notification, closure checklist. */
import type * as T from '../../../../../mock/data/types';
import { VwChip } from '../../../../../shared/components/ux';
import { replaceOf, type ReplaceAnalysis } from '../../../lib/replaceAnalysis';
import { replaceCloseout } from '../../../lib/replaceClose';
import { byId, type PlannerData } from '../../../lib/plannerData';
import { swapMethodOf } from '../../../lib/replaceRack';
import { WAVE_STATUS_TONE } from '../../../lib/waves';
import type { PlanViewProps } from '../types';
import { ConsentRegister } from './Consents';
import { fmtWhen } from './model';

const muted = { color: 'var(--vw-color-slate-500)' } as const;
const name = (data: PlannerData, id?: string) => byId(data, 'devices', id)?.name ?? byId(data, 'racks', id)?.name ?? id ?? '—';
function Need({ a }: { a?: ReplaceAnalysis }) { return <div className="vw-card-description">{a?.reason ?? 'Nothing selected yet.'}</div>; }
const waveOf = (plan: T.PlannerPlan, id: string) => (plan.waves ?? []).find(w => w.deviceIds.includes(id) || w.rackIds.includes(id));

export function OldToNew({ plan, ev, data }: PlanViewProps) {
  const a = replaceOf(ev); if (!a?.ready) return <Need a={a} />;
  if (a.scope === 'rack-replace') return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Old rack</th><th>Type</th><th>New rack</th><th>Method</th><th>New position</th><th style={{ textAlign: 'right' }}>Devices</th><th>Wave</th></tr></thead>
      <tbody>{a.rackIds.map(id => { const r = byId(data, 'racks', id); const m = swapMethodOf(plan, id); const free = a.rack?.freePositions[id]?.[0]; return <tr key={id}><td><b>{r?.name}</b></td><td>{byId(data, 'rackTypes', r?.rackTypeId)?.model}</td><td>{a.rack?.newType?.model}</td><td>{m}</td><td>{m === 'Next free position in the row' ? free?.name ?? 'none free: in place' : 'same position'}</td><td style={{ textAlign: 'right' }}>{a.old.filter(d => d.rackId === id).length}</td><td>{waveOf(plan, id)?.name ?? '—'}</td></tr>; })}</tbody>
    </table></div>
  );
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Old device</th><th>Serial</th><th>Rack · U</th><th>New unit</th><th>Goes to</th><th>Keeps</th><th>Old one</th><th>Wave</th></tr></thead>
      <tbody>{a.units.flatMap(u => u.oldIds.map((id, i) => { const d = byId(data, 'devices', id); const m = a.mapping.find(x => x.id === u.mapId); return (
        <tr key={id}><td>{d?.name}</td><td>{d?.serial ?? '—'}</td><td>{byId(data, 'racks', d?.rackId)?.name} · U{d?.position ?? '—'}</td><td>{i === 0 ? `${u.id} · ${u.model}` : <span style={muted}>with {u.id}</span>}</td><td>{i === 0 ? `${byId(data, 'racks', u.rackId)?.name ?? 'no position'} · U${u.startU ?? '—'}` : ''}</td><td>{i === 0 ? [u.keepHostname, u.keepIp4, u.keepOob && `OOB ${u.keepOob}`].filter(Boolean).join(', ') : ''}</td><td>{m?.disposition}</td><td>{waveOf(plan, id)?.name ?? '—'}</td></tr>
      ); }))}</tbody>
    </table></div>
  );
}

export function WaveSchedule({ plan, data }: PlanViewProps) {
  const waves = [...(plan.waves ?? [])].sort((a, b) => a.order - b.order);
  if (!waves.length) return <div className="vw-card-description">No waves yet.</div>;
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Wave</th><th>Window</th><th>Scope</th><th>Method</th><th>Change</th><th>Window record</th><th>Test</th><th>Status</th></tr></thead>
      <tbody>{waves.map(w => <tr key={w.id}><td><b>{w.name}</b></td><td>{fmtWhen(w.windowStart)}</td><td>{w.rackIds.length} racks, {w.deviceIds.length} devices{w.serviceIds.length ? `, ${w.serviceIds.length} services` : ''}</td><td style={{ whiteSpace: 'normal', fontSize: 12 }}>{w.method}</td><td>{w.changeRequestId ?? '—'}</td><td>{w.maintenanceWindowId ?? '—'}</td><td>{w.atpId ? `${w.atpId} (${data.atps.find(x => x.id === w.atpId)?.status ?? '—'})` : '—'}</td><td><VwChip variant={WAVE_STATUS_TONE[w.status]}>{w.status}</VwChip></td></tr>)}</tbody>
    </table></div>
  );
}

/** The cut-over runbook, step by step for each wave, generated from the waves themselves. */
export function Runbook({ plan, ev, data }: PlanViewProps) {
  const a = replaceOf(ev);
  const waves = [...(plan.waves ?? [])].sort((x, y) => x.order - y.order);
  if (!waves.length) return <div className="vw-card-description">No waves yet.</div>;
  const scope = plan.scope;
  return (<div className="vw-flex vw-flex-col vw-gap-md">{waves.map(w => {
    const steps: [string, string][] = [
      ['T−7 days', `Change ${w.changeRequestId ?? '(raised at execution)'} approved by the change board; customers on the notification list told the window.`],
      ['T−2 days', scope === 'network-refresh' ? 'Configuration backup taken and the translated configuration loaded and diffed in the lab.' : scope === 'server-refresh' ? 'New units staged, firmware and BIOS on the baseline, 24 h burn-in started.' : 'New racks and power strips delivered and inspected; free positions checked; labels printed.'],
      ['T−0, start', `Confirm with the service desk and the monitoring team; freeze other work on ${w.rackIds.map(r => name(data, r)).slice(0, 4).join(', ')}${w.rackIds.length > 4 ? '…' : ''}.`],
      ['Work', w.method ?? ''],
      ['Half time', 'Decision point: on track, or start the rollback so the window is not overrun.'],
      ['Acceptance', w.acceptance ?? ''],
      ['Rollback', w.rollback],
      ['After', scope === 'server-refresh' ? 'Old servers wiped, bagged and sealed for the disposal vendor (chain of custody); records updated by "Close wave".' : scope === 'network-refresh' ? `Old switches stay racked until the ${a?.soakDays ?? 7}-day soak ends; then removed, wiped and "Close wave".` : 'Old racks removed and recycled; rack elevation, feeds and reservations updated by "Close wave".'],
    ];
    return (
      <div key={w.id} className="vw-card-child" style={{ padding: '10px 14px' }}>
        <div className="vw-flex vw-justify-between"><b>{w.name}</b><span style={{ fontSize: 12, ...muted }}>{fmtWhen(w.windowStart)} → {fmtWhen(w.windowEnd)}</span></div>
        <table className="nst-table" style={{ width: '100%', marginTop: 6 }}><tbody>{steps.map(([k, v]) => <tr key={k}><td style={{ width: 120 }}><b>{k}</b></td><td style={{ whiteSpace: 'normal' }}>{v}</td></tr>)}</tbody></table>
        <div style={{ fontSize: 12, ...muted, marginTop: 4 }}>{scope === 'rack-replace' ? `Racks: ${w.rackIds.map(r => name(data, r)).join(', ')}` : `Devices: ${w.deviceIds.map(d => name(data, d)).join(', ')}`}</div>
      </div>
    );
  })}</div>);
}

export function PortsAndPatching({ plan, ev, data }: PlanViewProps) {
  const a = replaceOf(ev); if (!a?.ready) return <Need a={a} />;
  if (a.ports) {
    const waves = [...(plan.waves ?? [])].sort((x, y) => x.order - y.order);
    return (<div className="vw-flex vw-flex-col vw-gap-md">
      {a.ports.farEnd.length > 0 && <div style={{ fontSize: 12 }}><b>Far-end changes:</b> {a.ports.farEnd.map(r => `${name(data, r.deviceId)} ${r.oldPort} → ${r.newPort} (${r.farDeviceId ? `${name(data, r.farDeviceId)} ${r.farPort ?? ''}` : 'spine port not recorded'})`).join(' · ')}</div>}
      {(waves.length ? waves : [undefined]).map(w => {
        const devs = a.ports!.devices.filter(d => !w || w.deviceIds.includes(d.deviceId));
        return (<div key={w?.id ?? 'all'}><b>{w?.name ?? 'All switches'}</b>
          <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
            <thead><tr><th>Switch</th><th>Old port</th><th>New port</th><th>Speed</th><th>Far end</th><th>Optic</th></tr></thead>
            <tbody>{devs.flatMap(d => d.rows.map(r => <tr key={`${d.deviceId}${r.oldPort}`}><td>{name(data, d.deviceId)}</td><td>{r.oldPort} ({r.oldCls})</td><td>{r.newPort ?? 'none'} {r.newCls ? `(${r.newCls})` : ''}</td><td>{(r.newSpeed ?? 0) / 1000}G</td><td>{r.farDeviceId ? `${name(data, r.farDeviceId)} ${r.farPort ?? ''}` : '—'}</td><td>{r.optic}</td></tr>))}</tbody>
          </table></div></div>);
      })}
    </div>);
  }
  if (a.nic) return (<div><div style={{ fontSize: 12, marginBottom: 6 }}>{a.nic.detail}</div>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>New unit</th><th>Rack · U</th><th>Primary</th><th>Out of band</th><th>Kept from</th></tr></thead>
      <tbody>{a.units.map(u => <tr key={u.id}><td>{u.id} · {u.model}</td><td>{name(data, u.rackId)} · U{u.startU ?? '—'}</td><td>{u.keepIp4 ?? '—'}</td><td>{u.keepOob ?? '—'}</td><td>{name(data, u.oldIds[0])}</td></tr>)}</tbody></table></div></div>);
  return (<div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Cross-connect</th><th>Circuit</th><th>Device</th><th>Speed</th></tr></thead>
    <tbody>{(a.rack?.xconnects ?? []).map(t => <tr key={t.termination.id}><td>{t.termination.xconnectId ?? '—'}</td><td>{t.circuit?.cid ?? t.termination.circuitId}</td><td>{name(data, t.termination.deviceId)}</td><td>{(t.termination.portSpeedMbps ?? 0) / 1000}G</td></tr>)}{!(a.rack?.xconnects ?? []).length && <tr><td colSpan={4} style={muted}>No cross-connects end in the racks.</td></tr>}</tbody></table></div>);
}

export function PeopleSection({ plan, ev }: PlanViewProps) {
  const a = replaceOf(ev); if (!a?.ready) return <Need a={a} />;
  if (a.rack) return <ConsentRegister rows={a.rack.consents} readOnly firstWave={c => { const ids = a.rack!.tenants.find(t => t.key === c.customerRef)?.rackIds ?? []; return (plan.waves ?? []).filter(w => w.rackIds.some(x => ids.includes(x))).map(w => w.windowStart).sort()[0]; }} />;
  return (<div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
    <thead><tr><th>Customer</th><th>Account manager</th><th>Services</th><th>Waves</th></tr></thead>
    <tbody>{a.impact.customers.map(c => <tr key={c.customer.id}><td><b>{c.customer.name}</b>{c.customer.premium && <VwChip variant="purple" style={{ fontSize: 11, marginLeft: 4 }}>premium</VwChip>}</td><td>{c.customer.accountManager}</td><td style={{ whiteSpace: 'normal', fontSize: 12 }}>{c.services.map(s => `${s.name}${s.critical ? ' (critical)' : ''}`).join(', ')}</td><td style={{ whiteSpace: 'normal', fontSize: 12 }}>{(plan.waves ?? []).filter(w => c.services.some(s => w.serviceIds.includes(s.id))).map(w => `${w.name} ${fmtWhen(w.windowStart)}`).join('; ') || '—'}</td></tr>)}
      {!a.impact.customers.length && <tr><td colSpan={4} style={muted}>No customer service runs on the selected equipment.</td></tr>}</tbody>
  </table></div>);
}

export function ClosureChecklist({ plan, data }: PlanViewProps) {
  const checks = replaceCloseout(plan, data);
  return (<div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><tbody>{checks.map(c => <tr key={c.key}><td style={{ width: 28 }}><VwChip variant={c.ok ? 'success' : 'warning'}>{c.ok ? 'Done' : 'Open'}</VwChip></td><td><b>{c.label}</b></td><td style={{ whiteSpace: 'normal' }}>{c.detail}</td></tr>)}</tbody></table></div>);
}
