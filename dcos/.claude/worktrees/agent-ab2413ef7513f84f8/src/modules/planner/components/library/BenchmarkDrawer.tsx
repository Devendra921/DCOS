/* Add or edit one reference value. Plain labels on screen; the engine keys are kept underneath. */
import { App, Drawer, Form, Input, InputNumber, Select, Switch } from 'antd';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { DC_TYPE_CATALOG } from '../../../../mock/data/dcTypes';
import type * as T from '../../../../mock/data/types';
import { usePlannerActions } from '../../lib/usePlanner';
import { CLIMATE_LABEL, CLIMATE_ORDER, COOLING_LABEL, COOLING_ORDER, METRIC_INFO } from './labels';

const CATEGORY: { value: T.PlannerBenchmark['category']; label: string }[] = [
  { value: 'cost', label: 'Cost' }, { value: 'performance', label: 'Efficiency' }, { value: 'leadtime', label: 'Lead time' }, { value: 'sizing', label: 'Sizing' }, { value: 'staffing', label: 'Staffing' }, { value: 'sustainability', label: 'Sustainability' },
];
interface BenchForm { metric: string; label: string; category: T.PlannerBenchmark['category']; unit: string; value?: number; low?: number; high?: number; dcTypeKey?: string; coolingType?: T.PlannerCoolingType; climate?: string; tier?: string; regionId?: string; source: string; sourceDate: string; indicative: boolean }

export function BenchmarkDrawer({ target, regions, onClose }: { target: T.PlannerBenchmark | 'new' | null; regions: T.Region[]; onClose: () => void }) {
  const { message } = App.useApp(); const actions = usePlannerActions();
  const [form] = Form.useForm<BenchForm>();
  const isNew = target === 'new'; const b = target && target !== 'new' ? target : undefined;
  const initial: BenchForm = b
    ? { metric: b.metric, label: b.label, category: b.category, unit: b.unit, value: b.value, low: b.low, high: b.high, ...b.appliesTo, source: b.source, sourceDate: b.sourceDate.slice(0, 10), indicative: b.indicative }
    : { metric: 'capexPerKw', label: '', category: 'cost', unit: 'USD/kW', source: '', sourceDate: new Date().toISOString().slice(0, 10), indicative: true };
  const save = async () => {
    const v = await form.validateFields();
    const appliesTo: T.PlannerBenchmark['appliesTo'] = { dcTypeKey: v.dcTypeKey || undefined, coolingType: v.coolingType || undefined, climate: v.climate || undefined, tier: v.tier || undefined, regionId: v.regionId || undefined };
    const id = b?.id ?? actions.newId('BM');
    const label = v.label.trim() || METRIC_INFO[v.metric.split(':')[0]]?.name || v.metric;
    const rec = { ...(b ?? {}), id, bmId: b?.bmId ?? id, metric: v.metric.trim(), label, category: v.category, unit: v.unit.trim(), value: v.value ?? undefined, low: v.low ?? undefined, high: v.high ?? undefined, appliesTo, source: v.source.trim(), sourceDate: new Date(v.sourceDate).toISOString(), indicative: v.indicative } as T.PlannerBenchmark;
    actions.saveBenchmark(rec); message.success(`${isNew ? 'Added' : 'Saved'} ${rec.label}`); onClose();
  };
  const metricOptions = Object.entries(METRIC_INFO).filter(([k]) => k !== 'leadWeeks' && k !== 'durationWeeks').map(([k, v]) => ({ label: v.name, value: k }));
  return (
    <Drawer title={isNew ? 'Add a reference value' : b?.label} open={!!target} onClose={onClose} width={520} destroyOnHidden
      extra={<div className="vw-flex vw-gap-sm"><Button onClick={onClose}>Cancel</Button><Button type="primary" onClick={save}>{isNew ? 'Add' : 'Save'}</Button></div>}>
      <Form<BenchForm> form={form} layout="vertical" initialValues={initial} key={b?.id ?? 'new'} requiredMark={false}>
        <div className="vw-grid vw-grid-cols-2 vw-gap-sm">
          <Form.Item name="metric" label="What it measures" rules={[{ required: true }]}>
            {b?.metric.includes(':') ? <Input disabled /> : <Select showSearch optionFilterProp="label" options={metricOptions} />}
          </Form.Item>
          <Form.Item name="category" label="Group" rules={[{ required: true }]}><Select options={CATEGORY} /></Form.Item>
        </div>
        <Form.Item name="label" label="Name shown to planners"><Input placeholder="Leave empty to use the standard name" /></Form.Item>
        <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <Form.Item name="low" label="Low"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="value" label="Typical"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="high" label="High"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="unit" label="Unit" rules={[{ required: true }]}><Input /></Form.Item>
        </div>
        <div className="vw-card-metric-label" style={{ margin: '4px 0 8px' }}>Applies to — leave empty for all</div>
        <div className="vw-grid vw-grid-cols-2 vw-gap-sm">
          <Form.Item name="dcTypeKey" label="Site type"><Select allowClear placeholder="All site types" options={DC_TYPE_CATALOG.map(p => ({ label: p.name, value: p.key }))} /></Form.Item>
          <Form.Item name="coolingType" label="Cooling"><Select allowClear placeholder="All cooling" options={COOLING_ORDER.map(c => ({ label: COOLING_LABEL[c], value: c }))} /></Form.Item>
          <Form.Item name="climate" label="Climate"><Select allowClear placeholder="All climates" options={CLIMATE_ORDER.map(c => ({ label: CLIMATE_LABEL[c], value: c }))} /></Form.Item>
          <Form.Item name="tier" label="Tier"><Select allowClear placeholder="All tiers" options={['Tier II', 'Tier III', 'Tier IV'].map(c => ({ label: c, value: c }))} /></Form.Item>
          <Form.Item name="regionId" label="Region"><Select allowClear placeholder="All regions" options={regions.map(r => ({ label: r.name, value: r.id }))} /></Form.Item>
        </div>
        <Form.Item name="source" label="Where the number comes from" rules={[{ required: true }]}><Input placeholder="e.g. Supplier quotes 2026, last three builds" /></Form.Item>
        <div className="vw-grid vw-grid-cols-2 vw-gap-sm">
          <Form.Item name="sourceDate" label="As of" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="indicative" label="Indicative (not yet confirmed by our own sites)" valuePropName="checked"><Switch /></Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}
