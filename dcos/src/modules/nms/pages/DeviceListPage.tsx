import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import { Download } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { RankList, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import type { Collector, Device, ManagedDevice } from '../../../mock/data/types';
import { LAYERS, LAYER_LABEL, MONITORING_LABEL, layerLabel, monitoringOf, type MonitoringState } from '../../dcim/lib/estateView';

const REACH = ['Reachable', 'Degraded', 'Unreachable'] as const;
const REACH_TONE: Record<string, Tone> = { Reachable: 'success', Degraded: 'warning', Unreachable: 'error' };
const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();

export default function DeviceListPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const dcF = useDcFilter();
  const list = useEntityList('managedDevices', { pageSize: 5000, filters: dcF });
  const managed = (list.data?.data ?? []) as unknown as ManagedDevice[];
  const inventory = (useEntityList('devices', { pageSize: 20000, filters: dcF }).data?.data ?? []) as unknown as Device[];
  const collectors = (useEntityList('collectors', { pageSize: 2000 }).data?.data ?? []) as unknown as Collector[];
  const devices = useMemo(() => {
    const byId = new Map(inventory.map((d) => [d.id, d]));
    const colName = new Map(collectors.map((c) => [c.id, c.name]));
    return managed.map((m) => {
      const inv = byId.get(m.id);
      return { ...m, layer: inv?.networkLayer ?? '', mon: inv ? monitoringOf(inv) : 'unknown' as MonitoringState, gpu: inv?.gpu, collector: inv?.collectorId ? colName.get(inv.collectorId) ?? inv.collectorId : '', wanEdge: !!inv?.wanEdge };
    });
  }, [managed, inventory, collectors]);
  type Row = (typeof devices)[number];
  const [q, setQ] = useState('');
  const [reachF, setReachF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [roleF, setRoleF] = useState('');
  const [vendorF, setVendorF] = useState('');
  const [layerF, setLayerF] = useState('');
  const [monF, setMonF] = useState('');
  const [gpuF, setGpuF] = useState('');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return devices.filter((d) => (!reachF || d.reachability === reachF) && (!typeF || d.deviceType === typeF)
      && (!roleF || d.role === roleF) && (!vendorF || d.vendor === vendorF)
      && (!layerF || (layerF === 'none' ? !d.layer : d.layer === layerF)) && (!monF || d.mon === monF)
      && (!gpuF || (gpuF === 'gpu' ? !!d.gpu : !d.gpu))
      && (!s || `${d.hostname} ${d.mgmtIp} ${d.deviceType} ${d.role} ${d.vendor} ${d.model}`.toLowerCase().includes(s)));
  }, [devices, q, reachF, typeF, roleF, vendorF, layerF, monF, gpuF]);

  const types = uniq(devices.map((d) => d.deviceType));
  const roles = uniq(devices.map((d) => d.role));
  const vendors = uniq(devices.map((d) => d.vendor));
  const count = (f: (d: Row) => boolean) => devices.filter(f).length;
  const reachParts = REACH.map((r) => ({ key: r, label: r, n: count((d) => d.reachability === r), tone: REACH_TONE[r] }));
  const vendorRank = vendors.map((v) => ({ key: v, label: v, n: count((d) => d.vendor === v), tone: 'info' as Tone, onClick: () => setVendorF(vendorF === v ? '' : v) }))
    .sort((a, b) => b.n - a.n).slice(0, 3);
  const typeRank = types.map((t) => ({ key: t, label: t, n: count((d) => d.deviceType === t), tone: 'purple' as Tone, onClick: () => setTypeF(typeF === t ? '' : t) }))
    .sort((a, b) => b.n - a.n).slice(0, 3);
  const pickReach = (r: string) => setReachF(reachF === r ? '' : r);

  const cols: Col<Row>[] = [
    { key: 'hostname', header: 'Hostname', sort: (d) => d.hostname, render: (d) => (
      <span className="cell-2"><span className="vw-card-activity-label">{d.hostname}</span><small>{d.model}</small></span>
    ) },
    { key: 'ip', header: 'Mgmt IP', sort: (d) => d.mgmtIp, render: (d) => <span className="mono">{d.mgmtIp}</span> },
    { key: 'type', header: 'Type', sort: (d) => d.deviceType, render: (d) => <Chip tone="neutral">{d.deviceType}</Chip> },
    { key: 'role', header: 'Role', sort: (d) => d.role, render: (d) => d.role },
    { key: 'layer', header: 'Layer', sort: (d) => d.layer, render: (d) => d.layer ? <span className="cell-2"><span>{layerLabel(d.layer)}</span>{d.wanEdge && <small>WAN edge</small>}</span> : <span className="faint">—</span> },
    { key: 'mon', header: 'Monitoring', sort: (d) => d.mon, render: (d) => d.mon === 'unknown' ? <span className="faint">Not recorded</span>
      : <span className="cell-2"><Chip tone={d.mon === 'monitored' ? 'success' : 'warning'} size="xs">{MONITORING_LABEL[d.mon]}</Chip>{d.collector && <small>{d.collector}</small>}</span> },
    { key: 'gpu', header: 'GPU', sort: (d) => d.gpu?.count ?? 0, render: (d) => d.gpu ? `${d.gpu.count} × ${d.gpu.model}` : <span className="faint">—</span>, hideBelow: 1200 },
    { key: 'vendor', header: 'Vendor', sort: (d) => d.vendor, render: (d) => (
      <span className="cell-2"><span>{d.vendor}</span><small>{d.osVersion}</small></span>
    ) },
    { key: 'reach', header: 'Reachability', sort: (d) => d.reachability, render: (d) => <Chip tone={REACH_TONE[d.reachability] ?? 'neutral'} dot>{d.reachability}</Chip> },
  ];

  return (
    <OpsPage title="Managed Devices" description="Every device under network management — reachability, type, role and vendor">

      <StatGrid cols={5}>
        <StatTile label="Managed devices" value={devices.length} sub={`${reachParts[0].n} reachable`}>
          <Split parts={reachParts} onPick={pickReach} active={reachF} />
        </StatTile>
        <StatTile label="Degraded" value={reachParts[1].n} sub={reachParts[1].n ? 'partially responding' : 'none degraded'} subTone={reachParts[1].n ? 'warn' : undefined}
          onClick={() => pickReach('Degraded')} active={reachF === 'Degraded'} />
        <StatTile label="Unreachable" value={reachParts[2].n} sub={reachParts[2].n ? 'not responding' : 'all responding'} subTone={reachParts[2].n ? 'bad' : undefined}
          onClick={() => pickReach('Unreachable')} active={reachF === 'Unreachable'} />
        <StatTile label="Device types" value={types.length} sub={`${roles.length} roles`}>
          <RankList items={typeRank} />
        </StatTile>
        <StatTile label="Vendors" value={vendors.length} sub="click to filter">
          <RankList items={vendorRank} />
        </StatTile>
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} onRow={(d) => navigate(`/nms/devices/${d.id}`)} defaultSort={{ key: 'hostname', dir: 'asc' }} pageSize={30}
          toolbar={
            <ListToolbar shown={rows.length} total={devices.length} noun="devices"
              search={{ value: q, onChange: setQ, placeholder: 'Search devices...' }}
              onRefresh={() => { void list.refetch(); }}
              actions={[{ label: 'Export', icon: Download, onClick: () => message.success(`Exported ${rows.length} managed devices records to CSV`) }]}
              filters={[
                { id: 'reach', label: 'Reachability', quick: true, value: reachF, anyLabel: 'All', onChange: setReachF, options: REACH.map((r) => ({ id: r, label: r, count: count((d) => d.reachability === r) })) },
                { id: 'type', label: 'Type', quick: true, value: typeF, anyLabel: 'Any type', onChange: setTypeF, options: types.map((t) => ({ id: t, label: t, count: count((d) => d.deviceType === t) })) },
                { id: 'role', label: 'Role', value: roleF, anyLabel: 'Any role', onChange: setRoleF, options: roles.map((r) => ({ id: r, label: r, count: count((d) => d.role === r) })) },
                { id: 'vendor', label: 'Vendor', value: vendorF, anyLabel: 'Any vendor', onChange: setVendorF, options: vendors.map((v) => ({ id: v, label: v, count: count((d) => d.vendor === v) })) },
                { id: 'layer', label: 'Layer', value: layerF, anyLabel: 'Any layer', onChange: setLayerF, options: [...LAYERS.map((l) => ({ id: l as string, label: LAYER_LABEL[l], count: count((d) => d.layer === l) })), { id: 'none', label: 'No layer', count: count((d) => !d.layer) }] },
                { id: 'mon', label: 'Monitoring', value: monF, anyLabel: 'Any', onChange: setMonF, options: (['monitored', 'not-monitored', 'unknown'] as MonitoringState[]).map((m) => ({ id: m as string, label: MONITORING_LABEL[m], count: count((d) => d.mon === m) })) },
                { id: 'gpu', label: 'GPU', value: gpuF, anyLabel: 'Any', onChange: setGpuF, options: [{ id: 'gpu', label: 'GPU servers', count: count((d) => !!d.gpu) }, { id: 'none', label: 'No GPU', count: count((d) => !d.gpu) }] },
              ]} />
          } />
      </section>
    </OpsPage>
  );
}
