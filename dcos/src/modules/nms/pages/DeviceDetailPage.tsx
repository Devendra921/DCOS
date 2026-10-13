import { useState } from 'react';
import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
import { useParams, useNavigate } from 'react-router-dom';
import { Bell, FileCode2, Info, Network } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty, KV, Panel, Tabs } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Meter } from '../../../ops/ui/status';
import { StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityDetail, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { DeviceEstateSection } from '../../dcim/components/DeviceEstateSection';
import { EntityAuditTab, EntityDocumentsTab } from '../../../shared/components/detail';
import type { ManagedDevice, Interface, Alarm, ConfigBackup, Device } from '../../../mock/data/types';

const REACH_TONE: Record<string, Tone> = { Reachable: 'success', Degraded: 'warning', Unreachable: 'error' };
const SEV_TONE: Record<string, Tone> = { Critical: 'error', Major: 'orange', Minor: 'warning', Warning: 'info', Info: 'neutral' };
type TabId = 'overview' | 'if' | 'alarms' | 'cfg' | 'activity' | 'docs';

export default function DeviceDetailPage() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>('overview');
  const { data } = useEntityDetail('managedDevices', deviceId);
  const ifaces = (useEntityList('interfaces', { filters: [{ field: 'deviceId', operator: 'eq', value: deviceId }], pageSize: 200 }).data?.data ?? []) as unknown as Interface[];
  const alarms = (useEntityList('alarms', { filters: [{ field: 'deviceId', operator: 'eq', value: deviceId }], pageSize: 200 }).data?.data ?? []) as unknown as Alarm[];
  const cfg = (useEntityList('configBackups', { filters: [{ field: 'deviceId', operator: 'eq', value: deviceId }], pageSize: 50 }).data?.data ?? []) as unknown as ConfigBackup[];
  const inv = useEntityDetail('devices', deviceId).data as unknown as Device | null;
  const d = data as unknown as ManagedDevice | null;
  if (!d) return <PageEmptyState title="Device not found" />;

  const upCount = ifaces.filter((i) => i.operStatus === 'Up').length;
  const meanUtil = ifaces.length ? Math.round(ifaces.reduce((a, i) => a + (i.utilizationPct ?? 0), 0) / ifaces.length) : 0;
  const golden = cfg.filter((c) => c.isGolden).length;

  const ifCols: Col<Interface>[] = [
    { key: 'name', header: 'Name', sort: (r) => r.name, render: (r) => <span className="mono">{r.name}</span> },
    { key: 'oper', header: 'Oper', sort: (r) => r.operStatus, render: (r) => <Chip tone={r.operStatus === 'Up' ? 'success' : 'error'} dot>{r.operStatus}</Chip> },
    { key: 'speed', header: 'Speed', align: 'right', sort: (r) => r.speedGbps, render: (r) => <span className="num">{r.speedGbps}G</span> },
    { key: 'util', header: 'Utilization', sort: (r) => r.utilizationPct, render: (r) => <Meter pct={r.utilizationPct} /> },
  ];
  const alarmCols: Col<Alarm>[] = [
    { key: 'sev', header: 'Severity', sort: (r) => r.severity, render: (r) => <Chip tone={SEV_TONE[r.severity] ?? 'neutral'}>{r.severity}</Chip> },
    { key: 'type', header: 'Type', sort: (r) => r.type, render: (r) => r.type },
    { key: 'state', header: 'State', sort: (r) => r.state, render: (r) => r.state },
    { key: 'raised', header: 'Raised', sort: (r) => r.raisedAt ?? '', render: (r) => <span className="num">{r.raisedAt?.slice(0, 16).replace('T', ' ')}</span> },
  ];
  const cfgCols: Col<ConfigBackup>[] = [
    { key: 'v', header: 'Version', sort: (r) => r.version, render: (r) => <span className="mono">{r.version}</span> },
    { key: 'at', header: 'Captured', sort: (r) => r.capturedAt ?? '', render: (r) => <span className="num">{r.capturedAt?.slice(0, 10)}</span> },
    { key: 'g', header: 'Golden', render: (r) => r.isGolden ? <Chip tone="success">golden</Chip> : null },
  ];

  return (
    <OpsPage title={d.hostname}
      description={`${d.vendor} ${d.model} · ${d.mgmtIp}`}
      actions={<><Chip tone="neutral">{d.deviceType}</Chip><Chip tone={REACH_TONE[d.reachability] ?? 'neutral'} dot>{d.reachability}</Chip></>}>

      <StatGrid cols={4}>
        <StatTile label="Interfaces" value={ifaces.length} sub={`${upCount} up`} subTone={ifaces.length && upCount < ifaces.length ? 'warn' : undefined} />
        <StatTile label="Mean utilization" value={<>{meanUtil}<small>%</small></>} sub="across interfaces" />
        <StatTile label="Alarms" value={alarms.length} sub={alarms.length ? 'on this device' : 'none'} subTone={alarms.length ? 'warn' : undefined} />
        <StatTile label="Config backups" value={cfg.length} sub={`${golden} golden`} />
      </StatGrid>

      <Tabs<TabId> value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'if', label: 'Interfaces', count: ifaces.length },
        { id: 'alarms', label: 'Alarms', count: alarms.length },
        { id: 'cfg', label: 'Config', count: cfg.length },
        { id: 'activity', label: 'Activity' },
        { id: 'docs', label: 'Documents' },
      ]} />

      {tab === 'overview' && (
        <>
        <Panel title="Device" icon={Info}>
          <KV cols={3} items={[
            ['Mgmt IP', <span className="mono">{d.mgmtIp}</span>],
            ['Vendor / Model', `${d.vendor} ${d.model}`],
            ['OS', d.osVersion],
            ['Role', d.role],
            ['Source', d.sourceSystem],
            ['Rack', d.rackId ? <a className="ent-link" onClick={() => navigate(`/facility/racks/${d.rackId}`)}>{d.rackId}</a> : '—'],
            ...(inv ? [['Inventory record', <a className="ent-link" onClick={() => navigate(`/facility/devices/${inv.id}`)}>{inv.name}</a>] as [string, React.ReactNode]] : []),
          ]} />
        </Panel>
        {inv && <DeviceEstateSection device={inv} osFallback={d.osVersion} />}
        </>
      )}
      {tab === 'if' && (
        <Panel title="Interfaces" icon={Network} count={ifaces.length} flush>
          <DataTable rows={ifaces} cols={ifCols} pageSize={200} empty={<Empty icon={Network} title="No interfaces" />} />
        </Panel>
      )}
      {tab === 'alarms' && (
        <Panel title="Alarms" icon={Bell} count={alarms.length} flush>
          <DataTable rows={alarms} cols={alarmCols} pageSize={200} empty={<Empty icon={Bell} title="No alarms" />} />
        </Panel>
      )}
      {tab === 'cfg' && (
        <Panel title="Config backups" icon={FileCode2} count={cfg.length} flush>
          <DataTable rows={cfg} cols={cfgCols} pageSize={50} empty={<Empty icon={FileCode2} title="No config backups" />} />
        </Panel>
      )}
      {tab === 'activity' && <Panel title="Activity"><EntityAuditTab entityType="ManagedDevice" entityId={d.hostname} /></Panel>}
      {tab === 'docs' && <Panel title="Documents"><EntityDocumentsTab entityId={d.id} /></Panel>}
    </OpsPage>
  );
}
