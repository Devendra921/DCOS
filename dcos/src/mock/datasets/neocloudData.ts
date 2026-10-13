/**
 * Loads the two NeoCloud workbooks (extracted JSON). Kept tiny and free of the importer so start-up
 * can begin fetching the data chunks before it builds the demo estate.
 *
 * Under Vite each JSON file is its own lazy chunk (import.meta.glob); under tsx (scripts) the files
 * are read from disk.
 */
import type { DcoDataset } from './dcoImport';

export type NeoCloudKey = 'us' | 'in';

export async function loadNeoCloudDatasets(): Promise<Record<NeoCloudKey, DcoDataset>> {
  let loaders: Record<string, () => Promise<DcoDataset>> | undefined;
  try {
    loaders = import.meta.glob<DcoDataset>('./neocloud/*.json', { import: 'default' });
  } catch { loaders = undefined; /* not running under Vite */ }
  const viaVite = (key: NeoCloudKey) => loaders?.[`./neocloud/${key}.json`];
  if (viaVite('us') && viaVite('in')) {
    const [us, inn] = await Promise.all([viaVite('us')!(), viaVite('in')!()]);
    return { us, in: inn };
  }
  // Node: read from disk (the specifier is a variable so the bundler leaves it alone).
  const fsSpec = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsSpec)) as { readFileSync: (p: URL, enc: 'utf8') => string };
  const read = (key: NeoCloudKey) => { const rel = './neocloud/' + key + '.json'; return JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as DcoDataset; };
  return { us: read('us'), in: read('in') };
}
