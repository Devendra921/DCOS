import { useState } from 'react';
import { App, Descriptions, Select, Timeline } from 'antd';
import { AlertOctagon, History, Network } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { VwChip } from '../../../shared/components/ux';
import { Chip, Empty, Tabs } from '../../../ops/ui/kit';
import { DataTable } from '../../../ops/ui/DataTable';
import type { Tone } from '../../../ops/lib/tone';
import { useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { TASK_STATUS } from '../../../mock/data/enums';
import { TEMPLATE_REGISTRY } from '../lib/projectTemplates';
import { useProjectImpact, useProjectChangeLog, useRelatedIncidents } from '../lib/useProject360';
import type { Project, Task } from '../../../mock/data/types';

const SEV_TONE: Record<string, Tone> = { SEV1: 'error', SEV2: 'orange', SEV3: 'warning', SEV4: 'neutral', Critical: 'error', Major: 'orange', Minor: 'warning' };
const Hint = ({ children }: { children: React.ReactNode }) => <div className="muted" style={{ fontSize: 'var(--vw-font-label-sm)' }}>{children}</div>;

// ── Template-aware overview ─────────────────────────────────────────
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)" }}>{label}</span>
      <span style={{ fontSize: "var(--vw-font-label-md)", color: "var(--vw-color-slate-900)" }}>{children}</span>
    </div>
  );
}

/** Compact one-strip overview: who/what/when + any captured intake fields. No
 *  empty "not captured" rows and no Budget/Spend (that's in the KPI cards). */
export function ProjectTemplateOverview({ project }: { project: Project }) {
  const def = TEMPLATE_REGISTRY[project.template as keyof typeof TEMPLATE_REGISTRY];
  let detail: Record<string, unknown> = {};
  try { detail = project.notes ? JSON.parse(project.notes) : {}; } catch { detail = {}; }
  const captured = (def?.fields ?? []).filter((f) => detail[f.name] !== undefined && detail[f.name] !== '');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 28px' }}>
      <Meta label="Manager">{project.managerName}</Meta>
      <Meta label="Template"><span className="row" style={{ gap: 4, display: 'inline-flex' }}>{project.template ? <Chip tone="info">{project.template}</Chip> : '—'}{def && <Chip>{def.category}</Chip>}</span></Meta>
      <Meta label="Planned">{project.plannedStart.slice(0, 10)} → {project.plannedEnd.slice(0, 10)}</Meta>
      {captured.map((f) => <Meta key={f.name} label={f.label}>{`${detail[f.name]}${f.suffix ? ' ' + f.suffix : ''}`}</Meta>)}
      {def && <span className="vw-text-tertiary" style={{ flexBasis: '100%', fontSize: "var(--vw-font-label-sm)" }}>{def.description}</span>}
    </div>
  );
}

// ── Impacted entities (blast radius) ────────────────────────────────
export function ProjectImpactTab({ project }: { project: Project }) {
  const navigate = useNavigate();
  const imp = useProjectImpact(project);
  const [picked, setPicked] = useState<string>();
  if (imp.total === 0 && imp.provisioned.length === 0) return <Empty icon={Network} title="No impacted entities">No impacted entities derived for this project's data center.</Empty>;

  const tab = (id: string, label: string, n: number, node: React.ReactNode) => n > 0 ? { id, label, count: n, node } : null;
  const items = [
    tab('racks', 'Racks', imp.racks.length, (
      <DataTable rows={imp.racks} pageSize={1000} onRow={(r) => navigate(`/facility/racks/${r.id}`)}
        cols={[{ key: 'n', header: 'Rack', render: (r) => r.name }, { key: 'u', header: 'Used U', align: 'right', render: (r) => <span className="num">{r.usedU}/{r.heightU}</span> }, { key: 'p', header: 'Power %', align: 'right', render: (r) => <span className="num">{r.powerUtilizationPct != null ? `${r.powerUtilizationPct}%` : '—'}</span> }]} />
    )),
    tab('devices', 'Devices', imp.devices.length, (
      <DataTable rows={imp.devices} pageSize={1000} onRow={(d) => navigate(`/facility/devices/${d.id}`)}
        cols={[{ key: 'n', header: 'Device', render: (d) => d.name }, { key: 'c', header: 'Category', render: (d) => <Chip>{d.category}</Chip> }, { key: 's', header: 'Status', render: (d) => d.status }]} />
    )),
    tab('cabling', 'Cabling', imp.cables.length, (
      <DataTable rows={imp.cables} pageSize={1000}
        cols={[{ key: 'l', header: 'Label', render: (c) => c.label ?? '—' }, { key: 't', header: 'Type', render: (c) => <Chip>{c.cableType}</Chip> }, { key: 's', header: 'Status', render: (c) => <Chip>{c.status}</Chip> }]} />
    )),
    tab('halls', 'Halls', imp.halls.length, (
      <DataTable rows={imp.halls} pageSize={1000} onRow={(h) => navigate(`/facility/hall/${h.id}`)}
        cols={[{ key: 'n', header: 'Hall', render: (h) => h.name }, { key: 'r', header: 'Racks', align: 'right', render: (h) => <span className="num">{h.rackCount}</span> }, { key: 'u', header: 'Utilization', align: 'right', render: (h) => <span className="num">{h.utilizationPct}%</span> }]} />
    )),
    tab('vlans', 'VLANs', imp.vlans.length, (
      <DataTable rows={imp.vlans} pageSize={1000}
        cols={[{ key: 'v', header: 'VLAN', render: (v) => <span className="num">{v.vlanNumber}</span> }, { key: 'n', header: 'Name', render: (v) => v.name }, { key: 's', header: 'Status', render: (v) => <Chip>{v.status}</Chip> }]} />
    )),
    tab('circuits', 'Circuits', imp.circuits.length, (
      <DataTable rows={imp.circuits} pageSize={1000} onRow={(c) => navigate(`/circuits/${c.id}`)}
        cols={[{ key: 'c', header: 'Circuit', render: (c) => c.cid }, { key: 's', header: 'Status', render: (c) => <Chip>{c.status}</Chip> }]} />
    )),
    tab('provisioned', 'Provisioned', imp.provisioned.length, (
      <DataTable rows={imp.provisioned} pageSize={1000} onRow={(d) => navigate(`/facility/devices/${d.id}`)}
        cols={[{ key: 'n', header: 'Device', render: (d) => d.name }, { key: 'c', header: 'Category', render: (d) => <Chip>{d.category}</Chip> }, { key: 's', header: 'Status', render: (d) => <Chip tone="success">{d.status}</Chip> }]} />
    )),
  ].filter(Boolean) as { id: string; label: string; count: number; node: React.ReactNode }[];
  const active = items.find((i) => i.id === picked) ?? items[0];
  return (
    <div className="col" style={{ gap: 12 }}>
      <Hint>Derived blast radius — entities in scope for this project. Pick a type; click a row to open the source record.</Hint>
      <Tabs tabs={items.map(({ id, label, count }) => ({ id, label, count }))} value={active?.id ?? ''} onChange={setPicked} />
      {active?.node}
    </div>
  );
}

// ── Immutable change log ────────────────────────────────────────────
export function ProjectChangeLogTab({ project }: { project: Project }) {
  const log = useProjectChangeLog(project);
  if (!log.length) return <Empty icon={History} title="No recorded changes yet" />;
  return (
    <>
      <Hint>Immutable record of every change executed under this project across the estate — append-only.</Hint>
      <Timeline style={{ marginTop: "var(--vw-space-lg)" }}
        items={log.map((a) => ({
          color: /fail|reject/i.test(a.action) ? 'red' : /commission|live|pass|approv|complete/i.test(a.action) ? 'green' : 'blue',
          children: (
            <div>
              <span className="row" style={{ gap: 8 }}><Chip>{a.entityType}</Chip><b>{a.action}</b></span>
              <div style={{ fontSize: "var(--vw-font-label-md)", color: "var(--vw-color-slate-600)" }}>{a.summary}</div>
              <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)" }}>{new Date(a.timestamp).toLocaleString()} · {a.actorName}</div>
            </div>
          ),
        }))} />
    </>
  );
}


// ── Related incidents / tickets ─────────────────────────────────────
export function ProjectIncidentsTab({ project }: { project: Project }) {
  const navigate = useNavigate();
  const incidents = useRelatedIncidents(project);
  if (!incidents.length) return <Empty icon={AlertOctagon} title="No related incidents">No related incidents in this data center.</Empty>;
  return (
    <div className="col" style={{ gap: 12 }}>
      <Hint>Incidents in this project's data center — operational issues that may relate to its work.</Hint>
      <DataTable rows={incidents} pageSize={1000} onRow={(i) => navigate(`/incidents/${i.id}`)}
        cols={[
          { key: 'sev', header: 'Severity', render: (i) => <Chip tone={SEV_TONE[i.severity] ?? 'neutral'}>{i.severity}</Chip> },
          { key: 'title', header: 'Title', render: (i) => <span title={i.title} style={{ display: 'inline-block', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>{i.title}</span> },
          { key: 'type', header: 'Type', render: (i) => <Chip>{i.type}</Chip> },
          { key: 'status', header: 'Status', render: (i) => <Chip>{i.status}</Chip> },
          { key: 'det', header: 'Detected', render: (i) => i.detectedAt.slice(0, 10) },
        ]} />
    </div>
  );
}

// ── Task detail drawer content (status editable) ────────────────────
export function TaskDetail({ task }: { task: Task }) {
  const { message } = App.useApp();
  const update = useEntityUpdate('tasks');
  const audit = useRecordAudit();
  const taskColor: Record<string, string> = { Done: 'green', 'In Progress': 'blue', Blocked: 'red', 'To Do': 'default' };
  return (
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label="Task">{task.name}</Descriptions.Item>
      <Descriptions.Item label="Assignee">{task.assignee}</Descriptions.Item>
      <Descriptions.Item label="Scheduled">{task.startDate.slice(0, 10)} → {task.dueDate.slice(0, 10)}</Descriptions.Item>
      <Descriptions.Item label="Effort">{task.effortDays} days</Descriptions.Item>
      <Descriptions.Item label="Status">
        <Select placeholder="Select status" size="small" value={task.status} style={{ width: 150 }}
          options={TASK_STATUS.map((s) => ({ value: s, label: s }))}
          onChange={(v) => update.mutate({ id: task.id, data: { status: v } }, { onSuccess: () => { audit('Task', task.taskId, v, `${task.name} → ${v}`); message.success(`${task.name} → ${v}`); } })} />
        <VwChip color={taskColor[task.status]} style={{ marginLeft: "var(--vw-space-sm)" }}>{task.status}</VwChip>
      </Descriptions.Item>
    </Descriptions>
  );
}
