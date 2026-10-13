import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import type { RouteTarget } from '../../../mock/data/types';
export default function RouteTargetPage() {
  const columns: TableColumnType<RouteTarget>[] = [
    { title: 'Route Target', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Description', dataIndex: 'description' },
  ];
  const fields: FieldSpec[] = [
    { name: 'name', label: 'Route Target', required: true, placeholder: '65000:1000' },
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
  return <IpamListPage<RouteTarget> title="Route Targets" entity="routeTargets" label="Route Target" idField="rtId" idPrefix="RT" columns={columns} fields={fields} searchPlaceholder="Search route targets..." />;
}
