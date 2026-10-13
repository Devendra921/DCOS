import { useMemo, useState } from 'react';
import { TriangleAlert, Workflow, X } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Panel } from '../../../ops/ui/kit';
import { Legend } from '../../../ops/ui/status';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { Device, ManagedDevice } from '../../../mock/data/types';

interface Node { id: string; label: string; tier: number; }
interface Edge { from: string; to: string; }
const TIER_LABEL = ['Application', 'Service', 'Host', 'Network', 'Storage'];

export default function DataFlowPage() {
  const assets = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const devices = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const [sel, setSel] = useState<string | null>(null);

  const { nodes, edges, adj } = useMemo(() => {
    const hosts = assets.filter((a) => a.category === 'Server' || a.category === 'GPU-Node').slice(0, 4);
    const switches = devices.filter((d) => d.deviceType === 'Switch').slice(0, 3);
    const storage = assets.filter((a) => a.category === 'Storage').slice(0, 2);
    const N: Node[] = [];
    const E: Edge[] = [];
    const apps = ['Trading App', 'ML Inference', 'Data Lake'];
    const svcs = ['API Gateway', 'Model Server', 'Ingest Pipeline', 'Cache'];
    apps.forEach((a, i) => N.push({ id: 'app' + i, label: a, tier: 0 }));
    svcs.forEach((s, i) => N.push({ id: 'svc' + i, label: s, tier: 1 }));
    hosts.forEach((h) => N.push({ id: h.id, label: (h.hostname ?? 'host').slice(0, 12), tier: 2 }));
    switches.forEach((s) => N.push({ id: s.id, label: (s.hostname ?? 'switch').slice(0, 12), tier: 3 }));
    storage.forEach((s) => N.push({ id: s.id, label: (s.hostname ?? 'stor').slice(0, 12), tier: 4 }));
    // edges app->svc->host->switch->storage (deterministic wiring)
    apps.forEach((_, i) => E.push({ from: 'app' + i, to: 'svc' + (i % svcs.length) }));
    svcs.forEach((_, i) => { const h = hosts[i % Math.max(1, hosts.length)]; if (h) E.push({ from: 'svc' + i, to: h.id }); });
    hosts.forEach((h, i) => { const sw = switches[i % Math.max(1, switches.length)]; if (sw) E.push({ from: h.id, to: sw.id }); });
    switches.forEach((sw, i) => { const st = storage[i % Math.max(1, storage.length)]; if (st) E.push({ from: sw.id, to: st.id }); });
    const adj: Record<string, string[]> = {};
    E.forEach((e) => { (adj[e.from] ??= []).push(e.to); });
    return { nodes: N, edges: E, adj };
  }, [assets, devices]);

  const downstream = useMemo(() => {
    if (!sel) return new Set<string>();
    const out = new Set<string>(); const stack = [sel];
    while (stack.length) { const cur = stack.pop()!; (adj[cur] ?? []).forEach((n) => { if (!out.has(n)) { out.add(n); stack.push(n); } }); }
    return out;
  }, [sel, adj]);

  const W = 660, H = 360;
  const tiers = [0, 1, 2, 3, 4];
  const pos: Record<string, { x: number; y: number }> = {};
  tiers.forEach((t) => {
    const inT = nodes.filter((n) => n.tier === t);
    inT.forEach((n, i) => { pos[n.id] = { x: ((i + 1) / (inT.length + 1)) * (W - 40) + 20, y: 30 + t * 75 }; });
  });

  return (
    <OpsPage title="Data Flow Intelligence" description="Application → service → host → network → storage dependencies. Click any node to see its downstream blast radius.">
      {sel && (
        <div className="note note--warn" style={{ alignItems: 'center' }}>
          <TriangleAlert size={16} />
          <span style={{ flex: 1 }}>Impact: {downstream.size} downstream dependencies if this node fails.</span>
          <Btn size="xs" variant="ghost" icon={X} onClick={() => setSel(null)}>clear</Btn>
        </div>
      )}
      <Panel title="Dependency graph" icon={Workflow}
        actions={<Legend items={[{ label: 'selected', color: 'var(--vw-color-violet-600)' }, { label: 'impacted', color: 'var(--vw-color-red-300)' }]} />}>
        <svg width={W} height={H} style={{ maxWidth: '100%' }}>
          {tiers.map((t) => <text key={t} x={6} y={30 + t * 75 + 4} fontSize="9" fill="var(--vw-color-slate-400)">{TIER_LABEL[t]}</text>)}
          {edges.map((e, i) => {
            const a = pos[e.from], z = pos[e.to]; if (!a || !z) return null;
            const hot = sel && (downstream.has(e.from) || e.from === sel) && (downstream.has(e.to) || downstream.has(e.from));
            return <line key={i} x1={a.x} y1={a.y} x2={z.x} y2={z.y} stroke={hot ? 'var(--vw-color-red-600)' : '#e5e7eb'} strokeWidth={hot ? 2 : 1} />;
          })}
          {nodes.map((n) => {
            const p = pos[n.id]; if (!p) return null;
            const isSel = n.id === sel; const isDown = downstream.has(n.id);
            const fill = isSel ? '#7c3aed' : isDown ? '#fca5a5' : '#fff';
            const stroke = isSel ? '#7c3aed' : isDown ? 'var(--vw-color-red-600)' : 'var(--vw-color-slate-400)';
            return (
              <g key={n.id} style={{ cursor: 'pointer' }} onClick={() => setSel(n.id)}>
                <rect x={p.x - 50} y={p.y - 12} width={100} height={24} rx={5} fill={fill} stroke={stroke} />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="9" fill={isSel ? '#fff' : '#334155'}>{n.label}</text>
              </g>
            );
          })}
        </svg>
      </Panel>
    </OpsPage>
  );
}
