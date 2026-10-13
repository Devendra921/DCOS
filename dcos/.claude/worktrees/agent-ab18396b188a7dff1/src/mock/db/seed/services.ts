/**
 * Seed · customers, services and capacity plans.
 *
 * A service is what a customer buys and what an incident ultimately hurts: a circuit on a
 * core router, a cabinet lease in a colocation hall, a workload on a host, an application on
 * a cluster. Every service carries the device path and cables it depends on so the Operate
 * module can walk from a fault to the customers it touches. Service families follow the site
 * type (telco, colocation, cloud, enterprise), and customers are a global portfolio spread
 * over the campuses.
 */
import { PEOPLE, type Seed } from './ctx';
import * as T from '../../data/types';

type Family = 'telco' | 'colo' | 'cloud' | 'enterprise';
const TELCO = new Set(['central-office', 'aggregation-pop', 'network-pop', 'regional-edge-dc', 'mtso', 'national-core-nfvi', 'ixp', 'carrier-hotel']);
const COLO = new Set(['retail-colo', 'wholesale-colo']);
const CLOUD = new Set(['hyperscale-dc', 'hyperscale-campus', 'ai-gpu-factory', 'modular-pod']);
export const familyOf = (key?: string | null): Family => (key && TELCO.has(key) ? 'telco' : key && COLO.has(key) ? 'colo' : key && CLOUD.has(key) ? 'cloud' : 'enterprise');

/* [name, segment, plan, premium] */
const CUSTOMERS: [string, string, string, boolean][] = [
  ['Acme Financial', 'BFSI', 'Enterprise · 2N', true], ['Northwind Payments', 'BFSI', 'Enterprise · 2N', true], ['Helios Cloud', 'Hyperscaler', 'Private cage', true],
  ['Orbit SaaS', 'SaaS', 'Business', true], ['Meridian Health', 'Healthcare', 'Enterprise', true], ['Atlas Logistics', 'Logistics', 'Business', false],
  ['Vega Media', 'Media', 'Business', false], ['Pioneer Retail', 'Retail', 'Business', false], ['Quanta AI Labs', 'AI / ML', 'Enterprise', true],
  ['Summit Gaming', 'Gaming', 'Developer', false], ['Civic Digital', 'Government', 'Enterprise', true], ['Lumen Carrier', 'Carrier', 'MMR cabinets', true],
  ['Regional ISP Co', 'Carrier', 'MMR cabinets', false], ['Harbor Insurance', 'BFSI', 'Enterprise', true], ['Brightline Pharma', 'Manufacturing', 'Business', false],
  ['Keystone Auto', 'Manufacturing', 'Business', false], ['Evergreen University', 'Education', 'Developer', false], ['Skyline Hotels', 'Hospitality', 'Business', false],
  ['Delta Broadcast', 'Media', 'Business', true], ['Polar Analytics', 'SaaS', 'Developer', false], ['Nimbus Exchange', 'Carrier', 'Peering', true],
  ['Granite Mining', 'Energy', 'Business', false], ['Aster Diagnostics', 'Healthcare', 'Business', false], ['Metro Transit', 'Government', 'Enterprise', true],
];

interface SvcType { type: string; unit: string; qty: number[]; rate: number }
const TYPES: Record<Family, SvcType[]> = {
  telco: [
    { type: 'L3VPN', unit: 'Mbps', qty: [100, 500, 1000, 2000, 10000], rate: 1.6 }, { type: 'Leased Line', unit: 'Mbps', qty: [1000, 10000, 10000, 100000], rate: 0.9 },
    { type: 'L2VPN', unit: 'Mbps', qty: [500, 1000, 2000, 10000], rate: 1.2 }, { type: 'IRV', unit: 'Mbps', qty: [1000, 2000, 10000], rate: 0.7 }, { type: 'Other', unit: 'Mbps', qty: [100, 500], rate: 2.0 },
  ],
  colo: [
    { type: 'Cabinet lease', unit: 'cabinets', qty: [1, 1, 2, 2, 4, 6], rate: 1400 }, { type: 'Power circuit', unit: 'kW', qty: [4, 6, 8, 8, 12, 20], rate: 210 },
    { type: 'Cross-connect', unit: 'Mbps', qty: [1000, 10000, 10000, 100000], rate: 0.3 }, { type: 'Remote hands', unit: 'hours', qty: [10, 20, 40], rate: 120 },
  ],
  cloud: [
    { type: 'VM', unit: 'vCPU', qty: [8, 16, 16, 32, 64, 128], rate: 38 }, { type: 'Kubernetes', unit: 'vCPU', qty: [64, 128, 256], rate: 34 },
    { type: 'GPU cluster', unit: 'GPU', qty: [8, 16, 32, 64], rate: 2100 }, { type: 'Storage volume', unit: 'TB', qty: [10, 50, 100, 500], rate: 24 }, { type: 'Managed DB', unit: 'vCPU', qty: [8, 16, 32], rate: 60 },
  ],
  enterprise: [
    { type: 'Core application', unit: 'users', qty: [200, 500, 1000, 5000], rate: 4 }, { type: 'Database', unit: 'vCPU', qty: [16, 32, 64], rate: 55 },
    { type: 'Collaboration', unit: 'users', qty: [500, 1000, 5000], rate: 2.5 }, { type: 'Analytics', unit: 'vCPU', qty: [32, 64, 128], rate: 30 }, { type: 'Backup & DR', unit: 'TB', qty: [20, 100, 500], rate: 14 },
  ],
};

export function seedServices(S: Seed): void {
  const roleName = new Map(S.deviceRoles.map((r) => [r.id, r.name]));
  const managed = new Map(S.managedDevices.map((m) => [m.id, m]));
  const ifByDev = new Map<string, T.Interface[]>();
  for (const f of S.interfaces) { const a = ifByDev.get(f.deviceId) ?? []; a.push(f); ifByDev.set(f.deviceId, a); }
  const cablesByDev = new Map<string, T.Cable[]>();
  for (const c of S.cables) { for (const d of [c.aDeviceId, c.bDeviceId]) { const a = cablesByDev.get(d) ?? []; a.push(c); cablesByDev.set(d, a); } }
  const activeCrit = new Set(S.alarms.filter((a) => a.state === 'Active' && (a.severity === 'Critical' || a.severity === 'Major')).map((a) => a.deviceId));

  // ── customers: a global portfolio, each anchored to a campus ──
  CUSTOMERS.forEach(([name, segment, plan, premium], i) => {
    const campus = S.cycle(S.campuses, i * 5 + 1);
    const id = S.nid('CUST');
    S.customers.push({ id, custId: id, ...S.meta(S.byRole('Program Manager')), name, segment, city: campus.city, state: campus.country, plan, premium, accountManager: S.cycle(PEOPLE.filter((p) => p.role !== 'Administrator' && p.role !== 'Field Technician'), i * 2 + 1).name, revenueMonthly: 0, notes: premium ? 'Premium support tier — named account manager' : undefined });
  });

  // ── services per site, by family ──
  S.dataCenters.forEach((dc, di) => {
    if (dc.status === 'Planned' || dc.status === 'Retired') return;
    const fam = familyOf(dc.dcTypeKey);
    const devs = S.devices.filter((d) => d.dataCenterId === dc.id && d.status !== 'Inactive' && d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed');
    const isNet = (d: T.Device) => ['Core Router', 'Spine', 'Leaf/ToR'].includes(roleName.get(d.deviceRoleId ?? '') ?? '');
    const hosts = fam === 'telco' ? devs.filter((d) => ['Core Router', 'Spine'].includes(roleName.get(d.deviceRoleId ?? '') ?? ''))
      : fam === 'cloud' ? devs.filter((d) => ['Server', 'GPU-Node', 'Storage'].includes(d.category ?? ''))
      : fam === 'enterprise' ? devs.filter((d) => d.category === 'Server' || d.category === 'Storage')
      : devs.filter((d) => ['Server', 'Storage', 'Switch'].includes(d.category ?? '') && !isNet(d));
    if (!hosts.length) return;
    const racks = S.racks.filter((r) => r.dataCenterId === dc.id && r.status !== 'Planned' && r.status !== 'Retired');
    const n = fam === 'telco' ? Math.min(36, Math.max(8, hosts.length * 6)) : fam === 'colo' ? Math.min(32, Math.max(8, Math.round(racks.length / 3))) : Math.min(28, Math.max(6, Math.round(hosts.length / (fam === 'cloud' ? 6 : 4))));
    const custPool = S.customers.filter((_, ci) => (ci + di) % 3 !== 2 || fam === 'colo');
    for (let i = 0; i < n; i++) {
      const host = S.cycle(hosts, i * 7 + di);
      const cust = S.cycle(custPool, i * 5 + di * 3);
      const t = S.cycle(TYPES[fam], i + di);
      const md = managed.get(host.id);
      const ifaces = ifByDev.get(host.id) ?? [];
      const iface = ifaces.length ? S.cycle(ifaces, i * 3) : undefined;
      const cables = (cablesByDev.get(host.id) ?? []).slice(0, 2);
      const otherEnds = cables.map((c) => (c.aDeviceId === host.id ? c.bDeviceId : c.aDeviceId));
      const util = iface ? Math.max(5, Math.min(99, iface.utilizationPct + S.int(-10, 10))) : S.int(15, 92);
      const rack = fam === 'colo' ? (host.rackId ? S.racks.find((r) => r.id === host.rackId) : S.cycle(racks, i)) : undefined;
      const status: T.ServiceStatus = md?.reachability === 'Unreachable' ? 'Down' : activeCrit.has(host.id) || util >= 90 ? 'Degraded' : (i + di) % 17 === 16 ? 'Disabled' : 'Active';
      const qty = S.cycle(t.qty, i * 2 + di);
      const id = S.nid('SVC');
      const premium = cust.premium;
      const revenue = Math.round(qty * t.rate * (premium ? 1.25 : 1));
      S.services.push({
        id, svcId: id, ...S.meta(S.byRole('Network Engineer')), name: `${t.type} · ${cust.name}`, type: t.type, customerRef: cust.id, dataCenterId: dc.id,
        deviceId: host.id, ifName: fam === 'colo' ? (rack ? `${rack.name} · ${S.cycle(['circuit A', 'circuit B', 'XC panel 3'], i)}` : undefined) : iface?.name, rackId: rack?.id ?? host.rackId,
        pathDeviceIds: [host.id, ...otherEnds], cableIds: cables.map((c) => c.id), bandwidthMbps: t.unit === 'Mbps' ? qty : S.cycle([1000, 10000, 25000], i), utilPct: util, status,
        slaTarget: premium ? (fam === 'colo' ? 99.999 : 99.99) : fam === 'colo' ? 99.99 : 99.9, uptime30d: status === 'Down' ? S.r1(97 + S.int(0, 20) / 10) : status === 'Degraded' ? S.r1(99.5 + S.int(0, 4) / 10) : S.r1(99.9 + S.int(0, 1) / 10),
        growthPct: S.r1(S.int(0, 60) / 10), revenueMonthly: revenue, critical: premium && i % 2 === 0, qty, unit: t.unit,
        notes: status === 'Disabled' ? 'Suspended at customer request' : premium ? 'Premium SLA with credits' : undefined,
      });
    }
  });
  for (const c of S.customers) c.revenueMonthly = S.services.filter((s) => s.customerRef === c.id).reduce((a, s) => a + s.revenueMonthly, 0);

  // ── capacity plans: one per dimension, spread over the live estate ──
  const live = S.dataCenters.filter((d) => d.status === 'Operational');
  const PLANS: [T.CapacityPlanRec['dimension'], string, number, string, T.CapacityPlanRec['status'], number][] = [
    ['Bandwidth', 'Upgrade core uplinks to 100G', 90, 'Gbps', 'Submitted', 380000],
    ['Power', 'Add 2 × 200 kVA UPS modules, Hall 1', 320, 'kW', 'Approved', 1450000],
    ['Cooling', 'Add CRAH-19/20 for Hall 2 densification', 180, 'kW', 'Executing', 920000],
    ['Space', 'Open 8 racks in the equipment room', 336, 'U', 'Submitted', 410000],
    ['Ports', 'Add 2 leaf switches (96 × 25G)', 96, 'ports', 'Approved', 280000],
    ['Power', 'Liquid-cooled GPU row, 2N feeds', 600, 'kW', 'Delivered', 3600000],
  ];
  PLANS.forEach(([dimension, title, amount, unit, status, capex], i) => {
    const dc = S.cycle(live, i * 2);
    const id = S.nid('CPLAN');
    S.capacityPlans.push({ id, cpId: id, ...S.meta(S.byRole('Capacity Planner')), dataCenterId: dc.id, dimension, title, amount, unit, targetDate: S.daysAhead(30 + i * 20), status, capex });
  });
}
