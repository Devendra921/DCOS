/**
 * NMS — composite device & fleet health.
 *
 * One number per device that fuses the four operational signals we now compute:
 * reachability (fault), active alarm load (fault), interface utilisation
 * (performance) and config compliance (configuration). It's the NMS analogue of
 * the programme-health score in Delivery — a single rollup that the network-health
 * landing reads, with the deep tabs holding the detail. Pure functions.
 */
import type { ManagedDevice, Interface, Alarm } from '../../../mock/data/types';
import type { FleetRow } from './config';

export type HealthBand = 'Healthy' | 'Degraded' | 'Critical';
// Literal hex, not tokens — feeds a Pie chart's `scale.color.range`
// (NmsHubPage's health-distribution donut, canvas-rendered via
// @ant-design/charts), which can't resolve `var(--...)` references.
export const HEALTH_HEX: Record<HealthBand, string> = { Healthy: '#16a34a', Degraded: '#c2410c', Critical: '#dc2626' };
export const bandOf = (score: number): HealthBand => score >= 80 ? 'Healthy' : score >= 60 ? 'Degraded' : 'Critical';
export const healthColor = (score: number) => HEALTH_HEX[bandOf(score)];

export interface DeviceHealth {
  device: ManagedDevice; score: number; band: HealthBand;
  activeAlarms: number; critMajor: number; maxUtil: number; compliancePct: number; drift: boolean;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function deviceHealth(device: ManagedDevice, ifaces: Interface[], active: Alarm[], row?: FleetRow): DeviceHealth {
  const critMajor = active.filter((a) => a.severity === 'Critical' || a.severity === 'Major').length;
  const maxUtil = ifaces.reduce((m, i) => Math.max(m, i.utilizationPct), 0);
  const compliancePct = row?.compliancePct ?? 100;
  const drift = row?.drift ?? false;

  let score = 100;
  if (device.reachability === 'Unreachable') score -= 45;
  else if (device.reachability === 'Degraded') score -= 20;
  score -= Math.min(40, active.reduce((s, a) => s + (a.severity === 'Critical' ? 8 : a.severity === 'Major' ? 4 : 1), 0));
  if (maxUtil >= 95) score -= 15; else if (maxUtil >= 85) score -= 8;
  score -= (100 - compliancePct) * 0.3;
  if (drift) score -= 4;
  score = clamp(score);
  return { device, score, band: bandOf(score), activeAlarms: active.length, critMajor, maxUtil, compliancePct, drift };
}

export interface FleetHealth {
  rows: DeviceHealth[]; avg: number;
  byBand: Array<{ band: HealthBand; n: number }>;
  byRole: Array<{ role: string; avg: number; n: number }>;
  worst: DeviceHealth[];
}

export function fleetHealth(managed: ManagedDevice[], alarms: Alarm[], ifByDevice: Map<string, Interface[]>, fleetRows: FleetRow[]): FleetHealth {
  const activeByDevice = new Map<string, Alarm[]>();
  for (const a of alarms) { if (a.state === 'Active') { const arr = activeByDevice.get(a.deviceId) ?? []; arr.push(a); activeByDevice.set(a.deviceId, arr); } }
  const rowByDevice = new Map(fleetRows.map((r) => [r.device.id, r]));
  const rows = managed.map((d) => deviceHealth(d, ifByDevice.get(d.id) ?? [], activeByDevice.get(d.id) ?? [], rowByDevice.get(d.id)));
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 100;

  const bands: HealthBand[] = ['Healthy', 'Degraded', 'Critical'];
  const roleAgg = new Map<string, { sum: number; n: number }>();
  for (const r of rows) { const a = roleAgg.get(r.device.role) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n++; roleAgg.set(r.device.role, a); }
  return {
    rows, avg,
    byBand: bands.map((b) => ({ band: b, n: rows.filter((r) => r.band === b).length })).filter((x) => x.n > 0),
    byRole: Array.from(roleAgg.entries()).map(([role, a]) => ({ role, avg: Math.round(a.sum / a.n), n: a.n })).sort((a, b) => a.avg - b.avg),
    worst: [...rows].sort((a, b) => a.score - b.score).slice(0, 10),
  };
}
