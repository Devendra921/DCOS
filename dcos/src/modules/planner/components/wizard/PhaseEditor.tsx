/* Phase table editor: name, go-live, kW and the per-phase design inputs (density, cooling) that make a phase its own design unit. Used by Phasing and by scenarios (phase overrides). */
import { Input, InputNumber, Select } from 'antd';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { DeleteOutlined } from '../../../../shared/icons';
import type * as T from '../../../../mock/data/types';
import type { Evaluation } from '../../lib/engine';
import { COOLING_LABEL, fromDateInput, toDateInput } from './wizardModel';

const COOLING: T.PlannerCoolingType[] = ['air-crah', 'air-economiser', 'chilled-water', 'in-row', 'rear-door', 'liquid-to-chip', 'immersion'];

/** Racks and halls of a phase from its own density and hall load (falling back to the plan's). */
function derived(ph: T.PlannerPhase, ev?: Evaluation): { racks: number; halls: number } {
  const d = Number(ph.params?.densityKwPerRack ?? ev?.params['densityKwPerRack']?.value ?? 12) || 12;
  const h = Number(ph.params?.hallDesignKw ?? ev?.params['hallDesignKw']?.value ?? 1500) || 1500;
  return { racks: ph.itKw > 0 ? Math.ceil(ph.itKw / d) : 0, halls: ph.itKw > 0 ? Math.max(1, Math.ceil(ph.itKw / h)) : 0 };
}

export function PhaseEditor({ phases, onChange, ev, showStatus, canRemove = true }: { phases: T.PlannerPhase[]; onChange: (phases: T.PlannerPhase[]) => void; ev?: Evaluation; showStatus?: boolean; canRemove?: boolean }) {
  const sorted = [...phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const planDensity = ev?.params['densityKwPerRack']?.value; const planCooling = ev?.params['coolingType']?.value as T.PlannerCoolingType | undefined;
  const update = (id: string, patch: Partial<T.PlannerPhase>) => onChange(phases.map(x => { if (x.id !== id) return x; const next = { ...x, ...patch }; return { ...next, ...derived(next, ev) }; }));
  const setParam = (ph: T.PlannerPhase, key: string, value: number | string | undefined) => {
    const params = { ...(ph.params ?? {}) };
    if (value === undefined || value === '') delete params[key]; else params[key] = value;
    update(ph.id, { params: Object.keys(params).length ? params : undefined });
  };
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Phase</th><th>Go-live</th><th style={{ textAlign: 'right' }}>IT kW</th><th style={{ textAlign: 'right' }}>Density</th><th>Cooling</th><th style={{ textAlign: 'right' }}>Racks</th><th style={{ textAlign: 'right' }}>Halls</th>{showStatus && <th>Status</th>}<th /></tr></thead>
      <tbody>
        {sorted.map(p => (
          <tr key={p.id}>
            <td><Input size="small" value={p.name} onChange={e => update(p.id, { name: e.target.value })} style={{ width: 180 }} /></td>
            <td><Input size="small" type="date" value={toDateInput(p.goLive)} onChange={e => update(p.id, { goLive: fromDateInput(e.target.value, p.goLive) })} style={{ width: 145 }} /></td>
            <td style={{ textAlign: 'right' }}><InputNumber size="small" min={0} step={100} value={p.itKw} onChange={v => typeof v === 'number' && update(p.id, { itKw: v })} style={{ width: 110 }} /></td>
            <td style={{ textAlign: 'right' }}><InputNumber size="small" min={1} max={200} placeholder={planDensity !== undefined ? `plan ${planDensity}` : 'as plan'} value={typeof p.params?.densityKwPerRack === 'number' ? p.params.densityKwPerRack : undefined} onChange={v => setParam(p, 'densityKwPerRack', typeof v === 'number' ? v : undefined)} addonAfter="kW" style={{ width: 130 }} /></td>
            <td><Select size="small" allowClear placeholder={planCooling ? `plan: ${COOLING_LABEL[planCooling] ?? planCooling}` : 'as plan'} value={typeof p.params?.coolingType === 'string' ? p.params.coolingType : undefined} options={COOLING.map(c => ({ value: c, label: COOLING_LABEL[c] }))} onChange={v => setParam(p, 'coolingType', v)} style={{ width: 190 }} /></td>
            <td style={{ textAlign: 'right' }}>{p.racks.toLocaleString('en-US')}</td><td style={{ textAlign: 'right' }}>{p.halls}</td>
            {showStatus && <td><Select size="small" value={p.status} style={{ width: 120 }} options={(['Planned', 'Approved', 'In delivery', 'Live'] as const).map(s => ({ value: s, label: s }))} onChange={v => update(p.id, { status: v })} /></td>}
            <td>{canRemove && <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove phase" onClick={() => onChange(phases.filter(x => x.id !== p.id))} />}</td>
          </tr>
        ))}
        {phases.length === 0 && <tr><td colSpan={showStatus ? 9 : 8} style={{ color: 'var(--vw-color-slate-500)' }}>No phases yet.</td></tr>}
      </tbody>
    </table></div>
  );
}
