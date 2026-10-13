import { useMemo, useState } from 'react';
import { App, Form, Input, Modal, Select } from 'antd';
import { Bot, Plus, ShieldCheck, User } from 'lucide-react';
import { useEntityList, useEntityCreate, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { CONTROL_TYPE } from '../../../mock/data/enums';
import type { ComplianceControl, ComplianceFramework, Policy, PolicyDecision } from '../../../mock/data/types';
import { deriveControlStatus, backingPolicies } from '../lib/controlScore';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';

const STATUS_TONE: Record<string, Tone> = { Compliant: 'success', InProgress: 'warning', NonCompliant: 'error', NotAssessed: 'neutral' };
const STATUSES = ['Compliant', 'InProgress', 'NonCompliant', 'NotAssessed'];
const now = () => new Date().toISOString();
const envelope = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });

export default function ControlsPage() {
  const { message } = App.useApp();
  const frameworks = (useEntityList('complianceFrameworks', { pageSize: 100 }).data?.data ?? []) as unknown as ComplianceFramework[];
  const controls = (useEntityList('complianceControls', { pageSize: 300 }).data?.data ?? []) as unknown as ComplianceControl[];
  const policies = (useEntityList('policies', { pageSize: 100 }).data?.data ?? []) as unknown as Policy[];
  const decisions = (useEntityList('policyDecisions', { pageSize: 1000 }).data?.data ?? []) as unknown as PolicyDecision[];
  const createFw = useEntityCreate('complianceFrameworks');
  const createCtrl = useEntityCreate('complianceControls');
  const updatePolicy = useEntityUpdate('policies');
  const update = useEntityUpdate('complianceControls');
  const recordAudit = useRecordAudit();

  const [std, setStd] = useState<string>('');
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [fwOpen, setFwOpen] = useState(false);
  const [ctrlOpen, setCtrlOpen] = useState(false);
  const [fwForm] = Form.useForm();
  const [ctrlForm] = Form.useForm();

  const scored = useMemo(
    () => controls.map((c) => ({
      ...c,
      dstatus: deriveControlStatus(c, policies, decisions),
      backing: backingPolicies(c, policies).map((p) => p.name),
    })),
    [controls, policies, decisions],
  );
  type ScoredControl = (typeof scored)[number];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return scored.filter((c) => (!std || c.standard === std) && (!statusF || c.dstatus === statusF) && (!typeF || c.type === typeF)
      && (!s || `${c.standard} ${c.ref} ${c.title} ${c.owner} ${c.backing.join(' ')}`.toLowerCase().includes(s)));
  }, [scored, std, statusF, typeF, q]);

  const k = useMemo(() => ({
    total: scored.length,
    automated: scored.filter((c) => c.type === 'Automated').length,
    manual: scored.filter((c) => c.type === 'Manual').length,
    nonCompliant: scored.filter((c) => c.dstatus === 'NonCompliant').length,
  }), [scored]);

  const fwStats = (name: string) => {
    const inFw = scored.filter((c) => c.standard === name);
    const ok = inFw.filter((c) => c.dstatus === 'Compliant').length;
    return { count: inFw.length, posture: inFw.length ? Math.round((ok / inFw.length) * 100) : 0 };
  };

  function attest(c: ComplianceControl) {
    update.mutate({ id: c.id, data: { status: 'Compliant', lastAssessedAt: now(), evidenceCount: (c.evidenceCount ?? 0) + 1 } }, {
      onSuccess: () => { recordAudit('ComplianceControl', c.ref, 'attested', `Attested ${c.standard} ${c.ref}`); message.success(`${c.ref} attested`); },
    });
  }

  function submitFw() {
    fwForm.validateFields().then((v) => {
      createFw.mutate({ fwId: `FW-${Date.now().toString().slice(-5)}`, name: v.name, version: v.version, description: v.description, owner: v.owner ?? 'You', status: 'Active', ...envelope() }, {
        onSuccess: () => { recordAudit('ComplianceFramework', v.name, 'created', `Created framework ${v.name}`); message.success('Framework created'); setFwOpen(false); fwForm.resetFields(); },
      });
    });
  }

  function submitCtrl() {
    ctrlForm.validateFields().then((v) => {
      const fw = frameworks.find((f) => f.id === v.frameworkId);
      createCtrl.mutate({
        ctrlId: `CTRL-${Date.now().toString().slice(-5)}`, standard: fw?.name ?? '', frameworkId: v.frameworkId, ref: v.ref, title: v.title,
        description: `${fw?.name ?? ''} ${v.ref} — ${v.title}`, type: v.type, policyId: v.policyId, owner: v.owner ?? 'You',
        status: v.type === 'Manual' ? 'NotAssessed' : 'InProgress', evidenceCount: 0, ...envelope(),
      }, {
        onSuccess: () => {
          // If automated + a backing policy chosen, tag that policy so scoring picks it up.
          if (v.type === 'Automated' && v.policyId) {
            const pol = policies.find((p) => p.id === v.policyId);
            if (pol) updatePolicy.mutate({ id: pol.id, data: { controlRefs: Array.from(new Set([...(pol.controlRefs ?? []), v.ref])) } });
          }
          recordAudit('ComplianceControl', v.ref, 'created', `Added control ${fw?.name ?? ''} ${v.ref}`);
          message.success('Control created'); setCtrlOpen(false); ctrlForm.resetFields();
        },
      });
    });
  }

  const cols: Col<ScoredControl>[] = [
    { key: 'control', header: 'Control', sort: (c) => c.title, render: (c) => (
      <span className="cell-2"><span className="vw-card-activity-label">{c.title}</span><small className="mono">{c.ref}</small></span>
    ) },
    { key: 'standard', header: 'Framework', sort: (c) => c.standard, render: (c) => <Chip>{c.standard}</Chip> },
    { key: 'type', header: 'Type', sort: (c) => c.type, render: (c) => c.type === 'Automated'
      ? <span className="row" style={{ gap: 4 }}><Bot size={14} className="muted" /><Chip tone="info">Automated (OPA)</Chip></span>
      : <span className="row" style={{ gap: 4 }}><User size={14} className="muted" /><Chip>Manual</Chip></span> },
    { key: 'backing', header: 'Backing policy', wrap: true, render: (c) => c.type === 'Automated'
      ? (c.backing.length ? c.backing.join(', ') : <Chip tone="warning" size="xs">unmapped</Chip>)
      : <span className="vw-label">— attested —</span> },
    { key: 'status', header: 'Status', sort: (c) => c.dstatus, render: (c) => <Chip tone={STATUS_TONE[c.dstatus] ?? 'neutral'} dot>{c.dstatus}</Chip> },
    { key: 'evidence', header: 'Evidence', align: 'right', sort: (c) => c.evidenceCount ?? 0, render: (c) => <span className="num">{c.evidenceCount}</span> },
    { key: 'owner', header: 'Owner', sort: (c) => c.owner, render: (c) => c.owner },
    { key: 'act', header: '', render: (c) => c.type === 'Manual'
      ? <Btn size="xs" onClick={(e) => { e.stopPropagation(); attest(c); }}>Attest</Btn>
      : <span className="vw-label">auto</span> },
  ];

  const typeParts = [
    { key: 'Automated', label: 'Automated', n: k.automated, tone: 'info' as Tone },
    { key: 'Manual', label: 'Manual', n: k.manual, tone: 'purple' as Tone },
  ];
  const fwItems = frameworks.map((f) => {
    const s = fwStats(f.name);
    return { key: f.id, label: f.name, sublabel: f.version, value: s.posture, display: `${s.posture}%`, secondary: ` · ${s.count} controls`, active: std === f.name, onClick: () => setStd(std === f.name ? '' : f.name) };
  });

  return (
    <OpsPage title="Frameworks & Controls" description="Framework controls — automated ones scored from OPA decisions, manual ones attested."
      actions={<>
        <Btn icon={Plus} onClick={() => setFwOpen(true)}>New framework</Btn>
        <Btn variant="filled" icon={Plus} onClick={() => setCtrlOpen(true)}>New control</Btn>
      </>}>
      <StatGrid cols={4}>
        <StatTile label="Controls" value={k.total} sub={`${frameworks.length} frameworks`}>
          <Split parts={typeParts} onPick={(key) => setTypeF(typeF === key ? '' : key)} active={typeF} />
        </StatTile>
        <StatTile label="Automated (OPA)" value={k.automated} sub="scored from policy decisions" onClick={() => setTypeF(typeF === 'Automated' ? '' : 'Automated')} active={typeF === 'Automated'} />
        <StatTile label="Manual (attested)" value={k.manual} sub="need evidence and attestation" onClick={() => setTypeF(typeF === 'Manual' ? '' : 'Manual')} active={typeF === 'Manual'} />
        <StatTile label="Non-compliant" value={k.nonCompliant} sub={k.nonCompliant ? 'controls failing' : 'none failing'} subTone={k.nonCompliant ? 'bad' : undefined}
          onClick={() => setStatusF(statusF === 'NonCompliant' ? '' : 'NonCompliant')} active={statusF === 'NonCompliant'} />
      </StatGrid>

      <Panel title="Frameworks" sub="Share of controls compliant · click a framework to filter the controls" icon={ShieldCheck} count={frameworks.length}>
        <BarList items={fwItems} max={100} />
      </Panel>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} defaultSort={{ key: 'standard', dir: 'asc' }} pageSize={25}
          toolbar={
            <ListToolbar shown={rows.length} total={scored.length} noun="controls"
              search={{ value: q, onChange: setQ, placeholder: 'Control, reference, owner, policy' }}
              filters={[
                { id: 'framework', label: 'Framework', quick: true, value: std, anyLabel: 'All frameworks', onChange: setStd, options: frameworks.map((f) => ({ id: f.name, label: f.name, count: fwStats(f.name).count })) },
                { id: 'status', label: 'Status', quick: true, value: statusF, anyLabel: 'Any status', onChange: setStatusF, options: STATUSES.map((s) => ({ id: s, label: s, count: scored.filter((c) => c.dstatus === s).length })) },
                { id: 'type', label: 'Type', value: typeF, anyLabel: 'Any type', onChange: setTypeF, options: CONTROL_TYPE.map((t) => ({ id: t, label: t, count: scored.filter((c) => c.type === t).length })) },
              ]} />
          } />
      </section>

      <Modal title="New compliance framework" open={fwOpen} onOk={submitFw} onCancel={() => setFwOpen(false)} okText="Create framework" confirmLoading={createFw.isPending}>
        <Form form={fwForm} layout="vertical">
          <Form.Item name="name" label="Framework name" rules={[{ required: true }]}><Input placeholder="e.g. ISO 27017, HIPAA, FedRAMP" /></Form.Item>
          <Form.Item name="version" label="Version"><Input placeholder="e.g. 2022 / r5 / Type II" /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
          <Form.Item name="owner" label="Owner"><Input placeholder="Accountable owner" /></Form.Item>
        </Form>
      </Modal>

      <Modal title="New control" open={ctrlOpen} onOk={submitCtrl} onCancel={() => setCtrlOpen(false)} okText="Create control" confirmLoading={createCtrl.isPending} width={560}>
        <Form form={ctrlForm} layout="vertical">
          <Form.Item name="frameworkId" label="Framework" rules={[{ required: true }]}>
            <Select placeholder="Select framework" options={frameworks.map((f) => ({ value: f.id, label: f.name }))} />
          </Form.Item>
          <Form.Item name="ref" label="Control reference" rules={[{ required: true }]}><Input placeholder="e.g. A.8.32 / CC8.1 / CM-3" /></Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input placeholder="e.g. Change management" /></Form.Item>
          <Form.Item name="type" label="Control type" rules={[{ required: true }]} initialValue="Manual">
            <Select placeholder="Select control type" options={CONTROL_TYPE.map((t) => ({ value: t, label: t === 'Automated' ? 'Automated (OPA-evaluated)' : 'Manual (attested)' }))} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.type !== c.type}>
            {({ getFieldValue }) => getFieldValue('type') === 'Automated' && (
              <Form.Item name="policyId" label="Backing policy" tooltip="The OPA policy that satisfies this control. The control's status is computed from this policy's decisions.">
                <Select allowClear placeholder="Map to a policy" options={policies.map((p) => ({ value: p.id, label: p.name }))} />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item name="owner" label="Owner"><Input placeholder="Accountable owner" /></Form.Item>
        </Form>
      </Modal>
    </OpsPage>
  );
}
