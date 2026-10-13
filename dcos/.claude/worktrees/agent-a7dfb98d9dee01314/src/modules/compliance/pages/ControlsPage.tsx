import { useMemo, useState } from 'react';
import { App, Form, Input, Modal, Select, Spin, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { SafetyCertificateOutlined, RobotOutlined, UserOutlined, PlusOutlined, WarningOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { KPICard } from '../../../shared/components/KPICard';
import { CONTROL_TYPE } from '../../../mock/data/enums';
import type { ComplianceControl, ComplianceFramework, Policy, PolicyDecision } from '../../../mock/data/types';
import { deriveControlStatus, backingPolicies } from '../lib/controlScore';
import { VwCard, VwChip, VwSegmented} from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const statusColor: Record<string, string> = { Compliant: 'green', InProgress: 'gold', NonCompliant: 'red', NotAssessed: 'default' };
const now = () => new Date().toISOString();
const envelope = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });

export default function ControlsPage() {
  const { message } = App.useApp();
  const frameworks = (useEntityList('complianceFrameworks', { pageSize: 100 }).data?.data ?? []) as unknown as ComplianceFramework[];
  const controls = (useEntityList('complianceControls', { pageSize: 300 }).data?.data ?? []) as unknown as ComplianceControl[];
  const policies = (useEntityList('policies', { pageSize: 100 }).data?.data ?? []) as unknown as Policy[];
  const decisions = (useEntityList('policyDecisions', { pageSize: 1000 }).data?.data ?? []) as unknown as PolicyDecision[];
  const createFw = useEntityCreate('complianceFrameworks');
  const createCtrl = useEntityCreate('complianceControls');
  const updatePolicy = useEntityUpdate('policies');
  const update = useEntityUpdate('complianceControls');
  const recordAudit = useRecordAudit();

  const [std, setStd] = useState<string>('All');
  const [fwOpen, setFwOpen] = useState(false);
  const [ctrlOpen, setCtrlOpen] = useState(false);
  const [fwForm] = Form.useForm();
  const [ctrlForm] = Form.useForm();

  const scored = useMemo(
    () => controls.map((c) => ({
      ...c,
      dstatus: deriveControlStatus(c, policies, decisions),
      backing: backingPolicies(c, policies).map((p) => p.name),
    })),
    [controls, policies, decisions],
  );
  type ScoredControl = (typeof scored)[number];
  const rows = std === 'All' ? scored : scored.filter((c) => c.standard === std);
  const { visible, hasMore, sentinelRef, total } = useScrollReveal(rows, 25, std);

  const k = useMemo(() => ({
    total: scored.length,
    automated: scored.filter((c) => c.type === 'Automated').length,
    manual: scored.filter((c) => c.type === 'Manual').length,
    nonCompliant: scored.filter((c) => c.dstatus === 'NonCompliant').length,
  }), [scored]);

  const fwStats = (name: string) => {
    const inFw = scored.filter((c) => c.standard === name);
    const ok = inFw.filter((c) => c.dstatus === 'Compliant').length;
    return { count: inFw.length, posture: inFw.length ? Math.round((ok / inFw.length) * 100) : 0 };
  };

  function attest(c: ComplianceControl) {
    update.mutate({ id: c.id, data: { status: 'Compliant', lastAssessedAt: now(), evidenceCount: (c.evidenceCount ?? 0) + 1 } }, {
      onSuccess: () => { recordAudit('ComplianceControl', c.ref, 'attested', `Attested ${c.standard} ${c.ref}`); message.success(`${c.ref} attested`); },
    });
  }

  function submitFw() {
    fwForm.validateFields().then((v) => {
      createFw.mutate({ fwId: `FW-${Date.now().toString().slice(-5)}`, name: v.name, version: v.version, description: v.description, owner: v.owner ?? 'You', status: 'Active', ...envelope() }, {
        onSuccess: () => { recordAudit('ComplianceFramework', v.name, 'created', `Created framework ${v.name}`); message.success('Framework created'); setFwOpen(false); fwForm.resetFields(); },
      });
    });
  }

  function submitCtrl() {
    ctrlForm.validateFields().then((v) => {
      const fw = frameworks.find((f) => f.id === v.frameworkId);
      createCtrl.mutate({
        ctrlId: `CTRL-${Date.now().toString().slice(-5)}`, standard: fw?.name ?? '', frameworkId: v.frameworkId, ref: v.ref, title: v.title,
        description: `${fw?.name ?? ''} ${v.ref} — ${v.title}`, type: v.type, policyId: v.policyId, owner: v.owner ?? 'You',
        status: v.type === 'Manual' ? 'NotAssessed' : 'InProgress', evidenceCount: 0, ...envelope(),
      }, {
        onSuccess: () => {
          // If automated + a backing policy chosen, tag that policy so scoring picks it up.
          if (v.type === 'Automated' && v.policyId) {
            const pol = policies.find((p) => p.id === v.policyId);
            if (pol) updatePolicy.mutate({ id: pol.id, data: { controlRefs: Array.from(new Set([...(pol.controlRefs ?? []), v.ref])) } });
          }
          recordAudit('ComplianceControl', v.ref, 'created', `Added control ${fw?.name ?? ''} ${v.ref}`);
          message.success('Control created'); setCtrlOpen(false); ctrlForm.resetFields();
        },
      });
    });
  }

  const cols: TableColumnType<ScoredControl>[] = [
    { title: 'Framework', dataIndex: 'standard', render: (s: string) => <VwChip>{s}</VwChip> },
    { title: 'Ref', dataIndex: 'ref', render: (r: string) => <span>{r}</span> },
    { title: 'Control', dataIndex: 'title' },
    { title: 'Type', dataIndex: 'type', render: (t: string) => t === 'Automated' ? <VwChip color="blue" icon={<RobotOutlined />}>Automated (OPA)</VwChip> : <VwChip icon={<UserOutlined />}>Manual</VwChip> },
    { title: 'Backing policy', render: (_: unknown, c) => c.type === 'Automated' ? (c.backing.length ? c.backing.join(', ') : <Text type="warning">unmapped</Text>) : <Text type="secondary">— attested —</Text> },
    { title: 'Status', dataIndex: 'dstatus', render: (s: string) => <VwChip color={statusColor[s]}>{s}</VwChip> },
    { title: 'Evidence', dataIndex: 'evidenceCount', align: 'right' },
    { title: 'Owner', dataIndex: 'owner' },
    { title: '', render: (_: unknown, c) => c.type === 'Manual' ? <Button size="small" onClick={() => attest(c)}>Attest</Button> : <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>auto</Text> },
  ];

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <h1 className="vw-page-title" style={{ margin: 0 }}>Frameworks & Controls</h1>
        <span>
          <Button icon={<PlusOutlined />} onClick={() => setFwOpen(true)} style={{ marginRight: "var(--vw-space-sm)" }}>New framework</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCtrlOpen(true)}>New control</Button>
        </span>
      </div>

      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '12px 0' }}>
        <KPICard title="Controls" value={k.total} icon={<SafetyCertificateOutlined />} iconTone="info" />
        <KPICard title="Automated (OPA)" value={k.automated} color="#2563eb" icon={<RobotOutlined />} iconTone="cyan" />
        <KPICard title="Manual (attested)" value={k.manual} icon={<UserOutlined />} iconTone="purple" />
        <KPICard title="Non-compliant" value={k.nonCompliant} color="var(--vw-color-red-600)" icon={<WarningOutlined />} iconTone="error" />
      </div>

      <VwCard variant="parent" title="Frameworks" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md">
          {frameworks.map((f) => {
            const s = fwStats(f.name);
            return (
              <VwCard variant="child" size="small" hoverable onClick={() => setStd(f.name)} style={{ borderColor: std === f.name ? 'var(--primaryColor500)' : undefined }} key={f.id}>
                <Text strong>{f.name}</Text> {f.version && <VwChip>{f.version}</VwChip>}
                <div style={{ fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)", marginTop: "var(--vw-space-xxs)" }}>{s.count} controls · {s.posture}% compliant</div>
              </VwCard>
            );
          })}
        </div>
      </VwCard>

      <VwSegmented style={{ marginBottom: "var(--vw-space-md)" }} value={std} onChange={(v) => setStd(v as string)} options={['All', ...frameworks.map((f) => f.name)]} />
      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', margin: '8px 0' }}>
        Showing {visible.length} of {total} controls
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Table<ScoredControl> rowKey="id" size="small" dataSource={visible} columns={cols} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }} />
        {visible.length > 0 && hasMore && (
          <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>

      <Modal title="New compliance framework" open={fwOpen} onOk={submitFw} onCancel={() => setFwOpen(false)} okText="Create framework" confirmLoading={createFw.isPending}>
        <Form form={fwForm} layout="vertical">
          <Form.Item name="name" label="Framework name" rules={[{ required: true }]}><Input placeholder="e.g. ISO 27017, HIPAA, FedRAMP" /></Form.Item>
          <Form.Item name="version" label="Version"><Input placeholder="e.g. 2022 / r5 / Type II" /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
          <Form.Item name="owner" label="Owner"><Input placeholder="Accountable owner" /></Form.Item>
        </Form>
      </Modal>

      <Modal title="New control" open={ctrlOpen} onOk={submitCtrl} onCancel={() => setCtrlOpen(false)} okText="Create control" confirmLoading={createCtrl.isPending} width={560}>
        <Form form={ctrlForm} layout="vertical">
          <Form.Item name="frameworkId" label="Framework" rules={[{ required: true }]}>
            <Select placeholder="Select framework" options={frameworks.map((f) => ({ value: f.id, label: f.name }))} />
          </Form.Item>
          <Form.Item name="ref" label="Control reference" rules={[{ required: true }]}><Input placeholder="e.g. A.8.32 / CC8.1 / CM-3" /></Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input placeholder="e.g. Change management" /></Form.Item>
          <Form.Item name="type" label="Control type" rules={[{ required: true }]} initialValue="Manual">
            <Select placeholder="Select control type" options={CONTROL_TYPE.map((t) => ({ value: t, label: t === 'Automated' ? 'Automated (OPA-evaluated)' : 'Manual (attested)' }))} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.type !== c.type}>
            {({ getFieldValue }) => getFieldValue('type') === 'Automated' && (
              <Form.Item name="policyId" label="Backing policy" tooltip="The OPA policy that satisfies this control. The control's status is computed from this policy's decisions.">
                <Select allowClear placeholder="Map to a policy" options={policies.map((p) => ({ value: p.id, label: p.name }))} />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item name="owner" label="Owner"><Input placeholder="Accountable owner" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
