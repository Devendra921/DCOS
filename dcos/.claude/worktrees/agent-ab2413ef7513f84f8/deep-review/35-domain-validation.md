# Telecom Domain Validation Report

**Domain Accuracy Score: 4.6 / 10** — Inconsistent. Strong in vendor naming and lifecycle taxonomies; weak in engineering calculations and regulatory citations.

---

## Critical Domain Bugs (Fix Immediately)

### 1. EMF/RF Exclusion Zone Formula Is Physically Wrong
**Location:** `HSCEMFAssessment.tsx`
**Bug:** `Math.sqrt(power*0.8)` — has no basis in any RF safety standard
**Standards Violated:** ICNIRP 1998/2020, FCC OET-65, IEEE C95.1
**Real Formula Required:** Power density S = (EIRP × G_t) / (4π × d²) compared against MPE from frequency-band-specific table
**Consequence:** Worker safety calculations are fabricated; could cause RF overexposure incidents

### 2. PCI Range Bug for 5G NR
**Location:** `MacroRFDesignForm.tsx:990`, `SectorConfigPage.tsx:218`
**Bug:** NR PCI capped at 1023 (one place) and 503 (another) regardless of technology
**Correct Per 3GPP TS 38.211:** NR PCI range 0-1007
**Correct Per 3GPP TS 36.211:** LTE PCI range 0-503
**Consequence:** Invalid network configurations propagated to OSS

### 3. EIRP Formula Hardcoded
**Location:** `RFDesignDetailPage.tsx:951`, `MacroRFDesignForm.tsx:951`
**Bug:** `txP + 17 - 2` — fixed constants regardless of band, cable length, cable type, antenna gain
**Required:**
- Antenna gain lookup by model
- Cable loss by band and length and cable type
- Connector loss per connector type
- Combiner/diplexer loss
**Consequence:** EIRP calculations silently wrong by 20-30 dB at mmWave (n258 etc.)

### 4. TIA-322 Cited for Climbing Safety
**Location:** `HSCSafetyAuditExecution.tsx` (tower climb template)
**Bug:** References "TIA-322 §4.3 / §5.2 / §6.1" for climbing safety items
**Reality:** TIA-322 covers structural loading/strength only
**Correct Standard:** ANSI/ASSE A10.48 (Telecommunication Tower Construction)
**Consequence:** Compliance auditor would invalidate audit reports

### 5. Battery Critical Threshold Conflated
**Location:** `PowerDashboard.tsx:254`, `PowerListPage.tsx:172`
**Bug:** Single 2h cutoff for "critical battery"
**Reality:** Different tech types require different minimums
  - Macro: 4h (per TECH_BATTERY_MINIMUMS)
  - C-RAN: 8h
  - Small Cell: 2h
  - WiFi: 1h
**Consequence:** False sense of safety for critical sites

### 6. LTIFR/TRIR Hardcoded as Strings
**Location:** Health & Safety dashboards
**Bug:** `lostTimeRate: '0.42'` literal string
**Required:** Computed from `(num_incidents × 200,000) / hours_worked`
**Consequence:** Every published safety metric is a literal; safety performance unmeasured

### 7. WiFi Heatmaps Are CSS Gradients
**Location:** `WiFiDesignDetailPage.tsx:897-963`
**Bug:** Decorative CSS gradient backgrounds
**Required:** Real propagation modeling (ITU-R M.2412, Log-distance, COST-231 indoor)
**Consequence:** Coverage predictions are theatrical; will deploy with coverage holes

### 8. DAS Cable Loss Frequency-Independent
**Location:** `DASComponentTablePage.tsx:164`
**Bug:** `0.07 × length` regardless of cable type or band
**Reality:** Cable loss varies by:
- Cable type (½", ⅞", 1¼", LMR-400, etc.)
- Frequency (loss increases with frequency)
- Temperature
**Consequence:** Link budget calculations are systematically wrong

### 9. Permit Time-Extension Bug
**Location:** Health & Safety permit module
**Bug:** `parseInt(extendTarget.to, 10) + extendHours` misparses "HH:MM"
**Consequence:** Time extensions ignore minutes; permit may expire mid-shift

### 10. CAPEX/OPEX Classification = Coin Flip
**Location:** `FinancialDashboard`
**Bug:** `rand() > 0.3` for classification
**Reality:** IFRS 16 / ASC 842 has specific tests (transfer of ownership, purchase option, lease term, PV of payments)
**Consequence:** Financial reporting is non-compliant

---

## Domain Coverage Validation By Area

### RF Engineering (Score: 5/10)
| Element | Status | Notes |
|---|---|---|
| LTE PCI range (0-503) | ✅ Correct | |
| 5G NR PCI range (0-1007) | ❌ Wrong | Capped at 1023 or 503 |
| EARFCN ranges | ✅ Mostly correct | NR: 627264+, LTE: 9820+ |
| EIRP calculation | ❌ Hardcoded | No cable/antenna lookup |
| MIMO configurations | ⚠️ Listed but not validated | 2T2R/4T4R/8T8R/64T64R |
| Sector parameters | ✅ Complete | azimuth, tilt, beamwidth |
| Neighbor types | ✅ Correct | Intra/Inter-Freq/Inter-RAT |
| Auto-ANR | ⚠️ Geometric only | No PM/MR data driven |
| HARQ/scheduler | ❌ Absent | Not modeled |
| 5G BWP, SSB, CSI-RS | ❌ Absent | |
| Carrier Aggregation | ❌ Absent | |
| Cell DTX / Energy Saving | ❌ Absent | |
| VoLTE/VoNR | ❌ Absent | No QCI/5QI modeled |

### Microwave Engineering (Score: 7/10)
| Element | Status | Notes |
|---|---|---|
| Free Space Loss | ✅ Correct | |
| Fresnel zone clearance | ✅ Correct | 60% rule |
| Atmospheric loss | ⚠️ Mentioned, not computed | |
| Rain fade (ITU-R P.530) | ❌ Missing | Region-specific tables absent |
| Adaptive modulation | ✅ Listed (QPSK to 1024QAM) | |
| Polarization | ✅ Listed | V, H, dual |
| Frequency bands | ✅ Comprehensive | 6-80 GHz |
| ODU/IDU | ✅ Modeled | |
| Ethernet over MW | ⚠️ Listed | |
| IP/MPLS | ⚠️ Listed | |
| SyncE/PTP | ❌ Missing | Required for 5G |
| ATPC | ❌ Missing | |
| XPIC | ❌ Missing | |
| Ring protection (ERPS) | ❌ Missing | |

### O-RAN / C-RAN (Score: 5/10)
| Element | Status | Notes |
|---|---|---|
| RU/DU/CU disaggregation | ✅ Correct | |
| Split Option 7.2x | ⚠️ Referenced | Not deeply modeled |
| CU-CP/CU-UP | ⚠️ Type only | E1 interface missing |
| Fronthaul latency (μs) | ✅ Modeled | Color thresholds |
| eCPRI | ✅ Listed | |
| E1 interface | ❌ Missing | |
| F1 interface | ❌ Missing | |
| E2 interface | ❌ Missing | |
| O1 interface | ❌ Missing | NETCONF/YANG absent |
| A1 interface | ❌ Missing | |
| RIC (Non-RT/Near-RT) | ❌ Missing | |
| xApps/rApps | ❌ Missing | |
| Cloud infra (K8s) | ❌ Missing | |
| Accelerator cards (FlexRAN) | ❌ Missing | |

### Power Systems (Score: 7/10)
| Element | Status | Notes |
|---|---|---|
| Battery autonomy hours | ✅ Modeled | <2h critical |
| Battery chemistry (VRLA, Li-ion) | ✅ Listed | |
| DoD per chemistry | ⚠️ Generic | Should be chemistry-specific |
| Temperature derating | ❌ All chemistries | Should be chemistry-specific |
| Generator capacity (kVA) | ✅ Modeled | |
| ATS timing | ⚠️ Mentioned | <10s |
| Fuel consumption | ✅ Modeled | |
| Solar PV system | ✅ Modeled | |
| MPPT trackers | ⚠️ Listed | |
| Grid connection stages | ✅ 6-stage pipeline | |
| Power sharing allocation | ✅ Strong | Per-operator | 
| Emission compliance | ❌ Not modeled | Tier 4 Final, BS V |

### Site Acquisition (Score: 8/10 — Strongest)
| Element | Status |
|---|---|
| Search ring (300m-1km) | ✅ |
| Structural feasibility (kN.m) | ✅ Best in module |
| LOS verification | ⚠️ Visual only |
| Zoning permits | ✅ |
| FCC NEPA review | ❌ |
| SHPO consultation | ❌ |
| Tribal Nations consultation | ❌ |
| FAA Form 7460-1 | ❌ |
| Tower classifications (1A/1B/1C) | ❌ |
| Tower types (lattice, monopole, etc.) | ✅ |
| AGL/ASL | ✅ |
| Technology-specific cycle benchmarks | ✅ Strong |
| Multi-criteria scoring | ✅ |
| Haversine distance | ✅ |

### MW Frequency Licensing (Score: 5/10)
| Element | Status |
|---|---|
| License pipeline stages | ✅ |
| Coordination workflow | ⚠️ Manual only |
| Interference analysis | ⚠️ Display only |
| Authority integration (FCC ULS, OFCOM) | ❌ |
| Expiry tracking | ✅ |

### CBRS (US-specific) (Score: 6/10)
| Element | Status |
|---|---|
| 3550-3700 MHz band | ✅ |
| Tier 1/2/3 (Incumbent/PAL/GAA) | ✅ |
| 6 WInnForum message types | ✅ Best modeled |
| SAS interaction | ✅ |
| Grant lifecycle | ✅ |
| CPI signing | ⚠️ Mentioned |
| Domain Proxy abstraction | ❌ Missing |
| ESC (Environmental Sensing) | ❌ Missing |
| DPA (Dynamic Protection Area) | ❌ Missing |
| Cat-A vs Cat-B parameters | ❌ AGL/beamwidth missing |

### Health & Safety (Score: 4/10)
| Element | Status |
|---|---|
| Audit framework templates | ✅ Recently rebuilt |
| OSHA 29 CFR references | ⚠️ Some |
| ANSI/ASSE A10.48 | ❌ Missing (should be primary climb standard) |
| OSHA 300/300A/301 forms | ❌ Missing |
| LTIFR/TRIR/DART computation | ❌ Hardcoded |
| Near-miss tracking | ⚠️ |
| Permit-to-Work (PTW) | ⚠️ |
| Tower rescue plan | ❌ |
| Worker certifications | ⚠️ Generic |
| ComTrain, NWSA certs | ❌ Missing specific telecom certs |
| EMF/RF MPE engine | ❌ Wrong formula |
| Incident reporting (TRIR) | ❌ Hardcoded |

### Financial / EVM (Score: 4/10)
| Element | Status |
|---|---|
| EVM S-curve (PV/EV/AC) | ⚠️ Static arrays |
| SPI/CPI calculation | ❌ Hand-typed |
| BAC/EAC/TCPI | ❌ Missing |
| Earned value formulas | ❌ Static |
| CAPEX/OPEX classification | ❌ Coin flip |
| 3-way match (PO/GRN/Invoice) | ❌ Missing |
| Retention | ⚠️ Hardcoded 5% |
| LD (Liquidated Damages) | ❌ Missing |
| IFRS 16 / ASC 842 | ❌ Missing |
| Multi-currency | ❌ Missing |

### Quality / Acceptance (Score: 6/10)
| Element | Status |
|---|---|
| ATP test categories | ⚠️ Partial (40%) |
| Civil ATP | ❌ Missing |
| Power ATP (load bank) | ❌ Missing |
| Safety ATP (fire/FM200) | ❌ Missing |
| Punch list lifecycle | ✅ |
| Defect categorization | ✅ |
| Closeout package | ⚠️ Hardcoded |
| SPC (Statistical Process Control) | ❌ |
| TIA-322 references | ⚠️ Wrong context (climbing) |
| Quality gates | ✅ |

### Lease Management (Score: 6/10)
| Element | Status |
|---|---|
| Commercial terms (24 fields) | ✅ |
| Escalation (fixed % vs CPI) | ⚠️ No cap/floor |
| CPI index reference | ⚠️ Mock refresh |
| Payment schedule | ✅ |
| IFRS 16 / ASC 842 | ❌ Missing |
| ROU asset, lease liability | ❌ Missing |
| MLA → SLA hierarchy | ❌ Missing |
| Renewal options (5+5+5) | ⚠️ |
| Termination workflow | ✅ |
| Composite health score | ⚠️ 3 conflicting formulas |

### Site Sharing / Co-location (Score: 5/10)
| Element | Status |
|---|---|
| 8 resource dimensions | ✅ |
| Structural model | ⚠️ One-dimensional |
| EIA-222 wind loading | ❌ |
| ASCE 7-16 seismic | ❌ |
| PIM/IM3 | ❌ |
| Antenna decoupling | ❌ |
| Height slot allocation | ✅ |
| Interference analysis | ⚠️ Display only |
| MLA / SLS contract hierarchy | ❌ |
| Anchor tenant vs co-tenant | ❌ |
| ASC 842 straight-lining | ❌ |

---

## Standards/References Coverage Audit

### Cited Correctly
- 3GPP TS 38.211 (NR PCI) — but range bug
- 3GPP TS 36.211 (LTE PCI)
- FCC OET-65 (cited but EMF formula doesn't follow)
- OSHA 29 CFR 1926
- ANSI Z359 fall protection
- ITU-R P.530 (mentioned but not implemented)

### Missing References
- ANSI/ASSE A10.48 (telecom tower construction — should be primary)
- ANSI/EIA-222 (legacy tower standard)
- TIA-222 (current tower structural standard) — confused with TIA-322
- 47 CFR Part 17 (FAA tower marking/lighting)
- IEEE 1100 (Emerald Book — grounding)
- Motorola R-56 (grounding for telecom)
- NFPA 70 (NEC), NFPA 70E (electrical safety)
- IEC 61400-1 (wind loading)
- IEEE C95.1 (RF exposure)
- ITU-R P.838 (rain fade specific attenuation)
- ITU-R P.526 (diffraction)
- ITU-R P.676 (atmospheric attenuation)
- ITU-R M.2412 (5G propagation)
- 3GPP TS 38.473 (F1AP)
- 3GPP TS 38.463 (E1AP)
- O-RAN.WG4.CUS.0 (Fronthaul U/C/S-plane)
- TM Forum TMF638, TMF642 (Service/Inventory APIs)
- IFRS 16, ASC 842 (lease accounting)
- PMBOK 6th/7th edition (PM methodology)
- ISO 55000 (asset management)

---

## Field Operations Reality Check

### Tier-1 Operator Workflow Gaps
Real telecom rollout operations include phases NOT modeled:
1. **SAR (Site Acquisition Request)** — missing
2. **TSSR (Telecom Site Survey Report)** — missing
3. **MAS (Master Acquisition Sheet)** — missing
4. **CIQ (Configuration Item Quality)** — referenced but no entity
5. **PAT (Provisional Acceptance Test)** — missing
6. **FAT (Final Acceptance Test)** — missing
7. **WCC (Wireless Configuration Certificate)** — missing
8. **NOC Handover** — missing
9. **CWP (Cell Working Plan)** — missing
10. **MoP (Method of Procedure)** — missing

### Multi-Vendor Coordination Gaps
- No vendor ownership matrix per phase
- No vendor handoff workflows
- No vendor-specific document requirements
- No "OEM acceptance" workflow (Ericsson EBSE, Nokia NIC certified handoff)

### Regional/Circle Operations
- Region is flat 8-value enum
- Indus Towers (India) operates 22 circles — not modeled
- American Tower operates 25 countries — not modeled
- No country/circle/cluster hierarchy

### Spectrum & Frequency Management
- No spectrum holding tracking
- No frequency assignment workflow
- No regulator interface (FCC, OFCOM, TRAI)
- No 5G NR n78/n258/n261 specific workflows

### Drive Testing & Optimization
- No drive test data import
- No drive test campaign management
- No CSV/CDR import for optimization
- No log file analysis

---

## Telecom Domain Verdict

**The platform demonstrates substantial domain awareness in surface concepts but lacks engineering depth.**

Areas of Strength:
- Site acquisition workflows (technology-profiled)
- MW link engineering concepts
- Power systems vendor naming
- Lease portfolio concepts
- C-RAN architectural awareness
- CBRS lifecycle modeling

Areas of Critical Weakness:
- EMF/RF safety calculations (legally exposing)
- 5G NR specific features (BWP, SSB, beam management absent)
- O-RAN interfaces (E1/F1/E2/O1/A1 absent)
- Real engineering formulas (EIRP, cable loss, rain fade)
- Regulatory citations (often wrong standards cited)
- Multi-vendor coordination
- OSS/BSS integration
- Real-time telemetry

**Domain Maturity:** Demo-ready. **Not yet production-ready for Tier-1 operator deployment.** A senior RF engineer or safety officer doing a 30-minute review would find at least 10 deal-blocking domain bugs.
