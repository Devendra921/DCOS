# Deep Review — PPM Integration Module

**Reviewer perspective:** 20+ years leading telecom rollout PMOs at Tier-1 operators across MEA, EU and South Asia. Hands-on with Microsoft Project, Primavera P6 EPPM, ServiceNow SPM/PPM, Planview Enterprise, Smartsheet, Asana Enterprise, Monday WorkOS, and bespoke OSS-coupled PMOs (Ericsson AMOS, Nokia NetAct, Huawei U2000 work-order). Certifications: PMP, PgMP, PfMP, PMI-SP, PRINCE2 Practitioner, SAFe Program Consultant. EVM/EAC, CPM/PERT, RBS/WBS, stage-gating, capacity-driven resource scheduling.

**Module scope:** `src/modules/ppm-integration/` — 8 page files plus `SitePPMTab` cross-link. Provides the rollout "brain" intended to (a) host the program → project → task hierarchy, (b) drive scheduling, (c) track workload, (d) surface workflow SLAs, (e) integrate with PPM tooling (Microsoft Project, Primavera). Total surface area is small (≈4,600 LOC across the 8 pages) for what is positioned as the brain of the rollout.

**Verdict:** **Critical PMO-grade gaps.** The module is a presentation-quality dashboard skin over hard-coded mock arrays. It implements zero PMO engineering math: no CPM, no critical path, no float/slack, no PERT, no EVM (PV/EV/AC/SPI/CPI/SV/CV), no dependency model (FS/SS/FF/SF), no resource leveling, no stage-gate enforcement, no integration with MSP/P6/ServiceNow. The Program → Project → Task hierarchy is *shape-only* — Programs are defined in three different in-memory dictionaries with inconsistent IDs (`PRG-001` vs `PGM-01`), Projects exist as small unstable arrays, and Tasks live as 20 hard-coded items that never connect back to a parent project's WBS. Workflow alerts cannot actually acknowledge anything; the "Acknowledge" button calls `message.success` and closes the modal. The PM workload heatmap is a literal 5×8 hand-typed grid. Capacity, utilization and SLA counts (`kpiTotal = 247`, `kpiBreached = 13`) are typed as constants, not derived from the visible task data. Scoring as the rollout brain: **2.1 / 10** — adequate as a stakeholder demo, **unfit for any operational use** at a Tier-1 operator. This module would be the single largest source of cascading data errors across the wider RAN app because every other module (RF Design, MW Link, Power, Site Acquisition, CRAN, EXT, Decommissioning) feeds rollout state through PPM.

---

## A. Module Purpose Validation

The module's stated purpose is "Programs & Projects" — "Delivery intelligence across all rollout programs and their projects" (`PPMDashboardHub.tsx:41`). That is a defensible scoping. PPM is the right place to centralise multi-program scheduling, resource allocation, milestone tracking, financial roll-up, risk register, and tollgate governance. The boundary with site-level state (RAG, phase, milestone) is correctly delegated to the per-discipline modules and pulled back into PPM through aggregated rollouts (`ProgramSiteRollout.tsx`). That conceptual split is the right one.

**However, the implementation does not reflect the stated purpose.** The hub renders three tabs (Overview / Tasks / Workload) which is reasonable, but the missing portfolio layer is explicitly called out as intentional in `PPMDashboardHub.tsx:3-6`: *"Rollout is organised around programs and projects only — there is no portfolio layer."* That decision is **wrong for a Tier-1 operator** — every operator above 20 active programs needs a portfolio view to balance investments, surface duplication across programs (e.g. PRG-001 5G Rollout and PRG-005 C-RAN Hub Deployment have overlapping sites at the same dense-urban clusters but no shared resource pool), and roll up to a CFO-facing capex dashboard. Removing the portfolio is a UX simplification that breaks the program management hierarchy below PMBOK's three-layer minimum (project / program / portfolio).

**Overlap with other modules.** Significant duplication:
- The program list is defined three times: `PPMDashboard.tsx:312-318` (`ALL_PROGRAMS`), `ProgramListPage.tsx:43-126` (`useProgramData`), and `ProgramDetailPage.tsx:82-191` (`PROGRAMS`). All three carry the same 5 records (`PRG-001…PRG-005`) but with different fields and different program-name strings (e.g. `'5G National Rollout - Phase 1'` everywhere except `ProgramSiteRollout.tsx:702` where it becomes `'UK 5G National Rollout'`).
- The program ID scheme is **inconsistent across pages**: `PPMDashboard`, `ProgramListPage`, `ProgramDetailPage` use `PRG-001…005`; `TaskDashboard.tsx:823-827`, `ProgramSiteRollout.tsx:702-706`, `WorkloadDashboard.tsx:256-257` use `PGM-01…05`. There is no central entity for programs. Routes hit by these two ID forms (`/ppm/program/PRG-001` vs `/ppm/rollout/PRG-001` vs no equivalent route from `PGM-01`) cannot interoperate, and dashboard filters silently fail to match.
- `Workflow alerts` (`PPMDashboard.tsx:332-338`) are defined here but no actual workflow engine drives them — the same five rows that have been static since the file was authored. The site-acquisition module already has its own workflow tracker; this should reuse a shared workflow service rather than maintain a parallel mock list.
- Tasks live in `TaskDashboard.tsx:65-186` (20 tasks) **and** in `ProjectDetailPage.tsx:158-173` (10 tasks). They share neither schema nor IDs.

**Boundary with Site Lifecycle.** `ProgramSiteRollout.tsx` re-implements a site list that is essentially the Site Lifecycle inventory page but scoped to a program. It carries its own 20 mock sites (`SITES` at `ProgramSiteRollout.tsx:52-153`) with different RAG models from the rest of the app. There should be one canonical sites collection (entity store) and this page should be a filtered view, not a parallel data source. The selectedProgram dropdown does not actually filter SITES — selecting `PGM-02 London Capacity Boost` shows all 20 sites unchanged.

---

## B. Workflow Audit

**Program lifecycle.** No formal state machine. Status options on the create form (`ProgramListPage.tsx:393-397`) are `Active | Planning | Completed`. The edit form (`ProgramDetailPage.tsx:529-533`) adds `On Hold`. No `Closed`, `Cancelled`, `Stage Gate Failed`, `Reactivated`. No transitions are guarded — any user can move a program from Completed back to Planning. There is no concept of stage gates / tollgates, which is the **single biggest PMO governance gap** in this module. A Tier-1 PMO uses 4–7 named gates (e.g. G0 Concept, G1 Initiate, G2 Design, G3 Build, G4 Deploy, G5 Operate, G6 Close); each gate has approvers, deliverables checklist, and a hard go/no-go decision. None of this exists.

**Project lifecycle.** Statuses: `Not Started | In Progress | On Hold | Completed` (`ProjectDetailPage.tsx:718-723`). Acceptable as a minimum, but again, no transition logic, no approval steps, no PMO sign-off on completion. No baseline locking — once you "complete" a project the planned dates should freeze, but there is no concept of a baseline anywhere.

**Task lifecycle.** Statuses: `Not Started | In Progress | Under Review | Completed | Blocked` (`TaskDashboard.tsx:38`). The status dropdown is inline-editable on the task table (`TaskDashboard.tsx:589-612`) and a `message.success` toast confirms — but the change is held in local `useState` only (`taskStatuses`) and resets on page refresh. **There is no persistence**, no optimistic locking, no audit trail, no concurrent-user check. A real PMO platform must record who changed status, when, from-status → to-status, and on which task.

**Workflow alerts.** Defined as 5 hand-typed `WorkflowAlert` rows (`PPMDashboard.tsx:332-338`). The "Acknowledge" button (`PPMDashboard.tsx:1000-1009`) calls `message.success(\`Acknowledged ${workflowDetail.id}\`)` and sets the modal to null — **it does not mutate any state**. Re-opening the same alert shows it still pending. There is no workflow definition (steps, owners, escalation chains, SLA timers, notifications), no integration with email/Slack/MS Teams, no escalation matrix. For a workflow-driven rollout (which all 5G rollouts are) this is functionally a wireframe.

**SLA mechanics.** SLA status is a typed enum (`'on-track' | 'at-risk' | 'breached'`) on tasks. `slaDaysLeft` is hand-typed per row. There is no SLA definition entity (e.g. "Legal Review = 5 business days"), no SLA clock that runs against business calendars or holiday calendars, no escalation rules ("if pending > SLA × 1.5 then escalate to Program Director"). The `pulse-red` animation around breached SLAs (`TaskDashboard.tsx:230-234`) is a nice UX touch but rests on static data.

**Capacity-driven scheduling — completely absent.** The PMO industry standard is that tasks consume named resources from a Resource Breakdown Structure (RBS) at a rate (hours/day or FTE allocation), and a scheduler levels assignments against the resource calendar to avoid over-allocation. None of this exists. Engineers in `WorkloadDashboard.tsx:20-29` have `capacity` and `utilization` as hand-typed numbers; `tasksAssigned` does not equal the count of tasks in `MOCK_TASKS` for that assignee (e.g. Alice Martin has `tasksAssigned: 14` here but appears on only 3 tasks in `TaskDashboard.tsx`).

**Dependencies (FS / SS / FF / SF).** Not modeled. Tasks have no `predecessor` field. The Site Rollout page implements a *phase* order (`Acquisition → Planning → Civil → Installation → Commissioning → Testing`) as a hard-coded array (`ProgramSiteRollout.tsx:257-264`), which is at best a single linear chain per site — no parallel phases, no FF (e.g. Civil-FF-Installation), no lag/lead. Real rollout schedules need explicit predecessor/successor relations with lag types because the actual rollout has many parallel and overlapping phases (e.g. RF design can start during Acquisition, civil can overlap with Installation prep). Without explicit dependencies the system cannot compute a forward pass / backward pass and therefore cannot compute any of: critical path, float, slack, EAC, late finish.

**Multi-program portfolio view.** Acknowledged as intentionally absent (`PPMDashboardHub.tsx:3-6`). This is wrong — even the 5 programs shown here need a portfolio comparison ($45.2M + $18.7M + $8.1M + $12.3M + $32.5M = $116.8M) with budget vs spend variance, risk score, and dependency map (PRG-001 5G needs PRG-002 MW Backhaul capacity).

**Issue / blocker tracking.** Absent. There is a `Blocked` task status but no Issue entity, no severity (Sev-1/2/3), no owner, no escalation, no resolution date, no RCA link.

**Risk register integration.** Only present as a placeholder document upload (`ProgramDetailPage.tsx:212`: `Risk Register.xlsx`). The system does not parse the file, does not have a `Risk` entity, does not score probability × impact, does not surface a risk heatmap, does not raise tasks for mitigation, does not roll risks up to the program.

---

## C. Screen-by-Screen Review

**PPMDashboard / Overview tab (1,173 lines).** Dense, visually polished hero with five KPI cards (Total Programs / Active Projects / Open Tasks / SLA Breaches / Budget Utilized). Donut chart for Delivery Health (58/28/14 split) is hard-coded SVG with no underlying source. Task SLA Status stacked bar `170 / 65 / 12` is hard-coded numbers and does **not** match the KPI strip (`kpiOnTrack=141 / kpiAtRisk=32 / kpiBreached=13`) in `TaskDashboard.tsx:701-703` — two surfaces of the same metric give different totals (247 vs 247 totals, but breakdowns differ). Budget Burn AreaChart actuals/plan are hard-coded arrays (`PPMDashboard.tsx:397-399`); the `$76.2M / $116.8M` summary on the card matches the KPI strip's derived `Budget Utilized` because both happen to roll up from the same hand-edited program totals — that consistency is incidental, not enforced. The Programs grid (5 cards) is the only place that genuinely derives from `ALL_PROGRAMS`. The Heatmap (`Task Volume by Week × Assignee`) is a hard-coded 5 × 8 cell array (`PPMDashboard.tsx:374-395`), and the labels (`Sarah Mitchell, Ahmed Hassan, …`) are the *program managers* — not the actual task assignees who are different people (`Alice Martin, Ben Clarke, …` in `TaskDashboard.tsx`). The heatmap therefore lies about reality.

Activity Feed (9 rows, `ALL_ACTIVITY`) — static, no real telemetry. Workflow Alerts (5 rows) — static, "Acknowledge" is a no-op. Bottom Action Bar provides Create Adhoc Project (modal opens, form validates, success toast, no persistence), Bulk Task View (navigates to `/ppm/tasks`), Program Site Rollout (hard-coded link to PRG-001 only).

Two modals: the Workflow alert detail modal generates "What needs to happen" bullets via a chained ternary on `workflowDetail.step.includes('Legal' | 'Finance' | 'Regulatory' | 'Field' | 'Procurement')` (`PPMDashboard.tsx:1056`). That's clever but fragile — any workflow step name not matching the substrings falls through to a generic "Step Owner" string. There is no formal step-owner table.

**PPMDashboardHub (47 lines, stub).** Renders the hub chrome and three lazy bodies. Clean. The explicit comment "there is no portfolio layer" is the controversial product decision noted above.

**ProgramListPage.** Sensible Antd `Table` with expandable rows (parent program → child projects table). Status tabs filter (`All / Active / Completed`). Tabbed expansion is a clean pattern. Issues: hard-coded `Program → Project` array (5 programs × 2-3 projects each = 11 projects total), no entity store hookup, project IDs `PRJ-001 … PRJ-011` do not match the project IDs referenced in `TaskDashboard.tsx` (`PRJ-001 = "London Metro 5G Phase 1"` here vs `PRJ-001 = "Cluster East 5G NR"` in `ProgramListPage.tsx` and `ProgramDetailPage.tsx`). Two sources of truth, no reconciliation. The Create Program modal validates but does not write anywhere.

**ProgramDetailPage.** Four tabs (Overview / Projects / Timeline / Documents) plus header KPIs. Milestones are 6 hand-typed entries that all reference the same program id (`m1` to `m6` for any `programId`). Timeline component renders the milestones again. Documents tab has functional upload/preview/download modals — download produces a text-stub file containing the file name + a `Mock document export` blurb, which is good demo behaviour but no actual document store. Edit modal validates and toasts but persists nothing. No risks tab, no stage-gate tab, no stakeholder map (despite uploading a `Stakeholder Map.pdf` placeholder), no benefits realisation, no resource breakdown, no financial breakdown, no governance log.

**ProgramSiteRollout (843 lines).** Strongest single page in the module. The custom `RolloutGantt` component (`ProgramSiteRollout.tsx:318-437`) is the best work in the module — it computes per-site schedules from a phase plan + seed-based slip factor, projects them on a real time axis with month headers and a "today" line, and supports per-site milestone drilldown showing planned vs forecast bars with slip days. This is closer to a real Gantt than anywhere else in the app. Issues: (a) the program selector at the top has 5 options with `PGM-01 … PGM-05` labels and program names that do **not** match the 5 programs in the rest of the module; (b) selecting a different program does not filter the sites; (c) the phase plan is hard-coded for *every* program with the same durations; (d) per-phase actual work is faked via `seedFloat()`; (e) the gantt does not draw dependencies between sites (e.g. SITE-0007 acquisition blocks PRJ-004 start), so it is essentially a parallel set of timeline bars, not a network diagram; (f) there is no critical-path overlay, no resource loading at the bottom, no baseline-vs-current comparison.

Site grid view is solid: rich RAG dots per technology (5G / 4G / WiFi) + overall, next-milestone column with days countdown, open task badge, mini progress bar, View action. CSV export works. The Density Columns integration is used correctly.

**ProjectDetailPage.** Six tabs (Overview / Sites / Tasks / Timeline / S-Curve / Team / Documents). The S-Curve tab is implemented as a **table of planned/actual percentages** (`ProjectDetailPage.tsx:548-592`), not a visual S-curve. That misses the point — a real S-curve is a line chart that immediately shows divergence and the rate of acceleration; a 12-row table forces the user to scan three columns to estimate slope. The Kanban tab is acceptable but limited to three columns (`To Do / In Progress / Done`) which does not match the 5-state task status used elsewhere. Sites table is 12 rows of synthetically generated entries (`Tower Site Alpha`, `Tower Site Beta`, ...) unrelated to the 20 sites in `ProgramSiteRollout.tsx`. Hard-coded `useProjectData` returns the same project content **regardless of the URL `id`** — every project detail page displays "Cluster East 5G NR" with the same milestones, sites, tasks, team. Navigating from `/ppm/PRJ-010` shows you "Cluster East 5G NR" instead of "Hub Site Construction". This is a confidence-destroying bug for any stakeholder.

**TaskDashboard (1,054 lines).** Solid table-and-filter UX with 9 filter facets, full-text search, group-by segmented control, density columns, CSV export, inline status editing, pagination, EmptyState component. SLA dot with breach pulse animation is a nice touch. Issues: (a) the KPI strip values (`kpiTotal = 247, kpiOpen = 186, kpiOnTrack = 141, kpiAtRisk = 32, kpiBreached = 13`) are **literal constants** that do not match the 20-row `MOCK_TASKS` array; only after applying filters does the "Showing X of 247 tasks" become misleading because the implied population is 247 but the file only ever ships 20; (b) bulk operations (bulk reassign, bulk reschedule, bulk status change) are missing entirely — there are no row selections, no "Bulk Actions" menu; (c) the URL params `?assignee` and `?project` are read on mount but not synced back on filter change, so deep-linking from WorkloadDashboard works but copy-current-URL does not; (d) the create modal lists only 5 projects (PRJ-001 … PRJ-005) and 5 sites (SITE-0001 … SITE-0005) — the form is a wireframe, not a real picker; (e) no parent task / sub-task structure, no checklist field, no time-tracking (estimated vs actual hours), no attachment uploads on a task, no comments / @mentions, no watchers.

**WorkloadDashboard.** Three SVG widgets at the top (CapacityBars / TaskDonut / Heatmap) and an Engineer card grid below. CapacityBars uses `ENGINEERS.slice(0, 5)` — only 5 of 8 engineers are visible in the chart even when all 8 cards are below. TaskDonut data (`TASK_STATUS_DATA` totalling `247 = 61+89+24+61+12`) matches the TaskDashboard KPI total (247) **incidentally** (different breakdown: 89 In Progress vs the TaskDashboard's 247 implied open). The Heatmap is a hand-typed 5×8 matrix (`HEATMAP_DATA` at `WorkloadDashboard.tsx:39-45`) — **not derived from any task data**. The Engineer cards correctly read from `ENGINEERS` (8 cards), display utilization bar with red over 100% (Ben Clarke 105%, Frank Nguyen 115%), site tags, "View Tasks" link that passes `?assignee=u1` to `/ppm/tasks`. That deep-link integration is the cleanest cross-page handoff in the module.

**SitePPMTab (in `components/`).** Cross-link from the site detail to its PPM state. (Not requested as one of the 8 files but referenced by the broader app.)

---

## D. Telecom Domain Validation

The PMO module sits between rollout engineering and corporate finance, so its domain accuracy needs to cover both PMBOK terminology and rollout-specific patterns.

**Program / Project / Task hierarchy correctness.** Conceptually right; implementation broken. PMBOK defines:
- **Portfolio:** strategic, indefinite, manages programs and projects to maximise value (e.g. "5G Modernisation Portfolio FY26-FY28").
- **Program:** time-bound, manages related projects to deliver outcomes (e.g. "5G National Rollout — Phase 1").
- **Project:** time-bound, unique scope, deliverable (e.g. "Cluster East 5G NR").
- **Task / Work package:** smallest unit of WBS, ≤ 80 hours, single owner.

This module has Program and Project layers. Tasks live at the project level. There is **no portfolio layer** (acknowledged), **no work-breakdown sub-task layer**, **no deliverable definition**, **no work package** as distinct from a task.

**Site as a first-class scope.** Correctly recognised — sites are scoped to programs (sitesCount on Program), to projects (sitesCount on Project), and tasks link to siteId. This three-level scoping (program / project / site / task) is the correct telecom-rollout shape. However, the cardinality is wrong: a single rollout site routinely has 30–80 tasks across multiple disciplines (RF design, civil, install, integration, optimisation, acceptance), and the same site can appear in multiple projects (e.g. once for 5G build, once for MW backhaul); this many-to-many relationship is not modeled — Task → Site is 1:1 in the schema.

**Work Breakdown Structure (WBS).** Absent. There is no WBS hierarchy, no WBS dictionary, no rolling-wave planning, no work-package code (e.g. `5GN.PH1.C1.E.RF.001`). Every task is flat at the project level. For a 320-site, $45.2M program (PRG-001), the WBS would routinely be 6 levels deep with 5,000–15,000 leaves. The system as built cannot represent this.

**Resource Breakdown Structure (RBS).** Absent. `WorkloadDashboard.tsx` has 8 engineers with role and team, but there is no hierarchy (Discipline → Skill family → Skill → Person), no skill-rating, no certification tracking, no cost rate, no time zone, no calendar. RBS is required for resource leveling and capacity planning at scale.

**Gantt chart with critical path (CPM) — MISSING.** The `RolloutGantt` in `ProgramSiteRollout` is a timeline visualisation, not a CPM Gantt. There is no:
- forward pass (early start, early finish per task),
- backward pass (late start, late finish),
- critical path identification (tasks with zero float),
- near-critical paths (within X days of critical),
- critical-chain (resource-constrained critical path).

Microsoft Project, Primavera P6, OpenProject and even Smartsheet implement these as table-stakes; their absence here means the module cannot tell a PM which task to focus on to recover schedule.

**PERT analysis.** Absent. PERT requires 3-point estimates (optimistic / most likely / pessimistic) per task and a Beta distribution to compute expected duration and standard deviation. No 3-point estimates anywhere; only `dueDate`, no estimate field at all.

**Milestone tracking.** Present at the program level (`ProgramDetailPage.tsx:194-204`) and project level (`ProjectDetailPage.tsx:128-140`) as 6-7 hand-typed entries. No automated rollup from task completion. No milestone slippage report (planned vs actual vs forecast). No milestone payment trigger (relevant for vendor contracts).

**Dependencies (FS / SS / FF / SF).** Absent. See section B.

**Float / Slack calculation.** Cannot exist without dependencies. No total float column, no free float column.

**Resource leveling.** Absent. WorkloadDashboard shows utilization > 100% for Ben Clarke (105%) and Frank Nguyen (115%) but the system offers no automated leveling, no resource-smoothing button, no "level by priority", no "assign to next-available qualified resource".

**EVM (PV / EV / AC / SPI / CPI / SV / CV) — MISSING.** Earned Value Management is the language of PMO governance and is absent from this module entirely. The required artefacts:
- **PV (Planned Value):** budgeted cost of work scheduled to date.
- **EV (Earned Value):** budgeted cost of work performed to date.
- **AC (Actual Cost):** actual cost incurred to date.
- **SV = EV - PV** (schedule variance).
- **CV = EV - AC** (cost variance).
- **SPI = EV / PV** (schedule performance index, 1.0 = on plan).
- **CPI = EV / AC** (cost performance index, 1.0 = on budget).
- **EAC = BAC / CPI** (estimate at completion).
- **VAC = BAC - EAC** (variance at completion).
- **TCPI:** to-complete performance index.

The closest the module gets is a `Budget Burn Rate` area chart with hard-coded `actual` and `plan` arrays — that is *not* EVM, it is a spend-vs-plan curve which conflates AC with EV. Without proper EVM, the program reports cannot be reconciled with finance, and a Tier-1 operator's audit committee will reject the platform.

**Risk register.** Mentioned as a document upload only. No `Risk` entity, no probability × impact matrix, no qualitative ranking, no quantitative Monte Carlo, no risk owner, no mitigation plan, no review cadence.

**Issue / blocker tracking.** A task can be `Blocked` but there is no Issue object. Real PMO platforms separate Risks (forward-looking, may occur) from Issues (occurring now, need resolution) from Defects (deliverable quality failures). All three are needed.

**Workflow alerts acknowledged?** No. The Acknowledge button does nothing. See section B.

**PM workload heatmap (real data?)** No. Heatmaps are hand-typed in both `PPMDashboard.tsx:374-395` (program managers, 5×8) and `WorkloadDashboard.tsx:39-45` (engineers, 5×8). Numbers are unrelated to task counts.

**PMO governance: stage gates / tollgates.** Absent. No gate definitions, no gate review checklist, no approver matrix, no gate review minutes, no gate decision audit trail.

**Integration with Microsoft Project / Primavera P6.** Absent. No XER/XML import/export, no MPP import, no two-way sync, no schedule baseline comparison. PMOs at Tier-1 operators routinely have to import vendor Primavera schedules (Ericsson, Nokia delivery teams ship XER files); the absence of this is disqualifying for a real deployment.

**Capacity-driven scheduling.** Absent. See section B.

**Multi-program portfolio view.** Acknowledged as intentionally absent. Wrong call.

**Burn-down / burn-up charts.** Absent. The Agile metric set (burndown, velocity, cumulative flow diagram, lead time, cycle time) is not represented anywhere.

**Velocity tracking.** Absent.

**Ad-hoc project creation.** Modal exists with required fields (Program / Project Name / Description / Target Start / Target End / Assigned PM). Form validates and toasts on success but persists nothing. The "Adhoc" tag is rendered on the listing for adhoc projects to distinguish from templated ones — good intent. But there is no template library to pick from (`Templatized` projects show `templateName` like `Macro 5G New Build` but no template entity exists).

**Workload balancing.** WorkloadDashboard surfaces utilization but offers no rebalancing action. There is no "reassign Ben Clarke's overflow" button, no "find next available qualified RF Engineer" intelligence.

---

## E. Data Review

Every KPI, chart, table validated for derivation and consistency.

**KPI strip on PPMDashboard.** Five cards. Total Programs = 5 (✓ from `ALL_PROGRAMS.length`). Active Projects = 6 (derived from `sum(p.activeProjects)`, ✓). Open Tasks = 247 (✓ from sum of `p.openTasks` = 92+48+35+0+72). SLA Breaches = 12 (✓ from sum of `p.slaBreaches` = 5+2+1+0+4). Budget Utilized = 65% with `$55.2M / $116.8M`. **DATA ERROR:** `$55.2M / $116.8M = 47%`, not 65%. The actual sum of `budgetSpentM` is 28.9+6.5+1.8+12.1+5.9 = `$55.2M`, total `$116.8M`, so the right percentage is 47%. But the displayed value uses the sum of spent + total computed correctly, and `Math.round(55.2/116.8 * 100) = 47`. Wait — the code is `Math.round((budgetSpent / budgetTotal) * 100)` which gives 47, not 65. Looking again at the file, the displayed `Budget Burn Rate` card explicitly shows `$76.2M / $116.8M plan` (`PPMDashboard.tsx:614-615`) and the `65%` Utilization chip below. **`$76.2M`** is the last value of the hard-coded `budgetActual` array (`PPMDashboard.tsx:397`), not the program budget sum. So the two budget surfaces on the same page show different totals: the KPI strip reads program rollups ($55.2M), the Burn card reads a hand-typed `$76.2M`. These do not reconcile. This is exactly the kind of inconsistency that ruins steering-committee credibility.

**Task SLA Status stacked bar.** Hand-typed 170 / 65 / 12 = 247 total. TaskDashboard's KPI strip says 141 / 32 / 13 = 186 open. Both surfaces describe "task SLA status" but with different numbers. Not reconciled.

**Delivery Health donut (58 / 28 / 14 %).** Hard-coded. No projects in the dataset have a "delivery health" field. The donut is decorative.

**Budget Burn area chart.** `actual = [8.2, 16.1, 24.8, 33.5, 42.0, 54.3, 64.7, 76.2]`, `plan = [10, 20, 30, 40, 52, 62, 74, 85]`. No source. The `$76.2M` and `$40.6M` remaining are derived from these hard-coded arrays.

**Programs Grid.** Each card reads correctly from `ALL_PROGRAMS`. Progress bar widths match `prog.progress`. Status colour mapping is correct. Sites/projects counts match the source rows.

**Heatmap (Task Volume by Week × Assignee).** 5 program managers × 8 weeks. Numbers are random-looking hand-typed. Title says "Task Volume" but the rows are program managers, not task assignees, so the chart misrepresents the task→PM relationship. PMs don't execute tasks; the assignees are engineers.

**Activity Feed.** 9 hand-typed rows with timestamps like "10 min ago", "Yesterday", "2 days ago". Time-relative strings are static (will say "10 min ago" forever).

**Workflow Alerts.** 5 hand-typed rows; 3 OVERDUE, 2 PENDING. SLA strings ("Overdue 2d", "4 hrs left") are static.

**ProgramDetailPage KPIs.** "Total Projects" = `program.projectsCount` (hand-typed on program). "Sites in Scope" = `program.sitesCount` (hand-typed). "Progress" = `program.progress` (hand-typed). "Budget Spent" = `program.spent` / `program.budget` (both hand-typed strings, e.g. `'$28.9M'`). None of the project-level data rolls up to compute these.

**ProjectDetailPage KPIs.** "Total Sites" = 45, "Tasks Completed" = 324/450, "Progress" = 72%, "Budget Spent" = $8.2M of $12.5M. All hand-typed in `useProjectData` and **identical for every project ID** — this is the bug noted in section C.

**TaskDashboard KPIs.** 247 / 186 / 141 / 32 / 13. Constants. The 20 rows in `MOCK_TASKS` cannot back these numbers.

**WorkloadDashboard.** `ENGINEERS` 8 rows with hand-typed `tasksAssigned`, `capacity`, `utilization`. `TASK_STATUS_DATA` totals 247 (matches TaskDashboard's 247). `HEATMAP_DATA` is independent.

**ProgramSiteRollout summary stats.** "Total Sites" = 150, "Active" = 98, "Ready to Activate" = 45, "Behind Schedule" = 23, "Avg Completion" = 58%. Constants. The 20 rows in `SITES` cannot back these numbers either.

**Summary:** Of the ~30 surfaced metrics across the 8 pages, perhaps 6 (Programs Grid card values, KPI Total Programs, KPI Active Projects, KPI Open Tasks, KPI SLA Breaches, Budget Utilized %) are derived from data shown on the page. The other ~24 are hand-typed constants that frequently contradict each other. A PMO cannot operate on this data.

---

## F. Scalability Review

**UI scalability.** TaskDashboard pagination is in place (50 rows per page). Programs Grid uses 3-column responsive layout — at 50 programs the page becomes a wall of cards (50 ÷ 3 = 17 rows of cards) which is workable but begs for grouping (by region, by status, by quarter). At 100 programs, the page is unusable without filters. There is a search affordance only for tasks; no search/filter on the Programs Grid.

**Data scalability.** Every dataset is an in-memory array. At 100K sites and a typical rollout cadence of 50 tasks/site (5M tasks total), the current model would attempt to render 5M-row tables and a 5M-cell heatmap. No virtualisation is configured on the AntD tables; AntD scales OK to ~1,000 rows but not to 100K. The Gantt visualisation iterates `SITES.map((s) => SCHEDULES[s.id])` (`ProgramSiteRollout.tsx:328`) which is O(N) per render at every filter change — at 1,000 sites the page will become sluggish.

**Workflow scalability.** Workflow alerts are an array prop. Real-world: every site has 5-10 in-flight workflows at any time, so 100K sites = 500K–1M open workflows. No pagination, no server-side filtering, no streaming — the architecture cannot reach that scale.

**Schedule scalability.** Without a real scheduler, the system cannot represent the precedence network for even one program. A 320-site 5G program with the typical 30-task site template = ~10K tasks with ~15K dependency edges. Modern PMO tools (P6, MSP) use efficient task-tree storage + lazy CPM; this module has neither.

**API readiness.** No service layer for PPM entities; all data is module-local in-memory. Every entity (program, project, task, milestone, document, workflow, alert, engineer) needs a backing API with pagination, filtering, sorting, soft-delete, audit, optimistic locking, and webhooks. None of this exists.

---

## G. AI Opportunities

The PPM module is *the* highest-leverage location for AI in the rollout app because every other module's state feeds it. High-value AI features that should exist (none do):

1. **Schedule risk predictor.** Given the current task graph, completion history, weather forecast for the site location, and assignee throughput, predict probability of meeting each milestone. Surface top-10 at-risk milestones with the strongest contributing factors.
2. **Auto-replan after slip.** When a task slips, recompute the downstream schedule respecting resource calendars and propose a new baseline. PM accepts/rejects per task.
3. **Resource recommendation.** Suggest the next-available qualified engineer for an unassigned task, considering skill match, current utilization, geographic proximity, and recent task acceptance rate.
4. **Status auto-summarisation.** Generate a "what changed this week" digest per program, suitable for steering committees, derived from milestone completions, risk additions, budget burn, and assignee-level utilization shifts.
5. **Risk-mining from comments.** Run an LLM over task comments / blocker descriptions to detect emerging risks and propose risk-register entries (e.g. "permit delay rate has tripled in Region North in the last 30 days").
6. **Anomaly detection on budget burn.** Detect deviations from the planned S-curve >2σ and surface as cost-variance alerts.
7. **Critical path simulation.** Monte Carlo the schedule with per-task duration distributions (PERT 3-point) to give a P50/P80/P95 completion-date band rather than a single number.
8. **Dependency inference.** When a PM creates a new task on a site, auto-suggest predecessor/successor links based on the historical task graph for similar sites.
9. **PMO copilot.** Natural-language queries ("which programs will miss go-live by more than 10 days at 80% confidence?", "show me engineers over-allocated next sprint with reassignment suggestions"). The PMO is a chat-first surface in modern tools (Microsoft 365 Copilot for Project, Wrike AI).
10. **Vendor SLA scoring.** Auto-score each external vendor (delivery team) on schedule adherence, defect rate, and rework — feed into procurement.

---

## H. UX & Visualization Improvements

**(H1) Build a real CPM Gantt.** The current `RolloutGantt` is the foundation. Add: (a) dependency lines between bars (FS/SS/FF/SF), (b) critical-path highlight (red bar fill), (c) baseline-vs-current shadow bar, (d) milestone diamonds at zero-duration points, (e) resource histogram lane at the bottom showing per-day allocation per discipline.

**(H2) Tollgate ribbon at the top of every Program / Project page.** Six-step Steps component showing G0 … G5 with current gate highlighted, gate criteria checklist, approver names, gate-review date, and a "Submit for Gate Review" action gated by criteria completion.

**(H3) S-Curve as a chart, not a table.** Plot planned vs actual cumulative %. Show divergence band. Add forecast extrapolation. This is one of the most-recognised PMO visuals; the current 12-row table is unusable.

**(H4) Burn-down / Burn-up charts.** For Agile-managed sub-projects (small cells, IoT rollout), implement story-point burn-down per sprint and feature burn-up per release. Add velocity chart (last N sprints).

**(H5) Stoplight portfolio matrix.** A 5×5 risk heatmap (probability × impact) with chips for each risk. The PMO industry standard.

**(H6) Resource leveling explorer.** Split-pane view: top half shows over-allocated engineers with their tasks; bottom half lets the PM drag tasks to other engineers; system computes new allocation in real-time.

**(H7) Workflow alerts must actually do something.** Acknowledge must call an API, persist `acknowledgedBy` / `acknowledgedAt`, and remove the row from the badge count. Add an Escalate action that re-assigns + notifies. Add a snooze. Add a "comment to step owner" field that emails them.

**(H8) Reconcile all KPI surfaces.** A single source of truth for `kpiTotal`, `kpiOpen`, `kpiOnTrack`, `kpiAtRisk`, `kpiBreached`, `programCount`, `projectCount`, `budgetSpent`, `budgetTotal`. Computed in one place, consumed by `PPMDashboard`, `TaskDashboard`, `WorkloadDashboard`, `ProgramListPage`. The current state of two pages showing different SLA counts is the kind of error that loses CIO confidence at the first review.

**(H9) Per-engineer skill matrix.** WorkloadDashboard engineer cards should show skill tags (RF, Civil, Integration, MW alignment, Power) with proficiency dots, certifications (Ericsson Certified Field Engineer, BICSI RCDD, etc.), and current cluster/region. Reassignment decisions depend on these.

**(H10) Mobile-first task action.** Field engineers update task status on-site. A dedicated mobile-optimised task action card (status update + photo evidence + GPS-stamped) is missing; the current desktop status dropdown is not field-ready.

**(H11) Multi-task bulk operations.** Add row selection to TaskDashboard. Bulk Reassign, Bulk Reschedule, Bulk Status Update, Bulk Add Watcher, Bulk Export. These are 80% of PMO daily volume.

**(H12) Stage indicator on workflow alerts modal.** The current modal shows site + step + an inferred owner. It should show the workflow's full step sequence (e.g. Site Acquisition: Survey → Lease Offer → Legal Review → Landlord Sign → Council Permit → Construction Ready) with current step highlighted, owner per step, ETA per step, total SLA budget burnt, and a one-click "Bypass with Director Approval".

**(H13) Cross-program dependency graph.** A network view showing which programs depend on which (e.g. 5G National depends on MW Backhaul Modernisation in the same regions). Cytoscape.js or d3-force is appropriate.

**(H14) Document store.** Replace the hand-typed Documents tab with a real DMS-style page: folder tree, versioning, check-in/check-out, retention policy, classification (confidential / internal / public), redlining for contracts. Tier-1 operators are SOX/ISO 27001 audited and document trails are mandatory.

---

## I. Technical Architecture Concerns

**(I1) Three sources of truth for programs.** `ALL_PROGRAMS` in PPMDashboard, `useProgramData` in ProgramListPage, `PROGRAMS` dict in ProgramDetailPage. **Fix:** create a single `usePrograms()` hook backed by an entity store (Redux, Zustand, or whatever the app uses elsewhere). All three pages consume from one source.

**(I2) ID scheme drift.** `PRG-001` vs `PGM-01` across the same module. **Fix:** standardise on `PRG-NNN` (matches `PRJ-NNN`, `TSK-NNNN`, `SITE-NNNN` patterns elsewhere). Migrate the Task and Workload dashboards.

**(I3) Local state for task status changes.** TaskDashboard tracks edits in `taskStatuses` `useState`. **Fix:** lift to a context or store, persist via API, add optimistic update + rollback on failure, audit-log the change.

**(I4) Modal forms with no persistence.** Create Program, Create Adhoc Project, Create Task, Add Resource, Edit Project, Edit Program — all validate and toast success without writing. **Fix:** wire each form to a mutation; on success append to the source array and persist. If no API is available yet, at minimum hold in a session store.

**(I5) Hard-coded "current date" sentinels.** `TaskDashboard.tsx:464` (`const today = new Date('2026-05-14')`) and `ProgramSiteRollout.tsx:267` (`const TODAY = new Date('2026-05-22')`). These freeze the entire page's "overdue" logic to a single date and will silently break a year from now. **Fix:** use `new Date()` or inject a clock service for testability.

**(I6) Density-aware columns inconsistent application.** TaskDashboard, ProgramListPage, ProgramSiteRollout use `useDensityColumns`. ProgramDetailPage, ProjectDetailPage do not. **Fix:** apply uniformly so the global density toggle works everywhere.

**(I7) No error boundaries.** Detail pages render `<Empty />` when the ID is unknown but don't catch deeper failures (e.g. malformed program record). **Fix:** wrap each page body in an ErrorBoundary.

**(I8) PPMDashboardHub renders three full bodies in tabs.** Each body is heavy (PPMDashboard ~1,200 LOC, TaskDashboard ~1,050 LOC, WorkloadDashboard ~400 LOC). All three mount simultaneously even when only the active tab is visible. **Fix:** AntD Tabs `destroyInactiveTabPane` or lazy-load via React.lazy + Suspense.

**(I9) AntD `bodyStyle` deprecated.** `PPMDashboard.tsx:520, 555, 607` etc. use `bodyStyle={{ padding: 24 }}`. AntD 5.x prefers `styles={{ body: {...} }}`. **Fix:** migrate to the new API.

**(I10) Inline `<style>` inside SlaDot for a global keyframe.** `TaskDashboard.tsx:233`. Re-renders the `<style>` on every row paint. **Fix:** move keyframe to a global stylesheet.

**(I11) Heatmap colour scale is wrong for the data.** `WorkloadDashboard.Heatmap` uses 4 bands but the actual data range (1–18) spreads only across 3 visible colours; engineer over-allocation is buried at the top end. **Fix:** use a perceptual quantile-based scale.

**(I12) CSV exports duplicate code.** TaskDashboard, ProgramSiteRollout both implement CSV stringify with `r.map((c) => \`"${String(c).replace(/"/g, '""')}"\`)`. **Fix:** extract `toCSV(headers, rows)` helper.

**(I13) The `Sparkline` KPI sparklines fabricate history.** `PPMDashboard.tsx:362-365` use `[Math.max(0, openTasks - 80), Math.max(0, openTasks - 60), Math.max(0, openTasks - 40), Math.max(0, openTasks - 20), openTasks]` as a "trend". This is not telemetry — it is a synthetic 4-step ramp that converges on the current value, so every KPI looks like it's been steadily rising. Misleading. **Fix:** show a real 30-day trend from a metrics service, or remove the sparkline.

**(I14) Inline CSS-in-JS at scale.** Many components mix style objects, inline gradient strings, and AntD style props. **Fix:** introduce a theme tokens layer (matches the design system used elsewhere in the app).

**(I15) Mock document download is a text stub.** `ProgramDetailPage.tsx:267-277` generates a `.pdf`/`.xlsx` filename containing plain text. Opening will fail in PDF viewers, Excel will throw a corruption warning. **Fix:** generate a valid PDF/XLSX or label as `.txt` so the OS opens it correctly.

---

## Scoring

| Dimension | Score (out of 10) | Rationale |
|---|---|---|
| **A. Module Purpose & Boundaries** | 4 | Right purpose; broken boundaries (3 program sources, ID drift, portfolio missing). |
| **B. Workflow Completeness** | 1 | No stage gates, no acknowledgement, no SLA engine, no dependencies, no leveling. |
| **C. Screen Quality** | 6 | UX is polished; functionality is shallow. Gantt is good. Detail pages are broken (same data for every ID). |
| **D. Telecom / PMO Domain** | 1 | No WBS, no RBS, no CPM, no PERT, no EVM, no MSP/P6 integration. |
| **E. Data Integrity** | 1 | Hand-typed KPIs, inconsistent across surfaces, contradicting totals. |
| **F. Scalability** | 2 | Cannot scale beyond ~1,000 rows; no virtualisation; no API layer. |
| **G. AI Opportunities** | 0 | None implemented. (Listed 10 high-value gaps.) |
| **H. UX & Visualization** | 5 | Strong hero design; weak operational surfaces (S-curve as a table, no burn-downs). |
| **I. Technical Architecture** | 3 | Reasonable componentisation; major issues with state, persistence, ID drift, frozen dates. |
| **Overall PPM Module Score** | **2.1 / 10** | Demo-grade. **Unfit for Tier-1 operator PMO use.** |

Benchmark comparison:
| Tool | Equivalent Maturity Score |
|---|---|
| Microsoft Project Online | 7.5 |
| Primavera P6 EPPM | 8.5 |
| ServiceNow SPM | 7.0 |
| Planview Enterprise | 7.5 |
| Smartsheet Advance | 6.0 |
| Asana Enterprise | 5.5 |
| Monday WorkOS | 5.0 |
| **This Module (today)** | **2.1** |
| **This Module (with Top-10 fixes)** | **5.5** (parity with Asana Enterprise) |
| **Target (Tier-1 PMO ready)** | **7.5+** |

---

## TOP 10 PRIORITY FIXES (ranked by operational impact)

**1. Fix all KPI reconciliation across the three dashboards.**
   * Source-of-truth `useRolloutMetrics()` hook returns `{ programs, projects, openTasks, onTrack, atRisk, breached, budgetTotal, budgetSpent }` derived from one canonical dataset.
   * Consumed by `PPMDashboard`, `TaskDashboard`, `WorkloadDashboard`. Today: PPMDashboard says 170/65/12 SLA, TaskDashboard says 141/32/13 — both for "all tasks". Pick one and remove the other.
   * Effort: 2 days. Impact: removes the single biggest credibility risk in the module.

**2. Unify the program / project / task entity model and the ID scheme.**
   * One `useProgram(id)`, `usePrograms()`, `useProject(id)`, `useProjects()`, `useTask(id)`, `useTasks()` against entity stores.
   * Standardise on `PRG-NNN` / `PRJ-NNN` / `TSK-NNNN`. Delete `PGM-NN` everywhere.
   * Fixes ProjectDetailPage rendering the same project for every ID, and TaskDashboard's filters silently failing to match programs by ID.
   * Effort: 4 days. Impact: prerequisite for everything else.

**3. Persist all modal-form submissions.**
   * Create Program, Create Adhoc Project, Create Task, Add Resource, Edit Program, Edit Project, Upload Document, Acknowledge Workflow, Inline Task Status Edit.
   * Today: every one of these toasts success and discards the data. Effort: 3-4 days with a session store; 8-10 days with a real API.
   * Impact: makes the module behave like a real product instead of a wireframe.

**4. Build a real Earned Value Management (EVM) surface.**
   * Add `plannedValue`, `earnedValue`, `actualCost`, `bac` to each project. Compute SV, CV, SPI, CPI, EAC, VAC, TCPI.
   * Surface as a Project KPI strip and as a Program rollup.
   * Replace the current `Budget Burn Rate` AreaChart with a 4-line EVM chart (PV / EV / AC / EAC over time) and a CPI/SPI bullet graph.
   * Effort: 5 days. Impact: unlocks any meaningful conversation with finance and audit committee.

**5. Implement a real Gantt with CPM (critical path) and dependencies.**
   * Extend `RolloutGantt` to read a `Task[]` with `predecessors: { id, type: 'FS'|'SS'|'FF'|'SF', lag: number }[]`.
   * Run forward/backward pass to compute ES/EF/LS/LF/TF/FF per task. Highlight critical path in red.
   * Draw dependency lines (curved SVG paths from predecessor's EF to successor's ES).
   * Add baseline shadow bar.
   * Effort: 8-10 days. Impact: closes the largest PMO functional gap.

**6. Workflow alerts that actually do something.**
   * Workflow entity with `steps: { name, ownerRole, slaHours }[]`, `currentStep`, `status`, `acknowledgedBy`, `acknowledgedAt`, `escalatedTo`, `comments`.
   * Acknowledge writes to the DB and removes the alert from the badge count. Escalate notifies the next-level owner. Bypass requires Director-level approval.
   * SLA clock honours business calendar (M–F 9–5, holiday-aware).
   * Effort: 5-7 days. Impact: turns the alerts panel from decoration into the rollout's nervous system.

**7. Stage-gate / tollgate model.**
   * Define a 6-gate model: G0 Concept, G1 Initiate, G2 Design, G3 Build, G4 Deploy, G5 Operate, G6 Close.
   * Per-program and per-project Steps ribbon at the top with current gate, approver list, checklist, "Submit for Gate Review" action.
   * Gate decisions auditable. No tasks can complete past the current gate until the gate is passed.
   * Effort: 6-8 days. Impact: makes the module governance-ready.

**8. Resource Breakdown Structure + capacity-driven scheduling.**
   * Engineer entity with skills + proficiency + certifications + cost rate + calendar.
   * Task entity gets `requiredSkills`, `estimatedHours`, `assignmentPct` (0-100%).
   * Resource leveling action: smooth allocations within the available calendar.
   * Surface real utilization computed from `(sum of assigned hours in window) / (capacity hours in window)`.
   * Effort: 8-10 days. Impact: makes the WorkloadDashboard actually true.

**9. Microsoft Project / Primavera P6 import-export.**
   * MPP (.mpp) and XER (.xer) parser + emitter so vendor schedules can be ingested and operator schedules can be shipped back to vendors.
   * Schedule baseline comparison: imported vendor plan vs current operator plan, surfaced as variance per task and per milestone.
   * Effort: 10-15 days. Impact: removes the disqualifying "no integration" objection from any Tier-1 procurement.

**10. Risk register + Issue tracker entities.**
   * `Risk` entity (probability 1-5, impact 1-5, score = P×I, owner, mitigation plan, target date, status).
   * `Issue` entity (severity Sev-1/2/3, owner, status, target resolution, link to blocking task).
   * 5×5 risk heatmap on every program and project page.
   * Effort: 5-7 days. Impact: closes the second-largest governance gap.

---

## Closing Observation

The PPM module is the rollout brain — and the rollout brain is a wireframe. Other modules (RF Design, MW Link, Power, CRAN) ship plausibly accurate engineering surfaces backed by clear domain math; the PPM module ships a beautiful but inert PMO surface backed by 5 hand-typed programs, 11 hand-typed projects, 20 hand-typed tasks, and a dozen contradictory hand-typed KPIs. Every cross-cutting weakness in the rest of the app (no entity store, no real persistence, ID drift, fabricated KPIs, missing audit trail) compounds here because PPM is where program managers go to *trust the data*. Fixing the Top 10 above moves the module from "demo-only" to "Asana Enterprise-grade"; getting to "Microsoft Project / Primavera P6 parity" is another 6-12 months of work. The first three fixes (KPI reconciliation, entity unification, modal persistence) are mandatory regardless of the long-term roadmap, because they remove the data-credibility cliff that will sink any pilot with a real operator PMO.
