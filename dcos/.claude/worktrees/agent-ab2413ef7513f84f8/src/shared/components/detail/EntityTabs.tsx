import { Timeline, Empty, Typography, message } from 'antd';
import { VwTable as Table } from '../vw/VwTable';
import { VwButton as Button } from '../vw/VwButton';

import { UploadOutlined } from '../../icons';
import { useEntityList } from '../../hooks/useEntityCRUD';
import type { AuditEvent, DocumentRec } from '../../../mock/data/types';
import { VwChip } from '../ux';
const { Text } = Typography;

/** Per-entity audit/history tab — reads the consolidated audit log. */
export function EntityAuditTab({ entityType, entityId }: { entityType: string; entityId: string }) {
  const events = (useEntityList('auditEvents', { filters: [{ field: 'entityType', operator: 'eq', value: entityType }, { field: 'entityId', operator: 'eq', value: entityId }], pageSize: 50 }).data?.data ?? []) as unknown as AuditEvent[];
  if (!events.length) return <Empty description="No recorded activity yet — actions on this item appear here." />;
  return (
    <Timeline items={[...events].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).map((e) => ({
      children: <span><VwChip>{e.action}</VwChip> {e.summary} · <Text type="secondary">{e.timestamp.slice(0, 16).replace('T', ' ')} · {e.actorName}</Text></span>,
    }))} />
  );
}

/** Per-entity documents tab. */
export function EntityDocumentsTab({ entityId }: { entityId: string }) {
  const docs = (useEntityList('documents', { filters: [{ field: 'linkedEntityId', operator: 'eq', value: entityId }], pageSize: 50 }).data?.data ?? []) as unknown as DocumentRec[];
  return (
    <div>
      <Button size="small" icon={<UploadOutlined />} style={{ marginBottom: "var(--vw-space-md)" }} onClick={() => message.info('Attach is stubbed in the prototype')}>Attach document</Button>
      {docs.length ? (
        <Table<DocumentRec> size="small" rowKey="id" dataSource={docs} pagination={false} scroll={{ x: 'max-content' }}
          columns={[{ title: 'Name', dataIndex: 'name' }, { title: 'Type', dataIndex: 'type', render: (t: string) => <VwChip>{t}</VwChip> }, { title: 'Owner', dataIndex: 'ownerName' }]} />
      ) : <Empty description="No documents linked to this item." />}
    </div>
  );
}
