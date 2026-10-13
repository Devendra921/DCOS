/**
 * RoleGate — declarative component visibility.
 * See role-perspective-architecture.md §10.
 *
 *   <RoleGate capability="view.commercial"><CapexPanel /></RoleGate>
 *   <RoleGate minAuthority="approve"><ApproveButton /></RoleGate>
 *   <RoleGate tier="strategic" fallback={<OpsBand />}><ExecBand /></RoleGate>
 *
 * Never write `if (user.roleName === 'X')` — always gate through here so the
 * rule stays in one place and migrates with the perspective engine.
 */
import React from 'react';
import { usePerspective } from './PerspectiveContext';
import { densityMeets } from './density';
import type { Authority, Tier, Density } from './types';

export interface RoleGateProps {
  /** Require this capability key. */
  capability?: string;
  /** Require at least this authority band. */
  minAuthority?: Authority;
  /** Require the active perspective to be one of these tiers. */
  tier?: Tier | Tier[];
  /** Require at least this UI density (comfortable < standard < expert). */
  minDensity?: Density;
  /** Rendered when the gate is closed (default: nothing). */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const RoleGate: React.FC<RoleGateProps> = ({
  capability,
  minAuthority,
  tier,
  minDensity,
  fallback = null,
  children,
}) => {
  const { perspective, can, hasAuthority } = usePerspective();

  let open = true;
  if (capability && !can(capability)) open = false;
  if (minAuthority && !hasAuthority(minAuthority)) open = false;
  if (tier) {
    const tiers = Array.isArray(tier) ? tier : [tier];
    if (!tiers.includes(perspective.tier)) open = false;
  }
  if (minDensity && !densityMeets(perspective.density, minDensity)) open = false;

  return <>{open ? children : fallback}</>;
}
