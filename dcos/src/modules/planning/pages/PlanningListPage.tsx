import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import type { Plan } from '../../../mock/data/types';

const STATUS_TONE: Record<string, Tone> = {
  Draft: 'neutral', Submitted: 'info', 'In Review': 'warning', Approved: 'success', Executing: 'purple', Completed: 'neutral', Rejected: 'error', Cancelled: 'neutral',
};
const TYPE_TONE: Record<string, Tone> = {
  'New Rollout': 'info', 'Capacity Expansion': 'purple', 'Network Change': 'cyan', 'Reallocation/Migration': 'orange', 'Decommission Program': 'error',
};
const BUCKETS = [
  { id: 'all', label: 'All' }, { id: 'draft', label: 'Draft' }, { id: 'awaiting', label: 'Awaiting approval' }, { id: 'approved', label: 'Approved' }, { id: 'executing', label: 'Executing' },
];

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

  const cols: Col<Plan>[] = [
    { key: 'title', header: 'Plan', sort: (p) => p.title, render: (p) => (
      <span className="cell-2"><span className="vw-card-activity-label">{p.title}</span><small>{p.planId}</small></span>
    ) },
    { key: 'type', header: 'Type', sort: (p) => p.type, render: (p) => <Chip tone={TYPE_TONE[p.type] ?? 'neutral'}>{p.type}</Chip> },
    { key: 'priority', header: 'Priority', sort: (p) => p.priority, render: (p) => p.priority },
    { key: 'risk', header: 'Risk', sort: (p) => p.risk, render: (p) => p.risk },
    { key: 'route', header: 'Route', sort: (p) => p.execPath ?? '', render: (p) => p.execPath
      ? <Chip tone={p.execPath === 'Project' ? 'info' : 'warning'}>{p.execPath === 'Change' ? 'Change Req' : 'Project'}</Chip>
      : <span className="vw-label">—</span> },
    { key: 'exec', header: 'Execution', render: (p) => p.linkedProjectId
      ? <a className="ent-link" onClick={(e) => { e.stopPropagation(); navigate(`/delivery/projects/${p.linkedProjectId}`); }}>Project →</a>
      : p.linkedChangeRequestId
        ? <a className="ent-link" onClick={(e) => { e.stopPropagation(); navigate(`/change/${p.linkedChangeRequestId}`); }}>Change →</a>
        : <span className="vw-label">—</span> },
    { key: 'status', header: 'Status', sort: (p) => p.status, render: (p) => <Chip tone={STATUS_TONE[p.status] ?? 'neutral'} dot>{p.status}</Chip> },
    { key: 'target', header: 'Target', sort: (p) => p.targetDate ?? '', render: (p) => <span className="num">{p.targetDate ? p.targetDate.slice(0, 10) : '—'}</span> },
  ];

  return (
    <OpsPage title="Planning" description="Legacy plans — approval, routing and execution into changes, projects or programmes"
      actions={<><PageDcScopeSelect /><Btn variant="filled" icon={Plus} onClick={() => navigate('/planning/legacy/new')}>New plan</Btn></>}>

      <StatGrid cols={4}>
        <StatTile label="Total plans" value={m.total} sub="all statuses" />
        <StatTile label="Awaiting approval" value={m.awaiting} sub="submitted or in review" subTone={m.awaiting ? 'warn' : undefined} />
        <StatTile label="Approved" value={m.approved} sub="ready to execute" />
        <StatTile label="Executing" value={m.executing} sub="in delivery" />
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={filtered} cols={cols} onRow={(p) => navigate(`/planning/legacy/${p.id}`)} pageSize={30}
          empty={<Empty icon={FileText} title="No plans match." />}
          toolbar={
            <ListToolbar shown={filtered.length} total={plans.length} noun="plans"
              search={{ value: q, onChange: setQ, placeholder: 'Search plans…' }}
              filters={[
                { id: 'bucket', label: 'Stage', quick: true, value: bucket, defaultValue: 'all', onChange: (v) => setBucket(v || 'all'), options: BUCKETS },
              ]} />
          } />
      </section>
    </OpsPage>
  );
}
