import { useState } from 'react';
import { App, Space, Modal, Form, Input, Select, InputNumber, Empty, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import type { TableColumnType } from 'antd';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import { useEntityUpdate, useEntityCreate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { RESOURCE_TYPE } from '../../../mock/data/enums';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { STATE_COLORS } from '../components/StateBar';
import type { CapacityReservation, Rack, Subnet, VLAN, RackReservation } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const tagColor: Record<string, string> = { Available: 'green', Reserved: 'blue', Committed: 'gold', Consumed: 'purple' };

export default function ReservationLedgerPage({ embedded = false }: { embedded?: boolean }) {
  const { message } = App.useApp();
  const update = useEntityUpdate('capacityReservations');
  const create = useEntityCreate('capacityReservations');
  const audit = useRecordAudit();
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const subnets = (useEntityList('subnets', { pageSize: 1000 }).data?.data ?? []) as unknown as Subnet[];
  const vlans = (useEntityList('vlans', { pageSize: 1000 }).data?.data ?? []) as unknown as VLAN[];
  const rackRsvns = (useEntityList('rackReservations', { pageSize: 1000 }).data?.data ?? []) as unknown as RackReservation[];
  const rackName = (id?: string) => racks.find((r) => r.id === id)?.name ?? id ?? '—';
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const resourceType = Form.useWatch('resourceType', form);

  const resourceOptions = () => {
    if (resourceType === 'Rack') return racks.slice(0, 500).map((r) => ({ value: r.id, label: r.name }));
    if (resourceType === 'Subnet') return subnets.map((s) => ({ value: s.id, label: `${s.cidr} · ${s.name}` }));
    if (resourceType === 'VLAN') return vlans.map((v) => ({ value: v.id, label: `VLAN ${v.vlanNumber} · ${v.name}` }));
    return null; // PowerChain / Cooling / Asset → free text
  };

  const submitNew = async () => {
    const v = await form.validateFields();
    const id = `RSV-NEW-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();
    create.mutate({ id, rsvId: id, resourceType: v.resourceType, resourceId: v.resourceId, state: 'Reserved', quantity: v.quantity, unit: v.unit, status: 'Active', customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' },
      { onSuccess: () => { message.success('Reservation created'); audit('CapacityReservation', id, 'Reserved', `Reserved ${v.quantity} ${v.unit}`); setOpen(false); form.resetFields(); } });
  };
  const setState = (r: CapacityReservation, state: string) =>
    update.mutate({ id: r.id, data: { state } }, { onSuccess: () => { message.success(`${r.rsvId} → ${state}`); audit('CapacityReservation', r.rsvId, state, `Reservation ${state}`); } });

  const columns: TableColumnType<CapacityReservation>[] = [
    { title: 'ID', dataIndex: 'rsvId' },
    { title: 'Resource', dataIndex: 'resourceType', render: (t: string, r) => <span>{t} · <small className="vw-text-tertiary">{t === 'Rack' ? rackName(r.resourceId) : r.resourceId}</small></span> },
    { title: 'State', dataIndex: 'state', render: (s: string) => <VwChip color={tagColor[s]}>{s}</VwChip> },
    { title: 'Quantity', dataIndex: 'quantity', align: 'right', render: (q: number, r) => `${q} ${r.unit}` },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip>{s}</VwChip> },
  ];

  const opts = resourceOptions();

  return (
    <div style={{ padding: embedded ? 0 : 24 }}>
      <EntityListPage<CapacityReservation>
        title="Capacity Reservations (pool)"
        entityType="capacityReservations"
        columns={columns}
        createButtonLabel="New reservation"
        onCreateClick={() => { form.resetFields(); setOpen(true); }}
        searchPlaceholder="Search reservations..."
        maxBodyHeight={360}
        tabs={[
          { key: 'all', label: 'All' },
          ...['Available', 'Reserved', 'Committed', 'Consumed'].map((s) => ({ key: s, label: s, filters: [{ field: 'state', operator: 'eq' as const, value: s }] })),
        ]}
        rowActions={(r) => (
          <Space>
            {r.state === 'Reserved' && <Button size="small" onClick={() => setState(r, 'Committed')}>Commit</Button>}
            {r.state !== 'Consumed' && <Button size="small" danger onClick={() => setState(r, 'Available')}>Release</Button>}
          </Space>
        )}
      />
      <p className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)", marginTop: "var(--vw-space-sm)" }}>
        This is the <strong>abstract capacity pool</strong> (kW / U / addresses), state flow {Object.keys(STATE_COLORS).join(' → ')}. Physical per-U holds on a specific rack live in the rack’s own Reservations tab and are summarised below.
      </p>

      <VwCard size="small" title={`Physical rack-U reservations (${rackRsvns.length})`} style={{ marginTop: "var(--vw-space-lg)" }}>
        {rackRsvns.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No physical rack-U holds" /> : (
          <VwCard variant="child" bodyStyle={{ padding: 0 }}>
            <Table<RackReservation> size="small" rowKey="id" dataSource={rackRsvns} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content', y: 320 }}
              columns={[
                { title: 'Rack', dataIndex: 'rackId', render: (id: string) => rackName(id) },
                { title: 'Units', dataIndex: 'units', render: (u: number[]) => u && u.length ? `U${Math.min(...u)}–U${Math.max(...u)} (${u.length}U)` : '—' },
                { title: 'Reserved by', dataIndex: 'reservedBy' },
                { title: 'Tenant', dataIndex: 'tenant', render: (t?: string) => t ?? '—' },
                { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={s === 'Active' ? 'gold' : 'default'}>{s}</VwChip> },
              ]} />
          </VwCard>
        )}
        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Physical holds are created from a rack’s Reservations tab; this is a read-only roll-up.</Text>
      </VwCard>

      <Modal title="New reservation" open={open} onOk={submitNew} onCancel={() => setOpen(false)} okText="Reserve" destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ resourceType: 'Rack', unit: 'U', quantity: 4 }}>
          <Form.Item name="resourceType" label="Resource type"><Select placeholder="Select resource type" options={RESOURCE_TYPE.map((t) => ({ value: t, label: t }))} onChange={() => form.setFieldValue('resourceId', undefined)} /></Form.Item>
          <Form.Item name="resourceId" label="Resource" rules={[{ required: true }]}>
            {opts ? <Select showSearch optionFilterProp="label" placeholder={`Select a ${resourceType}`} options={opts} /> : <Input placeholder="Resource identifier" />}
          </Form.Item>
          <Form.Item name="quantity" label="Quantity"><InputNumber placeholder="Enter quantity" min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="unit" label="Unit"><Input placeholder="U / kW / addresses" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
