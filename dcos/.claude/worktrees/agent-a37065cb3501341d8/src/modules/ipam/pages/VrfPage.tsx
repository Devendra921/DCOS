import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { VRF, RouteTarget } from '../../../mock/data/types';
export default function VrfPage() {
  const rts = (useEntityList('routeTargets', { pageSize: 500 }).data?.data ?? []) as unknown as RouteTarget[];
  const columns: TableColumnType<VRF>[] = [
    { title: 'VRF', dataIndex: 'name' },
    { title: 'Route Distinguisher', dataIndex: 'routeDistinguisher' },
    { title: 'Unique', dataIndex: 'enforceUnique', render: (u?: boolean) => (u ? 'Yes' : 'No') },
    { title: 'Subnets', dataIndex: 'subnetCount', align: 'right', sorter: (a, b) => a.subnetCount - b.subnetCount },
  ];
  const rtOpts = rts.map((r) => ({ value: r.id, label: r.name }));
  const fields: FieldSpec[] = [
    { name: 'name', label: 'Name', required: true, placeholder: 'VRF-PROD' },
    { name: 'routeDistinguisher', label: 'Route distinguisher', required: true, placeholder: '65000:100' },
    { name: 'enforceUnique', label: 'Enforce unique space', type: 'switch' },
    { name: 'importTargetIds', label: 'Import targets', type: 'multiselect', options: rtOpts },
    { name: 'exportTargetIds', label: 'Export targets', type: 'multiselect', options: rtOpts },
  ];
  return (
    <IpamListPage<VRF>
      title="VRFs" entity="vrfs" label="VRF" idField="vrfId" idPrefix="VRF"
      columns={columns} fields={fields} initialValues={{ enforceUnique: true, subnetCount: 0 }}
      transform={(v, isEdit) => (isEdit ? v : { ...v, subnetCount: 0 })}
      searchPlaceholder="Search VRFs..."
    />
  );
}
