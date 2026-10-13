import { useState } from 'react';
import { App, Form, Modal, Select, Space, Switch, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined, StarFilled, StarOutlined, DisconnectOutlined } from '../../../shared/icons';
import { useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { VwCard, VwChip } from '../../../shared/components/ux';
import type { IPAddress, Interface } from '../../../mock/data/types';

const color: Record<string, string> = { Allocated: 'blue', Reserved: 'gold', Conflict: 'red', Available: 'default' };
const { Text } = Typography;

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

  return (
    <VwCard size="small" title={`IP addresses (${mine.length})`} extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Assign IP</Button>}>
      <Table<IPAddress>
        rowKey="id" size="small" pagination={false} dataSource={mine}
        locale={{ emptyText: 'No IP addresses bound to this device yet.' }}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Address', dataIndex: 'address', render: (a: string, r) => <Space>{r.isPrimary && <VwChip color="green">primary</VwChip>}<Text strong={r.isPrimary}>{a}</Text></Space> },
          { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={color[s]}>{s}</VwChip> },
          { title: 'Interface', dataIndex: 'interfaceId', render: (id?: string) => (id ? ifaceName[id] ?? '—' : '—') },
          { title: 'DNS', dataIndex: 'dnsName' },
          {
            title: 'Actions', key: 'a', width: 200, render: (_: unknown, r) => (
              <Space>
                <Button size="small" type="link" icon={r.isPrimary ? <StarFilled /> : <StarOutlined />} disabled={r.isPrimary} onClick={() => setPrimary(r)}>Primary</Button>
                <Button size="small" type="link" danger icon={<DisconnectOutlined />} onClick={() => unassign(r)}>Unassign</Button>
              </Space>
            ),
          },
        ]}
      />
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
    </VwCard>
  );
}
export default DeviceIpTab;
