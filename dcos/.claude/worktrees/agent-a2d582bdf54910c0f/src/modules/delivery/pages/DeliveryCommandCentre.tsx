import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Col, Row, Progress, Space, Timeline, Typography, Empty, Segmented } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { WarningOutlined, ClockCircleOutlined, SafetyCertificateOutlined, ExperimentOutlined, RightOutlined, FireOutlined, RiseOutlined, AlertOutlined, DollarOutlined, ArrowRightOutlined, CalendarOutlined, ToolOutlined, ApiOutlined, FileDoneOutlined, CheckCircleFilled, ThunderboltOutlined, DashboardOutlined, TagsOutlined, FundProjectionScreenOutlined } from '../../../shared/icons';
import { Pie, Column, Line } from '@ant-design/charts';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip, KpiTile, ChartAutoFitBox } from '../../../shared/components/ux';
import { deriveStage, DELIVERY_STAGES } from '../lib/deliverExec';
import { ticketStats, useAllTickets, isBlockingTicket } from '../lib/tickets';
import { computePortfolioEarnedValue, buildPortfolioEvCurve } from '../lib/cost';
import { PROJECT_STATUS } from '../../../mock/data/enums';
import DeliveryCalendar from './DeliveryCalendar';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';
import type {
  Project, Program, Task, RiskItem, Milestone, Atp, Hoto, Snag, BOM, PurchaseOrder, AuditEvent, ProjectActivity, ChangeOrder,
} from '../../../mock/data/types';

const { Text } = Typography;
const ragHex: Record<string, string> = { Red: 'var(--vw-color-red-600)', Amber: 'var(--vw-color-orange-700)', Green: 'var(--vw-color-green-600)', Grey: 'var(--vw-color-gray-500)' };
const stageHex: Record<string, string> = { Plan: 'var(--vw-color-gray-500)', Procure: 'var(--primaryColor500)', Build: 'var(--vw-color-orange-700)', Commission: '#0e7490', Live: 'var(--vw-color-green-600)' };
const money = (v: number) => `$${(v / 1e6).toFixed(1)}M`;
const today = Date.now();

const SECTION: React.CSSProperties = { marginTop: 16 };

// Map an audit event to a coloured dot for the activity feed.
function activityDot(a: { entityType: string; action: string }): { icon: React.ReactNode; bg: string } {
  const act = a.action.toLowerCase(); const ent = a.entityType.toLowerCase();
  if (/accept|pass|sign|live|complete|commissioned|approv/.test(act)) return { icon: <CheckCircleFilled />, bg: 'var(--vw-color-green-600)' };
  if (/fail|reject/.test(act)) return { icon: <WarningOutlined />, bg: 'var(--vw-color-red-600)' };
  if (/cable|vlan|circuit|network|config/.test(`${ent} ${act}`)) return { icon: <ApiOutlined />, bg: 'var(--primaryColor500)' };
  if (/permit|inspection|hall|facility|milestone/.test(`${ent} ${act}`)) return { icon: <FileDoneOutlined />, bg: '#7c3aed' };
  return { icon: <ToolOutlined />, bg: '#0ea5e9' };
}
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 864e5); if (d > 0) return `${d}d ago`;
  const h = Math.floor(ms / 36e5); if (h > 0) return `${h}h ago`;
  const m = Math.floor(ms / 6e4); return m > 0 ? `${m}m ago` : 'just now';
}
// Milestone type → icon + accent colour.
function msMeta(name: string): { icon: React.ReactNode; color: string } {
  const n = name.toLowerCase();
  if (/go-live|handover|live/.test(n)) return { icon: <ThunderboltOutlined />, color: 'var(--vw-color-green-600)' };
  if (/commission|test|ist|quality/.test(n)) return { icon: <ExperimentOutlined />, color: '#06b6d4' };
  if (/install|rack|construct|fit|structure|envelope/.test(n)) return { icon: <ToolOutlined />, color: 'var(--vw-color-orange-700)' };
  if (/procure|bom|order|long-lead/.test(n)) return { icon: <DollarOutlined />, color: '#7c3aed' };
  if (/design|sign|permit|plan|approv|feasib|concept/.test(n)) return { icon: <FileDoneOutlined />, color: 'var(--primaryColor500)' };
  return { icon: <CalendarOutlined />, color: '#64748b' };
}
// Due date → relative pill.
function dueMeta(iso: string): { text: string; color: string; bg: string; date: string } {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 864e5);
  const date = iso.slice(0, 10);
  if (days < 0) return { text: `Overdue ${-days}d`, color: '#b91c1c', bg: '#fef2f2', date };
  if (days === 0) return { text: 'Due today', color: '#b45309', bg: '#fffbeb', date };
  if (days <= 7) return { text: `In ${days}d`, color: '#b45309', bg: '#fffbeb', date };
  return { text: `In ${days}d`, color: '#475569', bg: '#f1f5f9', date };
}

export default function DeliveryCommandCentre() {
  const navigate = useNavigate();
  const programs = (useEntityList('programs', { pageSize: 100 }).data?.data ?? []) as unknown as Program[];
  const projects = (useEntityList('projects', { pageSize: 300 }).data?.data ?? []) as unknown as Project[];
  const tasks = (useEntityList('tasks', { pageSize: 5000 }).data?.data ?? []) as unknown as Task[];
  const risks = (useEntityList('risks', { pageSize: 3000 }).data?.data ?? []) as unknown as RiskItem[];
  const milestones = (useEntityList('milestones', { pageSize: 3000 }).data?.data ?? []) as unknown as Milestone[];
  const atps = (useEntityList('atps', { pageSize: 2000 }).data?.data ?? []) as unknown as Atp[];
  const hotos = (useEntityList('hotos', { pageSize: 2000 }).data?.data ?? []) as unknown as Hoto[];
  const snags = (useEntityList('snags', { pageSize: 3000 }).data?.data ?? []) as unknown as Snag[];
  const boms = (useEntityList('boms', { pageSize: 2000 }).data?.data ?? []) as unknown as BOM[];
  const pos = (useEntityList('purchaseOrders', { pageSize: 4000 }).data?.data ?? []) as unknown as PurchaseOrder[];
  const acts = (useEntityList('projectActivities', { pageSize: 9000 }).data?.data ?? []) as unknown as ProjectActivity[];
  const audits = (useEntityList('auditEvents', { pageSize: 5000 }).data?.data ?? []) as unknown as AuditEvent[];
  const changeOrders = (useEntityList('changeOrders', { pageSize: 2000 }).data?.data ?? []) as unknown as ChangeOrder[];
  const tickets = useAllTickets();

  const m = useMemo(() => {
    const stageOf: Record<string, string> = {};
    for (const p of projects) stageOf[p.id] = deriveStage(p, boms.filter((b) => b.projectId === p.id), acts.filter((a) => a.projectId === p.id)).stage;
    const active = projects.filter((p) => p.status !== 'Completed');
    const stageCounts = DELIVERY_STAGES.map((s) => ({ stage: s, n: projects.filter((p) => stageOf[p.id] === s).length }));

    const attention = active.map((p) => {
      const reasons: string[] = [];
      if (p.rag === 'Red') reasons.push('Health RED');
      if (p.status === 'Blocked') reasons.push('Blocked');
      if (stageOf[p.id] === 'Commission') { const pa = atps.filter((a) => a.projectId === p.id); if (pa.length && !pa.every((a) => a.status === 'Accepted')) reasons.push(`ATPs pending (${pa.filter((a) => a.status === 'Accepted').length}/${pa.length})`); }
      const h = hotos.find((x) => x.projectId === p.id);
      if (h && !h.status.startsWith('Accepted')) { const crit = snags.filter((s) => s.projectId === p.id && s.status === 'Open' && (s.severity === 'Critical' || s.severity === 'Major')).length; if (crit) reasons.push(`${crit} blocking snag(s)`); }
      const overdueMs = milestones.filter((mi) => mi.projectId === p.id && mi.status !== 'Completed' && new Date(mi.dueDate).getTime() < today).length;
      if (overdueMs) reasons.push(`${overdueMs} overdue milestone(s)`);
      return { p, stage: stageOf[p.id], reasons, sev: (p.rag === 'Red' ? 3 : 0) + reasons.length };
    }).filter((x) => x.reasons.length > 0).sort((a, b) => b.sev - a.sev);

    const upcomingMs = milestones.filter((mi) => mi.status !== 'Completed' && new Date(mi.dueDate).getTime() >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
    const overdueMs = milestones.filter((mi) => mi.status !== 'Completed' && new Date(mi.dueDate).getTime() < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);

    const pendingAtps = atps.filter((a) => a.status !== 'Accepted' && a.status !== 'Failed').length;
    const hotoInProgress = hotos.filter((h) => h.status === 'In Progress' || h.status === 'Not Started').length;
    const openSnags = { critical: snags.filter((s) => s.status === 'Open' && s.severity === 'Critical').length, major: snags.filter((s) => s.status === 'Open' && s.severity === 'Major').length, minor: snags.filter((s) => s.status === 'Open' && s.severity === 'Minor').length };

    const budget = projects.reduce((s, p) => s + p.budget, 0);
    const spend = projects.reduce((s, p) => s + p.actualSpend, 0);
    const poVariance = pos.reduce((s, p) => s + p.forecastVariance, 0);
    const recent = [...audits].filter((a) => a.projectId).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 8);
    const overdueTasks = tasks.filter((t) => t.status !== 'Done' && new Date(t.dueDate).getTime() < today).length;
    const openCritRisks = risks.filter((r) => r.status === 'Open' && (r.level === 'High' || r.level === 'Critical')).length;

    // Stage distribution (ordered Plan→Live) — a distribution, NOT a funnel:
    // each project sits in exactly one stage, so counts don't "drop off".
    const stageDist = stageCounts.map((s) => ({ stage: s.stage, value: s.n }));
    // RAG split (incl. Grey for un-RAG'd / planning-stage projects).
    const ragBar = (['Red', 'Amber', 'Green', 'Grey'] as const)
      .map((r) => ({ type: r as string, value: projects.filter((p) => p.rag === r).length }))
      .filter((x) => x.value > 0);
    const ragTotal = ragBar.reduce((s, x) => s + x.value, 0) || 1;

    // Budget vs spend per programme ($M), grouped
    const spendData = programs.flatMap((pg) => {
      const kids = projects.filter((p) => p.programId === pg.id);
      const b = kids.reduce((s, p) => s + p.budget, 0) / 1e6;
      const sp = kids.reduce((s, p) => s + p.actualSpend, 0) / 1e6;
      const name = pg.name.length > 16 ? pg.name.slice(0, 15) + '…' : pg.name;
      return [{ prog: name, kind: 'Budget', value: +b.toFixed(1) }, { prog: name, kind: 'Spend', value: +sp.toFixed(1) }];
    });

    // Actionable insights — ranked narrative
    const insights: Array<{ icon: React.ReactNode; tone: string; text: string; to: string }> = [];
    const redProg = programs.map((pg) => ({ pg, red: projects.filter((p) => p.programId === pg.id && p.rag === 'Red').length })).filter((x) => x.red > 0).sort((a, b) => b.red - a.red)[0];
    if (redProg) insights.push({ icon: <FireOutlined />, tone: 'var(--vw-color-red-600)', text: `${redProg.pg.name} carries ${redProg.red} red project${redProg.red > 1 ? 's' : ''} — highest-risk programme.`, to: `/delivery/programs/${redProg.pg.id}` });
    const gateBlocked = attention.filter((a) => a.reasons.some((r) => r.startsWith('ATPs') || r.includes('snag'))).length;
    if (gateBlocked) insights.push({ icon: <SafetyCertificateOutlined />, tone: '#06b6d4', text: `${gateBlocked} project${gateBlocked > 1 ? 's are' : ' is'} blocked at a delivery gate (ATP or hand-over) — go-live held.`, to: '/commissioning' });
    if (overdueMs.length) insights.push({ icon: <AlertOutlined />, tone: 'var(--vw-color-orange-700)', text: `${milestones.filter((mi) => mi.status !== 'Completed' && new Date(mi.dueDate).getTime() < today).length} milestone(s) overdue across the portfolio.`, to: '/delivery/portfolio' });
    if (poVariance > 0) insights.push({ icon: <DollarOutlined />, tone: 'var(--vw-color-red-600)', text: `Procurement is forecasting +${money(poVariance)} over plan — review open POs.`, to: '/procurement' });
    if (insights.length === 0) insights.push({ icon: <RiseOutlined />, tone: 'var(--vw-color-green-600)', text: 'Portfolio is healthy — no blocked gates, red projects or overdue milestones.', to: '/delivery/portfolio' });

    return {
      active: active.length, atRisk: projects.filter((p) => p.rag === 'Red' || ['At Risk', 'Blocked'].includes(p.status)).length,
      inExec: projects.filter((p) => ['Build', 'Commission'].includes(stageOf[p.id])).length, live: projects.filter((p) => stageOf[p.id] === 'Live').length,
      avg: projects.length ? Math.round(projects.reduce((s, p) => s + p.percentComplete, 0) / projects.length) : 0,
      overdueTasks, openCritRisks, attention, upcomingMs, overdueMs, pendingAtps, hotoInProgress, openSnags,
      budget, spend, poVariance, recent, stageDist, ragBar, ragTotal, spendData, insights, stageOf,
    };
  }, [projects, programs, boms, acts, atps, hotos, snags, milestones, tasks, risks, pos, audits]);

  // ── RAN-style project-controls analytics (additive) ──
  const a = useMemo(() => {
    const ts = ticketStats(tickets);
    const ticketByStatus = ts.byStatus.filter((x) => x.n > 0).map((x) => ({ status: x.status, value: x.n }));
    const ev = computePortfolioEarnedValue(projects, boms, pos, changeOrders);
    const evCurve = buildPortfolioEvCurve(projects, boms, pos, changeOrders);

    // Composite programme health (0–100 per dimension).
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    const greenPct = projects.length ? (projects.filter((p) => p.rag === 'Green').length / projects.length) * 100 : 100;
    const openCrit = risks.filter((r) => r.status === 'Open' && (r.level === 'High' || r.level === 'Critical')).length;
    const avgPct = projects.length ? projects.reduce((s, p) => s + p.percentComplete, 0) / projects.length : 0;
    const health = {
      Schedule: clamp(ev.spi * 100), Budget: clamp(ev.cpi * 100), Rollout: clamp(avgPct),
      Quality: clamp(greenPct), Risk: clamp(100 - openCrit * 8), Tickets: clamp(ts.resolutionRate - ts.blockers * 2),
    };
    const overall = clamp(Object.values(health).reduce((s, v) => s + v, 0) / Object.values(health).length);

    // Status × execution-health matrix (priority: Blockers > At risk > Delayed > On time)
    const blockingByProj = new Map<string, number>();
    tickets.filter(isBlockingTicket).forEach((t) => { if (t.projectId) blockingByProj.set(t.projectId, (blockingByProj.get(t.projectId) ?? 0) + 1); });
    const HCOLS = ['On time', 'Delayed', 'At risk', 'Blockers'] as const;
    const classify = (p: Project): typeof HCOLS[number] => {
      if ((blockingByProj.get(p.id) ?? 0) > 0 || p.status === 'Blocked') return 'Blockers';
      if (p.rag === 'Red' || p.status === 'At Risk') return 'At risk';
      if (milestones.some((mi) => mi.projectId === p.id && mi.status !== 'Completed' && new Date(mi.dueDate).getTime() < today)) return 'Delayed';
      return 'On time';
    };
    const activeP = projects.filter((p) => p.status !== 'Completed');
    const matrix = PROJECT_STATUS.map((st) => {
      const rowP = projects.filter((p) => p.status === st);
      const cells = Object.fromEntries(HCOLS.map((c) => [c, rowP.filter((p) => classify(p) === c).length])) as Record<string, number>;
      return { status: st, ...cells, total: rowP.length };
    }).filter((r) => r.total > 0);

    // Completion velocity (milestones planned vs delivered to date)
    const plannedToDate = milestones.filter((mi) => new Date(mi.dueDate).getTime() <= today).length;
    const deliveredToDate = milestones.filter((mi) => mi.status === 'Completed' && new Date(mi.dueDate).getTime() <= today).length;
    const adherence = plannedToDate ? Math.round((deliveredToDate / plannedToDate) * 100) : 100;

    return { ts, ticketByStatus, ev, evCurve, health, overall, matrix, HCOLS, atRiskN: activeP.filter((p) => classify(p) === 'At risk' || classify(p) === 'Blockers').length, plannedToDate, deliveredToDate, adherence };
  }, [projects, boms, pos, changeOrders, tickets, milestones, risks]);

  const projName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const healthHex = (v: number) => v >= 80 ? 'var(--vw-color-green-600)' : v >= 60 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)';
  const idxHex = (v: number) => v >= 1 ? 'var(--vw-color-green-600)' : v >= 0.9 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)';
  const [calOpen, setCalOpen] = useState(false);

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>Delivery Command Center</div>

      {/* ── 1 · PULSE & TRIAGE — what needs me right now ───────── */}
      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Pulse &amp; triage</div>

      {/* KPI pulse */}
      <div className="vw-grid vw-grid-cols-3 vw-gap-md">
        <KPICard title="Active projects" value={m.active} icon={<FileDoneOutlined />} iconTone="info" />
        <KPICard title="At risk / Red" value={m.atRisk} color={m.atRisk ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="error" />
        <KPICard title="In execution" value={m.inExec} icon={<ToolOutlined />} iconTone="cyan" />
        <KPICard title="Delivered (Live)" value={m.live} color="var(--vw-color-green-600)" icon={<CheckCircleFilled />} iconTone="success" />
        <KPICard title="Overdue tasks" value={m.overdueTasks} color={m.overdueTasks ? 'var(--vw-color-orange-700)' : undefined} icon={<ClockCircleOutlined />} iconTone="warning" />
        <KPICard title="High/Crit risks" value={m.openCritRisks} color={m.openCritRisks ? 'var(--vw-color-red-600)' : undefined} icon={<AlertOutlined />} iconTone="error" />
      </div>

      {/* Actionable insight alerts */}
      <Row gutter={[16, 16]} style={SECTION}>
        {m.insights.slice(0, 3).map((ins, i) => (
          <Col key={i} xs={24} sm={12} md={8}>
            <VwCard size="small" hoverable onClick={() => navigate(ins.to)} bodyStyle={{ padding: '12px 14px' }} style={{ borderLeft: `3px solid ${ins.tone}` }}>
              <Space align="start">
                <span style={{ color: ins.tone, fontSize: "var(--vw-font-heading-lg)", marginTop: 1 }}>{ins.icon}</span>
                <div>
                  <div style={{ fontSize: "var(--vw-font-label-md)", lineHeight: 1.45, color: '#252525' }}>{ins.text}</div>
                  <Text style={{ fontSize: "var(--vw-font-label-sm)", color: ins.tone }}>Act <ArrowRightOutlined style={{ fontSize: "var(--vw-font-label-xs)" }} /></Text>
                </div>
              </Space>
            </VwCard>
          </Col>
        ))}
      </Row>

      {/* Needs attention — the heart, surfaced first */}
      <VwCard size="small" title={<Space><WarningOutlined style={{ color: 'var(--vw-color-orange-700)' }} />Needs attention ({m.attention.length})</Space>} style={SECTION}>
        {m.attention.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing blocking — every active project is on track." /> : (
          <Table size="small" rowKey={(r) => r.p.id} dataSource={m.attention} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }}
            onRow={(r) => ({ onClick: () => navigate(`/delivery/projects/${r.p.id}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Project', key: 'n', render: (_: unknown, r) => <Text strong>{r.p.name}</Text> },
              { title: 'Stage', key: 's', width: 120, render: (_: unknown, r) => <VwChip color={stageHex[r.stage]}>{r.stage}</VwChip> },
              { title: 'RAG', key: 'r', width: 70, render: (_: unknown, r) => <VwChip color={r.p.rag.toLowerCase()}>{r.p.rag}</VwChip> },
              { title: 'Why it needs you', key: 'w', render: (_: unknown, r) => <Space wrap size={4}>{r.reasons.map((x) => <VwChip key={x} color="orange">{x}</VwChip>)}</Space> },
              { title: '', key: 'x', width: 32, render: () => <RightOutlined className="vw-text-tertiary" /> },
            ]} />
        )}
      </VwCard>

      {/* ── 2 · PORTFOLIO SHAPE — distribution & money ─────────── */}
      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Portfolio shape</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} sm={12} md={8}>
          <VwCard size="small" title="Projects by stage" style={{ height: '100%' }} bodyStyle={{ paddingBottom: 14 }}>
            {/* Stage distribution — hand-built bars (Plan→Live) so it renders
                crisply and the card height stays predictable for row alignment. */}
            <div style={{ marginTop: 2 }}>
              {(() => {
                const max = Math.max(1, ...m.stageDist.map((s) => s.value));
                return m.stageDist.map((s) => (
                  <div key={s.stage} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                    <span style={{ width: 78, fontSize: "var(--vw-font-label-sm)", color: '#515151', flexShrink: 0 }}>{s.stage}</span>
                    <div style={{ flex: 1, height: 18, background: "var(--vw-color-slate-100)", borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${(s.value / max) * 100}%`, minWidth: s.value ? 4 : 0, height: '100%', background: stageHex[s.stage], borderRadius: 6, transition: 'width .3s' }} />
                    </div>
                    <span style={{ width: 20, textAlign: 'right', fontSize: "var(--vw-font-label-md)", fontWeight: 600, color: '#252525' }}>{s.value}</span>
                  </div>
                ));
              })()}
            </div>
            {/* RAG split — replaces the standalone donut */}
            <div style={{ marginTop: 14, paddingTop: "var(--vw-space-md)", borderTop: "1px solid var(--vw-color-slate-100)" }}>
              <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: "var(--vw-color-slate-100)" }}>
                {m.ragBar.map((r) => <div key={r.type} style={{ width: `${(r.value / m.ragTotal) * 100}%`, background: ragHex[r.type] }} />)}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: "var(--vw-space-sm)", flexWrap: 'wrap' }}>
                {m.ragBar.map((r) => (
                  <span key={r.type} style={{ fontSize: "var(--vw-font-label-sm)", color: '#515151', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: ragHex[r.type], display: 'inline-block' }} />
                    {r.type} <Text strong>{r.value}</Text>
                  </span>
                ))}
              </div>
            </div>
          </VwCard>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <VwCard size="small" title="Budget vs spend by programme ($M)" style={{ height: '100%' }}>
            <ChartAutoFitBox height={240}>
              <Column data={m.spendData} xField="prog" yField="value" colorField="kind" group autoFit
                scale={{ color: { domain: ['Budget', 'Spend'], range: ['#cbd5e1', '#000000'] } }}
                axis={{ x: { labelAutoRotate: true, labelFontSize: 10 } }} legend={{ color: { position: 'top' } }} />
            </ChartAutoFitBox>
          </VwCard>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <VwCard size="small" title={<Space><SafetyCertificateOutlined />Gates & financials</Space>} style={{ height: '100%' }}>
            <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md">
              <div style={{ textAlign: 'center', padding: "var(--vw-space-sm)", background: "var(--vw-color-slate-50)", borderRadius: "var(--vw-radius-sm)" }}><ExperimentOutlined style={{ color: "var(--vw-color-cyan-500)" }} /><div style={{ fontSize: "var(--vw-font-heading-2xl)", fontWeight: 700 }}>{m.pendingAtps}</div><Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)", fontWeight: 400, color: "var(--vw-color-slate-500)" }}>ATPs pending</Text></div>
              <div style={{ textAlign: 'center', padding: "var(--vw-space-sm)", background: "var(--vw-color-slate-50)", borderRadius: "var(--vw-radius-sm)" }}><SafetyCertificateOutlined /><div style={{ fontSize: "var(--vw-font-heading-2xl)", fontWeight: 700 }}>{m.hotoInProgress}</div><Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)", fontWeight: 400, color: "var(--vw-color-slate-500)" }}>HOTO open</Text></div>
              <div style={{ textAlign: 'center', padding: "var(--vw-space-sm)", background: "var(--vw-color-slate-50)", borderRadius: "var(--vw-radius-sm)" }}><WarningOutlined style={{ color: m.openSnags.critical + m.openSnags.major ? 'var(--vw-color-red-600)' : 'var(--vw-color-slate-400)' }} /><div style={{ fontSize: "var(--vw-font-heading-2xl)", fontWeight: 700 }}>{m.openSnags.critical + m.openSnags.major}</div><Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)", fontWeight: 400, color: "var(--vw-color-slate-500)" }}>blocking snags</Text></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><Text type="secondary">Budget / spend</Text><Text strong>{money(m.budget)} / {money(m.spend)}</Text></div>
              <Progress percent={m.budget ? Math.round((m.spend / m.budget) * 100) : 0} size="small" />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><Text type="secondary">PO forecast variance</Text><Text strong style={{ color: m.poVariance > 0 ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)' }}>{m.poVariance > 0 ? '+' : ''}{money(m.poVariance)}</Text></div>
            </div>
          </VwCard>
        </Col>
      </Row>

      {/* ── 3 · PERFORMANCE & EARNED VALUE ─────────────────────── */}
      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Performance &amp; earned value</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><DashboardOutlined />Programme health</Space>} extra={<Text style={{ fontSize: "var(--vw-font-label-sm)", color: healthHex(a.overall) }}>{a.overall >= 80 ? 'Healthy' : a.overall >= 60 ? 'Needs attention' : 'At risk'}</Text>}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <Progress type="dashboard" percent={a.overall} size={108} strokeColor={healthHex(a.overall)} />
              <div style={{ flex: 1 }}>
                {Object.entries(a.health).map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: "var(--vw-font-label-sm)" }}><Text type="secondary">{k}</Text><Text strong>{v}</Text></div>
                    <Progress percent={v} size="small" showInfo={false} strokeColor={healthHex(v)} />
                  </div>
                ))}
              </div>
            </div>
          </VwCard>
        </Col>
        <Col xs={24} lg={16}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><FundProjectionScreenOutlined />Earned-value performance</Space>} extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>PV vs EV vs AC · SPI/CPI · forecast</Text>}>
            <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md" style={{ marginBottom: 10 }}>
              {[
                ['SPI', a.ev.spi.toFixed(2), idxHex(a.ev.spi), <RiseOutlined key="i" />, 'purple'],
                ['CPI', a.ev.cpi.toFixed(2), idxHex(a.ev.cpi), <RiseOutlined key="i" />, 'purple'],
                ['BAC', money(a.ev.bac), undefined, <DollarOutlined key="i" />, 'info'],
                ['EAC', money(a.ev.eac), a.ev.eac > a.ev.bac ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)', <DollarOutlined key="i" />, 'orange'],
                ['VAC', `${a.ev.vac < 0 ? '−' : ''}${money(Math.abs(a.ev.vac))}`, a.ev.vac < 0 ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)', <DollarOutlined key="i" />, 'orange'],
                ['ETC', money(a.ev.etc), undefined, <DollarOutlined key="i" />, 'cyan'],
              ].map(([label, val, color, icon, tone]) => (
                <KpiTile label={label as string} value={val as string} color={color as string | undefined} icon={icon as any} iconTone={tone as 'purple' | 'info' | 'orange' | 'cyan'} key={label as string} />
              ))}
            </div>
            <ChartAutoFitBox height={220}>
              {a.evCurve.length ? (
                <Line data={a.evCurve} xField="month" yField="value" colorField="series" shapeField="smooth" autoFit
                  scale={{ color: { domain: ['PV', 'EV', 'AC'], range: ['#cbd5e1', '#16a34a', '#000000'] } }}
                  axis={{ x: { labelFontSize: 10 }, y: { labelFormatter: (v: number) => money(v) } }} legend={{ color: { position: 'top' } }} />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No schedule data" />}
            </ChartAutoFitBox>
          </VwCard>
        </Col>
      </Row>

      {/* ── 4 · EXECUTION HEALTH & TICKETS ─────────────────────── */}
      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Execution health &amp; tickets</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={14}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><FundProjectionScreenOutlined />Status × execution health</Space>} extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Velocity: {a.deliveredToDate}/{a.plannedToDate} milestones · {a.adherence}% adherence</Text>}>
            <Table rowKey="status" size="small" pagination={false} dataSource={a.matrix} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip>{s}</VwChip> },
                ...a.HCOLS.map((c) => ({ title: c, dataIndex: c, align: 'center' as const, render: (n: number) => n ? <Text strong style={{ color: c === 'Blockers' ? 'var(--vw-color-red-600)' : c === 'At risk' ? 'var(--vw-color-orange-700)' : c === 'Delayed' ? '#b45309' : 'var(--vw-color-green-600)' }}>{n}</Text> : <Text type="secondary">—</Text> })),
                { title: 'Total', dataIndex: 'total', align: 'center' as const, render: (n: number) => <Text strong>{n}</Text> },
              ]} />
          </VwCard>
        </Col>
        <Col xs={24} lg={10}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><TagsOutlined />Ticket analytics</Space>} extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", cursor: 'pointer' }} onClick={() => navigate('/delivery/tickets')}>Open register <ArrowRightOutlined style={{ fontSize: "var(--vw-font-label-xs)" }} /></Text>}>
            <Row gutter={12}>
              <Col xs={24} sm={13}>
                <ChartAutoFitBox height={190}>
                  {a.ticketByStatus.length ? <Pie data={a.ticketByStatus} angleField="value" colorField="status" innerRadius={0.55} autoFit legend={{ color: { position: 'bottom' } }} label={false} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tickets" />}
                </ChartAutoFitBox>
              </Col>
              <Col xs={24} sm={11}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--vw-space-sm)" }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Open</Text><Text strong>{a.ts.open}</Text></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Resolution rate</Text><Text strong style={{ color: 'var(--vw-color-green-600)' }}>{a.ts.resolutionRate}%</Text></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Avg resolve</Text><Text strong>{a.ts.avgResolveDays}d</Text></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Active blockers</Text><Text strong style={{ color: a.ts.blockers ? 'var(--vw-color-red-600)' : undefined }}>{a.ts.blockers}</Text></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>SLA breached</Text><Text strong style={{ color: a.ts.slaBreached ? 'var(--vw-color-red-600)' : undefined }}>{a.ts.slaBreached}</Text></div>
                </div>
              </Col>
            </Row>
          </VwCard>
        </Col>
      </Row>

      {/* ── 5 · SCHEDULE & ACTIVITY ────────────────────────────── */}
      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Schedule &amp; activity</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} md={12}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><ClockCircleOutlined />Milestone schedule</Space>} extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{m.overdueMs.length} overdue</Text>}>
            {(m.overdueMs.length + m.upcomingMs.length) === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No milestones scheduled" /> : (
              <div style={{ maxHeight: 430, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: "var(--vw-space-sm)", paddingRight: 2 }}>
                {[...m.overdueMs, ...m.upcomingMs].map((mi) => {
                  const meta = msMeta(mi.name); const due = dueMeta(mi.dueDate);
                  return (
                    <div key={mi.id} onClick={() => navigate(`/delivery/projects/${mi.projectId}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-md)", padding: '10px 12px', borderRadius: 10, border: '1px solid #eef2f6', borderLeft: `3px solid ${meta.color}`, cursor: 'pointer', transition: 'box-shadow .12s, background .12s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.boxShadow = '0 1px 6px rgba(15,23,42,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = 'none'; }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${meta.color} 10%, transparent)`, color: meta.color, fontSize: "var(--vw-font-heading-md)", flexShrink: 0 }}>{meta.icon}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--vw-color-slate-900)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mi.name}</div>
                        <div style={{ fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projName[mi.projectId]}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ display: 'inline-block', fontSize: "var(--vw-font-label-xs)", fontWeight: 600, color: due.color, background: due.bg, padding: '2px 8px', borderRadius: 999 }}>{due.text}</div>
                        <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)", marginTop: 3 }}>{due.date}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </VwCard>
        </Col>
        <Col xs={24} md={12}>
          <VwCard size="small" title="Recent delivery activity" style={{ height: '100%' }} bodyStyle={{ paddingTop: 18 }}>
            {m.recent.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recent changes" /> : (
              <Timeline
                items={m.recent.map((a) => {
                  const d = activityDot(a);
                  return {
                    dot: <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: d.bg, color: '#fff', fontSize: "var(--vw-font-label-xs)" }}>{d.icon}</span>,
                    children: (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: "var(--vw-space-md)", paddingBottom: 2 }}>
                        <div style={{ minWidth: 0 }}>
                          <Space size={6} style={{ marginBottom: 2 }}><VwChip style={{ marginInlineEnd: 0 }}>{a.entityType}</VwChip><Text strong style={{ textTransform: 'capitalize' }}>{a.action}</Text></Space>
                          <div style={{ fontSize: 12.5, color: "var(--vw-color-slate-600)", lineHeight: 1.45 }}>{a.summary}</div>
                        </div>
                        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)", whiteSpace: 'nowrap' }}>{ago(a.timestamp)}</Text>
                      </div>
                    ),
                  };
                })} />
            )}
          </VwCard>
        </Col>
      </Row>

      {/* Change & delivery calendar — on demand (milestone agenda above is the
          default planned-actions view; the full month grid opens here). */}
      <VwCard size="small" style={SECTION}
        title={<Space><CalendarOutlined />Change &amp; delivery calendar</Space>}
        extra={<Button size="small" type={calOpen ? 'default' : 'primary'} onClick={() => setCalOpen((v) => !v)}>{calOpen ? 'Hide calendar' : 'Open calendar'}</Button>}
        bodyStyle={{ paddingTop: calOpen ? 8 : 14 }}>
        {calOpen
          ? <DeliveryCalendar embedded />
          : <Text type="secondary" style={{ fontSize: "var(--vw-font-label-md)" }}>Planned actions for the next weeks are listed in the milestone schedule above. Open the calendar for the full month view of changes, go-lives and milestones.</Text>}
      </VwCard>
    </div>
  );
}
