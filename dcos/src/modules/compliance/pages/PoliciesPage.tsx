import { useMemo, useState } from 'react';
import { App, Drawer, Form, Input, Modal, Select, Space, Typography } from 'antd';
import { Code, Plus } from 'lucide-react';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { POLICY_CATEGORY, ENFORCEMENT } from '../../../mock/data/enums';
import type { Policy, PolicyDecision, ComplianceControl } from '../../../mock/data/types';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Toggle } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import type { Tone } from '../../../ops/ui/Analytics';

const { Text, Paragraph } = Typography;
const ENF_TONE: Record<string, Tone> = { Block: 'error', Warn: 'orange', Audit: 'neutral' };

const DECISION_TONE: Record<string, Tone> = { deny: 'error', warn: 'orange' };
const DECISION_COLS: Col<PolicyDecision>[] = [
  { key: 'resource', header: 'Resource', render: (d) => d.resourceName },
  { key: 'decision', header: 'Decision', render: (d) => <Chip tone={DECISION_TONE[d.decision] ?? 'success'} dot>{d.decision}</Chip> },
  { key: 'when', header: 'When', render: (d) => <span className="num">{d.evaluatedAt.slice(0, 10)}</span> },
];

const REGO_EXAMPLES: Record<string, string> = {
  'Rack power budget': `package dcos.rack.power\n\ndefault allow := false\nallow { input.rack.powerUtilizationPct <= 90 }\n\nviolation[msg] {\n\tinput.rack.powerUtilizationPct > 90\n\tmsg := sprintf("Rack %s at %d%% exceeds the 90%% power budget", [input.rack.name, input.rack.powerUtilizationPct])\n}`,
  'N+1 redundancy': `package dcos.rack.redundancy\n\nallowed := {"N+1", "2N", "2N+1"}\n\nviolation[msg] {\n\tnot allowed[input.rack.redundancy]\n\tmsg := sprintf("Rack %s redundancy %q violates the N+1 minimum", [input.rack.name, input.rack.redundancy])\n}`,
  'Subnet IP reserve': `package dcos.ipam.subnet\n\nviolation[msg] {\n\tinput.subnet.utilizationPct > 85\n\tmsg := sprintf("Subnet %s at %d%% breaches the 15%% reserve", [input.subnet.cidr, input.subnet.utilizationPct])\n}`,
  'GPU liquid cooling': `package dcos.rack.cooling\n\nviolation[msg] {\n\tinput.rack.purpose == "GPU"\n\tnot input.rack.liquidCoolingReady\n\tmsg := sprintf("GPU rack %s is not liquid-cooling ready", [input.rack.name])\n}`,
};

export default function PoliciesPage() {
  const { message } = App.useApp();
  const policies = (useEntityList('policies', { pageSize: 100 }).data?.data ?? []) as unknown as Policy[];
  const decisions = (useEntityList('policyDecisions', { pageSize: 500 }).data?.data ?? []) as unknown as PolicyDecision[];
  const controls = (useEntityList('complianceControls', { pageSize: 200 }).data?.data ?? []) as unknown as ComplianceControl[];
  const create = useEntityCreate('policies');
  const update = useEntityUpdate('policies');
  const recordAudit = useRecordAudit();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Policy | null>(null);
  const [form] = Form.useForm();

  function submit() {
    form.validateFields().then((v) => {
      const now = new Date().toISOString();
      create.mutate({
        polId: `POL-${Date.now().toString().slice(-5)}`, name: v.name, category: v.category,
        enforcement: v.enforcement, regoPackage: v.regoPackage, rego: v.rego, rule: v.rule ?? '', active: true, controlRefs: v.controlRefs ?? [],
        customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me',
      }, {
        onSuccess: () => { recordAudit('Policy', v.name, 'created', `Authored policy ${v.name}`); message.success('Policy created'); setOpen(false); form.resetFields(); },
      });
    });
  }

  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('');
  const [enfF, setEnfF] = useState('');
  const [activeF, setActiveF] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return policies.filter((p) => (!catF || p.category === catF) && (!enfF || p.enforcement === enfF) && (!activeF || String(p.active) === activeF)
      && (!s || `${p.name} ${p.category} ${p.regoPackage ?? ''} ${(p.controlRefs ?? []).join(' ')}`.toLowerCase().includes(s)));
  }, [policies, q, catF, enfF, activeF]);

  const cols: Col<Policy>[] = [
    { key: 'name', header: 'Policy', sort: (p) => p.name, render: (p) => (
      <span className="cell-2"><span className="vw-card-activity-label">{p.name}</span><small>{p.category}</small></span>
    ) },
    { key: 'package', header: 'Package', sort: (p) => p.regoPackage ?? '', render: (p) => p.regoPackage ? <code style={{ fontSize: 'var(--vw-font-label-sm)' }}>{p.regoPackage}</code> : <span className="vw-label">—</span> },
    { key: 'enforcement', header: 'Enforcement', sort: (p) => p.enforcement, render: (p) => <Chip tone={ENF_TONE[p.enforcement] ?? 'neutral'} dot>{p.enforcement}</Chip> },
    { key: 'controls', header: 'Controls', wrap: true, render: (p) => (p.controlRefs ?? []).length ? <span className="row wrap" style={{ gap: 4 }}>{(p.controlRefs ?? []).map((x) => <Chip key={x} size="xs">{x}</Chip>)}</span> : <span className="vw-label">—</span> },
    { key: 'active', header: 'Active', sort: (p) => (p.active ? 1 : 0), render: (p) => (
      <span onClick={(e) => e.stopPropagation()}>
        <Toggle on={p.active} label={`${p.name} active`} onChange={(val) => update.mutate({ id: p.id, data: { active: val } }, { onSuccess: () => message.success(`${p.name} ${val ? 'enabled' : 'disabled'}`) })} />
      </span>
    ) },
    { key: 'source', header: '', render: (p) => <Btn size="xs" icon={Code} onClick={(e) => { e.stopPropagation(); setView(p); }}>Source</Btn> },
  ];

  const recentFor = (polId: string) => decisions.filter((d) => d.policyId === polId).slice(0, 6);

  return (
    <OpsPage title="Policies" description="OPA / Rego policies evaluated at change time and on scheduled re-scans."
      actions={<Btn variant="filled" icon={Plus} onClick={() => setOpen(true)}>New policy</Btn>}>
      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} onRow={(p) => setView(p)} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={25}
          toolbar={
            <ListToolbar shown={rows.length} total={policies.length} noun="policies"
              search={{ value: q, onChange: setQ, placeholder: 'Policy, package, control' }}
              filters={[
                { id: 'category', label: 'Category', quick: true, value: catF, anyLabel: 'Any category', onChange: setCatF, options: POLICY_CATEGORY.map((c) => ({ id: c, label: c, count: policies.filter((p) => p.category === c).length })) },
                { id: 'enforcement', label: 'Enforcement', quick: true, value: enfF, anyLabel: 'Any enforcement', onChange: setEnfF, options: ENFORCEMENT.map((c) => ({ id: c, label: c, count: policies.filter((p) => p.enforcement === c).length })) },
                { id: 'active', label: 'State', value: activeF, anyLabel: 'Active and inactive', onChange: setActiveF, options: [{ id: 'true', label: 'Active', count: policies.filter((p) => p.active).length }, { id: 'false', label: 'Inactive', count: policies.filter((p) => !p.active).length }] },
              ]} />
          } />
      </section>

      <Modal title="New policy" open={open} onOk={submit} onCancel={() => setOpen(false)} okText="Create policy" width={680} confirmLoading={create.isPending}>
        <Form form={form} layout="vertical">
          <Space style={{ width: '100%' }} align="start">
            <Form.Item name="name" label="Name" rules={[{ required: true }]} style={{ width: 300 }}><Input placeholder="e.g. Block over-budget racks" /></Form.Item>
            <Form.Item name="category" label="Category" rules={[{ required: true }]} style={{ width: 150 }}><Select placeholder="Select category" options={POLICY_CATEGORY.map((c) => ({ value: c, label: c }))} /></Form.Item>
            <Form.Item name="enforcement" label="Enforcement" rules={[{ required: true }]} initialValue="Warn" style={{ width: 120 }}><Select placeholder="Select enforcement" options={ENFORCEMENT.map((c) => ({ value: c, label: c }))} /></Form.Item>
          </Space>
          <Form.Item name="regoPackage" label="Package" rules={[{ required: true }]}><Input placeholder="dcos.rack.power" /></Form.Item>
          <Form.Item label="Start from an example">
            <Select placeholder="Insert an example…" allowClear options={Object.keys(REGO_EXAMPLES).map((k) => ({ value: k, label: k }))}
              onChange={(k) => { if (k) { form.setFieldsValue({ rego: REGO_EXAMPLES[k], regoPackage: REGO_EXAMPLES[k].match(/package (\S+)/)?.[1] }); } }} />
          </Form.Item>
          <Form.Item name="rego" label="Policy source" rules={[{ required: true }]}>
            <Input.TextArea autoSize={{ minRows: 8, maxRows: 18 }} style={{ fontSize: "var(--vw-font-label-sm)" }} placeholder={REGO_EXAMPLES['Rack power budget']} />
          </Form.Item>
          <Form.Item name="controlRefs" label="Satisfies compliance controls" tooltip="Tag the framework controls this policy enforces. The control's compliance status is then computed from this policy's OPA decisions.">
            <Select mode="multiple" allowClear placeholder="Map to ISO / SOC 2 / PCI / NIST controls…"
              optionFilterProp="label"
              options={controls.map((c) => ({ value: c.ref, label: `${c.standard} ${c.ref} — ${c.title}` }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer mask={false} title={view?.name} open={!!view} onClose={() => setView(null)} width={620}>
        {view && (
          <Space direction="vertical" style={{ width: '100%' }} size={14}>
            <Space wrap>
              <Chip tone="neutral">{view.category}</Chip>
              <Chip tone={ENF_TONE[view.enforcement] ?? 'neutral'}>{view.enforcement}</Chip>
              {view.regoPackage && <code style={{ fontSize: "var(--vw-font-label-sm)" }}>{view.regoPackage}</code>}
              <Chip tone={view.active ? 'success' : 'neutral'} dot>{view.active ? 'Active' : 'Inactive'}</Chip>
            </Space>
            <div>
              <Text strong>Policy source</Text>
              <pre style={{ fontFamily: 'inherit', background: "var(--vw-color-slate-900)", color: "var(--vw-color-slate-200)", padding: 14, borderRadius: "var(--vw-radius-sm)", fontSize: "var(--vw-font-label-sm)", overflow: 'auto', marginTop: 6 }}>{view.rego ?? '(no rego source)'}</pre>
            </div>
            <div>
              <Text strong>Satisfies controls</Text>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{(view.controlRefs ?? []).length ? (view.controlRefs ?? []).map((c) => <Chip key={c} tone="neutral">{c}</Chip>) : <Text type="secondary">Not mapped to any control</Text>}</div>
            </div>
            <div>
              <Text strong>Recent OPA decisions</Text>
              {recentFor(view.id).length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <DataTable<PolicyDecision> compact rows={recentFor(view.id)} pageSize={50} cols={DECISION_COLS} />
                </div>
              )}
              {recentFor(view.id).length === 0 && <Paragraph type="secondary" style={{ marginTop: 6 }}>No decisions recorded yet.</Paragraph>}
            </div>
          </Space>
        )}
      </Drawer>
    </OpsPage>
  );
}
