# Deep Review — Vendor & Stakeholder Module

**Reviewer perspective:** 20+ year Telecom Vendor Management Architect (Verizon, Vodafone, Orange, NTT, China Mobile; tower companies — ATC, Crown Castle, Indus). Benchmarks: SAP Ariba Supplier Lifecycle, Coupa Supplier Management, Jaggaer ONE, Ivalua, GEP SMART, Anvyl.

**Files in scope (8 pages):**
1. `VendorDashboard.tsx` — 512 LOC, Program Vendor Health
2. `VendorDetailPage.tsx` — 819 LOC, vendor 360
3. `VendorListPage.tsx` — 446 LOC, directory + invite
4. `VendorComparisonPage.tsx` — 386 LOC, radar + cell comp
5. `VendorCapacityPage.tsx` — 262 LOC, capacity gauges
6. `VendorInvoiceTracker.tsx` — 699 LOC, AP/aging
7. `VendorPortalConfigPage.tsx` — 236 LOC, portal admin
8. `VendorPortalDashboard.tsx` — 539 LOC, supplier-facing portal

---

## A. Vendor Taxonomy & Lifecycle — CRITICAL GAPS

**What enterprise needs:** A telecom vendor master must distinguish at minimum: **OEM** (Ericsson, Nokia, Huawei, Samsung, ZTE, Mavenir, Parallel Wireless), **MSP** (managed service provider — Wipro, TechM, Amdocs, Accenture), **Civils contractor** (foundation, tower erection, cable trays), **Tower fabricator** (galvanised steel, monopole, COW), **Power vendor** (rectifier, battery, DG, solar), **Fiber installer** (OSP, OTDR testing, splicing), **MW vendor**, **Drive-test vendor**, **Crew vendor** (rigger crews, climbing certified), **Logistics** (cross-dock, customs broker), **Site acquisition consultant**, **Legal/landlord**, **Test & integration**, **NOC outsourcer**. SAP Ariba and Coupa support 30+ vendor categories with sub-types, capabilities, certifications, and category-specific qualification flows.

**What this module has:** Three types only — `Contractor | Supplier | Consultant` (hardcoded in `VendorListPage.tsx:313`, `VendorDashboard.tsx:323-326`, `VendorComparisonPage.tsx:210`, `VendorCapacityPage.tsx:90`). This is the data model of a 1990s ERP, not a 2026 RAN program. There is no concept of OEM vs MSP vs subcontractor, no capability matrix, no category-specific data fields.

**Lifecycle states observed:** `Active | Inactive | Pending` (VendorListPage, status field). A real vendor lifecycle requires: `Prospect → Invited → Onboarding → Qualification → Approved → Contracted → Active → Probation → Suspended → Terminated → Blacklisted → Archived`. The Invite Vendor modal (`VendorListPage.tsx:355-413`) drops a new vendor straight into "Pending" with no qualification gates — no tax doc upload, no insurance cert collection, no banking validation, no safety qualification, no sanctions/PEP screening, no W-9/W-8BEN-E, no MSDS for materials suppliers, no anti-bribery & corruption attestation, no code-of-conduct acceptance.

**Verdict:** Module models vendors as a flat list. There is no lifecycle engine, no qualification workflow, no category-driven onboarding template. This alone disqualifies it for any Tier-1 operator deployment.

---

## B. Vendor Master Data Quality

`VendorDetailPage.tsx:127-145` (useVendorDetail) defines the vendor entity. Fields present: companyName, vendorId, type, status, registrationNumber, taxId, address (single string), phone, email, website, established, employees, certifications[], services[], performance metrics, country.

**Missing master-data fields demanded by enterprise contracts:**
- **Legal name vs DBA/trading name** — single `companyName` only. Enterprise needs DUNS, LEI (Legal Entity Identifier), parent-company linkage for consolidated risk.
- **Multiple addresses** — registered office vs operational HQ vs warehouses vs site offices. Single string `address` cannot handle multi-jurisdictional vendors.
- **Multiple contact persons** — only `phone` and `email` exist. Real vendors need: Account Executive, Operations Manager, AP/Finance, Safety Officer, Legal, 24/7 Escalation, Emergency Hotline. No contact role taxonomy.
- **Banking / remit-to** — completely absent. Cannot pay vendors without bank account, SWIFT/IBAN, intermediary bank, beneficiary instructions (sanctioned-country flag).
- **Payment terms** — NET 30/45/60, early-payment discount (2/10 NET 30), milestone-based, retention %. Absent.
- **Currency** — vendors operate in multi-currency; `VendorInvoiceTracker.tsx:60` has currencies but vendor master itself has no preferred currency or rate-card currency.
- **Tax classifications** — VAT/GST registration, reverse-charge applicability, withholding-tax rate, tax residency certificate. Single `taxId` is insufficient for cross-border tax compliance.
- **Diversity classifications** — MBE/WBE/VBE/SDB/HUBZone (US), SME (EU), Indigenous-owned (AU/CA). Tier-1 operators have diversity-spend targets and report to FCC/Ofcom/ACMA.
- **Insurance limits** — General Liability $X, Auto $Y, Workers Comp $Z, Professional Indemnity, Cyber, Umbrella. Document `Public Liability Insurance` at row vd2 lists no coverage amount.
- **Geographic service coverage** — only a single `region` string. Real vendors cover lists of states/provinces/MSAs.
- **Capability matrix** — services[] is unstructured. No band coverage (Sub-1, Mid-band, mmWave), no tower-class certifications (Class C riggers, GWO), no OEM authorisations (Ericsson Authorised Service Partner).

**Verdict:** Master data is shallow demo-grade. A vendor record cannot be onboarded, paid, audited, or risk-scored from this schema.

---

## C. Contract & SLA Framework

`VendorDetailPage.tsx:147-151` defines contracts: contractId, name, type (Fixed Price / Unit Rate / T&M), start/end dates, value, status, slaAdherence. `useSLAData()` at line 170 lists 5 SLAs hardcoded.

**Gaps:**
- **No contract object model.** A real contract has: master agreement number, SOWs/work orders, amendments, exhibits, schedules, change orders, NDA reference, parent contract linkage, contract type (MSA, framework, single-shot), contract owner, governing law/jurisdiction, dispute resolution clause (arbitration city), force majeure, IP assignment, indemnities, liability caps. None of this exists.
- **No SLA library / catalogue.** SLAs are hardcoded strings (`Site Ready for RFI`, `Works Completion Notification`). Enterprise needs an SLA catalogue with: metric definition, calculation formula, measurement window, exclusions/holidays/blackouts, target/threshold/breach, weight in scorecard, credit/penalty schedule (service-credit calculation per missed SLA), reporting frequency. The 'target' field is a free-text string (`'5 days'`, `'24h'`, `'Day 5'`) — cannot be aggregated, validated, or used for automated breach detection.
- **No SLA → service-credit linkage.** Real contracts: missing a Sev-1 response SLA by 1h triggers 0.5% monthly service credit; chronic miss triggers earn-back/termination. Module shows breachCount but no credit calculation, no liquidated damages, no penalty workflow.
- **No KPI vs SLA distinction.** KPIs are reported but non-binding; SLAs carry financial consequences. Module conflates them.
- **No contract renewal / termination workflow.** No auto-renewal flags, notice-period tracking, evergreen vs term, termination-for-cause vs convenience.
- **No bid → award → execute flow.** No RFP, RFQ, ITT, bid-tabulation, technical-evaluation, commercial-evaluation, contract-award workflow. This is the SAP Ariba sourcing module — completely absent.
- **Contract values are static strings** (`'$8.2M'`). No currency code, no annualised contract value (ACV), no total contract value (TCV), no remaining commitment, no spend-against-contract, no PO commitment vs. invoice-actual reconciliation.

**Verdict:** Contracts here are display cards, not contractual objects. Cannot drive billing, performance enforcement, renewal pipeline, or sourcing optimisation.

---

## D. Performance Scorecard & Quality

`VendorDashboard.tsx:43-54` ten vendors with scalar `score` (0–100) and `slaAdherence`. `VendorDetailPage.tsx:138-144` adds `performanceScore`, `slaAdherence`, `qualityScore`, `responseTime`, `completionRate`, plus 7-month sparkline arrays.

**Critical issues:**
- **Black-box scoring.** No formula, no weights, no component breakdown. Is `score: 92` (TowerBuild) = 0.4 × SLA + 0.3 × quality + 0.2 × cost + 0.1 × safety? Or is it the average? Or last-month override? No documentation, no audit trail.
- **No weight configuration UI.** Enterprise scorecards (Coupa, Ariba) let category managers set weights per category — civils vendors weighted 40% safety, OEMs weighted 40% on-time-delivery, etc.
- **No rollup hierarchy.** Weekly → monthly → quarterly → annual rollups missing. No YTD, no trailing-12-month. Sparklines are 6–7 points with mock labels.
- **No comparative percentile rank.** "TowerBuild Corp: 92%" is meaningless without "P75 of contractor cohort = 87%". No cohort benchmarking, no peer-group scoring.
- **Quality score** is a number with no link to: ATP failures, defect rate, rework % , NCR count, audit findings, safety incidents (TRIR, LTIR, near-miss). The `VendorQualityScorecardBody` is *embedded* from `quality-acceptance` module — coupling is fragile, and the data model on this side has no native quality fields.
- **No subjective scoring.** Project-manager ratings, behavioural scores, collaboration index — absent.
- **No scoring period boundaries.** Is `performanceScore: 92` last 30 days? QTD? Lifetime? No timestamp.
- **No scorecard publication / vendor acknowledgement workflow.** A signed scorecard with vendor sign-off and improvement plan (PIP — Performance Improvement Plan) is standard practice. Absent.

**Verdict:** Scoring exists in name only. There is no measurable, auditable, contestable scorecard engine.

---

## E. Capacity, Crew & Active-Sites Tracking

`VendorCapacityPage.tsx` is the strongest page in the module. Gauges, alert section, capacity review modal with action options (`expand_capacity | redistribute | hold_new_sites | escalate`) are well thought out. The 90% threshold marker on the donut ring at line 60 is a nice UX touch.

**However:**
- **Capacity = active sites only.** Real vendor capacity has multiple dimensions: crews available (climbing, civils, integration), equipment fleet (cranes, lifts, splicers), peak vs. sustainable rate, geographic capacity per region, certified personnel headcount by certification. The module conflates "sites" with "capacity" — a vendor with 1 crew on a 30-site site is at 100% crew capacity but 3% site capacity.
- **Pipeline** field (`pipeline: 3` etc.) is a single integer — no scheduled-start dates, no forecast confidence, no MGS/RFS dates.
- **No what-if forecasting.** "If I assign 5 more sites, when does this vendor breach 100%?" — absent.
- **No headcount/crew data** in the model. Crew tracker is embedded from `crew-workforce` module (`VendorDashboard.tsx:12`), again coupling rather than first-class data.
- **`CapacityBar` shows over-capacity by capping at 110% visually** (`VendorListPage.tsx:102`, `VendorDashboard.tsx:91`) — a vendor at 150% utilization is invisible. Should expose the actual ratio.
- **No regional/geographic capacity drill.** `region: 'East'` is a single label; no map view per vendor.

**Active sites table on VendorDetailPage** (lines 153-160): scope, assignment type (Primary/Secondary), status, start date. Missing: scope-of-work value, milestone state (RFI/RFS/integration/ATP), end-date / forecast complete, days-on-site, payment-status indicator.

**Verdict:** Capacity tracking is well-presented but data model is flat. Crew capacity, equipment capacity, regional capacity, forecast capacity all missing.

---

## F. Subcontractor Hierarchy & Confidentiality (BR-VND-010)

`VendorDetailPage.tsx:178-184` (useSubcontractors) and `renderSubNode` at 316-336 show a small tree with `confidential: true | false`. The BR-VND-010 banner at 528-530 explains the rule.

**Positives:** The confidentiality flag and "details restricted" UX is correct. Banner cites the BR rule explicitly.

**Gaps:**
- **No tier depth control.** Real telecom: prime → sub-prime → sub-sub-sub. Tracking flow-down clauses (insurance, safety, anti-bribery, conflict minerals) through tiers is mandatory under EU Conflict Minerals Reg, UK Modern Slavery Act, US FAR.
- **No subcontractor approval workflow.** Real flow: prime requests, operator approves/denies (right of substitution, right of refusal), insurance proof for sub, sub master-data sync.
- **No conflicts-of-interest / common-ownership check.** If vendor A and vendor B are both 60% owned by Holding-X, that's a single-point-of-failure that auditors need to see.
- **No spend exposure per sub-tier.** Operator should be able to ask: "What % of my civils spend ultimately flows to Sub-X across all prime vendors?"
- **`confidential: boolean` is binary** — should be a redaction policy with role-based unmasking (legal team can see, ops cannot), with audit log of who unmasked when.
- **Confidentiality flag has no enforcement on data — display only.** A power user could inspect React props and read the masked name. No backend redaction implied.

**Verdict:** Conceptually present, operationally toy. Real procurement teams need workflow + audit + spend rollup.

---

## G. Vendor Portal — SSO, Multi-Tenant, Branding

`VendorPortalConfigPage.tsx` and `VendorPortalDashboard.tsx` together model the vendor-facing portal. Features: `view_sites | update_tasks | upload_documents | submit_checklists | view_scorecard | view_payments | submit_invoices`.

**Multi-tenancy isolation issues:**
- `VendorPortalDashboard.tsx:136` `useState('towerbuild')` — the portal lets the user switch between vendors via a dropdown (`VENDOR_OPTIONS` at line 18). This is a demo crutch; in production, a portal session is bound to a tenant. **CRITICAL:** if this dropdown ships to prod, vendor A could view vendor B's sites, tasks, invoices, and scorecard. The header text at line 206 hardcodes `VND-001 · CNT-2025-0042 · 2026-12-31` regardless of which vendor is selected — confirming data isn't actually filtered per-tenant on this demo. The data array (`data.sites`, `data.tasks`) is shared.
- **No tenant-level data segregation** in the mock; all sites and tasks render for every vendor. A production deployment using this scaffold would expose other vendors' data.
- `ALLOWED_FEATURES` is a *module-level constant* (`VendorPortalDashboard.tsx:26`) — not per-vendor. The portal-config page stores per-vendor features but the portal dashboard ignores them.

**SSO/SAML/OIDC:**
- Toggle exists (`ssoEnabled`), single field `idpUrl`. Real SAML config needs: IdP metadata XML upload, SP entity ID, ACS URL, signing/encryption certs, name-id format, attribute mapping (groups, roles, email), session timeout, SLO endpoint, certificate rotation reminder. Toggle is cosmetic.
- No OIDC support, no SCIM provisioning, no MFA enforcement policy.

**Branding:**
- Portal name + single brand color. Real white-label needs: logo upload (PNG/SVG), favicon, login-page hero, color theme palette (primary/secondary/accent/danger), custom CSS allowance, custom domain (vendorportal.acme.com vs portal.operator.com), email template branding for portal notifications.

**Access controls:**
- Feature toggles exist but no role hierarchy inside the vendor org (Portal Admin, Site Lead, Field Tech, Read-only viewer). Real portals have intra-tenant RBAC.
- No IP-allowlisting, no time-of-day restrictions, no geofencing.
- `Auto-expire with Contract` is a single switch — fine — but no warning notification cycle (90/60/30/7 day countdown emails) before expiry.

**Audit & activity:**
- `lastLogin: '2026-05-12 14:32'` is the only audit field. No login history, no failed-login tracking, no IP capture, no device fingerprint, no SIEM-export.

**Verdict:** Portal is a demo wireframe with severe multi-tenant data-leak risk. SSO/branding/audit are placeholders.

---

## H. Invoice, PO Match & Financial Controls

`VendorInvoiceTracker.tsx` — 699 LOC, the most operationally rich page. Has aging buckets, donut+bar visualisation, status filters, approve/dispute/match-PO modals, BR-FIN-006 warning for invoices exceeding PO total.

**Positives:**
- Aging bucket logic (`AGING_BUCKETS` at line 62) is correct, 5-bucket sliding window.
- PO-exceed flag (`exceedsPO`) with tooltip referencing BR-FIN-006 is good business-rule traceability.
- Approval workflow gated by `RoleGate capability={CAP.approvePayment}` — proper RBAC pattern.
- CSV export is real (line 530-558), not a placeholder.

**Gaps for enterprise-grade AP:**
- **No 3-way / 4-way match.** Real AP requires PO ↔ Goods Receipt (GRN) ↔ Invoice ↔ Quality Acceptance (4-way for capex). Module compares invoice ↔ PO total only, ignores GRN, ignores partial deliveries, ignores ATP sign-off precondition.
- **No tax line-items.** VAT/GST recovery requires line-level tax breakdown, tax code per line, reverse-charge handling. Single `amount` field.
- **No retention / hold-back.** Telecom contracts commonly retain 5–10% per milestone until final acceptance. Absent.
- **No early-payment discount calculation.** 2/10 NET 30 logic is enterprise-standard. Absent.
- **No invoice OCR / e-invoicing.** PEPPOL, Tradeshift, ZUGFeRD, GST e-invoicing (India), CFDI (Mexico). Module accepts text input only.
- **No accruals.** Month-end accrual on uninvoiced PO commitments is a controllership requirement. Absent.
- **No payment-run batching, no Form 1099 / DAS2 reporting, no SOX SoD.**
- **`pickMany` and `pick` in `generateInvoices`** at line 76 use seeded RNG for demo data — fine, but the `poId` and `poLink` are not cross-referenced to the actual PO module's data, so the "Match PO" Modal at 353 shows a list of synthesized POs (`PO-PROG-2026-00001..00008`) decoupled from any real PO catalogue.
- **Match PO modal accepts free selection** — no validation that the PO is open, not closed, not exceeded, not voided.
- **Currency conversion missing.** Multi-currency invoices listed but no FX rate, no functional-currency conversion, no realized/unrealized FX gain.

**Verdict:** UI ahead of data model. A real AP system would need ERP integration (Oracle EBS, SAP S/4, Workday Financials) — the module is a presentation layer with no procure-to-pay engine.

---

## I. Risk, Compliance, Audit Trail

**What's present:**
- Documents tab in VendorDetailPage tracks: name, category (Certification/Insurance/Safety/Compliance), upload date, expiry, status (Valid / Expiring Soon).
- The Assignment History timeline (lines 186-192) is a 5-row mock.
- Change Request log (lines 194-197) with reason, proposed replacement, status.

**What's missing (the big-three risk pillars):**

**1. Financial-health risk:**
- No D&B PAYDEX, no Experian risk grade, no Bloomberg credit rating, no Z-score, no DSO/DPO computation, no concentration risk (this vendor is 35% of our civils spend — too concentrated), no parent-company risk inheritance, no bankruptcy/insolvency monitoring (Dun&B alerts).
- No financial-statement collection workflow (annual audited financials, quarterly management accounts for top-100 vendors).

**2. Operational risk:**
- No safety scoring (TRIR, LTIFR, fatality history) despite "safety" being in onboarding requirements per prompt.
- No incident history (no link to safety-quality module).
- No business-continuity / disaster-recovery posture.
- No geographic-concentration risk (vendor only in West region → wildfire/storm exposure).
- No key-personnel dependency flag.
- No cyber-security posture (no SOC 2, ISO 27001 tracking — only ISO 9001/14001/OHSAS in demo).

**3. Compliance / ethics risk:**
- No sanctions screening (OFAC, EU Consolidated, UN, UK HMT). Mandatory for telecom vendors crossing borders.
- No PEP (Politically Exposed Persons) screening.
- No anti-bribery & corruption (ABAC) attestation, no FCPA/UK Bribery Act flow-down.
- No conflict-minerals (3TG) declaration.
- No modern-slavery statement collection (UK MSA 2015, AU 2018).
- No GDPR data-processor agreement tracking.
- No environmental compliance (Scope-3 emissions reporting expected from major OEMs).
- No diversity-spend tracking (despite Tier-1 operators having public targets).

**Audit trail:**
- Edit modal on VendorDetailPage (`handleEdit` line 736-740) merges field values into local state with no audit-log entry, no who-changed-what-when, no before/after snapshot. SOX-failing for a public operator.
- Vendor-status changes have no workflow approval, no reason code, no escalation.

**Verdict:** Risk module absent. Audit trail is non-existent. This would not pass an internal-controls audit, let alone external regulator scrutiny (FCC §47, Ofcom, NRA, BNetzA).

---

## J. AI Anomalies, Comparison, Integration Quality

**AI Anomalies (`AIVendorAnomaliesBody` embedded at VendorDashboard line 13):**
- It's a tab embed, no surface-level visibility (no badge count, no severity, no last-detection-time on the Dashboard hero). Risk: ML alerts are buried.
- No closed-loop: detected anomaly → action → resolution → feedback to model.

**Comparison (`VendorComparisonPage`):**
- Radar normalisation at `VendorComparisonPage.tsx:85-92` uses arbitrary divisors (`/10` for response time, `/35` for completion days, `/150000` for cost). Vendor with response time of 12h would render below zero (clamped to 0). Vendor with cost > $150k/site would also render negative.
- Hard-cap at 4 vendors — fine for radar, but no statistical-significance disclaimer ("compare like-for-like; not normalized for scope").
- "Cost / Site" hardcoded in mock; in real life cost/site varies by region, scope, sub-band — needs normalisation.
- Scope→Type mapping (`SCOPE_TO_TYPE`) is a 3-row hardcoded dict — toy.

**Cross-module embedding pattern:**
- `VendorDashboard.tsx:10-13` embeds 4 bodies from 4 other modules (reporting-dashboards, quality-acceptance, crew-workforce, ai-ml). This creates brittle coupling — refactoring any of those breaks the dashboard. Should be loose-coupled via stable data contracts/APIs, not React component imports.

---

## K. UX/A11y/Visual Quality

**Strengths:**
- Custom SVG gauges (`ScoreArc`, `ArcGauge`, `SLAGauge`) include `role="img"`, `aria-label`, `<title>` elements — accessibility above average.
- Color thresholds (≥90 green, ≥75 amber, <75 red) consistent across pages.
- Sparkline tooltip (`Sparkline` component) interactive with hover crosshair — good UX.
- `useDensityColumns` + `WithDensity` density-tier column hiding shows mature design-system maturity.
- Saved Views + filters-in-URL pattern in VendorListPage is properly enterprise.
- `RoleGate capability={CAP.approvePayment}` and `CAP.configSystem` show RBAC discipline.

**Weaknesses:**
- **VendorPortalDashboard tenant-switcher is a critical pre-production smell** (see §G).
- `window.open('/vendors/' + v.id, '_blank')` in VendorCapacityPage line 87/119/197 — using window.open from React breaks SPA navigation, loses state, opens excess tabs. Should use `useNavigate`.
- `Math.round((totalActive / totalContracted) * 100)` (VendorCapacityPage line 158) doesn't divide-by-zero guard.
- Hardcoded color hex codes scattered (e.g., `#52c41a`, `#1677ff`) rather than design-token references — theming/dark-mode painful.
- VendorDetailPage hero banner uses `Rate disabled defaultValue={4.5}` (line 628) — a 5-star rating is decorative noise with no data source. Either remove or wire to actual score.
- VendorDetailPage Tabs cap pattern at lines 654-678 (primary tabs + "More ▾" dropdown) is good IA, but moving Contracts and Documents to "More" is odd — Contracts is one of the most-accessed tabs in vendor management.
- `useEffect` at `VendorComparisonPage.tsx:227-229` uses `React.useEffect` (not destructured) — should be `import { useEffect }`.

**Empty states:** Present and well-handled in InvoiceTracker and VendorListPage via the `EmptyState` component.

**Loading states:** Absent. No skeleton, no spinner during data fetch (all mocks are sync).

**Mobile:** Reasonably responsive via `Col xs/sm/md/lg/xl`, but Tables overflow horizontally on mobile (scroll x). Vendor cards reflow correctly.

---

## L. Scope Gaps vs. Best-in-Class (Ariba / Coupa / Jaggaer / Ivalua / GEP)

Only 8 pages cover this domain. Typical vendor-management suite has 40–60 pages. Specifically missing:

1. **Sourcing / RFx workbench** — RFP/RFQ creation, bidder list, Q&A board, sealed bids, evaluation scorecards, award decision memo.
2. **Catalogue & rate-card management** — line-item rate cards per scope of work, escalation clauses, fuel surcharges.
3. **Supplier discovery / scouting** — public DB lookup, market-intel, recommended-vendors by capability+region.
4. **PIP (Performance Improvement Plan) workflow** — when vendor falls below threshold, formal plan, milestones, signoff, exit criteria.
5. **Vendor scorecard publication & vendor self-acknowledgement** workflow.
6. **Contract clause library / templates / playbook** with markup, redline, e-sign.
7. **Vendor risk dashboard** — financial-health heatmap, geographic concentration map, alert center.
8. **Spend cube / spend analytics** — category × region × tech × time, off-contract spend detection.
9. **Vendor self-service onboarding wizard** with multi-step KYC, doc upload, banking verification.
10. **Vendor 360 timeline** — unified chronology across all interactions (RFx, contracts, invoices, scorecards, change requests, incidents).
11. **Subcontractor approval workflow** with operator-side review.
12. **Insurance certificate tracking dashboard** — by vendor, by expiry, by coverage limit, COI request workflow.
13. **Sustainability / ESG scorecard** — Scope-1/2/3 emissions, diversity, ethics.
14. **Vendor communication hub** — message center, broadcast announcements, contract notifications.
15. **Renewal pipeline** — contracts expiring 90/60/30/7 days view.
16. **Spot-buy / Tail-spend management.**
17. **Vendor capability self-attestation** with versioned profile.

---

## M. SCORING (out of 100)

| Dimension | Score | Note |
|---|---|---|
| Vendor taxonomy & lifecycle | 15 | 3 types vs 13+ needed; no lifecycle engine |
| Master data depth | 18 | Missing banking, terms, tax, diversity, capability matrix |
| Contract / SLA framework | 20 | No SLA library, no service credits, no sourcing |
| Performance scorecard | 25 | Black-box scoring, no weights, no rollups, no PIP |
| Capacity tracking | 55 | Best page of module; lacks crew/equipment/forecast |
| Subcontractor hierarchy | 40 | Confidential flag good; no workflow, no flow-down |
| Vendor portal (multi-tenant) | 15 | Critical tenant-switch leak risk; SSO cosmetic |
| Invoice / PO match | 45 | Good UX; no 3/4-way match, no tax, no retention |
| Risk & compliance | 8 | No financial health, no sanctions, no ESG |
| Audit trail | 10 | Edits unaudited; no SOX evidence |
| AI anomalies integration | 30 | Tab embed only; no closed loop |
| UX/A11y | 70 | SVG gauges accessible; density columns mature |
| Cross-module integration | 30 | Tight component coupling, fragile |
| Scope coverage vs SAP Ariba/Coupa | 12 | 8 pages vs ~40-60 needed |
| **Overall** | **27 / 100** | **Demo-grade prototype** |

**Maturity rating:** This module is at **Level 1 of 5** on the Procurement & Vendor Management Maturity Model (CIPS / Hackett). Suitable for sales demo and design alignment, NOT for piloting with real vendors. Would require 6–9 months of engineering plus integration with sourcing, ERP/AP, treasury, contract-lifecycle, and identity-provider systems to reach Level 3 (operational).

---

## N. TOP 10 PRIORITY FIXES (in order)

1. **REMOVE the tenant-switcher dropdown from `VendorPortalDashboard.tsx`** (line 208-215). Replace with a server-bound vendor context derived from authenticated session. This is a P0 security defect — shipping it risks vendor-to-vendor data leakage. Add an integration test that asserts only the bound tenant's data renders.

2. **Replace 3-type vendor taxonomy with full telecom category model.** Introduce a `VendorCategory` enum (OEM, MSP, Civils, Tower-Fab, Power, Fiber, MW, Drive-Test, Crew, Logistics, Site-Acq, Legal, Test-Integration, NOC-Outsourcer, Other) and a `VendorSubCategory` second-level. Drive onboarding form fields, qualification gates, certification requirements, and scorecard weights from category.

3. **Build a real lifecycle state machine** (Prospect → Invited → Onboarding → Qualification → Approved → Contracted → Active → Probation → Suspended → Terminated → Blacklisted → Archived) with allowed transitions, role-gated transitions, and a server-emitted state-change audit event for SOX evidence.

4. **Introduce SLA catalogue object** with formula, measurement window, target, threshold, breach, weight, service-credit schedule, calculation period. Replace free-text `target: '24h'` / `'Day 5'` with structured `{ targetValue: 24, unit: 'hours', businessDaysOnly: false, breachPenalty: 0.5 }`.

5. **Audit-log every vendor-master mutation.** The Edit modal at `VendorDetailPage.tsx:730-765` currently merges into local state — add an audit event (`field`, `oldValue`, `newValue`, `actor`, `timestamp`, `reasonCode`) and surface it in a "Change History" tab.

6. **Implement proper 3-way (PO ↔ GRN ↔ Invoice) match in `VendorInvoiceTracker`.** Add Goods Receipt step, link invoices to GRN line items, only allow approval if matched. Surface BR-FIN-006 plus net-new BR-FIN-007 (no-GRN-no-invoice) and BR-FIN-008 (retention hold-back).

7. **Add risk scoring module.** Per vendor: financial health (D&B grade or computed Z-score), concentration risk (% of category spend), geographic concentration, safety score (TRIR), insurance-cert validity, document-expiry exposure. Surface as heatmap on VendorDashboard and per-vendor risk badge.

8. **Insurance & certification expiry tracking with proactive notifications.** The documents table tracks expiry but no notification cycle (90/60/30/7 day reminders to vendor + internal owner) or auto-suspend on expiry. Add a daily cron that flips status and triggers email/portal banner.

9. **Wire scorecard formula transparency.** Every score number should be clickable → modal showing inputs (SLA: 94, Quality: 89, Safety: 96, Cost: 82) × weights → final score. Allow category managers to edit weights with audit, with effective-dated weight changes (don't retro-rewrite history).

10. **Properly decouple cross-module embeds.** `VendorDashboard.tsx:10-13` imports 4 page-body components from other modules. Replace with a stable internal API or shared-data context. Embedded tabs should fetch from shared service layer, not import sibling pages — otherwise refactor of `VendorPerformanceDashboardPage` breaks this dashboard silently.

---

**End of Review**

File paths referenced:
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/vendor-stakeholder/pages/VendorDashboard.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/vendor-stakeholder/pages/VendorDetailPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/vendor-stakeholder/pages/VendorListPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/vendor-stakeholder/pages/VendorComparisonPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/vendor-stakeholder/pages/VendorCapacityPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/vendor-stakeholder/pages/VendorInvoiceTracker.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/vendor-stakeholder/pages/VendorPortalConfigPage.tsx`
- `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/vendor-stakeholder/pages/VendorPortalDashboard.tsx`
