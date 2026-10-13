import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Row, Col, Progress, Empty, Space, Steps, Popconfirm, Typography } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ArrowLeftOutlined, ProjectOutlined, PercentageOutlined, DollarOutlined, WalletOutlined, WarningOutlined } from '../../../shared/icons';
import { useEntityDetail, useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { EntityAuditTab } from '../../../shared/components/detail';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';
import { PROGRAM_STATUS } from '../../../mock/data/enums';
import type { ProgramStatus } from '../../../mock/data/enums';
import type { Program, Project, RiskItem, Permit, DesignDocument, ChangeOrder } from '../../../mock/data/types';
import { permitGateMet, designGateMet } from '../lib/permits';

const { Text } = Typography;
const ragColor: Record<string, string> = { Red: 'red', Amber: 'orange', Green: 'green', Grey: 'default' };
const money = (v: number) => `$${(v / 1e6).toFixed(2)}M`;
// Lifecycle: linear advance Proposed→Planning→Active→Closed, with On Hold as a side state.
const LIFECYCLE: ProgramStatus[] = ['Proposed', 'Planning', 'Active', 'Closed'];
const nextStatus = (s: ProgramStatus): ProgramStatus | null => {
  if (s === 'On Hold') return 'Active';
  const i = LIFECYCLE.indexOf(s);
  return i >= 0 && i < LIFECYCLE.length - 1 ? LIFECYCLE[i + 1] : null;
};

export default function ProgramDetailPage() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const updateProgram = useEntityUpdate('programs');
  const audit = useRecordAudit();
  const { data } = useEntityDetail('programs', programId);
  const projects = (useEntityList('projects', { filters: [{ field: 'programId', operator: 'eq', value: programId }], pageSize: 200 }).data?.data ?? []) as unknown as Project[];
  const allRisks = (useEntityList('risks', { pageSize: 1000 }).data?.data ?? []) as unknown as RiskItem[];
  const allPermits = (useEntityList('permits', { pageSize: 2000 }).data?.data ?? []) as unknown as Permit[];
  const allDesign = (useEntityList('designDocuments', { pageSize: 2000 }).data?.data ?? []) as unknown as DesignDocument[];
  const allChangeOrders = (useEntityList('changeOrders', { pageSize: 2000 }).data?.data ?? []) as unknown as ChangeOrder[];
  const prog = data as unknown as Program | null;

  const m = useMemo(() => {
    const ids = new Set(projects.map((p) => p.id));
    const risks = allRisks.filter((r) => ids.has(r.projectId));
    // Approved change orders move the approved budget — fold them into the rollup.
    const coDelta = allChangeOrders.filter((c) => ids.has(c.projectId) && c.status === 'Approved').reduce((s, c) => s + c.budgetDelta, 0);
    return {
      avg: projects.length ? Math.round(projects.reduce((s, p) => s + p.percentComplete, 0) / projects.length) : 0,
      spend: projects.reduce((s, p) => s + p.actualSpend, 0),
      budget: projects.reduce((s, p) => s + p.budget, 0) + coDelta,
      coDelta,
      openRisks: risks.filter((r) => r.status === 'Open').length,
      rag: ['Red', 'Amber', 'Green'].map((r) => ({ r, n: projects.filter((p) => p.rag === r).length })),
    };
  }, [projects, allRisks, allChangeOrders]);

  // Build sequence: the phases of a greenfield programme, in order, with each
  // phase's predecessors resolved so we can show what is gating it right now.
  const seq = useMemo(() => {
    const byId: Record<string, Project> = {};
    projects.forEach((p) => { byId[p.id] = p; });
    return projects
      .filter((p) => p.phase != null)
      .sort((a, b) => (a.phase ?? 0) - (b.phase ?? 0))
      .map((p) => {
        const preds = (p.dependsOnProjectIds ?? []).map((id) => byId[id]).filter(Boolean) as Project[];
        const waiting = preds.filter((pp) => pp.percentComplete < 100);
        const permits = allPermits.filter((x) => x.projectId === p.id);
        const designDocs = allDesign.filter((x) => x.projectId === p.id);
        return {
          p, preds, waiting,
          permits, designDocs,
          permitOk: permits.length > 0 ? permitGateMet(permits) : null,
          designOk: designDocs.length > 0 ? designGateMet(designDocs) : null,
        };
      });
  }, [projects, allPermits, allDesign]);

  if (!prog) return <div><Empty description="Program not found" /></div>;

  return (
    <div>
      <Space className="vw-card-section" style={{ marginBottom: "var(--vw-space-md)", width: '100%' }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/delivery/portfolio')}>Portfolio</Button>
        <div className="vw-page-title" role="heading" aria-level={4}>{prog.name}</div>
        <VwChip color="blue">{prog.type}</VwChip>
        <VwChip>{prog.status}</VwChip>
      </Space>
      <Text type="secondary">{prog.objective}</Text>

      <VwCard size="small" title="Programme lifecycle" style={{ marginTop: "var(--vw-space-lg)" }}
        extra={(() => {
          const setStatus = (to: ProgramStatus) => updateProgram.mutate({ id: prog.id, data: { status: to, updatedAt: new Date().toISOString() } }, { onSuccess: () => { audit('Program', prog.progId, to, `Program lifecycle → ${to}`); message.success(`Program → ${to}`); } });
          const next = nextStatus(prog.status);
          return (
            <Space>
              {prog.status === 'Active' && <Button onClick={() => setStatus('On Hold')}>Put on hold</Button>}
              {prog.status === 'On Hold' && <Button type="primary" onClick={() => setStatus('Active')}>Reactivate</Button>}
              {next === 'Closed' ? (
                <Popconfirm title="Close this programme?" description="All projects should be complete or cancelled first." onConfirm={() => setStatus('Closed')}>
                  <Button danger>Close programme</Button>
                </Popconfirm>
              ) : next ? (
                <Button type="primary" onClick={() => setStatus(next)}>Advance to {next}</Button>
              ) : null}
            </Space>
          );
        })()}
      >
        <Steps size="small" current={Math.max(0, LIFECYCLE.indexOf(prog.status))} status={prog.status === 'On Hold' ? 'error' : 'process'}
          items={LIFECYCLE.map((s) => ({ title: s, description: prog.status === 'On Hold' && s === 'Active' ? 'On hold' : undefined }))} />
      </VwCard>

      {seq.length > 0 && (
        <VwCard size="small" title="Build sequence" style={{ marginTop: "var(--vw-space-lg)" }}
          extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Phases run in dependency order — a phase stays blocked until the work it depends on completes</Text>}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {seq.map(({ p, preds, waiting, permits, designDocs, permitOk, designOk }, i) => {
              const done = p.percentComplete >= 100;
              const blocked = waiting.length > 0 && !p.longLead;
              const procuring = waiting.length > 0 && p.longLead;
              const label = done ? 'Done' : blocked ? 'Blocked' : procuring ? 'Long-lead · procuring' : p.percentComplete > 0 ? 'In progress' : 'Ready to start';
              const color = done ? 'green' : blocked ? 'default' : procuring ? 'gold' : p.percentComplete > 0 ? 'blue' : 'cyan';
              return (
                <div key={p.id} onClick={() => navigate(`/delivery/projects/${p.id}`)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: "var(--vw-space-md)", padding: '10px 12px', borderRadius: "var(--vw-radius-sm)", border: '1px solid #f0f0f0', borderLeft: `3px solid ${blocked ? '#cbd5e1' : done ? 'var(--vw-color-green-600)' : procuring ? '#f59e0b' : '#2563eb'}` }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: done ? 'var(--vw-color-green-600)' : '#e2e8f0', color: done ? '#fff' : '#475569', fontSize: "var(--vw-font-label-sm)", fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)", display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                      <VwChip>{p.template}</VwChip>
                      {p.longLead && <VwChip color="gold">long-lead</VwChip>}
                      {p.startGate && <span>gate: {p.startGate}</span>}
                      {blocked && <span style={{ color: "var(--vw-color-amber-700)" }}>· waiting on {waiting.map((w) => w.name.split('—').pop()?.trim() ?? w.name).join(', ')}</span>}
                      {!blocked && preds.length > 0 && !done && <span>· predecessors complete</span>}
                      {permitOk !== null && <VwChip color={permitOk ? 'green' : 'gold'}>{permitOk ? `permits ${permits.length}/${permits.length}` : 'awaiting permits'}</VwChip>}
                      {designOk !== null && <VwChip color={designOk ? 'green' : 'gold'}>{designOk ? 'design IFC' : `design ${designDocs.length} draft`}</VwChip>}
                    </div>
                  </div>
                  <div style={{ width: 130, flex: '0 0 auto' }}><Progress percent={p.percentComplete} size="small" /></div>
                  <VwChip color={color} style={{ flex: '0 0 auto' }}>{label}</VwChip>
                </div>
              );
            })}
          </Space>
        </VwCard>
      )}

      <div className="vw-grid vw-kpi-grid vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Projects" value={projects.length} icon={<ProjectOutlined />} iconTone="info" />
        <KPICard title="Avg completion" value={m.avg} suffix="%" icon={<PercentageOutlined />} iconTone="cyan" />
        <KPICard title="Approved budget" value={money(m.budget)} icon={<DollarOutlined />} iconTone="success" />
        <KPICard title="Spend (projects)" value={money(m.spend)} icon={<WalletOutlined />} iconTone="purple" />
        <KPICard title="Open risks" value={m.openRisks} color={m.openRisks ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone={m.openRisks ? 'warning' : 'success'} />
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}><VwCard size="small" title="Projects">
          <Table<Project> size="small" rowKey="id" dataSource={projects} pagination={false}
            onRow={(p) => ({ onClick: () => navigate(`/delivery/projects/${p.id}`), style: { cursor: 'pointer' } })}
            columns={[{ title: 'Project', dataIndex: 'name', ellipsis: true }, { title: 'Status', dataIndex: 'status', render: (s) => <VwChip>{s}</VwChip> }, { title: 'RAG', dataIndex: 'rag', render: (r) => <VwChip color={ragColor[r]}>{r}</VwChip> }, { title: 'Complete', dataIndex: 'percentComplete', render: (v: number) => <Progress percent={v} size="small" /> }, { title: 'Spend', dataIndex: 'actualSpend', render: (v: number) => `$${(v / 1000).toFixed(0)}k` }]} scroll={{ x: 'max-content' }} />
        </VwCard></Col>
        <Col xs={24} lg={8}><VwCard size="small" title="Project health (RAG)">
          {m.rag.map((x) => <div key={x.r} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><VwChip color={ragColor[x.r]}>{x.r}</VwChip><strong>{x.n}</strong></div>)}
        </VwCard></Col>
      </Row>
      <VwCard size="small" title="Activity" style={{ marginTop: "var(--vw-space-lg)" }}><EntityAuditTab entityType="Program" entityId={prog.progId} /></VwCard>
    </div>
  );
}
