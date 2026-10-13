import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Progress, Typography, Space, Input, Select, Empty } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ArrowRightOutlined, PlusOutlined, SearchOutlined, ProjectOutlined, RocketOutlined, WarningOutlined, CheckCircleFilled } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { deriveStage, DELIVERY_STAGES } from '../lib/deliverExec';
import { PROJECT_STATUS, RAG_VALUES } from '../../../mock/data/enums';
import NewProgramModal from '../components/NewProgramModal';
import NewProjectWizard from '../components/NewProjectWizard';
import type { Program, Project, BOM, ProjectActivity } from '../../../mock/data/types';

const { Text } = Typography;
const ragColor: Record<string, string> = { Red: 'red', Amber: 'orange', Green: 'green', Grey: 'default' };
const stageColor: Record<string, string> = { Plan: 'default', Procure: 'blue', Build: 'gold', Commission: 'cyan', Live: 'green' };

export default function PortfolioHubPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState<string[]>([]);
  const [ragF, setRagF] = useState<string[]>([]);
  const [stageF, setStageF] = useState<string[]>([]);
  const [newProgram, setNewProgram] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const programs = (useEntityList('programs', { pageSize: 100 }).data?.data ?? []) as unknown as Program[];
  const projects = (useEntityList('projects', { pageSize: 200 }).data?.data ?? []) as unknown as Project[];
  const boms = (useEntityList('boms', { pageSize: 1000 }).data?.data ?? []) as unknown as BOM[];
  const acts = (useEntityList('projectActivities', { pageSize: 5000 }).data?.data ?? []) as unknown as ProjectActivity[];

  // Derive each project's delivery stage once (lists loaded above).
  const stageById = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of projects) {
      const pb = boms.filter((b) => b.projectId === p.id);
      const pa = acts.filter((a) => a.projectId === p.id);
      out[p.id] = deriveStage(p, pb, pa).stage;
    }
    return out;
  }, [projects, boms, acts]);

  const m = useMemo(() => ({
    active: projects.filter((p) => p.status === 'Active').length,
    atRisk: projects.filter((p) => ['At Risk', 'Blocked'].includes(p.status) || p.rag === 'Red').length,
    avg: projects.length ? Math.round(projects.reduce((s, p) => s + p.percentComplete, 0) / projects.length) : 0,
    live: Object.values(stageById).filter((s) => s === 'Live').length,
  }), [projects, stageById]);

  // Apply search + filters to projects, then keep only programs with surviving children.
  const ql = q.trim().toLowerCase();
  const projMatches = (p: Project, pg: Program) => {
    if (ql && !(p.name.toLowerCase().includes(ql) || pg.name.toLowerCase().includes(ql) || p.managerName.toLowerCase().includes(ql))) return false;
    if (statusF.length && !statusF.includes(p.status)) return false;
    if (ragF.length && !ragF.includes(p.rag)) return false;
    if (stageF.length && !stageF.includes(stageById[p.id])) return false;
    return true;
  };
  const filtering = !!(ql || statusF.length || ragF.length || stageF.length);
  const visiblePrograms = programs
    .map((pg) => ({ pg, kids: projects.filter((p) => p.programId === pg.id && projMatches(p, pg)) }))
    .filter((x) => x.kids.length > 0 || (!filtering));

  const projColumns = [
    { title: 'Project', dataIndex: 'name', ellipsis: true },
    { title: 'Stage', key: 'stage', width: 130, render: (_: unknown, p: Project) => <VwChip color={stageColor[stageById[p.id]]}>{stageById[p.id]}</VwChip> },
    { title: 'RAG', dataIndex: 'rag', width: 70, render: (r: string) => <VwChip color={ragColor[r]}>{r}</VwChip> },
    { title: 'Manager', dataIndex: 'managerName', width: 160, ellipsis: true },
    { title: 'Complete', dataIndex: 'percentComplete', width: 150, render: (v: number) => <Progress percent={v} size="small" /> },
  ];

  return (
    <div>
      <Space className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }} align="start">
        <div className="vw-page-title" role="heading" aria-level={3}>Programs &amp; Projects</div>
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setNewProgram(true)}>New program</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewProject(true)}>New project</Button>
        </Space>
      </Space>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '16px 0 16px' }}>
        <KPICard title="Programs" value={programs.length} icon={<ProjectOutlined />} iconTone="info" />
        <KPICard title="Active Projects" value={m.active} icon={<RocketOutlined />} iconTone="cyan" />
        <KPICard title="At Risk / Red" value={m.atRisk} color={m.atRisk ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="error" />
        <KPICard title="Delivered (Live)" value={m.live} color="var(--vw-color-green-600)" icon={<CheckCircleFilled />} iconTone="success" />
      </div>

      <Space wrap style={{ marginBottom: "var(--vw-space-lg)" }}>
        <Input prefix={<SearchOutlined />} placeholder="Search projects, programs, managers…" allowClear value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />
        <Select mode="multiple" allowClear placeholder="Status" value={statusF} onChange={setStatusF} style={{ minWidth: 160 }} options={PROJECT_STATUS.map((s) => ({ value: s, label: s }))} maxTagCount="responsive" />
        <Select mode="multiple" allowClear placeholder="RAG" value={ragF} onChange={setRagF} style={{ minWidth: 120 }} options={RAG_VALUES.map((s) => ({ value: s, label: s }))} maxTagCount="responsive" />
        <Select mode="multiple" allowClear placeholder="Stage" value={stageF} onChange={setStageF} style={{ minWidth: 150 }} options={DELIVERY_STAGES.map((s) => ({ value: s, label: s }))} maxTagCount="responsive" />
      </Space>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {visiblePrograms.length === 0 && <Empty description="No projects match your filters" />}
        {visiblePrograms.map(({ pg, kids }) => {
          const liveN = kids.filter((p) => stageById[p.id] === 'Live').length;
          const worst = kids.some((p) => p.rag === 'Red') ? 'Red' : kids.some((p) => p.rag === 'Amber') ? 'Amber' : 'Green';
          return (
            <VwCard
              key={pg.id}
              size="small"
              title={
                <Space wrap>
                  <Text strong style={{ fontSize: "var(--vw-font-heading-md)" }}>{pg.name}</Text>
                  <VwChip color="blue">{pg.type}</VwChip>
                  <VwChip>{pg.status}</VwChip>
                  <VwChip color={ragColor[worst]}>{worst}</VwChip>
                  <Text type="secondary" style={{ fontWeight: 400 }}>${(pg.budget / 1e6).toFixed(0)}M · {pg.ownerName}</Text>
                </Space>
              }
              extra={
                <Space>
                  <Text type="secondary">{liveN}/{kids.length} live</Text>
                  <Button type="link" icon={<ArrowRightOutlined />} onClick={() => navigate(`/delivery/programs/${pg.id}`)}>Program</Button>
                </Space>
              }
            >
              <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>{pg.objective}</Text>
              <Table<Project>
                rowKey="id" size="small" pagination={false} dataSource={kids} columns={projColumns}
                onRow={(p) => ({ onClick: () => navigate(`/delivery/projects/${p.id}`), style: { cursor: 'pointer' } })}
                scroll={{ x: 'max-content' }}
              />
            </VwCard>
          );
        })}
      </Space>

      <NewProgramModal open={newProgram} onClose={() => setNewProgram(false)} onCreated={(id) => navigate(`/delivery/programs/${id}`)} />
      <NewProjectWizard open={newProject} onClose={() => setNewProject(false)} onCreated={(id) => navigate(`/delivery/projects/${id}`)} />
    </div>
  );
}
