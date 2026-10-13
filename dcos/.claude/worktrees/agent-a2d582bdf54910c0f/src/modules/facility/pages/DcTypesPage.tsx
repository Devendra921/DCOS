import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Segmented, Tooltip } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import type { TableColumnType } from 'antd';
import { ApartmentOutlined, PartitionOutlined, HomeOutlined, SafetyCertificateOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { DC_SEGMENT, type DcSegment, type DcTypeCoverage } from '../../../mock/data/enums';
import { CAPABILITY_GAP_LABEL, coverageChipColor, fmtPowerRange, fmtRange } from '../../../mock/data/dcTypes';
import type { DataCenter, DataCenterType } from '../../../mock/data/types';

const { Text } = Typography;

/**
 * Data centre types — the reference taxonomy (enterprise + telco, smallest → largest)
 * with each type's typical envelope, how well DCOS covers it, and how many of the
 * estate's facilities are classified as it. Read-only: the catalogue is code-owned
 * (see mock/data/dcTypes.ts) so every wizard, filter and blueprint shares one table.
 */
export default function DcTypesPage() {
  const navigate = useNavigate();
  const [segment, setSegment] = useState<DcSegment | 'All'>('All');
  const types = (useEntityList('dataCenterTypes', { pageSize: 100 }).data?.data ?? []) as unknown as DataCenterType[];
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];

  const countByType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of dcs) if (d.dcTypeKey) m[d.dcTypeKey] = (m[d.dcTypeKey] ?? 0) + 1;
    return m;
  }, [dcs]);

  const rows = useMemo(() => {
    const segOrder: Record<string, number> = { Enterprise: 0, Telco: 1 };
    return [...types]
      .filter((t) => segment === 'All' || t.segment === segment)
      .sort((a, b) => segOrder[a.segment] - segOrder[b.segment] || a.order - b.order)
      .map((t) => ({ ...t, dcCount: countByType[t.key] ?? 0 }));
  }, [types, segment, countByType]);

  const kpis = useMemo(() => {
    const typed = dcs.filter((d) => d.dcTypeKey).length;
    const inUse = new Set(dcs.map((d) => d.dcTypeKey).filter(Boolean)).size;
    const full = types.filter((t) => t.coverage === 'Full' || t.coverage === 'Strong').length;
    return { types: types.length, inUse, typed, untyped: dcs.length - typed, full };
  }, [types, dcs]);

  const columns: TableColumnType<(typeof rows)[number]>[] = [
    { title: 'Type', dataIndex: 'name', width: 260, render: (n: string, r) => (
      <div>
        <Text strong>{n}</Text>
        <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{r.description}</div>
      </div>
    ) },
    { title: 'Segment', dataIndex: 'segment', width: 110, render: (s: DcSegment) => <VwChip color={s === 'Telco' ? 'purple' : 'blue'}>{s}</VwChip> },
    { title: 'Typical size', width: 120, render: (_: unknown, r) => `${fmtRange([r.typicalRacksMin, r.typicalRacksMax ?? null])} racks` },
    { title: 'Power', width: 120, render: (_: unknown, r) => fmtPowerRange([r.powerKwMin, r.powerKwMax ?? null]) },
    { title: 'kW / rack', width: 90, align: 'right', render: (_: unknown, r) => (r.kwPerRackMin != null && r.kwPerRackMax != null ? `${r.kwPerRackMin}–${r.kwPerRackMax}` : 'n/a') },
    { title: 'Cooling', dataIndex: 'cooling', width: 190 },
    { title: 'Redundancy / Tier', dataIndex: 'redundancy', width: 170 },
    { title: 'Default tier', dataIndex: 'defaultTier', width: 100, render: (t: string) => <VwChip>{t}</VwChip> },
    { title: 'DCOS coverage', dataIndex: 'coverage', width: 130, render: (c: DcTypeCoverage, r) => (
      <Tooltip title={r.gaps.length ? `To close: ${r.gaps.map((g) => CAPABILITY_GAP_LABEL[g]).join(' · ')}` : 'Core supported use case'}>
        <span><VwChip color={coverageChipColor(c)}>{c}</VwChip></span>
      </Tooltip>
    ) },
    { title: 'Sites', dataIndex: 'dcCount', width: 70, align: 'right', render: (n: number) => (n ? <Text strong>{n}</Text> : <Text type="secondary">—</Text>) },
  ];

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>Data Center Types</div>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Types in catalogue" value={kpis.types} icon={<PartitionOutlined />} iconTone="info" />
        <KPICard title="Types in use" value={kpis.inUse} icon={<ApartmentOutlined />} iconTone="cyan" />
        <KPICard title="Classified sites" value={kpis.typed} suffix={kpis.untyped ? ` (${kpis.untyped} untyped)` : ''} color={kpis.untyped ? 'var(--vw-color-orange-700)' : undefined} icon={<HomeOutlined />} iconTone="warning" />
        <KPICard title="Full / Strong coverage" value={kpis.full} suffix={` of ${kpis.types}`} icon={<SafetyCertificateOutlined />} iconTone="success" />
      </div>
      <VwCard size="small"
        title="Taxonomy — smallest to largest footprint"
        extra={<Segmented size="small" value={segment} onChange={(v) => setSegment(v as DcSegment | 'All')} options={['All', ...DC_SEGMENT]} />}>
        <Table rowKey="id" size="small" dataSource={rows} columns={columns} pagination={false} scroll={{ x: 'max-content' }}
          onRow={(r) => ({ onClick: () => (r.dcCount ? navigate(`/map?type=${r.key}`) : undefined), style: { cursor: r.dcCount ? 'pointer' : 'default' } })} />
        <Text type="secondary" style={{ display: 'block', marginTop: "var(--vw-space-md)", fontSize: "var(--vw-font-label-sm)" }}>
          Figures are typical industry ballparks, not hard limits. Cell sites, street cabinets and far-edge MEC are out of DCOS scope and omitted.
          Coverage: <VwChip color="success">Full</VwChip> core use case · <VwChip color="blue">Strong</VwChip> minor gaps · <VwChip color="warning">Partial</VwChip> a key domain model is missing · <VwChip color="error">Gap</VwChip> not supported.
        </Text>
      </VwCard>
    </div>
  );
}
