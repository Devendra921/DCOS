/**
 * Estate intelligence — derived, not decorative.
 *
 * No ML backend exists, so "intelligence" here is genuinely *computed* from the
 * data: a composite system-health index across domains, capacity runway by
 * linear projection of the real trend, and statistical anomaly flags. Everything
 * is deterministic and explainable (a real model can replace these later — see
 * the Predictive preview). Pure functions.
 */

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

// ── Composite system-health index ───────────────────────────────────
export interface DomainScore { name: string; score: number; weight: number; }
export interface SystemHealth { overall: number; band: 'Healthy' | 'Degraded' | 'Critical'; domains: DomainScore[]; }

export interface SystemHealthInput {
  netHealth: number; slaCompliancePct: number; breaching: number;
  powUtilPct: number; spi: number; cpi: number;
  compliancePct: number; offlineCircuits: number; exposedSites: number;
}
export function systemHealth(i: SystemHealthInput): SystemHealth {
  const run = clamp(i.netHealth * 0.5 + i.slaCompliancePct * 0.5 - i.breaching * 2);
  const build = clamp((Math.min(i.spi, 1) * 0.5 + Math.min(i.cpi, 1) * 0.5) * 100);
  // Capacity is about HEADROOM, not raw utilisation: healthy until load climbs into
  // the danger band (normal DC operating range ~50–75% should read green).
  const u = i.powUtilPct;
  const capacity = clamp(u <= 70 ? 100 : u <= 85 ? 100 - (u - 70) * 2 : u <= 95 ? 70 - (u - 85) * 3 : 40 - (u - 95) * 4);
  const connectivity = clamp(100 - i.offlineCircuits * 10 - i.exposedSites * 5);
  const governance = clamp(i.compliancePct);
  const domains: DomainScore[] = [
    { name: 'Run', score: run, weight: 0.3 },
    { name: 'Build', score: build, weight: 0.2 },
    { name: 'Capacity', score: capacity, weight: 0.2 },
    { name: 'Connectivity', score: connectivity, weight: 0.15 },
    { name: 'Governance', score: governance, weight: 0.15 },
  ];
  const overall = clamp(domains.reduce((s, d) => s + d.score * d.weight, 0));
  return { overall, band: overall >= 80 ? 'Healthy' : overall >= 60 ? 'Degraded' : 'Critical', domains };
}
export const healthBandColor = (score: number) => score >= 80 ? 'var(--vw-color-green-600)' : score >= 60 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)';

// ── Capacity runway (linear projection of the real trend) ────────────
export interface Runway {
  label: string; growthPerMonth: number; monthsToThreshold: number | null;
  date?: string; status: 'stable' | 'watch' | 'urgent'; detail: string;
}
/** Project a utilisation trend (% per bucket, ~monthly) forward to a threshold. */
export function capacityRunway(label: string, currentPct: number, trend: number[], threshold = 90): Runway {
  if (trend.length < 2) return { label, growthPerMonth: 0, monthsToThreshold: null, status: 'stable', detail: 'insufficient history' };
  // Average recent slope (last half of the series), in points/month.
  const half = trend.slice(Math.floor(trend.length / 2));
  const growth = (half[half.length - 1] - half[0]) / Math.max(1, half.length - 1);
  if (growth <= 0.05) return { label, growthPerMonth: Math.round(growth * 10) / 10, monthsToThreshold: null, status: 'stable', detail: 'flat or declining — no exhaustion in view' };
  const months = (threshold - currentPct) / growth;
  const date = new Date(Date.now() + months * 30 * 864e5);
  const status: Runway['status'] = months <= 3 ? 'urgent' : months <= 9 ? 'watch' : 'stable';
  return {
    label, growthPerMonth: Math.round(growth * 10) / 10, monthsToThreshold: Math.max(0, Math.round(months)),
    date: date.toISOString().slice(0, 10), status,
    detail: `+${(Math.round(growth * 10) / 10)} pts/mo → ${threshold}% in ~${Math.max(0, Math.round(months))} mo`,
  };
}
export const runwayColor = (s: Runway['status']) => s === 'urgent' ? 'var(--vw-color-red-600)' : s === 'watch' ? 'var(--vw-color-orange-700)' : 'var(--vw-color-green-600)';

// ── Anomaly detection (statistical deviation flags) ──────────────────
export interface Anomaly { id: string; domain: string; severity: 'high' | 'med' | 'low'; title: string; detail: string; to: string; }
export const anomalyColor = (s: Anomaly['severity']) => s === 'high' ? 'var(--vw-color-red-600)' : s === 'med' ? 'var(--vw-color-orange-700)' : 'var(--primaryColor500)';

export interface AnomalyInput {
  ifaces: Array<{ id: string; deviceId: string; name: string; operStatus: string; utilizationPct: number; inErrors: number; outErrors: number }>;
  devName: Record<string, string>;
  healthRows: Array<{ device: { hostname: string; id: string }; score: number }>;
  alarmDaily: number[];           // daily alarm counts over the window
  spi: number; cpi: number; eac: number; bac: number;
  saturatedCircuits: Array<{ cid: string; id: string }>;
  driftSpike: number;             // devices with drift
}
export function detectAnomalies(i: AnomalyInput): Anomaly[] {
  const out: Anomaly[] = [];
  // Interface saturation / error storms (deviation from healthy operating band).
  i.ifaces.filter((f) => f.operStatus === 'Up' && (f.utilizationPct >= 92 || f.inErrors + f.outErrors >= 70))
    .sort((a, b) => b.utilizationPct - a.utilizationPct).slice(0, 3)
    .forEach((f) => out.push({ id: 'an-if-' + f.id, domain: 'Performance', severity: f.utilizationPct >= 95 ? 'high' : 'med', title: `${i.devName[f.deviceId] ?? 'device'} · ${f.name} saturated`, detail: `${f.utilizationPct}% utilisation, ${f.inErrors + f.outErrors} errors — above normal band`, to: '/nms/performance' }));
  // Sharp device-health drop.
  i.healthRows.filter((r) => r.score < 55).sort((a, b) => a.score - b.score).slice(0, 2)
    .forEach((r) => out.push({ id: 'an-dev-' + r.device.id, domain: 'Network', severity: r.score < 40 ? 'high' : 'med', title: `${r.device.hostname} health degraded`, detail: `composite health ${r.score}/100 — investigate`, to: `/nms/devices/${r.device.id}` }));
  // Alarm-rate spike vs the trailing daily mean.
  if (i.alarmDaily.length >= 4) {
    const today = i.alarmDaily[i.alarmDaily.length - 1];
    const mean = i.alarmDaily.slice(0, -1).reduce((s, v) => s + v, 0) / (i.alarmDaily.length - 1);
    if (mean > 0 && today >= mean * 1.8 && today >= 4) out.push({ id: 'an-alm', domain: 'Fault', severity: 'high', title: 'Alarm rate spike', detail: `${today} raised today vs ~${mean.toFixed(1)}/day baseline`, to: '/nms/alarms' });
  }
  // Cost / schedule out of band.
  if (i.eac > i.bac * 1.05) out.push({ id: 'an-cost', domain: 'Delivery', severity: 'med', title: 'Portfolio forecast over budget', detail: `EAC exceeds BAC by ${Math.round(((i.eac - i.bac) / i.bac) * 100)}%`, to: '/delivery' });
  if (i.spi < 0.85) out.push({ id: 'an-spi', domain: 'Delivery', severity: 'med', title: 'Schedule slipping', detail: `SPI ${i.spi.toFixed(2)} — earned schedule behind plan`, to: '/delivery' });
  if (i.saturatedCircuits.length) out.push({ id: 'an-ckt', domain: 'Connectivity', severity: 'med', title: `${i.saturatedCircuits.length} circuit(s) saturated`, detail: 'sustained ≥90% — plan an upgrade order (long lead)', to: '/circuits' });
  if (i.driftSpike >= 5) out.push({ id: 'an-drift', domain: 'Config', severity: 'low', title: `${i.driftSpike} devices drifted from golden`, detail: 'configuration divergence above baseline', to: '/nms/config' });
  const rank = { high: 0, med: 1, low: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
