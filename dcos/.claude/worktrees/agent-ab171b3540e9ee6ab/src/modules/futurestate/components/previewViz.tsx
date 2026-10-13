/**
 * Deterministic synthetic visuals for future-state previews.
 * No Math.random — series are reproducible (sine-based) so previews don't
 * flicker on re-render and read as stable "data".
 */

/** Reproducible 0..1 pseudo value for index i. */
export function pseudo(i: number, seed = 1): number {
  const x = Math.sin((i + 1) * 12.9898 * seed) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth-ish synthetic series around `base` with amplitude `amp`. */
export function synthSeries(n: number, base: number, amp: number, seed = 1): number[] {
  return Array.from({ length: n }, (_, i) =>
    Math.round((base + amp * Math.sin((i + seed) * 0.7) + amp * 0.4 * Math.sin((i + seed) * 0.27 + seed)) * 10) / 10,
  );
}

export function MiniArea({
  data, height = 120, color = '#7c3aed', fill = 'rgba(124,58,237,0.12)',
}: { data: number[]; height?: number; color?: string; fill?: string }) {
  const w = 600;
  const h = height;
  const max = Math.max(...data) * 1.08 || 1;
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, h - ((v - min) / span) * h]);
  const line = 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MiniBars({
  data, labels, height = 140, color = '#0ea5e9',
}: { data: number[]; labels?: string[]; height?: number; color?: string }) {
  const w = 600;
  const h = height;
  const max = Math.max(...data) * 1.1 || 1;
  const gap = 10;
  const bw = (w - gap * (data.length + 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} width="100%" height={h + 18} preserveAspectRatio="none" style={{ display: 'block' }}>
      {data.map((v, i) => {
        const bh = (v / max) * h;
        const x = gap + i * (bw + gap);
        return (
          <g key={i}>
            <rect x={x} y={h - bh} width={bw} height={bh} rx={3} fill={color} opacity={0.85} />
            {labels && <text x={x + bw / 2} y={h + 13} textAnchor="middle" fontSize="11" fill="#64748b">{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal heat strip — cells colored by a 0..100 intensity. */
export function HeatStrip({
  cells,
}: { cells: { label: string; value: number; tip?: string }[] }) {
  const band = (v: number) => (v >= 85 ? 'var(--vw-color-red-600)' : v >= 70 ? '#f59e0b' : v >= 50 ? '#eab308' : 'var(--vw-color-green-600)');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {cells.map((c, i) => (
        <div key={i} title={c.tip ?? `${c.label}: ${c.value}`}
          style={{ width: 56, height: 44, borderRadius: 6, background: band(c.value), color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: "var(--vw-font-label-xs)" }}>
          <span style={{ opacity: 0.9 }}>{c.label}</span>
          <strong style={{ fontSize: "var(--vw-font-label-sm)" }}>{c.value}</strong>
        </div>
      ))}
    </div>
  );
}
