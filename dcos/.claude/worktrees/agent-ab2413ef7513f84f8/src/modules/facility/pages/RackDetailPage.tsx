import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Row, Col, Descriptions, Tabs, Progress, Empty, Space, Typography, Drawer } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ArrowLeftOutlined, ApiOutlined, ColumnHeightOutlined, ThunderboltOutlined, DashboardOutlined, FireOutlined } from '../../../shared/icons';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';
import { useEntityDetail, useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import RackElevation from '../components/RackElevation';
import RackFormModal from '../components/RackFormModal';
import { DeviceFaceplate } from '../../dcim/components/DeviceFaceplate';
import { ChangeRefModal } from '../../change';
import { EntityAuditTab, EntityDocumentsTab } from '../../../shared/components/detail';
import type { Rack, Device, RackReservation, DeviceComponent, Cable } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';
import type { ApprovedCR } from '../../change';

export default function RackDetailPage() {
  const { rackId } = useParams();
  const navigate = useNavigate();
  const { data: rack } = useEntityDetail('racks', rackId);
  const { data: assetRes } = useEntityList('devices', { filters: [{ field: 'rackId', operator: 'eq', value: rackId }], pageSize: 500 });
  const r = rack as unknown as Rack | null;
  const devices = (assetRes?.data ?? []) as unknown as Device[];
  const { data: rsvnRes } = useEntityList('rackReservations', { filters: [{ field: 'rackId', operator: 'eq', value: rackId }], pageSize: 200 });
  const reservations = (rsvnRes?.data ?? []) as unknown as RackReservation[];
  // For the device peek drawer: components + cables + a name map across all devices.
  const allDevices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const components = (useEntityList('deviceComponents', { pageSize: 6000 }).data?.data ?? []) as unknown as DeviceComponent[];
  const cables = (useEntityList('cables', { pageSize: 3000 }).data?.data ?? []) as unknown as Cable[];
  const [peekId, setPeekId] = useState<string | null>(null);
  // RackElevation + table read `startU`/`heightU`; Device stores rack position in `position`.
  const assets = devices.map((d) => ({ ...d, startU: d.position, heightU: d.heightU ?? 1 }));
  const { message } = App.useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [gate, setGate] = useState<{ title: string; run: (cr: ApprovedCR) => void } | null>(null);
  const updateRack = useEntityUpdate('racks');
  const updateDevice = useEntityUpdate('devices');
  const audit = useRecordAudit();
  const overlaps = (s1: number, e1: number, s2: number, e2: number) => s1 <= e2 && s2 <= e1;
  const onMoveAsset = (assetId: string, newStartU: number) => {
    const a = assets.find((x) => x.id === assetId);
    if (!a || !r) return;
    const h = a.heightU ?? 1;
    const end = newStartU + h - 1;
    if (newStartU < 1 || end > r.heightU) { message.error('Move is outside the rack bounds'); return; }
    const clash = assets.some((o) => o.id !== assetId && o.startU != null && overlaps(newStartU, end, o.startU, o.startU + (o.heightU ?? 1) - 1));
    if (clash) { message.error('Those U-slots are occupied'); return; }
    if (newStartU === a.startU) return;
    const label = a.hostname ?? a.model ?? a.name;
    setGate({ title: `Relocate ${label} → U${newStartU}`, run: (cr) => updateDevice.mutate({ id: assetId, data: { position: newStartU } }, { onSuccess: () => { message.success(`Moved ${label} to U${newStartU}`); audit('Device', assetId, 'relocated', `Moved ${label} to U${newStartU} [CR ${cr.ref}]`); } }) });
  };

  if (!r) return <div><Empty description="Rack not found" /></div>;

  const peek = peekId ? allDevices.find((d) => d.id === peekId) : null;
  const peekComps = peek ? components.filter((c) => c.deviceId === peek.id) : [];
  const cableOf = (cid: string) => cables.find((c) => c.aComponentId === cid || c.bComponentId === cid);
  const peerLabel = (cid: string) => {
    const cb = cableOf(cid); if (!cb) return undefined;
    const pid = cb.aComponentId === cid ? cb.bComponentId : cb.aComponentId;
    const p = components.find((c) => c.id === pid);
    return p ? `${allDevices.find((d) => d.id === p.deviceId)?.name ?? '?'} : ${p.name}` : undefined;
  };

  return (
    <div>
      <Space className="vw-card-section" style={{ marginBottom: "var(--vw-space-md)", width: '100%' }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/facility/racks')}>Racks</Button>
        <div className="vw-page-title" role="heading" aria-level={3}>{r.name}</div>
        <VwChip color={r.purpose === 'GPU' ? 'purple' : 'blue'}>{r.purpose}</VwChip>
        <VwChip>{r.status}</VwChip>
        {r.liquidCoolingReady && <VwChip color="cyan">Liquid-cooling ready</VwChip>}
        <Button size="small" onClick={() => setEditOpen(true)}>Edit</Button>
        {r.status !== 'Retired' && <Button size="small" danger onClick={() => setGate({ title: `Retire rack ${r.name}`, run: (cr) => updateRack.mutate({ id: r.id, data: { status: 'Retired' } }, { onSuccess: () => { message.success('Rack retired'); audit('Rack', r.rackId, 'retired', `Retired ${r.name} [CR ${cr.ref}]`); } }) })}>Retire</Button>}
      </Space>
      <RackFormModal open={editOpen} onClose={() => setEditOpen(false)} rack={r} />

      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <KPICard title="U utilization" value={pct(r.usedU, r.heightU)} suffix={`%  ·  ${r.usedU}/${r.heightU}U`} icon={<ColumnHeightOutlined />} iconTone="info" />
        <KPICard title="Power" value={r.powerUtilizationPct} suffix={`%  ·  ${r.currentPowerKw}/${r.maxPowerKw} kW`} icon={<ThunderboltOutlined />} iconTone="cyan" />
        <KPICard title="Weight" value={Math.round((r.currentWeightKg / r.maxWeightKg) * 100)} suffix={`%  ·  ${r.currentWeightKg}/${r.maxWeightKg} kg`} icon={<DashboardOutlined />} iconTone="purple" />
        <KPICard title="Thermal" value={r.thermalDensityKwPerRack} suffix={`kW  ·  ${r.redundancy} redundancy`} icon={<FireOutlined />} iconTone="orange" />
      </div>

      <Row gutter={[16, 16]}>
        <Col flex="320px">
          <VwCard title="Rack Elevation" size="small" extra={<span className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)" }}>drag to move · click to open</span>}>
            <RackElevation rack={r} assets={assets} onMoveAsset={onMoveAsset} onOpenDevice={setPeekId} />
          </VwCard>
        </Col>
        <Col flex="auto">
          <VwCard size="small">
            <Tabs
              items={[
                {
                  key: 'assets', label: `Assets (${assets.length})`,
                  children: (
                    <Table<(typeof assets)[number]> size="small" rowKey="id" dataSource={assets} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 400, x: 'max-content' }}
                      columns={[
                        { title: 'U', dataIndex: 'startU', width: 60, sorter: (a, b) => (a.startU ?? 0) - (b.startU ?? 0), defaultSortOrder: 'ascend' },
                        { title: 'Hostname', dataIndex: 'hostname' },
                        { title: 'Category', dataIndex: 'category', render: (c: string) => <VwChip>{c}</VwChip> },
                        { title: 'Model', dataIndex: 'model' },
                        { title: 'Power (W)', dataIndex: 'powerDrawW', align: 'right' },
                        { title: 'Lifecycle', dataIndex: 'lifecycleState' },
                      ]} />
                  ),
                },
                {
                  key: 'power', label: 'Power & Cooling',
                  children: (
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="Power budget">{r.maxPowerKw} kW</Descriptions.Item>
                      <Descriptions.Item label="Current draw">{r.currentPowerKw} kW</Descriptions.Item>
                      <Descriptions.Item label="Utilization"><Progress percent={r.powerUtilizationPct} size="small" /></Descriptions.Item>
                      <Descriptions.Item label="Redundancy">{r.redundancy}</Descriptions.Item>
                      <Descriptions.Item label="Thermal density">{r.thermalDensityKwPerRack} kW</Descriptions.Item>
                      <Descriptions.Item label="Liquid cooling">{r.liquidCoolingReady ? 'Ready' : 'No'}</Descriptions.Item>
                      <Descriptions.Item label="Rail width">{r.widthIn ? `${r.widthIn}"` : '—'}</Descriptions.Item>
                      <Descriptions.Item label="Unit numbering">{r.descendingUnits ? 'Descending' : 'Ascending'}{r.startingUnit ? ` · from U${r.startingUnit}` : ''}</Descriptions.Item>
                      <Descriptions.Item label="Outer (W×D)">{r.outerWidthMm && r.outerDepthMm ? `${r.outerWidthMm}×${r.outerDepthMm} mm` : '—'}</Descriptions.Item>
                      <Descriptions.Item label="Mounting depth">{r.mountingDepthMm ? `${r.mountingDepthMm} mm` : '—'}</Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'reservations', label: `Reservations (${reservations.length})`,
                  children: reservations.length === 0 ? <Empty description="No U-space reservations on this rack" /> : (
                    <Table<RackReservation> size="small" rowKey="id" dataSource={reservations} pagination={false} scroll={{ x: 'max-content' }}
                      columns={[
                        { title: 'Units', dataIndex: 'units', render: (u: number[]) => u && u.length ? `U${Math.min(...u)}–U${Math.max(...u)} (${u.length}U)` : '—' },
                        { title: 'Reserved by', dataIndex: 'reservedBy' },
                        { title: 'Tenant', dataIndex: 'tenant', render: (t?: string) => t ?? '—' },
                        { title: 'Description', dataIndex: 'description', render: (d?: string) => d ?? '—' },
                        { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={s === 'Active' ? 'gold' : 'default'}>{s}</VwChip> },
                      ]} />
                  ),
                },
                { key: 'activity', label: 'Activity', children: <EntityAuditTab entityType="Rack" entityId={r.rackId} /> },
                { key: 'docs', label: 'Documents', children: <EntityDocumentsTab entityId={r.id} /> },
              ]}
            />
          </VwCard>
        </Col>
      </Row>

      <Drawer mask={false}
        width={460}
        open={!!peek}
        onClose={() => setPeekId(null)}
        title={peek ? peek.name : ''}
        extra={peek && <Button type="primary" size="small" icon={<ApiOutlined />} onClick={() => navigate(`/facility/devices/${peek.id}`)}>Open full device page</Button>}
      >
        {peek && (
          <>
            <Space wrap style={{ marginBottom: "var(--vw-space-md)" }}>
              {peek.category && <VwChip>{peek.category}</VwChip>}
              {peek.model && <VwChip color="blue">{peek.model}</VwChip>}
              <VwChip>{peek.status}</VwChip>
              {peek.position != null && <VwChip>U{peek.position}</VwChip>}
            </Space>
            <Descriptions column={1} size="small" style={{ marginBottom: "var(--vw-space-md)" }}>
              <Descriptions.Item label="Serial">{peek.serial ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Primary IPv4">{peek.primaryIp4 ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Power draw">{peek.powerDrawW != null ? `${peek.powerDrawW} W` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Lifecycle">{peek.lifecycleState ?? '—'}</Descriptions.Item>
            </Descriptions>
            <Typography.Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>Faceplate</Typography.Text>
            <div style={{ marginTop: "var(--vw-space-sm)" }}>
              <DeviceFaceplate components={peekComps} isCabled={(id) => !!cableOf(id)} peerLabel={peerLabel} compact
                onPort={() => navigate(`/facility/devices/${peek.id}`)} />
            </div>
          </>
        )}
      </Drawer>

      <ChangeRefModal open={!!gate} title={gate?.title ?? ''} onCancel={() => setGate(null)} onConfirm={(cr) => { gate?.run(cr); setGate(null); }} />
    </div>
  );
}
function pct(used: number, total: number) { return total > 0 ? Math.round((used / total) * 100) : 0; }
