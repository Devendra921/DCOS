import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Col as Column, DatePicker, Form, Input, Modal, Row, Select, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { FileCheck, Plus } from 'lucide-react';
import { InboxOutlined } from '../../../shared/icons';
import dayjs from 'dayjs';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Split, StatGrid, StatTile, type Part, type Tone } from '../../../ops/ui/Analytics';
import { antdTone } from '../components/home/tones';
import { PERMIT_TYPE, PERMIT_STATUS } from '../../../mock/data/enums';
import type { Permit, Project, Program } from '../../../mock/data/types';
import { PERMIT_STATUS_COLOR, permitExpiringSoon, permitExpired, daysUntil } from '../lib/permits';

const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'You', createdById: 'me' });

export default function PermitsRegisterPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const permits = (useEntityList('permits', { pageSize: 1000 }).data?.data ?? []) as unknown as Permit[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const programs = (useEntityList('programs', { pageSize: 200 }).data?.data ?? []) as unknown as Program[];
  const create = useEntityCreate('permits');
  const update = useEntityUpdate('permits');
  const audit = useRecordAudit();

  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState<string[]>([]);
  const [typeF, setTypeF] = useState<string[]>([]);
  const [editing, setEditing] = useState<Permit | null>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);

  const projName = (id?: string) => projects.find((p) => p.id === id)?.name ?? '—';

  const rows = useMemo(() => permits.filter((p) => {
    if (statusF.length && !statusF.includes(p.status)) return false;
    if (typeF.length && !typeF.includes(p.type)) return false;
    if (q && ![p.name, p.authority, p.referenceNo, projName(p.projectId)].some((s) => (s ?? '').toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [permits, statusF, typeF, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMemo(() => ({
    approved: permits.filter((p) => p.status === 'Approved').length,
    inFlight: permits.filter((p) => p.status === 'Applied' || p.status === 'In Review').length,
    expiringSoon: permits.filter((p) => permitExpiringSoon(p)).length,
    expired: permits.filter((p) => permitExpired(p)).length,
  }), [permits]);

  const openNew = () => { setEditing(null); setFiles([]); setOpen(true); form.resetFields(); };
  const openEdit = (p: Permit) => {
    setEditing(p); setOpen(true);
    setFiles((p.attachments ?? []).map((a, i) => ({ uid: `a-${i}`, name: a.name, size: a.sizeKb ? a.sizeKb * 1024 : undefined, type: a.mime, status: 'done' } as UploadFile)));
    form.setFieldsValue({ ...p, appliedDate: p.appliedDate ? dayjs(p.appliedDate) : undefined, approvedDate: p.approvedDate ? dayjs(p.approvedDate) : undefined, expiryDate: p.expiryDate ? dayjs(p.expiryDate) : undefined });
  };
  const filesToAttachments = () => files.map((f) => ({ name: f.name, sizeKb: f.size != null ? Math.round(f.size / 1024) : undefined, mime: f.type, uploadedAt: new Date().toISOString() }));

  const submit = async () => {
    const v = await form.validateFields();
    const data: Record<string, unknown> = {
      name: v.name, type: v.type, status: v.status, authority: v.authority, referenceNo: v.referenceNo, owner: v.owner,
      programId: v.programId, projectId: v.projectId,
      appliedDate: v.appliedDate ? v.appliedDate.toISOString() : undefined,
      approvedDate: v.approvedDate ? v.approvedDate.toISOString() : undefined,
      expiryDate: v.expiryDate ? v.expiryDate.toISOString() : undefined,
      notes: v.notes,
      attachments: filesToAttachments(),
    };
    if (editing) {
      await update.mutateAsync({ id: editing.id, data: { ...data, updatedAt: new Date().toISOString() } });
      audit('Permit', editing.permitId, 'updated', `Updated permit ${v.name} → ${v.status}`);
      message.success('Permit updated');
    } else {
      const id = `PMT-${Date.now().toString(36).toUpperCase()}`;
      await create.mutateAsync({ id, permitId: id, ...env(), ...data });
      audit('Permit', id, 'created', `Raised permit ${v.name}`);
      message.success('Permit added');
    }
    setOpen(false);
  };

  const cols: Col<Permit>[] = [
    { key: 'name', header: 'Permit', sort: (r) => r.name, render: (r) => <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.type}</small></span> },
    { key: 'authority', header: 'Authority', sort: (r) => r.authority ?? '', render: (r) => <span className="cell-2"><span>{r.authority}</span><small className="mono">{r.referenceNo ?? '—'}</small></span> },
    { key: 'phase', header: 'Phase', sort: (r) => projName(r.projectId), render: (r) => r.projectId ? <a onClick={(e) => { e.stopPropagation(); navigate(`/delivery/projects/${r.projectId}`); }}>{projName(r.projectId)}</a> : <span className="vw-label">—</span> },
    { key: 'docs', header: 'Docs', align: 'right', sort: (r) => r.attachments?.length ?? 0, render: (r) => <span className="num">{r.attachments?.length ?? 0}</span> },
    { key: 'validity', header: 'Validity', sort: (r) => (r.status === 'Approved' && r.expiryDate ? daysUntil(r.expiryDate) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER), render: (r) => {
        if (r.status !== 'Approved' || !r.expiryDate) return <span className="vw-label">—</span>;
        const expired = permitExpired(r); const soon = permitExpiringSoon(r);
        return expired || soon ? <Chip tone={expired ? 'error' : 'warning'} dot>{expired ? 'Expired' : `${daysUntil(r.expiryDate)}d left`}</Chip> : <span className="num">{daysUntil(r.expiryDate)}d left</span>;
      } },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip tone={antdTone(PERMIT_STATUS_COLOR[r.status])} dot>{r.status}</Chip> },
  ];

  const statusParts: Part[] = PERMIT_STATUS.map((s) => ({ key: s, label: s, n: permits.filter((p) => p.status === s).length, tone: antdTone(PERMIT_STATUS_COLOR[s]) as Tone })).filter((p) => p.n > 0);

  return (
    <OpsPage title="Permits and approvals" description="Permits and approvals for every programme and phase, with their documents and validity."
      actions={<Btn variant="filled" icon={Plus} onClick={openNew}>New permit</Btn>}>
      <StatGrid cols={4}>
        <StatTile label="Approved" value={m.approved} sub={`of ${permits.length} permits`}>
          <Split parts={statusParts} onPick={(k) => setStatusF(statusF[0] === k ? [] : [k])} active={statusF[0]} />
        </StatTile>
        <StatTile label="In review or applied" value={m.inFlight} subTone={m.inFlight ? 'warn' : undefined} sub="awaiting the authority" />
        <StatTile label="Expiring in 60 days" value={m.expiringSoon} subTone={m.expiringSoon ? 'warn' : undefined} sub={m.expiringSoon ? 'renew before expiry' : 'none expiring'} />
        <StatTile label="Expired" value={m.expired} subTone={m.expired ? 'bad' : undefined} sub={m.expired ? 'no longer valid' : 'none expired'} />
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} onRow={openEdit} pageSize={25}
          empty={<Empty icon={FileCheck} title="No permits match">Clear the search or a filter, or add a permit with New permit.</Empty>}
          toolbar={
            <ListToolbar shown={rows.length} total={permits.length} noun="permits"
              search={{ value: q, onChange: setQ, placeholder: 'Name, authority, reference' }}
              filters={[
                { id: 'status', label: 'Status', quick: true, value: statusF[0] ?? '', anyLabel: 'Any status', onChange: (v) => setStatusF(v ? [v] : []), options: PERMIT_STATUS.map((s) => ({ id: s, label: s, count: permits.filter((p) => p.status === s).length })) },
                { id: 'type', label: 'Type', quick: true, value: typeF[0] ?? '', anyLabel: 'Any type', onChange: (v) => setTypeF(v ? [v] : []), options: PERMIT_TYPE.map((s) => ({ id: s, label: s, count: permits.filter((p) => p.type === s).length })) },
              ]} />
          } />
      </section>

      <Modal title={editing ? 'Edit permit' : 'New permit'} open={open} onOk={submit} confirmLoading={create.isPending || update.isPending} onCancel={() => setOpen(false)} okText={editing ? 'Save' : 'Add permit'} forceRender width={620}>
        <Form form={form} layout="vertical" initialValues={{ status: 'Not Started', type: 'Building Permit' }}>
          <Form.Item name="name" label="Permit name" rules={[{ required: true }]}><Input placeholder="Building permit" /></Form.Item>
          <Row gutter={12}>
            <Column span={12}><Form.Item name="type" label="Type" rules={[{ required: true }]}><Select placeholder="Select type" options={PERMIT_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item></Column>
            <Column span={12}><Form.Item name="status" label="Status" rules={[{ required: true }]}><Select placeholder="Select status" options={PERMIT_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item></Column>
          </Row>
          <Row gutter={12}>
            <Column span={12}><Form.Item name="authority" label="Issuing authority" rules={[{ required: true }]}><Input placeholder="Municipal Building Control" /></Form.Item></Column>
            <Column span={12}><Form.Item name="referenceNo" label="Reference no."><Input placeholder="BUI-12345" /></Form.Item></Column>
          </Row>
          <Row gutter={12}>
            <Column span={12}><Form.Item name="programId" label="Programme"><Select placeholder="Select programme" allowClear showSearch optionFilterProp="label" options={programs.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item></Column>
            <Column span={12}><Form.Item name="projectId" label="Phase / project"><Select placeholder="Select phase / project" allowClear showSearch optionFilterProp="label" options={projects.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item></Column>
          </Row>
          <Row gutter={12}>
            <Column span={8}><Form.Item name="appliedDate" label="Applied"><DatePicker placeholder="Select applied date" style={{ width: '100%' }} /></Form.Item></Column>
            <Column span={8}><Form.Item name="approvedDate" label="Approved"><DatePicker placeholder="Select approved date" style={{ width: '100%' }} /></Form.Item></Column>
            <Column span={8}><Form.Item name="expiryDate" label="Expires"><DatePicker placeholder="Select expires date" style={{ width: '100%' }} /></Form.Item></Column>
          </Row>
          <Form.Item name="owner" label="Owner" rules={[{ required: true }]}><Input placeholder="Permit coordinator" /></Form.Item>
          <Form.Item label="Documents" tooltip="Drag or select one or more files. Prototype: file details are recorded; contents aren't stored.">
            <Upload.Dragger multiple fileList={files} beforeUpload={() => false} onChange={({ fileList }) => setFiles(fileList)} style={{ padding: "var(--vw-space-xxs)" }}>
              <p className="ant-upload-drag-icon" style={{ marginBottom: 0 }}><InboxOutlined /></p>
              <p className="ant-upload-text" style={{ fontSize: "var(--vw-font-label-md)" }}>Click or drag files to attach</p>
              <p className="ant-upload-hint" style={{ fontSize: "var(--vw-font-label-sm)" }}>Multiple files supported</p>
            </Upload.Dragger>
          </Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea placeholder="Enter notes" rows={2} /></Form.Item>
        </Form>
      </Modal>
    </OpsPage>
  );
}
