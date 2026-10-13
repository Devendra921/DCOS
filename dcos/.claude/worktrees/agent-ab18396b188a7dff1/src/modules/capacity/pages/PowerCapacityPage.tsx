import { useMemo, useState } from 'react';
import { Row, Col, Progress, Input } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { SearchOutlined, ThunderboltOutlined, DashboardOutlined, WarningOutlined } from '../../../shared/icons';
import { useNavigate } from 'react-router-dom';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { useCapacity } from '../lib/useCapacity';
import { KPICard } from '../../../shared/components/KPICard';
import type { UtilityFeed, UPS, PDU, Rack, DataCenter } from '../../../mock/data/types';
import { capacityThresholds } from '../../../mock/data/dcTypes';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function PowerCapacityPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const feeds = (useEntityList('utilityFeeds', { pageSize: 200, filters: dcF }).data?.data ?? []) as unknown as UtilityFeed[];
  const ups = (useEntityList('upsUnits', { pageSize: 200, filters: dcF }).data?.data ?? []) as unknown as UPS[];
  const pdus = (useEntityList('pdus', { pageSize: 2000 }).data?.data ?? []) as unknown as PDU[];
  const racks = (useEntityList('racks', { pageSize: 10000, filters: dcF }).data?.data ?? []) as unknown as Rack[];
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const cap = useCapacity();
  /** Warning band for a rack = its site's facility-type threshold (85% enterprise, 80% colo / telco, 90% hyperscale / GPU). */
  const warnPct = (r: Rack) => capacityThresholds(dcs.find((d) => d.id === r.dataCenterId)?.dcTypeKey).rackPowerWarnPct;
  const utilOf = (id: string) => cap.perRack[id]?.utilPct ?? 0;
  const drawOf = (id: string) => cap.perRack[id]?.usedKw ?? 0;

  const [q, setQ] = useState('');
  const overBudget = useMemo(() => {
    const s = q.trim().toLowerCase();
    return racks.filter((r) => utilOf(r.id) >= warnPct(r) && (!s || `${r.name} ${r.purpose}`.toLowerCase().includes(s)))
      .sort((a, b) => utilOf(b.id) - utilOf(a.id));
  }, [racks, q, cap, dcs]);
  const pduRows = useMemo(() => [...pdus].sort((a, b) => b.loadPct - a.loadPct), [pdus]);
  const loadBar = (v: number) => <Progress percent={Math.round(v)} size="small" status={v >= 85 ? 'exception' : 'normal'} />;

  return (
    <div style={{ padding: embedded ? 0 : 24 }}>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-md)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div className="vw-page-title" role="heading" aria-level={embedded ? 4 : 3}>Power Capacity</div>
        <Button type="primary" onClick={() => navigate(`/planning/new?intent=${encodeURIComponent(`Expand power capacity by ${Math.round(cap.power.used * 0.2)} kW with a plant upgrade`)}`)}>Raise capacity plan</Button>
      </div>
      <Row gutter={[16, 16]} style={{ marginBottom: "var(--vw-space-lg)" }}>
        <Col xs={12} md={6}><KPICard title="Feed Capacity" value={Math.round(sum(feeds.map((f) => f.capacityKw)))} suffix=" kW" icon={<ThunderboltOutlined />} iconTone="info" /></Col>
        <Col xs={12} md={6}><KPICard title="UPS Load (avg)" value={ups.length ? Math.round(sum(ups.map((u) => u.loadPct)) / ups.length) : 0} suffix="%" icon={<DashboardOutlined />} iconTone="cyan" /></Col>
        <Col xs={12} md={6}><KPICard title="Rack Power Draw (live)" value={Math.round(cap.power.used)} suffix=" kW" icon={<ThunderboltOutlined />} iconTone="info" /></Col>
        <Col xs={12} md={6}><KPICard title="Racks over type band" info="Racks above the warning threshold of their facility type — 85% enterprise, 80% colo and telco, 90% hyperscale and GPU" value={racks.filter((r) => utilOf(r.id) >= warnPct(r)).length} color="var(--vw-color-red-600)" icon={<WarningOutlined />} iconTone="error" /></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}><VwCard size="small" title="UPS Units" style={{ height: '100%' }}>
          {/* Fixed-height internal scroll (not scroll-reveal) — this table sits
              side-by-side with PDUs below, and unbounded row-count growth on
              either side desyncs the two cards' heights (one trails off with
              dead space, the other keeps growing). A bounded `scroll.y` keeps
              both cards the same height regardless of how many rows each has. */}
          <Table<UPS> size="small" rowKey="id" dataSource={ups} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }}
            columns={[{ title: 'Name', dataIndex: 'name' }, { title: 'Capacity', dataIndex: 'capacityKw', render: (v) => `${v} kW` }, { title: 'Load', dataIndex: 'loadPct', render: loadBar }, { title: 'Redundancy', dataIndex: 'redundancy', render: (r) => <VwChip>{r}</VwChip> }]} />
        </VwCard></Col>
        <Col xs={24} lg={12}><VwCard size="small" title="PDUs (by load)" style={{ height: '100%' }}>
          <Table<PDU> size="small" rowKey="id" dataSource={pduRows} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }}
            columns={[{ title: 'Name', dataIndex: 'name' }, { title: 'Capacity', dataIndex: 'capacityKw', render: (v) => `${v} kW` }, { title: 'Load', dataIndex: 'loadPct', render: loadBar }, { title: 'Outlets', dataIndex: 'outletsUsed', render: (u, r) => `${u}/${r.outletCount}` }]} />
        </VwCard></Col>
      </Row>
      <VwCard size="small" title="Racks over power budget (≥85%)" style={{ marginTop: "var(--vw-space-lg)" }}
        extra={<Input allowClear size="small" prefix={<SearchOutlined />} placeholder="Filter racks…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />}>
        <Table<Rack> size="small" rowKey="id" dataSource={overBudget} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }} onRow={(r) => ({ onClick: () => navigate(`/facility/racks/${r.id}`), style: { cursor: 'pointer' } })}
          columns={[{ title: 'Rack', dataIndex: 'name' }, { title: 'Purpose', dataIndex: 'purpose', render: (p) => <VwChip color={p === 'GPU' ? 'purple' : 'blue'}>{p}</VwChip> }, { title: 'Power (live)', key: 'pwr', render: (_, r) => loadBar(utilOf(r.id)) }, { title: 'Draw', key: 'draw', render: (_, r) => `${r2(drawOf(r.id))}/${r.maxPowerKw} kW` }]} />
      </VwCard>
    </div>
  );
}
