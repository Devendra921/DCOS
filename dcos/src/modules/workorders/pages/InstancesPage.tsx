/** Work orders list — every process instance, filterable by process, state and site. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type * as T from '../../../mock/data/types';
import { Chip } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { PROCESSES } from '../../../workorders/model';
import { WorkOrdersPage } from '../components/WorkOrdersHeader';
import {
  RECORD_LABEL, STATE_LABEL, STATE_TONE, describeInstance, fmtAgo, fmtDue, fmtHours, hoursBetween, processName, processPid, recordPath,
  useDataCenters, useInstances, useUserTasks,
} from '../lib/useWorkflows';

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

  const STATES: { id: StateFilter; label: string }[] = [{ id: 'active', label: 'Running' }, { id: 'incident', label: 'Incident' }, { id: 'completed', label: 'Completed' }, { id: 'cancelled', label: 'Cancelled' }];
  const toggleState = (v: StateFilter) => setState(state === v ? 'all' : v);

  const cols: Col<T.ProcessInstance>[] = [
    {
      key: 'bk', header: 'Work order', sort: (r) => r.businessKey, render: (r) => (
        <span className="cell-2">
          <span><Link className="ent-link" to={recordPath(r.recordType, r.recordId)} onClick={(e) => e.stopPropagation()}>{r.businessKey}</Link> <span className="vw-label">{RECORD_LABEL[r.recordType]}</span></span>
          <small>{String(r.variables.title ?? '') || <span className="mono">{r.id}</span>}</small>
        </span>
      ),
    },
    { key: 'process', header: 'Process', sort: (r) => r.definitionKey, render: (r) => <span className="cell-2"><span>{processName(r.definitionKey)}</span><small className="mono">{processPid(r.definitionKey)} · {r.id}</small></span> },
    { key: 'site', header: 'Site', sort: (r) => (r.dataCenterId && dcById[r.dataCenterId]?.code) || '', render: (r) => (r.dataCenterId && dcById[r.dataCenterId] ? <span className="cell-2"><span className="mono">{dcById[r.dataCenterId].code}</span><small>{dcById[r.dataCenterId].name}</small></span> : <span className="vw-label">—</span>) },
    { key: 'step', header: 'Current step', wrap: true, render: (r) => { const d = describeInstance(r, tasks); return <span className="cell-2"><span>{d.step}</span><small>{d.waitingOn}</small></span>; } },
    { key: 'state', header: 'State', sort: (r) => r.state, render: (r) => <Chip tone={STATE_TONE[r.state] as Tone} dot>{STATE_LABEL[r.state]}</Chip> },
    { key: 'started', header: 'Started', sort: (r) => r.startedAt, render: (r) => <span className="num">{fmtAgo(r.startedAt)}</span> },
    {
      key: 'sla', header: 'SLA / due', render: (r) => {
        if (r.state === 'completed' || r.state === 'cancelled') return <span className="vw-label">cycle {fmtHours(hoursBetween(r.startedAt, r.endedAt))}</span>;
        const open = [...(openByInstance[r.id] ?? [])].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
        if (!open) return <span className="vw-label">—</span>;
        const d = fmtDue(open.dueAt);
        return d.overdue ? <Chip tone="error" dot>{d.text}</Chip> : <span className="num">{d.text}</span>;
      },
    },
  ];

  return (
    <WorkOrdersPage title="Work orders" description="Running and finished process instances, each bound to the record it coordinates.">
      <StatGrid cols={4}>
        <StatTile label="Running" value={counts.running} sub={`${instances.length} work orders in total`} onClick={() => toggleState('active')} active={state === 'active'} />
        <StatTile label="Engine incidents" value={counts.incident} sub={counts.incident ? 'job failures to retry' : 'none open'} subTone={counts.incident ? 'bad' : undefined} onClick={() => toggleState('incident')} active={state === 'incident'} />
        <StatTile label="Overdue tasks" value={counts.overdue} sub="running, with a user task past due" subTone={counts.overdue ? 'warn' : undefined} />
        <StatTile label="Completed" value={counts.completed} sub="finished work orders" onClick={() => toggleState('completed')} active={state === 'completed'} />
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable<T.ProcessInstance> rows={rows} cols={cols} pageSize={20} defaultSort={{ key: 'started', dir: 'desc' }} onRow={(r) => navigate(`/workorders/instances/${r.id}`)}
          toolbar={
            <ListToolbar shown={rows.length} total={instances.length} noun="work orders"
              search={{ value: q, onChange: setQ, placeholder: 'Business key, title or id' }}
              filters={[
                { id: 'process', label: 'Process', quick: true, value: process, defaultValue: 'all', anyLabel: 'All processes', onChange: (v) => setProcess(v || 'all'), options: PROCESSES.map((p) => ({ id: p.key, label: `${p.pid} · ${p.name}`, count: instances.filter((i) => i.definitionKey === p.key).length })) },
                { id: 'site', label: 'Site', quick: true, value: site, defaultValue: 'all', anyLabel: 'All sites', onChange: (v) => setSite(v || 'all'), options: dcs.map((d) => ({ id: d.id, label: `${d.code} · ${d.name}`, count: instances.filter((i) => i.dataCenterId === d.id).length })) },
                { id: 'state', label: 'State', value: state, defaultValue: 'all', anyLabel: 'All states', onChange: (v) => setState((v || 'all') as StateFilter), options: STATES.map((x) => ({ id: x.id, label: x.label, count: instances.filter((i) => i.state === x.id).length })) },
              ]} />
          } />
      </section>
    </WorkOrdersPage>
  );
}
