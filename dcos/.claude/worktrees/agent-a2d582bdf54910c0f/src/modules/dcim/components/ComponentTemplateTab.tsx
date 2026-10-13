import { useState } from 'react';
import { App, Form, Input, InputNumber, Modal, Select, Space, Switch, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import {
  INTERFACE_TYPE, POE_TYPE, RF_ROLE, CONSOLE_TYPE, POWER_PORT_TYPE, POWER_OUTLET_TYPE, FEED_LEG, MODULE_BAY_POSITION, IF_DUPLEX,
} from '../../../mock/data/enums';
import type { ComponentKind } from '../../../mock/data/enums';
import type { ComponentTemplate } from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';

const { Text } = Typography;
const now = () => new Date().toISOString();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });
const sel = (arr: readonly string[]) => arr.map((v) => ({ value: v, label: v }));

export interface ComponentTemplateTabProps {
  owner: { deviceTypeId?: string; moduleTypeId?: string };
  kinds: ComponentKind[];        // which kinds this tab covers (usually 1; pass-through covers front+rear)
  addKindDefault: ComponentKind; // default kind when adding
  templates: ComponentTemplate[];
}

/** Reusable per-kind component-template table + Add modal (device-type or module-type owned). */
export function ComponentTemplateTab({ owner, kinds, addKindDefault, templates }: ComponentTemplateTabProps) {
  const { message } = App.useApp();
  const create = useEntityCreate('componentTemplates');
  const recordAudit = useRecordAudit();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const rows = templates.filter((t) => kinds.includes(t.kind));
  const k = addKindDefault;

  function submit() {
    form.validateFields().then((v) => {
      const id = `CTPL-${Date.now().toString(36)}`;
      create.mutate({
        id, ctplId: id, ...owner, kind: v.kind ?? k, namePattern: v.namePattern, label: v.label, description: v.description,
        ifaceType: v.ifaceType, mgmtOnly: v.mgmtOnly, poeType: v.poeType, rfRole: v.rfRole, enabled: v.enabled ?? true,
        speedMbps: v.speedMbps, duplex: v.duplex, mtu: v.mtu,
        consoleType: v.consoleType, powerPortType: v.powerPortType, maxDrawW: v.maxDrawW, allocatedDrawW: v.allocatedDrawW,
        outletType: v.outletType, parentPowerPort: v.parentPowerPort, feedLeg: v.feedLeg, position: v.position,
        rearPortName: v.rearPortName, rearPortPosition: v.rearPortPosition, positions: v.positions, ...env(),
      }, {
        onSuccess: () => { recordAudit('ComponentTemplate', v.namePattern, 'created', `Added ${v.kind ?? k} template ${v.namePattern}`); message.success('Template added'); setOpen(false); form.resetFields(); },
      });
    });
  }

  // Columns vary by kind family
  const base: TableColumnType<ComponentTemplate>[] = [
    { title: 'Name', dataIndex: 'namePattern', render: (n: string) => <span>{n}</span> },
    { title: 'Label', dataIndex: 'label', render: (l?: string) => l ?? '—' },
  ];
  const byKind: Record<string, TableColumnType<ComponentTemplate>[]> = {
    interface: [
      { title: 'Type', dataIndex: 'ifaceType', render: (t?: string) => t ? <VwChip>{t}</VwChip> : '—' },
      { title: 'Speed', dataIndex: 'speedMbps', render: (s?: number) => s ? (s >= 1000 ? `${s / 1000}G` : `${s}M`) : '—' },
      { title: 'Duplex', dataIndex: 'duplex', render: (d?: string) => d ?? '—' },
      { title: 'MTU', dataIndex: 'mtu', render: (m?: number) => m ?? '—' },
      { title: 'Mgmt-only', dataIndex: 'mgmtOnly', render: (b?: boolean) => (b ? 'true' : 'false') },
      { title: 'PoE', dataIndex: 'poeType', render: (p?: string) => p ?? 'None' },
      { title: 'RF role', dataIndex: 'rfRole', render: (r?: string) => r ?? 'None' },
    ],
    console: [
      { title: 'Type', dataIndex: 'consoleType', render: (t?: string) => t ? <VwChip>{t}</VwChip> : '—' },
      { title: 'Description', dataIndex: 'description', ellipsis: true, render: (d?: string) => d ?? '—' },
    ],
    'power-port': [
      { title: 'Type', dataIndex: 'powerPortType', render: (t?: string) => t ? <VwChip>{t}</VwChip> : '—' },
      { title: 'Max draw (W)', dataIndex: 'maxDrawW', align: 'right', render: (n?: number) => n ?? '—' },
      { title: 'Allocated (W)', dataIndex: 'allocatedDrawW', align: 'right', render: (n?: number) => n ?? '—' },
    ],
    'power-outlet': [
      { title: 'Type', dataIndex: 'outletType', render: (t?: string) => t ? <VwChip>{t}</VwChip> : '—' },
      { title: 'Power port', dataIndex: 'parentPowerPort', render: (p?: string) => p ?? '—' },
      { title: 'Feed leg', dataIndex: 'feedLeg', render: (f?: string) => f ?? '—' },
    ],
    'module-bay': [
      { title: 'Position', dataIndex: 'position', render: (p?: string) => p ? <VwChip>{p}</VwChip> : '—' },
      { title: 'Description', dataIndex: 'description', ellipsis: true, render: (d?: string) => d ?? '—' },
    ],
    'front-port': [
      { title: 'Rear port', dataIndex: 'rearPortName', render: (r?: string) => r ? <span>{r}</span> : '—' },
      { title: 'Position', dataIndex: 'rearPortPosition', render: (p?: number) => p ?? 1 },
    ],
    'rear-port': [
      { title: 'Positions', dataIndex: 'positions', render: (p?: number) => p ?? 1 },
    ],
  };
  const cols = [...base, ...(byKind[k] ?? [])];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
        <Text type="secondary">Showing {rows.length}</Text>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Add</Button>
      </div>
      <Table<ComponentTemplate> rowKey="id" size="small" dataSource={rows} columns={cols} pagination={false} scroll={{ x: 'max-content' }} />

      <Modal title={`Add ${k} template`} open={open} onOk={submit} okText="Add" onCancel={() => setOpen(false)} confirmLoading={create.isPending}>
        <Form form={form} layout="vertical" initialValues={{ kind: k, enabled: true }}>
          {kinds.length > 1 && (
            <Form.Item name="kind" label="Kind"><Select placeholder="Select kind" options={sel(kinds)} /></Form.Item>
          )}
          <Form.Item name="namePattern" label="Name (use [1-48] for a range)" rules={[{ required: true }]}><Input placeholder="xe-0/0/[1-48]" /></Form.Item>
          <Form.Item name="label" label="Label"><Input placeholder="Server-facing" /></Form.Item>

          {k === 'interface' && (<>
            <Form.Item name="ifaceType" label="Type"><Select placeholder="Select type" options={sel(INTERFACE_TYPE)} /></Form.Item>
            <Space>
              <Form.Item name="speedMbps" label="Speed (Mbps)"><InputNumber placeholder="Enter speed (Mbps)" min={0} style={{ width: 130 }} /></Form.Item>
              <Form.Item name="duplex" label="Duplex" initialValue="auto"><Select placeholder="Select duplex" style={{ width: 110 }} options={sel(IF_DUPLEX)} /></Form.Item>
              <Form.Item name="mtu" label="MTU" initialValue={1500}><InputNumber placeholder="Enter MTU" min={0} style={{ width: 110 }} /></Form.Item>
            </Space>
            <Form.Item name="mgmtOnly" label="Management only" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="poeType" label="PoE type" initialValue="None"><Select placeholder="Select poE type" options={sel(POE_TYPE)} /></Form.Item>
            <Form.Item name="rfRole" label="RF role" initialValue="None"><Select placeholder="Select RF role" options={sel(RF_ROLE)} /></Form.Item>
          </>)}
          {(k === 'console' || k === 'console-server') && (<>
            <Form.Item name="consoleType" label="Type"><Select placeholder="Select type" options={sel(CONSOLE_TYPE)} /></Form.Item>
            <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" autoSize={{ minRows: 2, maxRows: 3 }} /></Form.Item>
          </>)}
          {k === 'power-port' && (<>
            <Form.Item name="powerPortType" label="Type" initialValue="AC"><Select placeholder="Select type" options={sel(POWER_PORT_TYPE)} /></Form.Item>
            <Form.Item name="maxDrawW" label="Maximum draw (W)"><InputNumber placeholder="Enter maximum draw (W)" min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="allocatedDrawW" label="Allocated draw (W)"><InputNumber placeholder="Enter allocated draw (W)" min={0} style={{ width: '100%' }} /></Form.Item>
          </>)}
          {k === 'power-outlet' && (<>
            <Form.Item name="outletType" label="Type" initialValue="IEC C13"><Select placeholder="Select type" options={sel(POWER_OUTLET_TYPE)} /></Form.Item>
            <Form.Item name="parentPowerPort" label="Parent power port"><Input placeholder="Feed-A" /></Form.Item>
            <Form.Item name="feedLeg" label="Feed leg"><Select placeholder="Select feed leg" allowClear options={sel(FEED_LEG)} /></Form.Item>
          </>)}
          {k === 'module-bay' && (<>
            <Form.Item name="position" label="Position"><Select placeholder="Select position" options={sel(MODULE_BAY_POSITION)} /></Form.Item>
            <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" autoSize={{ minRows: 2, maxRows: 3 }} /></Form.Item>
          </>)}
          {k === 'front-port' && (<>
            <Form.Item name="rearPortName" label="Maps to rear port (name)"><Input placeholder="Rear[1-48]" /></Form.Item>
            <Form.Item name="rearPortPosition" label="Rear port position" initialValue={1}><InputNumber placeholder="Enter rear port position" min={1} style={{ width: '100%' }} /></Form.Item>
          </>)}
          {k === 'rear-port' && (
            <Form.Item name="positions" label="Positions" initialValue={1} tooltip="How many front ports this rear port supports"><InputNumber placeholder="Enter positions" min={1} style={{ width: '100%' }} /></Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}

export default ComponentTemplateTab;
