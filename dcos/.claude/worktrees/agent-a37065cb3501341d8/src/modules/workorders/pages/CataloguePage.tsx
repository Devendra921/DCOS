/** Process catalogue — the twelve work-order processes, with the selected one's diagram and live heat. */
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { BranchesOutlined, PlayCircleOutlined, UserOutlined, ClockCircleOutlined, WarningOutlined } from '../../../shared/icons';
import { PROCESSES, PROCESS_BY_KEY } from '../../../workorders/model';
import { WorkOrdersHeader } from '../components/WorkOrdersHeader';
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
    <div className="vw-flex vw-flex-col vw-page-gap">
      <WorkOrdersHeader title="Work orders" description="Camunda 8 processes DCOS runs across sites, people and systems — every record that needs coordination gets a work order." />
      <div className="vw-grid vw-grid-cols-4 vw-gap-md">
        <KPICard title="Processes" value={PROCESSES.length} icon={<BranchesOutlined />} iconTone="info" info="Deployed BPMN process definitions (one per catalogue entry)." />
        <KPICard title="Running work orders" value={running} icon={<PlayCircleOutlined />} iconTone="cyan" info="Process instances with at least one active token." />
        <KPICard title="Waiting on people" value={waiting} icon={<UserOutlined />} iconTone="warning" info="Open user tasks across all running instances." />
        <KPICard title="Average cycle time" value={fmtHours(overall.avgHours)} icon={<ClockCircleOutlined />} iconTone="success" subtitle={`${overall.count} completed`} info="Mean start→end duration of completed instances." />
      </div>

      <div className="vw-grid vw-gap-lg" style={{ gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)' }}>
        <VwCard title="Catalogue" bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 'var(--vw-space-sm)' }}>
          {PROCESSES.map((p) => {
            const st = stats[p.key];
            const selected = p.key === selectedKey;
            return (
              <VwCard key={p.key} variant="child" tone={selected ? 'info' : undefined} onClick={() => navigate(`/workorders/processes/${p.key}`)}>
                <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
                  <div className="vw-card-title" style={{ minWidth: 0 }}>{p.pid} · {p.name}</div>
                  <div className="vw-flex vw-gap-xs vw-items-center">
                    {st.incidents > 0 && <VwChip variant="error" icon={<WarningOutlined />}>{st.incidents}</VwChip>}
                    <VwChip variant={st.running ? 'info' : 'neutral'}>{st.running} running</VwChip>
                  </div>
                </div>
                <div className="vw-card-description" style={{ marginTop: 2 }}>Owner: {p.owner} · {p.lanes.join(' · ')}</div>
                <div className="vw-flex vw-justify-between vw-gap-sm vw-wrap" style={{ marginTop: 'var(--vw-space-xs)', fontSize: 'var(--vw-font-label-xs)' }}>
                  <span className="vw-text-tertiary">Avg cycle {fmtHours(st.avg)} · {st.waiting} waiting</span>
                  <span className="vw-flex vw-gap-xs">{p.specIds.map((id) => <VwChip key={id} variant="neutral" style={{ fontSize: 10 }}>{id}</VwChip>)}</span>
                </div>
              </VwCard>
            );
          })}
        </VwCard>

        <VwCard
          title={<span>{proc.pid} · {proc.name}</span>}
          extra={<div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
            <VwChip variant="neutral">Owner · {proc.owner}</VwChip>
            <Link className="nst-btn nst-btn--sm" to={`/workorders/instances?process=${proc.key}`}>View {s.running} running</Link>
          </div>}
        >
          <div className="vw-flex vw-flex-col vw-gap-md">
            <div className="vw-card-description">{proc.description}</div>
            <div className="vw-flex vw-gap-xs vw-wrap vw-items-center">
              <span className="vw-card-metric-label">Lanes</span>
              {proc.lanes.map((l) => <VwChip key={l} variant="info">{l} · {proc.laneRoles[l]}</VwChip>)}
              <span className="vw-card-metric-label" style={{ marginLeft: 'var(--vw-space-sm)' }}>Specs</span>
              {proc.specIds.map((id) => <VwChip key={id} variant="neutral">{id}</VwChip>)}
            </div>
            <div className="vw-grid vw-grid-cols-4 vw-gap-sm">
              <VwCard variant="child-shaded"><div className="vw-card-metric-label">Running</div><div className="vw-card-metric-lg">{s.running}</div></VwCard>
              <VwCard variant="child-shaded"><div className="vw-card-metric-label">Waiting on people</div><div className="vw-card-metric-lg">{s.waiting}</div></VwCard>
              <VwCard variant="child-shaded"><div className="vw-card-metric-label">Engine incidents</div><div className="vw-card-metric-lg" style={{ color: s.incidents ? 'var(--vw-color-red-600)' : undefined }}>{s.incidents}</div></VwCard>
              <VwCard variant="child-shaded"><div className="vw-card-metric-label">Avg cycle time</div><div className="vw-card-metric-lg">{fmtHours(s.avg)}</div><div className="vw-card-metric-label-sub">{s.completed} completed</div></VwCard>
            </div>
            <BpmnDiagram xml={xml.data} height={460} heat={heat} />
            <div className="vw-flex vw-justify-between vw-items-center vw-wrap vw-gap-sm">
              <DiagramLegend heat />
              <span className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>Heat = running instances currently on each step · {engineIncidents.filter((e) => instances.find((i) => i.id === e.instanceId)?.definitionKey === selectedKey).length} job failure(s) open</span>
            </div>
          </div>
        </VwCard>
      </div>
    </div>
  );
}
