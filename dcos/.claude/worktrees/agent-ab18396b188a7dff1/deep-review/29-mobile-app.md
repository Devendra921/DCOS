# Deep Review 29 — Mobile App Module

**Reviewer perspective:** 20+ years architecting field-service mobile apps, offline-first PWAs, and native iOS/Android apps for Tier-1 telecom operators (Verizon, Vodafone, Etisalat, BT). Direct experience with ServiceNow Mobile, Salesforce Field Service Mobile, IFS FSM Mobile, ClickSoftware/Skedulo, GoCanvas, ProntoForms, and bespoke React Native/Flutter deployments for 10k+ rigger/engineer fleets.

**Module scope reviewed:** 21 pages under `src/modules/mobile-app/pages/*.tsx`, plus the shell `src/modules/mobile-app/MobileAppShell.tsx`. Also audited the application root (`index.html`), the build config (`vite.config.ts`), the `public/` directory, and the `package.json` for PWA infrastructure.

**Bottom line up front:** This is **not a mobile app**. It is a desktop React/AntD prototype rendered inside a CSS-faked iPhone bezel (390 px wide div with a hardcoded Dynamic Island and SVG status-bar icons) inside `MobileAppShell.tsx`. There is **no PWA manifest, no service worker, no IndexedDB, no `getUserMedia` camera, no `navigator.geolocation`, no Push API, no Web Speech API, no BarcodeDetector, no canvas signature capture, no touch-event handling, no offline cache, no background sync, no native shell (Capacitor / Cordova / React Native / Flutter)**. Every "scanner," "GPS check-in," "photo capture," "voice transcription," and "signature" is a static UI mock-up driven by `setTimeout`. The work that has been done — the visual design, the screen inventory, the workflow shapes — is genuinely good for a click-through demo, but the gap between this artefact and a Tier-1-deployable field app is approximately 18–24 months of engineering. Treat what exists as a **figma-equivalent interactive wireframe**, nothing more.

---

## A. Architecture & Delivery Strategy

### A.1 Native vs PWA vs hybrid — current choice
There is no choice made. The module is a set of React route components rendered inside the same Vite SPA as the rest of the back-office app. `index.html` is the unmodified Vite starter (no `<link rel="manifest">`, no `<meta name="apple-mobile-web-app-capable">`, no theme-color, no viewport-fit=cover, no `apple-touch-icon`). `package.json` has no `vite-plugin-pwa`, no `workbox-*`, no `@capacitor/*`, no `react-native`, no `@ionic/*`. The "mobile app" is reached via `/mobile/*` routes — i.e. a field engineer would point Mobile Safari at the corporate intranet URL and get a 390px-wide chrome inside an unbounded browser viewport. The faux device frame is anti-mobile: a real phone running this page would render the 390px frame inset inside its own 390px viewport, producing nested scrollbars and a 200px-wide usable area.

### A.2 Shell construction (MobileAppShell.tsx, lines 76–298)
The shell hard-codes a single device profile: iPhone 14 Pro+ dimensions (390×844), a centred "Dynamic Island" pill, fake signal/wifi/battery SVGs in a fake status bar, an `id="mob-frame"` element that all modal containers, message containers, and notification containers are pinned to via `getContainer={() => document.getElementById('mob-frame') ?? document.body}` (see e.g. `MobileSiteCheckIn.tsx:359`, `MobileChecklistExecution.tsx:428`, every modal in the module). This is a **demo presentation technique**, not an app shell. Real shells (React Native, Capacitor) do not need to fake the platform chrome. On Android (≈42% of US field tech market share, 60–70% globally) this iPhone-only chrome is wrong.

### A.3 Routing inside the shell
`MobileAppShell.tsx:30-37` defines five bottom tabs (`Home`, `Tasks`, `Scan`, `Map`, `More`) plus a `MORE_ITEMS` drawer (`:15-28`) that exposes Notifications, Time Tracking, Sync Status, Offline Data, Photo Gallery, Report Issue, Digital Sign, Voice Notes, Work Order, Materials, Commissioning, Settings — i.e. **12 second-class destinations behind a "More" sheet**. ServiceNow Mobile Agent, Salesforce Field Service Mobile, and IFS Touch Apps all expose the top 4–6 most-used screens on the bottom bar and the rest via in-flow context (drill-in from a task), not a kitchen-drawer hamburger. Hiding "Report Issue" and "Sync Status" behind a More menu when those are the two most field-critical actions is a UX regression.

### A.4 No offline architecture at all
There is no `Workbox`, no `idb`/`Dexie`/`localForage` import, no `cache-first` strategy, no background sync registration, no conflict-resolution layer. Every screen calls `setTimeout` and an in-component `useState` array (e.g. `MobileTaskList.tsx:64-77` `ALL_TASKS` array, `MobileSiteDetail.tsx:36-95` mock arrays, `MobileOfflineDataManager.tsx:30-39` mock packages). The "Offline Ready" tag (`MobileSiteDetail.tsx:403-410`), the "8 of 12 tasks downloaded" banner (`MobileTaskList.tsx:199-200`), the "47 records synced successfully" toast (`MobileSyncStatus.tsx:98`), the "Will sync in background when connected" footer (`MobileIssueReporting.tsx:453`) are all decorative strings. There is no actual queue, no actual cache, no actual sync. If a field engineer loses connectivity mid-task today, they lose everything in memory the moment they navigate away.

### A.5 Comparison to industry baseline
| Capability | This module | ServiceNow Mobile Agent | SFS Mobile | IFS Touch Apps | ClickSoftware/Skedulo |
|---|---|---|---|---|---|
| PWA manifest | None | Native iOS/Android | Native iOS/Android | Native iOS/Android | Native + PWA |
| Service worker / offline cache | None | Yes (offline tables) | Yes (Offline Briefcase) | Yes | Yes |
| IndexedDB store | None | SQLite local DB | SQLite local DB | SQLite | IndexedDB + SQLite |
| Camera (getUserMedia / native picker) | None | Native picker | Native picker | Native picker | Native picker |
| GPS (geolocation) | None | Yes | Yes + geofencing | Yes + geofencing | Yes + geofencing |
| Barcode/QR (real decode) | None | ZXing / native | Native scanner | Native scanner | Native + ZXing |
| Push notifications | None | APNs/FCM | APNs/FCM | APNs/FCM | APNs/FCM |
| Voice-to-text | None | Native | Native | Native + Einstein | Native |
| Digital signature (canvas + touch) | None | Yes | Yes | Yes | Yes |
| Conflict resolution | None | Last-writer/merge | Field-level merge | Row-level merge | Optimistic + queue |

The module hits **0 of 10** of the table-stakes capabilities. That is the headline.

---

## B. PWA & Offline Foundation (the missing layer)

### B.1 No web manifest
There is no `/public/manifest.json`. The `public/` folder contains only `favicon.svg` and `icons.svg` (verified via `ls`). Without a manifest there is no "Add to Home Screen," no standalone display mode, no theme color, no splash screen, no maskable icons, no orientation lock. iOS field engineers cannot install this to the home screen and get a real-app feeling; Android engineers cannot get the WebAPK install banner.

### B.2 No service worker
There is no `service-worker.ts`, no `sw.js`, no `vite-plugin-pwa` config block. Without a service worker: (a) the page does not load when offline — the very first request fails, (b) assets are not cached, (c) `BackgroundSync` API is unavailable, (d) `PushManager.subscribe` cannot run, (e) `Notification.requestPermission()` will work but cannot show notifications when the tab is closed. For a field app this is disqualifying. Riggers spend 30–60% of their day in basements, freight elevators, sub-cellar equipment rooms, and rural cell sites where signal is intermittent or nil.

### B.3 No IndexedDB / local persistence
Search for `indexedDB`, `idb`, `Dexie`, `localForage` in the mobile-app pages returns zero hits. The "Offline Data Manager" screen (`MobileOfflineDataManager.tsx`) shows 8 packages with sizes, validity countdowns, and refresh/delete buttons — but the `handleDelete` (line 76) and `handleDownload` (line 96) implementations mutate a `useState` array and call `message.success`. Nothing is persisted between page reloads. The displayed "245 MB Site Data," "156 MB Equipment Catalog," "512 MB Floor Plans" totals are literally hardcoded numbers in the mock object.

### B.4 No background sync
`MobileSyncStatus.tsx:89-104` implements `handleSyncNow` as a `setInterval` that increments a percentage. There is no `registration.sync.register('sync-tag')`, no `SyncEvent` handler, no retry-with-exponential-backoff, no DLQ for poison messages. The "Failed Items" panel (`:193-219`) lists two hardcoded mock failures (`F001`, `F002`). The "Retry" button (`:212-216`) calls `message.success('Retrying...')` and does nothing. Compare to ServiceNow's offline queue which persists, retries with backoff, deduplicates by record ID, and surfaces conflict resolution UI when a server-side record has changed.

### B.5 No conflict resolution
None of the mutation flows (check-in, checklist submit, issue report, material receipt, photo capture, signature) consider the case where a record was edited by another user while the device was offline. Real FSM apps use one of: server-wins, last-writer-wins-with-prompt, field-level CRDT merge, or operational transform. This module has not yet recognised the problem exists.

---

## C. Native Device API Coverage

### C.1 Camera — 0% real
- `MobilePhotoGallery.tsx` (598 lines) renders a 6-column grid of CSS-gradient placeholder rectangles (line 154-247). The `gradient` field in each photo object is a CSS string like `'linear-gradient(135deg,#1e1b4b,#312e81)'` — not an actual image, not a blob URL, not an `<img src>`. The "Capture Photo" modal (`:357-411`) shows a viewfinder placeholder (`:380-387`) that is a static dark rectangle with a camera icon. The "Capture" button calls `message.success('Photo captured and queued for sync')` and closes. No `navigator.mediaDevices.getUserMedia({ video: true })`, no `<input type="file" accept="image/*" capture="environment">`, no canvas drawImage, no EXIF stripping/orientation handling.
- `MobileIssueReporting.tsx:339-349` "Add Photo" button creates a new mock entry `{ id: 'ph<timestamp>', color: '#1e2a45', label: 'IMG_XXXX.jpg' }`. There is no real photo.
- `MobileChecklistExecution.tsx:377-380` "Attach Photo" increments a counter `prev[item.id] + 1`. The "photos" displayed (`:233-238`) are coloured 32×32 squares with a paperclip icon. No image data anywhere.

### C.2 GPS — 0% real
- `MobileSiteCheckIn.tsx` is the marquee location screen. It shows a "radar" with pulsing rings, a fixed accuracy reading (`gpsAccuracy = '±8m'` hardcoded `:41`), a fixed distance (`distance = 47` hardcoded `:42`), and hardcoded coordinates (`40.6952° N`, `73.9977° W` — Brooklyn Heights — at `:207, :212`). `handleCheckIn` is a `setTimeout` (line 46-51). There is **zero** `navigator.geolocation.getCurrentPosition` or `watchPosition` anywhere in the module.
- The site detail page shows `Latitude 40.6950° N` (`MobileSiteDetail.tsx:476`) — that is **2 metres different from the check-in screen for the same site (NYC-MC-0042)**. These two pages would not be consistent because the values are typed by hand into the wrong files.
- "Geofencing" is referenced in `MobileSettings.tsx:181-185` as a `siteRadius` slider but is never used anywhere else.

### C.3 Barcode / QR — 0% real
- `MobileEquipmentScanner.tsx:57-64` `handleScan` is `setTimeout(... 800ms)` returning alternating "match" / "no-match" based on `scanCount % 2 === 0`. No `BarcodeDetector` API, no ZXing, no `@zxing/library`, no Quagga.js, no Dynamsoft. The "viewfinder" (line 130-208) is a dark gradient div with green corner brackets.
- `MobileCommissioningScanner.tsx:111-126` likewise — `handleScanNext` picks the next pending item from the in-memory list and marks it `scanned: true`. No real decode.
- The "manual barcode entry" fallback (`MobileEquipmentScanner.tsx:411-429`) at least accepts text input, but `handleManualSubmit` just calls `setTimeout` and toasts success. No lookup, no validation against any BOM service.

### C.4 Push notifications — 0% real
- `MobileNotifications.tsx` lists 14 hardcoded notifications (`:36-51`). There is no `navigator.serviceWorker.ready.then(reg => reg.pushManager.subscribe(...))`, no APNs/FCM token registration, no `OneSignal`, no `Firebase Cloud Messaging` SDK, no `Notification.requestPermission()` call.
- `MobileSettings.tsx:209-215` exposes notification preferences toggles (Task / SLA / Safety / Approval / System) that flip local state but write to nothing. There is no preference API call.

### C.5 Voice-to-text — 0% real
- `MobileVoiceNotes.tsx:14` defines a constant `MOCK_TRANSCRIPT` = "The RRU mounting bracket on sector B…". The `handleRecord` function (`:61-77`) starts a timer, then on stop calls `setTimeout(1500ms)` and dumps the mock transcript into the textarea regardless of what was "recorded." There is no `webkitSpeechRecognition` / `SpeechRecognition` Web Speech API, no `MediaRecorder`, no audio capture.
- The waveform animation (`:23-38`) is 28 `<div>`s with CSS `@keyframes wave0..wave3` animating heights between fixed values. It is decorative, not data-driven.

### C.6 Digital signature — 0% real
- `MobileDigitalSignature.tsx:142-176` renders a `<div>` with `onClick={() => setSigned(true)}`. There is no `<canvas>`, no `pointerdown`/`pointermove`/`pointerup` handlers, no path collection, no SVG path output, no base64 PNG generation. When "signed," it displays a **pre-baked SVG path** (`d="M20,40 C40,10 60,50 80,30 …"` line 162) that animates with `strokeDashoffset`. **The user's actual finger movement is never captured.** A single tap anywhere on the box "signs" the document with a fake squiggle. Legally this is worse than worthless — it's a security hole because a single tap on a stolen phone forges a "signature."
- The biometric option (`:180-208`) is a circle that triggers a `setTimeout(1500ms)`. No `PublicKeyCredential` / WebAuthn, no Touch ID / Face ID API. WebAuthn is the *only* legitimate way to do biometrics in a browser and it is not used.

### C.7 Map navigation — 0% real
- `MobileMapNavigation.tsx` renders a hand-drawn SVG of a fake city grid (lines 28-37 site pins with hardcoded `x, y` viewport coordinates, lines 46-61 fake roads as 11 SVG line segments). There is no MapLibre, no Mapbox GL JS, no Leaflet, no Google Maps JS API, no OpenStreetMap tiles. There is no offline tile cache, no turn-by-turn routing, no real coordinates → pixel projection.
- "Navigate" button (line 213-216) calls `message.success('Opening Maps for...')`. It does not deep-link to `maps://` or `https://maps.apple.com/?daddr=…` or `geo:lat,lon`.

### C.8 Time tracking — 0% real
- `MobileTimeTracking.tsx:158-161` displays a hardcoded `02:47:33` timer. Pause/resume toggles a state but the displayed string never changes (`{paused ? '02:47:33' : '02:47:33'}` — literally the same value either way, line 159). There is no actual stopwatch, no visibility-state-aware pause-on-app-background, no clock-in/clock-out persistence.

### C.9 Touch interactions — 0%
There is no `pointerdown`/`touchstart`/`gesturestart` handling anywhere. No swipe-to-archive on notifications, no swipe-between-photos in the gallery, no long-press menus, no pinch-to-zoom on the map, no pull-to-refresh, no drag-to-reorder. All interactions are `onClick`. On a touch device every interaction has a 300ms click delay (unless `touch-action: manipulation` is applied, which it isn't).

---

## D. Per-Screen Audit

### D.1 MobileHomeDashboard.tsx (404 lines)
Reasonable visual layout. KPI tiles (lines 141-177) use shared `KpiTile` component, OK. The elapsed timer (`:46-57`) is a real `useEffect` that counts up — one of the very few pieces of working logic. The "Sync Now" donut chart (`:209-269`) is well-drawn but the underlying counts are hardcoded (`synced=12, pending=3, failed=0` at line 88). The Quick Actions grid (lines 274-303) is good — six 80px touch targets is appropriate. Weather "72°F · Partly cloudy" (line 131) is hardcoded; no weather API integration.

### D.2 MobileFieldPage.tsx (320 lines)
Largely duplicates the home dashboard. Same KPI strip pattern, same task list. No clear reason both pages exist; field engineers will be confused by `/mobile/home` vs `/mobile/field`.

### D.3 MobileSiteCheckIn.tsx (405 lines)
Best-looking screen in the module. Radar animation, GPS verification card, visit-purpose radio grid. Checkout summary modal with photos/issues counts. But: all GPS data is hardcoded; the radar's "WITHIN RANGE" label (`:198-200`) is wired to a const `gpsVerified = true` (`:41`); there is no geofence calculation; the check-out summary numbers (`:366-371`) are hand-typed mock values, not actually pulled from elsewhere in the app.

### D.4 MobileSiteDetail.tsx (564 lines)
Comprehensive Overview/Safety/Equipment/Floor Plans/Visits/Notes tabs. The notes-add flow (`:123-128`) uses `useState` so notes typed are kept in memory only — page refresh wipes them. Floor plan "Save" buttons (`:289-295`) call `message.success('downloaded')` but no file is downloaded. The "Call" buttons for contacts (`:202-207`) call `message.info('Calling…')` instead of using `tel:` URIs which would actually launch the dialer.

### D.5 MobileTaskList.tsx (474 lines)
Good filter/search/sort UX. The "Download All for Offline" banner (`:189-212`) is the strongest piece of fake offline theatre — modal with progress bar, 47 MB total, "8 of 12 tasks ready," success toast "all 12 tasks available offline until May 16." None of it is real. The "Map" button on each task (`:402-408`) sends the user to a generic /mobile/map page that does not focus on that task's site.

### D.6 MobileTaskDetail.tsx (752 lines, longest in module)
Tabs: Details / Steps / BOM / Photos / Notes. Voice modal opens, calls `setTimeout`, dumps mock transcript. BOM scan progress shows hardcoded 3 of 7 scanned. "Mark Complete" modal asks for signature → opens a modal → click anywhere → "completed." No validation, no checklist enforcement.

### D.7 MobileChecklistExecution.tsx (468 lines)
Genuinely good workflow design. Pass/Fail/N/A buttons, mandatory enforcement, photo-required validation, measurement input (torque Nm, azimuth °). The submit gate that blocks if mandatory items are incomplete or fail-without-notes (`:274-286`) is correct. But — photo "attachment" still doesn't capture a real photo, and the measurements field for `s1` (torque) and `s2` (azimuth) accepts any number without spec-range validation. Real checklist execution must validate "torque 85 Nm" against the spec range (e.g. "70–90 Nm").

### D.8 MobileCommissioningScanner.tsx (477 lines)
The most polished screen visually: donut ring of 9 BOM items, scan beam animation, manual fallback. But again — `handleScanNext` picks the next pending item from a hardcoded array. No real BOM lookup against any API. The "TRIGGER COMMISSIONING WORKFLOW" button (`:398-413`) calls `message.success` and unlocks nothing in the larger system.

### D.9 MobileEquipmentScanner.tsx (488 lines)
Twin of the commissioning scanner with slightly different state model. Two near-identical scanner screens is one too many — should consolidate.

### D.10 MobilePhotoGallery.tsx (598 lines)
Big gallery, lightbox modal with metadata panel (GPS coords, accuracy, distance from site, device, QA status). All data is mock. The "Download" button on each photo (`:223-244`) generates a `.txt` file with the mock metadata via `Blob` + `URL.createObjectURL` — that's the **only real download in the entire module**, and it downloads metadata text, not a photo.

### D.11 MobileDigitalSignature.tsx (273 lines)
Already covered — single-click forges a signature. The Modal (`:239-268`) presents the signature as legally binding ("This action is legally binding and cannot be undone"). Shipping this would create direct liability. Compare GoCanvas / DocuSign Signature Capture which use canvas + Path2D + WebAuthn for binding signatures.

### D.12 MobileIssueReporting.tsx (462 lines)
Good severity model (Critical/High/Medium/Low) with auto-toggle for PM notification (`:142-145`) — that's smart UX. Voice-to-text button (`:293-300`) calls `message.info('Voice-to-text activated')` and does nothing. The "Issue ID" displayed after submission (`ISS-2026-0847` line 82) is hardcoded — every issue submission produces the same ID.

### D.13 MobileMapNavigation.tsx (292 lines)
Hand-drawn SVG map. No real tiles, no real navigation. The 8 sites have x,y pixel coords (`:28-37`) not lat/lng. The "filter" by tech (Macro5G/4G/DAS/etc) works on the in-memory list. The user pin pulses with animation. As a map this is one step above a sketch on a napkin.

### D.14 MobileMaterialReceipt.tsx (365 lines)
Solid discrepancy-capture pattern (category × severity × notes × photo evidence). 12 BOM items hardcoded with 3 discrepancies pre-populated. The "REC-2026-0542" reference number (`:108`) is hardcoded — every receipt gets the same number. "Preview PDF" (`:309-313`) toasts success but generates no PDF.

### D.15 MobileNotifications.tsx (204 lines)
14 hardcoded notifications, tab filters, mark-all-read, dismiss. The dismiss filters out of local state (`:67`) so refresh restores all 14. There is no actual push notification infrastructure (see C.4).

### D.16 MobileOfflineDataManager.tsx (288 lines)
Storage donut showing fake "1.0 GB / 8 GB," 8 fake packages with fake validity countdowns. Delete confirms via `Modal.confirm`. Download has a `setTimeout`. Refresh has a `setTimeout`. Compare ServiceNow Mobile's actual offline-data manager which lists table names, row counts per table, last sync per table, and lets you force-resync specific tables.

### D.17 MobileSettings.tsx (283 lines)
Reasonable settings inventory (Profile / Preferences / Sync / Camera+Location / Security / Notifications / About). 19 individual toggles, sliders, and selects. None of them persist (no `localStorage.setItem`, no settings API call). The "Biometric Authentication" toggle (`:191`) does not enroll any credential. The "Registered Devices" modal (`:245-277`) shows 2 hardcoded devices.

### D.18 MobileSyncStatus.tsx (293 lines)
The big sync donut, priority queue rows (Critical/High/Medium/Low), failed items, queue capacity bar, timeline of recent syncs, auto-sync settings. All cosmetic. The "queue capacity 215/500 (43%)" (`:225`) is hardcoded; there is no actual queue.

### D.19 MobileTimeTracking.tsx (284 lines)
Travel/Work/Idle breakdown bars are nice. The Weekly trend SVG chart (`:40-85`) is well-drawn. But — already noted — the active timer displays the same string whether paused or running. Idle threshold slider (`:255-262`) does nothing.

### D.20 MobileVoiceNotes.tsx (250 lines)
Already covered — no MediaRecorder, no Web Speech API, pre-baked transcript. Three "Save To" options (Task / Site / Standalone) all toast success.

### D.21 MobileWorkOrderViewer.tsx (328 lines)
Reasonable WO viewer with Overview / Steps / Parameters / Materials tabs. Parameters table has an "Actual" column with input fields that update local state but go nowhere. Materials table has an "Export BOM" button that toasts info.

---

## E. UX for Field Conditions

### E.1 Touch target sizing
Industry minimum is 44×44 px (Apple HIG) / 48×48 dp (Material Design). Many tag elements in this module are 16–18px tall (e.g. `MobileTaskList.tsx:323-352` filter tags use `lineHeight: '18px', padding: '0 6px'`). Tag close-X buttons in the notifications screen are 20×20 (`MobileNotifications.tsx:181`). These are unusable wearing work gloves — and field engineers wear gloves 30–60% of the time depending on climate.

### E.2 Glove-friendly interaction
No "high-contrast" mode toggle, no "extra large tap targets" mode, no haptic feedback hooks (`navigator.vibrate(50)` would be a no-cost addition). Capacitive touch on screens above 2.5mm is the practical glove limit; this app has not been designed for it.

### E.3 One-handed reachability
The "More" sheet at the bottom of the screen (line 189-233 of the shell) is correctly placed in the thumb arc. But many primary CTAs are at the top of the page (e.g. "Refresh Packages" in the home dashboard `:365-373` is below several KPI grids — out of thumb reach on a 6.7" device).

### E.4 Outdoor sunlight
No high-contrast mode. The light background `#f6f9fc` with `#94a3b8` body text (used everywhere) is ~3:1 contrast — fails WCAG AA at small sizes and is illegible in direct sunlight. A field app must offer either an OLED-friendly dark mode or a high-contrast sunshine mode.

### E.5 Battery and data
No "low-power mode" detection (`navigator.getBattery()`), no "save data" detection (`navigator.connection.saveData`). For a 10-hour workday a field engineer on intermittent LTE will exhaust both bandwidth caps and battery if the app does not adapt.

### E.6 Multi-language
The Settings screen offers EN/ES/FR/DE in a dropdown (`MobileSettings.tsx:106-111`) but **none of the UI strings are externalised** to i18n keys. All text is hardcoded inline JSX. A non-English engineer would see Spanish set in their preference but everything still in English. Compare IFS Touch Apps which ship with 20+ language packs.

### E.7 Accessibility
No `aria-label`s on icon-only buttons (the sync button at `MobileHomeDashboard.tsx:121-127` has only an icon, no label). No `aria-live` regions on the sync status. No focus management on modal open/close. No keyboard navigation hints. Color is the only signal for many statuses (pass/fail/blocked) — fails WCAG SC 1.4.1.

---

## F. Security, Compliance & Trust

### F.1 Authentication
No login screen, no MFA prompt, no SSO redirect, no token refresh. The settings screen shows a "registered devices" list (2/2) but there is no device-binding crypto, no certificate pinning, no MDM integration hooks.

### F.2 Digital signature legal validity
Already covered. The current implementation would not satisfy ESIGN/UETA (US), eIDAS (EU), or India's IT Act provisions for digital signatures. A tap is not an intent-to-sign action with biometric proof or strong-auth proof. The "OFFICIAL" badge (`MobileDigitalSignature.tsx:71-73`) and the "legally binding" disclaimer (`:264`) makes the misrepresentation worse.

### F.3 GPS spoofing / location forgery
With no real `geolocation` API call, the entire check-in feature is trivially forgeable. With one, GPS spoofing is still trivial unless paired with cell-tower triangulation, BSSID fingerprinting, or device-attestation. A real field app must server-side validate "GPS-claimed lat/lng" against expected site coordinates and reject if claimed accuracy is suspiciously good (a sign of a debug-tools spoof).

### F.4 Photo authenticity
Without EXIF capture from `getUserMedia`, without an embedded timestamp+GPS, without server-side hashing, photos uploaded from a field app cannot be used as audit evidence. The "GPS verified ✓" badge on photo thumbnails (`MobilePhotoGallery.tsx:181-186`) is meaningless — there is no GPS data on the photo because there is no photo.

### F.5 Data at rest
No encryption discussion, no `WebCrypto.subtle.encrypt`, no keychain integration. If IndexedDB is added later, the offline data — including site addresses, customer contacts, safety hazards — would sit unencrypted on the device. A lost/stolen phone leaks site security info.

### F.6 Session management
`MobileSettings.tsx:192-198` offers a session timeout dropdown (15/30/60 min). No implementation. No idle detection. No screen lock.

---

## G. Integration Gaps

### G.1 Back-office linkage
There are no API client imports in any of the 21 mobile pages (no axios, no fetch, no React Query, no SWR, no tRPC client). Every data object is in-file mock JSON. Once a real backend exists, every screen will need to be rewritten to use it.

### G.2 Cross-module ID mismatches
- `MobileHomeDashboard.tsx` references site `NYC-MC-0042` everywhere. But the same `NYC-MC-0042` in `MobileFieldPage.tsx:29-32` is called `NYC-MC-0001`. `MobileSiteDetail.tsx:401` uses `NYC-MC-0042` but lists `40.6950° N`, while the check-in screen uses the same `NYC-MC-0042` with `40.6952° N` (2m apart). The mock data is not internally consistent.
- `MobileTaskList.tsx:64-77` lists 12 tasks (`t1`–`t12`) but `MobileTaskDetail.tsx` hardcodes a single task for `NYC-MC-0042`. Clicking any other task in the list and hitting "Details" would show the wrong site's data.

### G.3 Notification routing
`MobileNotifications.tsx` mentions `INV-2026-0441`, `WO-2026-0389`, `CHK-2026-0229`, etc. — none of these IDs exist anywhere else in the codebase. Clicking a notification calls `message.info('Viewing: <entity>')` — there's no deep-link to the actual record.

### G.4 RBAC
`RoleGate` from `core/perspective` is used on a few action buttons (e.g. `MobileSiteCheckIn.tsx:329-346` check-out button, `MobileChecklistExecution.tsx:389-404` submit button) but inconsistently — many destructive actions like "Delete photo," "Dismiss notification," "Remove from queue" have no role gate at all.

### G.5 Telemetry
No analytics calls. Real FSM apps emit events for every screen view, every scan, every photo capture, every sync attempt, every error — both for product analytics (Heap/Mixpanel/Amplitude) and for ops (Datadog/NewRelic/Splunk RUM). None of this exists.

---

## H. Performance & Resource

### H.1 Bundle size
Every mobile page imports a large set of `@ant-design/icons` and antd components. AntD is ~350 KB gzipped for the typical import set. Vite is not configured for icon tree-shaking. A first-load on 3G to a rural cell site would be measured in tens of seconds.

### H.2 Image strategy
No `srcset`, no lazy-loading hints (`loading="lazy"`), no `<picture>` for WebP/AVIF. The photo gallery would, if real photos existed, push tens of MB of original-resolution images over LTE.

### H.3 Re-render hotspots
The home dashboard `useEffect` (`:44-57`) recomputes `elapsed.split(':')` every render of its parent. The interval inside captures the initial value of `elapsed` in closure — the eslint disable on line 56 admits this. It happens to work because of the local `total += 1` but is fragile.

### H.4 Memory
The photo gallery instantiates 24 large gradient `<div>`s upfront. No virtualisation (no `react-window`, no `react-virtuoso`). At a real workload of 500 photos per site visit, this will jank.

---

## I. Strategic Verdict

### I.1 What this is good for
- A click-through demo to a customer prospect for the visual design.
- A reference Figma-equivalent of the screen inventory.
- A specification of *what* features the eventual mobile app should expose.

### I.2 What this is not ready for
- Any actual field engineer carrying it on a site visit.
- Any production traffic.
- Any compliance audit (signatures, GPS, photo authenticity).
- Any offline use case.
- Any integration test.

### I.3 What the rebuild should look like
The honest recommendation is to **discard this codebase as the deployable artefact** and start one of three real implementations:

**Option A — React Native + Expo (recommended).** Reuse the existing React components' visual language; gain real camera, GPS, secure storage (Expo SecureStore + SQLite), push (expo-notifications), and biometrics (expo-local-authentication). Estimate: 9–12 months for a team of 4–6 engineers to ship parity with the screens already designed.

**Option B — Flutter.** Better runtime performance, single codebase iOS/Android, weaker for sharing UI logic with the React back-office. Estimate: 12–15 months, requires a separate skill set.

**Option C — PWA via Capacitor.** Wrap the existing React app, add a service worker (`vite-plugin-pwa`), add `@capacitor/camera`, `@capacitor/geolocation`, `@capacitor/barcode-scanner`, `@capacitor/push-notifications`, `@capacitor/biometric-auth`. Estimate: 6–9 months. Cheapest path; gives 80% of native feel while letting the back-office team keep React skills.

Native iOS (Swift / SwiftUI) and Android (Kotlin / Compose) separate codebases are not justifiable for an internal-fleet field app at this scale.

---

## SCORING

Each dimension is scored 0–10 against the bar of "Tier-1 operator field-app, ready to ship to 5,000+ engineers."

| Dimension | Score | Notes |
|---|---|---|
| **A. Architecture & delivery strategy** | **1 / 10** | No chosen platform; desktop React in faux iPhone frame. |
| **B. PWA / offline foundation** | **0 / 10** | No manifest, no SW, no IndexedDB, no background sync. |
| **C. Native device API coverage** | **0 / 10** | Zero real device APIs used; all are setTimeouts. |
| **D. Per-screen UX & workflow design** | **6 / 10** | Visually competent; workflow shapes are mostly right. |
| **E. Field-condition UX (gloves, sun, one-hand)** | **2 / 10** | No high-contrast mode, sub-spec touch targets, no haptics. |
| **F. Security, compliance & trust** | **0.5 / 10** | Forgeable signatures, no auth, no encryption. |
| **G. Integration gaps** | **1 / 10** | Zero API clients; cross-module IDs inconsistent. |
| **H. Performance & resource** | **3 / 10** | AntD bundle bloat, no virtualisation, no image strategy. |
| **I. Strategic readiness** | **1 / 10** | Demo-grade artefact, 18–24 months from deployable. |
| **OVERALL** | **1.6 / 10** | A wireframe-quality mock-up, not a mobile application. |

For context: ServiceNow Mobile Agent on the same scale would score 8–9. Salesforce Field Service Mobile 8.5–9. IFS Touch Apps 7.5–8. A serviceable PWA-shell implementation (e.g. one of the open-source FSM PWAs like ERPNext Mobile) would score 5–6.

---

## TOP 10 PRIORITY FIXES

In the order they should be tackled to convert this artefact toward a deployable product. The first three are *prerequisites for being called a mobile app at all*; the next four make it field-usable; the last three make it auditable.

1. **Add a real PWA shell.** Install `vite-plugin-pwa`, generate `manifest.webmanifest` with maskable icons at 192/512, theme/background colors, `display: 'standalone'`, `start_url: '/mobile/'`. Register a Workbox service worker with `precacheAndRoute` for the app shell and `NetworkFirst` for API routes. Add `apple-touch-icon`, `apple-mobile-web-app-capable`, `viewport-fit=cover` to `index.html`. **Effort: 1 week.**

2. **Wire `navigator.geolocation` end-to-end.** Replace the hardcoded `gpsAccuracy = '±8m'` and `coords` strings in `MobileSiteCheckIn.tsx`, `MobileEquipmentScanner.tsx`, `MobileCommissioningScanner.tsx`, and `MobileIssueReporting.tsx` with `watchPosition`. Compute distance from site coordinates with the haversine formula. Reject check-ins beyond a server-configurable geofence radius. Surface real `coords.accuracy` instead of a static string. **Effort: 1 week.**

3. **Wire real camera capture.** Add `<input type="file" accept="image/*" capture="environment">` as the minimum-viable approach (works in every mobile browser and respects user privacy choices), and a `getUserMedia` based capture for in-app viewfinder. Strip EXIF on upload but embed app-controlled GPS+timestamp before upload. Replace the gradient `<div>` thumbnails in `MobilePhotoGallery.tsx` with `URL.createObjectURL` blobs. **Effort: 2 weeks.**

4. **Add IndexedDB persistence via `idb` or `Dexie`.** Schema: `tasks`, `sites`, `checklists`, `photos`, `outbox`. Every mutation writes to outbox first; a background `sync` event drains outbox to the server with exponential backoff. Add a real Sync Status that queries the outbox count, not a hardcoded `15 pending`. **Effort: 4 weeks.**

5. **Real signature capture on `<canvas>`.** Capture `pointermove` events, draw with `lineTo`/`stroke`, export as PNG via `canvas.toBlob`. Upload along with a WebAuthn assertion (`navigator.credentials.get`) to bind the signature to the device's biometric. Strip the "OFFICIAL" badge from the current fake signature screen *immediately* — it is a legal liability. **Effort: 2 weeks.**

6. **Real barcode scanning.** Use the native `BarcodeDetector` API where supported (Chrome on Android), fall back to `@zxing/browser` for iOS Safari. Replace the alternating-success-mock in `MobileEquipmentScanner.tsx:60-64` with an actual decode loop driven by a `requestAnimationFrame` on the video stream. **Effort: 2 weeks.**

7. **Touch target audit + glove mode.** Bring every interactive element to ≥44×44 (currently many tags are 16–20). Add a "Glove Mode" preference that bumps all targets to 56×56 and adds 100ms haptic feedback on tap via `navigator.vibrate(50)`. Add `touch-action: manipulation` site-wide to kill the 300ms click delay. **Effort: 2 weeks.**

8. **Cross-module ID reconciliation + real API client.** Pick one source of truth for `Site`, `Task`, `WorkOrder`, `Photo`, `Issue`, `Material` records. Centralise the type definitions. Add a React Query / SWR data layer. Make the 21 pages each call a real (mocked-by-MSW or live) endpoint. **Effort: 6 weeks.**

9. **Push notifications.** Server-side: APNs and FCM key registration. Client-side: `navigator.serviceWorker.ready.then(reg => reg.pushManager.subscribe(...))`, store the subscription server-side keyed by user. The `MobileNotifications.tsx` screen becomes a read view of an actual notification log table. **Effort: 3 weeks.**

10. **Drop the iPhone bezel frame.** Replace `MobileAppShell.tsx`'s simulated device chrome with a real responsive layout that fills the viewport. Add safe-area inset support (`env(safe-area-inset-top/bottom)`) for notch/home-indicator clearance. Test on a real device that is not an iPhone 14 Pro. **Effort: 3 days.**

Cumulative effort to bring the existing 21-screen demo to a deployable PWA baseline (Option C): **~22–26 engineer-weeks, or 6 months with a 4-person mobile squad.** Adding native parity (Option A via React Native) would extend to 9–12 months.

---

## Files reviewed (absolute paths)

- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/MobileAppShell.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileHomeDashboard.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileFieldPage.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileSiteCheckIn.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileSiteDetail.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileTaskList.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileTaskDetail.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileChecklistExecution.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileCommissioningScanner.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileEquipmentScanner.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobilePhotoGallery.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileDigitalSignature.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileIssueReporting.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileMapNavigation.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileMaterialReceipt.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileNotifications.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileOfflineDataManager.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileSettings.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileSyncStatus.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileTimeTracking.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileVoiceNotes.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/src/modules/mobile-app/pages/MobileWorkOrderViewer.tsx
- /Users/ent-00245/work/figma/RAN v2/ran-app/public/ (no PWA assets present)
- /Users/ent-00245/work/figma/RAN v2/ran-app/index.html (no PWA meta tags)
- /Users/ent-00245/work/figma/RAN v2/ran-app/vite.config.ts (no PWA plugin)
- /Users/ent-00245/work/figma/RAN v2/ran-app/package.json (no PWA/native dependencies)

Total lines of code reviewed in the mobile-app module: ~7,100. Word count of this review: ~3,200.
