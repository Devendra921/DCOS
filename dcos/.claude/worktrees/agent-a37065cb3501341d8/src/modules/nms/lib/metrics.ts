/**
 * NMS — deterministic synthetic time-series engine.
 *
 * A real NMS polls every device/interface every N seconds into a time-series
 * store. We have no backend, so we *synthesise* per-interface series
 * deterministically — seeded by the interface id, so the same interface always
 * produces the same curve (no flicker across renders) while still looking alive:
 * a baseline (the seeded utilizationPct) + a diurnal day/night swing + bounded
 * noise + the occasional spike. From that we derive baselines (p50/p95), current
 * value and threshold breaches. This is the buildCostCurve of Network Operations.
 *
 * Pure functions, no React/store — reusable by Performance, device health and
 * the fault engine (a sustained breach is what raises a threshold alarm).
 */
import type { Interface } from '../../../mock/data/types';

export interface MetricPoint { t: number; util: number; mbps: number; }

export const UTIL_WARN = 85;
export const UTIL_CRIT = 95;

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeriesOpts { points?: number; stepMins?: number; now?: number; }

/** Per-interface utilization (%) + throughput (Mbps) over a trailing window. */
export function buildSeries(seedKey: string, baselinePct: number, speedGbps: number, opts: SeriesOpts = {}): MetricPoint[] {
  const points = opts.points ?? 48;
  const step = opts.stepMins ?? 30;
  const now = opts.now ?? Date.now();
  const r = rng(hashStr(seedKey));
  const amp = Math.max(4, baselinePct * 0.35);
  const phase = r() * Math.PI * 2;
  const out: MetricPoint[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const t = now - i * step * 60000;
    const d = new Date(t);
    const hod = d.getHours() + d.getMinutes() / 60;
    const diurnal = Math.sin((hod / 24) * Math.PI * 2 - phase); // -1..1, peaks mid-afternoon-ish
    const noise = (r() - 0.5) * amp * 0.5;
    const spike = r() > 0.965 ? amp * 1.6 * r() : 0;
    const util = clamp(baselinePct + amp * diurnal * 0.6 + noise + spike);
    out.push({ t, util: Math.round(util), mbps: Math.round((util / 100) * (speedGbps || 10) * 1000) });
  }
  return out;
}

export function percentile(vals: number[], p: number): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export interface IfStat { iface: Interface; series: MetricPoint[]; cur: number; p95: number; p50: number; breach: boolean; }

export function ifaceStat(iface: Interface, opts?: SeriesOpts): IfStat {
  const series = buildSeries(iface.id, iface.utilizationPct, iface.speedGbps || 10, opts);
  const utils = series.map((s) => s.util);
  const cur = utils[utils.length - 1] ?? iface.utilizationPct;
  return { iface, series, cur, p95: percentile(utils, 95), p50: percentile(utils, 50), breach: percentile(utils, 95) >= UTIL_WARN };
}

export function utilColor(v: number): string {
  return v >= UTIL_CRIT ? 'var(--vw-color-red-600)' : v >= UTIL_WARN ? 'var(--vw-color-orange-700)' : v >= 60 ? 'var(--primaryColor500)' : 'var(--vw-color-green-600)';
}

/** Estate throughput (Ingress/Egress, Gbps) summed across up interfaces over the window. */
export function estateThroughput(ifaces: Interface[], opts: SeriesOpts = {}): Array<{ t: string; series: string; value: number }> {
  const points = opts.points ?? 48;
  const step = opts.stepMins ?? 30;
  const now = opts.now ?? Date.now();
  const up = ifaces.filter((i) => i.operStatus === 'Up');
  const inAgg = new Array(points).fill(0);
  const outAgg = new Array(points).fill(0);
  for (const i of up) {
    const s = buildSeries(i.id, i.utilizationPct, i.speedGbps || 10, { points, stepMins: step, now });
    const split = 0.42 + rng(hashStr(i.id + 'io'))() * 0.16;
    s.forEach((p, idx) => { inAgg[idx] += p.mbps * split; outAgg[idx] += p.mbps * (1 - split); });
  }
  const fmt = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const res: Array<{ t: string; series: string; value: number }> = [];
  for (let idx = 0; idx < points; idx++) {
    const t = now - (points - 1 - idx) * step * 60000;
    res.push({ t: fmt(t), series: 'Ingress', value: Math.round(inAgg[idx] / 100) / 10 });
    res.push({ t: fmt(t), series: 'Egress', value: Math.round(outAgg[idx] / 100) / 10 });
  }
  return res;
}

export interface PerfSummary {
  meanUtil: number; p95Util: number; up: number; down: number;
  breaching: number; throughputGbps: number;
  top: IfStat[];
  buckets: Array<{ band: string; n: number; color: string }>;
}

/** One pass over interfaces → all the numbers the Performance screen needs. */
export function perfSummary(ifaces: Interface[], opts?: SeriesOpts): PerfSummary {
  const up = ifaces.filter((i) => i.operStatus === 'Up');
  const stats = up.map((i) => ifaceStat(i, opts));
  const curs = stats.map((s) => s.cur);
  const meanUtil = curs.length ? Math.round(curs.reduce((a, b) => a + b, 0) / curs.length) : 0;
  const throughputMbps = stats.reduce((a, s) => a + (s.series[s.series.length - 1]?.mbps ?? 0), 0);
  const band = (v: number) => v >= UTIL_CRIT ? 3 : v >= UTIL_WARN ? 2 : v >= 60 ? 1 : 0;
  const counts = [0, 0, 0, 0];
  curs.forEach((v) => { counts[band(v)]++; });
  return {
    meanUtil,
    p95Util: percentile(curs, 95),
    up: up.length,
    down: ifaces.length - up.length,
    breaching: stats.filter((s) => s.breach).length,
    throughputGbps: Math.round(throughputMbps / 1000),
    top: [...stats].sort((a, b) => b.p95 - a.p95).slice(0, 8),
    buckets: [
      { band: '< 60%', n: counts[0], color: 'var(--vw-color-green-600)' },
      { band: '60–85%', n: counts[1], color: 'var(--primaryColor500)' },
      { band: '85–95%', n: counts[2], color: 'var(--vw-color-orange-700)' },
      { band: '≥ 95%', n: counts[3], color: 'var(--vw-color-red-600)' },
    ],
  };
}
