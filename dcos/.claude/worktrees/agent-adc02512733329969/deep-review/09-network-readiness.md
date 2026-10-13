# Network Readiness Verification (NRV) — Deep-Dive Enterprise Review

**Module path:** `src/modules/network-readiness/`
**Files audited:** 12 page files (~370 KB / ~9,800 LOC total) — all in `pages/`, with an empty `components/` directory.
**Reviewer perspective:** Network Integration Architect (Tier-1 operator, 20+ yrs CIQ/ATP/WCC/ZTP)
**Benchmarks:** Ericsson NetAct + Ericsson Network Integration, Nokia NetAct + Nokia Site Acceptance, Huawei iManager U2000 + Site Master, Amdocs NOSS Integration & Activation, Ciena Blue Planet Activation, IBM Cloud Pak for Network Automation.

---

## A. Module Purpose Validation

The "Network Readiness Verification" module sits at the **most consequential gate in a telco's deployment factory**: the decision to declare a site ready to enter integration, to be put On-Air, and to be released to the operations organisation. At Tier-1 operators this is owned by a dedicated *Integration Engineering* function (a.k.a. ATP — Acceptance Test Procedure, or WCC — Working Cell Confirmation) and governed by a Site Acceptance Document (SAD) that becomes a contractual milestone for vendor payment. The codebase recognises this importance — it has its own top-level route, its own KPI chips, its own forecasting screen, and a separate Override Approval Queue — which is right.

However the boundaries with adjacent modules are not contractually defined and several overlap zones will create reconciliation pain at scale:

1. **Readiness vs Quality Acceptance.** "Readiness" in this module is a *forward-looking* gate (am I ready to integrate? to go on-air? to exit soak?). It is **not** the same as "Quality Acceptance" which is the *vendor settlement* event (have I formally accepted the vendor's work under the contract?). The two are conflated in `ReadinessCheckExecutionPage`'s `FinaliseModal` — the "Confirm — Mark READY" action implicitly represents both gates. In Ericsson MS contracts (and most major MSAs) these are separate documents with separate signatories: the Integration Engineer signs the Working Cell Confirmation (technical readiness) and a Project/Commercial Manager signs the Site Acceptance Document (commercial acceptance). The module needs a clean separation.

2. **Readiness vs Commissioning (MW, Power, C-RAN).** `power-systems/PowerCommissioningFormPage`, `microwave-link/MWCommissioningForm` (if present in the MW module), and the C-RAN commissioning flow all produce their own commissioning state. Today there is no contract that says "Power must be `Commissioned` before NRV can advance past `pre-integration`". The check item `pw-2: Battery Backup Operational (≥ 4h autonomy)` is recorded in **two places** — here as a check status, and in the Power module's commissioning record — with no foreign key joining them. A re-check in Power will not propagate to NRV.

3. **Per-site vs per-link vs E2E readiness.** The module models readiness at the *site* level (single `siteId` in `ReadinessCheckExecutionPage`). But several readiness concerns are inherently *link-level* (microwave hop readiness, fronthaul fibre readiness) or *E2E* (RAN → backhaul → aggregation → core path). `EndToEndPathVerification.tsx` is the only place where this distinction surfaces, and it lives as a *parallel* page that does not write back to the per-site readiness scoring. A site with an unverified E2E path can still be `Ready` in `ReadinessDashboard`. This is a structural gap.

4. **ZTP as integrated workflow vs separate sub-module.** `ZTPDashboard` is a separate route from the readiness check execution. In reality, ZTP is the *automated path* of the readiness check itself — for ZTP-eligible sites, the 12-step ZTP run *is* the pre-on-air check. The page modelling forces operators to look in two places (Did the check pass? Did ZTP run? Are the results aligned?). The right model is: ZTP is the execution engine for ~80% of checklist items on supported vendors/profiles; manual checks fill in the rest.

5. **Soak monitoring vs Health Check vs Post-on-air readiness.** Three pages overlap: `SoakPeriodMonitor` (countdown timer for burn-in), `HealthCheckDashboard` ("Post-On-Air Health Checks"), and the `post-on-air` stage in `ReadinessCheckExecutionPage`. All three are observing the same temporal window (typically T+24h to T+168h after on-air). They have different data shapes, different KPIs, and different completion criteria. This is the **largest screen overlap in the module** and the most confusing for users.

**Module purpose verdict:** Correctly elevated as top-level. Six contracts must be made explicit: NRV ↔ vendor acceptance (commercial); NRV ↔ Power/MW/C-RAN commissioning gates; site ↔ link ↔ E2E readiness composition rule; ZTP integration model; soak/health-check de-duplication; OSS sync for On-Air enablement gate.

---

## B. Workflow Audit

### B1. Readiness Check Execution Lifecycle
`ReadinessCheckExecutionPage` (1,390 LOC) implements: **Site selection → Stage selection (pre-integration / pre-on-air / post-on-air) → Template selection → Item-by-item pass/fail/N/A with notes → Automated refresh from source systems → Override request on FAIL → Finalise**. This is genuinely sophisticated. Strengths:
- The **Template Registry** (13 templates: TMT-001 through TMT-060) is correctly versioned, vendor-scoped, structure-scoped (Greenfield/Rooftop/Tower/Pole), and stage-scoped. The matching logic (line 763-775) is a sensible lower-bound `siteType.includes(applicableTech)` algorithm.
- Each item carries `mandatory`, `verificationMethod`, `automated`, `sourceSystem`, `automatedStatus`, `lastRefresh`. This is the right shape for an audit trail.
- The `OverrideDrawer` correctly captures reason + flagging for supervisor approval, and `FinaliseModal` enforces "no mandatory failures" before "Mark READY".

Critical gaps:
- **No state machine for the check itself.** A check is implicitly `In Progress` while the page is open and `Finalised` after the modal confirm. There is no persistent `Draft → Submitted for Review → Reviewed → Approved → Closed` lifecycle. If the engineer closes the tab mid-execution, the in-memory `sections` state is lost — `deepClone(tmpl.sections)` is the initial seed but there is no save/resume.
- **No multi-engineer collaboration.** Real ATP requires 2-person sign-off on safety items (grounding, RF EMF, climbing) and a separate signature on documentation items. The page assumes a single engineer.
- **No template change-control after start.** "Change Template" button (line 1360) destructively resets all section state. If a wrong template was picked after 60% of checks were done, all evidence is lost.
- **Automated checks are pollable, not push-based.** `handleRefresh` (line 811) is a 1.2s `setTimeout` stub. At 100K-site scale we need an event-driven update — when Power Module re-tests battery autonomy, NRV check `pw-2` should update without manual refresh.
- **No bulk operations.** Running the same template across 50 sites in a cluster is a common operation (Project Alpha cluster activation day). The page only supports 1 site at a time.
- **No site type → template auto-selection.** Even when only 1 template matches, the user must click it. This is friction.

### B2. Multi-Check Dependency Graph
The check item model has no dependency declaration. In reality:
- `bh-2: VLAN Configuration` depends on `bh-1: Fiber Connectivity` (cannot test VLAN without physical link).
- `cn-1: AMF Connectivity` depends on `bh-3: IP Addressing` (cannot reach AMF without IP).
- `rfv-1: Drive Test` depends on `pm-3: Transmit Power Matches Design` (cannot drive-test misconfigured cells).
- `kpi-1: Accessibility KPI ≥ 99%` requires the cell to be on-air for ≥1h.

Today all items are flat with no `dependsOn` field. Users can mark a check `pass` whose prerequisites are still `pending`. This produces silently invalid readiness scores.

### B3. Override Approval Workflow
`OverrideApprovalQueue` (903 LOC viewed up to line 200) is a thoughtful page with:
- Per-override audit context (`checkId`, `templateName`, `sectionName`, `itemName`, `originalStatus`, `requestedStatus`, `reason`, attachments, `pendingSinceHrs`, `blocksPhase`, `urgency`).
- A history table of past decisions.
- A "Pending-by-tech" bar chart.

Critical gaps:
- **No SLA escalation logic.** `pendingSinceHrs` is displayed but does not trigger anything. The right behaviour: at 8h ping the approver, at 24h escalate to manager, at 48h auto-escalate to programme director.
- **No approver assignment.** Pending overrides have no owner. Which supervisor is supposed to act?
- **No segregation of duties.** Today the same person could theoretically request and approve an override if both roles are granted. The page should enforce `requestedBy ≠ approvedBy`.
- **No risk-tier-based approval thresholds.** An override on `Documentation > Installation Photo Uploaded` (low risk) should not require the same approver as `Hardware > Grounding & Lightning Protection Verified` (life-safety). Today both go to the same generic approver.
- **No bulk approve/reject.** When 30 overrides are blocking the same launch window, the supervisor has to click 30 times.

### B4. Soak Period Monitoring
`SoakPeriodMonitor` (1,066 LOC observed up to line 300) is well-conceived:
- `SOAK_DURATIONS` (line 40) correctly differentiates by tech (Macro/C-RAN = 72h, DAS/MW = 48h, Small Cell/WiFi = 24h) — these are reasonable industry defaults.
- `CircularTimer` visual is excellent — `isNearlyDone` (≤6h left) pulses red, extensions counted (up to 3).
- `healthDots` array shows periodic check verdicts within the window.

Gaps:
- **No KPI threshold breach pause.** Standard practice: if KPIs degrade mid-soak, the soak should *pause* and only resume once stability is restored. Today the timer keeps counting.
- **No automatic vs manual soak completion.** Many operators auto-pass if KPIs are green throughout, requiring manual sign-off only when degraded. The page treats every soak as requiring manual `onFinalize`.
- **No comparison to similar sites.** A 72h Macro soak should be benchmarked against the average of the last 10 Macro 5G soaks in the same cluster.
- **Extensions are a counter (max 3), no reason.** Why was the soak extended? No audit.

### B5. ZTP Success/Failure Handling
`ZTPDashboard` (573 LOC) tracks `Eligible / Not Eligible / In Progress / Completed / Failed`. The 12-step ZTP playbook (line 37-50) is well-modelled. Failure points are tagged (`failStep: 'Apply radio parameters'`).

Gaps:
- **No retry/rollback workflow on failure.** When `ZTP-0084` fails at step 6, what happens next? The page does not show retry attempts, rollback, or fallback to manual.
- **No idempotency contract.** ZTP steps must be idempotent (re-running step 4 must not double-apply the config). No indication this is modelled.
- **No software image management.** ZTP must verify the target software version, download if missing, and rollback if smoke-test fails. The 12-step list mentions "Download base config" but not software image management.
- **No certificate-based authentication step.** Modern ZTP (3GPP-compliant) uses operator-issued certificates for gNB onboarding. Not modelled.
- **No success criteria gating.** Step 12 "Mark ZTP complete" — what defines success? The page does not show pass/fail criteria per step.
- **Eligibility reasons are too coarse.** `missing_backhaul / power_unstable / bom_incomplete` is fine for a demo but in production we need *which* backhaul (primary/redundant?), *what* power instability (transients/sustained?), and *which* BOM items are missing.

### B6. End-to-End Path Verification
`EndToEndPathVerification` (1,126 LOC) is a standout piece of UX. Strengths:
- 6 topology templates (`macro-fiber / small-cell / microwave / das / c-ran / macro-rooftop`) with realistic node chains (`gNB → Fiber ODF → Pre-Agg → Aggregation → Core → AMF/UPF`).
- Per-segment latency, bandwidth, medium, status with flow-dot animation on operational segments and ⚠/✖ markers on degraded/failed.
- 8-record verification history per site.
- Re-verify action with `reverifying` state showing dashed segments + pulse animation.

Gaps:
- **No segment-level alarm subscription.** When BGP session goes down, NMS knows immediately; the page only knows when re-verified manually.
- **No latency budget allocation.** A 30ms SLA across 6 hops must be allocated (e.g., 5ms RAN + 8ms backhaul + 12ms transport + 5ms core). Today only the *end-to-end* SLA is shown.
- **No protection path verification.** The MW topology has no redundancy (`redundancy: false`); fibre paths often have 1+1 protection. The diagram should show the protect path and the protect-switching test result.
- **No QoS class verification.** Voice/IMS bearers, signalling, OAM all use different DSCP/MPLS-EXP classes. Each must be verified end-to-end.
- **No security path verification.** IPSec tunnel between RAN and SEG, MACsec on transport links — neither modelled.
- **No multi-site path comparison.** When 50 sites in a cluster share the same agg-router and core, a fault upstream should be diagnosed once not 50 times.

### B7. Failed Check Escalation
There is no explicit escalation workflow. A `fail` triggers `Request Override` (line 1226) which goes to the Override Queue. Real-world escalation should include:
- Auto-create a ticket in the Operations Ticketing System (Remedy/ServiceNow/Jira) with the right team based on failure category.
- Auto-tag the supplier/vendor when the failure is in their scope (e.g., FTTx Provider for `bh-1` failure).
- SLA timer per failure category (Power fail = 4h response, Documentation fail = 48h).
- War-room link for >5 simultaneous failures in the same cluster.

### B8. Readiness Gate Enforcement (block On-Air until Ready)
This is the single most important gate in the module — and it is **not enforced anywhere in the code**. The `FinaliseModal` writes a state but does not call any downstream system to put a hold flag on the site. In a real OSS this should:
- Block `OnAir` command in the NMS until NRV status = `Ready` and Override Queue = `0 pending blocking`.
- Block invoice approval for the vendor SAD until NRV `Ready` is signed off.
- Auto-trigger soak period start at the moment of On-Air.
- Auto-trigger handover-to-Operations workflow at successful soak exit.

None of this exists. This is the single biggest workflow gap in the module.

---

## C. Screen-by-Screen Review

### C1. `ReadinessDashboard.tsx` (735 LOC)
**KPI strip:** Total Sites (200) · Ready (142, 71.0%) · Not Ready (40, 20.0%) · Blocked (15, 7.5%) · ZTP Eligible (98).

**Layout:** 4 rows — (1) 7 tech donuts, (2) 8-week trend + blocker bars, (3) heatmap + soak periods + ZTP donut, (4) recent checks table + quick-action bar.

Strengths:
- The 7-tech donut row is dense and information-rich; the per-tech `Macro 5G / Macro 4G / Small Cell / WiFi / DAS / MW / C-RAN` ratio is the most operationally meaningful first-look summary.
- The blocker analysis horizontal bar with category counts is clean.
- ZTP donut, soak countdown chips, and the heatmap are well-balanced.

Critical issues:
- **`useEffect` 1Hz ticker (line 168-171)** runs every second to force re-render — *but the data is entirely hardcoded constants*. This is a 1Hz forced re-paint of static data. At 100K-site scale and 100+ users on the dashboard, this is a real cost (1× setState per second × N users = millions of unnecessary renders). Either subscribe to a real data source (WebSocket / EventSource) or remove the ticker.
- **All data is hardcoded** (`TECH_BREAKDOWN`, `TREND_DATA`, `BLOCKER_DATA`, `SOAK_PERIODS`, `ZTP_DATA`, `RECENT_CHECKS`). No `useEntityList('readiness')` call. This is the largest entity-binding gap in the module.
- **Heatmap is fixed at 8 sites × 7 days.** At 100K sites this needs virtualisation, aggregation (cluster/region rollup), and date-range selection.
- **No filters on the dashboard** (project / region / vendor / cluster). On a 100K-site portfolio, a single global dashboard is meaningless.

### C2. `ReadinessCheckExecutionPage.tsx` (1,390 LOC)
The most sophisticated page in the module. Reviewed in §B1 above.

Additional UI observations:
- **Sidebar `DonutChart` (line 687-729)** is well-implemented — `pass / fail / pending / na` with center % complete.
- **Mandatory progress meter** vs total progress meter is a thoughtful distinction.
- **Status button colour-coding** (`statusBtnStyle` line 839) is intuitive but `N/A` is grey-on-grey which is hard to see in active state.
- The **Notes column** is a 4-column wide single-line `Input` — too small for the rich justification real engineers write. Should be a `TextArea` with expand-on-focus.
- **Documentation section auto-passes on file upload** (line 1184) — should require category + naming convention + virus scan + content type check before marking pass.
- **`deepClone` workaround for React elements (line 512-522)** is a sign that `icon: React.ReactNode` in `CheckSection` is the wrong shape. Icons should be a string token resolved at render time, not a JSX element in serialised state.

### C3. `EndToEndPathVerification.tsx` (1,126 LOC)
Reviewed in §B6 above. Visual quality is excellent — the flow-dot animation on operational segments and the dashed re-verify state are particularly nice. Operationally needs the gaps listed in B6 (alarm subscription, latency budget, protection paths, QoS, security, multi-site rollup).

### C4. `HealthCheckDashboard.tsx` (586 LOC)
Title: "Post-On-Air Health Checks". 5 KPI chips (Active 12 / Healthy 48 / Degraded 8 / Critical 3 / Failed 2). Donut + KPI sparklines + 12 health-check cards + completed-checks table + alarm-correlation panel.

Strengths:
- The `HealthCheckCard` is genuinely useful — site + tech + on-air date + period + elapsed + KPI pills + alarms + monitoring progress + verdict + rollback action.
- KPI sparklines (CDR / HOSR / DL Thput / RSRP / SINR) with `inverted: true` flag for CDR is correct — lower is better.
- Alarm correlation panel ties alarm spikes to the active check window.

Critical issues:
- **Overlaps with `SoakPeriodMonitor` and `ReadinessCheckExecutionPage post-on-air stage`.** Three pages observe the same window. Healthcheck dashboard's data shape (`elapsed / period / kpis / alarms / verdict`) is 70% identical to SoakPeriod's `elapsed / duration / kpiStatus / alarms / healthDots`. These should be a single page with two views.
- **Hardcoded data** (no `useEntityList`).
- **Rollback action is a `message.warning` stub.** No actual rollback workflow.
- **"Recommendation" column** (Accept / Monitor / Extend / Rollback) is the right concept but how is it generated? AI? Threshold rules? Today it's seeded mock data with no logic.

### C5. `ZTPDashboard.tsx` (573 LOC)
Reviewed in §B5 above. The 12-step ZTP playbook, eligibility donut with blocking-reasons breakdown, vendor/model-aware eligibility cards, 3-column kanban (Eligible / Not Eligible / In Progress), step breadcrumb on in-progress cards, and execution history table are all good. Missing the retry/rollback/idempotency/cert-auth/image-management items from B5.

### C6. `SoakPeriodMonitor.tsx` (~1,066 LOC)
8 active soaks, 10 completed soaks, eligible-sites enrolment dropdown, `CircularTimer` countdown, `HealthDotsRow`, extension counter, finalise/extend actions.

Strengths:
- `SOAK_DURATIONS` per-tech is right.
- `kpiStatus: 'normal' | 'warning' | 'critical'` per soak.
- Tech-coloured left border + nearly-done amber pulse.

Critical issues:
- Overlap with `HealthCheckDashboard` (see C4).
- Extensions counter (`max 3`) but no business rule on *who* can authorise extension #3 (should require manager).
- Hardcoded data.
- "Eligible sites" list is just a `Select` of 7 fake sites — should be a filtered live query.

### C7. `ReadinessForecast.tsx` (~564 LOC)
"Predictive readiness timeline" — 15 not-ready sites with `readyDate`, `confidence` (High/Medium/Low), `currentScore`, `criticalPath`, `blockers`. Stacked bar chart bucketed into 4 upcoming weeks by confidence.

Strengths:
- The forecast bar chart is the right summary visual.
- `Critical Path Item` column gives operational meaning to the forecast.
- CSV export action is functional.

Critical issues:
- **Confidence is hardcoded mock data with no model behind it.** A real forecast must derive confidence from: blocker SLAs, vendor track record per category, weather forecasts (for outdoor work), permit status, supply chain ETA. Today it's a string label seeded in the mock.
- **No comparison to historical readiness slope.** "Sites becoming ready per week" should overlay last 8 weeks' actual.
- **No what-if simulation.** "If I clear all Backhaul blockers, how many more sites are ready in 7 days?"
- Only 15 sites in the data set; at 100K-site scale this list needs filtering, sorting, search, virtualisation.

### C8. `ReadinessReport.tsx` (~700+ LOC, observed up to 200)
Report with tech breakdown table, donut chart, blockers bar chart, not-ready-sites table with project/cluster filters.

Strengths:
- 7-tech breakdown with `ready / notReady / notChecked / readyPct / avgScore`.
- Project + cluster filter selectors are functional.

Critical issues:
- **No export to executive formats** (PDF report with cover sheet, charts, sign-off lines).
- **No scheduled distribution** (weekly to programme directors, monthly to C-suite).
- **No comparison to plan.** A readiness report without "vs target" is half a report.
- **No drill-through from cell to detail page.**

### C9. `OverrideApprovalQueue.tsx` (~903 LOC, observed up to 200)
Reviewed in §B3 above. Strong structure for an override workflow, missing SLA escalation, approver assignment, segregation of duties, risk-tier thresholds, and bulk operations.

### C10. `ReadinessListPage.tsx` (~600 LOC, observed)
Card grid + table view of 50 readiness records with score gauge, status tag, checklist progress, blockers count, validUntil expiry. Tech and status filters.

Issues:
- 50 records is fine for a demo but no virtualisation for 100K+.
- "Expired" status (>validUntil) is computed in-card — should be derived in entity layer with a single canonical truth.

### C11. `ReadinessDetailPage.tsx` (~700 LOC, observed)
Per-readiness detail with checklist, blockers, ZTP status, signoff timeline, documents tab.

- `generateZTPStatus()` with prerequisites is good shape.
- 4-stage signoff timeline (Pre-Integration → Blocker Resolution → Re-Check → Final Sign-off) is reasonable but should be data-driven from the stage definition, not hard-coded.
- Document upload + view + download all wired to mock blobs — needs real storage.

---

## D. Telecom Domain Validation (CRITICAL)

### D1. Pre-Integration Readiness — coverage assessment
Comparing the `MACRO_PRE_INTEG_SECTIONS` (lines 59-143) against industry standard ATP checklists:

| Discipline | Present | Coverage | Comments |
|---|---|---|---|
| Physical (BBU/RRU mount, antenna alignment) | `hw-1, hw-2, hw-3` | Good | Missing: tower verticality test, RET (Remote Electrical Tilt) command verification, optical loss test on RRU jumpers |
| Power | `pw-1, pw-2, pw-3, pw-4, pw-5` | Adequate | Missing: ATS transfer test (live transfer + back), inrush current measurement, ground impedance test < 5Ω |
| Transmission | `bh-1, bh-2, bh-3, bh-4, bh-5` | Adequate | Missing: BER test, jumbo frame support, MTU verification, frame loss < 10⁻⁶ |
| Core/Backhaul | `cn-1, cn-2, cn-3, cn-4` | Adequate | Missing: NSA/SA dual-mode test for 5G, X2/Xn link to neighbours, S1-MME redundancy |
| RF Parameters | `pm-1, pm-2, pm-3, pm-4, pm-5, pm-6` | Good | Missing: SSB/PBCH power, PRACH config index, RACH attempts test, SIB scheduling |
| Alarm | `al-1, al-2, al-3` | OK | Missing: NMS heartbeat, PM data flow validation, fault-management test (raise + clear) |
| Documentation | `doc-1..4` | Light | Missing: O&M handover, escalation matrix, contact list, RAN warranty start letter |
| **Site Access (missing entirely)** | — | None | Should include: access permit valid, climbing certificate, work-at-height insurance, RF EMF compliance card |
| **Civil/Tower (missing entirely)** | — | None | Should include: foundation cure cert, tower load calculation, lightning down-conductor test |
| **Safety (missing from pre-integration; present in pre-on-air only)** | partial | Light | Aviation lighting, RF EMF zoning, signage, lock-out/tag-out, MEWP (mobile elevating work platform) certification |
| **Cybersecurity** | none | None | Default password change, SSH key rotation, firmware checksum, vendor-default account disable, SBOM (Software Bill of Materials) |
| **Compliance** | partial | Light | Spectrum licence (in pre-on-air only), EMC test, type approval, regulator registration |

**Verdict:** Pre-integration coverage is roughly **65% of a real Tier-1 ATP checklist**. Major gaps in civil/site-access, cybersecurity, and detailed RF test items (PRACH, SSB).

### D2. CIQ (Configuration Item Quality)
CIQ is the cell-and-site-specific parameter sheet that drives configuration generation. The codebase has *check items that reference parameters* (`pm-1: Cell IDs / PCI Configured`, `pm-2: EARFCN`, `pm-6: TA/TAC`) but **no CIQ artefact, no CIQ validation, no CIQ generator**. In Ericsson NetAct this is a discrete deliverable (an Excel sheet exported from the planning tool, signed by the planning manager). Today the readiness check just asks "is the parameter configured?" without comparing against a *signed CIQ*. This is a structural gap.

Missing fields per cell (from a real CIQ): cell name, PLMN, MNC, MCC, eNB/gNB ID, sector ID, PCI, EARFCN/NR-ARFCN, bandwidth, duplexing, frame structure, TAC, neighbours intra/inter freq/inter RAT, max TxPower, mobility band, ICIC config, MIMO mode, PRACH config index, SSB beam pattern, NR-PCI plan version, X2/Xn neighbour list, S1 endpoints, SCTP ports.

Missing fields per site (from a real CIQ): site name, NeID, OAM IP plan, S1-U/S1-MME/N2/N3 IP plan, VLAN map, OAM gateway, NTP servers, syslog server, SNMP community, OOB management IP, certificate distinguished name, software baseline + patch level, license keys.

### D3. ZTP (Zero Touch Provisioning)
Reviewed in §B5. The 12-step playbook is plausible, but real ZTP requires:
- **DHCP+Option 43/125** for vendor-specific OAM controller discovery — not mentioned.
- **TFTP/SFTP server** for initial config — not mentioned.
- **Auto-discovery via LLDP** for backhaul topology — not mentioned.
- **Cert-based auth** (operator CA → gNB cert → mutual TLS to OAM) — not mentioned.
- **Image management** (download → verify checksum → flash → reboot → smoke test → rollback if failed) — not mentioned.
- **Multi-vendor ZTP profiles** (Ericsson AAS, Nokia NetAct, Samsung CMS, Huawei iManager) with vendor-specific NETCONF/NBI integration — mentioned only via vendor tags in the eligibility card.

### D4. Integration Testing
Pre-on-air section (`MACRO_PRE_ONAIR_SECTIONS`) has 4 sub-sections (RF Validation / KPI Baseline / Safety / Documentation). Coverage:
- L1 tests: partially covered (`rfv-5: Interference Scan`) but missing PRACH test, SS-RSRP/RSRQ measurement at known reference points.
- L2/L3 tests: missing entirely (Ethernet OAM, LACP, BGP, OSPF tests).
- Cell sync: covered (`cn-4: PTP/SyncE Locked`).
- Neighbour relations: covered (`pm-4`, `rfv-3`).
- Handover tests: partial (`rfv-3: Inter-cell Handover Tested`) — but inter-frequency, inter-RAT (LTE↔5G NSA, 5G↔Wi-Fi) not split.
- KPI thresholds: covered (`kpi-1..4`) — but only 4 KPIs; real WCC needs 12-15 KPIs.
- IPSec tunnel: present in Small Cell only (`bh-2`); missing for Macro.
- Drive test: covered (`rfv-1, rfv-2`) — but no link to drive-test tooling (TEMS, Nemo).

### D5. Soak Period
`SOAK_DURATIONS` (24/48/72h) is correct industry default. Missing:
- **Stability criteria not codified.** Standard practice: zero critical alarms for the full window, zero MTBF events, KPIs within ±10% of design.
- **Per-KPI thresholds per tech.** A Macro should soak with CDR <0.5%, HOSR >98%; a Small Cell may have looser thresholds.
- **Pause-on-degrade not implemented.**
- **Auto-extend on KPI dip not implemented.** Real soak should auto-extend the window by 24h if KPIs degrade in the final 12h.
- **Burn-in for hardware (not just RF):** 168h continuous-on test for new power plants, fan-stress test for BBU, thermal cycle for outdoor RRU. None modelled.

### D6. End-to-End Path Verification
Covered in B6 / C3. The path templates correctly map RAN→backhaul→aggregation→transport→core→AMF/UPF. Missing:
- **No internet/peering verification** (the "and Internet" leg). For data services on 5G SA, the UPF→PDN→Internet path must be verified.
- **IP path tracing** uses static topology only — should support traceroute, TWAMP, Y.1731 OAM, and BFD session status.
- **Latency budget decomposition** absent.
- **SLA per medium** not modelled (fibre vs MW vs satellite have very different latency/availability profiles).

---

## E. Data Review

| Visual | Density / Quality | Concerns |
|---|---|---|
| 7-tech donut row | Excellent — 7 KPIs in one glance | Order is hardcoded; should be sortable by % ready, or absolute backlog |
| 8-week trend (3-line area) | Good — `ready / notReady / blocked` | 8 weeks is short; for trend should be 26 weeks. No "vs target" line. |
| Blocker categories bar | Clean horizontal bars | Only 6 categories, all hardcoded. Should be live aggregation across all open blockers. |
| Health-check heatmap (8 × 7 = 56 cells) | Compact and readable | Hardcoded 8 sites; at 100K sites needs hierarchy (region → cluster → site) |
| ZTP donut (5 segments) | Good | "Eligible" center number is misleading — should be "Total" |
| Soak countdown chips | Excellent — urgency colouring works | Only 5 chips visible; need scroll/pagination for 100+ active soaks |
| Recent checks table | Density-aware columns (`useDensityColumns`) | 10 rows hardcoded; no pagination model shown for scale |
| KPI sparklines (HealthCheck) | Excellent — 5 KPIs with trend + current + unit | No threshold lines on sparkline; should show pass/fail bands |
| Override pending bar (by tech) | Clean | Only one breakdown axis (tech); also need by urgency, by pending-since |
| Forecast stacked bar (4 weeks × 3 confidence) | Good | Only 4 weeks ahead; should support 90-day horizon |

**Data sourcing verdict:** Every chart in the module uses hardcoded mock data. Zero use of `useEntityList('readiness')` outside the `ReadinessCheckExecutionPage` (which only uses it for the site selector). For a 12-page module this is the single largest integration gap.

---

## F. Scalability Review

### F1. `ReadinessDashboard` at 100K sites
- 7 tech donuts: aggregate query, O(1) per donut — fine.
- 8-week trend: 24 data points — fine.
- Blocker categories: depends on aggregation strategy — fine if pre-aggregated.
- Heatmap: **broken at 100K × 30 = 3M cells.** Must move to region/cluster rollup, with drill-through.
- Soak chips: needs virtualisation if >50 active soaks.
- Recent checks: needs server-side pagination.
- **1Hz ticker (line 168)** is the most concerning — at 100 concurrent users × 1 re-render/sec = 6,000 re-renders/minute purely for stale data. Replace with WebSocket subscription.

### F2. `EndToEndPathVerification` with 1,000+ paths
- Topology generation is per-site (`generateTopology(siteId)`) — fine since user picks one site at a time.
- History generator (8 records) is per-site — fine.
- **No bulk-path verification screen exists.** When 1,000 paths need to be re-verified after a core upgrade, there is no batch UI. This is a critical gap.

### F3. ZTP at 1,000 sites/week deployment rate
- Eligibility, In-Progress, History panels: all fixed-list rendering — needs pagination + filtering + search.
- Step-by-step progress card: 1 per in-progress site — at 50 in-flight ZTPs the kanban becomes unusable.
- **No throttling / parallelism limits.** Real ZTP must throttle to avoid overwhelming the OAM controller (typical 20-50 parallel ZTPs).

### F4. Health-check heatmap at 100K × 30 days
- Reviewed in F1.
- Heatmap should aggregate to region/cluster with drill-down. Per-site heatmap is only useful for ≤50 sites.

### F5. `setInterval(1s)` performance concern
- The `ReadinessDashboard.tsx:168` ticker triggers a `setState` per second even with no upstream data change. React will reconcile, Antd will re-style, SVG paths will recompute. Even with memoisation this is wasteful. Either:
  - Remove the ticker and use TanStack Query's `refetchInterval` on the underlying entity hooks.
  - Or restrict the ticker to the *timestamp display only* (a single component, not the whole dashboard).

---

## G. AI Opportunities

1. **AI readiness forecast.** Today the `confidence` column in `ReadinessForecast` is a static label. A model trained on historical blocker-clear times per category, vendor, region, season, and weather can produce calibrated probabilistic ready dates (P50/P90). This replaces the toy bar chart with a real decision-grade forecast.

2. **Auto-RCA on failed checks.** When `bh-1: Fiber / FTTx Connectivity Confirmed` fails, an LLM with access to alarm history, FTTx ticket database, weather feed, and contractor schedule can produce a 3-line root cause and probable fix ETA. Today engineers do this by hand.

3. **Predictive ZTP failure detection.** Train a classifier on historical ZTP runs (vendor × model × site type × time-of-day × concurrent-load) to predict failure at step N before it happens, allowing pre-emptive remediation. The 12-step playbook is perfectly shaped for this.

4. **Anomaly detection on soak KPIs.** Per-site KPIs during soak can be benchmarked against a reference distribution (same tech, same region, recent on-airs). Outliers flag for human review without waiting for a hard threshold breach.

5. **LLM-generated readiness reports.** The `ReadinessReport` page is structured data + charts; an LLM can produce an executive narrative (3 paragraphs: status, key risks, recommended actions) signed off by a human.

6. **AI-driven retry recommendations.** When ZTP fails at step 6 (Apply radio parameters), an LLM can read the error log, the CIQ, and similar past failures to recommend: "Adjust PRACH config index to 7; retry step 4-12" with explanation.

7. **Check template auto-evolution.** Mine completed checks for items that always pass (auto-promote to auto-skip) and items that frequently fail with auto-override (auto-flag for template revision). The TMT versioning (v1.0, v2.0, v2.1) gives a hook for this.

8. **Override approval risk scoring.** Train a classifier on historical overrides: was this override later associated with a post-on-air incident? Use score to gate auto-approval vs supervisor review vs senior review.

9. **E2E path AI: anomaly detection on latency / packet loss.** Multi-site shared transport faults can be auto-correlated.

10. **Conversational readiness query.** "Show me all DAS sites in Cluster North not ready, with primary blocker = Backhaul, with predicted ready in next 7 days" — natural-language interface over the readiness entity.

---

## H. UX & Visualization Improvements

1. **Site readiness scoreboard (per-domain progress).** A single-page scoreboard showing one site's readiness as a radial chart broken into 7 domains (Hardware / Power / Transmission / Core / RF / Alarm / Docs) with traffic-light status per domain. This is the operator's primary "is this site ready?" view and it does not exist.

2. **Mobile field engineer view.** Field engineers do checks on a tablet/phone, not a desktop. A mobile-optimised version of `ReadinessCheckExecutionPage` with photo capture, barcode scan (for BOM verification), GPS-stamped check entries, offline-first sync. Today the page is desktop-only.

3. **War-room readiness command center.** A single large-screen view designed for the NOC big-screen during launch days: 4-quadrant layout with global map heat, top 10 blocked sites, in-progress ZTPs, soak countdowns, override queue depth. Auto-refresh, no clicks.

4. **Geographic readiness heatmap.** A map view (Mapbox/Leaflet) coloured by readiness % per cluster. Today readiness is a tabular world; geography matters in deployments and there is no map.

5. **E2E path animated trace.** The flow-dot animation in `EndToEndPathVerification` is good. Extend it: when the user clicks "Trace", animate a single packet from gNB to AMF showing per-segment latency accumulation. This is genuinely useful for explaining latency budgets to non-network audiences.

6. **Stage-progress timeline per site.** A horizontal Gantt-like view for one site showing: Site Build → Pre-Integration → Pre-On-Air → On-Air → Soak → Operational. Click each stage to see the checklist state. Today this exists as a 4-step Antd `Steps` in `ReadinessDetailPage` but is non-interactive.

7. **Bulk-action toolbar in `ReadinessListPage`.** Multi-select + "Run health check on selected", "Re-verify E2E paths for selected", "Generate compliance report for selected". Single-record actions don't scale.

8. **Override Approval Queue: kanban view.** Three columns (Critical / High / Normal) with cards draggable to Approved / Rejected. Today it's a flat list — the urgency hierarchy is buried.

9. **Sortable & re-orderable tech donut row.** Let the operator pin Macro 5G / DAS / MW first based on their current programme.

10. **Search box + saved filters in dashboard.** "Show me everything for Project Alpha + Cluster North" should be saveable as a named view.

---

## I. Technical Architecture

### I1. Real-time check execution
Today `handleRefresh` is a 1.2s `setTimeout` per item (line 813). For real-time:
- Use SSE (Server-Sent Events) or WebSocket from the OSS/NMS aggregator. Each check item subscribes to events for its `sourceSystem` field. When the source updates, push to the client.
- Fall back to polling only for non-subscribable items.

### I2. ZTP server integration
The current ZTP playbook is illustrative only. Production integration needs:
- NETCONF/YANG client per vendor (Ericsson AAS, Nokia NetAct).
- DHCP server hooks (writing Option 43/125 records).
- TFTP/SFTP server for image+config staging.
- Certificate authority integration for gNB cert issuance.
- A `ZTPRun` entity with `siteId`, `profileId`, `currentStep`, `stepHistory[]`, `success`, `failStep`, `rollbackPerformed`.

### I3. OSS sync for readiness gates
Today the `Mark READY` action just calls `message.success` (line 622). It must:
- Write to a `SiteReadiness` entity that NMS subscribes to.
- Block NMS On-Air commands until the entity reads `Ready`.
- Block vendor SAD invoice approval (commercial integration).
- Trigger soak-period auto-start.

### I4. Distributed check execution
For 100K+ site portfolios, check execution should be horizontally scaled:
- Workers per region/cluster pulling from a check queue.
- Idempotent check execution (re-running a check should be safe).
- Retry policy per check category.
- Result aggregation pipeline writing to entity store.

### I5. Persistence of check evidence
Each check generates evidence: API responses, photos, document uploads, sweep reports, drive-test logs. Today they are stub uploads with no storage backend. For real:
- Object storage (S3/Azure Blob) with immutability for audit (7-year retention common in telco regulatory regimes).
- Content-addressable storage (SHA-256) to deduplicate (the same RF sweep report often uploaded per check phase).
- Virus scanning hook before storage.
- Search index over OCR'd text in uploaded PDFs.

### I6. Entity binding gap
Every dashboard page except `ReadinessCheckExecutionPage` and `EndToEndPathVerification` is hardcoded. The module needs a `readinessChecks` entity, a `soakPeriods` entity, a `ztpRuns` entity, an `overrides` entity, an `e2ePaths` entity, all wired through the existing `useEntityList` / `useEntityDetail` hooks. This is the single largest engineering item.

---

## SCORING

| Dimension | Score | Notes |
|---|---|---|
| Workflow Completeness | 6/10 | Strong on check execution & overrides; weak on enforcement gate, retry/rollback, dependency graphs, multi-engineer sign-off, soak pause-on-degrade |
| UX Sophistication | 8/10 | Visual quality is consistently high; the path-trace animation, soak countdown, and per-tech donut row are best-in-class; missing mobile, war-room, and geographic views |
| Telecom Domain Accuracy | 6/10 | Stage model (pre-integration/pre-on-air/post-on-air) is correct; CIQ artefact missing; ZTP playbook missing cert-auth and image management; ~65% coverage of a real ATP |
| Data Intelligence | 5/10 | Charts well-designed but all data hardcoded; no live aggregation; no AI/ML model behind confidence/forecast/recommendation |
| Scalability Readiness | 4/10 | 1Hz ticker on stale data, heatmap fixed at 8×7, no virtualisation, no batch operations, no pagination plumbing for charts |
| AI Readiness | 4/10 | Plenty of opportunity surface (forecast/RCA/anomaly/auto-RCA) but zero ML model integration today |
| **Overall** | **5.5/10** | A strong UX prototype with sound information architecture; needs deep entity binding, real workflow enforcement, and ML before production-grade |

---

## TOP 10 PRIORITY FIXES

1. **Enforce the On-Air gate.** Wire `FinaliseModal.handleConfirm` (line 619 of `ReadinessCheckExecutionPage`) to a backend service that writes a `SiteReadiness.status='Ready'` entity, and ensure NMS On-Air commands check this entity. Today the most consequential business gate in the module is a `message.success` toast.

2. **Bind the dashboards to real entities.** `ReadinessDashboard`, `HealthCheckDashboard`, `ZTPDashboard`, `SoakPeriodMonitor`, `ReadinessForecast`, `ReadinessReport`, `OverrideApprovalQueue` are 100% hardcoded. Create `readinessChecks`, `soakPeriods`, `ztpRuns`, `overrides`, `e2ePaths` entities and wire via `useEntityList`. Remove the 1Hz ticker in `ReadinessDashboard.tsx:168`.

3. **De-duplicate soak / health-check / post-on-air.** Three pages overlap. Merge `SoakPeriodMonitor` + `HealthCheckDashboard` into a single "Post-On-Air Monitoring" page with two views (soak countdown view vs detailed health view) and a single underlying entity.

4. **Add check-item dependency graph.** Extend `CheckItem` with `dependsOn: string[]`. Disable a check until its prerequisites are `pass`. Show the dependency in the UI as a small chevron icon.

5. **Build the CIQ artefact.** Add a per-site `CIQ` entity (parameters + IP plan + license plan + neighbour plan), generated by RF Design + Transmission Design + Core Planning, signed by the planning manager. NRV check items reference `CIQ.signedVersion` and must match.

6. **ZTP: add retry/rollback/image-management/cert-auth.** Extend the 12-step playbook into a state machine with per-step retry policy, idempotent semantics, and rollback on smoke-test failure. Add software image management (download/verify/flash/rollback) as steps 0a-0c. Add cert-auth as step 1a.

7. **Override Queue: SLA escalation, approver assignment, segregation of duties, bulk operations.** Currently `pendingSinceHrs` is decorative. Wire to an escalation policy (8h ping, 24h escalate, 48h auto-escalate). Force `requestedBy ≠ approvedBy`. Add multi-select + bulk approve/reject. Add risk-tier-based routing.

8. **E2E path verification: live alarm subscription + protection path + latency budget allocation.** Today the topology view is a snapshot, regenerated on demand. Subscribe to OSS alarms per segment so the diagram reflects current state. Show protection paths (1+1, 1+R) for fibre. Decompose the SLA latency budget per segment.

9. **Mobile field engineer view.** Build a mobile-optimised version of `ReadinessCheckExecutionPage` with photo capture, barcode scan, GPS-stamped entries, and offline-first sync. Field engineers don't use desktops at the cell site.

10. **AI confidence + forecast.** Replace the static `confidence` label in `ReadinessForecast` with a calibrated model trained on historical blocker-clear times. Add a P50/P90 ready-date instead of a single point estimate. Add "what-if" simulation ("clear all Backhaul blockers — how many more sites ready in 7 days?").

---

## Benchmark Comparison

| Capability | This Module | Ericsson NetAct + NI | Nokia NetAct + SA | Huawei iManager + Site Master | Amdocs NOSS |
|---|---|---|---|---|---|
| Multi-stage readiness (pre-integ / pre-on-air / post-on-air) | Yes (3 stages) | Yes (5+ stages) | Yes (4 stages) | Yes | Yes |
| Vendor/structure-scoped templates | Yes (13 templates) | Yes (vendor-native) | Yes (vendor-native) | Yes (vendor-native) | Multi-vendor |
| CIQ artefact + validation | Missing | Yes | Yes | Yes | Yes |
| ZTP with cert-auth + image mgmt | Stub | Yes | Yes | Yes | Yes (multi-vendor) |
| E2E path with alarm correlation | Snapshot only | Yes | Yes | Yes | Yes |
| Override approval with SLA escalation | Manual queue only | Yes (workflow engine) | Yes | Yes | Yes (BPMN) |
| Soak period with pause-on-degrade | No | Yes | Yes | Yes | Configurable |
| Predictive readiness | Mock data | Some (NetAct Analytics) | Some | Some (iSOC) | Yes (AI-Ops) |
| Mobile field execution | No | Yes (NetAct Mobile) | Yes | Yes | Yes |
| Real-time evidence storage | Stub | Yes | Yes | Yes | Yes |
| Bulk operations | No | Yes | Yes | Yes | Yes |
| OSS gate enforcement | No | Yes | Yes | Yes | Yes |

The module's **UX is competitive** with vendor offerings (in some cases — soak countdown, path diagram, override queue — visually superior). Its **workflow depth and integration backbone are 30-40% of a Tier-1-ready product**.

---

## Closing Note

This is one of the more ambitious modules in the repo: it correctly identifies the right discrete workflows (readiness execution, soak, ZTP, override, forecast, report, E2E verification, health check), invests in genuinely useful visualisations, and sets up the right per-tech/per-vendor/per-stage information architecture. The visible UX would impress in an operator demo. What it lacks is the *enforcement spine* — entity persistence, gate enforcement to the NMS, real CIQ artefact, AI-backed forecasts, mobile execution, OSS event subscription — that turns a beautiful dashboard into the contractually-binding ATP system a Tier-1 operator needs.
