/* IP and network plan: aggregate and usage, ASNs, prefixes grouped by scope, VLANs. */
import { useMemo } from 'react';
import { AlertTriangle, Download, Network, Route, Tags } from 'lucide-react';
import type * as T from '../../../../mock/data/types';
import { Btn, Chip, Empty, Panel } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { SoftMeter, StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import { ipCsv, type IpItem, type IpPlan } from '../../lib/outputs';
import { downloadText } from './packModel';

const PURPOSE_CHIP: Record<IpItem['purpose'], 'info' | 'cyan' | 'purple' | 'neutral' | 'orange' | 'pink'> = { Production: 'info', Storage: 'cyan', Management: 'purple', OOB: 'neutral', Transit: 'orange', Loopback: 'pink' };
const PURPOSE_LABEL: Record<IpItem['purpose'], string> = { Production: 'Production', Storage: 'Storage', Management: 'Management', OOB: 'Out of band', Transit: 'Transit', Loopback: 'Loopback' };
const dash = <span className="vw-label">—</span>;
type VlanRow = IpPlan['vlans'][number];
type AsnRow = IpPlan['asns'][number];

export function IpPlanView({ plan, ip, applies }: { plan: T.PlannerPlan; ip: IpPlan; applies: boolean }) {
  const heads = useMemo(() => {
    // Rows arrive grouped by scope; the scope is printed on the first row of each group only.
    const s = new Set<string>();
    ip.items.forEach((it, i) => { if (i === 0 || ip.items[i - 1].scope !== it.scope) s.add(it.id); });
    return s;
  }, [ip.items]);

  const columns: Col<IpItem>[] = useMemo(() => [
    { key: 'scope', header: 'Scope', render: r => (heads.has(r.id) ? <span className="strong">{r.scope}</span> : null) },
    { key: 'purpose', header: 'Purpose', render: r => <Chip tone={PURPOSE_CHIP[r.purpose]} size="xs">{PURPOSE_LABEL[r.purpose]}</Chip> },
    { key: 'name', header: 'Name', render: r => r.name },
    { key: 'cidr', header: 'CIDR', render: r => <span className="mono">{r.cidr}</span> },
    { key: 'hosts', header: 'Usable hosts', align: 'right', render: r => <span className="num">{r.hosts.toLocaleString('en-US')}</span> },
    { key: 'vlan', header: 'VLAN', align: 'right', render: r => (r.vlan === undefined ? dash : <span className="num">{r.vlan}</span>) },
    { key: 'gw', header: 'Gateway', render: r => (r.gateway ? <span className="mono">{r.gateway}</span> : dash) },
    { key: 'notes', header: 'Notes', wrap: true, render: r => <span className="vw-label">{r.notes}</span> },
  ], [heads]);

  const vlanRows = useMemo(() => ip.vlans.map((v, i) => ({ ...v, id: `${v.number}-${v.name}-${i}` })), [ip.vlans]);
  const vlanCols: Col<VlanRow & { id: string }>[] = useMemo(() => [
    { key: 'n', header: 'VLAN', render: r => <span className="mono">{r.number}</span> },
    { key: 'name', header: 'Name', render: r => r.name },
    { key: 'p', header: 'Purpose', render: r => <Chip tone={PURPOSE_CHIP[r.purpose as IpItem['purpose']] ?? 'neutral'} size="xs">{PURPOSE_LABEL[r.purpose as IpItem['purpose']] ?? r.purpose}</Chip> },
  ], []);
  const asnRows = useMemo(() => ip.asns.map((x, i) => ({ ...x, id: `${x.role}-${i}` })), [ip.asns]);
  const asnCols: Col<AsnRow & { id: string }>[] = useMemo(() => [
    { key: 'role', header: 'Role', render: r => r.role },
    { key: 'asn', header: 'ASN', render: r => <span className="mono">{r.asn}</span> },
  ], []);

  if (!applies) {
    return <Panel><Empty icon={Network} title="Not part of this plan type">This plan type does not cover the network, so no address plan is produced. Network work is planned with a network uplift or a site plan.</Empty></Panel>;
  }

  const usedPct = ip.totalAddresses ? Math.round((ip.usedAddresses / ip.totalAddresses) * 1000) / 10 : 0;
  const isNew = (ip.containers ?? []).some(c => c.isNew);
  const aggregateSub = ip.pending ? 'addresses are taken from IPAM once the platform data has loaded'
    : isNew ? `new site container from ${ip.containers?.find(c => c.isNew)?.cidrBlockName ?? 'the private supernet'}; written to IPAM on execution`
    : ip.containers?.length ? 'the site\'s container subnet in IPAM; prefixes avoid everything in use' : 'no container in IPAM';
  if (!ip.items.length) {
    return <Panel><Empty icon={Network} title={ip.aggregate}>This plan does not allocate addresses itself.</Empty></Panel>;
  }
  return (
    <div className="col" style={{ gap: 16 }}>
      {(ip.warnings ?? []).length > 0 && <div className="note note--warn"><AlertTriangle size={16} style={{ flex: 'none' }} /><div><b>Allocation notes</b> · {ip.warnings!.join('; ')}</div></div>}
      <StatGrid cols={4}>
        <StatTile label={isNew ? 'New site container' : 'Site container'} value={<span className="mono" style={ip.pending ? { fontSize: 14 } : undefined}>{ip.aggregate}</span>} sub={aggregateSub} />
        <StatTile label="Prefixes" value={ip.items.length} sub={`${new Set(ip.items.map(i => i.scope)).size} scope(s)`} />
        <StatTile label="VLANs" value={ip.vlans.length} sub={ip.pending ? 'next free numbers at the site, once loaded' : ip.asns.length ? `${ip.asns.length} ASN range(s), private and unique across plans` : 'no routing domains'} />
        <StatTile label="Addresses used" value={`${usedPct}%`} sub={`${ip.usedAddresses.toLocaleString('en-US')} of ${ip.totalAddresses.toLocaleString('en-US')}`} subTone={usedPct > 80 ? 'warn' : undefined}>
          <SoftMeter pct={usedPct} tone={usedPct > 80 ? 'warning' : 'info'} />
        </StatTile>
      </StatGrid>

      <Panel flush icon={Network} title="Prefixes" count={ip.items.length} actions={<Btn size="xs" icon={Download} onClick={() => downloadText(`${plan.plnId}-ip-plan.csv`, ipCsv(ip), 'text/csv')}>Download CSV</Btn>}>
        <DataTable rows={ip.items} cols={columns} pageSize={1000} maxHeight={520} />
      </Panel>

      <div className="grid g-2">
        <Panel flush icon={Route} title="Routing (BGP autonomous systems)" count={ip.asns.length}>
          {asnRows.length ? <DataTable rows={asnRows} cols={asnCols} pageSize={500} />
            : <Empty icon={Route} title="No private ASNs">No switching fabric, so no private ASNs are allocated.</Empty>}
        </Panel>
        <Panel flush icon={Tags} title="VLANs" count={ip.vlans.length}>
          {vlanRows.length ? <DataTable rows={vlanRows} cols={vlanCols} pageSize={500} maxHeight={280} /> : <Empty icon={Tags} title="No VLANs">No VLANs in this plan.</Empty>}
        </Panel>
      </div>
    </div>
  );
}
