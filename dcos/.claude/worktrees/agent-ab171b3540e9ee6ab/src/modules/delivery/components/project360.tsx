import { App, Descriptions, Empty, Select, Space, Tabs, Timeline, Typography } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { useNavigate } from 'react-router-dom';
import { VwChip } from '../../../shared/components/ux';
import { useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { TASK_STATUS } from '../../../mock/data/enums';
import { TEMPLATE_REGISTRY } from '../lib/projectTemplates';
import { useProjectImpact, useProjectChangeLog, useRelatedIncidents } from '../lib/useProject360';
import type { Project, Task, Rack } from '../../../mock/data/types';

const { Text } = Typography;
const sevColor: Record<string, string> = { SEV1: 'red', SEV2: 'volcano', SEV3: 'gold', SEV4: 'default', Critical: 'red', Major: 'volcano', Minor: 'gold' };

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
      <Meta label="Template">{project.template ? <VwChip color="blue" style={{ marginInlineEnd: 4 }}>{project.template}</VwChip> : '—'}{def && <VwChip>{def.category}</VwChip>}</Meta>
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
  if (imp.total === 0 && imp.provisioned.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No impacted entities derived for this project's data center." />;

  const tab = (key: string, label: string, n: number, node: React.ReactNode) => n > 0 ? { key, label: `${label} (${n})`, children: node } : null;
  const items = [
    tab('racks', 'Racks', imp.racks.length, (
      <Table size="small" rowKey="id" pagination={false} dataSource={imp.racks}
        onRow={(r) => ({ onClick: () => navigate(`/facility/racks/${r.id}`), style: { cursor: 'pointer' } })}
        columns={[{ title: 'Rack', dataIndex: 'name' }, { title: 'Used U', key: 'u', render: (_: unknown, r: Rack) => `${r.usedU}/${r.heightU}` }, { title: 'Power %', dataIndex: 'powerUtilizationPct', render: (v?: number) => v != null ? `${v}%` : '—' }]} scroll={{ x: 'max-content' }} />
    )),
    tab('devices', 'Devices', imp.devices.length, (
      <Table size="small" rowKey="id" pagination={false} dataSource={imp.devices}
        onRow={(d) => ({ onClick: () => navigate(`/facility/devices/${d.id}`), style: { cursor: 'pointer' } })}
        columns={[{ title: 'Device', dataIndex: 'name' }, { title: 'Category', dataIndex: 'category', render: (c) => <VwChip>{c}</VwChip> }, { title: 'Status', dataIndex: 'status' }]} scroll={{ x: 'max-content' }} />
    )),
    tab('cabling', 'Cabling', imp.cables.length, (
      <Table size="small" rowKey="id" pagination={false} dataSource={imp.cables}
        columns={[{ title: 'Label', dataIndex: 'label', render: (l?: string) => l ?? '—' }, { title: 'Type', dataIndex: 'cableType', render: (t) => <VwChip>{t}</VwChip> }, { title: 'Status', dataIndex: 'status', render: (s) => <VwChip>{s}</VwChip> }]} scroll={{ x: 'max-content' }} />
    )),
    tab('halls', 'Halls', imp.halls.length, (
      <Table size="small" rowKey="id" pagination={false} dataSource={imp.halls}
        onRow={(h) => ({ onClick: () => navigate(`/facility/hall/${h.id}`), style: { cursor: 'pointer' } })}
        columns={[{ title: 'Hall', dataIndex: 'name' }, { title: 'Racks', dataIndex: 'rackCount' }, { title: 'Utilization', dataIndex: 'utilizationPct', render: (v: number) => `${v}%` }]} scroll={{ x: 'max-content' }} />
    )),
    tab('vlans', 'VLANs', imp.vlans.length, (
      <Table size="small" rowKey="id" pagination={false} dataSource={imp.vlans}
        columns={[{ title: 'VLAN', dataIndex: 'vlanNumber' }, { title: 'Name', dataIndex: 'name' }, { title: 'Status', dataIndex: 'status', render: (s) => <VwChip>{s}</VwChip> }]} scroll={{ x: 'max-content' }} />
    )),
    tab('circuits', 'Circuits', imp.circuits.length, (
      <Table size="small" rowKey="id" pagination={false} dataSource={imp.circuits}
        onRow={(c) => ({ onClick: () => navigate(`/circuits/${c.id}`), style: { cursor: 'pointer' } })}
        columns={[{ title: 'Circuit', dataIndex: 'cid' }, { title: 'Status', dataIndex: 'status', render: (s) => <VwChip>{s}</VwChip> }]} scroll={{ x: 'max-content' }} />
    )),
    tab('provisioned', 'Provisioned', imp.provisioned.length, (
      <Table size="small" rowKey="id" pagination={false} dataSource={imp.provisioned}
        onRow={(d) => ({ onClick: () => navigate(`/facility/devices/${d.id}`), style: { cursor: 'pointer' } })}
        columns={[{ title: 'Device', dataIndex: 'name' }, { title: 'Category', dataIndex: 'category', render: (c) => <VwChip>{c}</VwChip> }, { title: 'Status', dataIndex: 'status', render: (s) => <VwChip color="green">{s}</VwChip> }]} scroll={{ x: 'max-content' }} />
    )),
  ].filter(Boolean) as { key: string; label: string; children: React.ReactNode }[];
  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: "var(--vw-space-sm)", fontSize: "var(--vw-font-label-sm)" }}>Derived blast radius — entities in scope for this project. Pick a type; click a row to open the source record.</Text>
      <Tabs size="small" items={items} />
    </div>
  );
}

// ── Immutable change log ────────────────────────────────────────────
export function ProjectChangeLogTab({ project }: { project: Project }) {
  const log = useProjectChangeLog(project);
  if (!log.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recorded changes yet." />;
  return (
    <>
      <Text type="secondary">Immutable record of every change executed under this project across the estate — append-only.</Text>
      <Timeline style={{ marginTop: "var(--vw-space-lg)" }}
        items={log.map((a) => ({
          color: /fail|reject/i.test(a.action) ? 'red' : /commission|live|pass|approv|complete/i.test(a.action) ? 'green' : 'blue',
          children: (
            <div>
              <Space size={8}><VwChip>{a.entityType}</VwChip><Text strong>{a.action}</Text></Space>
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
  if (!incidents.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No related incidents in this data center." />;
  return (
    <>
      <Text type="secondary">Incidents in this project's data center — operational issues that may relate to its work.</Text>
      <Table size="small" rowKey="id" style={{ marginTop: "var(--vw-space-md)" }} dataSource={incidents} pagination={false} scroll={{ x: 'max-content' }}
        onRow={(i) => ({ onClick: () => navigate(`/incidents/${i.id}`), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Severity', dataIndex: 'severity', render: (s: string) => <VwChip color={sevColor[s] ?? 'default'}>{s}</VwChip> },
          { title: 'Title', dataIndex: 'title', ellipsis: true },
          { title: 'Type', dataIndex: 'type', render: (t) => <VwChip>{t}</VwChip> },
          { title: 'Status', dataIndex: 'status', render: (s) => <VwChip>{s}</VwChip> },
          { title: 'Detected', dataIndex: 'detectedAt', render: (d: string) => d.slice(0, 10) },
        ]} />
    </>
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
