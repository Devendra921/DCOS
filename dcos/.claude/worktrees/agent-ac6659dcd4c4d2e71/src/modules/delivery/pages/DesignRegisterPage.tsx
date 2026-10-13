import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Col, DatePicker, Form, Input, Modal, Row, Select, Space, Spin, Typography, Upload } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import type { UploadFile } from 'antd';
import { PlusOutlined, SearchOutlined, InboxOutlined } from '../../../shared/icons';
import dayjs from 'dayjs';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { SummaryRow } from '../components/home/kit';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { DESIGN_DOC_TYPE, DESIGN_DOC_STATUS, DESIGN_DISCIPLINE } from '../../../mock/data/enums';
import type { DesignDocument, Project, Program } from '../../../mock/data/types';
import { DESIGN_STATUS_COLOR } from '../lib/permits';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'You', createdById: 'me' });

export default function DesignRegisterPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const docs = (useEntityList('designDocuments', { pageSize: 1000 }).data?.data ?? []) as unknown as DesignDocument[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const programs = (useEntityList('programs', { pageSize: 200 }).data?.data ?? []) as unknown as Program[];
  const create = useEntityCreate('designDocuments');
  const update = useEntityUpdate('designDocuments');
  const audit = useRecordAudit();

  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState<string[]>([]);
  const [discF, setDiscF] = useState<string[]>([]);
  const [editing, setEditing] = useState<DesignDocument | null>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);

  const projName = (id?: string) => projects.find((p) => p.id === id)?.name ?? '—';

  const rows = useMemo(() => docs.filter((d) => {
    if (statusF.length && !statusF.includes(d.status)) return false;
    if (discF.length && (!d.discipline || !discF.includes(d.discipline))) return false;
    if (q && ![d.name, d.author, d.revision, projName(d.projectId)].some((s) => (s ?? '').toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [docs, statusF, discF, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const { visible, hasMore, sentinelRef, total } = useScrollReveal(rows, 25, `${q}|${statusF.join(",")}|${discF.join(",")}`);

  const m = useMemo(() => ({
    ifc: docs.filter((d) => d.status === 'Issued for Construction').length,
    inReview: docs.filter((d) => d.status === 'In Review' || d.status === 'Draft').length,
    asBuilt: docs.filter((d) => d.status === 'As-Built').length,
    total: docs.length,
  }), [docs]);

  const openNew = () => { setEditing(null); setFiles([]); setOpen(true); form.resetFields(); };
  const openEdit = (d: DesignDocument) => {
    setEditing(d); setOpen(true);
    setFiles((d.attachments ?? []).map((a, i) => ({ uid: `a-${i}`, name: a.name, size: a.sizeKb ? a.sizeKb * 1024 : undefined, type: a.mime, status: 'done' } as UploadFile)));
    form.setFieldsValue({ ...d, issuedDate: d.issuedDate ? dayjs(d.issuedDate) : undefined });
  };
  const filesToAttachments = () => files.map((f) => ({ name: f.name, sizeKb: f.size != null ? Math.round(f.size / 1024) : undefined, mime: f.type, uploadedAt: new Date().toISOString() }));

  const submit = async () => {
    const v = await form.validateFields();
    const data: Record<string, unknown> = {
      name: v.name, type: v.type, status: v.status, discipline: v.discipline, revision: v.revision, author: v.author, reviewedBy: v.reviewedBy,
      programId: v.programId, projectId: v.projectId, issuedDate: v.issuedDate ? v.issuedDate.toISOString() : undefined, notes: v.notes,
      attachments: filesToAttachments(),
    };
    if (editing) {
      await update.mutateAsync({ id: editing.id, data: { ...data, updatedAt: new Date().toISOString() } });
      audit('DesignDocument', editing.ddId, 'updated', `Updated ${v.name} (rev ${v.revision}) → ${v.status}`);
      message.success('Design document updated');
    } else {
      const id = `DD-${Date.now().toString(36).toUpperCase()}`;
      await create.mutateAsync({ id, ddId: id, ...env(), ...data });
      audit('DesignDocument', id, 'created', `Added design document ${v.name}`);
      message.success('Design document added');
    }
    setOpen(false);
  };

  const columns = [
    { title: 'Document', dataIndex: 'name', ellipsis: true, render: (n: string, r: DesignDocument) => <a onClick={() => openEdit(r)}>{n}</a> },
    { title: 'Type', dataIndex: 'type', width: 150, render: (t: string) => <VwChip>{t}</VwChip> },
    { title: 'Discipline', dataIndex: 'discipline', width: 130, render: (d: string) => d ? <VwChip color="geekblue">{d}</VwChip> : '—' },
    { title: 'Rev', dataIndex: 'revision', width: 64 },
    { title: 'Phase', key: 'phase', width: 175, ellipsis: true, render: (_: unknown, r: DesignDocument) => r.projectId ? <a onClick={(e) => { e.stopPropagation(); navigate(`/delivery/projects/${r.projectId}`); }}>{projName(r.projectId)}</a> : <Text type="secondary">—</Text> },
    { title: 'Docs', key: 'docs', width: 64, align: 'center' as const, render: (_: unknown, r: DesignDocument) => <VwChip>{r.attachments?.length ?? 0}</VwChip> },
    { title: 'Author', dataIndex: 'author', width: 140, ellipsis: true },
    { title: 'Status', dataIndex: 'status', width: 190, render: (s: string) => <VwChip color={DESIGN_STATUS_COLOR[s]}>{s}</VwChip> },
  ];

  return (
    <div>
      <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm vw-wrap" style={{ marginBottom: 'var(--vw-space-md)' }}>
        <div className="vw-card-title" role="heading" aria-level={3}>Design documents</div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New document</Button>
      </div>

      <div style={{ marginBottom: 'var(--vw-space-md)' }}>
        <SummaryRow items={[
          { label: 'Issued for construction', value: m.ifc },
          { label: 'Draft or in review', value: m.inReview, tone: m.inReview ? 'warn' : undefined },
          { label: 'As-built', value: m.asBuilt },
          { label: 'Documents', value: m.total },
        ]} />
      </div>

      <Space wrap style={{ marginBottom: "var(--vw-space-lg)" }}>
        <Input prefix={<SearchOutlined />} placeholder="Search name / author / revision…" allowClear value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />
        <Select mode="multiple" allowClear placeholder="Status" value={statusF} onChange={setStatusF} style={{ minWidth: 200 }} options={DESIGN_DOC_STATUS.map((s) => ({ value: s, label: s }))} maxTagCount="responsive" />
        <Select mode="multiple" allowClear placeholder="Discipline" value={discF} onChange={setDiscF} style={{ minWidth: 170 }} options={DESIGN_DISCIPLINE.map((s) => ({ value: s, label: s }))} maxTagCount="responsive" />
      </Space>

      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
        Showing {visible.length} of {total} documents
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Table<DesignDocument> rowKey="id" size="small" dataSource={visible} columns={columns} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }} />
        {visible.length > 0 && hasMore && (
          <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>

      <Modal title={editing ? 'Edit design document' : 'New design document'} open={open} onOk={submit} confirmLoading={create.isPending || update.isPending} onCancel={() => setOpen(false)} okText={editing ? 'Save' : 'Add document'} forceRender width={620}>
        <Form form={form} layout="vertical" initialValues={{ status: 'Draft', type: 'Detailed Design', revision: 'A' }}>
          <Form.Item name="name" label="Document name" rules={[{ required: true }]}><Input placeholder="Structural IFC set" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="type" label="Type" rules={[{ required: true }]}><Select placeholder="Select type" options={DESIGN_DOC_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="status" label="Status" rules={[{ required: true }]}><Select placeholder="Select status" options={DESIGN_DOC_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="discipline" label="Discipline"><Select placeholder="Select discipline" allowClear options={DESIGN_DISCIPLINE.map((s) => ({ value: s, label: s }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="revision" label="Revision" rules={[{ required: true }]}><Input placeholder="A / B / C0" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="programId" label="Programme"><Select placeholder="Select programme" allowClear showSearch optionFilterProp="label" options={programs.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="projectId" label="Phase / project"><Select placeholder="Select phase / project" allowClear showSearch optionFilterProp="label" options={projects.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="author" label="Author" rules={[{ required: true }]}><Input placeholder="Lead designer" /></Form.Item></Col>
            <Col span={8}><Form.Item name="reviewedBy" label="Reviewed by"><Input placeholder="Enter reviewed by" /></Form.Item></Col>
            <Col span={8}><Form.Item name="issuedDate" label="Issued"><DatePicker placeholder="Select issued date" style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item label="Documents / sheets" tooltip="Drag or select one or more files. Prototype: file details are recorded; contents aren't stored.">
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
