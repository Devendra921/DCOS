# Deep Review: Asset Inventory Module

**Reviewer:** Telecom Asset Lifecycle Architect (20+ yrs at Tier-1 operators)
**Date:** 2026-05-26
**Files Reviewed:**
- `src/modules/asset-inventory/pages/AssetDashboard.tsx` (540 lines)
- `src/modules/asset-inventory/pages/AssetListPage.tsx` (712 lines)
- `src/modules/asset-inventory/pages/AssetDetailPage.tsx` (1,010 lines)
- `src/modules/asset-inventory/pages/AssetUtilizationReport.tsx` (319 lines)
- `src/modules/asset-inventory/components/SiteEquipmentTab.tsx` (1,086 lines)

**Benchmarks:** IBM Maximo Asset Management, ServiceMax, SAP EAM, Oracle Asset Lifecycle Management, ITIL Asset Management, ISO 55000/55001 Asset Management Standard

---

## A. Module Scope and Coverage (Severe Gap Analysis)

The entire enterprise-wide asset management capability is delivered through **4 pages plus a single embedded tab component** — a footprint that is shockingly thin for what is, in any real Tier-1 operator, a domain consisting of 30+ purpose-built modules. To benchmark: IBM Maximo's RAN/telecom industry pack ships with **~120 distinct screens** organized into Asset Hierarchy, Locations, Item Master, Storerooms, Service Items, Tools, Receiving, Inventory Counts, Issues & Returns, Asset Templates, Specifications, Meters, Classifications, Asset Movement, Asset Status, Failure Codes, Condition Monitoring, Decommissioning, Disposal, and Auditing — and that is before you reach Maintenance and Procurement domains. This module has effectively **3% of the minimum viable surface area** of a competitive CMMS/EAM platform.

The "AssetDashboard" page is misnamed; it is actually a **Material Readiness Funnel** for rollout BOM fulfillment (Ready / Partial / Blocked at site-level). It belongs in the Procurement or Rollout module, not in Asset Inventory. The "AssetListPage" is a flat catalog of ~25 hard-coded mock assets with no parent-child hierarchy, no warehouse view, no stock movement, no kit/assembly support. The "AssetDetailPage" is the only screen with meaningful per-asset depth, but it is one giant tabbed monolith and is read-only for nearly every interesting field (firmware, depreciation, EOL). The "AssetUtilizationReport" is a single static report; there is no report builder, no scheduling, no subscription. The "SiteEquipmentTab" is a 1,086-line god component embedded in Site Detail that mixes Equipment / BOM / Deliveries / Material Requests into one tab — none of which are first-class top-level destinations.

What does not exist at all:
- Warehouse Management (no `WarehousePage`, no bin/location/zone hierarchy, no put-away or pick lists)
- Stock Receipt / Goods Receipt Note (GRN) workflow
- Stock Issue / Issue Voucher / Material Issue Note (MIN)
- Stock Transfer (warehouse-to-warehouse, warehouse-to-site, site-to-site)
- Stock Adjustment / Cycle Count / Physical Inventory
- Asset Movement / Transfer Order with chain-of-custody
- Asset Disposal / Decommissioning workflow with scrap/salvage/return-to-vendor disposition codes
- Spare Parts Catalog (separate from main asset register, with min-max levels, ROP, EOQ)
- Tools & Test Equipment Calibration register
- Consumables tracking (cables-by-the-meter, fasteners, fluids, gases)
- Item Master with manufacturer cross-reference, alternates, supersessions
- Asset Templates / Classifications (ISO 14224 equipment taxonomy)
- RMA (Return Material Authorization) and DOA (Dead On Arrival) workflow
- Loaner / Pool Equipment tracking
- Forward Logistics / Reverse Logistics dashboards

The entire module reads like a thin **rollout-phase visualization shell** rather than a system of record for the lifecycle of 100,000+ pieces of capital equipment.

## B. Asset Lifecycle Coverage

A complete ITIL/ISO 55000-compliant asset lifecycle has **at minimum 9 states**: Planned → Requisitioned → Ordered → Received → QA-Inspected → Stored → Reserved → Issued/Installed → Operational → Under-Maintenance → Decommissioned → Disposed (Salvage/Recycle/Return-to-Vendor). The implementation hard-codes only **4 states** in `statusConfig`: `Available | Deployed | Maintenance | Retired` (`AssetListPage.tsx:55-60`). This is unacceptable:

- No "Received" or "QA-Hold" or "DOA" — a unit cannot be tracked from arrival at the warehouse through inspection.
- No "Reserved" status — once a unit is allocated to a project BOM it should be locked from other use.
- No "In Transit" status at the asset level — only at the shipment level inside SiteEquipmentTab.
- "Retired" is the terminal state — there is no "Awaiting Disposal", "Sold", "Scrapped", "Returned to OEM", "Cannibalized for Parts" distinction, all of which carry different accounting and regulatory consequences (e-waste, WEEE Directive, RoHS).
- No lifecycle state machine — the AssetDetailPage Edit modal (`AssetDetailPage.tsx:799-806`) is just a Select with the 4 states, allowing any user with `editSite` capability to flip an asset from Available straight to Retired with no transition rules, no required fields, no approvals.

The "lifecycleScore" calculation (`AssetDetailPage.tsx:367-371`) is a complete fabrication: it just divides remaining warranty by total warranty months. Real lifecycle scoring (e.g., Maximo's Asset Health Index) combines age vs. expected life, condition monitoring readings, failure history, MTBF degradation, cost-to-maintain trend, and OEM support status. The score is meaningless and would mislead a planner into believing a "30% lifecycle score" reflects asset health when it only reflects warranty depletion.

## C. Asset Hierarchy, Barcoding & Identity

There is **no parent-child asset hierarchy** anywhere in the code. The `Asset` interface (`AssetListPage.tsx:25-39`) is a flat record. In reality a single Outdoor Cabinet contains a Power Shelf, multiple Rectifier Modules, a BBU/DU, multiple Plug-in Cards, Fans, and Batteries — each tracked as a child asset that can be swapped independently. With no parent-child relation:

- You cannot answer "what's inside Cabinet B at SITE-0001?"
- You cannot move a parent and have all children move with it.
- You cannot perform a warranty claim on a sub-component while keeping the parent operational.
- Failure analysis across an assembly is impossible (no rollup of child failures to parent MTBF).

Barcoding/RFID/QR is entirely absent. The Register Asset modal (`AssetListPage.tsx:610-705`) collects Serial Number and "Catalog/Part Number" as plain text inputs — there is no barcode scanner integration, no QR scanner, no NFC/RFID tag association, no asset tag printing workflow, no GS1-128 / Code 128 / Data Matrix support. For warehouse operations this is a non-starter: every Tier-1 operator's receiving dock uses handheld scanners that feed directly into the EAM. The current design forces manual keystroke entry of every serial, which at scale (≈ 4-8 serials per site × 50,000 sites) produces 200k-400k typos per year.

Identity ambiguity: the system uses **three different identifiers** without explaining the relationship — `id` (database row id), `assetId` (e.g., "AST-0001"), and `serialNumber` (manufacturer SN). There is no documented unique-key strategy, no validation that prevents duplicate serials being registered across warehouses, no enforcement that one physical unit equals one assetId. The "validate" stub in the install dialog (`SiteEquipmentTab.tsx:391-399`) literally just checks for the string `"SN-CONFLICT-001"` to simulate a conflict — there is no real uniqueness service.

## D. Warranty, Financial & Compliance Tracking

Warranty handling is the strongest single feature: `WarrantyBar` shows remaining months and an inline expiry chip. However it is shallow:

- Only one warranty per asset. Real assets often have **multiple overlapping warranties** — OEM standard (12 mo), extended (36 mo), parts-only (5 yr), Service Level Agreement coverage, battery-specific warranty (10 yr prorated). The model has one `warrantyExpiry` field.
- No vendor warranty claim workflow. When an asset fails under warranty there is no Create Claim button, no RMA generation, no replacement tracking, no credit memo reconciliation.
- No warranty register search (e.g., "show me all Nokia AAUs expiring in next 90 days" — only a count chip exists on the dashboard).
- No service contract management at all. Power UPS rectifiers typically carry separate service contracts with response-time SLAs; none of that is modelled.

Financial tracking is cosmetic. `AssetDetailPage.tsx:435-442` shows a "Financial" descriptions block with Unit Cost and "Depreciated Value" — both **hard-coded strings**. There is no depreciation engine (no Straight-Line, Double-Declining, Units-of-Production, Sum-of-Years-Digits methods), no useful-life setting per asset class, no NBV calculation, no GL account mapping, no capitalization vs. expense flag, no CWIP (Construction Work In Progress) tracking, no fixed-asset register export to SAP FI-AA / Oracle Fixed Assets / Sage. Tax depreciation (MACRS, IFRS 16) is invisible. For a publicly-traded operator this is a SOX failure — assets on the balance sheet need traceable cost, depreciation, impairment, and disposal journals.

Compliance gaps: no audit log of who edited the asset (Edit modal in `AssetDetailPage.tsx:762-820` saves but produces no audit trail), no SOC 2 evidence trail, no RoHS / REACH / WEEE compliance status, no country-of-origin tracking (critical for telecom under e.g. Huawei restrictions in the US and EU), no hazardous-materials classification for batteries (UN3480/UN3481 lithium-ion shipping classes).

## E. Maintenance History Integration

The Maintenance tab on AssetDetailPage (`AssetDetailPage.tsx:553-578`) shows a flat 4-row hard-coded list with Date/Type/Description/Technician/Status/Duration. This is a glorified note pad:

- No labor-hours-by-craft breakdown
- No parts-consumed list
- No cost of maintenance (labor $ + parts $)
- No failure code / cause code / remedy code (per ISO 14224 Annex A)
- No link back to the Work Order in the maintenance module (the Schedule Maintenance modal at `AssetDetailPage.tsx:822-878` creates a record but the resulting record is not actually wired to the Maintenance Hub work-order entity)
- No MTBF / MTTR / MTBR calculation per asset
- No condition-monitoring readings (vibration, temperature, oil analysis for gensets, hydrogen sensing for batteries, VSWR for radios, RTWP for antennas)
- No bathtub-curve analytics, no Weibull reliability modelling

The bridge between the asset domain and the maintenance domain is broken — these are completely separate mock datasets that share field names but nothing else.

## F. Photos, Documents & Manufacturer Data

`useRelatedDocs` (`AssetDetailPage.tsx:145-154`) supports 4 hard-coded document types (Manual, ATP Report, Warranty Certificate, Commissioning Report). What is missing:

- **No upload control.** There is no drag-and-drop, no S3/Azure Blob integration, no file picker. The list is read-only.
- **No photos.** Field crews take 10-30 photos per install (before, during, after, labels, serial plates, ground bonding). None of that surface area exists.
- **No 360 imagery, no LIDAR scan, no drone deliverables** (industry standard for tower inspection).
- **No manufacturer datasheet ingestion.** The "Technical Specifications" descriptions block (`AssetDetailPage.tsx:421-434`) is hard-coded text. A real EAM ingests the OEM datasheet XML / CSV / barcode and auto-populates 200+ specification fields per model.
- **No firmware repository.** Firmware version is one editable text field; there is no signed-binary store, no rollback registry, no compatibility matrix.
- **No drawings / schematics / cable plans** (telecom assets ship with SLD, rack-elevation, and grounding drawings — all absent).

## G. Equipment Categories vs. Real Telecom Inventory

The category map in `AssetListPage.tsx:43-53` has 9 categories: Antenna, Radio, Cable, Power, Shelter, WiFi, DAS, Small Cell, CRAN. A real Tier-1 telecom warehouse manages **~80 top-level classes** across:

- **RF active**: AAU, RRU, RRH, mMIMO, repeater, signal generator, BTS legacy
- **Baseband**: BBU, DU, CU, vRAN servers, fronthaul switches, GNSS time servers
- **Transmission**: MW IDU/ODU, optical OLT/ONU, DWDM cards, IP/MPLS routers, SDH/PDH (legacy), Ethernet switches
- **Antenna & passives**: feeders, jumpers, connectors, splitters, combiners, filters, TMAs, lightning arrestors, antennas (panel, omni, parabolic, grid, sector, MIMO)
- **Power**: rectifier, inverter, generator, ATS/STS, ARS, fuel tank, batteries (lead-acid, lithium, NiCd), solar PV, wind, fuel cell, UPS
- **Civil & tower**: tower, mast, monopole, rooftop frame, guy-wires, anchors, foundation, equipment shelter, cabinet, rack, cable tray, ice bridge, fencing, lighting, lightning rod
- **HVAC**: AC, DC fan, heat exchanger, free-cooler
- **Safety**: PPE, fall-arrest harness, rescue kit, fire suppression, gas detector
- **Tools & test**: power meter, OTDR, BERT, spectrum analyzer, ladder, torque wrench, GPS locator
- **IT**: laptops, tablets, phones, modems, OBM/EMS workstations
- **Consumables**: cable ties, tape, sealant, anti-oxidant, fuel, refrigerant

The current 9-category enum captures perhaps 10% of the real estate. Adding a category requires a hard-coded edit to the `categoryColor` dictionary — there is no admin UI for "Manage Categories", no hierarchical classification (Level-1 / Level-2 / Level-3), no ISO 14224 taxonomy, no IBM Maximo "Classifications" tree.

## H. Asset Movement, Transfers & Swaps

The Swap modal (`AssetDetailPage.tsx:880-947`) handles a one-for-one in-place swap (good). But there is no:

- **Asset Transfer Order**: site-to-warehouse, site-to-site, warehouse-to-warehouse with shipper, carrier, AWB, departure/arrival date, custodial signatures.
- **Bulk transfer / pack-list** (e.g., decommission an entire 4G shelter, transfer all 28 assets).
- **Loaner / temporary swap** (deploy spare while OEM repairs failed unit).
- **Cannibalization** (extract good modules from failed parent, return shell for disposal).
- **Lost / Stolen / Damaged** disposition codes with insurance-claim integration.
- **Chain-of-custody** signatures (operator, transporter, receiver), photographs at handoff.

The Swap dialog also lacks reverse-logistics integration — when the old serial is removed, there is no automatic routing to RMA, no warranty-claim trigger, no quarantine bin assignment, no test-and-classify workflow. The old unit just vanishes from the system.

## I. UX, Architecture & Code Quality

- **God-component anti-pattern.** `SiteEquipmentTab.tsx` is 1,086 lines containing 9 React components, 4 data hooks, and 5 dialogs. This violates single-responsibility and makes the file untestable.
- **Mock-data co-location.** Every page declares its own hard-coded data array. There is no shared `assetService`, no API contract, no Redux/Zustand store, no SWR/React-Query cache. Replacing mocks with a real API will require touching every file.
- **Misleading "ReadinessBanner".** Hard-codes "100% Material Ready" and "8 Installed, 2 Delivered, 2 In Transit" regardless of actual data state.
- **Duplicate components.** `WarrantyBar` is defined three times: once in `AssetListPage.tsx:152`, once in `AssetDetailPage.tsx` (implicitly via the warrantyMonths math), and once in `SiteEquipmentTab.tsx:263`. Each implementation has slightly different colour thresholds.
- **No accessibility.** No ARIA labels on the SVG charts (FunnelChart, CategoryArcChart, TrendChart, LifecycleTimeline, SiteDiagram, DonutChart, VendorChart, UtilizationBar). Screen readers see empty regions.
- **No empty-state for "no assets at site"** in SiteEquipmentTab.
- **No offline / unsynced indicator.** Field technicians scan on tarmac with no signal — there is no IndexedDB queue, no sync banner, no conflict resolution.
- **Hard-coded "today" date** (`AssetDetailPage.tsx:256, 285, 354, 361`) of `2026-05-14` — date math will silently rot as the demo ages.
- **No internationalization.** All strings are English; no `i18n` keys. For a global telco this is a launch blocker.
- **No print / PDF view** of an Asset Detail page (auditors and customs officers regularly require printed asset passports).
- **No barcode label printing** integration (Zebra/SATO label printers are warehouse standard).

---

## Scoring

| Capability | Score (0-10) | Justification |
|---|---|---|
| Asset Master Data Model | **2** | Flat record, no hierarchy, no classification, no Item Master |
| Lifecycle State Coverage | **2** | 4 states vs. industry-standard 9-12 |
| Identity (barcode/RFID/serial) | **1** | Manual text only; no scanning, no uniqueness service |
| Warranty & Service Contracts | **3** | Single-warranty model, no claims workflow |
| Financial / Depreciation | **1** | Hard-coded strings; no engine, no GL integration |
| Maintenance Integration | **2** | Disconnected mock data; no MTBF/MTTR/cost rollup |
| Photo / Document Management | **1** | Read-only list of 4 docs; no upload, no photos |
| Warehouse / Stock Operations | **0** | Entirely absent |
| Spare-Parts Management | **0** | Entirely absent |
| Asset Movement / Transfer | **2** | One-for-one swap only; no transfer orders |
| Decommissioning / Disposal | **1** | "Retired" terminal status only; no disposition codes |
| Audit / Compliance | **1** | No audit trail, no RoHS/WEEE, no SOX evidence |
| Reporting & Analytics | **3** | One static utilization report; no builder |
| API / Integration Readiness | **1** | Pure mock data, no service layer |
| UX / Accessibility | **4** | Visually polished; deep IA flaws; no a11y |
| **OVERALL** | **1.7 / 10** | A demo veneer over a structural void |

---

## Top 10 Priority Fixes

1. **Decompose `SiteEquipmentTab.tsx`** into 5 separate files (EquipmentSubTab, BOMSubTab, DeliveriesSubTab, MaterialRequestsSubTab, dialogs) and extract `WarrantyBar`, `EquipmentCard`, `BOMPipelineBar` into `shared/components/asset/`. Remove the 1,086-line god component.

2. **Introduce an Item Master / Catalog as a first-class entity.** Create `CatalogPage` and `CatalogItemDetailPage` with manufacturer, model, part number, alternates, supersessions, hazmat class, country-of-origin, ISO 14224 classification, datasheet upload, and barcode/GTIN. This decouples physical-asset records (serialized) from the model catalog.

3. **Implement parent-child asset hierarchy.** Add `parentAssetId`, `childAssetIds[]`, `position` (slot/port) to the Asset model. Build a tree-view on AssetDetailPage showing the assembly bill-of-materials. Cascade move/swap operations.

4. **Build a real warehouse module** (`WarehouseListPage`, `WarehouseDetailPage`, `BinLocationPage`, `GoodsReceiptPage`, `GoodsIssuePage`, `StockTransferPage`, `CycleCountPage`). Without this, the platform cannot operate in production.

5. **Replace the 4-state status enum with a 12-state lifecycle state machine** including Planned, Requisitioned, On-Order, In-Transit, Received, QA-Hold, Stored, Reserved, Issued, Installed, Operational, Under-Maintenance, Decommissioned, Awaiting-Disposal, Disposed (Sold/Scrapped/Returned/Cannibalized). Enforce transitions with required-fields and approval workflows.

6. **Barcode/QR scanning support.** Integrate a webcam/handheld scanner library (e.g. `@zxing/browser`), add a "Scan Serial" button to the Register, Receive, Issue, Swap, and Inventory-Count forms. Generate printable QR/Data Matrix labels for in-house asset tags.

7. **Real warranty register.** Multiple warranties per asset (OEM, Extended, Parts, Battery, SLA). Add a `WarrantyClaimsPage` with claim ID, RMA number, OEM tracking, credit memo reconciliation. Pre-built filters: "expiring in 30/60/90 days", "out of warranty", "claim in progress".

8. **Document & photo management.** Drag-drop upload with thumbnails, category enum (Datasheet, Manual, ATP, RFDS, Drawing, Photo, Punch-List, Site-Survey), S3-presigned uploads, EXIF GPS validation against site coordinates.

9. **Depreciation engine.** Per-asset useful-life, salvage value, depreciation method (SL, DDB, SYD, MACRS), monthly accrual, NBV report, GL export. CapEx vs. OpEx flag. Integration adapter for SAP FI-AA / Oracle Fixed Assets.

10. **Audit trail.** Every Edit, Status change, Swap, Transfer must produce an immutable event in an `asset_audit_log` table with user, timestamp, old-value, new-value, reason. Add an "Audit Trail" tab on AssetDetailPage. This is non-negotiable for SOX, ISO 27001, and field operations dispute resolution.
