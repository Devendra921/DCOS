import { useState } from 'react';
import { App, Form, Modal, Select, Switch } from 'antd';
import { Globe, Plus, Star, Unlink } from 'lucide-react';
import { Btn, Chip, Empty, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import type { Tone } from '../../../ops/lib/tone';
import { useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import type { IPAddress, Interface } from '../../../mock/data/types';

const tone: Record<string, Tone> = { Allocated: 'info', Reserved: 'warning', Conflict: 'error', Available: 'neutral' };

/** DCIM↔IPAM bridge: the IP addresses bound to a device, with assign / set-primary / unassign. */
export function DeviceIpTab({ deviceId, deviceName }: { deviceId: string; deviceName: string }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const updateIp = useEntityUpdate('ipAddresses');
  const updateDevice = useEntityUpdate('devices');
  const audit = useRecordAudit();

  const mine = (useEntityList('ipAddresses', { filters: [{ field: 'deviceId', operator: 'eq', value: deviceId }], pageSize: 500 }).data?.data ?? []) as unknown as IPAddress[];
  const allIps = (useEntityList('ipAddresses', { pageSize: 3000 }).data?.data ?? []) as unknown as IPAddress[];
  const ifaces = (useEntityList('interfaces', { filters: [{ field: 'deviceId', operator: 'eq', value: deviceId }], pageSize: 500 }).data?.data ?? []) as unknown as Interface[];
  const ifaceName = Object.fromEntries(ifaces.map((i) => [i.id, i.name]));
  const unassigned = allIps.filter((i) => !i.deviceId);

  const setPrimary = (ip: IPAddress) => {
    // clear previous primary on this device, set this one
    mine.filter((i) => i.isPrimary && i.id !== ip.id).forEach((i) => updateIp.mutate({ id: i.id, data: { isPrimary: false } }));
    updateIp.mutate({ id: ip.id, data: { isPrimary: true } });
    updateDevice.mutate({ id: deviceId, data: { primaryIp4: ip.address } }, {
      onSuccess: () => { audit('Device', deviceId, 'updated', `Primary IP set to ${ip.address}`); message.success(`Primary IP set to ${ip.address}`); },
    });
  };

  const unassign = (ip: IPAddress) => {
    updateIp.mutate({ id: ip.id, data: { deviceId: undefined, interfaceId: undefined, isPrimary: false } }, {
      onSuccess: () => { audit('IP Address', ip.id, 'updated', `Unassigned ${ip.address} from ${deviceName}`); message.success(`Unassigned ${ip.address}`); },
    });
  };

  const submitAssign = async () => {
    const v = await form.validateFields();
    const ip = allIps.find((i) => i.id === v.ipId);
    if (!ip) return;
    updateIp.mutate({ id: ip.id, data: { deviceId, interfaceId: v.interfaceId, status: 'Allocated', isPrimary: !!v.isPrimary } }, {
      onSuccess: () => {
        audit('IP Address', ip.id, 'updated', `Assigned ${ip.address} to ${deviceName}`);
        if (v.isPrimary) {
          mine.filter((i) => i.isPrimary).forEach((i) => updateIp.mutate({ id: i.id, data: { isPrimary: false } }));
          updateDevice.mutate({ id: deviceId, data: { primaryIp4: ip.address } });
        }
        message.success(`Assigned ${ip.address}`);
        setOpen(false); form.resetFields();
      },
    });
  };

  const cols: Col<IPAddress>[] = [
    { key: 'address', header: 'Address', sort: (r) => r.address, render: (r) => (
      <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <span className={`mono${r.isPrimary ? ' strong' : ''}`}>{r.address}</span>
        {r.isPrimary && <Chip tone="success" size="xs">primary</Chip>}
      </span>
    ) },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip tone={tone[r.status] ?? 'neutral'} dot>{r.status}</Chip> },
    { key: 'interface', header: 'Interface', render: (r) => (r.interfaceId ? ifaceName[r.interfaceId] ?? '—' : '—') },
    { key: 'dns', header: 'DNS', render: (r) => r.dnsName ?? <span className="muted">—</span> },
    { key: 'a', header: 'Actions', render: (r) => (
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <Btn size="xs" variant="ghost" icon={Star} disabled={r.isPrimary} onClick={() => setPrimary(r)}>Primary</Btn>
        <Btn size="xs" variant="danger-subtle" icon={Unlink} onClick={() => unassign(r)}>Unassign</Btn>
      </div>
    ) },
  ];

  return (
    <Panel title="IP addresses" icon={Globe} count={mine.length} flush
      actions={<Btn size="sm" variant="filled" icon={Plus} onClick={() => setOpen(true)}>Assign IP</Btn>}>
      <DataTable rows={mine} cols={cols} pageSize={500}
        empty={<Empty icon={Globe} title="No IP addresses">No IP addresses bound to this device yet.</Empty>} />
      <Modal title={`Assign IP to ${deviceName}`} open={open} onOk={submitAssign} onCancel={() => setOpen(false)} okText="Assign" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="ipId" label="IP address" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="Pick an unassigned address"
              options={unassigned.slice(0, 1000).map((i) => ({ value: i.id, label: i.address }))} />
          </Form.Item>
          <Form.Item name="interfaceId" label="Interface">
            <Select allowClear showSearch optionFilterProp="label" placeholder="(device-level)"
              options={ifaces.map((i) => ({ value: i.id, label: i.name }))} />
          </Form.Item>
          <Form.Item name="isPrimary" label="Set as primary IPv4" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </Panel>
  );
}
export default DeviceIpTab;
