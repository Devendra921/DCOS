import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Col as Column, DatePicker, Form, Input, Modal, Row, Select, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { FileText, Plus } from 'lucide-react';
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
import { DESIGN_DOC_TYPE, DESIGN_DOC_STATUS, DESIGN_DISCIPLINE } from '../../../mock/data/enums';
import type { DesignDocument, Project, Program } from '../../../mock/data/types';
import { DESIGN_STATUS_COLOR } from '../lib/permits';

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

  const cols: Col<DesignDocument>[] = [
    { key: 'name', header: 'Document', sort: (r) => r.name, render: (r) => <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.type}</small></span> },
    { key: 'discipline', header: 'Discipline', sort: (r) => r.discipline ?? '', render: (r) => r.discipline ? <Chip tone="info">{r.discipline}</Chip> : <span className="vw-label">—</span> },
    { key: 'rev', header: 'Rev', sort: (r) => r.revision ?? '', render: (r) => <span className="mono">{r.revision}</span> },
    { key: 'phase', header: 'Phase', sort: (r) => projName(r.projectId), render: (r) => r.projectId ? <a onClick={(e) => { e.stopPropagation(); navigate(`/delivery/projects/${r.projectId}`); }}>{projName(r.projectId)}</a> : <span className="vw-label">—</span> },
    { key: 'docs', header: 'Docs', align: 'right', sort: (r) => r.attachments?.length ?? 0, render: (r) => <span className="num">{r.attachments?.length ?? 0}</span> },
    { key: 'author', header: 'Author', sort: (r) => r.author ?? '', render: (r) => r.author },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip tone={antdTone(DESIGN_STATUS_COLOR[r.status])} dot>{r.status}</Chip> },
  ];

  const statusParts: Part[] = DESIGN_DOC_STATUS.map((s) => ({ key: s, label: s, n: docs.filter((d) => d.status === s).length, tone: antdTone(DESIGN_STATUS_COLOR[s]) as Tone })).filter((p) => p.n > 0);

  return (
    <OpsPage title="Design documents" description="Design sets, drawings and as-built records for every programme and phase."
      actions={<Btn variant="filled" icon={Plus} onClick={openNew}>New document</Btn>}>
      <StatGrid cols={4}>
        <StatTile label="Issued for construction" value={m.ifc} sub={`of ${m.total} documents`} />
        <StatTile label="Draft or in review" value={m.inReview} subTone={m.inReview ? 'warn' : undefined} sub="not issued yet" />
        <StatTile label="As-built" value={m.asBuilt} sub="record of what was built" />
        <StatTile label="Documents" value={m.total} sub="by status">
          <Split parts={statusParts} onPick={(k) => setStatusF(statusF[0] === k ? [] : [k])} active={statusF[0]} />
        </StatTile>
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} onRow={openEdit} pageSize={25}
          empty={<Empty icon={FileText} title="No documents match">Clear the search or a filter, or add one with New document.</Empty>}
          toolbar={
            <ListToolbar shown={rows.length} total={docs.length} noun="documents"
              search={{ value: q, onChange: setQ, placeholder: 'Name, author, revision' }}
              filters={[
                { id: 'status', label: 'Status', quick: true, value: statusF[0] ?? '', anyLabel: 'Any status', onChange: (v) => setStatusF(v ? [v] : []), options: DESIGN_DOC_STATUS.map((s) => ({ id: s, label: s, count: docs.filter((d) => d.status === s).length })) },
                { id: 'discipline', label: 'Discipline', quick: true, value: discF[0] ?? '', anyLabel: 'Any discipline', onChange: (v) => setDiscF(v ? [v] : []), options: DESIGN_DISCIPLINE.map((s) => ({ id: s, label: s, count: docs.filter((d) => d.discipline === s).length })) },
              ]} />
          } />
      </section>

      <Modal title={editing ? 'Edit design document' : 'New design document'} open={open} onOk={submit} confirmLoading={create.isPending || update.isPending} onCancel={() => setOpen(false)} okText={editing ? 'Save' : 'Add document'} forceRender width={620}>
        <Form form={form} layout="vertical" initialValues={{ status: 'Draft', type: 'Detailed Design', revision: 'A' }}>
          <Form.Item name="name" label="Document name" rules={[{ required: true }]}><Input placeholder="Structural IFC set" /></Form.Item>
          <Row gutter={12}>
            <Column span={12}><Form.Item name="type" label="Type" rules={[{ required: true }]}><Select placeholder="Select type" options={DESIGN_DOC_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item></Column>
            <Column span={12}><Form.Item name="status" label="Status" rules={[{ required: true }]}><Select placeholder="Select status" options={DESIGN_DOC_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item></Column>
          </Row>
          <Row gutter={12}>
            <Column span={12}><Form.Item name="discipline" label="Discipline"><Select placeholder="Select discipline" allowClear options={DESIGN_DISCIPLINE.map((s) => ({ value: s, label: s }))} /></Form.Item></Column>
            <Column span={12}><Form.Item name="revision" label="Revision" rules={[{ required: true }]}><Input placeholder="A / B / C0" /></Form.Item></Column>
          </Row>
          <Row gutter={12}>
            <Column span={12}><Form.Item name="programId" label="Programme"><Select placeholder="Select programme" allowClear showSearch optionFilterProp="label" options={programs.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item></Column>
            <Column span={12}><Form.Item name="projectId" label="Phase / project"><Select placeholder="Select phase / project" allowClear showSearch optionFilterProp="label" options={projects.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item></Column>
          </Row>
          <Row gutter={12}>
            <Column span={8}><Form.Item name="author" label="Author" rules={[{ required: true }]}><Input placeholder="Lead designer" /></Form.Item></Column>
            <Column span={8}><Form.Item name="reviewedBy" label="Reviewed by"><Input placeholder="Enter reviewed by" /></Form.Item></Column>
            <Column span={8}><Form.Item name="issuedDate" label="Issued"><DatePicker placeholder="Select issued date" style={{ width: '100%' }} /></Form.Item></Column>
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
    </OpsPage>
  );
}
