import { useState } from 'react';
import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import { IpDetailDrawer } from '../components/IpDetailDrawer';
import { TagChips } from '../../../shared/customization';
import type { FieldSpec } from '../components/EntityFormModal';
import { IP_STATUS } from '../../../mock/data/enums';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { VwChip } from '../../../shared/components/ux';
import type { IPAddress, Subnet, IpamRole, Device, Interface, FHRPGroup } from '../../../mock/data/types';
const color: Record<string, string> = { Allocated: 'blue', Reserved: 'gold', Conflict: 'red', Available: 'default' };
export default function IpAddressPage() {
  const [sel, setSel] = useState<IPAddress | null>(null);
  const subnets = (useEntityList('subnets', { pageSize: 1000 }).data?.data ?? []) as unknown as Subnet[];
  const roles = (useEntityList('ipamRoles', { pageSize: 500 }).data?.data ?? []) as unknown as IpamRole[];
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const ifaces = (useEntityList('interfaces', { pageSize: 200000 }).data?.data ?? []) as unknown as Interface[];
  const fhrp = (useEntityList('fhrpGroups', { pageSize: 500 }).data?.data ?? []) as unknown as FHRPGroup[];
  const deviceName = Object.fromEntries(devices.map((d) => [d.id, d.name]));
  const columns: TableColumnType<IPAddress>[] = [
    { title: 'Address', dataIndex: 'address', sorter: (a, b) => a.address.localeCompare(b.address) },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={color[s]}>{s}</VwChip> },
    { title: 'DNS', dataIndex: 'dnsName' },
    { title: 'Assigned to', dataIndex: 'deviceId', render: (id?: string) => (id ? deviceName[id] ?? '—' : '—') },
    { title: 'Tags', dataIndex: 'tags', render: (ids?: string[]) => <TagChips ids={ids} /> },
    { title: 'MAC', dataIndex: 'macAddress' },
  ];
  const fields: FieldSpec[] = [
    { name: 'address', label: 'Address', required: true, placeholder: '10.20.30.40' },
    { name: 'subnetId', label: 'Prefix', type: 'select', required: true, options: subnets.filter((s) => s.status !== 'Container').map((s) => ({ value: s.id, label: `${s.cidr} · ${s.name}` })) },
    { name: 'status', label: 'Status', type: 'select', required: true, options: IP_STATUS.map((s) => ({ value: s, label: s })) },
    { name: 'roleId', label: 'Role', type: 'select', allowClear: true, options: roles.map((r) => ({ value: r.id, label: r.name })) },
    { name: 'deviceId', label: 'Assigned device', type: 'select', allowClear: true, options: devices.slice(0, 500).map((d) => ({ value: d.id, label: d.name })) },
    { name: 'interfaceId', label: 'Interface', type: 'select', allowClear: true, options: ifaces.slice(0, 1000).map((i) => ({ value: i.id, label: `${deviceName[i.deviceId] ?? '?'} · ${i.name}` })) },
    { name: 'fhrpGroupId', label: 'FHRP group', type: 'select', allowClear: true, options: fhrp.map((f) => ({ value: f.id, label: `${f.protocol} grp ${f.groupId}` })) },
    { name: 'dnsName', label: 'DNS name', placeholder: 'host.dc.internal' },
    { name: 'hostname', label: 'Hostname', placeholder: 'e.g. web-server-01' },
    { name: 'macAddress', label: 'MAC address', placeholder: 'e.g. 00:1A:2B:3C:4D:5E' },
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
  return (
    <>
      <IpamListPage<IPAddress>
        title="IP Addresses" entity="ipAddresses" label="IP Address" idField="ipId" idPrefix="IP"
        columns={columns} fields={fields} initialValues={{ status: 'Allocated' }} nameField="address" searchPlaceholder="Search IPs..."
        onRowClick={(r) => setSel(r)}
        transform={(v, isEdit) => (isEdit ? v : { ...v, allocatedAt: new Date().toISOString() })}
        tabs={[{ key: 'all', label: 'All' }, ...['Allocated', 'Reserved', 'Available', 'Conflict'].map((s) => ({ key: s, label: s, filters: [{ field: 'status', operator: 'eq' as const, value: s }] }))]}
      />
      <IpDetailDrawer ip={sel} open={!!sel} onClose={() => setSel(null)} />
    </>
  );
}
