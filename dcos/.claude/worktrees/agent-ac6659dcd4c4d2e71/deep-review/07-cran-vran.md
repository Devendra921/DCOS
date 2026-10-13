# Deep Review — C-RAN / vRAN / O-RAN Module

**Reviewer perspective:** C-RAN/vRAN/O-RAN Architect (Mavenir, Parallel Wireless, Rakuten Symphony, Altiostar, Samsung vRAN, NEC, Ericsson Cloud RAN)
**Scope:** `src/modules/cran-vran` — 21 pages, ~520k LoC including dashboard, hub-site lifecycle, DU/CU/RU fleet, fronthaul, RU-DU mappings, O-RAN interop catalog, software version report
**Files audited in full:** all 21 listed pages (CRANDashboard 1054 lines, CRANDetailPage 1349 lines, plus lib/cranData and lib/cranActions context)

---

## A. Module Purpose Validation

The module identifies itself as `C-RAN / vRAN / O-RAN hub sites` (see `CRANListPage` line 525) and the `HubSite` entity is the indisputable central pivot — every page joins through `hubSiteId`. This is broadly correct: in operator practice, hub sites (also called CRAN hubs, COs, BBU hotels, or pooling centers) are exactly the central capacity entity around which DU/CU pools, fronthaul transport, and power/cooling budgets all aggregate.

However, **the module conflates C-RAN, vRAN, and O-RAN as architecture variants on a single dimension** (see `ARCHITECTURES` array referenced in `HubSiteFormPage.tsx` line 397 with a radio-button selector). These are orthogonal concepts in real practice:

- **C-RAN** is a *deployment topology* (centralized baseband at a hub) — used since 2009, NEC and China Mobile origins.
- **vRAN** is a *software architecture* (BBU functions run as VMs/containers on COTS hardware instead of purpose-built ASICs).
- **O-RAN** is a *standards alliance / interface specification* (open 7.2x fronthaul split, O1/E1/F1/A1/E2 interfaces).

A site can simultaneously be all three (the Rakuten Mobile model is "C-RAN topology + vRAN software + O-RAN compliant"), or just one (a traditional Ericsson BBU hotel is C-RAN but not vRAN or O-RAN). The radio-group selector forces a single choice and will misrepresent any real fleet that mixes architectures across a single hub. A proper model would expose three boolean facets — `topology: { centralized | distributed }`, `software: { purpose_built | virtualized }`, `interface_compliance: { ORAN | proprietary }` — and a derived label.

**Hub Site as central entity:** Correct. The 5 capacity dimensions (rack U, power kW, cooling kW, DU slots, CU slots) tracked on `HubSite` (see `CRANDetailPage.tsx` lines 1144-1148 for the gauge HERO) are the right semantic primitives. The `hubType` enum (`centralized_DU | edge | regional_CU | combined`) is reasonable but missing `cell_site` (for D-RAN), `aggregation_hub` (multi-tier hierarchy), and `metro_breakout` (MEC + UPF colocation).

**Overlap with Site Lifecycle:** Significant and unresolved. The `hubSites` table maintains its own address, region, city, latitude, longitude, floorSpaceSqm, accessType, accessInstructions, fireSuppressionType, physicalSecurity, ownerOrg, operatingOrg, commissioningDate — *all* of which exist on a generic Site entity (referenced indirectly via `parentSiteId`). This duplication means two systems of record for the same physical real estate. In Mavenir/Rakuten production deployments the hub site is a *role* of a site, not a separate entity. The form (HubSiteFormPage line 402-404) does expose `parentSiteId` but it is a free-text field with no validator; there is no FK or "create as overlay on existing site" workflow.

**Overlap with RF Network Design:** RU vendor/model selection appears in three different places — `RUDUMappingFormPage` (lines 304-320), `ORANInteropCertDetailPage` (lines 462-484), and FH link forms — with no shared RU catalog. RF design owns the antenna/sector/cell logical model; CRN owns the physical RU + transport. The boundary is correct in principle but RU catalog is not normalized.

**O-RAN Interop as separate workflow:** Correctly modeled — `ORANInteropCertCatalogPage` is a 717-line, fully fleshed catalog with vendor-vendor compatibility matrix, certification body tracking (O-RAN Alliance, OTIC, TIP), test labs, certified/limited/incompatible enum, expiry tracking, and integration into the readiness checker via `findInteropCert()`. This is one of the strongest screens in the module.

---

## B. Workflow Audit

**Hub site provisioning lifecycle:** Partial. Status enum (`HUB_STATUSES`) is `planned | under_construction | operational | at_capacity | maintenance` — adequate but does not separate "design approved", "procurement initiated", "civil works", "power delivered", "fiber lit", "integration complete", "soak", "in-service". The form has a single status field and a `commissioningDate`. No multi-stage workflow with gates. Compare to Ericsson Operations Engine where a hub goes through ~14 milestones with approval gates at each transition.

**DU/CU unit lifecycle:** DU statuses are `Operational | Commissioned | Planned | Pending Install | Faulty | Decommissioned`. Reasonable. `useDUActions` exposes `create | update | upgradeSoftware | bulkUpgradeSoftware | bulkUpdateStatus | decommission` (see DUUnitListPage and DUUnitDetailPage). No reboot workflow that actually changes state (it just `setTimeout`s a message). No firmware versus L1 software distinction. No factory-reset / re-image / golden-image-rebuild flows.

**RU-DU mapping workflow:** Well-developed. The form has 6 sections (RU id, target DU, fronthaul link, split + capacity, interop validation, status), live readiness preview, dependent-dropdown ergonomics (DU select disabled until hub picked, fronthaul filtered to matching RU-Hub pairs), and a separate `FronthaulReadinessCheckerPage` that re-runs the same `checkRUDUReadiness()` and lets an Engineering Lead grant a waiver. This is closest to a real Rakuten Symphony / Mavenir "service activation" workflow but is missing OAM activation (PNF onboarding via O1/NETCONF, RU registration handshake, M-plane attach), CM-data application, and the post-activation neighbor-cell config sync.

**Fronthaul link planning & commissioning:** `FronthaulLinkListPage` + `FronthaulLinkDetailPage` model the link as a single connection from RU site → hub, with type (Dark Fiber, eCPRI, WDM, Microwave, Leased Wholesale), protocol, distance, measured latency, BW used/total, optics model, wavelength, fiber pairs, monthly cost, contract end. The 7-tab detail page (Overview, Performance, Connected RUs, Latency Analysis, Cost, Provider & Optics, Audit) is solid. **Missing:** active vs standby fiber, protection rings, link-aggregation (LAG) bundles, PTP grandmaster/boundary-clock dependency, syncE source/sink topology, OTDR test results, optical power budgets (dB margin per span), light-level monitoring, BER thresholds, and SLA reporting. The model assumes one optical pair per link — in reality each fronthaul typically has multiple wavelengths over the same pair (CWDM/DWDM grids).

**O-RAN certification workflow:** Catalog + detail form + create + supersede + renew actions, plus matrix view. The form (lines 450-712 of detail page) captures vendor/model/SW version for RU/DU/CU, split options, bands, cert body, test lab, dates, status, compatibility (Certified/Limited/Incompatible), features tested, results summary, known limitations, doc upload. Strong. Missing: cert revisions/amendments, test-case-level pass/fail granularity (the catalog only stores summary, not the underlying ~200 OTIC test cases like CU.IOT.5GS.001), MIB walk results, OFH-U/C/M/S plane subtest breakdown, conformance vs interoperability vs end-to-end distinction.

**Software version management:** `DUCUSoftwareVersionReportPage` (653 lines) is excellent — fleet-wide matrix of top 30 hubs × unique versions, BR-CRN-008 inconsistency detection with bulk-plan-upgrade, version distribution donut, planned upgrade Gantt timeline (12-week horizon). However the "Plan Upgrade" action *instantly mutates* the DU's softwareVersion via `db.update` — it doesn't actually plan, schedule, gate by maintenance window, or run pre-checks. Bulk SW upgrade (`bulkUpgradeSoftware` in actions) is a single-step write. Missing: pre-check gates (compatibility matrix check, fronthaul stability check, traffic-load check), canary deployment, rollback support, A/B partition swap, blackout-window enforcement, dependency tree resolution (CU↔DU version compatibility).

**Capacity expansion planning:** `HubSiteCapacityPlannerPage` is solid — stage DU/CU adds, get projected utilization, save as expansion plan. `HubSiteExpansionPlanPage` adds 6-state approval workflow (Draft → Submitted → Approved → In Progress → Completed | Rejected). Cost in USD, target date, resource type, required approvals, justification. Compare to real operator capex workflow which would also bind to PO numbers, vendor quotes, BOM (bill of materials), MFG lead-time tracking, site-readiness dependencies. Currently no link from plan approval to procurement system.

**Pool capacity management:** Implicit, not explicit. The model treats each hub's DU slots/CU slots as a count, not as a pool from which workloads draw. In real vRAN deployments, a CU-CP pool serves N DUs across multiple hubs (one CU-CP for the metro), and DU virtualization means you allocate vCPU/RAM/accelerator slices to a workload — not "slots". The current model is more appropriate to physical baseband appliances than to a true vRAN pool. This is a fundamental modeling gap if the goal is to represent Mavenir Web-Scale or Rakuten Symphony class deployments.

**Multi-vendor RU-DU interop:** Handled via the cert catalog + readiness checker. The matrix view is operator-grade. What's missing is real-world things like "this RU has been seen connecting with that DU in production at 2 sites under specific feature flags" — the field-validated combinations vs the lab-certified ones.

---

## C. Screen-by-Screen Review

**1. CRANDashboard (1054 lines, `pages/CRANDashboard.tsx`)** — Strong. Canonical glass + AMBIENT_BG, 4 hero KPI tiles (Operational, DU Util, CU Util, At Capacity) with sparklines and trend deltas, capacity heatmap of top 30 hubs × 5 resources (rack/power/cooling/DU/CU) with 6-bucket color scale, approaching-capacity list with MiniPct chips, AI briefing card, power-by-hub-type horizontal bars, software inconsistency table (BR-CRN-008), expansion pipeline Gantt. Filtering by region/hubType/architecture/status/search. Issues: top 30 cap on heatmap means a 1000-hub fleet sees only 3% on this screen; no zoom or alternate map mode; "AI" briefing is heuristic not actually AI; sparklines are pure sine-wave fakes (line 342) which is fine for demo but should be wired to a time-series store.

**2. CRANDetailPage (1349 lines)** — Excellent breadth. Header with status pill + arch pill + type chip, DetailPageHeader with 9 action items (Add DU, Add CU, Edit, Plan Expansion, Capacity Planner, View Audit, Clone, Decommission). 5-gauge HERO (rack/power/cooling/DU slots/CU slots) using `CapacityGauge` component. 10 tabs via TabBarV2 with `primaryCap: 6` overflow: Overview, DU Units, CU Units, Connected RUs, Fronthaul Links, Expansion Plans, Software, Audit, Rack, Power. Connected RUs and Fronthaul Links tabs are *synthesized* (lines 715-744 + 763-798) — they fabricate rows from existing DUs rather than reading the real `fronthaulLinks` and `ruDuMappings` collections that exist in the same module. This is a serious data-integrity issue: the same fronthaul link will appear differently here vs on the Fronthaul Links page. Add-DU and Add-CU drawers are well-designed with validation messaging referencing BR-CRN-002/007/011.

**3. CRANListPage (722 lines)** — Production-grade list with mini-bar progress columns showing reserve-margin marker, density columns, saved views, bulk import/export, role-gated decommission with active-DU/CU dependency check (lines 325-342) — that dependency check is exactly the right behavior. KPI strip has 7 tiles; could be reduced to 5 to avoid the comma-decision fatigue.

**4. HubSiteFormPage (677 lines)** — 4-step wizard (Identity → Physical → Capacity → Status & Notes), sticky right-side live-capacity-preview sidebar with 5 mini gauges + validation checklist. Sections A-G with badge numbers. Step navigation validates fields per-step before allowing Next. Reserve-margin threshold visualized. **Missing:** geocoding from address (lat/lon are free-form inputs); no fiber-route map; UPS sizing helper (kVA → minutes of runtime calc based on load); no power-quality form fields (TPS, harmonic distortion, surge protection); no environmental (humidity, temp range, seismic zone, flood risk); no rack elevation diagram in the form itself.

**5. HubSiteCapacityPlannerPage (808 lines)** — Excellent. Side-by-side capacity bars showing current (blue) + planned increment (orange) + reserve-threshold marker, KPI strip showing current vs projected with diff annotation. Vendor/model templates with rack U and kW per unit. Stage table with remove. Comparison matrix. Recommendation block that calls out which resources need expansion. Saves as expansion plan with name/date/cost. Solid simulation tool. **Missing:** what-if reverse mode ("we need to add 4 cells of 100MHz capacity — what hub can accommodate?"), cost optimization (which hub gives lowest $/Gbps), thermal modeling beyond linear 85% multiplier.

**6. HubSiteExpansionPlanPage (772 lines)** — 3-mode page (list/detail/create) routed via URL pattern. AntD Steps for approval workflow visualization, status pills, resource adds table, justification, required-approvals chips, advance/reject buttons gated by `CAP.approveRebaseline`. Pipeline Gantt on dashboard already shown. Solid. **Missing:** cost breakdown (CapEx vs OpEx, hardware vs labor), vendor quote attachment, dependency on other plans (e.g. "this needs fronthaul plan FH-2026-Q3 to complete first"), gate-review meeting templates.

**7. DUUnitListPage (593 lines)** — Fleet view with 7 KPIs, version-inconsistency badge per row (BR-CRN-008), bulk SW upgrade + status update via modals, role-gated New DU. The version-inconsistency computation is correct (lines 158-169) — groups by hub+vendor+model, finds majority, flags outliers. Inline tooltip explains BR-CRN-008. Excellent.

**8. DUUnitDetailPage (655 lines)** — 7 tabs (Specifications, Connected RUs, Performance, Software History, Physical, Connected CUs, Audit). Software History tab includes BR-CRN-008 banner when mismatch exists, version timeline, same-hub-DUs comparison table with Majority/Diverges badges. Physical tab includes hand-rolled rack elevation SVG (42 U with highlight on current DU). Performance is purely mock SVG bar charts. Upgrade modal with warning when target version creates inconsistency. **Missing:** L1 stats (UL/DL RSRP/RSRQ aggregates), accelerator card health (Intel FlexRAN ACC100, Marvell, Qualcomm), MAC scheduler stats, slot/HARQ utilization.

**9. DUUnitFormPage (565 lines)** — 4-step wizard, sections A-H (Identification, Hardware, Capacity, Capabilities, Rack Position, Power, Network, Lifecycle). Live capacity sidebar with rack U/Power/DU-slot progress bars and BR-CRN-011 rack-collision detector that reads both DUs and CUs at the target hub. Excellent. **Missing:** L1 accelerator selection (FPGA model, GPU model, ASIC vendor), DPDK/SR-IOV config, NUMA pinning, OFH transport profile selection, fan/heat-dissipation rating, IEEE 1588 PTP profile (G.8275.1 / .2 / FullTimingSupport / PartialTimingSupport).

**10. CUUnitListPage (518 lines)** — Same fleet pattern as DU list, with platform breakdown (Bare Metal / VM / Container) and CU-type breakdown (CU-CP / CU-UP / Combined) as small donut summary cards in the KPI strip. Platform icons (DatabaseOutlined / DesktopOutlined / CodeOutlined). Good.

**11. CUUnitDetailPage (437 lines)** — 7 tabs (Configuration, Platform, Virtualization, Connected DUs, Performance, Software History, Audit). Virtualization tab conditionally rendered based on platformType. Connected DUs tab applies BR-CRN-012 filter (only Operational or Commissioned). vCPU/RAM/Storage chips shown for VM/Container platforms. **Missing:** AMF/UPF endpoint health, NRF/SMF service mesh status, N2/N3/N4 interface diagnostics, Kubernetes pod/deployment status (for containerized), HA peer status for active-standby pairs, geo-redundancy info.

**12. CUUnitFormPage (633 lines, not read in full but skimmed)** — Multi-section form, same wizard pattern as DU form. Platform-conditional fields (hypervisor/orchestration/container runtime). Sound.

**13. FronthaulLinkListPage (453 lines)** — 8 KPIs (Total, Operational, Degraded, Avg Latency, Avg BW Util, Dark Fiber count, Leased count, Monthly Cost), 6-facet filtering including latency-risk classification (`<80%`, `80–100%`, `Over Budget`), CSV export. Latency-risk function (line 113-119) hard-codes 100μs split-7.2x ceiling — adequate.

**14. FronthaulLinkDetailPage (542 lines)** — View+edit dual mode, 7 tabs (Overview, Performance, Connected RUs, Latency Analysis, Cost, Provider & Optics, Audit). KPI strip with conditional color for latency over threshold and contract-ends within 90 days. Latency histogram is fake (line 317 hard-coded array). p50/p95/p99 derived as `measured × 1.0/1.12/1.22`. **Missing:** real telemetry integration, MTU/frame-size config, FEC config (RS-FEC vs LL-FEC for 25G eCPRI), CoS/DiffServ marking, OAM probe responses, dying-gasp notification handling.

**15. FronthaulReadinessCheckerPage (309 lines)** — Excellent UX. Hero card with overall pass/warning/fail icon and 4 check rows (Fronthaul Operational BR-CRN-006, Latency within Budget BR-CRN-001, Bandwidth Sufficient, DU Capacity Available BR-CRN-004), each with current/threshold/recommendation. Engineering waiver request modal that appends to mapping notes. The recommendation copy is operator-grade (line 126 — "Engage transport vendor for path optimization, or upgrade to a lower-latency link"). This is the strongest individual screen in the module.

**16. ORANInteropCertCatalogPage (717 lines)** — Vendor-vendor compatibility matrix as HERO (RU rows × DU columns, 4-state cells: Certified ✓ / Limited ! / Incompatible ✗ / Untested –). Click a cell to filter the list. KPI strip with Total / Active / Expired / Expiring<90d / Unique Vendors / Combinations. Collapse-hidden recent certs table to keep matrix dominant. This is industry-leading UX — better than the typical operator vendor matrix in Excel.

**17. ORANInteropCertDetailPage (716 lines)** — View/edit/new tri-mode. 5 cards (A-Vendor Combination, B-Test Details, C-Cert Identity, D-Test Results, E-Documents). PDF upload via Dragger. Compatibility pill with symbol. **Missing:** sub-conformance results (cell-on, IDLE, RRC-CONNECTED, RACH, paging, handover, beam-switch), specific test-case ID mapping (TS 38.141 / TS 38.521), 3GPP release tracking (R16, R17, R18, R19), RAN-share / DSS / NSA-vs-SA breakdown.

**18. RUDUMappingListPage (514 lines)** — Excellent. 6 KPIs, 7-facet filtering (search, split, RU site type, technology, status, hub, region), interop badge inline (Certified/Uncertified pill), latency display as `measured / budget` with red-when-over-budget. Bulk import + export, row actions including "Run Readiness Check".

**19. RUDUMappingDetailPage (374 lines)** — KPI strip showing split + budget, hand-rolled SVG topology diagram (RU box → fronthaul line → DU box → midhaul dashed line → CU box) — clean, demo-worthy. 4 tabs (Overview with BR validations, Performance, Configuration, Audit). Status-aware action bar (Reactivate when Suspended, Suspend when Active, Decommission). Readiness check inline.

**20. RUDUMappingFormPage (543 lines)** — 6 sections (A-RU id, B-Target DU, C-Fronthaul, D-Split & Capacity, E-Interop, F-Status). Right-side sticky "Live Readiness Preview" running 7 BR checks (BR-CRN-001/003/004/005/006/009 + bandwidth). Dependent dropdowns: DU disabled until hub picked, fronthaul disabled until hub picked and filtered to matching RU-Hub pairs. Auto-fills `latencyBudgetUs` from `SPLIT_LATENCY_THRESHOLD_US[splitOption]`. Best-in-class form for telecom workflow.

**21. DUCUSoftwareVersionReportPage (653 lines)** — Already covered in section B. Note: matrix uses top 30 hubs by unit count; cell color logic (line 266-272) handles vulnerable (red), outdated mixed (amber), single-version (green), and mixed (amber). Bulk-plan-upgrade with checkbox row selection + sticky toolbar. Strong screen.

---

## D. Telecom Domain Validation — CRITICAL

### O-RAN Architecture

| Concept | In Module? | Quality | Notes |
|---|---|---|---|
| **7.2x lower-layer split (LLS)** | Yes | Adequate | Hardcoded in `SPLIT_LATENCY_THRESHOLD_US` map; appears in mapping form Radio.Group. No description of category-A vs category-B beamforming distinction (the 7.2x has two sub-flavors). |
| **OFH U-plane / C-plane / M-plane / S-plane** | No | Missing | These four sub-planes of the O-RAN 7.2x interface are not modeled at all. Real readiness checks include per-plane latency and per-plane reachability. |
| **O-RU** | Partial | Treated as generic "RU" — no distinction from L-RU (legacy CPRI RU), I-RU (integrated indoor), O-RU.1 vs O-RU.2 hardware classes. |
| **O-DU (real-time L1/L2)** | Yes | Reasonable | DU entity has `processingCapacityGOPS`, `maxCellsSupported`, `maxRuSupported`. No L1 acceleration card model (Intel ACC100, Marvell OCTEON, Qualcomm X100). No PHY-uplink/downlink-pipeline split. |
| **O-CU-CP** | Yes | Tracked via `cuType: CU-CP` enum. AMF connection field exists. |
| **O-CU-UP** | Yes | Tracked via `cuType: CU-UP`. UPF connection field exists. No SDAP/PDCP-U-specific config. |
| **E1 interface (CU-CP ↔ CU-UP)** | No | Missing entirely | Despite having both CU-CP and CU-UP entities, the E1 association is not modeled. Real deployments require explicit E1 link config. |
| **F1 interface (CU ↔ DU)** | Partial | The "Connected DUs" tab on CU detail page implies an F1 link, but F1-AP vs F1-U is not split, and there are no F1 transport settings (IP, port, security, max-PDU). |
| **E2 interface (RIC ↔ CU/DU)** | No | RIC architecture is not modeled at all. No xApp/rApp registration, no E2 node binding. |
| **O1 interface (SMO ↔ CU/DU/RU)** | No | NETCONF/YANG management plane completely absent. No PNF onboarding, no M-plane attachment, no software upgrade via O1. |
| **A1 interface (Non-RT RIC ↔ Near-RT RIC)** | No | Not modeled. |
| **NETCONF/YANG model compliance** | No | No YANG schema references, no model-version tracking, no capability discovery. |

**Verdict:** The module captures the *physical inventory* of an O-RAN deployment well but is **silent on the actual O-RAN interfaces and management plane** — which is where 80% of an O-RAN operations team's time is spent.

### Fronthaul

| Concept | In Module? | Notes |
|---|---|---|
| **eCPRI vs CPRI** | Yes | `FRONTHAUL_PROTOCOLS` enum includes both. |
| **WDM (CWDM, DWDM)** | Partial | `linkType` enum includes "WDM" but no CWDM/DWDM split, no wavelength-grid management, no DWDM channel allocation. The `wavelengthNm` is a free number field. |
| **Dark fiber** | Yes | `Dark Fiber` link type, OK. |
| **Latency budget <100μs U-plane** | Yes | `SPLIT_LATENCY_THRESHOLD_US['7.2x']` referenced in readiness checks. Reasonable. |
| **PTP G.8275.1, SyncE** | No | Synchronization is entirely absent. Critical gap — fronthaul without sync analysis is non-actionable. |
| **Cell-site router (CSR)** | No | Not modeled. |
| **xHaul** | No | The module separates fronthaul from midhaul/backhaul but doesn't model the converged xHaul case where one transport carries all three. |

**Verdict:** Fronthaul *commercial* attributes (cost, contract, provider) are well-modeled; *transport-engineering* attributes (sync, optical budget, FEC, MTU, CoS) are mostly missing.

### Capacity Resources

DU slots and CU slots are tracked as integer counts. This is appropriate for purpose-built BBU appliances (a 3U vDU-5300 occupies "1 DU slot") but **breaks down for true vRAN**, where the resource model is vCPU, RAM, hugepages, SR-IOV VFs, accelerator instances, and bandwidth on the SmartNIC. The capacity planner has no concept of these. Compare to Mavenir Web-Scale Cloud RAN, which exposes per-cell resource budgets in CPU-ms/TTI, accelerator-slot-equivalents, and bandwidth-on-OFH-pipe.

Power and rack U budgets are correct primitives. Cooling is modeled as a linear 85% of power draw (`HubSiteCapacityPlannerPage.tsx` line 265). Real cooling planning uses ASHRAE thermal envelope curves, hot-aisle/cold-aisle layouts, PUE (Power Usage Effectiveness), and seasonal derate. The 85% heuristic is fine for an MVP.

### Software

Vendors enum (`DU_VENDORS`) referenced in multiple files includes Samsung, Nokia, Ericsson, Mavenir, NEC. RU vendors and CU vendors are separately enumerated. Software version is a simple semver-like string (`v23.2.0`). Image management and A/B partitioning are *not* modeled. Rolling-upgrade semantics are not modeled — the bulk-upgrade action is a single atomic SW-version write across N units.

### RIC (RAN Intelligent Controller)

**Completely absent.** There is no Non-RT RIC, Near-RT RIC, xApp, rApp, conflict-mitigation, or A1 policy modeling. For a 2026 module claiming "O-RAN" identity, this is a substantial gap. Even a basic xApp catalog and Near-RT RIC node inventory would be expected.

### Cloud Infrastructure

`platformType: 'Bare Metal' | 'VM' | 'Container'` is a single field. The CU detail page conditionally shows hypervisor/orchestration/container-runtime. There is no:
- Kubernetes cluster model
- OpenStack project / availability zone
- COTS hardware inventory (Dell PowerEdge model, HPE ProLiant, Supermicro)
- Accelerator card inventory at the host level
- Multus / SR-IOV / DPDK config
- CNF lifecycle vs VNF lifecycle distinction

A real production Mavenir/Rakuten deployment would expose all of this. The module's level of cloud abstraction is approximately 2018-era and predates current CNF-on-K8s norms.

---

## E. Data Review

- **Capacity heatmap (top 30 hubs × 5 resources):** Useful. The 6-bucket color scale (`heatColor` function in `CRANDashboard.tsx` lines 77-84) progresses through grey → light green → green → yellow → red → solid red, with clear cutoffs at 25/50/70/85/100%. Limitation: hard cap at 30 hubs means most of a national fleet is invisible. Recommend infinite scroll or virtualized scroll with sort-by-resource selector.
- **Approaching-capacity list with MiniPct chips:** 5 micro-percentage chips (R/P/C/DU/CU) per row. Compact and useful. 12-row cap is fine.
- **Pipeline Gantt:** Date axis labels are correct (`toLocaleString` short month + 2-digit year, line 979). Visible plan name and approval status pill. Static date-window calc from min(create dates) and max(target dates) ±1 month is reasonable. Issues: no drag-to-reschedule, no critical-path overlay, no resource-conflict highlighting.
- **Software mismatch detection algorithm:** Groups by `hubId + vendor + model` and reports any group with multiple distinct `softwareVersion` values. Correct per BR-CRN-008. Limitations: ignores model-family equivalence (e.g. Samsung vDU-5300 v23.2.0 might be equivalent to vDU-5500 v23.2.0 for compatibility purposes); no automatic remediation suggestion ranked by impact.
- **Fronthaul latency μs color-coded thresholds:** >90μs red, >75μs amber, else green (used inline in `CRANDetailPage.tsx` line 736 and `FronthaulLinkListPage.tsx` line 229). These thresholds don't match the actual split-option-aware budget — a split-2 (PDCP/RLC) connection has a ~10ms budget, not 100μs. The check `measuredLatencyUs > thresholdSpecificToSplit` exists in `checkRUDUReadiness` but is not reflected in the table cell color.
- **5 CapacityGauge semicircles on detail page:** Visually strong, semicircular SVG with reserve-margin tick. Component is reused on the form preview sidebar — good factoring.

---

## F. Scalability Review

| Scenario | Current Behavior | Verdict |
|---|---|---|
| **Heatmap at 1000+ hubs** | Hardcoded `slice(0, 30)`. | Fails — would need server-side aggregation + virtualization. |
| **DU forms at 10K+ units** | Form is a single instance per DU. List page paginates at 25/50/100 per page via AntD Table. | OK for form; list will need server-side pagination, not client-side. Currently calls `useEntityList('duUnits', { pageSize: 5000 })` (CRANDashboard.tsx line 108) which is a 5K client-side fetch — fine for mock, won't scale. |
| **Software version report at 50K+ instances** | Aggregates client-side in `useMemo`. Matrix limited to top 30 hubs. | Fails at 50K — the inconsistency calculation is O(N) but the per-hub matrix expansion grows. Needs server-side rollup. |
| **Fronthaul links at 100K+** | Client-side filter + sort. CSV export iterates entire rows array. | Fails. CSV export at 100K rows would produce a 50MB+ string and lock the browser. |
| **Rack layout SVG (per-rack U-grid)** | Renders all racks at a hub side-by-side (`CRANDetailPage.tsx` lines 247-318). At 8+ racks the SVG width exceeds 1500px; horizontal overflow scroll is enabled. | OK up to ~10 racks per hub. Beyond that, would need pagination or zoom. |

**Verdict:** The module's data flow patterns are appropriate for a single-tenant, ~500-hub demo. Going from there to a real Tier-1 operator scale (5,000–20,000 hubs, 100,000+ DUs/CUs, 1M+ RUs, 200K+ fronthaul links) would require server-side aggregation, lazy-loaded queries, and a streaming data layer.

---

## G. AI Opportunities

1. **AI capacity prediction:** Replace the linear power-vs-cooling model with an ML-trained predictor that accounts for traffic profile, seasonal, and per-vendor power draw. Forecast time-to-saturation per resource per hub.
2. **xApp/rApp recommendation engine:** Given a hub's measured KPIs (handover failures, energy-per-bit, beam-conflict events), recommend specific xApps from a marketplace (e.g. "deploy SMO-based energy-saving rApp X for hubs with <40% night-time PRB utilization").
3. **Software compatibility prediction:** Given an upgrade plan, predict the probability of feature-incompatibility based on historical patterns in the cert catalog and field-reported issues.
4. **Anomaly detection on fronthaul latency:** Time-series anomaly detection on the per-link p99 latency series to catch optical-path degradation before it triggers a BR-CRN-001 fail.
5. **Resource allocation optimization:** Given a forecasted demand (new cells in a coverage area), optimize which DUs at which hubs to assign, minimizing power+rack subject to latency constraints. NP-hard in general but ML approximations work well in practice.
6. **Multi-vendor interop prediction:** Given a vendor pair never seen in the cert catalog, predict the likely test outcome based on shared specifications, ML on certified-combination features.

The module already has the `AIInsightCard` and an "AI Briefing" callout in the dashboard — but it is heuristic. There's a clear product runway to make these real.

---

## H. UX & Visualization Improvements

- **Network topology view:** A graph of CU ↔ DU ↔ RU relationships overlaid on geography. Today the topology is rendered only at the per-mapping level (the SVG in `RUDUMappingDetailPage.tsx` line 70). A hub-level or region-level view would let an operator see "which CU pool serves which DU cluster across which fronthaul fabric".
- **Rack 3D view:** Current 2D rack-elevation SVG works. A 3D isometric rack with cable color-coding is a common ask in operator demos. Three.js can render this in <300 lines.
- **Cable management visualization:** Front-of-rack vs back-of-rack cable routes, fiber patch panel positions, and breakout cassette layouts. Currently zero.
- **Fronthaul network map:** Geographic map with fiber paths drawn between RU sites and hub sites, color-coded by latency utilization. Strongly complements the list view.
- **xApp/rApp marketplace:** A catalog UI for xApps/rApps with version, vendor, conformance to E2-SM/A1-policy, deployed instances.
- **TabBarV2 with 10 tabs and 6-cap overflow:** The current hub detail uses TabBarV2 with `primaryCap: 6` (line 1157 of CRANDetailPage.tsx). The 4 overflow tabs (Software, Audit, Rack, Power) are equally important to the primary set. Consider an "Operations" sub-grouping vs "Inventory" sub-grouping instead of straight overflow.

---

## I. Technical Architecture

- **SMO integration:** Not modeled. SMO (Service Management and Orchestration, per O-RAN WG2) is the parent system that owns O1, A1, R1 interfaces and would in production own the inventory the CRAN module displays. A real implementation needs a SMO-northbound API.
- **ONAP / ONOS / Nephio integration:** None. Nephio (Kubernetes-native CNF orchestration) would be the natural fit for the vRAN deployments this module aspires to represent.
- **NETCONF/YANG modeling:** Absent. A real CRAN inventory tool would expose per-vendor YANG models, browse capability sets, and render config diffs.
- **O1 interface implementation:** Absent. Software upgrade, fault reporting, performance counters, and CM-data export all go via O1 in O-RAN deployments.
- **xApp/rApp lifecycle management:** Absent.
- **Multi-vendor interop testing framework:** The cert catalog is a *registry* of test results. There is no test-execution framework — the page assumes test results arrive from elsewhere.

---

## SCORING

| Dimension | Score | Justification |
|---|---:|---|
| **Workflow Completeness** | 7/10 | Hub lifecycle, DU/CU CRUD, expansion plans, RU-DU mapping, fronthaul, O-RAN cert, software report all present and most interconnect properly. Missing: real upgrade orchestration, RIC, SMO, OAM activation. |
| **UX Sophistication** | 9/10 | Compatibility matrix, readiness checker, mini topology SVG, capacity planner side-by-side bars, software version matrix, capacity gauges — all polished and operator-grade. Glass/AMBIENT_BG design system is consistently applied. |
| **Telecom Domain Accuracy** | 6/10 | Strong on hub/DU/CU/RU/fronthaul physical inventory. Weak on O-RAN interfaces (E1/F1/E2/O1/A1/M-plane), sync (PTP/SyncE), RIC, vRAN resource pooling. Architecture vs topology vs interface-compliance conflation. |
| **Data Intelligence** | 7/10 | BR-CRN-008 inconsistency detection, readiness composite checks, capacity-vs-reserve thresholds, expansion-plan resource math are all correct. Latency thresholds inconsistently applied (table cell uses 90/75 hardcode, not split-aware). |
| **Scalability Readiness** | 5/10 | Client-side aggregation at every step. Hardcoded top-30 caps. CSV export iterates whole arrays. Would need significant rework for Tier-1 scale. |
| **AI Readiness** | 5/10 | AIInsightCard placeholder exists, but no actual ML, no time-series store, no recommendation engine. Six clear product opportunities listed in section G. |
| **Overall** | **6.8/10** | Demo-grade module with several best-in-class screens (readiness checker, O-RAN matrix, SW report) and a substantial domain gap on the O-RAN management plane and RIC. |

---

## TOP 10 PRIORITY FIXES

1. **Disentangle architecture / topology / software facets.** Replace the single `architecture: 'O-RAN' | 'vRAN' | 'C-RAN'` radio with three independent booleans (`isCentralizedTopology`, `isVirtualized`, `isORanCompliant`). Update filters and pills throughout. Cite Rakuten Mobile production as exemplar.
2. **Add E1, F1, E2, O1, A1 interface modeling.** Even a basic representation (interface type, endpoint, status, last-handshake) would dramatically improve operator value. Today the module has CU-CP and CU-UP entities but no E1 link binding them. Add a new entity `interfaceLinks` with fk to CU/DU/RU/RIC nodes.
3. **Fix the synthesized Connected RUs and Fronthaul Links tabs on the hub detail page.** They currently fabricate data from DU records (lines 715-744 + 763-798 of CRANDetailPage.tsx) instead of reading the real `ruDuMappings` and `fronthaulLinks` collections that exist in the same module. Replace with actual joins.
4. **Add PTP (G.8275.1/.2) and SyncE synchronization model.** Hub site form should expose PTP grandmaster role, boundary clock count, SyncE source/sink topology. Fronthaul link should expose PTP profile and measured 1pps deviation.
5. **Add RIC (Non-RT and Near-RT) entities + xApp/rApp catalog.** A new module section `/cran/ric` with two list pages and a marketplace catalog of xApps/rApps. Required for any 2026-era O-RAN identity claim.
6. **Wire bulk software upgrade through a real upgrade plan workflow** — not an instant DB write. Add `softwareUpgradePlans` entity with windows, canary group, rollback support, dependency tree, maintenance-window enforcement, and integration with the existing expansion-plan approval pattern.
7. **Replace hardcoded latency thresholds (90/75 μs) with split-option-aware thresholds in every cell renderer.** The function `SPLIT_LATENCY_THRESHOLD_US[mapping.splitOption]` already exists in `cranData` and is used in readiness; extend its use to the dashboard's Connected RUs synthetic table and Fronthaul detail's KPI conditional color.
8. **Add server-side pagination + aggregation for fleet-scale.** `useEntityList('duUnits', { pageSize: 5000 })` must become a paginated query. Heatmap and software matrix need server-rolled-up endpoints.
9. **Add accelerator-card inventory at the DU/CU level.** Intel ACC100 / Marvell OCTEON / Qualcomm X100 / NVIDIA Aerial detection, count, firmware. Real vRAN deployments live and die by accelerator compatibility.
10. **Add SMO northbound integration model** — at minimum, a settings page where a Service Management and Orchestration endpoint URL, OAuth credentials, and connectivity-status indicator are configured. Without this the module is an inventory database, not an operations tool.

---

## Comparative Benchmarks

| Competitor | What They Do Better | Where This Module Wins |
|---|---|---|
| **Ericsson Cloud RAN** | Full BBU pooling resource model; PTP/SyncE topology; F1/E1/X2/N2/N3 monitoring; integrated SON | Cleaner UI; better O-RAN cert catalog matrix |
| **Nokia Cloud RAN** | NetAct integration; complete OAM (FCAPS) coverage; LTE+NR coexistence model | More approachable; better information density per screen |
| **Mavenir Web-Scale Cloud RAN** | True K8s-native CU/DU; vRAN resource pooling (CPU/accel/mem); E2/A1/R1 interfaces | Better hub-site-centric mental model; superior capacity planner UX |
| **Rakuten Symphony Symworld** | Multi-vendor disaggregation maturity; SMO-first design; xApp/rApp marketplace integration | Better individual screens (readiness checker is class-leading); compatibility matrix UX |
| **Parallel Wireless OpenRAN** | OAM via NETCONF/YANG; per-vendor adapter pattern; full lifecycle from RFQ to retire | Cleaner data design; stronger BR-rule referencing |
| **Altiostar (now Rakuten)** | Active-active CU-pool, dynamic DU-CU re-association | Stronger physical-inventory model |
| **Samsung vRAN** | Field-tested at Verizon scale; integrated SON | Better visualizations and information architecture |
| **NEC OREX** | True multi-vendor interop test framework with executable test cases | Better catalog/registry UX |

---

## File-path index of every screen reviewed

- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/CRANDashboard.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/CRANDetailPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/CRANListPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/HubSiteFormPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/HubSiteCapacityPlannerPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/HubSiteExpansionPlanPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/DUUnitListPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/DUUnitDetailPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/DUUnitFormPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/CUUnitListPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/CUUnitDetailPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/CUUnitFormPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/FronthaulLinkListPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/FronthaulLinkDetailPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/FronthaulReadinessCheckerPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/ORANInteropCertCatalogPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/ORANInteropCertDetailPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/RUDUMappingListPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/RUDUMappingDetailPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/RUDUMappingFormPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/pages/DUCUSoftwareVersionReportPage.tsx`

Supporting:
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/lib/cranData.ts` (60131 bytes, data types, seed factories, color palette)
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/cran-vran/lib/cranActions.ts` (69341 bytes, mutation hooks)
