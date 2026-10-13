# Site Lifecycle Module — Deep Enterprise Review

**Reviewer perspective:** 20-year Rollout Transformation Architect (ex-Vodafone, Verizon, AT&T, American Tower, Indus Towers).
**Module path:** `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/site-lifecycle/`
**Files reviewed in full:** SiteDetailPage (5,431 lines), SiteListPage (1,072), SiteDashboard (907), TechSitesListPage (1,750), PhaseAdvancementModal (328), BuildQualityScorecard (529), MaterialReadinessTracker (553), plus types, enums and SiteOverviewMap/SiteGanttTab components. Skimmed: forms, SiteHistoryPage, SiteAnalyticsPage, SiteDecommissionPage, SiteComparisonPage, SiteMaintenancePage, SitesHubPage, SiteTypeSelectorPage, MyIssuesPage, IssueListPage, MaterialReadinessTracker, ScopeAddModal.

This review will be read by CTOs at Tier-1 operators. It is critical and unsparing.

---

## A. Module Purpose Validation

The Site Lifecycle module is **conceptually the right boundary** — every Tier-1 operator (Vodafone PMR, Verizon RAINBOW, AT&T NORAD, Indus IRIS) maintains a single "Site Master" record that owns the site identity, location, structural attributes, scopes, RAG, and milestone trail through to On-Air/Accepted. So a dedicated module is correct.

**However, in this codebase the boundary is leaking badly:**

1. **Overlap with Site Acquisition** (`src/modules/site-acquisition/`): That module already owns `NominalSiteCreatePage`, `CandidateDetailPage`, `LandlordListPage`, and `PermitListPage`. Yet SiteDetailPage embeds **its own** Permits tab (`renderPermits`, lines 3864–4203), **its own** Lease & Property panel (`renderLease`, 3610–3692), and **its own** Candidate evaluation card (`renderCandidates`, 4206–4265). These should be **read-only embeds** of the SAQ module's surfaces, with a single source of truth — instead they are reimplemented with synthetic data when the API returns empty (lines 718–740 for permits, 742–757 for power, etc.). That's not a module — that's a god-page.

2. **Overlap with Quality Acceptance** (`src/modules/quality-acceptance/pages/`): `BuildQualityScorecard.tsx` (529 lines) lives in site-lifecycle but duplicates concerns already owned by `QualityDashboard.tsx`, `QualityTrendDashboardPage.tsx`, `VendorQualityScorecardPage.tsx`, `DefectAnalysisParetoPage.tsx`, `PunchListDashboardPage.tsx` and `ReworkTrackerPage.tsx`. Why is BuildQualityScorecard not in `quality-acceptance/`? The codebase has TWO separate vendor-quality matrices (BuildQualityScorecard line 106 vs VendorQualityScorecardPage). The comment at line 108 (`NOTE: passRate values are aligned with VendorScorecardDashboard.firstPassQuality`) is an admission of the leak.

3. **Overlap with Network Readiness** (`src/modules/network-readiness/`): SoakPeriodMonitor, ZTPDashboard, HealthCheckDashboard, ReadinessDashboard exist there — but SiteDetailPage has a "Multi-RAT Coordination" tab (`renderCoordination`, 4423–4541) doing cross-RAT go-live readiness, which is exactly Network Readiness's job. The `RemoteCommissioning` type at `types.ts:245-268` (ZTP, soak period, KPI checks) duplicates Network Readiness concepts.

4. **Overlap with PPM Integration**: SiteDetailPage embeds `<SitePPMTab>` (line 4575) AND has its own `renderTasks` Kanban (lines 2710–2755) AND has a Gantt (`<SiteGanttTab>`, line 4586). Three task surfaces for the same data.

5. **Overlap with Maintenance Mgmt** (`src/modules/maintenance-mgmt/`): SiteMaintenancePage lives in site-lifecycle but the dedicated module already exists. The `MaintenanceSchedule` and `MaintenanceRecord` types in `types.ts:194-241` blur ownership.

**Ownership clarity for a real rollout:** In a Tier-1 op, Site Acquisition is owned by an SAQ team (real-estate/legal/landlord-facing), Build is owned by Construction PMs, Integration by NOC/RF engineers, ATP/WCC by Quality, and On-Air/operations by NOC. This codebase forces everyone into ONE 5,431-line SiteDetailPage; no role-based "perspective view" actually narrows the page. The `<RoleGate capability={CAP.editSite}>` calls are scattered (5 occurrences in SiteDetailPage) but the page is the same monolithic mass for everyone.

**Missing functionalities for a 100K-site rollout:**
- **No baseline locking + variance audit trail** beyond a `baselineLocked` boolean on Scope. No baseline snapshots, no rebaselining workflow.
- **No master-data hierarchy:** Operator → Market/Country → Region/Circle → Cluster → Site is partially modelled but no Circle/Market entity (REGIONS at `enums.ts:114` is a flat list of 8 strings — Vodafone India alone has 22 telecom circles).
- **No SLA/OLA framework on milestones**: SLA fields only exist on Issues (`responseSlaHours`, `resolutionSlaHours`), not on phase gates.
- **No vendor contract/PO linkage at site level** — `assignedVendor` is a free-text string.
- **No civil work BoQ**, no tower-loading data (only `towerHeight` — a real operator needs `loadCapacity`, `availableEIRP`, `windZone`, `seismicZone`, `iceLoad`, `co-location count`).
- **No fiber readiness, transport circuit IDs, IP plan**.
- **No Disaster Recovery / N+1 redundancy planning**.
- **No spectrum/license linkage**.
- **No environmental clearance for EMF compliance** beyond a permit type tag.
- **No "site twin" / digital-twin asset model.**

---

## B. Workflow Audit

The site lifecycle phases declared in `SITE_STATUSES` (`enums.ts:42-55`) are:
`Nominal → Candidate → Acquired → Design → Approved → Build → Integration → On-Air → Accepted → Closed → Cancelled → On-Hold`

This is **largely correct as a coarse status machine**, but compared to real Tier-1 processes it is **dangerously under-specified**:

**Missing phases / gates real operators have:**
- No **"Site Nomination"** vs **"Nominal Locked"** distinction. Vodafone PMR has Pre-Nominal → Nominal Approved → SAR (Site Acquisition Request) raised.
- No **"Candidate Selection"** approval gate (3-candidate evaluation matrix is a regulatory requirement in India per DoT TERM rules).
- No **"TSSR"** (Technical Site Survey Report) stage — captured nowhere.
- No **"SAQ Handoff to Build"** gate — implicit between Acquired/Approved.
- No **"Civils Complete"** vs **"E&M Complete"** sub-phases.
- No **"Material at Site (MAS)"** state — materials are tracked in MaterialReadinessTracker but no site-level state flag.
- No **"DC Power Up"**, **"OFC Live"**, **"PAT" (Provisional Acceptance Test)**, **"FAT" (Final Acceptance Test)** stages — Indian operators contractually use PAT/FAT/WCC.
- No **"Integration Complete vs RFI (Ready For Integration)"** distinction.
- No **"Soak"** state (Network Readiness has it but the lifecycle doesn't reflect it).
- No **"Commercial Launch"** vs **"Technical On-Air"** — Verizon distinguishes the two by 14-30 days.
- No **"Site Acceptance Punch Walk"** state.
- No **"NOC Handover"** state, no **"Warranty Period Active"**.

**State transitions:** The `PhaseAdvancementModal.tsx` (328 lines) is a **prototype**. The `DEFAULT_CHECKS` array (lines 42–85) is **hardcoded** — there is no real per-phase gate template, no operator-specific gate logic, no vendor-specific gate. It always shows the same 7 generic checks regardless of which phase you're advancing to. In a real platform, gates per phase are configurable per operator (Phase 4 → Phase 5 may require "Tower Erection Drawings Approved" + "Insurance Cover Confirmed" + "Climbers TBR Cleared"). The R02 override mechanism (line 135 `canOverride = userRole === 'R02' || userRole === 'R01'`) hardcodes roles and bypasses any real authorization.

**Approval chains:** Effectively missing. The override leaves a justification but no formal approval workflow with parallel approvers, escalation timers, or maker-checker enforcement. Tier-1 ops have 4-level approvals for CapEx-impacting phase changes (PM → Circle Head → Regional Head → CTO Office).

**Multi-vendor coordination gaps:** Each Scope has `assignedVendor` (single string). Real sites have 4–8 vendors active simultaneously: tower co (e.g., ATC), MEP/civil vendor, radio OEM (Ericsson/Nokia), transmission vendor (Ciena/Adva), passive infra vendor (CommScope), drive-test vendor (Rohde), ATP vendor. There is no vendor-handoff state machine, no vendor work-order tracking, no SLA contracts per vendor.

**Circle-wise/regional rollout handling:** REGIONS is a flat 8-value enum. There is no Circle entity with its own dashboard, no "Circle Head" role gating. Indus Towers and Reliance Jio organize the entire operating model around Circle P&Ls.

**Escalation gaps:** No SLA breach hooks on phase entry. SLA exists only on Issues. The "Aging" widget in SiteDashboard (`riskTableColumns` line 437) just colors days-in-phase > 14 amber, > 30 red — no escalation, no auto-notify, no Jira-style "if blocked > 7d, notify VP".

**Compared against Ericsson PMR / Nokia NPO / Huawei NMS:**
- PMR has 67+ pre-defined milestones across the Macro 4G/5G lifecycle. This codebase has 9–15 per template (`PHASE_TEMPLATES`, `enums.ts:162-290`) — adequate for a demo, not for a real rollout.
- NPO/Huawei have a "Sales Order → BOQ → ASR → SAR → SAS → SAT → ATP → WCC" trail. None of those acronyms exist here.
- All three integrate with NSP (Network State Provisioning), AAA, and EMS. There is zero downstream NMS integration referenced.

---

## C. Screen-by-Screen Review

### 1. **SiteDetailPage** (5,431 lines, the flagship)

**The good:** Information density is high; "Object Explorer" tab (lines 2169–2700) is an unusually ambitious entity-graph visualization (radial layout, click-through, drawer detail) — this is genuinely differentiating UX. The premium header (lines 1682–1804), KPI strip with sparklines (1807–1890), and the technology-specialised tabs (WiFi APs, DAS Components, C-RAN Pool, Small Cell Mounts) reflect serious domain thought.

**The bad — extensive:**

- **17–22 tabs depending on tech composition** (line 4716–4720 `_orderedKeys`): Overview, Tech Stack, Multi-RAT Coordination, PPM, Gantt, RF Designs, MW Links, WiFi, DAS, C-RAN, Small Cell, Equipment, Power, Issues, Documents, Object Explorer, Lease, Permits, Crew, Candidates, Punch List, Vendors, Financial, History. Even with `primaryCap={6}` (line 4933), the "More" overflow makes this page indigestible. A real Tier-1 operator's PM never opens 17 tabs; they want a 3-tab triage view (Open Issues, Phase Status, Next Action).
- **Generic dashboards inside tabs:** `renderOverview` (1893–2166) is a wall of "Project Context", "Site Information", "Location" cards with hardcoded layout. No actionability — just static read-only fields. The Recent Activity Timeline (2148–2160) shows only 5 events.
- **Fake analytics everywhere:** Lines 619–784 generate **fully synthesized** issues, crews, punch lists, permits, power systems, cost entries when the API returns empty. The KPI strip (1807–1890) shows a `conditionScore` (line 1814) that is `60 + (sparkSeed % 35)` — a random number masquerading as a "condition score". `daysToTarget` (1819) is real, but Cost YTD (1872) and the sparklines (1830, 1842, 1853, 1875) are all hashed-from-siteId noise. **Every sparkline on this page is fake.** A CTO will spot this in 30 seconds.
- **Non-actionable metrics:** "Phase Progress 65% +4% MoM" — the +4% MoM is hardcoded. "Condition Score 78 — Good" — also hardcoded. These are vanity tiles.
- **Dead sections:** Lines 4992–4997 contain `<span style={{ display: 'none' }}>` rendering `<HomeOutlined>` and `<UserOutlined>` just to silence unused-import warnings. This is a code smell that suggests the file is being maintained by trial-and-error.
- **State chaos:** 24+ `useState` hooks (lines 522–565). 7 separate Modal/Drawer instances at the bottom (lines 4999–5426). No state machine, no XState, no reducer. Every modal carries its own `Form` instance.
- **Permit creation/transition** (lines 4099–4200) implemented inline — but `usePermitActions` is imported from Site Acquisition (line 101), confirming the leakage.

### 2. **SiteListPage** (1,072 lines)

**The good:** URL-aware tech filter (`useFiltersInUrl`), density-aware columns (`useDensityColumns`), advanced rule builder (AND/OR combinator, 11 operators, parameterized).

**The bad:**

- **Advanced search is client-side only** (`evalAdvRule` at line 210). It runs `pool.filter(...)` over the in-memory `allSites` array which is capped at `pageSize: 1000` (line 436). For a 100K-site rollout the user will get incomplete results without any "showing 1,000 of 100,000" warning.
- **The tech filter degrades the same way** — it fetches all scopes at `pageSize: 1000` (line 437) and computes `siteIdsForTech` (line 440). For 100K sites with 2–3 scopes each, this needs 300K rows; only 1K returned.
- **Status tabs are misaligned with SITE_STATUSES**: `in-progress` tab (line 70) lists `['Candidate', 'Acquired', 'Design', 'Approved', 'Build', 'Integration']` but omits `Nominal` (which should be either pre-rollout planning or excluded). Inconsistent with what `kpis.inProgress` does in `SiteDashboard.tsx:159`.
- **No saved views, no shareable URLs for complex filters** beyond the single `tech` URL param.
- **Row-action handlers** use `App.useApp().modal` (line 419) which is correct — but bulk action confirmations don't show a preview of affected sites; if you click "Submit for Review" on 500 selected sites, you get a generic confirm dialog.

### 3. **SiteDashboard** (907 lines)

**The good:** Period-aware multipliers (lines 108–114), real export to CSV/PDF/PPTX-text (lines 534–604), useQueryClient invalidation on refresh, alert banner derived from at-risk sites.

**The bad:**

- **The hero KPIs are scaled by `periodFactor.window`** (e.g. line 621: `Math.round(kpis.total * periodFactor.window)`). This means "Sites Active MTD" is just `total × 0.0833` — a fabricated figure. The comment at line 100 calls this out honestly ("The mock DB has no real time series...") but a CTO seeing "Sites Active YTD: 12,000" and "Sites Active MTD: 1,000" will assume real time-bucketing. **This will be the #1 demo objection.**
- **All deltas are constants** (line 622 `delta={+3.2 * periodFactor.trend}`). +3.2%, +5.1%, -2.4%, +1.8% never change. The trend strip at the bottom (lines 887–897) repeats those exact numbers.
- **`periodScopedSites`** (line 142) filters by `updatedAt` falling within a 30/90-day window. In a mock that updates everything at once, this is meaningless. In production, "Sites whose record was touched in the last 30 days" is NOT the same as "Sites that progressed in the last 30 days" — the dashboard is conflating audit churn with delivery progress.
- **AI Insight card** (line 721) shows a hardcoded body: "Recommend reviewing the aging report." This is the same string for every operator, every day.
- **Acceptance Rate** (line 165 `acceptanceRate = accepted / total`) is misleading — it's a snapshot ratio, not an actual rolling acceptance rate against in-flight sites. A 60% acceptance rate at a 200-year-old operator and at a greenfield 5G rollout mean entirely different things.
- **No drill-through from the RAG-by-Region bar** to a filtered SiteListPage. **No timezone awareness.**
- **`topRedRegion`** (line 280) picks just the worst region but doesn't acknowledge ties.

### 4. **TechSitesListPage** (1,750 lines)

**The good:** Tech-specific columns (Macro shows Sectors/Bands/Vendor, Small Cell shows Mount Type/Tx Power, WiFi shows AP Count/Controller, DAS shows Building Type/Architecture/Multi-Op, MW shows Role/Capacity/Frequencies, C-RAN shows DUs/CUs/RUs/Rack Util). This is the right idea — per-tech specialization.

**The bad — the entire data layer is fake:**

- **Every tech-specific column** is generated by `pickFrom(row.site.id, [array])` or `intInRange(row.site.id, min, max)` (lines 156–172). The site's actual sector count, band, vendor, AP count, building type, MW availability — none of it comes from the data model. The table looks like a Tier-1 detailed view, but click any row and the SiteDetailPage will show a completely different number for the same field because the hash seeds differ.
- **Real fields missing from the data model that this page pretends exist:** `sectorCount`, `bands`, `radioVendor`, `mountType`, `txPower`, `backhaul`, `coverage`, `poe`, `wifiStd`, `apCount`, `ssidCount`, `controller`, `buildingType`, `architecture`, `floors`, `antennas`, `multiOperator`, `coverageArea`, `mwLinks`, `capacity`, `frequencies`, `availability`, `dus`, `cus`, `rus`, `fronthaul`, `rackUtilization`. **All of these belong on SiteScope or a RadioConfiguration entity.** Without them, every tech list and tech tab is theater.
- **Aggregated `worstRag`** (line 284) only ranks `red/amber/green/grey` — no nuance like "trending Amber" or "stale Green".
- **Pagination is missing** — the table renders all `filteredRows` directly. At 100K sites narrowed to e.g. all macros (~60K), the browser will lock up.

### 5. **PhaseAdvancementModal** (328 lines)

**The bad — covered in B above:**

- Hardcoded `DEFAULT_CHECKS` (lines 42–85), no real per-phase template lookup.
- `userRole === 'R02' || userRole === 'R01'` (line 135) hardcodes role codes; not even using the platform's `RoleGate`/`CAP` capability system.
- No previous approvals shown, no required-attachments check, no SLA budget remaining.
- The "Submit Override" simply calls `onAdvance(justification)` (line 144) — there's no maker/checker pattern.
- No audit log preview ("This will record: User X advanced Phase Y at HH:MM via override because Z").
- Modal can be dismissed without warning even after entering justification — data loss risk.

### 6. **BuildQualityScorecard** (529 lines)

**The bad:**

- **100% mock data** (lines 82–125): `TREND_DATA`, `DEFECT_PARETO`, `VENDOR_QUALITY`, `INSPECTIONS` are all literal arrays. The "Quality Score 91/100" hero KPI is hardcoded (line 463).
- **AI Insight card** (line 511) hardcodes the entire grounding defect story. Click "View Defect Detail" and it filters inspections by "punchItems > 0 || result !== Pass" — not actually by grounding category. The skill exists on inspections but no `defectCategory` field is stored.
- **Duplicates** Quality Acceptance module (see §A).
- Should not be in site-lifecycle.

### 7. **MaterialReadinessTracker** (553 lines)

Same problem: all data hardcoded (CATEGORIES, DELIVERIES, VENDORS, WAREHOUSES arrays at lines 90–133). Belongs in **Procurement** module (which exists empty at `src/modules/procurement/`) or in a Supply Chain module. The vendor on-time-% values overlap with the BuildQualityScorecard vendor matrix — two screens, two truths.

### 8. **SiteHistoryPage** (502 lines)

Deterministic mock event generator (`hashStr`, `pickUser`). Not connected to a real audit-log entity. Doesn't surface `PhaseHistory` (which IS modelled in `types.ts:173-190` with override justifications, failed gate rules). The history page should be the consumer of PhaseHistory, but instead it makes up events from scope/issue/milestone hashes.

### 9. **MaterialReadinessTracker / SiteAnalyticsPage / SiteMaintenancePage / SiteHistoryPage / SiteComparisonPage / SitesHubPage / SiteTypeSelectorPage**

All competent UI scaffolding but the same pattern: KPI tiles, charts, tables, with mock or hash-derived data. SiteTypeSelectorPage is the cleanest — it does one thing (pick a site type before form selection) and does it well.

---

## D. Telecom Domain Validation

**Site classification (Macro/Small Cell/DAS/C-RAN/WiFi/MW Repeater):** Mostly correct, but with errors and omissions.

- **Macro 4G + Macro 5G as separate technology types** (`enums.ts:3-13`) is one valid model, but more realistic is "Macro Site (multi-RAT)" with `radioConfigurations[]` carrying RAT/Band/Sector. Doubling sites for 4G and 5G inflates counts and creates lifecycle synchronization headaches.
- **"WiFi" as a peer to Macro 5G** is wrong from a real-operator perspective. WiFi is a connectivity overlay, often deployed by a venue not the operator; lumping it as "site lifecycle" obscures that the workflow is fundamentally different (no spectrum, no FAA, different vendors).
- **No "IBS" (In-Building Solution)** alongside DAS — IBS is a distinct category most ops use.
- **No "Hotspot" / "Carrier WiFi"** distinction.
- **No "Neutral Host Network"** type — this is a major 2025-onwards business model.
- **"COW (Cell on Wheels)"** listed under `STRUCTURE_TYPES` (`enums.ts:156`) is fine but no emergency/event lifecycle.
- **"Greenfield" vs "Brownfield"** distinction missing in SITE_TYPES.
- **Tower types missing:** Camouflaged, Stealth (palm, flagpole), Water Tank — `MacroSiteForm` lists them (line 71-81) but `STRUCTURE_TYPES` enum does not.

**Phase definitions vs reality (PHASE_TEMPLATES `enums.ts:162-290`):**

- Macro 4G/5G template has 15 phases but **omits**: SAR (Site Acquisition Request), TSSR (Tech Site Survey Report), MOM (Method of Procedure), DGS (Dig Sheet), MAS (Material at Site), PAT, FAT, WCC, NOC Handover, Warranty Activation. These are not optional in any real Tier-1.
- **Microwave template** (243-254) has only 10 phases — missing Hop Plan Review, ETS frequency assignment lead time, Path Profile Verification, Polarisation Verification.
- **C-RAN template** missing: Pool Sizing, Front-haul Latency Budget, Bookend Test, IP/MPLS Underlay readiness, Synchronization (PTP/SyncE) verification.
- **O-RAN template** missing: SMO onboarding, A1/E2/O1 conformance, xApp/rApp store registration, RIC certification — these are the actual O-RAN gating items.

**Field mapping accuracy:**

- `towerHeight` (number) — OK, but no `towerSubType` (lattice vs monopole grades), no `wind_load_kg_m2`, no `loadCapacity_kg`, no `seismicZone`, no `topElevation_AGL`, no `tower_age_years`, no `tower_grouting_inspection_date`. A tower-acquisition team will see this and walk away.
- `structureType` — fine for selection but no rules about "this scope requires this structure type minimum".
- `latitude/longitude` (number, no projection metadata) — adequate for visualization; no `surveyDatum` (WGS84 vs local), no `siteAccessGPS` (often differs from antenna GPS).
- **`ragOverride` + `ragOverrideComment`** on Site (`types.ts:24-25`) and Scope (`types.ts:84-85`) — good in principle. Two big gaps: (a) no override approver, (b) no override expiry — overrides become permanent.
- **No ZTP (Zero Touch Provisioning) status field** on Site. `RemoteCommissioning` type (`types.ts:245-268`) is defined but never used on the Site detail page; instead the page invents `cranRUs[].status` (line 1019).
- **No `RAG status calculation formula`** — RAG is a stored string. In real systems, RAG is *computed* from scope variance, open issue count, gate-failure count, days-since-update, etc. Storing it as text means it lies.

**ATP/WCC logic:** **Entirely missing.** ATP (Acceptance Test Procedure) and WCC (Work Completion Certificate) are contractual gates with vendors. There is no ATP entity, no WCC issuance workflow, no payment trigger on WCC. This is a huge functional gap.

**Integration dependencies:** No dependency graph between scopes. A 5G scope can be marked On-Air even if its 4G NSA anchor scope is in Build. No predecessor enforcement at the scope/site level (only at milestone level via `predecessorMilestoneId` `types.ts:125` — but not consumed in PhaseAdvancementModal).

**Power dependencies:** PowerSystem entity has `gridAvailable`, `gridDistance`, `batteryAutonomy`, `rectifierCapacity` (visible in SiteDetailPage power tab at lines 4789–4794) — these are good. Missing: `genset_runtime_hours_last_30d`, `fuel_consumption`, `solar_irradiance_predicted`, `OPEX_per_month`. Real African/Indian operators run rolling diesel-vs-solar TCO models on every site.

**Multi-vendor ownership tracking:** `assignedVendor` is a free-text string on Site, Scope, and Milestone (`responsibleRole` instead of vendor on Milestone). **No vendor work-order entity, no SLA per vendor, no contract reference, no purchase-order reference, no NDA tracking.**

**Incorrect telecom assumptions:**

1. **"WiFi" as a primary site classification** alongside Macro (see above).
2. **`Microwave` as a technology type** — but a Macro site that has MW backhaul is not a "Microwave site". MW belongs as a backhaul attribute on every site, plus a separate MW Link entity (which exists in `mw-link` module).
3. **`Region` flat enum** — totally wrong for telecom; real ops have 2–3 levels of geo hierarchy (Country/Circle/Cluster).
4. **`PHASE_TEMPLATES[techType]` static** — phase templates vary by operator, by project, by site type. Vodafone Idea 5G has a different gate list from Bharti 5G.
5. **`SITE_STATUSES` linear** — real lifecycle has parallel tracks (e.g., Civil and E&M progress independently, then converge at MAS).

---

## E. Data Review

**SiteDashboard KPIs:**

| KPI | Useful? | Actionable? | Scalable? | Verdict |
|---|---|---|---|---|
| Sites Active (period) | Yes | No | No (mock window-fraction) | Replace with real cohort |
| On-Air (period) | Yes | No | No (×factor) | Replace with cumulative count over time |
| At Risk Red (period) | Yes | Yes (drill into list) | OK | Needs drill-through |
| On-Air This Month/Quarter/Year | Should be useful | No | No (hardcoded ×0.18 of onAir, line 167) | **Currently a lie** |
| Acceptance Rate | Yes | No | OK | Add rolling-window version |
| Top Red Region | Yes | Yes (link missing) | OK | Add click-through |

The dashboard is **missing the leading indicators** any rollout VP wants:

- **Velocity (sites/week, MoM)** — present in SiteAnalyticsPage but not in main dashboard.
- **Cycle time per phase, p50/p90** — in analytics page only.
- **Phase aging distribution** (how many sites > X days in current phase) — missing.
- **Bottleneck phase by tech** — analytics only, not surfaced for action.
- **First-pass yield at acceptance** — only in BuildQualityScorecard.
- **MTTR for blocked sites** — missing entirely.
- **CAPEX burn rate vs plan** — financial tab on SiteDetailPage only, not aggregated.
- **Throughput forecast vs target** (e.g., "On track to hit 1,200 sites by Q3?") — Network Readiness has ReadinessForecast but no equivalent for build.
- **Predictive RAG forecast** — flat absence.
- **Resource utilisation per crew** — no aggregation.

**Drill-down hierarchy depth:** Dashboard → Site List → Site Detail is the only path. Missing intermediate views: Program → Circle → Cluster → Site. The hierarchy data exists (`programId`, `projectId`, `clusterId` on Site) but no navigation surfaces it.

**Cohort analysis:** Zero. There is no concept of "sites that entered Design in Jan vs Feb cohort, compare cycle time".

**Sparklines:** All four hero sparklines (lines 491–510) are derived from the same base × deltaPct linear ramp + sine wobble formula. Visually pleasing, statistically lies.

---

## F. Scalability Review

**SiteDetailPage at 100K sites:**

- `useEntityList('sites', { pageSize: 5000 })` (line 515) and `useEntityList('scopes', { pageSize: 5000 })` (line 516) **fetch ALL sites + ALL scopes** just to show "nearby sites within N miles" on the map. **This will OOM at 100K sites** (~20MB JSON per fetch, then a JS Map over 300K scopes). Should be a geospatial query: `GET /sites/nearby?lat&lng&radiusMiles`.
- 17–22 tabs all rendered as React children of `<TabBarV2>` (line 4929). The Tab body content is computed eagerly via `renderXxx()` calls before being assigned to `tabItems.children`. Every render computes the WiFi heat map, DAS architecture SVG, C-RAN architecture SVG even when those tabs are not active. **Should be `<Suspense>`/lazy load.**
- 24+ `useState` hooks + 7 modals + 5 drawers all in one component → massive re-render fan-out.

**SiteListPage with millions of rows:**

- `pageSize: 1000` (line 436) is the hard cap. Pagination beyond 1K assumes the server fetches; but advanced search and tech filter run **client-side** (lines 478–497), so any non-trivial filter returns wrong totals.
- No virtualization at the EntityListPage level (it uses antd `<Table>` which doesn't virtualize by default).
- Bulk action `bulkAdvancePhase(ids)` (line 781) will fan-out per-id mutations; no batch endpoint.

**TechSitesListPage:**

- Same `pageSize: 1000` problem (lines 252, 268).
- No pagination on the rendered table — all `filteredRows` go straight into `<Table>`.

**Bulk action limits:**

- No "max 1000 at once" guard. Selecting all sites and "Submit for Review" will send 100K mutations.
- No confirmation showing affected count breakdown by region/program.

**Filter complexity at scale:**

- `evalAdvRule` is O(N×rules); fine for 1K, painful at 100K — but the bigger problem is that 99K rows are never seen.

**Specific bottlenecks (file:line):**

- `SiteDetailPage.tsx:515-516` — fetches 5K+5K, OOM risk.
- `SiteDetailPage.tsx:588-616` — builds candidate-sites map for nearby-radius map on every render.
- `SiteListPage.tsx:436-448` — client-side tech filter caps at 1K sites.
- `SiteListPage.tsx:478-497` — client-side advanced search.
- `SiteDashboard.tsx:125-134` — fetches 1K sites + 2K scopes on every dashboard load.
- `TechSitesListPage.tsx:252-326` — fetches all scopes + all sites, merges in-memory.
- `SiteHistoryPage.tsx:159-178` — fetches up to 500 milestones + 200 issues per site visit.

---

## G. AI & Intelligence Opportunities

The platform has `AIInsightCard` infrastructure (used 3 places in this module) but it's filled with hardcoded strings. Real opportunities:

1. **Phase delay prediction:** Given (current phase, days-in-phase, region, vendor, structure type, weather forecast, similar historical sites), predict probability of slipping > 14d. Show `delta_predicted` on every Site row.
2. **Smart site comparison:** SiteComparisonPage today just shows attribute grids. Augment with: "Sites SITE-101 and SITE-203 differ on 3 KPIs significantly (cycle time +18d, cost variance +12%, issue count +5). 87% of the difference is explained by vendor (Nokia vs Ericsson) and tower height (60m vs 40m)."
3. **Anomaly detection on Site KPIs:** Watch `daysInPhase`, `openIssues`, `cost_variance`, `rag_trend`. Flag sites whose metric is > 2σ from cluster mean.
4. **Automated RCA on failed integrations:** When a site fails Integration → Acceptance, mine the issue log, milestone slippage, vendor performance, weather, transport availability to suggest top-3 root causes. Compare against operator's historical RCA taxonomy.
5. **Natural language site queries:** "Show me all macro sites in Metro region with red RAG, pending FAA approval, where the lease expires within 90 days." Currently requires the user to combine 4 separate filter UIs.
6. **Smart phase gate recommendation:** Inside PhaseAdvancementModal, instead of static 7 checks, dynamically compute relevant checks from the operator's gate template + this site's actual state (e.g., "Open P1 issue #1234 must be resolved").
7. **Photo OCR for permit/document tagging:** Drag-and-drop a permit PDF, AI extracts permit number, authority, dates.
8. **Predictive material stockout:** MaterialReadinessTracker already shows "Stockout Risk" but uses hardcoded values. AI should compute days-of-cover from in-flight POs vs forecasted demand from sites entering Build.
9. **Vendor performance scoring:** AI-derived composite vendor score from quality + delivery + safety + cost overrun history, ranking against peer set.
10. **Workforce optimization:** Crew assignment is dumb today. AI should batch-route crews considering skill match, current location, scheduled visit windows, hourly rate, SLA penalties.

---

## H. UX & Visualization Improvements

**Specific redesign recommendations:**

1. **Collapse SiteDetailPage from 17–22 tabs to a "Triage View" + "Deep Dive" mode.** Triage = 1-screen: Phase position, blockers, next action, SLA budget left. Deep Dive = current tabbed monster. Most users 90% of the time stay in Triage.
2. **Replace the static Object Explorer graph** with a force-directed entity graph that the user can drag and pin.
3. **Make the KPI strip role-aware** — a Construction Manager doesn't care about "Days to Target On-Air"; a Network Planner doesn't care about "Open Issues".

**Geographic intelligence missing:**

- No isochrone overlays (drive-time to nearest depot).
- No proximity-to-cluster-mean visualization.
- No weather overlay (a build site in monsoon needs different forecasts).
- No tower-loading heatmap (which tower has the most operators co-located).
- No fiber path overlay (where does this site's backhaul go?).
- No spectrum-licence boundary overlay.

**Timeline orchestration improvements:**

- `SiteGanttTab` shows scope-level bars but no cross-scope critical path. A Macro 5G integration cannot start until the MW backhaul is live — that dependency must be visible.
- No resource leveling — if 3 sites are scheduled for Build the same week and only 2 crews exist, the UI doesn't show the clash.
- No "what-if" simulation: drag a milestone, see the downstream cascade.

**War-room / command-center experience:**

The current `SiteDashboard` is a normal dashboard. A NOC war-room view should:
- Be full-screen, dark theme, large numbers.
- Auto-rotate through critical alerts every 30s.
- Show real-time site-state transitions as they happen (toast at the bottom).
- Surface "Hottest Right Now" — 5 sites that just moved to Red, or 5 sites within 24h of go-live.

**Progressive disclosure for the 5,431-line detail page:**

- Lead with: Status, Owner, Next Action, Health (1 line each).
- Reveal: Tech config, Lease, Permits, Crew on demand.
- Hide: Object Explorer, History, Punch List behind "More".

---

## I. Technical Architecture Concerns

**5,431-line SiteDetailPage maintainability:**

- 24+ React state hooks in one component (lines 522–565).
- 18 separate `useMemo` blocks computing different facets.
- 13 internal `renderXxx()` functions, each 50–400 lines.
- 7 Modals + 5 Drawers, each carrying its own Form instance.
- Lazy import bypass: tech-specific tabs (renderWifi, renderDas, renderCran, renderSmallCell) are computed even when those tabs aren't open.
- **This file is unreviewable in PR.** It must be split: `SiteDetailLayout`, `OverviewTab`, `TechStackTab`, `<tech>Tab` files. Move all modals into `<SiteActionModals>` co-located.

**State management complexity:**

- No XState, no Redux/Zustand. Just `useState` × 24.
- No shared selector pattern. Cross-tab state (e.g., which scope was picked for advancement) is held in the page component.

**Real-time update handling:**

- `useQueryClient.invalidateQueries` (`SiteDashboard.tsx:118-122`) on manual refresh only. No subscriptions, no SSE, no WebSocket. A field engineer updating the site won't be visible to PMs until they hit refresh.
- No optimistic updates on mutations.

**Multi-tenant readiness:**

- `operatorId` on Site, but no tenant boundary in the API/data layer. The mock DB returns everything to everyone.
- No row-level security pattern.
- Audit fields (`createdBy`, `updatedBy`, `version`) present but no enforced server-side stamping logic visible.

**Offline capability:**

- Zero. No service worker, no IndexedDB cache, no offline-first pattern. Field engineers in low-coverage areas will be stuck.
- No conflict resolution on re-sync.

**Other technical observations:**

- Multi-RAT Coordination tab (lines 4423–4541) maps `Green/Amber/Red → ready/partial/not-ready`. Implicit 1-to-1 mapping; doesn't model the real "Ready but waiting on a peer scope".
- Many `as any` and `as unknown as Site` casts (e.g. lines 568–583). The data fetcher is not properly typed.
- `App.useApp()` is used (line 509) — good — but several places still call hooks bound to a specific entity, with destructure-cast patterns that are brittle (`useIssueActions(undefined)` line 519).

---

## SCORING

| Dimension | Score | Notes |
|---|---|---|
| Workflow Completeness | **4/10** | Coarse status machine; missing ATP/WCC/MAS/PAT/FAT/SAR/TSSR, no real approval chains, no SLA on gates |
| UX Sophistication | **6/10** | Object Explorer + tech-specific tabs show ambition; 17–22 tabs and fake KPIs drag it down |
| Telecom Domain Accuracy | **4/10** | Right entities at the top level; wrong granularity inside (no tower loading, no co-location, no spectrum, WiFi misclassified) |
| Data Intelligence | **3/10** | Half the KPIs are computed from hashed siteId; no leading indicators, no cohorts, no real forecasts |
| Scalability Readiness | **3/10** | Hardcoded `pageSize: 1000–5000`, client-side filtering, eager render of all tabs — will collapse at 100K sites |
| AI Readiness | **3/10** | AIInsightCard infra exists but every insight is hardcoded; no inference, no model, no feedback loop |
| **Overall** | **3.9/10** | A polished prototype, not an enterprise platform |

---

## TOP 10 PRIORITY FIXES

1. **Eliminate all synthetic data from SiteDetailPage and BuildQualityScorecard.**
   Files: `SiteDetailPage.tsx` (lines 619–784, ~166 lines of hash-derived mocks for issues/crews/punch/permits/power/cost), `BuildQualityScorecard.tsx` (lines 82–125), `MaterialReadinessTracker.tsx` (lines 90–133), `TechSitesListPage.tsx` (every `pickFrom`/`intInRange` call in `techCols`).
   Action: Connect to real entities or render `<Empty description="Connect to API">` — never invent values. Stop calling Math.sin to fake sparklines.
   Effort: **2–3 sprints (8–12 dev-weeks)**, gated by backend availability.

2. **Split SiteDetailPage into a router-driven, lazy-loaded sub-page set.**
   File: `SiteDetailPage.tsx` (5,431 lines).
   Action: Extract one file per tab (`OverviewTab.tsx`, `TechStackTab.tsx`, `WifiApsTab.tsx`, `DasComponentsTab.tsx`, `CranPoolTab.tsx`, `LeasePropertyTab.tsx`, `PermitsTab.tsx`, `FinancialTab.tsx`, `HistoryTab.tsx`, `IssuesTab.tsx`, `CrewTab.tsx`, `PunchListTab.tsx`, `ObjectExplorerTab.tsx`, `CoordinationTab.tsx`). Move all 7 modals to `SiteActionModals.tsx`. Use `React.lazy` + `<Suspense>` per tab.
   Effort: **3 sprints**.

3. **Replace hardcoded PhaseAdvancementModal checks with operator-configurable gate templates.**
   File: `PhaseAdvancementModal.tsx` lines 42–85 and 135.
   Action: Introduce `PhaseGateTemplate` entity (operator-scoped, phase-scoped, technology-scoped). Each gate has: `id`, `name`, `description`, `evaluator` (deliverable, approval, predecessor, field, issue-status, qa-checklist, safety-cert), `severity` (mandatory/recommended), `overrideAllowedRoles[]`. PhaseAdvancementModal hydrates the modal from this. Replace `userRole === 'R02'` with `RoleGate` + `CAP.overridePhaseGate`.
   Effort: **2 sprints** + backend.

4. **Adopt a real geo/cluster hierarchy: Country → Circle → Cluster → Site.**
   Files: `types.ts:36-38` (Region/subRegion), `enums.ts:114-123` (REGIONS), `SiteListPage.tsx`, `SiteDashboard.tsx`.
   Action: Add Circle/Market entities with their own dashboards, ownership roles, and rolled-up RAG. Replace flat REGIONS enum.
   Effort: **2 sprints + data migration plan.**

5. **Server-side filtering, pagination and virtualization for all list pages.**
   Files: `SiteListPage.tsx` (lines 436–497), `TechSitesListPage.tsx` (lines 252–326), `SiteDashboard.tsx` (lines 125–134), `useEntityList` calls everywhere with `pageSize: 1000+`.
   Action: All filtering must round-trip to the API. Implement cursor-based pagination. Use react-virtual or `<antd Table virtual>` for any list > 200 rows. Add "showing 1,000 of 100,000" warnings if a query exceeds the page cap.
   Effort: **3–4 sprints**, requires backend cooperation.

6. **Stop fabricating period-scoped KPIs on the dashboard.**
   File: `SiteDashboard.tsx` lines 100–169, 491–510, 619–657.
   Action: Remove all `periodFactor.window` multiplication. Either query the API with a real date range or display "Snapshot — total: 12,000". Hardcoded deltas (+3.2%, +5.1%, etc.) must be removed or come from real period-over-period queries.
   Effort: **1 sprint** for UI + backend support.

7. **Introduce `RadioConfiguration`, `TowerLoading`, `BackhaulCircuit`, `SpectrumAssignment` entities** and remove the fake tech columns in TechSitesListPage.
   Files: `types.ts`, `TechSitesListPage.tsx` (lines 514–845).
   Action: Add proper data model for per-tech telecom fields (sectors, bands, vendor per scope, tower load capacity, fiber/MW circuit IDs, spectrum bands assigned). Wire TechSitesListPage columns to those instead of `pickFrom(row.site.id, ...)`.
   Effort: **3 sprints + backend schema migration.**

8. **Replace the static Object Explorer with a real entity-graph powered by a graph query.**
   File: `SiteDetailPage.tsx` lines 1089–1289 (explorerNodes builder), 2169–2700 (renderer).
   Action: Build it once at platform level (Cytoscape.js or react-flow), driven by an entity-graph API. Add filters (1-hop / 2-hop), search, lasso-select, save-view. This pattern should be reused across all detail pages.
   Effort: **2 sprints**.

9. **Build an Approval Workflow Engine** with 4-level escalation, parallel approvers, SLA timers.
   Files: `PhaseAdvancementModal.tsx`, `SiteDecommissionPage.tsx`, the missing CapEx-change workflow.
   Action: Introduce `ApprovalRequest` entity with `levels[]`, `approver`, `slaHours`, `escalationRule`. Wire to phase advancement, decommission, RAG override, milestone date change.
   Effort: **3 sprints + backend.**

10. **Move out-of-domain pages to their proper modules.**
    Files: `BuildQualityScorecard.tsx` and `MaterialReadinessTracker.tsx` (move to `quality-acceptance/` and `procurement/`). `SiteMaintenancePage.tsx` (move to `maintenance-mgmt/`). The Permits, Lease, Candidate sub-views on SiteDetailPage should be **read-only embeds** of components owned by `site-acquisition/`, not reimplementations.
    Effort: **1 sprint** (mostly refactoring, fewer cross-module imports).

---

## Closing Note

The Site Lifecycle module presents as a sophisticated, polished UI — exactly the kind of demo that wins a sales pitch and loses the first six-month pilot. The bones are good (entity model, role-gate scaffolding, AntD ecosystem, perspective-aware columns). The problem is that the demo data has been allowed to colonize the page logic, so the UI looks operational while telling lies, and the page architecture has not been forced to confront 100K-site reality.

The fastest path to credibility is **harsh deletion**: cut every fake KPI, every hash-derived metric, every hardcoded delta. Replace with `<Empty description="No data yet">`. Then layer real telecom workflow on top of an enforced server-paginated, virtualized, role-driven data path.
