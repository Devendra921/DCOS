import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Progress, Flex } from 'antd';
import { ApartmentOutlined, UnorderedListOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import { VwChip, VwSegmented} from '../../../shared/components/ux';
import type { Subnet } from '../../../mock/data/types';
import SubnetFormModal from '../components/SubnetFormModal';
import PrefixTree from '../components/PrefixTree';
import { useDcFilter } from '../../../core/scope/DcScope';

const statusColor: Record<string, string> = { Container: 'purple', Active: 'green', Reserved: 'gold', Deprecated: 'default' };

export default function SubnetListPage() {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'flat' | 'tree'>('flat');
  const columns: TableColumnType<Subnet>[] = [
    { title: 'CIDR', dataIndex: 'cidr', sorter: (a, b) => a.cidr.localeCompare(b.cidr) },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={statusColor[s] ?? 'default'}>{s}</VwChip> },
    { title: 'Purpose', dataIndex: 'purpose', render: (p: string) => <VwChip>{p}</VwChip> },
    { title: 'Hosts', render: (_, s) => `${s.usedHosts}/${s.totalHosts}` },
    { title: 'Utilization', dataIndex: 'utilizationPct', width: 160, render: (v: number) => <Progress percent={v} size="small" status={v >= 85 ? 'exception' : 'normal'} />, sorter: (a, b) => a.utilizationPct - b.utilizationPct },
    { title: 'State', dataIndex: 'state', render: (s: string) => <VwChip color={s === 'Consumed' ? 'red' : s === 'Committed' ? 'gold' : 'green'}>{s}</VwChip> },
    { title: 'Exhaustion', dataIndex: 'forecastExhaustionDate', render: (d?: string) => d ? d.slice(0, 10) : '—' },
  ];
  const viewToggle = (
    <VwSegmented
      value={view}
      onChange={(v) => setView(v as 'flat' | 'tree')}
      options={[
        { label: 'Flat', value: 'flat', icon: <UnorderedListOutlined /> },
        { label: 'Tree', value: 'tree', icon: <ApartmentOutlined /> },
      ]}
    />
  );
  return (
    <div>
      {view === 'tree' ? (
        <>
          <Flex className="vw-card-section" justify="space-between" align="center" wrap="wrap" gap={8} style={{ marginBottom: "var(--vw-space-lg)" }}>
            <div className="vw-page-title" role="heading" aria-level={4}>Prefixes</div>
            {viewToggle}
          </Flex>
          <PrefixTree />
        </>
      ) : (
        <EntityListPage<Subnet>
          title="Prefixes"
          entityType="subnets"
          defaultFilters={dcF}
          createButtonLabel="New prefix"
          onCreateClick={() => setOpen(true)}
          columns={columns}
          onRowClick={(s) => navigate(`/ipam/subnets/${s.id}`)}
          searchPlaceholder="Search prefixes..."
          headerExtra={viewToggle}
          tabs={[
            { key: 'all', label: 'All' },
            { key: 'containers', label: 'Containers', filters: [{ field: 'status', operator: 'eq', value: 'Container' }] },
            { key: 'hot', label: 'Nearing exhaustion (≥85%)', filters: [{ field: 'utilizationPct', operator: 'gte', value: 85 }] },
            { key: 'prod', label: 'Production', filters: [{ field: 'purpose', operator: 'eq', value: 'Production' }] },
            { key: 'mgmt', label: 'Management', filters: [{ field: 'purpose', operator: 'eq', value: 'Management' }] },
          ]}
        />
      )}
      <SubnetFormModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
