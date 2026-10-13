/** Templates — /planning/templates(/:templateId) (a tab of the Planner hub). What a plan starts from,
    in three plain views: plan types, site types, and building blocks for advanced users. A row opens a
    drawer that answers four questions: what it asks for, what it checks, what you get, who approves.
    The selected template lives in the URL; nothing here redirects, so tab switching stays free. */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Drawer, Input, InputNumber, Modal, Select, Switch, Tooltip } from 'antd';
import type { TableColumnType } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable } from '../../../shared/components/vw/VwTable';
import { VwCard, VwChip, VwSegmented, EmptyState } from '../../../shared/components/ux';
import { SearchOutlined, EditOutlined, CheckOutlined, CloseOutlined, BranchesOutlined, CheckCircleOutlined, StopOutlined, PlusOutlined, RightOutlined } from '../../../shared/icons';
import { DC_TYPE_CATALOG } from '../../../mock/data/dcTypes';
import type * as T from '../../../mock/data/types';
import { useVwPalette } from '../../site360/lib/siteModel';
import { ASPECT_LABEL, fmtKw, resolveTemplate } from '../lib/engine';
import { usePlannerActions, usePlans, useTemplates } from '../lib/usePlanner';
import { StatusChip } from '../components/kit';
import { TemplateStatusChip, StackBar } from '../components/hub/visuals';
import { RuleKind, SectionIntro } from '../components/library/parts';
import { COOLING_LABEL, RULE_PLAIN, fmtVal } from '../components/library/labels';

type View = 'plans' | 'sites' | 'blocks';
const BLOCK_KINDS: T.PlannerTemplateKind[] = ['aspect', 'ruleset', 'demand', 'document', 'checklist', 'benchmarkset', 'blueprint'];
const BLOCK_LABEL: Partial<Record<T.PlannerTemplateKind, string>> = { aspect: 'Design module', ruleset: 'Rule set', demand: 'Demand profile', document: 'Document', checklist: 'Checklist', benchmarkset: 'Benchmark set', blueprint: 'Blueprint' };
const fmtDefault = (p: T.PlannerParamDef) => {
  const v = p.default;
  if (v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (p.key === 'coolingType') return COOLING_LABEL[v as T.PlannerCoolingType] ?? String(v);
  if (p.key === 'feedVoltage') return `${Number(v) / 1000} kV`;
  if (p.key === 'uplinkGbps') return `${v} Gbps`;
  if (p.key === 'commissioningLevel') return `Level ${v}`;
  return typeof v === 'number' ? fmtVal(v) : String(v);
};
const range = (r: [number, number | null] | null | undefined, f: (n: number) => string) => (!r ? '—' : r[1] === null ? `${f(r[0])}+` : `${f(r[0])} – ${f(r[1])}`);

export default function TemplatesPage({ embedded = false }: { embedded?: boolean }) {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const templates = useTemplates(); const plans = usePlans();
  const [view, setView] = useState<View>('plans');
  const [q, setQ] = useState('');

  const match = (t: T.PlannerTemplate) => { const s = q.trim().toLowerCase(); return !s || `${t.name} ${t.description}`.toLowerCase().includes(s); };
  const planTypes = useMemo(() => templates.filter(t => t.kind === 'plan' && match(t)).sort((a, b) => Number(!!a.inheritsFrom) - Number(!!b.inheritsFrom) || a.name.localeCompare(b.name)), [templates, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocks = useMemo(() => templates.filter(t => BLOCK_KINDS.includes(t.kind) && match(t)).sort((a, b) => BLOCK_KINDS.indexOf(a.kind) - BLOCK_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name)), [templates, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const profiles = useMemo(() => new Map(templates.filter(t => t.kind === 'profile').map(t => [t.dcTypeKey, t])), [templates]);
  const sites = useMemo(() => DC_TYPE_CATALOG.filter(p => { const s = q.trim().toLowerCase(); return !s || `${p.name} ${p.description}`.toLowerCase().includes(s); }), [q]);
  const usage = useMemo(() => { const m = new Map<string, number>(); for (const p of plans) { m.set(p.templateId, (m.get(p.templateId) ?? 0) + 1); m.set(`type:${p.dcTypeKey}`, (m.get(`type:${p.dcTypeKey}`) ?? 0) + 1); } return m; }, [plans]);
  const byId = useMemo(() => new Map(templates.map(t => [t.id, t])), [templates]);

  const open = (id: string) => navigate(`/planning/templates/${id}`);
  const selected = templateId ? byId.get(templateId) : undefined;

  const planCols: TableColumnType<T.PlannerTemplate>[] = [
    { title: 'Plan type', render: (_: unknown, t) => (
      <div style={{ minWidth: 0, whiteSpace: 'normal' }}>
        <div style={{ fontWeight: 500 }}>{t.name}</div>
        <div className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>{t.inheritsFrom ? `Site variant of ${byId.get(t.inheritsFrom)?.name ?? 'a standard'} · ` : ''}{t.description}</div>
      </div>
    ) },
    { title: 'Covers', width: 170, render: (_: unknown, t) => { const full = t.requiredAspects.filter(x => x.depth === 'full').length, sum = t.requiredAspects.filter(x => x.depth === 'summary').length; return <Tooltip title={t.requiredAspects.filter(x => x.depth !== 'skipped').map(x => ASPECT_LABEL[x.aspect]).join(', ')}><span>{full} areas in full{sum ? <span className="vw-text-tertiary">, {sum} brief</span> : ''}</span></Tooltip>; } },
    { title: 'Becomes', width: 120, render: (_: unknown, t) => (t.executesAs ? `A ${t.executesAs}` : '—') },
    { title: 'Approved by', width: 260, render: (_: unknown, t) => <span style={{ fontSize: 'var(--vw-font-label-sm)', whiteSpace: 'normal' }}>{t.approvalPath.join(' → ') || 'No approval'}</span> },
    { title: 'Plans', width: 70, align: 'right', render: (_: unknown, t) => usage.get(t.id) ?? 0 },
    { title: 'Status', width: 110, render: (_: unknown, t) => <TemplateStatusChip status={t.status} /> },
  ];
  type SiteRow = (typeof DC_TYPE_CATALOG)[number];
  const siteCols: TableColumnType<SiteRow>[] = [
    { title: 'Site type', render: (_: unknown, p) => <div><div style={{ fontWeight: 500 }}>{p.name}</div><div className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>{p.segment}</div></div> },
    { title: 'Typical size', width: 140, render: (_: unknown, p) => range(p.powerKw, fmtKw) },
    { title: 'Racks', width: 120, render: (_: unknown, p) => range(p.typicalRacks, n => n.toLocaleString('en-US')) },
    { title: 'kW per rack', width: 110, render: (_: unknown, p) => (p.kwPerRack ? `${p.kwPerRack[0]} – ${p.kwPerRack[1]}` : '—') },
    { title: 'Cooling', width: 220, render: (_: unknown, p) => <span style={{ whiteSpace: 'normal' }}>{p.cooling}</span> },
    { title: 'Tier', width: 90, render: (_: unknown, p) => p.defaultTier },
    { title: 'PUE target', width: 100, align: 'right', render: (_: unknown, p) => p.pueTarget ?? '—' },
    { title: 'Plans', width: 70, align: 'right', render: (_: unknown, p) => usage.get(`type:${p.key}`) ?? 0 },
  ];
  const blockCols: TableColumnType<T.PlannerTemplate>[] = [
    { title: 'Name', render: (_: unknown, t) => <div style={{ whiteSpace: 'normal' }}><div style={{ fontWeight: 500 }}>{t.name}</div><div className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>{t.description}</div></div> },
    { title: 'Kind', width: 150, render: (_: unknown, t) => <VwChip variant="neutral">{BLOCK_LABEL[t.kind] ?? t.kind}</VwChip> },
    { title: 'Status', width: 110, render: (_: unknown, t) => <TemplateStatusChip status={t.status} /> },
  ];

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      {!embedded && <div className="vw-card-section"><div className="vw-page-title" role="heading" aria-level={3}>Templates</div></div>}
      <div className="vw-flex vw-justify-between vw-items-center vw-wrap vw-gap-sm">
        <VwSegmented<View> value={view} onChange={setView} options={[
          { label: `Plan types · ${templates.filter(t => t.kind === 'plan').length}`, value: 'plans' },
          { label: `Site types · ${DC_TYPE_CATALOG.length}`, value: 'sites' },
          { label: `Building blocks · ${templates.filter(t => BLOCK_KINDS.includes(t.kind)).length}`, value: 'blocks' },
        ]} />
        <Input allowClear prefix={<SearchOutlined />} placeholder="Search templates" value={q} onChange={e => setQ(e.target.value)} style={{ width: 260 }} />
      </div>

      <VwCard>
        {view === 'plans' && <>
          <SectionIntro title="Plan types">Pick one when you start a plan. It decides which areas you must cover, what the approved plan becomes and who approves it. Open one to see its inputs and checks.</SectionIntro>
          <div style={{ marginTop: 12 }}>{planTypes.length ? <VwTable<T.PlannerTemplate> size="small" rowKey="id" pagination={false} columns={planCols} dataSource={planTypes} onRow={t => ({ onClick: () => open(t.id), style: { cursor: 'pointer' } })} /> : <EmptyState variant="no-results" entity="plan types" />}</div>
        </>}
        {view === 'sites' && <>
          <SectionIntro title="Site types">The kind of site being planned. It sets typical size, density, cooling, tier and PUE, and the benchmarks that apply.</SectionIntro>
          <div style={{ marginTop: 12 }}><VwTable<SiteRow> size="small" rowKey="key" pagination={false} columns={siteCols} dataSource={sites} onRow={p => ({ onClick: () => { const t = profiles.get(p.key); if (t) open(t.id); }, style: { cursor: 'pointer' } })} /></div>
        </>}
        {view === 'blocks' && <>
          <SectionIntro title="Building blocks">For template owners. Reusable design modules, rule sets, demand profiles, documents and checklists that plan types are built from.</SectionIntro>
          <div style={{ marginTop: 12 }}>{blocks.length ? <VwTable<T.PlannerTemplate> size="small" rowKey="id" pagination={false} columns={blockCols} dataSource={blocks} onRow={t => ({ onClick: () => open(t.id), style: { cursor: 'pointer' } })} /> : <EmptyState variant="no-results" entity="building blocks" />}</div>
        </>}
      </VwCard>

      <TemplateDrawer t={selected} all={templates} onClose={() => navigate('/planning/templates')} />
    </div>
  );
}

/* ------------------------------------------------------------------ drawer */
function TemplateDrawer({ t, all, onClose }: { t?: T.PlannerTemplate; all: T.PlannerTemplate[]; onClose: () => void }) {
  const navigate = useNavigate(); const { message } = App.useApp(); const pal = useVwPalette();
  const actions = usePlannerActions(); const plans = usePlans();
  const [cloneOpen, setCloneOpen] = useState(false); const [cloneName, setCloneName] = useState('');
  const resolved = useMemo(() => (t ? resolveTemplate(t.id, all) : null), [t, all]);
  const params = useMemo(() => {
    const all = resolved?.params ?? t?.params ?? [];
    if (t?.kind !== 'plan' || !t.requiredAspects.length) return all;
    const covered = new Set(t.requiredAspects.filter(a => a.depth !== 'skipped').map(a => a.aspect));
    return all.filter(p => covered.has(p.aspect));
  }, [resolved, t]);
  const rules = resolved?.rules ?? t?.rules ?? [];
  const groups = useMemo(() => { const by = new Map<T.PlannerAspect, T.PlannerParamDef[]>(); for (const p of params) by.set(p.aspect, [...(by.get(p.aspect) ?? []), p]); return [...by.entries()]; }, [params]);
  const used = useMemo(() => (t ? plans.filter(p => p.templateId === t.id || (t.kind === 'profile' && p.dcTypeKey === t.dcTypeKey)) : []), [plans, t]);
  if (!t) return <Drawer open={false} onClose={onClose} />;
  const editable = t.status === 'draft';
  const parent = t.inheritsFrom ? all.find(x => x.id === t.inheritsFrom) : undefined;
  const profile = t.kind === 'profile' ? DC_TYPE_CATALOG.find(p => p.key === t.dcTypeKey) : undefined;

  const doClone = () => { const name = cloneName.trim(); if (!name) return; const rec = actions.cloneTemplate(t, name); setCloneOpen(false); message.success(`Created ${rec.name} as a draft`); navigate(`/planning/templates/${rec.id}`); };
  const setStatus = (status: T.PlannerTemplate['status']) => { actions.saveTemplate({ ...t, status }); message.success(`${t.name} is now ${status}`); };
  const saveDefault = (p: T.PlannerParamDef, value: number | string | boolean) => {
    const own = t.params.some(x => x.key === p.key);
    actions.saveTemplate({ ...t, params: own ? t.params.map(x => (x.key === p.key ? { ...x, default: value } : x)) : [...t.params, { ...p, default: value }] });
    message.success(`${p.label} set to ${String(value)}`);
  };

  return (
    <Drawer open onClose={onClose} width={760} destroyOnHidden
      title={<div className="vw-flex vw-items-center vw-gap-sm vw-wrap"><span>{t.name}</span><TemplateStatusChip status={t.status} /><VwChip variant="neutral">v{t.version}</VwChip></div>}
      extra={<div className="vw-flex vw-gap-sm">
        {t.kind === 'plan' && t.status === 'published' && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/planning/new?scope=${t.scope ?? ''}&template=${t.id}`)}>Start a plan</Button>}
        <Button icon={<BranchesOutlined />} onClick={() => { setCloneName(`${t.name} · site variant`); setCloneOpen(true); }}>Make a variant</Button>
        {t.status === 'draft' && <Button icon={<CheckCircleOutlined />} onClick={() => setStatus('published')}>Publish</Button>}
        {t.status === 'published' && <Tooltip title="Retired templates stay readable but cannot start new plans"><Button icon={<StopOutlined />} onClick={() => setStatus('deprecated')}>Retire</Button></Tooltip>}
      </div>}>
      <div className="vw-flex vw-flex-col vw-gap-lg">
        <div>
          <div className="vw-card-description">{t.description}</div>
          <div className="vw-text-tertiary vw-flex vw-gap-md vw-wrap" style={{ fontSize: 'var(--vw-font-label-xs)', marginTop: 6 }}>
            <span>Owner {t.ownerName}</span><span>Applies to {t.appliesTo.label}</span>
            {parent && <span className="vw-flex vw-items-center vw-gap-xs">Based on <a onClick={() => navigate(`/planning/templates/${parent.id}`)}>{parent.name}</a></span>}
          </div>
        </div>

        {profile && (
          <Section title="Typical site">
            <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <Fact label="Size" value={range(profile.powerKw, fmtKw)} /><Fact label="Racks" value={range(profile.typicalRacks, n => n.toLocaleString('en-US'))} /><Fact label="kW per rack" value={profile.kwPerRack ? `${profile.kwPerRack[0]} – ${profile.kwPerRack[1]}` : '—'} />
              <Fact label="Cooling" value={profile.cooling} /><Fact label="Redundancy" value={profile.redundancy} /><Fact label="Tier and PUE" value={`${profile.defaultTier} · ${profile.pueTarget ?? '—'}`} />
            </div>
          </Section>
        )}

        {t.kind === 'demand' && t.demand && (
          <Section title="Workload mix and phasing">
            <StackBar parts={[{ label: 'GPU', pct: t.demand.gpuPct, color: pal.violet }, { label: 'Compute', pct: t.demand.computePct, color: pal.blue }, { label: 'Storage', pct: t.demand.storagePct, color: pal.cyan }]} />
            <div className="vw-flex vw-gap-sm vw-wrap" style={{ marginTop: 10 }}>{t.demand.phases.map(p => <VwChip key={p.name} variant="neutral">{p.name}: {p.sharePct}% at month {p.monthsFromStart}</VwChip>)}</div>
          </Section>
        )}

        {params.length > 0 && (
          <Section title={`What it asks for · ${params.length} inputs, all pre-filled`} note={editable ? 'This is a draft: you can change defaults here.' : 'Defaults are locked on a published template so existing plans stay reproducible. Make a variant to change them.'}>
            <div className="vw-flex vw-flex-col vw-gap-md">
              {groups.map(([aspect, ps]) => (
                <div key={aspect}>
                  <div className="vw-card-metric-label" style={{ marginBottom: 4 }}>{ASPECT_LABEL[aspect]}</div>
                  <div className="vw-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 24 }}>
                    {ps.map(p => (
                      <div key={p.key} className="vw-flex vw-justify-between vw-items-center vw-gap-sm" style={{ padding: '5px 0', borderBottom: '1px solid var(--vw-color-slate-100)' }}>
                        <Tooltip title={p.help}><span style={{ minWidth: 0 }}>{p.label}</span></Tooltip>
                        <DefaultValue p={p} editable={editable} onSave={v => saveDefault(p, v)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {rules.length > 0 && (
          <Section title={`What it checks · ${rules.filter(r => r.severity === 'hard').length} must, ${rules.filter(r => r.severity === 'soft').length} should`}>
            <div className="vw-flex vw-flex-col">
              {[...rules].sort((a, b) => a.severity.localeCompare(b.severity)).map(r => (
                <div key={r.id} className="vw-flex vw-items-center vw-gap-sm" style={{ padding: '6px 0', borderBottom: '1px solid var(--vw-color-slate-100)' }}>
                  <RuleKind severity={r.severity} />
                  <span style={{ flex: 1, minWidth: 0 }}>{RULE_PLAIN[r.check] ?? r.title}</span>
                  {r.standard && <span className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>{r.standard}</span>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {t.outputs.length > 0 && (
          <Section title="What you get">
            <div className="vw-flex vw-gap-sm vw-wrap">{t.outputs.map(o => <VwChip key={o} variant="info">{o}</VwChip>)}</div>
          </Section>
        )}

        {t.approvalPath.length > 0 && (
          <Section title="Who approves">
            <div className="vw-flex vw-items-center vw-gap-xs vw-wrap">{t.approvalPath.map((s, i) => <span key={s} className="vw-flex vw-items-center vw-gap-xs"><VwChip variant="neutral">{i + 1}. {s}</VwChip>{i < t.approvalPath.length - 1 && <RightOutlined className="vw-text-tertiary" style={{ fontSize: 10 }} />}</span>)}</div>
            {t.executesAs && <div className="vw-card-description" style={{ marginTop: 8 }}>Once approved it becomes a {t.executesAs}{t.blueprintKey ? ` built from the ${t.blueprintKey.replace(/-/g, ' ')} blueprint` : ''}.</div>}
          </Section>
        )}

        {t.items?.length ? (
          <Section title={t.kind === 'checklist' ? 'Checklist items' : 'Sections'}>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>{t.items.map(i => <li key={i}>{i}</li>)}</ol>
          </Section>
        ) : null}

        <Section title={`Used by · ${used.length} plan(s)`}>
          {used.length ? used.map(p => (
            <div key={p.id} className="vw-flex vw-justify-between vw-items-center vw-gap-sm" style={{ padding: '5px 0', borderBottom: '1px solid var(--vw-color-slate-100)' }}>
              <a onClick={() => navigate(`/planning/plans/${p.id}`)}>{p.title}</a><StatusChip status={p.status} />
            </div>
          )) : <span className="vw-text-tertiary">No plan uses it yet.</span>}
        </Section>
      </div>

      <Modal title="Make a variant" open={cloneOpen} onOk={doClone} onCancel={() => setCloneOpen(false)} okText="Create draft" okButtonProps={{ disabled: !cloneName.trim() }}>
        <div className="vw-flex vw-flex-col vw-gap-sm">
          <div className="vw-card-description">The variant copies everything from <b>{t.name}</b>. Change only what differs for your site or region, then publish it.</div>
          <Input autoFocus value={cloneName} onChange={e => setCloneName(e.target.value)} onPressEnter={doClone} />
        </div>
      </Modal>
    </Drawer>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <div><SectionIntro title={title}>{note ?? ''}</SectionIntro><div style={{ marginTop: 10 }}>{children}</div></div>;
}
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="vw-card-child" style={{ padding: '8px 12px' }}><div className="vw-card-metric-label">{label}</div><div style={{ fontWeight: 500 }}>{value}</div></div>;
}

/** Default value, editable in place on draft templates. */
function DefaultValue({ p, editable, onSave }: { p: T.PlannerParamDef; editable: boolean; onSave: (v: number | string | boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<number | string | boolean | undefined>(p.default);
  const unit = p.unit && typeof p.default === 'number' ? ` ${p.unit}` : '';
  if (!editing) return (
    <span className="vw-flex vw-items-center vw-gap-xs" style={{ whiteSpace: 'nowrap' }}>
      <b>{fmtDefault(p)}</b><span className="vw-text-tertiary">{unit}</span>
      {editable && <Button type="text" size="small" icon={<EditOutlined />} aria-label={`Change ${p.label}`} onClick={() => { setVal(p.default); setEditing(true); }} />}
    </span>
  );
  const commit = () => { if (val === undefined || val === '') return; onSave(val); setEditing(false); };
  return (
    <span className="vw-flex vw-items-center vw-gap-xs">
      {p.type === 'number' && <InputNumber size="small" autoFocus value={typeof val === 'number' ? val : undefined} min={p.min} max={p.max} onChange={v => setVal(v ?? undefined)} onPressEnter={commit} style={{ width: 100 }} />}
      {p.type === 'select' && <Select size="small" autoFocus value={String(val ?? '')} options={(p.options ?? []).map(o => ({ label: o, value: o }))} onChange={v => setVal(v)} style={{ width: 140 }} />}
      {p.type === 'bool' && <Switch size="small" checked={val === true} onChange={v => setVal(v)} />}
      {p.type === 'text' && <Input size="small" autoFocus value={String(val ?? '')} onChange={e => setVal(e.target.value)} onPressEnter={commit} style={{ width: 140 }} />}
      <Button type="text" size="small" icon={<CheckOutlined />} aria-label="Save" onClick={commit} />
      <Button type="text" size="small" icon={<CloseOutlined />} aria-label="Cancel" onClick={() => setEditing(false)} />
    </span>
  );
}
