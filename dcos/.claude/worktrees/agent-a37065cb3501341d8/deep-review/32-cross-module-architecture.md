# Cross-Module Architecture Analysis

**Score: 4.0 / 10** — Strong design system, hollow integration substrate.

---

## Module Overlap & Duplicate Workflow Map

### Critical Overlaps (Modules Doing The Same Job)

| Module A | Module B | Overlap | Resolution |
|---|---|---|---|
| Site Lifecycle | Site Acquisition | Permits, Lease, Candidate tabs in Site Detail | Site Detail must DELEGATE to Site Acquisition pages, not duplicate |
| Site Lifecycle | Quality Acceptance | BuildQualityScorecard in Site Lifecycle duplicates VendorQualityScorecardPage | Remove from Site Lifecycle module |
| Site Lifecycle | Network Readiness | "Multi-RAT Coordination" tab in Site Detail duplicates ReadinessCheckExecution | Remove duplicate; link to Readiness module |
| Site Lifecycle | Maintenance Mgmt | SiteMaintenancePage doesn't belong in Site Lifecycle | Move to Maintenance module |
| RF Design (DAS) | C-RAN | Both model headend architecture | Decide ownership; DAS owns IBS, C-RAN owns macro |
| RF Design (MW Path) | MW Link | Path Profile in RF Design module while MW Link is separate | Merge or define crisp boundary |
| AI/ML Engine | AI Agents | AIAgentsPage (1 page) is orphaned hub | Merge into AI/ML module |
| AI/ML Engine | AI Insights | AIInsightsOverviewPage (1 page) is orphaned hub | Merge into AI/ML module |
| AI/ML Engine | AI Marketplace | Marketplace folder lives inside AI/ML but is conceptually separate | Move to standalone module OR collapse |
| External Integration | (itself) | Two parallel `Integration` and `Endpoint` page pairs with conflicting catalogs | Delete one set |
| GIS Maps | (multiple) | 25 GIS pages but ZERO embedding in operational modules | Embed MapCanvas into ops modules |
| Crew Workforce | (itself) | 8+ parallel vocabularies for the same conceptual "crew" | Unify identity model |
| Quality Acceptance | (itself) | Three parallel defect taxonomies (punchListItems, qaAudits.findings, reworkTasks) | Define canonical defect entity |
| Reporting Dashboards | (multiple) | Module-level dashboards duplicate cross-cutting metrics | Establish single semantic layer |

### Lifecycle Boundary Failures

The site lifecycle phases (Candidate → Acquired → Design → Build → Integration → On-Air → Operational) cross module boundaries:

1. **Candidate phase** owned by Site Acquisition — correctly modeled
2. **Acquired → Design handoff** — `AcquisitionHandoffPage` exists but no automated triggers
3. **Design phase** spans RF Design, Power Systems, MW Link, C-RAN modules with NO unified design package
4. **Build phase** owned by... nobody clearly. Site Lifecycle has BuildQualityScorecard (wrong module) but no construction work-order management
5. **Integration phase** owned by Network Readiness BUT readiness gate doesn't enforce
6. **On-Air → Operational** transition is undefined — no handoff to NOC
7. **Operational** has no owner — Maintenance Mgmt is a stub

**Recommendation:** Define a "Lifecycle Orchestration Service" that owns phase transitions, fires events, and enforces cross-module dependencies.

---

## Architectural Anti-Patterns

### Pattern 1: "Integration-Shim Theater"
Modules pretending to surface upstream data that doesn't exist. Examples:
- **Maintenance Mgmt:** Self-describes as "integration shim" with `href="#maintenance-platform"` empty anchor
- **Procurement:** Vendors as plain strings; no PO/RFQ/GRN entities exist
- **Notification Engine:** Single inbox page; no event bus, no router, no channel adapters
- **External Integration:** OAuth2 with no scope/PKCE config; mTLS without cert upload

### Pattern 2: "Toast-As-Workflow"
Critical workflows that announce success via `message.success` without persisting:
- `ReadinessCheckExecutionPage.handleConfirm` (line 619) — "On-Air" decision is a toast
- PPM `Acknowledge` button — alert remains pending on page reload
- Mobile signature "legally binding" — `setSigned(true)` only
- Bulk procurement upload — no actual ingest
- AI recommendation "Accept" — no learning loop

### Pattern 3: "Synthetic-Data-Fabrication"
Pages that backfill missing API data with hash-derived or hardcoded fakes:
- `SiteDetailPage.tsx:619-784` synthesizes fake issues, crews, punch list, permits, power systems
- `TechSitesListPage` columns derive from `pickFrom(siteId, [...])` with fields that don't exist in the data model
- `CrewDashboard.CREW_CARDS` hardcoded; 18 of 20 crew IDs don't bind to any other dataset
- Most Mobile app "data" hardcoded constants
- Three different FY2026 actuals across financial dashboards

### Pattern 4: "Hardcoded Today"
Files with literal date sentinels that freeze time-based logic:
- `TODAY = '2026-05-15'` and `new Date('2026-05-14')` in multiple files
- `OperatorAllocationListPage`, PPM dashboards, Notification engine all have this
- Overdue logic breaks the moment the calendar moves past 2026-05-15

### Pattern 5: "Dead UI"
Buttons/dropdowns/inputs with no handlers or consumers:
- PCI Strategy dropdown (Sequential/Random/Mod-N) — no algorithm consumes it
- Dashboard timeRange selector (30d/90d/180d/YTD) on AcquisitionDashboard — never used in computation
- Hero search box on AI marketplace
- "Open Builder Studio", "Compare versions" on AI marketplace
- Custom marker rules (never consumed by `buildIcon`)
- Heat Map Config controls (MapCanvas ignores them)

### Pattern 6: "Schema Drift"
Same concept represented differently in different files:
- Vendor master: same vendor as "Nokia" / "Nokia Corp" / "no Nokia" / "Nokia Corporation" across pages
- Program IDs: PRG-001 vs PGM-01 inconsistency
- Crew vocabularies: 8+ in Crew module
- Lease health formulas: 3 different formulas computing same metric

### Pattern 7: "Hub-Imports-Body"
Tab hubs importing named exports from sibling page files:
- `IntegrationHealthHub` (48 lines) imports from 3 sibling pages
- Multiple `*DashboardHub` files follow this pattern
- Creates architectural circularity

---

## Authorization System Tensions

### Dual Auth Systems
The platform has **two parallel authorization models**:

1. **Perspective/Capability System** (`core/perspective/`)
   - 23 perspectives × 8 tiers × 19 capabilities
   - Modern, well-designed
   - Used by `useCan()`, `RoleGate`, `useDensityColumns`

2. **PERMISSION_MATRIX** (`core/rbac/permissions.ts`)
   - 26 role IDs × 24 modules × CRUD permissions
   - Legacy parallel system
   - Independent of perspective

**Risk:** Authorization drift. A page passes capability check but fails RBAC matrix (or vice versa). No defined precedence rule.

**Fix:** Migrate PERMISSION_MATRIX into per-perspective module access declarations. Delete legacy system.

---

## Data Layer Inconsistencies

### Three Data-Access Patterns Coexist
1. **DB-routed:** `useEntityList`, `useEntityDetail` (correct pattern, used by ~60% of pages)
2. **Direct raw:** `db.getAllRaw()` in useMemo (HomeCommandCenter, ExecutiveDashboard — bypass query layer)
3. **Hardcoded constants:** ReadinessDashboard, CrewDashboard, PPMDashboard, all 7 marketplace pages, Notification, etc.

### Mock Data Singletons
Multiple modules independently seed mock data:
- Each financial page seeds its own random mock data with no shared store
- 5 PPM programs hand-typed in 3 different in-memory dictionaries
- 10 integration endpoints hand-coded vs 13 systems in `extMockData.ts`
- Mock crew master in Crew Dashboard not bound to entity DB

### Cross-Page Reference Failures
When pages link to detail views, the receiving page often re-mints data:
- ProjectDetailPage shows same content for ALL `id` values
- 18/20 crew detail links land on the same 2-record fallback
- VendorPortalDashboard hardcodes a single vendor ID regardless of selection

---

## Module Boundary Recommendations

### Modules to MERGE
1. **AI/ML + AI Agents + AI Insights** → single `AI Platform` module (3 → 1)
2. **Site Sharing + Asset Inventory (tower-mounted equipment)** → consider partial merge
3. **External Integration's duplicate page pair** → keep one, delete the other

### Modules to SPLIT
1. **AI/ML** → split into `AI Core (predictions)` and `AI Marketplace (agents)` cleanly
2. **Site Lifecycle** → extract BuildQualityScorecard, MaterialReadinessTracker, SiteMaintenancePage to proper owners
3. **Reporting Dashboards** → split into `Cross-cutting BI` and module-specific dashboards (move to owning modules)

### Modules to KILL
1. **Collaboration** — orphaned dead code, remove entirely OR rebuild as cross-cutting layer
2. **AI Agents (standalone)** — merge into AI/ML
3. **AI Insights (standalone)** — merge into AI/ML

### Modules to ELEVATE (rebuild as capabilities, not modules)
1. **Notification Engine** — should be platform service, not a UI module
2. **Document Management** — should be cross-cutting service
3. **GIS** — should be cross-cutting capability embedded everywhere

---

## Integration Architecture Requirements

### Missing Service Layer
There is NO service layer between React components and `MockDB`. Every page imports mock arrays directly. Migration to real backend requires rewriting every page.

**Required Architecture:**
```
React Components
    ↓
Domain Hooks (useSites, useDesigns, useLeases) 
    ↓
Service Layer (sitesService, designsService, leasesService)
    ↓
HTTP Client / GraphQL Client / WebSocket Client
    ↓
API Gateway
    ↓
Microservices
    ↓
Data Stores + Event Bus + Integration Adapters
```

**Current state:** React Components → MockDB. That's it.

### Missing Event Bus
Modules can't talk to each other. Examples of needed events:
- `SitePhaseAdvanced` — fired by Site Lifecycle, consumed by Network Readiness, Finance (payment milestone), PMO
- `DesignFrozen` — fired by RF Design, consumed by Procurement (BOM), Build, OSS sync
- `IntegrationFailed` — fired by Network Readiness, consumed by NOC, Quality (rework ticket)
- `AcceptanceComplete` — fired by Quality, consumed by Finance (payment trigger), Site Lifecycle (status advance)

---

## Final Architecture Verdict

The platform has **excellent design language and weak engineering substrate**. Concretely:

- **Design system:** 8/10 (genuinely strong)
- **Component library depth:** 7/10 (19 UX primitives + 14 support)
- **Authorization model:** 6/10 (good design, dual-system tension)
- **Data layer pattern:** 4/10 (clean MockDB, pages bypass it)
- **Integration substrate:** 1/10 (no service layer, no event bus, no adapters)
- **Module boundaries:** 4/10 (significant overlap and ambiguity)
- **State management:** 4/10 (inconsistent — TanStack Query mixed with direct DB reads)
- **Cross-module communication:** 2/10 (none — modules don't talk)

**Overall Architecture Score: 4.0 / 10**

The path to enterprise-grade is clear but expensive:
1. Define and enforce the service layer (3-4 months)
2. Build the event bus and inter-module choreography (3-4 months)  
3. Migrate hardcoded data to real persistence (6-8 months)
4. Unify dual auth systems (2-3 months)
5. Resolve all module boundary overlaps (2-3 months)

**Total architectural remediation: 16-22 months of focused work.**
