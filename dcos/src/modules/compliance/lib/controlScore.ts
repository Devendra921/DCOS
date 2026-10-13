import type { ComplianceControl, Policy, PolicyDecision } from '../../../mock/data/types';
import type { ControlStatus } from '../../../mock/data/enums';

/** Active policies that claim to satisfy a control (by control ref). */
export function backingPolicies(ctrl: ComplianceControl, policies: Policy[]): Policy[] {
  return policies.filter((p) => p.active && (p.controlRefs ?? []).includes(ctrl.ref));
}

/**
 * The honest control status:
 *  - Manual controls keep their attested status.
 *  - Automated controls derive from their backing policy's OPA decisions:
 *      no backing active policy → NotAssessed (untagged gap)
 *      policy linked but never evaluated → InProgress
 *      any violation in its decisions → NonCompliant
 *      decisions exist and all clean → Compliant
 */
export function deriveControlStatus(
  ctrl: ComplianceControl,
  policies: Policy[],
  decisions: PolicyDecision[],
): ControlStatus {
  if (ctrl.type === 'Manual') return ctrl.status;
  const pols = backingPolicies(ctrl, policies);
  if (pols.length === 0) return 'NotAssessed';
  const ids = new Set(pols.map((p) => p.id));
  const decs = decisions.filter((d) => ids.has(d.policyId));
  if (decs.length === 0) return 'InProgress';
  return decs.some((d) => d.violated) ? 'NonCompliant' : 'Compliant';
}
