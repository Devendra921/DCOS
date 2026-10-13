import { Progress, Row, Col } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { FireOutlined, DashboardOutlined, ThunderboltOutlined, ClusterOutlined } from '../../../shared/icons';
import { useNavigate } from 'react-router-dom';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { useCapacity } from '../lib/useCapacity';
import { KPICard } from '../../../shared/components/KPICard';
import type { CoolingZone, CRAC } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

export default function CoolingCapacityPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const zones = (useEntityList('coolingZones', { pageSize: 200, filters: dcF }).data?.data ?? []) as unknown as CoolingZone[];
  const cracs = (useEntityList('cracUnits', { pageSize: 300 }).data?.data ?? []) as unknown as CRAC[];
  const model = useCapacity();
  const cap = model.cooling.max, load = model.cooling.used;
  return (
    <div style={{ padding: embedded ? 0 : 24 }}>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-md)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div className="vw-page-title" role="heading" aria-level={embedded ? 4 : 3}>Cooling Capacity</div>
        {!embedded && <Button type="primary" onClick={() => navigate(`/planning/new?intent=${encodeURIComponent(`Upgrade the chillers to add ${Math.round(load * 0.2)} kW of cooling capacity`)}`)}>Raise capacity plan</Button>}
      </div>
      <Row gutter={[16, 16]} style={{ marginBottom: "var(--vw-space-lg)" }}>
        <Col xs={12} md={6}><KPICard title="Cooling Capacity" value={Math.round(cap)} suffix=" kW" icon={<FireOutlined />} iconTone="cyan" /></Col>
        <Col xs={12} md={6}><KPICard title="Current Load" value={Math.round(load)} suffix=" kW" icon={<DashboardOutlined />} iconTone="info" /></Col>
        <Col xs={12} md={6}><KPICard title="Headroom" value={Math.round(cap - load)} suffix=" kW" icon={<ThunderboltOutlined />} iconTone="success" /></Col>
        <Col xs={12} md={6}><KPICard title="CRAC/CRAH Units" value={cracs.length} icon={<ClusterOutlined />} iconTone="purple" /></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}><VwCard size="small" title="Cooling zones" style={{ height: '100%' }}>
          <Table<CoolingZone> size="small" rowKey="id" dataSource={zones} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }}
            columns={[{ title: 'Zone', dataIndex: 'name' }, { title: 'Capacity', dataIndex: 'coolingCapacityKw', render: (v) => `${v} kW` }, { title: 'Load', render: (_, z) => <Progress percent={z.coolingCapacityKw ? Math.round((z.currentLoadKw / z.coolingCapacityKw) * 100) : 0} size="small" /> }, { title: 'Setpoint', dataIndex: 'setpointC', render: (v) => `${v}°C` }]} />
        </VwCard></Col>
        <Col xs={24} lg={12}><VwCard size="small" title="CRAC / CRAH / CDU units" style={{ height: '100%' }}>
          <Table<CRAC> size="small" rowKey="id" dataSource={cracs} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }}
            columns={[{ title: 'Unit', dataIndex: 'name' }, { title: 'Type', dataIndex: 'type', render: (t) => <VwChip color={t === 'CDU' ? 'cyan' : 'default'}>{t}</VwChip> }, { title: 'Supply', dataIndex: 'supplyTempC', render: (v) => `${v}°C` }, { title: 'Return', dataIndex: 'returnTempC', render: (v) => `${v}°C` }, { title: 'Status', dataIndex: 'status', render: (s) => <VwChip>{s}</VwChip> }]} />
        </VwCard></Col>
      </Row>
    </div>
  );
}
