/**
 * Circuits — operational + financial derivation.
 *
 * A circuit is the DC's umbilical: external connectivity under contract and SLA.
 * Now that the A-side terminates on a real NMS device interface, we can fuse the
 * three views the inventory was missing — operational health/utilisation (from
 * the bound interface), cost/SLA (from the contract), and redundancy/diversity
 * (per site). Pure functions over the snapshot.
 */
import { dcTypeProfile } from '../../../mock/data/dcTypes';
import type { Circuit, CircuitTermination, Interface, Provider, DataCenter } from '../../../mock/data/types';

// Literal hex, not tokens — this feeds a Pie chart's `scale.color.range`
// (@ant-design/charts, canvas-rendered) via CircuitsListPage's status-mix
// chart, and canvas can't resolve `var(--...)` references. It's also used
// safely elsewhere via VwChip, but the one canvas consumer means the whole
// map must stay literal.
export const CKT_STATUS_COLOR: Record<string, string> = {
  Active: '#16a34a', Provisioning: '#000000', Planned: '#a16207', Offline: '#dc2626', Decommissioned: '#7c7c7c',
};
export type CircuitHealth = 'Up' | 'Degraded' | 'Down' | 'Pending';
export const HEALTH_COLOR: Record<CircuitHealth, string> = { Up: 'var(--vw-color-green-600)', Degraded: 'var(--vw-color-orange-700)', Down: 'var(--vw-color-red-600)', Pending: '#7c7c7c' };

export const fmtGbps = (mbps?: number) => mbps == null ? '—' : mbps >= 1000 ? `${mbps / 1000}G` : `${mbps}M`;
export const fmtMoney = (v?: number) => v == null ? '—' : v >= 1_000_000 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;
export const utilColor = (v: number) => v >= 90 ? 'var(--vw-color-red-600)' : v >= 75 ? 'var(--vw-color-orange-700)' : v >= 50 ? 'var(--primaryColor500)' : 'var(--vw-color-green-600)';

export interface CircuitView {
  circuit: Circuit; aTerm?: CircuitTermination; zTerm?: CircuitTermination;
  util: number; actualGbps: number; health: CircuitHealth; ifaceDown: boolean;
}

export function circuitView(circuit: Circuit, terms: CircuitTermination[], ifById: Map<string, Interface>): CircuitView {
  const aTerm = terms.find((t) => t.circuitId === circuit.id && t.side === 'A');
  const zTerm = terms.find((t) => t.circuitId === circuit.id && t.side === 'Z');
  const iface = aTerm?.interfaceId ? ifById.get(aTerm.interfaceId) : undefined;
  const util = iface ? iface.utilizationPct : 0;
  const ifaceDown = iface ? iface.operStatus === 'Down' : false;
  const commitGbps = (circuit.commitRateMbps ?? 0) / 1000;
  const actualGbps = Math.round((util / 100) * commitGbps * 10) / 10;
  let health: CircuitHealth = 'Up';
  if (circuit.status === 'Offline') health = 'Down';
  else if (circuit.status === 'Planned' || circuit.status === 'Provisioning' || circuit.status === 'Decommissioned') health = 'Pending';
  else if (ifaceDown || util >= 90) health = 'Degraded';
  return { circuit, aTerm, zTerm, util, actualGbps, health, ifaceDown };
}

export interface CircuitStats {
  total: number; active: number; committedGbps: number; monthlySpendUsd: number;
  avgUtil: number; saturated: number; offline: number; provisioning: number;
}
export function circuitStats(circuits: Circuit[], terms: CircuitTermination[], ifById: Map<string, Interface>): CircuitStats {
  const active = circuits.filter((c) => c.status === 'Active');
  const views = active.map((c) => circuitView(c, terms, ifById));
  const utils = views.map((v) => v.util);
  return {
    total: circuits.length,
    active: active.length,
    committedGbps: Math.round(active.reduce((s, c) => s + (c.commitRateMbps ?? 0), 0) / 1000),
    monthlySpendUsd: active.reduce((s, c) => s + (c.monthlyCostUsd ?? 0), 0),
    avgUtil: utils.length ? Math.round(utils.reduce((a, b) => a + b, 0) / utils.length) : 0,
    saturated: views.filter((v) => v.util >= 90).length,
    offline: circuits.filter((c) => c.status === 'Offline').length,
    provisioning: circuits.filter((c) => c.status === 'Provisioning' || c.status === 'Planned').length,
  };
}

export interface ProviderSpend { provider: Provider; spend: number; count: number; activeCount: number; }
export function providerSpend(providers: Provider[], circuits: Circuit[]): ProviderSpend[] {
  return providers.map((p) => {
    const own = circuits.filter((c) => c.providerId === p.id);
    return { provider: p, count: own.length, activeCount: own.filter((c) => c.status === 'Active').length, spend: own.filter((c) => c.status === 'Active').reduce((s, c) => s + (c.monthlyCostUsd ?? 0), 0) };
  }).filter((x) => x.count > 0).sort((a, b) => b.spend - a.spend);
}

export interface SiteDiversity {
  dcId: string; dcName: string; activeCircuits: number; carriers: number; internetCircuits: number;
  singleHomed: boolean; noCarrierDiversity: boolean;
  /** Whether this site's type expects a diverse WAN (false for server rooms / edge closets). */
  diversityExpected: boolean;
  /** singleHomed or noCarrierDiversity AND the type expects diversity — the flag consumers should act on. */
  exposed: boolean;
}
/** Per-site redundancy posture: a site is exposed if it has one uplink, one carrier, or <2 internet paths. */
export function siteRedundancy(circuits: Circuit[], terms: CircuitTermination[], dcs: DataCenter[]): SiteDiversity[] {
  // A server room or edge closet being single-homed is its normal posture; only types whose profile expects WAN diversity count as exposed.
  const aTermByCircuit = new Map<string, CircuitTermination>();
  for (const t of terms) if (t.side === 'A') aTermByCircuit.set(t.circuitId, t);
  const out: SiteDiversity[] = [];
  for (const dc of dcs) {
    const here = circuits.filter((c) => c.status === 'Active' && aTermByCircuit.get(c.id)?.dataCenterId === dc.id);
    if (!here.length) continue;
    const carriers = new Set(here.map((c) => c.providerId));
    const internet = here.filter((c) => c.purpose === 'Internet').length;
    const diversityExpected = dcTypeProfile(dc.dcTypeKey)?.physical.diversityExpected ?? true;
    const singleHomed = here.length < 2; const noCarrierDiversity = carriers.size < 2;
    out.push({
      dcId: dc.id, dcName: dc.code || dc.name, activeCircuits: here.length, carriers: carriers.size, internetCircuits: internet,
      singleHomed, noCarrierDiversity, diversityExpected, exposed: diversityExpected && (singleHomed || noCarrierDiversity),
    });
  }
  return out.sort((a, b) => a.activeCircuits - b.activeCircuits);
}

export const LIFECYCLE = ['Ordered', 'Provisioned', 'Tested', 'Active'] as const;
/** Index into LIFECYCLE for the stepper (current reached stage). */
export function lifecycleStep(c: Circuit): number {
  if (c.status === 'Active' || c.activatedAt) return 3;
  if (c.testedAt) return 2;
  if (c.provisionedAt || c.status === 'Provisioning') return 1;
  return 0;
}
