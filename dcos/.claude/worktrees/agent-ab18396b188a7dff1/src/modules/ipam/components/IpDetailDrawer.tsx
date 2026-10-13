import { App, Descriptions, Drawer, Empty, Select, Space, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { useNavigate } from 'react-router-dom';
import { useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { EntityCustomizeCard } from '../../../shared/customization';
import { VwChip } from '../../../shared/components/ux';
import type { IPAddress, Device, Interface, FHRPGroup, IpService, IpamRole, Subnet } from '../../../mock/data/types';

const color: Record<string, string> = { Allocated: 'blue', Reserved: 'gold', Conflict: 'red', Available: 'default' };
const { Text, Link } = Typography;

/** Per-IP detail with the reverse view: which device/interface, FHRP group, and services bind to this address. */
export function IpDetailDrawer({ ip, open, onClose }: { ip: IPAddress | null; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const updateIp = useEntityUpdate('ipAddresses');
  const audit = useRecordAudit();
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const ifaces = (useEntityList('interfaces', { pageSize: 10000 }).data?.data ?? []) as unknown as Interface[];
  const fhrp = (useEntityList('fhrpGroups', { pageSize: 500 }).data?.data ?? []) as unknown as FHRPGroup[];
  const services = (useEntityList('ipServices', { pageSize: 2000 }).data?.data ?? []) as unknown as IpService[];
  const roles = (useEntityList('ipamRoles', { pageSize: 500 }).data?.data ?? []) as unknown as IpamRole[];
  const subnets = (useEntityList('subnets', { pageSize: 1000 }).data?.data ?? []) as unknown as Subnet[];

  if (!ip) return null;
  const dev = devices.find((d) => d.id === ip.deviceId);
  const iface = ifaces.find((i) => i.id === ip.interfaceId);
  const grp = fhrp.find((f) => f.id === ip.fhrpGroupId);
  const role = roles.find((r) => r.id === ip.roleId);
  const prefix = subnets.find((s) => s.id === ip.subnetId);
  const boundServices = services.filter((s) => (s.ipAddressIds ?? []).includes(ip.id));

  const assignFhrp = (id?: string) => {
    updateIp.mutate({ id: ip.id, data: { fhrpGroupId: id } }, {
      onSuccess: () => { audit('IP Address', ip.id, 'updated', `${id ? 'Joined' : 'Left'} FHRP group for ${ip.address}`); message.success('FHRP group updated'); },
    });
  };

  return (
    <Drawer mask={false} title={<Space><Text strong>{ip.address}</Text><VwChip color={color[ip.status]}>{ip.status}</VwChip>{ip.isPrimary && <VwChip color="green">primary</VwChip>}</Space>} width={460} open={open} onClose={onClose}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Prefix">{prefix ? <Link onClick={() => navigate(`/ipam/subnets/${prefix.id}`)}>{prefix.cidr}</Link> : '—'}</Descriptions.Item>
        <Descriptions.Item label="Role">{role ? <VwChip color={role.color}>{role.name}</VwChip> : '—'}</Descriptions.Item>
        <Descriptions.Item label="DNS name">{ip.dnsName ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="MAC">{ip.macAddress ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Device">{dev ? <Link onClick={() => navigate(`/facility/devices/${dev.id}`)}>{dev.name}</Link> : '—'}</Descriptions.Item>
        <Descriptions.Item label="Interface">{iface?.name ?? '—'}</Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5} style={{ marginTop: "var(--vw-space-lg)" }}>FHRP gateway group</Typography.Title>
      <Space>
        <Select allowClear style={{ width: 240 }} placeholder="No FHRP group" value={grp?.id}
          onChange={(v) => assignFhrp(v)}
          options={fhrp.map((f) => ({ value: f.id, label: `${f.protocol} · group ${f.groupId}` }))} />
        {grp && <VwChip color="geekblue">{grp.protocol}</VwChip>}
      </Space>

      <Typography.Title level={5} style={{ marginTop: "var(--vw-space-lg)" }}>Application services ({boundServices.length})</Typography.Title>
      {boundServices.length ? (
        <Table<IpService> rowKey="id" size="small" pagination={false} dataSource={boundServices}
          columns={[
            { title: 'Service', dataIndex: 'name' },
            { title: 'Proto', dataIndex: 'protocol', render: (p: string) => <VwChip color="purple">{p}</VwChip> },
            { title: 'Ports', dataIndex: 'ports', render: (p: number[]) => (p ?? []).join(', ') },
          ]} scroll={{ x: 'max-content' }} />
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No services bound" />}
      <Button type="link" style={{ paddingLeft: 0, marginTop: "var(--vw-space-sm)" }} onClick={() => navigate('/ipam/services')}>Manage services →</Button>

      <div style={{ marginTop: "var(--vw-space-lg)" }}>
        <EntityCustomizeCard entityType="ipAddresses" record={ip} />
      </div>
    </Drawer>
  );
}
export default IpDetailDrawer;
