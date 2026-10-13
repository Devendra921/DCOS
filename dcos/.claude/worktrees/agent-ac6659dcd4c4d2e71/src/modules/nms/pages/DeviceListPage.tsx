import { useNavigate } from 'react-router-dom';
import type { TableColumnType } from 'antd';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import { REACH_COLOR } from '../components/nmsUtil';
import type { ManagedDevice } from '../../../mock/data/types';
import { useDcFilter } from '../../../core/scope/DcScope';
import { VwChip } from '../../../shared/components/ux';

export default function DeviceListPage() {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const columns: TableColumnType<ManagedDevice>[] = [
    { title: 'Hostname', dataIndex: 'hostname', sorter: (a, b) => a.hostname.localeCompare(b.hostname) },
    { title: 'Mgmt IP', dataIndex: 'mgmtIp' },
    { title: 'Type', dataIndex: 'deviceType', render: (t: string) => <VwChip>{t}</VwChip> },
    { title: 'Role', dataIndex: 'role' },
    { title: 'Vendor', dataIndex: 'vendor' },
    { title: 'Reachability', dataIndex: 'reachability', render: (r: string) => <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: REACH_COLOR[r], marginRight: 6 }} />{r}</span> },
  ];
  return (
    <div>
      <EntityListPage<ManagedDevice> title="Managed Devices" entityType="managedDevices"
        defaultFilters={dcF} columns={columns}
        onRowClick={(d) => navigate(`/nms/devices/${d.id}`)} searchPlaceholder="Search devices..."
        tabs={[{ key: 'all', label: 'All' }, ...['Reachable', 'Degraded', 'Unreachable'].map((r) => ({ key: r, label: r, filters: [{ field: 'reachability', operator: 'eq' as const, value: r }] }))]} />
    </div>
  );
}
