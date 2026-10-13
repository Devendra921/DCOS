import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { Device, DeviceComponent, Cable, CableBundle, Circuit, LinkRole } from '../../../mock/data/types';
import { fmtCapacity, patchText } from '../lib/estateView';

const ROLES: LinkRole[] = ['Fabric', 'Uplink', 'Backhaul', 'Peering', 'Access'];

const STATUS_TONE: Record<string, Tone> = { Active: 'success', Planned: 'warning', Decommissioning: 'error' };
const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();

export default function CablingPage() {
  const navigate = useNavigate();
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const components = (useEntityList('deviceComponents', { pageSize: 500000 }).data?.data ?? []) as unknown as DeviceComponent[];
  const cables = (useEntityList('cables', { pageSize: 100000 }).data?.data ?? []) as unknown as Cable[];
  const circuits = (useEntityList('circuits', { pageSize: 5000 }).data?.data ?? []) as unknown as Circuit[];
  const bundles = (useEntityList('cableBundles', { pageSize: 200 }).data?.data ?? []) as unknown as CableBundle[];

  /* a carrier circuit reference may be the record id or the carrier's circuit id (cid) */
  const circuitOf = (ref?: string) => (ref ? circuits.find((c) => c.id === ref || c.cid === ref || c.cktId === ref) : undefined);
  const bundleName = (id?: string) => bundles.find((b) => b.id === id)?.name;

  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [roleF, setRoleF] = useState('');
  const rows = useMemo(() => {
    const devName = new Map(devices.map((d) => [d.id, d.name]));
    const compName = new Map(components.map((c) => [c.id, c.name]));
    return cables.map((c) => ({
      ...c,
      aDev: devName.get(c.aDeviceId) ?? c.aDeviceId, aPort: compName.get(c.aComponentId) ?? '?',
      bDev: devName.get(c.bDeviceId) ?? c.bDeviceId, bPort: compName.get(c.bComponentId) ?? '?',
    }));
  }, [cables, devices, components]);
  type Row = (typeof rows)[number];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!statusF || r.status === statusF) && (!typeF || r.cableType === typeF)
      && (!roleF || (roleF === 'none' ? !r.role : r.role === roleF))
      && (!s || `${r.aDev} : ${r.aPort} ${r.bDev} : ${r.bPort} ${r.cableType} ${r.status} ${r.role ?? ''} ${r.strand ?? ''} ${r.aPatchPort ?? ''} ${r.bPatchPort ?? ''} ${r.carrierCircuitId ?? ''}`.toLowerCase().includes(s)));
  }, [rows, q, statusF, typeF, roleF]);

  const count = (f: (c: Cable) => boolean) => cables.filter(f).length;
  const statuses = uniq(cables.map((c) => c.status));
  const types = uniq(cables.map((c) => c.cableType));
  const statusParts = statuses.map((s) => ({ key: s, label: s, n: count((c) => c.status === s), tone: STATUS_TONE[s] ?? 'neutral' }));
  const pickStatus = (s: string) => setStatusF(statusF === s ? '' : s);
  const active = count((c) => c.status === 'Active');
  const planned = count((c) => c.status === 'Planned');
  const bundled = count((c) => !!c.bundleId);

  const end = (devId: string, dev: string, port: string) => (
    <span className="cell-2">
      <a className="ent-link vw-card-activity-label" onClick={(e) => { e.stopPropagation(); navigate(`/facility/devices/${devId}`); }}>{dev}</a>
      <small className="mono">{port}</small>
    </span>
  );

  const cols: Col<Row>[] = [
    { key: 'a', header: 'A side', sort: (r) => `${r.aDev} ${r.aPort}`, render: (r) => end(r.aDeviceId, r.aDev, r.aPort) },
    { key: 'link', header: '', render: () => <span className="vw-label">↔</span> },
    { key: 'b', header: 'B side', sort: (r) => `${r.bDev} ${r.bPort}`, render: (r) => end(r.bDeviceId, r.bDev, r.bPort) },
    { key: 'type', header: 'Type', sort: (r) => r.cableType, render: (r) => <Chip tone="neutral">{r.cableType}</Chip> },
    { key: 'bundle', header: 'Bundle', sort: (r) => bundleName(r.bundleId) ?? '', render: (r) => r.bundleId ? <Chip tone="purple">{bundleName(r.bundleId) ?? 'bundle'}</Chip> : <span className="vw-label">—</span> },
    { key: 'length', header: 'Length', align: 'right', sort: (r) => r.lengthM ?? 0, render: (r) => r.lengthM ? <span className="num">{r.lengthM} m</span> : <span className="vw-label">—</span> },
    { key: 'role', header: 'Role', sort: (r) => r.role ?? '', render: (r) => r.role ? <Chip tone="neutral">{r.role}</Chip> : <span className="vw-label">—</span> },
    { key: 'capacity', header: 'Capacity', align: 'right', sort: (r) => r.capacityMbps ?? 0, render: (r) => fmtCapacity(r.capacityMbps) ? <span className="num">{fmtCapacity(r.capacityMbps)}</span> : <span className="vw-label">—</span> },
    { key: 'strand', header: 'Strand', sort: (r) => r.strand ?? '', render: (r) => r.strand ? <span className="mono">{r.strand}</span> : <span className="vw-label">—</span> },
    { key: 'patch', header: 'Patch ports', sort: (r) => patchText(r) ?? '', render: (r) => patchText(r) ?? <span className="vw-label">—</span> },
    { key: 'carrier', header: 'Carrier circuit', sort: (r) => r.carrierCircuitId ?? '', render: (r) => {
      if (!r.carrierCircuitId) return <span className="vw-label">—</span>;
      const ck = circuitOf(r.carrierCircuitId);
      return ck ? <a className="ent-link" onClick={(e) => { e.stopPropagation(); navigate(`/circuits/${ck.id}`); }}>{ck.cid}</a> : <span title="No circuit record with this id">{r.carrierCircuitId}</span>;
    } },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip tone={STATUS_TONE[r.status] ?? 'neutral'} dot>{r.status}</Chip> },
  ];

  return (
    <OpsPage title="Cabling" description="Every cable between device ports — type, bundle, length and status">
      <StatGrid cols={4}>
        <StatTile label="Cables" value={cables.length} sub={`${types.length} cable types`}>
          <Split parts={statusParts} onPick={pickStatus} active={statusF} />
        </StatTile>
        <StatTile label="Active" value={active} sub={`of ${cables.length} cables`} onClick={() => pickStatus('Active')} active={statusF === 'Active'} />
        <StatTile label="Planned" value={planned} sub={planned ? 'not yet installed' : 'none planned'} subTone={planned ? 'warn' : undefined}
          onClick={() => pickStatus('Planned')} active={statusF === 'Planned'} />
        <StatTile label="Bundles" value={bundles.length} sub={`${bundled} cables bundled`} />
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={filtered} cols={cols} defaultSort={{ key: 'a', dir: 'asc' }} pageSize={30}
          toolbar={
            <ListToolbar shown={filtered.length} total={cables.length} noun="cables"
              search={{ value: q, onChange: setQ, placeholder: 'Device, port, strand, patch port, circuit' }}
              filters={[
                { id: 'status', label: 'Status', quick: true, value: statusF, anyLabel: 'Any status', onChange: setStatusF, options: statuses.map((s) => ({ id: s, label: s, count: count((c) => c.status === s) })) },
                { id: 'role', label: 'Role', quick: true, value: roleF, anyLabel: 'Any role', onChange: setRoleF, options: [...ROLES.map((x) => ({ id: x, label: x, count: count((c) => c.role === x) })), { id: 'none', label: 'No role recorded', count: count((c) => !c.role) }] },
                { id: 'type', label: 'Type', quick: true, value: typeF, anyLabel: 'Any type', onChange: setTypeF, options: types.map((t) => ({ id: t, label: t, count: count((c) => c.cableType === t) })) },
              ]} />
          } />
      </section>
    </OpsPage>
  );
}
