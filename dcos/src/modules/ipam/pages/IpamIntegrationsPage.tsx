import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { useState } from 'react';
import { App } from 'antd';
import { Plug, Download, Upload, RefreshCw } from 'lucide-react';
import { Btn, Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { StatGrid, StatTile, SoftMeter } from '../../../ops/ui/Analytics';
import type { Tone } from '../../../ops/lib/tone';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';

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

const statusTone: Record<Connector['status'], Tone> = { Connected: 'success', Disconnected: 'neutral', Error: 'error' };

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

  const connected = connectors.filter((c) => c.status === 'Connected').length;

  const cols: Col<Connector>[] = [
    { key: 'name', header: 'System', sort: (r) => r.name, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.system}</small></span>
    ) },
    { key: 'direction', header: 'Direction', sort: (r) => r.direction, render: (r) => <Chip tone="neutral">{r.direction}</Chip> },
    { key: 'objects', header: 'Objects', render: (r) => r.objects },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip tone={statusTone[r.status]} dot>{r.status}</Chip> },
    { key: 'lastSync', header: 'Last sync', sort: (r) => r.lastSync ?? '', render: (r) => (r.lastSync ? new Date(r.lastSync).toLocaleString() : <span className="muted">never</span>) },
    { key: 'a', header: 'Actions', render: (r) => (
      <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
        {r.direction !== 'Export' && <Btn size="xs" icon={Download} disabled={busy === r.id} onClick={() => runSync(r, 'import')}>Import</Btn>}
        {r.direction !== 'Import' && <Btn size="xs" icon={Upload} disabled={busy === r.id} onClick={() => runSync(r, 'export')}>Export</Btn>}
        <Btn size="xs" variant="filled" icon={RefreshCw} disabled={busy === r.id} onClick={() => runSync(r, 'sync')}>{busy === r.id ? 'Syncing…' : 'Sync now'}</Btn>
      </div>
    ) },
  ];

  return (
    <OpsPage title={'Integrations'} description="Connected systems, sync status and address inventory.">
      <StatGrid cols={4}>
        <StatTile label="Connected systems" value={<>{connected}<small> / {connectors.length}</small></>} sub={connected < connectors.length ? `${connectors.length - connected} not connected` : 'all connected'} subTone={connected < connectors.length ? 'warn' : undefined}>
          <SoftMeter pct={connectors.length ? (connected / connectors.length) * 100 : 0} tone="success" />
        </StatTile>
        <StatTile label="IP addresses in scope" value={ipCount.toLocaleString()} />
        <StatTile label="Prefixes in scope" value={prefixCount.toLocaleString()} />
        <StatTile label="IP ranges in scope" value={rangeCount.toLocaleString()} />
      </StatGrid>

      <Panel title="Connectors" sub="External DDI, DNS, DHCP and ITSM systems" icon={Plug} count={connectors.length} flush>
        <DataTable rows={connectors} cols={cols} pageSize={50} />
      </Panel>
    </OpsPage>
  );
}
