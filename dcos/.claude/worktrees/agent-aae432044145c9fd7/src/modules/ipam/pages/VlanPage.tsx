import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import { VwChip } from '../../../shared/components/ux';
import type { FieldSpec } from '../components/EntityFormModal';
import { NETWORK_OBJ_STATUS } from '../../../mock/data/enums';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { VLAN, VLANGroup, IpamRole } from '../../../mock/data/types';
export default function VlanPage() {
  const groups = (useEntityList('vlanGroups', { pageSize: 500 }).data?.data ?? []) as unknown as VLANGroup[];
  const roles = (useEntityList('ipamRoles', { pageSize: 500 }).data?.data ?? []) as unknown as IpamRole[];
  const groupName = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  const columns: TableColumnType<VLAN>[] = [
    { title: 'VLAN', dataIndex: 'vlanNumber', sorter: (a, b) => a.vlanNumber - b.vlanNumber },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Group', dataIndex: 'groupId', render: (id?: string) => (id ? groupName[id] ?? '—' : '—') },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={s === 'Unused' ? 'default' : s === 'Reserved' ? 'blue' : 'green'}>{s}</VwChip> },
  ];
  const fields: FieldSpec[] = [
    { name: 'vlanNumber', label: 'VLAN ID', type: 'number', required: true, min: 1, max: 4094 },
    { name: 'name', label: 'Name', required: true, placeholder: 'VLAN_PROD_01' },
    { name: 'groupId', label: 'VLAN group', type: 'select', allowClear: true, options: groups.map((g) => ({ value: g.id, label: g.name })) },
    { name: 'roleId', label: 'Role', type: 'select', allowClear: true, options: roles.map((r) => ({ value: r.id, label: r.name })) },
    { name: 'status', label: 'Status', type: 'select', required: true, options: NETWORK_OBJ_STATUS.map((s) => ({ value: s, label: s })) },
  ];
  return (
    <IpamListPage<VLAN>
      title="VLANs" entity="vlans" label="VLAN" idField="vlanId" idPrefix="VLAN"
      columns={columns} fields={fields} initialValues={{ status: 'Active' }} searchPlaceholder="Search VLANs..."
      tabs={[{ key: 'all', label: 'All' }, { key: 'unused', label: 'Unused (reclaimable)', filters: [{ field: 'status', operator: 'eq', value: 'Unused' }] }, { key: 'active', label: 'Active', filters: [{ field: 'status', operator: 'eq', value: 'Active' }] }]}
    />
  );
}
