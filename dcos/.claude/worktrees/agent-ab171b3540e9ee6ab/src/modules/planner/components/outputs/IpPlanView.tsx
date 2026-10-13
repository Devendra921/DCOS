/* IP and network plan: aggregate and usage, ASNs, prefixes grouped by scope, VLANs. */
import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type * as T from '../../../../mock/data/types';
import { VwCard, VwChip, EmptyState, type VwChipVariant } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { DownloadOutlined } from '../../../../shared/icons';
import { ipCsv, type IpItem, type IpPlan } from '../../lib/outputs';
import { Stat } from '../kit';
import { downloadText } from './packModel';

const PURPOSE_TONE: Record<IpItem['purpose'], VwChipVariant> = { Production: 'info', Storage: 'cyan', Management: 'purple', OOB: 'neutral', Transit: 'orange', Loopback: 'pink' };
const PURPOSE_LABEL: Record<IpItem['purpose'], string> = { Production: 'Production', Storage: 'Storage', Management: 'Management', OOB: 'Out of band', Transit: 'Transit', Loopback: 'Loopback' };
const mono = { fontFamily: 'var(--vw-font-mono, monospace)', fontSize: 'var(--vw-font-label-xs)' } as const;
type VlanRow = IpPlan['vlans'][number];

export function IpPlanView({ plan, ip, applies }: { plan: T.PlannerPlan; ip: IpPlan; applies: boolean }) {
  const spans = useMemo(() => {
    // Rows arrive grouped by scope; the first row of each group spans the group, the rest get 0.
    const m = new Map<string, number>();
    let head = '';
    ip.items.forEach((it, i) => {
      if (i === 0 || ip.items[i - 1].scope !== it.scope) { head = it.id; m.set(head, 1); } else m.set(head, (m.get(head) ?? 0) + 1);
    });
    return m;
  }, [ip.items]);

  const columns: ColumnsType<IpItem> = useMemo(() => [
    { title: 'Scope', dataIndex: 'scope', key: 'scope', width: 110, onCell: r => ({ rowSpan: spans.get(r.id) ?? 0, style: { verticalAlign: 'top', fontWeight: 500 } }) },
    { title: 'Purpose', dataIndex: 'purpose', key: 'purpose', width: 120, render: (p: IpItem['purpose']) => <VwChip variant={PURPOSE_TONE[p]}>{PURPOSE_LABEL[p]}</VwChip> },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'CIDR', dataIndex: 'cidr', key: 'cidr', render: (t: string) => <span style={mono}>{t}</span> },
    { title: 'Usable hosts', dataIndex: 'hosts', key: 'hosts', align: 'right', render: (n: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{n.toLocaleString('en-US')}</span> },
    { title: 'VLAN', dataIndex: 'vlan', key: 'vlan', align: 'right', render: (v?: number) => v ?? <span style={{ color: 'var(--vw-color-slate-400)' }}>—</span> },
    { title: 'Gateway', dataIndex: 'gateway', key: 'gw', render: (g?: string) => (g ? <span style={mono}>{g}</span> : <span style={{ color: 'var(--vw-color-slate-400)' }}>—</span>) },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', render: (t: string) => <span style={{ whiteSpace: 'normal', color: 'var(--vw-color-slate-600)' }}>{t}</span> },
  ], [spans]);

  const vlanCols: ColumnsType<VlanRow> = useMemo(() => [
    { title: 'VLAN', dataIndex: 'number', key: 'n', width: 70, render: (n: number) => <span style={mono}>{n}</span> },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Purpose', dataIndex: 'purpose', key: 'p', render: (p: IpItem['purpose']) => <VwChip variant={PURPOSE_TONE[p] ?? 'neutral'}>{PURPOSE_LABEL[p] ?? p}</VwChip> },
  ], []);

  if (!applies) {
    return <VwCard><EmptyState title="Not part of this plan type" description="This plan type does not cover the network, so no address plan is produced. Network work is planned with a network uplift or a site plan." /></VwCard>;
  }

  const usedPct = ip.totalAddresses ? Math.round((ip.usedAddresses / ip.totalAddresses) * 1000) / 10 : 0;
  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Stat label="Aggregate" value={<span style={{ fontFamily: 'var(--vw-font-mono, monospace)' }}>{ip.aggregate}</span>} sub="private range reserved for the site" />
        <Stat label="Prefixes" value={ip.items.length} sub={`${new Set(ip.items.map(i => i.scope)).size} scope(s)`} />
        <Stat label="VLANs" value={ip.vlans.length} sub={ip.asns.length ? `${ip.asns.length} ASN range(s)` : 'no routing domains'} />
        <div className="vw-card-child" style={{ padding: '10px 14px', minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--vw-color-slate-500)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Addresses used</div>
          <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>{usedPct}%</div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--vw-color-slate-100)', overflow: 'hidden', margin: '4px 0' }}><div style={{ height: '100%', width: `${Math.min(100, usedPct)}%`, background: usedPct > 80 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-blue-500)' }} /></div>
          <div style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>{ip.usedAddresses.toLocaleString('en-US')} of {ip.totalAddresses.toLocaleString('en-US')}</div>
        </div>
      </div>

      <VwCard title="Prefixes" extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => downloadText(`${plan.plnId}-ip-plan.csv`, ipCsv(ip), 'text/csv')}>Download CSV</Button>}>
        <Table<IpItem> size="small" rowKey="id" dataSource={ip.items} columns={columns} pagination={false} scroll={{ x: 980, y: 520 }} />
      </VwCard>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <VwCard title="Routing (BGP autonomous systems)">
          {ip.asns.length ? (
            <Table<IpPlan['asns'][number]> size="small" rowKey="role" dataSource={ip.asns} pagination={false}
              columns={[{ title: 'Role', dataIndex: 'role', key: 'role' }, { title: 'ASN', dataIndex: 'asn', key: 'asn', render: (t: string) => <span style={mono}>{t}</span> }]} />
          ) : <div className="vw-card-description">No switching fabric, so no private ASNs are allocated.</div>}
        </VwCard>
        <VwCard title="VLANs">
          {ip.vlans.length ? <Table<VlanRow> size="small" rowKey={r => `${r.number}-${r.name}`} dataSource={ip.vlans} columns={vlanCols} pagination={false} scroll={{ y: 280 }} /> : <div className="vw-card-description">No VLANs in this plan.</div>}
        </VwCard>
      </div>
    </div>
  );
}
