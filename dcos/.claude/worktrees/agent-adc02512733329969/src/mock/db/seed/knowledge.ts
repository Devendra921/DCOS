/**
 * DCOS seed — knowledge center, customization and the consistency post-pass.
 *
 * A curated, cross-linked document library (every type and status), custom fields of
 * every type scoped to every customizable entity, tags applied across the estate, and
 * the post-pass that keeps cooling loads, compute roll-ups and reservation counts in
 * step with the racks and devices the earlier modules placed.
 */
import type * as T from '../../data/types';
import * as E from '../../data/enums';
import { DC_TYPE_CATALOG, dcTypeProfile } from '../../data/dcTypes';
import type { Seed } from './ctx';

const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function seedKnowledge(S: Seed): void {
  const noc = S.byRole('NOC Lead'); const compliance = S.byRole('Compliance Manager'); const facilities = S.byRole('Facilities Director'); const netEng = S.byRole('Network Engineer');
  type Sect = { heading: string; body: string };
  const genSections = (type: E.DocType, summary?: string): Sect[] => {
    const s = summary ?? '';
    switch (type) {
      case 'Runbook': return [{ heading: 'Purpose & scope', body: `${s} Use this procedure during the relevant alarm or incident; follow the steps in order and record actions in the incident worklog.` }, { heading: 'Pre-requisites', body: 'Operator access to the relevant console and the on-call contact list to hand.' }, { heading: 'Escalation', body: 'If the issue is not resolved within the SLA window, escalate to the on-call duty manager and raise the incident severity.' }];
      case 'Policy': return [{ heading: 'Purpose', body: s }, { heading: 'Scope', body: 'Applies to all production data-center infrastructure and the teams that operate it.' }, { heading: 'Policy statements', body: 'The controls defined here are mandatory. Any exception requires a documented risk acceptance signed off by the accountable owner.' }, { heading: 'Enforcement', body: 'Compliance is evaluated continuously; breaches are recorded and remediated through Change Management.' }, { heading: 'Review', body: 'Reviewed at least annually, or after any material change to the estate.' }];
      case 'Report': return [{ heading: 'Executive summary', body: s }, { heading: 'Method', body: 'Figures are derived from collector telemetry and the asset register across the reporting period.' }, { heading: 'Key findings', body: 'Utilisation and efficiency sit within target bands overall; exceptions are listed by site with named owners.' }, { heading: 'Recommendations', body: 'Prioritise the flagged capacity and efficiency actions ahead of the next review cycle.' }];
      case 'Evidence': return [{ heading: 'Control', body: s }, { heading: 'Assessment approach', body: 'Control effectiveness was assessed against the framework requirement using configuration export and the policy-decision log.' }, { heading: 'Result', body: 'Operating effectively for the assessed period; supporting artifacts attached below.' }, { heading: 'Artifacts', body: 'Configuration export, policy-decision extract, and reviewer sign-off.' }];
      case 'Diagram': return [{ heading: 'Overview', body: s }, { heading: 'Legend', body: 'Tiers are colour-coded; links show layer and status. This is the as-built reference — see the live Topology view for current state.' }];
      default: return [{ heading: 'Overview', body: s }];
    }
  };
  const pushDoc = (d: { name: string; type: E.DocType; status?: E.DocStatus; version?: string; summary: string; tags: string[]; owner?: string; reviewDueAt?: string; steps?: string[]; sections?: Sect[]; linkedEntityType?: string; linkedEntityId?: string; linkedEntityName?: string; sizeKb?: number }) => {
    const id = S.nid('DOC');
    S.documents.push({ id, docId: id, ...S.meta(), name: d.name, type: d.type, status: d.status ?? 'Published', version: d.version ?? `v${1 + (S.documents.length % 3)}.${S.documents.length % 10}`, summary: d.summary, tags: d.tags, ownerName: d.owner ?? S.cycle([noc, compliance, facilities, netEng], S.documents.length).name, reviewDueAt: d.reviewDueAt ?? S.daysAhead(60 + (S.documents.length % 6) * 50), steps: d.steps, sections: d.sections ?? genSections(d.type, d.summary), linkedEntityType: d.linkedEntityType ?? 'Process', linkedEntityId: d.linkedEntityId, linkedEntityName: d.linkedEntityName ?? 'Operations', sizeKb: d.sizeKb ?? 80 + (S.documents.length * 137) % 5000 });
  };
  const fmtRacks = (t: typeof DC_TYPE_CATALOG[number]) => `${t.typicalRacks[0]}${t.typicalRacks[1] ? `–${t.typicalRacks[1]}` : '+'} racks`;
  pushDoc({ name: 'Data Centre Types — Reference & Specification', type: 'Policy', version: 'v1.0', tags: ['taxonomy', 'facility', 'telco', 'colo'], owner: compliance.name, reviewDueAt: S.daysAhead(300), linkedEntityType: 'DataCenterType', linkedEntityId: 'catalogue', linkedEntityName: 'DC Types reference',
    summary: 'The taxonomy of data-centre types across the telco and non-telco worlds, ordered smallest to largest by footprint, with each type\'s typical envelope and DCOS coverage.',
    sections: [
      { heading: 'Purpose', body: 'Every facility in DCOS carries a type from this catalogue. The type sets defaults at onboarding (tier, design power, rack density, plant), scales a greenfield programme, and decides which operational checks apply.' },
      { heading: 'Enterprise / commercial / IT', body: DC_TYPE_CATALOG.filter((t) => t.segment === 'Enterprise').map((t) => `${t.name}: ${fmtRacks(t)} · ${t.kwPerRack ? `${t.kwPerRack[0]}–${t.kwPerRack[1]} kW/rack` : 'n/a'} · ${t.cooling} · ${t.redundancy} · DCOS ${t.coverage}`).join('. ') + '.' },
      { heading: 'Telco network sites', body: DC_TYPE_CATALOG.filter((t) => t.segment === 'Telco').map((t) => `${t.name}: ${fmtRacks(t)} · ${t.kwPerRack ? `${t.kwPerRack[0]}–${t.kwPerRack[1]} kW/rack` : 'n/a'} · ${t.cooling} · ${t.redundancy} · DCOS ${t.coverage}`).join('. ') + '. Cell sites, street cabinets and far-edge MEC micro sites are out of scope.' },
      { heading: 'What would close the telco / colo gaps', body: 'Multi-tenancy (tenants, per-tenant space and power allocation, metering, billing, cross-connects); a −48V DC power plant model; an optical transport layer; and a service inventory / OSS-BSS layer.' },
    ] });
  pushDoc({ name: 'Power feed failure — A/B failover', type: 'Runbook', tags: ['power', 'outage', 'SEV1'], summary: 'Restore rack power when a feed drops and validate the redundant path.', reviewDueAt: S.daysAhead(120), linkedEntityName: 'Incident response', steps: ['Confirm the alarm and affected racks on the Operations cockpit', 'Verify the redundant (B-side) feed is carrying load', 'If both feeds are affected, raise a SEV1 incident and engage Facilities', 'Dispatch a field technician to the PDU / power panel', 'Restore the primary feed; confirm the collector reading is nominal', 'Resolve the incident and record root cause'] });
  pushDoc({ name: 'Cooling zone over-temperature response', type: 'Runbook', tags: ['cooling', 'thermal'], summary: 'Respond to a CRAC / cooling-zone high-temperature alarm.', reviewDueAt: S.daysAgo(20), linkedEntityName: 'Incident response', steps: ['Identify the cooling zone and the racks it serves', 'Check unit status and setpoints', 'Shed non-critical load or migrate workloads if temperature climbs', 'Engage Facilities for any mechanical fault', 'Confirm return-air temperature recovers to setpoint'] });
  pushDoc({ name: 'Liquid-cooling leak response', type: 'Runbook', tags: ['cooling', 'GPU', 'liquid'], summary: 'Isolate a CDU loop on a leak alarm and protect the GPU racks it serves.', reviewDueAt: S.daysAhead(90), linkedEntityName: 'Incident response', steps: ['Confirm the leak sensor and the manifold it sits on', 'Close the rack-level quick-disconnects on the affected manifold', 'Shed load on the racks served by the isolated manifold', 'Engage the CDU vendor and log the coolant volume lost', 'Re-pressurise and re-test before returning to service'] });
  pushDoc({ name: 'Core / spine device unreachable — triage', type: 'Runbook', tags: ['network', 'fault'], summary: 'Triage a managed device that has gone unreachable.', reviewDueAt: S.daysAhead(60), linkedEntityName: 'Network operations', steps: ['Confirm reachability from the collector and a second source', 'Check correlated alarms for a common cause (storm)', 'Verify power and uplinks at the device', 'Promote to an incident if confirmed down', 'Engage the on-call network engineer'] });
  pushDoc({ name: 'Carrier circuit outage — provider engagement', type: 'Runbook', tags: ['circuit', 'carrier', 'WAN'], summary: 'Engage the carrier against the restoration SLA when a circuit goes offline.', linkedEntityName: 'Connectivity', steps: ['Confirm the circuit is offline on the Circuits register', 'Raise a SEV2 incident from the circuit', 'Open a ticket with the carrier quoting the CID and account', 'Track against the restoration SLA', 'Fail traffic to the diverse path if available'] });
  pushDoc({ name: 'Config drift remediation (golden restore)', type: 'Runbook', tags: ['config', 'compliance'], summary: 'Bring a device back into line with its golden configuration.', reviewDueAt: S.daysAhead(200), linkedEntityName: 'Config management', steps: ['Open the device diff on Config Management', 'Review the drift against the hardening checks', 'Raise a governed change to restore golden', 'Schedule and push within an approved window', 'Verify the running config matches golden'] });
  pushDoc({ name: 'Emergency change — fast-track approval', type: 'Runbook', tags: ['change', 'governance'], summary: 'Raise and expedite an emergency change during an incident.', linkedEntityName: 'Change Management', steps: ['Raise the change from the incident', 'Select Critical risk to trigger two-person approval', 'Notify approvers for out-of-band sign-off', 'Implement and verify', 'Back-fill documentation post-incident'] });
  pushDoc({ name: 'Rack-and-stack from an approved change', type: 'Runbook', tags: ['field', 'install'], summary: 'Install kit into its reserved position and confirm the as-built by scan.', linkedEntityName: 'Field operations', steps: ['Open the change and confirm the window is active', 'Scan the rack label and confirm the reserved U range', 'Mount the device and connect power to the assigned outlets', 'Patch data ports to the assigned leaf ports', 'Scan the device serial to confirm the as-built', 'Close the work order and the change step'] });
  pushDoc({ name: 'Legacy decommission procedure (superseded)', type: 'Runbook', status: 'Archived', tags: ['decommission'], summary: 'Previous decommission checklist, replaced by the sanitisation and chain-of-custody runbook.', linkedEntityName: 'Decommissioning', steps: ['Power down', 'Remove', 'Dispose'] });
  pushDoc({ name: 'Liquid-cooling deployment runbook', type: 'Runbook', status: 'Draft', tags: ['cooling', 'GPU'], summary: 'Procedure for bringing liquid-cooled GPU racks online.', steps: ['Confirm CDU and manifold readiness', 'Leak-test before energising', 'Stage coolant fill', 'Commission and monitor'] });
  // Diagrams per operational site
  S.dataCenters.filter((d) => d.status === 'Operational').slice(0, 6).forEach((d) => pushDoc({ name: `Spine-leaf fabric — ${d.code}`, type: 'Diagram', tags: ['network', 'fabric'], summary: `As-built network fabric topology for ${d.name}.`, owner: netEng.name, linkedEntityType: 'DataCenter', linkedEntityId: d.id, linkedEntityName: d.name, sizeKb: 400 + (S.documents.length * 211) % 2500 }));
  S.dataCenters.filter((d) => d.status === 'Operational').slice(0, 3).forEach((d) => pushDoc({ name: `Power one-line — ${d.code}`, type: 'Diagram', tags: ['power', 'electrical'], summary: `Single-line power distribution for ${d.name}.`, owner: facilities.name, linkedEntityType: 'DataCenter', linkedEntityId: d.id, linkedEntityName: d.name }));
  // Contracts per provider
  S.providers.forEach((p) => pushDoc({ name: `${p.name} — Master Service Agreement`, type: 'Contract', tags: ['contract', 'carrier'], summary: `MSA and service-level terms with ${p.name}.`, owner: S.byRole('Finance Manager').name, linkedEntityType: 'Provider', linkedEntityId: p.id, linkedEntityName: p.name, reviewDueAt: p.contractEnd, sections: [
    { heading: 'Parties', body: `This agreement is between the Customer and ${p.name} (AS${p.asn ?? '—'}), account ${p.account ?? '—'}.` },
    { heading: 'Service levels', body: `Uptime SLA ${p.uptimeSlaPct ?? 99.9}% per circuit · ${p.restorationHrs ?? 4} h restoration target · ${p.supportTier ?? 'Standard'} support. Service credits apply on breach.` },
    { heading: 'Term', body: `Auto-renewing; the current term ends ${p.contractEnd?.slice(0, 10) ?? '—'}. Renewal notice 90 days prior.` },
    { heading: 'Commercial', body: 'Monthly recurring charges per the circuit schedule; per-link committed rates and costs are maintained in Circuits.' },
  ] }));
  S.vendors.slice(0, 3).forEach((v) => pushDoc({ name: `${v.name} — Hardware warranty terms`, type: 'Contract', tags: ['contract', 'warranty'], summary: `Warranty and support terms with ${v.name}.`, owner: S.byRole('Finance Manager').name, linkedEntityType: 'Vendor', linkedEntityId: v.id, linkedEntityName: v.name }));
  // Reports
  pushDoc({ name: 'Quarterly capacity & PUE report', type: 'Report', tags: ['capacity', 'efficiency'], summary: 'Power, cooling, space and PUE trend across the estate.', owner: S.byRole('Capacity Planner').name, reviewDueAt: S.daysAhead(80) });
  pushDoc({ name: 'Availability & SLA report — last quarter', type: 'Report', tags: ['availability', 'SLA'], summary: 'Incident MTTR, SLA compliance and availability by site.', owner: noc.name });
  pushDoc({ name: 'GPU density forecast', type: 'Report', tags: ['capacity', 'GPU'], summary: 'Projected GPU demand against power and cooling headroom.', owner: S.byRole('Capacity Planner').name, status: 'In Review' });
  pushDoc({ name: 'EU Energy Efficiency Directive — Frankfurt sites filing', type: 'Report', tags: ['sustainability', 'EED', 'Frankfurt'], summary: 'Annual reporting pack for the Frankfurt sites: PUE, WUE, renewable factor and installed IT power.', owner: compliance.name, status: 'Draft', reviewDueAt: S.daysAhead(45) });
  // Policies
  pushDoc({ name: 'Change management policy', type: 'Policy', tags: ['governance'], summary: 'Risk tiers, approval matrix and emergency-change rules.', owner: compliance.name, linkedEntityName: 'Change Management' });
  pushDoc({ name: 'Access control & RBAC policy', type: 'Policy', tags: ['security'], summary: 'Role-based access and least-privilege standards.', owner: S.byRole('Security Manager').name, reviewDueAt: S.daysAgo(10) });
  pushDoc({ name: 'Backup & disaster-recovery policy', type: 'Policy', tags: ['DR', 'resilience'], summary: 'RPO / RTO targets and DR runbook references.', owner: facilities.name });
  pushDoc({ name: 'Information security policy (ISO 27001)', type: 'Policy', tags: ['security', 'ISO 27001'], summary: 'ISMS scope, controls and review cadence.', owner: compliance.name, reviewDueAt: S.daysAhead(150) });
  pushDoc({ name: 'Network segmentation standard', type: 'Policy', status: 'In Review', tags: ['network', 'security'], summary: 'VLAN / VRF segmentation and east-west controls.', owner: netEng.name });
  // Evidence linked to compliance controls
  S.complianceControls.filter((c) => c.status !== 'NotAssessed').slice(0, 8).forEach((ctrl) => pushDoc({ name: `Evidence — ${ctrl.standard} ${ctrl.ref}`, type: 'Evidence', tags: ['compliance', ctrl.standard], summary: ctrl.title, owner: ctrl.owner, linkedEntityType: 'ComplianceControl', linkedEntityId: ctrl.id, linkedEntityName: `${ctrl.standard} ${ctrl.ref}`, sizeKb: 60 + (S.documents.length * 97) % 1400 }));

  // ── Customization: every field type, every customizable entity ──
  const cfDefs: Array<Pick<T.CustomField, 'key' | 'label' | 'type' | 'entityTypes' | 'choices' | 'required' | 'description'>> = [
    { key: 'asset_owner', label: 'Asset owner', type: 'text', entityTypes: ['devices', 'racks'], required: true, description: 'Accountable owner for this asset' },
    { key: 'cost_centre', label: 'Cost center', type: 'text', entityTypes: ['devices', 'racks', 'circuits', 'projects'], required: false, description: 'Finance cost center code' },
    { key: 'criticality', label: 'Business criticality', type: 'select', entityTypes: ['devices', 'subnets', 'circuits', 'vlans', 'vrfs'], required: false, choices: ['Tier 0', 'Tier 1', 'Tier 2', 'Tier 3'], description: 'Service tier of the workloads this carries' },
    { key: 'maint_window', label: 'Maintenance window', type: 'text', entityTypes: ['devices', 'changeRequests'], required: false, description: 'e.g. Sun 02:00–04:00 UTC' },
    { key: 'monitored', label: 'Monitored', type: 'boolean', entityTypes: ['devices', 'ipAddresses'], required: false, description: 'Collector polling enabled' },
    { key: 'purchase_date', label: 'Purchase date', type: 'date', entityTypes: ['devices'], required: false, description: 'Date on the purchase order' },
    { key: 'wiki_url', label: 'Runbook URL', type: 'url', entityTypes: ['devices', 'subnets'], required: false, description: 'Link to the operating runbook' },
    { key: 'site_operator', label: 'Site operator', type: 'text', entityTypes: ['dataCenters'], required: true, description: 'Who runs the facility — the enterprise itself, a colo provider or the carrier' },
    { key: 'rack_u_price', label: 'Monthly price per U', type: 'number', entityTypes: ['racks'], required: false, description: 'Colo list price (USD)' },
    { key: 'compliance_scope', label: 'Compliance scope', type: 'multiselect', entityTypes: ['dataCenters', 'subnets', 'vrfs', 'projects'], required: false, choices: ['PCI DSS', 'SOC 2', 'ISO 27001', 'EED'], description: 'Frameworks this record is in scope for' },
    { key: 'change_notes', label: 'Implementation notes', type: 'longtext', entityTypes: ['changeRequests', 'projects'], required: false, description: 'Free-text notes captured at implementation' },
    { key: 'tenant_ref', label: 'Tenant reference', type: 'text', entityTypes: ['racks', 'vlans', 'circuits'], required: false, description: 'Tenant contract reference for colo sites' },
  ];
  cfDefs.forEach((d, i) => { const id = S.nid('CF'); S.customFields.push({ id, cfId: id, ...S.meta(S.byRole('Platform Owner')), weight: (i + 1) * 10, ...d }); });
  const tagDefs: Array<[string, string, string]> = [['Critical', '#dc2626', 'Tier-0 infrastructure'], ['PCI', '#7c3aed', 'In PCI DSS scope'], ['Legacy', '#64748b', 'End-of-life or scheduled for retirement'], ['AI Fabric', '#0ea5e9', 'GPU training fabric'], ['Edge', '#f59e0b', 'Edge and distributed sites'], ['Decommission', '#9ca3af', 'In a decommission wave'], ['Customer-facing', '#16a34a', 'Carries tenant or customer traffic'], ['Liquid-cooled', '#0891b2', 'Direct-liquid or rear-door cooled'], ['Telco', '#4338ca', 'Telco network site']];
  const tagIdBy: Record<string, string> = {};
  tagDefs.forEach(([name, color, description]) => { const id = S.nid('TAG'); tagIdBy[name] = id; S.tags.push({ id, tagId: id, ...S.meta(S.byRole('Platform Owner')), name, slug: slug(name), color, description }); });
  const crit = ['Tier 0', 'Tier 1', 'Tier 2', 'Tier 3'];
  S.devices.forEach((d, i) => {
    const tags: string[] = [];
    if (d.category === 'GPU-Node') tags.push(tagIdBy['AI Fabric']);
    if (d.lifecycleState === 'Retired' || d.lifecycleState === 'Disposed') tags.push(tagIdBy.Decommission);
    if (['Router', 'Firewall'].includes(d.category ?? '')) tags.push(tagIdBy.Critical);
    if (i % 17 === 0) tags.push(tagIdBy.PCI);
    d.tags = tags;
    d.customFields = { asset_owner: `${d.ownerTeam ?? 'Platform'} Team`, cost_centre: `CC-${1000 + (i % 12) * 7}`, criticality: d.category === 'Router' ? 'Tier 0' : S.cycle(crit, i), monitored: S.managedDevices.some((m) => m.id === d.id), maint_window: S.cycle(['Sun 02:00–04:00 UTC', 'Sat 22:00–02:00 UTC', 'Wed 01:00–03:00 UTC'], i), purchase_date: (d.commissionedDate ?? S.daysAgo(400)).slice(0, 10), wiki_url: `https://wiki.dcos.internal/runbooks/${slug(d.model ?? 'device')}` };
  });
  S.dataCenters.forEach((d, i) => {
    const t = dcTypeProfile(d.dcTypeKey);
    const tags: string[] = [];
    if (t?.segment === 'Telco') tags.push(tagIdBy.Telco);
    if (t?.key === 'ai-gpu-factory') tags.push(tagIdBy['AI Fabric'], tagIdBy['Liquid-cooled']);
    if (t?.key === 'edge-micro-dc' || t?.key === 'modular-pod') tags.push(tagIdBy.Edge);
    if (t?.multiTenant) tags.push(tagIdBy['Customer-facing']);
    if (d.status === 'Decommissioning') tags.push(tagIdBy.Decommission);
    d.tags = tags;
    d.customFields = { site_operator: t?.multiTenant ? S.cycle(['Equinix', 'Digital Realty', 'NTT GDC', 'Iron Mountain'], i) : t?.segment === 'Telco' ? 'Network operator (self)' : 'Self-operated', compliance_scope: t?.multiTenant ? ['PCI DSS', 'SOC 2', 'ISO 27001'] : S.dcCampus.get(d.id) === 'FRA' ? ['ISO 27001', 'EED'] : ['ISO 27001'] };
  });
  S.racks.forEach((r, i) => {
    const t = S.dcProfile.get(r.dataCenterId);
    r.tags = [r.purpose === 'GPU' ? tagIdBy['AI Fabric'] : undefined, r.liquidCoolingReady ? tagIdBy['Liquid-cooled'] : undefined, r.status === 'Retired' ? tagIdBy.Decommission : undefined, t?.multiTenant && r.owner !== 'House' ? tagIdBy['Customer-facing'] : undefined].filter((x): x is string => !!x);
    r.customFields = { asset_owner: r.owner, cost_centre: `CC-${1000 + (i % 12) * 7}`, rack_u_price: t?.multiTenant ? 45 + (i % 5) * 5 : undefined, tenant_ref: t?.multiTenant ? `TEN-${slug(r.owner).toUpperCase().slice(0, 6)}-${String(100 + i % 40)}` : undefined };
  });
  S.subnets.filter((s) => s.status !== 'Container').forEach((s, i) => { s.tags = [s.purpose === 'Transit' ? tagIdBy['Customer-facing'] : undefined, s.status === 'Deprecated' ? tagIdBy.Legacy : undefined].filter((x): x is string => !!x); s.customFields = { criticality: S.cycle(crit, i), wiki_url: 'https://wiki.dcos.internal/ipam/addressing-standard', compliance_scope: s.purpose === 'Transit' ? ['PCI DSS'] : [] }; });
  S.ipAddresses.forEach((ip, i) => { if (i % 3 === 0) { ip.tags = ip.status === 'Conflict' ? [tagIdBy.Critical] : []; ip.customFields = { monitored: !!ip.deviceId }; } });
  S.vlans.forEach((v, i) => { v.tags = v.status === 'Unused' ? [tagIdBy.Legacy] : []; v.customFields = { criticality: S.cycle(crit, i), tenant_ref: S.dcProfile.get(v.dataCenterId ?? '')?.multiTenant ? `TEN-${String(100 + i % 40)}` : undefined }; });
  S.vrfs.forEach((v, i) => { v.tags = v.name.includes('PROD') ? [tagIdBy.Critical] : []; v.customFields = { criticality: S.cycle(crit, i), compliance_scope: v.name.includes('DMZ') ? ['PCI DSS'] : [] }; });
  S.circuits.forEach((c, i) => { c.tags = c.purpose === 'Customer' ? [tagIdBy['Customer-facing']] : []; c.customFields = { cost_centre: `CC-${2000 + (i % 6) * 11}`, criticality: c.purpose === 'Management' ? 'Tier 2' : 'Tier 1', tenant_ref: c.purpose === 'Customer' ? `TEN-${String(100 + i % 40)}` : undefined }; });
  S.changeRequests.forEach((c, i) => { c.tags = c.risk === 'Critical' ? [tagIdBy.Critical] : []; c.customFields = { maint_window: S.cycle(['Sun 02:00–04:00 UTC', 'Sat 22:00–02:00 UTC'], i), change_notes: c.status === 'Implemented' || c.status === 'Closed' ? 'Implemented within the window; post-checks passed.' : undefined }; });
  S.projects.forEach((p, i) => { p.tags = p.status === 'At Risk' ? [tagIdBy.Critical] : []; p.customFields = { cost_centre: `CC-${3000 + (i % 8) * 13}`, compliance_scope: ['ISO 27001'], change_notes: p.status === 'Completed' ? 'Closed out; lessons learned filed.' : undefined }; });

  // ── Post-pass: cooling zone loads follow IT power; capacity sized to ~65% target; compute roll-ups reconcile to devices ──
  for (const d of S.dataCenters) {
    const itLoad = S.racks.filter((r) => r.dataCenterId === d.id).reduce((s, r) => s + r.currentPowerKw, 0);
    const zs = S.coolingZones.filter((z) => z.dataCenterId === d.id);
    if (!zs.length) continue;
    const perZoneLoad = (itLoad * 1.1) / zs.length;
    zs.forEach((z, zi) => {
      // The failed-CDU zone at the GPU factory runs short of headroom; everything else sits at a 65% design point.
      const tight = S.cracUnits.some((c) => c.coolingZoneId === z.id && c.status === 'Failed');
      z.currentLoadKw = S.r1(perZoneLoad);
      z.coolingCapacityKw = S.r1(perZoneLoad / (tight ? 0.96 : 0.65 + (zi % 2) * 0.05));
      z.headroomKw = S.r1(z.coolingCapacityKw - z.currentLoadKw);
      const cs = S.cracUnits.filter((c) => c.coolingZoneId === z.id);
      cs.forEach((c) => { c.capacityKw = Math.round(z.coolingCapacityKw / Math.max(1, cs.length)); });
    });
  }
  for (const cr of S.computeResources) {
    const scopeDevices = cr.scopeType === 'DataCenter' ? S.devices.filter((dv) => dv.dataCenterId === cr.scopeId) : S.devices.filter((dv) => S.racks.find((r) => r.id === dv.rackId)?.hallId === cr.scopeId);
    const total = scopeDevices.filter((dv) => dv.category === 'GPU-Node' && dv.rackId).length * 8;
    cr.gpuCountTotal = total; cr.gpuCountUsed = Math.round(total * 0.65);
  }
  // Transformer and UPS load follow the site's IT load
  for (const d of S.dataCenters) {
    const itLoad = S.racks.filter((r) => r.dataCenterId === d.id).reduce((s, r) => s + r.currentPowerKw, 0);
    const ups = S.upsUnits.filter((u) => u.dataCenterId === d.id);
    ups.forEach((u) => { u.loadKw = Math.round((itLoad * 1.07) / Math.max(1, ups.length)); u.loadPct = S.pct(u.loadKw, u.capacityKw); });
    const feeds = S.utilityFeeds.filter((f) => f.dataCenterId === d.id);
    feeds.forEach((f) => { const tx = S.transformers.find((t) => t.feedId === f.id); if (tx) tx.loadKw = Math.round((itLoad * 1.2) / Math.max(1, feeds.length)); });
  }
  void E;
}
