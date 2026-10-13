# Deep Review: Maintenance Management Module

**Reviewer:** Telecom CMMS / EAM Architect (20+ yrs at Tier-1 operators)
**Date:** 2026-05-26
**File Reviewed:**
- `src/modules/maintenance-mgmt/pages/MaintenanceManagementHub.tsx` (466 lines, **the only page in the entire module**)

**Benchmarks:** IBM Maximo (Asset & CMMS), SAP Plant Maintenance (PM), ServiceMax Field Service, IFS Service Management, Infor EAM, Hexagon EAM, Oracle eAM, UpKeep, Fiix CMMS

---

## A. Module Scope and Coverage (Severe Gap Analysis)

The entire enterprise Maintenance Management capability for what is clearly intended to be a Tier-1 telecom RAN platform is delivered through **ONE file, 466 lines, with hard-coded mock data**. The page itself is a read-only integration shim: every action button either navigates away ("Legacy Sites view", "Legacy Power view") or opens a stub anchor (`href="#maintenance-platform"`) that goes nowhere. The author has even acknowledged this in the file header comment: *"The system of record is the existing Maintenance Mgmt platform; this page surfaces a synthesized view... read-only links into the underlying platform."*

To benchmark: IBM Maximo's RAN/telecom industry pack ships with **~140 distinct screens** for CMMS alone. SAP PM has 90+ transaction codes for plant maintenance. ServiceMax mobile has 30+ work-order views. The implementation here has **1 page with 4 tabs** (Current Maintenance, Work Orders, Project List, PM Schedules) plus 5 KPI tiles — effectively **<1% of the minimum-viable surface area** of a competitive CMMS. By the author's own admission this is not a CMMS at all; it is a dashboard widget that hopes a real CMMS exists somewhere else.

What does not exist anywhere in the module:
- Work Order creation, editing, assignment, dispatching, closing, reviewing
- Work Request intake (the inbox before WO conversion)
- Preventive Maintenance template / job-plan authoring
- Predictive Maintenance / condition-based triggers
- Service Request portal for non-technician users
- Maintenance Calendar / Gantt / Crew Schedule Board
- Crew Management (crew composition, skills, certifications, availability)
- Labor reporting / time-sheets / clock-in / clock-out
- Parts / Materials Issue against a work order
- Tools & Test Equipment checkout
- Mobile Field Execution app (the most-used module in any real CMMS)
- Lockout-Tagout (LOTO) / Permit-to-Work (PTW) / Hot-Work permit
- Hazard / Risk Assessment, Safety Inspection
- SLA / OLA contract management
- Failure Analysis (RCA, 5-Whys, FMEA, Pareto)
- KPI dashboards (MTBF, MTTR, MTBR, OEE, PM compliance %, schedule attainment)
- Cost Tracking per WO / Asset / Site / Cost Center
- Vendor Work Order dispatching (subcontractor SLA enforcement)
- Tower-climb / Confined-space / High-voltage safety integration
- Energy / DLC scheduling
- Manufacturer-recommended maintenance schedules import
- Spare-parts auto-reservation / kitting
- Knowledge base / Standard Operating Procedures linked to job plans
- Multi-language / multi-time-zone / multi-region

The implementation displays **8 hard-coded work orders, 4 hard-coded projects, 6 hard-coded PM schedules** in a single page. That is the entire dataset.

## B. Work Order Lifecycle Coverage

A proper CMMS work-order lifecycle has **8-12 distinct states** governed by a state machine: New → Assigned → Reviewed → Planned → Scheduled → Dispatched → Started → On-Hold → Completed → Reviewed → Closed → Reopened. The implementation declares only **4 statuses** in the `WorkOrder` type (`MaintenanceManagementHub.tsx:62`): `Open | In Progress | Awaiting Parts | Scheduled`. Critical gaps:

- No "New" / "Requested" — there is no intake state before a WO exists.
- No "Planned" distinct from "Scheduled" — planning (scoping work, building task list, assigning crew, ordering parts) is a separate workflow from scheduling (booking on a calendar).
- No "Dispatched" or "Started" — there is no tech-facing state. The dashboard says "In Progress" but cannot say when work actually started.
- No "Completed" vs. "Reviewed" vs. "Closed" — these are three different gates in any audited CMMS (tech says "I'm done", supervisor reviews and signs, finance closes for cost capture).
- No "On Hold" / "Cancelled" / "Voided" — operationally essential when weather/permit/parts issues stop work.
- No state-transition rules — a record currently moves between states by mutating a string. There is no validation that a WO can only go from Scheduled → Dispatched → In Progress, no required reason for backwards transitions, no audit log of who changed what.
- No priority-based escalation — the file has P1/P2/P3 priorities but no SLA timer, no escalation tree, no on-call rotation integration.

The Current Maintenance tab claims to show "active work happening right now" and counts statuses, but it cannot actually open, edit, assign, or close a work order. Every operational action a maintenance supervisor needs to perform — change priority, reassign crew, add a part to the WO, log labor hours, capture a photo, mark complete — is **not implemented at all**.

## C. Preventive Maintenance (PM) — Critical Gaps

The PM Schedules tab (`MaintenanceManagementHub.tsx:402-447`) shows a 6-row table with Asset / Task / Cadence / Next-Date / Overdue badge. This is a **PM compliance dashboard at best, not a PM management system**. What is missing:

- **No PM template / job plan authoring.** A real PM contains a checklist of 10-50 tasks with estimated labor minutes, required tools, required spare parts (consumables), required permits, safety hazards, applicable instruments, acceptance criteria. None of that schema exists.
- **No PM generation policy.** Should the next PM be generated relative to the previous due-date or completion-date? Should it skip if too close to the prior one? Should it generate even if the previous is overdue? These are configuration questions in any real CMMS — entirely absent.
- **No cadence types.** Only the text "Quarterly / Monthly / Annual / Bi-annual" — there is no enum, no every-N-days, no every-N-runtime-hours, no every-N-cycles, no calendar-vs-floating, no first-day-of-quarter vs. anniversary cadence.
- **No condition-based PM.** No sensor thresholds (temperature, vibration, oil quality, hydrogen for batteries, VSWR for radios) that trigger a PM. No IoT integration. No SCADA / OSS-NMS integration despite this being a *telecom RAN* platform.
- **No usage-based PM.** Generators tracked by run-hours, vehicles by km/miles, batteries by charge-cycle count — none of it modelled.
- **No predictive maintenance.** No anomaly-detection ML model, no failure-prediction score, no recommended-action engine.
- **No PM compliance reporting.** The "PM Tasks Overdue" KPI is a count; there is no schedule-attainment %, no rolling-90-day compliance, no by-asset-class breakdown, no upcoming-30-days forecast.
- **No skip / defer workflow.** When a tech finds a PM is unnecessary (e.g., generator was just serviced under warranty) there is no defer-with-reason flow.

## D. Corrective Maintenance & Emergency Response

A real CMMS distinguishes three workflows:

1. **Routine Corrective** (planned, non-urgent, e.g., "replace tower light bulb").
2. **Urgent Corrective** (24-48h SLA, e.g., "rectifier fan noisy").
3. **Emergency** (immediate, e.g., "site down, generator failed").

The implementation has only one path: a `priority` field of P1/P2/P3 attached to a work order. There is:

- No emergency dispatch workflow with on-call escalation tree.
- No NMS / OSS fault-management integration. A real telecom CMMS auto-creates emergency work orders from alarms (e.g., Site Down for >15 min → WO-Auto created → dispatched to nearest crew with ETA). This is the **single most important integration** for telecom — entirely missing.
- No incident management bridge (ITIL Incident → Problem → Change → Work Order).
- No SLA contracts driving priorities ("Gold sites: 4h response, 8h restore; Silver: 8h response, 24h restore"). The P1/P2/P3 enum is decorative.
- No outage-impact scoring (sites affected, subscribers affected, revenue loss/hour).
- No customer notification integration.

## E. Mobile Field Execution — Entirely Absent

The most-used feature of any real CMMS is the **mobile technician app**. Field crews do not sit at desks; they live in trucks with tablets. ServiceMax, Maximo Mobile, SAP Fiori, IFS Cloud Mobile all ship native iOS/Android apps with:

- Offline-first WO download, sync on reconnect
- Push notifications for new assignments
- Turn-by-turn navigation to site
- Camera capture with auto-EXIF
- Voice-to-text notes
- Barcode/QR scan for parts and equipment
- Digital signature capture
- Time-clock (start/pause/stop labor)
- Parts-used capture (scan or pick from kit)
- Failure code selection
- Pre-job safety checklist with mandatory acknowledgement
- Permit-to-work issuance
- Photo and video evidence
- Customer/site-owner sign-off

**Zero** of this exists. The implementation has only a desktop dashboard with read-only tables. A technician cannot accept, start, log, or close a work order from a phone. There is no PWA hint, no responsive breakpoint optimization beyond standard Ant Design, no service-worker, no IndexedDB queue.

## F. Safety, Permits & Compliance

The implementation references "PPE harness inspection sweep" and "Safety" as a category — that is the extent of safety. A real telecom maintenance system must include:

- **Lockout-Tagout (LOTO)** — required before any work on energized equipment. Tag issuance, key-control, multi-person LOTO for crews, removal log.
- **Permit-to-Work (PTW)** — confined space (battery rooms, shelters), hot work (welding, soldering on tower), working-at-height (tower climbing), electrical work (>50V DC), excavation.
- **Job Safety Analysis (JSA)** — hazard identification, mitigation, sign-off before work starts.
- **Toolbox talk** — pre-job briefing record.
- **Incident/Near-miss reporting** — OSHA Form 300/301 equivalent.
- **Crew safety certifications** — climbing cert, first-aid, RF-awareness, MEWP — with expiry tracking that blocks WO assignment when expired.
- **Hazard register per site** — RF exposure zones, asbestos, lead paint, snake/wildlife risk, lone-worker procedures.

None of this exists.

## G. Cost, Reliability & KPI Tracking

The page shows a "MTTR (P1)" KPI tile of "3.8 h" hard-coded. There is no actual calculation engine. What is missing:

- **MTBF / MTTR / MTBR per asset / asset-class / site / region** — must be computed from WO start/end timestamps joined with asset failure history.
- **First-Time Fix Rate** — exists as a hard-coded "86%" tile.
- **Schedule Compliance / Attainment** — % of scheduled PMs completed on or before due date.
- **Backlog** — open WO count and aging buckets (0-7, 8-30, 31-90, >90 days). Not visible.
- **Cost per WO** — labor $ + parts $ + contractor $; rollups by asset, site, category, cost-center.
- **Wrench time / Productive time** — % of crew shift spent actually fixing things.
- **PM-to-CM ratio** — health indicator of maintenance maturity.
- **Failure code analytics** — Pareto charts of most-common failure modes.
- **Reliability engineering** — Weibull analysis, bathtub-curve fitting, RAM (Reliability/Availability/Maintainability) modelling.

## H. Integration Architecture

The module is labelled as an "integration shim" but has no real integration. There is:

- No API client. No mention of REST/GraphQL/SOAP endpoints to the "real" Maintenance platform.
- No authentication context for the upstream system. SSO, OAuth, mTLS — nothing.
- No webhook / event-driven model for receiving updates from the source.
- No conflict-resolution strategy for stale data.
- No data freshness indicator beyond "Refreshed every 5 minutes" footer text (which is not actually wired to anything).
- The "Open Maintenance Platform" button is `href="#maintenance-platform"` — an anchor link to nothing.

If the real CMMS is Maximo / SAP PM / ServiceMax, the integration would need: WO sync (CRUD), PM sync, Asset sync (already incomplete), Failure-code sync, Labor-claim sync, Parts-issue sync, Cost actuals sync, plus SSO and audit propagation. None of it is designed.

## I. UX, Architecture & Code Quality

- **No data layer separation.** All data is `const`-declared at module scope. Replacing with API calls requires a full rewrite.
- **No state management.** No Redux, Zustand, React-Query, SWR. The page is purely presentational.
- **Hard-coded dates everywhere.** "Today" is implicit; "Tomorrow" is a string; overdue calculation is a static boolean. Date math will silently rot.
- **No accessibility.** The category-chip buttons (`MaintenanceManagementHub.tsx:240-264`) are `<button>` but lack `aria-pressed` semantics for the active state.
- **No empty-state.** If the work-order list were empty, the table would just render its own default empty message — no friendly call-to-action.
- **No filter persistence.** The active category resets on every navigation.
- **No bulk actions.** Cannot select multiple WOs and reassign, close, or print.
- **No print / export.** Cannot export the WO list to CSV/PDF, cannot print a work-pack for a crew.
- **No deep-linking.** Cannot share a URL to a specific WO ID — the page has no detail route.
- **Single-page architecture.** There is literally one page; clicking a WO ID does nothing — no `WorkOrderDetailPage` exists.

---

## Scoring

| Capability | Score (0-10) | Justification |
|---|---|---|
| Work Order Lifecycle | **1** | 4 states, no state machine, read-only, no detail page |
| PM Scheduling | **1** | Display-only table; no template, no policy, no generation |
| Predictive / Condition-Based | **0** | Entirely absent; no IoT / SCADA / NMS integration |
| Emergency / Fault Integration | **0** | No NMS hook, no on-call, no auto-WO from alarms |
| Mobile Field Execution | **0** | Desktop-only; no offline; no scanner; no signature |
| Parts / Materials on WO | **0** | No parts-issue workflow on any work order |
| Labor / Time Tracking | **0** | No timesheets, no clock-in, no labor claim |
| Safety / LOTO / Permits | **0** | Not implemented |
| Cost Tracking | **0** | No cost capture per WO |
| MTBF / MTTR / Reliability | **1** | Hard-coded display tiles only |
| Crew Management | **0** | "Crew B-7" as a free-text string; no roster, no skill, no cert |
| Vendor / Subcontractor WO | **0** | Not implemented |
| SLA / Contract Management | **0** | P1/P2/P3 decorative only |
| Mobile / Offline Capability | **0** | None |
| Reporting & Analytics | **2** | 6 static KPI tiles |
| Integration / API | **1** | "Open Platform" is an empty anchor |
| UX / Accessibility | **4** | Visually polished Ant Design layout |
| **OVERALL** | **0.6 / 10** | Self-described "integration shim" with no integration |

---

## Top 10 Priority Fixes

1. **Acknowledge the module is missing.** Either build a real CMMS (12+ pages minimum) or remove this module from the navigation and link directly to the external platform. The current state misleads users into thinking maintenance is managed here.

2. **Build a `WorkOrderDetailPage`.** Tabs for Overview, Tasks (sub-task checklist with progress), Labor (timesheet entries), Parts (issued spare parts), Costs, Documents/Photos, Safety (LOTO, permits, JSA), Audit Log. Add WO Create, Edit, Assign, Dispatch, Start, Pause, Resume, Complete, Reject, Reopen actions with a proper state machine.

3. **Implement a Work Request intake page.** Non-tech users (NOC, customer-care, site-owners) raise requests; supervisors triage into WOs or reject with reason.

4. **PM template/job-plan authoring.** `JobPlanListPage` and `JobPlanDetailPage` with task checklist, estimated minutes per task, required tools, required spare parts (BOM), required crafts/skills, required permits, safety hazards, acceptance criteria. PM Schedule then references a Job Plan + asset + cadence rule.

5. **NMS / OSS alarm bridge.** Webhook ingestion from NMS that auto-creates emergency WOs from critical alarms (Site Down, Power Fail, Cooling Fail, RF Mute). Map alarm severity → WO priority → on-call escalation tree. This is the **highest-impact single integration** for telecom maintenance.

6. **Mobile-first technician app.** PWA with offline-first WO download, sync queue, barcode scanner, photo capture with auto-EXIF, voice-to-text notes, time-clock, parts-used scan, failure-code picker, digital signature, customer sign-off. Critical for field adoption.

7. **Safety integration.** Lockout-Tagout register, Permit-to-Work issuance and approval, Job Safety Analysis acknowledgement, crew certification tracking that blocks WO assignment when expired (e.g., expired tower-climb cert → cannot assign WO at height).

8. **Crew/Resource Management.** `CrewListPage`, crew composition (lead + members), skills matrix, certifications with expiry, availability calendar, shift roster, on-call rotation. Schedule Board with drag-drop assignment to a calendar.

9. **Cost capture & reliability KPIs.** Labor hours × craft rate + parts $ + contractor $ rolled up per WO, per asset, per site, per cost-center. Live computation of MTBF, MTTR, MTBR, PM compliance %, schedule attainment, backlog aging, first-time-fix %, PM-to-CM ratio.

10. **Real data layer.** Replace const-arrays with a `maintenance/api/` service module backed by typed API contracts. Introduce React-Query for caching, optimistic updates, and stale-while-revalidate. This is a precondition for everything else to be more than a mock.
