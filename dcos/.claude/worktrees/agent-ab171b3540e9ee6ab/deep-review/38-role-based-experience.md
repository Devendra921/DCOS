# Role-Based Experience Review — 13 Personas

Each persona evaluated for: does the platform serve their actual decision-making needs?

---

## 1. CEO (Chief Executive Officer)

**Use Cases:** Quarterly board readout, investor updates, M&A scenarios

**Pages Used:** ExecutiveDashboard, ProgramPredictability, RolloutForecastDashboard

**Experience Rating:** 6.5 / 10

**What Works:**
- ExecutiveDashboard verdict banner (ON TRACK / AT RISK / BEHIND) is exactly what a CEO wants
- S-curve with PV/EV/AC tells the financial story instantly
- Region × Phase heatmap shows portfolio breadth

**What Fails:**
- **Same on-air % shown differently on different pages** — CEO loses trust immediately
- No board-ready PowerPoint export (current "export" produces text blob)
- No investor-ready financial narrative
- No M&A scenario tooling
- No competitive benchmarking ("How does our rollout compare to Verizon?")
- No ESG metrics (carbon footprint of rollout, renewable energy %)
- No supply chain risk view
- Three different "actual capex" numbers for FY2026 — CFO will catch this in 30 seconds

**Required Additions:**
- Single financial source of truth across all dashboards
- Board-ready PowerPoint generation
- ESG and sustainability metrics
- Competitive benchmark integration

---

## 2. CTO (Chief Technology Officer)

**Use Cases:** Network strategy, technology decisions, vendor RFP

**Pages Used:** ExecutiveDashboard, TechnologyProgress, AIDashboard, NetworkSnapshot

**Experience Rating:** 5.5 / 10

**What Works:**
- Technology mix view (Macro/Small Cell/DAS/C-RAN/WiFi)
- Network snapshot conceptually
- Vendor performance overview

**What Fails:**
- **No real KPI feed** — RAN performance (RSRP, RSRQ, throughput) absent
- **No OSS integration** — can't see actual network health
- **AI Dashboard has no actual AI** — CTO will dismiss after 5 minutes
- **No 5G NR specific features** (BWP, SSB, beam management)
- **No O-RAN architecture view** for vendor diversity strategy
- **No spectrum portfolio view** — what bands do we hold? what's expiring?
- **No competitive position** — what's our market share by tech?

**Required Additions:**
- Real OSS data feeds for live network KPIs
- 5G NR feature support
- O-RAN architecture management
- Spectrum portfolio dashboard
- Live network health (NOC-style)

---

## 3. PMO Head (Program Management Office)

**Use Cases:** Multi-program coordination, governance, stage gates

**Pages Used:** PPMDashboard, ProgramSiteRollout, TaskDashboard, WorkloadDashboard

**Experience Rating:** 2.1 / 10

**What Works:**
- Program names are plausible
- RolloutGantt visually shows timeline

**What Fails Catastrophically:**
- **5 programs hand-typed in 3 different in-memory dictionaries** — drift inevitable
- **ProjectDetailPage shows same content for ALL projects** regardless of URL ID — credibility-destroying bug
- **No EVM** (no PV/EV/AC/SPI/CPI calculations)
- **No CPM** (no critical path analysis)
- **No PERT** (no probabilistic forecasting)
- **No resource leveling**
- **No stage gates** (PMO depends on tollgate enforcement)
- **No risk register**
- **No MS Project / Primavera P6 integration**
- **Workflow alerts are decorative** (acknowledge button doesn't persist)
- **Workload heatmap labels PMs, not actual task assignees** — wrong people
- **Hardcoded "today" sentinels** freeze overdue calculations

**Verdict:** PMO Head cannot use this platform. PPM module needs complete rebuild.

---

## 4. Circle Head / Country Head (Regional VP)

**Use Cases:** Regional rollout management, vendor governance, P&L

**Pages Used:** ExecutiveDashboard, RegionHeatmap, regional filters

**Experience Rating:** 3.0 / 10

**What Fails:**
- **Region is flat 8-value enum** — no Country/Circle/Cluster hierarchy
- **No regional P&L view** — CFO data not regionally sliced
- **No regional crew utilization**
- **No regional SLA dashboard**
- **No regional vendor performance**
- **Indus Towers 22 circles or American Tower 25 countries not modeled**

**Required Additions:**
- Hierarchical organization model (Operator → Country → Region → Circle → Cluster)
- Regional P&L
- Regional crew/vendor/SLA breakdowns
- Regional handoff workflows

---

## 5. Rollout Manager / Project Manager

**Use Cases:** Day-to-day site execution, issue management, vendor coordination

**Pages Used:** SiteDetailPage, SiteListPage, IssueList, MyIssues

**Experience Rating:** 5.0 / 10

**What Works:**
- SiteDetailPage has every tab a PM needs (Overview, Scopes, Issues, Milestones, Documents, History, Audit)
- Real mutation hooks (`useSiteActions`)
- RBAC guards
- Bulk operations

**What Fails:**
- **5,431-line monolith** — slow to load, hard to navigate
- **Synthetic data backfill** when API returns empty — PM gets fake issues, fake crews
- **17-22 tabs eagerly render** even when not active
- **Hardcoded `userRole === 'R02'` in PhaseAdvancementModal** — not operator-configurable
- **No SAR, TSSR, MAS, PAT, FAT, WCC, NOC Handover stages** — incomplete lifecycle
- **No tower loading data, no spectrum/license linkage**
- **No real-time updates** — PM has to refresh manually
- **No mobile view** — PM works from car between sites

**Required Additions:**
- Lazy-load tabs
- Eliminate synthetic data
- Add full telecom lifecycle stages
- Real-time updates via WebSocket
- True mobile/tablet view

---

## 6. RF Engineer

**Use Cases:** RF design, neighbor planning, PCI management, optimization

**Pages Used:** RFDesignDetailPage, MacroDesignList, PCIPlanDetail, NeighborRelationList

**Experience Rating:** 5.5 / 10

**What Works:**
- 7-tab detail page covers most RF concerns
- SectorRadialDiagram with drag handles is best-in-class UX
- PCI 60-cell visual grid is intuitive
- Polar EIRP chart shows coverage pattern
- CBRS SAS lifecycle modeled

**What Fails:**
- **5G NR PCI range bug** (capped at 1023, should be 1007; SectorConfigPage caps at 503)
- **EIRP formula hardcoded** — no cable/antenna/band lookup; silently wrong by 20-30 dB at mmWave
- **No real Atoll round-trip** — export is CSV fallback only
- **No drive test data integration**
- **No HARQ, scheduler, BWP, SSB, CSI-RS, CORESET parameters**
- **No 5G NR Carrier Aggregation config**
- **No VoLTE/VoNR QCI/5QI modeling**
- **PCI conflict algorithm wrong** — counts global duplicates without spatial constraint
- **No cell DTX / energy saving**

**Required Additions:**
- Fix PCI range and EIRP formula
- Real Atoll/ASSET/Mentum integration
- Drive test data ingest
- 5G NR specific features
- Spatial PCI conflict algorithm

---

## 7. Transmission / MW Engineer

**Use Cases:** MW link planning, link budget, hop chain management

**Pages Used:** MWLinkDetailPage, MWHopChainDiagram, MWPathProfileDetail

**Experience Rating:** 6.5 / 10

**What Works:**
- 12-tab MWLinkDetailPage covers nearly everything
- Free Space Loss + Fresnel zone correctly modeled
- Animated hop chain SVG is unique in market
- RSL/BER trending charts

**What Fails:**
- **No real NMS integration** — Performance tab is deterministic synthetic noise
- **ITU-R P.530/P.838 rain math missing** — region-specific tables absent
- **ATPC, SyncE/PTP, ERPS, XPIC not modeled**
- **Per-modulation Rx thresholds absent**
- **No coordination engine** for portfolio-wide frequency management
- **No interference matrix workflow**
- **FrequencyLicense workflow is per-license manual**

**Required Additions:**
- NMS integration (Ericsson MINI-LINK Manager, Aviat ProVision)
- ITU-R P.530 region-specific rain fade tables
- 5G transport sync (SyncE/PTP)
- Portfolio-wide coordination

---

## 8. Fiber Planner / Backhaul Engineer

**Use Cases:** Fiber rollout, backhaul planning, leased line management

**Pages Used:** FixedLineBackhaulDetail, BackhaulDetailRouter

**Experience Rating:** 2.0 / 10

**What Fails:**
- **BackhaulDetailRouter is a 28-line stub**
- **FixedLineBackhaulDetailPage is a 186-line stub** vs 1,434-line MW side
- **No fiber routing tools**
- **No splice point management**
- **No OTDR test record management**
- **No leased line lifecycle**

**Required Additions:**
- Build out fiber planning module
- Fiber route management
- Splice point tracking
- OTDR integration
- Leased line CRM (carriers, MRC, terms)

---

## 9. Site Acquisition Team

**Use Cases:** Candidate identification, survey, lease negotiation, permit tracking

**Pages Used:** AcquisitionDashboard, CandidateDetail, NominalSiteDetail, LandlordList, PermitList

**Experience Rating:** 8.0 / 10 (best-served persona)

**What Works:**
- 5-profile acquisition framework (Macro/Small Cell/DAS/C-RAN/WiFi-MW)
- Technology-profiled surveys with realistic fields
- Structural load capacity in kN.m (engineering-grade)
- Haversine distance from nominal to candidate
- Multi-criteria scoring
- Permit countdown
- BR-SAQ-008 rejection justification enforcement
- 6-entity pipeline funnel

**What Fails:**
- **No map embedded in CandidateDetailPage** — most-requested feature
- **Landlord CRM is shallow** — no detail page
- **No FCC NEPA / Tribal Nations consultation**
- **No FAA Form 7460-1**
- **Lease/license/easement collapsed**
- **No multi-evaluator scoring**
- **Permit dependency graph missing**

**Required Additions:**
- Map embed in candidate detail
- Full landlord CRM
- US-specific regulatory workflows
- Multi-evaluator scoring
- Permit dependency visualization

---

## 10. Vendor (External User)

**Use Cases:** View assigned sites, update progress, submit invoices

**Pages Used:** VendorPortalDashboard

**Experience Rating:** 2.5 / 10

**What Works:**
- VendorPortalConfigPage has SSO, brand customization
- Concept of vendor self-service is right

**What Fails Catastrophically:**
- **P0 SECURITY DEFECT:** Tenant switcher leaks cross-vendor data
- **Single vendor ID hardcoded** regardless of selection
- **No invoice submission UI**
- **No work order acceptance flow**
- **No safety document submission**
- **No payment status visibility**
- **No SLA dashboard for vendor's own view**

**Required Additions (after fixing security defect):**
- Vendor self-service portal with proper data isolation
- Invoice submission with PO match
- Work order accept/reject
- Document submission workflow
- Vendor's own performance dashboard

---

## 11. Finance Controller / CFO

**Use Cases:** Budget management, vendor payments, capex tracking, audit

**Pages Used:** FinancialDashboard, CapexExecutionDashboard, OpexTrackerPage, BudgetManagement

**Experience Rating:** 2.2 / 10

**What Fails Catastrophically:**
- **Three different FY2026 actual spend numbers** ($47.2M / $33.6M / $50.7M) across three pages
- **CAPEX/OPEX classification is `rand() > 0.3`** — IFRS-failing
- **EVM metrics are static hand-typed arrays** — not computed
- **No 3-way match** (PO/GRN/Invoice)
- **Vendor master is broken** — same vendor with different names across pages
- **No persistence** — closing a period vanishes on refresh
- **No multi-currency support**
- **Retention hardcoded at 5%**, no LD, no PBG/APG
- **No SLA penalty clock**

**Verdict:** CFO will reject platform within first meeting. Financial module needs complete rebuild.

---

## 12. NOC Team (Network Operations Center)

**Use Cases:** Live alarm monitoring, incident response, performance tracking

**Pages Used:** None — NOC workflow not supported

**Experience Rating:** 1.0 / 10

**What's Missing Entirely:**
- **No live alarm dashboard**
- **No real-time KPI monitoring**
- **No incident ticketing**
- **No escalation workflow**
- **No on-call rotation management**
- **No bridge call coordination**
- **No outage history**
- **No MTTR/MTBF tracking**
- **No NMS integration** for actual alarms

**Verdict:** Platform is not currently usable for NOC operations. Need entire NOC module.

---

## 13. Field Engineer / Technician

**Use Cases:** Site visits, inspections, installation work, issue reporting

**Pages Used:** Mobile App pages (all 21)

**Experience Rating:** 1.6 / 10 (worst-served persona)

**What Fails Catastrophically:**
- **"Mobile App" is desktop React in CSS iPhone frame** — not deployable
- **No PWA manifest, no service worker, no offline support**
- **No camera, no GPS, no barcode scanner** (zero native API usage)
- **MobileDigitalSignature is one-tap forgery** with "legally binding" label — direct legal liability
- **MobileVoiceNotes returns MOCK_TRANSCRIPT** constant
- **MobileTimeTracking shows same hardcoded string** for paused and running
- **GPS check-in hardcoded** to `±8m` accuracy
- **Barcode scanner alternates match/no-match via modulo**
- **Photo gallery thumbnails are CSS gradients**, not actual photos
- **Cross-module ID mismatch** (same site, different coords on different pages)

**Verdict:** Field workforce cannot use this. Mobile module needs **complete rebuild** as PWA or native app.

---

## Aggregate Persona Scores

| Persona | Score | Critical Gaps |
|---|---|---|
| **Site Acquisition Team** | **8.0** | Map in candidate detail, US regulatory workflows |
| **MW Engineer** | 6.5 | NMS integration, ITU-R rain math |
| **CEO** | 6.5 | Financial truth conflicts |
| **CTO** | 5.5 | No real OSS, no real AI |
| **RF Engineer** | 5.5 | PCI/EIRP bugs, no Atoll integration |
| **Rollout Manager / PM** | 5.0 | Synthetic data, monolithic detail page |
| **Circle Head** | 3.0 | No regional hierarchy, no regional P&L |
| **Vendor (External)** | 2.5 | Security defect, missing invoice workflow |
| **Finance Controller / CFO** | 2.2 | Three different actuals, rand() classification |
| **PMO Head** | 2.1 | No EVM, no CPM, ProjectDetail bug |
| **Fiber Planner** | 2.0 | Module is a 28-line stub |
| **Field Engineer / Technician** | 1.6 | Not a real mobile app, signature forgery |
| **NOC Team** | 1.0 | No NOC module exists |
| **AVERAGE** | **4.0** | Significant rebuilds needed for 9 of 13 personas |

---

## Persona-Driven Strategic Recommendations

### Tier 1 — Personas Already Well-Served (Polish, Don't Rebuild)
- Site Acquisition Team — polish maps + US regulatory
- MW Engineer — add NMS feed + rain math
- CEO — fix financial truth, add PowerPoint export

### Tier 2 — Personas with Substantial Gaps (Major Work)
- CTO, RF Engineer, Rollout Manager — domain depth needed

### Tier 3 — Personas Effectively Unserved (Rebuild Required)
- PMO Head, CFO, Vendor (External), Fiber Planner

### Tier 4 — Personas Completely Unserved (New Modules Required)
- Circle Head — hierarchical org model
- Field Engineer — real mobile app
- NOC Team — entire NOC module

---

## Bottom Line

Out of 13 critical personas:
- **1 is well-served** (Site Acquisition Team at 8.0)
- **3 are partially served** (5.5-6.5)
- **3 are weakly served** (3.0-5.0)
- **6 are essentially unserved** (≤2.5)

**Average persona experience: 4.0 / 10.**

For a platform aspiring to serve a Tier-1 operator's entire rollout organization, this is insufficient. **Each weakly-served persona represents a deal-breaking gap.**

A telecom CTO evaluating this platform will assemble their team for a clickthrough. With 6 of 13 personas finding the platform essentially unusable within 10 minutes, the platform will be rejected before the formal evaluation completes.
