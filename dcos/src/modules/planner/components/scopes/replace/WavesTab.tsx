/* Plan page tab "Waves and closure": close each wave once it is done (the records follow: old
   equipment out, new equipment active, services repointed, racks and holds updated, a disposal
   certificate), mark certificates issued, and see the closure checklist read live. Migrations
   also record the final meter reading and retire the site when everything else is green. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Checkbox, Input, InputNumber, Modal } from 'antd';
import { FileBadge, ListChecks, Waves } from 'lucide-react';
import { Chip, Panel } from '../../../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../../../ops/ui/Analytics';
import { VwButton as Button } from '../../../../../shared/components/vw/VwButton';
import type * as T from '../../../../../mock/data/types';
import { closeWave, issueCertificate, replaceCloseout, type RecordChanges } from '../../../lib/replaceClose';
import { closeMigrationWave, migrationCloseout, retireSite } from '../../../lib/migrationCore';
import { WAVE_STATUS_TONE } from '../../../lib/waves';
import { usePlannerActions } from '../../../lib/usePlanner';
import { ToneValue } from '../../detail/shared';
import type { PlanViewProps } from '../types';
import { extraRecords, fmtWhen, idFor, useApplyChanges } from './model';

const muted = { color: 'var(--vw-color-slate-500)' } as const;

export function WavesTab({ plan, data, family }: PlanViewProps & { family: 'replace' | 'migration' }) {
  const { message } = App.useApp();
  const apply = useApplyChanges(); const actions = usePlannerActions();
  const [closing, setClosing] = useState<T.PlannerWave | undefined>();
  const [form, setForm] = useState<{ downtime?: number; notes?: string; cert?: string; atp: boolean }>({ atp: false });
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [meter, setMeter] = useState<number | undefined>(typeof plan.params.finalMeterReadingKwh === 'number' ? plan.params.finalMeterReadingKwh : undefined);
  const [at] = useState(() => new Date().toISOString());
  const waves = [...(plan.waves ?? [])].sort((a, b) => a.order - b.order);
  const certs = data.disposalCertificates.filter(c => c.plannerPlanId === plan.id);
  const checks = family === 'replace' ? replaceCloseout(plan, data) : migrationCloseout(plan, data);
  const executing = plan.status === 'Executing';
  const preview: RecordChanges | undefined = useMemo(() => {
    if (!closing) return undefined;
    const input = { at, by: actions.actor, actualDowntimeMin: form.downtime, notes: form.notes, certificateRef: form.cert, atpAccepted: form.atp, idFor: (e: string, p: string) => `${p}-new`, extra: extraRecords() };
    return family === 'replace' ? closeWave(plan, closing.id, data, input) : closeMigrationWave(plan, closing.id, data, input);
  }, [closing, form, plan, data, family, actions.actor, at]);
  const confirm = () => {
    if (!closing) return;
    const input = { at: new Date().toISOString(), by: actions.actor, actualDowntimeMin: form.downtime, notes: form.notes, certificateRef: form.cert || undefined, atpAccepted: form.atp, idFor, extra: extraRecords() };
    const res = family === 'replace' ? closeWave(plan, closing.id, data, input) : closeMigrationWave(plan, closing.id, data, input);
    if (res.errors.length) { message.error(res.errors.join('; ')); return; }
    apply(plan, res); message.success(`${closing.name} closed: ${res.summary.join('; ')}`);
    for (const w of res.warnings) message.warning(w);
    setClosing(undefined); setForm({ atp: false });
  };
  const issue = (c: T.DisposalCertificate) => { const ref = refs[c.id]?.trim(); if (!ref) { message.error('Enter the vendor certificate reference'); return; } apply(plan, issueCertificate(c, ref, new Date().toISOString())); message.success(`Certificate ${c.certId} issued`); };
  const retire = family === 'migration' ? retireSite(plan, data, at) : undefined;
  const doRetire = () => { const res = retireSite(plan, data, new Date().toISOString()); if (res.errors.length) { message.error(res.errors.join('; ')); return; } apply(plan, res); message.success(res.summary.join('; ')); };

  return (
    <div className="col" style={{ gap: 16 }}>
      <StatGrid cols={4}>
        <StatTile label="Waves closed" value={`${waves.filter(w => w.status === 'Closed').length} of ${waves.filter(w => w.status !== 'Cancelled').length}`} />
        <StatTile label="Certificates issued" value={<ToneValue tone={certs.some(c => c.status !== 'Issued') ? 'warn' : undefined}>{`${certs.filter(c => c.status === 'Issued').length} of ${certs.length}`}</ToneValue>} />
        <StatTile label="Closure checks" value={<ToneValue tone={checks.every(c => c.ok) ? 'ok' : undefined}>{`${checks.filter(c => c.ok).length} of ${checks.length}`}</ToneValue>} sub={checks.every(c => c.ok) ? 'the plan can be completed' : 'the plan completes when all are green'} />
        <StatTile label="Plan" value={plan.status} sub={executing ? 'waves can be closed' : plan.status === 'Approved' ? 'execute the plan first' : undefined} />
      </StatGrid>
      <Panel flush icon={Waves} title="Waves" count={waves.length} foot={!executing ? <span style={{ fontSize: 12, ...muted }}>Waves are closed while the plan is executing.</span> : undefined}>
        <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
          <thead><tr><th>Wave</th><th>Window</th><th>Scope</th><th>Change</th><th>Test</th><th>Status</th><th>Closed</th><th /></tr></thead>
          <tbody>{waves.map(w => { const atp = w.atpId ? data.atps.find(x => x.id === w.atpId) : undefined; return (
            <tr key={w.id}>
              <td><span className="strong">{w.name}</span></td><td className="num">{fmtWhen(w.windowStart)}</td><td>{w.rackIds.length} racks, {w.deviceIds.length} devices{w.serviceIds.length ? `, ${w.serviceIds.length} services` : ''}</td>
              <td>{w.changeRequestId ? <Link to={`/changes/${w.changeRequestId}`}>{w.changeRequestId}</Link> : '—'}{w.maintenanceWindowId && <span style={muted}> · {w.maintenanceWindowId}</span>}</td>
              <td>{atp ? <Chip tone={atp.status === 'Accepted' ? 'success' : 'warning'} size="xs">{atp.id} {atp.status}</Chip> : '—'}</td>
              <td><Chip tone={WAVE_STATUS_TONE[w.status]} dot>{w.status}</Chip></td>
              <td>{w.closedAt ? `${w.closedAt.slice(0, 10)} by ${w.closedBy}${w.actualDowntimeMin !== undefined ? ` · ${w.actualDowntimeMin} min down` : ''}` : '—'}</td>
              <td>{w.status !== 'Closed' && w.status !== 'Cancelled' && <Button size="small" disabled={!executing} onClick={() => { setForm({ atp: false }); setClosing(w); }}>Close wave</Button>}</td>
            </tr>
          ); })}{!waves.length && <tr><td colSpan={8} style={muted}>No waves on this plan.</td></tr>}</tbody>
        </table></div></div>
      </Panel>
      <Panel flush icon={FileBadge} title="Disposal certificates" count={certs.length}>
        <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
          <thead><tr><th>Certificate</th><th>Wave</th><th>Method</th><th className="is-right">Items</th><th>Collected</th><th>Status</th><th>Reference</th></tr></thead>
          <tbody>{certs.map(c => <tr key={c.id}><td>{c.certId}</td><td>{waves.find(w => w.id === c.plannerWaveId)?.name ?? c.plannerWaveId}</td><td>{c.method}</td><td className="is-right num">{c.items.length}</td><td>{c.collectedAt?.slice(0, 10) ?? '—'}</td><td><Chip tone={c.status === 'Issued' ? 'success' : 'warning'} dot>{c.status}</Chip></td>
            <td>{c.status === 'Issued' ? c.reference : <span className="row" style={{ gap: 6 }}><Input size="small" placeholder="Vendor reference" value={refs[c.id]} onChange={e => setRefs({ ...refs, [c.id]: e.target.value })} style={{ width: 160 }} /><Button size="small" onClick={() => issue(c)}>Mark issued</Button></span>}</td></tr>)}
            {!certs.length && <tr><td colSpan={7} style={muted}>A certificate is created when a wave with disposal is closed.</td></tr>}</tbody>
        </table></div></div>
      </Panel>
      <Panel flush icon={ListChecks} title="Closure checklist" sub="Read live from the platform" count={`${checks.filter(c => c.ok).length}/${checks.length}`}
        foot={family === 'migration' ? (
          <div className="row wrap" style={{ gap: 8 }}>
            <span style={{ fontSize: 12 }}>Final meter reading</span>
            <InputNumber size="small" min={0} value={meter} onChange={v => setMeter(typeof v === 'number' ? v : undefined)} addonAfter="kWh" style={{ width: 180 }} />
            <Button size="small" disabled={meter === undefined || !executing} onClick={() => { actions.patchPlan(plan.id, { params: { ...plan.params, finalMeterReadingKwh: meter! } }); message.success('Final meter reading recorded'); }}>Record</Button>
            <span style={{ flex: 1 }} />
            <Button size="small" danger disabled={!executing || !!retire?.errors.length} onClick={() => Modal.confirm({ title: 'Retire the site?', content: 'The data centre and its racks are set to Retired. This is the last step of the plan.', okText: 'Retire site', onOk: doRetire })}>Retire site</Button>
            {!!retire?.errors.length && <span style={{ fontSize: 12, ...muted }}>Allowed when every other check is green.</span>}
          </div>
        ) : undefined}>
        <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table"><tbody>{checks.map(c => <tr key={c.key}><td style={{ width: 70 }}><Chip tone={c.ok ? 'success' : 'warning'} dot>{c.ok ? 'Done' : 'Open'}</Chip></td><td><span className="strong">{c.label}</span></td><td className="is-wrap"><span className="vw-label">{c.detail}</span></td></tr>)}</tbody></table></div></div>
      </Panel>
      <Modal open={!!closing} title={closing ? `Close ${closing.name}` : ''} okText="Close wave" onOk={confirm} onCancel={() => setClosing(undefined)} okButtonProps={{ disabled: !!preview?.errors.length }} width={640}>
        {closing && (<div className="vw-flex vw-flex-col vw-gap-sm">
          <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label style={{ fontSize: 12 }}>Actual downtime (minutes)<InputNumber min={0} value={form.downtime} onChange={v => setForm({ ...form, downtime: typeof v === 'number' ? v : undefined })} style={{ width: '100%' }} /></label>
            <label style={{ fontSize: 12 }}>Disposal certificate reference (if issued already)<Input value={form.cert} onChange={e => setForm({ ...form, cert: e.target.value })} placeholder="Leave empty when the vendor has not issued it" /></label>
          </div>
          <label style={{ fontSize: 12 }}>Notes<Input.TextArea autoSize={{ minRows: 2 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          {closing.atpId && <Checkbox checked={form.atp} onChange={e => setForm({ ...form, atp: e.target.checked })}>The acceptance test {closing.atpId} was witnessed and passed</Checkbox>}
          {preview && (<div style={{ fontSize: 12 }}>
            {preview.errors.map(e => <div key={e} style={{ color: 'var(--vw-color-red-600)' }}>{e}</div>)}
            {preview.summary.length > 0 && <div><b>What changes:</b> {preview.summary.join('; ')}.</div>}
            {preview.updates.length > 0 && <div style={muted}>{preview.updates.length} records updated, {preview.creates.length} created.</div>}
            {preview.tasks.length > 0 && <div><b>Also do:</b> {preview.tasks.join('; ')}.</div>}
          </div>)}
        </div>)}
      </Modal>
    </div>
  );
}
