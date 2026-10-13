/**
 * The NeoCloud customer estate (two DCO workbooks: US and India, 24 sites each), loaded on top
 * of the demo estate. The workbooks are extracted to JSON (src/mock/datasets/neocloud/*.json) and
 * loaded lazily, each in its own chunk, so the main bundle does not carry them.
 *
 * Which estate the app shows: localStorage 'dcos.estate' = 'all' (default) | 'demo'; the URL
 * parameter ?estate=demo|all overrides it. Scripts load the demo estate unless DCOS_ESTATE=all.
 */
import { mergeDcoDataset, type DcoDataset, type DcoMergeOptions, type ImportReport, type Snapshot } from './dcoImport';
import type { NeoCloudKey } from './neocloudData';

export { loadNeoCloudDatasets, type NeoCloudKey } from './neocloudData';

export const NEOCLOUD_AS_OF = '2026-10-12';
const COMMON = { operator: 'NeoCloud', asOf: NEOCLOUD_AS_OF } as const;
/** Merge order matters for clashing customer ids: the US workbook is loaded first, India's differing CUST-2073 becomes IN-CUST-2073. */
export const NEOCLOUD_FILES: { key: NeoCloudKey; opts: DcoMergeOptions }[] = [
  { key: 'us', opts: { ...COMMON, source: `NeoCloud US ${NEOCLOUD_AS_OF}`, clashPrefix: 'US-', country: 'United States', countryShort: 'US', currency: 'USD' } },
  { key: 'in', opts: { ...COMMON, source: `NeoCloud India ${NEOCLOUD_AS_OF}`, clashPrefix: 'IN-', country: 'India', countryShort: 'India', currency: 'INR' } },
];

export { resolveEstate, setEstate, ESTATE_STORAGE_KEY, type EstateMode } from './estateMode';

/** Merge both workbooks into a snapshot (US first). */
export function mergeNeoCloud(snapshot: Snapshot, data: Record<NeoCloudKey, DcoDataset>): { snapshot: Snapshot; reports: ImportReport[] } {
  let snap = snapshot;
  const reports: ImportReport[] = [];
  for (const f of NEOCLOUD_FILES) {
    const r = mergeDcoDataset(snap, data[f.key], f.opts);
    snap = r.snapshot; reports.push(r.report);
  }
  return { snapshot: snap, reports };
}
