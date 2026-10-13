import { useState } from 'react';
import { App, Form, Input, InputNumber, Modal, Select, Space, Switch } from 'antd';
import { Plus } from 'lucide-react';
import { Btn, Chip } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import {
  INTERFACE_TYPE, POE_TYPE, RF_ROLE, CONSOLE_TYPE, POWER_PORT_TYPE, POWER_OUTLET_TYPE, FEED_LEG, MODULE_BAY_POSITION, IF_DUPLEX,
} from '../../../mock/data/enums';
import type { ComponentKind } from '../../../mock/data/enums';
import type { ComponentTemplate } from '../../../mock/data/types';

const dash = <span className="muted">—</span>;
const tag = (t?: string) => (t ? <Chip tone="neutral">{t}</Chip> : dash);
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
  const base: Col<ComponentTemplate>[] = [
    { key: 'namePattern', header: 'Name', sort: (r) => r.namePattern, render: (r) => <span className="mono strong">{r.namePattern}</span> },
    { key: 'label', header: 'Label', render: (r) => r.label ?? dash },
  ];
  const byKind: Record<string, Col<ComponentTemplate>[]> = {
    interface: [
      { key: 'ifaceType', header: 'Type', render: (r) => tag(r.ifaceType) },
      { key: 'speedMbps', header: 'Speed', render: (r) => (r.speedMbps ? (r.speedMbps >= 1000 ? `${r.speedMbps / 1000}G` : `${r.speedMbps}M`) : dash) },
      { key: 'duplex', header: 'Duplex', render: (r) => r.duplex ?? dash },
      { key: 'mtu', header: 'MTU', render: (r) => r.mtu ?? dash },
      { key: 'mgmtOnly', header: 'Mgmt-only', render: (r) => (r.mgmtOnly ? 'true' : 'false') },
      { key: 'poeType', header: 'PoE', render: (r) => r.poeType ?? 'None' },
      { key: 'rfRole', header: 'RF role', render: (r) => r.rfRole ?? 'None' },
    ],
    console: [
      { key: 'consoleType', header: 'Type', render: (r) => tag(r.consoleType) },
      { key: 'description', header: 'Description', wrap: true, render: (r) => r.description ?? dash },
    ],
    'power-port': [
      { key: 'powerPortType', header: 'Type', render: (r) => tag(r.powerPortType) },
      { key: 'maxDrawW', header: 'Max draw (W)', align: 'right', render: (r) => <span className="num">{r.maxDrawW ?? '—'}</span> },
      { key: 'allocatedDrawW', header: 'Allocated (W)', align: 'right', render: (r) => <span className="num">{r.allocatedDrawW ?? '—'}</span> },
    ],
    'power-outlet': [
      { key: 'outletType', header: 'Type', render: (r) => tag(r.outletType) },
      { key: 'parentPowerPort', header: 'Power port', render: (r) => r.parentPowerPort ?? dash },
      { key: 'feedLeg', header: 'Feed leg', render: (r) => r.feedLeg ?? dash },
    ],
    'module-bay': [
      { key: 'position', header: 'Position', render: (r) => tag(r.position) },
      { key: 'description', header: 'Description', wrap: true, render: (r) => r.description ?? dash },
    ],
    'front-port': [
      { key: 'rearPortName', header: 'Rear port', render: (r) => (r.rearPortName ? <span className="mono">{r.rearPortName}</span> : dash) },
      { key: 'rearPortPosition', header: 'Position', render: (r) => r.rearPortPosition ?? 1 },
    ],
    'rear-port': [
      { key: 'positions', header: 'Positions', render: (r) => r.positions ?? 1 },
    ],
  };
  const cols = [...base, ...(byKind[k] ?? [])];

  return (
    <div>
      <div className="row between" style={{ margin: '8px 0' }}>
        <span className="muted" style={{ fontSize: 12.5 }}>Showing {rows.length}</span>
        <Btn variant="filled" size="sm" icon={Plus} onClick={() => setOpen(true)}>Add</Btn>
      </div>
      <DataTable<ComponentTemplate> rows={rows} cols={cols} pageSize={Math.max(25, rows.length)} />

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
