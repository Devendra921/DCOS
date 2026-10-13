import { useMemo, useState } from 'react';
import { App, Col, Drawer, Form, Input, InputNumber, Modal, Row, Select, Space, Typography, Spin } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined, SearchOutlined, AppstoreOutlined, BuildOutlined } from '../../../shared/icons';
import { VwCard } from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';
import type { TableColumnType } from 'antd';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { WEIGHT_UNIT } from '../../../mock/data/enums';
import type { ModuleType, ComponentTemplate } from '../../../mock/data/types';
import { ComponentTemplateTab } from '../components/ComponentTemplateTab';
import { expandNames } from '../lib/trace';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const now = () => new Date().toISOString();
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
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? moduleTypes.filter((m) => `${m.manufacturer} ${m.model} ${m.partNumber ?? ''}`.toLowerCase().includes(s)) : moduleTypes;
  }, [moduleTypes, q]);
  const moduleTypesReveal = useScrollReveal(filtered, 25, q);

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

  const cols: TableColumnType<ModuleType>[] = [
    { title: 'Model', dataIndex: 'model', render: (m: string, r) => <a onClick={() => setView(r)}>{m}</a> },
    { title: 'Manufacturer', dataIndex: 'manufacturer' },
    { title: 'Part number', dataIndex: 'partNumber', render: (p?: string) => p ?? '—' },
    { title: 'Weight', dataIndex: 'weight', align: 'right', render: (w?: number, r?) => w != null ? `${w} ${r?.weightUnit ?? ''}` : '—' },
    { title: 'Components', render: (_: unknown, r) => <Text type="secondary">{summary(r.id)}</Text> },
  ];

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-sm)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <h1 className="vw-page-title" style={{ margin: 0 }}>Module types</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>New module type</Button>
      </div>
      <Row gutter={12} style={{ marginBottom: "var(--vw-space-md)" }}>
        <Col xs={12} md={6}><KPICard title="Module types" value={moduleTypes.length} icon={<AppstoreOutlined />} iconTone="info" /></Col>
        <Col xs={12} md={6}><KPICard title="Component templates" value={templates.filter((t) => t.moduleTypeId).length} icon={<BuildOutlined />} iconTone="cyan" /></Col>
      </Row>
      <VwCard size="small">
        <Input allowClear prefix={<SearchOutlined />} placeholder="Search module types…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300, marginBottom: "var(--vw-space-md)" }} />
        <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
          Showing {moduleTypesReveal.visible.length} of {moduleTypesReveal.total} module types
        </div>
        <Table<ModuleType> rowKey="id" size="small" dataSource={moduleTypesReveal.visible} columns={cols} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }}
          onRow={(r) => ({ onClick: () => setView(r), style: { cursor: 'pointer' } })}
          locale={{ emptyText: 'No module types match.' }} />
        {moduleTypesReveal.visible.length > 0 && moduleTypesReveal.hasMore && (
          <div ref={moduleTypesReveal.sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>

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
    </div>
  );
}
