/** Work orders list — every process instance, filterable by process, state and site. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Input, Select, Typography } from 'antd';
import type { TableColumnType } from 'antd';
import type * as T from '../../../mock/data/types';
import { VwTable } from '../../../shared/components/vw/VwTable';
import { VwCard, VwChip, VwSegmented } from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';
import { PlayCircleOutlined, WarningOutlined, ClockCircleOutlined, CheckCircleOutlined } from '../../../shared/icons';
import { PROCESSES } from '../../../workorders/model';
import { WorkOrdersHeader } from '../components/WorkOrdersHeader';
import {
  RECORD_LABEL, STATE_LABEL, STATE_TONE, describeInstance, fmtAgo, fmtDue, fmtHours, hoursBetween, processName, processPid, recordPath,
  useDataCenters, useInstances, useUserTasks,
} from '../lib/useWorkflows';
const { Text } = Typography;

type StateFilter = 'all' | T.ProcessInstanceState;

export default function InstancesPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const instances = useInstances();
  const tasks = useUserTasks();
  const dcs = useDataCenters();
  const [process, setProcess] = useState<string>(params.get('process') ?? 'all');
  const [state, setState] = useState<StateFilter>((params.get('state') as StateFilter) ?? 'all');
  const [site, setSite] = useState<string>('all');
  const [q, setQ] = useState('');

  const dcById = useMemo(() => Object.fromEntries(dcs.map((d) => [d.id, d])), [dcs]);
  const openByInstance = useMemo(() => {
    const m: Record<string, T.ProcessUserTask[]> = {};
    for (const t of tasks) if (t.state === 'created') (m[t.instanceId] ??= []).push(t);
    return m;
  }, [tasks]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return instances
      .filter((i) => (process === 'all' || i.definitionKey === process) && (state === 'all' || i.state === state) && (site === 'all' || i.dataCenterId === site))
      .filter((i) => !needle || i.businessKey.toLowerCase().includes(needle) || String(i.variables.title ?? '').toLowerCase().includes(needle) || i.id.toLowerCase().includes(needle))
      .sort((a, b) => (a.state === 'incident' ? -1 : b.state === 'incident' ? 1 : a.startedAt < b.startedAt ? 1 : -1));
  }, [instances, process, state, site, q]);

  const counts = {
    running: instances.filter((i) => i.state === 'active').length,
    incident: instances.filter((i) => i.state === 'incident').length,
    overdue: instances.filter((i) => (openByInstance[i.id] ?? []).some((t) => new Date(t.dueAt).getTime() < Date.now())).length,
    completed: instances.filter((i) => i.state === 'completed').length,
  };

  const columns: TableColumnType<T.ProcessInstance>[] = [
    { title: 'ID', dataIndex: 'id', width: 110, render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 'var(--vw-font-label-xs)' }}>{v}</Text> },
    { title: 'Process', dataIndex: 'definitionKey', width: 190, render: (k: string) => <span><Text type="secondary">{processPid(k)}</Text> {processName(k)}</span>, sorter: (a, b) => a.definitionKey.localeCompare(b.definitionKey) },
    {
      title: 'Business key', key: 'bk', width: 260, render: (_: unknown, r) => (
        <div style={{ minWidth: 0 }}>
          <Link to={recordPath(r.recordType, r.recordId)} onClick={(e) => e.stopPropagation()}>{r.businessKey}</Link>
          <Text type="secondary" style={{ marginLeft: 6, fontSize: 'var(--vw-font-label-xs)' }}>{RECORD_LABEL[r.recordType]}</Text>
          <div className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(r.variables.title ?? '')}</div>
        </div>
      ),
    },
    { title: 'Site', dataIndex: 'dataCenterId', width: 90, render: (id?: string) => (id && dcById[id] ? <VwChip variant="neutral">{dcById[id].code}</VwChip> : <Text type="secondary">—</Text>) },
    { title: 'Current step', key: 'step', ellipsis: true, render: (_: unknown, r) => describeInstance(r, tasks).step },
    { title: 'Waiting on', key: 'who', width: 200, ellipsis: true, render: (_: unknown, r) => describeInstance(r, tasks).waitingOn },
    { title: 'State', dataIndex: 'state', width: 110, render: (s: T.ProcessInstanceState) => <VwChip variant={STATE_TONE[s]}>{STATE_LABEL[s]}</VwChip> },
    { title: 'Started', dataIndex: 'startedAt', width: 110, render: (d: string) => fmtAgo(d), sorter: (a, b) => a.startedAt.localeCompare(b.startedAt), defaultSortOrder: 'descend' },
    {
      title: 'SLA / due', key: 'sla', width: 140, render: (_: unknown, r) => {
        if (r.state === 'completed' || r.state === 'cancelled') return <Text type="secondary">cycle {fmtHours(hoursBetween(r.startedAt, r.endedAt))}</Text>;
        const open = (openByInstance[r.id] ?? []).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
        if (!open) return <Text type="secondary">—</Text>;
        const d = fmtDue(open.dueAt);
        return <Text strong={d.overdue} style={{ color: d.overdue ? 'var(--vw-color-red-600)' : undefined }}>{d.text}</Text>;
      },
    },
  ];

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <WorkOrdersHeader title="Work orders" description="Running and finished process instances, each bound to the record it coordinates." />
      <div className="vw-grid vw-grid-cols-4 vw-gap-md">
        <KPICard title="Running" value={counts.running} icon={<PlayCircleOutlined />} iconTone="info" onClick={() => setState('active')} />
        <KPICard title="Engine incidents" value={counts.incident} color={counts.incident ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="error" onClick={() => setState('incident')} />
        <KPICard title="Overdue tasks" value={counts.overdue} color={counts.overdue ? 'var(--vw-color-orange-700)' : undefined} icon={<ClockCircleOutlined />} iconTone="warning" info="Running instances with at least one user task past its due date." />
        <KPICard title="Completed" value={counts.completed} icon={<CheckCircleOutlined />} iconTone="success" onClick={() => setState('completed')} />
      </div>
      <VwCard
        title={`${rows.length} work orders`}
        extra={<div className="vw-flex vw-gap-sm vw-items-center vw-wrap">
          <Select size="small" style={{ width: 220 }} value={process} onChange={setProcess} options={[{ value: 'all', label: 'All processes' }, ...PROCESSES.map((p) => ({ value: p.key, label: `${p.pid} · ${p.name}` }))]} />
          <Select size="small" style={{ width: 150 }} value={site} onChange={setSite} showSearch optionFilterProp="label" options={[{ value: 'all', label: 'All sites' }, ...dcs.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))]} />
          <VwSegmented size="small" value={state} onChange={setState} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Running' }, { value: 'incident', label: 'Incident' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]} />
          <Input.Search size="small" allowClear placeholder="Business key, title or id" style={{ width: 220 }} onChange={(e) => setQ(e.target.value)} />
        </div>}
      >
        <VwTable<T.ProcessInstance> rowKey="id" size="small" dataSource={rows} columns={columns} pagination={{ pageSize: 20, showSizeChanger: false }}
          onRow={(r) => ({ onClick: () => navigate(`/workorders/instances/${r.id}`), style: { cursor: 'pointer' } })} />
      </VwCard>
    </div>
  );
}
