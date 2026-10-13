/** Process KPIs — cycle time, waiting time per task, SLA attainment, volumes by site and a bottleneck heatmap. */
import { useMemo, useState } from 'react';
import { Select } from 'antd';
import { Flame, Hourglass, MapPin, ShieldCheck, Timer } from 'lucide-react';
import { Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { SoftMeter, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';
import { PROCESSES } from '../../../workorders/model';
import { WorkOrdersPage } from '../components/WorkOrdersHeader';
import { BpmnDiagram, DiagramLegend } from '../components/BpmnDiagram';
import { cycleStats, elementName, fmtHours, hoursBetween, processName, processPid, useBpmnXml, useDataCenters, useFlowNodeInstances, useInstances, useUserTasks } from '../lib/useWorkflows';

interface TaskRow { key: string; process: string; task: string; count: number; avg: number; p90: number; onTime: number }

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

  const taskTable = useMemo(() => taskRows.map((r) => ({ ...r, id: r.key })), [taskRows]);
  const cols: Col<TaskRow & { id: string }>[] = [
    { key: 'task', header: 'Task', sort: (r) => r.task, wrap: true, render: (r) => <span className="cell-2"><span>{r.task}</span><small>{processPid(r.process)} {processName(r.process)}</small></span> },
    { key: 'count', header: 'Completed', align: 'right', sort: (r) => r.count, render: (r) => <span className="num">{r.count}</span> },
    { key: 'avg', header: 'Avg wait', align: 'right', sort: (r) => r.avg, render: (r) => <span className="num">{fmtHours(r.avg)}</span> },
    { key: 'p90', header: 'P90', align: 'right', render: (r) => <span className="num">{fmtHours(r.p90)}</span> },
    { key: 'onTime', header: 'On time', sort: (r) => r.onTime, render: (r) => <Chip tone={r.onTime >= 90 ? 'success' : r.onTime >= 70 ? 'warning' : 'error'} dot>{r.onTime}%</Chip> },
  ];
  const slaColor = (v: number) => (v >= 90 ? 'var(--vw-color-emerald-400)' : v < 75 ? 'var(--vw-color-orange-400)' : undefined);

  return (
    <WorkOrdersPage title="Process KPIs" description="How long work orders take, where they wait and which steps are the bottleneck.">
      <StatGrid cols={4}>
        <StatTile label="Completed (30 d)" value={recent} sub={`${overall.count} all time`} />
        <StatTile label="Average cycle time" value={fmtHours(overall.avgHours)} sub={`P90 ${fmtHours(overall.p90Hours)} · completed instances`} />
        <StatTile label="SLA attainment" value={<>{sla.pct}<small>%</small></>} sub="user tasks finished before due" subTone={sla.pct < 75 ? 'bad' : sla.pct < 90 ? 'warn' : undefined}>
          <SoftMeter pct={sla.pct} tone={sla.pct >= 90 ? 'success' : sla.pct >= 75 ? 'warning' : 'error'} />
        </StatTile>
        <StatTile label="Overdue tasks" value={overdue} sub={overdue ? 'open tasks past due' : 'none overdue'} subTone={overdue ? 'bad' : undefined} />
      </StatGrid>

      <div className="grid g-2">
        <Panel title="Cycle time per process" sub="Mean of completed instances" icon={Timer}>
          <BarList items={cycle.map((r) => ({ key: r.p.key, label: `${r.p.pid} ${r.p.name}`, sublabel: `${r.count} completed · P90 ${fmtHours(r.p90Hours)}`, value: r.avgHours ?? 0, display: fmtHours(r.avgHours) }))} />
        </Panel>
        <Panel title="SLA attainment per process" sub="Tasks completed before due" icon={ShieldCheck}>
          <BarList max={100} items={sla.rows.map((r) => ({ key: r.label, label: r.label, sublabel: r.sub, value: r.value, display: `${r.value}%`, color: slaColor(r.value) }))} />
        </Panel>
      </div>

      <div className="grid g-2-1">
        <Panel title="Waiting time per task" sub="Completed user-task visits" icon={Hourglass} count={taskRows.length} flush>
          <DataTable rows={taskTable} cols={cols} pageSize={10} defaultSort={{ key: 'avg', dir: 'desc' }} />
        </Panel>
        <Panel title="Volumes by site" sub="Work orders per site, top 12" icon={MapPin}>
          <BarList items={bySite.map((r) => ({ key: r.label, label: r.label, sublabel: r.sub, value: r.value }))} />
        </Panel>
      </div>

      <Panel title="Bottleneck heatmap" sub="Heat = total hours tokens have been waiting on each step right now; badge shows waiting count and average wait." icon={Flame}
        actions={<>
          {worst && <Chip tone="warning" dot>Hottest: {elementName(selectedKey, worst[0])} · {worst[1].count} waiting · {fmtHours(worst[1].hours)} total</Chip>}
          <Select size="small" style={{ width: 240 }} value={selectedKey} onChange={setHeatKey} options={PROCESSES.map((p) => ({ value: p.key, label: `${p.pid} · ${p.name}` }))} />
        </>}
        foot={<DiagramLegend heat />}>
        <BpmnDiagram xml={xml.data} height={440} heat={heatValues} heatLabel={heatLabel} />
      </Panel>
    </WorkOrdersPage>
  );
}
