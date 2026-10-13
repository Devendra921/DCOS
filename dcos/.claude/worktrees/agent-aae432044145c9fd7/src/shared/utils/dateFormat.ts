/**
 * dateFormat — single source of truth for date display across DCOS.
 *
 * Canonical format: DD-MMM-YY (e.g. 04-Jun-26).
 *
 * Use these helpers everywhere instead of ad-hoc dayjs/toLocaleDateString
 * calls so dates render consistently across modules. Inputs can be:
 *   - Date object
 *   - ISO string ('2026-06-04')
 *   - dd-Mmm-yyyy or dd Mmm, yyyy strings (legacy seed data)
 *   - dayjs object (best-effort — only the .format method is invoked)
 *
 * Returns `'—'` for null / undefined / unparseable inputs so callers can
 * dump the result straight into a UI cell without conditional rendering.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_INDEX: Record<string, number> = MONTHS.reduce(
  (acc, m, i) => ({ ...acc, [m.toLowerCase()]: i }),
  {} as Record<string, number>,
);

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toDateLike(input: unknown): Date | null {
  if (input == null || input === '') return null;

  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

  // dayjs duck-type — has .toDate()
  if (typeof input === 'object' && typeof (input as { toDate?: () => Date }).toDate === 'function') {
    const d = (input as { toDate: () => Date }).toDate();
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof input !== 'string') return null;

  const s = input.trim();
  if (!s) return null;

  // ISO yyyy-mm-dd or yyyy-mm-ddThh:mm:ss
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(date.getTime()) ? null : date;
  }

  // dd-Mmm-yyyy or dd-Mmm-yy
  const dmy = s.match(/^(\d{1,2})[-\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[,\-\s]+(\d{2}|\d{4})$/i);
  if (dmy) {
    const [, d, mon, y] = dmy;
    const yearRaw = Number(y);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const month = MONTH_INDEX[mon.toLowerCase()];
    if (month != null) {
      const date = new Date(year, month, Number(d));
      return isNaN(date.getTime()) ? null : date;
    }
  }

  // Fallback to native parser (handles 'Apr 4, 2026' etc.)
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Canonical app-wide date display. Returns `DD-MMM-YY` (e.g. `04-Jun-26`)
 * or `'—'` if the input cannot be parsed.
 */
export function formatDate(input: unknown): string {
  const d = toDateLike(input);
  if (!d) return '—';
  return `${pad2(d.getDate())}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

/**
 * Month / year only (e.g. `Jun-26`). Useful for column headers and budget
 * period chips.
 */
export function formatMonthYear(input: unknown): string {
  const d = toDateLike(input);
  if (!d) return '—';
  return `${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

/** dayjs format token equivalent — pass through `dayjs.format(DATE_FMT)`. */
export const DATE_FMT = 'DD-MMM-YY';

/** dayjs format token for month-year columns. */
export const MONTH_YEAR_FMT = 'MMM-YY';
