/**
 * NMS — configuration model: running vs golden, drift and compliance.
 *
 * Real NMS stores a captured running-config per device and compares it to an
 * approved "golden" baseline; the delta is drift, and a set of hardening checks
 * is compliance. We synthesise both deterministically per device id (stable
 * across renders) and emit a *unified diff* directly during generation — so the
 * diff is exact, not the result of a fragile blob-diff. Pure functions.
 */
import type { ManagedDevice, Interface } from '../../../mock/data/types';

export type DiffTag = 'ctx' | 'add' | 'del';
export interface DiffLine { tag: DiffTag; text: string; }
export interface ComplianceCheck { name: string; pass: boolean; }
export interface DeviceConfig {
  golden: string; running: string; unified: DiffLine[];
  driftCount: number; drift: boolean;
  checks: ComplianceCheck[]; compliancePct: number;
}

function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { return function () { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Build the running/golden pair + unified diff + compliance for one device. */
export function buildDeviceConfig(device: ManagedDevice, ifaces: Interface[]): DeviceConfig {
  const U: DiffLine[] = [];
  const ctx = (t: string) => U.push({ tag: 'ctx', text: t });
  const add = (t: string) => U.push({ tag: 'add', text: t });
  const del = (t: string) => U.push({ tag: 'del', text: t });
  const r = rng(hashStr(device.id));
  const dh = hashStr(device.id + 'drift');

  ctx(`! ${device.hostname} running-config`);
  ctx(`hostname ${device.hostname}`);
  ctx(`! role ${device.role} · ${device.vendor} ${device.model}`);
  ctx('!');
  ctx('ntp server 10.0.0.1');
  ctx('aaa new-model');
  ctx('logging host 10.0.0.50');
  // SNMP — golden requires v3; some devices drifted back to insecure v2c.
  if (dh % 5 === 0) { del('snmp-server group NETOPS v3 priv'); add('snmp-server community public RO'); }
  else ctx('snmp-server group NETOPS v3 priv');
  ctx('!');
  ctx('line vty 0 4');
  // Management plane — golden is SSH-only; some devices left telnet enabled.
  if (dh % 7 === 0) { del(' transport input ssh'); add(' transport input telnet ssh'); }
  else ctx(' transport input ssh');
  ctx('!');
  [10, 20, 30].forEach((v) => ctx(`vlan ${v}`));
  // Unauthorised permit-any ACL — classic config drift on ~30% of devices.
  if (r() > 0.7) { add('ip access-list extended TEMP-ALLOW-ANY'); add(' permit ip any any'); }
  ctx('!');
  ifaces.slice(0, 6).forEach((i, idx) => {
    ctx(`interface ${i.name}`);
    if (idx === 0 && r() > 0.6) { del(' description core-uplink'); add(' description TEMP-do-not-use'); }
    else ctx(` description ${device.role.toLowerCase()}-link`);
    ctx(' switchport mode trunk');
    ctx(`! speed ${i.speedGbps}G`);
    ctx('!');
  });

  const golden = U.filter((l) => l.tag !== 'add').map((l) => l.text).join('\n');
  const running = U.filter((l) => l.tag !== 'del').map((l) => l.text).join('\n');
  const checks: ComplianceCheck[] = [
    { name: 'SSH-only management', pass: /transport input ssh/.test(running) && !/telnet/.test(running) },
    { name: 'SNMP v3 (no v2c)', pass: /v3 priv/.test(running) && !/snmp-server community/.test(running) },
    { name: 'NTP configured', pass: /ntp server/.test(running) },
    { name: 'Central syslog', pass: /logging host/.test(running) },
    { name: 'AAA enabled', pass: /aaa new-model/.test(running) },
    { name: 'No permit-any ACL', pass: !/TEMP-ALLOW-ANY/.test(running) },
  ];
  const driftCount = U.filter((l) => l.tag !== 'ctx').length;
  const passed = checks.filter((c) => c.pass).length;
  return { golden, running, unified: U, driftCount, drift: driftCount > 0, checks, compliancePct: Math.round((passed / checks.length) * 100) };
}

export interface FleetRow {
  device: ManagedDevice; driftCount: number; drift: boolean; compliancePct: number; failedChecks: number;
}
export interface ConfigFleet {
  rows: FleetRow[];
  inCompliance: number; withDrift: number; meanCompliancePct: number;
  checkRollup: Array<{ name: string; passPct: number }>;
}

/** Fleet-wide config posture for the management screen. */
export function configFleet(devices: ManagedDevice[], ifByDevice: Map<string, Interface[]>): ConfigFleet {
  const rows: FleetRow[] = [];
  const checkPass = new Map<string, number>();
  let total = 0;
  for (const d of devices) {
    const cfg = buildDeviceConfig(d, ifByDevice.get(d.id) ?? []);
    rows.push({ device: d, driftCount: cfg.driftCount, drift: cfg.drift, compliancePct: cfg.compliancePct, failedChecks: cfg.checks.filter((c) => !c.pass).length });
    cfg.checks.forEach((c) => checkPass.set(c.name, (checkPass.get(c.name) ?? 0) + (c.pass ? 1 : 0)));
    total++;
  }
  rows.sort((a, b) => b.driftCount - a.driftCount || a.compliancePct - b.compliancePct);
  const denom = total || 1;
  return {
    rows,
    inCompliance: rows.filter((r) => r.compliancePct === 100 && !r.drift).length,
    withDrift: rows.filter((r) => r.drift).length,
    meanCompliancePct: Math.round(rows.reduce((s, r) => s + r.compliancePct, 0) / denom),
    checkRollup: Array.from(checkPass.entries()).map(([name, n]) => ({ name, passPct: Math.round((n / denom) * 100) })),
  };
}

export const complianceColor = (pct: number) => pct >= 100 ? 'var(--vw-color-green-600)' : pct >= 80 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)';

/**
 * Mean-compliance and drift-device trend over the trailing window. No historical
 * store exists, so this is a deterministic path that *lands exactly* on the
 * current computed posture — same approach as the performance time-series.
 */
export function complianceTrend(fleet: ConfigFleet, days = 14): Array<{ day: string; series: string; value: number }> {
  const dayMs = 864e5;
  const start = Date.now() - (days - 1) * dayMs;
  const label = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const r = rng(hashStr('config-compliance-trend'));
  const targetC = fleet.meanCompliancePct;
  const targetD = fleet.withDrift;
  const res: Array<{ day: string; series: string; value: number }> = [];
  for (let i = 0; i < days; i++) {
    const f = i / (days - 1);
    const last = i === days - 1;
    const c = last ? targetC : Math.round(Math.max(0, Math.min(100, (targetC - 9) + 9 * f + (r() - 0.5) * 4)));
    const d = last ? targetD : Math.max(0, Math.round(targetD + (1 - f) * Math.round(targetD * 0.5) + (r() - 0.5) * 3));
    const day = label(start + i * dayMs);
    res.push({ day, series: 'Compliance %', value: c });
    res.push({ day, series: 'Drift devices', value: d });
  }
  return res;
}
