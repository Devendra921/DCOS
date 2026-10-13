import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Input, Select, Segmented, Space, Tooltip } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import type { TableColumnType } from 'antd';
import { SearchOutlined, EditOutlined, EnvironmentOutlined, HomeOutlined, ApartmentOutlined, ThunderboltOutlined, WarningOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { DC_SEGMENT, FACILITY_STATUS, type DcSegment } from '../../../mock/data/enums';
import { DC_TYPES_BY_SEGMENT, dcTypeProfile, capacityThresholds, pueFor, pueTargetFor, coverageChipColor } from '../../../mock/data/dcTypes';
import type { DataCenter, Campus, Region, Rack, CoolingZone } from '../../../mock/data/types';
import { DataCenterFormModal } from '../components/DataCenterFormModal';

const { Text } = Typography;

/**
 * Sites — every data centre as a row: classification, resilience, footprint, live
 * load against its type's policy band, PUE against its type's target. The one
 * place to browse and edit sites as records; the map, hierarchy and drill page
 * are the spatial and detail views of the same list.
 */
export default function SitesPage() {
  const navigate = useNavigate();
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const campuses = (useEntityList('campuses', { pageSize: 500 }).data?.data ?? []) as unknown as Campus[];
  const regions = (useEntityList('regions', { pageSize: 50 }).data?.data ?? []) as unknown as Region[];
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const zones = (useEntityList('coolingZones', { pageSize: 2000 }).data?.data ?? []) as unknown as CoolingZone[];

  const [q, setQ] = useState('');
  const [segment, setSegment] = useState<DcSegment | 'All'>('All');
  const [types, setTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [editing, setEditing] = useState<DataCenter | null>(null);

  const rows = useMemo(() => {
    const campusById = new Map(campuses.map((c) => [c.id, c]));
    const regionById = new Map(regions.map((r) => [r.id, r.name]));
    const s = q.trim().toLowerCase();
    return dcs.map((d) => {
      const t = dcTypeProfile(d.dcTypeKey);
      const rk = racks.filter((r) => r.dataCenterId === d.id);
      const itKw = rk.reduce((a, r) => a + r.currentPowerKw, 0);
      const maxKw = rk.reduce((a, r) => a + r.maxPowerKw, 0);
      const coolKw = zones.filter((z) => z.dataCenterId === d.id).reduce((a, z) => a + z.currentLoadKw, 0);
      const th = capacityThresholds(d.dcTypeKey);
      const campus = campusById.get(d.campusId);
      return {
        ...d, key: d.id, typeName: t?.name, segment: t?.segment, coverage: t?.coverage,
        campusName: campus?.name ?? '—', regionName: campus ? regionById.get(campus.regionId) ?? '—' : '—',
        racks: rk.length, itKw: Math.round(itKw), utilPct: maxKw > 0 ? Math.round((itKw / maxKw) * 100) : 0,
        hotRacks: rk.filter((r) => r.powerUtilizationPct >= th.rackPowerWarnPct).length, warnPct: th.rackPowerWarnPct,
        pue: pueFor(d.dcTypeKey, itKw, coolKw), pueTarget: pueTargetFor(d.dcTypeKey),
      };
    }).filter((r) =>
      (segment === 'All' || r.segment === segment) &&
      (!types.length || (r.dcTypeKey && types.includes(r.dcTypeKey))) &&
      (!statuses.length || statuses.includes(r.status)) &&
      (!s || `${r.name} ${r.code} ${r.typeName ?? ''} ${r.campusName} ${r.regionName}`.toLowerCase().includes(s)));
  }, [dcs, campuses, regions, racks, zones, q, segment, types, statuses]);

  const kpis = useMemo(() => ({
    total: dcs.length,
    enterprise: dcs.filter((d) => dcTypeProfile(d.dcTypeKey)?.segment === 'Enterprise').length,
    telco: dcs.filter((d) => dcTypeProfile(d.dcTypeKey)?.segment === 'Telco').length,
    operational: dcs.filter((d) => d.status === 'Operational').length,
    untyped: dcs.filter((d) => !d.dcTypeKey).length,
    designMw: Math.round(dcs.reduce((s, d) => s + d.designPowerKw, 0) / 100) / 10,
  }), [dcs]);

  const columns: TableColumnType<(typeof rows)[number]>[] = [
    { title: 'Site', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name), render: (n: string, r) => <div><Text strong>{n}</Text><div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{r.code} · {r.campusName} · {r.regionName}</div></div> },
    { title: 'Type', dataIndex: 'typeName', width: 210, sorter: (a, b) => (a.typeName ?? '').localeCompare(b.typeName ?? ''), render: (t?: string, r?) => t ? <Space size={4}><VwChip color={r?.segment === 'Telco' ? 'purple' : 'blue'}>{t}</VwChip>{r?.coverage && <Tooltip title={`DCOS coverage: ${r.coverage}`}><span><VwChip color={coverageChipColor(r.coverage)}>{r.coverage[0]}</VwChip></span></Tooltip>}</Space> : <Text type="secondary">untyped</Text> },
    { title: 'Tier', dataIndex: 'tier', width: 80, render: (t: string) => <VwChip>{t}</VwChip> },
    { title: 'Status', dataIndex: 'status', width: 110, render: (s: string) => <VwChip color={s === 'Operational' ? 'green' : s === 'Construction' || s === 'Planned' ? 'blue' : 'orange'}>{s}</VwChip> },
    { title: 'Racks', dataIndex: 'racks', width: 70, align: 'right', sorter: (a, b) => a.racks - b.racks },
    { title: 'Design power', dataIndex: 'designPowerKw', width: 120, align: 'right', sorter: (a, b) => a.designPowerKw - b.designPowerKw, render: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${v} kW` },
    { title: 'IT load', dataIndex: 'itKw', width: 110, align: 'right', render: (v: number, r) => <span>{v.toLocaleString()} kW <Text type="secondary">({r.utilPct}%)</Text></span> },
    { title: 'Over band', dataIndex: 'hotRacks', width: 100, align: 'center', render: (n: number, r) => n ? <Tooltip title={`Racks at or above the ${r.warnPct}% warning band for this type`}><span><VwChip color="orange">{n}</VwChip></span></Tooltip> : <Text type="secondary">—</Text> },
    { title: 'PUE', dataIndex: 'pue', width: 90, sorter: (a, b) => a.pue - b.pue, render: (v: number, r) => v ? <Text strong style={{ color: v <= r.pueTarget ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)' }}>{v.toFixed(2)}</Text> : '—' },
    { title: '', key: 'actions', width: 150, render: (_: unknown, r) => (
      <Space size={4} onClick={(e) => e.stopPropagation()}>
        <Button size="small" type="link" icon={<EnvironmentOutlined />} onClick={() => navigate(`/map?type=${r.dcTypeKey ?? ''}`)}>Map</Button>
        <Button size="small" type="link" onClick={(e) => { e.stopPropagation(); navigate(`/facility/dc/${r.id}/site360`); }}>360</Button>
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => setEditing(dcs.find((d) => d.id === r.id) ?? null)}>Edit</Button>
      </Space>
    ) },
  ];

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>Sites</div>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Sites" value={kpis.total} suffix={` · ${kpis.enterprise} enterprise / ${kpis.telco} telco`} icon={<HomeOutlined />} iconTone="info" />
        <KPICard title="Operational" value={kpis.operational} suffix={` of ${kpis.total}`} icon={<ApartmentOutlined />} iconTone="success" />
        <KPICard title="Design power" value={kpis.designMw} suffix=" MW" icon={<ThunderboltOutlined />} iconTone="cyan" />
        <KPICard title="Untyped sites" value={kpis.untyped} color={kpis.untyped ? 'var(--vw-color-orange-700)' : undefined} info="Sites without a facility type fall back to tier-only defaults and platform-wide policy bands" icon={<WarningOutlined />} iconTone={kpis.untyped ? 'warning' : 'success'} />
      </div>
      <VwCard size="small"
        title={<Space wrap size={[8, 8]}>
          <Input allowClear prefix={<SearchOutlined />} placeholder="Search site / code / campus…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
          <Segmented size="small" value={segment} onChange={(v) => setSegment(v as DcSegment | 'All')} options={['All', ...DC_SEGMENT]} />
          <Select allowClear mode="multiple" maxTagCount="responsive" showSearch optionFilterProp="label" placeholder="Facility type" style={{ minWidth: 180 }} value={types} onChange={setTypes}
            options={DC_SEGMENT.filter((sg) => segment === 'All' || sg === segment).map((sg) => ({ label: sg, options: DC_TYPES_BY_SEGMENT[sg].map((t) => ({ value: t.key, label: t.name })) }))} />
          <Select allowClear mode="multiple" maxTagCount="responsive" placeholder="Status" style={{ minWidth: 140 }} value={statuses} onChange={setStatuses} options={FACILITY_STATUS.map((s) => ({ value: s, label: s }))} />
        </Space>}
        extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{rows.length} of {dcs.length} sites</Text>}>
        <Table rowKey="key" size="small" dataSource={rows} columns={columns} pagination={false} scroll={{ x: 'max-content' }}
          onRow={(r) => ({ onClick: () => navigate(`/facility/dc/${r.id}`), style: { cursor: 'pointer' } })} />
      </VwCard>
      {editing && <DataCenterFormModal open={!!editing} onClose={() => setEditing(null)} dc={editing} />}
    </div>
  );
}
