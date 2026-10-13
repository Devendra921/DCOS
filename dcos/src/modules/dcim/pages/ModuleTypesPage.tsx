import { useMemo, useState } from 'react';
import { App, Drawer, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import { Plus } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { RankList, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { WEIGHT_UNIT } from '../../../mock/data/enums';
import type { ModuleType, ComponentTemplate } from '../../../mock/data/types';
import { ComponentTemplateTab } from '../components/ComponentTemplateTab';
import { expandNames } from '../lib/trace';

const { Text } = Typography;
const now = () => new Date().toISOString();
const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });

export default function ModuleTypesPage() {
  const { message } = App.useApp();
  const moduleTypes = (useEntityList('moduleTypes', { pageSize: 200 }).data?.data ?? []) as unknown as ModuleType[];
  const templates = (useEntityList('componentTemplates', { pageSize: 2000 }).data?.data ?? []) as unknown as ComponentTemplate[];
  const create = useEntityCreate('moduleTypes');
  const recordAudit = useRecordAudit();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ModuleType | null>(null);
  const [q, setQ] = useState('');
  const [form] = Form.useForm();
  const [mfrF, setMfrF] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return moduleTypes.filter((m) => (!mfrF || m.manufacturer === mfrF) && (!s || `${m.manufacturer} ${m.model} ${m.partNumber ?? ''}`.toLowerCase().includes(s)));
  }, [moduleTypes, q, mfrF]);
  const mfrs = uniq(moduleTypes.map((m) => m.manufacturer));
  const mfrCount = (x: string) => moduleTypes.filter((m) => m.manufacturer === x).length;
  const mfrRank = mfrs.map((x) => ({ key: x, label: x, n: mfrCount(x), tone: 'info' as Tone, onClick: () => setMfrF(mfrF === x ? '' : x) }))
    .sort((a, b) => b.n - a.n).slice(0, 3);
  const moduleTemplates = templates.filter((t) => t.moduleTypeId).length;

  const mineFor = (mtId: string) => templates.filter((t) => t.moduleTypeId === mtId);
  const summary = (mtId: string) => {
    const byKind: Record<string, number> = {};
    for (const t of mineFor(mtId)) byKind[t.kind] = (byKind[t.kind] ?? 0) + expandNames(t.namePattern.replace('{slot}', '0')).length;
    return Object.entries(byKind).map(([k, n]) => `${n}× ${k}`).join(', ');
  };

  function submit() {
    form.validateFields().then((v) => {
      const id = `MT-${Date.now().toString(36)}`;
      create.mutate({ id, mtId: id, manufacturer: v.manufacturer, model: v.model, partNumber: v.partNumber, description: v.description, weight: v.weight, weightUnit: v.weightUnit ?? 'kg', ...env() }, {
        onSuccess: () => { recordAudit('ModuleType', v.model, 'created', `Created module type ${v.manufacturer} ${v.model}`); message.success('Module type created'); setOpen(false); form.resetFields(); },
      });
    });
  }

  const cols: Col<ModuleType>[] = [
    { key: 'model', header: 'Model', sort: (r) => r.model, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.model}</span><small>{r.partNumber ?? '—'}</small></span>
    ) },
    { key: 'mfr', header: 'Manufacturer', sort: (r) => r.manufacturer, render: (r) => r.manufacturer },
    { key: 'weight', header: 'Weight', align: 'right', sort: (r) => r.weight ?? -1, render: (r) => r.weight != null ? <span className="num">{r.weight} {r.weightUnit ?? ''}</span> : <span className="vw-label">—</span> },
    { key: 'components', header: 'Components', wrap: true, render: (r) => <span className="vw-label">{summary(r.id) || '—'}</span> },
  ];

  return (
    <OpsPage title="Module Types" description="Line cards and other modules that install into device bays, with their component templates"
      actions={<Btn variant="filled" icon={Plus} onClick={() => setOpen(true)}>New module type</Btn>}>
      <StatGrid cols={2}>
        <StatTile label="Module types" value={moduleTypes.length} sub={`${mfrs.length} manufacturers`}>
          <RankList items={mfrRank} />
        </StatTile>
        <StatTile label="Component templates" value={moduleTemplates} sub="interfaces and power ports on modules" />
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={filtered} cols={cols} onRow={(r) => setView(r)} defaultSort={{ key: 'model', dir: 'asc' }} pageSize={30}
          toolbar={
            <ListToolbar shown={filtered.length} total={moduleTypes.length} noun="module types"
              search={{ value: q, onChange: setQ, placeholder: 'Manufacturer, model, part number' }}
              filters={[
                { id: 'mfr', label: 'Manufacturer', quick: true, value: mfrF, anyLabel: 'Any manufacturer', onChange: setMfrF, options: mfrs.map((m) => ({ id: m, label: m, count: mfrCount(m) })) },
              ]} />
          } />
      </section>

      <Modal title="New module type" open={open} onOk={submit} okText="Create" onCancel={() => setOpen(false)} confirmLoading={create.isPending}>
        <Form form={form} layout="vertical">
          <Space align="start" wrap>
            <Form.Item name="manufacturer" label="Manufacturer" rules={[{ required: true }]} style={{ width: 200 }}><Input placeholder="Enter manufacturer" /></Form.Item>
            <Form.Item name="model" label="Model" rules={[{ required: true }]} style={{ width: 220 }}><Input placeholder="Enter model" /></Form.Item>
          </Space>
          <Space align="start" wrap>
            <Form.Item name="partNumber" label="Part number" style={{ width: 200 }}><Input placeholder="Enter part number" /></Form.Item>
            <Form.Item name="weight" label="Weight" style={{ width: 110 }}><InputNumber placeholder="Enter weight" min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="weightUnit" label="Unit" initialValue="kg" style={{ width: 90 }}><Select placeholder="Select unit" options={WEIGHT_UNIT.map((w) => ({ value: w, label: w }))} /></Form.Item>
          </Space>
          <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" autoSize={{ minRows: 2, maxRows: 3 }} /></Form.Item>
          <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Add component templates (interfaces, power) after creating, from the module type's drawer. Use <b>{'{slot}'}</b> in names to substitute the bay slot at install.</Text>
        </Form>
      </Modal>

      <Drawer mask={false} title={view ? `${view.manufacturer} ${view.model}` : ''} open={!!view} onClose={() => setView(null)} width={620}>
        {view && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Text type="secondary">{view.description} · P/N {view.partNumber ?? '—'}</Text>
            <div>
              <Text strong>Interface templates</Text>
              <ComponentTemplateTab owner={{ moduleTypeId: view.id }} kinds={['interface']} addKindDefault="interface" templates={mineFor(view.id)} />
            </div>
            <div>
              <Text strong>Power port templates</Text>
              <ComponentTemplateTab owner={{ moduleTypeId: view.id }} kinds={['power-port']} addKindDefault="power-port" templates={mineFor(view.id)} />
            </div>
          </Space>
        )}
      </Drawer>
    </OpsPage>
  );
}
