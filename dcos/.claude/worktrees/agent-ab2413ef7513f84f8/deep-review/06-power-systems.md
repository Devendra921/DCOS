# Power Systems Engineering — Deep-Dive Enterprise Review

**Module path:** `src/modules/power-systems/`
**Files audited:** 32 page files + 8 shared components + 2 lib files = ~19,740 LOC
**Reviewer perspective:** Telecom Power Infrastructure Architect (Eltek/Vertiv/Schneider veteran, DCIM SME)
**Benchmarks:** Vertiv Trellis DCIM, Schneider EcoStruxure IT Advisor, Eaton Brightlayer, Huawei iPowerCube, ZTE iEPMS

---

## A. Module Purpose Validation

Power Systems is correctly elevated as a **top-level engineering module** rather than being absorbed under Asset Inventory or Site Lifecycle — and the codebase reflects how distinct the discipline is in real operator OSS. A power design (rectifier sizing, battery autonomy, generator backup, solar hybrid mix, grid feed) is a multi-week engineering exercise that survives independently of the radio design. The split is justified at this scale (32 pages, 19.7K LOC). However the **boundaries with adjacent modules are blurred and undocumented** in code:

- **Asset Inventory overlap (14-asset-inventory):** `PowerEquipmentListPage` (538 LOC) and `PowerEquipmentDetailPage` (785 LOC) duplicate a generic asset register. The same physical rectifier, battery bank, ATS, and generator unit will exist in both modules with separate IDs (`EQ-XXXX` here vs the asset-inventory equivalent). There is no foreign-key contract documented in `_equipmentData.ts`. At 1M+ records this dual-registry will create reconciliation hell. **Recommendation:** Asset Inventory owns *the source of truth* for serial-number-level identity, warranty, vendor, and acquisition cost. Power Systems should join via `equipmentId` and contribute only the *power-context* fields (rectifier capacity, battery chemistry, autonomy spec, MPPT count). The current model where `PowerEquipmentListPage` re-implements bulk import (`PowerBulkImportPage.tsx`, 554 LOC) and warranty (`PowerWarrantyReportPage.tsx`) is a clean overlap to remove.
- **Site Lifecycle overlap (01-site-lifecycle):** `PowerCommissioningFormPage` (600 LOC) and `PowerCommissioningReportPage` (349 LOC) duplicate the broader site commissioning workflow. A site is "commissioned" once, holistically — radio + transmission + power + civil + safety. Today there is no link between the power commissioning state machine (`Not Started → Procurement → Installed → Commissioning → Commissioned → Operational`) and the site-level lifecycle status. A site may show "Commissioned" while the power record is "Installed". **Recommendation:** Power commissioning becomes a *gate* within the site-level commissioning checklist (load bank test, transfer test, battery discharge test are mandatory inputs to site-level RFI/RFS).
- **Site Sharing relationship (12-site-sharing):** `PowerSharingAllocationPage` (811 LOC) is excellent in isolation but exists in a **vacuum from the Site Sharing co-location module**. There is no shared operator master, no shared contract reference, no shared lease boundary. A power allocation change must trigger an MLA (Master Lease Agreement) amendment in Site Sharing. Today it does not.
- **Power Design vs Site Design boundary:** The 6 power design forms (Macro 1,186 LOC, C-RAN Hub 582, DAS 588, MW 463, Small Cell 495, WiFi 488) live next to RF Design, but with no shared design package. An RF designer fixes load (kW) → a power designer sizes the plant — yet today the Macro power form takes load as a free input rather than reading it from the RF design. The `prefillLoad` query-string handoff in `PowerLoadCalculatorPage` (line 122) is a one-way export only.

**Module purpose verdict:** Justified as top-level, but **3 critical inter-module contracts are missing**: (1) Asset ID join, (2) Site commissioning gate, (3) RF design ↔ Power design load contract.

---

## B. Workflow Audit

### B1. Power Design Lifecycle
The 5-stage state machine is: `Draft → Submitted → Approved/Rejected/Revision Requested`. The Detail page (line 1119) hardcodes the approval workflow as a 3-step Antd `Steps`: Power Engineer Review → Cost Approval (gated at $25K threshold) → Final Sign-off. This is reasonable but suffers from several issues:

- **State machine is a string label, not enforceable.** `deriveApprovalStatus()` in `PowerDesignApprovalPage.tsx:98` is a hash-based pick, not a real state machine. There is no guard preventing "Approved → Draft" backward transition. No audit who/when of each transition.
- **Single-reviewer model.** Real telco governance requires *parallel* reviews: Power engineer, Cost authority (CFO delegate over threshold), Safety officer (BS 6651 surge/earthing), and sometimes a HV reviewer for >11 kV connections. The codebase only supports a serial 3-stage sign-off.
- **No revision tracking.** When designer iterates after "Revision Requested", there is no design version (v1, v2, v3) — the comments in `buildApprovalInfo` are dropped on next save.
- **No SLA enforcement for approvals.** The "Overdue (>14d)" KPI on the dashboard (line 794-800) only counts overdue; there is no escalation, no auto-reassignment, no notification trigger.

### B2. Equipment Lifecycle
The intended state machine is `Specified → Procured → Installed → Commissioned → Operational → Decommissioned`. In the code:
- `EquipmentStatus` enum in `_equipmentData.ts` is `Operational | Under Maintenance | Faulty | Decommissioned | Standby | Planned` — which **conflates lifecycle state with operational state**. "Planned" and "Under Maintenance" cannot coexist in a single field; these are two orthogonal dimensions. (Lifecycle: Specified→Procured→Installed→Decom. Operational state: Operational/Standby/Faulty/Under Maintenance.)
- Procurement stage is missing entirely. No PO reference, no expected delivery date, no inventory-in-transit.
- Decommissioning has no return-to-stock or dispose flow.

### B3. Battery Autonomy Verification Workflow
This is the most engineering-critical workflow and it is **half-implemented**:
- `BatteryAutonomyCalculatorPage` (302 LOC) is a design-time tool only. It computes hours from Ah × V × DoD × temp-derate × aging-derate / load.
- There is **no in-life verification** — i.e., no comparison of the as-designed autonomy vs measured discharge test result captured at commissioning. The `PowerCommissioningFormPage` (line 125-128) records "Achieved Autonomy" but does not write back to the power record. Six months later, no view shows "design vs commissioned vs latest measured" delta.
- No periodic re-test scheduling. Industry standard: capacity test annually for VRLA, every 2 years for Li-ion. `PowerMaintenanceSchedulePage` could carry this but it is not modeled as a battery-specific KPI.

### B4. Fuel Management Workflow
The stated lifecycle is `Tank reading → Forecast → Refill request → Delivery confirmation`. Reality in the code:
- `FuelManagementDashboardPage` (352 LOC) shows current level, days remaining, and a 90-day consumption trend. Good visualization.
- `FuelRecordEntryPage` is 763 LOC — likely full of a manual-entry form with photo upload of dipstick reading. Manual entry is the right level for many emerging markets but the workflow needs **IoT auto-ingest** for modern Tier-1 operators.
- No formal refill request → dispatch → delivery confirmation → reconciliation chain. The "Dispatch Refill" button on the critical-fuel alert (line 277) is a stub.
- No fuel theft detection model (consumption vs runtime hours mismatch). At 100K sites with a fuel mafia problem in many markets, this is critical.

### B5. Grid Connection 6-Stage Pipeline
`GRID_STATUSES` declares 8 states: `Not Started, Applied, Under Review, Approved, Construction, Meter Installed, Energized, Rejected`. `GridConnectionDetailPage`'s `STAGE_ORDER` (line 52) declares 8 with **different labels** (`Applied, Under Review, Approved, Payment, Construction, Meter Installed, Testing, Energized`). The two lists are inconsistent: "Payment" and "Testing" exist in the tracker but not in the status enum. This means filtering will silently drop applications stuck in Payment/Testing.
- **Critical missing stages:** Load study, Wayleave/Permit, Substation upgrade ETA, Demand certificate (kVA), Single-line diagram approval, Test certificate from utility, Energization ceremony scheduling.
- **No utility integration.** Real utilities (NEA Singapore, Eskom South Africa, DEWA UAE, MSEDCL India) have application portals where status changes are pushed. Today everything is manual.
- **No SLA per-utility model.** The `slaBreached` flag is a boolean but real utilities have stage-specific SLAs (Application acknowledgement: 5d, Site survey: 21d, Approval: 60d, Energization: 30d after construction). A single threshold cannot capture this.

### B6. Maintenance Scheduling
`PowerMaintenanceSchedulePage` (431 LOC) distinguishes Preventive / Corrective / Calibration / Inspection. This is correct. What's missing:
- **Frequency-based scheduling logic.** Generators need PM at 250hr / 500hr / 1000hr runtime (not calendar). Today everything is calendar-only.
- **Spare-part availability.** A corrective task with no spare in regional warehouse must show "Blocked – Awaiting Part".
- **Crew skill matching.** The "Assigned Team" is free-text; should join to `Crew & Workforce` (module 11) with skill certifications (electrical license, HV-rated, battery handling).
- **Mean Time Between Failures (MTBF) / Mean Time To Repair (MTTR).** Not tracked anywhere.

### B7. Warranty Tracking
`PowerWarrantyReportPage` (339 LOC) is good for the "expiring soon" dashboard. Missing:
- **Claim workflow.** The "File Claim" action is a toast. There is no claim record, no RMA tracking, no replacement-in-transit state.
- **Warranty terms diversity.** Many vendors offer tiered warranty (e.g., 2yr full + 5yr pro-rated battery). Captured as a single `warrantyExpiry` date — too simplistic.
- **Extended warranty/AMC contracts.** No model.

### B8. Power Sharing Allocation
`PowerSharingAllocationPage` is the **most mature workflow** in the module — 811 LOC of genuinely thoughtful operator-level allocation, daily consumption sparklines, history audit, over-allocation alerts. But:
- **Auto-throttle button is a stub.** Real telecom power-sharing requires actual relay control via a power distribution unit (PDU) over Modbus. There is no SCADA integration shown.
- **Cost allocation methodology is missing.** Operators are charged for kWh consumed plus a share of fixed costs. The page tracks consumption but not invoicing.
- **No SLA on power availability per tenant.** Standard MLA stipulates 99.9% or 99.99% — must show uptime KPI per operator.

### B9. Solar+Hybrid Commissioning
There is no dedicated hybrid commissioning flow. `PowerCommissioningFormPage` tests battery, ATS, generator — but no **solar PV commissioning test** (Voc, Isc per string, MPPT verification, isolation test per IEC 62446). For solar-heavy markets (Africa, India, SE Asia), this is a major omission.

---

## C. Screen-by-Screen Review

### C1. `PowerDashboard.tsx` (936 LOC)
**KPIs:** Sites Energized · Energization Rate · Critical Power Issues · Fuel Risk.

- **"Energized" is conflated with "Commissioned"** at line 248: `if (comm === 'Commissioned' || comm === 'Operational') commissioned += 1;` — but the KPI label is "Sites Energized" while energization is a separate grid-connection state (`'Energized'` from `GRID_STATUSES`). A site can be electrically energized at the meter long before the power plant is commissioned. This is a real domain bug.
- **"Critical Power Issues" threshold of `batteryAutonomy < 2`** ignores tech-specific minima from `TECH_BATTERY_MINIMUMS` (Macro=4, C-RAN=8). A Macro site at 2.5h is below spec but won't trigger this KPI.
- **Fuel Risk threshold `< 7 days`** is reasonable but assumes constant consumption; should be lower (`<5d`) for sites with weekly delivery cycles and higher (`<14d`) for monthly delivery cycles. No per-vendor logic.
- **OPEX figures are hardcoded** at line 430: `electricity = 184000; fuel = 53000; maintenance = 32000`. These are aggregate constants disconnected from `getAllPowerCosts()`. Demo only.
- **Funnel chart conflates Design pipeline (6 stages) with Power Readiness funnel (4 stages: Application → Meter → Energized → Generator Ready)**. Two funnels with overlapping concepts on one dashboard creates confusion.
- The **Pulse Dot + AI Briefing card** is well done — the briefing text "X sites stuck in Y stage" is genuinely useful.

### C2. `PowerDetailPage.tsx` (1,266 LOC)
14 tabs: Overview, Equipment, Battery, Generator (conditional), Solar (conditional), Commissioning, Maintenance History, Cost, Documents, Grid Connection, Power Sharing (conditional), Emergency, Design Approval, Audit Trail.

- **The Architecture Diagram (line 94)** is a static SVG — boxes for Grid / Solar / Generator / Rectifier / Battery / Load with arrows. There is **no live status** overlay (no green/red indicating current power flow). In Vertiv Trellis the equivalent screen shows kW flowing between elements with animated dots. This is the #1 missing feature.
- **Battery tab** shows nameplate Ah, autonomy hours, and "Last Discharge Test … capacity verified at X% of nameplate" — but it's hardcoded in `seededInt`. There is no integration with a BMS, no per-string voltage, no internal resistance reading, no charge/discharge cycle counter.
- **Generator tab** shows runtime, next refill, current fuel — but no engine telemetry (oil pressure, coolant temp, RPM, alternator output frequency).
- **Solar tab** shows daily generation curve (synthetic) and panel count, but no string-level MPPT data, no soiling loss tracking, no shading analysis output.
- **Commissioning tab** is a passive Descriptions list — no link to live test results from the commissioning form.
- **14 tabs is too many.** Information architecture should collapse to ~7: Overview, Architecture, Battery/Generator/Solar combined, Operations (commissioning + maintenance), Sharing, Cost, Documents+Audit.

### C3. `PowerListPage.tsx` (575 LOC)
- Good filtering and density-aware columns. KPI strip is solid (Total, Commissioned, Awaiting Approval, Grid Pending, Issues).
- The "Issues" KPI again uses `batteryAutonomy < 2` (line 172) — same tech-minima bug as the dashboard.
- Bulk Decommission, Bulk Approve, Bulk Export are stubs (`message.warning(...)`).
- **At 100K systems, this list will crash.** `useEntityList('powerSystems', { pageSize: 1000 })` fetches up to 1,000 rows client-side and enriches every row with `getSiteTypeForPower`, `normalizePowerType`, `getDesignStatus`, `getCommissioningStatus`, `getGridStatus`. None of this is server-side. Filtering and search are also client-side (`filtered.filter(...)`). For 100K records this needs a backend index.

### C4. `PowerDesignApprovalPage.tsx` (931 LOC)
The 3-stage Steps with cost-threshold gate is a good pattern. But:
- **No multi-reviewer parallel approval.** Real telcos need RACI: Engineer (Approver), Cost (Approver if >threshold), Safety (Consulted), Construction (Informed).
- **Comparison rows (`getComparisonRows`)** hardcode "Equipment List … 12 items" — not derived from real equipment count.
- The "Cost Approval (skipped)" step when below $25K is correct logic but doesn't show the org policy reference.

### C5. `MacroPowerDesignForm.tsx` (1,186 LOC)
This is the deepest form in the module:
- 10 sections (Identification, Architecture, Load, Battery, Solar, Generator, Grid, Earthing, Equipment, Documents) with embedded calculator modals.
- **Cyclomatic complexity is high.** Conditional sections (showSolar, showGenerator, showGrid) based on a Power Type dropdown is sensible, but at 1,186 LOC it should be decomposed.
- **Equipment table is decoupled from Asset Inventory.** Rows are free-text vendor/model — should be lookups from the equipment catalog.
- **No design validation rules engine.** E.g., "If Macro + battery autonomy < 4h, block submit". Validation is missing.
- **No design comparison to similar sites.** "Sites of this type typically have 5kW rectifier and 4h battery" — a copilot feature would be valuable here.

### C6. `FuelManagementDashboardPage.tsx` (352 LOC)
- **KPIs are good:** Generator Sites, Low Fuel, Critical, Refilled This Week, Avg Days Remaining, Monthly Fuel Cost.
- **30-day heatmap** is excellent visualization — but cells are uniform width without weekend/weekday distinction. Adding day-of-week column header would help spot patterns (some sites burn more on weekends).
- **No real-time tank level.** Levels are static `currentLevelPct` numbers from `getAllFuelSites()`. Need IoT integration.
- **Consumption trend is network-wide aggregate** — missing per-site drill-down.

### C7. `GridConnectionTrackerPage.tsx` (318 LOC)
- 8 stage tabs as chips, SLA-breached filter, search, utility/region filters.
- **Coordination with utility is missing.** No "Submit Document" workflow, no inbox of utility responses, no email/letter template system, no contact directory per utility region.
- **No load study integration.** Real utility applications require a load study showing maximum demand, diversity factor, load growth assumptions. None of this is captured.

### C8. `BatteryAutonomyCalculatorPage.tsx` (302 LOC)
- Inputs: Load, Tech, Chemistry, Capacity (Ah), System Voltage, DoD, Temperature, Aging.
- Formula at line 47-62: `effectiveAh = capacityAh × (dod/100) × tempFactor × agingFactor; effectiveKWh = effectiveAh × V / 1000; autonomy = effectiveKWh / load`. This is **simplified and incorrect for non-constant load**. Real telecom load varies (radio Tx bursts, cooling cycles); Peukert effect at high discharge rates is ignored.
- DoD slider min is 50% (correct for VRLA), max 100% — but LiFePO4 spec is 90%, Lithium-Ion 80%, VRLA-AGM 50%. The slider should derate based on selected chemistry.
- "Capacity for {minHours} h" metric at line 250 has a bug: the label is a string literal with `${minHours}` not interpolated — it renders the placeholder `${minHours}` not the value.
- No string configuration (parallel/series), no Peukert constant per chemistry, no end-of-life capacity assumption (typical 80% EoL).

### C9. `SolarSizingCalculatorPage.tsx` (339 LOC)
- Inputs: Load, Peak Sun Hours, Panel W, Efficiency, Losses, Autonomy Days, Cost per Wp.
- Formula: panels = ceil(dailyEnergyRequired × autonomyDays / panelDailyKWh). This is the **off-grid sizing formula** but applied indiscriminately. For grid-tied or hybrid the formula should differ.
- **Missing inputs:** Latitude (drives sun-hour estimation), Tilt angle, Azimuth, Shading factor (typical 5-15% loss), Inverter efficiency, Temperature derate (panels lose ~0.4%/°C above 25°C), DC/AC ratio.
- **No irradiance data source.** Sun hours is a manual input rather than pulled from NASA POWER, Solargis, or PVGIS for the site coordinates. At 100K sites this must be automated.
- "Efficiency" input (10-30%) is captured but unused in the formula (only `losses` is applied). Bug or design choice?
- Cost per Wp range of $0.10–$3.00 is correct for global utility-scale ($0.30–$0.80) and rooftop ($0.80–$2.00) markets.

### C10. `PowerLoadCalculatorPage.tsx` (421 LOC)
- Categories: Radio, Transmission, Cooling, Lighting (Indoor + FAA), Ancillary (losses + aux).
- 10% engineering headroom recommended — correct industry practice.
- **Initial radio equipment:** gNodeB n77 64T64R at 700W × 3 = 2,100W. This is realistic for mid-band massive MIMO at 100W per RRU plus base. Good.
- **Missing:** 24-hour load profile. Real telecom load varies from 60% baseline (night) to 100% (peak hour). Power systems are sized for peak, but battery autonomy needs to be sized for typical load + headroom. There is no profile.
- **No PoE budgeting** for small cells / WiFi.
- **No future expansion factor** (typically + 30% for 5-year growth).

### C11. `PowerSharingAllocationPage.tsx` (811 LOC)
This is genuinely impressive work:
- Circular capacity gauge with stacked operator segments + reserve + free.
- Per-operator table with Allocated / Consumed / % Used / Status / 30d trend sparkline.
- Expandable row showing daily consumption area chart.
- Over-allocation alert strip with "Send Notification" and "Auto-throttle" buttons.
- History timeline with from→to kW changes.
- Add/Edit allocation modals.

**Gaps:**
- **Time-of-use cost allocation.** Operators get billed at peak vs off-peak rates. Not modeled.
- **Energy metering per tenant.** The page shows allocated kW (peak) and consumed kW (snapshot) but real billing is in kWh over the month. No kWh column.
- **Auto-throttle is a stub.** Real throttle requires PDU integration over Modbus or SNMP.
- **No alarm escalation tiers.** Repeated over-allocation should escalate to legal/contract owner.

### C12. `PowerWarrantyReportPage.tsx` (339 LOC)
- Good "expiring in 30 / 90 days" KPIs and critical alert banner.
- Row coloring (critical=yellow, expired=red) is correct affordance.
- **Missing:** Claim history per equipment. Renewal cost projection. Vendor performance scorecard (claim resolution time).

### C13. `PowerCommissioningFormPage.tsx` (600 LOC)
5 test steps: Voltage Test, ATS Transfer Test, Battery Discharge Test, Generator Start Test, Load Test.

- ATS transfer threshold of 15s (line 122) — correct per IEEE 446 (transfer should be <10s for telecom-grade ATS, but 15s is acceptable for older equipment).
- Battery discharge: 8 hours minimum, end voltage > 44V (for 48V system — equivalent to 1.83 V/cell, correct cutoff for VRLA).
- Generator startup time <30s — correct (typical 10-15s achievable, 30s is the spec ceiling).
- Override flow (`overrideOpen`, `overrideApplied`) lets the engineer bypass a failed test with rationale — **good governance**, but needs sign-off by a senior role, not just any user.

### C14. `PowerCommissioningReportPage.tsx` (349 LOC)
- Printable PDF-friendly report with explicit `@media print` CSS — well done.
- Hardcoded data ("MUM-0042 / PWR-0001") indicates this is largely a presentation shell, not yet wired to commissioning form output.

---

## D. Telecom Domain Validation (CRITICAL)

### D1. Battery Systems

**Chemistries supported (powerProfiles.ts line 288):** VRLA-AGM, VRLA-GEL, Lithium-Ion, LiFePO4, NiCd. Correctly catalogued with nominal DoD (50/60/80/90/80%) and cycle life (500/700/3000/5000/1500). LiFePO4 correctly identified as "best for telecom backup" — matches industry trend toward Narada, BYD, Pylontech, Huawei SmartLi.

**Tech-specific autonomy minima (line 278):**
- Macro: 4h ✓ (typical macro spec; some 3GPP/operator policies require 6-8h)
- Small Cell: 2h ✓ (acceptable; some operators specify just 30min)
- DAS: 1h ✓ (matches building UPS handoff)
- WiFi: 0h ✓ (relies on host UPS)
- MW Repeater: 4h ✓ (could be 8h for remote MW)
- C-RAN Hub: 8h ✓ (data-center class)

**Temperature derating (line 327):** Curve goes from 0.72@-10°C to 1.0@25°C to 0.78@50°C. Correct shape; **40°C factor of 0.9 is optimistic** — real VRLA at 40°C loses 30-40% capacity, not 10%. The table looks like it's for Li-ion. The same table is applied to all chemistries — this is a bug. Should be chemistry-specific.

**Missing:**
- **C-rates.** No distinction between C/10, C/8, C/3 discharge rates. A 200Ah battery at C/3 (66A draw) delivers far less than C/10 (20A draw) — Peukert equation. Calculator doesn't apply it.
- **Float voltage / Equalize voltage.** Not in the form (should be 2.27 V/cell float for VRLA, 2.40 V/cell equalize).
- **String configuration.** 2V cells in series (24 cells for 48V) vs 12V monoblocs in series (4 in series). Not modeled.
- **Cell-level monitoring.** No per-cell voltage, no internal resistance, no temperature per cell. BMS integration absent.

### D2. Generators

**Capacities tracked:** `generatorCapacity` in kVA — correct unit. **Fuel types:** Diesel, Petrol, LPG, Natural Gas (`FUEL_TYPES` line 118 of MacroPowerDesignForm) — comprehensive.

**Missing:**
- **Fuel consumption rate per kVA-hr.** Industry standard ~0.25-0.35 L/kWh at 75% load for diesel. Not modeled. Forecast accuracy will suffer.
- **ATS timing < 10s** — captured in commissioning form (<15s threshold). Could be tighter.
- **Maintenance intervals (250 / 500 / 1000 hr).** Not modeled — current maintenance is calendar-based only.
- **Emission compliance.** No Tier 4 Final, BS V, Euro Stage V tracking. Modern operators in EU, India, China have strict diesel genset emission rules that affect site permits.
- **Sound attenuation enclosure rating.** dBA at 7m. Not modeled — affects urban site approval.
- **Block heater / starting battery** state of charge — critical for cold-start in winter.

### D3. Solar/Hybrid

**Panel wattage:** Default 580W in `PowerDetailPage.tsx:490` (`Math.round(power.solarPanelCapacity * 1000 / 580)`). 580W is realistic for 2024 bifacial modules. Calculator allows 100-800W range — good.

**Missing:**
- **Bifacial gain factor.** Bifacials gain 5-15% from rear-side irradiance, depending on albedo. Not modeled.
- **MPPT trackers count.** Critical for string vs micro-inverter design.
- **String vs micro inverter** choice. Form gives no such selection.
- **Hybrid controller logic priority.** "Solar > Grid > Battery > Generator" sequence is the typical priority. Not configurable in design.
- **Tilt/azimuth optimization.** PowerDetailPage line 496 shows "Ground / Tilt 22°" as a static label, not derived from latitude. 22° is right for ~25°N latitude (much of South India, southern China) but wrong for higher latitudes.
- **Shading analysis.** Mentioned nowhere — typical losses 0-15%.
- **Irradiance data integration.** Mentioned as a gap above. At 100K sites this must be a backend service.

### D4. Grid Connection

**Connection types (line 120 MacroPowerDesignForm):** Single Phase (240V), Three Phase (415V), HV (11 kV+). The 415V three-phase is European/Indian standard; US uses 208V/480V — should be region-aware.

**Missing:**
- **LV/MV/HV classification.** No explicit demarcation. LV = <1kV, MV = 1-33kV, HV = >33kV.
- **Demand charge model.** Real industrial tariffs include kW demand charges (peak kW × $/kW) which can exceed energy charges. Not modeled.
- **TOU (Time-of-Use) tariffs.** Peak/Shoulder/Off-Peak/Critical-Peak pricing. Not modeled.
- **Power factor.** Most utilities penalize PF < 0.95. No kVAR compensation (capacitor bank) tracking.
- **Net metering / export tariff** for solar feed-in. Not modeled.

### D5. Power Sharing (Detailed)

**Operator allocation logic** (line 89 PowerSharingAllocationPage): 80% allocatable, 10% reserve, 10% free. This is the industry pattern.

**Missing:**
- **Per-operator metering hardware.** Real shared sites use SmartMeter per tenant. Not modeled.
- **Bill-back invoicing.** Tracked consumption but no invoice generation.
- **SLA on power availability** per tenant.
- **Curtailment policy** when total exceeds capacity. Allocation is shown but enforcement isn't.

---

## E. Data Review

### E1. Battery Autonomy by Site Type
`getBatteryAutonomyByTech()` returns avg & threshold per tech (Macro 4h, C-RAN 8h, etc.). Thresholds match domain norms (D1 above). The avg values are computed from the seeded data set — appear reasonable.

### E2. Fuel Days Remaining
`<7d` flagged as risk; `<14d` warning. **Issues:**
- Doesn't account for refill cycle (weekly vs monthly vendor schedule).
- Doesn't account for seasonal consumption (winter generators run more in cold regions).

### E3. Solar 30-day Generation Curve
`SolarCurve` (PowerDetailPage line 171) generates synthetic data via `seededInt(...18,42)`. The 18-42 kWh range for typical 5kWp array at 4.5 kWh/kWp/day suggests good summer days — but no seasonality, no weather variation. Demo only.

### E4. Cost 12-Month Stacked Bar
Three categories: Electricity, Fuel, Maintenance. **Missing:** Lease, Insurance, Telemetry connectivity (SIM cost), security/CCTV power, water (cooling tower) — all real OPEX line items missing.

### E5. Top Fuel Sites Table
Top 10 by `daysRemaining` ascending — correct prioritization for action.

### E6. Equipment Vendor List
`['Eltek', 'Vertiv', 'Delta Power', 'Schneider Electric', 'Narada', 'Cummins', 'Jinko Solar', 'ABB']` (PowerDetailPage line 261):
- **Rectifiers:** Eltek (now Delta Energy Systems brand), Vertiv (formerly Emerson Network Power), Delta Power, Schneider — ✓ accurate top-tier set.
- **Batteries:** Narada — ✓ major Chinese telecom battery vendor. Missing: EnerSys, C&D Technologies (PowerSafe), Hoppecke, BYD, Pylontech, Huawei SmartLi. EnerSys appears in MacroPowerDesignForm initial equipment.
- **Generators:** Cummins — ✓ industry-leading. Missing: Caterpillar, Kohler, FG Wilson (now Caterpillar), Atlas Copco, Aksa.
- **Solar:** Jinko Solar — ✓ accurate. Missing: Trina, Longi, JA Solar, Canadian Solar.
- **ABB** is generic; could be more specific (ABB switchgear, ABB transformers).
- **Missing crucial vendor categories:** SCADA/monitoring (Vertiv Trellis, Schneider EcoStruxure, ABB Ability, Siemens Sentron Powermanager); BMS (Atlantic Battery, NUVATION, Eltek Smart); Inverters (SMA, Fronius, Sungrow, Huawei FusionSolar).

---

## F. Scalability Review

### F1. Power Dashboard at 100K Sites
**Current state:** `useEntityList('powerSystems', { pageSize: 1000 })` fetches up to 1,000 records. All KPI computations are client-side `Array.filter` over `systems`. At 100K records:
- API will need server-side aggregation endpoint (`/api/power/dashboard/kpis`).
- Fuel risk count over all systems via `getAllFuelSites()` then `filter(daysRemaining < 7)` — client-side iteration of 100K rows is infeasible. Move to materialized view.
- Funnel chart counts (Application/Meter/Energized/Generator Ready) need server-side `GROUP BY status`.

### F2. Equipment Inventory at 1M+ Records
The current `PowerEquipmentListPage` does client-side filter/search/sort. At 1M:
- Search must use server-side indexed text search (PostgreSQL `tsvector`, Elasticsearch).
- Filter must be server-side.
- Density-aware columns are nice but don't help backend load.

### F3. Maintenance Schedule at Scale
`PowerMaintenanceSchedulePage` loads all tasks via `getMaintenanceTasks()` — also unbounded. At 1M equipment items × ~4 tasks/year = 4M task records.
- Must move to time-range query (default current month + next 90 days).
- Calendar view at year-level needs aggregate counts per day, not full task hydration.

### F4. Real-Time Alarm Feed Bandwidth
The dashboard has no real-time push (no WebSocket, no SSE shown). For 100K sites:
- Polling every minute = 100K reads/min on the database. Untenable.
- Need event-driven architecture: site emits alarm via MQTT/Kafka → fan-out → only changed cells re-render.

### F5. DCIM-Level Monitoring
Current screens are descriptive, not real-time. A real DCIM (Vertiv Trellis, Schneider EcoStruxure) handles:
- 10s polling on every rectifier/PDU
- 1s polling on critical alarms
- 100K+ data points per site
- Time-series database (InfluxDB, TimescaleDB) for retention

**Verdict:** None of this is present. The module is currently a *system of record* not a *system of monitoring*. To compete with Vertiv/Schneider it must add real-time observability.

---

## G. AI Opportunities (Highest Value)

### G1. Fuel Demand Forecasting
**Inputs:** Historical consumption per site, weather (cold = more genset hours, hot = more cooling load), site load growth, refill schedule, vendor lead time.
**Output:** "Site MUM-0042 will hit 10% on 2026-06-04; recommend refill order by 2026-06-01."
**Value:** Reduce stockouts at remote sites; reduce emergency-refill premiums (often 2-3× scheduled price).

### G2. Battery Life Prediction
**Inputs:** Charge/discharge cycle count, capacity test trend, temperature exposure history, age.
**Output:** "Battery PWR-1245 has 12 months remaining at 80% EOL threshold. Recommend replacement budgeting for Q3."
**Value:** Avoid unplanned battery failures (causes hours of outage); smooth CAPEX cycles.

### G3. Solar Generation Forecast
**Inputs:** Weather API (cloud cover, irradiance), seasonal sun-hour curves, panel soiling estimates.
**Output:** Day-ahead generation forecast → battery/grid dispatch optimization.
**Value:** Optimize hybrid controller; reduce grid import; meet PUE targets.

### G4. Predictive Maintenance
**Inputs:** Rectifier output voltage trend, ripple voltage, temperature, fan RPM, battery internal resistance trend, generator vibration.
**Output:** Failure probability score per equipment item.
**Value:** Shift from preventive (calendar-based) to condition-based maintenance; reduce truck rolls by 30-40%.

### G5. Anomaly Detection (Voltage/Current Patterns)
**Inputs:** Time-series of -48V DC plant voltage, AC mains voltage, current.
**Output:** "Site BLR-0012 shows unusual current spike at 03:14 UTC; investigate."
**Value:** Detect cable theft, equipment tampering, fault precursors.

### G6. Cost Optimization
**Inputs:** Tariff schedule (peak/off-peak), demand charges, solar availability, battery SoC.
**Output:** "Charge battery 00:00-04:00 (off-peak), discharge 18:00-22:00 (peak). Saves $X/month per site."
**Value:** Peak shaving at scale (100K sites × $50/mo = $60M/yr).

### G7. Generator Dispatch Optimization
**Inputs:** Grid reliability score, weather forecast, fuel level, load forecast.
**Output:** Pre-start generator before predicted outage; throttle to minimize fuel.
**Value:** Reduce diesel cost; reduce mean time to backup; emissions reduction.

---

## H. UX & Visualization Improvements

### H1. Real-Time Architecture Diagram with Live Status
The static SVG in PowerDetailPage should animate: green arrows for active power flow (Grid→Rectifier→Load), red/amber for stressed paths. Kilowatt values on each line, refreshed every 10s.

### H2. Site Power Flow Visualization (Live)
A Sankey-style diagram showing kW flowing from sources (Grid 4.2kW, Solar 1.8kW, Battery 0.0kW) → through rectifier/inverter → to loads (Radio 3.5kW, MW 0.5kW, Cooling 1.8kW, Aux 0.2kW).

### H3. Mobile Fuel Attendant View (Simplified)
Field worker arrives at site to refill: scan QR → see "Tank: 850L of 2000L · Add 1150L · Take meter photo · Confirm". Today's interface is desktop-only.

### H4. Anomaly Drill-Down from Alarm
Today the alarm banner says "Battery autonomy critical at X site" with "View" navigating to detail. Should drill into a *focused* anomaly view: timeline of voltage trend, comparison to baseline, suggested root cause.

### H5. Heatmap by Region for Fuel Risk
Currently the fuel heatmap is per-site (30-day vertical heatmap). Add a **map-based view** showing fuel risk by region — same data, geographic context. (The GIS module exists but is not integrated.)

### H6. 14-Tab Detail Page Reduction
Collapse to ~7 tabs: Overview · Architecture · Power Source (Battery + Generator + Solar combined, with sub-tabs) · Operations (Commissioning + Maintenance) · Sharing · Cost · Documents+Audit.

---

## I. Technical Architecture

### I1. SCADA Integration
**Required protocols:** Modbus TCP/RTU (most rectifiers, ATS, PDU), OPC-UA (modern DCIM standard), DNP3 (utility / substation), IEC 61850 (substation automation), SNMP v2c/v3 (legacy network gear), MQTT (IoT gateway).
**Current state:** None present.

### I2. BMS Integration
**Modern BMS protocols:** CAN bus (battery-internal), Modbus TCP (string-level monitoring), proprietary REST (Huawei SmartLi, BYD Battery-Box).
**Required telemetry:** Per-cell voltage, per-cell temperature, charge/discharge current, SoC, SoH, cycle count.
**Current state:** None present.

### I3. DCIM Integration
Should expose REST APIs compatible with Vertiv Trellis, Schneider EcoStruxure, Eaton Brightlayer for southbound integration. Should consume northbound from in-house DCIM if operator runs one.

### I4. Fuel Sensor IoT Protocols
- **LoRaWAN:** ~10km range, low power, perfect for remote sites with no cellular.
- **NB-IoT:** Telco-friendly, low data rate, low power.
- **2G/3G with M2M SIM:** Common in legacy fuel sensors.
- **LTE-M:** Increasing adoption.

Sensor hardware (Tank Logix, Banlaw, Tek-Trol, Endress+Hauser) all expose proprietary cloud APIs — must integrate.

### I5. Real-Time Data Streaming Architecture
**Required:**
- Time-series database (TimescaleDB / InfluxDB / Prometheus) for telemetry retention.
- Stream processor (Kafka + ksqlDB, Flink) for windowed analytics.
- WebSocket gateway for live dashboard updates.
- Alarm rules engine (e.g., Drools, custom Lambda).

**Current state:** Absent.

---

## SCORING

| Dimension | Score (1-10) | Rationale |
|---|---|---|
| **Workflow Completeness** | **5** | Design lifecycle present; equipment lifecycle confused; fuel/grid workflows shallow; commissioning lacks live test integration; no claim workflow. |
| **UX Quality** | **7** | Excellent dashboard composition, Power Sharing page is best-in-class, density-aware tables, AI briefing card. 14 tabs is too many. |
| **Telecom Domain Accuracy** | **6** | Vendor list is right; battery chemistries correct; tech autonomy minima reasonable. But temperature derating not chemistry-specific; no Peukert; no C-rates; no solar bifacial/MPPT; no generator emission tier; tariff/demand charges missing. |
| **Data Quality** | **5** | Seeded data is deterministic and consistent but synthetic. OPEX hardcoded. Solar curves synthetic. Real IoT/SCADA inputs absent. |
| **Scalability** | **3** | Everything is client-side at 1,000-row pageSize. At 100K sites it will not function. No real-time push. No time-series store. |
| **AI/Copilot Readiness** | **3** | One static AI briefing card. No forecasting, no predictive maintenance, no anomaly detection, no optimization. Huge opportunity. |
| **Integration / OSS-BSS Readiness** | **2** | No SCADA, no BMS, no DCIM, no fuel IoT, no utility portal integration, no billing integration. The most painful gap. |
| **Overall** | **5** | Solid system-of-record skeleton with one standout module (Power Sharing). Far from a DCIM-class product. |

---

## TOP 10 PRIORITY FIXES

1. **Fix the "Energized vs Commissioned" data model bug.** `PowerDashboard.tsx` line 248 treats commissioning status as energization. They are different states (grid energization comes before plant commissioning). Add `gridEnergizedAt` and `plantCommissionedAt` as separate timestamps; show both KPIs separately.

2. **Apply tech-specific battery autonomy thresholds in alerts.** Both `PowerDashboard.tsx:254` (`batteryAutonomy < 2`) and `PowerListPage.tsx:172` use a single 2-hour cutoff for "critical battery". Replace with `batteryAutonomy < TECH_BATTERY_MINIMUMS[siteType]`. Macro at 3h should alert; WiFi at 1h should not.

3. **Resolve Asset Inventory / Power Equipment dual registry.** Designate Asset Inventory as system-of-record for serial number, vendor, model, warranty, purchase cost. Power Systems extends with power-specific fields via foreign key. Remove `PowerBulkImportPage` and `PowerEquipmentListPage` in their current form — they duplicate Asset Inventory.

4. **Integrate fuel telemetry IoT.** Replace the manual `FuelRecordEntryPage` (763 LOC) with auto-ingest from tank-level sensors (LoRaWAN / NB-IoT) and a fallback manual entry path. Add fuel-theft anomaly detection (consumed vs run-hours).

5. **Connect commissioning form output to power record state.** `PowerCommissioningFormPage.tsx` captures Battery Discharge Achieved Autonomy, ATS Transfer Time, Generator Startup Time — but these are not persisted back to the power record. Wire it so the Battery tab shows "Designed 8h / Verified 8.5h / Last Re-test 2026-04-15 — 7.9h". This single change makes the module 30% more useful.

6. **Replace static architecture diagram with live power-flow diagram.** Add kW values on each line, color-code active/inactive paths, refresh from telemetry. Single biggest UX win versus Vertiv Trellis.

7. **Add AI fuel demand forecasting.** Train a model on per-site historical consumption + weather + load curve to predict refill date with ±2 day accuracy. Surface as "Predicted refill: 2026-06-04 (94% confidence)" on the Fuel page and as proactive work-order creation 5 days ahead. ROI: reduce emergency refills (typically 2-3× scheduled price) at scale.

8. **Implement real grid connection workflow with utility-specific SLA.** Each utility has a stage-specific SLA (e.g., MSEDCL Acknowledgement: 5d, Survey: 21d, Approval: 60d). Add `UTILITY_SLA_TABLE` keyed by `utilityProvider`. Auto-flag breach per stage, not just overall.

9. **Build a power design rules engine.** Add design-time validation: "Macro + Generator absent + remote location = warn"; "Battery autonomy < tech minimum = block submit"; "Solar < 60% of load on hybrid design = warn"; "Cost estimate > $25K without dual approval = block submit". Today the form lets bad designs through silently.

10. **Refactor PowerDetailPage from 14 tabs to 7.** Combine Battery/Generator/Solar into a "Power Source" tab with sub-navigation; merge Commissioning+Maintenance into "Operations"; merge Documents+Audit. The current 14-tab UI is hostile to operators making real decisions in <30 seconds.

---

## Comparison vs Industry Benchmarks

| Capability | RAN App (today) | Vertiv Trellis | Schneider EcoStruxure | Eaton Brightlayer | Huawei iPowerCube |
|---|---|---|---|---|---|
| Real-time monitoring | ✗ | ✓ | ✓ | ✓ | ✓ |
| BMS / Cell-level data | ✗ | ✓ | ✓ | ✓ | ✓ |
| Fuel IoT ingest | ✗ | ✓ | ✓ | ✓ | ✓ |
| Hybrid optimization | ✗ | ✓ | ✓ | partial | ✓ |
| PUE / Energy efficiency tracking | ✗ | ✓ | ✓ | ✓ | partial |
| Multi-tenant sharing & billing | partial | partial | partial | ✗ | partial |
| Design lifecycle | ✓ | partial | partial | ✗ | partial |
| Grid connection workflow | partial | ✗ | ✗ | ✗ | partial |
| Predictive maintenance ML | ✗ | partial | ✓ | ✓ | ✓ |
| Mobile field interface | ✗ | partial | ✓ | partial | ✓ |

**Net positioning:** RAN App's Power module is a strong **system-of-record for design and configuration** but lags meaningfully on **system-of-monitoring and system-of-optimization**. To compete, the next 12-month roadmap must prioritize live telemetry ingestion, predictive analytics, and tighter Asset/Site/Sharing module integration.
