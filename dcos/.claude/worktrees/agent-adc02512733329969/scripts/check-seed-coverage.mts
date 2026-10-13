/**
 * Seed coverage check.
 *
 * Builds the mock snapshot and reports, per entity, every field that is not filled on
 * 100% of records, and every enum value (from src/mock/data/enums.ts) that no record
 * uses. Optional fields that are legitimately absent are listed under ALLOWED so the
 * report only shows real gaps. Exit code 1 when an enum value is never used.
 *
 *   npm run mock-db:coverage
 */
import { buildSnapshot } from '../src/mock/db/seed.ts';
import * as E from '../src/mock/data/enums.ts';

const profile = (process.env.VITE_SEED_SCALE as 'small' | 'medium' | 'full') ?? 'small';
const t0 = Date.now();
const snap = buildSnapshot(profile);
const buildMs = Date.now() - t0;
const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Fields that are optional by design: absent means "does not apply", not "not filled". */
const ALLOWED: Record<string, string[]> = {
  '*': ['deletedAt', 'deletedBy', 'updatedBy', 'notes', 'tags', 'customFields'],
  dataCenters: ['commissionedDate'],
  services: ['ifName', 'cableIds'],
  edgeLocations: ['blocker', 'blockerNote'],
  processInstances: ['endedAt', 'currentElementIds'],
  flowNodeInstances: ['endedAt', 'assignee'],
  userTasks: ['assignee', 'completedAt'],
  plannerTemplates: ['scope', 'dcTypeKey', 'inheritsFrom', 'executesAs', 'blueprintKey', 'demand', 'items'],
  plannerPlans: ['campusId', 'dataCenterId', 'regionId', 'newSiteName', 'preferredScenarioId', 'programId', 'processInstanceId', 'revenuePerKwMonth', 'tariffUsdPerKwh'],
  plannerBenchmarks: ['value', 'low', 'high'],
  plannerFeedback: ['note'],
  dataCenterTypes: ['typicalRacksMax', 'powerKwMax', 'gaps'],
  racks: ['notes'],
  devices: ['rackId', 'position', 'primaryIp4', 'primaryIp6', 'oobIp', 'parentDeviceId', 'parentBayName', 'virtualChassisId', 'vcPosition', 'vcPriority', 'commissionedDate', 'decommissionDate', 'warrantyContractId', 'assetModelId'],
  deviceTypes: ['subdeviceRole'],
  componentTemplates: ['deviceTypeId', 'moduleTypeId', 'ifaceType', 'mgmtOnly', 'poeType', 'rfRole', 'speedMbps', 'duplex', 'mtu', 'consoleType', 'powerPortType', 'maxDrawW', 'allocatedDrawW', 'outletType', 'parentPowerPort', 'feedLeg', 'position', 'rearPortName', 'rearPortPosition', 'positions'],
  deviceComponents: ['ifaceType', 'moduleId', 'enabled', 'mgmtOnly', 'speedMbps', 'duplex', 'mtu', 'macAddress', 'mode', 'untaggedVlanId', 'taggedVlanIds', 'lagName', 'lagId', 'poeMode', 'poeType', 'wwn', 'vrfId', 'rearPortId', 'rearPortPosition', 'positions'],
  cables: ['bundleId'],
  subnets: ['parentId', 'vlanId', 'roleId', 'hallId', 'forecastExhaustionDate', 'cidrBlockId'],
  ipAddresses: ['deviceId', 'interfaceId', 'fhrpGroupId', 'isPrimary', 'hostname', 'dnsName', 'macAddress', 'allocatedAt', 'description', 'assetId'],
  vlans: ['vxlanId'],
  vrfs: ['dataCenterId'],
  ipServices: ['deviceId'],
  changeRequests: ['scheduledStart', 'scheduledEnd', 'implementedAt', 'policyViolations', 'externalRef', 'projectId', 'linkedWorkOrderId'],
  approvalMatrixRules: ['changeType', 'riskLevel'],
  approvalSteps: ['approverId', 'decidedAt', 'comment'],
  complianceControls: ['policyId', 'lastAssessedAt'],
  policyDecisions: ['changeRequestId'],
  managedDevices: [],
  alarms: ['interfaceId', 'clearedAt', 'acknowledgedAt', 'acknowledgedBy', 'correlatedAlarmIds', 'correlationId', 'ruleId', 'incidentId', 'flapCount'],
  configChanges: ['pushedAt', 'pushedBy', 'rollbackConfigId'],
  discoveryJobs: ['startedAt', 'completedAt'],
  incidents: ['acknowledgedAt', 'resolvedAt', 'rootCause', 'rootCauseId', 'linkedAlarmIds', 'linkedChangeRequestId', 'affectedResourceIds'],
  maintenanceWindows: ['changeRequestId'],
  plans: ['racksRequested', 'powerKwRequested', 'gpusRequested', 'affectedSubnetIds', 'affectedVlanIds', 'affectedDeviceIds', 'fromLocation', 'toLocation', 'changeType', 'projectTemplate', 'blueprintKey', 'linkedProjectId', 'linkedChangeRequestId', 'linkedProgramId', 'submittedAt', 'approvedAt', 'approvedBy', 'executedAt'],
  circuits: ['installDate', 'provisionedAt', 'testedAt', 'activatedAt'],
  circuitTerminations: ['dataCenterId', 'deviceId', 'interfaceId', 'providerNetworkId', 'xconnectId'],
  projects: ['planId', 'dependsOnProjectIds', 'phase', 'longLead', 'startGate'],
  projectActivities: ['attaches', 'condition'],
  permits: ['appliedDate', 'approvedDate', 'validFrom', 'expiryDate', 'attachments'],
  designDocuments: ['reviewedBy', 'issuedDate', 'attachments'],
  changeOrders: ['approvedBy', 'approvedAt', 'changeRequestId'],
  tickets: ['taskId', 'activityId', 'changeRequestId', 'resolvedAt'],
  atps: ['witnessedBy', 'acceptedAt'],
  atpSteps: ['actualResult'],
  hotos: ['warrantyStart', 'conditions'],
  hotoSignoffs: ['signedAt'],
  snags: ['closedAt'],
  purchaseOrders: [],
  workOrders: ['projectId'],
  auditEvents: ['projectId'],
  documents: ['steps', 'linkedEntityId'],
  capacityReservations: ['demandRequestId', 'changeRequestId'],
  customFields: ['choices'],
  tasks: ['milestoneId'],
  rackReservations: ['tenant'],
  powerFeeds: ['pduId', 'rackId'],
  powerPanels: ['hallId'],
  pdus: ['hallId', 'upsId'],
  upsUnits: ['feedId'],
  virtualDeviceContexts: ['primaryIp4', 'primaryIp6'],
  inventoryItems: ['parentId'],
  modules: [],
  virtualChassis: [],
  siteGroups: ['parentId'],
  rackGroups: [],
  rackTypes: [],
  providers: [],
  cidrBlocks: ['parentBlockId'],
  computeResources: [],
};

console.log(`Profile ${profile} · built in ${buildMs} ms`);
console.log('\n=== ENTITY COUNTS ===');
console.log(Object.entries(snap).map(([e, rows]) => `${e}:${rows.length}`).join('  '));

console.log('\n=== FIELDS NOT FILLED ON EVERY RECORD (excluding fields optional by design) ===');
let gaps = 0;
for (const [ent, rows] of Object.entries(snap)) {
  if (!rows.length) { console.log(`${ent}: EMPTY`); gaps++; continue; }
  const keys = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const allowed = new Set([...(ALLOWED['*'] ?? []), ...(ALLOWED[ent] ?? [])]);
  const low = [...keys].filter((k) => !allowed.has(k)).map((k) => [k, rows.filter((r) => !empty((r as Record<string, unknown>)[k])).length] as const).filter(([, n]) => n < rows.length).map(([k, n]) => `${k}=${Math.round((n / rows.length) * 100)}%`);
  if (low.length) { console.log(`${ent} (${rows.length}): ${low.join(', ')}`); gaps += low.length; }
}
if (!gaps) console.log('none');

console.log('\n=== ENUM VALUES NEVER USED ===');
const seen = new Set<string>();
const walk = (v: unknown) => { if (typeof v === 'string' || typeof v === 'number') seen.add(String(v)); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk); };
for (const rows of Object.values(snap)) rows.forEach(walk);
/** Enum values used only in code (no seed record carries them by design). */
const CODE_ONLY_ENUM_VALUES: Record<string, string[]> = {
  DC_TYPE_COVERAGE: ['Gap'], // the coverage assessment has no site type rated as a gap today
  PROJECT_TEMPLATE_CATEGORY: ['IT'], // offered in the new-project wizard; no seeded template is IT-only
};
let missingEnums = 0;
for (const [name, val] of Object.entries(E)) {
  if (!Array.isArray(val)) continue;
  const codeOnly = new Set(CODE_ONLY_ENUM_VALUES[name] ?? []);
  const missing = (val as readonly unknown[]).filter((x) => !codeOnly.has(String(x)) && (typeof x === 'string' ? !seen.has(x) : !seen.has(String(x))));
  if (missing.length) { console.log(`${name} (${missing.length}/${val.length}): ${missing.join(', ')}`); missingEnums += missing.length; }
}
if (!missingEnums) console.log('none — every enum value is used');
process.exit(missingEnums ? 1 : 0);
