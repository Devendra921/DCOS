/**
 * Network topology — per-DC fabric graph.
 *
 * Lays the managed devices out as a hierarchical fabric (Core/edge → Spine →
 * Leaf-ToR → Access) with tier-adjacency links, and rolls each node's live
 * signals (reachability, composite health, peak interface utilisation, active
 * alarms) so the graph can be painted by any layer — the topology twin of the
 * geo map. Pure functions; layout coordinates included.
 */
import type { ManagedDevice, Interface, Alarm } from '../../../mock/data/types';

export const TIERS = ['Core', 'Spine', 'Leaf/TOR', 'Access'] as const;
export type Tier = typeof TIERS[number];
export const tierOf = (role: string): Tier =>
  role === 'Core' || role === 'Edge' ? 'Core' : role === 'Spine' ? 'Spine' : role === 'Leaf/TOR' ? 'Leaf/TOR' : 'Access';

const SEV_RANK: Record<string, number> = { Info: 0, Warning: 1, Minor: 2, Major: 3, Critical: 4 };

export interface TopoNode {
  id: string; hostname: string; role: string; tier: Tier; x: number; y: number;
  reach: string; health: number; util: number; alarms: number; alarmMaxSev: string | null;
}
export interface TopoEdge { id: string; x1: number; y1: number; x2: number; y2: number; down: boolean; }
export interface Fabric { nodes: TopoNode[]; edges: TopoEdge[]; tierCounts: Record<Tier, number>; width: number; height: number; }

const ROW_Y: Record<Tier, number> = { Core: 46, Spine: 150, 'Leaf/TOR': 254, Access: 358 };
const PER_TIER_CAP = 18;

export function buildFabric(dcId: string, managed: ManagedDevice[], interfaces: Interface[], alarms: Alarm[]): Fabric {
  const activeByDev = new Map<string, Alarm[]>();
  for (const a of alarms) if (a.state === 'Active') { const arr = activeByDev.get(a.deviceId) ?? []; arr.push(a); activeByDev.set(a.deviceId, arr); }
  const ifByDev = new Map<string, Interface[]>();
  for (const i of interfaces) { const arr = ifByDev.get(i.deviceId) ?? []; arr.push(i); ifByDev.set(i.deviceId, arr); }

  const devs = managed.filter((d) => d.dataCenterId === dcId);
  const W = 940;
  const byTier: Record<Tier, ManagedDevice[]> = { Core: [], Spine: [], 'Leaf/TOR': [], Access: [] };
  for (const d of devs) byTier[tierOf(d.role)].push(d);

  const nodes: TopoNode[] = [];
  const tierNodes: Record<Tier, TopoNode[]> = { Core: [], Spine: [], 'Leaf/TOR': [], Access: [] };
  for (const tier of TIERS) {
    const list = byTier[tier].slice(0, PER_TIER_CAP);
    list.forEach((d, i) => {
      const al = activeByDev.get(d.id) ?? [];
      let health = 100;
      if (d.reachability === 'Unreachable') health -= 45; else if (d.reachability === 'Degraded') health -= 20;
      health -= Math.min(30, al.reduce((x, a) => x + (a.severity === 'Critical' ? 8 : a.severity === 'Major' ? 4 : 1), 0));
      const ifs = (ifByDev.get(d.id) ?? []).filter((f) => f.operStatus === 'Up');
      const util = ifs.length ? Math.max(...ifs.map((f) => f.utilizationPct)) : 0;
      const node: TopoNode = {
        id: d.id, hostname: d.hostname, role: d.role, tier, x: ((i + 1) / (list.length + 1)) * W, y: ROW_Y[tier],
        reach: d.reachability, health: Math.max(0, health), util,
        alarms: al.length, alarmMaxSev: al.length ? [...al].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])[0].severity : null,
      };
      nodes.push(node); tierNodes[tier].push(node);
    });
  }

  // Tier-adjacency edges: each node links to up to 2 parents in the tier above.
  const edges: TopoEdge[] = [];
  for (let t = 1; t < TIERS.length; t++) {
    const tier = TIERS[t], prev = tierNodes[TIERS[t - 1]];
    if (!prev.length) continue;
    tierNodes[tier].forEach((n, i) => {
      const parents = prev.length === 1 ? [prev[0]] : [prev[i % prev.length], prev[(i + 1) % prev.length]];
      parents.forEach((p, k) => edges.push({ id: `${n.id}-${p.id}-${k}`, x1: n.x, y1: n.y, x2: p.x, y2: p.y, down: n.reach === 'Unreachable' || p.reach === 'Unreachable' }));
    });
  }

  return {
    nodes, edges, width: W, height: 410,
    tierCounts: { Core: byTier.Core.length, Spine: byTier.Spine.length, 'Leaf/TOR': byTier['Leaf/TOR'].length, Access: byTier.Access.length },
  };
}

export const reachColor = (r: string) => r === 'Reachable' ? 'var(--vw-color-green-600)' : r === 'Degraded' ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)';
