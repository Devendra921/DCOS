import type { SynopsisDoc } from './types';

/**
 * Page-level Synopsis — the FIRST thing an operator reads when landing on a
 * screen. It exists to give business context and orientation, not an exhaustive
 * field dictionary. Write each entry for a business end-user persona: why the
 * screen exists, what it lets them see/decide, what to watch, and how it
 * connects to the rest of DCOS. Vary the framing per screen — do NOT force a
 * fixed "fields + how-to" template. Clarify a term only where a non-technical
 * user would genuinely stumble.
 *
 * Lookup is longest-prefix match (see getSynopsis): '/ipam/subnets/:id' falls
 * back to '/ipam/subnets', then '/ipam', then the per-module fallback below.
 *
 * Depth bar (all authored entries should hit this on complex screens): lead
 * with the decision the screen supports, define the real on-screen fields/KPIs
 * using their actual labels, say how to read them (thresholds, colour bands),
 * what actions are available and where they lead, and a "watch for" pitfall.
 * Keep simple list screens lighter. IPAM, Capacity, Facility and Deliver are
 * the authored references.
 */
export const SYNOPSIS: Record<string, SynopsisDoc> = {
  '/operations': {
    title: 'Operations',
    summary: 'The live operational picture — what needs the NOC right now across every data center.',
    blocks: [
      { tone: 'tint', title: 'The decision this supports', body: 'Once infrastructure is handed over, the question stops being "is it built?" and becomes "is it healthy, and what needs me first?". This cockpit answers that in one screen: what is breaching its SLA, what is alarming, what is unreachable, and what planned work is about to touch the estate.' },
      { tone: 'plain', title: 'What you can act on', bullets: ['Triage the incidents breaching SLA or sitting at SEV1 — the top table, worst first, click straight into the incident', 'Jump to the active critical/major alarms that have not yet become incidents', 'Spot cooling zones running low on headroom before equipment is at risk', 'See which changes are in flight and what maintenance lands in the next 14 days'] },
      { tone: 'tint', title: 'How to read the numbers', bullets: ['SLA breaching — open incidents whose response or resolve clock has already blown; this is the count to drive to zero', 'Cooling headroom by DC — green ≥20%, amber 10–20%, red below 10% (act before a zone is exhausted)', 'Mean MTTR / SLA compliance — compliance ≥90% is healthy; below 75% is a process problem, not a one-off', 'Device reachability — Reachable / Degraded / Unreachable split across managed devices'] },
      { tone: 'plain', title: 'Watch for', body: 'Unacknowledged incidents and a rising "SLA breaching" count are the early warning that the queue is outrunning the team. A cooling DC below 10% headroom is a physical risk, not just a metric.' },
      { tone: 'tint', title: 'How it connects', body: 'This is the surface of the operational loop: alarms in Network Operations promote into incidents, an incident can raise an emergency change in Change Management, and maintenance windows tie back to the change that authorised them. Nothing here is standalone — every tile drills into the record behind it.' },
    ],
  },
  '/incidents': {
    title: 'Incidents',
    summary: 'Operational issues tracked to resolution against an SLA clock — with the full forensic trail.',
    blocks: [
      { tone: 'tint', title: 'What this is (and is not)', body: 'The register of things going wrong on live infrastructure — power, cooling, network, rack, capacity. Each carries a severity (technical blast radius) and a priority (business urgency), and is on an SLA clock from the moment it is detected. This is operational; P2B delivery work items are Tickets in Deliver.' },
      { tone: 'plain', title: 'Reading the list', bullets: ['Open incidents — anything not yet Resolved or Closed', 'SLA breaching — response or resolve target already missed; grab these first', 'Mean MTTR — average detected→resolved time across resolved incidents', 'SLA compliance — share resolved within target; ≥90% healthy, below 75% needs attention', 'The SLA column shows time left, or "Overdue" in red'] },
      { tone: 'tint', title: 'Inside an incident', bullets: ['SLA panel — response and resolve timers, each showing met / time-left / breached', 'Lifecycle — Acknowledge (starts ownership), Advance through Investigating → Mitigated, then Resolve (stamps MTTR)', 'Worklog — a running timeline of status changes, assignments, escalations and operator notes you can add inline', 'Root cause — recorded on resolution', 'Linked — the alarm(s) that triggered it and the remediation change raised to fix it'] },
      { tone: 'plain', title: 'The operational loop', body: 'A critical alarm in Network Operations can be promoted straight into an incident, carrying its severity, SLA target and a back-link. From the incident, "Raise emergency change" opens a governed change request and links it both ways — so cause, response and fix stay connected.' },
      { tone: 'plain', title: 'Watch for', body: 'Severity is not priority: a SEV2 on a customer-facing service may be P1. The incidents to act on first are those breaching SLA and those still unacknowledged.' },
    ],
  },
  '/change': {
    title: 'Change Management',
    summary: 'The governed register of every significant change — approved, and checked against policy, before it happens.',
    blocks: [
      { tone: 'tint', title: 'The decision this supports', body: 'Nothing significant should touch the estate without sign-off and a policy check. This is where changes are raised, routed to the right approvers by risk, evaluated against policy-as-code, and tracked to implementation — so every deploy, move, cutover or config push is traceable.' },
      { tone: 'plain', title: 'Reading the queue', bullets: ['Open changes — anything not Closed or Cancelled', 'Awaiting approval — sitting in Under Review, the queue to clear', 'High / Critical open — the risk to watch', 'Change failure rate — rolled-back ÷ (implemented + rolled-back); the quality signal, not a vanity metric'] },
      { tone: 'tint', title: 'What you can do', bullets: ['New change (top right) — a 3-step wizard: details → impact → risk, which previews the exact approval path and policies before you submit', 'Open any change → its lifecycle stepper, approval timeline, policy violations, impacted resources, tickets and audit trail', 'Filter tabs: Awaiting approval, Critical, In progress'] },
      { tone: 'plain', title: 'Lifecycle', body: 'Draft → Submitted → Under Review → Approved → Scheduled → In Progress → Implemented → Closed, with Rejected / Cancelled / Rolled-back as off-ramps. Each transition is recorded against the actor and time.' },
      { tone: 'tint', title: 'Watch for', body: 'A change carrying a Block-level policy violation should not proceed until it is cleared. A rising change-failure rate is the signal your changes are under-tested, not just unlucky.' },
    ],
  },
  '/change/approvals': {
    title: 'My Approvals',
    summary: 'The changes waiting on your decision — with the full governance context to decide quickly.',
    blocks: [
      { tone: 'tint', title: 'What this is', body: 'Your personal approval inbox: every change in Under Review where you are on the approval path. Approve or reject inline, with the change context one click away.' },
      { tone: 'plain', title: 'How approval routing works', body: 'Each change is matched to an approval rule by risk (then type). The rule sets the stages and the roles that must sign off — higher risk pulls in more approvers, and Critical changes require two-person confirmation. The detail page shows the live timeline of who has decided and who is still pending.' },
      { tone: 'plain', title: 'Watch for', body: 'Rejecting sends the change back to the requester — add a comment so they know what to fix. A change you approve still has to clear its remaining stages before it can be scheduled.' },
    ],
  },
  '/governance/policies': {
    title: 'Policy Engine',
    summary: 'The policy-as-code rules every change is checked against — and the record of what they decided.',
    blocks: [
      { tone: 'tint', title: 'What this is', body: 'The library of governance policies expressed as code (OPA / Rego) — power-utilisation limits, N+1 redundancy, cooling headroom, IP reserve, restricted-hall placement, GPU liquid-cooling readiness. They are evaluated automatically when a change is raised.' },
      { tone: 'plain', title: 'How to read a policy', bullets: ['Category — what it governs (Power, Cooling, IPReserve, Redundancy, Placement)', 'Enforcement — Block (stops the change), Warn (proceeds with a flag), or Audit (logged only)', 'Control refs — the compliance controls (ISO 27001, SOC 2, PCI DSS, NIST) this policy provides evidence for'] },
      { tone: 'tint', title: 'How it connects', body: 'Every evaluation is written to the decision log with its outcome (allow / deny / warn) and the change it applied to — so the same rule both gates changes here and supplies evidence in Compliance. Authoring of policies is centralised; this screen is the operational view of them in the change flow.' },
    ],
  },
  '/nms': {
    title: 'Network Operations',
    summary: 'The live health of the managed fabric — fault, performance and configuration fused into one read.',
    blocks: [
      { tone: 'tint', title: 'The decision this supports', body: 'Once the network is built, this is where you run it: is the fabric healthy, what is alarming, what is saturated, and where has the running state drifted from the design? Network Operations observes the *same* devices Data Centers recorded — not a separate inventory — so the operations view and the as-built record are one truth.' },
      { tone: 'plain', title: 'How health is scored', bullets: ['Network health — a 0–100 composite per device fusing reachability, active alarm load, interface utilisation and config compliance; the landing shows the fleet average and the lowest-health devices', 'Healthy ≥ 80, Degraded 60–79, Critical < 60', 'Health by tier rolls the score up across Core / Spine / Leaf-ToR / Edge / Access'] },
      { tone: 'tint', title: 'The five working surfaces', bullets: ['Alarms — fault management: correlated storms, flapping, threshold rules, one-click promote to incident', 'Managed Devices — the operational inventory (the real DCIM devices under management)', 'Performance — per-interface time-series, baselines (p50/p95) and threshold breaches', 'Config Management — running vs golden, drift and hardening compliance', 'Discovery & Reconciliation — discovered-vs-source-of-truth findings to adopt or remediate'] },
      { tone: 'plain', title: 'How it connects', body: 'A threshold breach raises an alarm; correlated alarms promote to an incident in Operations; a config fix or drift remediation routes through Change Management. Network Operations is the network slice of the same operational loop — the cross-domain picture lives on the Operations cockpit.' },
    ],
  },
  '/nms/performance': {
    title: 'Performance',
    summary: 'Interface and device utilisation across the fabric — baselines, trends and threshold breaches.',
    blocks: [
      { tone: 'tint', title: 'What you are looking at', body: 'A trailing-window view of how hard the network is working: estate throughput over 24h, the utilisation distribution, and the top talkers. Each interface carries a synthesised but stable time-series, so trends and percentiles are real rather than a single live number.' },
      { tone: 'plain', title: 'How to read it', bullets: ['Mean / P95 utilisation — P95 is the number that matters; a high P95 means sustained pressure, not a transient spike', 'Breach thresholds — warn at 85%, critical at 95% (sustained p95)', 'Top talkers — the hardest-working interfaces with an inline trend; a "breach" tag means p95 has crossed the line', 'The hottest interfaces also raise utilisation alarms on the Alarms console'] },
    ],
  },
  '/nms/config': {
    title: 'Config Management',
    summary: 'Running config vs the approved golden baseline — drift, hardening compliance and governed remediation.',
    blocks: [
      { tone: 'tint', title: 'What this is', body: 'Every device’s running configuration compared to its golden baseline. The delta is drift; a set of hardening checks is compliance. Open any device for a unified diff (red removed / green added) and the pass/fail checklist.' },
      { tone: 'plain', title: 'How to read it', bullets: ['Drift — number of config lines that differ from golden; "in sync" means none', 'Compliance — share of hardening checks passed (SSH-only, SNMP v3, NTP, syslog, AAA, no permit-any ACL)', 'Compliance by check — fleet-wide pass rate per rule, to spot a systemic gap'] },
      { tone: 'tint', title: 'Remediation is governed', body: 'Restore golden and Raise change both open a governed change request that routes through the Change Management approval matrix — a config is never pushed to a live device without approval.' },
    ],
  },
  '/nms/discovery': {
    title: 'Discovery & Reconciliation',
    summary: 'What the scan found on the wire, reconciled against the source of truth — every divergence is a finding.',
    blocks: [
      { tone: 'tint', title: 'The signature job', body: 'A discovery scan finds what is actually on the network; this screen compares it to the planned/managed record and surfaces every divergence as a finding you can resolve. It is the network analogue of earned value’s plan-vs-actual.' },
      { tone: 'plain', title: 'The four finding types', bullets: ['Unmanaged — discovered but not under management → Adopt brings it in', 'Unreachable — managed but not responding → Investigate / raise incident', 'Config drift — running differs from golden → Raise a governed change', 'Attribute mismatch — discovered value differs from the record → Accept into the source of truth'] },
      { tone: 'tint', title: 'Coverage', body: 'Management coverage is the managed devices as a share of what the scan can see; a healthy NOC sits high, with the unmanaged tail as the adopt-worklist. Each resolution either updates the source of truth or opens a change — nothing is left divergent.' },
    ],
  },
  '/documents': {
    title: 'Knowledge center',
    summary: 'The operating knowledge of the estate — runbooks, diagrams, contracts, policies and evidence — cross-linked to the live data.',
    blocks: [
      { tone: 'tint', title: 'What this is', body: 'A single library for everything an operator or auditor needs to read: step-by-step runbooks, network and power diagrams, carrier contracts, governance policies and compliance evidence. It is organised by category, searchable, and each item carries an owner, version, status and review date.' },
      { tone: 'plain', title: 'What makes it useful', bullets: ['Runbooks carry the actual procedure — numbered steps you follow during an incident (open one to see them)', 'Documents are cross-linked to the live estate — a contract to its provider, evidence to its compliance control, a diagram to its data center — and you can jump straight there', 'Status (Draft / In Review / Published / Archived) and a review date flag stale documents before they mislead someone'] },
      { tone: 'tint', title: 'Watch for', body: 'The "Needs review" count surfaces documents past their review date — runbooks and policies that have gone stale are worse than none, because people trust them in a crisis.' },
    ],
  },
  '/intelligence': {
    title: 'Network Topology',
    summary: 'The fabric as a live graph — Core → Spine → Leaf → Access — painted by the layer that matters.',
    blocks: [
      { tone: 'tint', title: 'What this is', body: 'A hierarchical view of one site’s network fabric: every managed device as a node, tier by tier, with the links between them. It is the topology twin of the geo map — same layered idea, but for the network rather than the estate.' },
      { tone: 'plain', title: 'How the layers work', bullets: ['Base layer (choose one) colours every node — Node health, Reachability, Peak utilisation or Alarm load', 'Alarm badges overlay the count + worst severity on each node', 'Links can be toggled; a link turns dashed red when an endpoint is unreachable', 'Switch sites with the data-center selector top-right'] },
      { tone: 'tint', title: 'Drill in', body: 'Click any node for its health, peak utilisation and active alarms, then open the full device record in Network Operations. The same devices appear here, in the geo map and in DCIM — one source of truth, three lenses.' },
    ],
  },
  '/map': {
    title: 'Geo Command Map',
    summary: 'The whole estate on one map — paint it with the layer that matters, with live events on top.',
    blocks: [
      { tone: 'tint', title: 'What this is', body: 'Every data-center site geolocated, with operational signals rolled up to the site so you can see the estate the way a control room does — and drill from a continent down to a hall in two clicks.' },
      { tone: 'plain', title: 'How the layers work', bullets: ['Base layer (choose one) colours every site — Network health, Power, Cooling, PUE, Performance or Status', 'Event overlays (toggle independently) add badges for active Alarms, open Incidents and in-flight Changes/Maintenance — all visible at once over any base', 'Connectivity draws the inter-site backbone, dashed red where a circuit is offline', 'Marker size = rack count'] },
      { tone: 'tint', title: 'Drill in', body: 'Select a site for its layer readout (health, power, PUE, performance, events, circuits) and a 2.5D building view — halls stacked and heat-coloured; click a floor to open its plan, or drill into the full data-center record.' },
    ],
  },
  '/circuits': {
    title: 'Circuits',
    summary: 'The datacenter’s external connectivity — under contract and SLA — with health, utilisation, cost and site redundancy.',
    blocks: [
      { tone: 'tint', title: 'Why this matters', body: 'Circuits are the estate’s umbilical: the carrier links that connect a site to the internet, the cloud and the other DCs. A circuit failing can dark a whole site, so this register is as much an operational and financial asset as a technical one — and the A-side of every circuit now terminates on a real network device, so it ties Facility, Network Operations and the carrier together.' },
      { tone: 'plain', title: 'How to read the posture', bullets: ['Committed Gbps / Monthly spend — the capacity you buy and what it costs (active circuits)', 'Avg utilisation — load on the bound interfaces; ≥90% is saturated and needs an upgrade order', 'Offline — circuits down now (a circuit-down is a SEV2-class incident)', 'Exposed sites — DCs that are single-homed (one uplink) or rely on a single carrier; the redundancy risk to fix first'] },
      { tone: 'tint', title: 'Inside a circuit', bullets: ['Provisioning lifecycle — Ordered → Provisioned → Tested → Active (circuits are a long-lead dependency for go-live)', 'A-side terminates on a real device + interface, with live utilisation; Z-side is the carrier handoff', 'Commercial & SLA — monthly/annual cost, uptime + restoration SLA, contract dates', 'Redundancy — sibling circuits serving the same site+purpose, flagged single-homed if none', 'Raise incident — when a circuit is offline, engage the carrier against its restoration SLA'] },
      { tone: 'plain', title: 'How it connects', body: 'The A-side device is the same device Network Operations monitors; a down circuit raises an incident in Operations; provider spend rolls up on the Providers tab for vendor management.' },
    ],
  },
  '/ipam': {
    title: 'IP & Network Planning',
    summary: 'The authoritative record of your network addressing — so teams stop guessing and stop colliding.',
    blocks: [
      { tone: 'tint', title: 'Why this matters', body: 'IP space is finite and shared. When two teams reach for the same address or no one knows what is free, you get outages and slow deployments. This hub is the single source of truth everything else in DCOS trusts.' },
      { tone: 'plain', title: 'What you can do from here', bullets: ['See at a glance how much address space is left and where it is running out', 'Find out who or what owns any given address', 'Carve new space for a project, or reclaim space that is no longer used', 'Keep your records reconciled with the systems that actually run the network'] },
      { tone: 'tint', title: 'How it connects', body: 'Allocating addresses here feeds capacity planning and shows up directly on the device records in your data centers — you record it once, and the rest of the platform stays in step.' },
    ],
  },
  '/ipam/subnets': {
    title: 'Prefixes',
    summary: 'The slices of your network where devices actually live — and how full each one is.',
    blocks: [
      { tone: 'tint', title: 'What you are looking at', body: 'A prefix is a block of addresses set aside for a purpose — a rack row, a service, an environment. The list shows each block, what it is for, and how close it is to full.' },
      { tone: 'plain', title: 'What this helps you decide', bullets: ['Where there is still room to deploy new equipment', 'Which blocks are nearly full and need attention before they run out', 'How your space is organised — big parent blocks broken into smaller ones'] },
      { tone: 'tint', title: 'Two ways to view it', body: 'Switch between a flat list (sort and filter everything) and a tree (see how blocks nest inside one another, with the parent showing the combined usage of its children). Open any prefix to hand out its next free address in one click.' },
      { tone: 'plain', title: 'Watch for', body: 'The "Nearing exhaustion" tab flags anything above 85% used — these are the blocks most likely to cause a deployment to stall.' },
      { tone: 'tint', title: 'Key fields & actions', bullets: ['Status — Container (a parent that holds smaller blocks), Active (in use), Reserved (set aside), or Deprecated (being retired)', 'Utilization — used ÷ usable; on a container it is the combined usage of its children', 'New prefix (top right) — create a block, optionally nested under a container so it inherits the parent\'s role', 'Flat / Tree toggle (top right) and the tab filters narrow what you see', 'Open a row → its IP grid, where "Allocate next free" hands out an address'] },
    ],
  },
  '/ipam/aggregates': {
    title: 'Aggregates',
    summary: 'The big address blocks your organisation actually holds, before they are carved up.',
    blocks: [
      { tone: 'tint', title: 'Why this exists', body: 'Before you can hand out addresses, you have to know which ranges you are entitled to use. Aggregates record those top-level blocks and where they came from, so every smaller allocation traces back to something legitimate.' },
      { tone: 'plain', title: 'What it tells you', bullets: ['How much of each block has been carved into prefixes versus still free', 'Whether a block is public (internet-routable) or private internal space', 'A clean separation you can plan and report against'] },
    ],
  },
  '/ipam/rirs': {
    title: 'Registries (RIRs)',
    summary: 'The authorities your address blocks come from.',
    blocks: [
      { tone: 'tint', title: 'In plain terms', body: 'Public internet addresses are issued by regional registries (ARIN, RIPE, APNIC); private internal addresses come from reserved ranges anyone can use. Recording the source gives every block provenance — useful for audits and avoiding accidental reuse of public space internally.' },
    ],
  },
  '/ipam/roles': {
    title: 'Roles',
    summary: 'Reusable purpose labels so space is organised by intent, not by guesswork.',
    blocks: [
      { tone: 'tint', title: 'Why use them', body: 'Tagging a block as Production, Management, Storage and so on lets everyone see at a glance what space is for — and lets you report on usage by purpose across the whole estate.' },
      { tone: 'plain', title: 'Handy to know', body: 'When you nest a block inside another, the child takes on the parent\'s role automatically, so you label once and it carries down.' },
    ],
  },
  '/ipam/addresses': {
    title: 'IP Addresses',
    summary: 'Every individual address, what state it is in, and what is using it.',
    blocks: [
      { tone: 'tint', title: 'What you are looking at', body: 'The working inventory of addresses. Each one is either free, reserved, in use, or in conflict — and where it is in use, you can see the device and interface behind it.' },
      { tone: 'plain', title: 'What this helps you do', bullets: ['Confirm an address is truly free before you assign it', 'Trace an address back to the device, owner and services on it', 'Spot conflicts (the same address claimed twice) before they cause an outage'] },
      { tone: 'tint', title: 'The full picture on one address', body: 'Click any row to open its detail. You will see the block it belongs to, the device and interface holding it, its gateway-redundancy group, and every service answering on it — the whole story in one place.' },
      { tone: 'plain', title: 'Key fields & actions', bullets: ['Status — Allocated (in use), Reserved (held), Available (free to take), Conflict (claimed twice — fix this)', 'Assigned to — the device, and on the detail drawer the specific interface', 'New IP address (top right) creates one against a block; or use "Allocate next free" on a prefix', 'In the detail drawer: assign to a device + interface, mark it the device\'s primary address, or join a gateway group'] },
    ],
  },
  '/ipam/ranges': {
    title: 'IP Ranges',
    summary: 'Pools of addresses handed out automatically — for example DHCP or NAT.',
    blocks: [
      { tone: 'tint', title: 'When you use this', body: 'Some addresses are not assigned one-by-one but given out from a pool — laptops getting an address on connect, or addresses shared for translation. A range reserves that band so it is not handed out for anything else.' },
    ],
  },
  '/ipam/vrf': {
    title: 'VRFs',
    summary: 'Separate, isolated routing worlds — so the same addresses can safely exist in more than one place.',
    blocks: [
      { tone: 'tint', title: 'In plain terms', body: 'A VRF lets two tenants or environments use overlapping addresses without clashing, because each lives in its own routing table. Think of it as keeping separate address books that never get confused for one another.' },
      { tone: 'plain', title: 'Why it matters here', body: 'Every prefix and range belongs to a routing world. Getting that right is what keeps a customer in one VRF from ever seeing — or colliding with — another.' },
      { tone: 'tint', title: 'Key fields', bullets: ['Route distinguisher — the unique tag that keeps this routing world separate (e.g. 65000:100)', 'Enforce unique — refuses to record the same address twice inside this VRF, catching mistakes early', 'Import / Export targets — the controlled exceptions that let this world share routes with others'] },
    ],
  },
  '/ipam/route-targets': {
    title: 'Route Targets',
    summary: 'The rules that decide which isolated routing worlds are allowed to share routes.',
    blocks: [
      { tone: 'tint', title: 'What they do', body: 'Normally VRFs are sealed off from each other. Route targets are the controlled exceptions — they let you deliberately leak specific routes between worlds (for example, shared services everyone needs to reach).' },
    ],
  },
  '/ipam/vlans': {
    title: 'VLANs',
    summary: 'The logical network segments your devices sit on at the local level.',
    blocks: [
      { tone: 'tint', title: 'What this is for', body: 'VLANs split one physical network into separate logical ones — voice, data, storage, management — so traffic stays organised and contained. This is where you keep the master list and their status.' },
      { tone: 'plain', title: 'Watch for', body: 'The "Unused" tab surfaces segments that are defined but not actually carrying anything — easy wins to reclaim and keep the numbering tidy.' },
    ],
  },
  '/ipam/vlan-groups': {
    title: 'VLAN Groups',
    summary: 'Boundaries that stop VLAN numbers colliding across different fabrics or sites.',
    blocks: [
      { tone: 'tint', title: 'Why group them', body: 'The same VLAN number can mean different things in different places. Grouping by fabric or site keeps each number unique within its scope, so there is no ambiguity about what a given segment is.' },
    ],
  },
  '/ipam/asns': {
    title: 'ASNs',
    summary: 'The identifiers your routing domains and external peers use to exchange routes.',
    blocks: [
      { tone: 'tint', title: 'In plain terms', body: 'An ASN is a network\'s identity on the wider internet (or between your own large networks). Recording yours and your peers\' makes routing relationships explicit and auditable.' },
    ],
  },
  '/ipam/asn-ranges': {
    title: 'ASN Ranges',
    summary: 'Pools of network identifiers reserved for automatic assignment.',
    blocks: [
      { tone: 'tint', title: 'When this helps', body: 'If you spin up many internal networks, reserving a band of identifiers up front keeps assignment fast and conflict-free.' },
    ],
  },
  '/ipam/fhrp': {
    title: 'Gateway Redundancy (FHRP)',
    summary: 'How a network keeps a working gateway even when one router fails.',
    blocks: [
      { tone: 'tint', title: 'Why it matters', body: 'Devices rely on a gateway to reach the rest of the network. These groups let two or more routers share one virtual gateway address, so if one fails the other takes over without anything noticing. This screen records those groups.' },
      { tone: 'plain', title: 'How it ties in', body: 'Once a group exists, you bind its shared gateway address to it from the address detail — connecting the redundancy design to the actual IP.' },
    ],
  },
  '/ipam/service-templates': {
    title: 'Service Templates',
    summary: 'Reusable definitions of common network services.',
    blocks: [
      { tone: 'tint', title: 'What they save you', body: 'Define a service once — what it is and which ports it uses (e.g. secure web on 443) — then reuse it whenever you stand up that service somewhere, instead of re-typing the details each time.' },
    ],
  },
  '/ipam/services': {
    title: 'Application Services',
    summary: 'The actual services running on specific addresses.',
    blocks: [
      { tone: 'tint', title: 'What this captures', body: 'This is the live record of which services answer on which addresses — useful for understanding impact ("what runs on this IP?") and for security and audit conversations.' },
      { tone: 'plain', title: 'The reverse view', body: 'Open any IP address and you will see the services it hosts — the same relationship from the other direction.' },
    ],
  },
  '/ipam/topology': {
    title: 'IP Topology',
    summary: 'A visual map of how your address space fits together.',
    blocks: [
      { tone: 'tint', title: 'What it shows', body: 'A spatial view of how blocks nest and which routing world and segment they belong to — a quicker way to grasp the shape of the network than reading tables.' },
    ],
  },
  '/ipam/integrations': {
    title: 'Integrations',
    summary: 'Keeping DCOS in step with the systems that actually run your network.',
    blocks: [
      { tone: 'tint', title: 'Why this is here', body: 'Most organisations already run tools that hand out addresses, names and pools (DNS, DHCP, an IT service desk). This screen keeps DCOS reconciled with them so the records agree, rather than drifting apart.' },
      { tone: 'plain', title: 'What you can do', bullets: ['Pull records in, push records out, or keep both in sync', 'See when each system last reconciled and whether it succeeded', 'Treat the external tool as the master where it owns the data'] },
      { tone: 'tint', title: 'Reading the row & actions', bullets: ['Direction — whether DCOS imports from, exports to, or two-way syncs with that system', 'Status / Last sync — a green dot and timestamp mean it reconciled cleanly; red means it needs attention', 'Per row: Import, Export and Sync now run the reconciliation on demand'] },
    ],
  },

  // ── Deliver ──
  '/delivery': {
    title: 'Delivery Command Center',
    summary: 'The portfolio pulse — and, above all, the one screen that tells you which project needs you first today.',
    blocks: [
      { tone: 'tint', title: 'The decision this supports', body: 'You manage more projects than you can watch by hand. This screen does the watching: it surfaces what is blocked, slipping or waiting on a decision, so your first ten minutes go to the project that needs them — not the loudest one.' },
      { tone: 'plain', title: 'What the headline numbers mean', bullets: ['Active projects / In execution — total live work vs what is actively being built', 'At risk / Red — projects whose health rating is Red', 'Delivered (Live) — projects past go-live', 'Overdue tasks · High/Crit risks — the two backlogs most likely to derail a date'] },
      { tone: 'tint', title: 'How to read “Needs attention”', body: 'This is the part to act on. Each row names why it needs you — Health RED, Blocked, “ATPs pending (1/3)”, Critical snag(s), Overdue milestone(s) — and links straight to the project. Work it top-down; it is ordered by urgency, not alphabetically.' },
      { tone: 'plain', title: 'The rest of the board', bullets: ['Delivery pipeline — how many projects sit in each stage: Plan → Procure → Build → Commission → Live', 'Portfolio health (RAG) and Budget vs spend by programme', 'Gates & financials — ATPs pending, HOTO open, blocking snags and PO forecast variance', 'Programme health score, earned-value performance (SPI/CPI, EAC, variances + PV/EV/AC), ticket analytics and a status × execution-health matrix', 'Milestone schedule and the embedded Change & delivery calendar — what is due, and when'] },
      { tone: 'plain', title: 'Reading earned value', body: 'SPI (schedule) and CPI (cost) above 1.0 are good; below 0.9 is a problem. EAC is the forecast cost at completion, VAC the projected over/under against budget. PV/EV/AC are planned value, earned value (work done × budget) and actual cost over time.' },
      { tone: 'tint', title: 'Watch for', body: 'A project in Commission flagged “ATPs pending”, or in hand-over with “HOTO open”, is gate-blocked — it cannot go live until those clear, no matter how green everything else looks. Those are the rows to chase first.' },
    ],
  },
  '/delivery/portfolio': {
    title: 'Portfolio',
    summary: 'Every programme and the projects beneath it — the place to browse and manage, where the Command Center is to triage.',
    blocks: [
      { tone: 'tint', title: 'When to use this', body: 'Come here when you already know what you are looking for. The Command Center tells you where to look; the Portfolio lets you search, filter and open any programme or project directly.' },
      { tone: 'plain', title: 'What each project row tells you', bullets: ['Stage — where it sits on the spine: Plan, Procure, Build, Commission or Live', 'RAG — health: Red (intervene), Amber (watch), Green (on track)', 'Completion — percent of work done; read it alongside RAG, never instead of it'] },
      { tone: 'plain', title: 'What you can do here', bullets: ['Search and filter by status, RAG or delivery stage', 'Start a New programme, or a new project from a delivery template', 'Open any project for its full 360° view'] },
      { tone: 'tint', title: 'Watch for', body: 'High completion with a Red RAG is the dangerous combination — lots done, but something is wrong. Don’t let the percentage reassure you.' },
    ],
  },
  '/delivery/my-tasks': {
    title: 'My Tasks',
    summary: 'Every delivery task assigned to you, across all projects, in one list.',
    blocks: [
      { tone: 'tint', title: 'Why this exists', body: 'Tasks live inside individual projects, but you work across many. This pulls everything assigned to you into one place so nothing falls between projects.' },
      { tone: 'plain', title: 'What the columns mean', bullets: ['Due — the date the task is expected done; shown in red once overdue', 'Effort — estimated days of work (e.g. “4d”)', 'Status — To Do, In Progress, Blocked or Done'] },
      { tone: 'plain', title: 'How to work it', bullets: ['Filter by status, or switch to another person’s list', 'Advance a task in place with the “→ {next status}” action — no need to open its project', '“Show done” reveals completed work; it is hidden by default to keep the list actionable'] },
      { tone: 'tint', title: 'Watch for', body: 'A Blocked task is a flag, not a parking space — something outside your control is holding the work. Chase the blocker rather than letting it sit.' },
    ],
  },
  '/delivery/projects': {
    title: 'Project — 360° view',
    summary: 'One project end to end — its execution process, plan, what it physically touches, and the gates it must pass to go live.',
    blocks: [
      { tone: 'tint', title: 'What this screen is for', body: 'If you need to know anything about a project — where it is, what is blocking it, what it will change, who signed what — it is on one of these tabs. This is the project’s single source of truth.' },
      { tone: 'plain', title: 'What the tabs give you', bullets: ['Delivery — the execution process you advance step by step (the heart of the screen)', 'Timeline — the Gantt of tasks and milestones; Tasks — the work breakdown', 'Impacted entities — the racks, devices, cabling and rooms this project will change', 'Cost — approved budget vs committed vs actual, the S-curve, and change orders', 'Tickets — ad-hoc delivery issues and tasks raised against the project or a step', 'Risks, Activity log (immutable audit) and Documents'] },
      { tone: 'plain', title: 'Tickets vs incidents', body: 'A ticket is a P2B delivery work item (an ad-hoc fix or task during the build). Operational incidents on live infrastructure live in Operate, not here — so the project view stays focused on delivery.' },
      { tone: 'plain', title: 'How cost works here', body: 'Cost is derived, not typed: committed and actual come from the project’s purchase orders, and the approved budget is the baseline plus the deltas of approved change orders. A change order is the only thing that moves the approved budget — raise one, approve it, and the budget and forecast update.' },
      { tone: 'tint', title: 'How the execution process works', body: 'The Delivery tab is a BPMN flow — there is no separate work order, the process is the work. You complete the current step to advance; at key points it pauses on a gate: “Procurement approved?”, “ATPs accepted?”, “HOTO accepted?”. The action button changes with the step — Generate procurement (BOM + POs), Generate ATP pack, Open hand-over package, then Go live — provision capacity.' },
      { tone: 'plain', title: 'The vital signs up top', body: 'Completion, Budget, Spend (shown red when over budget) and Open risks — the project’s health at a glance, above the tabs.' },
      { tone: 'tint', title: 'Watch for', body: 'Go-live is hard-gated: a project cannot reach “Live / Handover” until every ATP is Accepted and the HOTO is signed off. The process diagram shows exactly which gate is holding it — chase that, not the calendar.' },
    ],
  },
  '/delivery/programs': {
    title: 'Programme',
    summary: 'A programme and the projects delivering its objective, with health and spend rolled up.',
    blocks: [
      { tone: 'tint', title: 'What a programme is', body: 'A programme groups related projects under one objective and budget — say an AI capacity expansion built from several hall, power and network projects. This view rolls their health and spend up so you manage the whole, not the parts.' },
      { tone: 'plain', title: 'What you can do here', bullets: ['Track aggregate completion, spend and open risks across all child projects', 'See each project’s status and RAG, and open any of them', 'Move the programme through its lifecycle with the lifecycle buttons'] },
      { tone: 'tint', title: 'The lifecycle', body: 'Proposed → Planning → Active → Closed, with On Hold as a side state. Advance it as work progresses, and put it on hold when work genuinely pauses rather than leaving it falsely Active.' },
      { tone: 'plain', title: 'Watch for', body: 'One Red project inside an otherwise green programme still puts the objective at risk — the roll-up averages can hide a single blocking project. Check the project RAG breakdown, not just the programme colour.' },
    ],
  },
  '/delivery/permits': {
    title: 'Permits & Approvals',
    summary: 'The statutory permits a build depends on — and the gate that stops construction running ahead of them.',
    blocks: [
      { tone: 'tint', title: 'Why this matters', body: 'You cannot pour foundations without planning consent, or energise plant without an electrical permit. This register tracks every approval a facility build needs, and a construction phase cannot pass its permit gate until the required permits are Approved.' },
      { tone: 'plain', title: 'What the columns mean', bullets: ['Type — the kind of approval, from planning/zoning through to certificate of occupancy', 'Authority — the body that issues it (planning, building control, fire, grid operator)', 'Validity — for an Approved permit, days until it lapses; flagged amber ≤60 days and red once expired', 'Status — Not Started → Applied → In Review → Approved (or Rejected / Expired)'] },
      { tone: 'plain', title: 'How to read the KPIs', body: 'Approved is your cleared count; In review / applied is what is still with an authority; Expiring ≤60d and Expired are the ones to act on before they invalidate work already underway.' },
      { tone: 'tint', title: 'How it connects', body: 'Each permit is attached to a programme and a phase project. Open a row to jump to that phase; the phase’s cockpit shows a blocking banner while its permit gate is unmet.' },
      { tone: 'plain', title: 'Watch for', body: 'An approved permit with a near expiry is as much a risk as one never filed — a lapsed building permit can halt an active site. Renew before the validity window closes.' },
    ],
  },
  '/delivery/design': {
    title: 'Design Documents',
    summary: 'The design record from concept to as-built — and the gate that ensures you build to an issued set.',
    blocks: [
      { tone: 'tint', title: 'Why this matters', body: 'Construction should only proceed against drawings that are formally Issued for Construction (IFC). This register holds the design set per phase and discipline, and a construction phase cannot pass its design gate until an IFC package exists.' },
      { tone: 'plain', title: 'What the columns mean', bullets: ['Type — concept → schematic → detailed → MEP/structural → IFC package → as-built', 'Discipline — architectural, structural, electrical, mechanical, network or civil', 'Rev — the revision letter; revisions supersede earlier issues', 'Status — Draft → In Review → Reviewed → Issued for Construction → (As-Built)'] },
      { tone: 'tint', title: 'How it connects', body: 'Documents attach to a programme and phase project. The phase’s design gate clears when at least one of its documents reaches Issued for Construction; the cockpit links straight back here.' },
      { tone: 'plain', title: 'Watch for', body: 'Building to a superseded revision is a classic, expensive defect. Keep the IFC set current and mark old revisions Superseded so the field always works to the latest issue.' },
    ],
  },
  '/procurement': {
    title: 'Procurement',
    summary: 'The kit and services a project needs — bills of materials, purchase orders and vendors — and where spend stands against plan.',
    blocks: [
      { tone: 'tint', title: 'Why this matters', body: 'Delivery stalls when equipment isn’t ordered or hasn’t landed. This is where a project’s bill of materials becomes real purchase orders against real vendors, and where you watch spend against the plan.' },
      { tone: 'plain', title: 'What the KPIs mean', bullets: ['Open POs — orders not yet Received; your outstanding supply risk', 'Actual Spend — committed or spent to date', 'Forecast Variance — projected over or under plan; red over, green under'] },
      { tone: 'plain', title: 'The three tabs', bullets: ['Purchase Orders — each PO’s planned vs actual cost and its status: Draft → Approved → Ordered → Received', 'BOMs — bills of materials by type (Rack, Network, Power, Compute); open one for its line items and export to CSV', 'Vendors & Contracts — who you buy from, their SLA tier and rating'] },
      { tone: 'tint', title: 'How it connects', body: 'BOMs and POs belong to a project. Its Delivery tab creates them at the “Generate procurement” step, and they surface here for the procurement team to action — the procurement gate clears once they are procured.' },
      { tone: 'plain', title: 'Watch for', body: 'A PO stuck at “Approved” or “Ordered” while a build waits is the classic schedule killer. Open POs is the number to drive down.' },
    ],
  },
  '/commissioning': {
    title: 'Commissioning & Acceptance',
    summary: 'The estate-wide proof that builds actually work — acceptance tests and hand-over — before anything goes live.',
    blocks: [
      { tone: 'tint', title: 'Why this matters', body: 'Nothing goes live on trust. This is the platform-wide view of formal proof: every acceptance test protocol (ATP) and how far each project has climbed the commissioning levels. It is one of the two hard gates before go-live.' },
      { tone: 'plain', title: 'Reading the commissioning levels', body: 'Validation deepens through five Cx levels — L1 FAT (factory), L2 SAT (site), L3 Pre-functional, L4 Functional, L5 IST (integrated systems test under full load). Each card shows the acceptance rate reached at that level.' },
      { tone: 'plain', title: 'What an ATP tells you', bullets: ['System — what it tests: Power, Cooling, Network, Controls or Integrated', 'Steps passed — percent of its step grid passing', 'Status — Draft → In Progress → Witnessed → Accepted (or Failed)', 'An ATP is Accepted only when every step Passes and it has been witnessed'] },
      { tone: 'tint', title: 'How to use it, and where HOTO lives', body: 'Open any ATP to work its step grid — expected vs actual, Pass / Fail / N-A — then witness-and-accept it. The hand-over (HOTO) package — four sign-offs (Delivery/PM, Commissioning Agent, Operations/NOC, Facilities) and a cleared snag list — lives on each project’s Delivery tab.' },
      { tone: 'plain', title: 'Watch for', body: 'A single open Critical or Major snag blocks hand-over even when every ATP is green. Clear blocking snags early, not at the end.' },
    ],
  },

  // ── Plan: Planning ──
  '/planning': {
    title: 'Planner',
    summary: 'Plan anything from one rack to a new data centre — grounded in templates, benchmarks and what this estate really does.',
    blocks: [
      { tone: 'tint', title: 'The decision this supports', body: 'Whether a need — a rack, a pod, a hall, a plant upgrade, a network uplift, an expansion, a new site, an edge rollout or a decommission — is worth building, how big it should be, what it costs, when it can land, and what could stop it.' },
      { tone: 'plain', title: 'How a plan is built', bullets: ['Intent — describe the need in plain words; the planner reads the type, size and scope', 'Scope and site — an existing campus or a new site, with its climate', 'Template and profile — the plan template for the scope and the data-centre type profile bring parameters, rules, required aspects and the approval path', 'Demand — GPU, compute and storage mix, density, tenancy and growth', 'Sizing — racks, halls, plant, cooling, network and staffing, every number with its source', 'Phasing — phases and the capacity ladder', 'Cost — CapEx and OpEx envelope against benchmarks and delivered programmes', 'Rules and risks — hard and soft rules with standards, a risk register and permits', 'Scenarios — what-if comparison', 'Review and submit — deliverables and the approval path'] },
      { tone: 'tint', title: 'Grounded AI', body: 'Every proposal shows its confidence, its evidence and its source (estate actual, benchmark, template, document or AI). Nothing is applied until the planner accepts it. The AI guide button on the Planner page shows each helper and how often its proposals are accepted.' },
      { tone: 'plain', title: 'The AI helpers', bullets: ['Intent reading — turns your sentence into site type, size, scope, place and date', 'Sizing assistant — compares your density and PUE with what our live sites of the same type really do', 'Phasing optimiser — moves phases so long-lead equipment can arrive in time', 'Cost calibration — checks cost per kW against the benchmark band and our delivered builds', 'Risk predictor — proposes risks from lead times, project history and vendor risks', 'Plan copilot — answers questions using only the plan’s own numbers'] },
      { tone: 'plain', title: 'Tabs on this page', bullets: ['Overview — pipeline and what needs attention', 'Plans — every plan with filters', 'Templates — plan types, site types and building blocks a plan starts from', 'Benchmarks & rules — reference numbers by question, and the rules every plan must or should pass'] },
      { tone: 'plain', title: 'From plan to work', body: 'An approved plan creates a delivery programme from the matching blueprint and a Camunda work order (capacity expansion), and keeps links to both.' },
      { tone: 'tint', title: 'Watch for', body: 'Hard-rule failures block submission. Long-lead items that are already late to order, and permits that cannot be obtained before their gate, are the two most common reasons a phase slips.' },
    ],
  },


  // ── Plan: Capacity (leaves; the hub /capacity is authored co-located) ──
  '/capacity/power': {
    title: 'Power & Cooling Capacity',
    summary: 'Whether there is enough power and cooling headroom to safely take the next deployment — the ceilings a data center hits first.',
    blocks: [
      { tone: 'tint', title: 'The decision this supports', body: 'Before you commit a deployment, answer two questions here: is there power for it, and can you cool it? Both run out long before floor space does, so a yes on this screen is what unblocks rack placement and procurement.' },
      { tone: 'plain', title: 'What the power numbers mean', bullets: ['Feed Capacity — total utility feed the site is provisioned for (the ceiling)', 'Rack Power Draw (live) — what equipment is actually pulling right now', 'UPS Load (avg) — how loaded the protected supply is', 'Racks ≥85% — racks over the power-budget threshold; the at-risk count'] },
      { tone: 'plain', title: 'What the cooling numbers mean', body: 'Cooling Capacity against Current Load gives Headroom (kW); the CRAC / CRAH / CDU table shows supply and return temperatures per unit, and zones show load against setpoint.' },
      { tone: 'tint', title: 'How to read it', body: 'Across power and cooling, utilisation is colour-banded: green below 60%, amber 60–85%, red at or above 85%. Treat a rack at ≥85% as effectively full — inrush on start-up can trip a breaker even when steady-state looks fine. For A/B-fed racks the load must survive on a single feed, so judge per-feed, not just the total.' },
      { tone: 'plain', title: 'What you can do', body: 'The “Racks over power budget” table pinpoints where the heat is. “Raise capacity plan” starts a Capacity Expansion plan in Planning, pre-filled with the power (or cooling) figure, which routes for approval and becomes a delivery project.' },
      { tone: 'tint', title: 'Watch for', body: 'Stranded power — connected but never drawable because cooling or space ran out first. If power looks healthy but deployments still won’t fit, the constraint is elsewhere; capacity is only real when power, cooling and space all agree.' },
    ],
  },
  '/capacity/compute': {
    title: 'Compute & GPU Capacity',
    summary: 'How much GPU and compute headroom is left to place the next workload — especially AI.',
    blocks: [
      { tone: 'tint', title: 'The decision this supports', body: 'Use this to decide whether a compute or AI workload will fit, and where. GPU is usually the scarce, expensive resource, so it is the number that gates high-density placement.' },
      { tone: 'plain', title: 'What the numbers mean', bullets: ['GPU Utilization / GPU Slots Free — accelerator capacity committed vs available', 'CPU Cores Free and Storage Free — the other two pools that can bottleneck', 'Estate Compute Pools — GPU, CPU cores, Memory and Storage used vs total, side by side'] },
      { tone: 'tint', title: 'How to read it', body: 'The same green / amber / red bands apply, with ≥85% as the danger line. GPU at ≥85% means a new AI workload needs a capacity plan, not just a placement decision.' },
      { tone: 'plain', title: 'What you can do', body: '“Raise capacity plan” opens a Capacity Expansion plan pre-filled with a GPU / compute quantity — routed for approval, then delivered as a project.' },
    ],
  },
  '/capacity/space': {
    title: 'Space & Reservations',
    summary: 'The physical rack-unit room left to deploy into — and the reservations already holding some of it.',
    blocks: [
      { tone: 'tint', title: 'The decision this supports', body: 'Space answers whether equipment physically fits, independent of power and cooling. Read it alongside those two — a rack can have free U but no power, and vice versa.' },
      { tone: 'plain', title: 'What the space numbers mean', bullets: ['U Utilization / Free U — rack units used vs available across the estate', 'The Halls table shows each hall’s grid, racks used vs capacity, and utilisation (red at ≥85%)'] },
      { tone: 'tint', title: 'The two kinds of reservation', body: 'This screen also holds the capacity reservation ledger. The pool ledger tracks abstract capacity (kW / U / addresses) through Available → Reserved → Committed → Consumed; physical rack-U holds on a specific rack are made from that rack’s own Reservations tab and roll up here read-only.' },
      { tone: 'plain', title: 'What you can do', body: 'Filter halls to find room, open a hall for its floor plan, or raise a New reservation to hold capacity for upcoming work. Reserved and Committed capacity is netted out of the “Net Available” figure on the Capacity hub.' },
      { tone: 'tint', title: 'Watch for', body: 'Reservations that never convert to Consumed quietly strangle available space — they look committed but deliver nothing. Release holds that no longer have a project behind them.' },
    ],
  },
  '/capacity/pue': {
    title: 'PUE & Sustainability',
    summary: 'How efficiently the facility runs — PUE, energy breakdown and carbon — not how much headroom is left.',
    blocks: [
      { tone: 'tint', title: 'What this answers', body: 'Efficiency, not capacity. PUE (Power Usage Effectiveness) is total facility power divided by IT load — how much energy goes to overhead like cooling rather than useful compute. Lower is better.' },
      { tone: 'plain', title: 'What the numbers mean', bullets: ['PUE (trailing) — the efficiency ratio; green at or below 1.40, amber above', 'IT Load vs Total Facility — the two figures the ratio is built from', 'Annual Carbon — estimated tCO₂e for the estate', 'Energy breakdown — facility power split into IT, Cooling, Loss and Other'] },
      { tone: 'plain', title: 'The ESG scorecard', body: 'Tracks PUE, renewable energy mix, WUE (water efficiency), carbon intensity and annual footprint against targets, each flagged On track, Behind or Above target.' },
      { tone: 'tint', title: 'Note', body: 'This is a preview surface — the figures illustrate the intended sustainability reporting (fed from BMS, power meters and a grid carbon-intensity source) rather than live readings yet.' },
    ],
  },

  // ── Plan: Data Centers (Facility / DCIM) ──
  '/facility': {
    title: 'Data Centers',
    summary: 'The single source of truth for the physical estate — every site, hall, rack and device, from the top down.',
    blocks: [
      { tone: 'tint', title: 'Why this is foundational', body: 'Capacity, IPAM and Delivery all read from this record. If it is wrong here, every headroom number and impact analysis downstream is wrong too — so its accuracy is the whole platform’s accuracy.' },
      { tone: 'plain', title: 'The hierarchy', body: 'Drill the tree Enterprise → Region → Campus → Data center → Building → Floor → Hall → Row → Rack → Device. The top KPIs summarise it: Data Centers, Racks, Avg Power Utilization (red at ≥85%), Power Headroom and GPU Racks.' },
      { tone: 'plain', title: 'How to navigate', bullets: ['Physical — this hierarchy, Halls & floor plans, Racks and Power distribution', 'Inventory — the Catalog, Device types, Module types and Devices', 'Connectivity — Cabling between devices; Explorer to filter and find anything fast'] },
      { tone: 'tint', title: 'How changes are governed', body: 'Creating, moving or retiring racks and devices requires an approved change request — the record only stays trustworthy if every physical change is authorised and auditable.' },
    ],
  },
  '/facility/halls': {
    title: 'Halls & Floor Plans',
    summary: 'The spatial view — drill from a data center to a floor to a hall, then read the rack layout as a heat map.',
    blocks: [
      { tone: 'tint', title: 'What this is for', body: 'The visual complement to the hierarchy tree. Use it to see where the hot racks physically sit on the floor, not just in a list.' },
      { tone: 'plain', title: 'How to navigate', body: 'Start at Facilities, pick a data center to see its floors, pick a floor to see its halls, then open a hall for its floor-plan heat map. Each card shows racks used vs capacity and a utilisation tag.' },
      { tone: 'tint', title: 'Reading the heat map', body: 'Racks are coloured by power utilisation — green below 60%, orange 60–85%, red at or above 85%. Clusters of red show where the floor is constrained and where not to add load.' },
    ],
  },
  '/facility/racks': {
    title: 'Racks',
    summary: 'Every rack — how full it is on space and power, what it is for, and how it is protected.',
    blocks: [
      { tone: 'tint', title: 'What you can do here', body: 'Browse and manage every rack, or jump straight to the at-risk ones. Open a rack for its elevation view, the devices fitted in it, and its power, weight and reservation detail.' },
      { tone: 'plain', title: 'What the columns mean', bullets: ['U used — rack units occupied vs total height', 'Power — live draw against budget; the bar turns red at ≥85%', 'Purpose — Compute, Storage, Network, GPU or Mixed; Cooling — Liquid-ready or Air', 'Status — Planned, Active, Full, Reserved or Retired'] },
      { tone: 'plain', title: 'The tabs', body: 'All, GPU / AI, High power (≥85%) and Reserved pre-filter the list to the racks you usually need.' },
      { tone: 'tint', title: 'Governed', body: 'Creating, editing or retiring a rack all require an approved change request — retiring prompts you to pick the authorising CR first.' },
    ],
  },
  '/facility/devices': {
    title: 'Devices',
    summary: 'The installed equipment — every server, switch and PDU, where it sits and what it connects to.',
    blocks: [
      { tone: 'tint', title: 'What this is', body: 'Each device is an instance of a device type, placed in a rack at a position. Open one for its ports, cabling, IP bindings and a faceplate view.' },
      { tone: 'plain', title: 'What the columns mean', body: 'Device and Type (the model it was instantiated from), Role, Status, Ports (auto-created from the type) and Cabled (how many of those ports are connected).' },
      { tone: 'tint', title: 'Creating and changing devices is governed', body: '“New device” requires an authorising change request, and instantiating it auto-creates all its ports from the chosen device type’s templates. Connecting or disconnecting a cable is likewise gated by a CR — so physical connectivity stays auditable, and you can trace any path end to end.' },
    ],
  },
  '/facility/device-types': {
    title: 'Device Types',
    summary: 'The catalog of equipment models you deploy — defined once, instantiated many times.',
    blocks: [
      { tone: 'tint', title: 'Why a catalog', body: 'A device type is the template — manufacturer, model, height in U, weight, airflow, and the full set of ports (component templates). Define it once and every device you instantiate inherits those ports automatically, so real devices stay consistent.' },
      { tone: 'plain', title: 'Device type vs device', body: 'A device type is the model (e.g. a particular switch SKU); a device is a physical instance of it in a rack. You author ports on the type; they materialise as named ports on each instance.' },
      { tone: 'plain', title: 'What you can do', body: 'Create a new device type (then add its interface, power, console and chassis templates from its detail tabs), or Import a batch as JSON. Roles classify them — Spine, Leaf/ToR, Firewall, Server, Storage, PDU and so on.' },
    ],
  },
  '/facility/module-types': {
    title: 'Module Types',
    summary: 'Swappable modules — line cards and the like — that install into a device’s chassis bays.',
    blocks: [
      { tone: 'tint', title: 'What this is for', body: 'Some devices are modular: a chassis with bays you populate with line cards. A module type is the template for one of those cards, carrying its own ports. Define it here, then install it into a device’s module bay.' },
      { tone: 'plain', title: 'Handy to know', body: 'Use {slot} in a port name and it is substituted with the bay slot when the module is installed — so one module type serves every bay it can go in.' },
    ],
  },
  '/facility/cabling': {
    title: 'Cabling',
    summary: 'Every physical connection — which cable links which device port to which, and whether it is live.',
    blocks: [
      { tone: 'tint', title: 'What this shows', body: 'The structured cabling of the estate as A-side ↔ B-side pairs, so you can trace a path end to end and understand what a change will disturb.' },
      { tone: 'plain', title: 'What the columns mean', body: 'A side and B side (device : port at each end), cable Type (Cat6/6a, fibre OM4/OS2, DAC, power), an optional Bundle, Length, and Status — Active (green), Planned (gold) or Decommissioning (red).' },
      { tone: 'tint', title: 'Governed', body: 'Connections are made from a device’s ports and authorised by a change request, so the cabling record matches what is physically patched.' },
    ],
  },
  '/facility/power-dist': {
    title: 'Power Distribution',
    summary: 'How power reaches the racks — the panels and the A/B redundant feeds that supply them.',
    blocks: [
      { tone: 'tint', title: 'What this shows', body: 'The distribution chain from panels to per-rack feeds — the link between the site’s power capacity and what each rack can actually draw, including its redundancy.' },
      { tone: 'plain', title: 'What the feed fields mean', bullets: ['Supply / Phase — AC or DC, single- or three-phase', 'Voltage / Amperage / Max util — the feed’s electrical rating and its safe ceiling', 'Type — Primary (blue) or Redundant (purple): the two sides of an A/B pair', 'Status — Active, Planned, Offline or Failed'] },
      { tone: 'tint', title: 'Why redundancy matters here', body: 'A 2N rack is fed from two independent feeds so it survives losing one — but both feeds must each carry the rack alone. If a “redundant” feed is actually needed to share load, the rack is not truly protected.' },
    ],
  },
  '/facility/catalog': {
    title: 'Equipment Catalog',
    summary: 'The shared reference data the rest of the estate is built from — manufacturers, roles, platforms and rack/site types.',
    blocks: [
      { tone: 'tint', title: 'Why this exists', body: 'Manufacturer, device role and platform are real, reusable entities here — not free text typed differently every time. That is what makes filtering, reporting and consistency possible across thousands of devices.' },
      { tone: 'plain', title: 'What it holds', body: 'Manufacturers, Device roles, Platforms and Inventory roles; plus Rack roles, Rack types, Rack groups and Site groups — the building blocks you pick from when creating racks and device types.' },
    ],
  },
  '/facility/sites': {
    title: 'Sites',
    summary: 'Every data center as a record — classification, resilience, footprint, live load against its type’s policy band and PUE against its type’s target.',
    blocks: [
      { tone: 'tint', title: 'What this is', body: 'The list view of the estate. The map, the hierarchy and the drill page show the same sites spatially and in detail; this is where you browse, filter by segment, type or status, and edit a site’s identity and classification.' },
      { tone: 'plain', title: 'Reading the columns', bullets: ['Type — the facility type with its DCOS coverage letter (F/S/P/G)', 'IT load — live rack draw and its share of rack nameplate', 'Over band — racks at or above the warning threshold for this facility type (85% enterprise, 80% colo and telco, 90% hyperscale and GPU)', 'PUE — modelled from the facility type’s cooling overhead, green when at or below the type’s target'] },
      { tone: 'tint', title: 'Editing', body: 'Edit changes name, code, campus, type, tier, status, design power and location. Changing the type re-suggests the tier and switches the site’s policy bands, PUE target and build blueprint; racks and plant already on the site are not rebuilt. New sites are created through Onboard data center, which also lays out floors, halls, racks and plant.' },
    ],
  },
  '/facility/dc-types': {
    title: 'Data Center Types',
    summary: 'The reference taxonomy of facility types — enterprise and telco, smallest to largest — and how well DCOS serves each.',
    blocks: [
      { tone: 'tint', title: 'What this is', body: 'Every data center carries a type (Edge micro-DC, Enterprise DC, Retail colocation, Central Office, AI / HPC GPU factory …). The type sets sensible defaults when a site is onboarded — resilience tier, design power, rack density — and lets you filter the map, the scope selector and build intake by the kind of facility rather than only its Uptime tier.' },
      { tone: 'plain', title: 'Reading the table', bullets: ['Typical size, Power, kW/rack — the industry ballpark envelope for the type; a guide, never a hard limit', 'Cooling and Redundancy / Tier — the predominant approach and resilience posture', 'DCOS coverage — Full: core use case · Strong: minor gaps · Partial: a key domain model is missing · Gap: out of scope; hover to see which platform capability would close it', 'Sites — how many facilities in the estate are classified as this type; click to see them on the map'] },
      { tone: 'tint', title: 'Watch for', body: 'Sites left untyped fall back to tier-only behaviour. Colocation and telco types are marked Partial until multi-tenancy, −48V DC plant, optical transport and service inventory land — the type is recorded now so those modules can key off it.' },
    ],
  },
  '/facility/explorer': {
    title: 'Explorer',
    summary: 'A dense, filterable working view of racks and devices — built for day-to-day hunting, with saveable views.',
    blocks: [
      { tone: 'tint', title: 'When to use it', body: 'When you need to find or work a slice of the estate fast — every GPU rack over 85%, every device of a role in one data center. It is the power-user view, denser than the curated lists.' },
      { tone: 'plain', title: 'How to work it', body: 'Toggle between Racks and Devices, filter by data center, purpose, status, power band or lifecycle, and switch racks between a Table and a Visual (heat-tile) view. Save a filter as a named view to reuse it, or Export CSV.' },
    ],
  },
};

/** Per-module fallback shown when a specific route has no authored Synopsis.
 *  These are real, persona-written module summaries (not placeholders). */
const MODULE_STUBS: Record<string, SynopsisDoc> = {
  capacity: { title: 'Capacity', summary: 'Whether you have the power, cooling and space to say yes to the next deployment.', blocks: [{ tone: 'tint', title: 'What this is', body: 'A live read on the hard limits of the estate — power, cooling, space and compute — built from actual device placement. It is how you protect headroom and decide what will fit.' }, { tone: 'plain', title: 'Reading the numbers', bullets: ['Utilization — in use today against the safe maximum', 'Pipeline — capacity promised to approved plans but not yet drawn', 'Headroom — what is left after both, the number that gates new commitments'] }] },
  planning: { title: 'Planning', summary: 'Turning a request into an approved, executable plan.', blocks: [{ tone: 'tint', title: 'What this is', body: 'The front of Plan-to-Build: capture a need, justify it, get it approved, and execute it into a change or a project.' }] },
  facility: { title: 'Data Centers', summary: 'Your physical estate — sites, halls, racks and the equipment in them.', blocks: [{ tone: 'tint', title: 'What this is', body: 'The single source of truth for where everything physically lives, from campus down to rack and device. Physical changes are governed by approved change requests.' }] },
  change: { title: 'Change Management', summary: 'Making sure significant changes are approved — and policy-checked — before they happen.', blocks: [{ tone: 'tint', title: 'What this is', body: 'The register of change requests that authorise the major actions across DCOS — deploying racks, moving devices, network cutovers, config pushes. Each is routed for risk-tiered approval and evaluated against policy-as-code. A change may be raised here or referenced from an external ITSM.' }, { tone: 'plain', title: 'How it connects', body: 'Facility actions, delivery projects, capacity reservations and emergency fixes from incidents all reference an approved change, so every significant change is traceable and governed.' }] },
  circuits: { title: 'Circuits', summary: 'External connectivity under contract and SLA — health, utilisation, cost and site redundancy.', blocks: [{ tone: 'tint', title: 'What this is', body: 'The carrier/WAN circuits serving your data centers. Each circuit’s A-side terminates on a real network device interface (so it carries live utilisation), and each carries a monthly cost, an uptime/restoration SLA and a provisioning lifecycle. The register flags saturated circuits, single-homed sites and provider spend.' }] },
  nms: { title: 'Network Operations', summary: 'The live health of the managed fabric — fault, performance and configuration in one place.', blocks: [{ tone: 'tint', title: 'What this is', body: 'The operational lens on the real network devices — a composite health score per device, fault management with correlation, per-interface performance baselines, running-vs-golden config drift, and discovery reconciliation against the source of truth. It observes the same devices the build delivered, not a separate inventory.' }] },
  compliance: { title: 'Compliance', summary: 'Whether the estate is meeting the rules you have set.', blocks: [{ tone: 'tint', title: 'What this is', body: 'Posture against your frameworks and policies: policy-as-code controls, violations and the decision record — evidence the estate is run to standard.' }] },
  customization: { title: 'Customization', summary: 'Extend any object with your own fields and tags.', blocks: [{ tone: 'tint', title: 'What this is', body: 'Define custom fields and tags once and apply them across the platform — adapt DCOS to your own conventions without a schema change.' }] },
  operations: { title: 'Operations', summary: 'The day-to-day running of the live estate.', blocks: [{ tone: 'tint', title: 'What this is', body: 'The operational picture once infrastructure is live and handed over — the bridge between what was built and how it is run.' }] },
  incidents: { title: 'Incidents', summary: 'Operational issues and how they are being resolved.', blocks: [{ tone: 'tint', title: 'What this is', body: 'The incident register — severity, status and affected resources — so operational issues are tracked to resolution and can be related back to the projects and data centers they touch.' }] },
  intelligence: { title: 'Topology & Dependencies', summary: 'How everything connects, and what is affected when something changes.', blocks: [{ tone: 'tint', title: 'What this is', body: 'The dependency and dataflow view — a digital-twin lens on how assets connect, used to understand blast radius and impact.' }] },
  delivery: { title: 'Deliver', summary: 'The work in flight to build and change the estate.', blocks: [{ tone: 'tint', title: 'What this is', body: 'The delivery portfolio — programmes, projects and their execution from procurement through commissioning to hand-over. Open the Command Center for triage.' }] },
};

const GENERIC: SynopsisDoc = {
  title: 'About this screen',
  stub: true,
  summary: 'A quick orientation for this page is being written.',
  blocks: [{ title: 'Need the bigger picture?', body: 'Open the Playbook (book icon above) for a guided tour of the platform and how each part fits together.', tone: 'tint' }],
};

/** Resolve the best Synopsis for a pathname: exact → longest prefix → module stub → generic. */
export function getSynopsis(pathname: string): SynopsisDoc {
  if (SYNOPSIS[pathname]) return SYNOPSIS[pathname];
  const keys = Object.keys(SYNOPSIS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (pathname === k || pathname.startsWith(k + '/')) return SYNOPSIS[k];
  }
  const seg = pathname.split('/').filter(Boolean)[0];
  if (seg && MODULE_STUBS[seg]) return MODULE_STUBS[seg];
  return GENERIC;
}
