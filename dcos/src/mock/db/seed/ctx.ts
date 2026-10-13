/**
 * DCOS seed — shared context.
 *
 * One object every seed module writes into: deterministic id counters, faker-backed
 * helpers, the cast of named people the whole estate refers to, and every collection
 * the snapshot exports. Modules run in order (estate → dcim → ipam → governance →
 * nms → delivery → circuits → knowledge) and may read anything an earlier module wrote.
 *
 * Design rule for every module: a record is only pushed with *every* field it can
 * honestly carry, and enum variations are dealt out deterministically (`cycle`) rather
 * than drawn at random, so each value of each enum appears somewhere in the estate.
 */
import { faker } from '@faker-js/faker';
import type * as T from '../../data/types';
import type { AssetCategory, AssetLifecycle, AssetStatus } from '../../data/enums';
import type { DcTypeProfile } from '../../data/dcTypes';

export type SeedProfile = 'small' | 'medium' | 'full';
export const CUSTOMER = 'CUST-001';

/** Seed-only scaffold: an asset row that is mirrored into `devices` (assets are not a public table). */
export interface AssetSeed extends T.BaseEntity {
  assetId: string; rackId?: string; dataCenterId: string; startU?: number; heightU: number; assetModelId: string;
  hostname: string; serialNumber: string; assetTag: string; category: AssetCategory;
  manufacturer: string; model: string; powerDrawW: number; weightKg: number; ratedThermalW: number;
  lifecycleState: AssetLifecycle; ownerTeam: string; warrantyContractId?: string;
  commissionedDate?: string; decommissionDate?: string; status: AssetStatus;
  /** Logical role used to build the network fabric and the NMS view. */
  fabricRole?: 'core' | 'spine' | 'leaf' | 'edge' | 'pe' | 'rr' | 'access' | 'lb' | 'pdu' | 'ups' | 'ap' | 'console';
}

/** The people every record refers to. The first twelve mirror the users the login screen offers. */
export interface Person { id: string; name: string; role: string; team: string; site?: string }
export const PEOPLE: readonly Person[] = [
  { id: 'U01', name: 'Admin User', role: 'Administrator', team: 'Platform' },
  { id: 'U02', name: 'Sarah Chen', role: 'Program Manager', team: 'Delivery' },
  { id: 'U03', name: 'Mike Johnson', role: 'Project Manager', team: 'Delivery' },
  { id: 'U04', name: 'Emily Roberts', role: 'Facilities Director', team: 'Facilities' },
  { id: 'U05', name: 'David Kim', role: 'Network Engineer', team: 'NetEng' },
  { id: 'U06', name: 'Lisa Park', role: 'Capacity Planner', team: 'Platform' },
  { id: 'U07', name: 'James Wilson', role: 'Field Technician', team: 'Facilities' },
  { id: 'U08', name: 'Anna Martinez', role: 'Commissioning Engineer', team: 'Delivery' },
  { id: 'U09', name: 'Robert Brown', role: 'Finance Manager', team: 'Finance' },
  { id: 'U10', name: 'Karen Lee', role: 'Executive', team: 'Leadership' },
  { id: 'U11', name: 'Tom Garcia', role: 'Vendor Project Manager', team: 'NetBuild Corp' },
  { id: 'U12', name: 'Nina Patel', role: 'NOC Lead', team: 'Operations' },
  { id: 'U13', name: 'Priya Nair', role: 'Compliance Manager', team: 'GRC' },
  { id: 'U14', name: 'Omar Haddad', role: 'Security Manager', team: 'Security' },
  { id: 'U15', name: 'Chen Wei', role: 'Platform Owner', team: 'Platform' },
  { id: 'U16', name: 'Lucas Ferreira', role: 'Site Technician', team: 'Facilities', site: 'GRU' },
  { id: 'U17', name: 'Hannah Schmidt', role: 'Facilities Engineer', team: 'Facilities', site: 'FRA' },
  { id: 'U18', name: "Aiden O'Brien", role: 'Site Technician', team: 'Facilities', site: 'DUB' },
  { id: 'U19', name: 'Mei Tan', role: 'Network Engineer', team: 'NetEng', site: 'SIN' },
  { id: 'U20', name: 'Jack Nguyen', role: 'Facilities Engineer', team: 'Facilities', site: 'SYD' },
];

export interface Snapshot { [entity: string]: Record<string, unknown>[] }

export class Seed {
  readonly profile: SeedProfile;
  /** Rack-count multiplier: small 1×, medium 2×, full 3×. Everything else is curated, not scaled. */
  readonly scale: number;
  readonly now: number;
  private counters: Record<string, number> = {};

  constructor(profile: SeedProfile) {
    this.profile = profile;
    this.scale = profile === 'full' ? 3 : profile === 'medium' ? 2 : 1;
    this.now = Date.now();
    faker.seed(42);
  }

  // ── Deterministic helpers ─────────────────────────────────────────────
  nid(prefix: string): string { return `${prefix}-${String((this.counters[prefix] = (this.counters[prefix] ?? 0) + 1)).padStart(4, '0')}`; }
  int(min: number, max: number): number { return faker.number.int({ min, max: Math.max(min, max) }); }
  pick<X>(arr: readonly X[]): X { return faker.helpers.arrayElement(arr as X[]); }
  /** Deal the i-th value of a closed set; the way every enum gets full coverage. */
  cycle<X>(arr: readonly X[], i: number): X { const n = arr.length; return arr[((i % n) + n) % n]; }
  chance(p: number): boolean { return faker.datatype.boolean(p); }
  r1(n: number): number { return Math.round(n * 10) / 10; }
  pct(used: number, total: number): number { return total > 0 ? Math.round((used / total) * 100) : 0; }
  words(n: number): string { return faker.lorem.words(n); }
  sentence(): string { return faker.lorem.sentence(); }
  serial(len = 10): string { return faker.string.alphanumeric(len).toUpperCase(); }
  mac(): string { return faker.internet.mac().toUpperCase(); }
  hex(len: number): string { return faker.string.hexadecimal({ length: len, prefix: '' }).toLowerCase(); }

  // ── Dates (ISO) relative to "now" ─────────────────────────────────────
  daysAgo(d: number): string { return new Date(this.now - d * 864e5).toISOString(); }
  daysAhead(d: number): string { return new Date(this.now + d * 864e5).toISOString(); }
  minutesAgo(m: number): string { return new Date(this.now - m * 60_000).toISOString(); }
  isoPast(years = 1): string { return faker.date.past({ years }).toISOString(); }
  isoRecent(days = 60): string { return faker.date.recent({ days }).toISOString(); }
  isoSoon(days = 180): string { return faker.date.soon({ days }).toISOString(); }
  isoFuture(days = 365): string { return faker.date.future({ years: Math.max(1, Math.round(days / 365)) }).toISOString(); }

  /** The system envelope every record carries. */
  meta(by?: Person): Omit<T.BaseEntity, 'id'> {
    const createdAt = this.isoPast(2);
    return { customerId: CUSTOMER, createdAt, updatedAt: this.isoRecent(30), createdBy: by?.name ?? 'System Seed', createdById: by?.id ?? 'system', isDeleted: false };
  }

  // ── People ────────────────────────────────────────────────────────────
  person(i: number): Person { return this.cycle(PEOPLE, i); }
  byRole(role: string): Person { return PEOPLE.find((p) => p.role === role) ?? PEOPLE[0]; }
  /** Site-local staff for a campus code, falling back to the rotating cast. */
  siteStaff(campusKey: string, i = 0): Person { const local = PEOPLE.filter((p) => p.site === campusKey); return local.length ? this.cycle(local, i) : this.person(i); }

  // ── Cross-module lookups ──────────────────────────────────────────────
  /** Facility-type profile per data center, written by the estate module. */
  dcProfile = new Map<string, DcTypeProfile>();
  /** Campus code (ASH, FRA …) per data center. */
  dcCampus = new Map<string, string>();
  /** The "showcase" racks per site — the first racks of the first hall — that get full cabling, PDUs and tenants' detail. */
  showcaseRacks = new Map<string, T.Rack[]>();
  /** Seed-only asset scaffold; mirrored into `devices` by the dcim module. */
  assets: AssetSeed[] = [];
  /** Device components grouped by device id (kept alongside the flat collection to avoid quadratic scans). */
  compsByDevice = new Map<string, T.DeviceComponent[]>();
  /** Device type id by model name, written by the dcim module. */
  dtIdByModel: Record<string, string> = {};
  /** Delivery maturity per project (0 Plan … 4 Live) so downstream records agree with the project's stage. */
  projectMeta = new Map<string, { maturity: number; template: string; budget: number }>();

  // ── Collections (one per exported entity) ────────────────────────────
  customFields: T.CustomField[] = []; tags: T.Tag[] = [];
  enterprises: T.Enterprise[] = []; regions: T.Region[] = []; campuses: T.Campus[] = []; dataCenterTypes: T.DataCenterType[] = []; dataCenters: T.DataCenter[] = [];
  siteGroups: T.SiteGroup[] = []; rackRoles: T.RackRole[] = []; rackTypes: T.RackType[] = []; rackGroups: T.RackGroup[] = [];
  buildings: T.Building[] = []; floors: T.Floor[] = []; halls: T.Hall[] = []; rows: T.Row[] = []; racks: T.Rack[] = [];
  assetModels: T.AssetModel[] = []; utilityFeeds: T.UtilityFeed[] = []; transformers: T.Transformer[] = []; upsUnits: T.UPS[] = []; pdus: T.PDU[] = [];
  coolingZones: T.CoolingZone[] = []; cracUnits: T.CRAC[] = []; computeResources: T.ComputeResource[] = []; capacityReservations: T.CapacityReservation[] = [];
  cidrBlocks: T.CIDRBlock[] = []; subnets: T.Subnet[] = []; vlans: T.VLAN[] = []; vrfs: T.VRF[] = []; ipAddresses: T.IPAddress[] = [];
  rirs: T.RIR[] = []; ipamRoles: T.IpamRole[] = []; ipRanges: T.IPRange[] = []; asns: T.ASN[] = []; asnRanges: T.ASNRange[] = [];
  routeTargets: T.RouteTarget[] = []; vlanGroups: T.VLANGroup[] = []; fhrpGroups: T.FHRPGroup[] = []; serviceTemplates: T.ServiceTemplate[] = []; ipServices: T.IpService[] = [];
  changeRequests: T.ChangeRequest[] = []; policies: T.Policy[] = []; approvalMatrixRules: T.ApprovalMatrixRule[] = []; approvalSteps: T.ApprovalStep[] = [];
  complianceFrameworks: T.ComplianceFramework[] = []; complianceControls: T.ComplianceControl[] = []; policyDecisions: T.PolicyDecision[] = [];
  manufacturers: T.Manufacturer[] = []; deviceRoles: T.DeviceRoleEntity[] = []; platforms: T.PlatformEntity[] = [];
  inventoryItemRoles: T.InventoryItemRole[] = []; inventoryItems: T.InventoryItem[] = [];
  deviceTypes: T.DcimDeviceType[] = []; moduleTypes: T.ModuleType[] = []; componentTemplates: T.ComponentTemplate[] = []; devices: T.Device[] = [];
  deviceComponents: T.DeviceComponent[] = []; modules: T.Module[] = []; cables: T.Cable[] = []; virtualChassis: T.VirtualChassis[] = [];
  powerPanels: T.PowerPanel[] = []; powerFeeds: T.PowerFeed[] = []; rackReservations: T.RackReservation[] = []; cableBundles: T.CableBundle[] = [];
  virtualDeviceContexts: T.VirtualDeviceContext[] = []; inventoryItemTemplates: T.InventoryItemTemplate[] = [];
  managedDevices: T.ManagedDevice[] = []; interfaces: T.Interface[] = []; alarms: T.Alarm[] = []; alarmRules: T.AlarmRule[] = [];
  configBackups: T.ConfigBackup[] = []; configChanges: T.ConfigChange[] = []; discoveryJobs: T.DiscoveryJob[] = []; topologyLinks: T.TopologyLink[] = [];
  incidents: T.Incident[] = []; maintenanceWindows: T.MaintenanceWindow[] = []; demandRequests: T.DemandRequest[] = []; plans: T.Plan[] = [];
  providers: T.Provider[] = []; providerNetworks: T.ProviderNetwork[] = []; circuitTypes: T.CircuitType[] = []; circuits: T.Circuit[] = []; circuitTerminations: T.CircuitTermination[] = [];
  programs: T.Program[] = []; projects: T.Project[] = []; milestones: T.Milestone[] = []; permits: T.Permit[] = []; designDocuments: T.DesignDocument[] = [];
  changeOrders: T.ChangeOrder[] = []; tickets: T.Ticket[] = []; vendors: T.Vendor[] = []; contracts: T.Contract[] = []; boms: T.BOM[] = []; bomLines: T.BOMLine[] = [];
  purchaseOrders: T.PurchaseOrder[] = []; workOrders: T.WorkOrder[] = []; projectActivities: T.ProjectActivity[] = [];
  atps: T.Atp[] = []; atpSteps: T.AtpStep[] = []; hotos: T.Hoto[] = []; snags: T.Snag[] = []; hotoDeliverables: T.HotoDeliverable[] = []; hotoSignoffs: T.HotoSignoff[] = [];
  auditEvents: T.AuditEvent[] = []; documents: T.DocumentRec[] = []; tasks: T.Task[] = []; risks: T.RiskItem[] = [];
  customers: T.Customer[] = []; services: T.Service[] = []; capacityPlans: T.CapacityPlanRec[] = []; edgeLocations: T.EdgeLocation[] = [];
  generators: T.Generator[] = []; chillers: T.Chiller[] = []; disposalCertificates: T.DisposalCertificate[] = [];
  standardChangeTemplates: T.StandardChangeTemplate[] = []; changeFreezes: T.ChangeFreeze[] = [];
  plannerTemplates: T.PlannerTemplate[] = []; plannerBenchmarks: T.PlannerBenchmark[] = []; plannerPlans: T.PlannerPlan[] = []; plannerScenarios: T.PlannerScenario[] = []; plannerFeedback: T.PlannerFeedback[] = [];
  processDefinitions: T.ProcessDefinition[] = []; processInstances: T.ProcessInstance[] = []; flowNodeInstances: T.FlowNodeInstance[] = []; userTasks: T.ProcessUserTask[] = []; engineIncidents: T.EngineIncident[] = [];
  /** Materials: catalogue and ERP mirrors, DCOS material lines, requests to the supply chain platform and the events that moved the lines. */
  materials: T.Material[] = []; purchaseOrderLines: T.PurchaseOrderLine[] = []; goodsReceipts: T.GoodsReceipt[] = [];
  materialLines: T.MaterialLine[] = []; supplyRequests: T.SupplyRequest[] = []; materialEvents: T.MaterialEvent[] = [];
  /** Estate model (import-ready): GPU clusters, routing sessions, 48 V DC plant, CDUs, environment sensors and monitoring collectors. */
  gpuClusters: T.GpuCluster[] = []; routingSessions: T.RoutingSession[] = []; dcPlants: T.DcPlant[] = [];
  cdus: T.Cdu[] = []; envSensors: T.EnvSensor[] = []; collectors: T.Collector[] = [];

  /** Append an audit event against a real record. */
  audit(entityType: string, entityId: string, action: string, summary: string, actor: Person, timestamp: string, projectId?: string): void {
    const id = this.nid('AUD');
    this.auditEvents.push({ id, audId: id, ...this.meta(actor), entityType, entityId, action, actorName: actor.name, timestamp, summary, projectId });
  }

  snapshot(): Snapshot {
    const rec = (arr: unknown[]) => arr as Record<string, unknown>[];
    return {
      customFields: rec(this.customFields), tags: rec(this.tags),
      enterprises: rec(this.enterprises), regions: rec(this.regions), campuses: rec(this.campuses), dataCenterTypes: rec(this.dataCenterTypes), dataCenters: rec(this.dataCenters),
      buildings: rec(this.buildings), floors: rec(this.floors), halls: rec(this.halls), rows: rec(this.rows), racks: rec(this.racks),
      assetModels: rec(this.assetModels), utilityFeeds: rec(this.utilityFeeds), transformers: rec(this.transformers),
      upsUnits: rec(this.upsUnits), pdus: rec(this.pdus), coolingZones: rec(this.coolingZones), cracUnits: rec(this.cracUnits),
      computeResources: rec(this.computeResources), capacityReservations: rec(this.capacityReservations), cidrBlocks: rec(this.cidrBlocks),
      subnets: rec(this.subnets), vlans: rec(this.vlans), vrfs: rec(this.vrfs), ipAddresses: rec(this.ipAddresses),
      rirs: rec(this.rirs), ipamRoles: rec(this.ipamRoles), ipRanges: rec(this.ipRanges), asns: rec(this.asns), asnRanges: rec(this.asnRanges),
      routeTargets: rec(this.routeTargets), vlanGroups: rec(this.vlanGroups), fhrpGroups: rec(this.fhrpGroups), serviceTemplates: rec(this.serviceTemplates), ipServices: rec(this.ipServices),
      changeRequests: rec(this.changeRequests), policies: rec(this.policies), approvalMatrixRules: rec(this.approvalMatrixRules), approvalSteps: rec(this.approvalSteps),
      complianceFrameworks: rec(this.complianceFrameworks), complianceControls: rec(this.complianceControls), policyDecisions: rec(this.policyDecisions),
      manufacturers: rec(this.manufacturers), deviceRoles: rec(this.deviceRoles), platforms: rec(this.platforms),
      inventoryItemRoles: rec(this.inventoryItemRoles), inventoryItems: rec(this.inventoryItems),
      deviceTypes: rec(this.deviceTypes), moduleTypes: rec(this.moduleTypes), componentTemplates: rec(this.componentTemplates), devices: rec(this.devices), deviceComponents: rec(this.deviceComponents), modules: rec(this.modules), cables: rec(this.cables),
      virtualChassis: rec(this.virtualChassis), powerPanels: rec(this.powerPanels), powerFeeds: rec(this.powerFeeds),
      rackReservations: rec(this.rackReservations), cableBundles: rec(this.cableBundles), virtualDeviceContexts: rec(this.virtualDeviceContexts), inventoryItemTemplates: rec(this.inventoryItemTemplates),
      siteGroups: rec(this.siteGroups), rackRoles: rec(this.rackRoles), rackTypes: rec(this.rackTypes), rackGroups: rec(this.rackGroups),
      managedDevices: rec(this.managedDevices), interfaces: rec(this.interfaces), alarms: rec(this.alarms), alarmRules: rec(this.alarmRules), configBackups: rec(this.configBackups),
      configChanges: rec(this.configChanges), discoveryJobs: rec(this.discoveryJobs), topologyLinks: rec(this.topologyLinks),
      incidents: rec(this.incidents), maintenanceWindows: rec(this.maintenanceWindows), demandRequests: rec(this.demandRequests), plans: rec(this.plans),
      providers: rec(this.providers), providerNetworks: rec(this.providerNetworks), circuitTypes: rec(this.circuitTypes), circuits: rec(this.circuits), circuitTerminations: rec(this.circuitTerminations),
      programs: rec(this.programs), projects: rec(this.projects), milestones: rec(this.milestones), permits: rec(this.permits), designDocuments: rec(this.designDocuments), changeOrders: rec(this.changeOrders), tickets: rec(this.tickets),
      vendors: rec(this.vendors), contracts: rec(this.contracts), boms: rec(this.boms), bomLines: rec(this.bomLines), purchaseOrders: rec(this.purchaseOrders), workOrders: rec(this.workOrders),
      projectActivities: rec(this.projectActivities),
      customers: rec(this.customers), services: rec(this.services), capacityPlans: rec(this.capacityPlans), edgeLocations: rec(this.edgeLocations),
      generators: rec(this.generators), chillers: rec(this.chillers), disposalCertificates: rec(this.disposalCertificates),
      standardChangeTemplates: rec(this.standardChangeTemplates), changeFreezes: rec(this.changeFreezes),
      plannerTemplates: rec(this.plannerTemplates), plannerBenchmarks: rec(this.plannerBenchmarks), plannerPlans: rec(this.plannerPlans), plannerScenarios: rec(this.plannerScenarios), plannerFeedback: rec(this.plannerFeedback),
      atps: rec(this.atps), atpSteps: rec(this.atpSteps), hotos: rec(this.hotos), snags: rec(this.snags), hotoDeliverables: rec(this.hotoDeliverables), hotoSignoffs: rec(this.hotoSignoffs),
      auditEvents: rec(this.auditEvents), documents: rec(this.documents),
      tasks: rec(this.tasks), risks: rec(this.risks),
      processDefinitions: rec(this.processDefinitions), processInstances: rec(this.processInstances), flowNodeInstances: rec(this.flowNodeInstances), userTasks: rec(this.userTasks), engineIncidents: rec(this.engineIncidents),
      materials: rec(this.materials), purchaseOrderLines: rec(this.purchaseOrderLines), goodsReceipts: rec(this.goodsReceipts),
      materialLines: rec(this.materialLines), supplyRequests: rec(this.supplyRequests), materialEvents: rec(this.materialEvents),
      gpuClusters: rec(this.gpuClusters), routingSessions: rec(this.routingSessions), dcPlants: rec(this.dcPlants),
      cdus: rec(this.cdus), envSensors: rec(this.envSensors), collectors: rec(this.collectors),
    };
  }
}
