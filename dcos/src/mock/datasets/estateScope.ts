/**
 * Persona and geography: which part of the estate the app shows.
 *
 *   persona  the kind of data center business: network / colocation / cloud / enterprise / neocloud,
 *            matched against each site's `businessModel`. 'all' shows every persona.
 *   geo      a country, matched against each site's `country`. 'all' shows every country.
 *
 * Browser: URL ?persona=neocloud&geo=us wins and is remembered; then localStorage ('dcos.persona',
 * 'dcos.geo'); default 'all'. Node scripts: DCOS_PERSONA / DCOS_GEO (default 'all').
 * Kept apart from the importer so the main bundle does not carry it.
 */
export type PersonaId = 'network' | 'colocation' | 'cloud' | 'enterprise' | 'neocloud';
export type Persona = PersonaId | 'all';

export interface PersonaInfo { id: PersonaId; label: string; short: string; tagline: string }
export const PERSONAS: readonly PersonaInfo[] = [
  { id: 'network', label: 'Network / Telco DC', short: 'Telco', tagline: 'Connectivity services — routers, switches and DWDM; customers buy circuits' },
  { id: 'colocation', label: 'Colocation DC', short: 'Colo', tagline: 'Space, power and interconnection — tenants own the gear in the cabinets' },
  { id: 'cloud', label: 'Cloud DC', short: 'Cloud', tagline: 'Compute and storage at scale — thousands of hosts; accounts run instances' },
  { id: 'enterprise', label: 'Enterprise / Private DC', short: 'Enterprise', tagline: 'Runs the firm’s own applications — business units are the customers' },
  { id: 'neocloud', label: 'NeoCloud / GPU cloud', short: 'NeoCloud', tagline: 'Rents GPU capacity — reserved clusters and on-demand GPUs for AI teams' },
];

export interface EstateScope { persona: Persona; geo: string }
export const ALL_SCOPE: EstateScope = { persona: 'all', geo: 'all' };

export const PERSONA_STORAGE_KEY = 'dcos.persona';
export const GEO_STORAGE_KEY = 'dcos.geo';

const COUNTRY_CODES: Record<string, string> = {
  India: 'in', 'United States': 'us', Germany: 'de', Ireland: 'ie', Singapore: 'sg', Australia: 'au', Brazil: 'br',
  'United Kingdom': 'gb', France: 'fr', Japan: 'jp', Canada: 'ca', Netherlands: 'nl', 'South Africa': 'za', 'United Arab Emirates': 'ae',
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Short code for a country ('United States' → 'us'), the value used in ?geo= . */
export const geoCodeOf = (country: string | undefined): string => (country ? (COUNTRY_CODES[country] ?? slug(country)) : '');

/** Accepts a code ('us'), a country name ('United States') or a slug; returns the lower-case code. */
export function normalizeGeo(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const t = v.trim();
  if (t.toLowerCase() === 'all') return 'all';
  const byName = Object.keys(COUNTRY_CODES).find((n) => n.toLowerCase() === t.toLowerCase());
  return byName ? COUNTRY_CODES[byName] : slug(t) || undefined;
}

export const isPersona = (v: unknown): v is Persona => v === 'all' || PERSONAS.some((p) => p.id === v);
const normalizePersona = (v: unknown): Persona | undefined => (typeof v === 'string' && isPersona(v.trim().toLowerCase()) ? (v.trim().toLowerCase() as Persona) : undefined);

/** Browser: ?persona= / ?geo= (remembered), then localStorage. Node scripts: DCOS_PERSONA / DCOS_GEO. Default: everything. */
export function resolveEstateScope(): EstateScope {
  if (typeof window !== 'undefined') {
    let persona: Persona = 'all';
    let geo = 'all';
    try {
      const sp = new URLSearchParams(window.location.search);
      const qp = normalizePersona(sp.get('persona'));
      const qg = normalizeGeo(sp.get('geo'));
      const sp2 = window.localStorage.getItem(PERSONA_STORAGE_KEY);
      const sg2 = window.localStorage.getItem(GEO_STORAGE_KEY);
      persona = qp ?? normalizePersona(sp2) ?? 'all';
      geo = qg ?? normalizeGeo(sg2) ?? 'all';
      if (qp) window.localStorage.setItem(PERSONA_STORAGE_KEY, qp);
      if (qg) window.localStorage.setItem(GEO_STORAGE_KEY, qg);
    } catch { /* storage blocked: keep what the URL gave */ }
    return { persona, geo };
  }
  const env = typeof process !== 'undefined' ? process.env : undefined;
  return { persona: normalizePersona(env?.DCOS_PERSONA) ?? 'all', geo: normalizeGeo(env?.DCOS_GEO) ?? 'all' };
}

/** Remember the choice and reload, so the store is rebuilt for it (the URL parameters are dropped: the choice is stored). */
export function setEstateScope(scope: EstateScope): void {
  try {
    window.localStorage.setItem(PERSONA_STORAGE_KEY, scope.persona);
    window.localStorage.setItem(GEO_STORAGE_KEY, scope.geo);
  } catch { /* storage blocked */ }
  const url = new URL(window.location.href);
  url.searchParams.delete('persona');
  url.searchParams.delete('geo');
  window.location.replace(url.toString());
}

const GEO_CURRENCY: Record<string, string> = { us: 'USD', in: 'INR', de: 'EUR', ie: 'EUR', fr: 'EUR', nl: 'EUR', sg: 'SGD', au: 'AUD', br: 'BRL', gb: 'GBP', jp: 'JPY', ca: 'CAD', za: 'ZAR', ae: 'AED' };
/** The currency symbol a country trades in ('us' → '$', 'in' → '₹'); empty when unknown. */
export function currencySymbolOf(geo: string): string {
  const code = GEO_CURRENCY[geo];
  if (!code) return '';
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code; } catch { return code; }
}
