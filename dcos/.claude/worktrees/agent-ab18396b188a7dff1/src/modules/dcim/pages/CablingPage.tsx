import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Spin } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { SearchOutlined, ApiOutlined, CheckCircleOutlined, ClockCircleOutlined, GroupOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import type { Device, DeviceComponent, Cable, CableBundle } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const statusColor: Record<string, string> = { Active: 'green', Planned: 'gold', Decommissioning: 'red' };

export default function CablingPage() {
  const navigate = useNavigate();
  const devices = (useEntityList('devices', { pageSize: 500 }).data?.data ?? []) as unknown as Device[];
  const components = (useEntityList('deviceComponents', { pageSize: 20000 }).data?.data ?? []) as unknown as DeviceComponent[];
  const cables = (useEntityList('cables', { pageSize: 2000 }).data?.data ?? []) as unknown as Cable[];
  const bundles = (useEntityList('cableBundles', { pageSize: 200 }).data?.data ?? []) as unknown as CableBundle[];

  const devName = (id: string) => devices.find((d) => d.id === id)?.name ?? '?';
  const compName = (id: string) => components.find((c) => c.id === id)?.name ?? '?';
  const bundleName = (id?: string) => bundles.find((b) => b.id === id)?.name;

  const [q, setQ] = useState('');
  const rows = useMemo(() => cables.map((c) => ({
    ...c,
    a: `${devName(c.aDeviceId)} : ${compName(c.aComponentId)}`,
    b: `${devName(c.bDeviceId)} : ${compName(c.bComponentId)}`,
  })), [cables, devices, components]);
  type Row = (typeof rows)[number];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => `${r.a} ${r.b} ${r.cableType} ${r.status}`.toLowerCase().includes(s)) : rows;
  }, [rows, q]);
  const { visible, hasMore, sentinelRef, total } = useScrollReveal(filtered, 25, q);

  const cols: TableColumnType<Row>[] = [
    { title: 'A side', dataIndex: 'a', render: (v: string, r) => <a onClick={() => navigate(`/facility/devices/${r.aDeviceId}`)}>{v}</a> },
    { title: '', render: () => '↔', width: 30, align: 'center' },
    { title: 'B side', dataIndex: 'b', render: (v: string, r) => <a onClick={() => navigate(`/facility/devices/${r.bDeviceId}`)}>{v}</a> },
    { title: 'Type', dataIndex: 'cableType', render: (t: string) => <VwChip>{t}</VwChip> },
    { title: 'Bundle', dataIndex: 'bundleId', render: (id?: string) => id ? <VwChip color="purple">{bundleName(id) ?? 'bundle'}</VwChip> : '—' },
    { title: 'Length', dataIndex: 'lengthM', align: 'right', render: (m?: number) => m ? `${m} m` : '—' },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={statusColor[s]}>{s}</VwChip> },
  ];

  return (
    <div>
      <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md" style={{ margin: '12px 0' }}>
        <KPICard title="Cables" value={cables.length} icon={<ApiOutlined />} iconTone="info" />
        <KPICard title="Active" value={cables.filter((c) => c.status === 'Active').length} icon={<CheckCircleOutlined />} iconTone="success" />
        <KPICard title="Planned" value={cables.filter((c) => c.status === 'Planned').length} icon={<ClockCircleOutlined />} iconTone="warning" />
        <KPICard title="Bundles" value={bundles.length} icon={<GroupOutlined />} iconTone="purple" />
      </div>
      <Input allowClear prefix={<SearchOutlined />} placeholder="Search by device, port, type, status…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 340, marginBottom: "var(--vw-space-md)" }} />
      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
        Showing {visible.length} of {total} cables
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Table<Row> rowKey="id" size="small" dataSource={visible} columns={cols} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }} locale={{ emptyText: 'No cables match.' }} />
        {visible.length > 0 && hasMore && (
          <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>
    </div>
  );
}
