import { useMemo, useState } from 'react';
import { Progress, Row, Col, Input } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { SearchOutlined, ApartmentOutlined, DashboardOutlined, HomeOutlined, DatabaseOutlined } from '../../../shared/icons';
import { useNavigate } from 'react-router-dom';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { useCapacity } from '../lib/useCapacity';
import { KPICard } from '../../../shared/components/KPICard';
import type { Hall, Rack } from '../../../mock/data/types';
import { VwCard } from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

export default function SpaceCapacityPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const halls = (useEntityList('halls', { pageSize: 300, filters: dcF }).data?.data ?? []) as unknown as Hall[];
  const racks = (useEntityList('racks', { pageSize: 10000, filters: dcF }).data?.data ?? []) as unknown as Rack[];
  const model = useCapacity();
  const uUsed = model.space.used, uMax = model.space.max;
  const [q, setQ] = useState('');
  const hallRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...halls].filter((h) => !s || h.name.toLowerCase().includes(s)).sort((a, b) => b.utilizationPct - a.utilizationPct);
  }, [halls, q]);
  return (
    <div style={{ padding: embedded ? 0 : 24 }}>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={embedded ? 4 : 3} style={{ marginBottom: "var(--vw-space-md)" }}>Space Capacity</div>
      <Row gutter={[16, 16]} style={{ marginBottom: "var(--vw-space-lg)" }}>
        <Col xs={12} md={6}><KPICard title="Racks" value={racks.length} icon={<ApartmentOutlined />} iconTone="info" /></Col>
        <Col xs={12} md={6}><KPICard title="U Utilization" value={uMax ? Math.round((uUsed / uMax) * 100) : 0} suffix="%" icon={<DashboardOutlined />} iconTone="cyan" /></Col>
        <Col xs={12} md={6}><KPICard title="Halls" value={halls.length} icon={<HomeOutlined />} iconTone="info" /></Col>
        <Col xs={12} md={6}><KPICard title="Free U" value={uMax - uUsed} icon={<DatabaseOutlined />} iconTone="success" /></Col>
      </Row>
      <VwCard size="small" title="Halls by utilization"
        extra={<Input allowClear size="small" prefix={<SearchOutlined />} placeholder="Filter halls…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />}>
        <Table<Hall> size="small" rowKey="id" dataSource={hallRows} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }}
          onRow={(h) => ({ onClick: () => navigate(`/facility/hall/${h.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Hall', dataIndex: 'name' },
            { title: 'Grid', render: (_, h) => `${h.gridCols}×${h.gridRows}` },
            { title: 'Racks', render: (_, h) => `${h.rackCount}/${h.rackCapacity}` },
            { title: 'Utilization', dataIndex: 'utilizationPct', render: (v: number) => <Progress percent={v} size="small" status={v >= 85 ? 'exception' : 'normal'} /> },
          ]} />
      </VwCard>
    </div>
  );
}
