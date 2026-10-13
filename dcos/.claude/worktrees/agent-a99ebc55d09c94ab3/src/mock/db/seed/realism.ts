/**
 * Seed · estate realism pass.
 *
 * The estate modules deal values per site type; this pass makes the records agree with each
 * other the way a site engineer would check them:
 *
 *   - utility feeds carry the site's design facility load (design IT × PUE + 10%) on each side,
 *     and a campus intake leaves a known, limited headroom (Ashburn: room for Building C phase 1);
 *   - transformers are rated for their feed; UPS units give the built halls' design load at the
 *     site's redundancy (2N+1 means three units per side);
 *   - generators cover the facility load at N+1 (2N at Tier IV); −48 V telco sites run small sets
 *     on long battery autonomy; the server room has none;
 *   - cooling zones are rated for the design load of the halls they serve with one unit lost, and
 *     their load follows the racks; chillers or dry coolers reject that heat (warm water for liquid);
 *   - Dallas HDC-1 runs phase 1 (Halls 1 and 2 live, Halls 3 and 4 in fit-out) with real kit, load,
 *     cables and services; Ashburn DC-1 has a shell Hall 3 for the approved fit-out;
 *   - the previous-generation fleet (Nexus 3172PQ, QFX5100, R740, DL380 Gen10) carries its own
 *     ports, and the Dublin CO-1 Nexus leaves are cabled to the servers they serve and sit in
 *     service paths;
 *   - the Ashburn–Frankfurt interconnect is two 100G wavelengths from two carriers, Z-ends set;
 *   - vendors procurement buys from hold Supply or Framework contracts; sites hold their leases and
 *     plant maintenance contracts.
 *
 * Runs at the end of the fleet module (just before the planner). It draws nothing from the random
 * stream, so the values the planner and the plan families see do not shift, and every record it
 * adds is appended (existing ids stay stable).
 */
import type * as T from '../../data/types';
import type * as E from '../../data/enums';
import { dcTypeProfile, type DcTypeProfile } from '../../data/dcTypes';
import { buildProcess, TEMPLATE_REGISTRY } from '../../../modules/delivery/lib/projectTemplates';
import { CUSTOMER, type Person, type Seed } from './ctx';
import { expandNames } from './dcim';

/** Climate per campus code (used by plans and the planner's intent reading). */
export const CAMPUS_CLIMATE: Record<string, 'cold' | 'temperate' | 'hot-dry' | 'hot-humid'> = { ASH: 'temperate', DAL: 'hot-dry', FRA: 'temperate', DUB: 'cold', SIN: 'hot-humid', SYD: 'temperate', GRU: 'hot-humid' };
/** Total utility intake per side on the Ashburn campus substation (kW). */
export const ASH_CAMPUS_INTAKE_KW = 40_000;

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const up = (n: number, step: number) => Math.ceil(n / step) * step;
const stepFor = (kw: number) => (kw < 1000 ? 50 : kw < 10_000 ? 100 : 500);
const SPEED: Record<string, number> = { '1000BASE-T': 1000, '10GBASE-T': 10_000, '10GBASE-X SFP+': 10_000, '25GBASE-X SFP28': 25_000, '40GBASE-X QSFP+': 40_000, '100GBASE-X QSFP28': 100_000, '400GBASE-X QSFP-DD': 400_000 };

/** The record envelope, without drawing from the random stream. */
export function metaAt(S: Seed, ageDays: number, by?: Person): Omit<T.BaseEntity, 'id'> {
  return { customerId: CUSTOMER, createdAt: S.daysAgo(ageDays), updatedAt: S.daysAgo(Math.max(1, Math.round(ageDays / 5))), createdBy: by?.name ?? 'System Seed', createdById: by?.id ?? 'system', isDeleted: false };
}
/** Deterministic identifiers derived from a counter. */
const serialOf = (n: number) => ((n * 2654435761) >>> 0).toString(36).toUpperCase().padStart(8, '7').slice(-8);
const macOf = (n: number) => ['02', ...[24, 16, 8, 0].map(s => ((n >>> s) & 255).toString(16).padStart(2, '0')), ((n * 31) & 255).toString(16).padStart(2, '0')].join(':').toUpperCase();

interface Tpl { kind: E.ComponentKind; name: string; label: string; iface?: string; mgmt?: boolean; consoleType?: E.ConsoleType; ppType?: E.PowerPortType; maxDrawW?: number; allocDrawW?: number }
interface LegacySpec { mfr: string; platform: E.Platform; airflow: E.Airflow; weight: number; fullDepth: boolean; fullPorts: boolean; desc: string; os?: string; psu: string; fan?: string; tpls: Tpl[] }
/** Port sets of the previous-generation models (the fleet module only cloned a current type). */
const LEGACY: Record<string, LegacySpec> = {
  'Nexus 3172PQ': { mfr: 'Cisco', platform: 'NX-OS', airflow: 'front-to-rear', weight: 9, fullDepth: false, fullPorts: true, os: 'NX-OS 9.3(10)', psu: 'N2200-PAC-400W', fan: 'NXA-FAN-30CFM-F', desc: '48 × 10G SFP+ and 6 × 40G QSFP+ top-of-rack switch · previous generation, end of life', tpls: [
    { kind: 'interface', name: 'Ethernet1/[1-48]', label: 'Server-facing', iface: '10GBASE-X SFP+' },
    { kind: 'interface', name: 'Ethernet1/[49-54]', label: 'Uplink', iface: '40GBASE-X QSFP+' },
    { kind: 'interface', name: 'mgmt0', label: 'Management', iface: '1000BASE-T', mgmt: true },
    { kind: 'console', name: 'console', label: 'Console', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PSU[1-2]', label: 'Power supply', ppType: 'AC', maxDrawW: 400, allocDrawW: 290 }] },
  'QFX5100-48S': { mfr: 'Juniper', platform: 'Junos', airflow: 'front-to-rear', weight: 10, fullDepth: false, fullPorts: false, os: 'Junos 21.4R3', psu: 'JPSU-650W-AC-AFO', fan: 'QFX5100-FAN-AFO', desc: '48 × 10G SFP+ and 6 × 40G QSFP+ top-of-rack switch · previous generation, end of life', tpls: [
    { kind: 'interface', name: 'xe-0/0/[0-47]', label: 'Server-facing', iface: '10GBASE-X SFP+' },
    { kind: 'interface', name: 'et-0/0/[48-53]', label: 'Uplink', iface: '40GBASE-X QSFP+' },
    { kind: 'interface', name: 'em0', label: 'Management', iface: '1000BASE-T', mgmt: true },
    { kind: 'console', name: 'con', label: 'Console', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PEM[0-1]', label: 'Power entry', ppType: 'AC', maxDrawW: 650, allocDrawW: 310 }] },
  'PowerEdge R740': { mfr: 'Dell', platform: 'Linux', airflow: 'front-to-rear', weight: 28, fullDepth: true, fullPorts: true, psu: 'PWR-750W (R740)', desc: '2U dual-socket server · previous generation, out of warranty', tpls: [
    { kind: 'interface', name: 'eno[1-2]', label: 'rNDC 10G', iface: '10GBASE-X SFP+' },
    { kind: 'interface', name: 'eno[3-4]', label: 'rNDC 1G', iface: '1000BASE-T' },
    { kind: 'interface', name: 'idrac', label: 'iDRAC', iface: '1000BASE-T', mgmt: true },
    { kind: 'console', name: 'iDRAC console', label: 'Out-of-band', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PSU[1-2]', label: 'Power supply', ppType: 'IEC C14', maxDrawW: 750, allocDrawW: 495 }] },
  'ProLiant DL380 Gen10': { mfr: 'HPE', platform: 'Linux', airflow: 'front-to-rear', weight: 27, fullDepth: true, fullPorts: true, psu: '865414-B21', desc: '2U storage server · previous generation, out of warranty', tpls: [
    { kind: 'interface', name: 'eno[1-4]', label: 'LOM 1G', iface: '1000BASE-T' },
    { kind: 'interface', name: 'ens1f[0-1]', label: 'FlexibleLOM 10G', iface: '10GBASE-X SFP+' },
    { kind: 'interface', name: 'ilo', label: 'iLO', iface: '1000BASE-T', mgmt: true },
    { kind: 'console', name: 'iLO console', label: 'Out-of-band', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PSU[1-2]', label: 'Power supply', ppType: 'IEC C14', maxDrawW: 800, allocDrawW: 500 }] },
};

export function seedRealism(S: Seed): void {
  const R = new Realism(S);
  R.legacyFleet();
  R.dallasPhaseOne();
  R.ashburnHallThree();
  R.dublinLeaves();
  R.plant();
  R.circuits();
  R.commercial();
  R.history();
  for (const c of S.customers) c.revenueMonthly = S.services.filter(s => s.customerRef === c.id).reduce((a, s) => a + s.revenueMonthly, 0);
}

class Realism {
  readonly S: Seed;
  private seq = 0;
  private cabled = new Set<string>();
  constructor(S: Seed) { this.S = S; for (const c of S.cables) { this.cabled.add(c.aComponentId); this.cabled.add(c.bComponentId); } }

  dc(code: string): T.DataCenter { return this.S.dataCenters.find(d => d.code === code) as T.DataCenter; }
  comps(devId: string): T.DeviceComponent[] { return this.S.compsByDevice.get(devId) ?? []; }
  dataPorts(devId: string, label?: RegExp): T.DeviceComponent[] { return this.comps(devId).filter(c => c.kind === 'interface' && !c.mgmtOnly && c.ifaceType !== 'Virtual' && (!label || label.test(c.label ?? ''))); }
  freePort(devId: string, label?: RegExp): T.DeviceComponent | undefined { return this.dataPorts(devId, label).find(c => !this.cabled.has(c.id) && c.enabled !== false); }

  /** A cable between two components; both ends are marked used. */
  cable(aDev: T.Device, a: T.DeviceComponent, bDev: T.Device, b: T.DeviceComponent, type: E.CableType, ageDays: number): T.Cable {
    const S = this.S; const id = S.nid('CBL'); this.seq++;
    const color: Record<E.CableType, string> = { Cat6: 'blue', Cat6a: 'blue', 'MMF-OM4': 'aqua', 'SMF-OS2': 'yellow', DAC: 'black', 'Power-C13': 'grey', 'Power-C19': 'red' };
    const c: T.Cable = { id, cblId: id, ...metaAt(S, ageDays), status: 'Active', cableType: type, label: `${aDev.name}:${a.name} ↔ ${bDev.name}:${b.name}`, color: color[type], lengthM: type === 'DAC' ? 2 + (this.seq % 2) : type === 'SMF-OS2' ? 40 + (this.seq % 7) * 10 : 5 + (this.seq % 5) * 3, aKind: a.kind, aComponentId: a.id, aDeviceId: aDev.id, bKind: b.kind, bComponentId: b.id, bDeviceId: bDev.id };
    S.cables.push(c); this.cabled.add(a.id); this.cabled.add(b.id);
    return c;
  }

  /** Components for a new device from its type's templates (compact port set unless `full`). */
  addComponents(dev: T.Device, full: boolean, moduleTypeId?: string, slot?: string, moduleId?: string): void {
    const S = this.S;
    const tpls = S.componentTemplates.filter(t => moduleTypeId ? t.moduleTypeId === moduleTypeId : t.deviceTypeId === dev.deviceTypeId);
    const list = S.compsByDevice.get(dev.id) ?? [];
    for (const t of tpls) {
      const all = expandNames(slot ? t.namePattern.replace('{slot}', slot) : t.namePattern);
      const names = full || t.kind !== 'interface' || t.mgmtOnly ? all : all.slice(0, 4);
      for (const name of names) {
        const id = S.nid('DCOMP'); this.seq++;
        const c: T.DeviceComponent = { id, dcompId: id, ...metaAt(S, 200), deviceId: dev.id, kind: t.kind, name, label: t.label, moduleId };
        if (t.kind === 'interface') {
          const uplink = /uplink|fabric|line-card/i.test(t.label ?? '') && !t.mgmtOnly;
          Object.assign(c, { ifaceType: t.ifaceType, enabled: true, mgmtOnly: !!t.mgmtOnly, speedMbps: t.speedMbps, duplex: 'auto', mtu: t.mtu ?? 1500, macAddress: t.ifaceType === 'Virtual' ? undefined : macOf(this.seq + 7_000_000), mode: uplink ? 'Tagged' : 'Access', poeType: 'None' });
        }
        list.push(c); S.deviceComponents.push(c);
      }
    }
    S.compsByDevice.set(dev.id, list);
  }

  /** A new device mirrored from a catalogue model. */
  device(o: { dc: T.DataCenter; rack?: T.Rack; model: string; name: string; position?: number; drawW: number; ageDays: number; owner: string; full?: boolean }): T.Device {
    const S = this.S;
    const am = S.assetModels.find(m => m.model === o.model) as T.AssetModel;
    const dtId = S.dtIdByModel[o.model];
    const dt = S.deviceTypes.find(d => d.id === dtId) as T.DcimDeviceType;
    const id = S.nid('ASSET'); this.seq++;
    const warranty = S.contracts.find(c => c.type === 'Warranty' && c.status === 'Active' && S.vendors.find(v => v.id === c.vendorId)?.name.toLowerCase().startsWith(am.manufacturer.toLowerCase().split(' ')[0]));
    const dev: T.Device = {
      id, devcId: id, ...metaAt(S, o.ageDays), name: o.name, deviceTypeId: dtId, rackId: o.rack?.id, dataCenterId: o.dc.id, position: o.rack ? o.position : undefined, status: 'Active',
      serial: serialOf(this.seq + 9_000_000), assetTag: `AT-${500000 + this.seq}`, face: dt.role === 'PDU' ? 'rear' : 'front',
      deviceRoleId: S.deviceRoles.find(r => r.name === dt.role)?.id, platformId: S.platforms.find(p => p.name === dt.platform)?.id, airflow: dt.airflow,
      hostname: o.name, manufacturer: am.manufacturer, model: am.model, category: am.category, heightU: dt.uHeight, powerDrawW: o.drawW, ratedThermalW: am.maxPowerW, weightKg: am.weightKg,
      lifecycleState: 'Active', ownerTeam: o.owner, commissionedDate: S.daysAgo(o.ageDays), assetModelId: am.id, warrantyContractId: warranty?.id, tags: [],
    };
    S.devices.push(dev);
    this.addComponents(dev, o.full ?? (am.category === 'Switch' || am.category === 'Router' || am.category === 'Firewall'));
    return dev;
  }

  /** Rack figures follow what is installed in them (as the DCIM post-pass does). */
  rollUpRacks(rackIds: Set<string>): void {
    const S = this.S;
    for (const r of S.racks.filter(x => rackIds.has(x.id))) {
      const kit = S.devices.filter(d => d.rackId === r.id && !d.parentDeviceId);
      const usedU = Math.min(r.heightU, kit.reduce((a, d) => a + (d.heightU ?? 0), 0));
      const kw = r1(kit.filter(d => d.status === 'Active' || d.status === 'Faulty').reduce((a, d) => a + (d.powerDrawW ?? 0), 0) / 1000);
      r.usedU = usedU; r.availableU = r.heightU - usedU; r.currentWeightKg = r0(kit.reduce((a, d) => a + (d.weightKg ?? 0), 0) + 120);
      r.currentPowerKw = kw; r.powerUtilizationPct = S.pct(kw, r.maxPowerKw); r.thermalDensityKwPerRack = kw;
      if (r.status === 'Active' && r.availableU <= 2) r.status = 'Full';
    }
  }

  // ───────────────────────────────────────────────────────── previous-generation fleet
  legacyFleet(): void {
    const S = this.S;
    const mfrId = (n: string) => S.manufacturers.find(m => m.name === n)?.id;
    const platId = (n: string) => S.platforms.find(p => p.name === n)?.id;
    const drop = new Set<string>();
    for (const [model, spec] of Object.entries(LEGACY)) {
      const dt = S.deviceTypes.find(d => d.model === model);
      if (!dt) continue;
      const slug = model.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      Object.assign(dt, { manufacturer: spec.mfr, manufacturerId: mfrId(spec.mfr), platform: spec.platform, defaultPlatformId: platId(spec.platform), airflow: spec.airflow, weight: spec.weight, weightUnit: 'kg', isFullDepth: spec.fullDepth, description: spec.desc, frontImage: `/device-types/${slug}-front.svg`, rearImage: `/device-types/${slug}-rear.svg` });
      if (!S.componentTemplates.some(t => t.deviceTypeId === dt.id)) {
        for (const t of spec.tpls) {
          const id = S.nid('CTPL');
          S.componentTemplates.push({ id, ctplId: id, ...metaAt(S, 900), deviceTypeId: dt.id, kind: t.kind, namePattern: t.name, label: t.label, description: `${t.label} (${t.kind})`, ifaceType: t.iface, mgmtOnly: t.kind === 'interface' ? !!t.mgmt : undefined, poeType: t.kind === 'interface' ? 'None' : undefined, rfRole: t.kind === 'interface' ? 'None' : undefined, enabled: true, speedMbps: t.iface ? SPEED[t.iface] : undefined, duplex: t.kind === 'interface' ? 'auto' : undefined, mtu: t.kind === 'interface' ? 1500 : undefined, consoleType: t.consoleType, powerPortType: t.ppType, maxDrawW: t.maxDrawW, allocatedDrawW: t.allocDrawW } as T.ComponentTemplate);
        }
      }
      // Target port list in template order: data ports per template, then management, console and power.
      const target = spec.tpls.map(t => ({ t, names: expandNames(t.name) }));
      for (const dev of S.devices.filter(d => d.model === model)) {
        Object.assign(dev, { platformId: platId(spec.platform), airflow: spec.airflow, weightKg: spec.weight, deviceTypeId: dt.id });
        const md = S.managedDevices.find(m => m.id === dev.id);
        if (md) Object.assign(md, { vendor: spec.mfr, model, osVersion: spec.os ?? md.osVersion });
        for (const it of S.inventoryItems.filter(x => x.deviceId === dev.id)) {
          const role = S.inventoryItemRoles.find(r => r.id === it.roleId)?.name;
          if (role === 'PSU') Object.assign(it, { manufacturer: spec.mfr, partNumber: spec.psu });
          else if (role === 'Fan' && spec.fan) Object.assign(it, { manufacturer: spec.mfr, partNumber: spec.fan });
          else if (role === 'Controller' || role === 'CPU' || role === 'DIMM') Object.assign(it, { manufacturer: spec.mfr === 'Dell' || spec.mfr === 'HPE' ? (role === 'Controller' ? spec.mfr : it.manufacturer) : it.manufacturer });
        }
        const existing = this.comps(dev.id);
        const renamed = new Map<string, string>();
        const fullSet = spec.fullPorts;
        for (const kind of ['interface-data', 'interface-mgmt', 'console', 'power-port'] as const) {
          const pick = (c: T.DeviceComponent) => kind === 'interface-data' ? c.kind === 'interface' && !c.mgmtOnly : kind === 'interface-mgmt' ? c.kind === 'interface' && !!c.mgmtOnly : c.kind === kind;
          const tplPick = (t: Tpl) => kind === 'interface-data' ? t.kind === 'interface' && !t.mgmt : kind === 'interface-mgmt' ? t.kind === 'interface' && !!t.mgmt : t.kind === kind;
          const have = existing.filter(pick);
          const want: { t: Tpl; name: string }[] = target.filter(x => tplPick(x.t)).flatMap(x => (fullSet || kind !== 'interface-data' ? x.names : x.names.slice(0, 4)).map(name => ({ t: x.t, name })));
          // Same label first (server-facing to server-facing, uplink to uplink), then by position.
          const pairs: [T.DeviceComponent, { t: Tpl; name: string }][] = [];
          const freeWant = [...want]; const freeHave: T.DeviceComponent[] = [];
          for (const c of have) {
            const role = /uplink/i.test(c.label ?? '') ? 'Uplink' : /server/i.test(c.label ?? '') ? 'Server-facing' : '';
            const k = role ? freeWant.findIndex(w => w.t.label === role) : -1;
            if (k >= 0) pairs.push([c, freeWant.splice(k, 1)[0]]); else freeHave.push(c);
          }
          for (const c of freeHave) { const w = freeWant.shift(); if (w) pairs.push([c, w]); else if (!this.cabled.has(c.id)) drop.add(c.id); }
          for (const [c, w] of pairs) {
            if (c.name !== w.name) renamed.set(c.name, w.name);
            c.name = w.name; c.label = w.t.label;
            if (w.t.kind === 'interface') Object.assign(c, { ifaceType: w.t.iface, speedMbps: w.t.iface ? SPEED[w.t.iface] : undefined, mode: /uplink/i.test(w.t.label) ? 'Tagged' : 'Access', mtu: 1500, wwn: undefined });
          }
          for (const w of freeWant) {
            const id = S.nid('DCOMP'); this.seq++;
            const c: T.DeviceComponent = { id, dcompId: id, ...metaAt(S, 900), deviceId: dev.id, kind: w.t.kind, name: w.name, label: w.t.label };
            if (w.t.kind === 'interface') Object.assign(c, { ifaceType: w.t.iface, enabled: true, mgmtOnly: !!w.t.mgmt, speedMbps: w.t.iface ? SPEED[w.t.iface] : undefined, duplex: 'auto', mtu: 1500, macAddress: macOf(this.seq + 5_000_000), mode: /uplink/i.test(w.t.label) ? 'Tagged' : 'Access', poeType: 'None' });
            existing.push(c); S.deviceComponents.push(c);
          }
        }
        S.compsByDevice.set(dev.id, existing.filter(c => !drop.has(c.id)));
        // NMS interfaces and cable labels follow the new port names.
        for (const f of S.interfaces.filter(x => x.deviceId === dev.id)) {
          const nn = renamed.get(f.name); if (nn) f.name = nn;
          const comp = existing.find(c => c.name === f.name); if (comp?.speedMbps) f.speedGbps = Math.max(1, Math.round(comp.speedMbps / 1000));
        }
        for (const c of S.cables.filter(x => x.aDeviceId === dev.id || x.bDeviceId === dev.id)) {
          const a = S.deviceComponents.find(x => x.id === c.aComponentId); const b = S.deviceComponents.find(x => x.id === c.bComponentId);
          const ad = S.devices.find(x => x.id === c.aDeviceId); const bd = S.devices.find(x => x.id === c.bDeviceId);
          if (a && b && ad && bd && (c.label ?? '').includes('↔')) c.label = `${ad.name}:${a.name} ↔ ${bd.name}:${b.name}`;
          if (c.cableType === 'DAC' && (a?.speedMbps === 1000 || b?.speedMbps === 1000)) c.cableType = 'Cat6';
        }
      }
    }
    if (drop.size) S.deviceComponents = S.deviceComponents.filter(c => !drop.has(c.id));
  }

  // ───────────────────────────────────────────────────────── Dallas HDC-1 phase 1
  dallasPhaseOne(): void {
    const S = this.S; const dc = this.dc('DAL-HDC1'); if (!dc) return;
    const halls = S.halls.filter(h => h.dataCenterId === dc.id);
    const live = halls.filter(h => h.name === 'Hall 1' || h.name === 'Hall 2');
    const fitting = halls.filter(h => !live.includes(h));
    dc.status = 'Operational'; dc.commissionedDate = S.daysAgo(165);
    dc.notes = `Phase 1 in service: Halls 1 and 2 live since ${new Date(S.daysAgo(165)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}. Halls 3 and 4 are being fitted out under the DC4 programme. 20 MW IT at full build.`;
    live.forEach(h => { h.status = 'Live'; });
    fitting.forEach(h => { h.status = 'Fitting'; h.notes = `${h.notes ?? ''} · Fit-out in progress (DC4 programme); racks positioned, not yet energised`.replace(/^ · /, ''); });
    const code = dc.code.toLowerCase();
    const owner = 'Platform';
    const touched = new Set<string>();
    const created: T.Device[] = [];
    let k = 0;
    const tors = new Map<string, T.Device>();
    for (const h of live) {
      const racks = S.racks.filter(r => r.hallId === h.id);
      for (const r of racks) {
        k++;
        r.status = k % 11 === 10 ? 'Reserved' : k % 17 === 16 ? 'Planned' : 'Active';
        r.notes = r.status === 'Reserved' ? 'Held for the phase 2 GPU expansion' : r.status === 'Planned' ? 'Position allocated; rack not yet delivered' : undefined;
        touched.add(r.id);
        if (r.status !== 'Active') continue;
        const util = 0.5 + ((k * 13) % 30) / 100;
        const target = r.maxPowerKw * util * 1000;
        // Top-of-rack switch at the top unit; payload from the bottom up.
        const tor = this.device({ dc, rack: r, model: '7050X3-48YC8', name: `${code}-h${h.name.slice(-1)}-tor-${r.name.toLowerCase()}`, position: r.heightU, drawW: 380, ageDays: 170 + (k % 20), owner: 'NetEng', full: true });
        created.push(tor); tors.set(r.id, tor);
        if (r.purpose === 'Network') continue;
        const model = r.purpose === 'GPU' ? 'PowerEdge XE9680' : r.purpose === 'Storage' ? 'FlashArray //X70' : 'PowerEdge R760';
        const am = S.assetModels.find(m => m.model === model) as T.AssetModel;
        const maxN = Math.floor((r.heightU - 2) / am.heightU);
        const n = Math.max(1, Math.min(maxN, r.purpose === 'GPU' ? Math.round(target / 9500) : Math.ceil(target / (am.typicalPowerW * 1.05))));
        const each = Math.round(Math.min(am.maxPowerW, Math.max(am.typicalPowerW * 0.6, target / n)));
        for (let i = 0; i < n; i++) {
          const prefix = am.category === 'GPU-Node' ? 'gpu' : am.category === 'Storage' ? 'sto' : 'srv';
          created.push(this.device({ dc, rack: r, model, name: `${code}-${prefix}-${String(created.length + 1).padStart(4, '0')}`, position: 1 + i * am.heightU, drawW: each, ageDays: 160 + ((k + i) % 25), owner }));
        }
      }
    }
    // Fabric: two spines per live hall in its network racks, two cores, two firewalls and the console server.
    const netRacks = (h: T.Hall) => S.racks.filter(r => r.hallId === h.id && r.purpose === 'Network' && r.status === 'Active');
    const spinesBy = new Map<string, T.Device[]>();
    for (const h of live) {
      const nr = netRacks(h);
      const sp = [0, 1].map(i => this.device({ dc, rack: nr[i % Math.max(1, nr.length)], model: 'Nexus 9336C-FX2', name: `${code}-h${h.name.slice(-1)}-spine-0${i + 1}`, position: r0(nr[i % Math.max(1, nr.length)]?.heightU ?? 48) - 2 - i, drawW: 480, ageDays: 180, owner: 'NetEng' }));
      spinesBy.set(h.id, sp); created.push(...sp);
    }
    const nr1 = netRacks(live[0]);
    const cores = [0, 1].map(i => this.device({ dc, rack: nr1[(i + 2) % nr1.length], model: 'MX480', name: `${code}-core-0${i + 1}`, position: 1, drawW: 1600, ageDays: 190, owner: 'NetEng' }));
    const mt = S.moduleTypes.find(m => m.model === 'MPC10E-15C Line Card');
    for (const core of cores) {
      if (!mt) break;
      const modId = S.nid('MOD');
      S.modules.push({ id: modId, modId, ...metaAt(S, 190), deviceId: core.id, moduleBayName: 'Slot-1', moduleTypeId: mt.id, notes: 'MPC10E-15C Line Card in Slot-1' } as T.Module);
      this.addComponents(core, true, mt.id, '1', modId);
    }
    const fws = [0, 1].map(i => this.device({ dc, rack: nr1[(i + 4) % nr1.length], model: 'PA-5450', name: `${code}-fw-0${i + 1}`, position: 10, drawW: 1100, ageDays: 190, owner: 'Security' }));
    const oob = this.device({ dc, rack: nr1[0], model: 'OM2248 Console Server', name: `${code}-oob-01`, position: 15, drawW: 50, ageDays: 200, owner: 'NetEng' });
    created.push(...cores, ...fws, oob);
    for (const d of [...cores, ...fws, oob]) if (d.rackId) touched.add(d.rackId);
    // Cables: servers to their top-of-rack switch, top-of-rack to the hall spines, spines and firewalls to the cores.
    for (const dev of created.filter(d => d.category === 'Server' || d.category === 'Storage')) {
      const tor = tors.get(dev.rackId ?? ''); if (!tor) continue;
      const sp = this.freePort(dev.id); const tp = this.freePort(tor.id, /server/i);
      if (sp && tp) this.cable(dev, sp, tor, tp, 'DAC', 160);
    }
    for (const h of live) {
      const sp = spinesBy.get(h.id) ?? [];
      for (const tor of [...tors.values()].filter(t => S.racks.find(r => r.id === t.rackId)?.hallId === h.id)) {
        sp.forEach(spine => { const a = this.freePort(tor.id, /uplink/i); const b = this.freePort(spine.id); if (a && b) this.cable(tor, a, spine, b, 'MMF-OM4', 165); });
      }
      sp.forEach(spine => cores.forEach(core => { const a = this.freePort(spine.id); const b = this.freePort(core.id); if (a && b) this.cable(spine, a, core, b, 'SMF-OS2', 170); }));
    }
    fws.forEach((fw, i) => { const a = this.freePort(fw.id); const b = this.freePort(cores[i].id); if (a && b) this.cable(fw, a, cores[i], b, 'MMF-OM4', 170); });
    this.rollUpRacks(touched);
    // Rack power feeds of live racks are energised; fitting halls stay planned.
    for (const f of S.powerFeeds.filter(x => x.rackId && touched.has(x.rackId))) { const rk = S.racks.find(r => r.id === f.rackId); if (f.status === 'Planned' && rk && rk.status !== 'Planned') f.status = 'Active'; }
    // Compute roll-up, carrier circuits and the services the halls now carry.
    const cr = S.computeResources.find(c => c.scopeType === 'DataCenter' && c.scopeId === dc.id);
    if (cr) {
      const srv = created.filter(d => d.category === 'Server').length; const gpu = created.filter(d => d.category === 'GPU-Node').length; const sto = created.filter(d => d.category === 'Storage').length;
      Object.assign(cr, { cpuCoresTotal: srv * 64 + gpu * 112, cpuCoresUsed: r0((srv * 64 + gpu * 112) * 0.62), memoryGbTotal: srv * 512 + gpu * 2048, memoryGbUsed: r0((srv * 512 + gpu * 2048) * 0.58), storageTbTotal: sto * 360, storageTbUsed: r0(sto * 360 * 0.47), gpuCountTotal: gpu * 8, gpuCountUsed: r0(gpu * 8 * 0.7), networkGbpsTotal: tors.size * 200, networkGbpsUsed: r0(tors.size * 200 * 0.35) });
    }
    S.circuits.forEach(c => {
      const a = S.circuitTerminations.find(t => t.circuitId === c.id && t.side === 'A');
      if (a?.dataCenterId !== dc.id) return;
      const idx = S.circuitTerminations.filter(t => t.side === 'A' && t.dataCenterId === dc.id).indexOf(a);
      if (idx <= 1) { Object.assign(c, { status: 'Active', installDate: S.daysAgo(200), provisionedAt: S.daysAgo(210), testedAt: S.daysAgo(185), activatedAt: S.daysAgo(170), notes: undefined }); a.deviceId = cores[idx % 2].id; a.description = `A-end on ${cores[idx % 2].name}`; }
      else if (c.status === 'Planned') Object.assign(c, { status: 'Provisioning', provisionedAt: S.daysAgo(30), notes: 'Ordered for phase 2; awaiting cross-connect' });
    });
    // The DC4 programme is now the phase 2 build; its phase projects say what they deliver.
    const dc4 = S.programs.find(p => p.name.startsWith('DC4 '));
    const PHASE_NAMES: [string, string][] = [['Master Planning & Feasibility', 'Phase 2 master plan'], ['Permits & Site Construction', 'Permits and construction (phase 2 block)'], ['MEP & Plant Installation', 'Plant expansion: UPS modules 4 and 5, chiller 4'], ['Network Backbone', 'Network backbone extension'], ['White-space Fit-out', 'Halls 3 and 4 white-space fit-out'], ['First Hall Fit-out & RFS', 'Hall 3 fit-out and ready-for-service']];
    for (const p of S.projects.filter(x => dc4 && x.programId === dc4.id)) for (const [a, b] of PHASE_NAMES) if (p.name.endsWith(a)) p.name = p.name.replace(a, b);
    const hosts = created.filter(d => ['Server', 'GPU-Node', 'Storage'].includes(d.category ?? ''));
    const kinds = [{ type: 'Kubernetes', unit: 'vCPU', qty: 256, rate: 34 }, { type: 'VM', unit: 'vCPU', qty: 64, rate: 38 }, { type: 'GPU cluster', unit: 'GPU', qty: 32, rate: 2100 }, { type: 'Storage volume', unit: 'TB', qty: 100, rate: 24 }, { type: 'Managed DB', unit: 'vCPU', qty: 32, rate: 60 }];
    for (let i = 0; i < 10 && hosts.length; i++) {
      const t = kinds[i % kinds.length];
      const host = t.type === 'GPU cluster' ? hosts.find((h, j) => h.category === 'GPU-Node' && j >= i) ?? hosts[i] : t.type === 'Storage volume' ? hosts.find((h, j) => h.category === 'Storage' && j >= i) ?? hosts[i] : hosts.filter(h => h.category === 'Server')[i * 3] ?? hosts[i];
      const cust = S.customers[(i * 7 + 3) % S.customers.length];
      const tor = tors.get(host.rackId ?? '');
      const hall = S.racks.find(r => r.id === host.rackId)?.hallId ?? '';
      const path = [host.id, ...(tor ? [tor.id] : []), ...(spinesBy.get(hall) ?? []).map(s => s.id)];
      const cableIds = S.cables.filter(c => (c.aDeviceId === host.id && c.bDeviceId === tor?.id) || (tor && c.aDeviceId === tor.id && (spinesBy.get(hall) ?? []).some(s => s.id === c.bDeviceId))).map(c => c.id);
      const id = S.nid('SVC');
      const revenue = r0(t.qty * t.rate * (cust.premium ? 1.25 : 1));
      S.services.push({ id, svcId: id, ...metaAt(S, 150 - i * 5), name: `${t.type} · ${cust.name}`, type: t.type, customerRef: cust.id, dataCenterId: dc.id, deviceId: host.id, rackId: host.rackId, pathDeviceIds: path, cableIds, bandwidthMbps: 25_000, utilPct: 35 + (i * 7) % 45, status: 'Active', slaTarget: cust.premium ? 99.99 : 99.9, uptime30d: 99.98, growthPct: 2 + (i % 5), revenueMonthly: revenue, critical: cust.premium && i % 2 === 0, qty: t.qty, unit: t.unit, notes: 'Phase 1 production workload' } as T.Service);
    }
  }

  // ───────────────────────────────────────────────────────── Ashburn DC-1: shell Hall 3
  ashburnHallThree(): void {
    const S = this.S; const dc = this.dc('ASH-DC1'); if (!dc) return;
    const halls = S.halls.filter(h => h.dataCenterId === dc.id);
    const old3 = halls.find(h => h.name === 'Hall 3');
    if (!old3 || halls.some(h => h.status === 'Shell')) return;
    old3.name = 'Hall 4';
    const id = S.nid('HALL');
    const hall: T.Hall = { id, hallId: id, ...metaAt(S, 700), floorId: old3.floorId, dataCenterId: dc.id, name: 'Hall 3', gridCols: 12, gridRows: 14, designPowerKw: 2000, rackCount: 0, rackCapacity: 168, utilizationPct: 0, status: 'Shell', areaSqm: 440, notes: 'Built shell: raised floor, fire detection, lighting and security. No power distribution, cooling units or racks fitted yet. Held for the private-cloud expansion (2 MW at 12 kW per rack).' };
    S.halls.push(hall);
    const fl = S.floors.find(f => f.id === old3.floorId); if (fl) fl.hallCount += 1;
    // The central plant was built for the full 3 MW; halls add PDUs, CRAH units and racks.
    dc.designPowerKw = 3000; dc.designCoolingKw = 3600;
    dc.notes = 'Enterprise data centre · chilled water · N+1. Central UPS, generators and chillers were built for the full 3 MW; Halls 1, 2 and 4 are live and Hall 3 is a shell.';
  }

  // ───────────────────────────────────────────────────────── Dublin CO-1 Nexus leaves
  dublinLeaves(): void {
    const S = this.S; const dc = this.dc('DUB-CO1'); if (!dc) return;
    const leaves = S.devices.filter(d => d.dataCenterId === dc.id && d.model === 'Nexus 3172PQ' && d.rackId);
    if (!leaves.length) return;
    const rackOf = (d: T.Device) => S.racks.find(r => r.id === d.rackId) as T.Rack;
    const servers = S.devices.filter(d => d.dataCenterId === dc.id && d.rackId && (d.category === 'Server' || d.category === 'Storage') && d.status !== 'Inactive' && d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed' && !d.parentDeviceId);
    const byLeafRack = new Map<string, T.Device[]>();
    for (const l of leaves) byLeafRack.set(l.rackId as string, [...(byLeafRack.get(l.rackId as string) ?? []), l]);
    const servedBy = new Map<string, T.Device[]>();
    const taken = new Set<string>();
    // Each leaf pair serves the servers in its own rack, then the nearest racks in its row (end-of-row
    // cabling) until it carries at least four servers. Every server is dual-homed across the pair.
    for (const [rackId, pair] of byLeafRack) {
      const rk = S.racks.find(r => r.id === rackId) as T.Rack;
      const dist = (d: T.Device) => { const r = rackOf(d); return r.id === rk.id ? -1 : r.rowId === rk.rowId ? Math.abs(r.gridX - rk.gridX) : 100 + Math.abs(r.gridY - rk.gridY) * 10 + Math.abs(r.gridX - rk.gridX); };
      const own = servers.filter(d => d.rackId === rk.id && !taken.has(d.id));
      const near = servers.filter(d => d.rackId !== rk.id && !taken.has(d.id) && rackOf(d).hallId === rk.hallId).sort((a, b) => dist(a) - dist(b));
      const pick = [...own, ...near.slice(0, Math.max(0, 4 - own.length))];
      for (const s of pick) {
        taken.add(s.id);
        pair.forEach((leaf, i) => {
          const sp = this.dataPorts(s.id).filter(c => !this.cabled.has(c.id))[0];
          const lp = this.freePort(leaf.id, /server/i);
          if (!sp || !lp) return;
          this.cable(s, sp, leaf, lp, sp.speedMbps === 1000 ? 'Cat6' : rackOf(s).id === rk.id ? 'DAC' : 'MMF-OM4', 700 + i);
          servedBy.set(leaf.id, [...(servedBy.get(leaf.id) ?? []), s]);
        });
      }
    }
    // Uplinks to the hall spines (40G QSFP+ into the spines' QSFP28 ports).
    const spines = S.devices.filter(d => d.dataCenterId === dc.id && /-spine-0[12]$/.test(d.name));
    for (const leaf of leaves) spines.slice(0, 2).forEach(sp => { const a = this.freePort(leaf.id, /uplink/i); const b = this.freePort(sp.id); if (a && b) this.cable(leaf, a, sp, b, 'MMF-OM4', 720); });
    // Services hosted on the servers behind each leaf pair.
    const kinds = [{ type: 'Managed hosting', unit: 'vCPU', qty: 64, rate: 28 }, { type: 'Virtual firewall (VNF)', unit: 'vCPU', qty: 16, rate: 45 }, { type: 'Broadband policy (vBNG)', unit: 'Mbps', qty: 20_000, rate: 0.25 }, { type: 'IPTV head-end', unit: 'Mbps', qty: 5_000, rate: 0.6 }];
    let i = 0;
    const seen = new Set<string>();
    for (const leaf of leaves) {
      const host = (servedBy.get(leaf.id) ?? []).find(s => !seen.has(s.id));
      if (!host) continue;
      seen.add(host.id);
      const pair = S.devices.filter(d => d.model === 'Nexus 3172PQ' && S.cables.some(c => (c.aDeviceId === host.id && c.bDeviceId === d.id)));
      const up = S.cables.filter(c => pair.some(p => p.id === c.aDeviceId) && spines.some(sp => sp.id === c.bDeviceId));
      const down = S.cables.filter(c => c.aDeviceId === host.id && pair.some(p => p.id === c.bDeviceId));
      const t = kinds[i % kinds.length];
      const cust = S.customers[(i * 5 + 2) % S.customers.length];
      const id = S.nid('SVC');
      S.services.push({ id, svcId: id, ...metaAt(S, 400 - i * 7), name: `${t.type} · ${cust.name}`, type: t.type, customerRef: cust.id, dataCenterId: dc.id, deviceId: host.id, ifName: this.comps(host.id).find(c => c.id === down[0]?.aComponentId)?.name, rackId: host.rackId, pathDeviceIds: [host.id, ...pair.map(p => p.id), ...new Set(up.map(c => c.bDeviceId))], cableIds: [...down, ...up].map(c => c.id), bandwidthMbps: t.unit === 'Mbps' ? t.qty : 10_000, utilPct: 30 + (i * 11) % 50, status: 'Active', slaTarget: cust.premium ? 99.99 : 99.9, uptime30d: cust.premium ? 99.99 : 99.95, growthPct: 1 + (i % 4), revenueMonthly: r0(t.qty * t.rate * (cust.premium ? 1.25 : 1)), critical: cust.premium && i % 2 === 0, qty: t.qty, unit: t.unit, notes: `Served through the Nexus 3172PQ leaf pair ${pair.map(p => p.name).join(' / ')}` } as T.Service);
      i++;
    }
  }

  // ───────────────────────────────────────────────────────── power and cooling plant
  plant(): void {
    const S = this.S;
    const feedKw: Record<string, number> = {};
    // Feeds: each side carries the design facility load with 10% margin (single feed: the whole load).
    for (const dc of S.dataCenters) {
      const prof = dcTypeProfile(dc.dcTypeKey) as DcTypeProfile;
      const need = dc.designPowerKw * prof.pueTarget * 1.1;
      feedKw[dc.id] = dc.code === 'DUB-CO1' ? 700 : up(need, stepFor(need));
    }
    // Ashburn: one 33 kV campus substation; GPU-1's intake carries the campus spare.
    const ash = ['ASH-DC1', 'ASH-WHS1'].map(c => this.dc(c)).filter(Boolean);
    const gpu = this.dc('ASH-GPU1');
    if (gpu) feedKw[gpu.id] = ASH_CAMPUS_INTAKE_KW - ash.reduce((a, d) => a + feedKw[d.id], 0);
    for (const dc of S.dataCenters) {
      const prof = dcTypeProfile(dc.dcTypeKey) as DcTypeProfile;
      const pue = prof.pueTarget;
      const campus = S.dcCampus.get(dc.id) ?? '';
      const halls = S.halls.filter(h => h.dataCenterId === dc.id);
      for (const h of halls) { if (!h.status) h.status = h.rackCount > 0 ? 'Live' : 'Shell'; if (!h.areaSqm) h.areaSqm = r0(h.rackCapacity * (prof.highDensity ? 3 : 2.6)); }
      const racks = S.racks.filter(r => r.dataCenterId === dc.id);
      const itLoad = r1(racks.reduce((a, r) => a + (r.currentPowerKw || 0), 0));
      const builtKw = halls.filter(h => h.status === 'Live').reduce((a, h) => a + h.designPowerKw, 0);
      const dal = dc.code === 'DAL-HDC1';
      const basis = dc.code === 'ASH-DC1' ? dc.designPowerKw : Math.min(dc.designPowerKw, up(Math.max(builtKw * 1.15, itLoad * 1.3, 20), stepFor(builtKw)));
      const tierIV = dc.tier === 'Tier IV';
      const at = dc.commissionedDate ?? S.daysAgo(165);
      const ageDays = Math.max(30, Math.round((S.now - new Date(at).getTime()) / 864e5));

      // ── utility and transformers ──
      const feeds = S.utilityFeeds.filter(f => f.dataCenterId === dc.id);
      for (const f of feeds) {
        f.capacityKw = feedKw[dc.id];
        if (gpu && dc.id === gpu.id) { f.name = `Campus substation ${f.redundancyRole === 'A-side' ? 'A' : 'B'} (33 kV)`; f.notes = `Ashburn campus 33 kV intake, ${(ASH_CAMPUS_INTAKE_KW / 1000).toFixed(0)} MW per side contracted with ${f.provider} for the whole campus; this allocation carries GPU-1 and the spare held for Building C.`; }
        else f.notes = `${f.voltage >= 1000 ? 'HV' : 'LV'} intake · ${f.redundancyRole} · rated for ${dc.designPowerKw.toLocaleString('en-US')} kW IT at PUE ${pue} plus 10%`;
      }
      const xfmrs = S.transformers.filter(t => feeds.some(f => f.id === t.feedId));
      for (const t of xfmrs) {
        const f = feeds.find(x => x.id === t.feedId) as T.UtilityFeed;
        t.capacityKva = up(f.capacityKw / 0.95, f.capacityKw < 2000 ? 250 : f.capacityKw < 10_000 ? 500 : 2500);
        t.loadKw = r0((itLoad * pue) / Math.max(1, xfmrs.length));
        if (t.status === 'Maintenance' && dal) t.status = 'Operational';
      }

      // ── UPS / −48 V plant ──
      const ups = S.upsUnits.filter(u => u.dataCenterId === dc.id);
      if (ups.length) {
        const red = ups[0].redundancy;
        const aFeed = feeds.find(f => f.redundancyRole === 'A-side')?.id; const bFeed = feeds.find(f => f.redundancyRole === 'B-side')?.id ?? aFeed;
        const plan: { name: string; kw: number; feedId?: string }[] = [];
        if (red === '2N+1') { const x = up(basis / 2, 250); for (const side of ['A', 'B'] as const) for (let i = 1; i <= 3; i++) plan.push({ name: `UPS-${side}${i}`, kw: x, feedId: side === 'A' ? aFeed : bFeed }); }
        else if (red === '2N') { plan.push({ name: prof.dcPowerPlant ? ups[0].name : 'UPS A-side', kw: up(basis, stepFor(basis)), feedId: aFeed }, { name: prof.dcPowerPlant ? ups[1]?.name ?? ups[0].name : 'UPS B-side', kw: up(basis, stepFor(basis)), feedId: bFeed }); }
        else if (red === 'N') plan.push({ name: ups[0].name, kw: up(basis, stepFor(basis)), feedId: aFeed });
        else {
          const module = dal ? 1000 : 1500;
          const n = dal ? 3 : basis <= module ? 2 : Math.ceil(basis / module) + 1;
          const kw = dal || basis > module ? module : up(basis, stepFor(basis));
          for (let i = 1; i <= n; i++) plan.push({ name: prof.dcPowerPlant ? `DC Plant ${i} (−48V rectifiers + battery strings)` : `UPS-${i}${n > 2 ? ` (module ${i} of ${n})` : ''}`, kw, feedId: i % 2 === 1 ? aFeed : bFeed });
        }
        plan.forEach((p, i) => {
          let u = ups[i];
          if (!u) { const id = S.nid('UPS'); u = { ...ups[0], id, upsId: id, ...metaAt(S, ageDays), status: 'Operational' }; S.upsUnits.push(u); }
          u.name = p.name; u.capacityKw = p.kw; u.feedId = p.feedId; u.loadKw = r0(itLoad / plan.length); u.loadPct = S.pct(u.loadKw, u.capacityKw);
          if (dal && u.status === 'Maintenance') u.status = 'Operational';
          if (dal) u.notes = 'Double-conversion UPS module, 1 MW; three modules in parallel at N+1 for Building A phase 1';
        });
      }

      // ── floor PDUs share their hall's load ──
      const upsIds = new Set(S.upsUnits.filter(u => u.dataCenterId === dc.id).map(u => u.id));
      const pdus = S.pdus.filter(p => (p.upsId && upsIds.has(p.upsId)) || halls.some(h => h.id === p.hallId));
      for (const h of halls) {
        const ps = pdus.filter(p => p.hallId === h.id);
        const draw = racks.filter(r => r.hallId === h.id).reduce((a, r) => a + (r.currentPowerKw || 0), 0);
        ps.forEach(p => {
          const load = r1(draw / ps.length);
          if (load > p.capacityKw * 0.8) p.capacityKw = up(load / 0.8, 25);
          p.loadKw = r0(load); p.loadPct = S.pct(p.loadKw, p.capacityKw);
          p.outletsUsed = h.status === 'Live' ? Math.max(1, Math.min(p.outletCount, Math.round(p.outletCount * (0.25 + (p.loadPct / 100) * 0.7)))) : 0;
        });
      }

      // ── generators ──
      const facility = basis * pue;
      const telcoDc = !!prof.dcPowerPlant;
      let gens: { kw: number; kva: number; n: number; redundant: number; model: string; fuel: number } | null;
      const sizeFor = (f: number) => f > 8000 ? { kw: 2500, kva: 3125, model: 'Cat 3516C diesel generator set (3,125 kVA)' } : f > 2000 ? { kw: 2000, kva: 2500, model: 'Cat 3516B diesel generator set (2,500 kVA)' } : f > 600 ? { kw: 1000, kva: 1250, model: 'Cat C32 diesel generator set (1,250 kVA)' } : f > 300 ? { kw: 500, kva: 625, model: 'Cat C15 diesel generator set (625 kVA)' } : f > 100 ? { kw: 200, kva: 250, model: 'Cat C9 diesel generator set (250 kVA)' } : { kw: 100, kva: 125, model: 'Cat C4.4 diesel generator set (125 kVA)' };
      if (prof.key === 'server-room') gens = null;
      else if (prof.key === 'edge-micro-dc') gens = { kw: 48, kva: 60, n: 1, redundant: 0, model: 'Cat D60 compact diesel set (60 kVA, enclosed)', fuel: 12 };
      else if (dal) gens = { kw: 2000, kva: 2500, n: 3, redundant: 1, model: 'Cat 3516B diesel generator set (2,500 kVA)', fuel: 48 };
      else if (telcoDc && dc.tier !== 'Tier III') { gens = { kw: 640, kva: 800, n: 1, redundant: 0, model: 'Cat C18 diesel generator set (800 kVA)', fuel: 72 }; }
      else {
        const s = sizeFor(facility);
        const n = Math.max(1, Math.ceil(facility / s.kw));
        gens = { ...s, n, redundant: tierIV ? n : 1, fuel: tierIV ? 48 : telcoDc ? 72 : dc.tier === 'Tier III' ? 48 : 24 };
      }
      if (gens) {
        const total = gens.n + gens.redundant;
        for (let i = 0; i < total; i++) {
          const id = S.nid('GEN');
          const maint = dc.code === 'GRU-MDC1' && i === 0;
          S.generators.push({ id, genId: id, ...metaAt(S, ageDays), dataCenterId: dc.id, name: `GEN-${i + 1}`, capacityKva: gens.kva, capacityKw: gens.kw, fuelHours: gens.fuel, redundancyRole: i < gens.n ? 'N' : 'Redundant', status: maint ? 'Maintenance' : 'Operational', model: gens.model, installedDate: at,
            notes: maint ? 'Annual load-bank test this week; the redundant set covers it' : telcoDc && gens.redundant === 0 ? `Battery autonomy ${ups[0]?.runtimeMinutes ?? 240} min on the −48 V plant; portable generator connection box for a second set` : `${tierIV ? '2N' : gens.redundant ? 'N+1' : 'N'} for ${r0(facility).toLocaleString('en-US')} kW facility load` });
        }
      }

      // ── cooling zones: rated for the halls they serve with one unit lost; load follows the racks ──
      const zones = S.coolingZones.filter(z => z.dataCenterId === dc.id);
      const zoneDesign = (z: T.CoolingZone) => halls.filter(h => h.coolingZoneId === z.id && h.status !== 'Shell').reduce((a, h) => a + h.designPowerKw, 0);
      const avgDesign = zones.length ? zones.reduce((a, z) => a + zoneDesign(z), 0) / Math.max(1, zones.filter(z => zoneDesign(z) > 0).length) : 0;
      for (const z of zones) {
        const served = halls.filter(h => h.coolingZoneId === z.id && h.status !== 'Shell');
        const design = zoneDesign(z) || avgDesign;
        const fit = served.length > 0 && served.every(h => h.status === 'Fitting');
        const draw = racks.filter(r => served.some(h => h.id === r.hallId)).reduce((a, r) => a + (r.currentPowerKw || 0), 0);
        const units = S.cracUnits.filter(c => c.coolingZoneId === z.id);
        const unitKw = units.length > 1 ? up(design / (units.length - 1), 5) : up(design * 1.1, 5);
        units.forEach((u, i) => {
          u.capacityKw = unitKw;
          if (dal) u.status = fit ? 'Maintenance' : 'Operational';
          const t = ({ CRAH: [18, 30], CRAC: [18, 29], InRow: [20, 32], CDU: [32, 42], RDHx: [20, 30] } as Record<string, [number, number]>)[u.type] ?? [18, 30];
          u.supplyTempC = t[0] + (i % 2); u.returnTempC = t[1] + (i % 3);
          u.notes = u.type === 'CDU' ? 'Warm-water loop to the cold plates; facility water from the dry coolers' : fit ? 'Installed; commissioning with the hall fit-out' : u.notes;
        });
        z.coolingCapacityKw = unitKw * Math.max(1, units.length);
        z.currentLoadKw = r1(draw * 1.03);
        z.headroomKw = r1(z.coolingCapacityKw - z.currentLoadKw);
        if (!served.length) z.notes = 'No hall connected yet; units installed for the next floor';
        else if (fit) z.notes = `Serves ${served.map(h => h.name).join(', ')} (fit-out in progress)`;
      }

      // ── chillers and dry coolers: heat rejection for chilled-water and liquid zones ──
      const wetZones = zones.filter(z => S.cracUnits.some(c => c.coolingZoneId === z.id && c.type !== 'CRAC'));
      if (wetZones.length) {
        const liquid = prof.physical.liquidCooling === 'standard';
        const climate = CAMPUS_CLIMATE[campus] ?? 'temperate';
        const type: T.Chiller['type'] = liquid ? 'Dry cooler' : climate === 'hot-humid' ? 'Water-cooled chiller' : 'Air-cooled chiller';
        const need = basis * 1.1;
        const size = dal ? 1400 : need <= 600 ? 300 : need <= 2000 ? 700 : need <= 6000 ? 1400 : 2000;
        const n = dal ? 3 : Math.ceil(need / size) + 1;
        const heat = wetZones.reduce((a, z) => a + z.currentLoadKw, 0) * 1.05;
        for (let i = 0; i < n; i++) {
          const id = S.nid('CHLR');
          S.chillers.push({ id, chlrId: id, ...metaAt(S, ageDays), dataCenterId: dc.id, name: `${type === 'Dry cooler' ? 'DRC' : 'CH'}-${i + 1}`, type, capacityKw: size, loadKw: r0(heat / n), supplyTempC: liquid ? 32 : climate === 'hot-humid' ? 14 : 16 + (dal ? 2 : 0), status: 'Operational', servesZoneIds: wetZones.map(z => z.id), model: type === 'Dry cooler' ? `Adiabatic-assisted dry cooler, ${size} kW at 32 °C supply` : type === 'Water-cooled chiller' ? `Water-cooled centrifugal chiller with cooling tower, ${size} kW` : `Air-cooled screw chiller with free cooling, ${size} kW`, installedDate: at,
            notes: i === n - 1 ? 'Redundant unit (N+1)' : undefined });
        }
      }
      dc.designCoolingKw = Math.max(dc.designCoolingKw, r0(dc.designPowerKw * 1.2));
    }
    // Campus notes state the intake against what the existing buildings are entitled to.
    for (const c of S.campuses) {
      const dcs = S.dataCenters.filter(d => d.campusId === c.id && d.status !== 'Retired');
      const feeds = S.utilityFeeds.filter(f => dcs.some(d => d.id === f.dataCenterId));
      const a = feeds.filter(f => f.redundancyRole === 'A-side').reduce((x, f) => x + f.capacityKw, 0); const b = feeds.filter(f => f.redundancyRole === 'B-side').reduce((x, f) => x + f.capacityKw, 0);
      const perSide = a && b ? Math.min(a, b) : a + b;
      const committed = dcs.reduce((a, d) => a + d.designPowerKw * (dcTypeProfile(d.dcTypeKey)?.pueTarget ?? 1.4), 0);
      c.notes = `Campus code ${[...S.dcCampus.entries()].find(([id]) => dcs.some(d => d.id === id))?.[1] ?? ''} · utility intake ${(perSide / 1000).toFixed(1)} MW per side; existing buildings are entitled to ${(committed / 1000).toFixed(1)} MW of facility load (design IT × PUE), leaving ${((perSide - committed) / 1000).toFixed(1)} MW.`;
    }
  }

  // ───────────────────────────────────────────────────────── Ashburn–Frankfurt interconnect
  circuits(): void {
    const S = this.S; const ash = this.dc('ASH-DC1'); const fra = this.dc('FRA-COLO1');
    if (!ash || !fra) return;
    const wave = S.circuitTypes.find(t => t.name === 'Wavelength (DWDM)');
    const coreOf = (dc: T.DataCenter, n: number) => S.devices.find(d => d.dataCenterId === dc.id && d.name === `${dc.code.toLowerCase()}-core-0${n}`);
    /** A 100G-capable port on the core for the wavelength hand-off; adds a 400G line card in a free slot if the router has none. */
    const ifaceOf = (dev?: T.Device): T.Interface | undefined => {
      if (!dev) return undefined;
      let port = this.dataPorts(dev.id).find(c => (c.speedMbps ?? 0) >= 100_000 && !this.cabled.has(c.id) && !S.circuitTerminations.some(t => t.deviceId === dev.id && S.interfaces.find(f => f.id === t.interfaceId)?.name === c.name));
      if (!port) {
        const mt = S.moduleTypes.find(m => m.model === 'MPC10E-15C Line Card');
        const used = new Set(S.modules.filter(m => m.deviceId === dev.id).map(m => m.moduleBayName));
        const bay = ['Slot-1', 'Slot-2', 'Slot-3', 'Slot-4'].find(b => !used.has(b));
        if (!mt || !bay) return undefined;
        const modId = S.nid('MOD');
        S.modules.push({ id: modId, modId, ...metaAt(S, 540), deviceId: dev.id, moduleBayName: bay, moduleTypeId: mt.id, notes: `MPC10E-15C Line Card in ${bay} (installed for the Ashburn–Frankfurt DCI)` } as T.Module);
        this.addComponents(dev, true, mt.id, bay.replace('Slot-', ''), modId);
        port = this.dataPorts(dev.id).find(c => (c.speedMbps ?? 0) >= 100_000 && !this.cabled.has(c.id));
        if (!port) return undefined;
      }
      this.cabled.add(port.id);
      const have = S.interfaces.find(f => f.deviceId === dev.id && f.name === port!.name);
      if (have) { have.speedGbps = 100; return have; }
      const id = S.nid('IFACE');
      const f: T.Interface = { id, ifaceId: id, ...metaAt(S, 380), deviceId: dev.id, name: port.name, adminStatus: 'Up', operStatus: 'Up', speedGbps: 100, utilizationPct: 46, inErrors: 0, outErrors: 0, notes: 'DCI wavelength hand-off (running at 100G)' } as T.Interface;
      S.interfaces.push(f);
      return f;
    };
    const group = 'ASH-DC1⇄FRA-COLO1·DC Interconnect';
    const terminate = (ckt: T.Circuit, n: number, prov: string) => {
      for (const side of ['A', 'Z'] as const) {
        const dc = side === 'A' ? ash : fra; const core = coreOf(dc, n); const f = ifaceOf(core);
        let t = S.circuitTerminations.find(x => x.circuitId === ckt.id && x.side === side);
        if (!t) { const id = S.nid('CTERM'); t = { id, ctermId: id, ...metaAt(S, 420), circuitId: ckt.id, side } as T.CircuitTermination; S.circuitTerminations.push(t); }
        Object.assign(t, { dataCenterId: dc.id, deviceId: core?.id, interfaceId: f?.id, portSpeedMbps: 100_000, xconnectId: side === 'Z' ? `MMR-FRA-${n === 1 ? '0412' : '0418'}` : `XC-ASH-${n === 1 ? '2207' : '2231'}`, description: `${side}-end on ${core?.name ?? `${dc.code} core`}${f ? ` ${f.name}` : ''} · ${prov} wavelength hand-off${side === 'Z' ? ' in the FRA-COLO1 meet-me room' : ''}` });
      }
    };
    const lum = S.circuits.find(c => c.cid === 'LUM-70062');
    if (lum) {
      Object.assign(lum, { circuitTypeId: wave?.id ?? lum.circuitTypeId, commitRateMbps: 100_000, description: 'Wavelength (DWDM) 100G DC interconnect — ASH-DC1 to FRA-COLO1, path A (northern Atlantic route)', monthlyCostUsd: 19_800, contractEnd: S.daysAhead(250), diversityGroup: group, notes: 'Path A of the Ashburn–Frankfurt DCI. Contract renewal decision due before the 400G uplift.' });
      terminate(lum, 1, 'Lumen');
    }
    // A circuit cannot commit more than the port it lands on: commit and port speed follow the A-end interface.
    for (const c of S.circuits) {
      const a = S.circuitTerminations.find(t => t.circuitId === c.id && t.side === 'A');
      const f = a?.interfaceId ? S.interfaces.find(x => x.id === a.interfaceId) : undefined;
      if (!a || !f || c === lum) continue;
      const portMbps = f.speedGbps * 1000;
      if ((c.commitRateMbps ?? 0) > portMbps) {
        const old = c.commitRateMbps ?? portMbps;
        c.monthlyCostUsd = Math.max(400, r0((c.monthlyCostUsd ?? 0) * Math.sqrt(portMbps / old)));
        c.commitRateMbps = portMbps;
        c.description = (c.description ?? '').replace(/\b\d+ G\b/, `${portMbps / 1000} G`);
      }
      for (const t of S.circuitTerminations.filter(x => x.circuitId === c.id)) t.portSpeedMbps = portMbps;
    }
    const telia = S.providers.find(p => p.name === 'Telia Carrier');
    if (telia && !S.circuits.some(c => c.diversityGroup === group && c.providerId === telia.id)) {
      const id = S.nid('CKT');
      const ckt: T.Circuit = { id, cktId: id, ...metaAt(S, 420, S.byRole('Network Engineer')), cid: 'TEL-71705', providerId: telia.id, circuitTypeId: wave?.id ?? S.circuitTypes[0].id, status: 'Active', commitRateMbps: 100_000, description: 'Wavelength (DWDM) 100G DC interconnect — ASH-DC1 to FRA-COLO1, path B (southern Atlantic route)', installDate: S.daysAgo(380), purpose: 'DC Interconnect', monthlyCostUsd: 21_400, slaUptimePct: telia.uptimeSlaPct, contractStart: S.daysAgo(420), contractEnd: S.daysAhead(610), orderedAt: S.daysAgo(420), provisionedAt: S.daysAgo(395), testedAt: S.daysAgo(385), activatedAt: S.daysAgo(380), diversityGroup: group, tags: [], notes: 'Path B of the Ashburn–Frankfurt DCI; different carrier, cable system and landing stations from path A.' };
      S.circuits.push(ckt);
      terminate(ckt, 2, 'Telia Carrier');
    }
  }

  // ───────────────────────────────────────────────────────── vendors and contracts
  commercial(): void {
    const S = this.S;
    const finance = S.byRole('Finance Manager');
    const vend = (name: string) => S.vendors.find(v => v.name === name);
    const addVendor = (name: string, category: string, slaTier: string, contactName: string, notes: string, status = 'Active') => {
      const existing = vend(name); if (existing) return existing;
      const id = S.nid('VEND');
      const v: T.Vendor = { id, vendId: id, ...metaAt(S, 900, finance), name, category, contactName, slaTier, rating: slaTier === 'Platinum' ? 5 : slaTier === 'Gold' ? 4 : 3, status, notes } as T.Vendor;
      S.vendors.push(v); return v;
    };
    const contract = (v: T.Vendor, type: E.ContractType, o: { startDaysAgo: number; endDaysAhead: number; value: number; annual?: number; notice?: number; dc?: T.DataCenter; status?: string; description: string }) => {
      const id = S.nid('CTR');
      const end = o.endDaysAhead >= 0 ? S.daysAhead(o.endDaysAhead) : S.daysAgo(-o.endDaysAhead);
      S.contracts.push({ id, ctrId: id, ...metaAt(S, o.startDaysAgo, finance), vendorId: v.id, type, startDate: S.daysAgo(o.startDaysAgo), endDate: end, value: o.value, status: o.status ?? (o.endDaysAhead < 0 ? 'Expired' : 'Active'), dataCenterId: o.dc?.id, noticeDays: o.notice, annualValue: o.annual, description: o.description, notes: o.description } as T.Contract);
    };
    // Existing contracts: Stulz is no longer an approved supplier; HPE's current-generation warranty is live.
    for (const c of S.contracts) {
      const v = S.vendors.find(x => x.id === c.vendorId);
      if (v?.status === 'Inactive' && c.status === 'Active') { c.status = 'Expired'; c.endDate = S.daysAgo(120); c.notes = `${c.notes ?? ''} · ended when the vendor was de-listed`.replace(/^ · /, ''); }
      if (c.status === 'Expired' && new Date(c.endDate).getTime() > S.now) { c.status = 'Active'; }
      if (v?.category === 'Services' && c.type === 'Warranty') c.notes = v.name === 'Corning' ? 'Workmanship warranty on installed structured cabling (25-year link warranty on certified channels)' : 'Workmanship warranty on installed works (12 months from hand-over)';
      const years = Math.max(1, (new Date(c.endDate).getTime() - new Date(c.startDate).getTime()) / (365 * 864e5));
      if (c.annualValue === undefined && c.type !== 'Warranty') c.annualValue = r0(c.value / years);
      if (c.noticeDays === undefined && c.type !== 'Warranty') c.noticeDays = c.type === 'SLA' ? 60 : 90;
      if (!c.description) c.description = c.notes;
    }
    // Suppliers procurement buys from (existing ids kept; new ones appended).
    addVendor('Pure Storage', 'Hardware', 'Gold', 'Rachel Okafor', 'Hardware vendor · Gold tier · all-flash storage');
    addVendor('NetApp', 'Hardware', 'Gold', 'Lars Becker', 'Hardware vendor · Gold tier · unified storage');
    addVendor('Opengear', 'Network', 'Silver', 'Tom Hendricks', 'Network vendor · out-of-band console servers');
    addVendor('Ciena', 'Network', 'Gold', 'Priyanka Rao', 'Network vendor · optical transport (DWDM, coherent pluggables)');
    addVendor('Nokia', 'Network', 'Gold', 'Mikko Virtanen', 'Network vendor · IP routing and optical for the telco sites');
    addVendor('Coherent', 'Network', 'Silver', 'Grace Liu', 'Network vendor · optical transceivers (SFP+ to 800G)');
    addVendor('Caterpillar', 'Power', 'Gold', 'Hector Ramos', 'Power vendor · standby diesel generator sets via the regional dealer');
    const landlordDub = addVendor('Liffey Park Estates Ltd', 'Property', 'Silver', 'Siobhan Kelly', 'Landlord · Dublin server room (office building lease)');
    const landlordFra = addVendor('Rhein-Main Gewerbebau GmbH', 'Property', 'Gold', 'Jonas Weber', 'Landlord · Frankfurt colo building (shell and core lease)');
    const landlordSin = addVendor('Tai Seng Data Park Pte Ltd', 'Property', 'Gold', 'Daniel Ong', 'Landlord · Singapore POP suite in a third-party facility');
    const landlordDal = addVendor('Trinity Industrial Holdings LLC', 'Property', 'Silver', 'Megan Doyle', 'Landlord · Dallas edge pad lease');
    const SUPPLY: [string, E.ContractType, number, string][] = [
      ['Dell Technologies', 'Supply', 14_000_000, 'Server supply agreement via the reseller: PowerEdge R760 and XE9680 at framework prices, 6 to 12 week delivery'],
      ['HPE', 'Supply', 6_000_000, 'Server supply agreement: ProLiant DL380 Gen11 at framework prices'],
      ['Supermicro', 'Supply', 9_000_000, 'GPU server supply: SYS-821GE GPU SuperServer, allocation-based delivery'],
      ['NVIDIA', 'Supply', 22_000_000, 'DGX and HGX systems under the partner programme; allocation-based delivery'],
      ['Arista Networks', 'Supply', 4_500_000, 'Data-centre switching supply: 7050X3 leaves and 7800 spines with optics bundles'],
      ['Juniper Networks', 'Supply', 3_200_000, 'Switching and routing supply: QFX5120 leaves, MX routers and line cards'],
      ['Cisco Systems', 'Supply', 3_800_000, 'Switching, routing and access supply: Nexus 9300 and Catalyst 9300 families'],
      ['Palo Alto Networks', 'Supply', 1_600_000, 'Firewall supply: PA-5400 series with subscriptions'],
      ['Pure Storage', 'Supply', 2_400_000, 'All-flash storage supply: FlashArray //X with Evergreen subscription'],
      ['NetApp', 'Supply', 1_800_000, 'Storage supply: AFF A-series'],
      ['Opengear', 'Supply', 250_000, 'Console server supply: OM2200 series with cellular failover'],
      ['Ciena', 'Framework', 2_000_000, 'Optical transport framework: DWDM line systems and coherent pluggables for DCI'],
      ['Nokia', 'Framework', 2_500_000, 'IP routing and optical framework for the telco sites'],
      ['Coherent', 'Supply', 900_000, 'Optics supply: SFP+, SFP28, QSFP28 and QSFP-DD transceivers'],
      ['Vertiv', 'Framework', 12_000_000, 'Thermal and power framework: CRAH, CDU, rear-door units, rack PDUs and UPS modules'],
      ['Schneider Electric', 'Framework', 8_000_000, 'Power framework: UPS modules, switchgear and busway'],
      ['Eaton', 'Framework', 5_000_000, 'Power framework: UPS modules, switchgear and power distribution units'],
      ['Caterpillar', 'Framework', 9_000_000, 'Standby generator framework: 1 to 3 MVA diesel sets, installation and load-bank testing'],
      ['Corning', 'Supply', 1_200_000, 'Structured cabling only: fibre trunks, cassettes, patch panels and patch cords'],
      ['CBRE Data Center Solutions', 'Framework', 6_000_000, 'Facility works and critical-environment services framework: plant installation and maintenance labour'],
      ['NetBuild Corp', 'Framework', 3_500_000, 'Installation services framework: rack and stack, cabling, decommissioning and certified disposal'],
    ];
    SUPPLY.forEach(([name, type, annual, description], i) => {
      const v = vend(name); if (!v) return;
      if (S.contracts.some(c => c.vendorId === v.id && (c.type === 'Supply' || c.type === 'Framework'))) return;
      contract(v, type, { startDaysAgo: 300 + (i % 5) * 60, endDaysAhead: 500 + (i % 4) * 180, value: annual * 3, annual, notice: 90, description });
    });
    const stulz = vend('Stulz');
    if (stulz && !S.contracts.some(c => c.vendorId === stulz.id && c.type === 'Framework')) contract(stulz, 'Framework', { startDaysAgo: 1400, endDaysAhead: -120, value: 4_500_000, annual: 1_500_000, notice: 90, description: 'Precision cooling framework (CRAC and in-row units). Not renewed; Stulz is no longer an approved supplier.' });
    // Leases for the sites the organisation does not own.
    const lease = (code: string, v: T.Vendor, startDaysAgo: number, endDaysAhead: number, annual: number, notice: number, description: string) => { const dc = this.dc(code); if (dc) contract(v, 'Lease', { startDaysAgo, endDaysAhead, value: r0(annual * (startDaysAgo + endDaysAhead) / 365), annual, notice, dc, description }); };
    lease('DUB-SR1', landlordDub, 3650, 75, 96_000, 180, 'Office building lease for the server room and its plant space. Break notice served; the lease ends when the room is retired.');
    lease('FRA-COLO1', landlordFra, 2900, 2580, 2_400_000, 365, 'Shell and core lease of the Frankfurt colo building, 15-year term with two 5-year renewal options.');
    lease('SIN-POP1', landlordSin, 1100, 725, 420_000, 180, 'Suite lease with power at 100 kW in a third-party facility; meet-me room access included.');
    lease('DAL-Edge1', landlordDal, 800, 1025, 36_000, 90, 'Ground lease for the edge enclosure pad, fibre entry and utility drop.');
    // Plant maintenance per site: UPS, generators and cooling.
    const upsVendor: Record<string, string> = { ASH: 'Eaton', DAL: 'Eaton', FRA: 'Schneider Electric', DUB: 'Vertiv', SIN: 'Schneider Electric', SYD: 'Vertiv', GRU: 'Schneider Electric' };
    S.dataCenters.forEach((dc, i) => {
      const campus = S.dcCampus.get(dc.id) ?? 'ASH';
      const upsKw = S.upsUnits.filter(u => u.dataCenterId === dc.id).reduce((a, u) => a + u.capacityKw, 0);
      const genKw = S.generators.filter(g => g.dataCenterId === dc.id).reduce((a, g) => a + g.capacityKw, 0);
      const coolKw = S.coolingZones.filter(z => z.dataCenterId === dc.id).reduce((a, z) => a + z.coolingCapacityKw, 0) + S.chillers.filter(c => c.dataCenterId === dc.id).reduce((a, c) => a + c.capacityKw, 0);
      const retiring = dc.status === 'Decommissioning';
      const end = retiring ? 75 : 240 + (i % 6) * 90;
      const prof = dcTypeProfile(dc.dcTypeKey);
      const uv = vend(upsVendor[campus]); const cv = vend('Vertiv'); const gv = vend('Caterpillar');
      if (uv && upsKw) contract(uv, 'Maintenance', { startDaysAgo: 400 + i * 11, endDaysAhead: end, value: r0(Math.max(6000, upsKw * 9) * 3), annual: r0(Math.max(6000, upsKw * 9)), notice: 90, dc, description: `${prof?.dcPowerPlant ? '−48 V DC plant, rectifier and battery-string' : 'UPS and battery'} maintenance at ${dc.code}: quarterly inspection, annual battery test, 4-hour on-site response${retiring ? '; not renewed (site retiring)' : ''}` });
      if (gv && genKw) contract(gv, 'Maintenance', { startDaysAgo: 420 + i * 9, endDaysAhead: end + 30, value: r0(Math.max(4000, genKw * 6) * 3), annual: r0(Math.max(4000, genKw * 6)), notice: 90, dc, description: `Generator maintenance at ${dc.code}: monthly run, annual load-bank test, fuel polishing` });
      if (cv && coolKw) contract(cv, 'Maintenance', { startDaysAgo: 380 + i * 13, endDaysAhead: end + 60, value: r0(Math.max(5000, coolKw * 7) * 3), annual: r0(Math.max(5000, coolKw * 7)), notice: 90, dc, description: `Cooling plant maintenance at ${dc.code}: ${S.chillers.some(c => c.dataCenterId === dc.id) ? 'chillers, ' : ''}CRAC/CRAH/CDU service visits and filter changes` });
    });
  }

  // ───────────────────────────────────────────────────────── delivered projects of the newer templates
  history(): void {
    const S = this.S;
    const prog = (name: string) => S.programs.find(p => p.name === name || p.name.startsWith(name));
    const add = (programName: string, name: string, template: E.ProjectTemplate, code: string, budget: number, startDaysAgo: number, durationDays: number) => {
      const p = prog(programName); const dc = this.dc(code); if (!p || !dc) return;
      addProject(S, { programId: p.id, name, template, dc, pct: 100, budget, startDaysAgo, durationDays, manager: S.byRole('Project Manager') });
    };
    add('Network Fabric Modernization', 'Ashburn–Frankfurt DCI 2 × 100G — ASH-DC1 ⇄ FRA-COLO1', 'DCI / WAN Uplift', 'ASH-DC1', 780_000, 520, 140);
    add('Legacy Decommissioning Wave 2', 'Compute refresh, house racks — FRA-COLO1', 'Server Refresh', 'FRA-COLO1', 1_150_000, 480, 120);
    add('Resilience & Sustainability', 'Row A rack and rPDU replacement — FRA-CH1', 'Rack Replacement', 'FRA-CH1', 210_000, 430, 70);
    add('AI Capacity Expansion FY26', 'Rear-door retrofit, Hall 1 — SIN-NC1', 'Liquid Retrofit', 'SIN-NC1', 1_900_000, 600, 150);
    add('Dallas POD-1 POD Rollout', 'Edge enclosure rollout — DAL-Edge1', 'Edge Site Rollout', 'DAL-Edge1', 640_000, 900, 110);
    add('Resilience & Sustainability', 'UPS battery string and module replacement — ASH-WHS1', 'Plant Upgrade Works', 'ASH-WHS1', 1_350_000, 560, 120);
  }
}

/** A delivery project with milestones and process activities progressed to `pct`. */
export function addProject(S: Seed, o: { programId: string; name: string; template: E.ProjectTemplate; dc: T.DataCenter; pct: number; budget: number; startDaysAgo: number; durationDays: number; manager: Person; status?: E.ProjectStatus; plannerPlanId?: string; planPhaseId?: string; notes?: string }): T.Project {
  const id = S.nid('PROJ');
  const start = S.daysAgo(o.startDaysAgo); const end = new Date(new Date(start).getTime() + o.durationDays * 864e5).toISOString();
  const status: E.ProjectStatus = o.status ?? (o.pct >= 100 ? 'Completed' : o.pct <= 0 ? 'Planning' : 'Active');
  const proj: T.Project = { id, projId: id, ...metaAt(S, o.startDaysAgo + 20, o.manager), programId: o.programId, name: o.name, status, rag: status === 'At Risk' ? 'Amber' : 'Green', managerName: o.manager.name, dataCenterId: o.dc.id, plannedStart: start, plannedEnd: end, percentComplete: o.pct, budget: o.budget, actualSpend: r0(o.budget * (o.pct / 100) * 0.97), template: o.template, plannerPlanId: o.plannerPlanId, planPhaseId: o.planPhaseId, notes: o.notes } as T.Project;
  S.projects.push(proj);
  const maturity = o.pct >= 100 ? 4 : o.pct >= 75 ? 3 : o.pct >= 40 ? 2 : o.pct >= 10 ? 1 : 0;
  S.projectMeta.set(id, { maturity, template: o.template, budget: o.budget });
  const ms = TEMPLATE_REGISTRY[o.template].milestones;
  const done = Math.round((o.pct / 100) * ms.length);
  ms.forEach((name, k) => {
    const msId = S.nid('MS');
    const st: E.MilestoneStatus = k < done ? 'Completed' : k === done && o.pct < 100 && o.pct > 0 ? 'In Progress' : 'Not Started';
    const due = new Date(new Date(start).getTime() + (o.durationDays * 864e5 * (k + 1)) / (ms.length + 1)).toISOString();
    S.milestones.push({ id: msId, msId, ...metaAt(S, o.startDaysAgo, o.manager), projectId: id, name, dueDate: due, status: st, rag: st === 'Completed' ? 'Green' : st === 'In Progress' ? 'Green' : 'Grey' } as T.Milestone);
  });
  const proc = buildProcess(o.template);
  const tasks = proc.nodes.filter(n => n.type === 'task').length;
  const frontier = Math.round((o.pct / 100) * tasks);
  let ti = 0;
  proc.nodes.forEach((node, order) => {
    let st: E.ActivityStatus;
    if (node.type === 'start') st = 'Done';
    else if (node.type === 'end') st = o.pct >= 100 ? 'Done' : 'Pending';
    else if (node.type === 'gateway') st = ti <= frontier ? 'Done' : 'Pending';
    else { st = ti < frontier ? 'Done' : ti === frontier && o.pct < 100 ? 'Active' : 'Pending'; ti++; }
    const paId = S.nid('PA');
    S.projectActivities.push({ id: paId, paId, ...metaAt(S, o.startDaysAgo, o.manager), projectId: id, nodeId: node.id, name: node.name, nodeType: node.type, status: st, order, attaches: node.attaches, condition: node.condition } as T.ProjectActivity);
  });
  const p = S.programs.find(x => x.id === o.programId); if (p) p.projectCount = S.projects.filter(x => x.programId === p.id).length;
  return proj;
}
