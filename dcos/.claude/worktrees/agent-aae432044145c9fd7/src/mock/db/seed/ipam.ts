/**
 * DCOS seed — IPAM.
 *
 * A structured address plan rather than random CIDRs: RIR → aggregate → per-site /16
 * container → purpose prefixes (management, OOB, production, pool, storage, transit,
 * loopbacks), VLANs that match, VRFs with route targets, gateways on FHRP groups, and
 * real address bindings: every managed device gets its management IP (bound to its
 * NMS interface and set as the device's primary IPv4), network kit gets an OOB address,
 * core routers get IPv6, and showcase servers get production addresses with services.
 */
import type * as T from '../../data/types';
import type * as E from '../../data/enums';
import type { Seed, AssetSeed } from './ctx';

const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const hostsFor = (mask: number) => Math.max(2, 2 ** (32 - mask) - 2);

export function seedIpam(S: Seed): void {
  const netEng = S.byRole('Network Engineer');
  // ── Reference ──
  const rirIdBy: Record<string, string> = {};
  for (const [name, priv, desc] of [['ARIN', false, 'American Registry for Internet Numbers'], ['RIPE NCC', false, 'European IP Networks'], ['APNIC', false, 'Asia-Pacific Network Information Centre'], ['RFC 1918 (private)', true, 'Private address space']] as const) {
    const id = S.nid('RIR'); rirIdBy[name] = id; S.rirs.push({ id, rirId: id, ...S.meta(), name, slug: slug(name), isPrivate: priv, description: desc });
  }
  const roleIdBy: Record<string, string> = {};
  const roleDefs: Array<[string, string]> = [['Management', '#2563eb'], ['Production', '#16a34a'], ['Storage', '#7c3aed'], ['Transit', '#f59e0b'], ['Out-of-band', '#0ea5e9'], ['Loopback', '#64748b'], ['DMZ', '#dc2626']];
  roleDefs.forEach(([n, color], i) => { const id = S.nid('IPROLE'); roleIdBy[n] = id; S.ipamRoles.push({ id, roleId: id, ...S.meta(), name: n, slug: slug(n), weight: (i + 1) * 100, color, description: `${n} addressing` }); });
  const rtIds: string[] = [];
  for (let i = 0; i < 8; i++) { const id = S.nid('RT'); rtIds.push(id); S.routeTargets.push({ id, rtId: id, ...S.meta(), name: `65000:${1000 + i}`, description: `Route target ${['PROD import', 'PROD export', 'MGMT', 'STOR', 'OOB', 'DMZ', 'TRANSIT', 'Shared services'][i]}` }); }
  const vgIdBy: Record<string, string> = {};
  for (const [n, scope] of [['Core Fabric', 'estate'], ['Edge', 'estate'], ['DMZ', 'estate'], ['Storage Fabric', 'estate'], ['Management', 'estate']] as const) { const id = S.nid('VG'); vgIdBy[n] = id; S.vlanGroups.push({ id, vgId: id, ...S.meta(), name: n, slug: slug(n), scope, minVid: 1, maxVid: 4094, description: `${n} VLAN group` }); }
  const asnDefs: Array<[number, string, string]> = [[64512, 'RFC 1918 (private)', 'Private ASN — estate fabric'], [65001, 'RFC 1918 (private)', 'Private ASN — DMZ'], [394001, 'ARIN', 'Public ASN — enterprise'], [3356, 'ARIN', 'Lumen (peer)'], [13335, 'ARIN', 'Cloudflare (peer)'], [8075, 'ARIN', 'Microsoft (cloud on-ramp peer)'], [1299, 'RIPE NCC', 'Telia Carrier (transit)'], [4134, 'APNIC', 'China Telecom (peer at Singapore POP)']];
  for (const [a, rir, desc] of asnDefs) { const id = S.nid('ASN'); S.asns.push({ id, asnId: id, ...S.meta(), asn: a, rirId: rirIdBy[rir], description: desc }); }
  { const id = S.nid('ASNR'); S.asnRanges.push({ id, asnrId: id, ...S.meta(), name: 'Private 16-bit ASN pool', rirId: rirIdBy['RFC 1918 (private)'], start: 64512, end: 65534 }); }
  { const id = S.nid('ASNR'); S.asnRanges.push({ id, asnrId: id, ...S.meta(), name: 'Private 32-bit ASN pool', rirId: rirIdBy['RFC 1918 (private)'], start: 4200000000, end: 4294967294 }); }

  // ── VRFs with import/export targets ──
  const vrfIdBy: Record<string, string> = {};
  const vrfDefs: Array<[string, number, number[], number[], boolean]> = [['PROD', 100, [0, 7], [1], true], ['MGMT', 101, [2, 7], [2], true], ['STOR', 102, [3], [3], true], ['OOB', 103, [4], [4], true], ['DMZ', 104, [5, 7], [5], true], ['TRANSIT', 105, [6], [6], false]];
  for (const [n, rd, imp, exp, uniq] of vrfDefs) {
    const id = S.nid('VRF'); vrfIdBy[n] = id;
    S.vrfs.push({ id, vrfId: id, ...S.meta(netEng), name: `VRF-${n}`, routeDistinguisher: `65000:${rd}`, enforceUnique: uniq, importTargetIds: imp.map((i) => rtIds[i]), exportTargetIds: exp.map((i) => rtIds[i]), subnetCount: 0, notes: uniq ? 'Unique addresses enforced' : 'Overlapping transit space allowed' });
  }

  // ── Aggregates ──
  const aggIdBy: Record<string, string> = {};
  const aggDefs: Array<[string, string, string, number, string]> = [['10.0.0.0/8', 'Private supernet (sites)', 'RFC 1918 (private)', 16_777_216, 'PROD'], ['172.16.0.0/12', 'Private supernet (DMZ)', 'RFC 1918 (private)', 1_048_576, 'DMZ'], ['192.168.0.0/16', 'Private supernet (labs)', 'RFC 1918 (private)', 65_536, 'MGMT'], ['203.0.113.0/24', 'Public — enterprise (ARIN)', 'ARIN', 256, 'TRANSIT'], ['198.51.100.0/24', 'Public — Frankfurt interconnect (RIPE)', 'RIPE NCC', 256, 'TRANSIT']];
  for (const [cidr, name, rir, total, vrf] of aggDefs) {
    const id = S.nid('CIDR'); aggIdBy[cidr] = id;
    S.cidrBlocks.push({ id, cidrId: id, ...S.meta(netEng), cidr, name, rirId: rirIdBy[rir], dateAdded: S.daysAgo(S.int(700, 1800)), totalAddresses: total, allocatedAddresses: 0, utilizationPct: 0, vrfId: vrfIdBy[vrf], notes: `${name} — ${rir}` });
  }

  // ── Per-site prefix trees + VLANs ──
  interface SiteNet { dcId: string; mgmt: T.Subnet; oob: T.Subnet; prod: T.Subnet; pool: T.Subnet; stor: T.Subnet; transit: T.Subnet; loop: T.Subnet; vlanBy: Record<string, T.VLAN> }
  const siteNets = new Map<string, SiteNet>();
  const pushSubnet = (o: Partial<T.Subnet> & { cidr: string; name: string; purpose: E.SubnetPurpose; dataCenterId: string }): T.Subnet => {
    const id = S.nid('SUBNET');
    const mask = +o.cidr.split('/')[1];
    const total = o.status === 'Container' ? hostsFor(mask) : hostsFor(mask);
    const s: T.Subnet = { id, subnetId: id, ...S.meta(netEng), cidrBlockId: aggIdBy['10.0.0.0/8'], parentId: undefined, vlanId: undefined, vrfId: vrfIdBy.PROD, roleId: roleIdBy.Production, status: 'Active', isPool: false, markUtilized: false, gatewayIp: o.cidr.replace(/\.\d+\/\d+$/, '.1'), hallId: undefined, totalHosts: total, usedHosts: 0, utilizationPct: 0, forecastExhaustionDate: undefined, state: 'Available', ...o };
    S.subnets.push(s);
    return s;
  };
  const pushVlan = (dcId: string, vid: number, name: string, group: string, role: string, status: E.NetworkObjStatus, vxlan?: number): T.VLAN => {
    const id = S.nid('VLAN');
    const v: T.VLAN = { id, vlanId: id, ...S.meta(netEng), vlanNumber: vid, name, dataCenterId: dcId, vxlanId: vxlan != null ? String(vxlan) : undefined, groupId: vgIdBy[group], roleId: roleIdBy[role], status, notes: status === 'Unused' ? 'No ports or prefixes bound — candidate for reclaim' : undefined };
    S.vlans.push(v);
    return v;
  };
  S.dataCenters.forEach((dc, i) => {
    const prof = S.dcProfile.get(dc.id);
    const construction = dc.status === 'Construction';
    const retiring = dc.status === 'Decommissioning';
    const st: E.PrefixStatus = construction ? 'Reserved' : 'Active';
    const hall1 = S.halls.find((h) => h.dataCenterId === dc.id);
    const vlanBy: Record<string, T.VLAN> = {
      mgmt: pushVlan(dc.id, 100, `${dc.code}_MGMT`, 'Management', 'Management', construction ? 'Reserved' : 'Active'),
      oob: pushVlan(dc.id, 110, `${dc.code}_OOB`, 'Management', 'Out-of-band', construction ? 'Reserved' : 'Active'),
      prod: pushVlan(dc.id, 200, `${dc.code}_PROD`, 'Core Fabric', 'Production', construction ? 'Reserved' : 'Active', 10200 + i),
      pool: pushVlan(dc.id, 201, `${dc.code}_PROD_DHCP`, 'Core Fabric', 'Production', construction ? 'Reserved' : 'Active', 10300 + i),
      stor: pushVlan(dc.id, 300, `${dc.code}_STORAGE`, 'Storage Fabric', 'Storage', construction ? 'Reserved' : 'Active', 10400 + i),
      transit: pushVlan(dc.id, 900, `${dc.code}_TRANSIT`, 'Edge', 'Transit', construction ? 'Reserved' : 'Active'),
    };
    if (i % 3 === 0) vlanBy.legacy = pushVlan(dc.id, 999, `${dc.code}_LEGACY`, 'Edge', 'Production', 'Unused');
    if (retiring) vlanBy.vmotion = pushVlan(dc.id, 210, `${dc.code}_VMOTION`, 'Core Fabric', 'Production', 'Unused');

    const container = pushSubnet({ cidr: `10.${i}.0.0/16`, name: `${dc.code} site container`, purpose: 'Production', dataCenterId: dc.id, status: 'Container', roleId: undefined, vrfId: vrfIdBy.PROD, notes: `${dc.name} — all site space` });
    const mgmt = pushSubnet({ cidr: `10.${i}.0.0/24`, name: `${dc.code} management`, purpose: 'Management', dataCenterId: dc.id, parentId: container.id, vlanId: vlanBy.mgmt.id, vrfId: vrfIdBy.MGMT, roleId: roleIdBy.Management, status: st });
    const oob = pushSubnet({ cidr: `10.${i}.1.0/24`, name: `${dc.code} out-of-band`, purpose: 'OOB', dataCenterId: dc.id, parentId: container.id, vlanId: vlanBy.oob.id, vrfId: vrfIdBy.OOB, roleId: roleIdBy['Out-of-band'], status: st });
    const prod = pushSubnet({ cidr: `10.${i}.10.0/23`, name: `${dc.code} production`, purpose: 'Production', dataCenterId: dc.id, parentId: container.id, vlanId: vlanBy.prod.id, vrfId: vrfIdBy.PROD, roleId: roleIdBy.Production, status: st, hallId: hall1?.id });
    const pool = pushSubnet({ cidr: `10.${i}.12.0/24`, name: `${dc.code} production DHCP pool`, purpose: 'Production', dataCenterId: dc.id, parentId: container.id, vlanId: vlanBy.pool.id, vrfId: vrfIdBy.PROD, roleId: roleIdBy.Production, status: st, isPool: true, hallId: hall1?.id });
    const stor = pushSubnet({ cidr: `10.${i}.20.0/24`, name: `${dc.code} storage`, purpose: 'Storage', dataCenterId: dc.id, parentId: container.id, vlanId: vlanBy.stor.id, vrfId: vrfIdBy.STOR, roleId: roleIdBy.Storage, status: st });
    const transit = pushSubnet({ cidr: `10.${i}.250.0/24`, name: `${dc.code} transit`, purpose: 'Transit', dataCenterId: dc.id, parentId: container.id, vlanId: vlanBy.transit.id, vrfId: vrfIdBy.TRANSIT, roleId: roleIdBy.Transit, status: st });
    const loop = pushSubnet({ cidr: `10.${i}.255.0/24`, name: `${dc.code} loopbacks`, purpose: 'Management', dataCenterId: dc.id, parentId: container.id, vrfId: vrfIdBy.PROD, roleId: roleIdBy.Loopback, status: st, markUtilized: true });
    if (retiring || i % 5 === 2) pushSubnet({ cidr: `10.${i}.99.0/24`, name: `${dc.code} legacy`, purpose: 'Production', dataCenterId: dc.id, parentId: container.id, vlanId: vlanBy.legacy?.id ?? vlanBy.vmotion?.id, vrfId: vrfIdBy.PROD, roleId: roleIdBy.Production, status: 'Deprecated', notes: 'Superseded by the production prefix; drain and release' });
    if (prof?.multiTenant || prof?.key === 'enterprise-dc') pushSubnet({ cidr: `172.16.${i}.0/24`, name: `${dc.code} DMZ`, purpose: 'Transit', dataCenterId: dc.id, cidrBlockId: aggIdBy['172.16.0.0/12'], vlanId: vlanBy.transit.id, vrfId: vrfIdBy.DMZ, roleId: roleIdBy.DMZ, status: st });
    if (['carrier-hotel', 'ixp', 'network-pop'].includes(prof?.key ?? '')) pushSubnet({ cidr: prof?.key === 'network-pop' ? `203.0.113.${(i % 4) * 64}/26` : `198.51.100.${(i % 4) * 64}/26`, name: `${dc.code} public peering`, purpose: 'Transit', dataCenterId: dc.id, cidrBlockId: aggIdBy[prof?.key === 'network-pop' ? '203.0.113.0/24' : '198.51.100.0/24'], vlanId: vlanBy.transit.id, vrfId: vrfIdBy.TRANSIT, roleId: roleIdBy.Transit, status: st });
    siteNets.set(dc.id, { dcId: dc.id, mgmt, oob, prod, pool, stor, transit, loop, vlanBy });
  });

  // ── FHRP groups: one gateway group per production subnet, protocols dealt across the estate ──
  const fhrpBySubnet = new Map<string, string>();
  [...siteNets.values()].forEach((n, i) => {
    const id = S.nid('FHRP');
    const protocol = S.cycle(['VRRP', 'HSRP', 'GLBP', 'CARP'] as const, i);
    S.fhrpGroups.push({ id, fhrpId: id, ...S.meta(netEng), protocol, groupId: 10 + i, authType: S.cycle(['md5', 'plaintext', 'none'], i), description: `${protocol} gateway for ${n.prod.name}` });
    fhrpBySubnet.set(n.prod.id, id);
  });

  // ── Addresses ──
  const assetById = new Map<string, AssetSeed>();
  for (const a of S.assets) assetById.set(a.id, a);
  const mdById = new Map(S.managedDevices.map((m) => [m.id, m]));
  const ifacesByDevice = new Map<string, T.Interface[]>();
  for (const f of S.interfaces) { const arr = ifacesByDevice.get(f.deviceId) ?? []; arr.push(f); ifacesByDevice.set(f.deviceId, arr); }
  const counters = new Map<string, number>();
  const nextHost = (sn: T.Subnet, from = 10): number => { const n = (counters.get(sn.id) ?? from - 1) + 1; counters.set(sn.id, n); return n; };
  const addr = (sn: T.Subnet, host: number) => { const [a, b, c] = sn.cidr.split('/')[0].split('.').map(Number); const mask = +sn.cidr.split('/')[1]; if (mask >= 24) return `${a}.${b}.${c}.${host}`; return `${a}.${b}.${c + Math.floor(host / 256)}.${host % 256}`; };
  const pushIp = (sn: T.Subnet, host: number, o: Partial<T.IPAddress> = {}): T.IPAddress => {
    const id = S.nid('IP');
    const ip: T.IPAddress = { id, ipId: id, ...S.meta(netEng), subnetId: sn.id, address: addr(sn, host), status: 'Allocated', roleId: sn.roleId, allocatedAt: S.daysAgo(S.int(5, 900)), ...o };
    S.ipAddresses.push(ip);
    return ip;
  };
  const domainFor = (dcId: string) => `${(S.dcCampus.get(dcId) ?? 'dc').toLowerCase()}.dc.internal`;

  for (const [dcId, n] of siteNets) {
    const dc = S.dataCenters.find((d) => d.id === dcId) as T.DataCenter;
    // Gateways (.1) on every leaf prefix; the production gateway is the FHRP virtual IP.
    for (const sn of [n.mgmt, n.oob, n.prod, n.pool, n.stor, n.transit]) pushIp(sn, 1, { dnsName: `gw.${sn.name.split(' ').slice(1).join('-').toLowerCase()}.${domainFor(dcId)}`, hostname: 'gateway', description: 'Default gateway', fhrpGroupId: sn.id === n.prod.id ? fhrpBySubnet.get(n.prod.id) : undefined, status: 'Allocated' });
    // Infrastructure reserve .2–.9 on management
    for (let h = 2; h <= 4; h++) pushIp(n.mgmt, h, { status: 'Reserved', description: 'Reserved for network infrastructure', allocatedAt: undefined });
    // Managed devices: management IP bound to the NMS management interface and set as the device's primary IPv4
    const dcDevices = S.devices.filter((d) => d.dataCenterId === dcId);
    let loopHost = 1;
    dcDevices.forEach((dv) => {
      const md = mdById.get(dv.id);
      const fr = assetById.get(dv.id)?.fabricRole;
      const isNet = ['Switch', 'Router', 'Firewall'].includes(dv.category ?? '') || fr === 'lb' || fr === 'console';
      if (md) {
        const host = nextHost(n.mgmt);
        const mgmtIface = (ifacesByDevice.get(dv.id) ?? [])[0];
        const comps = (S.compsByDevice.get(dv.id) ?? []).find((c) => c.kind === 'interface' && c.mgmtOnly);
        const ip = pushIp(n.mgmt, host, { deviceId: dv.id, interfaceId: mgmtIface?.id, isPrimary: true, hostname: dv.hostname, dnsName: `${dv.hostname}.${domainFor(dcId)}`, macAddress: comps?.macAddress ?? S.mac(), description: `Management — ${md.sourceSystem}` });
        md.mgmtIp = ip.address; dv.primaryIp4 = ip.address;
        if (fr === 'core' || fr === 'rr' || fr === 'pe') {
          // Loopback + IPv6 on the routing core
          pushIp(n.loop, loopHost++, { deviceId: dv.id, isPrimary: false, hostname: dv.hostname, dnsName: `lo0.${dv.hostname}.${domainFor(dcId)}`, description: 'Router loopback' });
          dv.primaryIp6 = `2001:db8:${S.dataCenters.indexOf(dc).toString(16)}::${loopHost.toString(16)}`;
        }
      }
      if (isNet) {
        const host = nextHost(n.oob);
        const ip = pushIp(n.oob, host, { deviceId: dv.id, isPrimary: false, hostname: dv.hostname, dnsName: `oob.${dv.hostname}.${domainFor(dcId)}`, description: 'Out-of-band console network' });
        dv.oobIp = ip.address;
        const comps = S.compsByDevice.get(dv.id) ?? [];
        comps.filter((c) => c.kind === 'interface' && c.mgmtOnly).forEach((c) => { c.vrfId = vrfIdBy.MGMT; });
        comps.filter((c) => c.kind === 'interface' && c.mode === 'Tagged').forEach((c) => { c.taggedVlanIds = [n.vlanBy.prod.id, n.vlanBy.stor.id, n.vlanBy.mgmt.id]; });
      }
    });
    // Showcase servers: production and storage addresses on the data NICs; VLAN membership on the ports
    const sc = S.showcaseRacks.get(dcId) ?? [];
    sc.forEach((rack) => {
      dcDevices.filter((d) => d.rackId === rack.id && (d.category === 'Server' || d.category === 'GPU-Node' || d.category === 'Storage') && !d.parentDeviceId).forEach((dv) => {
        const comps = (S.compsByDevice.get(dv.id) ?? []).filter((c) => c.kind === 'interface' && !c.mgmtOnly && c.ifaceType !== 'Virtual');
        const nic0 = comps[0]; const nic1 = comps[1];
        const md = mdById.get(dv.id); const nmsIf = (ifacesByDevice.get(dv.id) ?? []).find((f) => f.name === nic0?.name);
        const sn = dv.category === 'Storage' ? n.stor : n.prod;
        const host = nextHost(sn, 20);
        const ip = pushIp(sn, host, { deviceId: dv.id, interfaceId: md ? nmsIf?.id : undefined, isPrimary: !md, hostname: dv.hostname, dnsName: `${dv.hostname}.${domainFor(dcId)}`, macAddress: nic0?.macAddress, description: dv.category === 'Storage' ? 'Storage data path' : 'Production data path' });
        if (!md) dv.primaryIp4 = ip.address;
        if (nic0) nic0.untaggedVlanId = dv.category === 'Storage' ? n.vlanBy.stor.id : n.vlanBy.prod.id;
        if (nic1) nic1.untaggedVlanId = dv.category === 'Storage' ? n.vlanBy.stor.id : n.vlanBy.prod.id;
      });
    });
    // Pool: a few explicitly Available leases, one Conflict at the larger sites
    for (let k = 0; k < 3; k++) pushIp(n.pool, 50 + k, { status: 'Available', description: 'DHCP lease slot', allocatedAt: undefined });
    if (S.dataCenters.indexOf(dc) % 4 === 0) {
      const dup = S.ipAddresses.find((ip) => ip.subnetId === n.prod.id && ip.deviceId);
      if (dup) pushIp(n.prod, +dup.address.split('.')[3], { status: 'Conflict', hostname: 'unknown-host', description: `Duplicate of ${dup.address} seen by discovery`, notes: 'Investigate — two hosts answer on this address' });
    }
    // IP ranges: DHCP pool and NAT pool
    const r1 = S.nid('IPR'); S.ipRanges.push({ id: r1, iprId: r1, ...S.meta(netEng), startAddress: addr(n.pool, 50), endAddress: addr(n.pool, 200), vrfId: n.pool.vrfId, roleId: n.pool.roleId, status: S.cycle(['Allocated', 'Reserved', 'Available', 'Conflict'] as const, S.dataCenters.indexOf(dc)), size: 151, description: `DHCP pool in ${n.pool.name}` });
    const r2 = S.nid('IPR'); S.ipRanges.push({ id: r2, iprId: r2, ...S.meta(netEng), startAddress: addr(n.transit, 100), endAddress: addr(n.transit, 131), vrfId: n.transit.vrfId, roleId: n.transit.roleId, status: 'Allocated', size: 32, description: `NAT pool in ${n.transit.name}` });
  }

  // ── Utilisation: real bindings plus a deterministic baseline so the hub has exhaustion to show ──
  S.dataCenters.forEach((dc, i) => {
    const n = siteNets.get(dc.id); if (!n) return;
    const construction = dc.status === 'Construction';
    const baseline: Record<string, number> = { [n.mgmt.id]: 0.35, [n.oob.id]: 0.3, [n.prod.id]: i % 4 === 1 ? 0.92 : i % 4 === 2 ? 0.87 : 0.55, [n.pool.id]: 0.6, [n.stor.id]: i % 5 === 3 ? 0.9 : 0.4, [n.transit.id]: 0.25, [n.loop.id]: 0.1 };
    for (const sn of S.subnets.filter((s) => s.dataCenterId === dc.id && s.status !== 'Container')) {
      const bound = S.ipAddresses.filter((ip) => ip.subnetId === sn.id).length;
      const used = construction ? bound : Math.max(bound, Math.round(sn.totalHosts * (baseline[sn.id] ?? 0.45)));
      sn.usedHosts = Math.min(sn.totalHosts, used);
      sn.utilizationPct = S.pct(sn.usedHosts, sn.totalHosts);
      sn.state = sn.utilizationPct > 90 ? 'Consumed' : sn.utilizationPct > 60 ? 'Committed' : sn.status === 'Reserved' ? 'Reserved' : 'Available';
      sn.forecastExhaustionDate = sn.utilizationPct >= 85 ? S.daysAhead(S.int(20, 120)) : undefined;
    }
    const kids = S.subnets.filter((s) => s.parentId);
    for (const c of S.subnets.filter((s) => s.status === 'Container')) {
      const ch = kids.filter((k) => k.parentId === c.id);
      c.usedHosts = ch.reduce((s, k) => s + k.totalHosts, 0); c.utilizationPct = S.pct(c.usedHosts, c.totalHosts); c.state = c.utilizationPct > 60 ? 'Committed' : 'Available';
    }
  });
  S.vrfs.forEach((v) => (v.subnetCount = S.subnets.filter((s) => s.vrfId === v.id).length));
  S.cidrBlocks.forEach((b) => { const ch = S.subnets.filter((s) => s.cidrBlockId === b.id && !s.parentId); b.allocatedAddresses = ch.reduce((s, k) => s + k.totalHosts + 2, 0); b.utilizationPct = S.pct(b.allocatedAddresses, b.totalAddresses); });

  // ── Service templates and application services bound to real addresses ──
  const svcTpls: Array<[string, E.ServiceProtocol, number[], string]> = [['HTTPS', 'TCP', [443], 'Web / API endpoint'], ['SSH', 'TCP', [22], 'Shell access'], ['DNS', 'UDP', [53], 'Name resolution'], ['SNMP', 'UDP', [161], 'Collector polling'], ['NTP', 'UDP', [123], 'Time sync'], ['BGP', 'TCP', [179], 'Routing peering'], ['NETCONF', 'TCP', [830], 'Config automation'], ['IPMI', 'UDP', [623], 'Baseboard management'], ['Diameter', 'SCTP', [3868], 'Mobile core signalling'], ['Syslog', 'UDP', [514], 'Log shipping']];
  const svcTplBy: Record<string, T.ServiceTemplate> = {};
  for (const [n, proto, ports, desc] of svcTpls) { const id = S.nid('SVCT'); const t: T.ServiceTemplate = { id, svctId: id, ...S.meta(), name: n, protocol: proto, ports, description: desc }; S.serviceTemplates.push(t); svcTplBy[n] = t; }
  const addSvc = (tplName: string, ip: T.IPAddress) => { const t = svcTplBy[tplName]; const id = S.nid('SVC'); S.ipServices.push({ id, svcId: id, ...S.meta(), name: `${t.name} on ${ip.hostname ?? ip.address}`, protocol: t.protocol, ports: t.ports, deviceId: ip.deviceId, ipAddressIds: [ip.id], description: t.description }); };
  const mgmtIps = S.ipAddresses.filter((ip) => ip.isPrimary && ip.deviceId && mdById.has(ip.deviceId));
  mgmtIps.slice(0, 40).forEach((ip, k) => { addSvc('SSH', ip); addSvc('SNMP', ip); if (k % 2 === 0) addSvc('NETCONF', ip); if (k % 5 === 0) addSvc('Syslog', ip); });
  S.ipAddresses.filter((ip) => ip.deviceId && ['core', 'pe', 'rr'].includes(assetById.get(ip.deviceId)?.fabricRole ?? '') && ip.isPrimary).forEach((ip) => addSvc('BGP', ip));
  S.ipAddresses.filter((ip) => ip.deviceId && assetById.get(ip.deviceId)?.fabricRole === 'lb').forEach((ip) => addSvc('HTTPS', ip));
  S.ipAddresses.filter((ip) => ip.deviceId && S.devices.find((d) => d.id === ip.deviceId)?.category === 'GPU-Node' && ip.isPrimary).slice(0, 6).forEach((ip) => addSvc('IPMI', ip));
  S.dataCenters.filter((d) => ['mtso', 'national-core-nfvi'].includes(S.dcProfile.get(d.id)?.key ?? '')).forEach((d) => { const ip = S.ipAddresses.find((x) => x.deviceId && x.subnetId === siteNets.get(d.id)?.prod.id); if (ip) addSvc('Diameter', ip); });
  const infra = S.ipAddresses.filter((ip) => ip.deviceId && !mdById.has(ip.deviceId) && ip.isPrimary).slice(0, 2);
  infra.forEach((ip) => { addSvc('DNS', ip); addSvc('NTP', ip); });
}
