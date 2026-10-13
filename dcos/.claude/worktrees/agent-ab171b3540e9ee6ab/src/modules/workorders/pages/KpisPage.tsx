/** Process KPIs — cycle time, waiting time per task, SLA attainment, volumes by site and a bottleneck heatmap. */
import { useMemo, useState } from 'react';
import { Select, Typography } from 'antd';
import type { TableColumnType } from 'antd';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { VwTable } from '../../../shared/components/vw/VwTable';
import { KPICard } from '../../../shared/components/KPICard';
import { CheckCircleOutlined, ClockCircleOutlined, SafetyCertificateOutlined, WarningOutlined } from '../../../shared/icons';
import { PROCESSES } from '../../../workorders/model';
import { WorkOrdersHeader } from '../components/WorkOrdersHeader';
import { BpmnDiagram, DiagramLegend } from '../components/BpmnDiagram';
import { cycleStats, elementName, fmtHours, hoursBetween, processName, processPid, useBpmnXml, useDataCenters, useFlowNodeInstances, useInstances, useUserTasks } from '../lib/useWorkflows';
const { Text } = Typography;

interface TaskRow { key: string; process: string; task: string; count: number; avg: number; p90: number; onTime: number }

function Bars({ rows, unit, max, tone }: { rows: { label: string; value: number; sub?: string }[]; unit?: (v: number) => string; max?: number; tone?: (v: number) => 'ok' | 'warn' | undefined }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="vw-flex vw-flex-col vw-gap-xs">
      {rows.map((r) => (
        <div key={r.label} className="wf-bar-row">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
          <div className="wf-bar-track"><div className={`wf-bar-fill${tone?.(r.value) ? ` wf-bar-fill--${tone(r.value)}` : ''}`} style={{ width: `${Math.max(2, (r.value / top) * 100)}%` }} /></div>
          <span style={{ whiteSpace: 'nowrap' }}>{unit ? unit(r.value) : r.value}{r.sub && <Text type="secondary" style={{ marginLeft: 6, fontSize: 'var(--vw-font-label-xs)' }}>{r.sub}</Text>}</span>
        </div>
      ))}
      {rows.length === 0 && <div className="vw-card-description">No data yet.</div>}
    </div>
  );
}

export default function KpisPage() {
  const instances = useInstances();
  const tasks = useUserTasks();
  const fnis = useFlowNodeInstances();
  const dcs = useDataCenters();
  const instById = useMemo(() => Object.fromEntries(instances.map((i) => [i.id, i])), [instances]);
  const [now] = useState(() => Date.now());

  // cycle time per process
  const cycle = useMemo(() => PROCESSES.map((p) => ({ p, ...cycleStats(instances.filter((i) => i.definitionKey === p.key)) })).filter((r) => r.count > 0).sort((a, b) => (b.avgHours ?? 0) - (a.avgHours ?? 0)), [instances]);
  // waiting time per user task (completed visits)
  const taskRows = useMemo(() => {
    const groups: Record<string, { process: string; task: string; waits: number[]; onTime: number; total: number }> = {};
    for (const f of fnis) {
      if (f.type !== 'userTask' || !f.endedAt || f.state !== 'completed') continue;
      const inst = instById[f.instanceId]; if (!inst) continue;
      const key = `${inst.definitionKey}|${f.elementId}`;
      (groups[key] ??= { process: inst.definitionKey, task: elementName(inst.definitionKey, f.elementId), waits: [], onTime: 0, total: 0 }).waits.push(hoursBetween(f.startedAt, f.endedAt));
    }
    for (const t of tasks) {
      if (t.state !== 'completed' || !t.completedAt) continue;
      const inst = instById[t.instanceId]; if (!inst) continue;
      const g = groups[`${inst.definitionKey}|${t.elementId}`]; if (!g) continue;
      g.total += 1; if (t.completedAt <= t.dueAt) g.onTime += 1;
    }
    return Object.entries(groups).map(([key, g]) => {
      const s = [...g.waits].sort((a, b) => a - b);
      return { key, process: g.process, task: g.task, count: s.length, avg: s.reduce((a, b) => a + b, 0) / s.length, p90: s[Math.min(s.length - 1, Math.floor(s.length * 0.9))], onTime: g.total ? Math.round((g.onTime / g.total) * 100) : 100 } as TaskRow;
    }).sort((a, b) => b.avg - a.avg);
  }, [fnis, tasks, instById]);
  // SLA attainment per process
  const sla = useMemo(() => {
    const per: Record<string, { ok: number; total: number }> = {};
    for (const t of tasks) {
      if (t.state !== 'completed' || !t.completedAt) continue;
      const inst = instById[t.instanceId]; if (!inst) continue;
      const g = (per[inst.definitionKey] ??= { ok: 0, total: 0 });
      g.total += 1; if (t.completedAt <= t.dueAt) g.ok += 1;
    }
    const rows = Object.entries(per).map(([k, g]) => ({ label: `${processPid(k)} ${processName(k)}`, value: Math.round((g.ok / g.total) * 100), sub: `${g.ok}/${g.total}` })).sort((a, b) => a.value - b.value);
    const all = Object.values(per).reduce((a, g) => ({ ok: a.ok + g.ok, total: a.total + g.total }), { ok: 0, total: 0 });
    return { rows, pct: all.total ? Math.round((all.ok / all.total) * 100) : 100 };
  }, [tasks, instById]);
  // volumes by site
  const bySite = useMemo(() => {
    const per: Record<string, { active: number; done: number }> = {};
    for (const i of instances) { const k = i.dataCenterId ?? 'none'; const g = (per[k] ??= { active: 0, done: 0 }); if (i.state === 'active' || i.state === 'incident') g.active += 1; else g.done += 1; }
    return Object.entries(per).map(([k, g]) => ({ label: dcs.find((d) => d.id === k)?.code ?? (k === 'none' ? 'Estate-wide' : k), value: g.active + g.done, sub: `${g.active} running` })).sort((a, b) => b.value - a.value).slice(0, 12);
  }, [instances, dcs]);

  // bottleneck heatmap
  const busiest = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of instances) if (i.state === 'active' || i.state === 'incident') c[i.definitionKey] = (c[i.definitionKey] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? PROCESSES[0].key;
  }, [instances]);
  const [heatKey, setHeatKey] = useState<string | undefined>();
  const selectedKey = heatKey ?? busiest;
  const xml = useBpmnXml(selectedKey);
  const heat = useMemo(() => {
    const h: Record<string, { hours: number; count: number }> = {};
    for (const f of fnis) {
      if (f.state !== 'active' && f.state !== 'incident') continue;
      const inst = instById[f.instanceId]; if (!inst || inst.definitionKey !== selectedKey) continue;
      const g = (h[f.elementId] ??= { hours: 0, count: 0 }); g.hours += hoursBetween(f.startedAt, now); g.count += 1;
    }
    return h;
  }, [fnis, instById, selectedKey, now]);
  const heatValues = useMemo(() => Object.fromEntries(Object.entries(heat).map(([k, v]) => [k, Math.round(v.hours * 10) / 10])), [heat]);
  const heatLabel = (id: string) => { const g = heat[id]; return g ? `${g.count} · ${fmtHours(g.hours / g.count)} avg` : ''; };
  const worst = Object.entries(heat).sort((a, b) => b[1].hours - a[1].hours)[0];

  const overall = cycleStats(instances);
  const recent = instances.filter((i) => i.state === 'completed' && i.endedAt && hoursBetween(i.endedAt, now) < 30 * 24).length;
  const overdue = tasks.filter((t) => t.state === 'created' && new Date(t.dueAt).getTime() < now).length;

  const columns: TableColumnType<TaskRow>[] = [
    { title: 'Process', dataIndex: 'process', width: 180, render: (k: string) => `${processPid(k)} ${processName(k)}` },
    { title: 'Task', dataIndex: 'task', ellipsis: true },
    { title: 'Completed', dataIndex: 'count', width: 100, align: 'right', sorter: (a, b) => a.count - b.count },
    { title: 'Avg wait', dataIndex: 'avg', width: 100, align: 'right', render: (v: number) => fmtHours(v), sorter: (a, b) => a.avg - b.avg, defaultSortOrder: 'descend' },
    { title: 'P90', dataIndex: 'p90', width: 90, align: 'right', render: (v: number) => fmtHours(v) },
    { title: 'On time', dataIndex: 'onTime', width: 100, align: 'right', render: (v: number) => <VwChip variant={v >= 90 ? 'success' : v >= 70 ? 'warning' : 'error'}>{v}%</VwChip>, sorter: (a, b) => a.onTime - b.onTime },
  ];

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <WorkOrdersHeader title="Process KPIs" description="How long work orders take, where they wait and which steps are the bottleneck." />
      <div className="vw-grid vw-grid-cols-4 vw-gap-md">
        <KPICard title="Completed (30 d)" value={recent} icon={<CheckCircleOutlined />} iconTone="success" subtitle={`${overall.count} all time`} />
        <KPICard title="Average cycle time" value={fmtHours(overall.avgHours)} icon={<ClockCircleOutlined />} iconTone="info" subtitle={`P90 ${fmtHours(overall.p90Hours)}`} info="Mean start→end of completed instances across all processes." />
        <KPICard title="SLA attainment" value={`${sla.pct}%`} color={sla.pct >= 90 ? 'var(--vw-color-green-600)' : sla.pct >= 75 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)'} icon={<SafetyCertificateOutlined />} iconTone="success" info="Share of completed user tasks finished before their zeebe:taskSchedule due date." />
        <KPICard title="Overdue tasks" value={overdue} color={overdue ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="error" />
      </div>

      <div className="vw-grid vw-grid-cols-2 vw-gap-lg">
        <VwCard title="Cycle time per process" extra={<Text type="secondary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>mean of completed instances</Text>}>
          <Bars rows={cycle.map((r) => ({ label: `${r.p.pid} ${r.p.name}`, value: r.avgHours ?? 0, sub: `${r.count} completed · P90 ${fmtHours(r.p90Hours)}` }))} unit={fmtHours} />
        </VwCard>
        <VwCard title="SLA attainment per process" extra={<Text type="secondary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>tasks completed before due</Text>}>
          <Bars rows={sla.rows} unit={(v) => `${v}%`} max={100} tone={(v) => (v >= 90 ? 'ok' : v < 75 ? 'warn' : undefined)} />
        </VwCard>
      </div>

      <div className="vw-grid vw-gap-lg" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' }}>
        <VwCard title="Waiting time per task" extra={<Text type="secondary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>completed user-task visits</Text>}>
          <VwTable<TaskRow> rowKey="key" size="small" dataSource={taskRows} columns={columns} pagination={{ pageSize: 10, showSizeChanger: false }} />
        </VwCard>
        <VwCard title="Volumes by site">
          <Bars rows={bySite} />
        </VwCard>
      </div>

      <VwCard
        title="Bottleneck heatmap"
        extra={<div className="vw-flex vw-gap-sm vw-items-center vw-wrap">
          {worst && <VwChip variant="warning">Hottest: {elementName(selectedKey, worst[0])} · {worst[1].count} waiting · {fmtHours(worst[1].hours)} total</VwChip>}
          <Select size="small" style={{ width: 240 }} value={selectedKey} onChange={setHeatKey} options={PROCESSES.map((p) => ({ value: p.key, label: `${p.pid} · ${p.name}` }))} />
        </div>}
      >
        <div className="vw-flex vw-flex-col vw-gap-sm">
          <BpmnDiagram xml={xml.data} height={440} heat={heatValues} heatLabel={heatLabel} />
          <div className="vw-flex vw-justify-between vw-wrap vw-gap-sm">
            <DiagramLegend heat />
            <Text type="secondary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>Heat = total hours tokens have been waiting on each step right now; badge shows waiting count and average wait.</Text>
          </div>
        </div>
      </VwCard>
    </div>
  );
}
