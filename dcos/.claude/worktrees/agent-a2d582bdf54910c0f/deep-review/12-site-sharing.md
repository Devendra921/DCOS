# SITE SHARING MODULE — DEEP REVIEW (Tower Co-location & Site Sharing)

**Reviewer perspective:** 20+ years across tower companies (American Tower, Crown Castle, SBA, Indus, Helios, Cellnex) and operator-side leasing/colocation teams.
**Benchmark products:** American Tower SiteMaster, Sitetracker (Salesforce), Aurigo Masterworks, ATC Tower Genius, Crown Castle CCSiteRent, Cellnex MyLink.
**Scope reviewed:** 21 pages, 6 lib files (data + actions + types + common), ~565 KB of TSX (largest single page: `OperatorAllocationListPage.tsx` at 1,341 LOC).
**Verdict (TL;DR):** The module is unusually broad and well-organized for an in-progress demo, with clean separation across the four canonical entities (`SHARING_AGREEMENT`, `OPERATOR_ALLOCATION`, `CO_LOCATION_REQUEST`, `SHARED_INFRASTRUCTURE`) and a credible BR-rule registry. It nails the workflow scaffolding (multi-party approvals, decom checklist, renewals timeline) and ships the only convincing tower-side-view SVG I've seen in an early-stage RAN tool. However, it is missing or under-modeled in seven domains that are non-negotiable for real tower-co/operator deployments: structural engineering rigor (kN·m, EIA-222/ TIA-222 wind, IBC seismic), RF interference (PIM/IM3/decoupling distance), MLA/MSA contract hierarchy, revenue recognition (ASC 842/IFRS 16), cost allocation back to operator P&L, antenna decoupling math, ground-lease pass-through, and operations (work-order/permit/access management). Most pages are demo-quality renders rather than production CRUD; only the data layer and the page count create the illusion of operational depth.

---

## A. Architectural Layout & Domain Coverage

The folder structure follows the BRD's 4-entity model strictly, with a 5th convenience entity (`SharedSiteExtension`) overlaying the canonical Site record. This is the right pattern — tower-co systems virtually always treat sharing as a layer on top of the site master, not a replacement for it. The `lib/` split (`agreementData`/`agreementActions`, `allocationData`/`allocationActions`, `coLocationRequestData`/`coLocationRequestActions`, `infraData`/`infraActions`, plus `sharingCommon` and `sharingTypes`) is clean.

The 21 pages map to 21 SCR IDs from the BRD, which is impressive coverage. Routes are well-scoped under `/sharing/*`. The module renders five sharing models (`passive`, `MORAN`, `MOCN`, `roaming_based`, `national_roaming`), which is correct industry vocabulary. The 8 resource dimensions on the tower-capacity monitor (`tower_height`, `tower_load_kg`, `shelter_sqm`, `rack_units`, `power_kw`, `ground_sqm`, `antenna_ports`, `cable_tray_runs`) are appropriate; only `feeder_aperture` (cable port count through the tower-base hatch) is missing from the BIG-8.

What is missing structurally:

1. **No MLA (Master Lease Agreement) / MSA contract hierarchy.** Real tower-cos sign one MLA per operator at the corporate level, then issue site-level Site Lease Supplements (SLS) per location. This module treats every `SharingAgreement` as a per-site contract; there is no `MasterAgreement` parent entity. Crown Castle and ATC both model this explicitly because audit, ARR roll-up, and corporate-level price negotiations depend on it.
2. **No `GroundLease` entity.** Tower-cos lease the ground from a landowner (typically a 99-year ground lease with rent escalation), then sub-lease tower capacity to operators. There is no representation of the underlying ground lease, the landowner, or pass-through rent. This is the #1 cost line in tower-co P&L.
3. **No `WorkOrder` / `Permit` / `SiteAccess` entities.** Once a colo request is approved, real systems trigger a permit-pulling sub-workflow (FAA Form 7460 for tower modifications, FCC ASR, local zoning, structural sign-off) plus contractor work orders. None of this exists.
4. **No `Tenant` separate from `Operator`.** Some tower-cos host non-operator tenants (broadcasters, public-safety agencies, IoT/private-network customers, utilities). The hard-coded `OPERATORS: OrgRef[]` array in `sharingCommon.ts` (6 operators) precludes this.
5. **Single-currency assumption baked in everywhere.** `SharingAgreement.currency` exists but most revenue calcs in `SharingRevenueDashboardPage` use `fmtCurrency(mrr)` without currency parameter, defaulting to USD. Multi-country tower portfolios cannot be aggregated this way.

---

## B. Tower Capacity Monitoring (TowerCapacityMonitorPage)

`/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/pages/TowerCapacityMonitorPage.tsx` is the strongest single page in the module. The composite-gauge UX (Structural / Spatial / Electrical, expandable inline to the 7 sub-dimensions) is the right interaction model for a tower-co dashboard — it matches the mental model of a structural engineer first, an asset manager second. The single-site dropdown rather than a portfolio view is the right choice for a deep-inspection page.

Critical gaps:

- **The "1 more operator" recommendation at line 287 is dangerous oversimplification.** Real headroom math has to consider: (a) the worst-case loaded operator's wind-loaded EPA (Effective Projected Area, m²), not just kg; (b) torsional moment about the tower centerline (not just vertical load); (c) feeder routing space; (d) shelter HVAC headroom (not just floor space); (e) DC plant string capacity (not just kW). A site can have 200 kg of mass headroom but zero kN·m torsional headroom because the next operator's antenna is asymmetric.
- **Power dimension is single-figure kW; missing UPS/battery autonomy, generator runtime, ATS capacity, DC plant (-48 V) vs AC pass-through.** A real "Power" composite needs at minimum: AC main breaker rating (A), UPS kVA + autonomy minutes, generator kW + fuel autonomy hours, DC rectifier capacity (A @ 53.5 V), battery string Ah + reserve hours. The single `capacityPowerKw` masks the actual constraint.
- **No antenna mount type dimension.** Operators install on a mix of T-arms, pipe mounts, sector frames, RRH brackets, and FRP shrouds. Each consumes both load capacity and mounting real-estate (which is itself a constrained resource — a 3-sector tower has 3 azimuth slots × 3-5 height slots).
- **`breachedResources.length > 0` alert uses `util >= 100` which fires only at saturation.** Industry practice is to alert at 80% (BR-SHR-002 already does this for structural; the BR-SHR-001 monitor should apply the same warn-at-80%, alarm-at-95%, hard-stop-at-100% pattern).
- **No historic trend on capacity utilization.** A capacity monitor that can't show "rack-units consumed over last 12 months" is decorative, not operational.

---

## C. Operator Allocation List (OperatorAllocationListPage, OperatorAllocationVisualPage)

`/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/pages/OperatorAllocationListPage.tsx` (1,341 LOC) is the canonical page; `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/pages/OperatorAllocationVisualPage.tsx` (24 LOC) is a shim that pre-sets the Visual view. The shim pattern is acceptable as a route-stability fix, but the consequence is the entire visual presentation now lives inside the list page, which is over-coupled: a single 1,341-LOC component owns KPI strip, filter chips, table, segmented toggle, hero SVG, four rail widgets (Shelter / Power / Rack / Ground), a drawer, and a side-view tower SVG with 8 helper sub-components. **This file is the #1 maintenance liability in the module.** It needs to be decomposed into ~6 sibling files: `AllocationListView`, `AllocationVisualView`, `TowerSideView`, `ShelterCompact`, `PowerCompact`, `RackCompact`, `GroundCompact`, `AllocationDrawer`.

The visual hero (lines 989–1103) is genuinely strong. The lattice tower SVG with cross-braces, height ticks every 10 m, operator-colored bands extending past the tower silhouette, antenna count rendered as small bars to the right, and a load gauge at the base is the most operator/tower-co–realistic SVG I've seen in any RAN demo. Real American Tower SiteMaster screens look exactly like this. The 1 m spacing minimum (`BR_DEFAULTS.minHeightSeparationM = 3` — actually 3 m, not 1 m per the user's prompt; the BRD value is consistent at 3 m) is correctly enforced in the height-conflict KPI (lines 376–395).

Gaps:

- **Antenna count capped at 4 in the SVG renderer** (line 1062: `Math.min(a.antennaCount || 0, 4)`). A real 5G NR macro typically has 3 sectors × 4 antennas (12 panels) per operator. The 4-cap is a silent visual lie.
- **`useOperatorAllocationActionsScoped` (lines 424–434) bypasses the proper actions hook and writes directly to `db.update`.** Comment admits "simulate hook call by writing directly." This breaks audit-trail logging and any side-effects on related entities (e.g., agreement-status recalculation). It's a demo shortcut that will rot.
- **No azimuth dimension.** Operators don't just occupy a height band — they occupy a specific sector (typically 3 × 120° azimuths). The tower visualization shows only vertical bands; a real allocation needs (height_from, height_to, azimuth_from°, azimuth_to°, mount_type).
- **No frequency band on allocation.** Each operator typically has 4–6 spectrum bands (700, 850, 1900, 2100, 3500, 28000 MHz). The allocation should carry the band list to support PIM/IM3 analysis (see Section H).

---

## D. Co-location Request Lifecycle

The lifecycle (`CoLocationRequestListPage`, `CoLocationRequestDetailPage`, `CoLocationRequestFormPage`, `CoLocationFeasibilityAssessmentPage`, `CoLocationApprovalWorkflowPage`, `StructuralAnalysisTrackerPage`) is the strongest workflow in the module. The 7-stage funnel (submitted → feasibility → structural → approval → approved → build → accepted) matches real tower-co cycle-time tracking. The `coloWorkflowState()` function (lines 70–114 of `CoLocationRequestDetailPage`) correctly handles rejected and withdrawn edge cases by mapping them to `'failed'`/`'skipped'` `StepState`s rather than pretending they're linear.

The 4-step form (`CoLocationRequestFormPage`: Site & Operators → Scope & Technology → Resources → Timeline & Cost) with a sticky live-feasibility sidebar is exactly the pattern Sitetracker uses. The structural-required warning (lines 390–410) fires reactively when load exceeds the BR-SHR-002 threshold, which is correct UX. The localStorage draft persistence (`DRAFT_KEY`, lines 164–210) is a nice touch.

Feasibility (`CoLocationFeasibilityAssessmentPage`): the 6-gauge hero + verdict tags (Pass/Tight/Fail per dimension) is operator-friendly. The auto-recommended-status footer (line 209–213) is appropriate transparency.

Approval (`CoLocationApprovalWorkflowPage`): the Kanban board (Awaiting Host / Tower Owner / Existing Operator / Approved) is the right asynchronous representation. The internal-vs-external badge (lines 250–259) on each approval lane is a thoughtful UX detail: it correctly signals to the user that Tower Owner and Existing Operator decisions arrive by email/letter and need to be recorded into the system, not adjudicated within it. This is exactly how real multi-party tower approvals work.

Critical gaps:

- **No SLA escalation paths.** When `slaBreached === true`, the system shows a red tag, but there's no auto-escalation, no notification to a manager, no SLA breach cost calculation. Crown Castle's system auto-escalates to VP-level after 14 days past SLA.
- **No "Make Ready" cost estimation.** A real co-lo request involves a "Make Ready" (MR) cost estimate that the tower-co provides to the operator: structural reinforcement, antenna mount fabrication, cable tray extension, additional rectifier, etc. The form has `estimatedCost` as a single number; real systems have a line-item MR estimate sub-form.
- **No structural analysis input form.** The `StructuralAnalysisTrackerPage` records vendor and result (adequate/reinforcement_needed/not_suitable) but the inputs that drive the result (additional EPA m², projected antenna weights, mount torque, wind zone, ice loading, seismic zone, soil bearing) are not modeled. The histogram (lines 72–109) is decorative.
- **No FCC ASR / FAA 7460 / local-zoning permit tracking.** Approval workflow assumes only three parties; real US tower modifications require FAA notification (if height changes >1 m or near airports), FCC ASR update (if tower lighting/registration affected), and municipal zoning review. None of this is modeled.

---

## E. Sharing Agreements & Renewals

`SharingAgreementListPage`, `SharingAgreementDetailPage`, `SharingAgreementFormPage`, `AgreementRenewalManagerPage`. This sub-domain is moderately well-built. The 5-step form (Parties → Model → Dates → Financial → Documents) with a sticky validation sidebar that surfaces BR-SHR-007 (MORAN/MOCN need spectrum coordination doc) and BR-SHR-014 (no overlap for same site+operator) is good. The escalation projection (`projectEscalatedFees` in `agreementActions`) is correctly compounded year-over-year on the detail page.

The renewal manager Gantt + side-by-side action table (`AgreementRenewalManagerPage` lines 588–681) is the right visualization for someone running a portfolio of 500+ agreements. The 18-month timeline window with 30/90/180-day urgency bands and clickable ticks that scroll to the action row is a thoughtful interaction.

Critical gaps:

- **No "anchor tenant" vs "co-tenant" distinction.** In real MLAs, the anchor tenant (usually the first operator on the tower) gets favorable terms — lower base rent, fewer escalations, ROFR (Right of First Refusal) on the next co-locator, and sometimes a "vacancy clause" that lets them out if the tower-co adds a competitor. There's no `tenantRank: 'anchor' | 'co-tenant'` field.
- **Escalation is fixed-percent or CPI-linked only.** Real escalations use blended formulas: max(CPI, 3%), or fixed step-ups (years 1–5 at 3%, then renegotiated). The `EscalationType` enum doesn't accommodate the common "floor + index" pattern.
- **No revenue recognition (ASC 842 / IFRS 16) accounting.** Tower-co rent is straight-lined over the lease term for accounting. The system shows monthly cash MRR; there is no "straight-lined revenue" calculation, no deferred rent asset, no lease incentive amortization. For any tower-co with audited financials, this is a hard requirement.
- **No security deposit lifecycle.** `securityDeposit` is captured at create time but there's no return-on-termination logic, no LOC vs cash distinction, no interest-bearing escrow tracking.
- **`SharingAgreementListPage` `originalAgreementId` lineage walker (lines 154–177)** is O(n²) per render — walks the whole `getAllAgreements()` array for each `find()` call inside a `while` loop. For a portfolio of 10,000 agreements, this is a 100M-op render. Build a Map<id, agreement> outside the loop.
- **Termination logic is missing notice-period validation.** `actions.terminate()` is called without checking that today + notice-period ≤ lease-end-date. Operators commonly try to terminate inside the notice window to dodge holdover rent; the system has no guardrail.

---

## F. Revenue & Financial

`SharingRevenueDashboardPage` is visually polished but financially shallow. The 24-month historical + 12-month forecast MRR chart with escalation event markers is a nice display. The AR/aging panel and per-operator/per-site bars are conventional.

What is missing for real tower-co finance:

- **No CapEx vs OpEx breakdown.** Tower-cos invest CapEx (steel, foundation, equipment) once and recover via OpEx (rent) over 15–30 years. There's no CapEx-recovery tracker, no IRR per site, no payback period.
- **No cost-side accounting.** The header has a `<Segmented value="revenue" options={[{label: 'Revenue', value: 'revenue'}]} />` at line 241–246 — a single-option segmented control. This is a stub for a planned Revenue vs Cost toggle that doesn't exist yet. From the operator perspective, this page should show *cost* (rent paid), not revenue.
- **Outstanding balances are randomly generated** (`seededFloat(seed, 1)` — line 116). There is no real invoicing entity. Production systems integrate with NetSuite, Oracle Financials, or a billing platform.
- **No bad-debt / collections workflow.** Tower-cos write off 1–2% of receivables annually; there's no aging-bucket waterfall, no collections agent assignment, no settlement-discount tracking.
- **Currency aggregation is naive.** `mrr` adds `monthlyFee` across all active agreements regardless of currency. A multi-country tower-co needs FX normalization to a reporting currency.

---

## G. Structural & Height-Slot Interference

`StructuralAnalysisTrackerPage` and `HeightSlotInterferenceViewPage`. The histogram visualization of tower-load utilization (`StructuralAnalysisTrackerPage` lines 72–109) is conceptually right but the underlying model is one-dimensional: it tracks only `(currentLoadKg + additionalKg) / designLoadCapacityKg`. Real structural analysis requires:

- **Wind loading per EIA/TIA-222 Rev H or Rev G.** Inputs: site wind zone (90/100/110/150 mph basic wind speed), exposure category (B/C/D), topographic factor, ice loading (0.25" / 0.5" / 1.0" radial ice + 30/40/50 mph wind on ice), structure class (I/II/III).
- **Seismic loading per ASCE 7-16.** Site class, S_DS, S_D1, importance factor.
- **Foundation analysis.** Drilled pier vs spread footing vs mat foundation, soil bearing capacity, frost depth, overturning moment ratio.
- **Member-level stress analysis.** Each tower leg and brace has a unique demand/capacity ratio (DCR); a tower at 78% "utilization" may have one leg at 102% DCR.
- **Antenna-by-antenna EPA contribution.** Not just total weight — wind-loaded surface area in m² per antenna at its mount height.

The `BR_DEFAULTS.structuralThresholdKg = 200` and `structuralDesignLoadPct = 80` constants are reasonable triggers but the threshold-based logic is a marketing simplification, not engineering. A real tower-co commissions a structural mod report for any new load > 0 (some operators only); the 200 kg threshold would be considered legally indefensible if a tower failed below it.

`HeightSlotInterferenceViewPage` correctly enforces BR-SHR-006's 3 m minimum vertical separation (`BR_DEFAULTS.minHeightSeparationM = 3`). The N×N separation matrix and tower side-view with separation labels are appropriate visualizations. However:

- **3 m vertical separation is not a universal RF rule** — it's an industry rule of thumb for similar-band omni antennas. For directional sector antennas with >25 dB front-to-back ratio, 1 m can be sufficient; for high-power TX antennas adjacent to LNA-protected RX antennas, 5 m may be insufficient. The decoupling math is band-, beamwidth-, and EIRP-dependent.
- **No IM3 (third-order intermodulation) analysis.** When two operators TX on adjacent bands through the same mounting structure, PIM (passive intermodulation) products can fall in-band on a third operator's RX. Real co-location requires a PIM analysis (typically -150 dBc spec on connectors, -140 dBc on mounts). Not modeled at all.
- **No PIM-rated hardware tracking.** Did the operator install PIM-rated jumper cables and PIM-rated mounts? Not captured.
- **"Flag for RF Engineering Review" button** writes a flag but the RF Engineering review entity doesn't exist anywhere else in the module. It's a dead-end button — the workflow doesn't continue.

---

## H. Shared Infrastructure & Operations

`SharedInfrastructureListPage`, `SharedInfrastructureDetailPage`. The 13 infrastructure types (`tower`, `shelter`, `fence`, `access_road`, `power_system`, `grounding`, `aviation_light`, `compound`, `cable_tray`, `air_conditioning`, `fire_suppression`, `generator`, `fuel_tank`) are a reasonable taxonomy. The 6-tab detail page (Overview, Capacity & Load, Maintenance, Inspections, Cost Sharing, Audit) is well-structured.

The maintenance-responsibility model (owner / host_operator / shared_proportional / third_party_contractor) with BR-SHR-012 enforcement is correct. The cost-sharing models (owner_bears_all / equal_split / proportional_to_usage / per_agreement) are the four standard patterns.

What's missing for real operations:

- **No work-order management.** Maintenance is tracked only as "scheduled / under_maintenance" status. There's no work-order ID, no assigned technician, no parts list, no labor hours, no escalation when overdue.
- **No site access management.** Operators visit tower sites monthly; access requires a Site Access Request (SAR), a security escort schedule, a key/lockbox combination, NOC notification, and aviation-light de-energization for tower climbs. None modeled.
- **No NERC / OSHA / RF-exposure compliance.** Tower climbers require RF safety training (FCC OET-65 maximum permissible exposure), fall-protection certification, and pre-climb hazard assessment. Pure compliance fields like `nextRfExposureSurveyDate`, `aviationLightTestDate`, `groundingTestDate` (per IEEE 80) are missing.
- **No backup power runtime tracking.** Generators need monthly load-bank test logs, fuel-tank fill records, battery impedance tests. The `infrastructure_type: 'generator'` record has no runtime fields.

`OperatorDecommissioningWorkflowPage` (decom): the 7-step checklist pattern is right; the cost-reallocation preview table (lines 502–540) is a thoughtful UX feature — it forecasts what remaining operators' fees become if equal-split applies. But the production checklist would have 20+ steps including: equipment removal scheduling, hazardous material (battery, dehydrator desiccant) disposal certification, RF safety re-survey, structural revalidation (load decreases too), aviation-light reconfiguration if antenna removed from top, FAA notification, FCC ASR update if applicable. The 7 generic steps are placeholders.

---

## I. Cross-cutting issues, data model, and SCR coverage

**Type safety:** Most modules use `db.getAllRaw(...) as unknown as SharingAgreement[]`. The double-cast pattern is everywhere — it works but defeats the type system. A typed `db` adapter (`db.getAllRaw<SharingAgreement>('sharingAgreements')`) would eliminate ~200 `as unknown as` casts.

**Date constants:** `const TODAY = new Date('2026-05-15')` appears hard-coded in `CoLocationRequestListPage` (line 42), `CoLocationApprovalWorkflowPage` (line 41), `SharingRevenueDashboardPage` (line 61: `const todayIso = '2026-05-15'`), `SharedInfrastructureListPage` (line 88), and `OperatorDecommissioningWorkflowPage` (line 103). This is a demo seed-date that has leaked into 6+ files. A single `getCurrentDate()` helper should be the only place this lives.

**Stub page:** `OperatorAllocationVisualPage.tsx` (24 lines) is a deliberate shim wrapping `OperatorAllocationListPage` with `initialView="visual"`. Fine as a route-stability fix, but its existence implies the visual presentation deserves its own page — instead it lives buried inside the 1,341-line list page. The right refactor: extract a real `OperatorAllocationVisualPage` and have the list page consume only the list view; the segmented toggle should navigate, not co-render.

**BR-rule coverage:**
- BR-SHR-001 (allocation cap): implemented in `TowerCapacityMonitorPage` and `remainingCapacity()`.
- BR-SHR-002 (structural threshold): correctly wired through `isStructuralRequired()` and `StructuralAnalysisTrackerPage`.
- BR-SHR-003 (multi-party approval): correctly modeled with three approval entities.
- BR-SHR-005 (power threshold): `powerSeverity()` returns ok/warning/critical at 90%/100%.
- BR-SHR-006 (height separation): `heightSlotConflict()` and `HeightSlotInterferenceViewPage`.
- BR-SHR-007 (MORAN/MOCN spectrum doc): enforced in `SharingAgreementFormPage`.
- BR-SHR-008 (renewal reminders): `BR_DEFAULTS.renewalReminderDays = [180, 90, 30]` referenced in `AgreementRenewalManagerPage`.
- BR-SHR-009 (escalation): `applyEscalation()` and `projectEscalatedFees()`.
- BR-SHR-010 (SLA tracking): `slaBreached` boolean only — no auto-detection logic visible.
- BR-SHR-011 (release on decom): implemented in `OperatorDecommissioningWorkflowPage`.
- BR-SHR-012 (maintenance responsibility required): enforced in `SharedInfrastructureDetailPage`.
- BR-SHR-013 (withdrawal cooling-off): captured via `BR_DEFAULTS.withdrawalCoolingOffDays` and shown as warning, not enforced.
- BR-SHR-014 (no agreement overlap): `checkOverlap()` enforced in form.

Solid coverage, but enforcement is uneven: some BRs are pure warnings, others are hard validation. A registry mapping each BR to severity (warn / block / log) would clarify.

**Comparison to SiteMaster (American Tower) / Sitetracker / Aurigo:**
- SiteMaster: this module is at ~30% feature parity. Missing: MLA/SLS hierarchy, ground lease, work orders, FAA/FCC permits, financial straight-lining, structural engineering ingestion. Has: better visualization of tower side-view, better composite capacity gauges.
- Sitetracker: ~40% workflow parity. Missing: native Salesforce activity timeline, opportunity-to-cash workflow, mobile-app field updates. Has: comparable approval Kanban, better explicit BR-rule annotation.
- Aurigo: ~25% parity (Aurigo is procurement-heavy). Missing: contractor bidding, change-order workflows, claims management.

---

## SCORING (1–10 scale)

| Domain | Score | Notes |
|---|---|---|
| **Domain Coverage (4 entities, 21 SCRs)** | 7.5 | All 4 BRD entities present; 21/21 SCR pages; missing MLA, ground lease, work orders. |
| **Data model rigor** | 5.5 | 8-dim capacity is right; missing azimuth, frequency band, mount type, EPA, kN·m. |
| **Workflow correctness** | 7.0 | Co-lo lifecycle and decom checklist are strong; approval Kanban is best-in-class for the demo space. |
| **Structural engineering accuracy** | 3.0 | One-dimensional load model; no wind/seismic/foundation/per-member stress. |
| **RF interference & decoupling** | 2.5 | Only enforces 3 m vertical separation; no PIM, IM3, EIRP, beamwidth, or frequency-pair analysis. |
| **Financial modeling** | 4.0 | MRR/ARR/escalation OK; no straight-lining, no CapEx, no ground-lease pass-through, currency naïve. |
| **UX & visualization** | 8.5 | Tower side-view SVG is genuinely impressive; composite gauges are operator-friendly. |
| **Code maintainability** | 5.0 | 1,341-LOC OperatorAllocationListPage and pervasive `as unknown as` casts hurt; hardcoded TODAY in 6+ files. |
| **BR-rule enforcement** | 6.5 | 13/14 BRs implemented; severity (warn vs block) is inconsistent. |
| **Production readiness** | 4.0 | Direct `db.update` in OperatorAllocationListPage scope helper, seeded random AR data, no permit/work-order entities. |
| **OVERALL** | **5.4 / 10** | Demo-strong, production-shallow. Visualization and workflow scaffolding are above expectations; engineering and finance are below industry baseline. |

---

## TOP 10 PRIORITY FIXES

1. **Add MLA/SLS contract hierarchy.** Introduce `MasterAgreement` parent entity with corporate-level terms; make each `SharingAgreement` a child Site Lease Supplement. Without this, real tower-co negotiations cannot be modeled. Affects: `sharingTypes.ts`, all agreement pages, revenue dashboard.
2. **Add `GroundLease` entity and pass-through cost.** Tower-cos lease ground from landowners; rent escalation pass-through is mandatory for accurate site P&L. New entity + new tab on `SharingDetailPage`.
3. **Decompose `OperatorAllocationListPage.tsx` (1,341 LOC).** Extract `TowerSideView`, `ShelterCompact`, `PowerCompact`, `RackCompact`, `GroundCompact`, `AllocationDrawer` into separate files. Convert `OperatorAllocationVisualPage.tsx` from a shim into a real page that owns the visual view; remove `initialView` prop coupling.
4. **Expand capacity dimensions.** Add `azimuth_from°`, `azimuth_to°`, `mount_type`, `frequency_bands_mhz[]`, `epa_sqm`, `torque_kn_m`, `feeder_aperture_count` to `OperatorAllocation`. Surface these in the visual hero.
5. **Fix `useOperatorAllocationActionsScoped` direct-DB write** (`OperatorAllocationListPage.tsx` lines 424–434). Replace with proper hook invocation so audit trail and cascading side-effects fire.
6. **Replace one-dimensional structural threshold with a real input form.** Capture wind zone, ice loading, exposure category, seismic site class, foundation type, per-leg DCR results from a vendor PDF upload. Make the structural analyst's PDF the source of truth, not a single Pass/Fail enum.
7. **Add a `RFCoordinationAnalysis` entity for PIM/IM3 review.** Wire the existing "Flag for RF Engineering Review" button to actually create a record. Track decoupling distance per band-pair, IM3 hits in-band, PIM measurements per connector.
8. **Centralize `TODAY`.** Replace the 6+ hard-coded `new Date('2026-05-15')` literals with a single `getDemoToday()` helper (or, better, a `useCurrentDate()` hook that's mockable in tests).
9. **Implement straight-lined revenue (ASC 842 / IFRS 16).** Add `straightLinedMonthlyRevenue` calc to `agreementActions.ts`; show both cash MRR and accrual revenue on the dashboard. Critical for any tower-co with audited financials.
10. **Add multi-currency aggregation with FX rate table.** `SharingRevenueDashboardPage.mrr` summation needs to normalize to a reporting currency. Add a `currencyRates` reference table and `convertToReportingCurrency()` utility.

---

## Files of note

- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/pages/TowerCapacityMonitorPage.tsx` — strongest single page; composite gauges are correct UX.
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/pages/OperatorAllocationListPage.tsx` (1,341 LOC) — biggest refactor target; impressive SVG but over-coupled.
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/pages/OperatorAllocationVisualPage.tsx` (24 LOC) — shim; should be promoted to a real page.
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/pages/CoLocationApprovalWorkflowPage.tsx` — best-in-class internal-vs-external approval-source badging.
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/pages/AgreementRenewalManagerPage.tsx` — solid Gantt + table sync interaction.
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/pages/HeightSlotInterferenceViewPage.tsx` — visually right but RF-shallow.
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/pages/StructuralAnalysisTrackerPage.tsx` — single-dimensional load model is the largest engineering gap.
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/lib/sharingCommon.ts` — clean central registry of pills, BR defaults, operators.
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-sharing/lib/sharingTypes.ts` — well-structured but needs azimuth/EPA/band additions.
