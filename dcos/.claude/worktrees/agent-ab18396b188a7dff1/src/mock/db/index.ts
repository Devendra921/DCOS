import { MockDB } from './store';
import { seedDatabase } from './seed';

/** In-memory mock DB (RAN chassis), seeded with the DCOS topology. */
export const db = new MockDB();

let ready = false;
let initPromise: Promise<void> | null = null;

export function isMockDbReady(): boolean {
  return ready;
}

export function ensureMockDbReady(): Promise<void> {
  if (ready) return Promise.resolve();
  if (!initPromise) {
    initPromise = Promise.resolve().then(() => {
      seedDatabase(db);
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
