import { useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Select } from 'antd';
import { Check, ChevronDown, CircleCheck, FileText, Info, ListChecks, Route, X, Zap } from 'lucide-react';
import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
import { WorkflowStepper } from '../../../shared/components/ux';
import type { WorkflowStep } from '../../../shared/components/ux';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Field, KV, Menu, Panel } from '../../../ops/ui/kit';
import { StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityDetail, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { PLAN_EXEC_PATH, CHANGE_TYPE, PROJECT_TEMPLATE } from '../../../mock/data/enums';
import type { PlanExecPath, ChangeType, ProjectTemplate } from '../../../mock/data/enums';
import type { Plan } from '../../../mock/data/types';
import { useExecutePlan, useDeliverPlan, PLAN_DEFAULT_PATH, PLAN_DEFAULT_TEMPLATE, planToChangeType, PLAN_TYPE_FIELDS, TEMPLATE_MILESTONES, decodeDetail } from '../lib/planExec';
import { PROGRAM_BLUEPRINTS, getBlueprint, blueprintForDcType } from '../../delivery/lib/programBlueprints';
import { dcTypeByName } from '../../../mock/data/dcTypes';

const FLOW = ['Draft', 'Submitted', 'In Review', 'Approved', 'Executing', 'Completed'] as const;
const STATUS_TONE: Record<string, Tone> = { Draft: 'neutral', Submitted: 'info', 'In Review': 'warning', Approved: 'success', Executing: 'purple', Completed: 'neutral', Rejected: 'error', Cancelled: 'neutral' };

function planSteps(status: string): WorkflowStep[] {
  const failed = status === 'Rejected' || status === 'Cancelled';
  const idx = status === 'Completed' ? FLOW.length : FLOW.indexOf(status as typeof FLOW[number]);
  return FLOW.map((label, i) => ({ key: label, label, state: failed && i >= 1 ? 'failed' : i < idx ? 'completed' : i === idx ? 'current' : 'upcoming' }));
}

export default function PlanDetailPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { data } = useEntityDetail('plans', planId);
  const update = useEntityUpdate('plans');
  const execute = useExecutePlan();
  const deliver = useDeliverPlan();
  const audit = useRecordAudit();
  const p = data as unknown as Plan | null;
  const [execPath, setExecPath] = useState<PlanExecPath | undefined>();
  const [chType, setChType] = useState<ChangeType | undefined>();
  const [tmpl, setTmpl] = useState<ProjectTemplate | undefined>();
  const [bpKey, setBpKey] = useState<string | undefined>();
  const [executing, setExecuting] = useState(false);
  const [delivering, setDelivering] = useState(false);

  if (!p) return <PageEmptyState title="Plan not found" />;
  const capacityAdding = ['Capacity Expansion', 'New Rollout'].includes(p.type);

  const set = (status: string, msg: string) => update.mutate({ id: p.id, data: { status, ...(status === 'Approved' ? { approvedAt: new Date().toISOString(), approvedBy: 'You' } : {}) } }, { onSuccess: () => { message.success(msg); audit('Plan', p.planId, status, `${p.title} → ${status}`); } });
  const chosenPath: PlanExecPath = execPath ?? p.execPath ?? PLAN_DEFAULT_PATH[p.type];
  const chosenChangeType: ChangeType = chType ?? p.changeType ?? planToChangeType(p.type);
  const chosenTemplate: ProjectTemplate = tmpl ?? p.projectTemplate ?? PLAN_DEFAULT_TEMPLATE[p.type];
  const chosenBlueprint: string = bpKey ?? p.blueprintKey ?? blueprintForDcType(dcTypeByName((() => { const dt = decodeDetail(p.detail).dcType; return typeof dt === 'string' ? dt : undefined; })())?.key).key;

  const doExecute = async () => {
    setExecuting(true);
    const res = await execute(p, chosenPath, { changeType: chosenChangeType, projectTemplate: chosenTemplate, blueprintKey: chosenBlueprint });
    setExecuting(false);
    if (!res.ok) { message.error(res.message); return; }
    audit('Plan', p.planId, 'executed', `${p.title} executed as ${res.kind} ${res.recordId}`);
    message.success(res.message);
    navigate(res.kind === 'Project' ? `/delivery/projects/${res.recordId}` : res.kind === 'Programme' ? `/delivery/programs/${res.recordId}` : `/change/${res.recordId}`);
  };
  const doDeliver = async () => {
    setDelivering(true);
    const res = await deliver(p);
    setDelivering(false);
    if (!res.ok) { message.error(res.message); return; }
    audit('Plan', p.planId, 'delivered', res.message);
    message.success(`${res.message} — capacity now reflects it`);
  };

  const detail = decodeDetail(p.detail);
  const fmt = (v: unknown) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));

  return (
    <OpsPage title={p.title} description={p.planId}
      actions={<>
        <Chip tone="info">{p.type}</Chip>
        <Chip tone={STATUS_TONE[p.status] ?? 'neutral'} dot>{p.status}</Chip>
        <Chip>Priority: {p.priority}</Chip><Chip>Risk: {p.risk}</Chip>
        {p.status === 'Submitted' && <Btn variant="filled" onClick={() => set('In Review', 'Sent for review')}>Send for review</Btn>}
        {p.status === 'In Review' && <>
          <Btn variant="filled" icon={Check} onClick={() => set('Approved', 'Plan approved')}>Approve</Btn>
          <Btn variant="danger-subtle" icon={X} onClick={() => set('Rejected', 'Plan rejected')}>Reject</Btn>
        </>}
        {p.status === 'Executing' && capacityAdding && <Btn variant="filled" icon={Zap} disabled={delivering} onClick={doDeliver}>{delivering ? 'Delivering…' : 'Deliver capacity (provision)'}</Btn>}
        {p.status === 'Executing' && !capacityAdding && <Btn variant="filled" onClick={() => set('Completed', 'Plan completed')}>Mark complete</Btn>}
        {!['Completed', 'Cancelled', 'Rejected', 'Executing'].includes(p.status) && (
          <Menu items={[{ label: 'Cancel plan', danger: true, onClick: () => modal.confirm({
            title: 'Cancel this plan?',
            content: `${p.planId} will be marked Cancelled. This does not delete the plan.`,
            okText: 'Cancel plan', cancelText: 'Keep plan', okButtonProps: { danger: true },
            onOk: () => set('Cancelled', 'Plan cancelled'),
          }) }]} trigger={(open) => <Btn iconRight={ChevronDown} title="More plan actions" onClick={open}>More actions</Btn>} />
        )}
      </>}>

      <StatGrid cols={4}>
        <StatTile label="Status" value={p.status} sub={p.approvedBy ? `Approved by ${p.approvedBy}` : undefined} />
        <StatTile label="Target date" value={p.targetDate ? p.targetDate.slice(0, 10) : '—'} sub={p.ownerName} />
        <StatTile label="Estimated cost" value={p.estimatedCost != null ? `$${p.estimatedCost.toLocaleString()}` : '—'} sub="USD" />
        <StatTile label="Execution route" value={chosenPath} sub={chosenPath === 'Change' ? chosenChangeType : chosenPath === 'Project' ? chosenTemplate : getBlueprint(chosenBlueprint)?.name ?? chosenBlueprint} />
      </StatGrid>

      <Panel title="Plan progress" icon={ListChecks}>
        <div className="vw-plan-progress"><WorkflowStepper steps={planSteps(p.status)} /></div>
        {p.status === 'Draft' && <p className="vw-card-description" style={{ margin: 'var(--vw-space-sm) 0 0' }}>This plan is a draft and has not been submitted for review.</p>}
      </Panel>

      {p.status === 'Approved' && !p.linkedProjectId && !p.linkedChangeRequestId && !p.linkedProgramId && (
        <Panel title="Execute this plan" icon={Zap}>
          <div className="col">
            <div className="note note--good"><CircleCheck size={16} /><span><b>Approved — ready to execute.</b> Executing creates the downstream vehicle, pre-filled from this plan, and links it back here.</span></div>
            <div className="row wrap" style={{ alignItems: 'flex-end', gap: 12 }}>
              <Field label="Execute as">
                <Select placeholder="Select execution route" value={chosenPath} onChange={(v) => setExecPath(v as PlanExecPath)} style={{ width: 250 }}
                  options={PLAN_EXEC_PATH.map((x) => ({ value: x, label: x === 'Change' ? 'Change Request (operational)' : x === 'Programme' ? 'Programme (multi-project build)' : 'Project (build-out)' }))} />
              </Field>
              {chosenPath === 'Change' && (
                <Field label="Change type">
                  <Select placeholder="Select change type" value={chosenChangeType} onChange={(v) => setChType(v as ChangeType)} style={{ width: 200 }} options={CHANGE_TYPE.map((t) => ({ value: t, label: t }))} />
                </Field>
              )}
              {chosenPath === 'Project' && (
                <Field label="Project template">
                  <Select placeholder="Select project template" value={chosenTemplate} onChange={(v) => setTmpl(v as ProjectTemplate)} style={{ width: 220 }} options={PROJECT_TEMPLATE.map((t) => ({ value: t, label: t }))} />
                </Field>
              )}
              {chosenPath === 'Programme' && (
                <Field label="Programme blueprint">
                  <Select placeholder="Select programme blueprint" value={chosenBlueprint} onChange={(v) => setBpKey(v)} style={{ width: 250 }} options={PROGRAM_BLUEPRINTS.map((b) => ({ value: b.key, label: b.name }))} />
                </Field>
              )}
              <Btn variant="filled" icon={Zap} disabled={executing} onClick={doExecute}>{executing ? 'Executing…' : 'Execute'}</Btn>
            </div>
            {chosenPath === 'Project' && <div className="row wrap" style={{ gap: 6 }}><span className="vw-label">Will create milestones:</span>{(TEMPLATE_MILESTONES[chosenTemplate] ?? []).map((m, i) => <Chip key={m} tone="info">{i + 1}. {m}</Chip>)}</div>}
            {chosenPath === 'Programme' && <div className="row wrap" style={{ gap: 6 }}><span className="vw-label">Will create a programme with these sequenced phases:</span>{(getBlueprint(chosenBlueprint)?.phases ?? []).map((ph, i) => <Chip key={ph.key} tone={ph.longLead ? 'warning' : 'info'}>{i + 1}. {ph.name}{ph.longLead ? ' (long-lead)' : ''}</Chip>)}</div>}
          </div>
        </Panel>
      )}

      {(p.linkedProjectId || p.linkedChangeRequestId || p.linkedProgramId) && (
        <div className="note note--info"><Info size={16} /><span><b>This plan has been executed.</b>{' '}
          {p.linkedProgramId
            ? <a className="ent-link" onClick={() => navigate(`/delivery/programs/${p.linkedProgramId}`)}>Open the linked Programme →</a>
            : p.linkedProjectId
              ? <a className="ent-link" onClick={() => navigate(`/delivery/projects/${p.linkedProjectId}`)}>Open the linked Project →</a>
              : <a className="ent-link" onClick={() => navigate(`/change/${p.linkedChangeRequestId}`)}>Open the linked Change Request →</a>}
        </span></div>
      )}

      <div className="grid g-2">
        <Panel title={`${p.type} detail`} icon={FileText}>
          <KV cols={2} items={[
            ...PLAN_TYPE_FIELDS[p.type].filter((f) => detail[f.name] != null && detail[f.name] !== '').map((f): [ReactNode, ReactNode] => [f.label, fmt(detail[f.name])]),
            ['Target date', p.targetDate ? p.targetDate.slice(0, 10) : '—'],
            ['Estimated cost', p.estimatedCost != null ? `$${p.estimatedCost.toLocaleString()}` : '—'],
          ]} />
        </Panel>
        <Panel title="Execution & justification" icon={Route}>
          <div className="col">
            <KV cols={2} items={[
              ['Route', <Chip tone={chosenPath === 'Project' ? 'info' : 'warning'}>{chosenPath}</Chip>],
              ...(chosenPath === 'Change' ? [['Change type', chosenChangeType] as [ReactNode, ReactNode]] : []),
              ...(chosenPath === 'Project' ? [['Project template', chosenTemplate] as [ReactNode, ReactNode]] : []),
              ...(chosenPath === 'Programme' ? [['Blueprint', getBlueprint(chosenBlueprint)?.name ?? chosenBlueprint] as [ReactNode, ReactNode]] : []),
              ['Owner', p.ownerName],
            ]} />
            <p style={{ margin: 0 }}>{p.businessJustification || p.description || '—'}</p>
            {p.approvedBy && <span className="vw-label">Approved by {p.approvedBy} · {p.approvedAt?.slice(0, 10)}</span>}
          </div>
        </Panel>
      </div>
    </OpsPage>
  );
}
