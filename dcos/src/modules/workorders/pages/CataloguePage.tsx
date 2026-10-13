/** Process catalogue — the twelve work-order processes, with the selected one's diagram and live heat. */
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GitBranch, Workflow } from 'lucide-react';
import { Btn, Chip, KV, Panel } from '../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { PROCESSES, PROCESS_BY_KEY } from '../../../workorders/model';
import { WorkOrdersPage } from '../components/WorkOrdersHeader';
import { BpmnDiagram, DiagramLegend } from '../components/BpmnDiagram';
import { cycleStats, fmtHours, useBpmnXml, useEngineIncidents, useInstances, useUserTasks } from '../lib/useWorkflows';

export default function CataloguePage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const instances = useInstances();
  const tasks = useUserTasks();
  const engineIncidents = useEngineIncidents();
  const selectedKey = key && PROCESS_BY_KEY[key] ? key : PROCESSES[0].key;
  const proc = PROCESS_BY_KEY[selectedKey];
  const xml = useBpmnXml(selectedKey);

  const stats = useMemo(() => {
    const byKey: Record<string, { running: number; waiting: number; incidents: number; avg?: number; completed: number }> = {};
    for (const p of PROCESSES) {
      const mine = instances.filter((i) => i.definitionKey === p.key);
      const ids = new Set(mine.filter((i) => i.state === 'active' || i.state === 'incident').map((i) => i.id));
      const cs = cycleStats(mine);
      byKey[p.key] = { running: ids.size, waiting: tasks.filter((t) => t.state === 'created' && ids.has(t.instanceId)).length, incidents: mine.filter((i) => i.state === 'incident').length, avg: cs.avgHours, completed: cs.count };
    }
    return byKey;
  }, [instances, tasks]);

  const heat = useMemo(() => {
    const h: Record<string, number> = {};
    for (const i of instances) if (i.definitionKey === selectedKey && (i.state === 'active' || i.state === 'incident')) for (const el of i.currentElementIds) h[el] = (h[el] ?? 0) + 1;
    return h;
  }, [instances, selectedKey]);

  const running = instances.filter((i) => i.state === 'active' || i.state === 'incident').length;
  const waiting = tasks.filter((t) => t.state === 'created').length;
  const overall = cycleStats(instances);
  const s = stats[selectedKey];

  return (
    <WorkOrdersPage title="Work orders" description="Camunda 8 processes DCOS runs across sites, people and systems — every record that needs coordination gets a work order.">
      <StatGrid cols={4}>
        <StatTile label="Processes" value={PROCESSES.length} sub="deployed BPMN process definitions" />
        <StatTile label="Running work orders" value={running} sub="instances with an active token" />
        <StatTile label="Waiting on people" value={waiting} sub="open user tasks" subTone={waiting ? 'warn' : undefined} />
        <StatTile label="Average cycle time" value={fmtHours(overall.avgHours)} sub={`${overall.count} completed`} />
      </StatGrid>

      <div className="grid g-1-2">
        <Panel className="is-master" title="Catalogue" sub="Pick a process to see its diagram and live heat" icon={Workflow} count={PROCESSES.length}>
          <div className="col">
            {PROCESSES.map((p) => {
              const st = stats[p.key];
              const selected = p.key === selectedKey;
              return (
                <button key={p.key} type="button" className={`chg-row wf-pick${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={() => navigate(`/workorders/processes/${p.key}`)}>
                  <span className="wf-pick-body">
                    <span className="row between" style={{ alignItems: 'flex-start' }}>
                      <b>{p.pid} · {p.name}</b>
                      <span className="row" style={{ gap: 4, flexShrink: 0 }}>
                        {st.incidents > 0 && <Chip tone="error" size="xs" dot>{st.incidents}</Chip>}
                        <Chip tone={st.running ? 'info' : 'neutral'} size="xs">{st.running} running</Chip>
                      </span>
                    </span>
                    <small>Owner: {p.owner} · {p.lanes.join(' · ')}</small>
                    <span className="row between wrap" style={{ gap: 6 }}>
                      <small>Avg cycle {fmtHours(st.avg)} · {st.waiting} waiting</small>
                      <span className="row" style={{ gap: 4 }}>{p.specIds.map((id) => <Chip key={id} tone="neutral" size="xs">{id}</Chip>)}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title={<>{proc.pid} · {proc.name}</>} sub={proc.description} icon={GitBranch}
          actions={<>
            <Chip tone="neutral">Owner · {proc.owner}</Chip>
            <Btn onClick={() => navigate(`/workorders/instances?process=${proc.key}`)}>View {s.running} running</Btn>
          </>}>
          <div className="col" style={{ gap: 14 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="ops-label" style={{ margin: 0 }}>Lanes</span>
              {proc.lanes.map((l) => <Chip key={l} tone="info">{l} · {proc.laneRoles[l]}</Chip>)}
              <span className="ops-label" style={{ margin: '0 0 0 8px' }}>Specs</span>
              {proc.specIds.map((id) => <Chip key={id} tone="neutral">{id}</Chip>)}
            </div>
            <KV cols={4} items={[
              ['Running', <span className="num strong">{s.running}</span>],
              ['Waiting on people', <span className="num strong">{s.waiting}</span>],
              ['Engine incidents', <span className="num strong" style={{ color: s.incidents ? 'var(--vw-color-red-600)' : undefined }}>{s.incidents}</span>],
              ['Avg cycle time', <span><span className="num strong">{fmtHours(s.avg)}</span> <span className="muted">· {s.completed} completed</span></span>],
            ]} />
            <BpmnDiagram xml={xml.data} height={460} heat={heat} />
            <div className="row between wrap" style={{ gap: 8 }}>
              <DiagramLegend heat />
              <span className="vw-label">Heat = running instances currently on each step · {engineIncidents.filter((e) => instances.find((i) => i.id === e.instanceId)?.definitionKey === selectedKey).length} job failure(s) open</span>
            </div>
          </div>
        </Panel>
      </div>
    </WorkOrdersPage>
  );
}
