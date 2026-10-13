import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined, ImportOutlined, SearchOutlined, AppstoreOutlined, BuildOutlined, DesktopOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { DCIM_DEVICE_ROLE, PLATFORM, WEIGHT_UNIT } from '../../../mock/data/enums';
import type { DcimDeviceType, ComponentTemplate } from '../../../mock/data/types';
import { expandNames } from '../lib/trace';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const roleColor: Record<string, string> = { 'Leaf/ToR': 'blue', Spine: 'geekblue', Server: 'green', PDU: 'orange', 'Patch Panel': 'purple', 'Core Router': 'red', Firewall: 'volcano', Storage: 'cyan' };
const now = () => new Date().toISOString();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });
const SAMPLE = `[
  { "manufacturer": "Cisco", "model": "Nexus 9336C", "role": "Spine", "platform": "NX-OS", "uHeight": 1,
    "templates": [
      { "kind": "interface", "namePattern": "Eth1/[1-36]", "ifaceType": "100GBASE-X QSFP28" },
      { "kind": "power-port", "namePattern": "PSU[1-2]", "powerPortType": "AC", "maxDrawW": 1100 },
      { "kind": "console", "namePattern": "Console", "consoleType": "RJ-45" }
    ] }
]`;

export default function DeviceTypesPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const types = (useEntityList('deviceTypes', { pageSize: 300 }).data?.data ?? []) as unknown as DcimDeviceType[];
  const templates = (useEntityList('componentTemplates', { pageSize: 2000 }).data?.data ?? []) as unknown as ComponentTemplate[];
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as { deviceTypeId: string }[];
  const createType = useEntityCreate('deviceTypes');
  const createTpl = useEntityCreate('componentTemplates');
  const recordAudit = useRecordAudit();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [q, setQ] = useState('');
  const [form] = Form.useForm();
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? types.filter((t) => `${t.manufacturer} ${t.model} ${t.slug ?? ''} ${t.role}`.toLowerCase().includes(s)) : types;
  }, [types, q]);
  const { visible, hasMore, sentinelRef, total } = useScrollReveal(filtered, 25, q);

  const summary = (dtId: string) => {
    const byKind: Record<string, number> = {};
    for (const t of templates.filter((x) => x.deviceTypeId === dtId)) byKind[t.kind] = (byKind[t.kind] ?? 0) + expandNames(t.namePattern).length;
    return Object.entries(byKind).map(([k, n]) => `${n}× ${k}`).join(', ');
  };

  function createOne(dt: Partial<DcimDeviceType> & { templates?: Partial<ComponentTemplate>[] }) {
    const dtId = `DT-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
    createType.mutate({
      id: dtId, dtId, manufacturer: dt.manufacturer, model: dt.model, slug: dt.slug ?? String(dt.model ?? '').toLowerCase().replace(/\s+/g, '-'),
      partNumber: dt.partNumber, uHeight: Number(dt.uHeight) || 1, isFullDepth: !!dt.isFullDepth, airflow: dt.airflow,
      weight: dt.weight, weightUnit: dt.weightUnit ?? 'kg', role: dt.role ?? 'Other', platform: dt.platform,
      description: dt.description, excludeFromUtilization: !!dt.excludeFromUtilization, ...env(),
    });
    (dt.templates ?? []).forEach((t, i) => {
      const id = `CTPL-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 1e4)}`;
      createTpl.mutate({ id, ctplId: id, deviceTypeId: dtId, kind: t.kind, namePattern: t.namePattern, label: t.label, ifaceType: t.ifaceType, mgmtOnly: t.mgmtOnly, poeType: t.poeType, rfRole: t.rfRole, consoleType: t.consoleType, powerPortType: t.powerPortType, maxDrawW: t.maxDrawW, allocatedDrawW: t.allocatedDrawW, outletType: t.outletType, parentPowerPort: t.parentPowerPort, feedLeg: t.feedLeg, position: t.position, description: t.description, enabled: true, ...env() });
    });
    return dtId;
  }

  function submit() {
    form.validateFields().then((v) => {
      const id = createOne(v);
      recordAudit('DeviceType', v.model, 'created', `Created device type ${v.manufacturer} ${v.model}`);
      message.success('Device type created'); setOpen(false); form.resetFields();
      navigate(`/facility/device-types/${id}`);
    });
  }

  function doImport() {
    try {
      const arr = JSON.parse(importText);
      if (!Array.isArray(arr)) throw new Error('Expected a JSON array');
      arr.forEach((d) => createOne(d));
      recordAudit('DeviceType', 'import', 'imported', `Imported ${arr.length} device type(s)`);
      message.success(`Imported ${arr.length} device type(s)`); setImportOpen(false); setImportText('');
    } catch (e) {
      message.error(`Import failed: ${(e as Error).message}`);
    }
  }

  const cols: TableColumnType<DcimDeviceType>[] = [
    { title: 'Type', dataIndex: 'model', render: (m: string, r) => <a onClick={() => navigate(`/facility/device-types/${r.id}`)}>{m}</a> },
    { title: 'Slug', dataIndex: 'slug', render: (s?: string) => s ? <span>{s}</span> : '—' },
    { title: 'Part number', dataIndex: 'partNumber', render: (p?: string) => p ?? '—' },
    { title: 'U', dataIndex: 'uHeight', align: 'right', render: (u: number) => `${u}U` },
    { title: 'Weight', dataIndex: 'weight', align: 'right', render: (w?: number, r?) => w != null ? `${w} ${r?.weightUnit ?? ''}` : '—' },
    { title: 'Manufacturer', dataIndex: 'manufacturer' },
    { title: 'Role', dataIndex: 'role', render: (r: string) => <VwChip color={roleColor[r]}>{r}</VwChip> },
    { title: 'Components', render: (_: unknown, r) => <Text type="secondary">{summary(r.id)}</Text> },
  ];

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-sm)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <h1 className="vw-page-title" style={{ margin: 0 }}>Device types</h1>
        <Space>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>Import</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>New device type</Button>
        </Space>
      </div>
      <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md" style={{ marginBottom: "var(--vw-space-md)" }}>
        <KPICard title="Device types" value={types.length} icon={<AppstoreOutlined />} iconTone="info" />
        <KPICard title="Component templates" value={templates.length} icon={<BuildOutlined />} iconTone="cyan" />
        <KPICard title="Devices instantiated" value={devices.length} icon={<DesktopOutlined />} iconTone="purple" />
      </div>
      <Input allowClear prefix={<SearchOutlined />} placeholder="Search manufacturer, model, role…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 320, marginBottom: "var(--vw-space-md)" }} />
      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
        Showing {visible.length} of {total} device types
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Table<DcimDeviceType> rowKey="id" size="small" dataSource={visible} columns={cols} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }}
          onRow={(r) => ({ onClick: () => navigate(`/facility/device-types/${r.id}`), style: { cursor: 'pointer' } })}
          locale={{ emptyText: 'No device types match.' }} />
        {visible.length > 0 && hasMore && (
          <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>

      <Modal title="New device type" open={open} onOk={submit} okText="Create" onCancel={() => setOpen(false)} width={700} confirmLoading={createType.isPending}>
        <Form form={form} layout="vertical">
          <Space align="start" wrap>
            <Form.Item name="manufacturer" label="Manufacturer" rules={[{ required: true }]} style={{ width: 180 }}><Input placeholder="Enter manufacturer" /></Form.Item>
            <Form.Item name="model" label="Model" rules={[{ required: true }]} style={{ width: 200 }}><Input placeholder="Enter model" /></Form.Item>
            <Form.Item name="slug" label="Slug" style={{ width: 180 }}><Input placeholder="auto from model" /></Form.Item>
          </Space>
          <Space align="start" wrap>
            <Form.Item name="role" label="Role" rules={[{ required: true }]} style={{ width: 160 }}><Select placeholder="Select role" options={DCIM_DEVICE_ROLE.map((r) => ({ value: r, label: r }))} /></Form.Item>
            <Form.Item name="platform" label="Default platform" style={{ width: 140 }}><Select placeholder="Select default platform" allowClear options={PLATFORM.map((p) => ({ value: p, label: p }))} /></Form.Item>
            <Form.Item name="partNumber" label="Part number" style={{ width: 150 }}><Input placeholder="Enter part number" /></Form.Item>
            <Form.Item name="uHeight" label="Height (U)" initialValue={1} style={{ width: 90 }}><InputNumber placeholder="Enter height (U)" min={0} max={48} style={{ width: '100%' }} /></Form.Item>
          </Space>
          <Space align="start" wrap>
            <Form.Item name="weight" label="Weight" style={{ width: 110 }}><InputNumber placeholder="Enter weight" min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="weightUnit" label="Unit" initialValue="kg" style={{ width: 90 }}><Select placeholder="Select unit" options={WEIGHT_UNIT.map((w) => ({ value: w, label: w }))} /></Form.Item>
            <Form.Item name="airflow" label="Airflow" style={{ width: 150 }}><Input placeholder="front-to-rear" /></Form.Item>
            <Form.Item name="isFullDepth" label="Full depth" valuePropName="checked" initialValue={false}><Switch /></Form.Item>
            <Form.Item name="excludeFromUtilization" label="Exclude from util." valuePropName="checked" initialValue={false}><Switch /></Form.Item>
          </Space>
          <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" autoSize={{ minRows: 2, maxRows: 3 }} /></Form.Item>
          <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Add interface / power / console / chassis templates from the device-type detail tabs after creating.</Text>
        </Form>
      </Modal>

      <Modal title="Import device types (JSON)" open={importOpen} onOk={doImport} okText="Import" onCancel={() => setImportOpen(false)} width={620}>
        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Paste an array of device types (with optional component templates). Mirrors the NetBox device-type library shape.</Text>
        <Input.TextArea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={SAMPLE} autoSize={{ minRows: 10, maxRows: 20 }} style={{ fontSize: "var(--vw-font-label-sm)", marginTop: "var(--vw-space-sm)" }} />
      </Modal>
    </div>
  );
}
