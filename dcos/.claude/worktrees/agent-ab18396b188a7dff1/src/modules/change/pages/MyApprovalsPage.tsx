import { App, Space } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { useNavigate } from 'react-router-dom';
import type { TableColumnType } from 'antd';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import { VwChip } from '../../../shared/components/ux';
import { useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { riskTag } from '../components/changeUtil';
import type { ChangeRequest } from '../../../mock/data/types';

export default function MyApprovalsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const update = useEntityUpdate('changeRequests');
  const decide = (c: ChangeRequest, status: string) => update.mutate({ id: c.id, data: { status } }, { onSuccess: () => message.success(`${c.chgId} ${status}`) });
  const columns: TableColumnType<ChangeRequest>[] = [
    { title: 'ID', dataIndex: 'chgId' },
    { title: 'Title', dataIndex: 'title', ellipsis: true },
    { title: 'Type', dataIndex: 'type', render: (t: string) => <VwChip>{t}</VwChip> },
    { title: 'Risk', dataIndex: 'risk', render: riskTag },
    { title: 'Policy', dataIndex: 'policyViolations', render: (p: string[]) => p?.length ? <VwChip color="red">{p.length}</VwChip> : <VwChip color="green">clear</VwChip> },
  ];
  return (
    <div>
      <EntityListPage<ChangeRequest>
        title="My Approvals"
        entityType="changeRequests"
        columns={columns}
        defaultFilters={[{ field: 'status', operator: 'eq', value: 'UnderReview' }]}
        onRowClick={(c) => navigate(`/change/${c.id}`)}
        rowActions={(c) => (
          <Space>
            <Button size="small" type="primary" onClick={() => decide(c, 'Approved')}>Approve</Button>
            <Button size="small" danger onClick={() => decide(c, 'Rejected')}>Reject</Button>
          </Space>
        )}
      />
    </div>
  );
}
