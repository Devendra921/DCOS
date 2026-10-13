/**
 * Site 360 — thermal contour map of a hall (d3-contour on canvas).
 *
 * Each rack contributes heat in proportion to its power draw; the cooling zone's
 * setpoint sets the floor temperature; a failed cooling unit raises the field near its
 * wall; containment lowers the mixing. The field is interpolated across the hall grid
 * and drawn as filled isotherms with rack outlines on top. The time scrubber applies a
 * diurnal load curve so the hall can be watched through a day.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { contours } from 'd3-contour';
import { scaleLinear } from 'd3-scale';
import type { HallVm, VwPalette } from '../lib/siteModel';

const RES = 6; // sub-cells per grid cell

export function diurnalFactor(hour: number): number { return 0.78 + 0.22 * Math.sin(((hour - 6) / 24) * Math.PI * 2); }

export function ThermalContour({ hall, palette: p, hour, height = 360, onHoverRack }: { hall: HallVm; palette: VwPalette; hour: number; height?: number; onHoverRack?: (id?: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  useEffect(() => { if (!wrap.current) return; const ro = new ResizeObserver((e) => setWidth(Math.max(420, Math.floor(e[0].contentRect.width)))); ro.observe(wrap.current); return () => ro.disconnect(); }, []);

  const cols = Math.max(1, hall.hall.gridCols); const rows = Math.max(1, hall.hall.gridRows);
  const field = useMemo(() => {
    const w = cols * RES; const h = rows * RES;
    // Supply air leaves the units a few degrees under the zone setpoint; each rack adds heat in proportion to its draw.
    const base = (hall.zone?.setpointC ?? 24) - 3;
    const failed = hall.cracs.some((c) => c.status === 'Failed');
    const f = diurnalFactor(hour);
    const values = new Float64Array(w * h).fill(base);
    const sources = hall.racks.filter((r) => !r.planned).map((r) => ({ cx: (r.rack.gridX + 0.5) * RES, cy: (r.rack.gridY + 0.5) * RES, heat: (r.rack.currentPowerKw * f) / Math.max(1, r.rack.maxPowerKw) * 7 + (r.containment === 'None' ? 1 : 0) - (r.rack.liquidCoolingReady ? 2 : 0) }));
    const sigma2 = 2 * (RES * 0.75) ** 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let t = base;
      for (const s of sources) { const d2 = (x - s.cx) ** 2 + (y - s.cy) ** 2; if (d2 < sigma2 * 6) t += s.heat * Math.exp(-d2 / sigma2); }
      if (failed) t += 5 * Math.exp(-((y / h) ** 2) * 6); // hot band spreading from the back wall where the failed unit stands
      values[y * w + x] = t;
    }
    return { w, h, values };
  }, [hall, hour, cols, rows]);

  const color = useMemo(() => scaleLinear<string>().domain([20, 24, 28, 32, 38]).range([p.blue, p.cyan, p.emerald, p.amber, p.red]), [p]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1; cv.width = width * dpr; cv.height = height * dpr;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const pad = 28; const sx = (width - pad * 2) / field.w; const sy = (height - pad * 2) / field.h;
    const thresholds = Array.from({ length: 12 }, (_, i) => 20 + i * 1.5);
    const cs = contours().size([field.w, field.h]).thresholds(thresholds)(Array.from(field.values));
    ctx.save(); ctx.translate(pad, pad); ctx.scale(sx, sy);
    for (const c of cs) {
      ctx.beginPath();
      for (const poly of c.coordinates) for (const ring of poly) { ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
      ctx.fillStyle = color(c.value); ctx.globalAlpha = 0.85; ctx.fill('evenodd');
    }
    ctx.restore(); ctx.globalAlpha = 1;
    // rack outlines
    for (const r of hall.racks) {
      const x = pad + r.rack.gridX * RES * sx + 2, y = pad + r.rack.gridY * RES * sy + 2, w = RES * sx - 4, h = RES * sy - 4;
      ctx.strokeStyle = r.planned ? p.slateLight : p.ink; ctx.lineWidth = 1; ctx.setLineDash(r.planned ? [3, 3] : []); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
      if (w > 26) { ctx.fillStyle = p.ink; ctx.font = '500 9px Poppins, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.rack.name.replace('R-', ''), x + w / 2, y + h / 2); }
    }
    // cooling units along the back wall
    hall.cracs.forEach((c, i) => {
      const w = Math.min(70, (width - pad * 2) / Math.max(1, hall.cracs.length) - 6); const x = pad + i * ((width - pad * 2) / Math.max(1, hall.cracs.length)) + 3;
      ctx.fillStyle = c.status === 'Failed' ? p.red : c.status === 'Operational' ? p.slate : p.amber; ctx.fillRect(x, 4, w, pad - 10);
      ctx.fillStyle = '#ffffff'; ctx.font = '600 9px Poppins, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.name, x + w / 2, 4 + (pad - 10) / 2);
    });
    // legend
    const lx = width - pad - 160, ly = height - 14;
    const g = ctx.createLinearGradient(lx, 0, lx + 150, 0); [20, 24, 28, 32, 38].forEach((v, i) => g.addColorStop(i / 4, color(v)));
    ctx.fillStyle = g; ctx.fillRect(lx, ly - 6, 150, 8); ctx.fillStyle = p.slate; ctx.font = '400 9px Poppins, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('20 °C', lx, ly + 10); ctx.textAlign = 'right'; ctx.fillText('38 °C inlet', lx + 150, ly + 10);
  }, [field, width, height, color, hall, p]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(); const pad = 28; const x = e.clientX - r.left - pad; const y = e.clientY - r.top - pad;
    const sx = (width - pad * 2) / field.w; const sy = (height - pad * 2) / field.h;
    const gx = Math.floor(x / sx), gy = Math.floor(y / sy);
    if (gx < 0 || gy < 0 || gx >= field.w || gy >= field.h) { setTip(null); onHoverRack?.(undefined); return; }
    const t = field.values[gy * field.w + gx];
    const rack = hall.racks.find((rk) => rk.rack.gridX === Math.floor(gx / RES) && rk.rack.gridY === Math.floor(gy / RES));
    onHoverRack?.(rack?.rack.id);
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text: `${t.toFixed(1)} °C${rack ? ` · ${rack.rack.name} · ${(rack.rack.currentPowerKw * diurnalFactor(hour)).toFixed(1)} kW` : ''}` });
  };
  return (
    <div ref={wrap} role="region" aria-label="Thermal contour diagram" tabIndex={0} style={{ position: 'relative', maxWidth: '100%', overflowX: 'auto' }}>
      <canvas ref={ref} style={{ width, height, display: 'block' }} onMouseMove={onMove} onMouseLeave={() => { setTip(null); onHoverRack?.(undefined); }} />
      {tip && <div className="vw-chip vw-chip--neutral" style={{ position: 'absolute', left: tip.x + 12, top: tip.y - 28, pointerEvents: 'none' }}>{tip.text}</div>}
    </div>
  );
}
