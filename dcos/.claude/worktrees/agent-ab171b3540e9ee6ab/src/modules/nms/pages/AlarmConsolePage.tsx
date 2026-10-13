import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Row, Col, Typography, Empty, Space, Tooltip } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import type { TableColumnType } from 'antd';
import { ThunderboltOutlined, ClusterOutlined, FireOutlined, ArrowRightOutlined, LineChartOutlined, AlertOutlined, ThunderboltFilled, ClockCircleOutlined, CheckCircleOutlined } from '../../../shared/icons';
import { Column } from '@ant-design/charts';
import { useEntityList, useEntityUpdate, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { KPICard } from '../../../shared/components/KPICard';
import { sevToIncident } from '../components/nmsUtil';
import { alarmStats, alarmTrend, correlationGroups, alarmAgeMins, fmtAge, isFlapping, SEV_HEX, SEV_ORDER, type FaultGroup } from '../lib/fault';
import { SLA_TARGETS } from '../../operations/lib/sla';
import type { Alarm, ManagedDevice, AlarmRule } from '../../../mock/data/types';
import type { Severity } from '../../../mock/data/enums';
import { VwCard, VwChip, VwSegmented, ChartAutoFitBox } from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const SEV_TO_PRI = { SEV1: 'P1', SEV2: 'P2', SEV3: 'P3', SEV4: 'P4' } as const;

export default function AlarmConsolePage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const alarms = (useEntityList('alarms', { pageSize: 2000 }).data?.data ?? []) as unknown as Alarm[];
  const devices = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const rules = (useEntityList('alarmRules', { pageSize: 100 }).data?.data ?? []) as unknown as AlarmRule[];
  const update = useEntityUpdate('alarms');
  const createIncident = useEntityCreate('incidents');
  const audit = useRecordAudit();
  const [filter, setFilter] = useState<string>('Active');

  const devName = useMemo(() => Object.fromEntries(devices.map((d) => [d.id, d.hostname])), [devices]);
  const ruleName = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.name])), [rules]);
  const stats = useMemo(() => alarmStats(alarms), [alarms]);
  const trend = useMemo(() => alarmTrend(alarms), [alarms]);
  const groups = useMemo(() => correlationGroups(alarms), [alarms]);
  const rows = useMemo(() => alarms.filter((a) => filter === 'All' ? true : a.state === filter)
    .sort((a, b) => alarmAgeMins(b) - alarmAgeMins(a)), [alarms, filter]);

  const ack = (a: Alarm) => update.mutate({ id: a.id, data: { state: 'Acknowledged', acknowledgedAt: new Date().toISOString() } },
    { onSuccess: () => { message.success(`${a.almId} acknowledged`); audit('Alarm', a.almId, 'acknowledged', a.type); } });
  const clear = (a: Alarm) => update.mutate({ id: a.id, data: { state: 'Cleared', clearedAt: new Date().toISOString() } },
    { onSuccess: () => { message.success(`${a.almId} cleared`); audit('Alarm', a.almId, 'cleared', a.type); } });

  const makeIncident = (deviceId: string, sevName: string, title: string, alarmIds: string[]) => {
    const now = new Date().toISOString();
    const sev = sevToIncident(sevName) as Severity;
    const t = SLA_TARGETS[sev];
    createIncident.mutate({
      incId: `INC-NMS-${Date.now().toString().slice(-4)}`, title, type: 'Network', severity: sev,
      status: 'Open', priority: SEV_TO_PRI[sev], affectedResourceType: 'Asset', affectedResourceIds: [deviceId], detectedAt: now,
      slaResponseMins: t.responseMins, slaResolveMins: t.resolveMins, reportedBy: 'Monitoring System', linkedAlarmIds: alarmIds,
      worklog: [{ at: now, author: 'Monitoring', kind: 'StatusChange', text: `Raised from ${alarmIds.length} correlated alarm(s) on ${devName[deviceId] ?? 'device'}.` }],
      customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'NOC', createdById: 'noc',
    }, {
      onSuccess: (rec: Record<string, unknown>) => {
        alarmIds.forEach((id) => update.mutate({ id, data: { incidentId: rec.id as string } }));
        message.success('Incident raised'); audit('Alarm', alarmIds[0], 'promoted to incident', title);
        navigate(`/incidents/${rec.id as string}`);
      },
    });
  };
  const promoteGroup = (g: FaultGroup) => makeIncident(g.deviceId, g.maxSeverity, `${devName[g.deviceId] ?? 'Device'} — ${g.members.length} correlated alarms`, g.members.map((m) => m.id));

  const columns: TableColumnType<Alarm>[] = [
    { title: 'Severity', dataIndex: 'severity', width: 96, render: (s: string) => <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: SEV_HEX[s], marginRight: 7 }} /><VwChip color={SEV_HEX[s]}>{s}</VwChip></span> },
    { title: 'Device', dataIndex: 'deviceId', ellipsis: true, render: (d: string) => <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>{devName[d] ?? d}</Text> },
    { title: 'Alarm', dataIndex: 'type', ellipsis: true },
    { title: 'Rule', dataIndex: 'ruleId', width: 150, render: (r?: string) => r ? <VwChip>{ruleName[r] ?? 'rule'}</VwChip> : <Text type="secondary">event</Text> },
    { title: 'Age', key: 'age', width: 84, render: (_: unknown, a: Alarm) => fmtAge(alarmAgeMins(a)) },
    {
      title: 'Occurrences', key: 'occ', width: 120, render: (_: unknown, a: Alarm) => (
        <Space size={4}>
          <Text style={{ fontVariantNumeric: 'tabular-nums' }}>×{a.count ?? 1}</Text>
          {isFlapping(a) && <Tooltip title={`Flapped ${a.flapCount} times`}><VwChip color="warning" style={{ marginInlineEnd: 0 }}>flapping</VwChip></Tooltip>}
        </Space>
      ),
    },
    { title: 'Correlation', dataIndex: 'correlationId', width: 110, render: (c?: string, a?: Alarm) => c ? <VwChip color="purple">storm{a?.incidentId ? ' · INC' : ''}</VwChip> : (a?.incidentId ? <VwChip color="purple">INC</VwChip> : <Text type="secondary">—</Text>) },
    {
      title: '', key: 'x', width: 190, render: (_: unknown, a: Alarm) => (
        <Space size={4}>
          {a.state === 'Active' && <Button size="small" onClick={() => ack(a)}>Ack</Button>}
          {a.state !== 'Cleared' && <Button size="small" onClick={() => clear(a)}>Clear</Button>}
          {!a.incidentId && a.state !== 'Cleared' && <Button size="small" type="primary" ghost onClick={() => makeIncident(a.deviceId, a.severity, `${devName[a.deviceId] ?? 'Device'} — ${a.type}`, [a.id])}>→ Incident</Button>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>Alarm Console</div>

      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Fault pulse</div>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md">
        <KPICard title="Active crit/major" value={stats.critMajor} color={stats.critMajor ? 'var(--vw-color-red-600)' : undefined} icon={<FireOutlined />} iconTone="error" />
        <KPICard title="Total active" value={stats.totalActive} icon={<AlertOutlined />} iconTone="info" />
        <KPICard title="Correlated storms" value={stats.storms} color={stats.storms ? 'var(--vw-color-orange-700)' : undefined} icon={<ThunderboltFilled />} iconTone="warning" />
        <KPICard title="Flapping" value={stats.flapping} color={stats.flapping ? 'var(--vw-color-orange-700)' : undefined} icon={<ArrowRightOutlined />} iconTone="warning" />
        <KPICard title="Mean ack time" value={stats.mttaMins != null ? fmtAge(stats.mttaMins) : '—'} icon={<ClockCircleOutlined />} iconTone="cyan" />
        <KPICard title="Acknowledged" value={stats.acknowledged} icon={<CheckCircleOutlined />} iconTone="success" />
      </div>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Alarm volume — last 14 days</div>
      <VwCard size="small" title={<><LineChartOutlined /> Alarms raised by severity</>}>
        <ChartAutoFitBox height={200}>
          <Column data={trend} xField="day" yField="value" colorField="severity" stack autoFit
            scale={{ color: { domain: [...SEV_ORDER], range: SEV_ORDER.map((s) => SEV_HEX[s]) } }}
            axis={{ x: { labelFontSize: 10 } }} legend={{ color: { position: 'top' } }} />
        </ChartAutoFitBox>
      </VwCard>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Live faults</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={16}>
          <VwCard size="small" style={{ height: '100%' }} title={<><ThunderboltOutlined /> Alarms</>}
            extra={<VwSegmented size="small" value={filter} onChange={(v) => setFilter(v as string)} options={['Active', 'Acknowledged', 'Cleared', 'All']} />}>
            <Table<Alarm> rowKey="id" size="small" dataSource={rows} columns={columns} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 360, x: 'max-content' }}
              onRow={(a) => ({ onClick: () => navigate(`/nms/devices/${a.deviceId}`), style: { cursor: 'pointer' } })} />
          </VwCard>
        </Col>
        <Col xs={24} lg={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<><ClusterOutlined /> Correlated fault storms</>}
            extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{groups.length} active</Text>}>
            {groups.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No correlated storms" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
                {groups.slice(0, 8).map((g) => (
                  <div key={g.id} style={{ border: '1px solid #eef2f6', borderLeft: `3px solid ${SEV_HEX[g.maxSeverity]}`, borderRadius: "var(--vw-radius-sm)", padding: '9px 11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: "var(--vw-space-sm)" }}>
                      <Text strong style={{ fontSize: "var(--vw-font-label-md)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{devName[g.deviceId] ?? g.deviceId}</Text>
                      <VwChip color={SEV_HEX[g.maxSeverity]}>{g.members.length} alarms</VwChip>
                    </div>
                    <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)", margin: '4px 0 8px' }}>{g.types.slice(0, 3).join(' · ')}</div>
                    <Button size="small" type="primary" ghost block onClick={() => promoteGroup(g)}>Promote storm → incident</Button>
                  </div>
                ))}
              </div>
            )}
          </VwCard>
        </Col>
      </Row>

      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Threshold rules &amp; top devices</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={14}>
          <VwCard size="small" style={{ height: '100%' }} title="Alarm rules (thresholds that raise faults)">
            <Table<AlarmRule> rowKey="id" size="small" dataSource={rules} pagination={false} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Rule', dataIndex: 'name', render: (n: string) => <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>{n}</Text> },
                { title: 'Condition', key: 'c', render: (_: unknown, r: AlarmRule) => <Text code style={{ fontSize: "var(--vw-font-label-sm)" }}>{r.metric} {r.operator} {r.threshold}{r.metric === 'Temperature' ? '°C' : '%'} · {r.durationMins}m</Text> },
                { title: 'Severity', dataIndex: 'severity', width: 90, render: (s: string) => <VwChip color={SEV_HEX[s]}>{s}</VwChip> },
                { title: 'Scope', dataIndex: 'scope', width: 110, render: (s: string) => <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{s}</Text> },
                { title: 'State', dataIndex: 'enabled', width: 80, render: (e: boolean) => e ? <VwChip color="success">enabled</VwChip> : <VwChip>off</VwChip> },
              ]} />
          </VwCard>
        </Col>
        <Col xs={24} lg={10}>
          <VwCard size="small" style={{ height: '100%' }} title={<><FireOutlined /> Top alarming devices</>}>
            {stats.topDevices.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Quiet — no active alarms" /> : (
              <div>
                {(() => { const max = Math.max(1, ...stats.topDevices.map((d) => d.n));
                  return stats.topDevices.map((d) => (
                    <div key={d.deviceId} onClick={() => navigate(`/nms/devices/${d.deviceId}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: "var(--vw-space-md)", cursor: 'pointer' }}>
                      <span style={{ width: 130, fontSize: "var(--vw-font-label-md)", color: '#252525', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{devName[d.deviceId] ?? d.deviceId}</span>
                      <div style={{ flex: 1, height: 16, background: "var(--vw-color-slate-100)", borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ width: `${(d.n / max) * 100}%`, height: '100%', background: SEV_HEX[d.maxSeverity], borderRadius: 5 }} />
                      </div>
                      <span style={{ width: 22, textAlign: 'right', fontSize: "var(--vw-font-label-md)", fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d.n}</span>
                      <ArrowRightOutlined style={{ color: "var(--vw-color-slate-300)", fontSize: "var(--vw-font-label-xs)" }} />
                    </div>
                  )); })()}
              </div>
            )}
          </VwCard>
        </Col>
      </Row>
    </div>
  );
}
