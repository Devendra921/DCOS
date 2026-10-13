/* Smoke test for the persona / geography scope (src/mock/db/estateScope.ts).
   For every persona and every country (and each pair), the scoped estate keeps exactly the matching sites,
   removes everything those sites owned, leaves no reference pointing at a removed record, and keeps the
   shared reference data that is still used. No scope returns the snapshot unchanged.
   Run: npx tsx scripts/estate-scope-smoke.mts   (exits non-zero when a check fails) */
import { buildSnapshotWithNeoCloud } from '../src/mock/datasets/neocloudNode.ts';
import { applyEstateScope, scopeOptions, type ScopeSnapshot } from '../src/mock/db/estateScope.ts';
import { STRONG_LINKS, WEAK_LINKS } from '../src/mock/db/scopeLinks.ts';
import { geoCodeOf, normalizeGeo, PERSONAS, type EstateScope } from '../src/mock/datasets/estateScope.ts';

let failures = 0; let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) { failures++; if (failures < 60) console.log(`  FAIL ${msg}`); } };

const built = (await (buildSnapshotWithNeoCloud as unknown as () => Promise<{ snapshot?: ScopeSnapshot } & ScopeSnapshot>)());
const base: ScopeSnapshot = (built.snapshot ?? built) as ScopeSnapshot;
const total = (s: ScopeSnapshot) => Object.values(s).reduce((a, r) => a + r.length, 0);
const idsOf = (s: ScopeSnapshot) => { const m = new Map<string, Set<string>>(); for (const [e, rows] of Object.entries(s)) m.set(e, new Set(rows.map((r) => r.id as string))); return m; };
const origIds = idsOf(base);
const asArray = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? [v] : []);
const country = (d: Record<string, unknown>, campus: Map<string, Record<string, unknown>>) => (d.country as string) ?? (campus.get(d.campusId as string)?.country as string);

console.log('# Options and codes');
const opts = scopeOptions(base);
ok(opts.personas.length === 5, `five personas in the data (got ${opts.personas.length})`);
ok(opts.personas.every((p) => PERSONAS.some((x) => x.id === p.id)), 'persona ids match the five known personas');
ok(opts.geos.some((g) => g.id === 'us') && opts.geos.some((g) => g.id === 'in'), 'United States (us) and India (in) are offered');
ok(opts.geos.reduce((a, g) => a + g.count, 0) === base.dataCenters.length, 'every site is in exactly one country');
ok(opts.personas.reduce((a, p) => a + p.count, 0) === base.dataCenters.length, 'every site is in exactly one persona');
ok(normalizeGeo('United States') === 'us' && normalizeGeo('IN') === 'in' && normalizeGeo('all') === 'all' && normalizeGeo('') === undefined, 'geo values accept a code or a country name');
console.log(`  ${opts.personas.map((p) => `${p.id}:${p.count}`).join('  ')}   |   ${opts.geos.map((g) => `${g.id}:${g.count}`).join('  ')}`);

console.log('\n# No scope changes nothing');
const same = applyEstateScope(base, { persona: 'all', geo: 'all' });
ok(same.snapshot === base && same.removed === 0, 'persona all + geo all returns the same snapshot');

const combos: EstateScope[] = [];
for (const persona of ['all', ...PERSONAS.map((p) => p.id)] as EstateScope['persona'][]) for (const geo of ['all', ...opts.geos.map((g) => g.id)]) if (persona !== 'all' || geo !== 'all') combos.push({ persona, geo });

const campusById = new Map((base.campuses ?? []).map((c) => [c.id as string, c]));
const summary: string[] = [];
let tMax = 0;
for (const scope of combos) {
  const snap = structuredClone(base) as ScopeSnapshot;
  const t0 = performance.now();
  const { snapshot: out, removed, sites } = applyEstateScope(snap, scope);
  tMax = Math.max(tMax, performance.now() - t0);
  const name = `${scope.persona}/${scope.geo}`;
  const kept = idsOf(out);

  // 1. exactly the matching sites
  const expect = base.dataCenters.filter((d) => (scope.persona === 'all' || d.businessModel === scope.persona) && (scope.geo === 'all' || geoCodeOf(country(d, campusById)) === scope.geo));
  ok(sites === expect.length && out.dataCenters.length === expect.length, `${name}: ${expect.length} sites kept (got ${sites})`);
  ok(expect.every((d) => kept.get('dataCenters')!.has(d.id as string)), `${name}: every matching site is kept`);
  ok(removed === total(base) - total(out), `${name}: removed count reconciles`);

  // 2. nothing kept points at a removed record (strong: owned; weak: cleared)
  for (const [from, field, to] of [...STRONG_LINKS, ...WEAK_LINKS]) {
    const toKept = kept.get(to); const toOrig = origIds.get(to);
    if (!toKept || !toOrig) continue;
    let bad = 0;
    for (const r of out[from] ?? []) for (const v of asArray(r[field])) if (toOrig.has(v) && !toKept.has(v)) bad++;
    ok(bad === 0, `${name}: ${from}.${field} → ${to} has ${bad} reference(s) to removed records`);
  }

  // 3. nothing owned by a removed site is left
  for (const [from, field, to] of STRONG_LINKS) {
    if (to !== 'dataCenters') continue;
    const bad = (out[from] ?? []).filter((r) => asArray(r[field]).some((v) => origIds.get('dataCenters')!.has(v) && !kept.get('dataCenters')!.has(v))).length;
    ok(bad === 0, `${name}: ${from}.${field} leaves ${bad} record(s) of a removed site`);
  }

  // 4. reference data follows
  const usedCampus = new Set([...out.dataCenters.map((d) => d.campusId as string), ...(out.edgeLocations ?? []).map((e) => e.campusId as string)]);
  ok((out.campuses ?? []).every((c) => usedCampus.has(c.id as string) || (scope.persona === 'all' && scope.geo !== 'all')), `${name}: every kept campus is used`);
  const usedCust = new Set<string>();
  for (const s of out.services ?? []) if (s.customerRef) usedCust.add(s.customerRef as string);
  for (const r of out.racks ?? []) if (r.tenantCustomerId) usedCust.add(r.tenantCustomerId as string);
  for (const d of out.devices ?? []) if (d.tenantCustomerId) usedCust.add(d.tenantCustomerId as string);
  const hadCust = new Set<string>();
  for (const s of base.services ?? []) if (s.customerRef) hadCust.add(s.customerRef as string);
  for (const r of base.racks ?? []) if (r.tenantCustomerId) hadCust.add(r.tenantCustomerId as string);
  for (const d of base.devices ?? []) if (d.tenantCustomerId) hadCust.add(d.tenantCustomerId as string);
  ok((out.customers ?? []).every((c) => !hadCust.has(c.id as string) || usedCust.has(c.id as string)), `${name}: no customer left without a service or tenancy`);
  const geoOnly = (out.edgeLocations ?? []).every((e) => (scope.persona === 'all' || scope.persona === 'network') && (scope.geo === 'all' || geoCodeOf(e.country as string) === scope.geo));
  ok(geoOnly, `${name}: locations follow the persona (network) and the country`);
  summary.push(`${name.padEnd(22)} sites ${String(sites).padStart(2)}  records ${String(total(out)).padStart(6)}  racks ${String((out.racks ?? []).length).padStart(5)}  devices ${String((out.devices ?? []).length).padStart(5)}  customers ${String((out.customers ?? []).length).padStart(2)}  campuses ${String((out.campuses ?? []).length).padStart(2)}`);
}

console.log(`\n# Scoped estates (${combos.length})`);
for (const l of summary.filter((_, i) => i % 1 === 0).slice(0, 14)) console.log('  ' + l);
console.log(`  … slowest scope took ${Math.round(tMax)} ms`);

console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
