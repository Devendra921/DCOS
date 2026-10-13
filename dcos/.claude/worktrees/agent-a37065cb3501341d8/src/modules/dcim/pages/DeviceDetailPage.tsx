import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Steps, Switch, Tabs, Tooltip, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { ArrowLeftOutlined, ApiOutlined, NodeIndexOutlined, DisconnectOutlined, EditOutlined } from '../../../shared/icons';
import { useEntityList, useEntityCreate, useEntityDelete, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { IF_MODE, IF_DUPLEX } from '../../../mock/data/enums';
import type { Device, DcimDeviceType, DeviceComponent, Cable, Module, ModuleType, ComponentTemplate, VLAN, InventoryItem, InventoryItemRole, DeviceRoleEntity, PlatformEntity, VirtualChassis, VirtualDeviceContext, VRF } from '../../../mock/data/types';
import { DEVICE_FACE, AIRFLOW, ASSET_LIFECYCLE } from '../../../mock/data/enums';
import { traceFrom, expandNames } from '../lib/trace';
import { DeviceFaceplate } from '../components/DeviceFaceplate';
import { DeviceConnections } from '../components/DeviceConnections';
import { DeviceIpTab } from '../../ipam/components/DeviceIpTab';
import { EntityCustomizeCard, TagChips } from '../../../shared/customization';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { ChangeRefModal, ChangeRefSelect, useApprovedCRs } from '../../change';
import type { ApprovedCR } from '../../change';

const { Text } = Typography;
const now = () => new Date().toISOString();

export default function DeviceDetailPage() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const devices = (useEntityList('devices', { pageSize: 500 }).data?.data ?? []) as unknown as Device[];
  const types = (useEntityList('deviceTypes', { pageSize: 200 }).data?.data ?? []) as unknown as DcimDeviceType[];
  const components = (useEntityList('deviceComponents', { pageSize: 20000 }).data?.data ?? []) as unknown as DeviceComponent[];
  const cables = (useEntityList('cables', { pageSize: 2000 }).data?.data ?? []) as unknown as Cable[];
  const modules = (useEntityList('modules', { pageSize: 1000 }).data?.data ?? []) as unknown as Module[];
  const moduleTypes = (useEntityList('moduleTypes', { pageSize: 200 }).data?.data ?? []) as unknown as ModuleType[];
  const allTemplates = (useEntityList('componentTemplates', { pageSize: 2000 }).data?.data ?? []) as unknown as ComponentTemplate[];
  const vlans = (useEntityList('vlans', { pageSize: 1000 }).data?.data ?? []) as unknown as VLAN[];
  const invItems = (useEntityList('inventoryItems', { pageSize: 2000 }).data?.data ?? []) as unknown as InventoryItem[];
  const invRoles = (useEntityList('inventoryItemRoles', { pageSize: 100 }).data?.data ?? []) as unknown as InventoryItemRole[];
  const deviceRoles = (useEntityList('deviceRoles', { pageSize: 100 }).data?.data ?? []) as unknown as DeviceRoleEntity[];
  const platforms = (useEntityList('platforms', { pageSize: 100 }).data?.data ?? []) as unknown as PlatformEntity[];
  const vchassis = (useEntityList('virtualChassis', { pageSize: 100 }).data?.data ?? []) as unknown as VirtualChassis[];
  const vdcs = (useEntityList('virtualDeviceContexts', { pageSize: 500 }).data?.data ?? []) as unknown as VirtualDeviceContext[];
  const vrfs = (useEntityList('vrfs', { pageSize: 500 }).data?.data ?? []) as unknown as VRF[];
  const createInv = useEntityCreate('inventoryItems');
  const updateDevice = useEntityUpdate('devices');
  const createCable = useEntityCreate('cables');
  const deleteCable = useEntityDelete('cables');
  const createModule = useEntityCreate('modules');
  const createComp = useEntityCreate('deviceComponents');
  const updateComp = useEntityUpdate('deviceComponents');
  const recordAudit = useRecordAudit();
  const [installBay, setInstallBay] = useState<string | null>(null);
  const [moduleTypeId, setModuleTypeId] = useState<string | undefined>();
  const [editIface, setEditIface] = useState<DeviceComponent | null>(null);
  const [ifaceForm] = Form.useForm();
  const [installChildBay, setInstallChildBay] = useState<string | null>(null);
  const [childDeviceId, setChildDeviceId] = useState<string | undefined>();
  const [invOpen, setInvOpen] = useState(false);
  const [invForm] = Form.useForm();
  const [editDev, setEditDev] = useState(false);
  const [devForm] = Form.useForm();
  const [gate, setGate] = useState<{ title: string; run: (cr: ApprovedCR) => void } | null>(null);
  const [lcOpen, setLcOpen] = useState(false);
  const [lcState, setLcState] = useState<string | undefined>();
  const [lcCr, setLcCr] = useState<string | undefined>();
  const [connectCr, setConnectCr] = useState<string | undefined>();
  const approvedCRs = useApprovedCRs();
  const crRef = (id?: string) => approvedCRs.find((c) => c.id === id)?.ref ?? id ?? '';
  const vlanName = (id?: string) => { const v = vlans.find((x) => x.id === id); return v ? `VLAN ${v.vlanNumber} · ${v.name}` : undefined; };
  const roleName = (id?: string) => invRoles.find((r) => r.id === id);
  const devRoleName = (id?: string) => deviceRoles.find((r) => r.id === id);
  const platName = (id?: string) => platforms.find((p) => p.id === id)?.name;

  const device = devices.find((d) => d.id === deviceId);
  const type = types.find((t) => t.id === device?.deviceTypeId);
  const myComps = useMemo(() => components.filter((c) => c.deviceId === deviceId), [components, deviceId]);

  const cableOf = (compId: string) => cables.find((c) => c.aComponentId === compId || c.bComponentId === compId);
  const compById = (id: string) => components.find((c) => c.id === id);
  const devName = (id: string) => devices.find((d) => d.id === id)?.name ?? '?';
  const vrfName = (id?: string) => vrfs.find((v) => v.id === id)?.name;
  const lagParentName = (id?: string) => components.find((c) => c.id === id)?.name;

  const [connectFrom, setConnectFrom] = useState<DeviceComponent | null>(null);
  const [targetDev, setTargetDev] = useState<string | undefined>();
  const [targetPort, setTargetPort] = useState<string | undefined>();
  const [trace, setTrace] = useState<DeviceComponent | null>(null);

  const freePortsOf = (devId: string) => components.filter((c) => c.deviceId === devId && !cableOf(c.id));

  function doConnect() {
    if (!connectFrom || !targetPort || !connectCr) return;
    const tp = compById(targetPort);
    if (!tp) return;
    const ref = crRef(connectCr);
    createCable.mutate({
      cblId: `CBL-${Date.now().toString().slice(-5)}`, status: 'Active', cableType: connectFrom.kind.includes('power') ? 'Power-C13' : 'Cat6a',
      label: `${connectFrom.name}↔${tp.name}`, aKind: connectFrom.kind, aComponentId: connectFrom.id, aDeviceId: connectFrom.deviceId,
      bKind: tp.kind, bComponentId: tp.id, bDeviceId: tp.deviceId,
      customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me',
    }, {
      onSuccess: () => { recordAudit('Cable', connectFrom.name, 'connected', `Cabled ${device?.name}:${connectFrom.name} ↔ ${devName(tp.deviceId)}:${tp.name} [CR ${ref}]`); message.success('Cable connected'); setConnectFrom(null); setTargetDev(undefined); setTargetPort(undefined); setConnectCr(undefined); },
    });
  }
  function disconnect(c: Cable) {
    setGate({ title: 'Disconnect cable', run: (cr) => deleteCable.mutate(c.id, { onSuccess: () => { message.success('Cable removed'); recordAudit('Cable', c.label ?? c.id, 'disconnected', `Removed ${c.label ?? c.id} [CR ${cr.ref}]`); } }) });
  }

  function installModule() {
    if (!installBay || !moduleTypeId || !device) return;
    const mt = moduleTypes.find((m) => m.id === moduleTypeId);
    const modId = `MOD-${Date.now().toString(36)}`;
    createModule.mutate({ id: modId, modId, deviceId: device.id, moduleBayName: installBay, moduleTypeId, customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });
    const slotNum = installBay.match(/(\d+)/)?.[1] ?? '0';
    let n = 0;
    allTemplates.filter((t) => t.moduleTypeId === moduleTypeId).forEach((t) => {
      expandNames(t.namePattern.replace('{slot}', slotNum)).forEach((cname, i) => {
        const id = `DCOMP-${Date.now().toString(36)}-${n}-${i}`;
        createComp.mutate({ id, dcompId: id, deviceId: device.id, kind: t.kind, name: cname, label: t.label, ifaceType: t.ifaceType, moduleId: modId, customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });
        n++;
      });
    });
    recordAudit('Module', installBay, 'installed', `Installed ${mt?.model} into ${device.name} ${installBay} (${n} ports)`);
    message.success(`Module installed — ${n} ports added`);
    setInstallBay(null); setModuleTypeId(undefined);
  }

  function openEditIface(c: DeviceComponent) {
    setEditIface(c);
    ifaceForm.setFieldsValue({ enabled: c.enabled ?? true, mode: c.mode ?? 'Access', mtu: c.mtu ?? 1500, macAddress: c.macAddress, speedMbps: c.speedMbps, duplex: c.duplex ?? 'auto', untaggedVlanId: c.untaggedVlanId });
  }
  function saveIface() {
    if (!editIface) return;
    ifaceForm.validateFields().then((v) => {
      updateComp.mutate({ id: editIface.id, data: { enabled: v.enabled, mode: v.mode, mtu: v.mtu, macAddress: v.macAddress, speedMbps: v.speedMbps, duplex: v.duplex, untaggedVlanId: v.untaggedVlanId } }, {
        onSuccess: () => { recordAudit('Interface', editIface.name, 'updated', `Edited ${device?.name}:${editIface.name}`); message.success('Interface updated'); setEditIface(null); },
      });
    });
  }

  function installChild() {
    if (!installChildBay || !childDeviceId || !device) return;
    updateDevice.mutate({ id: childDeviceId, data: { parentDeviceId: device.id, parentBayName: installChildBay } }, {
      onSuccess: () => { recordAudit('Device', installChildBay, 'installed', `Installed child device into ${device.name} ${installChildBay}`); message.success('Child device installed'); setInstallChildBay(null); setChildDeviceId(undefined); },
    });
  }
  function addInventory() {
    if (!device) return;
    invForm.validateFields().then((v) => {
      const id = `INV-${Date.now().toString(36)}`;
      createInv.mutate({ id, invId: id, deviceId: device.id, roleId: v.roleId, name: v.name, label: v.label, manufacturer: v.manufacturer, partNumber: v.partNumber, serial: v.serial, discovered: false, customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' }, {
        onSuccess: () => { recordAudit('InventoryItem', v.name, 'created', `Added inventory item ${v.name} to ${device.name}`); message.success('Inventory item added'); setInvOpen(false); invForm.resetFields(); },
      });
    });
  }

  function openEditDev() {
    if (!device) return;
    setEditDev(true);
    devForm.setFieldsValue({ serial: device.serial, assetTag: device.assetTag, position: device.position, face: device.face ?? 'front', deviceRoleId: device.deviceRoleId, platformId: device.platformId, primaryIp4: device.primaryIp4, primaryIp6: device.primaryIp6, oobIp: device.oobIp, airflow: device.airflow, virtualChassisId: device.virtualChassisId, vcPosition: device.vcPosition, vcPriority: device.vcPriority });
  }
  function saveDevice() {
    if (!device) return;
    devForm.validateFields().then((v) => {
      updateDevice.mutate({ id: device.id, data: { serial: v.serial, assetTag: v.assetTag, position: v.position, face: v.face, deviceRoleId: v.deviceRoleId, platformId: v.platformId, primaryIp4: v.primaryIp4, primaryIp6: v.primaryIp6, oobIp: v.oobIp, airflow: v.airflow, virtualChassisId: v.virtualChassisId, vcPosition: v.vcPosition, vcPriority: v.vcPriority } }, {
        onSuccess: () => { recordAudit('Device', device.name, 'updated', `Edited device ${device.name}`); message.success('Device updated'); setEditDev(false); },
      });
    });
  }

  if (!device) return <div><Empty description="Device not found" /></div>;

  const vc = vchassis.find((v) => v.id === device.virtualChassisId);
  const moduleBays = myComps.filter((c) => c.kind === 'module-bay');
  const deviceBays = myComps.filter((c) => c.kind === 'device-bay');
  const kinds = Array.from(new Set(myComps.filter((c) => !['module-bay', 'device-bay'].includes(c.kind)).map((c) => c.kind)));
  const childInBay = (bayName: string) => devices.find((d) => d.parentDeviceId === device.id && d.parentBayName === bayName);
  const childlessDevices = devices.filter((d) => !d.parentDeviceId && d.id !== device.id);
  const myInv = invItems.filter((i) => i.deviceId === device.id);
  const moduleIn = (bayName: string) => modules.find((m) => m.deviceId === device.id && m.moduleBayName === bayName);
  const myVdcs = vdcs.filter((v) => v.deviceId === device.id);
  const moduleTypeName = (id: string) => { const m = moduleTypes.find((x) => x.id === id); return m ? `${m.manufacturer} ${m.model}` : '?'; };

  const KIND_LABEL: Record<string, string> = { interface: 'Interfaces', 'power-port': 'Power ports', 'power-outlet': 'Power outlets', console: 'Console ports', 'console-server': 'Console server ports', 'front-port': 'Front ports', 'rear-port': 'Rear ports' };

  const portRow = (c: DeviceComponent, kind: string) => {
    const cable = cableOf(c.id);
    const peerId = cable ? (cable.aComponentId === c.id ? cable.bComponentId : cable.aComponentId) : undefined;
    const peer = peerId ? compById(peerId) : undefined;
    return (
      <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: "var(--vw-space-sm)", padding: '6px 0', borderBottom: "1px solid var(--vw-color-slate-100)" }}>
        <Space wrap>
          <ApiOutlined style={{ color: cable ? 'var(--vw-color-green-600)' : '#cbd5e1' }} />
          <Text strong delete={kind === 'interface' && c.enabled === false}>{c.name}</Text>
          {c.ifaceType && <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{c.ifaceType}</Text>}
          {kind === 'interface' && c.speedMbps != null && <VwChip>{c.speedMbps >= 1000 ? `${c.speedMbps / 1000}G` : `${c.speedMbps}M`}</VwChip>}
          {kind === 'interface' && c.mode && <VwChip color="geekblue">{c.mode}{c.untaggedVlanId ? ` · ${vlanName(c.untaggedVlanId)}` : ''}</VwChip>}
          {kind === 'interface' && c.macAddress && <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>{c.macAddress}</Text>}
          {kind === 'interface' && c.lagId && <VwChip color="purple">LAG → {lagParentName(c.lagId)}</VwChip>}
          {kind === 'interface' && c.vrfId && <VwChip color="volcano">VRF: {vrfName(c.vrfId)}</VwChip>}
          {kind === 'interface' && c.wwn && <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>WWN {c.wwn}</Text>}
          {kind === 'interface' && c.enabled === false && <VwChip color="default">disabled</VwChip>}
          {kind === 'front-port' && c.rearPortId && <VwChip color="cyan">↔ {compById(c.rearPortId)?.name} (pos {c.rearPortPosition ?? 1})</VwChip>}
          {kind === 'rear-port' && c.positions != null && <VwChip>{c.positions} pos</VwChip>}
          {c.moduleId && <VwChip color="purple">module</VwChip>}
        </Space>
        <Space wrap>
          {kind === 'interface' && <Button size="small" icon={<EditOutlined />} onClick={() => openEditIface(c)} />}
          {cable && peer ? (
            <>
              <VwChip color="green">→ {devName(peer.deviceId)} : {peer.name}</VwChip>
              <VwChip>{cable.cableType}</VwChip>
              <Button size="small" icon={<NodeIndexOutlined />} onClick={() => setTrace(c)}>Trace</Button>
              <Button size="small" danger icon={<DisconnectOutlined />} onClick={() => disconnect(cable)} />
            </>
          ) : (
            <Button size="small" type="dashed" icon={<ApiOutlined />} onClick={() => { setConnectFrom(c); setTargetDev(undefined); setTargetPort(undefined); }}>Connect</Button>
          )}
        </Space>
      </div>
    );
  };
  const kindCard = (kind: string) => {
    const rows = myComps.filter((c) => c.kind === kind);
    if (rows.length === 0) return null;
    return <VwCard key={kind} size="small" title={`${KIND_LABEL[kind] ?? kind} (${rows.length})`} style={{ marginBottom: "var(--vw-space-md)" }}><div>{rows.map((c) => portRow(c, kind))}</div></VwCard>;
  };

  const baysCards = (
    <>
      {moduleBays.length > 0 && (
        <VwCard size="small" title="Module bays (chassis)" style={{ marginBottom: "var(--vw-space-md)" }}>
          {moduleBays.map((bay) => {
            const mod = moduleIn(bay.name);
            const injected = myComps.filter((c) => c.moduleId === mod?.id).length;
            return (
              <div key={bay.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: "1px solid var(--vw-color-slate-100)" }}>
                <Space><Text strong>{bay.name}</Text>{bay.label && <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{bay.label}</Text>}</Space>
                <Space>{mod ? (<><VwChip color="green">{moduleTypeName(mod.moduleTypeId)}</VwChip><VwChip>{injected} ports</VwChip></>) : (<Button size="small" type="dashed" onClick={() => { setInstallBay(bay.name); setModuleTypeId(undefined); }}>Install module</Button>)}</Space>
              </div>
            );
          })}
        </VwCard>
      )}
      {deviceBays.length > 0 && (
        <VwCard size="small" title="Device bays (child devices)" style={{ marginBottom: "var(--vw-space-md)" }}>
          {deviceBays.map((bay) => {
            const child = childInBay(bay.name);
            return (
              <div key={bay.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: "1px solid var(--vw-color-slate-100)" }}>
                <Space><Text strong>{bay.name}</Text>{bay.label && <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{bay.label}</Text>}</Space>
                <Space>{child ? <VwChip color="green" style={{ cursor: 'pointer' }} onClick={() => navigate(`/facility/devices/${child.id}`)}>{child.name} →</VwChip> : <Button size="small" type="dashed" onClick={() => { setInstallChildBay(bay.name); setChildDeviceId(undefined); }}>Install device</Button>}</Space>
              </div>
            );
          })}
        </VwCard>
      )}
      {moduleBays.length === 0 && deviceBays.length === 0 && <Empty description="No bays on this device type" />}
    </>
  );

  const inventoryCard = (
    <VwCard size="small" title={`Inventory items (${myInv.length})`} extra={<Button size="small" type="primary" onClick={() => { setInvOpen(true); invForm.resetFields(); }}>Add</Button>}>
      {myInv.length === 0 ? <Empty description="No inventory items" /> : (
        <Table size="small" rowKey="id" pagination={false} dataSource={myInv} scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Role', dataIndex: 'roleId', render: (id?: string) => { const r = roleName(id); return r ? <VwChip color={r.color}>{r.name}</VwChip> : '—'; } },
            { title: 'Manufacturer', dataIndex: 'manufacturer', render: (m?: string) => m ?? '—' },
            { title: 'Part number', dataIndex: 'partNumber', render: (p?: string) => p ?? '—' },
            { title: 'Serial', dataIndex: 'serial', render: (s?: string) => s ?? '—' },
            { title: 'Discovered', dataIndex: 'discovered', align: 'center', render: (d?: boolean) => (d ? 'yes' : 'no') },
          ]} />
      )}
    </VwCard>
  );

  const peerLabelOf = (compId: string): string | undefined => {
    const cable = cableOf(compId);
    if (!cable) return undefined;
    const peerId = cable.aComponentId === compId ? cable.bComponentId : cable.aComponentId;
    const peer = compById(peerId);
    return peer ? `${devName(peer.deviceId)} : ${peer.name}` : undefined;
  };
  const onPortClick = (c: DeviceComponent, cabled: boolean) => {
    if (cabled) setTrace(c);
    else { setConnectFrom(c); setTargetDev(undefined); setTargetPort(undefined); }
  };
  const portMap = (
    <VwCard size="small" title="Faceplate — click a port to connect or trace" style={{ marginBottom: "var(--vw-space-md)" }}>
      <DeviceFaceplate components={myComps} isCabled={(id) => !!cableOf(id)} peerLabel={peerLabelOf} onPort={onPortClick} />
    </VwCard>
  );

  const powerKinds = kinds.filter((k) => ['power-port', 'power-outlet', 'console', 'console-server'].includes(k));
  const passKinds = kinds.filter((k) => ['front-port', 'rear-port'].includes(k));
  const cableCount = cables.filter((c) => c.aDeviceId === device.id || c.bDeviceId === device.id).length;

  const tabItems = [
    {
      key: 'overview', label: 'Overview', children: (
        <>
        {portMap}
        <VwCard size="small">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Status"><VwChip color="green">{device.status}</VwChip></Descriptions.Item>
            <Descriptions.Item label="Role">{devRoleName(device.deviceRoleId)?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Platform">{platName(device.platformId) ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Serial">{device.serial ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Asset tag">{device.assetTag ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Primary IPv4">{device.primaryIp4 ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Primary IPv6">{device.primaryIp6 ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="OOB mgmt IP">{device.oobIp ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Airflow">{device.airflow ?? type?.airflow ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Rack position">{device.position != null ? `U${device.position}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Face">{device.face ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Virtual chassis">{vc ? `${vc.name} · pos ${device.vcPosition ?? 0} · prio ${device.vcPriority ?? '—'}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Interfaces">{myComps.filter((c) => c.kind === 'interface').length}</Descriptions.Item>
            <Descriptions.Item label="Cabled ports">{cableCount}</Descriptions.Item>
            <Descriptions.Item label="Inventory items">{myInv.length}</Descriptions.Item>
            <Descriptions.Item label="Tags"><TagChips ids={device.tags} /></Descriptions.Item>
          </Descriptions>
        </VwCard>
        </>
      ),
    },
    { key: 'connections', label: `Connections (${cableCount})`, children: (
      <VwCard size="small" title="Cabling map — click a neighbour to open it, a link to trace the path">
        <DeviceConnections deviceId={device.id} deviceName={device.name} components={myComps} cables={cables}
          deviceNameById={devName} compById={compById} onOpenDevice={(id) => navigate(`/facility/devices/${id}`)} onTrace={(c) => setTrace(c)} />
      </VwCard>
    ) },
    kinds.includes('interface') && { key: 'interfaces', label: `Interfaces (${myComps.filter((c) => c.kind === 'interface').length})`, children: kindCard('interface') },
    { key: 'ipam', label: 'IP addresses', children: <DeviceIpTab deviceId={device.id} deviceName={device.name} /> },
    { key: 'custom', label: 'Tags & fields', children: <EntityCustomizeCard entityType="devices" record={device} /> },
    (powerKinds.length > 0) && { key: 'power', label: 'Power & Console', children: <>{powerKinds.map((k) => kindCard(k))}</> },
    (passKinds.length > 0) && { key: 'pass', label: 'Pass-through', children: <>{passKinds.map((k) => kindCard(k))}</> },
    (moduleBays.length > 0 || deviceBays.length > 0) && { key: 'bays', label: 'Bays & Modules', children: baysCards },
    { key: 'inventory', label: 'Inventory', children: inventoryCard },
    myVdcs.length > 0 && { key: 'vdc', label: `Virtual contexts (${myVdcs.length})`, children: (
      <VwCard size="small" title="Virtual device contexts">
        <Table size="small" rowKey="id" pagination={false} dataSource={myVdcs} scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Identifier', dataIndex: 'identifier', render: (n?: number) => n ?? '—' },
            { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={s === 'active' ? 'green' : s === 'planned' ? 'gold' : 'default'}>{s}</VwChip> },
            { title: 'Primary IPv4', dataIndex: 'primaryIp4', render: (v?: string) => v ?? '—' },
            { title: 'Primary IPv6', dataIndex: 'primaryIp6', render: (v?: string) => v ?? '—' },
          ]} />
      </VwCard>
    ) },
  ].filter(Boolean) as { key: string; label: React.ReactNode; children: React.ReactNode }[];

  return (
    <div>
      <Space className="vw-card-section" style={{ marginBottom: "var(--vw-space-sm)", width: '100%' }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/facility/devices')}>Devices</Button>
        <div className="vw-page-title" role="heading" aria-level={4}>{device.name}</div>
        {type && <VwChip color="blue">{type.manufacturer} {type.model}</VwChip>}
        {type && <VwChip>{type.role}</VwChip>}
        {vc && <VwChip color="gold">VC: {vc.name} (pos {device.vcPosition ?? 0})</VwChip>}
        <Button size="small" icon={<EditOutlined />} onClick={openEditDev}>Edit device</Button>
        <Button size="small" type="primary" onClick={() => navigate(`/ne/${device.id}`)}>Operations view</Button>
        <Button size="small" onClick={() => { setLcState(device.lifecycleState); setLcCr(undefined); setLcOpen(true); }}>Lifecycle…</Button>
        <Button size="small" danger onClick={() => setGate({ title: `Decommission ${device.name}`, run: (cr) => updateDevice.mutate({ id: device.id, data: { lifecycleState: 'Retired', status: 'Inactive' } }, { onSuccess: () => { message.success('Device decommissioned'); recordAudit('Device', device.name, 'decommissioned', `Decommissioned ${device.name} [CR ${cr.ref}]`); } }) })}>Decommission…</Button>
      </Space>

      <Tabs items={tabItems} />

      {/* Edit device modal */}
      <Modal title={`Edit device — ${device.name}`} open={editDev} onOk={saveDevice} okText="Save" onCancel={() => setEditDev(false)} confirmLoading={updateDevice.isPending} width={560}>
        <Form form={devForm} layout="vertical">
          <Space>
            <Form.Item name="serial" label="Serial"><Input placeholder="Enter serial" /></Form.Item>
            <Form.Item name="assetTag" label="Asset tag"><Input placeholder="Enter asset tag" /></Form.Item>
          </Space>
          <Space>
            <Form.Item name="deviceRoleId" label="Role"><Select placeholder="Select role" allowClear style={{ width: 180 }} options={deviceRoles.map((r) => ({ value: r.id, label: r.name }))} /></Form.Item>
            <Form.Item name="platformId" label="Platform"><Select placeholder="Select platform" allowClear style={{ width: 160 }} options={platforms.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item>
          </Space>
          <Space>
            <Form.Item name="position" label="Rack U position"><InputNumber placeholder="Enter rack U position" min={0} max={60} style={{ width: 140 }} /></Form.Item>
            <Form.Item name="face" label="Face"><Select placeholder="Select face" style={{ width: 120 }} options={DEVICE_FACE.map((f) => ({ value: f, label: f }))} /></Form.Item>
            <Form.Item name="airflow" label="Airflow"><Select allowClear style={{ width: 180 }} placeholder="inherit type" options={AIRFLOW.map((a) => ({ value: a, label: a }))} /></Form.Item>
          </Space>
          <Space>
            <Form.Item name="primaryIp4" label="Primary IPv4"><Input placeholder="10.0.0.1" /></Form.Item>
            <Form.Item name="primaryIp6" label="Primary IPv6"><Input placeholder="2001:db8::1" /></Form.Item>
            <Form.Item name="oobIp" label="OOB mgmt IP"><Input placeholder="10.255.0.1" /></Form.Item>
          </Space>
          <Form.Item name="virtualChassisId" label="Virtual chassis"><Select allowClear placeholder="none" options={vchassis.map((v) => ({ value: v.id, label: v.name }))} /></Form.Item>
          <Space>
            <Form.Item name="vcPosition" label="VC position"><InputNumber placeholder="Enter VC position" min={0} style={{ width: 120 }} /></Form.Item>
            <Form.Item name="vcPriority" label="VC priority"><InputNumber placeholder="Enter VC priority" min={0} style={{ width: 120 }} /></Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* Install child device modal */}
      <Modal title={`Install device — ${device.name} : ${installChildBay ?? ''}`} open={!!installChildBay} onOk={installChild} okText="Install" okButtonProps={{ disabled: !childDeviceId }} onCancel={() => setInstallChildBay(null)} confirmLoading={updateDevice.isPending}>
        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Assign an existing childless device into this bay.</Text>
        <Select style={{ width: '100%', marginTop: 10 }} showSearch optionFilterProp="label" placeholder="Select a device" value={childDeviceId} onChange={setChildDeviceId}
          options={childlessDevices.map((d) => ({ value: d.id, label: d.name }))} />
      </Modal>

      {/* Add inventory item modal */}
      <Modal title="Add inventory item" open={invOpen} onOk={addInventory} okText="Add" onCancel={() => setInvOpen(false)} confirmLoading={createInv.isPending}>
        <Form form={invForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="PSU 1" /></Form.Item>
          <Form.Item name="roleId" label="Role"><Select placeholder="Select role" allowClear options={invRoles.map((r) => ({ value: r.id, label: r.name }))} /></Form.Item>
          <Space>
            <Form.Item name="manufacturer" label="Manufacturer"><Input placeholder="Enter manufacturer" /></Form.Item>
            <Form.Item name="partNumber" label="Part number"><Input placeholder="Enter part number" /></Form.Item>
          </Space>
          <Form.Item name="serial" label="Serial"><Input placeholder="Enter serial" /></Form.Item>
        </Form>
      </Modal>

      {/* Install module modal */}
      <Modal title={`Install module — ${device.name} : ${installBay ?? ''}`} open={!!installBay} onOk={installModule} okText="Install module" okButtonProps={{ disabled: !moduleTypeId }} onCancel={() => setInstallBay(null)} confirmLoading={createModule.isPending}>
        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>The module type's component templates are materialized into this device.</Text>
        <Select style={{ width: '100%', marginTop: 10 }} placeholder="Select module type" value={moduleTypeId} onChange={setModuleTypeId}
          options={moduleTypes.map((m) => ({ value: m.id, label: `${m.manufacturer} ${m.model}` }))} />
      </Modal>

      {/* Edit interface modal */}
      <Modal title={editIface ? `Edit interface — ${device.name} : ${editIface.name}` : ''} open={!!editIface} onOk={saveIface} okText="Save" onCancel={() => setEditIface(null)} confirmLoading={updateComp.isPending}>
        <Form form={ifaceForm} layout="vertical">
          <Form.Item name="enabled" label="Enabled" valuePropName="checked"><Switch /></Form.Item>
          <Space>
            <Form.Item name="speedMbps" label="Speed (Mbps)"><InputNumber placeholder="Enter speed (Mbps)" min={0} style={{ width: 130 }} /></Form.Item>
            <Form.Item name="duplex" label="Duplex"><Select placeholder="Select duplex" style={{ width: 110 }} options={IF_DUPLEX.map((d) => ({ value: d, label: d }))} /></Form.Item>
            <Form.Item name="mtu" label="MTU"><InputNumber placeholder="Enter MTU" min={0} style={{ width: 110 }} /></Form.Item>
          </Space>
          <Form.Item name="macAddress" label="MAC address"><Input placeholder="00:1B:..." /></Form.Item>
          <Form.Item name="mode" label="802.1Q mode"><Select placeholder="Select 802.1Q mode" options={IF_MODE.map((m) => ({ value: m, label: m }))} /></Form.Item>
          <Form.Item name="untaggedVlanId" label="Untagged VLAN"><Select allowClear showSearch optionFilterProp="label" placeholder="none" options={vlans.map((v) => ({ value: v.id, label: `VLAN ${v.vlanNumber} · ${v.name}` }))} /></Form.Item>
        </Form>
      </Modal>

      <ChangeRefModal open={!!gate} title={gate?.title ?? ''} onCancel={() => setGate(null)} onConfirm={(cr) => { gate?.run(cr); setGate(null); }} />

      {/* Lifecycle change modal (target state + authorizing CR) */}
      <Modal title={`Change lifecycle — ${device.name}`} open={lcOpen} okText="Apply change"
        okButtonProps={{ disabled: !lcState || !lcCr }} confirmLoading={updateDevice.isPending} onCancel={() => setLcOpen(false)}
        onOk={() => updateDevice.mutate({ id: device.id, data: { lifecycleState: lcState } }, { onSuccess: () => { message.success(`Lifecycle set to ${lcState}`); recordAudit('Device', device.name, 'lifecycle', `${device.name} → ${lcState} [CR ${crRef(lcCr)}]`); setLcOpen(false); } })}>
        <Form layout="vertical">
          <Form.Item label="Target lifecycle" required><Select placeholder="Select target lifecycle" value={lcState} onChange={setLcState} options={ASSET_LIFECYCLE.map((l) => ({ value: l, label: l }))} /></Form.Item>
          <Form.Item label="Authorizing change request" required><ChangeRefSelect value={lcCr} onChange={setLcCr} /></Form.Item>
        </Form>
      </Modal>

      {/* Connect modal */}
      <Modal title={connectFrom ? `Connect ${device.name} : ${connectFrom.name}` : ''} open={!!connectFrom} onOk={doConnect} okText="Connect cable" okButtonProps={{ disabled: !targetPort || !connectCr }} onCancel={() => { setConnectFrom(null); setConnectCr(undefined); }} confirmLoading={createCable.isPending}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Target device</Text>
            <Select style={{ width: '100%' }} placeholder="Select device" value={targetDev}
              onChange={(v) => { setTargetDev(v); setTargetPort(undefined); }}
              options={devices.filter((d) => d.id !== device.id).map((d) => ({ value: d.id, label: d.name }))} />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Target free port</Text>
            <Select style={{ width: '100%' }} placeholder={targetDev ? 'Select free port' : 'Pick a device first'} disabled={!targetDev} value={targetPort}
              onChange={setTargetPort}
              options={(targetDev ? freePortsOf(targetDev) : []).map((p) => ({ value: p.id, label: `${p.name} · ${p.kind}` }))} />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Authorizing change request (required)</Text>
            <ChangeRefSelect value={connectCr} onChange={setConnectCr} />
          </div>
        </Space>
      </Modal>

      {/* Trace drawer */}
      <Drawer mask={false} title={trace ? `Trace from ${device.name} : ${trace.name}` : ''} open={!!trace} onClose={() => setTrace(null)} width={520}>
        {trace && (() => {
          const hops = traceFrom(trace.id, { devices, components, cables });
          return (
            <Steps direction="vertical" size="small" current={hops.length}
              items={hops.map((h) => ({
                title: `${h.deviceName} : ${h.component}`,
                description: <span><VwChip>{h.kind}</VwChip>{h.via === 'pass-through' ? <VwChip color="purple">pass-through</VwChip> : h.cableType ? <VwChip color="blue">{h.cableType}</VwChip> : null}</span>,
              }))} />
          );
        })()}
      </Drawer>
    </div>
  );
}
