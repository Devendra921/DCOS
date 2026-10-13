import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import { IP_STATUS } from '../../../mock/data/enums';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { IPRange, VRF, IpamRole } from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';
const color: Record<string, string> = { Allocated: 'blue', Reserved: 'gold', Conflict: 'red', Available: 'default' };
const ipToInt = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + (parseInt(o, 10) || 0), 0);
export default function IpRangePage() {
  const vrfs = (useEntityList('vrfs', { pageSize: 500 }).data?.data ?? []) as unknown as VRF[];
  const roles = (useEntityList('ipamRoles', { pageSize: 500 }).data?.data ?? []) as unknown as IpamRole[];
  const vrfName = Object.fromEntries(vrfs.map((v) => [v.id, v.name]));
  const roleName = Object.fromEntries(roles.map((r) => [r.id, r.name]));
  const columns: TableColumnType<IPRange>[] = [
    { title: 'Start', dataIndex: 'startAddress', sorter: (a, b) => a.startAddress.localeCompare(b.startAddress) },
    { title: 'End', dataIndex: 'endAddress' },
    { title: 'Size', dataIndex: 'size', align: 'right', sorter: (a, b) => a.size - b.size },
    { title: 'VRF', dataIndex: 'vrfId', render: (id?: string) => (id ? vrfName[id] ?? '—' : 'Global') },
    { title: 'Role', dataIndex: 'roleId', render: (id?: string) => (id ? roleName[id] ?? '—' : '—') },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={color[s]}>{s}</VwChip> },
    { title: 'Description', dataIndex: 'description' },
  ];
  const fields: FieldSpec[] = [
    { name: 'startAddress', label: 'Start address', required: true, placeholder: '10.0.0.10' },
    { name: 'endAddress', label: 'End address', required: true, placeholder: '10.0.0.100' },
    { name: 'vrfId', label: 'VRF', type: 'select', allowClear: true, options: vrfs.map((v) => ({ value: v.id, label: v.name })) },
    { name: 'roleId', label: 'Role', type: 'select', allowClear: true, options: roles.map((r) => ({ value: r.id, label: r.name })) },
    { name: 'status', label: 'Status', type: 'select', required: true, options: IP_STATUS.map((s) => ({ value: s, label: s })) },
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
  return (
    <IpamListPage<IPRange>
      title="IP Ranges" entity="ipRanges" label="IP Range" idField="iprId" idPrefix="IPR"
      columns={columns} fields={fields} initialValues={{ status: 'Available' }} searchPlaceholder="Search ranges..." nameField="startAddress"
      transform={(v) => ({ ...v, size: Math.max(1, ipToInt(String(v.endAddress)) - ipToInt(String(v.startAddress)) + 1) })}
    />
  );
}
