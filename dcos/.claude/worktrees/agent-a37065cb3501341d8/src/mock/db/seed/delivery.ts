/**
 * DCOS seed — plan, deliver, procure, commission.
 *
 * A portfolio whose programmes and projects cover every status, two sequenced
 * blueprint programmes (the DC4 greenfield build and a POD rollout), permits and
 * design documents in every state, change orders for every reason, plans in every
 * status linked to what they executed into, vendors with warranty contracts that
 * devices reference, BOMs with lines and POs with dated draws, commissioning across
 * all five Cx levels with hand-over outcomes of every kind, tasks tied to milestones,
 * risks, tickets, audit events on real records and capacity reservations of every type.
 */
import type * as T from '../../data/types';
import * as E from '../../data/enums';
import { dcTypeProfile } from '../../data/dcTypes';
import { buildProcess, TEMPLATE_REGISTRY } from '../../../modules/delivery/lib/projectTemplates';
import { buildProgrammeRecords, getBlueprint } from '../../../modules/delivery/lib/programBlueprints';
import type { Seed, Person } from './ctx';

export function seedDelivery(S: Seed): void {
  const pm = S.byRole('Program Manager'); const projMgr = S.byRole('Project Manager'); const cx = S.byRole('Commissioning Engineer');
  const finance = S.byRole('Finance Manager'); const capPlanner = S.byRole('Capacity Planner');
  const deps = { id: (p: string) => S.nid(p), meta: () => S.meta(pm) as Record<string, unknown> };
  const dcByType = (key: string) => S.dataCenters.find((d) => S.dcProfile.get(d.id)?.key === key) ?? S.dataCenters[0];
  const ent = dcByType('enterprise-dc'); const gpu = dcByType('ai-gpu-factory'); const colo = dcByType('wholesale-colo'); const dub = dcByType('server-room'); const co = dcByType('central-office'); const mtso = dcByType('mtso'); const gru = dcByType('regional-edge-dc'); const sin = dcByType('national-core-nfvi');

  // ── Programmes and projects (maturity 0 Plan … 4 Live) ──
  type ProjSpec = { name: string; template: E.ProjectTemplate; maturity: number; budgetK: number; rag: E.RAGValue; dc: T.DataCenter; status?: E.ProjectStatus; mgr?: Person };
  type ProgSpec = { name: string; type: E.ProgramType; objective: string; status: E.ProgramStatus; budgetM: number; owner: Person; projects: ProjSpec[] };
  const PORTFOLIO: ProgSpec[] = [
    { name: 'AI Capacity Expansion FY26', type: 'Capacity Expansion', status: 'Active', budgetM: 48, owner: pm, objective: 'Stand up GPU-dense training capacity across Ashburn and Dallas to meet ML demand.', projects: [
      { name: 'Hall 1 GPU Pod Deployment — ASH-GPU1', template: 'Rack Deployment', maturity: 4, budgetK: 4200, rag: 'Green', dc: gpu },
      { name: 'Liquid Cooling Retrofit — ASH-DC1 Hall 1', template: 'Capacity Expansion', maturity: 3, budgetK: 3100, rag: 'Amber', dc: ent },
      { name: '400-Node Training Cluster — ASH-GPU1', template: 'Hall Fit-out', maturity: 2, budgetK: 6800, rag: 'Green', dc: gpu },
      { name: 'GPU Pod Phase 2 — ASH-GPU1', template: 'Rack Deployment', maturity: 1, budgetK: 3900, rag: 'Red', dc: gpu, status: 'At Risk' },
    ] },
    { name: 'Network Fabric Modernization', type: 'Network Modernization', status: 'Active', budgetM: 12, owner: S.byRole('Network Engineer'), objective: 'Migrate the core to a 400G spine-leaf fabric and retire legacy aggregation.', projects: [
      { name: '400G Spine Upgrade — ASH-DC1', template: 'Network Refresh', maturity: 3, budgetK: 2400, rag: 'Green', dc: ent },
      { name: 'Leaf Switch Refresh — ASH-WHS1', template: 'Network Refresh', maturity: 2, budgetK: 1800, rag: 'Amber', dc: colo },
      { name: 'Out-of-Band Management Network — SIN-NC1', template: 'Network Refresh', maturity: 4, budgetK: 900, rag: 'Green', dc: sin },
    ] },
    { name: 'Resilience & Sustainability', type: 'Resilience / Sustainability', status: 'Active', budgetM: 18, owner: S.byRole('Facilities Director'), objective: 'Reduce PUE and lift power redundancy to N+1 across the estate.', projects: [
      { name: 'N+1 UPS Upgrade — ASH-DC1', template: 'Capacity Expansion', maturity: 4, budgetK: 2600, rag: 'Green', dc: ent },
      { name: 'PUE Optimization — DUB-CO1', template: 'Capacity Expansion', maturity: 2, budgetK: 1500, rag: 'Green', dc: co },
      { name: 'Free-Cooling Economizer — GRU-MDC1', template: 'Capacity Expansion', maturity: 1, budgetK: 2100, rag: 'Amber', dc: gru },
    ] },
    { name: 'Legacy Decommissioning Wave 2', type: 'Decommissioning', status: 'Active', budgetM: 6, owner: projMgr, objective: 'Retire end-of-life compute and network and consolidate underused rooms.', projects: [
      { name: 'EOL Server Decommission — DUB-SR1', template: 'Decommission Program', maturity: 3, budgetK: 850, rag: 'Green', dc: dub },
      { name: 'Legacy Aggregation Retire — DUB-CO1', template: 'Decommission Program', maturity: 4, budgetK: 620, rag: 'Green', dc: co },
    ] },
    { name: 'Dublin Consolidation', type: 'Other', status: 'Planning', budgetM: 4, owner: projMgr, objective: 'Migrate the Dublin server room workloads into the central office and close the room.', projects: [
      { name: 'Workload Migration Wave 1 — DUB-SR1 → DUB-CO1', template: 'Migration Wave', maturity: 1, budgetK: 1200, rag: 'Red', dc: dub, status: 'At Risk' },
      { name: 'Server Room Closure — DUB-SR1', template: 'Decommission Program', maturity: 0, budgetK: 400, rag: 'Grey', dc: dub, status: 'Planning' },
    ] },
    { name: 'Sydney MTSO Modernisation', type: 'Network Modernization', status: 'On Hold', budgetM: 9, owner: S.byRole('Network Engineer'), objective: 'Replace the mobile core aggregation and DC plant at the Sydney MTSO; paused pending spectrum decision.', projects: [
      { name: 'Core Aggregation Refresh — SYD-MTSO1', template: 'Network Refresh', maturity: 1, budgetK: 3200, rag: 'Amber', dc: mtso, status: 'On Hold' },
      { name: 'DC Plant Battery String Replacement — SYD-MTSO1', template: 'Capacity Expansion', maturity: 0, budgetK: 1800, rag: 'Grey', dc: mtso, status: 'On Hold' },
    ] },
    { name: 'LATAM Edge Expansion', type: 'Greenfield Build', status: 'Proposed', budgetM: 60, owner: pm, objective: 'A second regional edge facility in Brazil to serve LATAM workloads with in-region resilience.', projects: [
      { name: 'Campinas Edge DC — Feasibility', template: 'Greenfield DC Build', maturity: 0, budgetK: 2500, rag: 'Grey', dc: gru, status: 'Planning' },
    ] },
    { name: 'OOB Network Programme 2024', type: 'Network Modernization', status: 'Closed', budgetM: 3, owner: S.byRole('Network Engineer'), objective: 'Console servers and OOB networks at every site — delivered and closed.', projects: [
      { name: 'OOB Console Rollout — Estate', template: 'Network Refresh', maturity: 4, budgetK: 1400, rag: 'Green', dc: ent, status: 'Completed' },
    ] },
  ];
  const MS_NAMES = ['Design sign-off', 'Procurement complete', 'Installation', 'Commissioning', 'Go-live'];
  const projStatusFor = (m: number): E.ProjectStatus => (m >= 4 ? 'Completed' : m === 0 ? 'Planning' : 'Active');
  const pctFor = (m: number): number => [S.int(0, 8), S.int(15, 30), S.int(45, 60), S.int(75, 90), 100][m];
  for (const prog of PORTFOLIO) {
    const progId = S.nid('PROG');
    const start = prog.status === 'Closed' ? S.daysAgo(700) : prog.status === 'Proposed' ? S.daysAhead(60) : S.daysAgo(S.int(200, 400));
    S.programs.push({ id: progId, progId, ...S.meta(prog.owner), name: prog.name, type: prog.type, objective: prog.objective, status: prog.status, ownerName: prog.owner.name, budget: prog.budgetM * 1_000_000, startDate: start, endDate: prog.status === 'Closed' ? S.daysAgo(60) : S.daysAhead(S.int(200, 500)), projectCount: prog.projects.length, notes: prog.status === 'On Hold' ? 'Paused by steering committee; restart review next quarter' : prog.status === 'Proposed' ? 'Business case in review' : undefined });
    for (const ps of prog.projects) {
      const projId = S.nid('PROJ');
      const pct = pctFor(ps.maturity);
      const budget = ps.budgetK * 1000;
      S.projectMeta.set(projId, { maturity: ps.maturity, template: ps.template, budget });
      const pStart = prog.status === 'Proposed' ? S.daysAhead(90) : S.daysAgo(S.int(120, 600));
      const pStartMs = new Date(pStart).getTime();
      const pctFrac = Math.max(0.06, pct / 100);
      const schedJitter = 0.8 + ((S.projects.length * 37) % 45) / 100; // <1 ahead of plan, >1 behind
      const durMs = prog.status === 'Proposed' ? 300 * 864e5 : (S.now - pStartMs) / Math.min(0.98, pctFrac * schedJitter);
      const pEnd = new Date(pStartMs + durMs).toISOString();
      const mgr = ps.mgr ?? S.cycle([projMgr, pm, S.byRole('Vendor Project Manager'), S.byRole('Facilities Engineer')], S.projects.length);
      const status = ps.status ?? projStatusFor(ps.maturity);
      S.projects.push({ id: projId, projId, ...S.meta(mgr), programId: progId, name: ps.name, status, rag: ps.rag, managerName: mgr.name, dataCenterId: ps.dc.id, plannedStart: pStart, plannedEnd: pEnd, percentComplete: pct, budget, actualSpend: Math.round(budget * (pct / 100) * (0.9 + ((S.projects.length * 13) % 25) / 100)), template: ps.template, notes: status === 'At Risk' ? 'Long-lead hardware slipped; recovery plan under review' : status === 'On Hold' ? 'On hold with the programme' : undefined });
      MS_NAMES.forEach((name, k) => {
        const msId = S.nid('MS');
        const msStatus: E.MilestoneStatus = k < ps.maturity ? 'Completed' : k === ps.maturity ? (status === 'At Risk' ? 'Delayed' : 'In Progress') : 'Not Started';
        const rag: E.RAGValue = msStatus === 'Completed' ? 'Green' : msStatus === 'Delayed' ? 'Red' : msStatus === 'In Progress' ? ps.rag : 'Grey';
        S.milestones.push({ id: msId, msId, ...S.meta(mgr), projectId: projId, name, dueDate: msStatus === 'Delayed' ? S.daysAgo(S.int(5, 30)) : msStatus === 'Completed' ? S.daysAgo(S.int(30, 300) - k * 10) : S.daysAhead(S.int(10, 200) + k * 30), status: msStatus, rag, notes: msStatus === 'Delayed' ? 'Overdue — hardware delivery slipped' : undefined });
      });
      // BPMN process instance by maturity
      const proc = buildProcess(ps.template);
      const taskCount = proc.nodes.filter((n) => n.type === 'task').length;
      const frontier = Math.round((pct / 100) * taskCount);
      let taskIdx = 0; let lastTaskDone = true;
      proc.nodes.forEach((node, order) => {
        let st: E.ActivityStatus;
        if (node.type === 'start') st = 'Done';
        else if (node.type === 'end') st = ps.maturity >= 4 ? 'Done' : 'Pending';
        else if (node.type === 'gateway') st = lastTaskDone && taskIdx <= frontier ? 'Done' : 'Pending';
        else { st = taskIdx < frontier ? 'Done' : taskIdx === frontier && pct < 100 ? 'Active' : 'Pending'; lastTaskDone = st === 'Done'; taskIdx += 1; }
        // The OOB programme skipped its first gate (kit was already on hand, so no procurement check applied).
        if (prog.status === 'Closed' && node.type === 'gateway' && !S.projectActivities.some((a) => a.projectId === projId && a.status === 'Skipped')) st = 'Skipped';
        const paId = S.nid('PA');
        S.projectActivities.push({ id: paId, paId, ...S.meta(mgr), projectId: projId, nodeId: node.id, name: node.name, nodeType: node.type, status: st, order, attaches: node.attaches, condition: node.condition });
      });
    }
  }

  // ── Sequenced blueprint programmes ──
  const matFor = (p: number) => (p >= 100 ? 4 : p >= 75 ? 3 : p >= 40 ? 2 : p >= 10 ? 1 : 0);
  const hyper = dcByType('hyperscale-dc');
  const greenfieldBp = getBlueprint('greenfield-dc');
  let gfProgram: T.Program | undefined; let gfProjects: T.Project[] = [];
  if (greenfieldBp) {
    const built = buildProgrammeRecords({ blueprint: greenfieldBp, name: 'DC4 Phase 2 — DAL-HDC1', ownerName: pm.name, dataCenterId: hyper.id, startISO: S.daysAgo(380), budget: 120_000_000, programStatus: 'Active', objective: 'Hyperscale data centre · Phase 2 of the 20 MW Tier III Dallas site: complete the second construction block, add the phase 2 plant (UPS modules, chillers) and fit out Halls 3 and 4 to ready-for-service. Phase 1 (Halls 1 and 2) is already in service.', durationFactor: dcTypeProfile('hyperscale-dc')?.build.durationFactor, phaseProgress: { 'master-plan': 100, 'site-construction': 55, 'mep-plant': 30, 'network-backbone': 0, 'building-fit-out': 0, 'first-hall-rfs': 0 } }, deps);
    S.programs.push(built.program); S.projects.push(...built.projects); S.milestones.push(...built.milestones); S.projectActivities.push(...built.activities);
    built.projects.forEach((p) => S.projectMeta.set(p.id, { maturity: matFor(p.percentComplete), template: p.template as string, budget: p.budget }));
    built.audits.forEach((a) => S.audit(a.entityType, a.entityId, a.action, a.summary, pm, S.daysAgo(380)));
    gfProgram = built.program; gfProjects = built.projects;
  }
  const podBp = getBlueprint('modular-pod'); const podDc = dcByType('modular-pod');
  if (podBp) {
    const pod = buildProgrammeRecords({ blueprint: podBp, name: `${podDc.name} POD Rollout`, ownerName: projMgr.name, dataCenterId: podDc.id, startISO: S.daysAgo(120), budget: podBp.defaultBudget, programStatus: 'Active', objective: 'Modular / containerized POD · A 20-rack prefabricated POD with in-row cooling, procured up front, placed on the campus pad and commissioned to ready-for-service.', durationFactor: 1, phaseProgress: { survey: 100, pad: 100, 'pod-procure': 80, placement: 0, uplink: 40, rfs: 0 } }, deps);
    S.programs.push(pod.program); S.projects.push(...pod.projects); S.milestones.push(...pod.milestones); S.projectActivities.push(...pod.activities);
    pod.projects.forEach((p) => S.projectMeta.set(p.id, { maturity: matFor(p.percentComplete), template: p.template as string, budget: p.budget }));
  }

  // ── Permits, design documents, change orders ──
  const att = (...names: string[]): T.Attachment[] => names.map((name) => ({ name, sizeKb: S.int(120, 8400), mime: name.endsWith('.dwg') ? 'application/acad' : 'application/pdf', uploadedAt: S.daysAgo(S.int(5, 150)) }));
  const phaseBy = (tpl: E.ProjectTemplate) => gfProjects.find((p) => p.template === tpl);
  const siteP = phaseBy('Site Construction'); const mepP = phaseBy('MEP & Plant Installation'); const mpP = phaseBy('Facility Master Planning'); const fitP = phaseBy('Building Fit-out'); const netP = phaseBy('Network Refresh');
  const addPermit = (proj: T.Project | undefined, name: string, type: E.PermitType, status: E.PermitStatus, authority: string, opts: Partial<T.Permit> = {}) => {
    if (!proj) return;
    const id = S.nid('PMT');
    S.permits.push({ id, permitId: id, ...S.meta(pm), name, type, status, authority, owner: pm.name, programId: proj.programId, projectId: proj.id, dataCenterId: proj.dataCenterId, referenceNo: `${type.slice(0, 3).toUpperCase()}-${String(10000 + S.permits.length * 97)}`, notes: status === 'Expired' ? 'Expired — renewal application lodged; construction steps re-blocked until approved' : status === 'Rejected' ? 'Rejected pending revised fire strategy' : undefined, ...opts });
  };
  const addDesign = (proj: T.Project | undefined, name: string, type: E.DesignDocType, status: E.DesignDocStatus, discipline: E.DesignDiscipline, revision: string, opts: Partial<T.DesignDocument> = {}) => {
    if (!proj) return;
    const id = S.nid('DD');
    S.designDocuments.push({ id, ddId: id, ...S.meta(cx), name, type, status, discipline, revision, author: S.cycle([cx, S.byRole('Vendor Project Manager'), S.byRole('Network Engineer')], S.designDocuments.length).name, programId: proj.programId, projectId: proj.id, notes: status === 'Superseded' ? 'Superseded by revision B' : undefined, ...opts });
  };
  addPermit(siteP, 'Planning / zoning consent', 'Planning / Zoning', 'Approved', 'City of Dallas Planning', { appliedDate: S.daysAgo(400), approvedDate: S.daysAgo(330), validFrom: S.daysAgo(330), expiryDate: S.daysAhead(900), attachments: att('Planning application.pdf', 'Decision notice.pdf', 'Site plan.dwg') });
  addPermit(siteP, 'Building permit', 'Building Permit', 'Expired', 'Dallas Building Inspection', { appliedDate: S.daysAgo(380), approvedDate: S.daysAgo(300), validFrom: S.daysAgo(300), expiryDate: S.daysAgo(12), attachments: att('Building permit certificate.pdf', 'Structural calcs.pdf') });
  addPermit(siteP, 'Environmental impact consent', 'Environmental', 'Approved', 'Texas Commission on Environmental Quality', { appliedDate: S.daysAgo(390), approvedDate: S.daysAgo(320), validFrom: S.daysAgo(320), expiryDate: S.daysAhead(700), attachments: att('EIA report.pdf', 'Consent letter.pdf') });
  addPermit(mepP, 'Electrical installation permit', 'Electrical', 'In Review', 'Texas Department of Licensing', { appliedDate: S.daysAgo(40), attachments: att('E-100 HV single line.pdf') });
  addPermit(mepP, 'Mechanical / HVAC permit', 'Mechanical / HVAC', 'Applied', 'Dallas Building Inspection', { appliedDate: S.daysAgo(20) });
  addPermit(mepP, 'Utility grid interconnect', 'Utility Interconnect', 'In Review', 'Oncor Electric Delivery', { appliedDate: S.daysAgo(80), attachments: att('Interconnect study.pdf') });
  addPermit(fitP, 'Fire / life-safety approval', 'Fire / Life Safety', 'Rejected', 'Dallas Fire-Rescue', { appliedDate: S.daysAgo(30), attachments: att('Fire strategy rev A.pdf') });
  addPermit(fitP, 'Certificate of occupancy', 'Occupancy', 'Not Started', 'Dallas Building Inspection');
  addDesign(mpP, 'Concept design package', 'Concept Design', 'As-Built', 'Architectural', 'C0', { reviewedBy: S.byRole('Executive').name, issuedDate: S.daysAgo(360), attachments: att('Concept narrative.pdf', 'Massing study.pdf') });
  addDesign(mpP, 'Schematic design set', 'Schematic Design', 'Reviewed', 'Civil', 'A', { reviewedBy: S.byRole('Facilities Director').name, issuedDate: S.daysAgo(300), attachments: att('C-100 Site grading.dwg', 'C-200 Drainage.dwg') });
  addDesign(siteP, 'Structural IFC set', 'IFC Package', 'Issued for Construction', 'Structural', 'B', { reviewedBy: cx.name, issuedDate: S.daysAgo(150), attachments: att('S-001 Foundations.dwg', 'S-100 Steel frame.dwg', 'S-200 Slabs.dwg') });
  addDesign(siteP, 'Structural IFC set', 'IFC Package', 'Superseded', 'Structural', 'A', { reviewedBy: cx.name, issuedDate: S.daysAgo(200), attachments: att('S-100 Steel frame rev A.dwg') });
  addDesign(mepP, 'MEP detailed design (IFC)', 'MEP Design', 'Issued for Construction', 'Electrical', 'B', { reviewedBy: cx.name, issuedDate: S.daysAgo(60), attachments: att('E-100 HV single line.dwg', 'M-100 Cooling schematic.dwg') });
  addDesign(mepP, 'Mechanical plant layout', 'Detailed Design', 'In Review', 'Mechanical', 'A', { attachments: att('M-200 Chiller yard.dwg') });
  addDesign(fitP, 'White-space detailed design', 'Detailed Design', 'Draft', 'Architectural', 'A');
  addDesign(netP, 'Backbone fibre design', 'Detailed Design', 'Reviewed', 'Network', 'A', { reviewedBy: S.byRole('Network Engineer').name, issuedDate: S.daysAgo(20), attachments: att('N-100 Backbone routes.pdf') });
  const addCO = (proj: T.Project | undefined, title: string, reason: E.ChangeOrderReason, status: E.ChangeOrderStatus, budgetDelta: number, scheduleImpactDays: number) => {
    if (!proj) return;
    const id = S.nid('CO');
    const approved = status === 'Approved';
    S.changeOrders.push({ id, coId: id, ...S.meta(projMgr), projectId: proj.id, title, reason, status, budgetDelta, scheduleImpactDays, description: `${title} — ${reason.toLowerCase()}.`, requestedBy: S.byRole('Vendor Project Manager').name, raisedAt: S.daysAgo(S.int(20, 180)), approvedBy: approved ? pm.name : undefined, approvedAt: approved ? S.daysAgo(S.int(5, 90)) : undefined, changeRequestId: status === 'Approved' ? S.changeRequests.find((c) => c.status === 'Approved')?.id : undefined, notes: status === 'Rejected' ? 'Rejected — within contractor allowance' : undefined });
  };
  addCO(mpP, 'Additional geotechnical survey', 'Design development', 'Approved', 180_000, 5);
  addCO(siteP, 'Rock excavation — unforeseen ground conditions', 'Site conditions', 'Approved', 2_400_000, 21);
  addCO(mepP, 'Upgrade to 2N UPS topology', 'Scope change', 'Submitted', 3_100_000, 14);
  addCO(fitP, 'Premium white-space finish', 'Client request', 'Draft', 650_000, 0);
  addCO(siteP, 'Updated seismic code compliance', 'Regulatory', 'Approved', 420_000, 7);
  addCO(mepP, 'Duplicate busway quantity in BOM', 'Error / omission', 'Rejected', -180_000, 0);
  addCO(S.projects.find((p) => p.name.startsWith('Liquid Cooling')), 'Additional CDU manifold', 'Scope change', 'Approved', 240_000, 10);

  // ── Plans: every type and status, linked to what they executed into ──
  const planDefaultPath: Record<E.PlanType, E.PlanExecPath> = { 'New Rollout': 'Project', 'Capacity Expansion': 'Project', 'Network Change': 'Change', 'Reallocation/Migration': 'Change', 'Decommission Program': 'Project', 'Facility Build': 'Programme' };
  const planDefaultTemplate: Record<E.PlanType, E.ProjectTemplate> = { 'New Rollout': 'Hall Fit-out', 'Capacity Expansion': 'Capacity Expansion', 'Network Change': 'Network Refresh', 'Reallocation/Migration': 'Migration Wave', 'Decommission Program': 'Decommission Program', 'Facility Build': 'Greenfield DC Build' };
  const planDefaultChangeType: Record<E.PlanType, E.ChangeType> = { 'New Rollout': 'RackDeploy', 'Capacity Expansion': 'PowerUpgrade', 'Network Change': 'NetworkMigration', 'Reallocation/Migration': 'ServerRelocation', 'Decommission Program': 'Decommission', 'Facility Build': 'RackDeploy' };
  const planDetailFor = (t: E.PlanType, i: number): string => {
    switch (t) {
      case 'New Rollout': return JSON.stringify({ targetHall: 'Hall 1', rackCount: 8 + (i % 5) * 4, rackPurpose: S.cycle(['GPU', 'Compute', 'Storage'], i), deviceCount: 40 + i * 10, powerBudgetKw: 100 + i * 40 });
      case 'Capacity Expansion': return JSON.stringify({ resourceKind: S.cycle(['Compute', 'GPU', 'Storage'], i), quantity: 50 + i * 20, powerKw: 60 + i * 30, coolingKw: 60 + i * 30, liquidCooling: i % 2 === 0 });
      case 'Network Change': return JSON.stringify({ subtype: S.cycle(['VLAN provision', 'IP allocation', 'Routing change', 'Firewall change'], i), affectedScope: `${1 + (i % 3)} subnets / ${1 + (i % 2)} VLANs`, maintenanceWindow: 'Sat 02:00–04:00', downtimeExpected: i % 3 === 0 });
      case 'Reallocation/Migration': return JSON.stringify({ movingWhat: S.cycle(['Rack of servers', 'GPU pod', 'Storage array'], i), itemCount: 2 + i, migrationWindow: 'Weekend', workloadImpact: S.cycle(['None (live)', 'Brief pause', 'Scheduled downtime'], i) });
      case 'Decommission Program': return JSON.stringify({ scope: S.cycle(['EOL servers', 'Legacy switches', 'Retired room'], i), itemCount: 5 + i * 3, reason: S.cycle(['End-of-life', 'Consolidation', 'Cost'], i), sanitization: true, disposalMethod: S.cycle(['Wipe & reuse', 'Destroy', 'Return to vendor', 'Recycle'], i) });
      case 'Facility Build': return JSON.stringify({ targetMw: 12 + i * 6, tier: S.cycle(['Tier II', 'Tier III', 'Tier IV'], i), region: S.cycle(['North America', 'EMEA', 'APAC', 'LATAM'], i), rfsDate: 'Q4 next year', dcType: S.cycle(['Regional / metro edge DC', 'Enterprise data centre', 'Modular / containerized POD'], i) });
      default: return '{}';
    }
  };
  const approvedCrPool = S.changeRequests.filter((c) => c.status === 'Approved');
  const PLAN_STATUS_DEAL: E.PlanStatus[] = ['Draft', 'Draft', 'Submitted', 'Submitted', 'In Review', 'In Review', 'Approved', 'Approved', 'Approved', 'Executing', 'Executing', 'Executing', 'Executing', 'Completed', 'Completed', 'Completed', 'Rejected', 'Cancelled', 'Executing', 'Completed', 'Approved', 'In Review', 'Submitted', 'Draft', 'Executing', 'Completed'];
  const PLAN_TITLES: Record<E.PlanType, string[]> = { 'New Rollout': ['GPU training pod for ML platform', 'Storage tier for analytics', 'Tenant cage build-out'], 'Capacity Expansion': ['Add 400 kW to GPU hall', 'Storage growth for backup platform', 'Extra cooling for liquid retrofit'], 'Network Change': ['Provision DMZ VLANs for partner API', 'Re-address transit to public block', 'Firewall policy for cloud on-ramp'], 'Reallocation/Migration': ['Move blade chassis to hall 2', 'Migrate workloads from the Dublin room', 'Shift storage array to DR suite'], 'Decommission Program': ['Retire EOL compute wave 3', 'Remove legacy aggregation switches', 'Close Dublin server room'], 'Facility Build': ['Campinas edge facility', 'Second POD at Dallas', 'Singapore NFVI hall 3'] };
  PLAN_STATUS_DEAL.forEach((status, i) => {
    const planId = S.nid('PLAN');
    const type = S.cycle(E.PLAN_TYPE, i);
    const path = planDefaultPath[type];
    const dc = S.cycle(S.dataCenters.filter((d) => d.status === 'Operational'), i * 3);
    const executed = status === 'Executing' || status === 'Completed';
    const linkedProject = executed && path === 'Project' ? S.cycle(S.projects.filter((p) => !p.phase), i) : undefined;
    const linkedCr = executed && path === 'Change' ? S.cycle(approvedCrPool, i) : undefined;
    const linkedProgram = executed && path === 'Programme' ? gfProgram : undefined;
    const owner = S.cycle([capPlanner, pm, S.byRole('Network Engineer'), S.byRole('Facilities Director')], i);
    const approvedLike = ['Approved', 'Executing', 'Completed'].includes(status);
    S.plans.push({
      id: planId, planId, ...S.meta(owner), title: `${type} — ${S.cycle(PLAN_TITLES[type], i)}`, type, status,
      description: `${S.cycle(PLAN_TITLES[type], i)} at ${dc.name}.`, businessJustification: S.cycle(['Demand forecast shows exhaustion within two quarters.', 'Required to meet the FY26 ML platform commitment.', 'Reduces run cost and retires end-of-life risk.', 'Contractual obligation to the tenant.'], i),
      dataCenterId: dc.id, priority: S.cycle(E.PRIORITY, i), risk: S.cycle(E.RISK_LEVEL, i + 1), ownerName: owner.name,
      targetDate: S.daysAhead(30 + (i % 8) * 30), estimatedCost: (50 + i * 150) * 1000,
      demandType: S.cycle(E.DEMAND_TYPE, i), requestedQuantity: 10 + i * 15, unit: type === 'Capacity Expansion' ? 'GPUs' : type === 'Network Change' ? 'VLANs' : 'units',
      racksRequested: type === 'New Rollout' || type === 'Capacity Expansion' ? 4 + (i % 10) * 4 : undefined,
      powerKwRequested: type === 'Capacity Expansion' || type === 'New Rollout' ? 50 + i * 30 : undefined,
      gpusRequested: type === 'Capacity Expansion' ? 64 + (i % 4) * 128 : undefined,
      affectedSubnetIds: type === 'Network Change' ? S.subnets.filter((s) => s.dataCenterId === dc.id && s.status !== 'Container').slice(0, 2).map((s) => s.id) : undefined,
      affectedVlanIds: type === 'Network Change' ? S.vlans.filter((v) => v.dataCenterId === dc.id).slice(0, 2).map((v) => v.id) : undefined,
      affectedDeviceIds: type === 'Reallocation/Migration' || type === 'Decommission Program' ? S.devices.filter((d) => d.dataCenterId === dc.id && d.rackId).slice(0, 3).map((d) => d.id) : undefined,
      fromLocation: type === 'Reallocation/Migration' ? dc.code : undefined, toLocation: type === 'Reallocation/Migration' ? S.cycle(S.dataCenters, i + 1).code : undefined,
      scopeNote: `Scope agreed with ${S.cycle(['Platform', 'NetEng', 'Facilities', 'Tenant'], i)}; see attached justification.`, detail: planDetailFor(type, i),
      execPath: path, changeType: path === 'Change' ? planDefaultChangeType[type] : undefined, projectTemplate: path === 'Project' ? planDefaultTemplate[type] : undefined,
      blueprintKey: type === 'Facility Build' ? S.cycle(['greenfield-dc', 'modular-pod', 'telco-site'], i) : undefined,
      linkedProjectId: linkedProject?.id, linkedChangeRequestId: linkedCr?.id, linkedProgramId: linkedProgram?.id,
      submittedAt: status !== 'Draft' ? S.daysAgo(S.int(30, 200)) : undefined, approvedAt: approvedLike ? S.daysAgo(S.int(10, 40)) : undefined, approvedBy: approvedLike ? S.byRole('Executive').name : undefined, executedAt: executed ? S.daysAgo(S.int(1, 20)) : undefined,
      notes: status === 'Rejected' ? 'Rejected — insufficient power headroom at the target site' : status === 'Cancelled' ? 'Cancelled — superseded by the LATAM programme' : undefined,
    });
    if (linkedProject) linkedProject.planId = planId;
  });
  // Demand requests behind the plans
  for (let i = 0; i < 15; i++) {
    const demId = S.nid('DEM');
    const type = S.cycle(E.DEMAND_TYPE, i);
    const who = S.cycle([capPlanner, S.byRole('Platform Owner'), S.byRole('Network Engineer')], i);
    S.demandRequests.push({ id: demId, demId, ...S.meta(who), title: `${type.replace(/([A-Z])/g, ' $1').trim()} — ${S.cycle(S.dataCenters, i).code}`, type, requestedQuantity: 10 + i * 25, unit: type === 'GPUExpansion' ? 'GPUs' : type === 'StorageGrowth' ? 'TB' : type === 'NetworkUpgrade' ? 'ports' : 'units', targetDate: S.daysAhead(30 + i * 15), businessJustification: S.cycle(['ML training backlog exceeds current GPU capacity.', 'Backup retention policy extended to seven years.', 'New tenant contract signed.', 'Edge latency target for LATAM users.'], i), status: S.cycle(['Open', 'Approved', 'Under Review', 'Fulfilled'], i), requestedById: who.id, notes: `Raised by ${who.name}` });
  }

  // ── Vendors and contracts (warranty contracts are referenced by devices) ──
  const VENDORS: Array<[string, string, string, string]> = [['Dell Technologies', 'Hardware', 'Platinum', 'Dell'], ['Supermicro', 'Hardware', 'Gold', 'Supermicro'], ['NVIDIA', 'Hardware', 'Platinum', 'NVIDIA'], ['HPE', 'Hardware', 'Gold', 'HPE'], ['Cisco Systems', 'Network', 'Platinum', 'Cisco'], ['Arista Networks', 'Network', 'Gold', 'Arista'], ['Juniper Networks', 'Network', 'Gold', 'Juniper'], ['Palo Alto Networks', 'Network', 'Gold', 'Palo Alto'], ['Schneider Electric', 'Power', 'Platinum', 'APC'], ['Eaton', 'Power', 'Gold', ''], ['Vertiv', 'Cooling', 'Platinum', 'Vertiv'], ['Stulz', 'Cooling', 'Silver', ''], ['Corning', 'Services', 'Gold', ''], ['CBRE Data Center Solutions', 'Services', 'Gold', ''], ['NetBuild Corp', 'Services', 'Silver', '']];
  const warrantyByMfr: Record<string, string> = {};
  VENDORS.forEach(([name, category, slaTier, mfr], i) => {
    const vendId = S.nid('VEND');
    S.vendors.push({ id: vendId, vendId, ...S.meta(finance), name, category, contactName: name === 'NetBuild Corp' ? S.byRole('Vendor Project Manager').name : S.cycle(['Dana Whitfield', 'Marco Rossi', 'Yuki Tanaka', 'Fatima Al-Sayed', 'Ben Carter'], i), slaTier, rating: slaTier === 'Platinum' ? 5 : slaTier === 'Gold' ? 4 : 3, status: i === 11 ? 'Inactive' : 'Active', notes: `${category} vendor · ${slaTier} tier` });
    (['Support', 'Warranty', 'SLA'] as const).forEach((type, k) => {
      if (k === 2 && category !== 'Services') return;
      const ctrId = S.nid('CTR');
      S.contracts.push({ id: ctrId, ctrId, ...S.meta(finance), vendorId: vendId, type, startDate: S.daysAgo(S.int(300, 700)), endDate: S.daysAhead(S.int(100, 900)), value: (50 + i * 40 + k * 30) * 1000, status: k === 1 && i === 3 ? 'Expired' : 'Active', notes: type === 'Warranty' ? 'Covers hardware replacement, next-business-day' : type === 'SLA' ? 'Response and restoration commitments' : 'Annual support renewal' });
      if (type === 'Warranty' && mfr) warrantyByMfr[mfr] = ctrId;
    });
  });
  S.devices.forEach((d) => { const w = warrantyByMfr[d.manufacturer ?? '']; if (w && d.lifecycleState !== 'Disposed') d.warrantyContractId = w; });
  const vendorByCat = (cat: string) => S.vendors.filter((v) => v.category === cat && v.status === 'Active');

  // ── Downstream delivery records per project, matching its maturity ──
  const BOM_FOR_TEMPLATE: Record<string, E.BOMType> = { 'Rack Deployment': 'Rack', 'Hall Fit-out': 'Rack', 'Network Refresh': 'Network', 'Capacity Expansion': 'Power', 'Greenfield DC Build': 'Power', 'Migration Wave': 'Compute', 'Decommission Program': 'Rack', 'Facility Master Planning': 'Power', 'Site Construction': 'Power', 'Building Fit-out': 'Rack', 'MEP & Plant Installation': 'Power' };
  const BOM_VENDOR_CAT: Record<E.BOMType, string> = { Rack: 'Hardware', Compute: 'Hardware', Network: 'Network', Power: 'Power' };
  const lineCatalog: Record<E.BOMType, Array<[string, string, string, number]>> = {
    Rack: [['Rack enclosure 48U', 'APC', 'AR3300', 6500], ['Blanking panels (kit)', 'APC', 'AR8136BLK', 180], ['Rack PDU 3-phase', 'Vertiv', 'GU2-30', 1400], ['Cage nuts & screws (500)', 'StarTech', 'CABSCRWM6', 90], ['Containment panel', 'APC', 'ACDC2002', 2200]],
    Network: [['400G spine switch', 'Arista', '7800R3', 185000], ['100G leaf switch', 'Arista', '7050X3', 38000], ['400G QSFP-DD optic', 'Arista', 'QDD-400G-DR4', 1600], ['MPO-12 trunk 30m', 'Corning', 'MPO12-OM4', 240], ['Patch panel 1U', 'Corning', 'CCH-01U', 320]],
    Power: [['UPS module 500kVA', 'Schneider', 'GVL500K', 92000], ['Static transfer switch', 'Eaton', 'STS16', 14000], ['Busway 800A', 'Schneider', 'BB800', 6800], ['PDU floor-mount', 'Vertiv', 'PD2-S', 5400], ['Battery cabinet', 'Eaton', '93PM-BC', 22000]],
    Compute: [['8-GPU server', 'Supermicro', 'SYS-821GE', 240000], ['Top-of-rack switch', 'Cisco', 'N9K-C93180', 22000], ['NVMe drive 7.68TB', 'Dell', 'NVME-768', 1900], ['DAC cable 100G', 'Cisco', 'QSFP-100G-CU', 140], ['Rail kit', 'Supermicro', 'MCP-290', 120]],
  };
  const ATP_DEFS: Record<number, Array<[string, E.AtpSystem, E.CxLevel, E.AtpStatus, Array<[string, string, string]>]>> = {
    2: [
      ['Factory acceptance — UPS modules', 'Power', 'L1 FAT', 'Accepted', [['Module load test at factory', 'Apply 100% rated load for 4 h', 'Output within tolerance, no derate'], ['Transfer test', 'Simulate mains loss', 'Battery carries load, no step'], ['Firmware revision check', 'Read firmware label', 'Matches approved revision']]],
      ['Site acceptance — chilled water plant', 'Cooling', 'L2 SAT', 'Witnessed', [['Visual and installation check', 'Walk down against drawings', 'No deviations'], ['Point-to-point controls', 'Verify each sensor', 'All points reading at BMS'], ['Leak test at pressure', 'Pressurise loop 1.5× design', 'No pressure drop over 2 h']]],
      ['Network fabric ATP', 'Network', 'L3 Pre-functional', 'Draft', [['Cable certification', 'OTDR each trunk', 'Loss within budget'], ['Switch bring-up', 'Boot and baseline config', 'Golden config applied']]],
    ],
    3: [
      ['Pre-functional — controls', 'Controls', 'L3 Pre-functional', 'Accepted', [['BMS graphics check', 'Walk each screen', 'All points mapped'], ['Alarm routing', 'Force each alarm class', 'Routed to NOC and DCOS']]],
      ['Power train ATP', 'Power', 'L4 Functional', 'Accepted', [['UPS transfer to battery', 'Open mains breaker', 'Load holds on battery, no drop'], ['Generator auto-start', 'Simulate mains failure', 'Genset online < 15 s'], ['STS failover', 'Drop source A', 'Load transfers to source B'], ['PDU branch metering', 'Apply load bank', 'Readings within ±2%']]],
      ['Cooling ATP', 'Cooling', 'L4 Functional', 'Failed', [['CRAH failover', 'Disable lead unit', 'Lag unit ramps, temperature stable'], ['Chilled water loop', 'Run at design load', 'Supply temperature within setpoint'], ['Leak detection', 'Trigger test sensor', 'Alarm raised to BMS']]],
      ['Network ATP', 'Network', 'L4 Functional', 'Accepted', [['Spine failover', 'Pull spine-01 uplinks', 'No packet loss beyond 50 ms'], ['OOB reachability', 'Disable production path', 'Console reachable via OOB']]],
      ['Integrated systems test (IST)', 'Integrated', 'L5 IST', 'In Progress', [['Black-building pull', 'Full utility failure', 'Ride-through on UPS and genset'], ['Full design load', 'Load banks to 100%', 'All systems stable 8 h'], ['Failure cascade', 'Sequential plant trips', 'No IT load impact'], ['Water-side economiser', 'Switch to free cooling', 'Not applicable at this site']]],
    ],
    4: [
      ['Power train ATP', 'Power', 'L4 Functional', 'Accepted', [['UPS transfer to battery', 'Open mains breaker', 'Load holds on battery, no drop'], ['Generator auto-start', 'Simulate mains failure', 'Genset online < 15 s'], ['STS failover', 'Drop source A', 'Load transfers to source B']]],
      ['Cooling ATP', 'Cooling', 'L4 Functional', 'Accepted', [['CRAH failover', 'Disable lead unit', 'Lag unit ramps, temperature stable'], ['Leak detection', 'Trigger test sensor', 'Alarm raised to BMS']]],
      ['Controls ATP', 'Controls', 'L4 Functional', 'Accepted', [['Setpoint response', 'Step setpoint 2 °C', 'Plant responds within 10 min']]],
      ['Integrated systems test (IST)', 'Integrated', 'L5 IST', 'Accepted', [['Black-building pull', 'Full utility failure', 'Ride-through on UPS and genset'], ['Full design load', 'Load banks to 100%', 'All systems stable 8 h']]],
    ],
  };
  let hotoSeq = 0;
  for (const proj of S.projects) {
    const pmeta = S.projectMeta.get(proj.id); if (!pmeta) continue;
    const dcRacks = S.racks.filter((r) => r.dataCenterId === proj.dataCenterId);
    const pickRack = (i: number) => (dcRacks.length ? S.cycle(dcRacks, i) : S.cycle(S.racks, i));
    const mgr = S.byRole(proj.managerName === pm.name ? 'Program Manager' : 'Project Manager');
    // Procure (maturity ≥ 1): one BOM with lines + two POs with dated draws
    if (pmeta.maturity >= 1) {
      const bomId = S.nid('BOM');
      const bomType = BOM_FOR_TEMPLATE[pmeta.template] ?? 'Rack';
      const totalCost = Math.round(pmeta.budget * 0.6);
      const bomStatus = pmeta.maturity >= 2 ? 'Ordered' : 'Approved';
      const catalog = lineCatalog[bomType];
      const nLines = Math.min(catalog.length, 4 + (S.boms.length % 2));
      let allocated = 0;
      for (let li = 0; li < nLines; li++) {
        const [description, manufacturer, partNumber, unitCost] = catalog[li];
        const remainingShare = li === nLines - 1 ? totalCost - allocated : Math.round((totalCost / nLines) * (0.6 + ((li * 29) % 80) / 100));
        const quantity = Math.max(1, Math.round(remainingShare / unitCost));
        allocated += quantity * unitCost;
        const blId = S.nid('BOML');
        S.bomLines.push({ id: blId, bomlId: blId, ...S.meta(finance), bomId, lineNo: li + 1, partNumber, description, manufacturer, quantity, unitCost, category: bomType });
      }
      const lineSum = S.bomLines.filter((l) => l.bomId === bomId).reduce((s, l) => s + l.quantity * l.unitCost, 0);
      S.boms.push({ id: bomId, bomId, ...S.meta(finance), name: `${proj.name} — ${bomType} BOM`, type: bomType, projectId: proj.id, totalCost: lineSum, status: bomStatus, lineCount: nLines, notes: `${nLines} lines across ${new Set(S.bomLines.filter((l) => l.bomId === bomId).map((l) => l.manufacturer)).size} manufacturers` });
      const vpool = vendorByCat(BOM_VENDOR_CAT[bomType]); const vend = vpool.length ? S.cycle(vpool, S.boms.length) : S.vendors[0];
      const poStatus: E.POStatus = pmeta.maturity >= 4 ? 'Received' : pmeta.maturity >= 2 ? 'Ordered' : proj.status === 'On Hold' ? 'Draft' : 'Approved';
      const psMs = new Date(proj.plannedStart).getTime(); const peMs = new Date(proj.plannedEnd).getTime();
      const drawSpan = Math.max(1, peMs - psMs);
      const drawAt = (f: number) => new Date(psMs + drawSpan * f).toISOString();
      const drawSpec: Array<[string, number, number]> = [['On order', 0.3, 0.10], ['On delivery', 0.6, 0.45], ['On acceptance', 0.1, 0.80]];
      const maxPaid = poStatus === 'Received' ? 3 : poStatus === 'Ordered' ? 2 : 0;
      for (const frac of [0.6, 0.4]) {
        const poId = S.nid('PO');
        const planned = Math.round(totalCost * frac);
        let drawn = 0;
        const draws = drawSpec.map(([label, pctShare, f], idx) => { const amount = idx === drawSpec.length - 1 ? planned - drawn : Math.round(planned * pctShare); drawn += amount; const dueDate = drawAt(f); const paid = idx < maxPaid && new Date(dueDate).getTime() <= S.now; return { label, amount, dueDate, paid, paidDate: paid ? dueDate : undefined }; });
        const actual = draws.filter((d) => d.paid).reduce((s, d) => s + d.amount, 0);
        S.purchaseOrders.push({ id: poId, poId, ...S.meta(finance), bomId, vendorId: vend.id, plannedCost: planned, approvedBudget: Math.round(planned * 1.05), actualSpend: actual, forecastVariance: actual ? actual - planned : 0, status: poStatus, draws, notes: `${vend.name} · ${frac === 0.6 ? 'main' : 'balance'} order` });
      }
    }
    // Commissioning (maturity ≥ 2): ATPs by level, HOTO outcomes, snags
    const atpSet = ATP_DEFS[Math.min(4, pmeta.maturity)];
    if (pmeta.maturity >= 2 && atpSet) {
      atpSet.forEach(([name, system, level, status, steps]) => {
        const atpId = S.nid('ATP');
        const accepted = status === 'Accepted';
        S.atps.push({ id: atpId, atpId, ...S.meta(cx), projectId: proj.id, name, system, level, status, witnessedBy: accepted || status === 'Witnessed' || status === 'Failed' ? cx.name : undefined, acceptedAt: accepted ? S.daysAgo(S.int(5, 60)) : undefined, notes: status === 'Failed' ? 'Re-test scheduled after lag unit control fault' : status === 'Witnessed' ? 'Witnessed; awaiting sign-off pack' : undefined });
        steps.forEach(([description, method, expectedResult], si) => {
          let result: E.StepResult = 'Pass';
          if (status === 'Draft') result = 'Pending';
          else if (status === 'In Progress') result = si === steps.length - 1 ? 'N/A' : si >= steps.length - 2 ? 'Pending' : 'Pass';
          else if (status === 'Failed') result = si === 0 ? 'Fail' : 'Pass';
          else if (status === 'Witnessed') result = si === steps.length - 1 ? 'Pending' : 'Pass';
          const atpsId = S.nid('ATPS');
          S.atpSteps.push({ id: atpsId, atpsId, ...S.meta(cx), atpId, stepNo: si + 1, description, method, expectedResult, actualResult: result === 'Pass' ? 'As expected' : result === 'Fail' ? 'Lag unit did not ramp; temperature rose 4 °C' : result === 'N/A' ? 'Not applicable at this site' : undefined, result, notes: result === 'Fail' ? 'Control fault on lag unit; vendor engaged' : result === 'Pass' ? `Witnessed by ${cx.name}` : undefined });
        });
      });
      const hotoId = S.nid('HOTO');
      hotoSeq++;
      let hStatus: E.HotoStatus = pmeta.maturity >= 4 ? 'Accepted' : pmeta.maturity === 3 ? 'In Progress' : 'Not Started';
      if (pmeta.maturity >= 4 && hotoSeq % 3 === 0) hStatus = 'Accepted with conditions';
      if (pmeta.maturity === 3 && hotoSeq % 4 === 1) hStatus = 'Rejected';
      const accepted = hStatus === 'Accepted' || hStatus === 'Accepted with conditions';
      S.hotos.push({ id: hotoId, hotoId, ...S.meta(cx), projectId: proj.id, status: hStatus, warrantyStart: accepted ? S.daysAgo(S.int(5, 40)) : undefined, conditions: hStatus === 'Accepted with conditions' ? 'Accepted subject to closure of the open minor snags within 30 days.' : hStatus === 'Rejected' ? 'Rejected — critical snag on fire suppression interlock must be cleared.' : undefined, notes: accepted ? 'Operations has taken ownership' : undefined });
      const deliverables: Array<[string, string]> = [['As-built drawings', 'Documentation'], ['O&M manuals', 'Documentation'], ['Asset register', 'Documentation'], ['Spares list', 'Documentation'], ['Operator training', 'Closeout'], ['Warranty certificates', 'Closeout']];
      deliverables.forEach(([name, category], di) => {
        const hdId = S.nid('HD');
        const st: E.DeliverableStatus = pmeta.template === 'Decommission Program' && name === 'Spares list' ? 'N/A' : accepted ? 'Done' : hStatus === 'Not Started' ? 'Pending' : di < 3 ? 'Done' : 'Pending';
        S.hotoDeliverables.push({ id: hdId, hdId, ...S.meta(cx), hotoId, category, name, status: st });
      });
      const signers: Record<E.SignoffRole, Person> = { 'Delivery / PM': mgr, 'Commissioning Agent': cx, 'Operations / NOC': S.byRole('NOC Lead'), Facilities: S.byRole('Facilities Director') };
      E.SIGNOFF_ROLE.forEach((role) => {
        const hsId = S.nid('HS');
        const decision: E.SignoffDecision = accepted ? 'Signed' : hStatus === 'Rejected' ? (role === 'Operations / NOC' ? 'Rejected' : 'Signed') : hStatus === 'Not Started' ? 'Pending' : role === 'Delivery / PM' || role === 'Commissioning Agent' ? 'Signed' : 'Pending';
        S.hotoSignoffs.push({ id: hsId, hsId, ...S.meta(signers[role]), hotoId, role, name: signers[role].name, decision, signedAt: decision !== 'Pending' ? S.daysAgo(S.int(2, 30)) : undefined, notes: decision === 'Rejected' ? 'Will not accept until the interlock snag is closed' : undefined });
      });
      const snagSet: Array<[string, E.SnagSeverity, E.SnagStatus]> = hStatus === 'Accepted' ? [['Cable labelling incomplete in row C', 'Minor', 'Closed']]
        : hStatus === 'Accepted with conditions' ? [['Two PDU outlets mislabelled', 'Minor', 'Open'], ['As-built redlines pending for power room', 'Minor', 'Open']]
        : hStatus === 'Rejected' ? [['Fire suppression interlock not proven', 'Critical', 'Open'], ['Spare CRAH filter set not delivered', 'Major', 'Open']]
        : hStatus === 'In Progress' ? [['Spare CRAH filter set not delivered', 'Major', 'Open'], ['Two PDU outlets mislabelled', 'Minor', 'Closed']] : [];
      snagSet.forEach(([description, severity, st]) => { const snagId = S.nid('SNAG'); S.snags.push({ id: snagId, snagId, ...S.meta(cx), projectId: proj.id, description, severity, status: st, owner: S.cycle([S.byRole('Field Technician'), S.byRole('Vendor Project Manager'), mgr], S.snags.length).name, raisedAt: S.daysAgo(S.int(5, 40)), closedAt: st === 'Closed' ? S.daysAgo(S.int(1, 4)) : undefined, notes: severity === 'Critical' ? 'Blocks hand-over' : undefined }); });
    }
    // Immutable change log on real records
    if (pmeta.maturity >= 2) {
      const isConstruction = /Construction|Fit-out|MEP|Greenfield|Facility/.test(pmeta.template);
      const isNetwork = /Network/.test(pmeta.template);
      const dcDevs = S.devices.filter((d) => d.dataCenterId === proj.dataCenterId && d.rackId);
      const changeSet: Array<[string, string, string, (k: number) => string]> = isNetwork
        ? [['VLAN', 'provisioned', 'VLAN provisioned for new segment', (k) => S.cycle(S.vlans.filter((v) => v.dataCenterId === proj.dataCenterId), k).id], ['Circuit', 'activated', 'Provider circuit activated', (k) => S.cycle(S.circuits, k).id], ['Device', 'config pushed', 'Switch configuration pushed', (k) => S.cycle(dcDevs, k).id], ['Rack', 'cutover', 'Fabric cutover completed', (k) => pickRack(k).id]]
        : isConstruction
          ? [['Permit', 'approved', 'Construction permit approved', (k) => S.cycle(S.permits, k).id], ['Hall', 'updated', 'Hall power design updated', (k) => S.cycle(S.halls.filter((h) => h.dataCenterId === proj.dataCenterId), k).id], ['Rack', 'commissioned', 'Rack position released to fit-out', (k) => pickRack(k).id], ['DesignDocument', 'issued', 'Design issued for construction', (k) => S.cycle(S.designDocuments, k).id]]
          : [['Device', 'installed', 'Device installed and racked', (k) => S.cycle(dcDevs, k).id], ['Cable', 'connected', 'Structured cabling connected', (k) => S.cycle(S.cables, k).id], ['Rack', 'power updated', 'Rack power budget updated', (k) => pickRack(k).id], ['Rack', 'commissioned', 'Rack commissioned and live', (k) => pickRack(k).id]];
      const startMs = new Date(proj.plannedStart).getTime();
      const nChanges = pmeta.maturity >= 4 ? changeSet.length + 2 : changeSet.length;
      for (let k = 0; k < nChanges; k++) {
        const [entityType, action, summary, idFor] = changeSet[k % changeSet.length];
        S.audit(entityType, idFor(k), action, `${summary} — ${proj.name}`, mgr, new Date(startMs + (S.now - startMs) * ((k + 1) / (nChanges + 1))).toISOString(), proj.id);
      }
    }
  }

  // ── Change requests governed by in-flight projects ──
  const inflight = S.projects.filter((p) => { const m = S.projectMeta.get(p.id)?.maturity ?? 0; return m >= 2 && m < 4; });
  // A change is governed by an in-flight project at its own site; changes at sites without one stay standalone.
  S.changeRequests.filter((c) => ['Submitted', 'Approved', 'Scheduled', 'InProgress'].includes(c.status)).slice(0, 18).forEach((cr, i) => { const local = inflight.filter((p) => p.dataCenterId === cr.dataCenterId); if (local.length) cr.projectId = S.cycle(local, i).id; });

  // ── Tasks (tied to milestones) and risks ──
  const TASK_NAMES = ['Site survey & design', 'Procurement & lead-time', 'Power provisioning', 'Structured cabling', 'Rack & stack', 'Network configuration', 'Burn-in & validation', 'Cutover & handover'];
  const RISKS_BY_CAT: Record<E.RiskCategory, string[]> = { Schedule: ['Long-lead GPU hardware may slip the install window', 'Change freeze over quarter-end compresses the schedule'], Capacity: ['Hall power headroom is tight if the full pod lands at once', 'Cooling loop may not sustain peak density without the retrofit'], Vendor: ['Single-source optics supplier with a 12-week lead time', 'Integrator resourcing not confirmed for the cutover weekend'], Operational: ['Cutover overlaps a customer change-freeze window', 'OOB management path not validated for remote hands'] };
  const USER_POOL = [S.byRole('Program Manager'), S.byRole('Project Manager'), S.byRole('Facilities Director'), S.byRole('Network Engineer'), S.byRole('Field Technician'), S.byRole('Commissioning Engineer')];
  S.projects.forEach((proj, pi) => {
    const pmeta = S.projectMeta.get(proj.id);
    const ps = new Date(proj.plannedStart).getTime(); const pe = new Date(proj.plannedEnd).getTime(); const span = Math.max(1, pe - ps);
    const n = TASK_NAMES.length;
    const frontier = Math.round((proj.percentComplete / 100) * n);
    const projMs = S.milestones.filter((m) => m.projectId === proj.id);
    TASK_NAMES.forEach((name, t) => {
      const id = S.nid('TASK');
      const st = ps + (span * t) / (n + 1); const du = st + (span / (n + 1)) * (1 + (t % 2));
      const status: E.TaskStatus = t < frontier ? 'Done' : t === frontier ? (proj.status === 'Blocked' || proj.status === 'At Risk' ? 'Blocked' : 'In Progress') : 'To Do';
      const assignee = (t + pi) % 5 < 2 ? S.cycle(USER_POOL, t + pi) : S.byRole(proj.managerName === pm.name ? 'Program Manager' : 'Project Manager');
      S.tasks.push({ id, taskId: id, ...S.meta(assignee), projectId: proj.id, name, status, assignee: assignee.name, startDate: new Date(st).toISOString(), dueDate: new Date(du).toISOString(), effortDays: 3 + (t * 3) % 12, milestoneId: projMs[Math.min(projMs.length - 1, Math.floor(t / 2))]?.id, notes: status === 'Blocked' ? 'Blocked on hardware delivery' : undefined });
    });
    const cats = (pmeta?.maturity ?? 0) >= 4 ? [S.cycle(E.RISK_CATEGORY, pi)] : [S.cycle(E.RISK_CATEGORY, pi), S.cycle(E.RISK_CATEGORY, pi + 1)];
    cats.forEach((category, ci) => {
      const id = S.nid('RISK');
      const status: E.RiskStatus = (pmeta?.maturity ?? 0) >= 4 ? 'Closed' : (pmeta?.maturity ?? 0) >= 3 ? 'Mitigated' : 'Open';
      S.risks.push({ id, riskId: id, ...S.meta(S.byRole('Project Manager')), projectId: proj.id, category, description: S.cycle(RISKS_BY_CAT[category], pi + ci), probability: S.cycle(E.PROBABILITY, pi + ci), impact: S.cycle(E.PROBABILITY, pi + ci + 1), level: S.cycle(E.RISK_LEVEL, pi + ci), mitigation: S.cycle(['Dual-source the long-lead items and pre-order spares.', 'Phase the pod landing across two windows.', 'Confirm integrator crew and book the cutover weekend now.', 'Validate the OOB path before the change freeze.'], pi + ci), status, notes: status === 'Open' ? 'Reviewed weekly at the programme board' : undefined });
    });
  });

  // ── Delivery tickets: every status and type ──
  const TKT_TITLES = ['Power feed mislabeled on rack row', 'Structured cabling label mismatch', 'Vendor delivery slipped two weeks', 'BMS sensor offline during commissioning', 'Access badges not provisioned for crew', 'IFC drawing revision clash', 'Crane lift permit delayed', 'Spare optics shortage', 'Generator load-bank booking conflict', 'RFI: slab penetration detail', 'Snag: containment panel gap', 'Switch port assignment conflict', 'Chiller commissioning re-test required', 'PDU breaker trip on inrush', 'Fire damper inspection re-book', 'As-built markup missing for hall'];
  let tk = 0;
  for (const proj of S.projects) {
    const projTasks = S.tasks.filter((t) => t.projectId === proj.id);
    const projActs = S.projectActivities.filter((a) => a.projectId === proj.id && a.nodeType === 'task');
    const projCrs = S.changeRequests.filter((c) => c.projectId === proj.id);
    const n = 2 + (S.projects.indexOf(proj) % 4);
    for (let i = 0; i < n; i++) {
      tk++;
      const id = S.nid('TKT');
      const status = S.cycle(E.TICKET_STATUS, tk);
      const type = S.cycle(E.TICKET_TYPE, tk);
      const raisedAt = S.daysAgo(5 + (tk * 7) % 140);
      const resolved = ['Resolved', 'Verified', 'Closed'].includes(status);
      const resolvedAt = resolved ? new Date(new Date(raisedAt).getTime() + (1 + tk % 20) * 864e5).toISOString() : undefined;
      const isBlocker = status === 'Blocked' || type === 'Blocker';
      const taskId = tk % 3 === 0 && projTasks.length ? S.cycle(projTasks, tk).id : undefined;
      const activityId = !taskId && tk % 3 === 1 && projActs.length ? S.cycle(projActs, tk).id : undefined;
      const changeRequestId = !taskId && !activityId && projCrs.length ? S.cycle(projCrs, tk).id : undefined;
      const slaDueAt = new Date(new Date(raisedAt).getTime() + (2 + tk % 9) * 864e5).toISOString();
      const assignee = S.cycle(USER_POOL, tk); const reporter = S.cycle([S.byRole('Vendor Project Manager'), S.byRole('Field Technician'), S.byRole('Site Technician'), S.byRole('Commissioning Engineer')], tk);
      S.tickets.push({ id, tktId: id, ...S.meta(reporter), title: S.cycle(TKT_TITLES, tk), type, status, priority: S.cycle(E.PRIORITY, tk), description: `${S.cycle(TKT_TITLES, tk)} on ${proj.name}. Raised during delivery execution; tracked to resolution.`, projectId: proj.id, taskId, activityId, changeRequestId, dataCenterId: proj.dataCenterId, assignee: assignee.name, reporter: reporter.name, raisedAt, resolvedAt, slaDueAt, isBlocker, notes: status === 'Parked' ? 'Parked until the next site visit' : undefined });
    }
  }

  // ── Capacity reservations: every resource type, state and unit ──
  const RSV: Array<[E.ResourceType, () => string, string, number]> = [
    ['Rack', () => S.cycle(S.racks.filter((r) => r.status === 'Active'), S.capacityReservations.length * 7).id, 'U', 4],
    ['Subnet', () => S.cycle(S.subnets.filter((s) => s.status !== 'Container'), S.capacityReservations.length * 3).id, 'addresses', 32],
    ['VLAN', () => S.cycle(S.vlans, S.capacityReservations.length * 5).id, 'VLANs', 1],
    ['Asset', () => S.cycle(S.devices.filter((d) => d.lifecycleState === 'Staged' || d.lifecycleState === 'Received'), S.capacityReservations.length).id, 'units', 1],
    ['PowerChain', () => S.cycle(S.powerFeeds, S.capacityReservations.length * 11).id, 'kW', 12],
    ['Cooling', () => S.cycle(S.coolingZones, S.capacityReservations.length).id, 'kW', 40],
  ];
  for (let i = 0; i < 36; i++) {
    const [resourceType, idFor, unit, base] = S.cycle(RSV, i);
    const rsvId = S.nid('RSV');
    const state = S.cycle(E.CAPACITY_STATE, i);
    const status: E.LifecycleStatus = state === 'Consumed' ? 'Released' : i % 9 === 8 ? 'Inactive' : 'Active';
    S.capacityReservations.push({ id: rsvId, rsvId, ...S.meta(capPlanner), resourceType, resourceId: idFor(), state, quantity: base * (1 + (i % 4)), unit, demandRequestId: i % 3 === 0 ? S.cycle(S.demandRequests, i).id : undefined, changeRequestId: i % 3 === 1 ? S.cycle(S.changeRequests.filter((c) => c.status === 'Approved'), i).id : undefined, expiresAt: state === 'Consumed' ? S.daysAgo(S.int(1, 30)) : S.daysAhead(15 + (i % 6) * 15), status, notes: state === 'Committed' ? 'Committed to an approved plan' : state === 'Reserved' ? 'Soft hold pending approval' : undefined });
  }
  void TEMPLATE_REGISTRY;
}
