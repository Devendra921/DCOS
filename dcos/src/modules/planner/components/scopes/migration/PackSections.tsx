/* Plan pack sections for migrations: inventory register, cut-over runbook, consent register, exit
   plan (circuits, contracts, addresses), compliance and the closure checklist. */
import { VwChip } from '../../../../../shared/components/ux';
import { fmtUsd } from '../../../lib/engine';
import { DISPOSITION_LABEL, migrationCloseout, migrationOf } from '../../../lib/migrationCore';
import { byId } from '../../../lib/plannerData';
import type { PlanViewProps } from '../types';
import { ConsentRegister } from '../replace/Consents';
import { fmtWhen } from '../replace/model';

const muted = { color: 'var(--vw-color-slate-500)' } as const;

export function InventoryRegister({ ev }: PlanViewProps) {
  const a = migrationOf(ev); if (!a?.ready) return <div className="vw-card-description">{a?.reason}</div>;
  return (<div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
    <thead><tr><th>Type</th><th>Item</th><th>Detail</th><th>What happens</th><th>Confirmed</th></tr></thead>
    <tbody>{a.rows.map(r => <tr key={r.key}><td>{r.recordType}</td><td><b>{r.label}</b></td><td style={{ fontSize: 12 }}>{r.detail}</td><td>{DISPOSITION_LABEL[r.disposition]}</td><td>{r.fromPlan ? 'yes' : <span style={muted}>proposed</span>}</td></tr>)}</tbody>
  </table></div>);
}

export function MigrationRunbook({ plan, ev, data }: PlanViewProps) {
  const a = migrationOf(ev); const waves = [...(plan.waves ?? [])].sort((x, y) => x.order - y.order);
  if (!waves.length) return <div className="vw-card-description">No waves yet.</div>;
  return (<div className="vw-flex vw-flex-col vw-gap-md">{waves.map(w => {
    const svcs = a?.services.filter(s => w.serviceIds.includes(s.service.id)) ?? [];
    const cons = a?.consents.filter(c => c.serviceIds.some(s => w.serviceIds.includes(s))) ?? [];
    const steps: [string, string][] = [
      ['Before', `Consent: ${cons.map(c => `${c.customerName} (${c.status})`).join(', ') || 'nobody affected'}. Change ${w.changeRequestId ?? '(raised at execution)'} approved. ${svcs.some(s => s.approach === 'Replicate and swing') ? 'Replication in sync and lag under the agreed limit.' : ''}`],
      ['Work', `${w.method ?? ''}. ${svcs.map(s => `${s.service.name}: ${s.approach}, about ${s.downtimeH} h down`).join('; ')}`],
      ['Acceptance', w.acceptance ?? ''],
      ['Rollback', w.rollback],
      ['After', `${w.deviceIds.length} devices out of ${a?.source?.code ?? 'the source'}; data-bearing ones sealed for the disposal vendor. ${(w.circuitIds ?? []).length ? `Circuits ${(w.circuitIds ?? []).map(c => byId(data, 'circuits', c)?.cid ?? c).join(', ')} ceased with the carrier.` : ''} Records updated by "Close wave".`],
    ];
    return (<div key={w.id} className="vw-card-child" style={{ padding: '10px 14px' }}>
      <div className="vw-flex vw-justify-between"><b>{w.name}</b><span style={{ fontSize: 12, ...muted }}>{fmtWhen(w.windowStart)} → {fmtWhen(w.windowEnd)}</span></div>
      <table className="nst-table" style={{ width: '100%', marginTop: 6 }}><tbody>{steps.map(([k, v]) => <tr key={k}><td style={{ width: 100 }}><b>{k}</b></td><td style={{ whiteSpace: 'normal' }}>{v}</td></tr>)}</tbody></table>
    </div>);
  })}</div>);
}

export function MigrationConsents({ ev }: PlanViewProps) {
  const a = migrationOf(ev); if (!a?.ready) return null;
  return <ConsentRegister rows={a.consents} readOnly firstWave={c => a.consents.find(x => x.customerRef === c.customerRef)?.firstWave} />;
}

export function ExitPlan({ ev, data }: PlanViewProps) {
  const a = migrationOf(ev); if (!a?.ready) return null;
  return (<div className="vw-flex vw-flex-col vw-gap-md">
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Circuit</th><th>Action</th><th>Date</th><th style={{ textAlign: 'right' }}>Cost</th></tr></thead>
      <tbody>{a.circuits.map(c => <tr key={c.circuit.id}><td>{c.circuit.cid} ({byId(data, 'providers', c.circuit.providerId)?.name})</td><td>{c.action}</td><td>{c.ceaseDate?.slice(0, 10) ?? '—'}</td><td style={{ textAlign: 'right' }}>{c.penaltyUsd ? fmtUsd(c.penaltyUsd) : '—'}</td></tr>)}{!a.circuits.length && <tr><td colSpan={4} style={muted}>No circuits.</td></tr>}</tbody></table></div>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Contract</th><th>Vendor</th><th>Ends</th><th>Notice</th><th>Serve by</th><th style={{ textAlign: 'right' }}>A year</th></tr></thead>
      <tbody>{a.contracts.map(c => <tr key={c.contract.id}><td>{c.contract.type} {c.contract.ctrId}</td><td>{c.vendor?.name}</td><td>{c.contract.endDate.slice(0, 10)}</td><td>{c.contract.noticeDays ?? '—'} days</td><td style={{ color: c.late ? 'var(--vw-color-red-600)' : undefined }}>{c.endsBeforeExit ? 'ends before the exit' : c.serveBy?.slice(0, 10) ?? 'unknown'}</td><td style={{ textAlign: 'right' }}>{fmtUsd(c.annualUsd)}</td></tr>)}
        {!a.contracts.length && <tr><td colSpan={6} style={muted}>No lease or site contract is recorded for {a.source?.code}; check the lease terms.</td></tr>}</tbody></table></div>
    <div style={{ fontSize: 12 }}><b>Addresses:</b> release {a.ip.subnets.map(s => s.cidr).join(', ') || 'none'}; VLANs {a.ip.vlans.map(v => v.vlanNumber).join(', ') || 'none'}.{a.ip.target.length ? ` New at ${a.target?.code}: ${a.ip.target.map(t => `${t.cidr ?? 'no room'} for ${t.source}`).join(', ')}.` : ''}</div>
  </div>);
}

export function Compliance({ ev }: PlanViewProps) {
  const a = migrationOf(ev); if (!a?.ready) return null;
  return (<div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Step</th><th>Authority</th><th>Why</th><th>On the plan</th></tr></thead>
    <tbody>{a.permits.map(p => <tr key={p.name}><td><b>{p.name}</b></td><td>{p.authority}</td><td style={{ whiteSpace: 'normal' }}>{p.why}</td><td><VwChip variant={p.onPlan ? 'success' : 'warning'}>{p.onPlan ? 'yes' : 'missing'}</VwChip></td></tr>)}</tbody></table></div>);
}

export function MigrationClosure({ plan, data }: PlanViewProps) {
  const checks = migrationCloseout(plan, data);
  return (<div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><tbody>{checks.map(c => <tr key={c.key}><td style={{ width: 70 }}><VwChip variant={c.ok ? 'success' : 'warning'}>{c.ok ? 'Done' : 'Open'}</VwChip></td><td><b>{c.label}</b></td><td style={{ whiteSpace: 'normal' }}>{c.detail}</td></tr>)}</tbody></table></div>);
}
