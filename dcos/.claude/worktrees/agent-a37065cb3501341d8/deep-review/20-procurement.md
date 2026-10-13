# Deep Review: Procurement Module

**Reviewer:** Telecom SCM / Procurement Architect (20+ yrs at Tier-1 operators)
**Date:** 2026-05-26
**File Reviewed:**
- `src/modules/procurement/pages/ProcurementHub.tsx` (355 lines, **the only page in the entire module**)

**Benchmarks:** SAP Ariba, Oracle Procurement Cloud (Fusion SCM), Coupa, Jaggaer, GEP SMART, Ivalua, SAP MM (Materials Management), Workday Strategic Sourcing, Tradeshift, Basware

---

## A. Module Scope and Coverage (Severe Gap Analysis)

The entire Source-to-Pay (S2P) capability for what is positioned as a Tier-1 RAN/telecom platform is delivered through **ONE file, 355 lines**, displaying 5 hard-coded purchase orders, 4 invoices, 4 FX rates, and 4 fiscal periods. By the author's own declaration in the file header (`ProcurementHub.tsx:1-12`): *"Integration module — surfaces transactional ERP documents... The system of record for the items here is the existing Procurement / ERP platform."* This is candid but it amounts to a confession that **no procurement functionality is being built at all**.

To benchmark: SAP Ariba's product suite spans **8 distinct cloud applications** (Sourcing, Contracts, Spend Analysis, Buying, Invoicing, Payments, Supplier Risk, Supplier Lifecycle) with ~250 screens combined. Coupa has 60+ modules. Oracle Procurement Cloud has 9 work-areas with 100+ pages. The implementation here has **1 page with 4 read-only sections** (Recent POs, Invoice Tracker, FX Rates, Fiscal Periods) — effectively **0.5% of the minimum-viable surface area** of any competitive procurement platform.

What does not exist anywhere in the module:
- **Purchase Requisition (PR)** workflow — the upstream document from requestor → manager approval → buyer assignment → PO conversion
- **Sourcing** (RFI, RFQ, RFP, e-Auction) — the activity that selects vendors and prices
- **Contract Management** — frame agreements, MSAs, SOWs, NDAs, contract repository, renewal alerts
- **Vendor Master / Supplier Master Data Management**
- **Supplier Onboarding / Pre-Qualification / Compliance**
- **Supplier Performance / Scorecards (KPIs, OTIF, defect rate, SLA)**
- **Supplier Risk Management (financial health, sanctions screening, ESG, cyber)**
- **Catalog Management** (preferred items, hosted catalogs, punch-out catalogs)
- **Three-Way Match** (PO vs. GRN vs. Invoice)
- **Goods Receipt Note (GRN)** with inspection workflow
- **Spend Analytics** (by category, by supplier, by cost center, savings tracking)
- **Budget Validation** (real-time encumbrance against budget lines)
- **Source-to-Contract** workflow
- **Buy-on-Behalf-Of / Procurement on behalf of business units**
- **Approval Workflow Engine** (multi-level, threshold-based, delegation, OOTO)
- **Punch-out / cXML / OCI** integration
- **EDI (X12 850/855/856/810)** for B2B procurement
- **e-Invoice ingestion** (Peppol, ZUGFeRD, FatturaPA, KSeF, EDIFACT INVOIC)
- **Payment Processing / Cash Application**
- **Tax determination (Avalara, Vertex, OneSource)**
- **Mobile approval app**
- **Buyer dashboards / Category Manager workspace**
- **Tail-spend management**

The module exists but is empty of procurement functionality.

## B. Purchase Requisition → PO Workflow

A complete Procure-to-Pay (P2P) cycle has **at least 12 stages**: Need Identification → Requisition Draft → Manager Approval → Buyer Assignment → Sourcing (if non-catalog) → Vendor Selection → PO Creation → PO Approval → PO Dispatch (EDI/email/portal) → Vendor Acknowledgement (PO ack 855) → Advance Shipping Notice (ASN 856) → Goods Receipt (GRN) → Inspection / QA → Invoice Receipt → 3-Way Match → Posting → Payment → Reconciliation → Period Close.

The implementation skips directly from "PO exists" (5 hard-coded rows) to "Invoice exists" (4 hard-coded rows). Specifically:

- **No PR step.** There is no `PurchaseRequisitionPage`. No requestor can create a PR, no manager can approve one. POs appear ex nihilo.
- **No PO authoring.** The PO list is read-only. Cannot create, edit, amend, change-order, cancel, or close a PO from this UI.
- **No PO line items.** The `PO` interface (`ProcurementHub.tsx:45-53`) has only header-level fields (vendor, category, amount as a string, status, dates). Real POs have line items with item-master link, quantity, unit price, delivery date, ship-to, tax code, GL account, project/WBS code. None modelled.
- **No PO numbering policy.** "PO-2026-04412" is hard-coded; no sequence generator, no document type prefix (Stock PO vs. Service PO vs. Framework Order vs. Blanket PO vs. Subcontract PO), no per-buying-org numbering.
- **No PO acknowledgement workflow.** Real vendors return an ack (855); no field captures it.
- **No PO change order.** When delivery dates slip or quantities adjust, real systems issue revised POs with version history.
- **No service-PO milestones.** Civil works and installation services bill against milestone completion — entirely absent.
- **No subcontract PO.** Civil works for tower builds are a different procurement vehicle than equipment buys.

The 5-row PO list does not classify by type (Goods vs. Services vs. Framework vs. Project), does not link to a Project / WBS / Site, does not show delivery vs. invoiced vs. paid amounts, and does not surface the open commitment ($ committed but not yet received/invoiced).

## C. Sourcing (RFI / RFQ / RFP / Auction) — Entirely Absent

Sourcing is the upstream activity that decides which vendor wins a PO. A real telecom sourcing event involves:

- **RFI** — initial market scan for capable suppliers (often 20-40 vendors).
- **RFQ** — bid for known specs (typically 3-7 shortlisted vendors).
- **RFP** — bid for solution requiring vendor proposal (large telecom contracts, e.g., 5G RAN rollout).
- **Reverse Auction** — live bidding for commoditized items (cables, fasteners).
- **Negotiated Procurement** — limited-source or sole-source.

For a telecom operator the RAN equipment sourcing event is often a $100M-$1B multi-year decision involving **Nokia / Ericsson / Huawei / Samsung / ZTE / Mavenir / Open-RAN players** competing across functional, technical, security, ESG, and commercial criteria. A complete RFP cycle includes:

- Sourcing event creation (scope, timeline, evaluation criteria, weights)
- Supplier invitation list (linked to vendor master)
- NDA distribution and tracking
- Bid line-items (often 1000+ SKUs)
- Vendor Q&A workflow (Sourcing Q&A board)
- Bid submission portal (sealed bid until close)
- Bid evaluation (technical scoring matrix, commercial bid analysis, weighted ranking)
- Vendor negotiation rounds (BAFO — Best And Final Offer)
- Award workflow (sole / split / multi-source)
- Contract generation from awarded bid

**None** of this exists. The module has no `SourcingEventListPage`, `RFQDetailPage`, `BidComparisonPage`, `AuctionRoomPage`, `AwardDecisionPage`. Vendor selection is invisible.

## D. Vendor / Supplier Master Management

The implementation references vendor names as **plain strings**: "TowerBuild Inc", "NetInstall Co", "PowerSys Ltd", "Nokia". There is no `Vendor` entity, no `VendorListPage`, no `VendorDetailPage`. What is missing in a real Vendor Master:

- Tax ID, VAT number, GSTIN, EIN, DUNS, LEI
- Bank account details (with verification)
- Remit-to addresses (multiple)
- Ship-from addresses
- Contact persons (sales, support, finance, escalation, exec sponsor)
- Vendor classification (OEM, Distributor, VAR, Integrator, MSP, Subcontractor)
- Categories supplied (RAN active, RAN passive, transmission, power, civil, services)
- Country-of-origin, place of incorporation, ownership (for sanctions/Huawei rules)
- Payment terms (Net-30, Net-60, 2/10 Net-30, Letter of Credit)
- Currency
- Default GL account / cost center
- Tax determination defaults
- Compliance certifications (ISO 9001, ISO 14001, ISO 27001, SOC2, GDPR, RoHS, REACH, modern-slavery declaration)
- Insurance certificates with expiry (general liability, professional, workers-comp)
- Annual revenue, D&B rating, financial-health score
- Sanctions screening status (OFAC, EU, UN consolidated lists, UK HMT)
- Watchlist / debarment status
- ESG score / Sustainability rating
- Cyber security questionnaire status

This is a multi-thousand-field domain with its own lifecycle (Prospect → Pre-Qualified → Approved → Active → Suspended → Blocked → Retired). The implementation contains literally zero of this.

## E. Goods Receipt & Three-Way Match

The fundamental control in any P2P system is the **Three-Way Match**: an invoice is only paid if it matches the PO and the GRN within tolerance. The implementation has:

- No `GoodsReceiptPage`. No inbound dock workflow. No receiving against PO line items. No partial-receipt support. No over-receipt or under-receipt handling. No quantity vs. weight vs. volume reconciliation.
- No inspection / QA hold. Telecom equipment goes through Factory Acceptance Test (FAT), Site Acceptance Test (SAT), and ATP (Acceptance Test Procedure) — none of that is modelled.
- No DOA (Dead On Arrival) capture, no RMA generation against the vendor, no replacement-against-PO workflow.
- No serial-number capture at receipt (the link between asset register and procurement).
- No put-away workflow.
- No three-way match logic. The Invoice "Disputed" status (`ProcurementHub.tsx:127-128`) is hard-coded, not derived from any matching engine.

Without GRN and three-way-match, the entire invoice approval workflow is operating on trust. In a real organization this is the single biggest fraud and leakage risk in procurement.

## F. Invoice Processing & e-Invoicing

The Invoice Tracker (`ProcurementHub.tsx:251-284`) shows 4 hard-coded invoices with 4 statuses: Awaiting Approval / Approved / Paid / Disputed. Real e-invoicing has:

- **Invoice receipt channels**: email-PDF, OCR, EDI (X12 810), Peppol, e-Invoicing mandates (Italy FatturaPA, India IRP, Mexico CFDI, Poland KSeF, France Chorus Pro, etc.) — none implemented.
- **OCR + ML extraction** of unstructured PDF invoices.
- **Header & line-level matching** to PO and GRN.
- **Tolerance configuration** ($, %, quantity) per category.
- **Tax validation** (line-level VAT/GST/Sales-Tax against rate cards and jurisdictions).
- **Coding workflow** for non-PO invoices (assign GL, cost-center, project).
- **Approval routing** (cost-center owner, project manager, finance, controller).
- **Hold / Block reasons** (price variance, quantity variance, missing GRN, expired contract).
- **Dispute management** with vendor response loop and credit-note application.
- **Payment-run integration** (batch payments, ACH/SEPA/SWIFT, payment hold, early-payment-discount capture).
- **Withholding tax** calculation (e.g., India TDS, Philippines EWT).
- **Cross-charge / inter-company billing**.

All four invoice statuses in this implementation are presentational. There is no engine, no routing, no integration.

## G. Contract & Catalog Management

Contracts and catalogs are the **rate cards** that make procurement scalable. The implementation has neither.

**Contracts**:
- No `ContractListPage` or `ContractDetailPage`.
- No frame agreement / MSA / SOW / NDA hierarchy.
- No clause library, no contract authoring with redline tracking.
- No e-signature integration (DocuSign, Adobe Sign).
- No expiry alerts, no auto-renewal handling.
- No service-credit / penalty clauses linked to SLA breaches.
- No price-list versioning under a contract.
- No volume-tier pricing or rebate accrual tracking.

**Catalogs**:
- No `CatalogPage` for preferred items with negotiated prices.
- No hosted catalog vs. punch-out distinction.
- No catalog-versus-non-catalog spend %.
- No item availability indicator from vendor's stock.
- No lead-time visibility.
- No alternate / substitute parts.
- No vendor cross-reference.

Without contracts, every PO must be hand-priced. Without catalogs, requestors cannot self-serve. The result in practice is that 100% of purchases go through buyers, which is exactly the bottleneck modern P2P platforms exist to remove.

## H. Spend Analytics, Budget & Compliance

A procurement platform's KPIs go far beyond the 6 tiles shown here ("Open POs / Committed Spend / Invoices Awaiting / Disputed / Invoice Cycle Time / Active Fiscal Period"). Missing:

- **Spend cube**: spend by category × supplier × cost-center × geography × time, drillable.
- **Savings tracker**: realized vs. negotiated vs. forecast.
- **Maverick / off-contract spend**: what % went outside negotiated agreements?
- **Supplier consolidation**: how many suppliers per category? Tail-spend identification.
- **Working-capital metrics**: DPO (Days Payable Outstanding), early-payment-discount capture.
- **Cycle-time metrics**: PR-to-PO, PO-to-receipt, receipt-to-pay.
- **PO-fill-rate**: % of PO lines received complete on time.
- **Vendor scorecards**: OTIF (On-Time-In-Full), defect rate, NCR rate.
- **Sustainability**: scope-3 emissions by supplier, % spend with diverse suppliers, % with ESG-certified suppliers.

The "Committed Spend" tile shows "$2.32M" — hard-coded — with no drill-down, no time-series, no breakdown.

**Budget validation** is entirely absent. In real procurement, when a PR is raised the system checks the budget line, encumbers the funds, and rejects if over budget. The implementation has no budget entity, no encumbrance logic, no period budget vs. actuals.

**Compliance**:
- No sanctions screening against vendor master (OFAC, EU, UN, UK HMT lists).
- No Huawei / ZTE / national-security restricted-vendor flagging — critical for telecom.
- No dual-use / export-control screening (EAR99 / ECCN codes).
- No anti-bribery / anti-corruption (FCPA, UK Bribery Act) declaration capture.
- No conflict-minerals reporting (Dodd-Frank Section 1502).
- No segregation-of-duties enforcement (requestor ≠ approver ≠ receiver ≠ AP).

## I. UX, Architecture, Integration & Code Quality

- **Hard-coded everything.** Every list (POS, INVOICES, FX, FISCAL) is a const-array at module scope.
- **No data layer.** No API client, no React-Query, no Redux. No notion of latency or loading states.
- **Misnamed module.** What is shown is closer to a **Finance Dashboard** (AP, FX, fiscal periods) than to Procurement. Real procurement work happens upstream of these displays.
- **No detail pages.** Clicking PO-2026-04412 does nothing. There is no `PurchaseOrderDetailPage`, no `InvoiceDetailPage`, no `SupplierDetailPage`. Every entity is a row in a table.
- **Anchor links to nothing.** `href="#erp-platform"` (`ProcurementHub.tsx:139`) and the "Open ERP" button go nowhere. Buttons like "Manage periods" (`ProcurementHub.tsx:316`) navigate to a `/financial/fiscal-periods` route that may not exist.
- **No accessibility.** SVG-free, table-only — minimally compliant but no ARIA-live for status changes.
- **No empty state.** If the lists were empty the user would see a default Ant Design "No Data" with no recovery action.
- **No bulk actions.** Cannot select multiple invoices and approve in batch, cannot mass-update PO statuses.
- **No filters.** Cannot filter POs by date range, status, vendor, category, amount band.
- **No search.** No search box anywhere on the page despite this being inherently a search-driven domain.
- **No export.** No CSV / Excel / PDF export of POs or invoices — a basic AP requirement.
- **No reconciliation views.** No vendor-statement-vs-our-records reconciliation, no AP aging report.
- **Hard-coded "today"** for invoice ages ("3 days", "6 days") — text strings, not computed.
- **FX rates** show 4 currency pairs as hard-coded numbers with no source attribution (ECB? Reuters? OANDA?), no historical chart, no FX hedge linkage, no rate-locking for POs.
- **No multi-currency handling** on POs (the amount is a string "$1,240,000" with no currency code or exchange-rate-at-PO-date capture).
- **No localization.** Date formats, number formats, currency formats all assume US English.

The module is a stub.

---

## Scoring

| Capability | Score (0-10) | Justification |
|---|---|---|
| Purchase Requisition workflow | **0** | Not implemented |
| PO Authoring & Lifecycle | **1** | 5 read-only rows, no detail page, no create/edit |
| Sourcing (RFI/RFQ/RFP/Auction) | **0** | Entirely absent |
| Vendor Master / Onboarding | **0** | Vendor as plain string |
| Goods Receipt Note (GRN) | **0** | Not implemented |
| Three-Way Match | **0** | "Disputed" is decorative |
| Invoice Processing | **1** | 4 hard-coded rows, 4 statuses, no workflow |
| Contract Management | **0** | Not implemented |
| Catalog Management | **0** | Not implemented |
| Budget & Encumbrance | **0** | Not implemented |
| Spend Analytics | **1** | 6 hard-coded KPI tiles |
| Supplier Risk / Compliance | **0** | No sanctions, no Huawei/ZTE flag, no ESG |
| Approval Workflow Engine | **0** | Not implemented |
| EDI / cXML / e-Invoice | **0** | Not implemented |
| Mobile Approvals | **0** | Not implemented |
| Tax & Currency Engine | **0** | FX is decorative; no tax determination |
| Integration / ERP API | **1** | "Open ERP" button is empty anchor |
| UX / Accessibility | **3** | Clean layout; no detail; no actions |
| **OVERALL** | **0.4 / 10** | A finance dashboard mislabelled as Procurement |

---

## Top 10 Priority Fixes

1. **Acknowledge the module is missing.** Either build a real S2P (15+ pages minimum) or remove the "Procurement" label and rebrand the page as "AP / Finance Snapshot". The current name misleads users who expect to raise PRs, run RFQs, manage suppliers, and process invoices here.

2. **Build a Purchase Requisition workflow.** `PRListPage`, `PRCreatePage` (with line items, item master lookup, GL coding, budget check), `PRApprovalInbox`. Convert approved PR to PO. This is the foundational P2P entry point.

3. **Build Vendor Master & Onboarding.** `VendorListPage`, `VendorDetailPage` (tax, banking, contacts, certifications, sanctions status, ESG scores, performance scorecard). `VendorOnboardingWizard` with NDA, W9/W8-BEN, insurance certificates, bank verification.

4. **PO Detail page with line items.** `PurchaseOrderDetailPage` with multi-line items, GL coding, project/WBS, delivery schedule, receipts received, invoices applied, open commitment, document attachments, amendment history, vendor acknowledgement status.

5. **Goods Receipt Note (GRN) workflow.** `GRNListPage`, `GRNCreatePage` with PO-line selection, partial/over/under receipt handling, serial-number capture, inspection workflow, QA hold/release, DOA/RMA path. Wire serial-capture into the Asset Register.

6. **Three-Way Match engine.** Automatic match of Invoice ↔ PO ↔ GRN with configurable tolerances. Match-failure reasons, hold-and-route workflow, exception manager view. This is the single highest-ROI control in P2P.

7. **Sourcing module.** `SourcingEventListPage`, `RFQDetailPage` (invite list, NDA, line items, Q&A, sealed bid, evaluation matrix, award). At minimum support RFQ for tactical sourcing; RFP and Auction can follow.

8. **Contract & Catalog Management.** `ContractListPage` with frame agreements, expiry alerts, e-signature. `CatalogPage` with preferred items, negotiated prices, hosted + punch-out catalogs feeding the PR creation flow.

9. **Spend Analytics & Budget.** Spend cube (drillable by category × supplier × cost-center × time), savings tracker, maverick spend %, OTIF scorecards, DPO trend. Budget entity with real-time encumbrance and over-budget block.

10. **ERP / e-Invoice integration.** Replace the empty `#erp-platform` anchor with a real bidirectional adapter (SAP MM IDoc / OData, Oracle Procurement Cloud REST, Coupa OpenAPI). Add e-invoice ingestion (Peppol, EDI 810, ZUGFeRD) and OCR for unstructured PDFs. Add EDI 850/855/856 for B2B order-to-ship messaging with strategic suppliers.
