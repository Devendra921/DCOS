/* Step 9 — Scenarios: what-if variants of the draft on a small set of parameters, each evaluated by the engine and compared side by side. */
import { useMemo, useState } from 'react';
import { Input, InputNumber, Select } from 'antd';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { VwCard, VwChip, VwSegmented } from '../../../../shared/components/ux';
import { DeleteOutlined, PlusOutlined, StarFilled, StarOutlined } from '../../../../shared/icons';
import type * as T from '../../../../mock/data/types';
import { evaluate, fmtKw, fmtUsd, type ParamValue } from '../../lib/engine';
import { useScenarios } from '../../lib/usePlanner';
import { ScenarioCompareChart } from '../charts';
import { COOLING_LABEL, paramDefsFor, type StepProps } from './wizardModel';
import { Field, StepTitle, SubTitle } from './ParamField';

const OVERRIDE_KEYS = ['tier', 'redundancy', 'coolingType', 'densityKwPerRack', 'hallDesignKw', 'pueTarget', 'capexPerKw', 'revenuePerKwMonth'];
type Metric = 'capex' | 'opex' | 'pue' | 'payback' | 'racks';

export function ScenariosStep({ draft, patch, ev, templates, benchmarks, actuals, actions, persist, saved }: StepProps) {
  const scenarios = useScenarios(draft.id);
  const defs = useMemo(() => paramDefsFor(ev, templates, draft.dcTypeKey), [ev, templates, draft.dcTypeKey]);
  const [metric, setMetric] = useState<Metric>('capex');
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string; overrides: Record<string, ParamValue> } | null>(null);
  const items = useMemo(() => (templates.length ? scenarios.map(s => ({ scenario: s, ev: evaluate(draft, s, templates, benchmarks, actuals) })) : []), [scenarios, draft, templates, benchmarks, actuals]);
  const baseItem = useMemo(() => (ev ? { scenario: { id: 'base', scnId: 'base', planId: draft.id, name: 'Base case', description: 'The draft as entered', overrides: {}, preferred: !draft.preferredScenarioId } as T.PlannerScenario, ev } : null), [ev, draft.id, draft.preferredScenarioId]);
  const all = baseItem ? [baseItem, ...items] : items;
  const startNew = () => { setEditing({ name: `Scenario ${String.fromCharCode(65 + scenarios.length)}`, description: '', overrides: {} }); };
  const save = () => {
    if (!editing) return;
    if (!saved) persist();
    if (editing.id) actions.updateScenario(editing.id, { name: editing.name, description: editing.description, overrides: editing.overrides });
    else actions.createScenario(draft.id, editing.name, editing.description, editing.overrides);
    setEditing(null);
  };
  const prefer = (id?: string) => { if (!saved) persist(); actions.preferScenario(draft, id); patch({ preferredScenarioId: id }); };
  const setOverride = (k: string, v: ParamValue | undefined) => editing && setEditing({ ...editing, overrides: v === undefined ? Object.fromEntries(Object.entries(editing.overrides).filter(([x]) => x !== k)) : { ...editing.overrides, [k]: v } });
  const fmtVal = (k: string, v: ParamValue) => (k === 'coolingType' ? COOLING_LABEL[v as T.PlannerCoolingType] ?? String(v) : typeof v === 'number' ? v.toLocaleString('en-US') : String(v));

  return (
    <div>
      <StepTitle title="Scenarios" description="Vary tier, redundancy, cooling, density, hall size, PUE, CapEx rate or revenue and see the full evaluation for each. Pick the one the plan goes forward with." extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={startNew}>New scenario</Button>} />
      {!saved && <div className="vw-card-description" style={{ marginBottom: 8 }}>The plan is saved as a draft the first time you create a scenario.</div>}

      {editing && (
        <VwCard variant="child-shaded" style={{ marginBottom: 12 }} title={editing.id ? 'Edit scenario' : 'New scenario'} extra={<span style={{ display: 'inline-flex', gap: 6 }}><Button size="small" type="primary" onClick={save} disabled={!editing.name.trim()}>Save scenario</Button><Button size="small" onClick={() => setEditing(null)}>Cancel</Button></span>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 10 }}>
            <Field label="Name"><Input size="small" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Description"><Input size="small" value={editing.description} placeholder="What this variant tests" onChange={e => setEditing({ ...editing, description: e.target.value })} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            {OVERRIDE_KEYS.map(k => { const d = defs.get(k); if (!d) return null; const cur = editing.overrides[k]; const base = ev?.params[k]?.value; return (
              <Field key={k} label={<span>{d.label} <span style={{ fontWeight: 400, color: 'var(--vw-color-slate-500)' }}>base {base === undefined ? '—' : fmtVal(k, base)}</span></span>}>
                {d.type === 'select' ? <Select size="small" allowClear placeholder="as base" value={cur === undefined ? undefined : String(cur)} options={(d.options ?? []).map(o => ({ value: o, label: fmtVal(k, o) }))} onChange={v => setOverride(k, v)} />
                  : <InputNumber size="small" style={{ width: '100%' }} placeholder="as base" min={d.min} max={d.max} step={d.max !== undefined && d.max <= 3 ? 0.01 : 1} addonAfter={d.unit} value={typeof cur === 'number' ? cur : undefined} onChange={v => setOverride(k, typeof v === 'number' ? v : undefined)} />}
              </Field>); })}
          </div>
        </VwCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', gap: 12 }}>
        <div>
          <SubTitle extra={<VwSegmented size="small" value={metric} onChange={setMetric} options={[{ value: 'capex', label: 'CapEx' }, { value: 'opex', label: 'OpEx' }, { value: 'pue', label: 'PUE' }, { value: 'payback', label: 'Payback' }, { value: 'racks', label: 'Racks' }]} />}>Compare</SubTitle>
          <ScenarioCompareChart items={all} metric={metric} height={220} />
        </div>
        <div style={{ minWidth: 0 }}>
          <SubTitle>Side by side</SubTitle>
          <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
            <thead><tr><th>Scenario</th><th style={{ textAlign: 'right' }}>IT</th><th style={{ textAlign: 'right' }}>Racks</th><th style={{ textAlign: 'right' }}>CapEx</th><th style={{ textAlign: 'right' }}>$/kW</th><th style={{ textAlign: 'right' }}>OpEx/mo</th><th style={{ textAlign: 'right' }}>PUE</th><th style={{ textAlign: 'right' }}>Payback</th><th style={{ textAlign: 'right' }}>Fails</th><th /></tr></thead>
            <tbody>
              {all.map(({ scenario: s, ev: e }) => { const isBase = s.id === 'base'; const preferred = isBase ? !draft.preferredScenarioId : draft.preferredScenarioId === s.id; return (
                <tr key={s.id} className={preferred ? 'is-selected' : undefined}>
                  <td style={{ whiteSpace: 'normal' }}><div style={{ fontWeight: 500 }}>{s.name} {preferred && <VwChip variant="success" style={{ fontSize: 10 }}>Preferred</VwChip>}</div><div style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>{Object.entries(s.overrides).map(([k, v]) => `${defs.get(k)?.label ?? k} ${fmtVal(k, v)}`).join(' · ') || s.description}</div></td>
                  <td style={{ textAlign: 'right' }}>{fmtKw(e.sizing.itKw)}</td><td style={{ textAlign: 'right' }}>{e.sizing.racks.toLocaleString('en-US')}</td><td style={{ textAlign: 'right' }}>{fmtUsd(e.estimate.capexTotal)}</td><td style={{ textAlign: 'right' }}>{fmtUsd(e.estimate.capexPerKw)}</td><td style={{ textAlign: 'right' }}>{fmtUsd(e.estimate.opexMonthly)}</td><td style={{ textAlign: 'right' }}>{e.sizing.pue.value}</td><td style={{ textAlign: 'right' }}>{e.estimate.paybackMonths ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}><VwChip variant={e.hardFails ? 'error' : 'success'}>{e.hardFails}</VwChip></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Button size="small" type="text" icon={preferred ? <StarFilled /> : <StarOutlined />} aria-label="Prefer" onClick={() => prefer(isBase ? undefined : s.id)} />
                    {!isBase && <Button size="small" type="text" onClick={() => setEditing({ id: s.id, name: s.name, description: s.description, overrides: { ...s.overrides } })}>Edit</Button>}
                    {!isBase && <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Delete scenario" onClick={() => { if (draft.preferredScenarioId === s.id) prefer(undefined); actions.deleteScenario(s.id); }} />}
                  </td>
                </tr>); })}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
