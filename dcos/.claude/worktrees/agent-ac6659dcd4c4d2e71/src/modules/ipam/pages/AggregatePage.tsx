import { Progress } from 'antd';
import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { CIDRBlock, RIR } from '../../../mock/data/types';
export default function AggregatePage() {
  const rirs = (useEntityList('rirs', { pageSize: 500 }).data?.data ?? []) as unknown as RIR[];
  const rirName = Object.fromEntries(rirs.map((r) => [r.id, r.name]));
  const columns: TableColumnType<CIDRBlock>[] = [
    { title: 'Aggregate', dataIndex: 'cidr', sorter: (a, b) => a.cidr.localeCompare(b.cidr) },
    { title: 'Name', dataIndex: 'name' },
    { title: 'RIR', dataIndex: 'rirId', render: (id?: string) => (id ? rirName[id] ?? '—' : '—') },
    { title: 'Added', dataIndex: 'dateAdded', render: (d?: string) => (d ? d.slice(0, 10) : '—') },
    { title: 'Utilization', dataIndex: 'utilizationPct', align: 'right', sorter: (a, b) => a.utilizationPct - b.utilizationPct, render: (p: number) => <Progress percent={p} size="small" style={{ width: 120 }} status={p > 85 ? 'exception' : 'normal'} /> },
  ];
  const fields: FieldSpec[] = [
    { name: 'cidr', label: 'Aggregate (CIDR)', required: true, placeholder: '10.0.0.0/12' },
    { name: 'name', label: 'Name', required: true, placeholder: 'Supernet 1' },
    { name: 'rirId', label: 'RIR', type: 'select', options: rirs.map((r) => ({ value: r.id, label: r.name })) },
  ];
  return (
    <IpamListPage<CIDRBlock>
      title="Aggregates" entity="cidrBlocks" label="Aggregate" idField="cidrId" idPrefix="CIDR"
      columns={columns} fields={fields} searchPlaceholder="Search aggregates..."
      transform={(v, isEdit) => (isEdit ? v : { ...v, dateAdded: new Date().toISOString(), totalAddresses: 0, allocatedAddresses: 0, utilizationPct: 0 })}
    />
  );
}
