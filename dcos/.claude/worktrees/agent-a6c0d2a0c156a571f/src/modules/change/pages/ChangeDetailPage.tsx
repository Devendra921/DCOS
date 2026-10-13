import { useParams, useNavigate } from 'react-router-dom';
import { App, Row, Col, Descriptions, Empty, Space, Typography, Timeline, Alert, Dropdown } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ArrowLeftOutlined, CheckOutlined, CloseOutlined, DownOutlined } from '../../../shared/icons';
import { WorkflowStepper, VwCard, VwChip } from '../../../shared/components/ux';
import { useEntityDetail, useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { riskTag, statusTag, changeSteps, nextAction } from '../components/changeUtil';
import { EntityAuditTab } from '../../../shared/components/detail';
import { TicketPanel } from '../../delivery/components/TicketPanel';
import type { ChangeRequest, ApprovalStep, Policy } from '../../../mock/data/types';

const { Text } = Typography;

export default function ChangeDetailPage() {
  const { changeId } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { data } = useEntityDetail('changeRequests', changeId);
  const steps = (useEntityList('approvalSteps', { filters: [{ field: 'changeRequestId', operator: 'eq', value: changeId }], pageSize: 50 }).data?.data ?? []) as unknown as ApprovalStep[];
  const policies = (useEntityList('policies', { pageSize: 100 }).data?.data ?? []) as unknown as Policy[];
  const update = useEntityUpdate('changeRequests');
  const audit = useRecordAudit();
  const c = data as unknown as ChangeRequest | null;
  if (!c) return <div><Empty description="Change not found" /></div>;

  const setStatus = (status: string, msg: string) => update.mutate({ id: c.id, data: { status } }, { onSuccess: () => { message.success(msg); audit('ChangeRequest', c.chgId, status, msg); } });
  const na = nextAction(c.status);
  const violations = (c.policyViolations ?? []).map((pid) => policies.find((p) => p.id === pid)).filter(Boolean) as Policy[];

  return (
    <div>
      <header className="vw-card-section vw-plan-header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/change')}>Queue</Button>
        <div className="vw-plan-identity">
          <div className="vw-card-description">{c.chgId}</div>
          <h1 className="vw-page-title">{c.title}</h1>
          <Space wrap>{riskTag(c.risk)}{statusTag(c.status)}<VwChip>{c.type}</VwChip></Space>
        </div>
        <div className="vw-plan-actions" role="group" aria-label="Change actions">
          {c.status === 'UnderReview' && (
            <>
              <Button type="primary" icon={<CheckOutlined />} onClick={() => setStatus('Approved', 'Change approved')}>Approve</Button>
              <Button danger icon={<CloseOutlined />} onClick={() => setStatus('Rejected', 'Change rejected')}>Reject</Button>
            </>
          )}
          {na && <Button type="primary" onClick={() => setStatus(na.to, `Moved to ${na.to}`)}>{na.label}</Button>}
          {!['Closed', 'Cancelled', 'Implemented', 'Rejected'].includes(c.status) && <Dropdown trigger={['click']} menu={{ items: [{ key: 'cancel', label: 'Cancel change', danger: true, onClick: () => modal.confirm({
            title: 'Cancel this change?', content: `${c.chgId} will be marked Cancelled.`,
            okText: 'Cancel change', cancelText: 'Keep change', okButtonProps: { danger: true },
            onOk: () => setStatus('Cancelled', 'Change cancelled'),
          }) }] }}><Button icon={<DownOutlined />}>More actions</Button></Dropdown>}
        </div>
      </header>
      <VwCard size="small" title="Change progress" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <div className="vw-plan-progress"><WorkflowStepper steps={changeSteps(c.status)} /></div>
      </VwCard>

      {violations.length > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: "var(--vw-space-lg)" }}
          message={`${violations.length} policy violation(s)`}
          description={violations.map((p) => <div key={p.id}>{p.name} <VwChip color={p.enforcement === 'Block' ? 'red' : 'orange'}>{p.enforcement}</VwChip></div>)} />
      )}

      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} md={12} style={{ display: 'flex' }}>
          <VwCard size="small" title="Approval timeline" style={{ width: '100%' }}>
            {steps.length === 0 ? <Text type="secondary">No approval stages recorded (auto-approved or not yet submitted).</Text> : (
              <Timeline items={steps.sort((a, b) => a.order - b.order).map((s) => ({
                color: s.decision === 'Approved' ? 'green' : s.decision === 'Rejected' ? 'red' : 'blue',
                children: <span>Stage {s.order} · <strong>{s.approverRole}</strong> · <VwChip>{s.decision}</VwChip></span>,
              }))} />
            )}
          </VwCard>
        </Col>
        <Col xs={24} md={12} style={{ display: 'flex' }}>
          <VwCard size="small" title="Impact & details" style={{ width: '100%' }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Affected">
                <Space wrap>
                  {(c.affectedResourceIds ?? []).map((rid) => (
                    <VwChip key={rid} style={{ cursor: c.affectedResourceType === 'Rack' ? 'pointer' : 'default' }}
                      onClick={() => c.affectedResourceType === 'Rack' && navigate(`/facility/racks/${rid}`)}>{c.affectedResourceType}:{rid}</VwChip>
                  ))}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Requested by">{c.requestedBy}</Descriptions.Item>
              <Descriptions.Item label="Source">{c.source ?? 'Internal'}{c.externalRef ? ` · ${c.externalRef}` : ''}</Descriptions.Item>
              <Descriptions.Item label="Assigned to">{c.assignedTo ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Scheduled">{c.scheduledStart ? c.scheduledStart.slice(0, 10) : '—'}</Descriptions.Item>
              <Descriptions.Item label="Rollback plan">{c.rollbackPlan ?? '—'}</Descriptions.Item>
            </Descriptions>
          </VwCard>
        </Col>
      </Row>
      <VwCard size="small" style={{ marginTop: "var(--vw-space-lg)" }}>
        <TicketPanel anchor={{ changeRequestId: c.id }} title="Tickets on this change" dataCenterId={c.dataCenterId} />
      </VwCard>
      <VwCard size="small" title="Activity" style={{ marginTop: "var(--vw-space-lg)" }}><EntityAuditTab entityType="ChangeRequest" entityId={c.chgId} /></VwCard>
    </div>
  );
}
