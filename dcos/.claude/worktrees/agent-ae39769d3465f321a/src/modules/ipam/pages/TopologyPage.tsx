import { useMemo } from 'react';
import { Space } from 'antd';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { ManagedDevice, TopologyLink } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';

const TIERS = ['Core', 'Spine', 'Leaf', 'TOR'];
const reachColor: Record<string, string> = { Reachable: 'var(--vw-color-green-600)', Degraded: '#f59e0b', Unreachable: 'var(--vw-color-red-600)' };

export default function TopologyPage() {
  const devices = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const links = (useEntityList('topologyLinks', { pageSize: 500 }).data?.data ?? []) as unknown as TopologyLink[];

  const layout = useMemo(() => {
    const W = 660, rowY: Record<string, number> = { Core: 50, Spine: 130, Leaf: 210, TOR: 290 };
    const pos: Record<string, { x: number; y: number; d: ManagedDevice }> = {};
    TIERS.forEach((tier) => {
      const inTier = devices.filter((d) => (d.role || 'Leaf') === tier).slice(0, 7);
      inTier.forEach((d, i) => {
        const x = ((i + 1) / (inTier.length + 1)) * (W - 40) + 20;
        pos[d.id] = { x, y: rowY[tier], d };
      });
    });
    const edges = links.filter((l) => pos[l.aDeviceId] && pos[l.zDeviceId]).slice(0, 60);
    return { pos, edges, W };
  }, [devices, links]);

  const nodes = Object.values(layout.pos);

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>Network Topology</div>
      <VwCard size="small" style={{ marginTop: "var(--vw-space-lg)" }}>
        <div className="vw-w-full" style={{ overflowX: 'auto' }}>
        <svg width={layout.W} height={340} style={{ display: 'block' }} role="img" aria-label="Network topology">
          {TIERS.map((t, i) => (
            <text key={t} x={8} y={50 + i * 80 + 4} fontSize="10" fill="var(--vw-color-slate-400)">{t}</text>
          ))}
          {layout.edges.map((e) => {
            const a = layout.pos[e.aDeviceId], z = layout.pos[e.zDeviceId];
            return <line key={e.id} x1={a.x} y1={a.y} x2={z.x} y2={z.y} stroke="#e5e7eb" strokeWidth={1} />;
          })}
          {nodes.map((n) => (
            <g key={n.d.id}>
              <circle cx={n.x} cy={n.y} r={9} fill={reachColor[n.d.reachability] ?? '#64748b'} stroke="#fff" strokeWidth={2} />
              <text x={n.x} y={n.y + 22} textAnchor="middle" fontSize="8" fill="#475569">{n.d.hostname.slice(0, 12)}</text>
            </g>
          ))}
        </svg>
        </div>
        <Space size={16} wrap style={{ marginTop: "var(--vw-space-sm)" }}>
          {Object.entries(reachColor).map(([k, v]) => <span key={k} style={{ fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-slate-500)" }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: v, marginRight: "var(--vw-space-xxs)" }} />{k}</span>)}
          <VwChip>{devices.length} devices · {links.length} links (sampled)</VwChip>
        </Space>
      </VwCard>
    </div>
  );
}
