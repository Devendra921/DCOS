/* Routing sessions (BGP, OSPF, IS-IS, LSP): logical adjacencies between two devices, kept apart
   from the physical cables they ride on. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Network } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty, Panel } from '../../../ops/ui/kit';
import { RankList, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { fmtNum } from '../../../ops/lib/format';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import type { DataCenter, Device, RoutingSession } from '../../../mock/data/types';
import { fmtCapacity, SESSION_TONE } from '../../dcim/lib/estateView';

type Row = RoutingSession & { a: string; z: string; site: string };
const STATES = ['Established', 'Down', 'Planned'] as const;
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();

export function RoutingSessionsView() {
  const dcF = useDcFilter();
  const sessions = (useEntityList('routingSessions', { pageSize: 20000, filters: dcF }).data?.data ?? []) as unknown as RoutingSession[];
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const sites = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const [q, setQ] = useState('');
  const [protoF, setProtoF] = useState('');
  const [stateF, setStateF] = useState('');
  const [roleF, setRoleF] = useState('');
  const [siteF, setSiteF] = useState('');

  const rows: Row[] = useMemo(() => {
    const dn = new Map(devices.map((d) => [d.id, d.name]));
    const sn = new Map(sites.map((s) => [s.id, s.name]));
    return sessions.map((s) => ({ ...s, a: dn.get(s.aDeviceId) ?? s.aDeviceId, z: dn.get(s.zDeviceId) ?? s.zDeviceId, site: s.dataCenterId ? sn.get(s.dataCenterId) ?? s.dataCenterId : '' }));
  }, [sessions, devices, sites]);
  const shown = rows.filter((r) => (!protoF || r.protocol === protoF) && (!stateF || (r.state ?? '') === stateF) && (!roleF || (r.role ?? '') === roleF) && (!siteF || r.dataCenterId === siteF)
    && (!q || `${r.rsId} ${r.protocol} ${r.a} ${r.aIfName ?? ''} ${r.z} ${r.zIfName ?? ''} ${r.site}`.toLowerCase().includes(q.toLowerCase())));
  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const protocols = uniq(rows.map((r) => r.protocol));
  const roles = uniq(rows.map((r) => r.role ?? ''));
  const siteIds = uniq(rows.map((r) => r.dataCenterId ?? ''));
  const stateParts = STATES.map((s) => ({ key: s, label: s, n: count((r) => r.state === s), tone: (SESSION_TONE[s] ?? 'neutral') as Tone }));
  const down = count((r) => r.state === 'Down');

  const end = (id: string, name: string, ifName?: string) => (
    <span className="cell-2"><Link to={`/facility/devices/${id}`} onClick={(e) => e.stopPropagation()}>{name}</Link><small className="mono">{ifName ?? 'interface not recorded'}</small></span>
  );
  const cols: Col<Row>[] = [
    { key: 'id', header: 'Session', sort: (r) => r.rsId, render: (r) => <span className="mono">{r.rsId}</span> },
    { key: 'proto', header: 'Protocol', sort: (r) => r.protocol, render: (r) => <Chip tone="neutral" size="xs">{r.protocol}</Chip> },
    { key: 'role', header: 'Role', sort: (r) => r.role ?? '', render: (r) => r.role ?? <span className="faint">—</span> },
    { key: 'a', header: 'A end', sort: (r) => r.a, render: (r) => end(r.aDeviceId, r.a, r.aIfName) },
    { key: 'z', header: 'Z end', sort: (r) => r.z, render: (r) => end(r.zDeviceId, r.z, r.zIfName) },
    { key: 'cap', header: 'Capacity', align: 'right', sort: (r) => r.capacityMbps ?? 0, render: (r) => fmtCapacity(r.capacityMbps) ?? <span className="faint">—</span> },
    { key: 'site', header: 'Site', sort: (r) => r.site, render: (r) => r.site || <span className="faint">—</span>, hideBelow: 1200 },
    { key: 'state', header: 'State', sort: (r) => STATES.indexOf((r.state ?? 'Planned') as typeof STATES[number]), render: (r) => (r.state ? <Chip tone={SESSION_TONE[r.state] ?? 'neutral'} size="xs" dot>{r.state}</Chip> : <span className="faint">—</span>) },
  ];

  return (
    <OpsPage title="Routing sessions" description="BGP, OSPF, IS-IS and LSP sessions between devices, with both ends and their state. Physical cables are listed under Cabling.">
      <StatGrid cols={4}>
        <StatTile label="Sessions" value={fmtNum(rows.length)} sub={`${protocols.length} protocol${protocols.length === 1 ? '' : 's'}`}>
          <Split parts={stateParts} onPick={(k) => setStateF(stateF === k ? '' : k)} active={stateF} />
        </StatTile>
        <StatTile label="Down" value={down} sub={down ? 'sessions not established' : 'every live session is up'} subTone={down ? 'bad' : undefined} onClick={() => setStateF(stateF === 'Down' ? '' : 'Down')} active={stateF === 'Down'} />
        <StatTile label="By protocol" value={protocols.length} sub="click to filter">
          <RankList items={protocols.map((p) => ({ key: p, label: p, n: count((r) => r.protocol === p), tone: 'info' as Tone, onClick: () => setProtoF(protoF === p ? '' : p) })).sort((a, b) => b.n - a.n).slice(0, 4)} />
        </StatTile>
        <StatTile label="Sites" value={siteIds.length} sub="with recorded sessions" />
      </StatGrid>

      <Panel title="Sessions" icon={Network} count={rows.length} flush>
        {rows.length === 0 ? <Empty icon={Network} title="No routing sessions recorded">Sessions appear here once they are recorded or imported.</Empty> : (
          <DataTable rows={shown} cols={cols} defaultSort={{ key: 'state', dir: 'asc' }} pageSize={30}
            toolbar={<ListToolbar shown={shown.length} total={rows.length} noun="sessions" search={{ value: q, onChange: setQ, placeholder: 'Search devices, interfaces, sessions…' }}
              filters={[
                { id: 'proto', label: 'Protocol', quick: true, value: protoF, anyLabel: 'Any protocol', onChange: setProtoF, options: protocols.map((p) => ({ id: p, label: p, count: count((r) => r.protocol === p) })) },
                { id: 'state', label: 'State', quick: true, value: stateF, anyLabel: 'Any state', onChange: setStateF, options: STATES.map((s) => ({ id: s as string, label: s, count: count((r) => r.state === s) })) },
                { id: 'role', label: 'Role', value: roleF, anyLabel: 'Any role', onChange: setRoleF, options: roles.map((r) => ({ id: r, label: r, count: count((x) => x.role === r) })) },
                { id: 'site', label: 'Site', value: siteF, anyLabel: 'Any site', onChange: setSiteF, options: siteIds.map((id) => ({ id, label: rows.find((r) => r.dataCenterId === id)?.site ?? id, count: count((r) => r.dataCenterId === id) })) },
              ]} />} />
        )}
      </Panel>
    </OpsPage>
  );
}
