import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Typography } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { WarningOutlined, StopOutlined, ExclamationCircleOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { KPICard } from '../../../shared/components/KPICard';
import type { PolicyDecision } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;

export default function ViolationsPage() {
  const navigate = useNavigate();
  const decisions = (useEntityList('policyDecisions', { pageSize: 1000 }).data?.data ?? []) as unknown as PolicyDecision[];
  const violations = useMemo(
    () => decisions.filter((d) => d.violated).sort((a, b) => (a.evaluatedAt < b.evaluatedAt ? 1 : -1)),
    [decisions],
  );
  const denies = violations.filter((v) => v.decision === 'deny').length;
  const warns = violations.filter((v) => v.decision === 'warn').length;
  const { visible, hasMore, sentinelRef, total } = useScrollReveal(violations, 25);

  const cols: TableColumnType<PolicyDecision>[] = [
    { title: 'Raised', dataIndex: 'evaluatedAt', render: (t: string) => t.slice(0, 10), width: 110 },
    { title: 'Policy', dataIndex: 'policyName' },
    { title: 'Resource', dataIndex: 'resourceName', render: (n: string, r) => <span>{n} <VwChip>{r.resourceType}</VwChip></span> },
    { title: 'Outcome', dataIndex: 'decision', render: (d: string, r) => <VwChip color={d === 'deny' ? 'red' : 'orange'}>{d === 'deny' ? 'Blocked' : 'Warned'} · {r.enforcement}</VwChip> },
    { title: 'Message', dataIndex: 'message', ellipsis: true },
    { title: 'Change', dataIndex: 'changeRequestId', render: (id?: string) => id ? <a onClick={() => navigate(`/change/${id}`)}>view →</a> : <Text type="secondary">—</Text> },
  ];

  return (
    <div>
      <h1 className="vw-card-section vw-page-title" style={{ margin: 0 }}>Policy violations</h1>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md" style={{ margin: '12px 0' }}>
        <KPICard title="Open violations" value={violations.length} color="#f59e0b" icon={<WarningOutlined />} iconTone="warning" />
        <KPICard title="Blocked (deny)" value={denies} color="var(--vw-color-red-600)" icon={<StopOutlined />} iconTone="error" />
        <KPICard title="Warned" value={warns} color="#f59e0b" icon={<ExclamationCircleOutlined />} iconTone="warning" />
      </div>
      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
        Showing {visible.length} of {total} violations
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Table<PolicyDecision> rowKey="id" size="small" dataSource={visible} columns={cols} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }} />
        {visible.length > 0 && hasMore && (
          <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>
    </div>
  );
}
