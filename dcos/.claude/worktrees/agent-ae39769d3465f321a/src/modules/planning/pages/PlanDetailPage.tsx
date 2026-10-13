import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Row, Col, Descriptions, Empty, Space, Typography, Select, Alert, Dropdown } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ArrowLeftOutlined, CheckOutlined, CloseOutlined, ThunderboltOutlined, DownOutlined } from '../../../shared/icons';
import { WorkflowStepper, VwCard, VwChip } from '../../../shared/components/ux';
import type { WorkflowStep } from '../../../shared/components/ux';
import { useEntityDetail, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { PLAN_EXEC_PATH, CHANGE_TYPE, PROJECT_TEMPLATE } from '../../../mock/data/enums';
import type { PlanExecPath, ChangeType, ProjectTemplate } from '../../../mock/data/enums';
import type { Plan } from '../../../mock/data/types';
import { useExecutePlan, useDeliverPlan, PLAN_DEFAULT_PATH, PLAN_DEFAULT_TEMPLATE, planToChangeType, PLAN_TYPE_FIELDS, TEMPLATE_MILESTONES, decodeDetail } from '../lib/planExec';
import { PROGRAM_BLUEPRINTS, getBlueprint, blueprintForDcType } from '../../delivery/lib/programBlueprints';
import { dcTypeByName } from '../../../mock/data/dcTypes';

const { Text } = Typography;
const FLOW = ['Draft', 'Submitted', 'In Review', 'Approved', 'Executing', 'Completed'] as const;
const statusColor: Record<string, string> = { Draft: 'default', Submitted: 'blue', 'In Review': 'gold', Approved: 'green', Executing: 'processing', Completed: 'default', Rejected: 'red', Cancelled: 'default' };

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

  if (!p) return <div><Empty description="Plan not found" /></div>;
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
    <div>
      <header className="vw-card-section vw-plan-header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/planning/legacy')}>Plans</Button>
        <div className="vw-plan-identity">
          <div className="vw-card-description">{p.planId}</div>
          <h1 className="vw-page-title">{p.title}</h1>
          <Space size={8} wrap>
            <VwChip color="geekblue">{p.type}</VwChip>
            <VwChip color={statusColor[p.status]}>{p.status}</VwChip>
            <VwChip>Priority: {p.priority}</VwChip><VwChip>Risk: {p.risk}</VwChip>
          </Space>
        </div>
        <div className="vw-plan-actions" role="group" aria-label="Plan actions">
          {p.status === 'Submitted' && <Button type="primary" onClick={() => set('In Review', 'Sent for review')}>Send for review</Button>}
          {p.status === 'In Review' && <>
            <Button type="primary" icon={<CheckOutlined />} onClick={() => set('Approved', 'Plan approved')}>Approve</Button>
            <Button danger icon={<CloseOutlined />} onClick={() => set('Rejected', 'Plan rejected')}>Reject</Button>
          </>}
          {p.status === 'Executing' && capacityAdding && <Button type="primary" icon={<ThunderboltOutlined />} loading={delivering} onClick={doDeliver}>Deliver capacity (provision)</Button>}
          {p.status === 'Executing' && !capacityAdding && <Button type="primary" onClick={() => set('Completed', 'Plan completed')}>Mark complete</Button>}
          {!['Completed', 'Cancelled', 'Rejected', 'Executing'].includes(p.status) && (
            <Dropdown trigger={['click']} menu={{ items: [{ key: 'cancel', label: 'Cancel plan', danger: true, onClick: () => modal.confirm({
              title: 'Cancel this plan?',
              content: `${p.planId} will be marked Cancelled. This does not delete the plan.`,
              okText: 'Cancel plan', cancelText: 'Keep plan', okButtonProps: { danger: true },
              onOk: () => set('Cancelled', 'Plan cancelled'),
            }) }] }}>
              <Button aria-label="More plan actions">More actions <DownOutlined /></Button>
            </Dropdown>
          )}

        </div>
      </header>
      <VwCard title="Plan progress" size="small" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <div className="vw-plan-progress"><WorkflowStepper steps={planSteps(p.status)} /></div>
        {p.status === 'Draft' && <p className="vw-card-description" style={{ margin: 'var(--vw-space-sm) 0 0' }}>This plan is a draft and has not been submitted for review.</p>}
      </VwCard>

      {p.status === 'Approved' && !p.linkedProjectId && !p.linkedChangeRequestId && !p.linkedProgramId && (
        <VwCard size="small" style={{ marginBottom: "var(--vw-space-lg)" }} title={<span><ThunderboltOutlined /> Execute this plan</span>}>
          <Alert type="success" showIcon style={{ marginBottom: "var(--vw-space-md)" }} message="Approved — ready to execute" description="Executing creates the downstream vehicle, pre-filled from this plan, and links it back here." />
          <Space wrap align="start">
            <div>
              <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Execute as</Text><br />
              <Select placeholder="Select execution route" value={chosenPath} onChange={(v) => setExecPath(v as PlanExecPath)} style={{ width: 250 }}
                options={PLAN_EXEC_PATH.map((x) => ({ value: x, label: x === 'Change' ? 'Change Request (operational)' : x === 'Programme' ? 'Programme (multi-project build)' : 'Project (build-out)' }))} />
            </div>
            {chosenPath === 'Change' && (
              <div>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Change type</Text><br />
                <Select placeholder="Select change type" value={chosenChangeType} onChange={(v) => setChType(v as ChangeType)} style={{ width: 200 }} options={CHANGE_TYPE.map((t) => ({ value: t, label: t }))} />
              </div>
            )}
            {chosenPath === 'Project' && (
              <div>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Project template</Text><br />
                <Select placeholder="Select project template" value={chosenTemplate} onChange={(v) => setTmpl(v as ProjectTemplate)} style={{ width: 220 }} options={PROJECT_TEMPLATE.map((t) => ({ value: t, label: t }))} />
              </div>
            )}
            {chosenPath === 'Programme' && (
              <div>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Programme blueprint</Text><br />
                <Select placeholder="Select programme blueprint" value={chosenBlueprint} onChange={(v) => setBpKey(v)} style={{ width: 250 }} options={PROGRAM_BLUEPRINTS.map((b) => ({ value: b.key, label: b.name }))} />
              </div>
            )}
            <Button type="primary" icon={<ThunderboltOutlined />} loading={executing} onClick={doExecute} style={{ marginTop: 18 }}>Execute</Button>
          </Space>
          {chosenPath === 'Project' && <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Will create milestones:</Text>{(TEMPLATE_MILESTONES[chosenTemplate] ?? []).map((m, i) => <VwChip key={m} color="geekblue">{i + 1}. {m}</VwChip>)}</div>}
          {chosenPath === 'Programme' && <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Will create a programme with these sequenced phases:</Text>{(getBlueprint(chosenBlueprint)?.phases ?? []).map((ph, i) => <VwChip key={ph.key} color={ph.longLead ? 'gold' : 'geekblue'}>{i + 1}. {ph.name}{ph.longLead ? ' (long-lead)' : ''}</VwChip>)}</div>}
        </VwCard>
      )}

      {(p.linkedProjectId || p.linkedChangeRequestId || p.linkedProgramId) && (
        <Alert type="info" showIcon style={{ marginBottom: "var(--vw-space-lg)" }}
          message="This plan has been executed"
          description={p.linkedProgramId
            ? <a onClick={() => navigate(`/delivery/programs/${p.linkedProgramId}`)}>Open the linked Programme →</a>
            : p.linkedProjectId
              ? <a onClick={() => navigate(`/delivery/projects/${p.linkedProjectId}`)}>Open the linked Project →</a>
              : <a onClick={() => navigate(`/change/${p.linkedChangeRequestId}`)}>Open the linked Change Request →</a>} />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <VwCard size="small" title={`${p.type} detail`}>
            <Descriptions column={1} size="small">
              {PLAN_TYPE_FIELDS[p.type].filter((f) => detail[f.name] != null && detail[f.name] !== '').map((f) => (
                <Descriptions.Item key={f.name} label={f.label}>{fmt(detail[f.name])}</Descriptions.Item>
              ))}
              <Descriptions.Item label="Target date">{p.targetDate ? p.targetDate.slice(0, 10) : '—'}</Descriptions.Item>
              <Descriptions.Item label="Estimated cost">{p.estimatedCost != null ? `$${p.estimatedCost.toLocaleString()}` : '—'}</Descriptions.Item>
            </Descriptions>
          </VwCard>
        </Col>
        <Col xs={24} md={12}>
          <VwCard size="small" title="Execution & justification">
            <Descriptions column={1} size="small" style={{ marginBottom: "var(--vw-space-sm)" }}>
              <Descriptions.Item label="Route"><VwChip color={chosenPath === 'Project' ? 'geekblue' : 'gold'}>{chosenPath}</VwChip></Descriptions.Item>
              {chosenPath === 'Change' && <Descriptions.Item label="Change type">{chosenChangeType}</Descriptions.Item>}
              {chosenPath === 'Project' && <Descriptions.Item label="Project template">{chosenTemplate}</Descriptions.Item>}
              {chosenPath === 'Programme' && <Descriptions.Item label="Blueprint">{getBlueprint(chosenBlueprint)?.name ?? chosenBlueprint}</Descriptions.Item>}
              <Descriptions.Item label="Owner">{p.ownerName}</Descriptions.Item>
            </Descriptions>
            <Text>{p.businessJustification || p.description || '—'}</Text>
            {p.approvedBy && <div style={{ marginTop: "var(--vw-space-md)", fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)" }}>Approved by {p.approvedBy} · {p.approvedAt?.slice(0, 10)}</div>}
          </VwCard>
        </Col>
      </Row>
    </div>
  );
}
