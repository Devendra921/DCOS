/* Monitoring sources: every collector, what it polls and how much of each site it covers.
   Integrations stay with Databyte; DCOS keeps the reference and the device → collector link. */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Radar } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Drawer, Empty, KV, Panel } from '../../../ops/ui/kit';
import { SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { fmtNum } from '../../../ops/lib/format';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import type { Collector, DataCenter, Device, EnvSensor } from '../../../mock/data/types';
import { COLLECTOR_TONE, layerLabel } from '../../dcim/lib/estateView';
import { collectorCoverage, type CollectorCoverage } from '../../facility/lib/estateRules';

type Row = Collector & { site: string; polled: number; sensors: number };
type SiteCover = CollectorCoverage & { id: string; site: string; collectors: number };
const STATUSES = ['Healthy', 'Degraded', 'Down'] as const;
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();

export function CollectorsView() {
  const [sp, setSp] = useSearchParams();
  const openId = sp.get('col') ?? '';
  const setOpen = (id: string) => { const n = new URLSearchParams(sp); if (id) n.set('col', id); else n.delete('col'); setSp(n, { replace: true }); };
  const dcF = useDcFilter();
  const collectors = (useEntityList('collectors', { pageSize: 5000, filters: dcF }).data?.data ?? []) as unknown as Collector[];
  const devices = (useEntityList('devices', { pageSize: 20000, filters: dcF }).data?.data ?? []) as unknown as Device[];
  const sensors = (useEntityList('envSensors', { pageSize: 20000, filters: dcF }).data?.data ?? []) as unknown as EnvSensor[];
  const sites = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const [q, setQ] = useState('');
  const [siteF, setSiteF] = useState('');
  const [domainF, setDomainF] = useState('');
  const [protoF, setProtoF] = useState('');
  const [statusF, setStatusF] = useState('');

  const siteName = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);
  const rows: Row[] = useMemo(() => {
    const polled = new Map<string, number>(), sens = new Map<string, number>();
    for (const d of devices) if (d.collectorId) polled.set(d.collectorId, (polled.get(d.collectorId) ?? 0) + 1);
    for (const s of sensors) if (s.collectorId) sens.set(s.collectorId, (sens.get(s.collectorId) ?? 0) + 1);
    return collectors.map((c) => ({ ...c, site: siteName.get(c.dataCenterId) ?? c.dataCenterId, polled: polled.get(c.id) ?? 0, sensors: sens.get(c.id) ?? 0 }));
  }, [collectors, devices, sensors, siteName]);

  /* one reading of coverage for every screen (estateRules): installed operator devices that should be polled */
  const cover: SiteCover[] = useMemo(() => {
    const ids = uniq([...collectors.map((c) => c.dataCenterId), ...devices.filter((d) => d.collectorId || d.monitored != null).map((d) => d.dataCenterId ?? '')]);
    return ids.map((id) => ({ ...collectorCoverage(id, devices, collectors), id, site: siteName.get(id) ?? id, collectors: collectors.filter((c) => c.dataCenterId === id).length }))
      .sort((a, b) => a.pct - b.pct);
  }, [collectors, devices, siteName]);

  const shown = rows.filter((r) => (!siteF || r.dataCenterId === siteF) && (!domainF || r.domain === domainF) && (!protoF || r.protocol === protoF) && (!statusF || (r.status ?? '') === statusF)
    && (!q || `${r.name} ${r.colId} ${r.site} ${r.protocol} ${r.domain} ${r.hostIp ?? ''} ${r.covers ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const statusParts = STATUSES.map((s) => ({ key: s, label: s, n: count((r) => r.status === s), tone: (COLLECTOR_TONE[s] ?? 'neutral') as Tone }));
  const inScope = cover.reduce((a, r) => a + r.devices, 0);
  const monitored = cover.reduce((a, r) => a + r.monitored, 0);
  const gaps = cover.reduce((a, r) => a + r.unmonitored, 0);
  const tenant = cover.reduce((a, r) => a + r.tenant, 0);
  const pct = inScope ? Math.round((monitored / inScope) * 100) : 100;

  const cols: Col<Row>[] = [
    { key: 'name', header: 'Collector', sort: (r) => r.name, render: (r) => <span className="cell-2"><b className="strong">{r.name}</b><small className="mono">{r.colId}</small></span> },
    { key: 'site', header: 'Site', sort: (r) => r.site, render: (r) => r.site },
    { key: 'domain', header: 'Domain', sort: (r) => r.domain, render: (r) => r.domain },
    { key: 'proto', header: 'Protocol', sort: (r) => r.protocol, render: (r) => <Chip tone="neutral" size="xs">{r.protocol}</Chip> },
    { key: 'host', header: 'Host', sort: (r) => r.hostIp ?? '', render: (r) => (r.hostIp ? <span className="mono">{r.hostIp}</span> : <span className="faint">—</span>) },
    { key: 'covers', header: 'Covers', sort: (r) => r.covers ?? '', render: (r) => r.covers ?? <span className="faint">—</span>, wrap: true, hideBelow: 1280 },
    { key: 'polled', header: 'Devices polled', align: 'right', sort: (r) => r.polled, render: (r) => <span className="num">{fmtNum(r.polled)}</span> },
    { key: 'sensors', header: 'Sensors', align: 'right', sort: (r) => r.sensors, render: (r) => <span className="num">{fmtNum(r.sensors)}</span> },
    { key: 'status', header: 'Status', sort: (r) => STATUSES.indexOf((r.status ?? 'Healthy') as typeof STATUSES[number]), render: (r) => (r.status ? <Chip tone={COLLECTOR_TONE[r.status] ?? 'neutral'} size="xs" dot>{r.status}</Chip> : <span className="faint">—</span>) },
  ];
  const open = rows.find((r) => r.id === openId);

  return (
    <OpsPage title="Collectors" description="Where monitoring data comes from: each collector, the devices and sensors it polls, and how much of each site is covered.">
      <StatGrid cols={4}>
        <StatTile label="Collectors" value={rows.length} sub={`${uniq(rows.map((r) => r.dataCenterId)).length} sites`}>
          <Split parts={statusParts} onPick={(k) => setStatusF(statusF === k ? '' : k)} active={statusF} />
        </StatTile>
        <StatTile label="Devices monitored" value={fmtNum(monitored)} sub={`of ${fmtNum(inScope)} installed operator devices`} />
        <StatTile label="Coverage" value={<>{pct}<small>%</small></>} sub="monitored, of devices the operator should poll"><SoftMeter pct={pct} tone={pct >= 90 ? 'success' : pct >= 70 ? 'warning' : 'error'} /></StatTile>
        <StatTile label="Monitoring gaps" value={fmtNum(gaps)} sub={`installed, not polled · ${fmtNum(tenant)} tenant devices left to tenants`} subTone={gaps ? 'warn' : undefined} />
      </StatGrid>

      <Panel title="Monitoring sources" icon={Radar} count={rows.length} flush>
        {rows.length === 0 ? <Empty icon={Radar} title="No collectors recorded">Collectors appear here once they are recorded or imported.</Empty> : (
          <DataTable rows={shown} cols={cols} onRow={(r) => setOpen(r.id)} defaultSort={{ key: 'site', dir: 'asc' }} pageSize={25}
            toolbar={<ListToolbar shown={shown.length} total={rows.length} noun="collectors" search={{ value: q, onChange: setQ, placeholder: 'Search collectors, hosts, sites…' }}
              filters={[
                { id: 'site', label: 'Site', quick: true, value: siteF, anyLabel: 'Any site', onChange: setSiteF, options: uniq(rows.map((r) => r.dataCenterId)).map((id) => ({ id, label: siteName.get(id) ?? id, count: count((r) => r.dataCenterId === id) })) },
                { id: 'domain', label: 'Domain', quick: true, value: domainF, anyLabel: 'Any domain', onChange: setDomainF, options: uniq(rows.map((r) => r.domain)).map((d) => ({ id: d, label: d, count: count((r) => r.domain === d) })) },
                { id: 'proto', label: 'Protocol', value: protoF, anyLabel: 'Any protocol', onChange: setProtoF, options: uniq(rows.map((r) => r.protocol)).map((p) => ({ id: p, label: p, count: count((r) => r.protocol === p) })) },
                { id: 'status', label: 'Status', value: statusF, anyLabel: 'Any status', onChange: setStatusF, options: STATUSES.map((s) => ({ id: s as string, label: s, count: count((r) => r.status === s) })) },
              ]} />} />
        )}
      </Panel>

      <Panel title="Coverage by site" sub="Installed operator devices that should be polled, and how many are. Tenant equipment and kit not yet installed are left out. Lowest coverage first." flush>
        {cover.length === 0 ? <Empty icon={Radar} title="No monitoring recorded yet" /> : (
          <div className="nst-table-wrap"><table className="nst-table dt-table">
            <thead><tr><th>Site</th><th className="is-right">Collectors</th><th>Domains</th><th className="is-right">Devices to poll</th><th className="is-right">Monitored</th><th className="is-right">Gaps</th><th className="is-right">Tenant devices</th><th>Coverage</th></tr></thead>
            <tbody>{cover.map((r) => (
              <tr key={r.id} className="is-click" onClick={() => setSiteF(siteF === r.id ? '' : r.id)}>
                <td>{r.site}</td><td className="is-right num">{r.collectors}</td>
                <td className="is-wrap">{r.byDomain.map((d) => `${d.domain} ${d.monitored}/${d.devices}`).join(' · ') || '—'}</td>
                <td className="is-right num">{fmtNum(r.devices)}</td><td className="is-right num">{fmtNum(r.monitored)}</td>
                <td className={`is-right num${r.unmonitored ? ' warn' : ''}`}>{fmtNum(r.unmonitored)}</td><td className="is-right num">{fmtNum(r.tenant)}</td>
                <td style={{ minWidth: 140 }}><span className="row" style={{ gap: 8 }}><span style={{ flex: 1 }}><SoftMeter pct={r.pct} tone={r.pct >= 90 ? 'success' : r.pct >= 70 ? 'warning' : 'error'} /></span><span className="num">{r.pct}%</span></span></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>

      {open && <CollectorDrawer col={open} devices={devices.filter((d) => d.collectorId === open.id)} sensors={sensors.filter((s) => s.collectorId === open.id)} onClose={() => setOpen('')} />}
    </OpsPage>
  );
}

function CollectorDrawer({ col, devices, sensors, onClose }: { col: Row; devices: Device[]; sensors: EnvSensor[]; onClose: () => void }) {
  const list = [...devices].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Drawer open onClose={onClose} width={680} title={col.name} sub={<>{col.colId} · {col.site}</>}
      head={col.status ? <div style={{ marginTop: 6 }}><Chip tone={COLLECTOR_TONE[col.status] ?? 'neutral'} size="xs" dot>{col.status}</Chip></div> : undefined}>
      <div className="col" style={{ gap: 'var(--vw-space-lg)' }}>
        <KV cols={2} items={[
          ['Domain', col.domain], ['Protocol', col.protocol], ['Host', col.hostIp ?? 'Not recorded'], ['Covers', col.covers ?? 'Not recorded'],
          ['Devices polled', fmtNum(devices.length)], ['Sensors', fmtNum(sensors.length)],
          ...(col.extRef ? [['Source record', `${col.extRef.source} · ${col.extRef.id}`] as [string, string]] : []),
        ]} />
        <section>
          <h3 style={{ marginBottom: 8 }}>Devices polled <span className="muted">({list.length})</span></h3>
          {list.length === 0 ? <span className="muted">No device names this collector.</span> : (
            <div className="nst-table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}><table className="nst-table dt-table">
              <thead><tr><th>Device</th><th>Layer</th><th>OS</th><th>GPU</th></tr></thead>
              <tbody>{list.map((d) => (
                <tr key={d.id}><td><Link to={`/facility/devices/${d.id}`}>{d.name}</Link></td><td>{layerLabel(d.networkLayer) ?? '—'}</td><td>{d.osVersion ?? '—'}</td><td>{d.gpu ? `${d.gpu.count} × ${d.gpu.model}` : '—'}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
        {sensors.length > 0 && (
          <section>
            <h3 style={{ marginBottom: 8 }}>Sensors <span className="muted">({sensors.length})</span></h3>
            <div className="nst-table-wrap" style={{ maxHeight: 280, overflow: 'auto' }}><table className="nst-table dt-table">
              <thead><tr><th>Sensor</th><th>Kind</th><th>Position</th><th>BMS point</th></tr></thead>
              <tbody>{sensors.map((s) => (
                <tr key={s.id}><td>{s.name}</td><td>{s.kind}</td><td>{s.position ?? '—'}</td><td className="mono">{s.bmsPoint ?? '—'}</td></tr>
              ))}</tbody>
            </table></div>
          </section>
        )}
      </div>
    </Drawer>
  );
}
