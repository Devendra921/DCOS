import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Cpu, Server, Zap } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Drawer, Empty, KV, Panel } from '../../../ops/ui/kit';
import { SoftMeter, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { BarList } from '../../../ops/charts/BarList';
import { fmtNum } from '../../../ops/lib/format';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import type { Collector, ComputeResource, Customer, DataCenter, Device, GpuCluster, Hall, Rack, Service } from '../../../mock/data/types';
import { CLUSTER_TONE, collectorHref, fmtMoney, fmtMoneyTotals, gpuTotalsByModel, monitoringOf, MONITORING_LABEL, racksOfService, servicesOn } from '../../dcim/lib/estateView';
import { gpuClusterSummary, type GpuClusterSummary } from '../../facility/lib/estateRules';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const p = (u: number, t: number) => (t > 0 ? Math.round((u / t) * 100) : 0);
type ClusterRow = GpuClusterSummary & { id: string; site: string; room: string };
const COOLING_LABEL = { air: 'Air', liquid: 'Liquid', mixed: 'Air and liquid' } as const;

export default function ComputeCapacityPage() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const openId = sp.get('cluster') ?? '';
  const setOpen = (id: string) => { const n = new URLSearchParams(sp); if (id) n.set('cluster', id); else n.delete('cluster'); setSp(n, { replace: true }); };
  const dcF = useDcFilter();
  const dcFScope = useDcFilter('scopeId');
  const comp = (useEntityList('computeResources', { pageSize: 200, filters: dcFScope }).data?.data ?? []) as unknown as ComputeResource[];
  const clusters = (useEntityList('gpuClusters', { pageSize: 2000, filters: dcF }).data?.data ?? []) as unknown as GpuCluster[];
  const devices = (useEntityList('devices', { pageSize: 20000, filters: dcF }).data?.data ?? []) as unknown as Device[];
  const sites = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const halls = (useEntityList('halls', { pageSize: 5000 }).data?.data ?? []) as unknown as Hall[];

  const gpuU = sum(comp.map((c) => c.gpuCountUsed)), gpuT = sum(comp.map((c) => c.gpuCountTotal));
  const cpuU = sum(comp.map((c) => c.cpuCoresUsed)), cpuT = sum(comp.map((c) => c.cpuCoresTotal));
  const memU = sum(comp.map((c) => c.memoryGbUsed)), memT = sum(comp.map((c) => c.memoryGbTotal));
  const stoU = sum(comp.map((c) => c.storageTbUsed)), stoT = sum(comp.map((c) => c.storageTbTotal));

  const [q, setQ] = useState('');
  const [siteF, setSiteF] = useState('');
  const [modelF, setModelF] = useState('');
  const [statusF, setStatusF] = useState('');

  const gpuNodes = useMemo(() => devices.filter((d) => d.gpu), [devices]);
  const rows: ClusterRow[] = useMemo(() => {
    const siteName = new Map(sites.map((s) => [s.id, s.name]));
    const hallName = new Map(halls.map((h) => [h.id, h.name]));
    return clusters.map((c) => ({ ...gpuClusterSummary(c, gpuNodes), id: c.id, site: siteName.get(c.dataCenterId) ?? c.dataCenterId, room: c.hallId ? hallName.get(c.hallId) ?? c.hallId : '' }));
  }, [clusters, gpuNodes, sites, halls]);
  const byModel = useMemo(() => gpuTotalsByModel(gpuNodes), [gpuNodes]);
  const shown = rows.filter((r) => (!siteF || r.cluster.dataCenterId === siteF) && (!modelF || r.cluster.gpuModel === modelF) && (!statusF || (r.cluster.status ?? '') === statusF)
    && (!q || `${r.cluster.name} ${r.cluster.gclId} ${r.site} ${r.room} ${r.cluster.gpuModel} ${r.cluster.scheduler} ${r.cluster.fabric}`.toLowerCase().includes(q.toLowerCase())));
  const clusterSites = [...new Set(rows.map((r) => r.cluster.dataCenterId))];
  const models = [...new Set(rows.map((r) => r.cluster.gpuModel))].sort();
  const statuses = [...new Set(rows.map((r) => r.cluster.status ?? ''))].filter(Boolean);
  const gpusFitted = sum(gpuNodes.map((d) => d.gpu?.count ?? 0));
  const clusteredGpus = sum(rows.map((r) => r.gpus));
  const live = rows.filter((r) => r.cluster.status === 'Live').length;

  const cols: Col<ClusterRow>[] = [
    { key: 'name', header: 'Cluster', sort: (r) => r.cluster.name, render: (r) => <span className="cell-2"><b className="strong">{r.cluster.name}</b><small className="mono">{r.cluster.gclId}</small></span> },
    { key: 'site', header: 'Site · room', sort: (r) => `${r.site} ${r.room}`, render: (r) => <span className="cell-2"><span>{r.site}</span><small>{r.room || 'Room not recorded'}</small></span> },
    { key: 'model', header: 'GPU model', sort: (r) => r.cluster.gpuModel, render: (r) => r.cluster.gpuModel },
    { key: 'nodes', header: 'Nodes', align: 'right', sort: (r) => r.nodeCount, render: (r) => <span className="cell-2 num" style={{ alignItems: 'flex-end' }}>{fmtNum(r.nodeCount)}{r.liveNodes < r.nodeCount && <small>{fmtNum(r.liveNodes)} active</small>}</span> },
    { key: 'gpus', header: 'GPUs', align: 'right', sort: (r) => r.gpus, render: (r) => <span className="num">{fmtNum(r.gpus)}</span> },
    { key: 'cool', header: 'Cooling', sort: (r) => r.cluster.cooling, render: (r) => COOLING_LABEL[r.cooling] },
    { key: 'sched', header: 'Scheduler', sort: (r) => r.cluster.scheduler, render: (r) => r.cluster.scheduler },
    { key: 'fabric', header: 'Fabric', sort: (r) => r.cluster.fabric, render: (r) => r.cluster.fabric, hideBelow: 1280 },
    { key: 'racks', header: 'Racks', align: 'right', sort: (r) => r.rackIds.length, render: (r) => <span className="num">{r.rackIds.length}</span> },
    { key: 'status', header: 'Status', sort: (r) => r.cluster.status ?? '', render: (r) => (r.cluster.status ? <Chip tone={CLUSTER_TONE[r.cluster.status] ?? 'neutral'} size="xs" dot>{r.cluster.status}</Chip> : <span className="faint">—</span>) },
  ];

  const pool = (key: string, label: string, u: number, t: number, unit: string, color?: string) =>
    ({ key, label, sublabel: `${u.toLocaleString()}/${t.toLocaleString()} ${unit}`, value: p(u, t), display: `${p(u, t)}%`, color });
  const open = rows.find((r) => r.id === openId);

  return (
    <OpsPage title="Compute & GPU capacity" description="GPU clusters and servers, and the GPU, CPU, memory and storage left across the estate."
      actions={<Btn variant="filled" icon={Zap} onClick={() => navigate(`/planning/new?intent=${encodeURIComponent(`Add ${Math.max(8, Math.round(gpuT * 0.2))} GPUs of compute capacity as a GPU pod`)}`)}>Raise capacity plan</Btn>}>
      <StatGrid cols={6}>
        <StatTile label="GPU utilisation" value={<>{p(gpuU, gpuT)}<small>%</small></>} sub={`${fmtNum(gpuU)} of ${fmtNum(gpuT)} GPU slots in use`}><SoftMeter pct={p(gpuU, gpuT)} tone="purple" /></StatTile>
        <StatTile label="GPU clusters" value={rows.length} sub={rows.length ? `${live} live · ${clusterSites.length} site${clusterSites.length === 1 ? '' : 's'}` : 'none recorded'} />
        <StatTile label="GPU servers" value={fmtNum(gpuNodes.length)} sub={`${fmtNum(gpusFitted)} GPUs fitted · ${fmtNum(clusteredGpus)} in clusters`} />
        <StatTile label="GPU slots free" value={fmtNum(gpuT - gpuU)} sub="accelerators available" />
        <StatTile label="CPU cores free" value={fmtNum(cpuT - cpuU)} sub={`of ${fmtNum(cpuT)} cores`} />
        <StatTile label="Storage free" value={<>{fmtNum(stoT - stoU)}<small> TB</small></>} sub={`of ${fmtNum(stoT)} TB`} />
      </StatGrid>

      <Panel title="GPU clusters" icon={Server} count={rows.length} sub="Each cluster's nodes are the GPU servers that name it. Open one for its nodes and the services that use them." flush>
        {rows.length === 0 ? <Empty icon={Server} title="No GPU clusters recorded">Clusters appear here once they are recorded or imported.</Empty> : (
          <DataTable rows={shown} cols={cols} onRow={(r) => setOpen(r.id)} defaultSort={{ key: 'gpus', dir: 'desc' }} pageSize={20}
            toolbar={<ListToolbar shown={shown.length} total={rows.length} noun="clusters" search={{ value: q, onChange: setQ, placeholder: 'Search clusters, sites, fabric…' }}
              filters={[
                { id: 'site', label: 'Site', quick: true, value: siteF, anyLabel: 'Any site', onChange: setSiteF, options: clusterSites.map((id) => ({ id, label: rows.find((r) => r.cluster.dataCenterId === id)?.site ?? id, count: rows.filter((r) => r.cluster.dataCenterId === id).length })) },
                { id: 'model', label: 'GPU model', quick: true, value: modelF, anyLabel: 'Any model', onChange: setModelF, options: models.map((m) => ({ id: m, label: m, count: rows.filter((r) => r.cluster.gpuModel === m).length })) },
                { id: 'status', label: 'Status', value: statusF, anyLabel: 'Any status', onChange: setStatusF, options: statuses.map((s) => ({ id: s, label: s, count: rows.filter((r) => r.cluster.status === s).length })) },
              ]} />} />
        )}
      </Panel>

      <div className="grid g-2">
        <Panel title="GPUs by model" icon={Cpu} sub="Every GPU server in scope, clustered or not." flush>
          {byModel.length === 0 ? <Empty icon={Cpu} title="No GPU servers recorded" /> : (
            <div className="nst-table-wrap"><table className="nst-table dt-table">
              <thead><tr><th>Model</th><th>Vendor</th><th className="is-right">Servers</th><th className="is-right">GPUs</th><th className="is-right">Liquid-cooled</th><th className="is-right">In a cluster</th></tr></thead>
              <tbody>
                {byModel.map((m) => <tr key={m.model}><td>{m.model}</td><td>{m.vendor}</td><td className="is-right num">{fmtNum(m.nodes)}</td><td className="is-right num">{fmtNum(m.gpus)}</td><td className="is-right num">{fmtNum(m.liquid)}</td><td className="is-right num">{fmtNum(m.clustered)}</td></tr>)}
                <tr><td><b>Total</b></td><td /><td className="is-right num"><b>{fmtNum(gpuNodes.length)}</b></td><td className="is-right num"><b>{fmtNum(gpusFitted)}</b></td><td className="is-right num">{fmtNum(sum(byModel.map((m) => m.liquid)))}</td><td className="is-right num">{fmtNum(sum(byModel.map((m) => m.clustered)))}</td></tr>
              </tbody>
            </table></div>
          )}
        </Panel>
        <Panel title="Estate compute pools" sub="Share of each pool in use" icon={Cpu}>
          <BarList max={100} items={[
            pool('gpu', 'GPU', gpuU, gpuT, 'GPUs', 'var(--vw-color-purple-500)'),
            pool('cpu', 'CPU cores', cpuU, cpuT, 'cores'),
            pool('mem', 'Memory', memU, memT, 'GB'),
            pool('sto', 'Storage', stoU, stoT, 'TB'),
          ]} />
        </Panel>
      </div>

      {open && <ClusterDrawer row={open} onClose={() => setOpen('')} />}
    </OpsPage>
  );
}

function ClusterDrawer({ row, onClose }: { row: ClusterRow; onClose: () => void }) {
  const services = (useEntityList('services', { pageSize: 20000 }).data?.data ?? []) as unknown as Service[];
  const customers = (useEntityList('customers', { pageSize: 2000 }).data?.data ?? []) as unknown as Customer[];
  const racks = (useEntityList('racks', { pageSize: 20000, filters: [{ field: 'dataCenterId', operator: 'eq', value: row.cluster.dataCenterId }] }).data?.data ?? []) as unknown as Rack[];
  const collectors = (useEntityList('collectors', { pageSize: 2000 }).data?.data ?? []) as unknown as Collector[];
  const c = row.cluster;
  const rackName = new Map(racks.map((r) => [r.id, r.name]));
  const custName = new Map(customers.map((x) => [x.id, x.name]));
  const colName = new Map(collectors.map((x) => [x.id, x.name]));
  const using = servicesOn(services, new Set(row.nodes.map((d) => d.id)), new Set(row.rackIds));
  const drivers = [...new Set(row.nodes.map((d) => d.gpu?.driver).filter(Boolean))];
  const firmware = [...new Set(row.nodes.map((d) => d.gpu?.firmware).filter(Boolean))];
  const nodes = [...row.nodes].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Drawer open onClose={onClose} width={760} title={c.name} sub={<>{c.gclId} · {row.site}{row.room ? ` · ${row.room}` : ''}</>}
      head={c.status ? <div style={{ marginTop: 6 }}><Chip tone={CLUSTER_TONE[c.status] ?? 'neutral'} size="xs" dot>{c.status}</Chip></div> : undefined}>
      <div className="col" style={{ gap: 'var(--vw-space-lg)' }}>
        <KV cols={3} items={[
          ['GPU model', `${c.gpuModel} · ${row.vendor}`], ['Nodes', `${fmtNum(row.nodeCount)} · ${fmtNum(row.liveNodes)} active`], ['GPUs', fmtNum(row.gpus)],
          ['Cooling', COOLING_LABEL[row.cooling]], ['Scheduler', c.scheduler], ['Fabric', c.fabric],
          ['Server models', row.serverModels.length ? row.serverModels.join(', ') : 'Not recorded'], ['Power draw', `${row.drawKw} kW`],
          ['Racks', row.rackIds.length ? row.rackIds.map((id, i) => <span key={id}>{i ? ', ' : ''}<Link to={`/facility/racks/${id}`}>{rackName.get(id) ?? id}</Link></span>) : 'None'],
          ['Driver', drivers.length ? drivers.join(', ') : 'Not recorded'], ['Firmware', firmware.length ? firmware.join(', ') : 'Not recorded'],
        ]} />

        <section>
          <h3 style={{ marginBottom: 8 }}>Nodes <span className="muted">({row.nodes.length})</span></h3>
          {nodes.length === 0 ? <span className="muted">No GPU server names this cluster yet.</span> : (
            <div className="nst-table-wrap" style={{ maxHeight: 340, overflow: 'auto' }}><table className="nst-table dt-table">
              <thead><tr><th>Node</th><th>Rack</th><th className="is-right">GPUs</th><th>Driver</th><th>Firmware</th><th>Monitoring</th></tr></thead>
              <tbody>{nodes.map((d) => {
                const m = monitoringOf(d);
                return (
                  <tr key={d.id}>
                    <td><Link to={`/facility/devices/${d.id}`}>{d.name}</Link></td>
                    <td>{d.rackId ? <Link to={`/facility/racks/${d.rackId}`}>{rackName.get(d.rackId) ?? d.rackId}</Link> : '—'}{d.position != null ? ` · U${d.position}` : ''}</td>
                    <td className="is-right num">{d.gpu?.count ?? 0}</td>
                    <td>{d.gpu?.driver ?? '—'}</td>
                    <td>{d.gpu?.firmware ?? '—'}</td>
                    <td>{d.collectorId ? <Link to={collectorHref(d.collectorId)}>{colName.get(d.collectorId) ?? d.collectorId}</Link> : MONITORING_LABEL[m]}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </section>

        <section>
          <h3 style={{ marginBottom: 8 }}>Services using these nodes <span className="muted">({using.length})</span></h3>
          {using.length === 0 ? <span className="muted">No service is recorded on these nodes or their racks.</span> : (
            <>
              <div className="nst-table-wrap"><table className="nst-table dt-table">
                <thead><tr><th>Service</th><th>Customer</th><th>Type</th><th className="is-right">Racks</th><th>Started</th><th className="is-right">Revenue / month</th></tr></thead>
                <tbody>{using.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/services/${s.id}`}>{s.name || s.id}</Link></td>
                    <td>{custName.has(s.customerRef) ? <Link to={`/customers/${s.customerRef}`}>{custName.get(s.customerRef)}</Link> : s.customerRef}</td>
                    <td>{s.type}</td>
                    <td className="is-right num">{racksOfService(s).length}</td>
                    <td>{s.startDate ? s.startDate.slice(0, 10) : '—'}</td>
                    <td className="is-right num">{fmtMoney(s.revenueMonthly, s.currency)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Total {fmtMoneyTotals(using.map((s) => ({ amount: s.revenueMonthly, currency: s.currency })))} a month.</div>
            </>
          )}
        </section>
      </div>
    </Drawer>
  );
}
