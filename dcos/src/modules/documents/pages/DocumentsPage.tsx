import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Row, Col, Typography, Input, Modal, Form, Select, Drawer, Space } from 'antd';
import { Clock, FileSearch, FolderOpen, Plus } from 'lucide-react';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { VwChip } from '../../../shared/components/ux';
import {
  BookOutlined, PartitionOutlined, FileProtectOutlined, BarChartOutlined, SafetyCertificateOutlined,
  FileDoneOutlined, ClockCircleOutlined, LinkOutlined, FileTextOutlined, DownloadOutlined,
} from '../../../shared/icons';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, Panel, SearchBox } from '../../../ops/ui/kit';
import { Facts, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { DOC_TYPE, DOC_STATUS } from '../../../mock/data/enums';
import type { DocumentRec } from '../../../mock/data/types';
import './DocumentsPage.css';

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
const STATUS_TONE: Record<string, Tone> = { Published: 'success', Draft: 'neutral', 'In Review': 'warning', Archived: 'neutral' };
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
  const [filter, setFilter] = useState<'all' | 'published' | 'drafts' | 'overdue' | 'linked'>('all');
  const toggleFilter = (next: typeof filter) => setFilter(current => current === next ? 'all' : next);
  const clearFilters = () => { setFilter('all'); setCat('All'); setQ(''); };
  const filterLabels = { all: 'All documents', published: 'Published documents', drafts: 'Drafts and documents in review', overdue: 'Documents overdue for review', linked: 'Documents linked to a record' };
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
    return docs.filter((d) => (filter === 'all' || (filter === 'published' && d.status === 'Published') || (filter === 'drafts' && (d.status === 'Draft' || d.status === 'In Review')) || (filter === 'overdue' && overdue(d)) || (filter === 'linked' && !!d.linkedEntityId)) && (cat === 'All' || d.type === cat) && (!s || `${d.name} ${d.summary ?? ''} ${(d.tags ?? []).join(' ')} ${d.ownerName}`.toLowerCase().includes(s)));
  }, [docs, cat, q, filter]);
  const selDoc = sel ? docs.find((d) => d.id === sel) ?? null : null;

  const submit = async () => {
    const v = await form.validateFields();
    const id = `DOC-NEW-${Date.now().toString().slice(-4)}`; const now = new Date().toISOString();
    create.mutate({ id, docId: id, name: v.name, type: v.type, status: v.status ?? 'Draft', summary: v.summary, tags: v.tags, version: 'v1.0', ownerName: 'You', sizeKb: 120, customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' },
      { onSuccess: () => { message.success('Document added'); audit('Document', id, 'created', `Added ${v.name}`); setOpen(false); form.resetFields(); } });
  };

  const linkNav = (d: DocumentRec) => { const fn = d.linkedEntityType ? LINK_ROUTE[d.linkedEntityType] : undefined; if (fn && d.linkedEntityId) navigate(fn(d.linkedEntityId)); };

  const statusParts = DOC_STATUS.map((st) => ({ key: st, label: st, n: docs.filter((d) => (d.status ?? 'Published') === st).length, tone: STATUS_TONE[st] ?? 'neutral' })).filter((p) => p.n > 0);
  const linked = docs.filter((d) => d.linkedEntityId).length;

  return (
    <OpsPage title="Knowledge Center" description="Runbooks, diagrams, contracts, policies and evidence — searchable, versioned and linked to the records they describe."
      actions={<Btn variant="filled" icon={Plus} onClick={() => { form.resetFields(); setOpen(true); }}>New document</Btn>}>

      <StatGrid>
        <StatTile label="Documents" value={stats.total} sub={`${DOC_TYPE.length} categories`} onClick={clearFilters} active={filter === 'all' && cat === 'All' && !q}>
          <Split parts={statusParts} />
        </StatTile>
        <StatTile label="Published" value={stats.published} sub={stats.total ? `${Math.round((stats.published / stats.total) * 100)}% of the library` : 'nothing yet'} onClick={() => toggleFilter('published')} active={filter === 'published'} />
        <StatTile label="Drafts / in review" value={stats.drafts} sub="not yet published" onClick={() => toggleFilter('drafts')} active={filter === 'drafts'} />
        <StatTile label="Needs review" value={stats.needsReview} sub={stats.needsReview ? 'past their review date' : 'all reviews current'} subTone={stats.needsReview ? 'warn' : undefined}
          onClick={() => { setCat('All'); setQ(''); toggleFilter('overdue'); }} active={filter === 'overdue'} />
        <StatTile label="Runbooks" value={stats.runbooks} sub="operational procedures" onClick={() => setCat(cat === 'Runbook' ? 'All' : 'Runbook')} active={cat === 'Runbook'} />
        <StatTile label="Cross-linked" value={linked} sub="linked to a record" onClick={() => toggleFilter('linked')} active={filter === 'linked'}>
          <Facts items={[{ n: docs.length - linked, label: 'standalone' }]} />
        </StatTile>
      </StatGrid>

      <div className="kc-layout">
        {/* Category rail */}
        <Panel title="Categories" icon={FolderOpen} className="kc-rail">
          <div className="kc-cats">
            {['All', ...DOC_TYPE].map((t) => (
              <button key={t} type="button" className={`kc-cat${cat === t ? ' is-on' : ''}`} onClick={() => setCat(t)} aria-pressed={cat === t}>
                <span className="kc-cat-ico" style={{ color: t === 'All' ? 'var(--vw-color-slate-500)' : TYPE_META[t].color }}>{t === 'All' ? <FileTextOutlined /> : TYPE_META[t].icon}</span>
                <span className="kc-cat-l">{t}</span>
                <span className="num kc-cat-n">{t === 'All' ? docs.length : counts[t] ?? 0}</span>
              </button>
            ))}
          </div>
        </Panel>

        {/* Library */}
        <Panel title={cat === 'All' ? 'All documents' : cat} sub={`Showing ${filtered.length} of ${docs.length} documents`} icon={FileSearch}
          actions={<SearchBox value={q} onChange={setQ} placeholder="Search runbooks, contracts, policies…" width={300} />}>
          {(filter !== 'all' || cat !== 'All' || q) && <div className="kc-filter-summary" role="status">
            <span>{filterLabels[filter]}{cat !== 'All' ? ` · ${cat}` : ''}{q ? ` · “${q}”` : ''}</span>
            <Btn variant="ghost" onClick={clearFilters}>Clear filters</Btn>
          </div>}
          {filtered.length === 0 ? <Empty icon={FileSearch} title="No documents match" action={<Btn onClick={clearFilters}>Clear filters</Btn>}>Try another category or search term.</Empty> : (
            <div className="grid g-3 kc-docs">
              {filtered.map((d) => {
                const meta = TYPE_META[d.type];
                return (
                  <button key={d.id} type="button" className="doc-card" onClick={() => setSel(d.id)} style={{ ['--c' as string]: meta.color }}>
                    <div className="doc-card-top">
                      <span className="doc-ico">{meta.icon}</span>
                      <span className="doc-name">{d.name}</span>
                      <Chip tone={STATUS_TONE[d.status ?? 'Published'] ?? 'neutral'} dot>{d.status}</Chip>
                    </div>
                    {d.summary && <p className="doc-sum">{d.summary}</p>}
                    <div className="doc-chips">
                      <Chip tone="neutral" size="xs">{d.type}</Chip>
                      {(d.tags ?? []).slice(0, 2).map((t) => <Chip key={t} tone="info" size="xs">{t}</Chip>)}
                      {overdue(d) && <Chip tone="warning" size="xs"><Clock size={11} /> review due</Chip>}
                    </div>
                    <div className="doc-foot">
                      <span>{d.ownerName} · {d.version}</span>
                      {d.linkedEntityName && <span><LinkOutlined /> {d.linkedEntityName.length > 16 ? d.linkedEntityName.slice(0, 15) + '…' : d.linkedEntityName}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
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
              <div className="note note--info" style={{ marginBottom: "var(--vw-space-md)", alignItems: 'center', justifyContent: 'space-between' }}>
                <span><LinkOutlined /> Linked to <Text strong>{selDoc.linkedEntityName}</Text> <Text type="secondary">({selDoc.linkedEntityType})</Text></span>
                {selDoc.linkedEntityType && LINK_ROUTE[selDoc.linkedEntityType] && selDoc.linkedEntityId && <Button size="small" type="link" onClick={() => linkNav(selDoc)}>Open →</Button>}
              </div>
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
    </OpsPage>
  );
}
