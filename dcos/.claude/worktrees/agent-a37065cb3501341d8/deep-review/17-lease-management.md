# Lease Management Module — Deep Enterprise Review

**Reviewer perspective:** 20+ years managing 100K+ tower/site leases across major TowerCos (American Tower, Crown Castle, SBA, Cellnex, Helios) and Tier-1 operators. Benchmark systems: Visual Lease, LeaseAccelerator, CoStar Real Estate Manager, Sitetracker Lease, Yardi Voyager Commercial, Nakisa Lease Administration.

**Scope:** 17 lease-management pages totaling ~5,700 lines covering portfolio dashboard, lease detail, list, create wizard, by-site-type drill, payment dashboard, payment record, escalation dashboard, amendments, disputes, renewals, terminations, negotiation tracker, financial summary, KPI dashboard, alert config, hub.

---

## A. Domain Model Fidelity (IFRS 16 / ASC 842 Compliance)

The `LeaseRecord` interface is **commercially comprehensive but accounting-incomplete**. It captures the operational terms a TowerCo administrator needs — base rent, escalation type/rate/frequency, security deposit, insurance min coverage, property tax responsibility, renewal/termination notice days, early termination penalty, auto-renewal flag, exclusivity, sublease rights, amendment count, legal review status — but is **missing the IFRS 16 / ASC 842 lease accounting layer that any TowerCo or Tier-1 operator is legally required to maintain post-2019**:

- **No Right-of-Use (ROU) asset value** — The cornerstone of IFRS 16. Without this, the platform cannot produce balance-sheet disclosures.
- **No Lease Liability** (present value of remaining payments).
- **No Incremental Borrowing Rate (IBR) / discount rate** field — IFRS 16 §26 requires this; without it, no NPV calculation is possible.
- **No lease classification** (Operating vs Finance under ASC 842 / Type A vs Type B).
- **No initial direct costs**, **lease incentives**, or **prepayments**.
- **No depreciation schedule** for the ROU asset (typically straight-line over lease term).
- **No interest expense schedule** (effective interest method on liability).
- **No remeasurement triggers** (modification, reassessment of options, index changes).
- **No commencement date vs lease execution date** distinction — only `startDate` exists, ignoring the difference between contract signing and IFRS 16 commencement (asset available for use).
- **No short-term lease exemption flag** (<12 months) or **low-value asset exemption** (IFRS 16 §5–6).
- **No journal-entry generation hooks**, no GL account mappings, no integration touchpoints with SAP/Oracle/Workday Finance.

This is the single biggest gap. Visual Lease and LeaseAccelerator both have this layer as their commercial reason to exist. Without it, the module is a **lease *administration*** tool, not a **lease *accounting*** tool — which is exactly the line where CFOs reject a system.

Other domain-model gaps:
- **No Master Lease Agreement (MLA) vs Site Lease Agreement (SLA) distinction** — TowerCos operate under MLAs with major operators (e.g. AT&T MLA at American Tower) where individual sites are SLAs/site supplements. The model treats every lease as standalone; no parent–child MLA→SLA hierarchy, no MLA-level term governance.
- **CPI index reference is captured at escalation time** (`EscalationRecord.cpiIndex`) but **not at lease setup** — there is no `cpiIndexReference` (e.g., "US-CPI-U-NSA", "UK-RPI", "Eurostat HICP", "India-WPI") on the `LeaseRecord` itself. Without it, CPI escalation cannot be reliably auto-calculated.
- **No cap/floor (collar) on CPI escalation** — TowerCo MLAs almost always have "CPI, capped at 4%, floored at 2%". Missing.
- **No renewal option structure** — `autoRenewal: boolean` is binary, but real leases have "two 5-year renewal options at landlord's election" or "5+5+5" patterns. There is no `renewalOptions: { count, durationMonths, atWhoseOption }[]` array.
- **No co-tenant / sub-tenant revenue tracking** — TowerCos earn revenue from co-locating other carriers; that's the whole business model. Not modeled.
- **No ground rent vs roof rent split** for rooftop leases (some markets treat them differently for property tax).
- **No revenue share clause** (% of gross billings paid to landlord — common in DAS venues).
- **No restoration/decommissioning obligation accrual** (ASC 410-20 / IAS 37) — companies must accrue site-restoration liability over the lease term.
- **No FX hedging / functional currency vs reporting currency** — multi-currency portfolio just uses spot FX (`FX_RATES`); no forward rates, no hedge effectiveness.

---

## B. Page-by-Page Evaluation

### 1. `LeaseDashboard.tsx` (810 lines)
**Strengths:** Genuinely well-built — hero KPI row with sparklines, 18-month expiring-leases SVG timeline (urgent/warning color zones), region treemap, status distribution, BR-LSM-* alert mapping, site-type rollup grid, expiry waterfall (5 buckets), attention list with composite urgency scoring. The expiring-timeline hero viz is the right answer to "what should I worry about". `useDensityColumns` integration and `RoleGate` wrapping show platform-citizenship discipline.

**Issues:** (1) Two parallel default exports (`LeaseDashboardBody`, `LeaseDashboardPage`) plus the hub re-importer — duplicates header state (`refreshTick`, `period`, `lastRefresh`) and risks divergent state when both render. (2) `paymentCompliancePct` is computed on **active leases only**, but Suspended/Notice-Period/Renewal leases can still be overdue — formula understates risk. (3) Sparkline data is **synthetic** (sine waves, linear ramps) not derived from real history, which would mislead an executive. (4) Hero `period` selector is non-functional: changing MTD/QTD/YTD does **not** recompute any metric. (5) `expiringTimeline` uses `Math.floor((monthStart - now) / 86400000)` which fails across DST transitions. (6) Expiry waterfall buckets are hard-coded — should be configurable per region (different statutory notice regimes).

### 2. `LeaseDetailPage.tsx` (573 lines)
**Strengths:** Excellent 7-tab IA (Overview, Payments, Renewal, Amendments, Disputes, Activity, Escalations as overflow); composite health score formula; hero stripe with KPI chips; print/export/edit actions; termination modal explicitly warns of early-termination penalty and notice period. Empty states are well-handled.

**Issues:** (1) `healthScore` formula (`100 − min(40, overdueDays×1.5) − 20*(daysToExpiry<90) − 25*(non-compliant) − 10*(at-risk) − 5*disputes`) is **undocumented and not configurable** — different orgs weight risk differently; no test coverage for boundary conditions. (2) Penalty for overdue caps at 40 points after ~27 days; truly delinquent leases (180+ days overdue) score the same as 30-day overdue. (3) Tabs hard-code 7 entries but the model also tracks insurance, deposit, legal review — no separate **Compliance** or **Documents** tab. (4) No **Lease Abstract** view (the one-page PDF summary every property manager uses). (5) No **Audit Trail** of who changed what when (ActivityLogTab is generic, not field-level diff). (6) No landlord 360 — clicking landlord name does nothing; landlord ID never resolves. (7) Print action calls `window.print()` against the live page including the dark hero — print CSS not authored. (8) Export action only emits JSON, no PDF lease abstract.

### 3. `LeaseListPage.tsx` (774 lines)
**Strengths:** Four view modes (Table/Cards/Calendar/Map), 8 quick-filter tabs with live counts, multi-select filters with URL sync (`useFiltersInUrl`), saved views, CSV export, real Leaflet map with city clustering, 27-month calendar heatmap with intensity legend. Genuinely polished.

**Issues:** (1) Table density helper is wired but **filter chips don't show active filter count** in the header. (2) Cards view shows escalation `%` but not whether escalation is overdue. (3) Calendar view collapses leases to month resolution — no granular day view. (4) Map relies on hard-coded `CITY_COORDS` lookup — any city not in the dictionary silently disappears (no warning). (5) The "Insurance Issues" tab counts non-compliant *and* at-risk, but the "Health" column visual only flags non-compliant. (6) `paymentRiskScore` is a property on the record but the formula behind it isn't visible/documented in the UI; users see `100 − paymentRiskScore` as "Health" with no explanation. (7) No **bulk actions** (select multiple → bulk renewal trigger, bulk export, bulk re-assign). Tier-1 portfolios of 50K+ leases need this.

### 4. `LeaseCreatePage.tsx` (382 lines)
**Strengths:** Clean 5-step wizard (Site & Landlord, Terms, Financial, Compliance, Documents), reasonable defaults (90d notice, 3% escalation, Annual), proper RoleGate around submit/save-draft.

**Issues:** (1) **Site lookup is fake** — generates `SITE-0001..SITE-0030` synthetically rather than reading the canonical Site Inventory module. Landlord lookup is a free-text input rather than a typeahead against a landlord master. (2) **No duplicate detection** — two leases on the same site+landlord can be created silently. (3) **Missing critical fields:** lease accounting classification (operating vs finance), discount rate, CPI index reference, escalation cap/floor, renewal option chain (count × duration × at-whose-option), revenue-share %, restoration obligation, sublease rights, exclusivity radius, GL coding. (4) Document upload is `beforeUpload={() => false}` — no real upload, no virus scan, no e-signature integration (DocuSign, AdobeSign). (5) Form does not validate `endDate > startDate` or `durationMonths == months between`. (6) Currency picker is just dropdown — no FX rate locking, no functional-currency reminder. (7) "Save as Draft" navigates to `/leases` without actually persisting — silent data loss. (8) Submit shows `message.success` then immediately navigates — no error path, no real backend integration.

### 5. `LeaseBySiteTypePage.tsx` (361 lines)
**Strengths:** Type-specific KPIs, sparkline trend, search, "New {SiteType} Lease" deep link, CSV export. Conceptually right.

**Issues:** (1) `rentSparkData` is synthetic (`base * (0.9 + i * 0.012)`) — not real history. (2) Healthy % donut formula `((leases − expiring90 − overdue) / leases) × 100` double-counts a lease that is both expiring AND overdue. (3) Annual commitment shows `totalRent × 12` — ignores escalation effects on annual run-rate. (4) Renew button only appears for `daysToExpiry < 365 && > 0` — but expired leases (negative days) should also show "Initiate Renegotiation" or similar. (5) No segmentation by lease classification (operating vs finance), term length, escalation type within the type.

### 6. `PaymentDashboard.tsx` (271 lines)
**Strengths:** Stacked bar showing Paid/Due/Overdue/Scheduled distribution; per-region rollup bars; segmented status filter; in-line Record action for due/overdue rows.

**Issues:** (1) **No AR aging buckets** (0–30, 31–60, 61–90, 90+) — this is THE fundamental AR/AP report. (2) **No DSO / Days Sales Outstanding** metric. (3) No **dispute → withhold** workflow visible: a payment can be `Disputed`, but the dashboard counts it generically. (4) Per-region rollup divides by `max` (largest region) which means tiny regions get tiny bars even if 100% overdue — % paid by region would be more honest. (5) No **bank file generation** (ACH/SEPA NACHA/Bacs) for batch payment runs. (6) No **payment vs schedule variance** report (paid amount ≠ scheduled amount). (7) Record button takes you to a single-payment form — no batch reconcile.

### 7. `PaymentRecordPage.tsx` (230 lines)
**Strengths:** Match-to-scheduled-payment select, payment date/amount/method, bank ref + invoice number, document upload, side-panel breakdown showing rent/tax/insurance/other.

**Issues:** (1) **No variance handling** — if `amount paid ≠ totalAmount`, the form does not prompt for partial-payment, overpayment-credit, or short-pay reason. (2) **No multi-period reconciliation** — a lump-sum payment covering 3 months cannot be split across 3 PaymentRecord rows. (3) Method enum is fixed; no extension for wire/check#/card last4. (4) No withholding tax / VAT input — required in many jurisdictions. (5) No reverse/void action. (6) Submit only `message.success` + done — no idempotency key, no race against duplicate clicks.

### 8. `EscalationDashboard.tsx` (343 lines)
**Strengths:** Three-status workflow (Pending Approval / Pending CPI / Approved), local override state for Approve/Reject/Refresh CPI actions, yearly avg escalation rate SVG trendline, CPI Data Status side card with "Refresh CPI" CTA.

**Issues:** (1) The "Refresh CPI" CTA on the side card is **fake** — `message.success('CPI fetch triggered (mock)')` — no actual CPI feed wiring (FRED, ONS, Eurostat APIs). (2) **No cap/floor visible** — if the lease has "CPI capped 4% floored 2%", the displayed `rateApplied` should be the capped value with the uncapped CPI shown alongside; missing. (3) **No backstop / rounding rules** (some leases round CPI to nearest 0.25%). (4) Approval is single-step — no maker-checker (4-eyes) where the requester ≠ approver. (5) No **bulk approve** for routine fixed-percent escalations. (6) No **post-escalation notification** to landlord generated. (7) Yearly trend chart hides outliers — no min/max bands.

### 9. `AmendmentFormPage.tsx` (221 lines)
**Strengths:** Five amendment types with descriptions/impacts, prior-amendments side card, Save-as-Draft persists to `localStorage`, submit-for-approval workflow.

**Issues:** (1) Amendment types are hard-coded enum strings; cannot extend without a code change. (2) **No structured "Before/After" diff** — `previousValue` and `newValue` are plain text inputs; should be field-aware (if Rent Change → numeric, if Term Extension → date picker). (3) **No amendment cascade** — a Rent Change does not regenerate the payment schedule or escalation schedule from the effective date. (4) No **DocuSign integration** for the amendment PDF. (5) No approval chain (single approver vs commercial/legal/finance multi-sign). (6) Draft save uses string key `lease.amendment.draft.{leaseId}` — collides if multiple draft amendments per lease.

### 10. `DisputeListPage.tsx` (352 lines)
**Strengths:** Genuine dispute lifecycle (Open → In Progress → Escalated → Resolved/Closed), local overrides for Resolve/Escalate/Extend that actually mutate visible state, dispute creation modal, detail view with activity timeline, "Escalate to Legal" CTA.

**Issues:** (1) **Timeline is mock** — 4 fixed steps (opened, assigned, contacted, last activity) regardless of actual dispute history. (2) No **document attachments per dispute** (correspondence, invoices, photos). (3) No **financial impact tracking** — withheld payment, ledger entries, write-offs. (4) No **assigned-to assignment** UI — locked to "Lease Operations". (5) No SLA breach indication when `daysOpen` exceeds policy. (6) "Escalate to Legal" sets status to Escalated but does not create a legal-case record or notify counsel. (7) No links to underlying payment(s) when dispute type is Rent Disagreement.

### 11. `RenewalWorkflowPage.tsx` (349 lines)
**Strengths:** Dual-mode (single-lease tracker + portfolio view), Steps visualization (Proposal → Negotiation → Agreement → Execution), negotiation log with append-only notes, proposed-terms form pre-filled with current+5%, delta column in portfolio table.

**Issues:** (1) **No multi-round counter-offer ladder** — only one "proposed new rent" / "agreed rent" pair; the LeaseNegotiationTracker page has a proper ladder but is in the *acquisition* module, not used here. (2) **No BATNA reference** — market-rate benchmark / comparable analysis missing. (3) No automated escalation when `daysToExpiry < 30` and renewal not started. (4) No **renewal options chain** — if MLA has "2 × 5yr options at tenant's election", that should appear as discrete buttons. (5) Negotiation log notes are session-local (`useState`) — lost on navigation. (6) No e-sign integration. (7) Portfolio view does not show `Lapsed` count distinct from `Auto-renewed`.

### 12. `TerminationWorkflowPage.tsx` (321 lines)
**Strengths:** Genuinely good 5-step wizard (Notice Validation → Delivery → Site Clearance → Deposit Return → Final Closeout) with notice-period math, accept-penalty checkbox when notice insufficient, checklist for equipment removal/cabling/structural/landlord sign-off, deposit refund computation.

**Issues:** (1) `Form.useWatch('terminationDate')` returns the raw value; `new Date(reqDate)` may fail with Dayjs object — needs `.toDate()` or `.format()` guard. (2) **No restoration cost estimation** — the deposit deductions field accepts a number but provides no breakdown (labor, materials, hazmat). (3) **No final lease abstract / closeout PDF** generated. (4) No **post-termination obligations** tracking (surviving indemnities, environmental clean-up, etc.). (5) "Tracking / Confirmation #" is a free-text field with no validation against carrier formats (USPS, FedEx, DHL). (6) Cannot save mid-workflow and resume later — refresh = restart. (7) Final step `confirmFinal` is a single checkbox; no second-approver requirement.

### 13. `LeaseNegotiationTrackerPage.tsx` (987 lines)
**Surprise discovery:** This page belongs to the **site-acquisition** module (it uses `useEntityDetail('candidates', id)`, breadcrumbs to `/acquisition`, validates against `BR-SAQ-006` thresholds). It is **mis-filed** in `/lease-management/pages/` and operates pre-execution, not post-execution. The fact that the renewal workflow page does *not* re-use this beautiful offer-ladder timeline (with delta indicators, party color coding, threshold validation) is a missed opportunity. **Strengths:** Best offer-ladder visualization in the whole codebase. Threshold validation against BR-SAQ-006 with pass/borderline/fail states. Add Round / Update Terms / Approve / Escalate modals with real persistence via `useLeaseNegotiationActions`.

**Issues for this module:** (1) **Wrong home** — should live in site-acquisition, with a *renewal-flavored* variant adapted for lease-management. (2) Approve modal references `getLeaseTermThresholds` which is also SAQ-flavored. (3) Negotiator and Counsel hard-coded ("Maria Garcia", "Anderson Legal LLP").

### 14. `FinancialSummaryPage.tsx` (227 lines)
**Strengths:** Multi-currency FX conversion table (USD-normalized), 5-year forecast with 4% growth assumption, site-type spend treemap (click-to-drill), Top-10 leases by rent.

**Issues:** (1) **No NPV / IFRS 16 liability roll-forward** (the actual finance deliverable). (2) **No straight-line rent** computation (ASC 842 / IFRS 16 op-lease P&L recognition). (3) Forecast assumes 4% flat — should use actual escalation rates from each lease. (4) FX uses spot only — no forward-rate hedge, no FX-hedge accounting. (5) No **budget vs actual variance** — `budgetVariance` is on the record but never shown. (6) Top-10 doesn't surface concentration risk percentages.

### 15. `KPIDashboard.tsx` (202 lines)
**Strengths:** Eight metric blocks (Monthly Spend, Avg Rent, Renewal Success, Overdue, Escalations/mo, Amendments/mo, Active Disputes), site-type health donuts.

**Issues:** (1) All trend data is **synthetic** (`overdueTrend = [12,10,8,11,9,7,6,8,5,4,6, actual]`) — misleading. (2) `renewalSuccess = 78` hard-coded. (3) Missing critical KPIs: **WAULT (Weighted Average Unexpired Lease Term)**, **average rent per sqm/sqft**, **same-store rent growth**, **lease accounting movement (additions, modifications, terminations)**, **AR aging**, **DSO**. (4) Health-by-Site-Type calculation `1 − (overdue + expiring) / count` double-counts again.

### 16. `AlertConfigPage.tsx` (178 lines)
**Strengths:** Configurable expiry thresholds (180/90/60/30), overdue escalation days, insurance expiry slider (range), rent review days, CPI staleness threshold, budget threshold %, notification channels (email/inapp/sms/slack/teams). Persists to `localStorage`.

**Issues:** (1) **Global config only** — cannot configure per-region or per-MLA (large operators need different thresholds per portfolio). (2) **No alert delivery preview** — what does the email look like? (3) No **escalation chain** beyond "+ Program Manager" (e.g., regional ops → country lead → director). (4) `localStorage` is per-browser; no server-side persistence; no audit trail of config changes. (5) Initial values are set in both `initialValues` and `Switch defaultChecked` — they will diverge under Form control. (6) No CC/BCC lists, no quiet-hours, no language localization.

### 17. `LeaseDashboardHub.tsx` (47 lines) — STUB
This is a hub that simply renders four tabs (Operational / Payments / Escalations / Financial). It is a thin shell — **does not deduplicate KPIs across tabs**, **does not provide a unified header period selector that cascades down**, **does not surface cross-tab drill-down**. The four child dashboards each render their own `*Body` with internal state — no shared store, no shared refresh, no shared filters. As a *stub for the eventual hub experience*, it's fine; as a shipped IA, it's a missed opportunity for executive consolidation.

---

## C. Data Integrity & Calculation Accuracy

- **`paymentCompliancePct`** scope is "Active leases only" but the message reads "Payment Compliance" — implies portfolio-wide. Honest label would be "Active Lease Compliance".
- **`healthScore`** in detail page (composite) and **Health %** in list page (`100 − paymentRiskScore`) and **healthPct** in KPI dashboard (`1 − (overdue + expiring) / count`) are **three different formulas** for "health" with no documentation or reconciliation. Users will see different numbers across screens for the same lease portfolio.
- **`pendingApprovalCount`** in `EscalationDashboard` outer page is computed from raw `allEscalations` (which doesn't include the local `statusOverrides`) but inner `EscalationDashboardBody` uses the override-aware computation — the hero chip will drift from the table after an approval action.
- **`rentValue at risk`** in expiry waterfall sums `currentRent` (monthly) but presents it without the "/mo" suffix — risk of being misread as annual.
- **Escalation `rateApplied`** is stored but **never CPI-cap-adjusted** — if a lease has "CPI capped at 4%" and CPI is 7%, the system shows 7% which would over-bill the operator.
- **FX rates** (`FX_RATES`) are **hard-coded constants**, never refreshed; no rate-date stamp. Multi-currency totals are stale by design.
- **`amendmentCount`** is denormalized on the record; if amendments are added but record not bumped, count drifts.

---

## D. Workflow Completeness

| Workflow | Status |
|---|---|
| Create | Present (5-step wizard, mock submit) |
| Edit terms | Routed to /amendment/new instead of true edit (correct — amendments are how leases change) |
| Renew (with multi-round negotiation) | Single-round only; multi-round lives in mis-filed negotiation tracker |
| Terminate | 5-step wizard, well-modeled |
| Amend | Form present, no cascade to schedules |
| Record payment | Single payment only; no batch, no variance |
| Escalate rent | Workflow present, no cap/floor, no maker-checker |
| Raise dispute | Present, no document attachment, no payment linkage |
| Compliance certificate refresh | Not modeled — no upload-insurance-cert flow |
| Sublease / co-tenant onboarding | **Missing entirely** |
| Lease portfolio bulk import (CSV/XLS) | **Missing entirely** |
| Lease abstract generation | **Missing entirely** |
| Landlord portal (vendor self-service) | **Missing entirely** |
| Bank file generation (ACH/SEPA) | **Missing entirely** |
| Journal entry export to GL | **Missing entirely** |

---

## E. Accessibility, i18n, Mobile

- All status colors rely on color alone (red/orange/green) — no shape or pattern; fails WCAG 2.1 SC 1.4.1.
- Currency formatting is hard-coded with prefix symbols; no Intl.NumberFormat; doesn't render correctly for currencies needing suffix (e.g., CHF) or RTL languages.
- Dates are ISO strings; no localization (e.g., DD/MM/YYYY for EU).
- Hero KPI chips use 20px+ text but the explanatory labels are 10–11px — borderline AA for sub-text contrast.
- No mobile-specific layout — 7-tab detail page will horizontal-scroll on mobile.
- No skip-to-content links, no aria-live regions for the AlertBanner.

---

## F. Performance & Scale

- `LEASES.forEach((l) => getPaymentsForLease(l.id).forEach(...))` in `PaymentDashboard` is O(N×M) without memoization invalidation on lease change. On a 50K-lease portfolio with 12 payment periods each, this is 600K objects rebuilt on every render.
- No virtualization on tables (Ant `Table` with `pagination` is fine for 12-row pages, but no `react-window` for the underlying data).
- `useMemo` is liberal but several memos depend on closed-over module constants (`LEASES`, `BY_REGION`) that **will not invalidate** when real data lands behind a hook.
- Leaflet map renders all city markers; no clustering algorithm (despite the variable name `cityClusterData`).
- SVG hero timeline re-renders entirely on any parent state change.

---

## G. Code Quality & Architecture

- Strong: TypeScript types throughout, consistent use of `GlassCard`, `KpiTile`, `SectionHeader`, `PulseDot`, `TrendBadge`, `DashboardHeader` shared primitives. `useDensityColumns` + `RoleGate` show platform discipline.
- Weak: Heavy inline styling (hundreds of inline `style={{}}` objects per page) — should be extracted into styled components or design tokens; difficult to enforce design consistency.
- Duplicated logic: `fmtCurrency` is redefined in **every page** with slightly different signatures.
- `LeaseDashboardPage` and `LeaseDashboardHub` both wrap `<LeaseDashboardBody>` — state in `LeaseDashboardPage` (`refreshTick`, `period`, `lastRefresh`) is dead code because the body version drives its own state.
- No tests visible in this folder. No Storybook stories. No screenshot regression baselines.

---

## H. Comparison vs Best-in-Class

| Capability | This Module | Visual Lease | LeaseAccelerator | Sitetracker | Yardi Voyager |
|---|---|---|---|---|---|
| IFRS 16 / ASC 842 accounting | ✗ | ✓ | ✓ | Partial | ✓ |
| ROU asset + liability roll-forward | ✗ | ✓ | ✓ | ✗ | ✓ |
| MLA → SLA hierarchy | ✗ | ✓ | ✓ | ✓ | ✓ |
| CPI auto-fetch + cap/floor | Mock | ✓ | ✓ | Partial | ✓ |
| Multi-round renewal negotiation | Partial | ✓ | ✓ | ✓ | ✓ |
| Multi-currency with hedge accounting | Spot only | ✓ | ✓ | ✗ | ✓ |
| Co-tenant revenue (TowerCo) | ✗ | Partial | ✗ | ✓ | ✗ |
| Landlord portal | ✗ | ✓ | ✓ | ✓ | ✓ |
| E-signature (DocuSign/AdobeSign) | Mock | ✓ | ✓ | ✓ | ✓ |
| Bank file generation (ACH/SEPA) | ✗ | ✓ | ✓ | Partial | ✓ |
| Lease abstract auto-gen | ✗ | ✓ | ✓ | ✓ | ✓ |
| Bulk operations | ✗ | ✓ | ✓ | ✓ | ✓ |
| Modern visual polish | ✓✓ (better) | ✗ | ✗ | ✓ | ✗ |

The UX layer of this module is **better than all five competitors**; the depth of the data model and the workflows is **materially below all five**.

---

## I. Security & Audit

- No field-level audit trail — `ActivityLogTab` is generic.
- Documents accept any file (`beforeUpload={() => false}`) — no MIME sniffing, no virus scan.
- `localStorage` used for alert config + amendment drafts — bypasses any audit/approval logging.
- `RoleGate` is wrapped on submit actions but **not on view actions** that expose financial data — every role can see all lease P&L.
- No row-level security visible (region-scoped access for regional ops leads).
- No SOX-compliant change log on financial fields (rent, escalation rate, deposit).

---

## SCORING (out of 10)

| Dimension | Score | Rationale |
|---|---|---|
| UX / Visual Polish | 9.0 | Best-in-class hero, treemap, expiry timeline, density mgmt |
| Domain Model Completeness | 4.5 | Operational fields good; IFRS 16, MLA→SLA, options chain absent |
| Workflow Coverage | 5.5 | Lifecycle workflows present but shallow; many "mock submit" stubs |
| Calculation Accuracy | 5.0 | Three contradictory "health" formulas; synthetic trend data |
| Data Integrity | 5.5 | Local-state overrides don't propagate to outer hero KPIs |
| Performance & Scale | 5.0 | No virtualization, O(N×M) aggregations, no real backend pagination |
| Accessibility | 4.0 | Color-only status, no a11y testing visible |
| Security / Audit | 3.5 | No field audit, no row-level security, mock e-signing |
| Architecture / Code Quality | 6.5 | Strong TS types & shared primitives; duplicated `fmtCurrency`, inline styles |
| Competitive Parity (vs Visual Lease etc.) | 4.5 | UX leads competitors; accounting depth lags materially |

**Overall: 5.3 / 10** — A visually superior **lease administration** demo that is **not yet a lease accounting platform**. CFO/Controller would reject; Property Manager would adopt the UI.

---

## TOP 10 PRIORITY FIXES

1. **Add IFRS 16 / ASC 842 accounting layer.** Introduce `LeaseAccountingRecord` with `commencementDate`, `discountRate` (IBR), `rouAssetInitialValue`, `leaseLiabilityInitialValue`, `classification` (operating/finance), `straightLineRent`, plus monthly amortization schedule (ROU depreciation + interest expense). Surface a new "Accounting" tab in the detail page with the liability roll-forward and a downloadable journal-entry batch. Without this, no enterprise CFO will buy.

2. **Model MLA → SLA hierarchy.** Add `parentLeaseId: string | null` (and a `LeaseRecord.kind: 'MLA' | 'SLA' | 'Standalone'`). Inherit MLA terms by default; allow per-SLA overrides. Add an MLA Portfolio page showing all SLAs under each MLA. Critical for TowerCo and large operator deployments.

3. **Reconcile the three "health" formulas.** Pick one canonical composite score, document it in the data layer (`leaseData.ts`), expose its weights as configurable per tenant in AlertConfig, and use it everywhere (detail page, list page, KPI dashboard, by-site-type). Display a tooltip showing the formula breakdown on hover.

4. **CPI integration with cap/floor.** Add `cpiIndexReference`, `cpiCap`, `cpiFloor`, `cpiSource` fields on `LeaseRecord`. Replace the mock "Refresh CPI" toast with a real adapter pattern (`CpiProvider` interface) and ship stub adapters for FRED (US), ONS (UK), Eurostat (EU), India CPI. Display the uncapped index + the capped rate side-by-side in the escalation modal.

5. **Renewal multi-round negotiation ladder.** Port the gorgeous offer-ladder UI from the mis-filed `LeaseNegotiationTrackerPage` into a *renewal-flavored* component inside `RenewalWorkflowPage`. Add `renewalOptions: { count, durationMonths, atWhoseOption }[]` to support 5+5+5 structures, and surface them as discrete buttons.

6. **Lease abstract PDF generation.** One-page printable summary with all commercial terms, key dates, payment schedule preview, escalation profile, contact info. Wire to React-PDF or server-side renderer. Every property manager needs this on day one.

7. **Field-level audit trail + row-level security.** Replace the generic `ActivityLogTab` with a true diff log capturing `field`, `oldValue`, `newValue`, `who`, `when`, `reason`. Add region-scoped read permissions on `RoleGate` so regional operators only see their portfolio.

8. **Real-data trend lines + WAULT/DSO/AR Aging KPIs.** Replace every synthetic sparkline with a server-paginated history endpoint, and add **WAULT**, **DSO**, **AR aging buckets (0–30, 31–60, 61–90, 90+)**, **same-store rent growth**, **straight-line rent recognition** to the KPI dashboard. These are the metrics every property executive looks at first.

9. **Bulk operations + portfolio CSV/XLS import.** Add row selection to `LeaseListPage` with bulk-export, bulk-renewal-trigger, bulk-reassign, bulk-tagging. Add a CSV/XLS import wizard with field-mapping, validation, and dry-run preview. Tier-1 operators with 50K leases will not key data in one screen at a time.

10. **Cap/floor escalation + variance-aware payment recording + multi-period reconciliation.** In `PaymentRecordPage`: if `amountPaid ≠ totalAmount`, prompt for partial-payment, overpayment-credit, or short-pay-with-reason. Allow a single payment to reconcile multiple `PaymentRecord` rows (lump-sum scenarios). Add withholding tax / VAT inputs. In `EscalationDashboard`: apply cap/floor visibly and require maker-checker (4-eyes) for any escalation above a tenant-configured threshold.

---

**Bottom line:** Beautiful surface, half-built engine. Ship the UX team's vision *as-is* to a property-manager / lease-admin persona; but no Controller will sign off until the IFRS 16 layer, MLA→SLA hierarchy, real CPI integration, and field-level audit/security are in place. The 17-page module is roughly **40–50% of a competitive enterprise lease platform**.
