/**
 * Node-only helpers for scripts (smokes, the import report): read the NeoCloud workbooks from disk
 * synchronously and build the demo + NeoCloud snapshot. Never imported by the app.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSnapshot, type SeedProfile } from '../db/seed';
import type { DcoDataset, ImportReport, Snapshot } from './dcoImport';
import { mergeNeoCloud, type NeoCloudKey } from './neocloud';

export function loadNeoCloudDatasetsSync(): Record<NeoCloudKey, DcoDataset> {
  const read = (key: NeoCloudKey) => JSON.parse(readFileSync(fileURLToPath(new URL(`./neocloud/${key}.json`, import.meta.url)), 'utf8')) as DcoDataset;
  return { us: read('us'), in: read('in') };
}

/** Demo estate + both NeoCloud workbooks, with the import reports and timings. */
export function buildSnapshotWithNeoCloud(profile: SeedProfile = 'small'): { snapshot: Snapshot; reports: ImportReport[]; ms: { demo: number; read: number; merge: number } } {
  const t0 = performance.now();
  const demo = buildSnapshot(profile) as Snapshot;
  const t1 = performance.now();
  const data = loadNeoCloudDatasetsSync();
  const t2 = performance.now();
  const { snapshot, reports } = mergeNeoCloud(demo, data);
  const t3 = performance.now();
  return { snapshot, reports, ms: { demo: Math.round(t1 - t0), read: Math.round(t2 - t1), merge: Math.round(t3 - t2) } };
}
