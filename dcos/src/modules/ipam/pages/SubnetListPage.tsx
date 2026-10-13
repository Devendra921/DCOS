import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TableColumnType } from 'antd';
import { List, Network } from 'lucide-react';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import { Chip, Seg } from '../../../ops/ui/kit';
import { Meter } from '../../../ops/ui/status';
import type { Tone } from '../../../ops/lib/tone';
import type { Subnet } from '../../../mock/data/types';
import SubnetFormModal from '../components/SubnetFormModal';
import PrefixTree from '../components/PrefixTree';
import { useDcFilter } from '../../../core/scope/DcScope';

const statusTone: Record<string, Tone> = { Container: 'purple', Active: 'success', Reserved: 'warning', Deprecated: 'neutral' };

export default function SubnetListPage() {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'flat' | 'tree'>('flat');
  const columns: TableColumnType<Subnet>[] = [
    { title: 'Prefix', dataIndex: 'cidr', sorter: (a, b) => a.cidr.localeCompare(b.cidr), render: (_: string, s) => (
      <span className="cell-2"><span className="vw-card-activity-label mono">{s.cidr}</span><small>{s.name || '—'}</small></span>
    ) },
    { title: 'Status', dataIndex: 'status', render: (st: string) => st ? <Chip tone={statusTone[st] ?? 'neutral'} dot>{st}</Chip> : <span className="vw-label">—</span> },
    { title: 'Purpose', dataIndex: 'purpose', render: (p: string) => p ? <Chip>{p}</Chip> : <span className="vw-label">—</span> },
    { title: 'Utilisation', dataIndex: 'utilizationPct', sorter: (a, b) => a.utilizationPct - b.utilizationPct, render: (v: number, s) => (
      <span className="cell-2">
        <Meter pct={v} width={84} color={v >= 85 ? 'var(--vw-color-red-500)' : 'var(--primaryColor500)'} />
        <small>{s.usedHosts}/{s.totalHosts} hosts</small>
      </span>
    ) },
    { title: 'State', dataIndex: 'state', render: (st: string) => <Chip tone={st === 'Consumed' ? 'error' : st === 'Committed' ? 'warning' : 'success'}>{st}</Chip> },
    { title: 'Exhaustion', dataIndex: 'forecastExhaustionDate', render: (d?: string) => d ? <span className="num">{d.slice(0, 10)}</span> : <span className="vw-label">—</span> },
  ];
  const viewToggle = (
    <Seg<'flat' | 'tree'>
      size="sm"
      value={view}
      onChange={setView}
      options={[
        { id: 'flat', label: 'Flat', icon: List },
        { id: 'tree', label: 'Tree', icon: Network },
      ]}
    />
  );
  return (
    <div>
      {view === 'tree' ? (
        <>
          <div className="ops-root">
            <div className="row between wrap" style={{ marginBottom: 'var(--vw-space-lg)' }}>
              <h3 className="vw-page-title">Prefixes</h3>
              {viewToggle}
            </div>
          </div>
          <PrefixTree />
        </>
      ) : (
        <EntityListPage<Subnet>
          title="Prefixes"
          entityType="subnets"
          defaultFilters={dcF}
          createButtonLabel="New prefix"
          onCreateClick={() => setOpen(true)}
          columns={columns}
          onRowClick={(s) => navigate(`/ipam/subnets/${s.id}`)}
          searchPlaceholder="Search prefixes..."
          headerExtra={viewToggle}
          tabs={[
            { key: 'all', label: 'All' },
            { key: 'containers', label: 'Containers', filters: [{ field: 'status', operator: 'eq', value: 'Container' }] },
            { key: 'hot', label: 'Nearing exhaustion (≥85%)', filters: [{ field: 'utilizationPct', operator: 'gte', value: 85 }] },
            { key: 'prod', label: 'Production', filters: [{ field: 'purpose', operator: 'eq', value: 'Production' }] },
            { key: 'mgmt', label: 'Management', filters: [{ field: 'purpose', operator: 'eq', value: 'Management' }] },
          ]}
        />
      )}
      <SubnetFormModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
