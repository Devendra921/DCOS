import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import type { RIR } from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';
export default function RirPage() {
  const columns: TableColumnType<RIR>[] = [
    { title: 'Name', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Slug', dataIndex: 'slug' },
    { title: 'Type', dataIndex: 'isPrivate', render: (p?: boolean) => <VwChip color={p ? 'gold' : 'blue'}>{p ? 'Private' : 'Public RIR'}</VwChip> },
    { title: 'Description', dataIndex: 'description' },
  ];
  const fields: FieldSpec[] = [
    { name: 'name', label: 'Name', required: true, placeholder: 'ARIN' },
    { name: 'slug', label: 'Slug', placeholder: 'arin' },
    { name: 'isPrivate', label: 'Private address space', type: 'switch' },
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
  return <IpamListPage<RIR> title="RIRs" entity="rirs" label="RIR" idField="rirId" idPrefix="RIR" columns={columns} fields={fields} searchPlaceholder="Search registries..." />;
}
