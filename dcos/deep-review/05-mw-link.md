# Deep Review — MW Link Module

**Reviewer perspective:** 20+ years across Ericsson MINI-LINK, Nokia Wavence, Huawei OptiX, Aviat ProVision, Ceragon NMS.
**Module scope:** `src/modules/mw-link/` — 21 pages covering MW backhaul lifecycle from planning through decommissioning, plus fixed-line backhaul tracking, hop chains, frequency licensing, commissioning, interference analysis, capacity planning, and equipment inventory.
**Verdict:** Strong domain conceptual model with credible workflow surface and clean visualizations. Telecom math is plausible at the UI layer but the underlying engineering calculations are not implemented in code — they are surfaced as pre-computed fields on link records. The module is closer to a structured rollout-tracker than an engineering workbench. Several telecom-essentials are conspicuously missing (ATPC, XPIC fully wired, SyncE/PTP, ITU-R rain-fade math, real NMS feeds).

---

## A. Module Purpose Validation

The module's stated purpose is "Plan, license, install, and commission backhaul links — microwave and fixed-line (leased fiber / Ethernet)" (`MWLinkListPage.tsx:814`). That framing is correct and matches industry practice.

**MW Link vs Fixed Line Backhaul — properly separated?** Mostly yes. The separation is implemented via `backhaulType: 'Microwave' | 'Fixed Line'` on the same `mwLinks` entity, with `BackhaulDetailRouter.tsx` switching between `MWLinkDetailPage` (1,434 lines, RF-heavy) and `FixedLineBackhaulDetailPage` (186 lines, commercial/SLA-focused). The router pattern is correct because both share endpoints, distance, and availability primitives. However, the *list page* still says "MW Link" in the toolbar ("New MW Link" button at `MWLinkListPage.tsx:838`) while the title says "Backhaul Links" — a mixed identity that will confuse operators. The Fixed Line detail page has `flCircuitId`, `flProvider`, `flServiceType` (E-Line, E-LAN, P2P), `flSlaClass`, `flMrcUsd` — these are correct fields for a carrier-Ethernet leased circuit, but no provisioning workflow, no port turn-up record, no LoA/CFA artifacts, no traceroute/RFC 2544 / Y.1564 commissioning. The fixed-line side is a stub display compared to the MW side.

**Overlap with MW Path Profile in RF Design module.** Significant overlap. `MWLinkDetailPage` links out to `/rf-design/mw/:id/link-budget` and `/rf-design/mw/:id` (path profile), and the survey tab points at `/rf-design/mw/:id` for the terrain/Fresnel profile view. This is reasonable separation-of-concerns: RF Design owns the engineering calculator, MW Link module owns the rollout state. But there is no shared data contract documented — the MW detail page reads `link.freeSpaceLoss`, `link.atmosphericLoss`, `link.totalPathLoss`, `link.systemGain`, `link.rainFadeMargin`, `link.predictedRSL` from the same `mwLinks` row, meaning the RF Design calculator is presumed to write back to this entity. That's correct architecturally but introduces a coupling that should be made explicit (and audit-logged when the calculator overwrites a previously-accepted budget).

**Hop chain as a separate concept.** Correctly modeled. `MWHopChainListPage` and `MWHopChainDiagramPage` treat chains as first-class objects with `chainCode`, `chainType` (`Backbone | Access Aggregation | Fronthaul`), `chainStatus` (`Planning | Partially Built | Fully Built | Operational | Degraded`), `totalHops`, `totalDistance`, `bottleneckCapacity`, `bottleneckLinkId`, `endToEndAvailability`, `endToEndLatency`. The diagram page computes cumulative latency profile, identifies the bottleneck hop, and surfaces a "Status Tracker" gated by BR-MWL-008 ("upstream → downstream commissioning"). This matches how chains are tracked in NetAct and ProVision. Good design.

**Frequency license as a sub-domain.** Correctly modeled as a separate entity (`mwFrequencyLicenses`) with its own list, detail, form, and expiry report. The license entity carries the regulator (FCC, OFCOM, TRAI, etc.), `txFreqA/B`, `rxFreqA/B` (duplex pair), `channelBandwidthMhz`, `polarization`, `eirpA/B`, application/grant/expiry dates, annual fee, currency. The detail page even renders a spectrum plot. This is more complete than most operator NMS tools.

---

## B. Workflow Audit

**MW link lifecycle.** The phase model is encoded in `PHASE_LABELS` (`MWLinkDetailPage.tsx:100`): `planning → path_survey → licensing → procurement → installation → alignment_commissioning → commissioned → operational → decommissioning → decommissioned`. The dashboard funnel collapses this to 6 stages: Planned → Designed/Surveyed → Licensed → Installed → Commissioning → On-Air. The mapping is reasonable but the `procurement` and `alignment_commissioning` phases never surface as their own dashboard pages, which is a meaningful gap — procurement (equipment ordering, lead times, delivery tracking) is a real bottleneck in rollouts and currently lives only as an inferred status on `MWEquipmentInventoryPage`.

**Bidirectional commissioning (A-end and B-end).** Implemented. `MWLinkEndPage` is a single page reused for both ends via the URL suffix (`/a` or `/b`, `MWLinkEndPage.tsx:171`). It captures ODU/IDU/antenna vendor, model, serial, firmware, Tx power, antenna size/gain/height-AGL, cable type/length/loss, connector loss, radome (with loss), azimuth, tilt, alignment RSL. The compass widget is a nice touch. `BR-MWL-003` is enforced in the UI: an alert blocks installation if the license is not Granted (`MWLinkEndPage.tsx:313`). A counterpart-end link in the side panel makes it easy to jump A↔B.

**Frequency coordination workflow.** Partially implemented. `FrequencyLicenseListPage` and `FrequencyLicenseDetailPage` carry the state machine (`Application Prepared → Submitted → Under Review → Coordination Required → Granted → Renewal Pending → Expired/Rejected`). The detail page renders the Steps component for the workflow and a Timeline of regulatory events. `MWInterferenceAnalysisFormPage` adds a separate analysis with polar interferer map, C/I ratio threshold (default 30 dB), mitigation strategies, and clearance status. That's a credible coordination flow. What is missing: there is no actual cross-link interference detection (i.e. the system does not scan other MW licenses in the database to surface potential conflicts) — every interferer is captured manually. A real coordination engine would walk the licensed-link graph and flag overlap by frequency × polarization × azimuth × geographic distance.

**Interference analysis and mitigation.** Form is well-structured (7 tabs: Setup, Interferer Map, Interferer List, Worst Case, Mitigation, Clearance, Documents). The polar map is decent for visualizing direction-of-arrival. But the `ciRatio` is captured as a single number per interferer — in reality C/I is computed per polarization, per antenna pattern (front/side/back lobes), and per atmospheric condition. Submitting "for clearance" is gated by worst-case C/I ≥ threshold (`MWInterferenceAnalysisFormPage.tsx:190`), which is the right gate, but submission only navigates back; there is no integration with the license workflow (a real system would attach the cleared analysis to the license's coordination tab).

**Hop chain dependency tracking (commissioning sequence).** Implemented via the `StatusTrackerTab` in `MWHopChainDiagramPage` (`MWHopChainDiagramPage.tsx:1017-1076`). It computes the first non-built hop and marks all downstream hops "Blocked — waiting upstream", citing BR-MWL-008. This is the correct model — you cannot commission downstream traffic until the upstream relay is built. However, the rule is a *visual* nudge, not a hard gate: there is nothing in `MWCommissioningFormPage` that blocks an out-of-sequence commissioning attempt.

**License renewal workflow.** Implemented. `FrequencyLicenseDetailPage` has a Renew action that extends expiry by 5 years (`FrequencyLicenseDetailPage.tsx:541-557`); the list page offers a +1 year renewal (`FrequencyLicenseListPage.tsx:165-179`) — those two numbers contradict each other and need reconciling. `FrequencyLicenseExpiryReportPage` adds a 24-month timeline visualization and a 12-month renewal-cost forecast. BR-MWL-009 thresholds (180/90/30-day notices) are surfaced as Tags on the detail page. This is more than most operators ship today.

**Link decommissioning with dependency check (BR-MWL-007).** Implemented twice — in the detail page Modal (`MWLinkDetailPage.tsx:927-952`) and in the row-action confirm dialog (`MWLinkListPage.tsx:421-441`). Both call `checkDependentSites(link.id)` and refuse the operation if any active site depends on the link. The detail-page version *displays* dependents but does not actually block the OK button when dependents exist — the gate is enforced inside `useMWLinkActionsBypass.decommission()`. This means a user can click "Decommission" with dependents shown and then receive a thrown error, instead of a disabled button. UX bug.

**Fixed line backhaul workflow.** Underdeveloped. `FixedLineBackhaulDetailPage` shows the circuit attributes (provider, circuit ID, media, service type, SLA class, MRC) and a single Edit button. There is no port turn-up procedure, no service activation testing form, no SLA breach log, no CDR (cross-connect demand record) artifact upload. The list-page filter has a "Backhaul: Microwave/Fixed Line" toggle (`MWLinkListPage.tsx:903-913`) but the form (`MWLinkFormPage`) does not branch by backhaul type — every new link is captured with MW-specific radio parameters, which is wrong for fiber.

---

## C. Screen-by-Screen Review

**MWDashboard (987 lines).** Strong demo-ready surface. KPI hero row covers Total Links / On-Air / Faulty / Avg Hop Chain Depth. Funnel SVG (left-to-right with chevrons) is well-designed and uses cumulative math so each bar is monotonically ≤ the one to its left (`MWDashboard.tsx:348-366`). Stacked bar of Link Status by Type and a Licensing Pipeline horizontal bar give a complete portfolio view. The author has invested significant effort to handle sparse seed data (`derivePhase`, `deriveType`, license pipeline floors at `:469-495`) — these synthetic backfills should be removed once real data flows. AI Briefing card is shallow ("X% of MW links are operational. N faulty links detected — top-affected band: B GHz") and could be much richer (predicted at-risk in next 30 days, capacity headroom, top regulators by pending applications, license cost forecast).

**MWLinkDetailPage (1,434 lines).** 12 tabs is appropriate for a link with this much state: Overview, A-End, B-End, Path Surveys, Frequency License, Link Budget, Commissioning, Hop Chain (conditional), Interference, Performance, Dependencies, Audit Trail. Useful design choices: the LinkDiagram SVG with two towers at correct relative heights and a status-colored beam (dashed when decommissioned) is more informative than the icon-only treatments in NetAct. The Compass widgets reused throughout the module are consistent. The seeded audit-entry generation (`MWLinkDetailPage.tsx:320-472`) is clever but is mock-only and should not ship to production — it creates realistic-looking history on first view of every link. The Interference tab is hard-coded to "Clearance Status: Clear, Interferers Identified: 0" (`:766-776`) — disconnected from `MWInterferenceAnalysisFormPage`. The Performance tab generates a deterministic synthetic 30-day RSL series (`PerformanceTab :1124-1178`) — fine for demo, but needs to wire to a real PM (Performance Management) feed.

**MWHopChainDiagramPage (1,110 lines).** The hero is the `ChainSVG` (`:667-862`) — horizontal layout, origin (green A) → relays (purple R) → destination (blue B), per-hop line thickness scaled to capacity, animated travel dots on On-Air segments, bottleneck halo around the worst hop. This visualization is more polished than Ericsson MINI-LINK Manager's tree view. The Bottleneck Analysis card surfaces upgrade strategies (XPIC, wider channel, parallel link). The cumulative Latency Profile chart is unusual but useful for fronthaul planning. The Status Tracker mode (BR-MWL-008) is well-rendered as a Timeline with the upstream-block indicator. Gaps: no ring/mesh topology support — every chain is a linear A→R→R→B chain; no ERPS or 1+1 hot-standby visualization; no SyncE/PTP path overlay.

**MWLinkCapacityPlanningPage.** Solid. KPI strip covers Total Configured / Utilized / Network Utilization % / At Capacity (>85%) / Approaching (>70%) / Available. The heatmap shows 10 links × 20 days of utilization with a clear 4-band legend (<50% green, 50–70% blue, 70–85% amber, >85% red). Histogram of utilization buckets, Top Utilized table with 30-day sparkline and Forecast Saturation date, Upgrade Pipeline table. The "Plan Upgrade" modal offers four strategies (add parallel MW link, increase channel bandwidth, replace radio, migrate to fiber) — that matches real operator decision trees. BR-MWL-013 thresholds (70% warning, 85% critical) are explicit. Missing: no forecasting model is visible — `forecastSaturation` is presumably computed inside `buildCapacityRecords()` but the user cannot see the curve; no ARIMA/seasonal model, no MoM/QoQ comparison.

**PathSurveyFormPage.** 9 sections (A–I): Survey Header, A-End location, B-End location, Path Analysis (auto-computed distance/bearing/Fresnel radius), Terrain Profile (upload + a tiny illustrative SVG), LOS Result with conditional Obstruction Description, Photo Evidence (separate A-end and B-end uploads with BR-MWL-012 photo-count gates), Environmental Notes, Status & Sign-off. Live calculation of haversine distance + bearing + Fresnel radius at midpoint is correct (`PathSurveyFormPage.tsx:105-118`). The LOS conditional banner that links Marginal/Obstructed back to BR-MWL-001 (cannot proceed to licensing) is a good closed-loop reference. Gap: no actual terrain integration — the user uploads a CSV but the page does not parse, render the elevation profile, draw the antenna line, or check Fresnel zone obstruction at the cumulative path; the SVG at `:323` is a static placeholder.

**FrequencyLicenseDetailPage.** Strong. 8 tabs (Overview, Frequency Plan, Power & EIRP, Application Workflow, Coordination, Renewal, Documents, Cost & Fees). The `SpectrumPlot` SVG (`:66-122`) renders the duplex pair (Tx A→B, Rx A←B, Tx B→A, Rx B←A) as horizontal channels at correct positions with bandwidth as the rectangle width — that's a clean, accurate spectrum view that I have not seen in commercial NMS products. Steps + Timeline workflow visualization. Renewal tab with 180/90/30-day notices and renewal history table. Documents tab with upload and download. Cost & Fees with payment history. Power & EIRP page correctly shows `EIRP = Tx Power + Antenna Gain`. The Renew action extends by 5 years on the detail page versus 1 year on the list page — pick one (5 years is correct for FCC Part 101 MW; 1 year is typical for TRAI/India).

**MWCommissioningFormPage.** 7-step wizard: Pre-check, Alignment, Performance, Test Period, Availability, Modulation, Review & Submit. Pre-check enforces BR-MWL-003 (license granted), BR-MWL-004 (both ends installed), BR-MWL-010 (link budget calculated). RSL tolerance ±3 dB from predicted (`RSL_TOLERANCE_DB = 3` at `:103`), minimum test period 72 hours (`MIN_TEST_HOURS = 72` at `:104`) — both are industry-standard. Determination algorithm: `rslFlag && availFlag → Fail`, either alone → `Conditional Pass`, both clean → `Pass` (`:179-180`). Below-72h tests are forced to `Conditional Pass` (`:240-247`). This is rigorous and matches Aviat ProVision's acceptance logic. Missing: no MSE thresholds per modulation, no chromatic dispersion test for E-band, no XPIC isolation measurement, no link-aggregation member test.

**MWInterferenceAnalysisFormPage.** Discussed in §B. Good polar map. Submit is gated by acceptable worst-case C/I.

**MWEquipmentInventoryPage.** Cross-link inventory view of IDUs/ODUs/antennas. KPI strip with Vendors / Models / Avg Age. Warranty status with color-coded chips (Expired / <90 days / >90 days). Bulk Firmware Upgrade and Bulk Mark Faulty actions. Order Replacement action generates a CSV PO. RMA workflow. This is a decent inventory page but does not address spares planning (how many spares per vendor, per region), MTTR tracking, or vendor SLA scoring.

**BackhaulDetailRouter.tsx (28 lines).** Necessary stub — it reads the `backhaulType` of the `mwLinks` row and routes to either `MWLinkDetailPage` (MW) or `FixedLineBackhaulDetailPage` (Fixed Line). The router pattern is correct because both backhaul types share the same `mwLinks` entity. The stub is not a sign of incomplete work; it is the appropriate dispatcher. If anything, it should also handle a `Hybrid` (MW + fiber redundancy) case, which the system does not currently model.

**FixedLineBackhaulDetailPage.** 186 lines, 4 cards: Circuit Endpoints, Service & Circuit (provider, circuit ID, media, service type, contention ratio), Capacity & SLA (committed rate, SLA class, measured availability against parsed SLA target), Commercials (MRC, annualised). This is a thin display. Missing: no fiber span loss budget, no OTDR trace upload, no port commissioning record, no Y.1564 / RFC 2544 / RFC 6349 throughput test, no service activation form, no order-tracking from request → CRD → CFA → service-ready. A real fixed-line backhaul detail page would be 500+ lines.

**MWBulkImportPage.** 5-step wizard (Download template → Upload → Validate → Preview → Commit → Done). The template has 13 columns covering identification, endpoints, radio params, antenna sizes, polarization, availability target, vendor. Mock validation generates 28 valid + 8 errors + 4 warnings rows out of 40 — clear, color-coded rejection reasons. Rollback option claimed for 24 hours. This is well-thought-out.

---

## D. Telecom Domain Validation

This section probes whether the engineering math is correct *in the code that exists*, and what is missing.

**Free Space Loss (FSL).** The MW detail page reads `link.freeSpaceLoss` (`MWLinkDetailPage.tsx:614`) but does not compute it. The correct formula is `FSL (dB) = 32.45 + 20·log10(d_km) + 20·log10(f_GHz)`. I cannot verify the formula is implemented because it lives in the RF Design module's calculator, not here. The MW module trusts the value blindly. **Recommendation:** add a derived-field indicator (e.g. "calculated 2025-04-12 by user X, link-budget v2.3") so an engineer knows the data lineage.

**Atmospheric loss calculation (ITU-R P.676).** Surfaced as `link.atmosphericLoss` (dB). At 18 GHz, dry air contributes roughly 0.02 dB/km, and at 38 GHz it climbs to ~0.1 dB/km; at 80 GHz it spikes to ~0.5 dB/km because of the 60 GHz oxygen absorption line. The module does not validate that the value passed in respects this frequency-dependent behavior. Mock data could surface implausible values.

**Rain fade calculation (ITU-R P.530, P.838).** Stored as `link.rainFadeMargin` (dB). The correct calculation requires (1) rain rate `R_0.01` for the region from ITU-R P.837 maps; (2) specific attenuation γ_R = k·R^α with k, α from P.838 polarization tables; (3) effective path length adjustment d_eff = d·r with r per P.530-17; (4) link unavailability statistics. None of this math is visible in the MW module. **Critical gap:** there is no UI to even select the rain zone or input R_0.01, so the back-end calculator has nothing to work with. The Crane model is not mentioned.

**Fresnel zone clearance (60% rule).** Implemented in `PathSurveyFormPage` — the form captures `fresnelClearancePct` as a 0–100% number and the form page calls `fresnelRadiusMidpoint(d, f)` from `mwlActions.ts` to render the radius at midpoint. The form correctly thresholds at 80% green / 60% amber / <60% red (`PathSurveyListPage.tsx:247`). The 60% rule is industry standard. Gap: only the *midpoint* radius is computed; the full Fresnel ellipsoid along the path is not validated against terrain.

**Earth bulge factor (k = 4/3).** Not mentioned anywhere in the MW module pages. Earth bulge correction at midpoint = (d_A·d_B)/(2·k·R_earth) where k=4/3 for standard atmosphere. Without this, the Fresnel-clearance check overestimates clearance on long paths. Should be added to the PathSurveyForm calculations.

**Antenna decoupling (front-to-back ratio).** Not captured. The `mwLinkEnds` entity stores antenna gain (dBi) and size (ft) but no FtB ratio, no first-sidelobe level, no half-power beamwidth. Without these, the C/I calculation in interference analysis cannot account for antenna pattern discrimination, which is the single most important real-world mitigation.

**Link budget components.** The Overview tab surfaces FSL, atmospheric loss, total path loss, system gain, rain fade margin, predicted RSL (`:613-633`). Tx power lives on each end (`MWLinkEndPage` `oduPowerOutput`). Antenna gain lives on each end. Cable + connector + radome loss lives on each end. Threshold sensitivity (per modulation) is **not** captured anywhere — only `availabilityTarget`. This is a meaningful gap: every modulation has a different receiver threshold (e.g. QPSK -90 dBm, 256QAM -68 dBm, 4096QAM -58 dBm), and the fade margin depends on which threshold you use. Without per-modulation thresholds, the link budget cannot drive ATPC or adaptive-modulation calculations.

**Adaptive modulation (QPSK → 4096QAM).** The form supports the full range QPSK / 16QAM / 64QAM / 128QAM / 256QAM / 512QAM / 1024QAM / 2048QAM / 4096QAM (`MWLinkFormPage.tsx:388-390`). Adaptive modulation toggle plus min/max modulation. The commissioning form captures `modulationAchieved`. What is missing: a recorded modulation-vs-time histogram (i.e. how often did the link sit at the lowest modulation last quarter) which is the most useful KPI for ATPC tuning.

**Channel bandwidth.** Standard set 7/14/28/56/112/224 MHz (`MWLinkFormPage.tsx:367-371`). This is correct for ETSI; FCC adds 5/10/20/30/40/50/80 MHz and 100/200 MHz which are missing. Custom bandwidths (e.g. 30 MHz for FCC Part 101) cannot be entered.

**Polarization.** Vertical / Horizontal / Dual / Cross (XPIC) (`MWLinkFormPage.tsx:376-381`). XPIC is captured as a polarization mode but there is no separate XPIC isolation field, no XPIC tuning UI, no cross-pol RSL measurement. For 1024QAM+ in XPIC mode, you need a separately recorded cross-polar discrimination (XPD) of at least 25 dB.

**Frequency bands.** Form offers 6 / 7 / 8 / 11 / 13 / 15 / 18 / 23 / 26 / 28 / 32 / 38 / 42 / 56 / 80 GHz (`MWLinkFormPage.tsx:362`). Missing: 70/80 GHz (E-band) is partially there (80 GHz only), but 71–76 GHz and 81–86 GHz subbands are not modeled separately. V-band (57–66 GHz unlicensed and 64–71 GHz under FCC Part 95) is absent. 4 GHz (sub-6 GHz backhaul) is missing. The dashboard filter lists `['All', '6', '11', '18', '23', '38', '80']` which collapses 7/8 with 6 GHz and 26/28/32 with 23 GHz — this will produce wrong filter matches on real data (matching is `Math.abs(freq - target) <= 2` per `MWLinkListPage.tsx:353`).

**E-band (70–80 GHz), V-band (60 GHz).** E-band gets one frequency option (80 GHz). V-band is absent. Real operator portfolios at modern deployments have 30–50% E-band capacity.

**ODU vs IDU split.** Correctly modeled (`MWLinkEndPage.tsx:358-422`). ODU vendor/model/serial/firmware/Tx power, IDU vendor/model/serial/firmware, interface type (GigE / 10 GigE / STM-1 / STM-4 / STM-16 / CPRI). Note: CPRI is a fronthaul protocol, not backhaul — listing it here is fine if the access link is fronthaul, but the form does not gate the option by `linkType`.

**Ethernet over MW.** Implicit — every IDU offers GigE/10 GigE interfaces. There is no QoS configuration, no VLAN/MEF service mapping, no Ethernet OAM (802.3ah, 802.1ag/Y.1731) measurement, no MEF service attributes. For modern packet-MW deployments this is a meaningful gap.

**IP/MPLS support.** Not modeled at all. Modern MW IDUs run MPLS-TP / Segment Routing — no fields for label-edge configuration, no L2VPN/L3VPN service mapping, no IS-IS/OSPF area assignment.

**SyncE, PTP (1588v2) synchronization.** Not modeled at all. This is a hard miss. Every modern MW link in a mobile backhaul carries a SyncE clock and possibly PTP for time-sync to ±100 ns. Operators track clock class, holdover quality, T-BC vs T-TC role, and unicast peer-to-peer config. None of this exists in the MW module.

**RSL trending, BER trending.** Synthetic 30-day RSL trend in `MWLinkDetailPage.PerformanceTab` (`:1124-1178`) seeded by link id with deterministic noise. BER is computed as `1e-11 * exp(...)` (`:1135`) — a placeholder. No PM file ingest, no SNMP polling configuration, no NMS feed. Production-ready code would integrate with a TSDB (Prometheus / Influx) and visualize 7/30/90 day windows with anomaly highlights.

**ATPC (Adaptive Transmit Power Control).** Not modeled. The radio runs ATPC by default in most vendors; this should be a captured config item with min/max Tx power and an ATPC range field.

**XPIC (Cross-Polar Interference Cancellation).** Captured as a polarization mode only. No XPIC mate pairing (which link is paired with which on the orthogonal polarization).

**Hot standby, ring protection (ERPS G.8032).** Not modeled. There is no UI to mark a link as a 1+1 hot-standby pair, no ERPS instance config, no link-aggregation member, no MPLS-TP linear or ring protection. The hop chain page treats every chain as a linear A→B path — no protected/working path duality.

**99.999% availability target.** Captured as `availabilityTarget` on the link, displayed to 3 decimal places (correct). Commissioning measures `availabilityMeasured` against the target. Five-nines for MW is aggressive — typical access links target 99.99% (52 minutes/year outage) and backbone links target 99.999% (5 minutes/year). The default of `99.995%` in the form (`MWLinkFormPage.tsx:249`) is reasonable.

---

## E. Data Review

**RSL 30-day trend chart accuracy.** Synthetic per-link series; visually plausible but not a real measurement. SVG path renders correctly with min/max scaled to data range.

**BER exponential notation.** Capture format `1.0e-12` accepted in the commissioning form (`MWCommissioningFormPage.tsx:376`). Displayed via `Math.max(...).toExponential(1)` in the detail page (`MWLinkDetailPage.tsx:1170`). Correct.

**Availability to 3 decimal places (99.999%).** Consistent throughout (`MWLinkDetailPage.tsx:575`, `MWLinkCapacityPlanningPage.tsx`, `MWHopChainDiagramPage.tsx:409-411`). Correct.

**Hop chain end-to-end availability (product of hops).** Computed in `buildAllChains()` (not shown in detail). Displayed as `endToEndAvailability` in `MWHopChainDiagramPage.tsx:599-635`. The "Availability Analysis" card explicitly notes "End-to-end availability is the product of per-hop availabilities" — that is correct (assuming hop outages are independent, which they usually are at the radio layer; correlated outages from regional weather are not handled).

**Bottleneck identification accuracy.** Computed in `buildAllChains()` as the lowest-capacity hop; surfaced in the diagram with an amber halo and a BOTTLENECK label. Correct algorithm for capacity bottleneck. Does not handle the case where the bottleneck is *availability* or *latency*, only capacity.

**License expiry alert thresholds.** 180 / 90 / 30 days (BR-MWL-009). Surfaced as colored Tags on the detail page and as Critical/Warning Alerts on the list page. Correct industry practice.

**Throughput vs capacity tracking.** Capacity page tracks `capacityMbps` vs `utilizedMbps` with 4 utilization bands (<50/50–70/70–85/>85%). Sparkline for last 30 days. Forecast saturation date. Industry-standard.

---

## F. Scalability Review

**MWLinkListPage at 100K+ links.** Loads via `useEntityList('mwLinks', { pageSize: 1000 })` (`MWLinkListPage.tsx:312`) — fetches up to 1000 links and filters client-side. At 100K links this will choke. Filtering, sorting, and the bulk-action selection all happen client-side. Pagination is client-side (`pageSize: 20`). For real scale, the API must support server-side pagination, server-side filtering (regulator, region, band, status, link type, vendor), and a search index for the cross-field hay (`linkName + linkCode + id + sites + frequency + assignedTo`). KPI counts are recomputed on every render across all loaded rows — fine at 1k, broken at 100k.

**HopChainDiagram at 50+ hop chains.** The list page builds all chains in memory (`buildAllChains()` at `MWHopChainListPage.tsx:113`). The diagram page lays out hops horizontally at 220 px each (`MWHopChainDiagramPage.tsx:669`). A 50-hop chain would be 11,000 px wide — overflowed by horizontal scroll inside the card, which is correct. Bottleneck identification scans hops linearly. Performance should hold at 50–100 chains/2,000 total hops; degrades beyond.

**Frequency license dashboard at 10K+ licenses.** `buildAllLicenses()` is called every render (`useMemo` without deps that capture seed). KPI counts iterate licenses. Spectrum plots render per-license on detail view. Page-level KPI strip on the list is fine at 10K; the expiry-report timeline at 24 months × 10K licenses will be slow because each license renders an SVG circle with a Tooltip wrapper. Solution: virtualize the markers or aggregate by week.

**Path survey workflow at high volumes.** Surveys table is paginated at 15 rows. Filter is client-side. Photo storage is mock (counts only). Real photo handling would require a CDN-backed asset URL field, not a count.

**Interference analysis matrix at scale.** Single-link analysis only — no portfolio view. Cannot scale to "find all coordination conflicts across N licensed links" because the analysis is per-link and manual. A real coordination engine would maintain a spatial index of licensed links (R-tree by lat/lon and bearing) and query for potential conflicts in O(log N).

---

## G. AI Opportunities

**AI rain fade prediction with weather data.** Highest-value AI addition. Integrate with NOAA / ECMWF weather APIs and ITU-R P.837 rain maps to predict link outage events 24–72 hours ahead. Use ensemble of LSTM (RSL/BER time series) and weather covariates. The module already stores RSL trends — wire them to a prediction service.

**Predictive interference detection.** Train a model on historical C/I measurements vs interferer parameters; flag new license applications that would create conflicts with existing licensed links. Use the existing FrequencyLicense graph plus the interferers data as labeled training data.

**Auto-modulation optimization.** Recommend min/max modulation given measured RSL distribution and target availability. Trivial regression but high operational value: today's adaptive modulation runs the same default config across diverse links.

**Failure prediction from RSL/BER trends.** Classic anomaly-detection problem. Build a per-link Holt-Winters baseline; flag deviations > 2σ for 6+ hours as pre-failure indicators. The Performance tab already has the data.

**Auto-route optimization for hop chains.** Given a set of candidate hop chains for a destination site, recommend the one with best availability × cost trade-off. The bottleneck analysis and per-hop availability data on the diagram page are the inputs.

**Capacity demand forecasting.** Time-series forecast on `utilizedMbps`; identify links that will saturate in the planning horizon. The Capacity Planning page already shows `forecastSaturation` — wire that to a Prophet or DeepAR model with 12-month look-ahead.

**AI-assisted path survey.** Use satellite imagery + lidar DEM (USGS 3DEP, EU Copernicus DEM) + terrain APIs (Mapbox Tilequery, Google Elevation) to auto-generate the elevation profile at survey-creation time, then check Fresnel clearance against the profile. Render the obstruction map automatically; the surveyor confirms in the field rather than measures from scratch.

---

## H. UX & Visualization Improvements

**3D hop chain visualization.** The current ChainSVG is 2D linear. A 3D map overlay (Cesium / deck.gl) would show actual geographic routing and reveal redundancy gaps (e.g. two "redundant" hops crossing the same ridge).

**Path profile interactive viewer.** Replace the static SVG placeholder in PathSurveyFormPage with an interactive elevation chart (zoom, hover for distance/elevation, Fresnel ellipsoid overlay). Off-the-shelf libraries (Plotly, ECharts, Recharts) handle this cleanly.

**Geographic link overlay on map.** No map view in the module today. Add a `/mw-links/map` page with all links rendered as great-circle arcs on a Mapbox/Cesium globe, colored by status, with the at-risk links pulsing. The site dashboard exists in other modules; the MW module would benefit from the same.

**Link-level alarm dashboard.** Today every link's "current alarm" is `link.status` derived from the rollout phase. A real alarm dashboard would show NMS-fed alarms by severity (critical/major/minor/warning), by alarm category (RSL low, BER high, hardware fault, optical loss, sync loss), with acknowledgement and clearance workflow. This is the single biggest "missing day-2 view" in the module.

**AR alignment assistant for field engineer.** Mobile companion app that overlays the antenna boresight using phone IMU + GPS + cell-tower bearing; speaks "rotate +0.4° azimuth, RSL improving" while the engineer turns the antenna. Aviat ProVision Field has this; it would be a differentiator.

---

## I. Technical Architecture

**Real-time RSL/BER feed integration (SNMP, NMS).** Not present. The module reads from a mock `db` singleton. Production integration would need (1) an SNMP poller writing to a TSDB; (2) a streaming endpoint (Kafka / WebSocket) for alarms; (3) a backfill API for historical PM data. The detail page's PerformanceTab is the natural consumer.

**NMS integration (Ericsson NetAct, Nokia NetAct, Huawei iManager, Aviat ProVision, Ceragon NMS).** None. Each vendor exposes a different northbound: NetAct uses CORBA/SNMP/JMS, iManager U2000 uses XML/SOAP, ProVision is REST-based, Ceragon offers SNMP + a CSV export. A normalized abstraction layer is the right architecture. The module's link entity is vendor-neutral enough to act as the integration target.

**Hop chain dependency engine.** Built in-memory in `buildAllChains()`. Reasonable for ≤100 chains. At enterprise scale (1,000+ chains, 10,000 hops), this needs a graph database (Neo4j, JanusGraph) or a denormalized chain-membership table.

**License authority integration (FCC ULS, OFCOM, TRAI).** None. FCC ULS exposes a public XML API; OFCOM Spectrum Information System has REST endpoints; TRAI requires a manual submission still. The module should at least cache the regulator's submission reference and grant date.

**BackhaulDetailRouter stub.** As discussed in §C, this is the appropriate dispatcher, not a sign of incomplete work.

---

## SCORING

| Dimension | Score |
|---|---|
| Workflow Completeness | 7/10 |
| UX Sophistication | 8/10 |
| Telecom Domain Accuracy | 6/10 |
| Data Intelligence | 4/10 |
| Scalability Readiness | 4/10 |
| AI Readiness | 3/10 |
| **Overall** | **6/10** |

Justification:
- **Workflow 7:** Lifecycle is well-modeled, business rules (BR-MWL-001 through 014) are explicit and surfaced contextually. Procurement and decommissioning are thin.
- **UX 8:** Visualization is well above market average — funnel chart, chain SVG, spectrum plot, polar interferer map, expiry timeline are all polished.
- **Telecom Accuracy 6:** Conceptually correct but engineering math is delegated to the RF Design module and not validated here; ITU-R P.530/P.838 rain math, ATPC, SyncE/PTP, ERPS, XPIC isolation, per-modulation thresholds are all missing.
- **Data Intelligence 4:** No PM/FM feed, no anomaly detection, no real forecasting; everything is mock or deterministic synthetic.
- **Scalability 4:** Client-side pagination/filtering/KPI computation limits the module to ~1k links; no virtualization, no server-side filter API contract documented.
- **AI Readiness 3:** AI is decorative (the AIInsightCard) rather than functional; high-value opportunities (rain fade prediction, failure prediction, capacity forecasting) are unbuilt.

---

## TOP 10 PRIORITY FIXES

Benchmarked against Ericsson MINI-LINK Manager, Nokia NetAct, Ceragon CeraOS Manager, Aviat ProVision.

1. **Wire real PM data — RSL, BER, MSE, availability, error seconds.** Replace `PerformanceTab` synthetic series with TSDB ingestion. NetAct / iManager / ProVision all expose this; without it, every "day-2 operations" view is fiction.
2. **Implement an alarm dashboard.** New page `/mw-links/alarms` showing live alarms per link with severity, category, age, owner, clearance workflow. This is the single biggest commercial-NMS feature gap.
3. **Add ITU-R P.530/P.838 rain fade math + region picker.** Surface rain rate `R_0.01` selection, polarization-dependent k/α, effective path length, link unavailability. Today the field exists as a static number.
4. **Capture per-modulation receiver threshold sensitivity.** Without it, no real adaptive-modulation or ATPC analysis is possible. Add a vendor-equipment library with thresholds per modulation × bandwidth.
5. **Build a real coordination engine.** Spatial index of licensed links (R-tree by lat/lon) + frequency/polarization conflict detection. Run on every new license application and surface conflicts in the FrequencyLicenseForm before submission.
6. **Add SyncE/PTP and ERPS modeling.** New tab on link detail for clock topology (T-BC/T-TC, clock class, holdover) and ring/1+1 protection membership. This is essential for modern packet-MW deployments.
7. **Decouple list/filter from client-side memory.** Server-side pagination + filter API contract for `mwLinks`, `mwFrequencyLicenses`, `mwPathSurveys`. Otherwise the module breaks at 10k+ rows.
8. **Map view of links.** `/mw-links/map` with Mapbox/Cesium overlay, links as great-circle arcs colored by status. Adds situational awareness no list page can give. Every commercial NMS has this.
9. **Wire MWInterferenceAnalysis results back to the FrequencyLicense.** Today the analysis exists in isolation. It should attach to the license's coordination tab as a clearance artifact, and the license cannot be marked Submitted unless a cleared analysis exists.
10. **Beef up Fixed Line Backhaul.** Add port turn-up form (Y.1564/RFC 2544 results), OTDR trace upload, service-activation milestone tracking, MEF EVC/OVC attributes. Today it is a 4-card display page; it should be a 6-tab detail like the MW side.

---

## File references (absolute paths)

- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWDashboard.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWLinkDetailPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWLinkListPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWLinkFormPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWLinkEndPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWHopChainDiagramPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWHopChainListPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWLinkCapacityPlanningPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWCommissioningFormPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWCommissioningReportPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWInterferenceAnalysisFormPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWEquipmentInventoryPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/MWBulkImportPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/PathSurveyListPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/PathSurveyFormPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/FrequencyLicenseListPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/FrequencyLicenseDetailPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/FrequencyLicenseFormPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/FrequencyLicenseExpiryReportPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/FixedLineBackhaulDetailPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/pages/BackhaulDetailRouter.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mw-link/lib/mwlActions.ts
