/* Scenarios tab: what-if studio — compare every scenario against the base case, prefer one, create, edit, delete. */
import { useMemo, useState } from 'react';
import { App, Drawer, Form, Input, InputNumber, Popconfirm, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { VwCard, VwChip, VwSegmented } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { PlusOutlined, EditOutlined, DeleteOutlined, StarFilled, StarOutlined } from '../../../../shared/icons';
import { ScenarioCompareChart } from '../charts';
import { fmtUsd, fmtKw, type Evaluation } from '../../lib/engine';
import type * as T from '../../../../mock/data/types';
import { isEditable, lockReason } from '../../lib/governance';
import { COOLING_TYPES, Muted, REDUNDANCY, TIERS, n0, type PlanView } from './shared';
import { PhaseEditor } from '../wizard/PhaseEditor';

type Metric = NonNullable<Parameters<typeof ScenarioCompareChart>[0]['metric']>;
type OverrideValue = number | string | boolean;
interface FormValues { name: string; description: string; tier?: string | null; redundancy?: string | null; coolingType?: string | null; densityKwPerRack?: number | null; hallDesignKw?: number | null; pueTarget?: number | null; capexPerKw?: number | null; revenuePerKwMonth?: number | null; contingencyPct?: number | null }
const OVERRIDE_KEYS: (keyof Omit<FormValues, 'name' | 'description'>)[] = ['tier', 'redundancy', 'coolingType', 'densityKwPerRack', 'hallDesignKw', 'pueTarget', 'capexPerKw', 'revenuePerKwMonth', 'contingencyPct'];
const OVERRIDE_LABEL: Record<string, string> = { tier: 'Tier', redundancy: 'Redundancy', coolingType: 'Cooling', densityKwPerRack: 'Density', hallDesignKw: 'Hall load', pueTarget: 'PUE', capexPerKw: 'CapEx/kW', revenuePerKwMonth: 'Revenue', contingencyPct: 'Contingency' };

interface Row { key: string; name: string; scenario: T.PlannerScenario | null; ev: Evaluation; preferred: boolean }

export function ScenariosTab({ v }: { v: PlanView }) {
  const { plan, base, scenarios, actions, ev: shown } = v;
  const { message } = App.useApp();
  const [metric, setMetric] = useState<Metric>('capex');
  const [editing, setEditing] = useState<T.PlannerScenario | 'new' | null>(null);
  const [phases, setPhases] = useState<T.PlannerPhase[] | null>(null);
  const [form] = Form.useForm<FormValues>();
  // Scenarios are part of the plan under decision: they change only while the plan is editable (Draft or Rejected).
  const editable = isEditable(plan);

  const rows: Row[] = useMemo(() => [
    { key: 'base', name: 'Base case', scenario: null, ev: base, preferred: !plan.preferredScenarioId },
    ...scenarios.map(s => ({ key: s.scenario.id, name: s.scenario.name, scenario: s.scenario, ev: s.ev, preferred: s.scenario.id === plan.preferredScenarioId })),
  ], [base, scenarios, plan.preferredScenarioId]);

  const delta = (a: number, b: number) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : 0);
  const num = (val: number, baseVal: number, fmt: (x: number) => string, lowerBetter = true) => {
    const d = delta(val, baseVal);
    const tone = d === 0 ? 'var(--vw-color-slate-500)' : (d < 0) === lowerBetter ? 'var(--vw-color-green-600)' : 'var(--vw-color-red-600)';
    return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(val)} {d !== 0 && <span style={{ fontSize: 'var(--vw-font-label-xs)', color: tone }}>{d > 0 ? '+' : ''}{d}%</span>}</span>;
  };
  const cols: ColumnsType<Row> = useMemo(() => [
    { title: 'Scenario', key: 'name', render: (_: unknown, r) => (
      <div style={{ minWidth: 0 }}>
        <div className="vw-flex vw-items-center vw-gap-xs"><span style={{ fontWeight: 500 }}>{r.name}</span>{r.preferred && <VwChip variant="success" icon={<StarFilled />}>Preferred</VwChip>}{r.ev === shown && <VwChip variant="info">Showing</VwChip>}</div>
        {r.scenario && <Muted size="xs">{r.scenario.description}</Muted>}
        {r.scenario && Object.keys(r.scenario.overrides).length > 0 && <div className="vw-flex vw-wrap vw-gap-xs" style={{ marginTop: 4 }}>{Object.entries(r.scenario.overrides).map(([k, val]) => <VwChip key={k} variant="neutral" style={{ fontSize: 10 }}>{OVERRIDE_LABEL[k] ?? k} {String(val)}</VwChip>)}</div>}
      </div>) },
    { title: 'IT', key: 'it', align: 'right', render: (_: unknown, r) => fmtKw(r.ev.sizing.itKw) },
    { title: 'Racks', key: 'racks', align: 'right', render: (_: unknown, r) => num(r.ev.sizing.racks, base.sizing.racks, n0) },
    { title: 'Halls', key: 'halls', align: 'right', render: (_: unknown, r) => r.ev.sizing.halls },
    { title: 'CapEx', key: 'capex', align: 'right', render: (_: unknown, r) => num(r.ev.estimate.capexTotal, base.estimate.capexTotal, fmtUsd) },
    { title: 'CapEx/kW', key: 'cpk', align: 'right', render: (_: unknown, r) => num(r.ev.estimate.capexPerKw, base.estimate.capexPerKw, fmtUsd) },
    { title: 'OpEx/mo', key: 'opex', align: 'right', render: (_: unknown, r) => num(r.ev.estimate.opexMonthly, base.estimate.opexMonthly, fmtUsd) },
    { title: 'PUE', key: 'pue', align: 'right', render: (_: unknown, r) => num(r.ev.sizing.pue.value, base.sizing.pue.value, x => String(x)) },
    { title: 'Payback', key: 'pb', align: 'right', render: (_: unknown, r) => (r.ev.estimate.paybackMonths == null ? '—' : `${r.ev.estimate.paybackMonths} mo`) },
    { title: 'NPV', key: 'npv', align: 'right', render: (_: unknown, r) => (r.ev.estimate.npvUsd === undefined ? '—' : num(r.ev.estimate.npvUsd, base.estimate.npvUsd ?? 0, fmtUsd, false)) },
    { title: 'IRR', key: 'irr', align: 'right', render: (_: unknown, r) => (r.ev.estimate.irrPct == null ? '—' : `${r.ev.estimate.irrPct}%`) },
    { title: 'Phases', key: 'ph', align: 'right', render: (_: unknown, r) => r.scenario?.phaseOverrides?.length ? <VwChip variant="info">{r.scenario.phaseOverrides.length} own</VwChip> : plan.phases.length },
    { title: 'Rules', key: 'rules', render: (_: unknown, r) => <span className="vw-inline-flex vw-gap-xs"><VwChip variant={r.ev.hardFails ? 'error' : 'success'}>{r.ev.hardFails} fail</VwChip><VwChip variant={r.ev.softWarns ? 'warning' : 'neutral'}>{r.ev.softWarns} warn</VwChip></span> },
    { title: 'Readiness', key: 'ready', align: 'right', render: (_: unknown, r) => `${r.ev.readinessPct}%` },
    // Refused changes are reported by the data layer (usePlanner refuse() shows the reason); success is only announced when the change went through.
    ...(editable ? [{ title: '', key: 'actions', render: (_: unknown, r: Row) => (
      <div className="vw-flex vw-gap-xs vw-justify-end">
        {!r.preferred && <Button size="small" icon={<StarOutlined />} onClick={() => { if (actions.preferScenario(plan, r.scenario?.id).ok) message.success(`${r.name} is now the preferred scenario`); }}>Prefer</Button>}
        {r.scenario && <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r.scenario!)} aria-label="Edit scenario" />}
        {r.scenario && <Popconfirm title={`Delete ${r.name}?`} onConfirm={() => { if (!actions.deleteScenario(r.scenario!.id).ok) return; if (r.preferred) actions.preferScenario(plan, undefined); message.info('Scenario deleted'); }}><Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete scenario" /></Popconfirm>}
      </div>) }] : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [base, shown, plan, actions, editable]);

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
    if (editing === 'new') {
      const rec = actions.createScenario(plan.id, vals.name, vals.description ?? '', overrides);
      if (phaseOverrides && !actions.updateScenario(rec.id, { phaseOverrides }).ok) return;
      message.success(`Scenario ${vals.name} created`);
    } else if (editing) {
      if (!actions.updateScenario(editing.id, { name: vals.name, description: vals.description ?? '', overrides, phaseOverrides }).ok) return;
      message.success('Scenario updated');
    }
    setEditing(null);
  };
  const baseVal = (k: string) => { const p = base.params[k]; return p ? String(p.value) : '—'; };

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard title="Compare" extra={<div className="vw-flex vw-items-center vw-gap-sm"><VwSegmented<Metric> size="small" value={metric} onChange={setMetric} options={[{ label: 'CapEx', value: 'capex' }, { label: 'OpEx', value: 'opex' }, { label: 'PUE', value: 'pue' }, { label: 'Payback', value: 'payback' }, { label: 'Racks', value: 'racks' }]} />{editable && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openEdit('new')}>New scenario</Button>}</div>}>
        {!editable && <div className="vw-card-description" style={{ marginBottom: 8 }}>{lockReason(plan) ?? 'The plan is read-only.'} Scenarios are shown for comparison only.</div>}
        {scenarios.length ? <ScenarioCompareChart items={scenarios} metric={metric} height={260} /> : <div className="vw-card-description">{editable ? 'No scenarios yet. Create one to compare tier, cooling, density or cost assumptions against the base case.' : 'No scenarios were created for this plan.'}</div>}
      </VwCard>
      <VwCard title="All metrics" extra={<Muted>deltas against the base case</Muted>}>
        <Table<Row> size="small" rowKey="key" dataSource={rows} columns={cols} pagination={false} scroll={{ x: 1100 }} />
      </VwCard>

      <Drawer title={editing === 'new' ? 'New scenario' : `Edit ${editing?.name ?? ''}`} open={editable && editing !== null} onClose={() => setEditing(null)} width={phases ? 980 : 440} destroyOnHidden
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
