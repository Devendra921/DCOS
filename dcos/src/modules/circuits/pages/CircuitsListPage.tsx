import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Col as Column, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import { Cable, DollarSign, Gauge, Plus, ShieldAlert, ShieldCheck } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Meter } from '../../../ops/ui/status';
import { MiniBars, RankList, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';
import { Donut } from '../../../ops/charts/Donut';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { CIRCUIT_STATUS, CIRCUIT_PURPOSE } from '../../../mock/data/enums';
import { circuitStats, circuitView, providerSpend, siteRedundancy, fmtGbps, fmtMoney } from '../lib/circuits';
import type { Circuit, Provider, CircuitType, CircuitTermination, DataCenter, Interface, ManagedDevice } from '../../../mock/data/types';

const now = () => new Date().toISOString();

export default function CircuitsListPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const circuits = (useEntityList('circuits', { pageSize: 5000 }).data?.data ?? []) as unknown as Circuit[];
  const providers = (useEntityList('providers', { pageSize: 200 }).data?.data ?? []) as unknown as Provider[];
  const types = (useEntityList('circuitTypes', { pageSize: 200 }).data?.data ?? []) as unknown as CircuitType[];
  const terms = (useEntityList('circuitTerminations', { pageSize: 5000 }).data?.data ?? []) as unknown as CircuitTermination[];
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];
  const ifaces = (useEntityList('interfaces', { pageSize: 10000 }).data?.data ?? []) as unknown as Interface[];
  const mds = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const create = useEntityCreate('circuits');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const provName = (id: string) => providers.find((p) => p.id === id)?.name ?? '?';
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? '?';
  const dcName = (id?: string) => dcs.find((d) => d.id === id)?.code;
  const devName = useMemo(() => Object.fromEntries(mds.map((d) => [d.id, d.hostname])), [mds]);
  const ifById = useMemo(() => new Map(ifaces.map((i) => [i.id, i])), [ifaces]);

  const m = useMemo(() => {
    const stats = circuitStats(circuits, terms, ifById);
    const spend = providerSpend(providers, circuits);
    const sites = siteRedundancy(circuits, terms, dcs);
    const statusMix = CIRCUIT_STATUS.map((s) => ({ type: s, value: circuits.filter((c) => c.status === s).length })).filter((x) => x.value > 0);
    const exposed = sites.filter((s) => s.exposed);
    return { stats, spend, sites, statusMix, exposed };
  }, [circuits, terms, ifById, providers, dcs]);

  const [provF, setProvF] = useState<string | undefined>();
  const [statusF, setStatusF] = useState<string | undefined>();
  const [purposeF, setPurposeF] = useState<string | undefined>();
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return circuits.filter((c) => (!provF || c.providerId === provF) && (!statusF || c.status === statusF) && (!purposeF || c.purpose === purposeF)
      && (!s || `${c.cid} ${provName(c.providerId)} ${typeName(c.circuitTypeId)} ${c.status} ${c.purpose ?? ''}`.toLowerCase().includes(s)));
  }, [circuits, q, provF, statusF, purposeF, providers, types]);

  const submit = async () => {
    const v = await form.validateFields();
    const id = `CKT-NEW-${Date.now().toString(36)}`;
    create.mutate({ id, cktId: id, cid: v.cid, providerId: v.providerId, circuitTypeId: v.circuitTypeId, status: v.status, purpose: v.purpose, commitRateMbps: v.commitRateMbps, monthlyCostUsd: v.monthlyCostUsd, customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' },
      { onSuccess: () => { message.success('Circuit created'); setOpen(false); form.resetFields(); } });
  };


  const termA = useMemo(() => new Map(terms.filter((t) => t.side === 'A').map((t) => [t.circuitId, t])), [terms]);
  const utilOf = (c: Circuit) => (c.status === 'Active' ? circuitView(c, terms, ifById).util : null);
  const tone = (s: string): Tone => (s === 'Active' ? 'success' : s === 'Offline' ? 'error' : s === 'Provisioning' ? 'purple' : s === 'Planned' ? 'info' : 'neutral');

  const cols: Col<Circuit>[] = [
    { key: 'cid', header: 'Circuit', sort: (r) => r.cid, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.cid}</span><small>{typeName(r.circuitTypeId)}</small></span>
    ) },
    { key: 'prov', header: 'Provider', sort: (r) => provName(r.providerId), render: (r) => (
      <span className="cell-2"><span>{provName(r.providerId)}</span><small>{r.purpose ?? '—'}</small></span>
    ) },
    { key: 'aside', header: 'A-side', sort: (r) => dcName(termA.get(r.id)?.dataCenterId) ?? '', render: (r) => { const a = termA.get(r.id); return a
      ? <span className="cell-2"><span>{dcName(a.dataCenterId) ?? '—'}</span><small className="mono">{a.deviceId ? devName[a.deviceId] : 'no device'}</small></span>
      : <span className="vw-label">—</span>; } },
    { key: 'commit', header: 'Commit', align: 'right', sort: (r) => r.commitRateMbps ?? 0, render: (r) => <span className="num">{fmtGbps(r.commitRateMbps)}</span> },
    { key: 'util', header: 'Utilisation', sort: (r) => utilOf(r) ?? -1, render: (r) => { const u = utilOf(r); return u === null ? <span className="vw-label">—</span> : <Meter pct={u} width={72} color={u >= 85 ? 'var(--vw-color-red-500)' : 'var(--primaryColor500)'} />; } },
    { key: 'cost', header: 'Monthly', align: 'right', sort: (r) => r.monthlyCostUsd ?? 0, render: (r) => <span className="num">{fmtMoney(r.monthlyCostUsd)}</span> },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip tone={tone(r.status)} dot>{r.status}</Chip> },
  ];

  const activeUtil = useMemo(() => circuits.filter((c) => c.status === 'Active').map((c) => circuitView(c, terms, ifById).util), [circuits, terms, ifById]);
  const buckets = [activeUtil.filter((u) => u < 25).length, activeUtil.filter((u) => u >= 25 && u < 50).length, activeUtil.filter((u) => u >= 50 && u < 75).length, activeUtil.filter((u) => u >= 75 && u < 85).length, activeUtil.filter((u) => u >= 85).length];
  const statusParts = CIRCUIT_STATUS.map((s) => ({ key: s, label: s, n: circuits.filter((c) => c.status === s).length, tone: tone(s) })).filter((p) => p.n > 0);
  const spendItems = [...m.spend].filter((s) => s.spend > 0).sort((a, b) => b.spend - a.spend).map((s) => ({ key: s.provider.id, label: s.provider.name, sublabel: `${s.activeCount} active`, value: s.spend, display: fmtMoney(s.spend), onClick: () => setProvF(s.provider.id) }));
  const DONUT: Record<string, string> = { Planned: '#93c5fd', Provisioning: '#c4b5fd', Active: '#6ee7b7', Offline: '#fca5a5', Decommissioned: '#cbd5e1' };

  return (
    <OpsPage title="Circuits" description="Carrier circuits across the estate — spend, utilisation, status and site redundancy"
      actions={<Btn variant="filled" icon={Plus} onClick={() => { form.resetFields(); setOpen(true); }}>New circuit</Btn>}>

      <StatGrid>
        <StatTile label="Circuits" value={circuits.length} sub={`${m.stats.active} active`}>
          <Split parts={statusParts} onPick={(k) => setStatusF(statusF === k ? undefined : k)} active={statusF} />
        </StatTile>
        <StatTile label="Committed" value={<>{m.stats.committedGbps}<small> Gbps</small></>} sub="across active circuits" />
        <StatTile label="Monthly spend" value={fmtMoney(m.stats.monthlySpendUsd)} sub={`${spendItems.length} providers`}>
          <RankList items={spendItems.slice(0, 3).map((s) => ({ key: s.key, label: s.label, n: Math.round(s.value / 1000), tone: 'info' as Tone }))} />
        </StatTile>
        <StatTile label="Avg utilisation" value={<>{m.stats.avgUtil}<small>%</small></>} sub="of committed rate">
          <SoftMeter pct={m.stats.avgUtil} tone={m.stats.avgUtil >= 75 ? 'warning' : 'info'} />
        </StatTile>
        <StatTile label="Offline" value={m.stats.offline} sub={m.stats.offline ? 'circuits down now' : 'none down'} subTone={m.stats.offline ? 'bad' : undefined} onClick={() => setStatusF(statusF === 'Offline' ? undefined : 'Offline')} active={statusF === 'Offline'} />
        <StatTile label="Exposed sites" value={m.exposed.length} sub={m.exposed.length ? 'single-homed or one carrier' : 'all dual-homed'} subTone={m.exposed.length ? 'warn' : undefined} />
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title="Monthly spend by provider" sub="Active circuits · click a provider to filter the register" icon={DollarSign}>
          <BarList items={spendItems} />
        </Panel>
        <Panel title="Circuits by status" sub={`${circuits.length} circuits`} icon={Cable}>
          <Donut slices={statusParts.map((p) => ({ key: p.key, label: p.label, value: p.n, color: DONUT[p.key] ?? '#cbd5e1' }))} centerValue={String(circuits.length)} centerLabel="circuits" />
        </Panel>
      </div>

      <div className="grid g-2">
        <Panel title="Utilisation of active circuits" sub={`${activeUtil.length} active · share of committed rate`} icon={Gauge}>
          <MiniBars values={buckets} labels={['<25%', '25–50%', '50–75%', '75–85%', '≥85%']} hot={4} />
        </Panel>
        <Panel title="Site redundancy" sub="Sites whose type expects WAN diversity" icon={ShieldAlert} count={m.exposed.length}>
          {m.exposed.length === 0
            ? <Empty icon={ShieldCheck} title="All sites dual-homed">Every site that expects WAN diversity has two carriers.</Empty>
            : <div className="col">{m.exposed.map((s) => (
                <div key={s.dcId} className="row between">
                  <b className="strong">{s.dcName}</b>
                  <span className="row" style={{ gap: 6 }}>{s.singleHomed && <Chip tone="error" size="xs">single-homed</Chip>}{s.noCarrierDiversity && <Chip tone="warning" size="xs">one carrier</Chip>}<span className="vw-label">{s.activeCircuits} circuit{s.activeCircuits > 1 ? 's' : ''}</span></span>
                </div>
              ))}</div>}
        </Panel>
      </div>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} onRow={(r) => navigate(`/circuits/${r.id}`)} defaultSort={{ key: 'cid', dir: 'asc' }} pageSize={30}
          toolbar={
            <ListToolbar shown={rows.length} total={circuits.length}
              search={{ value: q, onChange: setQ, placeholder: 'Circuit, provider, purpose' }}
              filters={[
                { id: 'provider', label: 'Provider', quick: true, value: provF ?? '', anyLabel: 'Any provider', onChange: (v) => setProvF(v || undefined), options: providers.map((p) => ({ id: p.id, label: p.name, count: circuits.filter((c) => c.providerId === p.id).length })) },
                { id: 'status', label: 'Status', quick: true, value: statusF ?? '', anyLabel: 'Any status', onChange: (v) => setStatusF(v || undefined), options: CIRCUIT_STATUS.map((x) => ({ id: x, label: x, count: circuits.filter((c) => c.status === x).length })) },
                { id: 'purpose', label: 'Purpose', value: purposeF ?? '', anyLabel: 'Any purpose', onChange: (v) => setPurposeF(v || undefined), options: CIRCUIT_PURPOSE.map((x) => ({ id: x, label: x, count: circuits.filter((c) => c.purpose === x).length })) },
              ]} />
          } />
      </section>

      <Modal title="New circuit" open={open} onOk={submit} okText="Create" onCancel={() => setOpen(false)} confirmLoading={create.isPending}>
        <Form form={form} layout="vertical" initialValues={{ status: 'Planned', purpose: 'Internet' }}>
          <Form.Item name="cid" label="Circuit ID" rules={[{ required: true }]}><Input placeholder="CID-XXXXXXXX" /></Form.Item>
          <Form.Item name="providerId" label="Provider" rules={[{ required: true }]}><Select placeholder="Select provider" showSearch optionFilterProp="label" options={providers.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item>
          <Form.Item name="circuitTypeId" label="Type" rules={[{ required: true }]}><Select placeholder="Select type" options={types.map((t) => ({ value: t.id, label: t.name }))} /></Form.Item>
          <Form.Item name="purpose" label="Purpose"><Select placeholder="Select purpose" options={CIRCUIT_PURPOSE.map((p) => ({ value: p, label: p }))} /></Form.Item>
          <Form.Item name="status" label="Status"><Select placeholder="Select status" options={CIRCUIT_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
          <Row gutter={12}>
            <Column span={12}><Form.Item name="commitRateMbps" label="Commit (Mbps)"><InputNumber placeholder="Enter commit (Mbps)" min={0} style={{ width: '100%' }} /></Form.Item></Column>
            <Column span={12}><Form.Item name="monthlyCostUsd" label="Monthly cost ($)"><InputNumber placeholder="Enter monthly cost ($)" min={0} style={{ width: '100%' }} /></Form.Item></Column>
          </Row>
        </Form>
      </Modal>
    </OpsPage>
  );
}
