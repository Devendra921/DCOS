/* Wizard result panels for migrations, consolidations and decommissions. */
import { VwChip } from '../../../../../shared/components/ux';
import { fmtKw, fmtUsd } from '../../../lib/engine';
import { DISPOSITION_LABEL, migrationOf, type MigrationAnalysis } from '../../../lib/migrationCore';
import { byId } from '../../../lib/plannerData';
import { Stat } from '../../kit';
import type { StepProps } from '../../wizard/wizardModel';
import { SubTitle } from '../../wizard/ParamField';
import { WavesEditor } from '../replace/WavesEditor';
import { ConsentRegister } from '../replace/Consents';

const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 } as const;
const muted = { color: 'var(--vw-color-slate-500)' } as const;
function useM(p: StepProps): MigrationAnalysis | undefined { return p.ev ? migrationOf(p.ev) : undefined; }
function Wait({ a, goTo }: { a?: MigrationAnalysis; goTo: StepProps['goTo'] }) { return <div className="vw-card-description">{a?.ready ? <>Pick the site being emptied. <a onClick={() => goTo('requirements')}>Requirements</a></> : a?.reason ?? 'Loading…'}</div>; }

export function MigrationSpacePanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  if (a.mode === 'decommission') return (<div style={grid4}>
    <Stat label="Racks at the source" value={a.rows.filter(r => r.recordType === 'rack').length} sub="retired or handed back" />
    <Stat label="Load freed" value={fmtKw(a.kwLeaving)} sub="leaves the estate" />
    <Stat label="Target" value="None" sub="decommission: nothing moves" />
    <Stat label="Exit" value={a.exitDate.slice(0, 10)} sub="last wave plus plant decommission and handback" />
  </div>);
  const peer = p.ev!.ctx.peerSite;
  return (<>
    <div style={grid4}>
      <Stat label="Target" value={a.target?.code ?? 'Not chosen'} sub={a.target ? `${a.target.name}, ${a.distanceKm} km` : 'pick it in Requirements'} tone={a.target ? undefined : 'bad'} />
      <Stat label="Racks needed" value={a.racksMoving} sub={`${a.uMoving} U moving · ${peer ? peer.halls.reduce((s, h) => s + h.freePositions, 0) : '—'} free positions`} />
      <Stat label="kW moving" value={fmtKw(a.kwMoving)} sub={peer ? `${fmtKw(peer.headroomItKw)} headroom (${peer.binding?.label ?? 'site'})` : undefined} tone={peer && a.kwMoving > peer.headroomItKw ? 'bad' : 'ok'} />
      <Stat label="Cooling headroom" value={peer ? fmtKw(peer.cooling.headroomKw) : '—'} tone={peer && a.kwMoving > peer.cooling.headroomKw ? 'bad' : undefined} />
    </div>
    <SubTitle>Target fit per wave (cumulative)</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Wave</th><th style={{ textAlign: 'right' }}>kW so far</th><th style={{ textAlign: 'right' }}>Racks so far</th><th>Check</th></tr></thead>
      <tbody>{a.targetFit.map(t => <tr key={t.waveId}><td>{t.waveName}</td><td style={{ textAlign: 'right' }}>{t.cumKw} / {t.kwHeadroom}</td><td style={{ textAlign: 'right' }}>{t.cumRacks} / {t.positions}</td><td style={{ whiteSpace: 'normal' }}>{t.ok ? <VwChip variant="success">fits</VwChip> : t.issues.map(i => <div key={i} style={{ fontSize: 12, color: 'var(--vw-color-red-600)' }}>{i}</div>)}</td></tr>)}
        {!a.targetFit.length && <tr><td colSpan={4} style={muted}>Make the waves to check the target wave by wave.</td></tr>}</tbody>
    </table></div>
    <div style={{ fontSize: 12, ...muted, marginTop: 4 }}>Positions, kW and cooling come from the target site's baseline; capacity is reserved there when the plan is approved.</div>
  </>);
}

export function MigrationNetworkPanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  return (<>
    <SubTitle>Circuits</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Circuit</th><th>Provider</th><th style={{ textAlign: 'right' }}>A month</th><th>Contract end</th><th>Action</th><th>Cease date</th><th style={{ textAlign: 'right' }}>Early termination</th></tr></thead>
      <tbody>{a.circuits.map(c => <tr key={c.circuit.id}><td><b>{c.circuit.cid}</b></td><td>{byId(p.data, 'providers', c.circuit.providerId)?.name}</td><td style={{ textAlign: 'right' }}>{fmtUsd(c.monthlyUsd)}</td><td>{c.circuit.contractEnd?.slice(0, 10) ?? '—'}</td><td>{c.action}</td><td>{c.ceaseDate?.slice(0, 10) ?? '—'}</td><td style={{ textAlign: 'right', color: c.penaltyUsd ? 'var(--vw-color-amber-700)' : undefined }}>{c.penaltyUsd ? `${fmtUsd(c.penaltyUsd)} (${c.monthsLeft} mo)` : '—'}</td></tr>)}
        {!a.circuits.length && <tr><td colSpan={7} style={muted}>No circuits end at the site.</td></tr>}</tbody>
    </table></div>
    <SubTitle>Addresses released at {a.source.code}</SubTitle>
    <div style={{ fontSize: 12 }}>{a.ip.subnets.map(s => s.cidr).join(', ') || 'No subnets'} · VLANs {a.ip.vlans.map(v => v.vlanNumber).join(', ') || 'none'} · {a.ip.addresses} addresses. Subnets become Deprecated (state Available) and VLANs Unused when the last wave closes.</div>
    {a.mode === 'consolidation' && (<>
      <SubTitle>Prefixes at {a.target?.code ?? 'the target'}</SubTitle>
      <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Replaces</th><th>New prefix</th><th>Carved from</th></tr></thead>
        <tbody>{a.ip.target.map(t => <tr key={t.source}><td>{t.source}</td><td>{t.cidr ?? <span style={{ color: 'var(--vw-color-red-600)' }}>no room</span>}</td><td>{t.parent ?? '—'}</td></tr>)}{!a.ip.target.length && <tr><td colSpan={3} style={muted}>No prefixes needed.</td></tr>}</tbody></table></div>
      {a.ip.warnings.map(w => <div key={w} style={{ fontSize: 12, color: 'var(--vw-color-red-600)' }}>{w}</div>)}
    </>)}
  </>);
}

export function MigrationItPanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  const dev = a.rows.filter(r => r.recordType === 'device');
  const by = [...new Set(dev.map(r => r.disposition))];
  return (<>
    <div style={grid4}>{by.slice(0, 4).map(d => <Stat key={d} label={DISPOSITION_LABEL[d]} value={dev.filter(r => r.disposition === d).length} sub={`${fmtKw(dev.filter(r => r.disposition === d).reduce((s, r) => s + r.kw, 0))} drawn`} />)}</div>
    <SubTitle>How each service moves</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Service</th><th>Customer</th><th>Approach</th><th style={{ textAlign: 'right' }}>Downtime</th><th style={{ textAlign: 'right' }}>Revenue</th></tr></thead>
      <tbody>{a.services.map(s => <tr key={s.service.id}><td><b>{s.service.name}</b>{s.critical && <VwChip variant="error" style={{ fontSize: 11, marginLeft: 4 }}>critical</VwChip>}</td><td>{s.customer?.name}</td><td>{s.approach}</td><td style={{ textAlign: 'right', color: s.downtimeH > a.window ? 'var(--vw-color-red-600)' : undefined }}>{s.downtimeH} h</td><td style={{ textAlign: 'right' }}>{fmtUsd(s.service.revenueMonthly)}/mo</td></tr>)}
        {!a.services.length && <tr><td colSpan={5} style={muted}>No services at the site.</td></tr>}</tbody>
    </table></div>
  </>);
}

export function MigrationSecurityPanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  const data = a.rows.filter(r => r.recordType === 'device' && r.dataBearing);
  const certs = p.data.disposalCertificates.filter(c => c.plannerPlanId === p.draft.id);
  return (<>
    <div style={grid4}>
      <Stat label="Data-bearing devices" value={data.length} sub={`${data.filter(r => r.disposition === 'move').length} move, ${data.filter(r => r.disposition !== 'move').length} sanitised`} />
      <Stat label="Method" value="NIST 800-88" sub="purge, or destroy when a drive fails purge" />
      <Stat label="Certificates" value={`${certs.filter(c => c.status === 'Issued').length} of ${certs.length}`} sub="issued by the disposal vendor" />
      <Stat label="Plant to decommission" value={a.rows.filter(r => r.recordType === 'plant').length} sub={a.rows.filter(r => r.recordType === 'plant').map(r => r.label.split(' ')[0]).join(', ')} />
    </div>
    <div style={{ fontSize: 12, marginTop: 8 }}>Chain of custody: drives stay in the locked room until collected in sealed, numbered bags; serials are checked against the certificate list and signed by both sides at each wave. Equipment that moves travels sealed with an escort.</div>
  </>);
}

export function MigrationDeliveryPanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  const items = p.ev!.schedule;
  return (<>
    <SubTitle>Dates that gate the waves</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Step</th><th>Do by</th><th>Needed by</th><th>For</th><th /></tr></thead>
      <tbody>{items.map((s, i) => <tr key={i}><td>{s.item}{s.note && <span style={{ fontSize: 12, ...muted }}> · {s.note}</span>}</td><td>{s.orderBy.slice(0, 10)}</td><td>{s.needBy.slice(0, 10)}</td><td>{s.phase}</td><td><VwChip variant={s.late ? 'error' : 'success'}>{s.late ? 'late' : 'in time'}</VwChip></td></tr>)}
        {!items.length && <tr><td colSpan={5} style={muted}>Make the waves first.</td></tr>}</tbody>
    </table></div>
  </>);
}

export function MigrationWavesPanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  const ma = a;
  return (<>
    <WavesEditor {...p} family="migration" />
    <SubTitle>Customer consent</SubTitle>
    <ConsentRegister rows={ma.consents} onChange={rows => p.patch({ consents: rows.map(({ customerRef, customerName, serviceIds, noticeDays, notifiedAt, consentAt, status, accountManager, notes }) => ({ customerRef, customerName, serviceIds, noticeDays, notifiedAt, consentAt, status, accountManager, notes })) })} firstWave={c => ma.consents.find(x => x.customerRef === c.customerRef)?.firstWave} />
  </>);
}
