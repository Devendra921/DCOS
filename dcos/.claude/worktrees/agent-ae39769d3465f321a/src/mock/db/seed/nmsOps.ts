/**
 * DCOS seed — operations.
 *
 * Alarm rules for every metric, alarms with storms and correlation, config changes in
 * every state (with rollbacks pointing at a real backup), discovery jobs, a topology
 * built from the actual cabling, incidents that cover every status, severity and
 * resource type with worklogs by named people, and maintenance windows in every state.
 */
import type * as T from '../../data/types';
import * as E from '../../data/enums';
import type { Seed } from './ctx';

export function seedNmsOps(S: Seed): void {
  const noc = S.byRole('NOC Lead');
  const netEng = S.byRole('Network Engineer');
  const NOC_POOL = [noc, netEng, S.byRole('Field Technician'), S.byRole('Facilities Engineer'), S.byRole('Site Technician'), S.byRole('Network Engineer')];
  const mdById = new Map(S.managedDevices.map((m) => [m.id, m]));

  // ── Alarm rules ──
  const ruleSpecs: Array<[string, E.MetricType, '>' | '>=' | '<' | '<=', number, E.AlarmSeverity, number, string]> = [
    ['CPU high', 'CPU', '>=', 85, 'Major', 5, 'All devices'], ['CPU critical', 'CPU', '>=', 95, 'Critical', 5, 'All devices'],
    ['Memory pressure', 'Memory', '>=', 90, 'Major', 10, 'All devices'],
    ['Interface saturation', 'IfUtilization', '>=', 85, 'Major', 10, 'Uplinks'], ['Interface critical', 'IfUtilization', '>=', 95, 'Critical', 5, 'Uplinks'],
    ['High temperature', 'Temperature', '>', 32, 'Major', 5, 'All devices'], ['Inlet temperature warning', 'Temperature', '>', 27, 'Warning', 15, 'GPU racks'],
    ['Packet loss', 'PacketLoss', '>', 1, 'Minor', 5, 'Core links'], ['Latency elevated', 'Latency', '>', 50, 'Minor', 10, 'WAN edges'],
    ['Interface errors', 'Errors', '>=', 50, 'Minor', 15, 'All interfaces'], ['Throughput floor', 'Throughput', '<', 100, 'Info', 30, 'Provider circuits'],
  ];
  const ruleIdByName: Record<string, string> = {};
  for (const [name, metric, operator, threshold, severity, durationMins, scope] of ruleSpecs) {
    const id = S.nid('ARULE'); ruleIdByName[name] = id;
    S.alarmRules.push({ id, ruleId: id, ...S.meta(noc), name, metric, operator, threshold, severity, durationMins, enabled: name !== 'Throughput floor', scope, notes: `${metric} ${operator} ${threshold} for ${durationMins} min` });
  }
  const ruleForType = (type: string, sev: E.AlarmSeverity): string | undefined => {
    if (/cpu/i.test(type)) return sev === 'Critical' ? ruleIdByName['CPU critical'] : ruleIdByName['CPU high'];
    if (/temp/i.test(type)) return sev === 'Warning' ? ruleIdByName['Inlet temperature warning'] : ruleIdByName['High temperature'];
    if (/memory/i.test(type)) return ruleIdByName['Memory pressure'];
    if (/utili/i.test(type)) return sev === 'Critical' ? ruleIdByName['Interface critical'] : ruleIdByName['Interface saturation'];
    if (/latency/i.test(type)) return ruleIdByName['Latency elevated'];
    if (/loss/i.test(type)) return ruleIdByName['Packet loss'];
    if (/error/i.test(type)) return ruleIdByName['Interface errors'];
    if (/throughput/i.test(type)) return ruleIdByName['Throughput floor'];
    return undefined;
  };

  // ── Alarms ──
  const ALARM_TYPES = ['Link Down', 'High CPU', 'PSU Failure', 'High Temperature', 'Memory Threshold', 'BGP Neighbor Down', 'Packet Loss', 'Latency Elevated', 'Interface Errors', 'Fan Failure', 'Inlet Temperature'];
  const CAUSES: Record<string, string> = { 'Link Down': 'Optical transceiver loss of signal', 'High CPU': 'Control-plane process saturation', 'PSU Failure': 'Power supply output fault', 'High Temperature': 'Inlet air above threshold', 'Memory Threshold': 'Memory leak in management daemon', 'BGP Neighbor Down': 'Hold timer expired', 'Packet Loss': 'Queue drops on congested uplink', 'Latency Elevated': 'Suboptimal path after reroute', 'Interface Errors': 'CRC errors on degraded optic', 'Fan Failure': 'Fan tray RPM below minimum', 'Inlet Temperature': 'Containment door left open' };
  const pushAlarm = (deviceId: string, sev: E.AlarmSeverity, type: string, i: number, interfaceId?: string, forceState?: E.AlarmState) => {
    const almId = S.nid('ALM');
    const state = forceState ?? S.cycle(['Active', 'Active', 'Acknowledged', 'Cleared', 'Active', 'Cleared'] as const, i);
    const count = /link down|flap/i.test(type) ? S.int(2, 14) : S.int(1, 6);
    const flapCount = i % 6 === 0 ? S.int(3, 9) : 0;
    const raisedMins = S.int(10, 14 * 24 * 60);
    const raised = S.minutesAgo(raisedMins);
    const acker = S.cycle(NOC_POOL, i);
    S.alarms.push({ id: almId, almId, ...S.meta(), deviceId, interfaceId, severity: sev, type, probableCause: CAUSES[type] ?? 'Threshold crossed', state, raisedAt: raised, firstRaisedAt: S.minutesAgo(raisedMins + S.int(0, 20 * 24 * 60)), clearedAt: state === 'Cleared' ? S.minutesAgo(Math.max(1, raisedMins - S.int(5, 600))) : undefined, acknowledgedAt: state === 'Acknowledged' ? S.minutesAgo(Math.max(1, raisedMins - S.int(2, 30))) : undefined, acknowledgedBy: state === 'Acknowledged' ? acker.name : undefined, correlatedAlarmIds: [], ruleId: ruleForType(type, sev), count, flapCount, sourceSystem: mdById.get(deviceId)?.sourceSystem ?? 'Databyte SNMP agent', notes: flapCount ? `Flapped ${flapCount} times — suppression candidate` : undefined });
  };
  const SEV_DEAL: E.AlarmSeverity[] = ['Critical', 'Major', 'Major', 'Minor', 'Minor', 'Minor', 'Warning', 'Warning', 'Warning', 'Info', 'Info'];
  S.managedDevices.forEach((md, i) => { if (i % 4 === 0) pushAlarm(md.id, S.cycle(SEV_DEAL, i), S.cycle(ALARM_TYPES, i), i); });
  // Faulty devices and unreachable devices raise their own alarms
  S.managedDevices.filter((m) => m.reachability === 'Unreachable').forEach((m, i) => pushAlarm(m.id, 'Critical', 'Link Down', i, undefined, 'Active'));
  S.devices.filter((d) => d.status === 'Faulty' && mdById.has(d.id)).forEach((d, i) => pushAlarm(d.id, 'Major', 'PSU Failure', i, undefined, 'Active'));
  // Performance → fault: hot interfaces raise utilisation alarms; error-prone ones raise error alarms
  S.interfaces.filter((f) => f.operStatus === 'Up' && f.utilizationPct >= 85).slice(0, 16).forEach((hi, i) => pushAlarm(hi.deviceId, hi.utilizationPct >= 95 ? 'Critical' : 'Major', 'Interface Utilization High', i, hi.id));
  S.interfaces.filter((f) => f.inErrors >= 70).slice(0, 8).forEach((hi, i) => pushAlarm(hi.deviceId, 'Minor', 'Interface Errors', i, hi.id, 'Active'));
  // Storms on the core/spine of the three largest sites
  const stormSevs: E.AlarmSeverity[] = ['Critical', 'Major', 'Major', 'Minor', 'Warning'];
  S.managedDevices.filter((m) => m.role === 'Core' || m.role === 'Spine').slice(0, 5).forEach((sd, si) => { for (let k = 0; k < 3 + (si % 3); k++) pushAlarm(sd.id, stormSevs[k % stormSevs.length], S.cycle(ALARM_TYPES, si + k), si * 7 + k, undefined, 'Active'); });
  const activeByDevice = new Map<string, T.Alarm[]>();
  for (const a of S.alarms) { if (a.state === 'Active') { const arr = activeByDevice.get(a.deviceId) ?? []; arr.push(a); activeByDevice.set(a.deviceId, arr); } }
  for (const [devId, group] of activeByDevice) { if (group.length >= 2) { const corr = `CORR-${devId}`; const ids = group.map((g) => g.id); group.forEach((g) => { g.correlationId = corr; g.correlatedAlarmIds = ids.filter((x) => x !== g.id); }); } }

  // ── Config changes (governed by change requests; one per status) ──
  const cfgCrs = S.changeRequests.filter((c) => c.type === 'ConfigPush' || c.type === 'NetworkMigration');
  const netManaged = S.managedDevices.filter((m) => ['Switch', 'Router', 'Firewall'].includes(m.deviceType));
  for (let i = 0; i < 24; i++) {
    const cfgchgId = S.nid('CFGCHG');
    const chg = S.cycle(cfgCrs, i);
    const dev = chg.affectedResourceType === 'Asset' && mdById.has(chg.affectedResourceIds[0]) ? mdById.get(chg.affectedResourceIds[0]) as T.ManagedDevice : S.cycle(netManaged, i * 3);
    const status = S.cycle(E.CONFIG_CHANGE_STATUS, i);
    const golden = S.configBackups.find((b) => b.deviceId === dev.id && b.isGolden) ?? S.configBackups.find((b) => b.deviceId === dev.id);
    const pushed = ['Pushed', 'Verified', 'Failed', 'RolledBack'].includes(status);
    S.configChanges.push({ id: cfgchgId, cfgchgId, ...S.meta(netEng), deviceId: dev.id, changeRequestId: chg.id, diff: S.cycle(['+ snmp-server group v3 auth priv\n- snmp-server community public RO', `+ interface ${S.interfaces.find((f) => f.deviceId === dev.id)?.name ?? 'Ethernet1/1'}\n+  description uplink-to-spine\n+  mtu 9216`, '+ ntp server 10.0.0.2 prefer\n+ logging host 10.0.0.3', '+ router bgp 64512\n+  neighbor 10.0.250.2 remote-as 3356\n+  neighbor 10.0.250.2 password <redacted>'], i), status, pushedAt: pushed ? S.daysAgo(S.int(0, 12)) : undefined, pushedBy: pushed ? netEng.name : undefined, driftDetected: status === 'Failed' || status === 'RolledBack' || i % 7 === 3, rollbackConfigId: status === 'RolledBack' ? golden?.id : undefined, notes: status === 'RolledBack' ? 'Verification failed; golden configuration restored' : status === 'Failed' ? 'Push rejected by device — syntax error' : undefined });
  }

  // ── Discovery jobs: every method and status ──
  const jobDefs: Array<[string, E.DiscoveryMethod, E.DiscoveryStatus, string]> = [['Daily SNMP sweep', 'SNMP', 'Completed', '0 2 * * *'], ['LLDP neighbour walk', 'LLDP', 'Running', '0 */6 * * *'], ['CDP legacy walk', 'CDP', 'Completed', '0 3 * * 1'], ['Ping reachability', 'Ping', 'Scheduled', '*/15 * * * *'], ['Redfish / IPMI inventory', 'API', 'Failed', '0 4 * * *'], ['Modbus plant poll', 'API', 'Completed', '*/5 * * * *']];
  jobDefs.forEach(([name, method, status, schedule], i) => {
    const discId = S.nid('DISC');
    S.discoveryJobs.push({ id: discId, discId, ...S.meta(noc), name, scope: i === 5 ? 'Plant: UPS, PDU, CRAC, CDU' : `10.${i * 3}.0.0/16`, method, status, schedule, startedAt: status === 'Scheduled' ? undefined : S.minutesAgo(S.int(5, 1440)), completedAt: status === 'Completed' || status === 'Failed' ? S.minutesAgo(S.int(1, 300)) : undefined, devicesFound: status === 'Scheduled' ? 0 : S.int(20, 220), linksFound: status === 'Scheduled' ? 0 : S.int(40, 420), notes: status === 'Failed' ? 'Collector credentials rejected on 12 hosts' : undefined });
  });

  // ── Topology from cabling: network-to-network cables become links; access ToRs are discovered by LLDP ──
  const netSet = new Set(netManaged.map((m) => m.id));
  const seen = new Set<string>();
  const roleOf = (id: string) => mdById.get(id)?.role;
  S.cables.forEach((c, i) => {
    if (!netSet.has(c.aDeviceId) || !netSet.has(c.bDeviceId)) return;
    const key = [c.aDeviceId, c.bDeviceId].sort().join('|'); if (seen.has(key)) return; seen.add(key);
    const topoId = S.nid('TOPO');
    const layer: E.LinkLayer = roleOf(c.aDeviceId) === 'Core' || roleOf(c.bDeviceId) === 'Core' ? 'L3' : 'L2';
    S.topologyLinks.push({ id: topoId, topoId, ...S.meta(), aDeviceId: c.aDeviceId, zDeviceId: c.bDeviceId, layer, discoveredVia: S.cycle(['LLDP', 'CDP', 'SNMP'] as const, i), status: c.status === 'Planned' ? 'Reserved' : c.status === 'Decommissioning' ? 'Unused' : 'Active', notes: `From cable ${c.cblId}` });
  });
  S.managedDevices.filter((m) => m.role === 'Access').forEach((tor, i) => {
    const leaf = S.managedDevices.find((m) => m.dataCenterId === tor.dataCenterId && m.role === 'Leaf/TOR');
    if (!leaf) return;
    const topoId = S.nid('TOPO');
    S.topologyLinks.push({ id: topoId, topoId, ...S.meta(), aDeviceId: tor.id, zDeviceId: leaf.id, layer: i % 9 === 8 ? 'L1' : 'L2', discoveredVia: S.cycle(['LLDP', 'API', 'Ping'] as const, i), status: tor.reachability === 'Unreachable' ? 'Unused' : 'Active' });
  });

  // ── Incidents ──
  const SLA_BY_SEV: Record<E.Severity, { resp: number; res: number }> = { SEV1: { resp: 15, res: 240 }, SEV2: { resp: 30, res: 480 }, SEV3: { resp: 120, res: 1440 }, SEV4: { resp: 480, res: 4320 } };
  const SEV_TO_PRI: Record<E.Severity, E.IncidentPriority> = { SEV1: 'P1', SEV2: 'P2', SEV3: 'P3', SEV4: 'P4' };
  const ROOT_CAUSES = ['Failed PSU on primary feed; redundant feed held load. PSU replaced.', 'Optical transceiver degraded causing link errors; SFP swapped.', 'CRAC compressor tripped on high pressure; reset and setpoint re-tuned.', 'BGP session flap from upstream maintenance; converged after timer expiry.', 'Breaker nuisance-trip under inrush; torque check and breaker replaced.', 'Misconfigured VLAN from prior change; corrected via rollback.', 'Capacity threshold breached on shared uplink; traffic rebalanced.', 'Containment door left open after maintenance; inlet temperature recovered once closed.'];
  interface IncSpec { title: string; type: string; severity: E.Severity; status: E.IncidentStatus; rt: E.ResourceType; ids: string[]; dcId?: string; alarmIds?: string[]; crId?: string }
  const specs: IncSpec[] = [];
  // Story incidents tied to real conditions
  const failedCrac = S.cracUnits.find((c) => c.status === 'Failed'); const failedZone = failedCrac && S.coolingZones.find((z) => z.id === failedCrac.coolingZoneId);
  if (failedZone) specs.push({ title: `Cooling failure — ${failedCrac?.name} failed in ${failedZone.name}`, type: 'Cooling', severity: 'SEV1', status: 'Investigating', rt: 'Cooling', ids: [failedZone.id], dcId: failedZone.dataCenterId });
  const failedFeed = S.powerFeeds.find((f) => f.status === 'Failed');
  if (failedFeed) specs.push({ title: `Power feed breaker trip — ${failedFeed.name}`, type: 'Power', severity: 'SEV1', status: 'Resolved', rt: 'PowerChain', ids: [failedFeed.id], dcId: S.racks.find((r) => r.id === failedFeed.rackId)?.dataCenterId, crId: S.changeRequests.find((c) => c.type === 'PowerUpgrade' && c.status === 'Implemented')?.id });
  S.circuits.filter((c) => c.status === 'Offline').forEach((ckt) => { const term = S.circuitTerminations.find((t) => t.circuitId === ckt.id && t.side === 'A'); specs.push({ title: `Carrier circuit offline — ${ckt.cid} (${S.providers.find((p) => p.id === ckt.providerId)?.name})`, type: 'Circuit', severity: 'SEV2', status: 'Open', rt: 'Asset', ids: term?.deviceId ? [term.deviceId] : [], dcId: term?.dataCenterId, crId: S.changeRequests.find((c) => c.type === 'NetworkMigration' && c.status === 'Approved')?.id }); });
  S.subnets.filter((s) => s.utilizationPct >= 85 && s.status === 'Active').slice(0, 2).forEach((s) => specs.push({ title: `Capacity exhaustion — ${s.cidr} at ${s.utilizationPct}%`, type: 'Capacity', severity: 'SEV3', status: 'Mitigated', rt: 'Subnet', ids: [s.id], dcId: s.dataCenterId }));
  const rolled = S.changeRequests.find((c) => c.status === 'RolledBack' && c.affectedResourceType === 'VLAN') ?? S.changeRequests.find((c) => c.status === 'RolledBack');
  if (rolled) specs.push({ title: `Network outage after change ${rolled.chgId} — VLAN misconfiguration`, type: 'Network', severity: 'SEV2', status: 'Closed', rt: 'VLAN', ids: rolled.affectedResourceType === 'VLAN' ? rolled.affectedResourceIds : [S.vlans[0].id], dcId: rolled.dataCenterId, crId: rolled.id });
  S.devices.filter((d) => d.status === 'Faulty').slice(0, 3).forEach((d) => { const rk = S.racks.find((r) => r.id === d.rackId); specs.push({ title: `Rack failure — ${d.hostname} PSU fault in ${rk?.name ?? 'rack'}`, type: 'Rack', severity: 'SEV3', status: 'Open', rt: 'Rack', ids: rk ? [rk.id] : [], dcId: d.dataCenterId, alarmIds: S.alarms.filter((a) => a.deviceId === d.id).map((a) => a.id) }); });
  S.managedDevices.filter((m) => m.reachability === 'Unreachable').slice(0, 4).forEach((m) => specs.push({ title: `Network outage — ${m.hostname} unreachable`, type: 'Network', severity: m.role === 'Core' ? 'SEV1' : 'SEV2', status: 'Investigating', rt: 'Asset', ids: [m.id], dcId: m.dataCenterId, alarmIds: S.alarms.filter((a) => a.deviceId === m.id).map((a) => a.id) }));
  // Historical spread so MTTR and SLA compliance have a real distribution
  const STATUS_DEAL: E.IncidentStatus[] = ['Resolved', 'Closed', 'Closed', 'Resolved', 'Open', 'Closed', 'Investigating', 'Resolved', 'Closed', 'Mitigated', 'Closed', 'Resolved'];
  const SEV_DEAL2: E.Severity[] = ['SEV3', 'SEV4', 'SEV2', 'SEV3', 'SEV4', 'SEV3', 'SEV1', 'SEV4', 'SEV3', 'SEV2', 'SEV4', 'SEV3'];
  for (let i = 0; i < 28; i++) {
    const rk = S.cycle(S.racks.filter((r) => r.status === 'Active' || r.status === 'Full'), i * 23);
    const type = S.cycle(['Power', 'Cooling', 'Network', 'Rack', 'Capacity'], i);
    specs.push({ title: `${S.cycle(['Power failure', 'Cooling failure', 'Network outage', 'Rack failure', 'Capacity exhaustion'], i)} — ${S.dataCenters.find((d) => d.id === rk.dataCenterId)?.code} ${rk.name}`, type, severity: S.cycle(SEV_DEAL2, i), status: S.cycle(STATUS_DEAL, i), rt: 'Rack', ids: [rk.id], dcId: rk.dataCenterId, alarmIds: i % 3 === 0 ? S.alarms.filter((a) => a.state !== 'Cleared').slice(i, i + 1).map((a) => a.id) : undefined, crId: i % 4 === 1 ? S.cycle(S.changeRequests.filter((c) => c.status !== 'Draft'), i).id : undefined });
  }
  specs.forEach((sp, i) => {
    const incId = S.nid('INC');
    const sla = SLA_BY_SEV[sp.severity];
    const closed = sp.status === 'Resolved' || sp.status === 'Closed';
    const assignee = S.cycle(NOC_POOL, i);
    const detectedMins = closed ? S.int(Math.round(sla.res * 0.5), 60 * 24 * 18) : S.int(5, Math.round(sla.res * 1.3));
    const detected = new Date(S.now - detectedMins * 60_000);
    const detectedAt = detected.toISOString();
    const acked = sp.status !== 'Open' || i % 5 !== 0;
    const ackDelay = Math.max(1, S.int(2, Math.round(sla.resp * 1.4)));
    const acknowledgedAt = acked ? new Date(detected.getTime() + ackDelay * 60_000).toISOString() : undefined;
    let resolvedAt: string | undefined; let rootCause: string | undefined;
    if (closed) {
      const within = i % 10 < 7;
      const resolveDelay = within ? S.int(Math.round(sla.res * 0.3), sla.res) : S.int(sla.res + 30, Math.round(sla.res * 1.8));
      resolvedAt = new Date(detected.getTime() + resolveDelay * 60_000).toISOString();
      rootCause = S.cycle(ROOT_CAUSES, i);
    }
    const linkedAlarmIds = sp.alarmIds?.length ? sp.alarmIds : undefined;
    linkedAlarmIds?.forEach((aid) => { const al = S.alarms.find((a) => a.id === aid); if (al) al.incidentId = incId; });
    const worklog: T.IncidentWorklogEntry[] = [{ at: detectedAt, author: linkedAlarmIds ? 'Databyte collector' : S.cycle(NOC_POOL, i + 1).name, kind: 'StatusChange', text: linkedAlarmIds ? 'Raised from correlated alarm.' : 'Raised by NOC operator.' }];
    if (acknowledgedAt) worklog.push({ at: acknowledgedAt, author: assignee.name, kind: 'Assignment', text: `Acknowledged; ${assignee.name} engaged.` });
    if (sp.severity === 'SEV1') worklog.push({ at: new Date(detected.getTime() + (ackDelay + S.int(10, 40)) * 60_000).toISOString(), author: assignee.name, kind: 'Escalation', text: 'Escalated to on-call duty manager (SEV1).' });
    if (sp.crId) worklog.push({ at: acknowledgedAt ?? detectedAt, author: assignee.name, kind: 'Note', text: 'Raised emergency change for remediation.' });
    if (sp.status === 'Mitigated') worklog.push({ at: new Date(detected.getTime() + (ackDelay + 45) * 60_000).toISOString(), author: assignee.name, kind: 'Note', text: 'Workaround in place; permanent fix tracked under the linked change.' });
    if (resolvedAt && rootCause) worklog.push({ at: resolvedAt, author: assignee.name, kind: 'Resolution', text: rootCause });
    S.incidents.push({ id: incId, incId, ...S.meta(), title: sp.title, type: sp.type, severity: sp.severity, status: sp.status, priority: SEV_TO_PRI[sp.severity], affectedResourceType: sp.rt, affectedResourceIds: sp.ids, dataCenterId: sp.dcId, detectedAt, acknowledgedAt, resolvedAt, slaResponseMins: sla.resp, slaResolveMins: sla.res, assignee: assignee.name, reportedBy: linkedAlarmIds ? 'Databyte collector' : S.cycle(NOC_POOL, i + 2).name, rootCause, rootCauseId: rootCause ? `RC-${String(100 + (i % 8)).padStart(3, '0')}` : undefined, linkedAlarmIds, linkedChangeRequestId: sp.crId, worklog, notes: sp.status === 'Closed' ? 'Post-incident review completed' : undefined });
  });

  // ── Maintenance windows: every status; scheduled ones tied to approved or scheduled changes ──
  const MW_TITLES = ['Core switch firmware upgrade', 'UPS battery replacement', 'CRAC preventive maintenance', 'Fibre re-termination', 'PDU breaker test', 'Spine OS patch', 'Generator load-bank test', 'CDU coolant chemistry service'];
  const schedCrs = S.changeRequests.filter((c) => c.status === 'Scheduled' || c.status === 'Approved');
  for (let i = 0; i < 16; i++) {
    const mwId = S.nid('MW');
    const dc = S.cycle(S.dataCenters.filter((d) => d.status !== 'Construction'), i * 5);
    const status = S.cycle(E.MAINTENANCE_STATUS, i);
    const offsetDays = status === 'Completed' ? -S.int(2, 12) : status === 'Cancelled' ? S.int(3, 10) : status === 'In Progress' ? 0 : S.int(1, 20);
    const start = new Date(S.now + offsetDays * 864e5 + (status === 'In Progress' ? -1 : S.int(0, 8)) * 36e5);
    const end = new Date(start.getTime() + S.int(2, 6) * 36e5);
    const devs = S.managedDevices.filter((d) => d.dataCenterId === dc.id).slice(0, 1 + (i % 4)).map((d) => d.id);
    const cr = status === 'Scheduled' || status === 'In Progress' ? S.cycle(schedCrs, i) : undefined;
    S.maintenanceWindows.push({ id: mwId, mwId, ...S.meta(noc), title: `${S.cycle(MW_TITLES, i)} — ${dc.code}`, status, dataCenterId: dc.id, changeRequestId: cr?.id, scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), affectedDeviceIds: devs, impact: S.cycle(['No customer impact', 'Redundancy reduced during window', 'Brief packet loss expected', 'Service restart required'], i), owner: S.cycle(NOC_POOL, i).name, notes: status === 'Cancelled' ? 'Cancelled — vendor engineer unavailable' : undefined });
  }
}
