/**
 * Site 360 — network fabric map (d3-force on canvas).
 *
 * Managed devices settle into tier bands (core, spine, leaf, access and services);
 * links come from the discovered topology; stroke width follows the busiest interface
 * on the A-end; unreachable devices fade; active alarms pulse. Carrier circuits hang off
 * the core as provider nodes so WAN exposure is visible in the same picture.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';
import type { SiteModel, VwPalette } from '../lib/siteModel';

interface FNode extends SimulationNodeDatum { id: string; name: string; tier: number; role: string; reach: string; alarms: number; util: number; provider?: boolean }
interface FLink extends SimulationLinkDatum<FNode> { util: number; status: string }

const TIER_OF = (role: string): number => (role === 'Core' || role === 'Edge' ? 0 : role === 'Spine' ? 1 : role === 'Leaf/TOR' ? 2 : 3);

export function NetworkFabric({ model, palette: p, height = 380, onSelectDevice }: { model: SiteModel; palette: VwPalette; height?: number; onSelectDevice?: (id: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<FNode | null>(null);
  const nodesRef = useRef<FNode[]>([]);
  useEffect(() => { if (!wrap.current) return; const ro = new ResizeObserver((e) => setWidth(Math.max(420, Math.floor(e[0].contentRect.width)))); ro.observe(wrap.current); return () => ro.disconnect(); }, []);

  const data = useMemo(() => {
    const alarmsBy = new Map<string, number>(); for (const a of model.alarms) if (a.state === 'Active') alarmsBy.set(a.deviceId, (alarmsBy.get(a.deviceId) ?? 0) + 1);
    const utilBy = new Map<string, number>(); for (const i of model.interfaces) utilBy.set(i.deviceId, Math.max(utilBy.get(i.deviceId) ?? 0, i.utilizationPct));
    const nodes: FNode[] = model.managed.filter((m) => !['Power', 'Compute', 'OOB'].includes(m.role)).map((m) => ({ id: m.id, name: m.hostname, tier: TIER_OF(m.role), role: m.role, reach: m.reachability, alarms: alarmsBy.get(m.id) ?? 0, util: utilBy.get(m.id) ?? 0 }));
    const ids = new Set(nodes.map((n) => n.id));
    const links: FLink[] = model.links.filter((l) => ids.has(l.aDeviceId) && ids.has(l.zDeviceId)).map((l) => ({ source: l.aDeviceId, target: l.zDeviceId, util: utilBy.get(l.aDeviceId) ?? 0, status: l.status }));
    // carrier circuits as provider nodes hanging above the core
    const provById = new Map(model.providers.map((pv) => [pv.id, pv]));
    const cores = nodes.filter((n) => n.tier === 0);
    model.circuits.forEach((c, i) => {
      const pv = provById.get(c.providerId); const id = `ckt:${c.id}`;
      nodes.push({ id, name: `${pv?.name ?? 'Carrier'} · ${c.cid}`, tier: -1, role: 'Carrier', reach: c.status === 'Offline' ? 'Unreachable' : c.status === 'Active' ? 'Reachable' : 'Degraded', alarms: 0, util: Math.min(100, (c.commitRateMbps ?? 1000) / 1000), provider: true });
      if (cores.length) links.push({ source: id, target: cores[i % cores.length].id, util: c.status === 'Offline' ? 0 : 40, status: c.status === 'Offline' ? 'Unused' : 'Active' });
    });
    return { nodes, links };
  }, [model]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1; cv.width = width * dpr; cv.height = height * dpr;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const bandY = (tier: number) => 40 + ((tier + 1) / 4.6) * (height - 70);
    // Seed positions on their tier band, spread across the width, then settle the layout before the first frame.
    const perTier = new Map<number, number>(); data.nodes.forEach((n) => perTier.set(n.tier, (perTier.get(n.tier) ?? 0) + 1));
    const seen = new Map<number, number>();
    const nodes = data.nodes.map((n) => { const k = seen.get(n.tier) ?? 0; seen.set(n.tier, k + 1); const count = perTier.get(n.tier) ?? 1; return { ...n, x: 40 + ((k + 0.5) / count) * (width - 80), y: bandY(n.tier) }; });
    const links = data.links.map((l) => ({ ...l }));
    nodesRef.current = nodes;
    const sim = forceSimulation(nodes).force('link', forceLink<FNode, FLink>(links).id((d) => d.id).distance(70).strength(0.3)).force('charge', forceManyBody().strength(-90)).force('x', forceX(width / 2).strength(0.04)).force('y', forceY<FNode>((d) => bandY(d.tier)).strength(1)).force('collide', forceCollide(15));
    sim.stop(); for (let i = 0; i < 160; i++) sim.tick();
    nodes.forEach((n) => { n.x = Math.max(24, Math.min(width - 24, n.x ?? 0)); });
    const tierLabel = ['Carrier circuits', 'Core & edge', 'Spine', 'Leaf / ToR', 'Access & services'];
    let raf = 0; const t0 = performance.now();
    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      for (let tier = -1; tier <= 3; tier++) { const y = bandY(tier); ctx.strokeStyle = p.grid; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(16, y); ctx.lineTo(width - 16, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = p.slate; ctx.font = '500 10px Poppins, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(tierLabel[tier + 1], 16, y - 4); }
      for (const l of links) {
        const s = l.source as FNode, tg = l.target as FNode;
        ctx.strokeStyle = l.status === 'Unused' ? p.red : l.util >= 85 ? p.amber : p.slateLight; ctx.lineWidth = l.status === 'Unused' ? 1.5 : Math.max(1, Math.min(6, l.util / 15)); ctx.globalAlpha = hover && hover.id !== s.id && hover.id !== tg.id ? 0.25 : 0.9;
        ctx.setLineDash(l.status === 'Unused' ? [3, 3] : []); ctx.beginPath(); ctx.moveTo(s.x ?? 0, s.y ?? 0); ctx.lineTo(tg.x ?? 0, tg.y ?? 0); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
      for (const n of nodes) {
        const x = n.x ?? 0, y = n.y ?? 0; const r = n.provider ? 7 : n.tier === 0 ? 9 : n.tier === 1 ? 8 : 6;
        if (n.alarms > 0) { const pulse = 1 + 0.5 * (0.5 + 0.5 * Math.sin(t * 4)); ctx.beginPath(); ctx.arc(x, y, r * pulse + 4, 0, Math.PI * 2); ctx.fillStyle = p.amber; ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.reach === 'Unreachable' ? p.red : n.reach === 'Degraded' ? p.amber : n.provider ? p.violet : n.tier === 0 ? p.ink : n.tier === 1 ? p.blue : n.tier === 2 ? p.cyan : p.emerald; ctx.fill();
        if (hover?.id === n.id) { ctx.strokeStyle = p.ink; ctx.lineWidth = 2; ctx.stroke(); }
        if (n.tier <= 1 || n.provider || hover?.id === n.id) { ctx.fillStyle = p.ink; ctx.font = `${hover?.id === n.id ? 600 : 400} 10px Poppins, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(n.name, x, y + r + 2); }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); sim.stop(); };
  }, [data, width, height, p, hover]);

  const hit = (e: React.MouseEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; return nodesRef.current.find((n) => ((n.x ?? 0) - x) ** 2 + ((n.y ?? 0) - y) ** 2 <= 144) ?? null; };
  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <canvas ref={ref} style={{ width, height, display: 'block', cursor: hover ? 'pointer' : 'default' }} onMouseMove={(e) => setHover(hit(e))} onMouseLeave={() => setHover(null)} onClick={(e) => { const n = hit(e); if (n && !n.provider) onSelectDevice?.(n.id); }} />
      {hover && (
        <div className="vw-card-child" style={{ position: 'absolute', right: 12, top: 8, padding: '8px 12px', minWidth: 200, pointerEvents: 'none' }}>
          <div className="vw-card-title-sm">{hover.name}</div>
          <div className="vw-card-description">{hover.role} · {hover.reach}{hover.provider ? '' : ` · peak interface ${hover.util}%`}{hover.alarms ? ` · ${hover.alarms} active alarms` : ''}</div>
        </div>
      )}
    </div>
  );
}
