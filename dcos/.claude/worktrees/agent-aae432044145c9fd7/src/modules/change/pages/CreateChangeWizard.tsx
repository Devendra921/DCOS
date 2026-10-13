import { validateWizardFields } from '../../../shared/utils/validateWizardFields';
import { VwWizardLayout } from '../../../shared/components/vw/VwWizardLayout';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Steps, Form, Input, Select, Space, Alert, Descriptions } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { VwCard, VwChip } from '../../../shared/components/ux';
import { useEntityCreate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { CHANGE_TYPE, RISK_LEVEL, RESOURCE_TYPE } from '../../../mock/data/enums';
import type { ApprovalMatrixRule, Policy, Device, Rack } from '../../../mock/data/types';
import { previewChangeImpact, useQuery as useOpsQuery } from '../../../ops/api';
import { db } from '../../../mock/db';

/* Operate impact preview: walks the live model (devices → links → services → customers, conflicting windows, open incidents). */
function ImpactPreview({ resourceType, resourceId }: { resourceType?: string; resourceId?: string }) {
  const scope = (() => {
    if (!resourceId) return { scope: [] as string[], dcId: '' };
    const dev = db.getById('devices', resourceId) as unknown as Device | undefined;
    if (dev) return { scope: [dev.id], dcId: dev.dataCenterId ?? '' };
    const rack = db.getById('racks', resourceId) as unknown as Rack | undefined;
    if (rack) return { scope: (db.getAll('devices', { filters: [{ field: 'rackId', operator: 'eq', value: rack.id }], pageSize: 500 }).data as unknown as Device[]).map((d) => d.id), dcId: rack.dataCenterId };
    return { scope: [] as string[], dcId: '' };
  })();
  const { data: im } = useOpsQuery(() => previewChangeImpact(scope.scope, scope.dcId), [scope.scope.join(','), scope.dcId]);
  if (!resourceId) return <Alert type="info" showIcon message="Enter a device or rack ID to preview the operational impact." />;
  if (!scope.scope.length) return <Alert type="warning" showIcon message={`No device or rack found for "${resourceId}" (${resourceType ?? 'resource'}) — impact cannot be computed.`} />;
  if (!im) return null;
  const tone = im.risk === 'High' ? 'red' : im.risk === 'Medium' ? 'orange' : 'green';
  return (
    <VwCard size="small" title={<Space>Operate impact preview <VwChip color={tone}>Risk {im.score}/100 · {im.risk}</VwChip></Space>} style={{ marginTop: 'var(--vw-space-md)' }}>
      <Descriptions column={3} size="small">
        <Descriptions.Item label="Devices in scope">{im.nes}</Descriptions.Item>
        <Descriptions.Item label="Links touched">{im.links}</Descriptions.Item>
        <Descriptions.Item label="Services">{im.services}</Descriptions.Item>
        <Descriptions.Item label="Customers">{im.customers}</Descriptions.Item>
        <Descriptions.Item label="Premium customers">{im.premium}</Descriptions.Item>
        <Descriptions.Item label="Conflicting windows">{im.conflicts.length}</Descriptions.Item>
        <Descriptions.Item label="Open incidents on scope">{im.openInc.length}</Descriptions.Item>
      </Descriptions>
      {im.conflicts.length > 0 && <Alert type="warning" showIcon style={{ marginTop: 8 }} message={`Overlaps ${im.conflicts.map((c) => c.id).join(', ')} — pick another window or merge the changes.`} />}
      {im.openInc.length > 0 && <Alert type="error" showIcon style={{ marginTop: 8 }} message={`${im.openInc.map((i) => i.id).join(', ')} still open on this scope — resolve first or raise as emergency.`} />}
    </VwCard>
  );
}


export default function CreateChangeWizard() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const create = useEntityCreate('changeRequests');
  const rules = (useEntityList('approvalMatrixRules', { pageSize: 100 }).data?.data ?? []) as unknown as ApprovalMatrixRule[];
  const policies = (useEntityList('policies', { pageSize: 100 }).data?.data ?? []) as unknown as Policy[];
  const [vals, setVals] = useState<Record<string, string>>({});

  const currentRisk = Form.useWatch('risk', form);
  const watchResType = Form.useWatch('affectedResourceType', form);
  const watchResId = Form.useWatch('affectedResourceId', form);
  const matchedRule = rules.find((r) => r.riskLevel === (currentRisk ?? vals.risk)) ?? rules.find((r) => r.changeType === vals.type) ?? rules[0];
  const relevantPolicies = policies.filter((p) => p.active).slice(0, 3);

  const next = async () => { const v = await validateWizardFields(form); if (!v) return; setVals({ ...vals, ...v }); setStep((s) => s + 1); };
  const submit = async () => {
    const v = await validateWizardFields(form); if (!v) return;
    const submitted = { ...vals, ...v };
    const approvalRule = rules.find((r) => r.riskLevel === submitted.risk) ?? rules.find((r) => r.changeType === submitted.type) ?? rules[0];
    const now = new Date().toISOString();
    create.mutate({
      chgId: `CHG-NEW-${Date.now().toString().slice(-4)}`, title: submitted.title, type: submitted.type, description: submitted.description ?? '',
      risk: submitted.risk, status: 'Submitted', priority: 'Medium', affectedResourceType: submitted.affectedResourceType,
      affectedResourceIds: submitted.affectedResourceId ? [submitted.affectedResourceId] : [], requestedBy: 'You', requestedById: 'me',
      policyViolations: [], approvalRuleId: approvalRule?.id, customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me',
    }, { onSuccess: (rec: Record<string, unknown>) => { message.success('Change submitted for review'); navigate(`/change/${rec.id as string}`); } });
  };

  return (
    <VwWizardLayout title="New Change Request" step={step} steps={<Steps current={step} size="small" responsive={false} items={[{ title: 'Details' }, { title: 'Impact' }, { title: 'Risk & approval' }]} />} footer={        <div className="vw-wizard-actions"><Button className="vw-wizard-cancel" onClick={() => navigate('/change')}>Cancel</Button>
          {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>Back</Button>}
          {step < 2 && <Button type="primary" onClick={next}>Next</Button>}
          {step === 2 && <Button type="primary" loading={create.isPending} onClick={submit}>Submit change</Button>}
        </div>}>

      <VwCard size="small">
        <Form form={form} layout="vertical">
          {step === 0 && (
            <>
              <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input placeholder="e.g. Deploy GPU cluster in Hall 1" /></Form.Item>
              <Form.Item name="type" label="Change type" rules={[{ required: true }]}><Select placeholder="Select change type" options={CHANGE_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item>
              <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" rows={3} /></Form.Item>
            </>
          )}
          {step === 1 && (
            <>
              <Form.Item name="affectedResourceType" label="Affected resource type" rules={[{ required: true }]}><Select placeholder="Select affected resource type" options={RESOURCE_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item>
              <Form.Item name="affectedResourceId" label="Resource ID" tooltip="e.g. RACK-0001 or ASSET-0001"><Input placeholder="RACK-0001" /></Form.Item>
              <ImpactPreview resourceType={watchResType} resourceId={watchResId} />
            </>
          )}
          {step === 2 && (
            <>
              <Form.Item name="risk" label="Risk level" rules={[{ required: true }]}><Select placeholder="Select risk level" options={RISK_LEVEL.map((t) => ({ value: t, label: t }))} /></Form.Item>
              <Alert type="info" showIcon style={{ marginBottom: "var(--vw-space-md)" }} message="Governed change preview"
                description={<Descriptions column={1} layout="vertical" size="small">
                  <Descriptions.Item label="Approval path">{matchedRule ? matchedRule.name : '—'}</Descriptions.Item>
                  <Descriptions.Item label="Stages"><Space size={4} wrap>{matchedRule?.stages.map((s) => <VwChip key={s.order}>{s.approverRole}{s.requiredCount > 1 ? ` ×${s.requiredCount}` : ''}</VwChip>)}</Space></Descriptions.Item>
                  <Descriptions.Item label="Policies checked"><Space size={4} wrap>{relevantPolicies.map((p) => <VwChip key={p.id} color={p.enforcement === 'Block' ? 'red' : 'orange'}>{p.name}</VwChip>)}</Space></Descriptions.Item>
                </Descriptions>} />
            </>
          )}
        </Form>

      </VwCard>
    </VwWizardLayout>
  );
}
