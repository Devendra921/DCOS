/**
 * Role-Based Perspective Architecture — public surface.
 *
 *   import { usePerspective, useCan, RoleGate, CAP } from '@/core/perspective';
 */
export { PerspectiveProvider, usePerspective, useCan } from './PerspectiveContext';
export { RoleGate } from './RoleGate';
export type { RoleGateProps } from './RoleGate';
export { PerspectiveSwitcher } from './PerspectiveSwitcher';
export { adaptMenu } from './navigation';
export {
  DENSITY_RANK,
  densityMeets,
  useDensityAtLeast,
  useDensityColumns,
} from './density';
export type { WithDensity } from './density';
export { CAP } from './capabilities';
export type { CapabilityKey } from './capabilities';
export {
  PERSPECTIVES,
  ALL_PERSPECTIVES,
  ROLE_TO_PERSPECTIVE,
  perspectiveForRole,
} from './perspectives';
export type {
  Perspective,
  Tier,
  Authority,
  Density,
  NavScope,
  AiMode,
  QuickAction,
} from './types';
