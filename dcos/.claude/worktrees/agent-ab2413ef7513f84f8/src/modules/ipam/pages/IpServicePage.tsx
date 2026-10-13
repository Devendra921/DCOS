import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import { SERVICE_PROTOCOL } from '../../../mock/data/enums';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { IpService, IPAddress } from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';

const parsePorts = (v: unknown): number[] =>
  String(v ?? '').split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));

export default function IpServicePage() {
  const ips = (useEntityList('ipAddresses', { pageSize: 2000 }).data?.data ?? []) as unknown as IPAddress[];
  const columns: TableColumnType<IpService>[] = [
    { title: 'Service', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Protocol', dataIndex: 'protocol', render: (p: string) => <VwChip color="purple">{p}</VwChip> },
    { title: 'Ports', dataIndex: 'ports', render: (p: number[]) => (p ?? []).join(', ') },
    { title: 'Assigned IPs', dataIndex: 'ipAddressIds', align: 'right', render: (ids?: string[]) => (ids ?? []).length },
    { title: 'Description', dataIndex: 'description' },
  ];
  const fields: FieldSpec[] = [
    { name: 'name', label: 'Name', required: true, placeholder: 'HTTPS' },
    { name: 'protocol', label: 'Protocol', type: 'select', required: true, options: SERVICE_PROTOCOL.map((p) => ({ value: p, label: p })) },
    { name: 'ports', label: 'Ports (comma-separated)', required: true, placeholder: '443, 8443' },
    { name: 'ipAddressIds', label: 'Assigned IP addresses', type: 'multiselect', options: ips.slice(0, 1000).map((i) => ({ value: i.id, label: i.address })) },
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
  return (
    <IpamListPage<IpService>
      title="Application Services" entity="ipServices" label="Service" idField="svcId" idPrefix="SVC"
      columns={columns} fields={fields} initialValues={{ protocol: 'TCP' }} searchPlaceholder="Search services..."
      transform={(v) => ({ ...v, ports: parsePorts(v.ports) })}
      toForm={(r) => ({ ...r, ports: (r.ports ?? []).join(', ') })}
    />
  );
}
