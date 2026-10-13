import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Descriptions, Empty, Space, Progress } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ArrowLeftOutlined } from '../../../shared/icons';
import { useEntityDetail, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { sevTag, REACH_COLOR } from '../components/nmsUtil';
import { EntityAuditTab, EntityDocumentsTab } from '../../../shared/components/detail';
import type { ManagedDevice, Interface, Alarm, ConfigBackup } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';

export default function DeviceDetailPage() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const { data } = useEntityDetail('managedDevices', deviceId);
  const ifaces = (useEntityList('interfaces', { filters: [{ field: 'deviceId', operator: 'eq', value: deviceId }], pageSize: 200 }).data?.data ?? []) as unknown as Interface[];
  const alarms = (useEntityList('alarms', { filters: [{ field: 'deviceId', operator: 'eq', value: deviceId }], pageSize: 200 }).data?.data ?? []) as unknown as Alarm[];
  const cfg = (useEntityList('configBackups', { filters: [{ field: 'deviceId', operator: 'eq', value: deviceId }], pageSize: 50 }).data?.data ?? []) as unknown as ConfigBackup[];
  const d = data as unknown as ManagedDevice | null;
  if (!d) return <div><Empty description="Device not found" /></div>;

  return (
    <div>
      <Space className="vw-card-section" style={{ marginBottom: "var(--vw-space-md)", width: '100%' }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/nms/devices')}>Devices</Button>
        <div className="vw-page-title" role="heading" aria-level={4}>{d.hostname}</div>
        <VwChip>{d.deviceType}</VwChip>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: REACH_COLOR[d.reachability], marginRight: 6 }} />{d.reachability}</span>
      </Space>
      <VwCard size="small">
        <Tabs items={[
          { key: 'overview', label: 'Overview', children: (
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Mgmt IP">{d.mgmtIp}</Descriptions.Item>
              <Descriptions.Item label="Vendor / Model">{d.vendor} {d.model}</Descriptions.Item>
              <Descriptions.Item label="OS">{d.osVersion}</Descriptions.Item>
              <Descriptions.Item label="Role">{d.role}</Descriptions.Item>
              <Descriptions.Item label="Source">{d.sourceSystem}</Descriptions.Item>
              <Descriptions.Item label="Rack">{d.rackId ? <a onClick={() => navigate(`/facility/racks/${d.rackId}`)}>{d.rackId}</a> : '—'}</Descriptions.Item>
            </Descriptions>
          ) },
          { key: 'if', label: `Interfaces (${ifaces.length})`, children: (
            <Table<Interface> size="small" rowKey="id" dataSource={ifaces} pagination={false}
              columns={[{ title: 'Name', dataIndex: 'name' }, { title: 'Oper', dataIndex: 'operStatus', render: (s: string) => <VwChip color={s === 'Up' ? 'green' : 'red'}>{s}</VwChip> }, { title: 'Speed', dataIndex: 'speedGbps', render: (v) => `${v}G` }, { title: 'Utilization', dataIndex: 'utilizationPct', render: (v: number) => <Progress percent={v} size="small" /> }]} scroll={{ x: 'max-content' }} />
          ) },
          { key: 'alarms', label: `Alarms (${alarms.length})`, children: (
            <Table<Alarm> size="small" rowKey="id" dataSource={alarms} pagination={false}
              columns={[{ title: 'Severity', dataIndex: 'severity', render: sevTag }, { title: 'Type', dataIndex: 'type' }, { title: 'State', dataIndex: 'state' }, { title: 'Raised', dataIndex: 'raisedAt', render: (d2: string) => d2?.slice(0, 16).replace('T', ' ') }]} scroll={{ x: 'max-content' }} />
          ) },
          { key: 'cfg', label: `Config (${cfg.length})`, children: (
            <Table<ConfigBackup> size="small" rowKey="id" dataSource={cfg} pagination={false}
              columns={[{ title: 'Version', dataIndex: 'version' }, { title: 'Captured', dataIndex: 'capturedAt', render: (d2: string) => d2?.slice(0, 10) }, { title: 'Golden', dataIndex: 'isGolden', render: (v: boolean) => v ? <VwChip color="green">golden</VwChip> : null }]} scroll={{ x: 'max-content' }} />
          ) },
          { key: 'activity', label: 'Activity', children: <EntityAuditTab entityType="ManagedDevice" entityId={d.hostname} /> },
          { key: 'docs', label: 'Documents', children: <EntityDocumentsTab entityId={d.id} /> },
        ]} />
      </VwCard>
    </div>
  );
}
