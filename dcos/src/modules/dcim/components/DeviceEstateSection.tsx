/* Network role, monitoring, ownership and GPU details of one device (estate fields).
   Shared by the DCIM and NMS device pages. */
import { Link } from 'react-router-dom';
import type { Collector, Customer, DataCenter, Device, GpuCluster, RoutingSession } from '../../../mock/data/types';
import { routingSessionsOf, sessionPeer } from '../../facility/lib/estateRules';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { VwChip } from '../../../shared/components/ux';
import { Panel } from '../../../ops/ui/kit';
import { KvList } from '../../change/components/kit';
import { COLLECTOR_TONE, SESSION_TONE, clusterHref, fmtCapacity, collectorHref, customerHref, layerLabel, monitoringOf, MONITORING_LABEL } from '../lib/estateView';

const none = <span style={{ color: 'var(--vw-color-slate-400)' }}>Not recorded</span>;

export function DeviceEstateSection({ device, osFallback }: { device: Device; osFallback?: string }) {
  const collectors = (useEntityList('collectors', { pageSize: 2000 }).data?.data ?? []) as unknown as Collector[];
  const clusters = (useEntityList('gpuClusters', { pageSize: 2000 }).data?.data ?? []) as unknown as GpuCluster[];
  const customers = (useEntityList('customers', { pageSize: 2000 }).data?.data ?? []) as unknown as Customer[];
  const sites = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const allSessions = (useEntityList('routingSessions', { pageSize: 20000 }).data?.data ?? []) as unknown as RoutingSession[];
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const sessions = routingSessionsOf(allSessions, device.id);
  const devName = (id: string) => devices.find((d) => d.id === id)?.name ?? id;
  const col = collectors.find((c) => c.id === device.collectorId);
  const tenant = customers.find((c) => c.id === device.tenantCustomerId);
  const g = device.gpu;
  const cluster = g?.clusterId ? clusters.find((c) => c.id === g.clusterId) : undefined;
  const mon = monitoringOf(device);
  const siteName = (id?: string) => sites.find((s) => s.id === id)?.name ?? id;

  // Layer and WAN edge only mean something for network gear; servers, storage and GPU nodes skip them.
  const isNetworkGear = device.networkLayer != null || device.wanEdge != null || ['Network', 'Firewall', 'Router', 'Switch'].includes(String(device.category ?? ''));
  const network = [
    ...(isNetworkGear ? [
      { label: 'Network layer', value: layerLabel(device.networkLayer) ?? none },
      { label: 'WAN edge', value: device.wanEdge == null ? none : device.wanEdge ? 'Yes, connects the site to the WAN' : 'No' },
    ] : []),
    { label: 'OS version', value: device.osVersion ?? osFallback ?? none },
    { label: 'MAC address', value: device.macAddress ? <span className="mono">{device.macAddress}</span> : none },
    { label: 'Monitoring', value: <VwChip variant={mon === 'monitored' ? 'success' : mon === 'not-monitored' ? 'warning' : 'neutral'}>{MONITORING_LABEL[mon]}</VwChip> },
    { label: 'Collector', value: col
      ? <span><Link to={collectorHref(col.id)}>{col.name}</Link> · {col.protocol}{col.hostIp ? ` · ${col.hostIp}` : ''}{col.status ? <> · <VwChip variant={COLLECTOR_TONE[col.status] ?? 'neutral'}>{col.status}</VwChip></> : null}</span>
      : device.collectorId ? <span className="mono">{device.collectorId}</span> : mon === 'monitored' ? 'Monitored, collector not recorded' : none },
    { label: 'Owner', value: device.ownerKind === 'tenant' ? 'Tenant (customer equipment)' : device.ownerKind === 'operator' ? 'Operator' : none },
    ...(device.ownerKind === 'tenant' || device.tenantCustomerId ? [{ label: 'Tenant', value: tenant ? <Link to={customerHref(tenant.id)}>{tenant.name}</Link> : device.tenantCustomerId ?? none }] : []),
  ];

  return (
    <>
      <Panel title="Network, monitoring and ownership" style={{ marginBottom: 'var(--vw-space-md)' }}>
        <KvList items={network} columns={2} />
      </Panel>
      {g && (
        <Panel title="GPU" style={{ marginBottom: 'var(--vw-space-md)' }}>
          <KvList columns={2} items={[
            { label: 'Accelerators', value: `${g.count} × ${g.model}` },
            { label: 'Vendor', value: g.vendor },
            { label: 'Cooling', value: g.cooling === 'liquid' ? 'Liquid (direct to chip)' : 'Air' },
            { label: 'Driver', value: g.driver ?? none },
            { label: 'Firmware', value: g.firmware ?? none },
            { label: 'Cluster', value: cluster
              ? <span><Link to={clusterHref(cluster.id)}>{cluster.name}</Link> · {cluster.scheduler} · {siteName(cluster.dataCenterId)}</span>
              : g.clusterId ? <span className="mono">{g.clusterId}</span> : 'Not in a cluster' },
          ]} />
        </Panel>
      )}
      {sessions.length > 0 && (
        <Panel title={`Routing sessions (${sessions.length})`} style={{ marginBottom: 'var(--vw-space-md)' }}>
          <div className="nst-table-wrap"><table className="nst-table">
            <thead><tr><th>Protocol</th><th>Role</th><th>Local interface</th><th>Peer</th><th>Peer interface</th><th>Capacity</th><th>State</th></tr></thead>
            <tbody>{sessions.map((x) => { const p = sessionPeer(x, device.id); return (
              <tr key={x.id}>
                <td>{x.protocol}</td><td>{x.role ?? '—'}</td><td className="mono">{p.localIf ?? '—'}</td>
                <td><Link to={`/facility/devices/${p.deviceId}`}>{devName(p.deviceId)}</Link></td><td className="mono">{p.ifName ?? '—'}</td>
                <td>{fmtCapacity(x.capacityMbps) ?? '—'}</td>
                <td>{x.state ? <VwChip variant={SESSION_TONE[x.state] ?? 'neutral'}>{x.state}</VwChip> : '—'}</td>
              </tr>
            ); })}</tbody>
          </table></div>
          <div style={{ marginTop: 6 }}><Link to="/nms/discovery?view=routing">All routing sessions</Link></div>
        </Panel>
      )}
    </>
  );
}
