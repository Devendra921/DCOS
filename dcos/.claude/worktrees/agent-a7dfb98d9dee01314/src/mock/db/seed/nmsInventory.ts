/**
 * DCOS seed — NMS inventory.
 *
 * The operational lens on the real DCIM devices: one managed device per fabric,
 * security, OOB, load-balancer, rack-PDU and UPS device plus a sample of access ToRs
 * and GPU nodes, each keyed by the DCIM device id so alarms, interfaces, config and
 * topology all point at the same record. Every managed device names the Databyte
 * collector that feeds it (SNMP, Redfish, IPMI 2.0 or Modbus).
 */
import type * as T from '../../data/types';
import type * as E from '../../data/enums';
import type { Seed, AssetSeed } from './ctx';

const OS_FOR = (vendor: string, model: string, category?: string): string => {
  if (vendor === 'Juniper') return 'Junos 23.4R2-S3';
  if (vendor === 'Arista') return 'EOS 4.32.1F';
  if (vendor === 'Cisco') return model.includes('Nexus') ? 'NX-OS 10.4(3)' : model.includes('ASR') ? 'IOS-XR 7.11.2' : 'IOS-XE 17.12.3';
  if (vendor === 'Palo Alto') return 'PAN-OS 11.1.3';
  if (vendor === 'F5') return 'TMOS 17.1.1';
  if (vendor === 'Opengear') return 'Opengear OS 24.07';
  if (vendor === 'Vertiv') return 'Geist firmware 6.2.1';
  if (vendor === 'APC') return 'NMC3 2.5.1';
  if (category === 'GPU-Node') return 'Ubuntu 22.04 LTS · DCGM 3.3';
  return 'Ubuntu 22.04 LTS';
};

export function seedNmsInventory(S: Seed): void {
  const assetById = new Map<string, AssetSeed>();
  for (const a of S.assets) assetById.set(a.id, a);
  const roleOf = (d: T.Device): string | undefined => {
    const fr = assetById.get(d.id)?.fabricRole;
    switch (fr) {
      case 'core': case 'rr': return 'Core';
      case 'spine': return 'Spine';
      case 'leaf': return 'Leaf/TOR';
      case 'edge': case 'pe': return 'Edge';
      case 'access': return 'Access';
      case 'lb': return 'Service';
      case 'console': return 'OOB';
      case 'pdu': case 'ups': return 'Power';
      default: return undefined;
    }
  };
  const nmsType = (d: T.Device): E.DeviceType => {
    if (d.category === 'Switch') return 'Switch';
    if (d.category === 'Router') return 'Router';
    if (d.category === 'Firewall') return 'Firewall';
    if (d.category === 'PDU') return 'PDU';
    if (d.category === 'UPS') return 'UPS';
    if (d.model?.includes('BIG-IP')) return 'LoadBalancer';
    if (d.category === 'Server' || d.category === 'GPU-Node' || d.category === 'Storage') return 'Server';
    return 'Other';
  };
  const collectorFor = (t: E.DeviceType, d: T.Device): string => {
    if (t === 'PDU' || t === 'UPS') return 'Databyte Modbus agent';
    if (t === 'Server') return d.category === 'GPU-Node' ? 'Databyte IPMI 2.0 agent' : 'Databyte Redfish agent';
    return 'Databyte SNMP agent';
  };

  // Which devices the NOC manages: the whole fabric + OOB + power in showcase racks + a sample of access ToRs and GPU nodes.
  const fabric = S.devices.filter((d) => roleOf(d) && roleOf(d) !== 'Access');
  const accessSample = S.devices.filter((d) => roleOf(d) === 'Access').slice(0, 60);
  const gpuSample = S.devices.filter((d) => d.category === 'GPU-Node' && d.status === 'Active').slice(0, 12);
  const storageSample = S.devices.filter((d) => d.category === 'Storage' && d.status === 'Active').slice(0, 4);
  const managed = [...fabric, ...accessSample, ...gpuSample, ...storageSample];

  managed.forEach((dv, i) => {
    const t = nmsType(dv);
    const reach: E.DeviceReachability = dv.status === 'Faulty' || i % 23 === 9 ? 'Unreachable' : i % 11 === 4 ? 'Degraded' : 'Reachable';
    const role = roleOf(dv) ?? (t === 'Server' ? 'Compute' : 'Access');
    S.managedDevices.push({
      id: dv.id, devId: S.nid('DEV'), ...S.meta(), assetId: dv.id, hostname: dv.hostname ?? dv.name, mgmtIp: '0.0.0.0', deviceType: t,
      vendor: dv.manufacturer ?? 'Unknown', model: dv.model ?? 'Unknown', osVersion: OS_FOR(dv.manufacturer ?? '', dv.model ?? '', dv.category), role,
      dataCenterId: dv.dataCenterId, rackId: dv.rackId, reachability: reach,
      lastPolledAt: reach === 'Unreachable' ? S.minutesAgo(S.int(90, 600)) : S.minutesAgo(S.int(1, 5)),
      uptimeSeconds: reach === 'Unreachable' ? 0 : S.int(86_400, 9_000_000), sourceSystem: collectorFor(t, dv),
      notes: reach === 'Unreachable' ? 'Collector cannot reach the device — see discovery reconciliation' : undefined,
    });

    // Interfaces: the management port first (IPs bind to it), then the data ports the NOC watches.
    const comps = (S.compsByDevice.get(dv.id) ?? []).filter((c) => c.kind === 'interface');
    const mgmt = comps.find((c) => c.mgmtOnly) ?? comps[0];
    const data = comps.filter((c) => !c.mgmtOnly && c.ifaceType !== 'Virtual');
    const uplinks = data.filter((c) => c.mode === 'Tagged');
    const access = data.filter((c) => c.mode !== 'Tagged');
    const watchN = t === 'Switch' ? 6 : t === 'Router' ? 8 : t === 'Firewall' ? 4 : t === 'LoadBalancer' ? 4 : t === 'Server' ? 2 : 0;
    const chosen = [...uplinks.slice(0, 2), ...access.slice(0, Math.max(0, watchN - Math.min(2, uplinks.length)))];
    const list = mgmt ? [mgmt, ...chosen] : chosen;
    list.forEach((c, k) => {
      const ifaceId = S.nid('IFACE');
      const isUplink = c.mode === 'Tagged';
      const oper: E.IfOperStatus = reach === 'Unreachable' ? 'Down' : !c.enabled ? 'Down' : (i + k) % 47 === 13 ? 'Down' : (i + k) % 101 === 50 ? 'Testing' : (i + k) % 89 === 70 ? 'Dormant' : 'Up';
      const util = oper !== 'Up' ? 0 : isUplink ? ((i + k) % 7 === 0 ? S.int(86, 99) : S.int(40, 84)) : k === 0 ? S.int(1, 8) : S.int(2, 60);
      const errors = oper === 'Up' && (i + k) % 13 === 5 ? S.int(70, 400) : S.int(0, 12);
      S.interfaces.push({ id: ifaceId, ifaceId, ...S.meta(), deviceId: dv.id, name: c.name, adminStatus: c.enabled === false ? 'Down' : 'Up', operStatus: oper, speedGbps: Math.max(1, Math.round((c.speedMbps ?? 1000) / 1000)), utilizationPct: util, inErrors: errors, outErrors: Math.round(errors / 3), notes: errors >= 70 ? 'Error rate above the collector threshold' : undefined });
    });

    // Config backups: network and security devices only; three versions on the fabric, the latest usually golden.
    if (['Switch', 'Router', 'Firewall', 'LoadBalancer'].includes(t)) {
      const versions = role === 'Core' || role === 'Spine' ? 3 : 1;
      for (let v = versions; v >= 1; v--) {
        const cfgId = S.nid('CFG');
        const latest = v === versions;
        S.configBackups.push({ id: cfgId, cfgId, ...S.meta(), deviceId: dv.id, version: `v${10 + v}`, capturedAt: S.daysAgo(latest ? S.int(0, 2) : S.int(7 * (versions - v), 7 * (versions - v) + 6)), configHash: S.hex(12), isGolden: latest ? i % 5 !== 2 : false, sourceSystem: 'Databyte SNMP agent', notes: latest && i % 5 === 2 ? 'Running config drifted from golden' : undefined });
      }
    }
  });
}
