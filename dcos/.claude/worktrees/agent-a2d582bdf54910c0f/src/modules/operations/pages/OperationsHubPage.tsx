import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Typography, Empty, Space, Progress } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import type { TableColumnType } from 'antd';
import {
  AlertOutlined, ThunderboltOutlined, SwapOutlined, ToolOutlined, RightOutlined,
  WarningOutlined, ApiOutlined, DashboardOutlined, FireOutlined,
} from '../../../shared/icons';
import { Pie } from '@ant-design/charts';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { ViewSwitcher } from '../../../shared/components/ux/ViewSwitcher';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import { VwCard, VwChip, ChartAutoFitBox } from '../../../shared/components/ux';
import { incidentStats, slaState, fmtDuration, SEV_COLOR, PRIORITY_COLOR } from '../lib/sla';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';
import type {
  Incident, ChangeRequest, ManagedDevice, Alarm, MaintenanceWindow, CoolingZone, DataCenter,
} from '../../../mock/data/types';

const { Text } = Typography;
const NOW = Date.now();
// Literal hex, not tokens — feeds this page's Pie chart `scale.color.range`s
// (@ant-design/charts, canvas-rendered), which can't resolve `var(--...)`
// references. Also used safely elsewhere via VwChip.
const almColor: Record<string, string> = { Critical: '#dc2626', Major: '#c2410c', Minor: '#000000', Warning: '#a16207', Info: '#7c7c7c' };
const mwColor: Record<string, string> = { 'Scheduled': 'blue', 'In Progress': 'gold', 'Completed': 'green', 'Cancelled': 'default' };

function ago(iso?: string): string {
  if (!iso) return '—';
  const ms = NOW - new Date(iso).getTime();
  const d = Math.floor(ms / 864e5); if (d > 0) return `${d}d ago`;
  const h = Math.floor(ms / 36e5); if (h > 0) return `${h}h ago`;
  const m = Math.floor(ms / 6e4); return m > 0 ? `${m}m ago` : 'just now';
}

export default function OperationsHubPage() {
  const navigate = useNavigate();
  const incidents = (useEntityList('incidents', { pageSize: 500 }).data?.data ?? []) as unknown as Incident[];
  const changes = (useEntityList('changeRequests', { pageSize: 500 }).data?.data ?? []) as unknown as ChangeRequest[];
  const devices = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const alarms = (useEntityList('alarms', { pageSize: 2000 }).data?.data ?? []) as unknown as Alarm[];
  const maint = (useEntityList('maintenanceWindows', { pageSize: 500 }).data?.data ?? []) as unknown as MaintenanceWindow[];
  const cooling = (useEntityList('coolingZones', { pageSize: 2000 }).data?.data ?? []) as unknown as CoolingZone[];
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];

  const m = useMemo(() => {
    const stats = incidentStats(incidents, NOW);
    const devName = Object.fromEntries(devices.map((d) => [d.id, d.hostname]));
    const dcName = Object.fromEntries(dcs.map((d) => [d.id, d.code || d.name]));

    // Triage: open incidents breaching SLA OR SEV1, worst first.
    const triage = incidents
      .filter((i) => !['Resolved', 'Closed'].includes(i.status))
      .map((i) => ({ i, sla: slaState(i, NOW) }))
      .filter((x) => x.sla.breached || x.i.severity === 'SEV1')
      .sort((a, b) => (a.i.severity.localeCompare(b.i.severity)) || (a.sla.resolveRemainingMins - b.sla.resolveRemainingMins));

    // Active alarms (uncleared) — critical/major surfaced for triage.
    const active = alarms.filter((a) => a.state === 'Active');
    const critMajor = active.filter((a) => a.severity === 'Critical' || a.severity === 'Major')
      .sort((a, b) => a.severity.localeCompare(b.severity) || (b.raisedAt > a.raisedAt ? 1 : -1));

    // Devices
    const reach = ['Reachable', 'Degraded', 'Unreachable'].map((r) => ({ type: r, value: devices.filter((d) => d.reachability === r).length }));
    const unreachable = reach.find((r) => r.type === 'Unreachable')?.value ?? 0;

    // Changes in flight
    const inFlight = changes.filter((c) => ['Scheduled', 'InProgress'].includes(c.status))
      .sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''));

    // Maintenance — active now or upcoming within 14 days
    const horizon = NOW + 14 * 864e5;
    const upcomingMw = maint
      .filter((w) => ['Scheduled', 'In Progress'].includes(w.status) && new Date(w.scheduledStart).getTime() <= horizon)
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
    const mwNext7 = maint.filter((w) => ['Scheduled', 'In Progress'].includes(w.status) && new Date(w.scheduledStart).getTime() <= NOW + 7 * 864e5).length;

    // Cooling headroom by DC (min across that DC's zones)
    const byDc = new Map<string, { cap: number; head: number }>();
    for (const z of cooling) {
      const cur = byDc.get(z.dataCenterId) ?? { cap: 0, head: 0 };
      cur.cap += z.coolingCapacityKw; cur.head += z.headroomKw; byDc.set(z.dataCenterId, cur);
    }
    const coolingByDc = Array.from(byDc.entries())
      .map(([id, v]) => ({ dc: dcName[id] ?? id, pct: v.cap ? Math.round((v.head / v.cap) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct);
    const coolingWarn = coolingByDc.filter((c) => c.pct < 10).length;

    // Donuts
    const incBySev = ['SEV1', 'SEV2', 'SEV3', 'SEV4']
      .map((s) => ({ type: s, value: incidents.filter((i) => i.severity === s && !['Resolved', 'Closed'].includes(i.status)).length }))
      .filter((x) => x.value > 0);
    const almBySev = ['Critical', 'Major', 'Minor', 'Warning', 'Info']
      .map((s) => ({ type: s, value: active.filter((a) => a.severity === s).length }))
      .filter((x) => x.value > 0);

    return { stats, triage, critMajor, activeAlarms: active.length, reach, unreachable, inFlight, upcomingMw, mwNext7, coolingByDc, coolingWarn, incBySev, almBySev, devName };
  }, [incidents, changes, devices, alarms, maint, cooling, dcs]);

  const triageCols: TableColumnType<{ i: Incident; sla: ReturnType<typeof slaState> }>[] = [
    { title: 'ID', key: 'id', width: 92, render: (_, r) => <Text strong>{r.i.incId}</Text> },
    { title: 'Sev', key: 'sev', width: 64, render: (_, r) => <VwChip color={SEV_COLOR[r.i.severity]}>{r.i.severity}</VwChip> },
    { title: 'Pri', key: 'pri', width: 54, render: (_, r) => r.i.priority ? <VwChip color={PRIORITY_COLOR[r.i.priority]}>{r.i.priority}</VwChip> : '—' },
    { title: 'Incident', key: 't', ellipsis: true, render: (_, r) => r.i.title },
    { title: 'Status', dataIndex: ['i', 'status'], key: 's', width: 104, render: (_: unknown, r) => <VwChip>{r.i.status}</VwChip> },
    {
      title: 'Resolve SLA', key: 'sla', width: 120, render: (_, r) => r.sla.resolveBreached
        ? <Text strong style={{ color: 'var(--vw-color-red-600)' }}>Overdue {fmtDuration(r.sla.resolveRemainingMins)}</Text>
        : <Text style={{ color: r.sla.resolveRemainingMins < 60 ? 'var(--vw-color-orange-700)' : '#515151' }}>{fmtDuration(r.sla.resolveRemainingMins)} left</Text>,
    },
    { title: 'Owner', key: 'o', width: 120, render: (_, r) => r.i.assignee ?? <Text type="secondary">Unassigned</Text> },
    { title: '', key: 'x', width: 28, render: () => <RightOutlined className="vw-text-tertiary" /> },
  ];

  const s = m.stats;
  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div>
          <div className="vw-page-title" role="heading" aria-level={3}>Operations</div>
        </div>
        <Space size={12} align="center" wrap>
          <PageDcScopeSelect />
          <ViewSwitcher />
        </Space>
      </div>

      {/* ── 1 · OPERATIONAL PULSE ─────────────────────────────── */}
      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Operational pulse</div>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md">
        <KPICard title="Open incidents" value={s.open} icon={<AlertOutlined />} iconTone="error" />
        <KPICard title="SLA breaching" value={s.breaching} color={s.breaching ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="warning" />
        <KPICard title="Active crit/major alarms" value={m.critMajor.length} color={m.critMajor.length ? 'var(--vw-color-red-600)' : undefined} icon={<FireOutlined />} iconTone="error" />
        <KPICard title="Devices unreachable" value={m.unreachable} color={m.unreachable ? 'var(--vw-color-orange-700)' : undefined} icon={<ApiOutlined />} iconTone="warning" />
        <KPICard title="Changes in flight" value={m.inFlight.length} icon={<SwapOutlined />} iconTone="info" />
        <KPICard title="Maintenance (next 7d)" value={m.mwNext7} icon={<ToolOutlined />} iconTone="cyan" />
      </div>

      {/* ── 2 · NEEDS ATTENTION NOW ───────────────────────────── */}
      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Needs attention now</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={15}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><WarningOutlined style={{ color: 'var(--vw-color-orange-700)' }} />SLA-breaching & SEV1 incidents ({m.triage.length})</Space>}
            extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", cursor: 'pointer' }} onClick={() => navigate('/incidents')}>All incidents →</Text>}>
            {m.triage.length === 0
              ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No breaching or SEV1 incidents — within SLA." />
              : <Table rowKey={(r) => r.i.id} size="small" dataSource={m.triage} columns={triageCols} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 300, x: 'max-content' }}
                  onRow={(r) => ({ onClick: () => navigate(`/incidents/${r.i.id}`), style: { cursor: 'pointer' } })} />}
          </VwCard>
        </Col>
        <Col xs={24} lg={9}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><FireOutlined style={{ color: 'var(--vw-color-red-600)' }} />Active critical / major alarms</Space>}
            extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", cursor: 'pointer' }} onClick={() => navigate('/nms/alarms')}>Console →</Text>}>
            {m.critMajor.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No active critical alarms" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--vw-space-sm)", maxHeight: 300, overflowY: 'auto' }}>
                {m.critMajor.slice(0, 8).map((al) => (
                  <div key={al.id} onClick={() => navigate('/nms/alarms')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid #eef2f6', borderLeft: `3px solid ${almColor[al.severity]}`, borderRadius: "var(--vw-radius-sm)", cursor: 'pointer' }}>
                    <VwChip color={almColor[al.severity]} style={{ marginInlineEnd: 0 }}>{al.severity}</VwChip>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 600, color: '#252525', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{al.type}</div>
                      <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.devName[al.deviceId] ?? 'device'} · {al.incidentId ? 'linked to incident' : 'no incident'}</div>
                    </div>
                    <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)", whiteSpace: 'nowrap' }}>{ago(al.raisedAt)}</Text>
                  </div>
                ))}
              </div>
            )}
          </VwCard>
        </Col>
      </Row>

      {/* ── 3 · INCIDENT & ALARM HEALTH ───────────────────────── */}
      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Incident &amp; alarm health</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} sm={12} lg={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><AlertOutlined />Open incidents by severity</Space>}>
            <Row gutter={8}>
              <Col xs={24} sm={13}>
                <ChartAutoFitBox height={170}>
                  {m.incBySev.length ? <Pie data={m.incBySev} angleField="value" colorField="type" innerRadius={0.58} autoFit
                    scale={{ color: { domain: ['SEV1', 'SEV2', 'SEV3', 'SEV4'], range: [SEV_COLOR.SEV1, SEV_COLOR.SEV2, SEV_COLOR.SEV3, SEV_COLOR.SEV4] } }}
                    legend={{ color: { position: 'bottom' } }} label={false} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No open incidents" />}
                </ChartAutoFitBox>
              </Col>
              <Col xs={24} sm={11}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Mean MTTR</Text><Text strong>{s.mttrMins != null ? fmtDuration(s.mttrMins) : '—'}</Text></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>SLA compliance</Text><Text strong style={{ color: s.slaCompliancePct >= 90 ? 'var(--vw-color-green-600)' : s.slaCompliancePct >= 75 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)' }}>{s.slaCompliancePct}%</Text></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Unacknowledged</Text><Text strong style={{ color: s.unacknowledged ? 'var(--vw-color-orange-700)' : undefined }}>{s.unacknowledged}</Text></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Resolved (total)</Text><Text strong>{s.resolved}</Text></div>
                </div>
              </Col>
            </Row>
          </VwCard>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><ApiOutlined />Active alarms by severity</Space>}
            extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{m.activeAlarms} active</Text>}>
            <ChartAutoFitBox height={200}>
              {m.almBySev.length ? <Pie data={m.almBySev} angleField="value" colorField="type" innerRadius={0.58} autoFit
                scale={{ color: { domain: ['Critical', 'Major', 'Minor', 'Warning', 'Info'], range: [almColor.Critical, almColor.Major, almColor.Minor, almColor.Warning, almColor.Info] } }}
                legend={{ color: { position: 'bottom' } }} label={false} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No active alarms" />}
            </ChartAutoFitBox>
          </VwCard>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><DashboardOutlined />Device reachability</Space>}
            extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{devices.length} devices</Text>}>
            <div style={{ marginTop: 6 }}>
              {(() => { const max = Math.max(1, ...m.reach.map((r) => r.value)); const c: Record<string, string> = { Reachable: 'var(--vw-color-green-600)', Degraded: 'var(--vw-color-orange-700)', Unreachable: 'var(--vw-color-red-600)' };
                return m.reach.map((r) => (
                  <div key={r.type} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <span style={{ width: 92, fontSize: "var(--vw-font-label-sm)", color: '#515151', flexShrink: 0 }}>{r.type}</span>
                    <div style={{ flex: 1, height: 18, background: "var(--vw-color-slate-100)", borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0, height: '100%', background: c[r.type], borderRadius: 6 }} />
                    </div>
                    <span style={{ width: 28, textAlign: 'right', fontSize: "var(--vw-font-label-md)", fontWeight: 600, color: '#252525' }}>{r.value}</span>
                  </div>
                )); })()}
            </div>
          </VwCard>
        </Col>
      </Row>

      {/* ── 4 · PLANNED WORK & ENVIRONMENT ────────────────────── */}
      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Planned work &amp; environment</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} sm={12} lg={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><ThunderboltOutlined />Cooling headroom by DC</Space>}
            extra={m.coolingWarn ? <Text style={{ fontSize: "var(--vw-font-label-sm)", color: 'var(--vw-color-red-600)' }}>{m.coolingWarn} below 10%</Text> : <Text style={{ fontSize: "var(--vw-font-label-sm)", color: 'var(--vw-color-green-600)' }}>all healthy</Text>}>
            {m.coolingByDc.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No cooling data" /> : (
              <div style={{ marginTop: "var(--vw-space-xxs)" }}>
                {m.coolingByDc.slice(0, 7).map((c) => (
                  <div key={c.dc} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: "var(--vw-font-label-sm)", marginBottom: 2 }}>
                      <Text type="secondary">{c.dc}</Text>
                      <Text strong style={{ color: c.pct < 10 ? 'var(--vw-color-red-600)' : c.pct < 20 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-green-600)' }}>{c.pct}%</Text>
                    </div>
                    <Progress percent={c.pct} size="small" showInfo={false} strokeColor={c.pct < 10 ? 'var(--vw-color-red-600)' : c.pct < 20 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-green-600)'} />
                  </div>
                ))}
              </div>
            )}
          </VwCard>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><SwapOutlined />Changes in flight</Space>}
            extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", cursor: 'pointer' }} onClick={() => navigate('/change')}>Queue →</Text>}>
            {m.inFlight.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No changes in flight" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--vw-space-sm)", maxHeight: 280, overflowY: 'auto' }}>
                {m.inFlight.slice(0, 7).map((c) => (
                  <div key={c.id} onClick={() => navigate(`/change/${c.id}`)} style={{ padding: '8px 10px', border: '1px solid #eef2f6', borderRadius: "var(--vw-radius-sm)", cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: "var(--vw-space-sm)" }}>
                      <Text strong style={{ fontSize: "var(--vw-font-label-md)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</Text>
                      <VwChip color={c.status === 'InProgress' ? 'processing' : 'cyan'} style={{ marginInlineEnd: 0 }}>{c.status}</VwChip>
                    </div>
                    <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{c.type} · risk {c.risk}</div>
                  </div>
                ))}
              </div>
            )}
          </VwCard>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<Space><ToolOutlined />Upcoming maintenance (14d)</Space>}>
            {m.upcomingMw.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No maintenance scheduled" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--vw-space-sm)", maxHeight: 280, overflowY: 'auto' }}>
                {m.upcomingMw.slice(0, 7).map((w) => (
                  <div key={w.id} onClick={() => w.changeRequestId && navigate(`/change/${w.changeRequestId}`)} style={{ padding: '8px 10px', border: '1px solid #eef2f6', borderRadius: "var(--vw-radius-sm)", cursor: w.changeRequestId ? 'pointer' : 'default' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: "var(--vw-space-sm)" }}>
                      <Text strong style={{ fontSize: "var(--vw-font-label-md)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</Text>
                      <VwChip color={mwColor[w.status]} style={{ marginInlineEnd: 0 }}>{w.status}</VwChip>
                    </div>
                    <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{w.scheduledStart.slice(0, 16).replace('T', ' ')} · {w.impact}</div>
                  </div>
                ))}
              </div>
            )}
          </VwCard>
        </Col>
      </Row>
    </div>
  );
}
