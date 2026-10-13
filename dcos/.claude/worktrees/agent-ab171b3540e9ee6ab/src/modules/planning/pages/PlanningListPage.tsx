import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Space, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { PlusOutlined, SearchOutlined, FileTextOutlined, ClockCircleOutlined, CheckCircleOutlined, PlayCircleOutlined } from '../../../shared/icons';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { VwCard, VwChip, VwSegmented} from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import type { Plan } from '../../../mock/data/types';

const PlanningGrid = lazy(() => import('../../../shared/components/vw/VwDataGrid').then(({ VwDataGrid }) => ({ default: VwDataGrid<Plan> })));

const { Text } = Typography;
const statusColor: Record<string, string> = {
  Draft: 'default', Submitted: 'blue', 'In Review': 'gold', Approved: 'green', Executing: 'processing', Completed: 'default', Rejected: 'red', Cancelled: 'default',
};
const typeColor: Record<string, string> = {
  'New Rollout': 'geekblue', 'Capacity Expansion': 'purple', 'Network Change': 'cyan', 'Reallocation/Migration': 'orange', 'Decommission Program': 'red',
};

export default function PlanningListPage() {
  const navigate = useNavigate();
  const plans = (useEntityList('plans', { pageSize: 1000 }).data?.data ?? []) as unknown as Plan[];
  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState<string>('all');

  const m = useMemo(() => ({
    total: plans.length,
    awaiting: plans.filter((p) => ['Submitted', 'In Review'].includes(p.status)).length,
    approved: plans.filter((p) => p.status === 'Approved').length,
    executing: plans.filter((p) => p.status === 'Executing').length,
  }), [plans]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return plans.filter((p) => {
      if (bucket === 'awaiting' && !['Submitted', 'In Review'].includes(p.status)) return false;
      if (bucket === 'approved' && p.status !== 'Approved') return false;
      if (bucket === 'executing' && !['Executing', 'Completed'].includes(p.status)) return false;
      if (bucket === 'draft' && p.status !== 'Draft') return false;
      return !s || `${p.title} ${p.type} ${p.ownerName}`.toLowerCase().includes(s);
    });
  }, [plans, q, bucket]);

  const cols: ColDef<Plan>[] = [
    { headerName: 'Plan', field: 'title', minWidth: 320, flex: 2, tooltipField: 'title', cellRenderer: ({ data: p }: ICellRendererParams<Plan>) => p && <a href={`/dcos/planning/legacy/${p.id}`} onClick={(e) => { e.preventDefault(); navigate(`/planning/legacy/${p.id}`); }}>{p.title}</a> },
    { headerName: 'Type', field: 'type', minWidth: 220, flex: 1, cellRenderer: ({ value }: ICellRendererParams<Plan>) => <VwChip color={typeColor[value]}>{value}</VwChip> },
    { headerName: 'Priority', field: 'priority', width: 110 },
    { headerName: 'Risk', field: 'risk', width: 100 },
    { headerName: 'Route', field: 'execPath', width: 140, cellRenderer: ({ value: e }: ICellRendererParams<Plan>) => e ? <VwChip color={e === 'Project' ? 'geekblue' : 'gold'}>{e === 'Change' ? 'Change Req' : 'Project'}</VwChip> : '—' },
    { headerName: 'Execution', colId: 'exec', width: 130, sortable: false, cellRenderer: ({ data: p }: ICellRendererParams<Plan>) => p?.linkedProjectId ? <a onClick={() => navigate(`/delivery/projects/${p.linkedProjectId}`)}>Project →</a> : p?.linkedChangeRequestId ? <a onClick={() => navigate(`/change/${p.linkedChangeRequestId}`)}>Change →</a> : <Text type="secondary">—</Text> },
    { headerName: 'Status', field: 'status', width: 150, cellRenderer: ({ value }: ICellRendererParams<Plan>) => <VwChip color={statusColor[value]}>{value}</VwChip> },
    { headerName: 'Target', field: 'targetDate', width: 130, valueFormatter: ({ value }) => value ? value.slice(0, 10) : '—' },
  ];

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-md)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div className="vw-page-title" role="heading" aria-level={3}>Planning</div>
        <Space size={12} align="center">
          <PageDcScopeSelect />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/planning/legacy/new')}>New plan</Button>
        </Space>
      </div>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md vw-summary-grid" style={{ marginBottom: "var(--vw-space-md)" }}>
        <KPICard title="Total plans" value={m.total} icon={<FileTextOutlined />} iconTone="info" />
        <KPICard title="Awaiting approval" value={m.awaiting} icon={<ClockCircleOutlined />} iconTone="warning" />
        <KPICard title="Approved (ready to execute)" value={m.approved} icon={<CheckCircleOutlined />} iconTone="success" />
        <KPICard title="Executing" value={m.executing} icon={<PlayCircleOutlined />} iconTone="purple" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: "var(--vw-space-md)", gap: "var(--vw-space-sm)", flexWrap: 'wrap' }}>
        <VwSegmented value={bucket} onChange={(v) => setBucket(v as string)}
          options={[{ label: 'All', value: 'all' }, { label: 'Draft', value: 'draft' }, { label: 'Awaiting approval', value: 'awaiting' }, { label: 'Approved', value: 'approved' }, { label: 'Executing', value: 'executing' }]} />
        <Input allowClear prefix={<SearchOutlined />} placeholder="Search plans…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
      </div>
      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
        {filtered.length} plans
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Suspense fallback={<div className="vw-ag-grid vw-grid-loading" role="status">Loading plans…</div>}>
        <PlanningGrid rowData={filtered} columnDefs={cols}
          getRowId={({ data }) => data.id} overlayNoRowsTemplate="No plans match."
          ariaLabel="Plans" />
        </Suspense>
      </VwCard>
    </div>
  );
}
