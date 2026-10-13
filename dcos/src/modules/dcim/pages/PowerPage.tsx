import { useMemo, useState } from 'react';
import { App, Form, Input, InputNumber, Modal, Select, Space } from 'antd';
import { Plus } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Seg } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import type { Tone } from '../../../ops/ui/Analytics';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { POWER_SUPPLY, POWER_PHASE, POWER_FEED_TYPE, POWER_FEED_STATUS } from '../../../mock/data/enums';
import type { PowerPanel, PowerFeed, DataCenter, Rack } from '../../../mock/data/types';
import { PlantRegister } from '../../facility/components/estate/PlantRegister';
import './power-page.css';

const now = () => new Date().toISOString();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });
const STATUS_TONE: Record<string, Tone> = { Active: 'success', Planned: 'warning', Offline: 'neutral', Failed: 'error' };

export default function PowerPage() {
  const { message } = App.useApp();
  const dcF = useDcFilter();
  const panels = (useEntityList('powerPanels', { pageSize: 500, filters: dcF }).data?.data ?? []) as unknown as PowerPanel[];
  const feeds = (useEntityList('powerFeeds', { pageSize: 2000 }).data?.data ?? []) as unknown as PowerFeed[];
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const createPanel = useEntityCreate('powerPanels');
  const createFeed = useEntityCreate('powerFeeds');
  const recordAudit = useRecordAudit();
  const [panelOpen, setPanelOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedQ, setFeedQ] = useState('');
  const [panelQ, setPanelQ] = useState('');
  /** Distribution: panels and rack feeds. Site plant: utility feeds, UPS, generators and DC plant. */
  const [view, setView] = useState<'dist' | 'plant'>('dist');
  const [pForm] = Form.useForm();
  const [fForm] = Form.useForm();

  const [feedStatusF, setFeedStatusF] = useState('');
  const [feedTypeF, setFeedTypeF] = useState('');
  const visiblePanels = useMemo(() => {
    const q = panelQ.trim().toLowerCase();
    return q ? panels.filter(p => `${p.name} ${p.dataCenterId} ${dcs.find(dc => dc.id === p.dataCenterId)?.name ?? ''}`.toLowerCase().includes(q)) : panels;
  }, [panels, dcs, panelQ]);
  const panelIds = useMemo(() => new Set(panels.map((p) => p.id)), [panels]);
  const scopedFeeds = useMemo(() => feeds.filter((f) => panelIds.has(f.powerPanelId)), [feeds, panelIds]);
  const myFeeds = useMemo(() => {
    const s = feedQ.trim().toLowerCase();
    return scopedFeeds.filter((f) => (!feedStatusF || f.status === feedStatusF) && (!feedTypeF || f.type === feedTypeF)
      && (!s || `${f.name} ${f.type} ${f.status}`.toLowerCase().includes(s)));
  }, [scopedFeeds, feedQ, feedStatusF, feedTypeF]);
  const feedCountBy = (f: (x: PowerFeed) => boolean) => scopedFeeds.filter(f).length;
  const dcName = (id: string) => dcs.find((d) => d.id === id)?.name ?? '—';
  const rackName = (id?: string) => racks.find((r) => r.id === id)?.name ?? '—';
  const panelName = (id: string) => panels.find((p) => p.id === id)?.name ?? '—';
  const feedCount = (panelId: string) => feeds.filter((f) => f.powerPanelId === panelId).length;

  function submitPanel() {
    pForm.validateFields().then((v) => {
      const id = `PPNL-${Date.now().toString(36)}`;
      createPanel.mutate({ id, ppnlId: id, dataCenterId: v.dataCenterId, name: v.name, ...env() }, {
        onSuccess: () => { recordAudit('PowerPanel', v.name, 'created', `Created power panel ${v.name}`); message.success('Panel created'); setPanelOpen(false); pForm.resetFields(); },
      });
    });
  }
  function submitFeed() {
    fForm.validateFields().then((v) => {
      const id = `PFEED-${Date.now().toString(36)}`;
      createFeed.mutate({ id, pfId: id, powerPanelId: v.powerPanelId, rackId: v.rackId, name: v.name, supply: v.supply, phase: v.phase, voltage: v.voltage, amperage: v.amperage, maxUtilizationPct: v.maxUtilizationPct ?? 80, type: v.type, status: v.status ?? 'Active', ...env() }, {
        onSuccess: () => { recordAudit('PowerFeed', v.name, 'created', `Created power feed ${v.name}`); message.success('Feed created'); setFeedOpen(false); fForm.resetFields(); },
      });
    });
  }

  const panelCols: Col<PowerPanel>[] = [
    { key: 'name', header: 'Panel', sort: (r) => r.name, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{dcName(r.dataCenterId)}</small></span>
    ) },
    { key: 'feeds', header: 'Feeds', align: 'right', sort: (r) => feedCount(r.id), render: (r) => <span className="num">{feedCount(r.id)}</span> },
  ];
  const feedCols: Col<PowerFeed>[] = [
    { key: 'name', header: 'Feed', sort: (r) => r.name, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{panelName(r.powerPanelId)}</small></span>
    ) },
    { key: 'rack', header: 'Rack', sort: (r) => rackName(r.rackId), render: (r) => rackName(r.rackId) },
    { key: 'supply', header: 'Supply', sort: (r) => `${r.supply} ${r.phase}`, render: (r) => `${r.supply} · ${r.phase}` },
    { key: 'voltage', header: 'Voltage', align: 'right', sort: (r) => r.voltage, render: (r) => <span className="num">{r.voltage} V</span> },
    { key: 'amperage', header: 'Amperage', align: 'right', sort: (r) => r.amperage, render: (r) => <span className="num">{r.amperage} A</span> },
    { key: 'max', header: 'Max util', align: 'right', sort: (r) => r.maxUtilizationPct, render: (r) => <span className="num">{r.maxUtilizationPct}%</span> },
    { key: 'type', header: 'Type', sort: (r) => r.type, render: (r) => <Chip tone={r.type === 'Primary' ? 'info' : 'purple'}>{r.type}</Chip> },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip tone={STATUS_TONE[r.status] ?? 'neutral'} dot>{r.status}</Chip> },
  ];

  return (
    <OpsPage title="Power" description="Power panels, rack feeds and the site power plant"
      actions={<>
        <Btn icon={Plus} onClick={() => setPanelOpen(true)}>New panel</Btn>
        <Btn variant="filled" icon={Plus} onClick={() => setFeedOpen(true)}>New feed</Btn>
      </>}>
      <div className="row between">
        <Seg size="sm" value={view} onChange={setView} options={[{ id: 'dist', label: 'Distribution' }, { id: 'plant', label: 'Site plant' }]} />
        <span className="vw-label">{view === 'dist' ? 'Power panels and the feeds to each rack' : 'Utility feeds, UPS, generators and DC plant at each site'}</span>
      </div>
      {view === 'plant' ? <PlantRegister filters={dcF} /> : (
      <div className="dcim-power-grid">
        <section className="vw-card-section dcl-table">
          <DataTable rows={visiblePanels} cols={panelCols} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={30}
            toolbar={
              <ListToolbar shown={visiblePanels.length} total={panels.length} noun="panels"
                search={{ value: panelQ, onChange: setPanelQ, placeholder: 'Panel or data center' }} />
            } />
        </section>
        <section className="vw-card-section dcl-table">
          <DataTable rows={myFeeds} cols={feedCols} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={30}
            toolbar={
              <ListToolbar shown={myFeeds.length} total={scopedFeeds.length} noun="feeds"
                search={{ value: feedQ, onChange: setFeedQ, placeholder: 'Feed, type, status' }}
                filters={[
                  { id: 'status', label: 'Status', quick: true, value: feedStatusF, anyLabel: 'Any status', onChange: setFeedStatusF, options: POWER_FEED_STATUS.map((x) => ({ id: x, label: x, count: feedCountBy((f) => f.status === x) })) },
                  { id: 'type', label: 'Type', quick: true, value: feedTypeF, anyLabel: 'Any type', onChange: setFeedTypeF, options: POWER_FEED_TYPE.map((x) => ({ id: x, label: x, count: feedCountBy((f) => f.type === x) })) },
                ]} />
            } />
        </section>
      </div>
      )}

      <Modal title="New power panel" open={panelOpen} onOk={submitPanel} okText="Create" onCancel={() => setPanelOpen(false)} confirmLoading={createPanel.isPending}>
        <Form form={pForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="Panel A-side" /></Form.Item>
          <Form.Item name="dataCenterId" label="Data center" rules={[{ required: true }]}><Select placeholder="Select data center" showSearch optionFilterProp="label" options={dcs.map((d) => ({ value: d.id, label: d.name }))} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="New power feed" open={feedOpen} onOk={submitFeed} okText="Create" onCancel={() => setFeedOpen(false)} width={560} confirmLoading={createFeed.isPending}>
        <Form form={fForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="Enter name" /></Form.Item>
          <Space>
            <Form.Item name="powerPanelId" label="Panel" rules={[{ required: true }]}><Select placeholder="Select panel" style={{ width: 220 }} showSearch optionFilterProp="label" options={panels.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item>
            <Form.Item name="rackId" label="Rack"><Select placeholder="Select rack" style={{ width: 180 }} allowClear showSearch optionFilterProp="label" options={racks.slice(0, 300).map((r) => ({ value: r.id, label: r.name }))} /></Form.Item>
          </Space>
          <Space>
            <Form.Item name="supply" label="Supply" initialValue="AC"><Select placeholder="Select supply" style={{ width: 100 }} options={POWER_SUPPLY.map((s) => ({ value: s, label: s }))} /></Form.Item>
            <Form.Item name="phase" label="Phase" initialValue="Three-phase"><Select placeholder="Select phase" style={{ width: 140 }} options={POWER_PHASE.map((p) => ({ value: p, label: p }))} /></Form.Item>
            <Form.Item name="voltage" label="Voltage" initialValue={415}><InputNumber placeholder="Enter voltage" min={0} style={{ width: 100 }} /></Form.Item>
            <Form.Item name="amperage" label="Amperage" initialValue={32}><InputNumber placeholder="Enter amperage" min={0} style={{ width: 100 }} /></Form.Item>
          </Space>
          <Space>
            <Form.Item name="maxUtilizationPct" label="Max util %" initialValue={80}><InputNumber placeholder="Enter max util %" min={0} max={100} style={{ width: 110 }} /></Form.Item>
            <Form.Item name="type" label="Type" initialValue="Primary"><Select placeholder="Select type" style={{ width: 130 }} options={POWER_FEED_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item>
            <Form.Item name="status" label="Status" initialValue="Active"><Select placeholder="Select status" style={{ width: 130 }} options={POWER_FEED_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </OpsPage>
  );
}
