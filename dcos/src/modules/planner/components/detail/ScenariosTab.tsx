/* Scenarios tab: what-if studio — compare every scenario against the base case, prefer one, create, edit, delete. */
import { useMemo, useState } from 'react';
import { App, Drawer, Form, Input, InputNumber, Popconfirm, Select } from 'antd';
import { ChartColumn, Pencil, Plus, Star, Table2, Trash2 } from 'lucide-react';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { PlusOutlined } from '../../../../shared/icons';
import { Btn, Chip, Panel, Seg } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { ScenarioCompareChart } from '../charts';
import { fmtUsd, fmtKw, type Evaluation } from '../../lib/engine';
import type * as T from '../../../../mock/data/types';
import { COOLING_TYPES, Muted, REDUNDANCY, TIERS, n0, type PlanView } from './shared';
import { PhaseEditor } from '../wizard/PhaseEditor';

type Metric = NonNullable<Parameters<typeof ScenarioCompareChart>[0]['metric']>;
type OverrideValue = number | string | boolean;
interface FormValues { name: string; description: string; tier?: string | null; redundancy?: string | null; coolingType?: string | null; densityKwPerRack?: number | null; hallDesignKw?: number | null; pueTarget?: number | null; capexPerKw?: number | null; revenuePerKwMonth?: number | null; contingencyPct?: number | null }
const OVERRIDE_KEYS: (keyof Omit<FormValues, 'name' | 'description'>)[] = ['tier', 'redundancy', 'coolingType', 'densityKwPerRack', 'hallDesignKw', 'pueTarget', 'capexPerKw', 'revenuePerKwMonth', 'contingencyPct'];
const OVERRIDE_LABEL: Record<string, string> = { tier: 'Tier', redundancy: 'Redundancy', coolingType: 'Cooling', densityKwPerRack: 'Density', hallDesignKw: 'Hall load', pueTarget: 'PUE', capexPerKw: 'CapEx/kW', revenuePerKwMonth: 'Revenue', contingencyPct: 'Contingency' };

interface Row { id: string; key: string; name: string; scenario: T.PlannerScenario | null; ev: Evaluation; preferred: boolean }

export function ScenariosTab({ v }: { v: PlanView }) {
  const { plan, base, scenarios, actions, ev: shown } = v;
  const { message } = App.useApp();
  const [metric, setMetric] = useState<Metric>('capex');
  const [editing, setEditing] = useState<T.PlannerScenario | 'new' | null>(null);
  const [phases, setPhases] = useState<T.PlannerPhase[] | null>(null);
  const [form] = Form.useForm<FormValues>();

  const rows: Row[] = useMemo(() => [
    { id: 'base', key: 'base', name: 'Base case', scenario: null, ev: base, preferred: !plan.preferredScenarioId },
    ...scenarios.map(s => ({ id: s.scenario.id, key: s.scenario.id, name: s.scenario.name, scenario: s.scenario, ev: s.ev, preferred: s.scenario.id === plan.preferredScenarioId })),
  ], [base, scenarios, plan.preferredScenarioId]);

  const delta = (a: number, b: number) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : 0);
  const num = (val: number, baseVal: number, fmt: (x: number) => string, lowerBetter = true) => {
    const d = delta(val, baseVal);
    const tone = d === 0 ? 'var(--vw-color-slate-500)' : (d < 0) === lowerBetter ? 'var(--vw-color-green-600)' : 'var(--vw-color-red-600)';
    return <span className="num">{fmt(val)} {d !== 0 && <span style={{ fontSize: 'var(--vw-font-label-xs)', color: tone }}>{d > 0 ? '+' : ''}{d}%</span>}</span>;
  };
  const cols: Col<Row>[] = useMemo(() => [
    { key: 'name', header: 'Scenario', wrap: true, render: r => (
      <div style={{ minWidth: 220 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><span className="vw-card-activity-label">{r.name}</span>{r.preferred && <Chip tone="success" dot>Preferred</Chip>}{r.ev === shown && <Chip tone="info">Showing</Chip>}</div>
        {r.scenario && <Muted size="xs">{r.scenario.description}</Muted>}
        {r.scenario && Object.keys(r.scenario.overrides).length > 0 && <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4 }}>{Object.entries(r.scenario.overrides).map(([k, val]) => <Chip key={k} tone="neutral" size="xs">{OVERRIDE_LABEL[k] ?? k} {String(val)}</Chip>)}</div>}
      </div>) },
    { key: 'it', header: 'IT', align: 'right', render: r => <span className="num">{fmtKw(r.ev.sizing.itKw)}</span> },
    { key: 'racks', header: 'Racks', align: 'right', render: r => num(r.ev.sizing.racks, base.sizing.racks, n0) },
    { key: 'halls', header: 'Halls', align: 'right', render: r => <span className="num">{r.ev.sizing.halls}</span> },
    { key: 'capex', header: 'CapEx', align: 'right', render: r => num(r.ev.estimate.capexTotal, base.estimate.capexTotal, fmtUsd) },
    { key: 'cpk', header: 'CapEx/kW', align: 'right', render: r => num(r.ev.estimate.capexPerKw, base.estimate.capexPerKw, fmtUsd) },
    { key: 'opex', header: 'OpEx/mo', align: 'right', render: r => num(r.ev.estimate.opexMonthly, base.estimate.opexMonthly, fmtUsd) },
    { key: 'pue', header: 'PUE', align: 'right', render: r => num(r.ev.sizing.pue.value, base.sizing.pue.value, x => String(x)) },
    { key: 'pb', header: 'Payback', align: 'right', render: r => <span className="num">{r.ev.estimate.paybackMonths == null ? '—' : `${r.ev.estimate.paybackMonths} mo`}</span> },
    { key: 'npv', header: 'NPV', align: 'right', render: r => (r.ev.estimate.npvUsd === undefined ? '—' : num(r.ev.estimate.npvUsd, base.estimate.npvUsd ?? 0, fmtUsd, false)) },
    { key: 'irr', header: 'IRR', align: 'right', render: r => <span className="num">{r.ev.estimate.irrPct == null ? '—' : `${r.ev.estimate.irrPct}%`}</span> },
    { key: 'ph', header: 'Phases', align: 'right', render: r => r.scenario?.phaseOverrides?.length ? <Chip tone="info">{r.scenario.phaseOverrides.length} own</Chip> : <span className="num">{plan.phases.length}</span> },
    { key: 'rules', header: 'Rules', render: r => <span className="row" style={{ gap: 4 }}><Chip tone={r.ev.hardFails ? 'error' : 'success'}>{r.ev.hardFails} fail</Chip><Chip tone={r.ev.softWarns ? 'warning' : 'neutral'}>{r.ev.softWarns} warn</Chip></span> },
    { key: 'ready', header: 'Readiness', align: 'right', render: r => <span className="num">{r.ev.readinessPct}%</span> },
    { key: 'actions', header: '', render: r => (
      <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
        {!r.preferred && <Btn size="xs" icon={Star} onClick={() => { actions.preferScenario(plan, r.scenario?.id); message.success(`${r.name} is now the preferred scenario`); }}>Prefer</Btn>}
        {r.scenario && <Btn variant="ghost" size="xs" icon={Pencil} onClick={() => openEdit(r.scenario!)} title="Edit scenario" />}
        {r.scenario && <Popconfirm title={`Delete ${r.name}?`} onConfirm={() => { actions.deleteScenario(r.scenario!.id); if (r.preferred) actions.preferScenario(plan, undefined); message.info('Scenario deleted'); }}><span><Btn variant="ghost" size="xs" icon={Trash2} title="Delete scenario" /></span></Popconfirm>}
      </span>) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [base, shown, plan, actions]);

  const openEdit = (s: T.PlannerScenario | 'new') => {
    setEditing(s);
    setPhases(s === 'new' ? null : s.phaseOverrides?.map(p => ({ ...p })) ?? null);
    if (s === 'new') form.setFieldsValue({ name: `Scenario ${String.fromCharCode(65 + scenarios.length)}`, description: '', ...Object.fromEntries(OVERRIDE_KEYS.map(k => [k, null])) });
    else form.setFieldsValue({ name: s.name, description: s.description, ...Object.fromEntries(OVERRIDE_KEYS.map(k => [k, (s.overrides[k] as OverrideValue | undefined) ?? null])) });
  };
  const save = async () => {
    const vals = await form.validateFields();
    const overrides: Record<string, OverrideValue> = {};
    for (const k of OVERRIDE_KEYS) { const x = vals[k]; if (x !== null && x !== undefined && x !== '') overrides[k] = x; }
    const phaseOverrides = phases?.length ? phases : undefined;
    if (editing === 'new') { const rec = actions.createScenario(plan.id, vals.name, vals.description ?? '', overrides); if (phaseOverrides) actions.updateScenario(rec.id, { phaseOverrides }); message.success(`Scenario ${vals.name} created`); }
    else if (editing) { actions.updateScenario(editing.id, { name: vals.name, description: vals.description ?? '', overrides, phaseOverrides }); message.success('Scenario updated'); }
    setEditing(null);
  };
  const baseVal = (k: string) => { const p = base.params[k]; return p ? String(p.value) : '—'; };

  return (
    <div className="col" style={{ gap: 16 }}>
      <Panel icon={ChartColumn} title="Compare" count={scenarios.length} actions={<><Seg<Metric> size="sm" value={metric} onChange={setMetric} options={[{ id: 'capex', label: 'CapEx' }, { id: 'opex', label: 'OpEx' }, { id: 'pue', label: 'PUE' }, { id: 'payback', label: 'Payback' }, { id: 'racks', label: 'Racks' }]} /><Btn variant="filled" size="xs" icon={Plus} onClick={() => openEdit('new')}>New scenario</Btn></>}>
        {scenarios.length ? <ScenarioCompareChart items={scenarios} metric={metric} height={260} /> : <Muted>No scenarios yet. Create one to compare tier, cooling, density or cost assumptions against the base case.</Muted>}
      </Panel>
      <Panel flush icon={Table2} title="All metrics" sub="deltas against the base case" count={rows.length}>
        <DataTable rows={rows} cols={cols} pageSize={200} />
      </Panel>

      <Drawer title={editing === 'new' ? 'New scenario' : `Edit ${editing?.name ?? ''}`} open={editing !== null} onClose={() => setEditing(null)} width={phases ? 980 : 440} destroyOnHidden
        footer={<div className="vw-flex vw-justify-end vw-gap-sm"><Button onClick={() => setEditing(null)}>Cancel</Button><Button type="primary" onClick={save}>{editing === 'new' ? 'Create' : 'Save'}</Button></div>}>
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Give the scenario a name' }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <div className="vw-card-title-sm" style={{ margin: '8px 0' }}>Overrides <Muted size="xs">leave empty to inherit the plan value</Muted></div>
          <Form.Item name="tier" label={`Tier (plan: ${baseVal('tier')})`}><Select allowClear options={TIERS.map(t => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="redundancy" label={`Power redundancy (plan: ${baseVal('redundancy')})`}><Select allowClear options={REDUNDANCY.map(t => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="coolingType" label={`Cooling type (plan: ${baseVal('coolingType')})`}><Select allowClear options={COOLING_TYPES.map(t => ({ value: t, label: t }))} /></Form.Item>
          <div className="vw-grid vw-grid-cols-2 vw-gap-sm">
            <Form.Item name="densityKwPerRack" label={`Density kW/rack (${baseVal('densityKwPerRack')})`}><InputNumber min={1} max={200} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="hallDesignKw" label={`Hall load kW (${baseVal('hallDesignKw')})`}><InputNumber min={50} max={10000} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="pueTarget" label={`PUE target (${baseVal('pueTarget')})`}><InputNumber min={1.02} max={2.5} step={0.01} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="capexPerKw" label={`CapEx USD/kW (${baseVal('capexPerKw')})`}><InputNumber min={200} max={12000} step={100} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="revenuePerKwMonth" label={`Revenue USD/kW-mo (${baseVal('revenuePerKwMonth')})`}><InputNumber min={0} max={800} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="contingencyPct" label={`Contingency % (${baseVal('contingencyPct')})`}><InputNumber min={0} max={60} style={{ width: '100%' }} /></Form.Item>
          </div>
        </Form>
        <div className="vw-flex vw-items-center vw-justify-between" style={{ margin: '8px 0' }}>
          <span className="vw-card-title-sm">Phases <Muted size="xs">{phases ? 'this scenario has its own phases' : `uses the plan's ${plan.phases.length} phase(s)`}</Muted></span>
          {phases ? <span className="vw-flex vw-gap-xs"><Button size="small" icon={<PlusOutlined />} onClick={() => { const last = [...phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).pop(); setPhases([...phases, { id: `PH-S${phases.length + 1}-${plan.phases.length}`, name: `Phase ${phases.length + 1}`, goLive: last ? new Date(new Date(last.goLive).getTime() + 365 * 864e5).toISOString() : plan.targetGoLive, itKw: 0, racks: 0, halls: 0, status: 'Planned' }]); }}>Add phase</Button><Button size="small" onClick={() => setPhases(null)}>Use the plan's phases</Button></span>
            : <Button size="small" onClick={() => setPhases(plan.phases.map(p => ({ ...p, params: p.params ? { ...p.params } : undefined })))}>Change phases</Button>}
        </div>
        {phases && <PhaseEditor phases={phases} onChange={setPhases} ev={base} />}
      </Drawer>
    </div>
  );
}
