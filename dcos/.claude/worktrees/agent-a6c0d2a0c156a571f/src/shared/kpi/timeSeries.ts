/**
 * timeSeries.ts — Time bucketing helpers for KPI trend computation.
 *
 * Replace all Math.sin() sparklines and fake trend arrays with honest
 * historical bucketing of real mock entity data.
 */

// ─── Helpers ─────────────────────────────────────────────────────────

/** Parse a date value that may be a string, Date, null, or undefined. */
function toMs(d: string | Date | null | undefined): number | null {
  if (d == null) return null;
  const ts = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(ts) ? ts : null;
}

// ─── bucketCount ─────────────────────────────────────────────────────

/**
 * Bucket records into N time windows (newest last).
 * Returns an array of counts per window.
 *
 * @param records   - array of any objects with a date field
 * @param getDate   - extractor: returns ISO string, Date, or null/undefined
 * @param buckets   - how many time windows to produce (e.g. 12 for 12 weeks)
 * @param bucketDays - width of each window in days (default 7 = weekly)
 * @param endDate   - end of the last window (default: today)
 */
export function bucketCount<T>(
  records: T[],
  getDate: (r: T) => string | Date | null | undefined,
  buckets: number,
  bucketDays = 7,
  endDate = new Date(),
): number[] {
  const endMs = endDate.getTime();
  const windowMs = bucketDays * 86_400_000;
  const startMs = endMs - buckets * windowMs;

  const counts = new Array<number>(buckets).fill(0);

  for (const record of records) {
    const ts = toMs(getDate(record));
    if (ts == null || ts < startMs || ts >= endMs) continue;
    const idx = Math.min(buckets - 1, Math.floor((ts - startMs) / windowMs));
    counts[idx] += 1;
  }

  return counts;
}

// ─── bucketSum ───────────────────────────────────────────────────────

/**
 * Bucket records and sum a numeric field per window.
 *
 * @param records    - array of objects with a date and numeric value
 * @param getDate    - extractor for the date field
 * @param getValue   - extractor for the numeric value to sum
 * @param buckets    - number of time windows
 * @param bucketDays - width of each window in days (default 7 = weekly)
 * @param endDate    - end of the last window (default: today)
 */
export function bucketSum<T>(
  records: T[],
  getDate: (r: T) => string | Date | null | undefined,
  getValue: (r: T) => number,
  buckets: number,
  bucketDays = 7,
  endDate = new Date(),
): number[] {
  const endMs = endDate.getTime();
  const windowMs = bucketDays * 86_400_000;
  const startMs = endMs - buckets * windowMs;

  const sums = new Array<number>(buckets).fill(0);

  for (const record of records) {
    const ts = toMs(getDate(record));
    if (ts == null || ts < startMs || ts >= endMs) continue;
    const idx = Math.min(buckets - 1, Math.floor((ts - startMs) / windowMs));
    sums[idx] += getValue(record) ?? 0;
  }

  return sums;
}

// ─── cumulativeCount ─────────────────────────────────────────────────

/**
 * Build a cumulative count series (S-curve style).
 * Each element is the running total of records up to that bucket.
 *
 * @param records    - array of objects with a date field
 * @param getDate    - extractor for the date
 * @param buckets    - number of time windows
 * @param bucketDays - width of each window in days (default 7 = weekly)
 * @param endDate    - end of the last window (default: today)
 */
export function cumulativeCount<T>(
  records: T[],
  getDate: (r: T) => string | Date | null | undefined,
  buckets: number,
  bucketDays = 7,
  endDate = new Date(),
): number[] {
  const incremental = bucketCount(records, getDate, buckets, bucketDays, endDate);

  const cumulative = new Array<number>(buckets).fill(0);
  let running = 0;
  for (let i = 0; i < buckets; i++) {
    running += incremental[i];
    cumulative[i] = running;
  }

  return cumulative;
}
