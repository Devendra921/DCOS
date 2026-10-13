/**
 * DCO inventory workbook → DCOS records.
 *
 * `mergeDcoDataset(snapshot, dataset, opts)` maps one extracted workbook (the shape
 * `scripts/import/extract_dco_workbook.py` writes: `{ estate, currency, source, sheets: { <Sheet>: { cols, rows } } }`)
 * into the MockDB collections and returns a new snapshot plus an import report. It is pure:
 * the input snapshot is not mutated, nothing random is drawn (derived values come from a
 * hash of the record id) and records are upserted by id, so merging the same workbook twice
 * gives the same snapshot. An upload screen can call it as is.
 *
 * Conventions follow the demo seed (src/mock/db/seed/estateModel.ts): every room is a Hall with a
 * room type and its own cooling zone, rows are Row records, racks sit on the hall grid, CDUs are
 * both a CRAC of type CDU (cooling plant) and a Cdu record (liquid loop), monitored network gear has
 * a ManagedDevice and NMS interfaces, interfaces are DeviceComponents and LLDP links are Cables
 * between component ids; routing adjacencies are RoutingSessions.
 *
 * Every imported record carries `extRef { source, id }` with its id in the workbook.
 */
import type * as T from '../data/types';

/* ───────────────────────────── public types ───────────────────────────── */

export type Snapshot = Record<string, Record<string, unknown>[]>;
export interface DcoSheet { cols: string[]; rows: unknown[][] }
export interface DcoDataset { estate: string; currency: string; source: string; sheets: Record<string, DcoSheet> }

/** Indian rupees per US dollar used to express INR revenue in the single-number Customer.revenueMonthly (USD). */
export const INR_PER_USD = 84;
/** Exchange rates to USD for Customer.revenueMonthly. Services keep their native currency. */
export const USD_PER: Record<string, number> = { USD: 1, INR: 1 / INR_PER_USD };

export interface DcoMergeOptions {
  /** Written into every record's extRef.source, e.g. 'NeoCloud US 2026-10-12'. */
  source: string;
  /** Prefix for ids that are reused between workbooks (links, services, alerts, incidents, changes), e.g. 'US-'. */
  clashPrefix: string;
  /** Country of every site in the workbook ('United States', 'India'). */
  country: string;
  /** Short country label for region names ('US' → "US · Northeast"). */
  countryShort: string;
  /** Native currency of the services. Overrides the workbook's own label when that is wrong. */
  currency: string;
  /** Operator name used when the Sites sheet leaves it blank. */
  operator: string;
  /** Snapshot date (YYYY-MM-DD); used for createdAt/updatedAt and extRef.importedAt. */
  asOf: string;
}

export interface ReportLine { code: string; title: string; count: number; examples: string[] }
export interface ImportReport {
  source: string; estate: string; currency: string; workbook: string;
  /** Rows per sheet and what they became. */
  sheets: { sheet: string; rows: number; became: string }[];
  /** Records written per collection (new or replaced). */
  collections: Record<string, number>;
  fixes: ReportLine[];
  warnings: ReportLine[];
  ms: number;
}

/* ───────────────────────────── helpers ───────────────────────────── */

type Rec = Record<string, unknown>;
type Row = Record<string, unknown>;

/** FNV-1a hash (stable across runs). */
export function hashOf(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 100) : 0);
const slug = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
const frac = (key: string, lo: number, hi: number) => lo + ((hashOf(key) % 1000) / 999) * (hi - lo);

function rowsOf(ds: DcoDataset, sheet: string): Row[] {
  const s = ds.sheets[sheet];
  if (!s) return [];
  const cols = s.cols;
  return s.rows.map((r) => { const o: Row = {}; for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i]; return o; });
}
const str = (r: Row, k: string): string | undefined => { const v = r[k]; return v == null || v === '' ? undefined : String(v).trim(); };
const num = (r: Row, k: string): number | undefined => { const v = r[k]; if (v == null || v === '') return undefined; const x = Number(v); return Number.isFinite(x) ? x : undefined; };
const yes = (r: Row, k: string) => (str(r, k) ?? '').toUpperCase() === 'Y';
const list = (r: Row, k: string) => (str(r, k) ?? '').split(/[;,]/).map((x) => x.trim()).filter(Boolean);
/** "2026-10-01 07:07" or "2026-10-01" → ISO (the snapshot carries no zone; read as UTC). */
function iso(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (!m) return undefined;
  return `${m[1]}T${m[2] ?? '00'}:${m[3] ?? '00'}:${m[4] ?? '00'}.000Z`;
}

/* ───────────────────────────── reference tables ───────────────────────────── */

/** IANA zone per US state (where a state spans two zones, the zone of its data-centre markets). */
const US_STATE_TZ: Record<string, string> = {
  Virginia: 'America/New_York', 'New Jersey': 'America/New_York', 'New York': 'America/New_York', Georgia: 'America/New_York', Florida: 'America/New_York',
  Ohio: 'America/New_York', 'North Carolina': 'America/New_York', 'South Carolina': 'America/New_York', Pennsylvania: 'America/New_York', Massachusetts: 'America/New_York',
  Maryland: 'America/New_York', Connecticut: 'America/New_York', Delaware: 'America/New_York', 'District of Columbia': 'America/New_York', Michigan: 'America/Detroit',
  Indiana: 'America/Indiana/Indianapolis', Kentucky: 'America/New_York', Tennessee: 'America/Chicago', Texas: 'America/Chicago', Illinois: 'America/Chicago',
  Minnesota: 'America/Chicago', Missouri: 'America/Chicago', Wisconsin: 'America/Chicago', Iowa: 'America/Chicago', Oklahoma: 'America/Chicago', Nebraska: 'America/Chicago',
  Kansas: 'America/Chicago', Louisiana: 'America/Chicago', Alabama: 'America/Chicago', Arizona: 'America/Phoenix', Colorado: 'America/Denver', Utah: 'America/Denver',
  'New Mexico': 'America/Denver', Idaho: 'America/Boise', Montana: 'America/Denver', Wyoming: 'America/Denver', Nevada: 'America/Los_Angeles',
  California: 'America/Los_Angeles', Washington: 'America/Los_Angeles', Oregon: 'America/Los_Angeles', Alaska: 'America/Anchorage', Hawaii: 'Pacific/Honolulu',
};
function timezoneFor(country: string, state: string | undefined): string | undefined {
  if (/india/i.test(country)) return 'Asia/Kolkata';
  if (/united states|^us$/i.test(country)) return state ? US_STATE_TZ[state] : undefined;
  return undefined;
}

const VENDOR: Record<string, string> = {
  NVIDIA: 'NVIDIA', DELL: 'Dell', SUPERMICRO: 'Supermicro', DDN: 'DDN', WEKA: 'WEKA', INTEL: 'Intel', VAST: 'VAST Data', ARISTA: 'Arista',
  JUNIPER: 'Juniper', FORTINET: 'Fortinet', CISCO: 'Cisco', HPE: 'HPE', AMD: 'AMD', LENOVO: 'Lenovo', 'PALO ALTO': 'Palo Alto',
};
const vendorName = (v: string) => VENDOR[v.toUpperCase()] ?? v.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a: string, b: string) => a + b.toLowerCase());

const GPU_BY_TOKEN: [RegExp, string, string][] = [
  [/B200/, 'B200 SXM 192 GB', 'NVIDIA'], [/H200/, 'H200 SXM 141 GB', 'NVIDIA'], [/H100/, 'H100 SXM 80 GB', 'NVIDIA'], [/A100/, 'A100 SXM 80 GB', 'NVIDIA'],
  [/L40S/, 'L40S PCIe 48 GB', 'NVIDIA'], [/\bT4\b/, 'T4 PCIe 16 GB', 'NVIDIA'], [/Gaudi ?3/, 'Gaudi 3 OAM 128 GB', 'Intel'], [/Max ?1550/, 'Max 1550 OAM 128 GB', 'Intel'],
];
/** Typical maximum draw (W) and weight (kg) of a device, by workbook role and model. */
function deviceProfile(role: string, model: string, u: number): { w: number; kg: number } {
  if (role === 'GPU') {
    const w = /B200/.test(model) ? 14300 : /H200|H100/.test(model) ? 10200 : /Gaudi/.test(model) ? 9000 : /Max ?1550/.test(model) ? 8400 : /A100/.test(model) ? 6500 : /L40S/.test(model) ? 4800 : /T4/.test(model) ? 2200 : 6000;
    return { w, kg: Math.max(40, u * 18) };
  }
  if (role === 'Switch') return /QM9700/.test(model) ? { w: 1720, kg: 15 } : /SN5600/.test(model) ? { w: 2200, kg: 24 } : /SN2201/.test(model) ? { w: 150, kg: 6 } : /7060/.test(model) ? { w: 900, kg: 14 } : { w: 600, kg: 10 };
  if (role === 'Router') return { w: 1600, kg: 30 };
  if (role === 'Firewall') return { w: 1500, kg: 25 };
  if (role === 'Storage') return { w: 2200, kg: 35 };
  if (role === 'Server') return { w: 900, kg: 18 };
  return { w: 500, kg: 10 };
}
const CATEGORY: Record<string, T.Device['category']> = { Router: 'Router', Switch: 'Switch', Firewall: 'Firewall', GPU: 'GPU-Node', Server: 'Server', Storage: 'Storage' };
const NETWORK_ROLES = new Set(['Router', 'Switch', 'Firewall']);
function dcimRole(role: string, layer: string | undefined): string {
  if (role === 'Router') return 'Core Router';
  if (role === 'Firewall') return 'Firewall';
  if (role === 'Switch') return layer === 'spine' ? 'Spine' : 'Leaf/ToR';
  if (role === 'Storage') return 'Storage';
  if (role === 'GPU' || role === 'Server') return 'Server';
  return 'Other';
}
function platformOf(vendor: string, os: string | undefined, role: string): string {
  if (vendor === 'Juniper') return 'Junos';
  if (vendor === 'Arista') return 'EOS';
  if (vendor === 'Cisco') return /NX-OS/.test(os ?? '') ? 'NX-OS' : /XR/.test(os ?? '') ? 'IOS-XR' : 'Other';
  if (/Cumulus|Ubuntu|RHEL|DGX OS|Linux/i.test(os ?? '')) return 'Linux';
  if (role === 'GPU' || role === 'Server' || role === 'Storage') return 'Linux';
  return 'Other';
}
const IFACE_TYPE: Record<string, string> = { '1G copper': '1000BASE-T', '10G SFP+': '10GBASE-X SFP+', '25G SFP28': '25GBASE-X SFP28', '40G QSFP+': '40GBASE-X QSFP+', '100G QSFP28': '100GBASE-X QSFP28', '400G QSFP-DD': '400GBASE-X QSFP-DD', '400G OSFP': '400GBASE-X OSFP', '400G NDR': '400GBASE-X OSFP' };
const RACK_PURPOSE: Record<string, T.Rack['purpose']> = { GPU: 'GPU', Compute: 'Compute', Storage: 'Storage', Network: 'Network', Core: 'Network', Access: 'Network', 'ODF / patching': 'Network', 'Meet-me room': 'Network', Aggregation: 'Network', Tenant: 'Mixed', 'AI cage': 'GPU', Mixed: 'Mixed' };
const SITE_STATUS: Record<string, T.DataCenter['status']> = { 'on-air': 'Operational', 'in-progress': 'Construction', planned: 'Planned', failed: 'Decommissioning', decommissioning: 'Decommissioning', retired: 'Retired' };
const ALARM_SEV: Record<string, T.Alarm['severity']> = { critical: 'Critical', major: 'Major', minor: 'Minor', warning: 'Warning', info: 'Info' };
const ALARM_STATE: Record<string, T.Alarm['state']> = { active: 'Active', acknowledged: 'Acknowledged', cleared: 'Cleared' };
const INC_SEV: Record<string, T.Incident['severity']> = { Critical: 'SEV1', High: 'SEV2', Medium: 'SEV3', Low: 'SEV4' };
const INC_PRI: Record<string, NonNullable<T.Incident['priority']>> = { SEV1: 'P1', SEV2: 'P2', SEV3: 'P3', SEV4: 'P4' };
const CHG_STATUS: Record<string, T.ChangeRequest['status']> = { Draft: 'Draft', 'Pending approval': 'Submitted', Submitted: 'Submitted', 'Under review': 'UnderReview', Approved: 'Approved', Scheduled: 'Scheduled', 'In progress': 'InProgress', Implemented: 'Implemented', Completed: 'Closed', Closed: 'Closed', Rejected: 'Rejected', Cancelled: 'Cancelled', 'Rolled back': 'RolledBack' };

/* ───────────────────────────── upsert writer ───────────────────────────── */

class Writer {
  readonly out: Snapshot;
  /** Distinct record ids written (new or replaced) per collection. */
  private ids = new Map<string, Set<string>>();
  private tables = new Map<string, { arr: Rec[]; idx: Map<string, number> }>();
  constructor(base: Snapshot) { this.out = { ...base }; }
  private table(name: string) {
    let t = this.tables.get(name);
    if (!t) {
      const arr = [...(this.out[name] ?? [])];
      const idx = new Map<string, number>();
      arr.forEach((r, i) => idx.set(r.id as string, i));
      t = { arr, idx };
      this.tables.set(name, t);
      this.out[name] = arr;
    }
    return t;
  }
  put(name: string, rec: object): void {
    const t = this.table(name);
    const r = rec as Rec;
    const id = r.id as string;
    const i = t.idx.get(id);
    if (i === undefined) { t.idx.set(id, t.arr.length); t.arr.push(r); } else t.arr[i] = r;
    let w = this.ids.get(name); if (!w) { w = new Set(); this.ids.set(name, w); } w.add(id);
  }
  get written(): Record<string, number> { return Object.fromEntries([...this.ids].map(([k, v]) => [k, v.size])); }
  get<X>(name: string, id: string): X | undefined { const t = this.table(name); const i = t.idx.get(id); return i === undefined ? undefined : (t.arr[i] as unknown as X); }
  all<X>(name: string): X[] { return this.table(name).arr as unknown as X[]; }
}

/* ───────────────────────────── the merge ───────────────────────────── */

export function mergeDcoDataset(snapshot: Snapshot, dataset: DcoDataset, opts: DcoMergeOptions): { snapshot: Snapshot; report: ImportReport } {
  return new DcoMerge(snapshot, dataset, opts).run();
}

class DcoMerge {
  private W: Writer;
  private ds: DcoDataset;
  private o: DcoMergeOptions;
  private at: string;
  private fixes = new Map<string, ReportLine>();
  private warns = new Map<string, ReportLine>();
  private sheetLines: ImportReport['sheets'] = [];

  // lookups built while mapping
  private site = new Map<string, Row>();
  private siteStatus = new Map<string, T.DataCenter['status']>();
  private room = new Map<string, Row>();
  private rackRow = new Map<string, Row>();
  private rackRec = new Map<string, T.Rack>();
  private devRow = new Map<string, Row>();
  private devRec = new Map<string, T.Device>();
  private devsByRack = new Map<string, Row[]>();
  private compId = new Map<string, string>(); // device|if → component id
  private compSpeed = new Map<string, number>();
  private compOptic = new Map<string, string | undefined>();
  private nmsIfId = new Map<string, string>(); // device|if → NMS interface id
  private managed = new Set<string>();
  private feedIds = new Set<string>();
  private collectorRec = new Map<string, T.Collector>();
  private custIdMap = new Map<string, string>(); // workbook id → DCOS id
  private custName = new Map<string, string>();
  private activeAlarmsByDev = new Map<string, Row[]>();
  private zoneOfRoom = new Map<string, string>();

  constructor(snapshot: Snapshot, dataset: DcoDataset, opts: DcoMergeOptions) {
    this.W = new Writer(snapshot);
    this.ds = dataset;
    this.o = opts;
    this.at = `${opts.asOf}T00:00:00.000Z`;
  }

  private fix(code: string, title: string, example?: string, n = 1) { const l = this.fixes.get(code) ?? { code, title, count: 0, examples: [] }; l.count += n; if (example && l.examples.length < 6 && !l.examples.includes(example)) l.examples.push(example); this.fixes.set(code, l); }
  private warn(code: string, title: string, id?: string, n = 1) { const l = this.warns.get(code) ?? { code, title, count: 0, examples: [] }; l.count += n; if (id && l.examples.length < 12 && !l.examples.includes(id)) l.examples.push(id); this.warns.set(code, l); }
  /** A fix or warning applied to `count` records at once. */
  private fixAll(code: string, title: string, count: number, examples: string[] = []) { if (count) this.fixes.set(code, { code, title, count, examples }); }
  private warnAll(code: string, title: string, count: number, examples: string[] = []) { if (count) this.warns.set(code, { code, title, count, examples }); }
  private cache = new Map<string, Row[]>();
  private rows(sheet: string): Row[] { let r = this.cache.get(sheet); if (!r) { r = rowsOf(this.ds, sheet); this.cache.set(sheet, r); } return r; }
  private meta(originalId: string): Omit<T.BaseEntity, 'id'> {
    return { customerId: 'CUST-001', createdAt: this.at, updatedAt: this.at, createdBy: `${this.o.operator} import`, createdById: 'import', isDeleted: false, extRef: { source: this.o.source, id: originalId, importedAt: this.at } };
  }
  private sheet(name: string, rows: number, became: string) { this.sheetLines.push({ sheet: name, rows, became }); }

  run(): { snapshot: Snapshot; report: ImportReport } {
    const t0 = Date.now();
    this.indexDevices();
    this.sites();
    this.roomsRowsRacks();
    this.power();
    this.cooling();
    this.collectors();
    this.devices();
    this.modules();
    this.interfaces();
    this.links();
    this.gpu();
    this.customersAndServices();
    this.snapshotHistory();
    this.rollups();
    const report: ImportReport = {
      source: this.o.source, estate: this.ds.estate, currency: this.o.currency, workbook: this.ds.source,
      sheets: this.sheetLines, collections: { ...this.W.written },
      fixes: [...this.fixes.values()], warnings: [...this.warns.values()], ms: Date.now() - t0,
    };
    return { snapshot: this.W.out, report };
  }

  /* ── pre-index devices and racks (draw and used U need them before racks are written) ── */
  private indexDevices() {
    for (const r of this.rows('Racks')) this.rackRow.set(str(r, 'rack_id') as string, r);
    for (const d of this.rows('Devices')) {
      const id = str(d, 'device_id') as string;
      this.devRow.set(id, d);
      const rk = str(d, 'rack_id');
      if (rk) { const a = this.devsByRack.get(rk) ?? []; a.push(d); this.devsByRack.set(rk, a); }
    }
    for (const a of this.rows('Snapshot_Alerts')) {
      const dev = str(a, 'device_or_node');
      if (!dev || str(a, 'state') === 'cleared') continue;
      const l = this.activeAlarmsByDev.get(dev) ?? []; l.push(a); this.activeAlarmsByDev.set(dev, l);
    }
  }

  /* ── Sites → Region, Campus, DataCenter, Building ── */
  private sites() {
    const { W, o } = this;
    const sites = this.rows('Sites');
    const entId = `ENT-${slug(o.operator)}`;
    if (!W.get<T.Enterprise>('enterprises', entId)) W.put('enterprises', { id: entId, entId, ...this.meta(o.operator), name: o.operator, tenantCode: slug(o.operator), headquartersCountry: o.country, regionCount: 0, status: 'Active', notes: `Operator of the imported ${o.operator} estate.` } satisfies T.Enterprise);
    const regions = new Set<string>(); const campuses = new Map<string, Row[]>();
    for (const s of sites) {
      const id = str(s, 'site_id') as string;
      this.site.set(id, s);
      regions.add(str(s, 'region') ?? 'Unassigned');
      const ck = `${str(s, 'region') ?? 'Unassigned'}|${str(s, 'city') ?? id}`;
      const a = campuses.get(ck) ?? []; a.push(s); campuses.set(ck, a);
    }
    const cc = o.clashPrefix.replace(/-$/, '');
    const regionId = (name: string) => `REG-${cc}-${slug(name)}`;
    for (const rn of regions) {
      const id = regionId(rn);
      W.put('regions', { id, regId: id, ...this.meta(rn), enterpriseId: entId, name: `${o.countryShort} · ${rn}`, geo: /india/i.test(o.country) ? 'APAC' : 'North America', campusCount: 0 } satisfies T.Region);
    }
    const campusOf = new Map<string, string>();
    for (const [ck, group] of campuses) {
      const [rn, city] = ck.split('|');
      const id = `CMP-${cc}-${slug(city)}`;
      const lat = group.reduce((a, s) => a + (num(s, 'latitude') ?? 0), 0) / group.length;
      const lng = group.reduce((a, s) => a + (num(s, 'longitude') ?? 0), 0) / group.length;
      W.put('campuses', { id, cmpId: id, ...this.meta(city), regionId: regionId(rn), name: `${o.operator} ${city}`, latitude: r2(lat), longitude: r2(lng), city, country: o.country, dataCenterCount: group.length, notes: `${group.length} ${o.operator} site${group.length > 1 ? 's' : ''} in ${city}` } satisfies T.Campus);
      for (const s of group) campusOf.set(str(s, 'site_id') as string, id);
    }
    const floorsBySite = new Map<string, number>();
    for (const f of this.rows('Floors')) floorsBySite.set(str(f, 'site_id') as string, (floorsBySite.get(str(f, 'site_id') as string) ?? 0) + 1);
    const racksBySite = new Map<string, number>();
    for (const r of this.rackRow.values()) racksBySite.set(str(r, 'site_id') as string, (racksBySite.get(str(r, 'site_id') as string) ?? 0) + 1);

    for (const s of sites) {
      const id = str(s, 'site_id') as string;
      const city = str(s, 'city') ?? '';
      const state = str(s, 'state');
      const statusRaw = str(s, 'status') ?? 'on-air';
      const status = SITE_STATUS[statusRaw] ?? 'Operational';
      this.siteStatus.set(id, status);
      const wbName = str(s, 'site_name');
      const name = !wbName || wbName === id ? `${city} ${id}`.trim() : wbName;
      if (name !== wbName) this.fix('SITE_NAME', 'Site name was the site code: named "<city> <code>"', `${id} → ${name}`);
      const tzWb = str(s, 'timezone');
      const tz = timezoneFor(o.country, state) ?? tzWb;
      if (!timezoneFor(o.country, state)) this.warn('TZ_UNKNOWN_STATE', 'No zone known for the state; workbook timezone kept', id);
      if (tz !== tzWb) this.fix('TIMEZONE', 'Timezone did not match the state: set from the state', `${id} (${state}) ${tzWb ?? '—'} → ${tz}`);
      const operator = str(s, 'operator') ?? o.operator;
      if (!str(s, 'operator')) this.fix('OPERATOR', `Operator blank: set to ${o.operator}`, id);
      const it = num(s, 'it_capacity_kw') ?? 0;
      if (status === 'Planned' && it <= 10) this.warn('PLANNED_SITE_TINY', 'Planned site with 10 kW or less of IT capacity (imported as is)', `${id} (${it} kW)`);
      const commissioned = iso(str(s, 'commissioned_on'));
      const dc: T.DataCenter = {
        id, dcId: id, ...this.meta(id), campusId: campusOf.get(id) as string, name, code: id, dcTypeKey: 'ai-gpu-factory',
        tier: (str(s, 'tier') ?? 'Tier III') as T.DataCenter['tier'], status, designPowerKw: it, designCoolingKw: num(s, 'cooling_capacity_kw') ?? Math.round(it * 1.2),
        totalRacks: racksBySite.get(id) ?? 0, commissionedDate: commissioned, latitude: num(s, 'latitude') ?? 0, longitude: num(s, 'longitude') ?? 0,
        category: str(s, 'category') as T.DataCenter['category'], businessModel: (str(s, 'business_model') ?? 'neocloud') as T.BusinessModel, timezone: tz,
        designPue: num(s, 'design_pue'), coolingRedundancy: str(s, 'cooling_redundancy') as T.DataCenter['coolingRedundancy'], operatorName: operator,
        address: [str(s, 'address'), city, state].filter(Boolean).join(', '), city, state, country: o.country,
        notes: `${o.operator} ${str(s, 'business_model') ?? 'neocloud'} site · ${str(s, 'category') ?? ''} · imported from ${this.ds.source}`,
      };
      W.put('dataCenters', dc);
      const bid = `${id}-BLD`;
      W.put('buildings', { id: bid, bldId: bid, ...this.meta(bid), dataCenterId: id, name: 'Building A', floorCount: floorsBySite.get(id) ?? 1, grossAreaSqm: 0 } satisfies T.Building);
    }
    this.sheet('Sites', sites.length, `${sites.length} data centres, ${campuses.size} campuses, ${regions.size} regions, ${sites.length} buildings`);
  }

  /* ── Floors, Rooms (halls + cooling zones), rows and racks ── */
  private roomsRowsRacks() {
    const { W } = this;
    const floors = this.rows('Floors');
    const rooms = this.rows('Rooms');
    const racks = [...this.rackRow.values()];
    const racksByRoom = new Map<string, Row[]>();
    for (const r of racks) { const k = str(r, 'room_id') as string; const a = racksByRoom.get(k) ?? []; a.push(r); racksByRoom.set(k, a); }
    const roomsByFloor = new Map<string, Row[]>();
    for (const rm of rooms) { this.room.set(str(rm, 'room_id') as string, rm); const k = str(rm, 'floor_id') as string; const a = roomsByFloor.get(k) ?? []; a.push(rm); roomsByFloor.set(k, a); }
    // Cooling capacity and design supply per room (from the cooling units).
    const coolByRoom = new Map<string, { kw: number; air: number[]; liquid: number[] }>();
    for (const u of this.rows('Cooling_Units')) {
      const k = str(u, 'room_id') as string; const e = coolByRoom.get(k) ?? { kw: 0, air: [], liquid: [] };
      e.kw += num(u, 'capacity_kw') ?? 0;
      const sup = num(u, 'design_supply_c'); if (sup != null) (str(u, 'type') === 'CDU' ? e.liquid : e.air).push(sup);
      coolByRoom.set(k, e);
    }
    const rackRoles = W.all<T.RackRole>('rackRoles');
    const roleIdFor = (role: string) => {
      const hit = rackRoles.find((x) => x.name.toLowerCase() === role.toLowerCase());
      if (hit) return hit.id;
      const id = `RR-NC-${slug(role)}`;
      W.put('rackRoles', { id, rrId: id, ...this.meta(role), name: role, slug: role.toLowerCase().replace(/[^a-z0-9]+/g, '-'), color: role === 'Core' ? '#dc2626' : role === 'Access' ? '#2563eb' : '#7c3aed' } satisfies T.RackRole);
      return id;
    };
    const rackTypes = W.all<T.RackType>('rackTypes');
    const rackTypeFor = (u: number) => rackTypes.find((t) => t.uHeight === u && (t.widthIn ?? 19) === 19)?.id;

    const rackDrawBySite = this.rackDrawBySite;
    let rowCount = 0; let gridFixed = 0; let containmentBlank = 0; let areaEstimated = 0;
    const areaOfRoom = new Map<string, number>();
    for (const rm of rooms) {
      const roomId = str(rm, 'room_id') as string;
      const siteId = str(rm, 'site_id') as string;
      const siteStatus = this.siteStatus.get(siteId) ?? 'Operational';
      const list = racksByRoom.get(roomId) ?? [];
      const nRows = Math.max(1, num(rm, 'rack_rows') ?? 1);
      // Rows: the workbook's row letters when given; otherwise racks are dealt in sheet order, an equal share per row.
      const hasRowCol = list.some((r) => str(r, 'row'));
      const rowsOfRoom: { name: string; racks: Row[] }[] = [];
      if (hasRowCol) {
        const by = new Map<string, Row[]>();
        for (const r of list) { const k = str(r, 'row') ?? '?'; const a = by.get(k) ?? []; a.push(r); by.set(k, a); }
        for (const [k, a] of [...by.entries()].sort((x, y) => x[0].localeCompare(y[0]))) rowsOfRoom.push({ name: `Row ${k}`, racks: a.sort((x, y) => (num(x, 'position') ?? 0) - (num(y, 'position') ?? 0)) });
      } else {
        const per = Math.max(1, Math.ceil(list.length / nRows));
        for (let i = 0; i < nRows; i++) rowsOfRoom.push({ name: `Row ${String.fromCharCode(65 + i)}`, racks: list.slice(i * per, (i + 1) * per) });
        if (list.length) gridFixed += list.length;
      }
      const cols = Math.max(1, ...rowsOfRoom.map((r) => r.racks.length));
      const grows = Math.max(1, rowsOfRoom.length);
      const containmentWb = str(rm, 'containment');
      const containment: T.Row['containment'] = /cold/i.test(containmentWb ?? '') ? 'Cold-Aisle' : /hot/i.test(containmentWb ?? '') ? 'Hot-Aisle' : 'None';
      if (!containmentWb) containmentBlank++;
      const area = num(rm, 'area_sqm') ?? Math.max(30, Math.round(list.length * 3.2 + 20));
      if (num(rm, 'area_sqm') == null) areaEstimated++;
      areaOfRoom.set(roomId, area);
      const zoneId = `${roomId}-CZ`;
      this.zoneOfRoom.set(roomId, zoneId);

      // racks first (draw feeds the hall and zone roll-ups)
      let hallKw = 0; let hallDraw = 0;
      rowsOfRoom.forEach((row, ri) => {
        const rowId = `${roomId}-ROW-${String.fromCharCode(65 + ri)}`;
        if (row.racks.length || ri < nRows) {
          rowCount++;
          W.put('rows', { id: rowId, rowId, ...this.meta(rowId), hallId: roomId, name: row.name, gridPosition: `${ri}`, containment, rackCount: row.racks.length } satisfies T.Row);
        }
        row.racks.forEach((r, xi) => {
          const rack = this.rack(r, { rowId, hallId: roomId, gridX: hasRowCol && num(r, 'position') ? (num(r, 'position') as number) - 1 : xi, gridY: ri, zoneId, siteStatus, roleIdFor, rackTypeFor });
          hallKw += rack.maxPowerKw; hallDraw += rack.currentPowerKw;
          rackDrawBySite.set(siteId, (rackDrawBySite.get(siteId) ?? 0) + rack.currentPowerKw);
        });
      });

      const cool = coolByRoom.get(roomId);
      const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : undefined);
      const setpoint = r1(avg(cool?.air ?? []) ?? avg(cool?.liquid ?? []) ?? 22);
      const capKw = Math.round(cool?.kw ?? 0);
      W.put('coolingZones', { id: zoneId, coolzId: zoneId, ...this.meta(zoneId), dataCenterId: siteId, name: `${str(rm, 'room_name') ?? roomId} cooling`, coolingCapacityKw: capKw, currentLoadKw: r1(hallDraw), headroomKw: r1(capKw - hallDraw), setpointC: setpoint, notes: `${str(rm, 'cooling_method') ?? 'Air'} cooled; setpoint is the average design supply temperature of the room's units` } satisfies T.CoolingZone);
      const hall: T.Hall = {
        id: roomId, hallId: roomId, ...this.meta(roomId), floorId: str(rm, 'floor_id') as string, dataCenterId: siteId, name: str(rm, 'room_name') ?? roomId,
        gridCols: cols, gridRows: grows, designPowerKw: Math.round(hallKw), coolingZoneId: zoneId, rackCount: list.length, rackCapacity: cols * grows, utilizationPct: pct(list.length, cols * grows),
        status: siteStatus === 'Planned' ? 'Planned' : siteStatus === 'Construction' ? 'Fitting' : 'Live', areaSqm: area,
        roomType: (str(rm, 'room_type') ?? 'Data hall') as T.RoomType, coolingMethod: (str(rm, 'cooling_method') ?? 'Air') as T.Hall['coolingMethod'],
        containment: containment === 'Cold-Aisle' ? 'Cold aisle' : containment === 'Hot-Aisle' ? 'Hot aisle' : 'None',
      };
      W.put('halls', hall);
    }
    this.fixAll('RACK_GRID', 'Rack row and position blank: racks placed on the hall grid in sheet order, an equal share in each of the room\'s rack_rows rows', gridFixed);
    this.fixAll('CONTAINMENT', 'Room containment blank: recorded as None', containmentBlank);
    this.fixAll('AREA', 'Room area blank: estimated as 3.2 m² per rack + 20 m² (floor and building areas summed from the rooms)', areaEstimated);

    // Floors and building areas (sum of rooms).
    const bldArea = new Map<string, number>();
    for (const f of floors) {
      const fid = str(f, 'floor_id') as string; const siteId = str(f, 'site_id') as string;
      const fr = roomsByFloor.get(fid) ?? [];
      const usable = fr.reduce((a, rm) => a + (areaOfRoom.get(str(rm, 'room_id') as string) ?? 0), 0);
      const ai = fr.some((rm) => str(rm, 'room_type') === 'AI hall');
      bldArea.set(siteId, (bldArea.get(siteId) ?? 0) + usable);
      W.put('floors', { id: fid, flrId: fid, ...this.meta(fid), buildingId: `${siteId}-BLD`, name: str(f, 'floor_name') ?? fid, level: num(f, 'level') ?? 0, usableAreaSqm: Math.max(usable, 30), floorLoadingKgSqm: ai ? 1800 : 1200, hallCount: fr.length } satisfies T.Floor);
    }
    for (const [siteId, area] of bldArea) { const b = W.get<T.Building>('buildings', `${siteId}-BLD`); if (b) W.put('buildings', { ...b, grossAreaSqm: Math.round(area * 1.4) }); }
    this.sheet('Floors', floors.length, `${floors.length} floors`);
    this.sheet('Rooms', rooms.length, `${rooms.length} halls (room types kept), ${rooms.length} cooling zones, ${rowCount} rows`);
    this.sheet('Racks', racks.length, `${racks.length} racks`);
  }
  private rackDrawBySite = new Map<string, number>();

  private rack(r: Row, p: { rowId: string; hallId: string; gridX: number; gridY: number; zoneId: string; siteStatus: T.DataCenter['status']; roleIdFor: (role: string) => string; rackTypeFor: (u: number) => string | undefined }): T.Rack {
    const id = str(r, 'rack_id') as string;
    const role = str(r, 'role') ?? 'Compute';
    const purpose = RACK_PURPOSE[role] ?? 'Mixed';
    if (purpose !== role) this.fix('RACK_ROLE', 'Rack role outside the DCOS purpose list: Core, Access and ODF / patching racks recorded as Network (the original role is kept as the rack role)', `${role} → ${purpose}`);
    const heightU = num(r, 'height_u') ?? 42;
    const budget = num(r, 'power_budget_kw') ?? 0;
    const devs = this.devsByRack.get(id) ?? [];
    const usedU = Math.min(heightU, devs.reduce((a, d) => a + (num(d, 'u_size') ?? 1), 0));
    const ready = devs.filter((d) => str(d, 'lifecycle') !== 'Planned');
    const rated = ready.reduce((a, d) => a + deviceProfile(str(d, 'role') ?? '', str(d, 'model') ?? '', num(d, 'u_size') ?? 1).w, 0) / 1000;
    const f = p.siteStatus === 'Operational' ? frac(id, 0.45, 0.8) : p.siteStatus === 'Construction' ? frac(id, 0.15, 0.35) : 0;
    const draw = ready.length ? r1(Math.min(budget * f, rated * 0.95)) : 0;
    const weight = devs.reduce((a, d) => a + deviceProfile(str(d, 'role') ?? '', str(d, 'model') ?? '', num(d, 'u_size') ?? 1).kg, 0);
    const ai = str(r, 'density') === 'ai';
    const feedA = str(r, 'pdu_feed_a'), feedB = str(r, 'pdu_feed_b');
    const status: T.Rack['status'] = p.siteStatus === 'Planned' ? 'Planned' : p.siteStatus === 'Construction' && !ready.length ? 'Planned' : heightU - usedU <= 2 ? 'Full' : 'Active';
    const ownerKind = (str(r, 'owner') ?? 'operator') === 'tenant' ? 'tenant' as const : 'operator' as const;
    const tenantWb = str(r, 'tenant_customer_id');
    const rack: T.Rack = {
      id, rackId: id, ...this.meta(id), rowId: p.rowId, hallId: p.hallId, dataCenterId: str(r, 'site_id') as string, name: str(r, 'rack_name') ?? id,
      gridX: p.gridX, gridY: p.gridY, heightU, usedU, availableU: heightU - usedU, widthMm: 600, depthMm: ai ? 1200 : 1070,
      maxWeightKg: ai ? 1800 : 1200, currentWeightKg: Math.round(weight + 120), maxPowerKw: budget, currentPowerKw: draw, powerUtilizationPct: pct(draw, budget),
      redundancy: feedA && feedB ? '2N' : 'N', coolingZoneId: p.zoneId, thermalDensityKwPerRack: draw, purpose, status,
      liquidCoolingReady: yes(r, 'liquid_cooled'), owner: ownerKind === 'tenant' ? (tenantWb ?? 'Tenant') : this.o.operator, roleId: p.roleIdFor(role), rackTypeId: p.rackTypeFor(heightU),
      widthIn: 19, startingUnit: 1, descendingUnits: false, outerWidthMm: 600, outerDepthMm: ai ? 1250 : 1100, mountingDepthMm: ai ? 1150 : 1000,
      density: ai ? 'ai' : 'standard', liquidCooled: yes(r, 'liquid_cooled'), cduId: str(r, 'cdu_id'), feedAId: feedA, feedBId: feedB,
      ownerKind, tenantCustomerId: tenantWb, contractedKw: num(r, 'contracted_kw'),
      notes: role !== purpose ? `Workbook role: ${role}` : undefined,
    };
    this.rackRec.set(id, rack);
    this.W.put('racks', rack);
    return rack;
  }

  /* ── Power_Feeds, UPS, Generators, DC_Plant ── */
  private power() {
    const { W } = this;
    const feeds = this.rows('Power_Feeds');
    for (const f of feeds) {
      const id = str(f, 'feed_id') as string; this.feedIds.add(id);
      const rating = str(f, 'rating') ?? '';
      const volts = Number(/(\d+(?:\.\d+)?)\s*(k?)V\b/.exec(rating)?.[1] ?? 0) * (/(\d+(?:\.\d+)?)\s*kV\b/.test(rating) ? 1000 : 1);
      const amps = Number(/(\d[\d,]*)\s*A\b/.exec(rating)?.[1]?.replace(/,/g, '') ?? 0) || undefined;
      const supply = (str(f, 'type') ?? 'AC') === 'DC' ? 'DC' as const : 'AC' as const;
      const source = str(f, 'source') ?? id;
      W.put('utilityFeeds', {
        id, feedId: id, ...this.meta(id), dataCenterId: str(f, 'site_id') as string, name: source, capacityKw: num(f, 'capacity_kw') ?? 0, voltage: volts || (supply === 'DC' ? 48 : 415),
        provider: supply === 'DC' ? 'Site DC plant' : 'Grid utility', redundancyRole: /\bB\b|-2$/.test(source) || /-AC-2$/.test(id) ? 'B-side' : 'A-side',
        supply, ratingText: rating || undefined, currentA: amps, normalRole: (str(f, 'normal_role') ?? 'Active') as 'Active' | 'Standby', utilityAccount: str(f, 'utility_account'),
      } satisfies T.UtilityFeed);
    }
    this.sheet('Power_Feeds', feeds.length, `${feeds.length} utility feeds (AC and −48 V DC)`);

    const ups = this.rows('UPS');
    const upsBySite = new Map<string, Row[]>();
    for (const u of ups) { const k = str(u, 'site_id') as string; const a = upsBySite.get(k) ?? []; a.push(u); upsBySite.set(k, a); }
    for (const [siteId, list] of upsBySite) {
      const cap = list.reduce((a, u) => a + (num(u, 'capacity_kw') ?? 0), 0);
      const draw = this.rackDrawBySite.get(siteId) ?? 0;
      const status = this.siteStatus.get(siteId);
      list.forEach((u, i) => {
        const id = str(u, 'ups_id') as string;
        const c = num(u, 'capacity_kw') ?? 0;
        const load = r1(Math.min(c * 0.95, cap ? (draw * c) / cap : 0));
        const feed = [`${siteId}-AC-${(i % 2) + 1}`, `${siteId}-AC-1`].find((x) => this.feedIds.has(x));
        W.put('upsUnits', {
          id, upsId: id, ...this.meta(id), dataCenterId: siteId, name: str(u, 'name') ?? id, capacityKw: c, loadKw: load, loadPct: pct(load, c),
          redundancy: (str(u, 'redundancy') ?? 'N+1') as T.UPS['redundancy'], runtimeMinutes: num(u, 'battery_autonomy_min') ?? 0, feedId: feed,
          status: status === 'Planned' ? 'Planned' : 'Operational', hallId: str(u, 'room_id'), serial: str(u, 'serial'), manufacturer: str(u, 'vendor') ? vendorName(str(u, 'vendor') as string) : undefined, model: str(u, 'model'),
        } satisfies T.UPS);
      });
    }
    this.fixAll('UPS_LOAD', 'UPS load not in the workbook: the site\'s rack draw shared across its UPS by capacity', ups.length);
    this.sheet('UPS', ups.length, `${ups.length} UPS`);

    const gens = this.rows('Generators');
    for (const g of gens) {
      const id = str(g, 'dg_id') as string; const kva = num(g, 'kva') ?? 0;
      W.put('generators', {
        id, genId: id, ...this.meta(id), dataCenterId: str(g, 'site_id') as string, name: str(g, 'name') ?? id, capacityKva: kva, capacityKw: Math.round(kva * 0.8), fuelHours: num(g, 'runtime_h_full_load') ?? 0,
        redundancyRole: 'N', status: this.siteStatus.get(str(g, 'site_id') as string) === 'Planned' ? 'Planned' : 'Operational', fuelTankLitres: num(g, 'fuel_tank_litres'),
        lastTestDate: str(g, 'last_test_date'), lastTestResult: str(g, 'last_test_result') as T.Generator['lastTestResult'],
      } satisfies T.Generator);
    }
    this.fixAll('GEN_KW', 'Generator kW not in the workbook: rated kW = kVA × 0.8', gens.length);
    this.sheet('Generators', gens.length, `${gens.length} generators`);

    const plant = this.rows('DC_Plant');
    for (const p of plant) {
      const id = str(p, 'plant_id') as string;
      const kind = str(p, 'kind') === 'Battery bank' ? 'Battery bank' as const : 'Rectifier' as const;
      const rated = str(p, 'rated_output');
      W.put('dcPlants', {
        id, dcpId: id, ...this.meta(id), kind, name: str(p, 'name') ?? id, dataCenterId: str(p, 'site_id') as string, hallId: str(p, 'room_id'),
        volts: num(p, 'volts') ?? (rated ? Number(/(\d+)\s*V/.exec(rated)?.[1]) || 48 : 48), ah: num(p, 'ah'), ratedOutput: rated, capacityKw: num(p, 'capacity_kw'), autonomyH: num(p, 'autonomy_h'),
        lastTestDate: str(p, 'last_test_date'), status: this.siteStatus.get(str(p, 'site_id') as string) === 'Planned' ? 'Planned' : 'Operational',
      } satisfies T.DcPlant);
    }
    this.sheet('DC_Plant', plant.length, `${plant.length} DC plant records (rectifiers and battery banks)`);
  }

  /* ── Cooling_Units (CRAH/CRAC/CDU as cooling plant), CDUs (liquid loop), Sensors ── */
  private cooling() {
    const { W } = this;
    const units = this.rows('Cooling_Units');
    const cdus = this.rows('CDUs');
    const cduNames = new Set(cdus.map((c) => `${str(c, 'room_id')}|${str(c, 'name')}`));
    let cduRows = 0; let retEst = 0;
    for (const u of units) {
      const id = str(u, 'unit_id') as string; const roomId = str(u, 'room_id') as string;
      const type = (str(u, 'type') ?? 'CRAH') as T.CRAC['type'];
      if (type === 'CDU') { cduRows++; if (!cduNames.has(`${roomId}|${str(u, 'name')}`)) this.warn('CDU_UNIT_NO_CDU', 'Cooling unit of type CDU with no row in the CDUs sheet', id); }
      const supply = num(u, 'design_supply_c') ?? (type === 'CDU' ? 30 : 18);
      retEst++;
      W.put('cracUnits', {
        id, cracId: id, ...this.meta(id), coolingZoneId: this.zoneOfRoom.get(roomId) ?? `${roomId}-CZ`, name: str(u, 'name') ?? id, capacityKw: num(u, 'capacity_kw') ?? 0, type,
        status: this.siteStatus.get(str(u, 'site_id') as string) === 'Planned' ? 'Planned' : 'Operational', supplyTempC: supply, returnTempC: r1(supply + (type === 'CDU' ? 8 : 11)), model: str(u, 'model'),
        notes: type === 'CDU' ? 'Facility side of the liquid loop (the CDU record holds flow and the racks it feeds)' : undefined,
      } satisfies T.CRAC);
      if (!this.room.has(roomId)) this.warn('UNIT_ROOM_MISSING', 'Cooling unit in a room that is not in the Rooms sheet', id);
    }
    this.fixAll('RETURN_TEMP', 'Return temperature not in the workbook: design supply + 11 °C (air) or + 8 °C (CDU)', retEst);
    this.sheet('Cooling_Units', units.length, `${units.length - cduRows} CRAH/CRAC + ${cduRows} CDU cooling units (CDU rows matched to the CDUs sheet, not counted twice)`);
    for (const c of cdus) {
      const id = str(c, 'cdu_id') as string; const roomId = str(c, 'room_id') as string;
      W.put('cdus', {
        id, cduId: id, ...this.meta(id), name: str(c, 'name') ?? id, dataCenterId: str(c, 'site_id') as string, hallId: roomId, coolingZoneId: this.zoneOfRoom.get(roomId),
        capacityKw: num(c, 'capacity_kw') ?? 0, nominalFlowLpm: num(c, 'nominal_flow_lpm') ?? 0, designSupplyC: num(c, 'design_supply_c'),
        status: this.siteStatus.get(str(c, 'site_id') as string) === 'Planned' ? 'Planned' : 'Operational',
      } satisfies T.Cdu);
      if (!this.room.has(roomId)) this.warn('CDU_ROOM_MISSING', 'CDU in a room that is not in the Rooms sheet', id);
    }
    this.sheet('CDUs', cdus.length, `${cdus.length} CDUs`);
    const sensors = this.rows('Sensors');
    for (const s of sensors) {
      const id = str(s, 'sensor_id') as string; const site = str(s, 'site_id') as string;
      W.put('envSensors', {
        id, snsId: id, ...this.meta(id), name: id.startsWith(`${site}-`) ? id.slice(site.length + 1) : id, dataCenterId: site, hallId: str(s, 'room_id'),
        kind: str(s, 'kind') ?? 'Temperature + humidity', position: str(s, 'position'), bmsPoint: str(s, 'bms_point'),
      } satisfies T.EnvSensor);
    }
    this.sheet('Sensors', sensors.length, `${sensors.length} environment sensors`);
  }

  private collectors() {
    const cols = this.rows('Collectors');
    for (const c of cols) {
      const id = str(c, 'collector_id') as string;
      const site = str(c, 'site_id') as string;
      const rec: T.Collector = {
        id, colId: id, ...this.meta(id), name: str(c, 'name') ?? id, dataCenterId: site, protocol: str(c, 'protocol') ?? 'SNMP', domain: (str(c, 'domain') ?? 'Network') as T.Collector['domain'],
        hostIp: str(c, 'host_ip'), covers: str(c, 'covers'), status: this.siteStatus.get(site) === 'Planned' ? 'Down' : 'Healthy',
      };
      this.collectorRec.set(id, rec);
      this.W.put('collectors', rec);
    }
    const withCol = new Set(cols.map((c) => str(c, 'site_id')));
    for (const s of this.site.keys()) if (!withCol.has(s)) this.warn('SITE_NO_COLLECTOR', 'Site without a monitoring collector', s);
    this.sheet('Collectors', cols.length, `${cols.length} collectors`);
  }

  /* ── Devices → manufacturers, device types, devices, managed devices ── */
  private devices() {
    const { W } = this;
    const mfrs = W.all<T.Manufacturer>('manufacturers');
    const mfrId = (name: string) => {
      const hit = mfrs.find((m) => m.name.toLowerCase() === name.toLowerCase());
      if (hit) return hit.id;
      const id = `MFR-NC-${slug(name)}`;
      W.put('manufacturers', { id, mfrId: id, ...this.meta(name), name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: `${name} hardware` } satisfies T.Manufacturer);
      return id;
    };
    const roleIds = new Map(W.all<T.DeviceRoleEntity>('deviceRoles').map((r) => [r.name, r.id]));
    const platIds = new Map(W.all<T.PlatformEntity>('platforms').map((p) => [p.name, p.id]));
    const types = W.all<T.DcimDeviceType>('deviceTypes');
    const dtFor = new Map<string, string>();
    const deviceTypeId = (vendor: string, model: string, u: number, role: string, layer: string | undefined, platform: string) => {
      const key = `${vendor}|${model}|${u}`;
      const hit = dtFor.get(key);
      if (hit) return hit;
      // One catalogue: reuse a type already on file (demo or another workbook) with the same make, model and height.
      const known = types.find((t) => t.manufacturer === vendor && t.model === model && t.uHeight === u);
      if (known) { dtFor.set(key, known.id); return known.id; }
      const id = `DT-NC-${slug(`${vendor}-${model}`)}${types.some((t) => t.id === `DT-NC-${slug(`${vendor}-${model}`)}` && t.uHeight !== u) ? `-${u}U` : ''}`;
      const p = deviceProfile(role, model, u);
      W.put('deviceTypes', {
        id, dtId: id, ...this.meta(`${vendor} ${model}`), manufacturer: vendor, manufacturerId: mfrId(vendor), model, slug: `${vendor}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        partNumber: model.replace(/\s*\(.*\)\s*/, '').replace(/\s+/g, '-').toUpperCase(), uHeight: u, isFullDepth: !NETWORK_ROLES.has(role) || role === 'Router',
        airflow: 'front-to-rear', weight: p.kg, weightUnit: 'kg', role: dcimRole(role, layer) as T.DcimDeviceType['role'], platform: platform as T.DcimDeviceType['platform'],
        description: `${vendor} ${model} (${role}; catalogued from the ${this.o.operator} workbook)`, excludeFromUtilization: false, defaultPlatformId: platIds.get(platform),
      } satisfies T.DcimDeviceType);
      dtFor.set(key, id);
      return id;
    };
    const devs = [...this.devRow.values()];
    const serials = new Map<string, string[]>(); const ips = new Map<string, string[]>(); const macs = new Map<string, string[]>();
    const vendorsFixed = new Set<string>();
    let junos = 0;
    for (const d of devs) {
      const id = str(d, 'device_id') as string;
      const site = str(d, 'site_id') as string;
      const role = str(d, 'role') ?? 'Server';
      const layer = str(d, 'layer');
      const vRaw = str(d, 'vendor') ?? 'Unknown'; const vendor = vendorName(vRaw);
      if (vendor !== vRaw) vendorsFixed.add(`${vRaw} → ${vendor}`);
      const model = str(d, 'model') ?? 'Unknown';
      const u = num(d, 'u_size') ?? 1;
      let os = str(d, 'os_version');
      if (vendor === 'Juniper' && os && /^\d/.test(os)) { os = `Junos ${os}`; junos++; }
      const platform = platformOf(vendor, os, role);
      const planned = str(d, 'lifecycle') === 'Planned';
      const rackId = str(d, 'rack_id');
      const rack = rackId ? this.rackRec.get(rackId) : undefined;
      if (rackId && !rack) this.warn('DEVICE_RACK_MISSING', 'Device in a rack that is not in the Racks sheet', id);
      const prof = deviceProfile(role, model, u);
      const colId = str(d, 'collector_id');
      if (colId && !this.collectorRec.has(colId)) this.warn('DEVICE_COLLECTOR_MISSING', 'Device polled by a collector that is not in the Collectors sheet', id);
      const network = NETWORK_ROLES.has(role);
      const serial = str(d, 'serial'); const ip = str(d, 'mgmt_ip'); const mac = str(d, 'mac');
      if (serial) { const a = serials.get(serial) ?? []; a.push(id); serials.set(serial, a); }
      if (ip) { const k = `${site} ${ip}`; const a = ips.get(k) ?? []; a.push(id); ips.set(k, a); }
      if (mac) { const a = macs.get(mac.toUpperCase()) ?? []; a.push(id); macs.set(mac.toUpperCase(), a); }
      const dev: T.Device = {
        id, devcId: id, ...this.meta(id), name: str(d, 'hostname') ?? id, deviceTypeId: deviceTypeId(vendor, model, u, role, layer, platform), rackId, dataCenterId: site,
        position: num(d, 'u_position'), status: planned ? 'Planned' : 'Active', serial, face: 'front', primaryIp4: ip, deviceRoleId: roleIds.get(dcimRole(role, layer)),
        platformId: platIds.get(platform), airflow: 'front-to-rear', hostname: str(d, 'hostname') ?? id, manufacturer: vendor, model, category: CATEGORY[role] ?? 'Other', heightU: u,
        powerDrawW: 0, ratedThermalW: prof.w, weightKg: prof.kg, lifecycleState: planned ? 'Ordered' : 'Active', ownerTeam: this.o.operator,
        commissionedDate: planned ? undefined : iso(str(this.site.get(site) ?? {}, 'commissioned_on')),
        networkLayer: network ? (layer as T.NetworkLayer | undefined) : undefined, wanEdge: yes(d, 'wan_edge'), monitored: yes(d, 'monitored'), collectorId: colId,
        osVersion: os, macAddress: mac?.toUpperCase(), ownerKind: (str(d, 'owner') ?? 'operator') === 'tenant' ? 'tenant' : 'operator', tenantCustomerId: str(d, 'tenant_customer_id'),
      };
      this.devRec.set(id, dev);
      if (network && yes(d, 'monitored') && !planned) {
        this.managed.add(id);
        const col = colId ? this.collectorRec.get(colId) : undefined;
        const down = (this.activeAlarmsByDev.get(id) ?? []).some((a) => /unreachable/i.test(str(a, 'title') ?? ''));
        W.put('managedDevices', {
          id, devId: id, ...this.meta(id), assetId: id, hostname: dev.hostname as string, mgmtIp: ip ?? '', deviceType: role as T.ManagedDevice['deviceType'], vendor, model, osVersion: os ?? '',
          role: role === 'Firewall' ? 'Firewall' : layer ? layer[0].toUpperCase() + layer.slice(1) : role, dataCenterId: site, rackId, reachability: down ? 'Unreachable' : 'Reachable',
          lastPolledAt: new Date(Date.parse(this.at) - (2 + (hashOf(id) % 9)) * 60_000).toISOString(), uptimeSeconds: (20 + (hashOf(`${id}#up`) % 380)) * 86_400 + (hashOf(id) % 86_400),
          sourceSystem: col ? `Databyte ${col.protocol} agent` : 'Databyte SNMP agent',
        } satisfies T.ManagedDevice);
      }
    }
    // Draw: each Ready device takes its share of the rack draw in proportion to its rated power.
    for (const [rackId, list] of this.devsByRack) {
      const rack = this.rackRec.get(rackId); if (!rack) continue;
      const ready = list.map((d) => this.devRec.get(str(d, 'device_id') as string) as T.Device).filter((d) => d && d.lifecycleState !== 'Ordered');
      const rated = ready.reduce((a, d) => a + (d.ratedThermalW ?? 0), 0);
      for (const d of ready) d.powerDrawW = rated ? Math.round((rack.currentPowerKw * 1000 * (d.ratedThermalW ?? 0)) / rated) : 0;
    }
    for (const d of this.devRec.values()) W.put('devices', d);
    this.fixAll('VENDOR_CASE', 'Vendor names in capitals: matched to the manufacturer catalogue spelling', devs.filter((d) => vendorName(str(d, 'vendor') ?? '') !== str(d, 'vendor')).length, [...vendorsFixed]);
    this.fixAll('JUNOS_OS', 'Juniper OS version given without the OS name: prefixed "Junos"', junos, ['23.4R2-S2 → Junos 23.4R2-S2']);
    this.fixAll('RACK_DRAW', 'Rack and device draw not in the workbook: live sites run each rack at 45–80 % of its budget (15–35 % on sites in build), capped at 95 % of the installed kit\'s rated power and shared across the devices by rated power', this.rackRec.size);
    const dups = (m: Map<string, string[]>) => [...m.entries()].filter(([, a]) => a.length > 1);
    const dupLine = (d: [string, string[]][]) => d.slice(0, 8).map(([k, a]) => `${k}: ${a.slice(0, 3).join(', ')}${a.length > 3 ? ` (+${a.length - 3})` : ''}`);
    const ds = dups(serials), di = dups(ips), dm = dups(macs);
    this.warnAll('DUPLICATE_SERIAL', 'Serial number shared by more than one device (imported as is)', ds.reduce((a, [, x]) => a + x.length, 0), dupLine(ds));
    this.warnAll('DUPLICATE_MGMT_IP', 'Management IP shared by more than one device at the same site (imported as is)', di.reduce((a, [, x]) => a + x.length, 0), dupLine(di));
    this.warnAll('DUPLICATE_MAC', 'MAC address shared by more than one device (imported as is)', dm.reduce((a, [, x]) => a + x.length, 0), dupLine(dm));
    this.sheet('Devices', devs.length, `${devs.length} devices, ${this.managed.size} managed (NMS) network devices, ${dtFor.size} device types`);
  }

  /* ── Modules → inventory items ── */
  private modules() {
    const { W } = this;
    const roles = W.all<T.InventoryItemRole>('inventoryItemRoles');
    const roleId = (name: string) => {
      const hit = roles.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (hit) return hit.id;
      const id = `IIR-NC-${slug(name)}`;
      W.put('inventoryItemRoles', { id, iirId: id, ...this.meta(name), name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), color: name === 'GPU' ? '#7c3aed' : name === 'Disk' ? '#0891b2' : '#64748b' } satisfies T.InventoryItemRole);
      return id;
    };
    const roleOf = (slot: string, name: string) => /^(PSU|PEM)/i.test(slot) ? 'PSU' : /^FAN/i.test(slot) ? 'Fan' : /^GPU/i.test(slot) ? 'GPU' : /^CTRL/i.test(slot) ? 'Controller'
      : /^(DISK|SHELF)/i.test(slot) ? 'Disk' : /^RE\d/i.test(slot) ? 'Routing engine' : /^FPC|MPC/i.test(slot) || /MPC/.test(name) ? 'Line card' : 'Module';
    const mods = this.rows('Modules');
    let n = 0;
    for (const m of mods) {
      const devId = str(m, 'device_id') as string; const slot = str(m, 'slot') ?? `M${n}`;
      const dev = this.devRec.get(devId);
      if (!dev) { this.warn('MODULE_DEVICE_MISSING', 'Module on a device that is not in the Devices sheet', `${devId} ${slot}`); continue; }
      const id = `${devId}:${slot}`;
      const name = str(m, 'name') ?? slot;
      W.put('inventoryItems', { id, invId: id, ...this.meta(id), deviceId: devId, roleId: roleId(roleOf(slot, name)), name: slot, label: name, manufacturer: dev.manufacturer, partNumber: name, serial: str(m, 'serial'), discovered: !!dev.monitored } satisfies T.InventoryItem);
      n++;
    }
    this.sheet('Modules', mods.length, `${n} inventory items (PSUs, fans, GPUs, controllers, disks, routing engines)`);
  }

  /* ── Interfaces → device components (+ NMS interfaces on managed gear) ── */
  private interfaces() {
    const { W } = this;
    const rows = this.rows('Interfaces');
    const linked = new Set<string>();
    for (const l of this.rows('Links')) if (str(l, 'protocol') === 'LLDP') { linked.add(`${str(l, 'a_device_id')}|${str(l, 'a_if_name')}`); linked.add(`${str(l, 'z_device_id')}|${str(l, 'z_if_name')}`); }
    const flapping = new Set<string>();
    for (const [dev, al] of this.activeAlarmsByDev) for (const a of al) if (str(a, 'if_name') && /flap|down|optical|crc|error/i.test(str(a, 'title') ?? '')) flapping.add(`${dev}|${str(a, 'if_name')}`);
    let nms = 0; let opticMismatch = 0; const mismatchEx: string[] = [];
    for (const f of rows) {
      const devId = str(f, 'device_id') as string; const name = str(f, 'if_name') as string;
      const dev = this.devRec.get(devId);
      if (!dev) { this.warn('IFACE_DEVICE_MISSING', 'Interface on a device that is not in the Devices sheet', `${devId} ${name}`); continue; }
      const key = `${devId}|${name}`;
      const id = `${devId}:${name}`;
      const wbType = str(f, 'type') ?? '';
      const speed = num(f, 'speed_mbps');
      const admin = (str(f, 'admin_state') ?? 'up').toLowerCase();
      const optic = str(f, 'optic_model');
      if (optic && /400G|OSFP/.test(wbType) && /10G/.test(optic)) { opticMismatch++; if (mismatchEx.length < 4) mismatchEx.push(`${devId} ${name}: ${optic} in a ${wbType} port`); }
      const mgmt = /^(mgmt|fxp|em\d|bmc|ipmi|idrac|management)/i.test(name);
      const desc = str(f, 'description');
      W.put('deviceComponents', {
        id, dcompId: id, ...this.meta(`${devId} ${name}`), deviceId: devId, kind: 'interface', name, label: desc ?? (admin === 'reserved' ? 'Reserved' : undefined), ifaceType: IFACE_TYPE[wbType] ?? wbType,
        enabled: admin === 'up', mgmtOnly: mgmt, speedMbps: speed, duplex: 'full', mtu: mgmt ? 1500 : 9216, macAddress: mgmt ? dev.macAddress : undefined, mode: mgmt ? 'Access' : undefined,
        customFields: optic ? { optic } : undefined, notes: admin === 'reserved' ? 'Reserved port (admin state "reserved" in the workbook)' : undefined,
      } satisfies T.DeviceComponent);
      this.compId.set(key, id); if (speed) this.compSpeed.set(key, speed); this.compOptic.set(key, optic);
      if (this.managed.has(devId)) {
        const nid = `IF-${devId}:${name}`;
        const isUp = admin === 'up' && linked.has(key) && !flapping.has(key);
        const h = hashOf(nid);
        W.put('interfaces', {
          id: nid, ifaceId: nid, ...this.meta(`${devId} ${name}`), deviceId: devId, name, adminStatus: admin === 'admin-down' ? 'Down' : 'Up',
          operStatus: admin === 'reserved' ? 'Dormant' : isUp ? 'Up' : 'Down', speedGbps: (speed ?? 0) / 1000, utilizationPct: isUp ? 8 + (h % 62) : 0,
          inErrors: flapping.has(key) ? 40 + (h % 120) : h % 23 === 0 ? h % 7 : 0, outErrors: flapping.has(key) ? h % 30 : 0,
        } satisfies T.Interface);
        this.nmsIfId.set(key, nid); nms++;
      }
    }
    this.warnAll('OPTIC_MISMATCH', 'Optic model does not fit the port (10G LR optic recorded on 400G OSFP ports): kept on the interface, ignored for the cable type', opticMismatch, mismatchEx);
    this.sheet('Interfaces', rows.length, `${rows.length} interface components, ${nms} NMS interfaces on managed network devices`);
  }

  /* ── Links → cables (LLDP), topology links, routing sessions ── */
  private links() {
    const { W, o } = this;
    const rows = this.rows('Links');
    let cables = 0, sessions = 0, topo = 0;
    for (const l of rows) {
      const wbId = str(l, 'link_id') as string;
      const id = `${o.clashPrefix}${wbId}`;
      const aDev = str(l, 'a_device_id') as string, zDev = str(l, 'z_device_id') as string;
      const aIf = str(l, 'a_if_name') as string, zIf = str(l, 'z_if_name') as string;
      const A = this.devRec.get(aDev), Z = this.devRec.get(zDev);
      if (!A || !Z) { this.warn('LINK_DEVICE_MISSING', 'Link to a device that is not in the Devices sheet', wbId); continue; }
      const protocol = str(l, 'protocol') ?? 'LLDP';
      const role = str(l, 'role') as T.LinkRole | undefined;
      const cap = num(l, 'capacity_mbps');
      const planned = A.lifecycleState === 'Ordered' || Z.lifecycleState === 'Ordered';
      if (protocol === 'LLDP') {
        const ac = this.compId.get(`${aDev}|${aIf}`), zc = this.compId.get(`${zDev}|${zIf}`);
        if (!ac || !zc) { this.warn('LINK_PORT_MISSING', 'LLDP link to a port that is not in the Interfaces sheet', wbId); continue; }
        const speed = cap ?? this.compSpeed.get(`${aDev}|${aIf}`) ?? 0;
        const optic = this.compOptic.get(`${aDev}|${aIf}`) ?? this.compOptic.get(`${zDev}|${zIf}`);
        const sameRack = A.rackId && A.rackId === Z.rackId;
        const sameHall = A.rackId && Z.rackId && this.rackRec.get(A.rackId)?.hallId === this.rackRec.get(Z.rackId)?.hallId;
        const cableType: T.Cable['cableType'] = speed <= 1000 ? 'Cat6' : speed <= 100000 && optic && /LR/.test(optic) ? 'SMF-OS2' : sameRack ? 'DAC' : A.dataCenterId !== Z.dataCenterId ? 'SMF-OS2' : 'MMF-OM4';
        const lengthM = A.dataCenterId !== Z.dataCenterId ? undefined : sameRack ? 2 : sameHall ? 6 + (hashOf(id) % 25) : 40 + (hashOf(id) % 80);
        W.put('cables', {
          id, cblId: id, ...this.meta(wbId), status: planned ? 'Planned' : 'Active', cableType, label: str(l, 'cable_id') ?? wbId, lengthM,
          aKind: 'interface', aComponentId: ac, aDeviceId: aDev, bKind: 'interface', bComponentId: zc, bDeviceId: zDev,
          role, capacityMbps: cap, strand: str(l, 'strand'), aPatchPort: str(l, 'a_patch_port'), bPatchPort: str(l, 'z_patch_port'), carrierCircuitId: str(l, 'carrier_circuit_id'),
          notes: A.dataCenterId !== Z.dataCenterId ? `Inter-site span ${A.dataCenterId} ↔ ${Z.dataCenterId}` : undefined,
        } satisfies T.Cable);
        cables++;
        if (NETWORK_ROLES.has(this.roleOf(A)) && NETWORK_ROLES.has(this.roleOf(Z))) {
          const tid = `TOPO-${id}`;
          W.put('topologyLinks', { id: tid, topoId: tid, ...this.meta(wbId), aDeviceId: aDev, zDeviceId: zDev, layer: 'L2', discoveredVia: 'LLDP', status: planned ? 'Reserved' : 'Active' } satisfies T.TopologyLink);
          topo++;
        }
      } else {
        const proto = new RegExp(protocol, 'i');
        const down = [aDev, zDev].some((d) => (this.activeAlarmsByDev.get(d) ?? []).some((a) => proto.test(str(a, 'title') ?? '') && /down|flap|lost|idle/i.test(str(a, 'title') ?? '')));
        W.put('routingSessions', {
          id, rsId: id, ...this.meta(wbId), protocol, role, aDeviceId: aDev, aIfName: aIf, zDeviceId: zDev, zIfName: zIf, capacityMbps: cap, dataCenterId: A.dataCenterId,
          state: planned ? 'Planned' : down ? 'Down' : 'Established', notes: A.dataCenterId !== Z.dataCenterId ? `Inter-site ${protocol} ${A.dataCenterId} ↔ ${Z.dataCenterId}` : undefined,
        } satisfies T.RoutingSession);
        sessions++;
      }
    }
    this.fixAll('LINK_ID_PREFIX', `Link ids are reused between the two workbooks: every link id prefixed "${o.clashPrefix}" (the original stays in extRef.id)`, rows.length, [`LNK-00001 → ${o.clashPrefix}LNK-00001`]);
    this.sheet('Links', rows.length, `${cables} cables (LLDP), ${topo} topology links between network devices, ${sessions} routing sessions (BGP/OSPF/ISIS/LSP)`);
  }
  private roleOf(d: T.Device): string { return str(this.devRow.get(d.id) ?? {}, 'role') ?? ''; }

  /* ── GPU_Clusters, GPU_Nodes ── */
  private gpu() {
    const { W } = this;
    const clusters = this.rows('GPU_Clusters');
    const nodes = this.rows('GPU_Nodes');
    const nodeByDev = new Map(nodes.map((n) => [str(n, 'device_id') as string, n]));
    const nodesByCluster = new Map<string, T.Device[]>();
    for (const n of nodes) {
      const dev = this.devRec.get(str(n, 'device_id') as string);
      if (!dev) { this.warn('GPU_NODE_DEVICE_MISSING', 'GPU node that is not in the Devices sheet', str(n, 'device_id')); continue; }
      const cid = str(n, 'cluster_id') as string;
      const a = nodesByCluster.get(cid) ?? []; a.push(dev); nodesByCluster.set(cid, a);
    }
    for (const c of clusters) {
      const id = str(c, 'cluster_id') as string; const site = str(c, 'site_id') as string;
      const members = nodesByCluster.get(id) ?? [];
      if (members.some((m) => m.dataCenterId !== site)) this.warn('CLUSTER_SITE_MISMATCH', 'GPU cluster with nodes at another site', id);
      const live = members.some((m) => m.lifecycleState !== 'Ordered');
      W.put('gpuClusters', {
        id, gclId: id, ...this.meta(id), name: `${site} ${str(c, 'name') ?? id}`, dataCenterId: site, hallId: str(c, 'room_id'), scheduler: str(c, 'scheduler') ?? 'Kubernetes',
        fabric: str(c, 'fabric') ?? '', gpuModel: str(c, 'gpu_model') ?? '', cooling: str(c, 'cooling') === 'liquid' ? 'liquid' : 'air',
        status: this.siteStatus.get(site) === 'Planned' || !live ? 'Planned' : 'Live', notes: `${members.length} nodes · ${members.length * 8} GPUs`,
      } satisfies T.GpuCluster);
    }
    let noNode = 0;
    for (const dev of this.devRec.values()) {
      if (dev.category !== 'GPU-Node') continue;
      const n = nodeByDev.get(dev.id);
      const rack = dev.rackId ? this.rackRec.get(dev.rackId) : undefined;
      if (n) {
        dev.gpu = { model: str(n, 'gpu_model') ?? '', vendor: str(n, 'gpu_vendor') ?? 'NVIDIA', count: num(n, 'gpu_count') ?? 8, cooling: str(n, 'cooling') === 'liquid' ? 'liquid' : 'air', driver: str(n, 'driver'), firmware: str(n, 'firmware'), clusterId: str(n, 'cluster_id') };
      } else {
        const hit = GPU_BY_TOKEN.find(([re]) => re.test(dev.model ?? ''));
        const count = Number(/\((\d+)\s*×/.exec(dev.model ?? '')?.[1] ?? 8);
        dev.gpu = { model: hit?.[1] ?? 'Unknown GPU', vendor: hit?.[2] ?? 'NVIDIA', count, cooling: rack?.liquidCooled ? 'liquid' : 'air' };
        noNode++;
      }
    }
    this.fixAll('GPU_NO_NODE', 'GPU servers with no GPU_Nodes row: imported as GPU servers without a cluster, GPU model and count read from the server model', noNode);
    this.sheet('GPU_Clusters', clusters.length, `${clusters.length} GPU clusters`);
    this.sheet('GPU_Nodes', nodes.length, `${nodes.length} GPU specs on devices (${noNode} more GPU servers without a node row)`);
  }

  /* ── Customers, Services (+ compute roll-up per site) ── */
  private customersAndServices() {
    const { W, o } = this;
    const custs = this.rows('Customers');
    let merged = 0;
    for (const c of custs) {
      const wbId = str(c, 'customer_id') as string; const name = str(c, 'name') ?? wbId;
      const existing = W.get<T.Customer>('customers', wbId);
      const mine = existing?.extRef?.source === o.source;
      let id = wbId;
      if (existing && !mine && existing.name !== name) { id = `${o.clashPrefix}${wbId}`; this.fix('CUSTOMER_ID_PREFIX', `Customer id used by a different company in another workbook: prefixed "${o.clashPrefix}"`, `${wbId} "${name}" → ${id} (${wbId} is "${existing.name}")`); }
      this.custIdMap.set(wbId, id); this.custName.set(id, name);
      const prior = W.get<T.Customer>('customers', id);
      if (prior && prior.extRef?.source !== o.source) {
        merged++;
        const also = `Also a customer in ${o.source} (${str(c, 'city')}, ${str(c, 'state')}; account manager ${str(c, 'account_manager')}).`;
        W.put('customers', { ...prior, notes: prior.notes?.includes(o.source) ? prior.notes : [prior.notes, also].filter(Boolean).join(' ') });
        continue;
      }
      W.put('customers', { id, custId: id, ...this.meta(wbId), name, segment: str(c, 'segment') ?? '', city: str(c, 'city') ?? '', state: str(c, 'state') ?? '', plan: str(c, 'plan') ?? '', premium: yes(c, 'premium'), accountManager: str(c, 'account_manager') ?? '', revenueMonthly: 0 } satisfies T.Customer);
    }
    this.fixAll('CUSTOMER_MERGE', 'Customer already loaded from another workbook under the same id and name: one global customer (services from both estates point at it)', merged);
    this.sheet('Customers', custs.length, `${custs.length - merged} new customers, ${merged} merged into customers already loaded`);

    const svcs = this.rows('Services');
    let jobs = 0, racksDerived = 0, plannedHost = 0;
    const gpuUsedBySite = new Map<string, number>();
    for (const s of svcs) {
      const wbId = str(s, 'service_id') as string; const id = `${o.clashPrefix}${wbId}`;
      const custWb = str(s, 'customer_id') as string; const cust = this.custIdMap.get(custWb) ?? custWb;
      if (!this.custIdMap.has(custWb)) this.warn('SERVICE_CUSTOMER_MISSING', 'Service for a customer that is not in the Customers sheet', wbId);
      const devId = str(s, 'device_id');
      const host = devId ? this.devRec.get(devId) : undefined;
      if (devId && !host) this.warn('SERVICE_DEVICE_MISSING', 'Service on a device that is not in the Devices sheet', wbId);
      const nodes = list(s, 'gpu_node_ids').filter((x) => this.devRec.has(x));
      const ifRaw = str(s, 'if_name');
      const isPort = !!(devId && ifRaw && this.compId.has(`${devId}|${ifRaw}`));
      const job = ifRaw && !isPort ? ifRaw : undefined;
      if (job) jobs++;
      const rackList = list(s, 'rack_ids');
      const rackIds = rackList.length ? rackList : [...new Set([devId, ...nodes].map((x) => (x ? this.devRec.get(x)?.rackId : undefined)).filter((x): x is string => !!x))];
      if (!rackList.length && rackIds.length) racksDerived++;
      const type = str(s, 'type') ?? 'Service';
      const planned = host?.lifecycleState === 'Ordered';
      if (planned) plannedHost++;
      const sla = num(s, 'sla_target_pct') ?? 99.9;
      const h = hashOf(id);
      const unit = str(s, 'unit') ?? '';
      if (unit === 'GPU' && !planned) gpuUsedBySite.set(str(s, 'site_id') as string, (gpuUsedBySite.get(str(s, 'site_id') as string) ?? 0) + (num(s, 'qty') ?? 0));
      W.put('services', {
        id, svcId: id, ...this.meta(wbId), name: `${type} · ${this.custName.get(cust) ?? cust}${job ? ` · ${job}` : ''}`, type, customerRef: cust, dataCenterId: str(s, 'site_id') as string,
        deviceId: devId, ifName: isPort ? ifRaw : undefined, rackId: rackIds[0], pathDeviceIds: nodes.length ? nodes : devId ? [devId] : [], cableIds: [],
        bandwidthMbps: num(s, 'bandwidth_mbps') ?? 0, utilPct: planned ? 0 : 20 + (h % 66), status: planned ? 'Disabled' : 'Active', slaTarget: sla,
        uptime30d: planned ? 0 : Math.round((sla + (100 - sla) * (0.35 + ((h >> 8) % 65) / 100)) * 1000) / 1000, growthPct: r1(((h >> 4) % 60) / 10),
        revenueMonthly: num(s, 'monthly_revenue') ?? 0, critical: yes(s, 'critical'), qty: num(s, 'qty') ?? 0, unit,
        rackIds, startDate: str(s, 'start_date'), currency: o.currency,
        notes: job ? `Workload: ${job}` : planned ? 'Host not yet installed (planned device)' : undefined,
      } satisfies T.Service);
    }
    this.fixAll('SERVICE_ID_PREFIX', `Service ids are reused between the two workbooks: every service id prefixed "${o.clashPrefix}"`, svcs.length, [`SVC-SV-1100 → ${o.clashPrefix}SVC-SV-1100`]);
    this.fixAll('SERVICE_JOB', 'GPU services carry the workload name in if_name: moved into the service name and notes (ifName left empty)', jobs, ['"4-node fine-tuning job"']);
    this.fixAll('SERVICE_RACKS', 'rack_ids blank: derived from the racks of the service device and its GPU nodes', racksDerived);
    this.fixAll('CURRENCY', `Services keep the estate's native currency given at import, not the workbook's own label; customer revenue (one number per customer) is the USD equivalent at ${INR_PER_USD} INR per USD`, svcs.length);
    this.warnAll('SERVICE_PLANNED_HOST', 'Service on a planned (not yet installed) device: imported as Disabled and left out of customer revenue', plannedHost);
    this.warnAll('SERVICE_NO_START', 'Service start date blank in the workbook (left empty)', svcs.filter((s) => !str(s, 'start_date')).length);
    this.sheet('Services', svcs.length, `${svcs.length} services (${o.currency})`);

    // GPU compute roll-up per site (CPU, memory and storage totals are not in the workbook).
    const gpuBySite = new Map<string, number>();
    for (const d of this.devRec.values()) if (d.gpu && d.lifecycleState !== 'Ordered' && d.dataCenterId) gpuBySite.set(d.dataCenterId, (gpuBySite.get(d.dataCenterId) ?? 0) + d.gpu.count);
    for (const site of this.site.keys()) {
      const total = gpuBySite.get(site) ?? 0;
      const id = `${site}-COMPUTE`;
      W.put('computeResources', { id, compId: id, ...this.meta(id), scopeType: 'DataCenter', scopeId: site, cpuCoresTotal: 0, cpuCoresUsed: 0, memoryGbTotal: 0, memoryGbUsed: 0, storageTbTotal: 0, storageTbUsed: 0, gpuCountTotal: total, gpuCountUsed: Math.min(total, gpuUsedBySite.get(site) ?? 0), networkGbpsTotal: 0, networkGbpsUsed: 0, notes: 'GPU counts from the installed GPU servers; GPUs in use = GPUs sold as services. CPU, memory and storage totals are not in the workbook.' } satisfies T.ComputeResource);
    }
  }

  /* ── Snapshot_Alerts, Snapshot_Incidents, Snapshot_Changes → history ── */
  private snapshotHistory() {
    const { W, o } = this;
    const p = o.clashPrefix;
    const alerts = this.rows('Snapshot_Alerts');
    const alarmsByInc = new Map<string, string[]>();
    const devsByInc = new Map<string, Set<string>>();
    const racksByInc = new Map<string, Set<string>>();
    const incWbOf = (a: Row) => str(a, 'incident_id');
    let unresolved = 0;
    for (const a of alerts) {
      const wbId = str(a, 'alert_id') as string; const id = `${p}${wbId}`;
      const node = str(a, 'device_or_node'); const dev = node ? this.devRec.get(node) : undefined;
      if (node && !dev) { unresolved++; this.warn('ALERT_NODE_UNKNOWN', 'Alert on a node that is not in the Devices sheet (PoP / access-site equipment): kept with the node name, no device link', node); }
      const linkOrRackRaw = str(a, 'link_or_rack');
      const rackRef = linkOrRackRaw && this.rackRec.has(linkOrRackRaw) ? linkOrRackRaw : undefined;
      // Facility alarms name no device: they stay on the site, named after the rack or plant item in the title.
      const facilityNode = !node ? rackRef ?? /\b(CRAH|CRAC|CDU|UPS|DG|RECT|BATT)-\d+\b/.exec(str(a, 'title') ?? '')?.[0] ?? `${str(a, 'site_id')} (site)` : undefined;
      if (rackRef && incWbOf(a)) { const s2 = racksByInc.get(`${p}${incWbOf(a)}`) ?? new Set<string>(); s2.add(rackRef); racksByInc.set(`${p}${incWbOf(a)}`, s2); }
      const ifName = str(a, 'if_name');
      const incWb = str(a, 'incident_id'); const inc = incWb ? `${p}${incWb}` : undefined;
      if (inc) { const l = alarmsByInc.get(inc) ?? []; l.push(id); alarmsByInc.set(inc, l); if (dev) { const s = devsByInc.get(inc) ?? new Set(); s.add(dev.id); devsByInc.set(inc, s); } }
      const raised = iso(str(a, 'raised_at')) ?? this.at;
      const state = ALARM_STATE[(str(a, 'state') ?? 'active').toLowerCase()] ?? 'Active';
      const linkOrRack = str(a, 'link_or_rack');
      const linkRef = linkOrRack && /^LNK-/.test(linkOrRack) ? `${p}${linkOrRack}` : linkOrRack;
      const col = dev?.collectorId ? this.collectorRec.get(dev.collectorId) : undefined;
      W.put('alarms', {
        id, almId: id, ...this.meta(wbId), deviceId: dev?.id ?? '', interfaceId: dev && ifName ? this.nmsIfId.get(`${dev.id}|${ifName}`) : undefined,
        severity: ALARM_SEV[(str(a, 'severity') ?? 'minor').toLowerCase()] ?? 'Minor', type: str(a, 'title') ?? 'Alarm',
        probableCause: [str(a, 'source'), str(a, 'category'), ifName ? `on ${ifName}` : undefined, linkRef ? `(${linkRef})` : undefined].filter(Boolean).join(' · '),
        state, raisedAt: raised, firstRaisedAt: raised, acknowledgedBy: state === 'Acknowledged' ? 'NOC' : undefined, acknowledgedAt: state === 'Acknowledged' ? raised : undefined,
        correlatedAlarmIds: [], incidentId: inc, count: 1, sourceSystem: col ? col.name : 'NeoCloud snapshot',
        dataCenterId: str(a, 'site_id'), nodeName: dev ? undefined : node ?? facilityNode, scope: str(a, 'scope'), linkRef,
        notes: `Imported from the ${o.source} snapshot (scope ${str(a, 'scope') ?? '—'}, category ${str(a, 'category') ?? '—'})`,
      } satisfies T.Alarm);
    }
    this.fixAll('SNAPSHOT_ID_PREFIX', `Alert, incident and change ids are reused between the workbooks and the demo estate (INC-0001, CHG-…): prefixed "${p}"`, alerts.length + this.rows('Snapshot_Incidents').length + this.rows('Snapshot_Changes').length, [`INC-0001 → ${p}INC-0001`, `ALM-1930 → ${p}ALM-1930`]);
    this.fixAll('SNAPSHOT_TIME', 'Snapshot timestamps carry no zone: read as UTC', alerts.length + this.rows('Snapshot_Incidents').length + this.rows('Snapshot_Changes').length);
    this.sheet('Snapshot_Alerts', alerts.length, `${alerts.length} alarms (${unresolved} on nodes outside the inventory)`);

    const incs = this.rows('Snapshot_Incidents');
    for (const i of incs) {
      const wbId = str(i, 'incident_id') as string; const id = `${p}${wbId}`;
      const sev = INC_SEV[str(i, 'severity') ?? 'Medium'] ?? 'SEV3';
      const type = str(i, 'type') ?? 'Network';
      const status = (str(i, 'status') ?? 'Open') as T.Incident['status'];
      const detected = iso(str(i, 'detected_at')) ?? this.at; const resolved = iso(str(i, 'resolved_at'));
      const devs = [...(devsByInc.get(id) ?? []), ...(racksByInc.get(id) ?? [])];
      const art: T.Incident['affectedResourceType'] = type === 'Power' ? 'PowerChain' : type === 'Cooling' ? 'Cooling' : type === 'Rack' ? 'Rack' : 'Asset';
      const svcHit = num(i, 'services_hit') ?? 0, custHit = num(i, 'customers_hit') ?? 0, rev = num(i, 'revenue_at_risk') ?? 0;
      W.put('incidents', {
        id, incId: id, ...this.meta(wbId), title: str(i, 'title') ?? wbId, type, severity: sev, status, priority: INC_PRI[sev],
        affectedResourceType: art, affectedResourceIds: devs, dataCenterId: str(i, 'site_id'), detectedAt: detected, resolvedAt: resolved && (status === 'Resolved' || status === 'Closed') ? resolved : undefined,
        assignee: str(i, 'owner'), reportedBy: 'NOC', linkedAlarmIds: alarmsByInc.get(id) ?? [],
        worklog: [{ at: detected, author: 'System', kind: 'StatusChange', text: `Imported from the ${o.source} snapshot with status ${status}.` }, ...(resolved && (status === 'Resolved' || status === 'Closed') ? [{ at: resolved, author: str(i, 'owner') ?? 'NOC', kind: 'Resolution' as const, text: 'Resolved (per snapshot).' }] : [])],
        notes: `Snapshot impact: ${svcHit} services, ${custHit} customers, ${rev.toLocaleString('en-US')} ${o.currency} revenue at risk${(num(i, 'alarms') ?? 0) ? `; ${num(i, 'alarms')} alarms` : ''}.`,
      } satisfies T.Incident);
    }
    this.sheet('Snapshot_Incidents', incs.length, `${incs.length} incidents`);

    const chgs = this.rows('Snapshot_Changes');
    let mws = 0, steps = 0;
    for (const c of chgs) {
      const wbId = str(c, 'change_id') as string; const id = `${p}${wbId}`;
      const title = str(c, 'title') ?? wbId;
      const statusRaw = str(c, 'status') ?? 'Draft';
      const status = CHG_STATUS[statusRaw] ?? 'Draft';
      const scope = list(c, 'scope').filter((x) => this.devRec.has(x));
      const type: T.ChangeRequest['type'] = /driver|firmware|upgrade|junos|os |bfd|certificate|config/i.test(title) ? 'ConfigPush' : /patch|backhaul|link|odf|span/i.test(title) ? 'NetworkMigration' : /ups|feed|dg |generator|load-bank|battery|power/i.test(title) ? 'PowerUpgrade' : 'ConfigPush';
      const art: T.ChangeRequest['affectedResourceType'] = scope.length ? 'Asset' : /crah|crac|chiller|cool|fire/i.test(title) ? 'Cooling' : /ups|feed|dg |generator|load-bank|battery|power/i.test(title) ? 'PowerChain' : 'Asset';
      const ws = iso(str(c, 'window_start')), we = iso(str(c, 'window_end'));
      const risk = (str(c, 'risk') ?? 'Medium') as T.ChangeRequest['risk'];
      const requester = str(c, 'requester') ?? 'NOC'; const approver = str(c, 'approver');
      const done = status === 'Closed' || status === 'RolledBack';
      W.put('changeRequests', {
        id, chgId: id, ...this.meta(wbId), title, type, description: `${str(c, 'kind') ?? 'Change'} imported from the ${o.source} snapshot (status "${statusRaw}").${scope.length ? ` Scope: ${scope.join(', ')}.` : ''}`,
        risk, status, priority: risk === 'High' || risk === 'Critical' ? 'High' : risk === 'Low' ? 'Low' : 'Medium', affectedResourceType: art, affectedResourceIds: scope, dataCenterId: str(c, 'site_id'),
        requestedBy: requester, requestedById: 'import', assignedTo: approver ?? undefined, scheduledStart: ws, scheduledEnd: we, implementedAt: done ? we : undefined,
        policyViolations: [], rollbackPlan: 'Per runbook (not in the snapshot)', source: 'NeoCloud snapshot', externalRef: wbId, changeClass: 'Normal',
        closedAt: done ? we : undefined, approvedAt: approver && ['Approved', 'InProgress', 'Closed', 'RolledBack'].includes(status) ? ws : undefined,
        review: status === 'RolledBack' ? { outcome: 'Rolled back', notes: 'Rolled back in the window (per snapshot).', by: requester, at: we ?? this.at } : undefined,
      } satisfies T.ChangeRequest);
      if (approver) {
        const sid = `${id}-AP1`;
        W.put('approvalSteps', { id: sid, apstepId: sid, ...this.meta(`${wbId} approval`), changeRequestId: id, order: 1, approverRole: 'ChangeApprover', decision: status === 'Rejected' ? 'Rejected' : 'Approved', decidedAt: ws, comment: `${approver} (from the snapshot)` } satisfies T.ApprovalStep);
        steps++;
      }
      if (str(c, 'kind') === 'Maintenance') {
        const mid = `${id}-MW`;
        W.put('maintenanceWindows', {
          id: mid, mwId: mid, ...this.meta(`${wbId} window`), title, status: status === 'Closed' || status === 'RolledBack' ? 'Completed' : status === 'InProgress' ? 'In Progress' : status === 'Rejected' || status === 'Cancelled' ? 'Cancelled' : 'Scheduled',
          dataCenterId: str(c, 'site_id'), changeRequestId: id, scheduledStart: ws ?? this.at, scheduledEnd: we ?? this.at, affectedDeviceIds: scope, impact: 'Per change record', owner: requester,
        } satisfies T.MaintenanceWindow);
        mws++;
      }
    }
    this.sheet('Snapshot_Changes', chgs.length, `${chgs.length} change requests (history, no process started), ${mws} maintenance windows, ${steps} approval steps`);
  }

  /* ── roll-ups that span workbooks: counts, customer revenue ── */
  private rollups() {
    const { W } = this;
    const campuses = W.all<T.Campus>('campuses');
    const regions = W.all<T.Region>('regions');
    const dcs = W.all<T.DataCenter>('dataCenters');
    const ent = `ENT-${slug(this.o.operator)}`;
    const mine = (x: T.BaseEntity) => x.extRef?.source === this.o.source;
    for (const r of regions.filter(mine)) W.put('regions', { ...r, campusCount: campuses.filter((c) => c.regionId === r.id).length });
    for (const c of campuses.filter(mine)) W.put('campuses', { ...c, dataCenterCount: dcs.filter((d) => d.campusId === c.id).length });
    const e = W.get<T.Enterprise>('enterprises', ent);
    const regionCount = regions.filter((x) => x.enterpriseId === ent).length;
    if (e && e.regionCount !== regionCount) W.put('enterprises', { ...e, regionCount });
    // Customer revenue: USD equivalent of every imported service for the customer, whichever workbook it came from.
    const ids = new Set(this.custIdMap.values());
    const usd = new Map<string, number>();
    for (const s of W.all<T.Service>('services')) {
      if (!ids.has(s.customerRef) || !s.extRef || s.status === 'Disabled') continue;
      usd.set(s.customerRef, (usd.get(s.customerRef) ?? 0) + s.revenueMonthly * (USD_PER[s.currency ?? 'USD'] ?? 1));
    }
    for (const id of ids) { const c = W.get<T.Customer>('customers', id); if (c) W.put('customers', { ...c, revenueMonthly: Math.round(usd.get(id) ?? 0) }); }
  }
}
