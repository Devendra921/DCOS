import { useState } from 'react';
import { App, Badge, Space, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { CloudSyncOutlined, DownloadOutlined, UploadOutlined, ApiOutlined, CheckCircleOutlined, EnvironmentOutlined, PartitionOutlined, NumberOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { KPICard } from '../../../shared/components/KPICard';

const { Text } = Typography;

type Direction = 'Import' | 'Export' | 'Bi-directional';
interface Connector {
  id: string; name: string; system: string; direction: Direction;
  status: 'Connected' | 'Disconnected' | 'Error'; objects: string; lastSync: string | null;
}

const INITIAL: Connector[] = [
  { id: 'snow', name: 'ServiceNow CMDB', system: 'ITSM', direction: 'Bi-directional', status: 'Connected', objects: 'IP Addresses, Prefixes, VRFs', lastSync: new Date(Date.now() - 36e5).toISOString() },
  { id: 'infoblox', name: 'Infoblox NIOS', system: 'DDI', direction: 'Bi-directional', status: 'Connected', objects: 'Prefixes, IP Ranges, IP Addresses', lastSync: new Date(Date.now() - 18e5).toISOString() },
  { id: 'bluecat', name: 'BlueCat Address Manager', system: 'DDI', direction: 'Import', status: 'Disconnected', objects: 'Aggregates, Prefixes', lastSync: null },
  { id: 'dns', name: 'Active Directory DNS', system: 'DNS', direction: 'Export', status: 'Connected', objects: 'IP Addresses (A/PTR)', lastSync: new Date(Date.now() - 72e5).toISOString() },
  { id: 'dhcp', name: 'ISC Kea DHCP', system: 'DHCP', direction: 'Export', status: 'Error', objects: 'IP Ranges (pools)', lastSync: new Date(Date.now() - 864e5).toISOString() },
];

const statusBadge: Record<Connector['status'], 'success' | 'default' | 'error'> = { Connected: 'success', Disconnected: 'default', Error: 'error' };

export default function IpamIntegrationsPage() {
  const { message } = App.useApp();
  const audit = useRecordAudit();
  const [connectors, setConnectors] = useState<Connector[]>(INITIAL);
  const [busy, setBusy] = useState<string | null>(null);

  const ipCount = useEntityList('ipAddresses', { pageSize: 1 }).data?.total ?? 0;
  const prefixCount = useEntityList('subnets', { pageSize: 1 }).data?.total ?? 0;
  const rangeCount = useEntityList('ipRanges', { pageSize: 1 }).data?.total ?? 0;

  const runSync = (c: Connector, action: 'sync' | 'import' | 'export') => {
    setBusy(c.id);
    setTimeout(() => {
      const now = new Date().toISOString();
      setConnectors((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: 'Connected', lastSync: now } : x)));
      setBusy(null);
      audit('Integration', c.id, 'synced', `${action} via ${c.name}`);
      message.success(`${c.name}: ${action} completed (mock)`);
    }, 700);
  };

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>IPAM Integrations</div>

      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '8px 0 16px' }}>
        <KPICard title="Connected systems" value={connectors.filter((c) => c.status === 'Connected').length} suffix={`/ ${connectors.length}`} icon={<CheckCircleOutlined />} iconTone="success" />
        <KPICard title="IP addresses in scope" value={ipCount} icon={<EnvironmentOutlined />} iconTone="info" />
        <KPICard title="Prefixes in scope" value={prefixCount} icon={<PartitionOutlined />} iconTone="cyan" />
        <KPICard title="IP ranges in scope" value={rangeCount} icon={<NumberOutlined />} iconTone="purple" />
      </div>

      <VwCard size="small" title={<Space><ApiOutlined />Connectors</Space>}>
        <Table<Connector>
          rowKey="id" size="middle" pagination={false} dataSource={connectors}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'System', dataIndex: 'name', render: (n: string, r) => <Space direction="vertical" size={0}><Text strong>{n}</Text><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{r.system}</Text></Space> },
            { title: 'Direction', dataIndex: 'direction', render: (d: Direction) => <VwChip>{d}</VwChip> },
            { title: 'Objects', dataIndex: 'objects' },
            { title: 'Status', dataIndex: 'status', render: (s: Connector['status']) => <Badge status={statusBadge[s]} text={s} /> },
            { title: 'Last sync', dataIndex: 'lastSync', render: (d: string | null) => (d ? new Date(d).toLocaleString() : 'never') },
            {
              title: 'Actions', key: 'a', width: 280, render: (_: unknown, r) => (
                <Space>
                  {r.direction !== 'Export' && <Button size="small" icon={<DownloadOutlined />} loading={busy === r.id} onClick={() => runSync(r, 'import')}>Import</Button>}
                  {r.direction !== 'Import' && <Button size="small" icon={<UploadOutlined />} loading={busy === r.id} onClick={() => runSync(r, 'export')}>Export</Button>}
                  <Button size="small" type="primary" icon={<CloudSyncOutlined />} loading={busy === r.id} onClick={() => runSync(r, 'sync')}>Sync now</Button>
                </Space>
              ),
            },
          ]}
        />
      </VwCard>
    </div>
  );
}
