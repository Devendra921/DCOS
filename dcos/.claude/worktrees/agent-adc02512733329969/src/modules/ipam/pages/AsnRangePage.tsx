import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { ASNRange, RIR } from '../../../mock/data/types';
export default function AsnRangePage() {
  const rirs = (useEntityList('rirs', { pageSize: 500 }).data?.data ?? []) as unknown as RIR[];
  const rirName = Object.fromEntries(rirs.map((r) => [r.id, r.name]));
  const columns: TableColumnType<ASNRange>[] = [
    { title: 'Name', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'RIR', dataIndex: 'rirId', render: (id?: string) => (id ? rirName[id] ?? '—' : '—') },
    { title: 'Range', key: 'range', render: (_: unknown, r) => `AS${r.start} – AS${r.end}` },
    { title: 'Size', key: 'size', align: 'right', render: (_: unknown, r) => r.end - r.start + 1 },
  ];
  const fields: FieldSpec[] = [
    { name: 'name', label: 'Name', required: true, placeholder: 'Private 16-bit ASN pool' },
    { name: 'rirId', label: 'RIR', type: 'select', options: rirs.map((r) => ({ value: r.id, label: r.name })) },
    { name: 'start', label: 'Start ASN', type: 'number', required: true, min: 1 },
    { name: 'end', label: 'End ASN', type: 'number', required: true, min: 1 },
  ];
  return <IpamListPage<ASNRange> title="ASN Ranges" entity="asnRanges" label="ASN Range" idField="asnrId" idPrefix="ASNR" columns={columns} fields={fields} searchPlaceholder="Search ASN ranges..." />;
}
