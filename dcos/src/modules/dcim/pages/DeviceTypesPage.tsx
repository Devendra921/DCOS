import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Form, Input, InputNumber, Modal, Select, Space, Switch, Typography } from 'antd';
import { Import, Plus } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { RankList, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { DCIM_DEVICE_ROLE, PLATFORM, WEIGHT_UNIT } from '../../../mock/data/enums';
import type { DcimDeviceType, ComponentTemplate } from '../../../mock/data/types';
import { expandNames } from '../lib/trace';

const { Text } = Typography;
const ROLE_TONE: Record<string, Tone> = { 'Leaf/ToR': 'info', Spine: 'purple', Server: 'success', PDU: 'orange', 'Patch Panel': 'purple', 'Core Router': 'error', Firewall: 'orange', Storage: 'cyan' };
const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();
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
  const [roleF, setRoleF] = useState('');
  const [mfrF, setMfrF] = useState('');
  const [form] = Form.useForm();
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return types.filter((t) => (!roleF || t.role === roleF) && (!mfrF || t.manufacturer === mfrF)
      && (!s || `${t.manufacturer} ${t.model} ${t.slug ?? ''} ${t.role}`.toLowerCase().includes(s)));
  }, [types, q, roleF, mfrF]);
  const roles = uniq(types.map((t) => t.role));
  const mfrs = uniq(types.map((t) => t.manufacturer));
  const count = (f: (t: DcimDeviceType) => boolean) => types.filter(f).length;
  const roleRank = roles.map((r) => ({ key: r, label: r, n: count((t) => t.role === r), tone: 'info' as Tone, onClick: () => setRoleF(roleF === r ? '' : r) }))
    .sort((a, b) => b.n - a.n).slice(0, 3);

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

  const cols: Col<DcimDeviceType>[] = [
    { key: 'model', header: 'Type', sort: (r) => r.model, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.model}</span><small className="mono">{r.slug ?? '—'}</small></span>
    ) },
    { key: 'mfr', header: 'Manufacturer', sort: (r) => r.manufacturer, render: (r) => (
      <span className="cell-2"><span>{r.manufacturer}</span><small>{r.partNumber ?? '—'}</small></span>
    ) },
    { key: 'u', header: 'U', align: 'right', sort: (r) => r.uHeight, render: (r) => <span className="num">{r.uHeight}U</span> },
    { key: 'weight', header: 'Weight', align: 'right', sort: (r) => r.weight ?? -1, render: (r) => r.weight != null ? <span className="num">{r.weight} {r.weightUnit ?? ''}</span> : <span className="vw-label">—</span> },
    { key: 'role', header: 'Role', sort: (r) => r.role, render: (r) => <Chip tone={ROLE_TONE[r.role] ?? 'neutral'}>{r.role}</Chip> },
    { key: 'components', header: 'Components', wrap: true, render: (r) => <span className="vw-label">{summary(r.id) || '—'}</span> },
  ];

  return (
    <OpsPage title="Device Types" description="Device models and their component templates — the source new devices are instantiated from"
      actions={<>
        <Btn icon={Import} onClick={() => setImportOpen(true)}>Import</Btn>
        <Btn variant="filled" icon={Plus} onClick={() => setOpen(true)}>New device type</Btn>
      </>}>
      <StatGrid cols={3}>
        <StatTile label="Device types" value={types.length} sub={`${mfrs.length} manufacturers · ${roles.length} roles`}>
          <RankList items={roleRank} />
        </StatTile>
        <StatTile label="Component templates" value={templates.length} sub="interfaces, power, console and bays" />
        <StatTile label="Devices instantiated" value={devices.length} sub="built from these types" />
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={filtered} cols={cols} onRow={(r) => navigate(`/facility/device-types/${r.id}`)} defaultSort={{ key: 'model', dir: 'asc' }} pageSize={30}
          toolbar={
            <ListToolbar shown={filtered.length} total={types.length} noun="device types"
              search={{ value: q, onChange: setQ, placeholder: 'Manufacturer, model, role' }}
              filters={[
                { id: 'role', label: 'Role', quick: true, value: roleF, anyLabel: 'Any role', onChange: setRoleF, options: roles.map((r) => ({ id: r, label: r, count: count((t) => t.role === r) })) },
                { id: 'mfr', label: 'Manufacturer', quick: true, value: mfrF, anyLabel: 'Any manufacturer', onChange: setMfrF, options: mfrs.map((m) => ({ id: m, label: m, count: count((t) => t.manufacturer === m) })) },
              ]} />
          } />
      </section>

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
    </OpsPage>
  );
}
