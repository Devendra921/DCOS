import type { PlaybookModule } from './types';

/**
 * Platform-wide Playbook — one chapter per module. IPAM is the authored
 * reference; other modules carry a stub chapter that's easy to flesh out by
 * replacing `sections` and dropping the `stub` flag.
 */
export const PLAYBOOK: PlaybookModule[] = [
  {
    key: 'overview', label: 'Platform Overview', route: '/',
    sections: [
      { heading: 'What DCOS is', body: 'DCOS is a single operating layer for the data center — facilities, capacity, network, change and delivery all read from one source of truth, rather than a stack of disconnected tools.' },
      { heading: 'How the platform is organised', bullets: ['Plan — Planning, Capacity, IP & Network Planning, Data Centers', 'Deliver — Programs & Projects, Procurement, Build, Commissioning', 'Operate — Operations, Incidents, Change Management, Network Operations, Circuits', 'Compliance and the Knowledge center sit across all of the above'] },
      { heading: 'Getting help', bullets: ['Playbook (book icon) — this guided tour of the whole platform', 'Synopsis (info icon) — context for the exact screen you are on, with field definitions', 'Command palette (⌘K) — jump to any screen or action'] },
    ],
  },
  {
    key: 'ipam', label: 'IP & Network Planning', route: '/ipam',
    sections: [
      { heading: 'Purpose', body: 'Centralised IP address management (IPAM) for the estate. Manage aggregates, prefixes, IP addresses, VLANs, VRFs, ASNs and the services bound to them — and keep them reconciled with external systems of record.' },
      { heading: 'Key capabilities', bullets: ['Containment tree of aggregates → prefixes → addresses', 'Allocate the next free address from a prefix in one click', 'Bind addresses to devices/interfaces (sets the device primary IP)', 'VRFs with import/export route targets; VLANs with groups and roles', 'FHRP gateway groups and application services per address', 'Bi-directional sync with ServiceNow, Infoblox, DNS and DHCP'] },
      { heading: 'Aggregates, prefixes & roles', body: 'Register the blocks you hold as Aggregates (each tied to an RIR). Carve Prefixes beneath them; a prefix can be a Container that nests child prefixes, and child prefixes inherit the parent\'s role. Tag space with reusable Prefix & VLAN Roles for reporting.' },
      { heading: 'IP addresses & ranges', body: 'Allocate single addresses (manually or "next free" from a prefix) and carve Ranges for DHCP/NAT pools. Each address tracks status, DNS, MAC, role, and its device/interface binding. The IP detail drawer shows the reverse view — owning prefix, device, FHRP group and hosted services.' },
      { heading: 'VRFs, VLANs & ASNs', bullets: ['VRFs isolate overlapping space; attach Route Targets for import/export policy', 'VLANs are bounded by VLAN Groups and tagged with roles', 'ASNs (and ASN Ranges) record your own and peer autonomous systems'] },
      { heading: 'Services & redundancy', body: 'Define Service Templates (protocol + ports) and instantiate Application Services bound to specific IPs. Model gateway redundancy with FHRP Groups and attach the virtual IP from the address drawer.' },
      { heading: 'Integrations', body: 'The Integrations tab connects IPAM to external DDI/ITSM/DNS/DHCP systems. Treat those as authoritative and Import/Export/Sync against them; status and last-sync time are tracked per connector.' },
      { heading: 'Operational best practice', bullets: ['Model containers first, then carve leaf prefixes so the tree and roll-ups stay accurate', 'Keep private (RFC 1918) and public aggregates separate', 'Reclaim "Unused" VLANs and prefixes ≥85% utilised flagged as nearing exhaustion', 'Let allocation flow through DCIM — assign IPs to interfaces rather than typing primary IPs by hand'] },
    ],
  },
  {
    key: 'planning', label: 'Planning', route: '/planning',
    sections: [
      { heading: 'Purpose', body: 'Planning is the front door of Plan-to-Build. It captures a need, attaches the justification, routes it for approval, and turns the approved plan into the work that delivers it — so nothing gets built without a traceable, approved reason.' },
      { heading: 'Plan types', bullets: ['New rollout — stand up new infrastructure or a new site', 'Capacity expansion — add power, space, compute or cooling to an existing facility', 'Network change — connectivity, routing or circuit changes', 'Migration — move workloads or equipment between locations', 'Decommission — retire equipment or a facility'] },
      { heading: 'Lifecycle', body: 'A plan moves Draft → Submitted → In review → Approved (or Rejected). Drafts are free to edit; submission routes it for review; approval unlocks execution. The state is always visible so you know what is waiting on whom.' },
      { heading: 'From plan to work', body: 'Approval does not leave you with a document. Operational plans (network changes, migrations) execute into a Change request; builds and rollouts execute into a delivery Project with its own BPMN process. Capacity-adding plans reserve pipeline capacity and provision live headroom when the work completes.' },
      { heading: 'Best practice', bullets: ['Quantify the need — tie expansions to a capacity figure so the headroom model stays honest', 'Get approval before procurement — the project gate expects an approved plan behind it', 'Use the right type — it determines whether the plan becomes a Change or a Project'] },
    ],
  },
  {
    key: 'capacity', label: 'Capacity', route: '/capacity',
    sections: [
      { heading: 'Purpose', body: 'Capacity answers one question across four dimensions: can the estate absorb the next deployment? It models power, cooling, space and compute as a live picture built from actual device placement, not a spreadsheet that drifts.' },
      { heading: 'The four dimensions', bullets: ['Power — kW drawn vs safe maximum, by data center and rack; usually the first ceiling hit', 'Cooling & efficiency — cooling load vs capacity, and PUE (total facility power ÷ IT power)', 'Space — used vs available rack units, by hall and rack', 'Compute — GPU and compute headroom for high-density and AI workloads'] },
      { heading: 'Reading the numbers', body: 'Utilization is what is in use today. Pipeline is capacity promised to approved plans but not yet drawn. Headroom is what remains after both — and it is the number that gates new commitments. A rack can have free U but no power; capacity is only real when all four dimensions agree.' },
      { heading: 'How it connects', body: 'Capacity is fed by Data Centers (device placement and ratings) and consumed by Planning (a capacity-expansion plan reserves pipeline) and Delivery (go-live converts pipeline into live utilization). It is the shared headroom model the rest of Plan-to-Build trusts.' },
      { heading: 'Watch for', bullets: ['Racks above ~90% power are at trip risk on inrush — treat as full', 'Rising PUE means more energy lost to overhead; investigate cooling', 'Pipeline that never converts indicates stalled projects holding phantom capacity'] },
    ],
  },
  {
    key: 'facility', label: 'Data Centers (DCIM)', route: '/facility',
    sections: [
      { heading: 'Purpose', body: 'Data Centers is the authoritative record of the physical estate — the single source of truth for where everything lives. Capacity, IPAM and Delivery all read from it, so its accuracy is foundational.' },
      { heading: 'The physical hierarchy', body: 'The estate nests enterprise → region → campus → data center → building → floor → hall → row → rack → device. The hierarchy tree lets you drill from the whole estate down to a single device, and roll metrics back up.' },
      { heading: 'Inventory model', bullets: ['Device types — the catalog of models (manufacturer, height, ports, airflow) you deploy', 'Module types — line cards and pluggables that fit device types', 'Devices — real instances placed in a rack at a position, with status and primary IP', 'Racks — U capacity, power draw, purpose and redundancy, with an elevation view'] },
      { heading: 'Connectivity & power', body: 'Cabling records the physical connections between device ports for end-to-end tracing. Power distribution models the panels and feeds that supply the floor — the link between facility power capacity and the racks that draw it.' },
      { heading: 'Governance', body: 'Creating, moving or retiring racks and devices is gated by an approved change request. This is deliberate: the record only stays trustworthy if every physical change is authorised and auditable.' },
      { heading: 'Best practice', bullets: ['Define a device type once, then instantiate it — avoid one-off device records', 'Keep primary IPs flowing from IPAM via interface bindings, not typed by hand', 'Use Explorer to find and filter across the whole estate fast'] },
    ],
  },
  {
    key: 'delivery', label: 'Deliver (Programs & Projects)', route: '/delivery',
    sections: [
      { heading: 'Purpose', body: 'Deliver is where approved plans become built infrastructure. It manages the portfolio of programmes and projects and drives each project through a governed execution process from procurement to hand-over.' },
      { heading: 'Portfolio structure', bullets: ['Programmes — a related body of work (a site build, a refresh wave) grouping projects', 'Projects — the unit of delivery; each carries its own BPMN execution process', 'Milestones — the dated checkpoints rolled up into the schedule and change calendar', 'My Tasks — the activities assigned to you across every project'] },
      { heading: 'There is no work order', body: 'The project execution itself is the work order. Each project runs a BPMN process — a visual flow of tasks and gates — generated from its template. You advance the project by completing process steps, not by raising a separate order.' },
      { heading: 'The execution spine', body: 'A typical project flows Procure → Build → Commission → Hand-over → Live, with real gates between stages. Procurement must be procured before build; all ATPs must be Accepted before hand-over; the HOTO package must be signed off before go-live. Go-live provisions the live capacity the plan promised.' },
      { heading: 'Commissioning, ATP & HOTO', bullets: ['Commissioning runs as Cx levels (L1 FAT through L5 IST)', 'ATPs are formal acceptance tests with a step grid — expected vs actual, witnessed and accepted', 'HOTO is the hand-over package: snags, deliverables and four sign-offs', 'You can author ATPs, steps and snags directly, not just rely on auto-generation'] },
      { heading: 'The Command Center', body: 'The Delivery landing tab is an attention router: KPIs, funnel and momentum charts, an attention queue of what needs you, the milestone schedule as cards, and an embedded change calendar. Start here to triage, then drill into a project for its 360° view — impacted entities, immutable audit log, change requests, Gantt, task detail and related incidents.' },
      { heading: 'Greenfield programmes, permits & design', body: 'A Facility Build runs as a sequenced programme — phases with real dependencies and long-lead procurement, not parallel projects. Permits and design documents are gated into the build spine: the relevant construction steps cannot advance until the permit is approved and the design is signed off, and permit expiry can re-block a project.' },
      { heading: 'Cost & earned value', body: 'Each project has a Cost tab where the numbers are derived, not typed: committed cost rolls up from purchase orders, the approved budget is the baseline plus approved change orders, and actuals come from paid PO draws — which gives a time-phased plan-vs-actual S-curve (PV / committed / actual / forecast). Change orders are the governed mechanism for moving the budget. The Command Center rolls this into portfolio earned value — SPI, CPI, EAC, VAC — so schedule and cost performance are visible across the whole portfolio, while per-PO detail stays on Procurement.' },
      { heading: 'Tickets', body: 'Ad-hoc fixes and tasks during delivery are Tickets — raised on a task, a change request or a project execution step, and distinct from operational Incidents (which belong to Operate). The Command Center carries ticket analytics; Tickets has its own register under Deliver.' },
    ],
  },
  // ── Operate / cross-cutting — concise chapters ──
  {
    key: 'change', label: 'Change Management', route: '/change',
    sections: [
      { heading: 'Purpose', body: 'Change Management is the governance layer that ensures significant changes are approved — and checked against policy — before they happen. It holds the register of change requests that authorise major actions across DCOS, and the engine that routes them for approval.' },
      { heading: 'The three screens', bullets: ['Change Queue — every change request with its risk, status and schedule; KPIs for open, awaiting approval, high/critical, and change-failure rate', 'My Approvals — your personal inbox of changes awaiting your decision, with inline approve/reject', 'Policy Engine — the policy-as-code library (the controls each change is evaluated against)'] },
      { heading: 'Lifecycle', body: 'A change moves Draft → Submitted → Under Review → Approved → Scheduled → In Progress → Implemented → Closed, with Rejected, Cancelled and Rolled-back as off-ramps. The detail page shows the stage stepper, the live approval timeline, any policy violations, the impacted resources, linked tickets and a full audit trail.' },
      { heading: 'Risk-tiered approval matrix', body: 'Each change is matched to an approval rule by risk level (then change type). The rule defines the stages and the roles that must sign off — higher risk pulls in more approvers, and Critical changes require two-person confirmation. The Create wizard previews the exact approval path and the policies that will be checked before you submit.' },
      { heading: 'Policy-as-code (OPA / Rego)', body: 'Policies are real rules — power-utilisation limits, N+1 redundancy, cooling headroom, IP reserve, restricted-hall placement, GPU liquid-cooling readiness — each with an enforcement mode (Block, Warn or Audit). Changes are evaluated against them and every decision is logged, mapping back to the compliance controls and frameworks (ISO 27001, SOC 2, PCI DSS, NIST) they satisfy.' },
      { heading: 'How it connects', body: 'Change is the orchestration point of DCOS. Facility actions (deploy/move/retire), network config pushes in Network Operations, capacity reservations and delivery projects all reference an approved change. Operations can raise an emergency change straight off an incident, and the change & delivery calendar surfaces scheduled changes so clashes are visible ahead of time. A change may be raised in DCOS or carry an external ITSM reference (e.g. ServiceNow) that remains the system of record.' },
      { heading: 'Operational best practice', bullets: ['Set risk honestly — it drives who must approve and which policies block', 'Clear Block-level policy violations before submitting; Warn/Audit can proceed with a record', 'Always capture a rollback plan for medium-risk and above', 'Use the calendar to avoid overlapping windows on the same resources'] },
    ],
  },
  {
    key: 'circuits', label: 'Circuits', route: '/circuits',
    sections: [
      { heading: 'Purpose', body: 'Circuits manages the external connectivity your sites depend on — the carrier and WAN links that join your data centers to each other and the world. It is the estate’s umbilical: a circuit failing can dark a whole site, so the register treats connectivity as an operational, contractual and financial asset, not just a list.' },
      { heading: 'What it covers', bullets: ['Providers — the carriers you buy from, with uptime/restoration SLA, support tier and what you spend with each', 'Circuit types — the products (DIA, IP transit, dark fibre, MPLS, wavelength, cloud on-ramp)', 'Circuits — the live links: purpose, committed rate, monthly cost, status and health', 'Terminations — A-side lands on a real device interface in your facility; Z-side is the carrier handoff'] },
      { heading: 'Operational health', body: 'Because the A-side terminates on a real network device interface, each active circuit carries live utilisation from that interface — current and p95 — so you see saturation (≥90%) before it bites. A circuit that goes Offline is a SEV2-class event: raise an incident from the circuit and engage the carrier against its restoration SLA.' },
      { heading: 'Cost & contract', body: 'Every circuit has a monthly recurring cost, an uptime SLA and contract dates; the Providers tab rolls spend up per carrier for vendor management and renewal planning. Connectivity is usually a top-three opex line, so this is real money under management.' },
      { heading: 'Redundancy & diversity', body: 'Circuits serving the same site and purpose form a diversity group. The overview flags exposed sites — single-homed (one uplink) or reliant on a single carrier — so you can see where an outage would be unsurvivable and prioritise a diverse second path.' },
      { heading: 'Provisioning lifecycle', body: 'A circuit moves Ordered → Provisioned → Tested → Active. Carrier provisioning is weeks-to-months, so a circuit is a long-lead dependency for a new site — it gates ready-for-service the same way long-lead equipment gates a greenfield build.' },
    ],
  },
  {
    key: 'nms', label: 'Network Operations', route: '/nms',
    sections: [
      { heading: 'Purpose', body: 'Network Operations runs the live network after the build hands over. Crucially, it is the operational lens on the *real* devices — it observes the same network devices Data Centers recorded, not a separate inventory — so the as-built record and the as-running state are one source of truth.' },
      { heading: 'Network health (the landing)', body: 'Every managed device gets a 0–100 composite health score that fuses its four operational signals — reachability, active alarm load, interface utilisation and config compliance (Healthy ≥ 80, Degraded 60–79, Critical < 60). The landing rolls that up by tier (Core / Spine / Leaf-ToR / Edge / Access) and surfaces the lowest-health devices. It is the network analogue of the programme-health score in Delivery.' },
      { heading: 'Fault management (Alarms)', body: 'Alarms carry a severity, an occurrence count and flapping detection, and are raised by threshold rules (the fault analogue of policy-as-code: CPU, memory, interface utilisation, temperature, packet loss, latency). Multiple alarms on one device are correlated into a "storm" so operators chase one root cause; any alarm or storm promotes to an incident in one click.' },
      { heading: 'Performance', body: 'Each interface carries a deterministic time-series, so trends and baselines (p50/p95) are real, not a single live number. The screen shows estate throughput over 24h, the utilisation distribution and the top talkers; sustained breaches (warn 85%, critical 95%) raise utilisation alarms.' },
      { heading: 'Configuration', body: 'Running config is compared to an approved golden baseline — the delta is drift, and a set of hardening checks (SSH-only, SNMP v3, NTP, syslog, AAA, no permit-any ACL) is compliance. A unified diff shows exactly what changed. Restore-golden and config pushes are governed: they route through the Change Management approval matrix.' },
      { heading: 'Discovery & reconciliation', body: 'A scan finds what is on the wire; the screen reconciles it against the source of truth and surfaces divergences as findings — unmanaged (adopt), unreachable (investigate), config drift (raise change) and attribute mismatch (accept into the record). Every resolution either updates the truth or opens a change, so nothing stays divergent.' },
      { heading: 'How it connects', body: 'Threshold breach → alarm → incident → governed change is one continuous loop with Operations and Change Management. Network Operations is the network slice of that loop; the cross-domain operational picture lives on the Operations cockpit.' },
    ],
  },
  {
    key: 'compliance', label: 'Compliance', route: '/compliance',
    sections: [
      { heading: 'Purpose', body: 'Compliance shows whether the estate is run to the standards you have set — posture against your frameworks and policies, with the evidence to prove it.' },
      { heading: 'What it covers', bullets: ['Posture — overall standing against each framework', 'Policies — controls expressed as policy-as-code (Rego)', 'Violations — where the estate breaches a control', 'Decision records — the audit trail of accepted risks and remediations'] },
    ],
  },
];
