import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import { SERVICE_PROTOCOL } from '../../../mock/data/enums';
import type { ServiceTemplate } from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';

const parsePorts = (v: unknown): number[] =>
  String(v ?? '').split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));

export default function ServiceTemplatePage() {
  const columns: TableColumnType<ServiceTemplate>[] = [
    { title: 'Name', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Protocol', dataIndex: 'protocol', render: (p: string) => <VwChip color="purple">{p}</VwChip> },
    { title: 'Ports', dataIndex: 'ports', render: (p: number[]) => (p ?? []).join(', ') },
    { title: 'Description', dataIndex: 'description' },
  ];
  const fields: FieldSpec[] = [
    { name: 'name', label: 'Name', required: true, placeholder: 'HTTPS' },
    { name: 'protocol', label: 'Protocol', type: 'select', required: true, options: SERVICE_PROTOCOL.map((p) => ({ value: p, label: p })) },
    { name: 'ports', label: 'Ports (comma-separated)', required: true, placeholder: '443, 8443' },
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
  return (
    <IpamListPage<ServiceTemplate>
      title="Service Templates" entity="serviceTemplates" label="Service Template" idField="svctId" idPrefix="SVCT"
      columns={columns} fields={fields} initialValues={{ protocol: 'TCP' }} searchPlaceholder="Search templates..."
      transform={(v) => ({ ...v, ports: parsePorts(v.ports) })}
      toForm={(r) => ({ ...r, ports: (r.ports ?? []).join(', ') })}
    />
  );
}
