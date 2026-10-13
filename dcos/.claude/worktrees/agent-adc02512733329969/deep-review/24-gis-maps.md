# GIS & Maps Module — Deep Review

**Reviewer:** Telecom GIS / Geospatial Architect (20+ yrs, Tier-1 operator & TowerCo)
**Module:** `src/modules/gis-maps/` (25 pages + `MapCanvas.tsx` + `gisTheme.ts` + `gisMockData.ts`)
**Posture:** Severely critical — the module has solid Leaflet plumbing in one corner and a brilliant HubSiteTopologyPage in another, but the surface area is built for a *demo*, not for a Tier-1 rollout/run operation.

---

## A. Architecture & Stack

The module sits on `react-leaflet@5.0.0` + `leaflet@1.9.4` (`package.json` lines 18–24). A single shared component, `src/modules/gis-maps/MapCanvas.tsx`, wraps `<MapContainer>` with four base tiles (OSM, ArcGIS World Imagery, OpenTopoMap, "dark" = OSM with a CSS filter class). This is professional choice for a web stack — `react-leaflet@5` is the current React 18+ wrapper and `MapCanvas` correctly invalidates size on mount (`InvalidateOnMount`, lines 119–133) and animates camera via `flyTo` in a `useMap` consumer (lines 106–112). Good.

Critical concern: **dual map renderers coexist with no convergence path.**
- `MainMapView.tsx`, `HeatMapConfigPage`, `MWLinkOverlayPage`, `SpatialSearchPage`, `ProximitySearchPage`, `CoordinateSearchPage`, `BulkSelectionPage`, `RoutePlannerPage`, `ClusterEditorPage`, `GeoFenceManagementPage`, `CoverageImportPage`, `SavedViewsPage`, `MapExportPage`, `FloorPlanViewPage`, `FloorPlanUploadPage`, `SiteDetailPopupPage` → all share `MapCanvas`. 
- `MapViewPage.tsx` (lines 222–325) renders a **fake SVG grid** — comment on line 217 literally calls it *"Map View (simulated) … grid-projected site dots"*. This is a leftover and should be deleted.
- `AcquisitionMapView.tsx` (39 KB) renders **another fake SVG grid** with manually-positioned dots, search rings, and lines (lines 386–574). This is the *worst* offender — 893 lines of bespoke pseudo-cartography that ignore `MapCanvas`, ignore Leaflet, and re-invent projection (`projection.project`, line 207). Comment line 425 even labels itself "Simulated map".
- `HubSiteTopologyPage.tsx` (2,679 lines) uses Leaflet directly (`MapContainer`, line 21) and **does not use** `MapCanvas` either — its bespoke `buildDeviceIcon` (line 859), `MapController` (line 906) and entire interaction model live in this one file.

You therefore have three islands: shared Leaflet via MapCanvas, fake-SVG island #1 (`MapViewPage`), fake-SVG island #2 (`AcquisitionMapView`), and bespoke Leaflet island (`HubSiteTopologyPage`). For a real product, **one of these has to die** — the SVG simulations should be deleted and `HubSiteTopologyPage` should consume a richer version of `MapCanvas`.

Hub page (`Map*HubPage.tsx`) wrappers (lines 1–96 of each) are also a smell: they `lazy()` each child and render them in a `Segmented` or `TabBarV2` strip — but each child renders its **own** DashboardHeader + AMBIENT_BG (see `RoutePlannerPage.tsx` lines 59–65). When loaded inside the hub, the user sees two stacked headers. This is a regression introduced by the "Maps collapse" IA work.

---

## B. MapCanvas Component Quality

`MapCanvas.tsx` (276 lines) is the only honest map plumbing in the module. What it does well:
- Real OSM/Esri/OpenTopoMap tile providers with attribution (lines 70–75).
- Tech-aware `L.divIcon` factory with size & ring color (`buildIcon`, lines 15–33).
- Geofences, clusters, coverage polygons, MW polylines, route polylines, rectangle/circle/polygon draw shapes (lines 184–269).
- A "heatmap" function (`HeatCells`, lines 77–104).

What's missing for a real GIS canvas:
1. **No clustering.** With 100k markers (a Tier-1 footprint is 30k–200k cell sites + small cells), the comment on line 102 of `LayerControlPage` says *"Sites layer auto-clusters when more than 10,000 markers are in the viewport"* — but no clustering code exists. No `react-leaflet-cluster`, no `supercluster`, no `leaflet.markercluster`. Grep confirms: zero hits anywhere in the codebase.
2. **The "heatmap" is not a heatmap.** It is a 0.01° lat/lng bucket grid that draws translucent `Circle` overlays (`HeatCells` lines 79–103). Real heatmaps need `leaflet.heat` (kernel density, KDE radius/blur) — also absent. The Heat Map Configuration page's KPI/grid/palette UI (`HeatMapConfigPage.tsx`) is **purely decorative**: changing `grid`, `stops`, or `palette` does nothing because `MapCanvas` ignores those props (its `HeatCells` is fixed-bucket).
3. **No WebGL / vector tiles.** For >50k features you need `maplibre-gl` or `deck.gl`. The architecture cannot scale past ~5k markers without freezing the browser.
4. **No 3D.** Cesium / `three.js` are not present (grep returns empty). No coverage-volume rendering, no terrain DEM draping, no LOS analysis on viewshed.
5. **`siteFilter` runs on every render** (line 158: `useMemo` with the filter function as dep). Because `siteFilter` is recreated on every render in the parent (`MainMapView.tsx` line 281 — inline arrow function), the memo is invalidated every paint. With 5k+ markers this stalls Leaflet.
6. **DivIcon HTML is built per-render per-marker** (line 26). No `useMemo` on icons; on a zoom or pan, every marker's HTML is regenerated.
7. **No offline tile support** (no PMTiles, no MBTiles, no service worker tile cache). For field crews in cellular dead zones — a normal occurrence in tower work — the app is unusable.
8. The "dark" basemap is just OSM with `className="dark"` — there is no actual dark CSS filter applied (the prop `filterClass: 'dark'` is set on the TileLayer but no CSS rule applies it — only the inverse filter `.no-filter` is referenced).

---

## C. Layer Management

`LayerControlPage.tsx` (117 lines) is small and serviceable: list of `mapLayers` with up/down reorder buttons, opacity slider, min/max zoom, color picker, visibility toggle. The data is per-page state — **nothing is persisted, nothing flows through to MapCanvas.** Toggling opacity on `LayerControlPage` does not change `MapCanvas` rendering anywhere else, because `MapCanvas` does not accept per-layer opacity props. The page is decoupled UI theatre.

Real-world gaps:
- No layer groups / collections.
- No WMS/WFS support — a Tier-1 ops team will demand the ability to overlay carrier-provided ArcGIS Online or operator GeoServer WMS layers.
- No vector layer styling (categorized, graduated, rule-based).
- No layer permissions (who can see lease boundaries vs. who can see RF coverage).

---

## D. Search Capabilities (Spatial, Proximity, Coordinate, Hub)

- `SpatialSearchPage.tsx` (203 lines): rectangle / circle / polygon mode. **No actual drawing** — the rectangle is a hard-coded NYC bounding box (line 60), the polygon is a 4-point preset (line 55), the circle takes lat/lng/km from text inputs. There's no Leaflet-Draw / Geoman integration. The "draw on map" UX is missing entirely. Filter algorithms (`inRectangle`, `haversineKm`, `pointInPolygon` lines 12–33) are correct for small-area / plate-carrée — fine for city scale, but no spherical adjustment for high-latitude searches.
- `ProximitySearchPage.tsx` (109 lines): Solid haversine radius filter, sorted by distance ascending. Works. Limit: radius slider goes to 20 km only — field surveys often want 50–100 km searches.
- `CoordinateSearchPage.tsx` (135 lines): WGS84 + UTM 18N only (hardcoded NYC zone, line 10). **No MGRS, no DMS, no Plus Codes, no What3Words.** The UTM converter (lines 10–15) is a *linear approximation* using the page's own mock formula (`+ (e - 583000) / 80000`) — it is *not* a real Gauss-Krüger transformation, and it cannot work outside NYC. For a global Tier-1 operator this is unacceptable. Use `proj4js` or `mgrs.js`.
- `MapSearchHubPage.tsx`: A `<Segmented>` strip that lazy-loads the three child pages. Each child renders its own header → double-header bug noted above.

---

## E. Maps in Operations — the Critical Integration Gap

**This is the single biggest issue with the GIS module.** GIS in a Tier-1 operator must be embedded into every operational workflow. The current state:

| Operational Need | Where it lives | Map integration |
|---|---|---|
| Crew dispatch / vehicle tracking | `crew-workforce/pages/CrewDashboard.tsx` etc. | grep shows **zero MapCanvas imports** in `crew-workforce/` |
| Field service routing | `gis-maps/pages/RoutePlannerPage.tsx` (134 lines, standalone) | Standalone page; no link from Crew or Mobile App; `setStops` only stores in component state; "Send to crew" is a `message.success` toast |
| Site acquisition / nominal-candidate-acquired pipeline | `site-acquisition/` + bespoke `AcquisitionMapView.tsx` | Uses **fake SVG grid**, not Leaflet — confirmed in `AcquisitionMapView.tsx` lines 386–574 |
| Site lifecycle drill-in | `site-lifecycle/pages/SiteDetailPage.tsx` | Has its **own** Leaflet renderer in `SiteOverviewMap.tsx` (line 3 imports react-leaflet directly) — duplicates MapCanvas |
| Network readiness | `network-readiness/` | grep returns zero `MapCanvas` or `react-leaflet` |
| Lease management (geo-fences for landlord parcels) | `lease-management/pages/LeaseListPage.tsx` | imports react-leaflet but not MapCanvas — another silo |
| RF design (coverage prediction overlay) | `rf-network-design/components/CoverageMap.tsx` + `InterTechCoordinationMapPage.tsx` | Both bypass MapCanvas |
| Asset inventory | `asset-inventory/` | Zero map integration — but tower/shelter/cabinet locations are inherently spatial |
| Power systems (generator failure heat-on-map) | `power-systems/` | Zero map integration |
| Mobile app (field crew) | `mobile-app/` | Zero map — the crew on the *truck* has no map |

The GIS module is essentially a tools shelf nobody is plugging into. `RoutePlannerPage` literally calls itself the Route Planner but is not consumed by `CrewDashboard`, `WorkforceCapacityPlanner`, `EmergencyRedeploymentPage`, `VendorCrewTrackerPage` or the mobile app. The proximity search isn't called from acquisition workflows (which is exactly when you want it: "any candidates within 1 km of my new nominal?"). The geo-fence "alert on entry" feature (`GeoFenceManagementPage.tsx` line 71) has no event subscriber anywhere in the app — it is a CSS pill, not an alert pipeline.

This integration gap is the **fundamental missing layer** of the product. ArcGIS, Mapbox, HERE Workspace, Carto — all are valuable not because they draw nice maps, but because they geo-enable every other workflow.

---

## F. Hub Site Topology — the One Bright Spot

`HubSiteTopologyPage.tsx` at 2,679 lines is the **single most polished page in the GIS module**. Skimming the file:

- A real Leaflet base map (lines 21–22) with custom `divIcon` device chips (`buildDeviceIcon`, line 859).
- A genuine **network intelligence engine** (lines 433–810): `buildAdjacency`, `tracePathToCore` (BFS up-tier toward Core, lines 516–553), `reachesAnyCore` (cycle-safe full-graph BFS, lines 560–580), `analyseNetwork` (SPOF detection by N-fold node removal, line 706–721, with a blast-radius computation lines 692–701).
- A `LINK_BUDGET` table (line 472) gives engineered latency budgets per link kind (fronthaul 0.1 ms, transport 8 ms, core 12 ms). `computeLinkMetrics` (line 480) computes per-link health from budget overruns + utilisation, which is genuinely sound network-engineering thinking.
- A ranked **risk feed** (`RiskFeed`, line 2133) and **impact card** (line 2266) — clicking a risk pans the camera and traces upstream path. CU/DU drill-down via `CranHubDrawer` (line 2466).
- Determinism via `hashSeed` RNG (lines 79–98) so renders are byte-stable. This is professional.

Issues even here:
1. The file is 2,679 lines — should be split into `topology/buildNetwork.ts`, `topology/analyse.ts`, `topology/components/*`, `topology/HubSiteTopologyPage.tsx`. The single-file model destroys testability.
2. Real Tier-1 NMS/NOC consoles would not invent this fabric — they'd consume it from a SNOC/OSS REST/streaming feed. The page is a beautiful simulation but a single source-of-truth API is the real product.
3. Health/SPOF analysis is O(N²·E) (line 706 — comment admits "brute-force over the full undirected graph"). With N≈45 it's fine; for a real-world 500-node hub it would block the main thread for seconds. Move to a Web Worker.
4. No connection to MW Link module's `mwLinks` data — uses its own synthesised topology. The MW dependency view (`MWLinkDependencyViewPage.tsx`) uses *yet another* set of fabricated relationships from `mw-link/lib/mwlActions`. This is data-model fragmentation.

---

## G. Specialist Features — Audit

### MW Link Overlay (`MWLinkOverlayPage.tsx`, 128 lines)
- Renders MW polylines (status colored), multi-hop chains shown in side rail. Functional but cosmetic.
- **No line-of-sight (LOS) analysis** — a real telecom MW tool would do Fresnel-zone profile, terrain elevation queries, and clearance computation. Without DEM data and a LOS calculator, this is decorative.
- No 6–80 GHz band-specific path-loss modelling, no rain-fade prediction, no antenna height visualization.

### MW Link Dependency View (`MWLinkDependencyViewPage.tsx`, 516 lines)
- Excellent **SVG dependency tree** (lines 425–513) rendering inbound/outbound links around a center site with thickness proportional to capacity.
- SPOF banner, cascade impact table, redundancy table — all genuinely useful for backhaul ops.
- However: this lives under `gis-maps/pages/` but the breadcrumb points to `/mw-links` and the route is registered as such (`router.tsx` line 164). It is module mis-categorised.

### Geo-Fence Management (`GeoFenceManagementPage.tsx`, 140 lines)
- Real point-in-polygon test for "sites inside fence" (lines 24–34). Solid math.
- Polygon hard-coded; **no polygon-draw UI**, no `leaflet-geoman`/`leaflet-draw` integration.
- "Alert on entry" toggle has no event handler — no subscription to vehicle/site location streams. It's a label, not an alert.
- No time-based fences (rush-hour exclusion zones), no entry/exit history, no buffer offsetting.

### Heat Map Config (`HeatMapConfigPage.tsx`, 122 lines)
- KPI selector, grid resolution slider (0.5–10 km), stop count, palette — none of these are actually piped to `MapCanvas.HeatCells`. The legend strip (lines 91–101) blends colors with a `blend()` function (line 111) but `MapCanvas` renders a different fixed-bucket scheme. UI is completely disconnected from output.
- Missing: weighted heatmaps (intensity by metric value, not just count), time-series animation, hotspot detection (Getis-Ord Gi*).

### Route Planner (`RoutePlannerPage.tsx`, 134 lines)
- **Nearest-neighbour heuristic only** (lines 38–48). Comment line 36 calls it `simple nearest-neighbour reorder`. This is not TSP-optimal — for 25 stops, NN can be 25%+ worse than the true TSP solution.
- No VRP (Vehicle Routing Problem) — no multiple vehicles, no time windows, no capacity constraints, no driver shifts. For crew dispatch this is a non-starter.
- No drive-time / actual road graph — distance is straight-line haversine; "estimated time" is `km / 30 km/h + dwell` (line 31). Real-world should use OSRM, GraphHopper, Mapbox Directions, or HERE Routing.
- No traffic, no time-of-day, no road restrictions, no truck routing (height/weight limits — relevant for tower crane crews).
- "Send to crew" is a toast (line 109). No actual hand-off to a mobile app, no offline-cached map for the truck.

### Bulk Selection (`BulkSelectionPage.tsx`, 127 lines)
- Three hard-coded polygon presets, point-in-polygon for inclusion, status/project update modals. Works as a stub.
- **No lasso draw** — the page's title is "Bulk Selection" with subtitle "Lasso a polygon" but there is no drawing tool. Users pick from 3 NYC presets only.
- "Bulk status update" sets `message.success` — no actual mutation to the site database (no `updateMany` call, no `useEntityMutation`).

### Cluster Editor (`ClusterEditorPage.tsx`, 139 lines)
- Point-in-polygon assignment, list of clusters with on-air/integration/build/design KPIs. Decent.
- Polygon editor is *also* missing — "Edit polygon" button does nothing.

### Coverage Import (`CoverageImportPage.tsx`, 146 lines)
- Drag-drop zone with three-stage stepper (upload → preview → done).
- **No actual file parsing.** The "preview" is a hard-coded 4-vertex rectangle (line 17). There is no GeoJSON/KML/Shapefile parser anywhere in the codebase (grep shows zero usage of `@mapbox/togeojson`, `shpjs`, `topojson-client`, etc.).
- Shapefile especially needs companion `.dbf` + `.shx` + `.prj`. The UI says "shp + dbf + shx" but there's no multi-file uploader.

### Floor Plan Upload (`FloorPlanUploadPage.tsx`, 180 lines)
- Three-stage stepper, 3-anchor minimum (BR-GIS-004 quoted line 30), good idea.
- **Image is mocked** — the SVG floor plan shown (lines 137–151) is hard-coded "Room A / Main Hall / Lower Concourse" rectangles.
- "Add anchor" adds *fake* offset anchors (line 23: `latlng: [40.7530 - i * 0.0005, -73.9780 + i * 0.0010]`). Real workflow needs user to click image AND click corresponding map point — that interaction does not exist.
- No PDF or DWG support — only PNG/JPEG/SVG mentioned (line 133). Real telecom floor plans are CAD/DWG and PDF — needs `pdf.js`, `dxf-parser`, or `dwg-to-svg`.

### Floor Plan View (`FloorPlanViewPage.tsx`, 136 lines)
- SVG floor plan with rooms + WiFi/DAS markers + geo-anchor pins + scale compass. Visually nice.
- Indoor pulse animation (lines 90–93) is a polished touch.
- Floor-plan-to-map overlay shows footprint polygon — but the polygon is just the anchor points connected, not a proper affine/projective transform from pixel space → geo space. Mathematically it's wrong (real georeferencing needs at least an affine 6-parameter transform from 3 anchors, or a 2D Helmert from 2).

### Custom Marker Config (`CustomMarkerConfigPage.tsx`, 107 lines)
- Rule list with field/operator/value/color/size/priority — solid CRUD UI.
- **Rules are never consumed** by `MapCanvas` — `buildIcon` (MapCanvas line 15) uses only `tech` and `status`. The custom marker rules are pure UI with zero engine.

### Map Export (`MapExportPage.tsx`, 109 lines)
- PNG / PDF / KML / GeoJSON radio selector with a 1400 ms `setTimeout` "generation" (line 21).
- **Nothing is actually exported.** No `leaflet-easyprint`, no `html2canvas`, no `jspdf`, no GeoJSON serializer call. The download is a `message.success` toast (line 70).
- KML/GeoJSON export for sites/links/clusters/fences is genuinely needed for ops handover to vendors using Google Earth or QGIS. Building real exporters is straightforward (sites array → GeoJSON FeatureCollection in 30 lines) but it isn't done.

### Saved Views (`SavedViewsPage.tsx`, 117 lines)
- Persistence is component state — no localStorage, no API. View list is lost on page refresh.
- No team-wide library, no view tagging, no thumbnails, no view-of-the-day.
- "Restore on map" navigates to `/maps` but does not push view parameters via search params or context — the restored view doesn't actually restore on the next page.

### Site Detail Popup (`SiteDetailPopupPage.tsx`, 132 lines)
- Solid: hero card, tabbed overview/photos/tasks, related MW links table, mini-map centered on site, UTM + WGS84 dual display.
- Photos tab generates a gradient placeholder per photo (line 102) — no actual image gallery (no `react-image-gallery`, no `photo-sphere-viewer` for 360° tower photos).
- Tasks tab is faked (line 111–116).
- This is a useful page that should be folded into `site-lifecycle` SiteDetailPage rather than be a "map popup" — the duplication of two SitePopup views in different modules is a UX hazard.

### Gantt View (`GanttViewPage.tsx`, 435 lines)
- Solid AntD Table-based Gantt with phase/task/milestone, weekly/monthly zoom, CSV export, print, fullscreen.
- **Wrong module home.** A Gantt belongs in `site-lifecycle/` or `ppm-integration/`, not `gis-maps/`. There is no map on this page. It is registered under the GIS module entry in `router.tsx` (line 46) and orphaned.

### Acquisition Map View (`AcquisitionMapView.tsx`, 893 lines)
- Largest non-topology page. Renders **fake SVG cartography** — explicitly labeled "Simulated map" at line 425. Even with `react-leaflet` already imported across the codebase, this page bypasses it.
- The search-rings visualisation, nominal→candidate connection lines, and click-to-drawer interaction are nice UX patterns, but they are built on a non-projected SVG grid. The legend says distances in meters but they aren't true meters — they are bounding-box-normalised %.

---

## H. Data Model & Performance

`gisMockData.ts` is 380 lines. Reasonable starter dataset (sites, mwLinks, clusters, geoFences, mapLayers, savedViews, coverageAreas, customMarkers, exportHistory, floorPlans, indoorUnits, routePlans).

Performance pitfalls:
1. **Filter functions are recreated every render.** `MainMapView.tsx` line 281 inlines `siteFilter={s => techFilter.has(s.tech) && ...}` — the `useMemo` in `MapCanvas` (line 158) is invalidated each render → entire site/marker list rebuilds.
2. **No virtualization.** Side rails ("Selected sites (8)") render `matching.map(...)` of every match (BulkSelectionPage line 91). For 1k+ matches the DOM grinds.
3. **No spatial index.** All operations are O(N) over the full sites array. For a Tier-1 inventory (200k sites), proximity search needs an R-tree (e.g. `rbush`) or grid index.
4. **No tile caching strategy.** OSM/Esri tiles are hit fresh every time — no service worker, no IndexedDB cache.
5. **Bundle size:** Leaflet + react-leaflet + 25 pages of varying decoration. No tree-shaking analysis evident.

---

## I. Comparison vs. Best-in-Class

| Feature | This module | ArcGIS Online | Mapbox / MapLibre | HERE Workspace |
|---|---|---|---|---|
| Vector tile rendering | ❌ Raster only | ✅ Vector + raster | ✅ WebGL vector | ✅ Vector |
| Marker clustering | ❌ None | ✅ Built-in | ✅ Built-in | ✅ Built-in |
| 100k+ point handling | ❌ Will freeze | ✅ Feature service | ✅ GL layers | ✅ Tile layers |
| Real heatmap (KDE) | ❌ Bucket grid | ✅ | ✅ heatmap layer | ✅ |
| Real TSP/VRP routing | ❌ Nearest-neighbor only | ✅ Network analyst | ✅ Directions / Optimization | ✅ Routing + matrix |
| Offline tiles | ❌ | ✅ Runtime | ✅ MBTiles/PMTiles | ✅ |
| Drawing tools | ❌ None | ✅ | ✅ mapbox-gl-draw | ✅ |
| LOS / viewshed | ❌ | ✅ 3D analyst | partial | partial |
| Coverage prediction | ❌ | partial (raster) | ❌ | ❌ |
| GeoJSON/KML/Shapefile import | ❌ Mocked | ✅ | ✅ | ✅ |
| Real export (PDF/PNG/KML) | ❌ Toast only | ✅ | ✅ | ✅ |
| 3D buildings | ❌ | ✅ | ✅ Mapbox-gl 3D | ✅ |
| Tile permissions / RBAC on layers | ❌ | ✅ | partial | ✅ |
| Collaborative annotations | ❌ | ✅ | ❌ | ❌ |

---

## SCORING (out of 10)

| Dimension | Score | Notes |
|---|---|---|
| **Architecture** | 4 / 10 | Three competing renderers (MapCanvas / fake-SVG / bespoke HubTopology) with no convergence path; Leaflet is the right stack but only half-used. |
| **MapCanvas Quality** | 5 / 10 | Good basics (tiles, divIcon, invalidateSize, flyTo). Missing clustering, real heatmap, WebGL, opacity-per-layer. |
| **Layer Management** | 3 / 10 | UI exists but is disconnected from rendering; no WMS/WFS; no persistence. |
| **Search Capabilities** | 4 / 10 | Math is correct (haversine, point-in-poly) but no drawing UI; UTM is NYC-only fake transform; no MGRS/Plus Codes. |
| **Operational Integration** | 1 / 10 | The killer gap — zero MapCanvas use in crew-workforce, network-readiness, asset-inventory, mobile-app, power-systems. Route planner is orphaned. |
| **Hub Site Topology** | 8 / 10 | Outstanding — real intelligence engine, SPOF analysis, dependency tracing. Needs splitting into files. |
| **MW & Coverage** | 4 / 10 | Decent topology rendering, but no LOS, no DEM, no rain-fade, no actual file parsing for coverage import. |
| **Routing** | 2 / 10 | Nearest-neighbor only, no road graph, no VRP, no traffic, no hand-off. |
| **Geo-fencing** | 3 / 10 | Polygons stored, point-in-poly correct, but no draw UI, no alert pipeline, no time fences. |
| **Floor Plans** | 4 / 10 | Three-stage UX is good; image upload mocked, georeferencing math incorrect, no PDF/DWG. |
| **Export** | 1 / 10 | Pure UI theatre — no actual file generation. |
| **Performance** | 3 / 10 | Will not scale past 5k markers; no clustering, no virtualization, no spatial index, no tile cache. |
| **Data Model** | 5 / 10 | Mock data is reasonably structured but parallel data models in MapCanvas / HubSiteTopology / MWLinkDependency / cranData fragment the truth. |

**Overall: 3.7 / 10** — A few brilliant fragments (HubSiteTopology, dependency tree, mini-map embeds in SiteDetailPopup) buried under demo-grade scaffolding that lacks the structural commitments needed for Tier-1 ops.

---

## TOP 10 PRIORITY FIXES

1. **Embed `MapCanvas` into the four operational modules that need it most.** Crew dispatch (CrewDashboard, EmergencyRedeploymentPage, VendorCrewTrackerPage), site lifecycle (SiteDetailPage already has its own — consolidate), network readiness (region readiness view should have a heatmap), and the mobile app (field crews on the truck). Without this the GIS module is a museum exhibit.

2. **Add real marker clustering.** Install `react-leaflet-cluster` or wire `supercluster` into MapCanvas with a `useSupercluster` hook. Cluster at z<14, declutter at higher zoom. Promised by BR-GIS-006 in `LayerControlPage.tsx` line 102 but unimplemented.

3. **Replace the SVG cartography in `MapViewPage` and `AcquisitionMapView` with `MapCanvas`.** Delete the bespoke `gridSites` / `projection.project` simulation code (893 lines + 368 lines). The Acquisition page especially is where Land Acquisition specialists live every day — they must have a real map.

4. **Wire real drawing tools.** Add `react-leaflet-draw` (or `@geoman-io/leaflet-geoman-free`). Hand-drawn polygons should flow into `SpatialSearchPage`, `BulkSelectionPage`, `GeoFenceManagementPage`, `ClusterEditorPage`, `CoverageImportPage`.

5. **Replace nearest-neighbour with real routing.** Either OSRM (self-hosted), Mapbox Optimization API, or HERE Routing for actual road-graph + traffic + time-windows + VRP. Pair with a real "Send to crew" hand-off into the mobile app's task list — the routing must be alive in the field, not on the planner's desk.

6. **Build real file parsers for Coverage Import and Floor Plan Upload.** Use `@mapbox/togeojson` for KML, `shpjs` for shapefile, `pdfjs-dist` + `dwg-to-svg` for floor plans. The mocked drag-drops are a credibility risk in a buyer demo — a Tier-1 procurement team will ask to upload their own dataset.

7. **Implement real export.** Wire `leaflet-image` or `html2canvas` + `jspdf` for PNG/PDF, a GeoJSON serializer for points/lines/polygons (50 lines of code), and `tokml` for KML. The current "complete" toast is misleading.

8. **Make Heat Map config actually drive rendering.** Replace `MapCanvas.HeatCells` with `leaflet.heat`, pipe the KPI/grid/stops/palette props through, and accept a metric-weighted intensity function. Today the configuration UI and the render are wholly independent.

9. **Connect geo-fences to a real event pipeline.** Today `alertOnEntry` is a UI flag. Subscribe to vehicle/crew/site-location streams (mobile app, NMS), run point-in-polygon on every update, fire a notification via `notification-engine` module. Add time-window scheduling (e.g. exclusion zones active 09:00–17:00 only).

10. **Split `HubSiteTopologyPage.tsx` (2,679 lines) into a feature folder** (`gis-maps/topology/{buildNetwork,analyse,intel,components}`), move the O(N²) SPOF computation to a Web Worker, and source nodes/links from MW Link + cran-vran data stores instead of an internal generator. The intelligence engine is the module's crown jewel — it must be testable and feedable from production telemetry.

---

## Closing Verdict

The GIS module today is a portfolio of *demo screens* organised around a *light Leaflet wrapper*. It has one outstanding artifact (HubSiteTopologyPage's intelligence engine), one acceptable artifact (MapCanvas itself for narrow uses), and a long tail of mocked exports, mocked imports, mocked routing, and mocked simulations. The fatal gap is **operational integration**: across 30 sibling modules in `src/modules/`, *almost none* of them use any GIS surface. For a telecom rollout/run platform, geography is the substrate — every workflow has a "where" — and the current architecture treats Maps as a separate destination users navigate *to*, rather than a service every module navigates *through*.

Fixing items 1–3 (operational embedment + real clustering + killing the SVG simulations) would more than double the perceived value of the module without writing a single new screen.
