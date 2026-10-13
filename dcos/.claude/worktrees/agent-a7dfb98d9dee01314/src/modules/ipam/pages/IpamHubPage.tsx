import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Progress } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import {
  DashboardOutlined, DatabaseOutlined, WarningOutlined, TagsOutlined, ApiOutlined,
  ClusterOutlined, PartitionOutlined, GroupOutlined, GlobalOutlined, CloudServerOutlined,
} from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { KPICard } from '../../../shared/components/KPICard';
import type { Subnet, VLAN, IPAddress } from '../../../mock/data/types';
import { VwCard, VwChip, KpiTile } from '../../../shared/components/ux';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

export default function IpamHubPage() {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const subnets = (useEntityList('subnets', { pageSize: 1000, filters: dcF }).data?.data ?? []) as unknown as Subnet[];
  const vlans = (useEntityList('vlans', { pageSize: 500, filters: dcF }).data?.data ?? []) as unknown as VLAN[];
  const ips = (useEntityList('ipAddresses', { pageSize: 2000 }).data?.data ?? []) as unknown as IPAddress[];
  const aggregates = useEntityList('cidrBlocks', { pageSize: 1 }).data?.total ?? 0;
  const ranges = useEntityList('ipRanges', { pageSize: 1 }).data?.total ?? 0;
  const vrfs = useEntityList('vrfs', { pageSize: 1 }).data?.total ?? 0;
  const asns = useEntityList('asns', { pageSize: 1 }).data?.total ?? 0;
  const vlanGroups = useEntityList('vlanGroups', { pageSize: 1 }).data?.total ?? 0;
  const services = useEntityList('ipServices', { pageSize: 1 }).data?.total ?? 0;

  const m = useMemo(() => {
    const leaves = subnets.filter((s) => s.status !== 'Container');
    return {
      avgUtil: leaves.length ? Math.round(sum(leaves.map((s) => s.utilizationPct)) / leaves.length) : 0,
      free: sum(leaves.map((s) => s.totalHosts - s.usedHosts)),
      nearing: leaves.filter((s) => s.utilizationPct >= 85).length,
      unusedVlans: vlans.filter((v) => v.status === 'Unused').length,
      conflicts: ips.filter((i) => i.status === 'Conflict').length,
      top: [...leaves].sort((a, b) => b.utilizationPct - a.utilizationPct).slice(0, 8),
      vlanStatus: ['Active', 'Reserved', 'Unused'].map((s) => ({ s, n: vlans.filter((v) => v.status === s).length })),
    };
  }, [subnets, vlans, ips]);

  const inventory: Array<[string, number, string, any, string]> = [
    ['Aggregates', aggregates, '/ipam/aggregates', <ClusterOutlined key="i" />, 'info'],
    ['Prefixes', subnets.length, '/ipam/subnets', <ApiOutlined key="i" />, 'cyan'],
    ['IP Ranges', ranges, '/ipam/ranges', <DatabaseOutlined key="i" />, 'purple'],
    ['VRFs', vrfs, '/ipam/vrf', <PartitionOutlined key="i" />, 'orange'],
    ['VLAN Groups', vlanGroups, '/ipam/vlan-groups', <GroupOutlined key="i" />, 'info'],
    ['ASNs', asns, '/ipam/asns', <GlobalOutlined key="i" />, 'cyan'],
    ['Services', services, '/ipam/services', <CloudServerOutlined key="i" />, 'purple'],
  ];

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>IP &amp; Network Planning</div>
      <div className="vw-grid vw-kpi-grid vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Subnet Utilization" value={m.avgUtil} suffix="%" color={m.avgUtil >= 85 ? 'var(--vw-color-red-600)' : undefined} icon={<DashboardOutlined />} iconTone="cyan" />
        <KPICard title="IPs Free" value={m.free.toLocaleString()} icon={<DatabaseOutlined />} iconTone="info" />
        <KPICard title="Subnets ≥85%" value={m.nearing} color={m.nearing ? '#f59e0b' : undefined} icon={<WarningOutlined />} iconTone="warning" />
        <KPICard title="Unused VLANs" value={m.unusedVlans} icon={<TagsOutlined />} iconTone="neutral" />
        <KPICard title="IP Conflicts" value={m.conflicts} color={m.conflicts ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="error" />
      </div>
      <VwCard size="small" title="Addressing inventory" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <div className="vw-grid vw-grid-cols-auto-320 vw-gap-lg">
          {inventory.map(([label, n, path, icon, tone]) => (
            <KpiTile key={label} label={label} value={n} onClick={() => navigate(path)} icon={icon} iconTone={tone as 'info' | 'cyan' | 'purple' | 'orange'} />
          ))}
        </div>
      </VwCard>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <VwCard size="small" title="Subnets nearing exhaustion" extra={<Button type="link" onClick={() => navigate('/ipam/subnets')}>All subnets →</Button>}>
            <Table<Subnet> size="small" rowKey="id" dataSource={m.top} pagination={false}
              onRow={(s) => ({ onClick: () => navigate(`/ipam/subnets/${s.id}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'CIDR', dataIndex: 'cidr' },
                { title: 'Name', dataIndex: 'name' },
                { title: 'Utilization', dataIndex: 'utilizationPct', render: (v: number) => <Progress percent={v} size="small" status={v >= 85 ? 'exception' : 'normal'} /> },
                { title: 'Forecast exhaustion', dataIndex: 'forecastExhaustionDate', render: (d?: string) => d ? <VwChip color="orange">{d.slice(0, 10)}</VwChip> : <VwChip>—</VwChip> },
                { title: 'State', dataIndex: 'state', render: (s: string) => <VwChip>{s}</VwChip> },
              ]} scroll={{ x: 'max-content' }} />
          </VwCard>
        </Col>
        <Col xs={24} lg={8}>
          <VwCard size="small" title="VLAN status">
            {m.vlanStatus.map((v) => (
              <div key={v.s} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <VwChip color={v.s === 'Unused' ? 'default' : v.s === 'Reserved' ? 'blue' : 'green'}>{v.s}</VwChip>
                <span style={{ fontWeight: 600 }}>{v.n}</span>
              </div>
            ))}
            <Button type="link" style={{ paddingLeft: 0 }} onClick={() => navigate('/ipam/vlans')}>Manage VLANs →</Button>
          </VwCard>
        </Col>
      </Row>
    </div>
  );
}
