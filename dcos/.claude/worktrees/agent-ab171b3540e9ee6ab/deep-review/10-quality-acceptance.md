# Module 10 — Quality & Acceptance Module Deep Review

**Reviewer:** Telecom QA Architect (20+ yrs ATP/punch/closeout programs at Tier-1 operators & OEMs)
**Module path:** `src/modules/quality-acceptance/`
**Scope:** 28 page files, 11,038 LoC, 19 BR-QAM business rules, 5 entity domains (templates, checklists, acceptance tests, punch, closeout, audits, rework, vendor scoring, gates).
**Comparators:** Sitetracker Quality, Procore Punch List & Closeout, Bluebeam Revu, Aconex Field, Oracle Aconex Closeout.

---

## A. Module Purpose Validation

### Is the module needed? — YES, but boundaries are blurred
Quality & Acceptance (QAM) is the canonical "third-party verification + handover" backbone of any RAN rollout. The module correctly owns: (a) ATP (Acceptance Test Procedure) execution and review, (b) field checklists with evidence, (c) punch lists & defect tracking, (d) QA audits (compliance), (e) rework tracking, (f) vendor quality scoring, (g) quality gates between phases, (h) closeout package assembly & approval. This is the right scope.

### Quality vs Network Readiness — OVERLAP IS REAL
There is observable overlap with the **Network Readiness** module. SoakPeriodMonitor lives in `network-readiness/` yet "soak / KPI stability" is the canonical pre-acceptance gate before BR-QAM-001 (no critical punch open) is enforced. The module does not own KPI stability monitoring nor on-air verification — those are in Network Readiness — but the closeout dashboard surfaces `onAirDate`, `paymentMilestoneTriggered`, `paymentCertificateId` (commercial signals). The split is roughly: NR = "is the site stable?" / QAM = "has it been formally accepted and the dossier signed?". The seam needs explicit policy documentation; the current implementation just hopes operators know.

### Acceptance Tests vs Quality Checks — PROPER SEPARATION
The distinction is correctly drawn in `qamTypes.ts`:
- **Acceptance Tests** (`AcceptanceTest`) — instrumented engineering verification with measurements, thresholds, criteria results, vendor calibration date, approval workflow, retest lineage. Right approach.
- **Quality Checklists** (`ChecklistInstance` + `ChecklistResponse`) — human-driven Pass/Fail/NA inspections with photo evidence, GPS capture, sectionable templates. Right approach.
- These are **two different evidence streams** feeding the same closeout package, which is correct industry practice.

### Closeout vs On-Air — BOUNDARY CLEAR BUT WEAK
Closeout pulls `onAirDate` as a trigger (BR-QAM-018: 30-day deadline after on-air). The on-air event itself is sourced from Network Readiness. The boundary is conceptually clean but architecturally weak — closeout has no listener/webhook for the on-air event; the user has to type the date in the package-create form (`PackageCreate` in `CloseoutPackageAssemblyPage.tsx:213`). At program scale this guarantees data drift.

### Punch vs Defect vs Rework — TERMINOLOGY INCONSISTENT
This is the **single largest taxonomy concern** in the module.
- A **PunchListItem** is created from field inspection (kanban-tracked: open → assigned → in_progress → resolved → verified, plus rejected / deferred).
- A **Defect** is referenced everywhere in dashboards (DefectAnalysisPage, defect Pareto) but has **no entity of its own**. `DefectAnalysisPage.tsx:84` literally synthesizes "DefectRow" objects from audit findings + rework tasks; there is no `db.defects` table.
- A **ReworkTask** is yet a third entity, auto-created from failed acceptance tests (BR-QAM-004).
- A **QaAudit Finding** is a fourth (`audit.findings[]` array inside QaAudit).

In Procore, Sitetracker, Aconex, and AAA, "defect = punch item" — they are the same record with severity and category. Here we have four parallel concepts that all mean "non-conformance" but never reconcile. The Defect Pareto on QualityDashboard is built off `punchListItems`; the Defect Pareto on QualityTrendDashboard is built off vendor-seeded mock; the Defect Pareto on DefectAnalysisPage is synthesized from audits+rework. **Three different Pareto charts compute "the same defect distribution" three different ways**. This must be consolidated.

### Overlap with Checklist Library module
The CLAUDE checklist (Module 27) is a 3-page shell `1,207 LoC`. The Quality module owns the full checklist template authoring/approval/instance workflow already (`ChecklistTemplateBuilderPage`, `ChecklistTemplateApprovalPage`, `ChecklistTemplateListPage`, `ChecklistInstanceReviewPage`, `ChecklistExecutionPage` — 1,840 LoC just for checklists). The Checklist Library module is redundant; it should either merge into Quality or be repositioned as a domain-agnostic library (Safety + Quality + Site Survey checklists reusable across modules). Current state is duplication.

---

## B. Workflow Audit

### Acceptance Test Lifecycle — MOSTLY COMPLETE
States via `acceptanceTestWorkflowState` (`AcceptanceTestReviewPage.tsx:62`): `executed → submitted → reviewed → decided (approved/rejected)`, optional `retest`. The implementation correctly:
- Blocks Approve when BR-QAM-001 unresolved critical punch exists (`AcceptanceTestReviewPage.tsx:357-370`).
- Surfaces BR-QAM-013 calibration-expired advisory (`AcceptanceTestExecutionPage.tsx:321`).
- Auto-creates rework on rejection (BR-QAM-004 — confirmed in actions file).
- Allows "Clear Conditions" for conditional_pass (`AcceptanceTestReviewPage.tsx:404`).
- Spawns retest lineage with `retestReferenceId` linkage (`AcceptanceTestReviewPage.tsx:328-333`).

**Missing states / gaps:**
1. No "**witness test**" concept — Tier-1 operators (Vodafone, T-Mobile, AT&T) require a customer/PM witness for major ATP. There is `testedByOrgId` but no `witnessedBy`, no signature capture, no co-sign.
2. No "**dry run / mock test**" status — pre-formal-acceptance dry runs are routine.
3. **No partial pass / scoped re-test** — currently a retest re-runs the full ATP; in practice you'd re-test only the failed criterion.
4. **No SLA timer** on the submitted → reviewed transition. Reviewer queues can sit for weeks with no escalation.
5. **No bulk approval / batch sign-off** — operators routinely sign 20-50 sites per week; one-by-one is unworkable.

### Punch List Lifecycle — STRONG
The state machine in `PunchListItemDetailPage.tsx:63-79` (`workflowState`) is well-modeled: open → assigned → in_progress → resolved → verified, with rejected (re-cycle) and deferred (skipped) handled correctly. Kanban UI on `PunchListDetailPage.tsx:254-314` is excellent.

**Gaps:**
1. **No cure period** — Tier-1 contracts give vendors a contractual "cure period" (typically 14-30 days for minor, 7 for major, 24h for critical) before liquidated damages. No tracking of cure-period expiry vs LD trigger.
2. **No photo annotation** — defect photos are referenced (`photoIds[]`) but no markup/annotation/redlining (Bluebeam Revu's core differentiator).
3. **No before/after side-by-side** — defect photo + resolution photo should render side-by-side, not in separate tabs.
4. **No location pin on photo** — punch items lack lat/lng of the defect itself (separate from site coords).
5. **No "re-open" workflow** — once verified, a punch item cannot be reopened if the resolution failed a soak test 30 days later.
6. **Bulk-assign is shell only** — `PunchListDetailPage.tsx:349-367` shows a Modal that just calls `message.success(...)` with no actual mutation.

### Closeout Package Lifecycle — GOOD STRUCTURE, WEAK ARTIFACTS
`closeoutWorkflowState` (`CloseoutPackageAssemblyPage.tsx:36`): not_started → assembling → ready_for_review → under_review → approved (with rejected, amended, incomplete). BR-QAM-015 (completeness < 100%) and BR-QAM-018 (30-day deadline) banners correctly block / warn.

**Critical gaps:**
1. **No digital signature / e-sign** — `signatures[]` is a checkbox of "signed: yes/no" with `userName` + `signedDate`. There is no DocuSign / Adobe Sign / e-IDAS / 21 CFR Part 11 integration, no signature hash, no certificate chain. For commercial closeout this is a legal-defensibility blocker.
2. **No "addArtifact" file upload** — `addArtifact('document', 'MANUAL-${Date.now()}')` (line 323) just stuffs a fake ID into an array. There is no actual file ingest, no MIME validation, no virus scan, no checksum, no document versioning.
3. **PDF Preview is a mock** — `PdfPreview` (line 544) renders the URL string, not a PDF viewer.
4. **No bookmark/TOC generation** — Tier-1 closeout PDFs are 200-1,000 pages with mandatory bookmarks (Section A: Civil; B: Electrical; C: RF; D: Safety; E: Test Records; F: Punch; G: Sign-offs). No bookmark structure.
5. **Amendment is justification-text-only** — BR-QAM-017 amendment workflow records a string. In practice an amendment requires a delta artifact log, a new version of the PDF, and a re-signature of affected stakeholders. Missing.

### Quality Gate Enforcement — GOOD MATRIX, INCOMPLETE INTEGRATION
`QualityGateConfigPage.tsx:67-118` exposes a clean from-phase × to-phase matrix per technology/operator. The toggles (`requireChecklistPass`, `requireAllCriticalPunchVerified`, `requireAcceptanceTestPass`, `allowConditionalPass`) are the right four levers.

**Gaps:**
1. The gate **is configured but no screen shows it being enforced**. The phase advance must come from the Site Lifecycle module — there is no integration callback documented.
2. **No SLA / age policy** on the gate (e.g., "block transition if test was older than 30 days").
3. **No bypass / override audit trail** with role + justification — overrides are silently un-implemented.
4. **No vendor-specific gate variant** — toggle exists (`operatorId`) but not vendor.

### Override / Exception Workflow — MISSING
There is no formal "override punch list closure", "waive ATP requirement", "exempt site from gate" workflow with reason codes + approval chain + audit trail. In real programs 5-15% of closeouts are exception-driven; this is a major gap.

### Vendor Quality Scorecard Update — SEMI-AUTOMATED
`VendorQualityScorecardPage.tsx:206` has a manual "Run Scoring Batch" button (`runVendorScoringBatch`). BR-QAM-006 formula: `w1·FirstPass + w2·(1-PunchDensity/10) + w3·(1-ReworkRate)`. The formula is fine but:
- No automated trigger on package approval / month-close.
- No weight-justification policy doc — weights `w1/w2/w3` are stored per-score with no governance.
- No vendor-comparison normalization (different vendor scopes → unfair comparison).

### Rework Tracking — DECENT
`ReworkTrackerPage.tsx` correctly enforces BR-QAM-007 (`reInspectionRecordId` required before complete). Cycle tracking (cycle 1/2/3+) is correct. Aggregate KPIs (avg cycle, avg resolution days, in-flight) are useful.

**Gap:** No **rework cost** captured. `ReworkTask` schema has no labor-hours, no materials cost, no LD value. Rework cost is the #1 financial KPI a CFO wants from the QA module.

---

## C. Screen-by-Screen Review

### 1. QualityDashboard.tsx (711 LoC) — HERO QUALITY FUNNEL — STRONG
The monotonic funnel implementation (`QualityDashboard.tsx:224-267`) is the best computation in the entire module — sites flow stage-by-stage and Closeout Approved is properly capped by Critical Punch Closed (cannot exceed it). Stage drop-off Tag is rendered (line 522). KPI tiles (FirstPass, CriticalPunchOpen, ClosedoutsApproved, QualityScoreAvg) read correctly. BR-QAM-001/011/018 alerts are correctly mapped (lines 313-347).
**Issues:**
- Vendor performance grid (line 286-296) is hard-coded synthetic: `firstPass: 85 - i * 4 + (i % 2 === 0 ? 3 : -3)` — must be replaced with real vendor score data.
- Export emits CSV with `.csv` extension regardless of selected `pdf`/`excel`/`ppt` — broken (line 409).
- Composite Quality Score `Math.round(0.5 * firstPassRate + 0.4 * closeoutRate + 0.1 * (100 - Math.min(100, criticalOpen)))` (line 205) — the third term (100 − criticalOpen) caps the contribution at 0 once 100 critical items open. Should be normalized per total sites, not absolute count.
- No drill-down on the funnel bar to filter the table below by that stage.

### 2. PunchListDashboardPage.tsx (502 LoC) — STRONG
Aging histogram with 5 standard buckets (0-7, 8-14, 15-30, 31-60, 60+) and 4-severity stacking — meets industry standard. Defect Pareto with cumulative % column is correct. KPI strip (8 KPIs) is information-dense but readable. Saved Views integration with `useSavedViews` is well done.
**Issues:**
- "Bulk Assign" placeholder modal (`PunchListDetailPage.tsx:349`) does no work.
- No "**punch list signoff**" workflow — closing a list (`closePunchList`) requires `openItems === 0` but there is no vendor counter-signature.
- Aging axis labels use `60+d` for >60 days — operator programs typically split 60-90 / 90+ to flag chronic issues separately.

### 3. PunchListDetailPage.tsx (374 LoC) — GOOD
Kanban with 4 columns (Open/Assigned, In Progress, Resolved, Verified) is correctly stateful via `itemsByColumn` (line 106). Severity coloured left-border on cards (line 284) is a nice touch. CSV export of items is functional.
**Issue:** No drag-and-drop for kanban — clicks navigate to detail page but you cannot drag a card from "in progress" to "resolved". Procore's punch app has had this since 2018.

### 4. PunchListItemDetailPage.tsx (452 LoC) — VERY GOOD
WorkflowStepper (line 263) shows full state (open→assigned→in_progress→resolved→verified) with rejected = failed at resolved, deferred = skipped. Tabs (Description / Resolution / Verification / Rework History / Audit) are right. Resolve / Reject / Defer / Escalate / Assign all have working modals.
**Issues:**
- "Defect Photos" tab (line 303-317) renders only the photo ID truncated to 14 chars — no actual image, no annotation, no markup.
- No EXIF metadata read (capture time, GPS, device).
- Bulk Assign modal (line 433-447) writes vendor name with `db.update('punchListItems', item.id, ...)` but only for the single open item — not bulk.

### 5. AcceptanceTestExecutionPage.tsx (513 LoC) — GOOD FORM, GAPS
Sticky sidebar with live result (`liveResult`) and criteria pass/fail count (line 466-495) is the highlight — operators get instant feedback. Tool calibration expired (BR-QAM-013) banner (line 321-329) correctly threshold-checks 365 days.
**Test type forms:**
- ATP (VSWR per port + PIM + alarm count) — present.
- MW commissioning (RSL/BER/availability) — present.
- Walktest (coverage/throughput/roaming handoff) — present.
- PIM test (PIM dBc + coverage) — present.
- Generic (metric_a/metric_b) — fallback.

**Missing test types (critical):**
- **Physical infrastructure ATP** — tower verticality measurements, anchor torque values, grounding resistance per pad, lightning rod height, climb safety (ladder/cage/fall arrester).
- **Power ATP** — load bank test, battery autonomy run-down, ATS transfer time, generator start time, fuel level, ground fault interrupt, breaker coordination study.
- **Backhaul fiber ATP** — OTDR trace, dB loss budget, ORL, BER over 24h.
- **Civil works ATP** — concrete cube test (28-day strength), reinforcement cover, weatherproofing test.
- **Safety ATP** — fire detection, smoke, FM200/Novec gas suppression, RFID/biometric access, CCTV.
**Other gaps:**
- No raw data file upload (only a string `rawDataFileId` text field).
- No bulk-import from instrument CSV (Anritsu, Rohde & Schwarz, Viavi).
- No pre-test environment check (weather thresholds — wind speed, temp).

### 6. AcceptanceTestReviewPage.tsx (622 LoC) — STRONG
List mode + detail mode in one file is conceptually heavy but works. Criteria Results bar widget (line 432-447) is intuitive. BR-QAM-001 block banner correctly enumerates critical blockers (line 357-369). Retest lineage tab (line 532) shows parent + child chain.
**Issue:** Criteria visualization width formula `Math.abs(c.measured) % 100` (line 435) is **wrong** — for VSWR=1.18 it renders 18% bar (meaningless); for PIM=-150 it renders 50% bar. The bar should normalize to threshold proximity. Currently it produces visually false-positives.

### 7. AcceptanceThresholdConfigPage.tsx (209 LoC) — ADEQUATE
Grouped by test type via Collapse; inline editable threshold rows. Defaults reference panel (line 105-112) lists ATP/MW/WiFi/DAS canonical values.
**Issue:** Threshold versioning is **absent** — when an operator updates VSWR limit from 1.5 to 1.3, the historical tests still pass (computed retroactively). No "effective date" field on threshold.

### 8. ChecklistExecutionPage.tsx (386 LoC) — VERY GOOD MOBILE-FIRST DESIGN
Pass / Fail / N/A 3-button bank (40px height, color-coded, fontWeight 600) is mobile-tappable. Failure reason required when status=fail (line 278). GPS capture with BR-QAM-012 distance check (line 85-97) is correctly implemented. Mandatory item gating (line 99-100) prevents submit.
**Gaps:**
- "Add Photo" creates a fake ID `PHO-MOCK-${Date.now()}` — no camera intent, no upload, no compression.
- No offline-first / IndexedDB queue — field inspectors often have no signal.
- No voice-to-text for notes (huge field-time saver).
- No barcode/QR scan for equipment serial verification.

### 9. ChecklistInstanceReviewPage.tsx (346 LoC) — GOOD
Donut chart of Pass/Fail/N/A/Pending (line 187-224) is hand-rolled SVG (correct). Failed-by-section bar chart (line 125-140) is useful for triage. Review tabs (Responses, Photos, Failed Items, Review Decision, Audit Trail) cover the cases.
**Issue:** Failed items tab renders cards but doesn't link to creating a punch item — the most natural next action.

### 10. ChecklistTemplateApprovalPage.tsx (190 LoC) — STRONG
BR-QAM-014 conflict detection (line 25-33) correctly warns when active peer template exists for same tech/phase/scope/operator. The "Compare with active version" diff (line 152-188) marks items as "New" if not in the prior peer — useful UX.
**Issue:** Diff is text-equality only — no semantic diff (e.g., threshold changed, evidence count changed) and no side-by-side.

### 11. ChecklistTemplateBuilderPage.tsx (427 LoC) — GOOD
Drag-via-arrow-buttons reordering, section grouping, per-item evidence + measurement + failureAction config, live preview sidebar (line 215-251), validation checklist (line 224-239). Conflict detection sidebar (line 226-235) matches the approval page.
**Issues:**
- Item edit is in a `Modal.confirm` (line 358) — modal-in-modal pattern is fragile.
- No drag-and-drop (arrow buttons only).
- No copy-from-existing-template (template re-use is rampant in field ops).
- No item branching ("if Q5 = fail, ask Q5a") — modern field forms (FormBakery, Procore Inspections) all have conditional logic.

### 12. ChecklistTemplateListPage.tsx (298 LoC) — STRONG
The **Technology × Phase Coverage Matrix** (line 130-189) is the best visualization in the module — colour cells (green = active approved / amber = pending / grey = draft / red = missing) instantly show gaps. Filter chips, search, KPI row all functional.

### 13. CloseoutPackageAssemblyPage.tsx (600 LoC) — STRUCTURED, ARTIFACT-WEAK
List/Create/Detail trinity in one file. Gauge SVG (line 447-461) shows completeness. Missing Items pane with 5 categories (Documents/Tests/Checklists/Photos/Signatures) and per-row "Add" action (line 386-410). Workflow stepper, BR-QAM-015/018 banners, amendment audit tab.
**Critical issues:**
- "Add" button creates a fake ID with `Date.now()` (line 401) — no file upload.
- Photos rendered as grey number-only divs (`PhotoGrid` line 503-516) — no thumbnails, no lightbox.
- Signatures table (line 519-542) is a checkbox table — no actual signature image.
- PDF preview (line 544-555) is text-only.
- "Submit for Review" appears twice in the action bar when status = ready_for_review (line 320 + 324-329).

### 14. CloseoutPackageStatusDashboardPage.tsx (304 LoC) — STRONG VISUAL
Site × Scope heatmap (line 196-241) with hover scale animation; 8-KPI strip; 5-bucket aging chart (0-7/8-14/15-30/31-60/60+); Top Bottlenecks table; Top Missing Items chip cloud. This is the most polished dashboard in the module.
**Issues:**
- Heatmap distributes packages "deterministically via hash of id" (line 56-66) — this fakes coverage; real implementation must pull actual scope per package.
- Sites limited to first 30 (`db.getAllRaw('sites').slice(0, 30)`) — does not scale.

### 15. CloseoutPackageTemplateManagerPage.tsx (408 LoC) — GOOD
Template CRUD with chip-list quick builder + advanced JSON view + RoleGate on save. Required Items: Documents/Tests/Checklists/Signatures with mandatory + must-pass flags. Min photo count, "require all critical punch closed", "require all major punch closed" toggles.
**Issue:** Test type chip is constrained-enum (must use the Select), document/checklist/signature types are free-text strings — risk of "Project Manager Signature" vs "PM Sign-off" being treated as different requirements. Need a controlled vocabulary.

### 16. CloseoutStatusDashboardPage.tsx (281 LoC) — HARD-CODED MOCKS
This page is 95% literal arrays (`PIPELINE_DATA`, `TECH_CLOSEOUT`, `TREND_DATA`, `MISSING_ITEMS`, `MOCK_PACKAGES`). The KPIs do not reflect actual `db.getAllRaw('closeoutPackages')`. The Payment Impact card (line 261-273) shows a hard-coded `$4.2M`. This is demo-only and would mislead an executive walkthrough.

### 17. QualityGateConfigPage.tsx (225 LoC) — STRONG MATRIX
Phase Transition Matrix with greyed-invalid-cells (lower-left triangle) + per-cell mini-config (4 toggles) + table of all gates. The "+Configure" hover-to-create on empty cells is excellent UX.
**Issue:** No simulation/preview of "if I enable this gate, X sites would be blocked from advancing".

### 18. QualityTrendDashboardPage.tsx (556 LoC) — GOOD, NEEDS REAL DATA
Custom LineChart SVG with hover crosshair + tooltip — excellent UX. Multi-series (Acceptance/Density/Rework) with toggle chips. Multi-vendor comparison radar (4 vendors max). Mini Pareto for current month.
**Critical issue:** All series are generated by `genSeriesForVendor()` (line 58) which is `seededFloat()` — these are deterministic random numbers, not real KPIs. Y-axis label "normalized 0-100 index (density ×10)" admits this is a hack. **No Statistical Process Control (SPC) — no control chart, no UCL/LCL bands, no Western Electric run rules detection.** This is the single biggest miss for a quality module — SPC is the de-facto quality engineering standard since 1924.

### 19. DefectAnalysisPage.tsx (580 LoC) — STRONG PARETO, FAKE DATA
Pareto chart (vertical SVG + cumulative line) and horizontal-bars variant via Segmented toggle. Category × Severity heatmap. Top 10 Root Causes panel. Drill-down table with cumulative %.
**Critical issues:**
- Defect rows are synthesized from `audit.findings + reworkTasks` (line 84-118) — there is no canonical defect table. Two parallel data sources double-count or miss-count depending on flow.
- Root causes are **hard-coded literals** (`ROOT_CAUSES` line 69-82) with `Math.sin(i+1)` for the counts (line 193-196). No actual root-cause analysis pipeline.
- Click-to-drill on bars (line 431) navigates to `/quality/punch-lists?category=...` — good. But the punch-list page reads from `punchListItems`, while DefectAnalysis reads from `audits+rework`. The drill-in counts will not match the dashboard counts.

### 20. DefectAnalysisParetoPage.tsx (16 LoC) — STUB / SHIM
Pure shim that renders `<DefectAnalysisPage initialView="pareto" />`. The IA rationale comment explains the Pareto-as-chart-type decision. **This is correctly a shim — not a gap.** The 16-line file is intentional and good. (The review-spec assumption that it is a "STUB to be filled" is incorrect.)

### 21. ReworkTrackerPage.tsx (535 LoC) — STRONG
KPI hero (Active Rework / Completed / Avg Cycle / Re-Inspection Pending) with status colors. Cycle Distribution stacked-by-technology hero chart. Full table with Start/Complete/Cancel quick actions. BR-QAM-007 enforces re-inspection record ID before complete (line 188-191).
**Gap:** No rework **cost** (labor-hr × rate + materials). No "rework cause" — chargeable to vendor vs operator-caused vs design-error. This is the single biggest financial gap.

### 22. VendorQualityScorecardPage.tsx (438 LoC) — VERY GOOD
3-axis radar chart (FirstPass / PunchQuality / ReworkQuality) for top 4 vendors. Leaderboard tiles with band coloring (Excellent ≥85 / Acceptable ≥70 / At Risk <70). Per-vendor cards with sparkline + 3 metric tiles + tooltip showing weights. BR-QAM-006 weighted formula correctly applied.
**Gaps:**
- No SLA compliance axis (on-time delivery is a separate dimension).
- No safety incident integration (HSE module is module 13 — sibling).
- No vendor self-service portal.
- No corrective-action plan tracker per at-risk vendor.

### 23. QAAuditListPage.tsx (472 LoC) — STRONG
Audit register with type/scope/status/findings/rating columns. Hero KPI row. Compliance Distribution stacked bar + per-vendor breakdown. "Run Monthly Sample" button (BR-QAM-005) for random sample audits. Filters + Saved Views.

### 24. QaAuditExecutionPage.tsx (618 LoC) — GOOD
Create/Edit/Detail/Execute trinity. Findings dashboard with Critical/Major/Minor tiles + category bar chart. Tabs (Checklist Execution, Findings, Corrective Actions, Report, Follow-Up, Audit Trail). State-aware buttons (Start when scheduled / Complete when in_progress / Schedule Follow-Up when major or minor NC). Report download produces a real .txt file.
**Issues:**
- Checklist Execution tab (line 332-371) is HARD-CODED 8 items (C1-C8) regardless of `audit.auditChecklistId`.
- Audit trail fallback to synthetic events (line 524-545) when none exist — clever but masks data gaps.
- "Add Finding" modal works but does not capture photos, location, or affected equipment.

### 25. TechAcceptanceListPage.tsx (177 LoC) — REDUNDANT
Per-technology list page (macro / small-cell / wifi / das / mw / power / c-ran / site-sharing) with hard-coded `MOCK_PACKAGES` and `TECH_CONFIG`. Duplicates the canonical AcceptanceTestReviewPage with worse data. **Should be deleted or unified.**

### Additional non-listed pages:
- **CloseoutDashboardHub** (42 LoC) — Tab hub combining CloseoutStatusDashboard + CloseoutPackageStatusDashboard. Correct IA decision.
- **QualityListPage / QualityDetailPage** — generic Quality "record" list and detail. Unclear if these are entity-correct or redundant with the more specific pages.

---

## D. Telecom Domain Validation

### ATP Coverage Assessment
| ATP Category | Implementation Status |
|---|---|
| Physical infra (tower verticality, anchor, grounding, ladder) | **MISSING** — no specific form |
| RF ATP (PCI, sectors live, neighbor, RSRP, throughput) | PARTIAL — ATP form has VSWR/PIM/alarms; no PCI/neighbor verification |
| Power ATP (load bank, battery autonomy, ATS transfer) | **MISSING** — no form |
| Backhaul ATP (link up, latency, BER, availability) | PRESENT — MW form has RSL/BER/availability |
| Civil works ATP (cable tray, weatherproof, anti-rust) | **MISSING** |
| Safety ATP (fire/smoke/FM200/RFID) | **MISSING** |

**Verdict:** RF + MW + WiFi + DAS PIM are covered. The other 60% of an industrial RAN ATP is missing — particularly civil, power, safety.

### Punch List Severity Categories — STANDARD-COMPLIANT
`Severity: critical | major | minor | observation` (`qamTypes.ts`) — matches ITU-T M.3010 and Sitetracker/Procore conventions. Color tiers in `PunchListDashboardPage.tsx:73-78` (deep red / bright orange / amber yellow / slate) — semantically correct.

### Defect Categorization
**By severity:** YES (critical/major/minor/observation).
**By category:** YES (10 categories — `DEFECT_CATEGORIES` from common.ts; visible in dashboards).
**By vendor responsibility:** PARTIAL — `assignedToOrgId/Name` on item; no "responsible party" vs "assigned to fix" distinction (these are different in contracts).
**By root cause:** **MISSING** — no `rootCause` field on punch item; the DefectAnalysis root-cause panel is hard-coded.
**First-pass acceptance rate:** YES — `firstPassRate` calc on QualityDashboard, KpiTile on QualityTrendDashboard.
**Rework cost:** **MISSING** — no cost field anywhere.

### Closeout Package Required Artifacts
Standard Tier-1 closeout package contents vs implementation:
| Artifact | Implementation |
|---|---|
| As-built drawings (civil, electrical, RF) | Type only — no file ingest |
| Site photos (4 sides, equipment, grounding, sectors, MW LOS, signage) | Count only, no thumbnails |
| BOM with serial numbers | Not modeled |
| Test records (ATP results) | LINKED via `acceptanceTestsIncludedIds` — good |
| Punch list (closed with evidence) | Not explicitly linked to closeout |
| Attestation/sign-off forms | Signatures table — no actual e-sign |
| Vendor closeout certificate | Implicit via signatures |
| Operator acceptance certificate | Not modeled |
| Lease abstract | **MISSING** — should pull from Lease Management module |
| Permit copies | **MISSING** — generic "Documents" only |
| RF design baseline (frozen at handover) | **MISSING** |
| Commissioning report | **MISSING** as a distinct artifact |

### Quality Gate Sequence — CORRECT BUT INCOMPLETE
The phase sequence in the matrix (`PROJECT_PHASES`) implies: pre-installation → installation → integration → commissioning → on-air → closeout. Missing intermediate: **soak / KPI stability** (lives in Network Readiness but should be a gate input). Also missing: **acceptance walk** as a discrete phase between commissioning and on-air.

### Compliance Standards — NOT REFERENCED ANYWHERE
The code makes **zero reference** to:
- TIA-322 (steel tower structural)
- ASCE 7 (loads)
- ANSI/EIA-222 (legacy tower standard)
- IEEE 1100 (Emerald Book — grounding)
- Motorola R-56 (telecom grounding)
- ITU-T G.984 / G.987 (fiber backhaul)
- IEEE 802.11 series (WiFi)
- 3GPP TS 36.214 / 38.214 (LTE/NR measurements)
- 47 CFR Part 17 (FAA tower marking/lighting in US)
- IEC 60364 (electrical installation)

A real ATP report cites the standard each test verifies against. The system has zero linkage from threshold → standard reference. This is a **certification/audit-readiness blocker**.

---

## E. Data Review

| Data Element | Status | Notes |
|---|---|---|
| First-Pass Acceptance Rate | CORRECT | `passedTests / totalTests` — sound |
| Critical Punch Open | CORRECT | sums `criticalItemsOpen` per list |
| Closeouts Approved | CORRECT | filters by status approved/amended |
| Quality Score Avg (composite) | **FLAWED** | 100−Math.min(100, criticalOpen) caps at 0 once 100 critical items open across program — should normalize per site |
| Defect Pareto | INCONSISTENT | Three different sources across three pages (punchItems / mock-seed / audit+rework) |
| Vendor first-pass / density / rework | CORRECT formula | But Quality Dashboard uses hard-coded array; ScorecardPage uses real |
| Gate compliance % | TOO SIMPLE | sample size 20 sites only; binary pass/fail |
| Aging histogram 5 buckets | STANDARD | 0-7/8-14/15-30/31-60/60+ matches industry |
| DefectAnalysisPareto STUB (16 lines) | NOT A GAP | Correctly designed as a shim; Pareto is a chart-type |
| CloseoutDashboardHub (42 lines) | CORRECT | Tab hub merging two dashboards |

### Specific data bugs
1. **AcceptanceTestReviewPage criteria bar width** (line 435) — `Math.abs(c.measured) % 100` produces visually misleading bars (VSWR=1.18 → 18% bar).
2. **Vendor performance synthetic** in QualityDashboard (line 286-296) — formula `85 - i*4 + (i%2===0 ? 3 : -3)` is deterministic mock.
3. **Heatmap site×scope distribution** (CloseoutPackageStatusDashboardPage line 56-66) — hashes package ID to fabricate scope distribution.
4. **CloseoutStatusDashboardPage** (entire page) — 95% hard-coded arrays.
5. **DefectAnalysis root causes** — hard-coded strings + `Math.sin(i+1)` counts.
6. **QualityTrendDashboard** — all series generated by seeded random, no real telemetry.

---

## F. Scalability Review

### 100K+ punch items
`db.getAllRaw('punchListItems')` and `db.getAllRaw('punchLists')` are used everywhere without pagination, lazy load, or virtualization. The PunchListDashboardPage builds `rows` then `filtered` then renders a Table with `pageSize: 25`. At 100K items the in-memory aging histogram + Pareto + filter pipeline would lag the UI > 2-3 seconds and consume ~30-50 MB of JSON in browser memory. **Cannot scale.**

### 1000s of templates
ChecklistTemplateListPage uses Coverage Matrix (Tech × Phase × N templates per cell) — at 1000 templates × ~8 techs × 6 phases = sparse but renderable. Builder/Editor pages OK. Approval queue: no SLA / no batch approve.

### Closeout package storage
`addArtifact` is a no-op (just appends an ID). Real implementation needs S3/Azure Blob, CDN, document versioning. Currently the system would balloon a single mock-db record. PDF generation is mock. At 1,000 packages × 200 documents × avg 5 MB = 1 TB — not modeled.

### ATP test record volume
At Tier-1 RAN scale (15,000 sites × 8 test types × 3 retests average) = ~360,000 records. The list page renders pageSize=25 from in-memory full set — needs server-side pagination, faceted search, indexed by test type/result/approval/site/vendor/date. None implemented.

### Photo / document upload pipeline
**Zero infrastructure** — photos are mock IDs only. Need: multipart upload, EXIF strip, virus scan, thumbnail generation, lightbox viewer, annotation overlay, cloud CDN, retention policy.

---

## G. AI Opportunities (Strategic Roadmap)

1. **AI defect categorization from photos** — high-value. CNN/ViT on punch defect photos → auto-tag category (grounding / cable / civil / labeling). Field photos accumulate already.
2. **Predictive punch list completion** — ML regression on historical (size, severity, vendor, season) → predict close date; alert on high-risk-of-overdue at creation.
3. **Vendor quality prediction** — time-series LSTM on quality scores; predict next-month at-risk vendors 30 days early. Enables proactive intervention.
4. **Auto-RCA on recurring defects** — clustering / association mining over defect text + photos to group repeat issues; surface "top emerging defect cluster".
5. **AI closeout document checker** — LLM + OCR to validate as-built drawing has all callouts; verify signature page is signed; check that test record PDF matches submitted criteria.
6. **SPC (Statistical Process Control)** — control charts (X-bar-R, p-chart, c-chart) with UCL/LCL + Western Electric run rules to detect process drift. **Bigger miss than any AI feature** — SPC is what real quality engineering teams expect.
7. **LLM-generated closeout summary** — auto-generate the closeout package executive summary from artifact list, key test results, and punch closure history. Currently a manual narrative.
8. **AI auto-acceptance** — BR-QAM-019 already defines `confidence threshold` but no implementation. With high-confidence tests + clean punch list + complete artifacts, auto-approve and route exceptions only.
9. **Field inspector copilot** — voice-to-text dictation for failure reason; AI-suggested corrective action from defect description.
10. **Vendor scorecard explanation** — LLM-generated "why is Vendor X at risk?" narrative grounded in the underlying metrics.
11. **GenAI test plan author** — describe the site/scope; generate a tailored ATP test plan.
12. **Audit risk scoring** — model that ranks sites by audit-priority (last audit date, vendor risk, recent rework rate, severity history).

---

## H. UX & Visualization Improvements

1. **Site Quality Scorecard** — a single per-site rollup page (one card showing first-pass, punch density, rework cycles, closeout completeness). Today the per-site quality story is fragmented across 5+ pages.
2. **Punch heatmap by region / vendor** — grid view "vendor × region → punch density" with cell drill. Currently only Defect Heatmap (category × severity).
3. **Closeout progress flowchart** — visual swim-lane showing all artifacts per package + their status (uploaded / approved / missing) instead of the current Tab list.
4. **Mobile inspector view** — a dedicated mobile-first checklist execution screen (Module 29 mobile) with offline mode + photo capture + voice notes.
5. **AR-assisted ATP verification** — overlay design tilt/azimuth on camera view to verify sector orientation in real time (in field).
6. **Before/after photo side-by-side** for punch items (currently in separate tabs).
7. **Photo annotation/markup** (arrow/circle/text) on defect photos — Bluebeam-style.
8. **Drag-and-drop kanban** on punch list (currently click-to-detail).
9. **Bulk operations** — bulk approve tests, bulk assign punch items, bulk close completed packages.
10. **Inline editing** in tables (e.g., change punch due date without opening detail).
11. **Saved views shared across team** (currently per-user local).
12. **Closeout package preview** — actual PDF.js renderer with bookmarks (not text-stub).
13. **Real-time collaboration** — see who else is reviewing the same checklist (presence avatars).
14. **Dark mode + density toggle** — the `useDensityColumns` hook is already in use; UI lacks the density toggle exposed prominently.
15. **Comparator-style site-vs-baseline visualization** for retest deltas.

---

## I. Technical Architecture

### Persistence model
All entities live in an in-memory mock DB (`src/mock/db`). No server, no API contract, no backend integration. ALL pages call `db.getAllRaw(...)` directly. There is no service layer / repository / query model. At scale this needs:
- Server-side pagination + faceted search (Elasticsearch / OpenSearch).
- A query language for dashboards (GraphQL or REST with field selection).
- Caching tier (Redis) for KPI rollups.
- Materialized views for defect Pareto / aging histogram (recompute on event, not on render).

### Closeout package storage
Currently artifacts are string IDs in arrays. Needs:
- Object store (S3 / Azure Blob / GCS) with signed URLs.
- Document service with version, checksum, retention, redaction, watermark.
- Tied to legal-hold rules.

### Photo / document upload pipeline
**Entirely absent.** Needs: multipart resumable upload (tus.io), thumbnail service, EXIF strip + safe-fields keep, virus scan (ClamAV), MIME validation, image annotation service.

### Template versioning
`createNewVersion` exists for both checklist and closeout templates — but instance pages do not snapshot the template at instantiation. If template v2 is approved, in-flight instances of v1 don't lock. Risk: post-approval template edits silently change historical instance interpretation.

### Quality gate integration with OSS
Quality gates are configured but **never integrated** with the Site Lifecycle phase advance. There is no `evaluateGate(siteId, fromPhase, toPhase)` API exposed to Site Lifecycle, no event bus emission on gate-pass/fail, no webhook to OSS or PPM.

### Three Defect Sources
The biggest architectural anti-pattern: three separate sources of truth for "defects" — `punchListItems`, `qaAudits.findings`, `reworkTasks` — with no reconciliation. Should be unified behind a single `Defect` entity with provenance pointer (raised from audit / from checklist / from acceptance test / from punch / from rework).

### DefectAnalysisPareto STUB — NOT A CONCERN
The 16-line shim is intentionally a thin alias for `DefectAnalysisPage` with `initialView="pareto"` pre-selected. This is the correct IA approach (Pareto is a chart-type, not a page). The shim preserves the legacy route. Confirmed not a gap.

### Cross-module coupling
- Pulls `siteId` / `siteCode` from Site Lifecycle (sound).
- Pulls `vendorOrg` from QAM_VENDORS hard-coded list — should come from Vendor & Stakeholder module.
- Closeout `onAirDate` should be event-sourced from Network Readiness.
- Closeout payment milestone should publish to Financial Management.
- Audit findings should publish into HSE incident pipeline (if safety-related).
- None of these integrations exist.

---

## SCORING

| Dimension | Score | Rationale |
|---|---|---|
| Workflow Completeness | 7/10 | State machines are correct and well-modeled; missing witness, cure period, override, batch, real signatures |
| UX Sophistication | 7/10 | Multiple polished hero visualizations (funnel, kanban, radar, heatmap, hover-chart) — but no DnD, no annotation, no real-time collaboration |
| Telecom Domain Accuracy | 6/10 | RF/MW/WiFi/DAS ATPs present; civil/power/safety/fiber ATPs absent; zero standard references |
| Data Intelligence | 5/10 | Three defect sources, hard-coded vendor stats, mock trend series, fake root-cause counts, fake closeout payment data |
| Scalability Readiness | 4/10 | Full in-memory scan everywhere; no server pagination; no document infra; cannot scale beyond ~5,000 records |
| AI Readiness | 6/10 | BR-QAM-019 confidence threshold stubbed; sound hooks for SPC / photo CNN / LLM closeout summary; nothing actually wired |
| **Overall** | **6/10** | Strong UX shell over an incomplete, partially-faked, scaling-unready core |

---

## TOP 10 PRIORITY FIXES

1. **Unify defect taxonomy** — collapse `punchListItem` / `audit.finding` / `reworkTask` / "Defect" into one `Defect` entity with provenance pointer. Eliminates three contradictory Pareto charts.
2. **Replace mock CloseoutStatusDashboardPage** — wire the 95% hard-coded arrays to real `db.getAllRaw('closeoutPackages')` queries (the data exists, it's just not connected).
3. **Add file upload + e-signature infrastructure** — without real artifact ingest and verifiable signatures the closeout module is not legally defensible. This is the largest single capability gap.
4. **Add SPC (control charts) to QualityTrendDashboard** — X-bar-R / p-chart / c-chart with UCL/LCL + Western Electric rules detection. The single biggest miss for "quality" software.
5. **Add missing ATP forms** — civil, power, safety, backhaul-fiber. Without these the system only covers RF + MW + WiFi + DAS = ~40% of an industrial ATP.
6. **Fix Quality Score composite formula** — normalize critical-punch term per site (or per ten sites) instead of absolute count. Current formula maxes out the penalty at 100 program-wide criticals.
7. **Fix AcceptanceTestReviewPage criteria bars** — replace `Math.abs(c.measured) % 100` with threshold-proximity normalization; current visual is misleading.
8. **Implement bulk operations** — bulk approve tests, bulk assign punch, bulk close packages. Without these the system is unworkable above ~50 sites/week.
9. **Wire Quality Gate enforcement** — gates are configured but never called from Site Lifecycle phase advance. Add `evaluateGate(siteId, from, to)` event and SLE consumes it.
10. **Add rework cost** — labor-hours, materials, LD value, chargeability (vendor / operator / design). The single biggest CFO-facing miss.

---

## COMPARATOR BENCHMARKS

| Capability | This Module | Sitetracker Quality | Procore Punch | Bluebeam Revu | Aconex Field |
|---|---|---|---|---|---|
| Kanban punch board | YES | YES | YES (best-in-class) | n/a | YES |
| Photo annotation | NO | partial | YES | YES (best) | YES |
| Drag-drop kanban | NO | YES | YES | n/a | YES |
| Offline mobile | NO | YES | YES (best) | n/a | YES |
| Real e-sign | NO | YES (DocuSign) | YES | YES | YES (best) |
| PDF bookmarks/TOC | NO | YES | YES | YES (best) | YES |
| SPC charts | NO | partial | NO | NO | NO |
| ATP form library | partial | YES | NO | NO | YES |
| Bulk operations | NO | YES | YES | YES | YES |
| Vendor scorecard | YES (good) | YES | partial | NO | YES |
| Standards refs | NO | YES | partial | YES | YES |
| AI auto-categorize | NO | YES (recent) | partial | partial | YES |

The module's strengths are the funnel, kanban, radar, heatmap, hover-chart visualizations — these match or exceed comparators. Its weaknesses are foundational: real file ingest, real signatures, real document infrastructure, real telemetry pipelines.

---

## Key file references (absolute paths)

- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/QualityDashboard.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/PunchListDashboardPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/PunchListDetailPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/PunchListItemDetailPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/AcceptanceTestExecutionPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/AcceptanceTestReviewPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/AcceptanceThresholdConfigPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/ChecklistExecutionPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/ChecklistInstanceReviewPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/ChecklistTemplateApprovalPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/ChecklistTemplateBuilderPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/ChecklistTemplateListPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/CloseoutPackageAssemblyPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/CloseoutPackageStatusDashboardPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/CloseoutPackageTemplateManagerPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/CloseoutStatusDashboardPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/CloseoutDashboardHub.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/QualityGateConfigPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/QualityTrendDashboardPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/DefectAnalysisPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/DefectAnalysisParetoPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/ReworkTrackerPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/VendorQualityScorecardPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/QAAuditListPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/QaAuditExecutionPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/pages/TechAcceptanceListPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/lib/qamCommon.ts`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/quality-acceptance/lib/qamTypes.ts`
