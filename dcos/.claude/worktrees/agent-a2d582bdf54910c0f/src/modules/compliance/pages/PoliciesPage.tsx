import { useState } from 'react';
import { App, Drawer, Form, Input, Modal, Select, Space, Switch, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined, CodeOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { POLICY_CATEGORY, ENFORCEMENT } from '../../../mock/data/enums';
import type { Policy, PolicyDecision, ComplianceControl } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text, Paragraph } = Typography;
const enfColor: Record<string, string> = { Block: 'red', Warn: 'orange', Audit: 'default' };

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

  const cols: TableColumnType<Policy>[] = [
    { title: 'Policy', dataIndex: 'name', render: (n: string, p) => <a onClick={() => setView(p)}>{n}</a> },
    { title: 'Category', dataIndex: 'category', render: (c: string) => <VwChip>{c}</VwChip> },
    { title: 'Package', dataIndex: 'regoPackage', render: (v: string) => v ? <code style={{ fontSize: "var(--vw-font-label-sm)" }}>{v}</code> : <Text type="secondary">—</Text> },
    { title: 'Enforcement', dataIndex: 'enforcement', render: (e: string) => <VwChip color={enfColor[e]}>{e}</VwChip> },
    { title: 'Controls', dataIndex: 'controlRefs', render: (r: string[]) => (r ?? []).length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: "var(--vw-space-xxs)" }}>{(r).map((x) => <VwChip key={x}>{x}</VwChip>)}</div> : <Text type="secondary">—</Text> },
    { title: 'Active', dataIndex: 'active', render: (v: boolean, p) => <Switch size="small" checked={v} onChange={(val) => update.mutate({ id: p.id, data: { active: val } }, { onSuccess: () => message.success(`${p.name} ${val ? 'enabled' : 'disabled'}`) })} /> },
    { title: '', render: (_: unknown, p) => <Button size="small" icon={<CodeOutlined />} onClick={() => setView(p)}>Source</Button> },
  ];

  const recentFor = (polId: string) => decisions.filter((d) => d.policyId === polId).slice(0, 6);

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-sm)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <h1 className="vw-page-title" style={{ margin: 0 }}>Policies</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>New policy</Button>
      </div>
      <VwCard size="small" bodyStyle={{ padding: 0 }}><Table<Policy> rowKey="id" size="small" dataSource={policies} columns={cols} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }} /></VwCard>

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
              <VwChip>{view.category}</VwChip>
              <VwChip color={enfColor[view.enforcement]}>{view.enforcement}</VwChip>
              {view.regoPackage && <code style={{ fontSize: "var(--vw-font-label-sm)" }}>{view.regoPackage}</code>}
              <VwChip color={view.active ? 'green' : 'default'}>{view.active ? 'Active' : 'Inactive'}</VwChip>
            </Space>
            <div>
              <Text strong>Policy source</Text>
              <pre style={{ fontFamily: 'inherit', background: "var(--vw-color-slate-900)", color: "var(--vw-color-slate-200)", padding: 14, borderRadius: "var(--vw-radius-sm)", fontSize: "var(--vw-font-label-sm)", overflow: 'auto', marginTop: 6 }}>{view.rego ?? '(no rego source)'}</pre>
            </div>
            <div>
              <Text strong>Satisfies controls</Text>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{(view.controlRefs ?? []).length ? (view.controlRefs ?? []).map((c) => <VwChip key={c}>{c}</VwChip>) : <Text type="secondary">Not mapped to any control</Text>}</div>
            </div>
            <div>
              <Text strong>Recent OPA decisions</Text>
              <Table size="small" rowKey="id" style={{ marginTop: 6 }} pagination={false} scroll={{ x: 'max-content' }}
                dataSource={recentFor(view.id)}
                columns={[
                  { title: 'Resource', dataIndex: 'resourceName' },
                  { title: 'Decision', dataIndex: 'decision', render: (d: string) => <VwChip color={d === 'deny' ? 'red' : d === 'warn' ? 'orange' : 'green'}>{d}</VwChip> },
                  { title: 'When', dataIndex: 'evaluatedAt', render: (t: string) => t.slice(0, 10) },
                ]} />
              {recentFor(view.id).length === 0 && <Paragraph type="secondary" style={{ marginTop: 6 }}>No decisions recorded yet.</Paragraph>}
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
