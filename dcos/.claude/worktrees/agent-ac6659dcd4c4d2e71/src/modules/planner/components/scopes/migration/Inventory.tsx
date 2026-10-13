/* Requirements block for migrations: decommission or consolidation, and the source site's whole
   inventory with what happens to each item. kW and racks are derived from it, never typed. */
import { useState } from 'react';
import { Select } from 'antd';
import { VwChip, VwSegmented } from '../../../../../shared/components/ux';
import { VwButton as Button } from '../../../../../shared/components/vw/VwButton';
import type * as T from '../../../../../mock/data/types';
import { fmtKw } from '../../../lib/engine';
import { APPROACHES, APPROACH_TEXT, DISPOSITION_LABEL, MODE_LABEL, migrationOf, modeOf, toDispositions, type InvRow, type MigrationMode, type RecordType } from '../../../lib/migrationCore';
import { Stat } from '../../kit';
import type { StepProps } from '../../wizard/wizardModel';
import { SubTitle } from '../../wizard/ParamField';

const TYPES: { t: RecordType; label: string }[] = [{ t: 'device', label: 'Devices' }, { t: 'rack', label: 'Racks' }, { t: 'service', label: 'Services' }, { t: 'circuit', label: 'Circuits' }, { t: 'subnet', label: 'Subnets' }, { t: 'vlan', label: 'VLANs' }, { t: 'contract', label: 'Site contracts' }, { t: 'plant', label: 'Plant' }];
const muted = { color: 'var(--vw-color-slate-500)' } as const;

export function MigrationInventory({ draft, ev, patch }: StepProps) {
  const [type, setType] = useState<RecordType>('device');
  const a = ev ? migrationOf(ev) : undefined;
  if (!draft.dataCenterId) return null;
  if (!a?.ready) return <div style={{ fontSize: 12, ...muted }}>{a?.reason ?? 'Loading the site inventory…'}</div>;
  const mode = modeOf(draft);
  const confirmed = (draft.dispositions ?? []).length > 0;
  const saveRows = (rows: InvRow[]) => { const u = rows.filter(r => r.recordType === 'device' && r.disposition === 'move').reduce((s, r) => s + r.u, 0); patch({ dispositions: toDispositions(rows), designPowerKw: Math.round(a.kwLeaving), params: { ...draft.params, racksToMove: u ? Math.ceil(u / 34) : 0, migrationMode: mode } }); };
  const setMode = (m: MigrationMode) => patch({ params: { ...draft.params, migrationMode: m }, peerDataCenterId: m === 'decommission' ? undefined : draft.peerDataCenterId, dispositions: [], waves: (draft.waves ?? []).filter(w => w.status !== 'Planned'), phases: [] });
  const setRow = (r: InvRow, d: T.PlannerDisposition) => saveRows(a.rows.map(x => (x.key === r.key ? { ...x, disposition: d } : x)));
  const setApproach = (svc: string, v: string) => patch({ params: { ...draft.params, [`approach:${svc}`]: v } });
  const rows = a.rows.filter(r => r.recordType === type);
  const missingPermits = a.permits.filter(p => !p.onPlan);
  const addPermits = () => { const target = new Date(a.exitDate).getTime(); patch({ permits: [...draft.permits, ...missingPermits.map((p, i) => ({ id: `PM-M${draft.permits.length + i + 1}`, name: p.name, authority: p.authority, leadWeeks: p.leadWeeks, neededBefore: new Date(target - 14 * 864e5).toISOString(), status: 'Not started' as const }))] }); };
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <SubTitle>What happens to the site</SubTitle>
      <VwSegmented<MigrationMode> value={mode} onChange={setMode} options={[{ value: 'decommission', label: MODE_LABEL.decommission }, { value: 'consolidation', label: MODE_LABEL.consolidation }]} />
      <div style={{ fontSize: 12, ...muted }}>{mode === 'decommission' ? 'Everything at the site is retired, disposed of or handed back; services end here or are moved by their owners.' : `Live equipment and services move to ${a.target ? `${a.target.name} (${a.distanceKm} km)` : 'the target site picked above'}; the source site is then retired.`}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        <Stat label="Load leaving" value={fmtKw(a.kwLeaving)} sub="measured on the live devices" />
        <Stat label="Load moving" value={fmtKw(a.kwMoving)} sub={mode === 'consolidation' ? `about ${a.racksMoving} racks (${a.uMoving} U)` : 'nothing moves'} />
        <Stat label="Items at the site" value={a.rows.length} sub={TYPES.map(x => `${a.rows.filter(r => r.recordType === x.t).length} ${x.label.toLowerCase()}`).filter(s => !s.startsWith('0')).join(', ')} />
        <Stat label="Dispositions" value={confirmed ? 'Confirmed' : 'Proposed'} tone={confirmed ? 'ok' : 'warn'} sub={confirmed ? `${(draft.dispositions ?? []).length} saved` : 'confirm them below'} />
      </div>
      <SubTitle extra={<span className="vw-inline-flex vw-gap-xs">{!confirmed && <Button size="small" onClick={() => saveRows(a.rows)}>Confirm the inventory</Button>}{missingPermits.length > 0 && <Button size="small" onClick={addPermits}>Add {missingPermits.length} compliance step{missingPermits.length === 1 ? '' : 's'} to the permits</Button>}</span>}>Inventory</SubTitle>
      <VwSegmented<RecordType> size="small" value={type} onChange={setType} options={TYPES.filter(x => a.rows.some(r => r.recordType === x.t)).map(x => ({ value: x.t, label: `${x.label} ${a.rows.filter(r => r.recordType === x.t).length}` }))} />
      <div className="nst-table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}><table className="nst-table" style={{ width: '100%' }}>
        <thead><tr><th>Item</th><th>Detail</th>{type === 'device' && <th style={{ textAlign: 'right' }}>Draw</th>}<th>What happens</th>{type === 'service' && <th>How it moves</th>}{type === 'service' && <th style={{ textAlign: 'right' }}>Down</th>}</tr></thead>
        <tbody>{rows.map(r => { const sp = a.services.find(s => s.service.id === r.recordId); return (
          <tr key={r.key}>
            <td><b>{r.label}</b>{r.critical && <VwChip variant="error" style={{ fontSize: 10, marginLeft: 4 }}>critical</VwChip>}{r.dataBearing && <VwChip variant="neutral" style={{ fontSize: 10, marginLeft: 4 }}>data</VwChip>}</td>
            <td style={{ fontSize: 12 }}>{r.detail}</td>
            {type === 'device' && <td style={{ textAlign: 'right' }}>{r.kw ? `${Math.round(r.kw * 1000)} W` : '—'}</td>}
            <td><Select size="small" value={r.disposition} style={{ width: 190 }} options={r.allowed.filter(d => mode === 'consolidation' || (d !== 'move' && d !== 're-terminate')).map(d => ({ value: d, label: DISPOSITION_LABEL[d] }))} onChange={v => setRow(r, v)} />{!r.fromPlan && <span style={{ fontSize: 11, ...muted, marginLeft: 4 }}>proposed</span>}</td>
            {type === 'service' && <td>{sp && <Select size="small" value={sp.approach} style={{ width: 190 }} disabled={r.disposition === 'retire'} options={APPROACHES.filter(x => x !== 'Retire').map(x => ({ value: x, label: x, title: APPROACH_TEXT[x] }))} onChange={v => setApproach(r.recordId, v)} />}</td>}
            {type === 'service' && <td style={{ textAlign: 'right', color: sp && sp.downtimeH > a.window ? 'var(--vw-color-red-600)' : undefined }}>{sp ? `${sp.downtimeH} h` : '—'}</td>}
          </tr>
        ); })}</tbody>
      </table></div>
      {type === 'service' && <div style={{ fontSize: 12, ...muted }}>Downtime per approach from migration runbook actuals; lift and shift adds travel at 60 km/h. The cut-over window is {a.window} h.</div>}
    </div>
  );
}
