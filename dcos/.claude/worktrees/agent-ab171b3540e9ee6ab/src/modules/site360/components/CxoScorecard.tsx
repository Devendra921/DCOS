/**
 * Site 360 — the executive scorecard: a site health ring (d3 arcs) with the five domain
 * scores that make it up, beside the figures a CXO asks for first.
 */
import { arc } from 'd3-shape';
import type { SiteKpis, VwPalette } from '../lib/siteModel';

export function HealthRing({ kpis, palette: p, size = 150 }: { kpis: SiteKpis; palette: VwPalette; size?: number }) {
  const segs: Array<[string, number, number, string]> = [['Run', kpis.health.run, 0.3, p.blue], ['Build', kpis.health.build, 0.2, p.violet], ['Capacity', kpis.health.capacity, 0.2, p.emerald], ['Connectivity', kpis.health.connectivity, 0.15, p.cyan], ['Governance', kpis.health.governance, 0.15, p.amber]];
  const R = size / 2; const gen = arc<{ s: number; e: number }>().innerRadius(R - 26).outerRadius(R - 6).cornerRadius(3).startAngle((d) => d.s).endAngle((d) => d.e);
  const track = arc<{ s: number; e: number }>().innerRadius(R - 26).outerRadius(R - 6).startAngle((d) => d.s).endAngle((d) => d.e);
  let a = 0; const gap = 0.05;
  const band = kpis.healthScore >= 80 ? 'success' : kpis.healthScore >= 60 ? 'warning' : 'error';
  return (
    <div className="vw-flex vw-gap-md" style={{ alignItems: 'center' }}>
      <svg width={size} height={size} role="img" aria-label={`Site health ${kpis.healthScore}`}>
        <g transform={`translate(${R},${R})`}>
          {segs.map(([label, score, weight, color]) => {
            const span = weight * Math.PI * 2 - gap; const s = a; const e = a + span * (score / 100); const t = a + span; a += weight * Math.PI * 2;
            return <g key={label}><path d={track({ s, e: t }) ?? ''} fill={p.grid} /><path d={gen({ s, e }) ?? ''} fill={color} /></g>;
          })}
          <text textAnchor="middle" y={-4} className="vw-card-metric-lg" fill={p.ink} style={{ fontSize: 30, fontWeight: 600 }}>{kpis.healthScore}</text>
          <text textAnchor="middle" y={18} fill={p.slate} style={{ fontSize: 11 }}>site health</text>
        </g>
      </svg>
      <div className="vw-flex vw-flex-col vw-gap-sm" style={{ minWidth: 0 }}>
        <span className={`vw-chip vw-chip--${band}`} style={{ alignSelf: 'flex-start' }}>{kpis.healthScore >= 80 ? 'Healthy' : kpis.healthScore >= 60 ? 'Degraded' : 'Critical'}</span>
        {segs.map(([label, score, weight, color]) => (
          <div key={label} className="vw-flex vw-gap-sm" style={{ alignItems: 'center', fontSize: 'var(--vw-font-label-sm)', whiteSpace: 'nowrap' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block', flex: '0 0 auto' }} />
            <span style={{ width: 84 }}>{label}</span>
            <span style={{ width: 28, textAlign: 'right', fontWeight: 600 }}>{score}</span>
            <span className="vw-card-description">{Math.round(weight * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
