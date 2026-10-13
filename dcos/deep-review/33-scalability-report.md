# Scalability Bottleneck Report

**Verdict: The platform will break at ~2,000 sites. Tier-1 operators run 50K-200K sites.**

---

## Scalability Score: 2.3 / 10

The platform is architected as a **client-side monolith**. All data flows through browser memory. All filtering, sorting, pagination, and KPI computation happens in JavaScript on the user's machine.

This is appropriate for the current 500-site mock dataset. It will catastrophically fail at production scale.

---

## Specific Bottlenecks Identified Per Module

### Critical Bottlenecks (Break at 2K-10K sites)

| Location | Issue | Failure Mode | Module |
|---|---|---|---|
| `mock/db/store.ts` | In-memory `Map<entity, Map<id, record>>` | OOM at ~15K sites (browser RAM limit) | Core |
| `HomeCommandCenter.tsx` | `db.getAllRaw()` synchronous in `useMemo` | Main thread block grows linearly | Core |
| `SiteDetailPage.tsx:515-516` | Fetches 5K sites + 5K scopes for nearby-radius | OOM, hang | Site Lifecycle |
| `SiteListPage.tsx:436-497` | Advanced search runs client-side over 1K cap | Incomplete results at 100K | Site Lifecycle |
| `TechSitesListPage.tsx:252-326` | Loads all sites + scopes; no virtualization | Hang at 5K+ rows | Site Lifecycle |
| `AcquisitionDashboard.tsx` | Pulls 1,000 records per entity client-side | Won't scale past 5K nominals | Site Acquisition |
| `OperatorAllocationListPage` | pageSize 5000 client fetch | Hang at 10K+ allocations | Site Sharing |
| `RFDashboard` | Hash-based regional aggregation client-side | Wrong at scale; need server agg | RF Design |
| `PCIConflictAnalysisPage` | O(n²) conflict detection | Browser hang at >5K cells | RF Design |
| `MWDashboard` | Client-side phase/type derivation via hash | Wrong at scale | MW Link |
| `CRANDashboard.heatmap` | Hardcoded `slice(0, 30)` | Loses data past top 30 | C-RAN |
| `PowerDashboard` | Client-side fuel data aggregation | Wrong at 100K sites | Power |
| `LeaseDashboard` | Client treemap, waterfall computations | Hang at 50K leases | Lease |
| `CrewDispatchPage` | 50 stub sites; client haversine for all | OOM at 10K crews | Crew |
| `EndToEndPathVerification` | Path tracing client-side | Hang at >100 paths | Readiness |
| `OpexTrackerPage` | 160 entries seeded; no pagination | Won't scale past 10K entries | Financial |
| `MainMapView` | Inline filter functions break MapCanvas memo | Re-render explosion at 10K markers | GIS |
| `HubSiteTopologyPage` | Brute-force SPOF O(N²·E) | Hang at >500 hub sites | GIS |
| `ProcurementHub`, `MaintenanceManagementHub` | Single-page state | N/A — no real data yet | Procurement/Maint |
| `NotificationListPage` | `todayCount` hardcoded date | Date-based scaling broken | Notification |

### Moderate Bottlenecks (Degrade at 10K-50K sites)

| Location | Issue | Module |
|---|---|---|
| All inline `style={}` props | Fresh object allocation per render | All 474 pages |
| All custom SVG charts | No `React.memo`, full re-render on parent change | All visualization pages |
| All `Table` instances | No virtualization (no react-window) | All list pages |
| TanStack Query cache invalidation | Global by entity type | All entity hooks |
| No WebSocket layer | All updates require polling or manual refresh | All operational dashboards |
| `setInterval(1000)` in ReadinessDashboard | 1Hz forced re-paint at scale | Readiness |
| `LiveRunFeed.tsx:28-32` | 1.5s tick with `void tick` (no state read) | AI Marketplace |

---

## Scalability By Layer

### 1. Data Layer — Score: 2/10
- **Storage:** Browser RAM only
- **Capacity:** ~15K records before OOM
- **Query:** No indexes, no caching strategy beyond TanStack Query
- **Real-time:** None (polling at best)
- **Multi-tenancy:** No data isolation

**Required:** Replace MockDB with PostgreSQL (relational) + Elasticsearch (search) + Redis (cache) + Kafka (events).

### 2. Compute Layer — Score: 3/10
- All KPIs computed client-side
- Heatmaps, S-curves, funnels: client-rendered
- Aggregations: in-browser JavaScript
- No background jobs
- No batch processing

**Required:** Server-side aggregation API. Pre-computed views for executive dashboards. Background ETL for analytics.

### 3. UI Rendering — Score: 4/10
- 474 pages, all in single SPA bundle (with lazy route splits)
- All SVG charts re-render on any state change
- No virtualization on lists
- No WebGL for large data visualization
- Inline CSS prevents browser optimization

**Required:** WebGL for >1K markers. React virtualization on all tables. Memoize all SVG charts. Migrate to CSS Modules.

### 4. Network Layer — Score: 2/10
- No real network calls (all mock)
- No connection pooling
- No request batching
- No GraphQL (would benefit field selection)
- No CDN strategy

**Required:** REST/GraphQL API with proper pagination, field selection, batching. CDN for static assets. Edge caching.

### 5. Caching Strategy — Score: 3/10
- TanStack Query handles client-side cache
- No HTTP caching headers
- No service worker
- No browser cache management

**Required:** Multi-tier caching (browser HTTP cache → CDN → application cache → database cache).

---

## Scale Test Predictions

### At 500 sites (current mock dataset)
- ✅ All dashboards render
- ✅ Filters respond instantly
- ✅ Maps show all markers
- ⚠️ Subtle performance issues in InterTechCoordinationMap

### At 5,000 sites (small operator)
- ⚠️ HomeCommandCenter takes 2-5s to load
- ⚠️ Site lists need pagination
- ⚠️ Maps need clustering
- ❌ Advanced search returns incomplete results
- ❌ PCI conflict analysis browser-hangs

### At 50,000 sites (mid-size operator)
- ❌ Browser OOM in 30 seconds
- ❌ Initial page load > 60s
- ❌ Maps unusable without WebGL
- ❌ All dashboards return wrong numbers (1K row cap)
- ❌ Search broken
- ❌ EVERY entity list page fails

### At 200,000 sites (Tier-1 operator)
- ❌ Application unusable
- ❌ Memory exhausted on page load
- ❌ Mobile devices cannot open the app

---

## Multi-Region / Multi-Country Scalability

The platform has NO regional/country sharding:
- Region is a flat 8-value enum (`Region` in types.ts)
- No Country/Circle/Cluster hierarchy
- Indus Towers (India) operates 22 circles; this would need refactoring
- American Tower operates 25 countries; not modeled
- No data residency controls
- No regional access controls

**Required:** Hierarchical organization model (Operator → Country → Region → Circle → Cluster → Site) with cascading access controls.

---

## Concurrent User Scalability

### Current State
- No real authentication (mock SEED_USERS)
- No session management
- No connection limits
- No rate limiting
- No DDoS protection

### Likely Failure Points at 100+ Concurrent Users
- TanStack Query cache thrashing
- Backend API contention (when built)
- WebSocket connection limits (when built)
- Audit log write contention

---

## Recommendations

### Phase 1: Immediate (0-3 months)
1. **Cap MockDB at 500 sites** — declare current architecture demo-only
2. **Add virtualization to tables** — react-window on all list pages
3. **Memoize SVG components** — React.memo + data equality checks
4. **Extract inline styles** — CSS Modules migration

### Phase 2: Backend Build (3-9 months)
1. **Build REST/GraphQL API** matching MockDB interface
2. **Server-side aggregation** for all dashboard KPIs
3. **Proper pagination** on all list endpoints
4. **Elasticsearch** for cross-entity search
5. **Redis** for caching

### Phase 3: Real-time (6-12 months)
1. **WebSocket** for operational dashboards (crew location, alarms, status)
2. **Kafka** for cross-module events
3. **CDC** (Change Data Capture) for downstream consumers

### Phase 4: Production Scale (9-18 months)
1. **WebGL maps** (deck.gl or Mapbox GL)
2. **Background ETL** for analytics
3. **Multi-region deployment**
4. **Database sharding** by operator
5. **CDN strategy**

---

## Capacity Target Sizing

For a **Tier-1 operator** (200,000 sites, 50,000 vendors, 100M telemetry events/day):

| Component | Size |
|---|---|
| Application Servers | 20-40 instances |
| Database | PostgreSQL with read replicas, ~5TB storage |
| Cache (Redis) | 200GB |
| Search (Elasticsearch) | 1TB indexed |
| Event Bus (Kafka) | 50TB retention |
| Object Storage | 50TB for documents/photos |
| CDN | 10TB/month bandwidth |
| Compute (background) | 50 worker nodes |

Current platform requires: **0 of these.** It runs entirely in the browser.

**Estimated production infrastructure cost:** $50K-$150K/month for a Tier-1 operator deployment.
