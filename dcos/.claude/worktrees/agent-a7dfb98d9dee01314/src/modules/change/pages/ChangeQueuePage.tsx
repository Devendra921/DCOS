import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Space } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import type { TableColumnType } from 'antd';
import { PlusOutlined, SwapOutlined, ClockCircleOutlined, WarningOutlined, PercentageOutlined } from '../../../shared/icons';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { riskTag, statusTag } from '../components/changeUtil';
import type { ChangeRequest } from '../../../mock/data/types';
import { useDcFilter } from '../../../core/scope/DcScope';
import { VwCard, VwChip, VwSegmented} from '../../../shared/components/ux';

const BOARD_COLS = ['Draft', 'Submitted', 'UnderReview', 'Approved', 'InProgress', 'Implemented'];

export default function ChangeQueuePage() {
  const navigate = useNavigate();
  const [view, setView] = useState<'Table' | 'Board'>('Table');
  const dcF = useDcFilter();
  const all = (useEntityList('changeRequests', { pageSize: 500, filters: dcF }).data?.data ?? []) as unknown as ChangeRequest[];

  const m = useMemo(() => ({
    open: all.filter((c) => !['Closed', 'Cancelled'].includes(c.status)).length,
    awaiting: all.filter((c) => c.status === 'UnderReview').length,
    highRisk: all.filter((c) => ['High', 'Critical'].includes(c.risk) && !['Closed', 'Cancelled', 'Implemented'].includes(c.status)).length,
    failRate: (() => { const impl = all.filter((c) => c.status === 'Implemented').length; const rb = all.filter((c) => c.status === 'RolledBack').length; const d = impl + rb; return d ? Math.round((rb / d) * 100) : 0; })(),
  }), [all]);

  const columns: TableColumnType<ChangeRequest>[] = [
    { title: 'ID', dataIndex: 'chgId' },
    { title: 'Title', dataIndex: 'title', ellipsis: true },
    { title: 'Type', dataIndex: 'type', render: (t: string) => <VwChip>{t}</VwChip> },
    { title: 'Risk', dataIndex: 'risk', render: riskTag, sorter: (a, b) => ['Low', 'Medium', 'High', 'Critical'].indexOf(a.risk) - ['Low', 'Medium', 'High', 'Critical'].indexOf(b.risk) },
    { title: 'Status', dataIndex: 'status', render: statusTag },
    { title: 'Policy', dataIndex: 'policyViolations', render: (p: string[]) => p?.length ? <VwChip color="red">{p.length} violation(s)</VwChip> : <VwChip color="green">clear</VwChip> },
  ];

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div className="vw-page-title" role="heading" aria-level={3}>Change &amp; Governance</div>
        <Space>
          <VwSegmented value={view} onChange={(v) => setView(v as 'Table' | 'Board')} options={['Table', 'Board']} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/change/new')}>New change</Button>
        </Space>
      </div>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Open Changes" value={m.open} icon={<SwapOutlined />} iconTone="info" />
        <KPICard title="Awaiting Approval" value={m.awaiting} color={m.awaiting ? '#f59e0b' : undefined} icon={<ClockCircleOutlined />} iconTone="warning" />
        <KPICard title="High / Critical Open" value={m.highRisk} color={m.highRisk ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="error" />
        <KPICard title="Change Failure Rate" value={m.failRate} suffix="%" icon={<PercentageOutlined />} iconTone="purple" />
      </div>

      {view === 'Table' ? (
        <EntityListPage<ChangeRequest> title="" entityType="changeRequests" columns={columns} defaultFilters={dcF}
          onRowClick={(c) => navigate(`/change/${c.id}`)} searchPlaceholder="Search changes..."
          tabs={[
            { key: 'all', label: 'All' },
            { key: 'review', label: 'Awaiting approval', filters: [{ field: 'status', operator: 'eq', value: 'UnderReview' }] },
            { key: 'crit', label: 'Critical', filters: [{ field: 'risk', operator: 'eq', value: 'Critical' }] },
            { key: 'inprog', label: 'In progress', filters: [{ field: 'status', operator: 'eq', value: 'InProgress' }] },
          ]} />
      ) : (
        <div style={{ display: 'flex', gap: "var(--vw-space-md)", overflowX: 'auto', paddingBottom: "var(--vw-space-xxs)" }}>
          {BOARD_COLS.map((col) => {
            const items = all.filter((c) => c.status === col);
            return (
              <div key={col} style={{ flex: '0 0 260px', width: 260 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", marginBottom: "var(--vw-space-sm)" }}>
                  <span style={{ fontSize: "var(--vw-font-label-sm)", fontWeight: 600, color: "var(--vw-color-slate-500)" }}>{col}</span>
                  <VwChip>{items.length}</VwChip>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--vw-space-sm)", maxHeight: 560, overflowY: 'auto', paddingRight: 2 }}>
                  {items.length === 0 ? (
                    <div style={{ fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-400)", textAlign: 'center', padding: '16px 0' }}>No changes</div>
                  ) : items.map((c) => (
                    <VwCard key={c.id} size="small" hoverable onClick={() => navigate(`/change/${c.id}`)} bodyStyle={{ padding: 10 }}>
                      <div style={{ fontSize: "var(--vw-font-label-sm)", marginBottom: "var(--vw-space-sm)", lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.title}</div>
                      <Space size={[4, 4]} wrap>{riskTag(c.risk)}<VwChip>{c.type}</VwChip></Space>
                    </VwCard>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
