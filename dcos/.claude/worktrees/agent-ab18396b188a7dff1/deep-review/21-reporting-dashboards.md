# Deep-Dive Enterprise Review — Module 21: Reporting & Dashboards

**Reviewer:** World-Class Telecom Reporting & BI Architect (20+ yrs, Tier-1 operator dashboards, Tableau / Power BI / Looker / Snowflake / Databricks)
**Module:** `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/reporting-dashboards/`
**Scope:** 23 page files (~10,500 LOC) + 14 lib files (~3,950 LOC) + 1 component (250 LOC)
**Benchmarks:** Power BI, Tableau Server/Online, Looker (LookML), Qlik Sense, Sisense, Domo, ThoughtSpot, Ericsson Operations Engine, Nokia AVA Insights, Huawei IDS.
**Date:** 2026-05-26

---

## EXECUTIVE VERDICT

This module is the single most credible part of the entire RAN platform reviewed so far. The ExecutiveDashboard (928 LOC) is genuinely best-in-class for a rollout PMO: it derives a 3-state verdict (ON TRACK / AT RISK / BEHIND) from live S-curve variance, drives every visual off the same mock DB, includes a regional × phase clickable heatmap, and ships a deterministic AI strategic-read. The data layer is architecturally serious — separate seeders for KPIs (`kpiData.ts` 332 LOC, 18 KPIs across 6 categories with formulas/thresholds/12-month trends), S-curves with rebaseline audit (`sCurveData.ts`), report engine actions with BR-RPT-006/007/011/012 enforcement (`reportEngineActions.ts` 446 LOC), and aging thresholds with phase × technology override matrix.

**However, this module is a façade over a generic mock DB, not a real BI/reporting platform.** It has zero data-warehouse connectivity, zero real BI tool integration (Power BI Embedded / Tableau JS API / Looker iframes), no semantic layer, no caching strategy, no dimensional modeling, no real OLAP / drill-anywhere, no comparative-period analysis, no cohort/wave analysis, no real PDF/PPT/Excel export (everything is text-blob faked), no real ETL or data freshness contract, no row-level security, no scheduled-distribution audit trail beyond a mock execution table, and the 23 "dashboards" are 23 hand-coded React pages — not configurable artifacts driven by metadata. The Report Builder is a 672-LOC drag-drop simulation that produces no real query and saves to `reportTemplates` rows that nothing actually runs. The KPI management page defines 18 KPIs that nobody computes — `lastCalculatedDate` is set at seed time and never refreshed.

**Verdict: World-class demo. ~30% of a real enterprise BI platform.** To compete with Power BI / Tableau the team must (a) replace 23 hand-coded pages with a metadata-driven dashboard runtime, (b) build a real semantic layer over a warehouse, (c) implement actual exports + scheduled distribution backed by a queue, and (d) plug in Power BI Embedded or Tableau JS for self-service ad-hoc.

---

## A. MODULE PURPOSE VALIDATION

### A.1 Charter

The module charter (from the file headers) is to be the **"single pane of glass for rollout reporting"** — Executive, Program, Project, Operational dashboards + an ad-hoc Report Builder + KPI Management + Scheduling + Distribution. This is the correct charter for a Tier-1 telecom PMO BI tier.

### A.2 Boundary clarity — MIXED

**Clean:** S-curve, Aging, Bottleneck, Region Heatmap, Power Funnel, MW Link Summary, Vendor Performance, Tech Progress, C-RAN Utilization — these are domain-specific operational reports that legitimately belong here as canonical PMO views.

**Boundary violations / overlaps:**
- **HomeDashboard.tsx vs ReportsDashboard.tsx** — two separate "reports library" landing pages with overlapping intent (one is the category-tabbed v2 Hub, the other is an older v1 card grid of 7 hand-coded templates with `setCustomTemplates([...])` local-state-only persistence). One of these is dead and confusing.
- **NetworkSnapshotPage** (`/insights/network-snapshot`) is mixed into Reporting but explicitly states it's a *read-only window into the Operations Platform* (Fault, Performance, Configuration, Provisioning, ITSM). This page belongs in an Operations module — it has hard-coded mock arrays (`AVAILABILITY_TREND`, `FAULT_HEATMAP_REGIONS`, `WORST_SITES`, `RECENT_CHANGES`, `OPEN_TICKETS` — lines 45-117 of NetworkSnapshotPage.tsx) with no DB integration whatsoever.
- **SiteSummaryCardPage** is a per-site "passport" — it's more of a Site Lifecycle drill view than a Report. Duplicates fields visible elsewhere.
- **DashboardConfigurationPage** + **KpiManagementPage** + **AgingThresholdConfigurationPage** are all admin/config pages quietly buried inside Reporting. These should live under Admin / Platform Config (module 30), not the consumer-facing Reports tier.
- **Two reports landings** (`/reports` HomeDashboard, `/reports` ReportsDashboard) — only one route can be active; this is technical debt.

### A.3 Single Source of Truth — FAILS

The very thing a BI tier is supposed to enforce — that KPIs are computed *once* and consumed *everywhere* — is **violated repeatedly:**

- `ExecutiveDashboard.tsx` computes `completionPct = (onAir / total) * 100` (line 133).
- `RegionHeatmapPage.tsx` computes `overallCompletion = (totalOnAir / totalSites) * 100` (line 98).
- `TechnologyProgressPage.tsx` computes `overallCompletion = (totalOnAir / totalSites) * 100` (line 126).
- `HomeDashboard.tsx` computes `completionRate = (onAir / total) * 100` (line 87).
- `KpiManagementPage.tsx` defines an "On-Air Rate" KPI (`KPI-001`, formula `count(site.status='on_air') / count(site.total) * 100`) but **the dashboards above do not consume the KPI value** — they re-implement the formula inline.

These can drift. A real BI platform has a *metric layer* (Looker's LookML, dbt metrics, Cube.js semantic layer, Power BI dataset) and every visual consumes it. **This is the #1 architectural defect of the entire module.**

**Score: 5/10** — Charter is right, boundaries leak (configuration pages + Network Snapshot don't belong), single source of truth is violated.

---

## B. WORKFLOW AUDIT

### B.1 Standard report lifecycle

A real BI workflow is: **Discover → Open → Filter → Drill → Annotate → Share → Schedule → Subscribe → Audit**. Let's audit:

| Workflow step | Implementation | Gap |
|---|---|---|
| Discover | Two libraries (HomeDashboard, ReportTemplateLibraryPage) | Duplicate; no search across all 23 pages |
| Open | Direct nav to hand-coded page | OK |
| Filter | Each page implements its own filter set, some persist to URL (`useFiltersInUrl` on AgingReport), most don't | Inconsistent — no global filter bar that propagates across dashboards |
| Drill | `Link` to next dashboard with `?region=` querystring (ExecutiveDashboard line 687) | Works for handful of drills; no breadcrumb trail, no "back" with state |
| Annotate | **MISSING ENTIRELY** | No commenting, no @-mentions, no callouts |
| Share | **MISSING ENTIRELY** | No "share view URL with current filters", no email-this-snapshot, no public-link |
| Schedule | ReportScheduleManagerPage with timeline + CRUD | Reasonable for scheduled report distribution; no per-dashboard "subscribe me" |
| Subscribe | **MISSING** | No personal subscription / digest |
| Audit | `addAuditEntry()` in reportEngineActions for templates/schedules | OK for CRUD; **no view-audit** (who saw what report when — required for SOX / Sarbanes / GDPR) |

### B.2 Rebaseline workflow — STRONG

`SCurveChartPage.tsx` + `sCurveData.ts` together implement BR-RPT-002 correctly: rebaseline requires reason + approver, the original curve is retained as a separate `SCurveBaseline` row (`isOriginal: true`), all baselines render in a history table, `addAuditEntry()` records the action. This is the only properly governed workflow in the module.

### B.3 Threshold-based alerts — PARTIAL

`KpiManagementPage` defines `alertRecipients: string[]` per KPI, and `evaluateKpiStatus()` computes ok/warning/critical based on thresholds. But:
- No alert dispatcher exists.
- No alert history table.
- No de-duplication / quiet hours.
- No escalation chain (P1 → P2 → P3 on no-ack).
- No integration to Slack / Teams / PagerDuty / email — all theoretical.

### B.4 Schedule → Execution → Distribution — FAKE

`ReportScheduleManagerPage` allows creating schedules. On "Run Now", `onRunNow()` writes a row to `reportExecutions` with `status: 'queued'`. **There is no worker.** No execution ever transitions out of `queued` unless seeded. `ReportExecutionHistoryPage` shows seeded historical executions but no live ones. Distribution emails are stored on the schedule but no email is ever sent (no dispatcher).

### B.5 Missing workflows

- **No "Save view as personal dashboard"** — every user lands on the same 23 dashboards.
- **No "Promote my custom report to system default"** — `isSystemDefault` flag exists but no governance flow.
- **No "Compare two periods side-by-side"** (Q1 vs Q2, YoY).
- **No "Snapshot this dashboard at $time"** — required for board packs / audit.
- **No "Drill-down to individual record from KPI"** (e.g., click "Sites Per Month" → see the actual list of sites that went on-air this month).
- **No automated retry on failed scheduled report** beyond manual `handleRetry` — schedule should auto-retry per BR-RPT-006.

**Score: 4/10** — Schedule/template lifecycle is well-scaffolded; live execution, alerts, annotations, sharing, view-audit are absent.

---

## C. SCREEN-BY-SCREEN REVIEW

### C.1 ExecutiveDashboard.tsx (928 LOC) — BEST IN MODULE

**Strengths:**
- 5 sections (Verdict Banner, S-Curve hero, 4 visual panels, Regional heatmap, Top Risks + AI) — exactly the canonical executive deck structure (Tableau Sales Cloud / Salesforce CRMA / Power BI exec scorecard).
- `verdict` derivation (lines 139-163) computes a verbal RAG from quantitative variance (`siteVar >= 0 && varianceDays >= -14 → ON TRACK`). This is **rare and excellent** — most enterprise BI dashboards force the human to compute the verdict.
- The Velocity sparkline is deterministic (`seededFloat`) so it stays stable across refreshes — important for a demo, BUT in production it must come from real weekly site counts.
- Regional heatmap cells are clickable (line 687) with deep-link to RegionHeatmapPage with the region + phase preselected. Real drill-anywhere pattern.
- AIInsightCard derives a *quantitative* read of the situation, not generic blather (lines 270-280).
- Period toggle (MTD/QTD/YTD) actually scales counts (`periodScale = period === 'MTD' ? 0.34 : ...`, line 116) — but this is a synthetic scale, not a real time-bounded recomputation.
- RoleGate on Budget panel (`CAP.viewCommercial`) — correct gating of CFO content from operational personas.

**Weaknesses:**
- The page is **928 lines of hand-coded JSX**. Any new program, region, technology requires a code change. A real exec dashboard is *declarative* — you describe the layout in JSON/YAML and a renderer instantiates it.
- The S-Curve forecast is computed from `aggregateAcrossPrograms()`, but the *budget* value is hard-coded (`budgetPct = 73.4`, `totalBudget = 248_000_000`, line 192-193). Real exec dashboards never hard-code financials.
- Export functions write CSV/JSON/plain text — there's no real PPT or PDF. Calling a file `executive-dashboard-${today}.json` or `.txt` is not what a CEO expects when they hit "Export to PowerPoint."
- No annotations / no comments / no "Last viewed by" / no "Snapshotted on YYYY-MM-DD for Board Meeting."
- No "What changed since I last viewed this" delta highlighting — table stakes in modern Looker / ThoughtSpot.
- No alerts on the dashboard itself (e.g., "3 risks materialized since your last visit").

### C.2 HomeDashboard.tsx vs ReportsDashboard.tsx — DEAD CODE

**HomeDashboard.tsx (459 LOC, v2)** is a categorized library hub with hero KPI tiles, category tabs, region snapshot. Reasonable.
**ReportsDashboard.tsx (329 LOC, v1)** is a 7-card hand-coded grid with local-state-only "Add Template" modal that vanishes on refresh. This page should be deleted.

### C.3 ProgramDashboardPage.tsx & ProjectDashboardPage.tsx

Both follow the same template: DashboardHeader + 4 hero KPIs + table-with-bars hero + S-curve + risks + AI summary + footer trends. Both apply BR-RPT-003 aging thresholds at Project level. Both use `seededInt()/seededFloat()` for synthetic numbers (lines 96-99 of ProgramDashboard) — this is the right approach for a demo but reveals the data integration gap.

**Issue:** the project rows in ProgramDashboard distribute sites by `(idx * 31 + programId.length) % PROGRAMS.length` (line 88) — *not* by real `programId` foreign key. This is admitted in the comment: "Real seeded sites have generated programIds (PROG-1..PROG-5) that don't match our PROGRAMS constants." The fact that the entire program-rollup is based on a hash means the numbers are not auditable; in real BI you must be able to trace every aggregated number to a leaf record.

### C.4 NetworkSnapshotPage.tsx — DOESN'T BELONG

400+ LOC of hand-coded mock arrays from FM/PM/CM/ITSM that have no DB connection. Belongs in an Operations module, NOT Reporting. Also has `<a href="#fm-platform">` placeholder links that go nowhere.

### C.5 RegionHeatmapPage.tsx — STRONG

US Region Map with bubble-size = site count and bubble-color = selected metric (4 metrics toggle). Radar chart compares regions on 4 axes. Has `?region=` querystring drill-in from ExecutiveDashboard. Has a TabBarV2 separating the deterministic Report from the AI Insights child component.

**Weakness:** the "map" is a stylized SVG rectangle with 5 hard-coded `REGION_POSITIONS` (lines 41-47). A real region map uses a chloropleth on actual geography (US state polygons via D3-geo + TopoJSON) — Tableau, Power BI, and Looker all ship this out of the box.

### C.6 SCurveChartPage.tsx — ALMOST GOOD

- BR-RPT-002 rebaseline modal with reason + approver requirement (lines 297-323).
- Series toggles (Baseline / Actual / Forecast / Rebaseline checkboxes).
- Baseline history table.
- RoleGate (`CAP.approveRebaseline`) on "Request Rebaseline" CTA.

**Weakness:** the S-curve chart is fixed `width={1600} height={520}` (line 222) — not responsive. On a 1440px laptop this overflows. The `SCurveChart` component itself is 250 LOC; needs to be checked for SVG rendering correctness at scale (10K+ data points).

### C.7 PowerReadinessFunnelPage.tsx — GOOD

4-stage funnel SVG with conversion %, blocked-site lists per stage, KPI tiles, AI narrative identifying the bottleneck stage. Clean implementation. But again — the funnel is hard-coded to 4 specific stages (`application → meter_installed → energized → generator_ready`), so adding a new stage requires touching this file.

### C.8 AgingReportPage.tsx + AgingThresholdConfigurationPage.tsx — STRONG

The aging engine is genuinely sophisticated:
- BR-RPT-003 with per-technology × per-phase amber/red day thresholds (default 14/21 days).
- Threshold-config page has both an *overrides-only* view (default) and a *full matrix* view (10 phases × 8 technologies = 80 cells).
- Aging Report has filters by phase, tech, region, vendor, severity, bucket (clickable histogram bars filter the table).
- Saved Views (`useSavedViews` hook) with name → filter persistence.
- Group-by drill (vendor / tech / region) with sticky group headers.

This is comparable to Tableau's data-grid drilldown patterns. **Best workflow page in the module.**

### C.9 BottleneckAnalysisPage.tsx — REASONABLE

Phase-bottleneck horizontal bars + KPI tiles + drill links to AgingReport with `?phase=` querystring. Bottleneck is computed by `r.stuckSites / r.totalSites` ratio. Algorithm is correct but simplistic — a real bottleneck analysis applies **Theory of Constraints**: throughput / capacity / WIP per stage with rate-of-change and starvation/blockage detection. This page doesn't do that.

### C.10 CranHubUtilizationPage.tsx — GOOD VIZ

Hub × resource (rack / power / cooling / DU slots / CU slots) heatmap with severity color, 12-month trend with proper Y-axis (0-100%), gridlines, hover-tooltip. The `UtilizationTrendChart` (lines 60-216) is the cleanest custom SVG chart in the module — has actual axes and a real hover affordance. **This pattern should be lifted to a shared library.**

### C.11 MwLinkSummaryPage.tsx — DECENT

Funnel + faulty links table + hop chain SVG + frequency band breakdown. Adequate.

### C.12 TechnologyProgressPage.tsx — OK

Stacked vertical bars per technology, detail table, 6-month per-tech mini-trends. The bar widths are not weighted by total — they're uniform — which is a hierarchy mistake. Macro Cell at 800 sites should look visually different from C-RAN at 30 sites; here they're the same width.

### C.13 VendorPerformanceDashboardPage.tsx — GOOD

List view with composite-score-ranked vendor cards, performance spread bar chart, detail view with 5 gauges + 6-month trends per metric + radar vs peer average + segment breakdown table. The composite scoring formula (`0.35 OT + 0.35 SLA + 0.30 Quality`, line 38) is hard-coded — should be configurable per operator.

### C.14 ReportBuilderPage.tsx (672 LOC) — IMPRESSIVE FAÇADE, NO ENGINE

- 3-panel layout: Available Fields (entity-grouped tree) → Working Canvas (Columns, Filters, Grouping, Aggregations) → Live Preview (chart-type switcher).
- 10 chart types in switcher (table, bar, line, pie, stacked_bar, scatter, s_curve, funnel, gauge, treemap).
- BR-RPT-011 row caps surfaced via Alert (interactive ≤100k, scheduled ≤500k).
- Save as Template / Run / Schedule / Export to CSV/Excel/PDF.

**Critical defects:**
- No actual query construction — `previewRows` (lines 133-162) is deterministic synthetic data based on `seededInt()` over the report name + columns. **The report builder never queries the data layer.**
- "Run" creates a `reportExecution` with `status: 'queued'` but no executor.
- "Export to PDF" produces a 6-line text file with the wrong MIME type (lines 300-316).
- "Export to Excel" produces a CSV with random integers (lines 300-305).
- No drag-and-drop for column reordering — only ↑↓ buttons.
- No formula columns (computed measures like `(actualCost - budget) / budget`).
- No semantic-layer field resolution — `FIELD_TREE` is hand-coded inside the page (lines 30-78).
- No join configuration — a report touching Site + Vendor + Finance can't actually join them.

This is a UX prototype, not a report builder. **Power BI's Power Query alone is 100x more capable.**

### C.15 ReportScheduleManagerPage.tsx (552 LOC) — STRONG UX, NO BACKEND

- Anchor-date logic to prevent empty 7-day calendar when seed and wall-clock drift (lines 110-124) — good defensive engineering.
- "Run Now" creates a queued execution row.
- KPI cards (8 tiles), 7-day timeline with clickable schedule pills that scroll the table row into view + flash it amber (lines 384-394). Excellent UX detail.
- Filter chips by status / frequency / format / template.
- BR-RPT-012 cap of 50 distribution emails enforced (line 207).

**Defects:**
- Drag-to-reschedule explicitly noted as "coming soon" (line 350).
- `onPause` calls `useReportScheduleActions(id)` inside an event handler (line 158) — **this is a React Hooks violation** that will throw in production builds. Already side-stepped by directly mutating `db.update()` immediately after, but the `useReportScheduleActions(id)` call is unused and illegal.
- No timezone-aware preview ("Next run in your local TZ vs schedule TZ").
- No execution-window concept (no "run only on business days", no "skip if last run still pending").
- No SLA on schedule (no "must finish within 30 minutes").

### C.16 ReportTemplateLibraryPage.tsx (290 LOC) — DECENT

Grid + list view toggle, search-primary affordance, category chips with counts, clone modal. Standard CRUD library page. The `cardActions(t)` block (lines 111-121) builds proper dropdown menus.

### C.17 ReportExecutionHistoryPage.tsx (493 LOC) — STRONG

- KPI cards (Total / Completed / Failed / Running / Avg Duration / Success Rate / Storage).
- 7-day stacked-bar activity timeline (completed / failed / other).
- Failure-category classifier (`Timeout / Permissions / Connectivity / Memory / Database / Invalid Parameters / Missing Data / Other`) — lines 156-166. This is the kind of operational analytic that real Tier-1 BI ops tools provide.
- Per-row Download / Retry (capped at 3, BR-RPT) / Cancel / View Details.
- BR-RPT-007 retention badge (lines 248-253).
- Error-detail modal with full execution metadata.

**Defects:** download fakes the file content; the auto-classifier is heuristic string-matching, not a real exception taxonomy.

### C.18 KpiManagementPage.tsx (501 LOC) — STRONG

18 KPIs seeded across rollout / quality / schedule / financial / vendor / safety. Per KPI: formula expression, unit, frequency, target, warning + critical thresholds, direction, applicable scopes, alert recipients, 12-month trend.

Page has Critical/Warning/OK/Inactive summary chips that filter, sortable table, Add/Edit modal with `validateFormulaSyntax()` and `validateThresholds()` live validation, threshold-ordering sanity check.

**Critical defects:**
- The formula expressions (`count(site.status='on_air') / count(site.total) * 100`) are **stored as strings and never parsed/evaluated**. There is no execution engine. KPI `currentValue` is *synthesized at seed time* (`buildKpiFromSeed`, line 249-260) and never recomputed.
- `recalculate()` button (line 326) calls `actions.recalculate()` which is a no-op — there is no formula interpreter.
- **No KPI lineage** — you can't see what dashboards consume this KPI.
- **No KPI dependency graph** — what happens if On-Air-Rate's source `sites` table schema changes?
- **No KPI versioning** — if I change the threshold from 75 → 80, history is lost.
- **No A/B threshold testing** — Looker, Tableau and dbt all support this.

### C.19 DashboardConfigurationPage.tsx (744 LOC) — IMPRESSIVE, BUT DOESN'T DRIVE ANYTHING

Two routes: list + configure. Configure view has a list-mode widget table AND a 12-column canvas mode (line 312-350) with widget tiles positioned at `gridColumnStart/End/RowStart/End`. Widget palette with 10 widget types (KPI_card, chart, table, map, gauge, counter, progress_bar, s_curve, funnel, heatmap). Widget config drawer with title, subtitle, type, data source, query config (JSON), refresh interval (BR-RPT-001 min 10s), position + size, visibility.

**Critical:** **None of this drives the actual 23 dashboards.** The hand-coded ExecutiveDashboard/ProgramDashboard/etc. ignore the widgets defined here. The "Preview" button just opens the hard-coded dashboard route in a new window (lines 265-279). The dashboard configuration is **a parallel fiction** — it persists widgets but no consumer ever reads them.

This is the single largest gap in the module: the dashboards advertised as configurable are not actually configurable.

### C.20 AgingThresholdConfigurationPage.tsx (515 LOC) — STRONG

The two-mode view (overrides-only default + full 10×8 matrix on toggle) is genuinely well-designed. BR-RPT-003 defaults panel surfaces shipping baselines. Edit/Add modals with default-preview when picking phase × tech. This is the only configuration page that actually drives real behavior — the aging engine consumes `getAgingThresholds()`. Should be the template for the rest.

### C.21 SiteSummaryCardPage.tsx — OUT OF SCOPE

A site passport. Belongs in Site Lifecycle (module 01), not Reporting.

**Score: 6/10** — Excellent individual pages, but the lack of a metadata-driven runtime means none of this scales.

---

## D. TELECOM DOMAIN VALIDATION

### D.1 RAG color semantics — CORRECT

Green / Amber / Red mapping aligns with telco PMO conventions. RAG bar segments, RAG legend, severity pills (`STATUS_PILL` in AgingReport) match Ericsson/Nokia practice.

### D.2 Phase taxonomy — CORRECT but RESTRICTIVE

10 project phases (`design, site_acquisition, pre_installation, installation, integration, commissioning, optimization, acceptance, on_air, closed`) is the right granularity. **However:** the Executive view collapses to a 5-phase bucket (`Acquisition / Design / Build / Integration / On-Air`) via `phaseOf()` (ExecutiveDashboard line 67-87) — this collapsing is hard-coded and not configurable per operator. T-Mobile, Verizon, Vodafone each have their own phase nomenclature; this needs a meta-model.

### D.3 KPI definitions — STRONG

The 18 seeded KPIs (KpiData.ts) cover:
- **Rollout**: On-Air Rate, Sites Per Month, Milestone Adherence, Design-to-Air Days
- **Quality**: First-Pass Acceptance, Punch List Density, Defect Density, Rework Rate
- **Schedule**: Schedule Variance, Task Completion, Overdue Milestones
- **Financial**: Budget Utilization, Cost Per Site, Payment Cycle
- **Vendor**: Composite Vendor Score, On-Time Delivery
- **Safety**: Incident Rate, Near-Miss Count, Safety Audit Compliance

These are the **correct telco PMO KPIs** with realistic thresholds (e.g., Incident Rate target 1.0 per 200k worker-hours — matches OSHA benchmark). This is much better than typical mock data.

### D.4 Missing telco-specific reports
- **Spectrum utilization by band by region** — critical for spectrum operators (T-Mobile post-Sprint merger, Reliance Jio).
- **Backhaul / fronthaul capacity reports** — what's the saturation of leased fiber, MW, dark fiber by region?
- **Tower co-location ROI report** — for shared infra operators (Crown Castle, American Tower, China Tower).
- **Energy / OpEx per kWh per site** — sustainability reporting (CSRD, SEC Climate Disclosure).
- **Field crew utilization heatmap** — calendar-week × crew-zone density.
- **PIM (passive intermodulation) defect aging** — engineering-specific quality metric.
- **Lease anniversary calendar** — landlord renewals → financial liability.
- **Wave/cohort progression** — sites grouped by quarter-of-acquisition tracked through phase completion (NOT present anywhere).

### D.5 Industry comparison

Compared to Ericsson **Operations Engine** and Nokia **AVA Insights**:
- ✗ No multi-vendor RAN performance correlation
- ✗ No predictive failure (these vendor tools ship LSTM/Gradient Boost models)
- ✗ No simulation/what-if ("If we slip Region East by 30 days, what's the YoY impact?")
- ✓ Aging engine matches Ericsson's quality of execution
- ~ Vendor scorecards present but lighter than vendor's own dashboards

Compared to Huawei **IDS (Intelligent Data System)**:
- ✗ No NE-level KPI rollup (cell / sector / eNB / gNB)
- ✗ No drill from PMO down to RAN counters

**Score: 7/10** — Right KPIs, right RAG, right phases for PMO. Missing wave/cohort, sustainability, capacity reporting.

---

## E. DATA REVIEW — EVERY KPI / METRIC

### E.1 Provenance audit

| Metric | Source | Auditable? |
|---|---|---|
| Executive.completionPct | sites × ON_AIR set / total, scaled by periodScale | NO — periodScale is arbitrary |
| Executive.budgetPct | Hard-coded 73.4 | NO |
| Executive.velocity.avg | `seededFloat`-generated weekly series | NO |
| Program.scheduleVariance | `seededInt(programId, ...)` | NO |
| Project.atRisk | `siteRows.filter(r => r.agingState !== 'ok').length` | YES — derives from aging engine |
| Aging.daysInPhase | Computed from seeded `phaseStartDate` | YES |
| S-curve.varianceSites | `totalActual - totalPlanned` from data points | YES |
| Vendor.compositeScore | `0.35 OT + 0.35 SLA + 0.30 Q` | YES — but weights are hardcoded |
| KPI.currentValue (18 KPIs) | `baseValue + (seededFloat - 0.5) * variance * 2` at seed | NO — never recomputed |
| Region.completionRate | `regionMapData.getRegionPerformance()` | YES (synthetic but consistent) |
| Bottleneck.conversionRate | Computed from aging row counts | YES |
| Power funnel.conversionRate | Computed | YES |

Roughly **half the headline numbers are seeded constants or synthetic series with no traceability.** For a real PMO this is unacceptable — every executive number must trace back to a row in a transactional system.

### E.2 KPI reconciliation — CRITICAL DEFECT

Take "On-Air Rate":
- KpiManagement says: **KPI-001 currentValue ≈ 72%** (baseValue 72 ± 8 variance)
- HomeDashboard.opsKpis.completionRate: actual computed from sites table — could be 80%
- ExecutiveDashboard.completionPct: same but **scaled by periodScale**
- RegionHeatmap.overallCompletion: pure sum / sum

These four numbers can simultaneously be 72, 80, 58 (after 0.72 QTD scale), and 80. **The CEO sees four different "% on air" depending which page they're on.** This is the kind of defect that gets BI tools removed.

### E.3 Chart data integrity

- **Sparklines** in ExecutiveDashboard.velocity: 16 data points generated from `Math.sin(i / 1.6)` — no real signal.
- **6-month per-tech trend** in TechnologyProgressPage: ramps from 30% → 100% of current with noise — looks plausible but is purely cosmetic.
- **12-month average utilization trend** (CranHubUtilizationPage `data.trend12m`): comes from `opsDashboardData.ts` which I didn't read in full but the chart axis treatment is real.
- **S-curve data**: properly seeded via logistic sigmoid (`sCurveData.ts` line 17-27) — only chart in the module with mathematically correct shape.

### E.4 Tabular drill consistency

When clicking from ExecutiveDashboard's regional heatmap cell to RegionHeatmap?region=East, the destination shows the East region focused (yellow ring) but the underlying site counts are recomputed *independently* on RegionHeatmap — they don't necessarily reconcile cell-by-cell. Risk of "the heatmap said 47 East-region in Build, but when I drill I see 51." This must be tested.

**Score: 4/10** — Half the numbers untraceable, single-source-of-truth violated, chart data partially cosmetic.

---

## F. SCALABILITY REVIEW

### F.1 100,000 sites stress test

- **HomeDashboard** reads `db.getAllRaw('sites')` then filters in memory. At 100k sites: ~50ms — OK.
- **ExecutiveDashboard** reads all sites + scans for status + RAG + region matrix. At 100k: ~100-200ms. Marginally OK.
- **AgingReport** runs `computeAging(sites, thresholds)` then filters + groups + renders an antd Table. At 100k with default pageSize 20 — table itself is fine, but `computeAging` is O(n) on every render and not memoized at the data layer (only at the page level via `useMemo`). At 100k it will block the main thread for ~200-400ms per filter change.
- **BottleneckAnalysis** → `getBottleneckRows(filtered)` — O(n × phases) — at 100k × 10 phases = 1M ops per render. Will jank.
- **ProgramDashboard.projectRows** redistributes all sites via `(i % programProjects.length === idx)` — O(n × p) for each project. At 100k × 20 projects = 2M ops. Bad.

### F.2 No virtualization

The `Table` from antd does have virtualization (`scroll={{ y: ... }}`) but it's not used here. At 100k aging rows the DOM payload is bounded by pageSize=20, so paginated tables are OK. But the **filtered set** itself is materialized in JS memory.

### F.3 No server-side pagination / no API contract

Everything reads `db.getAllRaw()` which returns the entire dataset. Real Power BI / Tableau push the filter into a SQL WHERE clause that runs on the warehouse. Here the warehouse is browser memory.

### F.4 No caching tier

Real BI tools have a result cache (Looker's persistent derived tables, Tableau extracts, Power BI in-memory dataset, ThoughtSpot's Falcon). This module recomputes every visible metric on every render — partially mitigated by `useMemo`, but the dependency arrays often include large arrays which means re-memoization is triggered frequently.

### F.5 Concurrent users

A real BI system at a Tier-1 operator has 500-5000 concurrent users. This module's rendering model is single-tenant browser — there is no server-side rendering, no shared cache, no query coalescing. At enterprise scale this would melt.

### F.6 Dashboard count growth

Currently 23 hand-coded pages. At ~25 KPIs × 8 entity types × 5 regions × 4 time-granularities = 4,000 possible dashboards. **Every one requires a code change.** Unscalable.

**Score: 3/10** — Works for the 10k-site demo. Will not scale to 100k sites or 1000 concurrent users without a fundamental rebuild on a real warehouse + semantic layer.

---

## G. AI OPPORTUNITIES

The module already has AI components stubbed in via `AIInsightCard` and child-route bodies (`AISiteRiskHeatmapBody`, `AIDelayPredictionsBody`, `AIBottleneckAnalysisBody`, `AISCurveForecastBody`, `AIVelocityForecastBody`). These are surfaced via TabBarV2 on Aging / Bottleneck / Region / S-Curve / Tech Progress pages. **This is a strong AI-first instinct.**

Where AI should be expanded:

1. **Natural-language query** — ThoughtSpot's killer feature. "Show me sites that went red in Region West this week vs last week." Currently the user must navigate by filter.
2. **Automated insight generation** — Tableau's "Explain Data" / Power BI's "Smart Narrative" / Looker's "Explore Assistant". Click any data point → AI generates a paragraph explaining the underlying cause and 3 next-best-actions. AIInsightCard does some of this but only as a fixed string per page.
3. **Anomaly detection** — flag KPIs that are statistically out of band vs their 12-month history. None present.
4. **Forecast confidence intervals** — the S-curve forecast is a single line. A real forecast must show P10/P50/P90 cones. Easy with the existing AI infrastructure.
5. **Auto-bottleneck root-cause** — current BottleneckAnalysis identifies the worst phase. AI should propose: "Build phase is bottlenecked because Vendor B in Region West has 23 stuck sites in installation; recommend recrew or escalation."
6. **What-if simulation** — "If I add 2 crews to Region East, the on-air forecast shifts +120 sites by Q4." Not present.
7. **Personalized dashboards** — AI learns which KPIs each persona looks at most and reorders.
8. **Automated executive summary email** — daily AI-generated digest per role.
9. **Alert routing** — AI-classified severity + recipient routing.
10. **Schema lineage AI** — when a source field changes, AI flags all dependent KPIs.

**Score: 6/10** — AI hooks are well-placed; expansion is straightforward and largely missing.

---

## H. UX & VISUALIZATION IMPROVEMENTS

### H.1 Quick wins
1. **Delete `ReportsDashboard.tsx`** — duplicate of HomeDashboard.
2. **Move `NetworkSnapshotPage`** out of Reporting.
3. **Move `KpiManagement`, `DashboardConfiguration`, `AgingThresholdConfiguration` to Admin tier.**
4. **Replace fake exports with real PDF/PPT/Excel** — use jsPDF / pptxgenjs / exceljs (all client-side, MIT-licensed).
5. **Add global filter bar** that persists across dashboards (region, time, program).
6. **Add "share this view" URL** — copy URL with current filter state.
7. **Add breadcrumb trail** for drilldown chains.
8. **Add "What changed since last visit"** delta highlighting on Executive.
9. **Add comparative-period mode** (current vs previous QTD / YoY) — Power BI does this with one toggle.
10. **Add wave/cohort analysis** view — sites grouped by acquisition wave tracked through phases.

### H.2 Visualization upgrades

- **Real chloropleth map** for RegionHeatmap (US state polygons via D3-geo).
- **Real interactive S-curve** with brush zoom and crosshair tooltip (the current SCurveChart at 1600×520 is non-responsive).
- **Sankey diagram** for funnel pages — Power Readiness, MW Link Summary — to show drop-off paths.
- **Calendar heatmap** for ReportExecutionHistory — GitHub-style contribution grid.
- **Treemap or sunburst** for portfolio breakdown by program × project × phase.
- **Gantt** view for SCurveChartPage — overlay rebaseline events as vertical markers.

### H.3 Information density

- Many pages use the 4-hero-KPI-tile pattern. **At small viewports these collapse to 1 column** — wasteful. Should compact to 2x2 or smaller tiles.
- Footer trend strips (e.g., HomeDashboard line 423-453, ProgramDashboard line 445-476) repeat hero KPI deltas in a different visualization — duplicate info.
- Many tables have `minDensity: 'expert'` columns that hide by default but the toggle is not always obvious.

### H.4 Annotation / collaboration — ENTIRELY MISSING

A modern BI tool (Tableau, Looker, Power BI, ThoughtSpot, Sigma) ships:
- Per-chart commenting
- @-mentions of teammates
- "Mark as read" / "follow this dashboard"
- Snapshot pinning to threads / Slack / Teams
- Comment timelines

None present. This is a competitive deficiency.

### H.5 Mobile

No responsive design. `gridTemplateColumns: 'repeat(4, minmax(0, 1fr))'` collapses to 4 columns even on phones. No mobile-first dashboard rendering. The Executive dashboard at 928 LOC is unusable on a phone.

**Score: 5/10** — Pages are individually well-designed but the module lacks the connective tissue (share, comment, mobile, comparative, breadcrumb) that defines modern BI.

---

## I. TECHNICAL ARCHITECTURE CONCERNS

### I.1 Hand-coded dashboards vs metadata runtime

23 dashboards = 23 hand-coded React pages. Power BI / Looker / Tableau represent dashboards as JSON/YAML manifests rendered by a generic engine. **Required for scale.**

### I.2 React Hooks violation in ReportScheduleManagerPage (line 158)

```ts
const onPause = (id: string) => {
  try { useReportScheduleActions(id); ... }
}
```

`useReportScheduleActions` is a hook called inside an event handler → React will throw "Rules of Hooks" violation in production. This is a real bug. The fact that the line after immediately uses `db.update()` to do the work side-steps the runtime impact, but the dead hook call must be removed.

### I.3 No semantic / metric layer

KPIs defined in `kpiData.ts` are not consumed by the dashboards that should source from them. Need a metric registry that all pages reference.

### I.4 No data freshness contract

There's no "last updated" timestamp coming from a real ETL. `lastRefresh = new Date()` is the wall-clock at page mount — meaningless.

### I.5 Coupling

- `regionMapData` is a 71-line file scattered across HomeDashboard, RegionHeatmap, ExecutiveDashboard.
- `opsDashboardData` powers Power Funnel, MW Link, C-RAN Hub — reasonable grouping.
- `dashboardActions`, `kpiActions`, `reportEngineActions` follow a clean hook-pattern with `audit()` calls.

### I.6 Mock DB tight coupling

Every page imports `import { db } from '../../../mock/db'`. There's no API abstraction (no `fetch('/api/sites')`), no GraphQL client, no SWR/React Query, no error boundary, no loading state, no retry logic, no offline cache. Migrating to a real backend will touch every single file.

### I.7 No row-level security / no RBAC enforcement on data

`RoleGate` exists on buttons (rebaseline, config) and on the Budget panel of ExecutiveDashboard. But the *data fetch* doesn't check permissions — a non-CFO user could still see the Budget data by inspecting the React state. Real BI tools do row-level security at the query layer.

### I.8 No API readiness / no integration spec

To productionize: need OpenAPI specs for sites, programs, projects, kpi/values, reports/templates, reports/schedules, reports/executions, kpi/definitions. None exist.

### I.9 Export implementation

All exports are constructed via `Blob` + `URL.createObjectURL` + synthetic `<a>` click. Works for browser-side proof-of-concept but:
- No server-side rendering (real PDFs need Puppeteer / WeasyPrint).
- No email delivery (only download).
- No file-storage retention (file is downloaded and lost; no "view past exports" beyond the execution-history row).
- No watermarking / classification labels.

### I.10 BI tool embeddability — ZERO

Real enterprise BI strategies embed Power BI Embedded or Tableau JS API for advanced ad-hoc. This module does none of that. The Report Builder is a homegrown replacement that will never match Power BI's capability.

**Score: 3/10** — Architecture is monolithic React pages over a browser-memory DB. Far from enterprise BI standard.

---

## SCORING SUMMARY (1-10)

| Dimension | Score | Justification |
|---|---|---|
| Workflow | 4/10 | Schedule/template lifecycle good; live execution, alerts, sharing, annotations absent |
| UX | 5/10 | Individual pages strong; no comparative / mobile / share / breadcrumb |
| Domain | 7/10 | Right KPIs, RAG, phases for PMO; missing wave/cohort, sustainability, capacity |
| Data | 4/10 | Half the numbers untraceable; SSOT violated 4x for the same KPI |
| Scale | 3/10 | Works for demo; will not survive 100k sites or 1000 concurrent users |
| AI | 6/10 | AI tabs well-positioned; deep AI integration largely future work |
| Architecture | 3/10 | 23 hand-coded pages, no semantic layer, no warehouse, no real BI embed |

**Weighted Module Score: 4.6/10**

This is the highest-quality module reviewed so far for individual page craftsmanship, and simultaneously the most architecturally insufficient for what it claims to deliver.

---

## TOP 10 PRIORITY FIXES

### 1. **Build a metric/semantic layer (CRITICAL)** — 4 weeks
Create a `metricRegistry` module where each KPI is defined once (formula, source, dimensions, thresholds, owner) and *every* dashboard consumes the registry. Eliminate inline `(onAir / total) * 100` across the 23 pages. Reconcile the 4 different "% on air" calculations.

**Files affected:** all 23 pages + new `lib/metricRegistry.ts`.

### 2. **Replace hand-coded dashboards with a metadata-driven runtime (CRITICAL)** — 8 weeks
The 23 dashboards become JSON manifests rendered by a single `<DashboardRunner manifest={...}>` engine. This is the foundation for letting customers configure dashboards without code changes. Reuse the `DashboardConfigurationPage` UI to author manifests — it's already 80% there, it's just not wired to the consumer side.

### 3. **Implement a real execution engine for the Report Builder** — 6 weeks
The current builder saves templates that nothing executes. Build a query-compiler that turns the column/filter/grouping/aggregation specs into SQL (or to the mock-DB equivalent). Make "Run" actually transition `executions` from queued → running → completed/failed with real timing.

### 4. **Wire KPI formula evaluation** — 3 weeks
Parse the `formulaExpression` strings in KpiData and execute them against the data layer on a schedule that respects `calculationFrequency`. Today the formulas are decorative. Without this the entire KPI Management page is theater.

### 5. **Fix the React Hooks violation in ReportScheduleManagerPage** — 1 day
Remove the `useReportScheduleActions(id)` call inside `onPause` (line 158). This is a real bug that crashes in strict mode.

### 6. **Implement real PDF / PPT / Excel exports** — 3 weeks
Replace the fake-text-blob exports with jsPDF + pptxgenjs + exceljs (or server-side Puppeteer for PDF). The CFO downloading "executive-dashboard-2026-05-26.txt" is not acceptable.

### 7. **Add comparative-period mode + wave/cohort views** — 4 weeks
Side-by-side QTD vs prior QTD vs YoY. Wave analysis — sites bucketed by acquisition quarter and tracked across phase completion. Industry-standard PMO analytics, fully absent.

### 8. **Add scheduled-report distribution backend** — 4 weeks
Schedules currently store recipient emails; nothing dispatches. Wire to SES / SendGrid / SMTP with templated email body + attached export. Add bounce handling, click tracking, unsubscribe.

### 9. **Add view-audit / sharing / commenting** — 6 weeks
Per-dashboard view-log (who saw what when — SOX/Sarbanes required). Per-chart commenting + @-mentions. "Share this view URL with filters". Snapshot-pinning to Slack/Teams.

### 10. **Architect for warehouse + BI-tool embed** — 12 weeks
Stand up Snowflake/Databricks as the canonical store, dbt for transformations, Cube.js or Looker semantic layer, Power BI Embedded for self-service. Migrate the 23 dashboards onto this stack. This is the long-term path to being competitive with Power BI / Tableau / Looker.

---

## CONCLUSION

The reporting-dashboards module is the **most credible deliverable in the platform** — the ExecutiveDashboard especially is the kind of work that wins demos. But it is **simultaneously the weakest at enterprise architecture**: it advertises configurability that doesn't work (DashboardConfiguration ≠ ExecutiveDashboard runtime), it advertises KPIs that aren't computed (KPI formulas are decorative strings), it advertises a report builder that doesn't build reports (synthetic preview, fake export), and it advertises scheduled distribution that doesn't distribute (no email dispatcher).

The team should be proud of the *aesthetics and information design*. They should be sober about the *engineering depth required* to make this competitive with Power BI / Tableau / Looker at Tier-1 operator scale. The roadmap above is realistic — about 12 months of focused work to get from 4.6/10 to 8/10. Without it, this module will fail its first enterprise-scale POC at any operator over 50k sites.
