import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Form, Input, Modal, Select, Typography, Spin } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined, SearchOutlined, DesktopOutlined, ApiOutlined, TagsOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { VwCard, VwChip, EntityIconCell } from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import type { Device, DcimDeviceType, ComponentTemplate, DeviceComponent, Cable, Rack } from '../../../mock/data/types';
import { expandNames } from '../lib/trace';
import { ChangeRefSelect, useApprovedCRs } from '../../change';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const now = () => new Date().toISOString();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });

export default function DevicesPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const devices = (useEntityList('devices', { pageSize: 500 }).data?.data ?? []) as unknown as Device[];
  const types = (useEntityList('deviceTypes', { pageSize: 200 }).data?.data ?? []) as unknown as DcimDeviceType[];
  const templates = (useEntityList('componentTemplates', { pageSize: 1000 }).data?.data ?? []) as unknown as ComponentTemplate[];
  const components = (useEntityList('deviceComponents', { pageSize: 20000 }).data?.data ?? []) as unknown as DeviceComponent[];
  const cables = (useEntityList('cables', { pageSize: 2000 }).data?.data ?? []) as unknown as Cable[];
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const createDevice = useEntityCreate('devices');
  const createComp = useEntityCreate('deviceComponents');
  const recordAudit = useRecordAudit();
  const approvedCRs = useApprovedCRs();
  const crRef = (id?: string) => approvedCRs.find((c) => c.id === id)?.ref ?? id ?? '';
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [form] = Form.useForm();

  const rows = useMemo(() => devices.map((d) => {
    const t = types.find((x) => x.id === d.deviceTypeId);
    const ports = components.filter((c) => c.deviceId === d.id).length;
    const cabled = cables.filter((c) => c.aDeviceId === d.id || c.bDeviceId === d.id).length;
    return { ...d, model: t?.model ?? '—', role: t?.role ?? '—', ports, cabled };
  }), [devices, types, components, cables]);
  type Row = (typeof rows)[number];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => `${r.name} ${r.model} ${r.role}`.toLowerCase().includes(s)) : rows;
  }, [rows, q]);
  const stats = useMemo(() => ({
    total: devices.length,
    cabled: rows.filter((r) => r.cabled > 0).length,
    roles: new Set(rows.map((r) => r.role)).size,
  }), [devices, rows]);
  const devicesReveal = useScrollReveal(filtered, 25, q);

  function submit() {
    form.validateFields().then((v) => {
      const dt = types.find((t) => t.id === v.deviceTypeId);
      const rk = racks.find((r) => r.id === v.rackId);
      const ref = crRef(v.changeRef);
      const devcId = `DEVC-${Date.now().toString(36)}`;
      createDevice.mutate({ id: devcId, devcId, name: v.name, deviceTypeId: v.deviceTypeId, rackId: v.rackId, dataCenterId: rk?.dataCenterId, status: 'Active', ...env() });
      // Materialize ports from the type's component templates — NetBox-style inheritance.
      let n = 0;
      templates.filter((t) => t.deviceTypeId === v.deviceTypeId).forEach((t) => {
        expandNames(t.namePattern).forEach((cname, i) => {
          const id = `DCOMP-${Date.now().toString(36)}-${n}-${i}`;
          createComp.mutate({ id, dcompId: id, deviceId: devcId, kind: t.kind, name: cname, ifaceType: t.ifaceType, ...env() });
          n++;
        });
      });
      recordAudit('Device', v.name, 'created', `Instantiated ${v.name} from ${dt?.manufacturer} ${dt?.model} (${n} ports) [CR ${ref}]`);
      message.success(`${v.name} created with ${n} ports`);
      setOpen(false); form.resetFields();
      navigate(`/facility/devices/${devcId}`);
    });
  }

  const cols: TableColumnType<Row>[] = [
    { title: 'Device', dataIndex: 'name', render: (n: string, r) => <EntityIconCell icon={<DesktopOutlined />} iconTone="info" label={n} onClick={() => navigate(`/facility/devices/${r.id}`)} style={{ color: 'var(--primaryColor500)' }} /> },
    { title: 'Type', dataIndex: 'model' },
    { title: 'Role', dataIndex: 'role', render: (r: string) => <VwChip>{r}</VwChip> },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color="green">{s}</VwChip> },
    { title: 'Ports', dataIndex: 'ports', align: 'right' },
    { title: 'Cabled', dataIndex: 'cabled', align: 'right', render: (n: number) => n ? <VwChip color="blue">{n}</VwChip> : <Text type="secondary">0</Text> },
  ];

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-md)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <h1 className="vw-page-title" style={{ margin: 0 }}>Devices</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>New device</Button>
      </div>
      <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md" style={{ marginBottom: "var(--vw-space-md)" }}>
        <KPICard title="Devices" value={stats.total} icon={<DesktopOutlined />} iconTone="info" />
        <KPICard title="Cabled" value={stats.cabled} icon={<ApiOutlined />} iconTone="success" />
        <KPICard title="Roles in use" value={stats.roles} icon={<TagsOutlined />} iconTone="purple" />
      </div>
      <VwCard size="small">
        <Input allowClear prefix={<SearchOutlined />} placeholder="Search devices, type, role…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 320, marginBottom: "var(--vw-space-md)" }} />
        <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
          Showing {devicesReveal.visible.length} of {devicesReveal.total} devices
        </div>
        <Table<Row> rowKey="id" size="small" dataSource={devicesReveal.visible} columns={cols} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }}
          onRow={(r) => ({ onClick: () => navigate(`/facility/devices/${r.id}`), style: { cursor: 'pointer' } })}
          locale={{ emptyText: 'No devices match.' }} />
        {devicesReveal.visible.length > 0 && devicesReveal.hasMore && (
          <div ref={devicesReveal.sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>

      <Modal title="New device" open={open} onOk={submit} okText="Create & instantiate ports" onCancel={() => setOpen(false)} confirmLoading={createDevice.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Device name" rules={[{ required: true }]}><Input placeholder="e.g. leaf-03" /></Form.Item>
          <Form.Item name="deviceTypeId" label="Device type" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="Select a device type"
              options={types.map((t) => ({ value: t.id, label: `${t.manufacturer} ${t.model} · ${t.role}` }))} />
          </Form.Item>
          <Form.Item name="rackId" label="Rack (optional)">
            <Select showSearch optionFilterProp="label" allowClear placeholder="Place in a rack"
              options={racks.slice(0, 200).map((r) => ({ value: r.id, label: r.name }))} />
          </Form.Item>
          <Form.Item name="changeRef" label="Authorizing change request" rules={[{ required: true, message: 'Select an approved change request' }]}><ChangeRefSelect /></Form.Item>
          <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Ports are auto-created from the chosen type's component templates.</Text>
        </Form>
      </Modal>
    </div>
  );
}
