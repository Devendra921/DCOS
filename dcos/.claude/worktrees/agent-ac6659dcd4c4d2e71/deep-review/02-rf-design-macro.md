# Deep Review — RF Network Design (Macro / Small Cell Sub-Module)

**Reviewer:** RF Engineering Architect (20+ yrs, Ericsson / Nokia / Huawei)
**Review Date:** 2026-05-26
**Scope:** Macro RF, Small Cell, generic design workflows (Design Type Selector → Forms → Detail → Review → Freeze → CR → Audit → Templates → Bulk Import → Planning Tool Import → Parameter Search)
**Files audited (full reads):** RFDashboard.tsx (958 L), RFDesignDetailPage.tsx (1,396 L), RFDesignListPage.tsx (310 L), MacroDesignListPage.tsx (364 L), SmallCellDesignListPage.tsx (418 L), SmallCellDesignDetailPage.tsx (917 L), MacroRFDesignForm.tsx (1,303 L), SmallCellRFDesignForm.tsx (680 L), SectorConfigPage.tsx (405 L), DesignTypeSelectorPage.tsx (436 L), DesignReviewApprovalPage.tsx (744 L), DesignFreezePage.tsx (481 L). Skim reads: DesignTemplateLibraryPage, DesignVersionComparisonPage, DesignAuditTrailPage, DesignChangeRequestListPage, BulkDesignImportPage, RFPlanningToolImportPage, DesignParameterSearchPage, PCIConflictAnalysisPage.

---

## A. Module Purpose Validation

The Macro / Small Cell sub-module **is the correct foundational artifact** for an end-to-end rollout platform — every downstream module (Quality, Integration, OSS, Power, MW link sizing) must read from a frozen RF baseline. The platform models this well in principle: a single `rfDesigns` entity with explicit lifecycle states, technology discriminator (`technology: 'LTE' | '5G NR' | 'Multi-RAT'`), and a `scopeId` foreign key to a `site`. That part is sound.

**Where the modeling falters:**

1. **Macro vs Small Cell is poorly separated at the data layer.** Both list pages (`MacroDesignListPage`, `SmallCellDesignListPage`) read from the *same* `rfDesigns` collection but `SmallCellDesignListPage` then ignores it entirely and synthesises 42 records via `generateDesigns()`. The Small Cell entity has fields (CBRS grant, SAS provider, channel, environment Indoor/Outdoor, mount type, power class in Watts) that the Macro entity does not. These are *fundamentally different domain objects* and should live in distinct tables (`macroDesigns`, `smallCellDesigns`) sharing a common `designs` parent for lifecycle. Today, the polymorphism is fragile — `RFDesignListPage` mixes everything ("RF & Network Designs"), `MacroDesignListPage` filters by `technology === 'LTE' || '5G NR'`, and there is no integrity gate that prevents a Small Cell record from being displayed in the macro list.

2. **Overlap with C-RAN/vRAN is undefined.** C-RAN module models gNodeB/eNodeB as DU + CU + RU components mapped via `RUDUMappingFormPage`. The Macro RF Design holds `txPower`, `mimo`, `antennaModel` — but these are RU-level concerns once C-RAN is in play. Today these two modules talk past each other: the RU in C-RAN does not link back to the Macro RF design that drives the RU's azimuth/EIRP. A real Tier-1 deployment needs the RF design → DU/CU mapping → site integration to share IDs, otherwise the same cell is configured twice (Atoll-style RF and Ericsson-style CU/DU XML), invariably drifting. Clear boundary needed: **RF Design owns "what the antenna does";  C-RAN owns "what the baseband does"; they share Cell-ID, PCI, EARFCN as the contract**. This contract is missing.

3. **No deployment hand-off.** The Macro detail page has "Freeze" and "Export to BOM" but no `handoffToBuild()` action. The Quality & Acceptance and Site Lifecycle modules cannot subscribe to "frozen design ready for integration" events. A `DesignReleasedForBuild` state should fan out to Quality (commission checklists), Procurement (BOM order), Crew (work order generation). Today this is purely manual.

4. **Missing capabilities (critical gaps):**
   - **Drive test integration** — no upload of TEMS / Nemo / Accuver drive-test logs to retro-validate predicted vs measured coverage.
   - **OSS sync** — no `pollFromOSS()` that pulls live PCI/EARFCN from Ericsson ENM, Nokia NetAct, Huawei iManager U2020 to detect "as-designed vs as-deployed" drift.
   - **Capacity planning ties** — `capacityTarget: 800 Mbps` is just a free-text number, not linked to user-density × spectral-efficiency calculations or to the Capacity Bottleneck Forecast widget that would naturally live in this module.
   - **Frequency-reuse pattern** — no `1/3 reuse` vs `1/1 reuse` declaration, no automatic cluster-level visualisation.
   - **Antenna catalogue is hardcoded** — 7 antennas in `ANTENNA_MODELS` array. Real platforms have 2,000+ antenna SKUs in a managed catalogue with vendor pattern files (.msi / .pln).

---

## B. Workflow Audit

The design lifecycle declared in `RFDesignListPage`:

```
['Draft', 'Submitted', 'Review', 'Approved', 'Frozen', 'Rejected']
```

The `useRFDesignActions` hook implements transitions: `create → submit → approve | reject → freeze → unfreeze → newVersion → supersede → delete`. This is a reasonable skeleton, but several issues:

| Issue | Detail |
|---|---|
| **State terminology is inconsistent** | Code mixes `'Approved'`, `'Implemented'`, `'Superseded'`, `'Frozen'`. The list page enum has `'Frozen'`, but `effectiveIsFrozen` in detail page checks `Frozen \| Implemented \| Approved` — meaning **Approved == Frozen for editability purposes**, which contradicts the explicit Freeze button workflow. A design that is just Approved should still be technically editable until explicitly Frozen. The two-step "Approved → Frozen" gate (typical at Tier-1 ops) is collapsed here. |
| **No `Released` state** | After Frozen, real deployments need a "Released to Build" gate — the moment when Crew sees it, Procurement orders the BOM, Quality opens the commissioning checklist. Currently a Frozen design just sits there. |
| **No `Superseded` UX surface** | Code references `Superseded` in `rfdActions.ts` but no list page filter shows it. New versions don't auto-supersede the prior one with an audit trail link. |
| **Design Freeze workflow** | `DesignFreezePage` has a freeze-history table (good) and an unfreeze-with-reason gate (good) — but the linked-CR table to a frozen design is mocked, not actually linking to real CRs. Unfreeze should be **disallowed if open CRs exist** (a CR is the formal modification path; unfreezing while CRs are in flight is process-violating). No such gate. |
| **Design CR workflow** | `DesignChangeRequestListPage` has urgency P1–P4 with mocked SLAs. Not linked to a parameter diff — a real CR says "change PCI from 256 → 312 for cell SITE-NYC-0042/S1", today it's just freeform text. The CR should reference a specific field path and the after-value, enabling a one-click "apply CR" that mutates the frozen design into a new version. |
| **Multi-version comparison** | The drawer in `RFDesignDetailPage` (lines 1140–1211) shows 7 hardcoded `compareRows`. Same in `DesignVersionComparisonPage`. **No actual version history is persisted** — when "New Version" is clicked, the prior record is supposedly superseded but the form data is identical. A real impl needs an immutable parameter-snapshot per version, with a structural diff that handles array additions/removals (e.g., sectors added). |
| **Planning tool integration** | `RFPlanningToolImportPage` lists Atoll, Planet, ASSET, iBwave, Mentum. Import wizard is mocked. Export is unidirectional (CSV / Atoll `.atl.txt`). No round-trip — once changed in Atoll, no upload-back path. No conflict resolution if the designer touched parameters in both systems. |
| **Hand-off to deployment** | Missing. The "Submit Change Request" button in detail page navigates to `/rf-design/{id}/change-request` — that's an internal RF workflow, not a deployment hand-off. There is no path that says "I'm done; ship this to Crew / Field." |

**Workflow Completeness verdict:** the skeleton exists, the gates are mostly absent.

---

## C. Screen-by-Screen Review

### 1. RFDashboard.tsx (958 L) — **Mixed**

KPI tiles (Total / Approved / PCI Conflicts / Pending CRs) are reasonable, the hero PCI Conflict Trend (12 weeks) is the right primary viz. **Problems:**

- **`pciConflicts` calc is wrong** (lines 207–213). It compares `band-pci` key and counts duplicates, but real PCI conflicts are spatial — two cells with the same PCI within ~5× the inter-site distance, or that appear in each other's neighbor list (mod-3 collision, confusion, etc.). Counting global duplicates of `band-pci` will fire on every single n78 cell with PCI 256 across the country, producing thousands of false positives in a real network.
- **`openCRs` is `38 + (total % 11)`** — pure fabrication, not derived from the CR table. The CR Resolution by P1–P4 table is also fully hardcoded (lines 305–312). For a dashboard claiming "SLA: 82%", these need to come from real CR records.
- **`agedReviews` uses `updatedAt > 7d`** — but `updatedAt` mutates on any field change including comments; using `submittedAt` would be telecom-correct.
- `designerWorkload` (lines 315–326) — a useful concept but only counts the current filtered slice; should compute against a leveling target (e.g., 8 designs per designer/week as nominal capacity) and show over/under-utilisation, not a raw count.
- **Approval cycle histogram** (1–34 d) is hardcoded — no real distribution. Histogram bins are conceptually OK.
- **Filters: Region & Project are hashed from design.id** (`designMeta` lines 113–123). Region/Project are first-class business attributes that must live on the record, not be hash-fabricated.

**Score: 5/10.** Good structural composition, weak data correctness.

### 2. RFDesignDetailPage.tsx (1,396 L) — **Strong structurally, shallow on telecom depth**

7-tab layout (Sectors, Neighbors, PCI, Coverage, Documents, Change Requests, Audit) is the right information architecture.

- **Sectors tab (table)** has 18 columns: Az / M-Tilt / E-Tilt / Antenna / Height / Band / BW / Tech / PCI / TAC / Cell ID / EARFCN / TxP / MIMO / EIRP — that's the right column set for an RF table.
- **PCI tab** (lines 564–633): mod-3, mod-6, mod-30 are displayed (correct for LTE/NR PSS-SSS planning). The 60-cell grid is fine for a 3-sector site; **completely breaks at 100K sites** (PCI is 0–503, not 0–59, why crop?). Should be 0–503 with bucketing into used/free, with click-through to where each PCI is allocated cluster-wide.
- **Coverage tab** has a CoverageMap (mapbox / leaflet wedges over satellite) and a polar EIRP chart. The polar chart calc (`CoveragePolar` lines 1356–1394) treats EIRP as a single value drawn at fixed beamwidth 65° — real predictions need both horizontal *and* vertical patterns, multiple gain contours (−3 dB, −10 dB), and a propagation overlay (Hata/COST-231 or ray-tracing). Today it's a decorative sunburst.
- **Sector add modal** (lines 1213–1279): missing antenna model, polarization (single/cross/dual-pol XPD), feeder loss, jumper count, RET / ATM (Remote Electrical Tilt motor address), VSWR target. These are mandatory in an RFDS.
- **EIRP is hardcoded `txP + 17` (gain) — 2 (cable)** (line 951). Cable loss varies by run length, frequency band, jumper type (½″/⅞″/1¼″/⅝″ corrugated), connector count, weather sealing. Even a basic link-budget needs band-dependent loss and a cable-length input. A 100-m run at n258 (26 GHz) has ~30 dB feeder loss; this would silently misreport EIRP by 28 dB.
- **Audit tab seeds 6 mock entries on first load** — fine for demo, but the seeded events have made-up offsets (`38 + rngInt(0, 10)` days ago), so timeline is meaningless. Should be tied to actual `updatedAt`.

**Score: 6/10.** Best page in the module.

### 3. RFDesignListPage.tsx + MacroDesignListPage.tsx — **Adequate**

Standard list page over `useEntityList('rfDesigns')` with status chip filters, density-aware columns, bulk action toolbar. KPI strip on the Macro page (`Total, LTE, 5G NR, Approved, Pending, Avg Sectors`) is useful but "Avg Sectors" is a vanity number — meaningless to an RF engineer. Replace with **PCI Conflict Count, Aged Reviews, Last Frozen %** which are decision-driving.

Macro vs RF list duplication: two pages reading the same entity with slightly different columns — confusing. Consolidate into one page with a Technology tab (Macro / Small Cell / WiFi / DAS / MW), so the user always lands in one place.

**Score: 6/10.**

### 4. SmallCellDesignListPage.tsx (418 L) — **Good but disconnected**

Has its own KPIs (CBRS Granted, Indoor/Outdoor split, Avg Coverage), filter chips (Objective / Environment / Status) and statusOverrides (local state because no DB write-back) — meaning **the workflow actions don't persist across page reloads**. CBRS grant tag is correctly colored by state (Granted/Suspended/Pending). 42 mocked records is a demo number; needs scale-out testing (a small-cell program is typically 5–25k cells).

**Score: 6/10.**

### 5. SmallCellDesignDetailPage.tsx (917 L) — **Best small-cell telecom depth**

CBRS / SAS tab is well-modelled: SAS Provider, SAS Registration ID, Grant State, Days Remaining, channel, bandwidth, grant lifecycle progress bar. Renewal action is exposed. **This is the best part of the module.** Renew Grant / Reassign Channel modals work. Interference tab with macro layer co-channel detection and suggested mitigation (Power adjustment / Frequency offset / TDD pattern sync) shows real coordination thinking.

Gaps:
- No `incumbent priority check` panel (CBRS Tier 1: incumbents, Tier 2: PAL, Tier 3: GAA) — should show "Naval radar zone — DPA risk Y/N" near coastal sites.
- No CPI signature record (the CBRS CPI must sign all registrations).
- TDD frame structure (DDDSU vs DDDDDDDSUU) is a Macro form field but not on the small-cell form — a co-channel small cell *must* match the macro TDD pattern or it interferes.
- Heartbeat interval shown as 240 s (correct for SAS) but no heartbeat-failure alert flow.

**Score: 7/10.**

### 6. MacroRFDesignForm.tsx (1,303 L) — **Comprehensive but ergonomically heavy**

6 section cards (Design Header / Coverage Objective / Sector Configurations / Visual Design Canvas / Neighbor Strategy / Approval & Workflow / Documentation). Per-sector card has ~20 fields. With 6 sectors that's 120 fields on one page. Most RF engineers fill this in once per site and forget — but they fill 50 sites a week. **It is too long for the volume**.

Observations:
- The `SectorDrawingCanvas` (drag handles for azimuth/beamwidth) is excellent UX — bidirectional with the form fields. Keep this.
- Polygon-draw modal for Target Coverage Area on satellite imagery (lines 1250–1298) is also great.
- Antenna catalog: only 7 entries hardcoded. Each entry has only `value` and `bands[]` — no horizontal/vertical pattern files, no gain, no front-to-back ratio. The Sector Config page (line 33) duplicates this with 5 entries with gain/bw/type fields. **Same catalog, two definitions — guaranteed to drift**. Centralize.
- `EIRP = txP + 17 - 2 dB` is hardcoded for every sector regardless of antenna selection. Should compute from the chosen antenna's actual gain.
- TDD conditional fields (Slot Pattern, SSB Period) only show when `duplexMode === 'TDD'` — correct logic but only when *all* sectors share one duplex mode (the form has one duplex toggle).
- 5G NR conditional fields (Numerology, SCS) are added — but no BWP (Bandwidth Parts), no SSB beam configuration (k_SSB, SSB-MIB index), no CSI-RS resource sets, no CORESET 0/1/2, no SearchSpace #0/UE-specific. These are *the* 5G NR commissioning parameters.
- No Carrier Aggregation field set (PCC + SCC carrier list, CA combinations like 3CC+2NR).
- No VoLTE QCI / VoNR 5QI mapping.
- No sleep-mode / DTX configuration, no energy-saving (cell DTX, MIMO de-activation).
- No ANR (Auto-Neighbor Relation) detailed config — just "Auto-ANR" boolean. Real ANR has X2 setup gating, removal hysteresis, blacklist.

**Form complexity score:** A senior RF engineer can use this. A junior engineer will skip mandatory fields. Default progressive-disclosure (Basic / Standard / Advanced tabs) needed.

**Score: 5/10.**

### 7. SmallCellRFDesignForm.tsx (680 L) — **Tighter, more focused**

8 section cards. CBRS section becomes conditional on a Switch (good). SmallCellPositionPicker visual mount picker is nice (Pole/Wall/Lamppost/Strand). But missing: TDD coordination with macro layer, X2 setup, eICIC ABS pattern selection (it's listed in Coordination Strategy but never specified). PCI conflict-check inline is alluded to in tooltip but not implemented.

**Score: 6/10.**

### 8. SectorConfigPage.tsx (405 L) — **Decent expert-level page**

Per-sector deep edit. PCI capped at 0–503 (LTE), TAC 0–65535 (correct), Cell ID 0–268,435,455 (correct ECGI 28-bit). NR-ARFCN max 3,279,165 (correct per 3GPP TS 38.104). **EIRP correctly = txP + antennaGain**. This page is more telecom-honest than the bulk Macro form.

5G NR section has Numerology (μ=0..3) and SCS — correct. Beam Management toggle exists. But no SSB index mapping, no Q_RXLEV_MIN (reselection threshold), no UE-specific reference signal config.

**Score: 7/10.**

### 9. DesignTypeSelectorPage.tsx — **Good UX gateway**

5 cards (Macro, Small Cell, WiFi, DAS, MW) + a C-RAN tile that routes out to `/cran`. Template gallery underneath ("Standard 3-Sector LTE Macro" etc.) auto-applies via query param. Cleanest navigation gate in the module.

**Score: 8/10.**

### 10. DesignReviewApprovalPage.tsx — **Good multi-stage flow**

3-step approval (RF Lead → Senior RF → PM Sign-off), checklist (BR-RFD-004) with green/red items, comments stream, Approve/Reject/Request Revision/Delegate modals. Quality is good. Hardcoded comments / chain — needs DB. Per-step approver assignment by role (not by name) needed; today step 2 is hardcoded "Jorge Santiago".

**Score: 7/10.**

---

## D. Telecom Domain Validation (CRITICAL)

| Area | Implemented? | Verdict |
|---|---|---|
| **PCI range (0–503 LTE / 0–1007 NR)** | LTE: cap at 503 (correct). NR: capped 0–1023 in Macro form (line 990) but **NR PCI is actually 0–1007** per 3GPP TS 38.211 §7.4.2 — off by 16. SectorConfigPage caps PCI at 503 even when `technology === '5G NR'` (line 218) — **inconsistent**. Small Cell form caps 0–1023 (wrong). | **WRONG (3 inconsistent caps)** |
| **mod-3 / mod-6 / mod-30 collision** | Detail page PCI cards show `mod3 / mod6 / mod30` (line 585). Good. But there's no visualisation of *which neighbor* causes the collision, and PCIConflictAnalysisPage does general collision/confusion but not the mod-30 reservation for SRS hopping. | Partial |
| **EARFCN ranges** | Detail page uses `9820 + rngInt(0, 200)` for LTE, `627264 + rngInt(0, 1000)` for NR (line 185). 9820 is band 12 (700 MHz uplink ARFCN), `627264` is start of n78 — **correct anchor numbers**. But no per-band validation — picking Band 41 with EARFCN 9820 should fail (Band 41 is 39650–41589). | Partial |
| **EIRP calculation methodology** | Hardcoded `txP + 17 - 2` everywhere. No cable loss model (LMR-400 vs ½″ FSJ4-50 vs ⅞″ LDF5-50 at frequency × length), no connector loss, no jumper count, no body loss, no antenna gain by-antenna lookup. **Will mislead by 20–30 dB at mmWave.** | **WRONG** |
| **MIMO configurations** | Form options: 2x2 / 4x4 / 8x8 / 16x16 / 32T32R / 64T64R (line 894). Mostly correct. Missing 1T2R (single transmit, FDD legacy), 2T4R (typical 700 MHz LTE), 4T4R-DL/2T2R-UL asymmetric. Also missing `8x8 SU-MIMO` vs `8x8 MU-MIMO` distinction. | Partial |
| **Sector params (Az/M-Tilt/E-Tilt/Beamwidth/Antenna/Height)** | All fields present. Az 0–359 (correct), M-Tilt 0–15° (correct, but real ranges go 0–10° physically; >8° often clamped by mount). E-Tilt 0–15° (correct range for RET). Beamwidth slider 30–360 (**360° is invalid**; should be 30–360 only for omni and must be paired with antenna pattern). | Partial |
| **TAC / Cell ID** | TAC 0–65535 (correct 16-bit). Cell ID 0–268,435,455 (correct for ECGI 28-bit / NCGI 36-bit). Auto-assignment logic absent — engineers must manually input, in reality the IPRAN / OSS auto-allocates these from a pool. | Partial |
| **Neighbor list (Intra/Inter-Freq/Inter-RAT)** | RFDesignDetailPage neighbor table has Source / Target / Relation (Intra/Inter-Freq/Inter-RAT) / Handover (X2/Xn/S1/Inter-RAT) / Distance / Source (Manual/Auto-ANR). Correct vocabulary. Missing: handover priorities, blacklist flag, X2/Xn link state, eNB-eNB vs eNB-gNB EN-DC links. | Adequate |
| **Auto-ANR** | Switch in Macro form, "Auto-Suggest" as neighbor source option. No actual algorithm definition (event-trigger A3/A5? UE measurement reports? distance threshold? what's the removal hysteresis?). | Stub |
| **HARQ / scheduler** | **Not present anywhere.** Real RF Design includes pHICH-Ng, DL-DCI/UL-DCI assignment, PUCCH format selection, max HARQ processes (8–16 DL / 8 UL for LTE). | **MISSING** |
| **Sleep / energy saving** | Cell DTX, μSleep, deep sleep states, MIMO layer adaptation — **none** present. Critical for OPEX in 2026. | **MISSING** |
| **5G NR BWP** | Macro form has Numerology (μ) and SCS. No BWP configuration (initial BWP, dedicated BWP, switch delays). | **MISSING** |
| **5G SSB beam configuration** | "Beam Management" boolean switch in SectorConfigPage. No SSB beam index (0–63 for FR2), no k_SSB, no SSB-MIB position, no CSI-RS beam pairs. | **MISSING** |
| **CSI-RS** | Not present. | **MISSING** |
| **Carrier Aggregation** | Macro form lists 'CA (Carrier Aggregation)' as a value in Small Cell `macroInteraction` (line 377), but no CA *configuration* (PCC, SCCs, band combinations 1A+1A vs 1A+2A intra/inter-band). For an LTE-A or NR-CA design this is mandatory. | **MISSING** |
| **VoLTE / VoNR** | No QCI/5QI configuration, no SRVCC, no EPS Fallback. | **MISSING** |
| **TDD frame** | DDDSU / DDDDDDDSUU patterns selectable. Special-subframe toggle exists. But no DwPTS/GP/UpPTS sub-frame breakdown, no UL/DL ratio constraint enforcement (must equal 7:3 or 2:8 standard split per 3GPP). | Partial |
| **DSS (Dynamic Spectrum Sharing)** | Listed as an option in macroInteraction (Small Cell form) and Coordination Strategy. No actual config (PRB split, MBSFN config). | Stub |
| **TDD pattern coordination** | "TDD pattern sync" listed as a mitigation suggestion (Small Cell interference tab). No way to enforce sync across overlapping cells. | Stub |
| **DPA / coastal exclusion (CBRS)** | Not present (critical for CBRS small cells near Navy radar zones). | **MISSING** |

**Telecom Domain Accuracy: 4/10** — vocabulary is mostly right, mathematics is wrong, depth is shallow.

---

## E. Data Review

- **Approval cycle histogram (1–34 d):** plausible but hardcoded. Long tail at 22+ d (8 designs) suggests "no SLA enforcement" — a real Tier-1 wants 95th percentile < 14 d, that's the KPI not the histogram.
- **CR Resolution by P1–P4 SLA tiers:** P1 96% / P2 89% / P3 76% / P4 68% within SLA. SLA targets (P1 < 4h, P2 < 24h, P3 < 5d, P4 < 30d) not shown — without them the % is meaningless. The chart implies more SLA breaches at lower priority, which is fine but inverted-importance (P4 SLA misses don't matter; P1 misses do).
- **Designer Workload:** counts active designs per designer. Doesn't normalize for design complexity (a 6-sector mmWave NR design ≠ a single-band LTE retune). Add story-points / complexity index.
- **PCI Conflict Trend (12-week):** Useful as a single-glance health KPI but the underlying calc is wrong (see A.1). Polyline visualization with hover-tooltip is clean.
- **Coverage polar EIRP chart:** Visually correct but oversimplified. Real RF prediction polar plots use 360° antenna pattern data, not a single 65° wedge per sector. For decision-making use cell-edge RSRP/SINR coverage probability instead.
- **PCI grid (60 cells, 0–59):** Wrong scale (real PCI = 0–503). Visually useful for one site but doesn't scale.
- **Cycle Time Aging Histogram bins** (`0-2/3-5/6-10/11-15/16-21/22+`): bins are sensible.

**Data Intelligence: 4/10.**

---

## F. Scalability Review

| Concern | At 100K Sites |
|---|---|
| **60-cell PCI grid** | Fails. PCI is 0–503 globally; need cluster-aware view (PCI utilisation per geographic cluster of ~50 sites), not per-site grid. |
| **Neighbor table** | At 1,000+ neighbors per cell (urban 5G with EN-DC and Inter-RAT), the AntD `Table` rendering 1000 rows in one pagination chunk will hang. Needs virtualised table (`@tanstack/react-virtual`) and server-side pagination. |
| **Version comparison** | Hardcoded `compareRows`. At 50+ versions the drawer (current implementation) just lets you pick two versions; no version-graph visualisation, no "show only fields that changed since v3". |
| **`useEntityList('rfDesigns', { pageSize: 1000 })`** | Loads 1000 designs into memory for dashboard derivations. At 100K, this is non-trivial — should use server-side aggregation API and only stream PCI conflict events to the dashboard. |
| **Bulk import** | 4-step wizard exists with 25-mock-site validation table. At 5,000-site batch import (typical for an Atoll re-import), the validation table needs grouping + summary, not a row-per-error list. |
| **Bulk actions** | No bulk freeze / bulk approve / bulk submit gestures. With 500 designs per project, requires multi-select + bulk modal. |
| **PCI conflict computation** | 80 cells → ~80² = 6,400 pair checks. At 100K cells the brute force is 10^10 — must use spatial index (R-tree or H3 cell). |
| **CoverageMap** | Renders sector wedges via Leaflet polygon API; at one site, ~3 polygons. At a market view (1K sites × 3 sectors = 3K polygons), Leaflet will stutter without tile-based clustering and viewport-based culling. |

**Scalability: 4/10.**

---

## G. AI Opportunities (Massive untapped surface)

1. **Auto PCI planning** — Given a cluster, allocate PCI to minimize mod-3 collisions, mod-6 confusions, and mod-30 SRS reuse, subject to neighbor-list constraints. Graph-coloring problem; standard tooling exists, but no platform offers it inline. Tile: "Re-plan PCI for Cluster XYZ" → solver runs in 8 s.
2. **Neighbor auto-discovery from drive test** — Upload TEMS/Nemo log, infer cell-edge UE handover patterns, auto-suggest missing neighbors. Today the "Auto-ANR" boolean is a stub.
3. **Coverage hole prediction** — Combine OSS RSRP heatmap + planned tower with Hata/3GPP 38.901 propagation to forecast where future small cells will reduce dropped-call rate.
4. **Capacity bottleneck prediction** — Hook to traffic forecast; flag cells projected to hit >70% PRB utilisation in 12 weeks; suggest carrier add / cell split / capacity small-cell.
5. **Inter-tech interference prediction** — A Macro n78 + Small Cell n77 (adjacent bands) often produces ACLR-related EVM degradation. Predict overlap; suggest power offset.
6. **LLM for design review comments** — Train on historical comment/decision pairs; auto-generate reviewer pre-fills ("Sector B azimuth aligns with site survey — approve. Concern: PCI 256 conflicts with SITE-CHI-0234/S2 at 4.2 km").
7. **Co-pilot for form-fill** — Pull antenna catalogue, EARFCN/band, TDD pattern from a sister site of similar configuration. "Inherit from SITE-NYC-0042" with smart-diff.
8. **CBRS DPA risk forecaster** — At any small-cell location, check distance to Navy DPA (Dynamic Protection Area) zones; predict expected suspension events per month.
9. **Antenna selection optimiser** — Given site morphology + capacity target, suggest the right antenna SKU (gain / beamwidth / pattern) from the full catalogue.
10. **PCI conflict natural-language explainer** — "PCI 256 conflicts with 3 cells in your cluster: SITE-A (mod-3, 2.1 km), SITE-B (mod-6, 5 km, EN-DC neighbor — high risk), SITE-C (mod-30, 8 km, SRS reuse OK)".

**AI Readiness: 3/10** — currently has an "AI Insight" card on the dashboard that just summarizes counts.

---

## H. UX & Visualization Improvements

- **3D sector visualisation** — Mandatory in 2026. Cesium / Three.js panel showing tower + sectors with terrain underneath. Allows mechanical-tilt validation against rooftop / parapet.
- **Coverage heatmap overlay** — RSRP/SINR contour plot from propagation model, not just sector fan. Tile-based for performance.
- **AR/VR preview** — Mobile RF engineer at the tower can point camera, see proposed sector overlay. Bullet for the demo deck.
- **Comparison view** — Side-by-side parameter table is OK; add visual diff (sector fan overlay v1 vs v2), highlight only changed parameters.
- **Mobile RF engineer experience** — None of these pages are mobile-optimised. AntD tables with 18 columns are unusable on phone. Need a focused "tower-walk" mobile flow (one sector at a time, big touch targets, voice notes, photo upload).
- **PCI plan view** — Replace the 0–59 grid with a 23×22 heat-map of all 504 values colored by usage count cluster-wide, with click-through to allocation sites.
- **Sector layout** — `SectorRadialDiagram` is good. Add antenna pattern overlay (not just wedge), and an axes labeling for E-tilt visualisation (the side view).
- **Form length** — MacroRFDesignForm is too long. Convert to step-by-step (Basics → Sectors → Neighbors → Workflow) with autosave and persistent draft.
- **Bulk actions** — Add bulk freeze, bulk approve, bulk submit, bulk delete (with policy gate) to the list.

---

## I. Technical Architecture

- **Form state management** — `MacroRFDesignForm` (1,303 L) holds sectors in `useState` and other fields in AntD Form. The split makes the form's `sectors` invisible to AntD's `validateFields()`, so a sector with empty PCI silently passes form validation. Should unify into one `useFormik` or RHF schema, or fully store sectors in AntD Form.List.
- **Atoll / ASSET integration** — Export is one-direction text format (lines 871–886 of detail page): a fake `.atl.txt` blob with `[Cell]` ini-style keys. Real Atoll exchange is via the `Atoll Export Tool` (.cmt or .ari binary). No round-trip schema, no version-pinning.
- **CSV / BOM export** — Five hardcoded BOM rows (`BBU-5G-001`, `RRU-MMU-64T64R`, etc., lines 894–899). Not driven from a real BOM catalog; assumes one antenna SKU regardless of configured antenna model. **A real BOM export must reflect chosen antennas, chosen radio units, calculated jumper length × type, mount kit, lightning protection.**
- **Version control** — `actions.newVersion()` mutates current record's status to `Superseded` and creates a copy with `version+1`. The history table on detail page hardcodes 3 freeze/unfreeze events. No actual snapshot of parameter values per version, so the comparison drawer renders fake diffs.
- **Audit log seeding** — Detail page seeds 6 mock audit entries on first visit (lines 293–327). Good for demo. Should be guarded behind a `__DEV__` flag.
- **Mock data scaffolding leaks into prod paths** — `SmallCellDesignListPage` generates 42 records inline, `RFDashboard.openCRs = 38 + total % 11`. None of this should compile in prod.
- **`useEntityList` polls every page** — RFDashboard fetches up to 1000 designs, MacroDesignListPage another 200, RFDesignListPage another 200. Each is a separate cache key — would benefit from a shared paginator hook.

---

## SCORING

| Dimension | Score | Notes |
|---|---|---|
| Workflow Completeness | 5/10 | Skeleton present, no "Released to Build", no CR-to-version linking, no OSS sync. |
| UX Sophistication | 6/10 | Strong canvas/drawing, weak mobile, form too long, density-aware columns good. |
| Telecom Domain Accuracy | 4/10 | PCI cap wrong for NR, EIRP math hardcoded, BWP/SSB/CSI-RS/HARQ absent. |
| Data Intelligence | 4/10 | KPIs are mostly hardcoded; trends fabricated; conflict detection is wrong. |
| Scalability Readiness | 4/10 | 60-cell grid, brute-force conflict detection, in-memory 1000-row fetches. |
| AI Readiness | 3/10 | One "AI Insight" tile; no auto-PCI / coverage / capacity ML. |
| **Overall** | **4.5/10** | **Demo-quality. Not production. Solid IA, weak telecom truth.** |

---

## TOP 10 PRIORITY FIXES

1. **Fix the PCI conflict detection algorithm** (RFDashboard.tsx:207–213 and PCIConflictAnalysisPage.tsx:120–128) to use spatial neighbour proximity + mod-3/mod-6 rules from 3GPP TS 36.211 (LTE) and TS 38.211 (NR). Replace global `band-pci` duplicate count with cluster-aware collisions, confusions, mod-N reuse violations.

2. **Correct NR PCI range to 0–1007** everywhere (MacroRFDesignForm.tsx:990 caps at 1023; SectorConfigPage.tsx:218 caps at 503 for both technologies; SmallCellRFDesignForm.tsx:472 caps at 1023). Unify to a single `PCI_MAX = { LTE: 504, NR: 1008 }` constant and validate dynamically by `technology`.

3. **Replace hardcoded EIRP formula** (`txP + 17 - 2`) with a real link-budget per sector: `EIRP = TxPower + AntennaGain(model) − CableLoss(band, length, type) − ConnectorLoss(count) − BodyLoss(mount)`. Add Cable Length and Cable Type fields to the sector form. Without this, exported BOMs, downstream MW link budgets, and coverage predictions are wrong by tens of dB at FR2.

4. **Split macroDesigns and smallCellDesigns into separate entities** with a shared parent for lifecycle. Today `SmallCellDesignListPage` mocks its own 42 records because it can't fit into the `rfDesigns` schema cleanly. Define `MacroDesign`, `SmallCellDesign`, `WiFiDesign`, `DASDesign`, `MWDesign` as siblings of a `Design` base type. Single list page tabbed by type.

5. **Add 5G NR core missing config:** BWP (initial + dedicated), SSB beam configuration (indices, k_SSB, position), CSI-RS resource sets, CORESET, SearchSpace #0. Tab them under a "5G Advanced" section that appears only when `technology === 'NR'`. Without these, no NR design is integration-ready.

6. **Add Released → Built state and downstream fan-out events.** A Frozen design must emit a domain event (`DesignReleasedForBuild`) that triggers Quality (commission checklist), Procurement (BOM order), Crew (work order), Asset Inventory (planned-asset records). Currently the design sits in "Frozen" and nothing happens; the rest of the platform is air-gapped.

7. **Implement actual version snapshots and structural diff.** `newVersion()` must persist an immutable parameter snapshot (deep-frozen object), and `DesignVersionComparisonPage` must compute a real `JSON-Patch` style diff (field changes, array adds/removes for sectors and neighbors). Today comparison rows are 7 hardcoded fields.

8. **Build an antenna catalogue service.** A single managed catalogue with vendor pattern files (.msi/.pln), gain by tilt, frequency-dependent gain curves, front-to-back ratio, mass, wind load, PIM rating. Wire it to MacroRFDesignForm, SmallCellRFDesignForm, SectorConfigPage. Today 7 hardcoded entries in one form ≠ 5 different ones in another form. The Atoll/iBwave export depends on this.

9. **Auto-PCI planner.** Build a constraint solver (graph-coloring) that, given a cluster and current allocations, suggests PCIs respecting mod-3, mod-6, mod-30 distances and neighbor-list constraints. Surface as a button "Re-plan PCI for Cluster". This is the single highest-impact AI win in the module — and table-stakes vs Atoll.

10. **OSS-back sync and drift detection.** Add a daily job that polls Ericsson ENM / Nokia NetAct / Huawei iManager and compares as-designed (Frozen) vs as-deployed (live PCI / EARFCN / azimuth where managed). Flag drift in a new "As-Built Drift" KPI on the dashboard. **This is the killer feature for a Tier-1 operator** — Atoll alone can't do it because it has no OSS pipe.

---

**Comparable benchmarks:**
- **Forsk Atoll** — has 2,000+ antenna SKUs, true round-trip with OSS, mechanical antenna pattern (.msi), real Hata/COST-231/3GPP propagation, Monte Carlo capacity simulation. This module has none of these.
- **Aircom ASSET** (TEOCO) — has IBM Cognos-grade analytics, drive-test playback over predicted heatmap. Missing here.
- **Huawei Genex Probe + Mobile Probe** — drive-test fusion. Missing here.
- **Nokia 9999 NetOp / Mentum Planet** — frequency planning automation including PCI/PRACH/Root sequence allocation. Missing here.

This module sits at the "RFDS form + PDF export" layer — about 40% of what a real RF planning tool delivers, but with significantly better workflow/audit/CR governance than Atoll has. The opportunity is to **own the governance + integration layer (where Atoll is weak)** and integrate via standardised import/export to the prediction engine (where Atoll is strong) — instead of trying to rebuild Atoll badly.
