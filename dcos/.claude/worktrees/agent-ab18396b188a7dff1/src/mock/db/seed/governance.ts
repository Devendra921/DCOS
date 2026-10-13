/**
 * DCOS seed — governance.
 *
 * Policy-as-code (OPA/Rego) with every policy field filled, an approval matrix, change
 * requests that cover every status with approval chains that agree with that status,
 * work orders raised from the physical changes, compliance frameworks and controls in
 * every status, and a decision log evaluated against the real estate so violations and
 * denials point at records a user can open.
 */
import type * as T from '../../data/types';
import * as E from '../../data/enums';
import { capacityThresholds, dcTypeProfile } from '../../data/dcTypes';
import type { Seed } from './ctx';

export function seedGovernance(S: Seed): void {
  const approver = S.byRole('Facilities Director');
  const chgApprover = S.byRole('NOC Lead');
  const netEng = S.byRole('Network Engineer');
  const compliance = S.byRole('Compliance Manager');

  // ── Policies ──
  const policyDefs: Array<{ name: string; cat: E.PolicyCategory; rule: string; field: string; op: string; value: number | string; appliesTo: E.ResourceType; enf: E.Enforcement; pkg: string; rego: string; controls: string[] }> = [
    { name: 'Rack power within facility-type budget', cat: 'Power', rule: 'rack.powerUtilizationPct <= dcType.capacity.rackPowerBlockPct', field: 'powerUtilizationPct', op: '<=', value: 'dcType.rackPowerBlockPct', appliesTo: 'Rack', enf: 'Block', pkg: 'dcos.rack.power', controls: ['A.8.32', 'CC8.1', 'CM-3', '6.4'],
      rego: 'package dcos.rack.power\n\n# Block changes that push a rack over the power budget its facility type allows\nlimit := data.dcos.dcTypes[input.site.dcTypeKey].capacity.rackPowerBlockPct\n\ndefault allow := false\n\nallow {\n\tinput.rack.powerUtilizationPct <= limit\n}\n\nviolation[msg] {\n\tinput.rack.powerUtilizationPct > limit\n\tmsg := sprintf("Rack %s at %d%% exceeds the %d%% budget for a %s", [input.rack.name, input.rack.powerUtilizationPct, limit, input.site.dcTypeName])\n}' },
    { name: 'Maintain N+1 power redundancy', cat: 'Redundancy', rule: 'rack.redundancy in {N+1,2N,2N+1}', field: 'redundancy', op: 'in', value: 'N+1,2N,2N+1', appliesTo: 'Rack', enf: 'Block', pkg: 'dcos.rack.redundancy', controls: ['CP-2', 'A.5.23'],
      rego: 'package dcos.rack.redundancy\n\nallowed := {"N+1", "2N", "2N+1"}\n\nviolation[msg] {\n\tnot allowed[input.rack.redundancy]\n\tmsg := sprintf("Rack %s redundancy %q violates the N+1 minimum", [input.rack.name, input.rack.redundancy])\n}' },
    { name: 'Cooling headroom ≥ facility-type floor', cat: 'Cooling', rule: 'coolingZone.headroomPct >= dcType.capacity.coolingHeadroomMinPct', field: 'headroomPct', op: '>=', value: 'dcType.coolingHeadroomMinPct', appliesTo: 'Cooling', enf: 'Warn', pkg: 'dcos.cooling.zone', controls: ['CP-2'],
      rego: 'package dcos.cooling.zone\n\nfloor := data.dcos.dcTypes[input.site.dcTypeKey].capacity.coolingHeadroomMinPct\n\nviolation[msg] {\n\tinput.zone.headroomPct < floor\n\tmsg := sprintf("Cooling zone %s headroom %d%% below the %d%% floor for a %s", [input.zone.name, input.zone.headroomPct, floor, input.site.dcTypeName])\n}' },
    { name: 'Keep 15% IP reserve per subnet', cat: 'IPReserve', rule: 'subnet.utilizationPct <= 85', field: 'utilizationPct', op: '<=', value: 85, appliesTo: 'Subnet', enf: 'Warn', pkg: 'dcos.ipam.subnet', controls: ['1.2', 'A.8.9'],
      rego: 'package dcos.ipam.subnet\n\nviolation[msg] {\n\tinput.subnet.utilizationPct > 85\n\tmsg := sprintf("Subnet %s at %d%% breaches the 15%% reserve", [input.subnet.cidr, input.subnet.utilizationPct])\n}' },
    { name: 'No deploy in restricted halls', cat: 'Placement', rule: 'hall.restricted == false', field: 'restricted', op: '==', value: 'false', appliesTo: 'Rack', enf: 'Audit', pkg: 'dcos.placement', controls: ['CC6.1', 'A.8.9'],
      rego: 'package dcos.placement\n\nviolation[msg] {\n\tinput.hall.restricted\n\tmsg := sprintf("Deployment into restricted hall %s", [input.hall.name])\n}' },
    { name: 'GPU racks require liquid-cooling readiness', cat: 'Cooling', rule: 'purpose==GPU => rack.liquidCoolingReady', field: 'liquidCoolingReady', op: '==', value: 'true', appliesTo: 'Rack', enf: 'Warn', pkg: 'dcos.rack.cooling', controls: ['CM-3'],
      rego: 'package dcos.rack.cooling\n\nviolation[msg] {\n\tinput.rack.purpose == "GPU"\n\tnot input.rack.liquidCoolingReady\n\tmsg := sprintf("GPU rack %s is not liquid-cooling ready (>40kW density risk)", [input.rack.name])\n}' },
    { name: 'Dual power feeds on every production rack', cat: 'Redundancy', rule: 'count(rack.feeds[status==Active]) >= 2', field: 'activeFeeds', op: '>=', value: 2, appliesTo: 'PowerChain', enf: 'Audit', pkg: 'dcos.rack.feeds', controls: ['CP-2', 'A.7.11'],
      rego: 'package dcos.rack.feeds\n\nviolation[msg] {\n\tcount([f | f := input.rack.feeds[_]; f.status == "Active"]) < 2\n\tmsg := sprintf("Rack %s has fewer than two active feeds", [input.rack.name])\n}' },
    { name: 'No duplicate addresses in a VRF', cat: 'IPReserve', rule: 'ip.status != Conflict', field: 'status', op: '!=', value: 'Conflict', appliesTo: 'Subnet', enf: 'Block', pkg: 'dcos.ipam.conflict', controls: ['A.8.9', '1.2'],
      rego: 'package dcos.ipam.conflict\n\nviolation[msg] {\n\tinput.ip.status == "Conflict"\n\tmsg := sprintf("Address %s is claimed twice in %s", [input.ip.address, input.subnet.cidr])\n}' },
  ];
  for (const p of policyDefs) {
    const polId = S.nid('POL');
    S.policies.push({ id: polId, polId, ...S.meta(compliance), name: p.name, category: p.cat, rule: p.rule, thresholdField: p.field, operator: p.op, thresholdValue: p.value, enforcement: p.enf, appliesTo: p.appliesTo, active: p.name.includes('restricted') ? false : true, regoPackage: p.pkg, rego: p.rego, controlRefs: p.controls, notes: p.enf === 'Block' ? 'Blocking policy — a deny stops the change' : p.enf === 'Warn' ? 'Advisory — a warn is recorded on the change' : 'Audit only' });
  }

  // ── Approval matrix ──
  const ruleDefs: Array<[string, E.ChangeType | undefined, E.RiskLevel | undefined, { order: number; approverRole: E.Role; requiredCount: number }[], E.RiskLevel]> = [
    ['Standard rack deploy', 'RackDeploy', 'Medium', [{ order: 1, approverRole: 'FacilityManager', requiredCount: 1 }, { order: 2, approverRole: 'ChangeApprover', requiredCount: 1 }], 'Low'],
    ['Power change (facilities sign-off)', 'PowerUpgrade', 'High', [{ order: 1, approverRole: 'FacilityManager', requiredCount: 1 }, { order: 2, approverRole: 'CapacityPlanner', requiredCount: 1 }, { order: 3, approverRole: 'ChangeApprover', requiredCount: 1 }], 'Low'],
    ['Critical change (4-eyes)', undefined, 'Critical', [{ order: 1, approverRole: 'ChangeApprover', requiredCount: 2 }, { order: 2, approverRole: 'Executive', requiredCount: 1 }], 'Low'],
    ['Network config push', 'ConfigPush', 'Medium', [{ order: 1, approverRole: 'NetworkEngineer', requiredCount: 1 }, { order: 2, approverRole: 'NOCOperator', requiredCount: 1 }], 'Low'],
    ['Decommission (compliance witness)', 'Decommission', undefined, [{ order: 1, approverRole: 'DeliveryManager', requiredCount: 1 }, { order: 2, approverRole: 'ComplianceAuditor', requiredCount: 1 }, { order: 3, approverRole: 'Administrator', requiredCount: 1 }], 'Medium'],
    ['Field relocation', 'ServerRelocation', 'Low', [{ order: 1, approverRole: 'FieldTechnician', requiredCount: 1 }], 'Low'],
  ];
  for (const [name, ct, rl, stages, auto] of ruleDefs) {
    const apruleId = S.nid('APRULE');
    S.approvalMatrixRules.push({ id: apruleId, apruleId, ...S.meta(compliance), name, changeType: ct, riskLevel: rl, stages, autoApproveBelowRisk: auto, notes: `${stages.length}-stage approval` });
  }
  const ruleFor = (type: E.ChangeType, risk: E.RiskLevel): T.ApprovalMatrixRule => S.approvalMatrixRules.find((r) => r.riskLevel === 'Critical' && risk === 'Critical') ?? S.approvalMatrixRules.find((r) => r.changeType === type) ?? S.approvalMatrixRules.find((r) => r.riskLevel === risk) ?? S.approvalMatrixRules[0];
  const personForRole = (role: E.Role) => ({ FacilityManager: 'Facilities Director', ChangeApprover: 'NOC Lead', CapacityPlanner: 'Capacity Planner', NetworkEngineer: 'Network Engineer', NOCOperator: 'NOC Lead', Executive: 'Executive', DeliveryManager: 'Program Manager', ComplianceAuditor: 'Compliance Manager', Administrator: 'Administrator', FieldTechnician: 'Field Technician' } as Record<E.Role, string>)[role];

  // ── Change requests: every status, resources that exist, approval chains that match ──
  const STATUS_DEAL: E.ChangeStatus[] = [
    ...Array<E.ChangeStatus>(16).fill('Approved'),
    'Draft', 'Draft', 'Submitted', 'Submitted', 'Submitted', 'UnderReview', 'UnderReview', 'UnderReview', 'UnderReview',
    'Scheduled', 'Scheduled', 'Scheduled', 'InProgress', 'InProgress', 'Implemented', 'Implemented', 'Implemented',
    'Closed', 'Closed', 'Closed', 'Closed', 'Rejected', 'Rejected', 'Cancelled', 'RolledBack', 'RolledBack',
  ];
  const TITLES: Record<E.ChangeType, string[]> = {
    RackDeploy: ['Rack-and-stack 4× GPU nodes', 'Install storage expansion shelf', 'Deploy leaf pair for new row', 'Stand up colo tenant cage racks'],
    VLANProvision: ['Provision tenant VLAN and prefix', 'Add storage VLAN to hall fabric', 'Extend management VLAN to OOB switch'],
    PowerUpgrade: ['Upgrade rack feeds to 32 A three-phase', 'Add B-side feed to row C', 'Replace rack PDU with metered unit', 'Breaker uprate for GPU row'],
    ServerRelocation: ['Relocate blade chassis to hall 2', 'Move storage array to DR suite', 'Re-rack hot rack kit to spread load'],
    NetworkMigration: ['Migrate spine uplinks to 400G', 'Cut over DMZ to new firewall pair', 'Re-home leaf uplinks to spine-02'],
    Decommission: ['Retire EOL compute rack', 'Decommission legacy aggregation switch', 'Sanitise and remove retired storage'],
    ConfigPush: ['Push golden config to leaf-01', 'Enable SNMPv3 on access switches', 'BGP policy update on provider edge', 'Harden NTP and syslog on core'],
  };
  const hotRacks = S.racks.filter((r) => r.status !== 'Planned' && r.powerUtilizationPct >= 85);
  const activeRacks = S.racks.filter((r) => r.status === 'Active' || r.status === 'Full');
  const feeds = S.powerFeeds.filter((f) => f.status === 'Active');
  const netDevices = S.devices.filter((d) => ['Switch', 'Router', 'Firewall'].includes(d.category ?? ''));
  const siteFor = (r?: { dataCenterId?: string }) => r?.dataCenterId;
  const start = (i: number, status: E.ChangeStatus): string => {
    if (['Implemented', 'Closed', 'RolledBack'].includes(status)) return S.daysAgo(S.int(3, 40) + i % 7);
    if (status === 'InProgress') return S.daysAgo(0);
    if (status === 'Scheduled' || status === 'Approved') return S.daysAhead(S.int(1, 21));
    return S.daysAhead(S.int(7, 45));
  };
  STATUS_DEAL.forEach((status, i) => {
    const chgId = S.nid('CHG');
    const type = S.cycle(E.CHANGE_TYPE, i);
    const risk = S.cycle(E.RISK_LEVEL, i + (status === 'RolledBack' ? 2 : 0));
    const priority = S.cycle(E.PRIORITY, i);
    let rt: E.ResourceType; let ids: string[]; let dcId: string | undefined;
    if (type === 'VLANProvision') { const v = S.cycle(S.vlans, i); rt = 'VLAN'; ids = [v.id]; dcId = v.dataCenterId; }
    else if (type === 'NetworkMigration' || type === 'ConfigPush') { const d = S.cycle(netDevices, i * 3); rt = type === 'ConfigPush' ? 'Asset' : 'Subnet'; ids = type === 'ConfigPush' ? [d.id] : [S.cycle(S.subnets.filter((s) => s.dataCenterId === d.dataCenterId && s.status !== 'Container'), i).id]; dcId = d.dataCenterId; }
    else if (type === 'PowerUpgrade') { const f = S.cycle(feeds, i * 5); rt = 'PowerChain'; ids = [f.id]; dcId = siteFor(S.racks.find((r) => r.id === f.rackId)); }
    else if (type === 'ServerRelocation') { const r = S.cycle(hotRacks.length ? hotRacks : activeRacks, i); const kit = S.devices.filter((d) => d.rackId === r.id).slice(0, 2); rt = 'Asset'; ids = kit.map((d) => d.id); dcId = r.dataCenterId; }
    else { const r = type === 'Decommission' ? S.cycle(S.racks.filter((x) => x.status === 'Retired'), i) : S.cycle(activeRacks, i * 7); rt = 'Rack'; ids = [r.id]; dcId = r.dataCenterId; }
    const rule = ruleFor(type, risk);
    const fromItsm = i % 2 === 0;
    const requester = S.person(i); const assignee = S.siteStaff(S.dcCampus.get(dcId ?? '') ?? '', i);
    const sStart = start(i, status);
    const sEnd = new Date(new Date(sStart).getTime() + S.int(2, 6) * 36e5).toISOString();
    const done = ['Implemented', 'Closed', 'RolledBack'].includes(status);
    const dc = S.dataCenters.find((d) => d.id === dcId);
    S.changeRequests.push({
      id: chgId, chgId, ...S.meta(requester), title: `${S.cycle(TITLES[type], i)} — ${dc?.code ?? 'estate'}`, type,
      description: `${S.cycle(TITLES[type], i)} at ${dc?.name ?? 'the estate'}. Scope, pre-checks and verification steps are attached; capacity and policy checks ran at submission.`,
      risk, status, priority, affectedResourceType: rt, affectedResourceIds: ids, dataCenterId: dcId,
      requestedBy: requester.name, requestedById: requester.id, assignedTo: assignee.name, assignedToId: assignee.id,
      scheduledStart: status === 'Draft' ? undefined : sStart, scheduledEnd: status === 'Draft' ? undefined : sEnd,
      implementedAt: done ? sEnd : undefined, policyViolations: [], approvalRuleId: rule.id,
      rollbackPlan: type === 'ConfigPush' ? 'Restore the golden configuration from the last backup and verify reachability.' : type === 'PowerUpgrade' ? 'Return the feed to the original breaker and re-test under load.' : 'Reverse the physical change in the same window and update the record.',
      source: fromItsm ? 'ServiceNow' : 'Internal', externalRef: fromItsm ? `CHG00${30500 + i}` : undefined,
      notes: status === 'RolledBack' ? 'Rolled back after post-implementation verification failed.' : status === 'Rejected' ? 'Rejected: insufficient headroom in the target rack.' : status === 'Cancelled' ? 'Cancelled by requester — superseded by a programme project.' : undefined,
    });
    // Approval chain consistent with the status
    if (status !== 'Draft') {
      rule.stages.forEach((st, k) => {
        for (let n = 0; n < st.requiredCount; n++) {
          const apstepId = S.nid('APSTEP');
          const who = S.byRole(personForRole(st.approverRole));
          let decision: E.ApprovalDecision = 'Pending';
          if (['Approved', 'Scheduled', 'InProgress', 'Implemented', 'Closed', 'RolledBack', 'Cancelled'].includes(status)) decision = 'Approved';
          else if (status === 'Rejected') decision = k === rule.stages.length - 1 ? 'Rejected' : 'Approved';
          else if (status === 'UnderReview') decision = k === 0 ? (i % 3 === 0 ? 'Delegated' : 'Approved') : 'Pending';
          else if (status === 'Submitted') decision = 'Pending';
          const decided = decision !== 'Pending';
          S.approvalSteps.push({ id: apstepId, apstepId, ...S.meta(who), changeRequestId: chgId, order: st.order, approverRole: st.approverRole, approverId: decided ? who.id : undefined, decision, decidedAt: decided ? S.daysAgo(S.int(1, 20)) : undefined, comment: decision === 'Approved' ? 'Checked headroom and window; approved.' : decision === 'Rejected' ? 'Target rack is over its power budget.' : decision === 'Delegated' ? `Delegated to ${chgApprover.name} (on leave).` : undefined });
        }
      });
    }
  });

  // ── Work orders raised by physical changes ──
  const WO_TYPE: Partial<Record<E.ChangeType, E.WorkOrderType>> = { RackDeploy: 'RackInstall', ServerRelocation: 'DeviceDeploy', PowerUpgrade: 'PowerConnect', VLANProvision: 'Cabling', Decommission: 'DeviceDeploy', NetworkMigration: 'Cabling' };
  const WO_STATUS: Partial<Record<E.ChangeStatus, E.WorkOrderStatus>> = { Approved: 'Assigned', Scheduled: 'Assigned', InProgress: 'InProgress', Implemented: 'Validated', Closed: 'Completed' };
  S.changeRequests.forEach((cr, i) => {
    const t = WO_TYPE[cr.type]; const st = WO_STATUS[cr.status];
    if (!t || !st) return;
    const id = S.nid('WO');
    const rackId = cr.affectedResourceType === 'Rack' ? cr.affectedResourceIds[0] : cr.affectedResourceType === 'Asset' ? S.devices.find((d) => d.id === cr.affectedResourceIds[0])?.rackId : cr.affectedResourceType === 'PowerChain' ? S.powerFeeds.find((f) => f.id === cr.affectedResourceIds[0])?.rackId : S.racks.find((r) => r.dataCenterId === cr.dataCenterId)?.id;
    const tech = S.siteStaff(S.dcCampus.get(cr.dataCenterId ?? '') ?? '', i);
    S.workOrders.push({ id, woId: id, ...S.meta(tech), type: t, changeRequestId: cr.id, rackId, assigneeName: tech.role === 'Site Technician' || tech.role === 'Field Technician' || tech.role === 'Facilities Engineer' ? tech.name : S.byRole('Field Technician').name, status: st, scheduledDate: cr.scheduledStart ?? S.daysAhead(3), notes: `${t} for ${cr.chgId}` });
    cr.linkedWorkOrderId = id;
  });

  // ── Compliance frameworks and controls ──
  const fwMeta: Record<string, { version: string; desc: string }> = { 'ISO 27001': { version: '2022', desc: 'Information security management system' }, 'SOC 2': { version: 'Type II', desc: 'Trust services criteria (security, availability)' }, 'PCI DSS': { version: '4.0', desc: 'Payment card data security' }, NIST: { version: '800-53 r5', desc: 'Security and privacy controls' } };
  const fwIdByName: Record<string, string> = {};
  for (const std of E.COMPLIANCE_STANDARD) {
    const fwId = S.nid('FW'); fwIdByName[std] = fwId;
    S.complianceFrameworks.push({ id: fwId, fwId, ...S.meta(compliance), name: std, version: fwMeta[std].version, description: fwMeta[std].desc, owner: compliance.name, status: 'Active', notes: `${std} ${fwMeta[std].version} in scope for the production sites` });
  }
  const polByName = (n: string) => S.policies.find((p) => p.name.startsWith(n));
  const controlDefs: Array<{ standard: E.ComplianceStandard; ref: string; title: string; type: E.ControlType; policy?: T.Policy; status: E.ControlStatus }> = [
    { standard: 'ISO 27001', ref: 'A.8.32', title: 'Change management', type: 'Automated', policy: polByName('Rack power'), status: 'NonCompliant' },
    { standard: 'ISO 27001', ref: 'A.8.9', title: 'Configuration management', type: 'Automated', policy: polByName('No duplicate'), status: 'Compliant' },
    { standard: 'ISO 27001', ref: 'A.5.23', title: 'Information security for cloud services', type: 'Automated', policy: polByName('Maintain N+1'), status: 'Compliant' },
    { standard: 'ISO 27001', ref: 'A.7.11', title: 'Supporting utilities', type: 'Automated', policy: polByName('Dual power'), status: 'InProgress' },
    { standard: 'ISO 27001', ref: 'A.7.4', title: 'Physical security monitoring', type: 'Manual', status: 'Compliant' },
    { standard: 'ISO 27001', ref: 'A.6.3', title: 'Security awareness training', type: 'Manual', status: 'InProgress' },
    { standard: 'SOC 2', ref: 'CC8.1', title: 'Change management process', type: 'Automated', policy: polByName('Rack power'), status: 'NonCompliant' },
    { standard: 'SOC 2', ref: 'CC6.1', title: 'Logical access controls', type: 'Automated', policy: polByName('No deploy in restricted'), status: 'NotAssessed' },
    { standard: 'SOC 2', ref: 'CC7.2', title: 'Security incident monitoring', type: 'Manual', status: 'Compliant' },
    { standard: 'SOC 2', ref: 'CC1.4', title: 'Personnel screening / background checks', type: 'Manual', status: 'NotAssessed' },
    { standard: 'PCI DSS', ref: '1.2', title: 'Network segmentation', type: 'Automated', policy: polByName('Keep 15% IP reserve'), status: 'NonCompliant' },
    { standard: 'PCI DSS', ref: '6.4', title: 'Change control procedures', type: 'Automated', policy: polByName('Rack power'), status: 'NonCompliant' },
    { standard: 'PCI DSS', ref: '10.2', title: 'Audit trails for all access', type: 'Manual', status: 'Compliant' },
    { standard: 'NIST', ref: 'CM-3', title: 'Configuration change control', type: 'Automated', policy: polByName('GPU racks require'), status: 'Compliant' },
    { standard: 'NIST', ref: 'CP-2', title: 'Contingency planning', type: 'Automated', policy: polByName('Cooling headroom'), status: 'Compliant' },
    { standard: 'NIST', ref: 'AU-2', title: 'Audit events', type: 'Manual', status: 'Compliant' },
    { standard: 'NIST', ref: 'PE-3', title: 'Physical access enforcement', type: 'Manual', status: 'InProgress' },
  ];
  controlDefs.forEach((c, i) => {
    const ctrlId = S.nid('CTRL');
    S.complianceControls.push({ id: ctrlId, ctrlId, ...S.meta(compliance), standard: c.standard, frameworkId: fwIdByName[c.standard], ref: c.ref, title: c.title, description: `${c.standard} ${c.ref} — ${c.title}`, type: c.type, policyId: c.policy?.id, owner: S.cycle([compliance, approver, netEng, S.byRole('Security Manager')], i).name, status: c.status, lastAssessedAt: c.status === 'NotAssessed' ? undefined : S.daysAgo(S.int(3, 80)), evidenceCount: c.status === 'NotAssessed' ? 0 : S.int(1, 12), notes: c.type === 'Manual' ? 'Attested quarterly with evidence attached' : 'Evaluated continuously by policy' });
  });

  // ── Decision log: policies evaluated against real records; denials come from blocking policies ──
  const halls = S.halls;
  const restrictedHall = (h?: T.Hall) => !!h && /Suite/.test(h.name);
  const evalPolicy = (pol: T.Policy, i: number): { rt: E.ResourceType; id: string; name: string; input: Record<string, unknown>; violated: boolean; msg: string } => {
    if (pol.regoPackage === 'dcos.ipam.subnet') {
      const pool = S.subnets.filter((s) => s.status !== 'Container'); const s = i % 2 === 0 ? (pool.filter((x) => x.utilizationPct > 85)[i % 3] ?? S.cycle(pool, i)) : S.cycle(pool, i * 7);
      const violated = s.utilizationPct > 85;
      return { rt: 'Subnet', id: s.id, name: s.cidr, input: { subnet: { cidr: s.cidr, utilizationPct: s.utilizationPct } }, violated, msg: violated ? `Subnet ${s.cidr} at ${s.utilizationPct}% breaches the 15% reserve` : 'within reserve' };
    }
    if (pol.regoPackage === 'dcos.ipam.conflict') {
      const conflicts = S.ipAddresses.filter((ip) => ip.status === 'Conflict'); const ip = i % 2 === 0 && conflicts.length ? S.cycle(conflicts, i) : S.cycle(S.ipAddresses.filter((x) => x.deviceId), i * 11);
      const sn = S.subnets.find((s) => s.id === ip.subnetId);
      const violated = ip.status === 'Conflict';
      return { rt: 'Subnet', id: sn?.id ?? ip.subnetId, name: ip.address, input: { ip: { address: ip.address, status: ip.status }, subnet: { cidr: sn?.cidr } }, violated, msg: violated ? `Address ${ip.address} is claimed twice in ${sn?.cidr}` : 'no conflict' };
    }
    if (pol.regoPackage === 'dcos.cooling.zone') {
      const z = S.cycle(S.coolingZones, i * 3);
      const headroomPct = z.coolingCapacityKw > 0 ? Math.round((z.headroomKw / z.coolingCapacityKw) * 100) : 0;
      const zdc = S.dataCenters.find((d) => d.id === z.dataCenterId);
      const floor = capacityThresholds(zdc?.dcTypeKey).coolingHeadroomMinPct;
      const violated = headroomPct < floor;
      return { rt: 'Cooling', id: z.id, name: z.name, input: { zone: { name: z.name, headroomPct }, site: { dcTypeKey: zdc?.dcTypeKey, dcTypeName: dcTypeProfile(zdc?.dcTypeKey)?.name } }, violated, msg: violated ? `Cooling zone ${z.name} headroom ${headroomPct}% below the ${floor}% floor for a ${dcTypeProfile(zdc?.dcTypeKey)?.name ?? 'site'}` : 'headroom ok' };
    }
    if (pol.regoPackage === 'dcos.rack.feeds') {
      const r = S.cycle(S.racks.filter((x) => x.status === 'Active'), i * 5);
      const active = S.powerFeeds.filter((f) => f.rackId === r.id && f.status === 'Active').length;
      const hasFeeds = S.powerFeeds.some((f) => f.rackId === r.id);
      const violated = hasFeeds && active < 2;
      return { rt: 'PowerChain', id: r.id, name: r.name, input: { rack: { name: r.name, feeds: S.powerFeeds.filter((f) => f.rackId === r.id).map((f) => ({ name: f.name, status: f.status })) } }, violated, msg: violated ? `Rack ${r.name} has fewer than two active feeds` : 'dual feeds present' };
    }
    const r = pol.category === 'Power' ? (i % 2 === 0 && hotRacks.length ? S.cycle(hotRacks, i) : S.cycle(activeRacks, i * 13)) : pol.regoPackage === 'dcos.rack.cooling' ? S.cycle(S.racks.filter((x) => x.purpose === 'GPU'), i) : S.cycle(activeRacks, i * 17);
    const rdc = S.dataCenters.find((d) => d.id === r.dataCenterId);
    if (pol.category === 'Redundancy') {
      const violated = !['N+1', '2N', '2N+1'].includes(r.redundancy);
      return { rt: 'Rack', id: r.id, name: r.name, input: { rack: { name: r.name, redundancy: r.redundancy } }, violated, msg: violated ? `Rack ${r.name} redundancy ${r.redundancy} violates N+1` : 'redundancy ok' };
    }
    if (pol.regoPackage === 'dcos.rack.cooling') {
      const violated = r.purpose === 'GPU' && !r.liquidCoolingReady;
      return { rt: 'Rack', id: r.id, name: r.name, input: { rack: { name: r.name, purpose: r.purpose, liquidCoolingReady: r.liquidCoolingReady } }, violated, msg: violated ? `GPU rack ${r.name} is not liquid-cooling ready` : 'cooling ready' };
    }
    if (pol.category === 'Placement') {
      const hall = halls.find((h) => h.id === r.hallId);
      const restricted = restrictedHall(hall);
      return { rt: 'Rack', id: r.id, name: r.name, input: { hall: { name: hall?.name ?? 'Hall', restricted } }, violated: restricted, msg: restricted ? `Deployment into restricted hall ${hall?.name ?? ''}` : 'hall ok' };
    }
    const limit = capacityThresholds(rdc?.dcTypeKey).rackPowerBlockPct;
    const violated = r.powerUtilizationPct > limit;
    return { rt: 'Rack', id: r.id, name: r.name, input: { rack: { name: r.name, powerUtilizationPct: r.powerUtilizationPct }, site: { dcTypeKey: rdc?.dcTypeKey, dcTypeName: dcTypeProfile(rdc?.dcTypeKey)?.name } }, violated, msg: violated ? `Rack ${r.name} at ${r.powerUtilizationPct}% exceeds the ${limit}% budget for a ${dcTypeProfile(rdc?.dcTypeKey)?.name ?? 'site'}` : 'within budget' };
  };
  const linkable = S.changeRequests.filter((c) => c.status !== 'Draft');
  for (let i = 0; i < 64; i++) {
    const pol = S.cycle(S.policies, i);
    const res = evalPolicy(pol, i);
    const decId = S.nid('DEC');
    const decision: E.DecisionOutcome = !res.violated ? 'allow' : pol.enforcement === 'Block' ? 'deny' : 'warn';
    const cr = i % 5 < 2 ? S.cycle(linkable, i) : undefined;
    if (cr && res.violated && !cr.policyViolations.includes(pol.id)) cr.policyViolations.push(pol.id);
    S.policyDecisions.push({ id: decId, decId, ...S.meta(), policyId: pol.id, policyName: pol.name, enforcement: pol.enforcement, resourceType: res.rt, resourceId: res.id, resourceName: res.name, changeRequestId: cr?.id, input: JSON.stringify(res.input), decision, violated: res.violated, message: res.msg, evaluatedAt: S.daysAgo(S.int(0, 30)), evaluatedBy: 'OPA', notes: decision === 'deny' ? 'Change blocked until the violation is cleared' : undefined });
  }
  // A denied change is Rejected when its blocking violation stands
  S.changeRequests.filter((c) => c.status === 'Rejected').forEach((c, k) => { const deny = S.policyDecisions.filter((d) => d.decision === 'deny')[k]; if (deny && !c.policyViolations.includes(deny.policyId)) { c.policyViolations.push(deny.policyId); deny.changeRequestId = c.id; } });
}
