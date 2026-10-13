import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Descriptions, Empty, Space, Typography, Input, Timeline } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import {
  ArrowLeftOutlined, CheckCircleOutlined, SwapOutlined, MessageOutlined,
  CheckCircleFilled, UserAddOutlined, WarningOutlined, EditOutlined, ApiOutlined,
} from '../../../shared/icons';
import { useEntityDetail, useEntityUpdate, useEntityCreate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { EntityAuditTab } from '../../../shared/components/detail';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { slaState, mttrMins, ackLatencyMins, fmtDuration, SEV_COLOR, PRIORITY_COLOR } from '../../operations/lib/sla';
import type { Incident, IncidentWorklogEntry, ApprovalMatrixRule } from '../../../mock/data/types';

const { Text } = Typography;
const FLOW = ['Open', 'Investigating', 'Mitigated', 'Resolved', 'Closed'];

const KIND_META: Record<string, { color: string; icon: React.ReactNode }> = {
  StatusChange: { color: 'var(--primaryColor500)', icon: <SwapOutlined /> },
  Assignment: { color: '#7c3aed', icon: <UserAddOutlined /> },
  Escalation: { color: 'var(--vw-color-red-600)', icon: <WarningOutlined /> },
  Resolution: { color: 'var(--vw-color-green-600)', icon: <CheckCircleFilled /> },
  Note: { color: 'var(--vw-color-gray-500)', icon: <MessageOutlined /> },
};

export default function IncidentDetailPage() {
  const { incidentId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { data } = useEntityDetail('incidents', incidentId);
  const update = useEntityUpdate('incidents');
  const createCr = useEntityCreate('changeRequests');
  const rules = (useEntityList('approvalMatrixRules', { pageSize: 100 }).data?.data ?? []) as unknown as ApprovalMatrixRule[];
  const audit = useRecordAudit();
  const [note, setNote] = useState('');
  const inc = data as unknown as Incident | null;
  if (!inc) return <div><Empty description="Incident not found" /></div>;

  const sla = slaState(inc);
  const closed = inc.status === 'Resolved' || inc.status === 'Closed';
  const idx = FLOW.indexOf(inc.status);
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
  const worklog = inc.worklog ?? [];
  const appendLog = (e: IncidentWorklogEntry) => [...worklog, e];
  const now = () => new Date().toISOString();

  const advance = (to: string) => {
    const ts = now();
    const extra: Partial<Incident> = { status: to as Incident['status'] };
    if (to === 'Resolved') { extra.resolvedAt = ts; extra.worklog = appendLog({ at: ts, author: 'You', kind: 'Resolution', text: 'Incident marked resolved.' }); }
    else extra.worklog = appendLog({ at: ts, author: 'You', kind: 'StatusChange', text: `Status → ${to}.` });
    update.mutate({ id: inc.id, data: extra }, { onSuccess: () => { message.success(`Incident → ${to}`); audit('Incident', inc.incId, to, `${inc.title} → ${to}`); } });
  };
  const acknowledge = () => {
    const ts = now();
    update.mutate({ id: inc.id, data: { acknowledgedAt: ts, status: inc.status === 'Open' ? 'Investigating' : inc.status, worklog: appendLog({ at: ts, author: 'You', kind: 'Assignment', text: 'Acknowledged; ownership taken.' }) } },
      { onSuccess: () => { message.success('Acknowledged'); audit('Incident', inc.incId, 'Acknowledged', inc.title); } });
  };
  const addNote = () => {
    if (!note.trim()) return;
    const ts = now();
    update.mutate({ id: inc.id, data: { worklog: appendLog({ at: ts, author: 'You', kind: 'Note', text: note.trim() }) } },
      { onSuccess: () => { setNote(''); message.success('Note added'); } });
  };
  const raiseChange = () => {
    const ts = now();
    const rule = rules.find((r) => r.riskLevel === 'High') ?? rules[0];
    createCr.mutate({
      chgId: `CHG-INC-${Date.now().toString().slice(-4)}`, title: `Emergency fix — ${inc.title}`,
      type: 'ConfigPush', description: `Remediation change raised from incident ${inc.incId}.`,
      risk: 'High', status: 'Submitted', priority: 'High',
      affectedResourceType: inc.affectedResourceType, affectedResourceIds: inc.affectedResourceIds,
      dataCenterId: inc.dataCenterId, requestedBy: 'You', requestedById: 'me',
      policyViolations: [], approvalRuleId: rule?.id, source: 'Internal',
      isDeleted: false, createdAt: ts, updatedAt: ts, createdBy: 'You', createdById: 'me',
    }, {
      onSuccess: (rec: Record<string, unknown>) => {
        update.mutate({ id: inc.id, data: { linkedChangeRequestId: rec.id as string, worklog: appendLog({ at: ts, author: 'You', kind: 'Note', text: 'Raised emergency change for remediation.' }) } });
        audit('Incident', inc.incId, 'RaisedChange', `Emergency change for ${inc.title}`);
        message.success('Emergency change raised');
        navigate(`/change/${rec.id as string}`);
      },
    });
  };

  const slaCell = (label: string, breached: boolean, met: boolean, detail: string) => (
    <div style={{ flex: 1, padding: '10px 12px', borderRadius: "var(--vw-radius-sm)", background: breached ? '#fef2f2' : met ? '#ecfdf5' : '#f8fafc', border: `1px solid ${breached ? '#fecaca' : met ? '#bbf7d0' : '#eef2f6'}` }}>
      <div className="vw-card-metric-label-sm">{label}</div>
      <div style={{ fontSize: "var(--vw-font-heading-md)", fontWeight: 600, color: breached ? 'var(--vw-color-red-600)' : met ? 'var(--vw-color-green-600)' : '#252525' }}>{detail}</div>
    </div>
  );

  return (
    <div>
      <Space className="vw-card-section" style={{ marginBottom: "var(--vw-space-md)", width: '100%' }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/incidents')}>Incidents</Button>
        <div className="vw-page-title" role="heading" aria-level={4}>{inc.incId}</div>
        <VwChip color={SEV_COLOR[inc.severity]}>{inc.severity}</VwChip>
        {inc.priority && <VwChip color={PRIORITY_COLOR[inc.priority]}>{inc.priority}</VwChip>}
        <VwChip>{inc.status}</VwChip>
        {sla.breached && <VwChip color="error">SLA breach</VwChip>}
      </Space>

      {/* Action bar */}
      <VwCard size="small" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <Space wrap>
          {!inc.acknowledgedAt && !closed && <Button icon={<UserAddOutlined />} onClick={acknowledge}>Acknowledge</Button>}
          {next && <Button type="primary" icon={<SwapOutlined />} onClick={() => advance(next)}>Advance to {next}</Button>}
          {!closed && <Button icon={<CheckCircleOutlined />} onClick={() => advance('Resolved')}>Resolve</Button>}
          {!inc.linkedChangeRequestId && !closed && <Button icon={<EditOutlined />} onClick={raiseChange}>Raise emergency change</Button>}
        </Space>
      </VwCard>

      {/* SLA timers */}
      <VwCard size="small" title="SLA" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <div style={{ display: 'flex', gap: "var(--vw-space-md)" }}>
          {slaCell('Response', sla.responseBreached, !sla.responseBreached && !!inc.acknowledgedAt,
            inc.acknowledgedAt ? (sla.responseBreached ? `Breached (${fmtDuration(ackLatencyMins(inc) ?? 0)})` : `Met in ${fmtDuration(ackLatencyMins(inc) ?? 0)}`) : (sla.responseBreached ? 'Breached — unacked' : `${fmtDuration(sla.responseRemainingMins)} to ack`))}
          {slaCell('Resolution', sla.resolveBreached, closed && !sla.resolveBreached,
            closed ? (sla.resolveBreached ? `Late (MTTR ${fmtDuration(mttrMins(inc) ?? 0)})` : `On time (MTTR ${fmtDuration(mttrMins(inc) ?? 0)})`) : (sla.resolveBreached ? `Overdue ${fmtDuration(sla.resolveRemainingMins)}` : `${fmtDuration(sla.resolveRemainingMins)} left`))}
          {slaCell('Target', false, false, `${fmtDuration(inc.slaResponseMins ?? 0)} / ${fmtDuration(inc.slaResolveMins ?? 0)}`)}
        </div>
      </VwCard>

      <div className="vw-incident-detail-grid">
          <VwCard size="small" title="Details" className="vw-incident-details">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Title">{inc.title}</Descriptions.Item>
              <Descriptions.Item label="Type">{inc.type}</Descriptions.Item>
              <Descriptions.Item label="Owner">{inc.assignee ?? <Text type="secondary">Unassigned</Text>}</Descriptions.Item>
              <Descriptions.Item label="Reported by">{inc.reportedBy ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Data center">{inc.dataCenterId ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Detected">{inc.detectedAt?.slice(0, 16).replace('T', ' ')}</Descriptions.Item>
              <Descriptions.Item label="Acknowledged">{inc.acknowledgedAt ? inc.acknowledgedAt.slice(0, 16).replace('T', ' ') : '—'}</Descriptions.Item>
              <Descriptions.Item label="Resolved">{inc.resolvedAt ? inc.resolvedAt.slice(0, 16).replace('T', ' ') : '—'}</Descriptions.Item>
              <Descriptions.Item label="MTTR">{mttrMins(inc) != null ? fmtDuration(mttrMins(inc)!) : '—'}</Descriptions.Item>
              <Descriptions.Item label="Affected"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{(inc.affectedResourceIds ?? []).map((r) => <VwChip key={r}>{inc.affectedResourceType}:{r}</VwChip>)}</div></Descriptions.Item>
              {inc.rootCause && <Descriptions.Item label="Root cause">{inc.rootCause}</Descriptions.Item>}
            </Descriptions>
          </VwCard>

          {/* Linked entities (the loop) */}
          <VwCard size="small" title="Linked" className="vw-incident-linked">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}><ApiOutlined /> Triggering alarms: </Text>
                {(inc.linkedAlarmIds ?? []).length
                  ? <a onClick={() => navigate('/nms/alarms')}>{inc.linkedAlarmIds!.length} correlated alarm(s) →</a>
                  : <Text type="secondary">none</Text>}
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}><SwapOutlined /> Remediation change: </Text>
                {inc.linkedChangeRequestId
                  ? <a onClick={() => navigate(`/change/${inc.linkedChangeRequestId}`)}>open change request →</a>
                  : <Text type="secondary">none raised</Text>}
              </div>
            </Space>
          </VwCard>

          <VwCard size="small" title="Worklog" className="vw-incident-worklog">
            <Space.Compact style={{ width: '100%', flexShrink: 0, marginBottom: "var(--vw-space-md)" }}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a worklog note…" onPressEnter={addNote} />
              <Button type="primary" onClick={addNote}>Add</Button>
            </Space.Compact>
            <div className="vw-incident-worklog-entries" tabIndex={0} role="region" aria-label="Worklog entries">
            {worklog.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No worklog yet" /> : (
              <Timeline
                items={[...worklog].reverse().map((w) => {
                  const meta = KIND_META[w.kind] ?? KIND_META.Note;
                  return {
                    dot: <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: meta.color, color: '#fff', fontSize: "var(--vw-font-label-xs)" }}>{meta.icon}</span>,
                    children: (
                      <div style={{ paddingBottom: 2 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
                          <Text strong style={{ fontSize: 12.5 }}>{w.author}</Text>
                          <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)", whiteSpace: 'nowrap' }}>{w.at.slice(0, 16).replace('T', ' ')}</Text>
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--vw-color-slate-600)" }}>{w.text}</div>
                      </div>
                    ),
                  };
                })} />
            )}
            </div>
          </VwCard>
      </div>

      <VwCard size="small" title="Activity"><EntityAuditTab entityType="Incident" entityId={inc.incId} /></VwCard>
    </div>
  );
}
