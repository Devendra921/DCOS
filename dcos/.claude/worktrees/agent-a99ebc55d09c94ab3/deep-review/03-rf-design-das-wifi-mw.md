# Deep-Dive Review — RF Network Design (DAS / WiFi / MW Path Profile)

**Reviewer:** Telecom Rollout Transformation Architect — DAS/IBS, WiFi & Microwave Path-Profile specialist
**Review Date:** 2026-05-26
**Scope:** 15 page files + 3 form files (~22 KLOC) under `src/modules/rf-network-design/pages/` and `pages/forms/`
**Industry Benchmarks Compared:** iBwave Design (DAS/IBS), Ekahau/Hamina/RUCKUS Cloud (WiFi), Pathloss 5 / LinkPlanner / iQ.link (MW), Atoll Indoor, Ranplan Professional, IPLOOK, COMSEARCH PrISM, Aviat Provision

---

## A. Module Purpose Validation

### A.1 Is the module needed? Are boundaries clear?
The RAN application bundles three distinct discipline planners — **DAS (Distributed Antenna System)**, **WiFi/WLAN**, and **MW Path Profile (microwave terrestrial radio)** — under a single `rf-network-design` namespace. In Tier-1 carriers and major venue projects these are typically owned by three different engineering tribes (Inbuilding, Enterprise WiFi, Backhaul/Transport). Bundling them is defensible for a unified rollout platform but introduces real risk of ownership ambiguity. The list pages (`DASDesignListPage`, `WiFiDesignListPage`, `MWPathProfileListPage`) all derive from a shared `DesignListBase` component, which keeps the UX coherent but means the conceptual differences are flattened — and that's a problem when DAS BOM lifecycle (procurement-heavy) is very different from a MW path-profile lifecycle (regulatory + frequency-coordination heavy).

### A.2 DAS — iDAS vs oDAS, passive vs active vs hybrid
`DASDesignForm.tsx` (line 360–366) exposes `systemType` as Active / Passive / Hybrid / Digital, which is the correct industry vocabulary (matches CommScope/Corning/SOLiD product taxonomies). However, **the model never distinguishes iDAS (indoor) from oDAS (outdoor/campus)**, nor does it carry an `architecture` field for repeater-based vs RoF (Radio-over-Fiber) vs Ethernet-over-RoE. The signal source dropdown (line 387–391) lists *Off-Air / Direct BTS / Small Cell / RoF Link* which conflates the *delivery mechanism* (RoF) with the *source* (BTS) — these should be two orthogonal fields. There is no `donorAntennaGain`, no `donorIsolation`, no `donorAntennaSeparation` — all critical inputs for an off-air repeater design subject to FCC/Ofcom oscillation rules.

### A.3 WiFi — 6/6E/7 readiness
`WiFiDesignForm.tsx` declares WiFi 5 / 6 / 6E / 7 (line 573–577) and conditionally exposes a 6 GHz channel band when `wifiStandard ∈ {6E, 7}` (line 409 `supports6`). The detail page (`WiFiDesignDetailPage.tsx` line 506–510) renders Ch6 column with 320 MHz width support in `WiFiChannelPlanPage.tsx` line 275–281 (`[20,40,80,160,320]`). **320 MHz is correctly limited to the 6 GHz band**, matching the 802.11be / Wi-Fi 7 spec. OFDMA / MU-MIMO are surfaced as toggles but **without per-band granularity** — in 11ax (WiFi 6) MU-MIMO is downlink-only on 2.4 GHz vs DL+UL on 5/6, which the UI elides. **BSS Coloring, Multi-Link Operation (MLO) — the headline WiFi 7 feature — and 4096-QAM are absent**. AFC (Automated Frequency Coordination) for 6 GHz outdoor standard-power APs is also missing.

### A.4 MW Path Profile vs MW Link module — why two?
This is a real concern. The repo also has a separate **MW Link Engineering** module (Tier 1 #5 in `00-REVIEW-CHECKLIST.md`, 21 pages, 13,097 lines). The split here is *MW Path Profile = the radio plan + terrain study* whereas *MW Link Engineering = the operational/installed link record*. Industry tools handle this in one tool (Pathloss, iQ.link). The two-module split makes sense only if `mw-link` truly owns post-commissioning RSL drift, ATPC tuning, error performance — which would need to be validated in module 05's review. **Recommendation:** clarify the boundary explicitly with a "Path Profile (design)" vs "Link (operational)" pairing convention and a forward link button.

### A.5 Venue-specific workflows
The DAS detail page (`DASDesignDetailPage.tsx`) is venue-agnostic and treats stadium/airport/metro identically. iBwave Design supports floor-plan-typed templates (stadium bowl with seating tier mapping, airport gate-area templates). There is no `venueProfile` driving capacity targets (e.g., NFL stadium → 35,000 simultaneous data sessions vs hospital → 800 voice users). The `venueType` is only a display label.

---

## B. Workflow Audit

### B.1 DAS Workflow
The detail page surfaces 8 tabs: Overview, Architecture Diagram, Component Layout, Components, Link Budget, Coverage Zones, Multi-Operator, Approval History, Documents. The **architecture diagram is a static cascade SVG** built deterministically from `headEndUnits`, `splitterCount = headEndUnits×2`, etc. (`DASDesignDetailPage.tsx` line 221–567). This is a beautiful schematic but **non-editable** — you cannot drag a head-end, you cannot insert a branch. The Floor Plan canvas (`FloorPlanCanvas` line 589–785) is editable per-component but lacks: (a) floor-plan image import & calibration (the "Import Floor Plan" button at line 1746–1752 only shows an `info` toast), (b) automatic cable routing along Manhattan paths, (c) RF propagation simulation (the heatmap at line 819–902 is deterministic random RSSI per grid cell, not derived from the physical layout). Real-world DAS design tools compute *predictive coverage* using ray-tracing or empirical floor-loss models (COST-231 indoor, ITU-R P.1238). **This workflow is presentation-grade, not engineering-grade.**

Missing required DAS workflow steps:
- **Donor signal planning** — no donor link budget, no isolation analysis between donor antenna and DAS antennas (critical to prevent oscillation in off-air bidirectional repeaters; FCC Part 20 / EU EN 50385 compliance).
- **IM3 / IIP3 / Noise figure budget tracking** — the form has IIP3 / NF input boxes (`DASDesignForm.tsx` line 583–589) but no calculation chain. Active DAS cascade noise figure (Friis equation) is fundamental.
- **PIM (Passive Intermodulation) site survey results** — the form shows `pimRating` (-145/-150/-155 dBc) but as a target only; no actual measurement upload.
- **Sweep test results** (return loss, VSWR) — no schema.
- **Multi-band combining diagram** — neutral host with VZW + AT&T + T-Mobile needs frequency-domain combining; the architecture diagram doesn't show POIs (Point of Interface), filters, or multiplexers.
- **Capacity/throughput per operator slot** — the operator card (line 1962–2040) shows revenue-share % but no Erlang-B traffic computation, no PRB allocation per LTE/NR carrier, no `pop_density × usage_factor` math.

### B.2 WiFi Workflow
`WiFiDesignDetailPage.tsx` exposes 8 tabs with reasonable coverage: Overview, Floor Plan, AP Placement, Channel Plan, SSIDs, Heat Maps, Approval History, Documents. **The heatmap library tab (line 897–963) is purely CSS radial gradients with no actual prediction.** Compared to Ekahau/Hamina the missing pieces are dramatic:
- **No predictive vs measured distinction** — Ekahau supports `simulated`, `predicted`, `surveyed` heatmaps as separate layers. Here all "heatmaps" are decorative.
- **No propagation model selection** — ITU-R P.1238, log-distance, ray-launching, none of these are offered.
- **No wall material attenuation library** — drywall (3 dB), brick (6 dB), concrete (12 dB), elevator shaft (>30 dB) — none of these are settable on the floor plan canvas.
- **No client capability profile** — typical WiFi planning bakes in client device assumptions (e.g., "MacBook Pro 13: 2SS 11ax @ -75 dBm receive sensitivity"). Absent here.
- **Roaming protocol** is surfaced (`design.roamingProtocol`, line 554) but there is no per-cell minimum-RSSI plot showing roaming hand-off boundaries.

The AP placement page (`WiFiAPPlacementPage.tsx` line 137–148) computes conflicts only as "co-channel + 2.4 GHz + distance < 140 px" — there is no actual SINR or interference dBm modeling. Co-channel detection ignores adjacent-channel interference, which on 2.4 GHz is the *real* problem (5 MHz channel separation in an 11-channel band).

**No captive portal integration.** The form has a `captivePortalUrl` field (line 571–579 in detail page) but nothing connects it to a guest-access workflow, no terms-of-service acceptance hook, no RADIUS/AD configuration flow.

### B.3 MW Path Profile Workflow
This is the best-engineered of the three. `MWPathProfileDetailPage.tsx` performs:
- Terrain generation with sine-component synthesis (line 169–200) — *plausible but synthetic*, not from SRTM/USGS DEM.
- Earth curvature sagitta calculation (`d²/(8R)`, line 344) and K-factor adjustment (`kFactor = 4/3`, line 888) — correct for standard refraction.
- Fresnel zone radius computed and rendered as bulging ellipsoid; 60% Fresnel sub-zone (the engineering go/no-go boundary) drawn explicitly (line 488–498).
- Free Space Loss formula correctly implemented: `92.45 + 20·log10(f_GHz) + 20·log10(d_km)` (`MWLinkBudgetCalculatorPage.tsx` line 495, `MWPathProfileDetailPage.tsx` line 1812).
- Rain fade table by ITU-R rain region (K/N/P/F/Q) with availability targets (99.9 / 99.99 / 99.999) — `MWLinkBudgetCalculatorPage.tsx` line 73–79. **This is the correct ITU-R P.530 framework.**
- Atmospheric absorption coarse model (line 89–93): `0.005 + (freq-6) × 0.005` dB/km — *very approximate*; real ITU-R P.676 oxygen+water-vapor model is much more complex but the placeholder is reasonable for screen rendering.

What's missing from MW:
- **No terrain elevation upload** — should accept SRTM (.tif/.bil), USGS DEM, or DTED files.
- **No path-bending vs k-factor sensitivity sweep** — Pathloss shows clearance vs k=4/3, k=2/3, k=∞ side by side.
- **No diffraction loss calculation** — even with the 60% Fresnel rule satisfied, knife-edge or rounded-obstacle diffraction (ITU-R P.526) should be computed.
- **No space diversity / frequency diversity / hot-standby modeling** — these are the standard mitigations against multipath fading.
- **No multipath fading depth** — Vigants-Barnett or ITU-R P.530-17 multipath outage prediction is the heart of carrier-class MW link engineering.
- **Crane rain model not offered as alternative to ITU-R** (some carriers still use Crane in North America).
- **Reflection coefficient / overwater path handling absent** — coastal links over saltwater need explicit modeling.
- **Antenna decoupling / discrimination angle** missing — for adjacent-channel coordination in dense urban hops.

---

## C. Screen-by-Screen Review

### C.1 `DASDesignDetailPage.tsx` (2,725 lines)
**Complexity warranted?** Partially. The page does heavy lifting (8 tabs, 4 modals, 3 drawers, full architecture SVG, floor plan canvas, coverage heatmap, multi-operator cards, approval timeline). However, it should be decomposed: each tab is a 200–500 line block of JSX, and the file mixes presentation, data generation (`generateDASComponents` invocation), and action handlers (`handleSubmitForReview`, `handleFreezeSubmit`, `handleNewVersionSubmit`, `handleAddOperatorSubmit`, etc. — line 1125–1216). At enterprise scale this hurts test coverage and bundle-split. **Recommendation:** extract `DASOverviewTab`, `DASArchitectureTab`, `DASComponentLayoutTab`, `DASLinkBudgetTab`, `DASOperatorTab` into separate files. The detail page in iBwave Design is split into a navigation tree exactly this way.

### C.2 `WiFiDesignDetailPage.tsx` (1,849 lines)
Same modularity issue. The heatmap tab (line 897–963) is **decorative-only** — CSS gradients with no underlying RF model. The channel plan table at line 451–540 has good inline editability scaffolding but **calls no validation logic** — power and width changes don't recompute conflicts. The co-channel conflict warning (line 836–852) only checks the same channel; **adjacent-channel (CCI within ±5 MHz at 2.4 GHz) ignored**. There's no Wi-Fi 7 MLO (Multi-Link Operation) modeling: when an AP is multi-link, the channel plan should let you pin a *primary* and *secondary* simultaneously.

### C.3 `MWPathProfileDetailPage.tsx` (2,290 lines)
This is the strongest detail page. The `TerrainChart` SVG (line 297–810) is genuinely good — Fresnel ellipsoid rendered, towers drawn, obstructions shown with severity coloring, earth-sag included. The chips strip is well-conceived (Distance, Frequency Band, Bearing, Polarization, LOS Status — line 1324–1355). **Concerns:**
- The data is *seeded synthetic*; in production this must consume real DEM data. The current `generateTerrain` (line 169–200) makes the chart visually plausible but a real surveyor cannot trust it.
- The K-factor is hard-coded to 4/3 (line 888); should be a tunable slider with a comparison overlay.
- The "Apply for Frequency License" modal (line 2166–2208) is decorative — no integration with FCC ULS, Ofcom Spectrum Information Portal, or any other regulator. For a Tier-1 carrier this would be a critical OSS integration point.
- The "Survey Photo Gallery" (line 1735–1772) uses 8 hardcoded gradient blocks rather than EXIF-bearing geo-tagged uploads. Real path-profile survey reports include compass-tagged horizon photos that get pinned to the elevation chart.

### C.4 `InterTechCoordinationMapPage.tsx` (1,961 lines)
This is the most ambitious file. Uses **react-leaflet with real OSM/Esri tile basemaps** (line 564–577), generates a deterministic network of 60 macro sites, 42 small cells, 12 DAS venues, 22 WiFi APs, 38 MW links over the NYC metro bounding box. The four coordination modes (`Coverage / Interference / PCI Conflicts / Inter-Tech Offload` — line 116, 588) each run distinct analysis (line 457–543). **The interference analysis is non-trivial:**
- Pairwise sector iteration with band-neighbour adjacency matrix (`BAND_NEIGHBOURS` line 95–106) — correctly captures co-channel and adjacent-band conflicts.
- Bearing-based facing test ensures both sectors point at each other (line 472–476) — this is the right physical condition for two macro sectors to interfere meaningfully.
- PCI conflict (line 489–503) flags same PCI within 2 km and explicitly notes mod-3 collisions — important for SS-PSS-SSS detection in LTE/NR.

**Issues:** The dark basemap (line 565) is actually using the standard OSM tile URL not a dark variant. There's no time-of-day modeling (interference varies with traffic load). DAS venues are drawn as rectangles with `halfW/halfH` in meters (line 252–254) — a reasonable footprint marker but not realistic indoor coverage. **The "Inter-Tech Offload" mode is the most useful feature** — flagging when a small cell sits inside a macro sector fan tells the operator they can save capex by demoting that macro carrier.

### C.5 `DASComponentTablePage.tsx` (786 lines)
Solid component inventory with grouping (none / by type / by floor), search, type and floor filters, bulk actions, CSV export. The deterministic generator (`buildComponentTable`, line 119–251) produces realistic counts (2 HE + 2 splitters/floor + 1 coupler/floor + 4 RUs/floor + 8 antennas/floor capped at 60). Insertion loss / coupling loss / cable loss are all in the schema and rendered with 2-decimal precision. **However:** the cable loss is computed as `0.07 × length` which is 1/2" CommScope at ~1 GHz; loss is **highly frequency-dependent** (1/2" has ~0.07 dB/m at 850 MHz, but ~0.13 dB/m at 2.5 GHz, ~0.18 dB/m at 3.5 GHz). The cable type (`CABLE_TYPES`, line 111) lets users pick 1/4" / 3/8" / 1/2" / 7/8" / Fiber, but the loss calculation doesn't change with that selection — that's an engineering data-integrity defect.

### C.6 `DASLinkBudgetPage.tsx` (1,023 lines)
Good page. Computes paths via `buildRichPaths` (line 77–203) including HE → trunk cable → splitter → branch cable → coupler → drop cable → RU → antenna jumper → antenna. Each step decremented from `inputPower = 43 dBm` (line 87). Margins are computed against an adjustable `threshold` slider (3–10 dB, line 580–847). The "step chain" visualization (line 260–332) and "step loss bars" (line 336–391) are very nice — clearer than what iBwave produces for non-engineer audiences. The histogram and pass/fail donut are appropriate. **Limitation:** the 43 dBm input power is hard-coded; should come from operator/band selection (operator A's 700 MHz vs B's 2.5 GHz both have different per-port composite powers).

### C.7 `WiFiAPPlacementPage.tsx` (550 lines)
Functional drag-and-drop AP editor with floor selector, AP list panel, canvas, and property editor. The "conflicts" metric (line 137–148) is naive but real-time. AP add/update use a `useAPPlacementActions` hook tied to a mock DB. **Missing:** no PoE budget tracking, no switch-port allocation across MDF/IDF closets, no IDF cable-length tracking — all of which an Ekahau/Hamina design exports for the structured-cabling team.

### C.8 `WiFiChannelPlanPage.tsx` (593 lines)
Solid table-based channel plan editor with conflict detection per floor (line 154–168). Bands selectable from `[20,40,80,160]` MHz on 5 GHz and `[20,40,80,160,320]` MHz on 6 GHz — correct per WiFi 6E/7 spec. The Auto-Optimize button (line 376–395) emits a toast but has **no real optimization algorithm** — should be a graph-coloring solver minimizing co-channel conflicts. **DFS handling is incomplete** — there's a `dfsEnabled` form field but no UI showing which channels are DFS (52-64, 100-144) and need radar avoidance.

### C.9 `MWLinkBudgetCalculatorPage.tsx` (1,027 lines)
This is the strongest engineering page in the module. Implements:
- Free Space Loss (line 495).
- Atmospheric loss model (line 89–93).
- Rx threshold by modulation (QPSK -88 dBm to 1024QAM -64 dBm, line 64–70) — these are reasonable per-modulation thresholds for a typical 28 MHz channel; would need scaling for 7/14/56/112/224 MHz bandwidths (a -88 dBm QPSK threshold scales by ~10·log10(BW) — 7 MHz → -94, 224 MHz → -83. The page doesn't do this BW correction; it should).
- Rain fade lookup table by region × availability target (line 73–79).
- Effective fade margin → predicted availability mapping (line 95–106). Reasonable bucketing.
- Waterfall chart showing each loss/gain contribution (line 216–434) — excellent visual.

**Issues:** The standalone mode (line 461–500, fallback `DEFAULT_MW_LINK`) doesn't preserve user inputs between sessions. No save-and-version for the calculator results. No ATPC (Automatic Transmit Power Control) modeling. No XPIC (cross-polar interference canceller) gain when dual-polarization is used. No ACM (Adaptive Code Modulation) profile showing throughput at different modulation states under degraded conditions — this is the most-asked capability in modern carrier MW planning.

### C.10 `MWPathProfileListPage.tsx` (1,275 lines)
Excellent list page. Filters: LOS, design status, frequency band, distance range slider. KPIs derive from filtered records (line 296–312) — a correctness improvement noted in the comment. Bulk actions handle multi-row submit/approve/export/delete with status gating. The single-row CSV export and bulk CSV export share column layout (a good DRY decision noted in code comments line 386–404, 455–475). Per-row dropdown menus correctly gate `Submit` (Draft only), `Approve/Reject` (Submitted only), `Delete` (Draft/Rejected only). One concern: 200 rows from `useEntityList` is fine, but **at 10K+ MW links the page will fall over** — there's no server-side pagination contract.

---

## D. Telecom Domain Validation (CRITICAL)

### D.1 DAS Domain Accuracy
**What's correct:**
- Headend / Remote Unit / Antenna / Splitter / Coupler / Combiner taxonomy (line 580–588 `COMPONENT_COLOR`).
- Vendor list (Corning, CommScope, SOLiD, Comba, JMA — covers ~90% of US market).
- PIM rating dBc range (-145/-150/-155 dBc — line 567–571 of form). -150 dBc is the typical operator spec.
- Frequency band labels: B2 (1900), B4 (AWS), B5 (850), B12/B13 (700), B25 (1900), B30 (2300), B41 (2.5 GHz), B66 (AWS-3), B71 (600), plus NR bands n5/n25/n41/n66/n71/n77/n78/n258/n260.

**What's missing or wrong:**
- **No IM3 tracking.** PIM is surfaced as a static rating; in real DAS commissioning you record measured PIM at multiple cable junctions with a PIM tester (Anritsu/Kaelus). The data model has no `pimMeasurements[]` array.
- **No DAS noise figure budget.** Active DAS cascaded NF (HE NF + α + RU NF after gain, etc.) must be ≤ 5–7 dB to preserve uplink sensitivity at the macro donor. Schema has `noiseFigure` input but no NF cascade calculation.
- **No leaky cable (radiating cable) support.** For tunnels, basement parking, elevators — `LCX-50-12D` / `radiax` cable is the antenna; not modeled.
- **No antenna pattern library.** Dipole, panel, MIMO Dual Pol, Omni — listed as strings only (line 114). Should reference NSMA pattern files (`.adf`).
- **No EIRP per antenna calculation.** Critical for FCC OET-65 RF safety compliance and for proving each operator stays within their authorized power limit.
- **Active DAS "remote unit" vs passive "tap-off" distinction** missing — the architecture diagram shows both as boxes but they're radically different (active RU is an amplifier with NF/IIP3 specs).
- **No SLA banding** (CommScope Era HU vs SOLiD ALLIANCE HU vs Corning ONE) — these have **different latencies** (digital DAS has 60–150 µs added, can break VoLTE/VoNR timing alignment in some cells). No latency tracking.

### D.2 WiFi Domain Accuracy
**What's correct:**
- WiFi 5/6/6E/7 standards distinction with conditional 6 GHz support.
- 2.4 GHz constrained to channels 1/6/11 (form validation at `WiFiDesignForm.tsx` line 333–338 — "BR-RFD-008"). This is correctly the only non-overlapping triple in the US 2.4 GHz plan.
- 5 GHz channel pool covers UNII-1 (36-48) and UNII-3 (149-161) per `CH5_ROTATION` (line 107). Good.
- Channel widths 20/40/80/160 on 5 GHz and 20/40/80/160/320 on 6 GHz.

**What's missing:**
- **No DFS (UNII-2A 52-64, UNII-2C 100-144) channel handling.** US 5 GHz has *26* channels but most planners avoid DFS due to radar pre-emption. UI must show DFS state.
- **No UNII-5 / UNII-7 / UNII-8 6 GHz sub-band breakdown.** The 6 GHz band is split into 4 sub-bands (5.925–7.125 GHz, 59 channels at 20 MHz). Different power class rules apply (LPI vs SP vs VLP).
- **No AFC (Automated Frequency Coordination)** mention. Standard-power 6 GHz outdoor APs need cloud AFC consultation (FCC mandate, January 2024). Critical for any campus/outdoor design.
- **No Wi-Fi 7 features beyond name:** MLO (Multi-Link Operation, the headline feature), 4096-QAM, Multi-RU, BSS coloring (which is actually 11ax).
- **WPA3 / WPA2 toggle** is there but **no 802.1X / RADIUS server config**, no certificate handling, no MAB (MAC Auth Bypass), no DPP (Easy Connect).
- **Mesh networking** has a toggle (`design.meshEnabled`) but no UI to define mesh topology (root vs satellite APs).
- **No spectrum analyzer integration** — Ekahau Sidekick 2, NetAlly EtherScope, NetSpot Pro all upload measured noise floor / spectrum data; this app has no schema for it.

### D.3 MW Path Domain Accuracy
**What's correct:**
- Free Space Loss formula (correct constant `92.45`, correct frequency in GHz and distance in km).
- Fresnel zone visualization with 1st and 60% sub-zones.
- Rain fade margin lookup by ITU-R rain region (K/N/P/F/Q).
- Earth-curvature sagitta with k-factor 4/3 default.
- Fade margin → availability mapping with availability buckets.
- Frequency band labels (6/7/8/11/15/18/23/26/28/38/42/80 GHz — line 253–266 of MWPathDetail) match common licensed-band carrier planning.

**What's missing:**
- **No Crane rain model** as alternative (still used by some North-American operators).
- **No ITU-R P.530-17 multipath outage calculation** (Vigants-Barnett). This is *the* critical fade calculation.
- **No diffraction loss (ITU-R P.526)** for paths where the 60% Fresnel is intruded but not blocked.
- **No ducting / reflection modeling** for overwater paths.
- **No two-ray ground reflection** modeling.
- **Atmospheric absorption is a placeholder** (0.005 dB/km + 0.005·(f−6)), not full ITU-R P.676 oxygen/water-vapor curve.
- **No co-polar discrimination (XPD)** for dual-pol XPIC links.
- **No interference analysis between MW paths** at the same antenna site (T/I budget computation for adjacent paths sharing an antenna mast).
- **Bandwidth-corrected receiver threshold absent** (Rx threshold scales with 10·log10(BW); not applied at line 506).
- **Path-bending vs k-factor sensitivity sweep absent.**
- **No GPS coordinates for sites** — sites are string IDs (`SITE-NYC-0042`) without lat/lng in the path-profile context (the form has `SITE_COORDS` hardcoded at line 84–93, but the path-profile detail page does not display them on a map alongside the terrain chart).

---

## E. Data Review

### E.1 DAS BOM Completeness
The "Export to BOM" menu item (`DASDesignDetailPage.tsx` line 1503–1508) emits a toast only; **no actual BOM is generated**. The component table (`DASComponentTablePage`) holds 60 components with model/cable type/cable length, which is enough raw material to produce a BOM, but the cable type doesn't affect calculated loss (see C.5 above). Industry-standard DAS BOM includes: cable spools by length, connectors by type and count, terminations, mounts, surge protectors, grounding kits, raceway, fire-stop materials. None of these are modeled. A real BOM also has procurement state (Ordered / Received / Installed / Tested).

### E.2 WiFi Heatmap Accuracy
**Synthetic decorative gradients, not RF predictions.** This is the single largest data-quality gap in the module. A WiFi planning tool that can't compute predicted RSSI from AP placement, transmit power, antenna gain, and propagation model is not usable for capacity engineering. The CSS gradients (line 917–921 of `WiFiDesignDetailPage.tsx`) hardcode color stops and have no relationship to physical AP positions.

### E.3 MW Path Terrain Data Source
The terrain data is synthesized from sine functions seeded by the link ID (`MWPathProfileDetailPage.tsx` line 169–200). For a demo this is fine — the chart looks plausible. For production, the application needs an integration with **USGS National Elevation Dataset (1/3 arc-second)**, **SRTM 30m global**, or **NEXTMap One commercial** elevation services. The current architecture has no `elevationProvider` abstraction layer to plug these in.

### E.4 KPI reconciliation
Both `WiFiDesignListPage` (line 213–228) and `MWPathProfileListPage` (line 296–312) correctly derive KPIs from the filtered records, with code comments calling out a prior bug where they read unfiltered data. **DAS list page** (`DASDesignListPage.tsx` line 220–238) does the same. Good practice.

### E.5 Channel conflict detection precision
WiFi channel plan only checks exact channel match (line 154–168 of `WiFiChannelPlanPage.tsx`). Adjacent-channel interference (e.g., channel 1 and channel 2 on 2.4 GHz separated by 5 MHz, overlapping) is **ignored**. In dense WiFi 7 deployments with 320 MHz channels, adjacent-channel conflict in 6 GHz is rare but in 5 GHz with 160 MHz it consumes the entire UNII-1 band.

---

## F. Scalability Review

### F.1 DAS for 100+ floor buildings (Burj-class)
The detail page caps floors at 5 (`floors = Math.min(design.floors, 5)`, line 1001 of `DASDesignDetailPage.tsx`) for rendering, but the design model itself holds the actual count. **All rendering — architecture cascade, floor plan canvas, coverage heatmap — assumes ≤5 floors.** For a Burj Khalifa (163 floors), Petronas Towers (88 floors), or a hospital with B5–L20, the UI breaks. **iBwave** uses tree-navigation per floor with virtual scrolling; here we'd need a floor-stack visualization with per-floor lazy-rendered canvases.

### F.2 WiFi for 50,000 APs (Stadium / Campus)
The `WiFiDesignFull` model holds an `apCount` integer. The detail page generates AP markers per floor `Math.min(floor.apCount, 16)` (line 243). At 50K APs you cannot render even 1% on a single SVG. Need a tile-based AP marker layer (similar to InterTechMap's Leaflet approach) with cluster aggregation at low zoom. **Currently, beyond ~200 APs the canvas degrades visually** — markers overlap.

### F.3 MW Path Profile for 10,000+ links
`MWPathProfileListPage.tsx` requests `pageSize: 200` (line 233). At 10K links, server-side pagination is mandatory but the current `useEntityList` is mock-data-only. The data-grid uses Ant Design's `<Table>` which is *not* virtualized — it will render every row into the DOM. **Need:** integrate `@tanstack/react-virtual` or move to a virtualized table (e.g., `ag-grid-react` Community edition).

### F.4 InterTechCoordinationMap at 100K sites
Currently generates 60 macro sites + 42 small cells + 12 DAS venues + 22 WiFi APs + 38 MW links. At 100K sites: Leaflet polygon rendering for sector fans will choke; need WebGL (Mapbox GL Native or `deck.gl`). The pairwise interference analysis is **O(N²)** (line 463–486 — nested for-loops over `sectors`). At 60 sectors that's 3,600 pairs; at 100K it's 10 billion. This must be replaced with a spatial index (R-tree / k-d tree) and a Δθ + range pre-filter. Same for PCI conflict detection (line 491–503) and offload candidate computation (line 506–533).

### F.5 Floor plan canvas rendering
SVG-based for all three sub-modules. At 1000+ shapes per canvas, SVG with React reconciliation becomes a bottleneck. Consider Canvas2D or WebGL rendering once a venue has >500 components.

---

## G. AI / ML Opportunities

### G.1 Highest-impact AI use cases for this module

1. **AI-driven DAS architecture optimizer.** Given a floor plan image, target coverage RSSI, frequency bands, and operator count, generate an optimal head-end / splitter / coupler / antenna placement that minimizes BOM cost while meeting link-budget margin ≥ X dB at 95% of coverage points. Genetic algorithm or reinforcement learning over the architecture graph. This is the iBwave 14.1 "AI Designer" feature.

2. **Genetic-algorithm AP placement optimization.** For WiFi: given floor plan, capacity target, client density map, optimize AP coordinates to maximize SINR coverage and minimize co-channel conflicts. Hamina now does this. Pre-trained model could output a starter placement in seconds.

3. **ML-based path-loss prediction (instead of analytic propagation models).** Train on measured walk-test data: floor plan image + wall material map → 2D RSSI prediction. This is what RAN-OS Toolkit and Ranplan ML do.

4. **Computer vision floor plan analyzer.** Upload a PDF/JPG of an architect's floor plan; auto-extract walls, doors, partitions, with attribution as drywall/brick/concrete from line thickness and label OCR. This drives propagation model parameters. Multiple startups (Hamina, Ranplan) have shipped this in 2024–2025.

5. **Automated venue-type recognition.** Floor plan + venue metadata → classify as Hospital / Office / Stadium → load matching design template with capacity, coverage, and survey checklist defaults.

6. **AI-assisted PCI plan generation for InterTech map.** Given the 60-site network, solve graph-coloring with conflict-driven distance penalties. The existing PCI conflict detection (line 489–503) is reactive; an AI could generate a fresh plan.

7. **Channel plan optimization.** WiFi auto-optimize currently emits a toast only. Replace with simulated annealing or graph coloring solver.

8. **MW path-bending anomaly detection.** Track RSL drift over time vs predicted ITU-R P.530 multipath model; flag anomalies suggesting tower sway, antenna alignment drift, or environmental change.

9. **Spectrum allocation copilot.** "We need to add another operator to this DAS — show the top 3 frequency-combining strategies and their PIM risk."

10. **Construction punch-list generator.** Compare design BOM to installed assets photo-tagged at site; auto-generate punch-list of discrepancies.

---

## H. UX & Visualization Improvements

### H.1 3D building visualization for DAS
Currently 2D floor plan only. Tier-1 venues expect a 3D building cutaway (think iBwave 3D View) showing the head-end in the basement, vertical fiber risers, antenna deployment on each floor in a single overview. WebGL with Three.js can render this efficiently.

### H.2 Heat map overlay quality
Replace synthetic gradients with computed RSSI fields. Use a heatmap canvas (heatmap.js or simple-heat) driven by actual propagation model output. Make the heatmap layer toggleable over the floor plan with opacity slider — currently the AP placement canvas and the heatmap are separate views.

### H.3 Inter-tech coordination visual clarity
The map is dense. Suggestions:
- **Mode-specific layer presets** — Coverage mode should default to thinner sector fans; PCI Conflicts mode should fade non-conflicting sectors to 15% opacity.
- **Time slider** — operators care about peak-hour interference. A 24-hour traffic slider would be powerful even with synthetic load.
- **Operator color reinforcement** — sectors are currently colored by band, not operator. A toggle "color by operator" / "color by band" would help carrier-specific reviews.

### H.4 Mobile field engineer view
None of these pages are mobile-optimized. A site survey engineer in the field needs: photo upload to the LOS Survey tab, GPS-stamped obstruction markers (already a UI shell at line 2122–2163), one-tap "Mark LOS Marginal" with photo evidence. This is now a tablet form factor (Samsung Galaxy Tab Active 5 / Panasonic Toughbook).

### H.5 Terrain chart enhancements
The MW chart is excellent but could add:
- A side-by-side comparison of multiple k-factor scenarios (k=4/3 vs k=2/3 vs k=∞).
- An animated "rotate path" view showing the path from the perpendicular axis for spotting deep Fresnel intrusions.
- Vegetation/canopy markers from tree height datasets.

### H.6 Step chain for link budget
The DAS link budget step chain (line 260–332 of `DASLinkBudgetPage.tsx`) is a great UX pattern — apply the same to MW (currently a waterfall) and Wi-Fi (currently no step chain).

---

## I. Technical Architecture

### I.1 DASDesignDetailPage 2,725 lines — concerns
- Single-file responsibility creep.
- All state hooks inline (line 956–998), making test isolation hard.
- Deterministic data generators (`generateDASDesign`, `generateDASComponents`, `generateLinkPaths`) called inside `useMemo` — fine for static demos, will be replaced by API hooks in production.
- Heavy SVG rendering inside the component — should be its own pure component file.
- Same pattern repeats in `WiFiDesignDetailPage` (1,849 lines) and `MWPathProfileDetailPage` (2,290 lines). Recommend a shared `<DesignDetailScaffold>` component handling header, KPI strip, tab orchestration, and per-design custom tab children.

### I.2 Floor plan upload/processing
None of the three pages actually parse an uploaded file. DWG (AutoCAD) requires either a server-side conversion (Open Design Alliance ODA SDK) or a WebAssembly decoder. PDF parsing for floor plans is feasible (pdf.js + manual scale calibration). Currently all "Import Floor Plan" buttons just open a name input modal or toast (`WiFiAPPlacementPage.tsx` line 499–523 — accepts a name string only).

### I.3 Real-time channel optimization
WiFi auto-optimize is fake. To make this real:
- Server-side solver (constraint programming via OR-Tools).
- WebSocket back to UI for progress.
- Diff view of "current plan vs optimized plan" with per-AP delta highlights.

### I.4 Multi-operator DAS data isolation
The current model puts all operators on a single `DASDesignFull.operators[]` array. In a true neutral-host system, each operator has **isolated** view of their own configuration — Verizon should not see AT&T's PCI/frequency settings or alarm states. This needs per-operator RBAC (the `RoleGate` / `CAP` import is used for design-edit gating but **not for per-operator data scoping**). When a Verizon engineer logs in, they should see only the VZW slot on every cabinet, not the global view.

### I.5 State management
Page-local `useState` everywhere. For a multi-stage workflow (Draft → Submitted → Approved → Frozen → Implemented) that crosses multiple sessions, server-state caching (React Query / SWR) is essential. The `useEntityDetail` / `useEntityList` hooks exist but are tied to a mock-DB layer.

### I.6 Mock-data determinism
All three modules use FNV-1a hash + Mulberry32 PRNG to make data stable across renders. This is **excellent for demos** but every detail-page in the module synthesizes its own data from the URL `id` — the same MW path opened from the list and from a deep link both render identical terrain. Once a real backend is wired up, this seeding logic becomes dead code that should be removed cleanly.

---

## SCORING (1–10)

| Dimension | Score | Justification |
|---|---|---|
| **Workflow completeness** | 5/10 | DAS lacks donor/PIM/IM3/sweep; WiFi missing predictive heatmaps and AFC; MW solid but missing P.530 multipath, diffraction, diversity |
| **UX / visualization** | 7/10 | MW terrain chart and DAS step-chain are best-in-class; floor plans are static; heatmaps decorative |
| **Telecom domain accuracy** | 5/10 | Vocabulary mostly correct (PIM dBc, ITU-R rain region, NR n-bands, WiFi 7); calculations partial (FSL ✓, multipath ✗) |
| **Data quality** | 4/10 | Determinist mock; BOM not generated; heatmaps synthetic; terrain not from real DEM |
| **Scalability** | 4/10 | All canvases will choke beyond a few hundred components; O(N²) interference analysis; no virtualization |
| **AI readiness** | 3/10 | Hooks exist (Auto-Optimize button, AI Insight Card in InterTech); no actual ML/AI implementation |
| **Engineering architecture** | 6/10 | Good shared `DesignListBase`; modular UX primitives; detail pages are monolithic |
| **Integration depth** | 3/10 | iBwave/Ekahau/Pathloss export buttons are toast-only; no FCC ULS, no AFC, no SRTM, no PIM tester upload |
| **Overall** | **5/10** | Production-grade demo, not yet production-grade engineering tool |

---

## TOP 10 PRIORITY FIXES

1. **Wire real propagation models.** Replace the CSS-gradient WiFi heatmaps and the deterministic-grid DAS coverage heatmap with computed RSSI fields driven by ITU-R P.1238 (indoor) and COST-231 (outdoor). Make heatmap a layer toggle over floor plan with opacity slider. **Files:** `WiFiDesignDetailPage.tsx` line 897–963, `DASDesignDetailPage.tsx` line 819–902, `WiFiAPPlacementPage.tsx`.

2. **Add ITU-R P.530-17 multipath outage prediction** to MW link budget alongside the existing rain-fade lookup. Compute Vigants-Barnett path occurrence factor and combine with rain availability for total predicted outage. **Files:** `MWLinkBudgetCalculatorPage.tsx` line 89–106, `MWPathProfileDetailPage.tsx` line 838–907.

3. **Replace synthetic terrain with real DEM provider.** Add an `elevationProvider` abstraction with USGS, SRTM30, MapTiler, or Mapbox Terrain RGB as concrete adapters. Cache by `(lat,lng,pathBearing,distance)`. **Files:** `MWPathProfileDetailPage.tsx` line 169–200.

4. **Implement real BOM export.** Generate a CSV with parts, descriptions, quantities by parsing the component table + cable lengths + connector counts + accessories matrix. Bind to the existing "Export to BOM" menu items. **Files:** `DASDesignDetailPage.tsx` line 1503–1508, `WiFiDesignDetailPage.tsx` line 1312–1328 (the WiFi BOM does emit a CSV — extend it to include cable and accessory line items).

5. **Decompose three monolithic detail pages.** Extract each tab into its own component (e.g., `DASOverviewTab.tsx`, `MWTerrainTab.tsx`). Reduces bundle size, enables lazy-loading, makes testing tractable. **Files:** `DASDesignDetailPage.tsx`, `WiFiDesignDetailPage.tsx`, `MWPathProfileDetailPage.tsx`.

6. **Add AFC (Automated Frequency Coordination) integration scaffold for 6 GHz WiFi.** Standard-power outdoor APs in 6 GHz require AFC consultation. Add a placeholder service interface and UI gating (when `wifiStandard ∈ {6E, 7}` AND `outdoor === true`, show AFC consultation status). **Files:** `WiFiDesignForm.tsx`, `WiFiChannelPlanPage.tsx`.

7. **Implement real channel optimization.** Replace the toast-only Auto-Optimize with a constraint-programming solver (client-side OR-Tools WebAssembly or server-side endpoint). Show before/after diff. **Files:** `WiFiChannelPlanPage.tsx` line 376–395.

8. **Frequency-dependent cable loss.** Index `cableLoss` by `(cableType, frequencyBand)` rather than a single `0.07 × length` constant. Add a loss table for 1/4", 3/8", 1/2", 7/8" CommScope/Andrew cable at 850 MHz / 1.9 GHz / 2.6 GHz / 3.5 GHz. **Files:** `DASComponentTablePage.tsx` line 119–251, `DASLinkBudgetPage.tsx` line 77–203.

9. **Virtualize tables and replace SVG canvases with WebGL once N>500.** Move InterTech sector overlays to `deck.gl` or Mapbox GL with WebGL2 polygon shaders. Spatial-index the interference / PCI / offload calculations with an R-tree. **Files:** `InterTechCoordinationMapPage.tsx` line 457–543, all list pages.

10. **Per-operator data isolation in neutral-host DAS.** Refactor the multi-operator card section so a Verizon-scoped user sees only VZW bands, slot, PIM measurements, alarms — not AT&T/T-Mobile/DISH. Extend `RoleGate` to accept an operator-scope token and apply scoping in `operatorDetails` and the architecture cascade. **Files:** `DASDesignDetailPage.tsx` line 1071–1093, 1962–2040.

---

## Comparison to Industry Tools

| Capability | This Module | iBwave Design | Ekahau Pro | Pathloss 5 |
|---|---|---|---|---|
| Floor plan import (DWG/PDF/PNG) | name string only | full | full | n/a |
| Real propagation model | none | ray-tracing + COST-231 | empirical + simulation | ITU-R P.530 |
| Predictive heatmap | decorative | full | full | n/a |
| Measured survey overlay | absent | yes | yes (Sidekick 2) | n/a |
| BOM export | toast only | full | partial | n/a |
| Multi-operator | yes (basic) | yes | n/a | n/a |
| ITU-R P.530 multipath | absent | n/a | n/a | full |
| Real terrain data | synthetic | n/a | n/a | SRTM/DEM |
| Frequency coordination | absent | n/a | n/a | COMSEARCH-export |
| API for OSS/BSS | absent | yes (BIM) | yes | yes (CSV/XML) |
| AI assistance | none | iBwave AI Designer | Hamina AI | none yet |

The module currently sits at the level of a **strong design-review presentation tool**, not yet at the level of an **engineering authoring tool** that competes with iBwave, Ekahau, or Pathloss. The visual quality (especially the MW terrain chart, DAS step chain, InterTech Leaflet map) is genuinely better than mainstream industry tools — that's the differentiator to lean into. The engineering calculations behind those visuals are where the gap lives.

---

**Bottom line:** The module is a coherent and visually striking presentation layer over deterministically-generated data. To graduate into a production engineering tool it needs (a) real propagation/multipath calculations, (b) real terrain/floor-plan data ingestion, (c) operator-scoped data isolation, (d) integration with regulator and survey-tool ecosystems, and (e) architecture decomposition for scale. The MW Path Profile sub-module is closest to production-ready; WiFi heatmaps are furthest behind.
