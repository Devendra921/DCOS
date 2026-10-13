import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import type { VLANGroup } from '../../../mock/data/types';
export default function VlanGroupPage() {
  const columns: TableColumnType<VLANGroup>[] = [
    { title: 'Group', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Slug', dataIndex: 'slug' },
    { title: 'VID Range', key: 'range', render: (_: unknown, r) => `${r.minVid ?? 1}–${r.maxVid ?? 4094}` },
    { title: 'Description', dataIndex: 'description' },
  ];
  const fields: FieldSpec[] = [
    { name: 'name', label: 'Name', required: true, placeholder: 'Core Fabric' },
    { name: 'slug', label: 'Slug', placeholder: 'core-fabric' },
    { name: 'minVid', label: 'Min VID', type: 'number', min: 1, max: 4094 },
    { name: 'maxVid', label: 'Max VID', type: 'number', min: 1, max: 4094 },
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
  return <IpamListPage<VLANGroup> title="VLAN Groups" entity="vlanGroups" label="VLAN Group" idField="vgId" idPrefix="VG" columns={columns} fields={fields} initialValues={{ minVid: 1, maxVid: 4094 }} searchPlaceholder="Search VLAN groups..." />;
}
