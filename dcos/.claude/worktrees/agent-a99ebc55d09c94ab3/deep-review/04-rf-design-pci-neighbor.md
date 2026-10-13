# Deep Review — RF Network Design: PCI / Neighbor / CBRS Sub-Module

**Reviewer:** RF Optimization Architect (20+ yrs · PCI / ANR / CBRS / SAS)
**Scope:** 11 pages covering PCI Planning, Neighbor Relations, and CBRS/SAS lifecycle
**Files reviewed in full:** `PCIPlanPage`, `PCIPlanDetailPage` (1,394 LOC), `PCIPlanFormPage`, `PCIConflictAnalysisPage`, `NeighborRelationListPage`, `NeighborRelationDetailPage`, `NeighborRelationFormPage`, `NeighborAutoSuggestionPage`, `CBRSGrantDetailPage`, `CBRSGrantFormPage`, `CBRSTrackingDashboardPage`
**Supporting:** `pciPlanMockData.ts`, `rfMockData.ts`, `rfdActions.ts`

---

## A. Module Purpose Validation

### Why PCI/Neighbor separate from RF Design Detail Page?
The separation here is **architecturally correct and matches industry practice**. RF Design Detail (the macro/small-cell/DAS/MW design entity) captures the *physical RF artifact* — antennas, tilts, EIRP, link budgets. PCI plans, neighbor relations, and CBRS grants are *logical/operational artifacts* that span many designs and live on a different cadence:

- **PCI plans** are managed per region/program/band — one plan covers hundreds of cells across dozens of designs.
- **Neighbor relations** are pair-wise edges in a graph and are continuously re-tuned long after a site is "designed-complete".
- **CBRS grants** are spectrum entitlements with their own lifecycle (request → grant → heartbeat → renewal → relinquish), entirely outside RF physical design.

The current `PCIPlanPage` correctly models this as a **catalog of plans** (Region + Band + Program scope) rather than per-cell records, which is what Mavenir/Amdocs/Nokia NetAct/Ericsson ENM do. The pattern is right.

**Gap:** there is no visible link *from* an RF Design Detail Page (e.g., `MacroDesignListPage`) to the PCI plan that governs it. Engineers will need to ask "what plan covers SITE-0123/S2 currently?" — there is no shortcut. The detail page should show "Governed by PCI Plan: PCI-NE-NR-2026" as a chip.

### CBRS as separate workflow vs integrated
Correct decision. CBRS is **US-specific FCC Part 96** and only relevant for n48 (Band 48) deployments. Integrating CBRS forms into every macro design page would clutter the experience for the 90% of designs that are non-CBRS. The current `CBRSTrackingDashboardPage` + `CBRSGrantDetailPage` model mirrors what Federated Wireless and CommScope provide as a separate "Spectrum Portal" pane.

**Gap:** there is no clear linkage in `RFDesignDetailPage` that says "this design has X CBRS grants". CBRS-enabled small cell designs (Category B, outdoor) should display grant status inline as a small badge.

### Boundary with OSS
The boundary is **partially defined but blurry**. Today:
- The platform plans PCI ranges, defines neighbor relations, and tracks CBRS grant requests.
- It does **not** push these to the actual eNB/gNB via NETCONF/YANG, RESTCONF, or vendor MOI/MOA configs.
- The `submitForReview` / `freeze` / `approve` lifecycle is purely planning-side metadata.

What's missing: an explicit "Deploy to OSS" handoff. The current `lib/rfdActions.ts` resolves promises locally without showing what artefact will be written downstream (CM file? NETCONF transaction? CSV to vendor EMS?). For a v2 platform competing with Mavenir/Nokia, this boundary needs to be:
1. Planning Tool produces an approved, frozen plan.
2. Export bundle (3GPP CM XML, JSON, or vendor-specific CSV) goes to OSS Activation queue.
3. OSS confirms write-back; status flips from "Approved" to "Deployed".

None of this is visible in the code today. PCI freeze is the closest, but it does not trigger any provisioning.

---

## B. Workflow Audit

### PCI Planning

**Bulk PCI assignment.** Implemented via `pciActions.assignPCI` (single) and the conflict resolution "Apply All" button on `PCIConflictAnalysisPage` (batch up to 10). There is **no true bulk assign wizard** — i.e., "assign PCIs to these 200 new sites using strategy = mod-N optimized, exclude these PCIs". The strategy dropdown (`Sequential | Random | Mod-N optimized`) on `PCIPlanFormPage` is a plan-level setting that's never actually invoked by an algorithm; assignments come from `buildAssignments()` which generates them deterministically from a hash. **Score: 4/10** for true bulk planning.

**PCI re-planning when new sites added.** Completely missing. A real PCI tool needs a "What-if: add 25 new cells to this plan" simulator that shows which existing PCIs collide. This is the #1 use-case for densification programs. Nothing in the current code supports it.

**Conflict resolution workflow.** Solid. The detail page has a Conflicts tab with severity, suggested PCI, "Resolve" CTA per row, and a modal that lets you change cell+PCI. The `PCIConflictAnalysisPage` adds network-wide view, "Apply All", and per-row apply. Severity, distance, mod-3 reasoning are surfaced. **Score: 7/10.**

**PCI freeze and approval.** Implemented end-to-end: `Draft → Submitted → Active → Frozen`. Status overrides are local state (won't survive reload, but functionally complete in the UI). The Approval History tab is a Timeline. Audit Trail is seeded deterministically. **Score: 8/10.**

### Neighbor Relations

**Manual vs Auto-ANR vs Imported.** All three sources are modeled as a `source` field (`Manual | Auto-ANR | Import | RF Tool`) and surfaced via filter. `NeighborAutoSuggestionPage` simulates auto-ANR with geometric heuristics. CSV import has a modal with a downloadable template (`source_cell, target_cell, relation_type, handover_type, cio, hysteresis, ttt, direction`). This is correct shape; real Auto-ANR uses X2 setup messages, MR (Measurement Reports), and PM counters, not just geometry.

**Neighbor list optimization.** No "remove stale neighbors" workflow. Real ANR continuously prunes relations with <0.5% HO traffic. There is no PM-driven pruning UI here. **Gap.**

**Inter-RAT (LTE↔NR).** Modeled in the relation type dropdown but the form uses a single-band cell catalog (B25, B66, n41, n77, n78 mixed). There is no explicit LTE-anchor → NR-secondary EN-DC setup, no source-selection that pairs an LTE PCI with an NR NCI, no SCG (Secondary Cell Group) parameters. **This is a real gap for 5G NSA networks.**

**Inter-frequency.** Handled at the relation type level but the form does not actually constrain band selection between source/target. The `Q-Offset` field exists but there's no frequency-priority `cellReselectionPriority` or `threshXLow`/`threshXHigh` for IFLB (inter-frequency load balancing).

**Handover parameter tuning.** Strong on the parameter set — `CIO, hysteresis, TTT, qOffset, qRxLevMin, A3, A5-T1, A5-T2` are all there with sensible ranges (TTT picker uses 3GPP discrete values 40, 64, 80, 100, 128, 160, 256, 320, 480, 512, 640, 1024, 1280, 2560, 5120 ms — accurate per 3GPP TS 36.331). **Score: 7/10** for parameters, but missing A1/A2/A4/B1/B2 events.

### CBRS

**SAS integration.** `CBRSGrantFormPage` lets the user pick from `Federated Wireless | Google SAS | CommScope SAS | Sony SAS` with auto-populated API endpoints. Real SAS API per WInnForum SAS-CBSD spec v1.3 needs: `registrationRequest`, `spectrumInquiryRequest`, `grantRequest`, `heartbeatRequest`, `relinquishmentRequest`, `deregistrationRequest`. The interactions tab on the detail page enumerates `register, spectrumInquiry, grant, heartbeat, relinquish, deregister` — **all six message types are present and labeled correctly.** Good adherence to spec naming.

**Domain Proxy registration.** Completely missing. Real enterprise CBRS deployments use a Domain Proxy (DP) between CBSDs and SAS — there's no DP entity, DP CPI signature, or DP-aggregated grant view. For a system claiming Mavenir/CommScope parity this is a notable gap.

**Grant request/renewal.** Implemented. The detail page has a "Renew Grant" modal with month duration, "Suspend" with reason, "Terminate" with reason, "Request Channel Change" with target + reason. The < 30-day expiry banner with "Renew Now" CTA is a nice operational touch.

**Tier 1/2/3 management.** Partially correct.
- Tier 1 (Incumbent: Navy radars, FSS): **Mentioned in compliance events ("DPA exclusion zone temporarily active (Naval Radar)") but no separate management surface.** No incumbent activity feed.
- Tier 2 (PAL): Modeled via `operatingMode = PAL` and `palTier: Tier-1 ... Tier-7`. License reference is captured.
- Tier 3 (GAA): Modeled via `operatingMode = GAA`. Channels 1–15 all eligible for GAA in the form.

Real PAL operates on **PAL Protection Areas (PPAs)** at the county level — there is no PPA boundary visualization. PAL is also **7 channels max per county per operator** under Part 96 §96.31; the form does not enforce this. PAL tiers 1-7 in the UI are a vague abstraction — actual PAL has *time-blocks*, not numbered tiers.

**CPI workflow.** Reasonably modeled: CPI name + CPI certificate ID, required for outdoor deployments, with an info alert citing "FCC Part 96". `cpiVerified` flag on the detail page shows Pending vs Verified tag. The real CPI workflow requires the CPI to sign installation parameters with a cryptographic key (X.509) and the SAS verifies the signature; this is just a name+cert ID textbox.

---

## C. Screen-by-Screen Review

### 1. PCIPlanPage (574 LOC)
List with KPI strip (Total, Active, PCIs Allocated, Utilization, Conflicts, Pending). Filter by tech/status/region. Inline assignment progress bar with severity coloring (red >80%, amber >60%, green). Row dropdown covers View/Edit/Validate/Export/Clone/Submit/Approve/Freeze/Audit/Delete with status-gated visibility. **Strong** — looks like Ericsson ENM's PCI plan list. CSV export is real (not just a toast), audit entries are written. **Score: 8/10.**

### 2. PCIPlanDetailPage (1,394 LOC)
The 1,394-line beast. Tabs: Overview, PCI Range, Assignments, Conflicts, Approval History, Audit Trail, Documents. The **PCI Range tab is the hero** — a 16-column grid of color-coded PCI cells (assigned green, mod3 amber, collision red, reserved blue, excluded slate). Hover shows tooltip; click opens a side drawer with mod-3/mod-6/mod-30 values + assignments. Free cells offer "Assign this PCI to a Cell" CTA. Workflow depth is high. The "Top 10 Most-Used PCIs" mini-chart on Overview is a nice touch. Assignment drawer with AutoComplete cell search is well-built. **Score: 9/10 for workflow depth, 8/10 overall.**

**Issues:**
- 1,394 lines in one file is heavy; should be split into `PCIGridPanel.tsx`, `AssignmentsTab.tsx`, `ConflictsTab.tsx`.
- The grid uses CSS Grid with `repeat(16, 1fr)` — for NR plans with PCI 0–1007 (1,008 cells) this means **63 rows of 16 cells**, scrollable but visually overwhelming. No zoom or "jump to PCI" search.
- Conflict resolve modal applies suggested PCI but does not let user pick a different free PCI graphically.
- Mod-3 % display in the Assignments table is just the raw mod value (0, 1, 2) — fine for experts but cryptic for newcomers.

### 3. PCIPlanFormPage (538 LOC)
Wizard-style form with sections A-E (Identification, Geographic Scope, PCI Range, Validation Rules, Approval). Sidebar shows live summary: technology, PCI range, total count, excluded count. **Correctly** flips max PCI from 503 to 1007 when technology changes from LTE to NR. Strategy dropdown is present (Sequential / Random / Mod-N optimized) but, as noted, no algorithm consumes it. SettingToggle component for mod-3/6/30 enforcement and block-on-collision/confusion is clean. Save Draft / Save & Continue / Save & Submit for Review tri-action is well-thought. **Score: 8/10.**

### 4. PCIConflictAnalysisPage (463 LOC)
Network-wide collision matrix (PCI 0–503 in 28-column grid). KPIs for total cells, collisions, confusions, mod-3 warnings, mod-6 warnings. Two tabs: Collisions, Confusions. Resolution Suggestions panel with per-row Apply + bulk "Apply All". **However:**
- Hard-coded to LTE PCI range (`PCI_MAX = 504`). NR plans get truncated. **Bug — should be plan-aware.**
- 80 mock cells synthesized in-memory; no link to actual `pciPlans` entity in the mock DB.
- Confusion logic correct conceptually (one cell sees two neighbors with the same PCI) but distance check is missing — confusion only matters at the *intersection of coverage*. Geometric overlap is not computed.
- The collision matrix is decoupled from the per-plan grid on `PCIPlanDetailPage`. They use different data. A real product needs one source of truth.

**Score: 6/10** — good visual, but architecturally orphaned.

### 5. NeighborRelationListPage (438 LOC)
Solid list page. 280 mock relations. Filters: relation type, technology, status, source. Bulk actions: Bulk Disable, Bulk Export, Bulk Delete via Dropdown. Single-row actions: View, Edit, Toggle, Delete with capability gates. CSV import dialog with template download. CSV export honors active filters (good design). KPI strip syncs with filtered rows (explicit comment in code — quality engineering signal). **Score: 8/10.**

### 6. NeighborRelationDetailPage (642 LOC)
Header with source→target chip, status, relation type, distance, bearing, direction, source. Tabs: Overview, Configuration (gated to expert density), Handover Performance, Audit. The Performance tab has 7-day bar chart of success rate, attempts count, avg HO delay, plus a Failure Reasons Breakdown (Late HO trigger, PCI confusion, Target overload, TA mismatch, X2 timeout, Air-interface failure) — these are **real failure categories** matching Ericsson and Nokia PM counter naming. The Cell cards show source and target with PCI/band/TxPower. PCI conflict check between source and target is auto-computed and shown as Statistic. **Score: 8/10.**

**Issues:**
- Distance and bearing are random per-build, not Haversine from real coordinates (Cells store lat/lng but they're synthesized too).
- No "X2 setup status" indicator (Setup Successful / X2 IP / X2 SCTP port).
- No ping-pong handover detection metric.
- "TA mismatch" listed as a failure reason — that's Timing Advance, fine, but no actual TA distribution view.

### 7. NeighborRelationFormPage (602 LOC)
Source/target cell selectors with full cell metadata preview (PCI, band, tech, TxPower). Computed live: distance via real Haversine, bearing via standard formula, PCI conflict check. Configuration: relation type, handover type, direction, CIO, hysteresis, TTT (with 3GPP discrete values), Q-offset, Q-RxLevMin, A3, A5-T1, A5-T2. **The math and the parameter ranges are correct.** Alerts for same-cell, PCI conflict, and large distance (>15 km) are well-placed. **Score: 9/10** — one of the most domain-correct screens in the module.

### 8. NeighborAutoSuggestionPage (355 LOC)
Geometric+RF heuristic candidate generator. Knobs: distance threshold (slider, 0.5–20 km), morphology (Urban/Suburban/Rural/Highway), azimuth alignment + tolerance, frequency filter (intra/inter/all). Suggestions table with sortable Recommend Score (0–100). Bulk Accept Selected. **Score: 6/10.**

**Issues:**
- Score formula is `overlap*50 + distance*30 + az*10 + freq*10`. Crude; doesn't use real RSRP overlap, doesn't weight handover history. A real ANR engine uses MR data and X2 messages.
- Morphology dropdown changes nothing in the math.
- Cell IDs in source/target are randomly generated, not from the real cell catalog.
- No "explain the score" tooltip — users will not trust a black-box AI score.

### 9. CBRSTrackingDashboardPage (390 LOC)
List of 42 grants with KPI strip (Total, Active, Pending, Expiring <30d, Revoked/Terminated). Filter by state + expiring shortcut. Expiring-soon Alert banner with chip-links to grant details. Row dropdown: View, Edit, Renew, Reassign Channel, Suspend, Terminate. Bulk Renew. Color-coded "Days Remaining" tag (red <7, amber <30, green ≥30). **Score: 8/10** — exactly the operational ops surface a CBRS operator needs.

**Issues:**
- No filter by SAS provider, by PAL/GAA, or by site cluster.
- No real-time WebSocket badge ("SAS connection healthy / degraded").
- No "incumbent activity" stream visualization.

### 10. CBRSGrantDetailPage (995 LOC)
Header with state badge, SAS provider, PAL/GAA tag, days remaining. Action bar: Edit, Renew, Suspend, Terminate, Request Channel Change, View SAS Logs — all with **proper modals containing form inputs** (this is hugely better than toast-only "actions"). Tabs: Overview, **Spectrum Plot** (a 15-channel band visualization 3550–3700 MHz with active/fallback/idle states — visually correct), Grant History (Timeline), SAS Interactions (table with timestamp, direction, type, result, detail), Compliance (Authorization status, FCC events timeline, Quarterly FCC Reports tags). **Score: 9/10 — best-in-class in this module.**

**Issues:**
- Heartbeat interactions in mock data only show one per day; real CBRS heartbeats are every **60–240 seconds**. A real ops view would show "last HB: 47s ago, next HB: 13s, 99.7% HB success rate over 24h".
- No "ESC (Environmental Sensing Capability) trigger" event type — ESC is the radar-detection layer that forces channel change.
- DPA exclusion zone mentioned in compliance text but not visualized on a map.
- "Quarterly FCC Reports" tags are static; no actual report download.

### 11. CBRSGrantFormPage (481 LOC)
Sections A-G: Cell Selection (CBSD Category A/B with correct dBm caps — 30/47), SAS Provider + API endpoint + Vendor ID + FCC ID, Operating Mode (GAA/PAL) + PAL Tier, Channel Request (primary + fallback + bandwidth 10/20 MHz), Power & EIRP with auto-calc (TxPower + AntennaGain), CPI Verification (required if outdoor), License Reference (required if PAL). Mini band diagram showing requested channel highlight. **Score: 8/10.**

**Issues:**
- CBSD Category A vs B is a binary, but real Cat-B requires AGL ≥ 6 m, omnidirectional or sectorized antenna with specific patterns; the form doesn't capture AGL or pattern.
- 20 MHz bandwidth means 2 *contiguous* channels — the form lets you pick a primary but does not enforce contiguity in the fallback list.
- No PAL channel constraint (Channels 1-7 are PAL-eligible in many counties, 8-15 GAA-only with PPA exceptions).
- No EIRP cap warning if `txPower + antennaGain > 30 dBm/MHz Cat-A` or `47 dBm/10 MHz Cat-B`.

---

## D. Telecom Domain Validation (CRITICAL)

### PCI
- **PCI range 0–503 (LTE) and 0–1007 (NR)** — Both supported. `PCIPlanFormPage` flips max correctly on tech change. `pciPlanMockData.ts` uses `isLTE ? 503 : 1007`. **Correct.**
- **mod-3 collision** — Modeled. Both detail page and conflict page have mod-3 detection. Description says "PSS, signal acquisition" implicitly via the "mod-3 warning" tag color. mod-3 is correct: PSS sequences are derived from PCI mod 3.
- **mod-6 collision** — Modeled as a separate enforce-flag and as a conflict type. **However**, technically mod-6 is **not a standalone class**. mod-6 issues collapse to mod-3 (PSS) + DMRS shift (mod-6 affects RS sequence cyclic shift); calling it out separately is acceptable as a planning convention.
- **mod-30 collision** — Modeled in the toggle (`enforceMod30`). Comment says "Long-period PRACH conflicts" — accurate; mod-30 affects PRACH root sequence allocation. Good.
- **PCI splitting (RRU sharing)** — Not modeled. Carrier aggregation cells often share the same PCI across RRUs. The current data model has one PCI per Cell ID, no notion of an RRU group sharing.
- **PCI confusion in handover** — Modeled. `Confusion` type in conflicts and a dedicated tab in `PCIConflictAnalysisPage`. The "triplet" logic (one cell sees two neighbors with the same PCI) is captured in `Confusion` interface. Suggested action exists. **Good.**

### ANR
- **X2/Xn interface** — Both surfaced in the handover-type dropdown (X2 for LTE↔LTE, Xn for NR↔NR, S1 via core, Inter-RAT). The detail page Configuration card explains the meaning. **Correct.**
- **S1/N2 interface** — Present as "S1 (via core)" in HO type. N2 (NR equivalent) is **missing** — only X2/Xn/S1/Inter-RAT.
- **Add/Remove/Modify trigger criteria** — Not modeled. Real ANR has explicit triggers: ECGI-based add, MR-based add, blind-add. No trigger field on the relation entity.
- **Blacklist support** — Not implemented. There's no `neighborBlacklist` table. Excluded PCIs exist for PCI plans, but not for neighbor pairs.
- **NCRT (Neighbor Cell Relation Table)** — Not modeled. NCRT row attributes (`noHO`, `noRemove`, `noX2`) are absent. Each relation should have these toggles.
- **HO success rate, ping-pong** — Success rate is shown (7d avg + daily bars). Ping-pong is **missing**. A real ANR dashboard surfaces `HoBackPairs / TotalHo` per neighbor.

### CBRS
- **3550–3700 MHz band** — Correctly modeled. `CBRS_CHANNELS` array is 15 channels × 10 MHz, span correct.
- **10 MHz channel granularity (15 channels)** — Correct.
- **Tier 1 (Incumbent)** — Mentioned in compliance events ("Naval Radar DPA"), not actively managed.
- **Tier 2 (PAL)** — Modeled with tier 1-7 (fictional taxonomy; real PAL is per-channel, per-county). License reference captured.
- **Tier 3 (GAA)** — Modeled.
- **DPA (Dynamic Protection Area)** — Mentioned, not visualized. Should be a polygon on a map with current activation state.
- **ESC (Environmental Sensing Capability)** — Not modeled. ESC is the radar-detection sensor network that detects Navy use of 3.5 GHz and forces CBSDs to vacate. **Major gap for production CBRS.**
- **SAS interaction (Registration, Grant, Heartbeat, Relinquishment)** — All six 1.3-spec message types in the interaction log. **Correct.**
- **CPI signing for installation parameters** — Modeled as name + cert ID; no actual cryptographic signature workflow.
- **Antenna AGL accuracy** — **Missing.** AGL is required for Cat-B; the form omits it.
- **Beamwidth, EIRP reporting accuracy** — EIRP auto-computed from TxPower + AntennaGain, but no beamwidth field. Real SAS Reg requires `antennaBeamwidth`, `antennaAzimuth`, `antennaDowntilt`.

---

## E. Data Review

- **PCI conflict heatmap quality** — Visually strong but mock-data driven; mock conflicts are stochastic rather than derived from actual mod-3/mod-6/distance rules. Real product needs the conflict engine to be a pure function `(plan, assignments, sitePositions) → Conflict[]`.
- **Neighbor add/remove suggestions** — Source = geometric heuristics only. Real product reads MR (Measurement Report), HO statistics, PM counters. No data source attribution per suggestion.
- **CBRS grant status real-time?** — No. Mock data is static; no polling, no SSE/WebSocket. Heartbeat last-seen is not tracked.
- **Spectrum utilization view** — `SpectrumPlot` shows per-grant channel occupancy. A network-wide spectrum utilization heatmap (Channels × Sites) is missing.

---

## F. Scalability Review

- **PCI planning at 100K cells.** Current grid renders one DOM node per PCI value (max 1,008) and the assignments table paginates at 20. For 100K assignments across many plans, the Assignments tab works because of pagination, but the Conflict tab will choke. Conflict detection in `buildConflicts` is O(n²) — for n=100K this is 10B comparisons. **Won't scale; needs server-side conflict scanning with spatial indexing (R-tree on cell positions).**
- **Neighbor relations at 1000+ neighbors per cell.** No "neighbors-per-cell" view exists. List page paginates 280 mock rows fine. With 100K cells × 32 neighbors each = 3.2M relations, the current Table approach with `scroll={{ x: 1400 }}` is fine *per page* but discovery becomes hard. Need server-side filter + saved views.
- **CBRS grants at 50K CBSDs.** Dashboard paginates at 20; should scale up. Real issue: heartbeat polling for 50K grants at 60s cadence = 833 heartbeats/sec. The current architecture has no streaming layer.
- **Conflict analysis algorithm scalability.** As noted: rebuild on every render via `useMemo`. Production needs a job-queued scanner with incremental updates on assignment change.

---

## G. AI Opportunities

1. **Auto PCI replan with reinforcement learning.** Given a fixed PCI pool + new sites + collision constraints, RL agent picks PCI assignments minimizing weighted (collisions + mod-3 + neighbor-confusion + handover-cost). Existing Strategy dropdown is a placeholder for this.
2. **Predictive neighbor suggestions from drive test / MR data.** Ingest UE measurement reports, find cell pairs that fall into A3/A4 events but lack a defined relation. Today's suggestion engine is geometric only — no MR ingestion.
3. **AI-based handover parameter optimization.** Per-cell-pair TTT/Hysteresis/CIO tuning based on observed ping-pong rate and HO failure clustering. A "Suggest CIO tweak" badge could show up in the relation detail page.
4. **CBRS grant request prediction (avoid DPA conflicts).** Predict which channels are likely to be reclaimed by an incumbent within the grant period (using historical DPA activations + ESC data). Recommend safer primary + 3 fallbacks. The fallback channel field exists but isn't AI-driven.
5. **Spectrum demand forecasting.** Per-cluster forecast of CBRS channel demand vs available channels, with proactive PAL acquisition recommendations.
6. **Anomaly detection on SAS heartbeats.** Flag grants where heartbeat latency or failure rate drifts.

---

## H. UX & Visualization Improvements

1. **PCI conflict map.** Today the grid is a flat color matrix. A geo-map overlay (sites pinned, conflict pairs drawn as red lines) would reveal *spatial* conflict clusters that the grid hides.
2. **Neighbor relation graph visualization.** Force-directed graph (D3 or Cytoscape) with cells as nodes and relations as edges; color edges by HO success rate; weight by attempts. Today there's no graph view at all.
3. **CBRS channel allocation timeline.** Gantt-style view: row per channel (1–15), columns = time, blocks = active grants per site. Reveals DPA-driven channel churn over a quarter.
4. **3D spectrum view.** Spectrum waterfall (Hz × time × power) is overkill but a per-site 3D pyramid showing PAL/GAA mix over time would be a nice executive view.
5. **PCI replanning what-if simulator.** Side-by-side: current plan vs proposed plan + new sites, with diff highlighted on the grid.
6. **Mod-3 / mod-6 / mod-30 visual filter overlay.** Today the grid colors collisions but not mod-N classes. A toggle "show mod-3 groups" would color cells by `pci % 3` into 3 hues — instantly visible which group is overcrowded.
7. **Neighbor inbox.** "12 auto-suggested neighbors awaiting review" inbox in the top nav for the engineering on-call.
8. **CBRS SAS health bar.** Persistent strip showing connection status to each SAS provider with last-message latency.

---

## I. Technical Architecture

- **SAS integration architecture.** The form models Federated/Google/CommScope/Sony with endpoint URLs, but there's no integration adapter pattern. Real implementation needs a `SASClient` per provider implementing the WInnForum v1.3 message set, with retry, exponential backoff, and per-provider quirks (Federated's PAL signing flow differs from Google's). Today, `cbrsActions.request(values)` returns a local promise.
- **Real-time grant heartbeat handling.** Not implemented. Needs a server-side daemon polling each SAS at the heartbeat interval and writing state changes to an event stream. UI subscribes via WS/SSE.
- **Domain Proxy implementation.** Missing entirely. Enterprise CBRS deployments use a DP for fleet management. The current model treats each CBSD as directly SAS-registered.
- **OSS sync for PCI assignments.** Missing. The freeze/approve lifecycle ends in the planning DB; nothing writes to actual eNB/gNB configs.
- **Code architecture.** The 1,394-line `PCIPlanDetailPage` should be split. Mock data utilities (`pciPlanMockData.ts`, `rfMockData.ts`) mix concerns — would benefit from separating CBRS constants into `cbrsMockData.ts`. The page-level density-aware columns (`useDensityColumns`) and `RoleGate` capability gates are well-implemented and consistent across pages — strong engineering practice.

---

## SCORING

| Dimension | Score | Notes |
|---|---|---|
| Workflow Completeness | **7/10** | PCI lifecycle complete; bulk replan and OSS handoff missing |
| UX Sophistication | **8/10** | PCI grid + Spectrum Plot are best-in-class; needs geo overlay |
| Telecom Domain Accuracy | **7/10** | PCI/HO parameters correct; ESC, DP, AGL, PPA gaps in CBRS |
| Data Intelligence | **5/10** | Mock-only, no MR/PM/SAS real-time, suggestions are geometric |
| Scalability Readiness | **5/10** | UI paginates fine; backend conflict algo is O(n²), no streaming |
| AI Readiness | **4/10** | Suggestion engines exist but are heuristic, not ML |
| **Overall** | **6.3/10** | Strong planning surface; weak on real-time and AI |

---

## TOP 10 PRIORITY FIXES

1. **Unify the conflict engine.** `PCIConflictAnalysisPage` (hard-coded LTE 0–503, fake 80 cells) and `PCIPlanDetailPage` (per-plan, derived from assignments) operate on different data. Refactor into a single `pciConflictEngine.ts` keyed off the real `pciPlans` + `cells` entities, with mod-3/6/30 + collision + confusion + distance rules as pure functions. Update both pages to consume it.

2. **Wire PCI freeze/approve to a downstream OSS export.** Today, freeze is a status change only. Add a "Generate OSS Bundle" action that produces a 3GPP CM XML or vendor CSV export and shows a "Pending OSS Deployment" status until acknowledged. This closes the planning→provisioning loop.

3. **Add bulk PCI re-plan wizard.** Step 1: select target plan + new sites set; Step 2: choose strategy (Sequential, Random, Mod-N optimized); Step 3: preview diff (which existing cells, if any, would have to be reassigned); Step 4: confirm. The current Strategy dropdown is dead UI.

4. **Implement neighbor graph visualization + ping-pong detection.** Cytoscape-based force layout, edge color = HO success, edge width = attempts. Add `pingPongRate` metric to neighbor relation entity and surface it as a chip on the detail page and a filter on the list page.

5. **Add Inter-RAT specifics for EN-DC (NSA 5G).** New fields on the neighbor relation form when relation type = Inter-RAT: SCG bearer config, B1/B2 event thresholds, anchor cell selection, sgNBChange triggers. Today the form is LTE-LTE-shaped even when Inter-RAT is selected.

6. **Add ESC + Incumbent activity panel to CBRS dashboard.** Live feed of DPA activations, with affected sites highlighted, and an "Active Channel Vacates Required" alert. Without ESC awareness the platform is not production-ready for outdoor CBRS.

7. **Implement Domain Proxy (DP) abstraction in CBRS.** New entity `cbrsDomainProxies` (DP id, provider, fleet size, aggregate-grant policies). Group CBSDs under a DP. Surface DP health on the CBRS dashboard.

8. **Make heartbeat real-time.** Server-side heartbeat tracker per grant; UI subscribes via WS to receive `lastHeartbeatAt` updates. Show "last HB Xs ago" prominently. Banner alert if any grant misses 3 consecutive heartbeats.

9. **Expand CBRS form to full 1.3 spec.** Add AGL, beamwidth, azimuth, downtilt, antenna pattern reference, and enforce Cat-B EIRP caps. Add PAL channel constraint check (PAL eligible channels vary by county). Add 20-MHz contiguity validation in fallback channel selector.

10. **Replace geometric Auto-ANR with MR-aware suggestions.** Even with mock data, the scoring should include `simulatedMRStrength`, `historicalHOAttempts`, `currentlyMissingButFrequentlyTriggered`. Add a "why this score?" tooltip that breaks the score into components. Build the data model now so a real ANR engine can plug in later.

---

## Comparison vs Mavenir / Federated Wireless / CommScope SAS

- **vs Mavenir CBRS** (mavO-RAN / MaveriQ Spectrum Manager): Mavenir has full DP, ESC integration, fleet management, and per-vendor CBSD config push. This module lacks DP and ESC; channel/grant workflow is comparable.
- **vs Federated Wireless CINR / Spectrum Portal**: Federated's portal is best-in-class for grant lifecycle visualization (heartbeat timeline, channel churn graphs, PAL/GAA mix). This module's CBRS detail page is structurally similar and the SpectrumPlot is closer than expected; gaps are in real-time data and ESC.
- **vs CommScope SAS Console**: CommScope emphasizes installer (CPI) workflow and Cat-B AGL validation. This module models CPI lightly; AGL is missing. CommScope's PAL Protection Area visualization is map-based — also missing here.

---

## Closing Assessment

The module is a **credible v1** with clear architectural intent and a few standout screens (`PCIPlanDetailPage` PCI grid, `CBRSGrantDetailPage` Spectrum Plot + interaction log, `NeighborRelationFormPage` live geometry validation). Engineering hygiene is good — role gates, density-aware columns, real CSV exports, audit-trail seeding, capability checks. The gaps are predictable for a planning tool not yet wired to a real OSS/SAS backend: no streaming, no real conflict engine, no MR ingestion, no DP/ESC. Closing those gaps is the next 12-month roadmap, not a redesign. The current screens give engineers and PMs a believable surface for **PCI lifecycle, neighbor relation management, and CBRS grant operations** in roughly the right ratio.
