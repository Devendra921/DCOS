# Deep Review — Health & Safety Compliance (HSC) Module

**Reviewer perspective:** Tier-1 telecom EHS architect, 20+ yrs OSHA / ANSI / FCC / ICNIRP / TIA enforcement, tower-climber fatality investigations, and EHS platform deployments at Crown Castle, American Tower, Vodafone, and DT.
**Benchmarks:** Intelex, Cority, EHS Insight, VelocityEHS, Enablon, ProcessMAP, Origami Risk.
**Scope reviewed:** 33 page-level components under `src/modules/health-safety/pages/`, including the recently-rebuilt Audit Execution / Detail pair.

---

## A. Information Architecture & Module Topology

The HSC module surfaces 33 page components organised into 11 functional clusters:

1. **Dashboards** — `HSCDashboard` (Safety Command Center), `HSCPermitDashboard`, `HSCSiteComplianceDashboard`, `SafetyDashboard`, and the merged `HSCDashboardHub` (4-tab shell).
2. **Audits** — `HSCSafetyAuditList`, `HSCSafetyAuditExecution`, `HSCSafetyAuditDetail`.
3. **EMF / RF** — `HSCEMFRegister`, `HSCEMFAssessment`.
4. **Incidents** — `HSCIncidentList`, `HSCIncidentReport`, `HSCIncidentInvestigation`.
5. **Permits** — `HSCPermitDashboard`, `HSCPermitRequestForm`, `HSCPermitApproval`, `HSCPreWorkChecklist`.
6. **Regulatory** — `HSCRegulatoryDatabase` (shim), `HSCRegulatoryComplianceRegister` (2-tab combined view).
7. **Certifications** — `HSCCertificationManagement`, `HSCWorkerCertificationCard`.
8. **Site compliance & plan** — `HSCSiteComplianceDashboard`, `HSCSiteSafetyPlan`.
9. **Documents** — `HSCSafetyDocumentManager`.
10. **Stand-down / Toolbox** — `HSCSafetyStandDown`, `HSCToolboxTalkHistory`, `HSCToolboxTalkRecord`.
11. **Equipment & vendors & templates** — `HSCEquipmentInventory`, `HSCEquipmentDetail`, `HSCVendorSafetyPerformance`, `HSCChecklistTemplates`, `HSCChecklistTemplateBuilder`, `EmergencyProceduresPage`, `SafetyDetailPage`, `SafetyListPage`.

**Critical IA problems:**

- **Three parallel dashboards** for the same module (HSCDashboard, SafetyDashboard, HSCDashboardHub) — HSCDashboardHub is the "official" 4-tab shell, but the legacy `SafetyDashboard` (with its own KPI cards, `MOCK_DATA`, `vendorSafetyScores`) still lives at `/safety` with a completely different design language (`KPICard`, `StatusTag`, Ant Design Cards). `SafetyListPage` + `SafetyDetailPage` use a totally separate data model (`HSC-XXXX` IDs, generic "Work Permit / Incident / Inspection" triage) that does not reconcile with any of the granular HSCIncidentList / HSCPermitDashboard data. **This is a hard fragmentation.** Two competing schemas, two competing visual languages, two competing terminologies inside a single safety module is a compliance auditor's nightmare.
- **`HSCRegulatoryDatabase` is a 15-line shim** that just renders `HSCRegulatoryComplianceRegister` on the "database" tab. Fine architecturally, but the underlying combined view conflates two genuinely different concepts (operational compliance register vs. admin-managed reference catalogue) — Intelex and Cority both keep these strictly separate.
- **`HSCDashboardHub` is a 46-line shell** that just renders the four dashboard bodies side-by-side as tabs. No cross-cutting hero KPI strip (TRIR, DART, fatalities, near-miss ratio), no incident pyramid, no compliance heatmap, no leading-indicators panel. The hub feels like an aggregator wrapper, not an operational dashboard.
- **No Risk Assessment / JSA module** as a first-class entity — it appears as a column inside SafetyDetailPage and a single hazard table inside HSCSiteSafetyPlan. There is no dedicated JSA workflow (task → hazard → likelihood × consequence matrix → control hierarchy → residual risk → sign-off chain). This is table-stakes in Cority, Intelex, Enablon.
- **No Behaviour-Based Safety (BBS) / Safety Observations** module. Industry leaders all have these.
- **No Job Safety Analysis (JSA) Library / hazard taxonomy database** — every form free-types hazards.
- **No CAPA register** as a first-class entity. Corrective Actions are scattered inside incident investigation and audit detail; there is no unified CAPA backlog with overdue aging.

---

## B. Regulatory & Standards Coverage Audit

I scored coverage of the canonical telecom EHS regulatory matrix:

| Standard / Regulation | Coverage Grade | Notes |
|---|---|---|
| **OSHA 29 CFR 1926** (Construction) | **A−** | Excellent inline citation in `HSCSafetyAuditExecution` templates (1926.502 fall protection, 1926.405 GFCI, 1926.25 housekeeping, 1926.50(c)(d) first aid). |
| **OSHA 29 CFR 1910** (General Industry) | **B** | 1910.147 LOTO and 1910.97 RF cited, but 1910.146 Confined Space (atmospheric testing requirements), 1910.269 (electric power gen/transmission), 1910.27 (rope descent), 1910.140 (PFAS) are entirely absent. |
| **OSHA 1926 Subpart M** (Fall protection) | **A** | Explicit 1926.502(d), (b), (c), (i), (k) coverage including 5,000-lb anchor requirement, hole cover load-rating, and rescue plan ref 1926.502(d)(20). |
| **OSHA 1904** (Recordkeeping) | **C+** | 1904.5, 1904.32, 1904.7, 1904.33 cited in OSHA audit template — but **no OSHA 300 Log, 300A, 301 forms exist in the app**. There is no severe-incident OSHA reporting workflow (8-hr fatality / 24-hr amputation/hospitalization) despite the comment in `HSCIncidentReport` saying "OSHA must be notified within 8 hours" — there is no notification button, no certified electronic report draft, no event upload to ITA. |
| **ANSI Z359** (Fall protection equipment) | **A** | Z359.2 (managed FP program), Z359.3 (positioning), Z359.4 (rescue), Z359.11 (harness), Z359.12 (connectors), Z359.13 (lanyards), Z359.16 (climbing) all referenced. |
| **ANSI/ASSE A10.48** (Telecom Tower) | **F** | **Not referenced anywhere.** This is the single most important construction-safety standard for tower work — supersedes general fall protection for tower erection/maintenance. A serious gap. |
| **ANSI/TIA-1019** (Tower Climber Certification) | **B** | Cited in tower-climb audit + vendor audit templates. But no integration with NWSA / ComTrain / Telco-Cert databases. |
| **ANSI/TIA-222-H/I** (Structural) | **B−** | Referenced in regulatory register, not in audit templates. TIA-322 is cited in tower-climb template but `HSCSafetyAuditExecution` invokes section numbers (`TIA-322 §4.3`, `§5.2`, `§6.1`) that I cannot validate — TIA-322 covers loading/strength/serviceability for steel antenna structures, not the climbing-safety items it is being cited against here. **This is technically wrong citation.** A real auditor would reject the references. |
| **FCC OET-65 / 47 CFR §1.1307, §1.1310** | **B+** | Excellent inline citation in EMF/RF audit templates (§3.3, §3.4, §4, §4.2, §2.1, §2.2, §1.1310 Table 1). The Categorical Exclusion analysis is cited (§1.1307(b)). |
| **ICNIRP 2020 Guidelines** | **B** | Cited (Table 5, §5.2 6-min averaging) but **no actual MPE calculator** — the EMF assessment page has a placeholder `Math.sqrt(power*0.8)` exclusion-zone formula that is **physically meaningless** for a 5G / LTE / MW Backhaul site. There is no aperture-gain, antenna-pattern, or near-field/far-field treatment. |
| **IEEE C95.1 / C95.3** | **B−** | C95.3 (calibration) cited in EMF template. C95.1 (exposure limits) and C95.2 (sign colours) referenced as text but no integration with the EMF computation flow. |
| **IEC 62209** (SAR / human exposure) | **F** | Not referenced. Required for handset/in-building radiator compliance. |
| **NFPA 70E** (Arc flash / electrical safety) | **C+** | Cited (§110.26, §130.5) but no Incident Energy calculation, no PPE-category recommender, no arc-flash boundary calc. |
| **ISO 45001** (OH&S management) | **A** | Heavily cited (§5.2, §4.3, §6.1, §7.2, §8.1, §9.3, §10.2). Audit template is genuinely competent ISO 45001 internal audit content. |
| **NWSA / ComTrain certification** | **C** | Referenced in vendor audit, but no integration with NWSA registry API. Worker certs are typed as free strings. |
| **OSHA 10/30** | **C** | Not modelled as a discrete cert type. |
| **CPR / First Aid (Red Cross, AHA)** | **B** | Modelled as a cert type. |

**Overall regulatory grade: B−.** Strong on US-OSHA construction + ISO 45001 + FCC OET-65. Weak on A10.48 (the actual telecom-tower standard), confined space (1910.146), 1910.269, OSHA recordkeeping forms, MPE math, IEEE C95.1 implementation, and IEC 62209.

---

## C. Workflow & Operational Realism

### C1. Audit lifecycle (`HSCSafetyAuditList` → `Execution` → `Detail`)

This trio is the **best-built part of the module**. The Execution page (679 lines) implements a real template engine with five audit types (site, tower, vendor, compliance_emf, compliance_rf, compliance_osha), each with sections, weighted items (1/2/3 critical-path), regulatory refs, and required evidence types (photo / document / measurement / signature). Auto-rating based on weighted score (≥95 compliant, ≥80 minor, ≥60 major, <60 critical) is sensible. Critical-path failure escalation is well-modelled.

Gaps:
- **No corrective-action assignment from a fail item.** A fail captures severity + free-text note, but does not generate a CAPA with owner + due date + verification evidence loop. The detail view (`HSCSafetyAuditDetail`) shows beautifully-modelled CAPAs in mock data (`F-039-01` … `F-039-07` with status, due dates, evidence), but the **execution page never writes any of this back** — the submit handler is a single `message.success`. So in production this would have a broken handoff: the auditor would close out, and no CAPA exists in the register.
- **No multi-day audit support.** A real Vendor Safety Audit takes 2–5 days with multiple auditors. Single-session model only.
- **No sampling methodology.** A real safety audit samples N of M sites / harnesses / records — there's no support for "sampled 5 of 200 harnesses" or stratified sampling.
- **No mobile-offline mode.** Audits happen at remote tower sites without coverage. There is no offline indicator, no IndexedDB persistence, no sync queue.
- **Photo evidence is fake.** The "📷 Photo attached" toast just flips a boolean. No EXIF extraction, no GPS validation against site location, no metadata signing (tamper-evident chain-of-custody for legal-grade evidence).
- **No QR/barcode scanning** for harness serial numbers (would integrate with `HSCEquipmentInventory`).
- **No supervisor sign-off / multi-signature** at audit close — required by ISO 45001 §9.2.

### C2. EMF assessment (`HSCEMFAssessment` + `HSCEMFRegister`)

The exclusion-zone calculator is **physically wrong**:
```
const exclusionZone = Math.round(Math.sqrt(parseFloat(totalPower||'0')*0.8));
```
This is a made-up formula. The real ICNIRP / OET-65 calculation requires:
- Per-band MPE (different at 700 MHz vs 3.5 GHz vs 28 GHz)
- Antenna gain (you have it in the table but never use it)
- Antenna pattern (azimuth + elevation discrimination)
- Power density at distance d using Friis with gain: S = (P·G) / (4πd²)
- Tilt-corrected line-of-sight to occupied areas
- Cumulative dose from colocated transmitters
- Time-averaged exposure (6-min for occupational, 30-min for general public per ICNIRP 2020)

A real Cority / Enablon implementation includes an MPE engine validated against OET-65 worked examples. This implementation would not survive a regulatory inspection.

Other issues:
- The 5-step compliance assessment is fine UX-wise but the **public exposure / occupational limit buttons are not wired** to any computed value — they're decorative pass/fail buttons.
- **No 6-min / 30-min time-averaging support.**
- **No spatial-average vs. peak.**
- **Colocation cumulative assessment is not modelled** despite being cited in audit refs (§2.2).
- The HSCEMFRegister assigns `zone` (e.g., 18m, 9m) as a hard-coded mock value rather than computing from the antenna config.
- **No RF re-survey trigger** when antenna configuration changes (e.g., adding a 5G NR radio).
- **No EMC Plan vs. Cumulative Survey distinction** (OET-65 mandates both).

### C3. Incident management (`HSCIncidentList`, `HSCIncidentReport`, `HSCIncidentInvestigation`)

Report wizard (5 steps) is competent. Critical issues:
- **Severity matrix is incomplete.** Fatality is included, but Recordable / DART / LTI / RWC are not distinguished as OSHA categories. The form does not produce an OSHA 301 record.
- **No OSHA Severe Injury Reporting (Form 301) workflow.** Comment in the code says "OSHA must be notified within 8 hours" but there is no notification flow — no email/SMS to OSHA-designated authority, no draft of the OSHA SIR submission, no flag to the OSHA ITA (Injury Tracking Application).
- **5-Why analysis is missing.** Investigation page has a Fishbone (Ishikawa) drawing but it's a static SVG illustration — no editing, no causal-chain capture, no contributing-factor coding. Real RCA tools allow you to expand each "M" into 5-Why and pin to a contributing-cause taxonomy (HFACS, RCA Pro, TapRooT).
- **LTIFR shown as `'0.42'` hard-coded string.** Should compute from `incidents × 200,000 / man-hours-worked`. There is no man-hours input anywhere.
- **No TRIR / DART / RWCFR / SR computed.** OSHA's recordable-incidence formulas are not implemented.
- **No incident pyramid (Bird's triangle / Heinrich)** visualization — fundamental safety metric.
- **No witness statement capture.**
- **No drug/alcohol post-incident testing flag.**
- **No insurance carrier notification workflow.**
- **No fatality / serious-injury escalation tree** (CEO, GC, OSHA, regulators, insurer, family liaison).
- **SLA on critical incident "18h 30m remaining"** is hard-coded — not derived from incident time + jurisdiction-specific SLA.
- **Investigation timeline is hard-coded** — no editing, no event addition.

### C4. Permit to Work (`HSCPermitDashboard`, `RequestForm`, `Approval`, `PreWorkChecklist`)

This is reasonably built. Strong points:
- 7 permit types (Height, Hot Work, Confined Space, Electrical, Excavation, Crane, RF) — solid telecom-relevant list.
- Per-type rules surfaced contextually in the sidebar.
- Approval has a 6-item checklist gate.
- Worker selection enforces certification awareness.

Gaps:
- **No issuer / authoriser / signatory role separation.** Best-practice PTW requires distinct Performing Authority, Issuing Authority, and Site Authority signatures with role-based approval. Currently a single approver with a 6-item self-checklist.
- **No isolation register** (Electrical Isolation should reference a LOTO tag with isolation points, sequence, energy types).
- **No gas-test record** (Confined Space should require O2/LEL/H2S/CO atmospheric pre-test and continuous monitoring records).
- **No fire-watch checklist / 30-min post-work observation** for Hot Work.
- **Permit time extension `(parseInt(extendTarget.to, 10) + extendHours)` is broken** — `extendTarget.to` is a string like `"18:00"`, so `parseInt("18:00", 10)` = 18, ignoring minutes, and the new value is `"20:00"` instead of `18:00 + 2h`. **Logic bug.**
- **No cross-permit conflict detection** (e.g., Hot Work + Confined Space in same room simultaneously).
- **No JHA / JSA attachment as a separate document with risk matrix** — it's a free-form text field.
- **Permit closure does not capture "work completed safely / handover to operations" attestation.**
- **No suspended-vs-cancelled state distinction** in lifecycle.
- **No emergency permit override** (e.g., outage response, no time for standard PTW).
- **No simultaneous-operations (SimOps) matrix.**

### C5. Pre-work checklist (`HSCPreWorkChecklist`)

Good basic structure with PPE / Hazard / Emergency / Climb sections. Issues:
- **No conditional logic.** All sections are always shown; should be permit-type-driven (e.g., Climb-Specific only when working at height).
- **No supervisor co-sign at submit.**
- **No GPS validation** against site coordinates — "📍 Capture GPS" toast is fake.
- **Photo capture is fake** (`message.info('Camera opened…')`).
- **No PPE photo capture per item** (Intelex / ProcessMAP require photo of worker wearing PPE on entry).

### C6. Certifications (`HSCCertificationManagement`, `HSCWorkerCertificationCard`)

Functional but limited:
- **No NWSA / ComTrain / OSHA 10/30 / Red Cross verification integration.** Cert numbers are typed strings; no API verification.
- **No medical fitness for tower-climb** (12-mo physical) modelled separately from certs.
- **No grace-period / suspension workflow** when expired — worker should auto-block from permit selection.
- **No reciprocity logic** (different cert authorities accepting each other's certs across jurisdictions).
- The "Renew" button auto-extends 24 months without requiring proof of refresher training. **This would create falsified records.** Renewal must require a new cert PDF upload.
- **No drug & alcohol testing program** modelled (DOT-compliant random pool, post-incident testing).

### C7. Site compliance (`HSCSiteComplianceDashboard`, `HSCSiteSafetyPlan`)

The compliance dashboard's phase-gate blocking is hard-coded `phasesBlocked = ['on_air','integration']` not derived from the items state. So even after marking Fire Safety Certificate compliant, the phase-gate banner still shows blocked. **Visual/logic mismatch.**

The Site Safety Plan is a static template; no integration with HSCRegulatoryComplianceRegister, no version control on the SSP itself, no review/approval signature workflow on the plan revision.

### C8. Documents (`HSCSafetyDocumentManager`)

Reasonable for a basic DMS:
- Version bumping logic is naive (`v1.0` → `v1.1`) — no semantic versioning, no Major/Minor selector, no superseded-document trail.
- **No e-signature on approval** (21 CFR Part 11-style if regulated).
- **No retention policy** (some safety docs require 5–30 years per OSHA 1904.33 and individual-state laws).
- **No access controls per doc** (everything is org-wide read).
- **No DocuSign / Adobe Sign integration.**
- "Approve" is a single-click action — no MoC (Management of Change) gate.

### C9. Stand-down (`HSCSafetyStandDown`)

Solid concept (program-wide, region, site scope). Good UI. Gaps:
- **No mandatory talk-content selection** when initiating a stand-down (industry rule: every stand-down requires a documented topic + script).
- **No attendance per worker** (only "crew briefed" toggle — no per-individual sign-in).
- **No video evidence of briefing delivery.**
- **No lessons-learned capture on lift.**

### C10. Toolbox talks (`HSCToolboxTalkHistory`, `HSCToolboxTalkRecord`)

Reasonable. Issues:
- **Compliance flag `compliant: true/false`** is hard-coded; should derive from "talk delivered within 24h of task start".
- **No co-facilitator sign-off.**
- **No quiz / comprehension check** post-talk.
- **No multilingual content support** (US field labour often Spanish-first).

### C11. Equipment inventory (`HSCEquipmentInventory`, `HSCEquipmentDetail`)

Decent baseline. Critical gaps:
- **No retirement criteria** — ANSI Z359.2 mandates harness retirement at 5 years from manufacture date OR earlier on damage. Detail page mentions "Manufactured: Feb 2024 · Retire: Feb 2029" but inventory does not enforce withdrawal.
- **No competent-person inspection sign-off chain.**
- **No fall-arrest deployment auto-retirement** (a harness used in fall must be retired immediately).
- **No serial-number QR/RFID scanning for field check.**
- **No defect history correlation** (same defect across multiple units indicates manufacturer recall).
- **No lot-tracking** (3M / DBI-Sala / Capital Safety recall response).
- **The "1" Under Inspection** in the stats strip is hard-coded.

### C12. Vendor performance (`HSCVendorSafetyPerformance`)

Reasonable scorecard. Gaps:
- **LTIFR is shown as a single number** — should display 12-mo trailing, plus benchmark vs industry (Bureau of Labor Statistics NAICS 23713).
- **No EMR (Experience Modification Rate)** column despite being mentioned in audit templates.
- **No insurance certificates of compliance tracking** (COI expiry).
- **No subcontractor cascade** (vendor's subs, sub-subs).
- **No vendor pre-qualification scoring** (ISNetworld / Avetta / PEC-style).
- **No corrective-action close-out rate per vendor.**

### C13. Templates (`HSCChecklistTemplates`, `HSCChecklistTemplateBuilder`)

Builder is bare:
- **No conditional logic builder** (show item B only if item A = fail).
- **No skip-logic.**
- **No multi-language support.**
- **No A/B template versioning with retire-replace flow.**
- **No template-to-audit binding configuration** (which template gets used when type=tower).
- The "Add Item" button just toasts; doesn't add an actual item.

### C14. Emergency procedures (`EmergencyProceduresPage`)

This is actually a **Power Systems emergency page** that lives inside the safety module — it deals with generator manual start, fuel delivery, utility hotlines, NOT safety emergencies. It pulls from `power-systems/lib/powerData`, `PowerCrumbs`, `POWER_COLORS`. **This file is in the wrong module.** It should be under `power-systems/pages/` not `health-safety/pages/`. Also, despite excellent UI craft (field-card layout, print styles, photo placeholders), there is no actual safety-emergency procedure (medical, fire, tower rescue, evacuation, RF exposure, hazardous-material spill).

### C15. Legacy Safety pages (`SafetyDashboard`, `SafetyListPage`, `SafetyDetailPage`)

These three are an entire **second generation** of the safety module using Ant Design `Card`, `KPICard`, `StatusTag`, `Tabs`, `Descriptions`, `Steps`. They have their own `MOCK_DATA` with vendor scores, recent incidents, certification summary — none of which reconciles with HSC* page data. SafetyDetailPage uses `HSC-0001`-style IDs, a 5-tab structure (Details / Risk Assessment / Corrective Actions / Training / Compliance), and tighter density-aware columns. This is **competent but parallel** to the HSC* fleet, creating a clear schema fork.

---

## D. Data Model & State Management

- **Every page hard-codes mock arrays.** No shared state, no React Query, no Redux/Zustand, no SWR, no IndexedDB. Data updates evaporate on navigation (e.g., updating compliance status in HSCSiteComplianceDashboard doesn't propagate to HSCDashboard's `Compliance Rate` KPI of 94.2%).
- **No master-data registry** — workers, vendors, sites, equipment are defined inline in each page with mutually inconsistent data shapes. Worker `John Torres` appears in 8+ pages with different orgs (TowerCo Alpha vs no org).
- **No audit log / change history** on anything.
- **No optimistic update + rollback** pattern.
- **No undo.** Hard deletes (permit close, equipment removal) are irreversible.
- **No reactive computation** of derived KPIs.
- **No multi-tenant scoping** (operator, region, sub-region).

---

## E. UX & Visual Design Consistency

- **Three competing visual languages:** (1) HSCDashboard-style with gradient text + bespoke SVG charts + inline CARD const + emerald/cyan palette; (2) HSCSafetyAuditList using `UX`, `GlassCard`, `SectionHeader`, `AIInsightCard`, `Spark` from shared/components/ux — newer "ambient" style with elevation, AI insight cards; (3) SafetyDashboard using Ant Design `Card`, `KPICard`, `StatusTag`, Row/Col. Three look-and-feels coexist. The Audit pair is clearly the future direction (refined typography, weighted findings panel, evidence tracker) — the rest is dated.
- **Emoji-as-icon overuse** (🧗 🔥 🚪 ⚡ 🤕 🌿 ⬇️ 💥 🏗️ 🔵 🟠) reads as draft / consumer-app, not enterprise EHS. Use Ant Design icons or a single icon set.
- **Hard-coded inline `style={{}}`** everywhere — zero design tokens consumption from `shared/components/ux` in the older pages.
- **Color tokens duplicated** in every file (`const EMERALD='#10b981'`, `const AMBER='#f59e0b'`, etc.) instead of importing from a tokens module.
- **Tables built from raw `<table>`** instead of Ant's `<Table>` in most HSC* pages — sacrifices column sort, density, virtualization, filtering, pagination.
- **`background:'rgba(0,0,0,0.2)'`** as a header background appears in dark-theme remnants (HSCIncidentList, HSCRegulatoryComplianceRegister, HSCVendorSafetyPerformance) — this was a dark-theme original ported to light without recolouring. Looks ugly on the white background.
- **Borders `borderBottom:'1px solid #ffffff'`** between rows means "no visible row line" on white background — clearly a copy-paste bug from a dark theme.
- **No keyboard navigation, no focus rings, no screen-reader labels** on the bespoke SVG charts.
- **No print styles** except in EmergencyProceduresPage. SSP and audit reports should be print-friendly for paper field copies.

---

## F. Accessibility & Internationalisation

- **WCAG: D−.** Bespoke SVG charts have no `<title>`/`<desc>`/aria-labelledby on most charts. Color is the only differentiator on severity/status (red = critical) — colorblind users have no fallback. Click targets in some checklists are 14×14 px. Tab traps in modals are inconsistent.
- **i18n: F.** All strings are hard-coded English. No `i18n` provider, no string extraction. Telecom workforces are often Spanish/Portuguese/Tagalog/Hindi-first. Toolbox talk content templates only ship in English.
- **Date / number formatting** is en-US literal (`'May 15, 2026'`, `'+1-555-0100'`). No locale awareness.
- **No RTL support.**
- **`tel:` links** for emergency hotlines are correct in 3 places (HSCDashboard, HSCIncidentReport, EmergencyProceduresPage), but the number `+1-800-SAFE-911` is converted to `+18007233911` — fine, but the same dialer behaviour assumed on desktop without a softphone is unreliable.

---

## G. Mobile / Field-Ops Readiness

- **No PWA manifest, no service worker, no offline cache.** Tower-climbers work in dead zones. Audit Execution / Pre-Work Checklist / Incident Report MUST work offline with sync queue.
- **No native camera integration** (everything is `Upload` `beforeUpload`-returns-false placebo).
- **No GPS lat/long capture** that actually reads `navigator.geolocation`.
- **No barcode / QR scanner** for harness, helmet, or cert verification.
- **No biometric e-signature** on permits (industry standard via mobile signature pad).
- **No voice-to-text** for hands-free incident reporting (common in dangerous-conditions field workflow).

---

## H. Integration & Extensibility

- **No external system integrations:**
  - No WMS (Work Management) backlink (permit ↔ work order)
  - No HR / LMS for certifications
  - No insurance / claims system (incident → workers' comp)
  - No NWSA / ComTrain cert verification
  - No OSHA ITA submission
  - No Verisk / ISNetworld for vendor pre-qual
  - No regulatory feed (FCC, OSHA, ANSI) for auto-updates
- **No webhook fanout** on critical events (fatality, near-miss, expired cert).
- **No public REST / GraphQL** described.
- **Role-based access** is only via `RoleGate capability={CAP.editFieldData}` / `CAP.approveReadiness` — small set, no field-level masking, no PHI/PII protection.

---

## I. Comparison vs. Competitors

| Capability | Intelex | Cority | EHS Insight | VelocityEHS | Enablon | **This module** |
|---|---|---|---|---|---|---|
| OSHA 300/300A/301 forms | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** |
| OSHA ITA electronic submission | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** |
| TRIR / DART / LTIFR auto-calc | ✓ | ✓ | ✓ | ✓ | ✓ | **✗ (hard-coded)** |
| Bird's triangle / incident pyramid | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** |
| Real ICNIRP MPE engine | ✓ | ✓ | partial | ✓ | ✓ | **✗ (fake formula)** |
| JSA / JHA library + risk matrix | ✓ | ✓ | ✓ | ✓ | ✓ | **partial (text field)** |
| BBS / safety observations | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** |
| CAPA register with overdue aging | ✓ | ✓ | ✓ | ✓ | ✓ | **partial (scattered)** |
| MoC (Management of Change) | ✓ | ✓ | partial | ✓ | ✓ | **✗** |
| RCA 5-Why / Fishbone / TapRooT | ✓ | ✓ | ✓ | ✓ | ✓ | **decorative SVG only** |
| Mobile offline forms | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** |
| Cert verification API integration | ✓ | ✓ | partial | ✓ | ✓ | **✗** |
| Vendor pre-qual scoring | ✓ | ✓ | partial | ✓ | ✓ | **partial (scorecard only)** |
| Permit conflict detection (SimOps) | ✓ | ✓ | partial | ✓ | ✓ | **✗** |
| Multi-language | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** |
| e-Signature (21 CFR Part 11) | ✓ | ✓ | partial | ✓ | ✓ | **✗** |

**Verdict:** The module looks credible in a demo (especially the rebuilt audit pages), but **fails the dependability bar** for an enterprise EHS deployment. Cority / Intelex / VelocityEHS clear most of the above out-of-the-box.

---

## SCORING

| Dimension | Score / 10 | Notes |
|---|---:|---|
| Regulatory & Standards Citation | 6.5 | Strong OSHA 1926 + ISO 45001 + OET-65; missing A10.48, 1910.146, OSHA forms |
| Workflow Realism (Audits) | 7.5 | Best part — template engine, weighted scoring, evidence tracker |
| Workflow Realism (EMF/RF) | 3.5 | Formula is physically wrong; no real MPE engine |
| Workflow Realism (Incidents/RCA) | 4.0 | Wizard OK; no OSHA forms, no real RCA, no severity formulas |
| Workflow Realism (PTW) | 6.0 | Decent baseline; time-extension bug; no isolation / gas-test register |
| Workflow Realism (Cert / Equip / Vendor) | 5.5 | Reasonable inventory; no external verification, no Z359.2 retirement enforcement |
| Data Model & State | 2.5 | Hard-coded mocks everywhere; no shared store; deletions evaporate |
| UX/Visual Consistency | 4.0 | Three competing styles; emoji-as-icon; dark-theme remnants on light bg |
| Accessibility | 2.5 | No aria; colour-only severity; tiny click targets |
| Mobile / Field Readiness | 1.5 | No offline; no real camera/GPS; tower-climbers cannot use this |
| Integration & Extensibility | 1.5 | No external system links at all |
| **Overall** | **4.1 / 10** | **Demo-grade with patches of competent design (audit pair)** |

---

## TOP 10 PRIORITY FIXES

1. **Implement a real ICNIRP / OET-65 MPE engine.** Replace `Math.sqrt(power*0.8)` with per-band MPE using antenna gain, pattern, distance, time-averaging (6-min occupational / 30-min general public). Surface compliance boundary at given height/distance. This single fix elevates EMF from a demo gag to a legally usable tool. (`HSCEMFAssessment`, `HSCEMFRegister`)
2. **Wire OSHA 300 Log / 300A summary / 301 incident report forms + ITA submission stub.** Build the three forms with required fields (case classification, body part, source, event/exposure). Add an ITA-export JSON producer. Drive the recordable-vs-non-recordable decision tree. (`HSCIncidentReport`, `HSCIncidentInvestigation`)
3. **Auto-compute TRIR / DART / LTIFR / RWCFR from incidents + man-hours.** Add a man-hours-worked input (per site per month). Compute the four canonical OSHA rates. Show 12-mo trailing trend vs. NAICS 23713 benchmark. Kill all hard-coded `'0.42'` strings. (`HSCDashboard`, `HSCIncidentList`, `HSCVendorSafetyPerformance`)
4. **Build a real CAPA register with the audit/incident handoff.** Make corrective actions a first-class entity. On audit fail and on incident-root-cause, create CAPAs with owner + due date + verification evidence. Surface overdue aging. (Cross-cutting fix touching `HSCSafetyAuditExecution`, `HSCSafetyAuditDetail`, `HSCIncidentInvestigation`.)
5. **Fix the permit-extension logic bug.** `parseInt(extendTarget.to, 10) + extendHours` mishandles "HH:MM" strings. Use proper Date arithmetic. Also: no permit should extend past its issuer's role boundary without re-approval — currently extension bypasses the 6-criterion approval gate. (`HSCPermitDashboard`)
6. **Reconcile the three parallel dashboards & data models.** Pick one: either keep HSC* fleet and retire SafetyDashboard/SafetyListPage/SafetyDetailPage, or invert. Consolidate worker / vendor / site master data into a shared store. Resolve `HSC-0001` vs `INC-018` vs `HSC-INC-20260515-018` ID schemes.
7. **Implement offline mode for field forms.** Pre-Work Checklist, Audit Execution, Incident Report, Toolbox Talk must work without connectivity — IndexedDB-backed queue with conflict resolution on sync. Tower-climbers are the primary users of three of these. Today they cannot use the tool from a tower.
8. **Add ANSI/ASSE A10.48 coverage to tower-climb audit template + retire bogus TIA-322 section refs.** A10.48 is the controlling standard for telecom tower construction & maintenance. Replace the `TIA-322 §4.3`, `§5.2`, `§6.1` citations against climbing-safety items with proper A10.48 sections. A safety auditor would reject the current references as technically wrong.
9. **Enforce ANSI Z359.2 fall-protection equipment retirement.** Auto-block harnesses past 5-yr manufacture date or with deployed fall history from being selected on a permit. Add an inspection chain-of-custody with competent-person sign-off. (`HSCEquipmentInventory`, `HSCEquipmentDetail`)
10. **Replace decorative Fishbone with a real RCA tool.** 5-Why drill-down, contributing-factor coding to HFACS / RCA Pro taxonomy, link causal chain to corrective actions, capture organisational-vs-individual factors per ISO 45001 §10.2 and OSHA's Severe Injury Investigation guide. (`HSCIncidentInvestigation`)

---

## Bonus high-leverage fixes

- **Move `EmergencyProceduresPage` out** — it's a power-systems page that drifted into the safety folder; it has zero safety content (medical, fire, tower-rescue, RF-exposure, hazmat are all missing).
- **Add a Tower Rescue Plan module** (OSHA 1926.502(d)(20) + ANSI Z359.4) — completely absent today, yet it is the single most-required artefact on a tower-climbing day.
- **Add a real-time Stand-Down trigger from a critical incident** (auto-initiate program-wide stand-down on `severity ∈ {critical, fatality}`).
- **Implement role-separated PTW signoff** (Issuer / Performer / Authoriser distinct).
- **Add ANSI C95.2 sign-colour & FCC sign-language templates** with multi-language printable PDFs.
- **Lock `HSCDashboardHub` to render a true command-center hero strip** with TRIR, DART, fatalities-YTD, days-since-last-LTI, near-miss-to-incident ratio (Heinrich) — none of which exists today.

---

### Files reviewed (absolute paths)

- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCDashboard.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCSafetyAuditList.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCSafetyAuditExecution.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCSafetyAuditDetail.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCEMFAssessment.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCEMFRegister.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCIncidentList.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCIncidentReport.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCIncidentInvestigation.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCPermitDashboard.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCPermitRequestForm.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCPermitApproval.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCPreWorkChecklist.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCRegulatoryDatabase.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCRegulatoryComplianceRegister.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCCertificationManagement.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCWorkerCertificationCard.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCSiteComplianceDashboard.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCSiteSafetyPlan.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCSafetyDocumentManager.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCSafetyStandDown.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCToolboxTalkHistory.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCToolboxTalkRecord.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCEquipmentInventory.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCEquipmentDetail.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCVendorSafetyPerformance.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCChecklistTemplates.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCChecklistTemplateBuilder.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/EmergencyProceduresPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/SafetyDashboard.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/SafetyDetailPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/SafetyListPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/health-safety/pages/HSCDashboardHub.tsx
