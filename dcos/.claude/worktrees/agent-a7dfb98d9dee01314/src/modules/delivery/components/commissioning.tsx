import { useState } from 'react';
import { App, Alert, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Progress, Select, Space, Tooltip, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { CheckCircleOutlined, SafetyCertificateOutlined, PlusOutlined } from '../../../shared/icons';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { useAuth } from '../../../core/auth/AuthContext';
import { STEP_RESULT, DELIVERABLE_STATUS, ATP_SYSTEM, CX_LEVEL, SNAG_SEVERITY } from '../../../mock/data/enums';
import type { Project, Atp, AtpStep, Hoto, Snag, HotoDeliverable, HotoSignoff } from '../../../mock/data/types';

const now = () => new Date().toISOString();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });
const sid = (p: string) => `${p}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e4)}`;

const { Text } = Typography;
const atpColor: Record<string, string> = { Draft: 'default', 'In Progress': 'gold', Witnessed: 'cyan', Accepted: 'green', Failed: 'red' };
const stepColor: Record<string, string> = { Pending: 'default', Pass: 'green', Fail: 'red', 'N/A': 'default' };
const sevColor: Record<string, string> = { Critical: 'red', Major: 'volcano', Minor: 'gold' };

// ── ATP detail: the step grid + witness/accept ──────────────────────
export function AtpDetailDrawer({ atp, open, onClose }: { atp: Atp | null; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const updateStep = useEntityUpdate('atpSteps');
  const updateAtp = useEntityUpdate('atps');
  const createStep = useEntityCreate('atpSteps');
  const audit = useRecordAudit();
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm();
  const steps = (useEntityList('atpSteps', { filters: atp ? [{ field: 'atpId', operator: 'eq', value: atp.id }] : [], pageSize: 200 }).data?.data ?? []) as unknown as AtpStep[];
  if (!atp) return null;
  const ordered = [...steps].sort((a, b) => a.stepNo - b.stepNo);
  const addStep = async () => {
    const v = await form.validateFields();
    const id = sid('ATPS');
    createStep.mutate({ id, atpsId: id, ...env(), atpId: atp.id, stepNo: ordered.length + 1, description: v.description, method: v.method, expectedResult: v.expectedResult, result: 'Pending' }, {
      onSuccess: () => { audit('ATP', atp.atpId, 'step added', `Added step to ${atp.name}`); message.success('Step added'); setAddOpen(false); form.resetFields(); },
    });
  };
  const allPass = ordered.length > 0 && ordered.every((s) => s.result === 'Pass' || s.result === 'N/A');
  const setStep = (s: AtpStep, result: string) => updateStep.mutate({ id: s.id, data: { result, actualResult: result === 'Pass' ? 'As expected' : result === 'Fail' ? 'Deviation' : s.actualResult } });
  const accept = () => updateAtp.mutate({ id: atp.id, data: { status: 'Accepted', witnessedBy: user.name, acceptedAt: new Date().toISOString() } }, {
    onSuccess: () => { audit('ATP', atp.atpId, 'accepted', `ATP "${atp.name}" witnessed & accepted`); message.success('ATP accepted'); onClose(); },
  });

  return (
    <Drawer mask={false} width={760} open={open} onClose={onClose} title={<Space><Text strong>{atp.name}</Text><VwChip>{atp.level}</VwChip><VwChip color={atpColor[atp.status]}>{atp.status}</VwChip></Space>}
      extra={<Space><Button icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>Add step</Button><Tooltip title={allPass ? '' : 'All steps must Pass first'}><Button type="primary" icon={<CheckCircleOutlined />} disabled={!allPass || atp.status === 'Accepted'} onClick={accept}>Witness &amp; accept</Button></Tooltip></Space>}>
      <Descriptions size="small" column={1} style={{ marginBottom: "var(--vw-space-md)" }}>
        <Descriptions.Item label="System">{atp.system}</Descriptions.Item>
        <Descriptions.Item label="Level">{atp.level}</Descriptions.Item>
        <Descriptions.Item label="Witnessed by">{atp.witnessedBy ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Accepted">{atp.acceptedAt ? atp.acceptedAt.slice(0, 10) : '—'}</Descriptions.Item>
      </Descriptions>
      <Table<AtpStep> size="small" rowKey="id" dataSource={ordered} pagination={false} scroll={{ x: 'max-content' }}
        columns={[
          { title: '#', dataIndex: 'stepNo', width: 40 },
          { title: 'Test step', dataIndex: 'description' },
          { title: 'Method', dataIndex: 'method' },
          { title: 'Expected', dataIndex: 'expectedResult' },
          { title: 'Actual', dataIndex: 'actualResult', render: (v?: string, s?: AtpStep) => <Input size="small" defaultValue={v} placeholder="actual…" onBlur={(e) => s && updateStep.mutate({ id: s.id, data: { actualResult: e.target.value } })} /> },
          { title: 'Result', dataIndex: 'result', width: 110, render: (r: string, s) => <Select placeholder="Select result" size="small" value={r} style={{ width: 95 }} options={STEP_RESULT.map((x) => ({ value: x, label: x }))} onChange={(v) => setStep(s, v)} /> },
        ]} />
      <Modal title="Add test step" open={addOpen} onOk={addStep} onCancel={() => setAddOpen(false)} okText="Add step" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="description" label="Test step" rules={[{ required: true }]}><Input placeholder="e.g. UPS transfer to battery" /></Form.Item>
          <Form.Item name="method" label="Method" rules={[{ required: true }]}><Input placeholder="e.g. Open mains breaker" /></Form.Item>
          <Form.Item name="expectedResult" label="Expected result" rules={[{ required: true }]}><Input placeholder="e.g. Load holds, no drop" /></Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}

// ── ATP panel: project's protocols grouped by Cx level ──────────────
export function AtpPanel({ project }: { project: Project }) {
  const { message } = App.useApp();
  const atps = (useEntityList('atps', { filters: [{ field: 'projectId', operator: 'eq', value: project.id }], pageSize: 200 }).data?.data ?? []) as unknown as Atp[];
  const steps = (useEntityList('atpSteps', { pageSize: 5000 }).data?.data ?? []) as unknown as AtpStep[];
  const createAtp = useEntityCreate('atps');
  const audit = useRecordAudit();
  const [sel, setSel] = useState<Atp | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm();
  const passRate = (a: Atp) => { const ss = steps.filter((s) => s.atpId === a.id); return ss.length ? Math.round((ss.filter((s) => s.result === 'Pass').length / ss.length) * 100) : 0; };
  const accepted = atps.filter((a) => a.status === 'Accepted').length;
  const addAtp = async () => {
    const v = await form.validateFields();
    const id = sid('ATP');
    createAtp.mutate({ id, atpId: id, ...env(), projectId: project.id, name: v.name, system: v.system, level: v.level, status: 'Draft' }, {
      onSuccess: () => { audit('ATP', id, 'created', `Created ATP ${v.name}`); message.success('ATP created'); setAddOpen(false); form.resetFields(); },
    });
  };
  const newAtpModal = (
    <Modal title="New acceptance test protocol" open={addOpen} onOk={addAtp} onCancel={() => setAddOpen(false)} okText="Create ATP" destroyOnClose>
      <Form form={form} layout="vertical" initialValues={{ system: 'Power', level: 'L4 Functional' }}>
        <Form.Item name="name" label="Protocol name" rules={[{ required: true }]}><Input placeholder="e.g. Power train ATP" /></Form.Item>
        <Form.Item name="system" label="System" rules={[{ required: true }]}><Select placeholder="Select system" options={ATP_SYSTEM.map((x) => ({ value: x, label: x }))} /></Form.Item>
        <Form.Item name="level" label="Commissioning level" rules={[{ required: true }]}><Select placeholder="Select commissioning level" options={CX_LEVEL.map((x) => ({ value: x, label: x }))} /></Form.Item>
      </Form>
    </Modal>
  );
  if (!atps.length) return (
    <>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No ATPs yet — generate the standard pack, or add one manually." >
        <Button icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>New ATP</Button>
      </Empty>
      {newAtpModal}
    </>
  );
  return (
    <>
      <Space style={{ marginBottom: "var(--vw-space-md)", width: '100%', justifyContent: 'space-between' }}>
        <Alert type={accepted === atps.length ? 'success' : 'info'} showIcon
          message={`${accepted}/${atps.length} acceptance test protocols accepted — the ATP gate clears when all are Accepted.`} />
        <Button icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>New ATP</Button>
      </Space>
      {newAtpModal}
      <Table<Atp> size="small" rowKey="id" dataSource={atps} pagination={false} scroll={{ x: 'max-content' }}
        onRow={(a) => ({ onClick: () => setSel(a), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Protocol', dataIndex: 'name' },
          { title: 'System', dataIndex: 'system', render: (s) => <VwChip>{s}</VwChip> },
          { title: 'Level', dataIndex: 'level', render: (l) => <VwChip color="geekblue">{l}</VwChip> },
          { title: 'Steps passed', key: 'pr', width: 160, render: (_: unknown, a) => <Progress percent={passRate(a)} size="small" /> },
          { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={atpColor[s]}>{s}</VwChip> },
          { title: '', key: 'x', render: () => <a>Open</a> },
        ]} />
      <AtpDetailDrawer atp={sel} open={!!sel} onClose={() => setSel(null)} />
    </>
  );
}

// ── HOTO panel: snags, deliverables, sign-offs, accept ──────────────
export function HotoPanel({ project, hoto }: { project: Project; hoto?: Hoto }) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const updateSnag = useEntityUpdate('snags');
  const updateDeliv = useEntityUpdate('hotoDeliverables');
  const updateSignoff = useEntityUpdate('hotoSignoffs');
  const updateHoto = useEntityUpdate('hotos');
  const createSnag = useEntityCreate('snags');
  const createDeliv = useEntityCreate('hotoDeliverables');
  const audit = useRecordAudit();
  const [snagForm] = Form.useForm();
  const [delivForm] = Form.useForm();
  const [snagOpen, setSnagOpen] = useState(false);
  const [delivOpen, setDelivOpen] = useState(false);
  const snags = (useEntityList('snags', { filters: [{ field: 'projectId', operator: 'eq', value: project.id }], pageSize: 200 }).data?.data ?? []) as unknown as Snag[];
  const deliverables = (useEntityList('hotoDeliverables', { filters: hoto ? [{ field: 'hotoId', operator: 'eq', value: hoto.id }] : [], pageSize: 200 }).data?.data ?? []) as unknown as HotoDeliverable[];
  const signoffs = (useEntityList('hotoSignoffs', { filters: hoto ? [{ field: 'hotoId', operator: 'eq', value: hoto.id }] : [], pageSize: 50 }).data?.data ?? []) as unknown as HotoSignoff[];
  if (!hoto) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Hand-over not started — open the package to begin." />;

  const blockingSnags = snags.filter((s) => s.status === 'Open' && (s.severity === 'Critical' || s.severity === 'Major'));
  const allSigned = signoffs.length > 0 && signoffs.every((s) => s.decision === 'Signed');
  const canAccept = blockingSnags.length === 0 && allSigned && hoto.status !== 'Accepted';

  const accept = () => updateHoto.mutate({ id: hoto.id, data: { status: 'Accepted', warrantyStart: new Date().toISOString() } }, {
    onSuccess: () => { audit('Project', project.id, 'hoto', 'Hand-over accepted — ownership to Operations, warranty started'); message.success('Hand-over accepted'); },
  });
  const sign = (s: HotoSignoff) => updateSignoff.mutate({ id: s.id, data: { decision: 'Signed', name: user.name, signedAt: new Date().toISOString() } }, {
    onSuccess: () => audit('HOTO', hoto.hotoId, 'signed', `${s.role} signed off`),
  });

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      {hoto.status === 'Accepted'
        ? <Alert type="success" showIcon icon={<SafetyCertificateOutlined />} message={`Hand-over accepted — warranty started ${hoto.warrantyStart?.slice(0, 10) ?? ''}. Operations now owns this infrastructure.`} />
        : <Alert type={canAccept ? 'info' : 'warning'} showIcon message={canAccept ? 'Ready to hand over — all sign-offs in and no blocking snags.' : `Blocked: ${blockingSnags.length} critical/major snag(s) open, ${signoffs.filter((s) => s.decision !== 'Signed').length} sign-off(s) pending.`}
            action={<Button type="primary" disabled={!canAccept} onClick={accept}>Accept hand-over</Button>} />}

      <VwCard size="small" title={`Sign-offs (${signoffs.filter((s) => s.decision === 'Signed').length}/${signoffs.length})`}>
        <Table<HotoSignoff> size="small" rowKey="id" dataSource={signoffs} pagination={false} scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Role', dataIndex: 'role' },
            { title: 'Name', dataIndex: 'name' },
            { title: 'Decision', dataIndex: 'decision', render: (d: string) => <VwChip color={d === 'Signed' ? 'green' : d === 'Rejected' ? 'red' : 'default'}>{d}</VwChip> },
            { title: 'Signed', dataIndex: 'signedAt', render: (d?: string) => d ? d.slice(0, 10) : '—' },
            { title: '', key: 'x', render: (_: unknown, s) => s.decision !== 'Signed' && hoto.status !== 'Accepted' ? <Button size="small" onClick={() => sign(s)}>Sign</Button> : null },
          ]} />
      </VwCard>

      <VwCard size="small" title={`Punch / snag list (${snags.filter((s) => s.status === 'Open').length} open)`}
        extra={hoto.status !== 'Accepted' && <Button size="small" icon={<PlusOutlined />} onClick={() => setSnagOpen(true)}>Raise snag</Button>}>
        <Table<Snag> size="small" rowKey="id" dataSource={snags} pagination={false} scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Severity', dataIndex: 'severity', render: (s: string) => <VwChip color={sevColor[s]}>{s}</VwChip> },
            { title: 'Description', dataIndex: 'description' },
            { title: 'Owner', dataIndex: 'owner' },
            { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={s === 'Open' ? 'gold' : 'green'}>{s}</VwChip> },
            { title: '', key: 'x', render: (_: unknown, s) => s.status === 'Open' ? <Button size="small" onClick={() => updateSnag.mutate({ id: s.id, data: { status: 'Closed', closedAt: new Date().toISOString() } }, { onSuccess: () => audit('Snag', s.snagId, 'closed', `Snag closed: ${s.description}`) })}>Close</Button> : null },
          ]} />
      </VwCard>

      <VwCard size="small" title="Deliverables"
        extra={hoto.status !== 'Accepted' && <Button size="small" icon={<PlusOutlined />} onClick={() => setDelivOpen(true)}>Add deliverable</Button>}>
        <Table<HotoDeliverable> size="small" rowKey="id" dataSource={deliverables} pagination={false} scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Category', dataIndex: 'category', render: (c) => <VwChip>{c}</VwChip> },
            { title: 'Deliverable', dataIndex: 'name' },
            { title: 'Status', dataIndex: 'status', width: 130, render: (st: string, d) => <Select placeholder="Select status" size="small" value={st} style={{ width: 110 }} options={DELIVERABLE_STATUS.map((x) => ({ value: x, label: x }))} onChange={(v) => updateDeliv.mutate({ id: d.id, data: { status: v } })} /> },
          ]} />
      </VwCard>

      <Modal title="Raise snag" open={snagOpen} okText="Raise" destroyOnClose onCancel={() => setSnagOpen(false)}
        onOk={async () => { const v = await snagForm.validateFields(); const id = sid('SNAG'); createSnag.mutate({ id, snagId: id, ...env(), projectId: project.id, description: v.description, severity: v.severity, status: 'Open', owner: v.owner || project.managerName, raisedAt: now() }, { onSuccess: () => { audit('Snag', id, 'raised', `Snag raised: ${v.description}`); message.success('Snag raised'); setSnagOpen(false); snagForm.resetFields(); } }); }}>
        <Form form={snagForm} layout="vertical" initialValues={{ severity: 'Minor' }}>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}><Input.TextArea rows={2} placeholder="What's the defect?" /></Form.Item>
          <Form.Item name="severity" label="Severity" rules={[{ required: true }]}><Select placeholder="Select severity" options={SNAG_SEVERITY.map((x) => ({ value: x, label: x }))} /></Form.Item>
          <Form.Item name="owner" label="Owner"><Input placeholder="Defaults to project manager" /></Form.Item>
        </Form>
      </Modal>
      <Modal title="Add deliverable" open={delivOpen} okText="Add" destroyOnClose onCancel={() => setDelivOpen(false)}
        onOk={async () => { const v = await delivForm.validateFields(); const id = sid('HD'); createDeliv.mutate({ id, hdId: id, ...env(), hotoId: hoto.id, category: v.category || 'Documentation', name: v.name, status: 'Pending' }, { onSuccess: () => { audit('HOTO', hoto.hotoId, 'deliverable added', `Added deliverable: ${v.name}`); message.success('Deliverable added'); setDelivOpen(false); delivForm.resetFields(); } }); }}>
        <Form form={delivForm} layout="vertical" initialValues={{ category: 'Documentation' }}>
          <Form.Item name="name" label="Deliverable" rules={[{ required: true }]}><Input placeholder="e.g. Fire-suppression cert" /></Form.Item>
          <Form.Item name="category" label="Category"><Select placeholder="Select category" options={['Documentation', 'Closeout', 'Training', 'Warranty', 'Compliance'].map((x) => ({ value: x, label: x }))} /></Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
