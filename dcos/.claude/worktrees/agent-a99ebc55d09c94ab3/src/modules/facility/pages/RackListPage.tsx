import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Progress } from 'antd';
import type { TableColumnType } from 'antd';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import type { Rack } from '../../../mock/data/types';
import RackFormModal from '../components/RackFormModal';
import { useDcFilter } from '../../../core/scope/DcScope';
import { VwChip } from '../../../shared/components/ux';

export default function RackListPage() {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const [open, setOpen] = useState(false);
  const columns: TableColumnType<Rack>[] = [
    { title: 'Rack', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Purpose', dataIndex: 'purpose', render: (p: string) => <VwChip color={p === 'GPU' ? 'purple' : 'blue'}>{p}</VwChip> },
    { title: 'U used', dataIndex: 'usedU', align: 'right', render: (_: number, r) => `${r.usedU}/${r.heightU}` },
    { title: 'Power', dataIndex: 'powerUtilizationPct', width: 160, render: (v: number, r) => <span className="vw-table-progress"><Progress percent={v} size="small" status={v >= 85 ? 'exception' : 'normal'} /> <small>{r.currentPowerKw}/{r.maxPowerKw}kW</small></span>, sorter: (a, b) => a.powerUtilizationPct - b.powerUtilizationPct },
    { title: 'Redundancy', dataIndex: 'redundancy' },
    { title: 'Cooling', dataIndex: 'liquidCoolingReady', render: (v: boolean) => v ? <VwChip color="cyan">Liquid-ready</VwChip> : <VwChip>Air</VwChip> },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip>{s}</VwChip> },
  ];
  return (
    <div>
      <EntityListPage<Rack>
        title="Racks"
        entityType="racks"
        defaultFilters={dcF}
        createButtonLabel="New rack"
        onCreateClick={() => setOpen(true)}
        columns={columns}
        onRowClick={(r) => navigate(`/facility/racks/${r.id}`)}
        searchPlaceholder="Search racks..."
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'gpu', label: 'GPU / AI', filters: [{ field: 'purpose', operator: 'eq', value: 'GPU' }] },
          { key: 'hot', label: 'High power (≥85%)', filters: [{ field: 'powerUtilizationPct', operator: 'gte', value: 85 }] },
          { key: 'reserved', label: 'Reserved', filters: [{ field: 'status', operator: 'eq', value: 'Reserved' }] },
        ]}
      />
      <RackFormModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
