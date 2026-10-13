# Deep Review 16: Financial Module — Enterprise-Grade Critical Assessment

**Module Path:** `/Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial`
**Pages Reviewed:** 19 (FinancialDashboard, FinancialDashboardHub, CapexExecutionDashboard, OpexTrackerPage, BudgetManagement, BudgetVarianceReport, FiscalPeriodManagement, FinancialDetailPage, FinancialListPage, FinancialRiskHeatmap, PaymentCertificateList, PaymentCertificateDetail, PaymentMilestoneConfig, PurchaseOrderList, PurchaseOrderDetail, VendorPaymentTracker, RolloutEconomicsPage, SLAComplianceDashboard, SLATemplateManager)
**Reviewer Persona:** Tier-1 Telecom CFO / Financial Operations Architect (SAP S/4HANA, Oracle ERP Cloud, Workday Financials, Microsoft Dynamics 365 F&O, Sitetracker Finance)
**Verdict:** **Demo-grade UI shell with severe domain-model and audit-integrity gaps** — not deployable for a regulated telecom finance environment.

---

## A. Financial Architecture & Data Model

### A.1 The "Data Model" Is Cosmetic, Not Canonical
The module is a **federation of 19 visually polished but structurally independent screens**, each redefining its own ad-hoc TypeScript interface (`Budget`, `PaymentCertificate`, `PurchaseOrder`, `MilestonePmt`, `VendorSummary`, `SiteEcon`, `OpexEntry`, `VariationOrder`, `SLATemplate`, etc.). There is **no shared domain model** for the canonical entities a telecom finance system requires:

- No `Contract` aggregate root linking vendor, PO, milestones, SLA template, retention, LD clauses.
- No `Vendor` master with tax IDs, payment terms (Net30/Net60/Net90), credit limit, default bank.
- No `WBS` (Work Breakdown Structure) or `Project` hierarchy (CWIP → asset capitalization).
- No `CostCenter` / `GLAccount` / `IFRS-class` mapping (essential for SAP/Oracle ERP integration).
- No `JournalEntry` model — the system cannot post a debit/credit anywhere. Period close is theater.
- No `FX rate table`, no `multi-currency revaluation`, no `tax authority register`.

In SAP S/4HANA terms the module models **none** of: PSP elements, internal orders, settlement rules, asset under construction (AuC), project profitability (PA), commitment management (FM), or COPA.

### A.2 Mock-Data Disease
Every page re-seeds its own random data with collision-prone seeds (e.g., `seededRand(1234)`, `seededRand(5432)`, `seededRand(9871)`). Cross-page **references are visually consistent but mathematically unrelated**:
- `PaymentCertificateDetail` shows `linkedPO: 'PO-PROG-2026-00001'` but the value will never reconcile against `PurchaseOrderDetail` for `po-1` because both pages mint their own line-item totals, gross amounts, and tax with different formulas.
- `FinancialDashboard.SPEND_ACTUAL` = `[2.8…5.8]` totalling `47.2M`, while `CapexExecutionDashboard.MONTHLY_SPEND` totals `~33.6M`, while `BudgetManagement.MOCK_BUDGETS` totals `total = 50.7M / spent = 43.8M`. **Three dashboards, three different "actual spend" numbers for the same fiscal year**. A CFO reviewing this on the same screen would lose all trust in 30 seconds.

### A.3 Currency Handling Is Broken
USD is hardcoded essentially everywhere. `OpexTrackerPage` has a currency dropdown (USD/EUR/GBP/INR) in the create-entry drawer, but the **table sums and KPIs add raw amounts across rows regardless of currency**. `FiscalPeriodManagement` claims to "lock exchange rates for FY2026" in the year-end wizard but stores no rate table. No FX gain/loss accounts, no triangulation, no functional-currency vs reporting-currency distinction.

### A.4 No Persistence, No Optimistic-Lock, No Audit Trail at the Data Layer
Every mutation (`setBudgets`, `setMilestones`, `setPeriods`, `setStatus`) is in-memory React state. Closing a period, freezing a budget, approving a certificate, raising a dispute — all **vanish on page refresh**. No audit log persists. The "Override Closed Period" justification is collected, success-toasted, and dropped on the floor.

---

## B. CAPEX/OPEX Classification & IFRS Compliance

### B.1 CAPEX/OPEX Boundary Is Stochastic, Not Rule-Based
`FinancialDetailPage.generateCostDetail`:
```ts
capexOpex: rand() > 0.3 ? 'CAPEX' : 'OPEX',
```
This is not a classification rule — it is a coin flip. There is **no policy engine** matching the IFRS-mandated tests:
- IAS 16 PPE recognition (probable economic benefit + reliable cost measurement).
- IAS 38 intangibles (software, spectrum).
- IFRS 16 lease classification (tower lease right-of-use asset vs. operating expense).
- ASC 842 / IFRS 16 lessee accounting for site rooftop and rooftop+ground leases.
- IFRIC 12 service concession arrangements (relevant for tower-co handovers).
- Materiality threshold (typically ≥ $5K capitalised, < $5K expensed).

In a Tier-1 telco, this matters: 5G CAPEX is often $20-30B per major operator; a 1% misclassification rate is $200-300M of tax/depreciation impact.

### B.2 No Depreciation, No CWIP, No Asset Register
- `OpexTrackerPage` and `BudgetManagement` treat capex spend as if it were paid OPEX. There is no concept of:
  - Capitalisation date (in-service date) vs. invoice date.
  - Capital Work In Progress (CWIP) balance.
  - Useful life by asset class (RAN equipment 5-7 yr, fiber 15-25 yr, towers 25-30 yr, spectrum 15-20 yr).
  - Depreciation method (straight-line, units-of-production for spectrum).
  - Asset retirement obligations (ARO) — site decommissioning costs.
- `FiscalPeriodManagement.balancesModal` includes "Capital Work in Progress: 18.6M" — but there is no journal entry, no fixed-asset sub-ledger, no monthly depreciation run.

### B.3 OPEX Categories Are Close But Lack Depth
`OpexTrackerPage.OPEX_CATEGORIES` is the strongest piece of categorical modeling in the module:
- 8 categories (Energy/Lease/Transmission/Maintenance/Security/Regulatory/IT-Cloud/Logistics) — matches Sitetracker and Tarantula structure reasonably well.
- Per-category vendor lookup tables.
- Recurrence flag (Recurring vs One-time).
- Region + scope-type (Site/Region/Network) decomposition.

Gaps:
- No **lease term, escalation clause, renewal date** fields (critical for IFRS 16 RoU asset computation).
- No **kWh / m² / per-circuit metering link** for variable OPEX (energy/transmission).
- No **service contract** lifecycle (start/end/auto-renew/notice period).
- No **accrual** logic — OPEX should accrue daily and reverse on invoice receipt.
- No **prepayment amortization** (e.g., 12-month spectrum fee paid upfront, expensed monthly).

---

## C. Earned Value Management (EVM) Implementation

### C.1 The Numbers Are Hand-Written, Not Computed
`CapexExecutionDashboard.PLANNED_VALUE`, `EARNED_VALUE`, `ACTUAL_COST` are static 18-element arrays. The "S-curve" is a plotted polyline, not a derived metric.

**A real EVM module computes**:
- PV (BCWS) = Σ (planned% × budget) per WBS element per period.
- EV (BCWP) = Σ (actual% complete × planned cost) — requires per-task progress tracking.
- AC (ACWP) = Σ posted actual costs from GL.
- **SV** = EV − PV, **CV** = EV − AC.
- **SPI** = EV/PV, **CPI** = EV/AC.
- **EAC** = BAC/CPI (or BAC − BCWP + ACWP, or other formulae per PMI PMBOK).
- **TCPI** = (BAC − EV) / (BAC − AC) — to-complete performance index.
- **VAC** = BAC − EAC.

The page narrates **"SPI at 0.87"** in the AI summary and computes `EV[i]/PV[i]` in tooltips, but:
- **CPI gauges show fictional `cpi` values per market** (1.04, 0.87, 0.95, 1.12) — never recomputed from EV/AC.
- **"Forecast at Completion: $51.8M"** is a static KpiTile string, not `BAC/CPI`.
- **Hardcoded MARKET_BUDGETS.cpi values are unrelated to MARKET_BUDGETS.spent values**; for the "Central" market the displayed `spent=6.8M / committed=4.2M / total=12.0M` gives an actual-vs-budget ratio of 0.567, not 0.87.
- **EAC across the 4 markets if back-computed from CPI gives `total/CPI` = 11.54M+13.79M+11.58M+10.89M = 47.8M**, but the KPI says EAC = $51.8M. These numbers cannot be reconciled.

### C.2 No WBS / Work-Package Hierarchy
EVM is fundamentally a **WBS-level discipline**. The module has no WBS table, no work-package owners, no rolling-wave planning. The "S-curve" is at program level only — useless for the PM running a regional rollout.

### C.3 Missing EVM Concepts
- No **Control Account** (CA) hierarchy.
- No **Performance Measurement Baseline** (PMB) lock + change control.
- No **Estimate to Complete** (ETC) vs **EAC** distinction.
- No **Variance at Completion** (VAC) display.
- No **% complete methods** (0/100, 50/50, milestone-weighted, units complete, LOE).
- No **integration with milestones table** — payment milestones (`PaymentMilestoneConfig`) and EVM milestones are not linked.

---

## D. Payment Milestones, Retention & Liquidated Damages

### D.1 Milestone Configuration Is Decent UI / Weak Validation
`PaymentMilestoneConfig` is among the better pages:
- 7 milestone-type enums (mobilization, civil_complete, equipment_installed, integration_complete, acceptance, on_air, final_payment).
- 6-milestone default schedule (10/15/25/20/20/10 = 100%).
- Auto-generate flag for triggering a payment certificate when conditions match.
- Trigger-condition strings (e.g., `milestone_status=Accepted&qa_result=Pass`).
- Live validation that percentages must sum to 100%.

Issues:
- **Trigger conditions are free-text strings, not a typed predicate AST**. There is no validator that `qa_result=Pass` even references a real field; spelling errors are silently accepted.
- **No retention configuration UI** at the milestone level. Retention is hardcoded at 5% in `PaymentCertificateDetail.retention = gross * 0.05` and 5% in `PaymentCertificateList.retention = gross * 0.05`. The standard telecom contract carries **5-10% retention with a 12-month DLP (Defects Liability Period)** and release schedules (often 50% on Final Acceptance, 50% on DLP expiry).
- **No LD (Liquidated Damages) clause storage**: rate ($/day or % of contract/week), cap (typically 10-15% of contract value), trigger date offsets. The vendor-payment-tracker shows "SLA Penalties" but these are not LDs — LDs are contractual delay penalties, distinct from SLA penalties.
- **No advance payment / mobilization advance recovery schedule** — telco contracts typically pay 10-20% advance against a Bank Guarantee, recovered pro-rata from each invoice.

### D.2 Mobilisation Advance & Bank Guarantee Tracking — Missing
A Tier-1 telecom procurement contract typically requires:
- Mobilization advance (10-20%) against Advance Payment Guarantee (APG).
- Performance Bank Guarantee (PBG) typically 10% of contract value, valid until 90 days post DLP.
- Retention release tied to PBG return.

None of these instruments exist in the module. There is no PBG/APG/DLP register. A vendor could disappear with the mobilization advance and the system has nothing to track recovery.

### D.3 Penalty/Bonus Computation Is Toy-Grade
`PaymentCertificateList.generateCerts`:
```ts
const penalty = Math.round(gross * rnd() * 0.08 * 100) / 100;
const bonus = Math.round(gross * rnd() * 0.03 * 100) / 100;
```
Penalty is a random fraction of gross. Bonus is a random fraction of gross. There is **no link to the underlying SLA breach record** (the `linkedSLABreaches` field is hardcoded as `['SLA-0001','SLA-0002']` per certificate). The `SLATemplateManager` defines three penalty types (`fixed_per_day`, `percent_of_contract`, `fixed_per_breach`) and caps — none of which are actually used to compute penalty amounts on certificates.

---

## E. Payment Certificate & PO Workflow

### E.1 Three-Way Match (3WM) Is Completely Absent
The defining ERP control for accounts payable is the **three-way match**: PO ↔ GRN (Goods Received Note) ↔ Vendor Invoice. The system must block an invoice from being approved unless:
1. Invoice line item references a PO line item.
2. Cumulative invoiced qty ≤ PO qty (with tolerance).
3. GRN posted with received qty.
4. Unit price matches PO unit price (with tolerance).

`PurchaseOrderDetail` has a tab for "Invoices" with status (Received/Approved/Paid/Disputed) and an `InvoiceLimitBar` (BR-FIN-006) that warns when invoiced > total — that is a **two-way comparison**, not a three-way match.

There is **no GRN concept** anywhere in the module. Goods receipt, partial receipt, delivery note, packing list, inspection — none modeled.

### E.2 PO Lifecycle Holes
`PurchaseOrderDetail` allows transitions:
- Draft → Submitted → Approved → Partially Delivered → Fully Delivered → Closed.
- But: status changes are unilateral button clicks, no segregation of duties, no four-eyes approval, no authorization matrix by amount.
- Approval authority is referenced as "BR-FIN-005" but is **not enforced** at approval — the modal title says "Your approval authority will be verified" and proceeds.
- No PO amendment workflow with version history of the PO itself (line items, quantities, prices). The `amendments` array in `buildPODetail` is a static 2-row mock.

### E.3 Certificate-PO-Milestone Linkage
`PaymentCertificateDetail` has a "Linked Items" section with `linkedPO`, `linkedMilestoneId`, `linkedSLABreaches`. These are **hardcoded computed strings** from the certificate id (`PO-PROG-2026-${idx}`) — they do not resolve to actual records and clicking them navigates to detail pages that re-seed their own data.

### E.4 No Tax/VAT Engine
`PurchaseOrderDetail.taxRate` is a single number `[0, 5, 10, 15][idx % 4]`. Real telecom finance needs:
- Multi-jurisdiction tax (federal, state, USF for US carriers; VAT/GST elsewhere).
- Reverse charge mechanism (for foreign vendors).
- Withholding tax (WHT) for cross-border payments.
- Tax authority codes mapping to GL accounts.
- Tax returns (input vs output reconciliation).

---

## F. Budget Management & Variance Analysis

### F.1 Budget Authority Matrix — Defined, Not Enforced
`BudgetManagement.AUTHORITY_MATRIX` correctly tiers approval (PM < $500K, Director $500K-$2M, VP $2M-$10M, CFO > $10M). The matrix is **displayed in the approve modal**, but the approve button does not check the logged-in user's role against the threshold. Any user can click "Approve".

### F.2 Variance Computation Is Surface-Level
`BudgetVarianceReport`:
- 4-bucket RAG (under / on-track ≤5% over / over 5-10% / critical >10%).
- Planned vs Committed vs Actual at category × technology cross-tab.
- Drill modal shows site-level breakdown — but with **5 hardcoded sites that are the same for every (category, tech) cell**. A drill from Civil Works × Macro5G shows the same site list as Equipment × CRAN.

Missing:
- **No variance attribution** (price variance vs volume variance vs schedule variance vs scope variance).
- **No variance commentary workflow** (PM must justify variances > threshold in writing).
- **No forecast vs budget vs actual** triple comparison.
- **No commitment vs uncommitted distinction** below the program level.

### F.3 Re-Forecast Workflow Missing
Telecoms typically run a **monthly re-forecast** (FRP — Financial Re-Forecast Process). The module supports the original baseline budget only. No way to lock the original baseline, capture a re-forecast, see baseline vs current forecast vs actual.

### F.4 The "Budget" Has No Phasing
`BudgetManagement.MOCK_BUDGETS` carries `total/committed/spent` per project but **no monthly phasing**. You cannot ask "what is the November budget for Phase 1 North?" — the system has no answer. EVM is impossible without phased budgets.

---

## G. Fiscal Period Management & Period Close

### G.1 Structure Is OK; Controls Are Missing
`FiscalPeriodManagement`:
- 12 monthly periods with status (Open / Closed / Restricted / Future).
- Close checklist (BR-FIN-013) with 5 mandatory items.
- Override workflow for closed-period postings with justification.
- Year-end rollover wizard (Review → Lock Rates → Roll Balances → Activate FY2027).
- Opening balances modal.

Gaps:
- **No period within a year except calendar months**. Real fiscal calendars include 4-4-5, 4-5-4, 13-period (28-day), 52/53-week — common at telcos with retail-style reporting.
- **No fiscal-year configurability** — the FY-start dropdown exists in the header but doesn't relabel period names or change Q1-Q4 boundaries.
- **No period-close batch jobs**: depreciation run, FX revaluation, accruals reversal, intercompany reconciliation, allocation rules.
- **Override is gated by `RoleGate capability={CAP.configSystem}`** which is the right idea — but the override action just toasts success; it does not actually create a journal entry to the closed period nor log an audit trail.
- **The "Lock Exchange Rates" step in the wizard does literally nothing** — there is no rate table to lock.

### G.2 No Subledger ↔ GL Reconciliation
Standard SAP/Oracle finance close workflow is:
1. Sub-ledger close (AP, AR, Asset, Project) → reconcile to GL control accounts.
2. GL close → reconcile to trial balance.
3. Consolidation close → eliminate intercompany.

The module skips straight to "Close Period" → success toast.

---

## H. SLA / Penalty Engine

### H.1 SLA Template Manager Is Conceptually the Strongest Page
`SLATemplateManager` has the right shape:
- Template fields: sla_type, target_entity_type, technology_type, target_duration_hours, business_hours_flag, warning_threshold_percent, breach_threshold_percent, penalty_applicable, penalty_type, penalty_amount_per_unit, penalty_cap_percent, calendar_id.
- 4 calendars (Standard Business, Gulf, Global 24/7, UK).
- 3 penalty types (fixed_per_day, percent_of_contract, fixed_per_breach).
- Version tracking with history modal.
- Live threshold strip preview.

Gaps:
- **No actual SLA clock**. The "BR-FIN-014 clock pause/resume" on `SLAComplianceDashboard` is a button that toggles a local state; there is no underlying timer.
- **No calendar engine**. The 4 calendars are display strings, not actual business-hour tables.
- **No assignment from template → contract → measured entity workflow** that actually creates SLA instances and starts timers.
- **No escalation matrix** (who is notified at warning, at breach, at +X% over).
- **No bonus configuration** (early completion bonus is treated as a flat 1.5% of gross in `PaymentCertificateDetail`, no template).
- **No SLO/Indicator separation** (Google SRE-style SLO vs SLA — would be table-stakes for a modern SLA system).

### H.2 Penalty Auto-Creation Claim Is Misleading
`SLAComplianceDashboard.BREACHES` shows two breaches with `penaltyCreated: true` and a tag reading "BR-FIN-016: Created". There is no actual penalty record visible in any other screen; nothing in `VendorPaymentTracker.PAYMENT_HOLDS` nor `PaymentCertificateList.penalties` references these breaches.

### H.3 The Three Penalty Types Are Mechanically Different & Need Different Math
- `fixed_per_day` × overrun_days, capped at `penalty_cap_percent × contract_value`.
- `percent_of_contract` per breach event.
- `fixed_per_breach` flat.

None of these are computed. Penalty in certificates is `gross × random × 0.08`, completely disconnected from the SLA template parameters.

---

## I. Hardcoded Vendor Catalogue & Realism

### I.1 Vendor List Is Plausible But Inconsistent Across Pages

- `CapexExecutionDashboard.OVERRUN_HOTSPOTS` references: Nokia, Ericsson, Samsung.
- `VendorPaymentTracker.VENDOR_AGING/SUMMARY` references: Nokia, Ericsson, Samsung, Crown Castle, Mastec, SBA Comm, Black & Veatch, Quanta Services.
- `PaymentCertificateList.VENDORS` references: TowerBuild Corp, NetInstall Solutions, PowerGrid Systems, RF Experts Ltd, FiberLink Partners, QualityTest Pro, TransportWorks.
- `PurchaseOrderList.VENDORS` — same 7 fictional names as PaymentCertificateList.
- `OpexTrackerPage.VENDORS_BY_CATEGORY` references: GridPower Co, NationalGrid, DieselFuel Ltd, SolarOps, TowerCo Holdings, etc.
- `SLAComplianceDashboard.VENDORS` references: TowerBuild Corp, NetInstall Solutions, RF Experts Ltd, PowerGrid Systems, FiberLink Partners.
- `PaymentMilestoneConfig.MOCK_CONTRACTS` references: Ericsson AB, Nokia Corp, CommScope Inc, TowerBuild Corp, NetInstall Ltd, RF Experts Ltd, DataCore Systems, CivilPro Services.

So the same vendor appears with three different names across pages (e.g., "Nokia" / "Nokia Corp" / no Nokia at all on the PO list). **Vendor master integrity = zero.** A real telco vendor master has a single canonical Vendor ID with payment terms, tax IDs, contacts, bank details.

### I.2 Vendor List for Tier-1 RAN Procurement Is Plausible (Where Used)
Nokia, Ericsson, Samsung are the correct big-three RAN OEMs. Crown Castle and SBA Communications are correct major tower-cos. Mastec, Black & Veatch, Quanta Services are correct US tier-1 EPC contractors. CommScope is correct for DAS and structured cabling. The selection is more domain-credible than the rest of the app.

### I.3 Hex-Color Branding
`VENDOR_COLORS` in `VendorPaymentTracker` uses approximate brand colors (Nokia #005AFF, Ericsson #0082C9, Samsung #1428A0). This is cosmetic but a nice touch.

---

## I.b Working Capital & Cash Flow Management — Largely Absent

- **No DPO/DSO/DIO** (Days Payable Outstanding, Days Sales Outstanding, Days Inventory Outstanding) on any dashboard.
- **No supplier early-payment discount tracking** (2/10 net 30).
- **No payment run scheduling** with cash-position check.
- **No bank account balance integration**.
- The `VendorPaymentTracker.CashFlowForecast` is a static 6-month stacked area chart with hardcoded values per vendor category. Not derived from open invoices, open POs, scheduled milestones, or contract commitments.
- **No factoring/supply-chain finance integration**.

---

## I.c Profitability & Site-Level Economics

`RolloutEconomicsPage` is conceptually the most ambitious page and most empty of math:
- IRR values per site are static (29.2%, 18.6%, etc.) — no NPV computation, no discount rate, no terminal value.
- Payback months are hardcoded.
- "Revenue waterfall" categories are reasonable (Enabled / Delayed-Build / Delayed-Permits / Delayed-Integration / At-Risk) but values are static; no link to actual site-rollout status from any other module.
- "Acceleration opportunities" tile shows benefits like "+$87K net" but the underlying calculation (additional cost vs revenue unlocked) is not stored as configurable assumptions.
- **No customer-segment ARPU model**, no traffic-driven revenue model, no churn/penetration assumptions, no market share — all the things you actually need to defend a 5G investment case.

A real site-economics engine takes inputs (capex, monthly opex, traffic forecast, ARPU, EBITDA margin, depreciation life, discount rate) and computes NPV, IRR, payback, EVA. This page is **decoration on top of nothing**.

---

## I.d Integration with Site/RAN/Vendor Modules

There is no integration surface visible:
- `PaymentCertificateDetail.sites[]` lists fake site IDs (`SITE-0001` … `SITE-0009`) — not the actual site IDs used in the rollout module.
- `PurchaseOrderDetail.lineItems[].siteIds[]` similarly mints fake site IDs.
- Sites referenced in `CapexExecutionDashboard.OVERRUN_HOTSPOTS` are 2-letter state code + number (`TX-4421`, `NY-1102`) — different format from anywhere else.

A telco finance system **must** integrate with:
- Project Management (Sitetracker, Tarantula).
- HR (for cost-center labor allocation).
- Procurement (Ariba, Coupa).
- ERP GL (SAP S/4HANA, Oracle Fusion).
- Bank/Treasury (Kyriba, FIS).

Zero hooks visible.

---

## I.e UX / Visualization Quality

This is the redeeming dimension. The UI is **genuinely strong**:
- `FinancialDashboard` hero chart (Monthly Spend vs Budget area + line) with crosshair hover and variance tooltip — well above industry baseline.
- `CapexExecutionDashboard` S-Curve with PV/EV/AC overlay, today line, hover with SPI computation — best visual EVM I've seen in a non-PMI tool.
- `BudgetVarianceReport` grouped bar chart with 4-band variance color coding and rich hover tooltip — good.
- `VendorPaymentTracker` Invoice Aging horizontal stacked bars — clean and correct convention.
- `RolloutEconomicsPage` waterfall (target → enabled → delayed → realized) — visually compelling.
- `FinancialRiskHeatmap` market × risk-category heatmap — appropriate visualization for the question.
- `SLAComplianceDashboard` near-breach cards with pulse animation and countdown — useful.
- Density-aware columns via `useDensityColumns` and `WithDensity` — good architectural choice for tables.

UI weaknesses:
- Inconsistent color palette (purple #7c3aed and violet #7c3aed are reused as accent, but vendor brand colors conflict).
- Hardcoded business-rule reference codes (BR-FIN-001 through BR-FIN-019) scattered across copy. Auditable-looking but the rules they reference don't exist as enforceable code paths.
- Export buttons everywhere produce CSV/JSON blobs in the browser. No server-side export, no email delivery, no scheduled report distribution.

---

## SCORING (out of 100)

| Dimension                                | Weight | Score | Weighted |
|------------------------------------------|--------|-------|----------|
| A. Data model & domain integrity         | 15     | 2/10  | 3.0      |
| B. CAPEX/OPEX & IFRS compliance          | 10     | 1/10  | 1.0      |
| C. EVM correctness                       | 10     | 2/10  | 2.0      |
| D. Milestone / Retention / LD            | 10     | 3/10  | 3.0      |
| E. Cert / PO / 3WM workflow              | 10     | 2/10  | 2.0      |
| F. Budget & Variance                     | 10     | 3/10  | 3.0      |
| G. Fiscal Period & Period Close          | 8      | 3/10  | 2.4      |
| H. SLA / Penalty engine                  | 8      | 3/10  | 2.4      |
| I. Vendor master & integration           | 7      | 1/10  | 0.7      |
| J. Working capital & cash flow           | 6      | 1/10  | 0.6      |
| K. Profitability / IRR / NPV             | 4      | 1/10  | 0.4      |
| L. UX, visualisation, accessibility      | 2      | 9/10  | 1.8      |
| **TOTAL**                                | 100    | -     | **22.3** |

**Overall: 22/100 — Demo-ready front-end on a hollow domain core. Not deployable in a regulated finance environment.**

Benchmark comparisons:
- vs **SAP S/4HANA Public Cloud Finance**: this module covers ≤ 5% of the functional surface.
- vs **Oracle Fusion ERP Cloud (Project Financials + Procurement + Payables + Asset Management)**: ≤ 4%.
- vs **Workday Financials**: ≤ 6%.
- vs **Sitetracker Finance** (best-of-breed telecom-specific): ≤ 15%. Sitetracker has real PO, real 3WM, real milestone billing, real retention release, real vendor portal.
- vs **Microsoft Dynamics 365 F&O**: ≤ 4%.

---

## TOP 10 PRIORITY FIXES

Ordered by impact-to-credibility ratio for a CFO-level demo.

### 1. Unify the Number Across Dashboards (P0, 1-2 wk)
Single source of truth: pick one mock store (recommended: a `financialStore.ts` exporting canonical FY-2026 totals, monthly phasing, budget per project, vendor balances). Re-derive all KPI tiles, area charts, and tables from that store. Eliminate the embarrassing $47.2M-vs-$33.6M-vs-$50.7M three-number-for-same-FY problem.

### 2. Real EVM Math (P0, 1 wk)
Replace hardcoded `PLANNED_VALUE/EARNED_VALUE/ACTUAL_COST/CPI` with derived metrics from the unified store. Compute SPI = EV/PV, CPI = EV/AC, EAC = BAC/CPI, TCPI = (BAC−EV)/(BAC−AC), VAC = BAC−EAC. Show all six in the KPI band. Per-market CPI must be back-derived from per-market `spent/earned` not invented.

### 3. CAPEX/OPEX Classification Engine (P1, 2 wk)
Replace `rand() > 0.3 ? CAPEX : OPEX` with a rule table:
- Asset class × cost category × materiality threshold → CAPEX/OPEX.
- Reference IAS 16 / IFRS 16 / ASC 842 in tooltips.
- Make the rule editable in a config screen.
- Surface a per-cost-entry override with audit-logged justification.

### 4. Three-Way Match (P1, 2-3 wk)
Add `GoodsReceiptNote` entity. On invoice approval:
- Verify PO line item exists and is approved.
- Verify cumulative invoiced qty ≤ PO qty × tolerance (typ. 10%).
- Verify GRN exists with received qty ≥ invoiced qty.
- Verify invoice unit price = PO unit price × price-tolerance.
- Block approval and surface the specific exception that failed.

### 5. Retention & Liquidated Damages as First-Class Contract Terms (P1, 1-2 wk)
Add to `Contract` entity:
- Retention %, retention release schedule (e.g., 50% on FA, 50% on DLP+12mo).
- LD: rate ($/day or %/week), max cap (typ 10%), start trigger (planned vs actual).
- Mobilization advance %, recovery schedule, APG/PBG references.
- Surface a `RetentionRegister` page showing held amount, scheduled release dates, release status.

### 6. SLA Clock Engine (P1, 2 wk)
Implement an actual timer:
- `SLAInstance` record with start/end/elapsed/paused/breached fields.
- Job that recomputes elapsed every minute, fires warning at threshold%, fires breach at 100%, auto-creates a `PenaltyAccrual` per the template's penalty_type.
- Calendar-aware (subtract non-business hours).
- Wire `PaymentCertificateDetail.linkedSLABreaches` to real `SLAInstance` records.

### 7. Vendor Master & Contract Aggregate (P1, 1 wk)
- Single `Vendor` table (vendor_id, name, tax_id, payment_terms, default_bank, currency, status).
- Reuse across PO, certificate, milestone-config, OPEX entry, vendor-payment-tracker.
- Add a `Contract` aggregate linking vendor + project + value + milestone schedule + SLA template + retention/LD terms + PBG/APG.
- One vendor name spelling, app-wide.

### 8. Authority Matrix Enforcement (P1, 0.5 wk)
- Wire `AUTHORITY_MATRIX` thresholds into approve buttons.
- Read current user role/cap; disable approve when amount > authority.
- Show "Pending VP Approval" status when above current user's threshold.
- Audit-log every approval with user, timestamp, capability, amount.

### 9. Persisted State + Audit Log (P1, 1-2 wk)
- All mutations (close period, freeze budget, approve cert, raise dispute, override closed period) must write to a `LedgerEvent` log (timestamp, user, entity, action, before/after).
- Surface the log in `FiscalPeriodManagement`'s Activity tab from real events, not the hardcoded `ACTIVITY_LOG` array.
- Persist mock state across page reloads (localStorage is sufficient for the demo).

### 10. Multi-Currency + FX Rate Table (P2, 1 wk)
- `CurrencyRate` table with from/to/rate/effective_date.
- `Vendor.currency` and `Contract.currency`.
- All sums show in functional currency (USD) but display original currency too.
- FX gain/loss surfaced as a separate line on the variance report.
- Wire the year-end-rollover wizard's "Lock Exchange Rates" step to actually snapshot the rate table.

### Stretch (P3, post-MVP)
- Asset register with depreciation runs.
- CWIP balance + capitalization workflow.
- Real NPV/IRR/payback in `RolloutEconomicsPage` (DCF with discount rate, traffic-driven revenue model).
- Tax engine (multi-jurisdiction, WHT, reverse charge).
- Vendor portal for invoice submission (eliminates 3WM data entry burden).
- Integration adapters to SAP/Oracle GL.

---

## Bottom Line

The Financial module showcases excellent visual craft (charts, hover states, KpiTiles, density-aware tables) over a near-empty domain model. For a CFO walking through the demo it would impress for the first 90 seconds and unravel at the first question: "Why does Dashboard say $47.2M and Capex Execution say $33.6M?" Get the numbers consistent and add the top-6 priority fixes above and this jumps from 22/100 to a credible 55-60/100. The remaining gap to a real ERP-replacement is multi-year work.

Files reviewed (absolute paths):
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/FinancialDashboard.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/FinancialDashboardHub.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/CapexExecutionDashboard.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/OpexTrackerPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/BudgetManagement.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/BudgetVarianceReport.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/FiscalPeriodManagement.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/FinancialDetailPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/FinancialListPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/FinancialRiskHeatmap.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/PaymentCertificateList.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/PaymentCertificateDetail.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/PaymentMilestoneConfig.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/PurchaseOrderList.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/PurchaseOrderDetail.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/VendorPaymentTracker.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/RolloutEconomicsPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/SLAComplianceDashboard.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/financial/pages/SLATemplateManager.tsx
