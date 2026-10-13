/**
 * DCOS — deterministic mock seed.
 *
 * Fifteen exemplar sites, one per facility type that matters for the demo, each
 * populated end to end: plant, halls, racks, devices with ports and cabling, IPAM with
 * real bindings, governance with approval chains, operations, delivery and knowledge.
 * Every enum value appears somewhere; every record carries every field it can
 * honestly hold. Faker is seeded so the dataset is identical across reloads.
 *
 * The seed is split into modules under ./seed/ that run in dependency order and write
 * into one shared context (see ./seed/ctx.ts). `scripts/check-seed-coverage.mts`
 * verifies field fill and enum coverage.
 */
import type { MockDB } from './store';
import { Seed, type SeedProfile, type Snapshot } from './seed/ctx';
import { seedEstate } from './seed/estate';
import { seedDcim } from './seed/dcim';
import { seedNmsInventory } from './seed/nmsInventory';
import { seedIpam } from './seed/ipam';
import { seedGovernance } from './seed/governance';
import { seedCircuits } from './seed/circuits';
import { seedNmsOps } from './seed/nmsOps';
import { seedServices } from './seed/services';
import { seedEdgeLocations } from './seed/locations';
import { seedFleet } from './seed/fleet';
import { seedPlanner } from './seed/planner';
import { seedDelivery } from './seed/delivery';
import { seedKnowledge } from './seed/knowledge';
import { seedWorkflows } from './seed/workflows';

export type { SeedProfile, Snapshot };

export function resolveProfile(): SeedProfile {
  const raw = import.meta.env?.VITE_SEED_SCALE;
  if (raw === 'small' || raw === 'medium' || raw === 'full') return raw;
  return 'small';
}

export function buildSnapshot(profile: SeedProfile = 'small'): Snapshot {
  const S = new Seed(profile);
  seedEstate(S);
  seedEdgeLocations(S);
  seedDcim(S);
  seedNmsInventory(S);
  seedIpam(S);
  seedGovernance(S);
  seedCircuits(S);
  seedNmsOps(S);
  seedServices(S);
  seedDelivery(S);
  seedWorkflows(S);
  seedKnowledge(S);
  seedFleet(S);
  seedPlanner(S);
  return S.snapshot();
}

export function seedDatabase(db: MockDB, profile: SeedProfile = resolveProfile()): void {
  db.hydrate(buildSnapshot(profile));
}

export function exportMockDbSnapshot(): Snapshot {
  return buildSnapshot(resolveProfile());
}
