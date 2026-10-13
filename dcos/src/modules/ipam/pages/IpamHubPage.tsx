import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, Network, Tags, TriangleAlert } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Panel, PanelLink } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Meter } from '../../../ops/ui/status';
import { SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';
import { Donut } from '../../../ops/charts/Donut';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import type { Subnet, VLAN, IPAddress } from '../../../mock/data/types';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const VLAN_TONE: Record<string, Tone> = { Active: 'success', Reserved: 'info', Unused: 'neutral' };
const VLAN_COLOR: Record<string, string> = { Active: '#6ee7b7', Reserved: '#93c5fd', Unused: '#cbd5e1' };
const stateTone = (s: string): Tone => (s === 'Consumed' ? 'error' : s === 'Committed' ? 'warning' : 'success');

export default function IpamHubPage() {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const subnets = (useEntityList('subnets', { pageSize: 1000, filters: dcF }).data?.data ?? []) as unknown as Subnet[];
  const vlans = (useEntityList('vlans', { pageSize: 500, filters: dcF }).data?.data ?? []) as unknown as VLAN[];
  const ips = (useEntityList('ipAddresses', { pageSize: 2000 }).data?.data ?? []) as unknown as IPAddress[];
  const aggregates = useEntityList('cidrBlocks', { pageSize: 1 }).data?.total ?? 0;
  const ranges = useEntityList('ipRanges', { pageSize: 1 }).data?.total ?? 0;
  const vrfs = useEntityList('vrfs', { pageSize: 1 }).data?.total ?? 0;
  const asns = useEntityList('asns', { pageSize: 1 }).data?.total ?? 0;
  const vlanGroups = useEntityList('vlanGroups', { pageSize: 1 }).data?.total ?? 0;
  const services = useEntityList('ipServices', { pageSize: 1 }).data?.total ?? 0;

  const m = useMemo(() => {
    const leaves = subnets.filter((s) => s.status !== 'Container');
    return {
      leaves: leaves.length,
      avgUtil: leaves.length ? Math.round(sum(leaves.map((s) => s.utilizationPct)) / leaves.length) : 0,
      free: sum(leaves.map((s) => s.totalHosts - s.usedHosts)),
      total: sum(leaves.map((s) => s.totalHosts)),
      nearing: leaves.filter((s) => s.utilizationPct >= 85).length,
      unusedVlans: vlans.filter((v) => v.status === 'Unused').length,
      conflicts: ips.filter((i) => i.status === 'Conflict').length,
      top: [...leaves].sort((a, b) => b.utilizationPct - a.utilizationPct).slice(0, 8),
      vlanStatus: ['Active', 'Reserved', 'Unused'].map((s) => ({ s, n: vlans.filter((v) => v.status === s).length })),
    };
  }, [subnets, vlans, ips]);

  const inventory: Array<[string, number, string]> = [
    ['Aggregates', aggregates, '/ipam/aggregates'],
    ['Prefixes', subnets.length, '/ipam/subnets'],
    ['IP Ranges', ranges, '/ipam/ranges'],
    ['VRFs', vrfs, '/ipam/vrf'],
    ['VLAN Groups', vlanGroups, '/ipam/vlan-groups'],
    ['ASNs', asns, '/ipam/asns'],
    ['Services', services, '/ipam/services'],
  ];

  const vlanParts = m.vlanStatus.map((v) => ({ key: v.s, label: v.s, n: v.n, tone: VLAN_TONE[v.s] }));

  const cols: Col<Subnet>[] = [
    { key: 'cidr', header: 'Subnet', sort: (r) => r.cidr, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label mono">{r.cidr}</span><small>{r.name}</small></span>
    ) },
    { key: 'util', header: 'Utilisation', sort: (r) => r.utilizationPct, render: (r) => (
      <span className="cell-2">
        <Meter pct={r.utilizationPct} width={96} color={r.utilizationPct >= 85 ? 'var(--vw-color-red-500)' : r.utilizationPct >= 70 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-emerald-500)'} />
        <small>{r.usedHosts.toLocaleString()} / {r.totalHosts.toLocaleString()} hosts</small>
      </span>
    ) },
    { key: 'forecast', header: 'Forecast exhaustion', sort: (r) => r.forecastExhaustionDate ?? '', render: (r) => (
      r.forecastExhaustionDate ? <Chip tone="orange">{r.forecastExhaustionDate.slice(0, 10)}</Chip> : <span className="vw-label">—</span>
    ) },
    { key: 'state', header: 'State', sort: (r) => r.state, render: (r) => <Chip tone={stateTone(r.state)} dot>{r.state}</Chip> },
  ];

  return (
    <OpsPage title="IP & Network Planning" description="Address space, VLANs and numbering resources — utilisation, exhaustion risk and conflicts"
      actions={<Btn variant="filled" icon={Network} onClick={() => navigate('/ipam/subnets')}>All prefixes</Btn>}>

      <StatGrid cols={5}>
        <StatTile label="Subnet utilisation" value={<>{m.avgUtil}<small>%</small></>} sub={`average of ${m.leaves} subnets`} subTone={m.avgUtil >= 85 ? 'bad' : undefined}>
          <SoftMeter pct={m.avgUtil} tone={m.avgUtil >= 85 ? 'error' : m.avgUtil >= 70 ? 'warning' : 'info'} />
        </StatTile>
        <StatTile label="IPs free" value={m.free.toLocaleString()} sub={`of ${m.total.toLocaleString()} host addresses`}>
          <SoftMeter pct={m.total ? (m.free / m.total) * 100 : 0} tone="success" />
        </StatTile>
        <StatTile label="Subnets ≥85%" value={m.nearing} sub={m.nearing ? 'nearing exhaustion' : 'none near exhaustion'} subTone={m.nearing ? 'warn' : undefined}
          onClick={() => navigate('/ipam/subnets')} />
        <StatTile label="Unused VLANs" value={m.unusedVlans} sub={`of ${vlans.length} VLANs`}>
          <Split parts={vlanParts} onPick={() => navigate('/ipam/vlans')} />
        </StatTile>
        <StatTile label="IP conflicts" value={m.conflicts} sub={m.conflicts ? 'duplicate addresses' : 'no conflicts'} subTone={m.conflicts ? 'bad' : undefined}
          onClick={() => navigate('/ipam/addresses')} />
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title="Subnets nearing exhaustion" sub="Highest utilisation first · open a subnet for its addresses" icon={TriangleAlert} count={m.top.length} flush
          actions={<PanelLink onClick={() => navigate('/ipam/subnets')}>All subnets</PanelLink>}>
          <DataTable rows={m.top} cols={cols} onRow={(s) => navigate(`/ipam/subnets/${s.id}`)} defaultSort={{ key: 'util', dir: 'desc' }} pageSize={8} />
        </Panel>
        <Panel title="VLAN status" sub={`${vlans.length} VLANs`} icon={Tags}
          actions={<PanelLink onClick={() => navigate('/ipam/vlans')}>Manage VLANs</PanelLink>}>
          <Donut slices={m.vlanStatus.map((v) => ({ key: v.s, label: v.s, value: v.n, color: VLAN_COLOR[v.s] }))} centerValue={String(vlans.length)} centerLabel="VLANs" />
        </Panel>
      </div>

      <Panel title="Addressing inventory" sub="Numbering resources in this scope · click to open the register" icon={Boxes}>
        <BarList items={inventory.map(([label, n, path]) => ({ key: path, label, value: n, display: n.toLocaleString(), onClick: () => navigate(path) }))} />
      </Panel>
    </OpsPage>
  );
}
