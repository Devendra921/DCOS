/**
 * NMS — discovery reconciliation: discovered network state vs the source of truth.
 *
 * The signature NMS job in a "single source of truth" platform: a scan finds
 * what is actually on the wire; we compare it to the planned/managed record
 * (DCIM devices + the managed set + golden config) and surface every divergence
 * as a *finding* the operator can resolve — adopt it, correct the record, or
 * raise a governed change. This is the network analogue of earned-value's
 * plan-vs-actual. Pure functions over the snapshot.
 */
import type { Device, ManagedDevice } from '../../../mock/data/types';
import type { FleetRow } from './config';

export type FindingType = 'Unmanaged' | 'Unreachable' | 'ConfigDrift' | 'AttributeMismatch';
export type FindingAction = 'Adopt' | 'Change' | 'Accept' | 'Investigate';

export interface ReconFinding {
  id: string; type: FindingType; severity: 'Critical' | 'Major' | 'Minor';
  deviceId: string; deviceName: string; detail: string; recommendation: string; action: FindingAction;
}

export const FINDING_COLOR: Record<FindingType, string> = {
  Unmanaged: '#9747ff', Unreachable: 'var(--vw-color-red-600)', ConfigDrift: 'var(--vw-color-orange-700)', AttributeMismatch: 'var(--primaryColor500)',
};
export const FINDING_LABEL: Record<FindingType, string> = {
  Unmanaged: 'Unmanaged', Unreachable: 'Unreachable', ConfigDrift: 'Config drift', AttributeMismatch: 'Attribute mismatch',
};

function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const isNet = (d: Device) => ['Switch', 'Router', 'Firewall'].includes(d.category ?? '');

export function reconcile(devices: Device[], managed: ManagedDevice[], fleetRows: FleetRow[]): ReconFinding[] {
  const managedIds = new Set(managed.map((m) => m.id));
  const findings: ReconFinding[] = [];

  // Discovered on the wire but not under NMS management (e.g. unmanaged access ToRs).
  devices.filter((d) => isNet(d) && !managedIds.has(d.id)).slice(0, 16).forEach((d) => findings.push({
    id: `F-UM-${d.id}`, type: 'Unmanaged', severity: 'Minor', deviceId: d.id, deviceName: d.hostname ?? d.name,
    detail: 'Discovered on the network but not under NMS management.', recommendation: 'Adopt into managed inventory.', action: 'Adopt',
  }));
  // Under management but not responding to polls.
  managed.filter((m) => m.reachability === 'Unreachable').slice(0, 12).forEach((m) => findings.push({
    id: `F-UR-${m.id}`, type: 'Unreachable', severity: 'Major', deviceId: m.id, deviceName: m.hostname,
    detail: 'Under management but unreachable on the last poll.', recommendation: 'Investigate reachability; raise an incident if confirmed down.', action: 'Investigate',
  }));
  // Running config diverged from the golden baseline.
  fleetRows.filter((r) => r.drift).slice(0, 14).forEach((r) => findings.push({
    id: `F-CD-${r.device.id}`, type: 'ConfigDrift', severity: r.compliancePct < 80 ? 'Major' : 'Minor', deviceId: r.device.id, deviceName: r.device.hostname,
    detail: `Running config differs from golden — ${r.driftCount} line(s), ${r.compliancePct}% compliant.`, recommendation: 'Restore golden or raise a governed change.', action: 'Change',
  }));
  // Attributes on the wire differ from the recorded values.
  managed.filter((m) => hashStr(m.id) % 11 === 0).slice(0, 8).forEach((m) => {
    const osKind = hashStr(m.id + 'a') % 2 === 0;
    findings.push({
      id: `F-AM-${m.id}`, type: 'AttributeMismatch', severity: 'Minor', deviceId: m.id, deviceName: m.hostname,
      detail: osKind ? 'Discovered OS version differs from the recorded version.' : 'Management IP on the wire differs from the recorded mgmt IP.',
      recommendation: 'Accept the discovered value into the source of truth, or correct the record.', action: 'Accept',
    });
  });
  return findings;
}

export interface ReconStats {
  discovered: number; managed: number; unmanaged: number; coveragePct: number;
  total: number; byType: Array<{ type: FindingType; n: number }>;
}
// A scan "discovers" what it can see on the monitored segments: the devices
// already under management plus any newly-found (unmanaged) ones. Coverage is
// therefore managed ÷ (managed + newly-discovered) — a healthy NOC sits high,
// with the unmanaged tail being the adopt-worklist.
export function reconStats(managed: ManagedDevice[], findings: ReconFinding[]): ReconStats {
  const unmanaged = findings.filter((f) => f.type === 'Unmanaged').length;
  const managedN = managed.length;
  const discovered = managedN + unmanaged;
  const types: FindingType[] = ['Unmanaged', 'Unreachable', 'ConfigDrift', 'AttributeMismatch'];
  return {
    discovered, managed: managedN, unmanaged,
    coveragePct: discovered ? Math.round((managedN / discovered) * 100) : 100,
    total: findings.length,
    byType: types.map((t) => ({ type: t, n: findings.filter((f) => f.type === t).length })).filter((x) => x.n > 0),
  };
}
