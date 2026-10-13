/* Sources every seeded plan's bill of materials against site capacity, stock and vendors. Run: npx tsx scripts/planner-sourcing-smoke.mts */
import { buildSnapshot } from '../src/mock/db/seed';
import { evaluate } from '../src/modules/planner/lib/engine';
import { buildBom } from '../src/modules/planner/lib/outputs';
import { sourceBom } from '../src/modules/planner/lib/sourcing';
const s = buildSnapshot('small') as any;
const ctx = { devices: s.devices, vendors: s.vendors, contracts: s.contracts, assetModels: s.assetModels, racks: s.racks, upsUnits: s.upsUnits, coolingZones: s.coolingZones, dataCenters: s.dataCenters };
const M = (n: number) => `$${(n / 1e6).toFixed(2)}M`;
for (const p of s.plannerPlans) {
  const ev = evaluate(p, null, s.plannerTemplates, s.plannerBenchmarks);
  const sb = sourceBom(p, ev, buildBom(p, ev, s.plannerBenchmarks), ctx);
  console.log(`${p.plnId} ${p.scope.padEnd(15)} total ${M(sb.total)} site ${M(sb.siteValue)} stock ${M(sb.stockValue)} buy ${M(sb.buyTotal)} | capex ${M(ev.estimate.capexTotal)} | ${sb.vendors.map(v => `${v.vendorName.split(' ')[0]} ${M(v.value)}${v.contractId ? '' : ' (no contract)'}`).join(', ')}${sb.warnings.length ? ' | ⚠ ' + sb.warnings.slice(0, 2).join('; ') : ''}`);
  if (['server-refresh', 'network-refresh', 'rack-replace', 'rack', 'pod'].includes(p.scope)) for (const l of sb.lines) console.log(`    ${l.item.padEnd(22)} ${String(l.qty).padStart(4)} ${l.unit.padEnd(6)} site ${l.fromSite} stock ${l.fromStock} buy ${l.toBuy}  ${l.model ?? ''}`);
}
