/* Label of the action that executes an approved plan, in the words of its scope. */
import type * as T from '../../../../mock/data/types';

const REFRESH_SCOPES: T.PlannerScope[] = ['server-refresh', 'network-refresh', 'rack-replace'];

/** A migration with no target site is a decommission; refreshes and replacements are refreshes; everything else is a build. */
export function executeLabel(plan: Pick<T.PlannerPlan, 'scope' | 'peerDataCenterId'>): string {
  if (plan.scope === 'migration') return plan.peerDataCenterId ? 'Start the move' : 'Start the decommission';
  if (REFRESH_SCOPES.includes(plan.scope)) return 'Start the refresh';
  return 'Start the build';
}
