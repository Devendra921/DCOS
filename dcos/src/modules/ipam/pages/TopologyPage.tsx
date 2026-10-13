import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { useMemo } from 'react';
import { Share2 } from 'lucide-react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { ManagedDevice, TopologyLink } from '../../../mock/data/types';
import { Chip, Panel } from '../../../ops/ui/kit';
import { Legend } from '../../../ops/ui/status';

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
    <OpsPage title={'Network topology'} description="Device reachability across the core, spine and access layers.">
      <Panel title="Topology" sub="Core, spine, leaf and TOR tiers · up to 7 devices per tier" icon={Share2}
        actions={<Chip tone="neutral">{devices.length} devices · {links.length} links (sampled)</Chip>}
        foot={<Legend items={Object.entries(reachColor).map(([k, v]) => ({ label: k, color: v }))} />}>
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
      </Panel>
    </OpsPage>
  );
}
