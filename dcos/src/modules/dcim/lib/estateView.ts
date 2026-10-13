/* Display helpers (roll-ups live in facility/lib/estateRules.ts) for the estate fields on devices, cables, GPU clusters, routing sessions,
   collectors and services (types.ts, block "Estate model additions"). Pure functions only. */
import type { Cable, Device, GpuSpec, NetworkLayer, Service } from '../../../mock/data/types';

export const LAYER_LABEL: Record<NetworkLayer, string> = { core: 'Core', spine: 'Spine', leaf: 'Leaf', access: 'Access' };
export const LAYERS: NetworkLayer[] = ['core', 'spine', 'leaf', 'access'];
export const layerLabel = (l?: string) => (l ? LAYER_LABEL[l as NetworkLayer] ?? l : undefined);

/** "8 × H100 SXM 80 GB" */
export const gpuText = (g?: GpuSpec) => (g ? `${g.count} × ${g.model}` : undefined);

/** Whether a device is watched, deliberately not watched, or nobody has said. */
export type MonitoringState = 'monitored' | 'not-monitored' | 'unknown';
export const monitoringOf = (d: Pick<Device, 'monitored' | 'collectorId'>): MonitoringState =>
  d.monitored === true || (d.monitored == null && d.collectorId) ? 'monitored' : d.monitored === false ? 'not-monitored' : 'unknown';
export const MONITORING_LABEL: Record<MonitoringState, string> = { monitored: 'Monitored', 'not-monitored': 'Not monitored', unknown: 'Not recorded' };

/** Money in the record's own currency (no currency is assumed beyond the fallback). */
export function fmtMoney(n: number, currency = 'USD', compact = false): string {
  const locale = currency === 'INR' ? 'en-IN' : currency === 'EUR' ? 'de-DE' : currency === 'GBP' ? 'en-GB' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: compact ? 1 : 0, notation: compact ? 'compact' : 'standard' }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString('en-US')}`;
  }
}
/** Sum money per currency: "$120,000 + €8,000". Never adds two currencies together. */
export function sumByCurrency(items: { amount: number; currency?: string }[], fallback = 'USD'): { currency: string; amount: number }[] {
  const m = new Map<string, number>();
  for (const it of items) { const c = it.currency ?? fallback; m.set(c, (m.get(c) ?? 0) + it.amount); }
  return [...m.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount);
}
export const fmtMoneyTotals = (items: { amount: number; currency?: string }[], compact = false, fallback = 'USD') => {
  const t = sumByCurrency(items, fallback);
  return t.length ? t.map((x) => fmtMoney(x.amount, x.currency, compact)).join(' + ') : fmtMoney(0, fallback, compact);
};

export const fmtCapacity = (mbps?: number) => (mbps == null ? undefined : mbps >= 1000 ? `${+(mbps / 1000).toFixed(1)} Gbps` : `${mbps} Mbps`);

/** GPU totals per model across every GPU server (clustered or not). */
export function gpuTotalsByModel(devices: Device[]): { model: string; vendor: string; nodes: number; gpus: number; liquid: number; clustered: number }[] {
  const m = new Map<string, { model: string; vendor: string; nodes: number; gpus: number; liquid: number; clustered: number }>();
  for (const d of devices) {
    const g = d.gpu; if (!g) continue;
    const r = m.get(g.model) ?? { model: g.model, vendor: g.vendor, nodes: 0, gpus: 0, liquid: 0, clustered: 0 };
    r.nodes += 1; r.gpus += g.count; if (g.cooling === 'liquid') r.liquid += 1; if (g.clusterId) r.clustered += 1;
    m.set(g.model, r);
  }
  return [...m.values()].sort((a, b) => b.gpus - a.gpus);
}

/** A service sold as GPU capacity (by type or unit); such services occupy the GPU servers in their racks. */
export const isGpuService = (s: Pick<Service, 'type' | 'unit'>) => /gpu/i.test(`${s.type} ${s.unit}`);

/** Services that run on the given devices: on the device or its path, or (GPU services) in the devices' racks. */
export function servicesOn(services: Service[], deviceIds: Set<string>, rackIds: Set<string>): Service[] {
  return services.filter((s) => (s.deviceId && deviceIds.has(s.deviceId))
    || s.pathDeviceIds?.some((id) => deviceIds.has(id))
    || (isGpuService(s) && ((s.rackId && rackIds.has(s.rackId)) || s.rackIds?.some((id) => rackIds.has(id)))));
}

/** Racks a service occupies: the multi-rack list, else the single rack. */
export const racksOfService = (s: Pick<Service, 'rackIds' | 'rackId'>) => (s.rackIds?.length ? s.rackIds : s.rackId ? [s.rackId] : []);

/** Patch ports as one line: "MMR-PP03:12 → PP07:4". */
export const patchText = (c: Pick<Cable, 'aPatchPort' | 'bPatchPort'>) =>
  c.aPatchPort || c.bPatchPort ? `${c.aPatchPort ?? '—'} → ${c.bPatchPort ?? '—'}` : undefined;

export const COLLECTOR_TONE: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = { Healthy: 'success', Degraded: 'warning', Down: 'error' };
export const SESSION_TONE: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = { Established: 'success', Planned: 'neutral', Down: 'error' };
export const CLUSTER_TONE: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = { Live: 'success', Planned: 'info', Degraded: 'warning', Retired: 'neutral' };

/** Deep links used across screens. */
export const collectorHref = (id: string) => `/nms/discovery?view=collectors&col=${encodeURIComponent(id)}`;
export const clusterHref = (id: string) => `/capacity/compute?cluster=${encodeURIComponent(id)}`;
export const customerHref = (id: string) => `/customers/${encodeURIComponent(id)}`;
