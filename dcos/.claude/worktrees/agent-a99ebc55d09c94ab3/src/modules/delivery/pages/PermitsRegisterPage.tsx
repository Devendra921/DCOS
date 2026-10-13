import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Col, DatePicker, Form, Input, Modal, Row, Select, Space, Spin, Typography, Upload } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import type { UploadFile } from 'antd';
import { PlusOutlined, SearchOutlined, WarningOutlined, InboxOutlined } from '../../../shared/icons';
import dayjs from 'dayjs';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { SummaryRow } from '../components/home/kit';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { PERMIT_TYPE, PERMIT_STATUS } from '../../../mock/data/enums';
import type { Permit, Project, Program } from '../../../mock/data/types';
import { PERMIT_STATUS_COLOR, permitExpiringSoon, permitExpired, daysUntil } from '../lib/permits';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
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
  const { visible, hasMore, sentinelRef, total } = useScrollReveal(rows, 25, `${q}|${statusF.join(",")}|${typeF.join(",")}`);

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

  const columns = [
    { title: 'Permit', dataIndex: 'name', ellipsis: true, render: (n: string, r: Permit) => <a onClick={() => openEdit(r)}>{n}</a> },
    { title: 'Type', dataIndex: 'type', width: 150, render: (t: string) => <VwChip>{t}</VwChip> },
    { title: 'Authority', dataIndex: 'authority', width: 170, ellipsis: true },
    { title: 'Phase', key: 'phase', width: 180, ellipsis: true, render: (_: unknown, r: Permit) => r.projectId ? <a onClick={(e) => { e.stopPropagation(); navigate(`/delivery/projects/${r.projectId}`); }}>{projName(r.projectId)}</a> : <Text type="secondary">—</Text> },
    { title: 'Docs', key: 'docs', width: 64, align: 'center' as const, render: (_: unknown, r: Permit) => <VwChip>{r.attachments?.length ?? 0}</VwChip> },
    { title: 'Reference', dataIndex: 'referenceNo', width: 110, render: (v: string) => v ?? '—' },
    {
      title: 'Validity', key: 'validity', width: 150, render: (_: unknown, r: Permit) => {
        if (r.status !== 'Approved' || !r.expiryDate) return <Text type="secondary">—</Text>;
        const d = daysUntil(r.expiryDate);
        const expired = permitExpired(r); const soon = permitExpiringSoon(r);
        return <Text style={{ fontSize: "var(--vw-font-label-sm)", color: expired ? 'var(--vw-color-red-600)' : soon ? '#b45309' : '#64748b' }}>{expired ? 'Expired' : `${d}d left`}{(soon || expired) && <WarningOutlined style={{ marginLeft: "var(--vw-space-xxs)" }} />}</Text>;
      },
    },
    { title: 'Status', dataIndex: 'status', width: 120, render: (s: string) => <VwChip color={PERMIT_STATUS_COLOR[s]}>{s}</VwChip> },
  ];

  return (
    <div>
      <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm vw-wrap" style={{ marginBottom: 'var(--vw-space-md)' }}>
        <div className="vw-card-title" role="heading" aria-level={3}>Permits and approvals</div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New permit</Button>
      </div>

      <div style={{ marginBottom: 'var(--vw-space-md)' }}>
        <SummaryRow items={[
          { label: 'Approved', value: m.approved },
          { label: 'In review or applied', value: m.inFlight, tone: m.inFlight ? 'warn' : undefined },
          { label: 'Expiring in 60 days', value: m.expiringSoon, tone: m.expiringSoon ? 'warn' : undefined },
          { label: 'Expired', value: m.expired, tone: m.expired ? 'bad' : undefined },
        ]} />
      </div>

      <Space wrap style={{ marginBottom: "var(--vw-space-lg)" }}>
        <Input prefix={<SearchOutlined />} placeholder="Search name / authority / reference…" allowClear value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />
        <Select mode="multiple" allowClear placeholder="Status" value={statusF} onChange={setStatusF} style={{ minWidth: 180 }} options={PERMIT_STATUS.map((s) => ({ value: s, label: s }))} maxTagCount="responsive" />
        <Select mode="multiple" allowClear placeholder="Type" value={typeF} onChange={setTypeF} style={{ minWidth: 200 }} options={PERMIT_TYPE.map((s) => ({ value: s, label: s }))} maxTagCount="responsive" />
      </Space>

      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
        Showing {visible.length} of {total} permits
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Table<Permit> rowKey="id" size="small" dataSource={visible} columns={columns} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }} />
        {visible.length > 0 && hasMore && (
          <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>

      <Modal title={editing ? 'Edit permit' : 'New permit'} open={open} onOk={submit} confirmLoading={create.isPending || update.isPending} onCancel={() => setOpen(false)} okText={editing ? 'Save' : 'Add permit'} forceRender width={620}>
        <Form form={form} layout="vertical" initialValues={{ status: 'Not Started', type: 'Building Permit' }}>
          <Form.Item name="name" label="Permit name" rules={[{ required: true }]}><Input placeholder="Building permit" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="type" label="Type" rules={[{ required: true }]}><Select placeholder="Select type" options={PERMIT_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="status" label="Status" rules={[{ required: true }]}><Select placeholder="Select status" options={PERMIT_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="authority" label="Issuing authority" rules={[{ required: true }]}><Input placeholder="Municipal Building Control" /></Form.Item></Col>
            <Col span={12}><Form.Item name="referenceNo" label="Reference no."><Input placeholder="BUI-12345" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="programId" label="Programme"><Select placeholder="Select programme" allowClear showSearch optionFilterProp="label" options={programs.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="projectId" label="Phase / project"><Select placeholder="Select phase / project" allowClear showSearch optionFilterProp="label" options={projects.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="appliedDate" label="Applied"><DatePicker placeholder="Select applied date" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="approvedDate" label="Approved"><DatePicker placeholder="Select approved date" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="expiryDate" label="Expires"><DatePicker placeholder="Select expires date" style={{ width: '100%' }} /></Form.Item></Col>
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
    </div>
  );
}
