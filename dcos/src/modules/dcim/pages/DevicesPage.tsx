import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Form, Input, Modal, Select, Typography } from 'antd';
import { Plus } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { RankList, SoftMeter, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import type { Device, DcimDeviceType, ComponentTemplate, DeviceComponent, Cable, Rack } from '../../../mock/data/types';
import { LAYERS, LAYER_LABEL, MONITORING_LABEL, monitoringOf, type MonitoringState } from '../lib/estateView';
import { expandNames } from '../lib/trace';
import { ChangeRefSelect, useApprovedCRs } from '../../change';

const { Text } = Typography;
const now = () => new Date().toISOString();
const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });

export default function DevicesPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const types = (useEntityList('deviceTypes', { pageSize: 200 }).data?.data ?? []) as unknown as DcimDeviceType[];
  const templates = (useEntityList('componentTemplates', { pageSize: 1000 }).data?.data ?? []) as unknown as ComponentTemplate[];
  const components = (useEntityList('deviceComponents', { pageSize: 500000 }).data?.data ?? []) as unknown as DeviceComponent[];
  const cables = (useEntityList('cables', { pageSize: 100000 }).data?.data ?? []) as unknown as Cable[];
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const createDevice = useEntityCreate('devices');
  const createComp = useEntityCreate('deviceComponents');
  const recordAudit = useRecordAudit();
  const approvedCRs = useApprovedCRs();
  const crRef = (id?: string) => approvedCRs.find((c) => c.id === id)?.ref ?? id ?? '';
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [form] = Form.useForm();

  const rows = useMemo(() => {
    const typeById = new Map(types.map((t) => [t.id, t]));
    const portsBy = new Map<string, number>();
    for (const c of components) portsBy.set(c.deviceId, (portsBy.get(c.deviceId) ?? 0) + 1);
    const cabledBy = new Map<string, number>();
    for (const c of cables) { cabledBy.set(c.aDeviceId, (cabledBy.get(c.aDeviceId) ?? 0) + 1); if (c.bDeviceId !== c.aDeviceId) cabledBy.set(c.bDeviceId, (cabledBy.get(c.bDeviceId) ?? 0) + 1); }
    return devices.map((d) => {
      const t = typeById.get(d.deviceTypeId);
      return { ...d, model: t?.model ?? '—', role: t?.role ?? '—', ports: portsBy.get(d.id) ?? 0, cabled: cabledBy.get(d.id) ?? 0, mon: monitoringOf(d) };
    });
  }, [devices, types, components, cables]);
  type Row = (typeof rows)[number];
  const [roleF, setRoleF] = useState('');
  const [cabledF, setCabledF] = useState('');
  const [layerF, setLayerF] = useState('');
  const [monF, setMonF] = useState('');
  const [gpuF, setGpuF] = useState('');
  const gpuModels = useMemo(() => [...new Set(rows.map((r) => r.gpu?.model).filter((m): m is string => !!m))].sort(), [rows]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!roleF || r.role === roleF) && (!cabledF || (cabledF === 'cabled' ? r.cabled > 0 : r.cabled === 0))
      && (!layerF || (layerF === 'none' ? !r.networkLayer : r.networkLayer === layerF))
      && (!monF || r.mon === monF)
      && (!gpuF || (gpuF === 'any' ? !!r.gpu : gpuF === 'none' ? !r.gpu : r.gpu?.model === gpuF))
      && (!s || `${r.name} ${r.model} ${r.role} ${r.gpu?.model ?? ''} ${r.osVersion ?? ''}`.toLowerCase().includes(s)));
  }, [rows, q, roleF, cabledF, layerF, monF, gpuF]);
  const stats = useMemo(() => ({
    total: devices.length,
    cabled: rows.filter((r) => r.cabled > 0).length,
    roles: new Set(rows.map((r) => r.role)).size,
    gpuNodes: rows.filter((r) => r.gpu).length,
    gpus: rows.reduce((a, r) => a + (r.gpu?.count ?? 0), 0),
  }), [devices, rows]);
  const roles = uniq(rows.map((r) => r.role));
  const roleRank = roles.map((x) => ({ key: x, label: x, n: rows.filter((r) => r.role === x).length, tone: 'purple' as Tone, onClick: () => setRoleF(roleF === x ? '' : x) }))
    .sort((a, b) => b.n - a.n).slice(0, 3);
  const cabledPct = stats.total ? Math.round((stats.cabled / stats.total) * 100) : 0;

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

  const cols: Col<Row>[] = [
    { key: 'name', header: 'Device', sort: (r) => r.name, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.model}</small></span>
    ) },
    { key: 'role', header: 'Role', sort: (r) => r.role, render: (r) => <Chip tone="neutral">{r.role}</Chip> },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip tone="success" dot>{r.status}</Chip> },
    { key: 'ports', header: 'Ports', align: 'right', sort: (r) => r.ports, render: (r) => <span className="num">{r.ports}</span> },
    { key: 'layer', header: 'Layer', sort: (r) => r.networkLayer ?? '', render: (r) => r.networkLayer ? (LAYER_LABEL[r.networkLayer as keyof typeof LAYER_LABEL] ?? r.networkLayer) : <span className="vw-label">—</span> },
    { key: 'mon', header: 'Monitoring', sort: (r) => r.mon, render: (r) => r.mon === 'unknown' ? <span className="vw-label">Not recorded</span> : <Chip tone={r.mon === 'monitored' ? 'success' : 'warning'}>{MONITORING_LABEL[r.mon]}</Chip> },
    { key: 'gpu', header: 'GPU', sort: (r) => r.gpu?.model ?? '', render: (r) => r.gpu ? `${r.gpu.count} × ${r.gpu.model}` : <span className="vw-label">—</span> },
    { key: 'cabled', header: 'Cabled', align: 'right', sort: (r) => r.cabled, render: (r) => r.cabled ? <Chip tone="info">{r.cabled}</Chip> : <span className="vw-label num">0</span> },
  ];

  return (
    <OpsPage title="Devices" description="Physical devices placed in racks — type, role, ports and cabling"
      actions={<Btn variant="filled" icon={Plus} onClick={() => setOpen(true)}>New device</Btn>}>
      <StatGrid cols={4}>
        <StatTile label="Devices" value={stats.total} sub={`${stats.total - stats.cabled} not cabled`} />
        <StatTile label="Cabled" value={stats.cabled} sub={`${cabledPct}% of devices`}
          onClick={() => setCabledF(cabledF === 'cabled' ? '' : 'cabled')} active={cabledF === 'cabled'}>
          <SoftMeter pct={cabledPct} tone="success" />
        </StatTile>
        <StatTile label="GPU servers" value={stats.gpuNodes} sub={`${stats.gpus.toLocaleString()} GPUs fitted`}
          onClick={() => setGpuF(gpuF === 'any' ? '' : 'any')} active={gpuF === 'any'} />
        <StatTile label="Roles in use" value={stats.roles} sub="click to filter">
          <RankList items={roleRank} />
        </StatTile>
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={filtered} cols={cols} onRow={(r) => navigate(`/facility/devices/${r.id}`)} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={30}
          toolbar={
            <ListToolbar shown={filtered.length} total={rows.length} noun="devices"
              search={{ value: q, onChange: setQ, placeholder: 'Device, type, role, GPU' }}
              filters={[
                { id: 'role', label: 'Role', quick: true, value: roleF, anyLabel: 'Any role', onChange: setRoleF, options: roles.map((x) => ({ id: x, label: x, count: rows.filter((r) => r.role === x).length })) },
                { id: 'layer', label: 'Layer', value: layerF, anyLabel: 'Any layer', onChange: setLayerF, options: [...LAYERS.map((l) => ({ id: l as string, label: LAYER_LABEL[l], count: rows.filter((r) => r.networkLayer === l).length })), { id: 'none', label: 'No layer', count: rows.filter((r) => !r.networkLayer).length }] },
                { id: 'mon', label: 'Monitoring', value: monF, anyLabel: 'Any monitoring', onChange: setMonF, options: (['monitored', 'not-monitored', 'unknown'] as MonitoringState[]).map((m) => ({ id: m as string, label: MONITORING_LABEL[m], count: rows.filter((r) => r.mon === m).length })) },
                { id: 'gpu', label: 'GPU', value: gpuF, anyLabel: 'Any GPU', onChange: setGpuF, options: [{ id: 'any', label: 'GPU servers', count: stats.gpuNodes }, { id: 'none', label: 'No GPU', count: stats.total - stats.gpuNodes }, ...gpuModels.map((m) => ({ id: m, label: m, count: rows.filter((r) => r.gpu?.model === m).length }))] },
                { id: 'cabled', label: 'Cabling', quick: true, value: cabledF, anyLabel: 'Any cabling', onChange: setCabledF, options: [
                  { id: 'cabled', label: 'Cabled', count: stats.cabled }, { id: 'uncabled', label: 'Not cabled', count: stats.total - stats.cabled },
                ] },
              ]} />
          } />
      </section>

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
    </OpsPage>
  );
}
