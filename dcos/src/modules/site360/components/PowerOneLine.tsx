/**
 * Site 360 — power one-line as an animated Sankey (d3-sankey layout, canvas rendering).
 *
 * Utility feeds → transformers → UPS or DC plants → floor PDUs → halls. Ribbon width is
 * kilowatts; A-side and B-side paths keep their own hue; degraded and failed equipment
 * turn amber and red and their flow particles stop. Hover a node for its load and headroom.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { sankey, sankeyLinkHorizontal, sankeyJustify, type SankeyNode, type SankeyLink } from 'd3-sankey';
import type { PowerLink, PowerNode, VwPalette } from '../lib/siteModel';

interface NodeExtra extends PowerNode { x0?: number; x1?: number; y0?: number; y1?: number }
type SNode = SankeyNode<NodeExtra, { status: string }>;
type SLink = SankeyLink<NodeExtra, { status: string }>;

export function PowerOneLine({ nodes, links, palette: p, height = 360 }: { nodes: PowerNode[]; links: PowerLink[]; palette: VwPalette; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<SNode | null>(null);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(480, Math.floor(e[0].contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const valid = links.filter((l) => ids.has(l.source) && ids.has(l.target) && l.source !== l.target && l.kw > 0);
    const used = new Set(valid.flatMap((l) => [l.source, l.target]));
    const ns = nodes.filter((n) => used.has(n.id)).map((n) => ({ ...n }));
    if (!ns.length) return null;
    const gen = sankey<NodeExtra, { status: string }>().nodeId((d) => d.id).nodeWidth(16).nodePadding(10).nodeAlign(sankeyJustify).extent([[16, 24], [width - 16, height - 16]]);
    try {
      return gen({ nodes: ns, links: valid.map((l) => ({ source: l.source, target: l.target, value: l.kw, status: l.status })) });
    } catch { return null; }
  }, [nodes, links, width, height]);

  useEffect(() => {
    const cv = ref.current; if (!cv || !graph) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr; cv.height = height * dpr;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const linkPath = sankeyLinkHorizontal();
    const colorFor = (status: string, side?: 'A' | 'B') => (status === 'Failed' ? p.red : status === 'Degraded' || status === 'Maintenance' ? p.amber : side === 'B' ? p.cyan : p.blue);
    let raf = 0; const t0 = performance.now();
    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      for (const l of graph.links as SLink[]) {
        const s = l.source as SNode; const tg = l.target as SNode;
        const col = colorFor(l.status === 'Failed' ? 'Failed' : s.status, s.side);
        const path = new Path2D(linkPath(l as never) ?? '');
        ctx.strokeStyle = col; ctx.globalAlpha = hover && hover !== s && hover !== tg ? 0.12 : 0.28; ctx.lineWidth = Math.max(1.5, l.width ?? 1); ctx.stroke(path);
        // flow particles: dots travelling along the ribbon, stopped when the path is down
        if (l.status !== 'Failed' && s.status !== 'Failed') {
          const n = Math.max(2, Math.round((l.width ?? 2) / 4)); ctx.globalAlpha = 0.9; ctx.fillStyle = col;
          for (let i = 0; i < n; i++) {
            const u = ((t * 0.18 + i / n) % 1);
            const x0 = s.x1 ?? 0, x1 = tg.x0 ?? 0, y0 = l.y0 ?? 0, y1 = l.y1 ?? 0;
            const xm = (x0 + x1) / 2; // cubic bezier sample (same curve as sankeyLinkHorizontal)
            const bx = (1 - u) ** 3 * x0 + 3 * (1 - u) ** 2 * u * xm + 3 * (1 - u) * u ** 2 * xm + u ** 3 * x1;
            const by = (1 - u) ** 3 * y0 + 3 * (1 - u) ** 2 * u * y0 + 3 * (1 - u) * u ** 2 * y1 + u ** 3 * y1;
            ctx.beginPath(); ctx.arc(bx, by, Math.min(3, Math.max(1.5, (l.width ?? 2) / 6)), 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      for (const n of graph.nodes as SNode[]) {
        const x0 = n.x0 ?? 0, y0 = n.y0 ?? 0, w = (n.x1 ?? 0) - x0, h = Math.max(2, (n.y1 ?? 0) - y0);
        ctx.fillStyle = colorFor(n.status, n.side); ctx.fillRect(x0, y0, w, h);
        if (n === hover) { ctx.strokeStyle = p.ink; ctx.lineWidth = 2; ctx.strokeRect(x0 - 1, y0 - 1, w + 2, h + 2); }
        ctx.fillStyle = p.ink; ctx.font = '600 11px Poppins, sans-serif'; ctx.textBaseline = 'middle';
        const label = `${n.name}`; const sub = n.kind === 'utility' ? `${n.capacityKw} kW intake` : `${Math.round(n.loadKw)} / ${n.capacityKw} kW`;
        const leftSide = x0 < width / 2;
        ctx.textAlign = leftSide ? 'left' : 'right'; const lx = leftSide ? x0 + w + 6 : x0 - 6;
        ctx.fillText(label, lx, y0 + h / 2 - 7); ctx.fillStyle = p.slate; ctx.font = '400 10px Poppins, sans-serif'; ctx.fillText(sub, lx, y0 + h / 2 + 7);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [graph, width, height, p, hover]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!graph) return;
    const r = e.currentTarget.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top;
    const hit = (graph.nodes as SNode[]).find((n) => x >= (n.x0 ?? 0) - 4 && x <= (n.x1 ?? 0) + 4 && y >= (n.y0 ?? 0) && y <= (n.y1 ?? 0));
    setHover(hit ?? null);
  };
  return (
    <div ref={wrap} role="region" aria-label="Power distribution diagram" tabIndex={0} style={{ position: 'relative', maxWidth: '100%', overflowX: 'auto' }}>
      {graph ? <canvas ref={ref} style={{ width, height, display: 'block' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} /> : <div className="vw-card-description">No power chain recorded for this site.</div>}
      {hover && (
        <div className="vw-card-child" style={{ position: 'absolute', right: 12, top: 8, padding: '8px 12px', minWidth: 200, pointerEvents: 'none' }}>
          <div className="vw-card-title-sm">{hover.name}</div>
          <div className="vw-card-description">{hover.kind} · {hover.status}{hover.side ? ` · ${hover.side}-side` : ''}</div>
          <div className="vw-card-description">Load {Math.round(hover.loadKw)} kW of {hover.capacityKw} kW · headroom {Math.max(0, hover.capacityKw - Math.round(hover.loadKw))} kW</div>
        </div>
      )}
    </div>
  );
}
