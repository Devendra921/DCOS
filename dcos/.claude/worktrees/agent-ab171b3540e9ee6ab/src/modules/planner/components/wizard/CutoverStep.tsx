/* Migration scope — Cut-over waves: each wave is a phase (what moves, when, how much), plus the freed capacity at the source site. */
import { Input, InputNumber, Select } from 'antd';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { VwChip } from '../../../../shared/components/ux';
import { DeleteOutlined, PlusOutlined } from '../../../../shared/icons';
import type * as T from '../../../../mock/data/types';
import { fmtKw } from '../../lib/engine';
import { Stat } from '../kit';
import { fromDateInput, phaseDerived, toDateInput, type StepProps } from './wizardModel';
import { SubTitle } from './ParamField';

const WAVE_KINDS = ['Lift and shift', 'Re-platform', 'Replicate and swing', 'Decommission in place'];

export function CutoverPanel(props: StepProps) {
  const { draft, patch, ev, estate, setParam } = props;
  const source = estate.dataCenters.find(d => d.id === draft.dataCenterId);
  const racksAtSource = source ? estate.racks.filter(r => r.dataCenterId === source.id) : [];
  const drawn = racksAtSource.reduce((a, r) => a + r.currentPowerKw, 0);
  const total = draft.phases.reduce((a, p) => a + p.itKw, 0);
  const remainder = draft.designPowerKw - total;
  const sorted = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const kindOf = (p: T.PlannerPhase) => String(draft.params[`wave:${p.id}`] ?? WAVE_KINDS[0]);
  const update = (id: string, p: Partial<T.PlannerPhase>) => patch({ phases: draft.phases.map(x => (x.id === id ? { ...x, ...p, ...(p.itKw !== undefined ? phaseDerived(p.itKw, ev) : {}) } : x)) });
  const add = () => { const n = draft.phases.length + 1; const last = sorted[sorted.length - 1]; const goLive = last ? new Date(new Date(last.goLive).getTime() + 90 * 864e5).toISOString() : draft.targetGoLive; const itKw = Math.max(0, remainder); patch({ phases: [...draft.phases, { id: `W-${Date.now().toString(36)}`, name: `Wave ${n}`, goLive, itKw, ...phaseDerived(itKw, ev), status: 'Planned' }] }); };
  const remove = (id: string) => patch({ phases: draft.phases.filter(p => p.id !== id) });
  /** Replacement plans: one change window per group of racks, a week apart, starting after the longest lead time. */
  const replacing = ['server-refresh', 'network-refresh', 'rack-replace'].includes(draft.scope);
  const makeWaves = () => {
    const racks = Number(draft.params.affectedRacks ?? 0); const per = Math.max(1, Number(draft.params.racksPerWave ?? 4)); const n = Math.max(1, Math.ceil(racks / per));
    const lead = Math.max(2, ...(ev?.schedule.filter(x => x.kind === 'equipment').map(x => x.leadWeeks) ?? [2]));
    const start = Date.now() + lead * 7 * 864e5; let left = draft.designPowerKw;
    const phases = Array.from({ length: n }, (_, i) => { const kw = i === n - 1 ? left : Math.round(draft.designPowerKw / n); left -= kw; return { id: `W-${i + 1}`, name: `Wave ${i + 1} · racks ${i * per + 1}–${Math.min(racks, (i + 1) * per)}`, goLive: new Date(start + i * 7 * 864e5).toISOString(), itKw: kw, ...phaseDerived(kw, ev), status: 'Planned' as const }; });
    patch({ phases, targetGoLive: phases[phases.length - 1].goLive });
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
        <Stat label="Source site" value={source?.name ?? 'Not selected'} sub={source ? `${racksAtSource.length} racks, ${fmtKw(drawn)} drawn` : 'Pick the source site in Requirements'} />
        <Stat label="Load to move" value={fmtKw(draft.designPowerKw)} sub={source && drawn ? `${Math.round((draft.designPowerKw / drawn) * 100)}% of what is drawn today` : undefined} />
        <Stat label="Phased in waves" value={fmtKw(total)} tone={remainder === 0 ? 'ok' : 'warn'} sub={remainder === 0 ? 'All load assigned to a wave' : remainder > 0 ? `${fmtKw(remainder)} unassigned` : `${fmtKw(-remainder)} over`} />
        <Stat label="Freed at source" value={source ? fmtKw(Math.min(drawn, total)) : '—'} sub={source ? `${fmtKw(Math.max(0, source.designPowerKw - drawn + Math.min(drawn, total)))} free after the last wave` : undefined} />
      </div>
      <SubTitle extra={<span style={{ display: 'inline-flex', gap: 6 }}>{replacing && <Button size="small" onClick={makeWaves}>Make waves from the selection</Button>}<Button size="small" icon={<PlusOutlined />} onClick={add}>Add wave</Button></span>}>Waves</SubTitle>
      <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
        <thead><tr><th>Wave</th><th>Approach</th><th>Cut-over window</th><th style={{ textAlign: 'right' }}>IT kW moved</th><th style={{ textAlign: 'right' }}>Racks</th><th>Status</th><th /></tr></thead>
        <tbody>
          {sorted.map(p => (
            <tr key={p.id}>
              <td><Input size="small" value={p.name} onChange={e => update(p.id, { name: e.target.value })} style={{ width: 180 }} /></td>
              <td><Select size="small" value={kindOf(p)} style={{ width: 180 }} options={WAVE_KINDS.map(k => ({ value: k, label: k }))} onChange={v => setParam(`wave:${p.id}`, v, 'user')} /></td>
              <td><Input size="small" type="date" value={toDateInput(p.goLive)} onChange={e => update(p.id, { goLive: fromDateInput(e.target.value, p.goLive) })} style={{ width: 150 }} /></td>
              <td style={{ textAlign: 'right' }}><InputNumber size="small" min={0} step={10} value={p.itKw} onChange={v => typeof v === 'number' && update(p.id, { itKw: v })} style={{ width: 120 }} /></td>
              <td style={{ textAlign: 'right' }}>{p.racks.toLocaleString('en-US')}</td>
              <td><Select size="small" value={p.status} style={{ width: 120 }} options={(['Planned', 'Approved', 'In delivery', 'Live'] as const).map(s => ({ value: s, label: s }))} onChange={v => update(p.id, { status: v })} /></td>
              <td><Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove wave" onClick={() => remove(p.id)} /></td>
            </tr>
          ))}
          {draft.phases.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--vw-color-slate-500)' }}>No waves yet. Add the first wave to start the cut-over plan.</td></tr>}
        </tbody>
      </table></div>
      <SubTitle>Rules of the road</SubTitle>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['Rehearsed cut-over per wave', 'Rollback tested before the window', 'Change freeze during the window', 'Source racks powered down only after validation', 'Data disposal certified before release'].map(r => <VwChip key={r} variant="neutral">{r}</VwChip>)}</div>
    </div>
  );
}
