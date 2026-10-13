import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App } from 'antd';
import { ArrowRightLeft, CircleCheck, Cpu, FileText, History, Link2, MessageSquare, PencilLine, ShieldAlert, UserPlus } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, KV, Panel, PanelLink } from '../../../ops/ui/kit';
import { StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityDetail, useEntityUpdate, useEntityCreate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { EntityAuditTab } from '../../../shared/components/detail';
import { slaState, mttrMins, ackLatencyMins, fmtDuration } from '../../operations/lib/sla';
import type { Incident, IncidentWorklogEntry, ApprovalMatrixRule } from '../../../mock/data/types';

const FLOW = ['Open', 'Investigating', 'Mitigated', 'Resolved', 'Closed'];

const KIND_META: Record<string, { color: string; icon: typeof MessageSquare }> = {
  StatusChange: { color: 'var(--primaryColor500)', icon: ArrowRightLeft },
  Assignment: { color: '#7c3aed', icon: UserPlus },
  Escalation: { color: 'var(--vw-color-red-600)', icon: ShieldAlert },
  Resolution: { color: 'var(--vw-color-green-600)', icon: CircleCheck },
  Note: { color: 'var(--vw-color-gray-500)', icon: MessageSquare },
};
const SEV_TONE: Record<string, Tone> = { SEV1: 'error', SEV2: 'orange', SEV3: 'neutral', SEV4: 'neutral' };
const PRI_TONE: Record<string, Tone> = { P1: 'error', P2: 'orange', P3: 'neutral', P4: 'neutral' };
const STATUS_TONE: Record<string, Tone> = { Open: 'error', Investigating: 'warning', Mitigated: 'info', Resolved: 'success', Closed: 'neutral' };
const fmtTs = (t?: string) => (t ? t.slice(0, 16).replace('T', ' ') : '—');

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
  if (!inc) return <PageEmptyState title="Incident not found" />;

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

  const ackMins = fmtDuration(ackLatencyMins(inc) ?? 0);
  const mttr = fmtDuration(mttrMins(inc) ?? 0);

  return (
    <OpsPage
      title={inc.incId}
      description={[inc.title, inc.type, inc.dataCenterId, inc.assignee ? `owner ${inc.assignee}` : 'unassigned'].filter(Boolean).join(' · ')}
      actions={<>
        <Chip tone={SEV_TONE[inc.severity] ?? 'neutral'}>{inc.severity}</Chip>
        {inc.priority && <Chip tone={PRI_TONE[inc.priority] ?? 'neutral'}>{inc.priority}</Chip>}
        <Chip tone={STATUS_TONE[inc.status] ?? 'neutral'} dot>{inc.status}</Chip>
        {sla.breached && <Chip tone="error">SLA breach</Chip>}
        {!inc.linkedChangeRequestId && !closed && <Btn icon={PencilLine} onClick={raiseChange}>Raise emergency change</Btn>}
        {!closed && <Btn icon={CircleCheck} onClick={() => advance('Resolved')}>Resolve</Btn>}
        {!inc.acknowledgedAt && !closed && <Btn icon={UserPlus} onClick={acknowledge}>Acknowledge</Btn>}
        {next && <Btn variant="filled" icon={ArrowRightLeft} onClick={() => advance(next)}>Advance to {next}</Btn>}
      </>}>

      <StatGrid cols={3}>
        <StatTile label="Response SLA"
          value={inc.acknowledgedAt ? (sla.responseBreached ? `Breached (${ackMins})` : `Met in ${ackMins}`) : (sla.responseBreached ? 'Breached — unacked' : `${fmtDuration(sla.responseRemainingMins)} to ack`)}
          sub={`target ${fmtDuration(inc.slaResponseMins ?? 0)}`} subTone={sla.responseBreached ? 'bad' : undefined} />
        <StatTile label="Resolution SLA"
          value={closed ? (sla.resolveBreached ? `Late (MTTR ${mttr})` : `On time (MTTR ${mttr})`) : (sla.resolveBreached ? `Overdue ${fmtDuration(sla.resolveRemainingMins)}` : `${fmtDuration(sla.resolveRemainingMins)} left`)}
          sub={`target ${fmtDuration(inc.slaResolveMins ?? 0)}`} subTone={sla.resolveBreached ? 'bad' : undefined} />
        <StatTile label="Target" value={`${fmtDuration(inc.slaResponseMins ?? 0)} / ${fmtDuration(inc.slaResolveMins ?? 0)}`} sub="response / resolution" />
      </StatGrid>

      <div className="grid g-main-side" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          <Panel title="Details" icon={FileText}>
            <KV cols={3} items={[
              ['Title', inc.title],
              ['Type', inc.type],
              ['Owner', inc.assignee ?? <span className="muted">Unassigned</span>],
              ['Reported by', inc.reportedBy ?? '—'],
              ['Data center', inc.dataCenterId ?? '—'],
              ['Detected', fmtTs(inc.detectedAt)],
              ['Acknowledged', fmtTs(inc.acknowledgedAt)],
              ['Resolved', fmtTs(inc.resolvedAt)],
              ['MTTR', mttrMins(inc) != null ? fmtDuration(mttrMins(inc)!) : '—'],
              ...(inc.rootCause ? [['Root cause', inc.rootCause] as [string, string]] : []),
            ]} />
            <div style={{ marginTop: 16 }}>
              <KV cols={1} items={[['Affected', <div className="row wrap" style={{ gap: 6 }}>{(inc.affectedResourceIds ?? []).length ? (inc.affectedResourceIds ?? []).map((r) => <Chip key={r} tone="neutral" size="xs">{inc.affectedResourceType}:{r}</Chip>) : '—'}</div>]]} />
            </div>
          </Panel>

          <Panel title="Worklog" icon={MessageSquare} count={worklog.length}>
            <form className="wl-add" onSubmit={(e) => { e.preventDefault(); addNote(); }}>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a worklog note…" aria-label="Worklog note" />
              <Btn type="submit" variant="filled">Add</Btn>
            </form>
            {worklog.length === 0 ? <Empty icon={MessageSquare} title="No worklog yet" /> : (
              <ol className="wl" tabIndex={0} aria-label="Worklog entries">{[...worklog].reverse().map((w, k) => {
                const meta = KIND_META[w.kind] ?? KIND_META.Note;
                return (
                  <li key={k}>
                    <span className="wl-ico" style={{ background: meta.color }}><meta.icon size={12} /></span>
                    <div><div className="row between"><b>{w.author}</b><span className="faint num">{fmtTs(w.at)}</span></div><p>{w.text}</p></div>
                  </li>
                );
              })}</ol>
            )}
          </Panel>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <Panel title="Linked" icon={Link2}>
            <KV cols={1} items={[
              [<span className="row" style={{ gap: 6 }}><Cpu size={13} />Triggering alarms</span>, (inc.linkedAlarmIds ?? []).length
                ? <PanelLink onClick={() => navigate('/nms/alarms')}>{inc.linkedAlarmIds!.length} correlated alarm(s)</PanelLink>
                : <span className="muted">none</span>],
              [<span className="row" style={{ gap: 6 }}><ArrowRightLeft size={13} />Remediation change</span>, inc.linkedChangeRequestId
                ? <PanelLink onClick={() => navigate(`/change/${inc.linkedChangeRequestId}`)}>Open change request</PanelLink>
                : <span className="muted">none raised</span>],
            ]} />
          </Panel>
        </div>
      </div>

      <Panel title="Activity" icon={History}><EntityAuditTab entityType="Incident" entityId={inc.incId} /></Panel>
    </OpsPage>
  );
}
