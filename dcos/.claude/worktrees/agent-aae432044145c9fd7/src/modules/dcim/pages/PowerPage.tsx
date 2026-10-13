import { useMemo, useState } from 'react';
import { App, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined, SearchOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { POWER_SUPPLY, POWER_PHASE, POWER_FEED_TYPE, POWER_FEED_STATUS } from '../../../mock/data/enums';
import type { PowerPanel, PowerFeed, DataCenter, Rack } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const now = () => new Date().toISOString();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });
const statusColor: Record<string, string> = { Active: 'green', Planned: 'gold', Offline: 'default', Failed: 'red' };

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
  const [pForm] = Form.useForm();
  const [fForm] = Form.useForm();

  const panelIds = useMemo(() => new Set(panels.map((p) => p.id)), [panels]);
  const myFeeds = useMemo(() => {
    const base = feeds.filter((f) => panelIds.has(f.powerPanelId));
    const s = feedQ.trim().toLowerCase();
    return s ? base.filter((f) => `${f.name} ${f.type} ${f.status}`.toLowerCase().includes(s)) : base;
  }, [feeds, panelIds, feedQ]);
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

  const panelCols: TableColumnType<PowerPanel>[] = [
    { title: 'Panel', dataIndex: 'name' },
    { title: 'Data center', dataIndex: 'dataCenterId', render: (id: string) => dcName(id) },
    { title: 'Feeds', render: (_: unknown, r) => feedCount(r.id) },
  ];
  const feedCols: TableColumnType<PowerFeed>[] = [
    { title: 'Feed', dataIndex: 'name' },
    { title: 'Panel', dataIndex: 'powerPanelId', render: (id: string) => panelName(id) },
    { title: 'Rack', dataIndex: 'rackId', render: (id?: string) => rackName(id) },
    { title: 'Supply', render: (_: unknown, r) => `${r.supply} · ${r.phase}` },
    { title: 'Voltage', dataIndex: 'voltage', align: 'right', render: (v: number) => `${v} V` },
    { title: 'Amperage', dataIndex: 'amperage', align: 'right', render: (a: number) => `${a} A` },
    { title: 'Max util', dataIndex: 'maxUtilizationPct', align: 'right', render: (m: number) => `${m}%` },
    { title: 'Type', dataIndex: 'type', render: (t: string) => <VwChip color={t === 'Primary' ? 'blue' : 'purple'}>{t}</VwChip> },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={statusColor[s]}>{s}</VwChip> },
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginTop: "var(--vw-space-md)" }}>
        <Col xs={24} lg={10}>
          <VwCard title={<span>Power panels <Text type="secondary">({panels.length})</Text></span>} extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setPanelOpen(true)}>Panel</Button>} bodyStyle={{ padding: 0 }} style={{ height: '100%' }}>
            <Table<PowerPanel> rowKey="id" size="small" dataSource={panels} columns={panelCols} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content', y: 320 }} />
          </VwCard>
        </Col>
        <Col xs={24} lg={14}>
          <Input allowClear prefix={<SearchOutlined />} placeholder="Search feeds…" value={feedQ} onChange={(e) => setFeedQ(e.target.value)} style={{ width: 260, marginBottom: "var(--vw-space-md)" }} />
          <VwCard title={<span>Power feeds <Text type="secondary">({myFeeds.length})</Text></span>} extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setFeedOpen(true)}>Feed</Button>} bodyStyle={{ padding: 0 }} style={{ height: 'calc(100% - 44px)' }}>
            <Table<PowerFeed> rowKey="id" size="small" dataSource={myFeeds} columns={feedCols} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content', y: 320 }} locale={{ emptyText: 'No feeds match.' }} />
          </VwCard>
        </Col>
      </Row>

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
    </div>
  );
}
