import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Row, Col, Typography, Input, Modal, Form, Select, Drawer, Empty, Space, Alert } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { VwCard, VwChip } from '../../../shared/components/ux';
import {
  BookOutlined, PartitionOutlined, FileProtectOutlined, BarChartOutlined, SafetyCertificateOutlined,
  FileDoneOutlined, SearchOutlined, PlusOutlined, ClockCircleOutlined, LinkOutlined, FileTextOutlined,
  DownloadOutlined, CheckCircleOutlined, WarningOutlined,
} from '../../../shared/icons';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { KPICard } from '../../../shared/components/KPICard';
import { DOC_TYPE, DOC_STATUS } from '../../../mock/data/enums';
import type { DocumentRec } from '../../../mock/data/types';

const { Text, Paragraph } = Typography;

const TYPE_META: Record<string, { icon: React.ReactNode; color: string }> = {
  Runbook: { icon: <BookOutlined />, color: 'var(--primaryColor500)' },
  Diagram: { icon: <PartitionOutlined />, color: '#9747ff' },
  Contract: { icon: <FileProtectOutlined />, color: 'var(--vw-color-orange-700)' },
  Report: { icon: <BarChartOutlined />, color: 'var(--vw-color-green-600)' },
  Policy: { icon: <SafetyCertificateOutlined />, color: '#1d4eb8' },
  Evidence: { icon: <FileDoneOutlined />, color: 'var(--vw-color-gray-500)' },
};
const STATUS_COLOR: Record<string, string> = { Published: 'green', Draft: 'default', 'In Review': 'gold', Archived: 'default' };
const LINK_ROUTE: Record<string, (id: string) => string> = {
  DataCenterType: () => '/facility/dc-types',
  DataCenter: (id) => `/facility/dc/${id}`, Provider: () => '/circuits', ComplianceControl: () => '/compliance',
};
const overdue = (d: DocumentRec) => !!d.reviewDueAt && new Date(d.reviewDueAt).getTime() < Date.now() && d.status !== 'Archived';
const fmtSize = (kb: number) => kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;

/** Render the document as markdown and download it — an actual retrievable artifact. */
function docToMarkdown(d: DocumentRec): string {
  const L: string[] = [`# ${d.name}`, ''];
  L.push(`**Type:** ${d.type}  ·  **Status:** ${d.status ?? ''}  ·  **Version:** ${d.version ?? ''}  ·  **Owner:** ${d.ownerName}`);
  if (d.reviewDueAt) L.push(`**Review due:** ${d.reviewDueAt.slice(0, 10)}`);
  if (d.linkedEntityName) L.push(`**Linked to:** ${d.linkedEntityName} (${d.linkedEntityType})`);
  L.push('', d.summary ?? '', '');
  (d.sections ?? []).forEach((s) => L.push(`## ${s.heading}`, '', s.body, ''));
  if (d.steps?.length) { L.push('## Procedure', ''); d.steps.forEach((s, i) => L.push(`${i + 1}. ${s}`)); L.push(''); }
  return L.join('\n');
}
function downloadDoc(d: DocumentRec) {
  const blob = new Blob([docToMarkdown(d)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${d.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`; a.click();
  URL.revokeObjectURL(url);
}

// Illustrative schematics for Diagram documents.
function SpineLeaf() {
  const core = [120, 300], spine = [70, 210, 350], leaf = [40, 150, 270, 380];
  return (
    <svg viewBox="0 0 420 150" width="100%" style={{ maxWidth: 420 }}>
      {core.map((x, i) => spine.map((sx, j) => <line key={`c${i}-${j}`} x1={x} y1={28} x2={sx} y2={75} stroke="#e2e8f0" />))}
      {spine.map((x, i) => leaf.map((lx, j) => <line key={`s${i}-${j}`} x1={x} y1={75} x2={lx} y2={122} stroke="#e2e8f0" />))}
      {core.map((x) => <g key={x}><rect x={x - 26} y={16} width={52} height={20} rx={4} fill="var(--primaryColor500)" /><text x={x} y={30} textAnchor="middle" fontSize="9" fill="#fff">Core</text></g>)}
      {spine.map((x) => <g key={x}><rect x={x - 24} y={65} width={48} height={20} rx={4} fill="#38bdf8" /><text x={x} y={79} textAnchor="middle" fontSize="9" fill="#fff">Spine</text></g>)}
      {leaf.map((x) => <g key={x}><rect x={x - 22} y={112} width={44} height={20} rx={4} fill="var(--vw-color-green-600)" /><text x={x} y={126} textAnchor="middle" fontSize="8" fill="#fff">Leaf</text></g>)}
    </svg>
  );
}
function PowerOneLine() {
  const stages = ['Utility', 'ATS', 'UPS', 'PDU', 'Racks'];
  const colors = ['var(--vw-color-gray-500)', 'var(--vw-color-orange-700)', 'var(--primaryColor500)', '#9747ff', 'var(--vw-color-green-600)'];
  return (
    <svg viewBox="0 0 420 70" width="100%" style={{ maxWidth: 420 }}>
      {stages.map((s, i) => {
        const x = 20 + i * 96;
        return <g key={s}>{i > 0 && <line x1={x - 44} y1={35} x2={x - 8} y2={35} stroke="#cbd5e1" strokeWidth={2} />}<rect x={x - 8} y={22} width={72} height={26} rx={5} fill={colors[i]} /><text x={x + 28} y={39} textAnchor="middle" fontSize="10" fill="#fff">{s}</text></g>;
      })}
    </svg>
  );
}
function DiagramFigure({ name }: { name: string }) {
  const power = /power|one-line/i.test(name);
  return (
    <div style={{ border: '1px solid #eef2f6', borderRadius: "var(--vw-radius-sm)", padding: "var(--vw-space-md)", marginBottom: 14, background: "var(--vw-color-neutral-50)" }}>
      {power ? <PowerOneLine /> : <SpineLeaf />}
      <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>Illustrative as-built reference · current state in Topology</Text>
    </div>
  );
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const docs = (useEntityList('documents', { pageSize: 500 }).data?.data ?? []) as unknown as DocumentRec[];
  const create = useEntityCreate('documents');
  const audit = useRecordAudit();
  const [cat, setCat] = useState<string>('All');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const counts = useMemo(() => { const c: Record<string, number> = {}; docs.forEach((d) => { c[d.type] = (c[d.type] ?? 0) + 1; }); return c; }, [docs]);
  const stats = useMemo(() => ({
    total: docs.length,
    published: docs.filter((d) => d.status === 'Published').length,
    drafts: docs.filter((d) => d.status === 'Draft' || d.status === 'In Review').length,
    needsReview: docs.filter(overdue).length,
    runbooks: docs.filter((d) => d.type === 'Runbook').length,
  }), [docs]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return docs.filter((d) => (cat === 'All' || d.type === cat) && (!s || `${d.name} ${d.summary ?? ''} ${(d.tags ?? []).join(' ')} ${d.ownerName}`.toLowerCase().includes(s)));
  }, [docs, cat, q]);
  const selDoc = sel ? docs.find((d) => d.id === sel) ?? null : null;

  const submit = async () => {
    const v = await form.validateFields();
    const id = `DOC-NEW-${Date.now().toString().slice(-4)}`; const now = new Date().toISOString();
    create.mutate({ id, docId: id, name: v.name, type: v.type, status: v.status ?? 'Draft', summary: v.summary, tags: v.tags, version: 'v1.0', ownerName: 'You', sizeKb: 120, customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' },
      { onSuccess: () => { message.success('Document added'); audit('Document', id, 'created', `Added ${v.name}`); setOpen(false); form.resetFields(); } });
  };

  const linkNav = (d: DocumentRec) => { const fn = d.linkedEntityType ? LINK_ROUTE[d.linkedEntityType] : undefined; if (fn && d.linkedEntityId) navigate(fn(d.linkedEntityId)); };

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div className="vw-page-title" role="heading" aria-level={3}>Knowledge Center</div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>New document</Button>
      </div>

      <div className="vw-grid vw-grid-cols-3 vw-gap-md" style={{ margin: '14px 0 4px' }}>
        <KPICard title="Documents" value={stats.total} icon={<FileTextOutlined />} iconTone="info" />
        <KPICard title="Published" value={stats.published} color="var(--vw-color-green-600)" icon={<CheckCircleOutlined />} iconTone="success" />
        <KPICard title="Drafts / in review" value={stats.drafts} icon={<ClockCircleOutlined />} iconTone="warning" />
        <KPICard title="Needs review" value={stats.needsReview} color={stats.needsReview ? 'var(--vw-color-orange-700)' : undefined} icon={<WarningOutlined />} iconTone="warning" />
        <KPICard title="Runbooks" value={stats.runbooks} icon={<BookOutlined />} iconTone="cyan" />
        <KPICard title="Cross-linked" value={docs.filter((d) => d.linkedEntityId).length} icon={<LinkOutlined />} iconTone="purple" />
      </div>

      {stats.needsReview > 0 && (
        <Alert type="warning" showIcon style={{ margin: '8px 0' }} message={`${stats.needsReview} document(s) are past their review date.`}
          action={<Button size="small" type="link" onClick={() => { setCat('All'); setQ(''); }}>review all</Button>} />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: "var(--vw-space-lg)", marginTop: "var(--vw-space-sm)" }}>
        {/* Category rail */}
        <VwCard size="small" title="Categories" style={{ width: 220, flexShrink: 0 }} bodyStyle={{ padding: "var(--vw-space-sm)" }}>
          {['All', ...DOC_TYPE].map((t) => (
            <div key={t} onClick={() => setCat(t)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: "var(--vw-radius-sm)", cursor: 'pointer', marginBottom: 2, fontSize: "var(--vw-font-label-md)", background: cat === t ? '#eff6ff' : 'transparent', border: `1px solid ${cat === t ? '#bfdbfe' : 'transparent'}` }}>
              <span><span style={{ color: t === 'All' ? 'var(--vw-color-gray-500)' : TYPE_META[t].color, marginRight: "var(--vw-space-sm)" }}>{t === 'All' ? <FileTextOutlined /> : TYPE_META[t].icon}</span>{t}</span>
              <VwChip style={{ marginInlineEnd: 0 }}>{t === 'All' ? docs.length : counts[t] ?? 0}</VwChip>
            </div>
          ))}
        </VwCard>

        {/* Library */}
        <div style={{ flex: 1 }}>
          <Input allowClear size="middle" prefix={<SearchOutlined />} placeholder="Search runbooks, contracts, policies…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 380, marginBottom: "var(--vw-space-md)" }} />
          {filtered.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No documents match." /> : (
            <Row gutter={[14, 14]}>
              {filtered.map((d) => {
                const meta = TYPE_META[d.type];
                return (
                  <Col key={d.id} xs={24} sm={12} xl={8}>
                    <VwCard size="small" hoverable onClick={() => setSel(d.id)} style={{ height: '100%', borderLeft: `3px solid ${meta.color}` }} bodyStyle={{ padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: "var(--vw-space-sm)" }}>
                        <Space size={8} align="start"><span style={{ color: meta.color, fontSize: "var(--vw-font-heading-md)" }}>{meta.icon}</span><Text strong style={{ fontSize: 13.5, lineHeight: 1.3 }}>{d.name}</Text></Space>
                        <VwChip color={STATUS_COLOR[d.status ?? 'Published']} style={{ marginInlineEnd: 0, flexShrink: 0 }}>{d.status}</VwChip>
                      </div>
                      {d.summary && <Paragraph type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", margin: '8px 0 6px' }} ellipsis={{ rows: 2 }}>{d.summary}</Paragraph>}
                      <Space size={4} wrap style={{ marginBottom: "var(--vw-space-sm)" }}>
                        <VwChip style={{ marginInlineEnd: 0 }}>{d.type}</VwChip>
                        {(d.tags ?? []).slice(0, 2).map((t) => <VwChip key={t} style={{ marginInlineEnd: 0 }} color="blue">{t}</VwChip>)}
                        {overdue(d) && <VwChip color="warning" style={{ marginInlineEnd: 0 }}><ClockCircleOutlined /> review due</VwChip>}
                      </Space>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: "var(--vw-font-label-xs)", color: '#a8a8a8' }}>
                        <span>{d.ownerName} · {d.version}</span>
                        {d.linkedEntityName && <span><LinkOutlined /> {d.linkedEntityName.length > 16 ? d.linkedEntityName.slice(0, 15) + '…' : d.linkedEntityName}</span>}
                      </div>
                    </VwCard>
                  </Col>
                );
              })}
            </Row>
          )}
        </div>
      </div>

      <Drawer mask={false} width={560} open={!!selDoc} onClose={() => setSel(null)} title={selDoc?.name}
        extra={selDoc && <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadDoc(selDoc)}>Download</Button>}>
        {selDoc && (
          <>
            <Space size={6} wrap style={{ marginBottom: "var(--vw-space-md)" }}>
              <VwChip color={STATUS_COLOR[selDoc.status ?? 'Published']}>{selDoc.status}</VwChip>
              <VwChip><span style={{ color: TYPE_META[selDoc.type].color }}>{TYPE_META[selDoc.type].icon}</span> {selDoc.type}</VwChip>
              <VwChip>{selDoc.version}</VwChip>
              {overdue(selDoc) && <VwChip color="warning"><ClockCircleOutlined /> review overdue</VwChip>}
            </Space>
            {selDoc.summary && <Paragraph style={{ fontSize: "var(--vw-font-label-md)" }}>{selDoc.summary}</Paragraph>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: "var(--vw-font-label-md)", margin: '8px 0 12px' }}>
              <div><Text type="secondary">Owner</Text><div>{selDoc.ownerName}</div></div>
              <div><Text type="secondary">Updated</Text><div>{selDoc.updatedAt?.slice(0, 10)}</div></div>
              {selDoc.reviewDueAt && <div><Text type="secondary">Review due</Text><div style={{ color: overdue(selDoc) ? 'var(--vw-color-orange-700)' : undefined }}>{selDoc.reviewDueAt.slice(0, 10)}</div></div>}
              <div><Text type="secondary">Size</Text><div>{fmtSize(selDoc.sizeKb)}</div></div>
            </div>
            {(selDoc.tags ?? []).length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: "var(--vw-space-md)" }}>{selDoc.tags!.map((t) => <VwChip key={t} color="blue">{t}</VwChip>)}</div>}
            {selDoc.linkedEntityName && (
              <VwCard size="small" style={{ marginBottom: "var(--vw-space-md)" }} bodyStyle={{ padding: '8px 12px' }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontSize: "var(--vw-font-label-md)" }}><LinkOutlined /> Linked to <Text strong>{selDoc.linkedEntityName}</Text> <Text type="secondary">({selDoc.linkedEntityType})</Text></span>
                  {selDoc.linkedEntityType && LINK_ROUTE[selDoc.linkedEntityType] && selDoc.linkedEntityId && <Button size="small" type="link" onClick={() => linkNav(selDoc)}>Open →</Button>}
                </Space>
              </VwCard>
            )}
            {selDoc.type === 'Diagram' && <DiagramFigure name={selDoc.name} />}
            {(selDoc.sections ?? []).map((sec, i) => (
              <div key={i} style={{ marginBottom: "var(--vw-space-md)" }}>
                <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>{sec.heading}</Text>
                <Paragraph style={{ fontSize: "var(--vw-font-label-md)", margin: '4px 0 0', color: '#515151' }}>{sec.body}</Paragraph>
              </div>
            ))}
            {selDoc.type === 'Runbook' && (selDoc.steps ?? []).length > 0 && (
              <>
                <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>Procedure</Text>
                <div style={{ marginTop: "var(--vw-space-sm)" }}>
                  {selDoc.steps!.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? '1px solid #f4f4f4' : 'none' }}>
                      <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: "var(--vw-color-blue-50)", color: 'var(--primaryColor500)', fontSize: "var(--vw-font-label-xs)", fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                      <span style={{ fontSize: "var(--vw-font-label-md)", color: '#252525' }}>{s}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </Drawer>

      <Modal title="New document" open={open} onOk={submit} okText="Add" onCancel={() => setOpen(false)} confirmLoading={create.isPending}>
        <Form form={form} layout="vertical" initialValues={{ type: 'Runbook', status: 'Draft' }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="e.g. Power failure response" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="type" label="Type" rules={[{ required: true }]}><Select placeholder="Select type" options={DOC_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="status" label="Status"><Select placeholder="Select status" options={DOC_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item></Col>
          </Row>
          <Form.Item name="summary" label="Summary"><Input.TextArea placeholder="Enter summary" autoSize={{ minRows: 2, maxRows: 3 }} /></Form.Item>
          <Form.Item name="tags" label="Tags"><Select mode="tags" tokenSeparators={[',']} placeholder="add tags" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
