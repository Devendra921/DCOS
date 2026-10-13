import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import type { IpamRole } from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';
export default function IpamRolePage() {
  const columns: TableColumnType<IpamRole>[] = [
    { title: 'Role', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name), render: (n: string, r) => <VwChip color={r.color}>{n}</VwChip> },
    { title: 'Slug', dataIndex: 'slug' },
    { title: 'Weight', dataIndex: 'weight', align: 'right', sorter: (a, b) => (a.weight ?? 0) - (b.weight ?? 0) },
    { title: 'Description', dataIndex: 'description' },
  ];
  const fields: FieldSpec[] = [
    { name: 'name', label: 'Name', required: true, placeholder: 'Production' },
    { name: 'slug', label: 'Slug', placeholder: 'production' },
    { name: 'weight', label: 'Weight', type: 'number', min: 0, max: 10000 },
    { name: 'color', label: 'Colour (hex)', placeholder: '#2563eb' },
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
  return <IpamListPage<IpamRole> title="Prefix & VLAN Roles" entity="ipamRoles" label="Role" idField="roleId" idPrefix="IPROLE" columns={columns} fields={fields} initialValues={{ weight: 100, color: '#2563eb' }} searchPlaceholder="Search roles..." />;
}
