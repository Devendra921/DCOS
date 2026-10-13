import { useState } from 'react';
import { App, Descriptions, Drawer, Form, Input, Modal, Select, Space, Tooltip, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { CheckCircleOutlined, PlusOutlined } from '../../../shared/icons';
import { Bar, DataTable, Muted } from './project/kit';
import { ATP_TONE, fmtDate } from './project/format';
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
const SEV_TONE: Record<string, 'error' | 'warning' | 'neutral'> = { Critical: 'error', Major: 'error', Minor: 'warning' };

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

// ── ATP panel: the project's acceptance test protocols ──────────────
export function AtpPanel({ project, onGenerate }: { project: Project; onGenerate?: () => void }) {
  const { message } = App.useApp();
  const atps = (useEntityList('atps', { filters: [{ field: 'projectId', operator: 'eq', value: project.id }], pageSize: 200 }).data?.data ?? []) as unknown as Atp[];
  const steps = (useEntityList('atpSteps', { pageSize: 5000 }).data?.data ?? []) as unknown as AtpStep[];
  const createAtp = useEntityCreate('atps');
  const audit = useRecordAudit();
  const [sel, setSel] = useState<Atp | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm();
  const stepsOf = (a: Atp) => steps.filter((s) => s.atpId === a.id);
  const accepted = atps.filter((a) => a.status === 'Accepted').length;
  const addAtp = async () => {
    const v = await form.validateFields();
    const id = sid('ATP');
    createAtp.mutate({ id, atpId: id, ...env(), projectId: project.id, name: v.name, system: v.system, level: v.level, status: 'Draft' }, {
      onSuccess: () => { audit('ATP', id, 'created', `Created ATP ${v.name}`); message.success('ATP created'); setAddOpen(false); form.resetFields(); },
    });
  };
  return (
    <VwCard title="Acceptance tests" extra={<span className="vw-inline-flex vw-items-center vw-gap-sm">
      {atps.length > 0 && <Muted>{accepted} of {atps.length} accepted</Muted>}
      {atps.length === 0 && onGenerate && <Button size="small" type="primary" onClick={onGenerate}>Generate standard tests</Button>}
      <Button size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>New test</Button>
    </span>}>
      <div className="vw-flex vw-flex-col vw-gap-sm">
        {atps.length > 0 && <div className="vw-card-description">The commissioning gate clears when every acceptance test is accepted. Click a test to record step results.</div>}
        <DataTable rows={atps} rowKey={(a) => a.id} onRow={setSel} empty="No acceptance tests yet. Generate the standard set for this template, or add one."
          cols={[
            { key: 'name', title: 'Test', wrap: true, render: (a) => a.name },
            { key: 'sys', title: 'System', render: (a) => a.system },
            { key: 'lvl', title: 'Level', render: (a) => a.level },
            { key: 'steps', title: 'Steps passed', render: (a) => { const ss = stepsOf(a); const ok = ss.filter((s) => s.result === 'Pass').length; return <span className="vw-inline-flex vw-items-center vw-gap-sm"><Bar value={ok} max={ss.length || 1} width={80} /><Muted>{ok} of {ss.length}</Muted></span>; } },
            { key: 'wit', title: 'Witnessed by', render: (a) => a.witnessedBy ?? <Muted>—</Muted> },
            { key: 'st', title: 'Status', render: (a) => <VwChip variant={ATP_TONE[a.status] ?? 'neutral'}>{a.status}</VwChip> },
          ]} />
      </div>
      <Modal title="New acceptance test" open={addOpen} onOk={addAtp} onCancel={() => setAddOpen(false)} okText="Create test" destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ system: 'Power', level: 'L4 Functional' }}>
          <Form.Item name="name" label="Test name" rules={[{ required: true }]}><Input placeholder="e.g. Power train ATP" /></Form.Item>
          <Form.Item name="system" label="System" rules={[{ required: true }]}><Select placeholder="Select system" options={ATP_SYSTEM.map((x) => ({ value: x, label: x }))} /></Form.Item>
          <Form.Item name="level" label="Commissioning level" rules={[{ required: true }]}><Select placeholder="Select commissioning level" options={CX_LEVEL.map((x) => ({ value: x, label: x }))} /></Form.Item>
        </Form>
      </Modal>
      <AtpDetailDrawer atp={sel} open={!!sel} onClose={() => setSel(null)} />
    </VwCard>
  );
}

// ── HOTO panel: sign-offs, snags, deliverables, accept ──────────────
export function HotoPanel({ project, hoto, onOpen }: { project: Project; hoto?: Hoto; onOpen?: () => void }) {
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
  if (!hoto) return (
    <VwCard title="Handover to operations" extra={onOpen && <Button size="small" type="primary" onClick={onOpen}>Open handover package</Button>}>
      <div className="vw-card-description">Handover has not started. Opening the package creates the sign-offs, the deliverables list and the snag list that operations accepts against.</div>
    </VwCard>
  );

  const blockingSnags = snags.filter((s) => s.status === 'Open' && (s.severity === 'Critical' || s.severity === 'Major'));
  const pendingSign = signoffs.filter((s) => s.decision !== 'Signed').length;
  const allSigned = signoffs.length > 0 && pendingSign === 0;
  const canAccept = blockingSnags.length === 0 && allSigned && hoto.status !== 'Accepted';
  const accept = () => updateHoto.mutate({ id: hoto.id, data: { status: 'Accepted', warrantyStart: new Date().toISOString() } }, {
    onSuccess: () => { audit('Project', project.id, 'hoto', 'Hand-over accepted — ownership to Operations, warranty started'); message.success('Handover accepted'); },
  });
  const sign = (s: HotoSignoff) => updateSignoff.mutate({ id: s.id, data: { decision: 'Signed', name: user.name, signedAt: new Date().toISOString() } }, {
    onSuccess: () => audit('HOTO', hoto.hotoId, 'signed', `${s.role} signed off`),
  });

  return (
    <VwCard title="Handover to operations" extra={hoto.status === 'Accepted' ? <VwChip variant="success">Accepted</VwChip> : <Button size="small" type="primary" disabled={!canAccept} onClick={accept}>Accept handover</Button>}>
      <div className="vw-flex vw-flex-col vw-gap-md">
        <div className="vw-card-description">
          {hoto.status === 'Accepted'
            ? `Handover accepted. Warranty started ${fmtDate(hoto.warrantyStart)}. Operations now owns this infrastructure.`
            : canAccept ? 'Ready to hand over: every sign-off is in and no critical or major snag is open.'
              : `Not ready: ${blockingSnags.length} critical or major snag${blockingSnags.length === 1 ? '' : 's'} open, ${pendingSign} sign-off${pendingSign === 1 ? '' : 's'} pending.`}
        </div>

        <div>
          <div className="vw-flex vw-justify-between vw-items-center" style={{ marginBottom: 6 }}><span className="vw-card-title-sm">Sign-offs</span><Muted>{signoffs.length - pendingSign} of {signoffs.length} signed</Muted></div>
          <DataTable rows={signoffs} rowKey={(s) => s.id} empty="No sign-offs set up."
            cols={[
              { key: 'role', title: 'Role', render: (s) => s.role },
              { key: 'name', title: 'Name', render: (s) => s.name || <Muted>—</Muted> },
              { key: 'dec', title: 'Decision', render: (s) => <VwChip variant={s.decision === 'Signed' ? 'success' : s.decision === 'Rejected' ? 'error' : 'neutral'}>{s.decision}</VwChip> },
              { key: 'at', title: 'Signed', render: (s) => fmtDate(s.signedAt) },
              { key: 'x', title: '', align: 'right', render: (s) => s.decision !== 'Signed' && hoto.status !== 'Accepted' ? <Button size="small" onClick={() => sign(s)}>Sign</Button> : null },
            ]} />
        </div>

        <div>
          <div className="vw-flex vw-justify-between vw-items-center" style={{ marginBottom: 6 }}><span className="vw-card-title-sm">Snags</span>
            <span className="vw-inline-flex vw-items-center vw-gap-sm"><Muted>{snags.filter((s) => s.status === 'Open').length} open</Muted>{hoto.status !== 'Accepted' && <Button size="small" icon={<PlusOutlined />} onClick={() => setSnagOpen(true)}>Raise snag</Button>}</span></div>
          <DataTable rows={snags} rowKey={(s) => s.id} empty="No snags raised."
            cols={[
              { key: 'sev', title: 'Severity', render: (s) => <VwChip variant={SEV_TONE[s.severity] ?? 'neutral'}>{s.severity}</VwChip> },
              { key: 'd', title: 'Description', wrap: true, render: (s) => s.description },
              { key: 'o', title: 'Owner', render: (s) => s.owner },
              { key: 'r', title: 'Raised', render: (s) => fmtDate(s.raisedAt) },
              { key: 'st', title: 'Status', render: (s) => <VwChip variant={s.status === 'Open' ? 'warning' : 'success'}>{s.status}</VwChip> },
              { key: 'x', title: '', align: 'right', render: (s) => s.status === 'Open' ? <Button size="small" onClick={() => updateSnag.mutate({ id: s.id, data: { status: 'Closed', closedAt: new Date().toISOString() } }, { onSuccess: () => audit('Snag', s.snagId, 'closed', `Snag closed: ${s.description}`) })}>Close</Button> : null },
            ]} />
        </div>

        <div>
          <div className="vw-flex vw-justify-between vw-items-center" style={{ marginBottom: 6 }}><span className="vw-card-title-sm">Deliverables</span>
            <span className="vw-inline-flex vw-items-center vw-gap-sm"><Muted>{deliverables.length} listed</Muted>{hoto.status !== 'Accepted' && <Button size="small" icon={<PlusOutlined />} onClick={() => setDelivOpen(true)}>Add deliverable</Button>}</span></div>
          <DataTable rows={deliverables} rowKey={(x) => x.id} empty="No deliverables listed."
            cols={[
              { key: 'c', title: 'Category', render: (x) => x.category },
              { key: 'n', title: 'Deliverable', wrap: true, render: (x) => x.name },
              { key: 's', title: 'Status', render: (x) => <Select size="small" value={x.status} style={{ width: 130 }} aria-label={`Status of ${x.name}`} options={DELIVERABLE_STATUS.map((o) => ({ value: o, label: o }))} onChange={(v) => updateDeliv.mutate({ id: x.id, data: { status: v } })} /> },
            ]} />
        </div>
      </div>

      <Modal title="Raise snag" open={snagOpen} okText="Raise" destroyOnHidden onCancel={() => setSnagOpen(false)}
        onOk={async () => { const v = await snagForm.validateFields(); const id = sid('SNAG'); createSnag.mutate({ id, snagId: id, ...env(), projectId: project.id, description: v.description, severity: v.severity, status: 'Open', owner: v.owner || project.managerName, raisedAt: now() }, { onSuccess: () => { audit('Snag', id, 'raised', `Snag raised: ${v.description}`); message.success('Snag raised'); setSnagOpen(false); snagForm.resetFields(); } }); }}>
        <Form form={snagForm} layout="vertical" initialValues={{ severity: 'Minor' }}>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}><Input.TextArea rows={2} placeholder="What is the defect?" /></Form.Item>
          <Form.Item name="severity" label="Severity" rules={[{ required: true }]}><Select placeholder="Select severity" options={SNAG_SEVERITY.map((x) => ({ value: x, label: x }))} /></Form.Item>
          <Form.Item name="owner" label="Owner"><Input placeholder="Defaults to the project manager" /></Form.Item>
        </Form>
      </Modal>
      <Modal title="Add deliverable" open={delivOpen} okText="Add" destroyOnHidden onCancel={() => setDelivOpen(false)}
        onOk={async () => { const v = await delivForm.validateFields(); const id = sid('HD'); createDeliv.mutate({ id, hdId: id, ...env(), hotoId: hoto.id, category: v.category || 'Documentation', name: v.name, status: 'Pending' }, { onSuccess: () => { audit('HOTO', hoto.hotoId, 'deliverable added', `Added deliverable: ${v.name}`); message.success('Deliverable added'); setDelivOpen(false); delivForm.resetFields(); } }); }}>
        <Form form={delivForm} layout="vertical" initialValues={{ category: 'Documentation' }}>
          <Form.Item name="name" label="Deliverable" rules={[{ required: true }]}><Input placeholder="e.g. Fire-suppression certificate" /></Form.Item>
          <Form.Item name="category" label="Category"><Select placeholder="Select category" options={['Documentation', 'Closeout', 'Training', 'Warranty', 'Compliance'].map((x) => ({ value: x, label: x }))} /></Form.Item>
        </Form>
      </Modal>
    </VwCard>
  );
}
