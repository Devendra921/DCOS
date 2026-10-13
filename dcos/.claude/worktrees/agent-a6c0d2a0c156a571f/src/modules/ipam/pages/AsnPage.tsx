import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { VwChip } from '../../../shared/components/ux';
import type { ASN, RIR } from '../../../mock/data/types';
export default function AsnPage() {
  const rirs = (useEntityList('rirs', { pageSize: 500 }).data?.data ?? []) as unknown as RIR[];
  const rirName = Object.fromEntries(rirs.map((r) => [r.id, r.name]));
  const columns: TableColumnType<ASN>[] = [
    { title: 'ASN', dataIndex: 'asn', sorter: (a, b) => a.asn - b.asn, render: (n: number) => <VwChip color={n >= 64512 && n <= 65534 ? 'gold' : 'blue'}>AS{n}</VwChip> },
    { title: 'RIR', dataIndex: 'rirId', render: (id?: string) => (id ? rirName[id] ?? '—' : '—') },
    { title: 'Description', dataIndex: 'description' },
  ];
  const fields: FieldSpec[] = [
    { name: 'asn', label: 'ASN', type: 'number', required: true, min: 1, max: 4294967295 },
    { name: 'rirId', label: 'RIR', type: 'select', options: rirs.map((r) => ({ value: r.id, label: r.name })) },
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
  return <IpamListPage<ASN> title="ASNs" entity="asns" label="ASN" idField="asnId" idPrefix="ASN" columns={columns} fields={fields} nameField="asn" searchPlaceholder="Search ASNs..." />;
}
