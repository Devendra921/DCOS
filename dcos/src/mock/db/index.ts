import { MockDB } from './store';
import { buildSnapshot, resolveProfile } from './seed';
import { resolveEstate, type EstateMode } from '../datasets/estateMode';
import { loadNeoCloudDatasets } from '../datasets/neocloudData';
import { resolveEstateScope, type EstateScope } from '../datasets/estateScope';
import { applyEstateScope, scopeOptions, type ScopeOptions } from './estateScope';

/** In-memory mock DB (RAN chassis), seeded with the DCOS topology. */
export const db = new MockDB();

let ready = false;
let initPromise: Promise<void> | null = null;

/** What start-up loaded and how long each step took (ms). */
export interface StartupInfo { estate: EstateMode; scope: EstateScope; scopeMs: number; sites: number; demoMs: number; importMs: number; hydrateMs: number; totalMs: number; records: number; importError?: string }
let startup: StartupInfo | undefined;
export const getStartupInfo = (): StartupInfo | undefined => startup;

/** The personas and countries that exist in the full estate (before the persona / geography scope is applied). */
let options: ScopeOptions = { personas: [], geos: [] };
let activeScope: EstateScope = { persona: 'all', geo: 'all' };
export const getScopeOptions = (): ScopeOptions => options;
/** The persona / geography the store was built for. */
export const getEstateScope = (): EstateScope => activeScope;

export function isMockDbReady(): boolean {
  return ready;
}

/**
 * Build the demo estate, then (unless the estate is set to 'demo') load the NeoCloud workbooks
 * in their own chunks and merge them before hydrating. A failed import leaves the demo estate.
 */
export function ensureMockDbReady(): Promise<void> {
  if (ready) return Promise.resolve();
  if (!initPromise) {
    initPromise = Promise.resolve().then(async () => {
      const estate = resolveEstate();
      const t0 = performance.now();
      // Start fetching the workbook chunks and the importer before the (synchronous) demo build.
      const pending = estate === 'all' ? Promise.all([import('../datasets/neocloud'), loadNeoCloudDatasets()]) : undefined;
      pending?.catch(() => { /* reported below */ });
      let snap = buildSnapshot(resolveProfile());
      const t1 = performance.now();
      let importError: string | undefined;
      if (pending) {
        try {
          const [{ mergeNeoCloud }, data] = await pending;
          snap = mergeNeoCloud(snap, data).snapshot;
        } catch (e) {
          importError = e instanceof Error ? e.message : String(e);
          console.error('[mock-db] NeoCloud import failed; showing the demo estate only', e);
        }
      }
      const t2 = performance.now();
      // Persona and geography: remove what is out of scope once, before the store is filled.
      options = scopeOptions(snap);
      const wanted = resolveEstateScope();
      // A value the data does not have (an unknown country, a persona with no site) shows everything rather than nothing.
      activeScope = {
        persona: wanted.persona === 'all' || options.personas.some((p) => p.id === wanted.persona) ? wanted.persona : 'all',
        geo: wanted.geo === 'all' || options.geos.some((g) => g.id === wanted.geo) ? wanted.geo : 'all',
      };
      const scoped = applyEstateScope(snap, activeScope);
      snap = scoped.snapshot;
      const t2b = performance.now();
      db.hydrate(snap);
      const t3 = performance.now();
      startup = { estate, scope: activeScope, scopeMs: Math.round(t2b - t2), sites: scoped.sites, demoMs: Math.round(t1 - t0), importMs: Math.round(t2 - t1), hydrateMs: Math.round(t3 - t2b), totalMs: Math.round(t3 - t0), records: Object.values(snap).reduce((a, x) => a + x.length, 0), importError };
      ready = true;
    });
  }
  return initPromise;
}

export const dbReady = ensureMockDbReady();

export { MockDB } from './store';
export type { FilterCriteria, QueryOptions, PaginatedResult } from './store';
export { seedDatabase, buildSnapshot, exportMockDbSnapshot, resolveProfile } from './seed';
export type { SeedProfile } from './seed';
export { resolveEstate, setEstate, ESTATE_STORAGE_KEY } from '../datasets/estateMode';
export { setEstateScope, PERSONAS, geoCodeOf, currencySymbolOf } from '../datasets/estateScope';
export type { EstateScope, Persona, PersonaId } from '../datasets/estateScope';
export type { ScopeOptions, ScopeOption } from './estateScope';
export type { EstateMode } from '../datasets/estateMode';
