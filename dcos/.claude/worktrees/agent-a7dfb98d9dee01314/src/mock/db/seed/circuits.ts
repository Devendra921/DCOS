/**
 * DCOS seed — carrier circuits.
 *
 * Providers with full commercial detail, provider networks, circuit types, and per-site
 * circuits that follow the facility type's WAN posture. Statuses are dealt so every
 * lifecycle stage appears (the construction site's circuits are being provisioned, the
 * retiring site's are decommissioned, two live sites carry an offline circuit that the
 * operations module turns into incidents). Every A-end terminates on a real core or
 * provider-edge device interface; every Z-end names the provider network.
 */
import type * as E from '../../data/enums';
import type { WanProfile } from '../../data/dcTypes';
import type { Seed, AssetSeed } from './ctx';

const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function seedCircuits(S: Seed): void {
  const netEng = S.byRole('Network Engineer');
  const provSpecs = [
    { name: 'Lumen', asn: 3356, sla: 99.99, restore: 4, tier: 'Platinum', phone: '+1 800 871 9244' },
    { name: 'Zayo', asn: 6461, sla: 99.95, restore: 4, tier: 'Gold', phone: '+1 866 364 6033' },
    { name: 'Cogent', asn: 174, sla: 99.9, restore: 8, tier: 'Silver', phone: '+1 877 875 4311' },
    { name: 'Equinix Fabric', asn: 24115, sla: 99.99, restore: 4, tier: 'Platinum', phone: '+1 866 378 4649' },
    { name: 'AT&T', asn: 7018, sla: 99.95, restore: 4, tier: 'Gold', phone: '+1 800 288 2020' },
    { name: 'Telia Carrier', asn: 1299, sla: 99.95, restore: 4, tier: 'Gold', phone: '+46 8 504 550 00' },
    { name: 'Singtel', asn: 7473, sla: 99.95, restore: 6, tier: 'Gold', phone: '+65 6838 3388' },
  ];
  const ctIds: Record<string, string> = {};
  const ctDefs: Array<[string, string]> = [['Internet (DIA)', '#2563eb'], ['IP Transit', '#7c3aed'], ['Dark Fiber', '#0ea5e9'], ['MPLS', '#16a34a'], ['Wavelength (DWDM)', '#f59e0b'], ['Cloud On-ramp', '#64748b']];
  for (const [n, color] of ctDefs) { const id = S.nid('CKTT'); ctIds[n] = id; S.circuitTypes.push({ id, ctId: id, ...S.meta(), name: n, slug: slug(n), color, notes: `${n} circuits` }); }
  const provIds: string[] = []; const pnByProv: Record<string, string[]> = {}; const provSla: Record<string, number> = {};
  provSpecs.forEach((ps, i) => {
    const id = S.nid('PROV'); provIds.push(id); pnByProv[id] = []; provSla[id] = ps.sla;
    S.providers.push({ id, provId: id, ...S.meta(netEng), name: ps.name, slug: slug(ps.name), account: `ACCT-${String(410000 + i * 137)}`, asn: ps.asn, portalUrl: `https://portal.${slug(ps.name).replace(/-/g, '')}.com`, description: `${ps.name} carrier services`, uptimeSlaPct: ps.sla, restorationHrs: ps.restore, supportTier: ps.tier, supportPhone: ps.phone, contractEnd: S.daysAhead(400 + i * 60), notes: `${ps.tier} support · ${ps.restore} h restoration` });
    (['Metro', 'Backbone'] as const).forEach((k) => { const pn = S.nid('PNET'); pnByProv[id].push(pn); S.providerNetworks.push({ id: pn, pnId: pn, ...S.meta(netEng), providerId: id, name: `${ps.name} ${k}`, description: `${ps.name} ${k.toLowerCase()} network`, notes: `AS${ps.asn}` }); });
  });
  const WAN_MIX: Record<WanProfile, { purposes: E.CircuitPurpose[]; types: string[] }> = {
    edge: { purposes: ['Internet', 'Management'], types: ['Internet (DIA)', 'MPLS'] },
    enterprise: { purposes: ['Internet', 'Cloud On-ramp', 'DC Interconnect', 'Management'], types: ['Internet (DIA)', 'MPLS', 'Cloud On-ramp', 'Dark Fiber'] },
    colo: { purposes: ['Customer', 'DC Interconnect', 'Internet', 'Cloud On-ramp'], types: ['Dark Fiber', 'Wavelength (DWDM)', 'Internet (DIA)', 'Cloud On-ramp'] },
    telco: { purposes: ['Internet', 'DC Interconnect', 'Customer', 'Management'], types: ['IP Transit', 'Wavelength (DWDM)', 'Dark Fiber', 'MPLS'] },
  };
  const assetById = new Map<string, AssetSeed>();
  for (const a of S.assets) assetById.set(a.id, a);
  let cktSeq = 0;
  S.dataCenters.forEach((dc, di) => {
    const prof = S.dcProfile.get(dc.id);
    const wan = WAN_MIX[prof?.physical.wan ?? 'enterprise'];
    const nCkt = Math.max(1, prof?.physical.circuits ?? 3);
    const carrierPool = prof?.physical.diversityExpected ? [provIds[di % provIds.length], provIds[(di + 3) % provIds.length], provIds[(di + 5) % provIds.length]].slice(0, Math.max(2, Math.ceil(nCkt / 2))) : [provIds[di % provIds.length]];
    const dcDevs = S.managedDevices.filter((m) => m.dataCenterId === dc.id && (m.role === 'Core' || m.role === 'Edge'));
    for (let k = 0; k < nCkt; k++) {
      const i = cktSeq++;
      const id = S.nid('CKT'); const prov = carrierPool[k % carrierPool.length];
      const purpose = S.cycle(wan.purposes, k);
      const typeName = S.cycle(wan.types, k);
      const commit = prof?.physical.wan === 'edge' ? S.cycle([1000, 10000], k) : S.cycle([10000, 100000, 40000, 10000, 1000], k + di);
      const gbps = commit / 1000;
      const ratePerGbps = gbps >= 100 ? 200 : gbps >= 40 ? 350 : gbps >= 10 ? 600 : 1200;
      const monthlyCostUsd = Math.round(gbps * ratePerGbps + 200 + (i % 7) * 100);
      let status: E.CircuitStatus = 'Active';
      if (dc.status === 'Construction') status = k === 0 ? 'Provisioning' : 'Planned';
      else if (dc.status === 'Decommissioning') status = k === 0 ? 'Active' : 'Decommissioned';
      else if ((di === 0 && k === 1) || (di === 11 && k === 2)) status = 'Offline';
      else if (di === 6 && k === 3) status = 'Provisioning';
      else if (di === 2 && k === 3) status = 'Planned';
      else if (di === 7 && k === 5) status = 'Decommissioned';
      const live = ['Active', 'Offline', 'Decommissioned'].includes(status);
      const orderedAt = S.daysAgo(S.int(400, 900));
      const dev = dcDevs.length ? S.cycle(dcDevs, k) : undefined;
      const devIfs = dev ? S.interfaces.filter((f) => f.deviceId === dev.id).slice(1) : [];
      const iface = devIfs.length ? S.cycle(devIfs, k) : undefined;
      S.circuits.push({
        id, cktId: id, ...S.meta(netEng), cid: `${(S.providers.find((p) => p.id === prov)?.slug ?? 'ckt').slice(0, 3).toUpperCase()}-${String(70000 + i * 31)}`, providerId: prov, circuitTypeId: ctIds[typeName],
        status, commitRateMbps: commit, description: `${typeName} ${gbps} G ${purpose.toLowerCase()} — ${dc.code}`, installDate: live ? S.daysAgo(S.int(200, 800)) : undefined, purpose,
        monthlyCostUsd, slaUptimePct: provSla[prov], contractStart: orderedAt, contractEnd: S.daysAhead(300 + (i % 5) * 120),
        orderedAt, provisionedAt: status === 'Planned' ? undefined : S.daysAgo(S.int(150, 390)), testedAt: live ? S.daysAgo(S.int(120, 149)) : undefined, activatedAt: live ? S.daysAgo(S.int(100, 119)) : undefined,
        diversityGroup: `${dc.code}·${purpose}`, notes: status === 'Offline' ? 'Carrier ticket open — fibre cut reported on the metro ring' : status === 'Provisioning' ? 'Awaiting cross-connect and light levels' : status === 'Decommissioned' ? 'Disconnected; final invoice reconciled' : undefined,
      });
      const a = S.nid('CTERM');
      S.circuitTerminations.push({ id: a, ctermId: a, ...S.meta(netEng), circuitId: id, side: 'A', dataCenterId: dc.id, deviceId: dev?.id, interfaceId: iface?.id, portSpeedMbps: commit >= 100000 ? 100000 : commit >= 10000 ? 10000 : 1000, xconnectId: `XC-${String(50000 + i * 17)}`, description: dev ? `A-end on ${dev.hostname} ${iface?.name ?? ''}`.trim() : 'A-end in the meet-me room' });
      const z = S.nid('CTERM');
      S.circuitTerminations.push({ id: z, ctermId: z, ...S.meta(netEng), circuitId: id, side: 'Z', providerNetworkId: pnByProv[prov]?.[k % 2], portSpeedMbps: commit >= 100000 ? 100000 : commit >= 10000 ? 10000 : 1000, xconnectId: prof?.multiTenant ? `MMR-${String(9000 + i)}` : undefined, description: `Z-end on ${S.providers.find((p) => p.id === prov)?.name} ${k % 2 === 0 ? 'metro' : 'backbone'} handoff` });
    }
  });
  void assetById;
}
