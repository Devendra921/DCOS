import type { TableColumnType } from 'antd';
import { IpamListPage } from '../components/IpamListPage';
import type { FieldSpec } from '../components/EntityFormModal';
import { FHRP_PROTOCOL } from '../../../mock/data/enums';
import { VwChip } from '../../../shared/components/ux';
import type { FHRPGroup } from '../../../mock/data/types';
export default function FhrpGroupPage() {
  const columns: TableColumnType<FHRPGroup>[] = [
    { title: 'Protocol', dataIndex: 'protocol', render: (p: string) => <VwChip color="geekblue">{p}</VwChip> },
    { title: 'Group ID', dataIndex: 'groupId', align: 'right', sorter: (a, b) => a.groupId - b.groupId },
    { title: 'Auth', dataIndex: 'authType', render: (a?: string) => a ?? 'none' },
    { title: 'Description', dataIndex: 'description' },
  ];
  const fields: FieldSpec[] = [
    { name: 'protocol', label: 'Protocol', type: 'select', required: true, options: FHRP_PROTOCOL.map((p) => ({ value: p, label: p })) },
    { name: 'groupId', label: 'Group ID', type: 'number', required: true, min: 1, max: 255 },
    { name: 'authType', label: 'Auth type', type: 'select', options: ['none', 'plaintext', 'md5'].map((a) => ({ value: a, label: a })) },
    { name: 'description', label: 'Description', type: 'textarea' },
  ];
  return <IpamListPage<FHRPGroup> title="FHRP Groups" entity="fhrpGroups" label="FHRP Group" idField="fhrpId" idPrefix="FHRP" columns={columns} fields={fields} nameField="protocol" initialValues={{ protocol: 'VRRP', authType: 'none' }} searchPlaceholder="Search FHRP groups..." />;
}
